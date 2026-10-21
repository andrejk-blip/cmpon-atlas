#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {pursuitInput}=require('./helpers/campaign-inputs.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.6.0');
const clone=x=>JSON.parse(JSON.stringify(x)),immediate=()=>new Promise(r=>setImmediate(r));
function candidate(version='2.6.0'){
 const entry=entrySnapshot(),file=`assets/citadel-pursuit-v${version}.js`;
 entry.scripts=entry.scripts.map(x=>/^assets\/citadel-pursuit-v[\d.]+\.js$/.test(x)?file:x);
 entry.sources.set(file,fs.readFileSync(path.join(root,file),'utf8'));
 return entry;
}
async function setup(assist=false,seed=417147,version='2.6.0'){
 const h=entryHarness(candidate(version));await immediate();h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false;');
 const e=new h.Engine(seed);e.assist=assist;e.beginStage(1);h.arcade.engine=e;h.action('citadel-launch');return{h,e};
}
function control(h,e,{type='analog',fire=true}={}){
 const c=pursuitInput(h,e);c.fire=fire;
 if(type==='keyboard'){c.turn=Math.abs(c.turn)<.12?0:Math.sign(c.turn);c.pitch=Math.abs(c.pitch)<.12?0:Math.sign(c.pitch);}
 // A normal missile input against heavy/jamming ships; never alter health or mission state.
 const target=e.status==='playing'&&e.phase==='pursuit'?e.target():null;
 c.missile=fire&&!!target&&target.role==='jammer'&&e.player.missiles>0;
 if(type==='touch'){h.arcade.keys.clear();h.arcade.joystick={x:c.turn||0,y:-(c.pitch||0)};h.arcade.firePointer=c.fire?1:null;const input=h.input();input.missile=c.missile;return input;}
 return c;
}
async function play(assist=false,seed=417147,options={}){
 const {h,e}=await setup(assist,seed),dt=options.type==='touch'?1/30:1/60,peaks={enemies:0,hostile:0,bullets:0,rocks:0,gates:0,warp:0,segments:0},samples=[],history=[];
 let minForward=Infinity,maxJammerRange=0,jammerSamples=0,chapter=-1,frames=0,telegraphs=0,initialEmit=e.emit,changedEmit=0;const began=Date.now();
 for(;frames<(options.limit||600)/dt&&e.status!=='boarding';frames++){
  if(['lost','crashing'].includes(e.status))break;
  e.step(dt,control(h,e,options));
  if(e.pursuit.chapter!==chapter){chapter=e.pursuit.chapter;history.push({stage:chapter+1,time:e.pursuit.clock,hp:e.player.hp});}
  if(frames<3)initialEmit=e.emit;else if(e.emit!==initialEmit)changedEmit++;
  for(const x of e.enemies.filter(x=>x.pursuitEnemy&&!x.dead)){minForward=Math.min(minForward,e.player.pos[2]-x.pos[2]);assert(x.pos[2]<=e.player.pos[2]-47.99,'enemy must remain ahead');if(x.telegraph>0)telegraphs++;if(x.role==='jammer'&&x.age<=19){maxJammerRange=Math.max(maxJammerRange,Math.hypot(...x.pos.map((v,i)=>v-e.player.pos[i])));jammerSamples++;}}
  if(!assist)assert(e.enemies.every(x=>!x.pursuitEnemy||x.telegraph===0),'combat must have no advance telegraph');
  for(const [key,array] of Object.entries({enemies:e.enemies,hostile:e.hostile,bullets:e.bullets,rocks:e.asteroids,gates:e.pursuit.gates,warp:e.pursuit.warpEntities}))peaks[key]=Math.max(peaks[key],array.length);
  for(const w of e.pursuit.warpEntities){peaks.segments=Math.max(peaks.segments,w.segments.length);assert(w.segments.every(p=>p.pos.every(Number.isFinite)));assert(!e.enemies.includes(w));}
  assert(e.player.pos.every(Number.isFinite));assert(e.pursuit.progress>=0&&e.pursuit.progress<=100);
  if(frames%1800===0){if(global.gc)global.gc();samples.push({seconds:e.pursuit.clock,heap:process.memoryUsage().heapUsed,listeners:[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),changedEmit});}
 }
 return{pass:e.status==='boarding',mode:assist?'calm':'combat',seed,type:options.type||'analog',fire:options.fire!==false,status:e.status,hp:e.player.hp,frames,wallSeconds:(Date.now()-began)/1000,inspection:h.c.CITADEL_PURSUIT.inspection(e),history,peaks,minForward,maxJammerRange,jammerSamples,telegraphs,changedEmit,samples};
}
async function challengeContract(){
 const results=[];
 for(const kind of ['stationary-fire','navigation-no-fire']){
  const {h,e}=await setup(false,417147);
  for(let i=0;i<300*60&&e.status==='playing';i++)e.step(1/60,kind==='stationary-fire'?{fire:true}:control(h,e,{fire:false}));
  assert(['lost','crashing'].includes(e.status),'combat needs both navigation and weapon use');
  results.push({kind,status:e.status,clock:e.pursuit.clock,hp:e.player.hp,progress:e.pursuit.progress,gates:clone(e.pursuit.stageGates),kills:e.pursuit.kills});
 }
 return results;
}
async function jammerContract(){
 const {h,e}=await setup(true),api=h.c.CITADEL_PURSUIT;let oldest=0,maxRange=0,minForward=Infinity,tracked=0;
 for(let i=0;i<100*60&&e.status==='playing';i++){
  e.step(1/60,control(h,e,{fire:false}));
  for(const x of e.enemies.filter(x=>x.role==='jammer'&&!x.dead&&x.age<19)){
   oldest=Math.max(oldest,x.age);maxRange=Math.max(maxRange,Math.hypot(...x.pos.map((n,j)=>n-e.player.pos[j])));minForward=Math.min(minForward,e.player.pos[2]-x.pos[2]);tracked++;
  }
  if(oldest>12)break;
 }
 assert(oldest>12,'observe a live purple jammer for more than twelve seconds');assert(minForward>=48);assert(maxRange<230,'purple jammer remains in weapon range');
 const before=e.pursuit.jammersDestroyed;
 for(let i=0;i<8*60&&e.status==='playing'&&e.pursuit.jammersDestroyed===before;i++)e.step(1/60,control(h,e));
 assert(e.pursuit.jammersDestroyed>before,'ordinary gun/missile input must destroy a purple jammer');
 return{trackedFrames:tracked,oldestSeconds:oldest,maxRange,minForward,jammersDestroyed:e.pursuit.jammersDestroyed-before,hp:e.player.hp};
}
async function contracts(){
 const {h,e}=await setup(),api=h.c.CITADEL_PURSUIT;
 for(let i=0;i<760;i++)e.step(1/60,control(h,e));
 assert.equal(e.pursuit.enemiesSpawned,6,'first formation is triple the old two ships');
 assert(e.pursuit.shotsOpened>=6,'all combat ships immediately fire');
 assert(e.pursuit.maneuvers>0);assert(e.pursuit.lastTaunt);assert.equal(e.pursuit.version,'2.6.0');
 const g=e.pursuit.gates[0],o=api.gateOpening(e,g),z=g.pos[2];
 assert.equal(o.shape,'circle');assert.equal(o.radius,16);
 assert.equal(api.gateHit(e,[o.x,o.y,z+20],[o.x,o.y,z-20],2.2),null,'center aperture is clear');
 assert(api.gateHit(e,[o.x+o.radius,o.y,z+20],[o.x+o.radius,o.y,z-20],2.2),'physical ring must block');
 assert(api.gateHit(e,[o.x+o.radius*.73,o.y+o.radius*.73,z+20],[o.x+o.radius*.73,o.y+o.radius*.73,z-20],.2),'diagonal square corner is outside circular opening');
 assert.equal(api.gateHit(e,[o.x+40,o.y,z+20],[o.x+40,o.y,z-20],2.2),null,'no invisible wall outside the ring');
 const saved=h.pack(e),restored=h.unpack(saved,{seed:e.seed,mode:e.assist?'calm':'normal'},()=>{});assert.equal(restored.pursuit.version,'2.6.0');
 assert.deepEqual(clone(restored.pursuit.packets),clone(e.pursuit.packets));assert.equal(restored.pursuit.travel,e.pursuit.travel);
 assert.deepEqual(clone(restored.pursuit.evasion),clone(e.pursuit.evasion));
 const before=clone(restored.pursuit);restored.pause();restored.step(1/60,{fire:true});assert.deepEqual(clone(restored.pursuit),before,'pause does not change pursuit');restored.resume();
 // Unkillable entities are obstacle geometry, never candidates for targeting/hit().
 for(let i=0;i<600&&e.status==='playing';i++)e.step(1/60,control(h,e));
 const w=e.pursuit.warpEntities[0];assert(w,'warp apparition generated');assert(w.segments.length<=7);
 assert(api.warpHit(e,[w.pos[0],w.pos[1],w.pos[2]+30],[w.pos[0],w.pos[1],w.pos[2]-30],.4));
 assert(!e.enemies.some(x=>x.id===w.id));assert.equal(w.hp,undefined);
 // Legacy progress comes from an actual old-rule flight and is migrated in place.
 const old=await setup(false,417147,'2.1.0');for(let i=0;i<1100;i++)old.e.step(1/60,{...pursuitInput(old.h,old.e),fire:true});
 const original=clone(old.e.pursuit),oldSaved=old.h.pack(old.e),migrated=h.unpack(oldSaved,{seed:old.e.seed,mode:'normal'},()=>{});
 assert.equal(migrated.pursuit.version,'2.6.0');assert.deepEqual(clone(migrated.pursuit.packets),original.packets);
 assert.deepEqual(clone(migrated.pursuit.stageGates),original.stageGates);assert.equal(migrated.pursuit.travel,original.travel);assert.equal(migrated.pursuit.clock,original.clock);
 assert.deepEqual(clone(migrated.pursuit.gates),original.gates,'nearby old gate geometry is retained');
 const methods=['step','hit','target','beginStage'].map(k=>h.Engine.prototype[k]),listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0);
 h.run(candidate().sources.get('assets/citadel-pursuit-v2.6.0.js'));
 assert(methods.every((fn,i)=>h.Engine.prototype[['step','hit','target','beginStage'][i]]===fn),'duplicate module load is idempotent');
 assert.equal([...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),listeners);
 return {passed:true,firstWave:6,immediateShots:e.pursuit.shotsOpened,circularAperture:true,warpUnkillable:true,pause:true,saveRestore:true,legacyProgressPreserved:true,duplicateModuleSafe:true};
}
async function stress(rounds=10){
 const {h}=await setup(),samples=[],runs=[],counts=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),listeners=counts();
 let simulatedSeconds=0,frames=0;const started=Date.now();
 for(let round=0;round<rounds;round++){
  const e=new h.Engine([1,417147,620180][round%3]);e.assist=false;e.beginStage(1);h.arcade.engine=e;h.action('citadel-launch');
  for(let i=0;i<360*60&&e.status!=='boarding'&&!['lost','crashing'].includes(e.status);i++){
   e.step(1/60,control(h,e));frames++;
   assert(e.enemies.length<=12);assert(e.hostile.length<=64);assert(e.pursuit.warpEntities.length<=2);
   if(i%3600===0)await immediate();
  }
  assert.equal(e.status,'boarding','stress flight must complete with ordinary input');simulatedSeconds+=e.pursuit.clock;
  if(global.gc)global.gc();samples.push({round:round+1,heap:process.memoryUsage().heapUsed,listeners:counts()});
  assert.equal(counts(),listeners,'repeated starts cannot accumulate handlers');
  runs.push({seed:e.seed,seconds:e.pursuit.clock,hp:e.player.hp,kills:e.pursuit.kills});
 }
 const heaps=samples.slice(2).map(x=>x.heap),heapSpread=Math.max(...heaps)-Math.min(...heaps);
 assert(heapSpread<10*1024*1024,'retained heap must remain bounded after warmup');
 return{rounds,frames,simulatedSeconds,wallSeconds:(Date.now()-started)/1000,listeners,heapSpread,samples,runs,method:'One production VM harness; repeated legitimate fresh level-4 attempts, ordinary input and card answers, forced GC only for heap measurement. Accelerated simulation, not wall-clock browser soak.'};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const args=process.argv.slice(2),results=[];
 const checks=await contracts();checks.jammer=await jammerContract();checks.challenge=await challengeContract();console.log('contracts',JSON.stringify(checks));
 for(const assist of args.includes('--smoke')?[false]:[false,true])for(const seed of args.includes('--smoke')?[417147]:[1,417147,620180]){
  const r=await play(assist,seed);results.push(r);console.log(JSON.stringify({pass:r.pass,mode:r.mode,seed,hp:r.hp,status:r.status,seconds:r.inspection.clock,progress:r.inspection.progress,history:r.history,kills:r.inspection.kills,warp:r.inspection.warpContacts,gateHits:r.inspection.gateCollisions,peaks:r.peaks}));
 }
 if(!args.includes('--smoke'))for(const type of ['keyboard','touch']){const r=await play(false,417147,{type});results.push(r);console.log(JSON.stringify({type,pass:r.pass,hp:r.hp,status:r.status,progress:r.inspection.progress}));}
 const stressResult=args.includes('--stress')?await stress():null;
 const report={stress:stressResult,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/citadel-pursuit-v2.6.0.js'))).digest('hex'),method:'Node VM production module integration. Ordinary steering/fire/missile inputs and real lesson answers; no mid-run player/enemy health or victory edits. Isolated level 4 start fixture. Not a real browser or human playtest.',checks,results};
 fs.writeFileSync(path.join(out,'pursuit-rules.json'),JSON.stringify(report,null,2)+'\n');if(results.some(r=>!r.pass))process.exitCode=1;
}
module.exports={candidate,setup,control,play,contracts,jammerContract,challengeContract,stress};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
