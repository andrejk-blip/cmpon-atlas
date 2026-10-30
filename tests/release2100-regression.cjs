#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {integrity}=require('./integrity280-regression.cjs');
const {restore}=require('./learning280-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),out=path.join(__dirname,'qa-2.10.0');
(async()=>{
 const entry=readEntry('index.html'),checks=await integrity(entry);fs.writeFileSync(path.join(out,'integrity.json'),JSON.stringify(checks,null,2)+'\n');assert(checks.pass,JSON.stringify(checks.failures));
 const h=await lab(entry),old=await lab(gitEntry('2c007716b5ffc6ba6103bf4e4c7bd99148d6ed2d')),legacy=[];
 for(const mode of ['training','combat','pro'])for(let level=1;level<=14;level++){
  const before=fixture(old,level,mode==='training');old.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);
  for(let n=0;n<60;n++)before.step(1/60,{fire:true});before.pause();const saved=copy(old.pack(before)),e=restore(h,saved);
  assert.deepEqual(copy(h.pack(e)),saved);e.resume();before.resume();
  for(let n=0;n<120;n++){const input={fire:true,moveX:.1,turn:.1};e.step(1/60,input);before.step(1/60,input);}
  if(level===7&&mode!=='training'){assert.equal(e.swarm.balanceVersion,'2.10.0');assert.equal(e.stageKills,before.stageKills);assert.equal(e.player.hp,before.player.hp);assert.equal(e.swarm.waveIndex,before.swarm.waveIndex);legacy.push({level,mode,pass:true,migrated:true});}
  else{assert.deepEqual(copy(h.pack(e).engine),copy(old.pack(before).engine));legacy.push({level,mode,pass:true,exact:true});}
 }
 fs.writeFileSync(path.join(out,'legacy.json'),JSON.stringify({baseline:'2c007716',pass:true,checks:legacy},null,2)+'\n');console.log('PASS '+checks.passed+' integrity checks and '+legacy.length+' legacy continuation checks (40 exact, 2 Swarm migrations)');
})().catch(e=>{console.error(e);process.exitCode=1;});
