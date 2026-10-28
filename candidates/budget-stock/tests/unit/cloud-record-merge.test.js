import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecords,recordChanges} from '../../src/data/cloud/record-merge.js';
const s=(rows=[],extra={})=>({schema:'oficinaos-modular-v5',stores:{budgets:rows,...extra}});
test('PC e Android criam registros diferentes: preserva ambos sem depender de relógio',()=>{
  const result=mergeRecords(s(),s([{id:'pc',total:1}]),s([{id:'phone',total:2}]));assert.deepEqual(result.conflicts,[]);assert.equal(result.snapshot.stores.budgets.length,2);
});
test('Mesmo registro editado nos dois lados gera conflito e não altera entradas',()=>{
  const b=s([{id:'x',total:10}]),l=s([{id:'x',total:20}]),r=s([{id:'x',total:30}]);const before=structuredClone([b,l,r]);const m=mergeRecords(b,l,r);assert.equal(m.conflicts[0].reason,'concurrent-edit');assert.deepEqual([b,l,r],before);
});
test('Exclusão contra edição mantém versões e pede decisão',()=>{
  const m=mergeRecords(s([{id:1,total:1}]),s(),s([{id:1,total:2}]));assert.equal(m.conflicts[0].reason,'delete-versus-edit');assert.equal(m.conflicts[0].local,null);assert.equal(m.conflicts[0].remote.total,2);
});
test('Alteração idêntica e exclusão sem concorrência convergem',()=>{
  const b=s([{id:'a'},{id:'b'}]),l=s([{id:'a',value:0}]),r=s([{id:'a',value:0},{id:'b'}]);const m=mergeRecords(b,l,r);assert.deepEqual(m.conflicts,[]);assert.deepEqual(m.snapshot.stores.budgets,[{id:'a',value:0}]);
});
test('Identidade conserva número versus string e zero versus ausência',()=>{
  assert.equal(recordChanges(s([{id:1,value:null}]),s([{id:1,value:0}])).length,1);
  const m=mergeRecords(s(),s([{id:1}]),s([{id:'1'}]));assert.equal(m.snapshot.stores.budgets.length,2);
});
test('Dois números comerciais iguais nunca são renumerados silenciosamente',()=>{
  const m=mergeRecords(s(),s([{id:'pc',numero:'orc_002'}]),s([{id:'phone',numero:'orc_002'}]));assert.equal(m.conflicts[0].reason,'duplicate-document-number');assert.equal(m.snapshot.stores.budgets.length,2);
});
test('Operações financeiras concorrentes exigem revisão conjunta',()=>{
  const b=s([],{transactions:[],accounts:[]}),l=s([],{transactions:[{id:'t',paid:true}],accounts:[]}),r=s([],{transactions:[],accounts:[{id:'a',paid:true}]});assert.equal(mergeRecords(b,l,r).conflicts[0].reason,'concurrent-workflow');
});
test('Base incompatível e IDs repetidos são rejeitados antes de combinar',()=>{
  assert.throws(()=>mergeRecords(s(),s(),{schema:'other',stores:{budgets:[]}}),/incompatíveis/);
  assert.throws(()=>mergeRecords(s(),s([{id:1},{id:1}]),s()),/duplicado/);
});
test('Excluir cliente contra criação de orçamento vinculado bloqueia vínculo órfão',()=>{
 const b=s([],{clients:[{id:'c'}]}),l=s([],{clients:[]}),r=s([{id:'q',clientId:'c'}],{clients:[{id:'c'}]});assert.ok(mergeRecords(b,l,r).conflicts.some(c=>c.reason==='linked-deletion'));
});
test('Aprovação em um aparelho e pagamento no outro exigem revisão conjunta',()=>{
 const b=s([{id:'q'}],{transactions:[]}),l=s([{id:'q',approval:{snapshot:{total:10}}}],{transactions:[]}),r=s([{id:'q'}],{transactions:[{id:'t',budgetId:'q',paid:true}]});assert.ok(mergeRecords(b,l,r).conflicts.some(c=>c.reason==='concurrent-workflow'));
});
test('baixas de peças em aparelhos diferentes exigem revisão mesmo com IDs de orçamento distintos',()=>{
 const base=s([],{settings:[{id:'fp_pecas_rec',value:[{id:'p',qtd:5}]}]});
 const left=structuredClone(base),right=structuredClone(base);
 left.stores.budgets.push({id:'pc',stockAllocation:{held:{'part:p':1}}});
 right.stores.budgets.push({id:'g75',stockAllocation:{held:{'part:p':1}}});
 left.stores.settings[0].value[0].qtd=4;right.stores.settings[0].value[0].qtd=4;
 assert.ok(mergeRecords(base,left,right).conflicts.some(c=>c.reason==='concurrent-workflow'));
});
test('consumo prebaixado em duas OS não combina silenciosamente claims concorrentes',()=>{
 const base=s([],{settings:[]}),left=structuredClone(base),right=structuredClone(base);
 left.stores.settings.push({id:'budget_stock_claims:b',value:{'material:1':1}});
 right.stores.settings.push({id:'os_execution:os',value:{materials:[{qty:1}]}});
 assert.ok(mergeRecords(base,left,right).conflicts.some(c=>c.reason==='concurrent-workflow'));
});
