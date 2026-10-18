/* Citadel 1.9.0 — «ФЗ уходит со связи».
 * A continuous flight through an asteroid corridor. Normal steering keeps a
 * visible lead ship in radio range; actual requirements arrive automatically.
 * Rendering is read-only. The rail, hazards and upload all live in the save.
 */
(function () {
  'use strict';
  const VERSION = '1.9.0';
  if (globalThis.CITADEL_PURSUIT || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype;
  const before = {
    beginStage: proto.beginStage, launch: proto.launch, step: proto.step,
    collect: proto.collect, checkStage: proto.checkStage, openNextLesson: proto.openNextLesson, continueLesson: proto.continueLesson,
    navTarget: proto.navTarget, guidance: proto.guidance, selectTarget: proto.selectTarget,
    objective: proto.objective, scene: spaceScene, camera: spaceCamera,
    flightHUD: drawFlightHUD, campaignHUD: drawCampaignFlightHUD,
    clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD,
    updateHUD: updateArcadeHUD, overlay: arcadeOverlayHTML,
  };
  const RULES = Object.freeze({ seconds: 86, calmSeconds: 78, speed: 82, calmSpeed: 74,
    horizontalSpeed: 40, verticalSpeed: 29, halfWidth: 66, halfHeight: 38,
    linkRadius: 13, calmLinkRadius: 16, minRange: 55, maxRange: 102,
    safeSeconds: 12, lookAhead: 8.5, rockInterval: 1.8, maxRocks: 22, maxBullets: 56 });
  const granting = new WeakSet();
  const loaded = e => !!e && e.stage === 1 && !e.finale && e.pursuit?.version === VERSION;
  const active = e => loaded(e) && e.phase === 'pursuit' && !e.crash;
  const distance = (a, b) => V3.len(V3.sub(a, b));
  const count = e => e.plan[1].filter(id => e.rescued.includes(id)).length;
  const casesDone = e => [2, 3].every(n => e.decisions.some(d => d.stage === 1 && d.caseIndex === n));
  const comic = (e, text, kind, pos) => e.emit('comic', { text, kind, anchor: pos.slice() });
  const smooth = n => { const t = arcadeClamp(n, 0, 1); return t * t * (3 - 2 * t); };
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

  // A seeded, continuous route is shared by the lead ship, its visible wake
  // and the generation of safe gaps. It does not depend on render frequency.
  function route(e, time) {
    const s = e.pursuit, t = Math.max(0, time), ease = smooth((t - 3) / 8), ph = s.routePhase;
    return [s.origin[0] + ease * (27 * Math.sin(t * .19 + ph) + 7 * Math.sin(t * .43 + ph * .7)),
      s.origin[1] + ease * (14 * Math.sin(t * .17 + ph * .6) + 4 * Math.sin(t * .37 + ph)),
      s.origin[2] - s.speed * t];
  }
  function leadPosition(e, time) {
    const gap = 78 + Math.sin(time * .23) * 5;
    return route(e, time + gap / e.pursuit.speed);
  }
  function moveLead(e, dt) {
    const s = e.pursuit, old = s.leader.pos;
    s.leader.pos = leadPosition(e, s.clock);
    s.leader.vel = dt > 0 ? V3.scale(V3.sub(s.leader.pos, old), 1 / dt) : [0, 0, -s.speed];
    for (const c of s.carriers) {
      c.pos = s.leader.pos.slice(); c.vel = s.leader.vel.slice();
      c.delivered = e.rescued.includes(c.reqId); c.dead = c.delivered;
      c.transfer = c.delivered ? 1 : arcadeClamp((s.progress / 100 * 3 - c.index), 0, 1);
    }
    for (const item of e.pickups) if (item.type === 'requirement') item.pos = s.leader.pos.slice();
  }
  function sync(e) {
    const s = e.pursuit;
    e.enemies = []; e.hostile = []; e.boss = null; e.lock = null;
    e.pickups = e.plan[1].map(reqId => {
      const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === reqId) || { type: 'requirement', reqId, r: 2 };
      item.pos = s.leader.pos.slice(); item.dead = e.rescued.includes(reqId);
      item.pursuitCarrier = s.leader.id; return item;
    });
    const minimum = count(e) / 3 * 100;
    if (!Number.isFinite(s.progress) || s.progress + 1e-7 < minimum) {
      s.progress = minimum; s.uploaded = minimum / 100 * s.requiredSeconds;
    }
    for (const c of s.carriers) { c.delivered = e.rescued.includes(c.reqId); c.dead = c.delivered; }
  }
  function generateRocks(e) {
    const s = e.pursuit;
    e.asteroids = e.asteroids.filter(a => !a.dead && a.passAt > s.clock - .7);
    while (4 + s.nextRock * RULES.rockInterval < s.clock + RULES.lookAhead) {
      const index = s.nextRock++, passAt = 4 + index * RULES.rockInterval;
      const rnd = arcadeSeed((e.seed + 1900417 + index * 7919) >>> 0), path = route(e, passAt);
      const add = (x, y, r, wall = false) => {
        e.asteroids.push({ id: ++e.entityId, pursuitRock: true, pos: [x, y, path[2]], r,
          variant: index % 3, phase: rnd() * Math.PI * 2, passAt, spawnedAt: s.clock,
          hp: wall ? null : 65, wall, hit: 0, contact: false, dead: false });
      };
      // The flanking rocks establish speed and depth from the first frame.
      // The first twelve seconds contain no obstacle in the usable corridor.
      for (const side of [-1, 1]) add(s.origin[0] + side * (81 + rnd() * 9),
        s.origin[1] + (rnd() - .5) * 56, 12 + rnd() * 6, true);
      if (passAt < RULES.safeSeconds) continue;
      const r = 6 + rnd() * 3, angle = rnd() * Math.PI * 2;
      let x = path[0] + Math.cos(angle) * (r + 14), y = path[1] + Math.sin(angle) * (r + 14);
      // On alternating bends, the tempting straight line is occupied. Following
      // FZ still leaves at least fourteen metres between its path and the rock.
      const centreDistance = Math.hypot(path[0] - s.origin[0], path[1] - s.origin[1]);
      if (index % 2 === 0 && centreDistance > r + 15) { x = s.origin[0]; y = s.origin[1]; }
      add(x, y, r);
    }
    e.asteroids = e.asteroids.slice(-RULES.maxRocks);
  }
  function initialize(e, migrating = false) {
    const previous = e.pursuit, rescued = count(e), seconds = e.assist ? RULES.calmSeconds : RULES.seconds;
    // Old cargo is never earned again. An unfinished old transfer contributes
    // only its genuine partial upload; all shield / escape states disappear.
    const partial = migrating && previous?.version === '1.8.0' ? Math.max(0, ...previous.carriers
      .filter(c => !e.rescued.includes(c.reqId)).map(c => Math.min(.99, finite(c.transfer) / Math.max(.1, finite(c.transferTime, 3))))) : 0;
    const uploaded = Math.min(seconds, (rescued + partial) / 3 * seconds);
    const origin = e.player.pos.slice(), leaderId = ++e.entityId;
    e.pursuit = { version: VERSION, clock: 0, state: 'chase', migrated: !!migrating,
      origin, returnStation: e.station.pos.slice(), speed: e.assist ? RULES.calmSpeed : RULES.speed,
      routePhase: arcadeSeed((e.seed + 91047) >>> 0)() * Math.PI * 2,
      requiredSeconds: seconds, uploaded, progress: uploaded / seconds * 100,
      nextRock: 0, velocity: [0, 0], linkId: null, linkJammed: false, linkRecovery: 0,
      link: { connected: false, reason: 'approach', distance: 78, offset: 0, blockedId: null },
      linkedSeconds: 0, disconnectedSeconds: 0, collisions: 0, rocksDestroyed: 0,
      completedAt: null, announced: false, lostLinkAt: null, shotsOpened: 0,
      leader: { id: leaderId, name: 'ФЗ', pos: V3.add(origin, [0, 0, -78]), vel: [0, 0, -RULES.speed],
        color: '#ffcc88', r: 5.6, pursuitCarrier: true, profile: 'lead', open: true, delivered: false },
      carriers: e.plan[1].map((reqId, index) => ({ id: ++e.entityId, index, reqId,
        name: ['Исходные требования', 'Уточнения', 'Подтверждённая версия'][index], profile: 'radio',
        pos: V3.add(origin, [0, 0, -78]), vel: [0, 0, -RULES.speed],
        open: true, hp: 0, maxHp: 0, transfer: 0, transferTime: 1, escaped: false,
        delivered: e.rescued.includes(reqId), dead: e.rescued.includes(reqId) })) };
    e.phase = 'pursuit'; e.location = 'ФЗ уходит со связи';
    e.wave = 0; e.waveSpawned = 0; e.waveClock = 0; e.spawnClock = 999;
    e.enemies = []; e.hostile = []; e.bullets = []; e.asteroids = [];
    e.particles = []; e.trails = []; e.explosions = []; e.boss = null;
    e.selectedTarget = leaderId; e.navMode = 'objective'; e.autopilot = false;
    e.detour = null; e.navWatch = null; e.hullCache = null; e.warning = '';
    Object.assign(e.player, { yaw: 0, pitch: 0, bank: 0, speed: e.pursuit.speed, boosting: true });
    moveLead(e, 0); sync(e); generateRocks(e);
    if (!migrating) e.say('Держись за кораблём ФЗ и обходи астероиды. Требования передаются сами, пока мы рядом. Нужна полная загрузка. Обычное управление — и вперёд!', 'brief', true);
    return e.pursuit;
  }
  function linkState(e) {
    const s = e.pursuit, from = e.player.pos, to = s.leader.pos;
    const range = distance(from, to), offset = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const radius = e.assist ? RULES.calmLinkRadius : RULES.linkRadius;
    let reason = offset > radius ? 'off-course' : range < RULES.minRange || range > RULES.maxRange ? 'range' : s.linkRecovery > 0 ? 'recovering' : 'connected';
    let blockedId = null;
    if (reason === 'connected') {
      const rock = e.asteroids.find(a => !a.dead && flightSegment(from, to, a.pos, a.r + .7) !== null);
      if (rock) { reason = 'occluded'; blockedId = rock.id; }
    }
    return { connected: reason === 'connected', reason, distance: range, offset, blockedId };
  }
  function linkEligible(e, carrier) {
    return active(e) && e.status === 'playing' && e.pursuit.state === 'chase' &&
      (!carrier || !carrier.delivered) && linkState(e).connected;
  }
  function queueReviews(e) {
    const current = e.status === 'lesson' ? e.lesson?.caseIndex : null;
    const done = new Set(e.decisions.filter(d => d.stage === 1).map(d => d.caseIndex)), seen = new Set();
    e.lessonQueue = e.lessonQueue.filter(l => {
      if (l.stage !== 1) return true;
      if (done.has(l.caseIndex) || l.caseIndex === current || seen.has(l.caseIndex)) return false;
      seen.add(l.caseIndex); return true;
    });
    for (const [caseIndex, reqId] of [[2, e.plan[1][0]], [3, e.plan[1][2]]]) {
      if (!done.has(caseIndex) && caseIndex !== current && !seen.has(caseIndex)) e.lessonQueue.push({ reqId, caseIndex, stage: 1 });
    }
  }
  function review(e) {
    const s = e.pursuit;
    if (s.state !== 'review') {
      s.state = 'review'; s.completedAt = s.clock; s.progress = 100; s.uploaded = s.requiredSeconds;
      s.linkId = null; e.enemies = []; e.hostile = []; e.bullets = []; e.lock = null;
      e.autopilot = false; e.player.speed = 0; e.player.boosting = false;
      e.say('Все требования у нас! Ушли из астероидного поля. Спокойно сверим два решения — и в Цитадель.', 'success', true);
      comic(e, 'ТЗ СКАЧАНО!', 'success', s.leader.pos);
    }
    queueReviews(e);
    if (!casesDone(e)) { if (e.status === 'playing') before.openNextLesson.call(e); return; }
    if (e.status !== 'playing') return;
    // The review cards are the safe cut between the outbound chase and the
    // home approach. Return to the shared, bounded world at the visible FRONT
    // of the Citadel, so its physical gate and the 1.8.1 docking still agree.
    s.state = 'return'; e.phase = 'dock'; e.station.pos = s.returnStation.slice();
    e.player.pos = V3.add(e.station.pos, [0, 1, -180]);
    Object.assign(e.player, { yaw: Math.PI, pitch: 0, bank: 0, speed: 22, boosting: false });
    e.asteroids = []; e.trails = []; e.particles = []; e.explosions = [];
    e.selectedTarget = null; e.navMode = 'objective'; e.autopilot = true;
    e.detour = null; e.navWatch = null; e.hullCache = null; e.warning = '';
    e.say('Загрузка завершена, решения сохранены. Впереди голубой шлюз Цитадели. Автокурс ведёт на посадку.', 'success', true);
    e.emit('phase', 'dock');
  }
  function acquire(e, c) {
    if (c.delivered || e.rescued.includes(c.reqId)) return;
    const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === c.reqId);
    if (!item) return;
    item.pos = e.player.pos.slice();
    granting.add(e);
    try { e.collect(item); } finally { granting.delete(e); item.pos = e.pursuit.leader.pos.slice(); }
    if (!e.rescued.includes(c.reqId)) return;
    c.delivered = true; c.dead = true; c.transfer = 1;
    comic(e, count(e) === 3 ? 'ПОСЛЕДНЕЕ УТОЧНЕНИЕ!' : 'ТРЕБОВАНИЕ ПРИНЯТО!', 'success', e.pursuit.leader.pos);
  }
  function hazards(e, old, dt) {
    const s = e.pursuit, p = e.player;
    for (const rock of e.asteroids) {
      rock.hit = Math.max(0, finite(rock.hit) - dt);
      if (rock.dead || rock.contact || flightSegment(old, p.pos, rock.pos, rock.r + 1.8) === null) continue;
      rock.contact = true;
      if (e.damage(19)) {
        s.collisions++; s.linkRecovery = .8;
        e.burst(V3.lerp(old, rock.pos, .5), '#ffc096', 9);
        if (e.status === 'crashing') e.lossReason = 'Корабль не выдержал столкновений. Следуйте за ФЗ и заранее обходите отмеченные астероиды.';
      }
      // No braking or bounce into another rock: one obstacle can hit once.
      if (e.status !== 'playing') return;
    }
  }
  function projectiles(e, dt, input) {
    if (input.fire) e.fire();
    if (input.pulse && e.player.pulseCooldown <= 0) e.pulse();
    for (const shot of e.bullets) {
      const old = shot.pos; shot.pos = V3.add(old, V3.scale(shot.vel, dt)); shot.life -= dt;
      let target = null, first = 2;
      for (const rock of e.asteroids) {
        if (rock.dead) continue;
        const t = flightSegment(old, shot.pos, rock.pos, rock.r + shot.r);
        if (t !== null && t < first) { target = rock; first = t; }
      }
      if (!target) continue;
      shot.life = 0; e.burst(V3.lerp(old, shot.pos, first), '#e7c59e', 3);
      if (!target.wall) {
        target.hp -= shot.damage; target.hit = .1;
        if (target.hp <= 0) { target.dead = true; e.pursuit.rocksDestroyed++; e.burst(target.pos, '#c5bbb0', 10); e.emit('destroy', 'asteroid'); }
      }
    }
    e.bullets = e.bullets.filter(b => b.life > 0).slice(-RULES.maxBullets);
  }
  function effects(e, dt) {
    for (const particle of e.particles) { particle.pos = V3.add(particle.pos, V3.scale(particle.vel, dt)); particle.life -= dt; }
    e.particles = e.particles.filter(p => p.life > 0).slice(-64);
    for (const effect of e.explosions) effect.life -= dt;
    e.explosions = e.explosions.filter(x => x.life > 0).slice(-12);
  }

  proto.beginStage = function (n, ...args) {
    this.pursuit = null;
    const result = before.beginStage.call(this, n, ...args);
    if (n === 1 && !this.finale) {
      initialize(this);
      if (ARCADE.engine === this) ARCADE.overlayToken = '';
      this.emit('state', this.status);
    }
    return result;
  };
  proto.launch = function (...args) {
    if (!active(this) || this.status !== 'briefing') return before.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = false;
    if (!this.pursuit.announced) {
      this.pursuit.announced = true;
      comic(this, 'ФЗ УХОДИТ СО СВЯЗИ!', 'action', this.pursuit.leader.pos);
    }
    this.say('Вижу ФЗ впереди. Следуй за ним, загрузка идёт сама. Первые секунды — чистый коридор. Почувствуй управление!', 'order', true);
    this.emit('state', 'playing'); return true;
  };
  proto.collect = function (item, ...args) {
    if (active(this) && item.type === 'requirement' && !granting.has(this)) return;
    return before.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) {
    if (active(this) && this.pursuit.state !== 'review') return;
    return before.openNextLesson.apply(this, args);
  };
  proto.continueLesson = function (...args) {
    const oldFlightReview = active(this) && this.pursuit.state === 'chase';
    const result = before.continueLesson.apply(this, args);
    // A pre-1.9 saved lesson may have been open in the middle of the orbit.
    // Continuing it starts the new steering loop in its normal manual mode.
    if (oldFlightReview && active(this) && this.pursuit.state === 'chase') this.autopilot = false;
    return result;
  };
  proto.checkStage = function (...args) {
    if (!active(this)) return before.checkStage.apply(this, args);
    if (this.status === 'playing' && count(this) === 3) review(this);
  };
  proto.navTarget = function (...args) {
    if (!active(this)) return before.navTarget.apply(this, args);
    return { ...this.pursuit.leader, pos: this.pursuit.leader.pos.slice(), name: 'ФЗ · держитесь следом' };
  };
  proto.selectTarget = function (...args) {
    if (!active(this)) return before.selectTarget.apply(this, args);
    this.selectedTarget = this.pursuit.leader.id; this.navMode = 'objective';
  };
  proto.guidance = function (input = {}) {
    if (!active(this)) return before.guidance.call(this, input);
    if (!this.autopilot) return input;
    const d = V3.sub(this.pursuit.leader.pos, this.player.pos);
    return { ...input, turn: arcadeClamp(d[0] * .075, -1, 1), pitch: arcadeClamp(d[1] * .085, -1, 1) };
  };
  proto.step = function (delta, input = {}) {
    if (!active(this)) return before.step.call(this, delta, input);
    if (this.status === 'lesson') return before.step.call(this, delta, input);
    if (this.status !== 'playing') return;
    if (count(this) === 3 || this.pursuit.state === 'review') { review(this); return; }
    const dt = arcadeClamp(finite(delta), 0, .04);
    if (!dt) return;
    const s = this.pursuit, p = this.player, old = p.pos.slice();
    s.clock += dt; this.elapsed += dt; this.stageTime += dt; this.phaseClock += dt;
    this.captainClock = Math.max(0, this.captainClock - dt);
    for (const key of ['flash', 'shake', 'hitFlash', 'pulseWave']) this[key] = Math.max(0, finite(this[key]) - dt);
    for (const key of ['shotCooldown', 'missileCooldown', 'pulseCooldown', 'flipCooldown', 'invulnerable']) p[key] = Math.max(0, finite(p[key]) - dt);
    s.linkRecovery = Math.max(0, s.linkRecovery - dt);
    moveLead(this, dt); generateRocks(this);
    const control = this.guidance(input), turn = arcadeClamp(finite(control.turn), -1, 1), pitch = arcadeClamp(finite(control.pitch), -1, 1);
    const blend = 1 - Math.exp(-dt * 8);
    s.velocity[0] += (turn * RULES.horizontalSpeed - s.velocity[0]) * blend;
    s.velocity[1] += (pitch * RULES.verticalSpeed - s.velocity[1]) * blend;
    p.pos = [arcadeClamp(p.pos[0] + s.velocity[0] * dt, s.origin[0] - RULES.halfWidth, s.origin[0] + RULES.halfWidth),
      arcadeClamp(p.pos[1] + s.velocity[1] * dt, s.origin[1] - RULES.halfHeight, s.origin[1] + RULES.halfHeight),
      s.origin[2] - s.speed * s.clock];
    p.yaw = Math.atan2(s.velocity[0], s.speed) * .7;
    p.pitch = Math.atan2(s.velocity[1], s.speed) * .7;
    p.bank += (-turn * .62 - p.bank) * blend; p.speed = s.speed; p.boosting = true;
    hazards(this, old, dt);
    if (this.status !== 'playing') return;
    projectiles(this, dt, input); effects(this, dt);
    s.link = linkState(this); s.linkId = s.link.connected ? s.leader.id : null; s.linkJammed = false;
    if (s.link.connected) {
      s.linkedSeconds += dt; s.uploaded = Math.min(s.requiredSeconds, s.uploaded + dt);
      s.progress = Math.min(100, s.uploaded / s.requiredSeconds * 100);
      s.lostLinkAt = null;
    } else {
      s.disconnectedSeconds += dt;
      if (s.lostLinkAt === null) s.lostLinkAt = s.clock;
    }
    // Upload never decreases, including a collision, a missed turn or a shot.
    const earned = Math.min(3, Math.floor((s.progress + 1e-7) / (100 / 3)));
    while (count(this) < earned) {
      const next = s.carriers.find(c => !this.rescued.includes(c.reqId));
      if (!next) break;
      const previous = count(this); acquire(this, next);
      if (count(this) === previous) break;
    }
    if (count(this) === 3) review(this);
  };
  proto.objective = function (...args) {
    if (!active(this) || !['briefing', 'playing', 'paused'].includes(this.status)) return before.objective.apply(this, args);
    const s = this.pursuit;
    return { title: 'Следуйте за кораблём ФЗ',
      detail: 'Обходите астероиды обычным управлением. Рядом с ФЗ требования скачиваются автоматически; потеря связи только ставит загрузку на паузу.',
      progress: 'ТРЕБОВАНИЯ ' + Math.floor(s.progress) + '% · ЩИТ ' + Math.ceil(this.player.hp) };
  };

  function shipMeshes(ship, time, fx, player = false) {
    const b = player ? flightBasis(ship.yaw, ship.pitch, ship.bank) : spaceBasisDir(ship.vel);
    const scale = player ? 1.35 : 2, model = spaceModel(ship.pos, [scale, scale, scale], b), items = [];
    const add = (mesh, off, size, color, em = 0, mirror = false) => {
      const basis = mirror ? { ...b, r: V3.scale(b.r, -1) } : b;
      const item = citadelItem(mesh, spacePoint(model, off), size.map(n => n * scale), color, em, basis);
      if (!player) item.pursuitCarrier = ship.id;
      items.push(item);
    };
    add('hull', [0, 0, 0], [1.25, 1.15, 1.8], player ? '#d8e6e8' : '#f2c990');
    for (const side of [-1, 1]) {
      add('wing', [0, 0, -.9], [1.15, 1, 1.3], player ? '#547f9c' : '#d87d45', 0, side < 0);
      add('armor', [side * 1.7, 0, -2], [.38, .33, 1.6], player ? '#658799' : '#374b60');
      add('box', [side * 1.7, 0, -3.65], [.25, .23, .15], '#9dfaff', 1);
      add('octa', [side * 1.7, 0, -4.7], [.23, .19, 1.3 + Math.sin(time * 23 + side) * .2], '#86eaff', 1);
      add('box', [side * 2.7, -.04, -1.3], [.09, .07, .8], player ? '#b0f4fa' : '#fff0c4', .5);
    }
    add('sphere', [0, .48, .5], [.49, .36, 1.2], player ? '#3a8fab' : '#76d9e5', .18);
    add('box', [0, .75, -2.7], [.09, .68, .7], player ? '#9acbd5' : '#ffe4b5');
    if (fx) for (const side of [-1, 1]) add('octa', [side * 1.7, 0, -7], [.08, .08, 2], '#b0f4ff', 1);
    return items;
  }
  function carrierMeshes(c, time, fx) { return c?.delivered ? [] : shipMeshes(c, time, fx); }
  spaceCamera = function (e, time, preview) {
    if (!active(e)) return before.camera(e, time, preview);
    const p = e.player.pos, lead = e.pursuit.leader.pos;
    const rect = ARCADE.canvas?.getBoundingClientRect?.(), aspect = rect?.height ? rect.width / rect.height : 16 / 9;
    const fov = aspect < .85 ? 1.2 : 1.02;
    return stationLook([p[0] * .8 + lead[0] * .2, p[1] + 7.3, p[2] + 24],
      [p[0] * .75 + lead[0] * .25, p[1] + 2.5, p[2] - 110], fov, { near: .3, far: 3200 });
  };
  spaceScene = function (e, time, fx = true) {
    if (!active(e)) return before.scene(e, time, fx);
    const s = e.pursuit, p = e.player, items = [];
    for (const a of e.asteroids) {
      if (a.dead) continue;
      items.push(citadelItem('rock' + a.variant, a.pos, [a.r, a.r, a.r], a.hit > 0 ? '#ffddb4' :
        a.wall ? ['#586878', '#867b79', '#62737f'][a.variant] : '#b59d86', 0,
        flightBasis(a.phase + time * .018, a.phase * .2, a.phase * .7)));
    }
    // The bright wake is the course, not another collectible or action marker.
    let prev = s.leader.pos;
    for (let i = 1; i <= 9; i++) {
      const t = s.clock + (78 + Math.sin(s.clock * .23) * 5) / s.speed - i * .085;
      if (t < 0) break;
      const point = route(e, t);
      citadelBeam(items, prev, point, '#87dfee', .08, .22 + (10 - i) * .02); prev = point;
    }
    if (fx) {
      for (let i = 0; i < 12; i++) {
        const z = p.pos[2] - ((s.clock * s.speed * .75 + i * 47) % 530);
        const x = s.origin[0] + (i % 2 ? 1 : -1) * (46 + i % 4 * 8), y = s.origin[1] + (i % 3 - 1) * 34;
        citadelBeam(items, [x, y, z], [x, y, z + 19], '#6b9baa', .025, .28);
      }
      for (const q of e.particles) items.push(citadelItem('octa', q.pos, [q.size, q.size, q.size], q.color, 1, SPACE_IDENTITY, Math.min(1, q.life / q.max)));
    }
    for (const b of e.bullets) items.push(citadelItem('box', b.pos, [.08, .08, 3.8], b.color, 1, spaceBasisDir(b.vel)));
    items.push(...shipMeshes(s.leader, time, fx), ...shipMeshes(p, time, fx, true));
    return items;
  };
  function danger(e) {
    const s = e.pursuit, p = e.player.pos;
    return e.asteroids.filter(a => !a.dead && !a.contact && a.passAt > s.clock && a.passAt - s.clock < 3.3)
      .map(a => ({ rock: a, eta: a.passAt - s.clock,
        miss: Math.hypot(p[0] + s.velocity[0] * Math.min(1, a.passAt - s.clock) - a.pos[0],
          p[1] + s.velocity[1] * Math.min(1, a.passAt - s.clock) - a.pos[1]) }))
      .filter(a => a.miss < a.rock.r + 5).sort((a, b) => a.eta - b.eta)[0] || null;
  }
  // CSS-pixel rectangles for the outer comic / caption compositor. The caller
  // supplies CSS dimensions, just like the HUD after its DPR transform.
  function hudBounds(e, cam, W, H) {
    if (!active(e) || !cam) return [];
    const width = Math.min(460, W - 20), target = spaceProject(e.pursuit.leader.pos, cam, W, H);
    const aim = spaceProject([e.player.pos[0], e.player.pos[1], e.pursuit.leader.pos[2]], cam, W, H);
    const boxes = [{ x: (W - width) / 2, y: 12, width, height: 66, kind: 'hud' }];
    if (target.z > 0 && aim.z > 0) {
      const radius = Math.min(86, (e.assist ? RULES.calmLinkRadius : RULES.linkRadius) * aim.scale);
      const left = arcadeClamp(Math.min(aim.x - radius - 12, target.x - 55), 0, W);
      const top = arcadeClamp(Math.min(aim.y - radius - 12, target.y - 45), 0, H);
      const right = arcadeClamp(Math.max(aim.x + radius + 12, target.x + 55), 0, W);
      const bottom = arcadeClamp(Math.max(aim.y + radius + 12, target.y + 35), 0, H);
      boxes.push({ x: left, y: top, width: right - left, height: bottom - top, kind: 'target' });
    }
    return boxes;
  }
  function hud(ctx, e, cam, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (!['playing', 'paused'].includes(e.status)) return;
    const rect = ARCADE.canvas?.getBoundingClientRect?.(), scale = rect?.width ? w / rect.width : 1;
    const W = w / scale, H = h / scale, s = e.pursuit, connected = s.link.connected;
    const width = Math.min(460, W - 20), x = (W - width) / 2, top = 12;
    const color = connected ? '#a5f6dc' : '#ffd299', q = spaceProject(s.leader.pos, cam, W, H);
    ctx.save(); ctx.scale(scale, scale); ctx.textBaseline = 'middle';
    ctx.fillStyle = '#071624e8'; ctx.fillRect(x, top, width, 66);
    ctx.strokeStyle = '#7aacbc66'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, top + .5, width - 1, 65);
    ctx.font = 'bold 12px Arial'; ctx.textAlign = 'left'; ctx.fillStyle = '#e7f5f4';
    ctx.fillText('ПОГОНЯ ЗА ФЗ', x + 12, top + 16);
    ctx.font = '11px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = '#bcd0d8';
    ctx.fillText('Щит ' + Math.ceil(e.player.hp) + '  ·  ' + Math.floor(s.progress) + '%', x + width - 12, top + 16);
    ctx.fillStyle = '#243d49'; ctx.fillRect(x + 12, top + 31, width - 24, 6);
    ctx.fillStyle = color; ctx.fillRect(x + 12, top + 31, (width - 24) * s.progress / 100, 6);
    ctx.textAlign = 'left'; ctx.fillStyle = color; ctx.font = '11px Arial';
    const message = s.clock < 8 ? 'Следуйте за ФЗ — требования скачиваются сами' : connected ?
      'Связь есть · держитесь следом · ' + Math.round(s.link.distance) + ' м' :
      s.link.reason === 'occluded' ? 'Связь за астероидом · обойдите его вслед за ФЗ' :
      s.link.reason === 'recovering' ? 'Связь восстанавливается · загрузка сохранена' : 'Вернитесь за ФЗ · загрузка сохранена';
    ctx.fillText(message, x + 12, top + 51, width - 24);
    // A single spatial guide shows whether the lead ship is within our radio
    // cone. It moves with our ship, so steering aligns it with the visible FZ.
    const aim = spaceProject([e.player.pos[0], e.player.pos[1], s.leader.pos[2]], cam, W, H);
    if (aim.z > 0) {
      const r = (e.assist ? RULES.calmLinkRadius : RULES.linkRadius) * aim.scale;
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.arc(aim.x, aim.y, Math.min(86, r), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (q.z > 0) {
      const lx = arcadeClamp(q.x, 40, W - 40), ly = arcadeClamp(q.y - 25, 98, H - 38);
      ctx.textAlign = 'center'; ctx.fillStyle = '#f5e3c6'; ctx.font = 'bold 12px Arial';
      ctx.strokeStyle = '#071624'; ctx.lineWidth = 4; ctx.strokeText('ФЗ', lx, ly); ctx.fillText('ФЗ', lx, ly);
      if (q.x < 16 || q.x > W - 16) {
        ctx.beginPath(); ctx.moveTo(lx + (q.x < 16 ? -10 : 10), ly + 13); ctx.lineTo(lx, ly + 9); ctx.lineTo(lx, ly + 17); ctx.closePath(); ctx.fill();
      }
    }
    const warning = danger(e);
    if (warning) {
      const a = spaceProject(warning.rock.pos, cam, W, H), r = Math.min(90, warning.rock.r * a.scale + 7);
      if (a.z > 0 && a.x > -r && a.x < W + r && a.y > 82 && a.y < H) {
        ctx.strokeStyle = '#ffb88a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe3ca'; ctx.textAlign = 'center'; ctx.font = 'bold 10px Arial';
        ctx.strokeStyle = '#171b23'; ctx.lineWidth = 4;
        const label = 'АСТЕРОИД · ' + warning.eta.toFixed(1) + ' с', y = Math.max(97, a.y - r - 11);
        ctx.strokeText(label, arcadeClamp(a.x, 75, W - 75), y); ctx.fillText(label, arcadeClamp(a.x, 75, W - 75), y);
      }
    }
    if (e.flash > 0) { ctx.strokeStyle = 'rgba(255,120,84,' + Math.min(.6, e.flash * 2) + ')'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6); }
    ctx.restore();
  }
  drawFlightHUD = function (ctx, e, cam, w, h) {
    if (!active(e)) return before.flightHUD(ctx, e, cam, w, h);
    return hud(ctx, e, cam, w, h);
  };
  drawCampaignFlightHUD = function (...args) { if (!active(args[1])) return before.campaignHUD.apply(this, args); };
  drawClarityHUD = function (...args) { if (!active(args[1])) return before.clarityHUD.apply(this, args); };
  drawMobileGameHUD = function (ctx, e, cam, w, h) {
    if (!active(e)) return before.mobileHUD(ctx, e, cam, w, h);
    return hud(ctx, e, cam, w, h);
  };
  updateArcadeHUD = function (...args) {
    const result = before.updateHUD.apply(this, args), e = ARCADE.engine;
    if (!active(e)) return result;
    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    set('arcade-mission-title', 'ФЗ уходит со связи');
    set('arcade-mission-brief', 'Следуйте за ФЗ между астероидами. Требования передаются автоматически.');
    set('citadel-objective-phase', 'УРОВЕНЬ 04 · ПОГОНЯ');
    set('citadel-primary', e.autopilot ? 'Ручное управление' : 'Помощь в погоне');
    set('mobile-crystal', 'Следовать за ФЗ');
    set('citadel-threat-count', 'ЗАГРУЗКА ' + Math.floor(e.pursuit.progress) + '%');
    const routeNode = document.getElementById('citadel-route');
    if (routeNode) routeNode.innerHTML = '<span>04 · ПОГОНЯ ЗА ФЗ</span><span>ТРЕБОВАНИЯ <b>' + Math.floor(e.pursuit.progress) + '%</b></span><span>ДЕРЖИТЕСЬ СЛЕДОМ</span>';
    return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine;
    if (!active(e) || e.status !== 'briefing') return before.overlay.apply(this, args);
    const controls = isMobileLayout() ? 'Обычный джойстик: в стороны, вверх и вниз.' : 'Обычное управление: WASD, стрелки или мышь.';
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 04 · ПОГОНЯ</span>' +
      '<h3>ФЗ уходит со связи</h3><p>Корабль ФЗ уносит требования через астероидное поле. Держитесь за ним — и скачайте всё до <b>100%</b>.</p>' +
      '<div class="brief-command"><span class="crystal-symbol">↗</span><div><b>Следуйте за ФЗ и обходите астероиды</b><small>' + controls + ' Скорость постоянная. Первые секунды коридор свободен.</small></div></div>' +
      '<div class="brief-command"><span class="crystal-symbol">◉</span><div><b>Рядом с ФЗ загрузка идёт сама</b><small>Держите корабль в голубом круге связи. Потеряли след — вернитесь: полученные проценты сохраняются.</small></div></div>' +
      '<p>После полной загрузки спокойно сверим решения и вернёмся в Цитадель.</p>' +
      '<button class="arcade-play" data-action="citadel-launch">В ПОГОНЮ ↗</button></div>';
  };

  if (typeof CUP_ENGINE_KEYS !== 'undefined' && !CUP_ENGINE_KEYS.includes('pursuit')) CUP_ENGINE_KEYS.push('pursuit');
  if (typeof CUP_LEVELS !== 'undefined') CUP_LEVELS[3] = 'ФЗ уходит со связи';
  if (typeof cupUnpack === 'function') {
    const unpack = cupUnpack;
    cupUnpack = function (...args) {
      const e = unpack.apply(this, args);
      if (e.stage !== 1 || e.finale || !['orientation', 'battle', 'retrieve', 'pursuit'].includes(e.phase)) return e;
      if (loaded(e)) {
        if (active(e)) sync(e);
      } else if (['briefing', 'playing', 'paused', 'lesson'].includes(e.status)) initialize(e, true);
      return e;
    };
  }
  globalThis.CITADEL_PURSUIT = Object.freeze({ version: VERSION, active, flight: active, count, linkEligible, carrierMeshes, hudBounds,
    rules: RULES,
    carriers: e => loaded(e) ? e.pursuit.carriers.map(c => ({ id: c.id, reqId: c.reqId, profile: c.profile,
      pos: c.pos.slice(), shield: 0, open: true, escaped: false, delivered: c.delivered,
      transfer: c.transfer, transferTime: 1 })) : [],
    inspection: e => loaded(e) ? { version: VERSION, active: active(e), state: e.pursuit.state,
      clock: e.pursuit.clock, progress: e.pursuit.progress, uploaded: e.pursuit.uploaded,
      requiredSeconds: e.pursuit.requiredSeconds, leader: e.pursuit.leader.pos.slice(),
      player: e.player.pos.slice(), speed: e.player.speed, link: { ...e.pursuit.link },
      requirements: count(e), decisions: e.decisions.filter(d => d.stage === 1).length,
      collisions: e.pursuit.collisions, rocksDestroyed: e.pursuit.rocksDestroyed,
      asteroids: e.asteroids.map(a => ({ id: a.id, pos: a.pos.slice(), r: a.r, wall: a.wall,
        eta: a.passAt - e.pursuit.clock, spawnedAt: a.spawnedAt, contact: a.contact, dead: a.dead })) } : null,
  });
})();
