#!/usr/bin/env node
'use strict';

// Runs the real frozen engines and the actual input, projectile, damage, save,
// scene and HUD paths. Device restrictions are simulated; this is not a browser
// or a claim of a physical Android play-through.
// node tests/parallax-regression.cjs --core assets/atlas-v1.3.5.js \
//   --core ../cmpon-analytics-admin/game-lab/engine-v1.2.1.js \
//   --render ../parallax-qa/frames --out ../parallax-qa/verification.json
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHarness, nativeCanvas, clone } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..');
const patchPath = path.join(root, 'assets/citadel-parallax-v1.8.0.js');
const clamp = (n, a = -1, b = 1) => Math.max(a, Math.min(b, n));
const near = (a, b, text, eps = 1e-7) => assert(Math.abs(a - b) <= eps, `${text}: ${a} vs ${b}`);
function args(argv) {
  const options = { cores: [], render: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--core') options.cores.push(path.resolve(argv[++i]));
    else if (argv[i] === '--render') options.render = path.resolve(argv[++i]);
    else if (argv[i] === '--out') options.out = path.resolve(argv[++i]);
    else throw new Error('Unknown option: ' + argv[i]);
  }
  if (!options.cores.length) options.cores.push(path.join(root, 'assets/atlas-v1.3.5.js'));
  return options;
}
function harness(corePath, canvas = null) {
  const h = createHarness(corePath, path.join(root, 'assets/citadel-mrg-v1.7.0.js'), path.join(root, 'assets/citadel-mrg-view-v1.7.0.js'), canvas);
  for (const name of ['citadel-aim-v1.7.1.js', 'citadel-flight-v1.7.1.js', 'citadel-flight-view-v1.7.1.js', 'citadel-parallax-v1.8.0.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'assets', name), 'utf8'), h.context, { filename: name });
  }
  h.context.location = { protocol: 'https:', href: 'https://parallax-test.invalid/' };
  vm.runInContext('globalThis.parallaxQA={api:CITADEL_PARALLAX,scene:spaceScene,hud:drawFinaleHUD,overlay:finaleOverlay,input:arcadeInput,action:arcadeAction,basis:flightBasis,mobile:MOBILE}', h.context);
  Object.assign(h, h.context.parallaxQA);
  h.fresh = (assist = false, upgrades = { weapons: 2, armor: 1, rockets: 0 }) => {
    const events = []; let e;
    e = new h.Engine(417147, (kind, data) => events.push({ kind, data, time: e.elapsed }));
    e.assist = assist; e.upgrades = { ...upgrades };
    e.beginStage(3); e.beginFinale(); e.launchFinale();
    e.events = events; h.arcade.engine = e;
    return e;
  };
  return h;
}
function frames(e, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) e.step(1 / 60, typeof input === 'function' ? input(e, i) : input);
}
function setupAttack(h, kind, assist = false) {
  const e = h.fresh(assist);
  // A stationary operator has braked against the boss arena's forward limit.
  // The actual movement integrator still runs, including the normal 5 m/s brake.
  e.autopilot = false; Object.assign(e.player, { pos: [0, 0, -104], yaw: 0, pitch: 0, speed: 0, invulnerable: 0 });
  e.finale.parallax.serial = h.api.patterns.findIndex(x => x.id === kind);
  e.finale.parallax.nextAttack = 0; e.finale.parallax.shotClock = 1e6;
  e.step(1 / 60, { brake: true });
  assert.equal(e.finale.parallax.attack.kind, kind);
  return e;
}
function advanceTo(e, phase, fraction = 0) {
  for (let i = 0; i < 60 * 8 && e.finale.parallax.attack?.phase !== phase; i++) e.step(1 / 60, { brake: true });
  const a = e.finale.parallax.attack;
  assert.equal(a?.phase, phase, 'Attack entered ' + phase);
  frames(e, (phase === 'windup' ? a.windup : phase === 'strike' ? a.strike : a.recovery) * fraction, { brake: true });
}

// This operator uses the game's G action and real turn/pitch/boost/fire/pulse/
// missile fields. It does not change hp, ammo, aim cones, cooldowns or AI state.
function controller(h, e, { pulse = true, missile = true } = {}) {
  let attackId = 0, goal = null;
  const guide = on => { if (e.autopilot !== on) h.action('citadel-guidance'); };
  return () => {
    const a = e.finale.parallax?.attack;
    const input = { fire: true, missile: missile && e.player.missiles > 0, pulse: false };
    if (e.finale.phase === 'boss' && a && (a.phase === 'windup' && a.time > .25 || a.phase === 'strike')) {
      if (a.id !== attackId) {
        attackId = a.id; const p = a.aim; goal = p.slice();
        if (a.kind === 'pincer') goal[0] = clamp(p[0] + (p[0] > 0 ? -32 : 32), -80, 80);
        else goal[1] = clamp(p[1] + (p[1] > 0 ? -32 : 32), -52, 52);
      }
      if (pulse && a.phase === 'windup' && a.windup - a.time < .45 && e.player.pulseCooldown <= 0) {
        input.pulse = true; guide(true); return input;
      }
      guide(false);
      const d = goal.map((v, i) => v - e.player.pos[i]);
      const yaw = Math.atan2(d[0], -d[2]), pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
      input.turn = clamp(Math.atan2(Math.sin(yaw - e.player.yaw), Math.cos(yaw - e.player.yaw)) * 3);
      input.pitch = clamp((clamp(pitch, -1.2, 1.2) - e.player.pitch) * 3);
      input.boost = true;
    } else guide(true);
    return input;
  };
}
function snapshot(e) {
  return clone({ player: e.player, finale: e.finale, enemies: e.enemies, boss: e.boss, score: e.score,
    status: e.status, elapsed: e.elapsed, bullets: e.bullets, hostile: e.hostile });
}
function runCore(corePath, canvas) {
  const h = harness(corePath, canvas), results = [];
  function test(name, fn) {
    const data = fn(); results.push({ name, pass: true, ...(data === undefined ? {} : { data }) });
  }
  test('Three telegraphed attacks actually hit a stationary ship once in both modes', () => {
    const data = [];
    for (const assist of [false, true]) for (const { id } of h.api.patterns) {
      const e = setupAttack(h, id, assist), a = e.finale.parallax.attack;
      assert(a.windup >= (assist ? 2.08 : 1.68));
      frames(e, a.windup - .08, { brake: true }); near(e.player.hp, 100, 'Warning does no damage');
      frames(e, a.strike + .2, { brake: true });
      assert.equal(e.finale.parallax.hits, 1); near(e.player.hp, 100 - 24 * .8 * (assist ? .55 : 1), 'One visible strike damage');
      data.push({ mode: assist ? 'calm' : 'normal', kind: id, shield: +e.player.hp.toFixed(2), hits: e.finale.parallax.hits });
    }
    return data;
  });
  test('The same locked attacks can be evaded through the touch input mapping', () => {
    const data = [];
    for (const assist of [false, true]) for (const { id } of h.api.patterns) {
      const e = setupAttack(h, id, assist), aim = clone(e.finale.parallax.attack.aim);
      h.mobile.autoFire = false; h.arcade.keys.clear(); h.arcade.joystick = null;
      frames(e, .3, { brake: true });
      h.arcade.keys.add('TouchBoost'); h.arcade.joystick = id === 'pincer' ? { x: 1, y: 0 } : { x: 0, y: -1 };
      const touch = h.input(); assert.equal(touch.boost, true);
      assert.equal(id === 'pincer' ? touch.turn : touch.pitch, 1);
      frames(e, 3.9, () => h.input());
      near(e.player.hp, 100, 'Touch evasion avoids the strike'); assert.equal(e.finale.parallax.hits, 0);
      assert.deepEqual(clone(e.finale.parallax.attack.aim), aim, 'The attack never follows the evading player');
      assert(e.finale.parallax.evaded >= 1);
      data.push({ mode: assist ? 'calm' : 'normal', kind: id, shield: e.player.hp, position: e.player.pos.map(x => +x.toFixed(2)) });
      h.arcade.keys.clear(); h.arcade.joystick = null;
    }
    return data;
  });
  test('Late pulse actively knocks back every attack; an early pulse keeps its timing cost', () => {
    const data = [];
    for (const kind of ['lunge', 'sweep', 'pincer']) {
      const e = setupAttack(h, kind), a = e.finale.parallax.attack;
      frames(e, a.windup - .4, { brake: true }); e.step(1 / 60, { brake: true, pulse: true });
      assert.equal(a.phase, 'recover'); assert(a.blocked); assert.equal(e.finale.parallax.blocked, 1);
      assert(e.player.pulseCooldown > 7.9); frames(e, 1.6, { brake: true }); near(e.player.hp, 100, 'Reflected strike');
      assert.equal(e.events.filter(x => x.kind === 'comic' && x.data.text === 'ПРАВКА ОТБИТА!').length, 1);
      data.push(kind);
    }
    const early = setupAttack(h, 'lunge'); early.step(1 / 60, { brake: true, pulse: true });
    assert.equal(early.finale.parallax.attack.phase, 'windup'); frames(early, 3.2, { brake: true });
    assert.equal(early.finale.parallax.hits, 1, 'Pulse too early cannot cancel a later strike');
    return data;
  });
  test('A shielded contact consumes the strike and does not hit after immunity expires', () => {
    const e = setupAttack(h, 'lunge'); advanceTo(e, 'strike', .39);
    e.player.invulnerable = .18; frames(e, .65, { brake: true });
    assert.equal(e.finale.parallax.hits, 0); assert.equal(e.finale.parallax.blocked, 1); near(e.player.hp, 100, 'No delayed shield bypass');
  });
  test('Support destruction interrupts its connected arm, preserves awards and never duplicates them', () => {
    const e = setupAttack(h, 'lunge'), a = e.finale.parallax.attack;
    const connected = e.enemies.find(x => x.pos[0] > 0 && x.pos[1] > 0);
    const other = e.enemies.find(x => x.pos[0] < 0 && x.pos[1] > 0);
    e.player.hp = 50; const missiles = e.player.missiles, score = e.score;
    e.hit(other, 1e8); assert.equal(a.phase, 'windup', 'A different conduit does not magically cancel the arm');
    e.hit(connected, 1e8); assert.equal(a.phase, 'recover'); assert.equal(e.finale.parallax.interrupted, 1);
    assert.equal(e.score - score, 1200); assert.equal(e.player.missiles, Math.min(16, missiles + 4)); near(e.player.hp, 74, 'Unchanged +12 support repair');
    const after = snapshot(e); e.hit(connected, 1e8); e.hit(other, 1e8);
    assert.deepEqual(snapshot(e), after, 'Repeated hits on destroyed supports do not award anything');
    const next = setupAttack(h, 'lunge'), target = next.enemies[0], hp = target.hp;
    next.hit(target, 100); near(hp - target.hp, 55, 'Raised armor outside counterattack');
    next.finale.parallax.attack.phase = 'recover'; next.finale.parallax.attack.time = 0;
    const before = target.hp; next.hit(target, 100); near(before - target.hp, 135, 'Counterattack bonus');
    return { rewardPerSupport: 600, repairPerSupport: 12, missilesPerSupport: 2, protectedDamage: 55, counterattackDamage: 135 };
  });
  test('All four supports still shield the core; rage keeps tells and a surviving attack', () => {
    const e = setupAttack(h, 'lunge'); e.player.pos = [0, 0, -60]; e.selectedTarget = e.boss.id;
    assert(e.target()?.core, 'Weapon selection cannot bypass live supports');
    for (const x of e.enemies.slice()) e.hit(x, 1e8);
    const hp = e.boss.hp; assert.equal(e.finale.phase, 'boss'); assert(hp > 0);
    e.step(1 / 60, { brake: true });
    for (let i = 0; i < 60 * 8 && e.finale.parallax.attack?.phase !== 'windup'; i++) e.step(1 / 60, { brake: true });
    const a = e.finale.parallax.attack;
    assert.equal(a.phase, 'windup'); assert.equal(a.supportCount, 0); assert(a.windup >= 1.68); assert.equal(a.damage, 26);
    assert(h.api.attackGeometry(e).length > 0, 'The exposed core has a readable inner tendon attack');
    return { remainingCoreHp: hp, tell: a.windup, damageBeforeArmor: a.damage };
  });
  test('Old boss saves migrate without resetting health, ammo, score or support progress', () => {
    const e = h.fresh(); delete e.finale.parallax; e.player.hp = 43; e.player.missiles = 3; e.enemies[0].hp = 711; e.score = 421;
    const before = { hp: e.player.hp, missiles: e.player.missiles, support: e.enemies[0].hp, score: e.score };
    e.step(1 / 60, {}); assert.equal(e.finale.parallax.version, '1.8.0'); assert(e.finale.parallax.nextAttack > 2.5);
    assert.deepEqual({ hp: e.player.hp, missiles: e.player.missiles, support: e.enemies[0].hp, score: e.score }, before);
  });
  test('Pause and CUP restore preserve mid-warning and mid-strike simulation exactly', () => {
    const data = [];
    for (const assist of [false, true]) for (const phase of ['windup', 'strike']) {
      const e = setupAttack(h, 'pincer', assist); advanceTo(e, phase, .27);
      e.pause(); const paused = snapshot(e); frames(e, 2.3, { fire: true, pulse: true, boost: true });
      assert.deepEqual(snapshot(e), paused, 'Pause freezes the attack and player'); e.resume();
      let restored, persistence;
      if (h.cupPack && h.cupUnpack) {
        const save = h.cupPack(e);
        restored = h.cupUnpack(save, { seed: e.seed, mode: assist ? 'calm' : 'normal' }, () => {});
        persistence = 'Actual public CUP pack/unpack';
      } else {
        // The isolated 1.2.1 lab deliberately has no CUP account or persistent
        // run endpoint. Its engine state still survives a plain JSON round-trip.
        restored = new h.Engine(e.seed, () => {});
        Object.assign(restored, clone(e));
        persistence = 'Isolated lab JSON round-trip (no CUP in this core)';
      }
      assert.deepEqual(snapshot(restored), snapshot(e), 'Restored combat state is exact');
      frames(e, 1.6, { brake: true }); frames(restored, 1.6, { brake: true });
      assert.deepEqual(snapshot(restored), snapshot(e), 'Restored attack follows the same future path and damage');
      data.push({ mode: assist ? 'calm' : 'normal', phase, persistence, exact: true });
    }
    return data;
  });
  test('Rendering uses the exact collision segments and continues essential motion with effects off', () => {
    const e = setupAttack(h, 'pincer'); advanceTo(e, 'strike', .35);
    const state = snapshot(e), geometry = clone(h.api.attackGeometry(e));
    const items = h.scene(e, e.elapsed, false);
    for (const limb of geometry) {
      const visible = items.filter(x => x.parallaxFeature === 'limb' && x.parallaxArm === limb.arm);
      assert.equal(visible.length, limb.points.length - 1);
      visible.forEach((item, i) => {
        assert.deepEqual(clone(item.parallaxFrom), limb.points[i]); assert.deepEqual(clone(item.parallaxTo), limb.points[i + 1]);
        near(item.parallaxRadius, limb.radii[i], 'Visible radius matches collision');
      });
      assert(limb.points.some(p => Math.hypot(...p.map((v, i) => v - e.player.pos[i])) < 35), 'Actual limbs reach the flight area');
    }
    assert.deepEqual(snapshot(e), state, 'Scene rendering has no gameplay writes');
    e.step(.04, { brake: true }); assert.notDeepEqual(clone(h.api.attackGeometry(e)), geometry, 'Reduced effects do not freeze a damaging limb');
    return { activeSegments: geometry.reduce((n, g) => n + g.radii.length, 0), sceneItems: items.length };
  });
  test('The comic events are discrete, world-anchored and pause-safe', () => {
    const e = setupAttack(h, 'sweep'); frames(e, .8, { brake: true });
    const warnings = e.events.filter(x => x.kind === 'comic' && x.data.kind === 'warning');
    assert.equal(warnings.length, 1); assert.equal(warnings[0].data.anchor.length, 3);
    assert(warnings[0].data.anchor.every(Number.isFinite));
    const count = e.events.length; e.pause(); frames(e, 2, {}); assert.equal(e.events.length, count + 1);
  });
  test('Ground MRG, breach, landing and maze continue to delegate to their existing engines', () => {
    const e = h.engine(); assert.equal(h.api.active(e), false); const mrg = clone(e.finale.mrg);
    const parallaxBefore = e.finale.parallax; frames(e, .1, {});
    assert.equal(e.finale.phase, 'mrg'); assert.equal(e.finale.parallax, parallaxBefore); near(e.finale.mrg.maxHp, mrg.maxHp, 'MRG health unchanged');
    const f = h.fresh(); f.beginBreach(); f.player.pos = [0, 0, -127]; f.step(1 / 60, {});
    assert.equal(f.finale.phase, 'landing'); const oldFx = h.arcade.fx; h.arcade.fx = false;
    frames(f, 4.1); h.arcade.fx = oldFx; assert.equal(f.finale.phase, 'maze');
    assert.equal(f.board.completed.length, 0); assert.equal(f.finale.checkpoint, 'maze');
  });
  test('Camping on autopilot takes repeated real hits; its controller never auto-dodges', () => {
    const e = h.fresh(), started = e.elapsed;
    for (let i = 0; i < 60 * 90 && e.status === 'playing' && e.finale.phase === 'boss'; i++) e.step(1 / 60, { fire: true });
    assert.equal(e.status, 'crashing'); assert.equal(e.finale.phase, 'boss'); assert(e.finale.parallax.hits >= 4);
    return { duration: +(e.elapsed - started).toFixed(2), shield: e.player.hp, tentacleHits: e.finale.parallax.hits, remainingCoreHp: +e.boss.hp.toFixed(2) };
  });
  test('A reacting operator wins and enters the breach in both modes, with and without pulse', () => {
    const wins = [];
    for (const assist of [false, true]) for (const pulse of [false, true]) {
      const e = h.fresh(assist), input = controller(h, e, { pulse }), initialScore = e.score;
      let bossFinishedAt = null, shieldAtBreach = null;
      for (let i = 0; i < 60 * 180 && ['playing', 'docking'].includes(e.status) && !['landing', 'maze'].includes(e.finale.phase); i++) {
        e.step(1 / 60, input());
        if (e.finale.phase === 'breach' && bossFinishedAt === null) { bossFinishedAt = e.elapsed; shieldAtBreach = e.player.hp; }
      }
      assert.equal(e.finale.phase, 'landing'); assert.equal(e.status, 'docking'); assert(e.player.hp > 0);
      assert.equal(e.score - initialScore, 5900, 'Four 600-point conduits and the 3500-point core');
      assert(e.finale.parallax.hits <= 2, 'A reacting operator avoids the repeated camping damage and survives');
      assert(e.finale.parallax.evaded > 0); if (pulse) assert(e.finale.parallax.blocked > 0);
      wins.push({ mode: assist ? 'calm' : 'normal', pulse, bossSeconds: +bossFinishedAt.toFixed(2), landingSeconds: +e.elapsed.toFixed(2), shieldAtBreach: +shieldAtBreach.toFixed(2), shieldAtLanding: +e.player.hp.toFixed(2), missilesLeft: e.player.missiles, tentacleHits: e.finale.parallax.hits, avoided: e.finale.parallax.evaded, reflected: e.finale.parallax.blocked, scoreAwarded: e.score - initialScore });
    }
    return wins;
  });
  test('Briefing and objectives explain attack directions, pulse timing and the counterattack window', () => {
    const e = h.fresh(); e.status = 'finalebrief'; const text = h.overlay(e);
    for (const required of ['хлёст', 'клещи', 'импульс', '45%', '35%', 'Автокурс не уклоняется']) assert(text.includes(required), required);
    for (const kind of ['lunge', 'sweep', 'pincer']) {
      const f = setupAttack(h, kind); assert(f.objective().detail.includes('момент')); assert(f.objective().progress.includes('УДАР ЧЕРЕЗ'));
    }
  });
  return { core: path.relative(root, corePath), coreSha256: crypto.createHash('sha256').update(fs.readFileSync(corePath)).digest('hex'), groups: results.length, pass: true, results, h };
}
function renderFrames(h, dir) {
  fs.mkdirSync(dir, { recursive: true }); const output = [];
  const oldMatch = h.context.matchMedia;
  for (const [name, width, height, kind, phase, fx, dpr] of [
    ['warning', 1280, 720, 'sweep', 'windup', true, 1],
    ['hook', 1280, 720, 'lunge', 'strike', true, 1],
    ['pincer-mobile', 390, 460, 'pincer', 'strike', true, 2],
    ['sweep-landscape', 844, 320, 'sweep', 'strike', false, 1],
    ['short-screen', 592, 244, 'pincer', 'windup', false, 1],
  ]) {
    const e = setupAttack(h, kind), a = e.finale.parallax.attack;
    e.player.pos = [-6, 6, -99.5]; e.player.speed = 0; e.player.yaw = 0; e.player.pitch = 0;
    a.aim = e.player.pos.slice(); a.phase = phase; a.time = phase === 'windup' ? 1.1 : kind === 'sweep' ? .8 : 1.05;
    const canvas = h.createCanvas(width * dpr, height * dpr), hud = h.createCanvas(width * dpr, height * dpr);
    h.context.innerWidth = width; h.context.devicePixelRatio = dpr; h.context.matchMedia = () => ({ matches: width < 900 });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height }); h.arcade.canvas = canvas; h.arcade.hud = hud; h.arcade.fx = fx;
    const cam = h.camera(e, e.elapsed, false), scene = h.scene(e, e.elapsed, fx);
    h.draw(canvas.getContext('2d'), scene, cam, canvas.width, canvas.height);
    const c = hud.getContext('2d'), texts = [], oldText = c.fillText.bind(c);
    c.fillText = (text, x, y, ...rest) => { texts.push({ text: String(text), x, y }); return oldText(text, x, y, ...rest); };
    const before = snapshot(e); h.hud(c, e, cam, hud.width, hud.height); assert.deepEqual(snapshot(e), before, 'HUD does not move the attack');
    const hp = texts.find(x => x.text.startsWith('ЩИТ ')); assert(hp && hp.y > 0 && hp.y < height, 'Shield remains within the visible canvas');
    const hint = texts.find(x => x.text.includes('ИМПУЛЬС ПЕРЕД УДАРОМ')); assert(hint && hint.y < height - 44);
    for (const label of texts.filter(x => x.text === 'ЗОНА УДАРА')) assert(label.y > 120 && label.y < height - 55, 'Danger label stays outside the health strip on short screens');
    canvas.getContext('2d').drawImage(hud, 0, 0);
    const filename = path.basename(h.corePath, '.js') + '-' + name + '.png'; fs.writeFileSync(path.join(dir, filename), canvas.toBuffer('image/png'));
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
    for (let i = 0; i < pixels.length; i += 92) colors.add(pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2]);
    assert(colors.size > 120, 'Native renderer produced actual geometry and HUD');
    output.push({ filename, width, height, dpr, effects: fx, items: scene.length, distinctSampledColors: colors.size, shieldY: hp.y });
  }
  h.context.matchMedia = oldMatch; return output;
}
function main(options = args(process.argv.slice(2))) {
  const canvas = options.render ? nativeCanvas() : null;
  const report = { version: '1.8.0', patchSha256: crypto.createHash('sha256').update(fs.readFileSync(patchPath)).digest('hex'), environment: 'Node VM with frozen production cores; native Canvas projection; no browser or physical-device claim', cores: [] };
  for (const core of options.cores) {
    const result = runCore(core, canvas); if (options.render) result.frames = renderFrames(result.h, options.render);
    delete result.h; report.cores.push(result); console.log(path.basename(core) + ': ' + result.groups + ' groups PASS');
  }
  report.pass = true; report.groups = report.cores.reduce((n, x) => n + x.groups, 0);
  if (options.out) { fs.mkdirSync(path.dirname(options.out), { recursive: true }); fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify({ pass: true, groups: report.groups, patchSha256: report.patchSha256 }));
  return report;
}
module.exports = { harness, setupAttack, controller, frames, runCore, renderFrames, main };
if (require.main === module) main();
