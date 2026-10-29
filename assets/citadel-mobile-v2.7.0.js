/* Landscape is a viewport, not three squeezed columns. Reuses the existing
 * resize/HUD lifecycle; no new timer, RAF loop or gameplay/input handlers. */
(() => {
  'use strict';
  if(globalThis.CITADEL_MOBILE270 || typeof updateMobileViewport!=='function')return;
  const oldHUD=updateArcadeHUD,oldViewport=updateMobileViewport;
  let updating=false;
  function rocketHint(e){
    if(e?.phase!=='escort'||e.status!=='playing')return '';
    if((e.escort?.time||0)>18||!e.player?.missiles)return '';
    return 'РАКЕТА — против щитов и торпедоносцев. Огонь можно держать другим пальцем.';
  }
  function sync(){
    if(updating)return;
    const layout=document.getElementById('arcade-layout');if(!layout)return;
    const w=globalThis.innerWidth||0,h=globalThis.innerHeight||0;
    const landscape=w>h&&h<=600&&w<=1100;
    layout.classList.toggle('citadel-landscape270',landscape);
    const screen=document.getElementById('arcade-screen'),message=rocketHint(ARCADE.engine);
    if(screen?.nodeType===1){
      let tip=screen.querySelector('#citadel-rocket-tip');
      if(!tip&&message){tip=document.createElement('div');tip.id='citadel-rocket-tip';tip.className='citadel-rocket-tip';tip.setAttribute('role','status');screen.appendChild(tip);}
      if(tip){if(tip.textContent!==message)tip.textContent=message;tip.hidden=!message;}
      for(const button of screen.querySelectorAll('.arcade-touch-actions [data-action="arcade-missile"]')){
        button.classList.toggle('citadel-rocket-hint',!!message);
        button.setAttribute('aria-label','Ракета: '+(ARCADE.engine?.player?.missiles||0)+' в запасе. Нажмите, чтобы запустить');
      }
    }
    if(landscape&&STATE.view==='arcade'&&!ARCADE.expanded){
      updating=true;try{arcadeAction('arcade-expand');}finally{updating=false;}
    }
  }
  updateArcadeHUD=function(){const result=oldHUD.apply(this,arguments);sync();return result;};
  updateMobileViewport=function(){const result=oldViewport.apply(this,arguments);sync();return result;};
  globalThis.CITADEL_MOBILE270=Object.freeze({version:'2.8.0',sync,rocketHint});
  sync();
})();
