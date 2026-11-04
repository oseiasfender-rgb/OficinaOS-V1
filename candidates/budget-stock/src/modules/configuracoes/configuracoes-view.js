import {renderCloudSettings} from './cloud-view.js';
import {preparePhoto} from '../documentos/local-photo.js';
import {el,button,labeledField,setFeedback} from '../../ui/dom.js';

function input(type='text'){const node=el('input','mod-input');node.type=type;return node;}

export function renderConfiguracoesView(root,{service,cloud,onChanged=()=>{}}){
  root.replaceChildren();
  const page=el('section','simple-module'),head=el('div','module-toolbar'),title=el('div');
  title.append(el('h1','module-title','Configurações'),el('p','module-subtitle','Dados reais da oficina. Nenhum valor de demonstração é inserido automaticamente.'));head.append(title);
  const feedback=el('div','module-feedback');feedback.hidden=true;
  const body=el('div','module-body'),card=el('section','module-card');card.append(el('h2','','Identificação da oficina'));
  const form=el('form','config-form');let logo='',dirty=false,preparing=false,saving=false,loadVersion=0;
  const logoFile=input('file');logoFile.accept='image/jpeg,image/png';
  const logoPreview=el('img');logoPreview.style.cssText='max-width:160px;max-height:100px;object-fit:contain';logoPreview.alt='Logo da oficina';logoPreview.hidden=true;
  const removeLogo=button('Remover logo','btn');
  const fields={nome:input(),subtitulo:input(),endereco:input(),dono:input(),cnpj:input(),cidade:input(),pix:input(),fone:input(),banco:input(),bancoLink:input('url')};
  fields.nome.required=true;fields.dono.required=true;fields.bancoLink.placeholder='https://...';
  const grid=el('div','config-grid');
  for(const [key,label] of [['nome','Nome da oficina'],['subtitulo','Subtítulo comercial'],['endereco','Endereço'],['dono','Proprietário'],['cnpj','CNPJ / CPF'],['cidade','Cidade'],['pix','Chave Pix'],['fone','Telefone'],['banco','Banco'],['bancoLink','Link do banco']])grid.append(labeledField(label,fields[key]));
  const save=button('Salvar configurações','btn btn-primary','submit'),discard=button('Descartar alterações','btn');discard.hidden=true;
  form.append(labeledField('Logo da oficina (JPEG/PNG)',logoFile),logoPreview,removeLogo,grid,save,discard);card.append(form);body.append(card);page.append(head,feedback,body);root.append(page);
  let cloudView;if(cloud?.state)cloudView=renderCloudSettings(body,cloud);else if(cloud?.unavailable)body.append(el('p','module-feedback','Nuvem indisponível: '+cloud.unavailable));
  function showLogo(){logoPreview.hidden=!logo;if(logo)logoPreview.src=logo;else logoPreview.removeAttribute('src');}
  function markDirty(){dirty=true;discard.hidden=false;setFeedback(feedback,'Alterações não salvas. O rascunho será preservado ao trocar de aba. Salve ou descarte antes de receber dados da nuvem.');}
  function busy(){for(const node of form.querySelectorAll('input,button'))node.disabled=preparing||saving;}
  form.addEventListener('input',markDirty);
  logoFile.addEventListener('change',async()=>{
    if(!logoFile.files[0])return;markDirty();preparing=true;busy();
    try{const prepared=await preparePhoto(logoFile.files[0]);if(prepared.length>2500000)throw Error('Logo muito grande após compressão. Escolha outra imagem.');logo=prepared;showLogo();}
    catch(error){logoFile.value='';setFeedback(feedback,error.message,'error');}
    finally{preparing=false;busy();}
  });
  removeLogo.addEventListener('click',()=>{logo='';logoFile.value='';showLogo();markDirty();});
  async function refresh(force=false){
    if((dirty||preparing||saving)&&force!==true)return;
    const version=++loadVersion,cfg=await service.getOfficeConfig();
    if(version!==loadVersion||dirty||preparing||saving)return;
    logo=cfg.logo||'';showLogo();for(const [key,node] of Object.entries(fields))node.value=cfg[key]||'';
  }
  discard.addEventListener('click',async()=>{
    if(preparing||saving||!window.confirm('Descartar as alterações não salvas das configurações?'))return;
    dirty=false;discard.hidden=true;logoFile.value='';await refresh(true);setFeedback(feedback,'Alterações descartadas. O cadastro salvo foi mantido.','ok');await onChanged();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(preparing||saving)return;saving=true;busy();
    try{
      const cfg=Object.fromEntries(Object.entries(fields).map(([key,node])=>[key,node.value]));
      const saved=await service.saveOfficeConfig({...cfg,logo});dirty=false;discard.hidden=true;logoFile.value='';
      document.title=`${saved.nome} — OficinaOS`;setFeedback(feedback,'Configurações salvas.','ok');await onChanged();
    }catch(error){setFeedback(feedback,error.message,'error');}
    finally{saving=false;busy();}
  });
  const beforeUnload=event=>{if(dirty||preparing||saving){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);refresh().catch(error=>setFeedback(feedback,error.message,'error'));
  return {refresh,canApplyRemote:()=>!dirty&&!preparing&&!saving,dispose:()=>{window.removeEventListener('beforeunload',beforeUnload);cloudView?.dispose();}};
}
