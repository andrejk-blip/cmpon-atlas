#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {harness,convoy,out,clone}=require('./detail290-qa.cjs');
const {pilot}=require('./helpers/convoy260-inputs.js');
const rows=[],runs=[];
async function test(name,fn){const result=await fn();rows.push({name,pass:true,...result});console.log('PASS '+name);}
const state=e=>clone({escort:e.escort,player:e.player,enemies:e.enemies,bullets:e.bullets,hostile:e.hostile,status:e.status,elapsed:e.elapsed,entityId:e.entityId});
(async()=>{
 await test('New flights have 3/4/5 bounded encounters separated from circular apertures',()=>{
  const h=harness(),plans=[];for(const assist of [true,false])for(let stage=0;stage<3;stage++){
   const e=convoy(h,stage,assist),p=h.c.CITADEL_CONVOY_MONSTERS.schedule(e),fields=h.c.CITADEL_CONVOY.mission(e).fields.map(f=>f.at+(assist?6.2:5.4));
   assert.equal(p.length,3+stage);for(const w of p)assert(fields.every(t=>Math.abs(t-w.cross)>=5.9));plans.push({stage,assist,plan:clone(p)});
  }return {plans};
 });
 await test('Swept moving-joint collisions detect crossing and preserve open space',()=>{
  const h=harness(),e=convoy(h),api=h.c.CITADEL_CONVOY_MONSTERS;
  const w={segments:[{pos:[10,0,0],previous:[-10,0,0],r:1,part:'tentacle'}]};
  assert(api.hit(e,[0,0,0],[0,0,0],w));assert(!api.hit(e,[0,10,0],[0,10,0],w));
  w.segments[0].previous=[10,0,0];assert(api.hit(e,[-20,0,0],[20,0,0],w));return{};
 });
 await test('Actual engine contact removes shield once; pulse retracts the damaging limb',()=>{
  const h=harness(),e=convoy(h,0,false),api=h.c.CITADEL_CONVOY_MONSTERS,op=pilot(h,e,{reaction:.3});
  while(!api.entities(e).length)e.step(1/60,op.input());const w=api.entities(e)[0];
  // Isolated physical contact fixture, not part of completion evidence.
  w.cross=e.escort.time;api.pose(e,w,0);let tip=w.segments.find(x=>x.part==='hammer')||w.segments.at(-1);
  w.cross+=tip.pos[2]/36;api.pose(e,w,0);tip=w.segments.find(x=>x.part==='hammer')||w.segments.at(-1);
  e.player.pos=[tip.pos[0],tip.pos[1],0];e.player.invulnerable=0;e.player.hp=100;const count=e.escort.warp290.contacts;
  e.step(1/120,{});assert.equal(e.escort.warp290.contacts,count+1);assert(e.player.hp<100);
  const hp=e.player.hp;for(let i=0;i<12;i++)e.step(1/120,{});assert.equal(e.player.hp,hp);
  e.player.pulseCooldown=0;assert(e.pulse());assert(w.repelledUntil>e.escort.time);e.step(1/60,{});
  assert(w.segments.filter(x=>x.part!=='body').every(x=>Math.abs(x.pos[0])>50));return {shieldLoss:100-hp,contacts:e.escort.warp290.contacts,repelled:e.escort.warp290.repelled};
 });
 await test('Pause and full save roundtrip preserve monster pose and deterministic continuation',()=>{
  const h=harness(),e=convoy(h,1,true),op=pilot(h,e,{reaction:.3});while(e.escort.time<6)e.step(1/60,op.input());
  e.pause();const before=state(e);for(let i=0;i<120;i++)e.step(1/30,{turn:1,fire:true});assert.deepEqual(state(e),before);e.resume();
  const b=harness(),other=b.unpack(h.pack(e),{seed:e.seed,mode:'calm'},()=>{});b.arcade.engine=other;assert.deepEqual(state(other),state(e));
  for(let i=0;i<240;i++){const input={turn:Math.sin(i/30)*.3,fire:true};e.step(1/60,input);other.step(1/60,clone(input));}
  assert.deepEqual(state(other),state(e));return{};
 });
 await test('An already running 2.8 convoy retains its original rules and resources',()=>{
  const old=harness(true),e=convoy(old,0,true),op=pilot(old,e,{reaction:.3});while(e.escort.time<5)e.step(1/60,op.input());
  const h=harness(),other=h.unpack(old.pack(e),{seed:e.seed,mode:'calm'},()=>{});h.arcade.engine=other;assert(!other.escort.warp290);
  for(let i=0;i<240;i++){const input={fire:true,turn:0,pitch:0};e.step(1/60,input);other.step(1/60,input);}assert.deepEqual(state(other),state(e));return{};
 });
 await test('Repeated module load does not stack simulation, actions or listeners',()=>{
  const h=harness(),p=h.Engine.prototype,refs=[p.beginEscort,p.stepEscort,p.pulse],listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0);
  for(let i=0;i<10;i++)h.run(fs.readFileSync(path.join(__dirname,'../assets/citadel-convoy-monsters-v2.9.0.js'),'utf8'));
  assert.equal(p.beginEscort,refs[0]);assert.equal(p.stepEscort,refs[1]);assert.equal(p.pulse,refs[2]);assert.equal([...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),listeners);return{};
 });
 await test('New convoy briefing teaches collision and cover; legacy briefing stays unchanged',()=>{
  const h=harness(),e=convoy(h);e.status='escortbrief';
  assert(h.run('expeditionOverlay')(e).includes('Существа у края коридора'));
  delete e.escort.warp290;assert(!h.run('expeditionOverlay')(e).includes('Существа у края коридора'));return{};
 });
 const seen=new Set();
 for(const hz of [30,60])for(const mode of ['training','combat','pro'])for(let stage=0;stage<3;stage++){
  const h=harness(),e=convoy(h,stage,mode==='training');h.c.CITADEL_LEARNING_MODES.configureEngine(e,mode);const op=pilot(h,e,{reaction:.3,device:'joystick'});let frames=0,peak=0;
  while(e.status==='playing'&&frames++<180*hz){e.step(1/hz,op.input());for(const w of e.escort.warp290.entities){seen.add(w.kind);assert(w.segments.every(x=>x.pos.every(Number.isFinite)));}peak=Math.max(peak,e.escort.warp290.entities.length);}
  const row={stage,mode,hz,status:e.status,seconds:+e.escort.time.toFixed(2),shield:e.player.hp,transports:e.escort.allies.map(a=>a.hp),monsters:e.escort.warp290.spawned,contacts:e.escort.warp290.contacts,repelled:e.escort.warp290.repelled,peak};runs.push(row);console.log(JSON.stringify(row));
 }
 const report={method:'18 ordinary-input convoy flights: 3 missions × 3 modes × 30/60 Hz. Entry/loadout fixtures only; no player/health/position edits during those flights. Separate explicit collision fixtures above.',checks:rows,runs,kinds:[...seen],pass:runs.every(x=>x.status==='escortclear'&&x.peak<=2)&&seen.size===5};
 fs.writeFileSync(path.join(out,'convoy-rules.json'),JSON.stringify(report,null,2)+'\n');assert(report.pass,'Inspect completion matrix');console.log('PASS all 18 convoys and '+rows.length+' contracts');
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'convoy-failure.json'),JSON.stringify({checks:rows,runs,error:e.stack},null,2));process.exitCode=1;});
