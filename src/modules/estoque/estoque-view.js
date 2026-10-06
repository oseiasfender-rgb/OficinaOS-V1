import { formatBRL } from '../../core/money.js';
import { el, button, labeledField, setFeedback } from '../../ui/dom.js';

const STOCK_CATEGORIES = Object.freeze({funil:'Funilaria',solda:'Solda',prep:'Preparação',masc:'Mascaramento',pint:'Pintura',polit:'Polimento',limp:'Limpeza',outros:'Outros'});
const UNITS = Object.freeze(['Un','Kg','L','Rolo','Caixa','Bobina']);

function input(type='text') { const x=el('input','mod-input'); x.type=type; return x; }
function option(value,label){const x=el('option','',label);x.value=value;return x;}

export function renderEstoqueView(root, { service, onChanged = () => {} }) {
  root.replaceChildren();
  let editingId = null;
  const page=el('section','simple-module');
  const head=el('div','module-toolbar'); const titles=el('div'); titles.append(el('h1','module-title','Estoque'),el('p','module-subtitle','Materiais reais da oficina. A lista padrão só é adicionada por ação explícita.'));
  const headActions=el('div','module-toolbar-actions'); const loadDefaults=button(`Carregar lista padrão (${service.defaultCount})`,'btn'); headActions.append(loadDefaults); head.append(titles,headActions);
  const feedback=el('div','module-feedback'); feedback.hidden=true;
  const body=el('div','module-body');
  const metrics=el('div','module-metrics');
  const mTotal=metric('Itens'); const mLow=metric('Baixo estoque'); const mZero=metric('Zerados'); const mValue=metric('Valor estimado'); metrics.append(mTotal.card,mLow.card,mZero.card,mValue.card);

  const controls=el('section','module-card'); controls.append(el('h2','', 'Pesquisar e filtrar'));
  const filters=el('div','module-form-row'); const search=input(); search.placeholder='Buscar material, categoria ou fornecedor'; const filter=el('select','mod-input'); filter.append(option('todos','Todos'),option('baixo','Baixo estoque'),option('zero','Zerados'));
  filters.append(labeledField('Busca',search),labeledField('Status',filter)); controls.append(filters);

  const editor=el('section','module-card'); const editorTitle=el('h2','', 'Cadastrar material'); editor.append(editorTitle);
  const form=el('form','stock-form');
  const name=input(); name.required=true; const category=el('select','mod-input'); Object.entries(STOCK_CATEGORIES).forEach(([v,l])=>category.append(option(v,l)));
  const unit=el('select','mod-input'); UNITS.forEach(v=>unit.append(option(v,v)));
  const qty=input('number'); qty.min='0';qty.step='0.01';qty.value='0'; const cost=input('number');cost.min='0';cost.step='0.01';cost.value='0'; const min=input('number');min.min='0';min.step='0.01';min.value='1'; const supplier=input();
  const formGrid=el('div','stock-form-grid'); formGrid.append(labeledField('Material',name),labeledField('Categoria',category),labeledField('Unidade',unit),labeledField('Quantidade',qty),labeledField('Custo unitário',cost),labeledField('Estoque mínimo',min),labeledField('Fornecedor',supplier));
  const formActions=el('div','row-actions'); const save=button('Salvar material','btn btn-primary','submit'); const cancel=button('Cancelar edição','btn');cancel.hidden=true; formActions.append(save,cancel); form.append(formGrid,formActions); editor.append(form);

  const listCard=el('section','module-card'); const listHead=el('div','module-card-head'); const listCount=el('span','muted-small'); listHead.append(el('h2','','Itens do estoque'),listCount); const list=el('div','stock-list'); listCard.append(listHead,list);
  body.append(metrics,controls,editor,listCard); page.append(head,feedback,body); root.append(page);

  function metric(label){const card=el('article','module-metric');const value=el('strong','module-metric-value','0');card.append(el('span','module-metric-label',label),value);return{card,value};}
  function resetForm(){editingId=null;editorTitle.textContent='Cadastrar material';save.textContent='Salvar material';cancel.hidden=true;name.value='';category.value='outros';unit.value='Un';qty.value='0';cost.value='0';min.value='1';supplier.value='';}
  async function changed(message){setFeedback(feedback,message,'ok');resetForm();await refresh();await onChanged();}
  async function edit(row){editingId=row.id;editorTitle.textContent='Editar material';save.textContent='Salvar alterações';cancel.hidden=false;name.value=row.nome||row.name||'';category.value=row.cat||row.category||'outros';unit.value=row.unid||'Un';qty.value=row.qty??0;cost.value=row.custo??row.cost??row.unit??0;min.value=row.minimo??row.minQty??1;supplier.value=row.forn||'';editor.scrollIntoView({behavior:'smooth',block:'start'});}
  async function refresh(){
    const [summary,rows]=await Promise.all([service.summary(),service.list({search:search.value,filter:filter.value})]);
    mTotal.value.textContent=summary.total;mLow.value.textContent=summary.low;mZero.value.textContent=summary.zero;mValue.value.textContent=formatBRL(summary.value);listCount.textContent=`${rows.length} item(ns)`;list.replaceChildren();
    if(!rows.length){list.append(el('p','empty-state','Nenhum material corresponde ao filtro.'));return;}
    for(const row of rows){const card=el('article','stock-row');const info=el('div','stock-info');const status=row.qty<=0?'zerado':row.qty<=row.minimo?'baixo':'ok';info.append(el('strong','',row.nome),el('span','muted-small',`${STOCK_CATEGORIES[row.cat]||row.cat} · ${row.forn||'sem fornecedor'} · mínimo ${row.minimo} ${row.unid}`));const quantities=el('div','stock-qty');quantities.append(el('strong',`stock-status ${status}`,`${row.qty} ${row.unid}`),el('span','muted-small',formatBRL(row.custo)+' / un.'));
      const actions=el('div','row-actions'); const minus=button('−','btn btn-small');const plus=button('+','btn btn-small');const editBtn=button('Editar','btn btn-small');const del=button('Excluir','btn btn-small btn-danger');
      minus.addEventListener('click',async()=>{try{await service.adjustQuantity(row.id,-1);await changed('Quantidade atualizada.');}catch(e){setFeedback(feedback,e.message,'error');}});plus.addEventListener('click',async()=>{try{await service.adjustQuantity(row.id,1);await changed('Quantidade atualizada.');}catch(e){setFeedback(feedback,e.message,'error');}});editBtn.addEventListener('click',()=>edit(row));del.addEventListener('click',async()=>{if(!window.confirm(`Excluir "${row.nome}" do estoque? Uma cópia preventiva será criada.`))return;try{await service.remove(row.id);await changed('Material removido.');}catch(e){setFeedback(feedback,e.message,'error');}});actions.append(minus,plus,editBtn,del);card.append(info,quantities,actions);list.append(card);}
  }
  form.addEventListener('submit',async event=>{event.preventDefault();const payload={nome:name.value,cat:category.value,unid:unit.value,qty:qty.value,custo:cost.value,minimo:min.value,forn:supplier.value};try{if(editingId==null)await service.create(payload);else await service.update(editingId,payload);await changed(editingId==null?'Material cadastrado.':'Material atualizado.');}catch(e){setFeedback(feedback,e.message,'error');}});
  cancel.addEventListener('click',resetForm);search.addEventListener('input',()=>refresh());filter.addEventListener('change',()=>refresh());loadDefaults.addEventListener('click',async()=>{if(!window.confirm('Adicionar os materiais padrão preservando todos os itens atuais? Nada será carregado automaticamente.'))return;try{const r=await service.loadDefaultList();await changed(r.added?`${r.added} materiais padrão adicionados.`:'Todos os materiais padrão já estavam presentes.');}catch(e){setFeedback(feedback,e.message,'error');}});
  resetForm();refresh();return{refresh};
}
