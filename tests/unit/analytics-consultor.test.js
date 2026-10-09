import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_STORES } from '../../src/data/schema.js';
import { createRelatoriosService } from '../../src/modules/relatorios/relatorios-service.js';
import { createConsultorService, CONSULTOR_CONTEXTS } from '../../src/modules/consultor/consultor-service.js';

function memoryRepo(seed=[]){const rows=new Map(seed.map(x=>[String(x.id),structuredClone(x)]));return{async list(){return[...rows.values()].map(x=>structuredClone(x));},async get(id){return rows.has(String(id))?structuredClone(rows.get(String(id))):null;},async put(row){rows.set(String(row.id),structuredClone(row));return structuredClone(row);},async delete(id){rows.delete(String(id));return true;},async count(){return rows.size;},async replaceAll(list=[]){rows.clear();for(const row of list)rows.set(String(row.id),structuredClone(row));return list.length;}};}
function repositories(seed={}){const out={};for(const name of [...STATE_STORES,'settings','meta','backups'])out[name]=memoryRepo(seed[name]||[]);return out;}

function goalsStub(summary={meta:0,real:0,pct:0,missing:0,projection:0}){return{async summary(){return structuredClone(summary);}};}

test('Relatórios excluem transferências do resultado e calculam margem mensal',async()=>{
  const repos=repositories({transactions:[
    {id:'r1',date:'2026-09-01',type:'rec',val:1000,paid:'Pago'},
    {id:'d1',date:'2026-09-02',type:'dep',val:400,paid:'Pago'},
    {id:'t1',date:'2026-09-03',type:'transfer',val:900,paid:'Pago'}
  ]});
  const s=createRelatoriosService({repositories:repos,metasService:goalsStub()});const cur=await s.currentMonth({now:new Date(2026,8,18)});assert.equal(cur.receitas,1000);assert.equal(cur.despesas,400);assert.equal(cur.lucro,600);assert.equal(cur.margem,60);assert.equal(cur.transactions,2);
});

test('Série de 12 meses usa data atual informada e não âncora fixa antiga',async()=>{
  const repos=repositories({transactions:[{id:'r',date:'2027-02-10',type:'rec',val:100}]});const s=createRelatoriosService({repositories:repos,metasService:goalsStub()});const rows=await s.monthlySeries({months:12,now:new Date(2027,1,15)});assert.equal(rows.at(-1).key,'2027-02');assert.equal(rows.at(-1).receitas,100);assert.equal(rows[0].key,'2026-03');
});

test('Ranking de clientes prefere vínculo por ID em vez de inferir somente descrição',async()=>{
  const repos=repositories({clients:[{id:100,name:'Cliente Vinculado'}],transactions:[{id:'r',date:'2026-09-01',type:'rec',val:700,clientId:100,desc:'Descrição genérica'}]});const s=createRelatoriosService({repositories:repos,metasService:goalsStub()});const top=await s.clientRanking();assert.deepEqual(top,[{name:'Cliente Vinculado',value:700}]);
});

test('Resumo anual é dinâmico e inclui qualquer ano existente',async()=>{
  const repos=repositories({transactions:[{id:'a',date:'2025-01-01',type:'rec',val:100},{id:'b',date:'2027-04-01',type:'rec',val:500},{id:'c',date:'2027-04-02',type:'dep',val:200}]});const s=createRelatoriosService({repositories:repos,metasService:goalsStub()});const years=await s.annual();assert.deepEqual(years.map(x=>x.year),[2025,2027]);assert.equal(years[1].lucro,300);assert.equal(years[1].margem,60);
});

test('Limites são compatíveis com fp_limites e comparam gasto do mês',async()=>{
  const repos=repositories({settings:[{id:'fp_limites',value:{Combustível:300}}],transactions:[{id:'d',date:'2026-09-04',type:'dep',cat:'Combustível',val:360}]});const s=createRelatoriosService({repositories:repos,metasService:goalsStub()});const rows=await s.limits({now:new Date(2026,8,18)});assert.equal(rows[0].category,'Combustível');assert.equal(rows[0].spent,360);assert.equal(rows[0].over,true);await s.updateLimits({Combustível:'450,00'});assert.equal((await repos.settings.get('fp_limites')).value.Combustível,450);
});

test('Snapshot sanitizado não inclui ranking de clientes nem PII',async()=>{
  const repos=repositories({clients:[{id:1,name:'Nome Secreto',fone:'19999999999',doc:'123'}],transactions:[{id:'r',date:'2026-09-01',type:'rec',val:500,clientId:1,cat:'Serviços'}]});const s=createRelatoriosService({repositories:repos,metasService:goalsStub({meta:1000,real:500,pct:50,missing:500,projection:900})});const snap=await s.sanitizedSnapshot({now:new Date(2026,8,18)});const raw=JSON.stringify(snap);assert.equal(raw.includes('Nome Secreto'),false);assert.equal(raw.includes('19999999999'),false);assert.equal(raw.includes('123'),false);assert.ok(Array.isArray(snap.topServices));
});

test('Consultor preserva os 10 contextos do Clean v8',()=>{assert.equal(Object.keys(CONSULTOR_CONTEXTS).length,10);assert.equal(CONSULTOR_CONTEXTS.metalfinish.label,'Metal Finish');assert.equal(CONSULTOR_CONTEXTS.checklist_mon.label,'Checklist Montagem & Entrega');});

test('Consultor local usa indicadores agregados e não altera repositories',async()=>{
  const repos=repositories();const reports={async sanitizedSnapshot(){return{current:{receitas:1000,despesas:400,lucro:600,margem:60},goals:{meta:1500,real:1000,pct:67,missing:500},topServices:[]};}};const s=createConsultorService({repositories:repos,relatoriosService:reports,fetcher:null});const before=await repos.transactions.count();const r=await s.askLocal('Como está meu faturamento e margem?','precificacao');assert.match(r.answer,/R\$\s?1\.000,00/);assert.match(r.answer,/60,0%/);assert.equal(await repos.transactions.count(),before);assert.equal(s.getHistory().length,2);
});

test('Gateway não aceita segredo no frontend nem HTTP remoto inseguro',async()=>{
  const repos=repositories();const reports={async sanitizedSnapshot(){return{};}};const s=createConsultorService({repositories:repos,relatoriosService:reports,fetcher:null});await assert.rejects(()=>s.configureGateway({enabled:true,endpoint:'http://example.com/ai'}),/HTTPS/);await assert.rejects(()=>s.configureGateway({enabled:true,endpoint:'https://example.com/ai?token=segredo'}),/credenciais|tokens/);const cfg=await s.configureGateway({enabled:true,endpoint:'https://example.com/ai',timeoutMs:5000,apiKey:'NAO_DEVE_SER_SALVA'});assert.deepEqual(Object.keys(cfg).sort(),['enabled','endpoint','timeoutMs']);const stored=await repos.settings.get('oficinaos_ai_gateway_v1');assert.equal(JSON.stringify(stored).includes('NAO_DEVE_SER_SALVA'),false);
});

test('Gateway recebe apenas snapshot sanitizado e resposta é tratada como texto',async()=>{
  const repos=repositories({clients:[{id:1,name:'PII CLIENTE'}]});let payload=null,requestOptions=null;const reports={async sanitizedSnapshot(){return{current:{receitas:900},topServices:[{name:'Serviços',value:900}]};}};const fetcher=async(url,opts)=>{requestOptions=opts;payload=JSON.parse(opts.body);return{ok:true,status:200,async json(){return{answer:'Resposta externa segura'};}};};const s=createConsultorService({repositories:repos,relatoriosService:reports,fetcher});await s.configureGateway({enabled:true,endpoint:'https://example.com/ai'});const r=await s.askGateway('Analise os números','geral');assert.equal(r.answer,'Resposta externa segura');assert.equal(JSON.stringify(payload).includes('PII CLIENTE'),false);assert.equal(payload.schema,'oficinaos-ai-request-v1');assert.equal(payload.context.id,'geral');assert.equal(requestOptions.credentials,'omit');assert.equal(requestOptions.redirect,'error');assert.equal(requestOptions.referrerPolicy,'no-referrer');
});

test('Falha no gateway faz fallback local sem bloquear o consultor',async()=>{
  const repos=repositories();const reports={async sanitizedSnapshot(){return{current:{receitas:0,despesas:0,lucro:0,margem:0},topServices:[]};}};const fetcher=async()=>({ok:false,status:503,async json(){return{};}});const s=createConsultorService({repositories:repos,relatoriosService:reports,fetcher});await s.configureGateway({enabled:true,endpoint:'https://example.com/ai'});const r=await s.ask({message:'Como precificar?',context:'precificacao',preferExternal:true});assert.equal(r.source,'local');assert.match(r.externalError,/503/);assert.match(r.answer,/mão de obra/i);
});

test('Fase 9: gateway remove nomes e campos extras do resumo antes do envio',async()=>{
 let payload;const secret='NOME PRIVADO';const reports={async sanitizedSnapshot(){return{current:{receitas:100,cliente:secret},monthly:[{key:'2026-10',receitas:100,notes:secret}],annual:[],topServices:[{name:secret,value:100}],limits:[{category:secret,limit:80,spent:100,pct:125,over:true}],goals:{meta:200,real:100,cliente:secret}};}};
 const s=createConsultorService({repositories:repositories(),relatoriosService:reports,fetcher:async(_url,options)=>{payload=JSON.parse(options.body);return{ok:true,json:async()=>({answer:'Teste'})};}});
 await s.configureGateway({enabled:true,endpoint:'https://example.com/ai'});await s.askGateway('Pergunta de teste');assert.equal(JSON.stringify(payload).includes(secret),false);assert.equal(payload.snapshot.current.receitas,100);assert.equal(payload.snapshot.topServices[0].name,'Categoria 1');
});
test('Fase 9: configuração importada com URL insegura não é enviada',async()=>{
 let calls=0;const s=createConsultorService({repositories:repositories({settings:[{id:'oficinaos_ai_gateway_v1',value:{enabled:true,endpoint:'http://example.com/ai'}}]}),relatoriosService:{sanitizedSnapshot:async()=>({})},fetcher:async()=>{calls++;}});
 await assert.rejects(s.askGateway('Teste'),/HTTPS/);assert.equal(calls,0);
});
test('Fase 9: tempo limite cobre corpo de resposta travado e permite resposta local',async()=>{
 const s=createConsultorService({repositories:repositories(),relatoriosService:{sanitizedSnapshot:async()=>({current:{},topServices:[]})},fetcher:async()=>({ok:true,json:()=>new Promise(()=>{})})});
 await s.configureGateway({enabled:true,endpoint:'https://example.com/ai',timeoutMs:2000});const result=await s.ask({message:'Como está a margem?',preferExternal:true});assert.equal(result.source,'local');assert.match(result.externalError,/Tempo limite/);assert.equal(s.getHistory().length,2);
});
test('Fase 9: relatórios e consultas locais preservam todas as coleções',async()=>{
 const repos=repositories({transactions:[{id:1,date:'2026-10-09',type:'rec',val:200,paid:'Não pago'},{id:2,date:'2026-10-09',type:'dep',val:50,paid:'Pago'}],clients:[{id:5,name:'Original'}]});const snapshot=async()=>Object.fromEntries(await Promise.all(Object.entries(repos).map(async([name,r])=>[name,await r.list()])));const before=await snapshot();
 const reports=createRelatoriosService({repositories:repos,metasService:goalsStub()});const dashboard=await reports.dashboard({now:new Date(2026,9,9)});assert.equal(dashboard.current.receitas,200);const cash=await reports.currentMonth({now:new Date(2026,9,9),paidOnly:true});assert.equal(cash.receitas,0);
 const s=createConsultorService({repositories:repos,relatoriosService:reports,fetcher:null});await s.askLocal('Como está meu faturamento?');await s.clearHistory();assert.deepEqual(await snapshot(),before);assert.equal(s.getHistory().length,0);
});
