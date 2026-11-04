'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/citadel-music-v1.4.2.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'assets/atlas-v1.3.6.js'), 'utf8');

function fixture({ enabled = true, contextState = 'suspended', noContext = false, neverResumes = false } = {}) {
  let gesture = false, unlockCalls = 0, resumeCalls = 0, trackStarts = 0;
  const saved = [], timers = new Map(), pending = [], listeners = new Map(), buttons = new Map();
  for (const id of ['arcade-music', 'space-music-toggle', 'mobile-music']) {
    buttons.set(id, { id, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  }
  const node = () => ({ gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 },
    delayTime: { value: 0 }, disconnect() {} });
  const ctx = { state: contextState, currentTime: 0, resume() {
    resumeCalls++;
    assert(gesture, 'AudioContext.resume must run synchronously during the user click');
    return new Promise(resolve => pending.push(() => { this.state = 'running'; resolve(); }));
  } };
  const document = { hidden: false, activeElement: null,
    head: { appendChild() {} }, createElement() { return {}; },
    querySelector() { return null; }, getElementById: id => buttons.get(id),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {}
  };
  const context = {
    document, ARCADE: { engine: { status: 'menu', phase: 'orbit' }, sound: true, audio: noContext ? null : ctx },
    STATE: { view: 'arcade' },
    SPACE_AUDIO: { music: enabled, ready: !noContext, volume: .24, next: 10, step: 0, track: null, theme: '' },
    SPACE_THEMES: { port: { name: 'Port', root: 48, chords: [0], motif: [12] } },
    spaceAudioScene: () => 'port',
    spaceAudioTrack(key) {
      trackStarts++;
      const track = { key, gain: node(), nodes: Array.from({ length: 5 }, node) };
      context.SPACE_AUDIO.track = track;
      return track;
    },
    spaceAudioRetire(track) { if (track) track.retired = true; },
    spaceAudioGain() {}, spaceAudioSync() {}, spaceAudioStop() {},
    spaceAudioSave() { saved.push(context.SPACE_AUDIO.music); },
    spaceAudioInit() { context.SPACE_AUDIO.ready = true; },
    AudioContext: function () { unlockCalls++; assert(gesture, 'Audio context creation needs a user click'); return ctx; },
    setTimeout(fn, delay) { const id = timers.size + 1; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener() {}, removeEventListener() {}
  };
  vm.createContext(context);
  // Exercise the production core's unlock/action/control integration, not a copy.
  for (const name of ['arcadeAudio', 'spaceAudioUnlock', 'spaceAudioControls', 'spaceAudioAction']) {
    const match = core.match(new RegExp('^function ' + name + '\\([^\\n]+$', 'm'));
    assert(match, 'Missing production core function ' + name);
    vm.runInContext(match[0], context);
  }
  vm.runInContext(source, context);
  function click(fn = () => context.citadelMusic.toggle()) {
    gesture = true;
    let result;
    try { result = fn(); } finally { gesture = false; }
    if (!neverResumes) while (pending.length) pending.shift()();
    return result;
  }
  return { context, ctx, buttons, saved, timers, listeners, click,
    api: context.citadelMusic, pending,
    get resumeCalls() { return resumeCalls; }, get unlockCalls() { return unlockCalls; },
    get trackStarts() { return trackStarts; }
  };
}

const cases = [
  ['first tap starts a saved-on but suspended soundtrack', async () => {
    const h = fixture();
    assert.equal(h.buttons.get('arcade-music').attrs['aria-label'], 'Включить музыку');
    assert.equal(h.buttons.get('arcade-music').attrs['aria-pressed'], 'false');
    const answer = await h.click();
    assert(answer.ok); assert.equal(h.ctx.state, 'running'); assert(h.resumeCalls > 0);
    assert.equal(h.api.status().enabled, true); assert.equal(h.api.status().playing, true);
    assert.equal(h.buttons.get('arcade-music').attrs['aria-pressed'], 'true');
    assert.equal(h.saved.at(-1), true);
  }],
  ['first tap creates the context inside the click when none exists', async () => {
    const h = fixture({ noContext: true });
    assert.equal(h.unlockCalls, 0);
    assert((await h.click()).ok); assert.equal(h.unlockCalls, 1);
    assert.equal(h.api.status().playing, true);
  }],
  ['interrupted mobile context is explicitly resumed', async () => {
    const h = fixture({ contextState: 'interrupted' });
    assert((await h.click()).ok); assert.equal(h.resumeCalls, 1);
    assert.equal(h.api.status().playing, true);
  }],
  ['turning music off persists and never unlocks it again', async () => {
    const h = fixture(); await h.click();
    const before = h.resumeCalls;
    assert((await h.click()).ok);
    assert.equal(h.api.status().enabled, false); assert.equal(h.api.status().playing, false);
    assert.equal(h.saved.at(-1), false); assert.equal(h.resumeCalls, before);
    await h.api.resumeAuto();
    assert.equal(h.api.status().enabled, false); assert.equal(h.resumeCalls, before);
  }],
  ['a muted preference remains muted until an explicit music action', async () => {
    const h = fixture({ enabled: false, noContext: true });
    await h.api.resumeAuto();
    assert.equal(h.unlockCalls, 0); assert.equal(h.resumeCalls, 0); assert.equal(h.api.status().enabled, false);
    assert((await h.click()).ok); assert.equal(h.api.status().playing, true);
  }],
  ['a blocked resume returns after the deadline and leaves a retry control', async () => {
    const h = fixture({ neverResumes: true });
    const operation = h.click();
    const deadline = [...h.timers.values()].find(t => t.delay === 900);
    assert(deadline); deadline.fn();
    const answer = await operation;
    assert.equal(answer.ok, false); assert.equal(answer.reason, 'audio-suspended');
    assert.equal(h.buttons.get('arcade-music').attrs['aria-label'], 'Включить музыку');
    assert.equal(h.trackStarts, 0);
  }],
  ['a pending start cannot override a subsequent stop', async () => {
    const h = fixture({ neverResumes: true });
    const operation = h.click(); h.api.stop();
    while (h.pending.length) h.pending.shift()();
    const answer = await operation;
    assert.equal(answer.reason, 'superseded'); assert.equal(h.api.status().enabled, false);
    assert.equal(h.trackStarts, 0);
  }],
  ['the existing game action reaches the new toggle', async () => {
    const h = fixture();
    assert.equal(h.click(() => h.context.spaceAudioAction('arcade-music')), true);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.equal(h.api.status().playing, true);
    assert.equal(h.saved.at(-1), true);
  }]
];
(async () => {
  for (const [name, run] of cases) { await run(); console.log('PASS ' + name); }
  console.log('PASS 8 music activation regressions');
})().catch(error => { console.error(error); process.exitCode = 1; });
