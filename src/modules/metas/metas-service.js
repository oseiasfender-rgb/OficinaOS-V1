import { safeText } from '../../core/validators.js';
import { parseBRL } from '../../core/money.js';
import { isPaid } from '../financeiro/financial-model.js';
import { categoryKey } from '../../data/category-model.js';

function dateParts(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return dateParts(new Date());
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function txDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createMetasService({ repositories, eventBus, store }) {
  const repo = repositories.goals;
  const settings = repositories.settings;
  const txRepo = repositories.transactions;
  const backupRepo = repositories.deletionBackups;

  async function syncStore() {
    if (store?.patch) store.patch({ goals: await repo.list() });
  }

  async function getPrincipal() {
    const row = await settings.get('fp_meta_principal');
    return Math.max(0, parseBRL(row?.value ?? 0));
  }

  async function setPrincipal(value) {
    const meta = Math.max(0, parseBRL(value));
    if (meta <= 0) throw new Error('Informe uma meta mensal maior que zero.');
    await settings.put({ id: 'fp_meta_principal', value: meta, updatedAt: new Date().toISOString() });
    eventBus.emit('metas:changed', { action: 'principal', value: meta });
    return meta;
  }

  async function transactionsForMonth(dateLike = new Date()) {
    const { year, month } = dateParts(dateLike);
    const rows = await txRepo.list();
    return rows.filter(row => {
      const date = txDate(row.date);
      return row.type === 'rec' && isPaid(row.paid ?? row.status ?? row.pago) && date && date.getFullYear() === year && date.getMonth() === month;
    });
  }

  async function list({ date = new Date() } = {}) {
    const [goals, transactions] = await Promise.all([repo.list(), transactionsForMonth(date)]);
    return goals.map(row => {
      const category = safeText(row.category ?? row.cat ?? row.nome, 100) || String(row.id);
      const meta = Math.max(0, parseBRL(row.meta ?? row.value ?? 0));
      const real = transactions.filter(tx => String(tx.cat ?? tx.category ?? 'Outros') === category).reduce((sum, tx) => sum + parseBRL(tx.val ?? tx.value ?? 0), 0);
      return { ...row, id: row.id ?? category, category, cat: category, meta, real };
    }).sort((a,b) => a.category.localeCompare(b.category, 'pt-BR'));
  }

  async function upsertCategoryGoal(category, value) {
    const clean = safeText(category, 100);
    if (!clean) throw new Error('Categoria da meta é obrigatória.');
    const meta = Math.max(0, parseBRL(value));
    if (meta <= 0) throw new Error('A meta da categoria deve ser maior que zero.');
    const rows = await repo.list();
    const existing = rows.find(row => String(row.category ?? row.cat ?? row.id) === clean);
    const record = { ...(existing || {}), id: existing?.id ?? clean, category: clean, cat: clean, meta, real: existing?.real ?? 0, updatedAt: new Date().toISOString() };
    await repo.put(record);
    await syncStore();
    eventBus.emit('metas:changed', { action: existing ? 'update' : 'create', id: record.id });
    return record;
  }

  async function renameCategoryGoal(id, category, value) {
    const current = await repo.get(id);
    if (!current) throw new Error('Meta não encontrada.');
    const clean = safeText(category, 100);
    const meta = Math.max(0, parseBRL(value));
    if (!clean || meta <= 0) throw new Error('Categoria e valor da meta são obrigatórios.');
    const collision = (await repo.list()).some(row => String(row.id) !== String(id) &&
      (String(row.id) === clean || categoryKey(row.category ?? row.cat ?? row.id) === categoryKey(clean)));
    if (collision) throw new Error('Já existe uma meta para essa categoria. Edite a meta existente.');
    if (String(id) !== clean) await repo.delete(id);
    const record = { ...current, id: clean, category: clean, cat: clean, meta, updatedAt: new Date().toISOString() };
    await repo.put(record);
    await syncStore();
    eventBus.emit('metas:changed', { action: 'update', id: record.id });
    return record;
  }

  async function remove(id) {
    const current = await repo.get(id);
    if (!current) return false;
    await backupRepo.put({ id: `goal_delete_${Date.now()}`, at: new Date().toISOString(), entityType: 'goal', reason: 'delete', payload: structuredClone(current) });
    await repo.delete(id);
    await syncStore();
    eventBus.emit('metas:changed', { action: 'delete', id });
    return true;
  }

  async function summary(dateLike = new Date()) {
    const [meta, transactions, categories] = await Promise.all([getPrincipal(), transactionsForMonth(dateLike), list({ date: dateLike })]);
    const real = transactions.reduce((sum, tx) => sum + parseBRL(tx.val ?? tx.value ?? 0), 0);
    const pct = meta > 0 ? Math.round(real / meta * 100) : 0;
    const missing = Math.max(meta - real, 0);
    const { year, month, day } = dateParts(dateLike);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const passedDays = Math.min(day, totalDays);
    const remainingDays = Math.max(totalDays - passedDays, 0);
    const dailyAverage = passedDays > 0 ? real / passedDays : 0;
    const projection = dailyAverage * totalDays;
    const neededPerDay = remainingDays > 0 ? missing / remainingDays : 0;
    return { meta, real, pct, missing, totalDays, passedDays, remainingDays, dailyAverage, projection, neededPerDay, categories };
  }

  return Object.freeze({ getPrincipal, setPrincipal, list, upsertCategoryGoal, renameCategoryGoal, remove, summary });
}
