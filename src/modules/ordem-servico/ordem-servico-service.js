import { safeText } from '../../core/validators.js';
import { normalizeStage } from '../workflow.js';

function arr(v){ return Array.isArray(v) ? v : []; }
function clone(v){ return structuredClone(v); }
function num(v){ const n=Number(v??0); return Number.isFinite(n)?n:0; }
function today(){ return new Date().toISOString().slice(0,10); }
function now(){ return new Date().toISOString(); }

function nextNumericJobId(jobs){
  let max=0;
  for(const row of arr(jobs)){ const n=Number(row?.id); if(Number.isInteger(n)&&n>max) max=n; }
  return max+1;
}

function nextOsNumber(rows){
  const year=new Date().getFullYear();
  let max=0;
  for(const row of arr(rows)){
    const m=String(row?.number??row?.numero??'').match(/OS-(?:\d{4}-)?(\d+)/i);
    if(m) max=Math.max(max, Number(m[1])||0);
  }
  return `OS-${year}-${String(max+1).padStart(4,'0')}`;
}

export function createOrdemServicoService({ repositories, eventBus, store }){
  const repo=repositories.workOrders;
  const jobsRepo=repositories.jobs;
  const clientsRepo=repositories.clients;
  const budgetsRepo=repositories.budgets;
  const appointmentsRepo=repositories.appointments;
  const deletionBackupRepo=repositories.deletionBackups;

  async function syncStore(){
    store?.patch?.({ workOrders: await repo.list(), jobs: await jobsRepo.list(), appointments: await appointmentsRepo.list(), budgets: await budgetsRepo.list() });
  }

  async function clientFor(id){ return id==null ? null : clientsRepo.get(id); }
  async function budgetFor(id){ return id==null ? null : budgetsRepo.get(id); }

  async function resolveVehicle(client, input={}){
    const vehicleId=input.vehicleId??input.veiculoId;
    if(vehicleId!=null){
      const found=arr(client?.veiculos).find(v=>String(v.id)===String(vehicleId));
      if(found) return { id: found.id, label: safeText(found.marca??found.name,120), plate:safeText(found.placa,20) };
    }
    const text=safeText(input.vehicle??input.veiculo,160);
    return { id: vehicleId??null, label:text, plate:safeText(input.plate??input.placa,20) };
  }

  async function mirrorLegacyJob(workOrder){
    const jobs=await jobsRepo.list();
    let legacyId=workOrder.legacyJobId;
    if(legacyId==null || legacyId==='') legacyId=nextNumericJobId(jobs);
    const current=jobs.find(j=>String(j.id)===String(legacyId));
    const job={
      ...(current||{}), id:legacyId,
      cliente:workOrder.clientName||'', veiculo:workOrder.vehicle||'', tipo:workOrder.service||'',
      entrada:workOrder.entryDate||'', entrega:workOrder.dueDate||'', val:num(workOrder.value),
      done:workOrder.status==='Entregue'||workOrder.stage==='entregue', obs:workOrder.notes||'',
      orcamentoId:workOrder.budgetId??null, orcId:workOrder.budgetId??null,
      etapa:workOrder.stage, status:workOrder.status, osId:workOrder.id,
      updatedAt:now()
    };
    await jobsRepo.put(job);
    if(String(workOrder.legacyJobId??'')!==String(legacyId)){
      workOrder.legacyJobId=legacyId;
      await repo.put(workOrder);
    }
    return job;
  }

  async function log(action, os, detail=''){
    if(!repositories.operationalHistory) return;
    await repositories.operationalHistory.put({
      id:`evt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, at:now(), module:'OS', action,
      entity:'workOrder', entityId:os.id, detail, clientId:os.clientId??null, budgetId:os.budgetId??null
    });
  }

  async function changed(action, os){
    await syncStore();
    eventBus?.emit?.('os:changed',{action,id:os?.id});
  }

  async function create(input={}){
    const rows=await repo.list();
    const budget=await budgetFor(input.budgetId??input.orcamentoId);
    const clientId=input.clientId??input.clienteId??budget?.clientId??budget?.clienteId??null;
    const client=await clientFor(clientId);
    const clientName=safeText(input.clientName??input.cliente??client?.name??client?.nome??budget?.cliente,120);
    if(!clientName) throw new Error('Cliente é obrigatório para criar a OS.');
    const vehicleInfo=await resolveVehicle(client,{...input, vehicle:input.vehicle??input.veiculo??budget?.veiculo, vehicleId:input.vehicleId??budget?.vehicleId??budget?.veiculoId});
    const id=input.id??`os_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
    const stage=normalizeStage(input.stage??input.etapa??'entrada',input.done===true);
    const record={
      ...clone(input), id,
      number:safeText(input.number??input.numero??nextOsNumber(rows),40),
      legacyJobId:input.legacyJobId??input.legacyId??null,
      budgetId:budget?.id??input.budgetId??input.orcamentoId??null,
      clientId, vehicleId:vehicleInfo.id,
      clientName, vehicle:safeText(input.vehicle??input.veiculo??vehicleInfo.label??budget?.veiculo,160),
      service:safeText(input.service??input.servico??input.tipo??budget?.servico??budget?.descricao,240),
      stage, status:stage==='entregue'?'Entregue':safeText(input.status??'Agendada',40),
      priority:safeText(input.priority??input.prioridade??budget?.prioridade??'Normal',40),
      entryDate:safeText(input.entryDate??input.entrada??input.dataEntrada??today(),10),
      dueDate:safeText(input.dueDate??input.entrega??input.dataEntrega,10),
      value:num(input.value??input.valor??input.val??budget?.total),
      notes:safeText(input.notes??input.obs,1500),
      financialSyncPending:stage==='entregue',
      createdAt:input.createdAt??now(), updatedAt:now()
    };
    await repo.put(record);
    await mirrorLegacyJob(record);
    if(budget){ await budgetsRepo.put({...budget, osId:record.id, status:record.status==='Entregue'?'Convertido em OS':'Agendado', updatedAt:now()}); }
    await log('CREATE',record,'OS criada e espelhada em jobs para compatibilidade.');
    await changed('create',record);
    return record;
  }

  async function getRequired(id){ const row=await repo.get(id); if(!row) throw new Error('OS não encontrada.'); return row; }

  return Object.freeze({
    async list({status='',stage='',query=''}={}){
      const q=safeText(query,120).toLocaleLowerCase('pt-BR');
      return (await repo.list()).filter(row=>{
        if(status && row.status!==status) return false;
        if(stage && row.stage!==stage) return false;
        if(q && ![row.number,row.clientName,row.vehicle,row.service].some(v=>safeText(v).toLocaleLowerCase('pt-BR').includes(q))) return false;
        return true;
      }).sort((a,b)=>String(b.updatedAt??b.createdAt??'').localeCompare(String(a.updatedAt??a.createdAt??'')));
    },
    get:id=>repo.get(id),
    create,
    async createFromBudget(budgetId,input={}){
      const existing=(await repo.list()).find(row=>String(row.budgetId??'')===String(budgetId));
      if(existing) return existing;
      return create({...input,budgetId});
    },
    async update(id,changes={}){
      const current=await getRequired(id);
      const stage=normalizeStage(changes.stage??changes.etapa??current.stage,changes.done===true);
      const next={...current,...clone(changes),id:current.id,stage,status:stage==='entregue'?'Entregue':safeText(changes.status??current.status,40),updatedAt:now()};
      next.financialSyncPending=next.status==='Entregue';
      await repo.put(next); await mirrorLegacyJob(next); await log('UPDATE',next,'OS atualizada.'); await changed('update',next); return next;
    },
    async setStage(id,stage){ return this.update(id,{stage,status:normalizeStage(stage)==='entregue'?'Entregue':'Em andamento'}); },
    async markDelivered(id){ return this.update(id,{stage:'entregue',status:'Entregue',financialSyncPending:true,deliveredAt:now()}); },
    async reopen(id){ return this.update(id,{stage:'controle',status:'Em andamento',financialSyncPending:false,deliveredAt:null}); },
    async remove(id){
      const current=await getRequired(id);
      await deletionBackupRepo?.put({id:`os_${id}_${Date.now()}`,at:now(),entityType:'workOrder',reason:'work-order-delete',payload:clone(current)});
      const appointments=await appointmentsRepo.list();
      for(const a of appointments.filter(x=>String(x.workOrderId)===String(id))) await appointmentsRepo.delete(a.id);
      if(current.legacyJobId!=null) await jobsRepo.delete(current.legacyJobId);
      await repo.delete(id); await log('DELETE',current,'OS removida com backup preventivo.'); await changed('delete',current); return current;
    },
    mirrorLegacyJob
  });
}
