#!/usr/bin/env node
'use strict';
// Galaga-inspired level 7. Actual frozen game cores, ordinary arcadeInput,
// deterministic saves and native Canvas. No browser, network or audio tests.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..'), asset = file => path.join(root, 'assets', file);
const patch = asset('citadel-swarm-v1.9.0.js');
const clone = value => JSON.parse(JSON.stringify(value));
const limit = value => Math.max(-1, Math.min(1, value));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function canvasFactory() {
  return require(require.resolve('@napi-rs/canvas', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, process.cwd()].filter(Boolean) })).createCanvas;
}
function harness(core, render = false, snapshot = true) {
  const h = createHarness(core, asset('citadel-mrg-v1.7.0.js'), asset('citadel-mrg-view-v1.7.0.js'), render ? canvasFactory() : null);
  h.context.location = { protocol: 'file:', href: 'file:///test/citadel.html' };
  if (!h.cupPack && snapshot) {
    const declarations = fs.readFileSync(asset('atlas-v1.3.5.js'), 'utf8').split('\n').filter(line => /^(const CUP_(LEVELS|ENGINE_KEYS|OMIT)=|function cup(Pack|Unpack)\(|function arcadeSeed\()/.test(line));
    assert.equal(declarations.length, 6);
    vm.runInContext('const CUP={clock:0,startClock:0,startScore:0,progress:0};\n' + declarations.join('\n'), h.context);
    h.snapshotAdapter = 'Exact public CUP snapshot functions and seeded RNG over the frozen private engine, isolated in memory.';
  }
  for (const file of ['citadel-flight-v1.8.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js',
    'citadel-pursuit-v1.8.0.js', 'citadel-swarm-v1.9.0.js', 'citadel-parallax-v1.8.0.js', 'citadel-comic-v1.8.0.js']) {
    vm.runInContext(fs.readFileSync(asset(file), 'utf8'), h.context, { filename: file });
  }
  vm.runInContext(`globalThis.swarmQA = {
    api:CITADEL_SWARM,pack:typeof cupPack==='function'?cupPack:null,unpack:typeof cupUnpack==='function'?cupUnpack:null,
    keys:typeof CUP_ENGINE_KEYS!=='undefined'?CUP_ENGINE_KEYS:[],levels:typeof CUP_LEVELS!=='undefined'?CUP_LEVELS:[],
    lessonCase:citadelLessonCase,scene:spaceScene,camera:spaceCamera,flightHUD:drawFlightHUD,mobileHUD:drawMobileGameHUD,
    campaignHUD:drawCampaignFlightHUD,clarityHUD:drawClarityHUD,overlay:arcadeOverlayHTML,update:updateArcadeHUD,
    action:arcadeAction,mobileAction,input:arcadeInput,retry:citadelRetry,project:spaceProject};`, h.context);
  h.s = h.context.swarmQA; h.arcade.fx = false;
  h.run = e => ({ seed: e.seed, mode: e.assist ? 'calm' : 'normal' });
  h.make = (assist = false, seed = 417147, upgrades = { weapons: 0, armor: 0, rockets: 0 }) => {
    const events = [], e = new h.Engine(seed, (kind, value) => events.push({ kind, value: clone(value ?? null) }));
    e.assist = assist; e.upgrades = { ...upgrades }; e.beginStage(2); h.arcade.engine = e; e.launch(); e.qaEvents = events; return e;
  };
  return h;
}
function controller(api) {
  return e => {
    if (!api.active(e)) return {};
    const p = e.player, live = e.enemies.filter(x => !x.dead && x.pos[1] > p.pos[1] + 8);
    const lead = x => Math.max(-47, Math.min(47, x.pos[0] + Math.max(-10, Math.min(10, x.vel[0])) * Math.min(.8, (x.pos[1] - p.pos[1]) / 132)));
    live.sort((a, b) => Math.abs(lead(a) - p.pos[0]) + a.rank * 2 - (Math.abs(lead(b) - p.pos[0]) + b.rank * 2));
    const target = live[0], desired = target ? lead(target) : 0;
    const candidates = [desired, p.pos[0], desired - 10, desired + 10, p.pos[0] - 15, p.pos[0] + 15, -46, 46].map(x => Math.max(-49, Math.min(49, x)));
    const threats = [...e.hostile, ...e.enemies.filter(x => x.mode === 'dive' && x.pos[1] < 5)];
    let best = desired, cost = Infinity;
    for (const candidate of candidates) {
      let value = Math.abs(candidate - desired) * 1.2 + Math.abs(candidate - p.pos[0]) * .12;
      for (const x of threats) for (const t of [.12, .25, .45, .7]) {
        const ownX = p.pos[0] + Math.sign(candidate - p.pos[0]) * Math.min(Math.abs(candidate - p.pos[0]), 32 * t);
        const dx = x.pos[0] + x.vel[0] * t - ownX, dy = x.pos[1] + x.vel[1] * t - p.pos[1];
        const radius = x.swarmDrone ? 8 : 5, d = Math.hypot(dx, dy);
        if (d < radius) value += (radius - d) * (1.1 - t) * 130;
      }
      if (value < cost) { cost = value; best = candidate; }
    }
    const danger = threats.some(x => Math.hypot(x.pos[0] - p.pos[0], x.pos[1] - p.pos[1]) < (x.swarmDrone ? 17 : 12));
    return { turn: limit((best - p.pos[0]) * .55), pitch: limit((-50 - p.pos[1]) * .35), fire: true,
      missile: !!target && target.hp > 35 && Math.abs(lead(target) - p.pos[0]) < 3,
      pulse: danger && p.invulnerable < .12 };
  };
}
function realInput(h, e, command, touch = false) {
  h.arcade.engine = e; h.arcade.keys.clear(); h.arcade.firePointer = null;
  h.arcade.mouse = touch ? null : { x: command.turn || 0, y: -(command.pitch || 0) };
  h.arcade.joystick = touch ? { x: command.turn || 0, y: -(command.pitch || 0) } : null;
  if (command.fire) h.arcade.keys.add('Space'); if (command.boost) h.arcade.keys.add('ShiftLeft');
  h.arcade.missileQueued = !!command.missile; h.arcade.pulseQueued = !!command.pulse; h.arcade.flipQueued = !!command.flip;
  return h.s.input();
}
function frames(e, seconds, input = {}, dt = 1 / 60) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) e.step(dt, typeof input === 'function' ? input(e, i) : input);
}
function play(h, { assist = false, seed = 417147, touch = false, dt = 1 / 60 } = {}) {
  const e = h.make(assist, seed), operate = controller(h.s.api), snapshots = [], waves = new Set();
  let maxEnemies = 0, maxBullets = 0, maxHostile = 0, maxDivers = 0, minHP = 100, lessons = 0;
  for (let i = 0; i < 200 / dt; i++) {
    if (e.status === 'lesson') {
      assert.equal(e.swarm.complete, true); assert.equal(e.enemies.length + e.hostile.length, 0);
      assert(e.answerLesson(h.s.lessonCase(e, e.lesson.caseIndex).correct)); e.continueLesson(); lessons++;
    }
    if (e.phase === 'dock' && e.status === 'playing') break;
    assert(!['crashing', 'lost'].includes(e.status), 'Ordinary input controller must survive: ' + JSON.stringify({ assist, seed, time: e.elapsed, kills: e.stageKills, hp: e.player.hp }));
    e.step(dt, realInput(h, e, operate(e), touch));
    maxEnemies = Math.max(maxEnemies, e.enemies.length); maxBullets = Math.max(maxBullets, e.bullets.length);
    maxHostile = Math.max(maxHostile, e.hostile.length); maxDivers = Math.max(maxDivers, e.enemies.filter(x => x.mode === 'dive').length);
    minHP = Math.min(minHP, e.player.hp);
    if (h.s.api.active(e) && !waves.has(e.swarm.packet) && e.swarm.waveAge > 3) { waves.add(e.swarm.packet); snapshots.push(h.s.pack(e)); }
  }
  assert.equal(e.phase, 'dock', 'Controller reaches the three-packet exit: ' + JSON.stringify({ assist, elapsed: e.elapsed, remaining: e.enemies.length, wave: e.swarm.packet }));
  assert.equal(e.status, 'playing'); assert.equal(h.s.api.completed(e), 3); assert(e.swarm.complete);
  assert.equal(lessons, 2); assert.deepEqual(clone(e.decisions.map(x => x.caseIndex)), [4, 5]);
  assert.equal(new Set(e.rescued).size, e.rescued.length); assert.equal(e.lessonQueue.length, 0);
  assert(maxEnemies <= 18 && maxBullets <= 36 && maxHostile <= 22 && maxDivers <= 3);
  assert.equal(waves.size, 3); assert(e.hits > 0 && e.stageKills === (assist ? 37 : 45));
  return { e, snapshots, metrics: { assist, seed, touch, fps: Math.round(1 / dt), seconds: +e.elapsed.toFixed(2), minHP: +minHP.toFixed(1),
    hp: e.player.hp, hitsTaken: e.swarm.hitsTaken, hits: e.hits, shots: e.shots, kills: e.stageKills, score: e.score, lessons,
    maxEnemies, maxBullets, maxHostile, maxDivers } };
}
async function verify(core, options = {}) {
  const h = harness(core), checks = [], plays = [], renders = [];
  const check = (name, fn) => { const details = fn(); checks.push({ name, passed: true, ...(details === undefined ? {} : { details }) }); };
  check('Ordinary desktop and touch input clear three waves and exactly two safe decisions in both modes', () => {
    for (const assist of [false, true]) for (const touch of [false, true]) plays.push(play(h, { assist, seed: touch ? 819337 : 417147, touch, dt: touch ? 1 / 30 : 1 / 60 }));
    return plays.map(p => p.metrics);
  });
  check('Visible rows move as a formation; a warned group dives and returns without invisible damage regions', () => {
    const e = h.make(); frames(e, 2.5);
    const rows = new Map();
    for (const x of e.enemies) { if (!rows.has(x.row)) rows.set(x.row, []); rows.get(x.row).push(x); }
    assert.equal(rows.size, 2); assert.equal(e.enemies.length, 12);
    for (const row of rows.values()) {
      assert.equal(new Set(row.map(x => x.pos[1].toFixed(5))).size, 1);
      assert(row.every(x => x.mode === 'formation' && x.channel === false));
    }
    const startX = e.enemies[0].pos[0]; frames(e, .5); assert(Math.abs(e.enemies[0].pos[0] - startX) > .2);
    let id = null, seen = [], warning = null, dive = null;
    for (let i = 0; i < 60 * 15; i++) {
      e.step(1 / 60, {});
      if (!id) id = e.enemies.find(x => x.mode === 'tell')?.id;
      const x = e.enemies.find(x => x.id === id);
      if (x && seen.at(-1) !== x.mode) {
        seen.push(x.mode);
        if (x.mode === 'tell') warning = e.elapsed;
        if (x.mode === 'dive') dive = e.elapsed;
      }
      if (seen.includes('return') && x.mode === 'formation') break;
    }
    assert.deepEqual(seen, ['tell', 'dive', 'return', 'formation']); assert(dive - warning >= 1);
    assert.equal(e.swarm.window, null); assert.equal(e.swarm.attack, null); assert.equal(h.s.api.liveRegions(e).length, 0);
    return { rows: rows.size, stages: seen, warningSeconds: +(dive - warning).toFixed(2) };
  });
  check('Real straight lasers miss the wrong column; moving into alignment destroys the visible ship', () => {
    const e = h.make(); frames(e, 2.5); e.swarm.diveClock = e.swarm.fireClock = 100;
    e.player.pos[0] = 51;
    const target = e.enemies[0], hp = target.hp;
    frames(e, 1, () => realInput(h, e, { fire: true }, true));
    assert.equal(target.hp, hp); assert.equal(e.hits, 0);
    assert(e.bullets.length > 0 && e.bullets.every(b => b.vel[0] === 0 && b.vel[1] > 0 && b.vel[2] === 0));
    for (let i = 0; i < 60 * 7 && !target.dead; i++) e.step(1 / 60, realInput(h, e, { fire: true, turn: limit((target.pos[0] - e.player.pos[0]) * .6) }, true));
    assert(target.dead); assert(e.hits > 0 && e.stageKills > 0);
    const ammo = e.player.missiles; assert(e.missile()); const rocket = e.bullets.at(-1);
    assert.equal(rocket.type, 'missile'); assert.equal(rocket.vel[0], 0); assert.equal(rocket.target, undefined); assert.equal(e.player.missiles, ammo - 1);
    return { shots: e.shots, hits: e.hits, targetDestroyed: target.id };
  });
  check('An actual emitted amber projectile damages its path; ordinary movement escapes it in both modes', () => {
    const results = [];
    for (const assist of [false, true]) {
      const e = h.make(assist);
      for (let i = 0; i < 60 * 10 && !e.hostile.length; i++) e.step(1 / 60, {});
      assert(e.hostile.length); const bolt = e.hostile[0], owner = e.enemies.find(x => x.id === bolt.owner);
      // Isolate one naturally emitted projectile to distinguish its visible
      // collision from unrelated later volleys. No damage method is invoked.
      e.enemies = [owner]; owner.fireCue = 0; e.hostile = [bolt]; e.swarm.diveClock = e.swarm.fireClock = 100;
      const flight = (e.player.pos[1] - bolt.pos[1]) / bolt.vel[1];
      e.player.pos[0] = bolt.pos[0] + bolt.vel[0] * flight; e.player.invulnerable = 0;
      assert(Math.abs(e.player.pos[0]) < 51);
      const saved = h.s.pack(e), hit = h.s.unpack(saved, h.run(e), () => {}), escape = h.s.unpack(saved, h.run(e), () => {});
      const hp = hit.player.hp, side = escape.player.pos[0] < 0 ? 1 : -1;
      frames(hit, flight + .15); frames(escape, flight + .15, { turn: side });
      assert(hit.player.hp < hp); assert.equal(escape.player.hp, hp); assert.equal(hit.swarm.hitsTaken, 1);
      results.push({ assist, visibleFlightSeconds: +flight.toFixed(2), damage: +(hp - hit.player.hp).toFixed(2) });
    }
    assert(results[1].damage < results[0].damage); assert(results[1].visibleFlightSeconds > results[0].visibleFlightSeconds);
    return results;
  });
  check('The diving ship body causes damage; a last moment manual dodge leaves the ship unharmed', () => {
    const e = h.make(); frames(e, 8);
    const diver = e.enemies.find(x => x.mode === 'dive'); assert(diver);
    e.enemies = [diver]; e.swarm.diveClock = e.swarm.fireClock = 100;
    while (diver.pos[1] > -41 && e.status === 'playing') e.step(1 / 60, {});
    assert.equal(diver.mode, 'dive'); e.hostile = []; e.player.pos[0] = diver.pos[0]; e.player.invulnerable = 0;
    const saved = h.s.pack(e), hit = h.s.unpack(saved, h.run(e), () => {}), escape = h.s.unpack(saved, h.run(e), () => {});
    const hp = e.player.hp; frames(hit, .65); frames(escape, .65, { turn: diver.vel[0] < 0 ? 1 : -1 });
    assert.equal(hit.player.hp, hp - 24); assert.equal(escape.player.hp, hp);
    return { contactDamage: hp - hit.player.hp, dodgeTravel: Math.abs(escape.player.pos[0] - e.player.pos[0]) };
  });
  check('Pulse clears visible bullets and nearby divers while leaving the distant formation intact', () => {
    const e = h.make(); frames(e, 9.2); assert(e.hostile.length > 0);
    const formation = e.enemies.filter(x => x.mode === 'formation').map(x => ({ id: x.id, hp: x.hp }));
    assert(e.enemies.some(x => x.mode === 'dive' && x.pos[1] < -10));
    assert(e.pulse()); assert.equal(e.hostile.length, 0); assert(!e.pulse());
    for (const before of formation) assert.equal(e.enemies.find(x => x.id === before.id).hp, before.hp);
    assert(e.enemies.some(x => x.mode === 'dive' && x.dead)); assert.equal(e.player.pulseCooldown, 12);
  });
  check('Full save roundtrip preserves live dives, bullets, RNG and deterministic continuation', () => {
    const e = h.make(); frames(e, 9.2); assert(e.enemies.some(x => x.mode === 'dive')); assert(e.hostile.length);
    const saved = h.s.pack(e), a = h.s.unpack(saved, h.run(e), () => {}), b = h.s.unpack(saved, h.run(e), () => {});
    assert.deepEqual(clone(h.s.pack(a)), clone(saved));
    const operate = controller(h.s.api);
    for (let i = 0; i < 900; i++) { const input = operate(a); a.step(1 / 60, input); b.step(1 / 60, input); }
    assert.deepEqual(clone(h.s.pack(a)), clone(h.s.pack(b)));
    assert.equal(h.s.keys.filter(x => x === 'swarm').length, 1);
  });
  check('Pause freezes formation, dive warning, bullets, health, ammo and reward state', () => {
    const e = h.make(); frames(e, 6.8); assert(e.enemies.some(x => x.mode === 'tell'));
    e.pause(); const saved = clone(h.s.pack(e));
    frames(e, 3, { fire: true, missile: true, turn: 1, pulse: true });
    assert.deepEqual(clone(h.s.pack(e)), saved);
    const resumed = h.s.unpack(saved, h.run(e), () => {}); assert.equal(resumed.status, 'paused');
    resumed.resume(); resumed.step(1 / 60, {}); assert(resumed.swarm.time > e.swarm.time);
  });
  check('The old communication-window save keeps collected requirements, score, health, decisions and partial progress', () => {
    const e = h.make(), snap = h.s.pack(e), first = e.plan[2][0];
    snap.engine.swarm = { version: '1.8.0', packet: 1, transfer: [15, 7.5, 0], window: [20, 5, 0], radius: 9.2 };
    snap.engine.rescued = [first]; snap.engine.score = 4321; snap.engine.player.hp = 47; snap.engine.elapsed = 82.3;
    snap.engine.decisions = [{ caseIndex: 4, stage: 2, reqId: first, firstTry: true, decision: 0 }];
    snap.engine.lessonQueue = []; snap.engine.status = 'paused'; snap.engine.resumeStatus = 'playing';
    const restored = h.s.unpack(snap, h.run(e), () => {});
    assert.equal(restored.swarm.version, '1.9.0'); assert.equal(restored.swarm.packet, 1);
    assert.equal(restored.swarm.migration.credited, 7); assert.equal(restored.enemies.length, 8);
    assert.equal(restored.score, 4321); assert.equal(restored.player.hp, 47); assert.equal(restored.elapsed, 82.3);
    assert.deepEqual(clone(restored.rescued), [first]); assert.equal(restored.status, 'paused'); restored.resume();
    const operate = controller(h.s.api);
    for (let i = 0; i < 60 * 110; i++) {
      if (restored.status === 'lesson') { restored.answerLesson(h.s.lessonCase(restored, restored.lesson.caseIndex).correct); restored.continueLesson(); }
      if (restored.phase === 'dock' && restored.status === 'playing') break;
      restored.step(1 / 60, operate(restored));
    }
    assert.equal(restored.phase, 'dock'); assert.equal(h.s.api.completed(restored), 3);
    assert.equal(restored.decisions.filter(x => x.caseIndex === 4).length, 1); assert.equal(restored.decisions.filter(x => x.caseIndex === 5).length, 1);
    return { creditedEnemies: 7, newKills: restored.stageKills, finalScore: restored.score };
  });
  check('Completed legacy saves enter safe lessons without rewarding cargo twice; dock saves stay untouched', () => {
    const e = h.make(), snap = h.s.pack(e); delete snap.engine.swarm;
    snap.engine.phase = 'retrieve'; snap.engine.rescued = clone(e.plan[2]); snap.engine.score = 9999; snap.engine.lessonQueue = [];
    const restored = h.s.unpack(snap, h.run(e), () => {});
    assert.equal(restored.phase, 'dock'); assert.equal(restored.status, 'lesson'); assert.equal(restored.score, 9999);
    assert.equal(restored.lesson.caseIndex, 4); assert.deepEqual(clone(restored.lessonQueue.map(x => x.caseIndex)), [5]);
    const again = h.s.unpack(h.s.pack(restored), h.run(restored), () => {}); assert.equal(again.score, 9999); assert.equal(again.lessonQueue.length, 1);
    const dockSave = h.s.pack(plays[0].e); dockSave.engine.swarm.version = '1.8.0';
    const dock = h.s.unpack(dockSave, h.run(plays[0].e), () => {});
    assert.equal(dock.phase, 'dock'); assert.equal(dock.swarm.version, '1.8.0'); assert.deepEqual(clone(h.s.pack(dock)), clone(dockSave));
  });
  check('Ignoring the visible attackers loses; calm mode gives more time; normal retry restores the stage checkpoint', () => {
    const results = [];
    for (const assist of [false, true]) {
      const e = h.make(assist); e.autopilot = true;
      for (let i = 0; i < 60 * 70 && e.status !== 'lost'; i++) e.step(1 / 60, {});
      assert.equal(e.status, 'lost'); assert.equal(h.s.api.completed(e), 0); assert.equal(e.autopilot, false);
      assert(e.swarm.hitsTaken >= 5); results.push({ assist, seconds: +e.elapsed.toFixed(2), hitsTaken: e.swarm.hitsTaken });
      if (!assist) {
        h.arcade.engine = e; h.s.retry(false); const retry = h.arcade.engine;
        assert.equal(retry.stage, 2); assert.equal(retry.status, 'briefing'); assert.equal(retry.phase, 'swarm');
        assert.equal(retry.player.hp, 100); assert.equal(retry.swarm.time, 0); assert.equal(retry.score, e.stageStart.score);
        assert.deepEqual(clone(retry.rescued), clone(e.stageStart.rescued));
        retry.launch(); retry.step(1 / 60, realInput(h, retry, { fire: true })); assert(retry.bullets.length > 0);
      }
    }
    assert(results[1].seconds > results[0].seconds * 1.5); return results;
  });
  check('Simple left-right movement and fire can win without aim prediction, rockets or upgrades', () => {
    const e = h.make();
    for (let i = 0; i < 60 * 100 && !e.swarm.complete; i++) e.step(1 / 60, realInput(h, e, { fire: true, turn: Math.sin(e.elapsed * .8) > 0 ? .8 : -.8 }, true));
    assert(e.swarm.complete); assert.equal(h.s.api.completed(e), 3); assert(e.player.hp > 0); assert.equal(e.shots > 0, true);
    return { seconds: +e.elapsed.toFixed(2), hp: e.player.hp, hitsTaken: e.swarm.hitsTaken };
  });
  check('Other stages, boarding, convoy, finale and restored G controls still delegate', () => {
    const e = h.make(); h.s.update(); assert.equal(h.nodes.get('citadel-primary').disabled, true);
    assert.equal(h.nodes.get('mobile-crystal').textContent, 'Цель: три волны'); h.s.action('citadel-guidance'); assert.equal(e.autopilot, false);
    e.beginStage(0); e.launch(); h.s.update(); assert.equal(e.swarm, null); assert.equal(e.phase, 'orientation');
    assert.equal(h.nodes.get('citadel-primary').disabled, false); assert.doesNotMatch(h.nodes.get('mobile-crystal').textContent, /волны/);
    const auto = e.autopilot; h.s.action('citadel-guidance'); assert.equal(e.autopilot, !auto);
    e.beginStage(1); e.launch(); h.s.update(); assert.equal(e.phase, 'pursuit'); assert.equal(e.swarm, null);
    assert.equal(h.nodes.get('mobile-crystal').textContent, 'К носителю');
    e.status = 'stageclear'; e.upgradeChoice = 'weapons'; e.beginEscort(); e.launch(); frames(e, .3); assert(e.escort.time > 0); assert.equal(e.phase, 'escort');
    e.beginStage(3); e.launch(); assert.equal(e.phase, 'battle'); e.beginFinale(); e.launchFinale(); assert(!h.s.api.active(e)); assert(e.enemies.every(x => x.core));
    e.beginStage(2); assert.equal(e.status, 'briefing'); assert.equal(e.swarm.time, 0);
  });
  check('Victory and the admin direct-dock fixture both enter the preserved real 1.8.1 gate', () => {
    const final = plays[0].e, restored = h.s.unpack(h.s.pack(final), h.run(final), () => {}); h.arcade.engine = restored;
    for (let i = 0; i < 60 * 35 && restored.status === 'playing'; i++) restored.step(1 / 60, {});
    assert.equal(restored.status, 'docking'); assert.equal(restored.dock.flightVersion, '1.8.1');
    const direct = h.make(); direct.rescued = clone(direct.plan[2]); direct.decisions = [4, 5].map(caseIndex => ({ stage: 2, caseIndex }));
    direct.phase = 'dock'; direct.enemies = []; direct.bullets = []; direct.hostile = []; direct.lessonQueue = [];
    direct.player.pos = clone(h.context.CITADEL_FLIGHT.approach(direct)); assert(!h.s.api.active(direct));
    assert(direct.interact()); assert.equal(direct.status, 'docking'); assert.equal(direct.dock.flightVersion, '1.8.1');
    return { completedDockSeconds: +(restored.elapsed - final.elapsed).toFixed(2) };
  });
  check('Actual keyboard and touch inputs, wording and duplicate loading preserve the public API', () => {
    const e = h.make(); h.arcade.joystick = h.arcade.mouse = null; h.arcade.keys.clear(); h.arcade.keys.add('KeyD'); h.arcade.keys.add('KeyW');
    const input = h.s.input(); assert.equal(input.turn, 1); assert.equal(input.pitch, 1); const before = e.player.pos.slice(); e.step(.03, input);
    assert(e.player.pos[0] > before[0] && e.player.pos[1] > before[1]);
    const touch = realInput(h, e, { turn: -.5, pitch: -.25, fire: true }, true); assert.equal(touch.turn, -.5); assert.equal(touch.pitch, -.25); assert(touch.fire);
    h.s.mobileAction('mobile-guide'); assert.equal(e.autopilot, false); h.s.update();
    assert.match(h.nodes.get('citadel-route').innerHTML, /ПРОТИВНИКОВ/); assert.doesNotMatch(h.nodes.get('citadel-route').innerHTML, /СВЯЗЬ|ПЕРЕХВАЧЕНО/);
    e.status = 'briefing'; assert.match(h.s.overlay(), /пикируют/); assert.doesNotMatch(h.s.overlay(), /Красный коридор|окне связи|глушитель/);
    assert.equal(h.s.levels[6], 'Рой уточнений'); const step = e.step; vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context); assert.equal(e.step, step);
    assert.equal(h.s.api.insideWindow(e), false); assert.equal(h.s.api.windowAt(e), null); assert.equal(h.s.keys.filter(x => x === 'swarm').length, 1);
  });
  check('Private core starts with no tournament or storage APIs and uses the same bounded loop', () => {
    if (!h.snapshotAdapter) return { applicable: false };
    const raw = harness(core, false, false); assert.equal(raw.s.pack, null);
    const e = raw.make(), operate = controller(raw.s.api); frames(e, 6, operate);
    assert.equal(e.status, 'playing'); assert(e.stageKills > 0); assert.equal(raw.storage.size, 0);
    return { applicable: true, kills: e.stageKills };
  });
  check('Native Canvas draws the actual HUD and radar; portrait/landscape/DPR bounds keep the player and rows visible', () => {
    const native = harness(core, true), radar = native.createCanvas(300, 220);
    radar.setAttribute = function (key, value) { this[key] = value; }; native.arcade.radar = radar.getContext('2d');
    const base = native.make(); frames(base, 9.2); const saved = native.s.pack(base), layouts = [];
    for (const [W, H, dpr] of [[1280, 720, 1], [390, 460, 1], [320, 420, 1], [844, 320, 1], [390, 460, 2]]) {
      const e = native.s.unpack(saved, native.run(base), () => {}); native.arcade.engine = e; native.context.innerWidth = W;
      native.context.matchMedia = () => ({ matches: W < 900 }); native.arcade.canvas = native.createCanvas(W * dpr, H * dpr);
      native.arcade.canvas.getBoundingClientRect = () => ({ width: W, height: H }); native.arcade.canvas.setAttribute = function () {};
      const canvas = native.createCanvas(W * dpr, H * dpr), ctx = canvas.getContext('2d'), before = clone(native.s.pack(e));
      native.s.update(); const cam = native.s.camera(e, e.elapsed); assert.equal(native.s.scene(e, e.elapsed).length, 0);
      (W < 900 ? native.s.mobileHUD : native.s.flightHUD)(ctx, e, cam, W * dpr, H * dpr);
      native.s.campaignHUD(ctx, e, cam, W * dpr, H * dpr); native.s.clarityHUD(ctx, e, cam, W * dpr, H * dpr);
      const l = native.s.api.layout(W, H), boxes = native.s.api.hudBounds(e, W, H);
      for (const box of boxes) assert(Object.values(box).filter(v => typeof v === 'number').every(Number.isFinite));
      assert(boxes.some(b => b.kind === 'formation')); assert(boxes.some(b => b.kind === 'diver')); assert(boxes.some(b => b.kind === 'projectile'));
      for (const pos of [e.player.pos, [-51, -58, 0], [51, -58, 0], [-51, -27, 0], [51, -27, 0]]) {
        const q = native.s.project(pos, cam, W, H); assert(q.x >= 7 && q.x <= W - 7 && q.y > l.top && q.y < H - l.bottom);
      }
      for (const x of e.enemies.filter(x => x.mode === 'formation')) {
        const q = native.s.project(x.pos, cam, W, H); assert(q.y > l.top + 15 && q.x > l.x && q.x < l.x + l.width);
      }
      assert.equal(ctx.getImageData(2, 2, 1, 1).data[3], 255); assert(radar.getContext('2d').getImageData(150, 110, 1, 1).data[3] > 0);
      assert.deepEqual(clone(native.s.pack(e)), before, 'HUD, comic bounds and native render are read-only');
      if (options.render) {
        fs.mkdirSync(options.render, { recursive: true }); const file = path.join(options.render, `${path.basename(core).replace('.js', '')}-dive-${W}x${H}-dpr${dpr}.png`);
        fs.writeFileSync(file, canvas.toBuffer('image/png')); renders.push({ file, size: [W, H], dpr, boxes: boxes.length });
      }
      layouts.push({ W, H, dpr, bounds: boxes.length, width: +l.width.toFixed(1), height: +l.height.toFixed(1) });
    }
    return layouts;
  });
  return { core: path.basename(core), coreSha256: sha(core), passed: checks.length, checks, renders };
}
async function main(argv = process.argv.slice(2)) {
  const options = { cores: [], render: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--core') options.cores.push(path.resolve(argv[++i]));
    else if (argv[i] === '--render') options.render = path.resolve(argv[++i]);
    else if (argv[i] === '--report') options.report = path.resolve(argv[++i]);
    else throw Error('Unknown option: ' + argv[i]);
  }
  if (!options.cores.length) options.cores.push(asset('atlas-v1.3.5.js'), path.resolve(root, '../cmpon-analytics-admin/game-lab/engine-v1.2.1.js'));
  const results = []; for (const core of options.cores) results.push(await verify(core, options));
  const report = { version: '1.9.0', feature: 'Level 7 / Рой уточнений / formation shooter',
    method: 'Actual frozen cores, real arcadeInput/actions, synthetic DOM/storage and native Canvas. No browser, physical Android or audio QA.', addon_sha256: sha(patch), results };
  if (options.report) fs.writeFileSync(options.report, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); return report;
}
module.exports = { harness, controller, realInput, frames, play, verify, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
