#!/usr/bin/env node
'use strict';
// Real engine events and the actual composed Canvas HUD. No browser is used.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createHarness: fieldHarness } = require('./field-ui-regression.cjs');
const root = path.resolve(__dirname, '..'), asset = file => path.join(root, 'assets', file);
const plain = value => JSON.parse(JSON.stringify(value));
const file = 'citadel-comic-v1.8.0.js';

function harness(core) {
  const h = fieldHarness(core, asset('citadel-field-ui-v1.7.0.js'));
  for (const name of ['citadel-mrg-v1.7.0.js', 'citadel-mrg-view-v1.7.0.js',
    'citadel-flight-v1.7.1.js', 'citadel-aim-v1.7.1.js', 'citadel-flight-view-v1.7.1.js',
    'citadel-pursuit-v1.8.0.js', 'citadel-swarm-v1.8.0.js', 'citadel-parallax-v1.8.0.js']) {
    vm.runInContext(fs.readFileSync(asset(name), 'utf8'), h.context, { filename: name });
  }
  vm.runInContext(`globalThis.comicBase={clarity:drawClarityHUD,mobile:drawMobileGameHUD,final:drawFinaleHUD,
    step:RequirementArcade.prototype.step};`, h.context);
  vm.runInContext(fs.readFileSync(asset(file), 'utf8'), h.context, { filename: file });
  vm.runInContext(`globalThis.comicQA={api:CITADEL_COMIC,clarity:drawClarityHUD,mobile:drawMobileGameHUD,
    final:drawFinaleHUD,flight:drawFlightHUD,campaign:drawCampaignFlightHUD,board:drawBoardHUD,
    scene:spaceScene,camera:spaceCamera,render:spaceDrawCPU,
    cupPack:typeof cupPack==='function'?cupPack:e=>JSON.parse(JSON.stringify(e,(k,v)=>
      ['qaEvents','hullCache','detour','nav','navExtras','pathCache','guideRoute','guideWatch'].includes(k)?undefined:v)),
    step:RequirementArcade.prototype.step};`, h.context);
  const ui = h.context.comicQA, base = h.context.comicBase;
  function flight(stage = 0) {
    h.setWallTime(0); const events = [];
    const e = new h.Engine(417147, (kind, data) => events.push({ kind, data }));
    h.arcade.engine = e; e.beginStage(stage); e.launch(); e.autopilot = false;
    ui.api.clear(e); e.qaEvents = events; return e;
  }
  function paint(e, w, height, { dpr = 1, before = false, scene = false } = {}) {
    h.viewport(w, height, dpr); h.context.devicePixelRatio = dpr;
    const canvas = h.createCanvas(w * dpr, height * dpr), c = canvas.getContext('2d');
    const cam = ui.camera(e, e.elapsed), funcs = before ? base : ui;
    if (e.finale) funcs.final(c, e, cam, canvas.width, canvas.height);
    else if (w <= 960) funcs.mobile(c, e, cam, canvas.width, canvas.height);
    else {
      if (e.board) ui.board(c, e, cam, canvas.width, canvas.height);
      else { ui.flight(c, e, cam, canvas.width, canvas.height); ui.campaign(c, e, cam, canvas.width, canvas.height); }
      funcs.clarity(c, e, cam, canvas.width, canvas.height);
    }
    if (scene) {
      // The actual game uses separate scene and HUD canvases; some HUDs clear
      // their own layer before drawing. Composite those layers in that order.
      const background = h.createCanvas(canvas.width, canvas.height), ctx = background.getContext('2d');
      ui.render(ctx, ui.scene(e, e.elapsed, true), cam, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0); return background;
    }
    return canvas;
  }
  return Object.assign(h, { ui, comic: ui.api, comicBase: base, flight, paint });
}
function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function pixels(a, b, bounds, dpr) {
  const aa = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const bb = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let changed = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    if ([0, 1, 2, 3].every(ch => aa[i + ch] === bb[i + ch])) continue;
    changed++;
    assert(bounds && x >= bounds.x * dpr && x <= (bounds.x + bounds.width) * dpr &&
      y >= bounds.y * dpr && y <= (bounds.y + bounds.height) * dpr, `HUD changed outside comic at ${x},${y}`);
  }
  if (bounds) assert(changed > 120, 'Real Canvas contains printed-comic pixels');
}
function verify(core, output) {
  const h = harness(core), tests = [], frames = [];
  const check = (name, fn) => { const detail = fn(); tests.push({ name, passed: true, ...(detail ? { detail } : {}) }); };
  check('Collecting a real requirement emits one caption and preserves its rewards and save schema', () => {
    const e = h.flight(), item = e.pickups.find(p => p.type === 'requirement'), keys = Object.keys(h.ui.cupPack(e));
    e.player.hp = 50; e.player.missiles = 3; const score = e.score;
    e.collect(item);
    assert.equal(h.comic.status(e).text, 'ФТ НА БОРТУ!'); assert.equal(e.score - score, 350);
    assert.equal(e.player.hp, 60); assert.equal(e.player.missiles, 5); assert(e.rescued.includes(item.reqId));
    assert.equal(e.qaEvents.filter(x => x.kind === 'rescue').length, 1);
    assert.deepEqual(Object.keys(h.ui.cupPack(e)), keys); assert(!JSON.stringify(h.ui.cupPack(e)).includes('wallEnd'));
  });
  check('Event bursts stay bounded; lifetime expires by simulation or wall clock', () => {
    const e = h.flight(); e.pulse(); assert.equal(h.comic.status(e).text, 'ЗАМЕЧАНИЯ ОТБИТЫ!');
    for (let n = 1; n <= 10; n++) { e.elapsed = n * .15; h.setWallTime(e.elapsed); e.emit('comic', { text: `ПРАВКА ${n}!`, kind: n > 5 ? 'warning' : 'action' }); }
    assert.equal(h.comic.status(e).serial, 1); assert(h.comic.status(e).pending);
    e.elapsed = 1.86; h.setWallTime(1.86); assert(!h.comic.status(e).active);
    e.elapsed = 10; h.setWallTime(10); assert(!h.comic.status(e).active); assert(!h.comic.status(e).pending);
    e.emit('comic', { text: 'КАНАЛ ОТКРЫТ!' }); assert(h.comic.status(e).active);
    h.setWallTime(12); assert(!h.comic.status(e).active, 'Stalled simulation cannot leave a billboard on screen');
  });
  check('Pause, cards, visibility and retry discard old captions without replaying them', () => {
    for (const status of ['paused', 'lesson', 'remark', 'lost']) {
      const e = h.flight(); e.pulse(); e.status = status; h.comic.status(e); e.status = 'playing';
      assert(!h.comic.status(e).active); e.emit('comic', { text: 'НОВОЕ ТЗ!' }); assert(h.comic.status(e).active);
    }
    const e = h.flight(); e.pulse(); h.context.document.hidden = true;
    for (const fn of h.events.get('visibilitychange') || []) fn();
    h.context.document.hidden = false; assert(!h.comic.status(e).active);
    e.beginStage(0); e.launch(); h.comic.clear(e); e.pulse(); assert(h.comic.status(e).active);
  });
  check('Ground pulse and admin-style emit reassignment retain original event delegation', () => {
    h.setWallTime(0); const e = h.engine(); h.comic.clear(e);
    const captured = []; e.emit = (kind, value) => captured.push({ kind, value });
    e.step(1 / 60, {}); e.boardPulse();
    assert(captured.some(x => x.kind === 'pulse')); assert(h.comic.status(e).active);
    const before = JSON.stringify(h.ui.cupPack(e)), savedStorage = [...h.storage.entries()];
    h.paint(e, 390, 460); h.paint(e, 1280, 720);
    assert.equal(JSON.stringify(h.ui.cupPack(e)), before); assert.deepEqual([...h.storage.entries()], savedStorage);
    for (const stage of [1, 2]) {
      const deck = h.engine(stage); h.comic.clear(deck);
      for (const enemy of deck.board.enemies.slice(0, 4)) deck.boardHit(enemy, 1e6, deck.board.pos, true);
      assert.equal(deck.board.kills, 4);
      assert.equal(h.comic.status(deck).text, 'МИНУС ЗАМЕЧАНИЕ!', 'Completed flight state cannot suppress deck comics');
    }
  });
  check('Real composed HUD retains all underlying pixels outside the caption at phone, landscape and DPR2 sizes', () => {
    for (const [w, height, dpr] of [[390, 460, 1], [844, 320, 1], [1280, 720, 1], [390, 460, 2]]) {
      for (const kind of ['flight', 'deck', 'mrg', 'parallax']) {
        const e = kind === 'flight' ? h.flight() : h.engine(kind === 'mrg' ? 3 : 0);
        if (kind === 'mrg') { e.beginFinale(); e.beginMRG(); }
        if (kind === 'parallax') { e.beginFinale(); e.launchFinale(); }
        h.setWallTime(0); h.comic.clear(e); h.arcade.fx = false;
        e.emit('comic', { text: kind === 'mrg' ? 'СРОЧНЫЕ ПРАВКИ!' : 'ТЗ НА БОРТУ!', kind: kind === 'mrg' ? 'warning' : 'success' });
        const original = h.paint(e, w, height, { dpr, before: true });
        const current = h.paint(e, w, height, { dpr }), bounds = h.comic.status(e).bounds;
        assert(bounds, `${kind} caption can be read at ${w}×${height}`);
        if (kind === 'parallax') assert(bounds.y >= 116, 'Comic stays below the separate attack instruction');
        for (const protectedBox of bounds.protected) assert(!overlaps(bounds, protectedBox), `${kind} avoids HUD, hero and crosshair`);
        pixels(original, current, bounds, dpr);
        if (output && dpr === 1) {
          const name = `${path.basename(core, '.js')}-${kind}-${w}x${height}.png`;
          fs.writeFileSync(path.join(output, name), h.paint(e, w, height, { scene: true }).toBuffer('image/png'));
          frames.push({ file: name, kind, bounds: plain(bounds) });
        }
        h.comic.clear(e); pixels(h.paint(e, w, height, { dpr, before: true }), h.paint(e, w, height, { dpr }), null, dpr);
      }
    }
  });
  check('Every new mission receives custom events; captions are cosmetic and the addon is idempotent', () => {
    for (const stage of [1, 2]) {
      const e = h.flight(stage), before = JSON.stringify(h.ui.cupPack(e));
      e.emit('comic', { text: stage === 1 ? 'ФЗ УХОДИТ СО СВЯЗИ!' : 'РОЙ УТОЧНЕНИЙ!', kind: 'warning' });
      h.paint(e, 390, 460); assert(h.comic.status(e).bounds); assert.equal(JSON.stringify(h.ui.cupPack(e)), before);
    }
    const functions = [h.ui.step, h.ui.clarity, h.ui.mobile, h.ui.final];
    vm.runInContext(fs.readFileSync(asset(file), 'utf8'), h.context);
    const again = vm.runInContext('[RequirementArcade.prototype.step,drawClarityHUD,drawMobileGameHUD,drawFinaleHUD]', h.context);
    assert.deepEqual(Array.from(again), functions);
    assert.equal(h.comic.clean('<b>ТЗ</b> \\*на\\* `борту`\n!'), 'ТЗ НА БОРТУ !');
    const e = h.flight(); assert.equal(h.comic.post(e, {}), false);
  });
  return { core: path.basename(core), passed: tests.length, tests, frames };
}
function main() {
  const cores = []; let output = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--core') cores.push(path.resolve(args[++i]));
    else if (args[i] === '--out') output = path.resolve(args[++i]);
    else throw new Error('Unknown argument: ' + args[i]);
  }
  if (!cores.length) cores.push(asset('atlas-v1.3.5.js'));
  if (output) fs.mkdirSync(output, { recursive: true });
  const report = { module: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(asset(file))).digest('hex'),
    verification: 'Actual engine in Node VM and native Canvas; no browser or physical-device QA', results: cores.map(core => verify(core, output)) };
  if (output) fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
module.exports = { harness, verify, main };
if (require.main === module) main();
