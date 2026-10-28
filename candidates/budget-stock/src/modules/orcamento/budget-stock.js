// Planeja diferenças; a gravação deve ocorrer em transação com o orçamento.
export function budgetStockPlan(record, previous, stockRows, catalogRows) {
  const targets = row => {
    const result = {};
    for (const [kind, lines, field] of [['material',row?.materials,'stockId'],['part',row?.parts,'catalogId']]) {
      for (const line of lines || []) {
        if (line[field] == null || line[field] === '') continue;
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty < 0) throw Error('Quantidade de estoque inválida.');
        const key = `${kind}:${line[field]}`;
        result[key] ??= {kind,id:line[field],qty:0};
        result[key].qty += qty;
      }
    }
    return result;
  };
  const next = targets(record);
  // Registros anteriores à função não geram baixa ou devolução retroativa.
  const prior = previous?.stockAllocation ?? {targets:targets(previous),held:{}};
  const held = {...prior.held}, stock = structuredClone(stockRows), catalog = structuredClone(catalogRows);
  const movements = [];
  for (const key of new Set([...Object.keys(prior.targets),...Object.keys(next)])) {
    const target = next[key] || prior.targets[key];
    const delta = Number(((next[key]?.qty || 0) - (prior.targets[key]?.qty || 0)).toFixed(9));
    const change = delta >= 0 ? delta : -Math.min(-delta,held[key] || 0);
    if (!change) continue;
    const rows = target.kind === 'material' ? stock : catalog;
    const row = rows.find(r => String(r.id) === String(target.id));
    if (!row) throw Error('Item vinculado não encontrado no estoque ou catálogo.');
    const field = target.kind === 'material' ? 'qty' : 'qtd';
    const balance = Number(row[field]);
    if (!Number.isFinite(balance) || balance < change) throw Error(`Saldo insuficiente: ${row.nome || row.name || target.id}.`);
    row[field] = Number((balance-change).toFixed(9));
    row.updatedAt = record.updatedAt;
    held[key] = Number(((held[key] || 0)+change).toFixed(9));
    movements.push({kind:target.kind,itemId:row.id,quantity:change,before:balance,after:row[field]});
  }
  return {record:{...record,stockAllocation:{version:1,targets:next,held}},stock,catalog,movements};
}
