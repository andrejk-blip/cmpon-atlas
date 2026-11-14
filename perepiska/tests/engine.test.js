import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, getView, validateSave } from '../src/engine.js';

const act = (state, type, values = {}) => dispatch(state, { type, ...values });
const selected = state => state.tasks.find(task => task.id === state.selectedTaskId);
function waitUntil(state, time) {
  while (state.time < time) state = act(state, 'ADVANCE');
  return state;
}
function answerTask(state, taskId) {
  state = act(state, 'SELECT_TASK', { taskId });
  state = act(state, 'ASSIGN', { taskId, staffId: 'anna' });
  const target = selected(state);
  state = waitUntil(state, Math.max(target.availableFrom, target.appointment || 0));
  state = act(state, 'VISIT', { taskId });
  for (const question of selected(state).questions) state = act(state, 'ASK', { taskId, questionId: question.id });
  return selected(state).kind === 'refusal'
    ? act(state, 'RECORD_REFUSAL', { taskId })
    : act(state, 'SAVE_FORM', { taskId, answers: selected(state).expected });
}
function finishCampaign(state) {
  state = act(state, 'START');
  for (const task of state.tasks) state = answerTask(state, task.id);
  state = act(state, 'SYNC');
  state = act(state, 'CHECK');
  return act(state, 'FINISH');
}

test('commands are pure and refusal materials remain distinct from questionnaires', () => {
  const initial = createGame();
  const before = JSON.stringify(initial);
  let state = answerTask(act(initial, 'START'), 'galina');
  assert.equal(JSON.stringify(initial), before);
  assert.equal(selected(state).status, 'refusal');
  assert.equal(selected(state).answers, null);
  assert.equal(getView(state).summary.accepted, 0);
  assert.equal(getView(state).summary.processed, 0);
  state = act(state, 'CHECK');
  assert.equal(getView(state).summary.processed, 0, 'local results cannot bypass synchronization');
  state = act(state, 'SYNC');
  assert.equal(selected(state).transmission, 'sent');
  state = act(state, 'CHECK');
  assert.equal(getView(state).summary.processed, 1);
  assert.equal(getView(state).summary.accepted, 0);
  assert.equal(getView(state).summary.refusal, 1);
});

test('interview requires an available assigned worker and respects agreed time', () => {
  let state = act(createGame(), 'START');
  state = act(state, 'VISIT', { taskId: 'marina' });
  assert.equal(state.tasks[0].status, 'new');
  state = act(state, 'ASSIGN', { taskId: 'marina', staffId: 'anna' });
  state = act(state, 'APPOINT', { taskId: 'marina', time: 1050 });
  assert.equal(state.tasks[0].appointment, null);
  state = act(state, 'APPOINT', { taskId: 'marina', time: 1110 });
  state = waitUntil(state, 1080);
  state = act(state, 'VISIT', { taskId: 'marina' });
  assert.equal(state.tasks[0].status, 'assigned');
  state = waitUntil(state, 1110);
  state = act(state, 'VISIT', { taskId: 'marina' });
  assert.equal(state.tasks[0].status, 'visiting');
});

test('one worker cannot interview at two addresses simultaneously', () => {
  let state = act(createGame(), 'START');
  state = act(state, 'ASSIGN', { taskId: 'yuri', staffId: 'anna' });
  state = act(state, 'VISIT', { taskId: 'yuri' });
  state = act(state, 'ASSIGN', { taskId: 'galina', staffId: 'anna' });
  state = act(state, 'VISIT', { taskId: 'galina' });
  assert.equal(state.tasks.find(task => task.id === 'galina').status, 'assigned');
  assert.match(state.notice, /другую беседу/);
});

test('answers must follow respondent clarification, not a guessed correct number', () => {
  let state = act(createGame(), 'START');
  state = act(state, 'ASSIGN', { taskId: 'shared', staffId: 'anna' });
  state = waitUntil(state, 1110);
  state = act(state, 'VISIT', { taskId: 'shared' });
  state = act(state, 'SAVE_FORM', { answers: { households: 2, persons: 2 } });
  assert.equal(selected(state).status, 'visiting');
  state = act(state, 'ASK', { questionId: 'who' });
  state = act(state, 'ASK', { questionId: 'budget' });
  state = act(state, 'SAVE_FORM', { answers: { households: 1, persons: 2 } });
  assert.equal(selected(state).status, 'visiting');
  state = act(state, 'SAVE_FORM', { answers: { households: 2, persons: 2 } });
  assert.equal(selected(state).status, 'saved');
});

test('illness and reassignment preserve appointment, clues and complete history', () => {
  let state = answerTask(act(createGame(), 'START'), 'yuri');
  assert.equal(state.staff.find(person => person.id === 'lera').available, false);
  const before = state.tasks.find(task => task.id === 'shared');
  state = act(state, 'VISIT', { taskId: 'shared' });
  assert.match(state.notice, /заболела/);
  state = act(state, 'ASSIGN', { taskId: 'shared', staffId: 'sonya' });
  const after = state.tasks.find(task => task.id === 'shared');
  assert.equal(after.appointment, before.appointment);
  assert.deepEqual(after.clues, before.clues);
  assert.deepEqual(after.history.slice(0, before.history.length), before.history);
  assert.equal(after.assignedTo, 'sonya');
});

test('full census produces four household responses and one separate refusal outcome', () => {
  const state = finishCampaign(createGame());
  assert.equal(state.phase, 'summary');
  assert.deepEqual(getView(state).summary, {
    total: 4, accepted: 3, saved: 0, sent: 0, refusal: 1, contacted: 4,
    processed: 4, households: 4, persons: 6, complete: true,
  });
  assert.deepEqual(state.completedCampaigns, ['courtyard']);
});

test('partially completed interviews survive handoff when a worker falls ill', () => {
  let state = act(createGame(), 'START');
  state = waitUntil(state, 1110);
  state = act(state, 'VISIT', { taskId: 'shared' });
  state = act(state, 'ASK', { questionId: 'who' });
  state = answerTask(state, 'yuri');
  const original = state.tasks.find(task => task.id === 'shared');
  state = act(state, 'SELECT_TASK', { taskId: 'shared' });
  state = act(state, 'ASK', { questionId: 'budget' });
  assert.deepEqual(selected(state).clues, ['who']);
  state = act(state, 'ASSIGN', { staffId: 'sonya' });
  assert.equal(selected(state).appointment, original.appointment);
  assert.deepEqual(selected(state).clues, ['who']);
  assert.deepEqual(selected(state).history.slice(0, original.history.length), original.history);
  state = act(state, 'ASK', { questionId: 'budget' });
  state = act(state, 'SAVE_FORM', { answers: { households: 2, persons: 2 } });
  assert.equal(selected(state).status, 'saved');
});

test('sample unlocks after completed census and disallows convenient substitute addresses', () => {
  assert.equal(act(createGame(), 'NEXT_CAMPAIGN').campaignId, 'courtyard');
  let state = act(finishCampaign(createGame()), 'NEXT_CAMPAIGN');
  assert.equal(state.campaignId, 'sample');
  assert.equal(state.tasks.length, 2);
  const before = JSON.stringify(state.tasks);
  state = act(state, 'ASSIGN', { taskId: 'convenient-neighbor', staffId: 'anna' });
  assert.equal(JSON.stringify(state.tasks), before);
  state = finishCampaign(state);
  assert.equal(state.phase, 'summary');
  assert.equal(getView(state).summary.persons, 5);
  assert.equal(getView(state).summary.households, 2);
});

test('saved state roundtrips at every meaningful stage', () => {
  let state = createGame();
  assert.ok(validateSave(JSON.stringify(state)));
  state = answerTask(act(state, 'START'), 'yuri');
  assert.ok(validateSave(JSON.stringify(state)));
  state = act(state, 'SYNC');
  assert.ok(validateSave(JSON.stringify(state)));
  state = act(state, 'CHECK');
  assert.ok(validateSave(JSON.stringify(state)));
  state = finishCampaign(createGame());
  assert.ok(validateSave(JSON.stringify(state)));
  state = act(state, 'NEXT_CAMPAIGN');
  assert.ok(validateSave(JSON.stringify(state)));
  state = finishCampaign(state);
  assert.ok(validateSave(JSON.stringify(state)));
});

test('incompatible or corrupt saves are rejected and authored definitions are rebuilt', () => {
  assert.equal(validateSave('{bad'), null);
  assert.equal(validateSave(null), null);
  assert.equal(validateSave({ version: 999 }), null);
  for (const corrupt of [
    state => { state.tasks[0].status = 'accepted'; },
    state => { state.tasks.push(state.tasks[0]); },
    state => { state.tasks[0].clues = ['invented-question']; },
    state => { state.time = Infinity; },
    state => { state.phase = 'summary'; },
    state => { state.tasks[1].assignedTo = 'unknown-worker'; },
  ]) {
    const bad = createGame(); corrupt(bad); assert.equal(validateSave(bad), null);
  }
  const injected = createGame();
  injected.tasks[0].expected = { households: 999, persons: 999 };
  injected.tasks[0].name = 'Injected name';
  const safe = validateSave(injected);
  assert.deepEqual(safe.tasks[0].expected, { households: 1, persons: 3 });
  assert.equal(safe.tasks[0].name, 'Марина');
});

test('repeated transmission/check/finish commands do not duplicate accepted results', () => {
  let state = finishCampaign(createGame());
  const original = getView(state).summary;
  state = act(act(act(state, 'SYNC'), 'CHECK'), 'FINISH');
  assert.deepEqual(getView(state).summary, original);
  assert.deepEqual(state.completedCampaigns, ['courtyard']);
});

test('scoped synchronization and checking process only the carried task and remain idempotent', () => {
  let state = answerTask(act(createGame(), 'START'), 'yuri');
  state = answerTask(state, 'marina');
  const task = id => state.tasks.find(item => item.id === id);
  assert.equal(task('yuri').transmission, 'local');
  assert.equal(task('marina').transmission, 'local');
  const marinaBefore = JSON.stringify(task('marina'));

  state = act(state, 'SYNC', { taskId: 'yuri' });
  assert.equal(task('yuri').status, 'sent');
  assert.equal(JSON.stringify(task('marina')), marinaBefore);
  state = act(state, 'CHECK', { taskId: 'yuri' });
  assert.equal(task('yuri').status, 'accepted');
  assert.equal(JSON.stringify(task('marina')), marinaBefore);

  const yuriBefore = JSON.stringify(task('yuri'));
  const messageCount = state.messages.length;
  state = act(act(state, 'SYNC', { taskId: 'yuri' }), 'CHECK', { taskId: 'yuri' });
  assert.equal(JSON.stringify(task('yuri')), yuriBefore);
  assert.equal(JSON.stringify(task('marina')), marinaBefore);
  assert.equal(state.messages.length, messageCount);

  state = act(state, 'SYNC', { taskId: 'marina' });
  state = act(state, 'CHECK', { taskId: 'yuri' });
  assert.equal(task('marina').status, 'sent', 'checking another task must not accept this one');
  state = act(state, 'CHECK', { taskId: 'marina' });
  assert.equal(task('marina').status, 'accepted');
});
