const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export function planPartsCatalogMutation(rows,{action,row,expected,backup}){
 const next=structuredClone(rows),index=next.findIndex(r=>String(r.id)===String(row.id)),current=next[index];
 if(action==='restore'){
  if(current)return {rows:next,row:current,changed:false};
  next.push(structuredClone(row));return {rows:next,row,changed:true};
 }
 if(current){
  if(expected===undefined||!same(current,expected))throw Error('O cadastro ou saldo desta peça mudou. Cancele a edição e abra novamente para conferir a quantidade atual.');
 }else if(expected!=null)throw Error('Esta peça foi excluída. Cancele a edição e confira o catálogo.');
 if(action==='delete'){
  if(!current)return {rows:next,row:null,changed:false};
  next.splice(index,1);return {rows:next,row:current,backup:{...backup,payload:structuredClone(current)},changed:true};
 }
 if(action!=='put')throw Error('Operação de catálogo inválida.');
 if(index<0)next.push(structuredClone(row));else next[index]=structuredClone(row);
 return {rows:next,row:structuredClone(row),changed:true};
}
