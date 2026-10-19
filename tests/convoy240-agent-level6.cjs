#!/usr/bin/env node
'use strict';

// Independent QA of convoy 2. This operator was written independently of the
// release operator. It observes only already visible entities/field warnings;
// no mission timetable, future fields or direct simulation writes after launch.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {entrySnapshot, entryHarness} = require('./mission-integration-regression-1.9.1.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'qa-2.4.0');
const clone = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const entry = entrySnapshot();
const results = [];

async function harness() {
  const h = entryHarness(entry);
  await new Promise(setImmediate);
  h.cup.panel = null;
  h.arcade.sound = false;
  h.run('SPACE_AUDIO.music=false');
  h.state.view = 'arcade';
  h.mobile.autoFire = false;
  return h;
}

async function fixture(seed = 417147, assist = false) {
  const h = await harness(), mode = assist ? 'calm' : 'normal';
  // Real completed-campaign entry from 2.3.0. Seed variations are synthetic
  // entry fixtures, not claims that the previous five missions were replayed.
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-2.3.0', `checkpoint-${mode}-6.json`), 'utf8'));
  saved.engine.seed = seed;
  if (seed !== 417147) saved.rng = seed;
  let e = h.unpack(saved, {seed, mode}, () => {});
  h.arcade.engine = e;
  // Old cupPack omitted escortStart. Supplying the entry checkpoint is test
  // setup only, before the normal retry action creates a new 2.4.0 mission.
  e.escortStart = e.checkpoint();
  h.action('citadel-retry');
  e = h.arcade.engine;
  assert.equal(e.status, 'escortbrief');
  assert.equal(e.escort.ops240.version, '2.4.0');
  assert.deepEqual(clone(e.upgrades), {weapons: 2, armor: 0, rockets: 0});
  h.action('citadel-launch');
  assert.equal(e.status, 'playing');
  assert.equal(e.autopilot, false);
  return {h, e};
}

// This is an observation of the scene and HUD, not a future mission plan.
function observe(e) {
  return {
    time: e.escort.time,
    player: e.player.pos.slice(),
    selected: e.selectedTarget,
    missiles: e.player.missiles,
    missileCooldown: e.player.missileCooldown,
    pulseCooldown: e.player.pulseCooldown,
    enemies: e.enemies.filter(x => !x.dead && x.warp <= 0).map(x => ({
      id: x.id, role: x.role, torpedo: !!x.torpedo,
      pos: x.pos.slice(), r: x.r,
    })),
    fields: e.escort.ops240.fields.filter(f => !f.passed).map(f => ({
      id: f.id, gapX: f.gapX, gapY: f.gapY, warning: f.warning,
      halfW: f.halfW, halfH: f.halfH,
    })),
  };
}

function independentPilot({decision = .45, lag = .4, style = 'careful'} = {}) {
  const history = [];
  let next = 0, hold = {turn: 0, pitch: 0, fire: true};
  const counts = {decisions: 0, targetTaps: 0, missileTaps: 0, coverTaps: 0};
  const rank = x => x.torpedo ? 0 : x.role === 'shield' ? 1 : x.role === 'bomber' ? 2 : x.role === 'jammer' ? 3 : 4;
  return {
    counts,
    input(e) {
      const now = e.escort.time;
      history.push(observe(e));
      while (history.length > 2 && history[1].time <= now - lag) history.shift();
      if (now < next || history[0].time > now - lag) return {...hold};
      next = now + decision;
      counts.decisions++;
      const s = history[0], actions = [];
      const ordered = s.enemies.slice().sort((a, b) => rank(a) - rank(b) || a.id - b.id);
      const wanted = ordered[0], target = s.enemies.find(x => x.id === s.selected);
      // One real Tab per decision, never an instant loop through all targets.
      if (wanted && wanted.id !== s.selected) { actions.push('citadel-target'); counts.targetTaps++; }
      const f = s.fields[0];
      const travel = f ? Math.max(Math.abs(f.gapX - s.player[0]), Math.abs(f.gapY - s.player[1])) / 14 : 0;
      const avoid = f && f.warning < travel + (style === 'late' ? .75 : 1.65);
      const goal = avoid ? [f.gapX, f.gapY] : target ? target.pos : s.player;
      const steer = v => Math.abs(v) <= 3.5 ? 0 : Math.sign(v);
      hold = {turn: steer(goal[0] - s.player[0]), pitch: steer(goal[1] - s.player[1]), fire: true};
      if (target && !target.torpedo && ['shield', 'bomber', 'jammer'].includes(target.role) && s.missiles > 0 && s.missileCooldown <= 0) {
        actions.push('arcade-missile'); counts.missileTaps++;
      }
      if (s.pulseCooldown <= 0 && s.enemies.some(x => x.torpedo && Math.hypot(x.pos[0] - s.player[0], x.pos[1] - s.player[1], x.pos[2]) < 115)) {
        actions.push('arcade-pulse'); counts.coverTaps++;
      }
      return {...hold, actions};
    },
  };
}

function apply(h, command, mode = 'keyboard') {
  h.arcade.keys.clear();
  h.arcade.joystick = null;
  h.arcade.mouse = null;
  h.arcade.firePointer = null;
  if (command.fire) h.arcade.keys.add('Space');
  if (mode === 'joystick') {
    h.arcade.joystick = {x: command.turn || 0, y: -(command.pitch || 0)};
  } else {
    if (command.turn > 0) h.arcade.keys.add('KeyD');
    if (command.turn < 0) h.arcade.keys.add('KeyA');
    if (command.pitch > 0) h.arcade.keys.add('KeyW');
    if (command.pitch < 0) h.arcade.keys.add('KeyS');
  }
  if (command.boost) h.arcade.keys.add('ShiftLeft');
  for (const action of command.actions || []) h.action(action);
  return h.input();
}

function state(e) {
  return clone({escort: e.escort, player: e.player, enemies: e.enemies, hostile: e.hostile,
    bullets: e.bullets, status: e.status, elapsed: e.elapsed, score: e.score, shots: e.shots,
    hits: e.hits, entityId: e.entityId, selectedTarget: e.selectedTarget});
}

function report(e, extra = {}) {
  const o = e.escort.ops240;
  return {status: e.status, seconds: +e.escort.time.toFixed(3), playerHP: +e.player.hp.toFixed(3),
    transports: e.escort.allies.map(x => +x.hp.toFixed(3)), kills: e.escort.kills,
    missilesLeft: e.player.missiles, stats: clone(o.stats), ...extra};
}

async function run(seed, assist, hz, {policy = 'careful', controls = 'keyboard', lag = .4} = {}) {
  const {h, e} = await fixture(seed, assist), pilot = independentPilot({lag});
  const startShots = e.shots;
  let finite = true, peakEnemies = 0, frames = 0;
  for (; frames < hz * 150 && e.status === 'playing'; frames++) {
    const cmd = policy === 'fire-only' ? {fire: true} : policy === 'idle' ? {} : pilot.input(e);
    e.step(1 / hz, apply(h, cmd, controls));
    finite &&= e.player.pos.every(Number.isFinite) && e.enemies.every(x => x.pos.every(Number.isFinite));
    peakEnemies = Math.max(peakEnemies, e.enemies.length);
  }
  assert(finite, 'All positions remain finite');
  return report(e, {seed, mode: assist ? 'calm' : 'normal', hz, policy, controls, lag, decisionSeconds: .45,
    shots: e.shots - startShots, counts: pilot.counts, frames, peakEnemies, finite});
}

async function saveAndPause(trigger) {
  const {h, e} = await fixture(), pilot = independentPilot();
  for (let i = 0; i < 120 * 60 && e.status === 'playing'; i++) {
    e.step(1 / 60, apply(h, pilot.input(e)));
    const hit = trigger === 'field' ? e.escort.ops240.fields.some(f => !f.passed && f.warning > 1) : e.enemies.some(x => x.torpedo);
    if (!hit) continue;
    const originalTime = e.escort.time;
    h.action('arcade-pause');
    const before = state(e);
    for (let n = 0; n < 180; n++) e.step(1 / 60, {fire: true, turn: 1, missile: true, pulse: true});
    assert.deepEqual(state(e), before, `${trigger}: pause freezes all simulation state`);
    const snapshot = h.pack(e), h2 = await harness();
    const other = h2.unpack(snapshot, {seed: e.seed, mode: 'normal'}, () => {});
    h2.arcade.engine = other;
    assert.deepEqual(state(other), before, `${trigger}: save roundtrip`);
    h.action('arcade-resume'); h2.action('arcade-resume');
    let frames = 0;
    for (; frames < 8 * 60 && e.status === 'playing'; frames++) {
      const command = pilot.input(e);
      e.step(1 / 60, apply(h, command));
      other.step(1 / 60, apply(h2, command));
      assert.deepEqual(state(other), state(e), `${trigger}: restored simulation diverged at frame ${frames}`);
    }
    return {name: `Pause and save during ${trigger}`, pass: true, at: +originalTime.toFixed(3), replayFrames: frames};
  }
  throw Error(`No visible ${trigger} reached`);
}

async function inputEquivalence() {
  const a = await fixture(), b = await fixture(), pilot = independentPilot();
  let frames = 0;
  for (; frames < 60 * 110 && a.e.status === 'playing'; frames++) {
    const command = pilot.input(a.e);
    const keyboard = apply(a.h, command, 'keyboard'), joystick = apply(b.h, command, 'joystick');
    assert.deepEqual(clone(keyboard), clone(joystick), `Control mismatch at frame ${frames}`);
    a.e.step(1 / 60, keyboard); b.e.step(1 / 60, joystick);
    assert.deepEqual(state(a.e), state(b.e), `Device path diverged at frame ${frames}`);
  }
  return {name: 'Keyboard and joystick use equivalent production input', pass: true, frames, result: report(a.e)};
}

async function check(name, fn) {
  try { const data = await fn(); results.push({name, pass: true, ...data}); console.log('PASS', name); }
  catch (err) { results.push({name, pass: false, error: String(err.stack || err)}); console.log('FAIL', name, err.message); }
}

async function main() {
  fs.mkdirSync(out, {recursive: true});
  const matrix = [];
  for (const seed of [417147, 731, 98211]) for (const assist of [false, true]) for (const hz of [30, 60]) {
    const data = await run(seed, assist, hz);
    matrix.push(data);
    console.log('MATRIX', JSON.stringify(data));
  }
  results.push({name: 'Independent conservative pilot matrix', pass: matrix.every(x => x.status === 'escortclear'), matrix});
  const negative = [];
  for (const policy of ['idle', 'fire-only']) negative.push(await run(417147, false, 60, {policy}));
  results.push({name: 'No-input and fire-only controls require active play', pass: negative.every(x => x.status !== 'escortclear'), runs: negative});
  await check('Pause/save at field warning', () => saveAndPause('field'));
  await check('Pause/save at live torpedo', () => saveAndPause('torpedo'));
  await check('Keyboard / touch-joystick input equivalence', inputEquivalence);
  const output = {agent: 'convoy_two_qa', level: 6, convoy: 2, release: '2.4.0',
    method: 'Node VM plus production arcadeInput. Frozen 2.3.0 campaign entry fixtures; ordinary retry/launch, keyboard/joystick, fire, one Tab per 0.45 s decision, Q/E. No HP/status/kill/victory writes after launch. No browser or physical phone test by this agent.',
    limitations: ['Seed variants are synthetic entry fixtures, not three full campaign completions.',
      'The conservative pilot uses 0.4 s old observations and decisions every 0.45 s; response to a newly appearing threat can therefore be as late as 0.85 s.',
      'Entity and visible gap positions are read from the simulation as a programmatic scene model, not recognized from pixels.',
      'Identical convoy scripts may produce identical seed outcomes; this is not stochastic coverage.'],
    sourceSha256: Object.fromEntries(['assets/citadel-convoy-v2.4.0.js', 'assets/citadel-convoy-view-v2.4.0.js'].map(p => [p, hash(entry.sources.get(p))])),
    passed: results.filter(x => x.pass).length, total: results.length, results};
  fs.writeFileSync(path.join(out, 'agent-level6.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({passed: output.passed, total: output.total, matrixWins: matrix.filter(x => x.status === 'escortclear').length, matrixTotal: matrix.length}));
  if (results.some(x => !x.pass)) process.exitCode = 1;
}

module.exports = {fixture, independentPilot, apply, state, run};
if (require.main === module) main().catch(err => {console.error(err); process.exitCode = 1;});
