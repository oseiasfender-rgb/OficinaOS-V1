import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFromLegacy, validateLegacyPayload, unwrapLegacyBackup } from '../../src/data/legacy-compat.js';
import { auditCanonical } from '../../src/data/integrity.js';

test('converte backup legado preservando IDs e vínculos principais', () => {
  const legacy = {
    ALL_TX: [{ id: 10, desc: 'Serviço', val: 100, contaId: 5 }],
    contas: [{ id: 5, name: 'Conta', paidTxId: 10 }],
    clientes: [{ id: 'c1', nome: 'Cliente A' }],
    jobs: [{ id: 'j1', orcId: 'o1' }],
    estoque: [{ id: 'e1', nome: 'Primer', cat: 'Material' }],
    metasCat: [{ cat: 'Serviços', meta: 5000 }],
    orcHistorico: [{ id: 'o1', cliente: 'Cliente A' }],
    fp_fin_categories: ['Serviços'],
    fp_fin_category_groups: { Serviços: 'receitas' }
  };
  const canonical = canonicalFromLegacy(legacy);
  assert.equal(canonical.transactions[0].id, 10);
  assert.equal(canonical.transactions[0].contaId, 5);
  assert.equal(canonical.accounts[0].paidTxId, 10);
  assert.equal(canonical.clients[0].name, 'Cliente A');
  assert.equal(canonical.jobs[0].budgetId, 'o1');
  assert.equal(canonical.stock[0].name, 'Primer');
  assert.equal(canonical.goals[0].category, 'Serviços');
  assert.equal(canonical.budgets[0].id, 'o1');
  assert.equal(canonical.categories[0].group, 'receitas');
  assert.equal(auditCanonical(canonical).duplicateCount, 0);
});

test('IDs duplicados legados são preservados via legacyId e tornam-se únicos', () => {
  const canonical = canonicalFromLegacy({ ALL_TX: [{id: 1}, {id: 1}], jobs: [] });
  assert.equal(canonical.transactions[0].id, 1);
  assert.equal(canonical.transactions[1].id, '1__dup2');
  assert.equal(canonical.transactions[1].legacyId, 1);
  assert.equal(auditCanonical(canonical).duplicateCount, 0);
});

test('reconhece backup diário encapsulado', () => {
  const wrapped = { schema: 'oficinaos-indexeddb-daily-backup-v1', payload: { ALL_TX: [{id: 1}], jobs: [] } };
  assert.equal(unwrapLegacyBackup(wrapped).ALL_TX.length, 1);
  assert.equal(validateLegacyPayload(wrapped).valid, true);
});

test('estado central antigo fornece lançamentos quando ALL_TX não existe', () => {
  const canonical=canonicalFromLegacy({oficinaos_provisorio_integrado_v1:{schemaVersion:1,lancamentos:[{id:'t1',tipo:'receita',descricao:'OS',valor:450,vencimento:'2026-09-18'}]}});
  assert.equal(canonical.transactions.length,1);assert.equal(canonical.transactions[0].id,'t1');
  assert.equal(validateLegacyPayload({oficinaos_provisorio_integrado_v1:{schemaVersion:1,lancamentos:[{id:'t1'}]}}).counts.transactions,1);
});

test('inventário legado inclui formatos de status DAS atuais e anteriores', () => {
  const canonical=canonicalFromLegacy({ALL_TX:[],fp_das:{2024:{1:'Pago'}},fp_das_status:{2025:{2:'Pago'}},fp_das_v2_status:{'2026-03':'Pago'}});
  const settings=new Map(canonical.settings.map(x=>[x.id,x.value]));assert.deepEqual(settings.get('fp_das'),{2024:{1:'Pago'}});assert.deepEqual(settings.get('fp_das_status'),{2025:{2:'Pago'}});assert.deepEqual(settings.get('fp_das_v2_status'),{'2026-03':'Pago'});
});

test('reconhece backup OFICINAOS_V700_JSON e normaliza estado para os repositories modulares', () => {
  const v700={
    schema:'OFICINAOS_V700_JSON',version:'V700.50',exportedAt:'2026-07-17T10:00:00Z',
    state:{
      meta:{version:'V700.50'},
      clientes:[{id:'100',nome:'Cliente Real'}],
      orcamentos:[{id:'ORC-1',cliente:'Cliente Real',veiculo:'Carro',descricao:'Funilaria',total:900,agendaId:'OS-1'}],
      agenda:{os:[{id:'OS-1',legadoId:'7',cliente:'Cliente Real',veiculo:'Carro',tipo:'Funilaria',entrada:'2026-07-01',entrega:'2026-07-05',status:'Entregue',valor:900}],eventos:[]},
      financeiro:{lancamentos:[{id:'tx1',tipo:'receita',descricao:'Serviço Cliente Real',valor:900,categoria:'Serviços',data:'2026-07-05',status:'pago'}],contas:[{id:'ct1',nome:'Tinta',valor:100,categoria:'Materiais de Pintura',vencimento:'2026-07-02',status:'pago',dataPagamento:'2026-07-02',origemLancamentoId:'tx2'}],recibos:[]},
      metas:{faturamento:12000,categorias:[{categoria:'Funilaria',meta:2000,real:900}]},
      relatorios:{cache:{}},ia:{history:[]},auditoria:[{at:'2026-07-17T10:00:00Z',action:'BACKUP_REAL_CONVERTIDO'}]
    }
  };
  const validation=validateLegacyPayload(v700);
  assert.equal(validation.valid,true);
  assert.equal(validation.counts.transactions,1);
  assert.equal(validation.counts.accounts,1);
  assert.equal(validation.counts.jobs,1);
  assert.equal(validation.counts.clients,1);
  assert.equal(validation.counts.goals,1);
  assert.equal(validation.counts.budgets,1);
  const canonical=canonicalFromLegacy(v700);
  assert.equal(canonical.transactions[0].type,'rec');
  assert.equal(canonical.transactions[0].val,900);
  assert.equal(canonical.transactions[0].paid,'Pago');
  assert.equal(canonical.accounts[0].name,'Tinta');
  assert.equal(canonical.accounts[0].fromTx,'tx2');
  assert.equal(canonical.jobs[0].id,'7');
  assert.equal(canonical.jobs[0].budgetId,'ORC-1');
  assert.equal(canonical.workOrders.length,1);
  assert.equal(canonical.workOrders[0].id,'OS-1');
  assert.equal(canonical.workOrders[0].legacyJobId,'7');
  assert.equal(canonical.goals[0].category,'Funilaria');
  assert.equal(canonical.budgets[0].service,'Funilaria');
  assert.equal(canonical.operationalHistory.length,1);
  assert.equal(auditCanonical(canonical).duplicateCount,0);
});

test('backup modular compatível prioriza snapshot canônico para round-trip exato', async()=>{
  const { exportLegacyCompatibleBackup } = await import('../../src/data/backup-service.js');
  const { STATE_STORES } = await import('../../src/data/schema.js');
  function repo(seed=[]){const rows=structuredClone(seed);return {async list(){return structuredClone(rows);}};}
  const seed={
    transactions:[{id:'t1',type:'rec',desc:'Receita',cat:'Serviços',val:100,date:'2026-09-18',paid:'Não pago',workOrderId:'os1'}],
    accounts:[],clients:[{id:100,name:'A',nome:'A'}],jobs:[{id:1,cliente:'A',osId:'os1',status:'Entregue'}],
    workOrders:[{id:'os1',legacyJobId:1,budgetId:'b1',clientId:100,clientName:'A',stage:'entregue',status:'Entregue',financialSyncPending:false}],
    appointments:[{id:'ag1',workOrderId:'os1',budgetId:'b1',clientId:100,date:'2026-09-18',status:'Concluído'}],
    checklists:[{id:'os:os1',contextType:'workOrder',contextId:'os1',currentStage:'desmontagem',stages:{entrada:[{label:'Foto',done:true}]}}],
    budgets:[{id:'b1',clientId:100,cliente:'A',status:'Convertido em OS',total:100}],categories:[],goals:[],stock:[],operationalHistory:[],budgetHistory:[],archivedBudgets:[],trash:[],deletionBackups:[],deletionLog:[],recurringTemplates:[]
  };
  const repositories={};for(const name of STATE_STORES)repositories[name]=repo(seed[name]||[]);repositories.settings=repo([]);repositories.meta=repo([{id:'schema',value:'oficinaos-modular-v5'}]);
  const backup=await exportLegacyCompatibleBackup(repositories);
  const canonical=canonicalFromLegacy(backup);
  for(const name of ['jobs','workOrders','appointments','checklists','budgets','transactions'])assert.deepEqual(canonical[name],seed[name]);
  assert.equal(validateLegacyPayload(backup).recognized[0],'modular');
});


test('Importação de job sem data mantém createdAt desconhecido sem usar o relógio', () => {
  const input={version:'1.0',ALL_TX:[],contas:[],clientes:[],jobs:[{id:99,cliente:'Teste',val:0}],metasCat:[]};
  const result=canonicalFromLegacy(input);
  assert.equal(result.workOrders[0].createdAt,null);
  assert.deepEqual(canonicalFromLegacy(input).workOrders,result.workOrders);
});
