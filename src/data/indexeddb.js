import { DB_NAME, DB_VERSION, STORE_DEFINITIONS } from './schema.js';

function ensureIndexes(store, indexes = []) {
  for (const [name, keyPath, options = {}] of indexes) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
  }
}

export function createDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const upgradeTx = request.transaction;
      for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
        const store = db.objectStoreNames.contains(name)
          ? upgradeTx.objectStore(name)
          : db.createObjectStore(name, { keyPath: definition.keyPath });
        ensureIndexes(store, definition.indexes);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.addEventListener('versionchange', () => db.close());
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB modular.'));
    request.onblocked = () => console.warn('[OficinaOS] Upgrade do IndexedDB bloqueado por outra aba aberta.');
  });
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha em requisição IndexedDB.'));
  });
}

export function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha em transação IndexedDB.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transação IndexedDB abortada.'));
  });
}
