import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Estado esperado não apareceu.');}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5196'],{stdio:'ignore'});
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5196')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,executablePath:process.env.OFICINAOS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const viewport of [{width:1366,height:768},{width:412,height:915}]){
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:5196/');await page.waitForFunction(()=>Boolean(window.OficinaOSLegacy));
  await page.evaluate(async()=>{
   const {repositories:r,services:s}=window.OficinaOSLegacy;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const foto=canvas.toDataURL('image/png');window.reviewPhoto=foto;
   await s.estoque.create({id:9001,nome:'Material proteção',qty:10,custo:20,unid:'Un',foto});
   await r.clients.put({id:9002,name:'Cliente vinculado',nome:'Cliente vinculado',veiculos:[],servicos:[]});
   await r.budgets.put({id:'client-linked',clientId:9002,cliente:'Cliente vinculado'});
   await s.configuracoes.saveOfficeConfig({nome:'Oficina salva',dono:'Responsável',cidade:'Leme',logo:foto});
  });
  await page.evaluate(async()=>{
   const {renderEstoqueView}=await import('/src/modules/estoque/estoque-view.js');const s=window.OficinaOSLegacy.services.estoque;
   await s.create({id:9003,nome:'Leitura lenta',qty:3,custo:10,unid:'Un'});
   const host=document.createElement('section');host.id='slow-stock-review';document.body.append(host);
   renderEstoqueView(host,{service:{...s,get:async id=>{await new Promise(resolve=>{window.releaseReviewMaterialRead=resolve;});return s.get(id);}}});
  });
  const slowHost=page.locator('#slow-stock-review');await slowHost.getByRole('button',{name:'Abrir Materiais',exact:true}).click();
  const slowDialog=slowHost.getByRole('dialog',{name:'Gerenciar Materiais',exact:true});
  await slowDialog.locator('.stock-row').filter({hasText:'Leitura lenta'}).getByRole('button',{name:'Editar',exact:true}).click();
  await slowDialog.getByRole('heading',{name:'Carregando material…',exact:true}).waitFor();assert.equal(await slowDialog.getByLabel('Material',{exact:true}).isDisabled(),true);await page.evaluate(()=>window.releaseReviewMaterialRead());
  await slowDialog.getByLabel('Material',{exact:true}).fill('Leitura lenta editada');await slowDialog.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await slowDialog.locator('.stock-row').filter({hasText:'Leitura lenta editada'}).waitFor();
  await slowDialog.getByRole('button',{name:'Fechar Materiais',exact:true}).click();await page.evaluate(()=>document.querySelector('#slow-stock-review').remove());
  const nav=page.getByRole('navigation',{name:'Módulos da oficina'});
  await nav.getByRole('button',{name:'Estoque',exact:true}).click();await page.getByRole('button',{name:'Abrir Materiais',exact:true}).click();
  const materials=page.getByRole('dialog',{name:'Gerenciar Materiais',exact:true});
  await materials.locator('.stock-row').filter({hasText:'Material proteção'}).getByRole('button',{name:'Editar',exact:true}).click();
  await page.evaluate(async()=>{await window.OficinaOSLegacy.repositories.saveBudgetWithStock({id:'material-debit',updatedAt:'one',materials:[{stockId:9001,qty:2}],parts:[]});});
  await materials.getByLabel('Fornecedor',{exact:true}).fill('Formulário antigo');await materials.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await materials.getByText('O material ou seu saldo mudou. Reabra o cadastro antes de salvar.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=>(await window.OficinaOSLegacy.repositories.stock.get(9001)).qty),8);
  assert.equal(await page.evaluate(async()=>(await window.OficinaOSLegacy.repositories.stock.get(9001)).foto),await page.evaluate(()=>window.reviewPhoto));
  await materials.getByRole('button',{name:'Cancelar edição',exact:true}).click();await materials.getByRole('button',{name:'Fechar Materiais',exact:true}).click();
  await nav.getByRole('button',{name:'Clientes',exact:true}).click();await page.locator('.cli-card').filter({hasText:'Cliente vinculado'}).click();
  page.once('dialog',d=>d.accept());await page.locator('.cli-detail-actions').getByRole('button',{name:'🗑 Excluir',exact:true}).click();
  await page.getByText('Cliente vinculado a orçamento, OS, Agenda ou lançamento. Preserve o cadastro; a exclusão foi bloqueada.',{exact:true}).waitFor();
  assert.ok(await page.evaluate(async()=>Boolean(await window.OficinaOSLegacy.repositories.clients.get(9002))));
  await nav.getByRole('button',{name:'Configurações',exact:true}).click();await page.getByLabel('Nome da oficina',{exact:true}).fill('Rascunho preservado');
  await nav.getByRole('button',{name:'Estoque',exact:true}).click();await nav.getByRole('button',{name:'Configurações',exact:true}).click();
  await page.getByText(/Alterações não salvas\. O rascunho/).waitFor();assert.equal(await page.getByLabel('Nome da oficina',{exact:true}).inputValue(),'Rascunho preservado');
  assert.equal(await page.evaluate(async()=>(await window.OficinaOSLegacy.services.configuracoes.getOfficeConfig()).nome),'Oficina salva');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Descartar alterações',exact:true}).click();assert.equal(await page.getByLabel('Nome da oficina',{exact:true}).inputValue(),'Rascunho preservado');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Descartar alterações',exact:true}).click();await until(()=>page.getByLabel('Nome da oficina',{exact:true}).inputValue().then(v=>v==='Oficina salva'));
  await page.getByLabel('Nome da oficina',{exact:true}).fill('Oficina atualizada');await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();await page.getByText('Configurações salvas.',{exact:true}).waitFor();
  await nav.getByRole('button',{name:'Manual',exact:true}).click();await page.getByLabel('Buscar no manual',{exact:true}).fill('estoque');
  await page.getByRole('button',{name:'Cadastrar e usar materiais sem alterar o saldo por engano',exact:true}).click();
  await page.getByText(/Ao salvar o orçamento vinculado, a quantidade é baixada/).waitFor();
  // O mesmo contrato consultado pelo shell bloqueia aplicação remota de um rascunho.
  await page.evaluate(async()=>{
   const {renderConfiguracoesView}=await import('/src/modules/configuracoes/configuracoes-view.js');
   const host=document.createElement('section');host.id='review-config';document.body.append(host);
   window.reviewConfig=renderConfiguracoesView(host,{service:window.OficinaOSLegacy.services.configuracoes});
  });
  const isolated=page.locator('#review-config');await until(()=>isolated.getByLabel('Nome da oficina',{exact:true}).inputValue().then(v=>v==='Oficina atualizada'));
  assert.equal(await page.evaluate(()=>window.reviewConfig.canApplyRemote()),true);
  await isolated.getByLabel('Nome da oficina',{exact:true}).fill('Bloquear nuvem');assert.equal(await page.evaluate(()=>window.reviewConfig.canApplyRemote()),false);
  await page.evaluate(()=>window.reviewConfig.refresh());assert.equal(await isolated.getByLabel('Nome da oficina',{exact:true}).inputValue(),'Bloquear nuvem');
  page.once('dialog',d=>d.accept());await isolated.getByRole('button',{name:'Descartar alterações',exact:true}).click();await until(()=>page.evaluate(()=>window.reviewConfig.canApplyRemote()));
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}x${viewport.height}: Material obsoleto rejeitado com saldo/foto preservados; editor aguarda leitura lenta sem sobrescrever digitação; exclusão de cliente vinculado bloqueada; Configurações preserva rascunho, cancela/confirma descarte, salva e bloqueia nuvem; Manual atualizado`);
 }finally{await context.close();}
}}finally{await browser.close();server.kill();}
