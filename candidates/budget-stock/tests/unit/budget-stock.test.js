import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetStockPlan} from '../../src/modules/orcamento/budget-stock.js';
const stock=[{id:1,qty:10}],catalog=[{id:'p',qtd:5,foto:'photo'}];
const quote=(m=2,p=1)=>({id:'q',materials:[{stockId:1,qty:m}],parts:[{catalogId:'p',qty:p,foto:'photo'}]});
test('salva, repete, ajusta e remove sem repetir baixa nem perder foto',()=>{
 const first=budgetStockPlan(quote(),null,stock,catalog);
 assert.equal(first.stock[0].qty,8);assert.equal(first.catalog[0].qtd,4);
 const repeat=budgetStockPlan(quote(),first.record,first.stock,first.catalog);
 assert.equal(repeat.movements.length,0);
 const edit=budgetStockPlan(quote(3,2),first.record,first.stock,first.catalog);
 assert.equal(edit.stock[0].qty,7);assert.equal(edit.catalog[0].qtd,3);
 const remove=budgetStockPlan(quote(0,0),edit.record,edit.stock,edit.catalog);
 assert.equal(remove.stock[0].qty,10);assert.equal(remove.catalog[0].qtd,5);
 assert.equal(first.record.parts[0].foto,'photo');assert.equal(first.catalog[0].foto,'photo');
});
test('agrega linhas repetidas e bloqueia insuficiência sem mutar entrada',()=>{
 const q=quote();q.materials.push({stockId:1,qty:9});
 assert.throws(()=>budgetStockPlan(q,null,stock,catalog),/insuficiente/);
 assert.equal(stock[0].qty,10);
});
test('legado não baixa nem credita retroativamente',()=>{
 const old=quote(5,3);
 const reduced=budgetStockPlan(quote(1,1),old,stock,catalog);
 assert.equal(reduced.movements.length,0);
 const increased=budgetStockPlan(quote(3,2),reduced.record,stock,catalog);
 assert.equal(increased.stock[0].qty,8);assert.equal(increased.catalog[0].qtd,4);
});
import {indexedDB} from 'fake-indexeddb';
import {createDatabase} from '../../src/data/indexeddb.js';
import {createRepositories} from '../../src/data/repositories/index.js';
test('transação reverte orçamento e material se peça não tiver saldo; repetição não baixa duas vezes',async()=>{
 globalThis.indexedDB=indexedDB;
 const db=await createDatabase(),r=createRepositories(db);
 try{
 await r.stock.put({id:1,qty:10});await r.settings.put({id:'fp_pecas_rec',value:[{id:'p',qtd:0}]});
 await assert.rejects(r.saveBudgetWithStock({...quote(),updatedAt:'one'}),/insuficiente/);
 assert.equal((await r.stock.get(1)).qty,10);assert.equal(await r.budgets.get('q'),null);
 await r.settings.put({id:'fp_pecas_rec',value:[{id:'p',qtd:5,foto:'photo'}]});
 const saved=await r.saveBudgetWithStock({...quote(),updatedAt:'one'});
 await r.saveBudgetWithStock({...saved,stockExpectedUpdatedAt:'one'});
 assert.equal((await r.stock.get(1)).qty,8);assert.equal((await r.settings.get('fp_pecas_rec')).value[0].qtd,4);
 await assert.rejects(r.saveBudgetWithStock({...saved,stockExpectedUpdatedAt:'stale'}),/alterado/);
 }finally{db.close();}
});
test('OS aproveita baixa do orçamento, baixa só excedente e não reutiliza quantidade devolvida',async()=>{
 globalThis.indexedDB=indexedDB;const db=await createDatabase(),r=createRepositories(db);
 try{
 await r.stock.put({id:7,qty:10,unid:'Un',nome:'Material'});
 const record=await r.saveBudgetWithStock({id:'prepaid',updatedAt:'one',materials:[{stockId:7,qty:3}],parts:[]});
 await r.workOrders.put({id:'os-prepaid',budgetId:'prepaid'});
 const consume=(qty,requestId)=>r.recordStockConsumption({osId:'os-prepaid',input:{stockId:7,qty,unit:'Un',requestId},at:'two',movementId:requestId});
 const first=await consume(2,'use-one');assert.equal(first.budgetPrepaidQty,2);assert.equal((await r.stock.get(7)).qty,7);
 await consume(2,'use-one');assert.equal((await r.stock.get(7)).qty,7);
 const second=await consume(2,'use-two');assert.equal(second.budgetPrepaidQty,1);assert.equal(second.stockDebitedQty,1);assert.equal((await r.stock.get(7)).qty,6);
 await r.recordStockConsumption({osId:'os-prepaid',returning:true,input:{consumptionId:first.id,qty:1,requestId:'return-one'},at:'three',movementId:'return-one'});
 assert.equal((await r.stock.get(7)).qty,7);
 const third=await consume(1,'use-three');assert.equal(third.budgetPrepaidQty,0);assert.equal((await r.stock.get(7)).qty,6);
 await assert.rejects(r.saveBudgetWithStock({...record,materials:[{stockId:7,qty:1}],stockExpectedUpdatedAt:'one',updatedAt:'four'}),/vinculado/);
 assert.equal((await r.stock.get(7)).qty,6);
 }finally{db.close();}
});
test('revisão transfere baixa sem debitar de novo e rejeita transferência após vínculo com OS',async()=>{
 globalThis.indexedDB=indexedDB;const db=await createDatabase(),r=createRepositories(db);
 try{
 await r.stock.put({id:8,qty:10});
 const source=await r.saveBudgetWithStock({id:'source',updatedAt:'one',materials:[{stockId:8,qty:2}],parts:[]});
 const next=await r.reviseBudgetWithStock(source.id,{...source,id:'revision',updatedAt:'two'});
 assert.equal(next.stockAllocation.held['material:8'],2);assert.deepEqual((await r.budgets.get('source')).stockAllocation.held,{});
 await r.saveBudgetWithStock({...next,stockExpectedUpdatedAt:'two'});assert.equal((await r.stock.get(8)).qty,8);
 await r.workOrders.put({id:'linked',budgetId:'revision'});
 await assert.rejects(r.reviseBudgetWithStock('revision',{...next,id:'blocked'}),/execução/);
 assert.equal(await r.budgets.get('blocked'),null);
 }finally{db.close();}
});
import {createEstoqueService} from '../../src/modules/estoque/estoque-service.js';
test('material com baixa de orçamento não pode ser excluído nem trocar unidade; retirar linha permite devolução antes de excluir',async()=>{
 globalThis.indexedDB=indexedDB;const db=await createDatabase(),r=createRepositories(db),s=createEstoqueService({repositories:r,eventBus:{emit(){}}});
 try{
 await r.stock.put({id:99,nome:'Primer',unid:'L',qty:10,custo:20});
 const b=await r.saveBudgetWithStock({id:'linked-material',materials:[{stockId:99,qty:2}],parts:[],updatedAt:'one'});
 await assert.rejects(s.remove(99),/baixa de orçamento/);await assert.rejects(s.update(99,{unid:'ml'}),/baixa de orçamento/);
 assert.equal((await r.stock.get(99)).qty,8);assert.equal((await r.stock.get(99)).unid,'L');
 await r.saveBudgetWithStock({...b,materials:[],updatedAt:'two',stockExpectedUpdatedAt:'one'});assert.equal((await r.stock.get(99)).qty,10);
 await s.remove(99);assert.equal(await r.stock.get(99),null);
 }finally{db.close();}
});
test('edição de material obsoleta é rejeitada na transação sem restaurar saldo anterior',async()=>{
 globalThis.indexedDB=indexedDB;const db=await createDatabase(),r=createRepositories(db);
 try{
 const old={id:100,nome:'Material',qty:10,unid:'Un'};await r.stock.put(old);
 await r.saveBudgetWithStock({id:'material-race',materials:[{stockId:100,qty:2}],parts:[],updatedAt:'one'});
 await assert.rejects(r.mutateStock({action:'update',row:{...old,nome:'Descrição antiga'},expected:old}),/mudou/);
 assert.equal((await r.stock.get(100)).qty,8);
 }finally{db.close();}
});
test('foto do material persiste na edição, baixa, devolução e cópia de exclusão; imagem inválida é rejeitada',async()=>{
 globalThis.indexedDB=indexedDB;const db=await createDatabase(),r=createRepositories(db),s=createEstoqueService({repositories:r,eventBus:{emit(){}}});
 const foto='data:image/png;base64,aGVsbG8=';
 try{
 await assert.rejects(s.create({nome:'Inválido',foto:'https://example.com/foto.png'}),/Foto do material inválida/);
 const item=await s.create({nome:'Material com foto',qty:10,unid:'Un',foto});
 await s.update(item.id,{forn:'Fornecedor'});assert.equal((await s.get(item.id)).foto,foto);
 const b=await r.saveBudgetWithStock({id:'photo-material-budget',materials:[{stockId:item.id,qty:2}],parts:[],updatedAt:'one'});
 assert.equal((await s.get(item.id)).qty,8);assert.equal((await s.get(item.id)).foto,foto);
 await r.saveBudgetWithStock({...b,materials:[],updatedAt:'two',stockExpectedUpdatedAt:'one'});
 await s.remove(item.id);const backups=await r.deletionBackups.list();assert.equal(backups.find(b=>b.entityType==='stock'&&b.payload.id===item.id).payload.foto,foto);
 }finally{db.close();}
});
