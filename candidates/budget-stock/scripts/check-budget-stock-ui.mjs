import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Estado esperado não apareceu.');}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197'],{stdio:'ignore'});
for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5197')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,executablePath:process.env.OFICINAOS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{for(const viewport of [{width:1366,height:768},{width:412,height:915}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__stock-ui-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"></head><body></body></html>'}));await page.goto('http://127.0.0.1:5197/__stock-ui-test.html');
 await page.evaluate(async()=>{
 for(const css of ['tokens','layout','reference-fonts','reference-layout'])await import(`/src/styles/${css}.css`);const {createDatabase}=await import('/src/data/indexeddb.js');const {createRepositories}=await import('/src/data/repositories/index.js');
 const {createOrcamentoService}=await import('/src/modules/orcamento/orcamento-service.js');const {createEstoqueService}=await import('/src/modules/estoque/estoque-service.js');
 const {renderOrcamentoView}=await import('/src/modules/orcamento/orcamento-view.js');const {normalizeBudgetDraft}=await import('/src/modules/orcamento/orcamento-model.js');
 const repositories=createRepositories(await createDatabase());window.stockTestRepositories=repositories;
 for(const name of ['budgets','stock','settings','clients','workOrders'])await repositories[name].clear();
 await repositories.stock.put({id:1,nome:'Material teste',qty:10,custo:20,unid:'Un'});
 await repositories.settings.put({id:'fp_pecas_rec',value:[{id:'p',nome:'Peça teste',condicao:'Boa',qtd:5,valor:50,foto:'data:image/png;base64,AAAA'}]});
 const service=createOrcamentoService({repositories});
 const wrapper={...service,createDraft:()=>({...service.createDraft(),clientName:'Teste baixa',service:'Pintura',entryDate:'2026-10-28',laborProcesses:service.createDraft().laborProcesses.map(p=>({...p,hours:p.key==='pintura'?1:p.hours}))})};
 document.body.replaceChildren();const root=document.createElement('main');document.body.append(root);
 renderOrcamentoView(root,{service:wrapper,stockService:createEstoqueService({repositories}),workOrders:{list:()=>repositories.workOrders.list()}});
 });
 await page.getByRole('button',{name:'📦 Escolher do estoque',exact:true}).click();
 await page.getByRole('button',{name:'Adicionar Material teste ao orçamento',exact:true}).click();
 await page.getByRole('dialog',{name:'Escolher material do estoque',exact:true}).getByRole('button',{name:'Fechar',exact:true}).click();
 await page.locator('.parts-catalog summary').click();
 await page.getByRole('button',{name:'Usar no orçamento',exact:true}).click();
 await page.getByRole('button',{name:'Editar peça',exact:true}).click();
 const save=page.getByRole('button',{name:'Salvar',exact:true});
 const balances=()=>page.evaluate(async()=>({material:(await window.stockTestRepositories.stock.get(1)).qty,part:(await window.stockTestRepositories.settings.get('fp_pecas_rec')).value[0].qtd,budgets:(await window.stockTestRepositories.budgets.list()).length}));
 assert.deepEqual(await balances(),{material:10,part:5,budgets:0});
 await save.click();await until(async()=>(await balances()).budgets===1);
 assert.deepEqual(await balances(),{material:9,part:4,budgets:1});
 await page.waitForFunction(()=>document.querySelector('.module-feedback')?.textContent.includes('Orçamento salvo'));
 await page.getByRole('button',{name:'Salvar peça no catálogo',exact:true}).click();
 await page.getByText('O cadastro ou saldo desta peça mudou. Cancele a edição e abra novamente para conferir a quantidade atual.',{exact:true}).waitFor();
 assert.deepEqual(await balances(),{material:9,part:4,budgets:1});
 await page.getByRole('button',{name:'Cancelar edição',exact:true}).click();
 await page.locator('.parts-catalog .list-row').filter({hasText:'Peça teste'}).getByText(/4 disponível/).waitFor();
 await save.click();await page.waitForTimeout(150);assert.deepEqual(await balances(),{material:9,part:4,budgets:1});
 const materials=page.locator('.budget-materials-index');await materials.getByLabel('Qtd.',{exact:true}).fill('2');await save.click();await page.waitForTimeout(100);
 await until(async()=>(await balances()).material===8);
 assert.deepEqual(await balances(),{material:8,part:4,budgets:1});
 await materials.getByLabel('Qtd.',{exact:true}).fill('99');await save.click();await page.getByText('Saldo insuficiente: Material teste.',{exact:true}).waitFor();
 assert.deepEqual(await balances(),{material:8,part:4,budgets:1});
 await materials.getByLabel('Qtd.',{exact:true}).fill('2');await save.click();await page.waitForTimeout(100);
 await page.locator('.budget-history-duplicate').click();
 await until(async()=>(await balances()).budgets===2);
 assert.deepEqual(await balances(),{material:6,part:3,budgets:2});
 const photos=await page.evaluate(async()=>(await window.stockTestRepositories.budgets.list()).map(b=>b.parts[0].foto));assert.deepEqual(photos,['data:image/png;base64,AAAA','data:image/png;base64,AAAA']);
 assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}x${viewport.height}: incluir/salvar/editor-obsoleto/repetir/editar/insuficiente/duplicar/fotos, IndexedDB real no navegador`);await page.close();
 }}finally{await browser.close();server.kill();}
