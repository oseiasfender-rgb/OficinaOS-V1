import { createChecklistService } from './ordem-servico/checklist-service.js';
import { createOrdemServicoService } from './ordem-servico/ordem-servico-service.js';
import { createAgendaService } from './agenda/agenda-service.js';
import { createOrcamentoService } from './orcamento/orcamento-service.js';
import { createFinancialServices } from './financeiro/financeiro-service.js';

export function createWorkflowServices(context){
  const checklists=createChecklistService(context);
  const workOrders=createOrdemServicoService(context);
  const agenda=createAgendaService({...context,workOrders,checklists});
  const orcamento=createOrcamentoService(context);
  const financial=createFinancialServices(context);
  return Object.freeze({checklists,workOrders,agenda,orcamento,financeiro:financial.financeiro,contas:financial.contas});
}
