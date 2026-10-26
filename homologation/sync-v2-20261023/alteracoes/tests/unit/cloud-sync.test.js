import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncEngine,snapshotIdentity,SyncConflict} from '../../src/data/cloud/sync-engine.js';
import {createSupabaseTransport} from '../../src/data/cloud/supabase-transport.js';

const snapshot = (value=0)=>({schema:'oficinaos-modular-v5',stores:{budgets:[{id:'q1',total:value,optional:null}]}});
function fixture(){
  const heads=new Map(),operations=new Map(),copies=[];let failAfterWrite=false;
  const remote={read:async({namespace})=>structuredClone(heads.get(namespace)??null),commit:async x=>{
    if(operations.has(x.operationId))return operations.get(x.operationId);
    const rev=heads.get(x.namespace)?.revision??0;if(rev!==x.baseRevision)throw new SyncConflict();
    const result={revision:rev+1};heads.set(x.namespace,{revision:rev+1,payload:structuredClone(x.payload)});operations.set(x.operationId,result);
    if(failAfterWrite){failAfterWrite=false;throw Error('network timeout');}return result;
  }};
  function device(value=0,user='owner',namespace='homologacao'){
    let data=snapshot(value),allow=true;const values=new Map();const backups=[];let backupHook;
    const metadata={get:async k=>structuredClone(values.get(k)),set:async(k,v)=>values.set(k,structuredClone(v))};
    const local={read:async()=>structuredClone(data),withLock:fn=>fn(),canApply:async()=>allow,backup:async s=>{backups.push(structuredClone(s));await backupHook?.();},apply:async(s,expected)=>{assert.equal(snapshotIdentity(data),expected);data=structuredClone(s);}};
    const engine=createSyncEngine({local,remote,metadata,userId:user,namespace,uuid:()=>crypto.randomUUID()});
    return {engine,local,metadata,values,backups,set:n=>{data=snapshot(n);},get:()=>data,setSnapshot:s=>{data=structuredClone(s);},allow:n=>{allow=n;},onBackup:fn=>{backupHook=fn;}};
  }
  return {remote,device,heads,operations,copies,failNext:()=>{failAfterWrite=true;}};
}

test('Primeiro acesso nunca publica nem substitui dados automaticamente',async()=>{
  const f=fixture(),d=f.device(100);assert.equal((await d.engine.tick()).status,'initial-choice-required');assert.equal(f.heads.size,0);assert.equal(d.get().stores.budgets[0].total,100);
});
test('Publicação inicial explícita e sincronização de outro aparelho preservam cópia local',async()=>{
  const f=fixture(),pc=f.device(100),phone=f.device(10);
  await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();assert.equal(phone.get().stores.budgets[0].total,100);assert.equal(phone.backups[0].stores.budgets[0].total,10);
  pc.set(200);assert.equal((await pc.engine.tick()).status,'uploaded');assert.equal((await phone.engine.tick()).status,'downloaded');assert.equal(phone.get().stores.budgets[0].total,200);
});
test('PC e celular divergentes bloqueiam sobrescrita e preservam ambos',async()=>{
  const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();pc.set(150);phone.set(170);await pc.engine.tick();assert.equal((await phone.engine.tick()).status,'conflict');assert.equal(phone.get().stores.budgets[0].total,170);assert.equal(f.heads.get('homologacao').payload.stores.budgets[0].total,150);
});
test('Reenvio após timeout não duplica revisão na nuvem',async()=>{
  const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();pc.set(200);f.failNext();await assert.rejects(pc.engine.tick(),/timeout/);assert.equal((await pc.engine.tick()).status,'synced');assert.equal(f.heads.get('homologacao').revision,2);assert.equal(f.operations.size,2);
});
test('Falha na primeira publicação permite recuperar o envio aceito',async()=>{
  const f=fixture(),pc=f.device(100);f.failNext();await assert.rejects(pc.engine.enrollFromLocal());assert.equal((await pc.engine.tick()).status,'synced');assert.equal(f.heads.get('homologacao').revision,1);
});
test('Publicação inicial recusa substituir nuvem existente',async()=>{
  const f=fixture(),pc=f.device(100),phone=f.device(200);await pc.engine.enrollFromLocal();await assert.rejects(phone.engine.enrollFromLocal(),SyncConflict);assert.equal(f.heads.get('homologacao').payload.stores.budgets[0].total,100);
});
test('Editor ocupado impede recebimento sem perder a alteração remota',async()=>{
  const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();pc.set(200);await pc.engine.tick();phone.allow(false);assert.equal((await phone.engine.tick()).status,'waiting-for-editor');assert.equal(phone.get().stores.budgets[0].total,100);phone.allow(true);assert.equal((await phone.engine.tick()).status,'downloaded');
});
test('Gravação local durante backup cancela substituição remota',async()=>{
  const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();pc.set(200);await pc.engine.tick();phone.onBackup(()=>phone.set(300));assert.equal((await phone.engine.tick()).status,'waiting-for-local-write');assert.equal(phone.get().stores.budgets[0].total,300);
});
test('Ambientes e identidades de conta mantêm metadados separados',async()=>{
  const f=fixture(),pc=f.device(100,'owner','homologacao'),prod=f.device(200,'owner','producao');await pc.engine.enrollFromLocal();await prod.engine.enrollFromLocal();assert.equal(f.heads.size,2);assert.deepEqual([...pc.values.keys()],['owner:homologacao']);assert.deepEqual([...prod.values.keys()],['owner:producao']);
});
test('Ordem dos registros não cria alteração; zero e ausência continuam diferentes',()=>{
  const a={schema:'s',stores:{x:[{id:2,value:0},{id:1,value:null}]}};
  assert.equal(snapshotIdentity(a),snapshotIdentity({schema:'s',stores:{x:[{value:null,id:1},{value:0,id:2}]}}));
  assert.notEqual(snapshotIdentity(snapshot(0)),snapshotIdentity(snapshot(null)));assert.throws(()=>snapshotIdentity({stores:{x:[{id:1},{id:1}]}}),/duplicada/);
});
test('Revisão remota retrocedida não altera dados',async()=>{
  const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();f.heads.get('homologacao').revision=0;await assert.rejects(pc.engine.tick(),/retrocedida/);assert.equal(pc.get().stores.budgets[0].total,100);
});
test('Transporte rejeita chave secreta e URL fora do projeto Supabase',()=>{
  const cfg={url:'https://example.supabase.co',publishableKey:'sb_publishable_test',getSession:async()=>null};
  assert.throws(()=>createSupabaseTransport({...cfg,publishableKey:'sb_secret_private'}));assert.throws(()=>createSupabaseTransport({...cfg,url:'http://example.supabase.co'}));assert.throws(()=>createSupabaseTransport({...cfg,url:'https://evil.example/'}));
});
test('Transporte sem login não faz requisição; conflito HTTP preserva significado',async()=>{
  let called=false;const cfg={url:'https://example.supabase.co',publishableKey:'sb_publishable_test',getSession:async()=>null,fetchImpl:async()=>{called=true;}};
  await assert.rejects(createSupabaseTransport(cfg).read({namespace:'homologacao'}),/Entre/);assert.equal(called,false);
  const driver=createSupabaseTransport({...cfg,getSession:async()=>({access_token:'session'}),fetchImpl:async()=>({ok:false,status:400,json:async()=>({code:'40001'})})});await assert.rejects(driver.commit({namespace:'homologacao'}),SyncConflict);
});


test('Combinação por registro preserva criações offline e converge sem duplicar após reinício',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const left=structuredClone(pc.get()),right=structuredClone(phone.get());left.stores.budgets.push({id:'pc-new',total:10});right.stores.budgets.push({id:'phone-new',total:20});pc.setSnapshot(left);phone.setSnapshot(right);
 assert.equal((await phone.engine.checkpoint()).count,1);assert.equal(phone.values.get('owner:homologacao:outbox').changes[0].operation,'create');
 await pc.engine.tick();assert.equal((await phone.engine.tick()).status,'merged-pending-upload');assert.equal(phone.get().stores.budgets.length,3);
 f.failNext();await assert.rejects(phone.engine.tick(),/timeout/);assert.equal((await phone.engine.tick()).status,'synced');await pc.engine.tick();assert.equal(pc.get().stores.budgets.length,3);assert.equal(f.heads.get('homologacao').revision,3);
});
test('Checkpoint offline só grava fila local e não envia dados',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();pc.set(150);await pc.engine.checkpoint();await pc.engine.checkpoint();assert.equal(f.heads.get('homologacao').revision,1);assert.equal(pc.values.get('owner:homologacao:outbox').changes.length,1);
});
test('Receber base inteira não descarta alterações locais de aparelho vinculado',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();phone.set(200);await assert.rejects(phone.engine.enrollFromCloud(),/alterações locais/);assert.equal(phone.get().stores.budgets[0].total,200);
});
test('Revisão explícita escolhe um registro em conflito e preserva registros independentes',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();pc.set(150);phone.set(170);const right=structuredClone(phone.get());right.stores.budgets.push({id:'independent',total:9});phone.setSnapshot(right);await pc.engine.tick();await phone.engine.tick();const review=await phone.engine.inspectConflicts();assert.equal(review.conflicts.length,1);
 assert.equal((await phone.engine.resolveConflicts(review,{'budgets/string:q1':'remote'})).status,'merged-pending-upload');assert.equal(phone.get().stores.budgets.length,2);assert.equal(phone.get().stores.budgets.find(x=>x.id==='q1').total,150);await phone.engine.tick();assert.equal(f.heads.get('homologacao').payload.stores.budgets.length,2);
});
test('Comparação vencida não aplica decisão antiga',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();pc.set(150);phone.set(170);await pc.engine.tick();const review=await phone.engine.inspectConflicts();phone.set(190);await assert.rejects(phone.engine.resolveConflicts(review,{'budgets/string:q1':'remote'}),/mudaram/);assert.equal(phone.get().stores.budgets[0].total,190);
});
test('Combinação aguarda edição aberta e preserva ambas as criações',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();const l=structuredClone(pc.get()),r=structuredClone(phone.get());l.stores.budgets.push({id:'pc'});r.stores.budgets.push({id:'phone'});pc.setSnapshot(l);phone.setSnapshot(r);await pc.engine.tick();phone.allow(false);assert.equal((await phone.engine.tick()).status,'waiting-for-editor');assert.equal(phone.get().stores.budgets.length,2);phone.allow(true);assert.equal((await phone.engine.tick()).status,'merged-pending-upload');assert.equal(phone.get().stores.budgets.length,3);
});
test('Decisão genérica não reescreve orçamento aprovado',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();const l=structuredClone(pc.get()),r=structuredClone(phone.get());l.stores.budgets[0].approval={snapshot:{total:100}};r.stores.budgets[0].total=200;pc.setSnapshot(l);phone.setSnapshot(r);await pc.engine.tick();const review=await phone.engine.inspectConflicts();await assert.rejects(phone.engine.resolveConflicts(review,{'budgets/string:q1':'local'}),/aprovado/);assert.equal(phone.get().stores.budgets[0].total,200);
});

test('Mesma revisão com conteúdo remoto diferente nunca anuncia sincronizado',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();
 f.heads.get('homologacao').payload=snapshot(999);
 assert.equal((await pc.engine.tick()).status,'conflict');
 assert.equal(pc.get().stores.budgets[0].total,100);
 assert.equal(f.heads.get('homologacao').payload.stores.budgets[0].total,999);
});
test('Confirmação relê conteúdo remoto e local e informa a revisão conferida',async()=>{
 const f=fixture(),pc=f.device(100);const result=await pc.engine.enrollFromLocal();
 assert.equal(result.verified,true);assert.equal(result.revision,1);assert.equal(result.namespace,'homologacao');assert.equal(result.budgetCount,1);
 const read=f.remote.read;let reads=0;f.remote.read=async args=>{const value=await read(args);if(++reads===1)pc.set(200);return value;};
 assert.equal((await pc.engine.tick()).status,'waiting-for-local-write');
 assert.equal(pc.get().stores.budgets[0].total,200);
});
test('Falha na leitura de confirmação não declara sucesso mesmo com envio aceito',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();pc.set(200);
 const read=f.remote.read;let reads=0;f.remote.read=async args=>{if(++reads===2)throw Error('confirmation offline');return read(args);};
 await assert.rejects(pc.engine.tick(),/confirmation offline/);
 f.remote.read=read;const result=await pc.engine.tick();assert.equal(result.status,'synced');assert.equal(result.verified,true);assert.equal(f.heads.get('homologacao').revision,2);
});
test('Troca de orçamento sem lixeira bloqueia envio e mantém orçamento anterior na nuvem',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();
 pc.setSnapshot({schema:'oficinaos-modular-v5',stores:{budgets:[{id:'phone-own',numero:'orc_001',total:1000}]}});
 assert.equal((await pc.engine.tick()).status,'conflict');assert.equal(f.heads.get('homologacao').revision,1);
 const review=await pc.engine.inspectConflicts();assert.ok(review.conflicts.some(x=>x.reason==='unconfirmed-removal'));
 await assert.rejects(pc.engine.resolveConflicts(review,{}),SyncConflict);
 assert.equal(pc.get().stores.budgets[0].id,'phone-own');
});
test('Remoção remota sem exclusão registrada não apaga orçamento local',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();
 f.heads.set('homologacao',{revision:2,payload:{schema:'oficinaos-modular-v5',stores:{budgets:[{id:'phone-own',total:1000}]}}});
 assert.equal((await pc.engine.tick()).status,'conflict');assert.equal(pc.get().stores.budgets[0].id,'q1');assert.equal(pc.backups.length,0);
});
test('Primeiro recebimento bloqueia orçamento próprio ausente na nuvem',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device(200);await pc.engine.enrollFromLocal();
 phone.setSnapshot({schema:'oficinaos-modular-v5',stores:{budgets:[{id:'phone-own',numero:'orc_001',total:200}]}});
 await assert.rejects(phone.engine.enrollFromCloud(),/Primeira vinculação/);
 assert.equal(phone.get().stores.budgets[0].id,'phone-own');assert.equal(phone.backups.length,0);
});
test('Exclusão legítima com orçamento na lixeira continua sincronizando',async()=>{
 const f=fixture(),pc=f.device(100);pc.setSnapshot({schema:'oficinaos-modular-v5',stores:{budgets:[{id:'q1'}],trash:[]}});await pc.engine.enrollFromLocal();
 pc.setSnapshot({schema:'oficinaos-modular-v5',stores:{budgets:[],trash:[{id:'q1',entityType:'budget'}]}});
 assert.equal((await pc.engine.tick()).status,'uploaded');assert.equal(f.heads.get('homologacao').payload.stores.trash.length,1);
});
test('Recebimento explícito também bloqueia remoção remota sem exclusão registrada',async()=>{
 const f=fixture(),pc=f.device(100);await pc.engine.enrollFromLocal();
 f.heads.set('homologacao',{revision:2,payload:{schema:'oficinaos-modular-v5',stores:{budgets:[{id:'phone-own',total:1000}]}}});
 await assert.rejects(pc.engine.enrollFromCloud(),/Recebimento bloqueado/);assert.equal(pc.get().stores.budgets[0].id,'q1');assert.equal(pc.backups.length,0);
});
test('Duplicidade explícita mantém orçamento remoto e copia integral local antes de aplicar',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const left=structuredClone(pc.get()),right=structuredClone(phone.get());left.stores.budgets.push({id:'pc',numero:'orc_004',total:828});right.stores.budgets.push({id:'phone',numero:'orc_004',total:1160});pc.setSnapshot(left);phone.setSnapshot(right);await pc.engine.tick();
 const review=await phone.engine.inspectConflicts();assert.ok(review.conflicts.some(c=>c.reason==='duplicate-document-number'));
 assert.equal((await phone.engine.resolveConflicts(review,{'budgets/orc_004':'remote'})).status,'merged-pending-upload');assert.equal(phone.get().stores.budgets.find(x=>x.numero==='orc_004').id,'pc');assert.equal(phone.backups.at(-1).stores.budgets.find(x=>x.id==='phone').total,1160);
});
test('Duplicidade aprovada bloqueia resolução genérica e preserva versões',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const left=structuredClone(pc.get()),right=structuredClone(phone.get());left.stores.budgets.push({id:'pc',numero:'orc_004'});right.stores.budgets.push({id:'phone',numero:'orc_004',approval:{at:'now'}});pc.setSnapshot(left);phone.setSnapshot(right);await pc.engine.tick();const review=await phone.engine.inspectConflicts();await assert.rejects(phone.engine.resolveConflicts(review,{'budgets/orc_004':'remote'}),/manual/);assert.equal(phone.get().stores.budgets.at(-1).id,'phone');
});
test('Duplicidade preserva cópia de exclusão aninhada e backup preventivo',async()=>{
 const f=fixture(),pc=f.device(100),phone=f.device();const base={schema:'oficinaos-modular-v5',stores:{budgets:[{id:'q1'}],deletionBackups:[]}};pc.setSnapshot(base);phone.setSnapshot(base);await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const l=structuredClone(base),r=structuredClone(base);l.stores.budgets.push({id:'pc',numero:'orc_004'});r.stores.budgets.push({id:'phone',numero:'orc_004'});r.stores.deletionBackups.push({id:'backup-1',payload:{id:'phone'}});pc.setSnapshot(l);phone.setSnapshot(r);await pc.engine.tick();const review=await phone.engine.inspectConflicts();assert.equal((await phone.engine.resolveConflicts(review,{'budgets/orc_004':'remote'})).status,'merged-pending-upload');assert.equal(phone.get().stores.budgets.find(x=>x.numero==='orc_004').id,'pc');assert.equal(phone.get().stores.deletionBackups[0].payload.id,'phone');assert.equal(phone.backups.at(-1).stores.budgets.at(-1).id,'phone');
});
test('Sequência e duplicidade exigem escolhas juntas e preservam foto e cópia local',async()=>{
 const f=fixture(),pc=f.device(),phone=f.device();
 const base={schema:'oficinaos-modular-v5',stores:{budgets:[],settings:[{id:'budget_document_sequence',value:3}],deletionBackups:[]}};
 pc.setSnapshot(base);phone.setSnapshot(base);await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const l=structuredClone(base),r=structuredClone(base);
 l.stores.budgets.push({id:'pc',numero:'orc_004',quotePhoto:'data:image/jpeg;base64,cGM='});
 r.stores.budgets.push({id:'phone',numero:'orc_004',total:1160});
 l.stores.settings[0]={id:'budget_document_sequence',value:4,updatedAt:'pc'};
 r.stores.settings[0]={id:'budget_document_sequence',value:4,updatedAt:'phone'};
 r.stores.deletionBackups.push({id:'restore-copy',payload:{id:'phone'}});
 pc.setSnapshot(l);phone.setSnapshot(r);await pc.engine.tick();
 const review=await phone.engine.inspectConflicts();
 assert.ok(review.conflicts.some(c=>c.reason==='duplicate-document-number'));
 assert.ok(review.conflicts.some(c=>c.collection==='settings'&&c.key==='string:budget_document_sequence'));
 await assert.rejects(phone.engine.resolveConflicts(review,{'settings/string:budget_document_sequence':'remote'}));
 assert.equal(phone.get().stores.budgets[0].id,'phone');assert.equal(phone.backups.length,1);
 await phone.engine.resolveConflicts(review,{'settings/string:budget_document_sequence':'remote','budgets/orc_004':'remote'});
 assert.equal(phone.get().stores.budgets[0].quotePhoto,l.stores.budgets[0].quotePhoto);
 assert.equal(phone.backups.at(-1).stores.budgets[0].id,'phone');
 assert.equal(phone.get().stores.deletionBackups[0].payload.id,'phone');
 await phone.engine.tick();assert.equal(f.heads.get('homologacao').payload.stores.budgets[0].quotePhoto,l.stores.budgets[0].quotePhoto);
});
test('Duplicidade mantém os dois orçamentos e reserva número acima do histórico',async()=>{
 const f=fixture(),pc=f.device(),phone=f.device();
 const base={schema:'oficinaos-modular-v5',stores:{budgets:[],settings:[{id:'budget_document_sequence',value:6}],deletionBackups:[]}};
 pc.setSnapshot(base);phone.setSnapshot(base);await pc.engine.enrollFromLocal();await phone.engine.enrollFromCloud();
 const a=structuredClone(base),b=structuredClone(base);
 a.stores.budgets.push({id:'pc',numero:'orc_007',total:1060});b.stores.budgets.push({id:'g75',numero:'orc_007',total:757.14,quotePhoto:'foto-local'});
 a.stores.settings[0].value=7;a.stores.settings[0].updatedAt='pc';b.stores.settings[0].value=7;b.stores.settings[0].updatedAt='g75';
 b.stores.deletionBackups.push({id:'old',item:{numero:'orc_008'}});
 pc.setSnapshot(a);phone.setSnapshot(b);await pc.engine.tick();
 const review=await phone.engine.inspectConflicts();await phone.engine.resolveConflicts(review,{'settings/string:budget_document_sequence':'remote','budgets/orc_007':'keep-both'});
 const budgets=phone.get().stores.budgets;assert.equal(budgets.find(x=>x.id==='pc').numero,'orc_007');assert.equal(budgets.find(x=>x.id==='g75').numero,'orc_009');assert.equal(budgets.find(x=>x.id==='g75').quotePhoto,'foto-local');
 assert.equal(phone.get().stores.settings[0].value,9);assert.equal(phone.backups.at(-1).stores.budgets[0].numero,'orc_007');
 await phone.engine.tick();assert.equal(f.heads.get('homologacao').payload.stores.budgets.length,2);
});
