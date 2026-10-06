import { el, button, labeledField, setFeedback } from '../../ui/dom.js';

export function renderCategoriasView(root, { service, onChanged = () => {} }) {
  root.replaceChildren();
  const page = el('section', 'simple-module');
  const head = el('div', 'module-toolbar');
  const title = el('div');
  title.append(el('h1', 'module-title', 'Categorias'), el('p', 'module-subtitle', 'Categorias por uso e grupo. Categorias fixas podem ser ocultadas sem apagar lançamentos.'));
  head.append(title);

  const feedback = el('div', 'module-feedback'); feedback.hidden = true;
  const body = el('div', 'module-body');
  const createCard = el('section', 'module-card');
  createCard.append(el('h2', '', 'Nova categoria'));
  const form = el('form', 'module-form-row');
  const name = el('input', 'mod-input'); name.placeholder = 'Nova categoria de receita ou despesa'; name.maxLength = 100;
  const group = el('select', 'mod-input');
  for (const [key, label] of Object.entries(service.groups)) { const o=el('option','',label); o.value=key; group.append(o); }
  const add = button('＋ Adicionar', 'btn btn-primary', 'submit');
  form.append(labeledField('Nome', name), labeledField('Grupo', group), add);
  createCard.append(form);
  const listCard = el('section', 'module-card');
  const listHead = el('div', 'module-card-head'); listHead.append(el('h2','', 'Categorias cadastradas'));
  const stats = el('span', 'muted-small'); listHead.append(stats); listCard.append(listHead);
  const list = el('div', 'category-list'); listCard.append(list);
  body.append(createCard, listCard);
  page.append(head, feedback, body); root.append(page);

  async function changed(message) { setFeedback(feedback, message, 'ok'); await refresh(); await onChanged(); }
  async function refresh() {
    const rows = await service.list({ includeHidden: true });
    stats.textContent = `${rows.length} categoria(s) · ${rows.filter(x=>x.hidden).length} oculta(s)`;
    list.replaceChildren();
    if (!rows.length) { list.append(el('p','empty-state','Nenhuma categoria disponível.')); return; }
    const groups = new Map();
    for (const row of rows) { const a=groups.get(row.group)||[]; a.push(row); groups.set(row.group,a); }
    for (const [groupKey, label] of Object.entries(service.groups)) {
      const items = groups.get(groupKey) || []; if (!items.length) continue;
      const section = el('section', 'category-group'); section.append(el('h3','category-group-title', label));
      for (const row of items) {
        const item = el('div', `category-row${row.hidden ? ' is-hidden' : ''}`);
        const info = el('div', 'category-info');
        info.append(el('strong','',row.name), el('span','muted-small',`${row.usage} uso(s) · ${row.builtin ? 'fixa' : row.custom ? 'personalizada' : 'referenciada'}${row.hidden ? ' · oculta' : ''}`));
        const select = el('select','mod-input category-group-select');
        for (const [key, groupLabel] of Object.entries(service.groups)) { const o=el('option','',groupLabel); o.value=key; o.selected=key===row.group; select.append(o); }
        select.disabled = row.hidden;
        select.addEventListener('change', async () => { try { await service.setGroup(row.name, select.value); await changed('Grupo atualizado.'); } catch(e){setFeedback(feedback,e.message,'error');} });
        const actions = el('div','row-actions');
        if (row.hidden) {
          const restore = button('Reativar','btn btn-small'); restore.addEventListener('click', async()=>{try{await service.restore(row.name);await changed('Categoria reativada.');}catch(e){setFeedback(feedback,e.message,'error');}}); actions.append(restore);
        } else {
          const rename = button('Renomear','btn btn-small'); rename.addEventListener('click', async()=>{ const next=window.prompt('Novo nome da categoria:',row.name); if(next==null)return; try{await service.rename(row.name,next);await changed('Categoria renomeada e referências atualizadas.');}catch(e){setFeedback(feedback,e.message,'error');} });
          const remove = button(row.builtin?'Ocultar':'Excluir','btn btn-small btn-danger'); remove.addEventListener('click', async()=>{ const msg=row.builtin?`Ocultar "${row.name}" das novas seleções? Os lançamentos existentes serão preservados.`:`Excluir a categoria personalizada "${row.name}"? Os lançamentos existentes serão preservados.`; if(!window.confirm(msg))return; try{await service.remove(row.name);await changed(row.builtin?'Categoria fixa ocultada.':'Categoria personalizada removida.');}catch(e){setFeedback(feedback,e.message,'error');} });
          actions.append(rename, remove);
        }
        item.append(info, select, actions); section.append(item);
      }
      list.append(section);
    }
  }

  form.addEventListener('submit', async event => { event.preventDefault(); try { await service.create(name.value, group.value); name.value=''; await changed('Categoria adicionada.'); } catch(e){setFeedback(feedback,e.message,'error');} });
  refresh();
  return { refresh };
}
