import { createGame, dispatch, getView, validateSave } from './engine.js';
import { platform } from './platform.js';
import { createWorld, commandMove, stepWorld, TASK_NODES, NODES } from './world.js';
import { createScene } from './scene.js';
const $ = s => document.querySelector(s),
  escape = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
let state = validateSave(platform.load()),
  fresh = !state;
if (!state) {
  state = createGame();
  state.time = 1080;
}
let world = createWorld(),
  selected = 'anna',
  paused = false,
  speed = 1,
  dialog = null,
  clock = 0,
  last = 0,
  toastTimer,
  saveFailed = false;
let prefs = {
    ...platform.preferences()
  },
  answer = {
    households: 1,
    persons: 1
  };
if (prefs.reducedMotion === undefined) prefs.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
$('#app').innerHTML = `<main class="game"><div id="viewport" aria-label="Двор. Выберите героиню, затем дом. Перетаскивайте карту для обзора."></div>
<header class="hud"><div class="brand"><b>Переписка<span>✳︎</span></b><small id="chapter"></small></div><div class="progress"><span class="progress-icon">⌂</span><strong id="count">0 / 4</strong><span class="progress-caption">адреса</span><div class="progress-track"><i id="progress-fill"></i></div></div><div class="time-controls"><span id="clock"></span><button id="pause" class="icon-button" aria-label="Пауза">II</button><button id="speed" aria-label="Изменить скорость">1×</button><button id="settings" class="icon-button" aria-label="Настройки">⚙︎</button></div></header>
<div class="world-title"><span id="district">Лесная улица</span><small>Счётный участок 04</small></div>
<div class="camera-controls"><button id="zoom-in" aria-label="Приблизить">+</button><button id="zoom-out" aria-label="Отдалить">−</button><button id="center" aria-label="Найти выбранную героиню">⌖</button></div>
<nav id="mini-map" class="mini-map" aria-label="Карта адресов участка"></nav>
<div id="waiting" class="waiting"></div><div id="hint" class="hint">Выберите героиню и нажмите на дом</div>
<footer class="team-bar"><div id="team" class="team"></div><button id="finish" class="finish-button" hidden>Двор готов! →</button><button id="help" class="help-button" aria-label="Как играть">?</button></footer>
<div id="modal-root"></div></main>`;
let scene = createScene($('#viewport'), world, {
  onGround: moveGround,
  onActor: choose,
  onHouse: visitHouse
});
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
}
function save() {
  if (platform.save(state)) return;
  if (platform.lastSaveError === 'conflict') {
    paused = true;
    dialog = {type: 'conflict'};
    modal(`<h2>Игра продолжена в другой вкладке</h2><p>Там уже есть более свежее сохранение.</p><button id="reload-save" class="primary">Продолжить оттуда →</button>`, 'settings');
    $('#reload-save').onclick = () => location.reload();
  } else if (!saveFailed) {
    saveFailed = true;
    toast('Не удалось сохранить игру на устройстве. Экспорт доступен в настройках.');
  }
}

function act(action) {
  state = dispatch(state, action);
  save();
  refresh();
  return state;
}
function currentTask(id) {
  return state.tasks.find(t => t.id === id);
}
function actor(id) {
  return world.actors.find(a => a.id === id);
}
function finished(t) {
  return t.status === 'accepted' || t.transmission === 'accepted';
}
function taskForActor(id) {
  return state.tasks.find(t => t.assignedTo === id && t.status === 'visiting');
}
function labelFor(s) {
  const a = actor(s.id);
  if (!s.available) return 'Отдыхает';
  if (a.moving) return a.destination === 'base' ? 'В штаб' : 'В пути';
  if (taskForActor(s.id)) return 'У двери';
  if (a.taskId && currentTask(a.taskId) && !finished(currentTask(a.taskId))) return 'Ждёт встречи';
  return s.role;
}
function refresh() {
  const v = getView(state);
  $('#chapter').textContent = v.campaign.mode === 'sample' ? 'Выборочное обследование' : 'Перепись населения';
  $('#count').textContent = `${v.summary.processed} / ${v.summary.total}`;
  $('#progress-fill').style.width = 100 * v.summary.processed / v.summary.total + '%';
  $('#clock').textContent = v.clock;
  $('#finish').hidden = !v.canFinish;
  $('#team').innerHTML = state.staff.map(s => `<button class="staff-card ${s.id === selected ? 'selected' : ''} ${!s.available ? 'unavailable' : ''}" data-staff="${s.id}" aria-pressed="${s.id === selected}"><span class="portrait p${s.portraitIndex}"></span><span><b>${s.name}</b><small>${labelFor(s)}</small></span>${s.id === selected ? '<i>✓</i>' : ''}</button>`).join('');
  $('#team').querySelectorAll('[data-staff]').forEach(b => b.onclick = () => choose(b.dataset.staff));
  $('#pause').textContent = paused ? '▶' : 'II';
  $('#pause').setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
  $('#speed').textContent = speed + '×';
  scene.update({
    selected,
    tasks: state.tasks,
    staff: state.staff,
    reduced: prefs.reducedMotion
  });
  const a = actor(selected),
    person = state.staff.find(s => s.id === selected);
  $('#hint').textContent = !person.available ? 'Выберите коллегу, чтобы передать ей встречу' : a.moving ? a.destination === 'base' ? 'Результат на планшете. Героиня идёт к штабу' : `${person.name} идёт к подъезду` : a.status === 'waiting' ? 'Ждём назначенного времени. Можно заняться другим адресом' : taskForActor(selected) ? 'Нажмите на героиню, чтобы продолжить разговор' : 'Нажмите на дом или на дорожку';
  $('#mini-map').innerHTML = state.tasks.map((task, i) => {
    const point = NODES[TASK_NODES[task.id]];
    return `<button data-mini-house="${task.id}" class="${finished(task) ? 'done' : ''}" style="left:${point.x / 10}%;top:${point.y / 7}%" aria-label="На карте: ${escape(task.name)}">${finished(task) ? '✓' : i + 1}</button>`;
  }).join('');
  $('#mini-map').querySelectorAll('button').forEach(button => button.onclick = () => {
    visitHouse(button.dataset.miniHouse);
    scene.center();
  });
  renderWaiting();
  scene.draw();
}
function choose(id) {
  if (dialog) return;
  selected = id;
  refresh();
  scene.center();
  const t = taskForActor(id);
  if (t && actor(id).node === TASK_NODES[t.id] && !actor(id).moving) openConversation(t.id);else if (!state.staff.find(s => s.id === id).available) toast('Лена заболела. Выберите коллегу и её адрес — задание перейдёт ей.');
}
function ensureFree() {
  const s = state.staff.find(s => s.id === selected);
  if (!s.available) {
    toast(`${s.name} сегодня отдыхает. Выберите другую героиню.`);
    return false;
  }
  const t = taskForActor(selected);
  if (t) {
    const a = actor(selected);
    if (!a.moving && a.node === TASK_NODES[t.id]) openConversation(t.id);else toast('Сначала дождитесь прибытия к подъезду.');
    return false;
  }
  const carried = state.tasks.find(t => t.assignedTo === selected && t.transmission === 'local');
  if (carried) {
    toast('Сначала героиня передаст результат в штабе.');
    return false;
  }
  return true;
}
function moveGround(node) {
  if (dialog || !ensureFree()) return;
  commandMove(world, selected, node);
  $('#hint').textContent = 'Нажмите на дом, чтобы назначить встречу';
  refresh();
}
function visitHouse(id) {
  if (dialog) return;
  const t = currentTask(id);
  if (finished(t)) {
    toast('Этот адрес уже обработан');
    return;
  }
  const at = actor(t.assignedTo);
  if (t.status === 'visiting' && at && !at.moving && at.node === TASK_NODES[id] && state.staff.find(s => s.id === t.assignedTo)?.available) {
    selected = t.assignedTo;
    openConversation(id);
    return;
  }
  if (!ensureFree()) return;
  if (t.transmission === 'local' || t.transmission === 'sent') {
    toast('Результат уже собран и направляется в штаб');
    return;
  }
  const old = t.assignedTo;
  act({
    type: 'ASSIGN',
    taskId: id,
    staffId: selected
  });
  if (currentTask(id).assignedTo !== selected) {
    toast(state.notice);
    return;
  }
  if (old && old !== selected && actor(old)?.taskId === id) commandMove(world, old, 'base');
  commandMove(world, selected, TASK_NODES[id], {
    taskId: id
  });
  $('#hint').textContent = `${state.staff.find(s => s.id === selected).name} идёт к подъезду`;
  refresh();
}
function arrive(event) {
  const a = actor(event.actorId);
  if (a.type !== 'staff') return;
  const t = currentTask(event.taskId);
  if (!t) {
    refresh();
    return;
  }
  if (t.assignedTo !== a.id) return;
  if (event.nodeId === 'base' && ['local', 'sent'].includes(t.transmission)) {
    act({
      type: 'SYNC',
      taskId: t.id
    });
    act({
      type: 'CHECK',
      taskId: t.id
    });
    a.taskId = null;
    const next = state.tasks.find(item => item.assignedTo === a.id && ['local', 'sent'].includes(item.transmission));
    if (next) commandMove(world, a.id, 'base', {
      taskId: next.id
    });
    toast('Результат передан и проверен ✓');
    if (getView(state).canFinish) showResult();
    return;
  }
  if (event.nodeId === TASK_NODES[t.id]) attemptEncounter(t, a);
  refresh();
}
function attemptEncounter(t, a) {
  if (!state.staff.find(s => s.id === a.id).available) {
    commandMove(world, a.id, 'base');
    return;
  }
  if (state.time < Math.max(t.availableFrom, t.appointment || 0)) {
    a.status = 'waiting';
    if (a.id === selected) toast(`Встреча в ${formatTime(Math.max(t.availableFrom, t.appointment || 0))}. Можно заняться другим адресом.`);
    return;
  }
  act({
    type: 'VISIT',
    taskId: t.id
  });
  if (currentTask(t.id).status === 'visiting') {
    a.status = 'conversation';
    if (a.id === selected && !dialog) openConversation(t.id);else toast(`${state.staff.find(s => s.id === a.id).name} ждёт вас у двери`);
  }
}
function renderWaiting() {
  const waiting = world.actors.filter(a => a.type === 'staff' && !a.moving && a.taskId && currentTask(a.taskId)?.status === 'visiting');
  $('#waiting').innerHTML = waiting.filter(a => a.id !== selected).map(a => `<button data-wait="${a.id}"><span>···</span>${state.staff.find(s => s.id === a.id).name}</button>`).join('');
  $('#waiting').querySelectorAll('button').forEach(b => b.onclick = () => choose(b.dataset.wait));
}
function formatTime(t) {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
function modal(html, kind = '') {
  const root = $('#modal-root');
  root.innerHTML = `<div class="scrim ${kind}"><section class="modal ${kind}" role="dialog" aria-modal="true" tabindex="-1">${html}</section></div>`;
  root.querySelector('.modal').focus();
}
function closeModal() {
  if (dialog?.type === 'conflict') return;
  dialog = null;
  $('#modal-root').replaceChildren();
  refresh();
  $('#pause').focus();
}
function openConversation(id) {
  if (dialog?.type === 'conflict') return;
  const t = currentTask(id);
  if (t.status !== 'visiting') return;
  selected = t.assignedTo;
  dialog = {
    type: 'conversation',
    taskId: id,
    screen: 'chat'
  };
  answer = {
    households: 1,
    persons: 1
  };
  refresh();
  renderConversation();
}
function renderConversation() {
  if (dialog?.type !== 'conversation') return;
  const t = currentTask(dialog.taskId),
    s = state.staff.find(s => s.id === t.assignedTo),
    lastQuestion = t.questions.find(q => q.id === t.clues.at(-1)),
    remaining = t.questions.filter(q => !t.clues.includes(q.id));
  const ready = !remaining.some(q => q.required),
    reply = lastQuestion?.reply || t.opening;
  modal(`<div class="conversation-head"><span class="resident-avatar">${t.name.charAt(0)}</span><div><b>${escape(t.name)}</b><small>${escape(t.address)}</small></div><button data-action="close" class="icon-button" aria-label="Вернуться во двор">×</button></div><div class="conversation-body"><span class="conversation-kicker">${dialog.screen === 'form' ? 'Электронная анкета' : 'У двери · ' + s.name}</span>${dialog.screen === 'form' ? `<h2>Кто живёт вместе?</h2><div class="form-counters">${[['households', 'Домохозяйства'], ['persons', 'Человек']].map(([key, label]) => `<div class="counter"><label for="${key}">${label}</label><div><button data-counter="${key}" data-step="-1" aria-label="Уменьшить: ${label}">−</button><input id="${key}" type="number" min="1" max="12" value="${answer[key]}" inputmode="numeric"><button data-counter="${key}" data-step="1" aria-label="Увеличить: ${label}">+</button></div></div>`).join('')}</div><p class="form-hint">${escape(reply)}</p><p id="form-error" role="status"></p><button class="primary" data-action="save">Сохранить на планшет →</button><button class="text-button" data-action="back">Вернуться к разговору</button>` : `<div class="speech-bubble">${escape(reply)}</div><div class="questions">${remaining.map(q => `<button class="question" data-question="${q.id}">${escape(q.label)} <span>↗</span></button>`).join('')}${ready ? `<button class="primary" data-action="${t.kind === 'refusal' ? 'refusal' : 'form'}">${t.kind === 'refusal' ? 'Принять решение и завершить' : 'Заполнить анкету'} →</button>` : ''}</div>`}</div><div class="conversation-footer"><span class="portrait p${s.portraitIndex}"></span><span>${s.name}</span><small>${t.clues.length} / ${t.questions.length} тем</small></div>`, 'conversation');
  $('[data-action="close"]').onclick = closeModal;
  document.querySelectorAll('[data-question]').forEach(b => b.onclick = () => {
    act({
      type: 'ASK',
      taskId: t.id,
      questionId: b.dataset.question
    });
    renderConversation();
  });
  document.querySelectorAll('[data-counter]').forEach(b => b.onclick = () => {
    const input = $('#' + b.dataset.counter);
    input.value = Math.max(1, Math.min(12, Number(input.value) + Number(b.dataset.step)));
  });
  const form = $('[data-action="form"]');
  if (form) form.onclick = () => {
    dialog.screen = 'form';
    renderConversation();
  };
  const back = $('[data-action="back"]');
  if (back) back.onclick = () => {
    answer = {
      households: Number($('#households').value),
      persons: Number($('#persons').value)
    };
    dialog.screen = 'chat';
    renderConversation();
  };
  const saveButton = $('[data-action="save"]');
  if (saveButton) saveButton.onclick = () => {
    act({
      type: 'SAVE_FORM',
      taskId: t.id,
      answers: {
        households: Number($('#households').value),
        persons: Number($('#persons').value)
      }
    });
    if (currentTask(t.id).status !== 'saved') {
      $('#form-error').textContent = state.notice;
      return;
    }
    finishEncounter(t.id);
  };
  const refusal = $('[data-action="refusal"]');
  if (refusal) refusal.onclick = () => {
    act({
      type: 'RECORD_REFUSAL',
      taskId: t.id
    });
    finishEncounter(t.id);
  };
}
function finishEncounter(id) {
  const t = currentTask(id);
  commandMove(world, t.assignedTo, 'base', {
    taskId: id
  });
  closeModal();
  $('#hint').textContent = 'Результат на планшете. Героиня идёт к штабу';
  for (const s of state.staff.filter(s => !s.available)) {
    if (s.id !== t.assignedTo) commandMove(world, s.id, 'base');
  }
  if (state.flags.illness && !prefs.illnessSeen) {
    prefs.illnessSeen = true;
    platform.setPreferences(prefs);
    toast('Лена приболела. Её встречу может провести Нина или Вера.');
  }
  refresh();
}
function showIntro() {
  dialog = {
    type: 'intro'
  };
  modal(`<span class="eyebrow">Ваш первый вечер на участке</span><h1>Здесь все<br>куда-то идут.</h1><p>А вы решаете, кто к кому.</p><div class="intro-steps"><span>① Выберите героиню</span><span>② Нажмите на дом</span><span>③ Поговорите с жителями</span></div><button id="play" class="primary">Пойти во двор →</button><small class="intro-note">Двигайте карту пальцем или мышью</small>`, 'intro');
  $('#play').onclick = () => {
    act({
      type: 'START'
    });
    closeModal();
  };
}
function showResult() {
  if (dialog?.type === 'conflict') return;
  if (state.phase !== 'summary') act({
    type: 'FINISH'
  });
  const v = getView(state);
  dialog = {
    type: 'result'
  };
  modal(`<span class="result-star">✳︎</span><span class="eyebrow">${v.campaign.mode === 'census' ? 'Перепись участка' : 'Выборочное обследование'}</span><h1>Двор готов!</h1><div class="result-stats"><div><b>${v.summary.processed}</b><span>адреса</span></div><div><b>${v.summary.households}</b><span>домохозяйства</span></div><div><b>${v.summary.persons}</b><span>человек</span></div></div>${v.summary.refusal ? '<p>Один отказ учтён отдельно. Ответы не придуманы.</p>' : '<p>Оба адреса выборки обработаны.</p>'}<button id="next" class="primary">${state.campaignId === 'courtyard' ? 'Следующая смена →' : 'Сыграть ещё раз →'}</button><button id="back-world" class="text-button">Побыть во дворе</button>`, 'result');
  $('#next').onclick = () => resetWorld(state.campaignId === 'courtyard' ? 'NEXT_CAMPAIGN' : 'RESTART');
  $('#back-world').onclick = closeModal;
}
function resetWorld(type) {
  platform.acceptCurrentSave();
  act({
    type
  });
  state.time = 1080;
  state = dispatch(state, {
    type: 'START'
  });
  world = createWorld();
  scene.destroy();
  scene = createScene($('#viewport'), world, {
    onGround: moveGround,
    onActor: choose,
    onHouse: visitHouse
  });
  selected = 'anna';
  paused = false;
  clock = 0;
  prefs.illnessSeen = false;
  platform.setPreferences(prefs);
  closeModal();
  save();
  toast(state.campaignId === 'sample' ? 'Сегодня отмечены только два адреса выборки' : 'Новая смена началась');
}
function settings() {
  dialog = {
    type: 'settings'
  };
  modal(`<div class="settings-head"><h2>Передышка</h2><button id="close-settings" class="icon-button" aria-label="Закрыть настройки">×</button></div><label class="setting-row"><span>Меньше декоративных движений</span><input id="motion" type="checkbox" ${prefs.reducedMotion ? 'checked' : ''}></label><button id="export" class="secondary">Скачать сохранение</button><label class="secondary import-label">Загрузить сохранение<input id="import" type="file" accept=".json,application/json"></label><button id="restart" class="text-button">Начать заново</button><small>Прогресс сохраняется на этом устройстве.</small>`, 'settings');
  $('#close-settings').onclick = closeModal;
  $('#motion').onchange = e => {
    prefs.reducedMotion = e.target.checked;
    platform.setPreferences(prefs);
    document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  };
  $('#export').onclick = () => platform.export(state);
  $('#restart').onclick = () => {
    modal('<h2>Начать новую смену?</h2><p>Текущий прогресс будет заменён.</p><button id="confirm-restart" class="primary">Начать заново</button><button id="cancel-restart" class="text-button">Продолжить текущую</button>', 'settings');
    $('#confirm-restart').onclick = () => resetWorld('RESTART');
    $('#cancel-restart').onclick = settings;
  };
  $('#import').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const loaded = validateSave(await file.text());
    if (!loaded) {
      toast('Это сохранение не подходит или повреждено');
      return;
    }
    platform.acceptCurrentSave();
    state = loaded;
    save();
    world = createWorld();
    scene.destroy();
    scene = createScene($('#viewport'), world, {
      onGround: moveGround,
      onActor: choose,
      onHouse: visitHouse
    });
    closeModal();
    resumeRoutes();
  };
}
function resumeRoutes() {
  for (const s of state.staff) {
    const t = state.tasks.find(t => t.assignedTo === s.id && ['local', 'sent'].includes(t.transmission)) || state.tasks.find(t => t.assignedTo === s.id && t.status === 'visiting');
    if (t) commandMove(world, s.id, t.transmission === 'local' || t.transmission === 'sent' ? 'base' : TASK_NODES[t.id], {
      taskId: t.id
    });
  }
  refresh();
}
$('#pause').onclick = () => {
  paused = !paused;
  refresh();
};
$('#speed').onclick = () => {
  speed = speed === 1 ? 2 : 1;
  refresh();
};
$('#settings').onclick = settings;
$('#help').onclick = showIntro;
$('#finish').onclick = showResult;
$('#zoom-in').onclick = () => scene.zoomBy(1.2);
$('#zoom-out').onclick = () => scene.zoomBy(1 / 1.2);
$('#center').onclick = () => scene.center();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && dialog && !['intro', 'conflict'].includes(dialog.type)) closeModal();
  if (e.code === 'Space' && !dialog && !['INPUT', 'BUTTON'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    paused = !paused;
    refresh();
  }
  if (dialog && e.key === 'Tab') {
    const nodes = [...$('#modal-root').querySelectorAll('button,input,[tabindex="0"]')].filter(n => !n.disabled),
      first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal'))) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
document.addEventListener('visibilitychange', () => {
  last = 0;
  if (document.hidden) save();
});
function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, .05) : 0;
  last = now;
  if (!document.hidden && !paused && !dialog) {
    for (const event of stepWorld(world, dt * speed)) arrive(event);
    clock += dt * speed;
    if (clock >= 1) {
      clock -= 1;
      if (state.time < 1260) {
        state.time++;
      }
      $('#clock').textContent = formatTime(state.time);
      for (const a of world.actors.filter(a => a.status === 'waiting' && a.taskId)) {
        const t = currentTask(a.taskId);
        if (t && state.time >= Math.max(t.availableFrom, t.appointment || 0)) attemptEncounter(t, a);
      }
      if (state.time % 10 === 0) save();
    }
  }
  if (!document.hidden && !paused && !dialog) scene.draw();
  requestAnimationFrame(frame);
}
refresh();
resumeRoutes();
if (fresh || state.phase === 'intro') showIntro();else if (state.phase === 'summary') showResult();
requestAnimationFrame(frame);
platform.offline();
