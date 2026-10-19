#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const {setup,input,snapshot,candidate}=require('./pursuit220-regression.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const out=path.join(__dirname,'qa-2.2.0'),file='assets/citadel-pursuit-view-v2.2.0.js';
const listeners=h=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0);
const gameplay=e=>{const s=snapshot(e);delete s.pursuit.visual220;return s;};
async function main(){
 const {h,e}=await setup(),entry=candidate();entry.scripts=entry.scripts.filter(f=>f!==file);const prior=await setup(false,417147,entry);
 let maxFragments=0,fractures=0,parityFrames=0,saved=null;
 for(let i=0;i<200*60&&e.status!=='boarding';i++){
  const c=input(h,e),priorCommand=input(prior.h,prior.e);assert.deepEqual(c,priorCommand);e.step(1/60,c);prior.e.step(1/60,priorCommand);parityFrames++;
  if(i%60===0)assert.deepEqual(gameplay(e),gameplay(prior.e));
  const v=e.pursuit.visual220;maxFragments=Math.max(maxFragments,v.fragments.length);fractures=v.fractures;
  assert(v.fragments.length<=48);for(const f of v.fragments)assert([...f.pos,...f.vel,...f.rotation,...f.spin,f.life].every(Number.isFinite));
  if(!saved&&v.fragments.length)saved=h.pack(e);
 }
 assert.equal(e.status,'boarding');assert.deepEqual(gameplay(e),gameplay(prior.e));assert(saved&&fractures>0);
 const a=h.unpack(saved,{seed:417147,mode:'normal'},()=>{}),b=h.unpack(saved,{seed:417147,mode:'normal'},()=>{});
 const originalFragments=a.pursuit.visual220.fragments.slice();a.pause();const paused=snapshot(a);for(let i=0;i<120;i++)a.step(1/60,{fire:true});assert.deepEqual(snapshot(a),paused);a.resume();
 for(let i=0;i<5*60;i++){h.arcade.engine=a;const c=input(h,a);a.step(1/60,c);h.arcade.engine=b;b.step(1/60,c);}assert.deepEqual(snapshot(a),snapshot(b));assert(originalFragments.every(f=>!a.pursuit.visual220.fragments.includes(f)));
 const identities=h.run('[RequirementArcade.prototype.step,spaceCamera,spaceScene,spaceDrawCPU,SpaceRendererCore.prototype.render,SpaceRendererCore.prototype.dispose,drawFlightHUD,drawMobileGameHUD]');const beforeListeners=listeners(h);
 for(let i=0;i<40;i++)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),h.c);
 const after=h.run('[RequirementArcade.prototype.step,spaceCamera,spaceScene,spaceDrawCPU,SpaceRendererCore.prototype.render,SpaceRendererCore.prototype.dispose,drawFlightHUD,drawMobileGameHUD]');identities.forEach((fn,i)=>assert.equal(fn,after[i]));assert.equal(listeners(h),beforeListeners);
 const stages=[1,2,3].map(n=>JSON.parse(fs.readFileSync(path.join(out,'checkpoint-stage-'+n+'.json'))));
 async function benchmark(harness,label){
  harness.c.performance={now:()=>performance.now()};harness.c.innerWidth=1280;harness.c.innerHeight=720;harness.c.devicePixelRatio=1;
  const canvas=createCanvas(1280,720),ctx=canvas.getContext('2d');canvas.getBoundingClientRect=()=>({width:1280,height:720});harness.arcade.canvas=canvas;
  const engines=stages.map(s=>harness.unpack(s,{seed:417147,mode:'normal'},()=>{})),times=[],heaps=[],stats=[];let firstFrame;
  for(let i=0;i<91;i++){
   const engine=engines[i%3];harness.arcade.engine=engine;const t=performance.now(),cam=harness.camera(engine,engine.elapsed),scene=harness.scene(engine,engine.elapsed,true);harness.draw(ctx,scene,cam,1280,720);const ms=performance.now()-t;
   if(i===0)firstFrame=ms;else times.push(ms);
   if(i%30===0){if(global.gc)global.gc();heaps.push(process.memoryUsage().heapUsed);stats.push(harness.c.CITADEL_PURSUIT_VIEW?.stats()||null);}
  }
  times.sort((a,b)=>a-b);return{label,frames:91,width:1280,height:720,firstFrameMs:firstFrame,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],heapsAfterGc:heaps,stats};
 }
 const current=await benchmark(h,'2.2.0'),baseline=await benchmark(prior.h,'2.1.0');
 assert.equal(current.stats[1].templates,current.stats[3].templates);assert.equal(current.stats[1].meshes,current.stats[3].meshes);assert.equal(listeners(h),beforeListeners);
 const report={pass:true,method:'Node VM exact entries, ordinary pursuit commands, native Canvas at 1280x720. Same reached states for before/after. Timings include VM overhead; not browser or hardware FPS.',parityFrames,fractures,maxFragments,fragmentLimit:48,saveWithLiveFragments:true,pause:true,expiration:true,reloads:40,listeners:beforeListeners,cachePlateau:true,benchmarks:[current,baseline]};
 fs.writeFileSync(path.join(out,'graphics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
