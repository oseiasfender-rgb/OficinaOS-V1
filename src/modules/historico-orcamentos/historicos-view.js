import { el, button, labeledField, setFeedback } from '../../ui/dom.js';
import { formatBRL } from '../../core/money.js';

function input(type='text'){const n=el('input','mod-input');n.type=type;return n;}
function select(){return el('select','mod-input');}
function option(value,label){const n=el('option','',label);n.value=value;return n;}
function dateTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');}

export function renderHistoricosView(root,{operational,budgets,onChanged}){
  root.className='simple-module history-module';let mode='activity',bucket='active';
  const toolbar=el('div','module-toolbar');const title=el('div');title.append(el('h1','module-title','Históricos, Arquivados e Lixeira'),el('p','module-subtitle','Histórico operacional separado do histórico comercial, com restauração e exclusão protegida.'));
  const tools=el('div','module-toolbar-actions');const activityBtn=button('Alterações','btn btn-primary');const budgetsBtn=button('Orçamentos','btn');const search=input('search');search.placeholder='Buscar…';tools.append(activityBtn,budgetsBtn,search);toolbar.append(title,tools);
  const feedback=el('div','module-feedback');feedback.hidden=true;const body=el('div','module-body history-body');root.replaceChildren(toolbar,feedback,body);

  const activityFilters=el('div','history-filters');const moduleSel=select();moduleSel.append(option('all','Todos os módulos'));const days=input('number');days.min='0';const max=input('number');max.min='0';const savePolicy=button('Salvar retenção','btn');activityFilters.append(labeledField('Módulo',moduleSel),labeledField('Retenção (dias)',days),labeledField('Máximo de eventos',max),savePolicy);
  const shelfTabs=el('div','history-shelf-tabs');const active=button('Ativos','btn btn-small btn-primary'),archived=button('Arquivados','btn btn-small'),trash=button('Lixeira','btn btn-small');const preventive=button('Cópias preventivas','btn btn-small');shelfTabs.append(active,archived,trash,preventive,el('span','muted-small','Exclusão definitiva exige backup e confirmação EXCLUIR.'));
  const list=el('div','history-list');

  function setMode(next){mode=next;activityBtn.classList.toggle('btn-primary',mode==='activity');budgetsBtn.classList.toggle('btn-primary',mode==='budgets');render();}
  function setBucket(next){bucket=next;for(const [id,b] of [['active',active],['archived',archived],['trash',trash],['preventive',preventive]])b.classList.toggle('btn-primary',id===bucket);render();}
  async function renderActivity(){
    body.replaceChildren(activityFilters,list);const cfg=await operational.config();days.value=cfg.days;max.value=cfg.max;const modules=await operational.modules();const prev=moduleSel.value;moduleSel.replaceChildren(option('all','Todos os módulos'));for(const name of modules)moduleSel.append(option(name,name));if([...moduleSel.options].some(o=>o.value===prev))moduleSel.value=prev;
    const rows=await operational.list({query:search.value,module:moduleSel.value||'all'});list.replaceChildren();if(!rows.length){list.append(el('p','empty-state','Nenhuma alteração registrada no período de retenção.'));return;}
    for(const row of rows){const card=el('article','history-event-row');const when=el('div','history-event-time',dateTime(row.at));const meta=el('div','history-event-meta');meta.append(el('strong','',row.module||'Sistema'),el('span','muted-small',row.action||'Alteração'));const detail=el('div','history-event-detail');detail.append(el('strong','',row.summary||row.entity||'Alteração'),el('span','muted-small',[row.entity,row.entityId,row.details].filter(Boolean).join(' · ')));card.append(when,meta,detail);list.append(card);}
  }
  async function budgetCard(row){
    const card=el('article',`history-budget-row${bucket==='trash'?' is-trash':''}`);const main=el('div','history-budget-main');main.append(el('strong','',row.cliente??row.clientName??'Cliente'),el('span','muted-small',[row.veiculo??row.vehicle,row.servico??row.service??row.descricao,row.status].filter(Boolean).join(' · ')));
    const linked=await budgets.links(row);if(linked.total)main.append(el('span','muted-small',`${linked.total} vínculo(s) preservado(s)`));
    const date=el('span','',row.data??row.entryDate??'—'),amount=el('strong','history-budget-value',formatBRL(row.total));const actions=el('div','history-budget-actions');
    if(bucket==='active'){
      const a=button('Arquivar','btn btn-small');a.addEventListener('click',async()=>{if(!window.confirm('Arquivar este orçamento? Ele poderá ser retomado depois.'))return;try{await budgets.archive(row.id);setFeedback(feedback,'Orçamento arquivado.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});
      const t=button('Lixeira','btn btn-small btn-danger');t.addEventListener('click',async()=>{const msg=`Mover para a Lixeira?${linked.total?`\n\n${linked.total} vínculo(s) com Agenda/OS/Financeiro/Contas serão preservados.`:''}`;if(!window.confirm(msg))return;try{await budgets.moveToTrash(row.id,'active');setFeedback(feedback,'Orçamento enviado para a Lixeira.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});actions.append(a,t);
    }else if(bucket==='archived'){
      const r=button('Retomar','btn btn-small');r.addEventListener('click',async()=>{try{await budgets.restore(row.id,'archived');setFeedback(feedback,'Orçamento retomado em Ativos.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});
      const t=button('Lixeira','btn btn-small btn-danger');t.addEventListener('click',async()=>{if(!window.confirm('Mover este orçamento arquivado para a Lixeira?'))return;try{await budgets.moveToTrash(row.id,'archived');setFeedback(feedback,'Orçamento enviado para a Lixeira.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});actions.append(r,t);
    }else{
      const r=button('Recuperar','btn btn-small');r.addEventListener('click',async()=>{try{await budgets.restore(row.id,'trash');setFeedback(feedback,'Orçamento recuperado para Ativos.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});
      const d=button('Excluir definitivo','btn btn-small btn-danger');d.addEventListener('click',async()=>{if(!window.confirm('Excluir DEFINITIVAMENTE este orçamento? Um backup preventivo será preservado.'))return;const phrase=window.prompt('Digite EXCLUIR para confirmar:','');if(phrase==null)return;try{await budgets.permanentDelete(row.id,phrase);setFeedback(feedback,'Exclusão definitiva concluída; backup e log preservados.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');}});actions.append(r,d);
    }
    card.append(main,date,amount,actions);return card;
  }
  async function renderPreventive(){
    body.replaceChildren(shelfTabs,list);list.replaceChildren();
    list.append(el('p','muted-small','Recupere orçamentos excluídos definitivamente enquanto a cópia estiver disponível. As últimas 50 cópias de orçamento são mantidas; exporte o backup JSON para conservar uma cópia externa.'));
    const rows=await budgets.preventiveCopies({query:search.value});
    if(!rows.length)list.append(el('p','empty-state','Nenhuma cópia preventiva de exclusão definitiva disponível.'));
    for(const backup of rows){
      const row=backup.item??backup.payload;const card=el('article','history-budget-row');
      const main=el('div','history-budget-main');main.append(el('strong','',row.cliente??row.clientName??'Cliente'),el('span','muted-small',[row.veiculo??row.vehicle,row.servico??row.service,`ID: ${row.id}`].filter(Boolean).join(' · ')));
      const actions=el('div','history-budget-actions');const recover=button(backup.recoveredAt?'Recuperado':'Recuperar para Ativos','btn btn-small');recover.disabled=!!backup.recoveredAt;
      recover.addEventListener('click',async()=>{if(!window.confirm('Recuperar este orçamento para Ativos? O ID e os valores originais serão preservados.'))return;recover.disabled=true;try{await budgets.recoverPreventive(backup.id);setFeedback(feedback,'Orçamento recuperado pela cópia preventiva.','ok');onChanged?.();await render();}catch(e){setFeedback(feedback,e.message,'error');recover.disabled=false;}});
      actions.append(recover);card.append(main,el('span','',dateTime(backup.at)),el('strong','history-budget-value',formatBRL(row.total)),actions);list.append(card);
    }
  }
  async function renderBudgets(){if(bucket==='preventive')return renderPreventive();body.replaceChildren(shelfTabs,list);const rows=await budgets.list(bucket,{query:search.value});list.replaceChildren();if(!rows.length){list.append(el('p','empty-state',bucket==='active'?'Nenhum orçamento ativo.':bucket==='archived'?'Nenhum orçamento arquivado.':'A Lixeira está vazia.'));return;}for(const row of rows)list.append(await budgetCard(row));}
  async function render(){if(mode==='activity')await renderActivity();else await renderBudgets();}
  activityBtn.addEventListener('click',()=>setMode('activity'));budgetsBtn.addEventListener('click',()=>setMode('budgets'));active.addEventListener('click',()=>setBucket('active'));archived.addEventListener('click',()=>setBucket('archived'));trash.addEventListener('click',()=>setBucket('trash'));preventive.addEventListener('click',()=>setBucket('preventive'));search.addEventListener('input',render);moduleSel.addEventListener('change',render);
  savePolicy.addEventListener('click',async()=>{try{const cfg=await operational.configure({days:Number(days.value),max:Number(max.value)});setFeedback(feedback,`Retenção atualizada: ${cfg.days} dias · máximo ${cfg.max} eventos.`,'ok');await render();}catch(e){setFeedback(feedback,e.message,'error');}});
  render();return {refresh:render};
}
