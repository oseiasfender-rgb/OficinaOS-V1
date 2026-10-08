import { formatBRL } from '../../core/money.js';
const WIDTH=794, HEIGHT=1123, M=24, W=WIDTH-M*2, INK='#321b10', ACCENT='#a65b18', LIGHT='#f4e7d8';
const value=v=>String(v??'').trim();
export function quotePages(model,measure=(t,size)=>String(t).length*size*.53){
 const pages=[];let commands=[],y=0;
 const rect=(x,y,w,h,fill='#fff',stroke='#b8a08e')=>commands.push({kind:'rect',x,y,w,h,fill,stroke});
 const txt=(text,x,y,size=11,bold=false,color=INK)=>commands.push({kind:'text',text:value(text),x,y,size,bold,color});
 function wrap(text,width,size){const lines=[];for(const paragraph of value(text).split(/\n/)){let line='';for(const word of paragraph.split(/\s+/)){if(measure(word,size)>width){if(line){lines.push(line);line='';}let piece='';for(const ch of word){if(measure(piece+ch,size)>width){lines.push(piece);piece='';}piece+=ch;}line=piece;continue;}if(line&&measure(line+' '+word,size)>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}return lines.length?lines:[''];}
 function lines(text,x,top,width,size=11,bold=false){const ls=wrap(text,width,size);ls.forEach((t,i)=>txt(t,x,top+i*(size+5),size,bold));return ls.length*(size+5);}
 function footer(){txt(`${model.companyOwner?model.companyOwner+' - Responsável Técnico - ':''}${model.companyName}`,M,HEIGHT-38,10);}
 function start(){commands=[];txt(model.companyName,M,35,24,true);txt(model.companySubtitle,M,66,13,true);txt(model.companyAddress||model.companyCity,M,91,10);rect(530,22,240,7,ACCENT,ACCENT);txt('ORÇAMENTO PREMIUM',530,46,12,true);txt(model.quoteNumber||'RASCUNHO',530,67,18,true);txt(model.issueDate,530,92,11);rect(M,115,W,1,INK,INK);y=140;}
 function finish(){footer();pages.push({width:WIDTH,height:HEIGHT,commands});}
 function space(h){if(y+h>HEIGHT-75){finish();start();}}
 function block(title,text,x=M,width=W){const ls=wrap(text,width-24,11),h=28+ls.length*16+14;space(h);rect(x,y,width,h);rect(x,y,width,24,ACCENT,ACCENT);txt(title,x+12,y+7,11,true,'#fff');ls.forEach((s,i)=>txt(s,x+12,y+35+i*16));return h;}
 start();
 const meta=[['Responsável',model.companyOwner],['Telefone',model.companyPhone],['CNPJ / CPF',model.companyDocument],['Validade',model.validityDays?`${model.validityDays} dias`: 'Não informada'],['Pagamento',model.payment],['Garantia',model.warrantyDays?`${model.warrantyDays} dias no serviço`:'Não informada']];
 let metaY=y;for(const [label,v]of meta){txt(label+':',M,metaY,11,true);metaY+=lines(v||'Não informado',M+100,metaY,model.photo?205:W-110)+12;}
 if(model.photo)commands.push({kind:'image',src:model.photo,x:350,y,w:420,h:210});y=Math.max(metaY,y+(model.photo?225:0))+10;
 let h=block('CLIENTE',[model.clientName,model.clientPhone?`Tel.: ${model.clientPhone}`:''].filter(Boolean).join(' - '),M,380);let h2=block('PRAZO',model.deadlineText||model.dueDate||'A combinar',416,354);y+=Math.max(h,h2)+10;
 h=block('VEÍCULO',[model.vehicle,model.vehicleYear,model.vehicleColor,model.vehiclePlate?`Placa ${model.vehiclePlate}`:''].filter(Boolean).join(' - '),M,380);h2=block('COMPLEXIDADE',model.commercialComplexity||'Não informada',416,354);y+=Math.max(h,h2)+10;
 // Escopo e notas extensos são divididos em blocos para evitar corte de conteúdo.
 function longBlock(title,text){const ls=wrap(text,W-24,11);while(ls.length){const capacity=Math.max(1,Math.floor((HEIGHT-75-y-44)/16));if(capacity<2){finish();start();continue;}const chunk=ls.splice(0,capacity);const bh=block(title,chunk.join('\n'));y+=bh+12;title+=' (continuação)';}}
 longBlock('SERVIÇO AVALIADO',model.service||'Serviço conforme avaliação técnica.');
 function tableHead(){space(60);rect(M,y,W,24,ACCENT,ACCENT);txt('ETAPAS DO SERVIÇO E VALORES',M+12,y+7,11,true,'#fff');y+=24;rect(M,y,W,26,LIGHT,LIGHT);txt('Etapa',M+12,y+8,11,true);txt('Descrição',220,y+8,11,true);txt('Valor',680,y+8,11,true);y+=26;}
 tableHead();
 for(const item of [...model.items,...model.parts.map(p=>({...p,label:p.label,description:p.condition}))]){
  const label=wrap(item.label,175,11),desc=wrap(item.description||'',430,11),rh=Math.max(44,Math.max(label.length,desc.length)*16+18);
  if(y+rh>HEIGHT-125){finish();start();tableHead();}
  rect(M,y,W,rh);label.forEach((t,i)=>txt(t,M+12,y+14+i*16,11,true));desc.forEach((t,i)=>txt(t,220,y+14+i*16,11));txt(formatBRL(item.value),WIDTH-M-12,y+14,11);commands.at(-1).align='right';y+=rh;
 }
 space(60);rect(M,y,W,42,LIGHT);txt('TOTAL DO INVESTIMENTO',M+12,y+14,12,true);txt(formatBRL(model.total),WIDTH-M-12,y+13,16,true,ACCENT);commands.at(-1).align='right';y+=58;
 const approval='Nome: ________________________\nAssinatura: _____________________\nData: ____/____/________';
 const noteLines=wrap(model.notes||'Condições conforme avaliação e pagamento informado.',450-24,11);
 if(noteLines.length<=5){const bottomHeight=Math.max(90,42+noteLines.length*16);space(bottomHeight);const nh=block('CONDIÇÕES E OBSERVAÇÕES',noteLines.join('\n'),M,450);const ah=block('APROVAÇÃO DO CLIENTE',approval,486,284);y+=Math.max(nh,ah);}
 else{longBlock('CONDIÇÕES E OBSERVAÇÕES',model.notes);space(90);y+=block('APROVAÇÃO DO CLIENTE',approval);}
 finish();
 pages.forEach((p,i)=>p.commands.push({kind:'text',text:`${i+1}/${pages.length}`,x:735,y:HEIGHT-38,size:10,color:INK}));return pages;
}
export function renderQuotePage(page){
 const sheet=document.createElement('article');sheet.className='commercial-print-sheet';sheet.style.cssText=`position:relative;width:${page.width}px;height:${page.height}px;background:white;color:${INK};padding:0;font-family:Arial,sans-serif;box-sizing:border-box;overflow:hidden`;
 for(const c of page.commands){const e=document.createElement(c.kind==='image'?'img':'div');e.style.position='absolute';e.style.left=c.x+'px';e.style.top=c.y+'px';if(c.kind==='text'){e.textContent=c.text;e.style.cssText+=`;font-size:${c.size}px;font-weight:${c.bold?700:400};color:${c.color};white-space:pre;line-height:1.2`;if(c.align==='right')e.style.transform='translateX(-100%)';}else{e.style.width=c.w+'px';e.style.height=c.h+'px';if(c.kind==='image'){e.src=c.src;e.style.objectFit='contain';}else e.style.cssText+=`;background:${c.fill};border:1px solid ${c.stroke};box-sizing:border-box`;}sheet.append(e);}return sheet;
}
export async function quotePngBlobs(pages){
 const blobs=[];for(const page of pages){const canvas=document.createElement('canvas');canvas.width=page.width*2;canvas.height=page.height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#fff';ctx.fillRect(0,0,page.width,page.height);
 for(const c of page.commands){if(c.kind==='text'){ctx.font=`${c.bold?'bold ':''}${c.size}px Arial`;ctx.fillStyle=c.color;ctx.textBaseline='top';ctx.textAlign=c.align==='right'?'right':'left';ctx.fillText(c.text,c.x,c.y);}else if(c.kind==='rect'){ctx.fillStyle=c.fill;ctx.fillRect(c.x,c.y,c.w,c.h);ctx.strokeStyle=c.stroke;ctx.strokeRect(c.x+.5,c.y+.5,c.w-1,c.h-1);}else{const img=new Image();img.src=c.src;await img.decode();const scale=Math.min(c.w/img.width,c.h/img.height);ctx.drawImage(img,c.x+(c.w-img.width*scale)/2,c.y+(c.h-img.height*scale)/2,img.width*scale,img.height*scale);}}
 blobs.push(await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível gerar a imagem.')),'image/png')));}return blobs;
}
