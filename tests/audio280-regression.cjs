#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture:voiceFixture}=require('./audio270-regression.cjs');
const {fixture:sfxFixture,frames}=require('./recorded-combat-audio-regression.cjs');
const {createHarness}=require('./mrg-regression.cjs');
const {createWebAudioLab}=require('./prepared-voice-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.8.0');
const original=JSON.parse(fs.readFileSync(path.join(root,'assets/voice-v1.8.2/manifest.json'))),radio=JSON.parse(fs.readFileSync(path.join(root,'assets/voice-v2.7.0/manifest.json')));
const originals=new Set([...original.clips,...radio.clips.filter(x=>x.preset==='Bernard')].map(x=>x.id));
function musicFixture(){
 const h=createHarness(path.join(root,'assets/atlas-v1.3.6.js'),null,null),lab=createWebAudioLab();lab.install(h.context,{speech:'absent'});
 vm.runInContext(fs.readFileSync(path.join(root,'assets/citadel-music-v1.4.2.js'),'utf8'),h.context);
 const run=s=>vm.runInContext(s,h.context),audio=lab.createContext();h.context.qaAudio=audio;
 run('ARCADE.audio=qaAudio;ARCADE.sound=true;spaceAudioInit(qaAudio);SPACE_AUDIO.music=true;');
 h.arcade.engine={status:'playing',phase:'swarm',swarm:{waveIndex:0},stage:2};
 return {...h,run,lab,api:h.context.citadelMusic,audio};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const tests=[];
 const test=async(name,fn)=>{try{const detail=await fn();tests.push({name,ok:true,detail});console.log('PASS',name);}catch(e){tests.push({name,ok:false,error:e.stack});console.log('FAIL',name,e.message);}};
 await test('Default original voice plays only exact stored Bernard; every added joke remains caption-eligible',async()=>{
   const h=voiceFixture('2.7.0',{context:'pursuit'});assert.equal(h.api.radioStyle,'original');await h.advance(600);
   assert(h.transcript.length>=4);assert(h.transcript.every(x=>originals.has(x.id)));assert.equal(h.api.status().systemRadioStarts,0);
   assert(h.api.status().textRadioStarts>=6);assert(h.captions.some(x=>x.text.startsWith('ФЗ:')));assert(h.api.jokes.length>=76);assert.equal(h.overlaps.length,0);
   const detail={spoken:h.transcript.length,textRadio:h.api.status().textRadioStarts,uniqueSpoken:new Set(h.transcript.map(x=>x.id)).size,voices:[...new Set(h.transcript.map(x=>x.voice))],maxVoices:h.maxVoices()};h.api.dispose();return detail;
 });
 await test('Ensemble remains optional; changing style cancels active and pending sources and persists preference',async()=>{
   const h=voiceFixture();assert(h.api.setRadioStyle('ensemble'));assert.equal(h.c.localStorage.getItem('citadel-radio-voice-style-v2'),'ensemble');await h.advance(180);
   assert(h.transcript.some(x=>!originals.has(x.id)));h.api.setRadioStyle('original');assert(!h.api.status().busy);
   const count=h.transcript.length;await h.advance(180);assert(h.transcript.slice(count).every(x=>originals.has(x.id)));assert.equal(h.overlaps.length,0);
   assert.equal(h.api.setRadioStyle('bogus'),false);h.api.dispose();
 });
 await test('No surprise system voice when original recording missing, fails, or new lesson is unrecorded',async()=>{
   const h=voiceFixture();const sample=radio.clips.find(x=>!originals.has(x.id));
   assert.equal((await h.api.previewCommander(sample.text)).reason,'original-recording-unavailable');
   h.e.status='lesson';assert.equal((await h.api.speakLesson('Совершенно новая формулировка без записи.')).reason,'original-recording-unavailable');assert.equal(h.lab.speech.spoken.length,0);
   h.e.status='paused';const pending=h.api.previewCommander(original.clips.find(x=>x.kind==='commander').text);
   h.lab.requests.at(-1).respond({ok:false,status:503});await h.lab.flush();await h.lab.advance(13000);assert(!(await pending).ok);assert.equal(h.lab.speech.spoken.length,0);h.api.dispose();
 });
 await test('Pause, visibility, mute and re-entry preserve one voice and release timers',async()=>{
   for(const kind of ['pause','hidden','mute','dispose']){
    const h=voiceFixture();await h.advance(17);
    if(kind==='pause')h.e.pause();if(kind==='hidden')h.lab.hide(true);if(kind==='mute')h.api.setEnabled(false);if(kind==='dispose')h.api.dispose();
    await h.lab.advance(14000);assert(!h.api.status().busy);assert.equal(h.overlaps.length,0);assert(h.lab.playingSources().every(x=>x.stopAt<=x.context.currentTime||x.ended));h.api.dispose();
   }
 });
 await test('Field radio subtitle remains available when sidebar is hidden, yields to rocket tip and disappears on pause',async()=>{
   const h=voiceFixture('2.7.0',{context:'pursuit'});let subtitle=null;const tip={hidden:true};
   const field={querySelector:()=>subtitle,appendChild:n=>{subtitle=n;}};
   h.c.document.querySelector=selector=>selector==='#arcade-layout .arcade-field'?field:selector==='.citadel-rocket-tip'?tip:null;
   for(let n=0;n<1500&&(!subtitle||subtitle.hidden);n++)await h.frame();assert(subtitle);assert.equal(subtitle.hidden,false);assert(subtitle.textContent.includes(': '));
   tip.hidden=false;await h.frame();assert.equal(subtitle.hidden,true);tip.hidden=true;await h.frame();assert.equal(subtitle.hidden,false);
   h.e.pause();assert.equal(subtitle.hidden,true);assert.equal(h.api.status().busy,false);h.api.dispose();
 });
 await test('Three original eight-bit scores have four different sections, layered arrangement, finite pitches',async()=>{
   const h=musicFixture(),summary=[];
   for(const key of ['swarm280','swarm280Assault','swarm280Final']){
     const sections=[];let maxNotes=0,drums=0;
     for(let part=0;part<4;part++){
       const score=Array.from({length:64},(_,n)=>h.api.score(key,part*64+n));sections.push(JSON.stringify(score));
       for(const bar of score){maxNotes=Math.max(maxNotes,bar.notes.length);drums+=bar.percussion.length;for(const n of bar.notes){assert(Number.isFinite(n.note)&&n.note>=20&&n.note<=100);assert(n.duration>0&&n.duration<3);}}
     }
     assert.equal(new Set(sections).size,4);assert(maxNotes>=3);assert(drums>100);summary.push({key,sections:4,maxNotes,percussion:drums});
   }
   h.api.dispose();return summary;
 });
 await test('Live music escalates with wave/chapter; 15 min scheduling bounded; stop/hidden/suspended context clean up',async()=>{
   const h=musicFixture();let maxVoices=0;
   for(let i=0;i<9000;i++){
    const wave=Math.floor(i/1500);h.arcade.engine.swarm.waveIndex=wave;
    h.run('spaceAudioSync(ARCADE.engine)');assert.equal(h.api.status().selectedKey,wave>=4?'swarm280Final':wave>=2?'swarm280Assault':'swarm280');
    maxVoices=Math.max(maxVoices,h.api.status().voices);await h.lab.advance(100);
    // The lab retains every historical source for assertions. Drop ended test
    // records here so stress time measures live scheduler, not O(n²) lab logs.
    if(i%50===0){for(const context of h.lab.contexts)context.nodes=context.nodes.filter(n=>!n.disconnected||n.started&&!n.ended);h.lab.nodes=h.lab.nodes.filter(n=>!n.disconnected||n.started&&!n.ended);h.lab.events.length=0;}
   }
   assert(maxVoices<=72);h.arcade.engine.phase='pursuit';h.arcade.engine.pursuit={chapter:0};assert.equal(h.api.status().selectedKey,'pursuit280');h.arcade.engine.pursuit.chapter=2;assert.equal(h.api.status().selectedKey,'pursuit280Final');
   h.run('spaceAudioSync(ARCADE.engine)');h.context.document.hidden=true;h.run('spaceAudioSync(ARCADE.engine)');assert.equal(h.api.status().voices,0);
   h.context.document.hidden=false;await h.audio.suspend();h.api.stop();assert.equal(h.api.status().voices,0);h.api.dispose();assert.equal(h.api.status().voices,0);
   return {simulatedSeconds:900,maxVoices,contexts:h.lab.contexts.length};
 });
 await test('Robodog dash creates distinctive bounded PCM bark; rate limit and pause stop it',async()=>{
   const {harness,restore}=require('./base270-regression.cjs');const h=harness(),lab=createWebAudioLab();h.lab=lab;lab.install(h.c,{speech:'absent'});
   const audio=lab.createContext();h.c.qaAudio=audio;h.run('ARCADE.audio=qaAudio;SPACE_AUDIO.ready=false;spaceAudioInit(qaAudio);SPACE_AUDIO.music=false;');
   const e=restore(h,5);h.arcade.sound=true;h.state.view='arcade';h.run('spaceAudioSync(ARCADE.engine)');h.api=h.c.CITADEL_SFX;h.count=k=>h.api.status().played[k]||0;
   const dog=e.board.enemies.find(x=>x.missions270?.kind==='dog'&&x.duty.room===0);assert(dog);dog.alert=true;dog.stun=0;
   const dash=()=>{dog.missions270.phase='charge';dog.missions270.phaseClock=.5;dog.missions270.heading=[0,0,1];e.enemyBoardStep(dog,.04);};dash();
   assert.equal(h.count('robot-bark'),1);dash();assert.equal(h.count('robot-bark'),1);
   const source=h.lab.nodes.find(x=>x.kind==='buffer-source'&&Math.abs((x.buffer?.duration||0)-.38)<.001);assert(source);
   const pcm=source.buffer.getChannelData(0);assert(pcm.every(Number.isFinite));assert(Math.max(...pcm)<=.65);assert(Math.min(...pcm)>=-.65);
   await h.lab.advance(1400);dash();assert.equal(h.count('robot-bark'),2);e.pause();assert.equal(h.api.status().activeVoices,0);
   return {duration:source.buffer.duration,samples:pcm.length,starts:2};
 });
 const report={date:'2026-10-29',method:'Node VM real production modules, deterministic Web Audio/fetch boundary. No physical device or timbre/ear-quality claim.',tests,passed:tests.filter(x=>x.ok).length,total:tests.length};
 fs.writeFileSync(path.join(out,'audio280-regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed<report.total)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main,musicFixture};
