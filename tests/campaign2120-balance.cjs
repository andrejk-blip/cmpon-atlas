#!/usr/bin/env node
'use strict';
// Independent 2.12 balance comparison. Fixtures supply declared prerequisites;
// after launch every action is ordinary input. Exact-state controllers are not
// calibrated human players, and simulation seconds are not human play time.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,gitEntry,lab}=require('./release260-verifier.cjs');
const {pilot}=require('./helpers/convoy260-inputs.js');
const {createController:createSwarm}=require('./helpers/swarm270-inputs.js');
const {realInput}=require('./swarm-regression.cjs');
const {question}=require('./learning280-verifier.cjs');
const BASELINE='f4afdf8758f1fe186b8f69e8332782fb0548be4e';
const out=path.join(__dirname,'qa-2.12.0'),copy=x=>JSON.parse(JSON.stringify(x)),rnd=n=>Number.isFinite(n)?+n.toFixed(3):null;
const specs=[];
for(const seed of [417147,819337])for(const reaction of [.25,.55])specs.push({kind:'swarm',stage:2,mode:'combat',seed,reaction});
specs.push({kind:'swarm',stage:2,mode:'training',seed:417147,reaction:.55});
specs.push({kind:'swarm',stage:2,mode:'pro',seed:819337,reaction:.55});
for(const seed of [417147,819337])for(const noMissiles of [false,true])specs.push({kind:'convoy',stage:2,mode:'combat',seed,reaction:.4,noMissiles});
specs.push({kind:'convoy',stage:2,mode:'combat',seed:417147,reaction:.55});
specs.push({kind:'convoy',stage:2,mode:'training',seed:417147,reaction:.55});
specs.push({kind:'convoy',stage:2,mode:'pro',seed:417147,reaction:.4});
for(const stage of [0,1])specs.push({kind:'convoy',stage,mode:'combat',seed:417147,reaction:.4});
specs.push({kind:'swarm',stage:2,mode:'combat',seed:417147,reaction:.55,idle:true});
specs.push({kind:'convoy',stage:2,mode:'combat',seed:417147,reaction:.4,idle:true});
const key=s=>[s.kind,s.stage,s.mode,s.seed,s.reaction,s.noMissiles?'no-rockets':'rockets',s.idle?'idle':'reactive'].join(':');
function prepare(h,spec){
 const events=[],e=new h.Engine(spec.seed,(kind,data)=>events.push({kind,data,time:e?.elapsed}));
 h.arcade.engine=e;h.c.CITADEL_LEARNING_MODES.setEngineMode(e,spec.mode);e.caseBank=1;
 // Direct encounter fixtures do not call start(); opt into the new campaign
 // exactly as a new ordinary campaign does. Baseline has no such API.
 h.c.CITADEL_CAMPAIGN?.enable(e);
 const lessons=h.run('CITADEL_LESSONS'),stage=spec.stage;
 function prerequisites(editions){
  e.rescued=e.plan.slice(0,editions).flat();e.completedRemarks=Array.from({length:editions*3},(_,i)=>i);
  e.decisions=Array.from({length:editions*2},(_,i)=>({caseIndex:i,stage:Math.floor(i/2),reqId:e.plan[Math.floor(i/2)][i%2?2:0],firstTry:true,decision:lessons[i].correct}));
  e.escorts=Array.from({length:Math.max(0,editions-1)},(_,from)=>({from,survivors:3,score:0,kills:0}));
 }
 prerequisites(stage);e.upgrades={weapons:stage>=3?2:stage>=1?1:0,armor:stage>=2?1:0,rockets:0};e.beginStage(stage);
 if(spec.kind==='convoy'){
  prerequisites(stage+1);e.modules().forEach(p=>p.dead=true);e.wave=3;
  e.stageKills=h.run('CITADEL_MISSIONS')[stage].waves.reduce((a,b)=>a+b,0);
  e.enemies=[];e.boss=null;e.bossDefeated=false;e.lesson=null;e.lessonQueue=[];
  e.upgrades={weapons:stage>=2?2:1,armor:stage>=1?1:0,rockets:0};
  e.status='stageclear';e.phase='debrief';e.upgradeChoice='weapons';e.beginEscort();
 }
 h.action('citadel-launch');return{e,events};
}
async function run(entry,spec){
 const h=await lab(entry),{e,events}=prepare(h,spec),swarm=createSwarm(h.c.CITADEL_SWARM,{reaction:spec.reaction});
 const convoy=spec.kind==='convoy'?pilot(h,e,{reaction:spec.reaction,device:'joystick',strategy:spec.idle?'idle':'reactive'}):null;
 const r={key:key(spec),...spec,fixture:'direct encounter with standard gear; no traversal or resource edits after launch',startHp:e.player.hp,startGear:copy(e.upgrades),startMissiles:e.player.missiles,
  waves:[],enemySamples:[],repairs:[],damage:[],cards:[],transitions:[],errors:[],minHp:e.player.hp,missilesFired:0,pulses:0,peakHostile:0,peakEnemies:0};
 const seen=new Set(),enemies=new Set();let seconds=0,transition='',cardCount=0,i=0;
 const cap=spec.kind==='swarm'?500:180;
 try{
  for(;i<cap*60;i++){
   const state=e.status+'/'+e.phase;if(state!==transition){r.transitions.push({at:rnd(seconds),state});transition=state;}
   // Combat completion is an authored swarm result, independent of the new
   // campaign's docking/Parallax order. We never force this flag ourselves.
   if(spec.kind==='swarm'&&e.swarm?.complete||spec.kind==='convoy'&&e.escort?.completed)break;
   if(['lost','crashing','won'].includes(e.status))break;
   if(e.status==='campaigncard'){
    const api=h.c.CITADEL_CAMPAIGN,q=api.questions[api.state(e).card.mission],correct=Array.isArray(q.correct)?q.correct[0]:q.correct;
    api.answer(e,correct);api.nextCard(e);if(++cardCount>15)throw Error('Repeated campaign card did not progress');continue;
   }
   if(['lesson','remark','finalcheck'].includes(e.status)){
    const q=question(h,e);r.cards.push({at:rnd(seconds),index:q.index,title:q.q.question||q.q.title||q.q.q});
    const action=e.status==='lesson'?'citadel-lesson-answer':e.status==='remark'?'citadel-answer':'finale-answer';
    const next=e.status==='lesson'?'citadel-lesson-next':e.status==='remark'?'citadel-remark-next':'finale-check-next';
    h.action(action,q.q.correct);h.action(next);if(++cardCount>15)throw Error('Repeated lesson did not progress');continue;
   }
   if(!['playing','docking'].includes(e.status))throw Error('Unhandled QA status '+e.status+' / '+e.phase);
   const hp=e.player.hp,ammo=e.player.missiles,pc=e.player.pulseCooldown,allyHp=e.escort?.allies.map(a=>a.hp);
   let input=spec.idle&&spec.kind==='swarm'?{}:convoy?convoy.input():realInput(h,e,swarm(e),true);
   if(spec.noMissiles)input.missile=false;
   e.step(1/60,input);seconds+=1/60;
   r.missilesFired+=Math.max(0,ammo-e.player.missiles);if(e.player.pulseCooldown>pc+.1)r.pulses++;
   if(e.player.hp<hp-.001)r.damage.push({at:rnd(seconds),amount:rnd(hp-e.player.hp),hp:rnd(e.player.hp),wave:e.swarm?e.swarm.waveIndex+1:null});
   if(e.player.hp>hp+.001||allyHp?.some((hp,j)=>e.escort.allies[j].hp>hp+.001))r.repairs.push({at:rnd(seconds),playerBefore:rnd(hp),playerAfter:rnd(e.player.hp),alliesBefore:allyHp?.map(rnd),alliesAfter:e.escort?.allies.map(a=>rnd(a.hp))});
   r.minHp=Math.min(r.minHp,e.player.hp);r.peakHostile=Math.max(r.peakHostile,e.hostile.length);r.peakEnemies=Math.max(r.peakEnemies,e.enemies.filter(x=>!x.dead).length);
   for(const x of e.enemies)if(!enemies.has(x.id)&&x.convoy240&&!x.torpedo){enemies.add(x.id);r.enemySamples.push({at:rnd(seconds),id:x.id,role:x.role,maxHp:x.maxHp,hp:rnd(x.hp)});}
   if(e.swarm&&!seen.has(e.swarm.waveIndex)){seen.add(e.swarm.waveIndex);r.waves.push({wave:e.swarm.waveIndex+1,at:rnd(seconds),hp:rnd(e.player.hp),enemies:e.enemies.filter(x=>!x.dead).length});}
   assert(Number.isFinite(e.player.hp)&&e.player.pos.every(Number.isFinite),'Non-finite state');
  }
 }catch(err){r.errors.push(err.stack);}
 Object.assign(r,{complete:spec.kind==='swarm'?!!e.swarm?.complete:!!e.escort?.completed,status:e.status,phase:e.phase,capReached:i>=cap*60,seconds:rnd(seconds),hp:rnd(e.player.hp),minHp:rnd(r.minHp),kills:e.stageKills,lossReason:e.lossReason||null,damageTaken:rnd(r.damage.reduce((n,x)=>n+x.amount,0))});
 if(e.swarm)r.swarm={wave:e.swarm.waveIndex+1,complete:e.swarm.complete,balanceVersion:e.swarm.balanceVersion,wavesCleared:e.swarm.wavesCleared,events:copy(e.swarm.events||[]),drops:copy(e.swarm.dropsCollected||{})};
 if(e.escort){r.allies=e.escort.allies.map(a=>({name:a.name,hp:rnd(a.hp),dead:!!a.dead,maxHp:a.maxHp??100}));r.convoy=copy(h.c.CITADEL_CONVOY.inspection(e));r.operator=convoy.stats();}
 r.stateEvents=events.filter(x=>['state','phase','lost'].includes(x.kind)).map(x=>({...x,time:rnd(x.time)}));return r;
}
function combatState(e){return copy({status:e.status,phase:e.phase,stage:e.stage,elapsed:e.elapsed,player:e.player,upgrades:e.upgrades,score:e.score,totalKills:e.totalKills,stageKills:e.stageKills,
 rescued:e.rescued,completedRemarks:e.completedRemarks,enemies:e.enemies,hostile:e.hostile,bullets:e.bullets,swarm:e.swarm,escort:e.escort});}
async function reach(h,e,spec,predicate,limit=240){
 const s=createSwarm(h.c.CITADEL_SWARM,{reaction:spec.reaction}),c=spec.kind==='convoy'?pilot(h,e,{reaction:spec.reaction,device:'joystick'}):null;
 for(let n=0;n<limit*60;n++){
  if(predicate(e))return;
  assert.equal(e.status,'playing','Checkpoint operator unexpectedly stopped');
  h.arcade.engine=e;e.step(1/60,c?c.input():realInput(h,e,s(e),true));
 }
 throw Error('Checkpoint not reached');
}
function unpack(h,snapshot){const e=h.unpack(copy(snapshot),{seed:snapshot.engine.seed,mode:snapshot.engine.assist?'calm':'normal'},()=>{});h.arcade.engine=e;return e;}
function compareContinuation(h,a,b,frames=120){
 assert.deepEqual(combatState(b),combatState(a),'Load changed current encounter resources or progress');
 for(let n=0;n<frames;n++){const input={fire:true,turn:0,pitch:0};h.arcade.engine=a;a.step(1/60,input);h.arcade.engine=b;b.step(1/60,input);}
 assert.deepEqual(combatState(b),combatState(a),'Loaded continuation diverged from uninterrupted encounter');
}
async function contracts(){
 const entry=readEntry('index.html'),rows=[],failures=[];
 const test=async(name,fn)=>{try{rows.push({name,pass:true,...await fn()});}catch(e){failures.push({name,error:e.message,stack:e.stack?.split('\n').slice(0,5)});}};
 await test('swarm-new-late-wave-repair-survives-save',async()=>{
  const h=await lab(entry),spec={kind:'swarm',stage:2,mode:'combat',seed:819337,reaction:.55},{e}=prepare(h,spec);
  await reach(h,e,spec,x=>x.swarm.waveIndex===3&&x.swarm.waveAge>2);
  assert.deepEqual(copy(e.swarm.repairedWaves),[3]);const snapshot=h.pack(e),loaded=unpack(h,snapshot);compareContinuation(h,e,loaded,60);
  assert.deepEqual(copy(loaded.swarm.repairedWaves),[3]);return{wave:4,continuedSeconds:1,hp:loaded.player.hp,repairFlags:copy(loaded.swarm.repairedWaves)};
 });
 await test('swarm-synthetic-existing-large-ammo-reserve-not-reduced-by-reward',async()=>{
  const h=await lab(entry),spec={kind:'swarm',stage:2,mode:'combat',seed:417147,reaction:.25},{e}=prepare(h,spec);
  // Separate boundary fixture: a carried rocket reserve at a cleared wave.
  e.swarm.waveIndex=2;e.swarm.packet=1;e.swarm.phase='cleared';e.swarm.transition=.001;e.player.missiles=20;
  e.step(1/60,{});assert.equal(e.swarm.waveIndex,3);assert(e.player.missiles>=20,'An automatic supply reward removed carried rockets');
  return{method:'Synthetic supply-boundary fixture',beforeMissiles:20,afterMissiles:e.player.missiles};
 });
 await test('convoy-save-before-midpoint-identical-one-repair',async()=>{
  const h=await lab(entry),spec={kind:'convoy',stage:2,mode:'combat',seed:417147,reaction:.4},{e}=prepare(h,spec);
  await reach(h,e,spec,x=>x.escort.distance>=.495);assert(!e.escort.ops240.midpointRepair2120);
  const loaded=unpack(h,h.pack(e));compareContinuation(h,e,loaded,120);
  assert.equal(loaded.escort.ops240.midpointRepair2120,true);assert.equal(loaded.escort.ops240.events.filter(x=>x.kind==='midpoint-repair').length,1);
  return{distance:loaded.escort.distance,repairEvents:1,allies:loaded.escort.allies.map(x=>x.hp)};
 });
 await test('convoy-repeat-load-after-midpoint-does-not-heal-again',async()=>{
  const h=await lab(entry),spec={kind:'convoy',stage:2,mode:'combat',seed:417147,reaction:.4},{e}=prepare(h,spec);
  await reach(h,e,spec,x=>x.escort.distance>=.52);assert.equal(e.escort.ops240.midpointRepair2120,true);let loaded=e;
  for(let k=0;k<5;k++){const restored=unpack(h,h.pack(loaded));compareContinuation(h,loaded,restored,1);loaded=restored;}
  assert.equal(loaded.escort.ops240.events.filter(x=>x.kind==='midpoint-repair').length,1);return{reloads:5,repairEvents:1};
 });
 await test('convoy-synthetic-dead-ally-is-not-revived-by-repair',async()=>{
  const h=await lab(entry),spec={kind:'convoy',stage:2,mode:'combat',seed:417147,reaction:.4},{e}=prepare(h,spec);
  // Explicit unit-contract fixture, not an ordinary-input playthrough result.
  // Seed one destroyed transport and a damaged survivor at the repair boundary.
  e.escort.distance=.5;e.escort.allies[0].hp=0;e.escort.allies[0].dead=true;e.escort.allies[1].hp=20;e.player.hp=30;
  e.step(1/60,{});assert(e.escort.allies[0].dead);assert.equal(e.escort.allies[0].hp,0);assert.equal(e.escort.allies[1].hp,80);assert.equal(e.player.hp,75);
  return{method:'Synthetic boundary fixture, not a campaign run',deadUnchanged:true,survivorHp:80,playerHp:75};
 });
 for(const kind of ['swarm','convoy'])await test('legacy-2110-'+kind+'-keeps-rules-and-resources',async()=>{
  const old=await lab(gitEntry(BASELINE)),h=await lab(entry),spec={kind,stage:2,mode:'combat',seed:819337,reaction:.4},{e}=prepare(old,spec);
  await reach(old,e,spec,x=>(kind==='swarm'?x.swarm.time:x.escort.time)>=10);
  const loaded=unpack(h,old.pack(e));assert(!h.c.CITADEL_CAMPAIGN.active(loaded));assert.deepEqual(combatState(loaded),combatState(e));
  for(let i=0;i<120;i++){const input={fire:true,turn:0,pitch:0};old.arcade.engine=e;e.step(1/60,input);h.arcade.engine=loaded;loaded.step(1/60,input);}
  assert.deepEqual(combatState(loaded),combatState(e));return{campaignUpgrade:false,continuedSeconds:2};
 });
 const result={method:'Save/reload contracts on reached encounter states; explicitly labelled synthetic boundary fixture for destroyed ally. No game source edits.',pass:!failures.length,rows,failures};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'balance-contracts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
 return result;
}
async function main(){
 if(process.argv.includes('--contracts'))return contracts();
 const baseline=process.argv.includes('--baseline'),mode=baseline?'baseline':'current';
 const entry=baseline?gitEntry(BASELINE):readEntry('index.html');
 const filter=process.argv.find(x=>x.startsWith('--kind='))?.split('=')[1];
 const rows=filter?specs.filter(x=>x.kind===filter):specs;
 const report={createdAt:new Date().toISOString(),version:baseline?'2.11.0':'2.12.0 candidate',baselineRef:BASELINE,method:'Node VM exact entry chain; ordinary inputs after direct-entry prerequisites; fixed controller cadence is not a human skill category; no browser FPS or phone-comfort claims.',entrySha256:crypto.createHash('sha256').update(entry.html).digest('hex'),sourceSha256:Object.fromEntries([...entry.sources].map(([file,source])=>[file,crypto.createHash('sha256').update(source).digest('hex')])),results:[]};
 fs.mkdirSync(out,{recursive:true});const target=path.join(out,'balance-'+mode+(filter?'-'+filter:'')+'.json');
 for(const spec of rows){const r=await run(entry,spec);report.results.push(r);fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({key:r.key,complete:r.complete,status:r.status,seconds:r.seconds,minHp:r.minHp,hp:r.hp,damage:r.damageTaken,allies:r.allies?.map(x=>x.hp),repairs:r.repairs.length,errors:r.errors}));await new Promise(setImmediate);}
 if(report.results.some(x=>x.errors.length))process.exitCode=1;
}
module.exports={run,prepare,specs,key,contracts};if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
