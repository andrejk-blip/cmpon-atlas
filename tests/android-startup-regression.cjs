#!/usr/bin/env node
'use strict';

// Actual public scripts, native Canvas 2D, isolated DOM/HTTP/storage/audio mocks.
// This is an Android-like feature regression, NOT an Android browser/device test.
// No profiles, scores, or saves are sent to the real service.
// node tests/android-startup-regression.cjs [--report /tmp/android-startup.json]
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { MockAudioContext } = require('./combat-audio-regression.cjs');
const root = path.resolve(__dirname, '..');
const compatPath = path.join(root, 'assets/citadel-compat-v1.7.1.js');
const source = fs.readFileSync(compatPath, 'utf8');
const corePath = path.join(root, 'assets/atlas-v1.3.6.js');
const createCanvas = require(require.resolve('@napi-rs/canvas', {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, root].filter(Boolean),
})).createCanvas;
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script defer src="\.\/(.*?)"/g)]
  .map(m => m[1].split('?')[0]).filter(name => !/atlas-v1\.|citadel-compat-|citadel-startup-|citadel-launch-/.test(name));
const results = [];
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const run = (c, code) => vm.runInContext(code, c);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function timerClock() {
  const timers = new Map(); let serial = 0;
  return { timers,
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fire(id) { const item = timers.get(id); timers.delete(id); item.fn(); },
  };
}

function contextFor({ legacy = false, controllerless = false, fetchImpl } = {}) {
  const clock = timerClock();
  const context = { console, ...clock, DOMException, Uint8Array, Uint32Array, Blob, URL, URLSearchParams,
    crypto: { getRandomValues: crypto.webcrypto.getRandomValues.bind(crypto.webcrypto),
      ...(!legacy && { randomUUID: crypto.randomUUID }) },
    AbortController: controllerless ? undefined : AbortController,
    AbortSignal: legacy ? function LegacySignal() {} : AbortSignal,
    fetch: fetchImpl || (async () => ({ ok: true })),
  };
  context.window = context;
  vm.createContext(context);
  if (legacy) run(context, 'delete Object.hasOwn; delete Array.prototype.at; delete String.prototype.replaceAll;');
  return context;
}

function mobileHarness(profile = {}) {
  const nodes = new Map(), storage = new Map(profile.storage || []), handlers = new Map(), fetchCalls = [], intervals = [];
  const c = contextFor({ ...profile, fetchImpl: async (url, options = {}) => {
    const endpoint = String(url).split('/').pop().split('?')[0];
    fetchCalls.push({ endpoint, options });
    if (profile.fetchImpl) { const custom = profile.fetchImpl(String(url), options); if (custom !== undefined) return custom; }
    const player = { id: 'mock-player', name: 'Android test' };
    const attempt = { id: 'mock-run', seed: 417147, mode: 'calm', status: 'active',
      gameVersion: '1.3.0', progress: 0, clock: 0, revision: 0 };
    const data = endpoint === 'config' ? { cups: [] } : endpoint === 'enter' ? { token: 'mock-token', player } :
      endpoint === 'me' ? { player, runs: [] } : ['start', 'save'].includes(endpoint) ? { run: attempt } :
      endpoint === 'citadel-academy-cards-v1.4.0.json' ? JSON.parse(fs.readFileSync(path.join(root, 'assets', endpoint), 'utf8')) : { rows: [] };
    return { ok: true, status: 200, json: async () => data };
  } });
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    let item = { id, tagName: 'DIV', innerHTML: '', textContent: id === 'release-data' ? '{"version":"test"}' : '',
      value: '', hidden: false, open: false, style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, handlers: {}, attrs: {},
      classList: { add(k) { classes.add(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); },
        toggle(k, on) { if (on === undefined) on = !classes.has(k); on ? classes.add(k) : classes.delete(k); } },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 480 }; },
      addEventListener(k, f) { (this.handlers[k] ??= []).push(f); }, removeEventListener() {},
      focus() { c.document.activeElement = this; }, setPointerCapture() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      matches() { return false; }, closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {},
      insertAdjacentHTML(_, html) { this.innerHTML += html; },
      appendChild(child) { (this.children ??= []).push(child); return child; },
      insertBefore(child) { return this.appendChild(child); }, append(...children) { children.forEach(child => this.appendChild(child)); },
    };
    if (/canvas/.test(id)) { const canvas = createCanvas(390, 480); Object.assign(canvas, item); item = canvas; item.tagName = 'CANVAS'; }
    nodes.set(id, item); return item;
  }
  Object.assign(c, { ATLAS_TEST: true, performance: { now: () => 0 }, requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1,
    innerWidth: 390, innerHeight: 844, visualViewport: { height: 844, addEventListener() {} },
    addEventListener() {}, dispatchEvent() { return true; }, navigator: { userAgent: 'Android-like regression (Node VM)', onLine: true },
    setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; }, clearInterval() {}, queueMicrotask,
    location: { protocol: 'https:', hash: '#arcade', search: '', pathname: '/cmpon-atlas/',
      href: 'https://test.invalid/cmpon-atlas/#arcade', origin: 'https://test.invalid' },
    FormData: class { constructor(form) { this.form = form; } get(key) { return key === 'name' ? this.form.nameValue : null; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }, clear() { storage.clear(); } },
    AudioContext: profile.noAudio ? undefined : MockAudioContext,
  });
  c.document = { body: node('body'), head: node('head'), documentElement: node('html'), hidden: false,
    activeElement: { tagName: 'BODY' }, getElementById: node,
    createElement(tag) { const item = node(`created-${tag}-${nodes.size}`); item.tagName = tag.toUpperCase(); return item; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(k, f, capture) { const list = handlers.get(k) || handlers.set(k, []).get(k); capture ? list.unshift(f) : list.push(f); }, removeEventListener() {},
  };
  if (profile.deniedStorage) Object.defineProperty(c, 'localStorage', { get() { throw Error('SecurityError: denied'); } });
  if (profile.shaderFailure) {
    const first = node('arcade-canvas'), fresh = createCanvas(390, 480);
    Object.assign(fresh, first);
    first.getContext = kind => kind === 'webgl' ? { VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3,
      createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => false,
      getShaderInfoLog: () => 'Simulated highp shader failure' } : null;
    first.cloneNode = () => fresh; first.replaceWith = () => nodes.set('arcade-canvas', fresh);
  }
  // The compatibility file really executes before the unchanged public core.
  vm.runInContext(source, c, { filename: path.basename(compatPath) });
  if (!profile.withoutLaunch) vm.runInContext(fs.readFileSync(path.join(root, 'assets/citadel-launch-v2.3.1.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(corePath, 'utf8'), c, { filename: path.basename(corePath) });
  run(c, 'initialize()');
  for (const script of scripts) vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), c, { filename: script });
  async function dispatch(type, event) {
    let stopped = false;
    event.preventDefault ??= () => {};
    event.stopImmediatePropagation = () => { stopped = true; };
    for (const fn of handlers.get(type) || []) { await fn(event); if (stopped) break; }
    await tick();
  }
  return { c, nodes, storage, handlers, fetchCalls, intervals, dispatch };
}

async function fullStartup(profile) {
  const h = mobileHarness(profile), { c, nodes, handlers, fetchCalls } = h;
  await tick();
  assert.equal(run(c, 'ARCADE.engine.status'), 'menu');
  assert(run(c, 'isMobileLayout()'));
  assert(nodes.get('arcade-overlay').innerHTML.includes('cup-entry-form'), 'First mobile name form renders');
  assert.equal(run(c, 'ARCADE.renderer.mode'), '3D · совместимый режим');
  if (profile.shaderFailure) assert(run(c, 'ARCADE.renderer.cpu && !ARCADE.renderer.gl'), 'Failed shader uses the existing Canvas 2D renderer');
  const form = nodes.get('cup-entry-form') || c.document.getElementById('cup-entry-form');
  form.nameValue = 'Android test'; form.tagName = 'FORM';
  await h.dispatch('submit', { target: form });
  await tick();
  assert.equal(run(c, 'CUP.error'), '');
  assert.equal(run(c, 'CUP.player.id'), 'mock-player');
  assert.equal(run(c, 'ARCADE.engine.status'), 'briefing');
  assert.equal(run(c, 'CUP.attached'), true);
  const button = c.document.getElementById('mock-launch-button');
  // Since 1.9.0 a newly started campaign owns a four-page prologue before
  // launching. Dispatch the actual touch clicks, not an internal state grant.
  for (let page = 0; page < 4 && c.CITADEL_STORY?.status().active; page++) {
    button.dataset = { action: 'story-next' }; button.closest = () => button;
    for (const callback of handlers.get('click') || []) await callback({ target: button, pointerType: 'touch', preventDefault() {} });
  }
  assert(!c.CITADEL_STORY?.status().active, 'The intro yields to the actual mission launch');
  button.dataset = { action: 'citadel-launch' }; button.closest = () => button;
  for (const callback of handlers.get('click') || []) await callback({ target: button, pointerType: 'touch', preventDefault() {} });
  run(c, 'ARCADE.keys.add("Space"); arcadeFrame(16.666); ARCADE.keys.clear();');
  assert.equal(run(c, 'ARCADE.engine.status'), 'playing');
  assert(run(c, 'ARCADE.engine.shots') > 0, 'First actual input frame fires');
  // Exercise the actual first-shot sound path, including Object.hasOwn dispatch.
  const effect = run(c, 'spacePlayEffect("shot")');
  if (!profile.noAudio) assert(run(c, '(CITADEL_SFX.status().played.shot || 0) > 0 && CITADEL_SFX.status().lastPlayed.location === "space"'), 'First shot reaches Web Audio nodes');
  else assert.equal(effect, false, 'Missing AudioContext does not stop the game');
  run(c, 'cupEnqueue()'); await run(c, 'cupFlush()'); await tick();
  assert.equal(run(c, 'CUP.queue.length'), 0);
  assert.equal(run(c, 'CUP.conflict'), false);
  const enter = fetchCalls.find(call => call.endpoint === 'enter');
  const start = fetchCalls.find(call => call.endpoint === 'start');
  const saves = fetchCalls.filter(call => call.endpoint === 'save');
  assert(enter && start && saves.length, 'Real registration/start/save paths called the isolated service mock');
  assert.match(JSON.parse(enter.options.body).deviceKey, /^cpd_[a-f0-9]{64}$/);
  for (const saved of saves) {
    assert.match(JSON.parse(saved.options.body).requestId, uuid);
    assert.equal(saved.options.headers.Authorization, 'Bearer mock-token');
    assert.equal(saved.options.headers['Content-Type'], 'application/json');
    assert.equal(saved.options.method, 'POST');
    assert.equal(saved.options.credentials, 'omit');
    if (profile.controllerless) assert(!('signal' in saved.options), 'Fetch does not receive a fake AbortSignal');
  }
  if (!profile.deniedStorage) assert.equal(JSON.parse(h.storage.get('cmpon.cup.session.v1')).player.id, 'mock-player');
  return { status: 'playing', renderer: run(c, 'ARCADE.renderer.mode'), saveRequests: saves.length,
    timeoutMode: c.CITADEL_COMPAT.timeoutMode, installed: plain(c.CITADEL_COMPAT.installed), audio: profile.noAudio ? 'unavailable, continued' : 'mock Web Audio nodes emitted' };
}

async function test(name, callback) {
  try { const detail = await callback(); results.push({ name, ok: true, ...(detail && { detail }) }); }
  catch (error) { results.push({ name, ok: false, error: error.message, stack: error.stack.split('\n').slice(1, 5) }); }
}

async function main() {
  await test('compatibility bootstrap parses as ES5', () => {
    const acorn = require(require.resolve('next/dist/compiled/acorn', { paths: [root, path.join(root, '..', 'cmpon-admin')] }));
    acorn.parse(source, { ecmaVersion: 5 });
    assert(!/Math\.random/.test(source), 'UUID fallback uses secure random bytes');
  });
  await test('modern native APIs are preserved', () => {
    const c = contextFor(), before = run(c, '[Object.hasOwn, Array.prototype.at, String.prototype.replaceAll, crypto.randomUUID, AbortSignal.timeout, fetch]');
    vm.runInContext(source, c);
    const after = run(c, '[Object.hasOwn, Array.prototype.at, String.prototype.replaceAll, crypto.randomUUID, AbortSignal.timeout, fetch]');
    after.forEach((value, index) => assert.equal(value, before[index]));
    assert.deepEqual(plain(c.CITADEL_COMPAT.installed), []);
  });
  await test('missing method fallbacks preserve collection and replacement semantics', () => {
    const c = contextFor({ legacy: true }); vm.runInContext(source, c);
    const expressions = [
      'Object.hasOwn(Object.create({x:1}),"x")', 'Object.hasOwn({x:1},"x")',
      '[10,20,30].at(-1)', '[10,20,30].at(1.9)', '[10].at(Infinity)',
      'Array.prototype.at.call({0:"x",1:"y",length:2},-1)',
      '"a.b.a".replaceAll(".","$&$&")', '"aba".replaceAll("a","$$-$&-$`-$\u0027-$1")',
      '"abc".replaceAll("","-")', '"aaa".replaceAll("aa","x")',
      '"ab ab".replaceAll(/(a)(b)/g,"$2$1")',
      '"aba".replaceAll("a",function(m,i,s){return m+i+s.length;})',
      '"text".replaceAll({[Symbol.replace]:function(s,r){return s+":"+r;}},"value")',
    ];
    for (const expression of expressions) assert.equal(run(c, expression), vm.runInNewContext(expression), expression);
    for (const expression of ['Object.hasOwn(null,"x")', 'Array.prototype.at.call(null,0)', '"a".replaceAll(/a/,"b")'])
      assert.throws(() => run(c, expression), { name: 'TypeError' });
    const first = c.crypto.randomUUID(), second = c.crypto.randomUUID();
    assert.match(first, uuid); assert.match(second, uuid); assert.notEqual(first, second);
  });
  await test('controller timeout aborts, validates values, and bounds timer chunks', () => {
    const c = contextFor({ legacy: true }); vm.runInContext(source, c);
    const signal = c.AbortSignal.timeout(12);
    assert.equal(signal.aborted, false); assert.equal([...c.timers.values()][0].delay, 12);
    c.fire([...c.timers.keys()][0]); assert.equal(signal.aborted, true); assert.equal(signal.reason.name, 'TimeoutError');
    assert.equal(c.timers.size, 0);
    for (const bad of [-1, NaN, Infinity, -Infinity]) assert.throws(() => c.AbortSignal.timeout(bad), { name: 'TypeError' });
    c.AbortSignal.timeout(2147483648); assert.equal([...c.timers.values()][0].delay, 2147483647);
    c.fire([...c.timers.keys()][0]); assert.equal([...c.timers.values()][0].delay, 1);
    c.fire([...c.timers.keys()][0]); assert.equal(c.timers.size, 0);
  });
  await test('controllerless timeout bounds waits and preserves unrelated requests', async () => {
    const calls = []; const native = async (input, options) => { calls.push({ input, options }); if (input === 'pending') return new Promise(() => {}); return 'ok'; };
    const c = contextFor({ legacy: true, controllerless: true, fetchImpl: native }); vm.runInContext(source, c);
    const originalOptions = { headers: { Authorization: 'Bearer mock-token' }, body: '{}', method: 'POST', signal: { native: true } };
    assert.equal(await c.fetch('unrelated', originalOptions), 'ok'); assert.equal(calls[0].options, originalOptions);
    const boundOptions = { ...originalOptions, signal: c.AbortSignal.timeout(25) };
    assert.equal(await c.fetch('fast', boundOptions), 'ok'); assert.equal(c.timers.size, 0);
    assert.equal(calls[1].options.headers, originalOptions.headers);
    assert.deepEqual(plain(calls[1].options), { headers: originalOptions.headers, body: '{}', method: 'POST' });
    const pending = c.fetch('pending', { signal: c.AbortSignal.timeout(30) });
    const rejection = assert.rejects(pending, { name: 'TimeoutError' });
    c.fire([...c.timers.keys()][0]); await rejection; assert.equal(c.timers.size, 0);
  });
  for (const [name, profile] of [
    ['modern mobile / no WebGL', {}],
    ['missing APIs / no WebGL', { legacy: true }],
    ['missing APIs and AbortController', { legacy: true, controllerless: true }],
    ['failed GPU shader / compatible renderer', { legacy: true, shaderFailure: true }],
    ['missing APIs / denied storage / no audio or speech', { legacy: true, deniedStorage: true, noAudio: true }],
  ]) await test(`${name}: first render, name entry, launch, first shot, save`, () => fullStartup(profile));

  const report = { method: 'Actual public JavaScript in Node VM, native Canvas 2D, isolated DOM/network/storage/Web Audio mocks. No Android device/browser execution.',
    compatSha256: crypto.createHash('sha256').update(source).digest('hex'), results };
  const reportAt = process.argv.indexOf('--report');
  if (reportAt !== -1) fs.writeFileSync(path.resolve(process.argv[reportAt + 1]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (results.some(item => !item.ok)) process.exitCode = 1;
  return report;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { mobileHarness, contextFor, fullStartup, main };
