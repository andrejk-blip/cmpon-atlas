import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife, reduceLife, validateLife} from '../src/life/engine.js';

const LIFE_KEY = 'perepiska.life.v2';
const LEGACY_KEY = 'perepiska.save.v1';
let instance = 0;
async function adapter() {
  return (await import(`../src/life/platform.js?life-storage-test=${++instance}`)).platform;
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
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
}
function apply(state, ...actions) {
  return actions.reduce((current, action) => {
    const next = reduceLife(current, action);
    assert.equal(next.events.length, current.events.length + 1, `test preparation must accept ${action.type}`);
    return next;
  }, state);
}

test('life v2 writes and preferences leave the existing courtyard v1 save untouched', async t => {
  const legacy = '{ "version": 1, "campaignId": "sample", "progress": "keep exactly" }';
  const storage = storageStub({[LEGACY_KEY]: legacy});
  installStorage(t, storage);
  const platform = await adapter();
  assert.equal(platform.load(), null, 'a legacy save is not mistaken for the new episode');
  const life = apply(createLife(), {type: 'WAKE'});
  assert.equal(platform.save(life), true);
  platform.setPreferences({reducedMotion: true});
  assert.equal(storage.getItem(LEGACY_KEY), legacy);
  assert.equal(JSON.parse(storage.getItem(LIFE_KEY)).version, 2);
  assert.deepEqual(platform.preferences(), {reducedMotion: true});
  assert.ok(validateLife(platform.load()));
});

test('an independent stale life tab cannot overwrite a newer first-day history', async t => {
  const initial = createLife();
  const storage = storageStub({[LIFE_KEY]: JSON.stringify(initial)});
  installStorage(t, storage);
  const olderTab = await adapter(), newerTab = await adapter();
  assert.deepEqual(olderTab.load(), initial);
  assert.deepEqual(newerTab.load(), initial);
  const progressed = apply(initial,
    {type: 'WAKE'}, {type: 'ARRIVE', spotId: 'kitchen'}, {type: 'BREAKFAST'});
  assert.equal(newerTab.save(progressed), true);
  assert.equal(olderTab.save(initial), false);
  assert.equal(olderTab.lastSaveError, 'conflict');
  assert.deepEqual(JSON.parse(storage.getItem(LIFE_KEY)), progressed);
  assert.equal(olderTab.save(initial), false, 'retrying must not acknowledge a conflict');
  const recovered = validateLife(olderTab.load());
  assert.ok(recovered);
  assert.equal(recovered.flags.breakfast, true);
  assert.equal(recovered.events.length, progressed.events.length);
});

test('purchases, chosen outfit, and chat decisions survive a valid v2 save/load roundtrip', async t => {
  const storage = storageStub();
  installStorage(t, storage);
  const writer = await adapter();
  writer.load();
  const life = apply(createLife(),
    {type: 'WAKE', snooze: true},
    {type: 'ARRIVE', spotId: 'wardrobe'},
    {type: 'OUTFIT', outfitId: 'coral'},
    {type: 'BUY', itemId: 'plant'},
    {type: 'READ_CHAT', channelId: 'max'},
    {type: 'CHAT', channelId: 'max', choiceId: 'accept'});
  assert.equal(writer.save(life), true);
  const reader = await adapter();
  const restored = validateLife(reader.load());
  assert.ok(restored);
  assert.deepEqual(restored, {...life, notice: ''});
  assert.equal(restored.outfit, 'coral');
  assert.deepEqual(restored.homeItems, ['plant']);
  assert.equal(restored.date.status, 'accepted');
  assert.equal(restored.coins, life.coins);
});
