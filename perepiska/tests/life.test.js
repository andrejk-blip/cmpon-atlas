import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife, reduceLife, validateLife, viewLife} from '../src/life/engine.js';

const action = (state, type, data = {}) => reduceLife(state, {type, ...data});
const arrive = (state, spotId) => action(state, 'ARRIVE', {spotId});
function morning({breakfast = false, outfit = 'coral', romance = null} = {}) {
  let s = action(createLife(), 'WAKE');
  if (breakfast) s = action(arrive(s, 'kitchen'), 'BREAKFAST');
  s = action(arrive(s, 'wardrobe'), 'OUTFIT', {outfitId: outfit});
  s = action(arrive(s, 'bag'), 'PACK');
  s = action(s, 'CHAT', {channelId: 'team', choiceId: 'question'});
  if (romance) s = action(s, 'CHAT', {channelId: 'max', choiceId: romance});
  return s;
}
function conversation(s = morning()) {
  s = action(arrive(s, 'door'), 'LEAVE');
  s = action(arrive(s, 'mentor'), 'MEET_TEAM');
  return action(arrive(s, 'respondent'), 'VISIT');
}
function localResult(s = conversation()) {
  s = action(s, 'ASK', {questionId: 'who'});
  s = action(s, 'ASK', {questionId: 'budget'});
  return action(s, 'SUBMIT', {answers: {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}]}});
}
function evening(s = localResult()) {
  return action(arrive(s, 'mentor'), 'HAND_IN');
}
function homeEnd(s) {
  s = action(arrive(s, 'entrance'), 'RETURN_HOME');
  return action(arrive(s, 'bed'), 'FINISH');
}

test('wake is one deliberate choice; actions are pure and snooze cannot repeat', () => {
  const initial = createLife();
  assert.equal(action(initial, 'PACK').flags.awake, false);
  const s = action(initial, 'WAKE', {snooze: true});
  assert.equal(s.time, 455);
  assert.equal(s.flags.snoozed, true);
  assert.equal(initial.flags.awake, false);
  const repeated = action(s, 'WAKE', {snooze: true});
  assert.equal(repeated.time, s.time);
  assert.equal(repeated.events.length, s.events.length);
});

test('morning requires work essentials and an outfit but breakfast, shopping, and romance are optional', () => {
  let s = action(createLife(), 'WAKE');
  s = arrive(s, 'door');
  assert.equal(action(s, 'LEAVE').phase, 'morning');
  s = morning();
  assert.equal(s.flags.breakfast, false);
  assert.equal(s.homeItems.length, 0);
  assert.equal(s.chats.max.choiceId, null);
  assert.equal(viewLife(s).canLeave, true);
  assert.equal(action(arrive(s, 'door'), 'LEAVE').phase, 'shift');
});

test('actions require their physical spot and scene; arbitrary arrivals are rejected', () => {
  const s = action(createLife(), 'WAKE');
  assert.equal(action(s, 'BREAKFAST').flags.breakfast, false);
  assert.equal(action(s, 'OUTFIT', {outfitId: 'coral'}).outfit, null);
  assert.equal(arrive(s, 'respondent').currentSpot, 'bed');
  assert.equal(action(s, 'HAND_IN').coins, 600);
});

test('breakfast trades time for energy and cannot be farmed', () => {
  const s = arrive(action(createLife(), 'WAKE'), 'kitchen');
  const fed = action(s, 'BREAKFAST');
  assert.equal(fed.time - s.time, 12);
  assert.equal(fed.energy - s.energy, 22);
  const again = action(fed, 'BREAKFAST');
  assert.equal(again.time, fed.time);
  assert.equal(again.energy, fed.energy);
});

test('morning money buys one of the two home items; work pay enables a later purchase', () => {
  let s = action(morning(), 'BUY', {itemId: 'plant'});
  assert.equal(s.coins, 300);
  assert.deepEqual(s.homeItems, ['plant']);
  s = action(s, 'BUY', {itemId: 'lamp'});
  assert.equal(s.coins, 300);
  assert.deepEqual(s.homeItems, ['plant']);
  assert.equal(action(s, 'BUY', {itemId: 'plant'}).coins, 300);
  s = evening(localResult(conversation(s)));
  assert.equal(s.coins, 600);
  s = action(s, 'BUY', {itemId: 'lamp'});
  assert.equal(s.coins, 100);
  assert.deepEqual(s.homeItems, ['plant', 'lamp']);
});

test('clothes are self-expression and do not change work pay or experience', () => {
  const coral = evening(localResult(conversation(morning({outfit: 'coral'}))));
  const sage = evening(localResult(conversation(morning({outfit: 'sage'}))));
  assert.equal(coral.coins, sage.coins);
  assert.equal(coral.xp, sage.xp);
  assert.equal(coral.energy, sage.energy);
});

test('an interview cannot start before meeting the mentor', () => {
  const s = action(arrive(morning(), 'door'), 'LEAVE');
  const visited = action(arrive(s, 'respondent'), 'VISIT');
  assert.equal(visited.interview.status, 'locked');
  assert.equal(visited.flags.mentorMet, false);
});

test('the household puzzle needs clarification, excludes the guest, and separates the brothers', () => {
  let s = conversation();
  const valid = {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}]};
  assert.equal(action(s, 'SUBMIT', {answers: valid}).interview.status, 'talking');
  s = action(s, 'ASK', {questionId: 'who'});
  s = action(s, 'ASK', {questionId: 'budget'});
  const invalids = [
    {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 1}]},
    {members: [{id: 'ilya', household: 1}, {id: 'dima', household: 2}]},
    {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}, {id: 'dima', household: 2}]},
    {members: [{id: 'ilya', household: 1}]},
    {members: [{id: 'ilya', household: 1}, {id: 'ilya', household: 2}]},
    {members: [{id: 'ilya', household: -1}, {id: 'anton', household: 2}]},
  ];
  for (const answers of invalids) assert.equal(action(s, 'SUBMIT', {answers}).interview.status, 'talking');
  const done = action(s, 'SUBMIT', {answers: {members: [{id: 'anton', household: 1}, {id: 'ilya', household: 2}]}});
  assert.equal(done.interview.status, 'local');
  assert.equal(done.interview.answers.households, 2);
  assert.equal(done.interview.answers.persons, 2);
  assert.equal(done.coins, s.coins);
});

test('a questionnaire pays 300 only after acceptance at the mentor, once per questionnaire', () => {
  const local = localResult();
  assert.equal(action(local, 'HAND_IN').interview.status, 'local');
  const paid = evening(local);
  assert.equal(paid.interview.status, 'accepted');
  assert.equal(paid.phase, 'evening');
  assert.equal(paid.coins, 900);
  assert.equal(paid.xp, 1);
  assert.equal(paid.coins - local.coins, 300);
  const repeated = action(paid, 'HAND_IN');
  assert.equal(repeated.coins, paid.coins);
  assert.equal(repeated.xp, paid.xp);
  assert.equal(repeated.events.length, paid.events.length);
  assert.equal(repeated.chats.team.messages.length, paid.chats.team.messages.length);
});

test('date acceptance unlocks an optional meeting and different conversations leave different memories', () => {
  const start = evening(localResult(conversation(morning({romance: 'accept'}))));
  let atBench = action(arrive(start, 'bench'), 'DATE');
  assert.equal(atBench.date.status, 'talking');
  const warm = action(atBench, 'DATE_REPLY', {choiceId: 'warm'});
  const honest = action(atBench, 'DATE_REPLY', {choiceId: 'honest'});
  assert.equal(warm.date.bond, 'spark');
  assert.equal(honest.date.bond, 'comfortable');
  assert.equal(warm.coins, honest.coins);
  assert.equal(homeEnd(warm).phase, 'complete');
  assert.equal(action(warm, 'DATE_REPLY', {choiceId: 'warm'}).events.length, warm.events.length);
});

test('declining, not replying, or changing plans still permits a complete and paid first day', () => {
  for (const romance of [null, 'later', 'accept']) {
    let s = evening(localResult(conversation(morning({romance}))));
    if (romance === 'accept') s = action(s, 'CHAT', {channelId: 'max', choiceId: 'cancel'});
    const end = homeEnd(s);
    assert.equal(end.phase, 'complete');
    assert.equal(end.coins, 900);
    assert.equal(end.xp, 1);
    assert.notEqual(end.date.status, 'met');
    assert.equal(viewLife(end).outcome.romance, 'Вечер в своём ритме');
  }
});

test('home and evening purchases survive the return and every meaningful save roundtrip', () => {
  const states = [createLife(), morning({breakfast: true}), conversation(), localResult(), evening()];
  let end = evening();
  end = action(end, 'BUY', {itemId: 'lamp'});
  end = homeEnd(end);
  states.push(end);
  for (const state of states) {
    const restored = validateLife(JSON.stringify(state));
    assert.ok(restored);
    assert.equal(restored.phase, state.phase);
    assert.equal(restored.coins, state.coins);
    assert.deepEqual(restored.homeItems, state.homeItems);
    assert.equal(restored.notice, '');
  }
});

test('save validation rejects unknown versions, impossible histories, and forged values', () => {
  const s = evening();
  assert.equal(validateLife({...s, version: 1}), null);
  assert.equal(validateLife({...s, coins: 999999}), null);
  assert.equal(validateLife({...s, homeItems: ['plant', 'lamp']}), null);
  assert.equal(validateLife({...s, events: [...s.events, {type: 'HAND_IN'}]}), null);
  assert.equal(validateLife({...s, events: [{type: 'HACK'}]}), null);
  assert.equal(validateLife('{broken'), null);
});


test('reading a new message clears only that chat and survives a save without spending game time', () => {
  const s = evening();
  assert.equal(s.chats.team.unread, true);
  const read = action(s, 'READ_CHAT', {channelId: 'team'});
  assert.equal(read.chats.team.unread, false);
  assert.equal(read.chats.max.unread, true);
  assert.equal(read.time, s.time);
  assert.ok(validateLife(read));
  assert.equal(action(read, 'READ_CHAT', {channelId: 'team'}).events.length, read.events.length);
});

test('shopping waits for personal time and does not mutate the active interview', () => {
  const s = conversation();
  const attempted = action(s, 'BUY', {itemId: 'plant'});
  assert.deepEqual(attempted.homeItems, []);
  assert.equal(attempted.coins, s.coins);
  assert.equal(attempted.interview.status, 'talking');
});


test('completed days allow reading final messages but keep all gameplay outcomes immutable', () => {
  let s = evening(localResult(conversation(morning({romance: 'accept'}))));
  s = action(arrive(s, 'bench'), 'DATE');
  s = action(s, 'DATE_REPLY', {choiceId: 'warm'});
  const complete = homeEnd(s);
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.chats.team.unread, true);
  assert.equal(complete.chats.max.unread, true);
  const readTeam = action(complete, 'READ_CHAT', {channelId: 'team'});
  const readBoth = action(readTeam, 'READ_CHAT', {channelId: 'max'});
  assert.equal(readBoth.chats.team.unread, false);
  assert.equal(readBoth.chats.max.unread, false);
  for (const key of ['phase', 'scene', 'currentSpot', 'time', 'coins', 'energy', 'xp', 'outfit', 'flags', 'homeItems', 'interview', 'date']) {
    assert.deepEqual(readBoth[key], complete[key]);
  }
  assert.ok(validateLife(JSON.stringify(readBoth)));
  for (const change of [
    {type: 'BUY', itemId: 'plant'},
    {type: 'ARRIVE', spotId: 'kitchen'},
    {type: 'CHAT', channelId: 'friend', choiceId: 'bright'},
    {type: 'HAND_IN'},
    {type: 'FINISH'},
  ]) {
    const attempted = reduceLife(readBoth, change);
    assert.equal(attempted.events.length, readBoth.events.length);
    assert.equal(attempted.coins, readBoth.coins);
    assert.equal(attempted.currentSpot, readBoth.currentSpot);
    assert.equal(attempted.phase, 'complete');
  }
});

test('leaving an unfinished date and ending the day postpones it without inventing a romantic outcome', () => {
  let s = evening(localResult(conversation(morning({romance: 'accept'}))));
  s = action(arrive(s, 'bench'), 'DATE');
  assert.equal(s.date.status, 'talking');
  const beforeMessages = s.chats.max.messages.length;
  const end = homeEnd(s);
  assert.equal(end.phase, 'complete');
  assert.equal(end.date.status, 'postponed');
  assert.equal(end.date.choiceId, null);
  assert.equal(end.date.bond, 'unfamiliar');
  assert.equal(end.chats.max.messages.length, beforeMessages);
  assert.equal(viewLife(end).outcome.romance, 'Вечер в своём ритме');
  const restored = validateLife(JSON.stringify(end));
  assert.ok(restored);
  assert.equal(restored.date.status, 'postponed');
  assert.equal(restored.date.choiceId, null);
});


test('save loading rebuilds outdated or tampered dialogue without accepting forged logical outcomes', () => {
  let current = evening(localResult(conversation(morning({romance: 'accept'}))));
  current = action(arrive(current, 'bench'), 'DATE');
  current = action(current, 'DATE_REPLY', {choiceId: 'honest'});
  const outdated = structuredClone(current);
  outdated.chats.team.messages = [{speaker: 'Старое имя', text: 'Старая редакция вступления', time: 'утром'}];
  outdated.chats.max.messages[0] = {speaker: 'Подменённый автор', text: '<script>fake message</script>', time: -100};
  outdated.interview.lastReply = 'Фраза из предыдущей редакции сценария';
  outdated.date.lastReply = 'Устаревшая реплика после прогулки';
  const before = JSON.stringify(outdated);
  const restored = validateLife(outdated);
  assert.ok(restored);
  assert.deepEqual(restored.chats, current.chats);
  assert.deepEqual(restored.interview, current.interview);
  assert.deepEqual(restored.date, current.date);
  assert.equal(JSON.stringify(outdated), before);

  const forgedCoins = structuredClone(outdated);
  forgedCoins.coins += 300;
  assert.equal(validateLife(forgedCoins), null);
  const forgedReply = structuredClone(outdated);
  forgedReply.chats.max.choiceId = 'later';
  assert.equal(validateLife(forgedReply), null);
  const forgedDate = structuredClone(outdated);
  forgedDate.date.choiceId = 'warm';
  assert.equal(validateLife(forgedDate), null);
  const forgedClue = structuredClone(outdated);
  forgedClue.interview.clues = ['who'];
  assert.equal(validateLife(forgedClue), null);
});
