/* Citadel 1.7.1 — one visible weapon lock and distance-based flight leading. */
(() => {
  'use strict';
  if (typeof RequirementArcade !== 'function' || globalThis.CITADEL_AIM) return;
  const version = '1.7.1', proto = RequirementArcade.prototype;
  const original = { fire: proto.fire, missile: proto.missile, escort: proto.stepEscort };
  const limits = Object.freeze({ range: 230, orbitCosine: .90, escortCosine: .65, finaleCosine: .84 });
  const point = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const flight = e => e?.status === 'playing' && (!e.finale || ['boss', 'breach'].includes(e.finale.phase));

  // Solve |target + velocity * t - origin| = projectileSpeed * t. A missing
  // positive solution is deliberately not turned into an infinite aim vector.
  function intercept(origin, position, velocity, speed, maxTime) {
    if (!point(origin) || !point(position) || !point(velocity) || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(maxTime) || maxTime <= 0) return null;
    const delta = V3.sub(position, origin), a = V3.dot(velocity, velocity) - speed * speed;
    const b = 2 * V3.dot(delta, velocity), c = V3.dot(delta, delta);
    let time;
    if (c < 1e-10) time = 0;
    else if (Math.abs(a) < 1e-8) time = b < -1e-8 ? -c / b : NaN;
    else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return null;
      const root = Math.sqrt(discriminant), roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(t => t >= 0 && Number.isFinite(t));
      time = roots.length ? Math.min(...roots) : NaN;
    }
    if (!Number.isFinite(time) || time < 0 || time > maxTime) return null;
    const aim = V3.add(position, V3.scale(velocity, time));
    return { time, point: aim, direction: V3.norm(V3.sub(aim, origin)) };
  }

  function eligible(e, target, basis) {
    if (!target || target.dead || target.warp > 0 || target.invulnerable > 0 || (Number.isFinite(target.hp) && target.hp <= 0) || !point(target.pos)) return false;
    const delta = V3.sub(target.pos, e.player.pos), range = V3.len(delta);
    const cosine = e.phase === 'escort' ? limits.escortCosine : e.finale ? limits.finaleCosine : limits.orbitCosine;
    if (!(range > 1e-6 && range < limits.range) || V3.dot(basis.f, V3.norm(delta)) <= cosine) return false;
    const velocity = point(target.vel) ? target.vel : [0, 0, 0];
    if (!intercept(e.player.pos, target.pos, velocity, 210, 1.7) || !intercept(e.player.pos, target.pos, velocity, e.finale ? 92 : 100, 7)) return false;
    // Only orbit shots collide with the Citadel hull and the asteroid field.
    // Convoy and Parallax use their own arenas and projectile integrators.
    if (e.phase !== 'escort' && !e.finale) {
      if (typeof citadelHullHit === 'function' && citadelHullHit(e, e.player.pos, target.pos, 1.2)) return false;
      if ((e.asteroids || []).some(rock => point(rock.pos) && Number.isFinite(rock.r) && flightSegment(e.player.pos, target.pos, rock.pos, rock.r + 1.2) !== null)) return false;
    }
    return true;
  }

  function choose(e) {
    if (!flight(e) || !point(e.player?.pos) || e.finale?.phase === 'breach') return null;
    const basis = flightBasis(e.player.yaw, e.player.pitch);
    // The central Parallax core remains shielded while any support is alive.
    const enemies = (e.enemies || []).filter(target => !target.dead);
    const all = e.finale?.phase === 'boss' && enemies.length ? enemies : [...enemies, ...(e.boss ? [e.boss] : [])];
    const candidates = all.filter(target => eligible(e, target, basis));
    const selected = candidates.find(target => target.id === e.selectedTarget);
    if (selected) return selected;
    let best = null, bestScore = -Infinity;
    for (const target of candidates) {
      const delta = V3.sub(target.pos, e.player.pos);
      const score = V3.dot(basis.f, V3.norm(delta)) - V3.len(delta) * .00008;
      if (score > bestScore) { best = target; bestScore = score; }
    }
    return best;
  }

  proto.target = function () {
    const target = choose(this);
    this.lock = target?.id ?? null;
    return target;
  };

  proto.fire = function (...args) {
    const target = choose(this), before = this.bullets.length;
    const fired = original.fire.apply(this, args);
    if (!fired || !target) return fired;
    const velocity = point(target.vel) ? target.vel : [0, 0, 0];
    for (const shot of this.bullets.slice(before)) {
      if (shot.type !== 'laser') continue;
      const aim = intercept(shot.pos, target.pos, velocity, V3.len(shot.vel), shot.life);
      if (aim) shot.vel = V3.scale(aim.direction, V3.len(shot.vel));
    }
    return fired;
  };

  proto.missile = function (...args) {
    const before = this.bullets.length, fired = original.missile.apply(this, args);
    if (!fired || !flight(this)) return fired;
    for (const shot of this.bullets.slice(before)) {
      if (shot.type !== 'missile') continue;
      const target = [...this.enemies, ...(this.boss ? [this.boss] : [])].find(candidate => candidate.id === shot.target && !candidate.dead);
      if (!target) continue;
      const speed = this.finale ? 92 : 100, velocity = point(target.vel) ? target.vel : [0, 0, 0];
      const aim = intercept(shot.pos, target.pos, velocity, speed, shot.life);
      if (aim) shot.vel = V3.scale(aim.direction, speed);
    }
    return fired;
  };

  proto.stepEscort = function (...args) {
    const result = original.escort.apply(this, args);
    if (this.phase === 'escort') this.target();
    return result;
  };

  globalThis.CITADEL_AIM = Object.freeze({ version, limits, intercept });
})();
