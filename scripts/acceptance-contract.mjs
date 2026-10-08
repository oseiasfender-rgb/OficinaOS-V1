import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

// Private snapshot contracts are supplied by absolute path, outside the repository.
// Historical contracts remain available; new snapshots need their own identity.
export async function loadAcceptanceContract(contractPath,snapshotSha256){
  const bytes=await fs.readFile(contractPath);
  const contract=JSON.parse(bytes);
  if(contract.status!=='APPROVED'||contract.snapshotSha256!==snapshotSha256)
    throw new Error('Contrato/fonte não autorizado para cálculo.');
  if(!contract.definitionRevision||!contract.sourceDocumentPath||
      !['derivedCount','missingExpectedCount'].every(k=>typeof contract.metrics?.[k]?.formula==='string'&&contract.metrics[k].formula.trim()))
    throw new Error('Definição de métricas incompleta.');
  const specification=await fs.readFile(path.resolve(contract.sourceDocumentPath));
  const auditor=await fs.readFile(new URL('./acceptance-auditor.mjs',import.meta.url));
  if(sha256(specification)!==contract.sourceDocumentSha256||sha256(auditor)!==contract.auditorSha256)
    throw new Error('Identidade da especificação/auditor diverge.');
  return {contract,contractSha256:sha256(bytes)};
}
