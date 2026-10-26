import {previewMissingRestore,applyMissingRestore} from './restore-plan.js';
// Synchronizes complete, consistent database snapshots. Divergent snapshots
// require review instead of silently merging financial or workflow records.
import {mergeRecords,recordChanges} from './record-merge.js';
export class SyncConflict extends Error {
  constructor(message = 'PC e celular têm alterações diferentes. Ambas foram preservadas.') {
    super(message); this.name = 'SyncConflict';
  }
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function snapshotIdentity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.stores || Array.isArray(snapshot.stores)) throw Error('Cópia inválida.');
  const stores = {};
  for (const [name, rows] of Object.entries(snapshot.stores)) {
    if (!Array.isArray(rows)) throw Error(`Coleção inválida: ${name}`);
    const seen = new Set();
    stores[name] = rows.map(row => {
      if (!row || !['string','number'].includes(typeof row.id) || String(row.id).trim() === '') throw Error(`Registro sem identidade em ${name}.`);
      const key = typeof row.id + ':' + row.id;
      if (seen.has(key)) throw Error(`Identidade duplicada em ${name}.`);
      seen.add(key); return row;
    }).sort((a,b) => (typeof a.id+':'+a.id).localeCompare(typeof b.id+':'+b.id));
  }
  return stable({schema:snapshot.schema,stores});
}

export function createSyncEngine({local, remote, metadata, userId, namespace, uuid = () => crypto.randomUUID(), onState = () => {}}) {
  if (!userId || !['homologacao','producao','homologacao_v2'].includes(namespace)) throw Error('Conta e ambiente de sincronização são obrigatórios.');
  const key = `${userId}:${namespace}`;
  let running = false;
  function removalConflicts(base,current){
    return recordChanges(base,current).filter(c=>c.collection==='budgets'&&c.operation==='delete'&&
      !['trash','archivedBudgets'].some(store=>(current.stores[store]??[]).some(row=>typeof row.id===typeof c.before.id&&row.id===c.before.id)))
      .map(c=>({collection:c.collection,key:c.key,reason:'unconfirmed-removal',base:c.before,local:null,remote:c.before}));
  }
  async function confirmed(status,revision,identity){
    // A successful HTTP write is not evidence that the current local database
    // still matches the server. Verify content, not only a cached revision.
    const cloud=await remote.read({namespace});
    const current=await local.read();
    if(snapshotIdentity(current)!==identity)return report('waiting-for-local-write');
    if(!cloud||!Number.isSafeInteger(cloud.revision)||cloud.revision<revision)throw Error('Não foi possível confirmar o conteúdo da nuvem.');
    if(snapshotIdentity(cloud.payload)!==identity){
      if(cloud.revision>revision)return report('remote-changed',cloud.revision);
      throw new SyncConflict('Conteúdo remoto diferente na mesma revisão. Nenhum envio adicional foi autorizado.');
    }
    const result={status,revision:cloud.revision,namespace,budgetCount:current.stores.budgets?.length??0,verified:true};
    onState(result);return result;
  }
  async function tick() {
    if (running) return {status:'busy'};
    running = true;
    try {
      // The local adapter must enforce a cross-tab lock during read/apply.
      return await local.withLock(async () => {
        const current = await local.read(); const identity = snapshotIdentity(current);
        const saved = await metadata.get(key);
        const cloud = await remote.read({namespace});
        if (!saved) {
          // Never treat the first device's existing data as an empty baseline.
          const identical = cloud && snapshotIdentity(cloud.payload) === identity;
          if (identical) {
            await metadata.set(key,{revision:cloud.revision,identity});
            return confirmed('synced',cloud.revision,identity);
          }
          return report('initial-choice-required');
        }
        if (!cloud && saved.revision > 0) throw Error('A base remota desapareceu. Nenhum dado local foi substituído.');
        const localChanged = identity !== saved.identity || saved.pending?.identity === identity;
        const remoteRevision = cloud?.revision ?? 0;
        if (!Number.isSafeInteger(remoteRevision) || remoteRevision < saved.revision) throw Error('Revisão remota inválida ou retrocedida.');
        if(remoteRevision===saved.revision&&cloud&&snapshotIdentity(cloud.payload)!==saved.identity){
          throw new SyncConflict('Conteúdo remoto diferente da base confirmada na mesma revisão. Exporte as cópias e revise o vínculo.');
        }
        const baseForRemoval=JSON.parse(saved.identity);
        const missing=[...removalConflicts(baseForRemoval,current),...(cloud?removalConflicts(baseForRemoval,cloud.payload):[])];
        if(missing.length){await metadata.set(`${key}:conflicts`,{revision:remoteRevision,localIdentity:identity,conflicts:missing});return report('conflict');}
        if (remoteRevision !== saved.revision) {
          const incoming = snapshotIdentity(cloud.payload);
          if (incoming === identity) {
            await metadata.set(key,{revision:remoteRevision,identity});
            return confirmed('synced',remoteRevision,identity);
          }
          if (localChanged) {
            let base;
            try{base=JSON.parse(saved.identity);}catch{throw Error('Base comum indisponível. Exporte as duas cópias antes de continuar.');}
            const merged=mergeRecords(base,current,cloud.payload);
            if(merged.conflicts.length){
              await metadata.set(`${key}:conflicts`,{revision:remoteRevision,localIdentity:identity,conflicts:merged.conflicts});
              return report('conflict');
            }
            if(!await local.canApply())return report('waiting-for-editor');
            await local.backup(current,{reason:'before-record-merge'});
            if(snapshotIdentity(await local.read())!==identity)return report('waiting-for-local-write');
            const mergedIdentity=snapshotIdentity(merged.snapshot);
            // Persist the queue BEFORE local apply. The acknowledged base stays
            // remote, so failure/restart cannot mistake unsent changes as sent.
            await metadata.set(`${key}:outbox`,{baseRevision:remoteRevision,changes:recordChanges(cloud.payload,merged.snapshot)});
            await local.apply(merged.snapshot,identity);
            await metadata.set(key,{revision:remoteRevision,identity:incoming});
            return report('merged-pending-upload',remoteRevision);
          }
          if (!await local.canApply()) return report('waiting-for-editor');
          await local.backup(current,{reason:'before-cloud-apply'});
          // Guard against writes that arrived while the backup was persisted.
          if (snapshotIdentity(await local.read()) !== identity) return report('waiting-for-local-write');
          await local.apply(cloud.payload,identity); // atomic adapter operation
          await metadata.set(key,{revision:remoteRevision,identity:incoming});
          return confirmed('downloaded',remoteRevision,incoming);
        }
        if (!localChanged) return confirmed('synced',remoteRevision,identity);
        const pending = saved.pending?.identity === identity ? saved.pending : {id:uuid(),identity};
        await metadata.set(key,{...saved,pending});
        const result = await remote.commit({namespace,baseRevision:saved.revision,operationId:pending.id,payload:current});
        if (!Number.isSafeInteger(result.revision) || result.revision !== saved.revision+1) throw Error('Confirmação remota inválida.');
        await metadata.set(key,{revision:result.revision,identity});
        return confirmed('uploaded',result.revision,identity);
      });
    } catch (error) {
      if (error instanceof SyncConflict) return report('conflict');
      onState({status:'error',message:error.message}); throw error;
    } finally { running = false; }
  }
  function report(status,revision) { const result={status,...(revision===undefined?{}:{revision})};onState(result);return result; }
  // Explicit initial enrollment after the user chooses the source device.
  async function enrollFromLocal() {
    return local.withLock(async()=>{
      const current=await local.read(); const identity=snapshotIdentity(current);
      if(await remote.read({namespace})) throw new SyncConflict('Já existem dados na nuvem. A primeira publicação não pode substituí-los.');
      // Pending operation survives a timeout immediately after server commit.
      const old=await metadata.get(key);
      const pending=old?.pending?.identity===identity?old.pending:{id:uuid(),identity};
      await metadata.set(key,{revision:0,identity,pending});
      const result=await remote.commit({namespace,baseRevision:0,operationId:pending.id,payload:current});
      if(result.revision!==1)throw Error('Primeira revisão remota inválida.');
      await metadata.set(key,{revision:1,identity});return confirmed('uploaded',1,identity);
    });
  }
  async function enrollFromCloud() {
    return local.withLock(async()=>{
      const cloud=await remote.read({namespace});
      if(!cloud)throw Error('Ainda não há dados na nuvem. Publique primeiro pelo aparelho de origem.');
      const incoming=snapshotIdentity(cloud.payload), current=await local.read();
      const identity=snapshotIdentity(current);
      const saved=await metadata.get(key);
      if(!saved&&(current.stores.budgets??[]).some(row=>!(cloud.payload.stores.budgets??[]).some(remoteRow=>remoteRow.id===row.id&&typeof remoteRow.id===typeof row.id)))throw new SyncConflict('Primeira vinculação bloqueada: este aparelho tem orçamentos próprios ausentes da nuvem. Exporte as duas cópias antes de combinar.');
      if(saved&&removalConflicts(JSON.parse(saved.identity),cloud.payload).length)throw new SyncConflict('A cópia remota remove orçamento sem registro de exclusão. Recebimento bloqueado; preserve as versões.');
      if(saved&&identity!==saved.identity&&incoming!==identity)throw new SyncConflict('Há alterações locais não enviadas. Receber a base inteira foi bloqueado; preserve e compare as duas versões.');
      await local.backup(current,{reason:'before-explicit-cloud-receive'});
      await local.apply(cloud.payload,identity);
      await metadata.set(key,{revision:cloud.revision,identity:incoming});return confirmed('downloaded',cloud.revision,incoming);
    });
  }
  async function inspectConflicts(){
    const saved=await metadata.get(key);if(!saved)throw Error('Aparelho ainda não vinculado.');
    const current=await local.read(),cloud=await remote.read({namespace});
    if(!cloud)throw Error('Cópia remota indisponível.');
    const base=JSON.parse(saved.identity),result=mergeRecords(base,current,cloud.payload);result.conflicts.push(...removalConflicts(base,current),...removalConflicts(base,cloud.payload));
    return {revision:cloud.revision,localIdentity:snapshotIdentity(current),conflicts:result.conflicts};
  }
  async function resolveConflicts(review,choices){
    return local.withLock(async()=>{
      const saved=await metadata.get(key),current=await local.read(),identity=snapshotIdentity(current),cloud=await remote.read({namespace});
      if(!saved||!cloud||review.revision!==cloud.revision||review.localIdentity!==identity)throw new SyncConflict('As versões mudaram. Consulte a comparação novamente.');
      const base=JSON.parse(saved.identity),result=mergeRecords(base,current,cloud.payload);result.conflicts.push(...removalConflicts(base,current),...removalConflicts(base,cloud.payload));
      let reservedSequence=0;
      for(const c of result.conflicts){
        if(c.reason==='duplicate-document-number'){
          const duplicateChoice=choices[`budgets/${c.key}`];
          if(!['remote','keep-both'].includes(duplicateChoice))throw new SyncConflict('Escolha como resolver a duplicidade.');
          const matching=rows=>rows.filter(r=>String(r.numero??r.number??'')===c.key);
          const localRows=matching(current.stores.budgets??[]),remoteRows=matching(cloud.payload.stores.budgets??[]);
          if(localRows.length!==1||remoteRows.length!==1||localRows[0].id===remoteRows[0].id||localRows[0].approval||remoteRows[0].approval||(base.stores.budgets??[]).some(r=>r.id===localRows[0].id))throw new SyncConflict('A duplicidade exige revisão manual; dados preservados.');
          const dropped=localRows[0].id;
          const containsId=value=>value===dropped||(Array.isArray(value)?value.some(containsId):value&&typeof value==='object'?Object.values(value).some(containsId):false);
          for(const side of [current,cloud.payload])for(const store of ['transactions','accounts','workOrders','appointments','checklists','jobs','budgetHistory','archivedBudgets','trash','deletionLog'])if((side.stores[store]??[]).some(containsId))throw new SyncConflict('Orçamento possui vínculos ou cópias de exclusão; revisão manual necessária.');
          if(duplicateChoice==='keep-both'){
            if(!/^orc_\d+$/i.test(c.key))throw new SyncConflict('Numeração fora do padrão exige revisão manual.');
            let max=reservedSequence;
            const scan=value=>{
              if(Array.isArray(value)){for(const item of value)scan(item);return;}
              if(value&&typeof value==='object'){
                for(const [key,item] of Object.entries(value)){
                  if((key==='numero'||key==='number')&&typeof item==='string'&&/^orc_\d+$/i.test(item))max=Math.max(max,Number(item.slice(4)));
                  else if(key==='id'&&item==='budget_document_sequence')max=Math.max(max,Number(value.value)||0);
                  else if(typeof item==='object'&&item!==null)scan(item);
                }
              }
            };
            for(const snap of [base,current,cloud.payload,result.snapshot])scan(snap.stores);
            if(!Number.isSafeInteger(max)||max>=Number.MAX_SAFE_INTEGER)throw new SyncConflict('Sequência inválida; revisão manual necessária.');
            reservedSequence=max+1;const newNumber=`orc_${String(reservedSequence).padStart(3,'0')}`;
            const row=result.snapshot.stores.budgets.find(r=>r.id===dropped);
            if(!row)throw new SyncConflict('Orçamento local não encontrado; revisão manual necessária.');
            row.numero=newNumber;if('number' in row)row.number=newNumber;
          }else{
            // Existing deletion backups remain merged verbatim.
            result.snapshot.stores.budgets=result.snapshot.stores.budgets.filter(r=>r.id!==dropped);
          }
          continue;
        }
        if(!['concurrent-edit','concurrent-create','delete-versus-edit'].includes(c.reason))throw new SyncConflict('Conflito de numeração ou operação vinculada exige revisão no módulo de origem. Exporte as duas cópias.');
        const selection=choices[`${c.collection}/${c.key}`];if(!['local','remote'].includes(selection))throw Error('Escolha uma versão para cada registro.');
        // Never turn a generic synchronization decision into payment, stock,
        // execution or approved-commercial revision authorization.
        if(['transactions','accounts','workOrders','appointments','stock','checklists','recurringTemplates'].includes(c.collection)||c.base?.approval||c.local?.approval||c.remote?.approval)throw new SyncConflict('Registro financeiro, aprovado ou de execução exige revisão no módulo de origem.');
        const selected=c[selection];
        result.snapshot.stores[c.collection]=result.snapshot.stores[c.collection].filter(r=>(typeof r.id+':'+r.id)!==c.key);
        if(selected!==null)result.snapshot.stores[c.collection].push(selected);
      }
      if(reservedSequence){
        const settings=result.snapshot.stores.settings;
        if(!Array.isArray(settings))throw new SyncConflict('Configuração de sequência indisponível; revisão manual necessária.');
        const existing=settings.find(r=>r.id==='budget_document_sequence');
        if(existing)existing.value=Math.max(Number(existing.value)||0,reservedSequence);
        else settings.push({id:'budget_document_sequence',value:reservedSequence});
      }
      // An incoming deletion can race a write to a related record. No UI may
      // apply while another view has unsaved edits.
      if(!await local.canApply())return report('waiting-for-editor');
      await local.backup(current,{reason:'before-conflict-resolution'});
      if(snapshotIdentity(await local.read())!==identity)return report('waiting-for-local-write');
      await metadata.set(`${key}:outbox`,{baseRevision:cloud.revision,changes:recordChanges(cloud.payload,result.snapshot)});
      await local.apply(result.snapshot,identity);
      await metadata.set(key,{revision:cloud.revision,identity:snapshotIdentity(cloud.payload)});
      return report('merged-pending-upload',cloud.revision);
    });
  }
  async function checkpoint(){
    return local.withLock(async()=>{
      const saved=await metadata.get(key);if(!saved)return {count:0};
      const current=await local.read(),base=JSON.parse(saved.identity);
      const changes=recordChanges(base,current);
      await metadata.set(`${key}:outbox`,{baseRevision:saved.revision,changes});
      return {count:changes.length};
    });
  }
  async function previewRestore(historical){return previewMissingRestore(await local.read(),historical);}
  async function restoreMissing(historical,selected,expectedIdentity){
    return local.withLock(async()=>{
      
      const current=await local.read(),next=applyMissingRestore(current,historical,selected,expectedIdentity);
      if(!await local.canApply())return report('waiting-for-editor');
      await local.backup(current,{reason:'before-selected-record-restore'});
      await local.apply(next,expectedIdentity);
      const saved=await metadata.get(key);
      if(saved)await metadata.set(`${key}:outbox`,{baseRevision:saved.revision,changes:recordChanges(JSON.parse(saved.identity),next)});
      return report('restored-pending-upload');
    });
  }
  return Object.freeze({tick,enrollFromLocal,enrollFromCloud,checkpoint,inspectConflicts,resolveConflicts,previewRestore,restoreMissing});
}
