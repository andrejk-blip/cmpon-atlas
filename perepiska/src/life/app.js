import { createLife, reduceLife, viewLife, validateLife } from './engine.js';
import { HERO, OUTFITS, SHOP, INTERVIEW, DATE_SCENE, TEAM_MEETING, TEAM_HANDOFF } from './content.js';
import { createMovement, moveTo, stepMovement, MAPS } from './movement.js';
import { createLifeScene } from './scene.js';
import { platform } from './platform.js';
import { icon } from './icons.js';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const nodeFor = {
  bed: 'bed',
  wardrobe: 'wardrobe',
  kitchen: 'kitchen',
  bag: 'table',
  door: 'door',
  entrance: 'base',
  mentor: 'mentor',
  respondent: 'respondent',
  bench: 'date'
};
let state = validateLife(platform.load()) || createLife();
let world = createMovement(state.scene, nodeFor[state.currentSpot]);
let modalState = null,
  paused = false,
  speed = 1,
  last = 0,
  noticeTimer,
  allocation = {
    ilya: 0,
    anton: 0,
    dima: 0
  };
let preferences = platform.preferences();
if (preferences.reducedMotion === undefined) preferences.reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion);
$('#app').innerHTML = `<main class="life-game"><div id="life-stage" aria-label="Мир Ани. Нажмите на предмет или место, чтобы подойти. Карту можно перетаскивать."></div>
<header class="life-hud"><div class="brand"><b>Переписка<span>♡</span></b><small>Один день. Твоя история.</small></div><div class="day-clock"><small id="period">ПЕРВОЕ УТРО</small><strong id="clock">07:30</strong></div><div class="resources"><span class="wallet">${icon('coin')}<b id="coins">600</b></span><span class="energy">${icon('energy')}<b id="energy">65</b></span><button id="settings" class="icon-button" aria-label="Настройки">${icon('settings')}</button></div></header>
<div class="location-tag"><span id="location-name">Моя квартира</span><small id="location-detail">День 1 · Новая работа</small></div>
<div class="camera-controls"><button id="zoom-in" aria-label="Приблизить">+</button><button id="zoom-out" aria-label="Отдалить">−</button><button id="pause" aria-label="Пауза">${icon('pause')}</button><button id="speed" aria-label="Изменить скорость">1×</button></div>
<div id="quick-actions" class="quick-actions" aria-label="Места поблизости"></div>
<footer class="life-footer"><button id="profile" class="hero-card" aria-label="Аня — мой персонаж"><span id="hero-portrait" class="hero-portrait"><img src="./assets/anna-life-walk.webp" alt=""></span><span><b>Аня, 25</b><small id="hero-role">Первый день</small></span></button><button id="objective" class="objective"><small>СЕЙЧАС</small><span></span>${icon('arrow')}</button><nav class="pocket"><button id="phone" aria-label="Телефон и чаты">${icon('phone')}<i id="unread">3</i><small>Телефон</small></button><button id="world-map" aria-label="Карта моей жизни">${icon('map')}<small>Карта</small></button><button id="bag" aria-label="Моя сумка">${icon('bag')}<small>Сумка</small></button></nav></footer>
<div id="modal-root"></div></main>`;
let scene = makeScene();
function makeScene() {
  return createLifeScene($('#life-stage'), world, {
    onGround: walkGround,
    onSpot: go,
    onHero: showProfile
  });
}
function notify(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400);
}
function save() {
  if (platform.save(state)) return true;
  if (platform.lastSaveError === 'conflict') {
    paused = true;
    modalState = {
      type: 'conflict'
    };
    showModal(`<h2>Ты продолжила в другой вкладке</h2><p>Там уже есть более свежая история.</p><button id="reload-save" class="primary">Загрузить её ${icon('arrow')}</button>`, 'card');
    $('#reload-save').onclick = () => location.reload();
  } else notify('Сохранение недоступно. Копию можно скачать в настройках.');
  return false;
}
function act(action, showNotice = false) {
  const before = state.events.length,
    previousScene = state.scene;
  state = reduceLife(state, action);
  const accepted = state.events.length > before;
  if (accepted) save();
  if (state.scene !== previousScene) {
    scene.destroy();
    world = createMovement(state.scene, nodeFor[state.currentSpot]);
    scene = makeScene();
  }
  refresh();
  if (showNotice && state.notice) notify(state.notice);
  return accepted;
}
function spots() {
  if (state.scene === 'home') {
    if (!state.flags.awake) return [{
      id: 'bed',
      node: 'bed',
      label: 'Проснуться',
      short: 'Доброе утро',
      icon: 'sun',
      primary: true
    }];
    if (state.phase === 'morning') return [{
      id: 'kitchen',
      node: 'kitchen',
      label: 'Приготовить завтрак',
      short: 'Завтрак',
      icon: 'coffee',
      done: state.flags.breakfast
    }, {
      id: 'wardrobe',
      node: 'wardrobe',
      label: 'Выбрать образ',
      short: 'Мой образ',
      icon: 'wardrobe',
      done: !!state.outfit,
      primary: !state.outfit
    }, {
      id: 'bag',
      node: 'table',
      label: 'Собрать рабочую сумку',
      short: 'Собраться',
      icon: 'bag',
      done: state.flags.packed,
      primary: !!state.outfit && !state.flags.packed
    }, {
      id: 'door',
      node: 'door',
      label: 'Выйти на первую смену',
      short: 'На работу',
      icon: 'door',
      primary: viewLife(state).canLeave
    }];
    return [{
      id: 'bed',
      node: 'bed',
      label: 'Закончить первый день',
      short: 'Спать',
      icon: 'moon',
      primary: true
    }, {
      id: 'door',
      node: 'door',
      label: 'Выйти на прогулку',
      short: 'Во двор',
      icon: 'door'
    }];
  }
  if (state.phase === 'shift') return [{
    id: 'mentor',
    node: 'mentor',
    label: state.interview.status === 'local' ? 'Передать результат Вере' : 'Познакомиться с Верой',
    short: 'Вера',
    icon: 'person',
    primary: !state.flags.mentorMet || state.interview.status === 'local'
  }, {
    id: 'respondent',
    node: 'respondent',
    label: 'Первый адрес — квартира 12',
    short: 'Квартира 12',
    icon: 'home',
    done: ['local', 'accepted'].includes(state.interview.status),
    primary: state.flags.mentorMet && state.interview.status !== 'local'
  }];
  return [{
    id: 'bench',
    node: 'date',
    label: 'Встретиться с Максом',
    short: 'Макс',
    icon: 'heart',
    primary: ['accepted', 'talking'].includes(state.date.status),
    done: state.date.status === 'met'
  }, {
    id: 'entrance',
    node: 'base',
    label: 'Вернуться домой',
    short: 'Домой',
    icon: 'home',
    primary: state.date.status !== 'accepted'
  }];
}
function refresh() {
  const v = viewLife(state);
  $('#clock').textContent = v.clock;
  $('#period').textContent = v.period;
  $('#coins').textContent = state.coins;
  $('#energy').textContent = state.energy;
  $('#location-name').textContent = state.scene === 'home' ? 'Моя квартира' : 'Лесная улица';
  $('#location-detail').textContent = state.scene === 'home' ? state.phase === 'morning' ? 'Первое утро на новой работе' : 'Мой вечер' : state.phase === 'shift' ? 'Первый адрес · Счётный участок 04' : 'После смены';
  $('#hero-role').textContent = state.xp ? 'Первый адрес пройден' : 'Начинающая переписчица';
  const row = state.outfit === 'coral' ? 1 : state.outfit === 'sage' ? 2 : 0;
  $('#hero-portrait img').style.top = -13 - row * 150 + 'px';
  $('#objective span').textContent = world.player.moving ? 'Иду…' : v.objective;
  const unread = v.availableChats.filter(c => c.unread).length;
  $('#unread').textContent = unread;
  $('#unread').hidden = !unread;
  $('#pause').innerHTML = icon(paused ? 'play' : 'pause');
  $('#pause').setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
  $('#speed').textContent = speed + '×';
  const available = spots();
  $('#quick-actions').innerHTML = available.map(s => `<button data-go="${s.id}" class="${s.done ? 'done' : ''} ${s.primary ? 'next' : ''}" aria-label="Быстрый переход: ${s.label}">${icon(s.done ? 'check' : s.icon)}<span>${s.short}</span></button>`).join('');
  $('#quick-actions').querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  scene.update(state, available);
}
function walkGround(node) {
  if (modalState || !state.flags.awake || state.phase === 'complete') return;
  moveTo(world, node);
  refresh();
}
function go(spot) {
  if (modalState || state.phase === 'complete') return;
  if (!state.flags.awake) {
    showAlarm();
    return;
  }
  moveTo(world, nodeFor[spot], {
    interaction: spot
  });
  scene.center();
  refresh();
}
function objectiveAction() {
  if (modalState) return;
  if (!state.flags.awake) {
    showAlarm();
    return;
  }
  if (state.phase === 'morning') {
    if (!state.outfit) go('wardrobe');else if (!state.flags.packed) go('bag');else if (!state.flags.briefed) openPhone('team');else go('door');
  } else if (state.phase === 'shift') go(!state.flags.mentorMet || state.interview.status === 'local' ? 'mentor' : 'respondent');else if (state.phase === 'evening') go(state.scene === 'home' ? 'bed' : ['accepted', 'talking'].includes(state.date.status) ? 'bench' : 'entrance');else showEnding();
}
function arrive(event) {
  if (!event.interaction) return;
  act({
    type: 'ARRIVE',
    spotId: event.interaction
  });
  if (modalState?.type === 'conflict') return;
  interact(event.interaction);
}
function showModal(html, kind = 'card') {
  $('#modal-root').innerHTML = `<div class="scrim"><section class="modal ${kind}" role="dialog" aria-modal="true" tabindex="-1">${html}</section></div>`;
  $('#modal-root .modal').focus();
}
function closeModal() {
  if (modalState?.type === 'conflict') return;
  modalState = null;
  $('#modal-root').replaceChildren();
  refresh();
}
function closeButton() {
  return `<button class="modal-close icon-button" data-close aria-label="Закрыть">${icon('close')}</button>`;
}
function bindClose() {
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
}
function showAlarm() {
  modalState = {
    type: 'alarm'
  };
  showModal(`<span class="eyebrow">ПОНЕДЕЛЬНИК · ПЕРВЫЙ РАБОЧИЙ ДЕНЬ</span><div class="alarm-time">07:30</div><h1>Доброе утро,<br>Аня.</h1><p>Новая работа. Новые люди.<br>И твой обычный, необычный день.</p><button id="wake" class="primary">Встать ${icon('sun')}</button><button id="snooze" class="text-button">Ещё пять минут</button>`, 'alarm');
  $('#wake').onclick = () => {
    act({
      type: 'WAKE'
    });
    closeModal();
  };
  $('#snooze').onclick = () => {
    act({
      type: 'WAKE',
      snooze: true
    });
    closeModal();
    notify('07:35. Хорошо, теперь точно встаём.');
  };
}
function interact(spot) {
  if (spot === 'wardrobe') {
    showWardrobe();
    return;
  }
  if (spot === 'kitchen') {
    if (state.flags.breakfast) {
      notify('Завтрак уже был. Можно собираться.');
      return;
    }
    act({
      type: 'BREAKFAST'
    });
    scene.celebrate('Завтрак готов');
    notify('+22 энергии · 12 минут на себя');
    return;
  }
  if (spot === 'bag') {
    if (state.flags.packed) {
      showBag();
      return;
    }
    modalState = {
      type: 'pack'
    };
    showModal(`${closeButton()}<span class="eyebrow">ПЕРЕД ПЕРВОЙ СМЕНОЙ</span><h2>Всё с собой?</h2><div class="pack-items"><button id="pack-tablet">${icon('phone')}<span>Планшет</span></button><button id="pack-id">${icon('person')}<span>Удостоверение</span></button></div><button id="pack-confirm" class="primary" disabled>Положить в сумку ${icon('bag')}</button>`, 'card');
    bindClose();
    const selectedItems = new Set();
    for (const id of ['tablet', 'id']) $('#pack-' + id).onclick = () => {
      selectedItems.has(id) ? selectedItems.delete(id) : selectedItems.add(id);
      $('#pack-' + id).classList.toggle('picked', selectedItems.has(id));
      $('#pack-confirm').disabled = selectedItems.size !== 2;
    };
    $('#pack-confirm').onclick = () => {
      act({
        type: 'PACK'
      });
      closeModal();
      scene.celebrate('Всё с собой');
    };
    return;
  }
  if (spot === 'door') {
    if (!viewLife(state).canLeave) {
      notify('Ещё нужны образ, рабочая сумка и ответ Вере в телефоне.');
      return;
    }
    act({
      type: 'LEAVE'
    });
    notify(state.phase === 'shift' ? 'Лесная улица. Вера ждёт у скамейки.' : 'Вечерняя прогулка');
    return;
  }
  if (spot === 'mentor') {
    if (!state.flags.mentorMet) {
      showMeeting('Вера', TEAM_MEETING, 'Начать первый день', () => {
        act({
          type: 'MEET_TEAM'
        });
        closeModal();
      });
      return;
    }
    if (state.interview.status === 'local') {
      showMeeting('Вера', TEAM_HANDOFF, 'Сдать анкету · +300', () => {
        act({
          type: 'HAND_IN'
        });
        closeModal();
        notify('18:00. Смена позади — теперь твои планы.');
      });
      return;
    }
    showMeeting('Вера', 'Твой адрес — квартира 12. Сначала выясни, кто постоянно живёт здесь, затем — как люди ведут хозяйство.', 'Поняла', closeModal);
    return;
  }
  if (spot === 'respondent') {
    if (!state.flags.mentorMet) {
      notify('Сначала познакомься с Верой у скамейки.');
      return;
    }
    if (state.interview.status === 'ready') act({
      type: 'VISIT'
    });
    if (state.interview.status === 'talking') showInterview();else notify('Ответы уже на планшете. Вера ждёт результат.');
    return;
  }
  if (spot === 'bench') {
    if (state.date.status === 'accepted') act({
      type: 'DATE'
    });
    if (state.date.status === 'talking' || state.date.status === 'met') showDate();else openPhone('max');
    return;
  }
  if (spot === 'entrance') {
    if (state.phase === 'evening') {
      act({
        type: 'RETURN_HOME'
      });
      notify('Дома. Можно купить что-нибудь для своего уголка.');
    }
    return;
  }
  if (spot === 'bed') {
    if (!state.flags.awake) {
      showAlarm();
      return;
    }
    if (viewLife(state).canFinish) showAction('Оставим остальное на завтра?', state.date.status === 'accepted' ? 'Максу можно написать, что прогулку перенесём. Или просто закончить день — он останется на завтра.' : 'Первый день уже стал частью твоей истории.', 'Закончить день', 'moon', () => {
      act({
        type: 'FINISH'
      });
      showEnding();
    });
    return;
  }
}
function showAction(title, text, label, symbol, action) {
  modalState = {
    type: 'action'
  };
  showModal(`${closeButton()}<div class="action-icon">${icon(symbol)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><button id="action-confirm" class="primary">${esc(label)} ${icon('arrow')}</button>`, 'card');
  bindClose();
  $('#action-confirm').onclick = action;
}
function showWardrobe() {
  modalState = {
    type: 'wardrobe'
  };
  showModal(`${closeButton()}<span class="eyebrow">МОЙ ГАРДЕРОБ</span><h2>Какой сегодня настрой?</h2><div class="outfit-options">${OUTFITS.map(o => `<button data-outfit="${o.id}" class="${state.outfit === o.id ? 'selected' : ''}" style="--outfit:${o.color}"><span class="outfit-doll" style="background-position:0 ${o.spriteRow === 1 ? '50' : '100'}%"></span><b>${esc(o.name)}</b><small>В моём гардеробе</small></button>`).join('')}</div>`, 'wardrobe');
  bindClose();
  document.querySelectorAll('[data-outfit]').forEach(b => b.onclick = () => {
    act({
      type: 'OUTFIT',
      outfitId: b.dataset.outfit
    });
    closeModal();
    scene.celebrate('Вот так — моё');
  });
}
function showMeeting(name, text, label, action) {
  modalState = {
    type: 'meeting'
  };
  showModal(`${closeButton()}<div class="speaker"><span class="mentor-portrait"></span><span><small>ПЕРВАЯ СМЕНА</small><b>${name}</b></span></div><div class="speech">${esc(text)}</div><button id="meeting-confirm" class="primary">${esc(label)} ${icon('arrow')}</button>`, 'card');
  bindClose();
  $('#meeting-confirm').onclick = action;
}
function openPhone(thread = null, tab = 'chats') {
  if (!state.flags.awake) {
    showAlarm();
    return;
  }
  modalState = {
    type: 'phone',
    thread,
    tab
  };
  if (thread) act({
    type: 'READ_CHAT',
    channelId: thread
  });
  renderPhone();
}
function renderPhone() {
  if (modalState?.type !== 'phone') return;
  const v = viewLife(state),
    thread = v.availableChats.find(c => c.id === modalState.thread);
  let content = '';
  if (thread) {
    content = `<div class="phone-thread-head"><button id="thread-back" class="icon-button" aria-label="Назад к чатам">${icon('back')}</button>${chatAvatar(thread)}<div><b>${esc(thread.shortName)}</b><small>${thread.id === 'max' ? 'Знакомый · 27' : thread.id === 'friend' ? 'Подруга' : 'Наставница'}</small></div></div><div class="messages">${thread.messages.slice(-5).map(m => `<div class="message ${m.speaker === HERO.name ? 'mine' : ''}">${esc(m.text)}<time>${Math.floor(m.time / 60)}:${String(m.time % 60).padStart(2, '0')}</time></div>`).join('')}</div><div class="reply-options">${thread.choices.map(c => `<button data-reply="${c.id}">${esc(c.label)} ${icon('arrow')}</button>`).join('')}${!thread.choices.length ? '<span class="caught-up">Пока всё. Жизнь — за экраном.</span>' : ''}</div>`;
  } else if (modalState.tab === 'shop') {
    content = `<div class="phone-page-title"><small>ДЛЯ СВОЕГО УГОЛКА</small><h2>Маленькие радости</h2><p>Сегодня можно начать с одной вещи.</p></div><div class="shop-items">${v.shop.map(item => `<article class="shop-item"><div class="product-art ${item.id}">${icon(item.id)}</div><div><b>${esc(item.name)}</b><small>${esc(item.description)}</small><button data-buy="${item.id}" ${item.owned || !item.affordable || !['morning', 'evening'].includes(state.phase) ? 'disabled' : ''}>${item.owned ? 'Уже дома' : icon('coin') + item.price}</button></div></article>`).join('')}</div><div class="shop-balance">Осталось ${icon('coin')} <b>${state.coins}</b></div><p class="shop-note">Это игровые монеты. Купленное остаётся в квартире.</p>`;
  } else {
    content = `<div class="phone-page-title"><small>ТВОИ ЛЮДИ</small><h2>Переписки</h2></div><div class="chat-list">${v.availableChats.map(c => `<button data-thread="${c.id}">${chatAvatar(c)}<span><b>${esc(c.name)}</b><small>${esc(c.lastMessage.text)}</small></span>${c.unread ? '<i></i>' : ''}</button>`).join('')}</div><div class="phone-small-note">Три чата. И у каждого — своя история.</div>`;
  }
  showModal(`<div class="phone-top"><span>${v.clock}</span><span class="phone-notch"></span><button data-close class="icon-button" aria-label="Убрать телефон">${icon('close')}</button></div>${content}${!thread ? `<nav class="phone-tabs"><button id="chats-tab" class="${modalState.tab === 'chats' ? 'active' : ''}">${icon('chat')}Чаты</button><button id="shop-tab" class="${modalState.tab === 'shop' ? 'active' : ''}">${icon('plant')}Для дома</button></nav>` : ''}`, 'phone');
  bindClose();
  if (thread) {
    $('#thread-back').onclick = () => {
      modalState.thread = null;
      renderPhone();
    };
    document.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
      act({
        type: 'CHAT',
        channelId: thread.id,
        choiceId: b.dataset.reply
      });
      renderPhone();
    });
  } else {
    const ct = $('#chats-tab'),
      st = $('#shop-tab');
    ct.onclick = () => {
      modalState.tab = 'chats';
      renderPhone();
    };
    st.onclick = () => {
      modalState.tab = 'shop';
      renderPhone();
    };
    document.querySelectorAll('[data-thread]').forEach(b => b.onclick = () => openPhone(b.dataset.thread));
    document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      if (act({
        type: 'BUY',
        itemId: b.dataset.buy
      }, true)) {
        scene.celebrate('Теперь дома');
      }
      renderPhone();
    });
  }
}
function chatAvatar(c) {
  return c.id === 'max' ? '<span class="chat-avatar max-avatar"><img src="./assets/max-life.webp" alt="Макс"></span>' : c.id === 'team' ? '<span class="chat-avatar mentor-portrait"></span>' : `<span class="chat-avatar" style="background:${c.color}">${c.avatar}</span>`;
}
function showInterview() {
  if (modalState?.type === 'conflict') return;
  modalState = {
    type: 'interview',
    screen: 'talk'
  };
  renderInterview();
}
function renderInterview() {
  if (modalState?.type !== 'interview') return;
  const v = viewLife(state),
    form = modalState.screen === 'roster';
  const body = form ? `<h2>Кто ведёт хозяйство вместе?</h2><p class="form-instruction">Нажми на карточку, чтобы выбрать группу. Гостя оставь отдельно.</p><div class="resident-cards">${INTERVIEW.roster.map(p => `<button data-person="${p.id}" class="resident-card group-${allocation[p.id]}" aria-label="${p.name}: ${allocation[p.id] ? 'домохозяйство ' + allocation[p.id] : 'не включён'}"><span class="resident-head" style="--person:${p.color}">${icon('person')}</span><b>${p.name}</b><small>${allocation[p.id] ? 'Домохозяйство ' + allocation[p.id] : 'Не включён'}</small></button>`).join('')}</div><div class="household-groups"><div><span>1</span><b>Домохозяйство</b><small>${groupNames(1)}</small></div><div><span>2</span><b>Домохозяйство</b><small>${groupNames(2)}</small></div></div><p id="roster-error" class="form-error" role="status"></p><button id="submit-roster" class="primary">Сохранить на планшет ${icon('check')}</button><button id="back-interview" class="text-button">Ещё раз посмотреть ответы</button>` : `<div class="speech">${esc(state.interview.lastReply)}</div><div class="interview-options">${v.interviewQuestions.map(q => `<button data-question="${q.id}">${esc(q.label)} ${icon('arrow')}</button>`).join('')}${v.canSubmit ? `<button id="open-roster" class="primary">Собрать домохозяйства ${icon('arrow')}</button>` : ''}</div>`;
  showModal(`${closeButton()}<span class="eyebrow">ПЕРВЫЙ АДРЕС · ЭЛЕКТРОННАЯ АНКЕТА</span><div class="interview-heading"><div class="tiny-people">${icon('person')}${icon('person')}</div><span><b>${INTERVIEW.name}</b><small>${INTERVIEW.address}</small></span></div>${body}`, 'interview');
  bindClose();
  document.querySelectorAll('[data-question]').forEach(b => b.onclick = () => {
    act({
      type: 'ASK',
      questionId: b.dataset.question
    });
    renderInterview();
  });
  if ($('#open-roster')) $('#open-roster').onclick = () => {
    modalState.screen = 'roster';
    renderInterview();
  };
  if (form) {
    document.querySelectorAll('[data-person]').forEach(b => b.onclick = () => {
      allocation[b.dataset.person] = (allocation[b.dataset.person] + 1) % 3;
      renderInterview();
    });
    $('#back-interview').onclick = () => {
      modalState.screen = 'talk';
      renderInterview();
    };
    $('#submit-roster').onclick = () => {
      const members = Object.entries(allocation).filter(([, group]) => group).map(([id, household]) => ({
        id,
        household
      }));
      if (act({
        type: 'SUBMIT',
        answers: {
          members
        }
      })) {
        closeModal();
        scene.celebrate('Сохранено');
        notify('Готово. Теперь передай результат Вере.');
      } else $('#roster-error').textContent = state.notice;
    };
  }
}
function groupNames(group) {
  return INTERVIEW.roster.filter(p => allocation[p.id] === group).map(p => p.name).join(', ') || 'Пока пусто';
}
function showDate() {
  if (modalState?.type === 'conflict') return;
  modalState = {
    type: 'date'
  };
  showModal(`${closeButton()}<div class="date-scene"><img src="./assets/max-life.webp" alt="Макс, 27 лет"><div><span class="eyebrow">ВЕЧЕР БЕЗ СПЕШКИ</span><h2>Привет, Макс.</h2><div class="speech">${esc(state.date.status === 'met' ? state.date.lastReply : DATE_SCENE.opening)}</div></div></div><div class="date-options">${state.date.status === 'talking' ? DATE_SCENE.choices.map(c => `<button data-date="${c.id}">${esc(c.label)} ${icon('heart')}</button>`).join('') : '<button id="date-done" class="primary">Мне тоже было хорошо ♡</button>'}</div>`, 'date');
  bindClose();
  document.querySelectorAll('[data-date]').forEach(b => b.onclick = () => {
    act({
      type: 'DATE_REPLY',
      choiceId: b.dataset.date
    });
    showDate();
  });
  if ($('#date-done')) $('#date-done').onclick = closeModal;
}
function showMap() {
  if (!state.flags.awake) {
    showAlarm();
    return;
  }
  modalState = {
    type: 'map'
  };
  showModal(`${closeButton()}<span class="eyebrow">МОЯ ЖИЗНЬ · КАРТА МЕСТ</span><h2>Всё начинается рядом</h2><div class="location-map"><button data-location="home" class="place home-place ${state.scene === 'home' ? 'here' : ''}"><span>${icon('home')}</span><b>Моя квартира</b><small>Сборы, уют и свои планы</small></button><i class="map-path"></i><button data-location="district" class="place yard-place ${state.scene === 'district' ? 'here' : ''}"><span>${icon('person')}</span><b>Знакомый двор</b><small>Работа и встреча с Максом</small></button></div><div class="future-places"><span>${icon('lock')} Квартал с новыми соседями</span><span>${icon('lock')} Кафе и места встреч</span><span>${icon('lock')} Другие районы и обследования</span></div><p class="muted">Эти места — для следующих глав. Сейчас открыт первый день.</p>`, 'map');
  bindClose();
  document.querySelectorAll('[data-location]').forEach(b => b.onclick = () => {
    const dest = b.dataset.location;
    closeModal();
    if (dest === state.scene) {
      scene.center();
      return;
    }
    if (dest === 'district') go('door');else if (state.phase === 'evening') go('entrance');else notify('Сначала закончи учебную смену у Веры.');
  });
}
function showBag() {
  modalState = {
    type: 'bag'
  };
  showModal(`${closeButton()}<span class="eyebrow">МОЯ СУМКА</span><h2>${state.flags.packed ? 'Всё под рукой' : 'Пока собираюсь'}</h2><div class="inventory"><span class="${state.flags.packed ? 'owned' : ''}">${icon('phone')}Планшет</span><span class="${state.flags.packed ? 'owned' : ''}">${icon('person')}Удостоверение</span><span class="${['local', 'accepted'].includes(state.interview.status) ? 'owned' : ''}">${icon('check')}Первый результат</span></div><button id="bag-close" class="primary">${state.flags.packed ? 'Хорошо' : 'Подойти к сумке'} ${icon('arrow')}</button>`, 'card');
  bindClose();
  $('#bag-close').onclick = () => {
    closeModal();
    if (!state.flags.packed && state.scene === 'home') go('bag');
  };
}
function showProfile() {
  modalState = {
    type: 'profile'
  };
  const v = viewLife(state);
  showModal(`${closeButton()}<span class="eyebrow">МОЯ ИСТОРИЯ</span><h2>Аня, 25</h2><p>Первый день переписчицы. Своё место, любимые вещи и люди, которым хочется написать.</p><div class="profile-facts"><span>${icon('star')}${state.xp ? 'Первый адрес пройден' : 'Всё только начинается'}</span><span>${icon('home')}${esc(v.outcome.home)}</span><span>${icon('heart')}${esc(state.date.status === 'accepted' ? 'Договорились с Максом' : v.outcome.romance)}</span></div><button id="profile-close" class="primary">Вернуться к своему дню ${icon('arrow')}</button>`, 'card');
  bindClose();
  $('#profile-close').onclick = closeModal;
}
function showEnding() {
  if (modalState?.type === 'conflict') return;
  modalState = {
    type: 'ending'
  };
  const v = viewLife(state);
  showModal(`<span class="eyebrow">ДЕНЬ 1 · ТЫ СПРАВИЛАСЬ</span><h1>Маленькое<br>большое начало.</h1><div class="day-outcomes"><div>${icon('star')}<span>${esc(v.outcome.work)}</span></div><div>${icon('home')}<span>${esc(v.outcome.home)}</span></div><div>${icon('heart')}<span>${esc(v.outcome.romance)}</span></div></div><div class="day-wallet">На свои планы осталось ${icon('coin')} <b>${state.coins}</b></div><p class="next-chapter">Дальше — самостоятельный маршрут, новые соседи и продолжение личной истории. Следующая глава пока не открыта.</p><button id="end-home" class="primary">Посмотреть мой дом ${icon('home')}</button><button id="end-restart" class="text-button">Прожить день по-другому</button>`, 'ending');
  $('#end-home').onclick = closeModal;
  $('#end-restart').onclick = confirmRestart;
}
function confirmRestart() {
  modalState = {
    type: 'restart'
  };
  showModal('<h2>Прожить первый день заново?</h2><p>Текущая история Ани будет заменена.</p><button id="reset-confirm" class="primary">Начать новое утро</button><button id="reset-cancel" class="text-button">Оставить мою историю</button>', 'card');
  $('#reset-cancel').onclick = closeModal;
  $('#reset-confirm').onclick = () => {
    platform.acceptCurrentSave();
    state = createLife();
    save();
    scene.destroy();
    world = createMovement('home');
    scene = makeScene();
    paused = false;
    allocation = {
      ilya: 0,
      anton: 0,
      dima: 0
    };
    refresh();
    showAlarm();
  };
}
function showSettings() {
  modalState = {
    type: 'settings'
  };
  showModal(`${closeButton()}<h2>Передышка</h2><label class="setting-row"><span>Меньше декоративных движений</span><input id="motion" type="checkbox" ${preferences.reducedMotion ? 'checked' : ''}></label><button id="export" class="secondary">Скачать мою историю</button><label class="secondary file-label">Загрузить историю<input id="import" type="file" accept=".json,application/json"></label><button id="restart" class="text-button">Новое прохождение</button><small class="muted">История сохраняется на этом устройстве.</small>`, 'card');
  bindClose();
  $('#motion').onchange = e => {
    preferences.reducedMotion = e.target.checked;
    platform.setPreferences(preferences);
    document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion);
  };
  $('#export').onclick = () => platform.export(state);
  $('#restart').onclick = confirmRestart;
  $('#import').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const loaded = validateLife(await file.text());
    if (!loaded) {
      notify('Это сохранение не подходит к истории Ани.');
      return;
    }
    platform.acceptCurrentSave();
    state = loaded;
    save();
    scene.destroy();
    world = createMovement(state.scene, nodeFor[state.currentSpot]);
    scene = makeScene();
    closeModal();
    if (!state.flags.awake) showAlarm();else if (state.phase === 'complete') showEnding();
  };
}
$('#phone').onclick = () => openPhone();
$('#world-map').onclick = showMap;
$('#bag').onclick = showBag;
$('#profile').onclick = showProfile;
$('#objective').onclick = objectiveAction;
$('#settings').onclick = showSettings;
$('#zoom-in').onclick = () => scene.zoomBy(1.2);
$('#zoom-out').onclick = () => scene.zoomBy(1 / 1.2);
$('#pause').onclick = () => {
  paused = !paused;
  refresh();
};
$('#speed').onclick = () => {
  speed = speed === 1 ? 2 : 1;
  refresh();
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalState && !['alarm', 'conflict'].includes(modalState.type)) closeModal();
  if (e.code === 'Space' && !modalState && !['BUTTON', 'INPUT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    paused = !paused;
    refresh();
  }
  if (e.key === 'Tab' && modalState) {
    const buttons = [...$('#modal-root').querySelectorAll('button,input')].filter(b => !b.disabled),
      first = buttons[0],
      lastButton = buttons.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal'))) {
      e.preventDefault();
      lastButton?.focus();
    } else if (!e.shiftKey && document.activeElement === lastButton) {
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
  if (!document.hidden && !modalState && !paused) {
    for (const event of stepMovement(world, dt * speed)) arrive(event);
    scene.draw();
  }
  requestAnimationFrame(frame);
}
refresh();
if (!state.flags.awake) showAlarm();else if (state.phase === 'complete') showEnding();
requestAnimationFrame(frame);
platform.offline();
