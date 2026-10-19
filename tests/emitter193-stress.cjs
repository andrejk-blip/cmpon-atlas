#!/usr/bin/env node
'use strict';
// Structural emitter test: zero-delta updates intentionally avoid pretending
// this is elapsed gameplay. Full ordinary-input campaigns are separate.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const immediate=()=>new Promise(setImmediate),report={kind:'structural-zero-delta-stress',runs:[]};
(async()=>{for(const baseline of [true,false]){
 const entry=entrySnapshot();entry.scripts=entry.scripts.filter(f=>!f.includes('citadel-runtime-'));
 if(baseline)for(const family of ['comic','sfx']){const modern='assets/citadel-'+family+'-v1.9.3.js',old=modern.replace('1.9.3','1.9.1');entry.scripts[entry.scripts.indexOf(modern)]=old;entry.sources.set(old,fs.readFileSync(old,'utf8'));}
 const h=entryHarness(entry);await immediate();h.cup.panel=null;h.arcade.sound=true;
 const e=new h.Engine(417147,()=>{});h.arcade.engine=e;e.start(false);while(h.c.CITADEL_STORY.status(e).active)h.action('story-next');h.action('citadel-launch');
 const count=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,v)=>n+v.length,0);
 const initialListeners=count();let changes=0,last=e.emit,error=null,steps=0;const samples=[],started=performance.now();
 try{for(;steps<(baseline?12000:360000);steps++){
  e.step(0,{});if(e.emit!==last){changes++;last=e.emit;}if(steps%20===0)e.emit('qa-probe');
  if(!baseline&&steps%10000===0){for(const f of ['citadel-music-v1.4.2.js','citadel-sfx-v1.9.3.js','citadel-voice-v1.9.0.js','citadel-comic-v1.9.3.js'])vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),h.c,{filename:'assets/'+f});assert.equal(count(),initialListeners);if(global.gc)global.gc();samples.push({steps,listeners:count(),heap:process.memoryUsage().heapUsed});await immediate();}
 }}catch(err){error={type:err.name,message:err.message,stack:err.stack?.split('\n').slice(0,8)};}
 report.runs.push({baseline,steps,emitChanges:changes,error,wallSeconds:+((performance.now()-started)/1000).toFixed(2),globalListeners:count(),initialListeners,samples});
 if(baseline)assert.equal(error?.type,'RangeError');else{assert.equal(error,null);assert.equal(changes,0);assert.equal(steps,360000);}
}
report.pass=true;fs.writeFileSync('tests/qa-1.9.3/emitter-stress.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.runs.map(({samples,...r})=>({...r,samples:samples.length})),null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
