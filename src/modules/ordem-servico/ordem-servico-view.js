import { el, button, setFeedback } from '../../ui/dom.js';
import { WORKFLOW_STAGES, stageLabel } from '../workflow.js';

function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export function renderOrdemServicoView(root,{service,checklists,onChanged}){
  root.className='simple-module os-module';
  const toolbar=el('div','module-toolbar');const titleWrap=el('div');titleWrap.append(el('h1','module-title','Ordens de Serviço'),el('p','module-subtitle','OS separadas da Agenda, com etapas e checklist persistidos.'));
  const search=el('input','mod-input os-search');search.placeholder='Buscar OS, cliente ou veículo';toolbar.append(titleWrap,search);
  const feedback=el('div','module-feedback');feedback.hidden=true;
  const body=el('div','module-body os-body');const listPane=el('section','module-card os-list-pane');const detail=el('section','module-card os-detail-pane');body.append(listPane,detail);root.replaceChildren(toolbar,feedback,body);
  let rows=[],selectedId=null;

  function listCard(row){const b=button('','os-list-row');b.dataset.id=row.id;const top=el('div','os-list-top');top.append(el('strong','',row.number||row.id),el('span',`os-status ${row.status==='Entregue'?'done':''}`,row.status||'Agendada'));b.append(top,el('span','',row.clientName||'Cliente'),el('span','muted-small',`${row.vehicle||'Veículo'} · ${row.service||'Serviço'}`),el('span','muted-small',`${stageLabel(row.stage)} · ${row.dueDate||'sem previsão'}`));if(String(row.id)===String(selectedId))b.classList.add('active');b.addEventListener('click',()=>{selectedId=row.id;render();});return b;}

  async function renderDetail(row){detail.replaceChildren();if(!row){detail.append(el('p','empty-state','Selecione uma OS.'));return;}
    const head=el('div','os-detail-head');const identity=el('div');identity.append(el('h2','',row.number||'OS'),el('p','',`${row.clientName||'Cliente'} · ${row.vehicle||'Veículo'}`));const value=el('strong','os-detail-value',money(row.value));head.append(identity,value);detail.append(head);
    const refs=el('div','os-ref-grid');refs.append(refBox('Orçamento',row.budgetId||'—'),refBox('Cliente',row.clientId||'—'),refBox('Agenda/Job',row.legacyJobId??'—'),refBox('Entrega',row.dueDate||'—'));detail.append(refs);
    const stageCard=el('div','os-stage-card');stageCard.append(el('h3','','Etapa atual'));const rail=el('div','os-stage-rail');for(const stage of WORKFLOW_STAGES){const b=button(`${stage.id===row.stage?'● ':' '}${stage.label}`,'os-stage-btn');if(stage.id===row.stage)b.classList.add('active');b.addEventListener('click',async()=>{try{const next=stage.id==='entregue'?await service.markDelivered(row.id):await service.setStage(row.id,stage.id);setFeedback(feedback,stage.id==='entregue'?'OS entregue. Financeiro permanece pendente para a Fase 7.':`Etapa alterada para ${stage.label}.`,'ok');selectedId=next.id;await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});rail.append(b);}stageCard.append(rail);detail.append(stageCard);
    const checklist=await checklists.get('workOrder',row.id);const stats=await checklists.stats('workOrder',row.id);const cCard=el('div','os-checklist-card');const cHead=el('div','module-card-head');cHead.append(el('h3','','Checklist por etapa'),el('span','muted-small',`${stats.done}/${stats.total} · ${stats.pct}%`));cCard.append(cHead);const progress=el('div','progress-track');const fill=el('span','progress-fill');fill.style.width=`${stats.pct}%`;progress.append(fill);cCard.append(progress);
    const activeStage=row.stage==='entregue'?'entregue':(checklist.currentStage||row.stage||'entrada');const tabs=el('div','os-check-tabs');const itemsHost=el('div','os-check-items');
    async function renderItems(stageId){itemsHost.replaceChildren();for(const [index,itemRaw] of (checklist.stages?.[stageId]||[]).entries()){const item=typeof itemRaw==='boolean'?{label:`Item ${index+1}`,done:itemRaw}:itemRaw;const label=el('label','os-check-item');const cb=el('input');cb.type='checkbox';cb.checked=!!item.done;const text=el('span','',item.label||`Item ${index+1}`);label.append(cb,text);cb.addEventListener('change',async()=>{try{await checklists.setItem('workOrder',row.id,stageId,index,cb.checked);await refreshDetailOnly();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});itemsHost.append(label);}}
    for(const stage of WORKFLOW_STAGES){const tab=button(stage.label,'os-check-tab');if(stage.id===activeStage)tab.classList.add('active');tab.addEventListener('click',async()=>{await checklists.setCurrentStage('workOrder',row.id,stage.id);tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));tab.classList.add('active');await renderItems(stage.id);});tabs.append(tab);}cCard.append(tabs,itemsHost);detail.append(cCard);await renderItems(activeStage);
    const actions=el('div','row-actions os-actions');const reopen=button('Reabrir OS','btn');reopen.disabled=row.status!=='Entregue';const del=button('Excluir OS','btn btn-danger');actions.append(reopen,del);detail.append(actions);
    reopen.addEventListener('click',async()=>{try{await service.reopen(row.id);setFeedback(feedback,'OS reaberta na etapa Controle Final.','ok');await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
    del.addEventListener('click',async()=>{if(!window.confirm(`Excluir ${row.number||'esta OS'}? Agendamentos vinculados serão removidos e um backup preventivo será criado.`))return;try{await service.remove(row.id);selectedId=null;setFeedback(feedback,'OS excluída com backup preventivo.','ok');await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
  }

  function refBox(label,value){const box=el('div','os-ref-box');box.append(el('span','muted-small',label),el('strong','',String(value)));return box;}
  async function render(){listPane.replaceChildren(el('h2','','OS cadastradas'));const filtered=rows.filter(row=>!search.value||[row.number,row.clientName,row.vehicle,row.service].some(v=>String(v??'').toLocaleLowerCase('pt-BR').includes(search.value.toLocaleLowerCase('pt-BR'))));if(!filtered.length)listPane.append(el('p','empty-state','Nenhuma OS encontrada.'));else for(const row of filtered)listPane.append(listCard(row));const selected=rows.find(r=>String(r.id)===String(selectedId))||filtered[0]||null;if(selected&&!selectedId)selectedId=selected.id;await renderDetail(selected);}
  async function refreshDetailOnly(){rows=await service.list();await render();}
  async function refresh(){rows=await service.list();if(selectedId&&!rows.some(r=>String(r.id)===String(selectedId)))selectedId=null;await render();}
  search.addEventListener('input',render);refresh();return {refresh};
}
