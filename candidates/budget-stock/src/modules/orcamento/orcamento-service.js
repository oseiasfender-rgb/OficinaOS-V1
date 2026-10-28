import {nextBudgetNumber} from './document-number.js';
import {withWorkflowLock} from '../../core/workflow-lock.js';
import {createServiceCatalog} from './service-catalog.js';
import {createEstimateHistory,commercialSignature} from './estimate-history.js';
import { createReferenceVersions } from './reference-versions.js';
import { SUDESTE_REFERENCES } from './price-reference.js';
import { createPartsCatalogService } from './parts-catalog.js';
import { WORKFLOW_STAGES } from '../workflow.js';
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
  const estimateHistory=createEstimateHistory({repositories});
  const referenceVersions=createReferenceVersions(repositories,SUDESTE_REFERENCES);
  async function sync(){store?.patch?.({budgets:await repo.list()});}
  async function changed(action,budgetId){await sync();eventBus?.emit?.('orcamento:changed',{action,id:budgetId});}
  async function getRequired(budgetId){const row=await repo.get(budgetId);if(!row)throw new Error('Orçamento não encontrado.');return row;}
  async function resolveClient(draft){const name=text(draft.clientName,120).toLocaleLowerCase('pt-BR');if(draft.clientId!=null&&draft.clientId!==''){const client=await findRecordById(clientsRepo,draft.clientId);if(!client)throw new Error('Cliente cadastrado não encontrado.');if(text(client.name??client.nome,120).toLocaleLowerCase('pt-BR')!==name)throw new Error('Nome do cliente diferente do cliente cadastrado selecionado.');return client.id;}if(!name)return null;const clients=await clientsRepo.list();return clients.find(c=>text(c.name??c.nome,120).toLocaleLowerCase('pt-BR')===name)?.id??null;}
  async function saveWithStock(record){
    if(repositories.saveBudgetWithStock)return repositories.saveBudgetWithStock(record);
    if(record.stockAllocation || (record.materials||[]).some(r=>r.stockId!=null) || (record.parts||[]).some(r=>r.catalogId!=null))throw Error('Gravação de estoque indisponível.');
    const copy=clone(record);delete copy.stockExpectedUpdatedAt;await repo.put(copy);return copy;
  }
  async function settings(){const rows=await settingsRepo.list();return Object.fromEntries(rows.map(r=>[r.id,r.value]));}
  return Object.freeze({
    estimateHistory:{...estimateHistory,approve:async(...args)=>{const r=await estimateHistory.approve(...args);await changed('approve',r.id);return r;},revise:async(...args)=>{const r=await estimateHistory.revise(...args);await changed('revise',r.id);return r;}},
    partsCatalog:createPartsCatalogService(repositories),
    serviceCatalog:createServiceCatalog(repositories),
    priceReferences:()=>referenceVersions.current(),
    documentPriceReferences:()=>referenceVersions.documents(),
    priceReferenceHistory:()=>referenceVersions.history(),
    savePriceReferences:(rows,metadata)=>referenceVersions.save(rows,metadata),
    async addStagePhoto(budgetId,stage,dataUrl){if(!WORKFLOW_STAGES.some(s=>s.id===stage))throw new Error('Etapa inválida.');if(typeof dataUrl!=='string'||dataUrl.length>2500000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw new Error('Foto inválida.');const row=await getRequired(budgetId),photos=clone(row.stagePhotos||[]);if(photos.length>=30)throw new Error('Limite de 30 fotos por orçamento.');photos.push({id:`photo_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,stage,dataUrl,at:new Date().toISOString(),originBudgetId:row.id});await repo.put({...row,stagePhotos:photos});await changed('photo',row.id);return photos;},
    async removeStagePhoto(budgetId,photoId){const row=await getRequired(budgetId),photo=(row.stagePhotos||[]).find(p=>p.id===photoId);if(!photo)throw new Error('Foto não encontrada.');await deletionBackupRepo.put({id:`budget_photo_${photoId}_${Date.now()}`,at:new Date().toISOString(),entityType:'budgetPhoto',payload:{budgetId,photo}});await repo.put({...row,stagePhotos:row.stagePhotos.filter(p=>p.id!==photoId)});await changed('photo-delete',budgetId);},
    async deletedPhotos(budgetId){return (await deletionBackupRepo.list()).filter(b=>b.entityType==='budgetPhoto'&&String(b.payload?.budgetId)===String(budgetId));},
    async restoreStagePhoto(budgetId,backupId){const row=await getRequired(budgetId),b=await deletionBackupRepo.get(backupId);if(b?.entityType!=='budgetPhoto'||String(b.payload?.budgetId)!==String(budgetId))throw new Error('Cópia inválida.');const photos=clone(row.stagePhotos||[]);if(photos.some(p=>p.id===b.payload.photo.id))return;if(photos.length>=30)throw new Error('Limite de fotos atingido.');photos.push(clone(b.payload.photo));await repo.put({...row,stagePhotos:photos});await changed('photo-restore',budgetId);},
    createDraft:()=>{const d=createEmptyBudgetDraft();return {...d,pricingVersion:2,pricingMode:'composition',package:{},operations:[],hourRate:50,marginMode:'sale-margin',marginPercent:0,discountPercent:0,markups:{materials:0,parts:0,thirdParties:0},freight:{displacement:null,parts:null,tow:null},serviceItemsDiscount:null,laborProcesses:d.laborProcesses.map(r=>({...r,hours:null}))};},
    calculate(input){return calculateBudget(normalizeBudgetDraft(input));},
    async clients(){return clientsRepo.list();},
    async stock(){return repositories.stock.list();},
    async list({query=''}={}){const q=text(query,160).toLocaleLowerCase('pt-BR');let rows=await repo.list();rows=rows.sort((a,b)=>String(b.updatedAt??b.data??'').localeCompare(String(a.updatedAt??a.data??'')));if(!q)return rows;return rows.filter(r=>[r.cliente,r.clientName,r.veiculo,r.vehicle,r.servico,r.service,r.numero,r.number,r.id].some(v=>text(v,1000).toLocaleLowerCase('pt-BR').includes(q)));},
    async get(budgetId){const row=await repo.get(budgetId);return row?{record:row,draft:draftFromBudget(row)}:null;},
    async save(input={}){return withWorkflowLock(repositories,async()=>{const draft=normalizeBudgetDraft(input);if(!draft.clientName)throw new Error('Cliente é obrigatório.');if(!draft.service)throw new Error('Descrição do serviço é obrigatória.');validateWorkflowDates(draft.entryDate,draft.dueDate);const existing=draft.id?await findRecordById(repo,draft.id):null;if(draft.id&&!existing)throw new Error('Orçamento não encontrado.');draft.id=existing?.id??id();draft.clientId=await resolveClient(draft);const calculation=calculateBudget(draft);if(draft.pricingVersion===2&&!calculation.complete)throw new Error('Complete o orçamento: '+calculation.missing.join('; '));const record=recordFromDraft(draft,existing);if(existing?.approval&&commercialSignature(record)!==commercialSignature(existing.approval.snapshot))throw new Error('Orçamento aprovado é preservado. Crie uma revisão para alterar preço ou escopo.');record.id=draft.id;if(!existing)record.numero=await nextBudgetNumber(repositories);record.stockExpectedUpdatedAt=existing?.updatedAt;const saved=await saveWithStock(record);Object.assign(record,saved);delete record.stockExpectedUpdatedAt;await changed(existing?'update':'create',record.id);return clone(record);});},
    async duplicate(budgetId){return withWorkflowLock(repositories,async()=>{const current=await getRequired(budgetId);const draft=draftFromBudget(current);draft.id=null;draft.status='Salvo';const copy=recordFromDraft(draft,null);copy.id=id();copy.cliente=draft.clientName;copy.clientName=draft.clientName;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;copy.source='modular-v0.6-copy';copy.numero=await nextBudgetNumber(repositories);delete copy.stockAllocation;Object.assign(copy,await saveWithStock(copy));await changed('duplicate',copy.id);return clone(copy);});},
    async remove(budgetId){const current=await getRequired(budgetId);const at=new Date().toISOString();await deletionBackupRepo.put({id:`budget_${budgetId}_${Date.now()}`,at,entityType:'budget',reason:'budget-move-to-trash-phase8',payload:clone(current),item:clone(current)});const trashed={...clone(current),entityType:'budget',deletedAt:at,deletedFrom:'active',bucket:'trash',statusBeforeArchive:current.status||'Salvo',status:'Na lixeira'};await trashRepo.put(trashed);await repo.delete(budgetId);await changed('trash',budgetId);return trashed;},
    async commercialModel(budgetOrId){const record=typeof budgetOrId==='string'||typeof budgetOrId==='number'?await findRecordById(repo,budgetOrId):budgetOrId;if(!record)throw new Error('Orçamento não encontrado.');const cfg=(await settings()).os_config??{};return buildCommercialQuoteModel(record,cfg);},
    async configuration(){return (await settings()).os_config??{};}
  });
}
