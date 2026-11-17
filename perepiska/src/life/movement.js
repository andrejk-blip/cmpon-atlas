/**
 * Spatial simulation for the first-day life chapter.
 * Coordinates are feet positions in a 1000 × 700 scene. No DOM, game rules,
 * save data, random source, or wall clock is read here.
 */
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 700;
export const MAX_STEP = 0.1;

const home = {
  id: 'home',
  label: 'Квартира Ани',
  start: 'bed',
  speed: 110,
  nodes: {
    bed: { x: 425, y: 300 },
    wardrobe: { x: 220, y: 610 },
    kitchen: { x: 745, y: 325 },
    table: { x: 610, y: 520 },
    door: { x: 920, y: 450 },
    sofa: { x: 390, y: 540 },
    center: { x: 490, y: 450 },
    'bed-path': { x: 470, y: 330 },
    'wardrobe-path': { x: 350, y: 600 },
    'south-path': { x: 480, y: 600 },
    'table-path': { x: 550, y: 500 },
    'kitchen-path': { x: 620, y: 335 },
    'door-path': { x: 900, y: 370 },
  },
  // Traced on assets/apartment.webp. The open aisle lies to the right of the
  // bed/sofa and to the left of the dining table. The front-door approach goes
  // above the table, never through the table, its chairs, or the coffee table.
  edges: [
    ['bed', 'bed-path'], ['bed-path', 'center'],
    ['center', 'south-path'], ['south-path', 'wardrobe-path'],
    ['wardrobe-path', 'wardrobe'], ['south-path', 'sofa'],
    ['center', 'table-path'], ['table-path', 'table'],
    ['center', 'kitchen-path'], ['kitchen-path', 'kitchen'],
    ['kitchen', 'door-path'], ['door-path', 'door'],
  ],
};

const district = {
  id: 'district',
  label: 'Лесная улица',
  start: 'base',
  speed: 100,
  // Courtyard artwork: assets/courtyard.webp stretched to 1000 × 700.
  // The north/east connections go around the lawn rather than through it.
  nodes: {
    base: { x: 510, y: 560 },
    exit: { x: 510, y: 560 },
    respondent: { x: 605, y: 275 },
    mentor: { x: 580, y: 405 },
    date: { x: 580, y: 405 },
    west: { x: 340, y: 400 },
    center: { x: 440, y: 445 },
    north: { x: 430, y: 330 },
    'north-bend': { x: 500, y: 295 },
    east: { x: 560, y: 445 },
    'east-path': { x: 650, y: 455 },
    square: { x: 500, y: 520 },
    corner: { x: 660, y: 580 },
  },
  edges: [
    ['base', 'exit'], ['base', 'square'], ['base', 'corner'],
    ['square', 'corner'], ['square', 'center'],
    ['center', 'west'], ['west', 'north'], ['center', 'north'],
    ['north', 'north-bend'], ['north-bend', 'respondent'],
    ['center', 'east'], ['east', 'mentor'], ['mentor', 'date'],
    ['east', 'east-path'], ['east-path', 'corner'],
  ],
};

function freezeMap(map) {
  for (const point of Object.values(map.nodes)) Object.freeze(point);
  Object.freeze(map.nodes);
  map.edges.forEach(Object.freeze);
  Object.freeze(map.edges);
  return Object.freeze(map);
}

export const MAPS = Object.freeze({ home: freezeMap(home), district: freezeMap(district) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const graphs = Object.fromEntries(Object.values(MAPS).map(map => {
  const graph = Object.fromEntries(Object.keys(map.nodes).map(id => [id, []]));
  for (const [from, to] of map.edges) {
    graph[from].push(to);
    graph[to].push(from);
  }
  return [map.id, graph];
}));

/** A route including the start and finish; [] means an invalid endpoint. */
export function shortestPath(location, from, to) {
  const map = MAPS[location];
  if (!map?.nodes[from] || !map.nodes[to]) return [];
  const costs = { [from]: 0 }, previous = {}, open = new Set([from]), settled = new Set();
  while (open.size) {
    const here = [...open].sort((a, b) => costs[a] - costs[b] || a.localeCompare(b))[0];
    open.delete(here);
    if (here === to) break;
    settled.add(here);
    for (const next of graphs[location][here]) {
      if (settled.has(next)) continue;
      const cost = costs[here] + distance(map.nodes[here], map.nodes[next]);
      if (cost < (costs[next] ?? Infinity)) {
        costs[next] = cost;
        previous[next] = here;
        open.add(next);
      }
    }
  }
  if (costs[to] === undefined) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(previous[path[0]]);
  return path;
}

function routeLength(map, path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += distance(map.nodes[path[i - 1]], map.nodes[path[i]]);
  return length;
}

const EPSILON = 1e-7;
const PERSONAL_SPACE = 10;
const TALK_DISTANCE = 42;
const TURN_RATE = 14;

function createActor(map, id, node, speed, portraitIndex = 0) {
  return {
    id, x: map.nodes[node].x, y: map.nodes[node].y, node,
    dir: 'right', facingY: 'down', moving: false, path: [], edgeTo: null,
    destination: null, interaction: null, arrivalPending: false,
    walkCycle: 0, travelled: 0, speed, currentSpeed: 0, speedRatio: 0,
    velocity: {x: 0, y: 0}, heading: 0, targetHeading: 0, idleTime: 0,
    radius: id === 'anna' ? 14 : 13,
    status: 'idle', portraitIndex, blockedBy: null,
    heldForInteraction: false, holdRemaining: null,
    yieldingTo: null, yieldResumeDestination: null, pendingYieldTo: null,
    yieldStopRemaining: null, approachTargetId: null, stalledTime: 0, trafficHold: false,
  };
}

/** A new presentation state. Optional startNode is useful when returning home. */
export function createMovement(location = 'home', startNode) {
  const map = MAPS[location];
  if (!map) throw new RangeError(`Unknown movement location: ${location}`);
  const start = map.nodes[startNode] ? startNode : map.start;
  const npcs = location === 'district' ? [
    {...createActor(map, 'resident-1', 'east-path', 55, 0), name: 'Николай', type: 'resident', wait: 2, route: ['corner', 'base', 'square', 'center', 'east', 'east-path'], routeIndex: 0},
    {...createActor(map, 'resident-2', 'west', 60, 1), name: 'Денис', type: 'resident', wait: 4, route: ['north', 'center', 'square', 'base', 'square', 'center', 'west'], routeIndex: 0},
  ] : [];
  return {location, elapsed: 0, player: createActor(map, 'anna', start, map.speed), npcs, companions: [], interactionTarget: null};
}

/** Snap a ground tap to a walkable node; this never teleports the player. */
export function nearestNode(world, x, y) {
  const map = MAPS[world?.location];
  if (!map) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return map.start;
  const point = {x, y};
  return Object.keys(map.nodes).reduce((best, id) =>
    distance(point, map.nodes[id]) < distance(point, map.nodes[best]) ? id : best, map.start);
}

const actors = world => [world.player, ...(world.npcs ?? []), ...(world.companions ?? [])];
const findActor = (world, id) => actors(world).find(actor => actor.id === id);
const acceleration = actor => Math.max(1, actor.speed * 3);
const deceleration = actor => Math.max(1, actor.speed * 4);
const stoppingDistance = actor => actor.currentSpeed ** 2 / (2 * deceleration(actor));
const clearanceRadius = (a, b) => a.radius + b.radius + PERSONAL_SPACE;

function anchorsFor(map, actor) {
  const anchors = [actor.node];
  const other = actor.edgeTo || actor.path[0];
  if (other && other !== actor.node && map.nodes[other]) anchors.push(other);
  return anchors;
}

function installRoute(map, actor, route, destination, interaction = null) {
  actor.path = [...route];
  while (actor.path.length && distance(actor, map.nodes[actor.path[0]]) < EPSILON) {
    actor.node = actor.path.shift();
  }
  actor.edgeTo = actor.path[0] || null;
  actor.destination = destination;
  actor.interaction = typeof interaction === 'string' ? interaction : null;
  actor.approachTargetId = null;
  actor.arrivalActorId = null;
  actor.moving = actor.path.length > 0;
  actor.arrivalPending = !actor.moving;
  actor.status = actor.moving ? 'walking' : 'arrived';
  actor.blockedBy = null;
  actor.idleTime = 0;
  if (!actor.moving) stopVelocity(actor);
}

function routeActor(world, actor, nodeId, interaction = null) {
  const map = MAPS[world?.location];
  if (!map?.nodes[nodeId] || !actor || !map.nodes[actor.node]) return false;
  // Retain both endpoints even after stopping mid-edge for a conversation.
  let best;
  for (const anchor of anchorsFor(map, actor)) {
    const route = shortestPath(map.id, anchor, nodeId);
    if (!route.length) continue;
    const cost = distance(actor, map.nodes[anchor]) + routeLength(map, route);
    if (!best || cost < best.cost) best = {route, cost};
  }
  if (!best) return false;
  installRoute(map, actor, best.route, nodeId, interaction);
  return true;
}

/** Resume a passer-by after a conversation, or before redirecting the heroine. */
export function releaseInteraction(world) {
  if (!world?.player) return;
  if (world.trafficManeuver?.priorityIntent.approachTargetId) cancelTrafficManeuver(world);
  const target = findActor(world, world.interactionTarget?.actorId);
  if (target && target.type === 'resident') {
    target.heldForInteraction = false;
    target.holdRemaining = null;
    target.moving = target.path.length > 0;
    target.status = target.moving ? 'walking' : 'idle';
    if (!target.moving) target.wait = Math.max(0, target.wait ?? 2);
  }
  world.interactionTarget = null;
  if (world.player.approachTargetId || world.player.interaction?.startsWith('npc:')) {
    world.player.edgeTo = world.player.path[0] || world.player.edgeTo;
    world.player.path = [];
    world.player.moving = false;
    world.player.interaction = null;
    world.player.arrivalPending = false;
    world.player.arrivalActorId = null;
    world.player.status = 'idle';
    stopVelocity(world.player);
  }
  world.player.approachTargetId = null;
  if (world.player.status === 'talking') world.player.status = 'idle';
}

export function moveTo(world, nodeId, meta = {}) {
  if (!MAPS[world?.location]?.nodes[nodeId]) return false;
  cancelTrafficManeuver(world);
  releaseInteraction(world);
  return routeActor(world, world?.player, nodeId, meta?.interaction);
}

/** Stable static characters, with separate ground positions when both are visible. */
export function syncCompanions(world, {mentor = false, max = false} = {}) {
  if (!world?.player) return;
  if (world.location !== 'district') {
    world.companions = [];
    return;
  }
  const requested = [mentor && 'vera', max && 'max'].filter(Boolean);
  const previous = world.companions ?? [];
  const retained = previous.filter(actor => requested.includes(actor.id));
  const created = [];
  world.companions = requested.map(id => {
    const existing = previous.find(actor => actor.id === id);
    if (existing) return existing;
    // When both are requested, keep their personal space instead of stacking.
    const preferred = {x: 625, y: 412};
    const point = [...retained, ...created].some(actor => distance(actor, preferred) < 38) ? {x: 675, y: 425} : preferred;
    const companion = {...createActor(MAPS.district, id, 'mentor', 0, id === 'vera' ? 2 : 1),
      ...point, node: null, radius: 14, type: 'companion', name: id === 'vera' ? 'Вера' : 'Макс',
      dir: 'left', heading: Math.PI, targetHeading: Math.PI};
    created.push(companion);
    return companion;
  });
  if (world.interactionTarget && !findActor(world, world.interactionTarget.actorId)) releaseInteraction(world);
}

function remainingDistance(map, actor) {
  if (!actor.path.length) return 0;
  return distance(actor, map.nodes[actor.path[0]]) + routeLength(map, actor.path);
}

/** First entry of a route into a ground-space circle, measured along the route. */
function circleEntry(map, actor, center, radius) {
  let start = actor, travelled = 0;
  for (const id of actor.path) {
    const end = map.nodes[id], length = distance(start, end);
    if (length < EPSILON) { start = end; continue; }
    const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
    const rx = center.x - start.x, ry = center.y - start.y;
    const projection = rx * ux + ry * uy;
    const perpendicular2 = Math.max(0, rx * rx + ry * ry - projection * projection);
    if (perpendicular2 < radius * radius - EPSILON) {
      const half = Math.sqrt(Math.max(0, radius * radius - perpendicular2));
      const entry = projection - half, exit = projection + half;
      // If already in the comfort margin, allow an escape away from its centre.
      const escaping = entry < 0 && projection <= 0;
      if (!escaping && exit > EPSILON && entry <= length + EPSILON) return travelled + Math.max(0, entry);
    }
    travelled += length;
    start = end;
  }
  return Infinity;
}

function freeDistance(world, actor) {
  const map = MAPS[world.location];
  let available = Infinity, blockedBy = null;
  for (const other of actors(world)) {
    if (other === actor) continue;
    const turningRoom = !world.trafficManeuver && other.yieldingTo === actor.id && (other.moving || other.pendingYieldTo) ? 35 : 0;
    const hit = circleEntry(map, actor, other, clearanceRadius(actor, other) + turningRoom);
    if (hit < available) { available = hit; blockedBy = other.id; }
  }
  return {distance: available, blockedBy};
}

function pointAlongRoute(map, actor, travel) {
  let start = actor;
  for (const id of actor.path) {
    const end = map.nodes[id], length = distance(start, end);
    if (travel <= length && length > EPSILON) return {x: start.x + (end.x - start.x) * travel / length, y: start.y + (end.y - start.y) * travel / length};
    travel -= length;
    start = end;
  }
  return {x: start.x, y: start.y};
}

function planApproach(world, target) {
  const map = MAPS[world.location], player = world.player;
  const holdTravel = target.type === 'resident' ? Math.min(target.holdRemaining ?? 0, freeDistance(world, target).distance) : 0;
  const point = pointAlongRoute(map, target, Math.max(0, holdTravel));
  if (distance(player, point) <= TALK_DISTANCE + EPSILON) {
    player.path = [];
    player.moving = false;
    player.arrivalPending = false;
    return true;
  }
  let best;
  for (const anchor of anchorsFor(map, player)) {
    for (const [a, b] of map.edges) {
      for (const [from, to] of [[a, b], [b, a]]) {
        const route = [...shortestPath(map.id, anchor, from), to];
        if (!route.length) continue;
        const candidate = {x: player.x, y: player.y, path: route};
        const cost = circleEntry(map, candidate, point, TALK_DISTANCE);
        if (Number.isFinite(cost) && (!best || cost < best.cost)) best = {route, cost};
      }
    }
  }
  if (!best) return false;
  installRoute(map, player, best.route, null, `npc:${target.id}`);
  return true;
}

/** Stop a named NPC and approach to conversational distance along walkable paths. */
export function moveToActor(world, id) {
  if (!world?.player) return false;
  cancelTrafficManeuver(world);
  const target = findActor(world, id);
  if (!target || target === world.player) return false;
  if (world.interactionTarget?.actorId !== id) releaseInteraction(world);
  if (target.type === 'resident') {
    target.heldForInteraction = true;
    target.holdRemaining = stoppingDistance(target);
    target.pendingYieldTo = null;
    target.yieldStopRemaining = null;
    target.yieldingTo = null;
  }
  if (!planApproach(world, target)) {
    if (target.type === 'resident') { target.heldForInteraction = false; target.holdRemaining = null; }
    return false;
  }
  world.interactionTarget = {actorId: id, distance: TALK_DISTANCE};
  world.player.approachTargetId = id;
  world.player.interaction = `npc:${id}`;
  world.player.status = 'approaching';
  return true;
}

function stopVelocity(actor) {
  actor.currentSpeed = 0;
  actor.speedRatio = 0;
  actor.velocity.x = 0;
  actor.velocity.y = 0;
}

/** Analytic accelerate / cruise / brake profile, independent of render cadence. */
function motionProfile(actor, allowedDistance, dt) {
  let remaining = Math.max(0, allowedDistance), speed = Math.max(0, Math.min(actor.speed, actor.currentSpeed));
  let time = dt;
  const phases = [];
  for (let i = 0; i < 8 && time > EPSILON && remaining > EPSILON; i++) {
    const brake = deceleration(actor), accel = acceleration(actor);
    const stop = speed * speed / (2 * brake);
    let a, duration;
    if (remaining <= stop + EPSILON) {
      if (speed <= EPSILON) break;
      const effectiveBrake = Math.max(brake, speed * speed / (2 * remaining));
      a = -effectiveBrake;
      duration = Math.min(time, speed / effectiveBrake);
    } else if (speed >= actor.speed - EPSILON) {
      a = 0;
      duration = Math.min(time, (remaining - stop) / speed);
    } else {
      const peak = Math.min(actor.speed, Math.sqrt((2 * accel * brake * remaining + brake * speed * speed) / (accel + brake)));
      a = accel;
      duration = Math.min(time, Math.max(0, (peak - speed) / accel));
    }
    if (duration <= EPSILON) break;
    const moved = Math.min(remaining, speed * duration + .5 * a * duration * duration);
    phases.push({startSpeed: speed, acceleration: a, duration, distance: moved});
    speed = Math.max(0, Math.min(actor.speed, speed + a * duration));
    remaining = Math.max(0, remaining - moved);
    time -= duration;
  }
  if (remaining <= EPSILON) speed = 0;
  return {phases, speed, unusedTime: time};
}

function timeForDistance(speed, a, moved) {
  if (moved <= EPSILON) return 0;
  if (Math.abs(a) < EPSILON) return moved / speed;
  // This form avoids cancellation near the beginning of an acceleration.
  return 2 * moved / (speed + Math.sqrt(Math.max(0, speed * speed + 2 * a * moved)));
}

function faceDirection(actor, ux, uy, dt) {
  actor.targetHeading = Math.atan2(uy, ux);
  const delta = Math.atan2(Math.sin(actor.targetHeading - actor.heading), Math.cos(actor.targetHeading - actor.heading));
  actor.heading += delta * (1 - Math.exp(-TURN_RATE * dt));
  // A nearly vertical segment keeps the last lateral facing instead of flickering.
  const horizontal = Math.cos(actor.heading), vertical = Math.sin(actor.heading);
  if (horizontal > .25) actor.dir = 'right';
  else if (horizontal < -.25) actor.dir = 'left';
  if (vertical > .25) actor.facingY = 'down';
  else if (vertical < -.25) actor.facingY = 'up';
}

function walkPhase(map, actor, phase) {
  let budget = phase.distance, speed = phase.startSpeed;
  while (actor.path.length && budget > EPSILON) {
    const end = map.nodes[actor.path[0]], length = distance(actor, end);
    if (length <= EPSILON) {
      actor.node = actor.path.shift();
      actor.edgeTo = actor.path[0] || null;
      continue;
    }
    const ux = (end.x - actor.x) / length, uy = (end.y - actor.y) / length;
    const moved = Math.min(length, budget), usedTime = timeForDistance(speed, phase.acceleration, moved);
    actor.x += ux * moved;
    actor.y += uy * moved;
    actor.travelled += moved;
    actor.walkCycle = (actor.travelled / 75) % 1;
    actor.lastDirection = {x: ux, y: uy};
    faceDirection(actor, ux, uy, usedTime);
    speed = Math.max(0, speed + phase.acceleration * usedTime);
    budget -= moved;
    if (length <= moved + EPSILON) {
      actor.node = actor.path.shift();
      actor.x = end.x;
      actor.y = end.y;
      actor.edgeTo = actor.path[0] || null;
    }
  }
}

function consumeArrival(actor) {
  if (!actor.arrivalPending) return null;
  actor.arrivalPending = false;
  if (actor.arrivalActorId) {
    const actorId = actor.arrivalActorId;
    actor.arrivalActorId = null;
    return {type: 'arrival', nodeId: null, actorId, interaction: actor.interaction};
  }
  return {type: 'arrival', nodeId: actor.node, interaction: actor.interaction};
}

function completeApproach(actor, target) {
  actor.edgeTo = actor.path[0] || actor.edgeTo;
  actor.path = [];
  actor.moving = false;
  actor.approachTargetId = null;
  actor.arrivalActorId = target.id;
  actor.arrivalPending = true;
  actor.status = 'talking';
  stopVelocity(actor);
}

function stepActor(world, actor, dt) {
  if (actor.trafficHold) {
    actor.idleTime += dt;
    stopVelocity(actor);
    return {event: null, idleTime: dt};
  }
  const map = MAPS[world.location];
  while (actor.moving && actor.path.length && distance(actor, map.nodes[actor.path[0]]) <= EPSILON) {
    actor.node = actor.path.shift();
    actor.edgeTo = actor.path[0] || null;
  }
  if (actor.moving && !actor.path.length && !actor.approachTargetId) {
    actor.moving = false;
    actor.arrivalPending = true;
    actor.status = 'arrived';
  }
  const target = actor.approachTargetId && findActor(world, actor.approachTargetId);
  if (target && !target.moving && distance(actor, target) <= TALK_DISTANCE + .00001) completeApproach(actor, target);
  if (!actor.moving) {
    actor.idleTime += dt;
    stopVelocity(actor);
    return {event: consumeArrival(actor), idleTime: dt};
  }
  const routeDistance = remainingDistance(map, actor), free = freeDistance(world, actor);
  let allowed = Math.min(routeDistance, free.distance);
  if (target) allowed = Math.min(allowed, circleEntry(map, actor, target, TALK_DISTANCE));
  if (actor.heldForInteraction) allowed = Math.min(allowed, actor.holdRemaining ?? 0);
  if (actor.pendingYieldTo) allowed = Math.min(allowed, actor.yieldStopRemaining ?? 0);
  actor.blockedBy = free.distance < routeDistance - EPSILON ? free.blockedBy : null;
  const profile = motionProfile(actor, allowed, dt), before = actor.travelled;
  for (const phase of profile.phases) walkPhase(map, actor, phase);
  while (actor.path.length && distance(actor, map.nodes[actor.path[0]]) <= EPSILON) {
    actor.node = actor.path.shift();
    actor.edgeTo = actor.path[0] || null;
  }
  const moved = actor.travelled - before;
  actor.stalledTime = moved <= EPSILON && actor.moving && actor.blockedBy ? actor.stalledTime + dt : 0;
  actor.currentSpeed = profile.speed;
  actor.speedRatio = actor.speed > 0 ? actor.currentSpeed / actor.speed : 0;
  actor.velocity.x = (actor.lastDirection?.x ?? 0) * actor.currentSpeed;
  actor.velocity.y = (actor.lastDirection?.y ?? 0) * actor.currentSpeed;
  actor.idleTime = moved > EPSILON ? profile.unusedTime : actor.idleTime + dt;
  if (actor.heldForInteraction) actor.holdRemaining = Math.max(0, (actor.holdRemaining ?? 0) - moved);
  if (actor.pendingYieldTo) actor.yieldStopRemaining = Math.max(0, (actor.yieldStopRemaining ?? 0) - moved);
  if (actor.heldForInteraction && actor.currentSpeed <= EPSILON) {
    actor.holdRemaining = 0;
    actor.moving = false;
    actor.status = 'waiting-for-chat';
  } else if (actor.pendingYieldTo && actor.currentSpeed <= EPSILON) {
    actor.yieldStopRemaining = 0;
    actor.moving = false;
    actor.status = 'yielding';
  } else if (!actor.path.length) {
    actor.moving = false;
    stopVelocity(actor);
    if (!actor.approachTargetId) {
      actor.arrivalPending = true;
      actor.status = 'arrived';
    }
  } else actor.status = actor.currentSpeed > EPSILON ? (target ? 'approaching' : 'walking') : 'waiting';
  if (target && !target.moving && distance(actor, target) <= TALK_DISTANCE + .00001) completeApproach(actor, target);
  return {event: consumeArrival(actor), idleTime: profile.unusedTime};
}

function forward(actor, map) {
  const end = actor.path[0] && map.nodes[actor.path[0]];
  if (!end) return null;
  const length = distance(actor, end);
  return length > EPSILON ? {x: (end.x - actor.x) / length, y: (end.y - actor.y) / length} : null;
}

function chooseYieldRoute(world, npc, priority) {
  const map = MAPS[world.location];
  const blockedNodes = new Set([priority.node, priority.edgeTo, ...priority.path].filter(Boolean));
  let best;
  for (const anchor of anchorsFor(map, npc)) {
    for (const node of Object.keys(map.nodes)) {
      if (blockedNodes.has(node) || ['respondent', 'mentor', 'date', 'exit'].includes(node)) continue;
      if (actors(world).some(other => other !== npc && distance(map.nodes[node], other) < clearanceRadius(npc, other) + 3)) continue;
      const route = shortestPath(map.id, anchor, node);
      if (!route.length || route.slice(1).includes(priority.node)) continue;
      // At a junction, a shorter branch may initially turn into the waiting
      // person. Either endpoint of the current edge can provide a safe retreat.
      if (Number.isFinite(circleEntry(map, {x: npc.x, y: npc.y, path: route}, priority, clearanceRadius(npc, priority) + .25))) continue;
      const cost = distance(npc, map.nodes[anchor]) + routeLength(map, route);
      if (!best || cost < best.cost) best = {route, node, cost};
    }
  }
  return best;
}

function beginYield(world, npc, priority, brakeFirst = true) {
  const map = MAPS[world.location], choice = chooseYieldRoute(world, npc, priority);
  if (!choice) return false;
  if (!npc.yieldResumeDestination) npc.yieldResumeDestination = npc.destination;
  const newFirst = choice.route.find(id => distance(npc, map.nodes[id]) > EPSILON);
  const oldDirection = forward(npc, map);
  const newDirection = newFirst ? {x: map.nodes[newFirst].x - npc.x, y: map.nodes[newFirst].y - npc.y} : null;
  if (brakeFirst && npc.currentSpeed > EPSILON && oldDirection && newDirection && oldDirection.x * newDirection.x + oldDirection.y * newDirection.y < 0) {
    npc.pendingYieldTo = priority.id;
    npc.yieldStopRemaining = stoppingDistance(npc);
    npc.yieldingTo = priority.id;
    return true;
  }
  installRoute(map, npc, choice.route, choice.node);
  npc.pendingYieldTo = null;
  npc.yieldStopRemaining = null;
  npc.yieldingTo = priority.id;
  return true;
}

function resumeWander(world, npc, priority) {
  const map = MAPS[world.location];
  let destination = npc.yieldResumeDestination;
  if (!map.nodes[destination] || (priority && distance(map.nodes[destination], priority) < clearanceRadius(npc, priority) + 8)) {
    destination = npc.route[npc.routeIndex];
    npc.routeIndex = (npc.routeIndex + 1) % npc.route.length;
  }
  npc.yieldingTo = null;
  npc.yieldResumeDestination = null;
  npc.pendingYieldTo = null;
  npc.yieldStopRemaining = null;
  routeActor(world, npc, destination);
}

function updateTraffic(world) {
  if (world.trafficManeuver) return;
  for (const actor of [world.player, ...world.npcs]) {
    const blocker = findActor(world, actor.blockedBy);
    if (actor.stalledTime > .75 && blocker?.type === 'resident' && !blocker.heldForInteraction && startTrafficManeuver(world, actor, blocker)) return;
  }
  const map = MAPS[world.location], ordered = [...(world.npcs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (let index = 0; index < ordered.length; index++) {
    const npc = ordered[index];
    if (npc.heldForInteraction) continue;
    if (npc.pendingYieldTo) {
      if (npc.currentSpeed <= EPSILON) {
        const priority = findActor(world, npc.pendingYieldTo);
        if (!priority || !beginYield(world, npc, priority, false)) {
          npc.pendingYieldTo = null;
          npc.yieldingTo = null;
          npc.yieldStopRemaining = null;
          npc.moving = npc.path.length > 0;
        }
      }
      continue;
    }
    if (npc.yieldingTo) {
      const priority = findActor(world, npc.yieldingTo);
      const stillBlocking = priority && priority.moving && circleEntry(map, priority, npc, clearanceRadius(npc, priority)) < 85;
      if (priority && npc.currentSpeed <= EPSILON && (npc.blockedBy === priority.id || (!npc.moving && stillBlocking))) {
        beginYield(world, npc, priority, false);
      } else if (!npc.moving && (!priority || distance(npc, priority) > 90 || !priority.moving)) resumeWander(world, npc, priority);
      continue;
    }
    for (const priority of [world.player, ...ordered.slice(0, index)]) {
      if (distance(npc, priority) > 160) continue;
      const margin = clearanceRadius(npc, priority);
      const priorityHit = priority.moving ? circleEntry(map, priority, npc, margin + 4) : Infinity;
      const npcHit = npc.moving ? circleEntry(map, npc, priority, margin + 4) : Infinity;
      if (Math.min(priorityHit, npcHit) > 85) continue;
      const a = forward(npc, map), b = forward(priority, map);
      if (npc.moving && priority.moving && a && b && a.x * b.x + a.y * b.y > .55 && remainingDistance(map, npc) > 90) continue;
      if (beginYield(world, npc, priority)) break;
    }
  }
}

function routeOptions(world, actor, destination) {
  const map = MAPS[world.location];
  return anchorsFor(map, actor).map(anchor => {
    const path = shortestPath(map.id, anchor, destination);
    return {path, cost: distance(actor, map.nodes[anchor]) + routeLength(map, path)};
  }).filter(option => option.path.length);
}

function captureIntent(actor) {
  return {destination: actor.destination, interaction: actor.interaction, approachTargetId: actor.approachTargetId,
    yieldingTo: actor.yieldingTo, yieldResumeDestination: actor.yieldResumeDestination};
}

function restoreIntent(world, actor, intent) {
  if (intent.approachTargetId) {
    const target = findActor(world, intent.approachTargetId);
    if (target && planApproach(world, target)) {
      actor.approachTargetId = target.id;
      actor.interaction = `npc:${target.id}`;
    }
  } else if (MAPS[world.location].nodes[intent.destination]) {
    routeActor(world, actor, intent.destination, intent.interaction);
  }
  actor.yieldingTo = intent.yieldingTo;
  actor.yieldResumeDestination = intent.yieldResumeDestination;
}

/**
 * A single-width branch sometimes cannot be cleared by the passer-by alone.
 * Reserve one short manoeuvre: the waiting actor walks back to a free junction,
 * the passer-by exits the branch, then the original command resumes. These
 * internal arrivals never reach the story layer, and neither actor is moved by
 * assignment of coordinates.
 */
function startTrafficManeuver(world, priority, blocker) {
  if (world.trafficManeuver || priority === blocker) return false;
  const map = MAPS[world.location], others = actors(world).filter(actor => actor !== priority && actor !== blocker);
  const publicNodes = Object.keys(map.nodes).filter(id => !['respondent', 'mentor', 'date', 'exit'].includes(id));
  const originalRoute = {x: priority.x, y: priority.y, path: priority.path};
  let best;
  for (const evacuation of publicNodes) {
    const end = map.nodes[evacuation];
    if (Number.isFinite(circleEntry(map, originalRoute, end, clearanceRadius(priority, blocker) + 4))) continue;
    if (others.some(actor => distance(actor, end) < clearanceRadius(actor, blocker) + 4)) continue;
    for (const evac of routeOptions(world, blocker, evacuation)) {
      const evacRoute = {x: blocker.x, y: blocker.y, path: evac.path};
      if (others.some(actor => Number.isFinite(circleEntry(map, evacRoute, actor, clearanceRadius(actor, blocker) + .25)))) continue;
      for (const parking of publicNodes) {
        const point = map.nodes[parking];
        if (distance(point, blocker) < clearanceRadius(priority, blocker) + 4 || Number.isFinite(circleEntry(map, evacRoute, point, clearanceRadius(priority, blocker) + 4))) continue;
        if (others.some(actor => distance(actor, point) < clearanceRadius(actor, priority) + 4)) continue;
        for (const backoff of routeOptions(world, priority, parking)) {
          const backoffRoute = {x: priority.x, y: priority.y, path: backoff.path};
          if ([blocker, ...others].some(actor => Number.isFinite(circleEntry(map, backoffRoute, actor, clearanceRadius(actor, priority) + .25)))) continue;
          const cost = backoff.cost + evac.cost * .35;
          if (!best || cost < best.cost) best = {parking, evacuation, backoff, evac, cost};
        }
      }
    }
  }
  if (!best) return false;
  const priorityIntent = captureIntent(priority), blockerIntent = captureIntent(blocker);
  for (const actor of [world.player, ...world.npcs]) {
    actor.trafficHold = actor !== priority;
    actor.stalledTime = 0;
    stopVelocity(actor);
  }
  world.trafficManeuver = {stage: 'backing', priorityId: priority.id, blockerId: blocker.id,
    priorityIntent, blockerIntent, evacuation: best.evacuation, evacuationPath: best.evac.path};
  installRoute(map, priority, best.backoff.path, best.parking);
  priority.yieldingTo = null;
  priority.pendingYieldTo = null;
  blocker.pendingYieldTo = null;
  return true;
}

function cancelTrafficManeuver(world) {
  const maneuver = world?.trafficManeuver;
  if (!maneuver) return;
  world.trafficManeuver = null;
  for (const actor of [world.player, ...world.npcs]) actor.trafficHold = false;
  const priority = findActor(world, maneuver.priorityId), blocker = findActor(world, maneuver.blockerId);
  if (priority) restoreIntent(world, priority, maneuver.priorityIntent);
  if (blocker) restoreIntent(world, blocker, maneuver.blockerIntent);
}

function finishTrafficStep(world, events) {
  const maneuver = world.trafficManeuver;
  if (!maneuver) return events.get(world.player.id) || null;
  const priority = findActor(world, maneuver.priorityId), blocker = findActor(world, maneuver.blockerId);
  if (maneuver.stage === 'backing' && events.has(priority.id)) {
    maneuver.stage = 'passing';
    priority.trafficHold = true;
    blocker.trafficHold = false;
    blocker.yieldingTo = null;
    installRoute(MAPS[world.location], blocker, maneuver.evacuationPath, maneuver.evacuation);
  } else if (maneuver.stage === 'passing' && events.has(blocker.id)) {
    world.trafficManeuver = null;
    for (const actor of [world.player, ...world.npcs]) actor.trafficHold = false;
    restoreIntent(world, priority, maneuver.priorityIntent);
    blocker.yieldingTo = priority.id;
    blocker.yieldResumeDestination = maneuver.blockerIntent.yieldResumeDestination || maneuver.blockerIntent.destination;
    blocker.status = 'yielding';
  }
  return world.player.id === maneuver.priorityId ? null : (events.get(world.player.id) || null);
}

/**
 * dt=0 freezes all motion and presentation timers. Frame gaps are capped.
 * Collision constraints are swept along each route, not checked only after a
 * step, and lower-priority passers-by retreat to a free branch when needed.
 */
export function stepMovement(world, dtSeconds) {
  const map = MAPS[world?.location];
  if (!map || !world.player || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return [];
  const dt = Math.min(MAX_STEP, dtSeconds);
  world.elapsed += dt;
  if (world.player.approachTargetId && !world.player.moving) {
    const target = findActor(world, world.player.approachTargetId);
    if (target && distance(world.player, target) > TALK_DISTANCE + EPSILON) {
      const id = target.id;
      planApproach(world, target);
      world.player.approachTargetId = id;
      world.player.interaction = `npc:${id}`;
    }
  }
  updateTraffic(world);
  const playerResult = stepActor(world, world.player, dt);
  const events = new Map();
  if (playerResult.event) events.set(world.player.id, playerResult.event);
  for (const npc of [...(world.npcs ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (npc.trafficHold || world.trafficManeuver || npc.heldForInteraction || npc.pendingYieldTo || npc.yieldingTo) {
      const result = stepActor(world, npc, dt);
      if (result.event) { events.set(npc.id, result.event); npc.arrivalPending = false; npc.status = npc.yieldingTo ? 'yielding' : 'idle'; }
      continue;
    }
    let activeTime = dt;
    if (!npc.moving && !npc.arrivalPending) {
      const waiting = Math.min(npc.wait, activeTime);
      npc.wait -= waiting;
      npc.idleTime += waiting;
      activeTime -= waiting;
      if (activeTime <= EPSILON) continue;
      routeActor(world, npc, npc.route[npc.routeIndex]);
      npc.routeIndex = (npc.routeIndex + 1) % npc.route.length;
    }
    const result = stepActor(world, npc, activeTime);
    if (result.event) {
      events.set(npc.id, result.event);
      npc.wait = Math.max(0, 2 - result.idleTime);
      npc.status = 'idle';
    }
  }
  for (const companion of world.companions ?? []) companion.idleTime += dt;
  const event = finishTrafficStep(world, events);
  return event ? [event] : [];
}
