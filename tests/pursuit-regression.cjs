#!/usr/bin/env node
'use strict';
// Actual frozen game cores in a VM and the actual Canvas projection renderer.
// No browser, network, production account or real persistent storage is used.
// node tests/pursuit-regression.cjs --core assets/atlas-v1.3.5.js --core ../cmpon-analytics-admin/game-lab/engine-v1.2.1.js --out /tmp/pursuit-qa
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');
const asset = name => path.join(root, 'assets', name);
const patch = asset('citadel-pursuit-v1.8.0.js');
const options = { cores: [], out: null, render: false };
for (let i = 2; require.main === module && i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--core') options.cores.push(path.resolve(process.argv[++i]));
  else if (arg === '--out') options.out = path.resolve(process.argv[++i]);
  else if (arg === '--render') options.render = true;
  else throw Error('Unknown option: ' + arg);
}
if (!options.cores.length) options.cores.push(asset('atlas-v1.3.5.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
function nativeCanvas() {
  return require(require.resolve('@napi-rs/canvas', { paths: [process.cwd(), __dirname,
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) })).createCanvas;
}
function load(core, { legacy = false, canvas = false } = {}) {
  const h = createHarness(core, asset('citadel-mrg-v1.7.0.js'), asset('citadel-mrg-view-v1.7.0.js'), canvas ? nativeCanvas() : null);
  h.context.location = { href: 'https://test.invalid/atlas.html', hostname: 'test.invalid', origin: 'https://test.invalid', search: '', hash: '' };
  for (const name of ['citadel-field-ui-v1.7.0.js', 'citadel-flight-v1.7.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js']) {
    vm.runInContext(fs.readFileSync(asset(name), 'utf8'), h.context, { filename: name });
  }
  if (!legacy) vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context, { filename: path.basename(patch) });
  vm.runInContext(`Object.assign(qa, { api: globalThis.CITADEL_PURSUIT, scene: spaceScene, camera: spaceCamera,
    input: arcadeInput, overlay: arcadeOverlayHTML, flightHUD: drawFlightHUD, campaignHUD: drawCampaignFlightHUD,
    clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD, updateHUD: updateArcadeHUD,
    lessonCase: citadelLessonCase, pack: typeof cupPack === 'function' ? cupPack : null,
    unpack: typeof cupUnpack === 'function' ? cupUnpack : null, retry: citadelRetry, action: arcadeAction,
    cup: typeof CUP !== 'undefined' ? CUP : null, levels: typeof CUP_LEVELS !== 'undefined' ? CUP_LEVELS : null,
    mobile: MOBILE, basis: flightBasis });`, h.context);
  Object.assign(h, h.context.qa);
  h.arcade.fx = false;
  return h;
}
function make(h, assist = false, seed = 417147, stage = 1) {
  const events = [];
  const e = new h.Engine(seed, (kind, data) => events.push({ kind, data: clone(data ?? null), time: e.elapsed }));
  e.assist = assist; e.beginStage(stage); h.arcade.engine = e;
  return { e, events };
}
function step(h, e, input = {}) {
  h.arcade.engine = e;
  e.step(1 / 60, input);
}
function actualInput(h, e, kind = 'pilot') {
  h.arcade.engine = e;
  h.arcade.keys.clear(); h.arcade.firePointer = null; h.arcade.mouse = null;
  const target = e.navTarget();
  if (kind === 'fire' || kind === 'pilot' && e.phase === 'pursuit' && !target?.open) h.arcade.keys.add('Space');
  return h.input();
}
function manualInput(h, e) {
  const input = actualInput(h, e), target = e.navTarget();
  if (!target) return input;
  const d = h.vectors.sub(target.pos, e.player.pos), range = h.vectors.len(d);
  const yaw = Math.atan2(d[0], -d[2]), pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
  const dy = Math.atan2(Math.sin(yaw - e.player.yaw), Math.cos(yaw - e.player.yaw));
  const clamp = n => Math.max(-1, Math.min(1, n));
  h.arcade.mouse = { x: clamp(dy * 3.4), y: -clamp((pitch - e.player.pitch) * 3.4) };
  if (Math.abs(dy) < .3 && range > 90) h.arcade.keys.add('ShiftLeft');
  if (range < (target.open ? 30 : 65) || Math.abs(dy) > .6) h.arcade.keys.add('KeyX');
  return h.input();
}
function resolveLesson(h, e) {
  assert.equal(e.enemies.length, 0, 'review is safe from pursuers');
  assert.equal(e.hostile.length, 0, 'review is safe from hostile projectiles');
  assert.equal(e.rescued.filter(id => e.plan[1].includes(id)).length, 3, 'lessons occur after all three actual requirements');
  e.answerLesson(h.lessonCase(e, e.lesson.caseIndex).correct);
  e.continueLesson();
}
// Standalone integration-test operator. h provides the real arcadeAction as
// action and the real citadelLessonCase as lessonCase. No health, target, cargo,
// cooldown, mission timer or enemy state is written by this controller.
function controller(h, e) {
  if (e.status === 'briefing') { h.action('citadel-launch'); return {}; }
  if (e.status === 'lesson') {
    if (!e.lesson.solved) h.action('citadel-lesson-answer', h.lessonCase(e, e.lesson.caseIndex).correct);
    h.action('citadel-lesson-next'); return {};
  }
  if (e.status !== 'playing') return {};
  if (e.phase === 'pursuit') {
    if (!e.autopilot) h.action('citadel-guidance');
    return { fire: !e.navTarget()?.open };
  }
  return {};
}
function play(h, e, { manual = false, limit = 150, stop = 'boarding' } = {}) {
  let peakEnemies = e.enemies.length, peakHostile = 0, peakBullets = 0, firstLesson = null, dockVersion = null;
  if (e.status === 'briefing') e.launch();
  if (manual) h.action('citadel-guidance');
  for (let frames = 0; frames < limit * 60; frames++) {
    if (e.status === stop || stop === 'firstLesson' && e.status === 'lesson') break;
    if (e.status === 'lesson') { firstLesson ??= e.elapsed; resolveLesson(h, e); continue; }
    if (['lost', 'crashing'].includes(e.status)) break;
    const controls = manual && e.phase === 'pursuit' ? manualInput(h, e) : actualInput(h, e);
    step(h, e, controls);
    if (e.status === 'docking') dockVersion = e.dock?.flightVersion ?? null;
    peakEnemies = Math.max(peakEnemies, e.enemies.length); peakHostile = Math.max(peakHostile, e.hostile.length); peakBullets = Math.max(peakBullets, e.bullets.length);
  }
  return { status: e.status, phase: e.phase, time: Number(e.elapsed.toFixed(3)), chase: Number((e.pursuit.completedAt ?? e.pursuit.clock).toFixed(3)),
    hp: Number(e.player.hp.toFixed(2)), requirements: e.rescued.filter(id => e.plan[1].includes(id)).length,
    decisions: e.decisions.filter(d => d.stage === 1).length, shots: e.shots, hits: e.hits,
    escaped: e.pursuit.carriers.filter(c => c.escaped).length, peakEnemies, peakHostile, peakBullets, firstLesson, dockVersion };
}
function frameState(e) {
  const state = clone({ player: e.player, pursuit: e.pursuit, enemies: e.enemies, pickups: e.pickups,
    rescued: e.rescued, decisions: e.decisions, lessonQueue: e.lessonQueue, lesson: e.lesson,
    status: e.status, phase: e.phase, score: e.score, elapsed: e.elapsed, rng: e.random.getState?.() ?? null });
  return state;
}
function suite(core) {
  const h = load(core), groups = [], plays = [];
  const check = (name, fn) => { fn(); groups.push(name); };
  check('stage 1 becomes pursuit with three real requirements and distinct moving profiles', () => {
    const { e } = make(h);
    assert.equal(e.phase, 'pursuit'); assert.equal(e.status, 'briefing'); assert.equal(e.wave, 0);
    assert.deepEqual(Array.from(e.pursuit.carriers, c => c.reqId), Array.from(e.plan[1]));
    assert.deepEqual(Array.from(e.pursuit.carriers, c => c.profile), ['fast', 'zigzag', 'escort']);
    assert.equal(e.enemies.filter(c => c.pursuitEscort).length, 2);
    if (h.levels) assert.equal(h.levels[3], 'ФЗ уходит со связи');
    assert.match(h.overlay(), /Отпустите огонь/);
    const positions = e.pursuit.carriers.map(c => c.pos.slice()); e.launch();
    for (let i = 0; i < 120; i++) step(h, e, {});
    assert(e.pursuit.carriers.every((c, i) => h.vectors.len(h.vectors.sub(c.pos, positions[i])) > 10));
    assert.equal(e.wave, 0); assert.equal(e.stationHp, 100);
  });
  check('autopilot cannot obtain requirements without a player attack; all escape beacons remain recoverable', () => {
    const { e } = make(h); e.launch();
    for (let i = 0; i < 60 * 26; i++) step(h, e, actualInput(h, e, 'none'));
    assert.equal(e.status, 'playing'); assert.equal(e.rescued.length, 0); assert.equal(e.score, 0);
    assert.equal(e.pursuit.carriers.filter(c => c.escaped).length, 3);
    assert(e.pursuit.carriers.every(c => !c.open && c.hp > 0 && !c.dead));
    const result = play(h, e); assert.equal(result.status, 'boarding'); assert.equal(result.requirements, 3);
    assert.equal(result.escaped, 3); plays.push({ mode: 'normal', seed: 417147, strategy: 'recover all escaped beacons', ...result });
  });
  check('locked cargo cannot be picked up by proximity or an early collect call', () => {
    const { e } = make(h); e.launch(); const c = e.pursuit.carriers[0], item = e.modules()[0];
    e.collect(item); assert.equal(item.dead, false); assert.equal(e.rescued.length, 0);
    e.autopilot = false; e.player.pos = c.pos.slice(); e.player.speed = 0;
    step(h, e, { brake: true }); assert.equal(e.rescued.length, 0);
  });
  check('holding the fire trigger jams an open transfer; releasing it enables the actual transfer', () => {
    const { e } = make(h); e.launch();
    for (let i = 0; i < 60 * 14; i++) step(h, e, actualInput(h, e, 'fire'));
    assert.equal(e.rescued.length, 0); assert.equal(e.pursuit.linkJammed, true);
    assert.equal(e.pursuit.carriers[0].transfer, 0);
    for (let i = 0; i < 60 * 8 && e.rescued.length === 0; i++) step(h, e, actualInput(h, e));
    assert.equal(e.rescued.length, 1);
  });
  check('link requires a live open channel, real range, forward facing and line of sight', () => {
    const { e } = make(h); e.launch(); const c = e.pursuit.carriers[0];
    e.hit(c, c.hp); e.player.pos = h.vectors.add(c.pos, [0, 0, 24]); e.player.yaw = 0; e.player.pitch = 0;
    assert(h.api.linkEligible(e, c));
    e.player.yaw = Math.PI; assert(!h.api.linkEligible(e, c)); e.player.yaw = 0;
    e.player.pos = h.vectors.add(c.pos, [0, 0, 65]); assert(!h.api.linkEligible(e, c));
    e.player.pos = h.vectors.add(c.pos, [0, 0, 24]);
    e.asteroids.push({ pos: h.vectors.add(c.pos, [0, 0, 12]), r: 4 }); assert(!h.api.linkEligible(e, c));
  });
  if (h.pack) {
  check('new save resumes the same moving targets, transfer progress, health, rewards and RNG', () => {
    const { e } = make(h); e.launch();
    for (let i = 0; i < 60 * 16 && e.pursuit.carriers[0].transfer < 1.2; i++) step(h, e, actualInput(h, e));
    assert(e.pursuit.carriers[0].transfer >= 1.2);
    const snapshot = h.pack(e), restored = h.unpack(snapshot, { seed: e.seed, mode: 'normal' }, () => {});
    assert.deepEqual(frameState(restored), frameState(e));
    for (const c of restored.pursuit.carriers.filter(c => !c.open && !c.delivered)) assert(restored.enemies.includes(c), 'canonical carrier object restored');
    for (let i = 0; i < 480; i++) {
      step(h, e, actualInput(h, e)); step(h, restored, actualInput(h, restored));
    }
    assert.deepEqual(frameState(restored), frameState(e));
    const a = play(h, e), b = play(h, restored);
    assert.equal(a.status, 'boarding'); assert.equal(b.status, 'boarding');
    assert.deepEqual(frameState(restored), frameState(e));
  });
  check('first review card survives save and cannot award a duplicate requirement or decision', () => {
    const { e } = make(h); const result = play(h, e, { stop: 'firstLesson' });
    assert.equal(result.status, 'lesson');
    const restored = h.unpack(h.pack(e), { seed: e.seed, mode: 'normal' }, () => {});
    const score = restored.score, carrier = restored.pursuit.carriers[0];
    restored.collect(restored.modules()[0]); assert.equal(restored.score, score);
    assert(carrier.delivered); const answer = h.lessonCase(restored, restored.lesson.caseIndex).correct;
    restored.answerLesson(answer); const awarded = restored.score;
    restored.answerLesson(answer); assert.equal(restored.score, awarded);
    const finished = play(h, restored); assert.equal(finished.status, 'boarding');
    assert.deepEqual(Array.from(restored.decisions, d => d.caseIndex).sort(), [2, 3]);
    assert.equal(restored.rescued.length, 3);
  });
  check('legacy flight migration preserves collected requirements, decisions, HP and score', () => {
    const old = load(core, { legacy: true }); const { e } = make(old); e.launch();
    e.collect(e.modules()[0]); e.openNextLesson(); e.answerLesson(old.lessonCase(e, e.lesson.caseIndex).correct); e.continueLesson();
    e.player.hp = 63; e.score += 17;
    const snapshot = old.pack(e), score = e.score, decisions = clone(e.decisions), rescued = clone(e.rescued);
    assert.equal(snapshot.engine.pursuit, undefined);
    const restored = h.unpack(snapshot, { seed: e.seed, mode: 'normal' }, () => {});
    assert.equal(restored.phase, 'pursuit'); assert.equal(restored.pursuit.migrated, true);
    assert.equal(restored.player.hp, 63); assert.equal(restored.score, score);
    assert.deepEqual(clone(restored.decisions), decisions); assert.deepEqual(clone(restored.rescued), rescued);
    const result = play(h, restored); assert.equal(result.status, 'boarding');
    assert.equal(restored.rescued.length, 3); assert.equal(restored.decisions.length, 2);
    assert(restored.score >= score + 2 * 350 + 300);
    assert(restored.score <= score + 2 * 350 + 300 + 165 + 182, 'only optional escort rewards can add to the two new packages and one new decision');
  });
  } else check('admin in-memory pursuit state is serializable without functions or cyclic references', () => {
    const { e } = make(h); e.launch();
    for (let i = 0; i < 60 * 10; i++) step(h, e, actualInput(h, e));
    const saved = JSON.stringify(e.pursuit), restoredState = JSON.parse(saved);
    assert.deepEqual(clone(e.pursuit), restoredState);
    assert.equal(restoredState.version, '1.8.0'); assert.equal(restoredState.carriers.length, 3);
    assert.equal(restoredState.carriers.filter(c => c.delivered).length, e.rescued.length);
  });
  check('pause freezes pursuit time, projectiles, carrier paths and transfer progress', () => {
    const { e } = make(h); e.launch(); for (let i = 0; i < 360; i++) step(h, e, actualInput(h, e));
    e.pause(); const state = frameState(e);
    for (let i = 0; i < 240; i++) step(h, e, { fire: true, boost: true });
    assert.deepEqual(frameState(e), state);
    const restored = h.pack ? h.unpack(h.pack(e), { seed: e.seed, mode: 'normal' }, () => {}) : e;
    assert.equal(restored.status, 'paused'); restored.resume(); assert.equal(restored.status, 'playing');
    step(h, restored, {}); assert(restored.pursuit.clock > state.pursuit.clock);
  });
  check('actual damage, crash and retry rebuild only this mission while preserving previous progress', () => {
    const { e } = make(h); e.rescued = Array.from(e.plan[0]);
    e.decisions = [0, 1].map(caseIndex => ({ caseIndex, reqId: e.plan[0][caseIndex ? 2 : 0], stage: 0, firstTry: true, decision: 0 }));
    e.score = 4321; e.beginStage(1); e.launch();
    for (let i = 0; i < 60 * 9; i++) step(h, e, actualInput(h, e));
    e.player.invulnerable = 0; e.damage(1000);
    assert.equal(e.status, 'crashing');
    for (let i = 0; i < 60 * 5; i++) step(h, e, {});
    assert.equal(e.status, 'lost'); h.arcade.engine = e; h.retry(); const fresh = h.arcade.engine;
    assert.equal(fresh.status, 'briefing'); assert.equal(fresh.phase, 'pursuit');
    assert.equal(fresh.score, 4321); assert.deepEqual(Array.from(fresh.rescued), Array.from(e.plan[0]));
    assert.equal(fresh.decisions.length, 2); assert.equal(fresh.pursuit.clock, 0);
    assert(fresh.pursuit.carriers.every(c => !c.delivered && !c.open));
  });
  check('admin completion shortcut delegates actual visible-gate docking and subsequent stage reset', () => {
    const { e } = make(h); e.launch();
    for (const id of e.plan[1]) if (!e.rescued.includes(id)) e.rescued.push(id);
    e.modules().forEach(item => { item.dead = true; }); e.enemies = []; e.hostile = []; e.lessonQueue = [];
    e.decisions = [2, 3].map(caseIndex => ({ stage: 1, reqId: e.plan[1][caseIndex === 2 ? 0 : 2], caseIndex, decision: 0, firstTry: true }));
    e.phase = 'dock'; e.player.pos = Array.from(h.context.CITADEL_FLIGHT.approach(e)); e.interact();
    assert.equal(e.status, 'docking'); assert.equal(e.dock.flightVersion, '1.7.1');
    for (let i = 0; i < 60 * 14 && e.status !== 'boarding'; i++) step(h, e, {});
    assert.equal(e.status, 'boarding');
    for (const stage of [0, 2, 3]) { e.beginStage(stage); assert.equal(e.pursuit, null); assert.equal(h.api.active(e), false); assert.equal(e.phase, 'orientation'); }
  });
  check('renderer and mission HUD are pure and keep a bounded number of carrier meshes', () => {
    const { e } = make(h); e.launch(); for (let i = 0; i < 240; i++) step(h, e, actualInput(h, e));
    const state = frameState(e), scene = h.scene(e, e.elapsed, true);
    assert.deepEqual(frameState(e), state);
    const carrierItems = scene.filter(item => item.pursuitCarrier);
    assert(carrierItems.length > 20 && carrierItems.length < 110);
    assert(carrierItems.every(item => item.model.every(Number.isFinite)));
    assert(!scene.some(item => e.modules().some(p => item.pos === p.pos)), 'carried cargo has no old free pickup mesh');
  });
  for (const assist of [false, true]) for (const seed of [1, 417147, 620180]) {
    check(`real input completion ${assist ? 'calm' : 'normal'}, seed ${seed}`, () => {
      const { e, events } = make(h, assist, seed), result = play(h, e);
      assert.equal(result.status, 'boarding', JSON.stringify(result));
      assert.equal(result.requirements, 3); assert.equal(result.decisions, 2);
      assert(result.shots > 0); assert(result.peakEnemies <= 5); assert(result.peakHostile <= 18); assert(result.peakBullets <= 64);
      assert.equal(e.wave, 0); assert.equal(e.stationHp, 100);
      assert.equal(events.filter(x => x.kind === 'rescue').length, 3);
      assert.equal(events.filter(x => x.kind === 'comic' && x.data.text === 'ТРЕБОВАНИЕ ПОЙМАНО!').length, 3);
      assert.equal(result.dockVersion, '1.7.1');
      plays.push({ mode: assist ? 'calm' : 'normal', seed, strategy: 'real keyboard fire/release + G guidance', ...result });
    });
  }
  check('manual flight completes using mouse course, brake, boost and fire/release input', () => {
    const { e } = make(h, false, 417147), result = play(h, e, { manual: true, limit: 150 });
    assert.equal(result.status, 'boarding', JSON.stringify(result)); assert.equal(result.requirements, 3);
    plays.push({ mode: 'normal', seed: 417147, strategy: 'manual mouse flight with real input fields', ...result });
  });
  check('mobile autofire yields during an open channel; a held manual touch trigger still jams', () => {
    const { e } = make(h); e.launch();
    for (let i = 0; i < 60 * 14; i++) step(h, e, actualInput(h, e, 'fire'));
    h.context.innerWidth = 390; h.context.matchMedia = () => ({ matches: true }); h.mobile.autoFire = true;
    h.arcade.keys.add('Space');
    for (let i = 0; i < 30; i++) step(h, e, h.input());
    assert.equal(e.rescued.length, 0); assert.equal(e.pursuit.linkJammed, true);
    h.arcade.keys.clear(); h.arcade.firePointer = null;
    for (let i = 0; i < 60 * 7 && !e.rescued.length; i++) step(h, e, h.input());
    assert.equal(e.rescued.length, 1);
    h.context.innerWidth = 1280; h.context.matchMedia = () => ({ matches: false }); h.mobile.autoFire = false;
  });
  return { core: path.basename(core), coreSha256: hash(core), saveValidation: h.pack ?
    'Native public CUP pack/unpack, legacy migration, in-flight and lesson snapshots' :
    'Admin has no tournament save codec: serializable in-memory mission state, native pause/retry/stage transition',
    passed: groups.length, groups, plays };
}

function render(core, folder) {
  fs.mkdirSync(folder, { recursive: true }); const h = load(core, { canvas: true }); const { e } = make(h);
  e.launch(); for (let i = 0; i < 60 * 7; i++) step(h, e, actualInput(h, e));
  const files = [];
  for (const [W, H, dpr] of [[1280, 720, 1], [390, 460, 2], [844, 320, 1]]) {
    const w = W * dpr, height = H * dpr, background = h.createCanvas(w, height), overlay = h.createCanvas(w, height);
    h.arcade.canvas = background; background.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
    h.context.innerWidth = W; h.context.innerHeight = H; h.context.devicePixelRatio = dpr;
    h.context.matchMedia = () => ({ matches: W < 900 });
    const camera = h.camera(e, e.elapsed, false), state = frameState(e);
    h.draw(background.getContext('2d'), h.scene(e, e.elapsed, false), camera, w, height);
    const c = overlay.getContext('2d');
    if (W < 900) h.mobileHUD(c, e, camera, w, height);
    else { h.flightHUD(c, e, camera, w, height); h.campaignHUD(c, e, camera, w, height); h.clarityHUD(c, e, camera, w, height); }
    assert.deepEqual(frameState(e), state, 'render did not advance or reward mission');
    background.getContext('2d').drawImage(overlay, 0, 0);
    const name = `pursuit-${path.basename(core).includes('engine') ? 'admin' : 'public'}-${W}x${H}-dpr${dpr}.png`;
    fs.writeFileSync(path.join(folder, name), background.toBuffer('image/png')); files.push(name);
  }
  return files;
}
if (require.main === module) try {
  const report = { module: path.basename(patch), version: '1.8.0', moduleSha256: hash(patch),
    methodology: 'Actual public/admin JavaScript engines with real input fields in a Node VM; optional native Canvas CPU rendering. No physical Android or browser claim.',
    suites: options.cores.map(suite) };
  if (options.out) { fs.mkdirSync(options.out, { recursive: true }); if (options.render) report.renders = options.cores.flatMap(core => render(core, options.out));
    fs.writeFileSync(path.join(options.out, 'pursuit-verification-1.8.0.json'), JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
module.exports = { controller, load, make, play };
