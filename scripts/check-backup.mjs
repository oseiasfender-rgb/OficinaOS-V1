import fs from 'node:fs/promises';
import { canonicalFromLegacy, validateLegacyPayload } from '../src/data/legacy-compat.js';
import { auditCanonical } from '../src/data/integrity.js';

const path = process.argv[2];
if (!path) {
  console.error('Uso: npm run check:backup -- caminho/backup.json');
  process.exit(2);
}

const expected = JSON.parse(await fs.readFile(new URL('../tests/acceptance/official-counts.json', import.meta.url), 'utf8'));
const raw = JSON.parse(await fs.readFile(path, 'utf8'));
const validation = validateLegacyPayload(raw);
if (!validation.valid) {
  console.error('Backup não reconhecido como payload OficinaOS compatível.');
  process.exit(1);
}
const canonical = canonicalFromLegacy(raw);
const audit = auditCanonical(canonical);
let mismatches = 0;
console.log('Contagens:');
for (const [key, target] of Object.entries(expected)) {
  const actual = audit.counts[key] || 0;
  const ok = actual === target;
  if (!ok) mismatches += 1;
  console.log(`${ok ? 'OK' : 'DIF'} ${key}: ${actual} (esperado ${target})`);
}
console.log(`IDs duplicados após normalização: ${audit.duplicateCount}`);
console.log('derivedCount e missingExpectedCount dependem das regras completas da baseline e ainda não são calculados por este verificador.');
process.exitCode = mismatches || audit.duplicateCount ? 1 : 0;
