import { el, button, labeledField, setFeedback } from '../../ui/dom.js';

const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function input(type='text',className='mod-input'){const n=el('input',className);n.type=type;return n;}
function select(className='mod-input'){return el('select',className);}
function option(value,label){const o=el('option','',label);o.value=String(value??'');return o;}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function iso(y,m,d){return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function parseDate(v){if(!v)return null;const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?null:d;}

export function renderAgendaView(root,{service,onChanged}){
  const now=new Date();let year=now.getFullYear(),month=now.getMonth(),selectedDay=null;
  root.className='simple-module agenda-module';

  const toolbar=el('div','module-toolbar');
  const titleWrap=el('div');titleWrap.append(el('h1','module-title','Agenda'),el('p','module-subtitle','Agendamentos vinculados a OS, Cliente e Orçamento.'));
  const nav=el('div','module-toolbar-actions');const prev=button('‹ Mês','btn');const next=button('Mês ›','btn');const todayBtn=button('Hoje','btn');nav.append(prev,todayBtn,next);toolbar.append(titleWrap,nav);
  const feedback=el('div','module-feedback');feedback.hidden=true;
  const body=el('div','module-body agenda-body');

  const calendarCard=el('section','module-card agenda-calendar-card');
  const calHead=el('div','agenda-calendar-head');const monthLabel=el('h2','','');const countLabel=el('span','muted-small','');calHead.append(monthLabel,countLabel);
  const weekday=el('div','agenda-week-header');for(const name of WEEK)weekday.append(el('div','agenda-weekday',name));
  const grid=el('div','agenda-grid');calendarCard.append(calHead,weekday,grid);

  const formCard=el('section','module-card');formCard.append(el('h2','','Novo agendamento / gerar OS'));
  const form=el('form','agenda-form');
  const budgetSel=select();budgetSel.append(option('','Sem orçamento vinculado'));
  const clientSel=select();clientSel.append(option('','Selecione o cliente'));
  const vehicle=input();const serviceInput=input();const entry=input('date');const due=input('date');const value=input('number');value.step='0.01';value.min='0';const notes=el('textarea','mod-input');notes.rows=2;
  const save=button('Agendar e gerar OS','btn btn-primary','submit');
  const fields=el('div','agenda-form-grid');
  fields.append(labeledField('Orçamento',budgetSel),labeledField('Cliente',clientSel),labeledField('Veículo',vehicle),labeledField('Serviço',serviceInput),labeledField('Entrada',entry),labeledField('Entrega prevista',due),labeledField('Valor',value),labeledField('Observação',notes));
  form.append(fields,save);formCard.append(form);

  const listCard=el('section','module-card');const listHead=el('div','module-card-head');listHead.append(el('h2','','Serviços do período'),el('span','muted-small',''));const list=el('div','agenda-list');listCard.append(listHead,list);
  body.append(calendarCard,formCard,listCard);root.replaceChildren(toolbar,feedback,body);

  let currentRows=[];

  async function loadSelectors(){
    const [clients,budgets]=await Promise.all([service.clients(),service.budgets()]);
    const previousClient=clientSel.value,previousBudget=budgetSel.value;
    clientSel.replaceChildren(option('','Selecione o cliente'));
    for(const c of clients.sort((a,b)=>String(a.name??a.nome??'').localeCompare(String(b.name??b.nome??''),'pt-BR')))clientSel.append(option(c.id,c.name??c.nome??`Cliente ${c.id}`));
    budgetSel.replaceChildren(option('','Sem orçamento vinculado'));
    for(const b of budgets.slice().sort((a,b)=>String(b.data??b.createdAt??'').localeCompare(String(a.data??a.createdAt??''))))budgetSel.append(option(b.id,`${b.cliente??'Cliente'} · ${b.servico??b.descricao??'Serviço'} · ${money(b.total)}`));
    if([...clientSel.options].some(o=>o.value===previousClient))clientSel.value=previousClient;
    if([...budgetSel.options].some(o=>o.value===previousBudget))budgetSel.value=previousBudget;
  }

  function renderCalendar(){
    monthLabel.textContent=`${MONTHS[month]} ${year}`;grid.replaceChildren();
    const first=new Date(year,month,1).getDay();const days=new Date(year,month+1,0).getDate();const prevDays=new Date(year,month,0).getDate();
    const cells=[];for(let i=first-1;i>=0;i--)cells.push({day:prevDays-i,other:true,offset:-1});for(let d=1;d<=days;d++)cells.push({day:d,other:false,offset:0});while(cells.length%7)cells.push({day:cells.length-first-days+1,other:true,offset:1});
    for(const c of cells){
      const cell=button('','agenda-day');const targetMonth=month+c.offset;const date=new Date(year,targetMonth,c.day);const dateKey=date.toISOString().slice(0,10);cell.dataset.date=dateKey;if(c.other)cell.classList.add('other-month');if(selectedDay===dateKey)cell.classList.add('selected');
      if(date.toDateString()===new Date().toDateString())cell.classList.add('today');cell.append(el('span','agenda-day-num',String(c.day)));
      const rows=currentRows.filter(r=>r.date===dateKey);for(const row of rows.slice(0,3)){const dot=el('span',`agenda-dot${row.status==='Concluído'?' done':''}`,`${row.status==='Concluído'?'✓':'•'} ${String(row.clientName||'Cliente').split(' ')[0]}`);cell.append(dot);}if(rows.length>3)cell.append(el('span','agenda-more',`+${rows.length-3}`));
      cell.addEventListener('click',()=>{selectedDay=dateKey;entry.value=dateKey;renderCalendar();renderList();});grid.append(cell);
    }
  }

  function card(row){
    const wrap=el('article',`agenda-row${row.status==='Concluído'?' done':''}`);const info=el('div','agenda-row-info');
    info.append(el('strong','',row.clientName||'Cliente'),el('span','muted-small',`${row.vehicle||'Veículo não informado'} · ${row.service||'Serviço'}`),el('span','muted-small',`${row.date||'—'}${row.dueDate?` → ${row.dueDate}`:''} · ${row.time||''}`));
    const amount=el('strong','agenda-value',money(row.value));const actions=el('div','row-actions');
    const edit=button('Editar','btn btn-small');const done=button(row.status==='Concluído'?'Reabrir':'Entregue','btn btn-small');const del=button('Excluir','btn btn-small btn-danger');actions.append(edit,done,del);wrap.append(info,amount,actions);
    edit.addEventListener('click',async()=>{const dueNext=window.prompt('Entrega prevista (AAAA-MM-DD):',row.dueDate||'');if(dueNext===null)return;const obs=window.prompt('Observação:',row.notes||'');if(obs===null)return;try{await service.update(row.id,{dueDate:dueNext.trim(),notes:obs.trim()});setFeedback(feedback,'Agendamento atualizado.','ok');await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
    done.addEventListener('click',async()=>{try{if(row.status==='Concluído')await service.reopen(row.id);else await service.markDone(row.id);setFeedback(feedback,row.status==='Concluído'?'Serviço reaberto.':'OS marcada como entregue. Sincronização financeira ficou pendente para a Fase 7.','ok');await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
    del.addEventListener('click',async()=>{if(!window.confirm(`Excluir o agendamento de ${row.clientName||'Cliente'}? A OS vinculada será mantida.`))return;try{await service.remove(row.id);setFeedback(feedback,'Agendamento removido com backup preventivo.','ok');await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
    return wrap;
  }

  function renderList(){
    list.replaceChildren();let rows=currentRows;if(selectedDay)rows=rows.filter(r=>r.date===selectedDay);listHead.lastElementChild.textContent=selectedDay?`${rows.length} em ${selectedDay}`:`${rows.length} no mês`;
    if(!rows.length){list.append(el('p','empty-state','Nenhum serviço neste período.'));return;}for(const row of rows)list.append(card(row));
  }

  async function refresh(){currentRows=await service.list({year,month});countLabel.textContent=`${currentRows.length} agendamento(s)`;await loadSelectors();renderCalendar();renderList();}

  budgetSel.addEventListener('change',async()=>{if(!budgetSel.value)return;const ctx=await service.budgetContext(budgetSel.value);if(!ctx)return;if(ctx.client?.id!=null)clientSel.value=String(ctx.client.id);vehicle.value=ctx.budget.veiculo??'';serviceInput.value=ctx.budget.servico??ctx.budget.descricao??'';value.value=Number(ctx.budget.total??0)||'';});
  form.addEventListener('submit',async ev=>{ev.preventDefault();try{const row=await service.create({budgetId:budgetSel.value||null,clientId:clientSel.value||null,vehicle:vehicle.value,service:serviceInput.value,date:entry.value,dueDate:due.value,value:value.value,notes:notes.value});setFeedback(feedback,`Agendamento criado e vinculado à OS ${row.workOrderId}.`,'ok');form.reset();await refresh();onChanged?.();}catch(e){setFeedback(feedback,e.message,'error');}});
  prev.addEventListener('click',()=>{month--;if(month<0){month=11;year--;}selectedDay=null;refresh();});next.addEventListener('click',()=>{month++;if(month>11){month=0;year++;}selectedDay=null;refresh();});todayBtn.addEventListener('click',()=>{const d=new Date();year=d.getFullYear();month=d.getMonth();selectedDay=d.toISOString().slice(0,10);refresh();});

  refresh();return {refresh};
}
