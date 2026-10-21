/* QA input operator: observed projectiles and target priorities. No hidden attack clocks or direct state writes. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>a.map((v,i)=>v-b[i]);
 function imminentShots(e,horizon=.6){
  const p=e.player,f=[Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch)],own=f.map(x=>x*p.speed),threats=[];
  for(const shot of e.hostile){
   if(shot.stationShot)continue;
   const relative=sub(shot.pos,p.pos),velocity=sub(shot.vel,own),speed2=dot(velocity,velocity);if(speed2<.001)continue;
   const t=clamp(-dot(relative,velocity)/speed2,0,horizon),miss=Math.hypot(...relative.map((v,i)=>v+velocity[i]*t));
   if(miss<5+(shot.r||1)&&Math.hypot(...relative)<72&&t>0)threats.push({t,miss});
  }
  return threats;
 }
 function createOrbitalController(h,{reserveForBoss=0,prioritizeBombers=true,defendStation=true,resupply=true}={}){
  let desired=null,nextSwitch=0,nextResupply=0;
  return e=>{
   if(e.status!=='playing'||e.finale||!['orientation','battle','retrieve','dock'].includes(e.phase))return {};
   const p=e.player;
   // Green requirement modules are normal in-flight supplies: collecting them
   // restores shields and opens the real educational card, never edits HP.
   if(resupply&&e.phase==='battle'&&p.hp<55&&e.navMode!=='module'&&e.elapsed>=nextResupply&&e.pickups.some(x=>x.type==='requirement'&&!x.dead)){h.action('citadel-crystal');nextResupply=e.elapsed+5;desired=null;}
   if(prioritizeBombers&&e.phase==='battle'&&e.navMode!=='module'&&!e.boss){
    if(!e.enemies.some(x=>!x.dead&&x.id===desired))desired=null;
    const bombers=e.enemies.filter(x=>!x.dead&&x.role==='bomber').sort((a,b)=>Math.hypot(...sub(a.pos,p.pos))-Math.hypot(...sub(b.pos,p.pos)));
    if(bombers.length&&(desired===null||!e.enemies.some(x=>x.id===desired&&x.role==='bomber')))desired=bombers[0].id;
    if(desired!==null&&e.selectedTarget!==desired&&e.elapsed>=nextSwitch){h.action('citadel-target');nextSwitch=e.elapsed+.1;}
   }
   const target=e.target?.(),reserve=e.stage===3&&e.wave>=3&&!e.bossDefeated&&!e.boss?reserveForBoss:0;
   const stationThreats=defendStation?e.hostile.filter(b=>b.stationShot&&Math.hypot(...sub(b.pos,p.pos))<72&&Math.hypot(...sub(b.pos,e.station.pos))<65).length:0;
   const pulse=p.pulseCooldown<=0&&(p.invulnerable<.12&&imminentShots(e).length>0||stationThreats>=2);
   return {fire:true,missile:!!target&&p.missiles>reserve,pulse,interact:e.phase==='dock'};
  };
 }
 const api={createOrbitalController,imminentShots};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CITADEL_QA_ORBITAL260=api;
})(typeof globalThis!=='undefined'?globalThis:this);
