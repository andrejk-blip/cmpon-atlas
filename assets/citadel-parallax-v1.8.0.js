/* Citadel 1.8.0 — Parallax's limbs now share their visible and colliding paths.
 * This module owns only the flying boss. The four support rewards, central
 * core, breach, landing, maze and the separate MRG arena remain in the core.
 */
(() => {
  'use strict';
  const VERSION = '1.8.0';
  if (typeof RequirementArcade !== 'function' || typeof finaleAlien !== 'function' ||
      globalThis.CITADEL_PARALLAX?.version === VERSION) return;
  const proto = RequirementArcade.prototype;
  const original = {
    launch: proto.launchFinale, step: proto.stepFinalSpace, hit: proto.hit,
    objective: proto.objective, alien: finaleAlien, hud: drawFinaleHUD,
    overlay: finaleOverlay,
  };
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const ease = n => { const u = clamp(n); return u * u * (3 - 2 * u); };
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const active = e => e?.finale?.phase === 'boss';
  const supports = e => (e.enemies || []).filter(x => x.core && !x.dead && x.hp > 0);
  const patterns = Object.freeze([
    Object.freeze({ id: 'lunge', title: 'КРЮК — СМЕНИ КУРС', hint: 'Щупальце запомнило твоё место. Уходи в сторону на форсаже.', short: 'СМЕНИ КУРС · ФОРСАЖ', color: '#ff976f' }),
    Object.freeze({ id: 'sweep', title: 'ХЛЁСТ — ВВЕРХ ИЛИ ВНИЗ', hint: 'Щупальце прочешет эту высоту. Набери высоту или нырни.', short: 'ВВЕРХ ИЛИ ВНИЗ', color: '#ffcc76' }),
    Object.freeze({ id: 'pincer', title: 'КЛЕЩИ — УХОДИ ВБОК', hint: 'Щупальца сходятся сверху и снизу. Уходи влево или вправо.', short: 'ВЛЕВО ИЛИ ВПРАВО', color: '#ef9feb' }),
  ]);
  const pattern = id => patterns.find(x => x.id === id) || patterns[0];
  const armAngle = i => i * Math.PI / 4 + .2;
  const rootAt = i => { const a = armAngle(i); return [Math.cos(a) * 31, Math.sin(a) * 22, -151]; };
  function powered(e, arm) {
    const a = armAngle(arm);
    return supports(e).some(x => Math.sign(x.pos[0]) === Math.sign(Math.cos(a)) && Math.sign(x.pos[1]) === Math.sign(Math.sin(a)));
  }
  function fresh(e, grace = 2.2) {
    return { version: VERSION, clock: 0, serial: 0, nextAttack: grace,
      shotClock: 5.8, attack: null, supportCount: supports(e).length,
      strikes: 0, hits: 0, evaded: 0, blocked: 0, interrupted: 0 };
  }
  function ensure(e) {
    if (!active(e)) return null;
    let s = e.finale.parallax;
    if (!s || s.version !== VERSION || !Number.isFinite(s.clock) || !Number.isFinite(s.serial)) {
      // Old in-progress saves gain a new telegraph grace period without changing
      // player health, support/core health, ammo, rewards, or campaign progress.
      s = e.finale.parallax = fresh(e, 2.6);
    }
    const a = s.attack;
    if (a && (!point(a.aim) || !Array.isArray(a.arms) || !['windup', 'strike', 'recover'].includes(a.phase) ||
        ![a.time, a.windup, a.strike, a.recovery, a.damage].every(Number.isFinite))) {
      s.attack = null; s.nextAttack = 2.6;
    }
    return s;
  }
  const cue = (e, text, kind, anchor) => e.emit('comic', { text, kind, anchor: anchor.slice() });
  function beginAttack(e, s) {
    const alive = supports(e).length, rage = 4 - alive;
    const kind = patterns[s.serial % patterns.length].id;
    const liveArms = Array.from({ length: 8 }, (_, i) => i).filter(i => powered(e, i));
    // Once the shield supports are gone, two thinner inner tendons protect the
    // exposed core. They have the same tells, range and evasion rules.
    const pool = liveArms.length ? liveArms : [1, 5];
    const first = pool[s.serial % pool.length];
    const second = pool.find(i => Math.abs(i - first) >= 3) ?? pool.find(i => i !== first) ?? (first + 4) % 8;
    const a = {
      id: ++s.serial, kind, phase: 'windup', time: 0,
      windup: (e.assist ? 2.2 : 1.8) - Math.min(2, rage) * .06,
      strike: kind === 'sweep' ? 1.65 : kind === 'pincer' ? 1.55 : 1.3,
      recovery: e.assist ? 2.8 : 2.25,
      aim: e.player.pos.slice(), side: s.serial % 2 ? -1 : 1,
      arms: kind === 'pincer' ? [first, second] : [first],
      damage: 24 + (rage >= 2 ? 2 : 0), hit: false, blocked: false,
      supportCount: alive,
    };
    s.attack = a;
    cue(e, { lunge: 'ПРАВКА НАВЫЛЕТ!', sweep: 'ВОЛНА УТОЧНЕНИЙ!', pincer: 'СОГЛАСОВАНО С ДВУХ СТОРОН!' }[kind], 'warning', a.aim);
    e.say(pattern(kind).hint + ' Импульс перед ударом отбросит щупальца.', 'alert', true);
  }
  function recover(e, s, reason) {
    const a = s.attack;
    if (!a || a.phase === 'recover') return;
    a.endPhase = a.phase; a.endTime = a.time; a.phase = 'recover'; a.time = 0;
    if (reason === 'pulse') {
      a.blocked = true; s.blocked++;
      cue(e, 'ПРАВКА ОТБИТА!', 'action', e.player.pos);
    } else if (reason === 'support') {
      s.interrupted++; a.recovery += .65;
    } else if (!a.hit && !a.blocked) s.evaded++;
    s.nextAttack = e.assist ? 1.05 : .7;
  }
  function restTip(e, arm) {
    const a = armAngle(arm), t = e.finale.time || 0, cut = !powered(e, arm);
    const radius = cut ? 47 : 68 + Math.sin(t * .7 + arm) * 5;
    return [Math.cos(a + Math.sin(t * .4 + arm) * .12) * radius,
      Math.sin(a) * radius * .76 + Math.sin(t * .6 + arm) * 3,
      -113 + Math.cos(t * .65 + arm) * 6 - (cut ? 14 : 0)];
  }
  function strikeTip(a, index, u) {
    const aim = a.aim, sign = index ? -1 : 1;
    if (a.kind === 'sweep') return V3.add(aim, [a.side * (1 - 2 * ease(u)) * 66, 0, -4 + ease(u) * 8]);
    if (a.kind === 'pincer') {
      const close = ease(u / .72);
      return V3.add(aim, [sign * 2.4 * close, sign * (44 * (1 - close) + .8), -4 + close * 5]);
    }
    const close = ease(u / .62);
    return V3.add(aim, [a.side * 35 * (1 - close), 22 * (1 - close), -25 * (1 - close)]);
  }
  function tipAt(e, a, arm, index) {
    const idle = restTip(e, arm), start = strikeTip(a, index, 0);
    if (a.phase === 'windup') return V3.lerp(idle, start, ease(a.time / a.windup));
    if (a.phase === 'strike') return strikeTip(a, index, clamp(a.time / a.strike));
    const oldPhase = a.endPhase || 'strike', oldTime = Number.isFinite(a.endTime) ? a.endTime : a.strike;
    const end = oldPhase === 'windup' ? V3.lerp(idle, start, ease(oldTime / a.windup)) : strikeTip(a, index, clamp(oldTime / a.strike));
    return V3.lerp(end, idle, ease(a.time / a.recovery));
  }
  function curve(e, arm, a = null, index = 0) {
    const root = rootAt(arm), idle = restTip(e, arm), tip = a ? tipAt(e, a, arm, index) : idle;
    const angle = armAngle(arm), side = Math.sign(Math.cos(angle));
    const sway = Math.sin((e.finale.time || 0) * .7 + arm) * 5;
    const p1 = [root[0] + side * 36, root[1] * 1.6 + sway, -130];
    const p2 = a ? [tip[0] + side * (a.kind === 'pincer' ? 27 : 18), tip[1] + (index ? -1 : 1) * 18, tip[2] - 27]
      : [idle[0] + side * 12, idle[1] + sway, idle[2] - 15];
    const count = a ? 18 : 11, points = [], radii = [];
    for (let i = 0; i <= count; i++) {
      const u = i / count, v = 1 - u;
      points.push([0, 1, 2].map(k => v * v * v * root[k] + 3 * v * v * u * p1[k] + 3 * v * u * u * p2[k] + u * u * u * tip[k]));
      if (i) radii.push((3.25 - u * 1.5) * (powered(e, arm) ? 1 : .84));
    }
    return { arm, points, radii, active: a?.phase === 'strike', kind: a?.kind || 'idle' };
  }
  function attackGeometry(e, attack = e?.finale?.parallax?.attack) {
    if (!active(e) || !attack) return [];
    return attack.arms.map((arm, index) => curve(e, arm, attack, index));
  }
  function pointSegmentDistance(p, a, b) {
    const ab = V3.sub(b, a), den = V3.dot(ab, ab);
    const u = den > 1e-12 ? clamp(V3.dot(V3.sub(p, a), ab) / den) : 0;
    return V3.len(V3.sub(p, V3.lerp(a, b, u)));
  }
  function intersects(e, a, oldTime, previous) {
    // The same 18 tapered segments form the visible tentacle and its collision
    // capsules. Intermediate poses cover both moving limbs and a boosting ship.
    for (let j = 0; j <= 4; j++) {
      const u = j / 4, pose = { ...a, time: oldTime + (a.time - oldTime) * u };
      const ship = V3.lerp(previous, e.player.pos, u);
      for (const limb of attackGeometry(e, pose)) for (let i = 1; i < limb.points.length; i++) {
        if (pointSegmentDistance(ship, limb.points[i - 1], limb.points[i]) <= limb.radii[i - 1] + 2.8) return true;
      }
    }
    return false;
  }
  function tick(e, s, dt, previous, pulse) {
    s.clock += dt; s.shotClock -= dt;
    if (pulse && s.attack && (s.attack.phase === 'strike' || s.attack.phase === 'windup' && s.attack.windup - s.attack.time <= .9)) {
      recover(e, s, 'pulse');
    }
    const a = s.attack;
    if (!a) {
      s.nextAttack -= dt;
      if (s.nextAttack <= 0) beginAttack(e, s);
    } else {
      const before = a.time; a.time += dt;
      if (a.phase === 'windup' && a.time >= a.windup) {
        a.phase = 'strike'; a.time = 0; s.strikes++; e.emit('boss');
      } else if (a.phase === 'strike') {
        if (!a.hit && !a.blocked && intersects(e, a, before, previous)) {
          // A shielded contact consumes this strike too: it cannot damage again
          // a few frames later when the invulnerability period expires.
          if (e.player.invulnerable > 0) { a.blocked = true; s.blocked++; }
          else if (e.damage(a.damage)) { a.hit = true; s.hits++; }
        }
        if (a.time >= a.strike) recover(e, s, 'end');
      } else if (a.phase === 'recover' && a.time >= a.recovery) s.attack = null;
    }
    // Sparse shots retain the ship battle, while the readable limbs are the
    // main threat. No projectile volley is added during an attack warning.
    if (s.shotClock <= 0 && (!s.attack || s.attack.phase === 'recover')) {
      s.shotClock = e.assist ? 7.2 : 5.6;
      const origin = (supports(e)[s.serial % Math.max(1, supports(e).length)] || e.boss)?.pos;
      if (origin) e.hostile.push({ pos: origin.slice(), vel: V3.scale(V3.norm(V3.sub(e.player.pos, origin)), e.assist ? 24 : 29), life: 8, r: 1, damage: 6, color: '#dda6ff' });
    }
    s.supportCount = supports(e).length;
  }
  proto.launchFinale = function (...args) {
    const allowed = this.status === 'finalebrief', result = original.launch.apply(this, args);
    if (allowed && active(this) && this.status === 'playing') this.finale.parallax = fresh(this);
    return result;
  };
  proto.stepFinalSpace = function (dt, input = {}) {
    if (!active(this)) return original.step.call(this, dt, input);
    const s = ensure(this), previous = this.player.pos.slice();
    const pulse = !!input.pulse && this.player.pulseCooldown <= dt;
    this.finale.attack = 60; this.finale.telegraph = 0;
    const result = original.step.call(this, dt, input);
    if (active(this) && this.status === 'playing') tick(this, s, dt, previous, pulse && this.player.pulseCooldown > 0);
    return result;
  };
  proto.hit = function (enemy, amount) {
    if (!active(this)) return original.hit.call(this, enemy, amount);
    const wasAlive = enemy && !enemy.dead && enemy.hp > 0, s = ensure(this);
    // A retracted limb exposes its shield conduit. This gives a visible reason
    // to dodge first and then use the counterattack window.
    const multiplier = s.attack?.phase === 'recover' ? 1.35 : .55;
    const result = original.hit.call(this, enemy, amount * multiplier);
    if (wasAlive && enemy.dead && enemy.core) {
      const feedsArm = arm => {
        const a = armAngle(arm);
        return Math.sign(enemy.pos[0]) === Math.sign(Math.cos(a)) && Math.sign(enemy.pos[1]) === Math.sign(Math.sin(a));
      };
      if (!supports(this).length || s.attack?.arms.some(feedsArm)) recover(this, s, 'support');
      s.nextAttack = Math.max(s.nextAttack, 1.1);
      cue(this, supports(this).length ? 'СОГЛАСОВАНИЕ ПРОБИТО!' : 'ЯДРО БЕЗ ПРИКРЫТИЯ!', 'success', enemy.pos);
    }
    return result;
  };
  proto.objective = function (...args) {
    if (!active(this)) return original.objective.apply(this, args);
    const a = this.finale.parallax?.attack, left = supports(this).length;
    return {
      title: a?.phase === 'windup' || a?.phase === 'strike' ? pattern(a.kind).title : a?.phase === 'recover' ? 'ЩУПАЛЬЦА ОТСТУПАЮТ — ОГОНЬ!' : left ? 'Разрушьте опоры щупалец' : 'Уничтожьте открытое ядро',
      detail: a?.phase === 'windup' || a?.phase === 'strike' ? pattern(a.kind).hint + ' E — отбить удар в последний момент.' : 'Пока щупальца готовы к удару, броня поглощает 45% урона. Во время их отхода урон оружия выше на 35%. E — импульс, Shift — форсаж, G — курс на цель.',
      progress: `${4 - left} / 4 ОПОРЫ · ${a?.phase === 'windup' ? 'УДАР ЧЕРЕЗ ' + Math.max(0, a.windup - a.time).toFixed(1) + ' С' : a?.phase === 'strike' ? 'УКЛОНЯЙСЯ' : a?.phase === 'recover' ? 'ОКНО ДЛЯ ОТВЕТА' : 'СЛЕДИ ЗА ЩУПАЛЬЦАМИ'}`,
    };
  };

  // A short octagonal tube gives the curved limb a round silhouette without a
  // sphere at every joint; both WebGL and the native Canvas fallback share it.
  if (!SPACE_MESH.parallaxTendon) {
    const vertices = [], faces = [], sides = 8;
    for (const z of [-1, 1]) for (let i = 0; i < sides; i++) vertices.push([Math.cos(i / sides * Math.PI * 2), Math.sin(i / sides * Math.PI * 2), z]);
    for (let i = 0; i < sides; i++) { const n = (i + 1) % sides; faces.push([i, n, n + sides, i + sides]); }
    faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i));
    faces.push(Array.from({ length: sides }, (_, i) => i + sides));
    SPACE_MESH.parallaxTendon = spaceMesh(vertices, faces);
  }
  function addLimb(items, limb, phase, color, alpha = 1, feature = 'limb') {
    for (let i = 1; i < limb.points.length; i++) {
      const a = limb.points[i - 1], b = limb.points[i], r = limb.radii[i - 1];
      const item = citadelItem('parallaxTendon', V3.lerp(a, b, .5), [r, r, V3.len(V3.sub(b, a)) / 2 + .18], color, phase === 'strike' ? .55 : .18, spaceBasisDir(V3.sub(b, a)), alpha);
      Object.assign(item, { parallaxFeature: feature, parallaxArm: limb.arm, parallaxSegment: i - 1, parallaxRadius: r, parallaxFrom: a.slice(), parallaxTo: b.slice() });
      items.push(item);
      if (feature === 'limb' && i % 3 === 0) {
        items.push(citadelItem('octa', b, [r * 1.15, r * 1.15, r * 1.15], phase === 'recover' ? '#ead39f' : '#b198c6', .28));
        citadelBeam(items, V3.add(a, [0, 0, r]), V3.add(b, [0, 0, r]), phase === 'recover' ? '#ffe4a1' : color, .12, .85);
      }
    }
    if (feature === 'limb') {
      const p = limb.points[limb.points.length - 1], r = limb.radii[limb.radii.length - 1];
      items.push(citadelItem('sphere', p, [r, r, r], phase === 'strike' ? '#ffe3c1' : '#c9a9d8', .65));
    }
  }
  finaleAlien = function (items, e, time, fx) {
    if (!active(e)) return original.alien(items, e, time, fx);
    const s = e.finale.parallax, a = s?.attack, add = (...args) => items.push(citadelItem(...args));
    const left = supports(e).length, breathe = fx ? Math.sin(time * 1.65) * .025 : 0;
    add('torus', [0, 0, -154], [43, 31, 12], '#29364c');
    add('torus', [0, 0, -149], [33, 23, 8], '#666278');
    add('lightRing', [0, 0, -140], [32, 22, 2], a?.phase === 'recover' ? '#ffe2a1' : '#c493ed', .9, SPACE_IDENTITY, .65);
    for (const side of [-1, 1]) {
      add('armor', [side * 26, 0, -169], [13, 26, 28], '#28344a');
      add('armor', [side * 32, 0, -151], [10, 18, 14], '#4e4760');
      add('armor', [0, side * 22, -164], [25, 7, 22], '#42445c');
      add('box', [0, side * 11, -133], [10, .45, .65], '#ffdba1', 1);
      add('box', [side * 11, 0, -133], [.45, 11, .65], '#ffdba1', 1);
      for (let i = 0; i < 5; i++) add('box', [side * (18 + i * 4), side * 18, -141], [1.2, 3 + i * .6, .7], i % 2 ? '#876982' : '#384356');
    }
    add('sphere', [0, 0, -140], [11 * (1 + breathe), 11 * (1 - breathe), 5], e.boss?.hit ? '#fff1db' : '#62465e', .2);
    add('torus', [0, 0, -133], [9, 9, 2], '#a99da8');
    add('sphere', [0, 0, -130], [7, 7, 1.1], left ? '#a169bd' : '#ffc082', .9);
    add('sphere', [Math.sin(time * .8) * 1.7, Math.cos(time * .55), -128], [2, 5, .4], '#eaf5ff', 1);
    if (left) add('sphere', [0, 0, -140], [17, 17, 8], '#be9aff', .7, SPACE_IDENTITY, .1);
    for (let arm = 0; arm < 8; arm++) {
      const index = a ? a.arms.indexOf(arm) : -1, selected = index >= 0;
      const limb = curve(e, arm, selected ? a : null, selected ? index : 0);
      const color = selected ? a.phase === 'recover' ? '#987f70' : pattern(a.kind).color : powered(e, arm) ? '#786580' : '#494658';
      addLimb(items, limb, selected ? a.phase : 'idle', color);
    }
    for (const core of supports(e)) {
      add('torus', core.pos, [6.8, 6.8, 2], '#9b7e81');
      add('sphere', V3.add(core.pos, [0, 0, 1]), [4.8, 4.8, 2.4], core.hit ? '#fffaf0' : '#ffba72', 1);
      add('lightRing', V3.add(core.pos, [0, 0, 3]), [7.6, 7.6, 1], '#ffce8f', 1, stationZBasis(fx ? time * .3 : 0), .8);
    }
    if (a?.phase === 'windup') {
      const color = pattern(a.kind).color;
      add('lightRing', a.aim, [8.5, 8.5, .25], color, 1, SPACE_IDENTITY, .55);
      if (a.kind === 'sweep') for (let x = -60; x < 60; x += 12) citadelBeam(items, V3.add(a.aim, [x, 0, 0]), V3.add(a.aim, [x + 6, 0, 0]), color, .35, .55);
      if (a.kind === 'pincer') for (let y = -42; y < 42; y += 12) citadelBeam(items, V3.add(a.aim, [0, y, 0]), V3.add(a.aim, [0, y + 6, 0]), color, .35, .55);
    }
  };
  drawFinaleHUD = function (c, e, cam, w, h) {
    const result = original.hud(c, e, cam, w, h);
    if (!active(e) || e.status !== 'playing') return result;
    const a = e.finale.parallax?.attack, mobile = isMobileLayout();
    const W = mobile ? Math.max(320, ARCADE.canvas?.getBoundingClientRect().width || 640) : 1280, H = h / w * W;
    c.save(); c.scale(w / W, w / W); c.textAlign = 'center'; c.textBaseline = 'middle';
    const width = Math.min(W - 20, mobile ? 400 : 550), x = (W - width) / 2;
    c.fillStyle = '#061525e8'; c.fillRect(x, 76, width, mobile ? 32 : 35);
    c.fillStyle = a?.phase === 'recover' ? '#b7f1cf' : a ? pattern(a.kind).color : '#a9c6d6';
    c.font = 'bold ' + (mobile ? 10 : 12) + 'px Arial';
    c.fillText(a?.phase === 'windup' || a?.phase === 'strike' ? pattern(a.kind).short + ' · ИМПУЛЬС ПЕРЕД УДАРОМ' : a?.phase === 'recover' ? 'КОНТРАТАКА · УРОН ОРУЖИЯ +35%' : 'АВТОКУРС ВЕДЁТ К ЦЕЛИ · УКЛОНЯЙСЯ САМ', W / 2, 92, width - 12);
    if (a && ['windup', 'strike'].includes(a.phase)) {
      const p = spaceProject(a.aim, cam, W, H), visible = p.z > 0 && p.x > 18 && p.x < W - 18 && p.y > 118 && p.y < H - 62;
      if (visible) {
        c.save(); c.beginPath(); c.rect(0, 116, W, Math.max(0, H - 172)); c.clip();
        c.strokeStyle = pattern(a.kind).color; c.lineWidth = 2; c.setLineDash(a.phase === 'windup' ? [6, 5] : []);
        const radius = clamp(8.5 * p.scale, 18, mobile ? 54 : 80);
        c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.restore();
        const labelY = p.y + radius + 13 < H - 55 ? p.y + radius + 13 : p.y - radius - 13;
        if (labelY > 120 && labelY < H - 55) {
          c.font = 'bold ' + (mobile ? 9 : 11) + 'px Arial'; c.fillText('ЗОНА УДАРА', p.x, labelY);
        }
      }
    }
    c.restore(); return result;
  };
  finaleOverlay = function (e) {
    let html = original.overlay(e);
    if (e?.status !== 'finalebrief' || !e.finale || typeof html !== 'string') return html;
    html = html.replace('4 опоры щупалец → открытое ядро', 'Уклоняйся от щупалец → 4 опоры → ядро');
    return html.replace('Контрольные точки сохраняются. Автокурс включён; огонь — ваша команда.',
      'Щупальца показывают замах: крюк — смени курс, хлёст — вверх или вниз, клещи — в сторону. Форсаж помогает уйти, импульс перед ударом отбивает щупальца. Броня поглощает 45% урона, но во время отхода щупалец защита падает и урон выше на 35%. Автокурс не уклоняется. Контрольные точки сохраняются.');
  };
  globalThis.CITADEL_PARALLAX = Object.freeze({ version: VERSION, active, patterns, attackGeometry, pointSegmentDistance });
})();
