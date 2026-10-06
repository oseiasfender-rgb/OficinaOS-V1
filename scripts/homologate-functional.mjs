import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { STATE_STORES } from '../src/data/schema.js';
import { createSimpleModuleServices } from '../src/modules/simple-modules.js';
import { createWorkflowServices } from '../src/modules/workflow-services.js';
import { createHistoryServices } from '../src/modules/history-services.js';
import { exportLegacyCompatibleBackup } from '../src/data/backup-service.js';
import { canonicalFromLegacy } from '../src/data/legacy-compat.js';
import { auditCanonical, compareFinancialSignatures, financialSignatures } from '../src/data/integrity.js';

const [outputJsonPath, outputMdPath] = process.argv.slice(2);

function clone(v){ return structuredClone(v); }
function memoryRepo(seed=[]){
  const rows=new Map((seed||[]).map(row=>[row.id,clone(row)]));
  return {
    async list(){return [...rows.values()].map(clone);},
    async get(id){return rows.has(id)?clone(rows.get(id)):null;},
    async put(row){rows.set(row.id,clone(row));return clone(row);},
    async delete(id){rows.delete(id);return true;},
    async count(){return rows.size;},
    async replaceAll(list=[]){rows.clear();for(const row of list)rows.set(row.id,clone(row));return list.length;}
  };
}
function createEventBus(){
  const listeners=new Map();
  return {
    on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);return()=>listeners.get(type)?.delete(fn);},
    emit(type,payload){for(const fn of listeners.get(type)||[])fn(payload);}
  };
}
function createContext(seed={}){
  const repositories={};
  for(const name of [...STATE_STORES,'settings','meta','backups']) repositories[name]=memoryRepo(seed[name]||[]);
  const state={};
  return {repositories,eventBus:createEventBus(),store:{patch(patch){Object.assign(state,clone(patch));}},state};
}
async function snapshot(repositories){
  const out={};
  for(const name of STATE_STORES)out[name]=await repositories[name].list();
  out.settings=await repositories.settings.list();
  out.meta=await repositories.meta.list();
  return out;
}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function pushGate(evidence,name,pass,detail){evidence.gates[name]={pass:!!pass,detail};if(!pass)evidence.result.pass=false;}
function safeKeys(model){return JSON.stringify(model).toLowerCase();}

const evidence={
  generatedAt:new Date().toISOString(),
  mode:'service-level-no-browser',
  scope:'Cliente → Orçamento → Agenda → OS → Checklist → Entrega → Financeiro + Contas + Histórico/Lixeira + export/reimport',
  result:{pass:true},gates:{},artifacts:{}
};

try{
  const ctx=createContext({settings:[{id:'os_config',value:{nome:'Oficina Homologação',dono:'Responsável',cidade:'Leme'}}]});
  const history=createHistoryServices(ctx);
  const simple=createSimpleModuleServices(ctx);
  const workflow=createWorkflowServices(ctx);

  const client=await simple.clientes.create({
    nome:'Cliente Homologação',fone:'19999990000',email:'homologacao@example.invalid',doc:'TESTE',
    veiculos:[{marca:'Veículo Teste',placa:'ABC1D23',cor:'Prata',ano:'2020'}]
  });
  assert.ok(client.id!=null);
  pushGate(evidence,'clientCreated',true,`clienteId=${client.id}`);

  const budget=await workflow.orcamento.save({
    clientId:client.id,clientName:client.nome,clientPhone:client.fone,vehicle:'Veículo Teste',vehiclePlate:'ABC1D23',
    service:'Funilaria e pintura de homologação',entryDate:'2026-09-18',dueDate:'2026-09-25',priority:'normal',payment:'À vista',warrantyDays:'90',
    notes:'Observação comercial de homologação',internalNotes:'CUSTO INTERNO NÃO PODE IR AO PDF',complexity:'basico',hourRate:100,
    laborProcesses:[{key:'funilaria',label:'Funilaria',hours:10}],materials:[{name:'Material teste',qty:1,unit:100}],
    serviceItems:[{desc:'Ajuste complementar',qty:1,value:200}],parts:[{name:'Peça recuperada',condition:'Boa',qty:1,value:300}],
    thirdParties:[{desc:'Terceiro',value:150}],freight:{displacement:50,parts:0,tow:0},marginPercent:20,discountPercent:0,status:'Salvo'
  });
  assert.equal(budget.total,2250);
  pushGate(evidence,'budgetCalculation',budget.total===2250,`total=${budget.total}`);

  const commercial=await workflow.orcamento.commercialModel(budget.id);
  const serialized=safeKeys(commercial);
  const forbidden=['hourrate','marginpercent','internalnotes','laborprocesses','materials'];
  const leaked=forbidden.filter(key=>serialized.includes(key));
  pushGate(evidence,'commercialPdfModelPrivacy',leaked.length===0,leaked.length?`campos internos encontrados: ${leaked.join(', ')}`:'modelo comercial sem campos internos de custo/margem/hora');
  assert.equal(commercial.total,2250);

  const appointment=await workflow.agenda.createFromBudget(budget.id,{date:'2026-09-18',dueDate:'2026-09-25',time:'08:00'});
  const os=await ctx.repositories.workOrders.get(appointment.workOrderId);
  const job=(await ctx.repositories.jobs.list()).find(row=>String(row.osId)===String(os.id));
  assert.ok(os && job);
  assert.equal(String(os.budgetId),String(budget.id));
  assert.equal(String(os.clientId),String(client.id));
  pushGate(evidence,'agendaOsLinks',true,`agenda=${appointment.id}; os=${os.id}; job=${job.id}; budget=${budget.id}`);

  await workflow.checklists.setItem('workOrder',os.id,'entrada',0,true);
  await workflow.checklists.setCurrentStage('workOrder',os.id,'desmontagem');
  const checklistBeforeDelivery=await workflow.checklists.get('workOrder',os.id);
  assert.equal(checklistBeforeDelivery.stages.entrada[0].done,true);
  assert.equal(checklistBeforeDelivery.currentStage,'desmontagem');
  pushGate(evidence,'checklistPersistence',true,'item Entrada persistido e etapa atual=desmontagem');

  await workflow.agenda.markDone(appointment.id);
  const delivered=await ctx.repositories.workOrders.get(os.id);
  assert.equal(delivered.status,'Entregue');
  assert.equal(delivered.financialSyncPending,true);
  let sync1=await workflow.financeiro.syncDeliveredWorkOrders();
  let sync2=await workflow.financeiro.syncDeliveredWorkOrders();
  const osRevenue=(await ctx.repositories.transactions.list()).filter(t=>String(t.workOrderId||'')===String(os.id)&&t.type==='rec');
  assert.equal(sync1.added,1);assert.equal(sync2.added,0);assert.equal(osRevenue.length,1);assert.equal(osRevenue[0].paid,'Não pago');
  pushGate(evidence,'deliveryFinancialIdempotence',true,`primeira sincronização +${sync1.added}; segunda +${sync2.added}; receitas OS=${osRevenue.length}`);

  const expense=await workflow.financeiro.create({type:'dep',desc:'Energia homologação',cat:'Energia Elétrica',val:'250,00',date:'2026-09-18'});
  const account=(await ctx.repositories.accounts.list()).find(a=>String(a.fromTx||'')===String(expense.id));
  assert.ok(account);assert.equal(String(account.paidTxId),String(expense.id));
  await workflow.contas.setPaid(account.id,true);
  const paidAccount=await ctx.repositories.accounts.get(account.id);
  const paidTx=await ctx.repositories.transactions.get(expense.id);
  assert.equal(paidAccount.paid,true);assert.equal(paidTx.paid,'Pago');
  await workflow.contas.setPaid(account.id,false);
  const unpaidAccount=await ctx.repositories.accounts.get(account.id);
  const unpaidTx=await ctx.repositories.transactions.get(expense.id);
  assert.equal(unpaidAccount.paid,false);assert.equal(unpaidTx.paid,'Não pago');
  pushGate(evidence,'accountPaymentReversal',true,`conta=${account.id}; tx=${expense.id}; vínculo preservado após pagar/desfazer`);

  const linksBefore=await history.historicoOrcamentos.links(budget);
  assert.ok(linksBefore.total>=3);
  await history.historicoOrcamentos.archive(budget.id);
  assert.equal(await ctx.repositories.budgets.get(budget.id),null);
  assert.ok(await ctx.repositories.archivedBudgets.get(budget.id));
  await history.historicoOrcamentos.restore(budget.id,'archived');
  const trashMove=await history.historicoOrcamentos.moveToTrash(budget.id,'active');
  assert.equal(await ctx.repositories.budgets.get(budget.id),null);
  assert.ok(trashMove.links.total>=linksBefore.total);
  await history.historicoOrcamentos.restore(budget.id,'trash');
  assert.ok(await ctx.repositories.budgets.get(budget.id));
  assert.ok(await ctx.repositories.workOrders.get(os.id));
  assert.equal((await ctx.repositories.transactions.list()).filter(t=>String(t.workOrderId||'')===String(os.id)).length,1);
  pushGate(evidence,'historyArchiveTrashRestore',true,`vínculos antes=${linksBefore.total}; na lixeira=${trashMove.links.total}; budgetId preservado=${budget.id}`);

  await new Promise(resolve=>setTimeout(resolve,30));
  const events=await ctx.repositories.operationalHistory.list();
  pushGate(evidence,'operationalHistory',events.length>0,`eventos=${events.length}`);

  const before=await snapshot(ctx.repositories);
  const beforeAudit=auditCanonical(before);
  const beforeFinancial=financialSignatures(before);
  assert.equal(beforeAudit.duplicateCount,0);
  const exported=await exportLegacyCompatibleBackup(ctx.repositories);
  const canonical=canonicalFromLegacy(exported);
  const afterAudit=auditCanonical(canonical);
  const afterFinancial=financialSignatures(canonical);
  const financialComparison=compareFinancialSignatures(beforeFinancial,afterFinancial);
  assert.equal(afterAudit.duplicateCount,0);
  assert.equal(financialComparison.equal,true);
  const critical=['transactions','accounts','jobs','clients','workOrders','appointments','checklists','budgets'];
  const differences=critical.filter(name=>hash(before[name]||[])!==hash(canonical[name]||[]));
  pushGate(evidence,'exportReimportFinancialSignatures',financialComparison.equal,financialComparison.equal?'assinaturas Financeiro/Contas idênticas':financialComparison.differences.join(', '));
  pushGate(evidence,'exportReimportCriticalStores',differences.length===0,differences.length?`diferenças: ${differences.join(', ')}`:'hashes críticos idênticos');
  pushGate(evidence,'noDuplicateIdsAfterRoundTrip',afterAudit.duplicateCount===0,`duplicados=${afterAudit.duplicateCount}`);

  const reloaded=createContext(canonical);
  const reloadedWorkflow=createWorkflowServices(reloaded);
  const osReload=await reloaded.repositories.workOrders.get(os.id);
  const budgetReload=await reloaded.repositories.budgets.get(budget.id);
  const apReload=await reloaded.repositories.appointments.get(appointment.id);
  const revenueReload=(await reloaded.repositories.transactions.list()).filter(t=>String(t.workOrderId||'')===String(os.id)&&t.type==='rec');
  const checklistReload=await reloadedWorkflow.checklists.get('workOrder',os.id);
  const relationPass=!!osReload&&!!budgetReload&&!!apReload&&revenueReload.length===1&&checklistReload.stages.entrada[0].done===true;
  pushGate(evidence,'serviceReloadFromExport',relationPass,`budget=${!!budgetReload}; os=${!!osReload}; agenda=${!!apReload}; receitaOS=${revenueReload.length}; checklistEntrada=${checklistReload.stages.entrada[0].done}`);

  evidence.counts={before:beforeAudit.counts,afterRoundTrip:afterAudit.counts};
  evidence.financialSignatures={before:beforeFinancial,after:afterFinancial,comparison:financialComparison};
  evidence.relationships={clientId:client.id,budgetId:budget.id,appointmentId:appointment.id,workOrderId:os.id,legacyJobId:job.id,accountId:account.id,expenseId:expense.id,osRevenueId:osRevenue[0].id};
  evidence.result.pass=Object.values(evidence.gates).every(g=>g.pass);
  evidence.result.note='PASS de serviços/memória. Não substitui homologação em navegador real/IndexedDB/impressão.';
  history.dispose();
}catch(error){
  evidence.result.pass=false;
  evidence.result.error={name:error.name,message:error.message,stack:error.stack};
}

const md=[];
md.push('# Homologação Funcional — OficinaOS Modular v0.9.1 RC1','',`Gerado em: ${evidence.generatedAt}`,'',`Resultado: **${evidence.result.pass?'PASS':'FAIL'}**`,'','## Gates','');
for(const [name,gate] of Object.entries(evidence.gates))md.push(`- ${name}: **${gate.pass?'OK':'FALHOU'}** — ${gate.detail}`);
md.push('','## Escopo','',evidence.scope,'','## Limite desta evidência','','Esta execução usa repositories em memória e services reais do OficinaOS. Ela valida regras de negócio, vínculos e round-trip, mas **não** comprova IndexedDB/reload em navegador, impressão/PDF real nem o build Vite.','');
if(evidence.counts)md.push('## Contagens do cenário sintético','','```json',JSON.stringify(evidence.counts,null,2),'```','');
if(evidence.result.error)md.push('## Erro','','```',`${evidence.result.error.name}: ${evidence.result.error.message}`,'```','');

if(outputJsonPath)await fs.writeFile(outputJsonPath,JSON.stringify(evidence,null,2)+'\n');
if(outputMdPath)await fs.writeFile(outputMdPath,md.join('\n')+'\n');
console.log(JSON.stringify(evidence,null,2));
if(!evidence.result.pass)process.exitCode=1;
