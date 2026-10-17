#!/usr/bin/env node
'use strict';

// Real game-core regressions in a Node VM. No browser, network, or production
// storage is used. Optional PNGs exercise the actual Canvas projection renderer.
//   node tests/mrg-regression.cjs
//   node tests/mrg-regression.cjs --core ../admin/game-lab/engine-v1.2.1.js
//   node tests/mrg-regression.cjs --render /tmp/mrg-render
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const clone = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, message, tolerance = 1e-7) =>
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

function parseArgs(argv) {
  const root = path.resolve(__dirname, '..');
  const options = {
    cores: [], patch: path.join(root, 'assets/citadel-mrg-v1.5.0.js'),
    view: path.join(root, 'assets/citadel-mrg-view-v1.5.0.js'),
    render: null, smoke: false, only: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--core') options.cores.push(path.resolve(argv[++i]));
    else if (arg === '--patch') options.patch = path.resolve(argv[++i]);
    else if (arg === '--view') options.view = path.resolve(argv[++i]);
    else if (arg === '--render') options.render = path.resolve(argv[++i]);
    else if (arg === '--smoke') options.smoke = true;
    else if (arg === '--only') options.only = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.cores.length) options.cores.push(path.join(root, 'assets/atlas-v1.3.5.js'));
  return options;
}

function nativeCanvas() {
  const search = [process.cwd(), __dirname, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean);
  try { return require(require.resolve('@napi-rs/canvas', { paths: search })).createCanvas; }
  catch { throw new Error('PNG verification needs @napi-rs/canvas installed, or CODEX_PRIMARY_RUNTIME_NODE_MODULES.'); }
}

function createHarness(corePath, patchPath, viewPath, createCanvas = null) {
  const nodes = new Map(), storage = new Map(), events = new Map();
  let document;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    let item = {
      id, tagName: 'DIV', innerHTML: '', textContent: id === 'release-data' ? '{"version":"test"}' : '',
      value: '', hidden: false, open: false, style: { setProperty(k, v) { this[k] = v; } },
      dataset: {}, handlers: {}, attrs: {},
      classList: {
        add(k) { classes.add(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); },
        toggle(k, on) { if (on === undefined) on = !classes.has(k); on ? classes.add(k) : classes.delete(k); },
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
      addEventListener(k, f) { (this.handlers[k] ??= []).push(f); },
      focus() { document.activeElement = this; }, setPointerCapture() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector() { return { focus() {} }; }, querySelectorAll() { return []; }, scrollIntoView() {},
      insertAdjacentHTML(_, html) { this.innerHTML += html; },
      appendChild(child) { (this.children ??= []).push(child); return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
    };
    if (/canvas/.test(id)) {
      if (createCanvas) { const canvas = createCanvas(1280, 720); Object.assign(canvas, item); item = canvas; }
      else Object.assign(item, { width: 1280, height: 720, getContext() { return null; } });
      item.tagName = 'CANVAS';
    }
    nodes.set(id, item);
    return item;
  }
  document = {
    body: node('body'), head: node('head'), documentElement: node('html'), hidden: false,
    activeElement: { tagName: 'BODY' }, getElementById: node,
    createElement(tag) { const item = node(`created-${tag}-${nodes.size}`); item.tagName = tag.toUpperCase(); return item; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(k, f) { (events.get(k) || events.set(k, []).get(k)).push(f); },
  };
  const context = {
    document, ATLAS_TEST: true, console, performance: { now: () => 0 },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }), devicePixelRatio: 1,
    innerWidth: 1280, innerHeight: 800, visualViewport: { height: 800, addEventListener() {} },
    addEventListener() {}, navigator: {}, setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, crypto: crypto.webcrypto, Blob, URL, Uint32Array,
    localStorage: {
      getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }, clear() { storage.clear(); },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(corePath, 'utf8'), context, { filename: path.basename(corePath) });
  if (patchPath) vm.runInContext(fs.readFileSync(patchPath, 'utf8'), context, { filename: path.basename(patchPath) });
  if (viewPath) vm.runInContext(fs.readFileSync(viewPath, 'utf8'), context, { filename: path.basename(viewPath) });
  vm.runInContext(`globalThis.qa = {
    Engine: RequirementArcade, arcade: ARCADE, state: STATE, vectors: V3,
    scene: spaceScene, camera: spaceCamera, draw: spaceDrawCPU, hud: drawFinaleHUD,
    project: spaceProject, point: spacePoint, meshes: SPACE_MESH,
    api: globalThis.CITADEL_MRG, view: globalThis.CITADEL_MRG_VIEW,
    cupPack: typeof cupPack === 'function' ? cupPack : null,
    cupUnpack: typeof cupUnpack === 'function' ? cupUnpack : null,
  };`, context);
  const qa = context.qa;
  qa.arcade.sound = false;
  qa.arcade.forceCPU = true;
  qa.state.view = 'arcade';
  function engine({ assist = false, upgrades = { weapons: 2, armor: 1, rockets: 0 }, seed = 417147 } = {}) {
    const emitted = [];
    const e = new qa.Engine(seed, (kind, data) => emitted.push({ kind, data, time: e.elapsed }));
    e.assist = assist;
    e.upgrades = { ...upgrades };
    e.beginStage(3);
    e.beginFinale();
    e.beginMRG();
    e.qaEvents = emitted;
    qa.arcade.engine = e;
    return e;
  }
  return { ...qa, context, nodes, storage, engine, corePath, createCanvas };
}

function runFrames(e, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) e.step(1 / 60, typeof input === 'function' ? input(e, i) : input);
}

function inert(e) {
  e.board.invulnerable = 1e6;
  e.finale.attackClock = 1e6;
  e.finale.telegraph = 0;
  e.finale.beamTime = 0;
  return e;
}

function bossHit(e, damage = 1e9) {
  e.finale.exposedFor = 100;
  e.finale.open = true;
  e.board.bullets.push({ pos: e.finale.mrg.pos.slice(), vel: [0, 0, 0], life: 1, damage });
  e.step(1 / 60, {});
}

function clearSoldiers(e) {
  for (const enemy of e.board.enemies) { enemy.hp = 0; enemy.dead = true; }
}

function enterWave(e, wave) {
  for (let attempt = 0; e.finale.waveIndex < wave && attempt < 4; attempt++) { clearSoldiers(e); bossHit(e); }
  assert.equal(e.finale.waveIndex, wave, `Enter wave ${wave + 1}`);
  return e;
}

function main(options = parseArgs(process.argv.slice(2))) {
  const makeCanvas = options.render ? nativeCanvas() : null;
  const results = [];
  for (const corePath of options.cores) {
    const h = createHarness(corePath, options.smoke ? null : options.patch,
      !options.smoke && fs.existsSync(options.view) ? options.view : null, makeCanvas);
    const e = h.engine();
    assert.equal(e.status, 'boarding');
    assert.equal(e.finale.phase, 'mrg');
    assert.equal(e.board.hp, 100);
    const result = { core: path.basename(corePath), version: e.finale.arenaVersion || 'baseline', tests: [] };
    if (!options.smoke) runTests(h, options, result);
    results.push(result);
  }
  if (options.render) {
    fs.mkdirSync(options.render, { recursive: true });
    fs.writeFileSync(path.join(options.render, 'mrg-verification.json'), JSON.stringify(results, null, 2) + '\n');
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => result.tests.some(test => !test.ok))) process.exitCode = 1;
  return results;
}

function runTests(h, options, result) {
  assert.equal(h.api?.version, '1.5.0');
  function test(name, fn) {
    if (options.only && !name.includes(options.only)) return;
    try { const data = fn(); result.tests.push({ name, ok: true, ...(data === undefined ? {} : { data }) }); }
    catch (error) { result.tests.push({ name, ok: false, error: error.message, stack: error.stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3) }); }
  }
  const plain = { weapons: 0, armor: 0, rockets: 0 };
  const fresh = (wave = 0, settings = {}) => inert(enterWave(h.engine(settings), wave));
  function rider(e, id = 'left', fraction = .5) {
    const p = e.finale.arenaPlatforms.find(p => p.id === id);
    Object.assign(e.board, {
      pos: [p.lo + (p.hi - p.lo) * fraction, p.y, 0], previous: [p.lo + (p.hi - p.lo) * fraction, p.y, 0],
      vx: 0, vy: 0, grounded: true, supportId: p.id, knockbackX: 0,
      jumpHeld: false, dropHeld: false, dropTimer: 0, coyote: .12,
    });
    return p;
  }

  test('three wave contracts and 2/3/4 live killable soldiers', () => {
    assert.deepEqual(clone(h.api.waves.map(w => w.soldiers)), [2, 3, 4]);
    assert.deepEqual(clone(h.api.waves.map(w => w.damageMultiplier)), [1, 2, 4]);
    const e = fresh();
    for (let wave = 0; wave < 3; wave++) {
      enterWave(e, wave);
      const f = e.finale, b = e.board;
      assert.equal(f.arenaVersion, '1.5.0');
      assert.equal(f.waveDamageMultiplier, 2 ** wave);
      assert.equal(f.mrg.stage, wave);
      assert.equal(b.enemies.filter(s => !s.dead && s.hp > 0).length, 2 + wave);
      assert.equal(new Set(b.enemies.map(s => s.id)).size, 2 + wave);
      assert.equal(b.enemies.filter(s => s.name).length, 1, 'Exactly one named soldier per wave');
      assert.equal(b.enemies[0].name, ['TV', 'BS', 'SH'][wave]);
      assert.equal(b.enemies[0].beard, wave === 2, 'SH is the bearded soldier');
      assert(f.waveTitle && f.platformLabel && f.waveIntro > 0);
      assert.equal(typeof f.waveGateReached, 'boolean');
      for (const soldier of b.enemies) {
        assert(soldier.hp > 0 && soldier.hp === soldier.maxHp);
        assert(soldier.pos.every(Number.isFinite) && soldier.previous.every(Number.isFinite));
        assert(Number.isFinite(soldier.spawnTime));
        assert([1, -1].includes(soldier.facing));
      }
      assert.equal(h.api.status(e).soldiersAlive, 2 + wave);
    }
  });

  test('HP and soldier gates are both required; massive projectiles cannot skip waves', () => {
    const e = fresh(), m = e.finale.mrg;
    bossHit(e);
    near(m.hp, m.maxHp * 2 / 3, 'First boundary clamp');
    assert.equal(e.finale.waveIndex, 0);
    assert(e.finale.waveGateReached);
    bossHit(e);
    near(m.hp, m.maxHp * 2 / 3, 'Repeated hits cannot pass a blocked gate');
    e.board.enemies[0].hp = 0; e.board.enemies[0].dead = true;
    e.step(1 / 60, {}); assert.equal(e.finale.waveIndex, 0);
    clearSoldiers(e); e.step(1 / 60, {});
    assert.equal(e.finale.waveIndex, 1);
    assert.equal(e.board.enemies.length, 3);
    clearSoldiers(e); runFrames(e, .2);
    assert.equal(e.finale.waveIndex, 1, 'Soldiers alone do not complete a wave');
    bossHit(e);
    assert.equal(e.finale.waveIndex, 2);
    near(m.hp, m.maxHp / 3, 'Second boundary clamp');

    const flood = fresh();
    clearSoldiers(flood);
    for (let i = 0; i < 50; i++) flood.board.bullets.push({ pos: flood.finale.mrg.pos.slice(), vel: [0, 0, 0], life: 1, damage: 1e9 });
    flood.finale.exposedFor = 100; flood.step(1 / 60, {});
    assert.equal(flood.finale.waveIndex, 1, 'A same-frame projectile flood advances only one wave');
    near(flood.finale.mrg.hp, flood.finale.mrg.maxHp * 2 / 3, 'Same-frame damage is not carried to next wave');
    assert.equal(flood.board.bullets.length, 0);
  });

  test('final soldiers block victory and ordinary upload; completed finale uploads once', () => {
    const e = fresh(2);
    bossHit(e);
    assert.equal(e.finale.mrg.hp, 0);
    runFrames(e, .2);
    assert.equal(e.finale.phase, 'mrg'); assert.equal(e.finale.defeatTime, 0);
    assert.equal(e.beginUpload(), false);
    clearSoldiers(e); e.step(1 / 60, {});
    assert(e.finale.defeatTime > 2.9);
    const start = e.score;
    runFrames(e, 3.1); assert.equal(e.finale.phase, 'upload');
    assert.equal(e.score, start + 7000);
    assert.equal(e.beginUpload(), false); assert.equal(e.score, start + 7000);
    runFrames(e, 8.1); assert.equal(e.status, 'won');
  });

  test('explicit upload checkpoint entry stays compatible and does not award points', () => {
    const e = fresh(), score = e.score;
    assert.equal(e.beginUpload(false), true);
    assert.equal(e.finale.phase, 'upload'); assert.equal(e.score, score);
    assert.equal(e.board.enemies.length, 0);
    e.retryFinale(); assert.equal(e.finale.phase, 'upload');
    assert.equal(e.score, score);
  });

  test('soldier / fan / floor-wave / beam / body damage scales once by 1,2,4', () => {
    const damage = [];
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave, { upgrades: plain }), b = e.board, f = e.finale;
      for (const [kind, base] of [['soldier', 10], ['fan', 10], ['floor', 16], ['beam', 22], ['contact', 18]]) {
        Object.assign(b, { hp: 100, invulnerable: 0, pos: [-25, 1, 0], previous: [-25, 1, 0], vy: 0, grounded: true, knockbackX: 0 });
        b.hostile = []; f.beamTime = 0; f.attackClock = 100; f.exposedFor = 100;
        if (kind === 'beam') { f.beamTime = .38; f.aimY = 1.5; }
        else if (kind === 'contact') b.pos[0] = h.api.bossBounds().minX;
        else b.hostile.push({ pos: [-25, 1.5, 0], vel: [0, 0, 0], life: 1, damage: base, r: .4, source: kind === 'soldier' ? 'soldier' : 'boss', wave: kind === 'floor' });
        e.step(1 / 60, {});
        near(100 - b.hp, base * 2 ** wave, `${kind} wave ${wave + 1}`);
        damage.push({ wave: wave + 1, kind, hp: 100 - b.hp });
      }
    }
    return damage;
  });

  test('invulnerability prevents per-frame beam and boss-body damage', () => {
    const e = fresh(2, { upgrades: plain }), b = e.board, x = h.api.bossBounds().minX;
    b.hp = 100; b.invulnerable = 0; b.pos = [x, 1, 0];
    e.step(1 / 60, {});
    near(b.hp, 28, 'One contact hit');
    for (let i = 0; i < 30; i++) { b.pos[0] = x; e.step(1 / 60, {}); }
    near(b.hp, 28, 'No repeated body hits during the iframe');
    assert(b.pos[0] < x, 'Boss body remains solid while invulnerable');
    const beam = fresh(0, { upgrades: plain });
    beam.board.invulnerable = 0; beam.finale.beamTime = .38; beam.finale.aimY = 1.5;
    runFrames(beam, .3);
    near(beam.board.hp, 78, 'A beam damages once during its active duration');
  });

  test('assist and armor retain their independent damage reductions', () => {
    const data = [];
    for (const assist of [false, true]) for (const armor of [0, 1, 2]) {
      const e = fresh(2, { assist, upgrades: { ...plain, armor } });
      e.board.invulnerable = 0; e.mrgDamage(10, 'soldier');
      near(100 - e.board.hp, 40 * (assist ? .5 : 1) * .8 ** armor, 'Assist/armor modifiers');
      data.push({ assist, armor, damage: 100 - e.board.hp });
    }
    return data;
  });

  test('automatic aim selects nearest live soldier; real gunfire kills and emits shot/destroy', () => {
    const e = fresh(0, { upgrades: plain });
    const b = e.board;
    b.enemies[0].pos = [-8, 1, 0]; b.enemies[1].pos = [-20, 1, 0];
    for (const soldier of b.enemies) { soldier.spawnTime = 100; soldier.hp = 21; soldier.maxHp = 21; soldier.supportId = 'floor'; }
    e.step(1 / 60, { fire: true });
    assert.equal(b.bullets[0].targetId, b.enemies[1].id);
    assert.equal(b.bullets[0].damage, 21);
    runFrames(e, 1.5, { fire: true });
    assert(b.enemies.every(s => s.dead), 'Actual bullets kill both soldiers');
    assert.equal(b.kills, 2);
    assert(e.qaEvents.some(event => event.kind === 'shot'));
    assert.equal(e.qaEvents.filter(event => event.kind === 'destroy' && /^mrg-/.test(event.data)).length, 2);
    assert(b.bullets.some(shot => shot.targetId === 'core'), 'Cleared soldiers switch targeting to the core');
    const upgraded = fresh(0, { upgrades: { ...plain, weapons: 2 } });
    upgraded.step(1 / 60, { fire: true });
    near(upgraded.board.bullets[0].damage, 31.5, 'Weapon upgrade damage');
    assert(upgraded.board.cooldown < .14, 'Weapon upgrade cadence');
  });

  test('grenades hit soldiers, splash adjacent targets and emit launch/explosion', () => {
    const e = fresh(), b = e.board;
    b.enemies[0].pos = [-17, 1, 0]; b.enemies[1].pos = [-15, 1, 0];
    for (const soldier of b.enemies) { soldier.spawnTime = 100; soldier.supportId = 'floor'; }
    const missiles = e.player.missiles;
    assert.equal(e.mrgGrenade(), true); assert.equal(e.player.missiles, missiles - 1);
    assert.equal(b.bullets[0].targetId, b.enemies[0].id);
    assert.equal(e.mrgGrenade(), false, 'Grenade cooldown prevents accidental bursts');
    runFrames(e, .5);
    assert(b.enemies.every(s => s.dead));
    assert(e.qaEvents.some(event => event.kind === 'missile'));
    assert(e.qaEvents.some(event => event.kind === 'destroy' && event.data === 'grenade'));
  });

  test('floor is fixed; wave patterns are horizontal, vertical, then mixed', () => {
    const output = [];
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave); runFrames(e, 2);
      const floor = clone(e.finale.arenaPlatforms[0]);
      const samples = [];
      runFrames(e, 4, current => { const p = current.finale.arenaPlatforms[1]; samples.push([p.lo, p.y]); return {}; });
      const range = column => Math.max(...samples.map(p => p[column])) - Math.min(...samples.map(p => p[column]));
      const dx = range(0), dy = range(1);
      near(e.finale.arenaPlatforms[0].lo, floor.lo, 'Static floor left');
      near(e.finale.arenaPlatforms[0].hi, floor.hi, 'Static floor right');
      near(e.finale.arenaPlatforms[0].y, floor.y, 'Static floor height');
      assert.equal(e.finale.arenaPlatforms[0].moving, false);
      if (wave === 0) { assert(dx > 1); near(dy, 0, 'First wave is horizontal'); }
      if (wave === 1) { near(dx, 0, 'Second wave is vertical'); assert(dy > 1); }
      if (wave === 2) { assert(dx > 1); assert(dy > 1); }
      for (const p of e.finale.arenaPlatforms) for (const key of ['lo', 'hi', 'y', 'previousLo', 'previousHi', 'previousY']) assert(Number.isFinite(p[key]), key);
      output.push({ wave: wave + 1, horizontalRange: dx, verticalRange: dy });
    }
    return output;
  });

  test('standing riders are carried with each moving platform in X and Y', () => {
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave); runFrames(e, 2); const p = rider(e);
      const offset = e.board.pos[0] - p.lo;
      for (let i = 0; i < 120; i++) {
        e.step(1 / 60, {});
        assert(e.board.grounded, `Rider remains grounded in wave ${wave + 1}`);
        near(e.board.pos[0] - p.lo, offset, 'Horizontal platform carry');
        near(e.board.pos[1], p.y, 'Vertical platform carry');
        assert.equal(e.board.supportId, p.id);
      }
    }
  });

  test('jump detaches from moving platform and drop-through does not catch its top again', () => {
    const e = fresh(2); runFrames(e, 2); const p = rider(e);
    e.step(1 / 60, { jump: true });
    assert(!e.board.grounded && e.board.vy > 0);
    const x = e.board.pos[0];
    runFrames(e, .15, { jump: true });
    near(e.board.pos[0], x, 'An airborne player is no longer carried horizontally');
    assert(e.board.pos[1] > p.y + 1);
    rider(e); e.step(1 / 60, { moveZ: 1 });
    assert(!e.board.grounded && e.board.dropTimer > 0);
    runFrames(e, .25, { moveZ: 1 });
    assert(e.board.pos[1] < p.y - .2, 'Player drops below the moving surface');
  });

  test('walking off an edge falls; coyote jump and variable jump height remain usable', () => {
    const e = fresh(0); runFrames(e, 2); const p = rider(e, 'left', .999);
    e.step(1 / 60, { moveX: 1 });
    assert(!e.board.grounded, 'No invisible support beyond platform edge');
    assert(e.board.pos[1] < p.y);
    e.step(1 / 60, { moveX: 1, jump: true });
    assert(e.board.vy > 10, 'Short coyote interval permits an edge jump');
    const short = fresh(), high = fresh();
    short.step(1 / 60, { jump: true }); high.step(1 / 60, { jump: true });
    runFrames(short, .2, { jump: false }); runFrames(high, .2, { jump: true });
    assert(high.board.pos[1] > short.board.pos[1] + 1, 'Holding jump gives a higher jump');
  });

  test('pause freezes arena and retry resets motion, soldiers, gates and combat transients', () => {
    const e = fresh(2); runFrames(e, 2); rider(e); e.step(1 / 60, { fire: true, missile: true });
    e.pause();
    const state = clone({ board: e.board, finale: e.finale, elapsed: e.elapsed });
    runFrames(e, 3, { moveX: 1, jump: true, fire: true });
    assert.deepEqual(clone({ board: e.board, finale: e.finale, elapsed: e.elapsed }), state);
    e.resume(); assert.equal(e.status, 'boarding'); e.step(1 / 60, {}); assert(e.finale.time > state.finale.time);
    e.status = 'lost'; e.retryFinale();
    assert.equal(e.finale.waveIndex, 0); assert.equal(e.finale.waveDamageMultiplier, 1);
    assert.equal(e.finale.mrg.hp, e.finale.mrg.maxHp); assert.equal(e.board.hp, 100);
    assert.equal(e.board.enemies.length, 2); assert(e.board.enemies.every(s => !s.dead && s.hp === s.maxHp));
    assert.equal(e.finale.time, 0); assert.equal(e.finale.defeatTime, 0); assert(!e.finale.waveGateReached);
    assert.deepEqual(clone(e.board.pos), [-25, 1, 0]);
    assert.equal(e.board.grenadeCooldown, 0); assert.equal(e.board.dropTimer, 0); assert.equal(e.board.knockbackX, 0);
    assert.equal(e.board.bullets.length + e.board.hostile.length, 0);
    for (const p of e.finale.arenaPlatforms) { near(p.lo, p.previousLo, 'Reset platform X'); near(p.y, p.previousY, 'Reset platform Y'); }
  });

  test('new MRG JSON roundtrip preserves exact state and subsequent deterministic physics', () => {
    const a = fresh(2); runFrames(a, 3); rider(a); a.step(1 / 60, { fire: true });
    a.board.enemies[0].hp -= 17; a.score = 31415;
    const snapshot = h.cupPack ? h.cupPack(a) : clone({ finale: a.finale, board: a.board, elapsed: a.elapsed, score: a.score, player: a.player });
    const b = h.cupUnpack ? h.cupUnpack(snapshot, { seed: a.seed, mode: a.assist ? 'calm' : 'normal' }, () => {}) : h.engine();
    if (!h.cupUnpack) Object.assign(b, clone(snapshot));
    assert.deepEqual(clone(b.finale), clone(a.finale)); assert.deepEqual(clone(b.board), clone(a.board)); assert.equal(b.score, a.score);
    runFrames(a, 1, { moveX: -.2, fire: true }); runFrames(b, 1, { moveX: -.2, fire: true });
    assert.deepEqual(clone(b.finale), clone(a.finale)); assert.deepEqual(clone(b.board), clone(a.board));
    assert.equal(b.score, a.score);
  });

  test('legacy cloud MRG snapshot migrates in place without resetting health or score', () => {
    for (let wave = 0; wave < 3; wave++) {
      const e = h.engine(), savedHp = e.finale.mrg.maxHp * [.9, .48, .2][wave];
      e.finale.mrg.hp = savedHp; e.finale.mrg.stage = wave;
      for (const key of Object.keys(e.finale)) if (/^(arena|wave|platform|soldier)/.test(key)) delete e.finale[key];
      e.board.enemies = []; e.board.hp = 47; e.board.pos = [-10, 5, 0]; e.score = 12345;
      const before = clone({ pos: e.board.pos, hp: e.board.hp, score: e.score });
      const snapshot = h.cupPack ? h.cupPack(e) : clone({ finale: e.finale, board: e.board, score: e.score });
      const restored = h.cupUnpack ? h.cupUnpack(snapshot, { seed: e.seed, mode: 'normal' }, () => {}) : h.engine();
      if (!h.cupUnpack) Object.assign(restored, clone(snapshot));
      restored.objective();
      assert.equal(restored.finale.arenaVersion, '1.5.0'); assert.equal(restored.finale.waveIndex, wave);
      assert.equal(restored.board.enemies.length, wave + 2);
      assert.equal(restored.board.enemies[0].name, ['TV', 'BS', 'SH'][wave]);
      assert.equal(restored.board.enemies[0].beard, wave === 2);
      near(restored.finale.mrg.hp, savedHp, 'Legacy boss HP retained');
      assert.deepEqual(clone({ pos: restored.board.pos, hp: restored.board.hp, score: restored.score }), before);
      restored.step(1 / 60, {}); assert(restored.board.pos.every(Number.isFinite));
    }

    const alreadyDefeated = h.engine();
    alreadyDefeated.finale.mrg.hp = 0; alreadyDefeated.finale.defeatTime = 1.5;
    delete alreadyDefeated.finale.arenaVersion;
    alreadyDefeated.objective();
    assert.equal(alreadyDefeated.board.enemies.length, 0, 'A completed legacy battle does not respawn enemies');
    near(alreadyDefeated.finale.defeatTime, 1.5, 'Legacy victory animation time retained');
    runFrames(alreadyDefeated, 1.6); assert.equal(alreadyDefeated.finale.phase, 'upload');
  });

  test('soldiers stay physically supported throughout moving-platform cycles', () => {
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave);
      for (let i = 0; i < 60 * 24; i++) {
        e.step(1 / 60, {});
        for (const soldier of e.board.enemies) {
          const p = e.finale.arenaPlatforms.find(p => p.id === soldier.supportId);
          assert(soldier.pos[0] >= p.lo - .01 && soldier.pos[0] <= p.hi + .01,
            `${soldier.id} x=${soldier.pos[0].toFixed(3)} is outside ${p.id} [${p.lo.toFixed(3)},${p.hi.toFixed(3)}] at ${e.finale.time.toFixed(2)}s`);
          near(soldier.pos[1], p.y, 'Soldier platform height');
        }
      }
    }
  });

  test('existing guide completes all nine soldiers and three waves within 180 seconds', () => {
    const e = h.engine({ assist: true }); e.board.guide = true;
    const transitions = [{ wave: 1, time: 0 }]; let previous = 0, minHp = 100;
    for (let i = 0; i < 60 * 180 && e.finale.phase === 'mrg' && e.status === 'boarding'; i++) {
      e.step(1 / 60, { fire: true, pulse: true, missile: e.finale.open });
      minHp = Math.min(minHp, e.board.hp);
      if (e.finale.waveIndex !== previous) { previous = e.finale.waveIndex; transitions.push({ wave: previous + 1, time: e.finale.time }); }
    }
    const info = { phase: e.finale.phase, status: e.status, seconds: e.elapsed, hp: e.board.hp, minHp,
      soldierKills: e.board.kills, bossHp: e.finale.mrg.hp, transitions };
    assert.equal(e.finale.phase, 'upload', JSON.stringify(info));
    assert.equal(e.board.kills, 9); assert.equal(transitions.length, 3);
    runFrames(e, 8.2); assert.equal(e.status, 'won');
    return info;
  });

  test('normal mode wins with ordinary keyboard inputs and no guide or health overrides', () => {
    const e = h.engine({ assist: false }); let jumpUntil = 0, minHp = 100;
    for (let i = 0; i < 60 * 180 && e.finale.phase === 'mrg' && e.status === 'boarding'; i++) {
      const b = e.board, f = e.finale;
      const nearThreat = b.hostile.some(s => Math.abs(s.pos[0] - b.pos[0]) < 11 && Math.abs(s.pos[1] - b.pos[1] - .5) < 2.8);
      const beam = f.pattern === 2 && f.telegraph > 0 && f.telegraph < .55;
      if (b.grounded && (nearThreat || beam)) jumpUntil = f.time + .4;
      e.step(1 / 60, {
        moveX: Math.max(-1, Math.min(1, (-25 - b.pos[0]) * .7)),
        jump: f.time < jumpUntil, fire: true, pulse: true, missile: f.open,
      });
      minHp = Math.min(minHp, b.hp);
    }
    const info = { phase: e.finale.phase, status: e.status, seconds: e.elapsed, hp: e.board.hp, minHp, soldierKills: e.board.kills, bossHp: e.finale.mrg.hp };
    assert.equal(e.finale.phase, 'upload', JSON.stringify(info));
    assert.equal(e.board.guide, false); assert.equal(e.assist, false); assert.equal(e.board.kills, 9);
    return info;
  });

  if (h.view && options.render) test('actual Canvas renders physical platforms, 3D Cyrillic MRG, named soldiers and SH beard', () => {
    assert.equal(h.view.version, '1.5.0');
    fs.mkdirSync(options.render, { recursive: true });
    const renders = [];
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave); runFrames(e, 2.8);
      for (const [width, height] of [[1280, 720], [390, 460], [592, 244]]) {
        const sceneCanvas = h.createCanvas(width, height), hudCanvas = h.createCanvas(width, height);
        sceneCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
        h.arcade.canvas = sceneCanvas;
        h.context.innerWidth = width; h.context.innerHeight = height;
        const cam = h.camera(e, e.elapsed), before = clone({ board: e.board, finale: e.finale });
        const scene = h.scene(e, e.elapsed, true), state = h.view.status(e);
        assert.equal(state.alive, wave + 2); assert.equal(state.damageMultiplier, 2 ** wave);
        assert.equal(state.bossTitle, 'МРГ');
        assert.equal(state.namedSoldiers[0].name, ['TV', 'BS', 'SH'][wave]);
        assert.equal(state.namedSoldiers[0].beard, wave === 2);
        for (const p of e.finale.arenaPlatforms.filter(p => p.id !== 'floor')) {
          const pieces = scene.filter(item => item.mrgFeature === 'platform' && item.mrgPlatformId === p.id);
          assert.equal(pieces.length, 1, `Exactly one physical surface for ${p.id}`);
          near(pieces[0].pos[0], (p.lo + p.hi) / 2, 'Drawn platform X matches physics');
          near(pieces[0].pos[1] + .45, p.y - 1, 'Drawn platform top matches physics');
          near(pieces[0].mrgSurfaceY, p.y - 1, 'Platform metadata matches physical top');
        }
        const letters = scene.filter(item => item.mrgFeature === 'boss-letter');
        assert.deepEqual([...new Set(letters.map(item => item.mrgGlyph))], ['М', 'Р', 'Г']);
        assert(letters.some(item => item.mesh === 'armor'), 'Sign has extruded solid geometry');
        assert.equal(scene.some(item => item.mrgBeard), wave === 2, 'Only SH has a visible beard mesh');
        for (const soldier of e.board.enemies) assert(scene.some(item => item.mrgSoldierId === soldier.id));
        for (const item of scene) {
          assert(item.pos.every(Number.isFinite)); assert([...item.model].every(Number.isFinite));
        }
        h.draw(sceneCanvas.getContext('2d'), scene, cam, width, height);
        const raw = hudCanvas.getContext('2d'), labels = [];
        const observed = new Proxy(raw, {
          get(target, key) {
            if (key === 'fillText') return (text, x, y, ...rest) => {
              const metrics = target.measureText(String(text)), transform = target.getTransform();
              const scale = Math.abs(transform.a), fontSize = Number(target.font.match(/([\d.]+)px/)?.[1] || 12);
              const labelWidth = metrics.width * scale, labelX = transform.a * x + transform.c * y + transform.e;
              const labelY = transform.b * x + transform.d * y + transform.f;
              const left = labelX - (target.textAlign === 'center' ? labelWidth / 2 : ['right', 'end'].includes(target.textAlign) ? labelWidth : 0);
              labels.push({ text: String(text), left, right: left + labelWidth, top: labelY - fontSize * scale / 2, bottom: labelY + fontSize * scale / 2, font: target.font });
              return target.fillText(text, x, y, ...rest);
            };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
          set(target, key, value) { Reflect.set(target, key, value, target); return true; },
        });
        h.hud(observed, e, cam, width, height);
        assert(labels.some(label => label.text === ['TV', 'BS', 'SH'][wave]), 'Named soldier caption is drawn');
        assert(labels.some(label => label.text.includes('ВОЛНА ' + (wave + 1) + '/3')));
        assert(labels.some(label => label.text.includes('УРОН ×' + 2 ** wave)));
        for (const label of labels) assert(label.left >= -.5 && label.right <= width + .5 && label.top >= -.5 && label.bottom <= height + .5,
          `HUD text clips at ${width}×${height}: ${JSON.stringify(label)}`);
        assert.deepEqual(clone({ board: e.board, finale: e.finale }), before, 'Rendering must not advance gameplay or platforms');
        const composite = h.createCanvas(width, height), finalContext = composite.getContext('2d');
        finalContext.drawImage(sceneCanvas, 0, 0); finalContext.drawImage(hudCanvas, 0, 0);
        const pixels = finalContext.getImageData(0, 0, width, height).data, colors = new Set();
        for (let i = 0; i < pixels.length; i += 64) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        assert(colors.size > 150, 'Actual rendered scene has varied visible geometry');
        const file = `${path.basename(h.corePath, '.js')}-wave-${wave + 1}-${width}x${height}.png`;
        fs.writeFileSync(path.join(options.render, file), composite.toBuffer('image/png'));
        renders.push({ file, wave: wave + 1, width, height, geometry: scene.length, labels: labels.map(label => label.text) });
      }
    }
    return renders;
  });
}

module.exports = { createHarness, parseArgs, nativeCanvas, clone, near, runFrames, inert, bossHit, clearSoldiers, enterWave, main };
if (require.main === module) main();
