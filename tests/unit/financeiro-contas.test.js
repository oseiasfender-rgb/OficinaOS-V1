import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinancialServices } from '../../src/modules/financeiro/financeiro-service.js';
import { monthSummary, reconcileFinancialData } from '../../src/modules/financeiro/financial-model.js';
import { exportLegacyCompatibleBackup } from '../../src/data/backup-service.js';
import { STATE_STORES } from '../../src/data/schema.js';

function memoryRepo(seed=[]){const rows=new Map(seed.map(x=>[x.id,structuredClone(x)]));return {async list(){return [...rows.values()].map(x=>structuredClone(x));},async get(id){return rows.has(id)?structuredClone(rows.get(id)):null;},async put(row){rows.set(row.id,structuredClone(row));return structuredClone(row);},async delete(id){rows.delete(id);return true;},async count(){return rows.size;},async replaceAll(list=[]){rows.clear();for(const row of list)rows.set(row.id,structuredClone(row));return list.length;}};}
function context(seed={}){const repositories={};for(const name of [...STATE_STORES,'settings','meta','backups'])repositories[name]=memoryRepo(seed[name]||[]);const patches=[];const events=[];return {repositories,store:{patch(v){patches.push(structuredClone(v));}},eventBus:{emit(name,payload){events.push([name,structuredClone(payload)]);}},patches,events};}

 test('Despesa manual cria uma Conta vinculada ao mesmo lançamento sem duplicar despesa',async()=>{
  const ctx=context();const {financeiro}=createFinancialServices(ctx);const tx=await financeiro.create({type:'dep',desc:'Energia',val:'250,00',date:'2026-09-18',cat:'Energia Elétrica'});
  const txs=await ctx.repositories.transactions.list(),accounts=await ctx.repositories.accounts.list();assert.equal(txs.length,1);assert.equal(accounts.length,1);assert.equal(String(txs[0].id),String(tx.id));assert.equal(String(txs[0].contaId),String(accounts[0].id));assert.equal(String(accounts[0].fromTx),String(tx.id));assert.equal(String(accounts[0].paidTxId),String(tx.id));
  const rec=await financeiro.reconcile();assert.equal(rec.transactions.length,1);assert.equal(rec.accounts.length,1);
 });

 test('Pagar e desfazer uma Conta reutiliza o mesmo lançamento',async()=>{
  const ctx=context();const {financeiro,contas}=createFinancialServices(ctx);await financeiro.create({type:'dep',desc:'Internet',val:120,date:'2026-09-20',cat:'Internet'});const account=(await ctx.repositories.accounts.list())[0];const txId=account.paidTxId;
  await contas.setPaid(account.id,true);let txs=await ctx.repositories.transactions.list(),a=await ctx.repositories.accounts.get(account.id);assert.equal(txs.length,1);assert.equal(String(txs[0].id),String(txId));assert.equal(txs[0].paid,'Pago');assert.equal(a.paid,true);
  await contas.setPaid(account.id,false);txs=await ctx.repositories.transactions.list();a=await ctx.repositories.accounts.get(account.id);assert.equal(txs.length,1);assert.equal(String(txs[0].id),String(txId));assert.equal(txs[0].paid,'Não pago');assert.equal(txs[0].date,'2026-09-20');assert.equal(a.paid,false);
 });

 test('Conta criada diretamente gera projeção conta_<id> e não cria outra ao pagar',async()=>{
  const ctx=context();const {contas}=createFinancialServices(ctx);const c=await contas.create({id:'abc',name:'Aluguel',cat:'Aluguel / Barracão',val:1500,due:'2026-09-10'});let txs=await ctx.repositories.transactions.list();assert.equal(txs.length,1);assert.equal(txs[0].id,'conta_abc');assert.equal(txs[0].paid,'Não pago');
  await contas.setPaid(c.id,true);txs=await ctx.repositories.transactions.list();assert.equal(txs.length,1);assert.equal(txs[0].id,'conta_abc');assert.equal(txs[0].paid,'Pago');
 });

 test('Editar despesa para receita remove a Conta derivada e preserva o mesmo ID da transação',async()=>{
  const ctx=context();const {financeiro}=createFinancialServices(ctx);const tx=await financeiro.create({type:'dep',desc:'Ajuste',val:90,date:'2026-09-18'});assert.equal((await ctx.repositories.accounts.list()).length,1);await financeiro.update(tx.id,{type:'rec',desc:'Reembolso',paid:'Pago'});assert.equal((await ctx.repositories.accounts.list()).length,0);const saved=await ctx.repositories.transactions.get(tx.id);assert.equal(saved.type,'rec');assert.equal(saved.desc,'Reembolso');
 });

 test('Recorrência é idempotente por competência e Excluir daqui pra frente preserva meses anteriores',async()=>{
  const ctx=context();const {contas}=createFinancialServices(ctx);const first=await contas.create({name:'Internet',cat:'Internet',val:100,due:'2026-08-10',recur:true});let r=await contas.generateRecurring(2026,8);assert.equal(r.added,1);r=await contas.generateRecurring(2026,8);assert.equal(r.added,0);await contas.generateRecurring(2026,9);let rows=await ctx.repositories.accounts.list();assert.ok(rows.some(x=>x.competencia==='2026-08'));assert.ok(rows.some(x=>x.competencia==='2026-09'));assert.ok(rows.some(x=>x.competencia==='2026-10'));
  const sep=rows.find(x=>x.competencia==='2026-09');const ended=await contas.terminateRecurring(sep.id,'2026-09');assert.ok(ended.removed>=2);rows=await ctx.repositories.accounts.list();assert.ok(rows.some(x=>x.competencia==='2026-08'));assert.ok(!rows.some(x=>x.competencia>='2026-09'));r=await contas.generateRecurring(2026,10);assert.equal(r.added,0);assert.ok(first.recurKey);
 });

 test('Sincronização da OS entregue cria uma única receita pendente e é idempotente',async()=>{
  const ctx=context({workOrders:[{id:'os_1',legacyJobId:7,status:'Entregue',financialSyncPending:true,clientName:'José',vehicle:'Palio',value:1800,budgetId:'orc_1'}]});const {financeiro}=createFinancialServices(ctx);let r=await financeiro.syncDeliveredWorkOrders();assert.equal(r.added,1);r=await financeiro.syncDeliveredWorkOrders();assert.equal(r.added,0);const txs=await ctx.repositories.transactions.list();assert.equal(txs.length,1);assert.equal(txs[0].type,'rec');assert.equal(txs[0].paid,'Não pago');assert.equal(txs[0].workOrderId,'os_1');const os=await ctx.repositories.workOrders.get('os_1');assert.equal(os.financialSyncPending,false);assert.equal(String(os.financialTransactionId),String(txs[0].id));
 });

 test('Transferência é neutra no resultado e estorno restaura os saldos',async()=>{
  const ctx=context({settings:[{id:'fp_contas_banco',value:{saldos:{sicoob:1000,dinheiro:100,pix:0},txContas:{}}}]});const {financeiro}=createFinancialServices(ctx);const tx=await financeiro.transfer({fromAccount:'sicoob',toAccount:'pix',val:250,date:'2026-09-18',desc:'Reserva PIX'});let bank=await financeiro.bankState();assert.equal(bank.saldos.sicoob,750);assert.equal(bank.saldos.pix,250);const sum=await financeiro.summary(2026,8);assert.equal(sum.totalReceipts,0);assert.equal(sum.totalExpenses,0);await financeiro.reverseTransfer(tx.id);bank=await financeiro.bankState();assert.equal(bank.saldos.sicoob,1000);assert.equal(bank.saldos.pix,0);assert.equal((await ctx.repositories.transactions.list()).length,0);
 });

 test('Reconciliação preserva conflito de valor em vez de sobrescrevê-lo silenciosamente',()=>{
  const r=reconcileFinancialData([{id:'tx1',type:'dep',desc:'Conta',val:90,date:'2026-09-10',paid:'Não pago',contaId:'c1'}],[{id:'c1',name:'Conta',val:100,due:'2026-09-10',paid:false}]);assert.equal(r.report.conflicts.length,1);assert.equal(r.transactions[0].val,90);assert.equal(r.accounts[0].val,100);
 });

 test('Excluir lançamento vinculado remove Conta e cria backup preventivo',async()=>{
  const ctx=context();const {financeiro}=createFinancialServices(ctx);const tx=await financeiro.create({type:'dep',desc:'Seguro',val:300,date:'2026-09-18'});await financeiro.remove(tx.id);assert.equal((await ctx.repositories.transactions.list()).length,0);assert.equal((await ctx.repositories.accounts.list()).length,0);assert.equal((await ctx.repositories.deletionBackups.list()).length,1);
 });

 test('Backup compatível preserva transferências e vínculos financeiros',async()=>{
  const ctx=context({transactions:[{id:'tr1',type:'transfer',desc:'Transferência',cat:'Transferência',val:50,date:'2026-09-18',paid:'Pago',fromAccount:'sicoob',toAccount:'pix',transferId:'x'},{id:'tx1',type:'dep',desc:'Conta: Água',cat:'Água',val:80,date:'2026-09-20',paid:'Não pago',contaId:'c1',source:'contas'}],accounts:[{id:'c1',name:'Água',cat:'Água',val:80,due:'2026-09-20',paid:false,paidTxId:'tx1'}]});const backup=await exportLegacyCompatibleBackup(ctx.repositories);assert.equal(backup.version,'2.6-modular-compatible');const transfer=backup.oficinaos_provisorio_integrado_v1.lancamentos.find(x=>x.id==='tr1');assert.equal(transfer.tipo,'transferencia');assert.equal(transfer.fromAccount,'sicoob');const expense=backup.ALL_TX.find(x=>x.id==='tx1');assert.equal(expense.contaId,'c1');assert.equal(backup.contas[0].paidTxId,'tx1');
 });

 test('Resumo mensal ignora transferências internas',()=>{const s=monthSummary([{id:1,type:'rec',val:1000,date:'2026-09-01',paid:'Pago'},{id:2,type:'dep',val:400,date:'2026-09-02',paid:'Pago'},{id:3,type:'transfer',val:999,date:'2026-09-03',paid:'Pago'}],2026,8);assert.equal(s.totalReceipts,1000);assert.equal(s.totalExpenses,400);assert.equal(s.result,600);});

test('DAS MEI não pré-marca competências e pagamento é idempotente por das_YYYY_MM',async()=>{
  const ctx=context();const {contas}=createFinancialServices(ctx);let rows=await contas.dasYear(2026);assert.equal(rows.filter(x=>x.paid).length,0);assert.equal(contas.dasValue,87.05);
  let r=await contas.setDasPaid(2026,8,true);assert.equal(r.transactionId,'das_2026_09');r=await contas.setDasPaid(2026,8,true);assert.equal(r.transactionId,'das_2026_09');let txs=await ctx.repositories.transactions.list();assert.equal(txs.filter(x=>x.id==='das_2026_09').length,1);assert.equal(txs.find(x=>x.id==='das_2026_09').val,87.05);rows=await contas.dasYear(2026);assert.equal(rows[8].paid,true);
  await contas.setDasPaid(2026,8,false);txs=await ctx.repositories.transactions.list();assert.equal(txs.some(x=>x.id==='das_2026_09'),false);rows=await contas.dasYear(2026);assert.equal(rows[8].paid,false);
});

test('DAS MEI migra status aninhado sem inventar meses pagos',async()=>{
  const ctx=context({settings:[{id:'fp_das_status',value:{2025:{12:'Pago'},2026:{1:'Pendente',2:'Pago'}}}]});const {contas}=createFinancialServices(ctx);const rows=await contas.dasYear(2026);assert.equal(rows[0].paid,false);assert.equal(rows[1].paid,true);assert.equal(rows.filter(x=>x.paid).length,1);await contas.setDasPaid(2026,2,true);const flat=await ctx.repositories.settings.get('fp_das_v2_status');assert.equal(flat.value['2025-12'],'Pago');assert.equal(flat.value['2026-02'],'Pago');assert.equal(flat.value['2026-03'],'Pago');
});

test('Saldo bancário aceita número brasileiro com sinal',async()=>{
  const ctx=context();const {financeiro}=createFinancialServices(ctx);let bank=await financeiro.setBankBalance('sicoob','-1.234,56');assert.equal(bank.saldos.sicoob,-1234.56);bank=await financeiro.setBankBalance('pix','2.500,10');assert.equal(bank.saldos.pix,2500.10);
});

test('Consultas financeiras preservam integralmente o estado legado, incluindo referências sem destino',async()=>{
 const seed={transactions:[{id:1,date:'2026-09-12',type:'dep',desc:'Original',val:-7,paid:'Pago'}],accounts:[{id:'a',name:'Conta',val:12,due:'2026-09-10',paid:true,paidAt:'',fromTx:'ausente',recur:true}],workOrders:[{id:'os',status:'Entregue',financialSyncPending:true,value:100}]};
 const ctx=context(seed),{financeiro,contas}=createFinancialServices(ctx);
 const snapshot=async()=>Object.fromEntries(await Promise.all(Object.entries(ctx.repositories).map(async([name,repo])=>[name,await repo.list()])));
 const before=await snapshot();
 const rows=await financeiro.list({year:2026,month:8});assert.equal(rows.length,1);assert.equal(rows[0].id,1);
 await financeiro.summary(2026,8);await financeiro.cashFlow({from:'2026-09-01'});await contas.list({year:2026,month:8});await contas.summary(2026,8);
 assert.deepEqual(await snapshot(),before);assert.equal(ctx.events.length,0);assert.equal(ctx.patches.length,0);
});

test('Navegar competências não gera recorrentes sem comando explícito',async()=>{
 const ctx=context({recurringTemplates:[{id:'internet',name:'Internet',category:'Internet',value:100,startDate:'2026-08-10',active:true}]});const {contas}=createFinancialServices(ctx);
 await contas.list({year:2026,month:8});await contas.summary(2026,9);assert.equal((await ctx.repositories.accounts.list()).length,0);assert.equal((await ctx.repositories.transactions.list()).length,0);
 const r=await contas.generateRecurring(2026,8);assert.equal(r.added,1);assert.equal((await ctx.repositories.accounts.list()).length,1);
});
