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

function createActor(map, id, node, speed, portraitIndex = 0) {
  return {
    id, x: map.nodes[node].x, y: map.nodes[node].y, node,
    dir: 'right', facingY: 'down', moving: false, path: [],
    destination: null, interaction: null, arrivalPending: false,
    walkCycle: 0, travelled: 0, speed, status: 'idle', portraitIndex,
  };
}

/** A new presentation state. Optional startNode is useful when returning home. */
export function createMovement(location = 'home', startNode) {
  const map = MAPS[location];
  if (!map) throw new RangeError(`Unknown movement location: ${location}`);
  const start = map.nodes[startNode] ? startNode : map.start;
  const npcs = location === 'district' ? [
    { ...createActor(map, 'resident-1', 'east-path', 55, 0), wait: 2, route: ['corner', 'base', 'square', 'center', 'east', 'east-path'], routeIndex: 0 },
    { ...createActor(map, 'resident-2', 'west', 60, 1), wait: 4, route: ['north', 'center', 'square', 'base', 'square', 'center', 'west'], routeIndex: 0 },
  ] : [];
  return { location, elapsed: 0, player: createActor(map, 'anna', start, map.speed), npcs };
}

/** Snap a ground tap to a walkable node; this never teleports the player. */
export function nearestNode(world, x, y) {
  const map = MAPS[world?.location];
  if (!map) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return map.start;
  const point = { x, y };
  return Object.keys(map.nodes).reduce((best, id) =>
    distance(point, map.nodes[id]) < distance(point, map.nodes[best]) ? id : best, map.start);
}

function routeActor(world, actor, nodeId, interaction = null) {
  const map = MAPS[world?.location];
  if (!map?.nodes[nodeId] || !actor || !map.nodes[actor.node]) return false;
  // Mid-edge redirects can return to either endpoint of the occupied edge.
  // They never jump to the nearest new path or cut through furniture/lawn.
  const anchors = [actor.node];
  if (actor.moving && actor.path[0] && actor.path[0] !== actor.node) anchors.push(actor.path[0]);
  let best;
  for (const anchor of anchors) {
    const route = shortestPath(map.id, anchor, nodeId);
    if (!route.length) continue;
    const cost = distance(actor, map.nodes[anchor]) + routeLength(map, route);
    if (!best || cost < best.cost) best = { route, cost };
  }
  if (!best) return false;
  actor.path = [...best.route];
  if (distance(actor, map.nodes[actor.path[0]]) < 0.000001) actor.path.shift();
  actor.destination = nodeId;
  actor.interaction = typeof interaction === 'string' ? interaction : null;
  actor.moving = actor.path.length > 0;
  actor.arrivalPending = !actor.moving;
  actor.status = actor.moving ? 'walking' : 'arrived';
  return true;
}

export function moveTo(world, nodeId, meta = {}) {
  return routeActor(world, world?.player, nodeId, meta?.interaction);
}

function stepActor(map, actor, dt) {
  let budget = actor.speed * dt;
  while (actor.moving && budget > 0 && actor.path.length) {
    const next = map.nodes[actor.path[0]], length = distance(actor, next);
    if (Math.abs(next.x - actor.x) > .001) actor.dir = next.x > actor.x ? 'right' : 'left';
    if (Math.abs(next.y - actor.y) > .001) actor.facingY = next.y > actor.y ? 'down' : 'up';
    const moved = Math.min(length, budget);
    if (length > .000001) {
      actor.x += (next.x - actor.x) * moved / length;
      actor.y += (next.y - actor.y) * moved / length;
    }
    actor.travelled += moved;
    actor.walkCycle = (actor.walkCycle + moved / 75) % 1;
    budget -= moved;
    if (length <= moved + .000001) {
      actor.node = actor.path.shift();
      actor.x = next.x;
      actor.y = next.y;
      if (!actor.path.length) {
        actor.moving = false;
        actor.arrivalPending = true;
        actor.status = 'arrived';
      }
    }
  }
  if (!actor.arrivalPending) return false;
  actor.arrivalPending = false;
  actor.walkCycle = 0;
  return true;
}

/**
 * Mutates only this small spatial state. dt=0 pauses player AND ambient actors.
 * A long frame is capped, so tab suspension cannot complete a journey unseen.
 * Only player arrivals are returned; NPC wandering cannot trigger interactions.
 */
export function stepMovement(world, dtSeconds) {
  const map = MAPS[world?.location];
  if (!map || !world.player || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return [];
  const dt = Math.min(MAX_STEP, dtSeconds);
  world.elapsed += dt;
  const arrived = stepActor(map, world.player, dt);
  for (const npc of world.npcs ?? []) {
    if (!npc.moving && !npc.arrivalPending) {
      npc.wait = Math.max(0, npc.wait - dt);
      if (npc.wait <= .000001) {
        routeActor(world, npc, npc.route[npc.routeIndex]);
        npc.routeIndex = (npc.routeIndex + 1) % npc.route.length;
      }
    }
    if (stepActor(map, npc, dt)) {
      npc.wait = 2;
      npc.status = 'idle';
    }
  }
  return arrived ? [{ type: 'arrival', nodeId: world.player.destination, interaction: world.player.interaction }] : [];
}
