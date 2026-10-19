#!/usr/bin/env node
'use strict';
// Repeated save-load and render cycles on one engine/renderer environment.
// This checks a cache plateau, separately from campaign completion tests.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const h=entryHarness(entrySnapshot()),canvas=h.c.document.getElementById('arcade-canvas');
canvas.width=960;canvas.height=600;h.arcade.canvas=canvas;const ctx=canvas.getContext('2d'),samples=[];
const input={moveZ:-1},started=Date.now();
const count=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),initial=count();
for(let pass=0;pass<5;pass++){
 for(const mode of ['normal','calm'])for(const level of [2,5,8,11,13]){
  const saved=JSON.parse(fs.readFileSync('tests/qa-2.0.0/checkpoint-'+mode+'-'+level+'.json','utf8'));
  const e=h.unpack(saved,{seed:417147,mode},()=>{});h.arcade.engine=e;
  for(let i=0;i<120;i++)e.step(1/60,input);
  for(let i=0;i<4;i++){e.step(1/60,input);h.draw(ctx,h.scene(e,e.elapsed,true),h.camera(e,e.elapsed),960,600);}
 }
 if(global.gc)global.gc();assert.equal(count(),initial);
 samples.push({pass,heapAfterGC:process.memoryUsage().heapUsed,listeners:count(),meshes:h.run('Object.keys(SPACE_MESH).length'),...h.c.CITADEL_BASE_VIEW.status()});
}
assert.equal(samples.at(-1).meshes,samples[1].meshes);assert.equal(samples.at(-1).rigVariants,samples[1].rigVariants);
assert.equal(samples.at(-1).architectureLayouts,5);assert(samples.at(-1).heapAfterGC<samples[1].heapAfterGC+12*1024*1024,'No retained-memory growth after warm-up');
const report={pass:true,version:'2.0.0',environment:'Node VM + native Canvas; 50 saved-base loads, 200 renders; not a full playthrough',wallSeconds:Math.round((Date.now()-started)/1000),samples};
fs.writeFileSync('tests/qa-2.0.0/cache-stress.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
