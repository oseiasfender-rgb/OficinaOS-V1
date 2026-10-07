import test from 'node:test';
import assert from 'node:assert/strict';
import { recordFromDraft,draftFromBudget } from '../../src/modules/orcamento/orcamento-model.js';
import { buildCommercialQuoteModel } from '../../src/modules/orcamento/pdf-service.js';
import { quotePages } from '../../src/modules/orcamento/quote-template.js';
const input={clientName:'Cliente de teste',service:'Reparo',validityDays:'15',deadlineText:'3 a 5 dias úteis',commercialComplexity:'Baixa / Média',payment:'50% entrada + 50% na entrega',warrantyDays:'90',serviceItems:[{stage:'Reparo',desc:'Correção de deformações',qty:1,value:250},{stage:'Pintura',desc:'Pintura completa',qty:1,value:350}]};
test('Modelo Premium preserva prazo, validade, etapas e foto sem alterar o cálculo',()=>{
 const record=recordFromDraft({...input,quotePhoto:'data:image/png;base64,AAAA'}),draft=draftFromBudget(record),model=buildCommercialQuoteModel(record,{nome:'Oficina teste',endereco:'Rua de teste',subtitulo:'Reparações Automotivas'});
 assert.equal(record.total,600);assert.equal(draft.validityDays,'15');assert.equal(draft.quotePhoto,record.quotePhoto);assert.equal(model.companyAddress,'Rua de teste');assert.equal(model.items[0].label,'Reparo');assert.equal(model.items[0].description,'Correção de deformações');assert.equal(model.photo,record.quotePhoto);
 const text=quotePages(model).flatMap(p=>p.commands).filter(c=>c.kind==='text').map(c=>c.text).join(' ');for(const term of ['ORÇAMENTO PREMIUM','APROVAÇÃO DO CLIENTE','15 dias','3 a 5 dias úteis','Baixa / Média','R$ 600,00'])assert.ok(text.includes(term),term);
});
test('Modelo comercial fecha a soma em centavos e não expõe custos internos',()=>{
 const record=recordFromDraft({...input,hourRate:55,laborProcesses:[{label:'Funilaria',hours:2.3}],materials:[{name:'Material confidencial',qty:1,unit:31.17}],marginPercent:5,complexity:'medio',internalNotes:'Segredo interno'}),model=buildCommercialQuoteModel(record);
 assert.equal(Math.round([...model.items,...model.parts].reduce((s,x)=>s+x.value,0)*100),Math.round(model.total*100));assert.ok(!JSON.stringify(model).includes('Material confidencial'));assert.ok(!JSON.stringify(model).includes('Segredo interno'));
});
test('Paginação preserva todas as etapas e observações extensas sem ultrapassar o rodapé',()=>{
 const record=recordFromDraft({...input,serviceItems:Array.from({length:40},(_,i)=>({stage:`Etapa ${i+1}`,desc:'Descrição detalhada do serviço',qty:1,value:10})),notes:('Informação pública importante. ').repeat(95)}),model=buildCommercialQuoteModel(record),pages=quotePages(model);
 assert.ok(pages.length>2);const commands=pages.flatMap(p=>p.commands);assert.equal(commands.filter(c=>c.kind==='text'&&/^Etapa \d+$/.test(c.text)).length,40);assert.ok(commands.filter(c=>c.kind==='text').every(c=>c.y<1123));assert.equal(commands.filter(c=>c.kind==='text'&&c.text==='TOTAL DO INVESTIMENTO').length,1);
});
test('Foto aceita apenas dados JPEG/PNG locais, sem URLs externas ou SVG',()=>{
 for(const url of ['https://example.com/foto.jpg','data:image/svg+xml;base64,AAAA','javascript:alert(1)'])assert.equal(recordFromDraft({...input,quotePhoto:url}).quotePhoto,'');
});

test('Distribuição dos centavos não cria etapas com valor negativo',()=>{
 const record=recordFromDraft({...input,serviceItems:Array.from({length:100},()=>({desc:'Item',qty:1,value:.01})),discountPercent:50});const model=buildCommercialQuoteModel(record);assert.ok(model.items.every(x=>x.value>=0));assert.equal(Math.round(model.items.reduce((s,x)=>s+x.value,0)*100),50);
});
