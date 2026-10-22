#!/usr/bin/env node
'use strict';
// Independent voice protocol fixtures. The engine step is deliberately a
// passive clock: this file does not claim gameplay, browser audio or human QA.
// Actual release voice/pack sources execute against the controllable Web Audio
// boundary, with measured durations from the actual local MP3 assets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {createHarness}=require('./mrg-regression.cjs');
const {createWebAudioLab}=require('./prepared-voice-regression.cjs');
const {gitEntry}=require('./release270-verifier.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0'),baseline='fcdd77e2d1293e4c35693392829f7614484c8459';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const measured=new Map();
function readAudioEntry(file){
 const full=path.resolve(root,file),html=fs.readFileSync(full,'utf8'),sources=new Map();
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]).filter(f=>/atlas-v1\.3\.6\.js$|citadel-(?:voice|radio)-(?:pack-)?v[\d.]+\.js$/.test(f)).map(f=>{
  const candidate=fs.existsSync(path.resolve(root,f))?path.resolve(root,f):path.resolve(path.dirname(full),f),relative=path.relative(root,candidate);sources.set(relative,fs.readFileSync(candidate,'utf8'));return relative;
 });return{html,scripts,sources};
}
function assetDuration(file){
 if(!measured.has(file)){
  assert(fs.existsSync(file),'Prepared recording file exists: '+file);
  const duration=Number(cp.execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());
  assert(duration>0&&Number.isFinite(duration),'Actual MP3 duration is finite');measured.set(file,duration);
 }
 return measured.get(file);
}
function voiceLab(entry,{speech='absent',ru=false}={}){
 const core='assets/atlas-v1.3.6.js';assert.equal(sha(entry.sources.get(core)),sha(fs.readFileSync(path.join(root,core))),'Isolated core matches the release source');
 const h=createHarness(path.join(root,core),null,null),c=h.context,lab=createWebAudioLab();lab.install(c,{speech});
 const run=code=>vm.runInContext(code,c);
 c.document.baseURI='https://test.invalid/cmpon-atlas/';
 if(c.speechSynthesis)c.speechSynthesis.getVoices=()=>[{name:ru?'QA Russian':'QA English',lang:ru?'ru-RU':'en-US',localService:true}];
 run('SPACE_AUDIO.music=false;STATE.view="arcade";Math.random=()=>.5;RequirementArcade.prototype.step=function(dt){this.elapsed+=dt;this.captainClock=Math.max(0,(this.captainClock||0)-dt);};');
 for(const file of entry.scripts.filter(f=>/citadel-(?:voice|radio)-pack-/.test(f)))vm.runInContext(entry.sources.get(file),c,{filename:file});
 const e=new h.Engine(417147,()=>{});h.arcade.engine=e;e.status='playing';e.phase='battle';e.captain={serial:0,text:'',mood:'order'};e.captainClock=0;
 h.arcade.sound=true;h.arcade.fx=false;
 const voiceFile=entry.scripts.find(f=>/citadel-voice-v[0-9]/.test(f));assert(voiceFile);
 vm.runInContext(entry.sources.get(voiceFile),c,{filename:voiceFile});
 const clips=new Map();for(const pack of [c.CITADEL_VOICE_PACK,c.CITADEL_RADIO_PACK].filter(Boolean))for(const clip of pack.clips||[])clips.set(clip.id,{...clip,path:path.resolve(root,pack.baseUrl,clip.file)});
 return{...h,c,lab,run,e,api:c.CITADEL_VOICE,clips,voiceFile};
}
async function deliver(h,{failPrepared=false}={}){
 for(const [index,req] of h.lab.requests.entries()){
  if(req.aborted&&!req.ignoreAbort)continue;
  if(req.headersReady.state==='pending'){
   const fail=failPrepared===true||failPrepared==='alternate'&&index%2===0;
   req.qaFailed=fail;req.respond(fail?{status:404}:{});
  }
  if(!req.qaFailed&&req.bodyReady.state==='pending')req.resolveBody(h.lab.bytes(path.basename(req.url,'.mp3')));
 }
 await h.lab.flush();
 for(const req of h.lab.decodes)if(req.completion.state==='pending'){
  const clip=h.clips.get(req.clipId);assert(clip,'Every decoded voice clip belongs to an actual manifest: '+req.clipId);req.resolve({duration:assetDuration(clip.path)});
 }
 await h.lab.flush();
}
const recorded=h=>h.lab.events.filter(x=>x.type==='source-start'&&x.clipId);
function concurrent(h){return h.lab.playingSources().filter(x=>x.buffer?.qaClipId&&x._endTime()>x.context.currentTime+1e-7).length;}
async function frame(h,{deliverAudio=true,dt=.04,failPrepared=false}={}){
 h.e.step(dt,{});if(deliverAudio)await deliver(h,{failPrepared});await h.lab.advance(dt*1000);
 assert(concurrent(h)<=1,'Prepared voices overlap');
}
async function windowRun(entry,seconds=600,options={}){
 const h=voiceLab(entry,options);let maxConcurrent=0;
 for(let i=0;i<seconds/.04;i++){await frame(h);maxConcurrent=Math.max(maxConcurrent,concurrent(h));}
 const starts=recorded(h),sources=h.lab.nodes.filter(x=>x.buffer?.qaClipId),completed=sources.filter(x=>x.ended&&x.stopCalls.length===0).length;
 const result={version:h.api.version,seconds,starts:starts.length,completed,maxConcurrent,systemCalls:h.lab.speech.spoken.length,
  startSeconds:starts.map(x=>+(x.wallMs/1000).toFixed(3)),clipIds:starts.map(x=>x.clipId),durations:Object.fromEntries([...new Set(starts.map(x=>x.clipId))].map(id=>[id,assetDuration(h.clips.get(id).path)]))};
 h.api.dispose();return result;
}
async function main(){
 const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),entryFile=arg('entry');assert(entryFile,'Explicit --entry is required');
 const entry=readAudioEntry(entryFile);assert(entry.scripts.some(f=>/citadel-voice-v2\.7\.0\.js$/.test(f)));
 const rows=[],failures=[];async function test(name,fn){try{const data=await fn();rows.push({name,pass:true,data});console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL '+name+' '+error.message);}}
 await test('content-and-real-assets',()=>{
  const h=voiceLab(entry),pack=h.c.CITADEL_RADIO_PACK;assert(pack);assert(pack.lines.length>=56);assert.equal(new Set(pack.lines.map(x=>x.id)).size,pack.lines.length);
  for(const line of pack.lines){assert(line.text.trim().length>=20);assert(['captain','enemy'].includes(line.speaker));assert(line.contexts.length);assert(!/(?:уклон(?:яй|ись)|сейчас (?:стрельнет|ударит|атакует)|безопасн(?:ая|ую) зон|уходи (?:влево|вправо)|опасность (?:слева|справа))/i.test(line.text),'Radio must not supply an advance combat instruction: '+line.id);}
  const contexts=['orbit','base','pursuit','swarm','convoy','parallax','mrg'];for(const context of contexts){const lines=pack.lines.filter(x=>x.contexts.includes(context));assert(lines.length>=8);assert(lines.some(x=>x.speaker==='captain'));assert(lines.some(x=>x.speaker==='enemy'));}
  assert.equal(pack.clips.length,pack.lines.length,'Every new line must have a real prepared recording');
  assert(pack.lines.every(line=>pack.clips.some(clip=>clip.id===line.id&&clip.text===line.text)),'Prepared bank covers every caption exactly');const assets=[];
  for(const clip of pack.clips){const file=path.resolve(root,pack.baseUrl,clip.file),bytes=fs.readFileSync(file),duration=assetDuration(file);assert.equal(sha(bytes),clip.sha256);assert.equal(bytes.length,clip.bytes);assert(Math.abs(duration-clip.duration)<.12,'Manifest duration matches actual MP3');cp.execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:['ignore','ignore','pipe']});assets.push({file:path.relative(root,file),duration,bytes:bytes.length});}
  h.api.dispose();return{lines:pack.lines.length,contexts,assets,review:'Text pattern check plus source review; humour quality remains subjective.'};
 });
 await test('three-times-radio-in-identical-clear-audio-window',async()=>{
  const before=await windowRun(gitEntry(arg('baseline')||baseline)),after=await windowRun(entry),ratio=after.starts/before.starts;
  assert(before.starts>0);assert(ratio>=2.75&&ratio<=3.3,'Actual voice starts must be approximately 3x: '+ratio);assert.equal(after.systemCalls,0);assert.equal(after.maxConcurrent,1);
  return{baseline:before,candidate:after,startRatio:ratio,method:'Same 600-second passive permitted window; cosmetic random .5; measured local MP3 durations. This is an audio protocol fixture, not gameplay.'};
 });
 await test('english-only-system-voice-does-not-speak-russian-bank',async()=>{
  const result=await windowRun(entry,90,{speech:'mock',ru:false});assert(result.starts>0);assert.equal(result.systemCalls,0,'Without a Russian system voice use actual prepared recordings');return result;
 });
 await test('prepared-bank-works-without-invoking-an-installed-russian-voice',async()=>{
  const result=await windowRun(entry,120,{speech:'mock',ru:true});assert(result.starts>0);assert.equal(result.systemCalls,0,'Every normal radio line must use its MP3 even if a system voice exists');return result;
 });
 await test('real-recording-http-failure-and-russian-fallback-share-one-channel',async()=>{
  const h=voiceLab(entry,{speech:'mock',ru:true}),speech=h.c.speechSynthesis,spoken=[],voices=[
   {name:'Ivan QA',voiceURI:'qa-captain',lang:'ru-RU',localService:true},{name:'Pavel QA',voiceURI:'qa-enemy',lang:'ru-RU',localService:true}];
  speech.getVoices=()=>voices;
  // Initial audio-only fixture supplies a present antagonist, never a claimed
  // gameplay win. Speech durations below are synthetic lifecycle boundaries.
  h.e.enemies=[{id:500,hp:100,dead:false,pos:[10,20,0]}];
  const originalSpeak=speech.speak.bind(speech),originalCancel=speech.cancel.bind(speech);let active=null;
  speech.speak=utter=>{
   assert(!active,'System speech jobs overlap');originalSpeak(utter);
   const row={text:utter.text,voice:utter.voice?.voiceURI,startedMs:h.lab.nowMs,endedMs:null};spoken.push(row);active={row,utter,timer:null};utter.onstart?.();
   const job=active;job.timer=h.lab.setTimeout(()=>{if(active!==job)return;speech.speaking=false;row.endedMs=h.lab.nowMs;active=null;utter.onend?.();},Math.min(18000,Math.max(1000,utter.text.length*65)));
  };
  speech.cancel=()=>{originalCancel();if(active){h.lab.clearTimeout(active.timer);active.row.endedMs=h.lab.nowMs;active.row.cancelled=true;active=null;}};
  for(let i=0;i<240/.04;i++){await frame(h,{failPrepared:'alternate'});assert(!(speech.speaking&&concurrent(h)),'Recorded and system speech overlap');}
  assert(spoken.length>0,'A failed MP3 load must actually use available Russian fallback');assert(recorded(h).length>0,'The same channel must also play available MP3s');assert(spoken.every(x=>voices.some(v=>v.voiceURI===x.voice)),'Only Russian voices are used');
  const status=h.api.status();assert.equal(status.radioStarts,recorded(h).length+spoken.length,'Radio counters count actual starts, not selected text');
  const result={seconds:240,recordedStarts:recorded(h).length,systemStarts:spoken.length,usedVoices:[...new Set(spoken.map(x=>x.voice))],radioStarts:status.radioStarts,maxConcurrent:1,syntheticSystemDurations:true,fixture:'Every other initial MP3 response is HTTP 404; real production fallback runs.'};h.api.dispose();return result;
 });
 await test('education-preempts-radio-and-no-backlog-after-card',async()=>{
  const h=voiceLab(entry);for(let i=0;i<70/.04&&!recorded(h).length;i++)await frame(h);assert(recorded(h).length,'Automatic radio started');
  const previous=recorded(h).at(-1).id,lesson=[...h.clips.values()].find(x=>x.kind==='lesson');
  h.e.status='lesson';h.e.lesson={caseIndex:0,solved:false};const promise=h.api.speakLesson(lesson.text);await deliver(h);await h.lab.advance(0);
  assert.equal(h.api.status().kind,'lesson');assert.equal(concurrent(h),1);const oldSource=h.lab.nodes.find(x=>x.id===previous);assert(oldSource.stopCalls.length>0,'Radio was stopped for the explanation');
  const count=recorded(h).length;for(let i=0;i<60/.04;i++)await frame(h);assert.equal(recorded(h).length,count,'No automatic radio starts while the card remains open');assert((await promise).ok);
  h.e.status='playing';h.e.phase='battle';const resumed=h.lab.nowMs;for(let i=0;i<35/.04&&recorded(h).length===count;i++)await frame(h);
  assert(recorded(h).length>count,'Radio resumes after returning to combat');assert(recorded(h).at(-1).wallMs-resumed>=3900,'No queued radio burst immediately after a card');
  const result={interruptedSource:previous,cardHoldSeconds:60,resumeDelaySeconds:(recorded(h).at(-1).wallMs-resumed)/1000,maxConcurrent:1};h.api.dispose();return result;
 });
 await test('pause-during-loading-invalidates-late-audio',async()=>{
  const h=voiceLab(entry);for(let i=0;i<70/.04&&!h.lab.requests.length;i++)await frame(h,{deliverAudio:false});assert(h.lab.requests.length);
  for(const request of h.lab.requests)request.ignoreAbort=true; // Network boundary fixture: stale completion must still be rejected.
  h.e.pause();await deliver(h);await h.lab.advance(30000);assert.equal(recorded(h).length,0,'Delayed recording starts after pause');assert(!h.api.status().busy);
  const result={pendingRequests:h.lab.requests.length,lateStarts:0,status:h.e.status};h.api.dispose();return result;
 });
 const report={version:'2.7.0',entryFile,pass:!failures.length,passed:rows.length,failed:failures.length,rows,failures,
  sources:entry.scripts.filter(f=>/citadel-(?:voice|radio)-(?:pack-)?v/.test(f)).map(file=>({file,sha256:sha(entry.sources.get(file))})),
  limits:['Deterministic isolated voice-protocol fixtures with a passive engine clock; no gameplay, browser codec timing, actual hearing or Android device claim.','MP3 durations and decoding are checked against real local assets. System TTS voices are controlled mocks.','A 3x permitted-window cadence does not imply exactly 3x spoken lines during every live combat sequence.']};
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'verifier-radio.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:file,pass:report.pass,passed:report.passed,failed:report.failed}));if(!report.pass)process.exitCode=1;
}
module.exports={voiceLab,windowRun,deliver};if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
