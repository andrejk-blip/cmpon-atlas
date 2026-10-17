/* Citadel CSII 1.4.2 — combat effects.
   Uses the existing effects bus and sound preference; music has its own voice pool.
   Synthesized locally with Web Audio: no recordings or additional requests. */
(function () {
  'use strict';
  if (typeof ARCADE === 'undefined' || typeof SPACE_AUDIO === 'undefined' ||
      typeof STATE === 'undefined' || typeof spacePlayEffect !== 'function' ||
      typeof spaceAudioStop !== 'function' || typeof arcadeAudio !== 'function') return;
  if (globalThis.CITADEL_SFX?.version === '1.4.2') return;

  const originalEffect = spacePlayEffect;
  const originalStop = spaceAudioStop;
  const active = new Set();
  const noiseBuffers = new WeakMap();
  const lastTimes = new Map();
  const maxVoices = 24;
  const effectsGain = .3;
  const definitions = Object.freeze({
    shot: {title: 'Выстрел плазмы', interval: .105},
    missile: {title: 'Пуск ракеты', interval: .12},
    destroy: {title: 'Взрыв цели', interval: .085},
    detonate: {title: 'Мощный взрыв', interval: .28},
    crash: {title: 'Авария корабля', interval: .28}
  });
  let serial = 0;
  let generation = 0;
  let busToRestore = true;
  let currentBus = null;
  let lastPlayed = null;
  let lastError = '';

  function blockedReason() {
    if (!ARCADE.sound) return 'muted';
    if (document.hidden || STATE.view !== 'arcade') return 'inactive';
    return '';
  }

  function restoreBus(ctx) {
    const bus = SPACE_AUDIO.fx;
    if (!bus?.gain || blockedReason()) return false;
    // Stop/visibility fades the shared FX bus to zero. A new effect must restore it
    // even if a pause or briefing did not pass through the usual unlock action.
    if (busToRestore || currentBus !== bus || Math.abs(bus.gain.value - effectsGain) > .008) {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(effectsGain, now, .012);
      currentBus = bus;
      busToRestore = false;
    }
    return true;
  }

  function noise(ctx) {
    let buffer = noiseBuffers.get(ctx);
    if (buffer) return buffer;
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1329142;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noiseBuffers.set(ctx, buffer);
    return buffer;
  }

  function render(kind, ctx) {
    const now = ctx.currentTime;
    const when = now + .006;
    const jitter = 1 + ((serial % 5) - 2) * .015;
    const nodes = [];
    const sources = [];
    let output = null;
    let closed = false;
    let cleanupTimer = null;
    let remaining = 0;
    let endsAt = when;
    const voice = {kind, startedAt: now, stop};
    function cleanup() {
      if (closed) return;
      closed = true;
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      for (const source of sources) {
        source.onended = null;
        try { source.stop(); } catch (_) {}
      }
      for (const node of new Set([...sources, ...nodes])) try { node.disconnect(); } catch (_) {}
      active.delete(voice);
    }
    function stop() {
      if (closed) return;
      // The fallback also handles suspended/closed contexts, where onended can wait.
      const at = ctx.currentTime;
      try {
        output.gain.cancelScheduledValues(at);
        output.gain.setTargetAtTime(.0001, at, .006);
      } catch (_) {}
      for (const source of sources) try { source.stop(at + .025); } catch (_) {}
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(cleanup, 180);
    }
    function envelope(length, level, attack) {
      const gain = ctx.createGain();
      nodes.push(gain);
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.linearRampToValueAtTime(level, when + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, when + length);
      gain.connect(output);
      return gain;
    }
    function schedule(source, length, offset) {
      sources.push(source);
      remaining++;
      endsAt = Math.max(endsAt, when + length + .018);
      source.onended = () => { if (--remaining === 0) cleanup(); };
      if (offset === undefined) source.start(when);
      else source.start(when, offset);
      source.stop(when + length + .018);
    }
    function tone(wave, start, end, length, level, cut) {
      const source = ctx.createOscillator();
      // Register the node before configuration, so even a partially built voice is cleaned up.
      nodes.push(source);
      source.type = wave;
      source.frequency.setValueAtTime(start * jitter, when);
      source.frequency.exponentialRampToValueAtTime(end * jitter, when + length);
      const gain = envelope(length, level, .004);
      if (cut) {
        const filter = ctx.createBiquadFilter();
        nodes.push(filter);
        filter.type = 'lowpass';
        filter.frequency.value = cut;
        filter.Q.value = .55;
        source.connect(filter);
        filter.connect(gain);
      } else source.connect(gain);
      schedule(source, length);
    }
    function burst(filterType, start, end, length, level, attack = .004) {
      const source = ctx.createBufferSource();
      nodes.push(source);
      source.buffer = noise(ctx);
      const filter = ctx.createBiquadFilter();
      nodes.push(filter);
      filter.type = filterType;
      filter.frequency.setValueAtTime(start, when);
      filter.frequency.exponentialRampToValueAtTime(end, when + length);
      filter.Q.value = .7;
      source.connect(filter);
      filter.connect(envelope(length, level, attack));
      schedule(source, length, (serial % 7) * .027);
    }

    try {
      output = ctx.createGain();
      nodes.push(output);
      output.gain.value = 1;
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        nodes.push(panner);
        panner.pan.value = ((serial % 3) - 1) * .12;
        output.connect(panner);
        panner.connect(SPACE_AUDIO.fx);
      } else output.connect(SPACE_AUDIO.fx);
      serial++;
      active.add(voice);
      if (kind === 'shot') {
        tone('triangle', 1120, 270, .125, .16);
        tone('sine', 1670, 620, .07, .035);
        burst('bandpass', 3100, 1900, .042, .065, .002);
      } else if (kind === 'missile') {
        burst('lowpass', 1750, 620, .54, .20, .018);
        tone('sawtooth', 110, 390, .48, .10, 1700);
        tone('sine', 135, 45, .43, .16);
      } else if (kind === 'destroy') {
        burst('lowpass', 2400, 480, .72, .24);
        burst('highpass', 1900, 1400, .055, .085, .002);
        tone('sine', 150, 45, .67, .18);
      } else if (kind === 'detonate') {
        burst('lowpass', 2800, 280, 1.12, .30);
        burst('highpass', 2100, 1200, .08, .12, .002);
        tone('sine', 125, 31, 1.2, .24);
        tone('sawtooth', 280, 75, .55, .045, 1000);
      } else if (kind === 'crash') {
        burst('bandpass', 1300, 430, .86, .24);
        burst('highpass', 3500, 1700, .13, .10, .002);
        tone('sawtooth', 175, 48, .78, .13, 1400);
      }
      cleanupTimer = setTimeout(cleanup, Math.ceil((endsAt - now) * 1000) + 250);
      lastPlayed = {kind, at: now};
      return true;
    } catch (error) {
      lastError = String(error?.message || error);
      cleanup();
      return false;
    }
  }

  function combatEffect(kind) {
    if (!Object.hasOwn(definitions, kind)) return {ok: false, kind, reason: 'unknown'};
    const blocked = blockedReason();
    if (blocked) return {ok: false, kind, reason: blocked};
    const ctx = arcadeAudio();
    if (!ctx || ctx.state !== 'running') return {ok: false, kind, reason: 'context-unavailable'};
    if (!restoreBus(ctx)) return {ok: false, kind, reason: 'bus-unavailable'};
    const last = lastTimes.get(kind);
    // A replacement AudioContext can start its clock at zero.
    if (last?.context === ctx && ctx.currentTime - last.at < definitions[kind].interval)
      return {ok: false, kind, reason: 'rate-limit'};
    if (active.size >= maxVoices) return {ok: false, kind, reason: 'voice-limit'};
    if (!render(kind, ctx)) return {ok: false, kind, reason: 'render-error'};
    lastTimes.set(kind, {context: ctx, at: ctx.currentTime});
    SPACE_AUDIO.lastFx[kind] = ctx.currentTime;
    return {ok: true, kind};
  }

  spacePlayEffect = function (kind) {
    if (Object.hasOwn(definitions, kind)) {
      const result = combatEffect(kind);
      // Preserve the original sound on browsers unable to construct a new voice.
      if (result.reason === 'render-error') return originalEffect(kind);
      return result.ok;
    }
    if (!blockedReason()) {
      const ctx = arcadeAudio();
      if (ctx?.state === 'running') restoreBus(ctx);
    }
    return originalEffect(kind);
  };

  function stopEffects() {
    generation++;
    for (const voice of active) voice.stop();
  }

  spaceAudioStop = function (...args) {
    try { return originalStop.apply(this, args); }
    finally {
      busToRestore = true;
      stopEffects();
    }
  };

  globalThis.CITADEL_SFX = Object.freeze({
    version: '1.4.2',
    catalog: () => Object.entries(definitions).map(([kind, item]) => ({kind, title: item.title})),
    async play(kind) {
      if (!Object.hasOwn(definitions, kind)) return {ok: false, kind, reason: 'unknown'};
      const blocked = blockedReason();
      if (blocked) return {ok: false, kind, reason: blocked};
      const token = generation;
      const ctx = arcadeAudio();
      if (!ctx) return {ok: false, kind, reason: 'context-unavailable'};
      try { if (ctx.state === 'suspended') await ctx.resume(); }
      catch (_) { return {ok: false, kind, reason: 'context-unavailable'}; }
      if (token !== generation) return {ok: false, kind, reason: 'cancelled'};
      return combatEffect(kind);
    },
    stop: stopEffects,
    status: () => ({
      version: '1.4.2', enabled: Boolean(ARCADE.sound), ready: Boolean(SPACE_AUDIO.ready),
      contextState: ARCADE.audio?.state || 'uninitialized',
      gameStatus: ARCADE.engine?.status || 'uninitialized', view: STATE.view,
      blockedReason: blockedReason(),
      activeVoices: active.size, maxVoices,
      lastPlayed: lastPlayed ? {...lastPlayed} : null,
      lastError
    })
  });
})();
