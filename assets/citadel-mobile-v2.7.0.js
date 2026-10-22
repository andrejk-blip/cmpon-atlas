/* Landscape is a viewport, not three squeezed columns. Reuses the existing
 * resize/HUD lifecycle; no new timer, RAF loop or gameplay/input handlers. */
(() => {
  'use strict';
  if(globalThis.CITADEL_MOBILE270 || typeof updateMobileViewport!=='function')return;
  const oldHUD=updateArcadeHUD,oldViewport=updateMobileViewport;
  let updating=false;
  function sync(){
    if(updating)return;
    const layout=document.getElementById('arcade-layout');if(!layout)return;
    const w=globalThis.innerWidth||0,h=globalThis.innerHeight||0;
    const landscape=w>h&&h<=600&&w<=1100;
    layout.classList.toggle('citadel-landscape270',landscape);
    if(landscape&&STATE.view==='arcade'&&!ARCADE.expanded){
      updating=true;try{arcadeAction('arcade-expand');}finally{updating=false;}
    }
  }
  updateArcadeHUD=function(){const result=oldHUD.apply(this,arguments);sync();return result;};
  updateMobileViewport=function(){const result=oldViewport.apply(this,arguments);sync();return result;};
  globalThis.CITADEL_MOBILE270=Object.freeze({version:'2.7.0',sync});
  sync();
})();
