import {num,addMonths,uid} from '../utils/format.js?v=546113';
const MULT={Básico:1.0,Médio:1.2,Alto:1.5,Restauração:2.0};
export function calcularOrcamento(o){
 const horas=Object.values(o.horas||{}).reduce((s,v)=>s+num(v),0);
 const mo=horas*num(o.valorHora);
 const materiais=(o.materiais||[]).reduce((s,m)=>s+num(m.aplicado),0);
 const pecas=(o.pecas||[]).reduce((s,p)=>s+num(p.valor),0);
 const terceiros=(o.terceiros||[]).reduce((s,t)=>s+num(t.valor),0);
 const frete=(o.frete||[]).reduce((s,f)=>s+num(f.valor),0);
 const tecnico=mo+materiais+terceiros;
 const mult=MULT[o.complexidade]||1;
 const tecnicoComplexo=tecnico*mult;
 const base=tecnicoComplexo+pecas+frete;
 const margemValor=base*(num(o.margem)/100);
 const subtotal=base+margemValor;
 const descontoValor=subtotal*(num(o.desconto)/100);
 const total=subtotal-descontoValor;
 return {horas,mo,materiais,pecas,terceiros,frete,tecnico,mult,tecnicoComplexo,base,margemValor,subtotal,descontoValor,total,cenarios:{minimo:base*1.2,ideal:base*1.3,premium:base*1.5}};
}
export function gerarParcelas({tipo,descricao,valor,totalParcelas,dataInicial,categoria,origem,refId}){
 const total=Number(totalParcelas||1), v=Number(valor||0)/total;
 return Array.from({length:total},(_,i)=>({id:uid('tx'),grupoId:refId||uid('grp'),parcela:i+1,totalParcelas:total,rotulo:`${i+1}/${total}`,tipo,descricao:`${descricao} (${i+1}/${total})`,valor:v,data:addMonths(dataInicial,i),categoria,origem,refId}));
}
export function resumoFinanceiro(financeiro,contas,competencia){
 const inComp=(d)=>String(d||'').slice(0,7)===competencia;
 const tx=financeiro.transacoes.filter(t=>inComp(t.data));
 const receitas=tx.filter(t=>t.tipo==='receita').reduce((s,t)=>s+t.valor,0);
 const despesas=tx.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
 const pendentes=contas.lista.filter(c=>String(c.vencimento).slice(0,7)===competencia&&c.status!=='paga').reduce((s,c)=>s+c.valor,0);
 return {receitas,despesas,saldo:receitas-despesas,pendentes,projetado:receitas-despesas-pendentes,qtdTx:tx.length};
}
