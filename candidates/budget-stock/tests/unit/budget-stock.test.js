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
