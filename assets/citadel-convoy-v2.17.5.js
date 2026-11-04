/* Convoy travel is readable even at minimum effects. Simulation-clock-only;
 * no changes to collisions, missions, saved state or the render loop. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_CONVOY_MOTION2175)return;
 const old={camera:spaceCamera,scene:spaceScene};
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 const active=e=>!!e?.escort&&e.phase==='escort'&&!e.finale&&!e.crash&&!e.campaign2120?.modal;
 const clock=e=>Math.max(0,Number.isFinite(e?.escort?.time)?e.escort.time:0);
 const mod=(x,n)=>((x%n)+n)%n;
 function streams(e,quality=true){
  const t=reduced?.matches?0:clock(e),count=quality?32:16,a=[];
  // Forward travel: dust approaches the camera (increasing z), and wraps
  // behind the far plane. The two depth bands make speed readable on phones.
  for(let i=0;i<count;i++){
   const angle=i*2.3999632297,near=i%3===0,radius=near?39:66+(i%4)*6;
   const span=near?560:1080,speed=near?128:172;
   const z=34-mod(i*71-t*speed,span),pos=[Math.cos(angle)*radius,Math.sin(angle)*radius*.74,z];
   const item=citadelItem('box',pos,[near?.075:.10,.065,near?5.5:12],i%6===0?'#c2a2dc':'#8cceeb',1,SPACE_IDENTITY,near?.58:.44,24);
   item.convoyMotion2175=true;a.push(item);
  }
  return a;
 }
 spaceCamera=function(e,...args){
  const cam=old.camera.call(this,e,...args);
  if(!active(e)||!cam?.convoy260)return cam;
  // In 2.6 the "minimum effects" switch zeroed the sky clock as well as
  // bloom/particles. Keep inexpensive travel independent of graphics quality.
  // The OS reduce-motion preference still explicitly stops background motion.
  return {...cam,clock:clock(e)*1.45,fx:!reduced?.matches,convoyMotion2175:true};
 };
 spaceScene=function(e,time,fx=true){
  const a=old.scene.apply(this,arguments);
  if(!active(e))return a;
  // Replace only decorative travel geometry, never a ship, field or hazard.
  // One bounded stream family replaces the overlapping 2.6 / 2.13 families.
  return a.filter(x=>x.convoy260!=='speed'&&!x.warpMotion2130).concat(streams(e,fx!==false));
 };
 globalThis.CITADEL_CONVOY_MOTION2175=Object.freeze({version:'2.17.5',active,clock,streams});
})();
