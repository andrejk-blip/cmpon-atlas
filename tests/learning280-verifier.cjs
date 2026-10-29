#!/usr/bin/env node
'use strict';
// Independent checks for the three educational modes. Full campaigns use only
// movement/weapon/interaction commands. The exact-state QA pilot reads enemy
// positions and answer keys; it is not a human or a measure of learning.
// Follow-up answer/save contracts use checkpoints earned by those campaigns.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {readEntry,gitEntry,lab,fixture,listenerState}=require('./release260-verifier.cjs');
const {play}=require('./helpers/campaign270-runner.cjs');
const {createController:createBase}=require('./helpers/base270-inputs.js');
const {createController:createSwarm}=require('./helpers/swarm270-inputs.js');
const {createOrbitalController}=require('./helpers/orbital280-inputs.js');
const {pilot}=require('./helpers/convoy260-inputs.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.8.0');
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const next=()=>new Promise(setImmediate),modes=['training','combat','pro'];
function modeAPI(h){const api=h.c.CITADEL_LEARNING_MODES;assert(api,'Learning modes module must be in the exact entry');return api;}
function question(h,e){
 const api=modeAPI(h),live=api.current(e);
 if(api.usesQuiz(e)){assert(live&&live.q,'Every educational point must have a quiz question');return live;}
 if(e.status==='lesson')return{kind:'lesson',index:e.lesson.caseIndex,q:h.lessonCase(e,e.lesson.caseIndex)};
 if(e.status==='remark')return{kind:'remark',index:e.board.question,q:h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)')};
 if(e.status==='finalcheck')return{kind:'final',index:e.board.completed.length,q:h.run('citadelFinalCase(ARCADE.engine.board.completed.length)')};
 throw Error('Not at an educational checkpoint: '+e.status);
}
const answerAction=e=>({lesson:'citadel-lesson-answer',remark:'citadel-answer',finalcheck:'finale-answer'}[e.status]);
const continueAction=e=>({lesson:'citadel-lesson-next',remark:'citadel-remark-next',finalcheck:'finale-check-next'}[e.status]);
function packed(h,e){return copy(h.pack(e));}
function state(h,e){const s=packed(h,e);return{engine:s.engine,rng:s.rng};}
function restore(h,snapshot){const e=h.unpack(copy(snapshot),{seed:snapshot.engine.seed,mode:snapshot.engine.assist?'calm':'normal'},()=>{});h.arcade.engine=e;return e;}
function entryEvidence(entry){return{entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))}))};}
function resourceState(e){
 return copy({player:e.player,overdriveUntil:e.overdriveUntil,board:e.board?{hp:e.board.hp,energy:e.board.energy,pos:e.board.pos,enemies:e.board.enemies,hostile:e.board.hostile,bullets:e.board.bullets}:null,
  enemies:e.enemies,hostile:e.hostile,bullets:e.bullets,upgrades:e.upgrades,stationHp:e.stationHp,totalKills:e.totalKills,elapsed:e.elapsed,phase:e.phase,status:e.status});
}
function educationalProgress(e){return copy({status:e.status,phase:e.phase,stage:e.stage,completed:e.board?.completed,rescued:e.rescued,completedRemarks:e.completedRemarks,decisions:e.decisions.map(x=>({reqId:x.reqId,caseIndex:x.caseIndex,stage:x.stage})),lessonQueue:e.lessonQueue,finaleTests:e.finale?.tests});}
// overdriveUntil was an old, real combat field missing from old CUP saves. The
// new module preserves it. Remove that newly serializable field only when
// comparing historical pack formats, not when comparing live combat resources.
function withoutLearning(value){if(Array.isArray(value))return value.map(withoutLearning);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([key])=>!['educationMode','educationLegacyCases','quiz270','overdriveUntil'].includes(key)).map(([key,v])=>[key,withoutLearning(v)]));}
function legacyEntry(entry){const scripts=entry.scripts.filter(f=>!/citadel-(quiz-bank|learning-modes)-v2\.7\.0\.js$/.test(f));return{html:entry.html,scripts,sources:new Map(scripts.map(f=>[f,entry.sources.get(f)]))};}
function coreQuestion(h,e){if(e.status==='lesson')return h.lessonCase(e,e.lesson.caseIndex);if(e.status==='remark')return h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)');return h.run('citadelFinalCase(ARCADE.engine.board.completed.length)');}

async function campaign(entry,mode,options={}){
 assert(modes.includes(mode));const assist=mode==='training',operators={base:new WeakMap(),swarm:new WeakMap(),orbit:new WeakMap(),convoy:new WeakMap()};
 const earned=[],samples=[],seen=new Set();let nextSample=0,initialListeners=null,emitter=null,emitterChanges=0,finalNetwork=[],storageKeys=[];
 function operator(which,key,create){let fn=operators[which].get(key);if(!fn){fn=create();operators[which].set(key,fn);}return fn;}
 const result=await play(assist,417147,{entry,fps:options.fps||60,sound:false,progress:!!options.progress,
  initialize({h,e}){modeAPI(h).setEngineMode(e,mode);},
  education({h,e,id}){
   const live=question(h,e),q=live.q,key=[e.status,live.index].join('/');assert(!seen.has(key),'An educational point was presented twice: '+key);seen.add(key);
   if(e.status!=='lesson')assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0,'Terminal must follow ordinary combat clearance');
   earned.push({level:id,mode,kind:live.kind,index:live.index,question:copy(q),snapshot:packed(h,e)});
   const action=answerAction(e),advance=continueAction(e);h.action(action,q.correct);h.action(advance);
   return{kind:live.kind,index:live.index,quizId:q.quizId||null,title:q.question||q.q||q.title||q.situation,correct:q.correct};
  },
  boardInput({h,e}){return operator('base',e,()=>createBase(h,{reaction:.2,mobile:false}))(e);},
  swarmInput({h,e}){return operator('swarm',e,()=>createSwarm(h.c.CITADEL_SWARM,{reaction:.2,mobile:false}))(e);},
  flightInput({h,e,input}){
   if(h.c.CITADEL_CONVOY.active(e))return operator('convoy',e.escort,()=>pilot(h,e,{reaction:.35,device:'joystick'})).input();
   return assist?input:operator('orbit',e,()=>createOrbitalController(h))(e);
  },
  observe({h,e,id,frame}){
   assert.equal(modeAPI(h).getMode(e),mode,'Education mode changed during campaign');assert.equal(e.assist,assist,'Mode physics changed');
   if(emitter&&emitter!==e.emit)emitterChanges++;emitter=e.emit;
   assert((e.board?.missions270?.events?.length||0)<=48);assert((e.swarm?.events?.length||0)<=24);
   if(e.elapsed<nextSample)return;nextSample=e.elapsed+30;if(global.gc)global.gc();
   const listeners=listenerState(h);initialListeners??=listeners;assert.deepEqual(listeners,initialListeners,'Listener count changed during campaign');
   const rt=h.c.CITADEL_RUNTIME?.diagnostic();assert((rt?.events?.length||0)<=64);
   samples.push({level:id,frame,seconds:+e.elapsed.toFixed(2),heapUsed:process.memoryUsage().heapUsed,listeners,
    missionEvents:e.board?.missions270?.events?.length||0,swarmEvents:e.swarm?.events?.length||0,runtimeEvents:rt?.events?.length||0});
  },
  finished({h}){finalNetwork=copy(h.fetchCalls);storageKeys=[...h.storage.keys()];}
 });
 result.educationMode=mode;result.physicsMode=assist?'calm':'normal';result.educationCheckpoints=earned.length;
 result.stress={method:'Node VM logic, mocked DOM listeners, whole-process heap including checkpoints and reports; no browser/device frame-time claim.',forcedGC:!!global.gc,emitterChanges,samples};
 result.network={postRequests:finalNetwork.filter(x=>String(x.options.method).toUpperCase()==='POST').map(x=>({endpoint:x.endpoint,body:x.options.body})),endpoints:[...new Set(finalNetwork.map(x=>x.endpoint))]};
 result.storageKeys=storageKeys;result.inputOperator={baseReactionSeconds:.2,swarmReactionSeconds:.2,convoyReactionSeconds:.35,orbitalResupply:!assist,orbitalPilot:assist?'released-calm-controller':'280-line-of-fire-and-station-priority'};
 if(result.pass){assert.equal(earned.length,23,'All 23 educational checkpoints must be reached');assert.equal(result.levels.length,14);assert.equal(emitterChanges,0);if(mode!=='pro')assert.equal(result.network.postRequests.length,0,'Quiz campaign leaked a POST');}
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'learning-earned-'+mode+'.json.gz'),zlib.gzipSync(JSON.stringify({method:'All snapshots earned by a full campaign using ordinary movement, weapon and interaction commands.',...entryEvidence(entry),mode,earned}),{level:9}));
 return result;
}

function readEarned(mode){const p=path.join(out,'learning-earned-'+mode+'.json.gz');assert(fs.existsSync(p),'Run the full '+mode+' campaign first');return JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));}
async function networkContracts(entry){
 const rows=[],failures=[];async function test(name,fn){try{rows.push({name,pass:true,...await fn()});}catch(e){failures.push({name,error:e.message,stack:e.stack?.split('\n').slice(1,4)});}}
 const posts=h=>h.fetchCalls.filter(x=>String(x.options.method).toUpperCase()==='POST');
 for(const mode of ['training','combat'])await test(mode+'-all-local-start-routes-and-submit',async()=>{
  const h=await lab(entry),api=modeAPI(h);api.setMode(mode);
  const actions=['learning-start','arcade-start','cup-play','cup-new','launch-local','launch-new','cup-guest'];
  for(const action of actions){h.action(action);await next();assert.equal(api.getMode(h.arcade.engine),mode);assert(api.usesQuiz(h.arcade.engine));assert.equal(h.cup.attached,false);}
  let stopped=false,prevented=false;const event={type:'submit',target:{id:'cup-entry-form',nameValue:'QA local'},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};
  // Browser capture order is window then document; this mock explicitly
  // follows that order instead of bypassing the old document form listener.
  for(const fn of h.windowHandlers.get('submit')||[]){fn(event);if(stopped)break;}
  if(!stopped)for(const fn of h.handlers.get('submit')||[]){fn(event);if(stopped)break;}
  await next();await next();assert(prevented&&stopped,'Quiz form submit did not stop old ranked entry');
  h.run('cupEnqueue(); cupComplete(0,ARCADE.engine);');await h.run('cupFlush()');await next();assert.equal(posts(h).length,0,'Quiz launch/save made a POST');
  assert(h.storage.has('cmpon.citadel.quiz.run.v1.'+mode),'Mode-local save missing');assert(!h.storage.has('cmpon.citadel.local.v1'),'Quiz overwrote legacy local save');
  const html=h.run('cupLobbyHTML()');assert(html.includes('на этом устройстве'),'Local ranking label missing');assert(!html.includes('cup-entry-form'),'Quiz lobby exposes old ranked form');return{actions,submitCapture:true,postRequests:0,saveKey:'cmpon.citadel.quiz.run.v1.'+mode};
 });
 for(const mode of ['training','combat'])await test(mode+'-preserves-existing-cloud-outbox',async()=>{
  const h=await lab(entry),api=modeAPI(h);api.setMode('pro');const e=new h.Engine(417147);api.setEngineMode(e,'pro');e.start(false);h.arcade.engine=e;
  const snapshot=packed(h,e);Object.assign(h.cup,{player:{id:'qa-existing-player',name:'QA'},token:'qa-mock-token',run:{id:'qa-existing-run',seed:417147,mode:'normal',status:'active',revision:2},attached:true,
   queue:[{id:'qa-existing-run',requestId:'qa-existing-job',clock:20,revision:2,revisionAssigned:true,snapshot}],progress:1,clock:20,startClock:0,startScore:0});h.run('cupPersist()');
  const before={run:copy(h.cup.run),queue:copy(h.cup.queue),outbox:h.storage.get('cmpon.cup.outbox.v1'),session:h.storage.get('cmpon.cup.session.v1')},offset=posts(h).length;
  api.setMode(mode);h.action('learning-start');await next();assert.equal(h.cup.attached,false);h.run('cupEnqueue(); cupComplete(0,ARCADE.engine)');await h.run('cupFlush()');
  assert.deepEqual(copy(h.cup.run),before.run);assert.deepEqual(copy(h.cup.queue),before.queue);assert.equal(h.storage.get('cmpon.cup.outbox.v1'),before.outbox);assert.equal(h.storage.get('cmpon.cup.session.v1'),before.session);
  assert.equal(posts(h).length,offset,'Selecting a quiz run sent the pending cloud queue');return{preserved:['run','queue','outbox','session'],quizPostRequests:0};
 });
 await test('pro-rank-start-remains-normal-without-quiz-payload',async()=>{
  const h=await lab(entry),api=modeAPI(h);api.setMode('pro');Object.assign(h.cup,{player:{id:'mock-player',name:'QA pro'},token:'qa-mock-token',verified:true});
  await h.run('cupStartDefault(true)');await next();await h.run('cupFlush()');await next();
  const starts=posts(h).filter(x=>x.endpoint==='start');assert.equal(starts.length,1);assert.equal(JSON.parse(starts[0].options.body).mode,'normal');assert.equal(api.getMode(h.arcade.engine),'pro');assert.equal(api.usesQuiz(h.arcade.engine),false);
  const saves=posts(h).filter(x=>x.endpoint==='save');assert(saves.length,'Pro cloud launch did not retain checkpoint submission');for(const req of saves){const body=JSON.parse(req.options.body);assert(!body.snapshot.engine.quiz270,'Quiz payload reached old cloud leaderboard');assert.equal(body.snapshot.engine.assist,false);}
  return{startMode:'normal',checkpointPosts:saves.length};
 });
 return{pass:!failures.length,method:'Node VM with mocked fetch; verifies production launch/API routing and payloads, does not contact the real ranking service.',passed:rows.length,failed:failures.length,rows,failures};
}
async function contracts(entry){
 const rows=[],failures=[],h=await lab(entry);
 async function test(name,fn){if(process.env.CITADEL_QA_PROGRESS)console.log('[contract] '+name);try{rows.push({name,pass:true,...await fn()});}catch(err){failures.push({name,error:err.message,stack:err.stack?.split('\n').slice(1,4)});}}
 await test('bank-schema',()=>{
  const bank=h.c.CITADEL_QUIZ_BANK;assert(bank&&Array.isArray(bank.entries));const entries=bank.entries,ids=new Set(),questions=new Set(),positions=[0,0,0,0],tiers=new Set();assert(entries.length>=70);
  for(const q of entries){assert(typeof q.id==='string'&&q.id.length);assert(!ids.has(q.id),'Duplicate ID: '+q.id);ids.add(q.id);assert(q.question&&q.question.trim());assert(!questions.has(q.question),'Duplicate question');questions.add(q.question);
   assert.equal(q.options.length,4);assert.equal(new Set(q.options.map(x=>x.trim())).size,4);assert(q.options.every(x=>typeof x==='string'&&x.trim()));assert(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4);positions[q.correct]++;
   assert(Number.isInteger(q.tier)&&q.tier>=1&&q.tier<=14);tiers.add(q.tier);assert(q.hint&&q.explanation);}
  assert.equal(tiers.size,14);return{questions:entries.length,correctIndexCounts:positions,tiers:[...tiers].sort((a,b)=>a-b)};
 });
 await test('all-84-bank-entries-reachable-and-no-repeat-in-one-run',()=>{
  const api=modeAPI(h),reached=new Set(),slots=[...Array.from({length:8},(_,index)=>['lesson',index]),...Array.from({length:12},(_,index)=>['remark',index]),...Array.from({length:3},(_,index)=>['final',index])];
  for(const mode of ['training','combat'])for(let seed=0;seed<256;seed++){
   const fixture={seed};api.setEngineMode(fixture,mode);const ids=new Set();
   for(const [kind,index]of slots){const q=api.getCase(fixture,kind,index);assert(!ids.has(q.quizId),'Duplicate question in one campaign');ids.add(q.quizId);reached.add(q.quizId);assert.deepEqual(copy(api.getCase(fixture,kind,index)),copy(q));}
   assert.equal(ids.size,23);
  }
  assert.equal(reached.size,h.c.CITADEL_QUIZ_BANK.entries.length);return{questions:reached.size,selectionFixtures:512,selections:512*23,method:'Question-selector fixtures only, not 512 game playthroughs.'};
 });
 for(const mode of ['training','combat']){
  const source=readEarned(mode);await test(mode+'-all-23-earned-points',()=>{assert.equal(source.earned.length,23);return{points:source.earned.length};});
  for(const point of source.earned){const name=mode+'-'+point.kind+'-'+point.index;
   await test(name+'-save-roundtrip',()=>{
    const e=restore(h,point.snapshot),api=modeAPI(h),q=copy(question(h,e));assert.equal(api.getMode(e),mode);assert.equal(api.usesQuiz(e),true);assert.equal(q.q.choices.length,4);
    const before=state(h,e),saved=packed(h,e),other=restore(h,saved);assert.deepEqual(state(h,other),before);assert.deepEqual(copy(question(h,other)),q);return{level:point.level,quizId:q.q.quizId};
   });
   await test(name+'-four-options-and-hint',()=>{
    for(let index=0;index<4;index++){
     const e=restore(h,point.snapshot),before=resourceState(e),api=modeAPI(h),q=question(h,e).q;
     const html=h.run('citadelReviewHTML(ARCADE.engine)');assert.equal((html.match(/class="learning-hint"/g)||[]).length,mode==='training'?1:0,'Hint visibility mismatch');
     assert.equal((html.match(/data-value="[0-3]"/g)||[]).length,4,'Four options must be rendered');
     h.action(answerAction(e),index);const feedback=api.current(e).feedback;assert.equal(feedback.index,index);assert.equal(feedback.correct,index===q.correct);assert(e.player.hp>=before.player.hp,'Answer damaged the ship');if(e.board)assert(e.board.hp>=before.board.hp,'Answer damaged the boarding team');
     const answeredHtml=h.run('citadelReviewHTML(ARCADE.engine)');assert.equal((answeredHtml.match(/ disabled/g)||[]).length,4);assert(answeredHtml.includes('Продолжить'));
    }return{optionsChecked:4};
   });
   await test(name+'-wrong-score-only-and-duplicate',()=>{
    let e=restore(h,point.snapshot),q=question(h,e).q,wrong=(q.correct+1)%4,action=answerAction(e),advance=continueAction(e),score=e.score,resources=resourceState(e),academyBefore=h.storage.get('citadel-academy-progress-v1');
    h.action(action,wrong);assert.equal(e.score,score,'Wrong answer changed score');assert(e.player.hp>=resources.player.hp,'Wrong answer damaged the ship');if(e.board)assert(e.board.hp>=resources.board.hp,'Wrong answer damaged the boarding team');const wrongAnsweredResources=resourceState(e);assert.equal(h.storage.get('citadel-academy-progress-v1'),academyBefore,'Quiz changed legacy Academy progress');
    const after=state(h,e);for(const index of [wrong,q.correct,-1,4,NaN])h.action(action,index);assert.deepEqual(state(h,e),after,'Repeated/invalid answer changed state');
    e=restore(h,packed(h,e));const afterLoad=state(h,e);assert.deepEqual(afterLoad,after,'Answered save changed state on reload');h.action(action,q.correct);assert.deepEqual(state(h,e),afterLoad,'Reload allowed score farming');
    h.action(advance);const wrongResources=resourceState(e),wrongProgress=educationalProgress(e),following=modeAPI(h).current(e);assert(e.status!==point.snapshot.engine.status||following?.q.quizId!==q.quizId,'Wrong answer blocked progression');
    const advanced=state(h,e);h.action(advance);assert.deepEqual(state(h,e),advanced,'Duplicate Continue advanced twice');
    const other=restore(h,point.snapshot),correctStart=other.score;h.action(answerAction(other),q.correct);assert(other.score>correctStart,'Correct answer did not award points');assert.deepEqual(resourceState(other),wrongAnsweredResources,'Answer correctness changed combat resources');const correctAnswered=state(h,other);h.action(answerAction(other),q.correct);assert.deepEqual(state(h,other),correctAnswered,'Duplicate correct answer awarded twice');h.action(continueAction(other));
    assert.deepEqual(resourceState(other),wrongResources,'Correctness affected combat resources or state progression');assert.deepEqual(educationalProgress(other),wrongProgress,'Correctness affected campaign progression');
    return{level:point.level,quizId:q.quizId,correctBonus:other.score-correctStart};
   });
   await test(name+'-answered-pause-resume',()=>{
    let e=restore(h,point.snapshot),q=question(h,e).q;h.action(answerAction(e),(q.correct+1)%4);const feedback=copy(modeAPI(h).current(e));e.pause();const paused=state(h,e),snapshot=packed(h,e),combat=resourceState(e),score=e.score;
    // These educational screens already suspend combat. Their reading clock
    // and cosmetic radio/flash timers may tick; they are not a second paused
    // status. Explicit in-combat pause is tested for all 14 levels separately.
    for(let i=0;i<120;i++)e.step(1/60,{fire:true,moveX:1,missile:true});assert.deepEqual(resourceState(e),combat);assert.equal(e.score,score);assert.deepEqual(copy(modeAPI(h).current(e)),feedback);
    e=restore(h,snapshot);assert.deepEqual(state(h,e),paused);if(e.status==='paused')e.resume();assert.deepEqual(copy(modeAPI(h).current(e)),feedback,'Paused answer changed after resume');return{secondsCombatSuspended:2};
   });
  }
 }
 const legacy=await lab(legacyEntry(entry));
 for(const point of readEarned('pro').earned)await test('pro-'+point.kind+'-'+point.index+'-unchanged-case-and-answer-rules',()=>{
  const e=restore(h,point.snapshot),other=restore(legacy,withoutLearning(point.snapshot));assert.equal(modeAPI(h).usesQuiz(e),false);assert.equal(modeAPI(h).getMode(e),'pro');
  const q=coreQuestion(h,e),oldQ=coreQuestion(legacy,other);assert.deepEqual(copy(q),copy(oldQ),'Pro case text/options/key changed');assert.deepEqual(copy(q),point.question,'Pro saved case changed');
  const a=answerAction(e),n=continueAction(e),wrong=(q.correct+1)%q.choices.length;
  h.action(a,wrong);legacy.action(a,wrong);assert.deepEqual(withoutLearning(state(h,e)),withoutLearning(state(legacy,other)),'Pro wrong-answer behavior changed');
  h.action(n);legacy.action(n);assert.equal(e.status,point.snapshot.engine.status,'Pro wrong answer must retain the old blocked-progression rule');assert.deepEqual(withoutLearning(state(h,e)),withoutLearning(state(legacy,other)));
  if(e.status==='lesson'){h.action('citadel-lesson-retry');legacy.action('citadel-lesson-retry');}
  h.action(a,q.correct);legacy.action(a,q.correct);assert.deepEqual(withoutLearning(state(h,e)),withoutLearning(state(legacy,other)),'Pro correct-answer behavior changed');
  h.action(n);legacy.action(n);assert.deepEqual(withoutLearning(state(h,e)),withoutLearning(state(legacy,other)),'Pro continuation changed');return{level:point.level,caseId:q.caseId};
 });
 for(const point of readEarned('pro').earned)await test('pre-learning-270-'+point.kind+'-'+point.index+'-legacy-cases',()=>{
  const oldEngine=restore(legacy,withoutLearning(point.snapshot)),snapshot=legacy.pack(oldEngine),e=restore(h,snapshot);assert.equal(modeAPI(h).usesQuiz(e),false);assert.equal(e.educationLegacyCases,true);
  assert.deepEqual(copy(coreQuestion(h,e)),copy(coreQuestion(legacy,oldEngine)));assert.deepEqual(withoutLearning(state(h,e)),withoutLearning(state(legacy,oldEngine)));return{level:point.level,from:'2.7 pre-learning script chain'};
 });
 const old270=await lab(gitEntry('5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d'));
 for(const mode of modes)for(let id=1;id<=14;id++)await test('legacy-270-'+id+'-'+mode,()=>{
  const old=fixture(old270,id,mode==='training');old270.c.CITADEL_LEARNING_MODES.setEngineMode(old,mode);
  for(let n=0;n<30;n++)old.step(1/60,{fire:true});const snapshot=old270.pack(old),e=restore(h,snapshot);
  assert.equal(modeAPI(h).getMode(e),mode);assert.equal(e.assist,old.assist);assert.equal(e.score,old.score);assert.deepEqual(resourceState(e),resourceState(old));
  assert.deepEqual(state(h,e),state(old270,old),'Old 2.7 snapshot changed during migration');
  for(let index=0;index<8;index++)assert.deepEqual(copy(h.lessonCase(e,index)),copy(old270.lessonCase(old,index)),'Saved campaign case changed');
  return{level:id,mode,baseline:'5e057d5',casesCompared:8};
 });
 await test('idempotent-learning-install',()=>{
  const files=entry.scripts.filter(f=>/citadel-(quiz-bank|learning-modes)-v2\.7\.0\.js$/.test(f)),before=listenerState(h),code='[RequirementArcade.prototype.start,RequirementArcade.prototype.answerLesson,RequirementArcade.prototype.answer,RequirementArcade.prototype.answerFinale,cupPack,cupUnpack,arcadeAction,citadelReviewHTML]',methods=h.run(code);
  assert.equal(files.length,2);for(let n=0;n<5;n++)for(const file of files)h.run(entry.sources.get(file));h.run(code).forEach((fn,i)=>assert.equal(fn,methods[i]));assert.deepEqual(listenerState(h),before);return{files,listeners:before};
 });
 return{pass:!failures.length,method:'Node VM; checkpoints earned by independent full campaigns. No browser layout or human learning claim.',passed:rows.length,failed:failures.length,rows,failures};
}

async function main(){
 const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),entryFile=arg('entry');assert(entryFile,'Use an explicit --entry=tests/entry-2.8.0.html');
 const entry=readEntry(entryFile),kind=arg('kind')||'contracts',mode=arg('mode')||'combat';
 assert(entry.scripts.some(f=>/citadel-learning-modes-v2\.7\.0\.js$/.test(f)),'Learning modes are not integrated in the supplied entry');
 const result=kind==='campaign'?await campaign(entry,mode,{fps:Number(arg('fps'))||60,progress:process.argv.includes('--progress')}):kind==='network'?await networkContracts(entry):await contracts(entry);
 const tag=arg('tag')||kind+(kind==='campaign'?'-'+mode:'');assert(/^[a-z0-9-]+$/i.test(tag));Object.assign(result,{entryFile,...entryEvidence(entry)});
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'learning-'+tag+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({report:file,pass:result.pass,passed:result.passed,failed:result.failed,failures:result.failures,error:result.error,mode:result.educationMode,levels:result.levels?.length,points:result.educationCheckpoints,seconds:result.simulatedSeconds}));if(!result.pass)process.exitCode=1;
}
module.exports={campaign,contracts,networkContracts,question,restore,readEarned,resourceState,educationalProgress};if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
