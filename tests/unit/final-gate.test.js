import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../../scripts/finalize-external-homologation.mjs',import.meta.url));
function execute(extraEnv={},prepare=()=>{}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oficinaos-final-gate-'));
 try{const output=path.join(dir,'homologation/external-results');fs.mkdirSync(output,{recursive:true});prepare(dir,output);
 const r=spawnSync(process.execPath,[script],{cwd:dir,env:{...process.env,UNIT_PASS:'1',BUILD_PASS:'1',FUNCTIONAL_PASS:'1',...extraEnv},encoding:'utf8'});
 return {exit:r.status,result:JSON.parse(fs.readFileSync(path.join(output,'FINAL_EXTERNAL_HOMOLOGATION.json')))};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('Variável de ambiente não concede aceite sem definição e cálculo auditável',()=>{
 const r=execute({ACCEPTANCE_METRICS_DEFINED:'1'});assert.equal(r.exit,2);assert.equal(r.result.status,'NO-GO');assert.equal(r.result.gates.acceptanceMetricsDefined,false);assert.equal(r.result.gates.acceptanceMetricsVerified,false);
});
test('Relatório browser PASS incompleto não substitui os gates individuais',()=>{
 const r=execute({},(_,output)=>fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({result:{pass:true},gates:{}})));
 assert.equal(r.result.gates.browserIndexedDb,false);assert.equal(r.result.status,'NO-GO');
});
test('Parecer é produzido mesmo sem resultado de navegador',()=>{
 const r=execute();assert.equal(r.result.gates.browserIndexedDb,false);assert.equal(r.result.technicalPass,false);assert.ok(r.result.reasons.includes('officialSnapshotPresent'));
});
