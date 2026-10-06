import { createStore } from '../core/app-store.js';
import { eventBus } from '../core/event-bus.js';
import { createDatabase } from '../data/indexeddb.js';
import { createRepositories } from '../data/repositories/index.js';
import { loadStateFromRepositories } from '../data/load-state.js';
import { auditCanonical, compareFinancialSignatures, financialSignatures } from '../data/integrity.js';
import { canonicalFromLegacy, validateLegacyPayload } from '../data/legacy-compat.js';
import { legacyDatabaseAvailable, migrateSameOriginLegacyDatabase, importLegacyPayload } from '../data/migrations.js';
import { exportLegacyCompatibleBackup, exportCanonicalBackup, downloadJson } from '../data/backup-service.js';
import { renderAppShell } from './app-shell.js';
import { createSimpleModuleServices } from '../modules/simple-modules.js';
import { createWorkflowServices } from '../modules/workflow-services.js';
import { createHistoryServices } from '../modules/history-services.js';
import { createAnalyticsServices } from '../modules/analytics-services.js';
import { installLegacyAdapter } from './legacy-adapter.js';

async function saveSafetyBackup(repositories) {
  const current = await exportCanonicalBackup(repositories);
  const hasData = Object.values(current.stores).some(list => Array.isArray(list) && list.length > 0);
  if (!hasData) return null;
  const record = {
    id: `pre_migration_${Date.now()}`,
    createdAt: new Date().toISOString(),
    reason: 'pre-migration',
    payload: current
  };
  await repositories.backups.put(record);
  return record.id;
}

function chooseJsonFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

export async function boot(root) {
  if (!root) throw new Error('Elemento #app não encontrado.');

  const db = await createDatabase();
  const repositories = createRepositories(db);
  const store = createStore(await loadStateFromRepositories(repositories));
  const legacyAvailable = await legacyDatabaseAvailable().catch(() => false);
  const simpleServices = createSimpleModuleServices({ repositories, eventBus, store });
  const workflowServices = createWorkflowServices({ repositories, eventBus, store });
  const historyServices = createHistoryServices({ repositories, eventBus, store });
  const analyticsServices = createAnalyticsServices({ repositories, eventBus, store, metasService: simpleServices.metas });
  const services = Object.freeze({ ...simpleServices, ...workflowServices, ...historyServices, ...analyticsServices });

  async function reload() {
    store.replace(await loadStateFromRepositories(repositories));
    eventBus.emit('data:reloaded', store.getState());
  }

  const api = {
    legacyAvailable,
    clients: services.clientes,
    categories: services.categorias,
    stock: services.estoque,
    goals: services.metas,
    settings: services.configuracoes,
    agenda: services.agenda,
    budget: services.orcamento,
    workOrders: services.workOrders,
    checklists: services.checklists,
    finance: services.financeiro,
    accounts: services.contas,
    operationalHistory: services.historicoOperacional,
    budgetHistory: services.historicoOrcamentos,
    reports: services.relatorios,
    consultant: services.consultor,
    audit: () => auditCanonical(store.getState()),
    async importJsonFile() {
      const file = await chooseJsonFile();
      if (!file) return { ok: false, message: 'Importação cancelada.' };
      try {
        const parsed = JSON.parse(await file.text());
        const validation = validateLegacyPayload(parsed);
        if (!validation.valid) return { ok: false, message: 'Arquivo JSON não reconhecido como backup do OficinaOS.' };
        const count = Object.values(validation.counts).reduce((sum, value) => sum + value, 0);
        if (!window.confirm(`Importar o backup e substituir os dados modulares atuais?\n\nRegistros reconhecidos: ${count}\nUma cópia preventiva será criada antes da substituição.`)) {
          return { ok: false, message: 'Importação cancelada.' };
        }
        const expectedFinancial = financialSignatures(canonicalFromLegacy(parsed));
        await saveSafetyBackup(repositories);
        await importLegacyPayload(db, parsed);
        await reload();
        const report = auditCanonical(store.getState());
        const financialComparison = compareFinancialSignatures(expectedFinancial, financialSignatures(store.getState()));
        eventBus.emit('migration:completed', { source: 'json', report, financialComparison });
        return { ok: true, message: `Backup importado. Auditoria: ${report.duplicateCount} IDs duplicados. Assinatura Financeiro/Contas: ${financialComparison.equal ? 'OK' : 'DIVERGENTE ('+financialComparison.differences.join(', ')+')'}.` };
      } catch (error) {
        console.error(error);
        return { ok: false, message: `Falha ao importar: ${error.message}` };
      }
    },
    async importLegacyDatabase() {
      if (!legacyAvailable) return { ok: false, message: 'Banco legado não está disponível neste domínio.' };
      if (!window.confirm('Importar o IndexedDB legado para a base modular?\n\nO banco antigo não será alterado. Uma cópia preventiva da base modular atual será criada.')) {
        return { ok: false, message: 'Importação cancelada.' };
      }
      try {
        await saveSafetyBackup(repositories);
        const result = await migrateSameOriginLegacyDatabase(db);
        if (!result.migrated) return { ok: false, message: 'Nenhum banco legado compatível foi encontrado.' };
        const expectedFinancial = financialSignatures(result.canonical);
        await reload();
        const report = auditCanonical(store.getState());
        const financialComparison = compareFinancialSignatures(expectedFinancial, financialSignatures(store.getState()));
        eventBus.emit('migration:completed', { source: result.source, report, financialComparison });
        return { ok: true, message: `IndexedDB legado importado sem alterar a origem. Auditoria: ${report.duplicateCount} IDs duplicados. Assinatura Financeiro/Contas: ${financialComparison.equal ? 'OK' : 'DIVERGENTE ('+financialComparison.differences.join(', ')+')'}.` };
      } catch (error) {
        console.error(error);
        return { ok: false, message: `Falha na migração do IndexedDB: ${error.message}` };
      }
    },
    async exportBackup() {
      try {
        const backup = await exportLegacyCompatibleBackup(repositories);
        downloadJson(backup, `OficinaOS-backup-modular-${new Date().toISOString().slice(0,10)}.json`);
        return { ok: true, message: 'Backup compatível exportado.' };
      } catch (error) {
        console.error(error);
        return { ok: false, message: `Falha ao exportar: ${error.message}` };
      }
    }
  };

  installLegacyAdapter({ store, repositories, services, eventBus });
  renderAppShell(root, api);
  eventBus.emit('app:ready', { version: '0.9.1-rc1', legacyAvailable });
}
