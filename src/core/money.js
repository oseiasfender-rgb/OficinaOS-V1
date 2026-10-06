export function parseBRL(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!s) return 0;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0) {
    const parts = s.split('.');
    const groupedThousands = parts.length > 2 || (parts.length === 2 && /^\d{1,3}$/.test(parts[0]) && /^\d{3}$/.test(parts[1]));
    if (groupedThousands) s = parts.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
