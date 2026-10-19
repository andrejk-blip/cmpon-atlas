#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const file='assets/citadel-runtime-v1.9.3.js',checks=[];
const plain=x=>JSON.parse(JSON.stringify(x));
async function fixture(){
 let time=0,serial=0;const raf=new Map(),intervals=new Map();
 const h=entryHarness(entrySnapshot(),{frameClock:true,beforeScripts({c}){
  c.performance.now=()=>time;
  c.requestAnimationFrame=fn=>{const id=++serial;raf.set(id,fn);return id;};c.cancelAnimationFrame=id=>raf.delete(id);
  c.setInterval=(fn,ms)=>{const id=++serial;intervals.set(id,{fn,ms});return id;};c.clearInterval=id=>intervals.delete(id);
  c.console={...console,error(){}};
 }});
 await new Promise(setImmediate);
 // Scheduler/fault tests isolate rendering; native Canvas is covered by the entry suite.
 h.run('spaceScene=()=>[]; drawFlightHUD=drawCampaignFlightHUD=drawClarityHUD=()=>{};');
 h.arcade.renderer.render=()=>{};h.cup.panel=null;h.arcade.fx=false;h.arcade.sound=true;
 const e=new h.Engine(417147,()=>{});h.arcade.engine=e;e.start(false);
 while(h.c.CITADEL_STORY.status(e).active)h.action('story-next');h.action('citadel-launch');
 const tick=(ms=1000/60)=>{time+=ms;const jobs=[...raf.values()];raf.clear();for(const fn of jobs)fn(time);};
 const advance=ms=>{time+=ms;for(const {fn}of [...intervals.values()])fn();};
 const visibility=hidden=>{h.c.document.hidden=hidden;for(const fn of h.handlers.get('visibilitychange')||[])fn({type:'visibilitychange'});};
 return{h,e,raf,intervals,tick,advance,visibility,diag:()=>h.c.CITADEL_RUNTIME.diagnostic()};
}
async function check(name,fn){console.log("START "+name);try{const data=await fn();checks.push({name,pass:true,data});}catch(e){checks.push({name,pass:false,error:e.message,stack:e.stack});}}
(async()=>{
 await check('One owner, idempotent script installation and ordinary pause/resume',async()=>{
  const f=await fixture();f.tick();const initial=f.diag();assert.equal(f.raf.size,1);assert(initial.updates>0);
  const counts=()=>[f.raf.size,f.intervals.size,[...f.h.handlers.values()].flat().length,[...f.h.windowHandlers.values()].flat().length];const before=counts();
  vm.runInContext(fs.readFileSync(file,'utf8'),f.h.c,{filename:file});assert.deepEqual(counts(),before);
  f.h.action('arcade-pause');const t=f.e.elapsed;for(let i=0;i<60;i++)f.tick();assert.equal(f.e.elapsed,t);
  f.h.action('arcade-resume');f.tick();assert(f.e.elapsed>t);assert.equal(f.diag().failures,0);return f.diag();
 });
 await check('Lost RAF repaired once, stale callback cannot duplicate updates',async()=>{
  const f=await fixture();f.tick();const old=[...f.raf.values()][0];f.raf.clear();f.advance(5000);
  assert.equal(f.diag().recoveries,1);assert.equal(f.e.status,'paused');assert.equal(f.raf.size,1);
  const updates=f.diag().updates;old(6000);assert.equal(f.diag().updates,updates);assert.equal(f.raf.size,1);
  f.tick();f.h.action('arcade-resume');f.tick();assert.equal(f.diag().updates,updates+1);return f.diag();
 });
 await check('Hidden tab is exempt; visibility return owns exactly one frame',async()=>{
  const f=await fixture();f.tick();f.visibility(true);assert.equal(f.raf.size,0);f.advance(60000);assert.equal(f.diag().recoveries,0);
  f.visibility(false);assert.equal(f.raf.size,1);f.tick();assert.equal(f.raf.size,1);assert.equal(f.e.status,'paused');return f.diag();
 });
 await check('Transient render failure pauses, preserves completed state and never replays a step',async()=>{
  const f=await fixture();f.tick();const render=f.h.arcade.renderer.render;let calls=0;
  f.h.arcade.renderer.render=()=>{calls++;const error=new TypeError('secret-player-name secret-token');error.stack='TypeError: secret\n at paint (https://test.invalid/assets/citadel-comic-v1.9.3.js:200:9)';throw error;};
  f.tick();assert.equal(f.e.status,'paused');assert.equal(f.diag().faults[0].module,'citadel-comic-v1.9.3.js');assert.equal(f.diag().recoveries,1);
  const updates=f.diag().updates;f.h.arcade.renderer.render=render;f.tick();assert.equal(f.diag().updates,updates);assert.equal(f.raf.size,1);
  assert(f.h.storage.has('cmpon.citadel.recovery.v1'));assert(!JSON.stringify(f.diag()).includes('secret'));
  assert(!f.h.fetchCalls.some(x=>x.endpoint==='collect'||x.endpoint==='save'));return f.diag();
 });
 await check('Interrupted update saves last good state and stops without replay or automatic reload',async()=>{
  const f=await fixture();f.tick();let calls=0;f.e.step=()=>{calls++;throw new RangeError('probe');};f.tick();
  assert.equal(calls,1);assert.equal(f.diag().stopped,true);assert.equal(f.raf.size,0);f.advance(9000);assert.equal(calls,1);
  const s=JSON.parse(f.h.storage.get('cmpon.citadel.recovery.v1'));assert.equal(s.schema,1);assert(s.engine.elapsed<=f.e.elapsed);assert.equal(s.engine.seed,f.e.seed);
  f.h.action('arcade-resume');assert.equal(f.e.status,'paused');assert.equal(f.raf.size,0);return f.diag();
 });
 await check('An asynchronous restore may start a new engine after a fatal update; the broken instance never restarts',async()=>{
  const f=await fixture();f.tick();f.e.step=()=>{throw new Error('probe');};f.tick();assert.equal(f.diag().stopped,true);
  const fresh=new f.h.Engine(417147,()=>{});fresh.start(false);f.h.arcade.engine=fresh;
  f.advance(1000);assert.equal(f.diag().stopped,false);assert.equal(f.raf.size,1);f.tick();assert.equal(f.raf.size,1);assert.equal(f.diag().failures,1);
  return {failures:f.diag().failures,pending:f.diag().pending,status:fresh.status};
 });
 await check('Denied localStorage retains an in-memory backup and does not throw from the failure handler',async()=>{
  const f=await fixture();f.tick();f.h.c.localStorage.setItem=()=>{throw new Error('storage denied');};f.e.step=()=>{throw new Error('probe');};
  f.tick();assert.equal(f.diag().recoverySave,'memory');assert.equal(f.diag().stopped,true);assert.equal(f.raf.size,0);return {recoverySave:f.diag().recoverySave};
 });
 await check('Repeated render fault stops instead of an exception/recovery loop',async()=>{
  const f=await fixture();f.tick();f.h.arcade.renderer.render=()=>{throw new Error('probe');};f.tick();f.tick();assert.equal(f.diag().failures,2);assert.equal(f.diag().stopped,true);assert.equal(f.raf.size,0);return f.diag();
 });
 await check('Context-loss lifecycle pauses updates; restoration schedules only one frame',async()=>{
  const f=await fixture();f.tick();const canvas=f.h.arcade.canvas;
  for(const fn of canvas.handlers.webglcontextlost||[])fn({preventDefault(){}});
  const before=f.diag().updates;f.tick();f.advance(7000);assert.equal(f.diag().updates,before);assert.equal(f.diag().contextLost,true);assert.equal(f.diag().recoveries,0);
  for(const fn of canvas.handlers.webglcontextrestored||[])fn({});
  assert.equal(f.diag().contextLost,false);assert.equal(f.raf.size,1);f.tick();assert.equal(f.raf.size,1);return f.diag();
 });
 await check('Journal bounded; diagnostics omit save, name, message and action payload',async()=>{
  const f=await fixture();for(let i=0;i<160;i++){f.h.action('arcade-pause','private-value');f.tick();}
  const d=plain(f.diag());assert(d.events.length<=64);assert(!JSON.stringify(d).includes('private-value'));assert.equal(d.failures,0);return{events:d.events.length,frames:d.frames};
 });
 const report={suite:'runtime193',environment:'Node VM, mocked renderer/RAF/timers/storage; native Canvas integration tested separately',checks,pass:checks.every(x=>x.pass)};
 const reportArg=process.argv.indexOf('--report');
 fs.writeFileSync(reportArg>=0?process.argv[reportArg+1]:'tests/qa-1.9.3/runtime.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,checks:checks.map(({name,pass,error})=>({name,pass,error}))},null,2));if(!report.pass)process.exitCode=1;
})();
