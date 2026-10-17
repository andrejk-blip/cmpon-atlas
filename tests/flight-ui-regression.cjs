#!/usr/bin/env node
'use strict';
// Actual scene/HUD methods with native Canvas. This is not a browser screenshot.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness, nativeCanvas } = require('./mrg-regression.cjs');
const root = path.resolve(__dirname, '..'), createCanvas = nativeCanvas();
const cores = [], args = process.argv.slice(2);
let output = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--core') cores.push(path.resolve(args[++i]));
  else if (args[i] === '--out') output = path.resolve(args[++i]);
  else throw new Error('Unknown argument: ' + args[i]);
}
if (!cores.length) cores.push(path.join(root, 'assets/atlas-v1.3.5.js'));
if (output) fs.mkdirSync(output, { recursive: true });
const asset = file => path.join(root, 'assets', file);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const near = (a, b, message, eps = 1e-6) => assert(Math.abs(a - b) < eps, `${message}: ${a} vs ${b}`);

function observe(context) {
  const calls = [], bind = new Map(); let commands = [];
  const proxy = new Proxy(context, {
    get(target, key) {
      if (typeof target[key] !== 'function') return target[key];
      if (bind.has(key)) return bind.get(key);
      const fn = (...args) => {
        if (key === 'beginPath') commands = [];
        if (['moveTo', 'lineTo', 'closePath'].includes(key)) commands.push([key, ...args]);
        if (['fillText', 'strokeRect', 'fillRect', 'fill'].includes(key)) {
          const matrix = target.getTransform();
          const call = { method: key, args: plain(args), color: key === 'strokeRect' ? target.strokeStyle : target.fillStyle,
            transform: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f } };
          if (key === 'fill') call.path = commands.slice();
          if (key === 'fillText') {
            const natural = target.measureText(String(args[0])).width, width = args[3] == null ? natural : Math.min(natural, args[3]);
            const fontSize = Number((target.font.match(/([\d.]+)px/) || [0, 12])[1]);
            const left = args[1] - (target.textAlign === 'center' ? width / 2 : ['right', 'end'].includes(target.textAlign) ? width : 0);
            call.bounds = { left: matrix.a * left + matrix.e, right: matrix.a * (left + width) + matrix.e,
              top: matrix.d * (args[2] - fontSize * .65) + matrix.f, bottom: matrix.d * (args[2] + fontSize * .65) + matrix.f };
          }
          calls.push(call);
        }
        return target[key](...args);
      };
      bind.set(key, fn); return fn;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { context: proxy, calls };
}

function harness(core) {
  const h = createHarness(core, asset('citadel-mrg-v1.7.0.js'), asset('citadel-mrg-view-v1.7.0.js'), createCanvas);
  h.context.location = { href: 'https://example.invalid/#arcade', origin: 'https://example.invalid', pathname: '/', search: '', hash: '#arcade', protocol: 'https:' };
  for (const file of ['citadel-flight-v1.7.1.js', 'citadel-aim-v1.7.1.js', 'citadel-field-ui-v1.7.0.js']) {
    vm.runInContext(fs.readFileSync(asset(file), 'utf8'), h.context, { filename: file });
  }
  vm.runInContext(`globalThis.uiBase = { scene: spaceSceneBase, objective: RequirementArcade.prototype.objective,
    clarity: drawClarityHUD, campaign: drawCampaignFlightHUD, mobile: drawMobileGameHUD, overlay: arcadeOverlayHTML }`, h.context);
  vm.runInContext(fs.readFileSync(asset('citadel-flight-view-v1.7.1.js'), 'utf8'), h.context, { filename: 'citadel-flight-view-v1.7.1.js' });
  vm.runInContext(`globalThis.ui = { scene: spaceSceneBase, clarity: drawClarityHUD, campaign: drawCampaignFlightHUD,
    mobile: drawMobileGameHUD, overlay: arcadeOverlayHTML, update: updateArcadeHUD, flight: drawFlightHUD,
    api: CITADEL_FLIGHT_VIEW, nav: CITADEL_FLIGHT }`, h.context);
  h.ui = h.context.ui; h.base = h.context.uiBase; h.arcade.canvas = h.context.document.getElementById('arcade-canvas');
  function viewport(width, height, dpr = 1) {
    h.context.innerWidth = width; h.context.innerHeight = height + 100; h.context.devicePixelRatio = dpr;
    h.arcade.canvas.width = width * dpr; h.arcade.canvas.height = height * dpr;
    h.arcade.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  }
  function flight(stage = 0) {
    const e = new h.Engine(417147, () => {}); h.arcade.engine = e; e.beginStage(stage); e.launch();
    e.navTarget(); return e;
  }
  function hud(e, width, height, { dpr = 1, base = false, cam = h.camera(e, e.elapsed) } = {}) {
    viewport(width, height, dpr);
    const canvas = createCanvas(width * dpr, height * dpr), recorded = observe(canvas.getContext('2d'));
    const ui = base ? h.base : h.ui;
    if (width <= 960) ui.mobile(recorded.context, e, cam, canvas.width, canvas.height);
    else { h.ui.flight(recorded.context, e, cam, canvas.width, canvas.height); ui.campaign(recorded.context, e, cam, canvas.width, canvas.height); ui.clarity(recorded.context, e, cam, canvas.width, canvas.height); }
    return { canvas, calls: recorded.calls, cam };
  }
  return Object.assign(h, { viewport, flight, hud });
}

function stable(e) {
  const names = 'seed status phase stage assist score rescued player enemies bullets hostile pickups nodes decisions lesson lessonQueue completedRemarks selectedTarget board finale'.split(' ');
  return JSON.stringify(Object.fromEntries(names.map(name => [name, e[name]])));
}
function verify(core) {
  const h = harness(core), groups = [], images = [], prefix = path.basename(core).startsWith('atlas') ? 'public' : 'admin';
  const check = (name, fn) => { try { const details = fn(); groups.push({ name, passed: true, ...(details ? { details } : {}) }); } catch (error) { groups.push({ name, passed: false, error: error.message }); } };
  const fixture = () => {
    const e = h.flight(); e.autopilot = false;
    const first = e.pickups.find(item => item.type === 'requirement'); first.pos = [0, 0, -42];
    e.pickups.find(item => item.type === 'repair').pos = [-12, 0, -42];
    e.pickups.find(item => item.type === 'missiles').pos = [12, 0, -42];
    e.navTarget(); return e;
  };
  check('Three pickup types have document, plus and rocket silhouettes', () => {
    const e = fixture(), types = {};
    for (const type of ['requirement', 'repair', 'missiles']) {
      const item = e.pickups.find(item => item.type === type), before = JSON.stringify(item);
      const meshes = h.ui.api.cargoMeshes(item, 1.25, false); assert.equal(JSON.stringify(item), before);
      assert(meshes.every(mesh => mesh.citadelCargo === type && mesh.model.every(Number.isFinite)));
      types[type] = meshes.map(mesh => mesh.mesh);
    }
    assert.deepEqual(plain(types.requirement), ['box', 'box', 'box', 'box', 'box', 'box']);
    assert.deepEqual(plain(types.repair), ['box', 'box']); assert.deepEqual(plain(types.missiles), ['hull', 'octa']);
    return types;
  });
  check('Old pickup octahedra and rings are removed from the actual scene', () => {
    const e = fixture(), items = h.scene(e, e.elapsed, true);
    for (const item of e.pickups.filter(item => !item.dead)) {
      const old = items.filter(mesh => !mesh.citadelCargo && ['ring', 'octa'].includes(mesh.mesh) && distance(mesh.pos, item.pos) < 1e-9);
      assert.equal(old.length, 0, `old ${item.type} geometry`);
    }
    assert.equal(items.filter(mesh => mesh.citadelCargo === 'requirement').length, 18);
    assert.equal(items.filter(mesh => mesh.citadelCargo === 'repair').length, 2);
    assert.equal(items.filter(mesh => mesh.citadelCargo === 'missiles').length, 2);
  });
  check('Scene and HUD rendering leave mission state and rewards unchanged', () => {
    const e = fixture(), before = stable(e), storage = [...h.storage.entries()];
    h.scene(e, 2, false); h.hud(e, 390, 460, { dpr: 2 }); h.hud(e, 1280, 720); e.objective();
    assert.equal(stable(e), before); assert.deepEqual([...h.storage.entries()], storage);
    const collect = e.pickups.find(item => item.type === 'requirement'); e.player.hp = 50; e.player.missiles = 3; const score = e.score;
    e.collect(collect); near(e.player.hp, 60, 'requirement health reward'); assert.equal(e.player.missiles, 5); assert.equal(e.score - score, 350);
    e.collect(e.pickups.find(item => item.type === 'repair')); near(e.player.hp, 90, 'repair reward');
    e.collect(e.pickups.find(item => item.type === 'missiles')); assert.equal(e.player.missiles, 8);
    assert(e.rescued.includes(collect.reqId)); assert.equal(e.progress().modules, 1);
  });
  check('Briefing explains mandatory requirements and both supplies', () => {
    const e = h.flight(); e.status = 'briefing'; const html = h.ui.overlay();
    assert(html.includes('пакет требований')); assert(html.includes('нужны для входа в Цитадель'));
    assert(html.includes('Синий «+» — щит +30')); assert(html.includes('Янтарная ракета — боезапас +3'));
    assert(!html.includes('К ПЕРВОМУ КРИСТАЛЛУ'));
  });
  check('Flight objective and collected counter name requirement packages', () => {
    const e = h.flight(); const objective = e.objective(); assert(objective.title.includes('пакет требований')); assert(objective.detail.includes('все 3 пакета'));
    assert.equal(objective.progress, 'ТРЕБОВАНИЯ 0 / 3');
    e.collect(e.pickups.find(item => item.type === 'requirement')); assert.equal(e.objective().progress, 'ТРЕБОВАНИЯ 1 / 3');
  });
  check('Manual docking instructions match the navigation contract', () => {
    const e = h.flight(); e.phase = 'dock'; e.autopilot = false;
    for (const width of [390, 1280]) { h.viewport(width, 460); const goal = e.objective(); assert(!goal.detail.includes('начнётся сама'), 'manual docking still requires F or enabling autopilot'); assert(/F|Автокурс|автокурс/.test(goal.detail)); }
  });
  check('Nearby supply labels explain the visible plus and rocket', () => {
    const e = fixture(), info = [];
    for (const [w, height] of [[390, 460], [844, 320], [1280, 720]]) {
      const rendered = h.hud(e, w, height), labels = rendered.calls.filter(call => call.method === 'fillText').map(call => call.args[0]);
      assert(labels.includes('ЩИТ +30'), `repair label at ${w}`); assert(labels.includes('РАКЕТЫ +3'), `rocket label at ${w}`); info.push({ width: w, labels: labels.filter(label => ['ЩИТ +30', 'РАКЕТЫ +3'].includes(label)) });
    }
    return info;
  });
  check('Mobile gate rectangle uses the actual entrance and respects DPR', () => {
    const e = h.flight(); e.phase = 'dock'; e.autopilot = true;
    e.player.pos = [e.station.pos[0], e.station.pos[1], e.station.pos[2] - 120]; e.player.yaw = Math.PI; e.player.pitch = 0;
    const checks = [];
    for (const [width, height, dpr] of [[390, 460, 1], [390, 460, 2], [844, 320, 1]]) {
      const cam = h.camera(e, e.elapsed), expected = h.project(h.ui.nav.gate(e), cam, width, height);
      const rendered = h.hud(e, width, height, { dpr, cam });
      const marker = rendered.calls.find(call => call.method === 'strokeRect' && call.args[2] === 28 && call.args[3] === 36);
      assert(marker, 'actual gate marker must be on screen'); near(marker.args[0] + 14, expected.x, 'gate x'); near(marker.args[1] + 18, expected.y, 'gate y'); near(marker.transform.a, dpr, 'DPR x'); near(marker.transform.d, dpr, 'DPR y');
      checks.push({ width, height, dpr, marker: [expected.x, expected.y] });
    }
    return checks;
  });
  check('Offscreen gate arrows point to the gate side and labels stay inside HUD', () => {
    const e = h.flight(); e.phase = 'dock'; e.player.pos = [0, 0, 0];
    const cam = { pos: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], fov: 1.07 };
    for (const [gate, direction] of [[[100, 0, -10], 'right'], [[-100, 0, -10], 'left'], [[0, 100, -10], 'up'], [[0, -100, -10], 'down'], [[100, 0, 10], 'right']]) {
      e.station.pos = [gate[0], gate[1], gate[2] + 25];
      const rendered = h.hud(e, 390, 460, { cam, dpr: 2 });
      const arrow = rendered.calls.find(call => call.method === 'fill' && call.path?.some(command => command[0] === 'moveTo' && command[1] === 9 && command[2] === 0));
      assert(arrow, 'offscreen arrow');
      if (direction === 'right') assert(arrow.transform.a > 0 && arrow.transform.e > 390);
      if (direction === 'left') assert(arrow.transform.a < 0 && arrow.transform.e < 390);
      if (direction === 'up') assert(arrow.transform.b < 0);
      if (direction === 'down') assert(arrow.transform.b > 0);
      const label = rendered.calls.find(call => call.method === 'fillText' && call.args[0].startsWith('ШЛЮЗ ·'));
      assert(label); assert(label.bounds.left >= 0 && label.bounds.right <= 780 && label.bounds.top >= 0 && label.bounds.bottom <= 920);
    }
  });
  check('New HUD labels fit wide, narrow, short and DPR 2 canvases', () => {
    const e = fixture();
    for (const [w, height, dpr] of [[390, 460, 1], [844, 320, 1], [1280, 720, 1], [390, 460, 2]]) {
      const rendered = h.hud(e, w, height, { dpr });
      const labels = rendered.calls.filter(call => call.method === 'fillText' && /ТРЕБОВАНИЯ|КАПСУЛА|ЩИТ \+30|РАКЕТЫ \+3|ФТ \d\/3/.test(call.args[0]));
      assert(labels.length >= 3);
      for (const label of labels) assert(label.bounds.left >= -1 && label.bounds.right <= w * dpr + 1 && label.bounds.top >= -1 && label.bounds.bottom <= height * dpr + 1, JSON.stringify(label));
    }
  });
  check('Convoy, board and finale delegate scene, objectives and HUD unchanged', () => {
    const tests = [];
    const escort = h.flight(); escort.status = 'stageclear'; escort.upgradeChoice = 'weapons'; escort.beginEscort(); escort.launch(); tests.push(escort);
    const deck = h.flight(); deck.beginBoarding(); tests.push(deck);
    const mrg = h.engine(); tests.push(mrg);
    for (const e of tests) {
      h.arcade.engine = e; assert.deepEqual(plain(h.ui.scene(e, 1, false)), plain(h.base.scene(e, 1, false)));
      assert.deepEqual(plain(e.objective()), plain(h.base.objective.call(e)));
      const before = h.hud(e, 390, 460, { base: true }).canvas.toBuffer('image/png');
      const after = h.hud(e, 390, 460).canvas.toBuffer('image/png'); assert(before.equals(after), `HUD changed for ${e.phase}/${e.finale?.phase}`);
    }
  });
  check('Native composite frames render actual game meshes and HUD', () => {
    if (!output) return { skippedImages: 'Pass --out to save native composite frames' };
    for (const [phase, width, height, dpr] of [['cargo', 1280, 720, 1], ['cargo', 390, 460, 1], ['dock', 844, 320, 1], ['dock', 390, 460, 2]]) {
      const e = fixture();
      if (phase === 'dock') { e.phase = 'dock'; e.pickups.forEach(item => { if (item.type === 'requirement') { item.dead = true; e.rescued.push(item.reqId); } }); e.autopilot = true; e.player.pos = [e.station.pos[0] + 12, e.station.pos[1] + 1, e.station.pos[2] - 120]; e.player.yaw = Math.PI; }
      h.viewport(width, height, dpr); const cam = h.camera(e, e.elapsed), canvas = createCanvas(width * dpr, height * dpr);
      h.draw(canvas.getContext('2d'), h.scene(e, 1.25, false), cam, canvas.width, canvas.height);
      canvas.getContext('2d').drawImage(h.hud(e, width, height, { dpr, cam }).canvas, 0, 0);
      const file = path.join(output, `${prefix}-${phase}-${width}x${height}-dpr${dpr}.png`); fs.writeFileSync(file, canvas.toBuffer('image/png')); images.push(file);
    }
    return { images: images.length };
  });
  return { core: path.basename(core), passed: groups.filter(group => group.passed).length, total: groups.length, groups, images };
}

const report = { version: '1.7.1', method: 'Real core scene and HUD wrappers, native Canvas composites, scripted geometry/input checks; no browser',
  view_sha256: hash(asset('citadel-flight-view-v1.7.1.js')), navigation_sha256: hash(asset('citadel-flight-v1.7.1.js')), results: cores.map(verify) };
if (output) fs.writeFileSync(path.join(output, 'flight-ui-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.results.some(result => result.passed !== result.total)) process.exitCode = 1;
