export const requireFields=(obj,fields)=>fields.filter(f=>!obj[f]);
export const isPaidLocked=(orc)=>['pago','faturado','entregue'].includes(orc?.status);
export const approx=(a,b)=>Math.abs(Number(a)-Number(b))<0.01;
