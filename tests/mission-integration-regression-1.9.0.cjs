#!/usr/bin/env node
'use strict';

// Narrow release-boundary checks. The exact deferred script list comes from
// index.html, including the startup notice and the unmodified public core's
// automatic initialize(). No browser, server, network, MP3 codec, or installs.
// The existing Android compatibility and prepared-audio mocks are reused; the
// two mission controllers provide only normal arcadeInput/actions.
// node tests/mission-integration-regression-1.9.0.cjs [--report path]
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm'), crypto = require('node:crypto');
const { contextFor } = require('./android-startup-regression.cjs');
const { createWebAudioLab, deliver } = require('./prepared-voice-regression.cjs');
const pursuit = require('./pursuit-regression.cjs');
const swarm = require('./swarm-regression.cjs');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const createCanvas = require(require.resolve('@napi-rs/canvas', {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, root].filter(Boolean),
})).createCanvas;
const immediate = () => new Promise(resolve => setImmediate(resolve));

function entrySnapshot() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(match => match[1]);
  return { html, scripts, sources: new Map(scripts.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')])) };
}

// The same deliberately small DOM surface as android-startup-regression.cjs.
// It is not a CSS layout engine: mobile/desktop geometry below is native Canvas
// plus the production modules' public protected-bounds APIs.
function entryHarness(entry, profile = {}) {
  const nodes = new Map(), storage = new Map(), handlers = new Map(), windowHandlers = new Map(), fetchCalls = [];
  const lab = profile.audio ? createWebAudioLab() : null;
  const c = contextFor(profile);
  const run = code => vm.runInContext(code, c);
  const on = (map, type, fn) => { const list = map.get(type) || []; list.push(fn); map.set(type, list); };
  const off = (map, type, fn) => map.set(type, (map.get(type) || []).filter(item => item !== fn));
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    let item = { id, tagName: 'DIV', innerHTML: '', textContent: id === 'release-data' ? '{"version":"1.9.0"}' : '',
      value: '', hidden: false, open: false, style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, attrs: {}, handlers: {},
      classList: { add(...keys) { keys.forEach(k => classes.add(k)); }, remove(...keys) { keys.forEach(k => classes.delete(k)); },
        contains(k) { return classes.has(k); }, toggle(k, on) { if (on === undefined) on = !classes.has(k); on ? classes.add(k) : classes.delete(k); return on; } },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 480 }; },
      addEventListener(k, fn) { (this.handlers[k] ??= []).push(fn); }, removeEventListener(k, fn) { this.handlers[k] = (this.handlers[k] || []).filter(item => item !== fn); },
      focus() { c.document.activeElement = this; }, setPointerCapture() {}, showModal() { this.open = true; }, close() { this.open = false; },
      matches() { return false; }, closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {},
      insertAdjacentHTML(_, html) { this.innerHTML += html; },
      appendChild(child) { (this.children ??= []).push(child); return child; },
      insertBefore(child) { return this.appendChild(child); }, append(...children) { children.forEach(child => this.appendChild(child)); },
    };
    if (/canvas/.test(id)) { const canvas = createCanvas(390, 480); Object.assign(canvas, item); item = canvas; item.tagName = 'CANVAS'; }
    nodes.set(id, item); return item;
  }
  Object.assign(c, { ATLAS_TEST: false, performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }), devicePixelRatio: 1, innerWidth: 390, innerHeight: 844,
    visualViewport: { height: 844, addEventListener() {} }, setInterval: () => 0, clearInterval() {}, queueMicrotask,
    addEventListener(type, fn) { on(windowHandlers, type, fn); }, removeEventListener(type, fn) { off(windowHandlers, type, fn); },
    dispatchEvent(event) { for (const fn of windowHandlers.get(event.type) || []) fn(event); return true; },
    navigator: { userAgent: 'Android-compatible Node VM integration test', onLine: true },
    location: { protocol: 'https:', hash: '#arcade', search: '', pathname: '/cmpon-atlas/', hostname: 'test.invalid',
      href: 'https://test.invalid/cmpon-atlas/#arcade', origin: 'https://test.invalid' },
    FormData: class { constructor(form) { this.form = form; } get(key) { return key === 'name' ? this.form.nameValue : null; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }, clear() { storage.clear(); } },
    AudioContext: undefined, webkitAudioContext: undefined,
  });
  c.document = { body: node('body'), head: node('head'), documentElement: node('html'), hidden: false,
    readyState: 'interactive', baseURI: 'https://test.invalid/cmpon-atlas/', activeElement: { tagName: 'BODY' },
    getElementById: node, createElement(tag) { const item = node(`created-${tag}-${nodes.size}`); item.tagName = tag.toUpperCase(); return item; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, fn) { on(handlers, type, fn); }, removeEventListener(type, fn) { off(handlers, type, fn); },
  };
  if (profile.deniedStorage) Object.defineProperty(c, 'localStorage', { get() { throw Error('SecurityError: storage denied'); } });
  if (lab) lab.install(c, { speech: 'absent', lifecycle: false });
  c.fetch = async (url, options = {}) => {
    const endpoint = String(url).split('/').pop().split('?')[0];
    if (/\.mp3$/.test(endpoint)) {
      assert(lab, 'A no-audio boot must not fetch a recording');
      return lab.fetch(url, options);
    }
    fetchCalls.push({ endpoint, options });
    const player = { id: 'mock-player', name: 'Mission integration' };
    const attempt = { id: 'mock-run', seed: 417147, mode: 'normal', status: 'active', gameVersion: '1.9.0', progress: 0, clock: 0, revision: 0 };
    const data = endpoint === 'config' ? { cups: [] } : endpoint === 'enter' ? { token: 'mock-token', player } :
      endpoint === 'me' ? { player, runs: [] } : ['start', 'save'].includes(endpoint) ? { run: attempt } :
      endpoint === 'citadel-academy-cards-v1.4.0.json' ? JSON.parse(fs.readFileSync(path.join(root, 'assets', endpoint), 'utf8')) : { rows: [] };
    return { ok: true, status: 200, json: async () => data };
  };
  // Fix only the cosmetic/radio random source. The actual mission seeded RNG is
  // unmodified; a first automatic radio deadline of 35 s is reproducible.
  run('Math.random = () => 0;');
  for (const file of entry.scripts) vm.runInContext(entry.sources.get(file), c, { filename: file });
  c.document.readyState = 'complete';
  for (const fn of [...(handlers.get('DOMContentLoaded') || [])]) fn({ type: 'DOMContentLoaded' });
  const h = { c, context: c, nodes, storage, handlers, fetchCalls, lab, run };
  Object.assign(h, run(`({Engine:RequirementArcade,arcade:ARCADE,state:STATE,mobile:MOBILE,cup:CUP,
    action:arcadeAction,input:arcadeInput,lessonCase:citadelLessonCase,overlay:arcadeOverlayHTML,
    update:updateArcadeHUD,updateOverlay:updateArcadeOverlay,event:arcadeEvent,pack:cupPack,unpack:cupUnpack,
    scene:spaceScene,camera:spaceCamera,draw:spaceDrawCPU,flightHUD:drawFlightHUD,mobileHUD:drawMobileGameHUD,
    campaignHUD:drawCampaignFlightHUD,clarityHUD:drawClarityHUD,project:spaceProject})`));
  h.s = { input: h.input };
  return h;
}

function layout(h, width, height, dpr = 1) {
  h.c.innerWidth = width; h.c.innerHeight = height; h.c.devicePixelRatio = dpr;
  h.c.matchMedia = () => ({ matches: width < 900 });
  for (const id of ['arcade-canvas', 'arcade-hud-canvas']) {
    const canvas = h.c.document.getElementById(id); canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  }
  h.arcade.canvas = h.c.document.getElementById('arcade-canvas');
}

const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function comicGeometry(h, e) {
  const sizes = [[1280, 720, 1], [390, 460, 2]], results = [];
  for (const [width, height, dpr] of sizes) {
    layout(h, width, height, dpr);
    const before = clone(h.pack(e)), comic = h.c.CITADEL_COMIC;
    comic.clear(e);
    // The actual emit wrapper must accept module events even after all outer
    // scene, interface, story and academy wrappers have been attached.
    e.emit('comic', { text: 'ЕЩЁ ОДНО УТОЧНЕНИЕ!', kind: 'action', anchor: e.player.pos.slice() });
    assert(comic.status(e).active, 'The real engine emitter reaches the comic compositor');
    const cam = h.camera(e, e.elapsed), canvas = createCanvas(width * dpr, height * dpr), ctx = canvas.getContext('2d');
    const overlay = createCanvas(width * dpr, height * dpr), hud = overlay.getContext('2d');
    h.update();
    h.draw(ctx, h.scene(e, e.elapsed), cam, width * dpr, height * dpr);
    // Public flight and HUD canvases are separate. Pursuit clears only the HUD
    // surface; drawing both into one context would erase the real scene here.
    (width < 900 ? h.mobileHUD : h.flightHUD)(hud, e, cam, width * dpr, height * dpr);
    h.campaignHUD(hud, e, cam, width * dpr, height * dpr); h.clarityHUD(hud, e, cam, width * dpr, height * dpr);
    ctx.drawImage(overlay, 0, 0);
    const missionBoxes = e.phase === 'pursuit' ? h.c.CITADEL_PURSUIT.hudBounds(e, cam, width, height) : h.c.CITADEL_SWARM.hudBounds(e, width, height);
    assert(missionBoxes.length >= 2);
    if (e.phase === 'swarm') for (const kind of ['progress', 'controls', 'player', 'formation']) assert(missionBoxes.some(box => box.kind === kind), kind);
    const status = comic.status(e), box = status.bounds;
    if (box) {
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
      for (const reserved of box.protected) assert(!overlaps(box, reserved), 'Comic overlaps a protected HUD rectangle');
      for (const reserved of missionBoxes) {
        assert(!overlaps(box, reserved), `Comic overlaps ${e.phase}/${reserved.kind}`);
        assert(box.protected.some(p => p.x <= reserved.x && p.y <= reserved.y &&
          p.x + p.width >= reserved.x + reserved.width && p.y + p.height >= reserved.y + reserved.height),
        `Comic does not consume the public ${e.phase}/${reserved.kind} protection API`);
      }
    }
    // Suppressing a panel when no free rectangle exists is intended behavior.
    assert.deepEqual(clone(h.pack(e)), before, 'Comics, HUD and bounds queries must not change any campaign save field');
    assert(ctx.getImageData(2, 2, 1, 1).data[3] > 0, 'The native mission canvas actually rendered');
    results.push({ width, height, dpr, protectedKinds: [...new Set(missionBoxes.map(b => b.kind))],
      protectedRectangles: missionBoxes.length, comic: box ? { x: +box.x.toFixed(2), y: +box.y.toFixed(2), width: box.width, height: box.height } : 'suppressed: occupied gameplay space', stateUnchanged: true });
  }
  layout(h, 1280, 720); return results;
}

async function missionPlay(entry, stage) {
  const h = entryHarness(entry, { audio: true }); await immediate();
  assert(h.c.citadelAcademyBridge.ready, 'The actual academy bridge loads its local published bank');
  // Select the tested campaign checkpoint in an isolated fixture, then use
  // only real launch/answer/next actions and keyboard/mouse/joystick input.
  h.cup.panel = null; h.arcade.sound = false; h.arcade.fx = false; h.state.view = 'arcade';
  h.run('SPACE_AUDIO.music = false;'); layout(h, 1280, 720);
  const emitted = [], e = new h.Engine(417147, (kind, data) => { emitted.push({ kind, data: clone(data ?? null) }); h.event(kind, data); });
  h.arcade.engine = e; e.start(false); e.beginStage(stage);
  assert.equal(e.phase, stage === 1 ? 'pursuit' : 'swarm');
  h.action('citadel-launch'); assert.equal(e.status, 'playing');
  const controlSwarm = swarm.controller(h.c.CITADEL_SWARM), cards = [], radio = [], seenSources = new Set();
  let geometry = null, frames = 0, docking = null, peakEnemies = 0, peakHostile = 0;
  const dt = 1 / 60;
  async function audioFrame(ms = dt * 1000) {
    await deliver({ lab: h.lab }, { duration: .4 });
    await h.lab.advance(ms);
    for (const event of h.lab.events) if (event.type === 'source-start' && event.clipId && !seenSources.has(event.id)) {
      seenSources.add(event.id);
      const clip = h.c.CITADEL_VOICE_PACK.clips.find(item => item.id === event.clipId);
      if (clip?.kind === 'commander') radio.push({ clipId: clip.id, status: e.status, phase: e.phase, seconds: +e.elapsed.toFixed(3), source: h.c.CITADEL_VOICE.status().source });
    }
  }
  for (; frames < 150 / dt && e.status !== 'boarding'; frames++) {
    assert(!['lost', 'crashing'].includes(e.status), `Mission ${stage * 3 + 1} failed at ${e.elapsed}s`);
    if (e.status === 'lesson') {
      const q = h.lessonCase(e, e.lesson.caseIndex), required = e.plan[stage].filter(id => e.rescued.includes(id));
      assert.equal(required.length, 3, 'Both decisions happen after the actual mission requirements are acquired');
      assert.equal(e.enemies.length + e.hostile.length, 0, 'Cards interrupt only a safe completed mission');
      assert(q.academyId && q.academyLesson, 'The final academy bridge supplies the real card');
      h.updateOverlay(); assert.match(h.overlay(), /review-card/);
      assert(h.nodes.get('arcade-overlay').classList.contains('citadel-readable'), 'The final interface wrapper marks the real card');
      const time = e.elapsed, hp = e.player.hp;
      for (let i = 0; i < 12; i++) { e.step(dt, h.input()); await audioFrame(); }
      assert.equal(e.elapsed, time); assert.equal(e.player.hp, hp);
      h.action('citadel-lesson-answer', q.correct); assert(e.lesson.solved);
      cards.push({ caseIndex: e.lesson.caseIndex, academyId: q.academyId, correct: e.lesson.feedback.correct, hp: e.player.hp });
      h.action('citadel-lesson-next');
      continue;
    }
    const command = stage === 1 ? pursuit.controller(h, e) : controlSwarm(e);
    const input = stage === 1 ? pursuit.controls(h, command) : swarm.realInput(h, e, command);
    e.step(dt, input); await audioFrame();
    peakEnemies = Math.max(peakEnemies, e.enemies.length); peakHostile = Math.max(peakHostile, e.hostile.length);
    if (e.status === 'docking') docking = e.dock?.flightVersion;
    if (!geometry && e.status === 'playing' && e.phase === (stage === 1 ? 'pursuit' : 'swarm') && e.elapsed >= 20) geometry = comicGeometry(h, e);
  }
  assert.equal(e.status, 'boarding', `Mission ${stage * 3 + 1} did not reach the Citadel interior`);
  assert.equal(docking, '1.8.1', 'The completed mission uses the public manual-entry hotfix route');
  assert.equal(e.plan[stage].filter(id => e.rescued.includes(id)).length, 3);
  assert.deepEqual(cards.map(card => card.caseIndex), stage === 1 ? [2, 3] : [4, 5]);
  assert.equal(e.decisions.filter(decision => decision.stage === stage).length, 2);
  assert.equal(new Set(e.rescued).size, e.rescued.length); assert.equal(e.lessonQueue.length, 0);
  assert.equal(h.lab.contexts.length, 1, 'Automatic prerecorded radio creates/reuses only ARCADE.audio');
  assert.equal(h.arcade.audio, h.lab.contexts[0]); assert.equal(h.lab.speech.spoken.length, 0);
  const summary = { level: stage * 3 + 1, status: e.status, phase: e.phase, seconds: +e.elapsed.toFixed(3), frames,
    requirements: e.plan[stage].filter(id => e.rescued.includes(id)), cards, score: e.score, hp: +e.player.hp.toFixed(3),
    shots: e.shots, kills: e.stageKills, docking, peakEnemies, peakHostile, radio, audioContexts: h.lab.contexts.length,
    preparedRequests: h.lab.requests.length, preparedDecodes: h.lab.decodes.length, geometry };
  h.c.CITADEL_VOICE.dispose();
  return summary;
}

async function boot(entry, profile, finish = 'pages') {
  const h = entryHarness(entry, profile); await immediate();
  const { c, run, nodes, handlers } = h;
  assert.equal(c.CITADEL_STARTUP.version, '1.7.1'); assert.equal(nodes.get('citadel-startup').hidden, true);
  assert.equal(h.arcade.engine.status, 'menu'); assert.match(nodes.get('arcade-overlay').innerHTML, /cup-entry-form/);
  assert.equal(h.arcade.renderer.mode, '3D · совместимый режим');
  const form = c.document.getElementById('cup-entry-form'); form.nameValue = 'Mission integration'; form.tagName = 'FORM';
  for (const fn of handlers.get('submit') || []) await fn({ target: form, preventDefault() {} });
  await immediate();
  assert.equal(h.cup.error, ''); assert.equal(h.cup.player.id, 'mock-player'); assert(h.cup.attached);
  assert.equal(h.arcade.engine.status, 'briefing'); assert(c.CITADEL_STORY.status(h.arcade.engine).active);
  const pages = [];
  async function click(action) {
    const button = c.document.getElementById('integration-action'); button.dataset = { action };
    button.closest = selector => selector === '[data-action]' || selector === `[data-action="${action}"]` ? button : null;
    for (const fn of handlers.get('click') || []) await fn({ target: button, pointerType: 'touch', preventDefault() {} });
  }
  if (finish === 'pages') {
    for (let page = 0; page < 4; page++) {
      const story = c.CITADEL_STORY.status(h.arcade.engine); assert.equal(story.page, page);
      assert.match(nodes.get('arcade-overlay').innerHTML, /citadel-prologue/); pages.push(page + 1);
      await click('story-next');
    }
  } else { await click('story-skip'); assert.equal(h.arcade.engine.status, 'briefing'); await click('citadel-launch'); }
  assert.equal(c.CITADEL_STORY.status(h.arcade.engine).active, false);
  run('ARCADE.keys.add("Space"); arcadeFrame(16.666); ARCADE.keys.clear();');
  assert.equal(h.arcade.engine.status, 'playing'); assert(h.arcade.engine.shots > 0, 'The first real input frame after prologue fires');
  assert.equal(run('spacePlayEffect("shot")'), false, 'Absent audio keeps gameplay available');
  assert.equal(c.CITADEL_VOICE.status().supported, false); assert.equal(c.citadelAcademyBridge.ready, true);
  run('cupEnqueue()'); await run('cupFlush()'); await immediate();
  assert.equal(h.cup.queue.length, 0); assert.equal(h.cup.conflict, false);
  const saves = h.fetchCalls.filter(request => request.endpoint === 'save'); assert(saves.length);
  for (const save of saves) assert.equal(save.options.headers.Authorization, 'Bearer mock-token');
  return { profile, status: h.arcade.engine.status, renderer: h.arcade.renderer.mode, prologue: finish,
    pages, firstShots: h.arcade.engine.shots, saveRequests: saves.length, timeoutMode: c.CITADEL_COMPAT.timeoutMode,
    audio: 'unavailable; gameplay continued', speech: 'unavailable; gameplay continued', startupHidden: true };
}

async function main(argv = process.argv.slice(2)) {
  let reportPath = path.join(__dirname, 'mission-integration-verification-1.9.0.json');
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--report') reportPath = path.resolve(argv[++i]);
  else throw Error('Usage: mission-integration-regression-1.9.0.cjs [--report path]');
  const entry = entrySnapshot(), results = [], missions = [];
  async function check(name, fn) {
    try { const detail = await fn(); results.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); }
    catch (error) { results.push({ name, ok: false, error: error.message, stack: error.stack?.split('\n').slice(1, 5) }); }
  }
  await check('Actual index orders voice after every gameplay wrapper and before comic/interface/story/academy', () => {
    const voice = entry.scripts.findIndex(name => /citadel-voice-v/.test(name));
    assert(voice > 0); assert(entry.scripts[0].includes('citadel-startup-')); assert(entry.scripts[1].includes('citadel-compat-'));
    for (const token of ['citadel-flight-v1.8.1', 'citadel-pursuit-v1.9.0', 'citadel-swarm-v1.9.0', 'citadel-parallax-', 'citadel-decks-v1.9.0']) {
      const at = entry.scripts.findIndex(name => name.includes(token)); assert(at > 1 && at < voice, token);
    }
    for (const token of ['citadel-comic-v1.9.0', 'citadel-interface-v1.9.0', 'citadel-story-v1.9.0', 'citadel-academy-bridge-'])
      assert(entry.scripts.findIndex(name => name.includes(token)) > voice, token);
    assert(entry.scripts.some(name => name.includes('citadel-voice-pack-v1.8.2')));
    return { scripts: entry.scripts.length, voice: entry.scripts[voice], savedDockingRuntime: '1.8.1' };
  });
  for (const stage of [1, 2]) await check(`Level ${stage * 3 + 1}: ordinary input → real academy cards → docking in the full public chain`, async () => {
    const detail = await missionPlay(entry, stage); missions.push(detail); return detail;
  });
  for (const level of [4, 7]) await check(`Level ${level}: automatic commander tick starts a prepared clip inside the new mission phase`, () => {
    const mission = missions.find(item => item.level === level); assert(mission, 'The full mission playthrough must succeed first');
    const phase = level === 4 ? 'pursuit' : 'swarm';
    const events = mission.radio.filter(event => event.phase === phase && event.status === 'playing');
    assert(events.length > 0, `No automatic commander recording started during ${phase}`);
    assert(events.every(event => event.source === 'recorded' && event.seconds >= 35), 'Radio is real prepared playback after one normal tick per frame');
    return { automaticStarts: events, audioContexts: mission.audioContexts, previewCalls: 0, speechSynthesisCalls: 0 };
  });
  for (const level of [4, 7]) await check(`Level ${level}: desktop and mobile comic protection consumes the mission API without saved-state changes`, () => {
    const detail = missions.find(item => item.level === level)?.geometry; assert(detail?.length === 2); return detail;
  });
  await check('Actual public boot: complete all four prologue pages, launch, first shot and isolated save with no Audio/Speech',
    () => boot(entry, { noAudio: true }, 'pages'));
  await check('Actual public boot: legacy Android APIs, denied storage and no Audio/Speech; skip prologue, launch and save',
    () => boot(entry, { legacy: true, deniedStorage: true, noAudio: true }, 'skip'));
  const report = { version: '1.9.0', method: 'Exact current index.html deferred scripts, native public-core automatic initialize, existing Android feature mocks, native Canvas, ordinary mission controllers, real published academy bank and prepared voice manifest. Network and Web Audio decoding are isolated mocks; no browser/device/audio-quality claim.',
    limits: ['DOM mocks do not measure CSS card layout or browser text rendering.', 'Prepared clip buffers simulate asynchronous decode/playback; the actual MP3 corpus is not decoded by this narrow test.', 'Deck gameplay is owned by a concurrent task and its SHA is intentionally not pinned here.'],
    entrySha256: sha(entry.html), scripts: entry.scripts.map(file => ({ file,
      ...(/citadel-decks-/.test(file) ? { hashPolicy: 'not pinned: concurrent owner' } : { sha256: sha(entry.sources.get(file)) }) })),
    passed: results.filter(item => item.ok).length, total: results.length, results };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, total: report.total, report: reportPath,
    failed: results.filter(item => !item.ok) }, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
  return report;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, entrySnapshot, entryHarness, missionPlay, comicGeometry, boot };
