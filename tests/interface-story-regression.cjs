#!/usr/bin/env node
'use strict';
// Real public/admin engines with deterministic DOM seams; no browser screenshots.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHarness}=require('./mrg-regression.cjs');
const root=path.resolve(__dirname,'..'),asset=n=>path.join(root,'assets',n);
const cores=process.argv.slice(2).length?process.argv.slice(2).map(p=>path.resolve(p)):[asset('atlas-v1.3.5.js'),path.resolve(root,'../cmpon-analytics-admin/game-lab/engine-v1.2.1.js')];
function load(core){
  const h=createHarness(core,null,null),images=[];
  h.context.location={protocol:'https:',hostname:'test.invalid',origin:'https://test.invalid',href:'https://test.invalid/',hash:''};
  h.context.Image=class {constructor(){images.push(this);}set src(value){this.url=value;}};
  for(const n of ['citadel-interface-v1.9.0.js','citadel-story-v1.9.0.js'])vm.runInContext(fs.readFileSync(asset(n),'utf8'),h.context,{filename:n});
  vm.runInContext(`Object.assign(qa,{ui:CITADEL_INTERFACE,story:CITADEL_STORY,overlay:arcadeOverlayHTML,updateOverlay:updateArcadeOverlay,updateHUD:updateArcadeHUD,animate:updateCaptainAnimation,render:renderArcade,action:arcadeAction,setMenu:setMobileMenu,mobile:MOBILE,finalCase:(e)=>CITADEL_INTERFACE.finalCase(e)});`,h.context);
  Object.assign(h,h.context.qa);h.images=images;h.arcade.fx=true;return h;
}
function make(h){const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(0);return e;}
const reports=[];
for(const core of cores){
  const h=load(core),passed=[];let e=make(h);
  e.start(false);assert.equal(h.story.status(e).active,true);assert.equal(e.status,'briefing');
  for(let i=0;i<4;i++){
    const html=h.overlay();assert(html.includes('citadel-prologue'));assert(html.includes((i+1)+' / 4'));
    assert(html.includes('<svg viewBox="'));assert(html.includes('citadel-prologue-v1.9.0.webp'));
    assert.equal((html.match(/id="prologue-title"/g)||[]).length,1);
    h.action('story-next');
  }
  assert.equal(h.story.status(e).active,false);assert.equal(e.status,'playing');assert.equal(e.stage,0);
  passed.push('New campaign: all four comic pages lead to the real first flight');
  e=make(h);e.start(false);h.action('story-next');h.action('story-back');assert.equal(h.story.status(e).page,0);
  h.action('story-skip');assert.equal(h.story.status(e).active,false);assert.equal(e.status,'briefing');
  e.launch();assert.equal(e.status,'playing');passed.push('Back and skip preserve the normal briefing and launch');
  e=make(h);e.start(false);e.beginStage(1);assert.equal(h.story.status(e).active,false);
  e.beginStage(0);assert.equal(h.story.status(e).active,false);
  passed.push('Entering or restoring a level does not replay the new-game comic');
  e=make(h);e.launch();const snapshot={status:e.status,resumeStatus:e.resumeStatus,score:e.score,elapsed:e.elapsed,pos:e.player.pos.slice()};
  assert(h.story.open(e,true));assert.equal(e.status,'paused');assert(h.overlay().includes('Закрыть'));
  h.story.close(e);assert.equal(e.status,snapshot.status);assert.equal(e.resumeStatus,snapshot.resumeStatus);
  assert.equal(e.score,snapshot.score);assert.equal(e.elapsed,snapshot.elapsed);assert.deepEqual(e.player.pos,snapshot.pos);
  h.story.open(e,true);h.context.document.hidden=true;h.story.close(e);assert.equal(e.status,'paused');assert.equal(e.resumeStatus,'playing');h.context.document.hidden=false;
  passed.push('Preview freezes play, restores the exact state, and stays paused in a hidden tab');
  e=make(h);e.launch();h.story.open(e,true);h.action('arcade-pause');
  assert.equal(e.status,'paused');assert(h.story.status(e).active);
  h.context.innerWidth=390;h.setMenu(true);assert(h.mobile.menu);assert(h.nodes.get('workspace').inert);
  h.story.close(e);assert.equal(e.status,'paused');assert.equal(e.resumeStatus,'playing');
  assert(h.mobile.menu);h.setMenu(false);e.resume();assert.equal(e.status,'playing');assert(!h.story.status(e).active);
  h.context.innerWidth=1280;
  passed.push('Pause toggle cannot dismiss and resurrect the comic; closing a preview under the mobile menu keeps play paused');
  e=make(h);e.start(false);h.updateOverlay();assert(h.nodes.get('arcade-overlay').classList.contains('citadel-prologue-open'));assert.equal(h.nodes.get('arcade-overlay').hidden,false);
  h.story.close(e);h.updateOverlay();assert(!h.nodes.get('arcade-overlay').classList.contains('citadel-prologue-open'));
  passed.push('Overlay visibility and prologue styles follow the real UI lifecycle');
  e=make(h);assert.equal(h.story.mood(e),'calm');e.beginStage(1);e.beginBoarding();assert.equal(h.story.level(e),5);assert.equal(h.story.mood(e),'worried');
  h.animate(200);assert.equal(h.images.length,1);assert(h.images[0].url.includes('worried'));
  e.beginStage(3);h.animate(400);assert.equal(h.story.mood(e),'crisis');assert.equal(h.images.length,2);
  h.images[0].onload();assert.notEqual(h.nodes.get('captain-live').dataset.campaignMood,'worried');
  h.images[1].onload();assert.equal(h.nodes.get('captain-live').dataset.campaignMood,'crisis');
  e.beginStage(0);h.animate(600);assert.equal(h.nodes.get('captain-live').dataset.campaignMood,'calm');
  e.beginStage(3);e.beginFinale();e.beginLair();assert.equal(h.story.level(e),13);assert.equal(h.story.mood(e),'crisis');
  assert(h.render().includes('id="captain-interference"'));assert(h.render().includes('id="captain-condition"'));
  passed.push('Captain keeps identity, follows actual level, and ignores stale image loads');
  const bad=load(core),be=make(bad);be.beginStage(1);be.beginBoarding();bad.animate(200);bad.images[0].onerror();
  for(let i=0;i<20;i++)bad.animate(400+i*100);assert.equal(bad.images.length,1);
  passed.push('Unavailable portrait keeps the old image without a retry flood');
  e=make(h);e.beginStage(3);e.beginFinale();e.beginLair();
  for(let i=0;i<3;i++){
    e.board.enemies=[];e.board.pos=e.board.terminals[i].slice();e.boardInteract();assert.equal(e.status,'finalcheck');
    const {q}=h.finalCase(e),html=h.overlay();
    assert(html.includes('mission-check'));assert(html.includes('role="dialog"'));assert(html.includes('ПРОВЕРКА ПАКЕТА'));
    assert.equal((html.match(/data-action="finale-answer"/g)||[]).length,3);
    assert.equal((html.match(/<b aria-hidden="true">[123]<\/b><span>/g)||[]).length,3);
    for(let j=0;j<3;j++)assert(html.includes('data-value="'+j+'"'));
    h.updateOverlay();assert(h.nodes.get('arcade-overlay').classList.contains('citadel-readable'));
    h.action('finale-answer',String((q.correct+1)%3));assert(h.overlay().includes('Нужно другое решение'));
    const completed=e.board.completed.length;h.action('finale-check-next');assert.equal(e.status,'finalcheck');assert.equal(e.board.completed.length,completed);
    h.action('finale-answer',String(q.correct));assert(h.overlay().includes('Проверка пройдена'));assert(h.overlay().includes('Дальше по лабиринту'));
    h.action('finale-check-next');assert.equal(e.status,'boarding');assert.equal(e.board.completed.length,i+1);
  }
  passed.push('Three actual final checks: all buttons, wrong answer retry, right answer and room progression');
  const css=fs.readFileSync(asset('citadel-interface-v1.9.0.css'),'utf8');
  assert(css.includes('grid-template-columns:30px minmax(0,1fr)'));assert(css.includes('min-height:52px'));assert(css.includes('focus-visible'));assert(css.includes('overflow:auto'));assert(css.includes('max-height:440px'));
  assert(!fs.readFileSync(asset('citadel-story-v1.9.0.js'),'utf8').includes('localStorage'));
  assert([...h.storage.keys()].every(k=>!k.includes('story')&&!k.includes('prologue')));
  passed.push('Shared layout has separate numeric cells, touch-sized controls, overflow and keyboard focus; no new save writes');
  reports.push({core:path.basename(core),passed:passed.length,checks:passed});
}
console.log(JSON.stringify({version:'1.9.0',verification:'Node VM with real cores and controlled DOM/image seams; no browser rendering',reports},null,2));
