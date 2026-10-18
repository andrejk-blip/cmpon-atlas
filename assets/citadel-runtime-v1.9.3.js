/* Citadel 1.9.3: bounded frame diagnostics and reliable name-entry feedback.
 * No score changes, guest auto-entry, server writes or authentication bypass.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_RUNTIME || typeof ARCADE === 'undefined') return;
  const VERSION = '1.9.3';
  let fault = null, notice = null, frameCount = 0;
  function hideNotice() { if (notice) { notice.remove(); notice = null; } }
  function showNotice(text, mode) {
    hideNotice();
    notice = document.createElement('section');
    notice.id = 'citadel-runtime-notice'; notice.setAttribute('role', mode === 'fault' ? 'alert' : 'status');
    notice.style.cssText = 'position:fixed;z-index:11000;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:680px;margin:auto;padding:14px 16px;box-sizing:border-box;border:1px solid #89b9bd;border-radius:8px;background:#102835;color:#eef5ed;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 24px #0008';
    const message = document.createElement('div'); message.textContent = text; notice.appendChild(message);
    function button(label, handler) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'min-height:44px;margin:10px 10px 0 0;padding:8px 12px;border:1px solid #89b9bd;border-radius:5px;background:#c3e9d9;color:#142e34;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', handler); notice.appendChild(b);
    }
    if (mode === 'fault') button('Перезагрузить игру', () => globalThis.location.reload());
    else {
      button('Понятно', hideNotice);
      if (typeof CUP !== 'undefined' && !CUP.busy && ARCADE.engine?.status === 'menu')
        button('Пока без рейтинга', () => { hideNotice(); arcadeAction('cup-guest'); });
    }
    document.body.appendChild(notice);
  }
  function feedback() {
    if (typeof CUP === 'undefined' || STATE.view !== 'arcade') return;
    if (ARCADE.engine?.status !== 'menu' || CUP.panel) { if (!fault) hideNotice(); return; }
    const message = document.getElementById('cup-message');
    if (message) {
      message.setAttribute('aria-live', 'polite');
      message.textContent = CUP.busy ? 'Подключаемся к таблице рекордов…' : CUP.error || '';
    }
    if (CUP.error && !CUP.busy) showNotice(CUP.error, 'connection');
    else if (!fault) hideNotice();
  }
  if (typeof cupEnsureProfile === 'function') {
    const ensure = cupEnsureProfile;
    cupEnsureProfile = async function (name) {
      // A background check of an old/empty device can finish without a player.
      // Do not lose the name submitted while that request is still pending.
      if (name && CUP.authPromise) { try { await CUP.authPromise; } catch (_) {} }
      return ensure.apply(this, arguments);
    };
  }
  if (typeof cupAPI === 'function') {
    const api = cupAPI;
    cupAPI = async function () {
      try { return await api.apply(this, arguments); }
      catch (error) {
        if (error?.name === 'TypeError' || ['AbortError', 'TimeoutError'].includes(error?.name)) {
          const readable = new Error('Нет ответа от сервера рекордов. Проверьте связь и повторите запуск. Можно выбрать «Пока без рейтинга»; сохранённая попытка не удаляется.');
          readable.status = error.status; throw readable;
        }
        throw error;
      }
    };
  }
  if (typeof cupRefreshUI === 'function') {
    const refresh = cupRefreshUI;
    cupRefreshUI = function () { const result = refresh.apply(this, arguments); feedback(); return result; };
  }
  document.addEventListener('submit', function (event) {
    if (event.target?.id === 'cup-entry-form') setTimeout(feedback, 0);
  }, true);
  document.addEventListener('invalid', function (event) {
    if (event.target?.id === 'cup-name') showNotice('Введите имя или позывной: от 2 до 32 символов.', 'validation');
  }, true);
  if (typeof arcadeFrame === 'function') {
    const frame = arcadeFrame;
    arcadeFrame = function (now) {
      if (fault) return;
      frameCount++;
      try { return frame.apply(this, arguments); }
      catch (error) {
        const e = ARCADE.engine;
        fault = {version: VERSION, message: String(error?.message || error).slice(0, 400),
          stack: String(error?.stack || '').slice(0, 2400), stage: e?.stage,
          phase: e?.finale?.phase || e?.phase, status: e?.status, elapsed: e?.elapsed, frames: frameCount};
        // Stop safely. Do not retry a half-completed step or overwrite a checkpoint.
        if (e && e.status !== 'paused') { e.resumeStatus = e.status; e.status = 'paused'; }
        try { clearArcadeInput(); spaceAudioStop(); } catch (_) {}
        try { updateArcadeOverlay(); } catch (_) {}
        console.error('Citadel: game frame stopped', fault);
        try { localStorage.setItem('cmpon.citadel.last-runtime-error.v1', JSON.stringify(fault)); } catch (_) {}
        showNotice('Игровой цикл остановился из-за ошибки. Сохранение не удалено. Перезагрузите игру, чтобы продолжить с последнего сохранённого места.', 'fault');
      }
    };
  }
  globalThis.CITADEL_RUNTIME = Object.freeze({version: VERSION, status: () => ({frames: frameCount, fault: fault && {...fault}})});
}());
