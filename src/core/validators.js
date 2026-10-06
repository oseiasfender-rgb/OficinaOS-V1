export function assertObject(value, label = 'dados') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} inválidos.`);
  return value;
}
export function safeText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max).trim();
}
