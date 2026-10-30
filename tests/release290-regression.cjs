#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {integrity}=require('./integrity280-regression.cjs');
const {restore}=require('./learning280-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),out=path.join(__dirname,'qa-2.9.0');
(async()=>{
 const entry=readEntry('index.html'),checks=await integrity(entry);fs.writeFileSync(path.join(out,'integrity.json'),JSON.stringify(checks,null,2)+'\n');assert(checks.pass,JSON.stringify(checks.failures));
 const h=await lab(entry),old=await lab(gitEntry('d278bf15adca59903e5a8e5df7111df403d4120d')),legacy=[];
 for(const mode of ['training','combat','pro'])for(let level=1;level<=14;level++){
  const before=fixture(old,level,mode==='training');old.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);
  for(let n=0;n<60;n++)before.step(1/60,{fire:true});before.pause();const saved=copy(old.pack(before)),e=restore(h,saved);
  assert.deepEqual(copy(h.pack(e)),saved);e.resume();before.resume();
  for(let n=0;n<120;n++){const input={fire:true,moveX:.1,turn:.1};e.step(1/60,input);before.step(1/60,input);}
  assert.deepEqual(copy(h.pack(e).engine),copy(old.pack(before).engine));legacy.push({level,mode,pass:true});
 }
 fs.writeFileSync(path.join(out,'legacy.json'),JSON.stringify({baseline:'d278bf1',pass:true,checks:legacy},null,2)+'\n');console.log('PASS '+checks.passed+' integrity checks and '+legacy.length+' exact legacy continuations');
})().catch(e=>{console.error(e);process.exitCode=1;});
