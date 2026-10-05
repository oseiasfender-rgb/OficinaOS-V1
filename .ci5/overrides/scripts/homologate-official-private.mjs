import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalFromLegacy,validateLegacyPayload } from '../src/data/legacy-compat.js';
import { auditCanonical } from '../src/data/integrity.js';
const [input,expectedSha256,destination,mode]=process.argv.slice(2);
if(!input||!/^[a-f0-9]{64}$/.test(expectedSha256||'')||!destination){console.error('Uso: node scripts/homologate-official-private.mjs snapshot.json SHA256 /pasta/privada [--preflight-only]');process.exit(2);}
const root=await fs.realpath(fileURLToPath(new URL('../',import.meta.url)));
const inputPath=await fs.realpath(path.resolve(input));
await fs.mkdir(path.resolve(destination),{recursive:true,mode:0o700});
const outputDir=await fs.realpath(path.resolve(destination));
const inside=(p,base)=>{const r=path.relative(base,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
if(inside(inputPath,root)||inside(outputDir,root)){console.error('Snapshot e evidências privadas devem ficar fora do projeto/repositório.');process.exit(2);}
await fs.chmod(outputDir,0o700);
const bytes=await fs.readFile(inputPath),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(sha256!==expectedSha256){console.error('SHA-256 do snapshot não corresponde ao informado.');process.exit(2);}
const raw=JSON.parse(bytes.toString('utf8'));
if(raw.homologationFixture?.synthetic===true){console.error('Fixture sintética não pode ser apresentada como snapshot oficial.');process.exit(2);}
if(!validateLegacyPayload(raw).valid){console.error('Formato do snapshot não reconhecido.');process.exit(2);}
const targets=JSON.parse(await fs.readFile(path.join(root,'tests/acceptance/official-counts.json'),'utf8'));
const counts=auditCanonical(canonicalFromLegacy(raw)).counts;
const officialCountsMatch=Object.entries(targets).every(([k,v])=>counts[k]===v);
await fs.writeFile(path.join(outputDir,'snapshot-preflight.json'),JSON.stringify({sha256,officialCountsMatch,counts,targets},null,2),{mode:0o600});
if(!officialCountsMatch){console.error('Snapshot íntegro, mas não corresponde às contagens oficiais. Gate bloqueado.');process.exit(2);}
if(mode==='--preflight-only'){console.log('Pré-validação aprovada; isso não concede GO.');process.exit(0);}
async function run(script,args,logName,env={}){
 const h=await fs.open(path.join(outputDir,logName),'w',0o600);
 try{return await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script,...args],{cwd:root,env:{...process.env,...env},stdio:['ignore',h.fd,h.fd]});p.on('error',reject);p.on('exit',code=>resolve(code));});}finally{await h.close();}
}
const unitFiles=(await fs.readdir(path.join(root,'tests/unit'))).filter(n=>n.endsWith('.test.js')).map(n=>path.join(root,'tests/unit',n));
const unitPass=await run('--test',unitFiles,'unit.log')===0;
const functionalPass=await run('scripts/homologate-functional.mjs',[path.join(outputDir,'functional.json'),path.join(outputDir,'functional.md')],'functional.log')===0;
const buildPass=await run('node_modules/vite/bin/vite.js',['build'],'build.log')===0;
const officialResult=path.join(outputDir,'official-backup.json'),officialBrowser=path.join(outputDir,'browser-official.json');
await run('scripts/homologate-backup.mjs',[inputPath,officialResult,path.join(outputDir,'official-backup.md')],'official-backup.log');
let server,serverLog;
if(buildPass){
 const port=4273,baseUrl=`http://127.0.0.1:${port}/`;
 try{await fetch(baseUrl);throw new Error('Porta 4273 já está ocupada. Parecer bloqueado.');}catch(e){if(e.message.includes('ocupada'))throw e;}
 serverLog=await fs.open(path.join(outputDir,'vite-preview.log'),'w',0o600);
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore',serverLog.fd,serverLog.fd]});
 try{
  let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)break;try{ready=(await fetch(baseUrl)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}
  if(ready)await run('scripts/homologate-browser.mjs',[inputPath,officialBrowser,path.join(outputDir,'browser-official.md')],'browser-official.log',{OFICINAOS_BASE_URL:baseUrl});
 }finally{server.kill();await serverLog.close();}
}
const code=await run('scripts/finalize-external-homologation.mjs',[],'final.log',{UNIT_PASS:unitPass?'1':'0',BUILD_PASS:buildPass?'1':'0',FUNCTIONAL_PASS:functionalPass?'1':'0',BROWSER_RESULT:officialBrowser,OFFICIAL_RESULT:officialResult,OFFICIAL_BROWSER_RESULT:officialBrowser,ACCEPTANCE_RESULT:path.join(outputDir,'acceptance-metrics.json'),FINAL_OUTPUT_DIR:outputDir});
console.log('Validação concluída. Consulte o parecer na pasta privada; nenhum dado real foi enviado ao GitHub.');process.exitCode=code;
