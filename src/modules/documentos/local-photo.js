export async function preparePhoto(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>15000000)throw new Error('Selecione uma foto JPEG/PNG de até 15 MB.');
 const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.8);}finally{bitmap.close();}
}
