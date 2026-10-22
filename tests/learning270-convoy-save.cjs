#!/usr/bin/env node
'use strict';
// Starts from independently earned final terminal snapshots. The exit is
// reached with ordinary movement, then retry/reload is checked explicitly.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab}=require('./release260-verifier.cjs');
const {readEarned,restore,question}=require('./learning270-verifier.cjs');
const {createController}=require('./helpers/base270-inputs.js');
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){const entry=readEntry('tests/entry-2.7.0.html'),h=await lab(entry),api=h.c.CITADEL_LEARNING_MODES,rows=[];
 h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
 for(const mode of ['training','combat'])for(const stage of [0,1,2]){api.setMode(mode);const source=readEarned(mode).earned.find(x=>x.kind==='remark'&&x.index===stage*3+2);assert(source);let e=restore(h,source.snapshot);
  h.action('citadel-answer',question(h,e).q.correct);h.action('citadel-remark-next');const control=createController(h,{reaction:.2});let frames=0;
  for(;frames<60*60&&e.status==='boarding';frames++){e.step(1/60,control(e));assert.notEqual(e.status,'lost');}
  assert.equal(e.status,'stageclear','Walk to exit failed');h.action('citadel-upgrade','weapons');e.next();assert.equal(e.phase,'escort');
  const expected={score:e.escortStart.score,quiz:copy(e.escortStart.quiz270),stage:e.stage};const retries=[];
  for(let n=0;n<3;n++){h.action('citadel-retry');e=h.arcade.engine;assert.equal(e.phase,'escort');assert.equal(api.getMode(e),mode);assert.equal(e.score,expected.score);assert.equal(e.stage,expected.stage);assert.deepEqual(copy(e.quiz270),expected.quiz);
   const saved=copy(h.pack(e));assert(saved.engine.escortStart,'Convoy retry checkpoint must be serialized');e=restore(h,saved);assert.deepEqual(copy(e.escortStart),saved.engine.escortStart);assert.deepEqual(copy(e.quiz270),expected.quiz);assert.equal(e.phase,'escort');
   retries.push({retry:n+1,score:e.score,answered:api.count(e),phase:e.phase,status:e.status});
  }
  rows.push({mode,level:stage*3+3,exitWalkFrames:frames,retries});
 }
 const files=['assets/citadel-learning-modes-v2.7.0.js','assets/citadel-quiz-bank-v2.7.0.js'],report={pass:true,method:'Node VM. Earned terminal checkpoints, ordinary exit walking and upgrade; three explicit retry/save/reload cycles per convoy and mode. No health/ammo/objective edits.',cases:rows.length,retryReloadCycles:rows.length*3,rows,sources:files.map(file=>({file,sha256:sha(entry.sources.get(file))}))};
 const file=path.join(__dirname,'qa-2.7.0','learning-convoy-save.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,pass:true,cases:report.cases,retryReloadCycles:report.retryReloadCycles}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
