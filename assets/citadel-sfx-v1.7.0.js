/* Citadel CSII 1.7.0 — location-aware combat effects.
 * Local Web Audio synthesis; no recordings, requests or game-state changes.
 * Load after the core and MRG mechanics. Music keeps its own voice pool.
 */
(function () {
  'use strict';
  const VERSION = '1.7.0';
  if (typeof ARCADE === 'undefined' || typeof SPACE_AUDIO === 'undefined' ||
      typeof STATE === 'undefined' || typeof spacePlayEffect !== 'function' ||
      typeof spaceAudioStop !== 'function' || typeof arcadeAudio !== 'function') return;
  if (globalThis.CITADEL_SFX?.version === VERSION) return;

  const originalEffect = spacePlayEffect, originalStop = spaceAudioStop;
  const active = new Set(), noiseBuffers = new WeakMap(), lastTimes = new Map();
  const maxVoices = 24, effectsGain = .3;
  const locations = Object.freeze([
    {id:'ground',title:'Наземный лабиринт',shotKind:'shot-ground'},
    {id:'deck',title:'Палубы Цитадели',shotKind:'shot-deck'},
    {id:'convoy',title:'Сопровождение конвоя',shotKind:'shot-convoy'},
    {id:'space',title:'Космический бой',shotKind:'shot-space'},
    {id:'mrg',title:'Арена МРГ',shotKind:'shot-mrg'}
  ]);
  const definitions = Object.freeze({
    shot:{title:'Выстрел текущего этапа',interval:.105,group:'weapon'},
    'shot-ground':{title:'Выстрел · наземный лабиринт',interval:.105,group:'location',location:'ground'},
    'shot-deck':{title:'Выстрел · палуба',interval:.105,group:'location',location:'deck'},
    'shot-convoy':{title:'Выстрел · конвой',interval:.105,group:'location',location:'convoy'},
    'shot-space':{title:'Выстрел · космос',interval:.105,group:'location',location:'space'},
    'shot-mrg':{title:'Выстрел · МРГ',interval:.105,group:'location',location:'mrg'},
    missile:{title:'Пуск ракеты / гранаты',interval:.12,group:'weapon'},
    destroy:{title:'Взрыв цели',interval:.085,group:'weapon'},
    detonate:{title:'Мощный взрыв',interval:.28,group:'weapon'},
    crash:{title:'Авария корабля',interval:.28,group:'weapon'},
    'soldier-hit':{title:'Попадание в солдата',interval:.055,group:'combat'},
    'soldier-death':{title:'Солдат повержен',interval:.075,group:'combat'},
    'player-damage':{title:'Урон игроку',interval:.18,group:'combat'},
    'knife-swing':{title:'Взмах ножа',interval:.14,group:'combat'},
    'radio-in':{title:'Радиоканал · вход',interval:.12,group:'radio'},
    'radio-out':{title:'Радиоканал · выход',interval:.12,group:'radio'}
  });
  const gunProfiles = Object.freeze({
    ground:{body:[155,67,.135,.37],crack:[2300,1500,.028,.33],tail:[1200,420,.19,.23]},
    deck:{body:[195,83,.14,.34],crack:[3000,1900,.023,.36],tail:[1750,620,.27,.24]},
    convoy:{body:[108,43,.23,.40],crack:[1800,1150,.035,.35],tail:[780,260,.30,.28]},
    space:{body:[245,108,.13,.32],crack:[2600,1650,.025,.31],tail:[980,450,.17,.22]},
    mrg:{body:[175,63,.17,.39],crack:[2800,1700,.027,.36],tail:[1350,440,.24,.27]}
  });
  let serial = 0, generation = 0, radioGeneration = 0;
  let busToRestore = true, currentBus = null, lastPlayed = null, lastError = '';
  let frame = null, event = null;
  const played = Object.create(null), blocked = Object.create(null);

  function locationFor(engine = ARCADE.engine) {
    const phase = engine?.finale?.phase;
    if (['mrg','upload','victory'].includes(phase)) return 'mrg';
    if (['maze','landing'].includes(phase)) return 'ground';
    if (engine?.phase === 'escort') return 'convoy';
    if (engine?.board && (['boarding','remark','finalcheck'].includes(engine.status) ||
        engine.status === 'paused' && engine.resumeStatus === 'boarding')) return 'deck';
    return 'space';
  }
  function blockedReason(preview = false) {
    if (!ARCADE.sound) return 'muted';
    if (document.hidden || STATE.view !== 'arcade') return 'inactive';
    if (!preview && ARCADE.engine?.status === 'paused') return 'paused';
    return '';
  }
  function restoreBus(ctx, preview) {
    const bus = SPACE_AUDIO.fx;
    if (!bus?.gain || blockedReason(preview)) return false;
    if (busToRestore || currentBus !== bus || Math.abs(bus.gain.value - effectsGain) > .008) {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(effectsGain, now, .012);
      currentBus = bus; busToRestore = false;
    }
    return true;
  }
  function noise(ctx) {
    let buffer = noiseBuffers.get(ctx);
    if (buffer) return buffer;
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0); let seed = 1329170;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noiseBuffers.set(ctx, buffer); return buffer;
  }

  function render(kind, ctx, metadata) {
    const now = ctx.currentTime, when = now + .006;
    const variant = serial++ % 7, jitter = 1 + (variant - 3) * .009;
    const nodes = [], sources = []; let output, closed = false, cleanupTimer = null, remaining = 0, endsAt = when;
    const voice = {kind, startedAt:now, stop};
    function cleanup() {
      if (closed) return; closed = true;
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      for (const source of sources) { source.onended = null; try { source.stop(); } catch (_) {} }
      for (const node of new Set([...sources, ...nodes])) try { node.disconnect(); } catch (_) {}
      active.delete(voice);
    }
    function stop() {
      if (closed) return;
      const at = ctx.currentTime;
      try { output.gain.cancelScheduledValues(at); output.gain.setTargetAtTime(.0001, at, .006); } catch (_) {}
      for (const source of sources) try { source.stop(at + .025); } catch (_) {}
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(cleanup, 180);
    }
    function envelope(length, level, attack, delay = 0) {
      const gain = ctx.createGain(), at = when + delay; nodes.push(gain);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.linearRampToValueAtTime(level, at + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level * .42), at + Math.max(attack + .001, length * .3));
      gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      gain.connect(output); return gain;
    }
    function schedule(source, length, delay = 0, offset) {
      sources.push(source); remaining++; const at = when + delay;
      endsAt = Math.max(endsAt, at + length + .018);
      source.onended = () => { if (--remaining === 0) cleanup(); };
      if (offset === undefined) source.start(at); else source.start(at, offset);
      source.stop(at + length + .018);
    }
    function tone(wave, start, end, length, level, cut = 1200, delay = 0) {
      const source = ctx.createOscillator(); nodes.push(source); source.type = wave;
      source.frequency.setValueAtTime(start * jitter, when + delay);
      source.frequency.exponentialRampToValueAtTime(end * jitter, when + delay + length);
      const gain = envelope(length, level, .003, delay), filter = ctx.createBiquadFilter(); nodes.push(filter);
      filter.type = 'lowpass'; filter.frequency.value = cut; filter.Q.value = .55;
      source.connect(filter); filter.connect(gain); schedule(source, length, delay);
    }
    function burst(filterType, start, end, length, level, attack = .003, delay = 0) {
      const source = ctx.createBufferSource(); nodes.push(source); source.buffer = noise(ctx);
      const filter = ctx.createBiquadFilter(); nodes.push(filter); filter.type = filterType;
      filter.frequency.setValueAtTime(start * jitter, when + delay);
      filter.frequency.exponentialRampToValueAtTime(end * jitter, when + delay + length);
      filter.Q.value = .65;
      source.connect(filter); filter.connect(envelope(length, level, attack, delay));
      schedule(source, length, delay, ((serial * 17 + sources.length * 31) % 350) / 1000);
    }
    try {
      output = ctx.createGain(); nodes.push(output); output.gain.value = 1;
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner(); nodes.push(panner);
        panner.pan.value = definitions[kind].group === 'radio' ? 0 : ((variant % 3) - 1) * .10;
        output.connect(panner); panner.connect(SPACE_AUDIO.fx);
      } else output.connect(SPACE_AUDIO.fx);
      active.add(voice);
      if (kind === 'shot' || definitions[kind].group === 'location') {
        const profile = gunProfiles[metadata.location], stage = Math.max(0, Math.min(3, metadata.stage || 0));
        const pitch = metadata.location === 'deck' ? 1 + (stage - 1.5) * .035 : 1;
        const room = metadata.location === 'deck' ? [.82,.98,1.15,.90][stage] : 1;
        const [bodyStart,bodyEnd,bodyLength,bodyLevel] = profile.body;
        const [crackStart,crackEnd,crackLength,crackLevel] = profile.crack;
        const [tailStart,tailEnd,tailLength,tailLevel] = profile.tail;
        // A short crack, a low/mid-frequency body, mechanical texture and room tail.
        // The body stays below 250 Hz: it does not turn into a high pitched laser note.
        burst('bandpass', crackStart, crackEnd, crackLength, crackLevel, .0015);
        tone('triangle', bodyStart * pitch, bodyEnd * pitch, bodyLength, bodyLevel, 1350);
        burst('bandpass', bodyStart * 5.2, bodyEnd * 5.8, bodyLength * .66, .31, .002, .005);
        burst('lowpass', tailStart * pitch, tailEnd, tailLength * room, tailLevel, .006, .026);
      } else if (kind === 'missile') {
        burst('lowpass',1750,620,.54,.20,.018);
        tone('sawtooth',110,390,.48,.10,1700);
        tone('sine',135,45,.43,.16);
      } else if (kind === 'destroy') {
        burst('lowpass',2400,480,.72,.24);
        burst('highpass',1900,1400,.055,.085,.002);
        tone('sine',150,45,.67,.18);
      } else if (kind === 'detonate') {
        burst('lowpass',2800,280,1.12,.30);
        burst('highpass',2100,1200,.08,.12,.002);
        tone('sine',125,31,1.2,.24);
        tone('sawtooth',280,75,.55,.045,1000);
      } else if (kind === 'crash') {
        burst('bandpass',1300,430,.86,.24);
        burst('highpass',3500,1700,.13,.10,.002);
        tone('sawtooth',175,48,.78,.13,1400);
      } else if (kind === 'soldier-hit') {
        burst('bandpass',1050,410,.095,.27,.002);
        tone('triangle',155,88,.10,.18,750);
        burst('bandpass',2700,1700,.019,.07,.0015);
      } else if (kind === 'soldier-death') {
        burst('bandpass',690,230,.235,.29,.005);
        tone('triangle',138,58,.26,.23,760);
        burst('lowpass',1250,310,.20,.14,.003,.026);
      } else if (kind === 'player-damage') {
        burst('bandpass',1050,350,.15,.29,.002);
        tone('triangle',112,49,.20,.31,900);
        burst('bandpass',2300,1500,.028,.11,.0015);
      } else if (kind === 'knife-swing') {
        burst('bandpass',2100,700,.14,.20,.024);
        burst('lowpass',700,270,.09,.10,.015,.024);
      } else if (kind === 'radio-in') {
        burst('bandpass',1900,1150,.065,.13,.003);
        burst('bandpass',850,620,.024,.07,.002,.012);
      } else if (kind === 'radio-out') {
        burst('bandpass',1400,850,.037,.11,.002);
        burst('lowpass',950,500,.019,.05,.002,.008);
      }
      cleanupTimer = setTimeout(cleanup, Math.ceil((endsAt - now) * 1000) + 250);
      lastPlayed = {kind, at:now, location:metadata.location, stage:metadata.stage, variant, source:metadata.preview?'preview':'game'};
      played[kind] = (played[kind] || 0) + 1; return true;
    } catch (error) { lastError = String(error?.message || error); cleanup(); return false; }
  }

  function combatEffect(kind, metadata = {}) {
    const fail = reason => { blocked[reason] = (blocked[reason] || 0) + 1; return {ok:false,kind,reason}; };
    if (!Object.hasOwn(definitions, kind)) return fail('unknown');
    const reason = blockedReason(metadata.preview); if (reason) return fail(reason);
    // Gameplay and timed radio cues only use an already unlocked context.
    // Explicit play()/preview() owns creation and asynchronous resume.
    const ctx = ARCADE.audio;
    if (!ctx || ctx.state !== 'running') return fail('context-unavailable');
    if (!restoreBus(ctx, metadata.preview)) return fail('bus-unavailable');
    const family = kind === 'shot' || definitions[kind].group === 'location' ? 'shot' : kind;
    const last = lastTimes.get(family);
    if (last?.context === ctx && ctx.currentTime - last.at < definitions[kind].interval) return fail('rate-limit');
    if (active.size >= maxVoices) return fail('voice-limit');
    const location = definitions[kind].location || (Object.hasOwn(gunProfiles, metadata.location) ? metadata.location : locationFor(metadata.engine));
    const details = {...metadata,location,stage:Number.isInteger(metadata.stage)?metadata.stage:metadata.engine?.stage??ARCADE.engine?.stage??0};
    if (!render(kind, ctx, details)) return fail('render-error');
    lastTimes.set(family,{context:ctx,at:ctx.currentTime});
    SPACE_AUDIO.lastFx[kind] = ctx.currentTime;
    return {ok:true,kind,location};
  }

  function eventKind(kind) {
    if (!event || event.type !== kind) return kind;
    if (kind === 'destroy' && event.soldier) {
      frame?.deathsPlayed.add(event.soldier); return 'soldier-death';
    }
    if (kind === 'damage' && event.playerDamaged) {
      if (frame) frame.damagePlayed = true; return 'player-damage';
    }
    if (kind === 'shot' && event.knife) return 'knife-swing';
    return kind;
  }
  spacePlayEffect = function(kind) {
    const routed = eventKind(kind);
    if (Object.hasOwn(definitions,routed)) {
      const result = combatEffect(routed,{engine:event?.engine});
      if (result.reason === 'render-error' && Object.hasOwn(definitions,kind) && definitions[kind].group !== 'radio') return originalEffect(kind);
      return result.ok;
    }
    if (blockedReason()) return false;
    if (ARCADE.audio?.state === 'running') restoreBus(ARCADE.audio,false);
    return originalEffect(kind);
  };

  function stopEffects(radioOnly = false) {
    if (radioOnly) radioGeneration++;
    else { generation++; radioGeneration++; lastTimes.clear(); }
    for (const voice of active) if (!radioOnly || definitions[voice.kind]?.group === 'radio') voice.stop();
    if (radioOnly) { lastTimes.delete('radio-in'); lastTimes.delete('radio-out'); }
  }
  spaceAudioStop = function(...args) {
    try { return originalStop.apply(this,args); }
    finally { busToRestore = true; stopEffects(); }
  };
  if (typeof spaceAudioAction === 'function') {
    const originalAction = spaceAudioAction;
    spaceAudioAction = function(...args) {
      const wasEnabled = ARCADE.sound, result = originalAction.apply(this,args);
      if (wasEnabled && !ARCADE.sound) stopEffects();
      return result;
    };
  }
  document.addEventListener?.('visibilitychange',() => { if (document.hidden) stopEffects(); });

  // Observe actual HP changes. The original emit callback and all its arguments
  // remain intact; a synchronous context gives the existing sound route a target.
  function observe(engine, call, hitEnemy = null) {
    if (engine !== ARCADE.engine || blockedReason()) return call();
    if (frame?.engine === engine) {
      const previous = frame.hitEnemy; frame.hitEnemy = hitEnemy || previous;
      const before = hitEnemy?.hp;
      try { return call(); }
      finally { if (hitEnemy && hitEnemy.hp < before) soldierChanged(hitEnemy); frame.hitEnemy = previous; }
    }
    const previousFrame = frame, previousEmit = engine.emit, b = engine.board;
    const health = engine.status === 'boarding' ? b : engine.player;
    const soldiers = new Map((b?.enemies || []).filter(x => !x.dead && x.hp > 0).map(x => [x,{hp:x.hp,id:x.id}]));
    const current = {engine,hitEnemy,soldiers,initialSoldiers:new Set(b?.enemies||[]),health,hp:health?.hp,
      initialBoard:b,arenaVersion:engine.finale?.arenaVersion,
      projectiles:new Set([...(b?.bullets||[]),...(b?.hostile||[])]),
      deaths:new Set(),deathsPlayed:new Set(),hitsPlayed:new Set(),damageDetected:false,damagePlayed:false};
    frame = current;
    engine.emit = function(type,value,...args) {
      const priorEvent = event;
      const soldier = type === 'destroy' ? value === 'board' ? current.hitEnemy :
        (engine.board?.enemies || []).find(x => x.id === value && (x.dead || x.hp <= 0)) ||
        [...soldiers.keys()].find(x => x.id === value && (x.dead || x.hp <= 0)) : null;
      if (soldier && (soldier.dead || soldier.hp <= 0)) current.deaths.add(soldier);
      const playerDamaged = type === 'damage' && health === current.health && Number.isFinite(current.hp) && health.hp < current.hp;
      if (playerDamaged) current.damageDetected = true;
      let knife = false;
      const projectiles = [...(engine.board?.bullets||[]),...(engine.board?.hostile||[])];
      if (type === 'shot' && engine.finale?.phase === 'mrg') {
        const freshProjectile = projectiles.some(x => !current.projectiles.has(x));
        knife = !freshProjectile && (engine.board?.enemies || []).some(x => !x.dead && x.role === 'knife' && x.knifePhase === 'strike');
      }
      projectiles.forEach(x => current.projectiles.add(x));
      event = {engine,type,value,soldier:current.deaths.has(soldier)?soldier:null,playerDamaged,knife};
      try { return previousEmit.call(this,type,value,...args); }
      finally { event = priorEvent; }
    };
    try { return call(); }
    finally {
      try {
        // A wave may replace its array after the last kill; retain the old objects.
        for (const [soldier,before] of soldiers) if (soldier.id === before.id && soldier.hp < before.hp) soldierChanged(soldier);
        for (const soldier of current.deaths) soldierChanged(soldier);
        if (engine.board === b && current.arenaVersion === engine.finale?.arenaVersion) {
          for (const soldier of b?.enemies || []) if (!current.initialSoldiers.has(soldier) && soldier.hp < soldier.maxHp) soldierChanged(soldier);
        }
        if ((current.damageDetected || health && health.hp < current.hp) && !current.damagePlayed)
          combatEffect('player-damage',{engine});
      } finally { engine.emit = previousEmit; frame = previousFrame; }
    }
  }
  function soldierChanged(soldier) {
    if (!frame) return;
    const dead = soldier.dead || soldier.hp <= 0, known = dead ? frame.deathsPlayed : frame.hitsPlayed;
    if (known.has(soldier)) return; known.add(soldier);
    combatEffect(dead?'soldier-death':'soldier-hit',{engine:frame.engine});
  }
  if (typeof RequirementArcade === 'function') {
    const proto = RequirementArcade.prototype;
    for (const name of ['stepBoard','stepMRG','boardHit','mrgDamage','damage']) if (typeof proto[name] === 'function') {
      const original = proto[name];
      proto[name] = function(...args) { return observe(this,() => original.apply(this,args),name==='boardHit'?args[0]:null); };
    }
    for (const name of ['pause','beginStage','beginMRG','retryFinale']) if (typeof proto[name] === 'function') {
      const original = proto[name];
      proto[name] = function(...args) {
        const before = this.status, result = original.apply(this,args);
        if (this === ARCADE.engine && (name !== 'pause' || before !== 'paused' && this.status === 'paused')) stopEffects();
        return result;
      };
    }
  }

  async function play(kind, metadata = {}) {
    if (!Object.hasOwn(definitions,kind)) return {ok:false,kind,reason:'unknown'};
    const reason = blockedReason(true); if (reason) return {ok:false,kind,reason};
    const token = generation, radioToken = radioGeneration;
    const ctx = ARCADE.audio || arcadeAudio();
    if (!ctx) return {ok:false,kind,reason:'context-unavailable'};
    try { if (ctx.state === 'suspended') await ctx.resume(); }
    catch (_) { return {ok:false,kind,reason:'context-unavailable'}; }
    if (token !== generation || definitions[kind].group === 'radio' && radioToken !== radioGeneration)
      return {ok:false,kind,reason:'cancelled'};
    return combatEffect(kind,{...metadata,preview:true});
  }
  globalThis.CITADEL_SFX = Object.freeze({
    version:VERSION,
    catalog:() => Object.entries(definitions).map(([kind,item]) => ({kind,title:item.title,group:item.group,...(item.location?{location:item.location}:{})})),
    locations:() => locations.map(item => ({...item})),
    play, preview:play, stop:() => stopEffects(), stopRadio:() => stopEffects(true),
    status:() => ({version:VERSION,enabled:Boolean(ARCADE.sound),ready:Boolean(SPACE_AUDIO.ready),
      contextState:ARCADE.audio?.state||'uninitialized',gameStatus:ARCADE.engine?.status||'uninitialized',view:STATE.view,
      blockedReason:blockedReason(true),gameBlockedReason:blockedReason(),location:locationFor(),
      activeVoices:active.size,radioVoices:[...active].filter(x=>definitions[x.kind]?.group==='radio').length,maxVoices,
      lastPlayed:lastPlayed?{...lastPlayed}:null,lastError,played:{...played},blocked:{...blocked}})
  });
})();
