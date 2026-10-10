import QRCode from 'qrcode';
import { parseBRL, formatBRL } from '../../core/money.js';
import { el, button, labeledField } from '../../ui/dom.js';
import { shareOrDownload, dataUrlBlob } from './document-files.js';

export const PIX_REFERENCE='https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf';
export function crc16(value){let crc=0xffff;for(const byte of new TextEncoder().encode(value)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
function field(id,value){const length=new TextEncoder().encode(value).length;if(length>99)throw new Error('Campo PIX excede o tamanho permitido.');return id+String(length).padStart(2,'0')+value;}
function label(v,max){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 .-]/g,'').trim().slice(0,max);}
export function buildPixPayload({key,name,city,value=0}){
 key=String(key??'').trim();if(!key||key.length>77||!/^[\x21-\x7e]+$/.test(key))throw new Error('Confira a chave PIX em Configurações.');
 if(!(/^\d{11}$/.test(key)||/^[A-Z0-9]{12}\d{2}$/i.test(key)||/^\+[1-9]\d{7,14}$/.test(key)||/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)||/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(key)))throw new Error('Chave PIX em formato inválido. Use CPF/CNPJ sem pontuação, telefone internacional, e-mail ou chave aleatória.');
 name=label(name,25);city=label(city,15);if(!name||!city)throw new Error('Informe proprietário e cidade em Configurações.');
 const amount=parseBRL(value);if(amount<0||!Number.isFinite(amount)||amount>9999999999.99)throw new Error('Valor PIX inválido.');
 const payload=field('00','01')+field('26',field('00','br.gov.bcb.pix')+field('01',key))+field('52','0000')+field('53','986')+(amount>0?field('54',amount.toFixed(2)):'')+field('58','BR')+field('59',name)+field('60',city)+field('62',field('05','***'))+'6304';return payload+crc16(payload);
}
export function openPixPanel(host,configuration,initialValue=0){
 host.querySelector('.pix-editor')?.remove();const panel=el('section','card pix-editor');panel.append(el('h2','','PIX avulso'),el('p','muted','Gerar este código não registra receita nem confirma pagamento. Confira o recebimento no banco.'));
 const value=el('input','mod-input');value.inputMode='decimal';value.value=String(initialValue).replace('.',',');const generate=button('Gerar PIX','btn'),image=el('img'),code=el('textarea','mod-input'),feedback=el('p','status-line');image.alt='QR Code PIX';image.hidden=true;code.readOnly=true;code.rows=4;code.setAttribute('aria-label','PIX copia e cola');const copy=button('Copiar código','btn'),share=button('Compartilhar QR Code','btn'),close=button('Fechar','btn');copy.disabled=share.disabled=true;let currentBlob=null;
 value.addEventListener('input',()=>{copy.disabled=share.disabled=true;code.value='';image.hidden=true;currentBlob=null;});
 generate.addEventListener('click',async()=>{try{const cfg=await configuration();const payload=buildPixPayload({key:cfg.pix,name:cfg.dono||cfg.nome,city:cfg.cidade,value:value.value});const url=await QRCode.toDataURL(payload,{errorCorrectionLevel:'M',margin:4,width:512});currentBlob=dataUrlBlob(url);image.src=url;image.hidden=false;code.value=payload;copy.disabled=share.disabled=false;feedback.textContent=`Código preparado — ${formatBRL(parseBRL(value.value))}. Confira o recebedor no aplicativo do banco.`;}catch(e){feedback.textContent=e.message;}});
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.value);feedback.textContent='Código copiado.';}catch{code.select();feedback.textContent='Selecione e copie o código exibido.';}});share.addEventListener('click',async()=>{try{if(currentBlob)await shareOrDownload([new File([currentBlob],'PIX.png',{type:'image/png'})],{title:'PIX'});}catch(e){feedback.textContent=e.message;}});close.addEventListener('click',()=>panel.remove());const actions=el('div','row-actions');actions.append(generate,copy,share,close);panel.append(labeledField('Valor (zero permite valor livre)',value),actions,image,code,feedback);host.prepend(panel);panel.scrollIntoView({behavior:'smooth',block:'start'});return panel;
}
