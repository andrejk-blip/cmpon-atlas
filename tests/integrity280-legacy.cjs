'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {restore,resourceState}=require('./learning280-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
 const entry=readEntry('tests/entry-2.8.0.html'),h=await lab(entry),baseline=gitEntry('5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d'),old=await lab(baseline),checks=[];
 for(const mode of ['training','combat','pro'])for(let level=1;level<=14;level++){
  try{
   const before=fixture(old,level,mode==='training');old.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);
   for(let n=0;n<60;n++)before.step(1/60,{fire:true});before.pause();
   const saved=copy(old.pack(before)),e=restore(h,saved);
   assert.equal(h.c.CITADEL_LEARNING_MODES.getMode(e),mode);assert.deepEqual(copy(h.pack(e)),saved);
   assert.deepEqual(resourceState(e),resourceState(before));e.resume();
   for(let n=0;n<120;n++){e.step(1/60,{fire:true,moveX:.1,turn:.1});assert(Number.isFinite(e.player.hp));assert(e.player.pos.every(Number.isFinite));}
   assert(!h.c.CITADEL_RUNTIME.diagnostic().failures);assert.equal(h.c.CITADEL_LEARNING_MODES.getMode(e),mode);
   checks.push({level,mode,pass:true,status:e.status});
  }catch(err){checks.push({level,mode,pass:false,error:err.stack});}
 }
 const report={pass:checks.every(x=>x.pass),passed:checks.filter(x=>x.pass).length,total:checks.length,method:'Direct 2.7 level-entry fixtures, one second of ordinary inputs, pause, real pack/restore in 2.8, two seconds resumed; not full legacy campaigns.',baseline:'5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d',entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))})),checks};
 fs.writeFileSync(path.join(__dirname,'qa-2.8.0/legacy-continuation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,passed:report.passed,total:report.total,failures:checks.filter(x=>!x.pass)}));if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
