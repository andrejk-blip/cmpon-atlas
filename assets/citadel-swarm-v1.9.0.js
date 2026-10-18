/* Citadel 1.9.0 — level 7, «Рой уточнений».
 * A self-contained formation shooter. Visible ships leave their rows, dive,
 * fire readable projectiles and return to the formation. Three cleared waves
 * award the campaign's real requirement packets, then reuse lessons and dock.
 */
(function () {
  'use strict';
  const VERSION = '1.9.0';
  if (globalThis.CITADEL_SWARM?.version === VERSION || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype, previous = {};
  for (const name of ['beginStage', 'launch', 'step', 'fire', 'missile', 'hit', 'pulse', 'collect',
    'openNextLesson', 'continueLesson', 'checkStage', 'navTarget', 'guidance', 'objective', 'interact', 'flip']) previous[name] = proto[name];
  const view = { scene: spaceScene, camera: spaceCamera, flightHUD: drawFlightHUD,
    campaignHUD: drawCampaignFlightHUD, clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD,
    update: updateArcadeHUD, mobileUpdate: updateMobileArcade, clarityUpdate: updateCitadelClarity,
    overlay: arcadeOverlayHTML, action: arcadeAction, mobileAction };
  const AWARDING = new WeakSet();
  const ARENA = Object.freeze({ x: 54, y: 70, playerMinY: -58, playerMaxY: -27 });
  const FORMS = Object.freeze(['РАЗВЕДЧИКИ', 'ЭСКАДРИЛЬЯ', 'ФЛАГМАНЫ']);
  const COLORS = ['#8ddfff', '#f4a3d4', '#ffd184'];
  const WAVE_COUNTS = { normal: [12, 15, 18], calm: [10, 12, 15] };
  const clamp = (n, a, b) => arcadeClamp(n, a, b);
  const mobile = () => typeof isMobileLayout === 'function' && isMobileLayout();
  const completed = e => e.plan[2].filter(id => e.rescued.includes(id)).length;
  const configured = e => !!e && e.stage === 2 && !e.finale && e.swarm?.version === VERSION;
  const inArena = e => configured(e) && e.phase === 'swarm' && !e.swarm.complete;
  const active = e => inArena(e) && !e.crash;
  const living = e => e.enemies.filter(x => x.swarmDrone && !x.dead && x.hp > 0);
  const waveCount = (e, n = e.swarm.packet) => WAVE_COUNTS[e.assist ? 'calm' : 'normal'][Math.min(2, n)];
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function formationPoint(e, index, time = e.swarm.time) {
    const s = e.swarm, count = waveCount(e), columns = count === 10 || count === 15 ? 5 : 6;
    const row = Math.floor(index / columns), col = index % columns;
    return [(col - (columns - 1) / 2) * 14 + Math.sin(time * .46 + s.seedPhase) * 7,
      48 - row * 14 + Math.sin(time * .7 + s.seedPhase) * 1.4, 0];
  }
  function spawn(e, index) {
    const s = e.swarm, count = waveCount(e), columns = count === 10 || count === 15 ? 5 : 6;
    const row = Math.floor(index / columns), rank = s.packet === 2 && row === 0 ? 2 : row === 0 && s.packet > 0 ? 1 : 0;
    const hp = [26, 48, 72][rank], side = index % 2 ? 1 : -1;
    const enemy = { id: ++e.entityId, swarmDrone: true, slot: index, formation: s.packet,
      row, rank, pos: [side * (62 + row * 4), 76 + index % columns * 3, 0], vel: [0, 0, 0],
      hp, maxHp: hp, r: rank === 2 ? 4 : 3.3, type: rank === 2 ? 'heavy' : 'scout', role: 'fighter',
      name: ['Разведчик уточнений', 'Ведущий согласования', 'Флагман правок'][rank], color: COLORS[rank],
      mode: 'enter', modeTime: -index % columns * .06, from: [side * (62 + row * 4), 76 + index % columns * 3, 0],
      hit: 0, age: 0, warp: 0, phase: index * .7, channel: false, dead: false, fireCue: 0, route: null };
    s.slots[index].id = enemy.id; e.enemies.push(enemy); return enemy;
  }
  function formSwarm(e, announce = true, credit = 0) {
    const s = e.swarm, count = waveCount(e);
    s.formationStart = s.time; s.waveAge = 0; s.phase = 'entry'; s.transition = 2.3;
    s.fireClock = e.assist ? 3.9 : 3.1; s.diveClock = e.assist ? 5.4 : 4.1; s.diveSerial = 0; s.fireSerial = 0;
    s.attack = null; s.window = null; s.slots = Array.from({ length: count }, (_, index) =>
      ({ index, id: null, paid: index < credit, dead: index < credit, credited: index < credit }));
    s.transfer[s.packet] = credit; s.cleared[s.packet] = credit;
    e.enemies = []; e.bullets = []; e.hostile = []; e.selectedTarget = null; e.lock = null;
    for (let i = credit; i < count; i++) spawn(e, i);
    if (announce) {
      e.notify('ВОЛНА ' + (s.packet + 1) + ' / 3 · ' + FORMS[s.packet], 'Разбей весь строй. Подсвеченные корабли готовятся пикировать.');
      e.emit('wave', s.packet + 1);
    }
  }
  function lessonQueue(e) {
    const pending = new Set(e.lessonQueue.map(x => x.caseIndex));
    if (e.lesson) pending.add(e.lesson.caseIndex);
    for (const index of [0, 2]) {
      const caseIndex = index === 0 ? 4 : 5, reqId = e.plan[2][index];
      if (e.rescued.includes(reqId) && !e.decisions.some(x => x.caseIndex === caseIndex) && !pending.has(caseIndex)) {
        e.lessonQueue.push({ reqId, caseIndex, stage: 2 }); pending.add(caseIndex);
      }
    }
  }
  function finish(e, announce = true) {
    const s = e.swarm; s.complete = true; s.packet = 3; s.finishedAt = s.time; s.phase = 'complete';
    e.phase = 'dock'; e.autopilot = true; e.navMode = 'objective'; e.enemies = []; e.bullets = []; e.hostile = [];
    e.selectedTarget = null; e.lock = null; e.detour = null; e.navWatch = null; e.hullCache = null;
    Object.assign(e.player, { pos: V3.add(e.station.pos, [clamp(e.player.pos[0], -32, 32), 1, -125]),
      yaw: Math.PI, pitch: 0, bank: 0, speed: 18, boosting: false });
    lessonQueue(e);
    if (announce) {
      e.say('Рой разбит. Все три пакета требований на борту! Разберём решения и вернёмся в голубой шлюз Цитадели.', 'success', true);
      e.emit('phase', 'dock');
    }
    if (e.status === 'playing') previous.openNextLesson.call(e);
  }
  function initialise(e, migration = false) {
    const old = e.swarm, savedStatus = e.status, savedResume = e.resumeStatus;
    const s = e.swarm = { version: VERSION, time: 0, packet: 0, transfer: [0, 0, 0], cleared: [0, 0, 0],
      complete: false, seedPhase: (e.seed % 65521) / 65521 * Math.PI * 2, phase: 'entry',
      window: null, radius: 0, inside: false, blocked: false, attack: null, slots: [],
      formationStart: 0, waveAge: 0, transition: 2.3, diveSerial: 0, fireSerial: 0,
      shotsCleared: 0, damageTaken: 0, hitsTaken: 0, dodgedDives: 0, warnedManual: false };
    s.packet = e.plan[2].findIndex(id => !e.rescued.includes(id)); if (s.packet < 0) s.packet = 3;
    for (let i = 0; i < 3; i++) if (e.rescued.includes(e.plan[2][i])) s.transfer[i] = s.cleared[i] = waveCount(e, i);
    e.phase = 'swarm'; e.autopilot = false; e.navMode = 'objective'; e.wave = 0; e.waveSpawned = 0;
    e.waveClock = 0; e.waveSpawnTimer = 999; e.spawnClock = 999; e.detour = null; e.navWatch = null;
    e.hullCache = null; e.board = null; e.boss = null; e.asteroids = []; e.hostile = []; e.bullets = [];
    e.particles = []; e.explosions = []; e.station = { ...e.station, pos: [0, 0, -185] }; e.location = 'Рой уточнений';
    e.pickups = e.plan[2].map(reqId => ({ type: 'requirement', reqId, pos: [0, 0, 0], r: 7, dead: e.rescued.includes(reqId) }));
    Object.assign(e.player, { pos: [0, -50, 0], yaw: 0, pitch: 0, bank: 0, speed: 0, boosting: false });
    if (!migration) e.player.invulnerable = 3;
    if (s.packet < 3) {
      const fraction = old?.version === '1.8.0' ? clamp((old.transfer?.[s.packet] || 0) / (e.assist ? 12 : 15), 0, .95) : 0;
      const credit = Math.floor(fraction * waveCount(e));
      if (migration) s.migration = { from: old?.version || 'legacy-orbit', credited: credit };
      formSwarm(e, false, credit);
    } else finish(e, false);
    if (migration && ['paused', 'lesson', 'briefing'].includes(savedStatus)) { e.status = savedStatus; e.resumeStatus = savedResume; }
  }
  function awardWave(e) {
    const s = e.swarm, reqId = e.plan[2][s.packet];
    if (!e.rescued.includes(reqId)) {
      const item = e.pickups.find(x => x.type === 'requirement' && x.reqId === reqId);
      AWARDING.add(e);
      try { previous.collect.call(e, item); } finally { AWARDING.delete(e); }
    }
    s.transfer[s.packet] = s.cleared[s.packet] = waveCount(e); s.phase = 'cleared'; s.transition = 2.4;
    e.hostile = []; e.bullets = []; e.lock = null; e.selectedTarget = null;
    e.notify('ВОЛНА ПРОЙДЕНА · ФТ ' + completed(e) + '/3', 'Пакет требований на борту. Щит +10, ракеты +2.');
    e.emit('comic', { text: s.packet === 2 ? 'РОЙ РАЗБИТ! ТЗ У НАС!' : 'ПАКЕТ ТРЕБОВАНИЙ ЗАХВАЧЕН!', kind: 'success', anchor: [0, 0, 0] });
  }
  function enemyShot(e, x) {
    if (e.hostile.length >= 22 || x.pos[1] < e.player.pos[1] + 14) return;
    const speed = (e.assist ? 30 : 38) + e.swarm.packet * 3;
    const dx = clamp(e.player.pos[0] - x.pos[0], -26, 26), dy = Math.min(-24, e.player.pos[1] - x.pos[1]);
    const norm = Math.hypot(dx, dy);
    e.hostile.push({ pos: [x.pos[0], x.pos[1] - 4, 0], vel: [dx / norm * speed, dy / norm * speed, 0],
      life: 6, r: .8, damage: 14 + e.swarm.packet * 2, type: 'swarm-bolt', color: '#ffb765', owner: x.id });
    e.emit('shot', { swarmEnemy: true });
  }
  function chooseDivers(e) {
    const s = e.swarm, candidates = living(e).filter(x => x.mode === 'formation');
    const maximum = e.assist ? 2 : 3;
    const busy = living(e).filter(x => ['tell', 'dive'].includes(x.mode)).length;
    if (!candidates.length || busy >= maximum) return;
    candidates.sort((a, b) => b.row - a.row || a.slot - b.slot);
    const count = Math.min(candidates.length, maximum - busy, e.assist ? (s.packet ? 2 : 1) : (s.packet === 2 ? 3 : 2));
    for (let i = 0; i < count; i++) {
      const x = candidates[(s.diveSerial * 3 + i) % candidates.length];
      x.mode = 'tell'; x.modeTime = 0; x.fireCue = 0;
      x.route = { side: (x.slot + s.diveSerial) % 2 ? 1 : -1, duration: e.assist ? 4.8 : 3.9, fired: false, firedAgain: false, hit: false };
    }
    if (s.diveSerial === 0) e.emit('comic', { text: 'ПРАВКИ ИДУТ В ПИКЕ!', kind: 'warning', anchor: [0, 23, 0] });
    s.diveSerial++;
  }
  function updateEnemy(e, x, dt) {
    const s = e.swarm, before = x.pos.slice();
    x.age += dt; x.modeTime += dt; x.hit = Math.max(0, x.hit - dt); x.channel = false;
    if (x.fireCue > 0) { x.fireCue -= dt; if (x.fireCue <= 0) enemyShot(e, x); }
    const home = formationPoint(e, x.slot);
    if (x.mode === 'enter' || x.mode === 'return') {
      const t = clamp(x.modeTime / (x.mode === 'enter' ? 1.6 : 1.3), 0, 1), k = smooth(t);
      x.pos = [mix(x.from[0], home[0], k), mix(x.from[1], home[1], k) + Math.sin(t * Math.PI) * 9, 0];
      if (t >= 1) { x.mode = 'formation'; x.modeTime = 0; }
    } else if (x.mode === 'formation' || x.mode === 'tell') {
      x.pos = home;
      if (x.mode === 'tell' && x.modeTime >= (e.assist ? 1.35 : 1.05)) {
        x.mode = 'dive'; x.modeTime = 0; x.route.from = x.pos.slice();
        x.route.targetX = clamp(e.player.pos[0] + x.route.side * 5, -44, 44);
      }
    } else if (x.mode === 'dive') {
      const r = x.route, t = clamp(x.modeTime / r.duration, 0, 1);
      x.pos = [mix(r.from[0], r.targetX, t) + Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI) * r.side * 18,
        mix(r.from[1], -76, t), 0];
      if (!r.fired && t > .28) { r.fired = true; enemyShot(e, x); }
      if (s.packet === 2 && !e.assist && !r.firedAgain && t > .53) { r.firedAgain = true; enemyShot(e, x); }
      if (t >= 1) {
        x.mode = 'return'; x.modeTime = 0; x.from = [clamp(r.targetX + r.side * 13, -53, 53), 80, 0];
        x.pos = x.from.slice(); s.dodgedDives++;
      }
    }
    x.vel = V3.scale(V3.sub(x.pos, before), 1 / Math.max(.001, dt));
    return before;
  }
  function takeDamage(e, amount) {
    const hp = e.player.hp, ok = e.damage(amount);
    if (ok) { e.swarm.damageTaken += hp - e.player.hp; e.swarm.hitsTaken++; }
    return ok;
  }
  function stepSwarm(e, dt, input) {
    const s = e.swarm, p = e.player, oldPlayer = p.pos.slice();
    e.autopilot = false; s.time += dt; s.waveAge += dt; e.elapsed += dt; e.stageTime += dt; e.phaseClock += dt;
    e.captainClock = Math.max(0, e.captainClock - dt);
    for (const key of ['shotCooldown', 'missileCooldown', 'invulnerable', 'pulseCooldown', 'flipCooldown']) p[key] = Math.max(0, p[key] - dt);
    for (const key of ['flash', 'shake', 'hitFlash', 'pulseWave']) e[key] = Math.max(0, (e[key] || 0) - dt);
    e.comboTime = Math.max(0, e.comboTime - dt); if (!e.comboTime) e.combo = 0;
    const dx = clamp(Number(input.turn) || 0, -1, 1), dy = clamp(Number(input.pitch) || 0, -1, 1), length = Math.max(1, Math.hypot(dx, dy));
    const boosting = !!input.boost && p.energy > 2, speed = boosting ? 47 : 32;
    p.pos = [clamp(p.pos[0] + dx / length * speed * dt, -ARENA.x + 3, ARENA.x - 3),
      clamp(p.pos[1] + dy / length * speed * dt, ARENA.playerMinY, ARENA.playerMaxY), 0];
    p.bank += (-dx * .24 - p.bank) * Math.min(1, dt * 8); p.yaw = 0; p.pitch = 0;
    p.speed = Math.hypot(dx, dy) * speed; p.boosting = boosting;
    p.energy = clamp(p.energy + (boosting ? -25 : 17) * dt, 0, 100);
    s.transition = Math.max(0, s.transition - dt);
    if (s.phase === 'entry' && s.transition <= 0) s.phase = 'battle';
    if (s.phase === 'cleared') {
      if (s.transition <= 0) {
        const next = e.plan[2].findIndex(id => !e.rescued.includes(id));
        if (next < 0) { finish(e); return; }
        s.packet = next; formSwarm(e);
      }
    } else {
      if (s.phase === 'battle') {
        s.diveClock -= dt; s.fireClock -= dt;
        if (s.diveClock <= 0) { chooseDivers(e); s.diveClock = e.assist ? 5.5 : 4.4 - s.packet * .25; }
        if (s.fireClock <= 0) {
          const ready = living(e).filter(x => x.mode === 'formation' && !x.fireCue);
          if (ready.length) { ready[s.fireSerial++ % ready.length].fireCue = e.assist ? .95 : .7; }
          s.fireClock = e.assist ? 2.5 - s.packet * .15 : 1.75 - s.packet * .12;
        }
      }
      for (const x of e.enemies) if (!x.dead) {
        const oldEnemy = updateEnemy(e, x, dt);
        if (x.mode === 'dive' && !x.route.hit && flightSegment(V3.sub(oldEnemy, oldPlayer), V3.sub(x.pos, p.pos), [0, 0, 0], x.r + 1.65) !== null) {
          if (takeDamage(e, 24)) x.route.hit = true;
        }
      }
      if (e.status !== 'playing') return;
      if (input.fire) e.fire(); if (input.missile) e.missile(); if (input.pulse) e.pulse(); if (input.flip) e.flip();
      for (const b of e.bullets) {
        const old = b.pos; b.pos = V3.add(b.pos, V3.scale(b.vel, dt)); b.life -= dt;
        let target = null, first = Infinity;
        for (const x of e.enemies) {
          if (x.dead) continue;
          const contact = flightSegment(old, b.pos, x.pos, x.r + b.r);
          if (contact !== null && contact < first) { target = x; first = contact; }
        }
        if (target) {
          b.life = 0; e.hit(target, b.damage);
          if (b.type === 'missile') for (const x of e.enemies) if (!x.dead && x !== target && V3.len(V3.sub(x.pos, target.pos)) < 12) e.hit(x, b.damage * .65);
        }
      }
      for (const b of e.hostile) {
        const old = b.pos; b.pos = V3.add(b.pos, V3.scale(b.vel, dt)); b.life -= dt;
        if (flightSegment(V3.sub(old, oldPlayer), V3.sub(b.pos, p.pos), [0, 0, 0], 1.65 + b.r) !== null) { b.life = 0; takeDamage(e, b.damage); }
      }
      e.enemies = e.enemies.filter(x => !x.dead);
      e.bullets = e.bullets.filter(x => x.life > 0 && x.pos[1] < 82).slice(-36);
      e.hostile = e.hostile.filter(x => x.life > 0 && x.pos[1] > -80 && Math.abs(x.pos[0]) < 78).slice(-22);
      if (e.status === 'playing' && !living(e).length) awardWave(e);
    }
    for (const x of e.explosions) x.life -= dt;
    e.explosions = e.explosions.filter(x => x.life > 0).slice(-14);
    for (const x of e.particles) { x.life -= dt; x.pos = V3.add(x.pos, V3.scale(x.vel, dt)); }
    e.particles = e.particles.filter(x => x.life > 0).slice(-36);
  }

  proto.beginStage = function (n) {
    this.swarm = null; const result = previous.beginStage.call(this, n);
    if (n === 2 && !this.finale) { initialise(this); this.say('Рой собирается в эскадрильи. Уклоняйся от пике и янтарных снарядов, стреляй по строю. Три волны — три пакета требований!', 'brief', true); }
    return result;
  };
  proto.launch = function (...args) {
    if (!active(this) || this.status !== 'briefing') return previous.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = false;
    this.say('Корабль внизу экрана. WASD или джойстик — манёвр, огонь — прямо вверх. Подсветка врага означает скорое пике. Импульс очищает экран от снарядов.', 'order', true);
    this.emit('state', 'playing');
  };
  proto.step = function (delta, input = {}) {
    if (!active(this) || this.status !== 'playing') return previous.step.call(this, delta, input);
    const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, .04); if (dt > 0) stepSwarm(this, dt, input);
  };
  proto.fire = function (...args) {
    if (!active(this)) return previous.fire.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.shotCooldown > 0 || this.swarm.phase === 'cleared') return false;
    p.shotCooldown = .24 * Math.pow(.9, this.upgrades.weapons); this.shots++;
    for (const side of [-1, 1]) this.bullets.push({ pos: [p.pos[0] + side * 1.45, p.pos[1] + 4, 0],
      vel: [0, 132, 0], life: 1.25, damage: 14 * (1 + .25 * this.upgrades.weapons), r: .5, type: 'laser', color: '#9cffff' });
    this.emit('shot'); return true;
  };
  proto.missile = function (...args) {
    if (!active(this)) return previous.missile.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.missileCooldown > 0 || p.missiles < 1 || this.swarm.phase === 'cleared') return false;
    p.missiles--; p.missileCooldown = .8;
    this.bullets.push({ pos: [p.pos[0], p.pos[1] + 5, 0], vel: [0, 103, 0], life: 1.6,
      damage: 80 * (1 + .3 * this.upgrades.rockets), r: 1.1, type: 'missile', color: '#ffe3a0' });
    this.emit('missile'); return true;
  };
  proto.hit = function (enemy, amount) {
    if (!active(this) || !enemy.swarmDrone) return previous.hit.call(this, enemy, amount);
    if (enemy.dead || !Number.isFinite(amount) || amount <= 0) return;
    enemy.hp -= amount; enemy.hit = .16; this.hitFlash = .12; this.hits++;
    if (enemy.hp > 0) return;
    enemy.dead = true; this.totalKills++; this.stageKills++; this.combo++; this.comboTime = 5; this.maxCombo = Math.max(this.maxCombo, this.combo);
    const s = this.swarm, slot = s.slots[enemy.slot];
    if (slot && !slot.paid) { this.score += [55, 85, 125][enemy.rank]; slot.paid = true; slot.dead = true; s.cleared[s.packet]++; s.transfer[s.packet] = s.cleared[s.packet]; }
    s.shotsCleared++; this.explosions.push({ pos: enemy.pos.slice(), life: .5, max: .5, color: enemy.color });
    this.emit('destroy', 'swarm');
  };
  proto.pulse = function (...args) {
    if (!active(this)) return previous.pulse.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.pulseCooldown > 0) return false;
    p.pulseCooldown = 12; p.invulnerable = Math.max(1, p.invulnerable); this.pulseWave = 1; this.hostile = [];
    for (const x of this.enemies) if (!x.dead && x.mode === 'dive' && x.pos[1] < -10) this.hit(x, 40);
    this.emit('pulse'); return true;
  };
  proto.flip = function (...args) {
    if (!active(this)) return previous.flip.apply(this, args);
    if (this.status !== 'playing' || this.player.flipCooldown > 0) return false;
    this.player.flipCooldown = 4; this.player.invulnerable = Math.max(.7, this.player.invulnerable); this.emit('flip'); return true;
  };
  proto.collect = function (item, ...args) {
    if (active(this) && item?.type === 'requirement' && !AWARDING.has(this)) return false;
    return previous.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) { if (!active(this)) return previous.openNextLesson.apply(this, args); };
  proto.continueLesson = function (...args) { const result = previous.continueLesson.apply(this, args); if (active(this)) this.autopilot = false; return result; };
  proto.checkStage = function (...args) { if (!active(this)) return previous.checkStage.apply(this, args); };
  proto.navTarget = function (...args) { return active(this) ? { pos: [0, 38, 0], name: 'Рой · волна ' + (this.swarm.packet + 1), swarmFormation: true } : previous.navTarget.apply(this, args); };
  proto.guidance = function (input) { return active(this) ? input : previous.guidance.call(this, input); };
  proto.interact = function (...args) { if (!active(this)) return previous.interact.apply(this, args); this.say(this.objective().detail, 'order', true); return false; };
  proto.objective = function (...args) {
    if (!active(this)) return previous.objective.apply(this, args);
    const s = this.swarm;
    return { title: s.phase === 'cleared' ? 'Пакет требований на борту' : 'Разбейте три волны роя',
      detail: (mobile() ? 'Джойстик — манёвр, «Огонь» — стрелять вверх. ' : 'WASD — манёвр, пробел — стрелять вверх. ') +
        'Подсвеченные корабли пикируют. Уклоняйтесь от янтарных снарядов; импульс их рассеивает.',
      progress: 'ВОЛНА ' + Math.min(3, s.packet + 1) + '/3 · ОСТАЛОСЬ ' + living(this).length + ' · ФТ ' + completed(this) + '/3' };
  };

  function layout(W, H) {
    const compact = W < 650 || H < 420 || mobile(), landscape = compact && W > H * 1.5;
    const top = landscape ? 51 : compact ? 92 : 91, bottom = compact ? 26 : 55;
    const height = Math.max(130, H - top - bottom), sy = height / 142;
    const width = Math.min(W - 24, sy * 116 * 1.55), sx = width / 116;
    return { W, H, compact, landscape, top, bottom, x: (W - width) / 2, y: top, width, height, sx, sy,
      cx: W / 2, cy: top + height * 72 / 142 };
  }
  function cameraFor(W, H) {
    const l = layout(W, H), depth = 100;
    return { pos: [0, (l.cy - H / 2) / l.sy, depth], f: [0, 0, -1], r: [l.sx / l.sy, 0, 0], u: [0, 1, 0],
      fov: 2 * Math.atan(H / (2 * depth * l.sy)), near: 1, far: 600, swarmArcade: true, layout: l };
  }
  function hudBounds(e, W, H) {
    if (!inArena(e)) return [];
    const l = layout(W, H), cam = cameraFor(W, H), unit = clamp(Math.min(l.sx * .55, l.sy * .95), 1, 3.5);
    const boxes = [{ x: 0, y: 0, width: W, height: l.top - 2, kind: 'progress' },
      { x: 0, y: H - l.bottom, width: W, height: l.bottom, kind: 'controls' }];
    const actor = (pos, kind, wide = 1) => {
      const q = spaceProject(pos, cam, W, H), r = unit * 11 * wide + 6;
      return { x: q.x - r, y: q.y - r, width: r * 2, height: r * 2, kind };
    };
    boxes.push(actor(e.player.pos, 'player', 1.15));
    const formation = [];
    for (const x of e.enemies) if (!x.dead) {
      const box = actor(x.pos, x.mode === 'dive' ? 'diver' : 'formation');
      if (x.mode === 'tell') { box.y -= unit * 8; box.height += unit * 8; }
      if (x.mode === 'dive') boxes.push(box); else if (x.pos[1] < 73) formation.push(box);
    }
    if (formation.length) {
      const x = Math.min(...formation.map(b => b.x)), y = Math.min(...formation.map(b => b.y));
      boxes.push({ x, y, width: Math.max(...formation.map(b => b.x + b.width)) - x,
        height: Math.max(...formation.map(b => b.y + b.height)) - y, kind: 'formation' });
    }
    for (const b of e.hostile) { const q = spaceProject(b.pos, cam, W, H); boxes.push({ x: q.x - 9, y: q.y - 15, width: 18, height: 24, kind: 'projectile' }); }
    if (e.swarm.phase === 'cleared' || e.swarm.phase === 'entry' && e.swarm.waveAge < 1.2)
      boxes.push({ x: l.x, y: l.cy - 16, width: l.width, height: 45, kind: 'wave-banner' });
    return boxes;
  }
  spaceScene = function (e, time, fx = true) { return inArena(e) ? [] : view.scene(e, time, fx); };
  spaceCamera = function (e, time = 0, preview = false) {
    if (!inArena(e)) return view.camera(e, time, preview);
    const w = ARCADE.canvas?.width || 1280, h = ARCADE.canvas?.height || 720;
    const cssW = mobile() ? (ARCADE.canvas?.getBoundingClientRect().width || w) : w;
    return cameraFor(cssW, h / (w / cssW));
  };
  function polygon(c, points, fill) { c.fillStyle = fill; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
  function ship(c, x, y, unit, rank, color, angle = 0, flash = false, player = false) {
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(unit, unit);
    const pale = flash ? '#ffffff' : color;
    if (player) {
      polygon(c, [[0, -9], [2, -3], [3, 0], [8, 4], [8, 7], [3, 5], [2, 8], [-2, 8], [-3, 5], [-8, 7], [-8, 4], [-3, 0], [-2, -3]], '#4fa8c9');
      polygon(c, [[0, -9], [2, -2], [2, 6], [-2, 6], [-2, -2]], pale);
      c.fillStyle = '#fff4ad'; c.fillRect(-1, -3, 2, 4); c.fillStyle = '#7df8ff'; c.fillRect(-5, 2, 2, 4); c.fillRect(3, 2, 2, 4);
    } else {
      const wing = rank === 2 ? 9 : rank === 1 ? 8 : 7;
      polygon(c, [[-wing, -5], [-wing + 2, -5], [-4, 0], [-3, -4], [3, -4], [4, 0], [wing - 2, -5], [wing, -5], [wing, 3], [4, 6], [2, 3], [-2, 3], [-4, 6], [-wing, 3]], pale);
      polygon(c, [[-3, -5], [3, -5], [4, 0], [2, 7], [-2, 7], [-4, 0]], flash ? '#ffffff' : '#49679e');
      c.fillStyle = '#fff7ba'; c.fillRect(-3, -1, 2, 2); c.fillRect(1, -1, 2, 2);
      c.fillStyle = pale; c.fillRect(-1, 3, 2, 4);
      if (rank === 2) { c.fillStyle = '#fff1be'; c.fillRect(-2, -7, 4, 2); }
    }
    c.restore();
  }
  function drawSwarmHUD(c, e, cam, w, h) {
    c.clearRect(0, 0, w, h);
    const cssW = mobile() ? (ARCADE.canvas?.getBoundingClientRect().width || w) : w;
    const ratio = w / cssW, W = w / ratio, H = h / ratio, l = layout(W, H), camera = cameraFor(W, H);
    const s = e.swarm, p = e.player, unit = clamp(Math.min(l.sx * .55, l.sy * .95), 1, 3.5);
    c.save(); c.scale(ratio, ratio); c.textBaseline = 'middle'; c.fillStyle = '#060d20'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 82; i++) {
      const x = ((i * 137.71 + e.seed % 197) % 997) / 997 * W;
      const y = ((i * 71.31 + s.time * (i % 3 + 1) * 3) % 809) / 809 * H;
      c.fillStyle = ['#c2d9f0', '#7183ad', '#52728f'][i % 3]; c.globalAlpha = .3 + (i % 5) * .1;
      c.fillRect(x, y, i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
    }
    c.globalAlpha = 1;
    const project = pos => spaceProject(pos, camera, W, H);
    c.strokeStyle = '#21425f'; c.lineWidth = 1; c.beginPath();
    c.moveTo(l.x - 4, l.top); c.lineTo(l.x - 4, H - l.bottom); c.moveTo(l.x + l.width + 4, l.top); c.lineTo(l.x + l.width + 4, H - l.bottom); c.stroke();
    c.save(); c.beginPath(); c.rect(l.x - 8, l.top - 8, l.width + 16, l.height + 16); c.clip();
    for (const x of e.enemies) if (!x.dead) {
      const q = project(x.pos), diving = x.mode === 'dive';
      if (diving) {
        c.strokeStyle = x.color + '54'; c.lineWidth = unit * 1.2;
        const d = V3.norm(x.vel); c.beginPath(); c.moveTo(q.x, q.y); const tail = project(V3.sub(x.pos, V3.scale(d, 8))); c.lineTo(tail.x, tail.y); c.stroke();
      }
      if (x.mode === 'tell') {
        c.strokeStyle = '#fff1b3'; c.lineWidth = 1.5; c.beginPath(); c.arc(q.x, q.y, unit * 11, -.4, Math.PI + .4); c.stroke();
        c.fillStyle = '#ffe48e'; c.font = 'bold ' + Math.max(12, unit * 6) + 'px Arial'; c.textAlign = 'center'; c.fillText('!', q.x, q.y - unit * 15);
      }
      const angle = diving ? clamp(Math.atan2(x.vel[0], -x.vel[1]), -.75, .75) : Math.sin(x.age * 5 + x.slot) * .045;
      ship(c, q.x, q.y, unit, x.rank, x.color, angle, x.hit > 0);
      if (x.fireCue > 0) { c.fillStyle = '#fff0b2'; c.beginPath(); c.arc(q.x, q.y + unit * 9, unit * (2.3 + Math.sin(x.fireCue * 19) * .6), 0, Math.PI * 2); c.fill(); }
      if (x.rank && x.hp < x.maxHp) { c.fillStyle = '#294059'; c.fillRect(q.x - unit * 7, q.y - unit * 11, unit * 14, 2); c.fillStyle = x.color; c.fillRect(q.x - unit * 7, q.y - unit * 11, unit * 14 * x.hp / x.maxHp, 2); }
    }
    for (const b of e.bullets) {
      const q = project(b.pos); c.fillStyle = b.color; c.fillRect(q.x - (b.type === 'missile' ? 2.5 : 1.4), q.y - (b.type === 'missile' ? 8 : 6), b.type === 'missile' ? 5 : 2.8, b.type === 'missile' ? 13 : 10);
      if (b.type === 'missile') { c.fillStyle = '#ffae61'; c.fillRect(q.x - 1.5, q.y + 5, 3, 7); }
    }
    for (const b of e.hostile) {
      const q = project(b.pos); c.strokeStyle = '#e79c535c'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(q.x, q.y - 10); c.lineTo(q.x, q.y); c.stroke();
      c.fillStyle = '#ffe4a6'; c.beginPath(); c.arc(q.x, q.y, l.compact ? 3.1 : 3.8, 0, Math.PI * 2); c.fill();
    }
    const player = project(p.pos);
    if (p.hp > 0 && !(p.invulnerable > 0 && Math.floor(s.time * 13) % 2)) {
      c.fillStyle = '#69dffb88'; c.fillRect(player.x - unit, player.y + unit * 7, unit * 2, unit * (p.boosting ? 10 : 4 + Math.sin(s.time * 25)));
      ship(c, player.x, player.y, unit * 1.1, 0, '#defaff', p.bank, false, true);
    }
    if (e.pulseWave > 0) { c.strokeStyle = '#a4ffff'; c.lineWidth = 2; c.globalAlpha = e.pulseWave; c.beginPath(); c.ellipse(player.x, player.y, (1 - e.pulseWave) * l.width, (1 - e.pulseWave) * l.height, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    for (const x of e.explosions) {
      const q = project(x.pos), age = 1 - x.life / x.max; c.strokeStyle = x.color; c.lineWidth = 2; c.globalAlpha = 1 - age;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = unit * (3 + age * 15); c.beginPath(); c.moveTo(q.x + Math.cos(a) * r * .5, q.y + Math.sin(a) * r * .5); c.lineTo(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); c.stroke(); }
    }
    c.globalAlpha = 1;
    if (e.crash) { const t = e.crash.time || 0; c.strokeStyle = '#ffc281'; c.lineWidth = 3; c.globalAlpha = Math.max(.1, 1 - t / 3); c.beginPath(); c.arc(player.x, player.y, 8 + t * 24, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    c.restore();
    const pad = l.compact ? 9 : 22, metricsY = l.landscape ? 17 : l.compact ? 18 : H - 29;
    c.textAlign = 'left'; c.font = 'bold ' + (l.compact ? 11 : 13) + 'px Arial'; c.fillStyle = p.hp < 30 ? '#ffb19a' : '#b5ffe2';
    c.fillText('ЩИТ ' + Math.ceil(p.hp) + '%', pad, metricsY); c.fillStyle = '#ffe1a0'; c.fillText('РАКЕТЫ ' + p.missiles, pad + 91, metricsY);
    c.fillStyle = '#b4d5ef'; c.fillText((l.compact ? 'ИМПУЛЬС ' : 'E · ИМПУЛЬС ') + (p.pulseCooldown > 0 ? Math.ceil(p.pulseCooldown) + 'с' : 'ГОТОВ'), pad + 186, metricsY);
    c.fillStyle = '#25445c'; c.fillRect(pad, metricsY + 10, Math.min(293, W - 2 * pad), 3); c.fillStyle = '#92e2c0'; c.fillRect(pad, metricsY + 10, Math.min(293, W - 2 * pad) * p.hp / 100, 3);
    const titleY = l.landscape ? 15 : l.compact ? 51 : 25;
    const titleX = l.landscape ? W - 12 : W / 2, maxTitle = l.landscape ? Math.max(200, W - 334) : W - 18;
    c.textAlign = l.landscape ? 'right' : 'center'; c.fillStyle = '#dcedff'; c.font = 'bold ' + (l.compact ? 13 : 18) + 'px Arial';
    c.fillText('РОЙ УТОЧНЕНИЙ · ВОЛНА ' + Math.min(3, s.packet + 1) + ' / 3', titleX, titleY, maxTitle);
    c.font = 'bold ' + (l.compact ? 10 : 12) + 'px Arial'; c.fillStyle = '#ffd294';
    const hint = s.phase === 'cleared' ? 'ВОЛНА ПРОЙДЕНА · ПАКЕТ ФТ НА БОРТУ' :
      'ОСТАЛОСЬ ' + living(e).length + ' / ' + waveCount(e) + '    ·    ПАКЕТЫ ФТ ' + completed(e) + ' / 3';
    c.fillText(hint, titleX, titleY + (l.compact ? 19 : 25), maxTitle);
    if (!l.landscape && !l.compact) { c.fillStyle = '#829db8'; c.font = '11px Arial'; c.fillText('Строй подсветился → враги пикируют. Янтарные точки — вражеские снаряды.', W / 2, 71, W - 30); }
    c.textAlign = 'center'; c.font = (l.compact ? 10 : 12) + 'px Arial'; c.fillStyle = '#a9c6dc';
    c.fillText(l.compact ? 'ДЖОЙСТИК — МАНЁВР  ·  ОГОНЬ — ВВЕРХ' : 'WASD — МАНЁВР  ·  ПРОБЕЛ — ОГОНЬ ВВЕРХ  ·  Q — РАКЕТА  ·  E — ИМПУЛЬС', W / 2, H - (l.compact ? 10 : 13), W - 20);
    if (s.phase === 'entry' && s.waveAge < 1.2 || s.phase === 'cleared') {
      c.font = 'bold ' + (l.compact ? 18 : 27) + 'px Arial'; c.fillStyle = s.phase === 'cleared' ? '#a7ffe0' : '#d2e7ff';
      c.fillText(s.phase === 'cleared' ? 'ФТ ' + completed(e) + ' / 3 · ПРИНЯТО!' : 'ВОЛНА ' + (s.packet + 1), W / 2, l.cy + 8, l.width);
    }
    if (e.flash > 0) { c.fillStyle = 'rgba(255,108,91,' + Math.min(.13, e.flash * .35) + ')'; c.fillRect(l.x, l.top, l.width, l.height); }
    c.restore();
  }
  drawFlightHUD = function (c, e, cam, w, h) { return inArena(e) ? drawSwarmHUD(c, e, cam, w, h) : view.flightHUD(c, e, cam, w, h); };
  drawMobileGameHUD = function (c, e, cam, w, h) { return inArena(e) ? drawSwarmHUD(c, e, cam, w, h) : view.mobileHUD(c, e, cam, w, h); };
  drawCampaignFlightHUD = function (...args) { if (!inArena(args[1])) return view.campaignHUD(...args); };
  drawClarityHUD = function (...args) { if (!inArena(args[1])) return view.clarityHUD(...args); };
  function controls(e) {
    const crystal = document.getElementById('mobile-crystal');
    if (!active(e)) {
      if (crystal?.dataset.swarmCaption === VERSION) {
        if (crystal.textContent === 'Цель: три волны') crystal.textContent = 'К кристаллу ↗';
        delete crystal.dataset.swarmCaption;
      }
      return;
    }
    for (const id of ['citadel-primary', 'mobile-guide']) {
      const node = document.getElementById(id); if (!node) continue;
      node.textContent = mobile() ? 'Джойстик · Манёвр' : 'WASD · Манёвр'; node.disabled = true;
      node.setAttribute('aria-label', 'В рое управляйте кораблём вручную; после трёх волн вернётся автокурс'); node.setAttribute('aria-pressed', 'false');
    }
    if (crystal) { crystal.textContent = 'Цель: три волны'; crystal.disabled = false; crystal.dataset.swarmCaption = VERSION; }
    ARCADE.canvas?.setAttribute?.('aria-label', 'Рой уточнений: корабль игрока внизу, три волны космических врагов сверху. Джойстик перемещает корабль, огонь направлен вверх.');
  }
  updateMobileArcade = function (...args) { const result = view.mobileUpdate.apply(this, args); controls(ARCADE.engine); return result; };
  updateCitadelClarity = function (...args) {
    const e = ARCADE.engine; if (!active(e)) return view.clarityUpdate.apply(this, args);
    const route = document.getElementById('citadel-route');
    if (route) {
      const html = '<div class="route-missions"><b>УРОВЕНЬ 7 · РОЙ УТОЧНЕНИЙ</b></div>' +
        '<div class="route-count"><small>ВОЛНА</small><b>' + (e.swarm.packet + 1) + '<em>/3</em></b></div>' +
        '<div class="route-count"><small>ПРОТИВНИКОВ</small><b>' + living(e).length + '</b></div>' +
        '<div class="route-count"><small>ПАКЕТЫ ФТ</small><b>' + completed(e) + '<em>/3</em></b></div>';
      if (route.innerHTML !== html) route.innerHTML = html;
    }
    const toast = document.getElementById('citadel-toast'); if (toast) toast.hidden = true; controls(e);
  };
  updateArcadeHUD = function (...args) {
    const result = view.update.apply(this, args), e = ARCADE.engine; if (!active(e)) return result;
    for (const [id, text] of [['arcade-mission-title', 'Рой уточнений'], ['arcade-stage-label', 'УРОВЕНЬ 07 / 14'],
      ['arcade-mission-brief', 'Разбейте три эскадрильи и заберите три пакета требований.'], ['arcade-mission-kills', e.stageKills]]) {
      const node = document.getElementById(id); if (node) node.textContent = String(text);
    }
    controls(e); return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine; if (!active(e) || e.status !== 'briefing') return view.overlay.apply(this, args);
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 7 / 14 · КОСМИЧЕСКАЯ АРКАДА</span>' +
      '<h3>Рой уточнений</h3><p>Противники собираются в строй и группами пикируют на тебя. Разбей три волны — получишь три пакета требований.</p>' +
      '<div class="brief-command"><span class="crystal-symbol">✦</span><div><b>Корабль внизу. Огонь — вверх.</b>' +
      '<small>WASD или джойстик перемещают корабль. Совмещайся с врагом по горизонтали и стреляй. Ракета летит прямо и взрывается при попадании.</small></div></div>' +
      '<div class="brief-command"><span class="hostile-symbol">!</span><div><b>Подсвеченный враг готовится пикировать</b>' +
      '<small>Уходи от кораблей и янтарных снарядов. Импульс рассеивает пули и отбивает близких пикировщиков.</small></div></div>' +
      '<button class="arcade-play" data-action="citadel-launch">В БОЙ С РОЕМ ↗</button>' +
      '<small>3 волны → 3 пакета ФТ → разбор решений → Цитадель.</small></div>';
  };
  function explainManual(e) { e.autopilot = false; e.say('Три волны роя. WASD или джойстик — манёвр, огонь — прямо вверх. Уклоняйся от пикирующих кораблей и янтарных снарядов. После боя автокурс вернётся.', 'order', true); }
  arcadeAction = function (action, value) {
    const e = ARCADE.engine;
    if (active(e) && ['citadel-guidance', 'citadel-primary', 'citadel-crystal'].includes(action)) { explainManual(e); return true; }
    return view.action(action, value);
  };
  mobileAction = function (action, value) {
    const e = ARCADE.engine; if (active(e) && action === 'mobile-guide') { explainManual(e); return true; }
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
  // Older diagnostics may still ask about the retired communication window or
  // hazard rectangles. Keep those query names harmless, but expose real waves.
  globalThis.CITADEL_SWARM = Object.freeze({ version: VERSION, active, completed,
    insideWindow: () => false, windowAt: () => null, formationPoint, secondsNeeded: waveCount,
    arena: ARENA, formations: FORMS, liveRegions: () => [], regionContains: () => false,
    regionPoint: (a, u, v, z = 0) => [a.u[0] * u + a.v[0] * v, a.u[1] * u + a.v[1] * v, z],
    layout, cameraFor, hudBounds,
    inspection: e => !configured(e) ? null : ({ packet: e.swarm.packet, wave: Math.min(3, e.swarm.packet + 1), downloaded: completed(e),
      transfer: e.swarm.transfer.slice(), formation: FORMS[Math.min(2, e.swarm.packet)], inside: false, blocked: false,
      drones: living(e).length, remaining: living(e).length, total: waveCount(e), cleared: e.swarm.cleared.slice(),
      divers: living(e).filter(x => ['tell', 'dive'].includes(x.mode)).length, hazards: e.hostile.length, complete: e.swarm.complete }) });
})();
