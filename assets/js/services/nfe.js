import {uid} from '../utils/format.js?v=546113';
export function gerarNFe({cliente,valor,refId}){return {id:uid('nfe'),refId,clienteId:cliente?.id,valor,numero:'NFE-SIM-'+String(Math.floor(Math.random()*9000)+1000),status:'preparada',createdAt:new Date().toISOString()}}
