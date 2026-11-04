'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/citadel-recorder-v2.15.0.js'), 'utf8');

function fixture({ supported = true, store = new Map(), storageFails = false } = {}) {
  const ids = new Map(), listeners = new Map(), intervals = new Map(), pending = [];
  const opened = [], posted = [], revoked = [], tracks = [];
  let now = 0, serial = 0, pauses = 0;
  class Node {
    constructor(tag) { this.tagName = tag; this.dataset = {}; this.attrs = {}; this.children = []; this.hidden = false; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      this.html = value; this.children = [];
      for (const match of value.matchAll(/<(\w+)\b([^>]*)>/g)) {
        const child = new Node(match[1]), id = /\bid="([^"]+)"/.exec(match[2]);
        if (id) child.id = id[1];
        child.hidden = /\bhidden\b/.test(match[2]);
        this.children.push(child);
      }
    }
    get innerHTML() { return this.html || ''; }
    appendChild(node) { node.parentElement = this; this.children.push(node); }
    querySelector(selector) { return this.children.find(n => selector[0] === '#' ? n.id === selector.slice(1) : n.tagName === selector) || null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    getContext() { return { fillRect() {}, drawImage() {}, fillText() {} }; }
    captureStream() {
      const track = { stopped: false, stop() { this.stopped = true; } };
      tracks.push(track);
      return { getTracks: () => [track], addTrack() {} };
    }
  }
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(stream, options) { this.state = 'inactive'; this.mimeType = options.mimeType; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['game frames'], { type: this.mimeType }) });
      this.onstop();
    }
  }
  const body = new Node('body'), field = new Node('div'), canvas = new Node('canvas');
  canvas.width = 1200; canvas.height = 800; field.appendChild(canvas); body.appendChild(field);
  const document = { body, getElementById: id => ids.get(id), createElement: tag => new Node(tag) };
  const indexedDB = { open() {
    if (storageFails) throw new Error('Storage unavailable');
    const request = {};
    const db = {
      createObjectStore() {}, close() {},
      transaction() {
        const tx = { objectStore() { return {
          put(value, key) { store.set(key, { ...value }); pending.push(() => tx.oncomplete?.()); },
          get(key) { const get = {}; pending.push(() => { get.result = store.get(key); get.onsuccess?.(); tx.oncomplete?.(); }); return get; }
        }; } };
        return tx;
      }
    };
    pending.push(() => { request.result = db; request.onsuccess?.(); });
    return request;
  } };
  const context = {
    document, Blob, indexedDB, performance: { now: () => now },
    crypto: { randomUUID: () => 'clip-' + (++serial) },
    URL: { createObjectURL: () => 'blob:local-' + (++serial), revokeObjectURL: value => revoked.push(value) },
    HTMLCanvasElement: Node,
    ARCADE: { canvas, engine: { phase: 'battle', stage: 1, status: 'playing', pause() { pauses++; } } },
    CITADEL_RELEASE: { version: '2.17.1' },
    clearArcadeInput() {}, updateArcadeHUD() {}, arcadeInput: () => ({ fire: true }),
    setInterval(fn) { const id = ++serial; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    window: { open(...args) { opened.push(args); return { postMessage: (...args) => posted.push(args) }; } },
    fetch() { throw new Error('Recorder must not use the network'); }
  };
  if (supported) context.MediaRecorder = Recorder;
  vm.createContext(context); vm.runInContext(source, context); context.updateArcadeHUD();
  const flush = () => { while (pending.length) pending.shift()(); };
  flush();
  return { context, ids, listeners, store, opened, posted, revoked, tracks, intervals, flush,
    api: context.CITADEL_RECORDER,
    get dialog() { return body.children.find(n => n.tagName === 'dialog'); },
    get pauses() { return pauses; },
    advance(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); }
  };
}

function localOnly(h) {
  assert.equal(h.opened.length, 0, 'No external page may open');
  assert.equal(h.posted.length, 0, 'No clip may leave the page');
  assert.equal(h.listeners.has('message'), false, 'No cross-window upload listener');
  assert(!/админ|admin|record-send2150|record-note2150/i.test(h.dialog?.innerHTML || ''));
}

const cases = [
  ['manual recording stops into local preview and download', () => {
    const h = fixture(), toggle = h.ids.get('record-toggle2150');
    toggle.onclick(); assert.equal(h.api.status().recording, true);
    assert.equal(toggle.attrs['aria-label'], 'Завершить запись эпизода');
    h.advance(2000); toggle.onclick(); h.flush();
    assert.equal(h.api.status().recording, false); assert.equal(h.api.status().hasClip, true);
    assert.equal(h.api.status().saved, true); assert.equal(h.dialog.open, true);
    const download = h.dialog.querySelector('#record-download2150');
    assert.match(download.href, /^blob:local-/); assert.match(download.download, /^citadel-clip-.*\.webm$/);
    assert.equal(h.dialog.querySelector('video').src, download.href);
    assert.equal(h.store.get('latest').metadata.duration, 2);
    assert.equal(h.tracks.every(t => t.stopped), true); assert.equal(h.intervals.size, 0);
    h.dialog.querySelector('#record-close2150').onclick(); assert.equal(h.dialog.open, false);
    h.ids.get('record-last2150').onclick(); assert.equal(h.dialog.open, true);
    localOnly(h);
  }],
  ['automatic 60-second limit also remains local', () => {
    const h = fixture(); h.api.start(); h.advance(60000); h.flush();
    assert.equal(h.api.status().recording, false); assert.equal(h.store.get('latest').metadata.duration, 60);
    assert(h.dialog.querySelector('#record-download2150')); localOnly(h);
  }],
  ['last clip restores after reopening, including an old saved record', () => {
    const store = new Map([['latest', { id: 'old-clip', blob: new Blob(['old frames'], { type: 'video/webm' }), metadata: {}, saved: true }]]);
    const h = fixture({ store }); assert.equal(h.api.status().hasClip, true);
    assert.equal(h.ids.get('record-last2150').hidden, false);
    h.ids.get('record-last2150').onclick();
    assert.equal(h.dialog.querySelector('#record-download2150').download, 'citadel-old-clip.webm'); localOnly(h);
  }],
  ['unavailable local storage does not prevent preview or download', () => {
    const h = fixture({ storageFails: true }); h.api.start(); h.api.stop(true);
    assert.equal(h.api.status().hasClip, true); assert.equal(h.api.status().saved, false);
    assert(h.dialog.querySelector('#record-download2150')); localOnly(h);
  }],
  ['unsupported browser reports the limitation without external navigation', () => {
    const h = fixture({ supported: false }); assert.equal(h.api.supported(), false);
    h.api.start(); assert.equal(h.api.status().recording, false);
    assert.match(h.ids.get('record-status2150').textContent, /не поддерживает запись/);
    assert.equal(h.dialog.querySelector('#record-download2150'), null); localOnly(h);
  }],
  ['replacing a clip revokes the earlier URL without sending either clip', () => {
    const h = fixture(); h.api.start(); h.api.stop(); h.flush();
    const first = h.dialog.querySelector('#record-download2150').href;
    h.api.start(); h.api.stop(); h.flush();
    assert(h.revoked.includes(first)); assert.notEqual(h.dialog.querySelector('#record-download2150').href, first); localOnly(h);
  }]
];

assert(!/админ|admin|\/clips\/receive|postMessage|window\.open/i.test(source), 'Public recorder must not contain a private dashboard entry point');
for (const [name, run] of cases) { run(); console.log('PASS ' + name); }
console.log('PASS 6 recorder privacy regressions');
