import { WORKFLOW_STAGES, normalizeStage } from '../workflow.js';

function clone(v){return structuredClone(v);}
function arr(v){return Array.isArray(v)?v:[];}
function now(){return new Date().toISOString();}

export const DEFAULT_CHECKLIST_ITEMS=Object.freeze({
  entrada:['Registrar fotos de entrada','Conferir avarias visíveis','Confirmar veículo e cliente','Registrar quilometragem/observações'],
  desmontagem:['Para-choque removido','Faróis removidos','Lanternas removidas','Acabamentos identificados e armazenados'],
  funilaria:['Danos mapeados','Alinhamento conferido','Reparo estrutural concluído','Superfície pronta para preparação'],
  solda:['Área limpa e preparada','Processo de solda definido','Solda executada','Acabamento e inspeção da solda concluídos'],
  preparacao:['Lixamento concluído','Correções de massa concluídas','Primer aplicado','Mascaramento conferido'],
  pintura:['Cor conferida','Base aplicada','Cobertura uniforme','Verniz aplicado'],
  cura:['Tempo de cura respeitado','Superfície seca','Sem contaminação aparente'],
  polimento:['Correção de textura concluída','Refino concluído','Lustro final concluído'],
  montagem:['Peças reinstaladas','Folgas e alinhamentos conferidos','Elétrica/iluminação testada'],
  controle:['Inspeção visual final','Limpeza final','Checklist de segurança concluído','Fotos finais registradas'],
  entregue:['Cliente comunicado','Documentação/recibo conferido','Veículo entregue']
});

function blankStages(){
  const stages={};
  for(const stage of WORKFLOW_STAGES) stages[stage.id]=DEFAULT_CHECKLIST_ITEMS[stage.id].map(label=>({label,done:false}));
  return stages;
}

export function createChecklistService({repositories,eventBus,store}){
  const repo=repositories.checklists;

  function idFor(type,id){return type==='budget'?`orc:${id}`:type==='workOrder'?`os:${id}`:'draft';}
  async function getOrCreate(contextType,contextId,{persist=true}={}){
    const id=idFor(contextType,contextId);let row=await repo.get(id);
    if(!row){row={id,contextType,contextId,currentStage:'entrada',stages:blankStages(),updatedAt:null};if(persist){row.updatedAt=now();await repo.put(row);}}
    return row;
  }
  async function sync(){store?.patch?.({checklists:await repo.list()});}
  async function changed(action,row){await sync();eventBus?.emit?.('checklist:changed',{action,id:row.id});}

  return Object.freeze({
    stages:WORKFLOW_STAGES,
    async get(contextType,contextId){return getOrCreate(contextType,contextId,{persist:false});},
    async setCurrentStage(contextType,contextId,stage){const row=await getOrCreate(contextType,contextId);row.currentStage=normalizeStage(stage);row.updatedAt=now();await repo.put(row);await changed('stage',row);return row;},
    async setItem(contextType,contextId,stage,index,done){
      const row=await getOrCreate(contextType,contextId);const s=normalizeStage(stage);if(!row.stages||typeof row.stages!=='object')row.stages=blankStages();
      const items=arr(row.stages[s]).map(item=>typeof item==='boolean'?{label:'Item',done:item}:clone(item));
      if(!items[index])throw new Error('Item do checklist não encontrado.');items[index].done=!!done;row.stages[s]=items;row.currentStage=s;row.updatedAt=now();await repo.put(row);await changed('item',row);return row;
    },
    async stats(contextType,contextId){const row=await getOrCreate(contextType,contextId,{persist:false});let total=0,done=0;for(const items of Object.values(row.stages||{})){for(const item of arr(items)){total++;if(typeof item==='boolean'?item:item.done)done++;}}return {total,done,pct:total?Math.round(done/total*100):0,currentStage:row.currentStage};},
    async copyBudgetToWorkOrder(budgetId,workOrderId){const source=await repo.get(idFor('budget',budgetId));if(!source)return getOrCreate('workOrder',workOrderId);const target={...clone(source),id:idFor('workOrder',workOrderId),contextType:'workOrder',contextId:workOrderId,updatedAt:now()};await repo.put(target);await changed('copy',target);return target;}
  });
}
