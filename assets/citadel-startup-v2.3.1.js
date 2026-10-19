/* Citadel 2.3.1: ES5 startup notice, loaded before compatibility and game scripts. */
(function (window, document) {
  'use strict';
  if (window.CITADEL_STARTUP) return;

  var failed = false;
  var finished = false;
  var retry = document.getElementById('citadel-startup-retry');
  var slowTimer = window.setTimeout(function () {
    if (finished || failed) return;
    var notice = document.getElementById('citadel-startup');
    var message = document.getElementById('citadel-startup-message');
    if (notice) notice.hidden = false;
    if (message) message.textContent = 'Игра загружается дольше обычного. Можно подождать или повторить загрузку.';
    if (retry) retry.hidden = false;
  }, 12000);

  function gameScript(source) {
    if (typeof source !== 'string') return false;
    var clean = source.split(/[?#]/)[0];
    var name = clean.substring(clean.lastIndexOf('/') + 1);
    return /^(atlas-v[0-9][a-z0-9._-]*|citadel-[a-z0-9._-]+|game-test-v[0-9][a-z0-9._-]*)\.js$/i.test(name);
  }

  function onError(event) {
    if (finished) return;
    var target = event.target;
    var source;
    if (target && target.tagName) {
      if (String(target.tagName).toUpperCase() !== 'SCRIPT') return;
      source = target.src || (target.getAttribute && target.getAttribute('src'));
    } else source = event.filename;
    if (!gameScript(source)) return;

    failed = true;
    var notice = document.getElementById('citadel-startup');
    var message = document.getElementById('citadel-startup-message');
    if (notice) notice.hidden = false;
    if (message) message.textContent = 'Не удалось загрузить файлы игры. Повторите загрузку; если ошибка повторяется, откройте ссылку в обновлённом браузере.';
    if (retry) retry.hidden = false;
  }

  function onRetry() {
    window.location.reload();
  }

  function onReady() {
    if (finished) return;
    finished = true;
    window.clearTimeout(slowTimer);
    window.removeEventListener('error', onError, true);
    document.removeEventListener('DOMContentLoaded', onReady, false);
    if (!failed) {
      var notice = document.getElementById('citadel-startup');
      if (notice) notice.hidden = true;
      if (retry) retry.removeEventListener('click', onRetry, false);
    }
  }

  window.CITADEL_STARTUP = { version: '2.3.1' };
  if (retry) retry.addEventListener('click', onRetry, false);
  window.addEventListener('error', onError, true);
  document.addEventListener('DOMContentLoaded', onReady, false);
  // Deferred scripts run while readyState is interactive: keep the notice until
  // DOMContentLoaded, which waits for the following large game bundle as well.
  if (document.readyState === 'complete') onReady();
})(window, document);
