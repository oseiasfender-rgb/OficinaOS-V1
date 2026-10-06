import { formatBRL } from '../../core/money.js';
import { calculateBudget } from './orcamento-calculator.js';
import { draftFromBudget } from './orcamento-model.js';

function arr(v){return Array.isArray(v)?v:[];}
function text(v){return String(v??'').trim();}

export function buildCommercialQuoteModel(record, settings = {}){
  const draft=draftFromBudget(record); const calc=calculateBudget(draft);
  const commercialFactor=calc.manualBase>0?calc.final/calc.manualBase:0;
  const parts=arr(draft.parts).filter(p=>text(p.name)||Number(p.value)>0).map(p=>({label:text(p.name)||'Peça / componente',value:(Number(p.value)||0)*commercialFactor,condition:text(p.condition)}));
  const items=[];
  const combined=(calc.labor+calc.materials+calc.serviceItemsNet)*commercialFactor;
  const thirdCommercial=calc.thirdParties*commercialFactor;
  const freightCommercial=calc.freight*commercialFactor;
  if(calc.usesLegacyTotalFallback)items.push({label:'Serviços e materiais inclusos',value:calc.final});
  else if(combined>0)items.push({label:'Serviços e materiais inclusos',value:combined});
  if(thirdCommercial>0)items.push({label:'Serviços de terceiros',value:thirdCommercial});
  if(freightCommercial>0)items.push({label:'Deslocamento / frete',value:freightCommercial});
  return Object.freeze({
    quoteNumber:text(record.numero ?? record.number ?? record.id), companyName:text(settings.nome ?? settings.companyName ?? 'OficinaOS'), companyOwner:text(settings.dono ?? settings.owner), companyPhone:text(settings.fone ?? settings.phone), companyDocument:text(settings.cnpj ?? settings.document), companyCity:text(settings.cidade ?? settings.city),
    clientName:draft.clientName, clientPhone:draft.clientPhone, vehicle:draft.vehicle, vehiclePlate:draft.vehiclePlate, vehicleYear:draft.vehicleYear, vehicleColor:draft.vehicleColor,
    service:draft.service, entryDate:draft.entryDate, dueDate:draft.dueDate, notes:draft.notes, payment:draft.payment, warrantyDays:draft.warrantyDays,
    items:Object.freeze(items), parts:Object.freeze(parts), total:calc.final,
    generatedAt:new Date().toISOString()
  });
}

function node(tag,className,textValue){const e=document.createElement(tag);if(className)e.className=className;if(textValue!=null)e.textContent=String(textValue);return e;}
function row(label,value){const r=node('div','quote-line');r.append(node('span','',label),node('strong','',value));return r;}

export function printCommercialQuote(record, settings = {}){
  const model=buildCommercialQuoteModel(record,settings);
  const overlay=node('div','commercial-print-overlay');const sheet=node('article','commercial-print-sheet');
  const head=node('header','commercial-print-head');const company=node('div');company.append(node('h1','',model.companyName),node('p','',model.companyDocument),node('p','',model.companyPhone));head.append(company,node('div','commercial-print-number',`ORÇAMENTO ${model.quoteNumber||''}`));
  const client=node('section','commercial-print-section');client.append(node('h2','','Cliente e veículo'),row('Cliente',model.clientName||'—'),row('Veículo',[model.vehicle,model.vehiclePlate,model.vehicleYear].filter(Boolean).join(' · ')||'—'));
  const scope=node('section','commercial-print-section');scope.append(node('h2','','Escopo'));scope.append(node('p','commercial-print-service',model.service||'Serviço conforme avaliação técnica.'));
  if(model.notes)scope.append(node('p','commercial-print-notes',model.notes));
  const values=node('section','commercial-print-section');values.append(node('h2','','Investimento'));
  for(const item of model.items)values.append(row(item.label,formatBRL(item.value)));
  for(const part of model.parts)values.append(row(`${part.label}${part.condition?` · ${part.condition}`:''}`,formatBRL(part.value)));
  values.append(row('TOTAL',formatBRL(model.total)));
  const conditions=node('section','commercial-print-section commercial-print-conditions');conditions.append(node('h2','','Condições'));if(model.payment)conditions.append(row('Pagamento',model.payment));if(model.warrantyDays)conditions.append(row('Garantia',`${model.warrantyDays} dias`));if(model.dueDate)conditions.append(row('Previsão de entrega',model.dueDate));
  const foot=node('footer','commercial-print-footer',`${model.companyName}${model.companyCity?` · ${model.companyCity}`:''}`);
  sheet.append(head,client,scope,values,conditions,foot);overlay.append(sheet);document.body.append(overlay);
  const cleanup=()=>overlay.remove();window.addEventListener('afterprint',cleanup,{once:true});window.print();setTimeout(()=>{if(document.body.contains(overlay))cleanup();},60000);
  return model;
}
