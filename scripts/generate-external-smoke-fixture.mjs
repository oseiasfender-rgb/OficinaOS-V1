import fs from 'node:fs/promises';
import { STATE_STORES } from '../src/data/schema.js';
import { createSimpleModuleServices } from '../src/modules/simple-modules.js';
import { createWorkflowServices } from '../src/modules/workflow-services.js';
import { createHistoryServices } from '../src/modules/history-services.js';
import { exportLegacyCompatibleBackup } from '../src/data/backup-service.js';

const [outputPath = 'homologation/fixtures/external-smoke-backup.json'] = process.argv.slice(2);
const clone = value => structuredClone(value);
function memoryRepo(seed=[]){
  const rows=new Map((seed||[]).map(row=>[row.id,clone(row)]));
  return {
    async list(){return [...rows.values()].map(clone);},
    async get(id){return rows.has(id)?clone(rows.get(id)):null;},
    async put(row){rows.set(row.id,clone(row));return clone(row);},
    async delete(id){rows.delete(id);return true;},
    async count(){return rows.size;},
    async replaceAll(list=[]){rows.clear();for(const row of list)rows.set(row.id,clone(row));return list.length;}
  };
}
function eventBus(){const listeners=new Map();return{on(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f);return()=>listeners.get(t)?.delete(f);},emit(t,p){for(const f of listeners.get(t)||[])f(p);}};}
function context(){
  const repositories={};
  for(const name of [...STATE_STORES,'settings','meta','backups'])repositories[name]=memoryRepo();
  const state={};
  return {repositories,eventBus:eventBus(),store:{patch(p){Object.assign(state,clone(p));}},state};
}

const ctx=context();
await ctx.repositories.settings.put({id:'os_config',value:{nome:'Oficina Homologação Externa',dono:'Responsável de Teste',cidade:'Ambiente CI'}});
const simple=createSimpleModuleServices(ctx);
const workflow=createWorkflowServices(ctx);
const history=createHistoryServices(ctx);

const client=await simple.clientes.create({
  nome:'Cliente Sintético Homologação',
  fone:'11999990000',
  email:'homologacao@example.invalid',
  doc:'SINTETICO',
  veiculos:[{marca:'Veículo Sintético',placa:'TST1A23',cor:'Prata',ano:'2024'}]
});
const budget=await workflow.orcamento.save({
  clientId:client.id,clientName:client.nome,clientPhone:client.fone,
  vehicle:'Veículo Sintético',vehiclePlate:'TST1A23',vehicleYear:'2024',vehicleColor:'Prata',
  service:'Funilaria e pintura — cenário sintético de homologação',entryDate:'2026-09-18',dueDate:'2026-09-25',
  priority:'normal',payment:'À vista',warrantyDays:'90',notes:'Documento sintético para CI.',internalNotes:'SEGREDO INTERNO DE TESTE NÃO PODE IR AO PDF',
  complexity:'basico',hourRate:100,laborProcesses:[{key:'funilaria',label:'Funilaria',hours:10}],
  materials:[{name:'Material sintético',qty:1,unit:100}],serviceItems:[{desc:'Ajuste complementar',qty:1,value:200}],
  parts:[{name:'Peça recuperada sintética',condition:'Boa',qty:1,value:300}],thirdParties:[{desc:'Terceiro sintético',value:150}],
  freight:{displacement:50,parts:0,tow:0},marginPercent:20,discountPercent:0,status:'Salvo'
});
const appointment=await workflow.agenda.createFromBudget(budget.id,{date:'2026-09-18',dueDate:'2026-09-25',time:'08:00'});
await workflow.checklists.setItem('workOrder',appointment.workOrderId,'entrada',0,true);
await workflow.checklists.setCurrentStage('workOrder',appointment.workOrderId,'desmontagem');
await workflow.agenda.markDone(appointment.id);
await workflow.financeiro.syncDeliveredWorkOrders();
await workflow.financeiro.create({type:'dep',desc:'Energia sintética CI',cat:'Energia Elétrica',val:'250,00',date:'2026-09-18'});
await history.historicoOperacional.record({module:'homologacao',action:'FIXTURE',message:'Fixture sintética externa criada.'});

const backup=await exportLegacyCompatibleBackup(ctx.repositories);
backup.homologationFixture={synthetic:true,clean:true,purpose:'external-ci-smoke',containsRealCustomerData:false};
await fs.mkdir(new URL('../homologation/fixtures/', import.meta.url),{recursive:true}).catch(()=>{});
await fs.writeFile(outputPath,JSON.stringify(backup,null,2)+'\n');
history.dispose();
console.log(outputPath);
