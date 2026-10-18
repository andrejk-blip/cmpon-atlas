#!/usr/bin/env node
'use strict';

// Uses both frozen cores and their actual movement, fire, pulse, cards and exits.
// The completion controller never changes health, enemy AI, rewards or timers.
//   node tests/decks-regression.cjs --report /tmp/decks.json
//   node tests/decks-regression.cjs --render /tmp/decks-png --report /tmp/decks.json
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHarness, nativeCanvas, clone } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');
const patchPath = path.join(root, 'assets/citadel-decks-v1.9.1.js');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const near = (a, b, message, tolerance = 1e-7) => assert(Math.abs(a - b) < tolerance, `${message}: ${a} / ${b}`);

function args(argv) {
  const options = { cores: [], render: null, report: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--core') options.cores.push(path.resolve(argv[++i]));
    else if (argv[i] === '--render') options.render = path.resolve(argv[++i]);
    else if (argv[i] === '--report') options.report = path.resolve(argv[++i]);
    else if (argv[i] === '--only') options.only = argv[++i];
    else throw Error('Unknown argument: ' + argv[i]);
  }
  if (!options.cores.length) options.cores = [path.join(root, 'assets/atlas-v1.3.5.js'),
    path.resolve(root, '../cmpon-analytics-admin/game-lab/engine-v1.2.1.js')].filter(fs.existsSync);
  return options;
}
function helpers(h) {
  if (h.deckQA) return h.deckQA;
  vm.runInContext(`
  // The admin core predates CUP's getState method. Observe the original random
  // stream without replacing its values, so a fixture roundtrip can replay it.
  if (typeof arcadeSeed(1).getState !== 'function') {
    const baseSeed=arcadeSeed;
    arcadeSeed=function(seed){let draws=0;const stream=baseSeed(seed);const random=()=>{draws++;return stream()};random.getState=()=>({seed,draws});return random;};
  }
  globalThis.deckQA = {
    api: globalThis.CITADEL_DECK_COMBAT, path: stationPath, line: stationLine,
    walkable: stationWalkable, nav: stationBuildNav, make: stationMakeDeck,
    remark: e => citadelRemarkCase(e, e.board.question), final: i => FINALE_TRIALS[i],
    scene: spaceScene, camera: spaceCamera, hud: drawBoardHUD, mobileHud: drawMobileGameHUD,
    finalHud: drawFinaleHUD, input: arcadeInput, mobile: MOBILE, definitions: CITADEL_DECKS,
    packAdmin: e => JSON.parse(JSON.stringify({engine:e,rng:e.random.getState()}, (k,v) =>
      ['nav','navExtras','guideRoute','guideWatch','pathCache','hullCache','detour','qaEvents'].includes(k) ? undefined :
      v instanceof Map ? {_qaMap:[...v]} : v instanceof Set ? {_qaSet:[...v]} : v)),
    restoreAdmin: snapshot => {
      const s = JSON.parse(JSON.stringify(snapshot), (k,v) => v && v._qaMap ? new Map(v._qaMap) : v && v._qaSet ? new Set(v._qaSet) : v);
      const e = new RequirementArcade(s.engine.seed,()=>{}); Object.assign(e,s.engine);
      if(typeof snapshot.rng==='object'){e.random=arcadeSeed(snapshot.rng.seed);for(let i=0;i<snapshot.rng.draws;i++)e.random();}
      else e.random=arcadeSeed(snapshot.rng);
      e.emit=()=>{}; if(e.board?.cells)stationBuildNav(e.board); return e;
    }
  };`, h.context);
  h.deckQA = h.context.deckQA;
  return h.deckQA;
}
function harness(core, canvas = null, patched = true) {
  const h = createHarness(core, patched ? patchPath : null, null, canvas);
  helpers(h); return h;
}
function engine(h, tier = 2, { assist = false, seed = 417147, upgrades = { weapons: 2, armor: 1, rockets: 0 } } = {}) {
  const events = [];
  const e = new h.Engine(seed, (kind, data) => events.push({ kind, data }));
  e.assist = assist; e.upgrades = { ...upgrades }; e.beginStage(Math.min(3, tier));
  // A deck fixture starts after its two flight lessons. The completion tests
  // below still answer every interior card through the real answer API.
  e.decisions.push({ stage: e.stage, question: e.stage * 2 }, { stage: e.stage, question: e.stage * 2 + 1 });
  if (tier === 4) { e.beginFinale(); e.beginLair(); } else e.beginBoarding();
  e.qaEvents = events; h.arcade.engine = e; return e;
}
function frames(e, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) e.step(1 / 60, typeof input === 'function' ? input(e, i) : input);
}
function stepUntil(e, predicate, seconds = 10, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    if (predicate(e)) return;
    e.step(1 / 60, typeof input === 'function' ? input(e, i) : input);
  }
  assert(predicate(e), 'Expected game state was reached within ' + seconds + ' seconds');
}
function combatSnapshot(e) {
  return clone({ status: e.status, phase: e.phase, score: e.score, elapsed: e.elapsed,
    entityId: e.entityId, finale: e.finale, hp: e.board?.hp, pos: e.board?.pos,
    completed: e.board?.completed, kills: e.board?.kills, time: e.board?.time,
    invulnerable: e.board?.invulnerable, cooldown: e.board?.cooldown,
    pulseCooldown: e.board?.pulseCooldown, enemies: e.board?.enemies,
    hostile: e.board?.hostile, bullets: e.board?.bullets, decks: e.board?.decks });
}
function saved(h, e) { return h.cupPack ? h.cupPack(e) : h.deckQA.packAdmin(e); }
function restored(h, snapshot) {
  const e = h.cupUnpack ? h.cupUnpack(snapshot, { seed: snapshot.engine.seed, mode: snapshot.engine.assist ? 'calm' : 'normal' }, () => {})
    : h.deckQA.restoreAdmin(snapshot);
  h.arcade.engine = e; return e;
}

// A path-following test operator. It sees the same route geometry and danger
// tells available to a player, then issues only ordinary input fields. Unlike
// the game's guide it can optionally choose an explicit evasive sidestep.
function createController(h, { fire = true, pulse = true, boost = false, dodge = true, mobile = false } = {}) {
  const q = helpers(h);
  let route = [], room = -1, board = null, previous = null, stalled = 0, goal = null, clock = 0;
  let progressPos = null, progressTime = 0, commitRoute = 0;
  const seen = new Map();
  return e => {
    const b = e.board;
    if (!b?.cells || e.status !== 'boarding' || e.finale && e.finale.phase !== 'maze') return {};
    if (board !== b || room !== b.completed.length) {
      board = b; room = b.completed.length; route = []; previous = b.pos.slice(); stalled = 0; goal = null; seen.clear();
      progressPos = b.pos.slice(); progressTime = clock; commitRoute = 0;
    }
    clock += 1 / 60;
    commitRoute = Math.max(0, commitRoute - 1 / 60);
    if (clock - progressTime > 1.2) {
      // At a shelf corner one-frame LOS changes can alternate a sidestep and
      // its exact reverse. Commit briefly to the real navigation waypoint.
      if (distance(progressPos, b.pos) < .8) { commitRoute = 1.2; route = []; }
      progressPos = b.pos.slice(); progressTime = clock;
    }
    const enemies = b.enemies.filter(x => !x.dead && x.hp > 0 && (x.decksRoom ?? x.zone ?? room) === room);
    const visible = enemies.filter(x => distance(x.pos, b.pos) < 25 && q.line(b, b.pos, x.pos, .08));
    visible.sort((x, y) => (distance(x.pos, b.pos) - (x.archetype === 'relay' ? 7 : 0)) -
      (distance(y.pos, b.pos) - (y.archetype === 'relay' ? 7 : 0)));
    const focus = visible[0] || enemies.slice().sort((x, y) => distance(x.pos, b.pos) - distance(y.pos, b.pos))[0];
    const target = room >= 3 ? b.exit : focus ? focus.pos : b.terminals[room];
    stalled = previous && distance(previous, b.pos) < .002 ? stalled + 1 / 60 : 0;
    previous = b.pos.slice();
    if (!route.length || stalled > .8 || !goal || distance(goal, target) > 2) {
      route = q.path(b, b.pos, target); stalled = 0; goal = target.slice();
    }
    while (route.length && (distance(route[0], b.pos) < .08 || distance(route[0], b.pos) < .55 &&
      route.length > 1 && q.line(b, b.pos, route[1], .68, true))) route.shift();
    const speed = boost && b.energy > 4 ? 10.5 : 6.5, next = route[0] || b.pos;
    const length = Math.max(distance(next, b.pos), speed / 60, .001);
    let dx = (next[0] - b.pos[0]) / length, dz = (next[2] - b.pos[2]) / length;
    const close = enemies.filter(x => distance(x.pos, b.pos) < 9);
    const dangerous = close.find(x => x.decksAttack && ['windup', 'strike'].includes(x.decksAttack.phase));
    if (dodge && !commitRoute && visible.length && distance(focus.pos, b.pos) < 22) {
      const d = Math.max(.001, distance(focus.pos, b.pos)), ux = (focus.pos[0] - b.pos[0]) / d, uz = (focus.pos[2] - b.pos[2]) / d;
      const radial = Math.max(-1.2, Math.min(1, (d - 13) / 4));
      const wanted = [ux * radial - uz * .85, uz * radial + ux * .85];
      let best = -Infinity;
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
        const to = [b.pos[0] + x * 3, b.pos[1], b.pos[2] + z * 3];
        if (!q.line(b, b.pos, to, .7, true)) continue;
        let value = x * wanted[0] + z * wanted[1];
        if (!q.line(b, to, focus.pos, .15)) value -= 1.5;
        for (const enemy of close) value -= Math.max(0, 5 - distance(to, enemy.pos)) * .7;
        for (const enemy of enemies) {
          const a = enemy.decksAttack;
          if (!a || a.phase === 'recover') continue;
          if (a.kind === 'rocket') value -= Math.max(0, a.radius + 1 - distance(to, a.aim)) * 2;
          else {
            const rx = to[0] - a.origin[0], rz = to[2] - a.origin[2], along = rx * a.direction[0] + rz * a.direction[2];
            const across = Math.abs(rx * a.direction[2] - rz * a.direction[0]);
            if (along > -1 && along < 11) value -= Math.max(0, a.radius + 1 - across) * 2;
          }
        }
        if (value > best) { best = value; dx = x; dz = z; }
      }
    }
    let aim;
    if (visible.length) {
      const old = seen.get(focus.id), lead = Math.min(.35, distance(focus.pos, b.pos) / 54);
      const vx = old && clock - old.time < .1 ? (focus.pos[0] - old.pos[0]) / (clock - old.time) : 0;
      const vz = old && clock - old.time < .1 ? (focus.pos[2] - old.pos[2]) / (clock - old.time) : 0;
      aim = [focus.pos[0] + vx * lead, 0, focus.pos[2] + vz * lead];
    }
    for (const x of enemies) seen.set(x.id, { pos: x.pos.slice(), time: clock });
    const control = { moveX: dx, moveZ: dz, fire, boost,
      aim, pulse: pulse && b.pulseCooldown <= 0 && (close.length >= 2 || !!dangerous || close.some(x => x.archetype === 'shield')) };
    if (!mobile) return control;
    h.arcade.engine = e; h.arcade.joystick = { x: dx, y: dz };
    h.arcade.firePointer = fire ? 1 : null; h.arcade.boardAim = aim;
    h.arcade.pulseQueued = control.pulse;
    boost ? h.arcade.keys.add('TouchBoost') : h.arcade.keys.delete('TouchBoost');
    return q.input();
  };
}
const controllers = new WeakMap();
function controller(h, e, options = {}) {
  if (!controllers.has(e)) controllers.set(e, createController(h, options));
  return controllers.get(e)(e);
}
function answerCard(h, e, wrong = false) {
  if (e.status === 'remark') {
    const correct = h.deckQA.remark(e).correct;
    e.answer(wrong ? (correct + 1) % 3 : correct); e.continueRemark();
  } else if (e.status === 'finalcheck') {
    const correct = h.deckQA.final(e.board.completed.length).correct;
    e.answerFinale(wrong ? (correct + 1) % 3 : correct); e.continueFinaleCheck();
  } else throw Error('Not at a card: ' + e.status);
}
function attackFixture(h, kind, { assist = false, tier = 2, room = 0 } = {}) {
  const e = engine(h, tier, { assist, upgrades: { weapons: 0, armor: 0, rockets: 0 } }), b = e.board;
  if (room) { b.completed = Array.from({ length: room }, (_, i) => e.stage * 3 + i); b.enemies = []; e.spawnBoardWave(1); }
  const x = b.enemies.find(x => x.archetype === kind);
  assert(x, kind + ' present in encounter fixture');
  b.enemies = [x]; b.decks.waves = []; b.decks.closed = false;
  b.pos = [0, 0, -20]; b.previous = b.pos.slice(); b.camera = b.pos.slice(); b.invulnerable = 0;
  x.pos = [0, 0, kind === 'rocketeer' ? -5 : kind === 'ninja' ? -13 : -17];
  x.shot = 0; x.alert = true; x.decksArrival = 0; x.route = [];
  e.step(1 / 60, {}); assert.equal(x.decksAttack?.phase, 'windup');
  return { e, x };
}
function finishFirstAttack(e, x, input = {}) {
  const id = x.decksAttack.id;
  stepUntil(e, () => (!x.decksAttack || x.decksAttack.id !== id || x.decksAttack.phase === 'recover') && !e.board.decks.rockets.length,
    5, input);
}
function followToFinish(h, tier, assist, mobile = false, upgrades) {
  const e = engine(h, tier, { assist, ...(upgrades ? { upgrades } : {}) });
  const b = e.board, control = createController(h, { mobile }), startedAt = e.elapsed;
  const rooms = []; let minimumHp = 100, maximumAlive = 0, priorKills = 0, priorTime = 0, finalBoard = null;
  for (let frame = 0; frame < 60 * 240; frame++) {
    if (['remark', 'finalcheck'].includes(e.status)) {
      const s = b.decks;
      rooms.push({ room: b.completed.length + 1, time: +(b.time - priorTime).toFixed(2), hp: +b.hp.toFixed(2),
        kills: b.kills - priorKills, survivors: h.deckQA.api.clearance(e).alive, pending: h.deckQA.api.clearance(e).pending,
        initial: h.deckQA.api.profile(e).initial,
        spawned: s.spawned, wavesLanded: s.wavesLanded,
        reinforcementAttacks: s.attacksByRoom[b.completed.length], reinforcementHits: s.engagementByRoom[b.completed.length] });
      priorTime = b.time; priorKills = b.kills;
      assert.equal(h.deckQA.api.clearance(e).remaining, 0, 'Every actual terminal follows full current-room clearance');
      const correctReward = e.status === 'remark' ? 500 : 700, score = e.score;
      answerCard(h, e); assert.equal(e.score - score, correctReward, 'Only the actual correct card reward');
      if (b.completed.length === 3) finalBoard = { cardsTime: b.time, kills: b.kills, spawned: s.spawned,
        wavesLanded: s.wavesLanded, reinforcementAttacks: s.reinforcementAttacks, attacksByRoom: clone(s.attacksByRoom) };
      continue;
    }
    if (e.status !== 'boarding' || e.board !== b || tier === 4 && e.finale.phase !== 'maze') break;
    const input = control(e);
    assert(Math.abs(input.moveX) <= 1.00001 && Math.abs(input.moveZ) <= 1.00001, 'Reachable movement input');
    e.step(1 / 60, input); minimumHp = Math.min(minimumHp, b.hp); maximumAlive = Math.max(maximumAlive, b.enemies.length);
  }
  assert.equal(rooms.length, 3, 'All three cards reached by movement at level ' + (tier === 4 ? 13 : tier * 3 + 2) +
    ', status=' + e.status + ', hp=' + b.hp + ', pos=' + b.pos + ', gate=' + JSON.stringify(h.deckQA.api.clearance(e)));
  assert(e.status === 'stageclear' || tier === 3 && e.status === 'finalebrief' || tier === 4 && e.finale.phase === 'mrg',
    'Actual exit transition: ' + e.status + ' / ' + e.finale?.phase);
  assert(minimumHp > 0, 'No health replacement during completion');
  if (tier > 0) {
    for (const room of rooms) assert(room.reinforcementHits > 0,
      `Player actually fought the reinforcement before card, level ${tier === 4 ? 13 : tier * 3 + 2} room ${room.room}: ${JSON.stringify(room)}`);
  }
  assert(maximumAlive <= h.deckQA.api.profile({ ...e, finale: tier === 4 ? { phase: 'maze' } : null, stage: tier }).cap);
  return { level: tier === 4 ? 13 : tier * 3 + 2, assist, mobile, minimumHp: +minimumHp.toFixed(2),
    maximumAlive, score: e.score, status: e.status, finale: e.finale?.phase || null, rooms, ...finalBoard, time: e.elapsed - startedAt };
}

function runCore(core, canvas = null, only = null) {
  const h = harness(core, canvas), q = h.deckQA;
  const results = { core: path.basename(core), coreSha256: crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex'),
    groups: [], completions: [], serializer: h.cupPack ? 'actual CUP pack/unpack' : 'VM Map/Set fixture roundtrip; admin core has no CUP API' };
  function test(name, fn) {
    if (only && !name.includes(only)) return;
    const started = performance.now(), detail = fn();
    results.groups.push({ name, pass: true, seconds: +(performance.now() - started).toFixed(0) / 1000, ...(detail ? { detail } : {}) });
    console.log(path.basename(core) + ': PASS ' + name);
  }
  test('teaching-deck unchanged and boss scope isolated', () => {
    const bare = harness(core, null, false), a = engine(h, 0), z = engine(bare, 0);
    assert.deepEqual(clone(a.board.enemies), clone(z.board.enemies));
    frames(a, 5, { moveZ: -1, fire: true }); frames(z, 5, { moveZ: -1, fire: true });
    near(a.board.hp, z.board.hp, 'Tutorial health'); near(a.score, z.score, 'Tutorial rewards');
    assert.deepEqual(clone(a.board.pos), clone(z.board.pos));
    assert.equal(q.api.status(a).pending, 0); assert.equal(a.board.decks.wavesLanded, 0);
    for (const phase of ['boss', 'breach', 'mrg', 'upload']) {
      const e = engine(h, 3); e.beginFinale();
      if (phase === 'mrg') e.beginMRG(); else e.finale.phase = phase;
      assert.equal(q.api.active(e), false, phase + ' excluded');
    }
  });
  test('room and campaign progression plus extended navigable maze', () => {
    let previous = 0;
    for (let tier = 0; tier <= 4; tier++) {
      const e = engine(h, tier), b = e.board;
      const profiles = [0, 1, 2].map(room => q.api.profile(e, room));
      assert(profiles[0].initial >= previous); previous = profiles[0].initial;
      if (tier > 0) {
        assert(profiles[0].initial < profiles[1].initial && profiles[1].initial < profiles[2].initial);
        assert(profiles[0].damage < profiles[1].damage && profiles[1].damage < profiles[2].damage);
        assert(b.enemies.some(x => x.archetype === 'rocketeer'));
        if (tier >= 2) for (const kind of ['ninja', 'robodog']) assert(b.enemies.some(x => x.archetype === kind));
      }
      let from = b.pos, length = 0;
      for (const to of [...b.terminals, b.exit]) {
        const route = q.path(b, from, to); assert(route.length > 0, 'Connected terminal/exit in tier ' + tier);
        for (const p of route) { assert(q.line(b, from, p, .64, true), 'Route segment has real clearance'); length += distance(from, p); from = p; }
        from = to;
      }
      if (tier === 4) { assert.equal(b.definition.addedLength, 56); assert(length > 325); assert.equal(b.exit[2], -224); }
    }
    assert.equal(q.definitions[4].exit[2], -168, 'Global original maze definition remains unchanged');
  });
  test('visible rocket dash and pounce strike stationary targets and permit touch evasion', () => {
    const detail = [];
    for (const assist of [false, true]) for (const kind of ['rocketeer', 'ninja', 'robodog']) {
      const still = attackFixture(h, kind, { assist }), evade = attackFixture(h, kind, { assist });
      const a = still.x.decksAttack, expected = a.damage * (assist ? .65 : 1);
      frames(still.e, Math.max(0, a.windup - .1)); assert.equal(still.e.board.hp, 100, 'No early windup damage');
      finishFirstAttack(still.e, still.x);
      near(100 - still.e.board.hp, expected, kind + ' deals one strike of configured damage');
      assert.equal(still.e.board.decks.hits, 1, 'No repeated damage from one strike');
      h.arcade.engine = evade.e; h.arcade.joystick = { x: 1, y: 0 }; h.arcade.firePointer = null;
      h.arcade.keys.clear(); q.mobile.autoFire = false;
      finishFirstAttack(evade.e, evade.x, () => q.input());
      assert.equal(evade.e.board.hp, 100, 'Same attack evaded by real joystick input: ' + kind);
      assert(distance(evade.e.board.pos, [0, 0, -20]) >= 3.3, 'Touch input physically moved hero');
      detail.push({ kind, assist, windup: a.windup, damage: +expected.toFixed(3), evadeHp: evade.e.board.hp });
    }
    h.arcade.joystick = null; return detail;
  });
  test('damage growth covers ordinary sniper and shield shots without duplicate scaling', () => {
    const detail = [];
    for (const kind of ['sniper', 'shield']) for (const assist of [false, true]) {
      let previous = 0;
      for (let room = 0; room < 3; room++) {
        const e = engine(h, 3, { assist }), b = e.board;
        b.completed = Array.from({ length: room }, (_, i) => 9 + i); b.enemies = []; e.spawnBoardWave(10);
        let x = b.enemies.find(x => x.archetype === kind);
        if (!x) {
          // Existing sniper uses hard-coded core projectile damage. This focused
          // fixture reuses a core sniper; the addon must scale its emitted shot.
          const source = engine(h, 0).board.enemies.find(x => x.archetype === kind);
          x = source; x.decksDamage = q.api.profile(e).damage;
        }
        b.enemies = [x]; b.pos = [0, 0, -20]; x.pos = [0, 0, -4]; x.shot = 0; x.alert = true;
        x.charge = kind === 'sniper' ? .01 : 0; x.aim = b.pos.slice(); b.hostile = [];
        e.enemyBoardStep(x, .02);
        assert(b.hostile.length > 0); const first = b.hostile[0].damage;
        const base = kind === 'sniper' ? (assist ? 7 : 13) : x.damage * (assist ? .65 : 1);
        near(first, base * q.api.profile(e).damage, 'Scaled actual core projectile');
        e.enemyBoardStep(x, .02); near(b.hostile[0].damage, first, 'Existing projectile not scaled twice');
        assert(first > previous); previous = first;
        detail.push({ kind, assist, room: room + 1, damage: first });
      }
    }
    return detail;
  });
  test('reinforcement delay rear placement cap and interruptible call', () => {
    const e = engine(h, 3), b = e.board;
    b.pos = [0, 0, -11]; b.previous = b.pos.slice(); b.invulnerable = 1000;
    for (const x of b.enemies) x.stun = 1000;
    stepUntil(e, () => b.decks.waves[0].phase === 'signal');
    const first = b.decks.waves[0], count = b.enemies.length, start = b.time;
    assert(first.timer >= 1.5 && first.timer <= 2.5);
    frames(e, first.timer - .1); assert.equal(b.enemies.length, count, 'No spawn before warning ends');
    stepUntil(e, () => first.phase === 'done'); assert(b.time - start >= 2.05);
    const spawns = b.decks.events.filter(x => x.kind === 'spawn-reinforcement');
    assert(spawns.length > 0); assert(spawns.every(x => x.distance >= 8));
    assert(spawns.every(x => x.pos[2] > x.player[2]), 'Rear entrance is on the traversed side');
    for (const x of b.enemies) x.stun = 1000;
    frames(e, 12);
    assert.equal(b.enemies.length, q.api.profile(e).cap, 'The encounter actually reaches the simultaneous cap');
    assert(q.api.status(e).pending > 0, 'Excess reinforcement waits rather than disappearing');
    const spawnedAtCap = b.decks.spawned;
    e.boardHit(b.enemies[0], b.enemies[0].hp + 1, b.pos, true);
    stepUntil(e, () => b.decks.spawned > spawnedAtCap, 6);
    assert.equal(b.enemies.length, q.api.profile(e).cap, 'Only the freed slot is filled');
    const callEngine = engine(h, 3), cb = callEngine.board;
    cb.pos = [0, 0, -11]; cb.previous = cb.pos.slice(); cb.invulnerable = 1000;
    for (const x of cb.enemies) if (x.archetype !== 'relay') x.stun = 1000;
    stepUntil(callEngine, () => cb.decks.waves.some(w => w.ownerId !== null && w.phase === 'signal'), 15);
    const call = cb.decks.waves.find(w => w.ownerId !== null && w.phase === 'signal');
    const relay = cb.enemies.find(x => x.id === call.ownerId), score = callEngine.score;
    callEngine.boardHit(relay, relay.hp + 1, cb.pos, true);
    assert.equal(call.phase, 'cancelled'); assert.equal(callEngine.score - score, 110);
    callEngine.boardHit(relay, 1, cb.pos, true); assert.equal(callEngine.score - score, 110, 'No duplicate kill reward');
    return { warning: q.api.profile(e).warning, rearMinimumDistance: Math.min(...spawns.map(x => x.distance)),
      cap: q.api.profile(e).cap, cancelledCall: call.id };
  });
  test('pause and save restore midwarning midstrike and in flight preserve encounter', () => {
    const detail = [];
    const warning = engine(h, 3); warning.board.pos = [0, 0, -11]; warning.board.previous = warning.board.pos.slice();
    stepUntil(warning, () => warning.board.decks.waves[0].phase === 'signal');
    const scenarios = [['warning', warning]];
    const maze = engine(h, 4), mb = maze.board;
    mb.completed = [0]; maze.finale.tests = [0]; mb.enemies = [];
    mb.pos = [12, 0, -70]; mb.previous = mb.pos.slice(); maze.spawnBoardWave(1);
    stepUntil(maze, () => mb.decks.waves[0].phase === 'signal');
    scenarios.push(['extended-maze-warning', maze]);
    for (const kind of ['ninja', 'rocketeer']) {
      const { e, x } = attackFixture(h, kind); frames(e, .4); scenarios.push([kind + '-windup', e]);
      const next = attackFixture(h, kind);
      stepUntil(next.e, () => kind === 'ninja' ? next.x.decksAttack?.phase === 'strike' : next.e.board.decks.rockets.length > 0);
      scenarios.push([kind === 'ninja' ? 'dash-strike' : 'rocket-flight', next.e]);
    }
    for (const [name, e] of scenarios) {
      e.pause(); const paused = combatSnapshot(e); frames(e, 5); assert.deepEqual(combatSnapshot(e), paused, 'Paused ' + name);
      const pack = saved(h, e), copy = restored(h, pack);
      assert.deepEqual(combatSnapshot(copy), combatSnapshot(e), 'Restore exact encounter ' + name);
      if (name === 'extended-maze-warning') {
        assert.equal(copy.board.definition.decksVersion, '1.9.0'); assert.equal(copy.board.exit[2], -224);
        assert.deepEqual(Array.from(copy.board.cells.keys()), Array.from(e.board.cells.keys()), 'Expanded floor survives saved roundtrip');
      }
      e.resume(); copy.resume();
      for (let i = 0; i < 160; i++) {
        e.step(1 / 60, { moveX: i < 50 ? .5 : 0 }); copy.step(1 / 60, { moveX: i < 50 ? .5 : 0 });
      }
      assert.deepEqual(combatSnapshot(copy), combatSnapshot(e), 'Deterministic continuation ' + name);
      detail.push({ name, hp: e.board.hp, score: e.score, spawned: e.board.decks.spawned });
    }
    return detail;
  });
  test('pulse cancels preparations and nearby rockets and respects shields and walls', () => {
    for (const kind of ['rocketeer', 'ninja', 'robodog']) {
      const { e, x } = attackFixture(h, kind);
      if (kind === 'rocketeer') { x.pos = [0, 0, -11]; x.decksAttack.origin = x.pos.slice(); }
      assert.equal(e.boardPulse(), true); assert.equal(x.decksAttack, null); assert(x.stun > 0);
      frames(e, 1.5); assert.equal(e.board.hp, 100);
      assert.equal(e.boardPulse(), false, 'Real pulse cooldown retained');
    }
    const { e, x } = attackFixture(h, 'rocketeer');
    stepUntil(e, () => e.board.decks.rockets.length > 0);
    stepUntil(e, () => distance(e.board.decks.rockets[0].pos, e.board.pos) < 11.5);
    const rockets = e.board.decks.rockets.length; e.boardPulse(); assert(rockets > 0); assert.equal(e.board.decks.rockets.length, 0);
    const cover = attackFixture(h, 'rocketeer').e, b = cover.board;
    b.enemies = []; b.crates.push({ x: 0, z: -15, w: 2, h: .8 });
    b.decks.rockets = [{ id: 999, owner: x.id, pos: [0, 0, -12], aim: [0, 0, -20], vel: [0, 0, -12],
      life: 3, radius: 3.2, damage: 30, color: '#ffaa66' }];
    frames(cover, 1); assert.equal(b.hp, 100, 'A rocket stops at actual cover'); assert.equal(b.decks.rockets.length, 0);
    b.crates = b.crates.filter(c => c.z !== -15);
    b.decks.rockets = [1, 2].map(id => ({ id, pos: [0, 0, -19.9], aim: b.pos.slice(), vel: [0, 0, -12], life: 1, radius: 3.2, damage: 20, color: '#ffaa66' }));
    cover.step(1 / 60, {}); near(b.hp, 80, 'Overlapping blasts respect shared invulnerability');
  });
  test('terminal requires current enemies and its complete queue without resetting wrong answers', () => {
    for (const tier of [0, 1, 2, 3, 4]) {
      const e = engine(h, tier), b = e.board;
      b.pos = b.terminals[0].slice(); b.previous = b.pos.slice();
      assert(b.enemies.length > 0);
      const initial = combatSnapshot(e); e.boardInteract(); assert.equal(e.status, 'boarding');
      assert.deepEqual(clone(b.enemies), initial.enemies, 'A locked terminal never deletes living guards');
      assert(q.api.clearance(e).text.includes('Зачистите комнату · осталось '));
      // Focused gate fixture: kill through the actual hit/reward method. Full
      // playthroughs below use movement and projectiles, never direct damage.
      b.invulnerable = 1000;
      for (let frame = 0; frame < 60 * 45 && e.status === 'boarding'; frame++) {
        for (const x of b.enemies) if ((x.decksRoom ?? x.zone) === 0 && !x.dead) e.boardHit(x, x.hp + 1, b.pos, true);
        if (q.api.clearance(e).pending) { e.boardInteract(); assert.equal(e.status, 'boarding', 'Even an empty room waits for its finite queue'); }
        e.step(1 / 60, {});
      }
      assert(['remark', 'finalcheck'].includes(e.status)); assert(b.decks.closed);
      assert.equal(q.api.clearance(e).remaining, 0);
      const before = e.score;
      const paused = combatSnapshot(e); frames(e, 10); assert.deepEqual(combatSnapshot(e), paused);
      e.boardInteract(); assert.deepEqual(combatSnapshot(e), paused, 'Direct interaction cannot reopen a card');
      answerCard(h, e, true); assert(['remark', 'finalcheck'].includes(e.status)); assert.equal(b.completed.length, 0);
      assert.equal(b.enemies.length, 0, 'Wrong answer cannot respawn killed enemies');
      assert(e.score <= before, 'Wrong answer never gets a reward');
      answerCard(h, e); assert.equal(b.completed.length, 1); assert.equal(e.status, 'boarding');
      assert.equal(b.enemies.length, q.api.profile(e).initial); assert(!b.decks.closed);
      const next = combatSnapshot(e); e.continueRemark(); if (tier === 4) e.continueFinaleCheck();
      assert.deepEqual(combatSnapshot(e), next, 'Repeated continue cannot spawn or reward twice');
    }
  });
  test('future-room guards neither lock the terminal nor occupy current reinforcement slots', () => {
    for (const tier of [0, 3, 4]) {
      const e = engine(h, tier), b = e.board, source = clone(b.enemies[0]);
      const future = Array.from({ length: q.api.profile(e).cap }, (_, i) => ({ ...clone(source),
        id: ++e.entityId, zone: 1, decksRoom: 1, hp: 17 + i, pos: b.definition.centers[1].slice() }));
      for (const x of b.enemies) e.boardHit(x, x.hp + 1, b.pos, true);
      b.enemies.push(...future); b.pos = b.terminals[0].slice(); b.previous = b.pos.slice(); b.invulnerable = 1000;
      for (let frame = 0; frame < 60 * 40 && e.status === 'boarding'; frame++) {
        for (const x of b.enemies) if ((x.decksRoom ?? x.zone) === 0 && !x.dead) e.boardHit(x, x.hp + 1, b.pos, true);
        e.step(1 / 60, {});
      }
      assert(['remark', 'finalcheck'].includes(e.status));
      assert.equal(q.api.clearance(e).remaining, 0, 'Future population is excluded');
      const score = e.score, hp = future.map(x => x.hp); answerCard(h, e);
      for (const x of future) assert(b.enemies.includes(x), 'Exactly the same living future-room object survives core continuation');
      assert.deepEqual(future.map(x => x.hp), hp); assert.equal(e.score - score, tier === 4 ? 700 : 500);
      assert.equal(q.api.clearance(e).alive, future.length, 'Those enemies become relevant only in their own room');
      assert.equal(b.enemies.length, Math.max(q.api.profile(e).initial, future.length), 'Existing cohort is not duplicated');
    }
  });
  test('shared contact damage cooldown respects armor assist pause cards and saved time', () => {
    const detail = [];
    for (const tier of [0, 1, 4]) for (const assist of [false, true]) {
      const e = engine(h, tier, { assist, upgrades: { weapons: 0, armor: 0, rockets: 0 } }), b = e.board;
      b.pos = [0, 0, -20]; b.previous = b.pos.slice(); b.invulnerable = 0; b.decks.waves = [];
      b.enemies = b.enemies.slice(0, 3);
      for (const x of b.enemies) { x.pos = b.pos.slice(); x.stun = 100; x.decksArrival = 0; }
      e.step(1 / 60, {}); const amount = 3 * (assist ? .65 : 1);
      near(100 - b.hp, amount, 'Several overlapping bodies deal one small contact hit');
      assert.equal(b.decks.contactHits, 1);
      frames(e, .3); e.pause(); const stopped = combatSnapshot(e);
      frames(e, 3, { moveX: 1, fire: true }); e.stepBoard(.04, {}); e.boardInteract();
      assert.deepEqual(combatSnapshot(e), stopped, 'Direct and scheduled paused calls are harmless');
      const copy = restored(h, saved(h, e)); e.resume(); copy.resume();
      frames(e, .3); frames(copy, .3); near(100 - b.hp, amount, 'Pause and reload cannot shorten the cooldown');
      frames(e, .32); frames(copy, .32);
      assert.deepEqual(combatSnapshot(copy), combatSnapshot(e));
      near(100 - b.hp, amount * 2, 'Second contact occurs only after 0.9 seconds');
      assert.equal(b.decks.contactHits, 2);
      for (const x of b.enemies) e.boardHit(x, x.hp + 1, b.pos, true);
      b.pos = b.terminals[0].slice(); e.boardInteract(); assert(['remark', 'finalcheck'].includes(e.status));
      const card = combatSnapshot(e); frames(e, 5, { pulse: true }); assert.deepEqual(combatSnapshot(e), card);
      detail.push({ level: tier === 4 ? 13 : tier * 3 + 2, assist, damage: amount, cooldown: .9 });
    }
    const armored = engine(h, 0, { upgrades: { weapons: 0, armor: 2, rockets: 0 } }), ab = armored.board;
    ab.pos = [0, 0, -20]; ab.previous = ab.pos.slice(); ab.invulnerable = 0; ab.enemies = ab.enemies.slice(0, 1);
    ab.enemies[0].pos = ab.pos.slice(); ab.enemies[0].stun = 100; armored.step(1 / 60, {});
    near(100 - ab.hp, 3 * .8 ** 2, 'Existing armor remains effective for contact damage');
    return detail;
  });
  test('unreachable guard returns after a saved warning with its identity health and rewards intact', () => {
    const e = engine(h, 0), b = e.board, x = b.enemies[0];
    b.enemies = [x]; b.pos = [0, 0, -20]; b.previous = b.pos.slice(); b.invulnerable = 100;
    x.pos = [1000, 0, 1000]; x.hp = 17; const score = e.score, kills = b.kills;
    stepUntil(e, () => b.decks.recoveries.length > 0, 14);
    assert.equal(b.decks.recoveries[0].timer, 2.1, 'A visible recovery warning precedes relocation');
    assert.equal(b.decks.recovered, 0); assert.equal(x.hp, 17);
    const copy = restored(h, saved(h, e));
    frames(e, 1); frames(copy, 1); assert.equal(b.decks.recovered, 0);
    frames(e, 1.2); frames(copy, 1.2);
    assert.deepEqual(combatSnapshot(copy), combatSnapshot(e), 'Recovery survives an exact save continuation');
    assert.equal(b.decks.recovered, 1); assert.equal(b.enemies[0], x); assert.equal(x.hp, 17);
    assert(distance(x.pos, b.pos) >= 8); assert(q.path(b, b.pos, x.pos).length || q.line(b, b.pos, x.pos, .68, true));
    assert.equal(e.score, score); assert.equal(b.kills, kills);
    const useful = engine(h, 0), ub = useful.board, sniper = ub.enemies.find(x => x.archetype === 'sniper');
    ub.enemies = [sniper]; ub.pos = [0, 0, -20]; ub.previous = ub.pos.slice(); ub.invulnerable = 100;
    sniper.pos = [0, 0, -5]; sniper.alert = true;
    frames(useful, 16); assert.equal(ub.decks.recovered, 0, 'A stationary sniper with line of fire is not treated as stranded');
    return { warning: 2.1, recoveredId: x.id, preservedHp: x.hp, distance: distance(x.pos, b.pos) };
  });
  test('1.9.0 completed partial and open-card checkpoints migrate without refilling waves', () => {
    const oldHarness = createHarness(core, path.join(root, 'assets/citadel-decks-v1.9.0.js')); helpers(oldHarness);
    for (const phase of ['done', 'partial', 'open', 'answered']) {
      const old = engine(oldHarness, 4), ob = old.board;
      ob.decks.waves[0].phase = phase === 'done' ? 'done' : 'signal';
      ob.decks.waves[0].remaining = phase === 'done' ? [] : ['ninja']; ob.decks.waves[0].timer = 1.4;
      ob.enemies[0].hp = 17; for (const x of ob.enemies) x.stun = 100;
      if (phase === 'open' || phase === 'answered') {
        ob.pos = ob.terminals[0].slice(); old.boardInteract();
        if (phase === 'answered') old.answerFinale(oldHarness.deckQA.final(0).correct);
      }
      const e = restored(h, saved(oldHarness, old)), b = e.board, remaining = clone(ob.decks.waves.map(x => x.remaining));
      const ids = b.enemies.map(x => x.id), hp = b.enemies.map(x => x.hp);
      if (e.status === 'boarding') {
        e.step(1 / 60, {}); assert.equal(b.decks.version, '1.9.1');
        assert.deepEqual(clone(b.decks.waves.map(x => x.remaining)), remaining);
        assert.deepEqual(b.enemies.map(x => x.id), ids); assert.equal(b.enemies[0].hp, 17);
      } else {
        const preserved = b.enemies.slice(), score = e.score;
        if (phase === 'open') e.answerFinale(q.final(0).correct);
        e.continueFinaleCheck(); assert.equal(b.completed.length, 1); assert.equal(e.score - score, 700);
        for (const x of preserved) assert(b.enemies.includes(x));
        assert.deepEqual(preserved.map(x => x.hp), hp);
        assert.equal(q.api.clearance(e).alive, q.api.profile(e).initial);
        const stable = combatSnapshot(e); e.continueFinaleCheck(); assert.deepEqual(combatSnapshot(e), stable);
      }
      assert.equal(b.definition.addedLength, 56); assert.equal(q.api.status(e).extendedMaze, true);
      assert.equal(b.exit[2], -224, 'Saved stretched maze keeps the architecture marker independent of combat version');
    }
  });
  test('legacy in-progress save retains player map enemy health and finite grace', () => {
    const bare = harness(core, null, false), old = engine(bare, 4);
    old.board.pos = [-24, 0, -22]; old.board.previous = old.board.pos.slice(); old.board.hp = 61;
    old.score = 4567; old.board.enemies[0].hp = 17;
    const mapSize = old.board.cells.size, positions = old.board.enemies.map(x => x.pos.slice());
    const pack = saved(bare, old), e = restored(h, pack), hp = e.board.hp, score = e.score;
    assert.equal(e.board.enemies[0].hp, 17, 'Restore keeps an injured enemy injured');
    e.step(1 / 60, {}); old.step(1 / 60, {});
    assert.equal(e.board.cells.size, mapSize); assert.equal(e.board.exit[2], -168);
    assert.equal(e.board.definition.decksVersion, undefined, 'Old saved maze is not stretched under the hero');
    assert.equal(e.board.hp, hp); assert.equal(e.score, score);
    near(e.board.enemies[0].hp, old.board.enemies[0].hp, 'Only the original relay healing may change restored HP');
    assert.equal(e.board.decks.wavesLanded, 0); assert(e.board.decks.grace >= 2.9);
    assert.equal(e.board.enemies.length, positions.length, 'No duplicate initial wave on load');
    const s = e.board.decks; frames(e, 1); assert.equal(e.board.decks, s);
  });
  test('real complete rooms ordinary input both modes desktop and mobile', () => {
    for (const assist of [false, true]) for (const tier of [0, 1, 2, 3, 4]) {
      h.context.innerWidth = assist ? 390 : 1280; h.context.matchMedia = () => ({ matches: assist });
      const result = followToFinish(h, tier, assist, assist); results.completions.push(result);
      console.log(path.basename(core) + ': cleared level ' + result.level + ' ' + (assist ? 'calm/touch' : 'normal/desktop') +
        ', kills=' + result.kills + ', minimumHP=' + result.minimumHp + ', seconds=' + result.time.toFixed(2));
    }
    h.context.matchMedia = () => ({ matches: false }); h.arcade.joystick = null; h.arcade.firePointer = null;
    return results.completions.map(x => ({ level: x.level, assist: x.assist, minimumHp: x.minimumHp,
      reinforcementAttacks: x.reinforcementAttacks, time: +x.time.toFixed(2), status: x.status, finale: x.finale }));
  });
  return { h, ...results };
}

function renderFrames(h, dir) {
  fs.mkdirSync(dir, { recursive: true }); const q = h.deckQA, outputs = [];
  for (const [name, width, height, dpr, fx, kind, phase] of [
    ['rocketeer-warning', 1280, 720, 1, true, 'rocketeer', 'windup'],
    ['ninja-strike', 1280, 720, 1, true, 'ninja', 'strike'],
    ['robot-dog-mobile', 390, 520, 2, true, 'robodog', 'windup'],
    ['rocket-landscape', 844, 360, 1, false, 'rocketeer', 'windup'],
    ['dog-short-screen', 592, 270, 1, false, 'robodog', 'strike'],
  ]) {
    const { e, x } = attackFixture(h, kind), b = e.board;
    x.decksAttack.phase = phase; x.decksAttack.time = phase === 'strike' ? .18 : .35;
    if (kind === 'rocketeer') x.pos = [-3, 0, -12];
    b.intro = 0; e.elapsed = 5; b.camera = [0, 0, -17];
    h.context.innerWidth = width; h.context.devicePixelRatio = dpr; h.context.matchMedia = () => ({ matches: width < 900 });
    const canvas = h.createCanvas(width * dpr, height * dpr), hud = h.createCanvas(width * dpr, height * dpr);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
    h.arcade.canvas = canvas; h.arcade.hud = hud; h.arcade.engine = e; h.arcade.fx = fx;
    const cam = q.camera(e, e.elapsed), before = combatSnapshot(e), items = q.scene(e, e.elapsed, fx);
    assert.deepEqual(combatSnapshot(e), before, 'Rendering does not advance encounter');
    if (kind === 'robodog') {
      const legs = items.filter(x => x.decksFeature === 'dog-leg'); assert.equal(legs.length, 4, 'Four separate actual leg meshes');
      assert.equal(items.filter(x => x.decksFeature === 'dog-foot').length, 4);
    }
    if (kind === 'rocketeer') assert(items.some(x => x.decksFeature === 'launcher-muzzle'));
    if (kind === 'ninja') assert.equal(items.filter(x => x.decksFeature === 'knife-blade').length, 2);
    assert(items.some(x => ['danger-ring', 'melee-lane'].includes(x.decksFeature)), 'Attack tell exists with effects setting ' + fx);
    for (const item of items) assert(item.model.every(Number.isFinite), 'Finite model matrix');
    h.draw(canvas.getContext('2d'), items, cam, canvas.width, canvas.height);
    const c = hud.getContext('2d'), texts = [], oldText = c.fillText.bind(c);
    c.fillText = (text, x, y, ...rest) => { texts.push({ text: String(text), x, y, width: c.measureText(String(text)).width }); return oldText(text, x, y, ...rest); };
    (width < 900 ? q.mobileHud : q.hud)(c, e, cam, hud.width, hud.height);
    assert.deepEqual(combatSnapshot(e), before, 'HUD and clearance queries do not mutate saved combat');
    const hp = texts.find(x => x.text.startsWith('ЩИТ ')); assert(hp && hp.y >= 0 && hp.y < (width < 900 ? height : 720));
    const gate = texts.find(x => x.text.startsWith('Зачистите комнату · осталось '));
    assert(gate, 'The locked terminal status is visible on every tested viewport');
    assert(gate.width < (width < 900 ? Math.min(360, width - 12) - 14 : 670), 'Clearance label fits its existing HUD region');
    assert(!texts.some(x => x.text === 'ПОДОЙДИТЕ — ОТКРОЕТСЯ САМ'), 'No misleading terminal invitation during combat');
    canvas.getContext('2d').drawImage(hud, 0, 0);
    const filename = path.basename(h.corePath, '.js') + '-' + name + '.png';
    fs.writeFileSync(path.join(dir, filename), canvas.toBuffer('image/png'));
    outputs.push({ filename, width, height, dpr, effects: fx, items: items.length, healthY: hp.y,
      clearance: gate.text, clearanceY: gate.y, clearanceWidth: gate.width });
  }
  return outputs;
}
function main(options = args(process.argv.slice(2))) {
  const start = performance.now(), canvas = options.render ? nativeCanvas() : null;
  const report = { version: '1.9.1', patchSha256: crypto.createHash('sha256').update(fs.readFileSync(patchPath)).digest('hex'),
    environment: 'Real frozen core code in Node VM; optional native Canvas. No browser or physical-device claim.', cores: [] };
  for (const core of options.cores) {
    const result = runCore(core, canvas, options.only);
    if (options.render) result.frames = renderFrames(result.h, options.render);
    delete result.h; report.cores.push(result);
  }
  report.pass = true; report.seconds = +(performance.now() - start).toFixed(0) / 1000;
  report.groups = report.cores.reduce((n, c) => n + c.groups.length, 0);
  if (options.report) { fs.mkdirSync(path.dirname(options.report), { recursive: true }); fs.writeFileSync(options.report, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ pass: true, groups: report.groups, seconds: report.seconds, patchSha256: report.patchSha256 }));
  return report;
}
module.exports = { harness, helpers, engine, frames, attackFixture, createController, controller, answerCard, followToFinish, runCore, renderFrames, main };
if (require.main === module) main();
