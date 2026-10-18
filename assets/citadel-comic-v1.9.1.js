/* Citadel 1.9.1 — brief printed-comic reactions to real mission events.
 * Pure Canvas artwork, no image downloads, timers, audio or saved-state fields.
 * Load after the mission modules and before the private test extension.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_COMIC?.version === '1.9.1' || typeof RequirementArcade !== 'function') return;
  const VERSION = '1.9.1', LIFETIME = 1.85, QUIET = 1.1;
  const states = new WeakMap();
  const allowed = new Set(['playing', 'boarding']);
  const palette = {
    success: { paper: '#fff0b5', accent: '#239caa', ink: '#17232a' },
    warning: { paper: '#ffcc61', accent: '#c9403a', ink: '#271f25' },
    action: { paper: '#f8efd5', accent: '#d8573f', ink: '#202932' },
  };
  const rank = { action: 1, success: 2, warning: 3 };
  function wall() { return typeof performance?.now === 'function' ? performance.now() / 1000 : Date.now() / 1000; }
  function tag(e) { return e.stage + '/' + (e.finale?.phase || e.phase); }
  function visible(e) {
    return !!e && allowed.has(e.status) && STATE.view === 'arcade' && !document.hidden &&
      !(e.board?.intro > 0) && !e.crash;
  }
  function state(e) {
    let s = states.get(e);
    if (!s) {
      s = { current: null, pending: null, quietUntil: -Infinity, lastText: '', lastTextAt: -Infinity,
        serial: 0, bounds: null, originalEmit: null, emitWrapper: null, context: tag(e) };
      states.set(e, s);
    }
    return s;
  }
  function clean(value) {
    return String(value || '').replace(/<[^>]*>/g, ' ').replace(/[\\*_`#]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 76).toUpperCase();
  }
  function clear(e) {
    const s = e && states.get(e);
    if (s) {
      s.current = null; s.pending = null; s.bounds = null; s.context = tag(e);
      s.quietUntil = -Infinity; s.lastText = ''; s.lastTextAt = -Infinity;
    }
  }
  function begin(e, s, item) {
    const now = e.elapsed || 0;
    s.current = { ...item, start: now, end: now + LIFETIME, wallEnd: wall() + LIFETIME, serial: ++s.serial };
    s.quietUntil = now + LIFETIME + QUIET;
    s.lastText = item.text; s.lastTextAt = now; s.bounds = null;
  }
  function post(e, message) {
    if (!visible(e)) return false;
    const text = clean(typeof message === 'object' ? message?.text : message), kind = palette[message?.kind] ? message.kind : 'action';
    if (!text) return false;
    const s = state(e), now = e.elapsed || 0;
    if (s.context !== tag(e)) { clear(e); s.context = tag(e); s.quietUntil = -Infinity; }
    if (s.lastText === text && now >= s.lastTextAt && now - s.lastTextAt < 7) return false;
    const item = { text, kind, label: clean(message?.label || (kind === 'warning' ? 'СРОЧНЫЕ ПРАВКИ' : 'ХРОНИКИ ФТ')),
      anchor: Array.isArray(message?.anchor) && message.anchor.length === 3 && message.anchor.every(Number.isFinite)
        ? message.anchor.slice() : null, posted: now, expires: now + 2.4 };
    if (s.current && now < s.current.end && wall() < s.current.wallEnd) {
      // A warning may replace a reaction, but event bursts never stack panels
      // or extend the currently displayed panel forever.
      if (rank[kind] > rank[s.current.kind] && now - s.current.start > .65) {
        s.current = { ...s.current, ...item, end: Math.min(s.current.end, now + 1.35) };
        s.lastText = text; s.lastTextAt = now;
      } else if (!s.pending || rank[kind] > rank[s.pending.kind]) s.pending = item;
      return true;
    }
    if (now < s.quietUntil) { if (!s.pending || rank[kind] > rank[s.pending.kind]) s.pending = item; return true; }
    begin(e, s, item); return true;
  }
  function tick(e) {
    const s = states.get(e);
    if (!s) return;
    if (!visible(e) || s.context !== tag(e)) { clear(e); return; }
    const now = e.elapsed || 0;
    if (s.current && (now >= s.current.end || now < s.current.start || wall() >= s.current.wallEnd)) {
      s.current = null; s.bounds = null;
    }
    if (s.pending && now > s.pending.expires) s.pending = null;
    if (!s.current && s.pending && now >= s.quietUntil) {
      const item = s.pending; s.pending = null; begin(e, s, item);
    }
  }
  function receive(e, kind, value) {
    const ownMission = e.phase === 'pursuit' && e.stage === 1 && !!e.pursuit ||
      e.phase === 'swarm' && e.stage === 2 && !!e.swarm;
    if (kind === 'state' && !allowed.has(value)) { clear(e); return; }
    if (kind === 'comic') { post(e, value); return; }
    if (kind === 'rescue' && !ownMission) {
      post(e, { text: 'ФТ НА БОРТУ!', label: REQS.get(value)?.number || 'ПАКЕТ ТРЕБОВАНИЙ', kind: 'success' });
    } else if (kind === 'wave' && !ownMission) {
      post(e, { text: 'ПРАВКИ НАЛЕТАЮТ!', kind: 'warning' });
    } else if (kind === 'pulse') {
      post(e, { text: 'ЗАМЕЧАНИЯ ОТБИТЫ!', kind: 'action' });
    } else if (kind === 'destroy' && !e.finale && !ownMission) {
      const kills = e.board ? e.board.kills : e.totalKills;
      if (kills > 0 && kills % 4 === 0) post(e, { text: 'МИНУС ЗАМЕЧАНИЕ!', kind: 'action' });
    }
  }
  function wire(e) {
    if (!e || typeof e.emit !== 'function') return;
    const s = state(e);
    if (e.emit === s.emitWrapper) return;
    const emit = e.emit;
    s.originalEmit = emit;
    s.emitWrapper = function (kind, value) {
      const result = emit.apply(this, arguments);
      receive(e, kind, value);
      return result;
    };
    e.emit = s.emitWrapper;
  }
  const proto = RequirementArcade.prototype, previousStep = proto.step;
  proto.step = function () {
    wire(this);
    const result = previousStep.apply(this, arguments);
    tick(this); return result;
  };
  for (const name of ['launch', 'launchFinale', 'beginMRG', 'beginStage']) {
    const previous = proto[name];
    proto[name] = function () { wire(this); clear(this); return previous.apply(this, arguments); };
  }
  for (const name of ['continueLesson', 'continueRemark', 'continueFinaleCheck']) {
    const previous = proto[name];
    proto[name] = function () {
      wire(this);
      const before = this.status, result = previous.apply(this, arguments);
      if (before !== this.status && allowed.has(this.status)) post(this, { text: 'СОГЛАСОВАНО!', kind: 'success' });
      return result;
    };
  }

  function overlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }
  function protectedAreas(e, cam, W, H, mobile) {
    const parallax = e.finale?.phase === 'boss' && !!globalThis.CITADEL_PARALLAX;
    const top = mobile ? (parallax ? 116 : Math.min(94, H * .32)) : Math.max(96, H * .18);
    const bottom = mobile ? 45 : H * .16;
    const boxes = [{ x: 0, y: 0, width: W, height: top }, { x: 0, y: H - bottom, width: W, height: bottom },
      { x: W / 2 - 56, y: H * .47 - 45, width: 112, height: 90 }];
    const actor = e.board?.pos || e.player?.pos;
    if (actor) {
      const q = spaceProject(actor, cam, W, H);
      if (q.z > 0) boxes.push({ x: q.x - (e.board ? 28 : 58), y: q.y - (e.board ? 62 : 36), width: e.board ? 56 : 116, height: e.board ? 78 : 76 });
    }
    const selected = (e.enemies || []).find(x => !x.dead && (x.id === e.lock || x.id === e.selectedTarget)) ||
      (e.boss && !e.boss.dead ? e.boss : null);
    if (selected?.pos) {
      const q = spaceProject(selected.pos, cam, W, H);
      if (q.z > 0) boxes.push({ x: q.x - 60, y: q.y - 35, width: 120, height: 75 });
    }
    const pursuitBounds = globalThis.CITADEL_PURSUIT?.hudBounds?.(e, cam, W, H) || [];
    const swarmBounds = globalThis.CITADEL_SWARM?.hudBounds?.(e, W, H) || [];
    const deckBounds = globalThis.CITADEL_DECK_COMBAT?.hudBounds?.(e, W, H) || [];
    for (const box of [...pursuitBounds, ...swarmBounds, ...deckBounds]) {
      if ([box.x, box.y, box.width, box.height].every(Number.isFinite))
        boxes.push({ x: box.x - 5, y: box.y - 5, width: box.width + 10, height: box.height + 10 });
    }
    const field = globalThis.CITADEL_FIELD_UI?.status(e)?.bounds;
    if (field) boxes.push({ x: field.x - 4, y: field.y - 4, width: field.width + 8, height: field.height + 8 });
    if (!swarmBounds.length && e.phase === 'swarm' && e.swarm?.window) {
      const q = spaceProject(e.swarm.window, cam, W, H);
      const edge = spaceProject(V3.add(e.swarm.window, [e.swarm.radius, 0, 0]), cam, W, H);
      if (q.z > 0) {
        const radius = Math.abs(edge.x - q.x), small = W < 650 || H < 420 || mobile;
        const labelWidth = small ? 164 : 220, lx = arcadeClamp(q.x, labelWidth / 2 + 5, W - labelWidth / 2 - 5);
        const ly = arcadeClamp(q.y + radius + 20, 117, H - (small ? 16 : 60));
        boxes.push({ x: q.x - radius - 9, y: q.y - radius - 9, width: radius * 2 + 18, height: radius * 2 + 18 },
          { x: lx - labelWidth / 2, y: ly - 13, width: labelWidth, height: 26 });
      }
    }
    if (!pursuitBounds.length && e.phase === 'pursuit' && e.pursuit?.carriers) {
      const carriers = e.pursuit.carriers.filter(x => !x.delivered);
      const focused = carriers.find(x => x.id === e.selectedTarget) || carriers.slice().sort((a, b) =>
        V3.len(V3.sub(a.pos, e.player.pos)) - V3.len(V3.sub(b.pos, e.player.pos)))[0];
      const labelTop = mobile ? 91 : 110, labelBottom = Math.max(labelTop + 30, H - (mobile ? 44 : 135));
      for (const carrier of carriers) {
        const q = spaceProject(carrier.pos, cam, W, H);
        let x = q.x, y = q.y;
        const offscreen = q.z <= 0 || x < 32 || x > W - 32 || y < labelTop || y > labelBottom;
        if (offscreen && carrier !== focused) continue;
        if (offscreen) {
          const d = V3.sub(carrier.pos, cam.pos), angle = Math.atan2(-V3.dot(d, cam.u) || .01, V3.dot(d, cam.r) || .01);
          x = W / 2 + Math.cos(angle) * (W / 2 - 27);
          y = (labelTop + labelBottom) / 2 + Math.sin(angle) * (labelBottom - labelTop) / 2;
        }
        const width = mobile ? 158 : 200, lx = arcadeClamp(x, width / 2 + 10, W - width / 2 - 10);
        const ly = arcadeClamp(y - (mobile ? 44 : 58), labelTop, labelBottom);
        boxes.push({ x: lx - width / 2, y: ly - 13, width, height: 41 },
          { x: x - 34, y: y - 28, width: 68, height: 68 });
      }
    }
    return { boxes, top, bottom };
  }
  function linesFor(c, text, width) {
    const words = text.split(' '), lines = [''];
    for (const word of words) {
      const i = lines.length - 1, candidate = lines[i] ? lines[i] + ' ' + word : word;
      if (c.measureText(candidate).width <= width) lines[i] = candidate;
      else if (!lines[i]) lines[i] = word;
      else lines.push(word);
    }
    if (lines.length > 2) { lines.length = 2; lines[1] += '…'; }
    for (let i = 0; i < lines.length; i++) {
      if (c.measureText(lines[i]).width <= width) continue;
      let t = lines[i].replace(/…$/, '');
      while (t && c.measureText(t + '…').width > width) t = t.slice(0, -1);
      lines[i] = t + '…';
    }
    return lines;
  }
  function placement(c, e, item, cam, W, H, mobile) {
    const reserve = protectedAreas(e, cam, W, H, mobile), margin = 12;
    // A narrow side column is essential in portrait: there is deliberately no
    // banner spanning the crosshair or the player's ship below it.
    const side = Math.max(82, Math.min(112, (W - 112) / 2 - margin * 2 - 8));
    for (const width of mobile ? [Math.min(188, W - 28), Math.min(138, W * .44), side] : [252, 204]) {
      const font = mobile ? (width < 150 ? 13 : 16) : 21;
      c.font = '900 ' + font + 'px Arial, sans-serif';
      const lines = linesFor(c, item.text, width - 30), height = lines.length === 1 ? font + 34 : font * 2 + 32;
      const candidates = [{ x: margin, y: reserve.top + 15 }, { x: W - width - margin, y: reserve.top + 15 },
        { x: margin, y: H * .58 }, { x: W - width - margin, y: H * .58 },
        { x: W / 2 - width / 2, y: H - reserve.bottom - height - 20 }];
      if (item.anchor) {
        const q = spaceProject(item.anchor, cam, W, H);
        if (q.z > 0) candidates.unshift({ x: q.x + 34, y: q.y + 28 }, { x: q.x - width - 34, y: q.y + 28 });
      }
      for (const candidate of candidates) {
        const box = { x: candidate.x, y: candidate.y, width, height: height + 12 };
        const padded = { x: box.x - 7, y: box.y - 7, width: width + 14, height: box.height + 14 };
        if (padded.x < 4 || padded.y < 4 || padded.x + padded.width > W - 4 || padded.y + padded.height > H - 4) continue;
        if (reserve.boxes.some(b => overlap(padded, b))) continue;
        return { ...box, paperHeight: height, lines, font, protected: reserve.boxes };
      }
    }
    return null;
  }
  function shape(c, width, height, kind) {
    c.beginPath();
    if (kind === 'warning') {
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12, r = i % 2 ? .82 : 1;
        const x = Math.cos(a) * width / 2 * r, y = Math.sin(a) * height / 2 * r;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
    } else {
      c.moveTo(-width / 2 + 5, -height / 2); c.lineTo(width / 2 - 5, -height / 2 + 2);
      c.lineTo(width / 2, height / 2 - 3); c.lineTo(-width * .12, height / 2);
      c.lineTo(-width * .25, height / 2 + 11); c.lineTo(-width * .29, height / 2 - 1);
      c.lineTo(-width / 2, height / 2 - 2);
    }
    c.closePath();
  }
  function draw(c, e, cam, w, h) {
    tick(e);
    const s = states.get(e), item = s?.current;
    if (!item || !visible(e)) return;
    s.bounds = null;
    const cssWidth = ARCADE.canvas?.getBoundingClientRect().width || w, scale = w / cssWidth;
    const W = w / scale, H = h / scale, mobile = typeof isMobileLayout === 'function' && isMobileLayout();
    c.save(); c.scale(scale, scale);
    const box = placement(c, e, item, cam, W, H, mobile);
    if (!box) { c.restore(); return; }
    const age = (e.elapsed || 0) - item.start, remaining = Math.min(item.end - (e.elapsed || 0), item.wallEnd - wall());
    const animated = ARCADE.fx && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pop = animated ? .86 + .14 * Math.min(1, age / .14) : 1;
    const colors = palette[item.kind], height = box.paperHeight;
    c.globalAlpha = animated ? Math.min(1, remaining / .28) : 1;
    c.translate(box.x + box.width / 2, box.y + height / 2); c.scale(pop, pop);
    c.save(); c.translate(4, 5); shape(c, box.width, height, item.kind); c.fillStyle = colors.ink; c.fill(); c.restore();
    shape(c, box.width, height, item.kind); c.fillStyle = colors.paper; c.fill();
    c.save(); c.clip(); c.beginPath();
    for (let y = -height / 2 + 3; y < height / 2; y += 9) for (let x = -box.width / 2 + 4; x < box.width / 2; x += 10) {
      c.moveTo(x + 1, y); c.arc(x, y, 1, 0, Math.PI * 2);
    }
    c.fillStyle = '#25323721'; c.fill(); c.restore();
    shape(c, box.width, height, item.kind); c.lineWidth = mobile ? 2.8 : 3.5; c.strokeStyle = colors.ink; c.stroke();
    c.fillStyle = colors.accent; c.fillRect(-box.width / 2 + 10, -height / 2 - 4, box.width - 20, 15);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 ' + (mobile ? 8 : 9) + 'px Arial, sans-serif';
    c.fillStyle = '#fff8df'; c.fillText(item.label, 0, -height / 2 + 3, box.width - 34);
    c.font = '900 ' + box.font + 'px Arial, sans-serif'; c.lineJoin = 'round';
    const firstY = box.lines.length === 1 ? 7 : 7 - box.font * .55;
    box.lines.forEach((line, i) => {
      const y = firstY + i * box.font * 1.1;
      c.strokeStyle = '#fff8df'; c.lineWidth = mobile ? 2 : 3; c.strokeText(line, 0, y);
      c.fillStyle = colors.ink; c.fillText(line, 0, y);
    });
    c.restore();
    s.bounds = { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12,
      viewportWidth: W, viewportHeight: H, text: item.text, lines: box.lines.slice(), kind: item.kind, protected: box.protected };
  }
  const clarity = drawClarityHUD, mobileHUD = drawMobileGameHUD, finaleHUD = drawFinaleHUD;
  drawClarityHUD = function (c, e, cam, w, h) {
    const result = clarity.apply(this, arguments);
    if (!e.finale && !isMobileLayout()) draw(c, e, cam, w, h);
    return result;
  };
  drawMobileGameHUD = function (c, e, cam, w, h) {
    const result = mobileHUD.apply(this, arguments);
    if (!e.finale) draw(c, e, cam, w, h);
    return result;
  };
  drawFinaleHUD = function (c, e, cam, w, h) {
    const result = finaleHUD.apply(this, arguments); draw(c, e, cam, w, h); return result;
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) clear(ARCADE.engine); });
  wire(ARCADE.engine);
  globalThis.CITADEL_COMIC = Object.freeze({ version: VERSION, lifetime: LIFETIME, quietTime: QUIET,
    post, draw, wire, clear, clean,
    status(e = ARCADE.engine) {
      tick(e); const s = states.get(e);
      return { version: VERSION, active: !!s?.current, pending: !!s?.pending, serial: s?.serial || 0,
        text: s?.current?.text || '', remaining: s?.current ? Math.max(0, s.current.end - (e.elapsed || 0)) : 0,
        bounds: s?.bounds ? { ...s.bounds, lines: s.bounds.lines.slice(), protected: s.bounds.protected.map(x => ({ ...x })) } : null };
    },
  });
})();
