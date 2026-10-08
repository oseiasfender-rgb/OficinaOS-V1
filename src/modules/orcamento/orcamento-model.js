import { safeText } from '../../core/validators.js';
import { parseBRL } from '../../core/money.js';
import { calculateBudget, complexityFrom } from './orcamento-calculator.js';

function validQuotePhoto(value){return typeof value==='string'&&value.length<=2500000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)?value:'';}

function arr(value){ return Array.isArray(value) ? value : []; }
function clone(value){ return structuredClone(value); }
function text(value,max=1000){ return safeText(value,max); }
function multiline(value,max){return String(value??'').slice(0,max).split(/\r?\n/).map(line=>safeText(line,max)).join('\n');}
function amount(value){ return Math.max(0, parseBRL(value)); }

export function createEmptyBudgetDraft(){
  const today = new Date().toISOString().slice(0,10);
  return {
    id:null, clientId:null, clientName:'', clientPhone:'', vehicle:'', vehicleColor:'', vehiclePlate:'', vehicleYear:'', vehicleKm:'',
    validityDays:'', deadlineText:'', commercialComplexity:'',quotePhoto:'',
    service:'', entryDate:today, dueDate:'', priority:'normal', payment:'', warrantyDays:'', notes:'', internalNotes:'',
    complexity:'basico', hourRate:0, laborProcesses:[
      {key:'desmontagem',label:'Desmontagem',hours:0},{key:'funilaria',label:'Funilaria',hours:0},{key:'solda',label:'Solda',hours:0},
      {key:'preparacao',label:'Preparação',hours:0},{key:'pintura',label:'Pintura',hours:0},{key:'montagem',label:'Montagem',hours:0},{key:'polimento',label:'Polimento',hours:0}
    ],
    materials:[], serviceItems:[], serviceItemsDiscount:0, parts:[], thirdParties:[], freight:{displacement:0,parts:0,tow:0},
    marginPercent:0, discountPercent:0, status:'Rascunho', legacyTotal:0
  };
}

function normalizeMaterial(item,index){ return { id:item?.id ?? `mat_${index+1}`, name:text(item?.name ?? item?.nome,160), qty:amount(item?.qty ?? item?.quantity), unit:amount(item?.unit ?? item?.custo ?? item?.cost), unid:text(item?.unid ?? item?.unitLabel,30) }; }
function normalizeServiceItem(item,index){ return { id:item?.id ?? `svc_${index+1}`, stage:text(item?.stage,100), desc:text(item?.desc ?? item?.description,300), qty:amount(item?.qty ?? item?.quantity ?? 1), value:amount(item?.value ?? item?.valor ?? item?.unitValue) }; }
function normalizePart(item,index){ return { id:item?.id ?? `part_${index+1}`, name:text(item?.name ?? item?.nome,180), category:text(item?.category ?? item?.categoria,80), condition:text(item?.condition ?? item?.condicao ?? 'Boa',40), application:text(item?.application ?? item?.aplicacao,160), qty:amount(item?.qty ?? item?.qtd ?? 1), value:amount(item?.value ?? item?.valor ?? item?.total) }; }
function normalizeThird(item,index){ return { id:item?.id ?? `third_${index+1}`, desc:text(item?.desc ?? item?.description ?? item?.nome,220), value:amount(item?.value ?? item?.valor ?? item?.total) }; }
function normalizeProcess(item,index){ return { key:text(item?.key ?? item?.id ?? `proc_${index+1}`,50), label:text(item?.label ?? item?.name ?? item?.nome,80), hours:amount(item?.hours ?? item?.horas) }; }

export function draftFromBudget(record = {}){
  const page = record.paginaOrcamento ?? record.page ?? {};
  const values = page.values ?? {};
  const base = createEmptyBudgetDraft();
  const complexity = complexityFrom(record.complexityMultiplier ?? record.complexidade ?? page.complexity ?? base.complexity);
  const processes = arr(record.laborProcesses ?? page.laborProcesses);
  return {
    ...base,
    id:record.id ?? null,
    clientId:record.clientId ?? record.clienteId ?? null,
    clientName:text(record.clientName ?? record.cliente ?? values.clientName,120), clientPhone:text(record.clientPhone ?? values.clientPhone,60),
    vehicle:text(record.vehicle ?? record.veiculo ?? values.vehicle,160), vehicleColor:text(record.vehicleColor ?? values.vehicleCor,60), vehiclePlate:text(record.vehiclePlate ?? values.vehiclePlaca,20), vehicleYear:text(record.vehicleYear ?? values.vehicleAno,12), vehicleKm:text(record.vehicleKm ?? values.vehicleKm,20),
    validityDays:text(record.validityDays,20),deadlineText:text(record.deadlineText,160),commercialComplexity:text(record.commercialComplexity,80),quotePhoto:validQuotePhoto(record.quotePhoto),
    service:multiline(record.service ?? record.servico ?? record.descricao ?? values.serviceType,1500), entryDate:text(record.entryDate ?? record.data ?? values.dataEntrada,10), dueDate:text(record.dueDate ?? values.dataEntrega,10),
    priority:text(record.priority ?? record.prioridade ?? 'normal',40), payment:text(record.payment ?? record.pagto ?? values.orcPagamento,250), warrantyDays:text(record.warrantyDays ?? values.orcGarantia,20),
    notes:multiline(record.notes ?? record.obs ?? values.notes,3000), internalNotes:text(record.internalNotes ?? record.obsInterna ?? values.orcObsInterna,3000),
    complexity:complexity.key, hourRate:amount(record.hourRate ?? values.hourRate),
    laborProcesses:processes.length ? processes.map(normalizeProcess) : base.laborProcesses,
    materials:arr(record.materials ?? page.materials).map(normalizeMaterial),
    serviceItems:arr(record.serviceItems ?? page.services).map(normalizeServiceItem), serviceItemsDiscount:amount(record.serviceItemsDiscount ?? values.svcsDesconto),
    parts:arr(record.parts ?? page.parts).map(normalizePart), thirdParties:arr(record.thirdParties ?? page.thirdParties).map(normalizeThird),
    freight:{ displacement:amount(record.freight?.displacement ?? values.freteDeslocamento), parts:amount(record.freight?.parts ?? values.fretePecas), tow:amount(record.freight?.tow ?? values.freteReboque) },
    marginPercent:amount(record.marginPercent ?? values.marginSlider), discountPercent:amount(record.discountPercent ?? values.discSlider), status:text(record.status ?? 'Salvo',40), legacyTotal:amount(record.total)
  };
}

export function normalizeBudgetDraft(input = {}){
  const base = createEmptyBudgetDraft();
  const draft = { ...base, ...clone(input) };
  draft.clientName=text(draft.clientName,120); draft.clientPhone=text(draft.clientPhone,60); draft.vehicle=text(draft.vehicle,160); draft.vehicleColor=text(draft.vehicleColor,60); draft.vehiclePlate=text(draft.vehiclePlate,20).toUpperCase(); draft.vehicleYear=text(draft.vehicleYear,12); draft.vehicleKm=text(draft.vehicleKm,20);
  draft.validityDays=text(draft.validityDays,20);draft.deadlineText=text(draft.deadlineText,160);draft.commercialComplexity=text(draft.commercialComplexity,80);draft.quotePhoto=validQuotePhoto(draft.quotePhoto);
  draft.service=multiline(draft.service,1500); draft.notes=multiline(draft.notes,3000); draft.internalNotes=text(draft.internalNotes,3000); draft.payment=text(draft.payment,250); draft.priority=text(draft.priority || 'normal',40); draft.warrantyDays=text(draft.warrantyDays,20);
  draft.hourRate=amount(draft.hourRate); draft.legacyTotal=amount(draft.legacyTotal); draft.marginPercent=amount(draft.marginPercent); draft.discountPercent=amount(draft.discountPercent); draft.serviceItemsDiscount=amount(draft.serviceItemsDiscount);
  draft.laborProcesses=arr(draft.laborProcesses).map(normalizeProcess); draft.materials=arr(draft.materials).map(normalizeMaterial); draft.serviceItems=arr(draft.serviceItems).map(normalizeServiceItem); draft.parts=arr(draft.parts).map(normalizePart); draft.thirdParties=arr(draft.thirdParties).map(normalizeThird);
  draft.freight={displacement:amount(draft.freight?.displacement),parts:amount(draft.freight?.parts),tow:amount(draft.freight?.tow)};
  draft.complexity=complexityFrom(draft.complexity).key;
  return draft;
}

export function legacyPageFromDraft(draft){
  const calc=calculateBudget(draft); const totalHours=calc.hours;
  return {
    values:{ dataEntrada:draft.entryDate||'', dataEntrega:draft.dueDate||'', clientName:draft.clientName||'', clientPhone:draft.clientPhone||'', vehicle:draft.vehicle||'', vehicleCor:draft.vehicleColor||'', vehiclePlaca:draft.vehiclePlate||'', vehicleAno:draft.vehicleYear||'', vehicleKm:draft.vehicleKm||'', serviceType:draft.service||'', notes:draft.notes||'', orcObsInterna:draft.internalNotes||'', orcGarantia:draft.warrantyDays||'', orcPagamento:draft.payment||'', svcsDesconto:draft.serviceItemsDiscount||0, freteDeslocamento:draft.freight?.displacement||0, fretePecas:draft.freight?.parts||0, freteReboque:draft.freight?.tow||0, thirdParty:calc.thirdParties, transport:calc.freight, hourRate:draft.hourRate||0, rateSlider:draft.hourRate||0, marginSlider:draft.marginPercent||0, discSlider:draft.discountPercent||0, hours:totalHours, 'orc-h-total':String(totalHours) },
    complexity:complexityFrom(draft.complexity).label,
    laborProcesses:clone(draft.laborProcesses), services:clone(draft.serviceItems), thirdParties:clone(draft.thirdParties), materials:clone(draft.materials), parts:clone(draft.parts), checklist:null, savedAt:new Date().toISOString()
  };
}

export function recordFromDraft(input, previous = null){
  const draft=normalizeBudgetDraft(input); const calc=calculateBudget(draft); const now=new Date().toISOString(); const complexity=complexityFrom(draft.complexity);
  return {
    ...(previous ? clone(previous) : {}),
    id:draft.id ?? previous?.id ?? null, clientId:draft.clientId ?? previous?.clientId ?? null, clienteId:draft.clientId ?? previous?.clienteId ?? null,
    clientName:draft.clientName, cliente:draft.clientName, clientPhone:draft.clientPhone,
    vehicle:draft.vehicle, veiculo:draft.vehicle, vehicleColor:draft.vehicleColor, vehiclePlate:draft.vehiclePlate, vehicleYear:draft.vehicleYear, vehicleKm:draft.vehicleKm,
    validityDays:draft.validityDays,deadlineText:draft.deadlineText,commercialComplexity:draft.commercialComplexity,quotePhoto:draft.quotePhoto,
    service:draft.service, servico:draft.service, descricao:draft.service, entryDate:draft.entryDate, data:draft.entryDate || now.slice(0,10), dueDate:draft.dueDate,
    priority:draft.priority, prioridade:draft.priority, payment:draft.payment, pagto:draft.payment, warrantyDays:draft.warrantyDays, notes:draft.notes, obs:draft.notes, internalNotes:draft.internalNotes, obsInterna:draft.internalNotes,
    complexity:complexity.key, complexidade:complexity.label, complexityMultiplier:complexity.multiplier,
    hourRate:draft.hourRate, laborProcesses:clone(draft.laborProcesses), materials:clone(draft.materials), serviceItems:clone(draft.serviceItems), serviceItemsDiscount:draft.serviceItemsDiscount, parts:clone(draft.parts), thirdParties:clone(draft.thirdParties), freight:clone(draft.freight), marginPercent:draft.marginPercent, discountPercent:draft.discountPercent,
    calculation:clone(calc), total:Math.round(calc.final*100)/100, totalFmt:(Math.round(calc.final*100)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), status:draft.status==='Rascunho'?'Salvo':draft.status,
    paginaOrcamento:legacyPageFromDraft(draft), createdAt:previous?.createdAt ?? now, updatedAt:now, source:previous?.source ?? 'modular-v0.6'
  };
}
