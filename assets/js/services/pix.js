import {uid} from '../utils/format.js';
export function gerarPix({cliente,valor,refId}){return {id:uid('pix'),refId,clienteId:cliente?.id,valor,codigo:`PIX-SIMULADO-${refId}-${Math.round(valor*100)}`,status:'gerado',createdAt:new Date().toISOString()}}
