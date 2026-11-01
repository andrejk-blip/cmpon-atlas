#!/usr/bin/env node
'use strict';
// Independent bounded fixtures, not human playthroughs. Geometry samples and
// ordinary simulation steps are separated from explicit fixture placement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const out=path.join(__dirname,'qa-2.13.0');
(async()=>{
 const h=await lab(readEntry('index.html')),P=h.c.CITADEL_PURSUIT,M=h.c.CITADEL_MOTION,C=h.c.CITADEL_CAMPAIGN;
 const rows=[],failures=[];
 async function test(name,fn){try{rows.push({name,pass:true,...await fn()});console.log('PASS '+name);}catch(err){failures.push({name,error:err.message});console.log('FAIL '+name+': '+err.message);}}
 const flight=()=>{const e=new h.Engine(417147,()=>{});h.arcade.engine=e;C.enable(e);e.beginStage(1);e.launch();return e;};
 const ground=(id=2,assist=false)=>{const e=fixture(h,id,assist);C.enable(e);e.board.intro=0;return e;};
 function monster(e,kind,phase=0){const w={id:999,schema:280,portal2130:true,portalRadius:43,kind,scale:3.4,pos:[0,0,0],center:[0,0,0],phase,age:phase,segments:[]};P.poseWarp(e,w,0);e.pursuit.warpEntities=[w];return w;}
 await test('central-aperture-all-five-kinds-and-phases',()=>{const e=flight();let cases=0,minClear=Infinity,maxParts=0;
  for(const kind of P.warpKinds)for(let phase=0;phase<Math.PI*2;phase+=Math.PI/16){const w=monster(e,kind,phase),p=w.aperture;
   assert.equal(P.warpHit(e,[p[0],p[1],-80],[p[0],p[1],80],2),null,kind+' central course blocked at '+phase);
   // 16-metre steering corridor remains clear, measured radially from actual anatomy.
   const gap=Math.min(...w.segments.map(j=>Math.hypot(j.pos[0]-p[0],j.pos[1]-p[1])-j.r));minClear=Math.min(minClear,gap);assert(gap>16,kind+' has too little steering room');
   maxParts=Math.max(maxParts,w.segments.length);cases++;
  }return{cases,minClearRadius:+minClear.toFixed(2),maxParts};
 });
 await test('visible-body-has-physical-contact',()=>{const e=flight();monster(e,'medusa',0);
  // Interior of visible ellipsoidal bell: centre[0,51,-4], radii[24,12,8].
  // The point lies well inside (.70 of squared normalized distance), not a decoration.
  const from=[-20,52,-20],to=[-20,52,20],hit=P.warpHit(e,from,to,1.8);
  assert(hit,'Ship crosses the rendered medusa bell but no body collision exists');return{from,to,part:hit.part.part};
 });
 await test('swept-rim-and-moving-limb-contact',()=>{const e=flight();let cases=0;
  for(const kind of P.warpKinds){const w=monster(e,kind,.6),rim=w.segments.find(j=>j.part==='rim'),q=rim.pos;
   assert(P.warpHit(e,[q[0],q[1],q[2]-100],[q[0],q[1],q[2]+100],1.8),'Fast segment tunneled through '+kind+' rim');
   const limb=w.segments.find(j=>j.part==='tentacle'&&j.key.endsWith('j8')),u=limb.pos;
   assert(P.warpHit(e,[u[0],u[1],u[2]-100],[u[0],u[1],u[2]+100],1.8),'Fast segment tunneled through '+kind+' limb');cases+=2;
  }return{cases};
 });
 await test('pursuit-time-and-centred-spawn',()=>{const e=flight();assert.equal(e.pursuit.requiredSeconds,120);
  for(let i=0;i<600&&!e.pursuit.warpEntities.length;i++)e.step(1/60,{fire:true});
  assert(e.pursuit.warpEntities.length);const w=e.pursuit.warpEntities[0];assert(w.portal2130);assert.deepEqual(copy(w.pos),copy(w.center));return{requiredLinkSeconds:e.pursuit.requiredSeconds,firstKind:w.kind,spawnAt:e.elapsed};
 });
 await test('warp-motion-pauses-and-has-fixed-budget',()=>{const e=flight();h.arcade.fx=true;const capture=()=>{const a=[];M.warpDepth(a,e);return copy(a.map(x=>({model:x.model,pos:x.pos})));};
  const a=capture();for(let i=0;i<120;i++)e.step(1/60,{});const b=capture();assert.equal(a.length,41);assert.equal(b.length,41);assert.notDeepEqual(a,b,'Warp background remains static');
  e.pause();const frozen=capture(),clock=e.pursuit.clock;for(let i=0;i<120;i++)e.step(1/60,{turn:1});assert.equal(e.pursuit.clock,clock);assert.deepEqual(capture(),frozen,'Paused warp moves');
  h.arcade.fx=false;return{items:41,pausedSeconds:2};
 });
 await test('centred-monster-save-continuation',()=>{const e=flight();for(let i=0;i<720;i++)e.step(1/60,{fire:true});e.pause();const packed=h.pack(e),saved=copy({pursuit:e.pursuit,player:e.player,elapsed:e.elapsed});const restored=h.unpack(packed,{seed:e.seed,mode:'normal'},()=>{});
  assert.deepEqual(copy({pursuit:restored.pursuit,player:restored.player,elapsed:restored.elapsed}),saved);e.resume();restored.resume();
  for(let i=0;i<90;i++){h.arcade.engine=e;e.step(1/60,{fire:true,pitch:.1});h.arcade.engine=restored;restored.step(1/60,{fire:true,pitch:.1});}
  assert.deepEqual(copy({pursuit:restored.pursuit,player:restored.player}),copy({pursuit:e.pursuit,player:e.player}));return{continuationSeconds:1.5};
 });
 await test('convoy-portal-spawn-pause-save',()=>{const e=fixture(h,3);C.enable(e);for(let i=0;i<480;i++)e.step(1/60,{fire:true});
  const w=e.escort.warp290.entities[0];assert(w&&w.portal2130,'New convoy did not spawn a central portal monster');assert.deepEqual(copy(w.pos),copy(w.center));
  const CM=h.c.CITADEL_CONVOY_MONSTERS,p=w.aperture;assert.equal(CM.hit(e,[p[0],p[1],w.center[2]-80],[p[0],p[1],w.center[2]+80],w),null,'Convoy aperture blocks central passage');
  e.pause();const before=copy(e.escort.warp290);for(let i=0;i<120;i++)e.step(1/60,{fire:true,pulse:true});assert.deepEqual(copy(e.escort.warp290),before,'Paused convoy anatomy moves');
  const restored=h.unpack(h.pack(e),{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(copy(restored.escort.warp290),before);e.resume();restored.resume();
  for(let i=0;i<60;i++){h.arcade.engine=e;e.step(1/60,{fire:true});h.arcade.engine=restored;restored.step(1/60,{fire:true});}assert.deepEqual(copy(restored.escort.warp290),copy(e.escort.warp290));return{kind:w.kind,pausedSeconds:2,continuationSeconds:1};
 });
 function fired(archetype,modern=true,assist=false){const e=fixture(h,2,assist);if(modern)C.enable(e);const b=e.board,x=b.enemies.find(x=>x.archetype===archetype);assert(x,'No '+archetype);
  b.pos=[12,0,-4];x.pos=[12,0,-16];x.lastSeen=b.pos.slice();x.memory=7;x.alert=true;x.shot=0;x.duty.mode='hunt';x.duty.detection=1;b.intro=0;
  let firstCharge=null;for(let f=0;f<600;f++){b.time+=1/60;e.enemyBoardStep(x,1/60);if(x.charge&&firstCharge===null)firstCharge=f/60;if(b.hostile.length){const shot=b.hostile[0];return{speed:Math.hypot(...shot.vel),charge:firstCharge===null?0:f/60-firstCharge,shot,e};}}
  throw Error('Actor did not fire: '+archetype);
 }
 await test('selective-projectile-velocity-and-sniper-tell',()=>{const sniper=fired('sniper'),calm=fired('sniper',true,true),old=fired('sniper',false),scout=fired('scout'),relay=fired('shield');
  assert(Math.abs(sniper.speed-84)<1e-6);assert(Math.abs(calm.speed-66)<1e-6);assert(Math.abs(old.speed-30)<1e-6);assert(sniper.charge>=.5&&calm.charge>=.75);assert(Math.abs(scout.speed-22.95)<1e-6);assert(Math.abs(relay.speed-17)<1e-6);
  return{sniper:sniper.speed,calmSniper:calm.speed,legacySniper:old.speed,scout:scout.speed,other:relay.speed,telegraphSeconds:sniper.charge};
 });
 await test('sniper-visible-aim-in-combat',()=>{const e=ground(),b=e.board,x=b.enemies.find(x=>x.archetype==='sniper');b.pos=[12,0,-4];b.camera=b.pos.slice();x.pos=[12,0,-16];x.charge=.4;x.aim=b.pos.slice();
  const a=h.run('citadelInterior')(e,0,true);const markers=a.filter(v=>v.baseFeature==='warning-line'||v.sniperAim2130||v.baseFeature==='sniper-aim');
  assert(markers.length,'Charging sniper has no visible aim geometry after combat filtering');return{aimItems:markers.length};
 });
 await test('fast-projectile-does-not-tunnel-through-player',()=>{const e=ground(),b=e.board;b.pos=[12,0,-16];b.camera=b.pos.slice();b.enemies=[];b.invulnerable=0;b.hp=100;
  b.hostile=[{pos:[10.4,0,-16],vel:[84,0,0],life:2,damage:13,r:.18,sniper2130:true,baseKitScaled:true}];e.step(1/30,{});assert(b.hp<100,'Fast bullet skipped the player between endpoints');return{damage:100-b.hp,dt:1/30};
 });
 await test('dock-opens-before-hull-crossing-and-pauses',()=>{const e=fixture(h,1);C.enable(e);e.phase='dock';e.status='docking';e.dock={start:[e.station.pos[0],e.station.pos[1]+1,e.station.pos[2]-118],duration:11.8};e.phaseClock=0;let crossing=null,previous=0;
  for(let i=0;i<708;i++){const t=i/708;e.phaseClock=t*11.8;const s=M.gateState(e);assert(s.open>=previous);previous=s.open;const pos=e.dockShip(t);if(!crossing&&pos[2]>e.station.pos[2]-30)crossing={t,open:s.open};}
  assert(crossing&&crossing.open===1,'Door not fully clear before ship nose arrives');e.phaseClock=3;e.player.pos=e.dockShip(e.dockProgress());e.pause();const before=M.gateState(e);for(let i=0;i<120;i++)e.step(1/60,{});assert.deepEqual(M.gateState(e),before);return{crossing};
 });
 await test('base-route-stays-walkable-and-removes-cell-zigzags',()=>{const pathFn=h.run('stationPath'),line=h.run('stationLine'),walk=h.run('stationWalkable');let pairs=0,reduced=0,maxReduction=0;
  for(const id of [2,5,8,11]){const e=ground(id),b=e.board,points=Array.from(b.cells.values()).filter(x=>x.zone===0).map(x=>[x.x*4,0,x.z*4]).filter(p=>walk(b,p,.9,true));
   for(let i=0;i<points.length;i+=Math.max(1,Math.floor(points.length/25))){b.pos=points[i].slice();const target=b.terminals[0],raw=pathFn(b,b.pos,target);if(!raw.length)continue;const route=M.route(e,target);let prior=b.pos;
    for(const p of route){assert(line(b,prior,p,.65,true),'Smoothed route cuts geometry at level '+id+' '+JSON.stringify([prior,p]));prior=p;}
    assert(route.length<=raw.length);assert.deepEqual(copy(M.route(e,target)),copy(route),'Stationary route jitters');if(route.length<raw.length)reduced++;maxReduction=Math.max(maxReduction,raw.length-route.length);pairs++;
   }
  }return{pairs,reduced,maxReduction};
 });
 const result={pass:!failures.length,method:'Node VM direct fixtures; no human/device trial. Tests include deliberate geometric contacts and normal simulation steps, not a full campaign.',passed:rows.length,failed:failures.length,rows,failures};fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'motion2130-contracts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,passed:rows.length,failures}));if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
