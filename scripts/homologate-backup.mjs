import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalFromLegacy, validateLegacyPayload } from '../src/data/legacy-compat.js';
import { auditCanonical, compareFinancialSignatures, financialSignatures } from '../src/data/integrity.js';
import { exportLegacyCompatibleBackup } from '../src/data/backup-service.js';
import { STATE_STORES } from '../src/data/schema.js';
import { loadAcceptanceContract } from './acceptance-contract.mjs';
import { projectReference, compareExpected } from './acceptance-auditor.mjs';

const [inputPath, outputJsonPath, outputMdPath] = process.argv.slice(2);
if (!inputPath) {
  console.error('Uso: npm run homologate:backup -- backup.json [evidencia.json] [relatorio.md]');
  process.exit(2);
}

let expected = JSON.parse(await fs.readFile(new URL('../tests/acceptance/official-counts.json', import.meta.url), 'utf8'));
const rawBytes = await fs.readFile(inputPath);
const raw = JSON.parse(rawBytes.toString('utf8'));
const validation = validateLegacyPayload(raw);
const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
let projection,contractSha256;
if(process.env.ACCEPTANCE_CONTRACT){
  const loaded=await loadAcceptanceContract(process.env.ACCEPTANCE_CONTRACT,sha256);
  contractSha256=loaded.contractSha256;
  projection=projectReference(raw);
  expected=Object.fromEntries(STATE_STORES.map(k=>[k,projection.expected[k].length]));
  if(JSON.stringify(stable(expected))!==JSON.stringify(stable(loaded.contract.expectedCounts)))
    throw new Error('Contagens do contrato divergem da projeção independente.');
}

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
  return Object.fromEntries([...STATE_STORES,'settings','meta'].map(name=>[name,digest(sortedById(snapshot[name]||[]))]));
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
  const actual=audit.counts;
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
    acceptance:projection?{contractSha256,import:compareExpected(projection,canonical),reimport:compareExpected(projection,roundCanonical)}:null,
    roundTrip:{exportVersion:exported.version,counts:roundAudit.counts,duplicateCount:roundAudit.duplicateCount,financialComparison,criticalHashes:afterHashes,hashDifferences,countDifferences,equal:financialComparison.equal&&hashDifferences.length===0&&countDifferences.length===0&&roundAudit.duplicateCount===0},
    gates:{...evidence.gates,canonicalNoDuplicateIds:audit.duplicateCount===0,officialCountsMatch:Object.values(officialComparison).every(x=>x.match),financialRoundTrip:financialComparison.equal,criticalRoundTrip:hashDifferences.length===0,countRoundTrip:countDifferences.length===0,roundTripNoDuplicateIds:roundAudit.duplicateCount===0,...(projection?{sourceIdentityLinks:projection.sourceLinksValid,acceptanceImport:compareExpected(projection,canonical).pass,acceptanceReimport:compareExpected(projection,roundCanonical).pass}:{})}
  };
}

evidence.result={
  structuralPass:!!(evidence.gates.sourceRecognized&&evidence.gates.canonicalNoDuplicateIds&&evidence.gates.financialRoundTrip&&evidence.gates.criticalRoundTrip&&evidence.gates.countRoundTrip&&evidence.gates.roundTripNoDuplicateIds&&(!projection||(evidence.gates.acceptanceImport&&evidence.gates.acceptanceReimport))),
  officialDataPass:!!evidence.gates.officialCountsMatch,
  fullAcceptancePass:false,
  fullAcceptanceReason:'Este relatório estrutural não substitui as dez etapas de navegador/IndexedDB, PDF e os demais gates do finalizer.'
};

function mark(v){return v===true?'OK':v===false?'DIF':'PENDENTE';}
const lines=[];
lines.push('# Homologação de Backup OficinaOS','',`Arquivo: \`${evidence.input.basename}\`  `,`SHA-256: \`${evidence.input.sha256}\`  `,`Gerado em: ${evidence.generatedAt}`,'');
lines.push('## Resultado estrutural','',`- Formato reconhecido: **${mark(evidence.gates.sourceRecognized)}**`);
if (validation.valid) {
  lines.push(`- IDs duplicados após normalização: **${evidence.canonical.duplicateCount}**`,`- Round-trip Financeiro/Contas: **${mark(evidence.gates.financialRoundTrip)}**`,`- Round-trip hashes críticos: **${mark(evidence.gates.criticalRoundTrip)}**`,`- Round-trip contagens: **${mark(evidence.gates.countRoundTrip)}**`,'','## Contagens oficiais','');
  for (const [key,row] of Object.entries(evidence.officialComparison)) lines.push(`- ${key}: **${row.actual}** / esperado **${row.target}** — ${mark(row.match)} (${row.difference>=0?'+':''}${row.difference})`);
  lines.push('','## Métricas de aceitação','',...(projection?['- Contrato verificado por SHA-256.',`- Importação: derivedCount=${evidence.acceptance.import.derivedCount}; missingExpectedCount=${evidence.acceptance.import.missingExpectedCount}; pass=${evidence.acceptance.import.pass}.`,`- Reimportação: derivedCount=${evidence.acceptance.reimport.derivedCount}; missingExpectedCount=${evidence.acceptance.reimport.missingExpectedCount}; pass=${evidence.acceptance.reimport.pass}.`]:['- Não calculadas por esta execução; fornecer ACCEPTANCE_CONTRACT para vincular definição, auditor e snapshot.']),'');
}
lines.push('## Parecer','', evidence.result.structuralPass ? 'O backup passou na homologação estrutural e no round-trip do importador/exportador modular.' : 'O backup apresentou falha estrutural, de vínculos ou de round-trip.', evidence.result.officialDataPass ? 'As contagens coincidem com o alvo identificado nesta execução.' : 'As contagens **não** coincidem integralmente com o alvo identificado nesta execução.', '', '**Este relatório não libera produção sozinho.** A homologação integral continua condicionada a todas as etapas do navegador/IndexedDB e aos demais gates do finalizer.','');
const md=lines.join('\n');

if (outputJsonPath) await fs.writeFile(outputJsonPath,JSON.stringify(evidence,null,2)+'\n');
if (outputMdPath) await fs.writeFile(outputMdPath,md+'\n');
console.log(JSON.stringify(evidence,null,2));
if (!evidence.result.structuralPass) process.exitCode=1;
