import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5199'],{stdio:'ignore'});
for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5199')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,executablePath:'/tmp/oficina-chromium/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const report={at:new Date().toISOString(),scope:'build local, perfis descartáveis, sem contas nem dados reais',profiles:[]};
try{
 for(const viewport of [{width:1366,height:768},{width:412,height:915}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5199/');await page.waitForFunction(()=>Boolean(window.OficinaOSLegacy));
  const nav=page.getByRole('navigation',{name:'Módulos da oficina'}),tabs=[];
  for(const name of ['Migração','Orçamento','Financeiro','Clientes','Categorias','Estoque','Configurações','Agenda','OS','Históricos','Resultados','Manual']){
   await nav.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(100);
   tabs.push({tab:name,headings:await page.getByRole('heading',{level:1}).allTextContents(),pageOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
   if(name==='Financeiro'){await page.getByRole('navigation',{name:'Seções de Financeiro'}).getByRole('button',{name:'Contas',exact:true}).click();await page.waitForTimeout(100);tabs.push({tab:'Contas',headings:await page.getByRole('heading',{level:1}).allTextContents(),pageOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});}
   if(name==='Resultados'){await page.getByRole('navigation',{name:'Seções de Resultados'}).getByRole('button',{name:'Metas',exact:true}).click();await page.waitForTimeout(100);tabs.push({tab:'Metas',headings:await page.getByRole('heading',{level:1}).allTextContents(),pageOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});}
  }
  await nav.getByRole('button',{name:'Configurações',exact:true}).click();await page.getByLabel('Nome da oficina',{exact:true}).fill('Rascunho não salvo');await nav.getByRole('button',{name:'Estoque',exact:true}).click();await nav.getByRole('button',{name:'Configurações',exact:true}).click();
  await page.waitForTimeout(250);const unsavedOfficeName=await page.getByLabel('Nome da oficina',{exact:true}).inputValue();
  report.profiles.push({viewport,tabs,errors,unsavedConfigDraftRetained:unsavedOfficeName==='Rascunho não salvo'});
  await context.close();
 }
}finally{await browser.close();server.kill();await writeFile('/tmp/revisao-abas-browser.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
