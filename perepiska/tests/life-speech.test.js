import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHAT_THREADS, INTERVIEW, DATE_SCENE, TEAM_MEETING, TEAM_HANDOFF} from '../src/life/content.js';
import {NPC_DIALOGUE, NPC_IDS, NPC_SPOTS, getNpcConversation} from '../src/life/relationships.js';
import {createLife, reduceLife, validateLife} from '../src/life/engine.js';
import {SPEECH_LINES, getSpeech, findSpeech} from '../src/life/speech-catalog.js';

const act = (state, type, data = {}) => reduceLife(state, {type, ...data});
const arrive = (state, spotId) => act(state, 'ARRIVE', {spotId});
const speakerIds = {Анна: 'anna', Вера: 'vera', Кира: 'kira', Макс: 'max'};
function introduced() {
  let s = act(createLife(), 'WAKE');
  s = act(arrive(s, 'wardrobe'), 'OUTFIT', {outfitId: 'coral'});
  s = act(arrive(s, 'bag'), 'PACK');
  for (const [channelId, choiceId] of [['team', 'ready'], ['friend', 'bright'], ['max', 'accept']]) {
    s = act(s, 'CHAT', {channelId, choiceId});
  }
  s = act(arrive(s, 'door'), 'LEAVE');
  return act(arrive(s, 'mentor'), 'MEET_TEAM');
}
function accepted() {
  let s = act(arrive(introduced(), 'respondent'), 'VISIT');
  for (const question of INTERVIEW.questions) s = act(s, 'ASK', {questionId: question.id});
  s = act(s, 'SUBMIT', {answers: {members: [{id: 'ilya', household: 1}, {id: 'anton', household: 2}]}});
  return act(arrive(s, 'mentor'), 'HAND_IN');
}
function afterDate(choiceId = 'honest') {
  const s = act(arrive(accepted(), 'bench'), 'DATE');
  return act(s, 'DATE_REPLY', {choiceId});
}
function expectLine(speakerId, text, id) {
  const entry = findSpeech(speakerId, text);
  assert.ok(entry, `Missing speech for ${speakerId}: ${text}`);
  if (id) assert.equal(entry.id, id);
  assert.equal(getSpeech(entry.id), entry);
  return entry;
}

// This inventory is the complete approved first-day recording scope, not a media-file count.
test('all 92 first-day lines have unique stable ids, known speakers and immutable metadata', () => {
  assert.equal(SPEECH_LINES.length, 92);
  assert.equal(new Set(SPEECH_LINES.map(line => line.id)).size, SPEECH_LINES.length);
  assert.deepEqual(new Set(SPEECH_LINES.map(line => line.speakerId)), new Set(['anna', 'narrator', ...NPC_IDS]));
  for (const line of SPEECH_LINES) {
    assert.match(line.id, /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
    assert.ok(line.text.length > 0 && line.displayText.length > 0);
    assert.match(line.text, /[А-Яа-яЁё]/);
    assert.equal(Object.isFrozen(line), true);
    expectLine(line.speakerId, line.displayText, line.id);
  }
  assert.equal(Object.isFrozen(SPEECH_LINES), true);
});

test('every authored chat opening and both sides of every selectable response are covered', () => {
  const speakers = {team: 'vera', friend: 'kira', max: 'max'};
  for (const thread of CHAT_THREADS) {
    expectLine(speakers[thread.id], thread.opening, `chat.${thread.id}.opening`);
    for (const choice of [...thread.choices, ...(thread.followup ? [thread.followup] : [])]) {
      expectLine('anna', choice.label, `chat.${thread.id}.${choice.id}.anna`);
      expectLine(speakers[thread.id], choice.reply, `chat.${thread.id}.${choice.id}.reply`);
      let s = act(createLife(), 'WAKE');
      if (choice === thread.followup) s = act(s, 'CHAT', {channelId: thread.id, choiceId: 'accept'});
      s = act(s, 'CHAT', {channelId: thread.id, choiceId: choice.id});
      assert.equal(s.chats[thread.id].choiceId, choice.id);
      for (const message of s.chats[thread.id].messages) expectLine(speakerIds[message.speaker], message.text);
    }
  }
});

test('real acceptance and both date outcomes emit only covered character messages', () => {
  for (const choice of DATE_SCENE.choices) {
    const s = afterDate(choice.id);
    assert.equal(s.interview.status, 'accepted');
    assert.equal(s.date.status, 'met');
    for (const thread of Object.values(s.chats)) {
      for (const message of thread.messages) expectLine(speakerIds[message.speaker], message.text);
    }
    expectLine('max', s.date.lastReply, `date.${choice.id}.reply`);
    assert.equal(findSpeech('vera', s.chats.team.messages.at(-1).text).id, 'chat.team.accepted');
    assert.equal(findSpeech('max', s.chats.max.messages.at(-1).text).id, `chat.max.after-date.${choice.id}`);
  }
});

test('every NPC branch is covered through real conversation choices, including all dynamic openings', () => {
  const seen = new Set();
  function visit(state, npcId) {
    const conversation = getNpcConversation(state, npcId);
    if (conversation.status !== 'ready') return;
    seen.add(expectLine(npcId, conversation.opening).id);
    for (const choice of conversation.choices) {
      seen.add(expectLine('anna', choice.label).id);
      const next = act(state, 'NPC_TALK', {npcId, choiceId: choice.id});
      assert.equal(next.events.length, state.events.length + 1);
      const result = getNpcConversation(next, npcId);
      seen.add(expectLine(npcId, result.lastReply).id);
      visit(next, npcId);
    }
  }
  for (const npcId of NPC_IDS) {
    for (const base of [introduced(), accepted(), afterDate()]) {
      visit(NPC_SPOTS[npcId] ? arrive(base, NPC_SPOTS[npcId]) : base, npcId);
    }
    for (const stage of NPC_DIALOGUE[npcId].stages) {
      if (typeof stage.opening === 'string') expectLine(npcId, stage.opening);
      for (const choice of stage.choices) {
        expectLine('anna', choice.label);
        expectLine(npcId, choice.reply);
      }
    }
  }
  assert.deepEqual(seen, new Set(SPEECH_LINES.filter(line => line.group === 'npc').map(line => line.id)));
  for (const id of ['npc.vera.mentorship.opening.before-work', 'npc.vera.mentorship.opening.after-work', 'npc.resident-2.after-work.opening.neighbor', 'npc.resident-2.after-work.opening.work']) {
    assert.ok(seen.has(id), `Dynamic opening was not exercised: ${id}`);
  }
});

test('interview, mentor and date dialogue retain the correct speaker and catalogue identity', () => {
  expectLine('ilya', INTERVIEW.opening, 'interview.opening');
  for (const question of INTERVIEW.questions) {
    expectLine('anna', question.label, `interview.${question.id}.anna`);
    expectLine('ilya', question.reply, `interview.${question.id}.reply`);
  }
  expectLine('vera', TEAM_MEETING, 'mentor.meeting');
  expectLine('vera', TEAM_HANDOFF, 'mentor.handoff');
  expectLine('max', DATE_SCENE.opening, 'date.opening');
  for (const choice of DATE_SCENE.choices) {
    expectLine('anna', choice.label, `date.${choice.id}.anna`);
    expectLine('max', choice.reply, `date.${choice.id}.reply`);
  }
  expectLine('narrator', INTERVIEW.instruction, 'interview.instruction');
  expectLine('narrator', INTERVIEW.accepted, 'interview.accepted');
  assert.equal(findSpeech('ilya', INTERVIEW.accepted), null);
});

test('selected indirect Anna choices become spoken dialogue and Max does not read stage directions', () => {
  const indirect = SPEECH_LINES.filter(line => line.speakerId === 'anna' && /^(Рассказать|Признаться|Спросить|Заметить|Пожелать)/.test(line.displayText));
  assert.equal(indirect.length, 9);
  for (const line of indirect) {
    assert.notEqual(line.text, line.displayText);
    assert.doesNotMatch(line.text, /^(Рассказать|Признаться|Спросить|Заметить|Пожелать)/);
  }
  assert.doesNotMatch(getSpeech('date.warm.reply').text, /Улыбается|[«»]/);
  assert.doesNotMatch(getSpeech('date.honest.reply').text, /[«»]/);
  assert.equal(getSpeech('date.done').text, 'Мне тоже было хорошо.');
});

test('dialogue literals in the interface have entries while generic labels stay silent', () => {
  const app = readFileSync(new URL('../src/life/app.js', import.meta.url), 'utf8');
  for (const id of ['date.hello', 'date.done']) assert.ok(app.includes(getSpeech(id).displayText) || app.includes(id), `${id} no longer matches the UI`);
  for (const [id, fragment] of [['pilot.welcome', 'Собраться на новую работу.'], ['pilot.welcome', 'Познакомиться с соседями.'], ['pilot.welcome', 'И оставить время для себя.'], ['pilot.alarm', 'Новая работа. Новые люди.'], ['pilot.ending', 'Сегодня ты познакомилась с работой, получила деньги за первую анкету'], ['pilot.bed.accepted', 'Максу можно написать, что прогулку перенесём.'], ['pilot.bed.other', 'Первый день уже стал частью твоей истории.']]) {
    assert.ok(app.includes(fragment) || app.includes(id), `Narration no longer matches UI: ${id}`);
    assert.ok(getSpeech(id).text.includes(fragment));
  }
  assert.equal(findSpeech('anna', 'Закрыть'), null);
  assert.equal(findSpeech('vera', 'Сдать анкету · +300'), null);
  assert.equal(findSpeech('max', 'Этот разговор уже завершён.'), null);
  assert.equal(findSpeech('__proto__', INTERVIEW.opening), null);
  assert.equal(findSpeech('ilya', null), null);
  assert.equal(getSpeech('__proto__'), null);
  assert.equal(getSpeech(null), null);
  assert.equal(findSpeech('anna', '  Привет,\n Макс.  '), getSpeech('date.hello'));
});

test('legacy v2 saves with old authored copy restore speech without an audio migration', () => {
  const original = afterDate();
  const oldSave = structuredClone(original);
  delete oldSave.social; // These event sequences predate optional NPC_TALK.
  for (const thread of Object.values(oldSave.chats)) {
    for (const message of thread.messages) message.text = 'Старая редакция реплики';
  }
  oldSave.date.lastReply = 'Прежняя редакция сцены';
  const restored = validateLife(oldSave);
  assert.ok(restored);
  assert.deepEqual(restored.events, original.events);
  assert.equal(restored.coins, original.coins);
  for (const thread of Object.values(restored.chats)) {
    for (const message of thread.messages) expectLine(speakerIds[message.speaker], message.text);
  }
  expectLine('max', restored.date.lastReply, 'date.honest.reply');
  assert.equal(Object.hasOwn(restored, 'speech'), false);
  assert.equal(Object.hasOwn(restored, 'audio'), false);
});
