import { STATE_STORES } from './schema.js';

export function summarizeCanonical(snapshot = {}) {
  const counts = {};
  for (const store of STATE_STORES) counts[store] = Array.isArray(snapshot[store]) ? snapshot[store].length : 0;
  return counts;
}

export function duplicateIds(list = []) {
  const seen = new Set();
  const duplicates = [];
  for (const item of list) {
    const id = String(item?.id ?? '');
    if (!id) continue;
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  return [...new Set(duplicates)];
}

export function auditCanonical(snapshot = {}) {
  const duplicateMap = {};
  let duplicateCount = 0;
  for (const store of STATE_STORES) {
    const duplicates = duplicateIds(snapshot[store] || []);
    if (duplicates.length) duplicateMap[store] = duplicates;
    duplicateCount += duplicates.length;
  }
  return {
    counts: summarizeCanonical(snapshot),
    duplicateCount,
    duplicates: duplicateMap,
    valid: duplicateCount === 0
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }
  return value ?? null;
}

function fnv1a64(value) {
  const text = JSON.stringify(stableValue(value));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function financialTransactionView(row = {}) {
  return {
    id: row.id ?? null, legacyId: row.legacyId ?? null, date: row.date ?? row.data ?? null,
    desc: row.desc ?? row.descricao ?? null, cat: row.cat ?? row.categoria ?? null,
    val: Number(row.val ?? row.valor ?? 0), type: row.type ?? row.tipo ?? null,
    paid: row.paid ?? row.status ?? null, contaId: row.contaId ?? null,
    source: row.source ?? row.origem ?? null, transferId: row.transferId ?? null,
    fromAccount: row.fromAccount ?? null, toAccount: row.toAccount ?? null,
    workOrderId: row.workOrderId ?? row.osId ?? row.jobId ?? null, dasId: row.dasId ?? null
  };
}

function financialAccountView(row = {}) {
  return {
    id: row.id ?? null, name: row.name ?? row.desc ?? row.descricao ?? null,
    cat: row.cat ?? row.category ?? row.categoria ?? null, val: Number(row.val ?? row.valor ?? 0),
    due: row.due ?? row.vencimento ?? null, paid: !!(row.paid || row.pago || row.status === 'Pago'),
    paidAt: row.paidAt ?? row.dataPagamento ?? null, recur: !!(row.recur || row.recorrente),
    recurKey: row.recurKey ?? null, competencia: row.competencia ?? null,
    paidTxId: row.paidTxId ?? null, fromTx: row.fromTx ?? null
  };
}

export function financialSignatures(snapshot = {}) {
  const transactions = (snapshot.transactions || []).map(financialTransactionView).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const accounts = (snapshot.accounts || []).map(financialAccountView).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const links = accounts.map(account => ({ id: account.id, paidTxId: account.paidTxId, fromTx: account.fromTx,
    transactionIds: transactions.filter(tx => String(tx.contaId ?? '') === String(account.id ?? '')).map(tx => tx.id).sort() }));
  return {
    transactions: fnv1a64(transactions), accounts: fnv1a64(accounts), links: fnv1a64(links),
    transactionCount: transactions.length, accountCount: accounts.length
  };
}

export function compareFinancialSignatures(before = {}, after = {}) {
  const fields = ['transactions','accounts','links','transactionCount','accountCount'];
  const differences = fields.filter(key => before[key] !== after[key]);
  return { equal: differences.length === 0, differences, before: structuredClone(before), after: structuredClone(after) };
}
