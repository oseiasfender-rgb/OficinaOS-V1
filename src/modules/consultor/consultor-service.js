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
    const cur=snapshot?.current||{},goal=snapshot?.goals;lines.push(`No mês atual, o sistema registra ${money(cur.receitas)} em receitas, ${money(cur.despesas)} em despesas e resultado de ${money(cur.lucro)}. Margem apurada: ${pct(cur.margem)}.`);if(goal?.meta>0)lines.push(`Meta mensal: ${money(goal.meta)}; realizado ${money(goal.real)} (${Math.round(goal.pct||0)}%). Faltam ${money(goal.missing)} para a meta.`);lines.push('Use esses números como leitura operacional do que já está registrado; confirme lançamentos pendentes antes de tomar uma decisão financeira.');return lines.join('\n\n');
  }
  if(q.includes('preço')||q.includes('precific')||q.includes('orçament')){lines.push('Não precifique apenas por percepção. Some mão de obra por hora real, materiais, peças, terceiros e frete; aplique a complexidade e depois trate margem e desconto.');lines.push('Ordem prática: inspeção → horas por processo → materiais → terceiros → deslocamento → complexidade → margem → desconto → cenário comercial.');return lines.join('\n\n');}
  if(q.includes('metal finish')||q.includes('planagem')||q.includes('repuxo')||q.includes('chapa')){lines.push('Metal Finish depende de controle progressivo: mapeie altos e baixos, alivie tensão aos poucos, use apoio correto, confira reflexo/régua com frequência e evite aquecimento sem critério.');lines.push('Um erro recorrente é tentar fechar a chapa rápido demais e criar alongamento ou novas tensões.');return lines.join('\n\n');}
  if(q.includes('pintura')||q.includes('verniz')||q.includes('primer')||q.includes('hvlp')||q.includes('lix')){lines.push('O acabamento começa na preparação: superfície uniforme, progressão de lixa coerente, limpeza, controle de poeira/umidade, flash-off, viscosidade e padrão constante de aplicação.');lines.push('Se houver escorrimento ou mancha, revise diluição, pressão, distância, sobreposição e velocidade antes de compensar com mais produto.');return lines.join('\n\n');}
  if(q.includes('solda')||q.includes('mig')||q.includes('tig')){lines.push('Em funilaria, priorize controle térmico: pontos alternados, limpeza da área, intervalos entre pontos e acabamento sem retirar material estrutural em excesso.');return lines.join('\n\n');}
  if(q.includes('cliente')||q.includes('venda')||q.includes('fechar')){lines.push('A comunicação comercial deve reduzir incerteza: diagnóstico claro, processo explicado, riscos objetivos, opções comerciais coerentes e próximo passo bem definido.');return lines.join('\n\n');}
  if(q.includes('checklist')||q.includes('entrega')||q.includes('desmont')){lines.push('Checklist reduz retrabalho: fotos antes/depois, peças identificadas, folgas e funções conferidas, acabamento revisado sob iluminação adequada e validação final antes da entrega.');return lines.join('\n\n');}
  if(q.includes('serviço')||q.includes('servico')||q.includes('mais vendido')||q.includes('ranking')){const top=snapshot?.topServices?.[0];if(top)lines.push(`O serviço/categoria com maior receita no histórico carregado é “${top.name}”, com ${money(top.value)}.`);lines.push('Use ranking como sinal de demanda, não como decisão isolada: combine volume, margem, tempo de execução, retrabalho e capacidade da oficina.');return lines.join('\n\n');}
  lines.push('Meça primeiro o problema e depois escolha o processo. Separe diagnóstico técnico, custo, risco, padrão mínimo aceitável e registro do que foi decidido.');return lines.join('\n\n');
}

export function createConsultorService({repositories,relatoriosService,eventBus=null,fetcher=globalThis.fetch}){
  const settingsRepo=repositories.settings;let history=[];
  async function getGatewayConfig(){const row=await settingsRepo.get('oficinaos_ai_gateway_v1');const raw=row?.value||{};return{enabled:raw.enabled===true,endpoint:text(raw.endpoint,500),timeoutMs:Math.min(Math.max(Number(raw.timeoutMs)||15000,2000),60000)};}
  async function configureGateway(input={}){const cfg={enabled:input.enabled===true,endpoint:validateEndpoint(input.endpoint||''),timeoutMs:Math.min(Math.max(Number(input.timeoutMs)||15000,2000),60000)};if(cfg.enabled&&!cfg.endpoint)throw new Error('Informe o endpoint do gateway antes de ativar.');await settingsRepo.put({id:'oficinaos_ai_gateway_v1',value:cfg});eventBus?.emit?.('consultor:gateway-changed',clone(cfg));return clone(cfg);}
  async function clearHistory(){history=[];return true;}
  function getHistory(){return clone(history);}
  async function askLocal(message,context='geral'){const clean=text(message,4000);if(!clean)throw new Error('Digite uma pergunta.');if(!CONSULTOR_CONTEXTS[context])context='geral';const snapshot=await relatoriosService.sanitizedSnapshot();const answer=localTechnicalReply(clean,context,snapshot);history.push({role:'user',content:clean,context,at:new Date().toISOString()},{role:'assistant',content:answer,context,source:'local',at:new Date().toISOString()});history=history.slice(-40);return{answer,source:'local',context,snapshot};}
  async function askGateway(message,context='geral'){
    const clean=text(message,4000);if(!clean)throw new Error('Digite uma pergunta.');if(!CONSULTOR_CONTEXTS[context])context='geral';const cfg=await getGatewayConfig();if(!cfg.enabled||!cfg.endpoint)throw new Error('Gateway externo não configurado.');if(typeof fetcher!=='function')throw new Error('Cliente HTTP indisponível.');const snapshot=await relatoriosService.sanitizedSnapshot();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);let response;
    try{response=await fetcher(cfg.endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',body:JSON.stringify({schema:'oficinaos-ai-request-v1',message:clean,context:{id:context,...CONSULTOR_CONTEXTS[context]},snapshot}),signal:controller.signal});}finally{clearTimeout(timer);}
    if(!response?.ok)throw new Error(`Gateway respondeu com status ${response?.status??'desconhecido'}.`);const data=await response.json();const answer=text(data?.answer??data?.text,12000);if(!answer)throw new Error('Gateway retornou resposta vazia.');history.push({role:'user',content:clean,context,at:new Date().toISOString()},{role:'assistant',content:answer,context,source:'gateway',at:new Date().toISOString()});history=history.slice(-40);return{answer,source:'gateway',context};
  }
  async function ask({message,context='geral',preferExternal=false}={}){if(preferExternal){try{return await askGateway(message,context);}catch(error){const local=await askLocal(message,context);return{...local,externalError:error.message};}}return askLocal(message,context);}
  return Object.freeze({contexts:CONSULTOR_CONTEXTS,getGatewayConfig,configureGateway,ask,askLocal,askGateway,getHistory,clearHistory});
}
