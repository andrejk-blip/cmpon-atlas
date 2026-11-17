import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, createMovement, moveTo, stepMovement, nearestNode, shortestPath, MAX_STEP, moveToActor, releaseInteraction, syncCompanions } from '../src/life/movement.js';

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

function assertPersonalSpace(world) {
  const all = [world.player, ...world.npcs, ...world.companions];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    assert.ok(distance(all[i], all[j]) >= all[i].radius + all[j].radius + 10 - .0001,
      `${all[i].id} overlaps ${all[j].id}: ${distance(all[i], all[j])}`);
  }
}
function setNpcRoute(world, npc, from, path) {
  Object.assign(npc, MAPS[world.location].nodes[from], {
    node: from, path: [...path], edgeTo: path[0], destination: path.at(-1),
    moving: true, status: 'walking', wait: 0, currentSpeed: npc.speed, speedRatio: 1,
  });
}

test('walking accelerates, brakes at the destination, and retains its travelled phase while idle', () => {
  const world = createMovement('home');
  moveTo(world, 'kitchen');
  const start = {...world.player};
  stepMovement(world, .05);
  assert.ok(world.player.currentSpeed > 0 && world.player.currentSpeed < world.player.speed);
  assert.ok(distance(start, world.player) < world.player.speed * .05 / 2);
  const speeds = [world.player.currentSpeed];
  while (world.player.moving) {
    stepMovement(world, .05);
    speeds.push(world.player.currentSpeed);
  }
  assert.ok(speeds.some(speed => Math.abs(speed - world.player.speed) < 1e-5));
  assert.equal(speeds.at(-1), 0);
  assert.ok(speeds.at(-2) > 0 && speeds.at(-2) < world.player.speed / 2);
  const phase = world.player.walkCycle, total = world.player.travelled;
  assert.ok(phase > .01);
  stepMovement(world, .1);
  assert.equal(world.player.walkCycle, phase, 'arrival must not snap the walking atlas back to its first frame');
  assert.equal(world.player.travelled, total);
  assert.equal(world.player.speedRatio, 0);
  assert.deepEqual(world.player.velocity, {x: 0, y: 0});
  assert.ok(world.player.idleTime > 0);
});

test('acceleration and corner heading are independent of render cadence', () => {
  const slow = createMovement('home'), fast = createMovement('home');
  moveTo(slow, 'kitchen');
  moveTo(fast, 'kitchen');
  for (let i = 0; i < 24; i++) stepMovement(slow, .1);
  for (let i = 0; i < 120; i++) stepMovement(fast, .02);
  for (const key of ['x', 'y', 'travelled', 'currentSpeed', 'walkCycle', 'heading']) {
    assert.ok(Math.abs(slow.player[key] - fast.player[key]) < .00001, `${key} depends on frame size`);
  }
  assert.equal(slow.player.dir, fast.player.dir);
  assert.equal(slow.player.node, fast.player.node);
});

test('near-vertical travel retains lateral facing instead of flipping on a small horizontal component', () => {
  const world = createMovement('home', 'center');
  moveTo(world, 'south-path');
  for (let i = 0; i < 80; i++) stepMovement(world, .05);
  assert.equal(world.player.dir, 'right');
  assert.equal(world.player.facingY, 'down');
  moveTo(world, 'wardrobe');
  for (let i = 0; i < 80; i++) stepMovement(world, .05);
  assert.equal(world.player.dir, 'left', 'a deliberate horizontal turn still changes facing');
});

test('a head-on passer-by yields at a branch without ghosting or deadlocking the heroine', () => {
  const world = createMovement('district');
  const npc = world.npcs[0];
  world.npcs = [npc];
  setNpcRoute(world, npc, 'center', ['square', 'base']);
  moveTo(world, 'respondent', {interaction: 'interview'});
  const events = [];
  let yielded = false;
  for (let i = 0; i < 600; i++) {
    events.push(...stepMovement(world, .05));
    assertPersonalSpace(world);
    assert.ok(onGraph(world));
    yielded ||= Boolean(npc.yieldingTo || npc.pendingYieldTo);
  }
  assert.equal(yielded, true);
  assert.deepEqual(events, [{type: 'arrival', nodeId: 'respondent', interaction: 'interview'}]);
});

test('two opposite passers-by keep personal space and both continue after yielding', () => {
  const world = createMovement('district', 'respondent');
  const [first, second] = world.npcs;
  setNpcRoute(world, first, 'center', ['west']);
  setNpcRoute(world, second, 'west', ['center']);
  let yielded = false;
  for (let i = 0; i < 400; i++) {
    stepMovement(world, .05);
    assertPersonalSpace(world);
    yielded ||= Boolean(second.yieldingTo || second.pendingYieldTo);
  }
  assert.equal(yielded, true);
  assert.ok(first.travelled > 150 && second.travelled > 150, 'both passers-by must make progress');
});

test('each passer-by can be stopped, approached once, and released without losing its edge position', () => {
  for (const id of ['resident-1', 'resident-2']) {
    const world = createMovement('district');
    for (let i = 0; i < 90; i++) stepMovement(world, .05);
    const target = world.npcs.find(npc => npc.id === id);
    assert.equal(moveToActor(world, id), true);
    const events = [];
    for (let i = 0; i < 600 && !events.length; i++) {
      events.push(...stepMovement(world, .05));
      assertPersonalSpace(world);
      assert.ok(onGraph(world));
    }
    assert.deepEqual(events, [{type: 'arrival', nodeId: null, actorId: id, interaction: `npc:${id}`}]);
    assert.ok(Math.abs(distance(world.player, target) - 42) < .001);
    const frozen = JSON.stringify(world);
    assert.deepEqual(stepMovement(world, 0), []);
    assert.equal(JSON.stringify(world), frozen);
    assert.deepEqual(stepMovement(world, .05), [], 'chat arrival must not repeat');
    const position = {x: world.player.x, y: world.player.y}, targetTravel = target.travelled;
    releaseInteraction(world);
    assert.equal(target.heldForInteraction, false);
    moveTo(world, 'base');
    assert.deepEqual({x: world.player.x, y: world.player.y}, position);
    for (let i = 0; i < 200; i++) {
      stepMovement(world, .05);
      assertPersonalSpace(world);
      assert.ok(onGraph(world));
    }
    assert.ok(target.travelled > targetTravel);
    assert.equal(world.player.node, 'base');
  }
});

test('static companions remain separate and a new movement command releases an invited NPC', () => {
  const world = createMovement('district');
  syncCompanions(world, {mentor: true, max: true});
  assertPersonalSpace(world);
  const vera = world.companions.find(actor => actor.id === 'vera');
  syncCompanions(world, {mentor: true, max: true});
  assert.equal(world.companions.find(actor => actor.id === 'vera'), vera);
  assert.equal(moveToActor(world, 'vera'), true);
  const events = [];
  for (let i = 0; i < 500 && !events.length; i++) {
    events.push(...stepMovement(world, .05));
    assertPersonalSpace(world);
  }
  assert.equal(events[0]?.interaction, 'npc:vera');
  assert.ok(distance(world.player, vera) <= 42.001);
  releaseInteraction(world);
  assert.equal(moveToActor(world, 'resident-1'), true);
  assert.equal(world.npcs[0].heldForInteraction, true);
  moveTo(world, 'respondent');
  assert.equal(world.npcs[0].heldForInteraction, false);
  assert.equal(world.interactionTarget, null);
  const arrivals = [];
  for (let i = 0; i < 500; i++) {
    arrivals.push(...stepMovement(world, .05));
    assertPersonalSpace(world);
  }
  assert.deepEqual(arrivals, [{type: 'arrival', nodeId: 'respondent', interaction: null}]);
});

test('closing another screen cancels a pending NPC approach without a late conversation arrival', () => {
  for (const id of ['resident-1', 'resident-2', 'vera', 'max']) {
    const world = createMovement('district');
    syncCompanions(world, {mentor: true, max: true});
    moveToActor(world, id);
    for (let i = 0; i < 10; i++) stepMovement(world, 1 / 60);
    const position = {x: world.player.x, y: world.player.y}, edge = world.player.edgeTo;
    releaseInteraction(world);
    assert.deepEqual({x: world.player.x, y: world.player.y}, position);
    assert.equal(world.player.edgeTo, edge, 'cancellation must retain the real current edge');
    assert.equal(world.player.interaction, null);
    assert.equal(world.player.moving, false);
    assert.equal(world.interactionTarget, null);
    assert.ok(world.npcs.every(actor => !actor.heldForInteraction));
    for (let i = 0; i < 600; i++) {
      assert.deepEqual(stepMovement(world, .05), [], 'a cancelled approach cannot open a distant dialogue');
      assertPersonalSpace(world);
    }
  }
  const ordinary = createMovement('home');
  moveTo(ordinary, 'kitchen', {interaction: 'breakfast'});
  stepMovement(ordinary, .1);
  releaseInteraction(ordinary);
  assert.deepEqual(finish(ordinary), [{type: 'arrival', nodeId: 'kitchen', interaction: 'breakfast'}]);
});

test('a route ending in a zero-length semantic edge reaches its final named endpoint once', () => {
  const world = createMovement('district');
  moveTo(world, 'date', {interaction: 'meet-max'});
  const events = finish(world);
  assert.deepEqual(events, [{type: 'arrival', nodeId: 'date', interaction: 'meet-max'}]);
  assert.deepEqual({x: world.player.x, y: world.player.y}, MAPS.district.nodes.date);
  assert.deepEqual(stepMovement(world, .1), []);
});

test('showing both companions preserves an existing character and reserves a separate position', () => {
  for (const first of ['vera', 'max']) {
    const world = createMovement('district');
    syncCompanions(world, {mentor: first === 'vera', max: first === 'max'});
    const actor = world.companions[0], position = {x: actor.x, y: actor.y};
    syncCompanions(world, {mentor: true, max: true});
    assert.equal(world.companions.find(other => other.id === first), actor);
    assert.deepEqual({x: actor.x, y: actor.y}, position);
    assertPersonalSpace(world);
    syncCompanions(world, {mentor: first === 'vera', max: first === 'max'});
    assert.equal(world.companions[0], actor);
    assert.deepEqual({x: actor.x, y: actor.y}, position);
  }
});

function walkUntilArrival(world, limit = 1600) {
  for (let i = 0; i < limit; i++) {
    const before = new Map([world.player, ...world.npcs].map(actor => [actor.id, {x: actor.x, y: actor.y}]));
    const events = stepMovement(world, .05);
    assertPersonalSpace(world);
    assert.ok(onGraph(world));
    for (const actor of [world.player, ...world.npcs]) {
      assert.ok(distance(before.get(actor.id), actor) <= actor.speed * .05 + .0001,
        `${actor.id} must walk rather than jump to a passing point`);
    }
    if (events.length) return events;
  }
  assert.fail(`route to ${world.player.destination ?? world.player.approachTargetId} did not finish`);
}

test('both companions are reachable from every district node while passers-by keep clear', () => {
  for (const from of Object.keys(MAPS.district.nodes)) for (const id of ['vera', 'max']) {
    const world = createMovement('district');
    syncCompanions(world, {mentor: true, max: true});
    moveTo(world, from);
    assert.deepEqual(walkUntilArrival(world), [{type: 'arrival', nodeId: from, interaction: null}]);
    assert.equal(moveToActor(world, id), true);
    assert.deepEqual(walkUntilArrival(world), [{type: 'arrival', nodeId: null, actorId: id, interaction: `npc:${id}`}]);
    assert.ok(distance(world.player, world.companions.find(actor => actor.id === id)) <= 42.001);
  }
});

test('repeated district journeys recover narrow-path traffic without overlap or false arrivals', () => {
  let seed = 17531, manoeuvred = false;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const nodes = Object.keys(MAPS.district.nodes);
  for (let run = 0; run < 8; run++) {
    const world = createMovement('district');
    syncCompanions(world, {mentor: run % 2 === 0, max: true});
    for (let journey = 0; journey < 12; journey++) {
      const node = nodes[Math.floor(random() * nodes.length)];
      moveTo(world, node, {interaction: `journey-${journey}`});
      let arrivals = [];
      for (let tick = 0; tick < 1200 && !arrivals.length; tick++) {
        const previous = {x: world.player.x, y: world.player.y};
        arrivals = stepMovement(world, .05);
        manoeuvred ||= Boolean(world.trafficManeuver);
        assertPersonalSpace(world);
        assert.ok(onGraph(world));
        assert.ok(distance(previous, world.player) <= world.player.speed * .05 + .0001);
      }
      assert.deepEqual(arrivals, [{type: 'arrival', nodeId: node, interaction: `journey-${journey}`}],
        `run ${run}, journey ${journey}: temporary passing points must never become story arrivals`);
      assert.deepEqual({x: world.player.x, y: world.player.y}, MAPS.district.nodes[node]);
    }
  }
  assert.ok(manoeuvred, 'this regression must exercise a physical backoff and resume');
});

function addressRouteAfterBusyMeeting() {
  const world=createMovement('district'),dt=1/120;
  syncCompanions(world,{mentor:true});
  for(let i=0;i<547;i++)stepMovement(world,dt);
  assert.equal(moveToActor(world,'vera'),true);
  let meeting;
  for(let i=0;i<60*120&&!meeting;i++)meeting=stepMovement(world,dt).find(e=>e.actorId==='vera');
  assert.equal(meeting?.interaction,'npc:vera');
  releaseInteraction(world);
  for(let i=0;i<1420;i++)stepMovement(world,dt);
  assert.equal(moveTo(world,'respondent',{interaction:'respondent'}),true);
  return world;
}

test('a passer-by stays in the refuge until the post-meeting address route finishes once',()=>{
  const world=addressRouteAfterBusyMeeting(),events=[];let reserved=false,refuge=false;
  for(let i=0;i<30*120&&!events.length;i++){
    events.push(...stepMovement(world,1/120));
    reserved||=Boolean(world.trafficManeuver);
    refuge||=world.npcs.some(npc=>npc.yieldUntilArrival);
    assertPersonalSpace(world);assert.ok(onGraph(world));
  }
  assert.ok(reserved&&refuge,'reproduce the crowded branch and its reserved refuge');
  assert.deepEqual(events,[{type:'arrival',nodeId:'respondent',interaction:'respondent'}]);
  assert.deepEqual({x:world.player.x,y:world.player.y},MAPS.district.nodes.respondent);
  const before=new Map(world.npcs.map(npc=>[npc.id,npc.travelled]));
  for(let i=0;i<5*120;i++){assert.deepEqual(stepMovement(world,1/120),[]);assertPersonalSpace(world);}
  assert.ok(world.npcs.every(npc=>!npc.yieldUntilArrival),'refuge ends after the player arrives');
  assert.ok(world.npcs.some(npc=>npc.travelled>before.get(npc.id)),'passers-by resume walking');
});

test('redirecting while a passer-by waits in a reserved refuge preserves the new interaction',()=>{
  const original=addressRouteAfterBusyMeeting();
  for(let i=0;i<30*120&&!original.npcs.some(npc=>npc.yieldUntilArrival);i++)stepMovement(original,1/120);
  assert.ok(original.npcs.some(npc=>npc.yieldUntilArrival));
  for(const target of ['base','north','corner']){
    const world=structuredClone(original),events=[];
    assert.equal(moveTo(world,target,{interaction:'new-'+target}),true);
    for(let i=0;i<40*120&&!events.length;i++){events.push(...stepMovement(world,1/120));assertPersonalSpace(world);}
    assert.deepEqual(events,[{type:'arrival',nodeId:target,interaction:'new-'+target}]);
    for(let i=0;i<120;i++)stepMovement(world,1/120);
    assert.ok(world.npcs.every(npc=>!npc.yieldUntilArrival));
  }
});
