/* Citadel CSII 1.9.1 — recorded combat, on the existing shared AudioContext.
 * CITADEL_SFX_PACK = {version,baseUrl,clips:[{id,kind,file,gain?,rate?,caption?}]}.
 * Gameplay never waits for a recording and never replays an old load-miss.
 * Only explicit preview awaits decode. Human reactions have one unqueued lane;
 * the captain takes priority. No speech synthesis or saved gameplay fields.
 */
(function () {
  'use strict';
  const VERSION = '1.9.3';
  if (typeof ARCADE === 'undefined' || typeof SPACE_AUDIO === 'undefined' || typeof STATE === 'undefined' ||
      typeof spacePlayEffect !== 'function' || typeof spaceAudioStop !== 'function' || typeof arcadeAudio !== 'function') return;
  if (globalThis.CITADEL_SFX?.version === VERSION) return;
  const originalEffect = spacePlayEffect, originalStop = spaceAudioStop, originalAudio = arcadeAudio;
  const MAX_VOICES = 14, MAX_LOADS = 4, MAX_BUFFERS = 48, MAX_BYTES = 16 * 1024 * 1024;
  const LOAD_TIMEOUT = 6000, RARE_COOLDOWN = 6.5, RARE_CHANCE = .30;
  const locations = Object.freeze([
    {id:'ground',title:'Наземный лабиринт',shotKind:'shot-ground'},
    {id:'deck',title:'Палубы Цитадели',shotKind:'shot-deck'},
    {id:'convoy',title:'Сопровождение конвоя',shotKind:'shot-convoy'},
    {id:'space',title:'Космический бой',shotKind:'shot-space'},
    {id:'mrg',title:'Арена МРГ',shotKind:'shot-mrg'}
  ]);
  const definitions = Object.freeze({
    shot:{title:'Выстрел текущего этапа',interval:.095,group:'weapon',gain:1},
    'shot-ground':{title:'Выстрел · наземный лабиринт',interval:.095,group:'location',location:'ground',gain:1},
    'shot-deck':{title:'Выстрел · палуба',interval:.095,group:'location',location:'deck',gain:1},
    'shot-convoy':{title:'Выстрел · конвой',interval:.095,group:'location',location:'convoy',gain:1},
    'shot-space':{title:'Выстрел · космос',interval:.095,group:'location',location:'space',gain:1},
    'shot-mrg':{title:'Выстрел · МРГ',interval:.095,group:'location',location:'mrg',gain:1},
    missile:{title:'Пуск ракеты / гранаты',interval:.12,group:'weapon',gain:1},
    destroy:{title:'Взрыв цели',interval:.085,group:'weapon',gain:1},
    detonate:{title:'Мощный взрыв',interval:.28,group:'weapon',gain:1},
    crash:{title:'Авария корабля',interval:.28,group:'weapon',gain:1},
    'armor-hit':{title:'Попадание в броню',interval:.055,group:'combat',gain:.86},
    'soldier-hit':{title:'Короткая реакция солдата',interval:.12,group:'combat',human:true,gain:.72},
    'soldier-death':{title:'Солдат повержен',interval:.10,group:'combat',human:true,gain:.88},
    'soldier-death-voice':{title:'Редкая реплика солдата',interval:.10,group:'combat',human:true,phrase:true,gain:1},
    'robot-bark':{title:'Робопёс · рывок',interval:1.3,group:'combat',gain:.80},
    'robot-hit':{title:'Попадание в робота',interval:.055,group:'combat',gain:.86},
    'robot-death':{title:'Робот или дрон уничтожен',interval:.085,group:'combat',gain:.9},
    'player-damage':{title:'Урон игроку',interval:.18,group:'combat',gain:1},
    'knife-swing':{title:'Взмах ножа',interval:.14,group:'combat',gain:.9},
    'radio-in':{title:'Радиоканал · вход',interval:.12,group:'radio',gain:.24},
    'radio-out':{title:'Радиоканал · выход',interval:.12,group:'radio',gain:.22}
  });
  const active = new Set(), times = new Map(), cursors = new Map(), attached = new WeakMap(), deathsSeen = new WeakSet();
  const cache = new Map(), loading = new Map(), queue = [], failures = new Map(), fallbackBuffers = new WeakMap();
  const pendingOperations = new Set(), CANCELLED = Object.freeze({cancelled:true});
  const played = Object.create(null), blocked = Object.create(null), clipsPlayed = Object.create(null);
  let packRef, pack = {clips:[],pools:new Map(),baseUrl:''}, cacheContext = null, cachedBytes = 0, inFlight = 0;
  let generation = 0, radioGeneration = 0, serial = 0, humanSeed = 1329170, lastPhrase = null;
  let lastPlayed = null, lastError = '', frame = null, event = null, warming = false, warmKey = '';
  let warmPromise = Promise.resolve({ok:false,loaded:0,failed:0,reason:'not-requested'});
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wall = () => typeof performance?.now === 'function' ? performance.now() / 1000 : Date.now() / 1000;
  const captainBusy = () => { try { return !!globalThis.CITADEL_VOICE?.status?.().busy; } catch (_) { return false; } };
  const humanVoices = () => [...active].filter(voice => definitions[voice.kind]?.human);
  function boundary(promise, radio=false) {
    let cancel;
    const cancellation=new Promise(resolve=>{cancel=()=>resolve(CANCELLED);}), operation={cancel,radio};
    pendingOperations.add(operation);
    return Promise.race([promise,cancellation]).finally(()=>pendingOperations.delete(operation));
  }
  function locationFor(e = ARCADE.engine) {
    const phase = e?.finale?.phase;
    if (['mrg','upload','victory'].includes(phase)) return 'mrg';
    if (['maze','landing'].includes(phase)) return 'ground';
    if (e?.phase === 'escort') return 'convoy';
    if (e?.board && (['boarding','remark','finalcheck'].includes(e.status) || e.status === 'paused' && e.resumeStatus === 'boarding')) return 'deck';
    return 'space';
  }
  function blockedReason(preview = false) {
    if (!ARCADE.sound) return 'muted';
    if (document.hidden || STATE.view !== 'arcade') return 'inactive';
    if (!preview && ARCADE.engine?.status === 'paused') return 'paused';
    return '';
  }
  function fail(kind, reason) { blocked[reason] = (blocked[reason] || 0) + 1; return {ok:false,kind,reason}; }
  function poolKey(kind, metadata) { return kind === 'shot' ? 'shot-' + metadata.location : kind; }
  function prepared() {
    const next = globalThis.CITADEL_SFX_PACK;
    if (next === packRef) return pack;
    if (packRef !== undefined) { cancelLoads('pack-changed'); cache.clear(); cachedBytes = 0; cursors.clear(); }
    packRef = next;
    const clips = [], pools = new Map(), ids = new Set();
    for (const value of Array.isArray(next?.clips) ? next.clips.slice(0, 96) : []) {
      if (!value || typeof value.id !== 'string' || ids.has(value.id) || !has(definitions, value.kind) ||
          typeof value.file !== 'string' || !value.file || value.file.length > 1000) continue;
      const clip = {...value, gain:clamp(Number.isFinite(value.gain)?value.gain:1,0,2), rate:clamp(Number.isFinite(value.rate)?value.rate:1,.7,1.3)};
      clips.push(clip); ids.add(clip.id);
      if (!pools.has(clip.kind)) pools.set(clip.kind, []);
      pools.get(clip.kind).push(clip);
    }
    pack = {clips,pools,baseUrl:String(next?.baseUrl || './assets/combat-audio-v1.9.1/')};
    return pack;
  }
  function poolFor(kind, metadata = {}) {
    const pools = prepared().pools, key = poolKey(kind, metadata);
    if (pools.get(key)?.length) return pools.get(key);
    const alias = {'player-damage':'armor-hit','robot-hit':'armor-hit','robot-death':'destroy',detonate:'destroy',crash:'destroy'}[key];
    return pools.get(alias) || [];
  }
  function urlFor(clip) {
    const base = prepared().baseUrl;
    try { return new URL(clip.file, new URL(base, document.baseURI || globalThis.location?.href)).href; }
    catch (_) { return base.replace(/\/?$/, '/') + clip.file; }
  }
  function bufferFor(clip) {
    const key = urlFor(clip), item = cache.get(key);
    if (!item) return null;
    cache.delete(key); cache.set(key, item); return item.buffer;
  }
  function remember(key, buffer) {
    const size = Math.max(0, Number(buffer.length)||0) * Math.max(1, Number(buffer.numberOfChannels)||1) * 4;
    if (size > MAX_BYTES) return false;
    const old = cache.get(key); if (old) cachedBytes -= old.size;
    cache.delete(key); cache.set(key,{buffer,size}); cachedBytes += size;
    while (cache.size > MAX_BUFFERS || cachedBytes > MAX_BYTES) {
      const first = cache.keys().next().value; cachedBytes -= cache.get(first).size; cache.delete(first);
    }
    return true;
  }
  function decode(ctx, bytes) {
    return new Promise((resolve,reject) => {
      try { const result = ctx.decodeAudioData(bytes,resolve,reject); if (result?.then) result.then(resolve,reject); }
      catch (error) { reject(error); }
    });
  }
  function cancelLoads(reason) {
    generation++; warmKey = '';
    for (const operation of pendingOperations) operation.cancel();
    queue.length = 0;
    for (const job of [...loading.values()]) { job.cancelled = true; try { job.controller?.abort(); } catch (_) {} job.finish(null, reason); }
  }
  function contextChanged(ctx) {
    if (cacheContext === ctx) return;
    cancelLoads('context-changed'); for (const voice of [...active]) voice.stop();
    cache.clear(); cachedBytes = 0; failures.clear(); times.clear(); cacheContext = ctx; lastPhrase = null;
  }
  function drain() {
    while (inFlight < MAX_LOADS && queue.length) {
      const job = queue.shift(); if (job.done || job.cancelled) continue;
      job.running = true; inFlight++;
      (async () => {
        try {
          const response = await globalThis.fetch(job.url,{cache:'force-cache',credentials:'same-origin',...(job.controller?{signal:job.controller.signal}:{})});
          if (job.done || job.token !== generation) return;
          if (!response?.ok) throw Error('recording-http-' + String(response?.status || 'error'));
          const bytes = await response.arrayBuffer(); if (job.done || job.token !== generation) return;
          if (!bytes?.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw Error('recording-size');
          const buffer = await decode(job.context,bytes); if (job.done || job.token !== generation) return;
          if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 12) throw Error('recording-decode');
          remember(job.url,buffer); failures.delete(job.url); job.finish(buffer);
        } catch (error) {
          if (!job.done) { lastError = String(error?.message || error); failures.set(job.url,wall()+10); job.finish(null,lastError); }
        } finally {
          if (!job.done) job.finish(null,'cancelled');
          job.running=false; inFlight=Math.max(0,inFlight-1); drain();
        }
      })();
    }
  }
  function loadClip(clip, ctx) {
    const hit = bufferFor(clip); if (hit) return Promise.resolve(hit);
    if (typeof globalThis.fetch !== 'function' || typeof ctx?.decodeAudioData !== 'function') return Promise.resolve(null);
    const url = urlFor(clip), pending = loading.get(url); if (pending) return pending.promise;
    if ((failures.get(url)||0) > wall()) return Promise.resolve(null);
    let settle;
    const job = {url,context:ctx,token:generation,done:false,running:false,cancelled:false,
      controller:typeof globalThis.AbortController === 'function'?new globalThis.AbortController():null,
      promise:new Promise(resolve => { settle = resolve; }),timer:null,
      finish(buffer,reason) {
        if (job.done) return; job.done = true;
        clearTimeout(job.timer); if (loading.get(url) === job) loading.delete(url);
        if (reason === 'recording-load-timeout') { failures.set(url,wall()+10); try { job.controller?.abort(); } catch (_) {} }
        settle(buffer); if (!job.running) drain();
      }
    };
    job.timer = setTimeout(() => { lastError='recording-load-timeout'; job.finish(null,lastError); }, LOAD_TIMEOUT);
    loading.set(url,job); queue.push(job); drain(); return job.promise;
  }
  function details(kind, metadata = {}) {
    const e = metadata.engine || ARCADE.engine;
    const location = definitions[kind]?.location || (locations.some(x=>x.id===metadata.location)?metadata.location:locationFor(e));
    return {...metadata,engine:e,location,stage:Number.isInteger(metadata.stage)?metadata.stage:e?.stage||0};
  }
  function selected(kind, metadata, loadedOnly = false) {
    const pool = poolFor(kind,metadata); if (!pool.length) return null;
    const key = poolKey(kind,metadata), cursor = cursors.get(key) || 0;
    for (let i=0;i<pool.length;i++) {
      const index = (cursor+i)%pool.length, clip = pool[index];
      if (!loadedOnly || bufferFor(clip)) return {clip,key,next:(index+1)%pool.length};
    }
    return null;
  }
  function busFor(ctx, preview) {
    if (blockedReason(preview)) return null;
    if (!SPACE_AUDIO.ready && typeof spaceAudioInit === 'function') spaceAudioInit(ctx);
    const bus = SPACE_AUDIO.fx, owner = bus?.context || bus?.ctx;
    if (!bus?.gain || owner && owner !== ctx) return null;
    try {
      if (Math.abs(bus.gain.value - .3) > .008) { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(.3,ctx.currentTime,.012); }
    } catch (_) {}
    return bus;
  }
  function fallbackBuffer(ctx, kind) {
    let buffers = fallbackBuffers.get(ctx); if (!buffers) { buffers=new Map(); fallbackBuffers.set(ctx,buffers); }
    const family = kind==='robot-bark'?'bark':definitions[kind].human?'impact':definitions[kind].group==='radio'?kind:
      kind.startsWith('shot')?'shot':['armor-hit','robot-hit','player-damage'].includes(kind)?'impact':
      ['destroy','detonate','crash','robot-death'].includes(kind)?'blast':kind==='knife-swing'?'knife':'missile';
    if (buffers.has(family)) return buffers.get(family);
    const duration = {bark:.38,shot:.075,impact:.085,blast:.26,knife:.12,missile:.23,'radio-in':.065,'radio-out':.04}[family];
    const buffer = ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate), data=buffer.getChannelData(0);
    let random = 927170, filtered = 0;
    for (let i=0;i<data.length;i++) {
      const t=i/ctx.sampleRate, x=t/duration; random=(Math.imul(random,1664525)+1013904223)>>>0;
      const noise=random/2147483648-1; filtered += (noise-filtered)*(family==='blast'?.12:.5);
      const attack=Math.min(1,t/(family==='knife'?.015:.002)), decay=Math.pow(1-x,family==='blast'?2:3);
      const body=family==='impact'?Math.sin(t*6900)*Math.exp(-t*60):Math.sin(t*(family==='blast'?410:870))*Math.exp(-t*28);
      if(family==='bark'){
        // Two guttural syllables with a metallic servo tail. Fixed PCM means
        // no extra oscillator graph, timer or runtime allocation per bark.
        const local=t<.16?t:t-.19, env=local>=0?Math.sin(Math.PI*Math.min(1,local/.16))*Math.exp(-local*7):0;
        const fundamental=Math.sin(2*Math.PI*(210*local-260*local*local));
        const throat=Math.tanh(3*(fundamental+.42*Math.sin(2*Math.PI*830*local)));
        data[i]=clamp((throat*.39+filtered*.20)*env+.028*Math.sin(t*17000)*Math.exp(-t*12),-.65,.65);
      }else data[i]=clamp((filtered*.34+body*.2)*attack*decay,-.65,.65);
    }
    buffers.set(family,buffer); return buffer;
  }
  function announceCaption(metadata, clip, duration) {
    const text = String(clip.caption || clip.text || clip.spokenText || '').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,120);
    if (!text || metadata.preview) return;
    try { globalThis.dispatchEvent?.(new CustomEvent('citadel-sfx-caption',{detail:{engine:metadata.engine,enemyId:metadata.enemy?.id??null,
      pos:Array.isArray(metadata.pos)?metadata.pos.slice():metadata.enemy?.pos?.slice()||null,text,duration,clipId:clip.id}})); } catch (_) {}
  }
  function render(kind, ctx, buffer, metadata, selection = null) {
    const definition=definitions[kind], clip=selection?.clip, now=ctx.currentTime, nodes=[];
    const index=serial++, rate=(clip?.rate||1)*(definition.human?1:1+((index%5)-2)*.011);
    const contentDuration=Math.min(buffer.duration||.2,definition.phrase?5.3:definition.human?1.5:kind==='detonate'||kind==='crash'?4:2.5);
    const duration=contentDuration/rate;
    const base=definition.gain*(clip?.gain??.66)*(definition.human||definition.group==='radio'?1:captainBusy()?.52:1);
    let source, output, timer=null, closed=false;
    const voice={kind,context:ctx,base:definition.gain*(clip?.gain??.66),output:null,stop:cleanup};
    function cleanup() {
      if (closed) return; closed=true; clearTimeout(timer);
      if (source) { source.onended=null; try { source.stop(); } catch (_) {} }
      for (const node of nodes) try { node.disconnect(); } catch (_) {}
      active.delete(voice);
    }
    try {
      const bus=busFor(ctx,metadata.preview); if (!bus) return false;
      source=ctx.createBufferSource(); nodes.push(source); source.buffer=buffer; source.playbackRate.value=rate;
      output=ctx.createGain(); nodes.push(output); voice.output=output; output.gain.setValueAtTime(base,now);
      source.connect(output);
      if (ctx.createStereoPanner) {
        const panner=ctx.createStereoPanner(); nodes.push(panner);
        const origin=metadata.engine?.board?.pos||metadata.engine?.player?.pos;
        panner.pan.value=definition.group==='radio'?0:metadata.pos&&origin?clamp((metadata.pos[0]-origin[0])/30,-.55,.55):0;
        output.connect(panner); panner.connect(bus);
      } else output.connect(bus);
      source.onended=cleanup; active.add(voice); source.start(now,0,contentDuration);
      timer=setTimeout(cleanup,Math.ceil(duration*1000)+180);
      if (selection) cursors.set(selection.key,selection.next);
      const backend=clip?'recorded':'fallback';
      lastPlayed={kind,at:now,location:metadata.location,stage:metadata.stage,variant:index,
        source:metadata.preview?'preview':'game',backend,clipId:clip?.id||null};
      played[kind]=(played[kind]||0)+1; if (clip) clipsPlayed[clip.id]=(clipsPlayed[clip.id]||0)+1;
      if (definition.phrase) { lastPhrase={context:ctx,at:now}; if (clip) announceCaption(metadata,clip,duration); }
      return true;
    } catch (error) { lastError=String(error?.message||error); cleanup(); return false; }
  }
  function canHuman(kind, preview) {
    if(!preview&&definitions[kind].phrase&&globalThis.CITADEL_VOICE?.radioStyle==='original')return 'single-voice-mode';
    if (!definitions[kind].human) return '';
    if (captainBusy()) return 'captain-priority';
    if (humanVoices().length) return 'human-lane-busy';
    if (!preview && definitions[kind].phrase && lastPhrase?.context===ARCADE.audio && ARCADE.audio.currentTime-lastPhrase.at<RARE_COOLDOWN) return 'death-voice-cooldown';
    return '';
  }
  function effect(kind, metadata = {}) {
    if (!has(definitions,kind)) return fail(kind,'unknown');
    if(definitions[kind]?.phrase&&globalThis.CITADEL_VOICE?.radioStyle==='original')return fail(kind,'single-voice-mode');
    const info=details(kind,metadata), reason=blockedReason(info.preview)||canHuman(kind,info.preview); if (reason) return fail(kind,reason);
    const ctx=ARCADE.audio; if (!ctx||ctx.state!=='running') return fail(kind,'context-unavailable');
    contextChanged(ctx); if (!busFor(ctx,info.preview)) return fail(kind,'bus-unavailable');
    const family=kind==='shot'||definitions[kind].group==='location'?'shot':kind, last=times.get(family);
    if (last?.context===ctx&&ctx.currentTime-last.at<definitions[kind].interval) return fail(kind,'rate-limit');
    if (active.size>=MAX_VOICES) return fail(kind,'voice-limit');
    const choice=selected(kind,info,true), buffer=choice?bufferFor(choice.clip):null;
    if (!buffer) {
      const cold=selected(kind,info); if (cold) void loadClip(cold.clip,ctx);
      // There is no human-speech fallback and no saved event to play after this
      // decode. A physical click/thump can cover the initial warm-up instead.
      if (definitions[kind].human) return fail(kind,'recording-not-ready');
    }
    let rendered=false;
    try { rendered=render(kind,ctx,buffer||fallbackBuffer(ctx,kind),info,buffer?choice:null); }
    catch (error) { lastError=String(error?.message||error); }
    if (!rendered) return fail(kind,'render-error');
    times.set(family,{context:ctx,at:ctx.currentTime}); SPACE_AUDIO.lastFx[kind]=ctx.currentTime;
    return {ok:true,kind,location:info.location,source:buffer?'recorded':'fallback',clipId:choice?.clip.id||null};
  }
  function warmKinds(location) {
    const common=['shot-'+location,'missile','armor-hit','player-damage','destroy','detonate','crash'];
    return ['ground','deck','mrg'].includes(location)?[...common,'knife-swing','robot-death','soldier-hit','soldier-death','soldier-death-voice']:common;
  }
  function preload(options = {}) {
    const reason=blockedReason(true); if (reason) return Promise.resolve({ok:false,loaded:0,failed:0,reason});
    const ctx=options.context||ARCADE.audio||originalAudio();
    if (!ctx||typeof ctx.decodeAudioData!=='function') return Promise.resolve({ok:false,loaded:0,failed:0,reason:'context-unavailable'});
    contextChanged(ctx);
    const info=details('shot',options), kinds=Array.isArray(options.kinds)?options.kinds:warmKinds(info.location);
    const clips=options.all?prepared().clips:[...new Map(kinds.flatMap(kind=>poolFor(kind,info)).map(clip=>[clip.id,clip])).values()];
    const token=generation;
    let resumed;
    try { resumed=ctx.state==='suspended'?Promise.resolve(ctx.resume()):Promise.resolve(); }
    catch (_) { resumed=Promise.reject(Error('context-unavailable')); }
    warmPromise=boundary(Promise.all([Promise.all(clips.map(clip=>loadClip(clip,ctx))),resumed])).then(result=>{
      if (result===CANCELLED) return {ok:false,loaded:0,failed:0,reason:'cancelled'};
      const [buffers]=result;
      const loaded=buffers.filter(Boolean).length;
      return token===generation?{ok:loaded===clips.length&&clips.length>0,loaded,failed:clips.length-loaded,location:info.location}:
        {ok:false,loaded:0,failed:0,reason:'cancelled'};
    },()=>({ok:false,loaded:0,failed:clips.length,reason:'context-unavailable'}));
    return warmPromise;
  }
  function autoWarm(ctx=ARCADE.audio) {
    if (warming||!ctx||blockedReason(true)) return;
    const key=locationFor()+'/'+(ARCADE.engine?.stage||0);
    if (warmKey===key&&cacheContext===ctx) return;
    warming=true;
    try { contextChanged(ctx); warmKey=key; void preload({context:ctx}); }
    finally { warming=false; }
  }
  function stopEffects(radioOnly=false) {
    radioGeneration++;
    if (radioOnly) for (const operation of pendingOperations) if(operation.radio)operation.cancel();
    if (!radioOnly) { cancelLoads('stopped'); times.clear(); }
    for (const voice of [...active]) if (!radioOnly||definitions[voice.kind]?.group==='radio') voice.stop();
    if (radioOnly) { times.delete('radio-in'); times.delete('radio-out'); }
  }
  function captainChanged() {
    const busy=captainBusy();
    for (const voice of [...active]) {
      if (busy&&definitions[voice.kind].human) voice.stop();
      else if (!definitions[voice.kind].human&&definitions[voice.kind].group!=='radio') {
        try { voice.output?.gain.setTargetAtTime(voice.base*(busy?.52:1),voice.context.currentTime,.025); } catch (_) {}
      }
    }
  }

  // Only board humanoids can speak. Spaceships, drones, turrets and robodogs
  // remain mechanical even if an old save happens to give them a human name.
  function isHuman(enemy, board) {
    return !!board&&!enemy?.swarmDrone&&!/robo|robot|dog|drone|droid|turret|machine|робо|дрон|турел/i.test(
      [enemy?.archetype,enemy?.role,enemy?.type,enemy?.kind].join(' '));
  }
  function changed(entry, current) {
    const x=entry.enemy, dead=x.dead||x.hp<=0;
    if (x.id!==entry.id||!(x.hp<entry.hp)||entry.dead) return;
    const meta={engine:current.engine,enemy:x,pos:x.pos?.slice(),human:isHuman(x,entry.board)};
    if (dead) {
      if (deathsSeen.has(x)) return; deathsSeen.add(x);
      if (!meta.human) { effect('robot-death',meta); return; }
      effect('armor-hit',meta);
      humanSeed=(Math.imul(humanSeed,1664525)+1013904223)>>>0;
      const phrase=humanSeed/4294967296<RARE_CHANCE&&selected('soldier-death-voice',details('soldier-death-voice',meta),true)&&
        !canHuman('soldier-death-voice',false);
      if (!phrase||!effect('soldier-death-voice',meta).ok) effect('soldier-death',meta);
    } else {
      effect(meta.human?'armor-hit':'robot-hit',meta);
      if (meta.human) effect('soldier-hit',meta);
    }
  }
  function snapshotEnemy(current, enemy, board) {
    if (!enemy||current.enemies.has(enemy)||!Number.isFinite(enemy.hp)) return;
    // Keep existing corpses in the initial set too. They must not look like
    // newly spawned, already-damaged enemies when the outer frame finishes.
    current.enemies.set(enemy,{enemy,hp:enemy.hp,id:enemy.id,dead:!!enemy.dead||enemy.hp<=0,board});
  }
  function observe(engine, call, target=null, method='') {
    if (engine!==ARCADE.engine||blockedReason()) return call();
    if (frame?.engine===engine) {
      if (target) snapshotEnemy(frame,target,engine.board?.enemies?.includes(target)?engine.board:null);
      const previous=frame.target; frame.target=target||previous;
      try { return call(); } finally { frame.target=previous; }
    }
    // Install persistent event consumers before entering a temporary audio scope.
    // Otherwise comic.wire() retains the scoped emitter every frame and grows
    // an unbounded comic -> audio -> comic -> audio chain until stack overflow.
    globalThis.CITADEL_COMIC?.wire?.(engine);
    const previousFrame=frame, previousEmit=engine.emit, board=engine.board;
    const health=engine.status==='boarding'?board:engine.player;
    const current={engine,board,health,hp:health?.hp,target,enemies:new Map(),damage:false,
      arenaVersion:engine.finale?.arenaVersion,projectiles:new Set([...(board?.bullets||[]),...(board?.hostile||[])])};
    for (const x of board?.enemies||[]) snapshotEnemy(current,x,board);
    for (const x of engine.enemies||[]) snapshotEnemy(current,x,null);
    if (target) snapshotEnemy(current,target,board?.enemies?.includes(target)?board:null);
    frame=current;
    const scoped=function(type,value,...args) {
      const prior=event;
      let victim=null;
      if (type==='destroy') {
        const targetEntry=current.enemies.get(current.target);
        // Legacy ship/escort hit() emits a type or an empty value, while board
        // and MRG kills use other labels. The live hit target is authoritative.
        victim=targetEntry&&!targetEntry.dead&&current.target.hp<targetEntry.hp&&(current.target.dead||current.target.hp<=0)?current.target:
          [...current.enemies.values()].find(item=>!item.dead&&(item.enemy.id===value||value==='swarm'&&item.enemy.swarmDrone)&&
            item.enemy.hp<item.hp&&(item.enemy.dead||item.enemy.hp<=0))?.enemy;
      }
      const hpLoss=type==='damage'&&Number.isFinite(current.hp)&&health?.hp<current.hp;
      if (hpLoss) current.damage=true;
      const projectiles=[...(engine.board?.bullets||[]),...(engine.board?.hostile||[])];
      const fresh=projectiles.some(x=>!current.projectiles.has(x)); projectiles.forEach(x=>current.projectiles.add(x));
      const attacker=current.target;
      const knife=type==='enemy-fire'&&attacker?.decksAttack?.kind==='dash'&&attacker.decksAttack.phase==='strike'||
        type==='shot'&&engine.finale?.phase==='mrg'&&!fresh&&(engine.board?.enemies||[]).some(x=>!x.dead&&x.role==='knife'&&x.knifePhase==='strike');
      event={engine,type,value,victim,hpLoss,knife,consumed:false};
      try {
        const result=typeof previousEmit==='function'?previousEmit.call(this,type,value,...args):undefined;
        if(type==='enemy-fire'&&/dog/i.test(attacker?.archetype||'')) effect('robot-bark',{engine,pos:attacker?.pos});
        else if (type==='enemy-fire'&&!event.consumed) effect(knife?'knife-swing':'shot',{engine,pos:attacker?.pos});
        return result;
      } finally { event=prior; }
    };
    Object.defineProperty(scoped,'citadelSfxScope',{value:true});
    engine.emit=scoped;
    try { return call(); }
    finally {
      try {
        if (engine.board===board&&current.arenaVersion===engine.finale?.arenaVersion) for (const x of board?.enemies||[]) {
          if (!current.enemies.has(x)&&Number.isFinite(x.maxHp)&&x.hp<x.maxHp)
            current.enemies.set(x,{enemy:x,hp:x.maxHp,id:x.id,dead:false,board});
        }
        for (const item of current.enemies.values()) changed(item,current);
        if (current.damage||health&&health.hp<current.hp) effect('player-damage',{engine,pos:health.pos});
      } finally { if (engine.emit===scoped) engine.emit=previousEmit; frame=previousFrame; }
    }
  }
  function attach(engine) {
    if (!engine||typeof engine.step!=='function') return;
    let methods=attached.get(engine); if (!methods) { methods=new Map(); attached.set(engine,methods); }
    for (const name of ['step','stepBoard','stepMRG','stepEscort','stepFinalSpace','boardHit','hit','mrgDamage','damage','enemyBoardStep']) {
      if (typeof engine[name]!=='function') continue;
      let record=methods.get(name); if (record&&engine[name]===record.wrapper) continue;
      const fromPrototype=!Object.prototype.hasOwnProperty.call(engine,name), original=engine[name];
      record={original,prototypeMethod:Object.getPrototypeOf(engine)[name],fromPrototype,wrapper:null};
      record.wrapper=function(...args) {
        // A module may be loaded after SFX, or the admin may replace emit after
        // launch. Read the final prototype at call time; emit is scoped anew.
        const current=Object.getPrototypeOf(engine)[name];
        if (record.fromPrototype&&current!==record.prototypeMethod) { record.original=current; record.prototypeMethod=current; }
        if (this!==engine) return record.original.apply(this,args);
        const target=['boardHit','hit','enemyBoardStep'].includes(name)?args[0]:null;
        return observe(engine,()=>record.original.apply(engine,args),target,name);
      };
      methods.set(name,record);
      Object.defineProperty(engine,name,{value:record.wrapper,writable:true,configurable:true,enumerable:false});
    }
  }
  spacePlayEffect=function(kind) {
    if (event&&event.type===kind) {
      event.consumed=true;
      if (kind==='destroy'&&event.victim||kind==='damage'&&event.hpLoss) return true;
      if (kind==='shot'&&event.knife) return effect('knife-swing',{engine:event.engine}).ok;
    }
    if (has(definitions,kind)) return effect(kind,{engine:event?.engine}).ok;
    if (blockedReason()) return false;
    if (ARCADE.audio?.state==='running') busFor(ARCADE.audio,false);
    return originalEffect(kind);
  };
  arcadeAudio=function(...args) { const ctx=originalAudio.apply(this,args); if (ctx) autoWarm(ctx); return ctx; };
  spaceAudioStop=function(...args) { try { return originalStop.apply(this,args); } finally { stopEffects(); } };
  if (typeof spaceAudioAction==='function') {
    const original=spaceAudioAction;
    spaceAudioAction=function(...args) {
      const enabled=ARCADE.sound,result=original.apply(this,args);
      if (enabled&&!ARCADE.sound) stopEffects(); else if (!enabled&&ARCADE.sound) autoWarm();
      return result;
    };
  }
  if (typeof spaceAudioSync==='function') {
    const original=spaceAudioSync;
    spaceAudioSync=function(...args) {
      if (blockedReason()) { if (active.size||loading.size) stopEffects(); }
      else { attach(ARCADE.engine); autoWarm(); }
      return original.apply(this,args);
    };
  }
  if (typeof RequirementArcade==='function') {
    const proto=RequirementArcade.prototype;
    for (const name of ['pause','beginStage','beginMRG','beginBoarding','beginLair','retryFinale','launch','resume']) if (typeof proto[name]==='function') {
      const original=proto[name];
      proto[name]=function(...args) {
        const before=this.status;
        if (this===ARCADE.engine&&name!=='resume'&&name!=='launch') stopEffects();
        const result=original.apply(this,args); attach(this);
        if (this===ARCADE.engine&&name==='pause'&&before!=='paused'&&this.status==='paused') stopEffects();
        if (this===ARCADE.engine&&name!=='pause') autoWarm();
        return result;
      };
    }
  }
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden)stopEffects();});
  globalThis.addEventListener?.('pagehide',()=>stopEffects());
  globalThis.addEventListener?.('blur',()=>stopEffects());
  globalThis.addEventListener?.('citadel-voice-status',captainChanged);
  globalThis.addEventListener?.('citadel-voice-change',captainChanged);
  if (typeof setView==='function') {
    const original=setView; setView=function(...args) { const result=original.apply(this,args); if(STATE.view!=='arcade')stopEffects(); return result; };
  }
  if (typeof arcadeAction==='function') {
    const original=arcadeAction;
    arcadeAction=function(...args) {
      const before=ARCADE.engine,result=original.apply(this,args);
      if (before!==ARCADE.engine||args[0]==='arcade-menu'||blockedReason()) stopEffects();
      else if (['citadel-launch','arcade-start','arcade-resume','citadel-retry','citadel-retry-calm'].includes(args[0])) autoWarm();
      return result;
    };
  }
  async function play(kind, metadata = {}) {
    if (!has(definitions,kind)) return fail(kind,'unknown');
    const reason=blockedReason(true)||canHuman(kind,true); if (reason) return fail(kind,reason);
    const ctx=ARCADE.audio||originalAudio(); if (!ctx) return fail(kind,'context-unavailable');
    contextChanged(ctx); const token=generation, radioToken=radioGeneration, engine=ARCADE.engine, info=details(kind,{...metadata,preview:true});
    const choice=selected(kind,info);
    let resumed;
    try { resumed=ctx.state==='suspended'?Promise.resolve(ctx.resume()):Promise.resolve(); }
    catch (_) { return fail(kind,'context-unavailable'); }
    try {
      const result=await boundary(Promise.all([choice?loadClip(choice.clip,ctx):Promise.resolve(),resumed]),definitions[kind].group==='radio');
      if(result===CANCELLED)return fail(kind,'cancelled');
    }
    catch (_) { return fail(kind,'context-unavailable'); }
    if (token!==generation||engine!==ARCADE.engine||definitions[kind].group==='radio'&&radioToken!==radioGeneration) return fail(kind,'cancelled');
    return effect(kind,info);
  }
  globalThis.CITADEL_SFX=Object.freeze({
    version:VERSION,play,preview:play,preload,get ready(){return warmPromise;},
    stop:()=>stopEffects(),stopRadio:()=>stopEffects(true),
    catalog:()=>Object.entries(definitions).map(([kind,item])=>({kind,title:item.title,group:item.group,...(item.location?{location:item.location}:{})})),
    locations:()=>locations.map(item=>({...item})),
    status:()=>({version:VERSION,enabled:!!ARCADE.sound,ready:!!SPACE_AUDIO.ready,preparedAvailable:prepared().clips.length>0,
      preparedClips:prepared().clips.length,loadedClips:cache.size,loadingClips:loading.size,decodingOrFetching:inFlight,
      cachedBytes,maxCachedBytes:MAX_BYTES,maxBuffers:MAX_BUFFERS,maxLoads:MAX_LOADS,
      contextState:ARCADE.audio?.state||'uninitialized',gameStatus:ARCADE.engine?.status||'uninitialized',view:STATE.view,
      blockedReason:blockedReason(true),gameBlockedReason:blockedReason(),location:locationFor(),
      activeVoices:active.size,radioVoices:[...active].filter(x=>definitions[x.kind]?.group==='radio').length,
      humanVoices:humanVoices().length,maxVoices:MAX_VOICES,deathVoiceChance:RARE_CHANCE,deathVoiceCooldown:RARE_COOLDOWN,
      captainPriority:captainBusy(),backend:prepared().clips.length?'recorded':'fallback',
      lastPlayed:lastPlayed?{...lastPlayed}:null,lastError,played:{...played},clipsPlayed:{...clipsPlayed},blocked:{...blocked}})
  });
}());
