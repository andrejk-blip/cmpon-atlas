/* Citadel 2.3.1: bounded optional ranking, isolated local campaigns, no telemetry. */
(function (root) {
  'use strict';
  function install() {
    if (root.CITADEL_LAUNCH || typeof CUP === 'undefined') return;
    const VERSION = '2.3.1', LIMIT = 7000, KEY = 'cmpon.citadel.local.v1';
    const NETWORK = 'Нет связи с сервером результатов. Игра доступна на устройстве.';
    const old = { refresh: cupRefresh, flush: cupFlush, enqueue: cupEnqueue,
      recover: cupRecoverOutbox, action: arcadeAction, cupAction };
    const requests = new Set(), events = [];
    let local = false, attempt = 0, localTask = null, memory = null, storage = 'available';
    let connection = 'checking', localMessage = '', invalidSave = false;
    const safePath = path => ['config','enter','me','start','run','save','board','profile'].includes(path.split('?')[0]) ? path.split('?')[0] : 'other';
    function record(kind, path = '', status = 0) {
      events.push({ event: kind, endpoint: safePath(path), status: Number(status) || 0 });
      if (events.length > 32) events.shift();
    }
    function cancelled() { const e = new Error(''); e.name = 'LaunchCancelled'; return e; }
    function isNetwork(e) { return e?.launchNetwork === true; }
    function fail(kind, path, status) {
      connection = 'unavailable'; record(kind, path, status);
      const e = new Error(NETWORK); e.launchNetwork = true;
      if (status) e.status = status;
      return e;
    }

    cupAPI = function (path, body) {
      if (local && !['config', 'board'].includes(safePath(path))) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        let done = false, timer;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const request = { cancel: () => finish(cancelled()) };
        function finish(error, data) {
          if (done) return; done = true; clearTimeout(timer); requests.delete(request);
          if (error) { controller?.abort(); reject(error); } else resolve(data);
        }
        requests.add(request);
        timer = setTimeout(() => finish(fail('timeout', path)), LIMIT);
        const options = { method: body ? 'POST' : 'GET', mode: 'cors', credentials: 'omit',
          headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(CUP.token ? { Authorization: 'Bearer ' + CUP.token } : {}) },
          body: body ? JSON.stringify(body) : undefined, ...(controller ? { signal: controller.signal } : {}) };
        Promise.resolve().then(() => fetch(CUP_API + path, options)).then(async response => {
          if (done) return;
          if (response.status >= 500 || response.status === 429) return finish(fail('http-unavailable', path, response.status));
          let data;
          try { data = await response.json(); }
          catch (_) { if (!done) finish(fail('invalid-response', path, response.status)); return; }
          if (done) return;
          if (!response.ok) { const e = new Error(data.error || 'Не удалось выполнить запрос.'); e.status = response.status; finish(e); return; }
          connection = 'connected'; record('response', path, response.status); finish(null, data);
        }).catch(() => { if (!done) finish(fail('network', path)); });
      });
    };

    function valid(snapshot) {
      const e = snapshot?.engine;
      return snapshot?.schema === 1 && Number.isFinite(snapshot.rng) && e &&
        Number.isInteger(e.seed) && e.seed >= 0 && Number.isInteger(e.stage) && e.stage >= 0 && e.stage <= 3 &&
        typeof e.assist === 'boolean' && Number.isFinite(e.score) && Number.isFinite(e.elapsed) &&
        ['briefing','playing','boarding','docking','crashing','paused','lesson','remark','finalcheck',
          'stageclear','escortclear','campaignclear','finalebrief','lost','won'].includes(e.status) &&
        Array.isArray(e.enemies) && Array.isArray(e.rescued) && e.player && e.upgrades;
    }
    function readLocal() {
      if (memory) return memory;
      let raw;
      try { raw = localStorage.getItem(KEY); }
      catch (_) { storage = 'memory'; return null; }
      try {
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (value.schema !== 1 || !valid(value.snapshot)) { invalidSave = true; return null; }
        return memory = value;
      } catch (_) { invalidSave = true; return null; }
    }
    readLocal();
    function saveLocal() {
      const e = ARCADE.engine;
      if (!local || !e || e.status === 'menu') return false;
      try {
        const snapshot = cupPack(e);
        if (!valid(snapshot)) return false;
        memory = { schema: 1, version: VERSION, savedAt: Date.now(), snapshot };
        const json = JSON.stringify(memory);
        if (json.length > 2 * 1024 * 1024) throw Error('size');
        // Preserve an unreadable older value before replacing it with a new game.
        if (invalidSave) { const raw = localStorage.getItem(KEY); if (raw) localStorage.setItem(KEY + '.unreadable', raw); invalidSave = false; }
        localStorage.setItem(KEY, json); storage = 'available'; return true;
      } catch (_) {
        storage = 'memory';
        localMessage = 'Браузер не сохраняет данные. Прогресс доступен, пока открыта эта вкладка.';
        return false;
      }
    }
    function render() {
      CUP.uiRevision++; ARCADE.overlayToken = '';
      if (ARCADE.engine && ARCADE.canvas) { updateArcadeHUD(); updateArcadeOverlay(); }
    }
    function restore(snapshot) {
      const run = { seed: snapshot.engine.seed, mode: snapshot.engine.assist ? 'calm' : 'normal' };
      const e = cupUnpack(snapshot, run);
      ARCADE.engine = e; ARCADE.mode = run.mode; ARCADE.feed = []; ARCADE.camera = null;
      ARCADE.rescueToken = ''; ARCADE.captainSerial = -1;
      clearArcadeInput(); e.pause();
    }
    async function startLocal(forceNew = false, reason = '') {
      if (localTask) return localTask;
      if (local && ARCADE.engine?.status !== 'menu' && !forceNew) return;
      const serial = ++attempt;
      if (CUP.attached && CUP.run) old.enqueue();
      CUP.attached = false; local = true; CUP.busy = false;
      for (const request of [...requests]) request.cancel();
      localTask = (async () => {
        // Finish cancelled send callbacks before detaching their in-memory run.
        // The original outbox, device identity and token stay in localStorage.
        await Promise.resolve(CUP.flushPromise).catch(() => {});
        if (serial !== attempt) return;
        CUP.run = null; CUP.queue = []; CUP.conflict = false; CUP.recovered = false;
        if (CUP.panel) cupClosePanel(false);
        localMessage = reason || 'Игра на устройстве · без общей таблицы рекордов.';
        CUP.error = '';
        const saved = !forceNew && readLocal();
        if (saved) {
          try { restore(saved.snapshot); }
          catch (_) { local = false; CUP.error = 'Не удалось восстановить локальное прохождение. Оно сохранено. Можно начать новую игру.'; record('restore-failed'); render(); return; }
        } else if (!forceNew && typeof finaleReadSave === 'function' && finaleReadSave()) {
          finaleRestore();
        } else if (!forceNew && ARCADE.checkpoint) {
          citadelRestore();
        } else startArcade();
        saveLocal(); render();
        if (reason || storage === 'memory') toast(localMessage);
        record(saved ? 'local-resumed' : 'local-started');
      })();
      try { return await localTask; } finally { localTask = null; }
    }

    cupFlush = function () { return local ? Promise.resolve() : old.flush(); };
    cupEnqueue = function (...args) { return local ? undefined : old.enqueue(...args); };
    cupRecoverOutbox = function () { return local ? Promise.resolve() : old.recover(); };
    cupRefresh = async function () {
      if (!local) return old.refresh();
      const data = await cupAPI('config'); CUP.config = data; CUP.ready = true; CUP.error = ''; cupRefreshUI();
    };
    async function startRanked(forceNew = false, name = '') {
      if (CUP.busy || localTask) return;
      saveLocal(); local = false; CUP.recovered = false;
      const serial = ++attempt, current = () => serial === attempt && !local;
      CUP.busy = true; CUP.error = ''; cupRefreshUI(true);
      // Bound the whole sequence (registration + config + resume), not just
      // each request. Clicking local entry can cancel it sooner.
      const deadline = setTimeout(() => {
        if (current()) void startLocal(false, 'Подключение к рейтингу заняло слишком много времени. Играем на устройстве.');
      }, LIMIT);
      try {
        await cupEnsureProfile(name); if (!current()) return;
        if (!CUP.player) { CUP.error = 'Введите имя для таблицы рекордов или начните игру на устройстве.'; return; }
        await cupRefresh(); if (!current()) return;
        if (CUP.conflict) { CUP.queue = []; CUP.run = null; CUP.conflict = false; CUP.attached = false; localStorage.removeItem('cmpon.cup.outbox.v1'); }
        cupEnqueue(); await cupFlush(); if (!current()) return;
        if (CUP.queue.length) throw fail('outbox-wait', 'save');
        const run = !forceNew && cupPlayableRun();
        const data = run ? await cupAPI('run?id=' + encodeURIComponent(run.id)) :
          await cupAPI('start', { autoTournament: true, mode: ARCADE.mode, gameVersion: CUP_GAME_VERSION });
        if (!current()) return;
        if (!data.run || data.run.status !== 'active') throw Error('Попытка недоступна. Обновите подключение.');
        await cupLaunch(data.run, !!run); record('ranked-started');
      } catch (error) {
        if (!current() || error?.name === 'LaunchCancelled') return;
        if (isNetwork(error)) await startLocal(false, 'Рейтинг недоступен. Продолжаем на устройстве; этот запуск — без рейтинга.');
        else CUP.error = error.message || 'Не удалось начать игру.';
      } finally {
        clearTimeout(deadline);
        if (serial === attempt) CUP.busy = false;
        cupRefreshUI(true);
      }
    }
    cupStartDefault = forceNew => startRanked(forceNew);

    cupNotice = function () {
      if (local) return '<span>' + esc(localMessage) + '</span>';
      if (connection === 'unavailable') return '<span>Рейтинг пока недоступен. Можно играть на устройстве.</span>';
      if (!CUP.ready) return '<span>Проверяем связь с рейтингом. Игру на устройстве можно начать сразу.</span>';
      const c = cupCurrent();
      return c ? '<strong>' + esc(c.title) + '</strong><span>Участие и результаты доступны при подключении.</span>' : '<span>Можно играть с общим рейтингом или только на устройстве.</span>';
    };
    cupLobbyHTML = function () {
      const saved = readLocal() || ARCADE.checkpoint || ARCADE.finaleCheckpoint;
      const offline = connection === 'unavailable', run = cupPlayableRun();
      return `<div class="arcade-menu campaign-menu cup-lobby"><div class="cup-lobby-heading"><span class="arcade-serial">РЕДАКЦИЯ ПОД ЗАЩИТОЙ</span><h3>ЦИТАДЕЛЬ <span>ЦСИИ</span></h3><p>Защитите ФТ от лишних замечаний и доведите документ до согласования.</p></div>
        <div class="cup-notice" id="cup-notice" role="status">${cupNotice()}</div>
        <div class="cup-entry">
        ${(offline || saved) ? `<button class="arcade-play" data-action="launch-local">${saved ? 'Продолжить на устройстве' : 'Начать игру без рейтинга'} →</button>` : ''}
        ${CUP.player ? `<div class="cup-identity"><span>Аналитик <b>${esc(CUP.player.name)}</b></span><button class="cup-link" data-action="cup-rename">Изменить имя</button></div><button class="${offline || saved ? 'arcade-secondary' : 'arcade-play'}" data-action="cup-play"${CUP.busy ? ' disabled' : ''}>${CUP.busy ? 'Подключаем рейтинг…' : run ? 'Продолжить с рейтингом' : 'Начать с рейтингом'}</button>` : `<form id="cup-entry-form"><label for="cup-name">Имя для таблицы рекордов</label><div class="cup-name-row"><input id="cup-name" name="name" autocomplete="nickname" enterkeyhint="go" minlength="2" maxlength="32" required placeholder="Имя или позывной" value="${attr(CUP.nameDraft || '')}" aria-describedby="cup-entry-hint"><button class="${offline || saved ? 'arcade-secondary' : 'arcade-play'}" type="submit"${CUP.busy ? ' disabled' : ''}>${CUP.busy ? 'Подключаем рейтинг…' : 'Начать игру →'}</button></div></form>`}
        <small id="cup-entry-hint">Если сервер недоступен, игра запустится на устройстве без рейтинга.</small>
        ${!offline && !saved ? '<button class="arcade-secondary" data-action="launch-local">Начать сразу · без рейтинга</button>' : ''}
        ${saved ? '<button class="cup-link" data-action="launch-new">Новая игра на устройстве</button>' : ''}
        <div class="arcade-mode"><button data-action="arcade-mode" data-value="calm" class="${ARCADE.mode === 'calm' ? 'active' : ''}">Учебный</button><button data-action="arcade-mode" data-value="normal" class="${ARCADE.mode === 'normal' ? 'active' : ''}">Боевой</button></div>
        <p id="cup-message" class="cup-message" role="status">${esc(CUP.error || (invalidSave ? 'Локальное сохранение не прочитано. Исходные данные будут сохранены отдельно.' : ''))}</p></div>
        <div class="cup-lobby-footer"><button class="arcade-secondary" data-action="cup-records">Рекорды</button><button class="cup-link" data-action="cup-refresh">Проверить подключение</button></div>
        ${offline || CUP.error ? `<details><summary>Сведения для сообщения об ошибке</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify({version:VERSION,connection,storage,renderer:ARCADE.renderer?.mode || 'pending',pending:requests.size,events:events.slice(-6)},null,2))}</pre></details>` : ''}
        <small class="app-release">Приложение v${esc(APP_RELEASE.version)} · ФТ 2.0.2</small></div>`;
    };
    cupAction = function (action) { return action === 'cup-guest' ? startLocal() : old.cupAction(action); };
    arcadeAction = function (action, value) {
      if (action === 'launch-local' || action === 'launch-new') { void startLocal(action === 'launch-new'); return true; }
      if (local && ['arcade-menu','arcade-start','citadel-continue','finale-restore'].includes(action)) {
        saveLocal();
        if (action === 'arcade-start') { void startLocal(true); return true; }
        return cupOriginalAction(action, value);
      }
      return old.action(action, value);
    };
    // Capture only this form; keep the existing rename form and its validation.
    document.addEventListener('submit', event => {
      if (event.target.id !== 'cup-entry-form') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const name = String(new FormData(event.target).get('name') || '').trim(); CUP.nameDraft = name;
      if (name.length < 2 || name.length > 32) { CUP.error = 'Имя должно содержать от 2 до 32 символов.'; cupRefreshUI(); return; }
      void startRanked(false, name);
    }, true);
    setInterval(saveLocal, 5000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(); });
    root.addEventListener('pagehide', saveLocal);
    root.CITADEL_LAUNCH = Object.freeze({ version: VERSION,
      status: () => ({ version: VERSION, local, connection, storage, pending: requests.size, timeoutMs: LIMIT, events: events.slice() }) });
  }
  root.CITADEL_LAUNCH_INSTALL = install;
  if (typeof CUP !== 'undefined') install();
})(globalThis);
