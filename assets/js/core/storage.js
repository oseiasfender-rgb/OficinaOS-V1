import {STATE} from './state.js?v=546113';
const KEY='ofix_state_v546_11';
export function persistState(){try{localStorage.setItem(KEY,JSON.stringify(STATE));return true}catch(e){console.warn('persistState',e);return false}}
export function hydrateState(){try{const raw=localStorage.getItem(KEY);if(!raw)return false;const saved=JSON.parse(raw);Object.assign(STATE.config,saved.config||{});for(const k of ['clientes','orcamentos','financeiro','contas','agenda','metas','relatorios','ia']) Object.assign(STATE[k],saved[k]||{});return true}catch(e){console.warn('hydrateState',e);return false}}
export function clearState(){localStorage.removeItem(KEY)}
export const STORAGE_KEY=KEY;
