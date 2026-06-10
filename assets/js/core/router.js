import {STATE} from './state.js?v=546113';
export function initRouter(renderAll){
 document.querySelectorAll('.nav-tab').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab,renderAll)));
}
export function showTab(tab,renderAll){
 STATE.ui.tab=tab;
 document.querySelectorAll('.nav-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
 const panel=document.getElementById('mod-'+tab); if(panel) panel.classList.add('active');
 renderAll?.();
}
