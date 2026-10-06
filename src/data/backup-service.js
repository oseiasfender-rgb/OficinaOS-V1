import { isBuiltinCategory } from './category-model.js';
import { DATA_SCHEMA, STATE_STORES } from './schema.js';

async function readStores(repositories, names) {
  const data = {};
  for (const name of names) data[name] = repositories[name] ? await repositories[name].list() : [];
  return data;
}

export async function exportCanonicalBackup(repositories) {
  const stores = await readStores(repositories, [...STATE_STORES, 'settings', 'meta']);
  return {
    schema: DATA_SCHEMA,
    exportedAt: new Date().toISOString(),
    stores
  };
}

function settingValue(settings, id, fallback = undefined) {
  const row = settings.find(item => item.id === id);
  return row ? row.value : fallback;
}

export async function exportLegacyCompatibleBackup(repositories) {
  const canonical = await exportCanonicalBackup(repositories);
  const s = canonical.stores;
  const passthroughSettings = Object.fromEntries(
    s.settings
      .filter(item => item && typeof item.id === 'string' && item.id !== 'legacy_central_state')
      .map(item => [item.id, structuredClone(item.value)])
  );
  const centralState = {
    schemaVersion: 1,
    updatedAt: canonical.exportedAt,
    clientes: s.clients.map(client => ({ id: client.id, nome: client.name ?? client.nome ?? '', telefone: client.fone ?? client.phone ?? '', email: client.email ?? '' })),
    veiculos: s.clients.flatMap(client => (client.veiculos || []).map(vehicle => ({ ...structuredClone(vehicle), clienteId: client.id }))),
    orcamentos: s.budgets.map(b => ({ ...structuredClone(b), clienteId: b.clientId ?? b.clienteId ?? null })),
    ordensServico: s.workOrders.map(o => ({ ...structuredClone(o), numero: o.number ?? o.numero, orcamentoId: o.budgetId ?? o.orcamentoId ?? null, clienteId: o.clientId ?? o.clienteId ?? null, veiculoId: o.vehicleId ?? o.veiculoId ?? null, etapa: o.stage ?? o.etapa, entrada: o.entryDate ?? o.entrada, entregaPrevista: o.dueDate ?? o.entregaPrevista, valor: o.value ?? o.valor })),
    agendamentos: s.appointments.map(a => ({ ...structuredClone(a), osId: a.workOrderId ?? a.osId, clienteId: a.clientId ?? a.clienteId ?? null, data: a.date ?? a.data, hora: a.time ?? a.hora, tipo: a.type ?? a.tipo })),
    lancamentos: s.transactions.map(t => ({
      id: t.id,
      legacyId: t.legacyId ?? t.id,
      tipo: /^(rec|receita|income)$/i.test(String(t.type ?? t.tipo ?? '')) ? 'receita' : /^(transfer|transferencia|transferência)$/i.test(String(t.type ?? t.tipo ?? '')) ? 'transferencia' : 'despesa',
      descricao: t.desc ?? t.descricao ?? t.name ?? '',
      categoria: t.cat ?? t.categoria ?? 'Geral',
      valor: Number(t.val ?? t.valor ?? t.amount ?? 0) || 0,
      vencimento: t.date ?? t.vencimento ?? '',
      status: t.paid === true || String(t.paid ?? t.status ?? '').toLowerCase() === 'pago' ? 'Pago' : 'Pendente',
      clienteId: t.clientId ?? t.clienteId ?? null,
      orcamentoId: t.budgetId ?? t.orcamentoId ?? t.orcId ?? null,
      osId: t.workOrderId ?? t.osId ?? t.jobId ?? null,
      contaId: t.contaId ?? null, source: t.source ?? '', fromAccount: t.fromAccount ?? '', toAccount: t.toAccount ?? '', transferId: t.transferId ?? '',
      createdAt: t.createdAt ?? canonical.exportedAt
    })),
    checklists: Object.fromEntries(s.checklists.map(c => [c.id, { etapas: structuredClone(c.stages || {}), stage: c.currentStage || 'entrada', updatedAt: c.updatedAt }])),
    eventos: s.operationalHistory.map(event => structuredClone(event)),
    ui: { currentBudgetId: null, currentOsId: null, currentStage: 'entrada' }
  };
  return {
    ...passthroughSettings,
    version: '2.6-modular-compatible',
    exportedAt: canonical.exportedAt,
    ALL_TX: s.transactions,
    jobs: s.jobs,
    fp_agenda: s.appointments.map(a => ({ id:a.id, osId:a.workOrderId ?? null, clienteId:a.clientId ?? null, orcamentoId:a.budgetId ?? null, cliente:a.clientName ?? '', veiculo:a.vehicle ?? '', servico:a.service ?? '', data:a.date ?? '', entrega:a.dueDate ?? '', hora:a.time ?? '08:00', status:a.status ?? 'Agendado' })),
    clientes: s.clients,
    estoque: s.stock,
    contas: s.accounts,
    metasCat: s.goals,
    metaPrincipal: settingValue(s.settings, 'fp_meta_principal', 0),
    nextTxId: settingValue(s.settings, 'fp_next_tx_id', 1),
    dasStatus: settingValue(s.settings, 'fp_das_status', {}),
    orcHistorico: s.budgets,
    fp_orc_historico: s.budgets,
    fp_fin_categories: s.categories.filter(item => item.custom === true || (!isBuiltinCategory(item.name) && !String(item.source || '').startsWith('referenced'))).map(item => item.name),
    fp_fin_category_groups: Object.fromEntries(s.categories.filter(item => item?.name).map(item => [item.name, item.group || 'outros'])),
    fp_fin_categories_hidden: s.categories.filter(item => item.hidden).map(item => item.name),
    oficina_event_history: s.operationalHistory,
    oficinaos_orc_arquivados_v1: s.archivedBudgets,
    oficinaos_orc_lixeira_v1: s.trash.filter(item => !item.entityType || item.entityType === 'budget'),
    oficinaos_orc_exclusoes_backup_v1: s.deletionBackups,
    oficinaos_orc_exclusoes_log_v1: s.deletionLog,
    oficinaos_recurring_templates_v1: s.recurringTemplates,
    oficinaos_provisorio_integrado_v1: centralState,
    modular: canonical
  };
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
