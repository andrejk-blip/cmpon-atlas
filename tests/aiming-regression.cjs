#!/usr/bin/env node
'use strict';
// Real flight/convoy weapon methods in both shipping cores. Constant-velocity
// fixtures isolate leading; actual convoy AI is exercised separately below.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');
const patch = path.join(root, 'assets/citadel-aim-v1.7.1.js');
const cores = process.argv.slice(2).length ? process.argv.slice(2).map(file => path.resolve(file)) : [path.join(root, 'assets/atlas-v1.3.5.js')];
const copy = value => JSON.parse(JSON.stringify(value));
const near = (a, b, message, epsilon = 1e-7) => assert(Math.abs(a - b) < epsilon, `${message}: ${a} vs ${b}`);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));

function flight(h) {
  const e = new h.Engine(417147, () => {}); e.beginStage(0); e.launch();
  Object.assign(e, { phase: 'battle', autopilot: false, navMode: 'objective', wave: 1, waveSpawned: 0, waveClock: 0,
    spawnClock: 1e6, enemies: [], bullets: [], hostile: [], asteroids: [], pickups: [], lessonQueue: [], stationHp: 100 });
  Object.assign(e.player, { pos: [0, 0, 0], yaw: 0, pitch: 0, bank: 0, speed: 0, invulnerable: 1e6, shotCooldown: 0, missileCooldown: 0 });
  e.station.pos = [800, 0, 0]; e.hullCache = null;
  // Remove only unrelated mission progression, spawns and lesson cards.
  e.checkStage = () => {}; e.openNextLesson = () => {}; e.spawnEnemy = () => {};
  h.arcade.engine = e; return e;
}
function enemy(id, pos, extra = {}) {
  return { id, pos: pos.slice(), vel: [0, 0, 0], hp: 1000, maxHp: 1000, r: 3.6,
    type: 'hunter', role: 'fighter', speed: 15, points: 100, age: 0, shot: 1000,
    hit: 0, phase: 0, warp: 0, dead: false, name: `Test ${id}`, ...extra };
}
function frames(e, seconds, input = { cruiseSpeed: 0 }) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) e.step(1 / 120, typeof input === 'function' ? input(e, i) : input);
}
function nearest(shot, target) {
  const r = target.pos.map((v, i) => v - shot.pos[i]), v = target.vel.map((n, i) => n - shot.vel[i]);
  const time = Math.max(0, Math.min(shot.life, -dot(r, v) / dot(v, v)));
  return { time, distance: Math.hypot(...r.map((n, i) => n + v[i] * time)) };
}
function convoy(h, index = 12) {
  const e = flight(h); e.status = 'stageclear'; e.upgradeChoice = 'weapons'; e.beginEscort(); e.launch();
  e.autopilot = false; e.escort.wave = 4; e.escort.spawnQueue = [];
  e.escort.definition = { ...e.escort.definition, duration: 1e6 };
  for (const ally of e.escort.allies) ally.shot = 1e6;
  e.spawnEscortEnemy(index); e.enemies[0].shot = 1e6;
  e.player.invulnerable = 1e6; return e;
}

function verify(core) {
  const h = createHarness(core, path.join(root, 'assets/citadel-mrg-v1.7.0.js'), null);
  vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context, { filename: path.basename(patch) });
  const api = h.context.CITADEL_AIM, groups = [];
  function check(name, fn) { const details = fn(); groups.push({ name, passed: true, ...(details ? { details } : {}) }); }

  check('Tab selection, HUD lock, lasers and missiles agree', () => {
    const e = flight(h), chosen = enemy(1, [-10, 0, -100]), centered = enemy(2, [0, 0, -100]);
    e.enemies = [chosen, centered]; e.selectedTarget = 1;
    assert.equal(e.navTarget().id, 1); assert.equal(e.target().id, 1); assert.equal(e.lock, 1);
    assert(e.fire()); for (const shot of e.bullets) near(nearest(shot, chosen).distance, 0, 'selected laser trajectory');
    assert(e.missile()); assert.equal(e.bullets.at(-1).target, 1); assert.equal(e.lock, 1);
    // A selected objective may remain behind the player for navigation; weapons
    // fall back to the other visible ship and never fire backwards toward it.
    chosen.pos = [0, 0, 100]; assert.equal(e.target().id, 2); assert.equal(e.selectedTarget, 1);
  });
  check('Solid Citadel and asteroid block lock without consuming a missile', () => {
    const e = flight(h); e.station.pos = [0, 0, -100]; e.enemies = [enemy(1, [0, 0, -200])];
    const before = e.player.missiles;
    assert.equal(e.target(), null); assert.equal(e.lock, null); assert.equal(e.missile(), false); assert.equal(e.player.missiles, before);
    e.station.pos = [800, 0, 0]; e.hullCache = null; e.enemies[0].pos = [0, 0, -100];
    e.asteroids = [{ pos: [0, 0, -50], r: 10, phase: 0, variant: 0 }];
    assert.equal(e.target(), null); assert.equal(e.missile(), false); assert.equal(e.player.missiles, before);
    e.asteroids = []; assert.equal(e.target().id, 1);
  });
  check('Blocked selected objective keeps navigation while weapon picks a clear ship', () => {
    const e = flight(h); e.enemies = [enemy(1, [0, 0, -100]), enemy(2, [28, 0, -90])]; e.selectedTarget = 1;
    e.asteroids = [{ pos: [0, 0, -50], r: 7, phase: 0, variant: 0 }];
    assert.equal(e.navTarget().id, 1); assert.equal(e.target().id, 2); assert.equal(e.lock, 2); assert.equal(e.selectedTarget, 1);
    e.asteroids = []; assert.equal(e.target().id, 1);
  });
  check('Warp, invulnerability and destroyed targets never capture weapons', () => {
    const e = flight(h); const arriving = enemy(1, [0, 0, -60], { warp: 1.6 }), live = enemy(2, [10, 0, -60]);
    e.enemies = [arriving, live]; e.selectedTarget = 1;
    e.enemyStep = dt => { for (const target of e.enemies) target.warp = Math.max(0, target.warp - dt); };
    assert.equal(e.target().id, 2); assert(e.missile()); assert.equal(e.bullets[0].target, 2);
    frames(e, 1); near(arriving.hp, 1000, 'warp target HP'); assert(live.hp < 1000, 'rocket must reach visible target');
    arriving.warp = 0; arriving.invulnerable = .5; assert.equal(e.target().id, 2);
    arriving.invulnerable = 0; arriving.dead = true; assert.equal(e.target().id, 2);
    live.dead = true; assert.equal(e.target(), null); assert.equal(e.lock, null);
  });
  check('One visible lock cone also controls laser correction', () => {
    const e = flight(h); const target = enemy(1, [30, 0, -100]); e.enemies = [target]; e.enemyStep = () => {};
    assert.equal(e.target().id, 1); e.fire(); for (const shot of e.bullets) near(nearest(shot, target).distance, 0, 'wide-cone shot');
    frames(e, 1.5); assert(target.hp < 1000, 'gold-lock shot must hit a stationary visible target');
  });
  check('Orbit and convoy solve actual flight time from each weapon muzzle', () => {
    const observations = [];
    for (const phase of ['battle', 'escort']) for (const range of [40, 150, 220]) for (const velocity of [[24, 0, 0], [0, 18, -15], [-19, -8, 12]]) {
      const e = phase === 'escort' ? convoy(h) : flight(h);
      const target = enemy(1, [0, 0, -range], { vel: velocity }); e.enemies = [target]; e.selectedTarget = 1;
      e.fire(); assert.equal(e.bullets.length, 2);
      for (const shot of e.bullets) { const result = nearest(shot, target); assert(result.distance < 1e-6, 'constant velocity intercept'); assert(result.time <= shot.life); near(Math.hypot(...shot.vel), 210, 'laser speed'); }
      if (range === 150 && velocity[0] === 24) observations.push({ phase, range, miss: e.bullets.map(shot => nearest(shot, target).distance) });
    }
    return observations;
  });
  check('Moving orbit target is hit by the actual projectile integrator', () => {
    const e = flight(h), target = enemy(1, [0, 0, -150], { vel: [24, 0, 0] }); e.enemies = [target];
    e.enemyStep = dt => { target.pos = target.pos.map((value, i) => value + target.vel[i] * dt); };
    e.fire(); frames(e, 1.1); assert(target.hp < 1000); assert.equal(e.hits, 2);
  });
  check('Actual convoy AI receives weapon hits and refreshes lock without firing', () => {
    const e = convoy(h); const target = e.enemies[0];
    frames(e, 2); assert.equal(e.lock, target.id); const hp = target.hp;
    frames(e, 7, { fire: true }); assert(target.hp < hp || target.dead, 'autocorrection must hit moving convoy ship');
    const hits = e.hits; target.dead = true; frames(e, 1 / 120); assert.equal(e.lock, null);
    return { hits, shots: e.shots, remainingHP: target.hp };
  });
  check('Behind, distant and unreachable ships cannot produce an impossible lock', () => {
    const e = convoy(h); const target = enemy(1, [0, 0, 50]); e.enemies = [target]; e.selectedTarget = 1;
    assert.equal(e.target(), null); e.fire(); assert(e.bullets.every(shot => shot.vel[2] < 0));
    target.pos = [0, 0, -300]; assert.equal(e.target(), null);
    target.pos = [0, 0, -150]; target.vel = [0, 0, -300]; const ammo = e.player.missiles;
    assert.equal(e.target(), null); assert.equal(e.missile(), false); assert.equal(e.player.missiles, ammo);
    assert.equal(api.intercept([0, 0, 0], [0, 0, -150], [0, 0, -210], 210, 1.7), null);
    assert.equal(api.intercept([0, 0, 0], [0, 0, -150], [NaN, 0, 0], 210, 1.7), null);
    assert.equal(api.intercept([0, 0, 0], [0, 0, -800], [0, 0, 0], 210, 1.7), null);
    assert(api.intercept([0, 0, 0], [0, 0, -150], [0, 0, 210], 210, 1.7));
  });
  check('Missile lifetime, cooldown, ammunition and upgrades remain intact', () => {
    const e = flight(h), target = enemy(1, [0, 0, -100]); e.enemies = [target]; e.enemyStep = () => {};
    e.upgrades.rockets = 2; const ammo = e.player.missiles; assert(e.missile());
    const shot = e.bullets[0]; near(shot.life, 7, 'missile lifetime'); near(shot.damage, 160, 'rocket upgrade'); assert.equal(shot.target, 1);
    assert.equal(e.player.missiles, ammo - 1); assert.equal(e.missile(), false); assert.equal(e.player.missiles, ammo - 1);
    frames(e, 1.5); near(target.hp, 840, 'guided missile damage'); assert.equal(e.bullets.length, 0);
    const vanished = flight(h), gone = enemy(2, [0, 0, -100]); vanished.enemies = [gone]; vanished.enemyStep = () => {};
    assert(vanished.missile()); gone.dead = true; frames(vanished, 7.1);
    assert.equal(vanished.bullets.length, 0); assert.equal(vanished.hits, 0); assert.equal(vanished.target(), null);
  });
  check('Parallax supports stay targetable before the central core', () => {
    const e = flight(h); e.beginFinale(); e.launchFinale(); e.autopilot = false;
    e.selectedTarget = e.boss.id; const target = e.target(); assert(target.core); assert.notEqual(target.id, e.boss.id);
    e.enemies.forEach(target => { target.dead = true; }); assert.equal(e.target().id, e.boss.id);
    e.player.pos = [0, 0, 1000]; assert.equal(e.target(), null);
  });
  check('Pause neither shoots nor spends ammunition', () => {
    const e = flight(h); e.enemies = [enemy(1, [0, 0, -100])]; e.pause();
    const ammo = e.player.missiles, shots = e.shots; assert.equal(e.target(), null); assert.equal(e.fire(), false); assert.equal(e.missile(), false);
    frames(e, 1, { fire: true, missile: true }); assert.equal(e.player.missiles, ammo); assert.equal(e.shots, shots); e.resume(); assert.equal(e.target().id, 1);
  });
  check('MRG remains manual for facing, pointer aim and grenades', () => {
    const e = h.engine(); e.board.facing = -1; e.step(1 / 60, { fire: true });
    assert.equal(e.target(), null); assert.equal(e.lock, null); assert.equal(e.board.manualAim, false); assert(e.board.bullets[0].vel[0] < 0);
    e.board.cooldown = 0; e.board.bullets = []; const aim = [e.board.pos[0] - 10, e.board.pos[1] + 10, 0];
    e.step(1 / 60, { aim, fire: true, missile: true }); assert.equal(e.board.manualAim, true); assert(e.board.bullets.every(shot => shot.vel[0] < 0 && shot.vel[1] > 0));
    assert(e.board.bullets.some(shot => shot.grenade));
  });
  check('Repeated addon loading is idempotent', () => {
    const e = flight(h); e.enemies = [enemy(1, [0, 0, -100])]; const fire = e.fire;
    vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context); assert.equal(e.fire, fire); e.fire(); assert.equal(e.shots, 1); assert.equal(e.bullets.length, 2);
  });
  return { core: path.basename(core), sha256: crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex'), passed: groups.length, groups };
}
const report = { version: '1.7.1', method: 'Actual shipped cores in Node VM, mathematical intercept and real projectile/convoy integration; no browser or production storage',
  addon_sha256: crypto.createHash('sha256').update(fs.readFileSync(patch)).digest('hex'), results: cores.map(verify) };
console.log(JSON.stringify(report, null, 2));
