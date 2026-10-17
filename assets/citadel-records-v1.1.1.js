/* «Цитадель ЦСИИ» · список участников 1.1.1
   Load after the game core. Registration rows come from the server;
   this module never creates scores, results, profiles, or saved games. */
(() => {
  'use strict';
  if (typeof CUP === 'undefined' || typeof STATE === 'undefined' ||
      typeof cupBoardHTML !== 'function' || typeof cupPanelHTML !== 'function' ||
      typeof cupLobbyHTML !== 'function' || typeof cupRefreshBoard !== 'function' ||
      globalThis.CITADEL_RECORDS) return;

  const VERSION = '1.1.1', INTERVAL = 10000;
  const old = { board: cupBoardHTML, panel: cupPanelHTML, lobby: cupLobbyHTML };
  let inFlight = 0, latest = null;
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const key = () => JSON.stringify([CUP.selected, CUP.board, CUP.mode]);
  function closedTournament() {
    const cup = CUP.config?.cups?.find(item => item.id === CUP.selected);
    return !!cup && (cup.state === 'finished' || Number.isFinite(cup.endsAt) && cup.endsAt <= Date.now());
  }

  cupBoardHTML = function () {
    if (CUP.boardError || !CUP.rows) return old.board();
    if (!CUP.rows.length) return closedTournament()
      ? '<div class="cup-empty"><b>В этом турнире нет зафиксированных результатов.</b><p>Приём результатов завершён.</p></div>'
      : '<div class="cup-empty"><b>Пока нет участников.</b><p>После регистрации игрок появится здесь с 0 очков.</p></div>';
    const campaign = CUP.board === -1;
    return `<table class="cup-table"><caption class="sr-only">${campaign ? 'Вся кампания' : esc(CUP_LEVELS[CUP.board])}</caption><thead><tr><th scope="col">№</th><th scope="col">Аналитик</th><th scope="col">${campaign ? 'Этапы' : 'Этап'}</th><th scope="col">Очки</th><th scope="col">Время</th></tr></thead><tbody>${CUP.rows.map(row => {
      // An absent flag is a legacy result, including a legitimate zero score.
      const noResult = row.has_result === false, you = row.player_id === CUP.player?.id;
      const progress = campaign ? Math.min(14, number(row.progress)) + '/14' : noResult ? '—' : number(CUP.board) + 1;
      const duration = noResult ? '<span title="Этап ещё не завершён">—</span>' : cupTime(number(row.duration));
      return `<tr class="${you ? 'cup-you' : ''}"><td>${number(row.rank) || '—'}</td><th scope="row">${esc(row.name)}${you ? '<small>вы</small>' : ''}</th><td>${progress}</td><td>${number(row.score).toLocaleString('ru-RU')}</td><td>${duration}</td></tr>`;
    }).join('')}</tbody></table>`;
  };

  cupLobbyHTML = function () {
    return old.lobby().replace('<small id="cup-entry-hint">', '<small id="cup-entry-hint">После регистрации вы появитесь в таблице с 0 очков. ');
  };
  cupPanelHTML = function () {
    const note = closedTournament()
      ? 'Итоги турнира зафиксированы · до 500 мест.'
      : 'Все зарегистрированные игроки, включая участников с 0 очков. Лучший результат в выбранном зачёте · до 500 мест.';
    return old.panel().replace('Лучший результат каждого участника · до 500 мест.', note + ' <span id="cup-records-refresh-status" role="status">Обновление каждые 10 секунд.</span>');
  };

  function status(message) {
    const element = document.getElementById('cup-records-refresh-status');
    if (element && element.textContent !== message) element.textContent = message;
  }
  function paint() {
    if (CUP.panel !== 'records' || STATE.view !== 'arcade') return;
    const element = document.getElementById('cup-board');
    if (!element) return;
    // Keep a focused retry button intact until the user moves away. The table
    // container and all filters remain the same DOM nodes during a refresh.
    if (document.activeElement !== element && element.contains(document.activeElement)) return;
    const top = element.scrollTop, left = element.scrollLeft;
    const html = cupBoardHTML();
    if (element.innerHTML !== html) element.innerHTML = html;
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  function refresh(background = false) {
    const filter = key();
    if (latest && latest.key === filter && latest.serial === CUP.boardSerial) return latest.promise;
    // A foreground filter change may supersede an older request. A timer never
    // adds another request while any earlier one is still in flight.
    if (background && inFlight) return Promise.resolve();
    const request = { key: filter, serial: ++CUP.boardSerial, promise: null };
    latest = request;
    inFlight++;
    CUP.boardError = '';
    const path = 'board?cup=' + encodeURIComponent(CUP.selected) + '&level=' + CUP.board + '&mode=' + CUP.mode;
    request.promise = (async () => {
      try {
        const data = await cupAPI(path);
        if (request.serial !== CUP.boardSerial) return;
        if (!Array.isArray(data?.rows)) throw Error('Не удалось прочитать таблицу участников.');
        CUP.rows = data.rows;
        status('Обновление каждые 10 секунд.');
      } catch (error) {
        if (request.serial !== CUP.boardSerial) return;
        if (background && Array.isArray(CUP.rows)) {
          status('Не удалось обновить. Повторим автоматически.');
          return;
        }
        CUP.boardError = error?.message || 'Не удалось обновить таблицу участников.';
      } finally {
        inFlight--;
        if (latest === request) latest = null;
      }
      if (request.serial === CUP.boardSerial) paint();
    })();
    return request.promise;
  }
  cupRefreshBoard = function () { return refresh(); };

  if (location.protocol !== 'file:') setInterval(() => {
    if (STATE.view === 'arcade' && CUP.panel === 'records' && !document.hidden &&
        (typeof document.hasFocus !== 'function' || document.hasFocus()) && !inFlight) void refresh(true);
  }, INTERVAL);
  globalThis.CITADEL_RECORDS = Object.freeze({ version: VERSION, interval: INTERVAL });
})();
