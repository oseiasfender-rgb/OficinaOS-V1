import { parseBRL } from '../../core/money.js';
import { safeText } from '../../core/validators.js';

export function text(value, max = 1000) { return safeText(value, max); }
export function amount(value) { return Math.max(0, parseBRL(value)); }
export function isPaid(value) {
  if (value === true) return true;
  const s = text(value, 40).toLocaleLowerCase('pt-BR');
  return s === 'pago' || s === 'paid' || s === 'sim' || s === 'true';
}
export function paidLabel(value) { return isPaid(value) ? 'Pago' : 'Não pago'; }
export function normalizeType(value) {
  const s = text(value, 40).toLocaleLowerCase('pt-BR');
  if (s === 'rec' || s === 'receita' || s === 'income') return 'rec';
  if (s === 'transfer' || s === 'transferencia' || s === 'transferência') return 'transfer';
  return 'dep';
}
export function isoDate(value, fallback = '') {
  const s = text(value, 40);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return fallback;
}
export function monthKey(value) { const d = isoDate(value); return d ? d.slice(0, 7) : ''; }
export function todayISO(now = new Date()) { return now.toISOString().slice(0, 10); }

export function normalizeTransaction(input = {}, fallbackId = '') {
  const copy = structuredClone(input || {});
  const id = copy.id ?? copy.legacyId ?? fallbackId;
  const type = normalizeType(copy.type ?? copy.tipo);
  const date = isoDate(copy.date ?? copy.data ?? copy.vencimento, todayISO());
  const desc = text(copy.desc ?? copy.descricao ?? copy.name ?? copy.nome, 240) || (type === 'rec' ? 'Receita' : type === 'transfer' ? 'Transferência' : 'Despesa');
  const cat = text(copy.cat ?? copy.categoria ?? copy.category, 100) || (type === 'transfer' ? 'Transferência' : 'Outros');
  const val = amount(copy.val ?? copy.valor ?? copy.amount);
  const paid = type === 'transfer' ? 'Pago' : paidLabel(copy.paid ?? copy.status ?? copy.pago);
  return {
    ...copy,
    id,
    date,
    desc,
    cat,
    val,
    type,
    paid,
    contaId: copy.contaId != null && copy.contaId !== '' ? String(copy.contaId) : '',
    source: text(copy.source, 80),
    fromAccount: text(copy.fromAccount ?? copy.contaOrigem, 80),
    toAccount: text(copy.toAccount ?? copy.contaDestino, 80),
    transferId: text(copy.transferId ?? copy.transferenciaId, 120),
    clientId: copy.clientId ?? copy.clienteId ?? null,
    budgetId: copy.budgetId ?? copy.orcamentoId ?? copy.orcId ?? null,
    workOrderId: copy.workOrderId ?? copy.osId ?? copy.jobId ?? null,
    updatedAt: copy.updatedAt ?? null
  };
}

function slug(value) {
  return text(value, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'conta';
}
export function recurringKey(input = {}) {
  const name = input.name ?? input.desc ?? input.descricao;
  const cat = input.cat ?? input.categoria ?? input.category ?? 'Outros';
  const val = amount(input.val ?? input.valor);
  const due = isoDate(input.due ?? input.vencimento ?? input.data);
  const day = due ? due.slice(8, 10) : '15';
  return text(input.recurKey, 200) || `${slug(name)}_${slug(cat)}_${val.toFixed(2).replace('.', '')}_${day}`;
}
export function normalizeAccount(input = {}, fallbackId = '') {
  const copy = structuredClone(input || {});
  const due = isoDate(copy.due ?? copy.vencimento ?? copy.data, todayISO());
  const recur = !!(copy.recur ?? copy.recorrente ?? (copy.tipo === 'recorrente'));
  const key = recur ? recurringKey(copy) : text(copy.recurKey, 200);
  const competencia = text(copy.competencia, 20) || (recur ? monthKey(due) : '');
  let id = copy.id ?? fallbackId;
  if (id == null || String(id).trim() === '') id = recur && key && competencia ? `ct_${key}_${competencia.replace('-', '')}` : `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const paid = !!(copy.paid ?? copy.pago ?? isPaid(copy.status));
  return {
    ...copy,
    id,
    name: text(copy.name ?? copy.desc ?? copy.descricao, 180) || 'Conta sem descrição',
    cat: text(copy.cat ?? copy.categoria ?? copy.category, 100) || 'Outros',
    category: text(copy.category ?? copy.cat ?? copy.categoria, 100) || 'Outros',
    val: amount(copy.val ?? copy.valor),
    due,
    paid,
    paidAt: paid ? isoDate(copy.paidAt ?? copy.dataPagamento ?? copy.paidDate, due) : '',
    recur,
    recorrente: recur,
    recurKey: key,
    competencia,
    paidTxId: copy.paidTxId != null && copy.paidTxId !== '' ? String(copy.paidTxId) : '',
    fromTx: copy.fromTx != null && copy.fromTx !== '' ? String(copy.fromTx) : '',
    recurTemplateId: text(copy.recurTemplateId ?? copy.recurringId, 160),
    recurOccurrenceId: text(copy.recurOccurrenceId, 200),
    updatedAt: copy.updatedAt ?? null
  };
}

function uniqueId(base, used) { let id = String(base); let i = 2; while (used.has(id)) id = `${base}__${i++}`; used.add(id); return id; }
function accountBusinessKey(account) {
  if (account.recur && account.recurKey) return `REC|${account.recurKey}|${account.competencia || monthKey(account.due)}`;
  return `UNI|${text(account.name).toLocaleLowerCase('pt-BR')}|${text(account.cat).toLocaleLowerCase('pt-BR')}|${account.due}|${account.val.toFixed(2)}`;
}

// A conciliação diagnostica o estado. Somente comandos explícitos podem criar
// projeções para as contas selecionadas; o histórico nunca é normalizado aqui.
export function reconcileFinancialData(rawTransactions = [], rawAccounts = [], { createAccountIds = [] } = {}) {
  const transactions = structuredClone(Array.isArray(rawTransactions) ? rawTransactions : []);
  const accounts = structuredClone(Array.isArray(rawAccounts) ? rawAccounts : []);
  const selected = new Set(createAccountIds.map(String));
  const used = new Set(transactions.map(t => String(t.id)));
  const txById = new Map(transactions.map(t => [String(t.id), t]));
  const conflicts = [], brokenLinks = [], accountDuplicates = [], unlinkedAccounts = [];
  const linked = new Set(), businessKeys = new Map();
  for (const c of accounts) {
    const normalized = normalizeAccount(c);
    const key = accountBusinessKey(normalized);
    if (businessKeys.has(key)) accountDuplicates.push({ keptId: businessKeys.get(key), duplicateId: c.id, key });
    else businessKeys.set(key, c.id);
    for (const field of ['fromTx', 'paidTxId']) {
      if (c[field] != null && c[field] !== '' && !txById.has(String(c[field])))
        brokenLinks.push({ type: field, accountId: String(c.id), targetId: String(c[field]) });
    }
    let tx = txById.get(String(c.paidTxId || '')) || txById.get(String(c.fromTx || '')) ||
      transactions.find(t => String(t.contaId || '') === String(c.id)) || txById.get(`conta_${String(c.id)}`);
    if (!tx && selected.has(String(c.id))) {
      const id = uniqueId(`conta_${String(c.id)}`, used);
      tx = normalizeTransaction({ id, date: normalized.paid ? normalized.paidAt : normalized.due,
        desc: `Conta: ${normalized.name}`, cat: normalized.cat, val: normalized.val, type: 'dep',
        paid: normalized.paid ? 'Pago' : 'Não pago', contaId: String(c.id), source: 'contas' });
      transactions.push(tx); txById.set(String(tx.id), tx); c.paidTxId = String(tx.id);
    }
    if (!tx) { unlinkedAccounts.push({ accountId: String(c.id) }); continue; }
    if (Math.round(amount(tx.val) * 100) !== Math.round(normalized.val * 100))
      conflicts.push({ type: 'amount', accountId: String(c.id), transactionId: String(tx.id), accountValue: normalized.val, transactionValue: amount(tx.val) });
    if (isPaid(tx.paid) !== normalized.paid)
      conflicts.push({ type: 'paid', accountId: String(c.id), transactionId: String(tx.id) });
    linked.add(String(tx.id));
  }
  const accountIds = new Set(accounts.map(c => String(c.id)));
  const orphans = transactions.filter(t => t.contaId && !accountIds.has(String(t.contaId)))
    .map(t => ({ transactionId: String(t.id), contaId: String(t.contaId) }));
  return { transactions, accounts, report: { conflicts, brokenLinks, orphans, accountDuplicates, unlinkedAccounts, linkedTransactions: linked.size } };
}

export function monthSummary(transactions = [], year, monthIndex) {
  const rows = transactions.map(t => normalizeTransaction(t)).filter(t => {
    if (t.type === 'transfer') return false;
    const p = t.date.split('-'); return Number(p[0]) === year && Number(p[1]) === monthIndex + 1;
  });
  const receipts = rows.filter(t => t.type === 'rec'); const expenses = rows.filter(t => t.type === 'dep');
  const totalReceipts = receipts.reduce((s, t) => s + t.val, 0); const totalExpenses = expenses.reduce((s, t) => s + t.val, 0);
  const result = totalReceipts - totalExpenses;
  return { rows, receipts, expenses, totalReceipts, totalExpenses, result, margin: totalReceipts > 0 ? result / totalReceipts * 100 : 0 };
}

export function dueForMonth(template, year, monthIndex) {
  const due = isoDate(template.due, `${year}-${String(monthIndex + 1).padStart(2, '0')}-15`);
  const day = Math.max(1, Number(due.slice(8, 10)) || 15); const last = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function projectCashFlow({ accounts = [], workOrders = [], bankBalances = {}, from = todayISO(), days = 30 } = {}) {
  const start = new Date(`${from}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + Math.max(0, Number(days) || 0));
  const events = [];
  for (const row of accounts.map(a => normalizeAccount(a))) {
    if (row.paid) continue; const d = new Date(`${row.due}T00:00:00`); if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
    events.push({ date: row.due, desc: row.name, val: row.val, type: 'dep', source: 'accounts', refId: row.id });
  }
  for (const os of (Array.isArray(workOrders) ? workOrders : [])) {
    if (String(os.status || '').toLocaleLowerCase('pt-BR') === 'entregue') continue;
    const date = isoDate(os.dueDate ?? os.entregaPrevista ?? os.entrega); const val = amount(os.value ?? os.valor ?? os.val); if (!date || val <= 0) continue;
    const d = new Date(`${date}T00:00:00`); if (d < start || d > end) continue;
    events.push({ date, desc: `${text(os.clientName ?? os.cliente, 120) || 'Cliente'} — ${text(os.vehicle ?? os.veiculo, 120)}`, val, type: 'rec', source: 'agenda', refId: os.id });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  let balance = Object.values(bankBalances || {}).reduce((sum, value) => sum + (Number(value) || 0), 0); let totalIn = 0; let totalOut = 0;
  for (const event of events) { if (event.type === 'rec') { balance += event.val; totalIn += event.val; } else { balance -= event.val; totalOut += event.val; } event.balance = balance; }
  return { openingBalance: Object.values(bankBalances || {}).reduce((sum, value) => sum + (Number(value) || 0), 0), totalIn, totalOut, closingBalance: balance, events };
}
