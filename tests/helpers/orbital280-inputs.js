/* QA-only pilot: target cycling, ordinary weapon inputs and visible line-of-fire.
 * No engine-state edits. Requires production geometry helpers in h. */
'use strict';
const {imminentShots}=require('./orbital260-inputs.js');
function createOrbitalController(h){
 const hull=h.run('citadelHullHit'),segment=h.run('flightSegment');let desired=null,nextSwitch=0,nextResupply=0;
 const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const clear=(e,x)=>!hull(e,e.player.pos,x.pos,1.2)&&!e.asteroids.some(a=>segment(e.player.pos,x.pos,a.pos,a.r+1.2)!==null);
 return e=>{
  if(e.status!=='playing'||e.finale||!['orientation','battle','retrieve','dock'].includes(e.phase))return {};
  const p=e.player;
  if(e.phase==='battle'&&p.hp<55&&e.navMode!=='module'&&e.elapsed>=nextResupply&&e.pickups.some(x=>x.type==='requirement'&&!x.dead)){
   h.action('citadel-crystal');nextResupply=e.elapsed+6;desired=null;
  }
  if(e.phase==='battle'&&e.navMode!=='module'&&!e.boss){
   const rank=x=>(x.role==='bomber'?distance(x.pos,e.station.pos)<115?0:2:x.role==='hacker'&&x.channel?1:3)*1000+distance(x.pos,p.pos)+(clear(e,x)?0:300);
   const candidates=e.enemies.filter(x=>!x.dead&&x.warp<=0).sort((a,b)=>rank(a)-rank(b));
   const incumbent=candidates.find(x=>x.id===desired);
   if(!incumbent||candidates[0]&&rank(candidates[0])+100<rank(incumbent))desired=candidates[0]?.id??null;
   if(desired!==null&&e.selectedTarget!==desired&&e.elapsed>=nextSwitch){h.action('citadel-target');nextSwitch=e.elapsed+.1;}
  }
  const target=e.target?.(),stationThreats=e.hostile.filter(b=>b.stationShot&&distance(b.pos,p.pos)<74&&distance(b.pos,e.station.pos)<80).length;
  const pulse=p.pulseCooldown<=0&&(stationThreats>0||p.invulnerable<.12&&imminentShots(e,.8).length>0||target&&distance(target.pos,p.pos)<70&&['hacker','bomber'].includes(target.role));
  return {fire:true,missile:!!target&&p.missiles>0&&clear(e,target)&&(!e.boss?['hacker','bomber'].includes(target.role):true),pulse,interact:e.phase==='dock'};
 };
}
module.exports={createOrbitalController};
