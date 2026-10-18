#!/usr/bin/env node
'use strict';
// Flight 1.8.1 regression: actual frozen cores and the shipped 1.8.0 addon
// sequence, including the Academy wrapper after Comic. No browser or network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..'), asset = file => path.join(root, 'assets', file);
const plain = x => JSON.parse(JSON.stringify(x));
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const near = (a, b, label) => assert(distance(a, b) < 1e-6, `${label}: ${a} / ${b}`);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function harness(core, flight = '1.8.1') {
  const h = createHarness(core, null, null);
  const bank = JSON.parse(fs.readFileSync(asset('citadel-academy-cards-v1.4.0.json'), 'utf8'));
  h.context.location = { protocol: 'https:', href: 'https://test.invalid/atlas.html', origin: 'https://test.invalid', hostname: 'test.invalid', hash: '', search: '' };
  h.context.MutationObserver = class { observe() {} disconnect() {} };
  h.context.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  h.context.dispatchEvent = () => true;
  h.context.queueMicrotask = () => {};
  h.context.fetch = async url => {
    assert.equal(url, './assets/citadel-academy-cards-v1.4.0.json', 'Only the local Academy bank is read');
    return { ok: true, json: async () => plain(bank) };
  };
  const originalNode = h.context.document.getElementById;
  h.context.document.getElementById = id => {
    const n = originalNode(id); n.querySelector = () => null; n.insertBefore = child => n.appendChild(child); return n;
  };
  const files = ['citadel-records-v1.1.1.js', 'citadel-mrg-v1.7.0.js', 'citadel-mrg-view-v1.7.0.js',
    'citadel-music-v1.4.2.js', 'citadel-sfx-v1.7.0.js', 'citadel-voice-v1.7.0.js', 'citadel-field-ui-v1.7.0.js',
    ...(flight ? [`citadel-flight-v${flight}.js`] : []),
    'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js', 'citadel-pursuit-v1.8.0.js',
    'citadel-swarm-v1.8.0.js', 'citadel-parallax-v1.8.0.js', 'citadel-comic-v1.8.0.js',
    'atlas-metrics-v0.1.0.js', 'atlas-integration-v1.1.4.js', 'citadel-academy-bridge-v1.7.0.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(asset(file), 'utf8'), h.context, { filename: file });
  await new Promise(resolve => setImmediate(resolve));
  // The public bundle exposes the full Academy bridge contract. The frozen
  // admin engine omits its public final-case API and uses the lab's own bank.
  if (h.cupPack) assert(h.context.citadelAcademyBridge?.ready, 'Public Academy addon is attached and its local bank ready');
  vm.runInContext(`Object.assign(qa,{action:arcadeAction,input:arcadeInput,lessonCase:citadelLessonCase,
    api:globalThis.CITADEL_FLIGHT,basis:flightBasis,hull:citadelHullHit,
    pack:typeof cupPack==='function'?cupPack:null,unpack:typeof cupUnpack==='function'?cupUnpack:null,
    pursuit:globalThis.CITADEL_PURSUIT,swarm:globalThis.CITADEL_SWARM});`, h.context);
  Object.assign(h, h.context.qa); h.arcade.fx = false; h.files = files;
  return h;
}
function make(h, { stage = 0, seed = 417147, assist = false } = {}) {
  const events = [], e = new h.Engine(seed, (kind, data) => events.push({ kind, data: plain(data ?? null) }));
  h.arcade.engine = e; e.assist = assist; e.beginStage(stage);
  return { e, events };
}
function dock(h, options = {}) {
  const { e, events } = make(h, options);
  e.status = 'playing'; e.phase = 'dock'; e.autopilot = options.auto ?? false;
  e.pickups.forEach(p => { p.dead = true; }); e.rescued = Array.from(e.plan[e.stage]);
  e.decisions = [0, 1].map(i => ({ stage: e.stage, caseIndex: e.stage * 2 + i, correct: true }));
  e.enemies = []; e.hostile = []; e.lessonQueue = []; e.lesson = null;
  Object.assign(e.player, { pos: options.pos?.slice() || e.station.pos.map((v, i) => v + [0, 1, -100][i]),
    yaw: options.yaw ?? Math.PI, pitch: options.pitch ?? 0, speed: options.speed ?? 22, invulnerable: 0 });
  return { e, events };
}
function actual(h, e, { fire = false, boost = false, brake = false, turn, pitch, missile = false, pulse = false } = {}) {
  h.arcade.engine = e; h.arcade.keys.clear(); h.arcade.firePointer = null; h.arcade.mouse = null;
  if (fire) h.arcade.keys.add('Space'); if (boost) h.arcade.keys.add('ShiftLeft'); if (brake) h.arcade.keys.add('KeyX');
  if (turn !== undefined || pitch !== undefined) h.arcade.mouse = { x: turn || 0, y: -(pitch || 0) };
  h.arcade.missileQueued = missile; h.arcade.pulseQueued = pulse;
  return h.input();
}
function fly(h, e, seconds = 40, controls = {}, dt = 1 / 60, stop = 'docking') {
  let t = 0;
  for (; t < seconds && e.status !== stop && !['lost', 'crashing'].includes(e.status); t += dt) {
    e.step(dt, actual(h, e, typeof controls === 'function' ? controls(e) : controls));
  }
  return Number(t.toFixed(3));
}
function restore(h, source, emitter = () => {}) {
  const e = h.pack ? h.unpack(plain(h.pack(source)), { seed: source.seed, mode: source.assist ? 'calm' : 'normal' }, emitter)
    : Object.assign(new h.Engine(source.seed, emitter), plain(source));
  h.arcade.engine = e; return e;
}
const campaignProgress = e => plain({ hp: e.player.hp, score: e.score, rescued: e.rescued, decisions: e.decisions });

async function verify(core) {
  const h = await harness(core), old = await harness(core, '1.7.1'), legacy = await harness(core, null);
  const groups = [], check = (name, fn) => { const detail = fn(); groups.push({ name, passed: true, ...(detail ? { detail } : {}) }); };
  let contact;
  check('Fail before / pass after: manual entry reaches the physical wall and late F is rejected in 1.7.1', () => {
    const { e: before } = dock(old);
    for (let frames = 0; frames < 600 && !before.collisionCount; frames++) before.step(1 / 60, actual(old, before));
    assert(before.collisionCount > 0); assert.equal(before.status, 'playing');
    assert(before.player.hp < 100); assert(before.player.pos[2] - before.station.pos[2] > -31);
    contact = before;
    old.action('citadel-interact'); assert.equal(before.status, 'playing', 'Late F really fails at the wall');
    const { e: after, events } = dock(h); const seconds = fly(h, after, 8);
    assert.equal(after.status, 'docking'); assert.equal(after.player.hp, 100); assert.equal(after.collisionCount || 0, 0);
    assert.equal(after.dock.flightVersion, '1.8.1'); assert.equal(events.filter(x => x.kind === 'dock').length, 1);
    return { oldContact: contact.player.pos, oldLocalZ: contact.player.pos[2] - contact.station.pos[2],
      oldHP: contact.player.hp, manualCaptureSeconds: seconds, capturePosition: plain(after.player.pos) };
  });
  check('Already blocked old saves recover through F, G or continued manual approach without further damage', () => {
    const results = [];
    for (const input of ['F', 'G', 'manual']) {
      const e = restore(h, contact), before = campaignProgress(e), collisionCount = e.collisionCount;
      if (input === 'F') h.action('citadel-interact');
      if (input === 'G') h.action('citadel-guidance');
      e.step(1 / 60, actual(h, e));
      assert.equal(e.status, 'docking', input + ' recovers immediately');
      assert.equal(e.collisionCount, collisionCount); assert.deepEqual(campaignProgress(e), before);
      assert(distance(e.player.pos, contact.player.pos) < .1, 'No teleport on recovery');
      fly(h, e, 5, {}, 1 / 60, 'boarding'); assert.equal(e.status, 'boarding');
      assert.deepEqual(plain(e.rescued), before.rescued); assert.deepEqual(plain(e.decisions), before.decisions);
      assert.equal(e.score, before.score); results.push(input);
    }
    return { resumedBy: results, tournamentSerializer: !!h.pack };
  });
  check('Normal and boosted manual approaches enter at 60, 30 and 25 FPS; manual retreat remains possible', () => {
    let runs = 0;
    for (const assist of [false, true]) for (const dt of [1 / 60, 1 / 30, .04]) for (const boost of [false, true]) {
      const { e } = dock(h, { assist }); fly(h, e, 8, { boost }, dt);
      assert.equal(e.status, 'docking'); assert.equal(e.player.hp, 100); assert.equal(e.collisionCount || 0, 0); runs++;
    }
    const { e } = dock(h, { pos: [78, 13, -100], yaw: 0 });
    const start = e.player.pos.slice(); e.step(1 / 60, actual(h, e));
    assert.equal(e.status, 'playing'); assert(e.player.pos[2] < start[2], 'Facing away is allowed to leave');
    return { manualApproaches: runs };
  });
  check('Side, rear, above and premature approach cannot initiate docking; F and auto never bypass a wall', () => {
    for (const pos of [[78, 13, -65], [101, 13, -90], [78, 34, -90], [78, 13, -173]]) {
      const { e } = dock(h, { pos }); h.action('citadel-interact'); assert.equal(e.status, 'playing');
      e.step(1 / 60, actual(h, e)); assert.equal(e.status, 'playing');
    }
    for (const phase of ['orientation', 'battle', 'retrieve']) {
      const { e } = dock(h, { pos: [78, 13, -100] }); e.phase = phase;
      h.action('citadel-interact'); assert.equal(e.status, 'playing'); assert.equal(e.dock, null);
    }
  });
  check('Old core, 1.7.1 and 1.8.1 cinematic saves retain their exact trajectory and finish boarding', () => {
    let saves = 0;
    for (const owner of [legacy, old, h]) for (const progress of [.06, .31, .62, .9]) {
      const { e } = dock(owner, { pos: owner === legacy ? [78, 13, -173] : [78, 13, -100] });
      owner.action('citadel-interact'); assert.equal(e.status, 'docking');
      e.phaseClock = e.dock.duration * progress; e.player.pos = e.dockShip(progress);
      const expected = e.dockShip(progress + 1 / 60 / e.dock.duration), loaded = restore(h, e);
      near(loaded.player.pos, e.player.pos, 'Saved position'); near(loaded.dockShip(progress), e.player.pos, 'Saved path');
      loaded.step(1 / 60, actual(h, loaded)); near(loaded.player.pos, expected, 'Next frame');
      fly(h, loaded, 5, {}, 1 / 60, 'boarding'); assert.equal(loaded.status, 'boarding'); saves++;
    }
    // The newly supported close capture must not move backwards to an older hold point.
    const e = restore(h, contact); h.action('citadel-interact');
    let lastZ = e.dock.start[2];
    for (let i = 1; i <= 200; i++) { const p = e.dockShip(i / 200); assert(p[2] >= lastZ - 1e-8); lastZ = p[2]; }
    return { resumedCinematics: saves, nearWallMonotonicSamples: 200 };
  });
  check('Pause freezes the captured ship and resumes one dock, gate and landing event', () => {
    const { e, events } = dock(h, { pos: [78, 13, -100] }); e.step(1 / 60, actual(h, e));
    h.action('arcade-pause'); const before = plain({ pos: e.player.pos, elapsed: e.elapsed, dock: e.dock, phaseClock: e.phaseClock });
    for (let i = 0; i < 120; i++) e.step(1 / 60, actual(h, e));
    assert.deepEqual(plain({ pos: e.player.pos, elapsed: e.elapsed, dock: e.dock, phaseClock: e.phaseClock }), before);
    h.action('arcade-pause'); fly(h, e, 5, {}, 1 / 60, 'boarding'); assert.equal(e.status, 'boarding');
    for (const kind of ['dock', 'gate', 'terminal']) assert.equal(events.filter(x => x.kind === kind).length, 1, kind);
  });
  return { core: path.basename(core), coreSha256: sha(core), passed: groups.length, groups, loadedAddons: h.files,
    academy: h.context.citadelAcademyBridge?.ready ? 'active local bank' : 'private core uses separate lab bank' };
}
async function main(argv = process.argv.slice(2)) {
  const cores = []; let reportPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--core') cores.push(path.resolve(argv[++i]));
    else if (argv[i] === '--report') reportPath = path.resolve(argv[++i]);
    else throw Error('Unknown argument: ' + argv[i]);
  }
  if (!cores.length) cores.push(asset('atlas-v1.3.5.js'), path.resolve(root, '../cmpon-analytics-admin/game-lab/engine-v1.2.1.js'));
  const results = [];
  for (const core of cores) results.push(await verify(core));
  const report = { version: '1.8.1', patchSha256: sha(asset('citadel-flight-v1.8.1.js')),
    method: 'Actual cores, shipped post-core addon order, Academy local bank, real arcadeInput/actions. No browser or network.', results };
  if (reportPath) { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  process.stdout.write(JSON.stringify({ version: report.version, patchSha256: report.patchSha256,
    results: results.map(r => ({ core: r.core, passed: r.passed, groups: r.groups.map(g => ({ name: g.name, detail: g.detail })) })) }, null, 2) + '\n');
  return report;
}
module.exports = { harness, make, dock, actual, fly, restore, verify, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
