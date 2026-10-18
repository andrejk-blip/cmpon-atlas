#!/usr/bin/env node
'use strict';
// Actual public/private cores and the shipped MP3 manifest. The existing async
// Web Audio lab controls fetch/body/decode/resume/end separately; tagged buffers
// model playback lifecycle, not the MP3's timbre or browser/device decoding.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHarness}=require('./mrg-regression.cjs');
const {createWebAudioLab}=require('./prepared-voice-regression.cjs');
const {controller:swarmController,realInput}=require('./swarm-regression.cjs');
const root=path.resolve(__dirname,'..'),asset=name=>path.join(root,'assets',name);
const runtime=asset('citadel-sfx-v1.9.1.js'),packPath=asset('citadel-sfx-pack-v1.9.1.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const slots=()=>[asset('atlas-v1.3.5.js'),path.resolve(root,'../cmpon-analytics-admin/game-lab/engine-v1.2.1.js')].filter(fs.existsSync);
const missionFiles=()=>[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script defer src="\.\/([^"?]+)"/g)]
  .map(match=>match[1]).filter(name=>/\/citadel-(flight|aim|pursuit|swarm|parallax|decks)-/.test(name));

function fixture(core,{voice=false,noAudio=false,pack=packPath,ignoreAbort=false,suspended=false,holdResume=false}={}) {
  const h=createHarness(core,asset('citadel-mrg-v1.7.0.js'),null),lab=createWebAudioLab({ignoreAbort,contextState:suspended?'suspended':'running',holdResume});
  lab.install(h.context,{speech:'throw'});
  h.context.location={href:'https://test.invalid/cmpon-atlas/',protocol:'https:',origin:'https://test.invalid',hostname:'test.invalid',search:'',hash:''};
  h.context.document.baseURI=h.context.location.href;h.context.URLSearchParams=URLSearchParams;
  const run=code=>vm.runInContext(code,h.context);
  vm.runInContext(fs.readFileSync(asset('citadel-music-v1.4.2.js'),'utf8'),h.context);
  if(typeof pack==='string')vm.runInContext(fs.readFileSync(pack,'utf8'),h.context,{filename:path.basename(pack)});
  else h.context.CITADEL_SFX_PACK=pack;
  vm.runInContext(fs.readFileSync(runtime,'utf8'),h.context,{filename:path.basename(runtime)});
  for(const file of missionFiles())vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.context,{filename:file});
  if(voice){
    vm.runInContext(fs.readFileSync(asset('citadel-voice-pack-v1.8.2.js'),'utf8'),h.context);
    vm.runInContext(fs.readFileSync(asset('citadel-voice-v1.9.0.js'),'utf8'),h.context);
  }
  if(noAudio){h.context.AudioContext=undefined;h.context.webkitAudioContext=undefined;}
  Object.assign(h,run('({bus:SPACE_AUDIO,effect:spacePlayEffect,event:arcadeEvent,audioAction:spaceAudioAction,action:arcadeAction,input:arcadeInput,sync:spaceAudioSync})'));
  h.s={input:h.input};h.arcade.sound=true;h.arcade.fx=false;h.bus.music=false;
  const api=h.context.CITADEL_SFX,manifest=h.context.CITADEL_SFX_PACK,events=[],captions=[];
  h.context.addEventListener('citadel-sfx-caption',event=>captions.push({...event.detail,engine:undefined}));
  const game=(kind='deck',assist=false,stage=1)=>{
    h.arcade.sound=false;
    const e=new h.Engine(417147,(type,value,...args)=>{events.push({type,value:clone(value??null),args:clone(args)});return h.event(type,value,...args);});
    h.arcade.engine=e;e.start(assist);e.upgrades={weapons:0,armor:0,rockets:0};
    if(kind==='deck'){e.beginStage(stage);e.beginBoarding();}
    else if(kind==='mrg'){e.beginStage(3);e.beginFinale();e.beginMRG();}
    else if(kind==='ground'){e.beginStage(3);e.beginFinale();e.beginLair();}
    else if(kind==='convoy'){e.beginStage(0);e.status='stageclear';e.upgradeChoice='weapons';assert(e.beginEscort());e.launch();}
    else {e.beginStage(kind==='swarm'?2:0);e.launch();if(kind==='space')e.phase='battle';}
    h.arcade.sound=true;h.state.view='arcade';return e;
  };
  return {...h,lab,api,manifest,events,captions,run,game,
    count:kind=>api.status().played[kind]||0,
    starts:()=>lab.events.filter(event=>event.type==='source-start'&&event.clipId),
    sources:()=>lab.nodes.filter(node=>node.kind==='buffer-source'&&node.buffer?.qaClipId)};
}
function clipFor(f,url){const filename=String(url).split('/').pop();return [...(f.manifest?.clips||[]),...(f.context.CITADEL_VOICE_PACK?.clips||[])].find(clip=>clip.file===filename);}
async function release(f,{fetch=true,decode=true}={}) {
  if(fetch)for(const request of f.lab.requests)if(!request.aborted||request.ignoreAbort){
    if(request.headersReady.state==='pending')request.respond();
    if(request.bodyReady.state==='pending')request.resolveBody(f.lab.bytes(clipFor(f,request.url)?.id||path.basename(request.url,'.mp3')));
  }
  await f.lab.flush();
  if(decode)for(const request of f.lab.decodes)if(request.completion.state==='pending'){
    const clip=[...(f.manifest?.clips||[]),...(f.context.CITADEL_VOICE_PACK?.clips||[])].find(clip=>clip.id===request.clipId);
    request.resolve({duration:clip?.duration||.4});
  }
  await f.lab.flush();
}
async function warm(f,kinds) {
  const promise=f.api.preload(kinds?{kinds}:{all:true});
  for(let i=0;i<60&&f.api.status().loadingClips;i++)await release(f);
  const result=await promise;assert(result.ok,JSON.stringify(result));assert.equal(f.api.status().loadingClips,0);return result;
}
async function frames(f,e,seconds,input={}) {
  for(let i=0;i<Math.ceil(seconds*60);i++){
    e.step(1/60,typeof input==='function'?input(e,i):input);
    await f.lab.advance(1000/60);
  }
}
function quiet(e) {
  e.board.invulnerable=1000;e.finale.attackClock=1000;e.finale.waveIntro=0;
  for(const key of ['tentacle','tentacles'])if(e.finale[key])Object.assign(e.finale[key],{phase:'idle',time:1000});
  for(const enemy of e.board.enemies)Object.assign(enemy,{emergeDelay:1000,spawnTime:1000});
  return e;
}
function target(e,hp=100) {
  const enemy=e.board.enemies[0];
  Object.assign(enemy,{pos:[-17,1,0],previous:[-17,1,0],hp,maxHp:Math.max(hp,enemy.maxHp),dead:false,state:'emerging',emergeDelay:1000,spawnTime:1000});
  for(const other of e.board.enemies.slice(1)){other.dead=true;other.hp=0;other.state='dead';}
  return enemy;
}
const humanStarts=f=>f.starts().filter(event=>f.manifest.clips.find(clip=>clip.id===event.clipId)?.kind.startsWith('soldier-'));
const state=e=>clone({seed:e.seed,stage:e.stage,status:e.status,phase:e.phase,player:e.player,board:e.board,finale:e.finale,
  enemies:e.enemies,bullets:e.bullets,hostile:e.hostile,score:e.score,elapsed:e.elapsed,totalKills:e.totalKills,stageKills:e.stageKills,
  rescued:e.rescued,decisions:e.decisions,rng:e.random.getState?.()});

async function suite(core){
  const results=[];
  async function test(name,fn){try{const detail=await fn();results.push({name,ok:true,...(detail===undefined?{}:{detail})});}
    catch(error){results.push({name,ok:false,error:error.message,stack:error.stack?.split('\n').slice(1,5)});}}
  await test('Published recorded catalog, bounded asynchronous preload and shared context',async()=>{
    const f=fixture(core);f.game();assert.equal(f.api.version,'1.9.1');assert.equal(f.api.play,f.api.preview);
    assert.equal(f.lab.requests.length,0,'Merely loading the module and muted scene fixture does not request audio');
    for(const kind of ['armor-hit','soldier-death-voice','robot-death'])assert(f.api.catalog().some(item=>item.kind===kind));
    const promise=f.api.preload({all:true});assert.equal(f.api.ready,promise);assert(f.lab.requests.length<=4);
    assert.equal(f.lab.contexts.length,1);assert.equal(f.arcade.audio,f.lab.contexts[0]);
    for(let i=0;i<60&&f.api.status().loadingClips;i++){assert(f.api.status().decodingOrFetching<=4);await release(f);}
    assert((await promise).ok);assert.equal(f.api.status().loadedClips,f.manifest.clips.length);
    assert(f.api.status().cachedBytes<=16*1024*1024);assert.equal(f.lab.speech.spoken.length,0);
    return {clips:f.manifest.clips.length,contexts:f.lab.contexts.length,cacheBytes:f.api.status().cachedBytes,maxConcurrentLoads:f.api.status().maxLoads};
  });
  await test('All five actual scene shot paths use distinct recorded pools and rotate variants',async()=>{
    const f=fixture(core),output=[];
    for(const place of ['ground','deck','convoy','space','mrg']){
      const e=f.game(place);await warm(f);if(place==='mrg')quiet(e);
      const ids=[];
      for(let i=0;i<3;i++){
        if(e.board&&e.status==='boarding')e.board.cooldown=0;else e.player.shotCooldown=0;
        e.step(1/60,{fire:true,aim:place==='mrg'?[-45,10,0]:undefined});
        const sample=f.api.status().lastPlayed;
        assert.equal(sample.kind,'shot');assert.equal(sample.location,place);assert.equal(sample.backend,'recorded');
        const clip=f.manifest.clips.find(clip=>clip.id===sample.clipId);assert.equal(clip.kind,'shot-'+place);ids.push(clip.id);
        await f.lab.advance(1600);
      }
      assert.equal(new Set(ids).size,3,place+' rotates real files');output.push({place,clips:ids});
    }
    assert.equal(f.lab.contexts.length,1);return output;
  });
  await test('Real deck HP hits and deaths deduplicate; callbacks and player state remain intact',async()=>{
    const f=fixture(core),e=f.game(),enemy=e.board.enemies[0];await warm(f);
    const emit=e.emit,hp=enemy.hp,score=e.score;
    e.boardHit(enemy,8,enemy.pos.slice(),true);assert.equal(enemy.hp,hp-8);
    assert.equal(f.count('armor-hit'),1);assert.equal(f.count('soldier-hit'),1);assert.equal(f.count('destroy'),0);
    await f.lab.advance(1700);e.boardHit(enemy,10000,enemy.pos.slice(),true);
    assert(enemy.dead&&e.score>score);assert.equal(f.count('armor-hit'),2);
    assert.equal(f.count('soldier-death')+f.count('soldier-death-voice'),1);assert.equal(f.count('destroy'),0);
    assert.equal(f.events.filter(item=>item.type==='destroy'&&item.value==='board').length,1);
    const count=humanStarts(f).length;await f.lab.advance(7000);e.boardHit(enemy,10000,enemy.pos.slice(),true);
    assert.equal(humanStarts(f).length,count);assert.equal(e.emit,emit);
    assert.equal(f.lab.speech.spoken.length,0);
  });
  await test('Actual MRG bullets distinguish misses, nonlethal hits, and death; no vocal reaction on a miss',async()=>{
    const f=fixture(core),e=quiet(f.game('mrg')),enemy=target(e,100);await warm(f);
    await frames(f,e,.2,{fire:true,aim:[-50,12,0]});assert.equal(enemy.hp,100);assert.equal(humanStarts(f).length,0,'A miss and old corpses do not create a new hit/death reaction');
    await f.lab.advance(1600);e.board.cooldown=0;e.board.bullets=[];
    e.step(1/60,{fire:true,aim:[-17,1.65,0]});await frames(f,e,.25);
    assert(enemy.hp<100&&enemy.hp>0);assert.equal(f.count('soldier-hit'),1);assert.equal(f.count('armor-hit'),1);
    await f.lab.advance(1600);enemy.hp=1;e.board.cooldown=0;e.step(1/60,{fire:true,aim:[-17,1.65,0]});await frames(f,e,.25);
    assert(enemy.dead);assert.equal(f.count('soldier-death')+f.count('soldier-death-voice'),1);assert.equal(f.count('destroy'),0);
    assert(f.events.some(item=>item.type==='destroy'&&item.value===enemy.id));
  });
  await test('Real grenade keeps one explosion and distinct coalesced soldier deaths',async()=>{
    const f=fixture(core),e=quiet(f.game('mrg'));await warm(f);
    e.board.enemies.forEach((enemy,i)=>Object.assign(enemy,{pos:[-14+i*2,1,0],hp:10}));
    e.board.bullets.push({pos:[-14,1.65,0],vel:[0,0,0],damage:1000,life:2,grenade:true});e.step(1/60,{});
    assert(e.board.enemies.every(enemy=>enemy.dead));assert.equal(f.count('destroy'),1);
    assert.equal(f.count('soldier-death')+f.count('soldier-death-voice'),1);assert.equal(f.count('soldier-hit'),0);
    assert.equal(f.api.status().humanVoices,1);assert.equal(f.events.filter(item=>item.type==='destroy'&&item.value==='grenade').length,1);
  });
  await test('Actual player HP damage in normal/calm space, deck and MRG; invulnerability prevents duplicates',async()=>{
    const f=fixture(core),details=[];
    for(const assist of [false,true])for(const place of ['space','deck','mrg']){
      const e=f.game(place,assist);await warm(f);const before=f.count('player-damage'),health=place==='space'?e.player:e.board;
      if(place==='mrg'){quiet(e);e.board.invulnerable=0;e.mrgDamage(10);e.mrgDamage(10);}
      else if(place==='space'){e.player.invulnerable=0;e.damage(10);e.damage(10);}
      else {e.board.enemies=[];e.board.invulnerable=0;const p=e.board.pos;
        e.board.hostile.push({pos:[p[0],p[1],p[2]-.4],vel:[0,0,8],life:1,damage:10});e.step(1/60,{});}
      assert(health.hp<100);assert.equal(f.count('player-damage'),before+1);
      f.event('damage');assert.equal(f.count('player-damage'),before+1,'A UI error beep is not player HP damage');
      details.push({place,assist,hp:health.hp});await f.lab.advance(1000);
    }return details;
  });
  await test('MRG knife and late-loaded deck ninja use knife recordings; gunner uses gun recordings',async()=>{
    const f=fixture(core),e=quiet(f.game('mrg'));await warm(f);
    const knife=e.board.enemies.find(enemy=>enemy.role==='knife');assert(knife);
    for(const enemy of e.board.enemies)if(enemy!==knife){enemy.dead=true;enemy.hp=0;}
    Object.assign(knife,{state:'active',emergeDelay:0,spawnTime:0,pos:[-22.5,1,0],knifePhase:'windup',knifeTime:.001,knifeDuration:.55,grounded:true});
    e.step(1/60,{});assert.equal(knife.knifePhase,'strike');assert.equal(f.count('knife-swing'),1);assert.equal(f.count('shot'),0);
    const deck=f.game('deck',false,2);await warm(f);const ninja=deck.board.enemies.find(x=>x.archetype==='ninja')||deck.board.enemies[0];
    ninja.archetype='ninja';ninja.dead=false;ninja.stun=0;ninja.decksArrival=0;ninja.alert=true;
    ninja.decksAttack={kind:'dash',phase:'windup',time:1,windup:1,aim:deck.board.pos.slice(),origin:ninja.pos.slice(),direction:[0,0,1],damage:10,radius:1,duration:.5,recovery:.8};
    deck.enemyBoardStep(ninja,1/60);assert.equal(f.count('knife-swing'),2,'Late decks wrapper is observed by the final instance method');
    const next=quiet(f.game('mrg'));await warm(f);const jumper=next.board.enemies.find(enemy=>enemy.role==='jumper');
    for(const enemy of next.board.enemies)if(enemy!==jumper){enemy.dead=true;enemy.hp=0;}
    Object.assign(jumper,{state:'active',emergeDelay:0,spawnTime:0,pos:[-10,1,0],cooldown:0,jumpCooldown:10});
    next.step(1/60,{});assert(next.board.hostile.some(shot=>shot.kind==='bolt'));assert.equal(f.count('shot'),1);
  });
  await test('Robodog deaths and actual Galaga drone kills never produce human voices',async()=>{
    const f=fixture(core),e=f.game();await warm(f);const dog=e.board.enemies[0];dog.archetype='robodog';
    e.boardHit(dog,10000,dog.pos.slice(),true);assert(dog.dead);assert.equal(f.count('robot-death'),1);assert.equal(humanStarts(f).length,0);
    const arena=f.game('swarm');await warm(f);const operate=swarmController(f.context.CITADEL_SWARM);
    for(let i=0;i<600&&!arena.stageKills;i++){arena.step(1/60,realInput(f,arena,operate(arena)));await f.lab.advance(1000/60);}
    assert(arena.stageKills>0);assert(f.count('robot-death')>=2);assert.equal(humanStarts(f).length,0);
    assert(f.count('robot-hit')>0);return {realDroneKills:arena.stageKills,robotHits:f.count('robot-hit'),humanVoices:0};
  });
  await test('Actual space and convoy projectile kills coalesce legacy type-labelled destroy events into one mechanical death',async()=>{
    const output=[];
    for(const place of ['space','convoy']){
      const f=fixture(core),e=f.game(place);await warm(f);
      e.autopilot=false;Object.assign(e.player,{pos:[0,0,0],yaw:0,pitch:0,speed:0});
      if(place==='convoy')e.spawnEscortEnemy(11);else {e.nextWave();e.spawnEnemy();}
      const enemy=e.enemies.at(-1);assert(enemy,'The actual scene spawns a ship');
      Object.assign(enemy,{pos:[0,0,-22],vel:[0,0,0],warp:0,hp:1,shot:100});
      await frames(f,e,.3,{fire:true});assert(enemy.dead);assert(e.shots>0);
      assert.equal(f.count('robot-death'),1);assert.equal(f.count('destroy'),0,'The legacy event is already represented by the mechanical death');
      assert.equal(humanStarts(f).length,0);
      assert(f.events.some(item=>item.type==='destroy'&&item.value===(place==='convoy'?'escort':enemy.type)),'Original analytics/UI callback remains intact');
      output.push({place,shotCount:e.shots,mechanicalDeaths:f.count('robot-death'),humanVoices:0});
    }return output;
  });
  await test('Rare death lines are recorded, approximately 30%, spaced ≥6.5 s, one at a time and never queued',async()=>{
    const f=fixture(core),e=f.game();await warm(f);const base=clone(e.board.enemies[0]);
    for(let i=0;i<120;i++){
      const enemy={...clone(base),id:'voice-frequency-'+i,hp:1,maxHp:1,dead:false};e.board.enemies=[enemy];
      e.boardHit(enemy,10000,enemy.pos.slice(),true);assert(f.api.status().humanVoices<=1);await f.lab.advance(7000);
    }
    const rare=f.starts().filter(event=>f.manifest.clips.find(clip=>clip.id===event.clipId)?.kind==='soldier-death-voice');
    assert(rare.length>=30&&rare.length<=42,JSON.stringify({rare:rare.length,total:120}));
    for(let i=1;i<rare.length;i++)assert(rare[i].when-rare[i-1].when>=6.5);
    assert.equal(f.captions.length,rare.length);assert(f.captions.every(item=>item.text&&item.pos&&item.duration>0));
    assert(new Set(rare.map(item=>item.clipId)).size>=3);assert.equal(f.lab.speech.spoken.length,0);
    const before=rare.length;
    for(let i=0;i<16;i++){const enemy={...clone(base),id:'burst-'+i,hp:1,maxHp:1,dead:false};e.board.enemies=[enemy];e.boardHit(enemy,10000,enemy.pos.slice(),true);}
    const starts=f.starts().length;await f.lab.advance(12000);assert.equal(f.starts().length,starts,'No speech is queued after a kill burst');
    return {eligibleDeaths:120,rareLines:before,probability:before/120,cooldown:f.api.status().deathVoiceCooldown,captionEvents:f.captions.length};
  });
  await test('The real prepared captain immediately interrupts soldier speech and gets priority while loading/playing',async()=>{
    const f=fixture(core,{voice:true}),e=f.game();await warm(f);
    const played=f.api.play('soldier-death-voice');await release(f);assert((await played).ok);assert.equal(f.api.status().humanVoices,1);
    const soldier=f.sources().find(node=>node.buffer.qaClipId.startsWith('soldier-death-voice')&&!node.ended);assert(soldier);
    const captain=f.context.CITADEL_VOICE.previewCommander();await f.lab.flush();
    assert.equal(f.api.status().humanVoices,0);assert(soldier.stopCalls.length&&soldier.disconnected);
    assert.equal((await f.api.play('soldier-hit')).reason,'captain-priority');
    await release(f);assert((await captain).ok);assert.equal(f.context.CITADEL_VOICE.status().source,'recorded');
    assert.equal((await f.api.play('soldier-death')).reason,'captain-priority');
    assert((await f.api.play('armor-hit')).ok);assert.equal(f.arcade.audio,f.lab.contexts[0]);assert.equal(f.lab.contexts.length,1);
    assert.equal(f.lab.speech.spoken.length,0);f.context.CITADEL_VOICE.stop();
  });
  await test('Cold game events remain synchronous and never replay after asynchronous fetch/decode',async()=>{
    const f=fixture(core),e=f.game('space');const warming=f.api.preload({kinds:['shot-space']});
    e.player.shotCooldown=0;e.step(1/60,{fire:true});assert(e.shots>0);assert.equal(f.count('shot'),1);
    assert.equal(f.api.status().lastPlayed.backend,'fallback');assert.equal(f.starts().length,0);
    for(let i=0;i<5;i++)await release(f);assert((await warming).ok);assert.equal(f.starts().length,0,'The old shot is not waiting behind decode');
    await f.lab.advance(300);e.player.shotCooldown=0;e.step(1/60,{fire:true});assert.equal(f.api.status().lastPlayed.backend,'recorded');assert.equal(f.starts().length,1);
  });
  await test('Cancelled late fetch/body/decode, suspended resume and scene changes cannot start obsolete previews',async()=>{
    for(const boundary of ['headers','body','decode','resume']){
      const f=fixture(core,{ignoreAbort:true,suspended:boundary==='resume',holdResume:boundary==='resume'});f.game();
      const promise=f.api.play('soldier-death-voice');await f.lab.flush();
      if(boundary==='body')for(const request of f.lab.requests)request.respond();
      if(boundary==='decode'||boundary==='resume')await release(f,{decode:false});
      f.api.stop();await f.lab.flush();assert.equal((await promise).reason,'cancelled',boundary+' settles without waiting for stale work');
      for(const request of f.lab.resumes)if(request.completion.state==='pending')request.resolve();
      await release(f);await f.lab.advance(9000);assert.equal(f.starts().length,0,boundary);assert.equal(f.api.status().activeVoices,0);
    }
    const f=fixture(core);const e=f.game();const promise=f.api.play('shot');await release(f,{decode:false});
    e.beginStage(2);await release(f);assert.equal((await promise).reason,'cancelled');assert.equal(f.starts().length,0);
  });
  await test('Pause, mute, hidden page, exit and cleanup stop only effects while preserving music and the shared context',async()=>{
    const f=fixture(core),e=f.game();await warm(f);const ctx=f.arcade.audio;
    for(let i=0;i<20;i++)f.bus.voices.add({track:{}});const musicCount=f.bus.voices.size;
    for(const stop of [()=>e.pause(),()=>f.audioAction('arcade-sound'),()=>f.lab.hide(true),()=>f.lab.dispatch('window','pagehide'),()=>f.action('arcade-menu')]){
      if(e.status==='paused')e.resume();f.arcade.engine=e;f.arcade.sound=true;f.context.document.hidden=false;f.state.view='arcade';
      assert((await f.api.play('detonate')).ok);stop();await f.lab.flush();assert.equal(f.api.status().activeVoices,0);
      assert(f.sources().every(node=>node.disconnected));assert.equal(f.bus.voices.size,musicCount);assert.equal(f.bus.music,false);
    }
    assert.equal(f.arcade.audio,ctx);assert.equal(ctx.closeCalls,0);assert.equal(f.lab.contexts.length,1);
  });
  await test('Voice and sample polyphony are bounded, completed nodes disconnect, radio cancels independently',async()=>{
    const f=fixture(core);f.game();await warm(f);let peak=0;
    for(let i=0;i<40;i++){
      f.arcade.audio.currentTime+=.29;f.effect('detonate');peak=Math.max(peak,f.api.status().activeVoices);
    }
    assert.equal(peak,14);assert(f.api.status().blocked['voice-limit']>0);assert.equal(f.bus.voices.size,0);
    f.api.stop();await f.lab.flush();assert.equal(f.api.status().activeVoices,0);
    assert((await f.api.play('destroy')).ok);assert((await f.api.play('radio-in')).ok);assert.equal(f.api.status().radioVoices,1);
    f.api.stopRadio();assert.equal(f.api.status().radioVoices,0);assert.equal(f.api.status().activeVoices,1);
    await f.lab.advance(5000);assert.equal(f.api.status().activeVoices,0);assert(f.sources().every(node=>node.disconnected));
    return {peak,limit:f.api.status().maxVoices};
  });
  await test('HTTP/decode failures and absent Audio/fetch do not break actual gameplay or cause retry storms',async()=>{
    for(const failure of ['http','decode']){
      const f=fixture(core);const e=f.game('space');const pending=f.api.preload({kinds:['shot-space']});
      if(failure==='http')for(const request of f.lab.requests)request.respond({status:404});
      else {await release(f,{decode:false});for(const request of f.lab.decodes)request.reject();}
      await f.lab.flush();assert.equal((await pending).ok,false);const requests=f.lab.requests.length;
      for(let i=0;i<8;i++){e.player.shotCooldown=0;e.step(1/60,{fire:true});await f.lab.advance(130);}
      assert.equal(f.lab.requests.length,requests);assert(e.shots>=8);assert.equal(f.api.status().lastPlayed.backend,'fallback');
    }
    const f=fixture(core,{noAudio:true}),e=f.game('space');assert.equal((await f.api.preload()).reason,'context-unavailable');
    e.step(1/60,{fire:true});assert(e.shots>0);assert.equal(f.lab.contexts.length,0);assert.equal(f.lab.speech.spoken.length,0);
  });
  await test('Audio observation and previews preserve real gameplay state, seed and late replacement emit callback',async()=>{
    const a=fixture(core),b=fixture(core),e=a.game('swarm'),control=b.game('swarm');await warm(a);await warm(b);
    const before=state(e);assert((await a.api.play('shot-deck')).ok);assert.deepEqual(state(e),before);
    const callbackEvents=[];const prior=e.emit;e.emit=function(...args){callbackEvents.push(args);return prior.apply(this,args);};const callback=e.emit;
    b.arcade.sound=false;
    for(let i=0;i<180;i++){const input={fire:true,turn:Math.sin(i*.06)*.8,pitch:-.3};e.step(1/60,input);control.step(1/60,input);await a.lab.advance(1000/60);}
    assert.deepEqual(state(e),state(control),'Audio does not consume engine RNG or alter collision/score/progression');
    assert.equal(e.emit,callback);assert(callbackEvents.some(args=>args[0]==='shot'));
    assert(!Object.keys(e).includes('step'),'Instance observation methods do not enter serialised game data');
  });
  return {core:path.basename(core),coreSha256:sha(core),passed:results.filter(result=>result.ok).length,total:results.length,results};
}

async function main(argv=process.argv.slice(2)){
  const options={cores:[],report:null};
  for(let i=0;i<argv.length;i++)if(argv[i]==='--core')options.cores.push(path.resolve(argv[++i]));else if(argv[i]==='--report')options.report=path.resolve(argv[++i]);
  else throw Error('Usage: recorded-combat-audio-regression.cjs [--core path] [--report path]');
  if(!options.cores.length)options.cores=slots();
  const results=[];for(const core of options.cores)results.push(await suite(core));
  const report={version:'1.9.1',method:'Actual frozen game cores, current later mission wrappers, real published SFX manifest and independently controlled Web Audio/fetch/decode lifecycle mocks. No browser, real network, speech engine, MP3 codec or audio-quality claim.',
    runtimeSha256:sha(runtime),packSha256:sha(packPath),results};
  if(options.report)fs.writeFileSync(options.report,JSON.stringify(report,null,2)+'\n');
  const failures=results.flatMap(result=>result.results.filter(test=>!test.ok).map(test=>({core:result.core,...test})));
  console.log(JSON.stringify({passed:results.reduce((n,r)=>n+r.passed,0),total:results.reduce((n,r)=>n+r.total,0),report:options.report,failures},null,2));
  if(failures.length)process.exitCode=1;return report;
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,warm,release,frames,quiet,target,state,suite,main};
