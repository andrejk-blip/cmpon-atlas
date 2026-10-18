#!/usr/bin/env node
'use strict';
// Real public/admin game cores with independently controllable audio/network
// boundaries. These checks verify playback ordering and lifecycle, not timbre
// or Android hardware. Prepared production MP3s are decoded separately by QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createHarness}=require('./mrg-regression.cjs');
const root=path.resolve(__dirname,'..');
const voicePath=path.join(root,'assets/citadel-voice-v1.8.2.js');
const voiceSource=fs.readFileSync(voicePath,'utf8');
const defaultPackPath=path.join(root,'assets/citadel-voice-pack-v1.8.2.js');

// Deterministic Web Audio/fetch boundary for REAL Citadel bundles in Node VM.
// No browser, network, MP3 codec or speech engine. Audio buffers carry test IDs.
// Every asynchronous boundary can be held/released independently. This is a
// lifecycle simulator, not a DSP model or proof of a recording's sound quality.

function deferred(label) {
  let resolvePromise, rejectPromise;
  const d = { label, state: 'pending', value: undefined };
  d.promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  // A never-consumed response body may be aborted; keep the harness itself from
  // creating an unhandled rejection while preserving rejection for its caller.
  d.promise.catch(() => {});
  d.resolve = value => { if (d.state !== 'pending') return false; d.state = 'fulfilled'; d.value = value; resolvePromise(value); return true; };
  d.reject = error => { if (d.state !== 'pending') return false; d.state = 'rejected'; d.value = error; rejectPromise(error); return true; };
  return d;
}
const namedError = (name, message = name) => Object.assign(new Error(message), { name });
const arrayBuffer = value => {
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).buffer;
};

function createWebAudioLab(options = {}) {
  const lab = {
    nowMs: 0, contexts: [], nodes: [], requests: [], decodes: [], resumes: [], events: [],
    timers: new Map(), speech: { spoken: [], cancellations: 0, voiceReads: 0, utterances: [] },
  };
  let serial = 0, timerSerial = 0;
  const restorers = [], hubs = new Map();
  const event = (type, detail = {}) => lab.events.push({ type, wallMs: lab.nowMs, ...detail });
  const finiteTime = (value, name) => { if (!Number.isFinite(value) || value < 0) throw namedError('RangeError', name); return value; };
  function put(target, key, value) {
    const prior = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, writable: true, enumerable: prior?.enumerable ?? true, configurable: true });
    restorers.push(() => prior ? Object.defineProperty(target, key, prior) : delete target[key]);
  }

  class Param {
    constructor(context, value = 0) { this.context = context; this.ctx = context; this.value = value; this.events = []; }
    cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
    cancelAndHoldAtTime(t) { this.events.push(['hold', t]); return this; }
    setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); return this; }
    setTargetAtTime(v, t, tau) { this.value = v; this.events.push(['target', v, t, tau]); return this; }
    linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['linear', v, t]); return this; }
    exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exponential', v, t]); return this; }
    setValueCurveAtTime(values, start, duration) { this.value = values[values.length - 1]; this.events.push(['curve', Array.from(values), start, duration]); return this; }
  }
  class Node {
    constructor(context, kind) {
      this.id = ++serial; this.context = context; this.ctx = context; this.kind = kind;
      this.connections = []; this.disconnected = false; this.disconnectCalls = 0; this.listeners = new Map();
      this.gain = new Param(context, 1);
      for (const key of ['frequency', 'Q', 'pan', 'detune', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param(context);
      context.nodes.push(this); lab.nodes.push(this); event('node-created', { id: this.id, context: context.id, kind });
    }
    connect(node) {
      if (!node) throw namedError('TypeError', 'connect destination is required');
      const context = node.context || node.ctx;
      if (context && context !== this.context) throw namedError('InvalidAccessError', 'Cannot connect audio nodes from different contexts');
      this.connections.push(node); this.disconnected = false; event('connect', { from: this.id, to: node.id }); return node;
    }
    disconnect(destination) {
      this.disconnectCalls++;
      this.connections = destination ? this.connections.filter(node => node !== destination) : [];
      this.disconnected = this.connections.length === 0; event('disconnect', { id: this.id });
    }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
    _dispatch(type) {
      const data = { type, target: this };
      this['on' + type]?.(data); for (const fn of [...(this.listeners.get(type) || [])]) fn(data);
    }
  }
  class Source extends Node {
    constructor(context, kind) {
      super(context, kind); this.playbackRate = new Param(context, 1); this.loop = false; this.buffer = null;
      this.started = false; this.ended = false; this.startCalls = []; this.stopCalls = []; this.stopAt = Infinity;
    }
    start(when = 0, offset = 0, duration) {
      if (this.started) throw namedError('InvalidStateError', 'AudioScheduledSourceNode can start only once');
      finiteTime(when, 'start time'); finiteTime(offset, 'start offset'); if (duration !== undefined) finiteTime(duration, 'start duration');
      this.started = true; this.startAt = Math.max(when, this.context.currentTime); this.offset = offset;
      const available = Math.max(0, (this.buffer?.duration ?? Infinity) - offset);
      this.playDuration = duration === undefined ? available : Math.min(duration, available);
      this.startCalls.push({ when, actualWhen: this.startAt, offset, duration, wallMs: lab.nowMs });
      event('source-start', { id: this.id, context: this.context.id, kind: this.kind, clipId: this.buffer?.qaClipId ?? null, when: this.startAt });
    }
    stop(when = 0) {
      if (!this.started) throw namedError('InvalidStateError', 'Cannot stop a source before start');
      finiteTime(when, 'stop time');
      this.stopCalls.push({ when, wallMs: lab.nowMs });
      if (!this.ended) this.stopAt = Math.max(when, this.context.currentTime);
      event('source-stop', { id: this.id, context: this.context.id, when });
    }
    _endTime() {
      if (!this.started || this.ended) return Infinity;
      const natural = this.loop || this.kind === 'oscillator' ? Infinity : this.startAt + this.playDuration / Math.max(.0001, this.playbackRate.value);
      return Math.min(this.stopAt, natural);
    }
    _finish() {
      if (this.ended || !this.started) return false;
      this.ended = true; this.endedAt = this.context.currentTime;
      event('source-ended', { id: this.id, context: this.context.id, clipId: this.buffer?.qaClipId ?? null });
      this._dispatch('ended'); return true;
    }
  }
  // Adopted admin contexts can still have older music/FX sources alive. Their
  // explicit stopAt is enough to deliver their existing onended cleanup too.
  const endDeadline = node => node instanceof Source ? node._endTime() : node.started && !node.ended && Number.isFinite(node.stopAt) ? node.stopAt : Infinity;
  const endNode = node => {
    if (node instanceof Source) return node._finish();
    if (!node.started || node.ended) return false;
    node.ended = true; node.onended?.({ type: 'ended', target: node }); return true;
  };
  class MockAudioContext {
    constructor(init = {}) {
      this.id = ++serial; this.nodes = []; this.currentTime = 0; this.sampleRate = init.sampleRate || options.sampleRate || 48000;
      this.state = init.state || options.contextState || 'running'; this.holdResume = init.holdResume ?? options.holdResume ?? false;
      this.resumeCalls = 0; this.closeCalls = 0; this.suspendCalls = 0;
      this.listeners = new Map(); this.fixture = !!init.fixture; lab.contexts.push(this);
      event('context-created', { id: this.id, fixture: this.fixture }); this.destination = new Node(this, 'destination');
    }
    createGain() { return new Node(this, 'gain'); }
    createStereoPanner() { return new Node(this, 'panner'); }
    createBiquadFilter() { return new Node(this, 'filter'); }
    createDelay() { return new Node(this, 'delay'); }
    createDynamicsCompressor() { return new Node(this, 'compressor'); }
    createWaveShaper() { return new Node(this, 'waveshaper'); }
    createOscillator() { return new Source(this, 'oscillator'); }
    createBufferSource() { return new Source(this, 'buffer-source'); }
    createBuffer(channels, length, sampleRate = this.sampleRate) {
      if (this.failBuffer) throw namedError('NotSupportedError', 'Simulated allocation failure');
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
        getChannelData: channel => data[channel], copyToChannel: (samples, channel, start = 0) => data[channel].set(samples, start),
        copyFromChannel: (samples, channel, start = 0) => samples.set(data[channel].subarray(start, start + samples.length)) };
    }
    decodeAudioData(bytes, onSuccess, onError) {
      const completion = deferred('decode'), decodedId = lab.describeBytes(bytes);
      const request = { id: ++serial, context: this, bytes, clipId: decodedId, completion,
        resolve: (settings = {}) => {
          const buffer = typeof settings.getChannelData === 'function' ? settings : lab.buffer({ clipId: decodedId, ...settings, context: this });
          event('decode-resolved', { id: request.id, clipId: buffer.qaClipId }); completion.resolve(buffer); return buffer;
        }, reject: error => { event('decode-rejected', { id: request.id }); return completion.reject(error || namedError('EncodingError', 'Corrupt recording')); } };
      lab.decodes.push(request); event('decode-requested', { id: request.id, context: this.id, clipId: decodedId });
      if (onSuccess || onError) completion.promise.then(value => onSuccess?.(value), error => onError?.(error));
      if (options.autoDecode) request.resolve();
      return completion.promise;
    }
    resume() {
      this.resumeCalls++; const completion = deferred('resume');
      const request = { id: ++serial, context: this, completion,
        resolve: () => { if (this.state === 'closed') return completion.reject(namedError('InvalidStateError')); this.state = 'running'; this._dispatch('statechange'); return completion.resolve(); },
        reject: error => completion.reject(error || namedError('NotAllowedError', 'Gesture required')) };
      lab.resumes.push(request); event('context-resume', { id: this.id }); if (!this.holdResume) request.resolve(); return completion.promise;
    }
    suspend() { this.suspendCalls++; this.state = 'suspended'; event('context-suspend', { id: this.id }); this._dispatch('statechange'); return Promise.resolve(); }
    close() { this.closeCalls++; this.state = 'closed'; event('context-close', { id: this.id }); this._dispatch('statechange'); return Promise.resolve(); }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
    _dispatch(type) { this['on' + type]?.({ type, target: this }); for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, target: this }); }
    // Compatibility with combat-audio-regression.cjs: absolute audio seconds.
    // New async tests should use await lab.advance(ms), which drains microtasks.
    advance(time) { assert(time >= this.currentTime); this.currentTime = time; for (const node of [...this.nodes]) if (node instanceof Source && node._endTime() <= time) node._finish(); }
  }
  lab.AudioContext = MockAudioContext; lab.MockAudioContext = MockAudioContext; lab.Param = Param;
  lab.createContext = init => new MockAudioContext({ fixture: true, ...init });
  lab.buffer = ({ context = lab.contexts[0], clipId = 'test-recording', duration = .5, channels = 1, sampleRate = context?.sampleRate || 48000 } = {}) => {
    assert(context, 'Create a shared context before resolving a decode');
    const buffer = context.createBuffer(channels, Math.max(1, Math.round(duration * sampleRate)), sampleRate);
    // Older Citadel test buffers expose only getChannelData; annotate them so
    // recorded BufferSource natural completion has its real duration contract.
    if (!Number.isFinite(buffer.duration)) buffer.duration = Math.max(1, Math.round(duration * sampleRate)) / sampleRate;
    if (!Number.isFinite(buffer.length)) buffer.length = Math.max(1, Math.round(duration * sampleRate));
    if (!Number.isFinite(buffer.sampleRate)) buffer.sampleRate = sampleRate;
    if (!Number.isFinite(buffer.numberOfChannels)) buffer.numberOfChannels = channels;
    buffer.qaClipId = clipId; return buffer;
  };
  lab.bytes = clipId => new TextEncoder().encode('CITADEL_QA_CLIP:' + clipId).buffer;
  lab.describeBytes = bytes => { try { return new TextDecoder().decode(new Uint8Array(arrayBuffer(bytes))).match(/^CITADEL_QA_CLIP:(.*)$/)?.[1] ?? null; } catch { return null; } };

  lab.fetch = (url, init = {}) => {
    const headersReady = deferred('fetch headers'), bodyReady = deferred('fetch body');
    const request = {
      id: ++serial, url: String(url?.url || url), init, signal: init.signal || url?.signal,
      ignoreAbort: !!options.ignoreAbort, aborted: false, aborts: 0, bodyReads: [], headersReady, bodyReady,
      respond({ status = 200, headers = { 'content-type': 'audio/mpeg' }, body } = {}) {
        const response = { ok: status >= 200 && status < 300, status, url: request.url,
          headers: { get: name => Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null },
          arrayBuffer() { request.bodyReads.push('arrayBuffer'); return bodyReady.promise.then(arrayBuffer); },
          text() { request.bodyReads.push('text'); return bodyReady.promise.then(value => typeof value === 'string' ? value : new TextDecoder().decode(arrayBuffer(value))); },
          json() { request.bodyReads.push('json'); return bodyReady.promise.then(value => typeof value === 'object' && !ArrayBuffer.isView(value) && Object.prototype.toString.call(value) !== '[object ArrayBuffer]' ? value : JSON.parse(typeof value === 'string' ? value : new TextDecoder().decode(arrayBuffer(value)))); },
        };
        event('fetch-headers', { id: request.id, status }); headersReady.resolve(response);
        if (body !== undefined) request.resolveBody(body); return response;
      },
      resolveBody(value = lab.bytes(request.url)) { event('fetch-body', { id: request.id }); return bodyReady.resolve(value); },
      rejectHeaders(error = namedError('TypeError', 'Network failure')) { return headersReady.reject(error); },
      rejectBody(error = namedError('TypeError', 'Body stream failure')) { return bodyReady.reject(error); },
    };
    lab.requests.push(request); event('fetch-requested', { id: request.id, url: request.url });
    const onAbort = () => {
      request.aborted = true; request.aborts++; event('fetch-aborted', { id: request.id, ignored: request.ignoreAbort });
      if (!request.ignoreAbort) { const error = request.signal?.reason || namedError('AbortError'); headersReady.reject(error); bodyReady.reject(error); }
    };
    if (request.signal?.aborted) onAbort(); else request.signal?.addEventListener?.('abort', onAbort, { once: true });
    return headersReady.promise;
  };

  lab.setTimeout = (fn, ms = 0, ...args) => {
    const id = ++timerSerial; lab.timers.set(id, { id, fn: () => fn(...args), at: lab.nowMs + Math.max(0, Number(ms) || 0), interval: 0 }); return id;
  };
  lab.clearTimeout = id => lab.timers.delete(id);
  lab.setInterval = (fn, ms = 0, ...args) => {
    const interval = Math.max(1, Number(ms) || 0), id = ++timerSerial;
    lab.timers.set(id, { id, fn: () => fn(...args), at: lab.nowMs + interval, interval }); return id;
  };
  lab.clearInterval = lab.clearTimeout;
  lab.flush = async (rounds = 12) => { for (let i = 0; i < rounds; i++) await Promise.resolve(); };
  lab.advance = async ms => {
    assert(Number.isFinite(ms) && ms >= 0); const target = lab.nowMs + ms; await lab.flush();
    for (let guard = 0; guard < 10000; guard++) {
      let next = target;
      for (const timer of lab.timers.values()) next = Math.min(next, Math.max(lab.nowMs, timer.at));
      for (const context of lab.contexts) if (context.state === 'running') for (const node of context.nodes) next = Math.min(next, lab.nowMs + Math.max(0, endDeadline(node) - context.currentTime) * 1000);
      const step = Math.max(0, next - lab.nowMs); lab.nowMs += step;
      for (const context of lab.contexts) if (context.state === 'running') context.currentTime += step / 1000;
      let fired = 0;
      for (const context of lab.contexts) if (context.state === 'running') for (const node of [...context.nodes]) if (endDeadline(node) <= context.currentTime + 1e-9) { fired += endNode(node) ? 1 : 0; }
      for (const [id, timer] of [...lab.timers]) if (timer.at <= lab.nowMs + 1e-7) {
        if (!lab.timers.has(id)) continue;
        if (timer.interval) timer.at = lab.nowMs + timer.interval; else lab.timers.delete(id);
        fired++; timer.fn();
      }
      await lab.flush();
      if (lab.nowMs >= target && ![...lab.timers.values()].some(timer => timer.at <= target + 1e-7) && !lab.contexts.some(context => context.state === 'running' && context.nodes.some(node => endDeadline(node) <= context.currentTime + 1e-9))) return;
      if (!fired && !step && lab.nowMs < target) throw new Error('Audio mock clock failed to advance');
    }
    throw new Error('Audio mock clock exceeded 10000 tasks; likely unbounded scheduling');
  };

  function installEvents(target, label) {
    const list = new Map(); hubs.set(label, { target, list });
    const oldAdd = target.addEventListener?.bind(target), oldRemove = target.removeEventListener?.bind(target);
    put(target, 'addEventListener', (type, fn, options) => { const callbacks = list.get(type) || []; callbacks.push({ fn, once: !!options?.once }); list.set(type, callbacks); oldAdd?.(type, fn, options); });
    put(target, 'removeEventListener', (type, fn, options) => { list.set(type, (list.get(type) || []).filter(item => item.fn !== fn)); oldRemove?.(type, fn, options); });
    put(target, 'dispatchEvent', data => { lab.dispatch(label, data.type, data); return true; });
  }
  lab.dispatch = (label, type, details = {}) => {
    const hub = hubs.get(label); assert(hub, 'Install mocks before dispatching lifecycle events');
    const data = { type, target: hub.target, ...details };
    for (const entry of [...(hub.list.get(type) || [])]) { if (entry.once) hub.list.set(type, hub.list.get(type).filter(item => item !== entry)); entry.fn(data); }
  };
  lab.hide = value => { const hub = hubs.get('document'); assert(hub); hub.target.hidden = value; lab.dispatch('document', 'visibilitychange'); };
  lab.install = (context, { speech = 'absent', timers = true, lifecycle = true, constructors = true } = {}) => {
    if (constructors) { put(context, 'AudioContext', MockAudioContext); put(context, 'webkitAudioContext', MockAudioContext); }
    put(context, 'fetch', lab.fetch);
    put(context, 'AbortController', AbortController); put(context, 'AbortSignal', AbortSignal);
    put(context, 'CustomEvent', function (type, { detail } = {}) { this.type = type; this.detail = detail; });
    if (timers) {
      for (const key of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) put(context, key, lab[key]);
      put(context, 'performance', { now: () => lab.nowMs });
    }
    if (lifecycle) { installEvents(context, 'window'); if (context.document) installEvents(context.document, 'document'); }
    if (speech === 'absent') { put(context, 'speechSynthesis', undefined); put(context, 'SpeechSynthesisUtterance', undefined); }
    else {
      const synthesis = { speaking: false, pending: false,
        getVoices() { lab.speech.voiceReads++; return []; },
        speak(utterance) { lab.speech.spoken.push(utterance); event('system-speech', { text: utterance.text }); if (speech === 'throw') throw new Error('Recorded voice unexpectedly invoked speechSynthesis'); this.speaking = true; },
        cancel() { lab.speech.cancellations++; this.speaking = false; this.pending = false; },
        addEventListener() {}, removeEventListener() {},
      };
      put(context, 'speechSynthesis', synthesis);
      put(context, 'SpeechSynthesisUtterance', function (text) { this.text = text; lab.speech.utterances.push(this); });
    }
    return lab;
  };
  // Extend an ALREADY created shared mock context in the admin verifier. This
  // keeps ARCADE.audio and every existing music/FX node unchanged. Only future
  // node factories and the asynchronous decode/resume boundary are instrumented.
  lab.adoptContext = (context, { holdResume = false, nodeFactories = true } = {}) => {
    assert(context && Array.isArray(context.nodes), 'Expected an existing Citadel mock AudioContext');
    if (lab.contexts.includes(context)) return context;
    put(context, 'id', context.id || ++serial); put(context, 'fixture', true);
    put(context, 'holdResume', holdResume); put(context, 'listeners', context.listeners || new Map());
    for (const name of ['resumeCalls', 'closeCalls', 'suspendCalls']) put(context, name, context[name] || 0);
    put(context, '_dispatch', MockAudioContext.prototype._dispatch);
    put(context, 'decodeAudioData', MockAudioContext.prototype.decodeAudioData);
    put(context, 'resume', MockAudioContext.prototype.resume);
    for (const name of ['suspend', 'close']) {
      const original = context[name]?.bind(context);
      put(context, name, original ? function (...args) { this[name + 'Calls']++; event('context-' + name, { id: this.id }); return original(...args); } : MockAudioContext.prototype[name]);
    }
    if (nodeFactories) for (const name of ['createGain', 'createStereoPanner', 'createBiquadFilter', 'createDelay', 'createDynamicsCompressor', 'createWaveShaper', 'createOscillator', 'createBufferSource']) put(context, name, MockAudioContext.prototype[name]);
    lab.contexts.push(context); for (const node of context.nodes) if (!lab.nodes.includes(node)) lab.nodes.push(node);
    event('context-adopted', { id: context.id }); return context;
  };
  lab.uninstall = () => { for (const restore of restorers.reverse()) restore(); restorers.length = 0; };
  lab.mark = () => ({ events: lab.events.length, nodes: lab.nodes.length, requests: lab.requests.length, decodes: lab.decodes.length, contexts: lab.contexts.length, starts: lab.events.filter(item => item.type === 'source-start').length });
  lab.startedSince = mark => lab.events.slice(mark.events).filter(item => item.type === 'source-start');
  lab.sourcesSince = mark => lab.nodes.slice(mark.nodes).filter(node => node instanceof Source);
  lab.pendingSources = () => lab.nodes.filter(node => node.started && !node.ended);
  lab.playingSources = () => lab.pendingSources().filter(node => node.context.state === 'running' && node.startAt <= node.context.currentTime);
  lab.captureEnded = source => {
    const callbacks = [source.onended, ...(source.listeners.get('ended') || [])].filter(Boolean);
    return () => { event('stale-ended-replayed', { id: source.id }); for (const fn of callbacks) fn({ type: 'ended', target: source }); };
  };
  lab.end = source => source._finish();
  lab.snapshot = () => ({
    wallMs: lab.nowMs, contexts: lab.contexts.map(context => ({ id: context.id, fixture: context.fixture, state: context.state, resumeCalls: context.resumeCalls, suspendCalls: context.suspendCalls, closeCalls: context.closeCalls })),
    requests: lab.requests.map(request => ({ id: request.id, url: request.url, aborted: request.aborted, ignoreAbort: request.ignoreAbort, headers: request.headersReady.state, body: request.bodyReady.state })),
    decodes: lab.decodes.map(request => ({ id: request.id, clipId: request.clipId, state: request.completion.state })),
    sources: lab.nodes.filter(node => node instanceof Source).map(node => ({ id: node.id, kind: node.kind, clipId: node.buffer?.qaClipId ?? null, started: node.started, startAt: node.startAt, ended: node.ended, stopCalls: node.stopCalls.length, disconnected: node.disconnected })),
    timers: [...lab.timers.values()].map(({ id, at, interval }) => ({ id, at, interval })), systemSpeechCalls: lab.speech.spoken.length,
  });
  return lab;
}

const fixtureBody='Укажите измеримый результат и условия проверки.';
const fixturePack=()=>({version:'1.8.2',voice:'Капитан',baseUrl:'./assets/voice-v1.8.2/',clips:[
  {id:'result-correct',kind:'prefix',text:'Верное решение.',spokenText:'Верное решение.',file:'result-correct.mp3'},
  {id:'result-incorrect',kind:'prefix',text:'Это решение требует пересмотра.',spokenText:'Это решение требует пересмотра.',file:'result-incorrect.mp3'},
  {id:'lesson-fixture',kind:'lesson',text:fixtureBody,spokenText:fixtureBody,file:'lesson-fixture.mp3'},
  {id:'preview-lesson',kind:'preview',text:'Хорошее требование понятно, проверяемо и не оставляет места догадкам.',spokenText:'Хорошее требование понятно, проверяемо и не оставляет места догадкам.',file:'preview-lesson.mp3'},
  {id:'commander-fixture',kind:'commander',text:'Без тэ зэ и результат ха зэ!',spokenText:'Говорит капитан. Без тэ зэ и результат ха зэ! Приём.',caption:'Говорит капитан. Без ТЗ и результат ХЗ! Приём.',file:'commander-fixture.mp3'}
]});
function setup(core,{pack=fixturePack(),packPath=null,speech='absent',contextState='running',holdResume=false,existingContext=false,realSfx=false,memory=false}={}) {
  const h=createHarness(core,null,null),ctx=h.context,lab=createWebAudioLab({contextState,holdResume});
  lab.install(ctx,{speech});
  ctx.document.baseURI='https://andrejk-blip.github.io/cmpon-atlas/atlas.html';
  if(memory){
    ctx.localStorage={getItem(){throw Error('Persistent storage read');},setItem(){throw Error('Persistent storage write');}};
    vm.runInContext('const localStorage=(()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};})();',ctx);
  }
  if(existingContext)h.arcade.audio=lab.createContext({state:contextState,holdResume});
  vm.runInContext('SPACE_AUDIO.music=false;globalThis.qaAudio=SPACE_AUDIO;',ctx);
  if(realSfx)vm.runInContext(fs.readFileSync(path.join(root,'assets/citadel-sfx-v1.7.0.js'),'utf8'),ctx,{filename:'citadel-sfx-v1.7.0.js'});
  if(packPath)vm.runInContext(fs.readFileSync(packPath,'utf8'),ctx,{filename:path.basename(packPath)});
  else if(pack)ctx.CITADEL_VOICE_PACK=pack;
  const e=new h.Engine(417147,()=>{});h.arcade.engine=e;e.status='paused';
  vm.runInContext(voiceSource,ctx,{filename:path.basename(voicePath)});
  return {...h,ctx,lab,e,api:ctx.CITADEL_VOICE,audio:ctx.qaAudio,run:s=>vm.runInContext(s,ctx)};
}
async function deliver(h,{duration=.3}={}) {
  for(const req of h.lab.requests){
    if(req.aborted&&!req.ignoreAbort)continue;
    if(req.headersReady.state==='pending')req.respond();
    if(req.bodyReady.state==='pending')req.resolveBody(h.lab.bytes(path.basename(req.url,'.mp3')));
  }
  await h.lab.flush();
  for(const req of h.lab.decodes)if(req.completion.state==='pending')req.resolve({duration});
  await h.lab.flush();
}
const started=h=>h.lab.events.filter(x=>x.type==='source-start'&&x.clipId);
const recordedSources=h=>h.lab.nodes.filter(x=>x.kind==='buffer-source'&&x.buffer?.qaClipId);
function collectStaticCases(h) {
  const q=h.run('({lessons:CITADEL_LESSONS,remarks:CITADEL_REMARKS,finals:FINALE_TRIALS,lesson:citadelLessonCase,remark:citadelRemarkCase,final:typeof citadelFinalCase==="function"?citadelFinalCase:(index)=>FINALE_TRIALS[index],variant:citadelVariantIndex})');
  const cases=[];
  for(const kind of ['lesson','remark'])for(let slot=0;slot<(kind==='lesson'?q.lessons:q.remarks).length;slot++)for(let variant=0;variant<3;variant++) {
    let seed=0;while(q.variant({seed},slot+(kind==='remark'?8:0))!==variant)seed++;
    const card=q[kind]({caseBank:1,seed},slot);
    cases.push({kind,slot,variant,seed,card,body:h.api.sanitizeText(card.why||card.lesson||card.outcome?.after)});
  }
  for(let slot=0;slot<q.finals.length;slot++){
    const card=q.final(slot);cases.push({kind:'finalcheck',slot,variant:0,seed:417147,card,body:h.api.sanitizeText(card.why||card.lesson||card.outcome?.after)});
  }
  const academy=JSON.parse(fs.readFileSync(path.join(root,'assets/citadel-academy-cards-v1.4.0.json'),'utf8')).cards;
  return {cases,academy,bodies:[...new Set([...cases.map(x=>x.body),...academy.map(x=>h.api.sanitizeText(x.lesson))])]};
}
async function main(argv=process.argv.slice(2)) {
  const options={cores:[],packPath:defaultPackPath,report:null};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--core')options.cores.push(path.resolve(argv[++i]));
    else if(argv[i]==='--pack')options.packPath=path.resolve(argv[++i]);
    else if(argv[i]==='--report')options.report=path.resolve(argv[++i]);
    else throw Error('Usage: prepared-voice-regression.cjs [--core path] [--pack path] [--report path]');
  }
  if(!options.cores.length)options.cores=[path.join(root,'assets/atlas-v1.3.5.js')];
  assert(fs.existsSync(options.packPath),'Prepared production pack must exist; fixtures only exercise boundary tests');
  const startedAt=Date.now(),reports=[];
  for(const core of options.cores){
    const tests=[];
    async function test(name,fn){const start=Date.now();try{await fn();tests.push({name,ok:true,ms:Date.now()-start});}catch(error){tests.push({name,ok:false,ms:Date.now()-start,error:error.stack});}}
    await test('actual pack covers every unique published/legacy reason and both outcome prefixes with one body per text',async()=>{
      const h=setup(core,{packPath:options.packPath,speech:'throw'}),{cases,academy,bodies}=collectStaticCases(h),pack=h.ctx.CITADEL_VOICE_PACK;
      assert.equal(cases.length,63);assert.equal(academy.length,36);assert.equal(bodies.length,99);
      assert.equal(pack.clips.length,110);assert.equal(pack.clips.filter(x=>x.kind==='lesson').length,99);
      assert.equal(pack.clips.filter(x=>x.kind==='commander').length,8);
      assert.equal(h.api.status().preparedAvailable,true);assert.equal(h.api.status().preparedClips,110);
      assert.equal(h.lab.requests.length,0,'Startup loads no audio clips');
      for(const clip of pack.clips.filter(x=>x.kind==='lesson')){assert(clip.spokenText.length<=100);assert(bodies.includes(h.api.sanitizeText(clip.text)));}
      for(const body of bodies)for(const prefix of ['', 'Верное решение. ', 'Это решение требует пересмотра. ']) {
        const before=started(h).length,p=h.api.previewLesson(prefix+body);await deliver(h,{duration:.02});
        const result=await p;assert.equal(result.source,'recorded');assert.equal(result.ok,true);
        await h.lab.advance(prefix?50:25);
        const clips=started(h).slice(before);assert.equal(clips.length,prefix?2:1);
        if(prefix)assert.equal(clips[0].clipId,prefix.startsWith('Верное')?'result-correct':'result-incorrect');
        assert.equal(h.api.status().busy,false);
      }
      assert.equal(h.lab.speech.spoken.length,0);assert.equal(h.lab.contexts.length,1);
      h.api.dispose();
    });
    await test('all real answer handlers preserve rewards and narrate correct/incorrect explanations, including three lab finals without helper',async()=>{
      const h=setup(core,{packPath:options.packPath,speech:'throw'}),{cases}=collectStaticCases(h),e=h.e;
      for(const item of cases)for(const correct of [false,true]) {
        e.caseBank=1;e.seed=item.seed;e.status=item.kind;e.score=1000;
        if(item.kind==='lesson')e.lesson={caseIndex:item.slot,solved:false,attempts:0,feedback:null,readClock:0,reqId:'voice-qa',stage:0};
        if(item.kind==='remark'){e.board={question:item.slot,answered:false,completed:[]};e.remarkFeedback=null;}
        if(item.kind==='finalcheck'){e.finale={phase:'maze',answer:null};e.board={completed:Array.from({length:item.slot},(_,i)=>i)};}
        const answer=correct?item.card.correct:(item.card.correct+1)%(item.kind==='lesson'?4:3),before=started(h).length;
        const ok=e[item.kind==='lesson'?'answerLesson':item.kind==='remark'?'answer':'answerFinale'](answer);
        assert.equal(ok,correct);assert.equal(e.score,1000+(item.kind==='lesson'?(correct?300:0):item.kind==='remark'?(correct?500:-100):0));
        await deliver(h,{duration:.02});await h.lab.advance(50);
        const clips=started(h).slice(before);assert.equal(clips.length,2,item.kind+' '+item.slot+' v'+item.variant);
        assert.equal(clips[0].clipId,correct?'result-correct':'result-incorrect');
        assert.equal(h.api.status().lastSpoken.text,h.api.sanitizeText((correct?'Верное решение. ':'Это решение требует пересмотра. ')+item.body));
        assert.equal(h.api.status().source,'recorded');
      }
      assert.equal(h.lab.speech.spoken.length,0);h.api.dispose();
    });
    await test('fetch headers, body, decode and resume must all finish before actual start succeeds',async()=>{
      const h=setup(core,{contextState:'suspended',holdResume:true,speech:'throw'});let result;
      const p=h.api.previewLesson(fixtureBody).then(x=>{result=x;return x;});
      assert.equal(h.api.status().phase,'loading');assert.equal(h.lab.resumes.length,1,'Resume is called in the initial gesture');
      assert.equal(h.lab.requests.length,1);h.lab.requests[0].respond();await h.lab.flush();assert.equal(result,undefined);
      h.lab.requests[0].resolveBody(h.lab.bytes('body'));await h.lab.flush();assert.equal(h.lab.decodes.length,1);assert.equal(result,undefined);
      h.lab.decodes[0].resolve();await h.lab.flush();assert.equal(started(h).length,0);assert.equal(result,undefined);
      h.lab.resumes[0].resolve();await h.lab.flush();assert.equal((await p).started,true);assert.equal(result.source,'recorded');
      assert.equal(h.api.status().phase,'playing');assert.equal(h.lab.contexts.length,1);assert.equal(h.lab.speech.spoken.length,0);
      await h.lab.advance(600);assert.equal(h.api.status().busy,false);h.api.dispose();
    });
    await test('outcome plus body play in order; cached bare replay never repeats a result prefix',async()=>{
      const h=setup(core),p=h.api.previewLesson('Это решение требует пересмотра. '+fixtureBody);await deliver(h,{duration:.2});await p;
      assert.deepEqual(started(h).map(x=>x.clipId),['result-incorrect']);
      await h.lab.advance(210);assert.deepEqual(started(h).map(x=>x.clipId),['result-incorrect','lesson-fixture']);
      await h.lab.advance(210);const fetched=h.lab.requests.length;
      const replay=h.api.previewLesson(fixtureBody);await h.lab.flush();assert.equal((await replay).ok,true);
      assert.equal(h.lab.requests.length,fetched);assert.equal(started(h).at(-1).clipId,'lesson-fixture');
      h.api.dispose();
    });
    await test('cancelling each pending boundary ignores late success, including fetch implementations that ignore AbortSignal',async()=>{
      for(const boundary of ['headers','body','decode','resume']){
        const h=setup(core,{contextState:boundary==='resume'?'suspended':'running',holdResume:boundary==='resume'});
        const p=h.api.previewLesson(fixtureBody),req=h.lab.requests[0];req.ignoreAbort=true;
        if(boundary!=='headers'){req.respond();await h.lab.flush();}
        if(['decode','resume'].includes(boundary)){req.resolveBody(h.lab.bytes('cancelled'));await h.lab.flush();}
        if(boundary==='resume'){h.lab.decodes[0].resolve();await h.lab.flush();}
        h.api.stop('dialog-closed');assert.equal((await p).reason,'dialog-closed');assert(req.aborted);
        if(req.headersReady.state==='pending')req.respond();if(req.bodyReady.state==='pending')req.resolveBody(h.lab.bytes('cancelled'));
        for(const d of h.lab.decodes)if(d.completion.state==='pending')d.resolve();for(const r of h.lab.resumes)if(r.completion.state==='pending')r.resolve();
        await h.lab.flush();await h.lab.advance(20000);assert.equal(started(h).length,0,boundary);assert.equal(h.api.status().busy,false);
        assert.equal(h.lab.contexts[0].closeCalls,0);h.api.dispose();
      }
    });
    await test('stop during prefix, stale ended and replacement cannot start the old body or stop the new clip',async()=>{
      const h=setup(core),p=h.api.previewLesson('Верное решение. '+fixtureBody);await deliver(h);await p;
      const old=recordedSources(h)[0],stale=h.lab.captureEnded(old);h.api.stop('closed');
      assert.equal(old.stopCalls.length,1);assert(old.disconnected);
      const next=h.api.previewCommander();await deliver(h,{duration:2});await next;
      stale();await h.lab.advance(400);assert.equal(started(h).length,2);assert.equal(h.api.status().busy,true);
      assert.equal(h.api.status().kind,'commander');assert.equal(recordedSources(h).at(-1).stopCalls.length,0);
      h.api.dispose();assert.equal(h.lab.contexts[0].closeCalls,0);
    });
    await test('pause, next card, hidden tab, blur, scene change, mute and engine removal cancel prepared audio promptly',async()=>{
      const stops=[
        ['pause',h=>h.e.pause()],['next-card',h=>h.e.continueLesson()],['hidden',h=>h.lab.hide(true)],
        ['blur',h=>h.lab.dispatch('window','blur')],['pagehide',h=>h.lab.dispatch('window','pagehide')],
        ['mute',h=>h.api.setEnabled(false)],['scene',h=>{h.state.view='schema';h.e.step(0,{});}],
        ['engine-removed',h=>{h.arcade.engine=null;h.e.step(0,{});}]
      ];
      for(const [name,action] of stops){
        const h=setup(core),p=h.api.previewLesson(fixtureBody);await deliver(h,{duration:8});await p;const source=recordedSources(h)[0];
        action(h);assert.equal(h.api.status().busy,false,name);assert.equal(source.stopCalls.length,1,name);assert(source.disconnected);
        await h.lab.advance(10000);assert.equal(started(h).length,1);assert.equal(h.lab.contexts[0].closeCalls,0);h.api.dispose();
      }
    });
    await test('a card stamp change during decode cancels the pending explanation without waiting for a game tick',async()=>{
      const h=setup(core);h.e.status='lesson';h.e.lesson={caseIndex:0,feedback:{index:1}};
      const p=h.api.speakLesson(fixtureBody);h.lab.requests[0].respond({body:h.lab.bytes('old-card')});await h.lab.flush();
      h.e.lesson.caseIndex=1;h.lab.decodes[0].resolve();await h.lab.flush();
      assert.equal((await p).reason,'inactive');assert.equal(started(h).length,0);assert.equal(h.api.status().busy,false);h.api.dispose();
    });
    await test('voice-only playback reuses an existing context or creates exactly one, independent of muted SFX/music and lexical lab storage',async()=>{
      for(const existingContext of [false,true]){
        const h=setup(core,{existingContext,memory:true}),old=h.arcade.audio;
        assert.equal(h.arcade.sound,false);assert.equal(h.audio.music,false);assert.equal(h.lab.requests.length,0);
        const p=h.api.previewLesson(fixtureBody);await deliver(h);assert.equal((await p).ok,true);assert.equal(h.lab.contexts.length,1);
        if(old)assert.equal(h.arcade.audio,old);assert.equal(h.audio.bus.gain.value,.35);
        h.api.setEnabled(false);assert.equal(h.audio.bus.gain.value,1);assert.equal(h.arcade.sound,false);assert.equal(h.audio.music,false);
        assert.equal(h.run("localStorage.getItem('citadel-academy-voice-v1')"),'false');assert.equal(h.lab.contexts[0].closeCalls,0);h.api.dispose();
      }
    });
    await test('recorded radio has no duplicate SFX and stopping voice releases music duck without stopping active effects',async()=>{
      const h=setup(core,{realSfx:true});h.arcade.sound=true;
      const fx=await h.ctx.CITADEL_SFX.play('shot-space');assert.equal(fx.ok,true);
      const effectSources=h.lab.nodes.filter(x=>x.kind==='buffer-source'||x.kind==='oscillator'),stops=effectSources.map(x=>x.stopCalls.length),before=h.lab.nodes.length;
      const p=h.api.previewCommander();await deliver(h,{duration:2});await p;
      const created=h.lab.nodes.slice(before);assert.equal(created.filter(x=>x.kind==='buffer-source'||x.kind==='oscillator').length,1,'Only the prerecorded MP3 source');
      assert.equal(h.audio.bus.gain.value,.35);h.api.stop();assert.equal(h.audio.bus.gain.value,1);
      effectSources.forEach((x,i)=>assert.equal(x.stopCalls.length,stops[i]));assert.equal(h.lab.contexts.length,1);h.api.dispose();
    });
    await test('HTTP, body, decode and resume failures before playback use one truthful stable system fallback',async()=>{
      for(const fail of ['http','body','decode','resume']){
        const h=setup(core,{speech:'record',contextState:fail==='resume'?'suspended':'running',holdResume:fail==='resume'});
        h.ctx.speechSynthesis.getVoices=()=>[{name:'Irina',lang:'ru-RU'},{name:'Pavel',lang:'ru-RU',localService:true}];
        const p=h.api.previewLesson(fixtureBody),req=h.lab.requests[0];
        if(fail==='http')req.respond({status:404});
        else if(fail==='body'){req.respond();await h.lab.flush();req.rejectBody();}
        else {req.respond({body:h.lab.bytes('bad')});await h.lab.flush();if(fail==='decode')h.lab.decodes[0].reject();else{h.lab.decodes[0].resolve();h.lab.resumes[0].reject();}}
        await h.lab.flush();assert.equal(started(h).length,0);assert.equal(h.lab.speech.spoken.length,1,fail);
        const utter=h.lab.speech.spoken[0];assert.equal(utter.voice.name,'Pavel');assert.equal(utter.pitch,1);assert.equal(utter.rate,1);
        assert.equal(h.api.status().started,false);utter.onstart();assert.equal((await p).source,'system');assert(h.api.status().lastError);h.api.dispose();
      }
    });
    await test('load watchdog can fallback once; late download or resume cannot restart a recording over system speech',async()=>{
      const h=setup(core,{speech:'record',contextState:'suspended',holdResume:true});
      const p=h.api.previewLesson(fixtureBody),req=h.lab.requests[0];req.ignoreAbort=true;
      await h.lab.advance(12000);assert.equal(h.lab.speech.spoken.length,1);h.lab.speech.spoken[0].onstart();assert.equal((await p).source,'system');
      req.respond({body:h.lab.bytes('late')});h.lab.resumes[0].resolve();await h.lab.flush();await h.lab.advance(1000);
      assert.equal(started(h).length,0);assert.equal(h.lab.speech.spoken.length,1);h.api.dispose();
    });
    await test('missing recordings/unsupported platforms fail cleanly; late pack availability works without a reload',async()=>{
      const h=setup(core,{pack:null});assert.equal(h.api.status().supported,false);
      assert.equal((await h.api.previewLesson(fixtureBody)).reason,'unsupported');h.ctx.CITADEL_VOICE_PACK=fixturePack();
      const p=h.api.previewLesson(fixtureBody);await deliver(h);assert.equal((await p).source,'recorded');h.api.stop();
      assert.equal((await h.api.previewLesson('Только что отредактированный текст.')).reason,'recording-unavailable');
      const broken=h.api.previewCommander();h.lab.requests.at(-1).respond({status:404});await h.lab.flush();
      assert.equal((await broken).ok,false);assert.equal(h.api.status().busy,false);assert.match(h.api.status().lastError,/404/);h.api.dispose();
    });
    await test('edited unknown text never plays the old answer; OS voice identity remains stable when available voices reorder',async()=>{
      const h=setup(core,{speech:'record'}),list=[{name:'Irina',lang:'ru-RU',localService:true},{name:'Pavel',lang:'ru-RU',voiceURI:'pavel',localService:true}];
      h.ctx.speechSynthesis.getVoices=()=>list;
      for(let i=0;i<3;i++){
        const p=h.api.previewLesson(fixtureBody+' Дополнение '+i+'.');const utter=h.lab.speech.spoken.at(-1);utter.onstart();assert.equal((await p).source,'system');
        assert.equal(utter.voice.name,'Pavel');assert.equal(utter.rate,1);assert.equal(utter.pitch,1);assert.equal(h.lab.requests.length,0);
        h.ctx.speechSynthesis.speaking=false;utter.onend();list.reverse();
      }
      h.api.dispose();
    });
    await test('suspended context and disposal stop sources, restore bus gain and leave the shared context open',async()=>{
      const h=setup(core),p=h.api.previewLesson(fixtureBody);await deliver(h,{duration:4});await p;
      await h.arcade.audio.suspend();assert.equal(h.api.status().busy,false);assert.equal(h.audio.bus.gain.value,1);
      assert(recordedSources(h)[0].disconnected);await h.arcade.audio.resume();await h.lab.flush();
      const p2=h.api.previewLesson(fixtureBody);await h.lab.flush();await p2;assert.equal(h.lab.contexts.length,1);
      h.api.dispose();assert.equal(h.api.status().disposed,true);assert.equal(h.api.status().busy,false);assert.equal(h.audio.bus.gain.value,1);
      assert.equal(h.arcade.audio.closeCalls,0);assert.equal((await h.api.previewLesson()).reason,'disposed');
    });
    reports.push({core:path.basename(core),version:'1.8.2',tests});
  }
  const report={kind:'prepared-voice-lifecycle',version:'1.8.2',runtimeSha256:crypto.createHash('sha256').update(voiceSource).digest('hex'),packSha256:crypto.createHash('sha256').update(fs.readFileSync(options.packPath)).digest('hex'),elapsedMs:Date.now()-startedAt,reports};
  if(options.report)fs.writeFileSync(options.report,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(reports.some(x=>x.tests.some(t=>!t.ok)))process.exitCode=1;return report;
}
module.exports={main,setup,createWebAudioLab,collectStaticCases,deliver};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
