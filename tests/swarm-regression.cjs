#!/usr/bin/env node
'use strict';
// Real shipping cores and addon wrappers. The full mission controller issues
// only the same flight input fields as keyboard and touch; it never changes HP,
// cooldowns, targets, progress, enemies, or rewards during its playthrough.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');
const patch = path.join(root, 'assets/citadel-swarm-v1.8.0.js');
const args = process.argv.slice(2), cores = [];
let renderDir = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--render') renderDir = path.resolve(args[++i]);
  else if (args[i] === '--core') cores.push(path.resolve(args[++i]));
  else throw Error('Unknown option: ' + args[i]);
}
if (!cores.length) cores.push(path.join(root, 'assets/atlas-v1.3.5.js'));
const clone = v => JSON.parse(JSON.stringify(v));
const near = (a, b, message, tolerance = 1e-7) => assert(Math.abs(a - b) < tolerance, `${message}: ${a} / ${b}`);
const limit = n => Math.max(-1, Math.min(1, n));
function canvasFactory() {
  return require(require.resolve('@napi-rs/canvas', {
    paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, process.cwd()].filter(Boolean),
  })).createCanvas;
}
function harness(core, render = false) {
  const h = createHarness(core, path.join(root, 'assets/citadel-mrg-v1.7.0.js'), null, render ? canvasFactory() : null);
  h.context.location = { protocol: 'file:', href: 'file:///test/citadel.html' };
  // The private admin engine deliberately has no tournament client or remote
  // saves. Exercise its data with the exact public snapshot functions in an
  // isolated adapter; no tournament API, credentials, or storage is introduced.
  if (!h.cupPack) {
    const publicLines = fs.readFileSync(path.join(root, 'assets/atlas-v1.3.5.js'), 'utf8').split('\n');
    const declarations = publicLines.filter(line => /^(const CUP_(LEVELS|ENGINE_KEYS|OMIT)=|function cup(Pack|Unpack)\(|function arcadeSeed\()/.test(line));
    assert.equal(declarations.length, 6);
    vm.runInContext('const CUP={clock:0,startClock:0,startScore:0,progress:0};\n' + declarations.join('\n'), h.context);
    h.snapshotAdapter = 'Exact public CUP snapshot functions and identical seeded RNG with getState over the admin engine, isolated in memory';
  }
  for (const file of ['citadel-flight-v1.7.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js',
    'citadel-pursuit-v1.8.0.js', 'citadel-swarm-v1.8.0.js']) {
    const filename = path.join(root, 'assets', file);
    if (fs.existsSync(filename)) vm.runInContext(fs.readFileSync(filename, 'utf8'), h.context, { filename: file });
  }
  vm.runInContext(`globalThis.swarmQA = {
    api: CITADEL_SWARM, pack: cupPack, unpack: cupUnpack, keys: CUP_ENGINE_KEYS, levels: CUP_LEVELS,
    lessonCase: citadelLessonCase, scene: spaceScene, camera: spaceCamera,
    flightHUD: drawFlightHUD, mobileHUD: drawMobileGameHUD, campaignHUD: drawCampaignFlightHUD,
    clarityHUD: drawClarityHUD, overlay: arcadeOverlayHTML, update: updateArcadeHUD,
    action: arcadeAction, mobileAction, input: arcadeInput, retry: citadelRetry,
  };`, h.context);
  h.s = h.context.swarmQA;
  h.run = e => ({ seed: e.seed, mode: e.assist ? 'calm' : 'normal' });
  h.make = (assist = false, seed = 417147, upgrades = { weapons: 0, armor: 0, rockets: 0 }) => {
    const events = [], e = new h.Engine(seed, (kind, value) => events.push({ kind, value: clone(value ?? null), time: e.elapsed }));
    e.assist = assist; e.upgrades = { ...upgrades }; e.beginStage(2); h.arcade.engine = e; e.launch(); e.qaEvents = events; return e;
  };
  return h;
}
function frames(e, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) e.step(1 / 60, typeof input === 'function' ? input(e, i) : input);
}
function controller(api) {
  return e => {
    if (!api.active(e)) return {};
    let goal = e.swarm.window.slice();
    const a = e.swarm.attack;
    if (a && !a.cancelled) {
      // The visible blank strip is the announced gap. Move into its centre
      // while keeping the communication window within download radius.
      const alongV = goal[0] * a.v[0] + goal[1] * a.v[1];
      goal = api.regionPoint(a, a.gap, alongV);
    }
    const jammer = e.enemies.find(x => x.jammer && !x.dead);
    return { turn: limit((goal[0] - e.player.pos[0]) * .5), pitch: limit((goal[1] - e.player.pos[1]) * .5),
      fire: true, missile: !!jammer && jammer.hp > 100 };
  };
}
function play(h, assist, seed = 417147, upgrades) {
  const e = h.make(assist, seed, upgrades), operate = controller(h.s.api), snapshots = [];
  let lastFormation = -1, maxDrones = 0, maxBullets = 0, minHP = 100, lessons = 0;
  for (let i = 0; i < 60 * 160; i++) {
    if (e.status === 'lesson') {
      assert.equal(e.swarm.complete, true, 'Lesson must open after all packets, in safety');
      assert.equal(e.phase, 'dock'); assert.equal(e.enemies.length, 0);
      assert(e.answerLesson(h.s.lessonCase(e, e.lesson.caseIndex).correct)); e.continueLesson(); lessons++;
    }
    if (e.phase === 'dock' && e.status === 'playing') break;
    assert(!['crashing', 'lost'].includes(e.status), 'Real-input mission controller must survive');
    e.step(1 / 60, operate(e));
    maxDrones = Math.max(maxDrones, e.enemies.length); maxBullets = Math.max(maxBullets, e.bullets.length);
    minHP = Math.min(minHP, e.player.hp);
    if (h.s.api.active(e) && e.swarm.packet !== lastFormation && e.swarm.time - e.swarm.formationStart > 3.6) {
      snapshots.push(h.s.pack(e)); lastFormation = e.swarm.packet;
    }
  }
  assert.equal(e.phase, 'dock'); assert.equal(e.status, 'playing'); assert.equal(e.swarm.complete, true);
  assert.equal(h.s.api.completed(e), 3); assert.equal(new Set(e.rescued).size, e.rescued.length);
  assert.equal(lessons, 2); assert.deepEqual(clone(e.decisions.map(x => x.caseIndex)), [4, 5]);
  assert.equal(e.lessonQueue.length, 0); assert.equal(e.player.hp, 100);
  assert(maxDrones <= (assist ? 10 : 13)); assert(maxBullets <= 56);
  assert.equal(snapshots.length, 3, 'All three authored formations must be playable');
  return { e, snapshots, metrics: { mode: assist ? 'calm' : 'normal', seed,
    seconds: Number(e.elapsed.toFixed(2)), minHP, shots: e.shots, destroyed: e.stageKills,
    lessons, packets: h.s.api.completed(e), score: e.score, maxDrones, maxBullets } };
}
function nextAttack(e) {
  for (let i = 0; i < 60 * 10 && !e.swarm.attack; i++) e.step(1 / 60, {});
  assert(e.swarm.attack && e.swarm.attack.stage === 'telegraph');
  return e.swarm.attack;
}
function verify(core) {
  const h = harness(core), checks = [], plays = [];
  function check(name, test) { const details = test(); checks.push({ name, passed: true, ...(details === undefined ? {} : { details }) }); }
  check('Real input completes three formations and exactly two safe decisions in both modes', () => {
    for (const assist of [false, true]) for (const seed of [417147, 819337]) plays.push(play(h, assist, seed));
    return plays.map(x => x.metrics);
  });
  check('Level zero, other orbit, convoy, and MRG still delegate; stage restart resets only swarm state', () => {
    const e = h.make(); e.beginStage(0); assert.equal(e.swarm, null); e.launch(); assert.equal(e.phase, 'orientation');
    e.beginStage(3); assert.equal(e.swarm, null); e.launch(); assert.equal(e.phase, 'battle');
    e.beginFinale(); e.launchFinale(); assert.equal(h.s.api.active(e), false); assert(e.enemies.every(x => x.core));
    e.beginStage(1); assert.equal(e.swarm, null);
    e.status = 'stageclear'; e.upgradeChoice = 'weapons'; e.beginEscort(); e.launch();
    assert.equal(e.phase, 'escort'); frames(e, .3); assert(e.escort.time > 0);
    e.beginStage(2); assert(h.s.api.active(e)); assert.equal(e.status, 'briefing'); assert.equal(e.swarm.time, 0);
  });
  check('Autopilot alone cannot collect or defeat a stationary swarm', () => {
    const passive = [];
    for (const assist of [false, true]) {
      const e = h.make(assist); e.autopilot = true; frames(e, 80);
      assert.equal(e.status, 'lost'); assert.equal(h.s.api.completed(e), 0); assert.equal(e.autopilot, false);
      assert(e.swarm.damageTaken >= 4); passive.push({ mode: assist ? 'calm' : 'normal', secondsToLoss: Number(e.elapsed.toFixed(2)) });
    }
    assert(passive[1].secondsToLoss > passive[0].secondsToLoss * 2); return passive;
  });
  check('A marked volley damages occupied corridors and leaves its visible gap safe', () => {
    const e = h.make(), attack = nextAttack(e), r = h.s.api.liveRegions(e)[2];
    // Isolated collision fixture: place identical saved attempts at the centre
    // of a marked rectangle and at its announced gap before the same volley.
    e.player.pos = h.s.api.regionPoint(attack, r.u, r.v); e.player.invulnerable = 0;
    const snapshot = h.s.pack(e), hit = h.s.unpack(snapshot, h.run(e), () => {}), safe = h.s.unpack(snapshot, h.run(e), () => {});
    safe.player.pos = h.s.api.regionPoint(safe.swarm.attack, safe.swarm.attack.gap, safe.swarm.attack.targetV);
    const hp = hit.player.hp; frames(hit, attack.remaining + .2); frames(safe, attack.remaining + .2);
    assert.equal(hit.player.hp, hp - 25); assert.equal(safe.player.hp, hp);
    assert.equal(hit.swarm.damageTaken, 1); assert.equal(safe.swarm.damageTaken, 0);
  });
  check('Real manoeuvre can evade after the visible warning starts', () => {
    const e = h.make(), a = nextAttack(e); e.player.invulnerable = 0;
    const startHP = e.player.hp;
    frames(e, a.remaining + .4, { pitch: 1 });
    assert.equal(e.player.hp, startHP); assert(e.player.pos[1] > 20);
  });
  check('Destroying an attack owner removes only its corridors; pulse scatters the whole charged volley', () => {
    const e = h.make(), a = nextAttack(e), before = h.s.api.liveRegions(e);
    const owner = e.enemies.find(x => x.id === before[0].owner); e.hit(owner, owner.hp);
    const after = h.s.api.liveRegions(e); assert(after.length < before.length); assert(after.length > 0);
    assert(after.every(r => r.owner !== owner.id));
    const hp = e.player.hp; e.player.invulnerable = 0; e.step(1 / 60, { pulse: true });
    assert.equal(a.cancelled, true); assert.equal(h.s.api.liveRegions(e).length, 0);
    frames(e, a.remaining + 1); assert.equal(e.player.hp, hp); assert(e.player.pulseCooldown > 0);
  });
  check('Transfer pauses outside the window, keeps partial progress, and resists physical pickup bypass', () => {
    const e = h.make(), operate = controller(h.s.api);
    for (let i = 0; i < 60 * 25 && e.swarm.transfer[0] < 4; i++) e.step(1 / 60, operate(e));
    assert(e.swarm.transfer[0] >= 4 && e.swarm.transfer[0] < 5);
    for (let i = 0; i < 60 * 4; i++) e.step(1 / 60, { turn: -1, pitch: -1 });
    assert.equal(h.s.api.insideWindow(e), false);
    const retained = e.swarm.transfer[0]; frames(e, .8, { turn: -1, pitch: -1 });
    near(e.swarm.transfer[0], retained, 'Partial transfer outside window');
    e.collect(e.pickups.find(x => !x.dead && x.type === 'requirement'));
    assert.equal(h.s.api.completed(e), 0, 'Touching hidden cargo cannot skip the download');
  });
  check('Full save roundtrip preserves in-flight volley, RNG, partial transfer and future play', () => {
    const source = plays.find(x => !x.e.assist).snapshots[1];
    const saved = clone(source), a = h.s.unpack(saved, { seed: saved.engine.seed, mode: 'normal' }, () => {});
    assert.deepEqual(clone(h.s.pack(a)), saved, 'Whole serialized state must roundtrip unchanged');
    const b = h.s.unpack(saved, { seed: saved.engine.seed, mode: 'normal' }, () => {}), operate = controller(h.s.api);
    for (let i = 0; i < 900; i++) { const input = operate(a); a.step(1 / 60, input); b.step(1 / 60, input); }
    assert.deepEqual(clone(h.s.pack(a)), clone(h.s.pack(b)), 'Continuation after a save must stay deterministic');
    assert.equal(h.s.keys.filter(x => x === 'swarm').length, 1);
  });
  check('Pause freezes window, warning, progress, HP, ammo, and projectiles; resume continues', () => {
    const e = h.make(), operate = controller(h.s.api); frames(e, 5, operate);
    e.pause(); const frozen = clone(e.swarm), hp = e.player.hp, ammo = e.player.missiles, bullets = clone(e.bullets), time = e.elapsed;
    frames(e, 4, { fire: true, missile: true, turn: 1, pulse: true });
    assert.deepEqual(clone(e.swarm), frozen); assert.deepEqual(clone(e.bullets), bullets);
    assert.equal(e.player.hp, hp); assert.equal(e.player.missiles, ammo); assert.equal(e.elapsed, time);
    e.resume(); e.step(1 / 60, operate(e)); assert(e.swarm.time > frozen.time);
  });
  check('Old stage-two save migrates without lost score, HP, rescued requirements, or duplicate decisions', () => {
    const e = h.make(), snap = h.s.pack(e), first = e.plan[2][0];
    delete snap.engine.swarm; snap.engine.phase = 'battle'; snap.engine.rescued = [first];
    snap.engine.score = 4321; snap.engine.player.hp = 47; snap.engine.elapsed = 82.3;
    snap.engine.decisions = [{ caseIndex: 4, stage: 2, reqId: first, firstTry: true, decision: 0 }];
    snap.engine.lessonQueue = [];
    const restored = h.s.unpack(snap, h.run(e), () => {});
    assert(h.s.api.active(restored)); assert.equal(restored.swarm.packet, 1); assert.equal(restored.score, 4321);
    assert.equal(restored.player.hp, 47); assert.equal(restored.elapsed, 82.3);
    assert.deepEqual(clone(restored.rescued), [first]); assert.equal(restored.decisions.length, 1);
    const operate = controller(h.s.api);
    for (let i = 0; i < 60 * 90; i++) {
      if (restored.status === 'lesson') { restored.answerLesson(h.s.lessonCase(restored, restored.lesson.caseIndex).correct); restored.continueLesson(); }
      if (restored.phase === 'dock' && restored.status === 'playing') break;
      restored.step(1 / 60, operate(restored));
    }
    assert.equal(restored.phase, 'dock'); assert.equal(restored.decisions.filter(x => x.caseIndex === 4).length, 1);
    assert.equal(restored.decisions.filter(x => x.caseIndex === 5).length, 1); assert.equal(new Set(restored.rescued).size, 3);
  });
  check('Already collected old save advances to safe cards and dock without rewarding cargo twice', () => {
    const e = h.make(), snap = h.s.pack(e); delete snap.engine.swarm;
    snap.engine.phase = 'retrieve'; snap.engine.rescued = clone(e.plan[2]); snap.engine.score = 9999;
    snap.engine.pickups.forEach(x => { x.dead = true; }); snap.engine.lessonQueue = [];
    const resumed = h.s.unpack(snap, h.run(e), () => {});
    assert.equal(resumed.phase, 'dock'); assert.equal(resumed.status, 'lesson'); assert.equal(resumed.score, 9999);
    assert.equal(resumed.lesson.caseIndex, 4); assert.deepEqual(clone(resumed.lessonQueue.map(x => x.caseIndex)), [5]);
    const again = h.s.unpack(h.s.pack(resumed), h.run(resumed), () => {});
    assert.equal(again.score, 9999); assert.equal(again.lessonQueue.length, 1);
  });
  check('Death and existing retry return to the swarm briefing with the stage checkpoint', () => {
    const e = h.make(); frames(e, 30); assert.equal(e.status, 'lost');
    h.arcade.engine = e; h.s.retry(false); const retry = h.arcade.engine;
    assert.equal(retry.stage, 2); assert.equal(retry.status, 'briefing'); assert.equal(retry.phase, 'swarm');
    assert.equal(retry.player.hp, 100); assert.equal(retry.swarm.time, 0); assert.equal(retry.score, e.stageStart.score);
  });
  check('No replay farming: a slot pays once per formation and entity counts remain bounded', () => {
    const e = h.make(); frames(e, 1); const drone = e.enemies.find(x => !x.jammer), slot = drone.slot;
    e.hit(drone, drone.hp); const score = e.score; frames(e, 9.8, controller(h.s.api));
    const respawned = e.enemies.find(x => x.slot === slot && x.id !== drone.id);
    assert(respawned); assert.equal(respawned.warp, 0); const before = e.score;
    e.hit(respawned, respawned.hp); assert.equal(e.score, before); assert(score >= 45);
    assert(e.enemies.length <= 13); assert(e.bullets.length <= 56); assert.equal(e.hostile.length, 0);
  });
  check('Keyboard/touch input fields, controls, wording and repeated module loading are consistent', () => {
    const e = h.make(); h.arcade.keys.add('KeyD'); h.arcade.keys.add('KeyW');
    const keyboard = h.s.input(); assert.equal(keyboard.turn, 1); assert.equal(keyboard.pitch, 1);
    h.arcade.keys.clear(); h.arcade.joystick = { x: -.5, y: .25 }; const touch = h.s.input();
    assert.equal(touch.turn, -.5); assert.equal(touch.pitch, -.25); h.arcade.joystick = null;
    h.s.action('citadel-guidance'); assert.equal(e.autopilot, false); h.s.mobileAction('mobile-guide'); assert.equal(e.autopilot, false);
    h.s.update(); assert.equal(h.nodes.get('citadel-primary').disabled, true);
    assert.match(h.nodes.get('citadel-route').innerHTML, /СВЯЗЬ/); assert.doesNotMatch(h.nodes.get('citadel-route').innerHTML, /ПЕРЕХВАЧЕНО/);
    assert.equal(h.s.levels[6], 'Рой уточнений'); e.status = 'briefing'; assert.match(h.s.overlay(), /Рой уточнений/);
    assert.match(h.s.overlay(), /Загрузка сохраняется/); assert.doesNotMatch(h.s.overlay(), /К ПЕРВОМУ КРИСТАЛЛУ/);
    const step = e.step; vm.runInContext(fs.readFileSync(patch, 'utf8'), h.context); assert.equal(e.step, step);
    assert.equal(h.s.keys.filter(x => x === 'swarm').length, 1);
  });
  check('Completed mission reaches actual visible gate and enters existing docking', () => {
    const final = plays[0].e, restored = h.s.unpack(h.s.pack(final), h.run(final), () => {});
    h.arcade.engine = restored;
    for (let i = 0; i < 60 * 40 && restored.status === 'playing'; i++) restored.step(1 / 60, {});
    assert.equal(restored.status, 'docking'); assert.equal(restored.dock.flightVersion, '1.7.1');
    return { seconds: Number((restored.elapsed - final.elapsed).toFixed(2)), gate: clone(h.context.CITADEL_FLIGHT.gate(restored)) };
  });
  check('Admin direct dock fixture delegates even while the swarm checkpoint is unfinished', () => {
    const e = h.make(); e.rescued = clone(e.plan[2]);
    e.decisions = [4, 5].map((caseIndex, i) => ({ caseIndex, reqId: e.plan[2][i ? 2 : 0], stage: 2 }));
    e.phase = 'dock'; e.enemies = []; e.bullets = []; e.hostile = []; e.lessonQueue = [];
    e.player.pos = clone(h.context.CITADEL_FLIGHT.approach(e));
    assert.equal(e.swarm.complete, false); assert.equal(h.s.api.active(e), false);
    assert(e.interact()); assert.equal(e.status, 'docking'); assert.equal(e.dock.flightVersion, '1.7.1');
  });
  check('Private engine boots and plays with no tournament client or snapshot API installed', () => {
    if (!h.snapshotAdapter) return { applicable: false, reason: 'Public core includes its snapshot API' };
    const raw = createHarness(core, path.join(root, 'assets/citadel-mrg-v1.7.0.js'), null);
    for (const file of ['citadel-flight-v1.7.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js', 'citadel-swarm-v1.8.0.js'])
      vm.runInContext(fs.readFileSync(path.join(root, 'assets', file), 'utf8'), raw.context);
    assert.equal(vm.runInContext('typeof cupPack', raw.context), 'undefined');
    const e = new raw.Engine(417147, () => {}); e.beginStage(2); raw.arcade.engine = e; e.launch();
    frames(e, 5, controller(raw.context.CITADEL_SWARM)); assert.equal(e.phase, 'swarm'); assert.equal(e.status, 'playing');
    assert(e.swarm.transfer[0] > 0); assert.equal(raw.storage.size, 0);
    return { applicable: true, remoteStorage: false, transfer: e.swarm.transfer[0] };
  });
  check('Actual updateArcadeHUD draws the native tactical radar before and after a swarm step', () => {
    const native = harness(core, true), radar = native.createCanvas(300, 220);
    radar.setAttribute = function (key, value) { this[key] = value; };
    native.arcade.radar = radar.getContext('2d');
    const e = native.make(); e.beginStage(2); native.arcade.engine = e;
    const checkpoints = [];
    for (const action of ['briefing', 'launch', 'step']) {
      if (action === 'launch') e.launch();
      if (action === 'step') frames(e, 1);
      const before = { score: e.score, hp: e.player.hp, rescued: clone(e.rescued) };
      native.s.update();
      assert.deepEqual({ score: e.score, hp: e.player.hp, rescued: clone(e.rescued) }, before);
      assert(radar.getContext('2d').getImageData(150, 110, 1, 1).data[3] > 0, 'Actual tactical radar pixels');
      checkpoints.push({ action, status: e.status, liveJammer: e.enemies.some(x => x.jammer && !x.dead) });
    }
    assert(checkpoints.every(x => x.liveJammer));
    return checkpoints;
  });
  let renders = [];
  if (renderDir) {
    const native = harness(core, true); fs.mkdirSync(renderDir, { recursive: true });
    for (const [index, snapshot] of plays[0].snapshots.entries()) for (const [w, height, dpr] of [[1280, 720, 1], [390, 460, 1], [844, 320, 1], [390, 460, 2]]) {
      const e = native.s.unpack(snapshot, { seed: snapshot.engine.seed, mode: 'normal' }, () => {});
      native.arcade.engine = e; native.context.innerWidth = w; native.context.matchMedia = () => ({ matches: w < 900 });
      native.arcade.canvas = native.createCanvas(w * dpr, height * dpr);
      native.arcade.canvas.getBoundingClientRect = () => ({ width: w, height });
      const full = native.createCanvas(w * dpr, height * dpr), overlay = native.createCanvas(w * dpr, height * dpr);
      const before = clone(native.s.pack(e));
      const scene = native.s.scene(e, e.elapsed, false), cam = native.s.camera(e, e.elapsed);
      assert(scene.length < 600, 'Swarm render geometry must remain bounded');
      native.draw(full.getContext('2d'), scene, cam, w * dpr, height * dpr);
      (w < 900 ? native.s.mobileHUD : native.s.flightHUD)(overlay.getContext('2d'), e, cam, w * dpr, height * dpr);
      native.s.campaignHUD(overlay.getContext('2d'), e, cam, w * dpr, height * dpr);
      native.s.clarityHUD(overlay.getContext('2d'), e, cam, w * dpr, height * dpr);
      assert.deepEqual(clone(native.s.pack(e)), before, 'Scene/HUD rendering must not advance or mutate gameplay');
      full.getContext('2d').drawImage(overlay, 0, 0);
      const file = path.join(renderDir, `${path.basename(core).replace('.js', '')}-formation-${index + 1}-${w}x${height}-dpr${dpr}.png`);
      fs.writeFileSync(file, full.toBuffer('image/png')); renders.push({ file, meshes: scene.length, size: [w, height], dpr });
    }
  }
  return { core: path.basename(core), ...(h.snapshotAdapter ? { snapshot_adapter: h.snapshotAdapter } : {}), sha256: crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex'),
    passed: checks.length, checks, renders };
}
const report = { version: '1.8.0', feature: 'Level 7 / Рой уточнений',
  method: 'Actual shipped cores in Node VM; deterministic keyboard/touch-equivalent input playthrough and native Canvas projection. No browser, network, physical Android, or production storage.',
  addon_sha256: crypto.createHash('sha256').update(fs.readFileSync(patch)).digest('hex'), results: cores.map(verify) };
console.log(JSON.stringify(report, null, 2));
