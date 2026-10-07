import { safeText } from '../../core/validators.js';

const CONFIG_KEY = 'os_config';

function sanitizeOfficeConfig(value = {}) {
  return {
    nome: safeText(value.nome, 120),
    subtitulo:safeText(value.subtitulo,120),
    endereco:safeText(value.endereco,180),
    dono: safeText(value.dono, 120),
    cnpj: safeText(value.cnpj, 24),
    cidade: safeText(value.cidade, 120),
    pix: safeText(value.pix, 180),
    fone: safeText(value.fone, 40),
    banco: safeText(value.banco, 120),
    bancoLink: safeText(value.bancoLink, 500),
    cor: safeText(value.cor, 20) || '#b8621a'
  };
}

export function createConfiguracoesService({ repositories, eventBus }) {
  const repo = repositories.settings;
  return Object.freeze({
    async get(key, fallback = null) {
      const row = await repo.get(key);
      return row ? structuredClone(row.value) : fallback;
    },
    async set(key, value) {
      const record = { id: String(key), value: structuredClone(value), updatedAt: new Date().toISOString() };
      await repo.put(record);
      eventBus.emit('configuracoes:changed', { key: record.id });
      return record;
    },
    async getOfficeConfig() {
      const row = await repo.get(CONFIG_KEY);
      return sanitizeOfficeConfig(row?.value || {});
    },
    async saveOfficeConfig(input) {
      const config = sanitizeOfficeConfig(input);
      if (!config.nome || !config.dono) throw new Error('Nome da oficina e proprietário são obrigatórios.');
      await repo.put({ id: CONFIG_KEY, value: config, updatedAt: new Date().toISOString() });
      eventBus.emit('configuracoes:changed', { key: CONFIG_KEY, value: config });
      return config;
    }
  });
}
