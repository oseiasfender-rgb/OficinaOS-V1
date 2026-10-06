import { categoryKey, defaultGroupForCategory, isBuiltinCategory } from './category-model.js';
import { DATA_SCHEMA, STATE_STORES } from './schema.js';
export const LEGACY_DB_NAME = 'oficinaos_modelo_clean_v4';
export const LEGACY_KV_STORE = 'kv';

export const LEGACY_KEYS = Object.freeze([
  'fp_user_tx','fp_jobs','fp_agenda','fp_clientes','fp_estoque','fp_contas','fp_meta_principal',
  'fp_metas_cat','fp_fin_month','fp_next_tx_id','fp_orc_historico','fp_orc_num_atual',
  'fp_das','fp_das_status','fp_das_v2_status','fp_fin_categories','fp_fin_category_groups','fp_fin_categories_hidden',
  'fp_fin_category_structure','oficinaosCategoryOrganization','oficinaosPeriodFocus','fp_metas_historico','fp_checklist_state','os_config','fp_contas_banco',
  'fp_recorrentes_excluidas_competencia','fp_recorrentes_canceladas','fp_recorrentes_encerradas',
  'os_orc_sliders','oficina_event_history','oficina_event_history_config','oficinaos_provisorio_integrado_v1',
  'oficinaos_recurring_templates_v1','oficinaos_recurring_templates_deleted_v1',
  'oficinaos_orc_arquivados_v1','oficinaos_orc_lixeira_v1',
  'oficinaos_orc_exclusoes_backup_v1','oficinaos_orc_exclusoes_log_v1'
]);

function arr(value) { return Array.isArray(value) ? value : []; }
function obj(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? '').trim(); }
function amount(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function dateValue(value) { const s = text(value); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }

export function parseLegacyValue(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function firstDefined(source, keys, fallback) {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return fallback;
}


function normalizedLegacyTxType(value) {
  const v = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (['rec','receita','income','entrada'].includes(v)) return 'rec';
  if (['transfer','transferencia'].includes(v)) return 'transfer';
  return 'dep';
}

function normalizedLegacyPaid(value) {
  const v = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['pago','paid','true','sim'].includes(v) ? 'Pago' : 'Não pago';
}

function v700ToLegacySource(input) {
  if (!input || typeof input !== 'object' || input.schema !== 'OFICINAOS_V700_JSON') return null;
  const state = obj(input.state);
  if (!Object.keys(state).length) return null;
  const finance = obj(state.financeiro);
  const agenda = obj(state.agenda);
  const metas = obj(state.metas);
  const rawBudgets = arr(state.orcamentos);
  const budgetByAgenda = new Map(rawBudgets.map(row => [String(row?.agendaId ?? ''), row?.id]).filter(([k]) => k));

  const transactions = arr(finance.lancamentos).map((row, index) => ({
    ...structuredClone(row),
    id: row.id ?? `tx_v700_${index + 1}`,
    date: dateValue(row.date ?? row.data ?? row.vencimento),
    desc: text(row.desc ?? row.descricao ?? row.name),
    cat: text(row.cat ?? row.categoria ?? row.category ?? 'Outros') || 'Outros',
    val: amount(row.val ?? row.valor ?? row.amount),
    type: normalizedLegacyTxType(row.type ?? row.tipo),
    paid: normalizedLegacyPaid(row.paid ?? row.status ?? row.pago),
    source: text(row.source ?? row.origem ?? 'V700'),
    budgetId: row.budgetId ?? row.orcamentoId ?? null,
    workOrderId: row.workOrderId ?? row.osId ?? row.jobId ?? null
  }));

  const accounts = arr(finance.contas).map((row, index) => {
    const originTx = row.fromTx ?? row.origemLancamentoId ?? row.paidTxId ?? '';
    const paid = normalizedLegacyPaid(row.paid ?? row.status ?? row.pago) === 'Pago';
    return {
      ...structuredClone(row),
      id: row.id ?? `ct_v700_${index + 1}`,
      name: text(row.name ?? row.nome ?? row.desc ?? row.descricao) || 'Conta sem descrição',
      cat: text(row.cat ?? row.categoria ?? row.category ?? 'Outros') || 'Outros',
      val: amount(row.val ?? row.valor ?? row.amount),
      due: dateValue(row.due ?? row.vencimento ?? row.data),
      paid,
      paidAt: paid ? dateValue(row.paidAt ?? row.dataPagamento ?? row.vencimento) : '',
      recur: !!(row.recur ?? row.recorrente),
      recurKey: row.recurKey ?? row.recorrenciaId ?? '',
      competencia: text(row.competencia),
      fromTx: originTx ? String(originTx) : '',
      paidTxId: paid && originTx ? String(originTx) : '',
      source: text(row.source ?? row.origem ?? 'V700')
    };
  });

  const budgets = rawBudgets.map((row, index) => ({
    ...structuredClone(row),
    id: row.id ?? row.numero ?? `orc_v700_${index + 1}`,
    clientId: row.clientId ?? row.clienteId ?? null,
    clientName: text(row.clientName ?? row.cliente),
    cliente: text(row.cliente ?? row.clientName),
    vehicle: text(row.vehicle ?? row.veiculo),
    veiculo: text(row.veiculo ?? row.vehicle),
    service: text(row.service ?? row.servico ?? row.descricao),
    servico: text(row.servico ?? row.service ?? row.descricao),
    total: amount(row.total ?? row.valor),
    date: dateValue(row.date ?? row.data ?? row.createdAt),
    status: text(row.status || 'Salvo')
  }));

  const osRows = arr(agenda.os);
  const jobs = osRows.map((row, index) => {
    const legacyId = row.legadoId ?? row.legacyId ?? row.id ?? `job_v700_${index + 1}`;
    return {
      ...structuredClone(row),
      id: legacyId,
      budgetId: row.budgetId ?? row.orcamentoId ?? budgetByAgenda.get(String(row.id ?? '')) ?? null,
      cliente: text(row.cliente ?? row.clientName),
      veiculo: text(row.veiculo ?? row.vehicle),
      tipo: text(row.tipo ?? row.servico ?? row.service),
      entrada: dateValue(row.entrada ?? row.entryDate ?? row.data),
      entrega: dateValue(row.entrega ?? row.dueDate),
      val: amount(row.val ?? row.valor ?? row.total),
      done: row.done === true || /entreg|finaliz/i.test(text(row.status ?? row.etapa)),
      obs: text(row.obs ?? row.notes)
    };
  });

  const workOrders = osRows.map((row, index) => ({
    ...structuredClone(row),
    id: row.id ?? `os_v700_${index + 1}`,
    legacyJobId: row.legadoId ?? row.legacyId ?? jobs[index]?.id ?? null,
    budgetId: row.budgetId ?? row.orcamentoId ?? budgetByAgenda.get(String(row.id ?? '')) ?? null,
    clientName: text(row.clientName ?? row.cliente),
    vehicle: text(row.vehicle ?? row.veiculo),
    service: text(row.service ?? row.servico ?? row.tipo),
    entryDate: dateValue(row.entryDate ?? row.entrada ?? row.data),
    dueDate: dateValue(row.dueDate ?? row.entrega),
    value: amount(row.value ?? row.valor ?? row.val),
    stage: row.stage ?? row.etapa ?? row.status,
    status: text(row.status || 'Agendada'),
    notes: text(row.notes ?? row.obs)
  }));

  const clients = arr(state.clientes).map(row => ({ ...structuredClone(row), name: row.name ?? row.nome ?? '' }));
  const goals = arr(metas.categorias).map((row, index) => ({
    ...structuredClone(row),
    id: row.id ?? row.category ?? row.categoria ?? row.cat ?? `goal_v700_${index + 1}`,
    cat: row.cat ?? row.category ?? row.categoria ?? '',
    category: row.category ?? row.cat ?? row.categoria ?? '',
    meta: amount(row.meta ?? row.target),
    real: amount(row.real ?? row.actual)
  }));
  const audit = arr(state.auditoria).map((row, index) => ({
    ...structuredClone(row),
    id: row.id ?? `evt_v700_${index + 1}`,
    at: row.at ?? row.createdAt ?? input.exportedAt ?? '',
    module: row.module ?? 'Sistema',
    action: row.action ?? 'Importação V700',
    entity: row.entity ?? 'Backup',
    entityId: row.entityId ?? '',
    summary: row.summary ?? row.action ?? 'Evento importado do V700',
    details: row.details ?? (row.payload ? JSON.stringify(row.payload) : '')
  }));

  return {
    version: input.version ?? 'V700',
    exportedAt: input.exportedAt,
    ALL_TX: transactions,
    contas: accounts,
    clientes: clients,
    jobs,
    orcHistorico: budgets,
    metasCat: goals,
    metaPrincipal: amount(metas.faturamento),
    oficina_event_history: audit,
    oficinaos_provisorio_integrado_v1: {
      schemaVersion: 1,
      clientes: clients,
      orcamentos: budgets,
      ordensServico: workOrders,
      agendamentos: arr(agenda.eventos),
      lancamentos: transactions,
      checklists: {},
      eventos: arr(agenda.eventos)
    },
    v700_source_meta: structuredClone(state.meta ?? {}),
    v700_recibos: structuredClone(finance.recibos ?? []),
    v700_relatorios: structuredClone(state.relatorios ?? {}),
    v700_ia: structuredClone(state.ia ?? {})
  };
}

export function unwrapLegacyBackup(input) {
  const v700 = v700ToLegacySource(input);
  if (v700) return v700;
  let current = input;
  const seen = new Set();
  for (let i = 0; i < 5; i += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) break;
    seen.add(current);
    const hasOperational = ['ALL_TX','jobs','clientes','contas','fp_user_tx','fp_jobs','fp_clientes','fp_contas']
      .some(key => current[key] !== undefined);
    if (hasOperational) return current;
    if (current.payload && typeof current.payload === 'object') { current = current.payload; continue; }
    if (current.data && typeof current.data === 'object') { current = current.data; continue; }
    break;
  }
  return current && typeof current === 'object' ? current : {};
}

function normalizeRecords(list, prefix, decorate) {
  const seen = new Map();
  return arr(list).filter(item => item && typeof item === 'object').map((item, index) => {
    const copy = structuredClone(item);
    const rawId = copy.id ?? copy.legacyId ?? `${prefix}_${index + 1}`;
    const signature = String(rawId);
    const occurrence = (seen.get(signature) || 0) + 1;
    seen.set(signature, occurrence);
    if (copy.id == null || String(copy.id).trim() === '') copy.id = rawId;
    if (occurrence > 1) {
      copy.legacyId = copy.legacyId ?? rawId;
      copy.id = `${signature}__dup${occurrence}`;
    }
    return decorate ? decorate(copy, index) : copy;
  });
}

function canonicalStage(value, done = false) {
  if (done) return 'entregue';
  const s = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('entreg') || s.includes('finaliz')) return 'entregue';
  if (s.includes('desmont')) return 'desmontagem';
  if (s.includes('funil') || s.includes('chap')) return 'funilaria';
  if (s.includes('sold')) return 'solda';
  if (s.includes('prep')) return 'preparacao';
  if (s.includes('pint')) return 'pintura';
  if (s.includes('cura')) return 'cura';
  if (s.includes('pol')) return 'polimento';
  if (s.includes('mont')) return 'montagem';
  if (s.includes('controle')) return 'controle';
  return 'entrada';
}

function normalizeCategories(source) {
  const names = new Map();
  const custom = arr(firstDefined(source, ['fp_fin_categories'], [])).map(value => text(value)).filter(Boolean);
  const customKeys = new Set(custom.map(categoryKey));
  const groups = obj(firstDefined(source, ['fp_fin_category_groups'], {}));
  const hidden = arr(firstDefined(source, ['fp_fin_categories_hidden'], [])).map(value => text(value)).filter(Boolean);
  const hiddenKeys = new Set(hidden.map(categoryKey));
  const add = name => { const clean = text(name); if (clean) names.set(categoryKey(clean), clean); };
  custom.forEach(add);
  Object.keys(groups).forEach(add);
  hidden.forEach(add);
  return [...names.values()].map(name => {
    const builtin = isBuiltinCategory(name);
    return {
      id: name,
      name,
      group: groups[name] || defaultGroupForCategory(name),
      hidden: hiddenKeys.has(categoryKey(name)),
      custom: customKeys.has(categoryKey(name)) || !builtin,
      source: customKeys.has(categoryKey(name)) ? 'legacy-custom' : (builtin ? 'builtin-override' : 'legacy-metadata')
    };
  });
}

// Kept separate to make the built-in/custom classification explicit and testable.
function repairCategorySource(records) {
  return records.map(record => {
    const builtin = isBuiltinCategory(record.name);
    const source = record.custom ? 'legacy-custom' : (builtin ? 'builtin-override' : 'legacy-metadata');
    return { ...record, source };
  });
}

function normalizeGoals(source) {
  const list = arr(firstDefined(source, ['metasCat','fp_metas_cat'], []));
  return normalizeRecords(list, 'goal', (record, index) => {
    const category = record.category ?? record.cat ?? record.nome ?? `Meta ${index + 1}`;
    return { ...record, id: record.id ?? String(category), category };
  });
}

function centralState(source) {
  const direct = source.centralState ?? source.central ?? source.oficinaos_provisorio_integrado_v1;
  const parsed = parseLegacyValue(direct, direct);
  return obj(parsed);
}

function clientIdByName(clients, name) {
  const key = text(name).toLocaleLowerCase('pt-BR');
  if (!key) return null;
  const client = clients.find(row => text(row.name ?? row.nome).toLocaleLowerCase('pt-BR') === key);
  return client?.id ?? null;
}

function budgetIdForJob(budgets, job, clientId) {
  const explicit = job.budgetId ?? job.orcamentoId ?? job.orcId;
  if (explicit != null && explicit !== '') return explicit;
  const value = amount(job.val ?? job.valor ?? job.total);
  const name = text(job.cliente).toLocaleLowerCase('pt-BR');
  const matches = budgets.filter(budget => {
    if (clientId != null && budget.clientId != null && String(budget.clientId) === String(clientId)) return !value || Math.abs(amount(budget.total) - value) < 0.01;
    return (!name || text(budget.cliente).toLocaleLowerCase('pt-BR') === name) && (!value || Math.abs(amount(budget.total) - value) < 0.01);
  });
  return matches[0]?.id ?? null;
}

function normalizeWorkOrders(source, jobs, budgets, clients) {
  const central = centralState(source);
  const existing = normalizeRecords(arr(central.ordensServico), 'os', record => ({
    ...record,
    clientId: record.clientId ?? record.clienteId ?? clientIdByName(clients, record.cliente),
    budgetId: record.budgetId ?? record.orcamentoId ?? record.orcId ?? null,
    vehicleId: record.vehicleId ?? record.veiculoId ?? null,
    legacyJobId: record.legacyJobId ?? record.legacyId ?? null,
    number: record.number ?? record.numero ?? '',
    stage: canonicalStage(record.stage ?? record.etapa ?? record.status, record.done === true),
    status: record.done === true ? 'Entregue' : text(record.status || 'Agendada'),
    priority: text(record.priority ?? record.prioridade ?? 'Normal'),
    entryDate: dateValue(record.entryDate ?? record.entrada ?? record.dataEntrada ?? record.date),
    dueDate: dateValue(record.dueDate ?? record.entregaPrevista ?? record.entrega ?? record.dataEntrega),
    value: amount(record.value ?? record.valor ?? record.val ?? record.total),
    clientName: text(record.clientName ?? record.cliente),
    vehicle: text(record.vehicle ?? record.veiculo),
    service: text(record.service ?? record.tipo ?? record.servico),
    notes: text(record.notes ?? record.obs)
  }));

  const coveredLegacyIds = new Set(existing.map(record => String(record.legacyJobId ?? '')).filter(Boolean));
  const missingJobs = jobs.filter(job => !coveredLegacyIds.has(String(job?.id ?? '')));
  const derived = normalizeRecords(missingJobs, 'os', (job, index) => {
    const clientId = job.clientId ?? job.clienteId ?? clientIdByName(clients, job.cliente);
    const budgetId = budgetIdForJob(budgets, job, clientId);
    return {
      id: `os_${String(job.id)}`,
      legacyJobId: job.id,
      number: job.numero ?? `OS-${String(existing.length + index + 1).padStart(4, '0')}`,
      budgetId,
      clientId,
      vehicleId: job.vehicleId ?? job.veiculoId ?? null,
      stage: canonicalStage(job.stage ?? job.etapa ?? job.status, job.done === true),
      status: job.done === true ? 'Entregue' : text(job.status || 'Agendada'),
      priority: text(job.priority ?? job.prioridade ?? 'Normal'),
      entryDate: dateValue(job.entrada ?? job.dataEntrada ?? job.date),
      dueDate: dateValue(job.entrega ?? job.dataEntrega ?? job.due),
      value: amount(job.val ?? job.valor ?? job.total),
      clientName: text(job.cliente), vehicle: text(job.veiculo), service: text(job.tipo ?? job.servico), notes: text(job.obs),
      createdAt: job.createdAt ?? job.data ?? null, updatedAt: job.updatedAt ?? null
    };
  });
  return [...existing, ...derived];
}

function normalizeAppointments(source, jobs, workOrders) {
  const central = centralState(source);
  const combined = [...arr(central.agendamentos), ...arr(firstDefined(source, ['fp_agenda'], []))];
  const seen = new Set();
  const raw = combined.filter(item => {
    const id = item?.id != null ? `id:${String(item.id)}` : '';
    const link = `link:${String(item?.workOrderId ?? item?.osId ?? item?.jobId ?? '')}:${String(item?.date ?? item?.data ?? item?.entrada ?? '')}:${String(item?.clientId ?? item?.clienteId ?? item?.cliente ?? '')}`;
    const signature = id || link;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  const list = raw.length ? raw : jobs;
  return normalizeRecords(list, 'appointment', (item, index) => {
    let workOrderId = item.workOrderId ?? item.osId ?? null;
    if (!workOrderId) {
      const legacy = item.legacyJobId ?? item.jobId ?? item.id;
      workOrderId = workOrders.find(os => String(os.legacyJobId ?? '') === String(legacy))?.id ?? null;
    }
    const workOrder = workOrders.find(os => String(os.id) === String(workOrderId));
    const itemId = raw.length ? item.id : `ag_${String(item.id)}`;
    return {
      ...item,
      id: itemId ?? `appointment_${index + 1}`,
      legacyJobId: item.legacyJobId ?? item.jobId ?? (raw.length ? null : item.id),
      workOrderId,
      clientId: item.clientId ?? item.clienteId ?? workOrder?.clientId ?? null,
      budgetId: item.budgetId ?? item.orcamentoId ?? item.orcId ?? workOrder?.budgetId ?? null,
      date: dateValue(item.date ?? item.data ?? item.entrada ?? item.dataEntrada ?? workOrder?.entryDate),
      dueDate: dateValue(item.dueDate ?? item.entrega ?? item.dataEntrega ?? workOrder?.dueDate),
      time: text(item.time ?? item.hora ?? '08:00'),
      type: text(item.type ?? item.tipo ?? 'Entrada'),
      status: workOrder?.status === 'Entregue' || item.done === true ? 'Concluído' : text(item.status || 'Agendado'),
      clientName: text(item.clientName ?? item.cliente ?? workOrder?.clientName),
      vehicle: text(item.vehicle ?? item.veiculo ?? workOrder?.vehicle),
      service: text(item.service ?? item.servico ?? item.tipoServico ?? workOrder?.service),
      value: amount(item.value ?? item.val ?? item.valor ?? workOrder?.value), notes: text(item.notes ?? item.obs ?? workOrder?.notes)
    };
  });
}

function checklistRecord(id, value) {
  const record = obj(value);
  const rawId = text(id || record.id || 'draft');
  let contextType = 'draft'; let contextId = 'draft';
  if (rawId.startsWith('os:')) { contextType = 'workOrder'; contextId = rawId.slice(3); }
  else if (rawId.startsWith('orc:')) { contextType = 'budget'; contextId = rawId.slice(4); }
  return {
    id: rawId,
    contextType,
    contextId,
    currentStage: canonicalStage(record.currentStage ?? record.stage ?? record.etapa),
    stages: structuredClone(record.stages ?? record.etapas ?? {}),
    updatedAt: record.updatedAt ?? new Date().toISOString()
  };
}

function normalizeChecklists(source, budgets) {
  const central = centralState(source);
  const rows = [];
  for (const [key, value] of Object.entries(obj(central.checklists))) rows.push(checklistRecord(key, value));
  const loose = firstDefined(source, ['fp_checklist_state'], null);
  if (loose && !rows.some(row => row.id === 'draft')) rows.push(checklistRecord('draft', loose));
  for (const budget of budgets) {
    const c = budget?.paginaOrcamento?.checklist;
    if (c && !rows.some(row => row.contextType === 'budget' && String(row.contextId) === String(budget.id))) {
      rows.push(checklistRecord(`orc:${budget.id}`, c));
    }
  }
  return normalizeRecords(rows, 'checklist');
}

function legacySettings(source) {
  const modeled = new Set([
    'ALL_TX','tx','fp_user_tx','fp_tx','contas','fp_contas','clientes','fp_clientes',
    'jobs','fp_jobs','fp_agenda','fp_checklist_state','estoque','fp_estoque','metasCat','fp_metas_cat',
    'orcHistorico','fp_orc_historico','oficina_event_history','oficinaos_orc_arquivados_v1',
    'oficinaos_orc_lixeira_v1','oficinaos_orc_exclusoes_backup_v1','oficinaos_orc_exclusoes_log_v1',
    'oficinaos_recurring_templates_v1','centralState','central','oficinaos_provisorio_integrado_v1','payload','data','schema','version','exportedAt','meta'
  ]);
  const byId = new Map();
  for (const [key, value] of Object.entries(source)) {
    if (modeled.has(key) || value === undefined) continue;
    byId.set(key, { id: key, value: structuredClone(value) });
  }
  if (source.metaPrincipal !== undefined) byId.set('fp_meta_principal', { id: 'fp_meta_principal', value: source.metaPrincipal });
  if (source.nextTxId !== undefined) byId.set('fp_next_tx_id', { id: 'fp_next_tx_id', value: source.nextTxId });
  if (source.dasStatus !== undefined) byId.set('fp_das_status', { id: 'fp_das_status', value: structuredClone(source.dasStatus) });
  const central = centralState(source);
  if (Object.keys(central).length) byId.set('legacy_central_state', { id: 'legacy_central_state', value: structuredClone(central) });
  return [...byId.values()];
}

function canonicalFromModularBackup(input) {
  const candidate = input && typeof input === 'object' && input.modular && typeof input.modular === 'object' ? input.modular : input;
  if (!candidate || typeof candidate !== 'object' || !candidate.stores || typeof candidate.stores !== 'object') return null;
  const schema = text(candidate.schema);
  if (!/^oficinaos-modular-v\d+$/i.test(schema)) return null;
  const stores = obj(candidate.stores);
  const data = {};
  for (const name of STATE_STORES) data[name] = structuredClone(arr(stores[name]));
  data.settings = structuredClone(arr(stores.settings));
  data.meta = structuredClone(arr(stores.meta));
  return data;
}

export function canonicalFromLegacy(input) {
  const modular = canonicalFromModularBackup(input);
  if (modular) return modular;
  const source = unwrapLegacyBackup(input);
  const budgetsRaw = firstDefined(source, ['orcHistorico','fp_orc_historico'], []);
  const archivedRaw = firstDefined(source, ['oficinaos_orc_arquivados_v1'], []);
  const trashRaw = firstDefined(source, ['oficinaos_orc_lixeira_v1'], []);
  const clients = normalizeRecords(firstDefined(source, ['clientes','fp_clientes'], []), 'client', r => ({ ...r, name: r.name ?? r.nome ?? '' }));
  const jobs = normalizeRecords(firstDefined(source, ['jobs','fp_jobs'], []), 'job', r => ({ ...r, budgetId: r.budgetId ?? r.orcamentoId ?? r.orcId ?? null }));
  const budgets = normalizeRecords(budgetsRaw, 'budget', r => ({ ...r, clientId: r.clientId ?? r.clienteId ?? clientIdByName(clients, r.cliente) }));
  const workOrders = normalizeWorkOrders(source, jobs, budgets, clients);
  const appointments = normalizeAppointments(source, jobs, workOrders);
  const central = centralState(source);
  const transactionSource = firstDefined(source, ['ALL_TX','fp_user_tx','fp_tx','tx'], arr(central.lancamentos));

  const data = {
    transactions: normalizeRecords(transactionSource, 'tx'),
    accounts: normalizeRecords(firstDefined(source, ['contas','fp_contas'], []), 'account', r => ({ ...r, category: r.category ?? r.cat ?? r.categoria ?? '' })),
    clients,
    jobs,
    workOrders,
    appointments,
    checklists: normalizeChecklists(source, budgets),
    budgets,
    categories: repairCategorySource(normalizeCategories(source)),
    goals: normalizeGoals(source),
    stock: normalizeRecords(firstDefined(source, ['estoque','fp_estoque'], []), 'stock', r => ({ ...r, name: r.name ?? r.nome ?? '', category: r.category ?? r.cat ?? '' })),
    operationalHistory: normalizeRecords(firstDefined(source, ['oficina_event_history'], []), 'event', r => ({ ...r, at: r.at ?? r.createdAt ?? r.data ?? '' })),
    budgetHistory: [],
    archivedBudgets: normalizeRecords(archivedRaw, 'archived_budget'),
    trash: normalizeRecords(trashRaw, 'trash_budget', r => ({ ...r, entityType: r.entityType ?? 'budget' })),
    deletionBackups: normalizeRecords(firstDefined(source, ['oficinaos_orc_exclusoes_backup_v1'], []), 'deletion_backup'),
    deletionLog: normalizeRecords(firstDefined(source, ['oficinaos_orc_exclusoes_log_v1'], []), 'deletion_log'),
    recurringTemplates: normalizeRecords(firstDefined(source, ['oficinaos_recurring_templates_v1'], []), 'recurring', r => ({ ...r, active: r.active ?? true })),
    settings: legacySettings(source),
    meta: [
      { id: 'schema', value: DATA_SCHEMA },
      { id: 'migratedAt', value: new Date().toISOString() },
      { id: 'migrationSource', value: source.meta?.backend || source.version || 'legacy-json' }
    ]
  };
  return data;
}

export function validateLegacyPayload(input) {
  const modular = canonicalFromModularBackup(input);
  if (modular) {
    return {
      valid: true,
      recognized: ['modular'],
      counts: {
        transactions: modular.transactions.length,
        accounts: modular.accounts.length,
        clients: modular.clients.length,
        jobs: modular.jobs.length,
        appointments: modular.appointments.length,
        stock: modular.stock.length,
        goals: modular.goals.length,
        budgets: modular.budgets.length
      }
    };
  }
  const source = unwrapLegacyBackup(input);
  const central = centralState(source);
  const recognized = [
    'ALL_TX','jobs','clientes','estoque','contas','metasCat','orcHistorico',
    'fp_user_tx','fp_jobs','fp_agenda','fp_clientes','fp_estoque','fp_contas','fp_metas_cat','fp_orc_historico','oficinaos_provisorio_integrado_v1'
  ].filter(key => source[key] !== undefined);
  return {
    valid: recognized.length > 0,
    recognized,
    counts: {
      transactions: arr(firstDefined(source, ['ALL_TX','fp_user_tx','fp_tx','tx'], arr(central.lancamentos))).length,
      accounts: arr(firstDefined(source, ['contas','fp_contas'], [])).length,
      clients: arr(firstDefined(source, ['clientes','fp_clientes'], [])).length,
      jobs: arr(firstDefined(source, ['jobs','fp_jobs'], [])).length,
      appointments: arr(firstDefined(source, ['fp_agenda'], [])).length,
      stock: arr(firstDefined(source, ['estoque','fp_estoque'], [])).length,
      goals: arr(firstDefined(source, ['metasCat','fp_metas_cat'], [])).length,
      budgets: arr(firstDefined(source, ['orcHistorico','fp_orc_historico'], [])).length
    }
  };
}
