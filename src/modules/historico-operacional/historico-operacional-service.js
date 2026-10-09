import { safeText } from '../../core/validators.js';

function clone(v){return structuredClone(v);}
function uid(prefix='evt'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function text(v,max=1000){return safeText(v,max);}

export function createHistoricoOperacionalService({repositories,eventBus,store}){
  const repo=repositories.operationalHistory;
  const settingsRepo=repositories.settings;
  const DEFAULT={days:180,max:500};

  async function config(){
    const row=await settingsRepo.get('oficina_event_history_config');
    const value=row?.value&&typeof row.value==='object'?row.value:{};
    const days=Number(value.days),max=Number(value.max);
    return {
      days:Number.isFinite(days)?Math.max(0,Math.floor(days)):DEFAULT.days,
      max:Number.isFinite(max)?Math.max(0,Math.floor(max)):DEFAULT.max
    };
  }
  async function prune(){
    const cfg=await config();
    const rows=await repo.list();
    const cutoff=cfg.days?Date.now()-cfg.days*86400000:0;
    const keep=rows
      .filter(row=>!cutoff||new Date(row.at??row.createdAt??0).getTime()>=cutoff)
      .sort((a,b)=>String(b.at??'').localeCompare(String(a.at??'')));
    const trimmed=cfg.max?keep.slice(0,cfg.max):keep;
    if(trimmed.length!==rows.length)await repo.replaceAll(trimmed);
    store?.patch?.({operationalHistory:trimmed});
    return trimmed;
  }
  async function record(input={}){
    const now=input.at||new Date().toISOString();
    const row={
      id:input.id||uid('evt'),
      at:now,
      module:text(input.module||'Sistema',100),
      action:text(input.action||'Alteração',120),
      entity:text(input.entity||'',120),
      entityId:text(input.entityId||'',180),
      summary:text(input.summary||'',500),
      details:text(input.details||'',1600)
    };
    await repo.put(row);
    await prune();
    eventBus?.emit?.('history:changed',{action:'record',id:row.id});
    return clone(row);
  }
  async function list({query='',module='all',limit=0}={}){
    const q=text(query,200).toLocaleLowerCase('pt-BR');
    let rows=(await repo.list()).sort((a,b)=>String(b.at??'').localeCompare(String(a.at??'')));
    if(module&&module!=='all')rows=rows.filter(row=>String(row.module||'')===String(module));
    if(q)rows=rows.filter(row=>[row.module,row.action,row.entity,row.entityId,row.summary,row.details].join(' ').toLocaleLowerCase('pt-BR').includes(q));
    if(limit>0)rows=rows.slice(0,limit);
    return clone(rows);
  }
  async function modules(){return [...new Set((await repo.list()).map(row=>text(row.module,100)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
  async function configure(next={}){
    const old=await config();
    const value={
      days:next.days==null?old.days:Math.max(0,Math.floor(Number(next.days)||0)),
      max:next.max==null?old.max:Math.max(0,Math.floor(Number(next.max)||0))
    };
    await settingsRepo.put({id:'oficina_event_history_config',value});
    await prune();
    await record({module:'Sistema',action:'Configuração',entity:'Histórico',summary:'Política de retenção atualizada',details:`dias=${value.days}; máximo=${value.max}`});
    return value;
  }
  async function exportData(){return {version:'oficinaos-history-v1',exportedAt:new Date().toISOString(),retention:await config(),events:await list()};}
  return Object.freeze({list,modules,record,configure,config,prune,exportData});
}
