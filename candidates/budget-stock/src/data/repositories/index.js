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
    const tx=db.transaction(['stock','settings','workOrders','budgets'],'readwrite'),done=transactionDone(tx);
    try {
      const os=await requestToPromise(tx.objectStore('workOrders').get(osId));
      if(!os)throw Error('OS não encontrada.');
      const key=`os_execution:${osId}`;
      const execution=(await requestToPromise(tx.objectStore('settings').get(key)))?.value;
      const stockId=returning?execution?.materials.find(m=>m.id===input.consumptionId)?.stockId:input.stockId;
      if(stockId==null)throw Error('Selecione o material do estoque.');
      const stock=await requestToPromise(tx.objectStore('stock').get(stockId));
      const budget=os.budgetId==null?null:await requestToPromise(tx.objectStore('budgets').get(os.budgetId));
      if(os.budgetId!=null&&!budget)throw Error('Orçamento da OS não está ativo. Revise o vínculo antes de movimentar estoque.');
      const claimKey=budget?`budget_stock_claims:${budget.id}`:null;
      const claims=claimKey?(await requestToPromise(tx.objectStore('settings').get(claimKey)))?.value||{}:{};
      const allocationKey=`material:${stockId}`;
      const prepaid=returning?0:Math.min(input.qty,Math.max(0,(budget?.stockAllocation?.held?.[allocationKey]||0)-(claims[allocationKey]||0)));
      const result=(returning?returnConsumption:applyConsumption)({stock,execution,osId,input,at,movementId,prepaid});
      if(result.changed&&prepaid){claims[allocationKey]=Number(((claims[allocationKey]||0)+prepaid).toFixed(9));tx.objectStore('settings').put({id:claimKey,value:claims,updatedAt:at});}
      if(result.changed){tx.objectStore('stock').put(result.stock);tx.objectStore('settings').put({id:key,value:result.execution});}
      await done;return result.entry;
    }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  }});
  Object.defineProperty(repositories,'reviseBudgetWithStock',{value:async(sourceId,next)=>{
    const tx=db.transaction(['budgets','settings','workOrders'],'readwrite'),done=transactionDone(tx);
    try{
      const budgets=tx.objectStore('budgets'),settings=tx.objectStore('settings');
      const source=await requestToPromise(budgets.get(sourceId));
      if(!source)throw Error('Orçamento original não encontrado.');
      const claims=(await requestToPromise(settings.get(`budget_stock_claims:${sourceId}`)))?.value||{};
      const orders=await requestToPromise(tx.objectStore('workOrders').getAll());
      if(Object.values(claims).some(q=>q>0)||orders.some(o=>String(o.budgetId)===String(sourceId)))throw Error('Orçamento com baixa vinculado à execução: revise o consumo na OS antes de criar outra revisão.');
      next={...next,stockAllocation:structuredClone(source.stockAllocation)};
      budgets.put({...source,stockAllocation:{...source.stockAllocation,held:{}},stockAllocationTransferredTo:next.id});
      budgets.add(next);
      settings.put({id:`budget_stock_transfer:${next.id}`,value:{from:sourceId,to:next.id,at:next.updatedAt,held:source.stockAllocation?.held||{}}});
      await done;return next;
    }catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
  }});
  Object.defineProperty(repositories,'saveBudgetWithStock',{value:async(record)=>{
    const tx=db.transaction(['budgets','stock','settings','workOrders'],'readwrite'),done=transactionDone(tx);
    try {
      const budgets=tx.objectStore('budgets'),stocks=tx.objectStore('stock'),settings=tx.objectStore('settings');
      const [previous,rows,catalog]=await Promise.all([requestToPromise(budgets.get(record.id)),requestToPromise(stocks.getAll()),requestToPromise(settings.get('fp_pecas_rec'))]);
      if(previous && previous.updatedAt!==record.stockExpectedUpdatedAt)throw Error('Orçamento alterado em outra operação. Reabra antes de salvar.');
      const result=budgetStockPlan(record,previous,rows,catalog?.value||[]);
      if(result.movements.length){
        const orders=await requestToPromise(tx.objectStore('workOrders').getAll());
        if(orders.some(o=>String(o.budgetId)===String(record.id)))throw Error('Orçamento vinculado à OS: registre consumo ou devolução na execução, sem alterar a baixa do orçamento.');
      }
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
