#!/usr/bin/env node
'use strict';
// Audio lifecycle bench around the real core and unmodified voice runtimes.
// Physics is deliberately idle here: these fixtures do not claim level wins.
// MP3 durations come from the verified manifests. System speech duration is a
// labelled simulation (2.5 words/s), never a claim about an Android RU voice.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createHarness}=require('./mrg-regression.cjs');
const {createWebAudioLab}=require('./prepared-voice-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0');
const source=v=>fs.readFileSync(path.join(root,`assets/citadel-voice-v${v}.js`),'utf8');
const oldPack=JSON.parse(fs.readFileSync(path.join(root,'assets/voice-v1.8.2/manifest.json'),'utf8'));
const newPack=JSON.parse(fs.readFileSync(path.join(root,'assets/voice-v2.7.0/manifest.json'),'utf8'));
const clips=new Map([...oldPack.clips,...newPack.clips].map(x=>[x.id,x]));
const contexts=['orbit','base','pursuit','swarm','convoy','parallax','mrg'];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const voices=[{name:'Pavel',lang:'ru-RU',voiceURI:'ru-pavel',localService:true},{name:'Dmitry',lang:'ru-RU',voiceURI:'ru-dmitry',localService:true}];

function fixture(version='2.7.0',{context='orbit',russian=true,random=.5,assist=false,enemy=true,slowSpeech=false,ignoreAbort=false,systemOnlyRadio=false}={}) {
  const h=createHarness(path.join(root,'assets/atlas-v1.3.6.js'),null,null),c=h.context;
  const lab=createWebAudioLab({ignoreAbort}),listeners=new Map(),speechListeners=new Map();
  c.addEventListener=(type,fn)=>{const s=listeners.get('window:'+type)||new Set();s.add(fn);listeners.set('window:'+type,s);};
  c.removeEventListener=(type,fn)=>listeners.get('window:'+type)?.delete(fn);
  c.document.addEventListener=(type,fn)=>{const s=listeners.get('document:'+type)||new Set();s.add(fn);listeners.set('document:'+type,s);};
  c.document.removeEventListener=(type,fn)=>listeners.get('document:'+type)?.delete(fn);
  lab.install(c,{speech:'present'});
  let speechEnd=null,spoken=null,listed=russian?voices.slice():[];
  const transcript=[],ends=[],overlaps=[];
  const synthesis=c.speechSynthesis;
  synthesis.getVoices=()=>listed;
  synthesis.addEventListener=(type,fn)=>{const s=speechListeners.get(type)||new Set();s.add(fn);speechListeners.set(type,s);};
  synthesis.removeEventListener=(type,fn)=>speechListeners.get(type)?.delete(fn);
  synthesis.speak=utter=>{
    if(synthesis.speaking||lab.playingSources().some(n=>n.buffer?.qaClipId&&n.stopAt>n.context.currentTime))overlaps.push({at:lab.nowMs,type:'system-start'});
    lab.speech.spoken.push(utter);lab.events.push({type:'system-speech',wallMs:lab.nowMs,text:utter.text});
    spoken=utter;synthesis.speaking=true;utter.onstart?.();
    const seconds=slowSpeech?30:Math.max(1.4,utter.text.split(/\s+/).length/2.5+.5);
    transcript.push({at:lab.nowMs/1000,text:utter.text,source:'system',voice:utter.voice?.name,duration:seconds,speaker:h.api?.status().lastSpoken?.speaker});
    speechEnd=lab.setTimeout(()=>{synthesis.speaking=false;spoken=null;ends.push({at:lab.nowMs/1000,reason:'ended',source:'system'});utter.onend?.();},seconds*1000);
  };
  synthesis.cancel=()=>{lab.speech.cancellations++;if(spoken)ends.push({at:lab.nowMs/1000,reason:'cancelled',source:'system'});lab.clearTimeout(speechEnd);spoken=null;synthesis.speaking=false;synthesis.pending=false;};
  h.arcade.sound=true;h.arcade.engine=null;
  c.document.baseURI='https://test.invalid/cmpon-atlas/';
  const run=code=>vm.runInContext(code,c);
  c.qaRandom=random;run('Math.random=()=>qaRandom;SPACE_AUDIO.music=false;');
  for(const f of ['assets/citadel-voice-pack-v1.8.2.js','assets/citadel-radio-pack-v2.7.0.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
  // Explicit fallback fixture: missing radio recordings exercise system TTS only.
  // Normal release checks always use the complete, unchanged prepared pack.
  if(systemOnlyRadio)c.CITADEL_RADIO_PACK={...c.CITADEL_RADIO_PACK,clips:[]};
  // The cadence bench is an audio-only allowed window; no enemy HP, scores or
  // mission status is edited to manufacture a completion. Campaign QA is separate.
  const baseStep=h.Engine.prototype.step;
  h.Engine.prototype.step=function(dt){this.captainClock=Math.max(0,(this.captainClock||0)-dt);};
  const isolatedStep=h.Engine.prototype.step;
  const e=new h.Engine(417147,()=>{});h.arcade.engine=e;
  e.status=['base','mrg'].includes(context)?'boarding':'playing';e.phase=({convoy:'escort',orbit:'battle',base:'battle',mrg:'battle',parallax:'battle'})[context]||context;
  e.assist=assist;e.captainClock=0;e.captain=null;e.hostile=[];e.enemies=enemy?[{id:1,hp:100,dead:false,pos:[0,0,-100]}]:[];
  e.player.hp=100;e.board={hp:100,enemies:enemy?[{id:1,hp:100,dead:false,pos:[0,0,0]}]:[],hostile:[],completed:[]};
  if(context==='pursuit'){e.pursuit={};c.CITADEL_PURSUIT={active:x=>x.phase==='pursuit'};}
  if(context==='convoy')e.escort={ops240:{fields:[],groups:[]},allies:[]};
  if(context==='mrg'||context==='parallax')e.finale={phase:context==='mrg'?'mrg':'boss'};
  else e.finale=null;
  const captions=[];let serial=0;
  e.say=(text,kind,sticky)=>{captions.push({at:lab.nowMs/1000,text,kind,sticky});e.captain={text,serial:++serial};e.captainClock=4.8;};
  run(source(version));h.api=c.CITADEL_VOICE;
  let requestIndex=0,decodeIndex=0,sourceIndex=0,maxVoices=0;
  async function deliver() {
    for(;requestIndex<lab.requests.length;requestIndex++){
      const req=lab.requests[requestIndex];if(req.aborted&&!req.ignoreAbort)continue;
      req.respond();req.resolveBody(lab.bytes(path.basename(req.url,'.mp3')));
    }
    await lab.flush();
    for(;decodeIndex<lab.decodes.length;decodeIndex++){
      const req=lab.decodes[decodeIndex],clip=clips.get(req.clipId);
      req.resolve({duration:clip?.duration||.5});
    }
    await lab.flush();
    for(;sourceIndex<lab.events.length;sourceIndex++){
      const event=lab.events[sourceIndex];if(event.type!=='source-start'||!event.clipId)continue;
      const node=lab.nodes.find(x=>x.id===event.id),clip=clips.get(event.clipId);
      transcript.push({at:event.wallMs/1000,text:clip?.spokenText||clip?.text||event.clipId,source:'recorded',voice:clip?.voice||'Капитан',duration:node.buffer.duration,id:event.clipId,speaker:h.api.status().lastSpoken?.speaker||'captain'});
      const prior=node.onended;node.onended=()=>{ends.push({at:lab.nowMs/1000,reason:'ended',source:'recorded',id:event.clipId});prior?.();};
    }
    // stop(context.currentTime) has already removed the source from the audio
    // render graph, even when its async ended event is still pending in this lab.
    const active=lab.playingSources().filter(x=>x.buffer?.qaClipId&&x.stopAt>x.context.currentTime).length+(synthesis.speaking?1:0);
    maxVoices=Math.max(maxVoices,active);if(active>1)overlaps.push({at:lab.nowMs,type:'simultaneous',active});
  }
  async function frame(dt=.04,{deliverAudio=true}={}) {e.step(dt,{});if(deliverAudio)await deliver();await lab.advance(dt*1000);}
  async function advance(seconds,options) {for(let n=0;n<Math.round(seconds/.04);n++)await frame(.04,options);}
  const countListeners=()=>[...listeners.values(),...speechListeners.values()].reduce((n,s)=>n+s.size,0)+lab.contexts.reduce((n,ctx)=>n+[...ctx.listeners.values()].reduce((a,l)=>a+l.length,0),0);
  return {...h,c,e,lab,run,api:c.CITADEL_VOICE,deliver,frame,advance,transcript,ends,captions,overlaps,countListeners,baseStep,isolatedStep,
    maxVoices:()=>maxVoices,setVoices(v){listed=v;for(const f of speechListeners.get('voiceschanged')||[])f();},
    speech:synthesis,setSpeechBehavior(fn){synthesis.speak=fn;},currentUtter:()=>spoken};
}

async function density(version,context,russian,seconds=600) {
  const h=fixture(version,{context,russian});await h.advance(seconds);
  const starts=h.transcript,ended=h.ends.filter(x=>x.reason==='ended');
  let busy=0,minGap=Infinity,previousEnd=null;
  for(const row of starts){const natural=row.at+row.duration;busy+=Math.max(0,Math.min(seconds,natural)-row.at);if(previousEnd!==null)minGap=Math.min(minGap,row.at-previousEnd);previousEnd=natural;}
  const result={version,context,russianSystemModel:russian,seconds,starts:starts.length,completed:ended.length,
    perMinute:+(starts.length/(seconds/60)).toFixed(3),dutyCycle:+(busy/seconds).toFixed(4),
    minimumGapSeconds:+minGap.toFixed(3),uniqueLines:new Set(starts.map(x=>x.text)).size,
    prepared:starts.filter(x=>x.source==='recorded').length,system:starts.filter(x=>x.source==='system').length,
    enemyStarts:starts.filter(x=>x.speaker==='enemy').length,maxVoices:h.maxVoices(),overlaps:h.overlaps.length,
    interrupted:h.api.status().radioInterrupted??null,transcript:starts};
  h.api.stop('bench-end');return result;
}

async function main() {
  fs.mkdirSync(out,{recursive:true});const tests=[],measurements=[];
  async function test(name,fn){try{const detail=await fn();tests.push({name,ok:true,...(detail?{detail}:{})});}catch(error){tests.push({name,ok:false,error:error.stack});}}
  await test('Prepared additive MP3s exist, have measured duration/hash, and preserve all 110 legacy assets',()=>{
    assert.equal(oldPack.clips.length,110);assert.equal(newPack.clips.length,76);
    for(const clip of newPack.clips){const file='assets/voice-v2.7.0/'+clip.file;assert.equal(hash(file),clip.sha256);assert(clip.duration>1&&clip.duration<24);assert(clip.peakDbfs<0);assert(clip.radioProcessed);}
    const h=fixture();assert.equal(h.api.status().preparedClips,186);assert.equal(h.c.CITADEL_RADIO_PACK.lines.length,76);
    assert(h.api.status().radioBank>=76);assert(h.api.jokes.length>=24);h.api.dispose();return {old:110,new:76,locallyGenerated:74,radioLines:76};
  });
  for(const russian of [false,true])for(const context of contexts)await test(`${context}: real starts ~3× in identical 600 s allowed window; ${russian?'Russian system duration model':'prepared only'}`,async()=>{
    const baseline=await density('2.5.0',context,russian),candidate=await density('2.7.0',context,russian);
    const ratio=candidate.starts/baseline.starts;measurements.push({baseline,candidate,ratio:+ratio.toFixed(3)});
    assert(ratio>=2.7&&ratio<=3.3,`ratio ${ratio}`);assert.equal(candidate.maxVoices,1);assert.equal(candidate.overlaps,0);
    assert.equal(candidate.interrupted,0);assert(candidate.minimumGapSeconds>=3.19);assert(candidate.dutyCycle<.72);
    assert(candidate.enemyStarts>=3);if(russian)assert(candidate.uniqueLines>=10);else assert.equal(candidate.system,0);
    return {ratio:+ratio.toFixed(3),baseline:baseline.perMinute,candidate:candidate.perMinute,dutyCycle:candidate.dutyCycle,minGap:candidate.minimumGapSeconds};
  });
  await test('No enemy radio in an empty collection leg; captain still speaks',async()=>{
    const h=fixture('2.7.0',{enemy:false});h.e.enemies=[];h.e.phase='retrieve';await h.advance(180);
    assert(h.transcript.length>=8);assert(h.transcript.every(x=>x.speaker==='captain'));h.api.dispose();return {starts:h.transcript.length};
  });
  await test('Enemy line has matching speaker label and stable role voice',async()=>{
    const h=fixture('2.7.0',{context:'pursuit',systemOnlyRadio:true});await h.advance(220);
    assert(h.captions.some(x=>x.text.startsWith('ФЗ: ')));const enemy=h.transcript.filter(x=>x.source==='system'&&x.speaker==='enemy');
    assert(enemy.length>=2);assert(enemy.every(x=>x.voice==='Dmitry'));h.api.dispose();return {enemyVoices:[...new Set(enemy.map(x=>x.voice))]};
  });
  await test('Long speech finishes naturally; next line waits at least 3.2 s and never cuts the speaker',async()=>{
    const h=fixture('2.7.0',{slowSpeech:true,systemOnlyRadio:true});await h.advance(420);
    assert(h.transcript.some(x=>x.duration===30));assert.equal(h.api.status().radioInterrupted,0);assert.equal(h.overlaps.length,0);
    for(let i=1;i<h.transcript.length;i++)assert(h.transcript[i].at-h.transcript[i-1].at-h.transcript[i-1].duration>=3.19);
    h.api.dispose();return {starts:h.transcript.length,slowSystemSpeechSeconds:30};
  });
  await test('Lesson narration interrupts radio once; automatic banter never interrupts education',async()=>{
    const h=fixture();await h.advance(17);assert(h.api.status().busy);
    h.e.status='lesson';h.e.lesson={caseIndex:0};const text=oldPack.clips.find(x=>x.kind==='lesson').text;
    const request=h.api.speakLesson(text);await h.deliver();assert((await request).ok);assert.equal(h.api.status().kind,'lesson');
    const starts=h.transcript.length;await h.advance(15);assert.equal(h.transcript.length,starts);
    assert.equal(h.api.status().radioInterrupted,1);assert.equal(h.overlaps.length,0);h.api.dispose();
  });
  await test('All 110 old clips still select the prepared source; cache evicts decoded lessons',async()=>{
    const h=fixture();h.e.status='paused';let maxCache=0,maxBytes=0;
    for(const clip of oldPack.clips){
      const req=clip.kind==='commander'?h.api.previewCommander(clip.text):h.api.previewLesson(clip.text);
      await h.deliver();const result=await req;assert(result.ok);assert.equal(result.source,'recorded');
      assert.equal(h.api.status().clipId,clip.id);const s=h.api.status();maxCache=Math.max(maxCache,s.cachedClips);maxBytes=Math.max(maxBytes,s.cachedBytes);
      await h.lab.advance((clip.duration+.1)*1000);assert.equal(h.api.status().busy,false);
    }
    assert.equal(h.transcript.length,110);assert.equal(h.lab.speech.spoken.length,0);assert(maxCache<=24);assert(maxBytes<=12*1024*1024);
    assert(h.api.status().cachedClips<110);h.api.dispose();return {clips:110,maxCache,maxBytes};
  });
  for(const lifecycle of ['pause','hidden','sound-off','voice-off','engine-replaced'])await test(`Active playback cancels on ${lifecycle}; stale async completions do not restart`,async()=>{
    const h=fixture('2.7.0',{ignoreAbort:true});const req=h.api.previewCommander();
    // The pending HTTP request is deliberately released after cancellation.
    if(lifecycle==='pause')h.e.pause();
    if(lifecycle==='hidden')h.lab.hide(true);
    if(lifecycle==='sound-off')h.run("spaceAudioAction('arcade-sound')");
    if(lifecycle==='voice-off')h.api.setEnabled(false);
    if(lifecycle==='engine-replaced'){h.arcade.engine=new h.Engine(24,()=>{});h.e.step(.04,{});}
    await h.deliver();await h.lab.advance(13000);assert.equal(h.transcript.length,0);assert(!(await req).ok);assert.equal(h.api.status().busy,false);
    h.api.dispose();
  });
  await test('Actual playing source stops on mute and prepared radio resumes after unmute without a queue',async()=>{
    const h=fixture('2.7.0',{russian:false});await h.advance(17);assert.equal(h.api.status().busy,true);
    h.run("spaceAudioAction('arcade-sound')");await h.lab.advance(1);assert.equal(h.api.status().busy,false);const before=h.transcript.length;
    await h.advance(60);assert.equal(h.transcript.length,before);h.run("spaceAudioAction('arcade-sound')");await h.advance(50);
    assert(h.transcript.length>before);assert.equal(h.overlaps.length,0);h.api.dispose();
  });
  await test('System voice failure uses real prepared radio and does not publish the unsaid caption',async()=>{
    const h=fixture('2.7.0',{systemOnlyRadio:true});let failedText='';
    h.setSpeechBehavior(utter=>{failedText=utter.text;utter.onerror?.({error:'not-allowed'});});await h.advance(170);
    assert(failedText);assert(h.transcript.filter(x=>x.source==='recorded').length>=5);assert(h.captions.every(x=>!x.text.includes(failedText)));
    assert.equal(h.overlaps.length,0);h.api.dispose();return {preparedStarts:h.transcript.length};
  });
  await test('Normal attack cues do not cancel radio; training waits to begin until its visible cue clears',async()=>{
    const h=fixture('2.7.0',{context:'convoy',russian:false});h.e.escort.ops240.groups=[{state:'attack'}];await h.advance(60);
    assert(h.transcript.length>=3);assert.equal(h.api.status().radioInterrupted,0);h.api.dispose();
    const calm=fixture('2.7.0',{context:'convoy',russian:false,assist:true});calm.e.escort.ops240.groups=[{state:'telegraph'}];await calm.advance(40);assert.equal(calm.transcript.length,0);
    calm.e.escort.ops240.groups=[];await calm.advance(30);assert(calm.transcript.length>=1);calm.api.dispose();
  });
  await test('Repeated load/dispose restores owned wrappers and keeps listener counts bounded',async()=>{
    const h=fixture();const before=h.countListeners(),step=h.Engine.prototype.step;
    for(let i=0;i<25;i++)h.run(source('2.7.0'));
    assert.equal(h.Engine.prototype.step,step);assert.equal(h.countListeners(),before);
    for(let i=0;i<25;i++){h.api.dispose();assert.equal(h.Engine.prototype.step,h.isolatedStep);h.run(source('2.7.0'));h.api=h.c.CITADEL_VOICE;}
    assert.equal(h.countListeners(),before);h.api.dispose();assert.equal(h.countListeners(),0);return {repeatedLoads:25,disposeReloads:25,listeners:before};
  });
  await test('One-hour mixed-context audio stress: bounded recent log/cache/listeners and one narrator',async()=>{
    const h=fixture();let maxTimers=0,maxCache=0,maxBytes=0,maxRecent=0;
    const before=h.countListeners();
    for(let i=0;i<3600/.04;i++){
      if(i>0&&i%12500===0){
        h.api.stop('fixture-scene-change');h.e.stage++;
        const context=contexts[Math.floor(i/12500)%contexts.length];
        h.e.status=['base','mrg'].includes(context)?'boarding':'playing';
        h.e.phase=({convoy:'escort',orbit:'battle',base:'battle',mrg:'battle',parallax:'battle'})[context]||context;
        h.e.finale=['mrg','parallax'].includes(context)?{phase:context==='mrg'?'mrg':'boss'}:null;
        h.e.pursuit=context==='pursuit'?{}:null;
        h.e.escort=context==='convoy'?{ops240:{groups:[],fields:[]},allies:[]}:null;
        h.c.CITADEL_PURSUIT={active:e=>e.phase==='pursuit'};
      }
      await h.frame();const s=h.api.status();maxTimers=Math.max(maxTimers,h.lab.timers.size);maxCache=Math.max(maxCache,s.cachedClips);maxBytes=Math.max(maxBytes,s.cachedBytes);maxRecent=Math.max(maxRecent,s.radioRecent.length);
    }
    assert.equal(h.overlaps.length,0);assert(h.countListeners()<=before+1);assert(maxTimers<=3);assert(maxCache<=24);assert(maxBytes<=12*1024*1024);assert(maxRecent<=18);
    const result={simulatedSeconds:3600,starts:h.transcript.length,peakNarrators:h.maxVoices(),maxTimers,maxCache,maxBytes,maxRecent,listenersBefore:before,listenersAfter:h.countListeners()};h.api.dispose();return result;
  });
  const report={version:'2.7.0',method:'Node VM audio lifecycle bench using the actual core and real voice modules. Physics idle; no level completion claims. MP3 durations verified from manifests, OS TTS simulated at2.5words/s. Browser/device playback must be reported separately.',
    assets:Object.fromEntries(['assets/citadel-voice-v2.7.0.js','assets/citadel-radio-pack-v2.7.0.js',...newPack.clips.map(x=>'assets/voice-v2.7.0/'+x.file)].map(f=>[f,hash(f)])),tests,measurements,passed:tests.filter(x=>x.ok).length,total:tests.length};
  fs.writeFileSync(path.join(out,'audio-regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,total:report.total,failed:tests.filter(x=>!x.ok),ratios:measurements.map(x=>({context:x.candidate.context,system:x.candidate.russianSystemModel,ratio:x.ratio,duty:x.candidate.dutyCycle}))},null,2));
  if(report.passed!==report.total)process.exitCode=1;return report;
}
module.exports={fixture,density,main};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
