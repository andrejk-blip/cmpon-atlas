#!/usr/bin/env node
'use strict';

// Station deck notifications, exercised against real frozen game cores in a
// Node VM and native Canvas. No browser, network or production storage is used.
// node tests/field-ui-regression.cjs --core assets/atlas-v1.3.5.js \
//   --core ../cmpon-analytics-admin/game-lab/engine-v1.2.1.js --render /tmp/field-ui-qa
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

function nativeCanvas() {
  const search = [process.cwd(), __dirname, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean);
  return require(require.resolve('@napi-rs/canvas', { paths: search })).createCanvas;
}

function createHarness(corePath, fieldPath, createCanvas = nativeCanvas()) {
  const nodes = new Map(), storage = new Map(), events = new Map();
  let wallTime = 0, document;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    let item = {
      id, tagName: 'DIV', innerHTML: '', textContent: id === 'release-data' ? '{"version":"test"}' : '',
      value: '', hidden: false, open: false, style: { setProperty(k, v) { this[k] = v; } },
      dataset: {}, handlers: {}, attrs: {},
      classList: { add(k) { classes.add(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); },
        toggle(k, on) { if (on === undefined) on = !classes.has(k); on ? classes.add(k) : classes.delete(k); } },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
      addEventListener(k, f) { (this.handlers[k] ??= []).push(f); },
      focus() { document.activeElement = this; }, setPointerCapture() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector() { return { focus() {} }; }, querySelectorAll() { return []; }, scrollIntoView() {},
      appendChild(child) { (this.children ??= []).push(child); return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      insertAdjacentHTML(_, html) { this.innerHTML += html; },
    };
    if (/canvas/.test(id)) {
      const canvas = createCanvas(1280, 720); Object.assign(canvas, item); item = canvas; item.tagName = 'CANVAS';
    }
    nodes.set(id, item); return item;
  }
  document = {
    body: node('body'), head: node('head'), documentElement: node('html'), hidden: false,
    activeElement: { tagName: 'BODY' }, getElementById: node,
    createElement(tag) { const item = node(`created-${tag}-${nodes.size}`); item.tagName = tag.toUpperCase(); return item; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(k, f) { (events.get(k) || events.set(k, []).get(k)).push(f); },
  };
  const context = {
    document, ATLAS_TEST: true, console, performance: { now: () => wallTime * 1000 },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }), devicePixelRatio: 1,
    innerWidth: 1280, innerHeight: 800, visualViewport: { height: 800, addEventListener() {} },
    addEventListener() {}, navigator: {}, setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, crypto: crypto.webcrypto, Blob, URL, Uint32Array,
    localStorage: { getItem(k) { return storage.get(k) ?? null; }, setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }, clear() { storage.clear(); } },
  };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(corePath, 'utf8'), context, { filename: path.basename(corePath) });
  vm.runInContext(`globalThis.fieldBase = {
    clarity: drawClarityHUD, mobile: drawMobileGameHUD, updateClarity: updateCitadelClarity,
    board: drawBoardHUD, final: drawFinaleHUD, overlay: arcadeOverlayHTML
  }`, context);
  vm.runInContext(fs.readFileSync(fieldPath, 'utf8'), context, { filename: path.basename(fieldPath) });
  vm.runInContext(`globalThis.qa = {
    Engine: RequirementArcade, arcade: ARCADE, state: STATE, api: CITADEL_FIELD_UI,
    scene: spaceScene, camera: spaceCamera, render: spaceDrawCPU, project: spaceProject,
    clarity: drawClarityHUD, mobile: drawMobileGameHUD, board: drawBoardHUD,
    updateClarity: updateCitadelClarity, final: drawFinaleHUD, overlay: arcadeOverlayHTML
  }`, context);
  const qa = context.qa; qa.arcade.sound = false; qa.arcade.forceCPU = true; qa.state.view = 'arcade';
  qa.arcade.canvas = node('arcade-canvas');
  function engine(stage = 0) {
    let e;
    const emitted = [];
    e = new qa.Engine(417147, (kind, data) => {
      emitted.push({ kind, data });
      if (e && qa.arcade.engine === e) qa.updateClarity();
    });
    qa.arcade.engine = e; e.beginStage(stage); e.beginBoarding();
    e.board.intro = 0; e.board.guideHint = 0; e.qaEvents = emitted;
    return e;
  }
  function viewport(width, height, dpr = 1) {
    context.innerWidth = width;
    qa.arcade.canvas.width = width * dpr; qa.arcade.canvas.height = height * dpr;
    qa.arcade.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  }
  function hud(e, width, height, { base = false, dpr = 1, camera = qa.camera(e, e.elapsed) } = {}) {
    viewport(width, height, dpr);
    const canvas = createCanvas(width * dpr, height * dpr), c = canvas.getContext('2d');
    const funcs = base ? context.fieldBase : qa;
    if (width <= 960) funcs.mobile(c, e, camera, canvas.width, canvas.height);
    else { funcs.board(c, e, camera, canvas.width, canvas.height); funcs.clarity(c, e, camera, canvas.width, canvas.height); }
    return canvas;
  }
  return { ...qa, base: context.fieldBase, context, nodes, storage, events, engine, viewport, hud,
    createCanvas, corePath, fieldPath, setWallTime(value) { wallTime = value; } };
}

function hit(h, e) {
  const enemy = e.board.enemies.find(x => !x.dead && x.archetype === 'sniper') || e.board.enemies.find(x => !x.dead);
  assert(enemy, 'Seeded deck has a real enemy');
  e.boardHit(enemy, 1e6, e.board.pos, true);
  return enemy;
}
function boxOK(box, width, height) {
  assert(box, 'Notice has an on-screen placement');
  assert(box.x >= 7 && box.x + box.width <= width - 7, 'Notice is horizontally clamped');
  assert(box.y >= 44 && box.y + box.height <= height - 10, 'Notice avoids top HUD and bottom edge');
  assert(box.y >= box.heroY + 10, 'Notice is below the physical player origin');
  assert(box.width <= 273 && box.height <= 24, 'Notice stays compact');
}
function equalOutside(a, b, box, scale = 1) {
  const aa = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const bb = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let changed = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const inside = box && x >= (box.x - 2) * scale && x <= (box.x + box.width + 2) * scale &&
      y >= (box.y - 2) * scale && y <= (box.y + box.height + 2) * scale;
    const i = (y * a.width + x) * 4;
    for (let ch = 0; ch < 4; ch++) if (aa[i + ch] !== bb[i + ch]) {
      assert(inside, `Original HUD changed outside notice at ${x},${y}`); changed++; break;
    }
  }
  if (box) assert(changed > 20, 'Actual Canvas pixels contain the new notice');
}

function run(h, renderDir) {
  const tests = [], frames = [], check = (name, fn) => { fn(); tests.push(name); };
  check('real board kill: events, score and engine toast schema preserved', () => {
    const e = h.engine(), score = e.score, enemy = hit(h, e);
    assert(enemy.dead); assert.equal(e.board.kills, 1); assert(e.score > score);
    assert.equal(e.toast.title, 'ПОТОК ПЕРЕХВАЧЕН'); assert.equal(e.toast.until, e.elapsed + 5);
    assert.deepEqual(Object.keys(e.toast).sort(), ['detail', 'kind', 'title', 'until']);
    assert.equal(e.qaEvents.filter(x => x.kind === 'toast' && x.data === 'ПОТОК ПЕРЕХВАЧЕН').length, 1);
    assert(h.api.status(e).active); assert(h.nodes.get('citadel-toast').hidden);
  });
  check('HUD and decisions remain the original functions; unrelated notices use original DOM', () => {
    assert.equal(h.board, h.base.board); assert.equal(h.final, h.base.final); assert.equal(h.overlay, h.base.overlay);
    const e = h.engine(); hit(h, e);
    e.notify('РЕШЕНИЕ ПРИНЯТО', 'Связи с источником сохранены'); h.updateClarity();
    assert.equal(h.nodes.get('citadel-toast').hidden, false); assert.equal(h.api.status(e).active, false);
    assert(h.nodes.get('citadel-toast').innerHTML.includes('Связи с источником сохранены'));
    e.beginStage(0); e.notify('ЗАМЕЧАНИЕ ПЕРЕХВАЧЕНО', 'Орбита'); e.status = 'playing'; h.updateClarity();
    assert.equal(h.nodes.get('citadel-toast').hidden, false);
  });
  check('short lifetime, repeated interceptions do not extend it, explicit quiet interval', () => {
    h.setWallTime(0); const e = h.engine(); hit(h, e);
    for (const time of [.3, .8, 1.3]) { e.elapsed = time; h.setWallTime(time); e.notify('ПОТОК ПЕРЕХВАЧЕН', 'Боец'); }
    assert.equal(h.api.status(e).count, 4); assert(h.api.status(e).remaining < .51);
    e.elapsed = 1.81; h.setWallTime(1.81); assert.equal(h.api.status(e).active, false);
    e.notify('ПОТОК ПЕРЕХВАЧЕН', 'Боец'); assert.equal(h.api.status(e).active, false);
    e.elapsed = 2.81; h.setWallTime(2.81); e.notify('ПОТОК ПЕРЕХВАЧЕН', 'Боец'); assert(h.api.status(e).active);
    h.setWallTime(5); assert.equal(h.api.status(e).active, false, 'Wall clock also expires a stalled game');
  });
  check('pause, terminal review, hidden page and restored toast never replay a notice', () => {
    for (const status of ['paused', 'remark', 'lesson']) {
      h.setWallTime(0); const e = h.engine(); hit(h, e); e.status = status; h.updateClarity();
      e.status = 'boarding'; h.updateClarity(); assert.equal(h.api.status(e).active, false);
    }
    const e = h.engine(); hit(h, e); h.context.document.hidden = true;
    for (const fn of h.events.get('visibilitychange') || []) fn();
    h.context.document.hidden = false; assert.equal(h.api.status(e).active, false);
    const restored = h.engine(); restored.toast = JSON.parse(JSON.stringify(e.toast)); h.updateClarity();
    assert.equal(h.api.status(restored).active, false); assert(h.nodes.get('citadel-toast').hidden);
  });
  check('finale/MRG notices and engine state remain outside the field module', () => {
    const e = h.engine(3); e.beginFinale(); e.beginMRG();
    e.notify('ПОТОК ПЕРЕХВАЧЕН', 'Финал'); h.updateClarity();
    assert.equal(h.api.status(e).active, false); assert.equal(h.nodes.get('citadel-toast').hidden, false);
  });
  check('native Canvas: original HUD pixels retained, compact below-player bounds at four viewport/DPR modes', () => {
    for (const [w, height, dpr] of [[1280, 720, 1], [390, 460, 1], [592, 244, 1], [390, 460, 2]]) {
      h.setWallTime(0); const e = h.engine(); hit(h, e);
      const original = h.hud(e, w, height, { base: true, dpr });
      const updated = h.hud(e, w, height, { dpr });
      const box = h.api.status(e).bounds; boxOK(box, w, height); equalOutside(original, updated, box, dpr);
      e.elapsed += 2; h.setWallTime(2);
      equalOutside(h.hud(e, w, height, { base: true, dpr }), h.hud(e, w, height, { dpr }), null, dpr);
    }
  });
  check('long labels, edge/camera positions, no overlap with the player or top/bottom HUD', () => {
    for (const [w, height] of [[1280, 720], [390, 460], [592, 244]]) {
      h.setWallTime(0); const e = h.engine();
      e.notify('ПОТОК ПЕРЕХВАЧЕН', 'Очень длинное название перехваченного противника, которое не помещается');
      const camera = h.camera(e, e.elapsed);
      for (const dx of [-35, -10, 0, 10, 35]) for (const dz of [-24, 0, 24]) {
        const moved = { ...camera, pos: camera.pos.map((x, i) => x + (i === 0 ? dx : i === 2 ? dz : 0)) };
        h.hud(e, w, height, { camera: moved });
        const box = h.api.status(e).bounds; if (box) boxOK(box, w, height);
      }
    }
  });
  check('pulse notice is short, FX-off keeps information and introduces no engine properties', () => {
    h.setWallTime(0); const e = h.engine(), keys = Object.keys(e).sort(); h.arcade.fx = false;
    e.boardPulse(); h.hud(e, 592, 244); assert(h.api.status(e).text.includes('Импульс'));
    assert.deepEqual(Object.keys(e).sort(), keys); h.arcade.fx = true;
  });
  check('idle field has exactly the original HUD pixels and storage remains untouched', () => {
    const e = h.engine();
    for (const [w, height] of [[1280, 720], [390, 460], [592, 244]])
      equalOutside(h.hud(e, w, height, { base: true }), h.hud(e, w, height), null);
    const before = [...h.storage.entries()]; e.notify('ИМПУЛЬС', 'Щиты сбиты'); h.hud(e, 592, 244);
    assert.deepEqual([...h.storage.entries()], before);
  });
  if (renderDir) check('actual deck before/after composites', () => {
    fs.mkdirSync(renderDir, { recursive: true });
    for (const [w, height] of [[1280, 720], [390, 460], [592, 244]]) {
      h.setWallTime(0); const e = h.engine(); hit(h, e);
      const cam = h.camera(e, e.elapsed), scene = h.createCanvas(w, height);
      h.render(scene.getContext('2d'), h.scene(e, e.elapsed), cam, w, height);
      for (const before of [true, false]) {
        const canvas = h.createCanvas(w, height), c = canvas.getContext('2d');
        c.drawImage(scene, 0, 0); c.drawImage(h.hud(e, w, height, { base: before }), 0, 0);
        if (before) {
          // Canvas reconstruction of the former DOM toast, not a browser DOM
          // screenshot. Background, text, spacing and location use frozen CSS.
          const mobile = w <= 960, tw = mobile ? w - 30 : 440, th = mobile ? 56 : 70;
          const x = (w - tw) / 2, y = mobile ? 45 : height * .17;
          c.fillStyle = '#0b2a36ec'; c.fillRect(x, y, tw, th); c.strokeStyle = '#77bba6'; c.strokeRect(x, y, tw, th);
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#b5f3cf';
          c.font = `bold ${mobile ? 11 : 12}px monospace`; c.fillText(e.toast.title, w / 2, y + th * .35);
          c.font = `${mobile ? 11 : 10}px Arial`; c.fillStyle = '#8fb8bd'; c.fillText(e.toast.detail, w / 2, y + th * .7, tw - 24);
        } else boxOK(h.api.status(e).bounds, w, height);
        const name = `${path.basename(h.corePath, '.js')}-${before ? 'before' : 'after'}-${w}x${height}.png`;
        fs.writeFileSync(path.join(renderDir, name), canvas.toBuffer('image/png'));
        frames.push({ file: name, width: w, height, phase: e.phase, status: e.status,
          hero: Array.from(e.board.pos), event: e.toast.title, bounds: before ? null : h.api.status(e).bounds,
          baseline: before ? 'Actual native scene/HUD; original DOM toast reconstructed from frozen CSS' : 'Actual native scene/HUD with the production field-ui module' });
      }
    }
  });
  return { core: path.basename(h.corePath), passed: tests.length, tests, frames };
}

function main() {
  const root = path.resolve(__dirname, '..'), cores = [];
  let modulePath = path.join(root, 'assets/citadel-field-ui-v1.7.0.js'), render = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--core') cores.push(path.resolve(args[++i]));
    else if (args[i] === '--module') modulePath = path.resolve(args[++i]);
    else if (args[i] === '--render') render = path.resolve(args[++i]);
    else throw new Error('Unknown argument: ' + args[i]);
  }
  if (!cores.length) cores.push(path.join(root, 'assets/atlas-v1.3.5.js'));
  const result = { module: path.basename(modulePath), sha256: crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),
    qa: 'Node VM + actual native Canvas; no browser QA', results: cores.map(core => run(createHarness(core, modulePath), render)) };
  if (render) fs.writeFileSync(path.join(render, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
module.exports = { createHarness, run, nativeCanvas, boxOK, main };
if (require.main === module) main();
