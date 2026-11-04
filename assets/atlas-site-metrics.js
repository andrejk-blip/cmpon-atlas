import './atlas-metrics-v0.2.0.js';
import { ROUTES } from './metrics-catalog.mjs';
import { pageRoute } from './metrics-routing.mjs';

function connect(){
 if(window.CMPON_METRICS)return;
 // Copies, local previews and offline game packages must not enter production totals.
 if(location.origin!=='https://andrejk-blip.github.io'||!location.pathname.startsWith('/cmpon-atlas/'))return;
 const currentRoute=()=>pageRoute({pathname:location.pathname,hash:location.hash,
  activeTab:document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab,
  atlasScope:document.querySelector('[data-action="workspace"][aria-pressed="true"]')?.dataset.value,
  atlasView:document.querySelector('#nav [aria-current="page"][data-value]')?.dataset.value,
  legacyView:document.querySelector('#nav [aria-current="page"][data-value]')?.dataset.value});
 const initial=currentRoute();if(!initial)return;
 const metrics=window.AtlasMetrics.init({site:'cmpon-atlas',
  endpoint:'https://cmpon-metrics-service.carlafloriano1958.chatgpt.site/api/collect',
  routes:ROUTES.map(r=>r.id),route:initial,
  events:['page_view','engagement','export_csv','open_requirement','open_concept','game_launch','export_decisions','open_question','select_direction']});
 window.CMPON_METRICS=metrics;
 document.body.setAttribute('data-metrics-ready','');
 const panel=document.createElement('div');panel.id='atlas-metrics-consent';panel.hidden=true;
 const close=document.createElement('button');close.type='button';close.className='metrics-close';close.textContent='×';close.setAttribute('aria-label','Закрыть настройки статистики');
 const box=metrics.mountPrivacy(panel);box.prepend(close);document.body.append(panel);
 // The invitation is shown once. Revisiting privacy settings is an ordinary
 // menu action, never a floating button covering the game or touch controls.
 const seenKey='cmpon.metrics.prompt-seen.cmpon-atlas';
 const readSeen=()=>{for(const kind of ['localStorage','sessionStorage'])try{if(window[kind].getItem(seenKey)==='1')return true;}catch{}return false;};
 const rememberSeen=()=>{for(const kind of ['localStorage','sessionStorage'])try{window[kind].setItem(seenKey,'1');}catch{}};
 let manual=false,dismissed=readSeen(),lastRoute=initial,opener=null;
 const rail=document.querySelector('#site-rail .rail-bottom');
 if(rail){const toggle=document.createElement('button');toggle.type='button';toggle.id='atlas-metrics-settings';toggle.setAttribute('data-metrics-settings','');toggle.textContent='Статистика посещений';toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');rail.append(toggle);}
 function visibility(){const s=metrics.status();panel.hidden=!manual&&(dismissed||s.choice!=='unset'||s.blocked);for(const toggle of document.querySelectorAll('[data-metrics-settings]'))toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)rememberSeen();}
 function hide(){manual=false;dismissed=true;rememberSeen();visibility();if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;}
 close.addEventListener('click',hide);
 document.addEventListener('click',e=>{const toggle=e.target.closest('[data-metrics-settings]');if(!toggle)return;if(!panel.hidden){hide();return;}opener=toggle;manual=true;visibility();close.focus({preventScroll:true});});
 panel.addEventListener('click',e=>{if(e.target.closest('.metrics-privacy > div > button'))hide();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopImmediatePropagation();hide();}},true);
 function sync(){const route=currentRoute();if(route&&route!==lastRoute){lastRoute=route;metrics.page(route);}visibility();}
 const observer=new MutationObserver(sync);
 for(const el of [document.getElementById('nav'),document.querySelector('.controlbar')])if(el)observer.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','aria-selected']});
 window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);window.addEventListener('storage',visibility);
 const events={export:'export_csv','export-decisions':'export_decisions',requirement:'open_requirement','arcade-requirement':'open_requirement',concept:'open_concept','question-open':'open_question','arcade-start':'game_launch','citadel-launch':'game_launch','direction-table':'select_direction'};
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
  const name=events[b.dataset.action];if(name){sync();metrics.event(name);}
 },true);
 document.addEventListener('change',e=>{if(e.target.id==='direction-filter'){sync();metrics.event('select_direction');}});
 visibility();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connect,{once:true});else connect();

