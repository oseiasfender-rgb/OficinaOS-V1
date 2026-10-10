import { MANUAL_ARTICLES, searchManual } from './manual-local.js';
import { safeText } from '../../core/validators.js';

export const CONSULTOR_CONTEXTS=Object.freeze({
  geral:{label:'Consulta Livre',description:'Consulta técnica e de gestão para oficina de funilaria e pintura.'},
  metalfinish:{label:'Metal Finish',description:'Foco em Metal Finish, planagem, repuxo, alinhamento de chapa e mínimo de massa.'},
  pintura:{label:'Pintura & Acabamento',description:'Foco em preparação, primer, base, verniz, flash-off, polimento e acabamento premium.'},
  solda:{label:'Solda TIG/MIG',description:'Foco em solda TIG/MIG, união de chapas, controle térmico e acabamento.'},
  equipamentos:{label:'Equipamentos',description:'Foco em pistolas, compressores, filtragem, cabines, iluminação e bancada.'},
  pnl:{label:'Vendas com PNL',description:'Foco em comunicação comercial ética, rapport, percepção de valor e fechamento.'},
  precificacao:{label:'Precificação MEI',description:'Foco em orçamento, margem, custo, horas, materiais, risco e lucro.'},
  cliente:{label:'Gestão de Clientes',description:'Foco em gestão de clientes, atendimento, organização e pós-venda.'},
  checklist_des:{label:'Checklist Desmontagem',description:'Foco em checklist de desmontagem, etiquetagem, fotos e controle.'},
  checklist_mon:{label:'Checklist Montagem & Entrega',description:'Foco em checklist de montagem, conferência final e entrega.'}
});

function clone(v){return structuredClone(v);}
function text(v,max=4000){return safeText(v,max);}
function normalizeQuestion(v){return text(v,4000).toLocaleLowerCase('pt-BR');}
function pct(n){return Number.isFinite(Number(n))?`${Number(n).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`:'0,0%';}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function validateEndpoint(value){const raw=text(value,500);if(!raw)return'';let url;try{url=new URL(raw);}catch{throw new Error('Endpoint do gateway inválido.');}const localhost=['localhost','127.0.0.1','::1'].includes(url.hostname);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&localhost))throw new Error('O gateway deve usar HTTPS; HTTP só é aceito em localhost.');if(url.username||url.password||url.search||url.hash)throw new Error('Não inclua credenciais, tokens, query string ou fragmentos no endpoint do gateway.');return url.toString();}

function localTechnicalReply(question,context,snapshot){
  const q=normalizeQuestion(question),ctx=CONSULTOR_CONTEXTS[context]||CONSULTOR_CONTEXTS.geral;const lines=[ctx.label];
  if(q.includes('fatur')||q.includes('finance')||q.includes('lucro')||q.includes('margem')||q.includes('meta')){
    const cur=snapshot?.current||{},goal=snapshot?.goals;lines.push(`No mês atual, o sistema registra ${money(cur.receitas)} em receitas, ${money(cur.despesas)} em despesas e resultado de ${money(cur.lucro)}. Margem apurada: ${pct(cur.margem)}.`);if(goal?.meta>0)lines.push(`Meta mensal: ${money(goal.meta)}; realizado ${money(goal.real)} (${Math.round(goal.pct||0)}%). Faltam ${money(goal.missing)} para a meta.`);lines.push('Use esses números como leitura operacional do que já está registrado; confirme lançamentos pendentes antes de tomar uma decisão financeira.');lines.push('Referência: indicadores locais dos módulos Relatórios e Metas.');return lines.join('\n\n');
  }
  if(q.includes('ranking')||((q.includes('histórico')||q.includes('historico'))&&(q.includes('serviço')||q.includes('servico')))){const top=(snapshot?.topServices||[]).slice(0,5);if(!top.length)return 'Não há receitas por serviço/categoria no histórico carregado para apresentar este ranking.';lines.push('Serviços/categorias com maior receita registrada — não representa quantidade de serviços:');lines.push(top.map((row,i)=>`${i+1}. ${row.name}: ${money(row.value)}`).join('\n'));lines.push('Referência: ranking de receitas do módulo Relatórios.');return lines.join('\n\n');}
  const articles=searchManual(question,context);
  if(!articles.length)return 'Não sei responder a essa pergunta com o manual local disponível. Busque um assunto cadastrado ou consulte a documentação específica.';
  for(const article of articles.slice(0,2)){lines.push(article.title);lines.push(article.steps.map((step,i)=>`${i+1}. ${step}`).join('\n'));lines.push(`Referência: ${article.source}`);}
  return lines.join('\n\n');
}

export function createConsultorService({repositories,relatoriosService,eventBus=null,fetcher=globalThis.fetch}){
  const settingsRepo=repositories.settings;let history=[];
  async function getGatewayConfig(){const row=await settingsRepo.get('oficinaos_ai_gateway_v1');const raw=row?.value||{};return{enabled:raw.enabled===true,endpoint:text(raw.endpoint,500),timeoutMs:Math.min(Math.max(Number(raw.timeoutMs)||15000,2000),60000)};}
  async function configureGateway(input={}){const cfg={enabled:input.enabled===true,endpoint:validateEndpoint(input.endpoint||''),timeoutMs:Math.min(Math.max(Number(input.timeoutMs)||15000,2000),60000)};if(cfg.enabled&&!cfg.endpoint)throw new Error('Informe o endpoint do gateway antes de ativar.');await settingsRepo.put({id:'oficinaos_ai_gateway_v1',value:cfg});eventBus?.emit?.('consultor:gateway-changed',clone(cfg));return clone(cfg);}
  async function clearHistory(){history=[];return true;}
  function getHistory(){return clone(history);}
  async function askLocal(message,context='geral'){const clean=text(message,4000);if(!clean)throw new Error('Digite uma pergunta.');if(!CONSULTOR_CONTEXTS[context])context='geral';const snapshot=await relatoriosService.sanitizedSnapshot();const answer=localTechnicalReply(clean,context,snapshot);history.push({role:'user',content:clean,context,at:new Date().toISOString()},{role:'assistant',content:answer,context,source:'local',at:new Date().toISOString()});history=history.slice(-40);return{answer,source:'local',context,snapshot};}
  async function askGateway(message,context='geral'){
    const clean=text(message,4000);if(!clean)throw new Error('Digite uma pergunta.');if(!CONSULTOR_CONTEXTS[context])context='geral';
    const cfg=await getGatewayConfig();if(!cfg.enabled||!cfg.endpoint)throw new Error('Gateway externo não configurado.');
    const endpoint=validateEndpoint(cfg.endpoint);if(typeof fetcher!=='function')throw new Error('Cliente HTTP indisponível.');
    const raw=await relatoriosService.sanitizedSnapshot();
    const numeric=(row,keys)=>Object.fromEntries(keys.map(key=>[key,Number.isFinite(Number(row?.[key]))?Number(row[key]):0]));
    const indicators=['receitas','despesas','lucro','margem'];
    const snapshot={current:numeric(raw.current,indicators),
      monthly:(raw.monthly||[]).map(row=>({...numeric(row,indicators),key:/^\d{4}-\d{2}$/.test(row.key)?row.key:''})),
      annual:(raw.annual||[]).map(row=>numeric(row,['year',...indicators])),
      topServices:(raw.topServices||[]).map((row,index)=>({name:`Categoria ${index+1}`,value:Number(row.value)||0})),
      goals:raw.goals?numeric(raw.goals,['meta','real','pct','projection','missing']):null,
      limits:(raw.limits||[]).map((row,index)=>({...numeric(row,['limit','spent','pct']),category:`Categoria ${index+1}`,over:row.over===true}))};
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Tempo limite do gateway excedido.'));},cfg.timeoutMs);});
    let answer;
    try{answer=await Promise.race([timeout,(async()=>{
      const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',body:JSON.stringify({schema:'oficinaos-ai-request-v1',message:clean,context:{id:context,...CONSULTOR_CONTEXTS[context]},snapshot}),signal:controller.signal});
      if(!response?.ok)throw new Error(`Gateway respondeu com status ${response?.status??'desconhecido'}.`);
      const data=await response.json();const result=text(data?.answer??data?.text,12000);if(!result)throw new Error('Gateway retornou resposta vazia.');return result;
    })()]);}finally{clearTimeout(timer);}
    history.push({role:'user',content:clean,context,at:new Date().toISOString()},{role:'assistant',content:answer,context,source:'gateway',at:new Date().toISOString()});history=history.slice(-40);return{answer,source:'gateway',context};
  }

  async function ask({message,context='geral',preferExternal=false}={}){if(preferExternal){try{return await askGateway(message,context);}catch(error){const local=await askLocal(message,context);return{...local,externalError:error.message};}}return askLocal(message,context);}
  return Object.freeze({articles:MANUAL_ARTICLES,searchManual,contexts:CONSULTOR_CONTEXTS,getGatewayConfig,configureGateway,ask,askLocal,askGateway,getHistory,clearHistory});
}
