/* Citadel 1.7.0 — brief combat notices beneath the player on station decks.
 * Loaded after the frozen campaign core. Decisions, tutorials and the original
 * HUD keep their own renderers. Presentation state is memory-only and is never
 * added to the engine or its saved checkpoint.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_FIELD_UI?.version === '1.7.0') return;
  if (typeof RequirementArcade !== 'function' || typeof spaceProject !== 'function') return;

  const VERSION = '1.7.0';
  const LIFETIME = 1.8, QUIET_TIME = 1.0;
  const states = new WeakMap();
  const receiving = new WeakSet();
  const combatTitles = new Set(['ПОТОК ПЕРЕХВАЧЕН', 'ЗАМЕЧАНИЕ ПЕРЕХВАЧЕНО', 'ИМПУЛЬС']);
  const previousNotify = RequirementArcade.prototype.notify;
  const previousClarity = updateCitadelClarity;
  const previousDrawClarity = drawClarityHUD;
  const previousMobileHUD = drawMobileGameHUD;

  function deck(e) {
    return !!(e?.board?.cells && !e.finale && e.phase === 'boarding');
  }
  function combat(e, toast = e?.toast) {
    return deck(e) && !!toast && combatTitles.has(toast.title);
  }
  function clock() {
    return typeof performance?.now === 'function' ? performance.now() / 1000 : Date.now() / 1000;
  }
  function showingGame(e) {
    return deck(e) && e.status === 'boarding' && !document.hidden &&
      STATE.view === 'arcade' && !(e.board.intro > 0);
  }
  function state(e) {
    let s = states.get(e);
    if (!s) {
      s = { toast: null, start: -Infinity, end: -Infinity, quietUntil: -Infinity,
        wallEnd: -Infinity, count: 0, type: '', name: '', active: false, bounds: null };
      states.set(e, s);
    }
    return s;
  }
  function dismiss(e) {
    const s = e && states.get(e);
    if (s) { s.active = false; s.bounds = null; }
  }
  function active(e) {
    const s = e && states.get(e);
    if (!s || !s.active) return null;
    if (!showingGame(e) || (e.toast !== s.toast && !receiving.has(e)) || e.elapsed >= s.end ||
      e.elapsed < s.start || clock() >= s.wallEnd) {
      dismiss(e);
      return null;
    }
    return s;
  }
  function hideDuplicate(e) {
    if (combat(e)) {
      const el = document.getElementById('citadel-toast');
      if (el) el.hidden = true;
    }
  }
  function receive(e) {
    if (!combat(e) || !showingGame(e)) { dismiss(e); return; }
    const s = state(e), now = e.elapsed, wall = clock();
    const continuing = s.active && now >= s.start && now < s.end && wall < s.wallEnd;
    if (!continuing) {
      s.active = false;
      if (now < s.quietUntil && now >= s.start) return;
      s.start = now;
      s.end = now + LIFETIME;
      s.wallEnd = wall + LIFETIME;
      s.quietUntil = s.end + QUIET_TIME;
      s.count = 0;
    }
    const type = e.toast.title === 'ИМПУЛЬС' ? 'pulse' : 'intercept';
    s.count = type === 'intercept' ? (continuing && s.type === type ? s.count + 1 : 1) : 0;
    s.type = type;
    s.name = String(e.toast.detail || '').split(' · ')[0].trim();
    s.toast = e.toast;
    s.active = true;
    s.bounds = null;
  }

  // Only actual, newly emitted combat notices are eligible. A toast restored
  // from a save has no presentation state and cannot replay itself.
  RequirementArcade.prototype.notify = function () {
    let result;
    receiving.add(this);
    try { result = previousNotify.apply(this, arguments); }
    finally { receiving.delete(this); }
    receive(this);
    hideDuplicate(this);
    return result;
  };
  updateCitadelClarity = function () {
    const result = previousClarity.apply(this, arguments);
    const e = ARCADE.engine;
    active(e);
    hideDuplicate(e);
    return result;
  };

  function textFor(s) {
    if (s.type === 'pulse') return 'Импульс · щиты сбиты';
    if (s.count > 1) return 'Перехвачено: ' + s.count;
    const name = s.name && !s.name.startsWith('Зал:') ? s.name : '';
    return 'Поток перехвачен' + (name ? ' · ' + name : '');
  }
  function ellipsis(c, text, maxWidth) {
    if (c.measureText(text).width <= maxWidth) return text;
    let result = text;
    while (result && c.measureText(result + '…').width > maxWidth) result = result.slice(0, -1);
    return result + '…';
  }
  function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
  }
  function hudLabels(e, cam, W, H, mobile) {
    const b = e.board, labels = [], sx = W / 1280, sy = H / 720;
    const target = b.completed.length < 3 ? b.terminals[b.completed.length] : b.exit;
    if (target) {
      const p = spaceProject(mobile ? target : V3.add(target, [0, 4, 0]), cam,
        mobile ? W : 1280, mobile ? H : 720);
      if (p.z > 0) {
        if (mobile) labels.push({ x: p.x - 116, y: Math.max(40, p.y - 28), width: 232, height: 40 });
        else if (p.x > 70 && p.x < 1210 && p.y > 100 && p.y < 610)
          labels.push({ x: (p.x - 155) * sx, y: (p.y - 33) * sy, width: 310 * sx, height: 40 * sy });
      }
    }
    if (!mobile) for (const enemy of b.enemies || []) {
      if (enemy.dead) continue;
      const p = spaceProject(V3.add(enemy.pos, [0, 3.6, 0]), cam, 1280, 720);
      if (p.z > 0 && p.x >= 10 && p.x <= 1270 && p.y >= 95 && p.y <= 610)
        labels.push({ x: (p.x - 28) * sx, y: (p.y - 22) * sy, width: 56 * sx, height: 30 * sy });
    }
    return labels;
  }
  function rounded(c, x, y, width, height, radius) {
    c.beginPath();
    c.moveTo(x + radius, y); c.lineTo(x + width - radius, y);
    c.quadraticCurveTo(x + width, y, x + width, y + radius);
    c.lineTo(x + width, y + height - radius);
    c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    c.lineTo(x + radius, y + height); c.quadraticCurveTo(x, y + height, x, y + height - radius);
    c.lineTo(x, y + radius); c.quadraticCurveTo(x, y, x + radius, y); c.closePath();
  }
  function draw(c, e, cam, w, h, mobile) {
    const s = active(e);
    if (!s) return;
    s.bounds = null;
    const cssWidth = ARCADE.canvas?.getBoundingClientRect().width || w;
    const scale = w / cssWidth, W = w / scale, H = h / scale;
    if (!(W > 80 && H > 100 && scale > 0)) return;
    const foot = spaceProject(e.board.pos, cam, W, H);
    if (foot.z <= 0 || foot.x < 0 || foot.x > W || foot.y < 0 || foot.y > H) return;
    const margin = 8, height = mobile ? 22 : 24, fontSize = mobile ? 11 : 12;
    const top = mobile ? 44 : Math.max(44, (e.board.guideHint && !e.board.guide ? 168 : 120) * H / 720);
    const bottom = mobile ? H - 12 : H * 630 / 720;
    c.save(); c.scale(scale, scale);
    c.font = '600 ' + fontSize + 'px Arial';
    const text = ellipsis(c, textFor(s), Math.min(252, W - margin * 2 - 20));
    const width = Math.ceil(c.measureText(text).width) + 20;
    const x = Math.max(margin, Math.min(W - margin - width, foot.x - width / 2));
    const labels = hudLabels(e, cam, W, H, mobile);
    let box = null;
    for (const extra of [0, 8, 20]) {
      const candidate = { x, y: Math.max(top, foot.y + 11 + extra), width, height };
      if (candidate.y + height <= bottom && !labels.some(label => intersects(candidate, label))) {
        box = candidate; break;
      }
    }
    // An offscreen/low hero is preferable to a notice pushed above the actor or
    // onto health/terminal labels. New information will still expire normally.
    if (!box) { c.restore(); return; }
    const remaining = Math.min(s.end - e.elapsed, s.wallEnd - clock());
    c.globalAlpha = ARCADE.fx ? Math.min(1, remaining / .32) : 1;
    rounded(c, box.x, box.y, box.width, box.height, 6);
    c.fillStyle = '#07212be8'; c.fill();
    c.strokeStyle = '#80cdb587'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#c0f2d9'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, box.x + box.width / 2, box.y + box.height / 2 + .5);
    s.bounds = { ...box, heroX: foot.x, heroY: foot.y, viewportWidth: W, viewportHeight: H, text, mobile };
    c.restore();
  }

  // Desktop clarity is the final existing field HUD pass. Drawing after it
  // leaves the route, crosshair and health intact. Mobile has a separate pass.
  drawClarityHUD = function (c, e, cam, w, h) {
    const result = previousDrawClarity.apply(this, arguments);
    if (!isMobileLayout()) draw(c, e, cam, w, h, false);
    return result;
  };
  drawMobileGameHUD = function (c, e, cam, w, h) {
    const result = previousMobileHUD.apply(this, arguments);
    draw(c, e, cam, w, h, true);
    return result;
  };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) dismiss(ARCADE.engine);
  });

  globalThis.CITADEL_FIELD_UI = Object.freeze({
    version: VERSION,
    lifetime: LIFETIME,
    quietTime: QUIET_TIME,
    status(e = ARCADE.engine) {
      const s = active(e);
      return { version: VERSION, active: !!s, text: s ? textFor(s) : '', count: s?.count || 0,
        remaining: s ? Math.max(0, Math.min(s.end - e.elapsed, s.wallEnd - clock())) : 0,
        bounds: s?.bounds ? { ...s.bounds } : null };
    },
  });
}());
