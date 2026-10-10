import { quotePngBlobs } from '../orcamento/quote-template.js';

// PDF com páginas rasterizadas: o mesmo desenho usado no PNG, sem serviços externos.
export function jpegPagesPdf(pages){
  const enc=new TextEncoder(),chunks=[];let offset=0;const offsets=[0];
  const append=v=>{const b=typeof v==='string'?enc.encode(v):v;chunks.push(b);offset+=b.length;};
  const object=(id,body)=>{offsets[id]=offset;append(`${id} 0 obj\n`);append(body);append('\nendobj\n');};
  append('%PDF-1.4\n');const kids=pages.map((_,i)=>`${3+i*3} 0 R`).join(' ');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  pages.forEach((p,i)=>{const pageId=3+i*3,imageId=pageId+1,contentId=pageId+2;
    object(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    offsets[imageId]=offset;append(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);append(p.bytes);append('\nendstream\nendobj\n');
    const content='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';object(contentId,`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
  });
  const start=offset;append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);return new Blob(chunks,{type:'application/pdf'});
}
export async function documentFiles(pages,base,format='pdf'){
  base=String(base).replace(/[^a-zA-Z0-9_-]/g,'_');const pngs=await quotePngBlobs(pages);
  if(format==='png')return pngs.map((blob,i)=>new File([blob],`${base}_${i+1}.png`,{type:'image/png'}));
  const images=[];for(const blob of pngs){const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar PDF.')),'image/jpeg',.92));images.push({width:canvas.width,height:canvas.height,bytes:new Uint8Array(await jpeg.arrayBuffer())});}
  return [new File([jpegPagesPdf(images)],`${base}.pdf`,{type:'application/pdf'})];
}
export function downloadFiles(files){for(const file of files){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}}
export async function shareOrDownload(files,{title='',text=''}={}){
  if(navigator.canShare?.({files})&&navigator.share){try{await navigator.share({files,title,text});return 'shared';}catch(error){if(error.name==='AbortError')return 'cancelled';if(error.name!=='NotAllowedError'&&error.name!=='TypeError')throw error;}}
  downloadFiles(files);return 'downloaded';
}

export function dataUrlBlob(url){
 const match=/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(url));if(!match)throw new Error('Imagem local inválida.');const binary=atob(match[2]);return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:match[1]});
}
