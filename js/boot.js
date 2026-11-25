import {loadComponent,goBackToHome} from './utils.js';
import {requireSession} from './api.js';
try {
 const user=await requireSession();
 if(user){
   const slot=document.querySelector('template[data-header]');
   if(slot){const fragment=await loadComponent('page-header');const el=fragment.querySelector('header');
     for(const attr of slot.attributes)if(attr.name!=='data-header')el.setAttribute(attr.name,attr.value);
     el.append(slot.content);slot.replaceWith(el);}
   window.goBackToHome=goBackToHome;
   if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(()=>{});
   const {default:start}=await import(`./${document.body.dataset.feature}.js?v=${Date.now()}`);
   if(start)await start(user);
   document.documentElement.removeAttribute('data-loading');
 }
}catch(error){document.documentElement.removeAttribute('data-loading');document.body.replaceChildren();const msg=document.createElement('p');msg.textContent='Không mở được trang: '+error.message;const back=document.createElement('button');back.textContent='Về Trang chủ';back.onclick=goBackToHome;document.body.append(msg,back);}
