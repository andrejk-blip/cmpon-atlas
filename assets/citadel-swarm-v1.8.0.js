/* Citadel 1.8.0 — level 7, «Рой уточнений».
 * A bounded formation battle with a moving communication window. The pilot
 * manoeuvres across the swarm, opens firing gaps, and downloads three real FT
 * packets. Existing lesson decisions and the visible Citadel dock are reused.
 */
(function () {
  'use strict';
  const VERSION = '1.8.0';
  if (globalThis.CITADEL_SWARM?.version === VERSION || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype;
  const previous = {};
  for (const name of ['beginStage', 'launch', 'step', 'hit', 'pulse', 'collect', 'openNextLesson',
    'continueLesson', 'checkStage', 'navTarget', 'guidance', 'objective', 'interact', 'flip']) previous[name] = proto[name];
  const view = { scene: spaceScene, camera: spaceCamera, flightHUD: drawFlightHUD,
    campaignHUD: drawCampaignFlightHUD, clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD,
    update: updateArcadeHUD, mobileUpdate: updateMobileArcade, clarityUpdate: updateCitadelClarity,
    overlay: arcadeOverlayHTML, action: arcadeAction, mobileAction };
  const AWARDING = new WeakSet();
  const ARENA = Object.freeze({ x: 42, y: 26 });
  const FORMS = ['КОЛЬЦО', 'КЛИН', 'СПИРАЛЬ'];
  const COLORS = ['#8bafff', '#ffc27f', '#e19eff'];
  const DOWNLOAD = { normal: 15, calm: 12 };
  const vec = (x, y, z = 0) => [x, y, z];
  const completed = e => e.plan[2].filter(id => e.rescued.includes(id)).length;
  const configured = e => !!e && e.stage === 2 && !e.finale && e.swarm?.version === VERSION;
  const active = e => configured(e) && e.phase === 'swarm' && !e.swarm.complete && !e.crash;
  const currentJammer = e => e.enemies.find(x => x.swarmDrone && x.jammer && !x.dead && x.hp > 0) || null;
  const mobile = () => typeof isMobileLayout === 'function' && isMobileLayout();
  const secondsNeeded = e => DOWNLOAD[e.assist ? 'calm' : 'normal'];
  const insideWindow = e => active(e) && Math.hypot(e.player.pos[0] - e.swarm.window[0],
    e.player.pos[1] - e.swarm.window[1]) <= e.swarm.radius;

  function windowAt(s, time = s.time) {
    const centers = [[23, 10], [-23, -9], [17, -12]], center = centers[Math.min(2, s.packet)];
    const age = Math.max(0, time - s.formationStart);
    return [center[0] + Math.sin(age * .34 + s.seedPhase) * 4,
      center[1] + Math.sin(age * .47 + s.seedPhase * .5) * 3, 0];
  }
  function formationPoint(s, index, count) {
    const angle = index / count * Math.PI * 2 + s.seedPhase + (s.time - s.formationStart) * .12;
    if (s.packet === 0) return [Math.cos(angle) * 43, Math.sin(angle) * 27, -64 + Math.sin(angle * 2) * 9];
    if (s.packet === 1) {
      const row = Math.floor(index / 2) + 1, side = index % 2 ? 1 : -1;
      return [side * (7 + row * 5.2), 22 - row * 7 + Math.sin(s.time * .4 + index) * 2,
        -47 - row * 4.2];
    }
    const radius = 16 + index / Math.max(1, count - 1) * 28;
    return [Math.cos(angle + index * .39) * radius, Math.sin(angle + index * .39) * radius * .66,
      -48 - index * 2.4];
  }
  function spawn(e, index) {
    const s = e.swarm, slot = s.slots[index], jammer = index === 0;
    const hp = jammer ? (e.assist ? 230 : 310) : (e.assist ? 112 : 158);
    const pos = jammer ? V3.add(s.window, [0, 0, -55]) : formationPoint(s, index - 1, s.slots.length - 1);
    const drone = { id: ++e.entityId, swarmDrone: true, jammer, slot: index, formation: s.packet,
      pos, vel: [0, 0, 0], hp, maxHp: hp, r: jammer ? 4.9 : 3.7,
      type: jammer ? 'hunter' : index % 3 === 0 ? 'heavy' : 'scout', role: 'fighter',
      name: jammer ? 'Глушитель канала ФТ' : 'Рой · уточнение ' + index,
      color: jammer ? '#ffcf85' : COLORS[s.packet], hit: 0, warp: .8, age: 0,
      // Legacy channel means a beam aimed at e.nodes[enemy.node]. A swarm
      // jammer targets its communication window instead, and uses jammer.
      phase: index * .7, dead: false, channel: false, points: 0 };
    slot.id = drone.id; slot.respawnAt = 0; e.enemies.push(drone);
    if (jammer) e.selectedTarget = drone.id;
    return drone;
  }
  function formSwarm(e, announce = true) {
    const s = e.swarm;
    s.formationStart = s.time; s.window = windowAt(s); s.attack = null; s.attackClock = 3.4;
    s.transition = 2.2; s.inside = false; s.blocked = true;
    s.slots = Array.from({ length: e.assist ? 10 : 13 }, (_, index) => ({ index, id: null, paid: false, respawnAt: 0 }));
    e.enemies = []; e.bullets = []; e.hostile = []; e.selectedTarget = null; e.lock = null;
    for (let i = 0; i < s.slots.length; i++) spawn(e, i);
    if (announce) {
      e.notify('РОЙ ПЕРЕСТРАИВАЕТСЯ · ' + FORMS[s.packet], 'Разбей глушитель. Держи корабль в голубом окне связи.');
      e.emit('comic', { text: ['СЛИШКОМ МНОГО УТОЧНЕНИЙ!', 'СОГЛАСОВАНИЕ КЛИНОМ!', 'ЕЩЁ ОДИН КРУГ ПРАВОК!'][s.packet],
        kind: 'warning', anchor: s.window.slice() });
    }
  }
  function initialise(e, migration = false) {
    const savedStatus = e.status, savedResume = e.resumeStatus;
    const s = e.swarm = { version: VERSION, time: 0, packet: 0, transfer: [0, 0, 0],
      complete: false, seedPhase: (e.seed % 65521) / 65521 * Math.PI * 2,
      radius: e.assist ? 11.3 : 9.2, window: [0, 0, 0], formationStart: 0,
      slots: [], attack: null, attackClock: 3.4, attackIndex: 0, transition: 2.2,
      inside: false, blocked: true, shotsCleared: 0, damageTaken: 0, warnedManual: false };
    for (let i = 0; i < 3; i++) if (e.rescued.includes(e.plan[2][i])) s.transfer[i] = secondsNeeded(e);
    s.packet = e.plan[2].findIndex(id => !e.rescued.includes(id));
    if (s.packet < 0) s.packet = 3;
    e.phase = 'swarm'; e.autopilot = false; e.navMode = 'objective'; e.wave = 0;
    e.waveSpawned = 0; e.waveClock = 0; e.waveSpawnTimer = 999; e.spawnClock = 999;
    e.detour = null; e.navWatch = null; e.hullCache = null; e.board = null; e.boss = null;
    e.asteroids = []; e.hostile = []; e.bullets = []; e.particles = []; e.explosions = [];
    e.station = { ...e.station, pos: [0, 0, -185] };
    e.location = 'Рой уточнений';
    e.pickups = e.plan[2].map(reqId => ({ type: 'requirement', reqId, pos: [0, 0, -55], r: 7,
      dead: e.rescued.includes(reqId) }));
    Object.assign(e.player, { pos: [0, 0, 0], yaw: 0, pitch: 0, bank: 0, speed: 0, boosting: false });
    if (!migration) e.player.invulnerable = 3;
    if (s.packet < 3) formSwarm(e, false);
    else finish(e, false);
    if (migration && ['paused', 'lesson', 'briefing'].includes(savedStatus)) {
      e.status = savedStatus; e.resumeStatus = savedResume;
    }
  }
  function lessonQueue(e) {
    // Old saves may already contain one decision or a card waiting to be read.
    // Use case indices as the key, so migration never grants or queues it twice.
    const pending = new Set(e.lessonQueue.map(x => x.caseIndex));
    if (e.lesson) pending.add(e.lesson.caseIndex);
    for (const index of [0, 2]) {
      const caseIndex = 4 + (index === 2 ? 1 : 0), reqId = e.plan[2][index];
      if (e.rescued.includes(reqId) && !e.decisions.some(x => x.caseIndex === caseIndex) && !pending.has(caseIndex)) {
        e.lessonQueue.push({ reqId, caseIndex, stage: 2 }); pending.add(caseIndex);
      }
    }
  }
  function finish(e, announce = true) {
    const s = e.swarm; s.complete = true; s.packet = 3; s.finishedAt = s.time;
    s.attack = null; s.inside = false; s.blocked = false;
    e.phase = 'dock'; e.autopilot = true; e.navMode = 'objective'; e.enemies = [];
    e.bullets = []; e.hostile = []; e.selectedTarget = null; e.lock = null; e.detour = null; e.navWatch = null;
    lessonQueue(e);
    if (announce) {
      e.say('Три пакета ФТ приняты! Рой остался позади. Разберём решения в тишине, затем автокурс доведёт до голубого шлюза Цитадели.', 'success', true);
      e.emit('comic', { text: 'СВЯЗЬ ЕСТЬ! ТЗ У НАС!', kind: 'success', anchor: e.player.pos.slice() });
      e.emit('phase', 'dock');
    }
    if (e.status === 'playing') previous.openNextLesson.call(e);
  }
  function awardPacket(e) {
    const s = e.swarm, index = s.packet, reqId = e.plan[2][index];
    s.transfer[index] = secondsNeeded(e);
    if (!e.rescued.includes(reqId)) {
      const item = e.pickups.find(x => x.type === 'requirement' && x.reqId === reqId);
      if (!item) return;
      item.pos = s.window.slice(); AWARDING.add(e);
      try { previous.collect.call(e, item); } finally { AWARDING.delete(e); }
      e.emit('comic', { text: 'ФТ ПРИНЯТО! ' + completed(e) + '/3', kind: 'success', anchor: s.window.slice() });
    }
    let next = e.plan[2].findIndex(id => !e.rescued.includes(id));
    if (next < 0) { finish(e); return; }
    s.packet = next; formSwarm(e);
  }
  function planAttack(e) {
    const s = e.swarm, pattern = s.packet, angle = pattern === 0 ? 0 : pattern === 1 ? Math.PI / 2 :
      (s.attackIndex % 2 ? -.62 : .62);
    const u = [Math.cos(angle), Math.sin(angle)], v = [-u[1], u[0]];
    const p = e.player.pos, alongWindow = s.window[0] * u[0] + s.window[1] * u[1];
    const targetV = arcadeClamp(p[0] * v[0] + p[1] * v[1], -30, 30);
    const centers = [-36, -24, -12, 0, 12, 24, 36];
    const gap = centers.reduce((best, n, index) => Math.abs(n - alongWindow) < Math.abs(centers[best] - alongWindow) ? index : best, 0);
    const owners = e.enemies.filter(x => !x.dead && !x.jammer && x.warp <= 0)
      .sort((a, b) => a.slot - b.slot);
    const regions = [];
    for (let i = 0; i < centers.length; i++) {
      if (i === gap || !owners.length) continue;
      const owner = owners[(i + s.attackIndex * 2) % owners.length];
      regions.push({ owner: owner.id, u: centers[i], v: targetV, halfU: 5.5, halfV: 3.8 });
    }
    s.attack = { stage: 'telegraph', remaining: e.assist ? 2.15 : 1.75,
      telegraph: e.assist ? 2.15 : 1.75, activeTime: .62, angle, u, v, gap: centers[gap],
      targetV, regions, cancelled: false, hit: false };
    s.attackIndex++;
    if (regions.length) e.emit('comic', { text: ['ЗАМЕЧАНИЯ ПО ВСЕМ ФРОНТАМ!', 'ОСТОРОЖНО, СОГЛАСОВАТЕЛЬ!', 'ПРАВКИ ПО СПИРАЛИ!'][pattern],
      kind: 'warning', anchor: e.player.pos.slice() });
  }
  function liveRegions(e) {
    const a = e.swarm?.attack;
    if (!a || a.cancelled) return [];
    const alive = new Set(e.enemies.filter(x => !x.dead && x.hp > 0).map(x => x.id));
    return a.regions.filter(r => alive.has(r.owner));
  }
  function regionContains(attack, region, point, radius = 1.55) {
    const x = point[0] * attack.u[0] + point[1] * attack.u[1];
    const y = point[0] * attack.v[0] + point[1] * attack.v[1];
    return Math.abs(x - region.u) < region.halfU + radius && Math.abs(y - region.v) < region.halfV + radius;
  }
  function regionPoint(a, u, v, z = 0) { return [a.u[0] * u + a.v[0] * v, a.u[1] * u + a.v[1] * v, z]; }
  function updateAttack(e, dt) {
    const s = e.swarm;
    if (!s.attack) {
      s.attackClock -= dt;
      if (s.attackClock <= 0 && s.transition <= 0) planAttack(e);
      return;
    }
    const a = s.attack; a.remaining -= dt;
    if (a.stage === 'telegraph' && a.remaining <= 0) {
      a.stage = 'active'; a.remaining = a.activeTime; e.emit('shot', { kind: 'swarm' });
    }
    if (a.stage === 'active' && !a.hit && liveRegions(e).some(r => regionContains(a, r, e.player.pos))) {
      if (e.damage(e.assist ? 20 : 25)) { a.hit = true; s.damageTaken++; }
    }
    if (a.stage === 'active' && a.remaining <= 0) {
      s.attack = null; s.attackClock = e.assist ? 3.2 : 2.35;
    }
  }
  function stepSwarm(e, dt, input) {
    const s = e.swarm, p = e.player;
    e.autopilot = false; // Formation flight uses the same joystick as the convoy.
    s.time += dt; e.elapsed += dt; e.stageTime += dt; e.phaseClock += dt;
    e.captainClock = Math.max(0, e.captainClock - dt);
    for (const key of ['shotCooldown', 'missileCooldown', 'invulnerable', 'pulseCooldown', 'flipCooldown']) p[key] = Math.max(0, p[key] - dt);
    for (const key of ['flash', 'shake', 'hitFlash', 'pulseWave']) e[key] = Math.max(0, (e[key] || 0) - dt);
    e.comboTime = Math.max(0, e.comboTime - dt); if (!e.comboTime) e.combo = 0;
    s.transition = Math.max(0, s.transition - dt); s.window = windowAt(s);
    const dx = arcadeClamp(input.turn || 0, -1, 1), dy = arcadeClamp(input.pitch || 0, -1, 1), length = Math.max(1, Math.hypot(dx, dy));
    const boosting = !!input.boost && p.energy > 2, speed = boosting ? 35 : 21;
    p.pos = [arcadeClamp(p.pos[0] + dx / length * speed * dt, -ARENA.x, ARENA.x),
      arcadeClamp(p.pos[1] + dy / length * speed * dt, -ARENA.y, ARENA.y), 0];
    p.yaw += (-dx * .09 - p.yaw) * Math.min(1, dt * 5);
    p.pitch += (dy * .075 - p.pitch) * Math.min(1, dt * 5);
    p.bank += (-dx * .48 - p.bank) * Math.min(1, dt * 5);
    p.speed = Math.hypot(dx, dy) * speed; p.boosting = boosting;
    p.energy = arcadeClamp(p.energy + (boosting ? -23 : 15) * dt, 0, 100);
    for (const x of e.enemies) {
      if (x.dead) continue;
      x.age += dt; x.hit = Math.max(0, x.hit - dt); x.warp = Math.max(0, x.warp - dt);
      const goal = x.jammer ? V3.add(s.window, [Math.sin(s.time * .7) * 2, 0, -55]) :
        formationPoint(s, x.slot - 1, s.slots.length - 1);
      const old = x.pos; x.pos = V3.lerp(x.pos, goal, Math.min(1, dt * 3));
      x.vel = V3.scale(V3.sub(x.pos, old), 1 / Math.max(.001, dt));
      x.channel = false;
    }
    for (const slot of s.slots) if (slot.index && slot.respawnAt && s.time >= slot.respawnAt) spawn(e, slot.index);
    e.lock = e.target()?.id || null;
    if (input.fire) e.fire(); if (input.missile) e.missile(); if (input.pulse) e.pulse();
    if (input.flip) e.flip();
    for (const b of e.bullets) {
      if (b.type === 'missile') {
        const target = e.enemies.find(x => x.id === b.target && !x.dead);
        if (target) b.vel = V3.scale(V3.norm(V3.lerp(V3.norm(b.vel), V3.norm(V3.sub(target.pos, b.pos)), Math.min(1, dt * 5))), 100);
        if (b.trail) { b.trail.push(b.pos.slice()); if (b.trail.length > 24) b.trail.shift(); }
      }
      const old = b.pos; b.pos = V3.add(b.pos, V3.scale(b.vel, dt)); b.life -= dt;
      let target = null, first = Infinity;
      for (const x of e.enemies) {
        if (x.dead || x.warp > 0) continue;
        const contact = flightSegment(old, b.pos, x.pos, x.r + (b.r || .5));
        if (contact !== null && contact < first) { target = x; first = contact; }
      }
      if (target) { b.life = 0; e.hit(target, b.damage); }
    }
    e.enemies = e.enemies.filter(x => !x.dead);
    e.bullets = e.bullets.filter(x => x.life > 0).slice(-56);
    updateAttack(e, dt);
    for (const x of e.explosions) x.life -= dt;
    e.explosions = e.explosions.filter(x => x.life > 0).slice(-12);
    for (const x of e.particles) { x.life -= dt; x.pos = V3.add(x.pos, V3.scale(x.vel, dt)); }
    e.particles = e.particles.filter(x => x.life > 0).slice(-60);
    if (e.status !== 'playing') return;
    s.inside = insideWindow(e); s.blocked = !!currentJammer(e);
    if (s.inside && !s.blocked && s.transition <= 0) {
      s.transfer[s.packet] = Math.min(secondsNeeded(e), s.transfer[s.packet] + dt);
      if (s.transfer[s.packet] >= secondsNeeded(e) - 1e-8) awardPacket(e);
    }
  }

  proto.beginStage = function (n) {
    this.swarm = null;
    const result = previous.beginStage.call(this, n);
    if (n === 2 && !this.finale) {
      initialise(this);
      this.say('Рой забил канал уточнениями. Маневрируй внутри строя: WASD или джойстик. Разбей золотой глушитель и держись в голубом окне связи. Красные коридоры заранее показывают залп.', 'brief', true);
    }
    return result;
  };
  proto.launch = function (...args) {
    if (!active(this) || this.status !== 'briefing') return previous.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = false;
    this.say('Окно связи справа. Пробел — огонь, Q — ракета по глушителю, E — рассеять залп. В рое маневрируй сам; загрузка продолжится после возвращения в окно.', 'order', true);
    this.emit('state', 'playing');
  };
  proto.step = function (delta, input = {}) {
    if (!active(this) || this.status !== 'playing') return previous.step.call(this, delta, input);
    const dt = arcadeClamp(Number.isFinite(delta) ? delta : 0, 0, .04);
    if (dt > 0) stepSwarm(this, dt, input);
  };
  proto.hit = function (enemy, amount) {
    if (!active(this) || !enemy.swarmDrone) return previous.hit.call(this, enemy, amount);
    if (enemy.dead || enemy.warp > 0 || !Number.isFinite(amount) || amount <= 0) return;
    enemy.hp -= amount; enemy.hit = .16; this.hitFlash = .12; this.hits++;
    if (enemy.hp > 0) return;
    enemy.dead = true; this.totalKills++; this.stageKills++; this.combo++; this.comboTime = 5;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const slot = this.swarm.slots[enemy.slot];
    if (slot && !slot.paid) { this.score += enemy.jammer ? 140 : 45; slot.paid = true; }
    if (slot && !enemy.jammer) slot.respawnAt = this.swarm.time + (this.assist ? 12 : 9);
    this.explosions.push({ pos: enemy.pos.slice(), life: .8, max: .8, color: enemy.color });
    if (this.selectedTarget === enemy.id) this.selectedTarget = null;
    this.emit('destroy', 'swarm');
    if (enemy.jammer) {
      this.notify('КАНАЛ ОТКРЫТ', 'Загрузка идёт внутри голубого окна. Выход из окна ставит её на паузу.');
      this.emit('comic', { text: 'ПОМЕХИ СНЯТЫ!', kind: 'action', anchor: enemy.pos.slice() });
    } else this.swarm.shotsCleared++;
  };
  proto.pulse = function (...args) {
    const wasActive = active(this), result = previous.pulse.apply(this, args);
    if (wasActive && result && active(this)) {
      if (this.swarm.attack) this.swarm.attack.cancelled = true;
      this.emit('comic', { text: 'ПОМЕХИ — В СТОРОНУ!', kind: 'action', anchor: this.player.pos.slice() });
    }
    return result;
  };
  proto.flip = function (...args) {
    if (!active(this)) return previous.flip.apply(this, args);
    if (this.status !== 'playing' || this.player.flipCooldown > 0) return false;
    this.player.flipCooldown = 4; this.player.invulnerable = Math.max(.7, this.player.invulnerable);
    this.emit('flip'); return true;
  };
  proto.collect = function (item, ...args) {
    if (active(this) && item?.type === 'requirement' && !AWARDING.has(this)) return false;
    return previous.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) {
    if (active(this)) return;
    return previous.openNextLesson.apply(this, args);
  };
  proto.continueLesson = function (...args) {
    const result = previous.continueLesson.apply(this, args);
    if (active(this)) this.autopilot = false;
    return result;
  };
  proto.checkStage = function (...args) {
    if (active(this)) return;
    return previous.checkStage.apply(this, args);
  };
  proto.navTarget = function (...args) {
    if (!active(this)) return previous.navTarget.apply(this, args);
    return { pos: this.swarm.window.slice(), name: 'Окно связи · ' + FORMS[this.swarm.packet], swarmWindow: true };
  };
  proto.guidance = function (input) { return active(this) ? input : previous.guidance.call(this, input); };
  proto.interact = function (...args) {
    if (!active(this)) return previous.interact.apply(this, args);
    this.say(this.objective().detail, 'order', true); return false;
  };
  proto.objective = function (...args) {
    if (!active(this)) return previous.objective.apply(this, args);
    const s = this.swarm, percent = Math.floor((s.transfer[s.packet] || 0) / secondsNeeded(this) * 100);
    return { title: currentJammer(this) ? 'Разбейте глушитель канала ФТ' : 'Держитесь в голубом окне связи',
      detail: (mobile() ? 'Джойстик — манёвр. Огонь — пробить проход. ' : 'WASD — манёвр; пробел — пробить проход. ') +
        'Уходите из красных коридоров или рассеивайте залп импульсом. Загрузка сохраняется при выходе из окна.',
      progress: 'РОЙ · ' + FORMS[s.packet] + ' · ФТ ' + completed(this) + '/3 · СВЯЗЬ ' + percent + '%' };
  };

  function swarmScene(e, time, fx) {
    const s = e.swarm, items = [], add = (...args) => items.push(citadelItem(...args));
    add('sphere', [-165, 100, -570], [80, 80, 80], '#304e77', .1);
    add('ring', [-165, 100, -570], [118, 118, 118], '#7280af', .4, flightBasis(.7, 1.05), .25);
    for (let i = 0; i < 3; i++) add('ring', [0, 0, -180 - i * 140], [78 + i * 25, 48 + i * 15, 1], '#52769e', .5, SPACE_IDENTITY, .10);
    // Four small beacons make the manoeuvring plane legible without a platform.
    for (const x of [-ARENA.x, ARENA.x]) for (const y of [-ARENA.y, ARENA.y])
      add('octa', [x, y, 0], [.6, .6, .6], '#6596b6', 1);
    for (const x of e.enemies) {
      if (x.dead) continue;
      const basis = spaceBasisDir(V3.sub(e.player.pos, x.pos));
      expeditionShip(items, x.pos, basis, x.jammer ? 1.55 : 1.15,
        x.jammer ? '#80624e' : ['#415580', '#735958', '#644a7c'][s.packet], x.color, x.hit > 0);
      if (x.jammer) {
        add('ring', x.pos, [6.2, 6.2, 1], x.color, 1, SPACE_IDENTITY, .7);
        citadelBeam(items, x.pos, s.window, '#e9b479', .045, .25);
      }
    }
    const a = s.attack;
    if (a) for (const r of liveRegions(e)) {
      const owner = e.enemies.find(x => x.id === r.owner);
      const point = regionPoint(a, r.u, r.v, 0);
      if (owner) citadelBeam(items, owner.pos, point, a.stage === 'active' ? '#ff936f' : '#ed8fad',
        a.stage === 'active' ? .55 : .045, a.stage === 'active' ? .65 : .30);
    }
    add('ring', s.window, [s.radius, s.radius, .3], currentJammer(e) ? '#e6be81' : '#8affdc', .9, SPACE_IDENTITY, .65);
    expeditionShip(items, e.player.pos, flightBasis(e.player.yaw, e.player.pitch, e.player.bank), 1.35);
    for (const b of e.bullets) {
      if (b.type === 'missile') finaleMissile(items, b, time, fx);
      else add('box', b.pos, [.08, .08, 1.7], b.color || '#87f6ef', 1, spaceBasisDir(b.vel));
    }
    for (const x of e.explosions) {
      const age = 1 - x.life / x.max;
      add('octa', x.pos, [1 + age * 5, 1 + age * 5, 1 + age * 5], x.color, 1, SPACE_IDENTITY, Math.max(0, 1 - age));
    }
    if (e.pulseWave > 0) add('ring', e.player.pos, Array(3).fill(4 + (1 - e.pulseWave) * 55), '#a4ffe5', 1, SPACE_IDENTITY, e.pulseWave * .55);
    return items;
  }
  spaceScene = function (e, time, fx = true) { return active(e) ? swarmScene(e, time, fx) : view.scene(e, time, fx); };
  spaceCamera = function (e, time = 0, preview = false) {
    if (!active(e)) return view.camera(e, time, preview);
    const aspect = (ARCADE.canvas?.width || 1280) / (ARCADE.canvas?.height || 720);
    const distance = Math.max(103, 60 / (Math.tan(.98 / 2) * Math.max(.42, aspect)));
    return stationLook([e.player.pos[0] * .08, 8 + e.player.pos[1] * .08, distance - 34], [0, 0, -34], .98,
      { near: 1, far: 1800, lights: [{ pos: [0, 24, 10], color: [.5, 1, 1.2] }, { pos: [0, 0, -80], color: [.6, .5, 1] }] });
  };
  function attackHUD(c, e, cam, W, H) {
    const a = e.swarm.attack;
    if (!a) return;
    for (const r of liveRegions(e)) {
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
        spaceProject(regionPoint(a, r.u + x * r.halfU, r.v + y * r.halfV), cam, W, H));
      if (points.some(p => p.z <= 0)) continue;
      c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      c.fillStyle = a.stage === 'active' ? '#ff9b675c' : '#f794bc22'; c.fill();
      c.strokeStyle = a.stage === 'active' ? '#ffce97' : '#ff9fc2'; c.lineWidth = a.stage === 'active' ? 2.4 : 1.2;
      c.setLineDash(a.stage === 'telegraph' ? [5, 5] : []); c.stroke(); c.setLineDash([]);
    }
  }
  function drawSwarmHUD(c, e, cam, w, h) {
    c.clearRect(0, 0, w, h);
    const cssW = mobile() ? (ARCADE.canvas?.getBoundingClientRect().width || w) : w;
    const scale = w / cssW, W = w / scale, H = h / scale, small = W < 650 || H < 420 || mobile();
    const s = e.swarm, p = e.player, pct = Math.floor((s.transfer[s.packet] || 0) / secondsNeeded(e) * 100);
    c.save(); c.scale(scale, scale); c.textBaseline = 'middle';
    attackHUD(c, e, cam, W, H);
    const q = spaceProject(s.window, cam, W, H), edge = spaceProject(V3.add(s.window, [s.radius, 0, 0]), cam, W, H);
    const radius = Math.abs(edge.x - q.x), col = currentJammer(e) ? '#ffd59d' : s.inside ? '#a1ffe0' : '#87dcea';
    if (q.z > 0) {
      c.strokeStyle = col; c.lineWidth = 1.7; c.setLineDash(s.inside ? [] : [5, 5]);
      c.beginPath(); c.arc(q.x, q.y, radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.lineWidth = 4; c.beginPath(); c.arc(q.x, q.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + pct / 100 * Math.PI * 2); c.stroke();
      c.font = 'bold ' + (small ? 10 : 13) + 'px Arial'; c.textAlign = 'center';
      const label = currentJammer(e) ? 'РАЗБЕЙ ГЛУШИТЕЛЬ' : 'СВЯЗЬ ' + pct + '%' + (s.inside ? ' · ПРИЁМ' : ' · ПАУЗА');
      const labelW = c.measureText(label).width + 14;
      const lx = arcadeClamp(q.x, labelW / 2 + 5, W - labelW / 2 - 5), ly = arcadeClamp(q.y + radius + 20, 117, H - (small ? 16 : 60));
      c.fillStyle = '#091a2ce8'; c.fillRect(lx - labelW / 2, ly - 10, labelW, 20);
      c.fillStyle = col; c.fillText(label, lx, ly);
    }
    const jammer = currentJammer(e), selected = e.enemies.find(x => x.id === e.lock && !x.dead) || jammer;
    if (selected) {
      const t = spaceProject(selected.pos, cam, W, H);
      if (t.z > 0) {
        c.strokeStyle = '#ffd59d'; c.lineWidth = 1.4; c.strokeRect(t.x - 14, t.y - 12, 28, 24);
        c.fillStyle = '#1a2032'; c.fillRect(t.x - 20, t.y - 19, 40, 3);
        c.fillStyle = '#ffd59d'; c.fillRect(t.x - 20, t.y - 19, 40 * Math.max(0, selected.hp / selected.maxHp), 3);
      }
    }
    const pad = small ? 7 : 22, landscape = small && W >= 650;
    const topW = Math.min(small ? landscape ? W - 322 : W - 14 : 520, W - pad * 2);
    const topX = landscape ? 315 : small ? pad : (W - topW) / 2, topY = landscape ? 7 : small ? 43 : 16;
    const titleX = topX + topW / 2;
    c.fillStyle = '#071a2eea'; c.fillRect(topX, topY, topW, small ? 55 : 65);
    c.strokeStyle = '#6f9fc66b'; c.strokeRect(topX, topY, topW, small ? 55 : 65);
    c.textAlign = 'center'; c.fillStyle = '#dceffd'; c.font = 'bold ' + (small ? 12 : 17) + 'px Arial';
    c.fillText('РОЙ УТОЧНЕНИЙ · ' + FORMS[s.packet] + ' · ФТ ' + completed(e) + '/3', titleX, topY + (small ? 16 : 20), topW - 18);
    c.font = (small ? 10 : 12) + 'px Arial'; c.fillStyle = '#a5c9d4';
    const hint = s.transition > 0 ? 'РОЙ МЕНЯЕТ СТРОЙ — ИЩИТЕ ОКНО СВЯЗИ' : s.attack?.stage === 'telegraph' && !s.attack.cancelled
      ? 'ЗАЛП ЧЕРЕЗ ' + s.attack.remaining.toFixed(1) + ' с · УЙДИТЕ ИЗ КРАСНОГО'
      : currentJammer(e) ? 'ЗОЛОТОЙ ГЛУШИТЕЛЬ БЛОКИРУЕТ ЗАГРУЗКУ' : 'В ГОЛУБОМ ОКНЕ — ЗАГРУЗКА · СНАРУЖИ — ПАУЗА';
    c.fillText(hint, titleX, topY + (small ? 36 : 43), topW - 18);
    c.textAlign = 'left'; c.fillStyle = '#071a2eea';
    const hpY = small ? 7 : H - 47; c.fillRect(pad, hpY, Math.min(small ? 295 : 382, W - pad * 2), 29);
    c.fillStyle = p.hp < 30 ? '#ffafa0' : '#b8ffea'; c.font = 'bold ' + (small ? 11 : 13) + 'px Arial';
    c.fillText('ЩИТ ' + Math.ceil(p.hp) + '%', pad + 8, hpY + 11);
    c.fillStyle = '#ffe0a4'; c.fillText('РАКЕТЫ ' + p.missiles, pad + (small ? 92 : 120), hpY + 11);
    c.fillStyle = '#aad5ee'; c.fillText('E ' + (p.pulseCooldown > 0 ? Math.ceil(p.pulseCooldown) + ' с' : 'ГОТОВ'), pad + (small ? 188 : 250), hpY + 11);
    c.fillStyle = '#305064'; c.fillRect(pad + 8, hpY + 23, small ? 270 : 360, 2);
    c.fillStyle = '#a8f4d8'; c.fillRect(pad + 8, hpY + 23, (small ? 270 : 360) * p.hp / 100, 2);
    if (!small) {
      c.textAlign = 'right'; c.fillStyle = '#bcd4df'; c.font = '12px Arial';
      c.fillText('WASD — МАНЁВР · ПРОБЕЛ — ОГОНЬ · SHIFT — РЫВОК · E — ИМПУЛЬС', W - 22, H - 30, W - 455);
    }
    if (e.flash > 0) { c.fillStyle = 'rgba(255,91,94,' + Math.min(.15, e.flash * .38) + ')'; c.fillRect(0, 100, W, H - 145); }
    c.restore();
  }
  drawFlightHUD = function (c, e, cam, w, h) { return active(e) ? drawSwarmHUD(c, e, cam, w, h) : view.flightHUD(c, e, cam, w, h); };
  drawMobileGameHUD = function (c, e, cam, w, h) { return active(e) ? drawSwarmHUD(c, e, cam, w, h) : view.mobileHUD(c, e, cam, w, h); };
  drawCampaignFlightHUD = function (...args) { if (!active(args[1])) return view.campaignHUD(...args); };
  drawClarityHUD = function (...args) { if (!active(args[1])) return view.clarityHUD(...args); };
  function controls(e) {
    if (!active(e)) return;
    for (const id of ['citadel-primary', 'mobile-guide']) {
      const node = document.getElementById(id); if (!node) continue;
      node.textContent = mobile() ? 'В рое — джойстик' : 'WASD · Манёвр внутри роя';
      node.disabled = true; node.setAttribute('aria-label', 'В рое управляйте положением корабля вручную');
      node.setAttribute('aria-pressed', 'false');
    }
    const crystal = document.getElementById('mobile-crystal');
    if (crystal) { crystal.textContent = 'Окно связи'; crystal.disabled = false; }
  }
  updateMobileArcade = function (...args) { const result = view.mobileUpdate.apply(this, args); controls(ARCADE.engine); return result; };
  updateCitadelClarity = function (...args) {
    const e = ARCADE.engine;
    if (!active(e)) return view.clarityUpdate.apply(this, args);
    const s = e.swarm, pct = Math.floor((s.transfer[s.packet] || 0) / secondsNeeded(e) * 100);
    const route = document.getElementById('citadel-route');
    if (route) {
      const html = '<div class="route-missions"><b>УРОВЕНЬ 7 · РОЙ УТОЧНЕНИЙ</b></div>' +
        '<div class="route-count"><small>ПАКЕТЫ ФТ</small><b>' + completed(e) + '<em>/3</em></b></div>' +
        '<div class="route-count"><small>СВЯЗЬ</small><b>' + pct + '<em>%</em></b></div>' +
        '<div class="route-count"><small>ПОСТРОЕНИЕ</small><b style="font-size:14px">' + FORMS[s.packet] + '</b></div>';
      if (route.innerHTML !== html) route.innerHTML = html;
    }
    const toast = document.getElementById('citadel-toast'); if (toast) toast.hidden = true;
    controls(e);
  };
  updateArcadeHUD = function (...args) {
    const result = view.update.apply(this, args), e = ARCADE.engine;
    if (!active(e)) return result;
    for (const [id, text] of [['arcade-mission-title', 'Рой уточнений'], ['arcade-stage-label', 'УРОВЕНЬ 07 / 14'],
      ['arcade-mission-brief', 'Примите три пакета ФТ в движущемся окне связи.'], ['arcade-mission-kills', e.stageKills]]) {
      const node = document.getElementById(id); if (node) node.textContent = String(text);
    }
    controls(e); return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine;
    if (!active(e) || e.status !== 'briefing') return view.overlay.apply(this, args);
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 7 / 14 · ПРИЁМ УТОЧНЕНИЙ</span>' +
      '<h3>Рой уточнений</h3><p>Кольцо. Клин. Спираль. Рой меняет строй и перекрывает канал связи. ' +
      'Прими три пакета требований в движущемся голубом окне.</p>' +
      '<div class="brief-command"><span class="crystal-symbol">◎</span><div><b>Держись в окне связи</b>' +
      '<small>WASD или джойстик перемещают корабль внутри роя. Сначала разбей золотой глушитель. Загрузка сохраняется при выходе из окна.</small></div></div>' +
      '<div class="brief-command"><span class="hostile-symbol">⌖</span><div><b>Красный коридор — будущий залп</b>' +
      '<small>Уйди в просвет, пробей дрона огнём или рассей залп импульсом. Ракеты — по захваченной цели. Автокурс внутри роя выключен.</small></div></div>' +
      '<button class="arcade-play" data-action="citadel-launch">ВОЙТИ В РОЙ ↗</button>' +
      '<small>Три пакета → два решения без боя → голубой шлюз Цитадели.</small></div>';
  };
  function explainManual(e) {
    e.autopilot = false;
    e.say('В рое нужен ручной манёвр: WASD или джойстик. Голубое кольцо — окно связи; пробел и ракеты открывают проход. После трёх пакетов автокурс вернётся.', 'order', true);
  }
  arcadeAction = function (action, value) {
    const e = ARCADE.engine;
    if (active(e) && ['citadel-guidance', 'citadel-primary', 'citadel-crystal'].includes(action)) {
      explainManual(e); return true;
    }
    return view.action(action, value);
  };
  mobileAction = function (action, value) {
    const e = ARCADE.engine;
    if (active(e) && action === 'mobile-guide') { explainManual(e); return true; }
    return view.mobileAction(action, value);
  };
  if (typeof CUP_ENGINE_KEYS !== 'undefined' && !CUP_ENGINE_KEYS.includes('swarm')) CUP_ENGINE_KEYS.push('swarm');
  if (typeof CUP_LEVELS !== 'undefined') CUP_LEVELS[6] = 'Рой уточнений';
  if (typeof cupUnpack === 'function') {
    const unpack = cupUnpack;
    cupUnpack = function (...args) {
      const e = unpack.apply(this, args);
      if (e.stage === 2 && !e.finale && !e.crash && ['orientation', 'battle', 'retrieve', 'swarm'].includes(e.phase) &&
        (!e.swarm || e.swarm.version !== VERSION)) initialise(e, true);
      return e;
    };
  }
  globalThis.CITADEL_SWARM = Object.freeze({ version: VERSION, active, completed, insideWindow,
    windowAt: e => windowAt(e.swarm), formationPoint: (e, index) => formationPoint(e.swarm, index, e.swarm.slots.length - 1),
    secondsNeeded, arena: ARENA, formations: Object.freeze(FORMS.slice()),
    liveRegions: e => liveRegions(e).map(x => ({ ...x })),
    regionContains, regionPoint,
    inspection: e => !configured(e) ? null : ({ packet: e.swarm.packet, downloaded: completed(e),
      transfer: e.swarm.transfer.slice(), formation: FORMS[Math.min(2, e.swarm.packet)],
      inside: insideWindow(e), blocked: !!currentJammer(e), drones: e.enemies.filter(x => x.swarmDrone && !x.dead).length,
      hazards: liveRegions(e).length, complete: e.swarm.complete }) });
})();
