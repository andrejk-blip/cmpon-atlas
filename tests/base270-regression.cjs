#!/usr/bin/env node
'use strict';
// Entry fixtures select a fresh landing. Every action after it is ordinary
// movement, aiming, firing, pulse or a real educational-card answer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const root=path.resolve(__dirname,'..'),file='assets/citadel-base-missions-v2.7.0.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(){const entry=entrySnapshot();for(const f of[file,'assets/citadel-base-missions-view-v2.7.0.js'])if(!entry.scripts.includes(f)&&fs.existsSync(path.join(root,f))){entry.scripts.push(f);entry.sources.set(f,fs.readFileSync(path.join(root,f),'utf8'));}
  const h=entryHarness(entry);h.baseSourceSha256=crypto.createHash('sha256').update(entry.sources.get(file)).digest('hex');h.c.performance={now:()=>performance.now()};h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};return h;}
function restore(h,level=2,mode='normal',fresh=true){const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'qa-2.0.0','checkpoint-'+mode+'-'+level+'.json'),'utf8'));
  const e=h.unpack(snap,{seed:snap.engine.seed,mode},()=>{});h.arcade.engine=e;if(fresh)e.beginBoarding();return e;}
const {createController}=require('./helpers/base270-inputs.js');

function run(){const h=harness(),out=path.join(__dirname,'qa-2.7.0');fs.mkdirSync(out,{recursive:true});const rows=[],runs=[];
  function test(name,fn){const start=performance.now();try{const data=fn();rows.push({name,pass:true,seconds:+((performance.now()-start)/1000).toFixed(3),data});console.log('PASS '+name);}catch(error){rows.push({name,pass:false,error:error.stack});console.error('FAIL '+name+' '+error.stack);}}
  test('Fresh missions have distinct geometry, roles, and reachable rewards',()=>{const r=[];for(const level of[2,5,8,11,13]){const e=restore(h,level),b=e.board,s=b.missions270;assert(s);assert.equal(s.tier,[2,5,8,11,13].indexOf(level));
      assert.equal(b.armory260.pickups.length,3);for(const x of b.armory260.pickups)assert(h.deckQA.path(b,b.definition.rooms[x.room].posts[0],x.pos).length);
      for(const x of s.systems){assert(h.run('stationWalkable')(b,x.pos,.72,true),'Panel floor '+x.id);assert(h.deckQA.path(b,b.definition.rooms[x.room].posts[0],x.pos).length,'Panel route '+x.id);}
      assert.equal(b.enemies.filter(x=>x.missions270?.kind==='mech').length,level===2?0:1);
      for(const x of b.enemies)assert(h.run('stationWalkable')(b,x.pos,.68,true),'Enemy placed on solid floor '+x.id);
      r.push({level,theme:s.theme,plans:b.definition.rooms.map(x=>x.plan),cells:b.cells.size,dogs:b.enemies.filter(x=>x.missions270?.kind==='dog').length,hazards:s.hazards.length,systems:s.systems.length});}return r;});
  test('Saved active 2.6 board is never remapped or given a replacement crew',()=>{const e=restore(h,11,'normal',false),before=clone(h.pack(e));assert(!e.board.missions270);const r=h.unpack(before,{seed:e.seed,mode:'normal'},()=>{});
    assert.deepEqual(clone(r.board.definition),before.engine.board.definition);assert.deepEqual(clone(r.board.enemies),before.engine.board.enemies);assert.equal(r.board.hp,e.board.hp);assert(!r.board.missions270);return{layout:'legacy',unchanged:true};});
  test('Broken floors block walking, allow fire, and lift state survives midair restore',()=>{
    // Mechanism fixture: start on a visible existing platform. This is not a
    // claimed mission completion and changes no health, enemies or resources.
    const e=restore(h,13,'calm'),b=e.board,lift=b.missions270.systems.find(x=>x.type==='lift');
    assert(!h.deckQA.line(b,lift.pos,lift.target,.7));assert(e.boardLOS(lift.pos,lift.target,.1));
    b.pos=lift.pos.slice();b.previous=b.pos.slice();for(let i=0;i<24&&!b.missions270.transport;i++)e.step(1/60,{});assert(b.missions270.transport);
    for(let i=0;i<40;i++)e.step(1/60,{});assert(b.pos[1]>1);e.pause();const saved=clone(h.pack(e)),r=h.unpack(saved,{seed:e.seed,mode:'calm'},()=>{});
    assert.deepEqual(clone(h.pack(r).engine.board),saved.engine.board);e.resume();r.resume();
    for(let i=0;i<140;i++){e.step(1/60,{});r.step(1/60,{});}assert.deepEqual(clone(h.pack(r).engine.board),clone(h.pack(e).engine.board));
    assert(!b.missions270.transport);assert(lift.arrivalLatch);assert.deepEqual(clone(lift.dockPos),clone(lift.target));
    const trips=b.missions270.stats.liftTrips;for(let i=0;i<480&&e.status==='boarding';i++)e.step(1/60,{});
    assert.equal(b.missions270.stats.liftTrips,trips,'No unattended return trip');assert.equal(trips,1);
    return{physicalHole:true,shootAcross:true,midairPause:true,arrivalLatch:true,trips,afterWaitStatus:e.status};
  });
  test('Custom robot AI advances once and never falls through legacy human cadence',()=>{
    const e=restore(h,5),b=e.board,x=b.enemies.find(z=>z.missions270?.kind==='dog');
    x.missions270.phase='recover';x.missions270.phaseClock=0;x.alert=true;e.enemyBoardStep(x,.1);
    assert.equal(x.missions270.phaseClock,.1);assert(!b.hostile.some(z=>z.owner===x.id));assert.equal(x.missions270.speed,0);
    return{robotClockDelta:.1,legacyHumanShots:0};
  });
  if(!process.argv.includes('--unit'))test('Five fresh bases × two modes, real cards, loot and optional systems',()=>{
    const modes=process.argv.includes('--quick')?['normal']:['normal','calm'];for(const mode of modes)for(const level of(process.env.BASE270_LEVEL?[Number(process.env.BASE270_LEVEL)]:[2,5,8,11,13])){
      const reaction=Number(process.argv.find(x=>x.startsWith('--reaction='))?.slice(11)||0);
      const e=restore(h,level,mode);e.step(0,{});const b=e.board,control=createController(h,{mobile:mode==='calm',reaction}),ids=new Set(b.enemies.map(x=>x.id)),emit=e.emit,start=e.elapsed;
      let frame=0,cards=0,minHp=b.hp,finalHp=b.hp,peak=0;
      for(;frame<60*900;frame++){
        if(e.status==='lost'||e.board!==b||e.finale&&e.finale.phase!=='maze'||e.status==='stageclear')break;
        if(e.status==='remark'){cards++;h.action('citadel-answer',h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)').correct);h.action('citadel-remark-next');continue;}
        if(e.status==='finalcheck'){cards++;h.action('finale-answer',h.run('FINALE_TRIALS[ARCADE.engine.board.completed.length]').correct);h.action('finale-check-next');continue;}
        finalHp=b.hp;e.step(1/60,control(e));minHp=Math.min(minHp,b.hp);peak=Math.max(peak,b.bullets.length+b.hostile.length);assert.equal(e.emit,emit);
        if(!e.finale||e.finale.phase==='maze')for(const x of b.enemies)assert(ids.has(x.id));
      }
      const row={level,mode,reaction,status:e.status,phase:e.finale?.phase||e.phase,seconds:+(e.elapsed-start).toFixed(2),cards,minHp:+minHp.toFixed(2),hp:+finalHp.toFixed(2),pickups:b.armory260.pickups.filter(x=>x.taken).length,
        stats:clone(b.missions270.stats),peakProjectiles:peak,remaining:b.enemies.filter(x=>ids.has(x.id)).map(x=>({id:x.id,kind:x.archetype,hp:x.hp,pos:x.pos})),player:b.pos};runs.push(row);console.log(JSON.stringify(row));
      assert.notEqual(e.status,'lost','Pilot lost '+level+' '+mode);assert.equal(cards,3);assert.equal(row.pickups,3);assert.equal(b.missions270.stats.systemsUsed,b.missions270.systems.filter(x=>x.type!=='lift').length);assert(frame<60*900,'Pilot timed out');
    }return runs;
  });
  test('Pause, restore and repeated script loads preserve exact simulation state',()=>{const e=restore(h,8),control=createController(h);for(let i=0;i<700&&e.status==='boarding';i++)e.step(1/60,control(e));e.pause();const saved=clone(h.pack(e));
    for(let i=0;i<240;i++)e.step(1/60,{moveX:1,fire:true,pulse:true});assert.deepEqual(clone(h.pack(e)),saved);
    const r=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(clone(h.pack(r).engine.board),saved.engine.board);e.resume();r.resume();
    for(let i=0;i<120&&e.status==='boarding';i++){const input={moveZ:1,fire:true};e.step(1/60,input);r.step(1/60,input);}assert.deepEqual(clone(h.pack(r).engine.board),clone(h.pack(e).engine.board));
    const functions=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,guide:stationGuideControl,path:stationPath,unpack:cupUnpack})'),listeners=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),count=listeners();
    for(let i=0;i<40;i++)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c);const after=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,guide:stationGuideControl,path:stationPath,unpack:cupUnpack})');
    for(const key of Object.keys(functions))assert.equal(after[key],functions[key]);assert.equal(listeners(),count);return{pausedSeconds:4,deterministicFrames:120,loads:40,listeners:count};});
  const report={version:'2.7.0',environment:'Node VM, input-only mission fixtures. Not a browser or human balance claim.',rulesSha256:h.baseSourceSha256,passed:rows.filter(x=>x.pass).length,total:rows.length,rows,runs};
  fs.writeFileSync(path.join(out,process.argv.includes('--unit')?'base-missions-unit.json':'base-missions.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total}));if(report.passed!==report.total)process.exitCode=1;
}
module.exports={harness,restore,createController};if(require.main===module)run();
