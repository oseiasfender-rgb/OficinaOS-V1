import { safeText } from '../../core/validators.js';
import { findRecordById, validateWorkflowDates } from '../workflow.js';

function clone(v){return structuredClone(v);}
function num(v){const n=Number(v??0);return Number.isFinite(n)?n:0;}
function now(){return new Date().toISOString();}
function today(){return now().slice(0,10);}

export function createAgendaService({repositories,eventBus,store,workOrders,checklists}){
  const repo=repositories.appointments;
  const clientsRepo=repositories.clients;
  const budgetsRepo=repositories.budgets;
  const deletionBackupRepo=repositories.deletionBackups;

  async function syncStore(){store?.patch?.({appointments:await repo.list(),workOrders:await repositories.workOrders.list(),jobs:await repositories.jobs.list(),budgets:await budgetsRepo.list()});}
  async function changed(action,row){await syncStore();eventBus?.emit?.('agenda:changed',{action,id:row?.id});}
  async function getRequired(id){const row=await repo.get(id);if(!row)throw new Error('Agendamento não encontrado.');return row;}

  async function resolve(input={}){
    const budgetId=input.budgetId??input.orcamentoId??null;
    const budget=await findRecordById(budgetsRepo,budgetId);
    if(budgetId!=null && budgetId!=='' && !budget)throw new Error('Orçamento vinculado não encontrado.');
    const clientId=input.clientId??input.clienteId??budget?.clientId??budget?.clienteId??null;
    const budgetClientId=budget?.clientId??budget?.clienteId;
    if(budgetClientId!=null && clientId!=null && String(budgetClientId)!==String(clientId))throw new Error('O cliente selecionado não corresponde ao cliente do orçamento.');
    const client=await findRecordById(clientsRepo,clientId);
    if(clientId!=null && clientId!=='' && !client)throw new Error('Cliente vinculado não encontrado.');
    return {budget,client,clientId:client?.id??null,clientName:safeText(input.clientName??input.cliente??client?.name??client?.nome??budget?.cliente,120)};
  }

  async function create(input={}){
    const resolved=await resolve(input);
    if(!resolved.clientName)throw new Error('Cliente é obrigatório.');
    const date=safeText(input.date??input.data??input.entrada??today(),10);
    const dueDate=safeText(input.dueDate??input.entrega??input.dataEntrega,10);
    if(!date&&!dueDate)throw new Error('Informe ao menos uma data para a Agenda.');
    validateWorkflowDates(date,dueDate);
    let workOrderId=input.workOrderId??input.osId??null;
    let os=workOrderId?await workOrders.get(workOrderId):null;
    if(workOrderId!=null && !os)throw new Error('OS vinculada não encontrada.');
    if(!os){
      const existing=resolved.budget ? (await workOrders.list()).find(row=>String(row.budgetId)===String(resolved.budget.id)) : null;
      os=existing??await workOrders.create({
        budgetId:resolved.budget?.id??input.budgetId??input.orcamentoId??null,
        clientId:resolved.clientId,clientName:resolved.clientName,
        vehicle:input.vehicle??input.veiculo??resolved.budget?.veiculo,
        service:input.service??input.servico??input.tipo??resolved.budget?.servico,
        entryDate:date,dueDate:dueDate||date,value:num(input.value??input.valor??input.val??resolved.budget?.total),
        notes:input.notes??input.obs,priority:input.priority??input.prioridade
      });
      workOrderId=os.id;
      if(!existing && resolved.budget?.id!=null && checklists) await checklists.copyBudgetToWorkOrder(resolved.budget.id, os.id);
    }
    const duplicate=(await repo.list()).find(row=>String(row.workOrderId)===String(workOrderId)&&String(row.date)===String(date)&&row.status!=='Cancelado');
    if(duplicate)return duplicate;
    const id=input.id??`ag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
    const row={
      ...clone(input),id,workOrderId,clientId:os.clientId??resolved.clientId,budgetId:os.budgetId??resolved.budget?.id??null,
      date:date||os.entryDate||today(),dueDate:dueDate||os.dueDate||'',time:safeText(input.time??input.hora??'08:00',5),
      type:safeText(input.type??input.tipo??'Entrada',80),status:os.status==='Entregue'?'Concluído':safeText(input.status??'Agendado',40),
      clientName:os.clientName??resolved.clientName,vehicle:safeText(input.vehicle??input.veiculo??os.vehicle,160),
      service:safeText(input.service??input.servico??input.tipoServico??os.service,240),value:num(input.value??input.valor??input.val??os.value),
      notes:safeText(input.notes??input.obs??os.notes,1500),createdAt:input.createdAt??now(),updatedAt:now()
    };
    await repo.put(row);
    await workOrders.update(os.id,{entryDate:row.date,dueDate:row.dueDate||os.dueDate,clientName:row.clientName,vehicle:row.vehicle,service:row.service,value:row.value,notes:row.notes});
    await changed('create',row);return row;
  }

  return Object.freeze({
    async list({year,month,status='',query=''}={}){
      const q=safeText(query,120).toLocaleLowerCase('pt-BR');
      return (await repo.list()).filter(row=>{
        if(status&&row.status!==status)return false;
        const d=new Date(`${row.date||row.dueDate||'1970-01-01'}T00:00:00`);
        if(Number.isInteger(year)&&d.getFullYear()!==year)return false;
        if(Number.isInteger(month)&&d.getMonth()!==month)return false;
        if(q&&![row.clientName,row.vehicle,row.service].some(v=>safeText(v).toLocaleLowerCase('pt-BR').includes(q)))return false;
        return true;
      }).sort((a,b)=>String(a.date??'').localeCompare(String(b.date??''))||String(a.time??'').localeCompare(String(b.time??'')));
    },
    get:id=>repo.get(id),
    async clients(){return clientsRepo.list();},
    async budgets(){return budgetsRepo.list();},
    async budgetContext(id){const budget=await findRecordById(budgetsRepo,id);if(!budget)return null;const client=await findRecordById(clientsRepo,budget.clientId??budget.clienteId);return {budget,client};},
    create,
    async createFromBudget(budgetId,input={}){return create({...input,budgetId});},
    async update(id,changes={}){
      const current=await getRequired(id);const next={...current,...clone(changes),id:current.id,updatedAt:now()};
      validateWorkflowDates(next.date,next.dueDate);
      await repo.put(next);if(next.workOrderId)await workOrders.update(next.workOrderId,{entryDate:next.date,dueDate:next.dueDate,clientName:next.clientName,vehicle:next.vehicle,service:next.service,value:next.value,notes:next.notes});
      await changed('update',next);return next;
    },
    async markDone(id){const row=await getRequired(id);const next={...row,status:'Concluído',updatedAt:now()};await repo.put(next);if(next.workOrderId)await workOrders.markDelivered(next.workOrderId);await changed('complete',next);return next;},
    async reopen(id){const row=await getRequired(id);const next={...row,status:'Agendado',updatedAt:now()};await repo.put(next);if(next.workOrderId)await workOrders.reopen(next.workOrderId);await changed('reopen',next);return next;},
    async remove(id){const row=await getRequired(id);await deletionBackupRepo?.put({id:`appointment_${id}_${Date.now()}`,at:now(),entityType:'appointment',reason:'appointment-delete',payload:clone(row)});await repo.delete(id);await changed('delete',row);return row;}
  });
}
