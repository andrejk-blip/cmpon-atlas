#!/usr/bin/env node
'use strict';

// Actual game methods in a Node VM, plus optional Web Audio DSP. No browser,
// network, microphone, speech service or production storage is used.
// node tests/combat-audio-regression.cjs
// node tests/combat-audio-regression.cjs --core ../admin/game-lab/engine-v1.2.1.js
// node tests/combat-audio-regression.cjs --render /tmp/combat-audio --audio-engine /path/to/web-audio-engine
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const {createHarness} = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');

function optionsFrom(argv) {
  const options = {cores:[],mrg:path.join(root,'assets/citadel-mrg-v1.7.0.js'),
    sfx:path.join(root,'assets/citadel-sfx-v1.7.0.js'),music:path.join(root,'assets/citadel-music-v1.4.2.js'),
    render:null,audioEngine:process.env.CITADEL_WEB_AUDIO_ENGINE,only:null};
  for (let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(key==='--core') options.cores.push(path.resolve(argv[++i]));
    else if(key==='--mrg') options.mrg=path.resolve(argv[++i]);
    else if(key==='--sfx') options.sfx=path.resolve(argv[++i]);
    else if(key==='--music') options.music=path.resolve(argv[++i]);
    else if(key==='--render') options.render=path.resolve(argv[++i]);
    else if(key==='--audio-engine') options.audioEngine=path.resolve(argv[++i]);
    else if(key==='--only') options.only=argv[++i];
    else throw new Error('Unknown argument: '+key);
  }
  if(!options.cores.length) options.cores.push(path.join(root,'assets/atlas-v1.3.5.js'));
  return options;
}
class Param {
  constructor(value=0){this.value=value;this.events=[];}
  cancelScheduledValues(t){this.events.push(['cancel',t]);}
  setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}
  setTargetAtTime(v,t,tau){this.value=v;this.events.push(['target',v,t,tau]);}
  linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t]);}
  exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exponential',v,t]);}
}
class AudioNode {
  constructor(ctx,kind){
    this.ctx=ctx;this.kind=kind;this.connections=[];this.disconnected=false;
    for(const key of ['frequency','Q','pan','detune','delayTime','threshold','knee','ratio','attack','release'])this[key]=new Param();
    this.gain=new Param(1);this.playbackRate=new Param(1);ctx.nodes.push(this);
  }
  connect(node){this.connections.push(node);return node;}
  disconnect(){this.disconnected=true;this.connections=[];}
  start(at,offset){this.startAt=at;this.offset=offset;this.started=true;}
  stop(at=this.ctx.currentTime){this.stopAt=at;}
}
class MockAudioContext {
  constructor(){this.nodes=[];this.currentTime=0;this.sampleRate=48000;this.state='running';this.destination=new AudioNode(this,'destination');}
  createGain(){return new AudioNode(this,'gain');}
  createStereoPanner(){return new AudioNode(this,'panner');}
  createBiquadFilter(){return new AudioNode(this,'filter');}
  createDelay(){return new AudioNode(this,'delay');}
  createDynamicsCompressor(){return new AudioNode(this,'compressor');}
  createOscillator(){return new AudioNode(this,'oscillator');}
  createBufferSource(){return new AudioNode(this,'buffer-source');}
  createBuffer(channels,length){
    if(this.failBuffer)throw new Error('Simulated allocation failure');
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return{length,numberOfChannels:channels,sampleRate:this.sampleRate,duration:length/this.sampleRate,getChannelData:i=>data[i]};
  }
  resume(){this.state='running';return Promise.resolve();}
  advance(time){
    this.currentTime=time;
    for(const node of this.nodes)if(node.started&&!node.ended&&node.stopAt<=time){node.ended=true;node.onended?.();}
  }
}

function fixture(core,options,audio=new MockAudioContext()) {
  const h=createHarness(core,options.mrg,null),timers=new Map(),listeners=new Map();let timerSerial=0;
  h.context.location={search:'',hash:'',origin:'https://test.invalid',pathname:'/'};
  h.context.URLSearchParams=URLSearchParams;
  h.context.setTimeout=fn=>{const id=++timerSerial;timers.set(id,fn);return id;};
  h.context.clearTimeout=id=>timers.delete(id);
  const add=h.context.document.addEventListener.bind(h.context.document);
  h.context.document.addEventListener=(kind,fn,...args)=>{(listeners.get(kind)||listeners.set(kind,[]).get(kind)).push(fn);add(kind,fn,...args);};
  h.context.document.removeEventListener=()=>{};
  h.context.AudioContext=MockAudioContext;
  if(options.music&&fs.existsSync(options.music))vm.runInContext(fs.readFileSync(options.music,'utf8'),h.context,{filename:path.basename(options.music)});
  vm.runInContext(fs.readFileSync(options.sfx,'utf8'),h.context,{filename:path.basename(options.sfx)});
  h.context.qaAudio=audio;
  vm.runInContext('ARCADE.audio=qaAudio;ARCADE.sound=true;spaceAudioInit(qaAudio);SPACE_AUDIO.music=false;globalThis.audioQA={effect:spacePlayEffect,event:arcadeEvent,stop:spaceAudioStop,action:spaceAudioAction,sync:spaceAudioSync,bus:SPACE_AUDIO};',h.context);
  const api=h.context.CITADEL_SFX,bridge=h.context.audioQA;
  function game(type='mrg') {
    const sound=h.arcade.sound;h.arcade.sound=false;
    const e=h.engine();
    if(type==='deck'){e.beginStage(0);e.beginBoarding();}
    else if(type==='space'){e.beginStage(0);e.status='playing';e.phase='battle';}
    const originalEmit=e.emit;
    e.emit=function(kind,value,...args){originalEmit.call(this,kind,value,...args);return bridge.event(kind,value,...args);};
    h.arcade.engine=e;h.arcade.sound=sound;return e;
  }
  const run=code=>vm.runInContext(code,h.context);
  return{...h,audio,api,bridge,game,run,timers,
    played:kind=>api.status().played[kind]||0,
    flush(){for(const[id,fn]of[...timers]){timers.delete(id);fn();}},
    hidden(value){h.context.document.hidden=value;for(const fn of listeners.get('visibilitychange')||[])fn();}};
}
function quiet(e) {
  e.board.invulnerable=1000;e.finale.attackClock=1000;e.finale.waveIntro=0;
  if(e.finale.tentacle)Object.assign(e.finale.tentacle,{phase:'idle',time:1000});
  if(e.finale.tentacles)Object.assign(e.finale.tentacles,{phase:'idle',time:1000});
  for(const enemy of e.board.enemies)Object.assign(enemy,{emergeDelay:1000,spawnTime:1000});
  return e;
}
function frames(f,e,seconds,input={}) {
  for(let i=0;i<Math.ceil(seconds*60);i++){
    if(f.audio.advance)f.audio.advance(f.audio.currentTime+1/60);
    e.step(1/60,typeof input==='function'?input(e,i):input);
  }
}
function putTarget(e,hp=100) {
  const enemy=e.board.enemies[0];
  Object.assign(enemy,{pos:[-17,1,0],previous:[-17,1,0],hp,maxHp:Math.max(hp,enemy.maxHp),dead:false,state:'emerging',emergeDelay:1000,spawnTime:1000});
  for(const other of e.board.enemies.slice(1)){other.dead=true;other.hp=0;other.state='dead';}
  return enemy;
}
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} vs ${b}`);

async function runCore(core,options) {
  const tests=[];
  async function test(name,fn) {
    if(options.only&&!name.includes(options.only))return;
    try{const data=await fn();tests.push({name,ok:true,...(data===undefined?{}:{data})});}
    catch(error){tests.push({name,ok:false,error:error.message,stack:error.stack.split('\n').filter(x=>/^\s+at /.test(x)).slice(0,3)});}
  }
  await test('catalog compatibility, five distinct locations, menu/paused previews and four deck profiles',async()=>{
    const f=fixture(core,options),e=f.game();e.status='menu';
    assert.equal(f.api.version,'1.7.0');assert.equal(f.api.preview,f.api.play);
    const catalog=f.api.catalog(),locations=f.api.locations();assert.equal(locations.length,5);
    for(const kind of ['shot','missile','destroy','detonate','crash','soldier-hit','soldier-death','player-damage','radio-in','radio-out'])assert(catalog.some(x=>x.kind===kind));
    const original=JSON.stringify({board:e.board,finale:e.finale});
    for(const entry of catalog){
      e.status=e.status==='menu'?'paused':'menu';const start=f.audio.nodes.length;
      assert((await f.api.play(entry.kind)).ok,entry.kind);
      assert(f.audio.nodes.slice(start).filter(x=>x.started).length>=2);
      f.audio.advance(f.audio.currentTime+2);
      assert.equal(f.api.status().activeVoices,0);
      assert(f.audio.nodes.slice(start).every(x=>x.disconnected),'Every completed voice disconnects all nodes');
    }
    assert.equal(JSON.stringify({board:e.board,finale:e.finale}),original,'Preview does not move the game to its chosen location');
    const frequencies=[];
    for(let stage=0;stage<4;stage++){
      const start=f.audio.nodes.length;assert((await f.api.play('shot-deck',{stage})).ok);
      frequencies.push(f.audio.nodes.slice(start).find(x=>x.kind==='oscillator').frequency.events.find(x=>x[0]==='set')[1]);
      f.audio.advance(f.audio.currentTime+1);
    }
    assert.equal(new Set(frequencies).size,4);return{catalog:catalog.length,locations:locations.map(x=>x.id),deckBodyHz:frequencies};
  });
  await test('automatic shots use actual location; gameplay pauses while explicit previews remain available',async()=>{
    const f=fixture(core,options),e=f.game();
    const cases=[['mrg',()=>{}],['ground',()=>{e.finale.phase='maze';}],['deck',()=>{e.finale=null;e.status='boarding';}],['convoy',()=>{e.status='playing';e.phase='escort';}],['space',()=>{e.phase='battle';}]];
    for(const[location,change]of cases){change();f.audio.advance(f.audio.currentTime+.2);assert(f.bridge.effect('shot'));assert.equal(f.api.status().lastPlayed.location,location);}
    e.pause();f.audio.advance(f.audio.currentTime+.04);assert.equal(f.api.status().activeVoices,0);
    assert.equal(f.bridge.effect('shot'),false);assert.equal(f.api.status().gameBlockedReason,'paused');
    assert((await f.api.preview('shot-ground')).ok);
  });
  await test('real deck hits/deaths sound once, preserve callbacks and replace the soldier explosion',()=>{
    const f=fixture(core,options),e=f.game('deck'),enemy=e.board.enemies[0];
    assert(enemy);const emit=e.emit,hp=enemy.hp,score=e.score;
    e.boardHit(enemy,8,enemy.pos.slice(),true);near(enemy.hp,hp-8,'Actual boardHit HP');
    assert.equal(f.played('soldier-hit'),1);assert.equal(f.played('soldier-death'),0);assert.equal(f.played('destroy'),0);
    f.audio.advance(.2);e.boardHit(enemy,10000,enemy.pos.slice(),true);
    assert(enemy.dead&&e.score>score);assert.equal(f.played('soldier-death'),1);assert.equal(f.played('destroy'),0);
    assert.equal(e.qaEvents.filter(x=>x.kind==='destroy'&&x.data==='board').length,1,'Original event arguments remain intact');
    f.audio.advance(.4);e.boardHit(enemy,10000,enemy.pos.slice(),true);
    assert.equal(f.played('soldier-death'),1);assert.equal(e.emit,emit,'Scoped emit wrapper is restored');
  });
  await test('MRG real bullets distinguish misses, nonlethal hits and deaths without per-shot hit sounds',()=>{
    const f=fixture(core,options),e=quiet(f.game()),enemy=putTarget(e,100);
    frames(f,e,.2,{fire:true,aim:[-50,12,0]});assert.equal(enemy.hp,100);assert.equal(f.played('soldier-hit'),0);
    frames(f,e,.15,{});const shotsBefore=f.played('shot');e.board.cooldown=0;e.board.bullets=[];
    e.step(1/60,{fire:true,aim:[-17,1.65,0]});frames(f,e,.22,{});
    assert(enemy.hp<100&&enemy.hp>0);assert.equal(f.played('soldier-hit'),1);assert.equal(f.played('shot'),shotsBefore+1);
    enemy.hp=1;e.board.cooldown=0;e.step(1/60,{fire:true,aim:[-17,1.65,0]});frames(f,e,.22,{});
    assert(enemy.dead);assert.equal(f.played('soldier-death'),1);assert.equal(f.played('destroy'),0);
    assert(e.qaEvents.some(x=>x.kind==='destroy'&&x.data===enemy.id));
  });
  await test('MRG grenade retains exactly one explosion while its real soldier deaths are separate',()=>{
    const f=fixture(core,options),e=quiet(f.game());
    e.board.enemies.forEach((enemy,i)=>Object.assign(enemy,{pos:[-14+i*2,1,0],hp:10}));
    e.board.bullets.push({pos:[-14,1.65,0],vel:[0,0,0],damage:1000,life:2,grenade:true});
    e.step(1/60,{});
    assert(e.board.enemies.every(x=>x.dead));assert.equal(f.played('destroy'),1);
    assert.equal(e.qaEvents.filter(x=>x.kind==='destroy'&&x.data==='grenade').length,1);
    assert.equal(f.played('soldier-death'),1,'Simultaneous deaths coalesce at the limiter instead of stacking explosions');
    assert.equal(f.played('soldier-hit'),0);
  });
  await test('player damage follows actual HP loss in space, on deck and in MRG; i-frames and quiz beeps do not repeat it',()=>{
    const f=fixture(core,options),e=quiet(f.game());e.board.invulnerable=0;
    const before=e.board.hp;e.mrgDamage(10);assert(e.board.hp<before);assert.equal(f.played('player-damage'),1);
    f.audio.advance(.3);e.mrgDamage(10);e.mrgDamage(0);assert.equal(f.played('player-damage'),1);
    f.bridge.event('damage');assert.equal(f.played('player-damage'),1,'A notification outside a damage operation remains the original UI sound');
    const deck=f.game('deck');deck.board.enemies=[];deck.board.invulnerable=0;
    const p=deck.board.pos.slice();deck.board.hostile.push({pos:[p[0],p[1],p[2]-.5],vel:[0,0,8],life:1,damage:10});
    f.audio.advance(.6);deck.step(1/60,{});assert(deck.board.hp<100);assert.equal(f.played('player-damage'),2);
    const space=f.game('space');space.player.invulnerable=0;
    f.audio.advance(.9);space.damage(10);assert(space.player.hp<100);assert.equal(f.played('player-damage'),3);
  });
  await test('a real MRG knife strike is a swing, while the jumper still has a gunshot',()=>{
    const f=fixture(core,options),e=quiet(f.game()),knife=e.board.enemies.find(x=>x.role==='knife');
    for(const enemy of e.board.enemies)if(enemy!==knife){enemy.dead=true;enemy.hp=0;}
    Object.assign(knife,{state:'active',emergeDelay:0,spawnTime:0,pos:[-22.5,1,0],knifePhase:'windup',knifeTime:.001,knifeDuration:.55,grounded:true});
    e.step(1/60,{});assert.equal(knife.knifePhase,'strike');assert.equal(f.played('knife-swing'),1);assert.equal(f.played('shot'),0);
    const next=quiet(f.game()),jumper=next.board.enemies.find(x=>x.role==='jumper');
    for(const enemy of next.board.enemies)if(enemy!==jumper){enemy.dead=true;enemy.hp=0;}
    Object.assign(jumper,{state:'active',emergeDelay:0,spawnTime:0,pos:[-10,1,0],cooldown:0,jumpCooldown:10});
    f.audio.advance(.3);next.step(1/60,{});
    assert(next.board.hostile.some(x=>x.kind==='bolt'));assert.equal(f.played('shot'),1);
  });
  await test('mute, hidden view, stop and a zero FX bus recover without affecting music preferences',async()=>{
    const f=fixture(core,options),e=f.game();
    assert((await f.api.play('destroy')).ok);f.bridge.stop();f.audio.advance(.3);
    near(f.bridge.bus.fx.gain.value,0,'Core stop fades FX');assert.equal(f.api.status().activeVoices,0);
    f.arcade.sound=false;const count=f.audio.nodes.length;
    assert.equal((await f.api.play('shot')).reason,'muted');assert.equal(f.bridge.effect('shot'),false);assert.equal(f.audio.nodes.length,count);
    near(f.bridge.bus.fx.gain.value,0,'Muted FX remain at zero');
    f.arcade.sound=true;f.hidden(true);assert.equal((await f.api.play('shot')).reason,'inactive');
    f.hidden(false);f.state.view='map';assert.equal(f.bridge.effect('shot'),false);
    f.state.view='arcade';assert((await f.api.play('shot')).ok);near(f.bridge.bus.fx.gain.value,.3,'Live FX recover');
    assert.equal(f.bridge.bus.music,false);assert.equal(f.bridge.bus.volume,.24);
    f.bridge.action('arcade-sound');f.audio.advance(.4);assert.equal(f.api.status().activeVoices,0);
    f.arcade.sound=true;e.status='lost';e.retryFinale();assert.equal(f.api.status().activeVoices,0);
  });
  await test('bounded independent voices, fallback cleanup, construction failure and preview cancellation',async()=>{
    const f=fixture(core,options);f.game();
    for(let i=0;i<80;i++)f.bridge.bus.voices.add({track:{}});
    assert((await f.api.play('shot')).ok);assert.equal(f.bridge.bus.voices.size,80);
    for(let i=0;i<20;i++)assert.equal((await f.api.play('shot-deck')).reason,'rate-limit');
    for(let i=0;i<40;i++){f.audio.currentTime+=.13;await f.api.play('destroy');}
    assert.equal(f.api.status().activeVoices,f.api.status().maxVoices);assert(f.api.status().blocked['voice-limit']>0);
    f.api.stop();f.flush();assert.equal(f.api.status().activeVoices,0);
    assert(f.audio.nodes.filter(x=>x.started).every(x=>x.disconnected));
    const fail=fixture(core,options);fail.game();fail.audio.failBuffer=true;const index=fail.audio.nodes.length;
    assert.equal((await fail.api.play('shot')).reason,'render-error');assert.equal(fail.api.status().activeVoices,0);
    assert(fail.audio.nodes.slice(index).every(x=>x.disconnected));
    const pending=fixture(core,options);pending.game();let resolve;
    pending.audio.state='suspended';pending.audio.resume=()=>new Promise(r=>resolve=r);
    const play=pending.api.play('shot');pending.api.stop();pending.audio.state='running';resolve();
    assert.equal((await play).reason,'cancelled');assert.equal(pending.api.status().activeVoices,0);
  });
  await test('radio is short, effects-muted and separately cancellable without stopping combat or music',async()=>{
    const f=fixture(core,options);f.game();
    assert((await f.api.play('detonate')).ok);assert((await f.api.play('radio-in')).ok);assert((await f.api.play('radio-out')).ok);
    assert.equal(f.api.status().radioVoices,2);f.api.stopRadio();f.audio.advance(.04);
    assert.equal(f.api.status().radioVoices,0);assert.equal(f.api.status().activeVoices,1);near(f.bridge.bus.fx.gain.value,.3,'Radio stop preserves FX bus');
    assert((await f.api.play('radio-in')).ok);f.audio.advance(.15);assert.equal(f.api.status().radioVoices,0);
    f.arcade.sound=false;assert.equal(f.bridge.effect('radio-in'),false);f.arcade.sound=true;
    const old=f.arcade.audio;f.arcade.audio=null;assert.equal(f.bridge.effect('radio-in'),false);assert.equal(f.arcade.audio,null,'Timed radio does not create context');f.arcade.audio=old;
    let resolve;f.audio.state='suspended';f.audio.resume=()=>new Promise(r=>resolve=r);
    const waiting=f.api.play('radio-in');f.api.stopRadio();f.audio.state='running';resolve();assert.equal((await waiting).reason,'cancelled');
    assert.equal(f.api.status().activeVoices,1);
    if(f.context.citadelMusic){f.context.citadelMusic.stop();assert.equal(f.api.status().activeVoices,1);}
  });
  return{core:path.basename(core),tests};
}

function metrics(data,from=0,to=Infinity) {
  const start=Math.ceil(from*data.sampleRate),end=Math.min(data.length,Math.floor(to*data.sampleRate));
  let peak=0,energy=0,count=0,nonfinite=0,differenceEnergy=0;
  for(const channel of data.channelData)for(let i=start;i<end;i++){
    const value=channel[i];if(!Number.isFinite(value))nonfinite++;
    peak=Math.max(peak,Math.abs(value));energy+=value*value;count++;
    if(i>start)differenceEnergy+=(value-channel[i-1])**2;
  }
  return{rms:Math.sqrt(energy/Math.max(1,count)),peak,nonfinite,roughness:Math.sqrt(differenceEnergy/Math.max(1,energy))};
}
async function renderDSP(options) {
  const name=options.audioEngine||require.resolve('web-audio-engine',{paths:[process.cwd(),root,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)});
  const{RenderingAudioContext}=require(name),core=options.cores[0],effects={};
  fs.mkdirSync(options.render,{recursive:true});
  async function make(){const audio=new RenderingAudioContext({sampleRate:48000,numberOfChannels:2});await audio.resume();return fixture(core,options,audio);}
  async function single(kind,metadata={},recover=false){
    const f=await make();
    if(recover){f.bridge.stop();f.audio.processTo(.35);await f.audio.resume();}
    const at=f.audio.currentTime;assert((await f.api.play(kind,metadata)).ok);
    f.audio.processTo(at+1.6);const data=f.audio.exportAsAudioData(),result=metrics(data,at,at+1.6);
    assert.equal(result.nonfinite,0);assert(result.peak<.6,kind+': excessive raw peak');
    assert(result.rms>(kind.startsWith('radio-')?.0001:.0005),kind+': missing signal');
    assert.equal(f.api.status().activeVoices,0);
    return{f,data,result,hash:crypto.createHash('sha256').update(Buffer.from(data.channelData[0].buffer)).digest('hex')};
  }
  const f=await make();
  for(const item of f.api.catalog()){
    const rendered=await single(item.kind),recovered=await single(item.kind,{},true);
    assert(recovered.result.rms>rendered.result.rms*.55,item.kind+': FX zero recovery');
    effects[item.kind]={...rendered.result,recoveredRms:recovered.result.rms,hash:rendered.hash};
    fs.writeFileSync(path.join(options.render,item.kind+'.wav'),Buffer.from(await rendered.f.audio.encodeAudioData(rendered.data)));
  }
  const locationHashes=f.api.locations().map(location=>effects[location.shotKind].hash);
  assert.equal(new Set(locationHashes).size,5,'Location gunshots are different PCM waveforms');
  const deck=[];
  for(let stage=0;stage<4;stage++){const x=await single('shot-deck',{stage});deck.push({stage,...x.result,hash:x.hash});}
  assert.equal(new Set(deck.map(x=>x.hash)).size,4);
  const variations=await make(),variationHashes=[];
  for(let i=0;i<4;i++){
    const start=variations.audio.currentTime;assert((await variations.api.play('shot-mrg')).ok);
    variations.audio.processTo(start+.5);
    const data=variations.audio.exportAsAudioData(),from=Math.round(start*data.sampleRate),to=from+Math.round(.4*data.sampleRate);
    variationHashes.push(crypto.createHash('sha256').update(Buffer.from(data.channelData[0].slice(from,to).buffer)).digest('hex'));
    await variations.audio.resume();
  }
  assert.equal(new Set(variationHashes).size,4,'Repeated shots have small timbre variations');
  const muted=await make();muted.arcade.sound=false;assert.equal((await muted.api.play('shot')).reason,'muted');muted.audio.processTo(.5);
  assert.equal(metrics(muted.audio.exportAsAudioData()).rms,0);
  const busy=await make();
  for(let i=0;i<64;i++){
    if(i){busy.audio.processTo(i*.125);await busy.audio.resume();}
    busy.bridge.effect('shot');
    if(i%2===0)busy.bridge.effect('soldier-hit');
    if(i%5===0)busy.bridge.effect('soldier-death');
    if(i%7===0)busy.bridge.effect('destroy');
    if(i%13===0)busy.bridge.effect('missile');
    if(i%11===0)busy.bridge.effect('player-damage');
    if(i%17===0)busy.bridge.effect('radio-in');
    if(i%23===0)busy.bridge.effect('detonate');
    assert(busy.api.status().activeVoices<=busy.api.status().maxVoices);
  }
  busy.audio.processTo(10);const mix=busy.audio.exportAsAudioData(),mixMetrics=metrics(mix);
  assert.equal(mixMetrics.nonfinite,0);assert(mixMetrics.peak<.8,'Busy combat clips before the master limiter');
  assert.equal(busy.api.status().activeVoices,0);
  fs.writeFileSync(path.join(options.render,'busy-combat.wav'),Buffer.from(await busy.audio.encodeAudioData(mix)));
  const withMusic=[];
  if(f.context.citadelMusic)for(const key of ['hyper0','orbit0','port','finaleMRG']){
    const combined=await make();assert((await combined.context.citadelMusic.preview(key)).ok);
    for(let i=0;i<48;i++){
      if(i){combined.audio.processTo(i*.125);await combined.audio.resume();}
      combined.bridge.sync();combined.bridge.effect('shot-mrg');
      if(i%3===0)combined.bridge.effect('soldier-hit');
      if(i%8===0)combined.bridge.effect('destroy');
      if(i%11===0)combined.bridge.effect('missile');
      if(i%13===0)combined.bridge.effect('player-damage');
    }
    combined.context.citadelMusic.stop();combined.audio.processTo(8);await combined.audio.resume();
    const at=combined.audio.currentTime;assert((await combined.api.play('shot-mrg')).ok,'Music stop preserves effects');
    combined.audio.processTo(at+.6);const data=combined.audio.exportAsAudioData(),result=metrics(data);
    assert.equal(result.nonfinite,0);assert(result.peak<.85,key+': combined output clips before limiter');
    assert(metrics(data,at,at+.6).rms>.002,'Effects remain audible after music stop');
    assert.equal(combined.api.status().activeVoices,0);
    withMusic.push({key,...result});
  }
  return{engine:'web-audio-engine offline DSP; its DynamicsCompressor is a pass-through',effects,deckStages:deck,
    repeatedShotHashes:variationHashes,busyCombat:mixMetrics,withMusic,mutedRms:0};
}
async function main(options=optionsFrom(process.argv.slice(2))) {
  const results=[];for(const core of options.cores)results.push(await runCore(core,options));
  const report={version:'1.7.0',method:'Actual game cores in Node VM; no browser QA',results};
  if(options.render){
    try{report.dsp=await renderDSP(options);}catch(error){report.dsp={ok:false,error:error.message,stack:error.stack.split('\n').slice(0,5)};}
    fs.mkdirSync(options.render,{recursive:true});fs.writeFileSync(path.join(options.render,'combat-audio-report.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
  if(results.some(x=>x.tests.some(t=>!t.ok))||report.dsp?.ok===false)process.exitCode=1;
  return report;
}
module.exports={optionsFrom,MockAudioContext,fixture,metrics,renderDSP,runCore,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
