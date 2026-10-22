#!/usr/bin/env node
'use strict';
// Separate save/ranking/retry checks. Uses earned campaign snapshots; retries
// are explicit test actions on active checkpoints, not fabricated death/wins.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
const {readEarned,restore,question}=require('./learning270-verifier.cjs');
const {createController}=require('./helpers/base270-inputs.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0'),copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const next=()=>new Promise(setImmediate),modeAPI=h=>h.c.CITADEL_LEARNING_MODES,answer=e=>({lesson:'citadel-lesson-answer',remark:'citadel-answer',finalcheck:'finale-answer'}[e.status]),advance=e=>({lesson:'citadel-lesson-next',remark:'citadel-remark-next',finalcheck:'finale-check-next'}[e.status]);
function state(h,e){const s=h.pack(e);return copy({engine:s.engine,rng:s.rng});}
async function integrity(entry){
 const rows=[],failures=[];async function test(name,fn){console.log('[integrity] '+name);try{rows.push({name,pass:true,...await fn()});}catch(e){failures.push({name,error:e.message,stack:e.stack?.split('\n').slice(1,4)});}}
 for(const mode of ['training','combat'])await test(mode+'-local-reload-question-feedback-record-isolation',async()=>{
  const h=await lab(entry),api=modeAPI(h),point=readEarned(mode).earned.find(x=>x.kind==='lesson'&&x.index===1);api.setMode(mode);let e=restore(h,point.snapshot);const q=question(h,e).q;
  h.action(answer(e),(q.correct+1)%4);api.saveLocal(e,true);const learned=copy(api.current(e)),score=e.score;
  const oldRecord=copy(h.arcade.record),oldRecordRaw=h.storage.get('cmpon.space3d.records.v1');h.run('saveArcadeRecord()');assert.deepEqual(copy(h.arcade.record),oldRecord);assert.equal(h.storage.get('cmpon.space3d.records.v1'),oldRecordRaw);
  const records=JSON.parse(h.storage.get('cmpon.citadel.quiz.records.v1'));assert.equal(records[mode],Math.floor(score));assert.equal(records[mode==='combat'?'training':'combat'],0,'Quiz categories were mixed');
  const savedStorage=[...h.storage.entries()],fresh=await lab(entry,{beforeScripts({storage}){for(const [k,v]of savedStorage)storage.set(k,v);}});modeAPI(fresh).setMode(mode);fresh.action('learning-continue');await next();e=fresh.arcade.engine;
  // Educational overlays already suspend combat; pause() deliberately leaves
  // them in lesson/remark/finalcheck rather than adding a second pause screen.
  assert(['paused',point.snapshot.engine.status].includes(e.status));if(e.status==='paused')e.resume();assert.deepEqual(copy(modeAPI(fresh).current(e)),learned,'Real local storage reload changed the question or answer');assert.equal(e.score,score);
  fresh.action(answer(e),q.correct);assert.equal(e.score,score,'Reload enabled duplicate reward');assert.equal(fresh.fetchCalls.filter(x=>x.options.method==='POST').length,0);
  return{quizId:q.quizId,score,recordCategory:mode,postRequests:0};
 });
 await test('leaving-pro-local-session-preserves-its-save',async()=>{
  const h=await lab(entry),api=modeAPI(h);api.setMode('pro');h.action('launch-new');await next();await next();assert.equal(h.c.CITADEL_LAUNCH.status().local,true);
  const key='cmpon.citadel.local.v1';assert(h.storage.get(key),'Pro local campaign was not saved');h.action('arcade-menu');const old=h.storage.get(key);h.action('learning-mode','combat');h.action('learning-start');await next();assert.equal(h.c.CITADEL_LAUNCH.status().local,false);
  h.c.document.hidden=true;for(const fn of h.handlers.get('visibilitychange')||[])fn({type:'visibilitychange'});for(const fn of h.windowHandlers.get('pagehide')||[])fn({type:'pagehide'});await next();
  assert.equal(h.storage.get(key),old,'Quiz lifecycle overwrote old pro local checkpoint');assert(h.storage.has('cmpon.citadel.quiz.run.v1.combat'));return{preservedKey:key};
 });
 for(const mode of ['training','combat'])for(const checkpoint of ['stage','escort','finale'])await test(mode+'-'+checkpoint+'-three-retries',async()=>{
  const h=await lab(entry),api=modeAPI(h);api.setMode(mode);const points=readEarned(mode).earned;
  const source=checkpoint==='finale'?points.find(x=>x.kind==='final'&&x.index===2):points.find(x=>x.kind==='remark'&&x.index===2);let e=restore(h,source.snapshot),earnedWalkFrames=0;
  if(checkpoint==='escort'){
   const q=question(h,e).q;h.action(answer(e),q.correct);h.action(advance(e));h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};const control=createController(h,{reaction:.2});
   for(;earnedWalkFrames<60*30&&e.status==='boarding';earnedWalkFrames++){e.step(1/60,control(e));assert(!['lost','crashing'].includes(e.status));}
   assert.equal(e.status,'stageclear','Ordinary exit walking did not reach convoy preparation');h.action('citadel-upgrade','weapons');e.next();assert.equal(e.phase,'escort');
  }
  let expected=null;const retries=[];
  for(let n=0;n<3;n++){
   h.action('citadel-retry');e=h.arcade.engine;assert.equal(api.getMode(e),mode);assert.equal(e.assist,mode==='training');assert(api.usesQuiz(e));
   const current={score:e.score,answers:copy(e.quiz270.answers),cards:copy(e.quiz270.cards),points:e.quiz270.points,phase:e.phase,stage:e.stage,finale:e.finale?.phase||null};
   if(!expected)expected=current;else assert.deepEqual(current,expected,'Repeated retry changed the rollback boundary');
   const packed=h.pack(e),reloaded=restore(h,packed);assert.deepEqual(copy(reloaded.quiz270),copy(e.quiz270));e=reloaded;retries.push({score:e.score,count:api.count(e),phase:e.phase,status:e.status});
  }
  return{retries,earnedWalkFrames,method:checkpoint==='escort'?'Earned last base-card snapshot, ordinary answer/exit movement/upgrade then explicit retry actions.':'Earned educational checkpoint followed by explicit retry actions; no enemy/player HP writes.'};
 });
 for(const mode of ['training','combat','pro'])for(let level=1;level<=14;level++)await test(mode+'-'+level+'-pause-save-continuation',async()=>{
  const h=await lab(entry),api=modeAPI(h),e=fixture(h,level,mode==='training');api.setEngineMode(e,mode);for(let i=0;i<30;i++)e.step(1/60,{});e.pause();const saved=h.pack(e),paused=state(h,e);
  for(let i=0;i<60;i++)e.step(1/60,{fire:true,missile:true,pulse:true,moveX:1,turn:1});assert.deepEqual(state(h,e),paused);
  const other=restore(h,saved);assert.deepEqual(state(h,other),paused);e.resume();other.resume();
  for(let i=0;i<60;i++){const input={fire:true,moveX:.1,turn:.1};h.arcade.engine=e;e.step(1/60,input);h.arcade.engine=other;other.step(1/60,input);}
  assert.deepEqual(state(h,other),state(h,e));return{level,mode,continuedSeconds:1,method:'Direct level entry fixture, then ordinary inputs; not a campaign.'};
 });
 return{pass:!failures.length,passed:rows.length,failed:failures.length,rows,failures,method:'Node VM, mock DOM/network, production save/restore and command routing. No browser/device timing claim.'};
}
async function main(){const arg=n=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3),file=arg('entry');assert(file);const entry=readEntry(file),result=await integrity(entry),tag=arg('tag')||'integrity';Object.assign(result,{entryFile:file,entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))}))});fs.mkdirSync(out,{recursive:true});const report=path.join(out,'learning-'+tag+'.json');fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({report,pass:result.pass,passed:result.passed,failed:result.failed,failures:result.failures}));if(!result.pass)process.exitCode=1;}
module.exports={integrity};if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
