import { parseBRL } from '../../core/money.js';

export const COMPLEXITY_LEVELS = Object.freeze([
  { key: 'basico', label: 'Básico', multiplier: 1.0 },
  { key: 'medio', label: 'Médio', multiplier: 1.3 },
  { key: 'alto', label: 'Alto', multiplier: 1.6 },
  { key: 'restauracao', label: 'Restauração', multiplier: 2.0 }
]);

function rows(value){ return Array.isArray(value) ? value : []; }
function amount(value){ return Math.max(0, parseBRL(value)); }
function sum(list, fn){ return rows(list).reduce((total, item, index) => total + amount(fn(item, index)), 0); }

export function complexityFrom(value){
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return COMPLEXITY_LEVELS.find(item => item.multiplier === numeric) || COMPLEXITY_LEVELS[0];
  const key = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (key.includes('resta')) return COMPLEXITY_LEVELS[3];
  if (key.includes('alto')) return COMPLEXITY_LEVELS[2];
  if (key.includes('medio')) return COMPLEXITY_LEVELS[1];
  return COMPLEXITY_LEVELS[0];
}

export function calculateBudget(input = {}){
  const laborProcesses = rows(input.laborProcesses);
  const explicitHours = parseBRL(input.hours);
  const processHours = sum(laborProcesses, item => item.hours);
  const hours = explicitHours > 0 ? explicitHours : processHours;
  const rate = amount(input.hourRate ?? input.rate);
  const labor = hours * rate;

  const materials = sum(input.materials, item => amount(item.qty ?? item.quantity) * amount(item.unit ?? item.unitCost ?? item.cost));
  const serviceItems = sum(input.serviceItems, item => amount(item.qty ?? item.quantity ?? 1) * amount(item.value ?? item.unitValue ?? item.valor));
  const serviceItemsDiscount = Math.min(serviceItems, amount(input.serviceItemsDiscount));
  const serviceItemsNet = Math.max(0, serviceItems - serviceItemsDiscount);
  const recoveredParts = sum(input.parts, item => item.value ?? item.valor ?? item.total ?? item.val);
  const thirdParties = sum(input.thirdParties, item => item.value ?? item.valor ?? item.total ?? item.val);
  const freight = amount(input.freight?.displacement) + amount(input.freight?.parts) + amount(input.freight?.tow);

  const complexity = complexityFrom(input.complexity ?? input.complexityMultiplier ?? 1);
  const manualBase = labor + materials + serviceItemsNet + recoveredParts + thirdParties + freight;
  const legacyTotal = amount(input.legacyTotal);
  const usesLegacyTotalFallback = manualBase <= 0 && legacyTotal > 0;
  const base = usesLegacyTotalFallback ? legacyTotal : manualBase * complexity.multiplier;
  const requestedMarginRate = Math.min(Math.max(parseBRL(input.marginPercent ?? input.margin ?? 0) / 100, 0), 0.99);
  const requestedDiscountRate = Math.min(Math.max(parseBRL(input.discountPercent ?? input.discount ?? 0) / 100, 0), 1);
  const marginRate = usesLegacyTotalFallback ? 0 : requestedMarginRate;
  const discountRate = usesLegacyTotalFallback ? 0 : requestedDiscountRate;
  const withMargin = marginRate < 1 ? base / (1 - marginRate) : base;
  const discountAmount = withMargin * discountRate;
  const final = Math.max(0, withMargin - discountAmount);
  const effectiveMarginPercent = final > 0 ? ((final - base) / final) * 100 : 0;

  return Object.freeze({
    hours, rate, labor, materials, serviceItems, serviceItemsDiscount, serviceItemsNet,
    recoveredParts, thirdParties, freight, extras: thirdParties + freight,
    manualBase, legacyTotal, usesLegacyTotalFallback, complexity, base, marginRate, withMargin, discountRate, discountAmount,
    final, effectiveMarginPercent,
    scenarios: Object.freeze({
      margin20: base > 0 ? base / 0.80 : 0,
      margin30: base > 0 ? base / 0.70 : 0,
      margin50: base > 0 ? base / 0.50 : 0
    })
  });
}
