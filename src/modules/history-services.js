import { createHistoricoOperacionalService } from './historico-operacional/historico-operacional-service.js';
import { createHistoricoOrcamentosService } from './historico-orcamentos/historico-orcamentos-service.js';

const BRIDGE = [
  ['clientes:changed','Clientes','Alteração','Cliente'],
  ['categorias:changed','Categorias','Alteração','Categoria'],
  ['estoque:changed','Estoque','Alteração','Item'],
  ['metas:changed','Metas','Alteração','Meta'],
  ['configuracoes:changed','Configurações','Alteração','Configuração'],
  ['agenda:changed','Agenda','Alteração','Agendamento'],
  ['os:changed','OS','Alteração','OS'],
  ['checklist:changed','Checklist','Alteração','Checklist'],
  ['orcamento:changed','Orçamento','Alteração','Orçamento']
];

function summary(module,payload={}){
  const action=payload.action||payload.key||'alteração';
  if(module==='Orçamento')return `Orçamento: ${action}`;
  if(module==='Clientes')return `Cadastro de cliente: ${action}`;
  return `${module}: ${action}`;
}

export function createHistoryServices({repositories,eventBus,store}){
  const operational=createHistoricoOperacionalService({repositories,eventBus,store});
  const budgets=createHistoricoOrcamentosService({repositories,eventBus,store,operationalHistory:operational});
  const unsubs=BRIDGE.map(([event,module,action,entity])=>eventBus?.on?.(event,payload=>{
    void operational.record({module,action:payload?.action||action,entity,entityId:payload?.id??payload?.key??'',summary:summary(module,payload),details:payload?JSON.stringify(payload):''});
  })).filter(Boolean);
  return Object.freeze({historicoOperacional:operational,historicoOrcamentos:budgets,dispose(){for(const unsub of unsubs)unsub();}});
}
