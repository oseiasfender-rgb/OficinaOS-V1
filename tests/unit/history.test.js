import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_STORES } from '../../src/data/schema.js';
import { createHistoricoOperacionalService } from '../../src/modules/historico-operacional/historico-operacional-service.js';
import { createHistoricoOrcamentosService } from '../../src/modules/historico-orcamentos/historico-orcamentos-service.js';
import { canonicalFromLegacy } from '../../src/data/legacy-compat.js';
import { exportLegacyCompatibleBackup } from '../../src/data/backup-service.js';

function memoryRepo(seed=[]){const rows=new Map(seed.map(x=>[x.id,structuredClone(x)]));return {async list(){return [...rows.values()].map(x=>structuredClone(x));},async get(id){return rows.has(id)?structuredClone(rows.get(id)):null;},async put(row){rows.set(row.id,structuredClone(row));return structuredClone(row);},async delete(id){rows.delete(id);return true;},async count(){return rows.size;},async replaceAll(list=[]){rows.clear();for(const row of list)rows.set(row.id,structuredClone(row));return list.length;}};}
function context(seed={}){const repositories={};for(const name of [...STATE_STORES,'settings','meta','backups'])repositories[name]=memoryRepo(seed[name]||[]);const events=[];const eventBus={emit(name,payload){events.push([name,structuredClone(payload)]);}};const store={patch(){}};const operational=createHistoricoOperacionalService({repositories,eventBus,store});const budgets=createHistoricoOrcamentosService({repositories,eventBus,store,operationalHistory:operational});return {repositories,eventBus,events,store,operational,budgets};}

test('Histórico operacional aplica retenção por máximo sem inventar eventos',async()=>{
  const ctx=context({settings:[{id:'oficina_event_history_config',value:{days:0,max:2}}]});
  await ctx.operational.record({module:'Clientes',action:'Criar',entity:'Cliente',entityId:'1',summary:'A',at:'2026-10-05T00:00:01.000Z'});
  await ctx.operational.record({module:'Agenda',action:'Criar',entity:'Agenda',entityId:'2',summary:'B',at:'2026-10-05T00:00:02.000Z'});
  await ctx.operational.record({module:'OS',action:'Editar',entity:'OS',entityId:'3',summary:'C',at:'2026-10-05T00:00:03.000Z'});
  const rows=await ctx.operational.list();assert.equal(rows.length,2);assert.equal(rows[0].summary,'C');assert.equal(rows[1].summary,'B');
});

test('Arquivar move o orçamento sem trocar ID e cria backup preventivo',async()=>{
  const ctx=context({budgets:[{id:'orc_1',cliente:'Ana',status:'Salvo',total:1000}]});
  const archived=await ctx.budgets.archive('orc_1');assert.equal(archived.id,'orc_1');assert.equal(archived.status,'Arquivado');assert.equal((await ctx.repositories.budgets.list()).length,0);assert.equal((await ctx.repositories.archivedBudgets.list()).length,1);assert.equal((await ctx.repositories.deletionBackups.list()).length,1);
  const evt=(await ctx.repositories.operationalHistory.list()).find(e=>e.action==='Arquivar');assert.ok(evt);
});

test('Lixeira preserva vínculos externos e recuperação restaura o mesmo ID',async()=>{
  const ctx=context({budgets:[{id:'orc_2',cliente:'José',status:'Salvo',total:800}],jobs:[{id:10,budgetId:'orc_2'}],workOrders:[{id:'os1',budgetId:'orc_2'}],transactions:[{id:'tx1',budgetId:'orc_2'}],accounts:[{id:'ct1',budgetId:'orc_2'}]});
  const moved=await ctx.budgets.moveToTrash('orc_2','active');assert.equal(moved.links.total,4);assert.equal((await ctx.repositories.jobs.list()).length,1);assert.equal((await ctx.repositories.workOrders.list()).length,1);assert.equal((await ctx.repositories.transactions.list()).length,1);assert.equal((await ctx.repositories.accounts.list()).length,1);
  const restored=await ctx.budgets.restore('orc_2','trash');assert.equal(restored.id,'orc_2');assert.equal(restored.status,'Salvo');assert.equal((await ctx.repositories.trash.list()).length,0);assert.equal((await ctx.repositories.budgets.list()).length,1);
});

test('Exclusão definitiva exige EXCLUIR e mantém backup e log',async()=>{
  const ctx=context({trash:[{id:'orc_del',entityType:'budget',cliente:'Cliente',status:'Na lixeira',deletedAt:'2026-09-18T10:00:00Z'}]});
  await assert.rejects(()=>ctx.budgets.permanentDelete('orc_del','sim'),/Confirmação reforçada/);assert.ok(await ctx.repositories.trash.get('orc_del'));
  const log=await ctx.budgets.permanentDelete('orc_del','EXCLUIR');assert.equal(log.entityId,'orc_del');assert.equal(await ctx.repositories.trash.get('orc_del'),null);assert.equal((await ctx.repositories.deletionBackups.list()).length,1);assert.equal((await ctx.repositories.deletionLog.list()).length,1);
});

test('Restauração não sobrescreve orçamento ativo com mesmo ID',async()=>{
  const ctx=context({budgets:[{id:'same',cliente:'Ativo'}],trash:[{id:'same',entityType:'budget',cliente:'Lixeira'}]});
  await assert.rejects(()=>ctx.budgets.restore('same','trash'),/Já existe/);assert.equal((await ctx.repositories.budgets.list()).length,1);assert.equal((await ctx.repositories.trash.list()).length,1);
});

test('Importação legada preserva histórico, arquivados, lixeira, backups e logs',()=>{
  const canonical=canonicalFromLegacy({oficina_event_history:[{id:'e1',at:'2026-09-18',module:'Clientes'}],oficinaos_orc_arquivados_v1:[{id:'a1'}],oficinaos_orc_lixeira_v1:[{id:'t1'}],oficinaos_orc_exclusoes_backup_v1:[{id:'b1'}],oficinaos_orc_exclusoes_log_v1:[{id:'l1'}]});
  assert.equal(canonical.operationalHistory.length,1);assert.equal(canonical.archivedBudgets.length,1);assert.equal(canonical.trash.length,1);assert.equal(canonical.deletionBackups.length,1);assert.equal(canonical.deletionLog.length,1);assert.equal(canonical.trash[0].entityType,'budget');
});

test('Backup compatível reexporta as cinco coleções históricas do Clean v8',async()=>{
  const ctx=context({operationalHistory:[{id:'e1',module:'OS'}],archivedBudgets:[{id:'a1'}],trash:[{id:'t1',entityType:'budget'}],deletionBackups:[{id:'b1'}],deletionLog:[{id:'l1'}]});
  const backup=await exportLegacyCompatibleBackup(ctx.repositories);assert.equal(backup.oficina_event_history.length,1);assert.equal(backup.oficinaos_orc_arquivados_v1.length,1);assert.equal(backup.oficinaos_orc_lixeira_v1.length,1);assert.equal(backup.oficinaos_orc_exclusoes_backup_v1.length,1);assert.equal(backup.oficinaos_orc_exclusoes_log_v1.length,1);
});

test('bridge do event bus registra alterações dos módulos operacionais',async()=>{
  const listeners=new Map();const eventBus={on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name)?.delete(fn);},emit(name,payload){for(const fn of listeners.get(name)||[])fn(payload);}};
  const repositories={};for(const name of [...STATE_STORES,'settings','meta','backups'])repositories[name]=memoryRepo();
  const { createHistoryServices } = await import('../../src/modules/history-services.js');
  createHistoryServices({repositories,eventBus,store:{patch(){}}});eventBus.emit('clientes:changed',{action:'create',id:100});await new Promise(r=>setTimeout(r,15));
  const rows=await repositories.operationalHistory.list();assert.equal(rows.length,1);assert.equal(rows[0].module,'Clientes');assert.equal(rows[0].entityId,'100');
});

test('Fase 8: consultar histórico e exportar não apagam eventos antigos',async()=>{
 const events=[{id:'antigo',at:'2000-01-01',module:'OS',summary:'Preservado'}];const ctx=context({operationalHistory:events});
 await ctx.operational.list();await ctx.operational.exportData();assert.deepEqual(await ctx.repositories.operationalHistory.list(),events);
});
test('Fase 8: colisão de ID numérico e textual não sobrescreve arquivo nem ativo',async()=>{
 const ctx=context({budgets:[{id:7,cliente:'Ativo'}],archivedBudgets:[{id:'7',cliente:'Arquivo'}]});
 await assert.rejects(ctx.budgets.archive('7'),/Já existe/);assert.equal((await ctx.repositories.budgets.get(7)).cliente,'Ativo');assert.equal((await ctx.repositories.archivedBudgets.get('7')).cliente,'Arquivo');
 await assert.rejects(ctx.budgets.restore('7','archived'),/Já existe/);
});
test('Fase 8: restauração respeita ID numérico e mantém conteúdo comercial',async()=>{
 const ctx=context({trash:[{id:8,entityType:'budget',status:'Na lixeira',statusBeforeArchive:'Aprovado',total:123.45,clientId:10,notes:'Original'}]});
 const row=await ctx.budgets.restore('8');assert.equal(row.id,8);assert.equal(row.status,'Aprovado');assert.equal(row.total,123.45);assert.equal(row.notes,'Original');assert.equal((await ctx.repositories.trash.list()).length,0);
});
test('Fase 8: lixeira de outras entidades e orçamento vinculado não são excluídos',async()=>{
 const ctx=context({trash:[{id:'cliente',entityType:'client'},{id:'orc',entityType:'budget'}],transactions:[{id:'receita',budgetId:'orc',val:100}]});
 await assert.rejects(ctx.budgets.restore('cliente'),/não é um orçamento/);
 await assert.rejects(ctx.budgets.permanentDelete('cliente','EXCLUIR'),/não é um orçamento/);
 await assert.rejects(ctx.budgets.permanentDelete('orc','EXCLUIR'),/possui vínculos/);
 assert.equal((await ctx.repositories.trash.list()).length,2);assert.equal((await ctx.repositories.deletionLog.list()).length,0);
});
test('Fase 8: falha ao remover origem desfaz a cópia de restauração',async()=>{
 const row={id:'orc',entityType:'budget',status:'Na lixeira',total:90};const ctx=context({trash:[row]});
 ctx.repositories.trash.delete=async()=>{throw new Error('Falha simulada');};await assert.rejects(ctx.budgets.restore('orc'),/Falha simulada/);
 assert.deepEqual(await ctx.repositories.trash.list(),[row]);assert.equal((await ctx.repositories.budgets.list()).length,0);
});
test('Fase 8: retenção de cópias de orçamento preserva cópias financeiras',async()=>{
 const financial={id:'financeiro',entityType:'financial',at:'2000-01-01',payload:{val:100}};
 const copies=Array.from({length:50},(_,i)=>({id:'b'+i,entityType:'budget',at:'2026-01-01'}));
 const ctx=context({budgets:[{id:'orc'}],deletionBackups:[financial,...copies]});await ctx.budgets.archive('orc');assert.deepEqual(await ctx.repositories.deletionBackups.get('financeiro'),financial);
});
test('Fase 8: falha no log impede remoção definitiva e preserva cópia preventiva',async()=>{
 const row={id:'orc',entityType:'budget',total:90};const ctx=context({trash:[row]});ctx.repositories.deletionLog.put=async()=>{throw new Error('Falha no log');};
 await assert.rejects(ctx.budgets.permanentDelete('orc','EXCLUIR'),/Falha no log/);assert.deepEqual(await ctx.repositories.trash.list(),[row]);assert.equal((await ctx.repositories.deletionBackups.list()).length,1);
});
