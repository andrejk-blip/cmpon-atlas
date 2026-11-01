#!/usr/bin/env node
'use strict';
// Boundary contracts; earned 2.12 snapshots serve as upgrade compatibility inputs.
// These fixtures are not represented as independent human playthroughs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {restore}=require('./learning280-verifier.cjs');
const {pursuitInput}=require('./helpers/campaign-inputs.js');
const out=path.join(__dirname,'qa-2.13.0'),copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pack=(h,e)=>copy(h.pack(e));
function baseline(){return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'qa-2.12.0/campaign2120-training-convoy-earned.json.gz'))));}
function fresh(h,mode='combat'){const e=new h.Engine(417147,()=>{});h.arcade.engine=e;h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);e.start(mode==='training');return e;}
function rewardAnchor(e){return copy({score:e.score,upgrades:e.upgrades,completed:e.campaign2120.completed,answers:e.campaign2120.answers,rescued:e.rescued,decisions:e.decisions,boardCompleted:e.board?.completed});}
function legacyAnchor(e){return copy({stage:e.stage,status:e.status,phase:e.phase,score:e.score,rescued:e.rescued,completedRemarks:e.completedRemarks,decisions:e.decisions,upgrades:e.upgrades,player:e.player,board:e.board?{pos:e.board.pos,hp:e.board.hp,completed:e.board.completed,question:e.board.question,definition:e.board.definition}:null,finale:e.finale});}
async function main(){
 const entry=readEntry('index.html'),h=await lab(entry),C=h.c.CITADEL_CAMPAIGN,X=h.c.CITADEL_EXPERIENCE,S=h.c.CITADEL_SKILLS,data=baseline(),rows=[],failures=[];
 assert.equal(X.version,'2.13.0');const filter=process.env.EXPERIENCE2130_CONTRACT_FILTER?new RegExp(process.env.EXPERIENCE2130_CONTRACT_FILTER):null;
 async function test(name,fn){if(filter&&!filter.test(name))return;try{const more=await fn();rows.push({name,pass:true,...more});console.log('PASS '+name);}catch(e){const row={name,error:e.message.slice(0,2200),stack:e.stack?.split('\n').slice(1,4)};failures.push(row);console.log('FAIL '+name+': '+row.error);}}
 function finishParallax(){const point=data.earned.find(x=>x.mission==='parallax'&&x.status==='campaigncard');assert(point);const e=restore(h,point.snapshot),q=C.questions.parallax;h.action('campaign-answer',q.correct);h.action('campaign-card-next');return e;}
 for(const mode of ['training','combat','pro'])await test('new-ui-start-'+mode,async()=>{
  const x=await lab(entry);x.action('learning-mode',mode);x.action(mode==='pro'?'launch-new':'learning-start');for(let i=0;i<10;i++)await new Promise(setImmediate);
  const e=x.arcade.engine;assert(x.c.CITADEL_CAMPAIGN.active(e));assert.equal(e.educationMode,mode);assert.equal(e.status,'briefing');assert(!e.campaign2120.modal);assert.equal(x.cup.attached,false);return{mode};
 });
 await test('comic-starts-after-parallax-with-no-extra-rewards',()=>{
  const point=data.earned.find(x=>x.mission==='parallax'&&x.status==='campaigncard'),e=restore(h,point.snapshot),score=e.score;
  assert.equal(C.mission(e),'parallax');assert(!e.campaign2120.modal);h.action('campaign-answer',C.questions.parallax.correct);assert.equal(e.score,score+100);
  h.action('campaign-card-next');assert.equal(C.mission(e),'base3');assert.equal(e.status,'boarding');assert.equal(e.campaign2120.modal?.type,'afterparallax');assert.equal(e.campaign2120.modal.page,0);assert.equal(e.score,score+100);
  assert.equal(e.campaign2120.completed.filter(x=>x==='parallax').length,1);return{nextMission:C.mission(e),cardReward:100,comicReward:0};
 });
 await test('comic-pauses-combat-and-render-is-readonly',()=>{
  const e=finishParallax(),before=pack(h,e);for(let i=0;i<120;i++)e.step(1/60,{fire:true,moveX:1,pulse:true,missile:true});
  e.pause();e.resume();h.action('arcade-resume');h.action('arcade-pause');h.action('campaign-modal-close');assert.deepEqual(pack(h,e),before);
  const html=h.run('arcadeOverlayHTML')();assert(html.includes('ПОСЛЕ ПАРАЛЛАКСА'));assert(html.includes('xp-comic-next'));h.scene(e,10,true);h.camera(e,10);assert.deepEqual(pack(h,e),before);return{simulatedSeconds:2};
 });
 await test('comic-next-back-skip-and-reload-preserve-state',()=>{
  let e=finishParallax();const rewards=rewardAnchor(e);h.action('xp-comic-next');h.action('xp-comic-next');assert.equal(e.campaign2120.modal.page,2);
  const checkpoint=pack(h,e);e=restore(h,checkpoint);assert.deepEqual(pack(h,e),checkpoint);assert.equal(e.campaign2120.modal.page,2);h.action('xp-comic-back');assert.equal(e.campaign2120.modal.page,1);assert.deepEqual(rewardAnchor(e),rewards);
  h.action('xp-comic-skip');assert.equal(e.campaign2120.modal,null);assert.equal(e.campaign2120.comic2130Seen,true);assert.equal(e.status,'boarding');assert.equal(C.mission(e),'base3');assert.deepEqual(rewardAnchor(e),rewards);
  const done=pack(h,e);h.action('xp-comic-next');h.action('xp-comic-skip');assert.deepEqual(pack(h,e),done);assert.equal(X.openAfterParallax(e),false);assert.deepEqual(pack(h,e),done);return{reloadPage:2,skipPreserved:true,duplicateOpenRejected:true};
 });
 await test('comic-last-page-resumes-and-checkpoints-completion',()=>{
  const e=finishParallax();for(let i=0;i<4;i++)h.action('xp-comic-next');assert.equal(e.campaign2120.modal,null);assert(e.campaign2120.comic2130Seen);
  const done=pack(h,e),saved=C.read('training');assert(saved);assert(saved.engine.campaign2120.comic2130Seen);assert.equal(saved.engine.campaign2120.modal,null);
  h.action('campaign-retry');const r=h.arcade.engine;assert.equal(r.campaign2120.modal,null);assert(r.campaign2120.comic2130Seen);assert.deepEqual(rewardAnchor(r),rewardAnchor(e));
  r.step(1/60,{});assert(r.board.time>done.engine.board.time);return{checkpointSkipsWatchedComic:true};
 });
 await test('skills-six-cards-and-real-upgrade-choices',()=>{
  const point=data.earned.find(x=>x.mission==='base1'&&x.status==='stageclear'),e=restore(h,point.snapshot),before=S.status(e),score=e.score;
  const html=X.skills(e);assert.equal((html.match(/class="xp-perk(?: ship)?"/g)||[]).length,6);for(const key of ['observation','priority','systems','weapons','armor','rockets'])assert(html.includes('data-value="'+key+'"'));
  assert(before.points>=1);h.action('analyst-skill','observation');const after=S.status(e);assert.equal(after.points,before.points-1);assert.equal(after.ranks.observation,before.ranks.observation+1);assert.equal(e.score,score);
  const weaponBefore=e.upgrades.weapons;h.action('citadel-upgrade','weapons');assert.equal(e.upgrades.weapons,weaponBefore+1);assert.equal(e.upgradeChoice,'weapons');const once=pack(h,e);h.action('citadel-upgrade','armor');assert.deepEqual(pack(h,e),once);
  const restored=restore(h,once);assert.deepEqual(pack(h,restored),once);return{cards:6,skillPointsConsumed:1,shipSelectionsAccepted:1};
 });
 await test('skills-paused-upgrades-freeze-and-reject-unearned-points',()=>{
  const e=fresh(h);h.action('story-skip');h.action('citadel-launch');e.pause();const before=pack(h,e);h.action('analyst-skill','systems');h.action('citadel-upgrade','armor');assert.deepEqual(pack(h,e),before);
  for(let i=0;i<120;i++)e.step(1/60,{fire:true});assert.deepEqual(pack(h,e),before);return{noFreePoints:true};
 });
 await test('document-shows-all-live-sections-and-preserves-state',()=>{
  const e=restore(h,data.finalSnapshot),before=pack(h,e),s=e.campaign2120;assert(C.openModal(e,'document'));
  const html=X.documentHTML(e);assert.equal((html.match(/<article /g)||[]).length,5);for(const key of ['goal','scope','terms','links','acceptance']){assert(s.document[key]);assert(html.includes(s.document[key].replace(/^[^:]+:\s*/,'')));}
  assert(html.includes('Редакция 15'));assert(html.includes('5/5 разделов'));
  const opened=pack(h,e);h.action('xp-document-tab','comic');const comic=h.run('arcadeOverlayHTML')();assert.equal((comic.match(/<figure>/g)||[]).length,3);assert(comic.includes('Передано на исполнение'));assert.deepEqual(pack(h,e),opened);
  h.action('xp-document-tab','map');assert(h.run('arcadeOverlayHTML')().includes('xp-document-grid'));h.action('campaign-modal-close');assert.deepEqual(pack(h,e),before);return{sections:5,comicPanels:3,readonly:true};
 });
 await test('document-station-choice-is-not-lost-in-visual-summary',()=>{
  const point=data.earned.find(x=>x.mission==='contradictions'&&x.status==='campaigncard'),seen=[];
  for(const answer of [0,1]){const e=restore(h,point.snapshot);h.action('campaign-answer',answer);h.action('campaign-card-next');const text=e.campaign2120.document.terms;assert(X.documentHTML(e).includes(text.replace(/^[^:]+:\s*/,'')));seen.push(text);}
  assert.notEqual(seen[0],seen[1]);return{validDocuments:2};
 });
 await test('voluntary-pursuit-transfers-new-packets-and-reloads-progress',()=>{
  const point=data.earned.find(x=>x.status==='campaignroute');let e=restore(h,point.snapshot);
  assert(e.plan[1].every(id=>e.rescued.includes(id)),'Main pursuit requirements are already rescued');const rescued=copy(e.rescued);
  h.action('campaign-route','pursuit');assert(e.campaign2120.branchActive);assert.equal(e.campaign2120.branchPackets,0);
  assert.deepEqual(copy(e.pursuit.packets),[0,0,0]);assert.equal(e.pursuit.progress,0);assert(e.pursuit.carriers.every(c=>!c.delivered&&!c.dead));
  h.action('citadel-launch');let ticks=0;while(!e.campaign2120.branchPackets&&ticks++<60*90)e.step(1/60,pursuitInput(h,e));
  assert.equal(e.campaign2120.branchPackets,1);assert.equal(e.pursuit.chapter,1);assert.deepEqual(copy(e.pursuit.carriers.map(c=>c.delivered)),[true,false,false]);
  for(let i=0;i<120;i++)e.step(1/60,pursuitInput(h,e));const snapshot=pack(h,e),fraction=e.pursuit.progress;
  assert(fraction>=100/3&&fraction<100);assert.equal(e.campaign2120.branchPackets,1);assert.deepEqual(copy(e.rescued),rescued);
  e=restore(h,snapshot);assert.deepEqual(pack(h,e),snapshot);e.step(1/60,pursuitInput(h,e));
  assert.equal(e.campaign2120.branchPackets,1);assert.deepEqual(copy(e.pursuit.carriers.map(c=>c.delivered)),[true,false,false]);assert(e.pursuit.progress>=fraction&&e.pursuit.progress<100);assert.deepEqual(copy(e.rescued),rescued);
  return{previousRequirements:3,initialPackets:[0,0,0],completedBranchPackets:1,reloadPreserved:true};
 });
 await test('legacy-cloud-launch-keeps-14-mission-rules',async()=>{
  const x=await lab(entry);await x.run('cupLaunch')({id:'qa2130',seed:417147,mode:'normal',status:'active',progress:0,clock:0,revision:0,gameVersion:'2.13.0'},false);
  assert(x.cup.attached);assert(!C.active(x.arcade.engine));assert.equal(x.arcade.engine.educationMode,'pro');assert(x.arcade.engine.educationLegacyCases);return{route:'legacy14'};
 });
 await test('legacy-2110-snapshots-42-boundaries-preserved',async()=>{
  const old=await lab(gitEntry('f4afdf8758f1fe186b8f69e8332782fb0548be4e'));let cases=0;
  for(const mode of ['training','combat','pro'])for(let id=1;id<=14;id++){const before=fixture(old,id,mode==='training');old.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);const after=restore(h,pack(old,before));assert(!C.active(after));assert.deepEqual(legacyAnchor(after),legacyAnchor(before));cases++;}return{cases};
 });
 const result={pass:!failures.length,passed:rows.length,failed:failures.length,rows,failures,entrySha256:sha(entry.html),campaignSha256:sha(entry.sources.get('assets/citadel-campaign-v2.12.0.js')),experienceSha256:sha(entry.sources.get('assets/citadel-experience-v2.13.0.js')),pursuitSha256:sha(entry.sources.get('assets/citadel-pursuit-v2.6.0.js')),method:'Node VM contracts with earned previous-build snapshots and explicit scene-boundary fixtures. No human or physical-device claims.'};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'experience2130-contracts'+(filter?'-targeted':'')+'.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({DONE:true,pass:result.pass,passed:result.passed,failed:result.failed,failures}));if(!result.pass)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
