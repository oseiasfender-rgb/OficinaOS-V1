import {STATE} from '../core/state.js?v=546113';
import {br,norm} from '../utils/format.js?v=546113';
const $=(id)=>document.getElementById(id);

export function mountClientes(){
  const el=$('mod-clientes');
  if(!el){ console.warn('mod-clientes não encontrado'); return; }
  el.innerHTML=`<div class="module-body"><div class="module-left"><div class="global-search"><input id="clienteBusca" placeholder="Buscar por nome, placa, telefone, veículo, OS, NF-e, recibo..."></div><div id="clientesLista" class="list"></div></div><aside class="module-right"><div class="sec-lbl">Histórico/CRM</div><div id="clienteDetalhe" class="timeline"></div></aside></div>`;
  const busca=$('clienteBusca');
  if(busca) busca.oninput=renderClientes;
}

export function renderClientes(){
  const lista=$('clientesLista');
  const busca=$('clienteBusca');
  if(!lista) return;
  const q=norm(busca?.value||'');
  const clientes=(STATE.clientes?.lista||[]);
  const arr=clientes.filter(c=>!q||norm([c.nome,c.telefone,c.placa,c.veiculo,c.doc,JSON.stringify(c.timeline||[])].join(' ')).includes(q));
  lista.innerHTML=arr.map(c=>`<div class="item"><div><div class="item-title">${c.nome}</div><div class="item-sub">${c.telefone||''} · ${c.veiculo||''} · ${c.placa||''}</div></div><button class="mini-btn" data-cl="${c.id}">Histórico</button></div>`).join('')||'<p class="muted">Nenhum cliente.</p>';
  lista.querySelectorAll('[data-cl]').forEach(b=>b.onclick=()=>showCliente(b.dataset.cl));
  if(arr[0])showCliente(arr[0].id); else { const det=$('clienteDetalhe'); if(det) det.innerHTML='<p class="muted">Selecione um cliente.</p>'; }
}

function showCliente(id){
  const detalhe=$('clienteDetalhe');
  if(!detalhe) return;
  const c=(STATE.clientes?.lista||[]).find(x=>x.id===id);
  if(!c)return;
  const orcs=(STATE.orcamentos?.lista||[]).filter(o=>o.clienteId===id&&!o.deleted);
  const recibos=(STATE.financeiro?.recibos||[]).filter(r=>orcs.some(o=>o.id===r.refId));
  detalhe.innerHTML=`<div class="item"><div><div class="item-title">${c.nome}</div><div class="item-sub">${c.veiculo||''} · ${c.placa||''}</div></div></div>`+orcs.map(o=>`<div class="item"><div><div class="item-title">${o.id} · ${o.status}</div><div class="item-sub">${o.servico} · ${br(o.resumo?.total)}</div></div></div>`).join('')+recibos.map(r=>`<div class="item"><div><div class="item-title">Recibo ${r.id}</div><div class="item-sub">${r.refId}</div></div><b>${br(r.valor)}</b></div>`).join('');
}
