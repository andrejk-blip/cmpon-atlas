import test from 'node:test';
import assert from 'node:assert/strict';
import {createLife, reduceLife, validateLife, viewLife} from '../src/life/engine.js';
import {NPC_IDS, NPC_SPOTS, createSocial, getNpcConversation, applyNpcTalk} from '../src/life/relationships.js';

const act = (state, type, data = {}) => reduceLife(state, {type, ...data});
const arrive = (state, spotId) => act(state, 'ARRIVE', {spotId});
const talk = (state, npcId, choiceId) => act(state, 'NPC_TALK', {npcId, choiceId});
function morning({friend = true, romance = 'accept'} = {}) {
  let s = act(createLife(), 'WAKE');
  s = act(arrive(s, 'wardrobe'), 'OUTFIT', {outfitId: 'coral'});
  s = act(arrive(s, 'bag'), 'PACK');
  s = act(s, 'CHAT', {channelId: 'team', choiceId: 'ready'});
  if (friend) s = act(s, 'CHAT', {channelId: 'friend', choiceId: 'bright'});
  if (romance) s = act(s, 'CHAT', {channelId: 'max', choiceId: romance});
  return s;
}
function shift(s = morning()) {
  return act(arrive(s, 'door'), 'LEAVE');
}
function introduced(s = shift()) {
  return act(arrive(s, 'mentor'), 'MEET_TEAM');
}
function accepted(s = introduced()) {
  s = act(arrive(s, 'respondent'), 'VISIT');
  s = act(s, 'ASK', {questionId: 'who'});
  s = act(s, 'ASK', {questionId: 'budget'});
  s = act(s, 'SUBMIT', {answers: {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}]}});
  return act(arrive(s, 'mentor'), 'HAND_IN');
}
function afterDate(s = accepted()) {
  s = act(arrive(s, 'bench'), 'DATE');
  return act(s, 'DATE_REPLY', {choiceId: 'honest'});
}
function finish(s) {
  s = act(arrive(s, 'entrance'), 'RETURN_HOME');
  return act(arrive(s, 'bed'), 'FINISH');
}
const outcomeFields = state => ({coins: state.coins, xp: state.xp, flags: state.flags, interview: state.interview, date: state.date});

test('all eight NPCs have an explicit conversation contract and unknown IDs are safe', () => {
  const s = createLife();
  assert.deepEqual(Object.keys(s.social), NPC_IDS);
  for (const id of NPC_IDS) {
    const c = getNpcConversation(s, id);
    assert.equal(c.id, id);
    assert.ok(c.name && c.role);
    assert.ok(['brief', 'branch'].includes(c.kind));
    assert.equal(c.status, 'unreachable');
    assert.deepEqual(c.choices, []);
  }
  assert.equal(getNpcConversation(s, 'not-a-person'), null);
  assert.equal(getNpcConversation(s, '__proto__'), null);
  assert.equal(getNpcConversation(s, 'toString'), null);
  const awake = act(s, 'WAKE');
  assert.doesNotThrow(() => talk(awake, '__proto__', 'anything'));
  assert.equal(talk(awake, 'not-a-person', 'anything').events.length, awake.events.length);
});

test('physical conversations require arrival at the correct person and new spots exist only in the district', () => {
  const home = morning();
  assert.equal(arrive(home, 'npc:resident-1').currentSpot, 'bag');
  const outside = shift(home);
  assert.equal(talk(outside, 'resident-1', 'say-first-day').social['resident-1'].length, 0);
  const nearNikolai = arrive(outside, 'npc:resident-1');
  assert.equal(getNpcConversation(nearNikolai, 'resident-1').status, 'ready');
  assert.equal(getNpcConversation(nearNikolai, 'resident-2').status, 'unreachable');
  assert.equal(talk(nearNikolai, 'resident-2', 'new-neighbor').events.length, nearNikolai.events.length);
  assert.equal(arrive(outside, 'npc:resident-3').currentSpot, 'entrance');
});

test('Nikolai is a finite passer-by conversation and cannot be repeatedly farmed', () => {
  const start = arrive(shift(), NPC_SPOTS['resident-1']);
  const before = structuredClone(start);
  const spoken = talk(start, 'resident-1', 'say-first-day');
  assert.deepEqual(start, before);
  assert.equal(getNpcConversation(spoken, 'resident-1').status, 'complete');
  assert.deepEqual(getNpcConversation(spoken, 'resident-1').choices, []);
  assert.match(getNpcConversation(spoken, 'resident-1').opening, /хорошего начала/);
  assert.deepEqual(outcomeFields(spoken), outcomeFields(start));
  const repeated = talk(spoken, 'resident-1', 'notice-courtyard');
  assert.equal(repeated.events.length, spoken.events.length);
  assert.equal(repeated.time, spoken.time);
});

test('Denis remembers the introduction and gains a real second stage after work', () => {
  let s = arrive(introduced(), NPC_SPOTS['resident-2']);
  s = talk(s, 'resident-2', 'new-neighbor');
  const waiting = getNpcConversation(s, 'resident-2');
  assert.equal(waiting.status, 'waiting');
  assert.deepEqual(waiting.choices, []);
  assert.match(waiting.nextHint, /После работы/);
  assert.equal(talk(s, 'resident-2', 'share-day').events.length, s.events.length);
  s = arrive(accepted(s), NPC_SPOTS['resident-2']);
  const followup = getNpcConversation(s, 'resident-2');
  assert.equal(followup.status, 'ready');
  assert.match(followup.opening, /район/);
  s = talk(s, 'resident-2', 'share-day');
  assert.equal(getNpcConversation(s, 'resident-2').status, 'complete');
  assert.deepEqual(s.social['resident-2'], ['new-neighbor', 'share-day']);
  assert.ok(validateLife(s));
});

test('Vera mentorship supplements existing work actions and never substitutes for acceptance', () => {
  let s = arrive(shift(), 'mentor');
  assert.equal(getNpcConversation(s, 'vera').status, 'waiting');
  assert.equal(talk(s, 'vera', 'ask-help').social.vera.length, 0);
  s = act(s, 'MEET_TEAM');
  s = talk(s, 'vera', 'ask-help');
  assert.equal(s.interview.status, 'ready');
  assert.equal(s.coins, 600);
  assert.equal(getNpcConversation(s, 'vera').status, 'waiting');
  s = accepted(s);
  const paidBefore = outcomeFields(s);
  s = talk(s, 'vera', 'ask-surveys');
  assert.deepEqual(outcomeFields(s), paidBefore);
  assert.equal(s.coins, 900);
  assert.equal(getNpcConversation(s, 'vera').status, 'complete');
  assert.equal(act(s, 'HAND_IN').coins, 900);
});

test('Max follow-up choices require the real date, record a plan and respect a gentle pace', () => {
  const declined = arrive(accepted(introduced(shift(morning({romance: 'later'})))), 'bench');
  assert.equal(getNpcConversation(declined, 'max').status, 'waiting');
  assert.deepEqual(getNpcConversation(declined, 'max').choices, []);
  let s = afterDate();
  const before = outcomeFields(s);
  s = talk(s, 'max', 'next-walk');
  assert.equal(getNpcConversation(s, 'max').stageId, 'pace');
  s = talk(s, 'max', 'keep-easy');
  assert.equal(getNpcConversation(s, 'max').status, 'complete');
  assert.deepEqual(s.social.max, ['next-walk', 'keep-easy']);
  assert.deepEqual(outcomeFields(s), before);
  assert.equal(talk(s, 'max', 'make-time').events.length, s.events.length);
  assert.ok(validateLife(s));
});

test('Kira keeps the morning phone reply and adds one evening reaction from any location', () => {
  let s = morning({friend: false});
  assert.equal(getNpcConversation(s, 'kira').status, 'waiting');
  s = act(s, 'CHAT', {channelId: 'friend', choiceId: 'calm'});
  assert.equal(getNpcConversation(s, 'kira').status, 'waiting');
  s = accepted(introduced(shift(s)));
  assert.equal(getNpcConversation(s, 'kira').status, 'ready');
  s = act(arrive(s, 'entrance'), 'RETURN_HOME');
  assert.equal(getNpcConversation(s, 'kira').reachable, true);
  const before = outcomeFields(s);
  s = talk(s, 'kira', 'share-evening');
  assert.equal(s.chats.friend.choiceId, 'calm');
  assert.deepEqual(outcomeFields(s), before);
  assert.equal(getNpcConversation(s, 'kira').status, 'complete');
});

test('Ilya, Anton and Dima have individual closed conversations without filling questionnaire clues', () => {
  let s = arrive(shift(), 'respondent');
  for (const id of ['ilya', 'anton', 'dima']) assert.equal(getNpcConversation(s, id).status, 'unreachable');
  s = act(arrive(introduced(s), 'respondent'), 'VISIT');
  const originalInterview = structuredClone(s.interview);
  for (const [id, choice] of [['ilya', 'ilya-labels'], ['anton', 'anton-stickers'], ['dima', 'dima-goodbye']]) {
    assert.equal(getNpcConversation(s, id).status, 'ready');
    s = talk(s, id, choice);
    assert.equal(getNpcConversation(s, id).status, 'complete');
    assert.deepEqual(s.interview, originalInterview);
  }
  assert.equal(s.coins, 600);
  assert.deepEqual(s.interview.clues, []);
  assert.equal(act(s, 'SUBMIT', {answers: {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}]}}).interview.status, 'talking');
  assert.match(getNpcConversation(s, 'dima').summary, /нет отдельного поручения/);
});

test('every offered choice is playable in its stage and completes a bounded branch', () => {
  const contexts = [
    ['resident-1', arrive(shift(), NPC_SPOTS['resident-1'])],
    ['resident-2', arrive(introduced(), NPC_SPOTS['resident-2'])],
    ['vera', introduced()],
    ['vera', accepted(talk(introduced(), 'vera', 'ask-help'))],
    ['resident-2', arrive(accepted(talk(arrive(introduced(), NPC_SPOTS['resident-2']), 'resident-2', 'on-the-job')), NPC_SPOTS['resident-2'])],
    ['max', afterDate()],
    ['max', talk(afterDate(), 'max', 'home-coffee')],
    ['kira', accepted()],
    ...['ilya', 'anton', 'dima'].map(id => [id, act(arrive(introduced(), 'respondent'), 'VISIT')]),
  ];
  for (const [id, state] of contexts) {
    const conversation = getNpcConversation(state, id);
    assert.equal(conversation.status, 'ready', id);
    assert.ok(conversation.choices.length > 0, id);
    for (const choice of conversation.choices) {
      const changed = talk(state, id, choice.id);
      assert.equal(changed.events.length, state.events.length + 1, `${id}: ${choice.id}`);
      assert.equal(changed.social[id].length, state.social[id].length + 1);
      assert.ok(validateLife(changed));
    }
  }
});

test('social history roundtrips and legacy v2 saves may omit it only before any NPC event', () => {
  const legacy = accepted();
  delete legacy.social;
  const restoredLegacy = validateLife(legacy);
  assert.ok(restoredLegacy);
  assert.deepEqual(restoredLegacy.social, createSocial());
  const spoken = talk(arrive(restoredLegacy, NPC_SPOTS['resident-1']), 'resident-1', 'say-first-day');
  const restored = validateLife(JSON.stringify(spoken));
  assert.ok(restored);
  assert.deepEqual(restored.social, spoken.social);
  const missing = structuredClone(spoken);
  delete missing.social;
  assert.equal(validateLife(missing), null);
  const forged = structuredClone(spoken);
  forged.social['resident-2'] = ['new-neighbor', 'share-day'];
  assert.equal(validateLife(forged), null);
  const invalidHistory = structuredClone(spoken);
  invalidHistory.events.push({type: 'NPC_TALK', npcId: 'resident-2', choiceId: 'share-day'});
  assert.equal(validateLife(invalidHistory), null);
});

test('completed days retain readable memories without enabling more story rewards or actions', () => {
  let s = talk(afterDate(), 'max', 'home-coffee');
  s = talk(s, 'max', 'make-time');
  s = talk(s, 'kira', 'share-work');
  const done = finish(s);
  assert.equal(getNpcConversation(done, 'max').status, 'complete');
  assert.equal(getNpcConversation(done, 'max').history.length, 2);
  assert.deepEqual(getNpcConversation(done, 'max').choices, []);
  assert.equal(talk(done, 'resident-1', 'say-first-day').events.length, done.events.length);
  assert.equal(viewLife(done).socialConversations.length, NPC_IDS.length);
  assert.ok(validateLife(done));
});

test('the standalone social reducer returns new history without mutating its input', () => {
  const s = arrive(shift(), NPC_SPOTS['resident-1']);
  const before = structuredClone(s);
  const result = applyNpcTalk(s, {npcId: 'resident-1', choiceId: 'notice-courtyard'});
  assert.equal(result.ok, true);
  assert.deepEqual(s, before);
  assert.deepEqual(result.social['resident-1'], ['notice-courtyard']);
  assert.equal(applyNpcTalk(s, {npcId: 'resident-1', choiceId: 'invented'}).ok, false);
});
