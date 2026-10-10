import { createConsultorService } from '../../src/modules/consultor/consultor-service.js';
import { createFinancialServices } from '../../src/modules/financeiro/financeiro-service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixPayload,crc16 } from '../../src/modules/documentos/pix.js';
import { buildReceiptModel } from '../../src/modules/documentos/receipt.js';
import { jpegPagesPdf } from '../../src/modules/documentos/document-files.js';
import { createPartsCatalogService } from '../../src/modules/orcamento/parts-catalog.js';
import { searchManual } from '../../src/modules/consultor/manual-local.js';
import { createOrdemServicoService } from '../../src/modules/ordem-servico/ordem-servico-service.js';
import { STATE_STORES } from '../../src/data/schema.js';
import { recordFromDraft,draftFromBudget } from '../../src/modules/orcamento/orcamento-model.js';
function repo(seed=[]){const rows=new Map(seed.map(r=>[String(r.id),structuredClone(r)]));return{list:async()=>[...rows.values()].map(r=>structuredClone(r)),get:async id=>structuredClone(rows.get(String(id))??null),put:async r=>rows.set(String(r.id),structuredClone(r)),replaceAll:async list=>{rows.clear();for(const row of list)rows.set(String(row.id),structuredClone(row));},delete:async id=>rows.delete(String(id))};}
function repositories(seed={}){return Object.fromEntries([...STATE_STORES,'settings','meta','backups'].map(k=>[k,repo(seed[k]||[])]));}
test('PIX reproduz exatamente o exemplo estático e CRC do Banco Central',()=>{
 const payload=buildPixPayload({key:'123e4567-e12b-12d1-a456-426655440000',name:'Fulano de Tal',city:'BRASILIA'});
 assert.equal(payload,'00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');assert.equal(crc16('123456789'),'29B1');
 const valued=buildPixPayload({key:'fulano@example.com',name:'Oséias',city:'Leme',value:'150,25'});assert.ok(valued.includes('5406150.25'));assert.equal(valued.slice(-4),crc16(valued.slice(0,-4)));
});
test('PIX rejeita recebedor incompleto e chave em formato errado',()=>{for(const key of ['','https://example.com','123'])assert.throws(()=>buildPixPayload({key,name:'Teste',city:'Leme'}),/chave/i);assert.throws(()=>buildPixPayload({key:'fulano@example.com',name:'',city:'Leme'}),/proprietário/);});
test('Recibo usa exclusivamente receita paga, preserva referência e não expõe notas internas',()=>{
 const tx={id:'tx1',type:'rec',paid:'Pago',val:150,date:'2026-10-10',desc:'Reparo',internalNotes:'segredo'};const before=structuredClone(tx);const model=buildReceiptModel(tx,{clientName:'Cliente',vehicle:'Veículo'},{nome:'Oficina'});assert.equal(model.total,150);assert.equal(model.quoteNumber,'REC-tx1');assert.equal(model.clientName,'Cliente');assert.ok(!JSON.stringify(model).includes('segredo'));assert.deepEqual(tx,before);
 for(const changes of [{paid:'Não pago'},{type:'dep'},{val:0}])assert.throws(()=>buildReceiptModel({...tx,...changes},{clientName:'Cliente',vehicle:'Veículo'}));
});
test('PDF contém índice de objetos com offsets corretos e quantidade de páginas',async()=>{
 const blob=jpegPagesPdf([{width:2,height:2,bytes:new Uint8Array([255,216,255,217])},{width:2,height:2,bytes:new Uint8Array([255,216,255,217])}]);const bytes=new Uint8Array(await blob.arrayBuffer()),raw=new TextDecoder('latin1').decode(bytes);assert.equal(blob.type,'application/pdf');assert.match(raw,/\/Count 2/);const start=Number(/startxref\n(\d+)/.exec(raw)[1]);assert.equal(new TextDecoder().decode(bytes.slice(start,start+4)),'xref');const entries=raw.slice(raw.indexOf('xref\n')).split('\n').slice(3,11);for(let i=0;i<entries.length;i++){const offset=Number(entries[i].slice(0,10));assert.ok(new TextDecoder().decode(bytes.slice(offset,offset+12)).startsWith(`${i+1} 0 obj`));}
});
test('Catálogo de peças começa vazio, preserva legado e cria cópia preventiva ao excluir',async()=>{
 const repos=repositories(),s=createPartsCatalogService(repos);assert.deepEqual(await s.list(),[]);const row=await s.put({nome:'Peça',condicao:'Boa',valor:'75,50',qtd:2});assert.equal(row.valor,75.5);await s.put({...row,aplicacao:'Veículo teste'});assert.equal((await s.list()).length,1);await s.remove(row.id);assert.equal((await s.list()).length,0);assert.equal((await repos.deletionBackups.list())[0].payload.nome,'Peça');assert.equal((await repos.transactions.list()).length,0);assert.equal((await repos.stock.list()).length,0);
});
test('Foto por etapa persiste sem mudar etapa, checklist ou financeiro',async()=>{
 const repos=repositories({workOrders:[{id:'os1',stage:'entrada',status:'Agendada',clientName:'Cliente'}]}),s=createOrdemServicoService({repositories:repos});const photo='data:image/jpeg;base64,AAAA';const next=await s.addStagePhoto('os1','pintura',photo);assert.equal(next.stage,'entrada');assert.equal(next.stagePhotos[0].stage,'pintura');assert.equal((await repos.transactions.list()).length,0);assert.equal((await repos.checklists.list()).length,0);await assert.rejects(s.addStagePhoto('os1','inválida',photo),/Etapa/);await assert.rejects(s.addStagePhoto('os1','entrada','https://example.com/foto.jpg'),/Foto/);await s.removeStagePhoto('os1',next.stagePhotos[0].id);assert.equal((await s.get('os1')).stagePhotos.length,0);
});
test('Manual busca instruções reais e não inventa assunto ausente',()=>{assert.equal(searchManual('recibo')[0].id,'financeiro');assert.equal(searchManual('pix')[0].id,'pix');assert.equal(searchManual('astronomia galáxia').length,0);assert.ok(searchManual('solda')[0].steps.join(' ').includes('Não sei'));});
test('Orçamento preserva vínculo com material e peça após salvar e reabrir',()=>{const record=recordFromDraft({clientName:'Cliente',service:'Serviço',materials:[{stockId:13,name:'Material',qty:2,unit:5}],parts:[{catalogId:14,name:'Peça',value:20}]});const draft=draftFromBudget(record);assert.equal(draft.materials[0].stockId,13);assert.equal(draft.parts[0].catalogId,14);assert.equal(record.total,30);});

test('Receita do orçamento é única e é reutilizada pela sincronização de OS entregue',async()=>{
 const repos=repositories({budgets:[{id:'budget1',clientName:'Cliente',service:'Reparo',total:150}]}),service=createFinancialServices({repositories:repos}).financeiro;
 const first=await service.createBudgetReceipt('budget1'),second=await service.createBudgetReceipt('budget1');assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.transaction.paid,'Não pago');assert.equal((await repos.transactions.list()).length,1);
 await repos.workOrders.put({id:'os1',budgetId:'budget1',status:'Entregue',financialSyncPending:true,value:150});const synced=await service.syncDeliveredWorkOrders();assert.equal(synced.added,0);assert.equal((await repos.transactions.list()).length,1);assert.equal((await repos.workOrders.get('os1')).financialTransactionId,first.transaction.id);
 await assert.rejects(service.receiptContext(first.transaction.id),/receita marcada como paga/);await service.setPaid(first.transaction.id,true);const context=await service.receiptContext(first.transaction.id);assert.equal(context.clientName,'Cliente');
});

test('Manual apresenta ranking local como receita e admite assunto desconhecido',async()=>{
 const repos=repositories(),s=createConsultorService({repositories:repos,relatoriosService:{sanitizedSnapshot:async()=>({topServices:[{name:'Pintura',value:200}],current:{}})},fetcher:()=>{throw new Error('Não deve acessar a rede');}});
 const ranking=await s.ask({message:'Quais serviços aparecem mais no histórico?'});assert.match(ranking.answer,/Pintura/);assert.match(ranking.answer,/não representa quantidade/);const unknown=await s.ask({message:'astronomia galáxia'});assert.match(unknown.answer,/Não sei/);assert.equal((await repos.settings.list()).length,0);
});
