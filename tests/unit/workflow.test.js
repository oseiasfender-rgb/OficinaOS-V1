import test from 'node:test';
import assert from 'node:assert/strict';
import { createChecklistService } from '../../src/modules/ordem-servico/checklist-service.js';
import { createOrdemServicoService } from '../../src/modules/ordem-servico/ordem-servico-service.js';
import { createAgendaService } from '../../src/modules/agenda/agenda-service.js';
import { canonicalFromLegacy } from '../../src/data/legacy-compat.js';
import { exportLegacyCompatibleBackup } from '../../src/data/backup-service.js';
import { STATE_STORES } from '../../src/data/schema.js';

function memoryRepo(seed=[]){const rows=new Map(seed.map(x=>[x.id,structuredClone(x)]));return {async list(){return [...rows.values()].map(x=>structuredClone(x));},async get(id){return rows.has(id)?structuredClone(rows.get(id)):null;},async put(row){rows.set(row.id,structuredClone(row));return structuredClone(row);},async delete(id){rows.delete(id);return true;},async count(){return rows.size;}};}
function context(seed={}){const repositories={};for(const name of [...STATE_STORES,'settings','meta','backups'])repositories[name]=memoryRepo(seed[name]||[]);const patches=[];return {repositories,store:{patch(v){patches.push(structuredClone(v));}},eventBus:{emit(){}},patches};}

test('Agenda cria OS, appointment e espelho jobs com vínculo ao orçamento',async()=>{
  const ctx=context({clients:[{id:100,name:'João Silva',nome:'João Silva',veiculos:[{id:1000,marca:'Palio',placa:'ABC1D23'}]}],budgets:[{id:'orc_1',clientId:100,cliente:'João Silva',veiculo:'Palio',servico:'Funilaria',total:2500,status:'Salvo'}]});
  const checklists=createChecklistService(ctx);const workOrders=createOrdemServicoService(ctx);const agenda=createAgendaService({...ctx,workOrders,checklists});
  const ag=await agenda.createFromBudget('orc_1',{date:'2026-09-18',dueDate:'2026-09-25'});
  assert.equal((await ctx.repositories.appointments.list()).length,1);
  const os=(await ctx.repositories.workOrders.list())[0];
  assert.equal(ag.workOrderId,os.id);assert.equal(os.budgetId,'orc_1');assert.equal(os.clientId,100);
  const job=(await ctx.repositories.jobs.list())[0];assert.equal(job.orcamentoId,'orc_1');assert.equal(job.cliente,'João Silva');assert.equal(job.done,false);
  const budget=await ctx.repositories.budgets.get('orc_1');assert.equal(budget.osId,os.id);assert.equal(budget.status,'Agendado');
});

test('Checklist usa as 11 etapas e persiste conclusão por OS',async()=>{
  const ctx=context();const checklists=createChecklistService(ctx);const row=await checklists.get('workOrder','os_1');
  assert.equal(Object.keys(row.stages).length,11);assert.equal(row.currentStage,'entrada');
  await checklists.setItem('workOrder','os_1','entrada',0,true);await checklists.setCurrentStage('workOrder','os_1','desmontagem');
  const saved=await ctx.repositories.checklists.get('os:os_1');assert.equal(saved.stages.entrada[0].done,true);assert.equal(saved.currentStage,'desmontagem');
});

test('Marcar OS entregue mantém jobs compatível e não cria receita antes da Fase 7',async()=>{
  const ctx=context({clients:[{id:1,name:'Cliente',nome:'Cliente'}]});const osService=createOrdemServicoService(ctx);
  const os=await osService.create({clientId:1,clientName:'Cliente',vehicle:'Toro',service:'Pintura',entryDate:'2026-09-18',dueDate:'2026-09-20',value:1800});
  await osService.markDelivered(os.id);const saved=await ctx.repositories.workOrders.get(os.id);const job=(await ctx.repositories.jobs.list())[0];
  assert.equal(saved.status,'Entregue');assert.equal(saved.stage,'entregue');assert.equal(saved.financialSyncPending,true);assert.equal(job.done,true);assert.equal((await ctx.repositories.transactions.list()).length,0);
});

test('Migração do Clean v8 separa jobs em OS e Agenda e recupera checklist central',()=>{
  const canonical=canonicalFromLegacy({
    clientes:[{id:10,nome:'Maria'}],
    orcHistorico:[{id:'orc_a',cliente:'Maria',total:900}],
    jobs:[{id:7,cliente:'Maria',veiculo:'Corsa',tipo:'Funilaria',entrada:'2026-09-18',entrega:'2026-09-22',val:900,orcamentoId:'orc_a',done:false}],
    oficinaos_provisorio_integrado_v1:{schemaVersion:1,ordensServico:[],agendamentos:[],checklists:{'orc:orc_a':{etapas:{entrada:[true,false]},stage:'entrada'}}}
  });
  assert.equal(canonical.workOrders.length,1);assert.equal(canonical.appointments.length,1);assert.equal(canonical.workOrders[0].legacyJobId,7);assert.equal(canonical.checklists[0].id,'orc:orc_a');
});

test('Backup compatível exporta jobs, fp_agenda e estado integrado com OS/checklists',async()=>{
  const repos={};for(const name of STATE_STORES)repos[name]=memoryRepo();repos.settings=memoryRepo();repos.meta=memoryRepo();
  repos.jobs=memoryRepo([{id:3,cliente:'A',done:false}]);repos.workOrders=memoryRepo([{id:'os_3',legacyJobId:3,number:'OS-2026-0001',clientId:1,stage:'entrada',status:'Agendada'}]);repos.appointments=memoryRepo([{id:'ag_3',workOrderId:'os_3',clientId:1,date:'2026-09-18',clientName:'A',status:'Agendado'}]);repos.checklists=memoryRepo([{id:'os:os_3',contextType:'workOrder',contextId:'os_3',currentStage:'entrada',stages:{entrada:[{label:'Foto',done:false}]}}]);
  const backup=await exportLegacyCompatibleBackup(repos);assert.equal(backup.version,'2.6-modular-compatible');assert.equal(backup.jobs.length,1);assert.equal(backup.fp_agenda.length,1);assert.equal(backup.oficinaos_provisorio_integrado_v1.ordensServico.length,1);assert.ok(backup.oficinaos_provisorio_integrado_v1.checklists['os:os_3']);
});

test('Migração preserva jobs ausentes quando o estado central legado está parcial',()=>{
  const canonical=canonicalFromLegacy({
    clientes:[{id:1,nome:'A'},{id:2,nome:'B'}],
    jobs:[
      {id:11,cliente:'A',entrada:'2026-09-18',entrega:'2026-09-20'},
      {id:12,cliente:'B',entrada:'2026-09-19',entrega:'2026-09-21'}
    ],
    oficinaos_provisorio_integrado_v1:{
      schemaVersion:1,
      ordensServico:[{id:'os_central_11',legacyId:11,clienteId:1,entrada:'2026-09-18',entregaPrevista:'2026-09-20'}],
      agendamentos:[],checklists:{}
    }
  });
  assert.equal(canonical.workOrders.length,2);
  assert.ok(canonical.workOrders.some(os=>String(os.legacyJobId)==='11'));
  assert.ok(canonical.workOrders.some(os=>String(os.legacyJobId)==='12'));
});

test('Migração elimina Agenda duplicada entre estado central e fp_agenda',()=>{
  const duplicated={id:'ag_1',osId:'os_1',clienteId:1,data:'2026-09-18',status:'Agendado'};
  const canonical=canonicalFromLegacy({
    clientes:[{id:1,nome:'A'}],
    jobs:[],
    fp_agenda:[duplicated],
    oficinaos_provisorio_integrado_v1:{schemaVersion:1,ordensServico:[{id:'os_1',clienteId:1,entrada:'2026-09-18'}],agendamentos:[duplicated],checklists:{}}
  });
  assert.equal(canonical.appointments.length,1);
  assert.equal(canonical.appointments[0].id,'ag_1');
});

test('Backup integrado inclui lançamentos canônicos além de ALL_TX',async()=>{
  const repos={};for(const name of STATE_STORES)repos[name]=memoryRepo();repos.settings=memoryRepo();repos.meta=memoryRepo();
  repos.transactions=memoryRepo([{id:'tx_1',type:'rec',desc:'Receita OS',cat:'Serviços',val:500,date:'2026-09-18',paid:'Pendente',osId:'os_1'}]);
  const backup=await exportLegacyCompatibleBackup(repos);
  assert.equal(backup.ALL_TX.length,1);
  assert.equal(backup.oficinaos_provisorio_integrado_v1.lancamentos.length,1);
  assert.equal(backup.oficinaos_provisorio_integrado_v1.lancamentos[0].tipo,'receita');
});

test('Consultar checklist e estatísticas não grava rascunho; edição explícita persiste',async()=>{
 const ctx=context(),service=createChecklistService(ctx);const row=await service.get('budget','orc_sem_salvar');assert.equal(row.updatedAt,null);const stats=await service.stats('budget','orc_sem_salvar');assert.ok(stats.total>0);assert.equal((await ctx.repositories.checklists.list()).length,0);assert.equal(ctx.patches.length,0);
 await service.setItem('budget','orc_sem_salvar','entrada',0,true);const stored=await ctx.repositories.checklists.get('orc:orc_sem_salvar');assert.equal(stored.stages.entrada[0].done,true);assert.ok(stored.updatedAt);
});

test('Agenda aceita IDs numéricos do cadastro vindos dos selects e preserva a identidade',async()=>{
 const ctx=context({clients:[{id:100,name:'Cliente numérico'}],budgets:[{id:7,clientId:100,cliente:'Cliente numérico',total:500}]});
 const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 const ag=await agenda.create({clientId:'100',budgetId:'7',date:'2026-10-08'});
 assert.equal(ag.clientId,100);assert.equal(ag.budgetId,7);assert.equal((await workOrders.get(ag.workOrderId)).clientId,100);
 assert.equal((await agenda.budgetContext('7')).client.id,100);
});

test('Agendar novamente o mesmo orçamento reutiliza OS e preserva checklist já preenchido',async()=>{
 const ctx=context({clients:[{id:1,name:'Cliente'}],budgets:[{id:'b1',clientId:1,cliente:'Cliente',total:500}]});
 const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 await checklists.setItem('budget','b1','entrada',0,true);
 const first=await agenda.createFromBudget('b1',{date:'2026-10-08'});
 await checklists.setItem('workOrder',first.workOrderId,'entrada',1,true);
 const second=await agenda.createFromBudget('b1',{date:'2026-10-08'});
 assert.equal(second.id,first.id);assert.equal((await ctx.repositories.workOrders.list()).length,1);
 assert.equal((await ctx.repositories.jobs.list()).length,1);assert.equal((await ctx.repositories.appointments.list()).length,1);
 assert.equal((await checklists.get('workOrder',first.workOrderId)).stages.entrada[1].done,true);
});

test('Entregar e reabrir pela OS sincroniza Agenda e etapa do checklist sem criar receita',async()=>{
 const tx=[{id:'real',type:'rec',val:123,paid:'Pago'}];const ctx=context({clients:[{id:1,name:'Cliente'}],transactions:tx});
 const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 const ag=await agenda.create({clientId:1,date:'2026-10-08',dueDate:'2026-10-10'});
 await checklists.setItem('workOrder',ag.workOrderId,'entrada',0,true);
 await workOrders.markDelivered(ag.workOrderId);
 assert.equal((await agenda.get(ag.id)).status,'Concluído');assert.equal((await checklists.get('workOrder',ag.workOrderId)).currentStage,'entregue');
 await workOrders.reopen(ag.workOrderId);
 assert.equal((await agenda.get(ag.id)).status,'Agendado');assert.equal((await checklists.get('workOrder',ag.workOrderId)).currentStage,'controle');
 assert.equal((await checklists.get('workOrder',ag.workOrderId)).stages.entrada[0].done,true);
 assert.deepEqual(await ctx.repositories.transactions.list(),tx);
});

test('Excluir OS preserva cópia dos vínculos e remove referências órfãs do orçamento e checklist',async()=>{
 const ctx=context({clients:[{id:1,name:'Cliente'}],budgets:[{id:'b1',clientId:1,cliente:'Cliente',total:500}]});
 const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 const ag=await agenda.createFromBudget('b1',{date:'2026-10-08'});await checklists.setItem('workOrder',ag.workOrderId,'entrada',0,true);
 await workOrders.remove(ag.workOrderId);
 assert.equal((await ctx.repositories.appointments.list()).length,0);assert.equal((await ctx.repositories.jobs.list()).length,0);
 assert.equal(await ctx.repositories.checklists.get('os:'+ag.workOrderId),null);
 assert.ok(!ctx.patches.at(-1).checklists.some(row=>row.id==='os:'+ag.workOrderId));
 assert.equal((await ctx.repositories.budgets.get('b1')).osId,null);
 const backup=(await ctx.repositories.deletionBackups.list())[0];assert.equal(backup.payload.id,ag.workOrderId);assert.equal(backup.related.appointments[0].id,ag.id);assert.equal(backup.related.checklist.stages.entrada[0].done,true);assert.equal(backup.related.budget.osId,ag.workOrderId);
});

test('Agenda e OS rejeitam cliente diferente do orçamento sem gravar vínculos incorretos',async()=>{
 const ctx=context({clients:[{id:1,name:'Cliente A'},{id:2,name:'Cliente B'}],budgets:[{id:'b1',clientId:1,cliente:'Cliente A'}]});
 const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 await assert.rejects(()=>agenda.create({budgetId:'b1',clientId:2,date:'2026-10-08'}),/não corresponde/);
 await assert.rejects(()=>workOrders.create({budgetId:'b1',clientId:'2'}),/não corresponde/);
 assert.equal((await ctx.repositories.workOrders.list()).length,0);assert.equal((await ctx.repositories.appointments.list()).length,0);
 assert.equal((await ctx.repositories.budgets.get('b1')).osId,undefined);
});

test('Agenda rejeita vínculo inexistente e data inválida antes de criar qualquer registro',async()=>{
 const ctx=context({clients:[{id:1,name:'Cliente'}]});const checklists=createChecklistService(ctx),workOrders=createOrdemServicoService(ctx),agenda=createAgendaService({...ctx,workOrders,checklists});
 await assert.rejects(()=>agenda.create({clientId:'inexistente',clientName:'Nome livre',date:'2026-10-08'}),/Cliente.*não encontrado/);
 await assert.rejects(()=>agenda.create({clientId:1,budgetId:'inexistente',date:'2026-10-08'}),/Orçamento.*não encontrado/);
 await assert.rejects(()=>agenda.create({clientId:1,date:'2026-02-30'}),/data/i);
 assert.equal((await ctx.repositories.workOrders.list()).length,0);assert.equal((await ctx.repositories.jobs.list()).length,0);assert.equal((await ctx.repositories.appointments.list()).length,0);
});
