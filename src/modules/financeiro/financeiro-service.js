import { safeText } from '../../core/validators.js';
import { amount, dueForMonth, isPaid, monthKey, monthSummary, normalizeAccount, normalizeTransaction, projectCashFlow, reconcileFinancialData, recurringKey, todayISO } from './financial-model.js';

function clone(value){return structuredClone(value);}
function uid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function lower(v){return safeText(v,240).toLocaleLowerCase('pt-BR');}
function compGte(a,b){return String(a||'')>=String(b||'');}
function signedMoney(value){
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  let s=String(value??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
  if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  const n=Number(s.replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n)?n:0;
}
const DAS_VALUE=87.05;
const DAS_MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function createFinancialServices({repositories,eventBus,store}){
  const txRepo=repositories.transactions, accountRepo=repositories.accounts, backupRepo=repositories.deletionBackups;
  const settingsRepo=repositories.settings, recurringRepo=repositories.recurringTemplates, workOrdersRepo=repositories.workOrders;

  async function setting(id,fallback){const row=await settingsRepo.get(id);return row?clone(row.value):clone(fallback);}
  async function setSetting(id,value){await settingsRepo.put({id,value:clone(value)});return value;}
  async function log(module,action,entity,entityId,summary,details=''){
    if(!repositories.operationalHistory)return;
    const at=new Date().toISOString();
    await repositories.operationalHistory.put({id:uid('evt'),at,module,action,entity,entityId:String(entityId??''),summary,details});
  }
  async function safety(entityType,reason,payload){if(!backupRepo)return null;const row={id:`${entityType}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,at:new Date().toISOString(),entityType,reason,payload:clone(payload)};await backupRepo.put(row);return row.id;}
  async function syncStore(transactions,accounts){store?.patch?.({transactions:transactions??await txRepo.list(),accounts:accounts??await accountRepo.list()});}

  async function replaceFinancial(nextTx,nextAccounts){
    const beforeTx=await txRepo.list(), beforeAccounts=await accountRepo.list();
    try{await txRepo.replaceAll(nextTx);await accountRepo.replaceAll(nextAccounts);await syncStore(nextTx,nextAccounts);return true;}
    catch(error){try{await txRepo.replaceAll(beforeTx);await accountRepo.replaceAll(beforeAccounts);await syncStore(beforeTx,beforeAccounts);}catch{}throw error;}
  }

  async function reconciled(){
    return reconcileFinancialData(await txRepo.list(),await accountRepo.list());
  }
  async function nextIds(){const [txs,accounts]=await Promise.all([txRepo.list(),accountRepo.list()]);return {txIds:new Set(txs.map(x=>String(x.id))),accountIds:new Set(accounts.map(x=>String(x.id)))};}
  function freeId(base,set){let id=base,i=2;while(set.has(String(id)))id=`${base}_${i++}`;set.add(String(id));return id;}
  async function bankState(){const raw=await setting('fp_contas_banco',{saldos:{sicoob:0,dinheiro:0,pix:0},txContas:{}});return {saldos:{sicoob:Number(raw?.saldos?.sicoob)||0,dinheiro:Number(raw?.saldos?.dinheiro)||0,pix:Number(raw?.saldos?.pix)||0,...(raw?.saldos||{})},txContas:{...(raw?.txContas||{})}};}
  async function saveBankState(value){await setSetting('fp_contas_banco',value);eventBus?.emit?.('financeiro:bank-changed',clone(value));return clone(value);}

  async function ensureAccountForExpense(tx,accounts,accountIds){
    let account=accounts.find(c=>String(c.id)===String(tx.contaId||'')||String(c.fromTx||'')===String(tx.id)||String(c.paidTxId||'')===String(tx.id));
    if(!account){const accountId=freeId(`ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,accountIds);account=normalizeAccount({id:accountId,name:tx.desc,cat:tx.cat,val:tx.val,due:tx.date,paid:isPaid(tx.paid),paidAt:isPaid(tx.paid)?tx.date:'',recur:false,fromTx:String(tx.id),paidTxId:String(tx.id)});accounts.push(account);}
    else{account=normalizeAccount({...account,name:tx.desc,cat:tx.cat,val:tx.val,due:tx.date,paid:isPaid(tx.paid),paidAt:isPaid(tx.paid)?(account.paidAt||tx.date):'',paidTxId:String(tx.id),fromTx:account.fromTx||String(tx.id)},account.id);const index=accounts.findIndex(c=>String(c.id)===String(account.id));accounts[index]=account;}
    tx.contaId=String(account.id);tx.source=tx.source||'financeiro';return account;
  }

  async function createTransaction(input={}){
    const type=String(input.type??input.tipo??'dep').toLowerCase().startsWith('rec')?'rec':String(input.type??input.tipo??'').toLowerCase().startsWith('trans')?'transfer':'dep';
    const val=amount(input.val??input.valor);const desc=safeText(input.desc??input.descricao,240);const date=String(input.date??input.data??todayISO()).slice(0,10);if(!desc)throw new Error('Descrição é obrigatória.');if(val<=0)throw new Error('Valor deve ser maior que zero.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Data inválida.');
    const {transactions,accounts}=await reconciled();const {txIds,accountIds}=await nextIds();const id=freeId(input.id??uid('tx'),txIds);
    const tx=normalizeTransaction({...input,id,date,desc,val,type,cat:input.cat??input.categoria??(type==='transfer'?'Transferência':'Outros'),paid:input.paid??(type==='rec'||type==='transfer'?'Pago':'Não pago'),source:input.source??'manual'});
    if(type==='transfer'){
      const from=safeText(input.fromAccount,80),to=safeText(input.toAccount,80);if(!from||!to||from===to)throw new Error('Informe contas de origem e destino diferentes.');tx.fromAccount=from;tx.toAccount=to;tx.transferId=tx.transferId||uid('transfer');tx.paid='Pago';transactions.push(tx);
      const bank=await bankState();bank.saldos[from]=Number(bank.saldos[from]||0)-val;bank.saldos[to]=Number(bank.saldos[to]||0)+val;bank.txContas[String(tx.id)]=from;
      await replaceFinancial(transactions,accounts);await saveBankState(bank);await log('Financeiro','Transferência','Lançamento',tx.id,`Transferência ${from} → ${to}`);eventBus?.emit?.('financeiro:changed',{action:'transfer',id:tx.id});return clone(tx);
    }
    transactions.push(tx);if(type==='dep')await ensureAccountForExpense(tx,accounts,accountIds);await replaceFinancial(transactions,accounts);await log('Financeiro','Adicionar','Lançamento',tx.id,`Lançamento ${type==='rec'?'de receita':'de despesa'} criado`);eventBus?.emit?.('financeiro:changed',{action:'create',id:tx.id});return clone(tx);
  }

  async function updateTransaction(id,changes={}){
    const {transactions,accounts}=await reconciled();const idx=transactions.findIndex(t=>String(t.id)===String(id));if(idx<0)throw new Error('Lançamento não encontrado.');const original=transactions[idx];if(original.type==='transfer')throw new Error('Transferências devem ser estornadas e recriadas, não editadas.');
    const next={...original,...clone(changes),id:original.id};if('val' in changes)next.val=amount(changes.val);if('type' in changes)next.type=normalizeTransaction({type:changes.type}).type;if(next.val<=0)throw new Error('Valor deve ser maior que zero.');transactions[idx]=next;
    const linkedIndex=accounts.findIndex(c=>String(c.id)===String(original.contaId||'')||String(c.fromTx||'')===String(original.id)||String(c.paidTxId||'')===String(original.id));
    if(next.type==='dep'){const {accountIds}=await nextIds();await ensureAccountForExpense(next,accounts,accountIds);}
    else if(linkedIndex>=0){const linked=accounts[linkedIndex];await safety('account','transaction-changed-to-receipt',{account:linked,transaction:original});accounts.splice(linkedIndex,1);next.contaId='';}
    await replaceFinancial(transactions,accounts);await log('Financeiro','Editar','Lançamento',id,'Lançamento financeiro atualizado');eventBus?.emit?.('financeiro:changed',{action:'update',id});return clone(next);
  }

  async function setTransactionPaid(id,paid){
    const {transactions,accounts}=await reconciled();const tx=transactions.find(t=>String(t.id)===String(id));if(!tx)throw new Error('Lançamento não encontrado.');if(tx.type==='transfer'||isPaid(tx.paid)===!!paid)return clone(tx);tx.paid=paid?'Pago':'Não pago';
    const c=accounts.find(a=>String(a.id)===String(tx.contaId||'')||String(a.fromTx||'')===String(tx.id)||String(a.paidTxId||'')===String(tx.id));if(c){c.paid=!!paid;c.paidAt=paid?todayISO():'';c.paidTxId=String(tx.id);tx.contaId=String(c.id);tx.date=paid?c.paidAt:c.due;}
    await replaceFinancial(transactions,accounts);await log('Financeiro',paid?'Pagar':'Desfazer pagamento','Lançamento',id,paid?'Lançamento marcado como pago':'Pagamento desfeito');eventBus?.emit?.('financeiro:changed',{action:paid?'pay':'unpay',id});return clone(tx);
  }

  async function removeTransaction(id){
    const {transactions,accounts}=await reconciled();const tx=transactions.find(t=>String(t.id)===String(id));if(!tx)return false;
    if(tx.type==='transfer')return reverseTransfer(id);
    const linked=accounts.filter(c=>String(c.id)===String(tx.contaId||'')||String(c.fromTx||'')===String(tx.id)||String(c.paidTxId||'')===String(tx.id));await safety('financial','transaction-delete',{transaction:tx,accounts:linked});
    const nextTx=transactions.filter(t=>String(t.id)!==String(id));const linkedIds=new Set(linked.map(c=>String(c.id)));const nextAccounts=accounts.filter(c=>!linkedIds.has(String(c.id)));await replaceFinancial(nextTx,nextAccounts);await log('Financeiro','Excluir','Lançamento',id,'Lançamento e conta vinculada removidos');eventBus?.emit?.('financeiro:changed',{action:'delete',id});return true;
  }

  async function reverseTransfer(id){
    const txs=await txRepo.list();const tx=txs.map(t=>normalizeTransaction(t)).find(t=>String(t.id)===String(id));if(!tx||tx.type!=='transfer')throw new Error('Transferência não encontrada.');await safety('financial','transfer-reversal',tx);const bank=await bankState();bank.saldos[tx.fromAccount]=Number(bank.saldos[tx.fromAccount]||0)+tx.val;bank.saldos[tx.toAccount]=Number(bank.saldos[tx.toAccount]||0)-tx.val;delete bank.txContas[String(tx.id)];await txRepo.delete(tx.id);await saveBankState(bank);await syncStore();await log('Financeiro','Estornar transferência','Lançamento',id,'Transferência estornada');eventBus?.emit?.('financeiro:changed',{action:'reverse-transfer',id});return true;
  }

  async function syncDeliveredWorkOrders(){
    const orders=await workOrdersRepo.list();const {transactions,accounts}=await reconciled();const used=new Set(transactions.map(t=>String(t.id)));let added=0,changed=0;
    for(const os of orders){if(String(os.status||'').toLocaleLowerCase('pt-BR')!=='entregue'||os.financialSyncPending!==true)continue;if(amount(os.value??os.valor)<=0)continue;let tx=transactions.find(t=>String(t.workOrderId??t.osId??t.jobId??'')===String(os.id)&&t.type==='rec');if(!tx){const base=`osrec_${String(os.legacyJobId??os.id)}`;const id=freeId(base,used);tx=normalizeTransaction({id,date:todayISO(),desc:`Receita OS — ${os.clientName||'Cliente'}${os.vehicle?' — '+os.vehicle:''}`,cat:'Serviços',val:amount(os.value??os.valor),type:'rec',paid:'Não pago',workOrderId:os.id,osId:os.id,jobId:os.legacyJobId??null,budgetId:os.budgetId??null,source:'os'});transactions.push(tx);added++;}
      os.financialSyncPending=false;os.financialTransactionId=tx.id;os.updatedAt=new Date().toISOString();await workOrdersRepo.put(os);changed++;}
    if(added||changed){await replaceFinancial(transactions,accounts);await log('Financeiro','Sincronizar OS','OS','',`${added} receita(s) de OS criada(s)`);eventBus?.emit?.('financeiro:changed',{action:'sync-os',added});}
    return {added,ordersUpdated:changed};
  }

  async function list({year,month,query='',category='',type=''}={}){const transactions=(await txRepo.list()).map(row=>normalizeTransaction(row));const q=lower(query),cat=lower(category),tfilter=String(type||'');let rows=transactions;if(Number.isInteger(year)&&Number.isInteger(month))rows=rows.filter(t=>{const p=t.date.split('-');return Number(p[0])===year&&Number(p[1])===month+1;});if(q)rows=rows.filter(t=>`${t.desc} ${t.cat}`.toLocaleLowerCase('pt-BR').includes(q));if(cat)rows=rows.filter(t=>lower(t.cat)===cat);if(tfilter)rows=rows.filter(t=>t.type===tfilter);return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));}
  async function summary(year,month){const transactions=await txRepo.list();return monthSummary(transactions,year,month);}
  async function reconciliation(){return reconciled();}
  async function categories(){const rows=await txRepo.list();return [...new Set(rows.map(r=>safeText(r.cat??r.categoria,100)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
  async function setBankBalance(name,value){const key=safeText(name,80);if(!key)throw new Error('Conta bancária inválida.');const bank=await bankState();bank.saldos[key]=signedMoney(value);await saveBankState(bank);await log('Financeiro','Saldo manual','Conta bancária',key,'Saldo bancário atualizado');return clone(bank);}
  async function cashFlow({from=todayISO(),days=30}={}){const bank=await bankState();return projectCashFlow({accounts:await accountRepo.list(),workOrders:await workOrdersRepo.list(),bankBalances:bank.saldos,from,days});}

  async function recurringControl(){return {ended:await setting('fp_recorrentes_encerradas',{}),canceled:await setting('fp_recorrentes_canceladas',[]),deleted:await setting('fp_recorrentes_excluidas_competencia',[])};}
  async function templates(){
    const explicit=await recurringRepo.list();const accounts=(await reconciled()).accounts.filter(c=>c.recur);const map=new Map(explicit.map(t=>[String(t.legacyKey??t.id),clone(t)]));
    for(const c of accounts){const key=c.recurKey||recurringKey(c);if(!map.has(key))map.set(key,{id:c.recurTemplateId||`rec_${key}`,name:c.name,category:c.cat,value:c.val,startDate:c.due,type:'monthly',totalInstallments:0,active:true,legacyKey:key,createdAt:c.createdAt||new Date().toISOString()});}
    return [...map.values()];
  }
  async function generateRecurring(year,month){
    const comp=`${year}-${String(month+1).padStart(2,'0')}`,ctrl=await recurringControl(),ended=ctrl.ended||{},canceled=new Set((ctrl.canceled||[]).map(String)),deleted=new Set((ctrl.deleted||[]).map(String));const allTemplates=(await templates()).filter(t=>t.active!==false);const {transactions,accounts}=await reconciled();const {accountIds}=await nextIds();const createdIds=[];let added=0;
    for(const tpl of allTemplates){const key=String(tpl.legacyKey??tpl.id);if(canceled.has(key)||ended[key]&&compGte(comp,ended[key])||deleted.has(`${key}|${comp}`))continue;const start=monthKey(tpl.startDate);if(start&&comp<start)continue;if(tpl.type==='installment'&&Number(tpl.totalInstallments)>0&&start){const sy=Number(start.slice(0,4)),sm=Number(start.slice(5,7))-1,diff=(year-sy)*12+month-sm;if(diff<0||diff>=Number(tpl.totalInstallments))continue;}
      if(accounts.some(c=>c.recur&&(String(c.recurTemplateId||'')===String(tpl.id)||String(c.recurKey||'')===key)&&String(c.competencia||monthKey(c.due))===comp))continue;const due=dueForMonth({due:tpl.startDate},year,month);const id=freeId(`ct_${String(tpl.id)}_${comp.replace('-','')}`,accountIds);accounts.push(normalizeAccount({id,name:tpl.name,cat:tpl.category||'Outros',val:tpl.value,due,paid:false,recur:true,recurKey:key,competencia:comp,recurTemplateId:String(tpl.id),recurOccurrenceId:`${String(tpl.id)}|${comp}`,recurrenceType:tpl.type,parcelasTotal:Number(tpl.totalInstallments)||0}));createdIds.push(id);added++;}
    const reconciledNext=reconcileFinancialData(transactions,accounts,{createAccountIds:createdIds});await replaceFinancial(reconciledNext.transactions,reconciledNext.accounts);if(added)await log('Contas','Gerar recorrentes','Recorrência',comp,`${added} recorrente(s) criada(s)`);eventBus?.emit?.('contas:changed',{action:'generate-recurring',added,comp});return {added,comp};
  }

  async function createAccount(input={}){
    const val=amount(input.val??input.valor),name=safeText(input.name??input.desc,180),due=String(input.due??'').slice(0,10);if(!name)throw new Error('Descrição é obrigatória.');if(val<=0)throw new Error('Valor deve ser maior que zero.');if(!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new Error('Vencimento inválido.');const {transactions,accounts}=await reconciled();const {accountIds}=await nextIds();const recur=!!input.recur;const key=recur?recurringKey({...input,name,val,due}):'';const comp=recur?monthKey(due):'';const id=freeId(input.id??(recur?`ct_${key}_${comp.replace('-','')}`:uid('ct')),accountIds);const account=normalizeAccount({...input,id,name,val,due,recur,recurKey:key,competencia:comp});accounts.push(account);
    if(recur){const tplId=input.recurTemplateId||`rec_${key}`;account.recurTemplateId=tplId;if(!(await recurringRepo.get(tplId)))await recurringRepo.put({id:tplId,name,category:account.cat,value:val,startDate:due,type:input.recurrenceType==='installment'?'installment':'monthly',totalInstallments:Number(input.totalInstallments)||0,active:true,legacyKey:key,createdAt:new Date().toISOString()});}
    const next=reconcileFinancialData(transactions,accounts,{createAccountIds:[account.id]});await replaceFinancial(next.transactions,next.accounts);await log('Contas','Adicionar','Conta',account.id,'Conta adicionada');eventBus?.emit?.('contas:changed',{action:'create',id:account.id});return clone(next.accounts.find(c=>String(c.id)===String(account.id))||account);
  }
  async function updateAccount(id,changes={}){
    const {transactions,accounts}=await reconciled();const idx=accounts.findIndex(c=>String(c.id)===String(id));if(idx<0)throw new Error('Conta não encontrada.');const old=accounts[idx];const next={...old,...clone(changes),id:old.id};if('val' in changes)next.val=amount(changes.val);if('name' in changes)next.name=safeText(changes.name,180);if(next.val<=0)throw new Error('Valor deve ser maior que zero.');accounts[idx]=next;const tx=transactions.find(t=>String(t.id)===String(next.paidTxId||'')||String(t.id)===String(next.fromTx||'')||String(t.contaId||'')===String(next.id));if(tx){if('name' in changes||'desc' in changes)tx.desc=tx.source==='contas'||/^Conta:/i.test(tx.desc)?`Conta: ${next.name}`:next.name;if('cat' in changes)tx.cat=next.cat;if('val' in changes)tx.val=next.val;if('due' in changes||'paidAt' in changes||'paid' in changes)tx.date=next.paid?(next.paidAt||next.due):next.due;if('paid' in changes)tx.paid=next.paid?'Pago':'Não pago';tx.contaId=String(next.id);}
    await replaceFinancial(transactions,accounts);await log('Contas','Editar','Conta',id,'Conta atualizada');eventBus?.emit?.('contas:changed',{action:'update',id});return clone(next);
  }
  async function setAccountPaid(id,paid){
    const {transactions,accounts}=await reconciled();const c=accounts.find(a=>String(a.id)===String(id));if(!c)throw new Error('Conta não encontrada.');if(c.paid===!!paid)return clone(c);c.paid=!!paid;c.paidAt=paid?todayISO():'';let tx=transactions.find(t=>String(t.id)===String(c.paidTxId||'')||String(t.id)===String(c.fromTx||'')||String(t.contaId||'')===String(c.id));if(!tx && paid){const next=reconcileFinancialData(transactions,accounts,{createAccountIds:[c.id]});tx=next.transactions.find(t=>String(t.contaId||'')===String(c.id));transactions.splice(0,transactions.length,...next.transactions);accounts.splice(0,accounts.length,...next.accounts);}
    if(tx){tx.paid=paid?'Pago':'Não pago';tx.date=paid?c.paidAt:c.due;tx.contaId=String(c.id);c.paidTxId=String(tx.id);}await replaceFinancial(transactions,accounts);await log('Contas',paid?'Pagar':'Desfazer pagamento','Conta',id,paid?'Conta marcada como paga':'Pagamento desfeito');eventBus?.emit?.('contas:changed',{action:paid?'pay':'unpay',id});return clone(c);
  }
  async function removeAccount(id){
    const {transactions,accounts}=await reconciled();const c=accounts.find(a=>String(a.id)===String(id));if(!c)return false;const linked=transactions.filter(t=>String(t.contaId||'')===String(c.id)||String(t.id)===String(c.paidTxId||'')||String(t.id)===String(c.fromTx||''));await safety('account','account-delete',{account:c,transactions:linked});const txIds=new Set(linked.map(t=>String(t.id)));await replaceFinancial(transactions.filter(t=>!txIds.has(String(t.id))),accounts.filter(a=>String(a.id)!==String(id)));await log('Contas','Excluir','Conta',id,'Conta removida com lançamento vinculado');eventBus?.emit?.('contas:changed',{action:'delete',id});return true;
  }
  async function terminateRecurring(id,fromComp){
    const {transactions,accounts}=await reconciled();const c=accounts.find(a=>String(a.id)===String(id));if(!c||!c.recur)throw new Error('Recorrência não encontrada.');const comp=fromComp||c.competencia||monthKey(c.due),key=String(c.recurKey||recurringKey(c));const ended=await setting('fp_recorrentes_encerradas',{});ended[key]=comp;await setSetting('fp_recorrentes_encerradas',ended);const removed=accounts.filter(a=>a.recur&&String(a.recurKey||'')===key&&compGte(a.competencia||monthKey(a.due),comp));await safety('account','recurrence-end',{key,from:comp,accounts:removed});const removedIds=new Set(removed.map(a=>String(a.id)));const removedTxIds=new Set(transactions.filter(t=>removedIds.has(String(t.contaId||''))).map(t=>String(t.id)));await replaceFinancial(transactions.filter(t=>!removedTxIds.has(String(t.id))),accounts.filter(a=>!removedIds.has(String(a.id))));await log('Contas','Excluir daqui pra frente','Recorrência',key,`Recorrência encerrada a partir de ${comp}`);eventBus?.emit?.('contas:changed',{action:'end-recurring',key,comp});return {key,comp,removed:removed.length};
  }
  async function removeRecurringAll(id){
    const {transactions,accounts}=await reconciled();const c=accounts.find(a=>String(a.id)===String(id));if(!c||!c.recur)throw new Error('Recorrência não encontrada.');const key=String(c.recurKey||recurringKey(c));const canceled=new Set((await setting('fp_recorrentes_canceladas',[])).map(String));canceled.add(key);await setSetting('fp_recorrentes_canceladas',[...canceled]);const rows=accounts.filter(a=>a.recur&&String(a.recurKey||'')===key);await safety('account','recurrence-delete-all',{key,accounts:rows});const accountIds=new Set(rows.map(a=>String(a.id))),txIds=new Set(transactions.filter(t=>accountIds.has(String(t.contaId||''))).map(t=>String(t.id)));await replaceFinancial(transactions.filter(t=>!txIds.has(String(t.id))),accounts.filter(a=>!accountIds.has(String(a.id))));const template=(await recurringRepo.list()).find(t=>String(t.legacyKey??t.id)===key);if(template)await recurringRepo.put({...template,active:false,updatedAt:new Date().toISOString()});await log('Contas','Excluir recorrência inteira','Recorrência',key,'Recorrência inteira removida');eventBus?.emit?.('contas:changed',{action:'delete-recurring-all',key});return {key,removed:rows.length};
  }
  function dasKey(year,month){return `${year}-${String(month+1).padStart(2,'0')}`;}
  function nestedDasToFlat(value){
    const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
    for(const [year,months] of Object.entries(value)){if(!months||typeof months!=='object'||Array.isArray(months))continue;for(const [month,status] of Object.entries(months)){const m=Number(month);if(/^\d{4}$/.test(year)&&m>=1&&m<=12&&(status==='Pago'||status==='Pendente'))out[`${year}-${String(m).padStart(2,'0')}`]=status;}}
    return out;
  }
  function flatDasToNested(value){const out={};for(const [key,status] of Object.entries(value||{})){const [year,month]=String(key).split('-');const m=Number(month);if(!/^\d{4}$/.test(year)||m<1||m>12)continue;out[year]??={};out[year][String(m)]=status==='Pago'?'Pago':'Pendente';}return out;}
  async function dasMap(){
    const flat=await setting('fp_das_v2_status',null);if(flat&&typeof flat==='object'&&!Array.isArray(flat))return {...flat};
    const nested=(await setting('fp_das_status',null))??(await setting('fp_das',null));return nestedDasToFlat(nested);
  }
  async function saveDasMap(map){const clean={};for(const [key,status] of Object.entries(map||{})){if(/^\d{4}-\d{2}$/.test(key))clean[key]=status==='Pago'?'Pago':'Pendente';}const nested=flatDasToNested(clean);await setSetting('fp_das_v2_status',clean);await setSetting('fp_das_status',nested);await setSetting('fp_das',nested);return clean;}
  async function dasYear(year){
    const map=await dasMap(),today=todayISO(),todayYear=Number(today.slice(0,4)),todayMonth=Number(today.slice(5,7))-1,todayDay=Number(today.slice(8,10));
    return DAS_MONTHS.map((name,month)=>{const key=dasKey(year,month),stored=map[key]||'Pendente';let effective=stored;if(stored!=='Pago'){const past=year<todayYear||(year===todayYear&&(month<todayMonth||(month===todayMonth&&todayDay>20)));const future=year>todayYear||(year===todayYear&&(month>todayMonth||(month===todayMonth&&todayDay<15)));effective=past?'Atrasado':future?'Futuro':'Pendente';}return {year,month,key,name,value:DAS_VALUE,status:stored,effectiveStatus:effective,paid:stored==='Pago'};});
  }
  async function setDasPaid(year,month,paid){
    if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<0||month>11)throw new Error('Competência do DAS inválida.');
    const key=dasKey(year,month),map=await dasMap();map[key]=paid?'Pago':'Pendente';await saveDasMap(map);
    const {transactions,accounts}=await reconciled();const id=`das_${year}_${String(month+1).padStart(2,'0')}`;const matches=transactions.filter(t=>String(t.dasId||t.id)===id||String(t.desc||'').includes(`DAS MEI ${key}`));
    let tx=matches[0]||null;const duplicateIds=new Set(matches.slice(1).map(t=>String(t.id)));
    let nextTx=transactions.filter(t=>!duplicateIds.has(String(t.id)));
    if(paid){if(!tx){tx=normalizeTransaction({id,dasId:id,date:`${key}-20`,type:'dep',cat:'Impostos e Taxas',desc:`DAS MEI ${key}`,val:DAS_VALUE,paid:'Pago',source:'DAS_MEI'});nextTx.push(tx);}else{tx.dasId=id;tx.date=`${key}-20`;tx.type='dep';tx.cat='Impostos e Taxas';tx.desc=`DAS MEI ${key}`;tx.val=DAS_VALUE;tx.paid='Pago';tx.source='DAS_MEI';}}
    else nextTx=nextTx.filter(t=>String(t.dasId||t.id)!==id&&!String(t.desc||'').includes(`DAS MEI ${key}`));
    await replaceFinancial(nextTx,accounts);await log('Contas',paid?'Pagar DAS':'Desfazer DAS','DAS MEI',key,paid?'DAS MEI marcado como pago':'DAS MEI marcado como pendente');eventBus?.emit?.('contas:changed',{action:paid?'das-paid':'das-unpaid',key});return {key,paid:!!paid,transactionId:paid?id:null,value:DAS_VALUE};
  }

  async function accountList({year,month,status='all',query=''}={}){const accounts=(await accountRepo.list()).map(row=>normalizeAccount(row));const q=lower(query),today=todayISO();return accounts.filter(c=>{if(q&&!`${c.name} ${c.cat}`.toLocaleLowerCase('pt-BR').includes(q))return false;if(Number.isInteger(year)&&Number.isInteger(month)){const key=`${year}-${String(month+1).padStart(2,'0')}`;if(monthKey(c.paid?c.paidAt||c.due:c.due)!==key&&status!=='late')return false;}if(status==='paid'&&!c.paid)return false;if(status==='pending'&&c.paid)return false;if(status==='late'&&(c.paid||c.due>=today))return false;if(status==='recur'&&!c.recur)return false;return true;}).sort((a,b)=>String(a.due).localeCompare(String(b.due))||String(a.name).localeCompare(String(b.name),'pt-BR'));}
  async function accountSummary(year,month){const rows=await accountList({year,month});const today=todayISO(),paid=rows.filter(c=>c.paid),pending=rows.filter(c=>!c.paid),late=pending.filter(c=>c.due<today);const soon=pending.filter(c=>c.due>=today&&((new Date(c.due+'T00:00:00')-new Date(today+'T00:00:00'))/86400000)<=7);const sum=list=>list.reduce((s,c)=>s+c.val,0);return {total:rows.length,paid:paid.length,pending:pending.length,late:late.length,soon:soon.length,paidValue:sum(paid),pendingValue:sum(pending),lateValue:sum(late),soonValue:sum(soon)};}

  const financeiro=Object.freeze({list,summary,categories,create:createTransaction,update:updateTransaction,setPaid:setTransactionPaid,remove:removeTransaction,reconcile:reconciliation,syncDeliveredWorkOrders,bankState,setBankBalance,transfer:(input)=>createTransaction({...input,type:'transfer'}),reverseTransfer,cashFlow});
  const contas=Object.freeze({list:accountList,summary:accountSummary,create:createAccount,update:updateAccount,setPaid:setAccountPaid,remove:removeAccount,generateRecurring,terminateRecurring,removeRecurringAll,templates,dasYear,setDasPaid,dasValue:DAS_VALUE,reconcile:reconciliation});
  return Object.freeze({financeiro,contas});
}
