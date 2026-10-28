// Executado dentro de uma única transação de estoque + execução.
export function applyConsumption({stock, execution, osId, input, at, movementId, prepaid=0}) {
  const e=structuredClone(execution||{schemaVersion:1,workOrderId:osId,times:[],materials:[],expenses:[],profile:{}});
  const existing=e.materials.find(m=>m.requestId===input.requestId);
  if(existing)return {execution:e,stock,entry:existing,changed:false};
  if(!stock)throw Error('Material não encontrado no estoque.');
  const unit=String(stock.unid||'Un');
  if(input.unit!==unit)throw Error('Unidade diferente do estoque. Conversão automática não disponível.');
  const balance=Number(stock.qty);
  if(!Number.isFinite(prepaid)||prepaid<0||prepaid>input.qty)throw Error('Vínculo de baixa do orçamento inválido.');
  const debit=Number((input.qty-prepaid).toFixed(9));
  if(!Number.isFinite(balance)||balance<debit)throw Error('Saldo de estoque insuficiente.');
  const entry={...input,id:movementId,stockId:stock.id,name:stock.nome||stock.name,unit,at,stockMovementId:movementId,budgetPrepaidQty:prepaid,stockDebitedQty:debit,returns:[]};
  e.materials.push(entry);e.updatedAt=at;
  return {execution:e,stock:{...stock,qty:Number((balance-debit).toFixed(9)),updatedAt:at},entry,changed:true};
}
export function returnConsumption({stock,execution,input,at,movementId}){
  const e=structuredClone(execution),m=e?.materials.find(r=>r.id===input.consumptionId);
  if(!m?.stockMovementId)throw Error('Consumo sem baixa vinculada.');
  const existing=(m.returns||[]).find(r=>r.requestId===input.requestId);
  if(existing)return {execution:e,stock,entry:existing,changed:false};
  if(!stock||String(stock.id)!==String(m.stockId))throw Error('Material original não encontrado no estoque.');
  const returned=(m.returns||[]).reduce((s,r)=>s+r.qty,0);
  if(input.qty>Number((m.qty-returned).toFixed(9)))throw Error('Devolução maior que o consumo restante.');
  const entry={...input,id:movementId,at};m.returns??=[];m.returns.push(entry);e.updatedAt=at;
  return {execution:e,stock:{...stock,qty:Number((Number(stock.qty)+input.qty).toFixed(9)),updatedAt:at},entry,changed:true};
}
