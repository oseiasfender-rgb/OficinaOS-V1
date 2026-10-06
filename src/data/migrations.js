import { LEGACY_DB_NAME, LEGACY_KV_STORE, parseLegacyValue, canonicalFromLegacy } from './legacy-compat.js';
import { STATE_STORES } from './schema.js';
import { requestToPromise, transactionDone } from './indexeddb.js';

export async function listDatabaseNames() {
  if (!indexedDB.databases) return [];
  const dbs = await indexedDB.databases();
  return dbs.map(db => db.name).filter(Boolean);
}

export async function legacyDatabaseAvailable() {
  const names = await listDatabaseNames();
  return names.includes(LEGACY_DB_NAME);
}

function openExistingLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir banco legado.'));
  });
}

export async function readLegacyDatabase() {
  if (!(await legacyDatabaseAvailable())) return null;
  const db = await openExistingLegacyDatabase();
  try {
    if (!db.objectStoreNames.contains(LEGACY_KV_STORE)) return null;
    const rows = await requestToPromise(db.transaction(LEGACY_KV_STORE, 'readonly').objectStore(LEGACY_KV_STORE).getAll());
    const payload = {};
    for (const row of rows) {
      if (!row || row.key == null) continue;
      payload[row.key] = parseLegacyValue(row.value, row.value);
    }
    return payload;
  } finally {
    db.close();
  }
}

function validateCanonicalRecords(snapshot, stores) {
  for (const name of stores) {
    const list = snapshot[name] || [];
    if (!Array.isArray(list)) throw new TypeError(`Store ${name} inválido: esperado array.`);
    const ids = new Set();
    for (const record of list) {
      if (!record || typeof record !== 'object' || record.id == null || String(record.id).trim() === '') {
        throw new Error(`Registro inválido em ${name}: id ausente.`);
      }
      const id = String(record.id);
      if (ids.has(id)) throw new Error(`ID duplicado em ${name}: ${id}`);
      ids.add(id);
    }
  }
}

export async function replaceDatabaseFromCanonical(db, canonical) {
  const stores = [...STATE_STORES, 'settings', 'meta'];
  validateCanonicalRecords(canonical, stores);
  const transaction = db.transaction(stores, 'readwrite');
  for (const name of stores) {
    const target = transaction.objectStore(name);
    target.clear();
    for (const record of canonical[name] || []) target.put(structuredClone(record));
  }
  await transactionDone(transaction);
  return true;
}

export async function importLegacyPayload(db, payload) {
  const canonical = canonicalFromLegacy(payload);
  await replaceDatabaseFromCanonical(db, canonical);
  return canonical;
}

export async function migrateSameOriginLegacyDatabase(db) {
  const legacy = await readLegacyDatabase();
  if (!legacy) return { migrated: false, reason: 'legacy-not-found' };
  const canonical = await importLegacyPayload(db, legacy);
  return { migrated: true, source: LEGACY_DB_NAME, canonical };
}
