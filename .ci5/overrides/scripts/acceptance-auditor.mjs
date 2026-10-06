import crypto from 'node:crypto';
// Independent projector for the explicitly approved flat 1.0 baseline.
// Does not import production normalizers, repositories or services.
export const AUDIT_STORES=['transactions','accounts','clients','jobs','workOrders','appointments','checklists','budgets','categories','goals','stock','operationalHistory','budgetHistory','archivedBudgets','trash','deletionBackups','deletionLog','recurringTemplates'];
const clone=v=>structuredClone(v), text=v=>String(v??'').trim(), date=v=>/^\d{4}-\d{2}-\d{2}/.test(text(v))?text(v).slice(0,10):'';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export function projectReference(raw){
 const top=['version','exportedAt','ALL_TX','jobs','clientes','estoque','contas','metaPrincipal','metasCat','nextTxId','dasStatus'];
 if(Object.keys(raw).some(k=>!top.includes(k))||raw.version!=='1.0')throw new Error('Fonte fora do escopo da matriz v1; não calcular.');
 for(const k of ['ALL_TX','jobs','clientes','estoque','contas','metasCat'])if(!Array.isArray(raw[k]))throw new Error('Coleção ausente: '+k);
 if(raw.estoque.length)throw new Error('Estoque não vazio fora do escopo v1.');
 const fields={ALL_TX:['id','paid','val','type','cat','date','desc','pagto','orcId','hist','dasKey','ref'],jobs:['id','entrega','entrada','val','updatedAt','veiculo','cliente','tipo','done','obs'],clientes:['nome','obs','doc','criado','servicos','email','id','veiculos','fone'],contas:['id','val','recur','paidTxId','paid','paidAt','fromTx','cat','due','name','recurKey','competencia'],metasCat:['meta','cat','real']};
 for(const [k,list]of Object.entries(fields)){
  const ids=new Set();for(const row of raw[k]){
   if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(f=>!list.includes(f)))throw new Error('Campo sem cobertura: '+k);
   if(k!=='metasCat'){if(row.id==null||text(row.id)===''||(k!=='ALL_TX'&&ids.has(String(row.id))))throw new Error('Identidade inválida/duplicada na origem: '+k);ids.add(String(row.id));}
  }
 }
 const e=Object.fromEntries(AUDIT_STORES.map(k=>[k,[]]));
 const seen=new Map(),identityManifest=[],groups=new Map();
 e.transactions=raw.ALL_TX.map((r,i)=>{const key=String(r.id),n=(seen.get(key)||0)+1;seen.set(key,n);const v=clone(r);if(n>1){v.legacyId=r.id;v.id=`${key}__dup${n}`;}identityManifest.push({collection:'ALL_TX',sourceIndex:i,sourceId:r.id,occurrence:n,targetId:v.id,sourceFingerprint:fingerprint(r)});if(!groups.has(key))groups.set(key,[]);groups.get(key).push({row:r,target:v,index:i});return v;});
 if(new Set(e.transactions.map(r=>String(r.id))).size!==e.transactions.length)throw new Error('Renomeio colide com outro ID; requer decisão explícita.');
 const linkManifest=[];
 raw.contas.forEach((r,i)=>{for(const key of ['fromTx','paidTxId']){if(r[key]==null||r[key]==='')continue;const candidates=groups.get(String(r[key]))||[];let chosen=null,status='UNRESOLVED';if(candidates.length===1){chosen=candidates[0];status='UNIQUE_ID';}else if(candidates.length>1){const matching=candidates.filter(t=>t.row.val===r.val&&t.row.date===r.paidAt);if(matching.length===1&&String(matching[0].target.id)===String(r[key])){chosen=matching[0];status='UNIQUE_AMOUNT_PAID_DATE';}else status='AMBIGUOUS';}linkManifest.push({accountIndex:i,field:key,sourceReference:r[key],status,candidateIndexes:candidates.map(t=>t.index),targetId:chosen?.target.id??null});}});
 const sourceLinksValid=linkManifest.every(r=>!['UNRESOLVED','AMBIGUOUS'].includes(r.status));
e.accounts=raw.contas.map(r=>({...clone(r),category:r.cat??''}));e.clients=raw.clientes.map(r=>({...clone(r),name:r.nome??''}));e.jobs=raw.jobs.map(r=>({...clone(r),budgetId:null}));
 e.goals=raw.metasCat.map((r,i)=>({...clone(r),id:`goal_${i+1}`,category:r.cat}));
 e.workOrders=raw.jobs.map((r,i)=>({id:`os_${r.id}`,legacyJobId:r.id,number:`OS-${String(i+1).padStart(4,'0')}`,budgetId:null,clientId:e.clients.find(c=>text(c.name).toLocaleLowerCase('pt-BR')===text(r.cliente).toLocaleLowerCase('pt-BR')&&text(r.cliente))?.id??null,vehicleId:null,stage:r.done===true?'entregue':'entrada',status:r.done===true?'Entregue':'Agendada',priority:'Normal',entryDate:date(r.entrada),dueDate:date(r.entrega),value:Number(r.val??0),clientName:text(r.cliente),vehicle:text(r.veiculo),service:text(r.tipo),notes:text(r.obs),createdAt:null,updatedAt:r.updatedAt??null}));
 e.appointments=raw.jobs.map((r,i)=>({...clone(r),budgetId:null,id:`ag_${r.id}`,legacyJobId:r.id,workOrderId:e.workOrders[i].id,clientId:e.workOrders[i].clientId,date:date(r.entrada),dueDate:date(r.entrega),time:'08:00',type:text(r.tipo??'Entrada'),status:r.done===true?'Concluído':'Agendado',clientName:text(r.cliente),vehicle:text(r.veiculo),service:text(r.tipo),value:Number(r.val??0),notes:text(r.obs)}));
 e.settings=['metaPrincipal','nextTxId','dasStatus'].flatMap(k=>[{id:k,value:clone(raw[k])},{id:{metaPrincipal:'fp_meta_principal',nextTxId:'fp_next_tx_id',dasStatus:'fp_das_status'}[k],value:clone(raw[k])}]);
 return {expected:e,identityManifest,linkManifest,sourceLinksValid,sourceDuplicateOccurrences:identityManifest.filter(r=>r.occurrence>1).length,fieldCoveragePass:true,authorizedTechnicalDerivedCount:e.workOrders.length+e.appointments.length,provenance:raw.jobs.map((r,i)=>({collection:'jobs',index:i,id:r.id,workOrderId:e.workOrders[i].id,appointmentId:e.appointments[i].id}))};
}
function bag(rows){const m=new Map();for(const row of rows){const f=fingerprint(row);m.set(f,(m.get(f)||0)+1);}return m;}
export function compareExpected(project,actual){
 let derivedCount=0,missingExpectedCount=0;const byStore={};
 for(const k of AUDIT_STORES){if(!Array.isArray(actual[k]))throw new Error('Store ausente: '+k);const e=bag(project.expected[k]),a=bag(actual[k]);let extra=0,missing=0;for(const f of new Set([...e.keys(),...a.keys()])){extra+=Math.max((a.get(f)||0)-(e.get(f)||0),0);missing+=Math.max((e.get(f)||0)-(a.get(f)||0),0);}const differences=[...new Set([...e.keys(),...a.keys()])].filter(f=>(e.get(f)||0)!==(a.get(f)||0)).map(f=>({fingerprint:f,expected:e.get(f)||0,actual:a.get(f)||0}));byStore[k]={derivedCount:extra,missingExpectedCount:missing,differences};derivedCount+=extra;missingExpectedCount+=missing;}
 const settings=actual.settings||[];const settingsPreserved=project.expected.settings.every(r=>settings.some(a=>fingerprint(a)===fingerprint(r)));
 const metadata=actual.meta||[];const metadataValid=metadata.some(r=>r.id==='schema'&&r.value==='oficinaos-modular-v5')&&metadata.some(r=>r.id==='migrationSource'&&r.value==='1.0')&&metadata.some(r=>r.id==='migratedAt'&&typeof r.value==='string'&&Number.isFinite(Date.parse(r.value)));
 return {derivedCount,missingExpectedCount,byStore,fieldCoveragePass:project.fieldCoveragePass,settingsPreserved,metadataValid,sourceLinksValid:project.sourceLinksValid,sourceDuplicateOccurrences:project.sourceDuplicateOccurrences,authorizedTechnicalDerivedCount:project.authorizedTechnicalDerivedCount,pass:derivedCount===0&&missingExpectedCount===0&&settingsPreserved&&metadataValid&&project.fieldCoveragePass&&project.sourceLinksValid};
}
