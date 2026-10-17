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
    cores: [], patch: path.join(root, 'assets/citadel-mrg-v1.7.0.js'),
    view: path.join(root, 'assets/citadel-mrg-view-v1.7.0.js'),
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
      getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
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
    Engine: RequirementArcade, arcade: ARCADE, state: STATE, vectors: V3, seeded: arcadeSeed,
    scene: spaceScene, camera: spaceCamera, draw: spaceDrawCPU, hud: drawFinaleHUD,
    project: spaceProject, point: spacePoint, meshes: SPACE_MESH,
    input: arcadeInput, boardAim: citadelBoardAim,
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
  if (e.finale.tentacle) Object.assign(e.finale.tentacle, { phase: 'idle', time: 1e6 });
  return e;
}

function bossHit(e, damage = 1e9) {
  e.finale.exposedFor = 100;
  e.finale.open = true;
  e.board.bullets.push({ pos: e.finale.mrg.pos.slice(), vel: [0, 0, 0], life: 1, damage });
  e.step(1 / 60, {});
}

function clearSoldiers(e) {
  for (const enemy of e.board.enemies) { enemy.hp = 0; enemy.dead = true; enemy.state = 'dead'; }
}

function enterWave(e, wave) {
  for (let attempt = 0; e.finale.waveIndex < wave && attempt < 60 * 45; attempt++) { clearSoldiers(e); bossHit(e); }
  assert.equal(e.finale.waveIndex, wave, `Enter wave ${wave + 1}`);
  return e;
}

// A test operator issuing only the game's real input fields. It does not alter
// health, ammo, cooldowns, AI, boss state, or wave state. Aiming is external to
// the game: the separate pointer/input regression proves that these aim points
// are reachable through the actual mouse projection and arcadeInput path.
function createMrgController() {
  let jumpUntil = 0;
  return function control(e) {
    const b = e.board, f = e.finale;
    if (!b || f?.phase !== 'mrg') return {};
    const soldiers = b.enemies.filter(enemy => !enemy.dead && enemy.hp > 0 && (!enemy.emergeDelay || enemy.emergeDelay <= 0));
    const target = soldiers.slice().sort((a, z) => {
      const danger = enemy => Math.hypot(enemy.pos[0] - b.pos[0], enemy.pos[1] - b.pos[1]) - (enemy.role === 'knife' ? 2 : 0);
      return danger(a) - danger(z);
    })[0];
    const threat = b.hostile.some(shot => {
      const dx = shot.pos[0] - b.pos[0], dy = shot.pos[1] - b.pos[1] - .55;
      return Math.abs(dx) < (shot.kind === 'rocket' ? 14 : 11) && Math.abs(dy) < 3 && dx * shot.vel[0] <= 0;
    });
    const knife = soldiers.find(enemy => enemy.role === 'knife' && Math.abs(enemy.pos[0] - b.pos[0]) < 5 && Math.abs(enemy.pos[1] - b.pos[1]) < 3);
    const beam = f.pattern === 2 && f.telegraph > 0 && f.telegraph < .55;
    if (b.grounded && (threat || knife || beam)) jumpUntil = f.time + .4;
    const imminent = b.hostile.some(shot => Math.hypot(shot.pos[0] - b.pos[0], shot.pos[1] - b.pos[1] - .55) < (shot.kind === 'rocket' ? 6 : 3)) ||
      !!(knife && ['windup', 'strike'].includes(knife.knifePhase) && b.pos[1] - knife.pos[1] < 1.8);
    const retreat = ['telegraph', 'active'].includes(f.tentacle?.phase);
    const zone = f.tentacle?.safeZone;
    const curvedRetreat = retreat && f.tentacle.kind !== 'sweep';
    const desired = retreat && zone ? (zone.minX + zone.maxX) / 2 : -28 + Math.sin(f.time * .75) * 1.7;
    let aim = f.mrg.pos.slice();
    if (target) {
      const travel = Math.min(.65, Math.hypot(target.pos[0] - b.pos[0], target.pos[1] - b.pos[1]) / 65);
      const vx = Number(target.vx) || 0, vy = Number(target.vy) || 0;
      aim = [target.pos[0] + vx * travel, target.pos[1] + .65, 0];
      if (!target.grounded && target.state !== 'emerging') aim[1] = Math.max(1.65, aim[1] + vy * travel - 16 * travel * travel);
    }
    return {
      moveX: Math.max(-1, Math.min(1, (desired - b.pos[0]) * .8)),
      moveZ: curvedRetreat && b.grounded && b.pos[1] > 1.1 ? 1 : 0,
      jump: !curvedRetreat && f.time < jumpUntil, fire: true, aim,
      pulse: imminent && b.invulnerable <= .05,
      missile: e.player.missiles > 0 && (target ? target.grounded && target.hp >= 100 : f.open),
    };
  };
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
    const source = file => fs.existsSync(file) ? { file: path.basename(file), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') } : null;
    const result = { core: path.basename(corePath), version: e.finale.arenaVersion || 'baseline',
      sources: { core: source(corePath), mechanics: options.smoke ? null : source(options.patch), view: options.smoke ? null : source(options.view) }, tests: [] };
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
  assert.equal(h.api?.version, '1.7.0');
  function test(name, fn) {
    if (options.only && !name.includes(options.only)) return;
    try { const data = fn(); result.tests.push({ name, ok: true, ...(data === undefined ? {} : { data }) }); }
    catch (error) { result.tests.push({ name, ok: false, error: error.message, stack: error.stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3) }); }
  }
  const plain = { weapons: 0, armor: 0, rockets: 0 };
  const fresh = (wave = 0, settings = {}) => inert(enterWave(inert(h.engine(settings)), wave));
  const live = e => e.board.enemies.filter(enemy => !enemy.dead && enemy.hp > 0);
  const open = e => { e.finale.exposedFor = 100; e.finale.open = true; return e; };
  function targetFixture(e, position = [-17, 1, 0]) {
    const enemy = e.board.enemies[0];
    e.board.enemies = [enemy];
    Object.assign(enemy, { pos: position.slice(), previous: position.slice(), state: 'emerging', spawnTime: 100, emergeDelay: 100, vx: 0, vy: 0 });
    return enemy;
  }

  test('wave HP still doubles, the lighter roster is 3/4/6, and role variety with TV/BS/SH remains', () => {
    assert.deepEqual(clone(h.api.waves.map(w => w.soldiers)), [3, 4, 6]);
    assert.deepEqual(clone(h.api.waves.map(w => w.batchSizes)), [[3], [3, 1], [3, 3]]);
    assert.deepEqual(clone(h.api.waves.map(w => w.damageMultiplier)), [1, 2, 4]);
    for (const assist of [false, true]) for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave, { assist }), f = e.finale, expectedHp = (assist ? 116 : 144) * 2 ** wave;
      const spec = h.api.waves[wave];
      assert.equal(f.arenaVersion, '1.7.0');
      assert.equal(f.totalBatches, spec.batches); assert.equal(f.spawnedBatches, 1);
      assert.equal(f.waveSoldiersTotal, spec.soldiers); assert.equal(f.pendingSoldiers, spec.soldiers - 3);
      assert.equal(f.waveDamageMultiplier, 2 ** wave); assert.equal(f.batchIndex, 0);
      assert.equal(e.board.enemies.length, 3);
      runFrames(e, (spec.batches - 1) * 7 + .1);
      assert.equal(f.pendingSoldiers, 0); assert.equal(f.spawnedBatches, spec.batches);
      assert.equal(e.board.enemies.length, spec.soldiers);
      for (let batch = 0; batch < spec.batches; batch++) {
        const enemies = e.board.enemies.filter(enemy => enemy.batchIndex === batch);
        assert.deepEqual(clone(enemies.map(enemy => enemy.role)), ['jumper', 'knife', 'rocketeer'].slice(0, spec.batchSizes[batch]));
        for (const enemy of enemies) { near(enemy.maxHp, expectedHp, 'Soldier maximum HP'); near(enemy.hp, expectedHp, 'Undamaged soldier HP'); }
      }
      assert.equal(e.board.enemies.filter(enemy => enemy.name).length, 1);
      assert.equal(e.board.enemies[0].name, ['TV', 'BS', 'SH'][wave]);
      assert.equal(e.board.enemies[0].beard, wave === 2);
    }
  });

  test('soldiers emerge sequentially from MRG and later batches stay queued for seven seconds', () => {
    const e = fresh(2), f = e.finale;
    assert.equal(f.pendingSoldiers, 3); assert.equal(e.board.enemies.length, 3);
    assert(e.board.enemies.every(enemy => enemy.state === 'emerging' && enemy.pos[0] >= 17 && enemy.pos[0] <= 20));
    const delays = e.board.enemies.map(enemy => enemy.emergeDelay);
    assert(delays[0] < delays[1] && delays[1] < delays[2]);
    runFrames(e, .25);
    assert(e.board.enemies[0].pos[0] < e.board.enemies[2].pos[0], 'The first soldier leaves before the last');
    runFrames(e, 6.5); assert.equal(e.board.enemies.length, 3);
    runFrames(e, .35); assert.equal(e.board.enemies.length, 6); assert.equal(f.pendingSoldiers, 0);
    assert(e.board.enemies.slice(3).every(enemy => enemy.state === 'emerging'));
    runFrames(e, 7.1); assert.equal(e.board.enemies.length, 6); assert.equal(f.pendingSoldiers, 0);
  });

  test('HP gates require current enemies and all queued batches; projectile floods cannot skip waves', () => {
    const e = fresh(1), f = e.finale, m = f.mrg;
    bossHit(e); near(m.hp, m.maxHp / 3, 'Second-wave HP boundary');
    assert.equal(f.waveIndex, 1); clearSoldiers(e); e.step(1 / 60, {});
    assert.equal(f.waveIndex, 1, 'Unspawned batch blocks the gate'); assert.equal(f.pendingSoldiers, 1);
    runFrames(e, 7.1); assert.equal(f.waveIndex, 1); assert.equal(live(e).length, 1);
    clearSoldiers(e); e.step(1 / 60, {}); assert.equal(f.waveIndex, 2);
    assert.equal(f.pendingSoldiers, 3); assert.equal(live(e).length, 3);
    const flood = fresh(); clearSoldiers(flood); open(flood);
    for (let i = 0; i < 50; i++) flood.board.bullets.push({ pos: flood.finale.mrg.pos.slice(), vel: [0, 0, 0], life: 1, damage: 1e9 });
    flood.step(1 / 60, {});
    assert.equal(flood.finale.waveIndex, 1);
    near(flood.finale.mrg.hp, flood.finale.mrg.maxHp * 2 / 3, 'Damage does not spill into a new wave');
    assert.equal(flood.board.bullets.length, 0);
  });

  test('final queued soldiers prevent defeat/upload; a completed battle awards only once', () => {
    const e = fresh(2); bossHit(e); clearSoldiers(e); runFrames(e, .1);
    assert.equal(e.finale.mrg.hp, 0); assert.equal(e.finale.pendingSoldiers, 3);
    assert.equal(e.finale.defeatTime, 0); assert.equal(e.finale.phase, 'mrg'); assert.equal(e.beginUpload(), false);
    runFrames(e, 7.1); assert.equal(e.finale.pendingSoldiers, 0); assert.equal(live(e).length, 3);
    assert.equal(e.finale.defeatTime, 0); assert.equal(e.beginUpload(), false);
    clearSoldiers(e); e.step(1 / 60, {}); assert(e.finale.defeatTime > 2.9);
    const score = e.score; runFrames(e, 3.1); assert.equal(e.finale.phase, 'upload'); assert.equal(e.score, score + 7000);
    assert.equal(e.beginUpload(), false); assert.equal(e.score, score + 7000);
    runFrames(e, 8.1); assert.equal(e.status, 'won');
    const checkpoint = fresh(), before = checkpoint.score;
    assert.equal(checkpoint.beginUpload(false), true); assert.equal(checkpoint.score, before);
    checkpoint.retryFinale(); assert.equal(checkpoint.finale.phase, 'upload'); assert.equal(checkpoint.score, before);
  });

  test('default fire and grenades stay horizontal in the facing direction, including guide mode', () => {
    for (const facing of [-1, 1]) for (const guide of [false, true]) {
      const e = fresh(); e.board.facing = facing; e.board.guide = guide;
      // Keep the guide at its desired position so it does not deliberately turn.
      if (guide) e.board.pos[0] = -15 + Math.sin((e.finale.time + 1 / 60) * .62) * 9;
      for (const enemy of e.board.enemies) enemy.pos = [facing === 1 ? -30 : 10, 12, 0];
      e.step(1 / 60, { fire: true, missile: true });
      assert.equal(e.board.manualAim, false);
      assert.equal(e.board.bullets.length, 2);
      for (const shot of e.board.bullets) {
        assert.equal(Math.sign(shot.vel[0]), facing);
        near(shot.vel[1], 0, 'No vertical autoaim'); near(shot.vel[2], 0, 'Side-view trajectory');
        assert(!Object.hasOwn(shot, 'targetId'), 'Projectile has no selected target');
      }
    }
  });

  test('real pointer projection and arcadeInput produce an oblique manual shot through Z=0', () => {
    const e = fresh();
    const rect = { left: 11, top: 19, width: 640, height: 360 };
    h.arcade.canvas = { width: 1280, height: 720, getBoundingClientRect: () => rect };
    const camera = h.camera(e, e.elapsed), target = [-7, 13, 0], screen = h.project(target, camera, 1280, 720);
    const aimed = h.boardAim(rect.left + screen.x / 2, rect.top + screen.y / 2, h.arcade.canvas, camera);
    target.forEach((v, i) => near(aimed[i], v, 'Pointer projects into the actual arena plane', 1e-5));
    h.arcade.boardAim = aimed; h.arcade.firePointer = 77;
    const input = h.input(); assert(input.fire); assert(input.aim);
    e.step(1 / 60, input);
    assert.equal(e.board.manualAim, true); assert(e.board.aimDir[1] > .3);
    assert(e.board.bullets[0].vel[1] > 20);
    near(h.vectors.len(e.board.aimDir), 1, 'Manual aim is a unit vector');
    h.arcade.firePointer = null; h.arcade.boardAim = null;
  });

  test('aimed empty space stays empty: no snap, target selection or homing after firing', () => {
    const a = fresh(), b = fresh(), aim = [-10, 17, 0];
    const ea = targetFixture(a, [-17, 1, 0]), eb = targetFixture(b, [-3, 8, 0]);
    const hpA = ea.hp, hpB = eb.hp;
    a.step(1 / 60, { fire: true, missile: true, aim });
    b.step(1 / 60, { fire: true, missile: true, aim });
    assert.deepEqual(clone(a.board.aimDir), clone(b.board.aimDir));
    assert.deepEqual(clone(a.board.bullets.map(shot => shot.vel)), clone(b.board.bullets.map(shot => shot.vel)));
    const velocities = a.board.bullets.map(shot => clone(shot.vel));
    runFrames(a, .5); runFrames(b, .5);
    assert.equal(ea.hp, hpA); assert.equal(eb.hp, hpB);
    a.board.bullets.forEach((shot, i) => assert.deepEqual(clone(shot.vel), velocities[i], 'Velocity is not retargeted in flight'));
  });

  test('real straight bullets kill on the firing line and miss targets above it; FX remain wired', () => {
    const e = fresh(), enemy = targetFixture(e, [-17, 1, 0]);
    runFrames(e, 2, { fire: true });
    assert(enemy.dead); assert.equal(e.board.kills, 1);
    assert(e.qaEvents.some(event => event.kind === 'shot'));
    assert(e.qaEvents.some(event => event.kind === 'destroy' && event.data === enemy.id));
    const missed = fresh(), high = targetFixture(missed, [-17, 8, 0]), hp = high.hp;
    runFrames(missed, 2, { fire: true }); assert.equal(high.hp, hp, 'Horizontal fire cannot follow a high enemy');
    runFrames(missed, 2, { fire: true, aim: [-17, 8.65, 0] }); assert(high.dead, 'Explicit manual aim can hit the high enemy');
    const grenade = fresh(), target = targetFixture(grenade, [-17, 1, 0]);
    grenade.step(1 / 60, { missile: true }); runFrames(grenade, .5);
    assert(target.dead); assert(grenade.qaEvents.some(event => event.kind === 'missile'));
    assert(grenade.qaEvents.some(event => event.kind === 'destroy' && event.data === 'grenade'));
  });

  test('damage remains multiplied once by wave, with independent assist/armor reductions', () => {
    const damage = [];
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave, { upgrades: plain }), b = e.board, f = e.finale;
      clearSoldiers(e); // Future batches cannot arrive during these single-frame samples.
      for (const [kind, base] of [['fan', 10], ['floor', 16], ['beam', 22], ['contact', 18]]) {
        Object.assign(b, { hp: 100, invulnerable: 0, pos: [-25, 1, 0], previous: [-25, 1, 0], vy: 0, grounded: true, knockbackX: 0 });
        b.hostile = []; f.beamTime = 0; f.attackClock = 100; f.exposedFor = 100;
        if (kind === 'beam') { f.beamTime = .38; f.aimY = 1.5; }
        else if (kind === 'contact') b.pos[0] = h.api.bossBounds().minX;
        else b.hostile.push({ pos: [-25, 1.5, 0], vel: [0, 0, 0], life: 1, damage: base, r: .4, source: 'boss', wave: kind === 'floor' });
        e.step(1 / 60, {}); near(100 - b.hp, base * 2 ** wave, `${kind} wave ${wave + 1}`);
        damage.push({ wave: wave + 1, kind, damage: 100 - b.hp });
      }
    }
    for (const assist of [false, true]) for (const armor of [0, 1, 2]) {
      const e = fresh(2, { assist, upgrades: { ...plain, armor } });
      e.board.invulnerable = 0; e.mrgDamage(10, 'soldier');
      near(100 - e.board.hp, 40 * (assist ? .5 : 1) * .8 ** armor, 'Assist and armor modifiers');
    }
    return damage;
  });

  function roleFixture(e, role, position) {
    const enemy = e.board.enemies.find(enemy => enemy.role === role);
    for (const other of e.board.enemies) if (other !== enemy) { other.hp = 0; other.dead = true; other.state = 'dead'; }
    Object.assign(enemy, { pos: position.slice(), previous: position.slice(), state: 'active', spawnTime: 0, emergeDelay: 0,
      grounded: true, supportId: 'floor', vx: 0, vy: 0, cooldown: 0, jumpCooldown: 0, knifePhase: 'idle', rocketPhase: 'idle' });
    e.finale.waveIntro = 0; e.finale.batchTimer = 1e6;
    return enemy;
  }

  test('jumper has real airborne motion and bolts; knife chases and telegraphs a timed physical strike', () => {
    const jumperGame = fresh(), jumper = roleFixture(jumperGame, 'jumper', [-10, 1, 0]);
    const states = new Set(), shots = new Set(); let top = 1, rise = 0, fall = 0;
    runFrames(jumperGame, 5, e => {
      states.add(jumper.jumpPhase); top = Math.max(top, jumper.pos[1]); rise = Math.max(rise, jumper.vy); fall = Math.min(fall, jumper.vy);
      e.board.hostile.forEach(shot => shots.add(shot.kind)); return {};
    });
    assert(top > 5 && rise > 15 && fall < -5, 'Jumper follows an actual ballistic jump');
    assert(states.has('rising') && states.has('falling') && states.has('grounded'));
    assert(shots.has('bolt')); assert(!shots.has('rocket'));

    const knifeGame = fresh(0, { upgrades: plain }), knife = roleFixture(knifeGame, 'knife', [-15, 1, 0]);
    knifeGame.board.invulnerable = 0;
    runFrames(knifeGame, 1); assert(knife.pos[0] < -19, 'Knife closes the distance on foot');
    for (let i = 0; i < 300 && knife.knifePhase !== 'windup'; i++) knifeGame.step(1 / 60, {});
    assert.equal(knife.knifePhase, 'windup'); assert.equal(knifeGame.board.hp, 100);
    assert(Array.isArray(knife.knifeFrom) && Array.isArray(knife.knifeTo));
    runFrames(knifeGame, .45); assert.equal(knifeGame.board.hp, 100, 'Windup is harmless');
    for (let i = 0; i < 30 && knife.knifePhase !== 'strike'; i++) knifeGame.step(1 / 60, {});
    assert.equal(knife.knifePhase, 'strike'); near(knifeGame.board.hp, 86, 'Actual knife segment hit');
    runFrames(knifeGame, .15); near(knifeGame.board.hp, 86, 'A strike hits only once');
    runFrames(knifeGame, .15); assert.equal(knife.knifePhase, 'recover');
    assert(!knifeGame.board.hostile.some(shot => shot.kind === 'bolt' || shot.kind === 'rocket'), 'Knife does not reuse ranged AI');
    return { jumperMaxY: top, phases: [...states], knifeDamage: 14 };
  });

  test('rocketeer locks a visible aim, launches a straight rocket and creates a real splash blast', () => {
    const e = fresh(0, { upgrades: plain }), rocketeer = roleFixture(e, 'rocketeer', [-9, 1, 0]);
    e.step(1 / 60, {}); assert.equal(rocketeer.rocketPhase, 'aim');
    const locked = clone(rocketeer.rocketTarget);
    e.board.pos[0] = -28;
    for (let i = 0; i < 80 && !e.board.hostile.some(shot => shot.kind === 'rocket'); i++) e.step(1 / 60, {});
    const rocket = e.board.hostile.find(shot => shot.kind === 'rocket');
    assert(rocket); assert.deepEqual(clone(rocket.target), locked, 'Rocket uses its telegraphed target');
    assert.equal(rocket.blastRadius, 3.2); assert(rocket.trail.length > 0);
    const velocity = clone(rocket.vel); e.board.pos = [-31, 1, 0]; runFrames(e, .4);
    assert.deepEqual(clone(rocket.vel), velocity, 'Enemy rocket does not home after launch');
    assert(e.qaEvents.some(event => event.kind === 'missile'));

    const damage = [];
    for (let wave = 0; wave < 3; wave++) {
      const game = fresh(wave, { upgrades: plain }); clearSoldiers(game);
      game.board.invulnerable = 0;
      const shot = { pos: [game.board.pos[0] + 3, 1.55, 0], vel: [0, 0, 0], life: .001, r: .42, damage: 16,
        kind: 'rocket', source: 'rocket', blastRadius: 3.2, color: '#ffd294', travelled: 0, travelLimit: 1, trail: [] };
      game.board.hostile = [shot]; game.step(1 / 60, {});
      near(100 - game.board.hp, 16 * 2 ** wave, 'Splash damage scales once');
      assert(shot.exploded); assert.equal(game.finale.rocketBlasts.length, 1);
      assert(game.qaEvents.some(event => event.kind === 'destroy' && event.data === 'rocket'));
      const hp = game.board.hp; runFrames(game, .3); near(game.board.hp, hp, 'Blast is not repeatedly damaging');
      runFrames(game, .3); assert.equal(game.finale.rocketBlasts.length, 0);
      damage.push({ wave: wave + 1, damage: 100 - hp });
    }
    return damage;
  });

  test('tentacle warning gives enough time to retreat from the right side and only active phase damages', () => {
    const e = fresh(0, { upgrades: plain }); clearSoldiers(e);
    const f = e.finale, b = e.board, t = f.tentacle;
    f.waveIntro = 0; t.phase = 'idle'; t.time = .001;
    b.pos = [12, 1, 0]; b.invulnerable = 0; e.step(1 / 60, {});
    assert.equal(t.phase, 'telegraph'); near(t.time, 5.2, 'Long warning duration');
    assert(t.segments.length >= 4 && t.segments.every(segment => segment.from[0] - segment.to[0] >= 40));
    const escapeTime = (b.pos[0] - t.safeX + 1) / 10;
    assert(t.time > escapeTime + .5, 'Warning exceeds the full running distance with margin');
    runFrames(e, 1); assert.equal(b.hp, 100, 'Danger region is harmless during telegraph');
    for (let i = 0; i < 360 && t.phase === 'telegraph'; i++) e.step(1 / 60, { moveX: -1 });
    assert.equal(t.phase, 'active'); assert(b.pos[0] <= t.safeX, 'Right-side player reaches the far-left refuge');
    assert.equal(b.hp, 100);
    runFrames(e, 2.3, { moveX: -1 }); assert.equal(b.hp, 100, 'Far-left refuge remains safe during active sweep');

    for (let wave = 0; wave < 3; wave++) {
      const game = fresh(wave, { upgrades: plain }); clearSoldiers(game); game.finale.waveIntro = 0;
      for (const phase of ['telegraph', 'active', 'retract']) {
        for (const [x, y] of [[-23.9, 1], [-10, 12], [10, 1]]) {
          Object.assign(game.finale.tentacle, { phase, time: 2, duration: 2.5 });
          Object.assign(game.board, { hp: 100, invulnerable: 0, pos: [x, y, 0], previous: [x, y, 0], vy: 0, grounded: y === 1, knockbackX: 0 });
          game.step(1 / 60, {});
          near(100 - game.board.hp, phase === 'active' ? 18 * 2 ** wave : 0, `${phase} tentacle hit at ${x},${y}`);
        }
      }
    }
    return { warningSeconds: 5.2, escapeSeconds: escapeTime, safeX: t.safeX };
  });

  test('all three tentacle patterns rotate periodically and pause freezes warning and active collisions', () => {
    const e = fresh(); clearSoldiers(e); e.finale.waveIntro = 0;
    Object.assign(e.finale.tentacle, { phase: 'idle', time: .001, duration: 9 });
    e.board.pos = [-28, 1, 0];
    const warnings = [], kinds = []; let previous = 'idle';
    runFrames(e, 44, game => {
      const current = game.finale.tentacle.phase;
      if (current === 'telegraph' && previous !== current) { warnings.push(game.finale.time); kinds.push(game.finale.tentacle.kind); }
      previous = current; return {};
    });
    assert.deepEqual(kinds, ['sweep', 'crown', 'pincer', 'sweep']);
    for (let i = 1; i < warnings.length; i++) near(warnings[i] - warnings[i - 1], 14, 'Repeating tentacle cycle', .12);
    for (const phase of ['telegraph', 'active']) {
      Object.assign(e.finale.tentacle, { kind: 'sweep', phase, time: 1.25, duration: phase === 'active' ? 2.5 : 5.2 });
      e.board.pos = [0, 1, 0]; e.pause();
      const before = clone({ board: e.board, finale: e.finale, elapsed: e.elapsed });
      runFrames(e, 2, { fire: true, moveX: 1 });
      assert.deepEqual(clone({ board: e.board, finale: e.finale, elapsed: e.elapsed }), before);
      e.resume(); e.board.invulnerable = 0; const hp = e.board.hp; e.step(1 / 60, {});
      near(hp - e.board.hp, phase === 'active' ? 18 * .8 : 0, 'Damage resumes only in active phase');
    }
    return { warningTimes: warnings, patterns: kinds };
  });

  function preparePattern(e, kind) {
    clearSoldiers(e); e.finale.batchTimer = 1e6; e.finale.waveIntro = 0;
    const index = h.api.tentaclePatterns.findIndex(pattern => pattern.id === kind);
    assert(index >= 0);
    Object.assign(e.finale.tentacle, { phase: 'idle', time: .001, cycle: (index + 2) % 3 });
    e.step(1 / 60, {});
    assert.equal(e.finale.tentacle.kind, kind);
    assert.equal(e.finale.tentacle.phase, 'telegraph');
    return e.finale.tentacle;
  }

  test('curved tentacles damage their actual bends only when active; green corridors and other gaps stay safe', () => {
    const checks = [];
    for (const kind of ['crown', 'pincer']) for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave, { upgrades: plain }), t = preparePattern(e, kind), b = e.board;
      for (const phase of ['telegraph', 'active', 'retract']) {
        Object.assign(t, { phase, time: phase === 'retract' ? .7 : 2, duration: phase === 'telegraph' ? 5.2 : phase === 'active' ? 2.5 : .7 });
        const geometry = h.api.tentacleGeometry(e), limb = geometry[0], point = limb.points[16];
        assert(point[0] >= -32 && point[0] < 12 && point[1] > 2 && point[1] < 22, 'Physical test point is reachable in the arena');
        Object.assign(b, { hp: 100, invulnerable: 0, pos: [point[0], point[1] - .55, 0], previous: [point[0], point[1] - .55, 0], vy: 0, grounded: false, knockbackX: 0 });
        e.step(1 / 60, {});
        near(100 - b.hp, phase === 'active' ? 18 * 2 ** wave : 0, `${kind} ${phase} sampled-curve collision`);
      }
      const zone = t.safeZone;
      for (const x of [zone.minX + 1, (zone.minX + zone.maxX) / 2, zone.maxX - 1, kind === 'crown' ? -6 : 0]) {
        Object.assign(t, { phase: 'active', time: 2.5, duration: 2.5 });
        Object.assign(b, { hp: 100, invulnerable: 0, pos: [x, 1, 0], previous: [x, 1, 0], vy: 0, grounded: true, supportId: 'floor', knockbackX: 0 });
        runFrames(e, 2.45);
        near(b.hp, 100, `${kind} safe floor at ${x}; no hidden rectangular damage region`);
      }
      checks.push({ kind, wave: wave + 1, damage: 18 * 2 ** wave, safeZone: clone(zone) });
    }
    return checks;
  });

  test('each curved warning allows a ground retreat from the right edge; bending geometry is finite and JSON safe', () => {
    for (const kind of ['crown', 'pincer']) {
      const e = fresh(), t = preparePattern(e, kind), b = e.board;
      b.pos = [12, 1, 0]; b.previous = b.pos.slice(); b.invulnerable = 0;
      const goal = (t.safeZone.minX + t.safeZone.maxX) / 2;
      const before = JSON.stringify({ board: b, finale: e.finale });
      const preview = clone(h.api.tentacleGeometry(e));
      assert.equal(JSON.stringify({ board: b, finale: e.finale }), before, 'Geometry query is read only');
      for (const limb of preview) {
        assert.equal(limb.points.length, 25); assert.equal(limb.radii.length, 25);
        assert(limb.points.every(point => point.length === 3 && point.every(Number.isFinite)));
        assert(limb.radii.every(radius => Number.isFinite(radius) && radius > 0));
      }
      while (t.phase === 'telegraph') e.step(1 / 60, { moveX: Math.max(-1, Math.min(1, (goal - b.pos[0]) * .8)), moveZ: b.grounded && b.pos[1] > 1.1 ? 1 : 0 });
      assert(b.pos[0] > t.safeZone.minX && b.pos[0] < t.safeZone.maxX && b.pos[1] <= t.safeZone.maxY, 'Reach the visibly marked corridor before impact');
      assert.equal(b.hp, 100);
      for (const phase of ['active', 'retract']) for (const fraction of [0, .5, 1]) {
        Object.assign(t, { phase, duration: phase === 'active' ? 2.5 : .7 }); t.time = t.duration * fraction;
        for (const limb of h.api.tentacleGeometry(e)) {
          assert(limb.points.flat().every(Number.isFinite)); assert(limb.radii.every(radius => Number.isFinite(radius) && radius > 0));
        }
      }
    }
  });

  test('moving platforms still carry in X/Y, detach on jump/drop and reset with batches on retry', () => {
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave); clearSoldiers(e); e.finale.batchTimer = 1e6; runFrames(e, 2);
      const p = e.finale.arenaPlatforms.find(p => p.id === 'left'), floor = clone(e.finale.arenaPlatforms[0]);
      Object.assign(e.board, { pos: [(p.lo + p.hi) / 2, p.y, 0], vy: 0, grounded: true, supportId: p.id, knockbackX: 0 });
      const offset = e.board.pos[0] - p.lo;
      for (let i = 0; i < 60; i++) { e.step(1 / 60, {}); near(e.board.pos[0] - p.lo, offset, 'Horizontal carry'); near(e.board.pos[1], p.y, 'Vertical carry'); assert(e.board.grounded); }
      near(e.finale.arenaPlatforms[0].lo, floor.lo, 'Static floor X'); near(e.finale.arenaPlatforms[0].y, floor.y, 'Static floor height');
      e.step(1 / 60, { jump: true }); const x = e.board.pos[0]; runFrames(e, .15, { jump: true });
      assert(!e.board.grounded); near(e.board.pos[0], x, 'Airborne player stops following the platform');
      Object.assign(e.board, { pos: [(p.lo + p.hi) / 2, p.y, 0], vy: 0, grounded: true, supportId: p.id, jumpHeld: false });
      e.step(1 / 60, { moveZ: 1 }); runFrames(e, .25, { moveZ: 1 }); assert(e.board.pos[1] < p.y - .2);
      e.status = 'lost'; e.retryFinale();
      assert.equal(e.finale.waveIndex, 0); assert.equal(e.finale.pendingSoldiers, 0); assert.equal(e.finale.spawnedBatches, 1);
      assert.equal(e.board.enemies.length, 3); assert(e.board.enemies.every(enemy => enemy.state === 'emerging' && enemy.hp === enemy.maxHp));
      assert.equal(e.finale.tentacle.phase, 'idle'); assert.equal(e.finale.tentacle.time, 9);
      assert.equal(e.board.manualAim, false); assert.equal(e.board.grenadeCooldown, 0); assert.equal(e.board.dropTimer, 0);
      assert.equal(e.board.bullets.length + e.board.hostile.length + e.finale.rocketBlasts.length, 0);
      assert.equal(e.board.hp, 100); assert.deepEqual(clone(e.board.pos), [-25, 1, 0]);
    }
  });

  function roundtrip(e) {
    if (h.cupPack && h.cupUnpack) return h.cupUnpack(h.cupPack(e), { seed: e.seed, mode: e.assist ? 'calm' : 'normal' }, () => {});
    const restored = h.engine({ assist: e.assist, upgrades: e.upgrades, seed: e.seed });
    for (const key of ['board', 'finale', 'player', 'elapsed', 'score', 'totalKills', 'phase', 'status', 'resumeStatus']) if (e[key] !== undefined) restored[key] = clone(e[key]);
    // Old lab cores do not expose PRNG snapshots. Arena 1.7 has no random AI;
    // compare the complete arena continuation, while the public checkpoint
    // path above additionally exercises its real serialized PRNG state.
    if (typeof e.random.getState === 'function') restored.random = h.seeded(e.random.getState());
    return restored;
  }

  test('current JSON preserves pending batches, AI timers, rockets, manual aim and deterministic continuation', () => {
    const a = fresh(2); runFrames(a, 3.3); a.step(1 / 60, { aim: [-6, 12, 0], fire: true });
    const t = a.finale.tentacle, pattern = h.api.tentaclePatterns.find(pattern => pattern.id === 'pincer');
    Object.assign(t, { phase: 'telegraph', kind: pattern.id, paths: clone(pattern.paths), safeZone: clone(pattern.safeZone), time: 3.2, duration: 5.2 });
    a.board.enemies[0].hp -= 37; a.board.enemies[1].knifePhase = 'windup'; a.board.enemies[1].knifeTime = .3;
    const b = roundtrip(a);
    assert.deepEqual(clone(b.finale), clone(a.finale)); assert.deepEqual(clone(b.board), clone(a.board));
    assert.equal(b.finale.pendingSoldiers, 3);
    const input = { moveX: -.3, aim: [-8, 6, 0], fire: true };
    runFrames(a, 1, input); runFrames(b, 1, input);
    assert.deepEqual(clone(b.finale), clone(a.finale)); assert.deepEqual(clone(b.board), clone(a.board));
    assert.equal(b.score, a.score);
  });

  test('1.5 checkpoints retain health fractions, dead soldiers, position and score while adding required new batches', () => {
    const oldPath = options.patch.replace('v1.7.0.js', 'v1.5.0.js');
    assert(fs.existsSync(oldPath), 'Previous public gameplay module is available for genuine legacy fixtures');
    const old = createHarness(h.corePath, oldPath);
    for (let wave = 0; wave < 3; wave++) {
      const prior = inert(enterWave(inert(old.engine()), wave));
      prior.finale.mrg.hp -= 12; prior.board.hp = 47; prior.score = 31415; prior.board.pos = [-10, 5, 0];
      prior.board.enemies[0].hp = prior.board.enemies[0].maxHp * .4;
      prior.board.enemies[1].hp = 0; prior.board.enemies[1].dead = true;
      const count = prior.board.enemies.length, hp = prior.finale.mrg.hp, p = clone(prior.board.enemies[0].pos);
      let restored;
      if (old.cupPack && h.cupUnpack) restored = h.cupUnpack(old.cupPack(prior), { seed: prior.seed, mode: 'normal' }, () => {});
      else { restored = h.engine(); Object.assign(restored, clone({ board: prior.board, finale: prior.finale, player: prior.player, score: prior.score })); }
      restored.objective();
      assert.equal(restored.finale.arenaVersion, '1.7.0'); assert.equal(restored.finale.waveIndex, wave);
      near(restored.finale.mrg.hp, hp, 'Legacy boss HP retained'); assert.equal(restored.board.hp, 47); assert.equal(restored.score, 31415);
      assert.deepEqual(clone(restored.board.pos), [-10, 5, 0]); assert.deepEqual(clone(restored.board.enemies[0].pos), p);
      near(restored.board.enemies[0].hp, 144 * 2 ** wave * .4, 'Live soldier retains its HP fraction');
      assert(restored.board.enemies[1].dead && restored.board.enemies[1].hp === 0);
      const spawned = Math.ceil(count / 3), spec = h.api.waves[wave];
      assert.equal(restored.finale.spawnedBatches, spawned); assert.equal(restored.finale.pendingSoldiers, spec.batchSizes.slice(spawned).reduce((sum, size) => sum + size, 0));
      assert.equal(restored.board.enemies[0].name, ['TV', 'BS', 'SH'][wave]); assert.equal(restored.board.enemies[0].beard, wave === 2);
      restored.step(1 / 60, {}); assert(restored.board.pos.every(Number.isFinite));
    }
  });

  test('1.6 checkpoints reduce the roster without losing completed kills from removed tail slots or awarding again', () => {
    const oldPath = options.patch.replace('v1.7.0.js', 'v1.6.0.js');
    assert(fs.existsSync(oldPath), 'Previous gameplay module supplies authentic serialized fixtures');
    const old = createHarness(h.corePath, oldPath);
    const cases = [];
    for (const wave of [1, 2]) {
      const prior = inert(enterWave(inert(old.engine()), wave));
      runFrames(prior, wave * 7 + .1);
      const spec = h.api.waves[wave];
      assert.equal(prior.board.enemies.length, (wave + 1) * 3);
      prior.board.hp = 47; prior.score = 31415; prior.board.kills = 37; prior.totalKills = 51;
      prior.player.missiles = 6; prior.board.pos = [-10, 5, 0]; prior.finale.mrg.hp -= 12;
      prior.board.enemies[0].hp = prior.board.enemies[0].maxHp * .4;
      const livePosition = clone(prior.board.enemies[0].pos);
      for (const enemy of prior.board.enemies.slice(spec.soldiers)) { enemy.hp = 0; enemy.dead = true; enemy.state = 'dead'; }
      const dead = prior.board.enemies.filter(enemy => enemy.dead).length, bossHp = prior.finale.mrg.hp;
      assert(dead > 0 && prior.board.enemies.slice(0, spec.soldiers).every(enemy => !enemy.dead), 'All saved kills are in slots removed by the smaller roster');
      let restored;
      if (old.cupPack && h.cupUnpack) restored = h.cupUnpack(old.cupPack(prior), { seed: prior.seed, mode: 'normal' }, () => {});
      else { restored = h.engine(); Object.assign(restored, clone({ board: prior.board, finale: prior.finale, player: prior.player, score: prior.score, totalKills: prior.totalKills })); }
      restored.objective();
      assert.equal(restored.finale.arenaVersion, '1.7.0'); assert.equal(restored.finale.waveIndex, wave);
      assert.equal(restored.board.enemies.length, spec.soldiers); assert.equal(restored.finale.pendingSoldiers, 0);
      assert.equal(restored.board.enemies.filter(enemy => enemy.dead).length, Math.min(dead, spec.soldiers), 'Already completed kills survive shrinking the roster');
      const wounded = restored.board.enemies.find(enemy => !enemy.dead && Math.abs(enemy.hp / enemy.maxHp - .4) < 1e-7);
      assert(wounded, 'Retain a surviving wounded soldier rather than resetting all live health');
      assert.deepEqual(clone(wounded.pos), livePosition);
      assert.deepEqual(clone(restored.board.pos), [-10, 5, 0]); near(restored.board.hp, 47, 'Player HP'); near(restored.finale.mrg.hp, bossHp, 'Boss HP');
      assert.equal(restored.score, 31415); assert.equal(restored.board.kills, 37); assert.equal(restored.totalKills, 51); assert.equal(restored.player.missiles, 6);
      assert.equal(restored.board.enemies.filter(enemy => enemy.name).length, 1);
      assert.equal(restored.board.enemies[0].name, ['TV', 'BS', 'SH'][wave]); assert.equal(restored.board.enemies[0].beard, wave === 2);
      assert.equal(restored.beginUpload(), false, 'Migration cannot bypass unfinished boss health');
      const again = JSON.stringify({ board: restored.board, finale: restored.finale, score: restored.score }); restored.objective();
      assert.equal(JSON.stringify({ board: restored.board, finale: restored.finale, score: restored.score }), again, 'Migration is idempotent');
      cases.push({ wave: wave + 1, before: prior.board.enemies.length, after: spec.soldiers, savedDead: dead });
    }
    return cases;
  });

  test('real manual-input operator wins normal and calm with all thirteen soldiers and no health/resource cheats', () => {
    const runs = [];
    for (const assist of [false, true]) {
      const e = h.engine({ assist }), control = createMrgController(); let minHp = 100;
      const transitions = [{ wave: 1, time: 0 }];
      assert.equal(e.board.guide, false); assert.deepEqual(clone(e.upgrades), { weapons: 2, armor: 1, rockets: 0 });
      for (let i = 0; i < 60 * 180 && e.status === 'boarding' && e.finale.phase === 'mrg'; i++) {
        e.step(1 / 60, control(e)); minHp = Math.min(minHp, e.board.hp);
        if (transitions.at(-1).wave !== e.finale.waveIndex + 1) transitions.push({ wave: e.finale.waveIndex + 1, time: e.elapsed });
      }
      const info = { assist, phase: e.finale.phase, status: e.status, seconds: e.elapsed, hp: e.board.hp, minHp,
        kills: e.board.kills, bossHp: e.finale.mrg.hp, pendingSoldiers: e.finale.pendingSoldiers, transitions };
      assert.equal(e.finale.phase, 'upload', JSON.stringify(info)); assert.equal(e.board.kills, 13);
      assert.equal(e.finale.pendingSoldiers, 0); assert.equal(transitions.length, 3); assert.equal(e.board.guide, false);
      runFrames(e, 8.2); assert.equal(e.status, 'won'); runs.push(info);
    }
    return runs;
  });

  if (h.view) test('scene uses clean physical slabs, distinct roles, named soldiers and actual danger geometry even with FX off', () => {
    assert.equal(h.view.version, '1.7.0');
    for (let wave = 0; wave < 3; wave++) {
      const e = fresh(wave); runFrames(e, 3.2);
      for (const fx of [false, true]) {
        const before = JSON.stringify({ board: e.board, finale: e.finale });
        const scene = h.scene(e, e.elapsed, fx), slabs = scene.filter(item => item.mrgFeature === 'platform');
        assert.equal(slabs.length, 3); assert.equal(scene.filter(item => item.mrgFeature === 'platform-edge').length, 3);
        assert(scene.some(item => item.mrgFeature === 'boss-organic'), 'The living boss body is present');
        assert(!scene.some(item => item.mrgFeature === 'platform-detail'), 'Old platform arrows/supports are absent');
        for (const item of scene) { assert(item.pos.every(Number.isFinite)); assert(Array.from(item.model).every(Number.isFinite)); }
        for (const slab of slabs) {
          const p = e.finale.arenaPlatforms.find(p => p.id === slab.mrgPlatformId);
          near(slab.pos[0], (p.lo + p.hi) / 2, 'Rendered platform center follows physics');
          near(slab.pos[1] + slab.model[5], p.y - 1, 'Rendered platform surface follows physics', 1e-5);
          near(slab.mrgSurfaceY, p.y - 1, 'Surface metadata');
        }
        const glyphs = [...new Set(scene.filter(item => item.mrgFeature === 'boss-letter').map(item => item.mrgGlyph))];
        assert.deepEqual(glyphs, ['М', 'Р', 'Г']);
        const bodies = scene.filter(item => item.mrgFeature === 'boss-letter' && item.mesh === 'armor');
        assert(bodies.every(item => Math.abs(item.model[6]) >= .4), 'Boss letters have real depth');
        assert.deepEqual([...new Set(scene.filter(item => item.mrgFeature === 'soldier').map(item => item.mrgRole))], ['jumper', 'knife', 'rocketeer']);
        assert.equal(scene.some(item => item.mrgBeard), wave === 2);
        const named = h.view.status(e).namedSoldiers;
        assert.equal(named.length, 1); assert.equal(named[0].name, ['TV', 'BS', 'SH'][wave]);
        assert.equal(JSON.stringify({ board: e.board, finale: e.finale }), before, 'Rendering preserves physical state');
      }
    }
    const emerging = fresh();
    assert(h.scene(emerging, emerging.elapsed, false).some(item => item.mrgFeature === 'spawn-hatch' && item.mrgOpen));
    const e = fresh(2); runFrames(e, 3.2);
    const knife = e.board.enemies.find(enemy => enemy.role === 'knife');
    Object.assign(knife, { knifePhase: 'strike', knifeTime: .11, knifeDuration: .22,
      knifeFrom: [knife.pos[0], knife.pos[1] + .65, 0], knifeTo: [knife.pos[0] - 2.7, knife.pos[1] + .65, 0] });
    e.board.hostile.push({ kind: 'rocket', pos: [-2, 4, 0], vel: [-15, -1, 0], blastRadius: 3.2, ownerId: 'qa', life: 2 });
    e.finale.rocketBlasts.push({ pos: [-12, 3, 0], radius: 3.2, life: .35, maxLife: .5 });
    for (const phase of ['telegraph', 'active']) {
      Object.assign(e.finale.tentacle, { phase, time: phase === 'telegraph' ? 4.2 : 2, duration: phase === 'telegraph' ? 5.2 : 2.5 });
      const scene = h.scene(e, e.elapsed, false), kind = phase === 'telegraph' ? 'tentacle-telegraph' : 'tentacle';
      const tentacles = scene.filter(item => item.mrgFeature === kind);
      assert.equal(new Set(tentacles.map(item => item.mrgSegment)).size, e.finale.tentacle.segments.length);
      for (const item of tentacles) {
        const physical = e.finale.tentacle.segments[item.mrgSegment];
        assert.deepEqual(clone(item.mrgFrom), clone(physical.from)); assert.deepEqual(clone(item.mrgTo), clone(physical.to));
        near(item.mrgRadius, physical.radius, 'Physical tentacle radius');
      }
      assert(scene.some(item => item.mrgFeature === 'safe-zone' && item.mrgSafeX === -24));
      assert(scene.some(item => item.mrgFeature === 'knife-blade'));
      assert(scene.some(item => item.mrgFeature === 'knife-threat' && JSON.stringify(item.mrgTo) === JSON.stringify(knife.knifeTo)));
      assert(scene.some(item => item.mrgFeature === 'rocket' && item.mrgPosition[0] === -2));
      assert(scene.some(item => item.mrgFeature === 'rocket-blast' && item.mrgRadius === 3.2));
    }
  });

  if (h.view) test('all sampled tentacle curves exactly match rendered segments, radii and safe zones in every phase with FX on or off', () => {
    for (const kind of ['sweep', 'crown', 'pincer']) {
      const e = fresh(2), t = preparePattern(e, kind);
      for (const phase of ['telegraph', 'active', 'retract']) {
        const duration = phase === 'telegraph' ? 5.2 : phase === 'active' ? 2.5 : .7;
        Object.assign(t, { phase, duration, time: duration * .6 });
        const before = JSON.stringify({ board: e.board, finale: e.finale });
        const geometry = h.api.tentacleGeometry(e);
        for (const fx of [false, true]) {
          const scene = h.scene(e, e.elapsed, fx);
          const feature = phase === 'telegraph' ? 'tentacle-telegraph' : 'tentacle';
          const pieces = scene.filter(item => item.mrgFeature === feature);
          assert(pieces.length > 0); assert(pieces.every(item => item.mrgKind === kind));
          assert.equal(new Set(pieces.map(item => item.mrgSegment)).size, kind === 'sweep' ? 6 : geometry.length);
          for (const item of scene) { assert(item.pos.every(Number.isFinite)); assert(Array.from(item.model).every(Number.isFinite)); }
          const zones = scene.filter(item => item.mrgFeature === 'safe-zone');
          assert(zones.length > 0); for (const zone of zones) assert.deepEqual(clone(zone.mrgSafeZone), clone(t.safeZone));
          if (kind === 'sweep') for (const piece of pieces) {
            const physical = t.segments[piece.mrgSegment];
            assert.deepEqual(clone(piece.mrgFrom), clone(physical.from));
            if (phase === 'retract') {
              // The retained straight attack no longer damages while its visual
              // branches withdraw along the original horizontal segments.
              assert(piece.mrgTo[0] > physical.to[0] && piece.mrgTo[0] < physical.from[0]);
              assert.deepEqual(clone(piece.mrgTo.slice(1)), clone(physical.to.slice(1)));
            } else assert.deepEqual(clone(piece.mrgTo), clone(physical.to));
            near(piece.mrgRadius, physical.radius, 'Original straight segment radius');
          }
          else {
            assert(!scene.some(item => item.mrgFeature === 'tentacle-warning-area'), 'Curved warning has no unrelated rectangle');
            for (const piece of pieces) {
              const limb = geometry.find(limb => limb.id === piece.mrgSegment), index = piece.mrgPointIndex;
              assert(Number.isInteger(index) && index >= 0 && index + 1 < limb.points.length);
              assert.deepEqual(clone(piece.mrgFrom), clone(limb.points[index]));
              assert.deepEqual(clone(piece.mrgTo), clone(limb.points[index + 1]));
              assert.deepEqual(clone(piece.mrgRadii), clone([limb.radii[index], limb.radii[index + 1]]));
              near(piece.mrgRadius, Math.max(limb.radii[index], limb.radii[index + 1]), 'Visible radius matches collision radius');
            }
          }
          assert.equal(JSON.stringify({ board: e.board, finale: e.finale }), before, 'Renderer never advances or rewrites physics');
        }
      }
    }
  });

  if (options.render && h.view) test('native Canvas composites keep health, batches and named soldiers visible at desktop, portrait and short sizes', () => {
    fs.mkdirSync(options.render, { recursive: true });
    const frames = [];
    function render(e, state, width, height) {
      const canvas = h.createCanvas(width, height), hud = h.createCanvas(width, height), raw = hud.getContext('2d'), texts = [];
      h.arcade.engine = e; h.arcade.canvas = canvas;
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
      const wrapped = new Proxy(raw, {
        get(target, key) {
          if (key === 'fillText') return (text, x, y, ...args) => {
            const metrics = target.measureText(String(text)), m = target.getTransform();
            const size = Number(target.font.match(/([\d.]+)px/)?.[1]) || 12;
            const cx = m.a * x + m.c * y + m.e, cy = m.b * x + m.d * y + m.f, w = metrics.width * Math.abs(m.a);
            const left = cx - (target.textAlign === 'center' ? w / 2 : ['right', 'end'].includes(target.textAlign) ? w : 0);
            texts.push({ text: String(text), left, right: left + w, top: cy - size * Math.abs(m.d) / 2, bottom: cy + size * Math.abs(m.d) / 2 });
            return target.fillText(text, x, y, ...args);
          };
          const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, key, value) { return Reflect.set(target, key, value, target); },
      });
      const before = JSON.stringify({ board: e.board, finale: e.finale }), cam = h.camera(e, e.elapsed);
      h.draw(canvas.getContext('2d'), h.scene(e, e.elapsed, false), cam, width, height);
      h.hud(wrapped, e, cam, width, height);
      assert.equal(JSON.stringify({ board: e.board, finale: e.finale }), before, 'Actual native render preserves physics');
      const health = texts.find(text => text.text.startsWith('ЗДОРОВЬЕ '));
      assert(health && health.top >= 0 && health.bottom < 35, 'Health is fully visible in the first row');
      assert.equal(health.text, 'ЗДОРОВЬЕ ' + Math.ceil(e.board.hp) + '%');
      assert(texts.some(text => text.text.includes('ПАЧКИ ') && text.text.includes('ЖИВЫ ') && text.text.includes('ЖДУТ ')));
      for (const label of texts) assert(label.left >= -.5 && label.right <= width + .5 && label.top >= -.5 && label.bottom <= height + .5,
        `HUD label clips at ${width}×${height}: ${JSON.stringify(label)}`);
      assert(texts.some(text => text.text === ['TV', 'BS', 'SH'][e.finale.waveIndex]));
      // The game has separate scene/HUD canvases; drawFinaleHUD clears its surface.
      canvas.getContext('2d').drawImage(hud, 0, 0);
      const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data, colors = new Set();
      for (let i = 0; i < pixels.length; i += 52) colors.add(pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2]);
      assert(colors.size > 150, 'Native projection rendered actual detailed geometry');
      const filename = `${path.basename(h.corePath, '.js')}-${state}-${width}x${height}.png`;
      fs.writeFileSync(path.join(options.render, filename), canvas.toBuffer('image/png'));
      frames.push({ filename, width, height, health: health.text, healthTop: health.top, healthBottom: health.bottom, textCount: texts.length });
    }
    render(fresh(), 'emerging', 592, 244);
    const second = fresh(1); runFrames(second, 3.2); render(second, 'roles', 1280, 720);
    const third = fresh(2); runFrames(third, 3.2); third.board.hp = 43;
    Object.assign(third.finale.tentacle, { phase: 'telegraph', duration: 5.2, time: 4.2 });
    render(third, 'warning', 592, 244);
    Object.assign(third.finale.tentacle, { phase: 'active', duration: 2.5, time: 2 });
    for (const [width, height] of [[1280, 720], [390, 460], [592, 244]]) render(third, 'tentacles', width, height);
    for (const [kind, width, height] of [['crown', 390, 460], ['pincer', 592, 244]]) {
      const pattern = h.api.tentaclePatterns.find(pattern => pattern.id === kind);
      Object.assign(third.finale.tentacle, { kind, title: pattern.title, hint: pattern.hint, paths: clone(pattern.paths), safeZone: clone(pattern.safeZone), phase: 'active', duration: 2.5, time: 2 });
      render(third, kind, width, height);
    }
    return frames;
  });
}

module.exports = { createHarness, parseArgs, nativeCanvas, clone, near, runFrames, inert, bossHit, clearSoldiers, enterWave, createMrgController, main };
if (require.main === module) main();
