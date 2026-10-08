import test from 'node:test';import assert from 'node:assert/strict';import {projectReference,compareExpected} from '../../scripts/acceptance-auditor.mjs';
const source=()=>({version:'1.0',exportedAt:'2026-10-05T00:00:00Z',ALL_TX:[{id:1,val:100}],jobs:[{id:'j1',cliente:'Teste',val:100,done:false}],clientes:[{id:1,nome:'Teste',veiculos:[]}],contas:[],estoque:[],metasCat:[],metaPrincipal:1,nextTxId:2,dasStatus:{}});
function setup(){const p=projectReference(source());const a=structuredClone(p.expected);a.meta=[{id:'schema',value:'oficinaos-modular-v5'},{id:'migrationSource',value:'1.0'},{id:'migratedAt',value:'2026-10-06T00:00:00Z'}];return {p,a};}
for(const [name,edit,extra,missing]of [['conforme',()=>{},0,0],['removido',a=>a.transactions.pop(),0,1],['inserido',a=>a.transactions.push({id:2,val:5}),1,0],['duplicado',a=>a.transactions.push({...a.transactions[0]}),1,0],['valor alterado',a=>a.transactions[0].val=101,1,1],['tipo alterado',a=>a.transactions[0].id='1',1,1],['OS extra',a=>a.workOrders.push({...a.workOrders[0],id:'extra'}),1,0],['data inventada',a=>a.workOrders[0].createdAt='2026-10-05',1,1]])test('Auditor independente: '+name,()=>{const {p,a}=setup();edit(a);const r=compareExpected(p,a);assert.equal(r.derivedCount,extra);assert.equal(r.missingExpectedCount,missing);assert.equal(r.pass,extra===0&&missing===0);});
test('Auditor bloqueia campo fora da matriz e IDs duplicados na origem',()=>{const d=source();d.jobs[0].unknown=1;assert.throws(()=>projectReference(d));delete d.jobs[0].unknown;d.jobs.push({...d.jobs[0]});assert.throws(()=>projectReference(d));});
test('Auditor bloqueia configurações omitidas e store ausente',()=>{const {p,a}=setup();a.settings=[];assert.equal(compareExpected(p,a).pass,false);delete a.transactions;assert.throws(()=>compareExpected(p,a));});
test('Auditor preserva null e distingue ausência; reordenação de objetos não muda o resultado',()=>{const {p,a}=setup();a.transactions[0]={val:100,id:1};assert.equal(compareExpected(p,a).pass,true);delete a.workOrders[0].createdAt;assert.equal(compareExpected(p,a).missingExpectedCount,1);});


test('Auditor preserva duas ocorrências distintas de ID e reconcilia vínculo por valor/data',()=>{const d=source();d.ALL_TX=[{id:1,val:100,date:'2026-10-01'},{id:1,val:200,date:'2026-10-02'}];d.contas=[{id:'a',val:100,paidAt:'2026-10-01',fromTx:'1'}];const p=projectReference(d);assert.equal(p.expected.transactions.length,2);assert.equal(p.expected.transactions[1].id,'1__dup2');assert.equal(p.sourceDuplicateOccurrences,1);assert.equal(p.sourceLinksValid,true);assert.equal(p.linkManifest[0].status,'UNIQUE_AMOUNT_PAID_DATE');});
test('Auditor não aceita vínculo ambíguo, inexistente ou renomeio com colisão',()=>{const d=source();d.ALL_TX=[{id:1,val:100,date:'2026-10-01'},{id:1,val:100,date:'2026-10-01'}];d.contas=[{id:'a',val:100,paidAt:'2026-10-01',fromTx:'1'}];assert.equal(projectReference(d).sourceLinksValid,false);d.contas[0].fromTx='missing';assert.equal(projectReference(d).sourceLinksValid,false);d.ALL_TX.push({id:'1__dup2',val:3});assert.throws(()=>projectReference(d));});

const stockSource=()=>{const d=source();d.estoque=[{id:101,nome:'Material sintético',name:'Nome explícito',cat:'funil',unid:'Kg',qty:2,custo:85.25,unit:85.25,minimo:1,minQty:1,forn:'Fornecedor fictício'}];return d;};
test('Auditor v2 cobre estoque preenchido e preserva aliases conflitantes sem sobrescrever',()=>{
 const d=stockSource(),p=projectReference(d);
 assert.deepEqual(p.expected.stock[0],{...d.estoque[0],category:'funil'});
 assert.notEqual(p.expected.stock[0],d.estoque[0]);
 const {a}=setup();Object.assign(a,p.expected);const r=compareExpected(p,a);
 assert.equal(r.derivedCount,0);assert.equal(r.missingExpectedCount,0);assert.equal(r.pass,true);
});
for(const [name,change]of [['quantidade',r=>r.qty=3],['custo',r=>r.custo=86],['tipo do ID',r=>r.id='101'],['campo legado removido',r=>delete r.forn]])
 test('Auditor v2 detecta alteração de estoque: '+name,()=>{const p=projectReference(stockSource()),{a}=setup();Object.assign(a,structuredClone(p.expected));change(a.stock[0]);const r=compareExpected(p,a);assert.equal(r.derivedCount,1);assert.equal(r.missingExpectedCount,1);assert.equal(r.pass,false);});
test('Auditor v2 bloqueia campo novo e colisão numérico/textual no estoque',()=>{
 const d=stockSource();d.estoque[0].unknown=1;assert.throws(()=>projectReference(d),/Campo sem cobertura: estoque/);
 delete d.estoque[0].unknown;d.estoque.push({...d.estoque[0],id:'101'});assert.throws(()=>projectReference(d),/Identidade inválida/);
});
