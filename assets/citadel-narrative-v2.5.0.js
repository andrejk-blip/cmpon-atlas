/* Citadel 2.5.0 — one campaign, short contextual captain reactions.
 * Presentation only: no rules, scoring, answers, save fields, input listeners,
 * timers, emitter wrappers or additional animation owner. State is ephemeral.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_NARRATIVE?.version === '2.5.0' || typeof RequirementArcade !== 'function') return;
  const VERSION = '2.5.0', states = new WeakMap();
  const chapters = Object.freeze([
    ['Первый вылет', 'Собери исходные требования и научись отличать полезное замечание от лишнего изменения.'],
    ['Архив потребностей', 'За каждой дверью — решение по замечанию. Защити сектор и проверь аргументы на терминале.'],
    ['Коридор исполнения', 'Первая редакция готова. Доставь архив требований, связи и решения исполнителю.'],
    ['Связь с ФЗ', 'Исполнитель запросил уточнения. ФЗ увозит три пакета: получи их по связи, чтобы продолжить проверку.'],
    ['Машинный зал', 'Уточнения получены. Теперь проверь состав работ и условия, по которым примут результат.'],
    ['Переход интеграций', 'Проверенная редакция нужна смежникам. Противник прикрывает ударные звенья щитами.'],
    ['Рой уточнений', 'Вопросы смежников пришли сразу. Прорви строй эскадрилий и собери связанные пакеты требований.'],
    ['Палуба интеграций', 'Пакеты на борту. Проверь границы, связи и полномочия: один пробел может затронуть весь процесс.'],
    ['Последняя миля', 'До итогового согласования остался один переход. Сохрани хотя бы два транспорта под совместными атаками.'],
    ['Периметр согласования', 'Теперь собери окончательный пакет. Новые идеи не должны незаметно менять согласованные границы.'],
    ['Командный центр', 'Итоговые решения принимаются здесь. Закрой подтверждённые блокеры и сохрани историю согласования.'],
    ['Параллакс', 'Пакет согласован, но путь к исполнению закрыт. Разрушь опоры защиты и дождись открытого ядра.'],
    ['Последняя проверка', 'До МРГ три рубежа: доказательства, испытания и согласование. Пронеси через них одну проверенную версию.'],
    ['Исполнение', 'Пройди три волны МРГ и передай проверенный пакет. Здесь пригодятся все освоенные приёмы.']
  ].map(([title, context], index) => Object.freeze({ level: index + 1, title, context })));
  const reactions = Object.freeze({
    package: Object.freeze(['Пакет на борту. Теперь это груз с содержанием, а не просто красивый контейнер.', 'Ещё одно требование доставлено. Потерянных вложений сегодня не будет.']),
    terminal: Object.freeze(['Решение зафиксировано. Следующий сектор ждёт аргументы, а не новую версию того же письма.', 'Этот вопрос закрыт. Сохраняем решение и идём дальше.']),
    field: Object.freeze(['Проход чистый. Поправки курса приняты с первого раза.', 'В окно попали. Вот бы все согласования были такими точными.']),
    torpedo: Object.freeze(['Торпеда снята. Архив едет дальше без лишних приложений.', 'Перехват выполнен. Срочная доставка отменена.']),
    commander: Object.freeze(['Командир выбыл. У звена временно нет согласованного плана.', 'Атака сорвана. Используй паузу в их координации.']),
    pursuit: Object.freeze(['Пакет принят. Уточнений стало меньше, скорость — выше.', 'Ещё одна версия у нас. Теперь держим связь до последнего пакета.']),
    jammer: Object.freeze(['Один глушитель снят. Конкретный вопрос снова можно расслышать.', 'Помех стало меньше. Продолжаем получать требования.']),
    swarm: Object.freeze(['Волна закрыта. Без повторной рассылки тех же замечаний.', 'Строй распался. Осталось собрать разговор в конкретные решения.']),
    support: Object.freeze(['Опора разрушена. Аргументов у Параллакса всё меньше.', 'Ещё одна опора снята. Защита уже не выглядит монолитной.']),
    mrg: Object.freeze(['Первый рубеж позади. Дальше тот же порядок: увидеть угрозу, уклониться, ответить.', 'Последняя волна. Критерий успеха прежний: доставить проверенный пакет.'])
  });
  function chapter(e) {
    if (!e) return chapters[0];
    const f = e.finale;
    if (f) return chapters[['mrg', 'upload', 'victory'].includes(f.phase) ? 13 : ['maze', 'landing'].includes(f.phase) ? 12 : 11];
    const stage = Math.max(0, Math.min(3, Number(e.stage) || 0));
    if (e.phase === 'escort' && e.escort) return chapters[Math.min(8, stage * 3 + 2)];
    if (e.board && ['boarding', 'remark', 'paused'].includes(e.status)) return chapters[Math.min(10, stage * 3 + 1)];
    return chapters[stage * 3];
  }
  function contextKey(e) { return chapter(e).level + '/' + (e.finale?.phase || e.phase); }
  function metrics(e) {
    const o = e.escort?.ops240, f = e.finale;
    return { package: e.rescued?.length || 0, terminal: e.board?.completed?.length || 0,
      field: o?.stats?.fieldsPassed || 0, torpedo: o?.stats?.intercepts || 0,
      commander: o?.stats?.disruptions || 0, pursuit: e.pursuit?.chapter || 0,
      jammer: e.pursuit?.jammersDestroyed || 0, swarm: e.swarm?.packet || 0,
      support: f?.phase === 'boss' ? 4 - (e.enemies || []).filter(x => x.core && !x.dead).length : 0,
      mrg: f?.waveIndex || 0 };
  }
  function state(e) {
    let s = states.get(e);
    if (!s) { s = { key: contextKey(e), clock: 0, last: -24, pending: null, metrics: metrics(e),
      spoken: new Set(), counts: Object.create(null), history: [] }; states.set(e, s); }
    return s;
  }
  function safe(e) {
    if (!e || ARCADE.engine !== e || !['playing', 'boarding'].includes(e.status) ||
        typeof STATE !== 'undefined' && STATE.view !== 'arcade' || document.hidden ||
        typeof CUP !== 'undefined' && CUP.panel || typeof MOBILE !== 'undefined' && (MOBILE.command || MOBILE.menu) ||
        e.board?.intro > 0 || e.captainClock > 0) return false;
    const voice = globalThis.CITADEL_VOICE;
    return typeof voice?.tacticalWarning === 'function' && !voice.status().busy && !voice.tacticalWarning(e);
  }
  function watch(e, dt) {
    const s = state(e), key = contextKey(e), next = metrics(e);
    if (key !== s.key) { s.key = key; s.pending = null; s.metrics = next; }
    if (!['playing', 'boarding'].includes(e.status)) { s.pending = null; s.metrics = next; return; }
    s.clock += Math.max(0, Math.min(.05, Number(dt) || 0));
    for (const kind of ['commander', 'torpedo', 'pursuit', 'jammer', 'field', 'swarm', 'support', 'mrg', 'terminal', 'package']) {
      if (next[kind] <= s.metrics[kind]) continue;
      const milestone = ['pursuit', 'swarm', 'mrg'].includes(kind) ? '/' + next[kind] : '';
      const id = key + '/' + kind + milestone;
      if (!s.spoken.has(id) && !s.pending) s.pending = { id, kind, value: next[kind], expires: s.clock + 9 };
    }
    s.metrics = next;
    if (s.pending && (s.clock > s.pending.expires || s.spoken.has(s.pending.id))) s.pending = null;
    if (!s.pending || s.clock - s.last < 24 || !safe(e)) return;
    const item = s.pending, lines = reactions[item.kind], index = s.counts[item.kind] || 0;
    // Per-event/per-mission dedupe, plus a minimum quiet interval. No backlog
    // is played on resume or after a long tactical warning.
    const text = lines[item.kind === 'mrg' ? Math.min(1, Math.max(0, item.value - 1)) : index % lines.length];
    s.pending = null; s.spoken.add(item.id); s.counts[item.kind] = index + 1; s.last = s.clock;
    if (s.spoken.size > 64) s.spoken.delete(s.spoken.values().next().value);
    s.history.push({ level: chapter(e).level, kind: item.kind, at: +s.clock.toFixed(2), text });
    if (s.history.length > 32) s.history.shift();
    e.say(text, 'order', false);
  }
  const p = RequirementArcade.prototype, previousStep = p.step;
  p.step = function (delta, ...args) {
    state(this);
    const result = previousStep.call(this, delta, ...args);
    watch(this, delta);
    return result;
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (typeof arcadeOverlayHTML === 'function') {
    const overlay = arcadeOverlayHTML;
    arcadeOverlayHTML = function (...args) {
      let html = overlay.apply(this, args);
      if (typeof html !== 'string') return html;
      if (html.includes('citadel-prologue')) return html
        .replace('МРГ не даст так просто передать ФТ в работу. Его солдаты уже вышли из логова: впереди засады, ракетчики, ниндзя и робособаки.',
          'Путь к исполнению перекрыт. Впереди охрана станций, ударные звенья и ядро МРГ. Чтобы пройти, придётся защищать и корабль, и принятые решения.')
        .replace('На поздних палубах жди подкрепления. Даже за спиной.', 'Сначала разберись с охраной. Потом — с аргументами.')
        .replace('Живой компьютер МРГ отправляет солдат, ниндзя и робособак остановить аналитика.', 'Охрана МРГ готовится остановить аналитика.');
      const e = ARCADE.engine;
      if (e && ['briefing', 'escortbrief', 'finalebrief'].includes(e.status) &&
          !(typeof CUP !== 'undefined' && CUP.panel) && !html.includes('citadel-narrative-note')) {
        const q = chapter(e);
        html = html.replace(/(<button\b[^>]*class="arcade-play"[^>]*>)/,
          '<p class="citadel-narrative-note">' + escape(q.context) + '</p>$1');
      }
      return html;
    };
  }
  globalThis.CITADEL_NARRATIVE = Object.freeze({ version: VERSION, chapters, chapter,
    inspection(e = ARCADE.engine) { const s = e && states.get(e); return { version: VERSION, level: chapter(e).level,
      pending: s?.pending?.kind || null, spoken: s?.spoken.size || 0, history: s ? s.history.map(x => ({ ...x })) : [] }; }
  });
}());
