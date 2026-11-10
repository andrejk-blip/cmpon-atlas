/* Restore the existing guidance switch outside the hidden mobile objective.
 * Actions still belong to the existing orbit/deck/pursuit/convoy controllers. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_GUIDANCE2181||typeof updateArcadeHUD!=='function')return;
 const homes=new WeakMap();
 function sync(){
  const layout=document.getElementById('arcade-layout'),screen=document.getElementById('arcade-screen'),button=document.getElementById('citadel-primary');
  if(!layout||!screen||!button||button.nodeType!==1)return;
  const e=ARCADE.engine,m=globalThis.CITADEL_PRESENTATION?.model(e),mobile=typeof isMobileLayout==='function'&&isMobileLayout();
  if(!homes.has(button)&&button.parentNode)homes.set(button,{parent:button.parentNode,next:button.nextSibling});
  const live=mobile&&m?.active&&m.guideVisible&&!e?.campaign2120?.modal&&!globalThis.CITADEL_RESONATOR?.active(e);
  if(mobile){if(button.parentNode!==screen)screen.appendChild(button);button.classList.add('guidance2181');button.hidden=!live;}
  else{
   const home=homes.get(button);
   if(home&&button.parentNode!==home.parent)home.parent.insertBefore(button,home.next?.parentNode===home.parent?home.next:null);
   button.classList.remove('guidance2181');
  }
  layout.classList.toggle('guidance2181-visible',!!live);
  if(!live)return;
  const label=m.guideName+(m.convoy?'':m.guideOn?' · вкл':' · выкл');
  if(button.textContent!==label)button.textContent=label;
  button.dataset.action='citadel-guidance';button.disabled=false;
  button.setAttribute('aria-pressed',String(m.guideOn));
  button.setAttribute('aria-label',m.convoy?'Вернуться к строю конвоя':m.guideName+': '+(m.guideOn?'включён. Выключить':'выключен. Включить'));
 }
 const hud=updateArcadeHUD;updateArcadeHUD=function(){const r=hud.apply(this,arguments);sync();return r;};
 const action=arcadeAction;arcadeAction=function(name,...args){
  if(name==='citadel-guidance'&&typeof MOBILE!=='undefined')MOBILE.guideReturn=false;
  const r=action.call(this,name,...args);if(name==='citadel-guidance')sync();return r;
 };
 globalThis.CITADEL_GUIDANCE2181=Object.freeze({version:'2.18.1',sync});
 sync();
})();
