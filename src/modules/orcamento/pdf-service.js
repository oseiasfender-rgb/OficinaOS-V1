import { formatBRL } from '../../core/money.js';
import { calculateBudget } from './orcamento-calculator.js';
import { quotePages, renderQuotePage, quotePngBlobs } from './quote-template.js';
import { draftFromBudget } from './orcamento-model.js';

function arr(v){return Array.isArray(v)?v:[];}
function text(v){return String(v??'').trim();}

export function buildCommercialQuoteModel(record, settings = {}){
  const draft=draftFromBudget(record); const calc=calculateBudget(draft);
  const commercialFactor=calc.manualBase>0?calc.final/calc.manualBase:0;
  const parts=arr(draft.parts).filter(p=>text(p.name)||Number(p.value)>0).map(p=>({label:text(p.name)||'Peça / componente',value:(Number(p.value)||0)*commercialFactor,condition:text(p.condition)}));
  const items=[];
  if(calc.usesLegacyTotalFallback)items.push({label:'Serviços e materiais inclusos',description:'Serviço conforme avaliação',value:calc.final});
  else {
    for(const process of draft.laborProcesses){const v=Number(process.hours)*Number(draft.hourRate)*commercialFactor;if(v>0)items.push({label:process.label,description:'Serviço conforme avaliação técnica',value:v});}
    if(calc.materials>0)items.push({label:'Materiais de preparação e pintura',description:'Insumos incluídos no serviço',value:calc.materials*commercialFactor});
    const itemFactor=calc.serviceItems>0?calc.serviceItemsNet/calc.serviceItems:0;
    for(const item of draft.serviceItems){const v=Number(item.qty)*Number(item.value)*itemFactor*commercialFactor;if(v>0)items.push({label:item.stage||'Serviço',description:item.desc,value:v});}
    if(calc.thirdParties>0)items.push({label:'Serviços de terceiros',description:'Serviços complementares',value:calc.thirdParties*commercialFactor});
    if(calc.freight>0)items.push({label:'Deslocamento / frete',description:'Transporte',value:calc.freight*commercialFactor});
  }
  // Distribui os centavos para que a tabela comercial feche exatamente no total.
  const all=[...items,...parts];let allocated=0,cumulative=0;
  all.forEach((item,index)=>{cumulative+=item.value;const target=index===all.length-1?Math.round(calc.final*100):Math.round(cumulative*100);item.value=(target-allocated)/100;allocated=target;});
  return Object.freeze({
    quoteNumber:text(record.numero ?? record.number ?? record.id), companyName:text(settings.nome ?? settings.companyName ?? 'OficinaOS'), companyOwner:text(settings.dono ?? settings.owner), companyPhone:text(settings.fone ?? settings.phone), companyDocument:text(settings.cnpj ?? settings.document), companyCity:text(settings.cidade ?? settings.city), companyAddress:text(settings.endereco ?? settings.address),companySubtitle:text(settings.subtitulo ?? settings.subtitle),
    clientName:draft.clientName, clientPhone:draft.clientPhone, vehicle:draft.vehicle, vehiclePlate:draft.vehiclePlate, vehicleYear:draft.vehicleYear, vehicleColor:draft.vehicleColor,
    service:draft.service, entryDate:draft.entryDate, dueDate:draft.dueDate, notes:draft.notes, payment:draft.payment, warrantyDays:draft.warrantyDays,
    validityDays:draft.validityDays,deadlineText:draft.deadlineText,commercialComplexity:draft.commercialComplexity||calc.complexity.label,photo:draft.quotePhoto,issueDate:(draft.entryDate||new Date().toISOString().slice(0,10)).split('-').reverse().join('/'),
    items:Object.freeze(items), parts:Object.freeze(parts), total:Math.round(calc.final*100)/100,
    generatedAt:new Date().toISOString()
  });
}

function pagesFor(model){const ctx=document.createElement('canvas').getContext('2d');return quotePages(model,(t,size)=>{ctx.font=`${size}px Arial`;return ctx.measureText(String(t)).width;});}
export function printCommercialQuote(record,settings={}){
  const model=buildCommercialQuoteModel(record,settings),overlay=document.createElement('div');overlay.className='commercial-print-overlay';
  for(const page of pagesFor(model))overlay.append(renderQuotePage(page));document.body.append(overlay);
  const cleanup=()=>overlay.remove();window.addEventListener('afterprint',cleanup,{once:true});window.print();setTimeout(cleanup,60000);return model;
}
export async function downloadCommercialQuotePng(record,settings={}){
  const model=buildCommercialQuoteModel(record,settings),blobs=await quotePngBlobs(pagesFor(model));
  const base=`Orcamento_${model.quoteNumber||'rascunho'}`.replace(/[^a-zA-Z0-9_-]/g,'_');
  for(const [i,blob]of blobs.entries()){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${base}_${i+1}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}return {pages:blobs.length};
}
