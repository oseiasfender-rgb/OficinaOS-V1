import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createDatabase} from '../../src/data/indexeddb.js';
import {createRepositories} from '../../src/data/repositories/index.js';
import {createPartsCatalogService} from '../../src/modules/orcamento/parts-catalog.js';
async function context(){globalThis.indexedDB=new IDBFactory();const db=await createDatabase();const repositories=createRepositories(db);return {db,repositories,catalog:createPartsCatalogService(repositories)};}
const piece={id:'p',nome:'Paralama',qtd:10,valor:200,condicao:'Boa',foto:'data:image/png;base64,AAAA'};
test('editor aberto antes da baixa não restaura saldo antigo nem perde foto',async()=>{
 const {db,repositories:r,catalog}=await context();try{
 const opened=await catalog.put(piece);
 await r.saveBudgetWithStock({id:'b',updatedAt:'one',parts:[{catalogId:'p',qty:5,foto:piece.foto}],materials:[]});
 assert.equal((await catalog.list())[0].qtd,5);
 await assert.rejects(catalog.put({...opened,aplicacao:'Edição antiga'},{expected:opened}),/mudou/);
 assert.equal((await catalog.list())[0].qtd,5);assert.equal((await catalog.list())[0].foto,piece.foto);
 const fresh=(await catalog.list())[0];await catalog.put({...fresh,aplicacao:'Master'},{expected:fresh});
 assert.equal((await catalog.list())[0].qtd,5);
 }finally{db.close();}
});
test('ajuste manual fresco registra antes/depois; cadastro novo não sobrescreve baixa de outra peça',async()=>{
 const {db,repositories:r,catalog}=await context();try{
 await catalog.put(piece);
 await r.saveBudgetWithStock({id:'b',updatedAt:'one',parts:[{catalogId:'p',qty:5}],materials:[]});
 await catalog.put({...piece,id:'other',nome:'Outra peça',qtd:3});
 assert.equal((await catalog.list()).find(p=>p.id==='p').qtd,5);
 const fresh=(await catalog.list()).find(p=>p.id==='p');await catalog.put({...fresh,qtd:7},{expected:fresh});
 assert.ok((await r.settings.list()).some(s=>s.id.startsWith('parts_catalog_adjustment:')&&s.value.before===5&&s.value.after===7));
 }finally{db.close();}
});
test('excluir cadastro com baixa de orçamento é bloqueado e rollback preserva peça',async()=>{
 const {db,repositories:r,catalog}=await context();try{
 await catalog.put(piece);
 await r.saveBudgetWithStock({id:'b',updatedAt:'one',parts:[{catalogId:'p',qty:2}],materials:[]});
 const fresh=(await catalog.list())[0];await assert.rejects(catalog.remove('p',{expected:fresh}),/baixa vinculada/);
 assert.equal((await catalog.list())[0].qtd,8);assert.equal((await r.deletionBackups.list()).length,0);
 }finally{db.close();}
});
