import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, createMovement, moveTo, stepMovement, nearestNode, shortestPath, MAX_STEP } from '../src/life/movement.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function onSegment(p, a, b) {
  return Math.abs(distance(a, p) + distance(p, b) - distance(a, b)) < .0001;
}
function onGraph(world) {
  const map = MAPS[world.location];
  return map.edges.some(([from, to]) => onSegment(world.player, map.nodes[from], map.nodes[to]));
}
function finish(world) {
  const events = [];
  for (let i = 0; i < 400 && (world.player.moving || world.player.arrivalPending); i++) events.push(...stepMovement(world, .05));
  return events;
}

test('both playable maps connect every interaction point through explicit paths', () => {
  for (const map of Object.values(MAPS)) {
    for (const id of Object.keys(map.nodes)) {
      const route = shortestPath(map.id, map.start, id);
      assert.equal(route[0], map.start);
      assert.equal(route.at(-1), id);
      for (let i = 1; i < route.length; i++) assert.ok(map.edges.some(([a, b]) =>
        (a === route[i - 1] && b === route[i]) || (b === route[i - 1] && a === route[i])));
    }
  }
});

test('the heroine walks gradually, reaches the requested object, and emits one interaction', () => {
  const world = createMovement('home');
  const start = { ...world.player };
  assert.equal(moveTo(world, 'kitchen', { interaction: 'breakfast' }), true);
  const events = [];
  for (let i = 0; i < 200 && world.player.moving; i++) {
    const before = { ...world.player };
    events.push(...stepMovement(world, .05));
    assert.ok(distance(before, world.player) <= world.player.speed * .05 + .00001);
    assert.ok(onGraph(world));
  }
  assert.notEqual(world.player.x, start.x);
  assert.deepEqual(events, [{ type: 'arrival', nodeId: 'kitchen', interaction: 'breakfast' }]);
  assert.equal(world.player.node, 'kitchen');
  assert.deepEqual(stepMovement(world, .1), []);
});

test('mid-edge redirection preserves position, follows corridors, and cancels the old interaction', () => {
  const world = createMovement('home');
  moveTo(world, 'kitchen', { interaction: 'breakfast' });
  for (let i = 0; i < 19; i++) stepMovement(world, .05);
  const position = { x: world.player.x, y: world.player.y };
  moveTo(world, 'wardrobe', { interaction: 'dress' });
  assert.deepEqual({ x: world.player.x, y: world.player.y }, position);
  const events = [];
  for (let i = 0; i < 200 && world.player.moving; i++) {
    events.push(...stepMovement(world, .05));
    assert.ok(onGraph(world));
  }
  assert.deepEqual(events, [{ type: 'arrival', nodeId: 'wardrobe', interaction: 'dress' }]);
});

test('pause freezes all motion, long resume frames are bounded, NPCs never trigger story interactions', () => {
  const world = createMovement('district');
  moveTo(world, 'respondent', { interaction: 'interview' });
  const frozen = JSON.stringify(world);
  assert.deepEqual(stepMovement(world, 0), []);
  assert.equal(JSON.stringify(world), frozen);
  const p = { ...world.player };
  stepMovement(world, 60);
  assert.ok(distance(p, world.player) <= world.player.speed * MAX_STEP + .00001);
  assert.equal(world.elapsed, MAX_STEP);
  const events = [];
  for (let i = 0; i < 400; i++) events.push(...stepMovement(world, .05));
  assert.deepEqual(events, [{ type: 'arrival', nodeId: 'respondent', interaction: 'interview' }]);
  assert.ok(world.npcs.some(npc => npc.travelled > 0));
});

test('same-position semantic endpoints still emit one arrival and invalid commands do not alter state', () => {
  const world = createMovement('district', 'mentor');
  moveTo(world, 'date', { interaction: 'meet-max' });
  assert.deepEqual(finish(world), [{ type: 'arrival', nodeId: 'date', interaction: 'meet-max' }]);
  const before = JSON.stringify(world);
  assert.equal(moveTo(world, 'unknown'), false);
  assert.equal(JSON.stringify(world), before);
  assert.deepEqual(stepMovement(world, NaN), []);
  assert.equal(nearestNode(world, NaN, 5), 'base');
  assert.equal(nearestNode(world, 605, 275), 'respondent');
  assert.throws(() => createMovement('moon'), RangeError);
});

test('identical input produces identical movement and can spawn at the home doorway on return', () => {
  const a = createMovement('district'), b = createMovement('district');
  moveTo(a, 'mentor');
  moveTo(b, 'mentor');
  for (let i = 0; i < 200; i++) {
    assert.deepEqual(stepMovement(a, .05), stepMovement(b, .05));
    assert.deepEqual(a, b);
  }
  const home = createMovement('home', 'door');
  assert.equal(home.player.node, 'door');
  assert.deepEqual({ x: home.player.x, y: home.player.y }, MAPS.home.nodes.door);
});

test('home corridors avoid the furniture footprints traced from the apartment artwork', () => {
  // Deliberately independent of the route graph: these occupied rectangles
  // cover the bed, sofa, coffee table, dining set, and ottoman in the artwork.
  const furniture = [
    { name: 'bed', left: 185, right: 400, top: 170, bottom: 285 },
    { name: 'sofa', left: 160, right: 355, top: 300, bottom: 500 },
    { name: 'coffee table', left: 320, right: 440, top: 410, bottom: 515 },
    { name: 'dining set', left: 630, right: 870, top: 390, bottom: 640 },
    { name: 'ottoman', left: 130, right: 205, top: 535, bottom: 615 },
  ];
  const map = MAPS.home;
  for (const [from, to] of map.edges) {
    const a = map.nodes[from], b = map.nodes[to];
    for (let i = 0; i <= 100; i++) {
      const p = { x: a.x + (b.x - a.x) * i / 100, y: a.y + (b.y - a.y) * i / 100 };
      for (const item of furniture) assert.ok(!(p.x > item.left && p.x < item.right && p.y > item.top && p.y < item.bottom),
        `${from} → ${to} crosses ${item.name}`);
    }
  }
});
