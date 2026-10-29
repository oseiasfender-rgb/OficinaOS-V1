import {createClient} from '@supabase/supabase-js';
import {createSyncEngine} from './sync-engine.js';
import {createLocalSyncAdapter,createDeviceMetadata} from './local-adapter.js';
import {createSupabaseTransport} from './supabase-transport.js';
import {CLOUD_PROJECT} from './project-config.js';
import {createAuthStorage} from './auth-storage.js';

export async function createCloudService({db,onApplied=()=>{},canApply=()=>false}){
  const metadata=await createDeviceMetadata();
  const authStorage=await createAuthStorage({namespace:CLOUD_PROJECT.namespace});
  const client=createClient(CLOUD_PROJECT.url,CLOUD_PROJECT.publishableKey,{auth:{storage:authStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:`oficinaos-auth:${CLOUD_PROJECT.namespace}`}});
  const subscribers=new Set();
  let reviewStarted=false;
  let session=null,engine=null,enabled=false,edited=false,phase='signed-out',lastSync=null,lastError='',busy=false,verifiedRevision=null,budgetCount=null;
  const trackEdit=event=>{if(!event.target?.closest?.('.cloud-settings,[data-sync-read-only]')){edited=true;if(session&&enabled){phase='unsaved-local';publish();}}};
  document.addEventListener('input',trackEdit,true);
  document.addEventListener('change',trackEdit,true);
  // Login itself doesn't authorize uploading the device's database. Enrollment
  // has its own explicit source/receive choice in the settings panel.
  const local=createLocalSyncAdapter({db,canApply:()=>!edited&&canApply()&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,select,textarea'),onApplied:async()=>{edited=false;await onApplied();window.dispatchEvent(new Event('oficinaos:cloud-applied'));}});
  const remote=createSupabaseTransport({url:CLOUD_PROJECT.url,publishableKey:CLOUD_PROJECT.publishableKey,getSession:async()=>{
    const {data,error}=await client.auth.getSession();if(error)throw error;return data.session;
  }});
  function state(){return {phase,enabled,email:session?.user?.email??'',namespace:CLOUD_PROJECT.namespace,lastSync,lastError,busy,verifiedRevision,budgetCount,build:'estoque-20261028-r1-fix5'};}
  function publish(){for(const fn of subscribers)fn(state());}
  async function configure(next){
    session=next;lastSync=null;verifiedRevision=null;budgetCount=null;
    if(!session){engine=null;enabled=false;phase='signed-out';publish();return;}
    const preferences=await metadata.get(`enabled:${session.user.id}:${CLOUD_PROJECT.namespace}`);
    enabled=preferences===true;
    if(!reviewStarted){reviewStarted=true;enabled=false;await metadata.set(`enabled:${session.user.id}:${CLOUD_PROJECT.namespace}`,false);}
    engine=createSyncEngine({local,remote,metadata,userId:session.user.id,namespace:CLOUD_PROJECT.namespace,onState:r=>{
      phase=r.status;if(r.verified){lastSync=new Date().toISOString();verifiedRevision=r.revision;budgetCount=r.budgetCount;}publish();
    }});
    phase=enabled?'ready':'disabled';publish();
  }
  const initial=await client.auth.getSession();
  if(initial.error){lastError='Não foi possível recuperar a sessão. Entre novamente.';}
  await configure(initial.data.session);
  client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>configure(next).catch(e=>{lastError=e.message;publish();}),0);});
  async function task(fn){if(busy)throw Error('Aguarde a operação em andamento.');busy=true;lastError='';publish();try{return await fn();}catch(e){lastError=e.message;phase='error';throw e;}finally{busy=false;publish();}}
  async function tick(){if(!enabled||!engine||busy)return;return task(async()=>{phase='checking';publish();await engine.checkpoint();if(navigator.onLine===false){phase='offline-queued';publish();return;}return engine.tick();});}
  const interval=setInterval(()=>tick().catch(()=>{}),30000);
  window.addEventListener('online',()=>tick().catch(()=>{}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick().catch(()=>{});});
  async function activate(direction){
    if(!engine||!session)throw Error('Entre na conta da oficina.');
    return task(async()=>{
      const result=direction==='send'?await engine.enrollFromLocal():await engine.enrollFromCloud();
      enabled=true;await metadata.set(`enabled:${session.user.id}:${CLOUD_PROJECT.namespace}`,true);publish();return result;
    });
  }
  return Object.freeze({
    state,subscribe:fn=>{subscribers.add(fn);fn(state());return()=>subscribers.delete(fn);},
    async signIn(email,password){return task(async()=>{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw Error('Não foi possível entrar. Confira e-mail, senha e confirmação do acesso.');await configure(data.session);});},
    async signOut(){return task(async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Falha ao sair.');await configure(null);});},
    async register(email,password){return task(async()=>{const {data,error}=await client.auth.signUp({email,password});if(error)throw Error('Não foi possível criar o acesso. Confira os dados e as regras de senha.');if(data.session)await configure(data.session);return {confirmationRequired:!data.session};});},
    tick,activate,markSaved:()=>{edited=false;if(session&&enabled){phase='local-pending';publish();}queueMicrotask(()=>tick().catch(()=>{}));},
    async inspectConflicts(){if(!engine)throw Error('Entre na conta.');return task(()=>engine.inspectConflicts());},
    async resolveConflicts(review,choices){if(!engine)throw Error('Entre na conta.');return task(()=>engine.resolveConflicts(review,choices));},
    async previewRestore(historical){if(!engine)throw Error('Entre na conta.');return task(()=>engine.previewRestore(historical));},
    async restoreMissing(historical,selected,identity){if(!engine)throw Error('Entre na conta.');return task(()=>engine.restoreMissing(historical,selected,identity));},
    async pause(){if(session)await metadata.set(`enabled:${session.user.id}:${CLOUD_PROJECT.namespace}`,false);enabled=false;phase='disabled';publish();},
    async resume(){if(!session||!engine)throw Error('Entre na conta.');if(!await metadata.get(`${session.user.id}:${CLOUD_PROJECT.namespace}`))throw Error('Escolha primeiro a origem ou receba a cópia inicial.');enabled=true;await metadata.set(`enabled:${session.user.id}:${CLOUD_PROJECT.namespace}`,true);phase='ready';publish();return tick();},
    // Receiving a conflicting remote copy is an explicit choice. The local
    // adapter first saves the complete local snapshot for recovery.
    async receive(){if(!engine)throw Error('Entre na conta.');return task(()=>engine.enrollFromCloud());},
    async listVersions(){
      if(!session)throw Error('Entre na conta.');
      const {data,error}=await client.from('oficinaos_sync_versions').select('revision,created_at').eq('namespace',CLOUD_PROJECT.namespace).order('revision',{ascending:false}).limit(100);
      if(error)throw Error('Não foi possível consultar as cópias.');return data;
    },
    async downloadVersion(revision){
      if(!session)throw Error('Entre na conta.');
      const {data,error}=await client.from('oficinaos_sync_versions').select('payload').eq('namespace',CLOUD_PROJECT.namespace).eq('revision',revision).single();
      if(error)throw Error('Não foi possível baixar esta cópia.');return data.payload;
    },
    async localBackups(){
      return new Promise((resolve,reject)=>{const req=db.transaction('backups').objectStore('backups').getAll();req.onsuccess=()=>resolve(req.result.filter(x=>String(x.id).startsWith('cloud_')).map(x=>({id:x.id,createdAt:x.createdAt})));req.onerror=()=>reject(req.error);});
    },
    async readLocalBackup(id){return new Promise((resolve,reject)=>{const req=db.transaction('backups').objectStore('backups').get(id);req.onsuccess=()=>resolve(req.result?.payload);req.onerror=()=>reject(req.error);});},
    dispose:()=>clearInterval(interval)
  });
}
