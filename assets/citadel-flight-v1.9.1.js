/* Citadel 1.9.1 — finite combat detours and the existing safe iris approach.
 * The frozen cores used a point 93 m in front of the iris as the labelled gate.
 * Keep their obstacle planner and movement integrator, but give the approach,
 * gate marker and docking animation consistent world-space destinations.
 * A ship touching the front of the iris must also be able to request docking.
 */
(function () {
  'use strict';
  const VERSION = '1.9.1';
  if (globalThis.CITADEL_FLIGHT?.version === VERSION) return;
  if (typeof RequirementArcade !== 'function' || typeof V3 !== 'object') return;

  const proto = RequirementArcade.prototype;
  const previous = {
    dockPoint: proto.dockPoint, navTarget: proto.navTarget, guidance: proto.guidance,
    interact: proto.interact, dockShip: proto.dockShip, step: proto.step,
  };
  const guiding = new WeakSet();
  const recoveries = new WeakMap(), failedRoutes = new WeakMap(), approaches = new WeakMap();
  const offset = (e, xyz) => e?.station?.pos ? V3.add(e.station.pos, xyz) : null;
  const gate = e => offset(e, [0, 0, -25]);
  const dockingFlight = e => !!e && !e.finale && e.phase === 'dock';

  function approach(e) {
    if (!e?.station?.pos) return null;
    const cached = approaches.get(e);
    if (cached && cached.rocks === e.asteroids && cached.center.every((v, i) => v === e.station.pos[i])) return cached.pos.slice();
    // Some seeded rock fields reach the edge of the approach margin. Choose a
    // clear point in the same entrance corridor, instead of aiming inside a rock.
    const candidates = [[0, 1, -45], [0, 1, -38], [-8, 1, -40], [8, 1, -40], [0, 8, -40], [0, -6, -40]]
      .map(xyz => offset(e, xyz));
    const pos = candidates.find(p => !citadelHullHit(e, p, p, 8) &&
      !(e.asteroids || []).some(a => V3.len(V3.sub(p, a.pos)) < a.r + 8)) || candidates[0];
    approaches.set(e, { rocks: e.asteroids, center: e.station.pos.slice(), pos: pos.slice() });
    return pos.slice();
  }

  function navigationTarget(e) {
    if (!dockingFlight(e)) return null;
    return { pos: gate(e), name: 'Вход в Цитадель', approach: approach(e) };
  }
  function inEntrance(e) {
    if (!dockingFlight(e) || !e.player?.pos || !e.station?.pos) return false;
    const local = V3.sub(e.player.pos, e.station.pos);
    // Capture only in front of the closed iris, with room for lateral alignment.
    // Being near the gate through a side wall must never initiate a cutscene.
    // The physical front contact is z = -25 - 1.3 - 2.8 = -29.1.
    // The previous -31 cutoff stranded manual pilots between that plane and
    // the wall: even an explicit F request was rejected after contact.
    return local[2] <= -29.1 && Math.abs(local[0]) <= 14 && Math.abs(local[1] - 1) <= 10 &&
      V3.len(V3.sub(e.player.pos, gate(e))) < 33;
  }

  function clearSegment(e, from, to, margin = 6) {
    if (citadelHullHit(e, from, to, margin)) return false;
    const direction = V3.sub(to, from);
    return !e.asteroids.some(rock => {
      const away = V3.sub(from, rock.pos), radius = rock.r + margin;
      // A start inside the navigation margin may leave it, while still staying
      // outside the smaller physical collision radius. Never allow an inward leg.
      if (V3.len(away) < radius && V3.dot(away, direction) > 0) return false;
      return flightSegment(from, to, rock.pos, radius) !== null;
    });
  }
  function recoveryRoute(e, goal) {
    const start = e.player.pos, points = [start.slice(), goal.slice()];
    // The old rock detour checked only the station hull, so its segment could
    // cross the very rock it tried to avoid. Build a small visibility graph at
    // a reproduced standstill, and accept only physically clear segments.
    for (const y of [-48, 52]) for (const x of [-96, 0, 96]) for (const z of [-65, 65]) {
      points.push(V3.add(e.station.pos, [x, y, z]));
    }
    const rocks = e.asteroids.filter(rock => V3.len(V3.sub(start, rock.pos)) < rock.r + 34 ||
      flightSegment(start, goal, rock.pos, rock.r + 8) !== null)
      .sort((a, b) => V3.len(V3.sub(a.pos, start)) - V3.len(V3.sub(b.pos, start))).slice(0, 6);
    for (const rock of rocks) for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
      if (x || y || z) points.push(V3.add(rock.pos, V3.scale(V3.norm([x, y, z]), rock.r + 17)));
    }
    const cost = Array(points.length).fill(Infinity), parent = Array(points.length).fill(-1), done = new Set();
    cost[0] = 0;
    while (done.size < points.length) {
      let next = -1;
      for (let i = 0; i < points.length; i++) if (!done.has(i) && (next < 0 || cost[i] < cost[next])) next = i;
      if (next < 0 || !Number.isFinite(cost[next])) return null;
      if (next === 1) {
        const route = []; for (let i = 1; i !== 0; i = parent[i]) route.unshift(points[i].slice());
        return route;
      }
      done.add(next);
      for (let i = 1; i < points.length; i++) {
        if (done.has(i)) continue;
        const value = cost[next] + V3.len(V3.sub(points[next], points[i]));
        if (value >= cost[i] || !clearSegment(e, points[next], points[i])) continue;
        cost[i] = value; parent[i] = next;
      }
    }
    return null;
  }
  const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  function freePoint(e, p, margin = 10) {
    return finitePoint(p) && !citadelHullHit(e, p, p, margin) &&
      !e.asteroids.some(a => V3.len(V3.sub(p, a.pos)) < a.r + margin);
  }
  function firingPoint(e, target) {
    const candidates = [];
    // A narrow pocket between hull parts can contain a shootable enemy while
    // the old six-pass, 10 m navigation projection is still inside another part.
    // Test actual world points and the weapon corridor, not another unverified
    // projection. These points never move upwards with the player's position.
    for (const radius of [12, 20, 32, 48, 72]) {
      for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
        if (!x && !y && !z) continue;
        const point = V3.add(target.pos, V3.scale(V3.norm([x, y, z]), radius));
        if (!freePoint(e, point) || !clearSegment(e, point, target.pos, 1.2)) continue;
        candidates.push({ point, cost: V3.len(V3.sub(point, e.player.pos)) + radius * .15 });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);
    for (const item of candidates) if (clearSegment(e, e.player.pos, item.point, 6)) {
      return { point: item.point, route: [item.point.slice()] };
    }
    for (const item of candidates.slice(0, 6)) {
      const route = recoveryRoute(e, item.point);
      if (route) return { point: item.point, route };
    }
    return null;
  }
  function finiteCombatGuidance(e, input) {
    if (!e.autopilot) {
      if (e.navWatch?.flight191) delete e.navWatch.flight191;
      return null;
    }
    if (e.finale || e.phase !== 'battle' || e.navMode === 'module' || e.status !== 'playing') return null;
    const target = e.navTarget();
    if (!target?.id || !finitePoint(target.pos)) return null;
    const p = e.player, key = target.id, now = e.elapsed;
    let watch = e.navWatch;
    if (!watch || watch.key !== key) {
      e.detour = null;
      watch = e.navWatch = { key, at: now, pos: p.pos.slice(), goal: target.pos.slice(), recover: 0 };
    }
    let recovery = watch.flight191;
    if (recovery && (recovery.key !== key || !finitePoint(recovery.target) ||
        V3.len(V3.sub(recovery.target, target.pos)) > 8 || now > recovery.deadline ||
        recovery.point && (!freePoint(e, recovery.point, 6) || !clearSegment(e, recovery.point, target.pos, 1.2)))) {
      delete watch.flight191; recovery = null;
    }
    if (!recovery) {
      const goal = citadelHullResolve(e, target.pos, target.pos, 10).pos;
      let failed = !freePoint(e, goal, 7);
      if (!failed && !e.detour && citadelHullHit(e, p.pos, goal, 8)) {
        const waypoint = citadelDetour(e, p.pos, goal);
        failed = V3.len(V3.sub(waypoint, p.pos)) < 1 && V3.len(V3.sub(goal, p.pos)) > 35;
      }
      if (!failed) return null;
      const plan = firingPoint(e, target);
      let length = 0, previousPoint = p.pos;
      for (const point of plan?.route || []) { length += V3.len(V3.sub(point, previousPoint)); previousPoint = point; }
      recovery = watch.flight191 = { key, target: target.pos.slice(), point: plan?.point || null,
        route: plan?.route || [], started: now, deadline: now + (plan ? Math.min(90, 8 + length / 10) : 2), mode: plan ? 'approach' : 'waiting' };
      e.detour = null;
      if (!plan) e.say('Автокурс ищет обход корпуса. Tab — другая цель; G — ручное управление.', 'order');
    }
    if (!recovery.point) {
      // A failed search must stay finite. Normal target selection remains
      // available; no enemy is moved, removed, damaged or replaced by a proxy.
      return { ...finaleSteer(e, input, target.pos, V3.len(V3.sub(target.pos, p.pos)), 18), cruiseSpeed: 0, boost: false, brake: true };
    }
    while (recovery.route.length > 1 && V3.len(V3.sub(recovery.route[0], p.pos)) < 3) recovery.route.shift();
    const point = recovery.route[0] || recovery.point;
    if (recovery.route.length <= 1 && V3.len(V3.sub(point, p.pos)) < 4 && clearSegment(e, p.pos, target.pos, 1.2)) {
      recovery.mode = 'aim';
      return { ...finaleSteer(e, input, target.pos, V3.len(V3.sub(target.pos, p.pos)), 18), cruiseSpeed: 0, boost: false, brake: true };
    }
    recovery.mode = 'approach';
    // The point is a verified firing position. Applying the normal 38 m combat
    // stand-off to it would stop before its line of sight has been reached.
    return finaleSteer(e, input, point, 0, 20);
  }
  function brakeForObstacles(e, control) {
    if (!e.autopilot || e.finale || e.phase === 'escort' || e.status !== 'playing') return control;
    const p = e.player, basis = flightBasis(p.yaw, p.pitch);
    const look = V3.add(p.pos, V3.scale(basis.f, 4 + Math.max(0, p.speed) * .4));
    const hit = citadelHullHit(e, p.pos, look, 4);
    const hull = hit && (!citadelHullHit(e, p.pos, p.pos, 4) || citadelHullHit(e, look, look, 4));
    const rock = e.asteroids.some(a => {
      const away = V3.sub(p.pos, a.pos), radius = a.r + 4;
      if (V3.len(away) < radius && V3.dot(away, basis.f) >= 0) return false;
      return flightSegment(p.pos, look, a.pos, radius) !== null;
    });
    // The older admin core lacks the public core's stopping-distance check.
    // Use the same physical guard in both; actual deceleration stays in step().
    return hull || rock ? { ...control, cruiseSpeed: 0, brake: true, boost: false } : control;
  }
  function ordinaryGuidance(e, input, control) {
    if (!e.autopilot || e.finale || e.phase === 'escort' || e.status !== 'playing') {
      recoveries.delete(e); failedRoutes.delete(e); return control;
    }
    const target = dockingFlight(e) ? { pos: approach(e), id: 'dock' } : e.navTarget();
    if (!target) { recoveries.delete(e); return control; }
    const goal = citadelHullResolve(e, target.pos, target.pos, 10).pos;
    const key = target.id ?? target.reqId ?? e.phase;
    let recovery = recoveries.get(e);
    if (recovery && (recovery.key !== key || V3.len(V3.sub(recovery.goal, goal)) > 12)) {
      recoveries.delete(e); recovery = null;
    }
    if (recovery && clearSegment(e, e.player.pos, goal, 8)) {
      recoveries.delete(e); e.detour = null; return control;
    }
    const failure = failedRoutes.get(e), mayRetry = !failure || failure.key !== key ||
      e.elapsed - failure.at > 1 || V3.len(V3.sub(failure.goal, goal)) > 12;
    if (!recovery && mayRetry && control.cruiseSpeed === 0 && Math.abs(control.turn) < .05 && Math.abs(control.pitch) < .05 &&
        !clearSegment(e, e.player.pos, goal)) {
      const route = recoveryRoute(e, goal);
      if (route) {
        recovery = { key, goal: goal.slice(), route };
        recoveries.set(e, recovery); failedRoutes.delete(e); e.detour = null;
      } else failedRoutes.set(e, { key, goal: goal.slice(), at: e.elapsed });
    }
    if (!recovery) return control;
    while (recovery.route.length && V3.len(V3.sub(recovery.route[0], e.player.pos)) < 4) recovery.route.shift();
    if (!recovery.route.length) { recoveries.delete(e); return control; }
    return finaleSteer(e, input, recovery.route[0], 0, 20);
  }

  proto.dockPoint = function () {
    return this.finale ? previous.dockPoint.call(this) : gate(this);
  };
  proto.navTarget = function () {
    if (!dockingFlight(this)) return previous.navTarget.call(this);
    const target = navigationTarget(this);
    // The public target stays on the real door. Only the existing route planner
    // sees the safe staging point immediately outside it, for this sync call.
    if (guiding.has(this)) target.pos = target.approach.slice();
    return target;
  };
  proto.guidance = function (input) {
    const finite = finiteCombatGuidance(this, input);
    if (finite) return brakeForObstacles(this, finite);
    let control;
    if (dockingFlight(this) && this.autopilot) {
      guiding.add(this);
      try { control = previous.guidance.call(this, input); }
      finally { guiding.delete(this); }
    } else control = previous.guidance.call(this, input);
    const guarded = brakeForObstacles(this, control);
    const routed = ordinaryGuidance(this, input, guarded);
    return routed === guarded ? guarded : brakeForObstacles(this, routed);
  };
  proto.interact = function () {
    if (this.status !== 'playing' || !dockingFlight(this)) return previous.interact.call(this);
    if (!inEntrance(this)) {
      if (!this.autopilot) this.say('Вход со стороны голубого шлюза. G проведёт в обход корпуса и выровняет корабль перед воротами.', 'order', true);
      return false;
    }
    const ok = previous.interact.call(this);
    if (ok && this.status === 'docking' && this.dock) this.dock.flightVersion = VERSION;
    return ok;
  };
  proto.dockShip = function (t) {
    // 1.7.1 already used this visible-entrance trajectory. Preserve it as well
    // as the legacy core path for older saves without a flightVersion marker.
    if (!['1.7.1', '1.8.1', VERSION].includes(this.dock?.flightVersion) || this.finale) return previous.dockShip.call(this, t);
    const start = this.dock.start, st = this.station.pos;
    const alignZ = Math.max(start[2], st[2] - 60);
    const holdZ = Math.max(alignZ, st[2] - 43);
    const points = [start, [st[0], st[1] + 1, alignZ], [st[0], st[1] + 1, holdZ],
      V3.add(st, [0, .4, -10]), V3.add(st, [0, -2, 20])];
    const times = [0, .23, .47, .76, 1];
    const progress = arcadeClamp(t, 0, 1);
    let i = 0;
    while (i < 3 && progress > times[i + 1]) i++;
    return V3.lerp(points[i], points[i + 1], stationSmooth((progress - times[i]) / (times[i + 1] - times[i])));
  };
  proto.step = function (delta, input = {}) {
    if (this.status === 'playing' && dockingFlight(this) && inEntrance(this) &&
        (input.interact || V3.len(V3.sub(this.player.pos, gate(this))) < 26 &&
          (this.autopilot || flightBasis(this.player.yaw, this.player.pitch).f[2] > .5))) {
      // A ship already in the doorway should enter immediately, not turn back
      // toward a staging point before the end-of-frame proximity check.
      // Flying into the marked entrance manually is also a docking request;
      // capture before physics can push the ship against the closed iris.
      // Manual pilots facing away can still retreat instead of being captured.
      this.interact();
    }
    return previous.step.call(this, delta, input);
  };

  globalThis.CITADEL_FLIGHT = Object.freeze({
    version: VERSION,
    recovery: e => {
      const r = e?.navWatch?.flight191;
      if (!r || e.finale || e.phase !== 'battle' || !e.autopilot) return null;
      return Object.freeze({ targetId: r.key, mode: r.mode, started: r.started, deadline: r.deadline,
        point: r.point && Object.freeze(r.point.slice()), route: Object.freeze(r.route.map(p => Object.freeze(p.slice()))) });
    },
    gate: e => { const p = gate(e); return p && Object.freeze(p); },
    approach: e => { const p = approach(e); return p && Object.freeze(p); },
    navigationTarget: e => {
      const target = navigationTarget(e);
      return target && Object.freeze({ ...target, pos: Object.freeze(target.pos), approach: Object.freeze(target.approach) });
    },
  });
})();
