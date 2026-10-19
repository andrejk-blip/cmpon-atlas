#!/usr/bin/env node
'use strict';
// Real checkpoint + mobile input mapping, simulated pointer/joystick state.
// No claim of a physical phone, touch latency or native gestures.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createDeckController}=require('./helpers/campaign-inputs.js');
(async()=>{
 const entry=entrySnapshot(),h=entryHarness(entry),rows=[];await new Promise(r=>setImmediate(r));
 h.cup.panel=null;h.arcade.sound=false;h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
 for(const mode of ['normal','calm'])for(const level of [2,5,8,11,13]){
  const saved=JSON.parse(fs.readFileSync('tests/qa-2.0.0/checkpoint-'+mode+'-'+level+'.json','utf8'));
  const e=h.unpack(saved,{seed:417147,mode},()=>{});h.arcade.engine=e;
  const controller=createDeckController(h,{mobile:true}),start=e.elapsed;let frames=0,cards=0,minHp=100;
  while(frames++<60*300){
   if(['stageclear','escortbrief','finalebrief'].includes(e.status)||e.phase==='escort'||e.finale?.phase==='mrg')break;
   if(h.c.CITADEL_STORY.status(e).active){h.action('story-next');continue;}
   assert(!['lost','crashing'].includes(e.status),'Mobile pilot survived '+mode+'/'+level);
   if(e.status==='remark'){
    const q=h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)');h.action('citadel-answer',q.correct);h.action('citadel-remark-next');cards++;continue;
   }
   if(e.status==='finalcheck'){const q=h.run('FINALE_TRIALS[ARCADE.engine.board.completed.length]');h.action('finale-answer',q.correct);h.action('finale-check-next');cards++;continue;}
   if(!e.board)throw Error(JSON.stringify({mode,level,status:e.status,phase:e.phase,stage:e.stage,cards,frames}));
   minHp=Math.min(minHp,e.board.hp);e.step(1/60,controller(e));
  }
  assert(['stageclear','escortbrief','finalebrief'].includes(e.status)||e.phase==='escort'||e.finale?.phase==='mrg','All three sectors and the exit must complete');assert.equal(cards,3);
  rows.push({mode,level,pass:true,cards,seconds:+(e.elapsed-start).toFixed(2),minHp:+minHp.toFixed(2),frames});
 }
 const report={version:'2.0.0',pass:true,environment:'Node VM, simulated mobile input mapping; synthetic checkpoints reached by full campaign inputs',rows};
 fs.writeFileSync('tests/qa-2.0.0/touch-bases.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
