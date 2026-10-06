import { safeText } from '../../core/validators.js';
import {
  BUILTIN_CATEGORIES,
  CATEGORY_GROUP_ORDER,
  CATEGORY_GROUPS,
  categoryKey,
  defaultGroupForCategory,
  isBuiltinCategory
} from '../../data/category-model.js';

function categoryName(record) {
  return safeText(record?.name ?? record?.cat ?? record?.categoria, 100);
}

function categoryFromAccount(record) {
  return safeText(record?.category ?? record?.cat ?? record?.categoria, 100);
}

export function createCategoriasService({ repositories, eventBus, store }) {
  const repo = repositories.categories;
  const txRepo = repositories.transactions;
  const accountRepo = repositories.accounts;
  const goalRepo = repositories.goals;
  const backupRepo = repositories.deletionBackups;

  async function usageMap() {
    const usage = new Map();
    const add = name => {
      const key = categoryKey(name);
      if (key) usage.set(key, (usage.get(key) || 0) + 1);
    };
    for (const row of await txRepo.list()) add(row?.cat ?? row?.category);
    for (const row of await accountRepo.list()) add(categoryFromAccount(row));
    return usage;
  }

  async function metadataMap() {
    const rows = await repo.list();
    return new Map(rows.map(row => [categoryKey(row.name), row]));
  }

  async function list({ includeHidden = false } = {}) {
    const [meta, usage, transactions, accounts] = await Promise.all([
      metadataMap(), usageMap(), txRepo.list(), accountRepo.list()
    ]);
    const names = [];
    const seen = new Set();
    const add = name => {
      const clean = safeText(name, 100);
      const key = categoryKey(clean);
      if (!clean || seen.has(key)) return;
      seen.add(key);
      names.push(clean);
    };
    BUILTIN_CATEGORIES.forEach(add);
    for (const row of meta.values()) add(row.name);
    transactions.forEach(row => add(row?.cat ?? row?.category));
    accounts.forEach(row => add(categoryFromAccount(row)));

    return names.map(name => {
      const key = categoryKey(name);
      const saved = meta.get(key);
      const builtin = isBuiltinCategory(name);
      return {
        id: saved?.id ?? name,
        name,
        group: saved?.group || defaultGroupForCategory(name),
        hidden: Boolean(saved?.hidden),
        custom: saved?.custom ?? (!builtin && Boolean(saved)),
        builtin,
        source: saved?.source || (builtin ? 'builtin' : 'referenced'),
        usage: usage.get(key) || 0
      };
    }).filter(row => includeHidden || !row.hidden).sort((a,b) => {
      const ga = CATEGORY_GROUP_ORDER.indexOf(a.group);
      const gb = CATEGORY_GROUP_ORDER.indexOf(b.group);
      return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb) || b.usage - a.usage || a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  async function syncStore() {
    if (!store?.patch) return;
    store.patch({ categories: await repo.list() });
  }

  async function putMetadata(record) {
    await repo.put(record);
    await syncStore();
    return record;
  }

  async function create(name, group = 'outros') {
    const cleanName = safeText(name, 100);
    if (!cleanName) throw new Error('Nome da categoria é obrigatório.');
    const all = await list({ includeHidden: true });
    const existing = all.find(row => categoryKey(row.name) === categoryKey(cleanName));
    if (existing) {
      if (existing.hidden) return restore(existing.name);
      return existing;
    }
    const record = {
      id: cleanName,
      name: cleanName,
      group: CATEGORY_GROUPS[group] ? group : 'outros',
      hidden: false,
      custom: true,
      source: 'modular-custom',
      updatedAt: new Date().toISOString()
    };
    await putMetadata(record);
    eventBus.emit('categorias:changed', { action: 'create', id: record.id });
    return record;
  }

  async function setGroup(name, group) {
    const cleanName = safeText(name, 100);
    if (!cleanName) throw new Error('Categoria inválida.');
    const validGroup = CATEGORY_GROUPS[group] ? group : 'outros';
    const existing = (await repo.list()).find(row => categoryKey(row.name) === categoryKey(cleanName));
    const record = {
      ...(existing || {}),
      id: existing?.id ?? cleanName,
      name: existing?.name ?? cleanName,
      group: validGroup,
      hidden: Boolean(existing?.hidden),
      custom: existing?.custom ?? !isBuiltinCategory(cleanName),
      source: existing?.source || (isBuiltinCategory(cleanName) ? 'builtin-override' : 'modular-custom'),
      updatedAt: new Date().toISOString()
    };
    await putMetadata(record);
    eventBus.emit('categorias:changed', { action: 'group', id: record.id, group: validGroup });
    return record;
  }

  async function setHidden(name, hidden) {
    const cleanName = safeText(name, 100);
    if (!cleanName) throw new Error('Categoria inválida.');
    const existing = (await repo.list()).find(row => categoryKey(row.name) === categoryKey(cleanName));
    const record = {
      ...(existing || {}),
      id: existing?.id ?? cleanName,
      name: existing?.name ?? cleanName,
      group: existing?.group || defaultGroupForCategory(cleanName),
      hidden: Boolean(hidden),
      custom: existing?.custom ?? !isBuiltinCategory(cleanName),
      source: existing?.source || (isBuiltinCategory(cleanName) ? 'builtin-override' : 'modular-custom'),
      updatedAt: new Date().toISOString()
    };
    await putMetadata(record);
    eventBus.emit('categorias:changed', { action: hidden ? 'hide' : 'restore', id: record.id });
    return record;
  }

  async function restore(name) { return setHidden(name, false); }

  async function rename(oldName, newName) {
    const currentName = safeText(oldName, 100);
    const nextName = safeText(newName, 100);
    if (!currentName || !nextName) throw new Error('Informe o nome atual e o novo nome.');
    if (categoryKey(currentName) === categoryKey(nextName)) return (await list({ includeHidden: true })).find(row => categoryKey(row.name) === categoryKey(currentName));
    const collision = (await list({ includeHidden: true })).find(row => categoryKey(row.name) === categoryKey(nextName));
    if (collision) throw new Error('Já existe uma categoria com esse nome.');

    const [rows, accounts, goals, metadata] = await Promise.all([txRepo.list(), accountRepo.list(), goalRepo.list(), repo.list()]);
    const oldMeta = metadata.find(row => categoryKey(row.name) === categoryKey(currentName));
    const affectedTx = rows.filter(row => categoryKey(row?.cat ?? row?.category) === categoryKey(currentName));
    const affectedAccounts = accounts.filter(row => categoryKey(categoryFromAccount(row)) === categoryKey(currentName));
    const affectedGoals = goals.filter(row => categoryKey(row?.category ?? row?.cat) === categoryKey(currentName));

    await backupRepo.put({
      id: `category_rename_${Date.now()}`,
      at: new Date().toISOString(),
      entityType: 'category',
      reason: 'rename',
      payload: { oldName: currentName, newName: nextName, transactions: affectedTx, accounts: affectedAccounts, goals: affectedGoals, metadata: oldMeta || null }
    });

    for (const row of affectedTx) await txRepo.put({ ...row, cat: nextName, category: row.category !== undefined ? nextName : row.category });
    for (const row of affectedAccounts) {
      const next = { ...row, category: nextName };
      if (row.cat !== undefined) next.cat = nextName;
      if (row.categoria !== undefined) next.categoria = nextName;
      await accountRepo.put(next);
    }
    for (const row of affectedGoals) {
      const next = { ...row, category: nextName, cat: nextName, id: nextName };
      await goalRepo.delete(row.id);
      await goalRepo.put(next);
    }

    if (oldMeta?.id != null) await repo.delete(oldMeta.id);
    if (isBuiltinCategory(currentName)) await setHidden(currentName, true);
    const nextRecord = {
      id: nextName,
      name: nextName,
      group: oldMeta?.group || defaultGroupForCategory(currentName),
      hidden: false,
      custom: true,
      source: 'modular-custom',
      updatedAt: new Date().toISOString()
    };
    await putMetadata(nextRecord);
    if (store?.patch) store.patch({ transactions: await txRepo.list(), accounts: await accountRepo.list(), goals: await goalRepo.list(), categories: await repo.list() });
    eventBus.emit('categorias:changed', { action: 'rename', from: currentName, to: nextName });
    return nextRecord;
  }

  async function remove(name) {
    const cleanName = safeText(name, 100);
    if (!cleanName) throw new Error('Categoria inválida.');
    if (isBuiltinCategory(cleanName)) return setHidden(cleanName, true);
    const [metadata, visible] = await Promise.all([repo.list(), list({ includeHidden: true })]);
    const existing = metadata.find(row => categoryKey(row.name) === categoryKey(cleanName));
    const entry = visible.find(row => categoryKey(row.name) === categoryKey(cleanName));
    if (existing) {
      await backupRepo.put({ id: `category_delete_${Date.now()}`, at: new Date().toISOString(), entityType: 'category', reason: 'delete-metadata', payload: existing });
      await repo.delete(existing.id);
    }
    if ((entry?.usage || 0) > 0) {
      await repo.put({
        id: cleanName, name: cleanName, group: existing?.group || entry?.group || 'outros',
        hidden: true, custom: false, source: 'referenced-override', updatedAt: new Date().toISOString()
      });
    }
    await syncStore();
    eventBus.emit('categorias:changed', { action: 'delete', name: cleanName });
    return true;
  }

  return Object.freeze({ list, create, setGroup, setHidden, restore, rename, remove, groups: CATEGORY_GROUPS, builtin: BUILTIN_CATEGORIES });
}
