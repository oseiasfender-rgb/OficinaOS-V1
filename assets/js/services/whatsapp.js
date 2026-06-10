export function linkWhatsApp(tel,msg){const n=String(tel||'').replace(/\D/g,'');return `https://wa.me/55${n}?text=${encodeURIComponent(msg)}`}
