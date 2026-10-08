import { safeText } from '../../core/validators.js';
import { calculateBudget } from './orcamento-calculator.js';
import { createEmptyBudgetDraft, draftFromBudget, normalizeBudgetDraft, recordFromDraft } from './orcamento-model.js';
import { buildCommercialQuoteModel } from './pdf-service.js';
import { findRecordById, validateWorkflowDates } from '../workflow.js';

function clone(v){return structuredClone(v);}
function text(v,max=1000){return safeText(v,max);}
function id(){return `orc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;}

export function createOrcamentoService({repositories,eventBus,store}){
  const repo=repositories.budgets;const clientsRepo=repositories.clients;const settingsRepo=repositories.settings;const deletionBackupRepo=repositories.deletionBackups;const trashRepo=repositories.trash;
  async function sync(){store?.patch?.({budgets:await repo.list()});}
  async function changed(action,budgetId){await sync();eventBus?.emit?.('orcamento:changed',{action,id:budgetId});}
  async function getRequired(budgetId){const row=await repo.get(budgetId);if(!row)throw new Error('Orçamento não encontrado.');return row;}
  async function resolveClient(draft){const name=text(draft.clientName,120).toLocaleLowerCase('pt-BR');if(draft.clientId!=null&&draft.clientId!==''){const client=await findRecordById(clientsRepo,draft.clientId);if(!client)throw new Error('Cliente cadastrado não encontrado.');if(text(client.name??client.nome,120).toLocaleLowerCase('pt-BR')!==name)throw new Error('Nome do cliente diferente do cliente cadastrado selecionado.');return client.id;}if(!name)return null;const clients=await clientsRepo.list();return clients.find(c=>text(c.name??c.nome,120).toLocaleLowerCase('pt-BR')===name)?.id??null;}
  async function settings(){const rows=await settingsRepo.list();return Object.fromEntries(rows.map(r=>[r.id,r.value]));}
  return Object.freeze({
    createDraft:createEmptyBudgetDraft,
    calculate(input){return calculateBudget(normalizeBudgetDraft(input));},
    async clients(){return clientsRepo.list();},
    async list({query=''}={}){const q=text(query,160).toLocaleLowerCase('pt-BR');let rows=await repo.list();rows=rows.sort((a,b)=>String(b.updatedAt??b.data??'').localeCompare(String(a.updatedAt??a.data??'')));if(!q)return rows;return rows.filter(r=>[r.cliente,r.clientName,r.veiculo,r.vehicle,r.servico,r.service,r.id].some(v=>text(v,1000).toLocaleLowerCase('pt-BR').includes(q)));},
    async get(budgetId){const row=await repo.get(budgetId);return row?{record:row,draft:draftFromBudget(row)}:null;},
    async save(input={}){const draft=normalizeBudgetDraft(input);if(!draft.clientName)throw new Error('Cliente é obrigatório.');if(!draft.service)throw new Error('Descrição do serviço é obrigatória.');validateWorkflowDates(draft.entryDate,draft.dueDate);const existing=draft.id?await findRecordById(repo,draft.id):null;if(draft.id&&!existing)throw new Error('Orçamento não encontrado.');draft.id=existing?.id??id();draft.clientId=await resolveClient(draft);const record=recordFromDraft(draft,existing);record.id=draft.id;await repo.put(record);await changed(existing?'update':'create',record.id);return clone(record);},
    async duplicate(budgetId){const current=await getRequired(budgetId);const draft=draftFromBudget(current);draft.id=null;draft.status='Salvo';const copy=recordFromDraft(draft,null);copy.id=id();copy.cliente=draft.clientName;copy.clientName=draft.clientName;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;copy.source='modular-v0.6-copy';await repo.put(copy);await changed('duplicate',copy.id);return clone(copy);},
    async remove(budgetId){const current=await getRequired(budgetId);const at=new Date().toISOString();await deletionBackupRepo.put({id:`budget_${budgetId}_${Date.now()}`,at,entityType:'budget',reason:'budget-move-to-trash-phase8',payload:clone(current),item:clone(current)});const trashed={...clone(current),entityType:'budget',deletedAt:at,deletedFrom:'active',bucket:'trash',statusBeforeArchive:current.status||'Salvo',status:'Na lixeira'};await trashRepo.put(trashed);await repo.delete(budgetId);await changed('trash',budgetId);return trashed;},
    async commercialModel(budgetOrId){const record=typeof budgetOrId==='string'||typeof budgetOrId==='number'?await findRecordById(repo,budgetOrId):budgetOrId;if(!record)throw new Error('Orçamento não encontrado.');const cfg=(await settings()).os_config??{};return buildCommercialQuoteModel(record,cfg);},
    async configuration(){return (await settings()).os_config??{};}
  });
}
