import {STATE} from './state.js';import {hydrateState,persistState,clearState,STORAGE_KEY} from './storage.js';import {initRouter} from './router.js';import {SIM} from '../data/simulacao.js';
import {mountOrcamento,loadOrcamentoSim,renderOrcamento} from '../modules/orcamento.js';import {mountFinanceiro,renderFinanceiro} from '../modules/financeiro.js';import {mountContas,loadContasSim,renderContas} from '../modules/contas.js';import {mountClientes,renderClientes} from '../modules/clientes.js';import {mountAgenda,renderAgenda} from '../modules/agenda.js';import {mountMetas,renderMetas} from '../modules/metas.js';import {mountRelatorios,renderRelatorios} from '../modules/relatorios.js';import {mountIA,renderIA} from '../modules/ia.js';
function mountAll(){mountOrcamento();mountFinanceiro();mountContas();mountClientes();mountAgenda();mountMetas();mountRelatorios();mountIA()}
export function renderAll(){renderOrcamento();renderFinanceiro();renderContas();renderClientes();renderAgenda();renderMetas();renderRelatorios();renderIA()}
function loadSimulation(){clearState();STATE.clientes.lista=[];STATE.orcamentos.lista=[];STATE.financeiro.transacoes=[];STATE.financeiro.recebiveis=[];STATE.financeiro.recibos=[];STATE.financeiro.nfe=[];STATE.financeiro.pix=[];STATE.contas.lista=[];STATE.agenda.eventos=[];loadContasSim(SIM.contas);loadOrcamentoSim(SIM);persistState();}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
document.addEventListener('toast',e=>toast(e.detail));document.addEventListener('state:changed',renderAll);
mountAll();initRouter(renderAll);if(!hydrateState())loadSimulation();else loadOrcamentoSim(SIM);renderAll();
window.OFIX={STATE,renderAll,loadSimulation,storageKey:STORAGE_KEY};
console.log('Ofix V546.11 modular carregado',STATE);
