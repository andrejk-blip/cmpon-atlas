#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createSwarmController}=require('./helpers/campaign-inputs.js');
const {createOrbitalController}=require('./helpers/orbital260-inputs.js');
const {realInput}=require('./swarm-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.6.0'),clone=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function entry(version='2.6.0'){
 const html=fs.readFileSync(path.join(__dirname,'entry-'+version+'.html'),'utf8');
 const scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(x=>x[1].split('?')[0]);
 return{html,scripts,sources:new Map(scripts.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]))};
}
async function boot(version='2.6.0'){
 const data=entry(version),h=entryHarness(data);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false');h.entry=data;return h;
}
function make(h,stage,assist=false,upgrades={weapons:0,armor:0,rockets:0}){
 const e=new h.Engine(417147);e.assist=assist;e.upgrades={...upgrades};e.beginStage(stage);h.arcade.engine=e;e.launch();return e;
}
const forbidden=new Set(['fireCue','attackCue','cueAim','fireClock','diveClock','modeTime','route','shot','attack','telegraph']);
function observed(x){return new Proxy(x,{get(object,key){if(forbidden.has(key))throw Error('QA controller attempted hidden cue '+key);return Reflect.get(object,key);}});}
function swarmView(e){
 const result={stage:e.stage,phase:e.phase,status:e.status,crash:!!e.crash,finale:e.finale,swarm:{version:e.swarm.version,rulesVersion:e.swarm.rulesVersion,complete:e.swarm.complete},
  player:observed({...e.player,pos:e.player.pos.slice()}),enemies:e.enemies.map(x=>observed({id:x.id,pos:x.pos.slice(),vel:x.vel.slice(),rank:x.rank,role:x.role,mode:x.mode==='dive'?'dive':'formation',hp:x.hp,dead:x.dead,swarmDrone:x.swarmDrone})),
  hostile:e.hostile.map(x=>observed({pos:x.pos.slice(),vel:x.vel.slice(),r:x.r}))};
 return observed(result);
}
function lessons(h,e){if(e.status==='lesson'){e.answerLesson(h.lessonCase(e,e.lesson.caseIndex).correct);e.continueLesson();return true;}return false;}
function playSwarm(h,{assist=false,profile='helper',maxSeconds=360}={}){
 const e=make(h,2,assist),operator=createSwarmController(h.c.CITADEL_SWARM),waves=new Set(),seenShots=new WeakSet();let firstShot=null,shots=0,cueFrames=0,maxHostile=0,minHP=100;
 for(let i=0;i<maxSeconds*60;i++){
  if(lessons(h,e))continue;if(e.phase==='dock'||['lost','crashing'].includes(e.status))break;
  let command=profile==='stationary-fire'?{fire:true}:operator(swarmView(e));
  if(profile==='movement-no-fire')command={...command,fire:false,missile:false,pulse:false};
  e.step(1/60,realInput(h,e,command));waves.add(e.swarm.waveIndex+1);minHP=Math.min(minHP,e.player.hp);maxHostile=Math.max(maxHostile,e.hostile.length);
  for(const x of e.enemies)if(x.fireCue>0||x.attackCue>0)cueFrames++;
  for(const x of e.hostile)if(!seenShots.has(x)){seenShots.add(x);shots++;firstShot??=e.swarm.time;}
 }
 return{mode:assist?'calm':'combat',profile,status:e.status,complete:e.swarm.complete,waves:[...waves],seconds:e.swarm.time,hp:e.player.hp,minHP,kills:e.stageKills,score:e.score,shots,firstShot,cueFrames,maxHostile};
}
async function battleEntry(h,stage,assist=false){
 const e=make(h,stage,assist);
 for(let i=0;i<60*30&&e.phase!=='battle';i++){
  if(lessons(h,e))continue;e.step(1/60,{});
 }
 assert.equal(e.phase,'battle');return e;
}
function watchShots(e){
 const log=[],old=e.hostileShot;let now=0;
 e.hostileShot=function(enemy,...args){const before=this.hostile.length,result=old.call(this,enemy,...args);if(this.hostile.length>before)log.push({time:now,id:enemy.id,role:enemy.role||enemy.type,bullets:this.hostile.length-before});return result;};
 return{log,time:t=>{now=t;}};
}
const median=a=>{const v=a.slice().sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
function cadence(e,seconds=24){
 const before=[...e.enemies,...(e.boss?[e.boss]:[])].map(x=>({id:x.id,role:x.role||x.type,hp:x.hp,points:x.points,pos:x.pos.slice(),shot:x.shot,warp:x.warp})),watch=watchShots(e);
 const firstEligible=new Map();
 for(let i=0;i<seconds*60&&e.status==='playing';i++){
  const time=(i+1)/60;watch.time(time);
  for(const x of [...e.enemies,...(e.boss?[e.boss]:[])]){
   const dest=x.role==='bomber'?e.station.pos:e.player.pos,distance=Math.hypot(...x.pos.map((v,j)=>v-dest[j]));
   if((x.warp||0)<=0&&(x.type==='boss'||distance<(x.role==='bomber'?110:160))&&!firstEligible.has(x.id))firstEligible.set(x.id,time);
  }
  // Isolated weapon/movement integrator bench: no player/enemy HP edits and no
  // projectile integration. This is deliberately not labelled mission play.
  e.enemyStep(1/60);
 }
 const ships=before.map(x=>{const events=watch.log.filter(y=>y.id===x.id),times=[...new Set(events.map(y=>y.time))];return{...x,shots:events.length,volleys:times.length,first:times[0]??null,firstEligible:firstEligible.get(x.id)??null,medianInterval:median(times.slice(1).map((n,i)=>n-times[i]))};});
 return{ships,bullets:watch.log.reduce((a,b)=>a+b.bullets,0),score:e.score,playerHP:e.player.hp,method:'Isolated enemyStep weapon-clock bench; bullets are observed but not integrated. Not a gameplay victory.'};
}
function gameplayOrbit(h,stage=3,{assist=false,profile='helper',snapshot=null,maxSeconds=300,observe=null,operatorOptions={resupply:false}}={}){
 const e=snapshot?h.unpack(snapshot,{seed:snapshot.engine.seed,mode:assist?'calm':'normal'},()=>{}):make(h,stage,assist,{weapons:stage===3?2:0,armor:stage===3?1:0,rockets:0});
 h.arcade.engine=e;const operator=createOrbitalController(h,operatorOptions),history=[];let key='',minHP=100,pulses=0,missiles=0;
 for(let i=0;i<maxSeconds*60;i++){
  if(lessons(h,e))continue;observe?.(e);if(e.status==='boarding'||['lost','crashing'].includes(e.status))break;
  const marker=[e.phase,e.wave,!!e.boss].join('/');if(marker!==key){key=marker;history.push({phase:e.phase,wave:e.wave,boss:!!e.boss,time:e.elapsed,hp:e.player.hp,station:e.stationHp,missiles:e.player.missiles});}
  const before={missiles:e.player.missiles,pulse:e.player.pulseCooldown};
  const input=profile==='old'?{fire:true,missile:!!e.target()&&e.player.missiles>0,pulse:e.hostile.some(x=>Math.hypot(...x.pos.map((v,j)=>v-e.player.pos[j]))<12),interact:e.phase==='dock'}:operator(e);
  e.step(1/60,realInput(h,e,input));minHP=Math.min(minHP,e.player.hp);if(e.player.missiles<before.missiles)missiles++;if(e.player.pulseCooldown>before.pulse)pulses++;
 }
 return{level:stage*3+1,assist,profile,operatorOptions,pass:e.status==='boarding',status:e.status,phase:e.phase,seconds:e.elapsed,hp:e.player.hp,minHP,station:e.stationHp,bossHP:e.boss?.hp??null,bossDefeated:e.bossDefeated,missiles,pulses,history};
}
async function resumeContract(h,stage){
 const e=await battleEntry(h,stage),operator=createOrbitalController(h);for(let i=0;i<2*60&&e.status==='playing';i++)e.step(1/60,realInput(h,e,operator(e)));
 const snap=h.pack(e),copy=h.unpack(snap,{seed:e.seed,mode:'normal'},()=>{}),a=watchShots(e),b=watchShots(copy);
 for(let i=0;i<8*60&&e.status==='playing';i++){
  const t=(i+1)/60;a.time(t);b.time(t);e.enemyStep(1/60);copy.enemyStep(1/60);
  assert.deepEqual(clone(copy.hostile),clone(e.hostile),'reloading cannot duplicate hostile bullets');
  assert.deepEqual(clone(copy.enemies),clone(e.enemies),'reloading must preserve all weapon cooldowns');assert.equal(copy.player.hp,e.player.hp);
 }
 assert.deepEqual(a.log,b.log);return{level:stage*3+1,shots:a.log.length,snapshotBullets:snap.engine.hostile.length,duplicateShots:0,exactEnemyContinuation:true,scope:'enemyStep only; player overdriveUntil is missing from the legacy CUP save schema and is a separately reported issue'};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const current=await boot(),old=await boot('2.5.0'),report={entrySHA256:sha(current.entry.html),productionSHA256:Object.fromEntries([...current.entry.sources].map(([name,source])=>[name,sha(source)])),operatorSHA256:sha(fs.readFileSync(path.join(__dirname,'helpers/orbital260-inputs.js'))),method:'Exact integrated candidate and frozen 2.5 entry in Node VM; no real browser. Gameplay controls use current positions/velocities and own ship gauges, never enemy warning clocks.',swarm:[],cadence:[],resume:[],orbit:[]};
 for(const assist of [false,true])for(const profile of ['stationary-fire','movement-no-fire','helper']){const r=playSwarm(current,{assist,profile});report.swarm.push(r);console.log('swarm',JSON.stringify(r));}
 for(const stage of [0,3]){
  const a=await battleEntry(old,stage),b=await battleEntry(current,stage);const before=x=>x.enemies.map(e=>({role:e.role,type:e.type,hp:e.hp,points:e.points}));assert.deepEqual(clone(before(a)),clone(before(b)),'new cadence must preserve HP and per-enemy score');
  const prior=cadence(a),next=cadence(b),ratios=next.ships.map(x=>{const previous=prior.ships.find(y=>y.id===x.id)?.medianInterval;return{id:x.id,role:x.role,ratio:previous&&x.medianInterval?previous/x.medianInterval:null,oldInterval:previous,newInterval:x.medianInterval};});
  assert.equal(prior.score,next.score,'weapon cadence must not change score');
  for(const x of ratios.filter(x=>['fighter','bomber','hunter'].includes(x.role)&&x.oldInterval&&x.newInterval))assert.ok(x.ratio>2.9&&x.ratio<3.1,'60 Hz weapon cadence must remain approximately 3x');
  for(const x of next.ships.filter(x=>x.first!==null&&x.firstEligible!==null))assert.ok(x.first<=x.firstEligible+1/60+1e-7,'combat enemy must shoot on its first eligible frame');
  report.cadence.push({level:stage*3+1,old:prior,current:next,ratios});report.resume.push(await resumeContract(current,stage));console.log('cadence',JSON.stringify({level:stage*3+1,ratios}));
 }
 for(const profile of ['old','helper']){const r=gameplayOrbit(current,3,{profile});report.orbit.push(r);console.log('orbit',JSON.stringify(r));}
 const checkpoint=path.join(out,'verifier-checkpoint-normal-10.json');
 if(fs.existsSync(checkpoint)){
  const checkpointText=fs.readFileSync(checkpoint,'utf8'),snapshot=JSON.parse(checkpointText).snapshot,captures={};report.campaignCheckpoint={source:path.relative(root,checkpoint),sourceSHA256:sha(checkpointText),entrySeconds:snapshot.engine.elapsed,old:gameplayOrbit(current,3,{profile:'old',snapshot})};
  report.campaignCheckpoint.helper=gameplayOrbit(current,3,{profile:'helper',snapshot,observe:e=>{if(e.boss&&!captures.upper)captures.upper=current.pack(e);if(e.boss&&e.boss.hp<e.boss.maxHp*.5&&!captures.lower)captures.lower=current.pack(e);}});
  console.log('campaign checkpoint',JSON.stringify(report.campaignCheckpoint));
  report.bossCadence=[];
  for(const [phase,save]of Object.entries(captures)){
   const run={seed:save.engine.seed,mode:'normal'},a=old.unpack(save,run,()=>{}),b=current.unpack(save,run,()=>{});
   const prior=cadence(a,12),next=cadence(b,12),x=prior.ships.find(x=>x.role==='boss'),y=next.ships.find(x=>x.role==='boss');
   assert.equal(x.hp,y.hp);assert.equal(x.points,y.points);assert.ok(x.medianInterval/y.medianInterval>2.9&&x.medianInterval/y.medianInterval<3.1,'boss weapon cadence must remain approximately 3x');
   report.bossCadence.push({phase,hp:y.hp,points:y.points,oldHP:x.hp,oldPoints:x.points,oldInterval:x.medianInterval,newInterval:y.medianInterval,ratio:x.medianInterval/y.medianInterval});
  }
 }
 const calmOld=cadence(await battleEntry(old,0,true),12),calmCurrent=cadence(await battleEntry(current,0,true),12);
 assert.deepEqual(clone(calmCurrent),clone(calmOld),'training enemy cadence must remain unchanged');report.calmCadence={level:1,exactMatch:true,old:calmOld,current:calmCurrent};
 for(const run of report.swarm.filter(x=>x.mode==='combat'))assert.equal(run.cueFrames,0,'combat swarm must not expose advance warning state');
 const failures=report.swarm.filter(r=>r.profile==='helper'&&!r.complete||r.profile!=='helper'&&r.complete);report.pass=!failures.length&&(!report.campaignCheckpoint||report.campaignCheckpoint.helper.pass);report.passScope='Requested pressure contracts: swarm helper completes both modes, negative controls cannot complete, 3x orbital weapon cadence with unchanged HP/score, immediate eligible attacks, zero combat cues, exact enemy-only save continuation, unchanged calm cadence, and campaign-checkpoint orbital completion.';report.exploratoryLimitation='Fresh isolated level-10 RNG differs from a full campaign. Its pilot results are reported, not treated as campaign completion or a guaranteed human difficulty measure.';
 fs.writeFileSync(path.join(out,'combat-pressure.json'),JSON.stringify(report,null,2)+'\n');if(!report.pass)process.exitCode=1;
}
module.exports={entry,boot,make,playSwarm,battleEntry,cadence,gameplayOrbit,resumeContract,swarmView};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
