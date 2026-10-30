/* Shared pursuit anatomy in the convoy. Simulation owns every visible joint.
 * New departures opt in; an in-flight older save is never silently populated.
 * No timer, RNG draw, player teleport or enemy-target pollution. */
(() => {
 'use strict';
 if(globalThis.CITADEL_CONVOY_MONSTERS||!globalThis.CITADEL_PURSUIT?.poseWarp)return;
 const proto=RequirementArcade.prototype,old={begin:proto.beginEscort,step:proto.stepEscort,pulse:proto.pulse};
 const P=CITADEL_PURSUIT,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const active=e=>e?.phase==='escort'&&e.escort?.warp290?.version===1;
 function schedule(e){
  const m=CITADEL_CONVOY.mission(e),lead=e.assist?6.2:5.4,fields=m.fields.map(f=>f.at+lead);
  // The full physical sweep stays at least five seconds from a ring crossing.
  const times=e.stage===2?[]:[fields[0]-7];
  for(let i=0;i<fields.length-1&&times.length<3+e.stage;i++)times.push((fields[i]+fields[i+1])/2);
  return times.map((cross,i)=>({cross,spawn:Math.max(.5,cross-6.4),kind:P.warpKinds[(i+e.stage*2)%5],side:i%2?-1:1}));
 }
 proto.beginEscort=function(...args){const ok=old.begin.apply(this,args);if(!ok||!CITADEL_CONVOY.active(this))return ok;
  this.escort.warp290={version:1,next:0,entities:[],contacts:0,repelled:0,spawned:0};
  this.escort.definition.brief=(this.escort.definition.brief||'')+' Существа у края коридора бьют щупальцами. Уклоняйтесь в свободную половину; E / «Прикрытие» отталкивает их.';
  return ok;
 };
 function pose(e,w,dt){
  const t=e.escort.time,z=(t-w.cross)*36;
  w.age=t-w.born;w.phase=w.age*({hammer:1.05,tentacle:1.1,maw:.8,mantis:1.25,medusa:.85}[w.kind])+w.index*.7;
  w.center=[0,w.laneY,z];w.pos=[w.side*69,w.laneY,z];
  P.poseWarp(e,w,dt);
  // A real pulse folds the whole limb back toward its body. The same pose
  // is used for collision, rendering and saved continuation.
  const fold=clamp((w.repelledUntil-t)/.6,0,1);
  if(fold)for(const j of w.segments)if(j.part!=='body'){
   const previous=j.previous;j.pos=V3.lerp(j.pos,[w.side*58,j.pos[1],j.pos[2]],fold);
   j.previous=dt>0?previous:j.pos.slice();
  }
 }
 function hit(e,from,to,w){
  for(const j of w.segments){
   const start=V3.add(from,V3.sub(j.pos,j.previous||j.pos));
   if(flightSegment(start,to,j.pos,j.r+2.8)!==null)return j;
  }return null;
 }
 proto.stepEscort=function(dt,input={}){
  if(!active(this)||this.status!=='playing')return old.step.call(this,dt,input);
  const before=this.player.pos.slice(),previousTime=this.escort.time;
  const result=old.step.call(this,dt,input);
  if(!active(this)||this.status!=='playing'||this.escort.time===previousTime)return result;
  const state=this.escort.warp290,t=this.escort.time,plans=schedule(this);
  const plan=plans[state.next];
  if(plan&&t>=plan.spawn){
   const index=state.next++,w={id:this.entityId++,schema:280,kind:plan.kind,name:P.warpNames[plan.kind],index,side:plan.side,
    scale:2.6,bodyRadius:26,age:0,phase:0,cross:plan.cross,born:plan.spawn,laneY:(index%3-1)*3,
    center:[0,0,0],pos:[0,0,0],segments:[],contactUntil:0,repelledUntil:0};
   pose(this,w,0);state.entities.push(w);state.spawned++;
   this.say(w.name+' у '+(w.side>0?'правого':'левого')+' борта. Обходите конечности; прикрытие отталкивает их.','alert',true);
  }
  state.entities=state.entities.filter(w=>t<w.cross+3.5).slice(-2);
  for(const w of state.entities){
   pose(this,w,dt);
   if(t<w.contactUntil||t<w.repelledUntil||this.player.invulnerable>0)continue;
   const contact=hit(this,before,this.player.pos,w);
   if(contact){
    w.contactUntil=t+1.4;state.contacts++;this.damage(this.assist?10:16);
    this.notify('УДАР СУЩЕСТВА','Уклоняйтесь от '+(w.kind==='hammer'?'молота':'конечностей')+' · E / Прикрытие');
    this.emit('impact');
   }
  }
  return result;
 };
 proto.pulse=function(...args){const ok=old.pulse.apply(this,args);if(ok&&active(this)){
  const t=this.escort.time,state=this.escort.warp290;
  for(const w of state.entities)if(Math.abs(w.center[2]-this.player.pos[2])<130){w.repelledUntil=t+3.2;state.repelled++;}
 }return ok;};
 globalThis.CITADEL_CONVOY_MONSTERS=Object.freeze({version:'2.9.0',active,schedule,pose,hit,entities:e=>active(e)?e.escort.warp290.entities:[]});
})();
