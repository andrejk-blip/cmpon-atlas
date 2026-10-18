#!/usr/bin/env node
'use strict';
// These two CUP fixtures were saved after a real, unmodified calm playthrough
// of levels 01–09 (seed417147), at level10 entry and after the old upward escape.
// The pilot below holds the same fire/missile/defensive-pulse inputs as that run.
// No HP/ammo grants, enemy deletion, target teleport or skipped lesson is used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const docking=require('./docking-regression.cjs');
const root=path.resolve(__dirname,'..'),asset=name=>path.join(root,'assets',name);
const plain=x=>JSON.parse(JSON.stringify(x));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const fixtures=Object.fromEntries(['start','stalled'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',`flight-calm-level10-${name}.json`)))]));
function restoreSnapshot(h,snapshot){
 let e;
 if(h.unpack)e=h.unpack(snapshot,{seed:snapshot.engine.seed,mode:snapshot.engine.assist?'calm':'normal'},()=>{});
 else{
  // The frozen private lab has no CUP API. Apply the same saved field values
  // and RNG through a fixture adapter; this does not claim a private CUP API.
  const saved=JSON.parse(JSON.stringify(snapshot),(_,v)=>v&&Array.isArray(v._cupSet)?new Set(v._cupSet):v&&Array.isArray(v._cupMap)?new Map(v._cupMap):v);
  e=new h.Engine(saved.engine.seed,()=>{});e.start(saved.engine.assist);Object.assign(e,saved.engine);
  const native=vm.runInContext('arcadeSeed',h.context)(snapshot.rng);let state=snapshot.rng>>>0;
  e.random=()=>{state=(state*1664525+1013904223)>>>0;const value=native();assert.equal(value,state/4294967296,'Private RNG sequence is unchanged');return value;};
  e.random.getState=()=>state;e.hullCache=null;e.detour=null;
 }
 h.arcade.engine=e;h.arcade.sound=false;h.arcade.fx=false;return e;
}
function snapshotOf(h,e){
 return h.pack?h.pack(e):JSON.parse(JSON.stringify({schema:1,engine:e,rng:e.random.getState()},(k,v)=>
  ['hullCache','detour'].includes(k)?undefined:v instanceof Set?{_cupSet:[...v]}:v instanceof Map?{_cupMap:[...v]}:v));
}
function input(h,e){
 const target=e.target?.(),close=e.hostile.some(x=>distance(x.pos,e.player.pos)<12);
 return docking.actual(h,e,{fire:true,missile:!!target&&e.player.missiles>0,pulse:close});
}
function advance(h,e,seconds,{stopOnRecovery=false}={}){
 const start=e.elapsed,initialAltitude=Math.abs(e.player.pos[1]-e.station.pos[1]);
 let maxAltitude=initialAltitude,maxDistance=distance(e.player.pos,e.station.pos),cards=0,recoveries=0,lastRecovery=null;
 for(let frame=0;frame<seconds*60+100&&e.elapsed-start<seconds;frame++){
  maxAltitude=Math.max(maxAltitude,Math.abs(e.player.pos[1]-e.station.pos[1]));
  maxDistance=Math.max(maxDistance,distance(e.player.pos,e.station.pos));
  assert(e.player.pos.every(Number.isFinite)&&Number.isFinite(e.player.hp));
  const r=h.api.recovery?.(e);
  if(r&&r.started!==lastRecovery){recoveries++;lastRecovery=r.started;}
  if(stopOnRecovery&&r)break;
  if(e.status==='boarding'||['lost','crashing'].includes(e.status))break;
  if(e.status==='briefing'){h.action('citadel-launch');continue;}
  if(e.status==='lesson'){
   const q=h.lessonCase(e,e.lesson.caseIndex);
   if(!e.lesson.solved){h.action('citadel-lesson-answer',q.correct);cards++;}
   h.action('citadel-lesson-next');continue;
  }
  e.step(1/60,input(h,e));
 }
 return{seconds:+(e.elapsed-start).toFixed(3),status:e.status,phase:e.phase,wave:e.wave,kills:e.stageKills,
  hp:+e.player.hp.toFixed(2),stationHp:+e.stationHp.toFixed(2),cards,recoveries,
  maxAltitude:+maxAltitude.toFixed(3),maxDistance:+maxDistance.toFixed(3),initialAltitude:+initialAltitude.toFixed(3)};
}
async function verify(core){
 const h=await docking.harness(core,'1.9.1'),groups=[];
 const check=(name,fn)=>{const detail=fn();groups.push({name,passed:true,...(detail?{detail}:{})});console.log(`[flight191] ${path.basename(core)} PASS: ${name}`);};
 if(path.basename(core)==='atlas-v1.3.5.js'){
  const before=await docking.harness(core,'1.8.1');
  check('Actual saved level10 reproduces the old moving upward waypoint with the same pilot',()=>{
   const e=restoreSnapshot(before,fixtures.start),result=advance(before,e,40);
   assert.equal(e.status,'playing');assert.equal(e.wave,1);assert(result.maxAltitude>250);
   assert.equal(e.stageKills,8);return result;
  });
 }
 for(const name of ['start','stalled'])check(`Same ${name} CUP state reaches the next deck using real inputs, all waves, boss and cards`,()=>{
  const e=restoreSnapshot(h,fixtures[name]),result=advance(h,e,180);
  assert.equal(e.status,'boarding',JSON.stringify(result));assert.equal(e.stage,3);assert.equal(e.wave,3);
  assert(e.bossDefeated);assert.equal(result.cards,2);assert(e.stationHp>0);
  assert(result.maxAltitude<=Math.max(125,result.initialAltitude+4),'No further upward escape');
  if(name==='start')assert(result.maxDistance<260,'Battle remains around the station');
  return result;
 });
 check('Finite world waypoint, real weapon target, pause and checkpoint preserve the recovery',()=>{
  let e=restoreSnapshot(h,fixtures.start);advance(h,e,30,{stopOnRecovery:true});
  const route=plain(h.api.recovery(e));assert(route?.point);
  const enemies=JSON.stringify(e.enemies),score=e.score,missiles=e.player.missiles;
  for(let i=0;i<20;i++)e.guidance({});
  assert.deepEqual(plain(h.api.recovery(e)),route,'Repeated planning never moves the waypoint with the player');
  assert.equal(JSON.stringify(e.enemies),enemies);assert.equal(e.score,score);assert.equal(e.player.missiles,missiles);
  assert.equal(e.navTarget().id,route.targetId);assert(e.enemies.some(x=>x.id===route.targetId));
  assert.equal(h.hull(e,route.point,route.point,7),null);
  h.action('arcade-pause');const before=plain({pos:e.player.pos,elapsed:e.elapsed,route:h.api.recovery(e)});
  for(let i=0;i<120;i++)e.step(1/60,{});
  assert.deepEqual(plain({pos:e.player.pos,elapsed:e.elapsed,route:h.api.recovery(e)}),before);
  e=restoreSnapshot(h,snapshotOf(h,e));
  assert.deepEqual(plain(h.api.recovery(e)),route,'Real saved world waypoint is restored');
  h.action('arcade-pause');e.step(1/60,docking.actual(h,e));
  assert.equal(e.status,'playing');assert(h.api.recovery(e));
  return{point:route.point,target:route.targetId,serializer:h.pack?'CUP':'private fixture adapter'};
 });
 check('Actual G/manual flight/G invalidates the earlier recovery route',()=>{
  const e=restoreSnapshot(h,fixtures.start);advance(h,e,30,{stopOnRecovery:true});
  const old=plain(h.api.recovery(e));assert(old);
  h.action('citadel-guidance');assert.equal(e.autopilot,false);
  e.step(1/60,docking.actual(h,e,{turn:.8,pitch:-.45,boost:true}));
  assert.equal(e.navWatch?.flight191,undefined,'Manual control immediately discards the old leg');
  const start=e.player.pos.slice();
  for(let i=0;i<180;i++)e.step(1/60,docking.actual(h,e,{turn:.55,pitch:-.15,boost:true}));
  assert(distance(start,e.player.pos)>10,'Pilot actually changes position before returning to auto');
  h.action('citadel-guidance');assert.equal(e.autopilot,true);
  e.step(1/60,docking.actual(h,e));
  const current=h.api.recovery(e);
  if(current)assert(current.started>old.started,'A fresh world route is calculated');
  return{manualTravel:+distance(start,e.player.pos).toFixed(2),newRecovery:!!current};
 });
 check('Normal autopilot still reaches front, rear, side and raised entrances on both campaign ends',()=>{
  const results=[];
  for(const stage of [0,3])for(const [name,pos,yaw] of [
   ['front',[78,13,-300],Math.PI],['rear',[78,13,50],0],['right',[220,12,-55],-Math.PI/2],['above',[78,100,-55],0]]){
   const {e}=docking.dock(h,{stage,pos,yaw,auto:true});
   const seconds=docking.fly(h,e,60);
   assert.equal(e.status,'docking',`${stage}/${name}`);assert.equal(e.player.hp,100);assert.equal(e.collisionCount||0,0);
   results.push({stage,start:name,seconds});
  }
  return{runs:results.length,results};
 });
 return{core:path.basename(core),coreSha256:sha(core),passed:groups.length,groups};
}
async function main(argv=process.argv.slice(2)){
 const at=argv.indexOf('--report'),reportFile=at>=0?path.resolve(argv[at+1]):null;
 const cores=[asset('atlas-v1.3.5.js'),path.resolve(root,'../cmpon-analytics-admin/game-lab/engine-v1.2.1.js')],results=[];
 const start=Date.now();for(const core of cores)results.push(await verify(core));
 const report={version:'1.9.1',patchSha256:sha(asset('citadel-flight-v1.9.1.js')),wallSeconds:(Date.now()-start)/1000,
  fixtures:Object.fromEntries(['start','stalled'].map(name=>[name,sha(path.join(__dirname,'fixtures',`flight-calm-level10-${name}.json`))])),
  method:'Real frozen cores, saved calm campaign/RNG, ordinary actions and keyboard inputs, no resource grants or enemy/objective bypass.',results};
 if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));return report;
}
module.exports={verify,main,restoreSnapshot,advance};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
