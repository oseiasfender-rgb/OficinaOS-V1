import { safeText } from '../../core/validators.js';

function clone(v){return structuredClone(v);}
function text(v,max=1000){return safeText(v,max);}
function uid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}

export function createHistoricoOrcamentosService({repositories,eventBus,store,operationalHistory}){
  const activeRepo=repositories.budgets;
  const archiveRepo=repositories.archivedBudgets;
  const trashRepo=repositories.trash;
  const backupRepo=repositories.deletionBackups;
  const logRepo=repositories.deletionLog;

  async function sync(){store?.patch?.({budgets:await activeRepo.list(),archivedBudgets:await archiveRepo.list(),trash:await trashRepo.list(),deletionBackups:await backupRepo.list(),deletionLog:await logRepo.list()});}
  async function log(action,item,details=''){
    await operationalHistory?.record?.({module:'Orçamento',action,entity:'Orçamento',entityId:String(item?.id??''),summary:details||action,details:'Arquivo/Lixeira protegida'});
  }
  async function safety(reason,item){
    const row={id:uid('bk'),at:new Date().toISOString(),reason,entityType:'budget',item:clone(item),payload:clone(item)};
    await backupRepo.put(row);
    const rows=(await backupRepo.list()).sort((a,b)=>String(b.at??'').localeCompare(String(a.at??'')));
    for(const extra of rows.slice(50))await backupRepo.delete(extra.id);
    return row;
  }
  async function listBucket(bucket='active',{query=''}={}){
    const repo=bucket==='archived'?archiveRepo:bucket==='trash'?trashRepo:activeRepo;
    const q=text(query,200).toLocaleLowerCase('pt-BR');
    let rows=(await repo.list()).filter(item=>bucket!=='trash'||!item.entityType||item.entityType==='budget');
    rows=rows.sort((a,b)=>String(b.updatedAt??b.archivedAt??b.deletedAt??b.data??'').localeCompare(String(a.updatedAt??a.archivedAt??a.deletedAt??a.data??'')));
    if(q)rows=rows.filter(x=>[x.cliente,x.clientName,x.veiculo,x.vehicle,x.servico,x.service,x.status,x.total,x.data,x.id].join(' ').toLocaleLowerCase('pt-BR').includes(q));
    return clone(rows);
  }
  async function find(id,bucket='active'){
    const repo=bucket==='archived'?archiveRepo:bucket==='trash'?trashRepo:activeRepo;
    const row=await repo.get(id);return row?clone(row):null;
  }
  async function links(item){
    const id=String(item?.id??''); if(!id)return {total:0,jobs:0,workOrders:0,appointments:0,transactions:0,accounts:0};
    const [jobs,workOrders,appointments,transactions,accounts]=await Promise.all([repositories.jobs.list(),repositories.workOrders.list(),repositories.appointments.list(),repositories.transactions.list(),repositories.accounts.list()]);
    const counts={
      jobs:jobs.filter(x=>String(x.budgetId??x.orcamentoId??x.orcId??'')===id).length,
      workOrders:workOrders.filter(x=>String(x.budgetId??x.orcamentoId??'')===id).length,
      appointments:appointments.filter(x=>String(x.budgetId??x.orcamentoId??'')===id).length,
      transactions:transactions.filter(x=>String(x.budgetId??x.orcamentoId??x.orcId??'')===id).length,
      accounts:accounts.filter(x=>String(x.budgetId??x.orcamentoId??x.orcId??'')===id).length
    };
    counts.total=counts.jobs+counts.workOrders+counts.appointments+counts.transactions+counts.accounts;return counts;
  }
  async function archive(id){
    const item=await activeRepo.get(id);if(!item)throw new Error('Orçamento ativo não encontrado.');
    await safety('arquivar',item);
    const next={...clone(item),archivedAt:new Date().toISOString(),statusBeforeArchive:item.status||'Salvo',status:'Arquivado'};
    await archiveRepo.put(next);await activeRepo.delete(id);await log('Arquivar',item,'Orçamento movido para Arquivados');await sync();eventBus?.emit?.('budget-history:changed',{action:'archive',id});return clone(next);
  }
  async function moveToTrash(id,source='active'){
    if(!['active','archived'].includes(source))throw new Error('Origem inválida para Lixeira.');
    const repo=source==='archived'?archiveRepo:activeRepo;const item=await repo.get(id);if(!item)throw new Error('Orçamento não encontrado.');
    await safety('mover-para-lixeira',item);const now=new Date().toISOString();
    const next={...clone(item),entityType:'budget',deletedAt:now,deletedFrom:source,bucket:'trash',statusBeforeArchive:item.statusBeforeArchive||item.status||'Salvo',status:'Na lixeira'};
    await trashRepo.put(next);await repo.delete(id);const linked=await links(item);await log('Mover para Lixeira',item,`Orçamento enviado para a Lixeira${linked.total?` · ${linked.total} vínculo(s) preservado(s)`:''}`);await sync();eventBus?.emit?.('budget-history:changed',{action:'trash',id,source});return {item:clone(next),links:linked};
  }
  async function restore(id,source='trash'){
    if(!['trash','archived'].includes(source))throw new Error('Origem inválida para restauração.');
    if(await activeRepo.get(id))throw new Error('Já existe um orçamento ativo com este ID.');
    const repo=source==='trash'?trashRepo:archiveRepo;const item=await repo.get(id);if(!item)throw new Error('Orçamento não encontrado.');
    await safety(`recuperar-${source}`,item);const next={...clone(item)};
    delete next.archivedAt;delete next.deletedAt;delete next.deletedFrom;delete next.bucket;delete next.entityType;
    const previous=next.statusBeforeArchive||'Salvo';delete next.statusBeforeArchive;if(next.status==='Arquivado'||next.status==='Na lixeira')next.status=previous;
    next.updatedAt=new Date().toISOString();await activeRepo.put(next);await repo.delete(id);await log(source==='trash'?'Recuperar da lixeira':'Retomar do arquivo',next,'Orçamento recuperado para Ativos');await sync();eventBus?.emit?.('budget-history:changed',{action:'restore',id,source});return clone(next);
  }
  async function permanentDelete(id,confirmation=''){
    if(text(confirmation,32).toUpperCase()!=='EXCLUIR')throw new Error('Confirmação reforçada inválida.');
    const item=await trashRepo.get(id);if(!item)throw new Error('Orçamento não encontrado na Lixeira.');
    const backup=await safety('exclusao-definitiva',item);
    await trashRepo.delete(id);
    const row={id:uid('del'),entityId:String(id),entityType:'budget',at:new Date().toISOString(),cliente:item.cliente??item.clientName??'',reason:'exclusao-definitiva',backupId:backup.id,backupKey:'oficinaos_orc_exclusoes_backup_v1'};
    await logRepo.put(row);
    const logs=(await logRepo.list()).sort((a,b)=>String(b.at??'').localeCompare(String(a.at??'')));for(const extra of logs.slice(100))await logRepo.delete(extra.id);
    await log('Excluir definitivamente',item,'Orçamento removido da Lixeira após confirmação reforçada');await sync();eventBus?.emit?.('budget-history:changed',{action:'permanent-delete',id});return clone(row);
  }
  async function deletionBackups(){return clone((await backupRepo.list()).sort((a,b)=>String(b.at??'').localeCompare(String(a.at??''))));}
  async function deletionLog(){return clone((await logRepo.list()).sort((a,b)=>String(b.at??'').localeCompare(String(a.at??''))));}
  return Object.freeze({list:listBucket,find,links,archive,moveToTrash,restore,permanentDelete,deletionBackups,deletionLog});
}
