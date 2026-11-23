import {goBackToHome} from './utils.js';
let root,closing=false; const callbacks={};
export function initNavigation(base, handlers){root=base;Object.assign(callbacks,handlers);history.replaceState({qlctAppView:root,qlctAppDepth:0},'');}
export function pushAppView(id){if(id!==root) history.pushState({qlctAppView:id,qlctAppDepth:(history.state?.qlctAppDepth||0)+1},'');}
export function leaveAppView(){if(closing)return;if(!history.state?.qlctAppDepth){goBackToHome();return;}history.back();}
window.addEventListener('popstate',()=>{closing=true;try{const current=history.state?.qlctAppView;for(const [id,close] of Object.entries(callbacks)){if(document.getElementById(id)?.classList.contains('active') && id!==current){close();break;}}}finally{closing=false;}});
