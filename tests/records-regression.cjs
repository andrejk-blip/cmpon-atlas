#!/usr/bin/env node
'use strict';

// Exercise the production tournament core and records module with controllable
// network promises. No live API, registration, scores, or storage is modified.
//   node tests/records-regression.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHarness } = require('./mrg-regression.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const harness = createHarness(path.join(root, 'assets/atlas-v1.3.5.js'), null, null);
  const { context, nodes } = harness;
  const timers = [], requests = [];
  let focused = true;
  context.location = { protocol: 'https:', hash: '#arcade' };
  context.setInterval = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  context.document.hasFocus = () => focused;
  context.recordsTestAPI = url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
  vm.runInContext(`
    cupAPI = (...args) => recordsTestAPI(...args);
    globalThis.recordsQA = { cup: CUP, state: STATE, board: () => cupBoardHTML(),
      panel: () => cupPanelHTML(), lobby: () => cupLobbyHTML(), refresh: () => cupRefreshBoard() };
  `, context);
  const qa = context.recordsQA, cup = qa.cup;
  const board = context.document.getElementById('cup-board');
  const filter = context.document.getElementById('cup-level');
  const retry = { id: 'retry', parent: board };
  let html = '', writes = 0;
  Object.defineProperty(board, 'innerHTML', {
    get: () => html,
    set(value) { html = value; writes++; this.scrollTop = 0; this.scrollLeft = 0; },
  });
  board.contains = node => node === board || node?.parent === board;
  board.scrollTop = 126;
  board.scrollLeft = 22;
  context.document.activeElement = filter;
  cup.config = { cups: [{ id: 'past', state: 'finished', title: 'Прошлый турнир' }] };
  cup.selected = '';
  cup.mode = 'calm';
  cup.board = -1;
  cup.player = { id: 'self', name: 'Я' };
  cup.rows = [];
  cup.panel = 'records';
  qa.state.view = 'arcade';
  const source = fs.readFileSync(path.join(root, 'assets/citadel-records-v1.1.1.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'citadel-records-v1.1.1.js' });
  vm.runInContext(source, context); // Duplicate script inclusion must be harmless.
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 10000);
  assert.match(qa.board(), /После регистрации игрок появится здесь с 0 очков/);
  assert.match(qa.lobby(), /После регистрации вы появитесь в таблице с 0 очков/);
  assert.match(qa.panel(), /Все зарегистрированные игроки/);
  cup.selected = 'past';
  assert.match(qa.board(), /нет зафиксированных результатов/);
  assert.doesNotMatch(qa.board(), /После регистрации/);
  assert.match(qa.panel(), /Итоги турнира зафиксированы/);
  cup.selected = '';

  const zero = { player_id: 'self', name: '<img src=x onerror=alert(1)>', rank: 1,
    progress: 0, score: 0, duration: 0, has_result: false };
  cup.rows = [zero];
  assert.match(qa.board(), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(qa.board(), /<img/);
  assert.match(qa.board(), /<td>0\/14<\/td><td>0<\/td><td><span[^>]*>—<\/span>/);
  assert.match(qa.board(), /cup-you/);
  cup.rows = [{ ...zero, has_result: undefined }];
  assert.match(qa.board(), /<td>0:00<\/td>/, 'Legacy zero results keep their recorded time');
  cup.rows = [{ ...zero, score: '<script>', rank: '<script>', progress: '<script>' }];
  assert.doesNotMatch(qa.board(), /<script>/);
  cup.board = 3;
  assert.match(qa.board(), /<td>—<\/td><td>0<\/td>/, 'No completed stage is invented');
  cup.board = -1;
  cup.rows = [zero];

  const tick = () => timers[0].callback();
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  cup.panel = null; tick();
  cup.panel = 'records'; context.document.hidden = true; tick();
  context.document.hidden = false; focused = false; tick();
  focused = true; qa.state.view = 'map'; tick();
  assert.equal(requests.length, 0, 'Only an open records panel in an active visible page polls');
  qa.state.view = 'arcade';
  tick();
  assert.equal(requests.length, 1);
  const first = qa.refresh();
  assert.equal(qa.refresh(), first, 'Same-filter requests share the pending request');
  tick(); tick();
  assert.equal(requests.length, 1, 'Slow responses do not create duplicate background requests');

  // The foreground may change filters while a previous request is pending.
  cup.mode = 'normal';
  const second = qa.refresh();
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /mode=normal$/);
  requests[1].resolve({ rows: [{ ...zero, name: 'Боевой игрок' }] });
  await second;
  assert.equal(board.scrollTop, 126);
  assert.equal(board.scrollLeft, 22);
  assert.equal(context.document.activeElement, filter, 'Background rendering preserves filter focus');
  assert.match(html, /Боевой игрок/);
  tick();
  assert.equal(requests.length, 2, 'A superseded request still blocks timer overlap until it settles');
  requests[0].resolve({ rows: [{ ...zero, name: 'Устаревший ответ' }] });
  await first;
  assert.equal(cup.rows[0].name, 'Боевой игрок');
  assert.doesNotMatch(html, /Устаревший ответ/, 'boardSerial prevents stale overwrite');

  // Changing A -> B -> A must request A again instead of reusing its stale serial.
  cup.mode = 'calm'; const a1 = qa.refresh();
  cup.mode = 'normal'; const b = qa.refresh();
  cup.mode = 'calm'; const a2 = qa.refresh();
  assert.equal(requests.length, 5);
  requests[4].resolve({ rows: [{ ...zero, name: 'Актуальный ответ' }] });
  await a2;
  requests[2].resolve({ rows: [{ ...zero, name: 'Старый A' }] });
  requests[3].resolve({ rows: [{ ...zero, name: 'Старый B' }] });
  await Promise.all([a1, b]);
  assert.equal(cup.rows[0].name, 'Актуальный ответ');

  const beforeFailure = html;
  tick();
  requests[5].reject(new Error('Нет связи'));
  await settle();
  assert.equal(html, beforeFailure, 'Background failure preserves the existing table and scroll');
  assert.equal(board.scrollTop, 126);
  assert.match(nodes.get('cup-records-refresh-status').textContent, /Повторим автоматически/);
  context.document.activeElement = retry;
  const beforeFocused = writes;
  tick();
  requests[6].resolve({ rows: [{ ...zero, name: 'Новый участник' }] });
  await settle();
  assert.equal(writes, beforeFocused, 'A focused table descendant is not removed by a timer');
  assert.equal(context.document.activeElement, retry);
  context.document.activeElement = board;
  tick();
  requests[7].resolve({ rows: [{ ...zero, name: 'Новый участник' }] });
  await settle();
  assert.match(html, /Новый участник/);
  assert.equal(context.document.activeElement, board);
  assert.equal(board.scrollTop, 126);
  assert.equal(board.scrollLeft, 22);

  // Manual initial failure still has a visible retry path.
  cup.rows = null;
  const failed = qa.refresh();
  requests[8].reject(new Error('Сервер недоступен'));
  await failed;
  assert.match(qa.board(), /Сервер недоступен/);
  assert.match(qa.board(), /cup-refresh-board/);
  assert.equal(vm.runInContext('CUP_GAME_VERSION', context), '1.3.0');
  console.log('PASS records-regression: zero and legacy rows, safe rendering, visible polling, request races, focus and scroll.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
