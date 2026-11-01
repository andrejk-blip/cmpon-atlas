#!/usr/bin/env node
'use strict';
// Independent contracts. Explicit boundary fixtures are not playthroughs.
// Earned card/route/victory snapshots come from campaign2120-run.cjs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {restore}=require('./learning280-verifier.cjs');
const out=path.join(__dirname,'qa-2.12.0'),copy=x=>JSON.parse(JSON.stringify(x));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pack=(h,e)=>copy(h.pack(e));
function fresh(h,mode='combat'){const e=new h.Engine(417147,()=>{});h.arcade.engine=e;h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);e.start(mode==='training');return e;}
function earned(){return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'campaign2120-training-convoy-earned.json.gz'))));}
function anchor(e){return copy({stage:e.stage,status:e.status,phase:e.phase,score:e.score,rescued:e.rescued,completedRemarks:e.completedRemarks,decisions:e.decisions,upgrades:e.upgrades,player:e.player,board:e.board?{pos:e.board.pos,hp:e.board.hp,completed:e.board.completed,question:e.board.question,definition:e.board.definition}:null,finale:e.finale});}
async function main(){
 const entry=readEntry('index.html'),rows=[],failures=[],h=await lab(entry),api=h.c.CITADEL_CAMPAIGN,data=earned();
 assert(api?.version==='2.12.0');const filter=process.env.CAMPAIGN2120_CONTRACT_FILTER?new RegExp(process.env.CAMPAIGN2120_CONTRACT_FILTER):null;
 async function test(name,fn){if(filter&&!filter.test(name))return;try{const more=await fn();rows.push({name,pass:true,...more});console.log('PASS '+name);}catch(e){failures.push({name,error:e.message.slice(0,1800),stack:e.stack?.split('\n').slice(1,4).map(x=>x.slice(0,400))});console.log('FAIL '+name+': '+e.message.slice(0,1800));}}
 for(const mode of ['training','combat','pro'])await test('new-local-'+mode,()=>{const e=fresh(h,mode);assert(api.active(e));assert.equal(api.number(e),1);assert.equal(api.ids.length,15);assert.equal(e.campaign2120.completed.length,0);assert.equal(h.cup.attached,false);assert.equal(e.educationMode,mode);return{mode};});
 for(const mode of ['training','combat','pro'])await test('public-ui-start-'+mode,async()=>{
  const x=await lab(entry);x.action('learning-mode',mode);x.action(mode==='pro'?'launch-new':'learning-start');for(let i=0;i<10;i++)await new Promise(setImmediate);
  const e=x.arcade.engine;assert(x.c.CITADEL_CAMPAIGN.active(e));assert.equal(e.educationMode,mode);assert.equal(e.status,'briefing');assert.equal(x.cup.attached,false);return{mode,entryAction:mode==='pro'?'launch-new':'learning-start'};
 });
 await test('fresh-cloud-launch-keeps-legacy-route',async()=>{
  const x=await lab(entry);await x.run('cupLaunch')({id:'qa2120',seed:417147,mode:'normal',status:'active',progress:0,clock:0,revision:0,gameVersion:'2.12.0'},false);
  assert.equal(x.cup.attached,true);assert(!x.c.CITADEL_CAMPAIGN.active(x.arcade.engine));assert.equal(x.arcade.engine.educationMode,'pro');assert.equal(x.arcade.engine.educationLegacyCases,true);return{route:'legacy14',cloudAttached:true};
 });
 await test('early-answer-delayed-echo-correct-and-wrong',()=>{
  let cases=0;const routePoint=data.earned.find(x=>x.status==='campaignroute');
  for(const mode of ['training','combat','pro'])for(const correct of [true,false]){
   let e=fixture(h,2,mode==='training');h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);api.enable(e);
   // Explicit first-terminal fixture; the choice and echo delivery use UI actions.
   e.status='remark';e.board.question=0;e.board.answered=false;e.remarkFeedback=null;assert.equal(e.status,'remark');const q=h.c.CITADEL_LEARNING_MODES.current(e).q,answer=correct?q.correct:(q.correct+1)%q.choices.length;
   h.action('citadel-answer',answer);const echo=copy(e.campaign2120.echo);assert(echo);assert.equal(echo.question,q.q);assert.equal(echo.chosen,q.choices[answer]);assert.equal(echo.correct,correct);assert.equal(echo.delivered,false);
   e=restore(h,routePoint.snapshot);e.campaign2120.echo=echo;h.action('campaign-route','convoy');assert.equal(e.campaign2120.echo.delivered,true);assert(e.campaign2120.echo.text.includes(q.choices[q.correct]));assert.equal(e.campaign2120.echo.correct,correct);
   const delivered=pack(h,e);h.action('campaign-route','pursuit');assert.deepEqual(pack(h,e),delivered);cases++;
  }return{cases,method:'First-terminal and delayed-route boundary fixtures, not six continuous campaigns'};
 });
 await test('legacy-2110-save-resources-and-route',async()=>{
  const old=await lab(gitEntry('f4afdf8758f1fe186b8f69e8332782fb0548be4e'));let cases=0;
  for(const mode of ['training','combat','pro'])for(let id=1;id<=14;id++){
   const before=fixture(old,id,mode==='training');old.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);
   const snapshot=pack(old,before),after=restore(h,snapshot);assert(!api.active(after),'Legacy save gained a new route marker');assert.deepEqual(anchor(after),anchor(before));cases++;
  }return{cases,method:'Direct scene-boundary fixtures; no claim of continuous completion'};
 });
 for(const mode of ['training','combat','pro'])await test('new-pause-save-'+mode,()=>{
  const e=fresh(h,mode);h.action('story-skip');if(e.status==='briefing')h.action('citadel-launch');e.pause();const before=pack(h,e);
  for(let i=0;i<120;i++)e.step(1/60,{fire:true,moveX:1,pulse:true});assert.deepEqual(pack(h,e),before);
  const after=restore(h,before);assert.deepEqual(pack(h,after),before);assert(api.active(after));return{pausedSeconds:2};
 });
 await test('earned-boundary-roundtrips',()=>{for(const point of data.earned){const e=restore(h,point.snapshot);assert.deepEqual(pack(h,e),point.snapshot,'Changed saved boundary '+point.key);assert(api.active(e));}return{boundaries:data.earned.length};});
 await test('victory-count-survives-restoration-all-modes-and-routes',()=>{
  const checked=[];for(const mode of ['training','combat','pro'])for(const route of ['convoy','pursuit']){
   const file=path.join(out,'campaign2120-'+mode+'-'+route+'-earned.json.gz'),x=JSON.parse(zlib.gunzipSync(fs.readFileSync(file))),e=restore(h,x.finalSnapshot);
   assert.equal(e.status,'won');assert.equal(h.c.CITADEL_LEARNING_MODES.count(e),28);assert.deepEqual(copy(e.campaign2120.completed),copy(api.ids));checked.push(mode+'-'+route);
  }return{checked,cards:28};
 });
 for(const point of data.earned.filter(x=>x.status==='campaigncard'))await test('one-card-'+point.mission,()=>{
  let e=restore(h,point.snapshot);const q=api.questions[point.mission],correct=Array.isArray(q.correct)?q.correct[0]:q.correct,score=e.score;
  const before=pack(h,e);for(let i=0;i<120;i++)e.step(1/60,{fire:true,moveX:1,missile:true});assert.deepEqual(pack(h,e),before,'Card screen advanced combat');
  h.action('campaign-answer',correct);assert.equal(e.score,score+100);const answered=pack(h,e);h.action('campaign-answer',correct);h.action('campaign-answer',-1);assert.deepEqual(pack(h,e),answered,'Duplicate answer changed state');
  e=restore(h,answered);assert.deepEqual(pack(h,e),answered);h.action('campaign-card-next');assert.notEqual(e.status,'campaigncard');const done=pack(h,e);h.action('campaign-card-next');assert.deepEqual(pack(h,e),done,'Double Continue advanced twice');
  return{mission:point.mission,points:100};
 });
 await test('station-two-solutions-and-correction',()=>{
  const point=data.earned.find(x=>x.mission==='contradictions'&&x.status==='campaigncard');assert(point);const terms=[];
  for(const answer of [0,1]){const e=restore(h,point.snapshot);h.action('campaign-answer',answer);h.action('campaign-card-next');assert.equal(e.status,'boarding');assert.equal(e.campaign2120.station.solution,answer);assert.deepEqual(copy(e.board.completed),[0,1,2]);assert(e.board.returning);terms.push(e.campaign2120.document.terms);}assert.notEqual(terms[0],terms[1],'Document ignores station solution');
  const e=restore(h,point.snapshot),score=e.score;h.action('campaign-answer',2);h.action('campaign-card-next');assert.equal(e.status,'campaigncard');assert.equal(e.campaign2120.card.answer,null);assert.equal(e.score,score);assert(!e.campaign2120.answers.contradictions);
  h.action('campaign-answer',0);h.action('campaign-card-next');assert.equal(e.score,score+100);return{validSolutions:2,correctionAllowed:true};
 });
 await test('station-definition-isolation',async()=>{
  const x=await lab(entry),e=fresh(x),api=x.c.CITADEL_CAMPAIGN,before=copy(x.run('CITADEL_DECKS[0]'));
  api.startStation(e);assert.deepEqual(copy(x.run('CITADEL_DECKS[0]')),before,'Station mutates first-base global definition');return{definitionUnchanged:true};
 });
 await test('bestiary-actual-encounter-and-readonly-render',()=>{
  const e=fresh(h);e.beginStage(1);e.launch();const s=e.campaign2120;
  const creature={schema:280,kind:'medusa',scale:1,side:1,center:[0,0,-900],pos:[0,0,-900],phase:0,segments:[],age:0};
  // Explicit spatial fixtures verify the boundary; they are not logged as a
  // naturally generated playthrough encounter.
  e.pursuit.warpEntities=[creature];api.encounters(e);assert.equal(Object.keys(s.encounters).length,0,'Ahead-of-course spawn unlocked bestiary');
  creature.pos=[e.player.pos[0],e.player.pos[1],e.player.pos[2]-200];api.encounters(e);assert.deepEqual(Object.keys(s.encounters),['medusa']);
  e.pause();assert(api.openModal(e,'bestiary'));const before=pack(h,e),a=h.scene(e,10,false),b=h.scene(e,20,false);h.camera(e,10);h.camera(e,20);assert(a.length>0&&b.length>0);assert.deepEqual(pack(h,e),before,'Model rendering changed campaign');
  for(let i=0;i<120;i++)e.step(1/60,{fire:true});e.resume();e.pause();h.action('arcade-resume');h.action('arcade-pause');assert.deepEqual(pack(h,e),before,'Modal pause/resume altered state');h.action('campaign-modal-close');assert.equal(e.status,'paused');assert.equal(s.modal,null);return{species:['medusa'],readOnly:true};
 });
 await test('convoy-safe-practice-return-and-save-isolation',()=>{
  const point=data.earned.find(x=>x.mission==='convoy1'&&x.status==='campaigncard');let e=restore(h,point.snapshot);h.action('campaign-retry');e=h.arcade.engine;h.action('citadel-launch');
  // Explicit defeat fixture exercises the defeat UI/restore contract.
  e.player.invulnerable=0;e.damage(10000);for(let i=0;i<600&&e.status==='crashing';i++)e.step(1/60,{});assert.equal(e.status,'lost');api.save(e,true);const lost=pack(h,e),saved=h.storage.get('cmpon.citadel.campaign2120.training');
  h.action('campaign-practice');e=h.arcade.engine;assert(e.campaign2120.practice);assert.equal(e.status,'playing','Convoy practice did not launch');
  for(let i=0;i<60*26&&e.status!=='campaignpractice';i++)e.step(1/60,{});assert.equal(e.status,'campaignpractice');assert.equal(h.storage.get('cmpon.citadel.campaign2120.training'),saved,'Practice overwrote primary save');
  h.action('campaign-practice-exit');e=h.arcade.engine;assert.deepEqual(pack(h,e),lost,'Practice return changed lost checkpoint');return{duration:25,savePreserved:true};
 });
 await test('optional-route-preserves-victory-save',()=>{
  const e=restore(h,data.finalSnapshot);assert.equal(e.status,'won');api.save(e,true);const before=h.storage.get('cmpon.citadel.campaign2120.training'),won=pack(h,e);
  h.action('campaign-other-route');assert(h.arcade.engine.campaign2120.practice?.optional);assert.equal(h.storage.get('cmpon.citadel.campaign2120.training'),before,'Optional route overwrote victory before practice flag');
  h.action('campaign-practice-exit');assert.deepEqual(pack(h,h.arcade.engine),won);assert.equal(h.storage.get('cmpon.citadel.campaign2120.training'),before);return{victoryPreserved:true};
 });
 await test('route-choice-and-retry-are-single',()=>{
  const point=data.earned.find(x=>x.status==='campaignroute');for(const route of ['convoy','pursuit']){
   let e=restore(h,point.snapshot);h.action('campaign-route',route);assert.equal(e.campaign2120.route,route);const once=pack(h,e);h.action('campaign-route',route==='convoy'?'pursuit':'convoy');assert.deepEqual(pack(h,e),once);
   const deliveredEcho=copy(e.campaign2120.echo),checkpoint=copy(e.campaign2120.retry),snapshot=pack(h,e);e=restore(h,snapshot);assert.deepEqual(copy(e.campaign2120.retry),checkpoint);h.action('campaign-retry');e=h.arcade.engine;assert.equal(e.campaign2120.route,route);assert.equal(e.score,checkpoint.engine.score);assert.deepEqual(copy(e.campaign2120.echo),deliveredEcho,'Retry discarded delivered story echo');
   const retry=pack(h,e);h.action('campaign-retry');assert.deepEqual(pack(h,h.arcade.engine),retry,'Repeated retry changed its boundary');
  }return{routes:2};
 });
 const result={pass:!failures.length,passed:rows.length,failed:failures.length,rows,failures,entrySha256:sha(entry.html),moduleSha256:sha(entry.sources.get('assets/citadel-campaign-v2.12.0.js')),method:'Node VM boundary contracts plus snapshots earned by a fresh full campaign. Not physical-phone or human-play evidence.'};
 fs.writeFileSync(path.join(out,filter?'campaign2120-contracts-targeted.json':'campaign2120-contracts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({DONE:true,pass:result.pass,passed:result.passed,failed:result.failed,failures}));if(!result.pass)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
