#!/usr/bin/env node
'use strict';
// Unit fixtures and native Canvas renders are separate from the real-input
// campaign reports. This file never claims fixture setup is a playthrough.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {execFileSync}=require('node:child_process');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createDeckController}=require('./helpers/campaign-inputs.js');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const out=path.join(__dirname,'qa-2.0.0');fs.mkdirSync(out,{recursive:true});
const entry=entrySnapshot(),h=entryHarness(entry),rows=[];
h.c.performance={now:()=>performance.now()};
h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
const api=h.c.CITADEL_BASES,view=h.c.CITADEL_BASE_VIEW,walk=h.run('stationWalkable'),navPath=h.run('stationPath');
const clone=x=>JSON.parse(JSON.stringify(x));
function engine(t=0,calm=false){const e=new h.Engine(417147,()=>{});e.assist=calm;e.beginStage(Math.min(3,t));
 if(t===4){e.beginFinale();e.beginLair();}else e.beginBoarding();h.arcade.engine=e;return e;}
function test(name,fn){const start=performance.now();try{const data=fn();rows.push({name,pass:true,seconds:+((performance.now()-start)/1000).toFixed(3),data});}
 catch(error){rows.push({name,pass:false,error:error.stack});console.error(name,error.message);}}
function reachable(b,from,to){const nearest=h.run('stationNearestNode'),a=nearest(b,from),z=nearest(b,to);if(!a||!z)return false;
 const queue=[a.key],seen=new Set(queue);for(let i=0;i<queue.length;i++){const key=queue[i];if(key===z.key)return true;
  const n=b.nav.get(key);for(const link of n.links)if(!seen.has(link.key)&&h.deckQA.line(b,n.pos,b.nav.get(link.key).pos,.68,false)){
   seen.add(link.key);queue.push(link.key);}}
 return false;}
test('Five layouts: reachable terminals, exits and persistent crew posts',()=>{
 const layouts=[];for(let t=0;t<5;t++){const e=engine(t),b=e.board;
  for(const p of [...b.terminals,b.exit,...b.enemies.map(x=>x.pos)]){assert(walk(b,p,.65,true));assert(navPath(b,b.pos,p).length);}
  assert.equal(b.definition.rooms.length,3);assert.equal(b.baseOps.initialized,true);assert(b.enemies.every(x=>x.duty));
  layouts.push({tier:t,cells:b.cells.size,nodes:b.nav.size,crew:b.enemies.length,initialHealth:b.enemies.slice(0,8).map(x=>({role:x.archetype,hp:x.hp}))});}
 return layouts;});
test('Access gates block future sectors including maintenance bypasses',()=>{
 for(let t=0;t<5;t++)for(let room=0;room<2;room++){const e=engine(t),b=e.board;
  for(const d of b.doors)d.open=d.unlockAfter<=room?1:0;
  assert(reachable(b,b.definition.rooms[room].posts[0],b.terminals[room]),'Current sector remains accessible');
  assert(!reachable(b,b.definition.rooms[room].posts[0],b.terminals[room+1]),'Locked sector has no bypass: '+t+'/'+room);}
});
test('Patrols walk before detection; reserves are present and stay at their posts',()=>{
 const e=engine(2),b=e.board,initial=new Map(b.enemies.map(x=>[x.id,x.pos.slice()])),ids=b.enemies.map(x=>x.id);
 for(let i=0;i<240;i++)e.step(1/60,{});
 assert.deepEqual(b.enemies.map(x=>x.id),ids);assert(b.baseOps.patrolDistance>8);
 for(const x of b.enemies.filter(x=>x.duty.reserve))assert.deepEqual(x.pos,initial.get(x.id));
 assert.equal(b.baseOps.reserveDepartures,0);return{patrolMeters:b.baseOps.patrolDistance,crew:ids.length};
});
test('First sector: ordinary input, no surprise entities or teleport recovery',()=>{
 const e=engine(1),b=e.board,ids=new Set(b.enemies.map(x=>x.id)),control=createDeckController(h);let maxStep=0;
 for(let frame=0;frame<180*60&&e.status==='boarding';frame++){
  const before=new Map(b.enemies.map(x=>[x.id,x.pos.slice()]));e.step(1/60,control(e));
  for(const x of b.enemies){assert(ids.has(x.id));const old=before.get(x.id);if(old){const d=Math.hypot(x.pos[0]-old[0],x.pos[2]-old[2]);maxStep=Math.max(maxStep,d);assert(d<.65,'Physical movement remains bounded');}}
 }
 assert.equal(e.status,'remark');assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0);
 assert(b.baseOps.reserveDepartures>=2);assert.equal(b.decks.recovered,0);
 const future=b.enemies.map(x=>x.id);e.answer(h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)').correct);e.continueRemark();
 assert.deepEqual(b.enemies.map(x=>x.id),future,'Existing next-sector objects survive the card transition');
 return {maxStep,health:b.hp,reserveDepartures:b.baseOps.reserveDepartures,remainingCrew:b.enemies.length};
});
test('Pause, new save and restored animation/AI state are deterministic',()=>{
 const e=engine(2);for(let i=0;i<180;i++)e.step(1/60,{moveZ:-1});e.pause();const saved=clone(h.pack(e));
 for(let i=0;i<300;i++)e.step(1/60,{fire:true,moveX:1});
 // The existing radio cooldown may expire while paused; mission state cannot.
 assert.deepEqual(clone(h.pack(e).engine.board),saved.engine.board);assert.equal(e.elapsed,saved.engine.elapsed);assert.equal(e.status,'paused');
 const restored=h.unpack(saved,{seed:417147,mode:'normal'},()=>{});assert.deepEqual(clone(restored.board.baseOps),clone(e.board.baseOps));
 assert.deepEqual(clone(restored.board.enemies),clone(e.board.enemies));assert.deepEqual(clone(restored.board.baseMotion),clone(e.board.baseMotion));
 e.pause();restored.pause();for(let i=0;i<120;i++){e.step(1/60,{moveZ:-1});restored.step(1/60,{moveZ:-1});}
 assert.deepEqual(clone(restored.board.pos),clone(e.board.pos));assert.deepEqual(clone(restored.board.enemies),clone(e.board.enemies));
});
test('Published 1.9.3 saves retain geometry, health, crew and legacy rules',()=>{
 const html=execFileSync('git',['show','e25cd4e42eb175dd796d687fae3b26c9f39bf0d9:index.html'],{encoding:'utf8'});
 const scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
 const old=entryHarness({html,scripts,sources:new Map(scripts.map(f=>[f,fs.readFileSync(f,'utf8')]))});
 for(let t=0;t<5;t++){
  const e=new old.Engine(417147,()=>{});e.beginStage(Math.min(3,t));if(t===4){e.beginFinale();e.beginLair();}else e.beginBoarding();
  const before=clone(old.pack(e)),restored=h.unpack(before,{seed:417147,mode:'normal'},()=>{});
  assert(!api.modern(restored.board));assert.deepEqual(clone(restored.board.definition),clone(e.board.definition));
  assert.deepEqual(clone(restored.board.pos),clone(e.board.pos));assert.equal(restored.board.hp,e.board.hp);
  assert.deepEqual(clone(restored.board.enemies),clone(e.board.enemies));restored.step(1/60,{});
 }
});
test('Renders preserve simulation and show shared human rigs with Canvas depth',()=>{
 const e=engine(1),b=e.board;h.arcade.canvas={width:1280,height:800};
 // Staged close-up for art inspection only; not a mission completion test.
 b.pos=[-12,0,-4];b.camera=b.pos.slice();b.yaw=.35;b.baseMotion={gait:1.2,speed:4,bodyYaw:.35,moveYaw:.35};
 const saved=clone(h.pack(e)),canvas=createCanvas(1280,800),ctx=canvas.getContext('2d'),times=[];
 for(let i=0;i<8;i++){const start=performance.now();view.draw(ctx,h.scene(e,0),h.camera(e,0),1280,800);times.push(performance.now()-start);}
 fs.writeFileSync(path.join(out,'base-interior.png'),canvas.toBuffer('image/png'));assert.deepEqual(clone(h.pack(e)),saved);
 const camera=h.run('stationLook')([4,4.3,10],[0,1.8,0],.67,{near:.3,far:100});camera.basesView=true;
 const portrait=createCanvas(1000,800),items=[];view.actor(items,[-1.3,0,0],.15,{gait:1,speed:1,appearance:0},'player');
 view.actor(items,[1.3,0,0],-.15,{gait:3,speed:0,appearance:2},'scout');view.draw(portrait.getContext('2d'),items,camera,1000,800);
 fs.writeFileSync(path.join(out,'characters.png'),portrait.toBuffer('image/png'));
 return {nativeCanvasFrameMs:times.map(x=>+x.toFixed(2)),last:view.status(),note:'Staged native Canvas fixtures, not browser screenshots or FPS guarantees'};
});
test('Repeated module evaluation adds no handlers and no wrappers',()=>{
 const count=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),initial=count();
 const before=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,scene:citadelInterior,draw:spaceDrawCPU})');
 for(let i=0;i<25;i++)for(const f of ['citadel-bases-v2.0.0.js','citadel-decks-v2.0.0.js','citadel-bases-view-v2.0.0.js'])vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),h.c);
 const after=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,scene:citadelInterior,draw:spaceDrawCPU})');
 for(const k of Object.keys(before))assert.equal(after[k],before[k]);assert.equal(count(),initial);return {evaluations:75,listeners:initial};
});
const report={version:'2.0.0',environment:'Node VM + native Canvas; fixtures are explicitly marked',passed:rows.filter(x=>x.pass).length,total:rows.length,rows};
fs.writeFileSync(path.join(out,'bases-regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
