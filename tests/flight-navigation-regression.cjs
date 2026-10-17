#!/usr/bin/env node
'use strict';
// Real campaign cores, deterministic flight integration; no browser or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHarness, clone } = require('./mrg-regression.cjs');

const ROOT = path.resolve(__dirname, '..');
const PATCH = path.join(ROOT, 'assets/citadel-flight-v1.7.1.js');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
const near = (a, b, label, epsilon = 1e-8) => assert(distance(a, b) < epsilon, label);

function harness(core, patched = true) {
  const h = createHarness(core, patched ? PATCH : null, null);
  vm.runInContext('globalThis.flightQa={hull:citadelHullHit,exterior:citadelStationExterior,oldShip:CitadelStationBase.prototype.dockShip}', h.context);
  return Object.assign(h, h.context.flightQa, { api: h.context.CITADEL_FLIGHT });
}
function fresh(h, { seed = 417147, stage = 0, pos = [0, 0, 0], yaw = 0, pitch = 0, assist = false } = {}) {
  const events = [];
  const e = new h.Engine(seed, (kind, data) => events.push({ kind, data }));
  h.arcade.engine = e;
  e.assist = assist;
  e.beginStage(stage);
  e.status = 'playing'; e.phase = 'dock'; e.autopilot = true;
  e.pickups.forEach(item => { item.dead = true; });
  e.rescued = e.modules().map(item => item.reqId);
  e.enemies = []; e.hostile = [];
  Object.assign(e.player, { pos: pos.slice(), yaw, pitch, speed: 15, invulnerable: 0 });
  return { e, events };
}
function fly(e, seconds = 60) {
  let frames = 0;
  for (; frames < seconds * 60 && e.status === 'playing'; frames++) e.step(1 / 60, {});
  return frames / 60;
}
function restore(h, e) {
  if (h.cupPack && h.cupUnpack) {
    const snapshot = clone(h.cupPack(e));
    return h.cupUnpack(snapshot, { seed: e.seed, mode: e.assist ? 'calm' : 'normal' }, () => {});
  }
  const resumed = new h.Engine(e.seed, () => {});
  Object.assign(resumed, clone(e));
  return resumed;
}

function run(core) {
  const h = harness(core), unpatched = harness(core, false), groups = [];
  function test(name, fn) { const detail = fn(); groups.push({ name, status: 'passed', ...(detail ? { detail } : {}) }); }

  test('Gate and public navigation target are on the visible iris; approach remains outside the hull', () => {
    const { e } = fresh(h);
    near(h.api.gate(e), e.station.pos.map((v, i) => v + [0, 0, -25][i]), 'Gate on rendered iris plane');
    near(e.navTarget().pos, h.api.gate(e), 'HUD target equals gate');
    near(e.dockPoint(), h.api.gate(e), 'Interaction target equals gate');
    assert.equal(h.hull(e, h.api.approach(e), h.api.approach(e), 3.2), null);
    const before = clone(h.api.navigationTarget(e));
    e.guidance({});
    assert.deepEqual(clone(h.api.navigationTarget(e)), before, 'Planner does not move the external target');
    assert(Object.isFrozen(h.api) && Object.isFrozen(h.api.gate(e)) && Object.isFrozen(h.api.navigationTarget(e)));
    return { gate: clone(h.api.gate(e)), approach: clone(h.api.approach(e)), oldGateOffsetMetres: 93 };
  });

  test('Actual autopilot reaches all four station entrances from front, back, sides, above and below', () => {
    const starts = [
      ['spawn', [0, 0, 0], 0], ['last_requirement', [36, -8, -180], 0],
      ['at_visible_gate', [78, 13, -100], Math.PI], ['front', [78, 13, -350], Math.PI],
      ['rear', [78, 13, 50], 0], ['above', [78, 100, -55], 0], ['below', [78, -75, -55], 0],
      ['left', [-60, 12, -55], Math.PI / 2], ['right', [220, 12, -55], -Math.PI / 2],
    ];
    const results = [];
    for (const stage of [0, 1, 2, 3]) for (const seed of [417147, 42, 91873]) for (const [name, pos, yaw] of starts) {
      const { e } = fresh(h, { stage, seed, pos, yaw });
      const seconds = fly(e);
      assert.equal(e.status, 'docking', `${name}, stage ${stage + 1}, seed ${seed} reaches entrance`);
      assert.equal(e.dock.flightVersion, '1.7.1');
      assert.equal(e.collisionCount || 0, 0, `${name} has no hull collision`);
      assert.equal(e.player.hp, 100, `${name}, stage ${stage + 1}, seed ${seed}, ${path.basename(core)} takes no transit damage`);
      assert(e.player.pos[2] < e.station.pos[2] - 30, `${name} captures in front of the iris`);
      results.push({ stage: stage + 1, seed, start: name, seconds });
    }
    return { runs: results.length, longestSeconds: Math.max(...results.map(x => x.seconds)), results };
  });

  test('A ship already at the entrance docks immediately without flying away', () => {
    const { e } = fresh(h, { pos: [78, 13, -100], yaw: Math.PI });
    const start = e.player.pos.slice();
    e.step(1 / 60, {});
    assert.equal(e.status, 'docking');
    assert(e.player.pos[2] >= start[2], 'No backwards movement toward the obsolete staging point');
    assert(distance(e.player.pos, start) < .1, 'No teleport at capture');
    return { before: start, afterFirstFrame: clone(e.player.pos) };
  });

  test('Three seeded rocks near the gate cannot occupy the chosen approach point', () => {
    const results = [];
    for (const [seed, stage] of [[39, 2], [59, 2], [87, 3]]) {
      for (const [start, pos, yaw] of [['spawn', [0, 0, 0], 0], ['front', [78, 13, -350], Math.PI]]) {
        const { e } = fresh(h, { seed, stage, pos, yaw });
        const approach = h.api.approach(e);
        assert(e.asteroids.every(a => distance(a.pos, approach) >= a.r + 8), 'Chosen approach has a clear navigation margin');
        const seconds = fly(e, 30);
        assert.equal(e.status, 'docking', `Seed ${seed} reaches the gate from ${start}`);
        assert.equal(e.player.hp, 100); assert.equal(e.collisionCount || 0, 0);
        results.push({ seed, stage: stage + 1, start, approach: clone(approach), seconds });
      }
    }
    return { runs: results.length, results };
  });

  test('Reproduced rock-detour standstill clears for retrieval and combat without bypassing collisions', () => {
    const start = [113.11412652064415, 3.602830226910806, -101.9222417068973];
    const results = [];
    for (const phase of ['retrieve', 'battle']) {
      function blocked(owner) {
        const { e } = fresh(owner, { seed: 417147, stage: 3, pos: start, yaw: -.5496819516691596, pitch: .01702258798266687 });
        e.phase = phase; e.player.speed = 0;
        let target;
        if (phase === 'retrieve') {
          target = e.modules()[0]; target.dead = false; target.pos = [78, 13, -100];
          e.rescued = e.rescued.filter(id => id !== target.reqId);
        } else {
          e.wave = 1; e.waveSpawned = e.waveTotal();
          target = { id: 666, type: 'scout', role: 'fighter', pos: [60, 13, -100], vel: [0, 0, 0], speed: 0,
            hp: 100, maxHp: 100, r: 3.2, age: 0, shot: 1e9, hit: 0, phase: 0, dead: false, warp: 0, name: 'Stationary test threat' };
          e.enemies = [target]; e.selectedTarget = target.id;
        }
        return { e, target };
      }
      const original = blocked(unpatched);
      for (let i = 0; i < 60 * 8; i++) original.e.step(1 / 60, {});
      const originalFailure = (original.e.status === 'playing' && !original.target.dead && original.e.player.speed < .001) || original.e.player.hp < 100;
      // The newer public core brakes forever on this exact ray. The old admin
      // core may pass it; its unsafe approach is covered by the full right-side
      // docking case above, so do not invent an identical failure for both.
      if (path.basename(core) === 'atlas-v1.3.5.js') assert(originalFailure, 'Original public guidance stalls at the rock');
      const after = blocked(h);
      for (let i = 0; i < 60 * 20 && after.e.status === 'playing'; i++) after.e.step(1 / 60, {});
      assert(distance(after.e.player.pos, start) > 10, 'Recovery leaves the deadlock');
      assert.equal(after.e.collisionCount || 0, 0); assert.equal(after.e.player.hp, 100);
      if (phase === 'retrieve') {
        assert(after.target.dead, 'Requirement is actually collected'); assert.equal(after.e.status, 'lesson');
      } else {
        assert(distance(after.e.player.pos, after.target.pos) < 40, 'Returns to the normal combat stand-off');
        assert.equal(h.hull(after.e, after.e.player.pos, after.target.pos, 0), null, 'Combat route restores line of sight');
        h.context.rayCheck = { e: after.e, target: after.target };
        assert(vm.runInContext('!rayCheck.e.asteroids.some(a=>flightSegment(rayCheck.e.player.pos,rayCheck.target.pos,a.pos,a.r)!==null)', h.context));
      }
      results.push({ phase, originalFailure, originalSpeed: original.e.player.speed, originalShield: original.e.player.hp, statusAfterFix: after.e.status,
        movedMetres: distance(after.e.player.pos, start), shield: after.e.player.hp });
    }
    return { reproducedSeed: 417147, originalPosition: start, results };
  });

  test('New cinematic aligns outside the iris then moves forward, including near-door manual capture', () => {
    const cases = [
      [78, 13, -100], [78, 13, -87], [90, 19, -102], [68, 7, -102],
    ];
    let transitions = 0;
    for (const fx of [true, false]) for (const pos of cases) {
      h.arcade.fx = fx;
      const { e, events } = fresh(h, { pos, yaw: Math.PI });
      e.autopilot = false;
      assert(e.interact(), 'Manual dock in front of the iris');
      const start = e.player.pos.slice();
      near(e.dockShip(0), start, 'Cutscene begins at actual ship position');
      let previous = e.dockShip(0);
      for (let k = 1; k <= 1000; k++) {
        const t = k / 1000, p = e.dockShip(t);
        assert(p.every(Number.isFinite), 'Finite trajectory');
        assert(p[2] >= previous[2] - 1e-10, 'Trajectory never reverses away from the gate');
        if (t <= .41) assert.equal(h.hull(e, previous, p, 2.8), null, 'No closed hull contact before iris opens');
        previous = p;
      }
      near(e.dockShip(1), e.station.pos.map((v, i) => v + [0, -2, 20][i]), 'End on real landing pad');
      for (let frame = 0; frame < 60 * 14 && e.status === 'docking'; frame++) e.step(1 / 60, {});
      assert.equal(e.status, 'boarding');
      assert.equal(events.filter(x => x.kind === 'dock').length, 1);
      assert.equal(events.filter(x => x.kind === 'gate').length, 1);
      assert.equal(events.filter(x => x.kind === 'terminal').length, 1);
      transitions++;
    }
    h.arcade.fx = true;
    return { transitions, cinematicSamples: transitions * 1000 };
  });

  test('Docking cannot start through the back or a side wall; manual input is unchanged', () => {
    for (const pos of [[78, 13, -65], [101, 13, -90], [78, 34, -90], [78, 13, -173]]) {
      const { e } = fresh(h, { pos }); e.autopilot = false;
      assert.equal(e.interact(), false); assert.equal(e.status, 'playing');
      const input = { turn: .7, pitch: -.2, boost: true, fire: false };
      assert.equal(e.guidance(input), input);
    }
  });

  test('Pause freezes docking and resumes the same position and phase', () => {
    const { e } = fresh(h, { pos: [78, 13, -100] });
    e.step(1 / 60, {}); for (let frame = 0; frame < 75; frame++) e.step(1 / 60, {});
    e.pause(); const before = clone({ pos: e.player.pos, elapsed: e.elapsed, phaseClock: e.phaseClock, dock: e.dock });
    for (let frame = 0; frame < 120; frame++) e.step(1 / 60, { interact: true });
    assert.deepEqual(clone({ pos: e.player.pos, elapsed: e.elapsed, phaseClock: e.phaseClock, dock: e.dock }), before);
    e.resume(); e.step(1 / 60, {}); assert.equal(e.status, 'docking');
    assert(e.player.pos[2] >= before.pos[2] - 1e-8);
  });

  test('JSON and tournament resume preserve both old and new in-progress dock trajectories', () => {
    let saves = 0;
    for (const modern of [false, true]) for (const time of [.06, .31, .62, .9]) {
      const owner = modern ? h : unpatched;
      const { e } = fresh(owner, { pos: modern ? [78, 13, -100] : [78, 13, -173] });
      assert(e.interact());
      e.phaseClock = e.dock.duration * time;
      e.player.pos = e.dockShip(time);
      const savedPosition = e.player.pos.slice(), expected = e.dockShip(Math.min(1, time + (1 / 60) / e.dock.duration));
      const loaded = restore(h, e);
      h.arcade.engine = loaded;
      near(loaded.player.pos, savedPosition, 'Loading does not jump the ship');
      near(loaded.dockShip(time), savedPosition, 'Saved cinematic retains its path');
      loaded.step(1 / 60, {});
      near(loaded.player.pos, expected, 'Next saved frame remains continuous', 1e-6);
      for (let frame = 0; frame < 60 * 14 && loaded.status === 'docking'; frame++) loaded.step(1 / 60, {});
      assert.equal(loaded.status, 'boarding');
      saves++;
    }
    const { e: flight } = fresh(unpatched, { pos: [78, 13, -100], yaw: Math.PI });
    const loadedFlight = restore(h, flight);
    loadedFlight.step(1 / 60, {});
    assert.equal(loadedFlight.status, 'docking', 'Old approach save now uses the visible gate');
    return { resumedCinematics: saves, publicTournamentSerializer: !!h.cupPack };
  });

  test('Combat, retrieval, escort and finale controls retain the frozen engine behavior', () => {
    const phaseCases = ['orientation', 'battle', 'retrieve', 'escort', 'boss', 'mrg'];
    const pick = e => clone({ status: e.status, phase: e.phase, player: e.player, board: e.board, enemies: e.enemies,
      selectedTarget: e.selectedTarget, score: e.score, totalKills: e.totalKills, elapsed: e.elapsed, finale: e.finale });
    for (const phase of phaseCases) {
      const make = owner => {
        const e = new owner.Engine(99173, () => {}); owner.arcade.engine = e; owner.arcade.fx = true;
        e.beginStage(phase === 'orientation' ? 0 : 2); e.launch();
        if (phase === 'retrieve') e.beginRetrieval();
        if (phase === 'escort') { e.status = 'stageclear'; e.upgradeChoice = 'armor'; e.beginEscort(); e.launch(); }
        if (phase === 'boss' || phase === 'mrg') { e.beginStage(3); e.beginFinale(); e.launchFinale(); if (phase === 'mrg') e.beginMRG(); }
        return e;
      };
      const original = make(unpatched), current = make(h);
      for (let i = 0; i < 60; i++) { original.step(1 / 60, {}); current.step(1 / 60, {}); }
      assert.deepEqual(pick(current), pick(original), `${phase} unchanged`);
    }
    return { phases: phaseCases };
  });

  return { core: path.relative(ROOT, core), coreSha256: sha(core), patchSha256: sha(PATCH), passed: groups.length, groups };
}

function main(argv = process.argv.slice(2)) {
  const cores = []; let reportPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--core') cores.push(path.resolve(argv[++i]));
    else if (argv[i] === '--report') reportPath = path.resolve(argv[++i]);
    else throw Error(`Unknown argument: ${argv[i]}`);
  }
  if (!cores.length) {
    cores.push(path.join(ROOT, 'assets/atlas-v1.3.5.js'));
    const admin = path.resolve(ROOT, '../cmpon-analytics-admin/game-lab/engine-v1.2.1.js');
    if (fs.existsSync(admin)) cores.push(admin);
  }
  const report = { version: '1.7.1', method: 'Real campaign cores in Node VM; no browser or network', results: cores.map(run) };
  if (reportPath) { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ version: report.version, results: report.results.map(r => ({ core: r.core, passed: r.passed,
    approaches: r.groups[1].detail.runs, longestApproachSeconds: r.groups[1].detail.longestSeconds, patchSha256: r.patchSha256 })) }, null, 2));
  return report;
}

module.exports = { harness, fresh, fly, restore, run, main };
if (require.main === module) main();
