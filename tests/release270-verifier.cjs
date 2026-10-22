#!/usr/bin/env node
'use strict';
// Independent 2.7 regression. An explicit staging entry is mandatory until
// publication. Direct mission fixtures are not counted as campaign completion.
// The operators use actual movement, weapons, interactions and answer actions;
// no live HP, ammunition, enemy completion or victory fields are rewritten.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const {readEntry,lab,fixture,listenerState}=require('./release260-verifier.cjs');
const {play}=require('./helpers/campaign270-runner.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0');
const baseline260='fcdd77e2d1293e4c35693392829f7614484c8459';
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const state=(h,e)=>copy({engine:h.pack(e).engine,rng:h.pack(e).rng});
function release(entry){return JSON.parse(entry.html.match(/id="release-data">([^<]+)/)[1]);}
function gitEntry(ref){
 assert(ref,'Legacy comparison requires --baseline=<released 2.6 commit>.');
 const read=file=>cp.execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 const html=read('index.html'),scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
 const entry={html,scripts,sources:new Map(scripts.map(file=>[file,read(file)]))};
 assert.equal(release(entry).version,'2.6.0','The legacy baseline must actually contain the released 2.6 entry.');return entry;
}
function anchors(h,e){
 const s=state(h,e).engine,b=s.board;
 return copy({status:s.status,phase:s.phase,stage:s.stage,score:s.score,totalKills:s.totalKills,rescued:s.rescued,
  completedRemarks:s.completedRemarks,decisions:s.decisions,upgrades:s.upgrades,elapsed:s.elapsed,
  player:{pos:s.player.pos,hp:s.player.hp,missiles:s.player.missiles,energy:s.player.energy},
  board:b?{pos:b.pos,hp:b.hp,completed:b.completed,definition:b.definition,cells:b.cells,crates:b.crates,props:b.props,
   doors:b.doors,bounds:b.bounds,terminals:b.terminals,exit:b.exit,decks:b.decks,armory260:b.armory260,missions270:b.missions270,
   enemies:b.enemies.map(x=>({id:x.id,hp:x.hp,pos:x.pos,dead:x.dead,archetype:x.archetype,missions270:x.missions270}))}:null,
  enemies:s.enemies.map(x=>({id:x.id,hp:x.hp,pos:x.pos,dead:x.dead})),boss:s.boss?{hp:s.boss.hp,pos:s.boss.pos}:null});
}
function geometry(h,e){const b=anchors(h,e).board;return b&&copy({definition:b.definition,cells:b.cells,crates:b.crates,props:b.props,doors:b.doors,bounds:b.bounds,terminals:b.terminals,exit:b.exit,missions270:b.missions270});}
function legacyPickupController(h,e){
 const {createDeckController}=require('./helpers/campaign-inputs.js'),dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
 const control=createDeckController(h,{boost:true}),perceived=Object.create(e);
 perceived.board=new Proxy(e.board,{get(b,key){return key==='enemies'&&!e.assist?b.enemies.map(x=>({...x,decksAttack:null})):b[key];}});
 let route=[],goal=null;
 return()=>{
  const b=e.board,room=b.completed.length,enemies=b.enemies.filter(x=>!x.dead&&(x.duty?.room??x.zone)===room);
  const pickup=b.armory260.pickups.find(x=>!x.taken&&x.room<room)||(!enemies.length?b.armory260.pickups.find(x=>!x.taken&&x.room===room):null);
  if(!pickup)return control(perceived);
  if(goal!==pickup.id||!route.length){route=h.deckQA.path(b,b.pos,pickup.pos);goal=pickup.id;}
  while(route.length&&(dist(route[0],b.pos)<.12||dist(route[0],b.pos)<.6&&route.length>1&&h.deckQA.line(b,b.pos,route[1],.68,true)))route.shift();
  const next=route[0]||pickup.pos,d=Math.max(dist(next,b.pos),6.5/60),visible=b.enemies.filter(x=>!x.dead&&h.deckQA.line(b,b.pos,x.pos,.08)).sort((a,c)=>dist(a.pos,b.pos)-dist(c.pos,b.pos));
  return{moveX:(next[0]-b.pos[0])/d,moveZ:(next[2]-b.pos[2])/d,fire:true,aim:visible[0]?.pos,pulse:b.pulseCooldown<=0&&visible.some(x=>dist(x.pos,b.pos)<8)};
 };
}
async function contracts(entry,baseline){
 const h=await lab(entry),rows=[],failures=[];
 async function test(name,fn){try{rows.push({name,pass:true,...await fn()});}catch(err){failures.push({name,error:err.message});}}
 for(const assist of [false,true])for(let id=1;id<=14;id++)await test('pause-save-'+id+'-'+(assist?'calm':'normal'),()=>{
  const e=fixture(h,id,assist);for(let i=0;i<60;i++)e.step(1/60,{});e.pause();const before=state(h,e),saved=h.pack(e);
  for(let i=0;i<120;i++)e.step(1/60,{fire:true,missile:true,moveX:1,turn:1,pulse:true});assert.deepEqual(state(h,e),before,'Paused game state changed');
  const restored=h.unpack(saved,{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.deepEqual(state(h,restored),before,'Save state changed on load');
  e.resume();restored.resume();for(let i=0;i<120;i++){const input={fire:true,moveX:.2,turn:.2,pitch:0};h.arcade.engine=e;e.step(1/60,input);h.arcade.engine=restored;restored.step(1/60,input);}
  assert.deepEqual(state(h,restored),state(h,e),'Restored continuation diverged');return{level:id,mode:assist?'calm':'normal',continuedSeconds:2};
 });
 const oldEntry=gitEntry(baseline),old=await lab(oldEntry);
 for(const assist of [false,true])for(let id=1;id<=14;id++)await test('legacy-260-'+id+'-'+(assist?'calm':'normal'),()=>{
  const e=fixture(old,id,assist);for(let i=0;i<120;i++)e.step(1/60,{fire:true});const before=anchors(old,e),saved=old.pack(e);
  const restored=h.unpack(saved,{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.deepEqual(anchors(h,restored),before,'Legacy progress, resources, entities or geometry changed on load');
  h.arcade.engine=restored;for(let i=0;i<120;i++){const input={fire:true,turn:.1,moveX:.1};e.step(1/60,input);restored.step(1/60,input);}
  assert.deepEqual(geometry(h,restored),geometry(old,e),'An active old base was remapped after stepping');
  if(restored.board)assert(!h.c.CITADEL_BASE_MISSIONS.active(restored),'An active legacy board must not gain new hazards');
  if(id===7){
   const config=(q,x)=>({total:q.waveTotal(x),counts:Array.from({length:q.waveTotal(x)},(_,n)=>q.secondsNeeded(x,n))});
   assert.deepEqual(config(h.c.CITADEL_SWARM,restored),config(old.c.CITADEL_SWARM,e),'Future old-swarm waves acquired new population rules');
   assert.deepEqual(copy(restored.swarm),copy(e.swarm),'An active old swarm changed its saved wave configuration or cadence');
   assert.deepEqual(copy(restored.enemies),copy(e.enemies),'Old swarm actors changed after identical continuation inputs');
  }
  assert(restored.player.pos.every(Number.isFinite));assert(Number.isFinite(restored.board?.hp??restored.player.hp));
  return{level:id,mode:assist?'calm':'normal',from:'2.6.0',continuedSeconds:2};
 });
 for(const assist of [false,true])await test('legacy-earned-kit-and-cleared-room-'+(assist?'calm':'normal'),()=>{
  const e=fixture(old,2,assist),b=e.board,control=legacyPickupController(old,e);let frame=0;
  for(;frame<60*180;frame++){
   assert(!['lost','crashing'].includes(e.status),'Legacy pickup pilot lost before earning equipment');
   if(b.completed.length>0&&e.upgrades.baseKit260.collected.length>0)break;
   if(e.status==='remark'){const q=old.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)');old.action('citadel-answer',q.correct);old.action('citadel-remark-next');continue;}
   e.step(1/60,control());
  }
  assert(frame<60*180,'Legacy pickup pilot must earn a side-room item and answer a real card');
  const saved=old.pack(e),before=anchors(old,e),restored=h.unpack(saved,{seed:417147,mode:assist?'calm':'normal'},()=>{});
  assert.deepEqual(anchors(h,restored),before,'Earned equipment, cleared room or legacy layout changed on load');
  assert(!h.c.CITADEL_BASE_MISSIONS.active(restored));h.arcade.engine=restored;
  for(let i=0;i<120;i++){const input={fire:true,moveZ:.2};e.step(1/60,input);restored.step(1/60,input);}
  assert.deepEqual(geometry(h,restored),geometry(old,e),'Partial old mission remapped during continuation');
  assert.deepEqual(copy(restored.upgrades.baseKit260),copy(e.upgrades.baseKit260),'Earned equipment changed during continuation');
  return{mode:assist?'calm':'normal',ordinaryInputFrames:frame,completedRooms:b.completed.length,earnedItems:e.upgrades.baseKit260.collected.length,method:'Direct old-base entry fixture, then ordinary combat/movement/pickup/card actions before migration.'};
 });
 await test('idempotent-install',()=>{
  const modules=entry.scripts.filter(f=>/v2\.7\.0\.js$/.test(f)),before=listenerState(h),code='[RequirementArcade.prototype.step,RequirementArcade.prototype.stepBoard,RequirementArcade.prototype.spawnBoardWave,RequirementArcade.prototype.beginBoarding,RequirementArcade.prototype.beginLair,RequirementArcade.prototype.say,drawBoardHUD,spaceScene,arcadeInput,cupUnpack]',methods=h.run(code);
  for(let n=0;n<5;n++)for(const file of modules)h.run(entry.sources.get(file));
  h.run(code).forEach((fn,i)=>assert.equal(fn,methods[i],'Repeated installation changed wrapper identity'));assert.deepEqual(listenerState(h),before);return{modules,listeners:before};
 });
 return{pass:!failures.length,method:'Node VM. Direct 14-level fixtures per mode, pause/save/deterministic continuation and actual 2.6-source saves. Not campaign completion.',baseline,baselineEntrySHA256:sha(oldEntry.html),passed:rows.length,failed:failures.length,rows,failures};
}
async function campaign(entry,assist=false,fps=60,options={}){
 const {pilot}=require('./helpers/convoy260-inputs.js'),{createOrbitalController}=require('./helpers/orbital260-inputs.js');
 const helperFile=path.resolve(root,options.boardHelper||'tests/base270-regression.cjs');
 assert(fs.existsSync(helperFile),'New base input controller is not ready: '+helperFile);
 const {createController}=require(helperFile);assert.equal(typeof createController,'function','Base helper exports createController');
 const swarmHelperFile=path.resolve(root,options.swarmHelper||'tests/helpers/swarm270-inputs.js');
 assert(fs.existsSync(swarmHelperFile),'New swarm input controller is not ready: '+swarmHelperFile);
 const {createController:createSwarmController}=require(swarmHelperFile);assert.equal(typeof createSwarmController,'function','Swarm helper exports createController');
 const convoy=new WeakMap(),orbit=new WeakMap(),base=new WeakMap(),swarm=new WeakMap(),samples=[],changes=[],checkpoints=new Set(),baseMetrics=new Map();
 let next=0,initialListeners=null,emitter=null;
 const result=await play(assist,options.seed||417147,{entry,fps,sound:false,progress:options.progress,
  boardInput({h,e}){let op=base.get(e);if(!op){op=createController(h,{reaction:options.baseReaction||.2,mobile:!!options.mobile});base.set(e,op);}return op(e);},
  swarmInput({h,e}){let op=swarm.get(e);if(!op){op=createSwarmController(h.c.CITADEL_SWARM,{reaction:options.swarmReaction||.2,mobile:!!options.mobile});swarm.set(e,op);}return op(e);},
  flightInput({h,e,input}){
   if(!h.c.CITADEL_CONVOY.active(e)){if(e.assist)return input;let op=orbit.get(e);if(!op){op=createOrbitalController(h,{resupply:false});orbit.set(e,op);}return op(e);}
   let op=convoy.get(e.escort);if(!op){op=pilot(h,e,{reaction:options.convoyReaction||.35,device:'joystick'});convoy.set(e.escort,op);}return op.input();
  },observe({h,e,id,frame}){
   if([2,5,8,11,13].includes(id)&&e.board){
    if(!checkpoints.has(id)){checkpoints.add(id);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verifier-checkpoint-'+(assist?'calm':'normal')+'-'+id+'.json'),JSON.stringify({method:'Actual campaign reached save; ordinary inputs before checkpoint.',level:id,mode:assist?'calm':'normal',snapshot:h.pack(e)},null,2)+'\n');}
    let row=baseMetrics.get(id);if(!row){row={level:id,minimumHP:e.board.hp,peakHostile:0,kinds:[],missions:copy(h.c.CITADEL_BASE_MISSIONS.inspection(e))};baseMetrics.set(id,row);}
    row.minimumHP=Math.min(row.minimumHP,e.board.hp);row.peakHostile=Math.max(row.peakHostile,e.board.hostile?.length||0);
    for(const x of e.board.enemies){const kind=x.missions270?.kind||x.archetype;if(kind&&!row.kinds.includes(kind))row.kinds.push(kind);}
   }
   if(emitter&&emitter!==e.emit)changes.push({id,frame});emitter=e.emit;
   const missionEvents=e.board?.missions270?.events?.length||0,swarmEvents=e.swarm?.events?.length||0;
   assert(missionEvents<=48,'New base event log exceeded its bound');assert(swarmEvents<=24,'Swarm event log exceeded its bound');
   if(e.elapsed<next)return;next=e.elapsed+30;if(global.gc)global.gc();const listeners=listenerState(h);initialListeners??=listeners;
   const runtime=h.c.CITADEL_RUNTIME?.diagnostic();
   assert((runtime?.events?.length||0)<=64,'Runtime event log exceeded its bound');
   samples.push({level:id,seconds:+e.elapsed.toFixed(2),listeners,heap:process.memoryUsage().heapUsed,entities:(e.enemies?.length||0)+(e.board?.enemies?.length||0)+(e.hostile?.length||0)+(e.board?.hostile?.length||0)+(e.bullets?.length||0)+(e.board?.bullets?.length||0),missionEvents,swarmEvents,runtimeEvents:runtime?.events?.length||0,runtimeFaults:runtime?.faults?.length||0});
  }});
 result.baseOperator={file:path.relative(root,helperFile),sha256:sha(fs.readFileSync(helperFile)),reaction:options.baseReaction||.2,mobile:!!options.mobile};
 result.swarmOperator={file:path.relative(root,swarmHelperFile),sha256:sha(fs.readFileSync(swarmHelperFile)),reaction:options.swarmReaction||.2,mobile:!!options.mobile};
 result.convoyOperator={reaction:options.convoyReaction||.35,device:'joystick'};result.orbitalOperator='orbital260 with resupply:false';result.baseMetrics=[...baseMetrics.values()];
 result.stress={method:'Node VM logic, mocked DOM listener registrations, whole Node-process heap including reports; no browser/device FPS claim. Runtime RAF is tested separately; this operator directly advances ordinary engine steps.',forcedGC:!!global.gc,samples,listenersStable:samples.every(x=>JSON.stringify(x.listeners)===JSON.stringify(initialListeners)),emitterStable:!changes.length,emitterChanges:changes,eventLogBounds:{base:48,swarm:24,runtime:64}};return result;
}
async function main(){
 const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),entryFile=arg('entry');
 assert(entryFile,'Pass an explicit --entry=tests/entry-2.7.0.html; production is not an implicit test target.');
 const entry=readEntry(entryFile),kind=arg('kind')||'contracts';assert(entry.scripts.some(f=>/citadel-base-missions-v2\.7\.0\.js$/.test(f)),'New base missions are not integrated in this entry.');
 assert(entry.scripts.some(f=>/citadel-voice-v2\.7\.0\.js$/.test(f)),'New radio module is not integrated in this entry.');
 let result;if(kind==='contracts')result=await contracts(entry,arg('baseline')||baseline260);
 else if(kind==='campaign')result=await campaign(entry,process.argv.includes('--calm'),Number(arg('fps')||60),{seed:Number(arg('seed'))||417147,baseReaction:Number(arg('base-reaction'))||.2,swarmReaction:Number(arg('swarm-reaction'))||.2,convoyReaction:Number(arg('convoy-reaction'))||.35,boardHelper:arg('board-helper'),swarmHelper:arg('swarm-helper'),mobile:process.argv.includes('--mobile'),progress:process.argv.includes('--progress')});
 else throw Error('Unknown --kind '+kind);
 const tag=arg('tag')||kind+(kind==='campaign'?'-'+(process.argv.includes('--calm')?'calm':'normal')+'-'+Number(arg('fps')||60):'');assert(/^[a-z0-9-]+$/i.test(tag));
 Object.assign(result,{entryFile,entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))}))});
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'verifier-'+tag+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({report:file,pass:result.pass,passed:result.passed,failed:result.failed,failures:result.failures,error:result.error,mode:result.mode,levels:result.levels?.length,seconds:result.simulatedSeconds}));if(!result.pass)process.exitCode=1;
}
module.exports={gitEntry,anchors,geometry,contracts,campaign};if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
