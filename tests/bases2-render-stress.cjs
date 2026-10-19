#!/usr/bin/env node
'use strict';
// Full-input campaign with native software rendering every 30 simulation
// steps. This stresses meshes/caches; it is not a browser frame-rate test.
const fs=require('node:fs'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {play}=require('./campaign-playthrough-1.9.1.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
let canvas,ctx;const times=[],samples=[],seen=new Set();
let frames=0,initialHandlers,wall=Date.now();
(async()=>{
 const result=await play(false,417147,{observe({h,e,frame,id}){
  if(!seen.has(h)){seen.add(h);h.c.performance={now:()=>performance.now()};canvas=h.c.document.getElementById('arcade-canvas');canvas.width=1024;canvas.height=640;ctx=canvas.getContext('2d');h.arcade.canvas=canvas;}
  if(![2,5,8,11,13].includes(id)||e.status!=='boarding'||frame%30)return;
  const before=e.board.time,start=performance.now(),items=h.scene(e,e.elapsed,true),camera=h.camera(e,e.elapsed);
  for(const x of items){assert(x.model.every(Number.isFinite));assert(x.pos.every(Number.isFinite));}
  h.draw(ctx,items,camera,1024,640);times.push(performance.now()-start);frames++;
  assert.equal(e.board.time,before,'Rendering is read-only');
  if(frames%30===0){if(global.gc)global.gc();const listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0);
   if(initialHandlers===undefined)initialHandlers=listeners;assert.equal(listeners,initialHandlers);
   samples.push({frame:frames,level:id,heapAfterGC:process.memoryUsage().heapUsed,listeners,meshes:h.run('Object.keys(SPACE_MESH).length'),...h.c.CITADEL_BASE_VIEW.status()});
   fs.writeFileSync('/tmp/base2-render-progress.json',JSON.stringify(samples.at(-1)));}
 }});
 assert(result.pass,result.error?.message);assert(frames>500);assert(samples.at(-1).rigVariants<=48);assert(samples.at(-1).architectureLayouts<=5);
 const sorted=times.slice().sort((a,b)=>a-b);const report={version:'2.0.0',pass:true,wallSeconds:Math.round((Date.now()-wall)/1000),renderedFrames:frames,
  simulatedSeconds:result.simulatedSeconds,levels:result.levels.length,cards:result.cards.length,samples,
  milliseconds:{median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},
  environment:'Node VM, native Canvas 1024×640, real campaign input; rendering every 30 simulation steps. Not GPU/browser FPS.'};
 fs.writeFileSync('tests/qa-2.0.0/render-stress.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,samples:samples.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
