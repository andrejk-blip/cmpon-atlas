/* Navigation only. Legacy game data, runtime and save keys are untouched. */
'use strict';
(() => {
  const gameHashes = new Set(['#arcade', '#tournament']);
  const path = location.pathname.split('/').pop();
  const views = new Set(['map', 'requirements', 'cosmos', 'questions', 'stats', 'methods', 'reverse']);
  const destination = view => new URL('./atlas.html#cmpon/' + (views.has(view) ? view : 'map'), location.href).href;
  if ((!path || path === 'index.html') && !gameHashes.has(location.hash)) {
    const view = location.hash.slice(1);
    location.replace(destination(view));
    return;
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action="view"]');
    if (!control || !views.has(control.dataset.value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destination(control.dataset.value));
  }, true);
  // The standalone game hides the old Atlas sidebar. Keep a return link in
  // its existing supplementary menu without altering the game renderer.
  document.addEventListener('toggle', event => {
    const menu = event.target;
    if (!(menu instanceof HTMLDetailsElement) || !menu.open) return;
    const academy = menu.querySelector('a[href="./academy.html"]');
    if (!academy || menu.querySelector('[data-atlas-return]')) return;
    const link = document.createElement('a');
    link.href = './atlas.html';
    link.textContent = 'Атлас требований ↗';
    link.dataset.atlasReturn = 'true';
    academy.before(link);
  }, true);
})();
