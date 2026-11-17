/** Optional, authored conversations. They never change questionnaire facts or payment. */
export const NPC_SPOTS = Object.freeze({
  vera: 'mentor',
  max: 'bench',
  'resident-1': 'npc:resident-1',
  'resident-2': 'npc:resident-2',
  kira: null,
  ilya: 'respondent',
  anton: 'respondent',
  dima: 'respondent',
});
export const NPC_EXTRA_SPOTS = Object.freeze(['npc:resident-1', 'npc:resident-2']);

const paid = state => state.interview.status === 'accepted';
const anyTime = () => true;
const NPCS = {
  vera: {
    name: 'Вера', role: 'Наставница', kind: 'branch', color: '#8eab8f',
    stages: [
      {
        id: 'mentorship', when: state => state.flags.mentorMet,
        waiting: 'Сначала познакомьтесь с Верой и получите первое задание.',
        opening: state => paid(state) ? 'Первый адрес уже позади. Что тебе особенно хочется обсудить?' : 'Перед первым адресом можно спокойно задать любой вопрос. Что сейчас волнует?',
        choices: [
          {id: 'ask-help', label: 'Что делать, если ответ человека непонятен?', reply: 'Уточни своими словами и дай человеку договорить. Лучше переспросить, чем додумать за него.', summary: 'Вера поддержала привычку уточнять непонятное.'},
          {id: 'own-pace', label: 'Хочу попробовать сама, но без спешки.', reply: 'Так и сделаем. Я рядом. Спокойный разговор важнее попытки выглядеть опытнее, чем ты сейчас есть.', summary: 'Вера дала Анне пространство попробовать самой.'},
        ],
      },
      {
        id: 'reflection', when: paid,
        waiting: 'После принятия анкеты можно обсудить с Верой первый опыт.',
        opening: 'Анкета принята. Теперь можно выдохнуть. Что заберёшь из этого дня с собой?',
        choices: [
          {id: 'remember-clarity', label: 'Одного адреса недостаточно, чтобы понять состав хозяйств.', reply: 'Да. Даже братья в одной квартире могут вести разные хозяйства. Ты не стала делать вывод по первому впечатлению.', summary: 'С Верой разобрали важность уточняющих вопросов.'},
          {id: 'ask-surveys', label: 'Мне интересно попробовать и другие обследования.', reply: 'У них будут свои вопросы и правила отбора. Хороший интерес. А сегодня ты уже сделала первый шаг — остальное разберём по мере работы.', summary: 'Анна рассказала Вере об интересе к другим обследованиям.'},
        ],
      },
    ],
  },
  max: {
    name: 'Макс', role: 'Знакомый · 27 лет', kind: 'branch', color: '#b99b7a',
    stages: [
      {
        id: 'next-plan', when: state => state.date.status === 'met',
        waiting: 'Сначала договоритесь о прогулке в чате и проведите первую встречу.',
        opening: 'Мне нравится, что мы наконец выбрались вместе. Какой следующий вечер тебе был бы по душе?',
        choices: [
          {id: 'next-walk', label: 'Ещё одна прогулка, только новым маршрутом.', reply: 'Тогда я посмотрю, куда можно свернуть с нашей улицы. А маршрут выберем вместе.', summary: 'С Максом выбрали идею ещё одной прогулки.'},
          {id: 'home-coffee', label: 'Когда обустроюсь, можно устроить спокойный вечер с кофе.', reply: 'Мне нравится эта идея. Без большой подготовки и попытки всё сделать идеально.', summary: 'С Максом обсудили спокойный вечер с кофе.'},
        ],
      },
      {
        id: 'pace', when: state => state.date.status === 'met',
        waiting: 'Продолжить разговор можно после первой встречи.',
        opening: 'Договорились. Только не хочу превратить приятную идею в ещё один пункт твоего расписания.',
        choices: [
          {id: 'make-time', label: 'Я сама напишу, когда пойму, какой вечер свободен.', reply: 'Хорошо. Тогда жду твоего сообщения. Сегодня уже было здорово.', summary: 'Анна сама выберет время следующей встречи.'},
          {id: 'keep-easy', label: 'Давай пока без точной даты. Мне хорошо и так.', reply: 'Конечно. Можно не торопиться. Я рад, что мы поговорили.', summary: 'Анна и Макс решили не торопить знакомство.'},
        ],
      },
    ],
  },
  'resident-1': {
    name: 'Николай', role: 'Сосед на прогулке', kind: 'brief', color: '#c5a468',
    stages: [{
      id: 'courtyard-hello', when: anyTime,
      opening: 'Здравствуйте! Новое лицо во дворе. Я Николай. Обычно делаю здесь круг перед чаем.',
      choices: [
        {id: 'say-first-day', label: 'Я Анна. Сегодня мой первый рабочий день здесь.', reply: 'Тогда хорошего начала, Анна. Не буду задерживать — у вас свой маршрут, у меня свой круг.', summary: 'Познакомились с Николаем и пожелали друг другу хорошего дня.'},
        {id: 'notice-courtyard', label: 'У вас уютный двор. Уже хочется запомнить его.', reply: 'Он особенно хорош, когда деревья дают тень. Осваивайтесь. А я пойду — чай сам себя не выпьет.', summary: 'Перекинулись с Николаем парой слов о дворе.'},
      ],
    }],
  },
  'resident-2': {
    name: 'Денис', role: 'Сосед', kind: 'branch', color: '#7caaa1',
    stages: [
      {
        id: 'neighbor-intro', when: anyTime,
        opening: 'Привет. Кажется, мы раньше не встречались. Я Денис, живу в соседнем подъезде.',
        choices: [
          {id: 'new-neighbor', label: 'Я Анна. Ещё привыкаю к этому району.', reply: 'Тогда добро пожаловать. Здесь люди быстро становятся знакомыми лицами — даже без общего чата.', summary: 'Денис узнал, что Анна осваивается в районе.'},
          {id: 'on-the-job', label: 'Сегодня я здесь на первом рабочем задании.', reply: 'Удачи. Я сначала тоже всё путал между подъездами. Теперь ноги сами знают дорогу.', summary: 'Денис пожелал Анне удачи на первом задании.'},
        ],
      },
      {
        id: 'after-work', when: paid,
        waiting: 'После работы можно снова встретить Дениса и продолжить знакомство.',
        opening: state => state.social?.['resident-2']?.[0] === 'new-neighbor' ? 'Снова привет, Анна. За день район стал хоть немного знакомее?' : 'Анна, привет ещё раз. Как первое рабочее задание?',
        choices: [
          {id: 'share-day', label: 'Рассказать, что первая анкета уже принята.', reply: 'Значит, у этого двора для тебя теперь есть первая история. В следующий раз будет проще начинать разговор.', summary: 'Денис запомнил первый рабочий успех Анны.'},
          {id: 'ask-neighbor-life', label: 'Спросить, чем соседи обычно занимаются вечерами.', reply: 'Кто-то гуляет, кто-то выносит книгу на скамейку. Можно просто начать здороваться — дальше разговоры находятся сами.', summary: 'Денис рассказал Анне о повседневной жизни соседей.'},
        ],
      },
    ],
  },
  kira: {
    name: 'Кира', role: 'Подруга · в телефоне', kind: 'branch', color: '#c78799',
    stages: [{
      id: 'evening-reaction',
      when: state => state.chats.friend.choiceId !== null && paid(state),
      waiting: state => state.chats.friend.choiceId === null ? 'Сначала ответь на утреннее сообщение Киры в чате.' : 'Кира ждёт вечернего рассказа после первой рабочей анкеты.',
      opening: 'Ну что, первый день позади? Я помню, как ты утром собиралась. Что хочется рассказать первым?',
      choices: [
        {id: 'share-work', label: 'Рассказать про братьев и первую принятую анкету.', reply: 'Вот это уже настоящая история первого дня. Сохрани её в памяти — потом будет с чем сравнить свой опыт.', summary: 'Кира услышала историю первой анкеты Анны.'},
        {id: 'share-evening', label: 'Рассказать, как провожу вечер для себя.', reply: 'Хорошо, что день не заканчивается только работой. Дом, люди рядом, свои планы — всё это тоже твоя жизнь.', summary: 'Кира поддержала личные планы Анны на вечер.'},
      ],
    }],
  },
  ilya: {
    name: 'Илья', role: 'Постоянный житель', kind: 'brief', color: '#cba56a',
    stages: [{
      id: 'ilya-smalltalk', when: anyTime,
      opening: 'Пока Антон ищет зарядку, можно пару слов не про анкету.',
      choices: [{id: 'ilya-labels', label: 'Заметить подписи на вещах и полках.', reply: 'Это у нас способ не тратить утро на спор «чья зарядка». Смешно выглядит, зато работает.', summary: 'Илья рассказал про домашние подписи на вещах.'}],
    }],
  },
  anton: {
    name: 'Антон', role: 'Постоянный житель', kind: 'brief', color: '#7fa49a',
    stages: [{
      id: 'anton-smalltalk', when: anyTime,
      opening: 'Зарядка нашлась. И да, на ней действительно моя наклейка.',
      choices: [{id: 'anton-stickers', label: 'Спросить, чья была идея с наклейками.', reply: 'Моя. Я люблю, когда бытовые мелочи решаются один раз, а потом можно о них не думать.', summary: 'Антон объяснил свою систему бытовых мелочей.'}],
    }],
  },
  dima: {
    name: 'Дима', role: 'Гость', kind: 'brief', color: '#bd8e83',
    stages: [{
      id: 'guest-goodbye', when: anyTime,
      opening: 'Я тут только в гостях: кофе, разговор — и дальше по своим делам.',
      choices: [{id: 'dima-goodbye', label: 'Пожелать хорошего дня.', reply: 'Спасибо, и тебе удачного первого дня. Всё, допиваю кофе и ухожу. Не буду мешать вашему разговору.', summary: 'Попрощались с Димой. У него нет отдельного поручения.'}],
    }],
  },
};

export { NPCS as NPC_DIALOGUE };
export const NPC_IDS = Object.freeze(Object.keys(NPCS));
export function createSocial() {
  return Object.fromEntries(NPC_IDS.map(id => [id, []]));
}
const text = (value, state) => typeof value === 'function' ? value(state) : value;

function reachability(state, id) {
  if (!state.flags.awake) return {reachable: false, reason: 'Сначала нужно проснуться.'};
  if (state.phase === 'complete') return {reachable: false, reason: 'Первый день завершён. Можно перечитать состоявшиеся разговоры.'};
  if (id === 'kira') return {reachable: true, reason: ''};
  if (state.scene !== 'district' || !['shift', 'evening'].includes(state.phase)) return {reachable: false, reason: 'Этот человек находится во дворе.'};
  if (state.currentSpot !== NPC_SPOTS[id]) return {reachable: false, reason: 'Сначала подойди к этому человеку.'};
  if (id === 'max' && state.phase !== 'evening') return {reachable: false, reason: 'Макс свободен для встречи вечером.'};
  if (['ilya', 'anton', 'dima'].includes(id) && (!state.flags.mentorMet || !['ready', 'talking', 'local', 'accepted'].includes(state.interview.status))) {
    return {reachable: false, reason: 'Сначала познакомься с Верой и получи адрес.'};
  }
  return {reachable: true, reason: ''};
}

/** Current playable conversation. Waiting and finished branches expose no fake choices. */
export function getNpcConversation(state, id) {
  if (typeof id !== 'string' || !Object.hasOwn(NPCS, id)) return null;
  const npc = NPCS[id];
  const selected = state.social?.[id] || [];
  const history = selected.map(choiceId => {
    const choice = npc.stages.flatMap(stage => stage.choices).find(item => item.id === choiceId);
    return choice ? {choiceId, label: choice.label, reply: choice.reply, summary: choice.summary} : null;
  }).filter(Boolean);
  const last = history.at(-1);
  const stage = npc.stages[selected.length];
  const access = reachability(state, id);
  const ready = Boolean(stage && stage.when(state));
  const status = !stage ? 'complete' : !access.reachable ? 'unreachable' : ready ? 'ready' : 'waiting';
  const waiting = stage && !ready ? text(stage.waiting, state) : '';
  return {
    id,
    name: npc.name,
    role: npc.role,
    kind: npc.kind,
    color: npc.color,
    avatar: npc.name.charAt(0),
    spotId: NPC_SPOTS[id],
    scene: id === 'kira' ? 'phone' : 'district',
    stageId: stage?.id || 'finished',
    status,
    reachable: access.reachable,
    reason: access.reason || waiting || '',
    nextHint: waiting,
    opening: !stage ? last?.reply || 'На сегодня всё.' : ready ? text(stage.opening, state) : last?.reply || waiting,
    choices: status === 'ready' ? stage.choices.map(({id: choiceId, label}) => ({id: choiceId, label})) : [],
    lastReply: last?.reply || '',
    history,
    summary: last?.summary || 'Ещё не общались.',
  };
}

/** Returns a new social state, leaving questionnaires, income and other rules untouched. */
export function applyNpcTalk(state, {npcId, choiceId}) {
  const conversation = getNpcConversation(state, npcId);
  if (!conversation) return {ok: false, notice: 'Такого собеседника нет.'};
  const choice = conversation.choices.find(item => item.id === choiceId);
  if (!choice) return {ok: false, notice: conversation.reason || (conversation.status === 'complete' ? 'Этот разговор уже завершён.' : 'Такого ответа сейчас нет.')};
  const social = structuredClone(state.social || createSocial());
  social[npcId].push(choice.id);
  return {ok: true, social, notice: ''};
}
