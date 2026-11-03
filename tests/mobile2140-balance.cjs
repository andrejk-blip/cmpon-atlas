#!/usr/bin/env node
'use strict';
// Bounded simulations with delayed held joystick decisions. These operators
// still observe exact positions; this is not a human or physical-device trial.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,gitEntry,lab}=require('./release260-verifier.cjs');
const {pilot}=require('./helpers/convoy260-inputs.js');
const BASELINE='b6776acd8d64c8d52e26d6dd1b7516da1fa90c3b';
const clone=x=>JSON.parse(JSON.stringify(x)),clamp=(x,a=-1,b=1)=>Math.max(a,Math.min(b,x));
function prepare(h,spec,modern=true){
 const e=new h.Engine(spec.seed,()=>{});h.arcade.engine=e;
 h.c.CITADEL_LEARNING_MODES.setEngineMode(e,spec.mode||'combat');
 if(modern)h.c.CITADEL_CAMPAIGN.enable(e);
 const stage=spec.kind==='pursuit'?1:spec.stage,editions=spec.kind==='pursuit'?stage:stage+1;
 e.rescued=e.plan.slice(0,editions).flat();e.completedRemarks=Array.from({length:editions*3},(_,i)=>i);
 const lessons=h.run('CITADEL_LESSONS');
 e.decisions=Array.from({length:editions*2},(_,i)=>({caseIndex:i,stage:Math.floor(i/2),reqId:e.plan[Math.floor(i/2)][i%2?2:0],firstTry:true,decision:lessons[i].correct}));
 e.escorts=Array.from({length:Math.max(0,editions-1)},(_,from)=>({from,survivors:3,score:0,kills:0}));
 e.upgrades={weapons:stage>=2?2:1,armor:stage>=1?1:0,rockets:0};
 e.beginStage(stage);
 if(spec.kind==='convoy'){
  e.modules().forEach(x=>x.dead=true);e.enemies=[];e.boss=null;e.bossDefeated=false;e.lesson=null;e.lessonQueue=[];
  e.status='stageclear';e.phase='debrief';e.upgradeChoice='weapons';e.beginEscort();
 }
 e.launch();return e;
}
function closeModal(h,e){
 const modal=e.campaign2120?.modal;if(!modal)return false;
 h.action(modal.type==='afterparallax'?'xp-comic-next':'campaign-modal-close');return true;
}
function pursue(e,reaction,idle=false){let next=-1,held={};return()=>{
 if(e.pursuit.clock>=next){next=e.pursuit.clock+reaction;
  const t=e.navTarget().pos,p=e.player.pos;
  // Predict neither future gates nor hidden attacks. Aim at the visible marker;
  // execute and hold the same joystick direction until the next observation.
  held=idle?{}:{turn:clamp((t[0]-p[0])/(46*reaction)),pitch:clamp((t[1]-p[1])/(34*reaction)),fire:true};
 }return held;
};}
async function run(entry,spec){
 const h=await lab(entry),e=prepare(h,spec),op=spec.kind==='pursuit'?pursue(e,spec.reaction,spec.idle):pilot(h,e,{reaction:spec.reaction,device:'joystick',strategy:spec.idle?'idle':'reactive'}).input;
 let minHp=e.player.hp,damage=0,seconds=0,modals=0,frames=0;
 for(;frames<240*spec.fps;frames++){
  if(e.status==='lost'||e.status==='crashing')break;
  if(spec.kind==='pursuit'&&e.pursuit?.state!=='chase'||spec.kind==='convoy'&&e.escort?.completed)break;
  if(closeModal(h,e)){if(++modals>20)throw Error('Modal did not close');continue;}
  assert.equal(e.status,'playing','Unexpected scenario state: '+e.status);
  const hp=e.player.hp;e.step(1/spec.fps,op());seconds+=1/spec.fps;damage+=Math.max(0,hp-e.player.hp);minHp=Math.min(minHp,e.player.hp);
  assert(e.player.pos.every(Number.isFinite)&&Number.isFinite(e.player.hp));
 }
 return {...spec,complete:spec.kind==='pursuit'?e.pursuit?.state!=='chase':!!e.escort?.completed,status:e.status,seconds:+seconds.toFixed(2),hp:+e.player.hp.toFixed(2),minHp:+minHp.toFixed(2),damage:+damage.toFixed(2),modals,
  ...(e.pursuit?{packets:clone(e.pursuit.packets),progress:e.pursuit.progress,gateHits:e.pursuit.gateCollisions,monsterHits:e.pursuit.warpContacts,enemiesSpawned:e.pursuit.enemiesSpawned}:{}),
  ...(e.escort?{survivors:e.escort.allies.filter(x=>!x.dead).length,allies:e.escort.allies.map(x=>+x.hp.toFixed(2)),repair:!!e.escort.ops240.midpointRepair2120,fieldHits:e.escort.ops240.stats.fieldsHit}:{}),
 };
}
async function contracts(candidate,baseline){
 const out=[],test=async(name,fn)=>{try{out.push({name,pass:true,...await fn()});}catch(e){out.push({name,pass:false,error:e.message});}};
 await test('resumed-pursuit-retains-packet-fractions',async()=>{
  const old=await lab(baseline),spec={kind:'pursuit',seed:417147,mode:'combat'},e=prepare(old,spec);
  const op=pursue(e,.6);for(let i=0;i<25*30;i++){closeModal(old,e);e.step(1/30,op());}
  assert.equal(e.status,'playing');const before=clone(e.pursuit),saved=old.pack(e),h=await lab(candidate);
  const next=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});h.arcade.engine=next;
  // Loading applies the explicitly requested easier balance, while retaining
  // each packet's earned fraction and the encounter position.
  assert.deepEqual(clone(next.player.pos),clone(e.player.pos));
  assert.equal(next.pursuit.clock,before.clock);
  closeModal(h,next);next.step(1/60,{fire:true});
  assert.equal(next.pursuit.requiredSeconds,90);const previous=[32,39,49],current=[26,30,34];
  for(let i=0;i<3;i++)assert(Math.abs(next.pursuit.packets[i]/current[i]-before.packets[i]/previous[i])<.002,'Packet fraction changed');
  const packed=h.pack(next),other=h.unpack(packed,{seed:e.seed,mode:'normal'},()=>{});
  assert.deepEqual(clone(other.pursuit),clone(next.pursuit));return {beforeSeconds:before.requiredSeconds,afterSeconds:90};
 });
 await test('older-2120-packet-duration-compatibility',async()=>{
  const cases=[];
  for(const mode of ['combat','training'])for(const branch of [false,true]){
   const old=await lab(baseline),e=prepare(old,{kind:'pursuit',seed:417147,mode});
   if(branch){e.campaign2120.branchActive=true;e.campaign2120.branchPackets=0;}
   const durations=branch?(mode==='training'?[20,24,28]:[22,26,32]):mode==='training'?[30,38,46]:[38,46,58];
   // Declared historical-format boundary fixture, not a played encounter.
   const snapshot=old.pack(e);snapshot.engine.pursuit.requiredSeconds=durations.reduce((n,x)=>n+x,0);
   snapshot.engine.pursuit.packets=[durations[0]*.4,0,0];snapshot.engine.pursuit.progress=40/3;
   const h=await lab(candidate),next=h.unpack(snapshot,{seed:e.seed,mode:mode==='training'?'calm':'normal'},()=>{});
   const now=branch?(mode==='training'?[13,15,18]:[16,18,20]):mode==='training'?[21,24,27]:[26,30,34];
   assert(Math.abs(next.pursuit.packets[0]/now[0]-.4)<1e-9);assert.equal(next.pursuit.requiredSeconds,now.reduce((n,x)=>n+x,0));
   assert.equal(next.player.hp,e.player.hp);cases.push({mode,branch,before:durations.reduce((n,x)=>n+x,0),after:next.pursuit.requiredSeconds});
  }return {cases};
 });
 for(const stage of [0,1,2])await test('convoy-'+(stage+1)+'-repair-once-across-save',async()=>{
  const h=await lab(candidate),e=prepare(h,{kind:'convoy',stage,seed:417147,mode:'combat'}),op=pilot(h,e,{reaction:.65,device:'joystick'});
  for(let i=0;i<100*30&&!e.escort.ops240.midpointRepair2120;i++){if(closeModal(h,e))continue;e.step(1/30,op.input());assert.equal(e.status,'playing');}
  assert(e.escort.ops240.midpointRepair2120);const saved=h.pack(e),next=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});h.arcade.engine=next;
  const hp=next.player.hp;for(let i=0;i<30;i++){if(closeModal(h,next))continue;next.step(1/30,{fire:true});}
  assert.equal(next.escort.ops240.events.filter(x=>x.kind==='midpoint-repair').length,1);
  assert(next.player.hp<=hp,'Repeated repair was granted after load');return {hpAtRepair:hp};
 });
 await test('legacy-rules-unchanged',async()=>{
  const old=await lab(baseline),fresh=await lab(candidate),s={kind:'pursuit',seed:417147,mode:'combat'},a=prepare(old,s,false),b=prepare(fresh,s,false);
  assert.equal(a.pursuit.requiredSeconds,b.pursuit.requiredSeconds);
  const oa=pursue(a,.6),ob=pursue(b,.6);
  for(let i=0;i<35*30;i++){a.step(1/30,oa());b.step(1/30,ob());}
  for(const key of ['player','enemies','hostile'])assert.deepEqual(clone(a[key]),clone(b[key]),'Legacy '+key+' changed');
  return{seconds:35};
 });
 return out;
}
async function main(){
 const candidate=readEntry('index.html'),baseline=gitEntry(BASELINE),candidateOnly=process.argv.includes('--candidate-only'),specs=[];
 for(const [seed,reaction,fps] of [[417147,.6,60],[819337,.75,30]]){
  specs.push({kind:'pursuit',mode:'combat',seed,reaction,fps});
  for(const stage of [0,1,2])specs.push({kind:'convoy',stage,mode:'combat',seed,reaction,fps});
 }
 for(const kind of ['pursuit','convoy'])specs.push({kind,stage:2,mode:'training',seed:417147,reaction:.75,fps:30});
 const rows=[];
 for(const spec of specs){const row={candidate:await run(candidate,spec)};if(!candidateOnly)row.baseline=await run(baseline,spec);rows.push(row);console.log(JSON.stringify(row));}
 const checks=await contracts(candidate,baseline),activePassed=rows.filter(x=>x.candidate.complete).length;
 const result={pass:activePassed===rows.length&&checks.every(x=>x.pass),method:'Direct encounter fixtures with real controls at 30/60 Hz; decisions held for .60/.75 seconds; exact-state operators, not humans or physical phones.',baseline:BASELINE,sourceSHA256:Object.fromEntries([...candidate.sources].filter(([file])=>/pursuit-v2.6.0|convoy-v2.6.0|convoy-monsters|campaign-v2.12.0/.test(file)).map(([file,code])=>[file,crypto.createHash('sha256').update(code).digest('hex')])),activePassed,activeTotal:rows.length,checks,rows};
 const dir=path.join(__dirname,'qa-2.14.0');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'mobile2140-balance.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({pass:result.pass,activePassed,activeTotal:rows.length,checks}));if(!result.pass)process.exitCode=1;
}
module.exports={prepare,pursue,run,contracts};if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
