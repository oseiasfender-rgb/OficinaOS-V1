import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { canonicalFromLegacy, validateLegacyPayload } from '../src/data/legacy-compat.js';
import { auditCanonical, financialSignatures, compareFinancialSignatures } from '../src/data/integrity.js';
import {projectReference,compareExpected,fingerprint,AUDIT_STORES} from './acceptance-auditor.mjs';
import { STATE_STORES } from '../src/data/schema.js';
import { loadAcceptanceContract } from './acceptance-contract.mjs';

const [snapshotPath='homologation/fixtures/external-smoke-backup.json', outputJson='homologation/external-results/browser.json', outputMd='homologation/external-results/browser.md'] = process.argv.slice(2);
const baseUrl=process.env.OFICINAOS_BASE_URL || 'http://127.0.0.1:4173/';
const rawBytes=await fs.readFile(snapshotPath);const raw=JSON.parse(rawBytes.toString('utf8'));
const validation=validateLegacyPayload(raw);if(!validation.valid)throw new Error('Snapshot não reconhecido pelo importador OficinaOS.');
const expected=canonicalFromLegacy(raw);const expectedAudit=auditCanonical(expected);const expectedFinancial=financialSignatures(expected);
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o;}return v??null;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function sorted(list=[]){return [...list].sort((a,b)=>String(a?.id??'').localeCompare(String(b?.id??'')));}
function hashes(s){return Object.fromEntries(STATE_STORES.map(k=>[k,digest(sorted(s[k]||[]))]));}
const expectedHashes=hashes(expected);
const evidence={generatedAt:new Date().toISOString(),baseUrl,snapshot:{path:path.resolve(snapshotPath),sha256:crypto.createHash('sha256').update(rawBytes).digest('hex'),synthetic:!!raw.homologationFixture?.synthetic},gates:{},consoleErrors:[],pageErrors:[],result:{pass:true}};
const gate=(name,pass,detail)=>{evidence.gates[name]={pass:!!pass,detail};if(!pass)evidence.result.pass=false;};

const metricsEnabled=process.env.ACCEPTANCE_METRICS==='1';
const metricStages={};let projection,metricContract,metricContractSha;
if(metricsEnabled){
 const loaded=await loadAcceptanceContract(process.env.ACCEPTANCE_CONTRACT||'homologation/acceptance-metrics-contract.json',evidence.snapshot.sha256);
 metricContract=loaded.contract;metricContractSha=loaded.contractSha256;
 if(evidence.snapshot.synthetic)throw new Error('Fixture sintética não autoriza métricas de snapshot real.');
 projection=projectReference(raw);
}
let importedMetadataHash;
function auditStage(name,actual){
 if(metricsEnabled){
  if(name==='import')importedMetadataHash=digest(sorted(actual.meta||[]));
  const result=compareExpected(projection,actual);
  result.metadataPreserved=importedMetadataHash===digest(sorted(actual.meta||[]));
  result.pass=result.pass&&result.metadataPreserved;
  metricStages[name]=result;
 }
}
const launchOptions={headless:true};
if(process.env.OFICINAOS_CHROMIUM_EXECUTABLE)launchOptions.executablePath=process.env.OFICINAOS_CHROMIUM_EXECUTABLE;
if(process.env.OFICINAOS_CHROMIUM_ARGS){
 const args=JSON.parse(process.env.OFICINAOS_CHROMIUM_ARGS);
 if(!Array.isArray(args)||!args.every(v=>typeof v==='string'))throw new Error('Argumentos Chromium inválidos.');
 launchOptions.args=args;
}
const browser=await chromium.launch(launchOptions);
evidence.browser={engine:'chromium',version:browser.version(),customExecutable:!!launchOptions.executablePath};
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();
page.on('console',msg=>{if(msg.type()==='error')evidence.consoleErrors.push(msg.text());});
page.on('pageerror',err=>evidence.pageErrors.push(err.message));
page.on('dialog',dialog=>dialog.accept());
await page.addInitScript(()=>{window.__OFIX_PRINT_CALLS__=0;window.print=()=>{window.__OFIX_PRINT_CALLS__+=1;};window.open=(...args)=>{window.__OFIX_WINDOW_OPEN__=args;return null;};});

async function dbSnapshot(){
  return await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('oficinaos_modular');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const names=[...db.objectStoreNames];const out={};
    await Promise.all(names.map(name=>new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly');const req=tx.objectStore(name).getAll();req.onsuccess=()=>{out[name]=req.result;resolve();};req.onerror=()=>reject(req.error);})));db.close();return out;
  });
}
async function clearDb(){await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('oficinaos_modular');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>resolve();});});}
function browserHashes(s){return hashes(s);}

try{
  await page.goto(baseUrl,{waitUntil:'networkidle',timeout:60000});
  await page.getByText('OficinaOS',{exact:true}).waitFor({state:'visible'});
  gate('pageLoads',true,'shell OficinaOS carregado');
  const dupIds=await page.evaluate(()=>{const seen=new Set(),dups=[];for(const n of document.querySelectorAll('[id]')){if(seen.has(n.id))dups.push(n.id);seen.add(n.id);}return [...new Set(dups)];});
  gate('noDuplicateHtmlIds',dupIds.length===0,dupIds.length?dupIds.join(', '):'0 IDs duplicados');

  await clearDb();await page.reload({waitUntil:'networkidle'});
  const cleanCounts=auditCanonical(await dbSnapshot()).counts;
  const cleanNames=['transactions','accounts','clients','jobs','workOrders','appointments','checklists','budgets','goals','stock'];
  gate('cleanBootNoOperationalData',cleanNames.every(k=>cleanCounts[k]===0),'Inicialização sem dados operacionais fictícios');
  const chooserPromise=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar backup JSON'}).click();
  const chooser=await chooserPromise;await chooser.setFiles(snapshotPath);
  await page.locator('.status-line').filter({hasText:'Backup importado'}).waitFor({timeout:60000});
  const afterImport=await dbSnapshot();auditStage('import',afterImport);
  const importAudit=auditCanonical(afterImport);const importHashes=browserHashes(afterImport);const importFinancial=financialSignatures(afterImport);
  const criticalDiff=Object.keys(expectedHashes).filter(k=>expectedHashes[k]!==importHashes[k]);
  const finCmp=compareFinancialSignatures(expectedFinancial,importFinancial);
  gate('indexedDbImportCounts',Object.entries(expectedAudit.counts).every(([k,v])=>(importAudit.counts[k]??0)===v),'contagens IndexedDB após importação comparadas ao snapshot');
  gate('indexedDbImportCriticalHashes',criticalDiff.length===0,criticalDiff.length?`diferenças: ${criticalDiff.join(', ')}`:'hashes críticos idênticos');
  gate('indexedDbFinancialSignatures',finCmp.equal,finCmp.equal?'assinaturas Financeiro/Contas idênticas':finCmp.differences.join(', '));

  await page.reload({waitUntil:'networkidle'});const afterReload=await dbSnapshot();auditStage('reload',afterReload);const reloadHashes=browserHashes(afterReload);const reloadDiff=Object.keys(importHashes).filter(k=>importHashes[k]!==reloadHashes[k]);
  gate('indexedDbReloadPersistence',reloadDiff.length===0,reloadDiff.length?`stores divergentes: ${reloadDiff.join(', ')}`:'persistência exata após reload');

  const navLabels=['Orçamento','Financeiro','Contas','Clientes','Categorias','Estoque','Metas','Configurações','Agenda','OS','Históricos','Relatórios','Consultor IA'];
  for(const label of navLabels){
    const mainNav=page.getByRole('navigation',{name:'Módulos da oficina'});
    if(label==='Contas')await mainNav.getByRole('button',{name:'Financeiro',exact:true}).click();
    if(label==='Metas'||label==='Relatórios')await mainNav.getByRole('button',{name:'Resultados',exact:true}).click();
    const internal=['Contas','Metas','Relatórios'].includes(label);
    const target=internal?page.getByRole('navigation',{name:label==='Contas'?'Seções de Financeiro':'Seções de Resultados'}):mainNav;
    await target.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('heading',{name:label==='OS'?'Ordens de Serviço':label==='Contas'?'Contas a pagar':label==='Históricos'?'Históricos, Arquivados e Lixeira':label,exact:true,level:1}).waitFor();
    await fs.mkdir(path.resolve(path.dirname(outputJson),'screenshots'),{recursive:true});await page.screenshot({path:path.resolve(path.dirname(outputJson),'screenshots',`${navLabels.indexOf(label)+1}.png`),fullPage:true});
  }
  auditStage('navigation',await dbSnapshot());
  gate('moduleNavigation',true,`${navLabels.length} módulos navegados`);

  await page.getByRole('button',{name:'Orçamento',exact:true}).click();
  const beforePdf=await dbSnapshot();auditStage('beforePdf',beforePdf);const beforePdfHashes=hashes(beforePdf);
  const firstBudget=page.locator('.budget-history-open').first();
  if(await firstBudget.count()){await firstBudget.click();}else{await page.getByRole('button',{name:'Novo',exact:true}).click();}
  {await page.getByRole('button',{name:'PDF comercial',exact:true}).click();await page.locator('.commercial-print-sheet').waitFor({state:'visible'});const quoteText=(await page.locator('.commercial-print-sheet').innerText()).toLowerCase();const forbidden=['segredo interno','r$ / hora','margem','custo interno','observações internas'];const leaked=forbidden.filter(k=>quoteText.includes(k));const pdfBytes=await page.pdf({path:path.resolve(path.dirname(outputJson),'commercial-quote.pdf'),format:'A4',printBackground:true});gate('chromiumPdfFile',pdfBytes.subarray(0,5).toString()==='%PDF-','PDF real gerado pelo Chromium');const printCalls=await page.evaluate(()=>window.__OFIX_PRINT_CALLS__||0);gate('commercialPdfBrowserPrivacy',leaked.length===0&&printCalls===1,leaked.length?`vazamentos: ${leaked.join(', ')}`:`print chamado ${printCalls}x e sem campos internos`);}

  const afterPdf=await dbSnapshot();auditStage('pdf',afterPdf);const afterPdfHashes=hashes(afterPdf);
  const pdfDiff=Object.keys(beforePdfHashes).filter(k=>beforePdfHashes[k]!==afterPdfHashes[k]);
  gate('pdfDoesNotPersist',pdfDiff.length===0,pdfDiff.length?`stores alterados: ${pdfDiff.join(', ')}`:'PDF preserva todos os stores, incluindo IDs, tipos e timestamps');
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  {
    const notes=page.getByLabel('Observações para o cliente',{exact:true});
    await notes.fill('ALTERAÇÃO NÃO SALVA PARA TESTE DO PDF');
    await page.getByRole('button',{name:'PDF comercial',exact:true}).click();
    await page.locator('.commercial-print-sheet').waitFor({state:'visible'});
    const previewText=await page.locator('.commercial-print-sheet').innerText();
    gate('pdfDraftPreview',previewText.includes('ALTERAÇÃO NÃO SALVA PARA TESTE DO PDF'),'PDF reflete o rascunho atual');
    const editedPdf=await dbSnapshot();auditStage('pdfUnsavedEdit',editedPdf);const editedPdfHashes=hashes(editedPdf);
    gate('pdfUnsavedEditsNotPersisted',Object.keys(beforePdfHashes).every(k=>beforePdfHashes[k]===editedPdfHashes[k]),'PDF de rascunho não grava alterações em nenhum store');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  }
  await page.getByRole('button',{name:'Novo',exact:true}).click();
  await page.getByRole('button',{name:'PDF comercial',exact:true}).click();
  await page.locator('.commercial-print-sheet').waitFor({state:'visible'});
  const newDraftPdf=await dbSnapshot();auditStage('pdfNewDraft',newDraftPdf);const newDraftPdfHashes=hashes(newDraftPdf);
  gate('newDraftPdfDoesNotPersist',Object.keys(beforePdfHashes).every(k=>beforePdfHashes[k]===newDraftPdfHashes[k]),'PDF de orçamento novo não cria registros');
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  const beforeExport=await dbSnapshot();const exportBaseline=hashes(beforeExport);
  evidence.hashes={afterImport:importHashes,beforePdf:beforePdfHashes,afterPdf:afterPdfHashes,beforeExport:exportBaseline};
  await page.getByRole('button',{name:'Migração',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar backup compatível'}).click();const download=await downloadPromise;const exportPath=path.resolve(path.dirname(outputJson),'exported-browser-backup.json');await fs.mkdir(path.dirname(exportPath),{recursive:true});await download.saveAs(exportPath);const exported=JSON.parse(await fs.readFile(exportPath,'utf8'));const round=canonicalFromLegacy(exported);const roundHashes=hashes(round);const roundDiff=Object.keys(exportBaseline).filter(k=>exportBaseline[k]!==roundHashes[k]);gate('browserExportRoundTrip',roundDiff.length===0,roundDiff.length?`stores divergentes: ${roundDiff.join(', ')}`:'exportação UI preserva hashes críticos');evidence.artifacts={exportedBackup:exportPath};

  auditStage('export',exported.modular?.stores??{});
  evidence.hashes.exported=roundHashes;
  await clearDb();await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Migração',exact:true}).click();
  const reimportChooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Importar backup JSON'}).click();
  await (await reimportChooser).setFiles(exportPath);
  await page.locator('.status-line').filter({hasText:'Backup importado'}).waitFor({timeout:60000});
  auditStage('reimport',await dbSnapshot());
  await page.reload({waitUntil:'networkidle'});
  const restoredState=await dbSnapshot();auditStage('reimportReload',restoredState);const restored=hashes(restoredState);evidence.hashes.afterReimportReload=restored;
  const reimportDiff=Object.keys(exportBaseline).filter(k=>exportBaseline[k]!==restored[k]);
  gate('uiReimportReload',reimportDiff.length===0,reimportDiff.length?`stores divergentes: ${reimportDiff.join(', ')}`:'reimportação em banco limpo e reload preservam todos os stores');
  gate('noPageErrors',evidence.pageErrors.length===0,evidence.pageErrors.length?evidence.pageErrors.join(' | '):'0 page errors');
  gate('noConsoleErrors',evidence.consoleErrors.length===0,evidence.consoleErrors.length?evidence.consoleErrors.join(' | '):'0 console errors');
}catch(error){evidence.result.pass=false;evidence.result.error={name:error.name,message:error.message,stack:error.stack};}
finally{await browser.close();}

if(metricsEnabled){
 const requiredStages=['import','reload','navigation','beforePdf','pdf','pdfUnsavedEdit','pdfNewDraft','export','reimport','reimportReload'];
 const all=requiredStages.every(k=>metricStages[k]);const results=Object.values(metricStages);
 const report={definitionRevision:metricContract.definitionRevision,contractSha256:metricContractSha,snapshotSha256:evidence.snapshot.sha256,auditorSha256:metricContract.auditorSha256,browserEvidenceSha256:fingerprint(evidence),requiredStages,stages:metricStages,derivedCount:all?Math.max(...results.map(r=>r.derivedCount)):null,missingExpectedCount:all?Math.max(...results.map(r=>r.missingExpectedCount)):null,fieldCoveragePass:all&&results.every(r=>r.fieldCoveragePass),sourceLinksValid:projection.sourceLinksValid,sourceDuplicateOccurrences:projection.sourceDuplicateOccurrences,authorizedTechnicalDerivedCount:projection.authorizedTechnicalDerivedCount,result:{pass:all&&results.every(r=>r.pass)&&evidence.result.pass},identityManifest:projection.identityManifest,linkManifest:projection.linkManifest};
 await fs.mkdir(path.dirname(outputJson),{recursive:true});await fs.writeFile(path.join(path.dirname(outputJson),'acceptance-metrics.json'),JSON.stringify(report,null,2));
}
const lines=['# Homologação Externa — Browser/IndexedDB','',`Gerado em: ${evidence.generatedAt}`,`Snapshot: \`${evidence.snapshot.path}\``,`Sintético CLEAN: **${evidence.snapshot.synthetic?'SIM':'NÃO'}**`,'',`Resultado: **${evidence.result.pass?'PASS':'FAIL'}**`,'','## Gates',''];for(const [n,g] of Object.entries(evidence.gates))lines.push(`- ${n}: **${g.pass?'OK':'FALHOU'}** — ${g.detail}`);if(evidence.result.error)lines.push('','## Erro','',`[0m${evidence.result.error.name}: ${evidence.result.error.message}`);lines.push('','## Limite','','Um PASS com fixture sintética prova build/browser/IndexedDB/UI/reload/PDF/exportação no ambiente externo, mas não substitui o gate de contagens do snapshot oficial.');
await fs.mkdir(path.dirname(outputJson),{recursive:true});await fs.writeFile(outputJson,JSON.stringify(evidence,null,2)+'\n');await fs.writeFile(outputMd,lines.join('\n')+'\n');console.log(JSON.stringify(evidence,null,2));if(!evidence.result.pass)process.exitCode=1;
