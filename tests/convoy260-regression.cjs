/* Convoy 2.6 regression and bounded-input playthroughs.
 * Node VM using the real production engine. Synthetic entry fixtures only;
 * after launch all actions pass through arcadeInput/arcadeAction. No health,
 * score, enemy, position or completion writes are used by the playing pilot.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {pilot}=require('./helpers/convoy260-inputs.js');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(__dirname,'qa-2.6.0'),RULE='assets/citadel-convoy-v2.6.0.js';
const copy=x=>JSON.parse(JSON.stringify(x)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function entryFor(version='2.6.0'){
 const entry=entrySnapshot(),source='assets/citadel-convoy-v'+version+'.js';
 // Exercise exactly the integration order used by the release: the preserved
 // 2.3 path, then the selected rules, then the presentation module.
 entry.scripts=entry.scripts.filter(f=>!/^assets\/citadel-convoy-v2\.(4|6)\.0\.js$/.test(f));
 const at=entry.scripts.findIndex(f=>f==='assets/citadel-convoy-view-v2.3.0.js');
 if(version!=='2.3.0')entry.scripts.splice(at+1,0,source);entry.sources.set(source,fs.readFileSync(path.join(ROOT,source),'utf8'));
 if(version==='2.6.0'){const view='assets/citadel-convoy-view-v2.6.0.js';if(!entry.scripts.includes(view)){const v=entry.scripts.findIndex(f=>f==='assets/citadel-convoy-view-v2.4.0.js');entry.scripts.splice(v+1,0,view);entry.sources.set(view,fs.readFileSync(path.join(ROOT,view),'utf8'));}}
 if(version!=='2.6.0')entry.scripts=entry.scripts.filter(f=>f!=='assets/citadel-convoy-view-v2.6.0.js');
 return entry;
}
const candidateEntry=entryFor();
async function harness(entry=candidateEntry){const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');h.mobile.autoFire=false;return h;}
function fixture(h,{stage=0,assist=false,seed=417147,build='weapons'}={}){
 const e=new h.Engine(seed);h.arcade.engine=e;e.assist=assist;e.beginStage(stage);
 // Legal earned loadouts at the three convoy entries. Initialization only.
 e.upgrades=typeof build==='object'?{...build}:build==='armor'?{weapons:0,armor:stage+1,rockets:0}:{weapons:stage+1,armor:0,rockets:0};
 e.status='stageclear';e.upgradeChoice=build;e.beginEscort();h.action('citadel-launch');assert.equal(e.status,'playing');return e;
}
function state(e){return copy({escort:e.escort,player:e.player,enemies:e.enemies,bullets:e.bullets,hostile:e.hostile,status:e.status,score:e.score,entityId:e.entityId,elapsed:e.elapsed});}
async function run(opts={},shared=null){const h=shared||await harness(),e=fixture(h,opts),op=pilot(h,e,opts),hz=opts.hz||60;let updates=0,maxZ=-Infinity,maxDelta=0,maxBullets=0,maxHostile=0;const defeated={};
 while(e.status==='playing'&&updates<180*hz){const living=e.enemies.slice(),prior=new Map(living.map(x=>[x.id,x.pos.slice()]));e.step(1/hz,op.input());updates++;for(const x of living)if(x.dead)defeated[x.role]=(defeated[x.role]||0)+1;
  for(const x of e.enemies){assert(x.pos.every(Number.isFinite));if(!x.torpedo){maxZ=Math.max(maxZ,x.pos[2]-e.player.pos[2]);if(prior.has(x.id))maxDelta=Math.max(maxDelta,distance(x.pos,prior.get(x.id)));}}
  maxBullets=Math.max(maxBullets,e.bullets.length);maxHostile=Math.max(maxHostile,e.hostile.length);
 }
 return {...opts,status:e.status,seconds:+e.escort.time.toFixed(3),playerHP:e.player.hp,allies:e.escort.allies.map(a=>({hp:a.hp,dead:a.dead})),kills:e.escort.kills,defeated,updates,maxZ,maxDelta,maxBullets,maxHostile,controls:op.stats(),inspection:copy(h.c.CITADEL_CONVOY.inspection(e)),lossReason:e.lossReason||null};
}
async function contracts(){const checks=[];async function check(name,fn){checks.push({name,pass:true,...await fn()});console.log('PASS '+name);}
 await check('Normal begins firing on the arrival frame; calm retains a visible preparation interval',async()=>{const results=[];for(const assist of [false,true]){const h=await harness(),e=fixture(h,{assist});let spawnAt,shotAt;while(e.escort.time<10&&shotAt===undefined){e.step(1/60,{});if(e.enemies.length&&spawnAt===undefined)spawnAt=e.escort.time;if(e.hostile.length)shotAt=e.escort.time;}const delay=shotAt-spawnAt;if(assist)assert(delay>=3.5);else assert(delay<=1/60);assert.equal(e.escort.ops240.events.some(x=>x.kind==='mark'),assist);results.push({assist,delay});}return{results};});
 await check('Circular collision rejects old square corners and accepts the centre; apertures narrow across missions',async()=>{const radii=[];for(let stage=0;stage<3;stage++){
  const h=await harness(),e=fixture(h,{stage,assist:true}),radius=h.c.CITADEL_CONVOY.mission(e).fields[0].radius+2.3,edge=radius-2.8;radii.push(radius);
  for(let i=0;i<181;i++)e.step(1/60,{});
  // Isolated collision fixtures, explicitly separate from the ordinary-input
  // completion matrix: inject a field about to cross the unchanged player.
  e.escort.ops240.fields=[{id:1,shape:'ring',radius,halfW:radius,halfH:radius,gapX:-edge*.8,gapY:-edge*.8,z:-.1,speed:38,passed:false}];const hp=e.player.hp;e.step(1/60,{});
  assert.equal(e.escort.ops240.stats.fieldsHit,1);assert(e.player.hp<hp,'A diagonal square corner is outside the circular aperture');
  const centre=fixture(h,{stage,assist:true});for(let i=0;i<181;i++)centre.step(1/60,{});centre.escort.ops240.fields=[{id:1,shape:'ring',radius,halfW:radius,halfH:radius,gapX:0,gapY:0,z:-.1,speed:38,passed:false}];centre.step(1/60,{});assert.equal(centre.escort.ops240.stats.fieldsPassed,1);assert.equal(centre.escort.ops240.stats.fieldsHit,0);
 }assert(radii[0]>radii[1]&&radii[1]>radii[2]);return{calmRadii:radii};});
 await check('Pause freezes field crossing, projectiles and group clocks',async()=>{const h=await harness(),e=fixture(h,{stage:1}),op=pilot(h,e);for(let i=0;i<13*60&&e.status==='playing';i++)e.step(1/60,op.input());assert.equal(e.status,'playing');h.action('arcade-pause');const before=state(e);for(let i=0;i<600;i++)e.step(1/60,{fire:true,turn:1,pitch:1,pulse:true});assert.deepEqual(state(e),before);h.action('arcade-resume');e.step(1/60,{});assert(e.escort.time>before.escort.time);return{};});
 await check('In-flight save roundtrip preserves exact deterministic continuation',async()=>{const h=await harness(),e=fixture(h,{stage:1,assist:true}),op=pilot(h,e);for(let i=0;i<13*60;i++)e.step(1/60,op.input());const h2=await harness(),other=h2.unpack(h.pack(e),{seed:e.seed,mode:'calm'},()=>{});h2.arcade.engine=other;assert.deepEqual(state(other),state(e));const action=h.action;h.action=(...args)=>{h2.action(...args);return action(...args);};for(let i=0;i<30*60&&e.status==='playing';i++){const input=op.input();e.step(1/60,input);other.step(1/60,copy(input));}assert.deepEqual(state(other),state(e));return{seconds:e.escort.time};});
 await check('2.4 checkpoint migration preserves HP, distance and existing rectangular aperture',async()=>{const beforeH=await harness(entryFor('2.4.0')),saved=fixture(beforeH,{stage:1,assist:true});for(let i=0;i<12*60;i++)saved.step(1/60,{fire:true});const h=await harness(),e=h.unpack(beforeH.pack(saved),{seed:saved.seed,mode:'calm'},()=>{});h.arcade.engine=e;const before=state(e);e.step(1/60,{});assert.equal(e.escort.ops240.version,'2.6.0');assert.equal(e.escort.ops240.migratedFrom,'2.4.0');assert.equal(e.player.hp,before.player.hp);assert.deepEqual(copy(e.escort.allies.map(a=>a.hp)),before.escort.allies.map(a=>a.hp));assert(e.escort.distance>=before.escort.distance);assert.equal(e.escort.ops240.next,before.escort.ops240.next);const f=e.escort.ops240.fields[0];assert.equal(f.shape,'legacy-rectangle');assert.equal(f.halfW,before.escort.ops240.fields[0].halfW);assert.equal(f.halfH,before.escort.ops240.fields[0].halfH);for(const x of e.enemies){const old=before.enemies.find(n=>n.id===x.id);if(old&&!x.torpedo)assert(distance(x.pos,old.pos)<1);}const versions=e.escort.ops240.events.filter(x=>x.kind==='rules-migrated');assert.equal(versions.length,1);e.step(1/60,{});assert.equal(e.escort.ops240.events.filter(x=>x.kind==='rules-migrated').length,1);return{distanceBefore:before.escort.distance,distanceAfter:e.escort.distance,shape:f.shape};});
 await check('Older 2.3 in-flight convoy keeps its versioned rules and deterministic continuation',async()=>{const a=await harness(entryFor('2.3.0')),e=fixture(a,{stage:1,assist:true});for(let i=0;i<7*60;i++)e.step(1/60,{fire:true});const b=await harness(),other=b.unpack(a.pack(e),{seed:e.seed,mode:'calm'},()=>{});b.arcade.engine=other;assert(!b.c.CITADEL_CONVOY.active(other));assert(b.c.CITADEL_CONVOY.legacyActive(other));for(let i=0;i<1200;i++){e.step(1/60,{fire:true});other.step(1/60,{fire:true});}assert.deepEqual(state(other),state(e));return{version:other.escort.ops230.version,seconds:other.escort.time};});
 await check('Repeated module attachment leaves functions/listeners/emitter ownership unchanged',async()=>{const entry=entryFor(),h=await harness(entry),e=fixture(h),step=h.Engine.prototype.stepEscort,emit=e.emit,count=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),baseline=count();for(let i=0;i<20;i++)vm.runInContext(entry.sources.get(RULE),h.c,{filename:RULE});assert.equal(h.Engine.prototype.stepEscort,step);assert.equal(e.emit,emit);assert.equal(count(),baseline);return{listeners:baseline};});
 await check('Browser helper captures native input before a browser driver wraps it',async()=>{const h=await harness(),e=fixture(h);vm.runInContext(fs.readFileSync(path.join(ROOT,'tests/helpers/convoy260-inputs.js'),'utf8'),h.c,{filename:'tests/helpers/convoy260-inputs.js'});h.run('arcadeInput=function(){throw new Error("QA driver recursion")};');for(let i=0;i<360;i++){const input=h.c.CITADEL_CONVOY_INPUT({action:h.action},e);assert(Number.isFinite(input.turn||0)&&Number.isFinite(input.pitch||0));e.step(1/60,input);}assert(e.shots>0);assert.equal(e.status,'playing');return{seconds:e.escort.time,shots:e.shots};});
 return checks;
}
async function main(){fs.mkdirSync(OUT,{recursive:true});const started=performance.now(),quick=process.argv.includes('--quick'),checks=quick?[]:await contracts(),runs=[];
 const matrix=quick?[30,60].flatMap(hz=>[0,1,2].flatMap(stage=>[false,true].map(assist=>({stage,assist,hz,device:'joystick',reaction:.4})))):[30,60].flatMap(hz=>[0,1,2].flatMap(stage=>[false,true].flatMap(assist=>['keyboard','joystick'].map(device=>({stage,assist,hz,device,reaction:device==='keyboard'?.4:.45})))));
 if(!quick)for(const build of ['weapons','armor',{weapons:2,armor:1,rockets:0}])for(const hz of [30,60])for(const device of ['keyboard','joystick'])matrix.push({stage:2,assist:false,hz,device,reaction:.25,build,profile:'skilled-build'});
 for(const options of matrix){const r=await run(options);runs.push(r);console.log(JSON.stringify({...r,inspection:{stats:r.inspection.stats}}));}
 if(!quick)for(let stage=0;stage<3;stage++)for(const strategy of ['idle','fire','fire-pulse']){const r=await run({stage,assist:false,hz:60,strategy});runs.push(r);console.log(JSON.stringify({stage,strategy,status:r.status,seconds:r.seconds}));}
 const stress=[];let growth=null;const h=quick?null:await harness();if(h){const count=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),baseline=count();for(let i=0;i<18;i++){const r=await run({stage:i%3,assist:i%2===0,hz:60,device:'joystick',reaction:.35},h);if(global.gc)global.gc();const row={run:i+1,status:r.status,seconds:r.seconds,updates:r.updates,events:r.inspection.events.length,enemies:r.inspection.stats.peakEnemies,hostiles:r.maxHostile,bullets:r.maxBullets,heapBytes:process.memoryUsage().heapUsed,listeners:count()};assert.equal(count(),baseline);assert(row.events<=64&&row.enemies<=18&&row.hostiles<=64);stress.push(row);}growth=stress.at(-1).heapBytes-stress[5].heapBytes;}
 const report={generatedAt:new Date().toISOString(),entryScripts:candidateEntry.scripts,sourceSHA256:crypto.createHash('sha256').update(candidateEntry.sources.get(RULE)).digest('hex'),method:'Node VM with production entry/engine and native arcadeInput/arcadeAction. Mission entry/loadout fixtures only. Runtime play uses observable current targets, visible fields, keyboard/joystick movement, one Tab per decision, ordinary firing/missile/pulse. No HP, position, enemy removal or victory overrides; not a browser/device test.',wallSeconds:(performance.now()-started)/1000,checks,runs,stress,heapGrowthAfterWarmup:growth,garbageCollectionAvailable:!!global.gc};
 fs.writeFileSync(path.join(OUT,'convoy-rules.json'),JSON.stringify(report,null,2)+'\n');
 const reactive=runs.filter(x=>!x.strategy),passed=reactive.filter(x=>x.status==='escortclear');
 assert(reactive.filter(x=>x.assist||x.stage<2||x.profile==='skilled-build').every(x=>x.status==='escortclear'),'A required completion path failed; inspect the honest run report');
 for(const stage of [0,1,2])for(const assist of [false,true])for(const hz of [30,60])for(const device of (quick?['joystick']:['keyboard','joystick']))assert(passed.some(x=>x.stage===stage&&x.assist===assist&&x.hz===hz&&x.device===device),'A control/frame-rate combination has no demonstrated path');
 assert(reactive.every(x=>x.inspection.stats.fieldsHit===0),'The circular-field operator failed to stay inside the aperture');assert(reactive.every(x=>x.maxZ<-40&&x.maxDelta<1.4),'An enemy left the forward battle area or teleported');
 assert(runs.filter(x=>x.strategy).every(x=>['lost','crashing'].includes(x.status)),'Stationary firing should not complete a convoy');
 if(growth!==null&&global.gc)assert(growth<12*1024*1024,'Post-warmup heap trend exceeded 12 MB');assert(stress.every(x=>x.status==='escortclear'),'A repeated playthrough failed');

 report.pass=true;report.summary={deliberateRuns:reactive.length,completions:passed.length,stationaryControls:runs.filter(x=>x.strategy).length,stressMissions:stress.length,stressSeconds:stress.reduce((n,x)=>n+x.seconds,0)};fs.writeFileSync(path.join(OUT,'convoy-rules.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PASS convoy260: '+reactive.length+' deliberate playthroughs, '+checks.length+' contracts, '+stress.length+' stress missions');return report;
}
module.exports={entryFor,harness,fixture,pilot,run,contracts};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
