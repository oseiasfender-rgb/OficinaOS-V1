import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadAcceptanceContract} from '../../scripts/acceptance-contract.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const snapshotSha256='a'.repeat(64);
async function execute(change,check){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ofix-contract-'));
 try{
  const spec=path.join(dir,'spec.md'),file=path.join(dir,'contract.json');
  await fs.writeFile(spec,'Especificação sintética de teste.');
  const contract={status:'APPROVED',definitionRevision:'test-v2',snapshotSha256,sourceDocumentPath:spec,sourceDocumentSha256:sha(await fs.readFile(spec)),auditorSha256:sha(await fs.readFile(new URL('../../scripts/acceptance-auditor.mjs',import.meta.url))),metrics:{derivedCount:{formula:'sum_f max(a(f)-e(f),0)'},missingExpectedCount:{formula:'sum_f max(e(f)-a(f),0)'}}};
  change(contract);await fs.writeFile(file,JSON.stringify(contract));await check(file,contract);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('Contrato aceita identidades verificadas sem usar conteúdo do importador',async()=>execute(()=>{},async(file,c)=>{const r=await loadAcceptanceContract(file,snapshotSha256);assert.deepEqual(r.contract,c);assert.equal(r.contractSha256,sha(await fs.readFile(file)));}));
test('Contrato recusa snapshot diferente mesmo com status APPROVED',async()=>execute(c=>c.snapshotSha256='b'.repeat(64),file=>assert.rejects(loadAcceptanceContract(file,snapshotSha256),/Contrato\/fonte/)));
test('Contrato recusa especificação e auditor com hashes divergentes',async()=>{
 for(const key of ['sourceDocumentSha256','auditorSha256'])await execute(c=>c[key]='0'.repeat(64),file=>assert.rejects(loadAcceptanceContract(file,snapshotSha256),/Identidade/));
});
test('Contrato recusa aprovação ausente ou fórmula omitida',async()=>{
 await execute(c=>c.status='DRAFT',file=>assert.rejects(loadAcceptanceContract(file,snapshotSha256),/Contrato\/fonte/));
 await execute(c=>delete c.metrics.missingExpectedCount.formula,file=>assert.rejects(loadAcceptanceContract(file,snapshotSha256),/Definição/));
});
