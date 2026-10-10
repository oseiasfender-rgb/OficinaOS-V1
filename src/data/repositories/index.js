import { STORES } from '../schema.js';
import { createBaseRepository } from './base-repository.js';
import { requestToPromise, transactionDone } from '../indexeddb.js';

export function createRepositories(db) {
  const repositories = {};
  for (const name of STORES) repositories[name] = createBaseRepository(db, name);
  // A recuperação e o registro da origem são gravados juntos; duas abas
  // não podem restaurar o mesmo ID nem sobrescrever um orçamento existente.
  Object.defineProperty(repositories, 'recoverDeletedBudget', {value: async (backupId, item, at) => {
    const tx = db.transaction(['budgets','archivedBudgets','trash','deletionBackups','deletionLog'], 'readwrite');
    const done = transactionDone(tx);
    try {
      const [backup, ...buckets] = await Promise.all([
        requestToPromise(tx.objectStore('deletionBackups').get(backupId)),
        ...['budgets','archivedBudgets','trash'].map(name => requestToPromise(tx.objectStore(name).getAll()))
      ]);
      if (!backup || backup.recoveredAt) throw new Error('Esta cópia já foi recuperada ou não está disponível.');
      if (buckets.some(rows => rows.some(row => String(row.id) === String(item.id)))) throw new Error('Já existe um orçamento com este ID em Ativos, Arquivados ou Lixeira.');
      tx.objectStore('budgets').add(structuredClone(item));
      tx.objectStore('deletionBackups').put({...backup,recoveredAt:at,recoveredEntityId:item.id});
      const logs = await requestToPromise(tx.objectStore('deletionLog').getAll());
      for (const row of logs) if (row.backupId === backupId) tx.objectStore('deletionLog').put({...row,recoveredAt:at});
      await done;
    } catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
  }});
  return Object.freeze(repositories);
}
