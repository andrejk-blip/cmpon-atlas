#!/usr/bin/env node
'use strict';
// Independent 2.17.7 encounter comparison. Fixtures supply declared prerequisites;
// after launch every action is ordinary input. Exact-state controllers are not
// calibrated human players, and simulation seconds are not human play time.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab}=require('./release260-verifier.cjs');
const {pilot}=require('./helpers/convoy2150-inputs.js');
const {createController:createSwarm}=require('./helpers/swarm270-inputs.js');
const {realInput}=require('./swarm-regression.cjs');
const {question}=require('./learning280-verifier.cjs');
const out=path.join(__dirname,'qa-2.17.7'),copy=x=>JSON.parse(JSON.stringify(x)),rnd=n=>Number.isFinite(n)?+n.toFixed(3):null;
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
 entry.scripts=entry.scripts.filter(s=>!s.includes('atlas-site-metrics'));const h=await lab(entry),{e,events}=prepare(h,spec),swarm=createSwarm(h.c.CITADEL_SWARM,{reaction:spec.reaction});
 const convoy=spec.kind==='convoy'?pilot(h,e,{reaction:spec.reaction,device:'joystick',strategy:spec.idle?'idle':'reactive'}):null;
 const r={key:key(spec),...spec,fixture:'direct encounter with standard gear; no traversal or resource edits after launch',startHp:e.player.hp,startGear:copy(e.upgrades),startMissiles:e.player.missiles,
  waves:[],enemySamples:[],repairs:[],damage:[],cards:[],transitions:[],errors:[],minHp:e.player.hp,missilesFired:0,pulses:0,peakHostile:0,peakEnemies:0};
 const seen=new Set(),enemies=new Set();let seconds=0,transition='',cardCount=0,i=0;
 const cap=spec.kind==='swarm'?500:180;
 try{
  for(;i<cap*60;i++){
   if(e.campaign2120?.modal){const t=e.campaign2120.modal.type;h.action(t==='comic2170'?'collection2170-comic-next':t==='afterparallax'?'xp-comic-next':'campaign-modal-close');continue;}
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
   let input=spec.idle&&spec.kind==='swarm'?{}:convoy?convoy.input():swarm(e);
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
module.exports={run,prepare,specs,key};if(require.main===module)(async()=>{const entry=readEntry('play.html');const selected=specs.filter(s=>s.mode==='combat'&&s.stage===2&&(s.idle||s.reaction===.55||s.reaction===.25||s.kind==='convoy'&&s.seed===417147));const results=[];for(const s of selected){const r=await run(entry,s);results.push(r);console.log(JSON.stringify({kind:r.kind,reaction:r.reaction,idle:r.idle,complete:r.complete,hp:r.hp,seconds:r.seconds,errors:r.errors}));}fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'balance-'+(process.argv[2]||'after')+'.json'),JSON.stringify({method:'Direct encounter fixtures. Ordinary delayed inputs after setup; exact-state controllers, not human players.',results},null,2));})().catch(e=>{console.error(e.stack);process.exitCode=1;});

