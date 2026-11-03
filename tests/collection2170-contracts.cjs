'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {lab,readEntry}=require('./release260-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const h=await lab(readEntry('index.html')),C=h.c.CITADEL_CAMPAIGN,L=h.c.CITADEL_LEARNING_MODES,A=h.c.CITADEL_COLLECTION,Q=h.c.CITADEL_QUIZ_UI,rows=[];
 async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}}
 function make(mode,kind,index=0){const e=new h.Engine(417147,()=>{});h.arcade.engine=e;L.setEngineMode(e,mode);e.beginStage(kind==='final'?3:0);
  if(kind==='lesson'){e.lesson={caseIndex:index,stage:0,reqId:e.plan[0][0],attempts:0,feedback:null,solved:false,readClock:0};e.status='lesson';}
  else if(kind==='remark'){e.beginBoarding();e.board.question=index;e.board.answered=false;e.status='remark';}
  else {e.beginFinale();e.beginLair();e.board.completed=Array.from({length:index},(_,i)=>i);e.status='finalcheck';}return e;
 }
 for(const mode of ['training','combat','pro'])for(const kind of ['lesson','remark','final'])await test(mode+' '+kind+' preserves answer and continuation rules',()=>{
  const e=make(mode,kind),c=Q.current(e),wrong=(c.correct+1)%c.choices.length,score=e.score;
  assert(h.overlay().includes('quiz2170'));assert(!h.overlay().includes('class="review-card'));
  h.action(c.answer,wrong);let result=Q.current(e);assert(result.feedback&&!result.feedback.correct);assert.equal(result.retry,mode==='pro');
  const answered=copy(h.pack(e));h.action(c.answer,c.correct);assert.deepEqual(copy(h.pack(e)),answered,'Double answer must not mutate score/state');
  const restored=h.unpack(answered,{seed:e.seed,mode:e.assist?'calm':'normal'},()=>{});h.arcade.engine=restored;assert(Q.current(restored).feedback);assert.equal(Q.current(restored).q.caseId,c.q.caseId);
  h.action(result.next);if(mode==='pro'){assert(Q.current(restored)&&!Q.current(restored).feedback);h.action(c.answer,c.correct);h.action(Q.current(restored).next);}else assert.equal(restored.score,score);
  assert(!['lesson','remark','finalcheck'].includes(restored.status));
 });
 for(const id of ['convoy1','route','convoy3','parallax','contradictions'])await test('campaign '+id+' uses exact choices and valid answers',()=>{
  for(const answer of [0,1,2]){const e=make('combat','lesson');C.enable(e);e.campaign2120.card={mission:id,answer:null,correct:null};e.status='campaigncard';A.observe(e);const c=Q.current(e);assert.equal(c.choices.length,3);h.action('campaign-answer',answer);assert.equal(Q.current(e).feedback.correct,Array.isArray(c.correct)?c.correct.includes(answer):answer===c.correct);assert.equal((h.overlay().match(/disabled/g)||[]).length,3);if(id==='contradictions'&&answer===2){h.action('campaign-card-next');assert.equal(e.status,'campaigncard');assert.equal(e.campaign2120.card.answer,null);}}
 });
 await test('new campaign opens comic; closing keeps stage frozen and allows launch',()=>{
  h.action('arcade-menu');L.setMode('training');h.action('learning-start');const e=h.arcade.engine;assert.equal(e.campaign2120.modal.id,'departure');const before=copy(h.pack(e));for(let i=0;i<60;i++)e.step(1/60,{fire:true});assert.deepEqual(copy(h.pack(e)),before);h.action('collection2170-comic-next');assert.equal(e.campaign2120.modal.page,1);h.action('collection2170-close');assert(e.campaign2120.story2170.seen.departure);assert.equal(e.status,'briefing');h.action('citadel-launch');assert.equal(e.status,'playing');
 });
 await test('awards persist across campaigns; practice earns nothing; skip earns no victory',()=>{
  const e=h.arcade.engine;e.campaign2120.practice={};const before=A.profile();e.campaign2120.encounters.hammer=true;A.observe(e);assert.deepEqual(A.profile(),before);e.campaign2120.practice=null;
  C.complete(e,'parallax');e.campaign2120.skipped2140={parallax:true};A.observe(e);assert(!A.profile().achievements.beacons);
  delete e.campaign2120.skipped2140.parallax;A.observe(e);assert(A.profile().achievements.beacons);const earned=A.profile();L.setMode('combat');h.action('learning-start');assert.deepEqual(A.profile(),earned);assert(h.storage.has(A.storageKey));
 });
 await test('older snapshots backfill rewards without replaying every past scene',()=>{
  const e=h.arcade.engine;e.campaign2120.modal=null;e.campaign2120.completed=['orbit1','base1','convoy1','pursuit'];delete e.campaign2120.story2170;
  const r=h.unpack(copy(h.pack(e)),{seed:e.seed,mode:'normal'},()=>{});h.arcade.engine=r;A.observe(r);assert(!r.campaign2120.modal);assert(r.campaign2120.story2170.seen.rift);assert(A.profile().comics.rift);assert(A.profile().cards.robodog);
 });
 await test('all cards and all story milestones are reachable; replay cannot move gameplay',()=>{
  const e=h.arcade.engine;e.campaign2120.completed=C.ids.slice();e.campaign2120.encounters=Object.fromEntries(['hammer','tentacle','maw','mantis','medusa'].map(k=>[k,true]));e.campaign2120.story2170={seen:Object.fromEntries(A.comics.map(c=>[c.id,true]))};e.campaign2120.modal=null;e.status='paused';A.observe(e);assert.equal(Object.keys(A.profile().cards).length,17);assert.equal(Object.keys(A.profile().comics).length,7);assert.equal(Object.keys(A.profile().achievements).length,8);
  h.action('collection2170-open','comics');h.action('collection2170-comic','final');assert.equal(e.campaign2120.modal.id,'final');const score=e.score,completed=copy(e.campaign2120.completed);for(let i=0;i<4;i++)h.action('collection2170-comic-next');assert.equal(e.campaign2120.modal.type,'collection2170');assert.equal(e.score,score);assert.deepEqual(copy(e.campaign2120.completed),completed);
 });
 await test('keyboard selects one exact choice, blocks repeat and respects modal',()=>{
  const e=make('combat','lesson'),c=Q.current(e),handlers=h.windowHandlers.get('keydown'),handler=handlers[handlers.length-1];let stopped=false;handler({code:'KeyD',target:{tagName:'DIV'},preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert(stopped);assert.equal(Q.current(e).feedback.index,3);
 });
 const report={version:'2.17.0',pass:rows.every(r=>r.pass),method:'Isolated state fixtures, not campaign completion or browser layout',rows};fs.mkdirSync('tests/qa-2.17.0',{recursive:true});fs.writeFileSync('tests/qa-2.17.0/contracts.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
})();
