import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientesService, matchesClientDescription } from '../../src/modules/clientes/clientes-service.js';
import { createCategoriasService } from '../../src/modules/categorias/categorias-service.js';
import { createEstoqueService } from '../../src/modules/estoque/estoque-service.js';
import { createMetasService } from '../../src/modules/metas/metas-service.js';
import { createConfiguracoesService } from '../../src/modules/configuracoes/configuracoes-service.js';

function memoryRepo(seed = []) {
  const rows = new Map(seed.map(x => [x.id, structuredClone(x)]));
  return {
    async list(){ return [...rows.values()].map(x => structuredClone(x)); },
    async get(id){ return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async put(row){ rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    async delete(id){ rows.delete(id); return true; },
    async count(){ return rows.size; }
  };
}

function createClientContext(seedClients = [], seedTransactions = []) {
  const repositories = {
    clients: memoryRepo(seedClients),
    transactions: memoryRepo(seedTransactions),
    settings: memoryRepo(),
    deletionBackups: memoryRepo()
  };
  const patches = [];
  const store = { patch(value){ patches.push(structuredClone(value)); } };
  const events = [];
  const eventBus = { emit(type, payload){ events.push({ type, payload }); } };
  return { repositories, store, eventBus, patches, events };
}

test('clientes usa repository, mantém IDs numéricos legados e sincroniza store', async () => {
  const ctx = createClientContext();
  const service = createClientesService(ctx);
  const created = await service.create({ nome: 'Cliente Teste', veiculos: [{ marca: 'Fiat Palio', placa: 'abc1d23' }] });
  assert.equal(created.id, 100);
  assert.equal(created.veiculos[0].id, 1000);
  assert.equal(created.veiculos[0].placa, 'ABC1D23');
  assert.equal(created.name, 'Cliente Teste');
  assert.equal((await service.list()).length, 1);
  assert.equal(ctx.patches.at(-1).clients.length, 1);
});

test('clientes CRUD persiste entre instâncias e cria backup preventivo antes de excluir', async () => {
  const ctx = createClientContext([{ id: 105, nome: 'Maria Souza', name: 'Maria Souza', veiculos: [], servicos: [] }]);
  const service = createClientesService(ctx);
  await service.update(105, { fone: '19999999999' });
  const reloadedService = createClientesService(ctx);
  assert.equal((await reloadedService.get(105)).fone, '19999999999');
  await reloadedService.remove(105);
  assert.equal(await ctx.repositories.clients.get(105), null);
  const backups = await ctx.repositories.deletionBackups.list();
  assert.equal(backups.length, 1);
  assert.equal(backups[0].entityType, 'client');
  assert.equal(backups[0].payload.nome, 'Maria Souza');
});

test('veículos e serviços recebem IDs numéricos compatíveis e histórico cruza receitas', async () => {
  const ctx = createClientContext(
    [{ id: 110, nome: 'Carlos Silva', name: 'Carlos Silva', criado: '2026-01-01', veiculos: [], servicos: [] }],
    [{ id: 1, type: 'rec', desc: 'Pintura Carlos Silva', date: '2026-09-10', val: 1200, cat: 'Pintura', paid: 'Pago' }]
  );
  const service = createClientesService(ctx);
  const vehicle = await service.addVehicle(110, { marca: 'Toro', placa: 'ggw8308' });
  const manual = await service.addService(110, { data: '2026-09-11', desc: 'Polimento', valor: 350, cat: 'Polimento', veiculo: 'Toro' });
  assert.equal(vehicle.id, 1000);
  assert.equal(manual.id, 10000);
  const history = await service.history(110);
  assert.equal(history.length, 2);
  assert.equal((await service.summary(110)).totalSpent, 1550);
  assert.equal(matchesClientDescription('Pintura Carlos Silva', 'Carlos Silva'), true);
});

test('fotos do cliente usam a chave dinâmica fp_fotos_<id> no repository settings', async () => {
  const ctx = createClientContext([{ id: 120, nome: 'Ana Lima', name: 'Ana Lima', veiculos: [], servicos: [] }]);
  const service = createClientesService(ctx);
  await service.addPhotos(120, 'antes', [{ src: 'data:image/png;base64,AAAA', nome: 'antes.png', data: '2026-09-17' }]);
  let photos = await service.getPhotos(120);
  assert.equal(photos.antes.length, 1);
  assert.equal((await ctx.repositories.settings.get('fp_fotos_120')).value.antes[0].nome, 'antes.png');
  await service.removePhoto(120, 'antes', 0);
  photos = await service.getPhotos(120);
  assert.equal(photos.antes.length, 0);
});

test('histórico não soma a mesma receita antiga em clientes com nome em comum', async () => {
  const clients = [{id:1,name:'Carlos Silva',servicos:[]},{id:2,name:'Ana Silva',servicos:[]}];
  const transactions = [{id:'ambigua',type:'rec',desc:'Pintura Silva',val:900},{id:'unica',type:'rec',desc:'Polimento Carlos',val:100}];
  const ctx=createClientContext(clients,transactions),service=createClientesService(ctx);
  assert.deepEqual((await service.history(1)).map(x=>x.id),['unica']);
  assert.deepEqual(await service.history(2),[]);
  assert.equal((await service.summary(1)).totalSpent,100);
  assert.deepEqual(await ctx.repositories.transactions.list(),transactions);
});

test('histórico prioriza cliente vinculado e não atribui vínculo desconhecido por nome', async () => {
  const clients=[{id:1,name:'Carlos Silva',servicos:[]},{id:2,name:'Ana Silva',servicos:[]}];
  const transactions=[{id:'vinculada',type:'rec',clientId:'2',desc:'Pintura Carlos',val:300},{id:'semCadastro',type:'rec',clientId:99,desc:'Polimento Carlos',val:700}];
  const ctx=createClientContext(clients,transactions),service=createClientesService(ctx);
  assert.deepEqual(await service.history(1),[]);
  assert.deepEqual((await service.history(2)).map(x=>x.id),['vinculada']);
  assert.deepEqual(await ctx.repositories.transactions.list(),transactions);
});

function createSimpleContext(seed = {}) {
  const repositories = {
    categories: memoryRepo(seed.categories || []),
    transactions: memoryRepo(seed.transactions || []),
    accounts: memoryRepo(seed.accounts || []),
    goals: memoryRepo(seed.goals || []),
    stock: memoryRepo(seed.stock || []),
    settings: memoryRepo(seed.settings || []),
    deletionBackups: memoryRepo()
  };
  const patches = [];
  const events = [];
  return {
    repositories,
    store: { patch(value){ patches.push(structuredClone(value)); } },
    eventBus: { emit(type,payload){ events.push({type,payload}); } },
    patches,
    events
  };
}

test('categorias evita duplicação nominal e permite ocultar categoria fixa sem apagar referências', async () => {
  const ctx = createSimpleContext({ transactions: [{ id: 1, cat: 'Serviços', type: 'rec', val: 100 }] });
  const service = createCategoriasService(ctx);
  const first = await service.create('Serviços', 'operacao');
  const second = await service.create('serviços', 'operacao');
  assert.equal(first.name, 'Serviços');
  assert.equal(second.name, 'Serviços');
  await service.setHidden('Serviços', true);
  assert.equal((await service.list()).some(row => row.name === 'Serviços'), false);
  const hidden = (await service.list({ includeHidden: true })).find(row => row.name === 'Serviços');
  assert.equal(hidden.hidden, true);
  assert.equal((await ctx.repositories.transactions.get(1)).cat, 'Serviços');
});

test('renomear categoria atualiza transações, contas e metas e cria backup preventivo', async () => {
  const ctx = createSimpleContext({
    transactions: [{ id: 1, cat: 'Custom A', type: 'dep', val: 10 }],
    accounts: [{ id: 2, cat: 'Custom A', category: 'Custom A' }],
    goals: [{ id: 'Custom A', cat: 'Custom A', category: 'Custom A', meta: 500 }],
    categories: [{ id: 'Custom A', name: 'Custom A', group: 'outros', custom: true, hidden: false }]
  });
  const service = createCategoriasService(ctx);
  await service.rename('Custom A', 'Custom B');
  assert.equal((await ctx.repositories.transactions.get(1)).cat, 'Custom B');
  assert.equal((await ctx.repositories.accounts.get(2)).category, 'Custom B');
  assert.equal((await ctx.repositories.goals.get('Custom A')), null);
  assert.equal((await ctx.repositories.goals.get('Custom B')).cat, 'Custom B');
  assert.equal((await ctx.repositories.deletionBackups.list()).length, 1);
});



test('excluir categoria personalizada preserva lançamentos e oculta categoria ainda referenciada', async () => {
  const ctx = createSimpleContext({
    categories: [{ id: 'Especial', name: 'Especial', group: 'outros', custom: true, hidden: false }],
    transactions: [{ id: 8, cat: 'Especial', type: 'rec', val: 50 }]
  });
  const service = createCategoriasService(ctx);
  await service.remove('Especial');
  assert.equal((await ctx.repositories.transactions.get(8)).cat, 'Especial');
  assert.equal((await service.list()).some(row => row.name === 'Especial'), false);
  const hidden = (await service.list({ includeHidden: true })).find(row => row.name === 'Especial');
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.custom, false);
});
test('estoque preserva aliases legados, usa id numérico e cria backup ao excluir', async () => {
  const ctx = createSimpleContext();
  const service = createEstoqueService(ctx);
  const item = await service.create({ nome: 'Primer Teste', cat: 'prep', unid: 'L', qty: 2, custo: '85,50', minimo: 1, forn: 'Fornecedor' });
  assert.equal(typeof item.id, 'number');
  assert.equal(item.name, 'Primer Teste');
  assert.equal(item.custo, 85.5);
  assert.equal(item.unit, 85.5);
  assert.equal(item.minQty, 1);
  await service.adjustQuantity(item.id, -1);
  assert.equal((await service.get(item.id)).qty, 1);
  const edited = await service.update(item.id, { custo: '99,90', cat: 'pint' });
  assert.equal(edited.custo, 99.9);
  assert.equal(edited.cost, 99.9);
  assert.equal(edited.cat, 'pint');
  await service.remove(item.id);
  assert.equal(await service.get(item.id), null);
  assert.equal((await ctx.repositories.deletionBackups.list())[0].entityType, 'stock');
});

test('lista padrão de estoque só é inserida por ação explícita e contém 70 itens', async () => {
  const ctx = createSimpleContext();
  const service = createEstoqueService(ctx);
  assert.equal((await service.list()).length, 0);
  const loaded = await service.loadDefaultList();
  assert.equal(loaded.added, 70);
  assert.equal((await service.list()).length, 70);
  const second = await service.loadDefaultList();
  assert.equal(second.added, 0);
});

test('metas recalcula realizado pelas receitas reais do mês e não pelo campo real salvo', async () => {
  const ctx = createSimpleContext({
    goals: [{ id: 'Pintura', category: 'Pintura', cat: 'Pintura', meta: 2000, real: 99999 }],
    transactions: [
      { id: 1, type: 'rec', cat: 'Pintura', val: 1200, date: '2026-09-10', paid: 'Pago' },
      { id: 2, type: 'rec', cat: 'Pintura', val: 300, date: '2026-09-11', paid: true },
      { id: 3, type: 'dep', cat: 'Pintura', val: 400, date: '2026-09-11' }
    ],
    settings: [{ id: 'fp_meta_principal', value: 5000 }]
  });
  const service = createMetasService(ctx);
  const goals = await service.list({ date: new Date(2026, 8, 17) });
  assert.equal(goals[0].real, 1500);
  const summary = await service.summary(new Date(2026, 8, 17));
  assert.equal(summary.real, 1500);
  assert.equal(summary.meta, 5000);
  assert.equal(summary.missing, 3500);
});

test('configurações não inventa dados e exige nome da oficina e proprietário ao salvar', async () => {
  const ctx = createSimpleContext();
  const service = createConfiguracoesService(ctx);
  const empty = await service.getOfficeConfig();
  assert.equal(empty.nome, '');
  assert.equal(empty.dono, '');
  await assert.rejects(() => service.saveOfficeConfig({ nome: 'Oficina X' }), /proprietário/i);
  const saved = await service.saveOfficeConfig({ nome: 'Oficina X', dono: 'Responsável', cidade: 'Leme - SP' });
  assert.equal(saved.nome, 'Oficina X');
  assert.equal((await ctx.repositories.settings.get('os_config')).value.cidade, 'Leme - SP');
});


test('metas por caixa exclui pendências, despesas e outros meses sem alterar transações', async () => {
  const transactions=[
    {id:1,type:'rec',cat:'Pintura',val:100,date:'2026-10-08',paid:'Pago'},
    {id:2,type:'rec',cat:'Pintura',val:900,date:'2026-10-08',paid:'Não pago'},
    {id:3,type:'rec',cat:'Pintura',val:50,date:'2026-10-07',pago:true},
    {id:4,type:'dep',cat:'Pintura',val:700,date:'2026-10-08',paid:true},
    {id:5,type:'rec',cat:'Pintura',val:600,date:'2026-09-08',paid:true},
    {id:6,type:'rec',cat:'Pintura',val:500,date:'2026-10-08'}
  ];
  const ctx=createSimpleContext({transactions,goals:[{id:'Pintura',category:'Pintura',meta:1000}],settings:[{id:'fp_meta_principal',value:2000}]});
  const s=await createMetasService(ctx).summary(new Date(2026,9,8));
  assert.equal(s.real,150);assert.equal(s.categories[0].real,150);assert.equal(s.missing,1850);
  assert.deepEqual(await ctx.repositories.transactions.list(),transactions);
});

test('editar meta para categoria ocupada rejeita a operação e preserva ambas as metas', async () => {
  const goals=[{id:'A',category:'A',meta:100},{id:'B',category:'B',meta:200}];
  const ctx=createSimpleContext({goals}),service=createMetasService(ctx);
  await assert.rejects(()=>service.renameCategoryGoal('A','B',300),/Já existe uma meta/);
  await assert.rejects(()=>service.renameCategoryGoal('A','b',300),/Já existe uma meta/);
  assert.deepEqual(await ctx.repositories.goals.list(),goals);
  await service.renameCategoryGoal('A','C',400);
  assert.equal((await ctx.repositories.goals.get('C')).meta,400);
  assert.deepEqual(await ctx.repositories.goals.get('B'),goals[1]);
});

test('salvar configurações preserva cor e campos legados não exibidos no formulário', async () => {
  const value={nome:'Oficina',dono:'Responsável',cor:'#123456',preferencias:{impressao:'premium'},cidade:'Leme'};
  const ctx=createSimpleContext({settings:[{id:'os_config',value}]}),service=createConfiguracoesService(ctx);
  const saved=await service.saveOfficeConfig({nome:'Oficina editada',dono:'Responsável',cidade:''});
  assert.equal(saved.cor,'#123456');assert.deepEqual(saved.preferencias,value.preferencias);assert.equal(saved.cidade,'');
  await assert.rejects(()=>service.saveOfficeConfig({nome:'',dono:'Responsável'}),/obrigatórios/);
  assert.deepEqual((await ctx.repositories.settings.get('os_config')).value,saved);
});
