import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// Somente build local, perfis descartáveis e dados fictícios. Nenhuma conta/nuvem real.
const prefix='/homologacao/estoque-r1/',root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ttf':'font/ttf','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!path.startsWith(prefix)){res.writeHead(404).end();return;}
  const relative=decodeURIComponent(path.slice(prefix.length))||'index.html',file=resolve(root,relative);
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.OFICINAOS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={candidate:'estoque-20261028-r1-fix7',at:new Date().toISOString(),scope:prefix,physicalDevices:false,checks:[]};
async function ready(page){await page.waitForFunction(()=>Boolean(window.OficinaOSLegacy));}
async function state(page){return page.evaluate(async()=>{
 const r=window.OficinaOSLegacy.repositories;
 return {budgets:await r.budgets.list(),stock:await r.stock.list(),catalog:await r.settings.get('fp_pecas_rec'),ledger:(await r.settings.list()).filter(x=>String(x.id).startsWith('budget_stock:')),deletionBackups:await r.deletionBackups.list()};
});}
try{
 for(const viewport of [{width:1366,height:768},{width:412,height:915}]){
  const source=await browser.newContext({viewport}),target=await browser.newContext({viewport});
  try{
   const page=await source.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await ready(page);
   await page.evaluate(async()=>{
    const {repositories:r,services:s}=window.OficinaOSLegacy;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=4;canvas.getContext('2d').fillRect(0,0,4,4);const foto=canvas.toDataURL('image/png');
    const material=await s.estoque.create({id:7001,nome:'Material fictício backup',qty:10,custo:20,unid:'Un',foto});
    const piece=await s.orcamento.partsCatalog.put({id:'backup-piece',nome:'Peça fictícia backup',qtd:5,valor:50,condicao:'Boa',foto});
    const draft=s.orcamento.createDraft();
    const saved=await s.orcamento.save({...draft,clientName:'Cliente fictício backup',service:'Pintura de teste',entryDate:'2026-11-03',laborProcesses:draft.laborProcesses.map(p=>({...p,hours:p.key==='pintura'?1:p.hours})),materials:[{id:'m',stockId:material.id,name:material.nome,qty:2,unit:20,unid:'Un'}],parts:[{id:'p',catalogId:piece.id,name:piece.nome,qty:1,value:50,priceBasis:'unit',foto}]});
    await s.orcamento.addStagePhoto(saved.record?.id??saved.id,'entrada',foto);
    await r.deletionBackups.put({id:'discarded-backup-fixture',entityType:'partsCatalog',discardedAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z'});
   });
   const before=await state(page);assert.equal(before.stock[0].qty,8);assert.equal(before.catalog.value[0].qtd,4);
   assert.equal(before.budgets[0].stagePhotos.length,1);assert.equal(before.budgets[0].stockAllocation.held['material:7001'],2);
   const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar backup compatível',exact:true}).click();
   const download=await downloadPromise,backup=await readFile(await download.path());
   const parsed=JSON.parse(backup);assert.equal(parsed.modular.stores.stock[0].foto,before.stock[0].foto);
   const restored=await target.newPage();restored.on('pageerror',e=>errors.push(e.message));await restored.goto(base);await ready(restored);
   assert.equal((await state(restored)).budgets.length,0,'Destino começa sem dados');
   await restored.evaluate(()=>{window.backupImports=0;window.OficinaOSLegacy.on('migration:completed',()=>window.backupImports++);});
   const choose=restored.waitForEvent('filechooser');await restored.getByRole('button',{name:'Importar backup JSON',exact:true}).click();
   restored.once('dialog',dialog=>dialog.accept());await (await choose).setFiles({name:'backup-ficticio.json',mimeType:'application/json',buffer:backup});
   await restored.waitForFunction(()=>window.backupImports===1);await restored.getByText(/Backup importado\. Auditoria:/).waitFor();
   assert.deepEqual(await state(restored),before,'Restauração preserva registros, fotos, alocação e ledger');
   // Repetir importação não multiplica saldos, registros ou fotos.
   const chooseAgain=restored.waitForEvent('filechooser');await restored.getByRole('button',{name:'Importar backup JSON',exact:true}).click();
   restored.once('dialog',dialog=>dialog.accept());await (await chooseAgain).setFiles({name:'backup-ficticio.json',mimeType:'application/json',buffer:backup});
   await restored.getByText(/Backup importado\. Auditoria:/).waitFor();
   await restored.waitForFunction(()=>window.backupImports===2);
   // Reabrir confirma persistência após a segunda importação.
   await restored.reload();await ready(restored);assert.deepEqual(await state(restored),before);
   const manifest=await restored.evaluate(async()=>{const link=document.querySelector('link[rel=manifest]');return (await fetch(link.href)).json();});
   assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');
   await restored.evaluate(async()=>{await navigator.serviceWorker.ready;});
   await restored.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
   const scope=await restored.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,base);
   await restored.evaluate(async()=>{
    const other=await caches.open('oficinaos:/outra-rota/:sentinela');await other.put('/outra-rota/sentinela',new Response('preservar'));
    const old=await caches.open(`oficinaos:${location.pathname}:old-test`);await old.put(location.href,new Response('obsoleto'));
   });
   await restored.reload();await ready(restored);
   const keys=await restored.evaluate(()=>caches.keys());assert.ok(keys.includes('oficinaos:/outra-rota/:sentinela'));assert.ok(!keys.includes(`oficinaos:${prefix}:old-test`));
   await target.setOffline(true);await restored.reload({waitUntil:'domcontentloaded'});await ready(restored);assert.deepEqual(await state(restored),before,'Reabertura offline preserva dados');
   const navigation=restored.getByRole('navigation',{name:'Módulos da oficina'});await navigation.getByRole('button',{name:'Orçamento',exact:true}).click();
   await restored.locator('.budget-history-open').first().click();await restored.getByRole('button',{name:'Salvar',exact:true}).click();
   await restored.getByText('Orçamento salvo no histórico modular. Nenhuma nova baixa de estoque.',{exact:true}).waitFor();
   let after=await state(restored);assert.equal(after.stock[0].qty,8);assert.equal(after.catalog.value[0].qtd,4);
   await restored.locator('.budget-materials-index').getByLabel('Qtd.',{exact:true}).fill('3');await restored.getByRole('button',{name:'Salvar',exact:true}).click();
   await restored.getByText(/Orçamento salvo no histórico modular\. Estoque/).waitFor();
   after=await state(restored);assert.equal(after.stock[0].qty,7);assert.equal(after.catalog.value[0].qtd,4);assert.equal(after.budgets[0].stagePhotos[0].dataUrl,before.budgets[0].stagePhotos[0].dataUrl);
   await restored.close();const reopened=await target.newPage();reopened.on('pageerror',e=>errors.push(e.message));await reopened.goto(base,{waitUntil:'domcontentloaded'});await ready(reopened);
   const reopenedState=await state(reopened);assert.equal(reopenedState.stock[0].qty,7);assert.equal(reopenedState.stock[0].foto,before.stock[0].foto);assert.equal(reopenedState.catalog.value[0].foto,before.catalog.value[0].foto);
   assert.deepEqual(errors,[]);
   report.checks.push({viewport,result:'PASS',backup:'exportar/importar/repetir com igualdade de registros e fotos',offline:'recarregar/salvar sem nova baixa/editar 8→7/fechar e reabrir',scope:'cache da outra rota preservado'});
   console.log(`PASS ${viewport.width}x${viewport.height}: backup com fotos, IDs, saldo, alocação e ledger; importação repetida; SW no escopo; cache vizinho; orçamento offline sem baixa repetida, edição e nova aba`);
  }finally{await source.close();await target.close();}
 }
 report.result='PASS';
}catch(error){report.result='FAIL';report.error=String(error.stack||error);throw error;}
finally{await mkdir('homologation/budget-backup-offline',{recursive:true});await writeFile('homologation/budget-backup-offline/result.json',JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
