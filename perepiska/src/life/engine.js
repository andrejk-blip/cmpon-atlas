import {HERO, ECONOMY, OUTFITS, SHOP, SPOTS, CHAT_THREADS, INTERVIEW, DATE_SCENE} from './content.js';

const VERSION = 2;
const MAX_EVENTS = 500;
const clone = value => structuredClone(value);
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const threadDefinition = id => CHAT_THREADS.find(thread => thread.id === id);

export function createLife() {
  return {
    version: VERSION,
    episodeId: 'first-day',
    heroId: HERO.id,
    day: 1,
    phase: 'morning',
    scene: 'home',
    currentSpot: 'bed',
    time: 450,
    coins: ECONOMY.startingCoins,
    energy: 65,
    xp: 0,
    outfit: null,
    flags: {awake: false, snoozed: false, breakfast: false, packed: false, briefed: false, mentorMet: false, paid: false, late: false},
    homeItems: [],
    chats: Object.fromEntries(CHAT_THREADS.map(thread => [thread.id, {
      choiceId: null,
      unread: true,
      messages: [{speaker: thread.shortName, text: thread.opening, time: 450}],
    }])),
    interview: {status: 'locked', clues: [], answers: null, lastReply: INTERVIEW.opening},
    date: {status: 'invited', choiceId: null, bond: 'unfamiliar', lastReply: DATE_SCENE.opening},
    events: [],
    notice: '',
  };
}

function readyToLeave(state) {
  return state.flags.awake && state.flags.packed && state.flags.briefed && Boolean(state.outfit);
}

function chatChoices(state, id) {
  const definition = threadDefinition(id), thread = state.chats[id];
  if (!definition || !thread || !state.flags.awake || state.phase === 'complete') return [];
  if (thread.choiceId === null) return definition.choices;
  if (id === 'max' && thread.choiceId === 'accept' && state.date.status === 'accepted') return [definition.followup];
  return [];
}

function canonicalAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') return null;
  switch (action.type) {
    case 'ARRIVE': return typeof action.spotId === 'string' ? {type: action.type, spotId: action.spotId} : null;
    case 'WAKE': return action.snooze === undefined || typeof action.snooze === 'boolean' ? {type: action.type, snooze: action.snooze === true} : null;
    case 'OUTFIT': return typeof action.outfitId === 'string' ? {type: action.type, outfitId: action.outfitId} : null;
    case 'BUY': return typeof action.itemId === 'string' ? {type: action.type, itemId: action.itemId} : null;
    case 'READ_CHAT': return typeof action.channelId === 'string' ? {type: action.type, channelId: action.channelId} : null;
    case 'CHAT': return typeof action.channelId === 'string' && typeof action.choiceId === 'string' ? {type: action.type, channelId: action.channelId, choiceId: action.choiceId} : null;
    case 'ASK': return typeof action.questionId === 'string' ? {type: action.type, questionId: action.questionId} : null;
    case 'DATE_REPLY': return typeof action.choiceId === 'string' ? {type: action.type, choiceId: action.choiceId} : null;
    case 'SUBMIT': {
      if (!action.answers || !Array.isArray(action.answers.members)) return null;
      const members = action.answers.members;
      if (members.length > INTERVIEW.roster.length || members.some(member => !member || typeof member !== 'object' || typeof member.id !== 'string' || !Number.isInteger(member.household))) return null;
      return {type: action.type, answers: {members: members.map(({id, household}) => ({id, household}))}};
    }
    case 'BREAKFAST': case 'PACK': case 'LEAVE': case 'MEET_TEAM': case 'VISIT': case 'HAND_IN': case 'DATE': case 'RETURN_HOME': case 'FINISH':
      return {type: action.type};
    default: return null;
  }
}

/** Pure rules for one personal first day. Arrival is emitted by the movement layer. */
export function reduceLife(input, action) {
  const state = clone(input);
  state.notice = '';
  const a = canonicalAction(action);
  const fail = message => {state.notice = message; return state;};
  const advance = (minutes, energy = 0) => {
    state.time = Math.min(1439, state.time + minutes);
    state.energy = Math.max(0, Math.min(100, state.energy + energy));
  };
  const commit = message => {
    state.notice = message || '';
    state.events.push(a);
    return state;
  };
  const at = (scene, spot) => state.scene === scene && state.currentSpot === spot;
  if (!a) return fail('Такого действия пока нет.');
  if (state.phase === 'complete' && a.type !== 'READ_CHAT') return fail('Первый день уже завершён.');
  if (state.events.length >= MAX_EVENTS) return fail('Слишком много действий для этого эпизода.');
  if (!state.flags.awake && a.type !== 'WAKE') return fail('Сначала пора проснуться.');

  switch (a.type) {
    case 'WAKE':
      if (state.phase !== 'morning' || !at('home', 'bed') || state.flags.awake) return fail('Анна уже проснулась.');
      state.flags.awake = true;
      state.flags.snoozed = a.snooze;
      if (a.snooze) advance(5, 3);
      return commit(a.snooze ? 'Ещё пять минут — и начинаем день.' : 'Первое утро на новой работе.');

    case 'ARRIVE':
      if (!SPOTS[state.scene]?.includes(a.spotId)) return fail('Сюда пока не пройти.');
      if (state.currentSpot === a.spotId) return fail('Анна уже здесь.');
      state.currentSpot = a.spotId;
      advance(2);
      return commit();

    case 'BREAKFAST':
      if (state.phase !== 'morning' || !at('home', 'kitchen')) return fail('Завтрак можно приготовить на кухне утром.');
      if (state.flags.breakfast) return fail('Анна уже позавтракала.');
      state.flags.breakfast = true;
      advance(12, 22);
      return commit('Тёплый завтрак. Сил стало больше.');

    case 'OUTFIT': {
      if (state.phase !== 'morning' || !at('home', 'wardrobe')) return fail('Выбрать образ можно у шкафа перед выходом.');
      const outfit = OUTFITS.find(item => item.id === a.outfitId);
      if (!outfit) return fail('Такого образа пока нет в шкафу.');
      if (state.outfit === outfit.id) return fail('Этот образ уже выбран.');
      const first = state.outfit === null;
      state.outfit = outfit.id;
      advance(first ? 8 : 3);
      return commit(`${outfit.name}. Можно идти в своём темпе.`);
    }

    case 'PACK':
      if (state.phase !== 'morning' || !at('home', 'bag')) return fail('Планшет и удостоверение лежат у сумки.');
      if (state.flags.packed) return fail('Всё нужное уже в сумке.');
      state.flags.packed = true;
      advance(4);
      return commit('Планшет и удостоверение с собой.');

    case 'READ_CHAT': {
      const thread = state.chats[a.channelId];
      if (!thread) return fail('Такого чата нет.');
      if (!thread.unread) return fail('Сообщения уже прочитаны.');
      thread.unread = false;
      return commit();
    }

    case 'CHAT': {
      const definition = threadDefinition(a.channelId), thread = state.chats[a.channelId];
      if (!definition || !thread) return fail('Такого чата нет.');
      const choice = chatChoices(state, a.channelId).find(item => item.id === a.choiceId);
      if (!choice) return fail('На это сообщение уже ответили.');
      advance(3);
      thread.choiceId = choice.id;
      thread.unread = false;
      thread.messages.push({speaker: HERO.name, text: choice.label, time: state.time}, {speaker: definition.shortName, text: choice.reply, time: state.time});
      if (a.channelId === 'team') state.flags.briefed = true;
      if (a.channelId === 'max') state.date.status = choice.id === 'accept' ? 'accepted' : 'declined';
      return commit();
    }

    case 'BUY': {
      if (!['morning', 'evening'].includes(state.phase)) return fail('К домашним покупкам можно вернуться после смены.');
      const item = SHOP.find(item => item.id === a.itemId);
      if (!item) return fail('Этой вещи пока нет в магазине.');
      if (state.homeItems.includes(item.id)) return fail('Эта вещь уже есть дома.');
      if (state.coins < item.price) return fail('На эту покупку пока не хватает монет.');
      state.coins -= item.price;
      state.homeItems.push(item.id);
      advance(3);
      return commit(`${item.name} теперь дома.`);
    }

    case 'LEAVE':
      if (!at('home', 'door')) return fail('Сначала подойди к входной двери.');
      if (state.phase === 'morning') {
        if (!readyToLeave(state)) return fail('Выбери образ, собери сумку и ответь Вере в чате.');
        state.phase = 'shift';
        state.scene = 'district';
        state.currentSpot = 'entrance';
        advance(25, -5);
        return commit('Лесная улица. Вера уже ждёт во дворе.');
      }
      if (state.phase === 'evening') {
        state.scene = 'district';
        state.currentSpot = 'entrance';
        advance(10, -3);
        return commit('Можно немного прогуляться.');
      }
      return fail('Сейчас не время выходить из дома.');

    case 'MEET_TEAM':
      if (state.phase !== 'shift' || !at('district', 'mentor')) return fail('Вера ждёт во дворе. Сначала подойди к ней.');
      if (state.flags.mentorMet) return fail('Вы уже познакомились. Первый адрес ждёт.');
      state.flags.mentorMet = true;
      state.flags.late = state.time > 540;
      state.time = Math.max(state.time, 540);
      state.interview.status = 'ready';
      return commit('Первое задание — квартира 12. Вера рядом.');

    case 'VISIT':
      if (state.phase !== 'shift' || !state.flags.mentorMet || !at('district', 'respondent')) return fail('Сначала познакомься с Верой и дойди до нужного подъезда.');
      if (state.interview.status !== 'ready') return fail('Этот разговор уже начался или завершён.');
      state.interview.status = 'talking';
      advance(3, -3);
      return commit();

    case 'ASK': {
      if (state.phase !== 'shift' || state.interview.status !== 'talking' || !at('district', 'respondent')) return fail('Этот вопрос можно задать во время встречи.');
      const question = INTERVIEW.questions.find(item => item.id === a.questionId);
      if (!question || state.interview.clues.includes(question.id)) return fail('Этот вопрос уже задан.');
      state.interview.clues.push(question.id);
      state.interview.lastReply = question.reply;
      advance(3);
      return commit();
    }

    case 'SUBMIT': {
      if (state.phase !== 'shift' || state.interview.status !== 'talking' || !at('district', 'respondent')) return fail('Сначала нужно встретиться с жителями.');
      if (INTERVIEW.questions.some(question => question.required && !state.interview.clues.includes(question.id))) return fail('Сначала уточни, кто постоянно живёт здесь и как устроено хозяйство.');
      const members = a.answers.members;
      const ids = new Set(members.map(member => member.id));
      if (members.length !== 2 || ids.size !== 2 || !ids.has('ilya') || !ids.has('anton')) return fail('Здесь постоянно живут Илья и Антон. Дима — гость, его по этому адресу не учитываем.');
      if (members.some(member => ![1, 2].includes(member.household)) || new Set(members.map(member => member.household)).size !== 2) return fail('Братья ведут отдельные хозяйства. Размести каждого в своём домохозяйстве.');
      state.interview.answers = {
        members: ['ilya', 'anton'].map(id => ({...members.find(member => member.id === id)})),
        households: 2,
        persons: 2,
      };
      state.interview.status = 'local';
      state.interview.lastReply = INTERVIEW.accepted;
      advance(15, -12);
      return commit('Анкета сохранена на планшете. Пора вернуться к Вере.');
    }

    case 'HAND_IN':
      if (state.phase !== 'shift' || !at('district', 'mentor') || state.interview.status !== 'local') return fail('Принеси Вере сохранённую анкету первого адреса.');
      state.interview.status = 'accepted';
      state.flags.paid = true;
      state.coins += ECONOMY.acceptedFormPay;
      state.xp += 1;
      state.phase = 'evening';
      state.time = Math.max(state.time + 10, 1080);
      state.energy = Math.max(0, state.energy - 12);
      state.chats.team.messages.push({speaker: 'Вера', text: `Анкета первого адреса принята. За неё начислено ${ECONOMY.acceptedFormPay} монет. На сегодня всё, Анна!`, time: state.time});
      state.chats.team.unread = true;
      return commit(`Анкета принята. +${ECONOMY.acceptedFormPay} монет.`);

    case 'DATE':
      if (state.phase !== 'evening' || !at('district', 'bench') || state.date.status !== 'accepted') return fail('Для прогулки сначала договоритесь с Максом и подойдите к скамейке.');
      state.date.status = 'talking';
      advance(20, -6);
      return commit();

    case 'DATE_REPLY': {
      if (state.phase !== 'evening' || !at('district', 'bench') || state.date.status !== 'talking') return fail('Сначала встреться с Максом.');
      const choice = DATE_SCENE.choices.find(item => item.id === a.choiceId);
      if (!choice) return fail('Выбери, что хочешь ему рассказать.');
      state.date.status = 'met';
      state.date.choiceId = choice.id;
      state.date.bond = choice.bond;
      state.date.lastReply = choice.reply;
      advance(20, -3);
      state.chats.max.messages.push({speaker: 'Макс', text: choice.id === 'warm' ? 'Мне понравился наш вечер. Повторим прогулку на неделе?' : 'Спасибо за вечер. Рад, что можно просто быть собой.', time: state.time});
      state.chats.max.unread = true;
      return commit('У вашего знакомства появилась своя история.');
    }

    case 'RETURN_HOME':
      if (state.phase !== 'evening' || !at('district', 'entrance')) return fail('Вернуться домой можно после смены через выход со двора.');
      state.scene = 'home';
      state.currentSpot = 'door';
      advance(20, -3);
      return commit('Дома. Теперь вечер принадлежит тебе.');

    case 'FINISH':
      if (state.phase !== 'evening' || !at('home', 'bed') || state.interview.status !== 'accepted') return fail('Завершить день можно дома, когда рабочий результат передан.');
      state.phase = 'complete';
      state.time = Math.max(state.time, 1260);
      if (['accepted', 'invited', 'talking'].includes(state.date.status)) state.date.status = 'postponed';
      return commit('Первый день — твой. Завтра будет новая история.');
  }
  return fail('Такого действия пока нет.');
}

export function viewLife(state) {
  let objective;
  if (state.phase === 'morning') {
    objective = !state.flags.awake ? 'Проснуться в первый рабочий день' : !state.outfit ? 'Выбрать образ у шкафа' : !state.flags.packed ? 'Взять планшет и удостоверение' : !state.flags.briefed ? 'Ответить Вере в чате' : 'Выйти из дома — Вера ждёт во дворе';
  } else if (state.phase === 'shift') {
    objective = !state.flags.mentorMet ? 'Познакомиться с Верой' : state.interview.status === 'ready' ? 'Дойти до квартиры 12' : state.interview.status === 'talking' ? 'Разобраться, кто живёт и ведёт хозяйство вместе' : 'Вернуться к Вере с результатом';
  } else if (state.phase === 'evening') {
    objective = state.scene === 'home' ? 'Обустроить свой уголок и закончить день' : state.date.status === 'accepted' ? 'Встретиться с Максом или выбрать вечер дома' : state.date.status === 'talking' ? 'Поговорить с Максом' : 'Вернуться домой';
  } else objective = 'Первый день завершён';
  return {
    hero: HERO,
    objective,
    clock: clock(state.time),
    period: state.phase === 'morning' ? 'Утро' : state.phase === 'shift' ? 'Первая смена' : state.phase === 'evening' ? 'Вечер для себя' : 'Первый день позади',
    availableChats: CHAT_THREADS.map(definition => ({
      id: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      avatar: definition.avatar,
      color: definition.color,
      unread: state.chats[definition.id].unread,
      messages: state.chats[definition.id].messages,
      choices: chatChoices(state, definition.id),
      lastMessage: state.chats[definition.id].messages.at(-1),
    })),
    shop: SHOP.map(item => ({...item, owned: state.homeItems.includes(item.id), affordable: state.coins >= item.price})),
    outfits: OUTFITS,
    interviewQuestions: INTERVIEW.questions.filter(question => !state.interview.clues.includes(question.id)),
    roster: INTERVIEW.roster,
    canLeave: state.phase === 'morning' ? readyToLeave(state) : state.phase === 'evening' && state.scene === 'home',
    canSubmit: state.interview.status === 'talking' && INTERVIEW.questions.every(question => !question.required || state.interview.clues.includes(question.id)),
    canHandIn: state.phase === 'shift' && state.interview.status === 'local',
    canDate: state.phase === 'evening' && state.date.status === 'accepted',
    canFinish: state.phase === 'evening' && state.scene === 'home' && state.interview.status === 'accepted',
    dateChoices: state.date.status === 'talking' ? DATE_SCENE.choices : [],
    outcome: {
      work: state.interview.status === 'accepted' ? 'Первая анкета принята' : 'Первая анкета ещё впереди',
      home: state.homeItems.length ? SHOP.filter(item => state.homeItems.includes(item.id)).map(item => item.name).join(' и ') : 'Есть планы для дома',
      romance: state.date.status === 'met' ? state.date.bond === 'spark' ? 'С Максом появилась искра' : 'С Максом стало спокойнее и ближе' : 'Вечер в своём ритме',
      next: 'Следующая глава: самостоятельный маршрут и новые соседи',
    },
  };
}

/** Rebuild rules and authored messages from a bounded valid event history. */
export function validateLife(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== VERSION || value.episodeId !== 'first-day' || value.heroId !== HERO.id || !Array.isArray(value.events) || value.events.length > MAX_EVENTS) return null;
    let safe = createLife();
    for (const event of value.events) {
      const action = canonicalAction(event);
      if (!action) return null;
      const next = reduceLife(safe, action);
      if (next.events.length !== safe.events.length + 1) return null;
      safe = next;
    }
    // Critical state cannot be altered independently of the actions that earned it.
    // Authored dialogue is presentation: rebuild it so copy edits preserve v2 saves.
    for (const key of ['day', 'phase', 'scene', 'currentSpot', 'time', 'coins', 'energy', 'xp', 'outfit', 'flags', 'homeItems']) {
      if (JSON.stringify(value[key]) !== JSON.stringify(safe[key])) return null;
    }
    const sameFields = (stored, canonical, fields) => fields.every(key => JSON.stringify(stored?.[key]) === JSON.stringify(canonical[key]));
    if (!sameFields(value.interview, safe.interview, ['status', 'clues', 'answers'])) return null;
    if (!sameFields(value.date, safe.date, ['status', 'choiceId', 'bond'])) return null;
    for (const thread of CHAT_THREADS) {
      if (!sameFields(value.chats?.[thread.id], safe.chats[thread.id], ['choiceId', 'unread'])) return null;
    }
    safe.notice = '';
    return safe;
  } catch {
    return null;
  }
}
