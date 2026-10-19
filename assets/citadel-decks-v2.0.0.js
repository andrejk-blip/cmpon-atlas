/* Citadel 2.0.0 — persistent authored crews for new bases; 1.x saved decks retain their rules.
 * All finite reinforcements belong to that room. Saved enemies and queues keep
 * their identity; cards, rewards, exits and bosses stay in the campaign core.
 */
(() => {
  'use strict';
  const VERSION = '2.0.0', LAYOUT_VERSION = '1.9.0';
  if (typeof RequirementArcade !== 'function' || typeof stationMakeDeck !== 'function' ||
      globalThis.CITADEL_DECK_COMBAT?.version === VERSION) return;
  const proto = RequirementArcade.prototype;
  const original = {
    make: stationMakeDeck, architecture: stationArchitecture, agent: stationAgent,
    interior: citadelInterior, spawn: proto.spawnBoardWave, enemy: proto.enemyBoardStep,
    step: proto.stepBoard, moveToward: proto.boardMoveToward, interact: proto.boardInteract, pulse: proto.boardPulse,
    hit: proto.boardHit, continue: proto.continueRemark, finalContinue: proto.continueFinaleCheck,
    objective: proto.objective, begin: proto.beginBoarding, lair: proto.beginLair, say: proto.say,
    hud: drawBoardHUD, mobile: drawMobileGameHUD, finalHud: drawFinaleHUD,
  };
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const alive = b => b.enemies.filter(x => !x.dead && x.hp > 0);
  // Enemy.zone is a zero-based encounter id. Board.zone is a one-based spatial
  // sector and must never decide which enemies lock a terminal.
  const enemyRoom = (b, x) => Number.isInteger(x.decksRoom) ? x.decksRoom :
    Number.isInteger(x.zone) ? x.zone : b.decks?.room ?? b.completed.length;
  const roomAlive = (b, room = b.decks?.room ?? b.completed.length) => alive(b).filter(x => enemyRoom(b, x) === room);
  const continuation = new WeakMap();
  const tier = e => e?.finale?.phase === 'maze' ? 4 : !e?.finale && e?.stage >= 0 && e.stage < 4 ? e.stage : -1;
  const active = e => !!e?.board?.cells && !e.crash && tier(e) >= 0;
  const special = kind => ['rocketeer', 'ninja', 'robodog'].includes(kind);
  const definitions = {
    rocketeer: { name: 'Ракетчик', hp: 94, speed: 3, range: 16, cool: 3.7, damage: 14, color: '#ffae64' },
    ninja: { name: 'Ниндзя', hp: 84, speed: 5.3, range: 8, cool: 2.7, damage: 10, color: '#c3a0ff' },
    robodog: { name: 'Робособака', hp: 78, speed: 6, range: 3.8, cool: 1.8, damage: 8, color: '#8dddaf' },
  };
  for (const [kind, info] of Object.entries(definitions)) CITADEL_DRONES[kind] = { ...info };
  const tables = [
    { initial: [5, 5, 5], waves: [[], [], []], cap: 5, damage: [1, 1, 1] },
    { initial: [6, 7, 8], waves: [[2], [2], [3]], cap: 9, damage: [1.08, 1.18, 1.28] },
    { initial: [7, 8, 9], waves: [[3], [3, 2], [3, 3]], cap: 11, damage: [1.24, 1.36, 1.48] },
    { initial: [8, 9, 10], waves: [[3, 2], [3, 3], [4, 3]], cap: 12, damage: [1.42, 1.56, 1.70] },
    { initial: [8, 9, 10], waves: [[3, 2], [4, 3], [4, 3, 2]], cap: 12, damage: [1.50, 1.70, 1.90] },
  ];
  function profile(e, room = e?.board?.completed?.length || 0) {
    if (globalThis.CITADEL_BASES?.modern(e?.board)) return CITADEL_BASES.profile(e, Math.min(2, room));
    const t = tier(e), r = clamp(room, 0, 2), p = tables[t];
    if (!p) return null;
    const easier = !!e.assist && t > 0;
    return { tier: t, level: t === 4 ? 13 : t * 3 + 2, room: r, tutorial: t === 0,
      initial: p.initial[r] - (easier ? 2 : 0), cap: easier ? Math.min(9, p.cap) : p.cap,
      waves: p.waves[r].map(n => easier ? Math.max(1, Math.ceil(n * .67)) : n),
      damage: p.damage[r], hp: t ? (1 + .09 * (t - 1) + .04 * r) * (easier ? .88 : 1) : 1,
      warning: easier ? 2.5 : 2.1 };
  }
  const cue = (e, text, kind, anchor) => e.emit('comic', { text, kind, anchor: anchor.slice() });
  function log(s, event) {
    s.events.push({ clock: s.clock, room: s.room, ...event });
    if (s.events.length > 32) s.events.shift();
  }
  function roster(p, count, wave = -1) {
    if (wave === 0) {
      const pursuit = p.tier === 1 ? ['scout', 'rocketeer', 'ninja'] : ['scout', 'rocketeer', 'ninja', 'robodog'];
      return Array.from({ length: count }, (_, i) => pursuit[i % pursuit.length]);
    }
    const kinds = p.tier === 1 ? ['scout', 'rocketeer', 'shield', 'hunter', 'scout', 'relay', 'ninja']
      : ['scout', 'rocketeer', 'ninja', 'shield', 'robodog', 'relay', 'hunter', 'scout', 'ninja', 'rocketeer'];
    const offset = wave < 0 ? 0 : 1 + wave * 2;
    return Array.from({ length: count }, (_, i) => kinds[(i + offset) % kinds.length]);
  }
  function roomState(e, s, legacy = false) {
    const b = e.board, p = profile(e);
    s.room = b.completed.length; s.enteredAt = null; s.roomClock = 0;
    s.grace = legacy ? 3 : .2; s.closed = s.room >= 3;
    s.watch = {}; s.recoveries = []; s.terminalNotice = 0;
    s.rockets = []; s.blasts = [];
    s.waves = s.closed || p.tutorial ? [] : p.waves.map((n, i) => ({
      id: s.room + ':' + i, index: i, side: i % 2 ? 'flank' : 'rear',
      phase: 'waiting', remaining: roster(p, n, i), delay: i === 0 ? 0 : i === 1 ? 6.6 : 13.2,
      timer: 0, ownerId: null, positions: [], attempts: 0, readyFor: 0,
    }));
    log(s, { kind: legacy ? 'restore-legacy' : 'room', initial: roomAlive(b, s.room).length });
  }
  function ensure(e, fresh = false) {
    if (!active(e)) return null;
    const b = e.board;
    let s = b.decks;
    if (!s || !Number.isFinite(s.clock) || !Array.isArray(s.waves)) {
      s = b.decks = { version: VERSION, clock: 0, room: -1, roomClock: 0, enteredAt: null,
        trail: [b.pos.slice()], trailClock: 0, spawned: 0, wavesLanded: 0, cancelled: 0,
        hits: 0, damageTaken: 0, serial: 0, reinforcementAttacks: 0, attacksByRoom: [0, 0, 0],
        reinforcementHits: 0, engagementByRoom: [0, 0, 0],
        events: [], rockets: [], blasts: [], waves: [], contactCooldown: 0,
        contactHits: 0, recovered: 0, watch: {}, recoveries: [], terminalNotice: 0 };
      roomState(e, s, !fresh);
    } else {
      // 1.9.0 already serializes a finite queue. Upgrading must not refill a
      // completed or partly spawned wave, including inside an open card.
      s.version = VERSION;
      for (const key of ['contactCooldown', 'contactHits', 'recovered', 'terminalNotice']) if (!Number.isFinite(s[key])) s[key] = 0;
      if (!s.watch || typeof s.watch !== 'object') s.watch = {};
      if (!Array.isArray(s.recoveries)) s.recoveries = [];
      if (s.room !== b.completed.length && e.status === 'boarding') roomState(e, s);
    }
    return s;
  }
  function clearance(e) {
    if (!active(e)) return { active: false, ready: true, remaining: 0, alive: 0, pending: 0, text: '' };
    const b = e.board, s = b.decks, onCard = ['remark', 'finalcheck'].includes(e.status);
    const room = onCard && Number.isInteger(s?.room) ? s.room : b.completed.length;
    if (room >= 3) return { active: true, room: 3, ready: true, remaining: 0, alive: 0, pending: 0, text: 'Комнаты зачищены · к выходу' };
    const current = roomAlive(b, room).length;
    const pending = s?.room === room && Array.isArray(s.waves) ? s.waves.reduce((n, w) =>
      n + (['done', 'cancelled'].includes(w.phase) ? 0 : w.remaining.length), 0) : profile(e, room).waves.reduce((n, x) => n + x, 0);
    const remaining = current + pending;
    return { active: true, room, ready: remaining === 0, remaining, alive: current, pending,
      text: remaining ? 'Зачистите комнату · осталось ' + remaining : 'Комната зачищена · терминал открыт',
      detail: pending ? 'В комнате: ' + current + ' · подкрепление: ' + pending : 'В комнате: ' + current };
  }
  function closeRoom(e) {
    const s = e.board?.decks;
    if (!s || s.closed) return;
    s.closed = true; s.rockets = []; s.blasts = []; s.recoveries = [];
    log(s, { kind: 'terminal', survivors: roomAlive(e.board, s.room).length, pending: clearance(e).pending });
  }
  function candidates(b, center, minimum, maximum) {
    return Array.from(b.nav.values()).filter(n => dist(n.pos, center) >= minimum &&
      dist(n.pos, center) <= maximum && stationWalkable(b, n.pos, .72));
  }
  function positions(e, center, count, initial = false, preview = false) {
    const b = e.board, used = [], enemies = alive(b), minimum = preview ? 1.5 : initial ? 6 : 8;
    const nodes = candidates(b, center, 0, preview ? 4.5 : initial ? 13 : 10).filter(n => dist(n.pos, b.pos) >= minimum);
    // Stable navigation positions make a saved warning refer to the same actual
    // entrance. No random fallback is allowed to place an enemy on the player.
    nodes.sort((a, z) => dist(a.pos, center) - dist(z.pos, center));
    for (const n of nodes) {
      if (used.some(p => dist(p, n.pos) < 2.2) || enemies.some(x => dist(x.pos, n.pos) < 1.6)) continue;
      used.push(n.pos.slice()); if (used.length >= count) break;
    }
    return used;
  }
  function reachableSpots(e, center, count, ignoreId = null) {
    const b = e.board, used = [], enemies = alive(b);
    const nodes = Array.from(b.nav.values()).filter(n => dist(n.pos, b.pos) >= 8 &&
      stationWalkable(b, n.pos, .72) && !enemies.some(x => x.id !== ignoreId && dist(x.pos, n.pos) < 1.8));
    nodes.sort((a, z) => dist(a.pos, center) - dist(z.pos, center));
    for (const n of nodes) {
      if (used.some(p => dist(p, n.pos) < 2.2)) continue;
      if (!stationLine(b, b.pos, n.pos, .68, true) && !stationPath(b, b.pos, n.pos).length) continue;
      used.push(n.pos.slice()); if (used.length >= count) break;
    }
    return used;
  }
  function spawn(e, kind, pos, initial = false) {
    const b = e.board, s = ensure(e), p = profile(e), info = CITADEL_DRONES[kind];
    if (roomAlive(b, s.room).length >= p.cap || !point(pos) || !stationWalkable(b, pos, .7)) return false;
    const maxHp = Math.round(info.hp * p.hp), x = {
      ...info, archetype: kind, id: ++e.entityId, pos: pos.slice(), hp: maxHp, maxHp,
      shot: initial ? 1 + e.random() * .65 : .25 + e.random() * .2, hit: 0, phase: e.random() * 6.28, dead: false,
      zone: b.completed.length, decksRoom: b.completed.length, alert: !initial, lastSeen: initial ? null : b.pos.slice(),
      route: [], repath: 0, stun: 0, charge: 0, aim: null, yaw: 0, heal: 0,
      signal: initial ? 'Патруль' : 'Подкрепление', strafe: e.entityId % 2 ? 1 : -1,
      decksCombat: true, decksDamage: p.damage, decksArrival: initial ? 0 : e.assist ? .55 : .4,
      decksAttack: null, decksCalling: null,
    };
    b.enemies.push(x); s.spawned++;
    log(s, { kind: initial ? 'spawn-initial' : 'spawn-reinforcement', enemy: x.id,
      archetype: kind, pos: pos.slice(), player: b.pos.slice(), distance: dist(pos, b.pos) });
    return true;
  }
  proto.spawnBoardWave = function (count) {
    const carried = continuation.get(this);
    if (carried && this.board === carried.board) for (const x of carried.enemies) {
      if (!this.board.enemies.some(y => y.id === x.id)) this.board.enemies.push(x);
    }
    if (active(this) && CITADEL_BASES.modern(this.board)) {
      CITADEL_BASES.populate(this); ensure(this, true);
      this.board.returning = this.board.completed.length >= 3; this.board.guideRoute = null;
      return;
    }
    if (!active(this) || tier(this) === 0) {
      const existing = active(this) ? roomAlive(this.board, this.board.completed.length).length : 0;
      const result = original.spawn.call(this, Math.max(0, count - existing));
      if (active(this)) ensure(this, true);
      return result;
    }
    const b = this.board, s = ensure(this, true);
    if (b.completed.length >= 3) return;
    if (s.closed) roomState(this, s);
    const p = profile(this), kinds = roster(p, Math.max(0, p.initial - roomAlive(b, s.room).length)), center = b.definition.centers[s.room];
    const spots = positions(this, center, kinds.length, true);
    kinds.forEach((kind, i) => { if (spots[i]) spawn(this, kind, spots[i], true); });
    b.returning = false; b.guideRoute = null;
  };
  function rearAnchor(e, s) {
    const b = e.board;
    for (let i = s.trail.length - 1; i >= 0; i--) {
      const p = s.trail[i], d = dist(p, b.pos);
      if (d >= 10 && d <= 20 && stationNearestNode(b, p)) return p;
    }
    const start = b.completed.length ? b.terminals[b.completed.length - 1] : b.definition.spawn;
    const route = stationPath(b, b.pos, start);
    return route.find(p => dist(p, b.pos) >= 11) || start;
  }
  function startSignal(e, s, wave, again = false) {
    const b = e.board, p = profile(e);
    let center = wave.side === 'rear' ? rearAnchor(e, s) : b.definition.centers[Math.min(2, s.room)], preview = false;
    if (wave.side === 'rear' && !again && V3.len(b.velocity || [0, 0, 0]) > 2) {
      // Mark the doorway the hero is about to cross. When its warning expires,
      // ordinary walking leaves it 8–14 m behind, within the pursuers' range.
      // Marking an entrance already 10 m behind would put it 24 m away two
      // seconds later, leaving the entire reinforcement wave out of the fight.
      const route = stationPath(b, b.pos, b.terminals[Math.min(2, s.room)]);
      let previous = b.pos, left = 3.4;
      for (const next of route) {
        const length = dist(previous, next);
        if (length >= left) { center = V3.lerp(previous, next, left / Math.max(.001, length)); preview = true; break; }
        left -= length; previous = next;
      }
    }
    wave.positions = positions(e, center, wave.remaining.length, false, preview);
    // A blocked doorway may postpone its wave, but must not leave a finite
    // terminal objective waiting forever. Every alternative gets a new tell.
    if (!wave.positions.length || again && wave.attempts >= 2)
      wave.positions = reachableSpots(e, center, wave.remaining.length);
    if (!wave.positions.length) { wave.retry = .6; return false; }
    wave.phase = 'signal'; wave.timer = again ? Math.max(1.8, p.warning) : p.warning;
    wave.readyFor = 0; wave.attempts++;
    if (!again && wave.index > 0) {
      const relay = roomAlive(b, s.room).find(x => x.archetype === 'relay' && !x.stun);
      if (relay) { wave.ownerId = relay.id; relay.decksCalling = wave.id; }
    }
    const calling = wave.ownerId !== null;
    const text = calling ? 'ВЫЗОВ ПОДКРЕПЛЕНИЯ!' : wave.side === 'rear' ? 'ПОДКРЕПЛЕНИЕ СЗАДИ!' : 'ПОДКРЕПЛЕНИЕ С ФЛАНГА!';
    cue(e, text, 'warning', wave.positions[0]);
    e.say(calling ? 'Ретранслятор вызывает отряд. Сбей его или прерви вызов импульсом.'
      : wave.side === 'rear' ? 'Проходишь шлюз подкрепления. Сейчас отряд зайдёт тебе за спину.'
        : 'Боковой шлюз открывается. Подкрепление на подходе.', 'alert', true);
    log(s, { kind: 'warning', wave: wave.id, side: wave.side, duration: wave.timer,
      positions: wave.positions.map(p => p.slice()), caller: wave.ownerId });
    return true;
  }
  function cancelCall(e, s, wave) {
    const caller = e.board.enemies.find(x => x.id === wave.ownerId);
    if (caller) caller.decksCalling = null;
    wave.phase = 'cancelled'; wave.remaining = []; s.cancelled++;
    cue(e, 'ВЫЗОВ ПРЕРВАН!', 'action', caller?.pos || e.board.pos);
    log(s, { kind: 'call-cancelled', wave: wave.id });
  }
  function tickWaves(e, s, dt) {
    const b = e.board, p = profile(e);
    s.clock += dt; s.roomClock += dt; s.grace = Math.max(0, s.grace - dt);
    s.contactCooldown = Math.max(0, s.contactCooldown - dt);
    s.terminalNotice = Math.max(0, s.terminalNotice - dt);
    s.trailClock += dt;
    if (s.trailClock >= .45) {
      s.trailClock = 0;
      if (dist(s.trail[s.trail.length - 1], b.pos) > .6) s.trail.push(b.pos.slice());
      if (s.trail.length > 70) s.trail.shift();
    }
    if (s.closed || p.tutorial || s.room >= 3) return;
    const center = b.definition.centers[s.room];
    if (s.enteredAt === null && !s.grace && (b.zone >= s.room + 1 || dist(b.pos, center) < 32 || !roomAlive(b, s.room).length)) {
      s.enteredAt = s.clock; log(s, { kind: 'zone-entry', zone: b.zone });
    }
    if (s.enteredAt === null) return;
    for (const wave of s.waves) {
      if (['done', 'cancelled'].includes(wave.phase)) continue;
      wave.retry = Math.max(0, (wave.retry || 0) - dt);
      if (wave.phase === 'waiting') {
        if (s.clock - s.enteredAt >= wave.delay && !wave.retry) startSignal(e, s, wave);
        continue;
      }
      if (wave.ownerId !== null) {
        const caller = alive(b).find(x => x.id === wave.ownerId);
        if (!caller || caller.stun > 0) { cancelCall(e, s, wave); continue; }
      }
      if (wave.phase === 'signal') {
        wave.timer = Math.max(0, wave.timer - dt);
        if (wave.timer > 0) continue;
        wave.phase = 'ready';
      }
      wave.readyFor += dt;
      if (roomAlive(b, s.room).length >= p.cap) continue;
      if (wave.readyFor > 2.5) { startSignal(e, s, wave, true); continue; }
      let n = 0;
      for (const pos of wave.positions) {
        if (!wave.remaining.length || roomAlive(b, s.room).length >= p.cap) break;
        if (dist(pos, b.pos) < 8 || !stationWalkable(b, pos, .7) || alive(b).some(x => dist(x.pos, pos) < 1.5)) continue;
        if (spawn(e, wave.remaining[0], pos)) {
          b.enemies[b.enemies.length - 1].decksWave = wave.id;
          wave.remaining.shift(); n++;
        }
      }
      if (n) {
        s.wavesLanded++; e.emit('gate');
        log(s, { kind: 'wave-landed', wave: wave.id, count: n, alive: roomAlive(b, s.room).length });
        wave.positions = [];
      }
      if (!wave.remaining.length) {
        wave.phase = 'done';
        const caller = b.enemies.find(x => x.id === wave.ownerId); if (caller) caller.decksCalling = null;
      } else if (!wave.positions.length || wave.positions.every(pos => dist(pos, b.pos) < 8)) {
        startSignal(e, s, wave, true);
      }
    }
  }
  function pointSegmentDistance(p, a, b) {
    const dx = b[0] - a[0], dz = b[2] - a[2], length = dx * dx + dz * dz;
    const t = length > 1e-9 ? clamp(((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / length) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t);
  }
  function noteAttack(e, x, kind) {
    x.decksShots = (x.decksShots || 0) + 1;
    if (!x.decksWave) return;
    const s = ensure(e);
    s.reinforcementAttacks = (s.reinforcementAttacks || 0) + 1;
    if (!s.attacksByRoom) s.attacksByRoom = [0, 0, 0];
    s.attacksByRoom[s.room]++;
    log(s, { kind: 'reinforcement-attack', enemy: x.id, wave: x.decksWave, attack: kind });
  }
  function hurt(e, amount, from, kind) {
    const b = e.board, s = ensure(e);
    if (e.status !== 'boarding' || b.invulnerable > 0 || b.hp <= 0 || !stationLine(b, from, b.pos, .04)) return false;
    const damage = amount * (e.assist ? .65 : 1) * Math.pow(.8, e.upgrades?.armor || 0);
    b.hp = Math.max(0, b.hp - damage); b.invulnerable = .65; e.flash = .18;
    s.hits++; s.damageTaken += damage;
    log(s, { kind: 'hit', attack: kind, damage }); e.emit('damage');
    if (b.hp <= 0) { e.status = 'lost'; e.lossReason = 'Щит исчерпан на палубе Цитадели. Меняй позицию во время подготовки атак.'; e.emit('state', 'lost'); }
    return true;
  }
  function attackStart(e, x, kind) {
    const b = e.board, s = ensure(e), dog = kind === 'pounce';
    const windup = kind === 'rocket' ? (e.assist ? 1.65 : 1.3) : dog ? (e.assist ? .9 : .65) : (e.assist ? 1.25 : 1.0);
    const aim = b.pos.slice(), direction = V3.norm(V3.sub(aim, x.pos));
    x.decksAttack = { id: ++s.serial, kind, phase: 'windup', time: 0, windup,
      aim, origin: x.pos.slice(), direction, hit: false, damage: x.damage * (x.decksDamage || profile(e).damage),
      radius: kind === 'rocket' ? 3.2 : dog ? 1.15 : 1.3,
      duration: dog ? .34 : .52, recovery: dog ? .95 : .8 };
    x.route = []; x.shot = x.cool;
    x.signal = kind === 'rocket' ? 'Наводит ракету' : dog ? 'Готовит прыжок' : 'Готовит рывок';
    // Only discrete attack starts emit comics; the visible tell itself is drawn
    // every frame and remains present with decorative effects disabled.
    if (kind === 'rocket' || kind === 'dash') cue(e, kind === 'rocket' ? 'РАКЕТА — УХОДИ ИЗ КРУГА!' : 'РЫВОК — ШАГ В СТОРОНУ!', 'warning', aim);
    log(s, { kind: 'attack-start', enemy: x.id, attack: kind, windup, aim: aim.slice() });
  }
  function attackStep(e, x, dt) {
    const b = e.board, s = ensure(e), a = x.decksAttack;
    a.time += dt;
    if (a.phase === 'windup') {
      if (a.time < a.windup) return;
      a.time = 0;
      if (a.kind === 'rocket') {
        const delta = V3.sub(a.aim, x.pos), length = V3.len(delta);
        if (length > .1) s.rockets.push({ id: a.id, owner: x.id, pos: x.pos.slice(), previous: x.pos.slice(),
          aim: a.aim.slice(), vel: V3.scale(V3.norm(delta), 12), life: 4.5,
          radius: a.radius, damage: a.damage, color: x.color });
        noteAttack(e, x, 'rocket'); e.emit('missile'); a.phase = 'recover';
      } else { a.phase = 'strike'; noteAttack(e, x, a.kind); e.emit('enemy-fire'); }
      return;
    }
    if (a.phase === 'recover') {
      if (a.time >= a.recovery) x.decksAttack = null;
      return;
    }
    const before = x.pos.slice(), speed = a.kind === 'pounce' ? 13 : 19;
    e.boardMove(x, V3.scale(a.direction, speed * dt), .65);
    x.yaw = Math.atan2(a.direction[0], a.direction[2]);
    if (!a.hit) {
      // Relative motion catches a dash crossing the player between two frames.
      const oldPlayer = b.previous || b.pos;
      const relativeStart = V3.sub(before, oldPlayer), relativeEnd = V3.sub(x.pos, b.pos);
      if (pointSegmentDistance([0, 0, 0], relativeStart, relativeEnd) <= a.radius &&
          hurt(e, a.damage, x.pos, a.kind)) a.hit = true;
    }
    if (a.time >= a.duration || dist(before, x.pos) < .002) { a.phase = 'recover'; a.time = 0; }
  }
  function specialStep(e, x, dt) {
    const b = e.board;
    x.hit = Math.max(0, x.hit - dt); x.stun = Math.max(0, x.stun - dt); x.heal = 0;
    if (x.dead) return;
    if (x.stun > 0) { x.decksAttack = null; x.signal = 'Оглушён'; return; }
    if (x.decksArrival > 0) { x.decksArrival = Math.max(0, x.decksArrival - dt); return; }
    const delta = V3.sub(b.pos, x.pos), distance = V3.len(delta), sees = distance < 30 && e.boardLOS(x.pos, b.pos);
    if (sees || distance < 24 && b.firing) { x.alert = true; x.lastSeen = b.pos.slice(); x.memory = 6; }
    x.memory = Math.max(0, (x.memory || 0) - dt);
    if (!x.alert) { x.signal = 'Патруль'; return; }
    if (x.decksAttack) { attackStep(e, x, dt); return; }
    x.shot = Math.max(0, x.shot - dt); x.yaw = Math.atan2(delta[0], delta[2]);
    if (!sees && !x.memory) { x.signal = 'Ищет цель'; if (x.lastSeen) e.boardMoveToward(x, x.lastSeen, dt, x.speed * .7); return; }
    const dog = x.archetype === 'robodog', rocket = x.archetype === 'rocketeer', range = rocket ? 24 : dog ? 3.8 : 8.5;
    if (sees && distance <= range && x.shot <= 0) { attackStart(e, x, rocket ? 'rocket' : dog ? 'pounce' : 'dash'); return; }
    let goal = b.pos.slice(), move = true;
    const direction = V3.norm(delta), side = [-direction[2], 0, direction[0]];
    if (rocket) {
      x.signal = 'Держит дистанцию';
      if (distance >= 11 && distance <= 21 && sees) move = false;
      else if (distance < 11) {
        const retreat = V3.sub(b.pos, V3.scale(direction, 15));
        if (stationWalkable(b, retreat, .7, true)) goal = retreat;
      }
    } else {
      x.signal = dog ? 'Обходит сбоку' : 'Сближается';
      const flank = V3.add(b.pos, V3.scale(side, x.strafe * (dog ? 2.4 : 1.3)));
      if (distance > (dog ? 5 : 10) && stationWalkable(b, flank, .7, true)) goal = flank;
      if (distance < 2.2 && x.shot > 0) move = false;
    }
    if (move) e.boardMoveToward(x, goal, dt, x.speed * (e.assist ? .85 : 1));
  }
  proto.enemyBoardStep = function (x, dt) {
    if (active(this) && CITADEL_BASES.modern(this.board)) return CITADEL_BASES.enemy(this, x, dt, specialStep);
    if (active(this) && enemyRoom(this.board, x) > this.board.completed.length) return;
    if (active(this) && x.decksRecovering) return;
    if (active(this) && tier(this) === 0 && x.decksArrival > 0) { x.decksArrival = Math.max(0, x.decksArrival - dt); return; }
    if (!active(this) || tier(this) === 0) return original.enemy.call(this, x, dt);
    const b = this.board;
    if (special(x.archetype)) return specialStep(this, x, dt);
    if (x.decksArrival > 0) { x.decksArrival = Math.max(0, x.decksArrival - dt); return; }
    if (x.decksCalling && !x.stun && !x.dead) {
      x.signal = 'Вызывает подкрепление'; x.hit = Math.max(0, x.hit - dt); return;
    }
    const before = b.hostile.length, result = original.enemy.call(this, x, dt);
    if (b.hostile.length > before) noteAttack(this, x, 'shot');
    for (let i = before; i < b.hostile.length; i++) if (!b.hostile[i].decksScaled) {
      b.hostile[i].damage *= x.decksDamage || profile(this).damage;
      b.hostile[i].decksScaled = true; b.hostile[i].owner = x.id;
    }
    return result;
  };
  proto.boardMoveToward = function (x) {
    if (active(this) && this.board.decks && enemyRoom(this.board, x) === this.board.decks.room) {
      const s = this.board.decks;
      const watch = s.watch[x.id] || (s.watch[x.id] = { pos: x.pos.slice(), hidden: 0, blocked: 0, still: 0, invalid: 0 });
      watch.tried = true;
    }
    return original.moveToward.apply(this, arguments);
  };
  function tickRecovery(e, s, dt) {
    if (CITADEL_BASES.modern(e.board)) return; // New crews re-path physically; never teleport.
    const b = e.board;
    if (s.closed || s.room >= 3) return;
    for (const recovery of s.recoveries) {
      recovery.timer = Math.max(0, recovery.timer - dt);
      const x = roomAlive(b, s.room).find(x => x.id === recovery.enemy);
      if (!x) { recovery.done = true; continue; }
      if (recovery.timer) continue;
      if (dist(recovery.pos, b.pos) < 8 || !stationWalkable(b, recovery.pos, .72) ||
          alive(b).some(y => y.id !== x.id && dist(y.pos, recovery.pos) < 1.8)) {
        const spot = reachableSpots(e, b.pos, 1, x.id)[0];
        if (spot) { recovery.pos = spot; recovery.timer = 2.1; cue(e, 'ПАТРУЛЬ МЕНЯЕТ ПОЗИЦИЮ!', 'warning', spot); }
        continue;
      }
      x.pos = recovery.pos.slice(); x.route = []; x.repath = 0; x.decksAttack = null;
      x.charge = 0; x.aim = null; x.decksRecovering = false; x.decksArrival = 1.1;
      x.shot = Math.max(x.shot || 0, 1.1); x.alert = true; x.lastSeen = b.pos.slice(); x.memory = 6;
      delete s.watch[x.id]; recovery.done = true; s.recovered++;
      log(s, { kind: 'enemy-repositioned', enemy: x.id, hp: x.hp, pos: x.pos.slice(), distance: dist(x.pos, b.pos) });
      cue(e, 'ПАТРУЛЬ ВЕРНУЛСЯ В БОЙ!', 'action', x.pos);
    }
    s.recoveries = s.recoveries.filter(x => !x.done);
    s.watchClock = (s.watchClock || 0) + dt;
    if (s.watchClock < .5) return;
    const elapsed = s.watchClock; s.watchClock = 0;
    const enemies = roomAlive(b, s.room);
    for (const x of enemies) {
      if (x.decksRecovering) continue;
      const w = s.watch[x.id] || (s.watch[x.id] = { pos: x.pos.slice(), hidden: 0, blocked: 0, still: 0, invalid: 0 });
      const valid = point(x.pos) && stationWalkable(b, x.pos, .55, true);
      const seen = valid && stationLine(b, x.pos, b.pos, .12, true);
      const resting = x.stun > 0 || x.decksArrival > 0 || x.decksAttack || x.decksCalling || x.charge > 0;
      const moved = point(w.pos) && point(x.pos) ? dist(w.pos, x.pos) : 0;
      w.hidden = seen ? 0 : w.hidden + elapsed;
      w.invalid = valid ? 0 : w.invalid + elapsed;
      w.still = !seen && !resting && w.tried && moved < .08 ? w.still + elapsed : 0;
      if (!seen && !resting && w.hidden >= 4) {
        const path = valid ? stationPath(b, x.pos, b.pos) : [];
        w.blocked = path.length ? 0 : w.blocked + elapsed;
        // Pull remaining guards back toward the fight before considering a
        // recovery. A sniper holding a useful line of fire is never moved.
        x.alert = true; x.lastSeen = b.pos.slice(); x.memory = 6;
        if (w.still >= 3) { x.route = []; x.repath = 0; }
      } else w.blocked = 0;
      w.tried = false; w.pos = x.pos.slice();
      if (Math.max(w.invalid, w.blocked, w.still) < 7.5 || resting) continue;
      const spot = reachableSpots(e, b.pos, 1, x.id)[0];
      if (!spot) continue;
      s.recoveries.push({ enemy: x.id, pos: spot, timer: 2.1 });
      x.decksRecovering = true; x.decksAttack = null; x.route = [];
      cue(e, 'ПАТРУЛЬ МЕНЯЕТ ПОЗИЦИЮ!', 'warning', spot);
      e.say('Патруль ищет обход. Следи за отмеченным шлюзом: противник вернётся в бой.', 'alert', true);
      log(s, { kind: 'recovery-warning', enemy: x.id, duration: 2.1, hp: x.hp, pos: spot.slice() });
    }
    const liveIds = new Set(enemies.map(x => String(x.id)));
    for (const id of Object.keys(s.watch)) if (!liveIds.has(id)) delete s.watch[id];
  }
  function tickContact(e, s) {
    if (s.contactCooldown > 0) return;
    const x = alive(e.board).find(x => enemyRoom(e.board, x) <= s.room && !x.decksRecovering &&
      !(x.decksArrival > 0) && dist(x.pos, e.board.pos) < 1.18);
    if (x && hurt(e, 3, x.pos, 'contact')) { s.contactCooldown = .9; s.contactHits++; }
  }
  function explode(e, s, rocket, pos) {
    rocket.life = 0;
    s.blasts.push({ pos: pos.slice(), radius: rocket.radius, life: .45, max: .45, color: rocket.color });
    e.emit('detonate');
    if (dist(pos, e.board.pos) <= rocket.radius) hurt(e, rocket.damage, pos, 'rocket');
  }
  function tickRockets(e, s, dt) {
    const b = e.board;
    for (const blast of s.blasts) blast.life -= dt;
    s.blasts = s.blasts.filter(x => x.life > 0);
    for (const rocket of s.rockets) {
      if (rocket.life <= 0) continue;
      const before = rocket.pos.slice(), next = V3.add(before, V3.scale(rocket.vel, dt));
      rocket.previous = before; rocket.life -= dt;
      if (!stationLine(b, before, next, .12)) { explode(e, s, rocket, before); continue; }
      if (dist(before, rocket.aim) <= 12 * dt + .15) { rocket.pos = rocket.aim.slice(); explode(e, s, rocket, rocket.pos); continue; }
      rocket.pos = next;
      if (pointSegmentDistance(b.pos, before, next) < .85) { explode(e, s, rocket, next); continue; }
    }
    s.rockets = s.rockets.filter(x => x.life > 0);
  }
  proto.stepBoard = function (dt, input) {
    if (!active(this)) return original.step.call(this, dt, input);
    if (this.status !== 'boarding') return;
    const b = this.board, s = ensure(this);
    const modern = CITADEL_BASES.modern(b);
    const result = original.step.call(this, dt, modern ? CITADEL_BASES.before(this, dt, input) : input);
    if (modern && this.board === b) CITADEL_BASES.after(this, dt);
    if (this.board !== b || this.status !== 'boarding' || !active(this)) return result;
    tickWaves(this, s, dt); tickRockets(this, s, dt); tickRecovery(this, s, dt); tickContact(this, s);
    return result;
  };
  proto.boardInteract = function () {
    if (!active(this)) return original.interact.apply(this, arguments);
    // The frozen maze implementation lacks this guard. Repeated direct input
    // on a paused game or an answered card must not open/reset its question.
    if (this.status !== 'boarding') return false;
    const b = this.board, s = ensure(this), gate = clearance(this);
    if (!gate.ready) {
      const terminal = b.terminals[b.completed.length];
      if (terminal && dist(b.pos, terminal) < 4 && !s.terminalNotice) {
        this.say(gate.text + (gate.pending ? '. На подходе подкрепление: ' + gate.pending + '.' : '.'), 'order', true);
        s.terminalNotice = 5;
      }
      return false;
    }
    const result = original.interact.apply(this, arguments);
    if (this.board === b && ['remark', 'finalcheck'].includes(this.status)) closeRoom(this);
    return result;
  };
  for (const [key, base] of [['continueRemark', original.continue], ['continueFinaleCheck', original.finalContinue]]) {
    if (typeof base !== 'function') continue;
    proto[key] = function () {
      const b = this.board, isDeck = active(this), correct = key === 'continueRemark'
        ? this.status === 'remark' && b?.answered && this.remarkFeedback?.correct
        : this.status === 'finalcheck' && Number.isInteger(this.finale?.answer) &&
          this.finale.answer === FINALE_TRIALS[b.completed.length]?.correct;
      // The core clears its enemy array on a correct answer. Normally the gate
      // has made it empty; preserve future-room and grandfathered saved guards
      // as the very same objects, without killing, rewards, or duplicate waves.
      if (isDeck && correct) continuation.set(this, { board: b, enemies: alive(b) });
      let result;
      try { result = base.apply(this, arguments); }
      finally {
        const carried = continuation.get(this);
        if (carried && this.board === b) for (const x of carried.enemies) {
          if (!b.enemies.some(y => y.id === x.id)) b.enemies.push(x);
        }
        continuation.delete(this);
      }
      if (active(this) && this.status === 'boarding') {
        const s = ensure(this); if (this.board.completed.length >= 3) closeRoom(this);
        else if (s.closed) roomState(this, s);
      }
      return result;
    };
  }
  proto.boardPulse = function () {
    const isDeck = active(this), b = this.board;
    const result = original.pulse.apply(this, arguments);
    if (!isDeck || !result || !b.decks) return result;
    const s = b.decks;
    s.rockets = s.rockets.filter(x => dist(x.pos, b.pos) > 12);
    for (const x of b.enemies) if (x.stun > 0) x.decksAttack = null;
    for (const wave of s.waves) if (['signal', 'ready'].includes(wave.phase) && wave.ownerId !== null) {
      const caller = b.enemies.find(x => x.id === wave.ownerId);
      if (!caller || caller.dead || caller.stun > 0) cancelCall(this, s, wave);
    }
    return result;
  };
  proto.boardHit = function (x) {
    const wasAlive = !x.dead, hp = x.hp, result = original.hit.apply(this, arguments);
    if (active(this) && wasAlive && x.decksWave && x.hp < hp) {
      const s = ensure(this);
      s.reinforcementHits = (s.reinforcementHits || 0) + 1;
      if (!s.engagementByRoom) s.engagementByRoom = [0, 0, 0];
      s.engagementByRoom[s.room]++;
    }
    if (active(this) && wasAlive && x.dead) {
      x.decksAttack = null;
      const s = this.board.decks;
      if (s) for (const wave of s.waves) if (wave.ownerId === x.id && ['signal', 'ready'].includes(wave.phase)) cancelCall(this, s, wave);
    }
    return result;
  };
  proto.objective = function () {
    const result = original.objective.apply(this, arguments);
    if (!active(this) || !(this.status === 'boarding' || this.status === 'paused' && this.resumeStatus === 'boarding') ||
        this.board.completed.length >= 3) return result;
    const gate = clearance(this);
    if (CITADEL_BASES.modern(this.board)) return { ...result, title: gate.ready ? 'Сектор защищён · терминал открыт' : 'Пройдите охрану сектора '+(gate.room+1),
      detail: gate.ready ? 'Подойдите к подсвеченной консоли. Следующий шлюз откроется после разбора.' :
        'Патрули обходят блок. Укрывайтесь за оборудованием; по тревоге резерв выйдет из бокового шлюза. E — импульс, Shift — бег.',
      progress: 'СЕКТОР '+(gate.room+1)+' / 3 · ОХРАНА '+gate.alive };
    return { ...result, title: gate.text,
      detail: gate.ready ? 'Подойди к подсвеченному терминалу ' + (gate.room + 1) + ': откроется разбор.'
        : 'Уничтожь патруль этой комнаты.' + (gate.pending ? ' Дождись отмеченного подкрепления или прерви вызов ретранслятора.' : '') +
          ' Двигайся и стреляй; импульс оглушает ближних врагов.',
      progress: 'КОМНАТА ' + (gate.room + 1) + ' / 3 · ВРАГОВ ' + gate.alive + (gate.pending ? ' · ПОДКРЕПЛЕНИЕ ' + gate.pending : '') };
  };
  proto.say = function (text) {
    const values = Array.from(arguments);
    if (active(this) && typeof text === 'string') values[0] = text.replace(
      'Терминал запускается сам при подходе.', 'Сначала зачисти комнату, затем подойди к терминалу.');
    return original.say.apply(this, values);
  };
  for (const [key, base] of [['beginBoarding', original.begin], ['beginLair', original.lair]]) {
    if (typeof base !== 'function') continue;
    proto[key] = function () {
      const result = base.apply(this, arguments);
      if (active(this) && this.status === 'boarding' && !(key === 'beginBoarding' && tier(this) === 4))
        this.say(CITADEL_BASES.modern(this.board) ? 'Высадка выполнена. Осмотри сектор: два пути вокруг центрального блока, охрана на постах. Резерв выходит через боковой шлюз по тревоге. Зачисти сектор и подойди к терминалу. G — проводник.' : tier(this) === 0 ? 'Высадка выполнена. Сначала уничтожь патруль комнаты. Затем подойди к терминалу: он откроет разбор. Двигайся, стреляй и используй импульс вблизи.'
          : 'Терминал откроется после зачистки комнаты и её подкреплений. Следи за шлюзами, двигайся и прерывай вызовы ретранслятора.', 'order', true);
      return result;
    };
  }
  // Two additional corridor stretches give the last three rooms room to breathe
  // and let their scheduled reinforcements enter before an ordinary walk ends.
  // Existing saved mazes retain their saved geometry and player position.
  function extendMaze(b) {
    const old = b.cells, cellZ = z => z <= -27 ? z - 14 : z <= -14 ? z - 6 : z;
    const worldZ = z => z < -104 ? z - 56 : z < -52 ? z - 24 : z;
    const p = a => [a[0], a[1], worldZ(a[2])], cells = new Map();
    for (const cell of old.values()) { const z = cellZ(cell.z); cells.set(stationCellKey(cell.x, z), { ...cell, z }); }
    const joins = [];
    for (const [high, low] of [[-13, -14], [-26, -27]]) {
      for (const cell of old.values()) if (cell.z === high && old.has(stationCellKey(cell.x, low))) {
        const near = cellZ(high), far = cellZ(low), zone = old.get(stationCellKey(cell.x, low)).zone;
        for (let z = far + 1; z < near; z++) cells.set(stationCellKey(cell.x, z), { x: cell.x, z, zone });
        joins.push([cell.x, cell.x, far + 1, near - 1, zone]);
      }
    }
    const d = b.definition, rects = [];
    for (const [x0, x1, z0, z1, zone] of d.rects) for (const [lo, hi] of [[-10000, -27], [-26, -14], [-13, 10000]]) {
      const a = Math.max(lo, z0), z = Math.min(hi, z1);
      if (a <= z) rects.push([x0, x1, cellZ(a), cellZ(z), zone]);
    }
    b.cells = cells;
    b.definition = { ...d, rects: rects.concat(joins), spawn: p(d.spawn), terminals: d.terminals.map(p),
      exit: p(d.exit), centers: d.centers.map(p), covers: d.covers.map(([x, z, w, h]) => [x, worldZ(z), w, h]),
      doors: d.doors.map(([x, z, w, h]) => [x, worldZ(z), w, h]), decksVersion: LAYOUT_VERSION, addedLength: 56 };
    const converted = new Set();
    for (const obj of [...b.crates, ...b.props, ...b.doors]) if (!converted.has(obj)) { obj.z = worldZ(obj.z); converted.add(obj); }
    b.bounds = { ...b.bounds, minZ: Math.min(...Array.from(cells.values(), c => c.z)) * 4 - 2 };
    return b;
  }
  stationMakeDeck = function (stage) {
    const authored = CITADEL_BASES.make(stage);
    if (authored) return authored;
    const b = original.make.apply(this, arguments);
    return stage === 4 ? extendMaze(b) : b;
  };
  stationArchitecture = function (stage, b) {
    return original.architecture.call(this, b.definition?.decksVersion === LAYOUT_VERSION || b.definition?.addedLength === 56 ? String(stage) + '-decks190' : stage, b);
  };
  function agent(items, pos, yaw, time, kind, hit, state) {
    const basis = stationYaw(yaw), a = state.decksAttack, dog = kind === 'robodog';
    const crouch = a?.phase === 'windup' && !dog ? .25 : 0;
    const lift = dog && a?.phase === 'strike' ? Math.sin(clamp(a.time / a.duration) * Math.PI) * .6 : 0;
    const model = spaceModel(V3.add(pos, [0, lift - crouch, 0]), [1, 1, 1], basis);
    const color = hit ? '#fff3df' : definitions[kind].color, dark = kind === 'ninja' ? '#252943' : '#354853';
    const part = (mesh, off, size, col, feature, emissive = 0, alpha = 1) => {
      const item = citadelItem(mesh, spacePoint(model, off), size, col, emissive, basis, alpha);
      item.decksRole = kind; item.decksEnemy = state.id; item.decksFeature = feature; items.push(item);
    };
    if (dog) {
      const limb = (from, to, col, feature) => {
        const a = spacePoint(model, from), z = spacePoint(model, to), delta = V3.sub(z, a);
        const item = citadelItem('armor', V3.lerp(a, z, .5), [.12, .12, V3.len(delta) / 2], col, 0, spaceBasisDir(delta));
        item.decksRole = kind; item.decksEnemy = state.id; item.decksFeature = feature; items.push(item);
      };
      part('armor', [0, .91, -.05], [.49, .29, .98], dark, 'dog-body');
      part('armor', [0, 1.14, -.1], [.4, .12, .81], color, 'dog-back');
      part('armor', [0, 1.06, 1.03], [.36, .29, .46], dark, 'dog-head');
      part('box', [0, .9, 1.53], [.29, .13, .27], color, 'dog-muzzle');
      part('box', [0, .95, 1.79], [.24, .12, .045], '#23343e', 'dog-nose');
      for (const side of [-1, 1]) {
        part('octa', [side * .26, 1.48, .98], [.11, .27, .12], color, 'dog-ear');
        part('sphere', [side * .27, 1.2, 1.39], [.075, .065, .06], '#f0f9c8', 'dog-eye', 1);
        for (const end of [-1, 1]) {
          const gait = state.moving ? Math.sin(time * 14 + (side === end ? 0 : Math.PI)) * .19 : 0;
          const hip = [side * .47, .91, end * .7], knee = [side * .86, .48, end * .61 + gait];
          const foot = [side * .96, .12, end * .85 - gait * .7];
          part('sphere', hip, [.19, .2, .19], color, 'dog-hip');
          limb(hip, knee, color, 'dog-leg'); limb(knee, foot, dark, 'dog-shin');
          part('sphere', knee, [.15, .15, .15], '#a8cfbf', 'dog-knee');
          part('box', [foot[0], .07, foot[2] + .1], [.18, .075, .28], color, 'dog-foot');
        }
      }
      limb([0, 1.06, -1.05], [.13 * Math.sin(time * 5), 1.36, -1.6], color, 'dog-tail');
      return;
    }
    const gait = state.moving ? Math.sin(time * 12) * .2 : 0;
    part('armor', [0, 1.38, 0], [kind === 'rocketeer' ? .65 : .46, .6, .34], dark, 'body');
    part('armor', [0, 1.5, .3], [.43, .32, .08], color, 'chest');
    part('sphere', [0, 2.32, 0], [.35, .4, .33], dark, 'head');
    part('box', [0, 2.38, .32], [.29, .075, .045], color, 'visor', 1);
    for (const side of [-1, 1]) {
      part('armor', [side * .3, .48, gait * side], [.19, .49, .21], dark, 'leg');
      part('armor', [side * .62, 1.5, .12], [.18, .4, .19], color, 'arm');
    }
    if (kind === 'rocketeer') {
      part('armor', [0, 1.48, -.58], [.5, .66, .29], '#5b6060', 'rocket-pack');
      part('armor', [.69, 1.95, .55], [.27, .27, 1.15], '#57505c', 'launcher');
      part('tube', [.69, 1.95, 1.67], [.24, .24, .19], color, 'launcher-muzzle', .4);
      part('octa', [.69, 1.95, 1.83], [.14, .14, .27], color, 'rocket-tip', a?.phase === 'windup' ? 1 : .2);
    } else {
      part('wing', [0, 2.05, -.45], [.45, .45, .7], '#7b669e', 'scarf');
      for (const side of [-1, 1]) {
        part('box', [side * .73, 1.25, .45], [.09, .1, .22], dark, 'knife-hilt');
        part('wing', [side * .73, 1.27, 1.06], [.075, .11, .75], '#eee2ff', 'knife-blade', .4);
      }
      if (a?.phase === 'strike') for (let i = 1; i <= 3; i++) {
        part('armor', [0, 1.38, -i * .9], [.45, .57, .25], color, 'dash-trail', .4, .24 / i);
      }
    }
  }
  stationAgent = function (items, pos, yaw, time, kind, hit, state = {}) {
    if (special(kind) && state.decksCombat) return agent(items, pos, yaw, time, kind, hit, state);
    return original.agent.apply(this, arguments);
  };
  function ring(items, center, radius, color, alpha = .8, feature = 'danger-ring') {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2, z = (i + .72) / count * Math.PI * 2;
      citadelBeam(items, V3.add(center, [Math.cos(a) * radius, .12, Math.sin(a) * radius]),
        V3.add(center, [Math.cos(z) * radius, .12, Math.sin(z) * radius]), color, .07, alpha);
      items[items.length - 1].decksFeature = feature;
    }
  }
  function scene(e, items) {
    if (!active(e)) return items;
    const b = e.board, s = b.decks;
    if (!s || s.closed) return items;
    const gate = clearance(e), terminal = b.terminals[s.room];
    if (terminal) ring(items, terminal, 2.65, gate.ready ? '#8bf2ca' : '#f0a46d', .7,
      gate.ready ? 'terminal-ready' : 'terminal-locked');
    for (const recovery of s.recoveries || []) ring(items, recovery.pos, 1.65, '#ffd299', .85, 'recovery-beacon');
    for (const wave of s.waves) if (wave.phase === 'signal' || wave.phase === 'ready') {
      for (const p of wave.positions) ring(items, p, 1.35, '#ffc06a', .72, 'reinforcement-beacon');
      const caller = b.enemies.find(x => x.id === wave.ownerId && !x.dead);
      if (caller) {
        ring(items, caller.pos, 1.9, '#ffe09d', .9, 'caller-ring');
        citadelBeam(items, V3.add(caller.pos, [0, 2.9, 0]), V3.add(caller.pos, [0, 5, 0]), '#ffe09d', .08, .8);
      }
    }
    for (const x of b.enemies) {
      const a = x.decksAttack;
      if (!a || x.dead || a.phase === 'recover') continue;
      if (a.kind === 'rocket') {
        ring(items, a.aim, a.radius, x.color, .9);
        citadelBeam(items, V3.add(x.pos, [0, 1.95, 0]), V3.add(a.aim, [0, .15, 0]), x.color, .03, .65);
      } else {
        const length = a.kind === 'pounce' ? 4.4 : 9.9;
        const end = V3.add(a.origin, V3.scale(a.direction, length)), side = [-a.direction[2], 0, a.direction[0]];
        for (const sign of [-1, 1]) {
          const off = V3.add(V3.scale(side, sign * a.radius), [0, .12, 0]);
          citadelBeam(items, V3.add(a.origin, off), V3.add(end, off), x.color, .055, a.phase === 'windup' ? .65 : .95);
          items[items.length - 1].decksFeature = 'melee-lane';
        }
        ring(items, end, a.radius, x.color, .7, 'melee-end');
      }
    }
    for (const rocket of s.rockets) {
      const item = citadelItem('armor', V3.add(rocket.pos, [0, 1.3, 0]), [.18, .18, .65], '#ac9380', .15, spaceBasisDir(rocket.vel));
      item.decksFeature = 'live-rocket'; items.push(item);
      citadelBeam(items, V3.add(rocket.pos, [0, 1.3, 0]), V3.add(V3.sub(rocket.pos, V3.scale(V3.norm(rocket.vel), 1.6)), [0, 1.3, 0]), rocket.color, .11, .9);
      ring(items, rocket.aim, rocket.radius, rocket.color, .55);
    }
    for (const blast of s.blasts) {
      const size = blast.radius * (1 - blast.life / blast.max) + .3;
      const item = citadelItem('sphere', V3.add(blast.pos, [0, .8, 0]), [size, size * .45, size], blast.color, 1, SPACE_IDENTITY, blast.life / blast.max * .4);
      item.decksFeature = 'rocket-blast'; items.push(item);
    }
    return items;
  }
  citadelInterior = function (e) { return scene(e, original.interior.apply(this, arguments)); };
  function labels(c, e, cam, w, h) {
    if (!active(e) || e.status !== 'boarding' || tier(e) === 0) return;
    const rect = ARCADE.canvas?.getBoundingClientRect?.(), width = rect?.width || w, height = rect?.height || h;
    const sx = w / width, sy = h / height, player = spaceProject(e.board.pos, cam, width, height);
    c.save(); c.scale(sx, sy); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold ' + (width < 600 ? 10 : 11) + 'px sans-serif'; c.lineWidth = 3; c.strokeStyle = '#07111f';
    const targets = alive(e.board).filter(x => special(x.archetype) && dist(x.pos, e.board.pos) < 26)
      .sort((a, b) => dist(a.pos, e.board.pos) - dist(b.pos, e.board.pos)).slice(0, 3);
    const drawn = [];
    for (const x of targets) {
      const p = spaceProject(V3.add(x.pos, [0, 0, 1.65]), cam, width, height);
      if (p.z <= 0 || p.x < 42 || p.x > width - 42 || p.y < 75 || p.y > height - 95 ||
          Math.abs(p.x - player.x) < 44 && Math.abs(p.y - player.y) < 35 ||
          drawn.some(q => Math.abs(q.x - p.x) < 82 && Math.abs(q.y - p.y) < 16)) continue;
      const label = x.decksAttack?.phase === 'windup' ? (x.archetype === 'rocketeer' ? 'РАКЕТА!' : x.archetype === 'ninja' ? 'РЫВОК!' : 'ПРЫЖОК!') : x.name;
      c.strokeText(label, p.x, p.y); c.fillStyle = x.color; c.fillText(label, p.x, p.y); drawn.push(p);
    }
    c.restore();
  }
  function terminalHUD(c, e, base, args) {
    if (!active(e) || e.status !== 'boarding') return base.apply(null, args);
    const gate = clearance(e), fill = c.fillText;
    c.fillText = function (text) {
      const values = Array.from(arguments);
      if (typeof text === 'string' && e.board.completed.length < 3) {
        if (text === 'ПОДОЙДИТЕ — ОТКРОЕТСЯ САМ') values[0] = gate.ready ? 'ПОДОЙДИТЕ К ТЕРМИНАЛУ' : 'ЗАЧИСТИТЕ КОМНАТУ · ОСТАЛОСЬ ' + gate.remaining;
        else if (text.includes('WASD — движение') && text.includes('ПРОБЕЛ')) values[0] = gate.text + (gate.pending ? ' · Подкрепление: ' + gate.pending : '');
      }
      return fill.apply(this, values);
    };
    try { return base.apply(null, args); } finally { c.fillText = fill; }
  }
  function hudBounds(e, w, h) {
    if (!active(e) || e.status !== 'boarding' || e.board.completed.length >= 3 || e.finale) return [];
    return [{ x: 6, y: 42, width: Math.min(360, w - 12), height: 34 }];
  }
  function mobileClearance(c, e, w, h) {
    if (!active(e) || e.status !== 'boarding' || e.board.completed.length >= 3 || e.finale) return;
    const width = ARCADE.canvas?.getBoundingClientRect?.().width || w, scale = w / width;
    const box = hudBounds(e, width, h / scale)[0], gate = clearance(e);
    c.save(); c.scale(scale, scale); c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = '#061320dc'; c.fillRect(box.x, box.y, box.width, box.height);
    c.fillStyle = gate.ready ? '#b1f0d6' : '#ffd09b'; c.font = 'bold 11px Arial';
    c.fillText(gate.text, box.x + 7, box.y + 10);
    c.fillStyle = '#bdd5dc'; c.font = '10px Arial';
    c.fillText(gate.pending ? gate.detail : 'Терминал ' + (gate.room + 1) + ' / 3 · ' + (gate.ready ? 'подойдите к консоли' : 'дождитесь полной зачистки'), box.x + 7, box.y + 25);
    c.restore();
  }
  drawBoardHUD = function (c, e, cam, w, h) { const r = terminalHUD(c, e, original.hud, arguments); labels(c, e, cam, w, h); return r; };
  drawMobileGameHUD = function (c, e, cam, w, h) { const r = terminalHUD(c, e, original.mobile, arguments); labels(c, e, cam, w, h); mobileClearance(c, e, w, h); return r; };
  drawFinaleHUD = function (c, e, cam, w, h) { const r = original.finalHud.apply(this, arguments); labels(c, e, cam, w, h); return r; };
  function status(e) {
    if (!active(e)) return { active: false, version: VERSION };
    const p = profile(e), s = e.board.decks, gate = clearance(e);
    return { active: true, version: VERSION, level: p.level, room: Math.min(3, e.board.completed.length + 1),
      authoredBase: CITADEL_BASES.modern(e.board), crew: e.board.baseOps ? { reserveDepartures:e.board.baseOps.reserveDepartures, patrolDistance:e.board.baseOps.patrolDistance } : null,
      completed: e.board.completed.length, returning: e.board.completed.length >= 3,
      tutorial: p.tutorial, alive: gate.alive, cap: p.cap, damage: p.damage,
      pending: gate.pending, remaining: gate.remaining, terminalReady: gate.ready, terminalText: gate.text,
      contactCooldown: s?.contactCooldown || 0, contactHits: s?.contactHits || 0,
      recovered: s?.recovered || 0, recoveries: (s?.recoveries || []).map(x => ({ enemy: x.enemy, pos: x.pos.slice(), time: x.timer })),
      warnings: (s?.waves || []).filter(x => x.phase === 'signal' || x.phase === 'ready').map(x => ({
        id: x.id, side: x.side, time: x.timer, caller: x.ownerId, positions: x.positions.map(p => p.slice()) })),
      attacks: alive(e.board).filter(x => x.decksAttack).map(x => ({ enemy: x.id, archetype: x.archetype, ...x.decksAttack,
        aim: x.decksAttack.aim.slice(), origin: x.decksAttack.origin.slice(), direction: x.decksAttack.direction.slice() })),
      spawned: s?.spawned || 0, wavesLanded: s?.wavesLanded || 0, reinforcementAttacks: s?.reinforcementAttacks || 0,
      reinforcementHits: s?.reinforcementHits || 0,
      extendedMaze: e.board.definition?.decksVersion === LAYOUT_VERSION || e.board.definition?.addedLength === 56 };
  }
  globalThis.CITADEL_DECK_COMBAT = Object.freeze({ version: VERSION, active, profile, status, clearance, hudBounds });
})();
