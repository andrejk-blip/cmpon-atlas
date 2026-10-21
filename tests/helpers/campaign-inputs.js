/* QA input operators extracted from public regression tests. No game-state cheats. */
(function(root){
"use strict";
const clamp=(n,a=-1,b=1)=>Math.max(a,Math.min(b,n)),limit=n=>clamp(n);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const pilots=new WeakMap();
function pursuitInput(h, e) {
  if (e.status === 'briefing') { h.action('citadel-launch'); return {}; }
  if (e.status === 'lesson') {
    if (!e.lesson.solved) h.action('citadel-lesson-answer', h.lessonCase(e, e.lesson.caseIndex).correct);
    h.action('citadel-lesson-next'); return {};
  }
  if (e.status !== 'playing' || e.phase !== 'pursuit') return {};
  let pilot = pilots.get(e);
  if (!pilot || e.pursuit.clock < pilot.clock || e.pursuit.clock - pilot.clock >= .18) {
    const target = e.navTarget().pos, pos = e.player.pos;
    pilot = { clock: e.pursuit.clock, turn: clamp((target[0] - pos[0]) * .085), pitch: clamp((target[1] - pos[1]) * .105) };
    pilots.set(e, pilot);
  }
  return { turn: pilot.turn, pitch: pilot.pitch, fire: ['2.1.0', '2.6.0'].includes(e.pursuit.version) };
}

function createSwarmController(api) {
  return e => {
    if (!api.active(e)) return {};
    const p = e.player, live = e.enemies.filter(x => !x.dead && x.pos[1] > p.pos[1] + 8);
    const lead = x => Math.max(-47, Math.min(47, x.pos[0] + Math.max(-10, Math.min(10, x.vel[0])) * Math.min(.8, (x.pos[1] - p.pos[1]) / 132)));
    live.sort((a, b) => Math.abs(lead(a) - p.pos[0]) + a.rank * 2 - (Math.abs(lead(b) - p.pos[0]) + b.rank * 2));
    const target = live[0], desired = target ? lead(target) : 0;
    const candidates = [desired, p.pos[0], desired - 10, desired + 10, p.pos[0] - 15, p.pos[0] + 15, -46, 46].map(x => Math.max(-49, Math.min(49, x)));
    const threats = [...e.hostile, ...e.enemies.filter(x => x.mode === 'dive' && x.pos[1] < 5)];
    let best = desired, cost = Infinity;
    for (const candidate of candidates) {
      let value = Math.abs(candidate - desired) * 1.2 + Math.abs(candidate - p.pos[0]) * .12;
      for (const x of threats) for (const t of [.12, .25, .45, .7]) {
        const ownX = p.pos[0] + Math.sign(candidate - p.pos[0]) * Math.min(Math.abs(candidate - p.pos[0]), 32 * t);
        const dx = x.pos[0] + x.vel[0] * t - ownX, dy = x.pos[1] + x.vel[1] * t - p.pos[1];
        const radius = x.swarmDrone ? 8 : 5, d = Math.hypot(dx, dy);
        if (d < radius) value += (radius - d) * (1.1 - t) * 130;
      }
      if (value < cost) { cost = value; best = candidate; }
    }
    const danger = threats.some(x => Math.hypot(x.pos[0] - p.pos[0], x.pos[1] - p.pos[1]) < (x.swarmDrone ? 17 : 12));
    return { turn: limit((best - p.pos[0]) * .55), pitch: limit((-50 - p.pos[1]) * .35), fire: true,
      missile: !!target && target.hp > 35 && Math.abs(lead(target) - p.pos[0]) < 3,
      pulse: danger && p.invulnerable < .12 };
  };
}

function createParallaxController(h, e, { pulse = true, missile = true } = {}) {
  let attackId = 0, goal = null;
  const guide = on => { if (e.autopilot !== on) h.action('citadel-guidance'); };
  return () => {
    const a = e.finale.parallax?.attack;
    const input = { fire: true, missile: missile && e.player.missiles > 0, pulse: false };
    if (e.finale.phase === 'boss' && a && (a.phase === 'windup' && a.time > .25 || a.phase === 'strike')) {
      if (a.id !== attackId) {
        attackId = a.id; const p = a.aim; goal = p.slice();
        if (a.kind === 'pincer') goal[0] = clamp(p[0] + (p[0] > 0 ? -32 : 32), -80, 80);
        else goal[1] = clamp(p[1] + (p[1] > 0 ? -32 : 32), -52, 52);
      }
      if (pulse && a.phase === 'windup' && a.windup - a.time < .45 && e.player.pulseCooldown <= 0) {
        input.pulse = true; guide(true); return input;
      }
      guide(false);
      const d = goal.map((v, i) => v - e.player.pos[i]);
      const yaw = Math.atan2(d[0], -d[2]), pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
      input.turn = clamp(Math.atan2(Math.sin(yaw - e.player.yaw), Math.cos(yaw - e.player.yaw)) * 3);
      input.pitch = clamp((clamp(pitch, -1.2, 1.2) - e.player.pitch) * 3);
      input.boost = true;
    } else guide(true);
    return input;
  };
}

function createMrgController() {
  let jumpUntil = 0;
  return function control(e) {
    const b = e.board, f = e.finale;
    if (!b || f?.phase !== 'mrg') return {};
    const soldiers = b.enemies.filter(enemy => !enemy.dead && enemy.hp > 0 && (!enemy.emergeDelay || enemy.emergeDelay <= 0));
    const target = soldiers.slice().sort((a, z) => {
      const danger = enemy => Math.hypot(enemy.pos[0] - b.pos[0], enemy.pos[1] - b.pos[1]) - (enemy.role === 'knife' ? 2 : 0);
      return danger(a) - danger(z);
    })[0];
    const threat = b.hostile.some(shot => {
      const dx = shot.pos[0] - b.pos[0], dy = shot.pos[1] - b.pos[1] - .55;
      return Math.abs(dx) < (shot.kind === 'rocket' ? 14 : 11) && Math.abs(dy) < 3 && dx * shot.vel[0] <= 0;
    });
    const knife = soldiers.find(enemy => enemy.role === 'knife' && Math.abs(enemy.pos[0] - b.pos[0]) < 5 && Math.abs(enemy.pos[1] - b.pos[1]) < 3);
    const beam = f.pattern === 2 && f.telegraph > 0 && f.telegraph < .55;
    if (b.grounded && (threat || knife || beam)) jumpUntil = f.time + .4;
    const imminent = b.hostile.some(shot => Math.hypot(shot.pos[0] - b.pos[0], shot.pos[1] - b.pos[1] - .55) < (shot.kind === 'rocket' ? 6 : 3)) ||
      !!(knife && ['windup', 'strike'].includes(knife.knifePhase) && b.pos[1] - knife.pos[1] < 1.8);
    const retreat = ['telegraph', 'active'].includes(f.tentacle?.phase);
    const zone = f.tentacle?.safeZone;
    const curvedRetreat = retreat && f.tentacle.kind !== 'sweep';
    // Combat rockets now punish holding one firing position. Patrol through
    // the open arena between physical boss attacks; this is ordinary movement,
    // not a change to enemy aim, damage, resources or collision geometry.
    const desired = retreat && zone ? (zone.minX + zone.maxX) / 2 :
      e.assist ? -28 + Math.sin(f.time * .75) * 1.7 : -20 + Math.sin(f.time * .8) * 9;
    let aim = f.mrg.pos.slice();
    if (target) {
      const travel = Math.min(.65, Math.hypot(target.pos[0] - b.pos[0], target.pos[1] - b.pos[1]) / 65);
      const vx = Number(target.vx) || 0, vy = Number(target.vy) || 0;
      aim = [target.pos[0] + vx * travel, target.pos[1] + .65, 0];
      if (!target.grounded && target.state !== 'emerging') aim[1] = Math.max(1.65, aim[1] + vy * travel - 16 * travel * travel);
    }
    return {
      moveX: Math.max(-1, Math.min(1, (desired - b.pos[0]) * .8)),
      moveZ: curvedRetreat && b.grounded && b.pos[1] > 1.1 ? 1 : 0,
      jump: !curvedRetreat && f.time < jumpUntil, fire: true, aim,
      pulse: imminent && b.invulnerable <= .05,
      missile: e.player.missiles > 0 && (target ? target.grounded && target.hp >= 100 : f.open),
    };
  };
}


function createDeckController(h, { fire = true, pulse = true, boost = false, dodge = true, mobile = false } = {}) {
  const q = h.deckQA;
  let route = [], room = -1, board = null, previous = null, stalled = 0, goal = null, clock = 0;
  let progressPos = null, progressTime = 0, commitRoute = 0;
  const seen = new Map();
  return e => {
    const b = e.board;
    if (!b?.cells || e.status !== 'boarding' || e.finale && e.finale.phase !== 'maze') return {};
    if (board !== b || room !== b.completed.length) {
      board = b; room = b.completed.length; route = []; previous = b.pos.slice(); stalled = 0; goal = null; seen.clear();
      progressPos = b.pos.slice(); progressTime = clock; commitRoute = 0;
    }
    clock += 1 / 60;
    commitRoute = Math.max(0, commitRoute - 1 / 60);
    if (clock - progressTime > 1.2) {
      // At a shelf corner one-frame LOS changes can alternate a sidestep and
      // its exact reverse. Commit briefly to the real navigation waypoint.
      if (distance(progressPos, b.pos) < .8) { commitRoute = 1.2; route = []; }
      progressPos = b.pos.slice(); progressTime = clock;
    }
    const enemies = b.enemies.filter(x => !x.dead && x.hp > 0 && (x.decksRoom ?? x.zone ?? room) === room);
    const visible = enemies.filter(x => distance(x.pos, b.pos) < 25 && q.line(b, b.pos, x.pos, .08));
    visible.sort((x, y) => (distance(x.pos, b.pos) - (x.archetype === 'relay' ? 7 : 0)) -
      (distance(y.pos, b.pos) - (y.archetype === 'relay' ? 7 : 0)));
    const focus = visible[0] || enemies.slice().sort((x, y) => distance(x.pos, b.pos) - distance(y.pos, b.pos))[0];
    const target = room >= 3 ? b.exit : focus ? focus.pos : b.terminals[room];
    stalled = previous && distance(previous, b.pos) < .002 ? stalled + 1 / 60 : 0;
    previous = b.pos.slice();
    if (!route.length || stalled > .8 || !goal || distance(goal, target) > 2) {
      route = q.path(b, b.pos, target); stalled = 0; goal = target.slice();
    }
    while (route.length && (distance(route[0], b.pos) < .08 || distance(route[0], b.pos) < .55 &&
      route.length > 1 && q.line(b, b.pos, route[1], .68, true))) route.shift();
    const speed = boost && b.energy > 4 ? 10.5 : 6.5, next = route[0] || b.pos;
    const length = Math.max(distance(next, b.pos), speed / 60, .001);
    let dx = (next[0] - b.pos[0]) / length, dz = (next[2] - b.pos[2]) / length;
    const close = enemies.filter(x => distance(x.pos, b.pos) < 9);
    const dangerous = close.find(x => x.decksAttack && ['windup', 'strike'].includes(x.decksAttack.phase));
    if (dodge && !commitRoute && visible.length && distance(focus.pos, b.pos) < 22) {
      const d = Math.max(.001, distance(focus.pos, b.pos)), ux = (focus.pos[0] - b.pos[0]) / d, uz = (focus.pos[2] - b.pos[2]) / d;
      const radial = Math.max(-1.2, Math.min(1, (d - 13) / 4));
      const wanted = [ux * radial - uz * .85, uz * radial + ux * .85];
      let best = -Infinity;
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
        const to = [b.pos[0] + x * 3, b.pos[1], b.pos[2] + z * 3];
        if (!q.line(b, b.pos, to, .7, true)) continue;
        let value = x * wanted[0] + z * wanted[1];
        if (!q.line(b, to, focus.pos, .15)) value -= 1.5;
        for (const enemy of close) value -= Math.max(0, 5 - distance(to, enemy.pos)) * .7;
        for (const enemy of enemies) {
          const a = enemy.decksAttack;
          if (!a || a.phase === 'recover') continue;
          if (a.kind === 'rocket') value -= Math.max(0, a.radius + 1 - distance(to, a.aim)) * 2;
          else {
            const rx = to[0] - a.origin[0], rz = to[2] - a.origin[2], along = rx * a.direction[0] + rz * a.direction[2];
            const across = Math.abs(rx * a.direction[2] - rz * a.direction[0]);
            if (along > -1 && along < 11) value -= Math.max(0, a.radius + 1 - across) * 2;
          }
        }
        if (value > best) { best = value; dx = x; dz = z; }
      }
    }
    let aim;
    if (visible.length) {
      const old = seen.get(focus.id), lead = Math.min(.35, distance(focus.pos, b.pos) / 54);
      const vx = old && clock - old.time < .1 ? (focus.pos[0] - old.pos[0]) / (clock - old.time) : 0;
      const vz = old && clock - old.time < .1 ? (focus.pos[2] - old.pos[2]) / (clock - old.time) : 0;
      aim = [focus.pos[0] + vx * lead, 0, focus.pos[2] + vz * lead];
    }
    for (const x of enemies) seen.set(x.id, { pos: x.pos.slice(), time: clock });
    const control = { moveX: dx, moveZ: dz, fire, boost,
      aim, pulse: pulse && b.pulseCooldown <= 0 && (close.length >= 2 || !!dangerous || close.some(x => x.archetype === 'shield')) };
    if (!mobile) return control;
    h.arcade.engine = e; h.arcade.joystick = { x: dx, y: dz };
    h.arcade.firePointer = fire ? 1 : null; h.arcade.boardAim = aim;
    h.arcade.pulseQueued = control.pulse;
    boost ? h.arcade.keys.add('TouchBoost') : h.arcade.keys.delete('TouchBoost');
    return q.input();
  };
}

const api={pursuitInput,createSwarmController,createParallaxController,createMrgController,createDeckController};
if(typeof module!=="undefined") module.exports=api; else root.CITADEL_QA_INPUTS=api;
})(globalThis);
