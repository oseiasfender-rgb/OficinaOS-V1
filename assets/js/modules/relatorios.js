import {STATE} from '../core/state.js?v=546113';import {br} from '../utils/format.js?v=546113';import {resumoFinanceiro} from '../services/calculos.js?v=546113';
const $=(id)=>document.getElementById(id);
export function mountRelatorios(){const el=$('mod-relatorios');el.innerHTML=`<div class="module-body"><div class="module-left"><div class="sec-lbl">Relatórios consolidados</div><div id="relBox"></div></div><aside class="module-right"><div class="sec-lbl">Exportação textual</div><pre id="relExport" class="receipt-box"></pre></aside></div>`}
export function renderRelatorios(){const r=resumoFinanceiro(STATE.financeiro,STATE.contas,STATE.config.competencia);const orcs=STATE.orcamentos.lista.filter(o=>!o.deleted);const lucroReal=r.receitas-r.despesas;$('#relBox').innerHTML=`<div class="kpi-grid"><div class="kpi receita"><div class="kpi-label">Receitas</div><div class="kpi-val">${br(r.receitas)}</div></div><div class="kpi despesa"><div class="kpi-label">Despesas</div><div class="kpi-val">${br(r.despesas)}</div></div><div class="kpi lucro"><div class="kpi-label">Lucro real</div><div class="kpi-val">${br(lucroReal)}</div></div><div class="kpi info"><div class="kpi-label">Orçamentos</div><div class="kpi-val">${orcs.length}</div></div></div>`;$('#relExport').textContent=`RELATÓRIO V546.11
Receitas: ${br(r.receitas)}
Despesas: ${br(r.despesas)}
Saldo: ${br(r.saldo)}
Orçamentos: ${orcs.length}`}
