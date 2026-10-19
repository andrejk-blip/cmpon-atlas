#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {setup,play,draw,snapshot,candidate,input}=require('./pursuit210-regression.cjs');
const {entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.1.0'),groups=[],details=[];
const clone=x=>JSON.parse(JSON.stringify(x)),wait=()=>new Promise(r=>setImmediate(r));
async function check(name,fn){const result=await fn();groups.push(name);if(result)details.push({name,...result});console.log('PASS '+name);}
(async()=>{
 await check('connected channel attaches to both ships; real steering severs it and pauses upload',async()=>{
  const {h,e}=await setup();for(let i=0;i<8*60;i++)e.step(1/60,input(h,e));const api=h.c.CITADEL_PURSUIT;
  assert(api.channel(e));assert(e.pursuit.link.connected);let progress=e.pursuit.progress;
  for(let i=0;i<100;i++)e.step(1/60,{turn:1,pitch:-1,fire:true});
  assert(!e.pursuit.link.connected);assert.equal(api.channel(e),null);progress=e.pursuit.progress;
  for(let i=0;i<30;i++)e.step(1/60,{turn:1,pitch:-1});assert.equal(e.pursuit.progress,progress);
  for(let i=0;i<5*60;i++)e.step(1/60,input(h,e));assert(e.pursuit.progress>progress);
 });
 await check('flying into a physical wall causes real damage (isolated collision fixture)',async()=>{
  const {h,e}=await setup(),s=e.pursuit;for(let i=0;i<5*60;i++)e.step(1/60,{});
  // Synthetic geometry fixture only; never counted as mission completion.
  const g={id:99001,index:0,distance:s.travel+20,pos:[s.origin[0],s.origin[1],e.player.pos[2]-20],kind:'bulkhead',chapter:0,hx:10,hy:10,crossed:false,passed:false};
  s.gates=[g];e.player.pos[0]=s.origin[0]+25;s.leader.pos=[s.origin[0]+25,s.origin[1],s.origin[2]-84];
  const before=e.player.hp;for(let i=0;i<30;i++)e.step(1/60,{fire:true});assert(e.player.hp<before);assert.equal(s.gateCollisions,1);assert(!g.passed);
 });
 await check('keyboard and touch at 30 Hz finish using real weapon and gate rules',async()=>{
  const results=[];for(const type of ['keyboard','touch']){const r=await play(false,417147,{type});assert(r.pass);assert(r.inspection.kills>0);assert(r.inspection.jammersDestroyed>0);results.push(r);}
  fs.writeFileSync(path.join(out,'input-modes.json'),JSON.stringify(results,null,2)+'\n');return {runs:results.map(r=>({type:r.type,seconds:r.inspection.clock,kills:r.inspection.kills}))};
 });
 await check('without fire jammer delays transfer and enemy shots cause damage',async()=>{
  const r=await play(false,417147,{fire:false,limit:450});assert.equal(r.inspection.kills,0);assert(r.hp<100);assert(!r.pass);fs.writeFileSync(path.join(out,'no-fire.json'),JSON.stringify(r,null,2)+'\n');return{status:r.status,seconds:r.inspection.clock,progress:r.inspection.progress,hp:r.hp};
 });
 await check('new save restores live encounters, shutters, stage and deterministic future',async()=>{
  const {h,e}=await setup();while(e.pursuit.chapter<2||!e.enemies.length)e.step(1/60,input(h,e));
  const saved=h.pack(e),restored=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});assert.equal(restored.pursuit.chapter,e.pursuit.chapter);
  for(let i=0;i<5*60;i++){const command=input(h,e);h.arcade.engine=e;e.step(1/60,command);h.arcade.engine=restored;restored.step(1/60,command);}
  assert.deepEqual(snapshot(restored),snapshot(e));return{stage:3,resumedSeconds:5};
 });
 await check('pause freezes mission and resume keeps one ordinary step',async()=>{
  const {h,e}=await setup();for(let i=0;i<90;i++)e.step(1/60,input(h,e));e.pause();const before=snapshot(e);
  for(let i=0;i<120;i++)e.step(1/60,{turn:1,fire:true});assert.deepEqual(snapshot(e),before);e.resume();e.step(1/60,input(h,e));assert(e.elapsed>before.elapsed);
 });
 await check('1.9.0 partial save migration preserves data, health, decisions and score without duplicate requirements',async()=>{
  const entry=candidate(),file='assets/citadel-pursuit-v2.1.0.js';entry.sources.set(file,fs.readFileSync(path.join(root,'assets/citadel-pursuit-v1.9.0.js'),'utf8'));
  const old=await setup(false,417147,entry);while(old.e.pursuit.progress<48)old.e.step(1/60,input(old.h,old.e));
  old.e.pause();const packed=old.h.pack(old.e),{h}=await setup(),restored=h.unpack(packed,{seed:417147,mode:'normal'},()=>{});
  assert.equal(restored.status,'paused');assert.equal(restored.player.hp,old.e.player.hp);assert.equal(restored.score,old.e.score);assert.deepEqual(clone(restored.rescued),clone(old.e.rescued));
  assert(Math.abs(restored.pursuit.progress-old.e.pursuit.progress)<1e-7);h.arcade.engine=restored;restored.resume();
  for(let i=0;i<400*60&&restored.status!=='boarding';i++)restored.step(1/60,input(h,restored));assert.equal(restored.status,'boarding');assert.equal(new Set(restored.rescued).size,restored.rescued.length);assert.equal(restored.decisions.filter(x=>x.stage===1).length,2);
  return{oldProgress:old.e.pursuit.progress,newProgress:restored.pursuit.progress,requirements:restored.rescued.length};
 });
 await check('read-only desktop/portrait/landscape render and bounded HUD',async()=>{
  const {h,e}=await setup();for(let i=0;i<17*60;i++)e.step(1/60,input(h,e));
  for(const [w,hh,dpr] of [[1280,720,1],[390,460,2],[844,320,1]]){draw(h,e,'layout-'+w+'x'+hh+'.png',w,hh,dpr);const bounds=h.c.CITADEL_PURSUIT.hudBounds(e,h.camera(e,e.elapsed),w,hh);assert(bounds.every(b=>b.x>=0&&b.y>=0&&b.x+b.width<=w&&b.y+b.height<=hh));}
 });
 await check('module reload is idempotent and does not add listeners or wrappers',async()=>{
  const {h,e}=await setup(),step=e.step,hit=e.hit,emit=e.emit,listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),source=fs.readFileSync(path.join(root,'assets/citadel-pursuit-v2.1.0.js'),'utf8');
  for(let i=0;i<40;i++)vm.runInContext(source,h.c);assert.equal(e.step,step);assert.equal(e.hit,hit);assert.equal(e.emit,emit);assert.equal([...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),listeners);return{reloads:40,listeners};
 });
 fs.writeFileSync(path.join(out,'contracts.json'),JSON.stringify({passed:groups.length,groups,details},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
