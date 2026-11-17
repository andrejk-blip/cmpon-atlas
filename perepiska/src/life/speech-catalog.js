/** Presentation-only speech inventory. Stable ids never enter the saved story. */
import {CHAT_THREADS, DATE_SCENE, ECONOMY, INTERVIEW, TEAM_HANDOFF, TEAM_MEETING} from './content.js';
import {NPC_DIALOGUE} from './relationships.js';

const entries = [];
const byId = new Map();
const byDisplay = new Map();
const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const displayKey = (speakerId, value) => `${speakerId}\u0000${normalize(value)}`;

function add(id, speakerId, displayText, group, spokenText = displayText) {
  if (byId.has(id)) throw new Error(`Duplicate speech id: ${id}`);
  const entry = Object.freeze({id, speakerId, text: spokenText, displayText, group});
  entries.push(entry);
  byId.set(id, entry);
  const key = displayKey(speakerId, displayText);
  if (byDisplay.has(key)) throw new Error(`Ambiguous speech text: ${id}`);
  byDisplay.set(key, entry);
}

const annaSpeech = Object.freeze({
  'npc.resident-2.after-work.share-day.anna': 'Моя первая анкета уже принята.',
  'npc.resident-2.after-work.ask-neighbor-life.anna': 'Чем соседи обычно занимаются вечерами?',
  'npc.kira.evening-reaction.share-work.anna': 'Первая анкета принята! Представляешь, два брата живут в одной квартире, а хозяйства ведут отдельно.',
  'npc.kira.evening-reaction.share-evening.anna': 'Сегодня оставляю немного времени для себя и своих планов.',
  'npc.ilya.ilya-smalltalk.ilya-labels.anna': 'Я заметила, у вас вещи и даже полки подписаны.',
  'npc.anton.anton-smalltalk.anton-stickers.anna': 'А чья была идея с наклейками?',
  'npc.dima.guest-goodbye.dima-goodbye.anna': 'Хорошего дня, Дима!',
  'date.warm.anna': 'Сегодня я познакомилась с двумя братьями. Живут вместе, а хозяйства ведут отдельно. Даже полки в холодильнике подписали.',
  'date.honest.anna': 'Если честно, день был очень волнительным. Я рада, что мы встретились.',
});

const chatSpeakers = Object.freeze({team: 'vera', friend: 'kira', max: 'max'});
for (const thread of CHAT_THREADS) {
  const speakerId = chatSpeakers[thread.id];
  if (!speakerId) throw new Error(`Missing chat speaker: ${thread.id}`);
  add(`chat.${thread.id}.opening`, speakerId, thread.opening, 'chat');
  for (const choice of [...thread.choices, ...(thread.followup ? [thread.followup] : [])]) {
    add(`chat.${thread.id}.${choice.id}.anna`, 'anna', choice.label, 'chat');
    add(`chat.${thread.id}.${choice.id}.reply`, speakerId, choice.reply, 'chat');
  }
}
add('chat.team.accepted', 'vera', `Анкета первого адреса принята. За неё начислено ${ECONOMY.acceptedFormPay} монет. На сегодня всё, Анна!`, 'chat');
add('chat.max.after-date.warm', 'max', 'Мне понравился наш вечер. Повторим прогулку на неделе?', 'chat');
add('chat.max.after-date.honest', 'max', 'Спасибо за вечер. Рад, что можно просто быть собой.', 'chat');

// Explicit semantic variants: adding another dynamic opening requires naming its cases.
const openingStates = Object.freeze({
  'vera.mentorship': [
    ['before-work', {interview: {status: 'ready'}}],
    ['after-work', {interview: {status: 'accepted'}}],
  ],
  'resident-2.after-work': [
    ['neighbor', {social: {'resident-2': ['new-neighbor']}}],
    ['work', {social: {'resident-2': ['on-the-job']}}],
  ],
});
for (const [npcId, npc] of Object.entries(NPC_DIALOGUE)) {
  for (const stage of npc.stages) {
    const prefix = `npc.${npcId}.${stage.id}`;
    if (typeof stage.opening === 'function') {
      const variants = openingStates[`${npcId}.${stage.id}`];
      if (!variants) throw new Error(`Missing speech opening variants: ${npcId}.${stage.id}`);
      for (const [variantId, state] of variants) {
        add(`${prefix}.opening.${variantId}`, npcId, stage.opening(state), 'npc');
      }
    } else add(`${prefix}.opening`, npcId, stage.opening, 'npc');
    for (const choice of stage.choices) {
      const annaId = `${prefix}.${choice.id}.anna`;
      add(annaId, 'anna', choice.label, 'npc', annaSpeech[annaId] || choice.label);
      add(`${prefix}.${choice.id}.reply`, npcId, choice.reply, 'npc');
    }
  }
}

add('interview.opening', 'ilya', INTERVIEW.opening, 'interview');
for (const question of INTERVIEW.questions) {
  add(`interview.${question.id}.anna`, 'anna', question.label, 'interview');
  add(`interview.${question.id}.reply`, 'ilya', question.reply, 'interview');
}
add('mentor.meeting', 'vera', TEAM_MEETING, 'mentor');
add('mentor.handoff', 'vera', TEAM_HANDOFF, 'mentor');
add('date.opening', 'max', DATE_SCENE.opening, 'date');
for (const choice of DATE_SCENE.choices) {
  const annaId = `date.${choice.id}.anna`;
  add(annaId, 'anna', choice.label, 'date', annaSpeech[annaId] || choice.label);
  const spokenReply = choice.reply.replace(/^Улыбается:\s*/, '').replace(/^«|»\.?$/g, '').trim();
  add(`date.${choice.id}.reply`, 'max', choice.reply, 'date', spokenReply);
}
add('date.hello', 'anna', 'Привет, Макс.', 'date');
add('date.done', 'anna', 'Мне тоже было хорошо ♡', 'date', 'Мне тоже было хорошо.');

add('pilot.welcome', 'narrator', 'Первый день Ани. Собраться на новую работу. Познакомиться с соседями. И оставить время для себя.', 'narration');
add('pilot.alarm', 'narrator', 'Доброе утро, Аня. Новая работа. Новые люди. И твой обычный, необычный день.', 'narration');
add('pilot.ending', 'narrator', 'Твой первый день завершён. Сегодня ты познакомилась с работой, получила деньги за первую анкету и выбрала свой вечер. Спасибо за игру! Эту историю можно пройти ещё раз с другими решениями.', 'narration');
add('interview.instruction', 'narrator', INTERVIEW.instruction, 'narration');
add('interview.accepted', 'narrator', INTERVIEW.accepted, 'narration');
add('pilot.bed.accepted', 'narrator', 'Оставим остальное на завтра? Максу можно написать, что прогулку перенесём. Или просто закончить день — он останется на завтра.', 'narration');
add('pilot.bed.other', 'narrator', 'Оставим остальное на завтра? Первый день уже стал частью твоей истории.', 'narration');

export const SPEECH_LINES = Object.freeze(entries);

/** Stable content id -> speech entry. Unknown ids are intentionally silent. */
export function getSpeech(id) {
  return typeof id === 'string' ? byId.get(id) || null : null;
}

/** Adapter for existing authored UI text. Never treats arbitrary labels as dialogue. */
export function findSpeech(speakerId, displayText) {
  return typeof speakerId === 'string' && typeof displayText === 'string'
    ? byDisplay.get(displayKey(speakerId, displayText)) || null
    : null;
}
