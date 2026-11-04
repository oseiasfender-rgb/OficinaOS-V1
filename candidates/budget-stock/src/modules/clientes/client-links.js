export const CLIENT_LINK_STORES=Object.freeze(['budgets','budgetHistory','archivedBudgets','trash','workOrders','appointments','jobs','transactions','accounts']);

export function hasClientReference(rows,id){
  return rows.some(row=>[row,row?.payload,row?.snapshot].some(value=>
    value&&[value.clientId,value.clienteId].some(key=>key!=null&&String(key)!==''&&String(key)===String(id))));
}
