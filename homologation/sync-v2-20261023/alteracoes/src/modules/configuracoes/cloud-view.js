import {el,button,labeledField} from '../../ui/dom.js';
import {downloadJson} from '../../data/backup-service.js';

export function renderCloudSettings(host,cloud){
  const card=el('section','module-card cloud-settings');card.append(el('h2','','☁️ Sincronização e cópias na nuvem'));
  const status=el('p','module-feedback');status.setAttribute('role','status');
  const help=el('p','muted-small','Entre com o mesmo acesso da oficina no PC e no celular. Esta tela confere somente este aparelho com a nuvem; não confirma que o outro aparelho já recebeu. Confira o mesmo ambiente e a mesma revisão nos dois. Dados desta homologação ficam separados da produção.');
  const form=el('form','config-form');const email=el('input','mod-input'),password=el('input','mod-input');email.type='email';email.autocomplete='username';password.type='password';password.autocomplete='current-password';password.minLength=8;email.required=password.required=true;
  const login=button('Entrar','btn btn-primary','submit'),register=button('Criar acesso','btn');form.append(labeledField('E-mail de acesso à nuvem',email),labeledField('Senha de acesso à nuvem',password),login,register);
  const actions=el('div','budget-action-grid');
  const send=button('Usar este aparelho como origem','btn'),receive=button('Receber dados da nuvem','btn'),sync=button('Sincronizar agora','btn'),pause=button('Pausar sincronização','btn'),signout=button('Sair neste aparelho','btn'),versions=button('Consultar cópias na nuvem','btn'),localCopies=button('Cópias locais preventivas','btn');
  const compare=button('Comparar alterações em conflito','btn');
  const resume=button('Retomar sincronização','btn');resume.addEventListener('click',()=>run(()=>cloud.resume()));
  actions.append(send,receive,sync,pause,resume,signout,versions,localCopies,compare);const copies=el('div','cloud-copies');
  card.append(help,status,form,actions,el('p','muted-small','Após ativar: sincroniza dados salvos a cada 30 segundos, com o aplicativo aberto e conectado. Alterações divergentes pedem revisão. Cada envio aceito cria uma cópia versionada. Limites desta integração: 8 MiB por envio e 64 MiB de cópias por conta; ao atingir o limite, o envio para e avisa. As cópias ficam no mesmo projeto Supabase e não substituem uma cópia externa. Nenhum backup é apagado automaticamente.'),copies);host.append(card);
  let unsubscribe;
  const messages={'checking':'Conferindo conteúdo local e remoto…','unsaved-local':'Formulário alterado. Salve antes de sincronizar.','local-pending':'Alterações salvas; aguardando confirmação da nuvem.','remote-changed':'A nuvem mudou durante a conferência. Sincronize novamente.','restored-pending-upload':'Registros ausentes recuperados. Envio pendente.','offline-queued':'Sem conexão. Alterações salvas estão na fila local.','merged-pending-upload':'Registros diferentes foram combinados localmente. Envio pendente.','signed-out':'Entre para configurar a nuvem.','disabled':'Sincronização pausada neste aparelho.','ready':'Pronto para sincronizar.','initial-choice-required':'Escolha o aparelho de origem ou receba a cópia da nuvem.','synced':'Conteúdo deste aparelho conferido com a nuvem.','uploaded':'Envio e conteúdo na nuvem conferidos.','downloaded':'Recebimento e conteúdo na nuvem conferidos.','conflict':'PC e celular têm alterações diferentes. Nada foi sobrescrito. Exporte as duas cópias antes de escolher qual usar.','waiting-for-editor':'Há dados novos na nuvem. Receba-os depois de salvar o formulário.','waiting-for-local-write':'Dados locais mudaram. A sincronização será tentada novamente.','error':'Não foi possível sincronizar.'};
  unsubscribe=cloud.subscribe(s=>{
    status.textContent=[messages[s.phase]??s.phase,s.email,`Ambiente: ${s.namespace} · ${s.build}`,s.verifiedRevision!==null?`Última revisão conferida: ${s.verifiedRevision} · ${s.budgetCount} orçamento(s)`:'',s.lastSync?`Última conferência: ${new Date(s.lastSync).toLocaleString('pt-BR')}`:'',s.lastError].filter(Boolean).join(' · ');
    form.hidden=!!s.email;actions.hidden=!s.email;
    for(const b of card.querySelectorAll('button'))b.disabled=s.busy;
  });
  async function run(fn){try{await fn();}catch(e){status.textContent=e.message;}}
  form.addEventListener('submit',e=>{e.preventDefault();const secret=password.value;password.value='';run(()=>cloud.signIn(email.value.trim(),secret));});
  register.addEventListener('click',()=>{if(!form.reportValidity())return;const secret=password.value;password.value='';run(async()=>{const r=await cloud.register(email.value.trim(),secret);if(r.confirmationRequired)status.textContent='Acesso solicitado. Confirme o e-mail recebido e volte para entrar com a senha. Não é a senha do GitHub.';});});
  send.addEventListener('click',()=>run(async()=>{if(!window.confirm('Publicar os dados salvos deste aparelho no projeto privado da oficina? Isso inicia a sincronização e o backup na nuvem. Só é permitido quando ainda não há uma cópia remota.'))return;await cloud.activate('send');}));
  receive.addEventListener('click',()=>run(async()=>{if(!window.confirm('Receber a cópia da nuvem e substituir os dados salvos deste aparelho? Uma cópia local preventiva será guardada. Alterações ainda não salvas no formulário serão descartadas.'))return;await cloud.activate('receive');}));
  sync.addEventListener('click',()=>run(()=>cloud.tick()));pause.addEventListener('click',()=>run(()=>cloud.pause()));signout.addEventListener('click',()=>run(()=>cloud.signOut()));
  compare.addEventListener('click',()=>run(async()=>{
    const review=await cloud.inspectConflicts();copies.replaceChildren(el('h3','','Comparação de registros'));
    if(!review.conflicts.length){copies.append(el('p','','Nenhum conflito por registro. Sincronize para combinar alterações independentes.'));return;}
    const choices={};
    for(const c of review.conflicts){
      const item=el('section','module-card');item.append(el('h4','',`${c.collection} · ${c.key} · ${c.reason}`));
      const selectable=['concurrent-edit','concurrent-create','delete-versus-edit'].includes(c.reason)&&!['transactions','accounts','workOrders','appointments','stock','checklists','recurringTemplates'].includes(c.collection)&&!c.base?.approval&&!c.local?.approval&&!c.remote?.approval;
      if(c.reason==='duplicate-document-number'){
        item.append(el('p','','Dois orçamentos usam este número. Confira se o número local já foi enviado ao cliente. A opção de manter ambos atribui outro número ao orçamento deste aparelho e cria uma cópia preventiva. Orçamentos aprovados ou vinculados exigem revisão manual.'));
        const choice=el('select','mod-input');for(const [value,label] of [['','Selecione uma opção'],['keep-both','Manter os dois e dar novo número ao deste aparelho'],['remote','Manter orçamento da nuvem e preservar cópia local']]){const option=el('option','',label);option.value=value;choice.append(option);}choice.addEventListener('change',()=>{choices[`budgets/${c.key}`]=choice.value;});item.append(choice);
      }else if(selectable){
        const description=value=>value===null?'Registro excluído':JSON.stringify(value,(_k,v)=>typeof v==='string'&&v.length>250?v.slice(0,250)+'… [conteúdo abreviado]':v,2).slice(0,4500);
        item.append(el('p','muted-small','Prévia abreviada. A escolha conserva o registro completo, incluindo fotos. Exporte as cópias para examinar o conteúdo integral.'));
        item.append(el('pre','cloud-record-preview',`Este aparelho:\n${description(c.local)}\n\nNuvem:\n${description(c.remote)}`));
        const choice=el('select','mod-input');for(const [value,label]of [['','Selecione a versão'],['local','Manter versão deste aparelho'],['remote','Manter versão da nuvem']]){const option=el('option','',label);option.value=value;choice.append(option);}
        choice.addEventListener('change',()=>{choices[`${c.collection}/${c.key}`]=choice.value;});item.append(choice);
      }else item.append(el('p','',c.reason==='unconfirmed-removal'?'Um orçamento desapareceu sem registro de lixeira ou arquivamento. O envio/recebimento foi bloqueado. Preserve as cópias e recupere o registro antes de continuar.':'Este conflito envolve vínculos, aprovação ou numeração. Revise no módulo de origem; nenhuma substituição automática será feita.'));
      copies.append(item);
    }
    const apply=button('Aplicar escolhas e preservar cópia anterior','btn');apply.addEventListener('click',()=>run(async()=>{if(!window.confirm('Aplicar as versões escolhidas? Registros sem conflito serão preservados. Uma cópia local preventiva será guardada.'))return;await cloud.resolveConflicts(review,choices);}));copies.append(apply);
  }));
  versions.addEventListener('click',()=>run(async()=>{const rows=await cloud.listVersions();copies.replaceChildren(el('h3','','Cópias versionadas na nuvem'));if(!rows.length)copies.append(el('p','','Nenhuma cópia enviada.'));for(const r of rows){const row=el('div','cloud-copy-row',`Revisão ${r.revision} · ${new Date(r.created_at).toLocaleString('pt-BR')}`),download=button('Baixar JSON','btn btn-small');download.addEventListener('click',()=>run(async()=>downloadJson(await cloud.downloadVersion(r.revision),`OficinaOS-nuvem-revisao-${r.revision}.json`)));const restore=button('Prévia de recuperação','btn btn-small');restore.addEventListener('click',()=>run(async()=>{
 const historical=await cloud.downloadVersion(r.revision),plan=await cloud.previewRestore(historical);copies.replaceChildren(el('h3','','Recuperar registros ausentes'));
 copies.append(el('p','','Esta recuperação não substitui registros atuais nem reverte pagamentos, estoque, execução ou aprovações. Para recuperação integral, baixe o JSON e faça uma conferência separada.'));
 const selected=new Set();for(const item of plan.items){const line=el('div','cloud-copy-row',`${item.collection} · ${item.id} · ${item.reason}`);if(item.eligible){const check=el('input','');check.type='checkbox';check.addEventListener('change',()=>{if(check.checked)selected.add(item.key);else selected.delete(item.key);});line.append(labeledField('Recuperar este registro',check));}copies.append(line);}
 if(!plan.items.length)copies.append(el('p','','Nenhum registro diferente disponível nesta cópia.'));
 const apply=button('Recuperar selecionados com cópia preventiva','btn');apply.addEventListener('click',()=>run(async()=>{if(!window.confirm('Recuperar somente os registros ausentes selecionados, preservando os atuais?'))return;await cloud.restoreMissing(historical,[...selected],plan.identity);}));copies.append(apply);
}));row.append(download,restore);copies.append(row);}}));
  localCopies.addEventListener('click',()=>run(async()=>{const rows=await cloud.localBackups();copies.replaceChildren(el('h3','','Cópias preventivas deste aparelho'));if(!rows.length)copies.append(el('p','','Nenhuma cópia preventiva.'));for(const r of rows){const row=el('div','cloud-copy-row',new Date(r.createdAt).toLocaleString('pt-BR')),download=button('Baixar JSON','btn btn-small');download.addEventListener('click',()=>run(async()=>downloadJson(await cloud.readLocalBackup(r.id),`OficinaOS-copia-local-${r.id}.json`)));row.append(download);copies.append(row);}}));
  return {dispose:()=>unsubscribe?.()};
}
