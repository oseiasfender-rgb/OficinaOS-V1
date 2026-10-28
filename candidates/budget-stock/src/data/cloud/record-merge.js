import {confirmedPermanentDeletion} from './deletion-proof.js';
// Three-way merge against the last acknowledged common base. No wall clocks,
// last-writer-wins, array concatenation, or financial recalculation here.
const absent=Symbol('absent');
function stable(v){if(v===absent)return 'ABSENT';if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
const equal=(a,b)=>stable(a)===stable(b);
const identity=r=>typeof r.id+':'+r.id;
function map(rows){const m=new Map();for(const r of rows){if(!r||!['string','number'].includes(typeof r.id)||String(r.id).trim()==='')throw Error('Registro sem ID.');const k=identity(r);if(m.has(k))throw Error('ID duplicado.');m.set(k,r);}return m;}
export function recordChanges(base,current){
  validate(base,current);const changes=[];
  for(const name of Object.keys(base.stores).sort()){
    const b=map(base.stores[name]),c=map(current.stores[name]);
    for(const id of new Set([...b.keys(),...c.keys()])){
      const before=b.get(id)??absent,after=c.get(id)??absent;
      if(!equal(before,after))changes.push({collection:name,key:id,operation:after===absent?'delete':before===absent?'create':'update',before:before===absent?null:structuredClone(before),after:after===absent?null:structuredClone(after)});
    }
  }return changes;
}
function validate(...snapshots){
  const schema=snapshots[0]?.schema,names=Object.keys(snapshots[0]?.stores??{}).sort().join('|');
  if(!schema||!names)throw Error('Base de sincronização inválida.');
  for(const s of snapshots){if(s?.schema!==schema||Object.keys(s.stores??{}).sort().join('|')!==names)throw Error('Bases incompatíveis para combinação.');for(const rows of Object.values(s.stores)){if(!Array.isArray(rows))throw Error('Coleção inválida.');map(rows);}}
}
export function mergeRecords(base,local,remote){
  validate(base,local,remote);const stores={},conflicts=[];
  for(const name of Object.keys(base.stores).sort()){
    const b=map(base.stores[name]),l=map(local.stores[name]),r=map(remote.stores[name]);stores[name]=[];
    for(const id of [...new Set([...b.keys(),...l.keys(),...r.keys()])].sort()){
      const before=b.get(id)??absent,left=l.get(id)??absent,right=r.get(id)??absent;
      let selected;
      if(equal(left,right))selected=left;
      else if(equal(left,before))selected=right;
      else if(equal(right,before))selected=left;
      else{
        conflicts.push({collection:name,key:id,reason:left===absent||right===absent?'delete-versus-edit':before===absent?'concurrent-create':'concurrent-edit',base:before===absent?null:structuredClone(before),local:left===absent?null:structuredClone(left),remote:right===absent?null:structuredClone(right)});
        selected=left; // Provisional only: caller MUST NOT apply with conflicts.
      }
      if(selected!==absent)stores[name].push(structuredClone(selected));
    }
  }
  // Accounting, stock consumption, approvals and execution can cross records.
  // Concurrent workflows need domain review even when IDs differ.
  const protectedStores=new Set(['transactions','accounts','workOrders','appointments','checklists','stock','recurringTemplates']);
  const lc=recordChanges(base,local),rc=recordChanges(base,remote);
  const protectedChange=c=>protectedStores.has(c.collection)||(c.collection==='budgets'&&(c.before?.approval||c.after?.approval||c.before?.stockAllocation||c.after?.stockAllocation))||(c.collection==='settings'&&[c.before?.id,c.after?.id].some(id=>id==='fp_pecas_rec'||/^(os_execution:|budget_stock:|budget_stock_claims:|budget_stock_transfer:|parts_catalog_adjustment:)/.test(String(id||''))));
  if(lc.some(protectedChange)&&rc.some(protectedChange))conflicts.push({collection:'workflow',key:'linked-operations',reason:'concurrent-workflow'});
  // A documented terminal deletion may follow a restore after the common base.
  // Compare the full backed-up version so a competing edit remains a conflict.
  stores.budgets=(stores.budgets??[]).filter(row=>!confirmedPermanentDeletion(local,row)&&!confirmedPermanentDeletion(remote,row));
  // Two devices can issue the same display number while offline. Never rewrite
  // a commercial number silently, especially after approval.
  const numbers=new Map();for(const row of stores.budgets??[]){const n=String(row.numero??row.number??'');if(!n)continue;if(numbers.has(n)&&numbers.get(n)!==identity(row))conflicts.push({collection:'budgets',key:n,reason:'duplicate-document-number'});else numbers.set(n,identity(row));}
  const refs={clientId:'clients',budgetId:'budgets',workOrderId:'workOrders',contaId:'accounts',paidTxId:'transactions',fromTx:'transactions'};
  for(const [name,rows] of Object.entries(stores))for(const row of rows)for(const [field,target]of Object.entries(refs)){
    const value=row[field];if(value==null||value==='')continue;
    const existed=[base,local,remote].some(s=>(s.stores[target]??[]).some(r=>String(r.id)===String(value)));
    if(existed&&!(stores[target]??[]).some(r=>String(r.id)===String(value)))conflicts.push({collection:name,key:identity(row),reason:'linked-deletion',field,target});
  }
  return {snapshot:{schema:base.schema,stores},conflicts,localChanges:lc,remoteChanges:rc};
}
