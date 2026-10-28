import {STATE_STORES,DATA_SCHEMA} from '../schema.js';
import {transactionDone} from '../indexeddb.js';
import {snapshotIdentity,SyncConflict} from './sync-engine.js';

export const SYNC_STORES=Object.freeze([...STATE_STORES,'settings','meta']);
export function createLocalSyncAdapter({db,canApply=()=>false,onApplied=()=>{},locks=globalThis.navigator?.locks}) {
  if(!locks?.request)throw Error('Este navegador não oferece o bloqueio necessário para sincronização segura.');
  function readInTransaction(tx){
    return new Promise((resolve,reject)=>{
      const stores={};let remaining=SYNC_STORES.length;
      for(const name of SYNC_STORES){
        const request=tx.objectStore(name).getAll();
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{stores[name]=request.result;if(!--remaining)resolve({schema:DATA_SCHEMA,stores});};
      }
    });
  }
  function validate(snapshot){
    if(snapshot?.schema!==DATA_SCHEMA || Object.keys(snapshot.stores??{}).sort().join('|')!==[...SYNC_STORES].sort().join('|'))throw Error('Cópia de nuvem incompatível com este Modular.');
    snapshotIdentity(snapshot);
  }
  return Object.freeze({
    // Same lock as compound OS/financial workflows: never publish a snapshot
    // halfway through a linked operation on another tab.
    withLock:fn=>locks.request('oficinaos-workflow-write',fn),
    read:()=>readInTransaction(db.transaction(SYNC_STORES,'readonly')),
    canApply,
    async backup(snapshot,details){
      const tx=db.transaction('backups','readwrite');
      tx.objectStore('backups').put({id:`cloud_${crypto.randomUUID()}`,createdAt:new Date().toISOString(),...details,payload:structuredClone(snapshot)});
      await transactionDone(tx);
    },
    async apply(snapshot,expectedIdentity){
      validate(snapshot);
      const tx=db.transaction(SYNC_STORES,'readwrite');
      // Read and conditional replacement use the SAME IDB transaction. No write
      // from another tab can be lost between the comparison and replacement.
      const done=transactionDone(tx);done.catch(()=>{});
      await new Promise((resolve,reject)=>{
        const stores={};let remaining=SYNC_STORES.length;
        for(const name of SYNC_STORES){
          const request=tx.objectStore(name).getAll();request.onerror=()=>reject(request.error);
          request.onsuccess=()=>{
            stores[name]=request.result;if(--remaining)return;
            if(snapshotIdentity({schema:DATA_SCHEMA,stores})!==expectedIdentity){tx.abort();reject(new SyncConflict('Dados locais mudaram durante o recebimento. Nada foi substituído.'));return;}
            for(const collection of SYNC_STORES){const target=tx.objectStore(collection);target.clear();for(const row of snapshot.stores[collection])target.put(structuredClone(row));}
            resolve();
          };
        }
      });
      await done;await onApplied();
    }
  });
}

export async function createDeviceMetadata(indexedDBImpl=globalThis.indexedDB){
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDBImpl.open('oficinaos_sync_device_estoque_20261028',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('state',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return {
    get:key=>new Promise((resolve,reject)=>{const req=db.transaction('state').objectStore('state').get(key);req.onsuccess=()=>resolve(req.result?.value??null);req.onerror=()=>reject(req.error);}),
    async set(key,value){const tx=db.transaction('state','readwrite');tx.objectStore('state').put({id:key,value});await transactionDone(tx);}
  };
}
