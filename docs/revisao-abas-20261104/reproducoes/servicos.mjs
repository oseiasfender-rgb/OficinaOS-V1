import {indexedDB} from 'fake-indexeddb';
import {writeFile} from 'node:fs/promises';
import {createDatabase} from './src/data/indexeddb.js';
import {createRepositories} from './src/data/repositories/index.js';
import {createEstoqueService} from './src/modules/estoque/estoque-service.js';
import {createClientesService} from './src/modules/clientes/clientes-service.js';
import {createMetasService} from './src/modules/metas/metas-service.js';
import {createOrcamentoService} from './src/modules/orcamento/orcamento-service.js';
globalThis.indexedDB=indexedDB;
const db=await createDatabase(),r=createRepositories(db),eventBus={emit(){}};
const report={at:new Date().toISOString(),scope:'dados fictícios em fake-indexeddb, sem acesso a dados de usuário',findings:[]};
try{
 const stock=createEstoqueService({repositories:r,eventBus});
 await r.stock.put({id:700001,nome:'Material isolado',qty:10,unid:'Un',custo:20});
 const editorSnapshot=await stock.get(700001);
 await r.saveBudgetWithStock({id:'review-stock',materials:[{stockId:700001,qty:2}],parts:[],updatedAt:'one'});
 const afterDebit=(await stock.get(700001)).qty;
 await stock.update(700001,{nome:'Descrição alterada',qty:editorSnapshot.qty,unid:'Un'});
 report.findings.push({id:'EST-01',before:10,afterDebit,afterOldFormSave:(await stock.get(700001)).qty,held:(await r.budgets.get('review-stock')).stockAllocation.held['material:700001'],confirmed:true,detail:'Snapshot antigo do formulário de Material pode restaurar saldo anterior pela API usada na tela.'});
 const clients=createClientesService({repositories:r,eventBus});
 const client=await clients.create({nome:'Cliente fictício revisão'});
 const budgetService=createOrcamentoService({repositories:r,eventBus});
 const draft=budgetService.createDraft();const budget=await budgetService.save({...draft,clientId:client.id,clientName:client.name,service:'Serviço fictício',entryDate:'2026-11-04',laborProcesses:draft.laborProcesses.map(p=>({...p,hours:p.key==='pintura'?1:p.hours}))});
 await clients.remove(client.id);
 let saveError='';try{await budgetService.save((await budgetService.get(budget.id)).draft);}catch(e){saveError=e.message;}
 report.findings.push({id:'CLI-01',clientDeleted:(await r.clients.get(client.id))===null,budgetStillReferences:(await r.budgets.get(budget.id)).clientId,saveError,confirmed:saveError==='Cliente cadastrado não encontrado.'});
 const goals=createMetasService({repositories:r,eventBus});await goals.upsertCategoryGoal('Meta original',1000);
 const failing=createMetasService({repositories:{...r,goals:{...r.goals,put:async()=>{throw Error('Falha fictícia de gravação');}}},eventBus});
 let renameError='';try{await failing.renameCategoryGoal('Meta original','Meta renomeada',2000);}catch(e){renameError=e.message;}
 report.findings.push({id:'MET-01',error:renameError,oldGoalPresent:!!(await r.goals.get('Meta original')),newGoalPresent:!!(await r.goals.get('Meta renomeada')),confirmed:true,detail:'Renomear exclui registro antigo antes de confirmar gravação do novo.'});
 await goals.setPrincipal(6000);await goals.setPrincipal(7000);
 report.findings.push({id:'MET-02',history:await goals.history(),detail:'Tela consulta histórico importado; alterações da meta principal não criam histórico novo.'});
}finally{db.close();}
await writeFile('/tmp/revisao-abas-servicos.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
