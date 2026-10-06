import { amount, isPaid, normalizeTransaction } from '../financeiro/financial-model.js';

const MONTHS_SHORT=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const LEGACY_SERVICE_CATEGORIES=new Set([
  'Orçamentos','Pintura Completa','Pintura de Peças','Serviços de Funilaria','Reparos de Carroceria',
  'Remoçao de amassados','Remoção de amassados','Soldas','Retoques de Pintura','Reparos Rápidos',
  'Troca de Peças','Polimento','Cyborg','Serviços','Serviço OS','Funilaria e Pintura'
]);

function clone(v){return structuredClone(v);}
function ym(date){return String(date||'').slice(0,7);}
function ymdParts(date){const m=/^(\d{4})-(\d{2})/.exec(String(date||''));return m?{year:Number(m[1]),month:Number(m[2])}:null;}
function monthStart(date){const d=new Date(date);return new Date(d.getFullYear(),d.getMonth(),1);}
function monthKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
function lastMonths(count=12,now=new Date()){
  const end=monthStart(now),out=[];
  for(let i=Math.max(1,count)-1;i>=0;i--){const d=new Date(end);d.setMonth(d.getMonth()-i);out.push({key:monthKey(d),year:d.getFullYear(),month:d.getMonth()+1,label:MONTHS_SHORT[d.getMonth()]});}
  return out;
}
function transactionType(tx){const t=String(tx.type??tx.tipo??'').toLowerCase();if(/^rec|receita|income/.test(t))return'rec';if(/^transfer|transferencia|transferência/.test(t))return'transfer';return'dep';}
function transactionAmount(tx){return amount(tx.val??tx.valor??tx.amount);}
function clientNameMap(clients=[]){return new Map(clients.map(c=>[String(c.id),String(c.name??c.nome??'').trim()]).filter(x=>x[1]));}
function receiptClientLabel(tx,clients){const id=tx.clientId??tx.clienteId;const linked=id!=null?clients.get(String(id)):'';if(linked)return linked;return String(tx.clientName??tx.cliente??tx.nomeCliente??tx.desc??tx.descricao??'Receita').replace(/\s+\d+\/\d+$/,'').trim()||'Receita';}
function serviceLabel(tx){return String(tx.service??tx.servico??tx.cat??tx.categoria??'Serviços').trim()||'Serviços';}
function sum(rows,predicate){return rows.filter(predicate).reduce((acc,row)=>acc+transactionAmount(row),0);}

export function createRelatoriosService({repositories,metasService=null,eventBus=null}){
  const txRepo=repositories.transactions,clientsRepo=repositories.clients,budgetRepo=repositories.budgets,workOrdersRepo=repositories.workOrders,settingsRepo=repositories.settings;
  async function transactions(){return (await txRepo.list()).map(normalizeTransaction).filter(t=>transactionType(t)!=='transfer');}
  async function settings(id,fallback){const row=await settingsRepo.get(id);return row?clone(row.value):clone(fallback);}
  async function setSettings(id,value){await settingsRepo.put({id,value:clone(value)});return clone(value);}

  async function periodLabel(){const tx=await transactions();const years=[...new Set(tx.map(t=>String(t.date||'').slice(0,4)).filter(v=>/^\d{4}$/.test(v)))].sort();if(!years.length)return'Sem lançamentos reais ainda';return `${years[0]}${years.length>1?` – ${years.at(-1)}`:''} · ${tx.length} lançamentos`;}

  async function monthlySeries({months=12,now=new Date(),paidOnly=false}={}){
    const tx=await transactions(),keys=lastMonths(months,now);
    return keys.map(m=>{
      const rows=tx.filter(t=>ym(t.date)===m.key&&(!paidOnly||isPaid(t.paid)));
      const receitas=sum(rows,t=>transactionType(t)==='rec'),despesas=sum(rows,t=>transactionType(t)==='dep');
      const lucro=receitas-despesas,margem=receitas>0?lucro/receitas*100:0;
      return {...m,receitas,despesas,lucro,margem,count:rows.length};
    });
  }

  async function currentMonth({now=new Date(),paidOnly=false}={}){
    const key=monthKey(now),tx=await transactions();const rows=tx.filter(t=>ym(t.date)===key&&(!paidOnly||isPaid(t.paid)));
    const receitas=sum(rows,t=>transactionType(t)==='rec'),despesas=sum(rows,t=>transactionType(t)==='dep'),lucro=receitas-despesas;
    const [budgets,workOrders]=await Promise.all([budgetRepo.list(),workOrdersRepo.list()]);
    const monthBudgets=budgets.filter(b=>ym(b.date??b.data??b.entryDate)===key).length;
    const delivered=workOrders.filter(o=>String(o.status??'').toLowerCase()==='entregue'&&ym(o.deliveredAt??o.updatedAt??o.dueDate??o.entregaPrevista)===key).length;
    return {key,receitas,despesas,lucro,margem:receitas>0?lucro/receitas*100:0,transactions:rows.length,budgets:monthBudgets,delivered};
  }

  async function clientRanking({limit=8}={}){
    const [tx,clientsRaw]=await Promise.all([transactions(),clientsRepo.list()]),clients=clientNameMap(clientsRaw),map=new Map();
    for(const row of tx){if(transactionType(row)!=='rec'||transactionAmount(row)<=0)continue;const name=receiptClientLabel(row,clients);map.set(name,(map.get(name)||0)+transactionAmount(row));}
    return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'pt-BR')).slice(0,limit);
  }

  async function serviceRanking({limit=7,legacyOnly=false}={}){
    const tx=await transactions(),map=new Map();
    for(const row of tx){if(transactionType(row)!=='rec'||transactionAmount(row)<=0)continue;const name=serviceLabel(row);if(legacyOnly&&!LEGACY_SERVICE_CATEGORIES.has(name))continue;map.set(name,(map.get(name)||0)+transactionAmount(row));}
    return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'pt-BR')).slice(0,limit);
  }

  async function seasonal(){const tx=await transactions(),rows=MONTHS_SHORT.map((label,index)=>({month:index+1,label,receitas:0,count:0}));for(const row of tx){if(transactionType(row)!=='rec'||transactionAmount(row)<=0)continue;const p=ymdParts(row.date);if(!p||p.month<1||p.month>12)continue;rows[p.month-1].receitas+=transactionAmount(row);rows[p.month-1].count++;}return rows;}

  async function annual(){const tx=await transactions(),years=[...new Set(tx.map(t=>ymdParts(t.date)?.year).filter(Boolean))].sort((a,b)=>a-b);return years.map(year=>{const rows=tx.filter(t=>ymdParts(t.date)?.year===year);const receitas=sum(rows,t=>transactionType(t)==='rec'),despesas=sum(rows,t=>transactionType(t)==='dep'),lucro=receitas-despesas;return{year,receitas,despesas,lucro,margem:receitas>0?lucro/receitas*100:0,count:rows.length};});}

  async function limits({now=new Date()}={}){
    const raw=await settings('fp_limites',{});const limits=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const key=monthKey(now),tx=await transactions();const spent=new Map();for(const row of tx){if(ym(row.date)!==key||transactionType(row)!=='dep')continue;const cat=String(row.cat??row.categoria??'Outros');spent.set(cat,(spent.get(cat)||0)+transactionAmount(row));}
    return Object.entries(limits).map(([category,limit])=>{const value=amount(limit),spentValue=spent.get(category)||0;return{category,limit:value,spent:spentValue,pct:value>0?spentValue/value*100:0,over:value>0&&spentValue>value};}).sort((a,b)=>b.pct-a.pct||a.category.localeCompare(b.category,'pt-BR'));
  }
  async function updateLimits(next={}){const clean={};for(const [k,v] of Object.entries(next||{})){const n=amount(v);if(String(k).trim()&&n>0)clean[String(k).trim()]=n;}await setSettings('fp_limites',clean);eventBus?.emit?.('relatorios:limits-changed',clone(clean));return clean;}

  async function goals({now=new Date()}={}){if(!metasService)return null;return metasService.summary(now);}

  async function dashboard({months=12,now=new Date()}={}){
    const [period,current,series,clients,services,season,years,goalData,limitData]=await Promise.all([
      periodLabel(),currentMonth({now}),monthlySeries({months,now}),clientRanking(),serviceRanking(),seasonal(),annual(),goals({now}),limits({now})
    ]);
    return {period,current,series,clients,services,seasonal:season,annual:years,goals:goalData,limits:limitData,generatedAt:new Date().toISOString()};
  }

  async function sanitizedSnapshot({now=new Date()}={}){
    const d=await dashboard({months:12,now});
    return {generatedAt:d.generatedAt,current:d.current,monthly:d.series.map(x=>({key:x.key,receitas:x.receitas,despesas:x.despesas,lucro:x.lucro,margem:x.margem})),topServices:d.services.slice(0,5),annual:d.annual,goals:d.goals?{meta:d.goals.meta,real:d.goals.real,pct:d.goals.pct,projection:d.goals.projection,missing:d.goals.missing}:null,limits:d.limits.map(x=>({category:x.category,limit:x.limit,spent:x.spent,pct:x.pct,over:x.over}))};
  }

  return Object.freeze({periodLabel,monthlySeries,currentMonth,clientRanking,serviceRanking,seasonal,annual,limits,updateLimits,goals,dashboard,sanitizedSnapshot});
}
