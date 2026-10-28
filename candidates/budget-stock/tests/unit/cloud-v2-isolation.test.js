import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createAuthStorage} from '../../src/data/cloud/auth-storage.js';
import {createDeviceMetadata} from '../../src/data/cloud/local-adapter.js';
import {CLOUD_PROJECT} from '../../src/data/cloud/project-config.js';
import {DB_NAME} from '../../src/data/schema.js';

test('Candidata Estoque não recupera sessão nem habilitação de V1/V2',async()=>{
 const factory=new IDBFactory();
 const old=await createAuthStorage({indexedDBImpl:factory,legacyStorage:()=>null,namespace:'homologacao'});
 await old.setItem('oficinaos-auth:homologacao','v1-session-preserved');
 const candidate=await createAuthStorage({indexedDBImpl:factory,legacyStorage:()=>null,namespace:CLOUD_PROJECT.namespace});
 assert.equal(await candidate.getItem(`oficinaos-auth:${CLOUD_PROJECT.namespace}`),null);
 const oldMeta=await new Promise((resolve,reject)=>{const req=factory.open('oficinaos_sync_device_v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('state',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 await new Promise(resolve=>{const tx=oldMeta.transaction('state','readwrite');tx.objectStore('state').put({id:`enabled:test:${CLOUD_PROJECT.namespace}`,value:true});tx.oncomplete=resolve;});
 const candidateMeta=await createDeviceMetadata(factory);
 assert.equal(await candidateMeta.get(`enabled:test:${CLOUD_PROJECT.namespace}`),null);
 assert.equal(await old.getItem('oficinaos-auth:homologacao'),'v1-session-preserved');
 assert.notEqual(DB_NAME,'oficinaos_homologacao_sync_20261021');
 assert.equal(CLOUD_PROJECT.namespace,'homologacao_estoque_v1');
 assert.notEqual(DB_NAME,'oficinaos_homologacao_sync_v2_20261023');
 const v2=await createAuthStorage({indexedDBImpl:factory,legacyStorage:()=>null,namespace:'homologacao_v2'});
 await v2.setItem('oficinaos-auth:homologacao_v2','v2-session');
 assert.equal(await candidate.getItem('oficinaos-auth:homologacao_estoque_v1'),null);
 assert.equal(await v2.getItem('oficinaos-auth:homologacao_v2'),'v2-session');
 oldMeta.close();
});
