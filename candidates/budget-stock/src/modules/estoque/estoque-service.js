import { safeText } from '../../core/validators.js';
import { parseBRL } from '../../core/money.js';
import { ESTOQUE_DEFAULT } from './estoque-default.js';

function number(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function clone(value) { return structuredClone(value); }

export function createEstoqueService({ repositories, eventBus, store }) {
  const repo = repositories.stock;
  const backupRepo = repositories.deletionBackups;

  function normalize(input = {}, id = input.id) {
    const name = safeText(input.nome ?? input.name, 120);
    if (!name) throw new Error('Nome do material é obrigatório.');
    const qty = Math.max(0, number(input.qty ?? input.quantidade, 0));
    const cost = Math.max(0, parseBRL(input.custo ?? input.cost ?? input.unit ?? 0));
    const minQty = Math.max(0, number(input.minimo ?? input.minQty, 1));
    const category = safeText(input.cat ?? input.category, 40) || 'outros';
    const unit = safeText(input.unid ?? input.unitName, 24) || 'Un';
    const supplier = safeText(input.forn ?? input.fornecedor, 120);
    const photo=String(input.foto??'');if(photo&&(!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo)||photo.length>2500000))throw new Error('Foto do material inválida ou muito grande. Use JPEG/PNG.');
    return {
      ...clone(input), id, name, nome: name, category, cat: category, unid: unit,
      qty, cost, custo: cost, unit: cost, minimo: minQty, minQty,
      forn: supplier, foto: photo, updatedAt: new Date().toISOString()
    };
  }

  async function syncStore() {
    const rows = await repo.list();
    if (store?.patch) store.patch({ stock: rows });
    return rows;
  }

  async function nextNumericId() {
    const ids = new Set((await repo.list()).map(row => String(row.id)));
    let candidate = Date.now();
    while (ids.has(String(candidate))) candidate += 1;
    return candidate;
  }

  async function list({ search = '', filter = 'todos', category = '' } = {}) {
    const q = safeText(search, 120).toLocaleLowerCase('pt-BR');
    const catFilter = safeText(category, 40).toLocaleLowerCase('pt-BR');
    const rows = (await repo.list()).map(row => normalize(row, row.id));
    return rows.filter(row => {
      const min = number(row.minimo ?? row.minQty, 1);
      if (filter === 'baixo' && !(row.qty > 0 && row.qty <= min)) return false;
      if (filter === 'zero' && row.qty > 0) return false;
      if (catFilter && safeText(row.cat).toLocaleLowerCase('pt-BR') !== catFilter) return false;
      if (q && !`${row.nome} ${row.cat} ${row.forn}`.toLocaleLowerCase('pt-BR').includes(q)) return false;
      return true;
    }).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async function summary() {
    const rows = await list();
    const low = rows.filter(row => row.qty > 0 && row.qty <= number(row.minimo, 1));
    const zero = rows.filter(row => row.qty <= 0);
    const value = rows.reduce((sum, row) => sum + row.qty * row.custo, 0);
    return { total: rows.length, low: low.length, zero: zero.length, value };
  }

  async function get(id) { return repo.get(id); }

  async function create(input = {}) {
    const id = input.id ?? await nextNumericId();
    const record = normalize(input, id);
    await repo.put(record);
    await syncStore();
    eventBus.emit('estoque:changed', { action: 'create', id: record.id });
    return record;
  }

  async function hasConsumption(id) {
    const rows=await repositories.settings?.list?.()??[];
    if(rows.some(r=>String(r.id).startsWith('os_execution:')&&(r.value?.materials||[]).some(m=>m.stockMovementId&&String(m.stockId)===String(id))))return true;
    for(const name of ['budgets','archivedBudgets','trash'])if((await repositories[name]?.list?.()??[]).some(b=>Number(b.stockAllocation?.held?.[`material:${id}`])>0))return true;
    return false;
  }
  async function update(id, changes = {}) {
    const current = await repo.get(id);
    if (!current) throw new Error('Material não encontrado.');
    if(changes.unid!=null&&changes.unid!==current.unid&&await hasConsumption(id))throw new Error('Material vinculado a baixa de orçamento ou consumo de OS: a unidade não pode ser trocada sem conversão e conferência próprias.');
    const record = normalize({ ...current, ...clone(changes) }, current.id);
    if(repositories.mutateStock)await repositories.mutateStock({action:'update',row:record,expected:current});else await repo.put(record);
    await syncStore();
    eventBus.emit('estoque:changed', { action: 'update', id: record.id });
    return record;
  }

  async function updateQuantity(id, qty) { return update(id, { qty: Math.max(0, number(qty, 0)) }); }
  async function adjustQuantity(id, delta) {
    const current = await repo.get(id);
    if (!current) throw new Error('Material não encontrado.');
    return update(id, { qty: Math.max(0, number(current.qty, 0) + number(delta, 0)) });
  }

  async function remove(id) {
    const current = await repo.get(id);
    if (!current) return false;
    if(await hasConsumption(id))throw new Error('Material vinculado a baixa de orçamento ou consumo de OS. Preserve o cadastro para histórico e devoluções.');
    const backup={id:`stock_delete_${crypto.randomUUID()}`,at:new Date().toISOString(),entityType:'stock',reason:'delete',payload:clone(current)};
    if(repositories.mutateStock)await repositories.mutateStock({action:'delete',row:current,expected:current,backup});else{await backupRepo.put(backup);await repo.delete(id);}
    await syncStore();
    eventBus.emit('estoque:changed', { action: 'delete', id });
    return true;
  }

  async function loadDefaultList() {
    const current = await repo.list();
    const ids = new Set(current.map(row => String(row.id)));
    let added = 0;
    for (const source of ESTOQUE_DEFAULT) {
      if (ids.has(String(source.id))) continue;
      await repo.put(normalize(source, source.id));
      ids.add(String(source.id));
      added += 1;
    }
    await syncStore();
    eventBus.emit('estoque:changed', { action: 'load-defaults', added });
    return { added, total: (await repo.count()) };
  }

  return Object.freeze({ list, get, summary, create, update, updateQuantity, adjustQuantity, remove, loadDefaultList, defaultCount: ESTOQUE_DEFAULT.length });
}
