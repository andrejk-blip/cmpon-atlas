import { CAMPAIGNS, STAFF } from './campaign.js';

export const SAVE_VERSION = 1;
const clone = value => JSON.parse(JSON.stringify(value));
const validStatuses = new Set(['new', 'assigned', 'visiting', 'saved', 'sent', 'accepted', 'refusal']);
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const terminal = task => task.status === 'accepted' || (task.status === 'refusal' && task.transmission === 'accepted');

export function createGame(campaignId = 'courtyard', completedCampaigns = []) {
  const campaign = CAMPAIGNS[campaignId] || CAMPAIGNS.courtyard;
  return {
    version: SAVE_VERSION, campaignId: campaign.id, phase: 'intro', day: 1, time: 960,
    selectedTaskId: campaign.tasks[0].id, completedCampaigns: [...completedCampaigns],
    staff: clone(STAFF).map(person => ({ ...person, role: campaign.mode === 'sample' ? 'Интервьюер' : person.role })),
    tasks: clone(campaign.tasks).map(task => ({ ...task, assignedTo: task.assignedTo || null,
      appointment: task.appointment ?? null, status: task.assignedTo ? 'assigned' : 'new',
      clues: [], answers: null, outcome: null, transmission: null, history: [], contacted: false })),
    messages: [{ id: 'briefing', channel: 'team', author: 'Координатор', text: campaign.briefing, day: 1, time: 960 }],
    flags: { illness: false }, log: [], notice: '',
  };
}

function message(state, channel, author, text) {
  state.messages.push({ id: `m-${state.messages.length}`, channel, author, text, day: state.day, time: state.time });
}
function history(state, task, text) {
  task.history.push({ day: state.day, time: state.time, text });
  state.log.push({ taskId: task.id, day: state.day, time: state.time, text });
}
function illness(state) {
  if (state.campaignId !== 'courtyard' || state.flags.illness) return;
  state.flags.illness = true;
  state.staff.find(person => person.id === 'lera').available = false;
  message(state, 'team', 'Лена', 'Мне стало нехорошо, сегодня больше не смогу работать. Передайте мои оставшиеся задания, пожалуйста. Время встреч и все заметки сохранены.');
}

/** Pure deterministic game commands; does not read DOM, storage, network, or real time. */
export function dispatch(current, action) {
  if (!current || !action || typeof action.type !== 'string') return current;
  if (action.type === 'RESTART') return createGame();
  const state = clone(current);
  state.notice = '';
  const task = state.tasks.find(item => item.id === (action.taskId || state.selectedTaskId));
  const fail = text => { state.notice = text; return state; };
  const requireTask = () => task && !terminal(task);
  switch (action.type) {
    case 'START': state.phase = 'district'; break;
    case 'SELECT_TASK':
      if (!task) return fail('Этого адреса нет в задании. Произвольная замена адреса недоступна.');
      state.selectedTaskId = task.id;
      state.phase = task.status === 'visiting' ? 'visit' : 'district';
      break;
    case 'ASSIGN': {
      if (!requireTask() || ['saved', 'sent', 'refusal'].includes(task.status)) return fail('Это задание уже завершено в поле.');
      const person = state.staff.find(item => item.id === action.staffId);
      if (!person || !person.available) return fail('Сотрудница сейчас недоступна. Выберите другую коллегу.');
      const previous = state.staff.find(item => item.id === task.assignedTo);
      if (previous?.id === person.id) return fail('Задание уже у этой сотрудницы.');
      task.assignedTo = person.id;
      if (task.status === 'new') task.status = 'assigned';
      const text = previous ? `${previous.name} → ${person.name}. Время встречи и история сохранены.` : `Задание назначено: ${person.name}.`;
      history(state, task, text);
      message(state, 'team', person.name, `Беру адрес: ${task.address}.${previous ? ' Договорённость и заметки вижу.' : ''}`);
      state.notice = text;
      break;
    }
    case 'APPOINT': {
      if (!requireTask() || ['saved', 'sent', 'refusal'].includes(task.status)) return fail('Полевой этап этого задания уже завершён.');
      const time = Number(action.time);
      if (!Number.isInteger(time) || time < 540 || time > 1260) return fail('Выберите время с 09:00 до 21:00.');
      if (time < task.availableFrom || time < state.time) return fail(`Договоримся не раньше ${clock(Math.max(task.availableFrom, state.time))}.`);
      task.appointment = time;
      history(state, task, `Встреча назначена на ${clock(time)}.`);
      message(state, task.id, task.name, `Хорошо, договорились на ${clock(time)}. Будем ждать.`);
      state.notice = `Встреча в ${clock(time)} добавлена в расписание.`;
      break;
    }
    case 'VISIT': {
      if (!requireTask() || !['assigned', 'visiting'].includes(task.status)) return fail('Сначала назначьте сотрудницу на этот адрес.');
      const person = state.staff.find(item => item.id === task.assignedTo);
      if (!person?.available) return fail('Назначенная сотрудница заболела. Передайте задание другой коллеге.');
      if (state.tasks.some(item => item.id !== task.id && item.assignedTo === person.id && item.status === 'visiting')) return fail('Эта сотрудница ещё проводит другую беседу. Завершите её или выберите свободную коллегу.');
      const due = Math.max(task.availableFrom, task.appointment ?? 0);
      if (state.time < due) return fail(`Сейчас ещё рано. Встреча возможна с ${clock(due)}. Можно заняться другим адресом или передвинуть игровое время.`);
      state.selectedTaskId = task.id;
      state.phase = 'visit';
      if (task.status !== 'visiting') {
        task.status = 'visiting'; task.contacted = true;
        history(state, task, `Контакт состоялся. ${person.name} начала беседу.`);
        message(state, task.id, task.name, task.opening);
      }
      break;
    }
    case 'ASK': {
      if (!task || task.status !== 'visiting') return fail('Сначала начните встречу.');
      if (!state.staff.find(person => person.id === task.assignedTo)?.available) return fail('Сотрудница недоступна. Передайте незавершённую беседу другой коллеге: ответы сохранятся.');
      const question = task.questions.find(item => item.id === action.questionId);
      if (!question) return fail('Такого вопроса нет в программе.');
      if (task.clues.includes(question.id)) return fail('Этот ответ уже есть в истории беседы.');
      task.clues.push(question.id);
      message(state, task.id, 'Вы', question.label);
      message(state, task.id, task.name, question.reply);
      history(state, task, `Получено уточнение: ${question.label}`);
      break;
    }
    case 'SAVE_FORM': {
      if (!task || task.status !== 'visiting' || task.kind !== 'interview') return fail('Анкета доступна во время интервью.');
      if (!state.staff.find(person => person.id === task.assignedTo)?.available) return fail('Передайте незавершённое задание доступной сотруднице.');
      if (task.questions.some(question => question.required && !task.clues.includes(question.id))) return fail('Сначала уточните обязательные сведения в разговоре. Ответы нельзя определять по внешности или адресу.');
      const answers = action.answers;
      if (!answers || !Number.isInteger(answers.households) || !Number.isInteger(answers.persons)) return fail('Укажите целое число домохозяйств и людей.');
      if (answers.households !== task.expected.households || answers.persons !== task.expected.persons) return fail('Сведения расходятся с ответами собеседника. Проверьте историю: число квартир, семей и домохозяйств может отличаться.');
      task.answers = { households: answers.households, persons: answers.persons };
      task.status = 'saved'; task.outcome = 'interview'; task.transmission = 'local';
      history(state, task, 'Анкета сохранена на устройстве. Ещё не передана и не проверена.');
      state.time = Math.min(1260, state.time + 20); state.phase = 'district';
      state.notice = 'Ответы сохранены на устройстве. Передайте их при восстановлении связи.';
      illness(state);
      break;
    }
    case 'RECORD_REFUSAL':
      if (!task || task.kind !== 'refusal' || task.status !== 'visiting' || !task.clues.includes('purpose')) return fail('Сначала объясните цель опроса и выслушайте решение человека.');
      if (!state.staff.find(person => person.id === task.assignedTo)?.available) return fail('Передайте незавершённое задание доступной сотруднице.');
      task.status = 'refusal'; task.outcome = 'refusal'; task.transmission = 'local'; task.answers = null;
      history(state, task, 'Отказ зафиксирован со слов человека. Ответы анкеты не создавались.');
      state.time = Math.min(1260, state.time + 10); state.phase = 'district';
      state.notice = 'Решение человека зафиксировано. Передайте результат вместе с остальными материалами.';
      break;
    case 'SYNC': {
      let count = 0;
      for (const item of state.tasks) {
        if (item.status === 'saved' || (item.status === 'refusal' && item.transmission === 'local')) {
          if (item.status === 'saved') item.status = 'sent';
          item.transmission = 'sent'; count++;
          history(state, item, 'Материалы переданы в общую базу. Ожидают проверки.');
        }
      }
      state.notice = count ? `Передано материалов: ${count}. Теперь доступна проверка.` : 'Нет новых материалов для передачи.';
      if (count) message(state, 'headquarters', 'Система сбора', `Получено материалов: ${count}. Передача ещё не означает завершение проверки.`);
      break;
    }
    case 'CHECK': {
      let count = 0;
      for (const item of state.tasks) {
        if (item.status === 'sent' || (item.status === 'refusal' && item.transmission === 'sent')) {
          if (item.status === 'sent') item.status = 'accepted';
          item.transmission = 'accepted'; count++;
          history(state, item, item.outcome === 'refusal' ? 'Статус отказа принят после проверки. Ответом на анкету не считается.' : 'Анкета прошла проверку и принята.');
        }
      }
      state.notice = count ? `Проверка завершена: ${count}.` : 'Сначала передайте сохранённые материалы.';
      if (count) message(state, 'headquarters', 'Контролёр', `Принято материалов: ${count}. Ответы и неответы учитываются отдельно.`);
      break;
    }
    case 'ADVANCE':
      if (state.time >= 1260) return fail('Рабочий день закончился. Можно перейти к следующему дню.');
      state.time = Math.min(1260, state.time + 30);
      state.notice = `Игровое время: ${clock(state.time)}.`;
      break;
    case 'NEXT_DAY':
      state.day++; state.time = 960; state.phase = 'district';
      state.notice = 'Новый игровой день. Все договорённости и материалы сохранены.';
      break;
    case 'FINISH':
      if (!state.tasks.every(terminal)) return fail('Сначала завершите работу по адресам, передайте материалы и выполните проверку.');
      state.phase = 'summary';
      if (!state.completedCampaigns.includes(state.campaignId)) state.completedCampaigns.push(state.campaignId);
      break;
    case 'NEXT_CAMPAIGN':
      if (state.campaignId !== 'courtyard' || !state.completedCampaigns.includes('courtyard')) return fail('Сначала завершите первую главу.');
      return createGame('sample', state.completedCampaigns);
    default: return fail('Неизвестное действие.');
  }
  return state;
}

export function getView(state) {
  const campaign = CAMPAIGNS[state.campaignId];
  const selectedTask = state.tasks.find(task => task.id === state.selectedTaskId) || state.tasks[0];
  const summary = {
    total: state.tasks.length,
    accepted: state.tasks.filter(task => task.status === 'accepted').length,
    saved: state.tasks.filter(task => task.transmission === 'local').length,
    sent: state.tasks.filter(task => task.transmission === 'sent').length,
    refusal: state.tasks.filter(task => task.outcome === 'refusal').length,
    contacted: state.tasks.filter(task => task.contacted).length,
    processed: state.tasks.filter(terminal).length,
    households: state.tasks.filter(task => task.status === 'accepted').reduce((sum, task) => sum + task.answers.households, 0),
    persons: state.tasks.filter(task => task.status === 'accepted').reduce((sum, task) => sum + task.answers.persons, 0),
    complete: state.tasks.every(terminal),
  };
  let nextObjective = 'Назначьте коллегу на адрес и договоритесь о времени встречи.';
  if (summary.complete) nextObjective = 'Все результаты проверены. Подведите итоги главы.';
  else if (summary.sent) nextObjective = 'Переданные материалы ждут проверки.';
  else if (summary.saved) nextObjective = 'На устройствах есть материалы. Передайте их в общую базу.';
  else if (state.tasks.some(task => task.assignedTo === 'lera' && !state.staff.find(person => person.id === 'lera').available && !terminal(task) && ['assigned', 'visiting'].includes(task.status))) nextObjective = 'Лена заболела. Передайте оставшееся задание другой коллеге.';
  else if (selectedTask.status === 'visiting') nextObjective = 'Уточните сведения в разговоре, затем заполните анкету.';
  else if (selectedTask.assignedTo) nextObjective = state.time < Math.max(selectedTask.availableFrom, selectedTask.appointment || 0) ? 'До встречи есть время. Займитесь другим адресом или нажмите «+30 минут».' : 'Сотрудница назначена. Можно начать встречу.';
  return { campaign, selectedTask, summary, clock: clock(state.time), nextObjective,
    availableQuestions: selectedTask.questions.filter(question => !selectedTask.clues.includes(question.id)),
    canSync: summary.saved > 0, canCheck: summary.sent > 0, canFinish: summary.complete,
  };
}

/** Accept JSON string or object. Return a reconstructed safe state, or null. */
export function validateSave(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== SAVE_VERSION || !CAMPAIGNS[value.campaignId]) return null;
    if (!['intro', 'district', 'visit', 'summary'].includes(value.phase) || !Number.isInteger(value.day) || value.day < 1 || value.day > 9999 || !Number.isInteger(value.time) || value.time < 540 || value.time > 1260) return null;
    if (!Array.isArray(value.completedCampaigns) || value.completedCampaigns.some(id => !CAMPAIGNS[id])) return null;
    if (value.campaignId === 'sample' && !value.completedCampaigns.includes('courtyard')) return null;
    const safe = createGame(value.campaignId, [...new Set(value.completedCampaigns)]);
    if (!Array.isArray(value.tasks) || value.tasks.length !== safe.tasks.length || new Set(value.tasks.map(task => task.id)).size !== safe.tasks.length) return null;
    if (!safe.tasks.some(task => task.id === value.selectedTaskId)) return null;
    const safeText = text => typeof text === 'string' && text.length <= 2000;
    const safeHistory = list => Array.isArray(list) && list.length <= 1000 && list.every(row => row && safeText(row.text) && Number.isInteger(row.day) && row.day >= 1 && Number.isInteger(row.time) && row.time >= 540 && row.time <= 1260);
    for (const target of safe.tasks) {
      const source = value.tasks.find(task => task.id === target.id);
      if (!source || !validStatuses.has(source.status) || (source.assignedTo !== null && !STAFF.some(person => person.id === source.assignedTo))) return null;
      if (source.appointment !== null && (!Number.isInteger(source.appointment) || source.appointment < target.availableFrom || source.appointment > 1260)) return null;
      if (!Array.isArray(source.clues) || source.clues.some(id => !target.questions.some(question => question.id === id)) || !safeHistory(source.history)) return null;
      if (![null, 'local', 'sent', 'accepted'].includes(source.transmission) || ![null, 'interview', 'refusal'].includes(source.outcome) || typeof source.contacted !== 'boolean') return null;
      const hasForm = ['saved', 'sent', 'accepted'].includes(source.status);
      if (hasForm && (target.kind !== 'interview' || !source.answers || source.answers.households !== target.expected.households || source.answers.persons !== target.expected.persons || source.outcome !== 'interview' || target.questions.some(q => q.required && !source.clues.includes(q.id)))) return null;
      if (hasForm && source.transmission !== ({saved:'local',sent:'sent',accepted:'accepted'})[source.status]) return null;
      if (source.status === 'refusal' && (target.kind !== 'refusal' || source.outcome !== 'refusal' || source.answers !== null || source.transmission === null || !source.clues.includes('purpose'))) return null;
      if (!hasForm && source.status !== 'refusal' && (source.answers !== null || source.outcome !== null || source.transmission !== null)) return null;
      if (['assigned', 'visiting', 'saved', 'sent', 'accepted', 'refusal'].includes(source.status) && !source.assignedTo) return null;
      if (['visiting', 'saved', 'sent', 'accepted', 'refusal'].includes(source.status) && !source.contacted) return null;
      Object.assign(target, { assignedTo: source.assignedTo, appointment: source.appointment, status: source.status,
        clues: [...new Set(source.clues)], answers: hasForm ? { households: source.answers.households, persons: source.answers.persons } : null,
        outcome: source.outcome, transmission: source.transmission, contacted: source.contacted,
        history: source.history.map(row => ({ day: row.day, time: row.time, text: row.text })),
      });
    }
    if (!Array.isArray(value.staff) || value.staff.length !== STAFF.length || !safe.staff.every(person => value.staff.some(item => item.id === person.id && typeof item.available === 'boolean'))) return null;
    for (const person of safe.staff) person.available = value.staff.find(item => item.id === person.id).available;
    if (!value.flags || typeof value.flags.illness !== 'boolean') return null;
    if (!Array.isArray(value.messages) || value.messages.length > 2000 || !value.messages.every(row => row && safeText(row.text) && safeText(row.author) && safeText(row.channel) && Number.isInteger(row.day) && Number.isInteger(row.time))) return null;
    safe.messages = value.messages.map((row, index) => ({ id: `m-${index}`, channel: row.channel, author: row.author, text: row.text, day: row.day, time: row.time }));
    if (!safeHistory(value.log)) return null;
    safe.log = value.log.map(row => ({taskId: safe.tasks.some(task => task.id === row.taskId) ? row.taskId : '', day: row.day, time: row.time, text: row.text}));
    Object.assign(safe, { phase: value.phase, day: value.day, time: value.time, selectedTaskId: value.selectedTaskId, flags: { illness: value.flags.illness }, notice: '' });
    if (safe.phase === 'summary' && !safe.tasks.every(terminal)) return null;
    return safe;
  } catch { return null; }
}
