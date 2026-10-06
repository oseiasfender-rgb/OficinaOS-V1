import { assertObject } from '../../core/validators.js';
import { requestToPromise, transactionDone } from '../indexeddb.js';

export function createBaseRepository(db, storeName) {
  function store(mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  return Object.freeze({
    storeName,
    async list() { return requestToPromise(store().getAll()); },
    async count() { return requestToPromise(store().count()); },
    async get(id) { return (await requestToPromise(store().get(id))) ?? null; },
    async put(record) {
      assertObject(record);
      if (record.id == null || String(record.id).trim() === '') throw new Error(`Registro de ${storeName} sem id.`);
      const clone = structuredClone(record);
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(clone);
      await transactionDone(transaction);
      return clone;
    },
    async putMany(records = []) {
      if (!Array.isArray(records)) throw new TypeError('putMany requer um array.');
      const transaction = db.transaction(storeName, 'readwrite');
      const target = transaction.objectStore(storeName);
      for (const record of records) {
        assertObject(record);
        if (record.id == null || String(record.id).trim() === '') throw new Error(`Registro de ${storeName} sem id.`);
        target.put(structuredClone(record));
      }
      await transactionDone(transaction);
      return records.length;
    },
    async replaceAll(records = []) {
      if (!Array.isArray(records)) throw new TypeError('replaceAll requer um array.');
      const transaction = db.transaction(storeName, 'readwrite');
      const target = transaction.objectStore(storeName);
      target.clear();
      for (const record of records) {
        assertObject(record);
        if (record.id == null || String(record.id).trim() === '') throw new Error(`Registro de ${storeName} sem id.`);
        target.put(structuredClone(record));
      }
      await transactionDone(transaction);
      return records.length;
    },
    async delete(id) {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(id);
      await transactionDone(transaction);
      return true;
    },
    async clear() {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
      return true;
    }
  });
}
