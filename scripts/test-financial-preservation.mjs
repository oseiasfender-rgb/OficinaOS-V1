import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const sorted=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
function same(a,b,message){assert.ok(isDeepStrictEqual(a,b),message);}
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { canonicalFromLegacy } from '../src/data/legacy-compat.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Informe backup e caminho das evidências privadas.');
const bytes=await fs.readFile(input),seed=canonicalFromLegacy(JSON.parse(bytes));
const baseUrl=process.env.OFICINAOS_BASE_URL||'http://127.0.0.1:4175/';
for(let i=0;i<50;i++){try{await fetch(baseUrl);break;}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch({headless:true,executablePath:process.env.OFICINAOS_CHROMIUM_EXECUTABLE,args:['--headless','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage();
const result={at:new Date().toISOString(),snapshotSha256:crypto.createHash('sha256').update(bytes).digest('hex'),browser:browser.version(),gates:[],pass:false};
try{
 await page.goto(process.env.OFICINAOS_BASE_URL||'http://127.0.0.1:4175/');
 const operations=['conciliar','editar lançamento','pagar lançamento','desfazer pagamento lançamento','editar conta','pagar conta','desfazer pagamento conta','criar despesa','criar conta','recorrência','DAS'];
 for(const operation of operations){
  const outcome=await page.evaluate(async({seed,operation})=>{
   const {createDatabase}=await import('/src/data/indexeddb.js');const {createRepositories}=await import('/src/data/repositories/index.js');
   const {createFinancialServices}=await import('/src/modules/financeiro/financeiro-service.js');const {exportLegacyCompatibleBackup}=await import('/src/data/backup-service.js');const {canonicalFromLegacy}=await import('/src/data/legacy-compat.js');
   const db=await createDatabase(),repositories=createRepositories(db);for(const [name,repo]of Object.entries(repositories))await repo.replaceAll(seed[name]||[]);
   const {financeiro,contas}=createFinancialServices({repositories});
   const allowedTx=new Set(),allowedAccounts=new Set();
   const c=seed.accounts.find(c=>seed.transactions.some(t=>String(t.id)===String(c.fromTx||c.paidTxId)));const t=seed.transactions.find(t=>String(t.id)===String(c.fromTx||c.paidTxId));
   if(operation==='conciliar'){await financeiro.reconcile();await contas.reconcile();}
   if(operation.includes('lançamento')){allowedTx.add(String(t.id));for(const a of seed.accounts)if(String(a.fromTx||a.paidTxId)===String(t.id)||String(a.id)===String(t.contaId))allowedAccounts.add(String(a.id));
    if(operation==='editar lançamento')await financeiro.update(t.id,{cat:'Categoria de teste'});else{await financeiro.setPaid(t.id,true);if(operation.startsWith('desfazer'))await financeiro.setPaid(t.id,false);}}
   if(['editar conta','pagar conta','desfazer pagamento conta'].includes(operation)){allowedAccounts.add(String(c.id));allowedTx.add(String(t.id));if(operation==='editar conta')await contas.update(c.id,{val:c.val+1});else{await contas.setPaid(c.id,true);if(operation.startsWith('desfazer'))await contas.setPaid(c.id,false);}}
   if(operation==='criar despesa')await financeiro.create({id:'teste_nova',desc:'Despesa de teste',val:11,date:'2099-01-01'});
   if(operation==='criar conta')await contas.create({id:'teste_conta',name:'Conta de teste',val:12,due:'2099-01-01'});
   if(operation==='recorrência'){const a=await contas.create({id:'teste_rec',name:'Recorrência isolada de teste',val:13,due:'2099-01-10',recur:true});await contas.generateRecurring(2099,1);const count=await repositories.accounts.count();await contas.generateRecurring(2099,1);if(count!==await repositories.accounts.count())throw new Error('Recorrência duplicada');await contas.terminateRecurring(a.id,'2099-02');}
   if(operation==='DAS'){await contas.setDasPaid(2099,0,true);const count=await repositories.transactions.count();await contas.setDasPaid(2099,0,true);if(count!==await repositories.transactions.count())throw new Error('DAS duplicado');await contas.setDasPaid(2099,0,false);}
   const snapshot={};for(const[name,repo]of Object.entries(repositories))snapshot[name]=await repo.list();
   const compatible=await exportLegacyCompatibleBackup(repositories);const roundtrip=canonicalFromLegacy(compatible);
   // Reimportação usa exatamente o snapshot modular exportado.
   for(const[name,repo]of Object.entries(repositories))await repo.replaceAll(roundtrip[name]||[]);
   db.close();return {snapshot,allowedTx:[...allowedTx],allowedAccounts:[...allowedAccounts]};
  },{seed,operation});
  for(const [name,allowed]of [['transactions',outcome.allowedTx],['accounts',outcome.allowedAccounts]]){
   const map=new Map(outcome.snapshot[name].map(x=>[String(x.id),x]));
   for(const row of seed[name])if(!allowed.includes(String(row.id)))same(map.get(String(row.id)),row,`${operation}: ${name} alterado`);
  }
  for(const name of ['clients','jobs','workOrders','appointments','checklists','budgets','categories','goals','stock'])same(sorted(outcome.snapshot[name]),sorted(seed[name]||[]),`${operation}: ${name}`);
  if(operation==='conciliar'){assert.equal(outcome.snapshot.transactions.length,seed.transactions.length);assert.equal(outcome.snapshot.accounts.length,seed.accounts.length);}
  await page.reload();
  const persisted=await page.evaluate(async()=>{const {createDatabase}=await import('/src/data/indexeddb.js');const {createRepositories}=await import('/src/data/repositories/index.js');const db=await createDatabase(),r=createRepositories(db),out={};for(const[name,repo]of Object.entries(r))out[name]=await repo.list();db.close();return out;});
  for(const[name,rows]of Object.entries(outcome.snapshot))same(sorted(persisted[name]),sorted(rows),`${operation}: reload/reimportação ${name}`);
  result.gates.push({operation,pass:true,preservedHistoricalTransactions:seed.transactions.length-outcome.allowedTx.length,preservedHistoricalAccounts:seed.accounts.length-outcome.allowedAccounts.length,reload:true,exportReimport:true});
 }
 result.pass=true;
}finally{await browser.close();await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({pass:result.pass,gates:result.gates.length,snapshotSha256:result.snapshotSha256}));
