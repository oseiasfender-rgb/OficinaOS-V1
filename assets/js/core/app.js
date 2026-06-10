import {STATE} from './state.js?v=546112';import {hydrateState,persistState,clearState,STORAGE_KEY} from './storage.js?v=546112';import {initRouter} from './router.js?v=546112';import {SIM} from '../data/simulacao.js?v=546112';
import {mountOrcamento,loadOrcamentoSim,renderOrcamento} from '../modules/orcamento.js?v=546112';import {mountFinanceiro,renderFinanceiro} from '../modules/financeiro.js?v=546112';import {mountContas,loadContasSim,renderContas} from '../modules/contas.js?v=546112';import {mountClientes,renderClientes} from '../modules/clientes.js?v=546112';import {mountAgenda,renderAgenda} from '../modules/agenda.js?v=546112';import {mountMetas,renderMetas} from '../modules/metas.js?v=546112';import {mountRelatorios,renderRelatorios} from '../modules/relatorios.js?v=546112';import {mountIA,renderIA} from '../modules/ia.js?v=546112';
function mountAll(){mountOrcamento();mountFinanceiro();mountContas();mountClientes();mountAgenda();mountMetas();mountRelatorios();mountIA()}
export function renderAll(){renderOrcamento();renderFinanceiro();renderContas();renderClientes();renderAgenda();renderMetas();renderRelatorios();renderIA()}
function loadSimulation(){clearState();STATE.clientes.lista=[];STATE.orcamentos.lista=[];STATE.financeiro.transacoes=[];STATE.financeiro.recebiveis=[];STATE.financeiro.recibos=[];STATE.financeiro.nfe=[];STATE.financeiro.pix=[];STATE.contas.lista=[];STATE.agenda.eventos=[];loadContasSim(SIM.contas);loadOrcamentoSim(SIM);persistState();}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
document.addEventListener('toast',e=>toast(e.detail));document.addEventListener('state:changed',renderAll);
mountAll();initRouter(renderAll);if(!hydrateState())loadSimulation();else loadOrcamentoSim(SIM);renderAll();
window.OFIX={STATE,renderAll,loadSimulation,storageKey:STORAGE_KEY};
console.log('Ofix V546.11.2 modular carregado',STATE);
