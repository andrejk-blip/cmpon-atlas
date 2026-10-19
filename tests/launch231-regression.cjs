'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { mobileHarness } = require('./android-startup-regression.cjs');
const results = [], tick = () => new Promise(resolve => setImmediate(resolve));
const run = (h, source) => vm.runInContext(source, h.c);
const down = url => url.includes('/api/tournament/') ? Promise.reject(new TypeError('Failed to fetch')) : undefined;
const reply = data => ({ ok: true, status: 200, json: async () => data });
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message, stack: error.stack.split('\n').slice(1,4) }); } }
async function submit(h) { const form = h.c.document.getElementById('cup-entry-form'); form.nameValue = 'Private test name'; await h.dispatch('submit', { target: form }); }
async function click(h, action) { run(h, `arcadeAction(${JSON.stringify(action)})`); await tick(); }
async function play(h) {
  if (h.c.CITADEL_STORY?.status().active) await click(h, 'story-skip');
  if (run(h, 'ARCADE.engine.status') === 'briefing') await click(h, 'citadel-launch');
  if (run(h, 'ARCADE.engine.status') === 'paused') await click(h, 'arcade-resume');
  assert.equal(run(h, 'ARCADE.engine.status'), 'playing');
  run(h, 'ARCADE.keys.add("Space"); arcadeFrame(17); ARCADE.keys.clear();');
  assert(run(h, 'ARCADE.engine.shots') > 0);
}
async function main() {
  await test('Reproduce the old name-entry failure: rejected fetch leaves the engine in menu', async () => {
    const h = mobileHarness({ withoutLaunch: true, fetchImpl: down }); await tick(); await submit(h);
    assert.equal(run(h, 'ARCADE.engine.status'), 'menu'); assert.equal(run(h, 'CUP.error'), 'Failed to fetch');
  });
  await test('Rejected fetch: same name form starts a playable local campaign with no raw error', async () => {
    const h = mobileHarness({ fetchImpl: down }); await tick(); await submit(h); await play(h);
    assert(h.c.CITADEL_LAUNCH.status().local); assert.equal(run(h, 'CUP.attached'), false);
    assert(h.storage.has('cmpon.citadel.local.v1'));
    assert(!JSON.stringify(h.c.CITADEL_LAUNCH.status()).includes('Private test name'));
  });
  await test('Hanging fetch and missing AbortController: whole start expires at 7 seconds', async () => {
    const h = mobileHarness({ controllerless: true, legacy: true, fetchImpl: url => url.includes('/api/tournament/') ? new Promise(() => {}) : undefined });
    await submit(h); assert.equal(run(h, 'CUP.busy'), true);
    for (const [id, timer] of [...h.c.timers]) if (timer.delay === 7000 && h.c.timers.has(id)) h.c.fire(id);
    await tick(); await play(h); assert.equal(h.c.CITADEL_LAUNCH.status().pending, 0);
  });
  await test('Manual local entry cancels registration; a late response cannot replace the engine', async () => {
    let finish;
    const h = mobileHarness({ fetchImpl: url => url.endsWith('/enter') ? new Promise(resolve => { finish = resolve; }) : undefined });
    await tick(); await submit(h); await click(h, 'launch-local'); await play(h);
    const engine = run(h, 'ARCADE.engine');
    finish(reply({ token: 'late-token', player: { id: 'late', name: 'late' } })); await tick();
    assert.equal(run(h, 'ARCADE.engine'), engine); assert.equal(run(h, 'CUP.player'), null);
    assert.equal(h.c.CITADEL_LAUNCH.status().pending, 0);
  });
  await test('Late start response and repeated taps never launch a second campaign', async () => {
    let finish;
    const h = mobileHarness({ fetchImpl: url => url.endsWith('/start') ? new Promise(resolve => { finish = resolve; }) : undefined });
    await tick(); await submit(h); await submit(h);
    assert.equal(h.fetchCalls.filter(x => x.endpoint === 'start').length, 1);
    run(h, 'arcadeAction("launch-local"); arcadeAction("launch-local");'); await tick(); await play(h);
    const engine = run(h, 'ARCADE.engine');
    finish(reply({ run: { seed: 111, mode: 'calm', status: 'active', id: 'late' } })); await tick();
    assert.equal(run(h, 'ARCADE.engine'), engine);
  });
  await test('HTTP 503 and a non-JSON server response both allow local play', async () => {
    for (const bad of [{ ok: false, status: 503, json: async () => ({}) }, { ok: true, status: 200, json: async () => { throw Error('HTML error'); } }]) {
      const h = mobileHarness({ fetchImpl: url => url.includes('/api/tournament/') ? Promise.resolve(bad) : undefined });
      await tick(); await submit(h); await play(h);
    }
  });
  await test('Validation errors stay visible and are not silently converted to guest games', async () => {
    const h = mobileHarness({ fetchImpl: url => url.endsWith('/enter') ? Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'Имя отклонено' }) }) : undefined });
    await tick(); await submit(h); assert.equal(run(h, 'ARCADE.engine.status'), 'menu');
    assert.equal(run(h, 'CUP.error'), 'Имя отклонено'); assert.equal(h.c.CITADEL_LAUNCH.status().local, false);
  });
  await test('Local resume after reload retains actual progress and resumes paused', async () => {
    const h = mobileHarness({ fetchImpl: down }); await tick(); await click(h, 'launch-local'); await play(h);
    for (let i=2; i<=61; i++) run(h, `arcadeFrame(${i*17})`);
    h.intervals.find(x => x.delay === 5000).fn();
    const saved = JSON.parse(h.storage.get('cmpon.citadel.local.v1')).snapshot.engine;
    const restored = mobileHarness({ storage: [...h.storage], fetchImpl: down }); await tick(); await click(restored, 'launch-local');
    assert.equal(run(restored, 'ARCADE.engine.status'), 'paused');
    for (const field of ['seed','elapsed','shots','score']) assert.equal(run(restored, `ARCADE.engine.${field}`), saved[field]);
    await play(restored);
  });
  await test('Changing to local play preserves unsent ranked outbox and identity byte for byte', async () => {
    let offline = false;
    const h = mobileHarness({ fetchImpl: url => offline ? down(url) : undefined }); await tick(); await submit(h); await play(h);
    offline = true; await click(h, 'arcade-menu'); await tick();
    const outbox = h.storage.get('cmpon.cup.outbox.v1'), identity = h.storage.get('cmpon.cup.session.v1');
    assert(JSON.parse(outbox).queue.length > 0);
    await click(h, 'launch-local'); await play(h); h.intervals.find(x => x.delay === 5000).fn();
    assert.equal(h.storage.get('cmpon.cup.outbox.v1'), outbox); assert.equal(h.storage.get('cmpon.cup.session.v1'), identity);
    const sends = h.fetchCalls.filter(x => x.endpoint === 'save').length;
    run(h, 'cupEnqueue();'); await run(h, 'cupFlush()'); assert.equal(h.fetchCalls.filter(x => x.endpoint === 'save').length, sends);
    offline = false; await click(h, 'arcade-menu'); await click(h, 'cup-play'); await tick();
    assert.equal(h.c.CITADEL_LAUNCH.status().local, false); assert.equal(run(h, 'CUP.attached'), true);
    assert.equal(JSON.parse(h.storage.get('cmpon.cup.outbox.v1')).queue.length, 0);
  });
  await test('Storage denied: local play still starts and reports memory-only progress', async () => {
    const h = mobileHarness({ deniedStorage: true, noAudio: true, fetchImpl: down }); await tick(); await click(h, 'launch-local'); await play(h);
    assert.equal(h.c.CITADEL_LAUNCH.status().storage, 'memory');
  });
  await test('Unreadable local save is retained separately before creating a fresh game', async () => {
    const h = mobileHarness({ storage: [['cmpon.citadel.local.v1','broken-json']], fetchImpl: down }); await tick(); await click(h, 'launch-new'); await play(h);
    assert.equal(h.storage.get('cmpon.citadel.local.v1.unreadable'), 'broken-json');
  });
  await test('Repeated module installation does not add timers, handlers or wrappers', async () => {
    const h = mobileHarness(); await tick();
    const before = { timers: h.intervals.length, handlers: [...h.handlers.values()].reduce((n,x)=>n+x.length,0), api: run(h, 'cupAPI') };
    h.c.CITADEL_LAUNCH_INSTALL(); h.c.CITADEL_LAUNCH_INSTALL();
    assert.equal(h.intervals.length, before.timers); assert.equal([...h.handlers.values()].reduce((n,x)=>n+x.length,0), before.handlers); assert.equal(run(h,'cupAPI'),before.api);
  });
  await test('Diagnostics are bounded and contain neither server messages nor identity', async () => {
    const h = mobileHarness({ fetchImpl: down }); await tick();
    for(let i=0;i<40;i++) await run(h, 'cupAPI("config").catch(()=>{})');
    const status = h.c.CITADEL_LAUNCH.status(); assert.equal(status.events.length,32);
    assert(!JSON.stringify(status).includes('Failed to fetch'));
    assert(status.events.every(x => Object.keys(x).join(',') === 'event,endpoint,status'));
  });
  await test('Captain extraction preserves PNG bytes and all other core logic', async () => {
    const old = fs.readFileSync('assets/atlas-v1.3.5.js','utf8'), current = fs.readFileSync('assets/atlas-v1.3.6.js','utf8');
    const match = old.match(/const CITADEL_CAPTAIN_SHEET='data:image\/png;base64,([^']+)';/);
    assert.deepEqual(fs.readFileSync('assets/citadel-captain-sheet-v2.3.1.png'),Buffer.from(match[1],'base64'));
    assert.equal(current.replace("const CITADEL_CAPTAIN_SHEET='./assets/citadel-captain-sheet-v2.3.1.png';",match[0]).replace("if(typeof globalThis.CITADEL_LAUNCH_INSTALL==='function')globalThis.CITADEL_LAUNCH_INSTALL();\n",''),old);
  });
  const report = { method: 'Production scripts in Node VM with native Canvas and isolated HTTP/DOM/storage/audio. No physical Android device.', passed: results.filter(x=>x.passed).length, total: results.length, results };
  fs.writeFileSync('tests/qa-2.3.1/launch.json',JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
  if(results.some(x=>!x.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
