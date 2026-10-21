#!/usr/bin/env node
'use strict';

// Component fixtures are deliberate boundary states, not claimed playthroughs.
// Real entry code is also loaded below to check education/save/API integration.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createWebAudioLab, deliver} = require('./prepared-voice-regression.cjs');
const {entrySnapshot, entryHarness} = require('./mission-integration-regression-1.9.1.cjs');
const {convoyInput} = require('./helpers/convoy240-inputs.js');
const root = path.resolve(__dirname, '..'), voiceFile = 'assets/citadel-voice-v2.5.0.js', narrativeFile = 'assets/citadel-narrative-v2.5.0.js';
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const rows = [];
function check(name, fn) { fn(); rows.push({name, pass:true}); }

function fixture({narrative=false}={}) {
  const listeners = new Map(), local = new Map(), lab = createWebAudioLab();
  const add = (type, fn) => { const a=listeners.get(type)||[]; a.push(fn); listeners.set(type,a); };
  const remove = (type, fn) => listeners.set(type,(listeners.get(type)||[]).filter(x=>x!==fn));
  const c = vm.createContext({console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    document:{hidden:false,baseURI:'https://test.invalid/cmpon-atlas/',querySelectorAll:()=>[],addEventListener:add,removeEventListener:remove},
    addEventListener:add,removeEventListener:remove,
    localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v))}});
  lab.install(c, {speech:'throw'});
  const run = code => vm.runInContext(code,c);
  run(`Math.random=()=>0; const ARCADE={engine:null,audio:null,sound:true}, STATE={view:'arcade'};
    class RequirementArcade {
      constructor(){this.seed=417147;this.stage=0;this.status='playing';this.phase='battle';this.player={hp:100,pos:[0,0,0]};
        this.enemies=[];this.hostile=[];this.rescued=[];this.elapsed=0;this.captainClock=0;this.captain={serial:0,text:''};this.lines=[];}
      step(dt){this.elapsed+=dt;this.captainClock=Math.max(0,this.captainClock-dt);}
      say(text,mood,force){if(!force&&this.captainClock>0)return;this.captain={serial:this.captain.serial+1,text};this.captainClock=2;this.lines.push(text);}
      pause(){this.resumeStatus=this.status;this.status='paused';}
    }
    function arcadeOverlayHTML(){return '<div><button class="arcade-play" data-action="citadel-launch">Вылет</button></div>';}
    globalThis.qa={Engine:RequirementArcade,arcade:ARCADE,state:STATE};`);
  run(source('assets/citadel-voice-pack-v1.8.2.js')); run(source(voiceFile));
  if(narrative)run(source(narrativeFile));
  const e = new c.qa.Engine(); c.qa.arcade.engine=e;
  return {c,run,lab,e,api:c.CITADEL_VOICE,narrative:c.CITADEL_NARRATIVE,listeners,local};
}
function steps(h,seconds) { for(let i=0;i<Math.ceil(seconds/.04);i++)h.e.step(.04); }
async function nextRadio(h) {
  for(let i=0;i<2000&&!h.api.status().busy;i++)h.e.step(.04);
  assert(h.api.status().busy,'Automatic radio must eventually find a quiet interval');
  await deliver(h,{duration:.3}); assert.equal(h.api.status().kind,'commander');
  const id=h.api.status().clipId;
  await h.lab.advance(350); assert(!h.api.status().busy); return id;
}
function threatFixtures(api) {
  const base = () => ({status:'playing',phase:'battle',player:{hp:100,pos:[0,0,0]},enemies:[],hostile:[]});
  const tests = [
    ['quiet',()=>base(),false],
    ['low hull',()=>({...base(),player:{hp:25,pos:[0,0,0]}}),true],
    ['convoy imminent field',()=>({...base(),phase:'escort',escort:{ops240:{fields:[{warning:4,passed:false}]}}}),true],
    ['convoy passed field',()=>({...base(),phase:'escort',escort:{ops240:{fields:[{warning:4,passed:true}]}}}),false],
    ['convoy attack tell',()=>({...base(),phase:'escort',escort:{ops240:{groups:[{state:'telegraph'}]}}}),true],
    ['convoy regroup quiet',()=>({...base(),phase:'escort',escort:{ops240:{groups:[{state:'regroup'}]}}}),false],
    ['convoy nearby torpedo',()=>({...base(),phase:'escort',escort:{ops240:{},allies:[{pos:[0,0,0]}]},enemies:[{torpedo:true,ally:0,pos:[0,0,30]}]}),true],
    ['convoy distant torpedo',()=>({...base(),phase:'escort',escort:{ops240:{},allies:[{pos:[0,0,0]}]},enemies:[{torpedo:true,ally:0,pos:[0,0,90]}]}),false],
    ['pursuit gate',()=>({...base(),phase:'pursuit',pursuit:{travel:100,speed:20,gates:[{distance:140}]}}),true],
    ['pursuit crossed gate',()=>({...base(),phase:'pursuit',pursuit:{travel:100,speed:20,gates:[{distance:140,crossed:true}]}}),false],
    ['pursuit collision rock',()=>({...base(),phase:'pursuit',pursuit:{clock:10},asteroids:[{passAt:12,pos:[1,1,20],r:3}]}),true],
    ['pursuit off-axis rock',()=>({...base(),phase:'pursuit',pursuit:{clock:10},asteroids:[{passAt:12,pos:[30,30,20],r:3}]}),false],
    ['pursuit jammer recovery',()=>({...base(),phase:'pursuit',pursuit:{linkRecovery:1}}),true],
    ['swarm dive tell',()=>({...base(),phase:'swarm',enemies:[{mode:'tell'}]}),true],
    ['swarm dive',()=>({...base(),phase:'swarm',enemies:[{mode:'dive'}]}),true],
    ['swarm shot tell',()=>({...base(),phase:'swarm',enemies:[{fireCue:.7}]}),true],
    ['swarm 2.5 specialist tell',()=>({...base(),phase:'swarm',enemies:[{attackCue:.4}]}),true],
    ['swarm projectile near',()=>({...base(),phase:'swarm',hostile:[{life:1,pos:[3,3,0]}]}),true],
    ['swarm formation quiet',()=>({...base(),phase:'swarm',enemies:[{mode:'formation',fireCue:0,attackCue:0}]}),false],
    ['parallax windup',()=>({...base(),finale:{phase:'boss',parallax:{attack:{phase:'windup'}}}}),true],
    ['MRG tentacle',()=>({...base(),finale:{phase:'mrg',tentacle:{phase:'active'}}}),true],
    ['MRG active beam',()=>({...base(),finale:{phase:'mrg',beamTime:1}}),true],
  ];
  for(const [name,make,expected] of tests)check('threat predicate: '+name,()=>assert.equal(api.tacticalWarning(make()),expected));
}
async function audioPolicy() {
  const h=fixture();threatFixtures(h.api);h.e.phase='escort';h.e.escort={ops240:{fields:[],groups:[]},allies:[]};
  const ids=[];for(let i=0;i<4;i++)ids.push(await nextRadio(h));
  check('context radio exhausts convoy pool before repetition',()=>{
    assert.equal(new Set(ids).size,4);assert.deepEqual(new Set(ids),new Set(['commander-04','commander-12','commander-01','commander-10']));
  });
  const preview=[];for(let i=0;i<8;i++){h.api.previewCommander();await deliver(h,{duration:.3});preview.push(h.api.status().clipId);await h.lab.advance(350);}
  check('manual preview retains all 8 prepared commanders',()=>{assert.equal(new Set(preview).size,8);assert(preview.includes('commander-08'));});
  for(let i=0;i<2000&&!h.api.status().busy;i++)h.e.step(.04);
  await deliver(h,{duration:4});assert(h.api.status().started);
  h.e.escort.ops240.fields.push({passed:false,warning:4});h.e.step(.04);
  check('an already playing joke stops at convoy danger',()=>{assert(!h.api.status().busy);assert.equal(h.api.status().lastReason,'tactical-warning');});
  const before=h.lab.requests.length;steps(h,90);
  check('no queued joke starts during persistent danger',()=>assert.equal(h.lab.requests.length,before));
  h.e.status='lesson';h.e.lesson={caseIndex:0};
  const clip=h.c.CITADEL_VOICE_PACK.clips.find(x=>x.kind==='lesson');h.api.speakLesson(clip.text);await deliver(h,{duration:4});h.e.step(.04);
  check('learning narration remains active during paused combat threat',()=>{assert(h.api.status().busy);assert.equal(h.api.status().kind,'lesson');assert.equal(h.api.status().clipId,clip.id);});
  h.e.pause();
  check('pause still stops narration',()=>assert(!h.api.status().busy));
  check('prepared clips never fell back to generated/system speech',()=>assert.equal(h.lab.speech.spoken.length,0));
  return {automaticConvoyIds:ids,previewIds:preview,systemSpeechCalls:h.lab.speech.spoken.length};
}
function narrativePolicy() {
  const h=fixture({narrative:true});h.api.setEnabled(false);h.e.phase='escort';h.e.escort={ops240:{stats:{fieldsPassed:0,intercepts:0,disruptions:0},fields:[],groups:[]},allies:[]};
  h.e.step(.04);h.e.escort.ops240.stats.fieldsPassed++;h.e.step(.04);
  check('one contextual success reaction',()=>assert.equal(h.narrative.inspection().history.length,1));
  h.e.escort.ops240.stats.fieldsPassed++;steps(h,25);
  check('same event is not repeated in a mission',()=>assert.equal(h.narrative.inspection().history.length,1));
  h.e.escort.ops240.stats.intercepts++;h.e.step(.04);
  check('a different success can react after quiet interval',()=>assert.equal(h.narrative.inspection().history.length,2));
  h.e.escort.ops240.fields.push({passed:false,warning:4});h.e.escort.ops240.stats.disruptions++;h.e.step(.04);steps(h,12);h.e.escort.ops240.fields=[];steps(h,30);
  check('stale reaction expires instead of replaying after danger',()=>assert.equal(h.narrative.inspection().history.length,2));
  h.e.stage=2;h.e.phase='swarm';h.e.escort=null;h.e.swarm={rulesVersion:'2.5.0',packet:0,wavesCleared:0};h.e.step(.04);
  h.e.swarm.wavesCleared=1;h.e.step(.04);
  check('2.5 swarm reacts to cleared wave before first packet',()=>{const a=h.narrative.inspection().history;assert.equal(a.at(-1).kind,'swarm');assert.equal(a.at(-1).level,7);});
  h.e.enemies=[{mode:'dive'}];h.e.swarm.wavesCleared=2;h.e.step(.04);assert.equal(h.narrative.inspection().pending,'swarm');
  h.e.pause();h.e.step(.04);h.e.enemies=[];h.e.status='playing';steps(h,30);
  check('pause discards pending contextual reaction',()=>assert.equal(h.narrative.inspection().history.length,3));
  const step=h.run('RequirementArcade.prototype.step'),overlay=h.run('arcadeOverlayHTML'),listeners=[...h.listeners].map(([k,v])=>[k,v.length]),stored=[...h.local];
  for(let i=0;i<20;i++){h.run(source(voiceFile));h.run(source(narrativeFile));}
  check('20 repeated module loads add no wrappers or listeners',()=>{assert.equal(h.run('RequirementArcade.prototype.step'),step);assert.equal(h.run('arcadeOverlayHTML'),overlay);assert.deepEqual([...h.listeners].map(([k,v])=>[k,v.length]),listeners);});
  check('narrative history never enters persistent storage',()=>assert.deepEqual([...h.local],stored));
  return {history:clone(h.narrative.inspection().history),repeatedLoads:20};
}
async function entryIntegration() {
  const entry=entrySnapshot();
  entry.scripts=entry.scripts.filter(x=>x!==narrativeFile).map(x=>/assets\/citadel-voice-v[\d.]+\.js$/.test(x)?voiceFile:x);
  entry.sources.set(voiceFile,source(voiceFile));
  const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;
  const education=()=>h.run('JSON.stringify({lessons:CITADEL_LESSONS,remarks:CITADEL_REMARKS,finals:FINALE_TRIALS})');
  const beforeEducation=education();h.run(source(narrativeFile));const api=h.c.CITADEL_NARRATIVE,levels=[];
  for(let n=1;n<=14;n++){
    const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(Math.min(3,Math.floor((n-1)/3)));
    if(n===14){e.beginFinale();e.beginMRG();}
    else if(n===13){e.beginFinale();e.beginLair();}
    else if(n===12){e.beginFinale();e.launchFinale();}
    else if([3,6,9].includes(n)){e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();}
    else if([2,5,8,11].includes(n))e.beginBoarding();
    assert.equal(api.chapter(e).level,n,'Chapter level '+n);levels.push({number:n,phase:e.finale?.phase||e.phase});
    const before=clone(h.pack(e));api.inspection(e);api.chapter(e);assert.deepEqual(clone(h.pack(e)),before);
    if(['briefing','escortbrief','finalebrief'].includes(e.status)){
      const html=h.run('arcadeOverlayHTML()');assert.equal((html.match(/citadel-narrative-note/g)||[]).length,1,'One contextual briefing');
    }
  }
  check('real 14-level states select their intended narrative chapter',()=>assert.equal(levels.length,14));
  check('educational arrays unchanged after narrative module',()=>assert.equal(education(),beforeEducation));
  const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(0);e.launch();
  const before=clone(h.pack(e));h.c.CITADEL_VOICE.setEnabled(false);e.step(.04,{});
  check('narrative private history not serialized in real save',()=>{const after=JSON.stringify(h.pack(e));assert(!/radioRecent|spoken|narrative|pendingReaction/.test(after));assert.equal(h.pack(e).seed,before.seed);});
  const reference=entryHarness(entry);await new Promise(setImmediate);reference.cup.panel=null;reference.arcade.sound=false;reference.c.CITADEL_VOICE.setEnabled(false);
  function convoyFixture(q){const ship=new q.Engine(417147);q.arcade.engine=ship;ship.beginStage(0);ship.status='stageclear';ship.upgradeChoice='weapons';ship.beginEscort();ship.launch();return ship;}
  const candidate=convoyFixture(h),control=convoyFixture(reference);
  const mechanics=ship=>clone({escort:ship.escort,player:ship.player,enemies:ship.enemies,bullets:ship.bullets,hostile:ship.hostile,status:ship.status,score:ship.score,entityId:ship.entityId});
  let frames=0;
  for(;frames<6000&&candidate.status==='playing';frames++){
    candidate.step(1/60,convoyInput(h,candidate));control.step(1/60,convoyInput(reference,control));
    if(frames%60===0)assert.deepEqual(mechanics(candidate),mechanics(control),'Narrative changes only presentation, second '+frames/60);
  }
  check('ordinary-input real convoy has identical mechanics with and without narrative',()=>assert.deepEqual(mechanics(candidate),mechanics(control)));
  return {levels,entryVoice:h.c.CITADEL_VOICE.version,preparedClips:h.c.CITADEL_VOICE.status().preparedClips,
    convoyEquivalence:{frames,simulatedSeconds:+(frames/60).toFixed(2),status:candidate.status,score:candidate.score,reactions:api.inspection(candidate).history.length}};
}
async function main() {
  const audio=await audioPolicy(),narrative=narrativePolicy(),integration=await entryIntegration();
  const result={version:'2.5.0',pass:true,method:'Node VM component boundary fixtures, mocked asynchronous Web Audio, and real entry-module integration. No browser, MP3 decoding, full playthrough or claim of human engagement.',checks:rows,audio,narrative,integration};
  fs.mkdirSync(path.join(root,'tests/qa-2.5.0'),{recursive:true});fs.writeFileSync(path.join(root,'tests/qa-2.5.0/narrative-regression.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({pass:true,checks:rows.length,automaticConvoyIds:audio.automaticConvoyIds,levels:integration.levels.length,preparedClips:integration.preparedClips}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
