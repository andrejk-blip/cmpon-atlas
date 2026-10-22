#!/usr/bin/env node
'use strict';
// Logic is exercised with ordinary public arcadeInput commands. Native frames
// are explicit art fixtures, not browser/device-FPS or human-play evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {boot,make,play}=require('./swarm270-regression.cjs');
const {realInput}=require('./swarm-regression.cjs');
const {createController}=require('./helpers/swarm270-inputs.js');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0'),clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=['assets/citadel-swarm-v2.7.0.js','assets/citadel-swarm-view-v2.7.0.js','tests/helpers/swarm270-inputs.js'];
function listeners(h){return [...h.handlers.values(),...h.windowHandlers.values()].reduce((n,x)=>n+x.length,0)+[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((a,b)=>a+b.length,0),0);}
function layout(h,w,he){h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});}
function nativeFrame(h,e,w,he,fx,name){
 layout(h,w,he);h.arcade.engine=e;h.arcade.fx=fx;const canvas=createCanvas(w,he),ctx=canvas.getContext('2d'),before=JSON.stringify(h.pack(e)),start=performance.now();
 h.c.CITADEL_SWARM_VIEW.draw(ctx,e,h.c.CITADEL_SWARM.cameraFor(w,he),w,he,{fx});
 const ms=performance.now()-start;assert.equal(JSON.stringify(h.pack(e)),before,'Renderer cannot mutate any serialized gameplay value');const png=canvas.toBuffer('image/png');
 if(name)fs.writeFileSync(path.join(out,name+'.png'),png);return{width:w,height:he,fx,ms:+ms.toFixed(3),sha256:hash(png),enemies:e.enemies.length,hostile:e.hostile.length};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});for(const family of ['Arial','system-ui','Segoe UI','sans-serif'])for(const style of ['','-Bold']){const f='/usr/share/fonts/truetype/dejavu/DejaVuSans'+style+'.ttf';if(fs.existsSync(f))GlobalFonts.registerFromPath(f,family);}
 const h=await boot(),api=h.c.CITADEL_SWARM,report={version:'2.7.0',method:'Node VM with exact production engine and ordinary arcadeInput; native Canvas screenshots and timing are not browser or device FPS. No HP, enemy-death, score, time or victory writes in any passage.',files:files.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))})),checks:[],legacy:[],runs:[],frames:[]};
 const check=(name,details={})=>report.checks.push({name,pass:true,...details});
 const p=play(h,{reaction:.2});assert(p.metrics.complete);assert.deepEqual(p.metrics.waves.map(x=>x.count),[8,16,32,64,64,64]);assert.equal(p.metrics.kills,248);assert.equal(p.metrics.lessons,2);assert.equal(p.metrics.packets,3);assert.equal(p.e.lessonQueue.length,0);assert.equal(p.metrics.cueFrames,0);assert.equal(p.e.status,'playing');
 assert.deepEqual(clone(p.e.decisions.map(x=>x.caseIndex)),[4,5]);assert.equal(new Set(p.e.rescued).size,p.e.rescued.length);
 check('Six real formations, 248 kills, three packets and exactly the two unchanged educational decisions',p.metrics);
 assert.deepEqual(Object.keys(p.metrics.patterns).sort(),['aimed','crown','fan','lead','pair','torpedo']);check('All six actual projectile behaviors appeared, rather than placeholder role names',{patterns:p.metrics.patterns});
 const restore=(saved,mode='normal')=>h.unpack(clone(saved),{seed:saved.seed||417147,mode},()=>{});
 for(let n=0;n<6;n++){
  const a=restore(p.checkpoints[n]);h.arcade.engine=a;
  for(let i=0;i<120;i++)a.step(1/60,realInput(h,a,{turn:i%80<40?.4:-.4}));
  const saved=h.pack(a),b=restore(saved);assert.deepEqual(clone(h.pack(b)),clone(saved),'Save roundtrip wave '+(n+1));
  const pilot=createController(api,{reaction:.2});
  for(let i=0;i<150;i++){const command=pilot(a);a.step(1/60,command);b.step(1/60,command);}
  assert.deepEqual(clone(h.pack(a)),clone(h.pack(b)),'Deterministic resumed movement wave '+(n+1));
  a.pause();const paused=JSON.stringify(h.pack(a));for(let i=0;i<300;i++)a.step(1/60,{turn:1,fire:true,missile:true,pulse:true,flip:true});assert.equal(JSON.stringify(h.pack(a)),paused);a.resume();assert.equal(a.status,'playing');
 }
 check('Every wave roundtrips and continues deterministically; pause blocks clocks, weapons and movement',{waves:6});
 for(const version of ['2.5.0','2.6.0'])for(const assist of [false,true]){
  const old=await boot(version),source=make(old,assist);for(let i=0;i<420;i++)source.step(1/60,{turn:i%120<60?.3:-.3,fire:true});
  const saved=old.pack(source),loaded=restore(saved,assist?'calm':'normal');assert.deepEqual(clone(h.pack(loaded)),clone(saved));assert.equal(loaded.swarm.rulesVersion,version);assert(!api.challenge(loaded));
  const pilot=createController(old.c.CITADEL_SWARM,{reaction:.2});for(let i=0;i<300;i++){const input=pilot(source);source.step(1/60,input);loaded.step(1/60,input);}assert.deepEqual(clone(h.pack(loaded)),clone(old.pack(source)));
  const continued=play(h,{snapshot:saved,assist,reaction:.2});assert(continued.metrics.complete,'Restored '+version+' reaches its genuine exit');
  assert.deepEqual(continued.metrics.waves.slice(1).map(x=>x.count),assist?[10,12,14,16,18]:[12,14,16,18,20]);
  report.legacy.push({version,mode:assist?'calm':'normal',savedWave:api.waveIndex(loaded)+1,enemyCount:loaded.enemies.length,unchanged:true,complete:true,wavesAfterSaved:continued.metrics.waves.slice(1).map(x=>x.count),packets:continued.metrics.packets,lessons:continued.metrics.lessons});
 }
 check('Live 2.5 and 2.6 saves retain original counts, clocks, RNG and all future rule selection',{cases:report.legacy.length});
 const count=listeners(h),refs=h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.fire,RequirementArcade.prototype.hit,drawFlightHUD,drawMobileGameHUD,cupUnpack]');
 for(const file of files.slice(0,2))vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c,{filename:file});h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.fire,RequirementArcade.prototype.hit,drawFlightHUD,drawMobileGameHUD,cupUnpack]').forEach((x,i)=>assert.equal(x,refs[i]));assert.equal(listeners(h),count);check('Reinstall is idempotent and does not add wrappers or event listeners',{listeners:count});
 // Start from an unmodified checkpoint earned in the passage, and let all 64
 // enter by advancing genuine simulation without firing. No actors are added.
 const art=restore(p.checkpoints[3]);h.arcade.engine=art;for(let i=0;i<132;i++)art.step(1/60,{});assert.equal(art.enemies.length,64);
 for(const [w,he] of [[1280,720],[390,720],[780,430],[640,360]])for(const fx of [true,false])report.frames.push(nativeFrame(h,art,w,he,fx,'swarm-64-'+w+'x'+he+(fx?'':'-fxoff')));
 const renderTimes=[],canvas=createCanvas(640,360),ctx=canvas.getContext('2d');layout(h,640,360);const before=JSON.stringify(h.pack(art));
 for(let i=0;i<240;i++){const t=performance.now();h.c.CITADEL_SWARM_VIEW.draw(ctx,art,api.cameraFor(640,360),640,360,{fx:!!(i%2)});renderTimes.push(performance.now()-t);}assert.equal(JSON.stringify(h.pack(art)),before);assert.equal(listeners(h),count);renderTimes.sort((a,b)=>a-b);
 report.renderStress={frames:240,canvas:'640x360',medianMs:renderTimes[120],p95Ms:renderTimes[228],maxMs:renderTimes.at(-1),stateReadOnly:true};check('Native mobile/desktop/Landscape/FX-off renders preserve state and draw all 64 physical ships');
 // A stable single harness plays repeated genuine sorties; dead/finished
 // runs are released. Memory uses explicit GC if invoked with --expose-gc.
 const stress=[],heap=[];let seconds=0;
 for(let i=0;i<14;i++){
  const run=play(h,{reaction:.2,seed:i%2?819337:417147,fps:i%2?30:60,touch:!!(i%2)});report.runs.push(run.metrics);seconds+=run.metrics.seconds;
  assert(run.metrics.peakEnemies<=64&&run.metrics.peakHostile<=80&&run.metrics.peakDivers<=6);assert.equal(listeners(h),count);
  assert(run.e.swarm.events.length<=24&&run.e.particles.length<=36&&run.e.explosions.length<=14);assert.equal(run.metrics.cueFrames,0);
  // An unlucky or imperfect automated pilot may lose; survival is evidence,
  // not a stability requirement. No retry is hidden from the resulting report.
  stress.push({run:i+1,seconds:run.metrics.seconds,complete:run.metrics.complete,kills:run.metrics.kills,hp:run.metrics.hp});
  h.arcade.engine=null;if(global.gc)global.gc();heap.push(process.memoryUsage().heapUsed);
 }
 assert(seconds>1800,'At least 30 simulated minutes');const warm=heap.slice(3);report.stress={runs:stress,simulationSeconds:seconds,simulationMinutes:seconds/60,listenersBefore:count,listenersAfter:listeners(h),heapSamples:heap,heapWarmSpreadMiB:(Math.max(...warm)-Math.min(...warm))/1048576,gc:!!global.gc,limits:{enemies:64,hostile:80,divers:6,events:24,particles:36,explosions:14}};
 check('At least 30 simulated minutes keep event listeners and all entity/history bounds stable');report.pass=true;
 fs.writeFileSync(path.join(out,'swarm-contracts.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,legacy:report.legacy,stress:report.stress,renderStress:report.renderStress},null,2));return report;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main};
