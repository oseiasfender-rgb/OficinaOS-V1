import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createDatabase} from '../../src/data/indexeddb.js';
import {createRepositories} from '../../src/data/repositories/index.js';
import {createEstoqueService} from '../../src/modules/estoque/estoque-service.js';
import {createClientesService} from '../../src/modules/clientes/clientes-service.js';
import {CLIENT_LINK_STORES} from '../../src/modules/clientes/client-links.js';
import {createMetasService} from '../../src/modules/metas/metas-service.js';
import {MANUAL_ARTICLES} from '../../src/modules/consultor/manual-local.js';
const eventBus={emit(){}};
async function context(){globalThis.indexedDB=new IDBFactory();const db=await createDatabase();return{db,r:createRepositories(db)};}

test('Material: formulário antigo não restaura saldo debitado nem altera foto; edição fresca permanece possível',async()=>{
 const {db,r}=await context(),s=createEstoqueService({repositories:r,eventBus});
 try{
  await s.create({id:1,nome:'Material',qty:10,custo:20,unid:'Un',foto:'data:image/png;base64,AAAA'});
  const expected=await s.get(1);
  await r.saveBudgetWithStock({id:'b',materials:[{stockId:1,qty:2}],parts:[],updatedAt:'one'});
  await assert.rejects(s.update(1,{nome:'Edição antiga',qty:10},{expected}),/saldo mudou/);
  const current=await s.get(1);assert.equal(current.qty,8);assert.equal(current.foto,expected.foto);
  await s.update(1,{nome:'Nome novo'},{expected:current});assert.equal((await s.get(1)).qty,8);
 }finally{db.close();}
});
test('Material: exclusão com snapshot antigo é rejeitada antes de criar backup',async()=>{
 const {db,r}=await context(),s=createEstoqueService({repositories:r,eventBus});try{
  await s.create({id:1,nome:'Material',qty:10});const old=await s.get(1);await s.update(1,{qty:8});
  await assert.rejects(s.remove(1,{expected:old}),/saldo mudou/);assert.equal((await s.get(1)).qty,8);assert.equal((await r.deletionBackups.list()).length,0);
 }finally{db.close();}
});
for(const name of CLIENT_LINK_STORES)test(`Cliente vinculado em ${name} não pode ser excluído, incluindo ID numérico referenciado como texto`,async()=>{
 const {db,r}=await context(),s=createClientesService({repositories:r,eventBus});try{
  await r.clients.put({id:100,name:'Cliente'});await r[name].put({id:'link',clienteId:'100'});
  await assert.rejects(s.remove(100),/Cliente vinculado/);assert.equal((await r.clients.get(100)).name,'Cliente');assert.equal((await r.deletionBackups.list()).length,0);assert.equal((await r[name].list()).length,1);
 }finally{db.close();}
});
test('Cliente sem vínculo pode ser excluído e recebe cópia integral do cadastro',async()=>{
 const {db,r}=await context(),s=createClientesService({repositories:r,eventBus});try{
  const client={id:100,name:'Cliente',veiculos:[{id:1,placa:'ABC1234'}]};await r.clients.put(client);await s.remove(100);
  assert.equal(await r.clients.get(100),null);assert.deepEqual((await r.deletionBackups.list())[0].payload,client);
 }finally{db.close();}
});
test('Cliente: falha na cópia preventiva reverte a exclusão',async()=>{
 const {db,r}=await context();try{
  const client={id:100,name:'Cliente'};await r.clients.put(client);
  await assert.rejects(r.removeClientSafely({id:100,expected:client,backup:{id:()=>{}}}));assert.deepEqual(await r.clients.get(100),client);
 }finally{db.close();}
});
test('Meta: falha após inserir novo nome reverte a transação e preserva somente a original',async()=>{
 const {db,r}=await context();try{
  const original={id:'A',category:'A',meta:100};await r.goals.put(original);
  const failingDB={transaction(...args){const tx=db.transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='goals')store.delete=()=>{throw Error('Falha fictícia após inclusão');};return store;};return tx;}};
  const s=createMetasService({repositories:createRepositories(failingDB),eventBus});
  await assert.rejects(s.renameCategoryGoal('A','B',200),/Falha fictícia/);assert.deepEqual(await r.goals.get('A'),original);assert.equal(await r.goals.get('B'),null);
 }finally{db.close();}
});
test('Meta: edição obsoleta e colisão concorrente não apagam ou sobrescrevem registros',async()=>{
 const {db,r}=await context();try{
  const old={id:'A',category:'A',meta:100};await r.goals.put(old);await r.goals.put({...old,meta:150});
  await assert.rejects(r.renameGoalSafely({id:'A',expected:old,row:{id:'C',category:'C',meta:200}}),/meta mudou/);
  const current=await r.goals.get('A');await r.goals.put({id:'B',category:'B',meta:300});
  await assert.rejects(r.renameGoalSafely({id:'A',expected:current,row:{id:'b',category:'b',meta:200}}),/Já existe/);
  assert.equal((await r.goals.get('A')).meta,150);assert.equal((await r.goals.get('B')).meta,300);
 }finally{db.close();}
});
test('Meta: renomear troca o ID numa única gravação lógica e preserva outras metas',async()=>{
 const {db,r}=await context(),s=createMetasService({repositories:r,eventBus});try{
  await r.goals.put({id:'A',category:'A',meta:100});await r.goals.put({id:'Z',category:'Z',meta:500});await s.renameCategoryGoal('A','C',300);
  assert.equal(await r.goals.get('A'),null);assert.equal((await r.goals.get('C')).meta,300);assert.equal((await r.goals.get('Z')).meta,500);
 }finally{db.close();}
});
test('Manual descreve baixa ao salvar, avulsos sem baixa, offline e rascunhos',()=>{
 const stock=MANUAL_ARTICLES.find(a=>a.id==='estoque').steps.join(' ');
 assert.match(stock,/Ao salvar o orçamento vinculado/);assert.match(stock,/avulsos sem vínculo/);assert.match(stock,/não repete a baixa/);
 assert.ok(MANUAL_ARTICLES.some(a=>a.id==='sincronizacao'));assert.ok(MANUAL_ARTICLES.some(a=>a.id==='cadastros'));
});
