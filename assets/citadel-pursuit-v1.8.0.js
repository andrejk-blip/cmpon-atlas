/* Citadel 1.8.0 — level 4, «ФЗ уходит со связи».
 * The original flight controls, weapon integrator, requirements, review cases
 * and docking remain shared. Only the second orbital mission changes its loop.
 */
(function () {
  'use strict';
  const VERSION = '1.8.0';
  if (globalThis.CITADEL_PURSUIT || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype;
  const before = {
    beginStage: proto.beginStage, launch: proto.launch, step: proto.step,
    enemyStep: proto.enemyStep, hit: proto.hit, collect: proto.collect,
    checkStage: proto.checkStage, openNextLesson: proto.openNextLesson,
    navTarget: proto.navTarget, guidance: proto.guidance, selectTarget: proto.selectTarget,
    objective: proto.objective, scene: spaceScene, flightHUD: drawFlightHUD,
    campaignHUD: drawCampaignFlightHUD, clarityHUD: drawClarityHUD,
    mobileHUD: drawMobileGameHUD, updateHUD: updateArcadeHUD, overlay: arcadeOverlayHTML,
  };
  const granting = new WeakSet();
  const loaded = e => !!e && e.stage === 1 && !e.finale && e.pursuit?.version === VERSION;
  const active = e => loaded(e) && e.phase === 'pursuit' && !e.crash;
  const flight = active;
  const distance = (a, b) => V3.len(V3.sub(a, b));
  const count = e => e.plan[1].filter(id => e.rescued.includes(id)).length;
  const aliveCarriers = e => e.pursuit.carriers.filter(c => !c.delivered);
  const casesDone = e => [2, 3].every(n => e.decisions.some(d => d.stage === 1 && d.caseIndex === n));
  const comic = (e, text, kind, pos) => e.emit('comic', { text, kind, anchor: pos.slice() });
  const title = c => (c.escaped ? 'МАЯК ФТ ' : 'НОСИТЕЛЬ ') + (c.index + 1) + ' · ' + c.name;
  const profiles = [
    { name: 'Срочное уточнение', profile: 'fast', start: [0, 3, -140], speed: 20, shield: 470, color: '#ffca85' },
    { name: 'Плавающий объём', profile: 'zigzag', start: [-96, 24, -205], speed: 16.5, shield: 410, color: '#bdadff' },
    { name: 'Последняя версия', profile: 'escort', start: [98, -20, -275], speed: 13.5, shield: 540, color: '#8fdfea' },
  ];

  function sync(e) {
    const s = e.pursuit;
    // The save format serializes each key independently. Rebuild references
    // from the canonical carrier records after loading, never from stale copies.
    const escorts = e.enemies.filter(x => x.pursuitEscort && !x.dead).slice(0, 2);
    for (const c of s.carriers) {
      const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === c.reqId);
      if (item) { item.pos = c.pos.slice(); item.dead = e.rescued.includes(c.reqId); item.pursuitCarrier = c.id; }
      if (e.rescued.includes(c.reqId)) { c.delivered = true; c.dead = true; }
    }
    e.enemies = s.carriers.filter(c => !c.delivered && !c.open).concat(escorts);
  }

  function initialize(e, migrating = false) {
    const records = profiles.map((def, index) => {
      const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === e.plan[1][index]);
      const delivered = e.rescued.includes(e.plan[1][index]);
      if (item?.dead && !delivered) item.dead = false;
      const hp = Math.round(def.shield * (e.assist ? .67 : 1));
      const phase = e.random() * Math.PI * 2;
      const pos = [def.start[0] + Math.sin(phase) * (def.profile === 'zigzag' ? 25 : 7),
        def.start[1] + Math.sin(phase) * (def.profile === 'zigzag' ? 10 : 4), def.start[2]];
      return {
        id: ++e.entityId, index, reqId: e.plan[1][index], name: def.name, profile: def.profile,
        pursuitCarrier: true, type: 'heavy', role: 'carrier', pos,
        origin: def.start.slice(), vel: [0, 0, -def.speed * (e.assist ? .78 : 1)],
        speed: def.speed * (e.assist ? .78 : 1), travel: 0, phase,
        hp, maxHp: hp, r: 6.2, color: def.color, age: 0, hit: 0, shot: 0,
        open: false, openTime: 0, transfer: 0, transferTime: e.assist ? 2.4 : 2.8,
        escaped: false, delivered, dead: delivered, announced: false,
      };
    });
    e.pursuit = { version: VERSION, clock: 0, state: 'chase', carriers: records, linkId: null, linkJammed: false,
      completedAt: null, migrated: !!migrating, shotsOpened: 0 };
    e.phase = 'pursuit'; e.location = 'ФЗ уходит со связи';
    e.wave = 0; e.waveSpawned = 0; e.waveClock = 0; e.spawnClock = 999;
    e.enemies = []; e.hostile = []; e.bullets = []; e.boss = null;
    e.selectedTarget = records.find(c => !c.delivered)?.id ?? null;
    e.navMode = 'objective'; e.detour = null; e.navWatch = null; e.hullCache = null;
    // An outbound corridor, with sparse rocks beside the routes. The Citadel
    // remains behind the chase and is the actual destination after retrieval.
    const rnd = arcadeSeed(e.seed + 1800417);
    e.asteroids = Array.from({ length: 12 }, (_, i) => ({
      pos: [(i % 2 ? 1 : -1) * (165 + rnd() * 65), (rnd() - .5) * 94, -110 - rnd() * 430],
      r: 4 + rnd() * 4, phase: rnd() * 6.28, variant: i % 3,
    }));
    e.pickups = e.pickups.filter(p => p.type === 'requirement');
    e.pickups.push({ type: 'repair', pos: [-37, 5, -287], r: 5, dead: false },
      { type: 'missiles', pos: [34, -6, -414], r: 5, dead: false });
    for (let i = 0; i < 2; i++) e.enemies.push({
      id: ++e.entityId, pursuitEscort: true, type: 'hunter', role: 'fighter',
      name: i ? 'Охрана версии' : 'Охрана канала', pos: V3.add(records[2].pos, [i ? 18 : -18, 5, -5]),
      vel: [0, 0, -records[2].speed], hp: e.assist ? 90 : 130, r: 3.6,
      color: '#f1a294', points: 165, speed: 18, age: 0, phase: i * Math.PI, shot: 3.5 + i,
      hit: 0, dead: false, warp: 0,
    });
    sync(e);
    if (!migrating) {
      e.say('ФЗ уходят со связи! Догони носители, огнём вскрой канал, отпусти огонь и держись рядом 3 секунды. Забери три пакета — и обратно в Цитадель.', 'brief', true);
    }
    if (count(e) === 3 && e.status === 'playing') review(e);
    return e.pursuit;
  }

  function selected(e) {
    const carriers = aliveCarriers(e);
    return carriers.find(c => c.id === e.selectedTarget) || carriers.slice().sort((a, b) =>
      distance(a.pos, e.player.pos) - distance(b.pos, e.player.pos))[0] || null;
  }
  function clearLine(e, from, to, margin = .8) {
    if (citadelHullHit(e, from, to, margin)) return false;
    return !e.asteroids.some(a => flightSegment(from, to, a.pos, a.r + margin) !== null);
  }
  function linkEligible(e, c) {
    if (!c || !c.open || c.delivered || e.status !== 'playing') return false;
    const d = V3.sub(c.pos, e.player.pos), range = V3.len(d);
    return range >= 7 && range <= (e.assist ? 48 : 42) &&
      V3.dot(V3.norm(d), flightBasis(e.player.yaw, e.player.pitch).f) >= (e.assist ? .68 : .78) &&
      clearLine(e, e.player.pos, c.pos);
  }

  function open(e, c) {
    c.open = true; c.hp = 0; c.openTime = 15; c.transfer = Math.max(0, c.transfer);
    e.pursuit.shotsOpened++; e.selectedTarget = c.id; e.lock = null;
    e.burst(c.pos, '#94ffe0', 16);
    e.notify('КАНАЛ ОТКРЫТ', 'Отпустите огонь. Держите носитель впереди на расстоянии до ' + (e.assist ? 48 : 42) + ' м.');
    e.say(c.escaped ? 'Архив маяка открыт. Отпусти огонь, подойди ближе и удерживай связь.' : 'Канал открыт! Отпусти огонь и подлети ближе. Удерживай носитель в прицеле, пока идёт передача требований.', 'success', true);
    comic(e, 'ДАЙТЕ ТЗ!', 'action', c.pos);
    e.emit('pickup', 'Канал связи открыт');
  }
  function escape(e, c) {
    if (c.escaped || c.delivered) return;
    c.escaped = true; c.vel = [0, 0, 0]; c.transferTime = e.assist ? 3.4 : 4.2;
    // A sealed emergency archive still needs a player's attack. Merely enabling
    // autopilot and waiting for all ships to escape cannot finish the mission.
    if (!c.open) { c.hp = Math.min(c.hp, e.assist ? 70 : 105); c.maxHp = c.hp; }
    c.openTime = 0;
    e.explosions.push({ pos: c.pos.slice(), life: .9, max: .9, color: c.color, warp: true });
    e.say('Носитель ушёл, но оставил аварийный маяк. Требование не потеряно: вскрой архив огнём и забери передачу.', 'alert', true);
    e.notify('ОСТАЛСЯ МАЯК ФТ', 'Он отмечен на экране. Вскройте архив и удерживайте связь.');
    comic(e, 'УТОЧНЕНИЯ В МАЯКЕ!', 'warning', c.pos);
    e.emit('warp');
  }
  function queueReviews(e) {
    const current = e.status === 'lesson' ? e.lesson?.caseIndex : null;
    const done = new Set(e.decisions.filter(d => d.stage === 1).map(d => d.caseIndex));
    const seen = new Set();
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
    if (e.pursuit.state !== 'review') {
      e.pursuit.state = 'review'; e.pursuit.completedAt = e.pursuit.clock;
      e.pursuit.linkId = null; e.enemies = []; e.hostile = []; e.bullets = [];
      e.autopilot = false; e.player.speed = 0; e.selectedTarget = null;
      e.say('Три пакета на борту. Погоня закончена. На безопасном канале разберём два решения — затем возвращаемся в Цитадель.', 'success', true);
      comic(e, 'ТЗ У НАС!', 'success', e.player.pos);
    }
    queueReviews(e);
    if (!casesDone(e)) { if (e.status === 'playing') before.openNextLesson.call(e); return; }
    if (e.status !== 'playing') return;
    e.pursuit.state = 'return'; e.phase = 'dock'; e.navMode = 'objective'; e.autopilot = true;
    e.detour = null; e.navWatch = null; e.selectedTarget = null;
    e.say('Требования и решения сохранены. Возвращаемся в голубой шлюз Цитадели. Автокурс включён.', 'success', true);
    e.emit('phase', 'dock');
  }
  function acquire(e, c) {
    if (c.delivered || e.rescued.includes(c.reqId)) return;
    const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === c.reqId);
    if (!item) return;
    granting.add(e);
    try { e.collect(item); } finally { granting.delete(e); }
    if (!e.rescued.includes(c.reqId)) return;
    c.delivered = true; c.dead = true; c.transfer = c.transferTime;
    e.pursuit.linkId = null; e.lock = null;
    e.selectedTarget = aliveCarriers(e).slice().sort((a, b) => distance(a.pos, e.player.pos) - distance(b.pos, e.player.pos))[0]?.id ?? null;
    e.notify('ПАКЕТ ФТ ПОЛУЧЕН · ' + REQS.get(c.reqId).number, count(e) + ' / 3 · щит +10 · ракеты +2');
    comic(e, 'ТРЕБОВАНИЕ ПОЙМАНО!', 'success', c.pos);
    sync(e);
    if (count(e) === 3) review(e);
  }

  proto.beginStage = function (n, ...args) {
    this.pursuit = null;
    const result = before.beginStage.call(this, n, ...args);
    if (n === 1 && !this.finale) {
      initialize(this);
      // The inherited beginStage emits its briefing before our state exists.
      // Invalidate that cached overlay so the user sees this mission's briefing.
      if (ARCADE.engine === this) ARCADE.overlayToken = '';
      this.emit('state', this.status);
    }
    return result;
  };
  proto.launch = function (...args) {
    if (!flight(this) || this.status !== 'briefing') return before.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = true;
    this.say('Заказчик уходит в гиперпространство. Уточнения ещё не прислал! Огонь по носителю, затем отпусти огонь и держись рядом для передачи. Tab меняет цель.', 'order', true);
    for (const c of aliveCarriers(this)) if (!c.announced) {
      c.announced = true; comic(this, c.index === 0 ? 'ФЗ УХОДИТ СО СВЯЗИ!' : c.index === 1 ? 'ОБЪЁМ ОПЯТЬ ПОПЛЫЛ!' : 'ЭТО ТОЧНО ФИНАЛ!', 'warning', c.pos);
    }
    this.emit('state', 'playing'); return true;
  };
  proto.collect = function (item, ...args) {
    if (flight(this) && item.type === 'requirement' && !granting.has(this)) return;
    return before.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) {
    if (flight(this) && this.pursuit.state !== 'review') return;
    return before.openNextLesson.apply(this, args);
  };
  proto.checkStage = function (...args) {
    if (!flight(this)) return before.checkStage.apply(this, args);
    if (this.status === 'playing' && count(this) === 3) review(this);
  };
  proto.hit = function (enemy, amount, ...args) {
    if (flight(this) && enemy.pursuitEscort) {
      const alive = !enemy.dead;
      const result = CitadelFlightBase.prototype.hit.call(this, enemy, amount);
      if (alive && enemy.dead) {
        this.explosions.push({ pos: enemy.pos.slice(), life: .7, max: .7, color: enemy.color });
        this.notify('ОХРАНА ОСТАНОВЛЕНА', 'Главная цель — пакеты ФТ. Остальную охрану можно обойти.');
      }
      return result;
    }
    if (!flight(this) || !enemy.pursuitCarrier) return before.hit.call(this, enemy, amount, ...args);
    const c = this.pursuit.carriers.find(x => x.id === enemy.id);
    if (!c || c.delivered || c.open || !Number.isFinite(amount) || amount <= 0) return;
    c.hp = Math.max(0, c.hp - amount); c.hit = .16; this.hitFlash = .12; this.hits++;
    if (c.hp <= 0) open(this, c);
  };
  proto.navTarget = function (...args) {
    if (!flight(this)) return before.navTarget.apply(this, args);
    const c = selected(this);
    return c ? { ...c, name: title(c), pos: c.pos.slice() } : null;
  };
  proto.selectTarget = function (...args) {
    if (!flight(this)) return before.selectTarget.apply(this, args);
    const list = aliveCarriers(this);
    if (!list.length) { this.selectedTarget = null; return; }
    const index = list.findIndex(c => c.id === this.selectedTarget);
    this.selectedTarget = list[(index + 1) % list.length].id;
    this.navMode = 'objective'; this.detour = null; this.navWatch = null;
  };
  proto.guidance = function (input) {
    if (!flight(this)) return before.guidance.call(this, input);
    // The chase needs a genuine manual stop for a stationary emergency beacon.
    // X otherwise keeps the old orbit's minimum 6 m/s and makes a long upload
    // overshoot even while the pilot is holding the brake.
    if (!this.autopilot) return input.brake ? { ...input, cruiseSpeed: 0, boost: false } : input;
    const c = selected(this), p = this.player;
    if (!c) return { ...input, cruiseSpeed: 0, boost: false, brake: true };
    if (!clearLine(this, p.pos, c.pos, 8)) return before.guidance.call(this, input);
    const goal = V3.add(c.pos, V3.scale(c.vel, .3));
    const d = V3.sub(goal, p.pos), range = V3.len(d), desired = c.open ? 24 : 54;
    const yaw = Math.atan2(d[0], -d[2]), pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
    const dy = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)), dp = pitch - p.pitch;
    const follow = Math.max(0, V3.dot(c.vel, V3.norm(d)));
    let speed = arcadeClamp(follow + (range - desired) * 1.25, 0, input.boost && p.energy > 1 ? 52 : 34);
    if (Math.abs(dy) > .55 || Math.abs(dp) > .5) speed = Math.min(speed, 3);
    return { ...input, turn: arcadeClamp(dy * 3.2, -1, 1), pitch: arcadeClamp(dp * 3.2, -1, 1),
      cruiseSpeed: speed, brake: speed < 6, boost: !!input.boost && speed > 34 };
  };
  proto.enemyStep = function (dt, ...args) {
    if (!flight(this)) return before.enemyStep.call(this, dt, ...args);
    const s = this.pursuit; s.clock += dt;
    for (const c of s.carriers) {
      if (c.delivered) continue;
      c.age += dt; c.hit = Math.max(0, c.hit - dt);
      if (c.open && !c.escaped) {
        c.openTime -= dt;
        if (c.openTime <= 0 && c.transfer < c.transferTime) {
          c.open = false; c.hp = c.maxHp = this.assist ? 90 : 130;
          this.notify('КАНАЛ СНОВА ЗАКРЫТ', 'Короткая очередь снова откроет связь. Затем отпустите огонь.');
        }
      }
      if (c.escaped) continue;
      const old = c.pos.slice(), factor = c.open ? .42 : 1;
      c.travel += c.speed * factor * dt;
      const t = c.travel / c.speed;
      c.pos = [c.origin[0] + (c.profile === 'zigzag' ? Math.sin(t * .65 + c.phase) * 25 : Math.sin(t * .18 + c.phase) * 7),
        c.origin[1] + Math.sin(t * (c.profile === 'zigzag' ? .47 : .22) + c.phase) * (c.profile === 'zigzag' ? 10 : 4),
        c.origin[2] - c.travel];
      c.vel = V3.scale(V3.sub(c.pos, old), 1 / Math.max(.00001, dt));
      if (c.pos[2] <= -555) { c.pos[2] = -555; escape(this, c); }
      if (distance(c.pos, this.player.pos) < c.r + 2.2) this.damage(10);
    }
    const carrier = s.carriers[2];
    for (const x of this.enemies.filter(x => x.pursuitEscort && !x.dead)) {
      x.age += dt; x.hit = Math.max(0, x.hit - dt);
      const near = distance(this.player.pos, x.pos) < 155;
      const home = carrier.delivered || carrier.escaped ? V3.add(x.pos, [0, 0, -40]) :
        V3.add(carrier.pos, [Math.cos(x.age * .55 + x.phase) * 23, Math.sin(x.age * .5 + x.phase) * 12, 13]);
      const goal = near && !carrier.delivered ? V3.add(this.player.pos, [Math.cos(x.age * .6 + x.phase) * 52, 16 * Math.sin(x.phase + x.age * .5), -35]) : home;
      const want = V3.scale(V3.norm(V3.sub(goal, x.pos)), near ? 20 : 24);
      x.vel = V3.lerp(x.vel, want, Math.min(1, dt * 2)); x.pos = V3.add(x.pos, V3.scale(x.vel, dt));
      x.shot -= dt;
      if (near && x.shot <= 0 && !carrier.delivered && this.hostile.length < 18) {
        x.shot = this.assist ? 4.5 : 3.3;
        this.hostile.push({ pos: x.pos.slice(), vel: V3.scale(V3.norm(V3.sub(this.player.pos, x.pos)), this.assist ? 34 : 43),
          life: 4, r: .8, damage: 8, color: '#ffab91' });
      }
      if (carrier.delivered && distance(x.pos, this.player.pos) > 210) x.dead = true;
    }
    sync(this);
  };
  proto.step = function (delta, input = {}) {
    if (!flight(this)) return before.step.call(this, delta, input);
    if (this.status === 'playing' && this.pursuit.state === 'review') {
      review(this);
      if (this.phase !== 'pursuit' || this.status !== 'playing') return;
    }
    // The optional mobile autofire setting yields during a readable open
    // channel. A held manual trigger still jams transmission in either layout.
    const automatic = typeof MOBILE !== 'undefined' && isMobileLayout() && MOBILE.autoFire &&
      !ARCADE.keys.has('Space') && ARCADE.firePointer === null && selected(this)?.open;
    const control = automatic ? { ...input, fire: false } : input;
    const result = before.step.call(this, delta, control);
    if (this.status !== 'playing' || !flight(this)) return result;
    const dt = arcadeClamp(Number.isFinite(delta) ? delta : 0, 0, .04), s = this.pursuit;
    const eligible = aliveCarriers(this).filter(c => linkEligible(this, c));
    const candidate = eligible.find(c => c.id === this.selectedTarget) || eligible[0] || null;
    s.linkJammed = !!candidate && !!(control.fire || control.missile || control.pulse);
    const linked = s.linkJammed ? null : candidate;
    s.linkId = linked?.id ?? null;
    for (const c of aliveCarriers(this)) {
      c.transfer = c === linked ? Math.min(c.transferTime, c.transfer + dt) : Math.max(0, c.transfer - dt * (this.assist ? .18 : .3));
      if (c === linked && c.transfer >= c.transferTime) { acquire(this, c); break; }
    }
    this.hostile = this.hostile.slice(-18); this.bullets = this.bullets.slice(-64);
    return result;
  };
  proto.objective = function (...args) {
    if (!flight(this) || !['briefing', 'playing', 'paused'].includes(this.status)) return before.objective.apply(this, args);
    const c = selected(this), packages = 'ПАКЕТЫ ФТ ' + count(this) + ' / 3';
    return { title: c?.open ? 'Удерживайте связь с носителем' : c?.escaped ? 'Заберите требование из аварийного маяка' : 'Догоните носители требований',
      detail: c?.open ? 'Отпустите огонь. Носитель перед кораблём, дистанция до ' + (this.assist ? 48 : 42) + ' м. Дождитесь завершения передачи. G помогает сблизиться.' :
        'Огонь вскрывает канал, сближение забирает пакет. Tab — другой носитель; G — автокурс. Ушедший корабль оставит отмеченный маяк.',
      progress: packages + (c?.open ? ' · СВЯЗЬ ' + Math.floor(c.transfer / c.transferTime * 100) + '%' : '') };
  };

  function carrierMeshes(c, time, fx) {
    if (c.delivered) return [];
    const items = [], b = c.escaped ? flightBasis(time * .14, 0) : spaceBasisDir(V3.len(c.vel) > .1 ? c.vel : [0, 0, -1]);
    const model = spaceModel(c.pos, [1, 1, 1], b);
    const add = (mesh, off, size, color, emissive = 0, alpha = 1) => {
      const item = citadelItem(mesh, spacePoint(model, off), size, c.hit > 0 ? '#fff5d9' : color, emissive, b, alpha);
      item.pursuitCarrier = c.id; items.push(item);
    };
    if (c.escaped) {
      add('box', [0, 0, 0], [2.7, 3.5, 1.2], '#244d56');
      add('box', [0, 0, 1.25], [2.1, 2.8, .12], '#abf6db', .6);
      for (const y of [-1.5, 0, 1.5]) add('box', [0, y, 1.4], [1.5, .18, .04], '#245f60');
      add('ring', [0, 0, 0], [5, 5, 5], c.open ? '#8fffd7' : '#ffd28e', 1, .65);
    } else {
      add('hull', [0, 0, 0], [2.1, 1.8, 2.8], '#536175');
      add('box', [0, .4, -1], [2.2, 1.2, 4], '#263c52');
      for (const side of [-1, 1]) {
        add('armor', [side * 4, -.2, -2], [1.15, .8, 3.6], c.color);
        add('box', [side * 4, .7, -1.5], [.12, .08, 2.9], '#112b40');
        add('octa', [side * 4, -.2, -6.4], [.55, .45, c.open ? 1 : 2.5], '#94ecff', 1);
      }
      add('box', [0, 2, -1.4], [1.7, .4, 2], '#a6ffdd', .7);
      add('box', [0, 2.48, -1.4], [1.2, .06, 1.55], '#e1fff1');
      for (const z of [-2.3, -1.5, -.7]) add('box', [0, 2.56, z], [.8, .04, .08], '#3c766a');
      add('box', [0, 3.2, -3], [.16, .9, .16], c.color, .4);
      add('sphere', [0, 4.15, -3], [.8, .35, .8], c.open ? '#7fffe0' : c.color, 1);
      if (!c.open) add('ring', [0, 0, 0], [7.3, 7.3, 7.3], c.color, .8, .45);
      if (fx) for (let i = 1; i <= 5; i++) add('octa', [0, -.4, -8 - i * 6], [.14, .14, 1.5], c.color, 1, (1 - i / 6) * .45);
    }
    return items;
  }
  spaceScene = function (e, time, fx = true) {
    if (!flight(e)) return before.scene(e, time, fx);
    const view = Object.assign(Object.create(e), e, { enemies: e.enemies.filter(x => !x.pursuitCarrier),
      pickups: e.pickups.filter(p => p.type !== 'requirement'), nodes: [] });
    const items = before.scene(view, time, fx);
    for (const c of e.pursuit.carriers) items.push(...carrierMeshes(c, time, fx));
    const c = e.pursuit.carriers.find(c => c.id === e.pursuit.linkId);
    if (c && !c.delivered && c.open && e.status === 'playing') citadelBeam(items, e.player.pos, c.pos, '#91ffe0', .13, .65);
    return items;
  };
  drawFlightHUD = function (c, e, cam, w, h) {
    if (!flight(e)) return before.flightHUD(c, e, cam, w, h);
    const view = Object.assign(Object.create(e), e, { pickups: e.pickups.filter(p => p.type !== 'requirement'),
      enemies: e.enemies.filter(x => !x.pursuitCarrier) });
    const result = before.flightHUD(c, view, cam, w, h);
    c.save(); c.scale(w / 1280, h / 720); c.textBaseline = 'middle';
    c.fillStyle = '#081624'; c.fillRect(24, 41, 238, 20); c.fillRect(1056, 42, 200, 20);
    c.font = '10px Arial'; c.fillStyle = '#8bbfcd'; c.textAlign = 'left';
    c.fillText('УРОВЕНЬ 04 / ПОГОНЯ ЗА ФЗ', 30, 51);
    c.textAlign = 'right'; c.fillText(e.rescued.length + ' / 12 ПАКЕТОВ ФТ', 1250, 54);
    c.restore(); return result;
  };

  function hud(c, e, cam, W, H, mobile) {
    const focus = selected(e), top = mobile ? 91 : 110, bottom = Math.max(top + 30, H - (mobile ? 44 : 135));
    for (const carrier of aliveCarriers(e)) {
      const q = spaceProject(carrier.pos, cam, W, H), focused = carrier.id === focus?.id;
      let x = q.x, y = q.y;
      const edge = q.z <= 0 || x < 32 || x > W - 32 || y < top || y > bottom;
      if (edge && !focused) continue;
      const color = carrier.open ? '#9dffdc' : carrier.color;
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = focused ? 2 : 1;
      if (edge) {
        const d = V3.sub(carrier.pos, cam.pos), angle = Math.atan2(-V3.dot(d, cam.u) || .01, V3.dot(d, cam.r) || .01);
        x = W / 2 + Math.cos(angle) * (W / 2 - 27); y = (top + bottom) / 2 + Math.sin(angle) * (bottom - top) / 2;
        c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -6); c.lineTo(-6, 6); c.closePath(); c.fill(); c.restore();
      } else {
        const size = mobile ? 18 : 29;
        c.strokeRect(x - size, y - size * .7, size * 2, size * 1.4);
        if (carrier.open) {
          c.fillStyle = '#183e3a'; c.fillRect(x - size, y + size, size * 2, mobile ? 4 : 5);
          c.fillStyle = color; c.fillRect(x - size, y + size, size * 2 * carrier.transfer / carrier.transferTime, mobile ? 4 : 5);
        }
      }
      const line = (carrier.escaped ? 'МАЯК ' : 'ФЗ ') + (carrier.index + 1) + ' · ' + Math.round(distance(carrier.pos, e.player.pos)) + ' м';
      const detail = carrier.open ? 'СВЯЗЬ ' + Math.floor(carrier.transfer / carrier.transferTime * 100) + '%' : 'ЩИТ КАНАЛА ' + Math.ceil(carrier.hp / carrier.maxHp * 100) + '%';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold ' + (mobile ? 10 : 12) + 'px Arial';
      const width = Math.min(W - 24, Math.max(c.measureText(line).width, c.measureText(detail).width) + 16);
      const lx = arcadeClamp(x, width / 2 + 10, W - width / 2 - 10), ly = arcadeClamp(y - (mobile ? 44 : 58), top, bottom);
      c.fillStyle = '#071624e6'; c.fillRect(lx - width / 2, ly - 10, width, 33);
      c.fillStyle = color; c.fillText(line, lx, ly, width - 10);
      c.font = (mobile ? 9 : 10) + 'px Arial'; c.fillText(detail, lx, ly + 15, width - 10);
    }
  }
  drawCampaignFlightHUD = function (c, e, cam, w, h) {
    if (!flight(e)) return before.campaignHUD(c, e, cam, w, h);
    if (e.status !== 'playing') return;
    c.save(); c.scale(w / 1280, h / 720); hud(c, e, cam, 1280, 720, false); c.restore();
  };
  drawClarityHUD = function (c, e, cam, w, h) {
    if (!flight(e)) return before.clarityHUD(c, e, cam, w, h);
    if (e.status !== 'playing') return;
    const carrier = selected(e);
    c.save(); c.scale(w / 1280, h / 720); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#071624ed'; c.fillRect(335, 18, 610, 72); c.strokeStyle = '#efd89a77'; c.strokeRect(335, 18, 610, 72);
    c.fillStyle = '#ffe6ad'; c.font = 'bold 17px Arial'; c.fillText('ФЗ УХОДИТ СО СВЯЗИ · ФТ ' + count(e) + '/3', 640, 38);
    c.fillStyle = '#bdece7'; c.font = '12px Arial';
      c.fillText(carrier?.open ? (e.pursuit.linkJammed ? 'ОТПУСТИТЕ ОГОНЬ: ВЫСТРЕЛЫ ГЛУШАТ СВЯЗЬ' : 'ОГОНЬ ОТПУЩЕН · ДО ' + (e.assist ? 48 : 42) + ' М · СВЯЗЬ ' + Math.floor(carrier.transfer / carrier.transferTime * 100) + '%') :
      'ОГОНЬ — ВСКРЫТЬ КАНАЛ · СБЛИЖЕНИЕ — ЗАБРАТЬ ФТ', 640, 60, 586);
    c.fillStyle = '#89acbb'; c.font = '10px Arial'; c.fillText('TAB — НОСИТЕЛЬ · G — АВТОКУРС · X — ТОРМОЗ · SHIFT — ФОРСАЖ', 640, 78);
    c.restore();
  };
  drawMobileGameHUD = function (c, e, cam, w, h) {
    if (!flight(e)) return before.mobileHUD(c, e, cam, w, h);
    const view = Object.assign(Object.create(e), e, { enemies: e.enemies.filter(x => !x.pursuitCarrier),
      pickups: e.pickups.filter(x => x.type !== 'requirement'), selectedTarget: null, lock: null });
    before.mobileHUD(c, view, cam, w, h);
    if (e.status !== 'playing') return;
    const cssWidth = ARCADE.canvas?.getBoundingClientRect().width || w, scale = w / cssWidth, W = w / scale, H = h / scale;
    c.save(); c.scale(scale, scale); c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = '#071624ed'; c.fillRect(6, 40, Math.min(390, W - 12), 41);
    c.fillStyle = '#ffe1aa'; c.font = 'bold 11px Arial'; c.fillText('ПОГОНЯ · ПАКЕТЫ ФТ ' + count(e) + '/3', 13, 52, W - 26);
    c.fillStyle = '#b5e8df'; c.font = '10px Arial'; c.fillText(selected(e)?.open ? (e.pursuit.linkJammed ? 'Отпустите огонь, чтобы передать ФТ' : 'Огонь отпущен · держитесь рядом') : 'Огонь вскрывает канал → подлетите ближе', 13, 69, W - 26);
    hud(c, e, cam, W, H, true); c.restore();
  };
  updateArcadeHUD = function (...args) {
    const result = before.updateHUD.apply(this, args), e = ARCADE.engine;
    if (!flight(e)) return result;
    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    set('arcade-mission-title', 'ФЗ уходит со связи');
    set('arcade-mission-brief', 'Три носителя, три требования. Вскройте канал и удерживайте связь.');
    set('citadel-objective-phase', 'УРОВЕНЬ 04 · ПОГОНЯ');
    set('citadel-primary', 'G · Догнать носитель ↗');
    set('mobile-crystal', 'К носителю');
    set('citadel-threat-count', aliveCarriers(e).length + ' НОСИТЕЛЯ');
    const route = document.getElementById('citadel-route');
    if (route) route.innerHTML = '<span>04 · ПОГОНЯ ЗА ФЗ</span><span>ПАКЕТЫ ФТ <b>' + count(e) + '/3</b></span><span>ОГОНЬ → СВЯЗЬ → ЦИТАДЕЛЬ</span>';
    return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine;
    if (!flight(e) || e.status !== 'briefing') return before.overlay.apply(this, args);
    const mobile = isMobileLayout();
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 04 · ПОГОНЯ ЗА ТРЕБОВАНИЯМИ</span>' +
      '<h3>ФЗ уходит со связи</h3><p>Три носителя уносят уточнения. Быстрый курьер, маневрирующий корабль и транспорт под охраной. Догоните их и заберите три настоящих пакета ФТ.</p>' +
      '<div class="brief-command"><span class="hostile-symbol">⌖</span><div><b>Огонь → открыть канал</b><small>' + (mobile ?
        'Кнопка огня вскрывает канал. «Автокурс» помогает догнать; кнопка цели меняет носитель.' :
        'Пробел / кнопка огня. G помогает догнать, Tab меняет носитель.') + '</small></div></div>' +
      '<div class="brief-command"><span class="crystal-symbol">↔</span><div><b>Отпустите огонь → передайте требование</b><small>Держите носитель впереди в пределах ' + (e.assist ? 48 : 42) + ' м около 3 секунд. Выстрелы глушат связь. ' +
      (mobile ? 'Автокурс держит дистанцию.' : 'X — тормоз.') + '</small></div></div>' +
      '<p>Ушедший корабль оставляет отмеченный аварийный маяк. Требование можно вернуть. После погони спокойно разберём два решения и войдём в шлюз Цитадели.</p>' +
      '<button class="arcade-play" data-action="citadel-launch">ДОГНАТЬ ФЗ ↗</button></div>';
  };

  if (typeof CUP_ENGINE_KEYS !== 'undefined' && !CUP_ENGINE_KEYS.includes('pursuit')) CUP_ENGINE_KEYS.push('pursuit');
  if (typeof CUP_LEVELS !== 'undefined') CUP_LEVELS[3] = 'ФЗ уходит со связи';
  if (typeof cupUnpack === 'function') {
    const unpack = cupUnpack;
    cupUnpack = function (...args) {
      const e = unpack.apply(this, args);
      if (e.stage !== 1 || e.finale || e.phase === 'escort') return e;
      if (loaded(e)) {
        if (flight(e)) {
          sync(e);
          if (count(e) === 3 && e.pursuit.state === 'chase') e.pursuit.state = 'review';
        }
      } else if (['orientation', 'battle', 'retrieve', 'pursuit'].includes(e.phase) &&
          ['briefing', 'playing', 'paused', 'lesson'].includes(e.status)) initialize(e, true);
      return e;
    };
  }
  globalThis.CITADEL_PURSUIT = Object.freeze({ version: VERSION, active, flight,
    carriers: e => loaded(e) ? e.pursuit.carriers.map(c => ({ id: c.id, reqId: c.reqId, profile: c.profile,
      pos: c.pos.slice(), shield: c.hp, open: c.open, escaped: c.escaped, delivered: c.delivered,
      transfer: c.transfer, transferTime: c.transferTime })) : [],
    linkEligible, carrierMeshes, count: e => loaded(e) ? count(e) : 0,
  });
})();
