import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'perepiska.save.v1';
let instance = 0;
async function adapter() {
  return (await import(`../src/platform.js?test-instance=${++instance}`)).platform;
}
function storageStub(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
function installStorage(t, storage) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
}

test('a stale desktop adapter cannot overwrite progress saved by another tab', async t => {
  const initial = { version: 1, progress: 1 };
  const storage = storageStub({ [KEY]: JSON.stringify(initial) });
  installStorage(t, storage);
  const desktop = await adapter();
  const mobile = await adapter();
  assert.deepEqual(desktop.load(), initial);
  assert.deepEqual(mobile.load(), initial);
  assert.equal(mobile.save({ version: 1, progress: 2 }), true);
  assert.equal(desktop.save({ version: 1, progress: 1 }), false);
  assert.equal(desktop.lastSaveError, 'conflict');
  assert.equal(JSON.parse(storage.getItem(KEY)).progress, 2);
  assert.equal(desktop.save({ version: 1, progress: 1 }), false, 'a retry must not silently acknowledge a conflict');
  assert.deepEqual(desktop.load(), { version: 1, progress: 2 });
  assert.equal(desktop.lastSaveError, null);
  assert.equal(desktop.save({ version: 1, progress: 3 }), true);
  assert.equal(mobile.save({ version: 1, progress: 2 }), false);
});

test('successful writes advance the snapshot and support unchanged v1 payloads', async t => {
  const storage = storageStub();
  installStorage(t, storage);
  const platform = await adapter();
  assert.equal(platform.load(), null);
  assert.equal(platform.save({ version: 1, progress: 1 }), true);
  assert.equal(platform.save({ version: 1, progress: 2 }), true);
  assert.equal(platform.lastSaveError, null);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), { version: 1, progress: 2 });
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(KEY))), ['version', 'progress'], 'no envelope or schema change');
});

test('comparison uses the exact serialized snapshot, including an external deletion', async t => {
  const storage = storageStub({ [KEY]: '{ "version": 1, "progress": 1 }' });
  installStorage(t, storage);
  const platform = await adapter();
  assert.equal(platform.load().progress, 1);
  storage.setItem(KEY, '{"version":1,"progress":1}');
  assert.equal(platform.save({ version: 1, progress: 2 }), false);
  assert.equal(platform.lastSaveError, 'conflict');
  platform.load();
  storage.removeItem(KEY);
  assert.equal(platform.save({ version: 1, progress: 2 }), false);
  assert.equal(storage.getItem(KEY), null);
});

test('explicit import/reset can acknowledge the latest snapshot before replacing it', async t => {
  const storage = storageStub({ [KEY]: JSON.stringify({ version: 1, progress: 1 }) });
  installStorage(t, storage);
  const platform = await adapter();
  platform.load();
  storage.setItem(KEY, JSON.stringify({ version: 1, progress: 9 }));
  assert.equal(platform.save({ version: 1, progress: 0 }), false);
  assert.equal(platform.acceptCurrentSave(), true);
  assert.equal(platform.lastSaveError, null);
  assert.equal(platform.save({ version: 1, progress: 0 }), true);
  assert.equal(JSON.parse(storage.getItem(KEY)).progress, 0);
});

test('storage failures are distinct from conflicts and do not advance the snapshot', async t => {
  const storage = storageStub();
  installStorage(t, storage);
  const platform = await adapter();
  platform.load();
  const setItem = storage.setItem;
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(platform.save({ version: 1, progress: 1 }), false);
  assert.equal(platform.lastSaveError, 'storage');
  storage.setItem = setItem;
  assert.equal(platform.save({ version: 1, progress: 1 }), true);
  assert.equal(platform.lastSaveError, null);
  storage.getItem = () => { throw new Error('unavailable'); };
  assert.equal(platform.save({ version: 1, progress: 2 }), false);
  assert.equal(platform.lastSaveError, 'storage');
  assert.equal(platform.acceptCurrentSave(), false);
});

test('a fresh adapter cannot overwrite an existing save without loading or explicit acknowledgement', async t => {
  const storage = storageStub({ [KEY]: JSON.stringify({ version: 1, progress: 9 }) });
  installStorage(t, storage);
  const platform = await adapter();
  assert.equal(platform.save({ version: 1, progress: 0 }), false);
  assert.equal(platform.lastSaveError, 'conflict');
  assert.equal(JSON.parse(storage.getItem(KEY)).progress, 9);
});
