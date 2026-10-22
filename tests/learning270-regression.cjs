#!/usr/bin/env node
'use strict';
// Targeted state-contract fixtures. They do not claim mission completion.
// Full input-only campaigns are independently exercised by learning270-verifier.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab}=require('./release260-verifier.cjs');
const root=path.resolve(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const file='tests/entry-2.7.0.html',entry=readEntry(file),results=[];
const action={lesson:'citadel-lesson-answer',remark:'citadel-answer',final:'finale-answer'},next={lesson:'citadel-lesson-next',remark:'citadel-remark-next',final:'finale-check-next'};
function make(h,mode,kind){const e=new h.Engine(417147,()=>{});h.arcade.engine=e;h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);e.beginStage(kind==='final'?3:0);
 if(kind==='lesson'){e.lesson={caseIndex:0,stage:0,reqId:e.plan[0][0],attempts:0,feedback:null,solved:false,readClock:0};e.status='lesson';}
 else if(kind==='remark'){e.beginBoarding();e.board.question=0;e.board.answered=false;e.status='remark';}
 else{e.beginFinale();e.beginLair();e.status='finalcheck';}
 return e;
}
const resources=e=>copy({player:e.player,board:e.board?{hp:e.board.hp,energy:e.board.energy,enemies:e.board.enemies,hostile:e.board.hostile,bullets:e.board.bullets}:null,overdriveUntil:e.overdriveUntil??null});
async function main(){const h=await lab(entry),api=h.c.CITADEL_LEARNING_MODES;assert(api);
 async function test(name,fn){try{results.push({name,pass:true,...await fn()});}catch(e){results.push({name,pass:false,error:e.stack});}}
 await test('all-84-questions-reachable-through-23-points',()=>{const reached=new Set(),tiers={};for(let seed=1;seed<=256;seed++){const e={seed,educationMode:'combat',educationLegacyCases:false};const seen=new Set();
   for(const [kind,n]of[['lesson',8],['remark',12],['final',3]])for(let i=0;i<n;i++){const q=api.getCase(e,kind,i);assert(!seen.has(q.quizId));seen.add(q.quizId);reached.add(q.quizId);const s=e.quiz270.cards[kind+':'+i];assert.equal(s.tier,s.level+(kind!=='lesson'&&i%3===2?1:0));tiers[kind+':'+i]=s.tier;}assert.equal(seen.size,23);}
  assert.equal(reached.size,84);return{seeds:256,uniqueQuestions:reached.size,tiers};});
 for(const mode of ['training','combat'])for(const kind of ['lesson','remark','final'])await test(mode+'-'+kind+'-answer-save-continue',()=>{
  const e=make(h,mode,kind),q=api.current(e).q,before=resources(e),score=e.score;assert.equal(q.choices.length,4);h.action(action[kind],(q.correct+1)%4);
  assert.equal(e.score,score);assert.deepEqual(resources(e),before);assert(api.current(e).feedback);assert.equal(api.count(e),1);assert(h.overlay().includes('learning-quiz'));assert(h.overlay().includes('Продолжить'));
  const saved=copy(h.pack(e));h.action(action[kind],q.correct);assert.deepEqual(copy(h.pack(e)),saved);
  const restored=h.unpack(saved,{seed:e.seed,mode:e.assist?'calm':'normal'},()=>{});h.arcade.engine=restored;assert.deepEqual(copy(h.pack(restored).engine),saved.engine);assert.equal(api.current(restored).q.quizId,q.quizId);
  h.action(action[kind],q.correct);assert.deepEqual(copy(h.pack(restored).engine),saved.engine);h.action(next[kind]);assert(!['lesson','remark','finalcheck'].includes(restored.status));
  const afterWrong=resources(restored),correct=make(h,mode,kind);h.action(action[kind],q.correct);assert.equal(correct.score,score+q.quizPoints);assert.deepEqual(resources(correct),before);h.action(next[kind]);assert.deepEqual(resources(correct),afterWrong);
  const continued=copy(h.pack(correct)),continuedRestore=h.unpack(continued,{seed:correct.seed,mode:correct.assist?'calm':'normal'},()=>{});assert.deepEqual(copy(h.pack(continuedRestore).engine),continued.engine,'Continue snapshot must restore exactly before the next simulation frame');
  if(kind==='lesson'){assert.equal(correct.overdriveUntil,correct.elapsed+12);assert.equal(copy(h.pack(correct)).engine.overdriveUntil,correct.overdriveUntil);}
  return{points:q.quizPoints,quizId:q.quizId};
 });
 await test('professional-cases-unchanged',()=>{for(const kind of ['lesson','remark','final']){const e=make(h,'pro',kind),q=api.current(e).q;assert(!q.quizId);assert(!api.usesQuiz(e));assert.equal(e.assist,false);const before=e.score;h.action(action[kind],q.correct);if(kind==='final')h.action(next[kind]);assert(e.score>before);}return{};});
 await test('legacy-save-migration',()=>{for(const calm of [false,true]){const e=make(h,calm?'training':'combat','lesson'),s=copy(h.pack(e));delete s.engine.educationMode;delete s.engine.educationLegacyCases;delete s.engine.quiz270;const r=h.unpack(s,{seed:e.seed,mode:calm?'calm':'normal'},()=>{});h.arcade.engine=r;assert(r.educationLegacyCases);assert.equal(api.getMode(r),calm?'training':'pro');assert(!api.usesQuiz(r));assert(!api.current(r).q.quizId);}return{};});
 await test('repeated-retry-rolls-score-and-answers-back-together',()=>{let e=make(h,'combat','lesson');for(let round=0;round<3;round++){
  if(round){e.lesson={caseIndex:0,stage:0,reqId:e.plan[0][0],attempts:0,feedback:null,solved:false,readClock:0};e.status='lesson';}
  h.action(action.lesson,api.current(e).q.correct);h.action(next.lesson);assert.equal(api.count(e),1);h.run('citadelRetry()');e=h.arcade.engine;assert.equal(api.getMode(e),'combat');assert.equal(e.score,0);assert.equal(api.count(e),0);assert(e.stageStart.learning270);}
  return{retries:3};});
 await test('default-local-launch-preserves-cloud-and-old-save',async()=>{
  const oldRun={id:'preserve-run',mode:'normal',status:'active',seed:417147},oldQueue=[{id:'preserve-run',snapshot:{sentinel:true}}];h.cup.run=oldRun;h.cup.queue=oldQueue;h.cup.attached=true;h.cup.token='preserve-token';h.storage.set('cmpon.citadel.local.v1','legacy-checkpoint');h.storage.set('cmpon.cup.outbox.v1','legacy-outbox');h.storage.set('cmpon.cup.session.v1','legacy-session');
  h.arcade.engine=new h.Engine(417147,()=>{});api.setMode('combat');h.fetchCalls.length=0;h.action('learning-start');await new Promise(setImmediate);
  assert.equal(h.cup.run,oldRun);assert.equal(h.cup.queue,oldQueue);assert.equal(h.cup.attached,false);assert.equal(h.cup.token,'preserve-token');assert.equal(h.storage.get('cmpon.citadel.local.v1'),'legacy-checkpoint');assert.equal(h.storage.get('cmpon.cup.outbox.v1'),'legacy-outbox');assert.equal(h.storage.get('cmpon.cup.session.v1'),'legacy-session');assert.equal(h.fetchCalls.filter(x=>x.options.method==='POST').length,0);assert.equal(api.getMode(h.arcade.engine),'combat');
  return{};
 });
 await test('paused-local-restore-does-not-toggle',()=>{const e=make(h,'combat','lesson');h.action(action.lesson,api.current(e).q.correct);h.action(next.lesson);e.pause();api.saveLocal(e,true);h.arcade.engine=new h.Engine(417147,()=>{});h.action('learning-continue');assert.equal(h.arcade.engine.status,'paused');assert.equal(h.arcade.engine.resumeStatus,'playing');return{};});
 await test('won-record-write-is-bounded-and-preserves-legacy',()=>{const e=make(h,'combat','lesson');let writes=0;const original=h.c.localStorage.setItem;h.c.localStorage.setItem=(k,v)=>{if(k==='cmpon.citadel.quiz.records.v1')writes++;original(k,v);};
  // Isolated victory-event contract, not a gameplay win.
  e.score=1234;e.status='won';h.storage.set(h.run('CITADEL_SAVE_KEY'),'legacy-checkpoint');h.run('arcadeEvent("state","won")');for(let i=0;i<180;i++)e.step(1/60,{});assert.equal(writes,1);assert.equal(h.storage.get(h.run('CITADEL_SAVE_KEY')),'legacy-checkpoint');h.c.localStorage.setItem=original;return{frames:180,recordWrites:writes};});
 await test('story-menu-and-hud-modes',()=>{h.arcade.engine=new h.Engine(417147,()=>{});api.setMode('combat');h.c.CITADEL_STORY.open();assert(h.overlay().includes('citadel-prologue'));h.c.CITADEL_STORY.close();for(const mode of ['training','combat','pro']){h.arcade.engine=new h.Engine(417147,()=>{});api.setMode(mode);assert.equal((h.overlay().match(/class="learning-mode-picker"/g)||[]).length,1);const e=make(h,mode,'lesson');h.update();assert(h.nodes.get('arcade-stage-label').textContent.includes(api.labels[mode].toUpperCase()));}return{};});
 const report={version:'2.7.0',method:'Node VM targeted card/state/network fixtures; not gameplay completion or real browser layout.',pass:results.every(x=>x.pass),results,sources:entry.scripts.filter(x=>/learning-modes|quiz-bank|launch-v2.7/.test(x)).map(x=>({file:x,sha256:crypto.createHash('sha256').update(entry.sources.get(x)).digest('hex')}))};
 fs.mkdirSync(path.join(__dirname,'qa-2.7.0'),{recursive:true});fs.writeFileSync(path.join(__dirname,'qa-2.7.0','learning-targeted.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
