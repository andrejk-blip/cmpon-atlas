/** Small, presentation-only guide. Progress follows real story facts, never fake clicks. */
const VERSION = 1;
const statuses = new Set(['pending', 'active', 'skipped', 'done']);
const blockedModals = new Set(['welcome', 'alarm', 'settings', 'help', 'conflict', 'ending', 'restart']);
const step = (id, stage, title, text, selector = null, extra = {}) => ({id, stage, total: 5, title, text, selector, ...extra});

export function normalizeTutorial(value) {
  const status = value && value.version === VERSION && statuses.has(value.status) ? value.status : 'pending';
  return {version: VERSION, status};
}

/** Derive the next useful action from the game, so reloading or taking a detour is safe. */
export function getTutorialStep({state, modalState = null, moving = false, paused = false, packSelected = []} = {}) {
  if (!state?.flags?.awake || paused || blockedModals.has(modalState?.type)) return null;
  const modal = modalState?.type;
  const closeOther = stage => step('return-to-day', stage, 'Вернёмся к сборам', 'Закрой это окно — подсказка покажет следующий шаг.', '[data-close]');
  const walk = stage => step('walking', stage, 'Аня уже идёт', 'Она дойдёт до выбранного места сама. Можно изменить маршрут новым нажатием.', null, {waiting: true});
  if (state.phase !== 'morning' && state.flags.mentorMet || ['evening', 'complete'].includes(state.phase)) {
    return step('finished', 5, 'Ты уже умеешь главное', 'Нажимай на людей и места. В телефоне — чаты и «Магазин» для квартиры. «Сейчас» подскажет задачу.', '#objective', {finished: true});
  }
  if (state.phase === 'morning') {
    if (!state.outfit) {
      if (modal === 'wardrobe') return step('choose-outfit', 1, 'Выбери свой образ', 'Нажми на любой из двух нарядов. Оба подойдут для первого рабочего дня.', '.outfit-options');
      if (modal) return closeOther(1);
      if (moving) return walk(1, 'к шкафу');
      return step('wardrobe', 1, 'Начнём с образа', 'Нажми подсвеченную кнопку — Аня сама подойдёт к шкафу.', '#quick-actions [data-go="wardrobe"]');
    }
    if (!state.flags.briefed) {
      if (modal === 'phone') {
        if (modalState.thread === 'team') return step('reply-vera', 2, 'Ответь наставнице', 'Выбери любой ответ Вере. В переписках решения принимаешь ты.', '.reply-options');
        if (modalState.thread) return step('back-to-chats', 2, 'Вера ждёт ответа', 'Вернись к списку переписок — там есть рабочий чат.', '#thread-back');
        if (modalState.tab === 'shop') return step('chats-tab', 2, 'Сначала рабочий чат', 'Нажми «Чаты», чтобы найти сообщение наставницы.', '#chats-tab');
        return step('open-vera', 2, 'Открой чат Веры', 'Наставница расскажет, где вы встречаетесь и что взять с собой.', '[data-thread="team"]');
      }
      if (modal) return closeOther(2);
      return step('phone', 2, 'Проверь телефон', 'Нажми «Телефон»: там чаты и вкладка «Магазин» с вещами для квартиры. Сейчас откроем сообщение Веры.', '#phone');
    }
    if (!state.flags.packed) {
      if (modal === 'pack') {
        if (!packSelected.includes('tablet')) return step('pack-tablet', 3, 'Возьми рабочие вещи', 'Сначала нажми на планшет — в нём будут электронные анкеты.', '#pack-tablet');
        if (!packSelected.includes('id')) return step('pack-id', 3, 'И удостоверение', 'Нажми на удостоверение, чтобы взять его с собой.', '#pack-id');
        return step('pack-confirm', 3, 'Всё выбрано', 'Теперь нажми «Положить в сумку».', '#pack-confirm');
      }
      if (modal) return closeOther(3);
      if (moving) return walk(3, 'к сумке');
      return step('bag', 3, 'Собери рабочую сумку', 'Нажми «Собраться» — планшет и удостоверение лежат у стола.', '#quick-actions [data-go="bag"]');
    }
    if (modal) return closeOther(4);
    if (moving) return walk(4, 'к выходу');
    return step('leave', 4, 'Можно на первую смену', 'Нажми «На работу», чтобы выйти во двор. Позавтракать перед выходом тоже можно.', '#quick-actions [data-go="door"]');
  }
  if (state.phase === 'shift') {
    if (modal === 'meeting') return step('meet-vera', 5, 'Начни день с Верой', 'Здесь разговор с человеком. Прочитай или послушай реплику и нажми кнопку внизу.', '#meeting-confirm');
    if (modal) return closeOther(5);
    if (moving) return walk(5, 'к Вере');
    return step('find-vera', 5, 'Познакомься с наставницей', 'Нажми «Вера». Аня подойдёт, и вы поговорите о первом адресе.', '#quick-actions [data-go="mentor"]');
  }
  return null;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Keep the floating card within the viewport and away from the real click target. */
export function placeTutorialCard(target, viewport, card) {
  const gap = 16, edge = 12;
  const width = Math.min(card.width, viewport.width - edge * 2), height = card.height;
  const constrain = (x, y) => ({x: clamp(x, edge, Math.max(edge, viewport.width - width - edge)), y: clamp(y, edge, Math.max(edge, viewport.height - height - edge)), width, height});
  if (!target) return {...constrain(edge, 105), side: 'none'};
  const candidates = [
    {...constrain(target.x + target.width / 2 - width / 2, target.y - height - gap), side: 'above'},
    {...constrain(target.x + target.width + gap, target.y + target.height / 2 - height / 2), side: 'right'},
    {...constrain(target.x - width - gap, target.y + target.height / 2 - height / 2), side: 'left'},
    {...constrain(target.x + target.width / 2 - width / 2, target.y + target.height + gap), side: 'below'},
  ];
  return candidates.sort((a, b) => overlap(a, target) - overlap(b, target))[0];
}

export function createTutorial({preferences, onPreferencesChange, document: doc = globalThis.document, window: win = globalThis.window} = {}) {
  let prefs = normalizeTutorial(preferences), snapshot = null, destroyed = false, scheduled = false, currentKey = '', currentTarget = null;
  let observer = null, resizeObserver = null, settleTimer = null;
  const root = doc.createElement('div'); root.id = 'life-tutorial'; root.className = 'life-tutorial'; root.hidden = true;
  const card = doc.createElement('aside'); card.className = 'tutorial-card'; card.dataset.tutorialCard = '';
  card.setAttribute('aria-label', 'Подсказка по игре'); card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div class="tutorial-top"><span data-tutorial-count></span><button type="button" data-tutorial-skip aria-label="Пропустить обучение">Пропустить</button></div><strong data-tutorial-title></strong><p data-tutorial-text></p><button type="button" data-tutorial-finish hidden>Понятно, играем</button>';
  root.append(card); doc.body.append(root);
  const count = card.querySelector('[data-tutorial-count]'), title = card.querySelector('[data-tutorial-title]'), copy = card.querySelector('[data-tutorial-text]');
  const skipButton = card.querySelector('[data-tutorial-skip]'), finishButton = card.querySelector('[data-tutorial-finish]');
  skipButton.onclick = () => setStatus('skipped'); finishButton.onclick = () => setStatus('done');
  function setStatus(status) {
    if (['skipped', 'done'].includes(status) && card.contains(doc.activeElement)) {
      const fallback = currentTarget?.matches('button,input') ? currentTarget : currentTarget?.querySelector('button,input');
      (fallback || doc.querySelector('#modal-root .modal button:not([data-tutorial-skip]):not([data-tutorial-finish])') || doc.querySelector('#objective'))?.focus();
    }
    prefs = {version: VERSION, status}; onPreferencesChange?.({...prefs}); schedule();
  }
  function clearTarget() {
    currentTarget?.classList.remove('tutorial-target');
    if (currentTarget?.getAttribute('aria-describedby') === 'tutorial-instruction') currentTarget.removeAttribute('aria-describedby');
    currentTarget = null;
  }
  copy.id = 'tutorial-instruction';
  function hide() { clearTarget(); root.hidden = true; card.hidden = true; currentKey = ''; }
  function readPackSelection() { return ['tablet', 'id'].filter(id => doc.querySelector('#pack-' + id)?.classList.contains('picked')); }
  function visibleTarget(selector, inModal) {
    if (!selector) return null;
    const target = (inModal || doc).querySelector(selector);
    if (!target || target.disabled || !target.getClientRects().length) return null;
    return target;
  }
  function layout() {
    if (destroyed || card.hidden || card.classList.contains('tutorial-card--inline')) return;
    const targetBox = currentTarget?.getBoundingClientRect();
    const place = placeTutorialCard(targetBox ? {x: targetBox.left, y: targetBox.top, width: targetBox.width, height: targetBox.height} : null,
      {width: win.innerWidth, height: win.innerHeight}, {width: 300, height: card.offsetHeight || 140});
    card.style.left = place.x + 'px'; card.style.top = place.y + 'px'; card.dataset.placement = place.side;
  }
  function render() {
    scheduled = false;
    if (destroyed || !snapshot?.state) return;
    const state = snapshot.state;
    if (prefs.status === 'pending' && state.flags?.awake && state.phase === 'morning') {
      prefs = {version: VERSION, status: 'active'}; onPreferencesChange?.({...prefs});
    }
    if (prefs.status !== 'active') { hide(); return; }
    const next = getTutorialStep({...snapshot, packSelected: readPackSelection()});
    if (!next) { hide(); return; }
    const modal = doc.querySelector('#modal-root .modal');
    const target = next.finished && modal ? null : visibleTarget(next.selector, modal);
    // The source game can replace a modal between update() and the microtask.
    // Do not point at a stale control behind that modal.
    if (next.selector && !target && !(next.finished && modal)) { hide(); return; }
    const nextParent = modal || root;
    if (card.parentNode !== nextParent) {
      if (modal) {
        const top = modal.querySelector('.phone-top');
        if (top) top.after(card); else modal.prepend(card);
      } else root.append(card);
    }
    card.classList.toggle('tutorial-card--inline', Boolean(modal));
    if (modal) { card.style.left = ''; card.style.top = ''; }
    root.hidden = Boolean(modal); card.hidden = false;
    if (currentTarget !== target) {
      clearTarget(); currentTarget = target;
      if (target) {
        target.classList.add('tutorial-target');
        if (!target.hasAttribute('aria-describedby')) target.setAttribute('aria-describedby', copy.id);
      }
      resizeObserver?.disconnect(); resizeObserver?.observe(card);
      if (target) resizeObserver?.observe(target);
    }
    if (currentKey !== next.id) {
      currentKey = next.id; card.dataset.tutorialStep = next.id;
      count.textContent = next.finished ? 'Первые шаги пройдены' : `Первые шаги · ${next.stage} из ${next.total}`;
      title.textContent = next.title; copy.textContent = next.text;
      skipButton.hidden = next.finished; finishButton.hidden = !next.finished;
    }
    layout();
  }
  function schedule() {
    if (destroyed || scheduled) return;
    scheduled = true; queueMicrotask(render);
  }
  // Track only UI changes, never the animated world/canvas on every frame.
  const Mutation = win.MutationObserver || globalThis.MutationObserver;
  if (Mutation) {
    observer = new Mutation(records => {
      const relevant = records.some(record => {
        if (record.target === card || card.contains(record.target)) return false;
        if (record.type === 'attributes') return record.attributeName === 'disabled' || record.target.id?.startsWith('pack-');
        return [...record.addedNodes, ...record.removedNodes].some(node => node !== card && !card.contains(node));
      });
      if (relevant) schedule();
    });
    for (const selector of ['#modal-root', '#quick-actions']) {
      const node = doc.querySelector(selector);
      if (node) observer.observe(node, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class']});
    }
  }
  const Resize = win.ResizeObserver || globalThis.ResizeObserver;
  if (Resize) resizeObserver = new Resize(layout);
  win.addEventListener('resize', layout); doc.addEventListener('scroll', layout, true);
  const animationEnd = () => { if (settleTimer) win.clearTimeout(settleTimer); settleTimer = win.setTimeout(layout, 0); };
  doc.addEventListener('animationend', animationEnd);
  return {
    update(value) { snapshot = value; schedule(); },
    start() { setStatus('active'); },
    reset() { setStatus('pending'); },
    skip() { setStatus('skipped'); },
    getPreferences: () => ({...prefs}),
    destroy() {
      destroyed = true; observer?.disconnect(); resizeObserver?.disconnect(); clearTarget();
      if (settleTimer) win.clearTimeout(settleTimer);
      win.removeEventListener('resize', layout); doc.removeEventListener('scroll', layout, true); doc.removeEventListener('animationend', animationEnd);
      card.remove(); root.remove();
    },
  };
}
