/* Citadel 1.7.1 — readable requirement cargo, supplies and the real dock gate.
 * Presentation only: collection, rewards, saved progress and combat stay in the
 * shared engine. Loaded after the navigation and existing field UI modules.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_FLIGHT_VIEW?.version === '1.7.1') return;
  if (typeof RequirementArcade !== 'function' || typeof spaceSceneBase !== 'function') return;

  const VERSION = '1.7.1';
  const colors = { requirement: '#65ffd2', repair: '#7edfff', missiles: '#ffd58d' };
  const flightPhases = new Set(['orientation', 'battle', 'retrieve', 'dock']);
  const originalScene = spaceSceneBase;
  const originalObjective = RequirementArcade.prototype.objective;
  const originalClarity = drawClarityHUD;
  const originalCampaignHUD = drawCampaignFlightHUD;
  const originalMobileHUD = drawMobileGameHUD;
  const originalUpdate = updateArcadeHUD;
  const originalOverlay = arcadeOverlayHTML;

  function flight(e) {
    return !!e && !e.finale && !e.crash && flightPhases.has(e.phase);
  }
  function count(e) { return e.progress().modules; }
  function description(item) {
    if (item.type === 'requirement') return 'ПАКЕТ ФТ · ' + (REQS.get(item.reqId)?.number || 'ТРЕБОВАНИЕ');
    return item.type === 'repair' ? 'ЩИТ +30' : 'РАКЕТЫ +3';
  }
  function mobile() { return typeof isMobileLayout === 'function' && isMobileLayout(); }

  // Give each pickup a recognisable silhouette, without adding texture assets
  // or the many ring triangles of the old shared crystal shape.
  function cargoMeshes(item, time, fx) {
    const p = item.pos, type = item.type, items = [];
    const basis = flightBasis(fx ? time * .35 : .18, 0);
    const add = (mesh, offset, size, color, orientation = basis) => {
      const pos = V3.add(p, V3.add(V3.scale(basis.r, offset[0]),
        V3.add(V3.scale(basis.u, offset[1]), V3.scale(basis.f, offset[2]))));
      items.push({ mesh, model: spaceModel(pos, size, orientation), pos,
        color: spaceColor(color), emissive: .85, alpha: 1, kind: 0,
        citadelCargo: type, requirementId: item.reqId || null });
    };
    if (type === 'requirement') {
      add('box', [0, 0, 0], [2.2, 2.9, .55], '#1a6a60');
      add('box', [0, 0, -.6], [1.8, 2.5, .08], '#b5ffe7');
      for (const y of [.95, .05, -.85]) add('box', [-.1, y, -.72], [1.18, .12, .04], '#216a63');
      add('box', [1.7, 1.8, -.68], [.2, .48, .08], colors.requirement);
    } else if (type === 'repair') {
      add('box', [0, 0, 0], [1.9, .6, .7], colors.repair);
      add('box', [0, 0, 0], [.6, 1.9, .7], colors.repair);
    } else {
      const rocket = flightBasis(fx ? time * .35 : .18, Math.PI / 2);
      add('hull', [0, 0, 0], [.72, .72, 1.25], colors.missiles, rocket);
      add('octa', [0, -2.35, 0], [.38, .8, .38], '#ff9962');
    }
    return items;
  }
  spaceSceneBase = function (e, time, fx = true) {
    const items = originalScene(e, time, fx);
    if (!flight(e)) return items;
    const cargo = (e.pickups || []).filter(item => !item.dead);
    const positions = new Set(cargo.map(item => item.pos));
    const result = items.filter(item => !(positions.has(item.pos) && ['octa', 'ring'].includes(item.mesh)));
    for (const item of cargo) result.push(...cargoMeshes(item, time, fx));
    return result;
  };

  RequirementArcade.prototype.objective = function (...args) {
    const goal = originalObjective.apply(this, args);
    if (!flight(this) || !['playing', 'paused'].includes(this.status)) return goal;
    const progress = 'ТРЕБОВАНИЯ ' + count(this) + ' / 3';
    if (this.phase === 'dock') return { title: 'Войдите в голубой шлюз Цитадели',
      detail: 'Маркер указывает на ворота базы. ' + (this.autopilot
        ? 'Автокурс обойдёт корпус и выполнит заход спереди.'
        : mobile() ? 'Включите «Автокурс»: корабль сам зайдёт в шлюз.'
          : 'G — автокурс к воротам. F — стыковка у шлюза.'),
      progress: '3 / 3 ПАКЕТА НА БОРТУ' };
    if (this.phase === 'orientation' || this.phase === 'retrieve' || this.navMode === 'module') {
      return { title: 'Заберите зелёный пакет требований',
        detail: 'Капсула с документом — ФТ из атласа. Нужны все 3 пакета для входа в Цитадель. ' +
          'Подлетите на 30 м: сбор автоматический. ' + (mobile() ? '«Автокурс» ведёт к пакету.' : 'C — курс к требованиям.'),
        progress };
    }
    return { ...goal, detail: goal.detail.replaceAll('кристалл', 'пакет ФТ').replaceAll('К кристаллу', 'К требованиям') };
  };

  function namedTarget(e) {
    const target = e.navTarget();
    return target?.type === 'requirement' ? { ...target, name: description(target) } : target;
  }
  function nearbySupplies(c, e, cam, w, h, isMobile) {
    const cssW = isMobile ? (ARCADE.canvas?.getBoundingClientRect().width || w) : 1280;
    const scaleX = w / cssW, scaleY = isMobile ? scaleX : h / 720;
    const W = w / scaleX, H = h / scaleY;
    const supplies = (e.pickups || []).filter(item => !item.dead && item.type !== 'requirement' &&
      V3.len(V3.sub(item.pos, e.player.pos)) < 95).sort((a, b) =>
      V3.len(V3.sub(a.pos, e.player.pos)) - V3.len(V3.sub(b.pos, e.player.pos))).slice(0, 2);
    c.save(); c.scale(scaleX, scaleY); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = isMobile ? 'bold 10px Arial' : 'bold 12px monospace';
    for (const item of supplies) {
      const q = spaceProject(item.pos, cam, W, H);
      if (q.z <= 0 || q.x < 65 || q.x > W - 65 || q.y < 100 || q.y > H - 90) continue;
      const label = description(item), width = Math.ceil(c.measureText(label).width) + 14;
      c.fillStyle = '#071624dd'; c.fillRect(q.x - width / 2, q.y - 34, width, 20);
      c.fillStyle = colors[item.type]; c.fillText(label, q.x, q.y - 24);
    }
    c.restore();
  }
  drawCampaignFlightHUD = function (c, e, cam, w, h) {
    if (!flight(e)) return originalCampaignHUD(c, e, cam, w, h);
    const view = Object.create(e);
    view.navTarget = () => namedTarget(e);
    originalCampaignHUD(c, view, cam, w, h);
    if (e.status === 'playing') nearbySupplies(c, e, cam, w, h, false);
  };
  drawClarityHUD = function (c, e, cam, w, h) {
    if (!flight(e) || e.status !== 'playing') return originalClarity(c, e, cam, w, h);
    const target = namedTarget(e), collecting = ['orientation', 'retrieve'].includes(e.phase) || e.navMode === 'module';
    const title = e.phase === 'dock' ? 'ВХОД В ЦИТАДЕЛЬ — ГОЛУБОЙ ШЛЮЗ' : collecting
      ? 'ЗЕЛЁНАЯ КАПСУЛА — ПАКЕТ ТРЕБОВАНИЙ' : e.boss ? 'УНИЧТОЖЬТЕ КРЕЙСЕР' : 'ПРОБЕЛ — ПЕРЕХВАТ ЗАМЕЧАНИЯ';
    const detail = 'ФТ ' + count(e) + '/3' + (collecting ? ' · СОБЕРИТЕ 3 ДЛЯ ВХОДА В ЦИТАДЕЛЬ' : '') +
      (e.autopilot ? ' · АВТОКУРС' : ' · G — АВТОКУРС') +
      (target && !collecting ? ' · ' + Math.round(V3.len(V3.sub(target.pos, e.player.pos))) + ' м' : '');
    c.save(); c.scale(w / 1280, h / 720); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#071624e6'; c.fillRect(350, 18, 580, 68);
    c.strokeStyle = '#80c9da66'; c.strokeRect(350, 18, 580, 68);
    c.fillStyle = '#d5ecee'; c.font = 'bold 16px monospace'; c.fillText(title, 640, 39, 554);
    c.fillStyle = '#99c7cc'; c.font = '11px monospace'; c.fillText(detail, 640, 65, 554);
    if (e.elapsed < (e.overdriveUntil || 0)) {
      c.fillStyle = '#ffe2a1'; c.font = '12px monospace';
      c.fillText('УСИЛЕННАЯ ПЛАЗМА · ' + Math.ceil(e.overdriveUntil - e.elapsed) + ' с', 640, 690);
    }
    c.restore();
  };

  // Mobile previously had a requirement/enemy marker, but no marker for the
  // docking gate at all. Use the exact navigation destination on the HUD.
  function gateMarker(c, e, cam, W, H) {
    const gate = globalThis.CITADEL_FLIGHT?.gate(e) || e.navTarget()?.pos;
    if (!gate) return;
    const q = spaceProject(gate, cam, W, H), top = 80, bottom = Math.max(top + 20, H - 30);
    let x = q.x, y = q.y;
    const edge = q.z <= 0 || x < 24 || x > W - 24 || y < top || y > bottom;
    c.strokeStyle = '#a3ebff'; c.fillStyle = '#a3ebff'; c.lineWidth = 2;
    if (edge) {
      const d = V3.sub(gate, cam.pos), angle = Math.atan2(-V3.dot(d, cam.u) || .01, V3.dot(d, cam.r) || .01);
      x = W / 2 + Math.cos(angle) * (W / 2 - 26);
      y = (top + bottom) / 2 + Math.sin(angle) * (bottom - top) / 2;
      c.save(); c.translate(x, y); c.rotate(angle); c.beginPath();
      c.moveTo(9, 0); c.lineTo(-6, -6); c.lineTo(-6, 6); c.closePath(); c.fill(); c.restore();
    } else c.strokeRect(x - 14, y - 18, 28, 36);
    c.font = 'bold 10px Arial'; c.textAlign = 'center';
    const text = 'ШЛЮЗ · ' + Math.round(V3.len(V3.sub(gate, e.player.pos))) + ' м';
    const width = Math.min(W - 16, c.measureText(text).width + 14);
    x = arcadeClamp(x, width / 2 + 8, W - width / 2 - 8);
    y = arcadeClamp(y - 28, 72, H - 18);
    c.fillStyle = '#071624e6'; c.fillRect(x - width / 2, y - 9, width, 18);
    c.fillStyle = '#a3ebff'; c.fillText(text, x, y, W - 30);
  }
  drawMobileGameHUD = function (c, e, cam, w, h) {
    originalMobileHUD(c, e, cam, w, h);
    if (!flight(e) || e.status !== 'playing') return;
    const cssW = ARCADE.canvas?.getBoundingClientRect().width || w, scale = w / cssW;
    const W = w / scale, H = h / scale;
    c.save(); c.scale(scale, scale); c.textBaseline = 'middle';
    c.fillStyle = '#061727df'; c.fillRect(6, 40, Math.min(298, W - 12), 23);
    c.fillStyle = '#b5ffe0'; c.font = 'bold 11px Arial'; c.textAlign = 'left';
    c.fillText('ТРЕБОВАНИЯ ' + count(e) + '/3 · ДЛЯ ВХОДА В ЦИТАДЕЛЬ', 13, 52, W - 26);
    if (e.phase === 'dock') gateMarker(c, e, cam, W, H);
    c.restore(); nearbySupplies(c, e, cam, w, h, true);
  };

  updateArcadeHUD = function (...args) {
    const result = originalUpdate.apply(this, args), e = ARCADE.engine;
    if (!flight(e)) return result;
    const button = document.getElementById('mobile-crystal');
    if (button) { button.textContent = 'Пакеты ФТ'; button.setAttribute('aria-label', 'Взять курс к пакету требований'); }
    if (!mobile() && ['orientation', 'retrieve'].includes(e.phase)) {
      const primary = document.getElementById('citadel-primary');
      if (primary) primary.textContent = 'G · К требованиям ↗';
    }
    return result;
  };
  arcadeOverlayHTML = function (...args) {
    let html = originalOverlay.apply(this, args);
    if (ARCADE.engine?.status !== 'briefing' || ARCADE.engine.finale) return html;
    return html.replace('Сначала — первый кристалл.', 'Сначала — пакет требований.')
      .replace('В модуле — материал атласа', 'В капсуле — требование из атласа')
      .replace('три модуля ФТ', 'три пакета требований')
      .replace('Зелёный кристалл → забрать', 'Зелёная капсула с документом → пакет ФТ')
      .replace('Достаточно подлететь на 30 м. C — курс на кристалл.',
        'Соберите 3 пакета: они нужны для входа в Цитадель. Подлетите на 30 м.' +
        '</small><small>Синий «+» — щит +30. Янтарная ракета — боезапас +3.')
      .replace('К ПЕРВОМУ КРИСТАЛЛУ', 'ЗАБРАТЬ ПЕРВОЕ ФТ');
  };
  globalThis.CITADEL_FLIGHT_VIEW = Object.freeze({ version: VERSION, description, cargoMeshes });
})();
