#!/usr/bin/env node
'use strict';
// Wall-clock soak, real engine and ordinary inputs, no browser/render/audio claim.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {play}=require('./campaign-playthrough-1.9.1.cjs');
(async()=>{
 const reportPath='tests/qa-1.9.3/wall-clock-soak.json';
 const previous=process.argv.includes('--resume')&&fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):null;
 const runs=previous?.runs||[],priorSeconds=previous?.wallSeconds||0,started=Date.now();
 assert(runs.every(r=>r.pass&&r.levels.length===14),'Only completed successful campaigns may be resumed');
 for(const calm of [false,true]){
 if(runs.some(r=>r.mode===(calm?'calm':'normal')))continue;
 let first=null,lastEmit=null,emitChanges=0;const samples=[];const wall=Date.now();
 const result=await play(calm,417147,{sound:true,pace:()=>new Promise(r=>setTimeout(r,16)),observe({h,e,frame,id}){
  if(frame<10)lastEmit=e.emit;else if(e.emit!==lastEmit){emitChanges++;lastEmit=e.emit;}
  if(frame%1800===0){if(global.gc)global.gc();const listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,x)=>n+x.length,0);if(first===null)first=listeners;assert.equal(listeners,first);const sample={wallSeconds:Math.round((Date.now()-wall)/1000),frame,level:id,heap:process.memoryUsage().heapUsed,listeners,emitChanges};samples.push(sample);fs.writeFileSync('/tmp/citadel-soak-progress.json',JSON.stringify({mode:calm?'calm':'normal',...sample}));}
 }});
 assert(result.pass,result.error?.message);assert.equal(emitChanges,0);runs.push({mode:result.mode,pass:result.pass,frames:result.frames,levels:result.levels.map(x=>x.level),cards:result.cards.length,wallSeconds:Math.round((Date.now()-wall)/1000),simulatedSeconds:result.simulatedSeconds,emitChanges,samples,entrySha256:result.entrySha256,sources:result.scripts});
 fs.writeFileSync(reportPath,JSON.stringify({environment:'Node VM, ordinary inputs, 16 ms wall-clock pacing; no browser/render/audio-device claim',complete:runs.length===2,wallSeconds:priorSeconds+Math.round((Date.now()-started)/1000),runs},null,2)+'\n');console.log(JSON.stringify(runs.at(-1)));
}})().catch(e=>{console.error(e);process.exitCode=1;});
