#!/usr/bin/env node
'use strict';
// Contract fixtures, explicitly not campaign completion. No production edits.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const state=e=>copy({status:e.status,phase:e.phase,elapsed:e.elapsed,score:e.score,entityId:e.entityId,player:e.player,board:e.board?{pos:e.board.pos,hp:e.board.hp,time:e.board.time,enemies:e.board.enemies,hostile:e.board.hostile,bullets:e.board.bullets,completed:e.board.completed,doors:e.board.doors,baseOps:e.board.baseOps,decks:e.board.decks}:null,escort:e.escort,swarm:e.swarm,pursuit:e.pursuit,finale:e.finale,enemies:e.enemies,hostile:e.hostile,bullets:e.bullets,boss:e.boss,rng:e.random.getState()});
async function lab(entry){const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');return h;}
function fixture(h,id,assist){const e=new h.Engine(417147,()=>{});e.assist=assist;h.arcade.engine=e;e.beginStage(Math.min(3,Math.floor((id-1)/3)));if(id>=12){e.beginFinale();if(id===12)e.launchFinale();else if(id===13)e.beginLair();else e.beginMRG();}else if([2,5,8,11].includes(id))e.beginBoarding();else if([3,6,9].includes(id)){e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();}else e.launch();return e;}
(async()=>{const entry=entrySnapshot(),h=await lab(entry),rows=[];
for(const assist of [false,true])for(let id=1;id<=14;id++){
 const e=fixture(h,id,assist);for(let i=0;i<60;i++)e.step(1/60,{});e.pause();const before=state(e),snapshot=h.pack(e);for(let i=0;i<120;i++)e.step(1/60,{fire:true,moveX:1,turn:1,pulse:true});assert.deepEqual(state(e),before,'Paused mission '+id+' '+assist);
 const other=h.unpack(snapshot,{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.deepEqual(state(other),before,'Load state '+id+' '+assist);e.resume();other.resume();for(let i=0;i<120;i++){const input={fire:true,moveX:.2,turn:.2,pitch:0};e.step(1/60,input);other.step(1/60,input);}assert.deepEqual(state(other),state(e),'Continued save '+id+' '+assist);
 rows.push({level:id,mode:assist?'calm':'normal',pause:true,saveRoundtrip:true,continuedSeconds:2});
}
const oldSha='e25cd4e42eb175dd796d687fae3b26c9f39bf0d9',oldHTML=cp.execFileSync('git',['show',oldSha+':index.html'],{encoding:'utf8',maxBuffer:32*1024*1024}),oldScripts=[...oldHTML.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
const old=await lab({html:oldHTML,scripts:oldScripts,sources:new Map(oldScripts.map(f=>[f,cp.execFileSync('git',['show',oldSha+':'+f],{encoding:'utf8',maxBuffer:32*1024*1024})]))});
const legacy=[];
for(const id of [2,5,8,11,13]){const e=fixture(old,id,false);for(let i=0;i<60;i++)e.step(1/60,{});const before=copy(old.pack(e).engine.board),other=h.unpack(old.pack(e),{seed:417147,mode:'normal'},()=>{});assert(!h.c.CITADEL_BASES.modern(other.board));assert.deepEqual(copy(other.board.definition),before.definition);assert.deepEqual(copy(other.board.enemies),before.enemies);assert.equal(other.board.hp,before.hp);legacy.push({level:id,from:'1.9.3',geometryAndEnemiesPreserved:true});}
const legacyEntry={...entry,scripts:entry.scripts.filter(x=>!x.includes('v2.4.0'))},oldConvoy=await lab(legacyEntry);
for(const id of [3,6,9]){const e=fixture(oldConvoy,id,false);for(let i=0;i<60;i++)e.step(1/60,{fire:true});const other=h.unpack(oldConvoy.pack(e),{seed:417147,mode:'normal'},()=>{});assert(h.c.CITADEL_CONVOY.legacyActive(other));for(let i=0;i<180;i++){e.step(1/60,{fire:true});other.step(1/60,{fire:true});}assert.deepEqual(state(other),state(e));legacy.push({level:id,from:'2.3.1',legacyPhysicsContinues:true,seconds:3});}
if(entry.scripts.includes('assets/citadel-swarm-v2.5.0.js')){
 const oldSwarmEntry={...entry,scripts:entry.scripts.map(x=>x==='assets/citadel-swarm-v2.5.0.js'?'assets/citadel-swarm-v1.9.0.js':x),sources:new Map(entry.sources)};
 oldSwarmEntry.sources.set('assets/citadel-swarm-v1.9.0.js',fs.readFileSync('assets/citadel-swarm-v1.9.0.js','utf8'));
 const oldSwarm=await lab(oldSwarmEntry);
 for(const assist of [false,true]){
  const e=fixture(oldSwarm,7,assist);for(let i=0;i<90;i++)e.step(1/60,{fire:true,turn:.2});
  const other=h.unpack(oldSwarm.pack(e),{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.equal(other.swarm.version,'1.9.0');assert.deepEqual(state(other),state(e));
  for(let i=0;i<180;i++){const input={fire:true,turn:Math.sin(i/60)*.3};e.step(1/60,input);other.step(1/60,input);}assert.deepEqual(state(other),state(e));
  legacy.push({level:7,mode:assist?'calm':'normal',from:'2.4.0 (swarm 1.9.0)',legacyThreeWavePhysicsContinues:true,seconds:3});
 }
}
const tag=process.argv.find(x=>x.startsWith('--tag='))?.slice(6)||'';assert(!tag||/^[a-z0-9-]+$/i.test(tag));
const report={method:'Node VM, all current index scripts. Direct per-mission setup fixtures; pause and save checks are not playthroughs.',passed:rows.length+legacy.length,total:rows.length+legacy.length,rows,legacy};fs.writeFileSync('tests/qa-2.5.0/verifier-contracts'+(tag?'-'+tag:'')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total}));
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
