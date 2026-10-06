import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalFromLegacy, validateLegacyPayload } from '../src/data/legacy-compat.js';
import { auditCanonical, compareFinancialSignatures, financialSignatures } from '../src/data/integrity.js';
import { exportLegacyCompatibleBackup } from '../src/data/backup-service.js';
import { STATE_STORES } from '../src/data/schema.js';

const [inputPath, outputJsonPath, outputMdPath] = process.argv.slice(2);
if (!inputPath) {
  console.error('Uso: npm run homologate:backup -- backup.json [evidencia.json] [relatorio.md]');
  process.exit(2);
}

const expected = JSON.parse(await fs.readFile(new URL('../tests/acceptance/official-counts.json', import.meta.url), 'utf8'));
const rawBytes = await fs.readFile(inputPath);
const raw = JSON.parse(rawBytes.toString('utf8'));
const validation = validateLegacyPayload(raw);
const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value ?? null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function sortedById(list=[]) { return [...list].sort((a,b)=>String(a?.id??'').localeCompare(String(b?.id??''))); }
function criticalHashes(snapshot={}) {
  return Object.fromEntries(['transactions','accounts','jobs','clients','goals','budgets'].map(name=>[name,digest(sortedById(snapshot[name]||[]))]));
}
function memoryRepositories(canonical) {
  const repos={};
  for (const name of [...STATE_STORES,'settings','meta']) {
    const rows=structuredClone(canonical[name]||[]);
    repos[name]={ async list(){return structuredClone(rows);} };
  }
  return repos;
}

let evidence={
  generatedAt:new Date().toISOString(),
  input:{path:path.resolve(inputPath),basename:path.basename(inputPath),sha256,sizeBytes:rawBytes.length},
  validation:{valid:validation.valid,recognized:validation.recognized,sourceCounts:validation.counts},
  officialTargets:expected,
  gates:{sourceRecognized:validation.valid}
};

if (validation.valid) {
  const canonical=canonicalFromLegacy(raw);
  const audit=auditCanonical(canonical);
  const signatures=financialSignatures(canonical);
  const actual={transactions:audit.counts.transactions,accounts:audit.counts.accounts,jobs:audit.counts.jobs,clients:audit.counts.clients,goals:audit.counts.goals,budgets:audit.counts.budgets};
  const officialComparison=Object.fromEntries(Object.entries(expected).map(([key,target])=>[key,{actual:actual[key]??0,target,match:(actual[key]??0)===target,difference:(actual[key]??0)-target}]));

  const exported=await exportLegacyCompatibleBackup(memoryRepositories(canonical));
  const roundCanonical=canonicalFromLegacy(exported);
  const roundAudit=auditCanonical(roundCanonical);
  const roundSignatures=financialSignatures(roundCanonical);
  const financialComparison=compareFinancialSignatures(signatures,roundSignatures);
  const beforeHashes=criticalHashes(canonical),afterHashes=criticalHashes(roundCanonical);
  const hashDifferences=Object.keys(beforeHashes).filter(key=>beforeHashes[key]!==afterHashes[key]);
  const countDifferences=Object.keys(actual).filter(key=>(roundAudit.counts[key]??0)!==(audit.counts[key]??0));

  evidence={...evidence,
    canonical:{counts:audit.counts,duplicateCount:audit.duplicateCount,duplicates:audit.duplicates,financialSignatures:signatures,criticalHashes:beforeHashes},
    officialComparison,
    undefinedAcceptanceMetrics:{derivedCount:null,missingExpectedCount:null,reason:'A especificação disponível exige ambos = 0, mas não define formalmente como calculá-los. O homologador não inventa uma regra.'},
    roundTrip:{exportVersion:exported.version,counts:roundAudit.counts,duplicateCount:roundAudit.duplicateCount,financialComparison,criticalHashes:afterHashes,hashDifferences,countDifferences,equal:financialComparison.equal&&hashDifferences.length===0&&countDifferences.length===0&&roundAudit.duplicateCount===0},
    gates:{...evidence.gates,canonicalNoDuplicateIds:audit.duplicateCount===0,officialCountsMatch:Object.values(officialComparison).every(x=>x.match),financialRoundTrip:financialComparison.equal,criticalRoundTrip:hashDifferences.length===0,countRoundTrip:countDifferences.length===0,roundTripNoDuplicateIds:roundAudit.duplicateCount===0}
  };
}

evidence.result={
  structuralPass:!!(evidence.gates.sourceRecognized&&evidence.gates.canonicalNoDuplicateIds&&evidence.gates.financialRoundTrip&&evidence.gates.criticalRoundTrip&&evidence.gates.countRoundTrip&&evidence.gates.roundTripNoDuplicateIds),
  officialDataPass:!!evidence.gates.officialCountsMatch,
  fullAcceptancePass:false,
  fullAcceptanceReason:'Homologação integral ainda exige derivedCount/missingExpectedCount definidos, navegador real/IndexedDB, PDF/impressão e build Vite.'
};

function mark(v){return v===true?'OK':v===false?'DIF':'PENDENTE';}
const lines=[];
lines.push('# Homologação de Backup OficinaOS','',`Arquivo: \`${evidence.input.basename}\`  `,`SHA-256: \`${evidence.input.sha256}\`  `,`Gerado em: ${evidence.generatedAt}`,'');
lines.push('## Resultado estrutural','',`- Formato reconhecido: **${mark(evidence.gates.sourceRecognized)}**`);
if (validation.valid) {
  lines.push(`- IDs duplicados após normalização: **${evidence.canonical.duplicateCount}**`,`- Round-trip Financeiro/Contas: **${mark(evidence.gates.financialRoundTrip)}**`,`- Round-trip hashes críticos: **${mark(evidence.gates.criticalRoundTrip)}**`,`- Round-trip contagens: **${mark(evidence.gates.countRoundTrip)}**`,'','## Contagens oficiais','');
  for (const [key,row] of Object.entries(evidence.officialComparison)) lines.push(`- ${key}: **${row.actual}** / esperado **${row.target}** — ${mark(row.match)} (${row.difference>=0?'+':''}${row.difference})`);
  lines.push('','## Métricas ainda sem definição formal','', '- `derivedCount`: **não calculado**.', '- `missingExpectedCount`: **não calculado**.', '- Motivo: a fonte de critérios exige ambos iguais a zero, mas não fornece definição algorítmica. O homologador não cria uma definição própria.','');
}
lines.push('## Parecer','', evidence.result.structuralPass ? 'O backup passou na homologação estrutural e no round-trip do importador/exportador modular.' : 'O backup apresentou falha estrutural ou de round-trip.', evidence.result.officialDataPass ? 'As contagens coincidem com o alvo oficial.' : 'As contagens **não** coincidem integralmente com o alvo oficial.', '', '**Este relatório não libera produção sozinho.** A homologação integral continua condicionada aos gates de navegador/IndexedDB, PDF, build Vite e às métricas oficiais ainda não definidas.','');
const md=lines.join('\n');

if (outputJsonPath) await fs.writeFile(outputJsonPath,JSON.stringify(evidence,null,2)+'\n');
if (outputMdPath) await fs.writeFile(outputMdPath,md+'\n');
console.log(JSON.stringify(evidence,null,2));
if (!evidence.result.structuralPass) process.exitCode=1;
