export const br = (v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const num = (v)=>{const x=Number(String(v??'0').replace(',','.'));return Number.isFinite(x)?x:0};
export const pct = (v)=>`${Number(v||0).toFixed(0)}%`;
export const dateBR = (s)=> s ? String(s).split('-').reverse().join('/') : '';
export const uid = (p)=>`${p}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`;
export const norm = (s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
export const addMonths=(dateStr,months)=>{const d=new Date(dateStr+'T00:00:00');d.setMonth(d.getMonth()+months);return d.toISOString().slice(0,10)};
