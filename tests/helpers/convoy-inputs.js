/* QA operator: target cycling and normal fire/missile/cover inputs only. */
(function(root){'use strict';const observed=new WeakMap();
 function convoyInput(h,e){
  const last=observed.get(e)||-1;
  if(e.escort.time-last>=.18){
   observed.set(e,e.escort.time);
   const live=e.enemies.filter(x=>!x.dead&&x.warp<=0),rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='jammer'?3:x.role==='bomber'?4:5;
   const desired=live.slice().sort((a,b)=>rank(a)-rank(b)||a.hp-b.hp)[0];
   if(desired&&e.selectedTarget!==desired.id)for(let i=0;i<=e.enemies.length;i++){h.action('citadel-target');if(e.selectedTarget===desired.id)break;}
  }
  const target=e.target(),threat=e.escort.ops230?.groups.some(g=>g.state==='attack'&&g.time<1.2);
  return {fire:true,missile:!!target&&target.hp>70&&e.player.missiles>0,pulse:e.player.pulseCooldown<=0&&(e.escort.allies.some(a=>!a.dead&&a.hp<83)||threat)};
 }
 if(typeof module!=='undefined')module.exports={convoyInput};else root.CITADEL_CONVOY_INPUT=convoyInput;
})(globalThis);
