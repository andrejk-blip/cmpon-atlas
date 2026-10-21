/* Observable-state 2.6 convoy operator shared by browser and Node QA.
 * Uses ordinary controls only. No future schedules or combat-state writes.
 * A weak per-engine cache keeps one decision every 0.4s, not every frame.
 */
(function(root){'use strict';
 const nativeInput=typeof arcadeInput==='function'?arcadeInput:null;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function pilot(h,e,{reaction=.4,device='joystick',strategy='reactive'}={}){
 const controls=h.arcade||(typeof ARCADE!=='undefined'?ARCADE:null),readInput=h.input||nativeInput;
 if(!controls||!readInput)throw new Error('Convoy QA operator needs the native arcade input interface');
 let next=0,held={},decisions=0,tabs=0,missiles=0,pulses=0;
 function input(){if(e.escort.time+1e-8>=next){next=e.escort.time+reaction;decisions++;
  held={fire:strategy!=='idle'};
  if(strategy==='reactive'){
   const p=e.player,live=e.enemies.filter(x=>!x.dead&&x.warp<=0),rank=x=>x.torpedo?(e.escort.allies[x.ally]&&distance(x.pos,e.escort.allies[x.ally].pos)<27&&p.pulseCooldown>1?0:8):x.role==='shield'?1:x.role==='bomber'?2:x.role==='commander'?3:x.role==='jammer'?4:5;
   const wanted=live.slice().sort((a,b)=>rank(a)-rank(b)||a.hp-b.hp||a.id-b.id)[0];
   if(wanted&&wanted.id!==e.selectedTarget){h.action('citadel-target');tabs++;}
   const target=e.target(),field=e.escort.ops240.fields.find(f=>!f.passed);
   let goal=target?target.pos.slice(0,2):p.pos.slice(0,2);
   if(field){
    // Project the aiming goal onto the *circle*, never the old rectangular
    // safe box. Reserve hull radius and a finite input-decision margin.
    const margin=2.8+(device==='keyboard'?14*reaction*.75+1:1.35),safe=Math.max(0,(field.radius||Math.min(field.halfW,field.halfH))-margin);
    const dx=goal[0]-field.gapX,dy=goal[1]-field.gapY,d=Math.hypot(dx,dy),scale=d>safe?safe/d:1;
    const inside=[field.gapX+dx*scale,field.gapY+dy*scale];
    const travel=Math.max(Math.abs(inside[0]-p.pos[0]),Math.abs(inside[1]-p.pos[1]))/14;
    // The operator can infer time to contact from the approaching physical
    // field; normal mode does not expose a warning timer or future plan.
    if(-field.z/field.speed<travel+1.5||-field.z/field.speed<1.5)goal=inside;
   }
   goal=[clamp(goal[0],-34,34),clamp(goal[1],-17,17)];
   const axis=error=>device==='keyboard'?(Math.abs(error)>14*reaction*.48?Math.sign(error):0):clamp(error/(14*reaction),-1,1);
   held.turn=axis(goal[0]-p.pos[0]);held.pitch=axis(goal[1]-p.pos[1]);
   const d=target?target.pos.map((v,i)=>v-p.pos[i]):null,lock=d&&d[2]<-4&&Math.hypot(d[0],d[1])<=-d[2]*(e.assist?.24:.19)+(target.r||0);
   if(target&&target.hp>120&&!target.torpedo&&['shield','commander','bomber','jammer'].includes(target.role)&&p.missiles>0&&p.missileCooldown<=0){held.missile=true;missiles++;}
   const torpedo=live.some(x=>x.torpedo&&e.escort.allies[x.ally]&&distance(x.pos,e.escort.allies[x.ally].pos)<34);
   const volley=e.hostile.filter(b=>b.ally>=0&&e.escort.allies[b.ally]&&!e.escort.allies[b.ally].dead&&distance(b.pos,e.escort.allies[b.ally].pos)<55).length>=2;
   if(p.pulseCooldown<=0&&(torpedo||volley)){held.pulse=true;pulses++;}
  }else if(strategy==='fire-pulse'&&e.player.pulseCooldown<=0){held.pulse=true;pulses++;}
 }
 controls.keys.clear();controls.joystick=null;
 if(held.fire)controls.keys.add('Space');
 if(device==='keyboard'){if(held.turn)controls.keys.add(held.turn>0?'KeyD':'KeyA');if(held.pitch)controls.keys.add(held.pitch>0?'KeyW':'KeyS');}
 else controls.joystick={x:held.turn||0,y:-(held.pitch||0)};
 controls.missileQueued=!!held.missile;controls.pulseQueued=!!held.pulse;held.missile=held.pulse=false;
 return readInput();
 }
 return {input,stats:()=>({reaction,device,strategy,decisions,tabs,missiles,pulses})};
}

 const cache=new WeakMap();
 function convoyInput(h,e){let m=cache.get(e);if(!m||m.trip!==e.escort||e.escort.time<m.time){m={trip:e.escort,time:e.escort.time,op:pilot(h,e)};cache.set(e,m);}m.time=e.escort.time;return m.op.input();}
 if(typeof module!=='undefined'&&module.exports)module.exports={pilot,convoyInput};
 else{root.CITADEL_CONVOY_INPUT=convoyInput;root.CITADEL_CONVOY_PILOT=pilot;}
})(globalThis);
