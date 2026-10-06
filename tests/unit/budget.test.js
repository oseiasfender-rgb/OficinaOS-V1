import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL } from '../../src/core/money.js';
import { calculateBudget } from '../../src/modules/orcamento/orcamento-calculator.js';
import { draftFromBudget, recordFromDraft } from '../../src/modules/orcamento/orcamento-model.js';
import { buildCommercialQuoteModel } from '../../src/modules/orcamento/pdf-service.js';
import { createOrcamentoService } from '../../src/modules/orcamento/orcamento-service.js';

function memoryRepo(seed=[]){const rows=new Map(seed.map(x=>[x.id,structuredClone(x)]));return {async list(){return [...rows.values()].map(x=>structuredClone(x));},async get(id){return rows.has(id)?structuredClone(rows.get(id)):null;},async put(row){rows.set(row.id,structuredClone(row));return structuredClone(row);},async delete(id){rows.delete(id);return true;},async count(){return rows.size;}};}
function context(seed={}){const repositories={budgets:memoryRepo(seed.budgets||[]),clients:memoryRepo(seed.clients||[]),settings:memoryRepo(seed.settings||[]),deletionBackups:memoryRepo(),trash:memoryRepo(),operationalHistory:memoryRepo()};return {repositories,store:{patch(){}},eventBus:{emit(){}}};}

test('parser brasileiro aceita moeda, milhares e decimal com ponto',()=>{
  assert.equal(parseBRL('R$ 1.234,56'),1234.56);
  assert.equal(parseBRL('1234,56'),1234.56);
  assert.equal(parseBRL('1234.56'),1234.56);
  assert.equal(parseBRL('1.234'),1234);
});

test('motor de orçamento replica fórmula da baseline com complexidade, margem e desconto',()=>{
  const calc=calculateBudget({
    laborProcesses:[{hours:10}],hourRate:'100,00',materials:[{qty:2,unit:'50,00'}],
    serviceItems:[{qty:1,value:200}],serviceItemsDiscount:20,parts:[{value:300}],thirdParties:[{value:100}],freight:{displacement:50,parts:25,tow:0},
    complexity:'medio',marginPercent:20,discountPercent:10
  });
  assert.equal(calc.labor,1000);assert.equal(calc.materials,100);assert.equal(calc.serviceItemsNet,180);assert.equal(calc.recoveredParts,300);assert.equal(calc.extras,175);
  assert.equal(calc.manualBase,1755);assert.equal(calc.base,2281.5);assert.equal(calc.withMargin,2851.875);assert.equal(calc.discountAmount,285.1875);assert.equal(calc.final,2566.6875);
});

test('complexidade não cria preço fictício quando orçamento está vazio',()=>{
  const calc=calculateBudget({complexity:'restauracao',marginPercent:30});
  assert.equal(calc.manualBase,0);assert.equal(calc.base,0);assert.equal(calc.final,0);
});

test('registro modular mantém aliases e paginaOrcamento compatíveis com Clean v8',()=>{
  const record=recordFromDraft({clientName:'Ana',vehicle:'Toro',service:'Funilaria',entryDate:'2026-09-18',complexity:'alto',hourRate:100,laborProcesses:[{key:'funilaria',label:'Funilaria',hours:5}],materials:[{name:'Primer',qty:1,unit:50}],parts:[{name:'Farol usado',value:200}],marginPercent:10});
  assert.equal(record.cliente,'Ana');assert.equal(record.veiculo,'Toro');assert.equal(record.servico,'Funilaria');assert.equal(record.complexidade,'Alto');assert.equal(record.paginaOrcamento.values.clientName,'Ana');assert.equal(record.paginaOrcamento.materials.length,1);assert.ok(record.total>0);
});

test('leitura de orçamento legado recupera paginaOrcamento sem perder itens',()=>{
  const draft=draftFromBudget({id:'orc_old',cliente:'José',veiculo:'Palio',servico:'Pintura',total:900,paginaOrcamento:{values:{clientPhone:'19999999999',hourRate:'80',marginSlider:'5',fretePecas:'40'},complexity:'Médio',materials:[{name:'Tinta',qty:1,unit:100}],parts:[{nome:'Capô',valor:250}],services:[{desc:'Ajuste',qty:1,valor:60}]}});
  assert.equal(draft.clientName,'José');assert.equal(draft.clientPhone,'19999999999');assert.equal(draft.complexity,'medio');assert.equal(draft.materials[0].name,'Tinta');assert.equal(draft.parts[0].name,'Capô');assert.equal(draft.serviceItems[0].value,60);
});


test('orçamento histórico sem composição preserva total legado em vez de zerar',()=>{
  const draft=draftFromBudget({id:'orc_legacy_total',cliente:'Antigo',servico:'Reparo',total:1450});
  const calc=calculateBudget(draft);assert.equal(calc.usesLegacyTotalFallback,true);assert.equal(calc.final,1450);
  const record=recordFromDraft(draft,{id:'orc_legacy_total',total:1450});assert.equal(record.total,1450);
  const model=buildCommercialQuoteModel(record,{nome:'Oficina'});assert.equal(model.total,1450);assert.equal(model.items[0].value,1450);
});
test('PDF comercial não contém horas, tarifa, margem, custo de materiais ou observação interna',()=>{
  const record=recordFromDraft({id:'orc_priv',clientName:'Carlos',vehicle:'Corsa',service:'Reparo lateral',hourRate:120,laborProcesses:[{key:'funilaria',label:'Funilaria',hours:8}],materials:[{name:'Primer secreto',qty:1,unit:90}],marginPercent:25,internalNotes:'custo interno reservado',notes:'Serviço conforme avaliação',payment:'50% entrada'});record.id='orc_priv';
  const model=buildCommercialQuoteModel(record,{nome:'Oficina Teste'});const serialized=JSON.stringify(model);
  assert.equal(serialized.includes('custo interno reservado'),false);assert.equal(serialized.includes('Primer secreto'),false);assert.equal(serialized.includes('hourRate'),false);assert.equal(serialized.includes('marginPercent'),false);assert.equal(model.companyName,'Oficina Teste');assert.ok(model.total>0);assert.ok(Math.abs([...model.items,...model.parts].reduce((sum,row)=>sum+row.value,0)-model.total)<0.001);
});

test('service salva, edita e copia orçamento sem criar transação financeira',async()=>{
  const ctx=context({clients:[{id:100,name:'Ana',nome:'Ana'}]});const service=createOrcamentoService(ctx);
  const saved=await service.save({clientName:'Ana',service:'Funilaria',vehicle:'Uno',hourRate:100,laborProcesses:[{key:'funilaria',label:'Funilaria',hours:3}]});
  assert.equal(saved.clientId,100);assert.equal((await ctx.repositories.budgets.list()).length,1);
  const edited=await service.save({...draftFromBudget(saved),service:'Funilaria + pintura'});assert.equal(edited.id,saved.id);assert.equal(edited.servico,'Funilaria + pintura');
  const copy=await service.duplicate(saved.id);assert.notEqual(copy.id,saved.id);assert.equal((await ctx.repositories.budgets.list()).length,2);assert.equal(ctx.repositories.transactions,undefined);
});

test('remoção direta do orçamento é redirecionada à Lixeira com backup preventivo',async()=>{
  const ctx=context({budgets:[{id:'orc_1',cliente:'A',servico:'Serviço'}]});const service=createOrcamentoService(ctx);await service.remove('orc_1');assert.equal((await ctx.repositories.budgets.list()).length,0);assert.equal((await ctx.repositories.trash.list()).length,1);const backup=(await ctx.repositories.deletionBackups.list())[0];assert.equal(backup.entityType,'budget');assert.equal(backup.payload.id,'orc_1');
});
