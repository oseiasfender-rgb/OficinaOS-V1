import {budgetStockPlan} from '../../modules/orcamento/budget-stock.js';
import {applyConsumption,returnConsumption} from '../../modules/orcamento/stock-consumption.js';
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
  Object.defineProperty(repositories,'recordStockConsumption',{value:async ({osId,input,at,movementId,returning=false})=>{
    const tx=db.transaction(['stock','settings','workOrders'],'readwrite'),done=transactionDone(tx);
    try {
      const os=await requestToPromise(tx.objectStore('workOrders').get(osId));
      if(!os)throw Error('OS não encontrada.');
      const key=`os_execution:${osId}`;
      const execution=(await requestToPromise(tx.objectStore('settings').get(key)))?.value;
      const stockId=returning?execution?.materials.find(m=>m.id===input.consumptionId)?.stockId:input.stockId;
      if(stockId==null)throw Error('Selecione o material do estoque.');
      const stock=await requestToPromise(tx.objectStore('stock').get(stockId));
      const result=(returning?returnConsumption:applyConsumption)({stock,execution,osId,input,at,movementId});
      if(result.changed){tx.objectStore('stock').put(result.stock);tx.objectStore('settings').put({id:key,value:result.execution});}
      await done;return result.entry;
    }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  }});
  Object.defineProperty(repositories,'saveBudgetWithStock',{value:async(record)=>{
    const tx=db.transaction(['budgets','stock','settings'],'readwrite'),done=transactionDone(tx);
    try {
      const budgets=tx.objectStore('budgets'),stocks=tx.objectStore('stock'),settings=tx.objectStore('settings');
      const [previous,rows,catalog]=await Promise.all([requestToPromise(budgets.get(record.id)),requestToPromise(stocks.getAll()),requestToPromise(settings.get('fp_pecas_rec'))]);
      if(previous && previous.updatedAt!==record.stockExpectedUpdatedAt)throw Error('Orçamento alterado em outra operação. Reabra antes de salvar.');
      const result=budgetStockPlan(record,previous,rows,catalog?.value||[]);
      delete result.record.stockExpectedUpdatedAt;
      budgets.put(result.record);
      for(const movement of result.movements)if(movement.kind==='material')stocks.put(result.stock.find(r=>String(r.id)===String(movement.itemId)));
      if(result.movements.some(m=>m.kind==='part'))settings.put({...catalog,id:'fp_pecas_rec',value:result.catalog,updatedAt:record.updatedAt});
      if(result.movements.length)settings.put({id:`budget_stock:${record.id}:${crypto.randomUUID()}`,value:{budgetId:record.id,at:record.updatedAt,movements:result.movements}});
      await done;return result.record;
    }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  }});
  return Object.freeze(repositories);
}
