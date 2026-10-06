import { el, button, labeledField, setFeedback } from '../../ui/dom.js';

function input(type='text'){const x=el('input','mod-input');x.type=type;return x;}

export function renderConfiguracoesView(root,{service,onChanged=()=>{}}){
  root.replaceChildren();const page=el('section','simple-module');const head=el('div','module-toolbar');const title=el('div');title.append(el('h1','module-title','Configurações'),el('p','module-subtitle','Dados reais da oficina. Nenhum valor de demonstração é inserido automaticamente.'));head.append(title);const feedback=el('div','module-feedback');feedback.hidden=true;const body=el('div','module-body');const card=el('section','module-card');card.append(el('h2','','Identificação da oficina'));const form=el('form','config-form');
  const fields={nome:input(),dono:input(),cnpj:input(),cidade:input(),pix:input(),fone:input(),banco:input(),bancoLink:input('url')};
  fields.nome.required=true;fields.dono.required=true;fields.bancoLink.placeholder='https://...';
  const grid=el('div','config-grid');grid.append(labeledField('Nome da oficina',fields.nome),labeledField('Proprietário',fields.dono),labeledField('CNPJ / CPF',fields.cnpj),labeledField('Cidade',fields.cidade),labeledField('Chave Pix',fields.pix),labeledField('Telefone',fields.fone),labeledField('Banco',fields.banco),labeledField('Link do banco',fields.bancoLink));const save=button('Salvar configurações','btn btn-primary','submit');form.append(grid,save);card.append(form);body.append(card);page.append(head,feedback,body);root.append(page);
  async function refresh(){const cfg=await service.getOfficeConfig();for(const [key,node] of Object.entries(fields))node.value=cfg[key]||'';}
  form.addEventListener('submit',async e=>{e.preventDefault();try{const cfg=Object.fromEntries(Object.entries(fields).map(([k,node])=>[k,node.value]));const saved=await service.saveOfficeConfig(cfg);document.title=`${saved.nome} — OficinaOS`;setFeedback(feedback,'Configurações salvas.','ok');await onChanged();}catch(err){setFeedback(feedback,err.message,'error');}});refresh();return{refresh};
}
