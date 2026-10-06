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

export function reconcileFinancialData(rawTransactions = [], rawAccounts = []) {
  const usedTxIds = new Set();
  const transactions = (Array.isArray(rawTransactions) ? rawTransactions : []).map((row, index) => {
    const normalized = normalizeTransaction(row, `tx_${index + 1}`);
    const original = String(normalized.id);
    if (!usedTxIds.has(original)) { usedTxIds.add(original); return normalized; }
    return { ...normalized, legacyId: normalized.legacyId ?? normalized.id, id: uniqueId(`${original}__dup`, usedTxIds) };
  });
  const txById = new Map(transactions.map(t => [String(t.id), t]));
  const accountMap = new Map(); const accountDuplicates = [];
  for (const [index, row] of (Array.isArray(rawAccounts) ? rawAccounts : []).entries()) {
    const c = normalizeAccount(row, `account_${index + 1}`); const key = accountBusinessKey(c);
    if (!accountMap.has(key)) accountMap.set(key, c);
    else {
      const old = accountMap.get(key); accountDuplicates.push({ keptId: old.id, duplicateId: c.id, key });
      old.paid = old.paid || c.paid; old.paidAt = old.paidAt || c.paidAt; old.paidTxId = old.paidTxId || c.paidTxId; old.fromTx = old.fromTx || c.fromTx;
      old.recurTemplateId = old.recurTemplateId || c.recurTemplateId; old.recurOccurrenceId = old.recurOccurrenceId || c.recurOccurrenceId;
    }
  }
  const accounts = [...accountMap.values()];
  const conflicts = []; const brokenLinks = []; const linkedTxIds = new Set();
  for (const c of accounts) {
    let tx = null;
    if (c.paidTxId) tx = txById.get(String(c.paidTxId)) || null;
    if (!tx && c.fromTx) tx = txById.get(String(c.fromTx)) || null;
    if (!tx) tx = transactions.find(t => String(t.contaId || '') === String(c.id)) || null;
    if (!tx) tx = txById.get(`conta_${String(c.id)}`) || null;
    if (!tx) {
      const id = uniqueId(`conta_${String(c.id)}`, usedTxIds);
      tx = normalizeTransaction({ id, date: c.due, desc: `Conta: ${c.name}`, cat: c.cat, val: c.val, type: 'dep', paid: c.paid ? 'Pago' : 'Não pago', contaId: String(c.id), source: 'contas' });
      if (c.paid && c.paidAt) tx.date = c.paidAt;
      transactions.push(tx); txById.set(String(tx.id), tx);
    }
    if (Math.abs(amount(tx.val) - c.val) >= 0.01) conflicts.push({ type: 'amount', accountId: String(c.id), transactionId: String(tx.id), accountValue: c.val, transactionValue: amount(tx.val) });
    const resolvedPaid = c.paid || isPaid(tx.paid);
    c.paid = resolvedPaid;
    c.paidAt = resolvedPaid ? (c.paidAt || isoDate(tx.date, c.due)) : '';
    c.paidTxId = String(tx.id);
    tx.contaId = String(c.id); tx.type = 'dep'; tx.paid = resolvedPaid ? 'Pago' : 'Não pago'; tx.source = tx.source || 'contas';
    if (!conflicts.some(x => x.type === 'amount' && x.accountId === String(c.id) && x.transactionId === String(tx.id))) tx.val = c.val;
    if (tx.source === 'contas' || !tx.desc) tx.desc = tx.desc && !/^Conta:/i.test(tx.desc) ? tx.desc : `Conta: ${c.name}`;
    if (!tx.cat) tx.cat = c.cat;
    tx.date = resolvedPaid ? (c.paidAt || tx.date || c.due) : c.due;
    linkedTxIds.add(String(tx.id));
    if (c.fromTx && !txById.has(String(c.fromTx))) brokenLinks.push({ type: 'fromTx', accountId: String(c.id), targetId: String(c.fromTx) });
  }
  const accountIds = new Set(accounts.map(c => String(c.id)));
  const orphans = transactions.filter(t => t.contaId && !accountIds.has(String(t.contaId))).map(t => ({ transactionId: String(t.id), contaId: String(t.contaId) }));
  return { transactions, accounts, report: { conflicts, brokenLinks, orphans, accountDuplicates, linkedTransactions: linkedTxIds.size } };
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
