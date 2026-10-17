#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const file = path.resolve(__dirname, '../assets/citadel-startup-v1.7.1.js');
const source = fs.readFileSync(file, 'utf8');
function surface(properties = {}) {
  const handlers = new Map();
  return Object.assign({
    addEventListener(type, fn, capture) { const list = handlers.get(type) || []; list.push({ fn, capture }); handlers.set(type, list); },
    removeEventListener(type, fn, capture) { handlers.set(type, (handlers.get(type) || []).filter(item => item.fn !== fn || item.capture !== capture)); },
    dispatch(type, event = {}) { for (const item of (handlers.get(type) || []).slice()) item.fn(event); },
    count(type) { return (handlers.get(type) || []).length; },
    handlers,
  }, properties);
}
function harness({ nodes = true, readyState = 'interactive' } = {}) {
  const elements = {
    'citadel-startup': surface({ hidden: false }),
    'citadel-startup-message': surface({ textContent: 'Загружаем Цитадель…' }),
    'citadel-startup-retry': surface({ hidden: true }),
  };
  let reloads = 0, network = 0, storage = 0;
  const document = surface({ readyState, getElementById(id) { return nodes ? elements[id] || null : null; } });
  const context = surface({ document, location: { reload() { reloads++; } },
    fetch() { network++; }, localStorage: { getItem() { storage++; }, setItem() { storage++; } },
    console: { log() { throw new Error('Startup must not log raw errors'); }, error() { throw new Error('Startup must not log raw errors'); } },
    Map: undefined, Set: undefined, Promise: undefined, WeakMap: undefined,
  });
  context.window = context; vm.createContext(context);
  vm.runInContext(source, context, { filename: path.basename(file) });
  return { context, document, elements, ready() { document.readyState = 'complete'; document.dispatch('DOMContentLoaded'); },
    counts() { return { reloads, network, storage }; } };
}
const groups = [];
function check(name, fn) { fn(); groups.push({ name, passed: true }); }
check('Deferred large-core loading retains the static notice until DOMContentLoaded', () => {
  const h = harness(), e = h.elements;
  assert.equal(h.context.CITADEL_STARTUP.version, '1.7.1');
  assert.equal(e['citadel-startup'].hidden, false); assert.equal(e['citadel-startup-message'].textContent, 'Загружаем Цитадель…');
  assert.equal(e['citadel-startup-retry'].hidden, true); assert.equal(h.context.count('error'), 1);
  assert.equal(h.context.handlers.get('error')[0].capture, true);
  vm.runInContext(source, h.context); assert.equal(h.context.count('error'), 1, 'duplicate bootstrap must not duplicate handlers');
});
check('Successful startup hides the notice and removes all bootstrap handlers', () => {
  const h = harness(); h.ready(); assert.equal(h.elements['citadel-startup'].hidden, true);
  assert.equal(h.context.count('error'), 0); assert.equal(h.document.count('DOMContentLoaded'), 0); assert.equal(h.elements['citadel-startup-retry'].count('click'), 0);
});
check('Our script resource errors reveal a fixed retry message', () => {
  for (const name of ['atlas-v1.3.5.js', 'citadel-compat-v1.7.1.js', 'game-test-v1.4.1.js']) {
    const h = harness(); h.context.dispatch('error', { target: { tagName: 'SCRIPT', src: 'https://example.invalid/assets/' + name + '?version=1' } });
    assert.equal(h.elements['citadel-startup'].hidden, false); assert.equal(h.elements['citadel-startup-retry'].hidden, false);
    assert.equal(h.elements['citadel-startup-message'].textContent, 'Не удалось загрузить игру. Повторите попытку.');
    h.ready(); assert.equal(h.elements['citadel-startup'].hidden, false); assert.equal(h.context.count('error'), 0);
    h.elements['citadel-startup-retry'].dispatch('click'); assert.deepEqual(h.counts(), { reloads: 1, network: 0, storage: 0 });
  }
});
check('Uncaught core syntax/runtime errors are reported without exposing raw details', () => {
  for (const name of ['atlas-v1.3.5.js', 'citadel-aim-v1.7.1.js', 'game-test-v1.4.1.js']) {
    const h = harness(); h.context.dispatch('error', { filename: '/assets/' + name, message: 'SECRET_RAW_STACK_OR_TOKEN', error: new SyntaxError('SECRET_RAW_STACK_OR_TOKEN') });
    assert.equal(h.elements['citadel-startup-retry'].hidden, false); assert(!h.elements['citadel-startup-message'].textContent.includes('SECRET'));
    assert.deepEqual(h.counts(), { reloads: 0, network: 0, storage: 0 });
  }
});
check('Images, unrelated scripts and unnamed cross-origin errors are ignored', () => {
  const h = harness();
  h.context.dispatch('error', { target: { tagName: 'IMG', src: '/assets/citadel-thumbnail.js' }, filename: '/assets/atlas-v1.3.5.js' });
  h.context.dispatch('error', { target: { tagName: 'SCRIPT', src: '/vendor/analytics.js' } });
  h.context.dispatch('error', { filename: '/vendor/unrelated.js', message: 'unrelated' });
  h.context.dispatch('error', { message: 'Script error.' });
  assert.equal(h.elements['citadel-startup-retry'].hidden, true); h.ready(); assert.equal(h.elements['citadel-startup'].hidden, true);
});
check('Gameplay errors after readiness cannot resurrect the startup banner', () => {
  const h = harness(); h.ready(); h.context.dispatch('error', { filename: '/assets/atlas-v1.3.5.js' });
  assert.equal(h.elements['citadel-startup'].hidden, true); assert.equal(h.elements['citadel-startup-retry'].hidden, true);
});
check('Missing notice elements are safe on success and failure', () => {
  for (const fail of [false, true]) { const h = harness({ nodes: false }); if (fail) h.context.dispatch('error', { filename: '/assets/atlas-v1.3.5.js' }); h.ready(); assert.equal(h.context.count('error'), 0); }
});
check('A late bootstrap on an already-complete document cleans up immediately', () => {
  const h = harness({ readyState: 'complete' }); assert.equal(h.elements['citadel-startup'].hidden, true); assert.equal(h.context.count('error'), 0);
});
console.log(JSON.stringify({ version: '1.7.1', method: 'ES5 bootstrap executed with scripted DOM/window events and no modern collection APIs',
  source_sha256: crypto.createHash('sha256').update(source).digest('hex'), passed: groups.length, groups }, null, 2));
