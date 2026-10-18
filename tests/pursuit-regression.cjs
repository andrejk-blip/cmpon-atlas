#!/usr/bin/env node
'use strict';
// Real frozen cores, ordinary player input and native Canvas; no browser/device claim.
// node tests/pursuit-regression.cjs --core assets/atlas-v1.3.5.js --core ../cmpon-analytics-admin/game-lab/engine-v1.2.1.js --out /tmp/pursuit-qa-1.9 --render
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..'), asset = n => path.join(root, 'assets', n);
const patch = asset('citadel-pursuit-v1.9.0.js'), options = { cores: [], out: null, render: false };
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
const clamp = n => Math.max(-1, Math.min(1, n));
function nativeCanvas() { return require(require.resolve('@napi-rs/canvas', { paths:
  [process.cwd(), __dirname, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean) })).createCanvas; }
function load(core, { legacy = false, canvas = false } = {}) {
  const h = createHarness(core, asset('citadel-mrg-v1.7.0.js'), asset('citadel-mrg-view-v1.7.0.js'), canvas ? nativeCanvas() : null);
  h.context.location = { href: 'https://test.invalid/atlas.html', hostname: 'test.invalid', origin: 'https://test.invalid', search: '', hash: '' };
  for (const name of ['citadel-field-ui-v1.7.0.js', 'citadel-flight-v1.8.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js'])
    vm.runInContext(fs.readFileSync(asset(name), 'utf8'), h.context, { filename: name });
  if (legacy === '1.8.0') vm.runInContext(fs.readFileSync(asset('citadel-pursuit-v1.8.0.js'), 'utf8'), h.context);
  else if (!legacy) vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context, { filename: path.basename(patch) });
  vm.runInContext(`Object.assign(qa, { api: globalThis.CITADEL_PURSUIT, scene: spaceScene, camera: spaceCamera,
    input: arcadeInput, overlay: arcadeOverlayHTML, flightHUD: drawFlightHUD, campaignHUD: drawCampaignFlightHUD,
    clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD, updateHUD: updateArcadeHUD,
    lessonCase: citadelLessonCase, pack: typeof cupPack === 'function' ? cupPack : null,
    unpack: typeof cupUnpack === 'function' ? cupUnpack : null, retry: citadelRetry, action: arcadeAction,
    cup: typeof CUP !== 'undefined' ? CUP : null, levels: typeof CUP_LEVELS !== 'undefined' ? CUP_LEVELS : null,
    mobile: MOBILE, basis: flightBasis });`, h.context);
  Object.assign(h, h.context.qa); h.arcade.fx = false; return h;
}
function make(h, assist = false, seed = 417147, stage = 1) {
  const events = []; let e;
  e = new h.Engine(seed, (kind, data) => events.push({ kind, data: clone(data ?? null), time: e?.elapsed ?? 0 }));
  e.assist = assist; e.beginStage(stage); h.arcade.engine = e; return { e, events };
}
function step(h, e, input = {}, dt = 1 / 60) { h.arcade.engine = e; e.step(dt, input); }
function action(h, e, name, value) { h.arcade.engine = e; h.action(name, value); }
function controls(h, { turn = 0, pitch = 0, fire = false } = {}, type = 'mouse') {
  h.arcade.keys.clear(); h.arcade.firePointer = null; h.arcade.mouse = null; h.arcade.joystick = null;
  if (type === 'keyboard') {
    if (turn > .12) h.arcade.keys.add('KeyD'); else if (turn < -.12) h.arcade.keys.add('KeyA');
    if (pitch > .12) h.arcade.keys.add('KeyW'); else if (pitch < -.12) h.arcade.keys.add('KeyS');
  } else if (type === 'touch') h.arcade.joystick = { x: turn, y: -pitch };
  else h.arcade.mouse = { x: turn, y: -pitch };
  if (fire) h.arcade.keys.add('Space'); return h.input();
}
// Standalone admin integration operator: visible target and ordinary steering,
// with a 180 ms observation interval. It never edits health/cargo/speed/timers.
const pilots = new WeakMap();
function controller(h, e) {
  if (e.status === 'briefing') { action(h, e, 'citadel-launch'); return {}; }
  if (e.status === 'lesson') {
    if (!e.lesson.solved) action(h, e, 'citadel-lesson-answer', h.lessonCase(e, e.lesson.caseIndex).correct);
    action(h, e, 'citadel-lesson-next'); return {};
  }
  if (e.status !== 'playing' || e.phase !== 'pursuit') return {};
  let pilot = pilots.get(e);
  if (!pilot || e.pursuit.clock < pilot.clock || e.pursuit.clock - pilot.clock >= .18) {
    const target = e.navTarget().pos, pos = e.player.pos;
    pilot = { clock: e.pursuit.clock, turn: clamp((target[0] - pos[0]) * .085), pitch: clamp((target[1] - pos[1]) * .105) };
    pilots.set(e, pilot);
  }
  return { turn: pilot.turn, pitch: pilot.pitch };
}
function play(h, e, { limit = 145, stop = 'boarding', type = 'mouse', fire = false, dt = 1 / 60 } = {}) {
  let peakRocks = 0, peakBullets = 0, peakParticles = 0, firstLesson = null, dockVersion = null, frames = 0;
  const started = e.elapsed; let progress = e.pursuit?.progress || 0;
  for (; frames < limit / dt; frames++) {
    if (e.status === stop || stop === 'firstLesson' && e.status === 'lesson') break;
    if (['lost', 'crashing'].includes(e.status)) break;
    if (e.status === 'lesson') firstLesson ??= e.pursuit?.completedAt;
    const input = controller(h, e);
    if (e.status === 'playing' && e.phase === 'pursuit') {
      assert(!e.autopilot, 'ordinary steering completes without G');
      step(h, e, controls(h, { ...input, fire }, type), dt);
      assert(e.pursuit.progress + 1e-9 >= progress, 'upload never decreases'); progress = e.pursuit.progress;
      assert.equal(e.enemies.length, 0, 'no hidden kill quota'); assert.equal(e.hostile.length, 0);
    } else step(h, e, {}, dt);
    if (e.status === 'docking') dockVersion = e.dock?.flightVersion ?? null;
    peakRocks = Math.max(peakRocks, e.asteroids.length); peakBullets = Math.max(peakBullets, e.bullets.length);
    peakParticles = Math.max(peakParticles, e.particles.length);
  }
  return { status: e.status, phase: e.phase, seconds: +(e.elapsed - started).toFixed(3),
    chaseSeconds: +e.pursuit.clock.toFixed(3), firstLesson, dockVersion, frames,
    progress: +e.pursuit.progress.toFixed(5), requirements: e.plan[1].filter(id => e.rescued.includes(id)).length,
    decisions: e.decisions.filter(d => d.stage === 1).length, hp: +e.player.hp.toFixed(3),
    collisions: e.pursuit.collisions, score: e.score, shots: e.shots,
    linkedSeconds: +e.pursuit.linkedSeconds.toFixed(3), disconnectedSeconds: +e.pursuit.disconnectedSeconds.toFixed(3),
    peakRocks, peakBullets, peakParticles };
}
function frameState(e) {
  const state = {};
  for (const key of ['status', 'phase', 'pursuit', 'player', 'asteroids', 'bullets', 'hostile', 'enemies',
    'particles', 'pickups', 'elapsed', 'stageTime', 'score', 'rescued', 'decisions', 'lessonQueue', 'lesson']) state[key] = e[key];
  state.rng = e.random.getState?.(); return clone(state);
}
function layout(h, width, height, dpr = 1) {
  h.context.innerWidth = width; h.context.innerHeight = height; h.context.devicePixelRatio = dpr;
  h.context.matchMedia = () => ({ matches: width < 900 });
  h.arcade.canvas = h.context.document.getElementById('arcade-canvas');
  h.arcade.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
}
function suite(core) {
  const h = load(core), groups = [], plays = [];
  function check(name, test) { test(); groups.push(name); }
  check('briefing explains automatic upload and constant speed; safe first twelve seconds', () => {
    const { e } = make(h); assert.equal(h.api.version, '1.9.0'); assert.equal(e.phase, 'pursuit');
    assert.match(h.overlay(), /100%/); assert.match(h.overlay(), /загрузка идёт сама/);
    assert(!/Tab|тормоз|вскры|Отпустите огонь|маяк/.test(h.overlay()));
    action(h, e, 'citadel-launch'); assert.equal(e.autopilot, false);
    for (let i = 0; i < 12 * 60; i++) step(h, e, controls(h, controller(h, e)));
    assert.equal(e.player.hp, 100); assert.equal(e.pursuit.collisions, 0);
    assert.equal(e.player.speed, h.api.rules.speed); assert(e.player.pos[2] < -970);
    assert(e.pursuit.progress > 12); assert.equal(e.rescued.length, 0);
    assert.equal(e.wave, 0); assert.equal(e.stationHp, 100);
  });
  for (const assist of [false, true]) for (const seed of [1, 417147, 620180]) {
    check(`actual mouse completion ${assist ? 'calm' : 'normal'}, seed ${seed}, no fire or extra keys`, () => {
      const { e, events } = make(h, assist, seed), result = play(h, e);
      assert.equal(result.status, 'boarding', JSON.stringify(result));
      assert.equal(result.requirements, 3); assert.equal(result.decisions, 2); assert.equal(result.progress, 100);
      assert.equal(result.shots, 0); assert(result.chaseSeconds >= 60 && result.chaseSeconds <= 120, JSON.stringify(result));
      assert(result.hp >= 70); assert(result.peakRocks <= h.api.rules.maxRocks);
      assert(result.peakBullets <= h.api.rules.maxBullets); assert(result.peakParticles <= 64);
      assert.equal(result.dockVersion, '1.8.1'); assert.equal(e.wave, 0); assert.equal(e.stationHp, 100);
      assert.deepEqual(Array.from(e.decisions, d => d.caseIndex).sort(), [2, 3]);
      assert.equal(events.filter(x => x.kind === 'rescue').length, 3);
      assert.equal(events.filter(x => x.kind === 'comic' && x.data.text === 'ТЗ СКАЧАНО!').length, 1);
      assert.equal(e.score, 1650, 'only actual requirement and decision rewards');
      plays.push({ mode: assist ? 'calm' : 'normal', seed, strategy: 'mouse, 180 ms reaction, no shooting', ...result });
    });
  }
  check('ordinary digital WASD steering completes without analog precision', () => {
    const { e } = make(h), result = play(h, e, { type: 'keyboard' });
    assert.equal(result.status, 'boarding', JSON.stringify(result)); assert(result.chaseSeconds <= 120);
    plays.push({ mode: 'normal', seed: e.seed, strategy: 'WASD through real arcadeInput', ...result });
  });
  check('portrait Android-sized touch controls at 30 FPS complete the same mission', () => {
    layout(h, 390, 460, 2); const { e } = make(h), result = play(h, e, { type: 'touch', dt: 1 / 30 });
    assert.equal(result.status, 'boarding', JSON.stringify(result)); assert(result.chaseSeconds <= 120); assert.equal(result.shots, 0);
    plays.push({ mode: 'normal', seed: e.seed, strategy: '390×460 touch joystick, DPR 2, 30 FPS', ...result });
    layout(h, 1280, 720);
  });
  check('lost contact preserves upload and speed; normal steering recovers and finishes', () => {
    const { e } = make(h); action(h, e, 'citadel-launch');
    for (let i = 0; i < 16 * 60; i++) step(h, e, controls(h, controller(h, e)));
    const first = e.pursuit.progress; let stableFrames = 0, previous = first;
    for (let i = 0; i < 8 * 60; i++) {
      step(h, e, controls(h, { turn: 1, pitch: 1 }));
      assert(e.pursuit.progress >= previous); if (e.pursuit.progress === previous) stableFrames++;
      previous = e.pursuit.progress; assert.equal(e.player.speed, h.api.rules.speed);
    }
    assert.equal(e.status, 'playing'); assert(stableFrames > 300); assert.equal(e.pursuit.link.connected, false);
    const lostAt = e.pursuit.progress, result = play(h, e);
    assert(lostAt >= first); assert.equal(result.status, 'boarding', JSON.stringify(result));
    plays.push({ mode: 'normal', seed: e.seed, strategy: 'eight seconds of wrong steering, then recover', ...result });
  });
  check('deliberately flying into a visible asteroid causes a real hit; the pilot can then recover', () => {
    const { e, events } = make(h); action(h, e, 'citadel-launch');
    while (e.pursuit.clock < 9) step(h, e, controls(h, controller(h, e)));
    const rock = e.asteroids.find(a => !a.wall && a.passAt > e.pursuit.clock + 2); assert(rock);
    while (e.pursuit.clock < rock.passAt + .35 && e.status === 'playing') {
      step(h, e, controls(h, { turn: clamp((rock.pos[0] - e.player.pos[0]) * .13), pitch: clamp((rock.pos[1] - e.player.pos[1]) * .17) }));
    }
    assert(rock.contact); assert(e.pursuit.collisions >= 1); assert(e.player.hp < 100);
    assert(rock.passAt - rock.spawnedAt >= 7, 'rocks appear well before impact');
    assert(events.filter(x => x.kind === 'damage').length <= 2, 'one contact cannot cause repeated frame damage');
    assert.equal(play(h, e).status, 'boarding');
  });
  check('continuous optional fire never jams the radio and stays bounded on mobile', () => {
    layout(h, 390, 460, 2); h.mobile.autoFire = true;
    const { e } = make(h), result = play(h, e, { type: 'touch', fire: true });
    assert.equal(result.status, 'boarding', JSON.stringify(result)); assert(result.shots > 100);
    assert.equal(e.pursuit.linkJammed, false); assert(result.peakBullets <= h.api.rules.maxBullets); assert(result.peakParticles <= 64);
    plays.push({ mode: 'normal', seed: e.seed, strategy: 'touch plus continuous fire', ...result });
    h.mobile.autoFire = false; layout(h, 1280, 720);
  });
  check('pause freezes corridor, upload, projectiles and ship; native pause save resumes', () => {
    const { e } = make(h); action(h, e, 'citadel-launch');
    for (let i = 0; i < 17 * 60; i++) step(h, e, controls(h, { ...controller(h, e), fire: true }));
    e.pause(); const state = frameState(e);
    for (let i = 0; i < 240; i++) step(h, e, { turn: 1, pitch: -1, fire: true, boost: true });
    assert.deepEqual(frameState(e), state);
    const restored = h.pack ? h.unpack(h.pack(e), { seed: e.seed, mode: 'normal' }, () => {}) : e;
    assert.equal(restored.status, 'paused'); restored.resume(); step(h, restored, controls(h, controller(h, restored)));
    assert(restored.pursuit.clock > state.pursuit.clock);
  });
  if (h.pack) {
    check('native 1.9 save resumes identical flight, hazards, upload, HP and RNG', () => {
      const { e } = make(h); action(h, e, 'citadel-launch');
      for (let i = 0; i < 35 * 60; i++) step(h, e, controls(h, controller(h, e)));
      assert.equal(e.rescued.length, 1); const restored = h.unpack(h.pack(e), { seed: e.seed, mode: 'normal' }, () => {});
      assert.deepEqual(frameState(restored), frameState(e));
      for (let i = 0; i < 420; i++) { const input = controls(h, controller(h, e)); step(h, e, input); step(h, restored, input); }
      assert.deepEqual(frameState(restored), frameState(e));
      assert.equal(play(h, restored).status, 'boarding'); assert.equal(restored.score, 1650);
      assert.equal(restored.rescued.length, 3); assert.equal(restored.decisions.length, 2);
    });
    check('an actual old 1.8 pickup save migrates cargo and partial upload without duplicate reward', () => {
      const old = load(core, { legacy: '1.8.0' }), { e } = make(old); action(old, e, 'citadel-launch');
      for (let i = 0; i < 40 * 60 && e.rescued.length < 1; i++) step(old, e, { fire: !e.navTarget()?.open });
      assert.equal(e.rescued.length, 1, 'old cargo earned through its real original loop');
      const saved = old.pack(e), hp = e.player.hp, score = e.score, rescued = clone(e.rescued), decisions = clone(e.decisions);
      const restored = h.unpack(saved, { seed: e.seed, mode: 'normal' }, () => {});
      assert.equal(restored.phase, 'pursuit'); assert.equal(restored.pursuit.version, '1.9.0');
      assert.equal(restored.pursuit.migrated, true); assert.equal(restored.player.hp, hp); assert.equal(restored.score, score);
      assert.deepEqual(clone(restored.rescued), rescued); assert.deepEqual(clone(restored.decisions), decisions);
      assert(restored.pursuit.progress + 1e-7 >= 100 / 3); assert.equal(play(h, restored).status, 'boarding');
      assert.equal(restored.score, score + 1300); assert.equal(restored.rescued.length, 3);
    });
    check('an old pre-pursuit flight with an open solved lesson preserves educational progress', () => {
      const old = load(core, { legacy: true }), { e } = make(old); e.launch(); e.collect(e.modules()[0]); e.openNextLesson();
      e.answerLesson(old.lessonCase(e, e.lesson.caseIndex).correct); const score = e.score;
      const restored = h.unpack(old.pack(e), { seed: e.seed, mode: 'normal' }, () => {});
      assert.equal(restored.status, 'lesson'); assert.equal(restored.lesson.solved, true); assert.equal(restored.score, score);
      assert.equal(restored.decisions.length, 1); action(h, restored, 'citadel-lesson-next');
      assert.equal(restored.autopilot, false, 'old lesson resumes ordinary manual steering without another key');
      assert.equal(play(h, restored).status, 'boarding'); assert.equal(restored.decisions.length, 2); assert.equal(restored.score, score + 1000);
    });
    check('safe review save retains full upload and each lesson awards only once', () => {
      const { e } = make(h); assert.equal(play(h, e, { stop: 'firstLesson' }).status, 'lesson'); assert.equal(e.rescued.length, 3);
      const restored = h.unpack(h.pack(e), { seed: e.seed, mode: 'normal' }, () => {}), score = restored.score;
      restored.collect(restored.modules()[0]); assert.equal(restored.score, score);
      const answer = h.lessonCase(restored, restored.lesson.caseIndex).correct;
      restored.answerLesson(answer); const awarded = restored.score; restored.answerLesson(answer); assert.equal(restored.score, awarded);
      assert.equal(play(h, restored).status, 'boarding'); assert.equal(restored.decisions.length, 2); assert.equal(restored.score, 1650);
    });
  } else check('admin serializable in-memory snapshot resumes the same ordinary-input flight', () => {
    const { e } = make(h); action(h, e, 'citadel-launch');
    for (let i = 0; i < 35 * 60; i++) step(h, e, controls(h, controller(h, e)));
    const restored = new h.Engine(e.seed); Object.assign(restored, JSON.parse(JSON.stringify(e)));
    restored.random = e.random; restored.emit = () => {}; assert.deepEqual(frameState(restored), frameState(e));
    for (let i = 0; i < 300; i++) { const input = controls(h, controller(h, e)); step(h, e, input); step(h, restored, input); }
    assert.deepEqual(frameState(restored), frameState(e)); assert.equal(play(h, restored).status, 'boarding');
  });
  check('real crash and retry reset this mission while retaining previous-stage progress', () => {
    const { e } = make(h); e.rescued = Array.from(e.plan[0]);
    e.decisions = [0, 1].map(caseIndex => ({ caseIndex, reqId: e.plan[0][caseIndex ? 2 : 0], stage: 0, firstTry: true, decision: 0 }));
    e.score = 4321; e.beginStage(1); e.launch();
    for (let i = 0; i < 9 * 60; i++) step(h, e, controls(h, controller(h, e)));
    e.player.invulnerable = 0; e.damage(1000); assert.equal(e.status, 'crashing');
    for (let i = 0; i < 5 * 60; i++) step(h, e, {});
    assert.equal(e.status, 'lost'); h.arcade.engine = e; h.retry(); const fresh = h.arcade.engine;
    assert.equal(fresh.status, 'briefing'); assert.equal(fresh.phase, 'pursuit'); assert.equal(fresh.score, 4321);
    assert.deepEqual(Array.from(fresh.rescued), Array.from(e.plan[0])); assert.equal(fresh.decisions.length, 2);
    assert.equal(fresh.pursuit.clock, 0); assert.equal(fresh.pursuit.progress, 0);
  });
  check('admin shortcut enters the real gate; other stage and finale transitions delegate', () => {
    const { e } = make(h); e.launch(); for (const id of e.plan[1]) if (!e.rescued.includes(id)) e.rescued.push(id);
    e.modules().forEach(item => { item.dead = true; }); e.enemies = []; e.hostile = []; e.lessonQueue = [];
    e.decisions = [2, 3].map(caseIndex => ({ stage: 1, reqId: e.plan[1][caseIndex === 2 ? 0 : 2], caseIndex, decision: 0, firstTry: true }));
    e.phase = 'dock'; e.player.pos = Array.from(h.context.CITADEL_FLIGHT.approach(e)); e.interact();
    assert.equal(e.status, 'docking'); assert.equal(e.dock.flightVersion, '1.8.1');
    for (let i = 0; i < 14 * 60 && e.status !== 'boarding'; i++) step(h, e, {});
    assert.equal(e.status, 'boarding');
    for (const stage of [0, 2, 3]) { e.beginStage(stage); assert.equal(e.pursuit, null); assert.equal(h.api.active(e), false); assert.equal(e.phase, 'orientation'); }
  });
  return { core: path.basename(core), coreSha256: hash(core), passed: groups.length, groups,
    saveValidation: h.pack ? 'Native CUP: exact new replay, actual 1.8 migration, pre-pursuit lesson and pause.' :
      'Admin has no CUP codec; serializable runtime snapshot and native pause/retry verified.', plays };
}
function render(core, folder) {
  fs.mkdirSync(folder, { recursive: true }); const h = load(core, { canvas: true }), { e } = make(h);
  action(h, e, 'citadel-launch'); for (let i = 0; i < 24 * 60; i++) step(h, e, controls(h, controller(h, e)));
  const files = [];
  for (const [W, H, dpr] of [[1280, 720, 1], [390, 460, 2], [844, 320, 1]]) {
    const w = W * dpr, height = H * dpr, background = h.createCanvas(w, height), overlay = h.createCanvas(w, height);
    layout(h, W, H, dpr); h.arcade.canvas = background; background.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
    const before = frameState(e), camera = h.camera(e, e.elapsed, false), scene = h.scene(e, e.elapsed, true);
    assert(scene.length < 155); assert(scene.every(item => item.model.every(Number.isFinite)));
    const lead = h.project(e.pursuit.leader.pos, camera, w, height);
    assert(lead.x > 0 && lead.x < w && lead.y > 78 * dpr && lead.y < height - 35 * dpr, 'FZ remains visible below the HUD');
    const bounds = h.api.hudBounds(e, camera, W, H);
    assert.equal(bounds.length, 2); assert(bounds.every(b => b.x >= 0 && b.y >= 0 && b.x + b.width <= W && b.y + b.height <= H));
    const c = overlay.getContext('2d'), measured = [], fillText = c.fillText.bind(c);
    c.fillText = (text, x, y, maxWidth) => { measured.push({ text, x, y }); return maxWidth === undefined ? fillText(text, x, y) : fillText(text, x, y, maxWidth); };
    h.draw(background.getContext('2d'), scene, camera, w, height);
    if (W < 900) h.mobileHUD(c, e, camera, w, height);
    else { h.flightHUD(c, e, camera, w, height); h.campaignHUD(c, e, camera, w, height); h.clarityHUD(c, e, camera, w, height); }
    assert(measured.some(x => /ПОГОНЯ ЗА ФЗ/.test(x.text))); assert(measured.some(x => /Щит/.test(x.text)));
    assert(measured.every(x => x.x >= 0 && x.x <= W && x.y >= 0 && x.y <= H));
    assert.deepEqual(frameState(e), before, 'camera, scene and HUD do not mutate game state');
    background.getContext('2d').drawImage(overlay, 0, 0);
    const name = `pursuit-1.9-${path.basename(core).includes('engine') ? 'admin' : 'public'}-${W}x${H}-dpr${dpr}.png`;
    fs.writeFileSync(path.join(folder, name), background.toBuffer('image/png')); files.push(name);
  }
  return files;
}
if (require.main === module) try {
  const report = { module: path.basename(patch), version: '1.9.0', moduleSha256: hash(patch),
    methodology: 'Actual cores in Node VM, ordinary mouse/WASD/touch, native lesson actions, optional native Canvas. No physical Android/browser claim.',
    suites: options.cores.map(suite) };
  if (options.out) { fs.mkdirSync(options.out, { recursive: true }); if (options.render) report.renders = options.cores.flatMap(core => render(core, options.out));
    fs.writeFileSync(path.join(options.out, 'pursuit-verification-1.9.0.json'), JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.stack); process.exitCode = 1; }
module.exports = { controller, load, make, play, controls, step, frameState, layout, render };
