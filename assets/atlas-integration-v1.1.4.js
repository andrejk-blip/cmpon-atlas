/* Atlas integration 1.1.4. Public configuration; no keys or visitor content. */
(function(){
'use strict';
if(location.protocol!=='https:'||!window.AtlasMetrics)return;
const routes=['map','requirements','reviews','cosmos','arcade','changes','methods'];
const nav=document.getElementById('nav'), workspace=document.getElementById('workspace');
if(!nav||!workspace)return;
function currentRoute(){const active=nav.querySelector('[aria-current="page"][data-value]');return routes.includes(active?.dataset.value)?active.dataset.value:'map';}
const metrics=window.AtlasMetrics.init({site:'cmpon-atlas',endpoint:'https://cmpon-metrics-service.carlafloriano1958.chatgpt.site/api/collect',routes,events:['page_view','engagement','export_csv','open_requirement','open_concept','game_launch'],route:currentRoute()});
const panel=document.createElement('div');panel.id='atlas-metrics-consent';panel.hidden=true;
const main=document.getElementById('main');workspace.insertBefore(panel,main);
metrics.mountPrivacy(panel);
let manual=false;
function visibility(){const s=metrics.status();panel.hidden=currentRoute()==='arcade'||(!manual&&(s.choice!=='unset'||s.blocked));}
panel.addEventListener('click',e=>{if(e.target.closest('button')){manual=false;visibility();}});
const button=document.createElement('button');button.type='button';button.className='text-button';button.id='atlas-metrics-settings';button.textContent='Настройки статистики';
button.addEventListener('click',()=>{manual=true;visibility();if(!panel.hidden){panel.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}});
document.querySelector('.footer')?.append(button);
let lastRoute=currentRoute();
new MutationObserver(()=>{const r=currentRoute();if(r!==lastRoute){lastRoute=r;metrics.page(r);}visibility();}).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;const action=b.dataset.action;const name=action==='export'?'export_csv':['requirement','arcade-requirement'].includes(action)?'open_requirement':action==='concept'?'open_concept':['arcade-start','citadel-launch'].includes(action)?'game_launch':null;if(name){metrics.page(currentRoute());metrics.event(name);}});
window.addEventListener('storage',visibility);
window.CMPON_METRICS=metrics;
visibility();
})();
