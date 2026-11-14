import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,commandMove,stepWorld,NODES,EDGES,HOUSE_NODES,findPath,nearestNode,MAX_STEP,WALK_SPEED} from '../src/world.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function complete(world,id,limit=3000){const events=[];for(let i=0;i<limit;i++){events.push(...stepWorld(world,.05));const a=world.actors.find(a=>a.id===id);if(!a.moving&&!a.arrivalPending)return events;}throw Error('Route did not complete');}
function onAnyEdge(p){return EDGES.some(([a,b])=>Math.abs(dist(NODES[a],p)+dist(p,NODES[b])-dist(NODES[a],NODES[b]))<.0001);}

test('all courtyard destinations are connected through explicit paths',()=>{
  for(const id of Object.keys(NODES)){const path=findPath('base',id);assert.equal(path[0],'base');assert.equal(path.at(-1),id);for(let i=1;i<path.length;i++)assert.ok(EDGES.some(([a,b])=>a===path[i-1]&&b===path[i]||b===path[i-1]&&a===path[i]));}
});
test('movement is gradual, stays on paths, and arrives exactly once with task metadata',()=>{
  const world=createWorld(),a=world.actors[0],start={x:a.x,y:a.y};
  assert.equal(commandMove(world,'anna','house-marina',{taskId:'marina'}),true);
  assert.deepEqual({x:a.x,y:a.y},start);
  const events=[];
  for(let i=0;i<1000&&a.moving;i++){const old={x:a.x,y:a.y};events.push(...stepWorld(world,.05));assert.ok(dist(old,a)<=WALK_SPEED*.05+.00001);assert.ok(onAnyEdge(a));}
  assert.equal(a.x,NODES['house-marina'].x);assert.equal(a.y,NODES['house-marina'].y);
  const arrivals=events.filter(e=>e.actorId==='anna');assert.equal(arrivals.length,1);assert.equal(arrivals[0].taskId,'marina');
  assert.equal(stepWorld(world,.1).filter(e=>e.actorId==='anna').length,0);
});
test('mid-edge redirects do not teleport or cut through courtyard buildings',()=>{
  const world=createWorld(),a=world.actors[0];commandMove(world,'anna','house-yuri');for(let i=0;i<10;i++)stepWorld(world,.05);
  const old={x:a.x,y:a.y};commandMove(world,'anna','house-marina');assert.deepEqual({x:a.x,y:a.y},old);
  while(a.moving){stepWorld(world,.05);assert.ok(onAnyEdge(a));}
  assert.equal(a.node,'house-marina');
});
test('staff move independently while idle residents eventually stroll',()=>{
  const world=createWorld();commandMove(world,'anna',HOUSE_NODES[0]);commandMove(world,'sonya',HOUSE_NODES[2]);
  const first=world.actors.map(a=>({x:a.x,y:a.y}));for(let i=0;i<80;i++)stepWorld(world,.05);
  assert.ok(dist(world.actors[0],first[0])>0);assert.equal(dist(world.actors[1],first[1]),0);assert.ok(dist(world.actors[2],first[2])>0);
  assert.ok(world.actors.filter(a=>a.type==='resident').every((a,i)=>dist(a,first[i+3])>0));
});
test('zero time pauses actors and timers; large resume gaps are capped',()=>{
  const world=createWorld();commandMove(world,'anna','house-yuri');const before=JSON.stringify(world);
  assert.deepEqual(stepWorld(world,0),[]);assert.equal(JSON.stringify(world),before);
  const start={...world.actors[0]};stepWorld(world,60);assert.ok(dist(start,world.actors[0])<=WALK_SPEED*MAX_STEP+.00001);
});
test('same-node click yields one arrival, invalid clicks and commands are safe',()=>{
  const world=createWorld();assert.equal(commandMove(world,'missing','base'),false);assert.equal(commandMove(world,'anna','missing'),false);
  commandMove(world,'anna','base',{taskId:'return'});assert.equal(stepWorld(world,0).length,0);
  assert.equal(stepWorld(world,.1).filter(e=>e.actorId==='anna').length,1);
  assert.equal(stepWorld(world,.1).filter(e=>e.actorId==='anna').length,0);
  assert.equal(nearestNode(276,346),'house-marina');assert.equal(nearestNode(NaN,0),'base');
});
test('movement simulation is deterministic for identical commands and time steps',()=>{
  const a=createWorld(),b=createWorld();commandMove(a,'lera','house-shared',{taskId:'shared'});commandMove(b,'lera','house-shared',{taskId:'shared'});
  for(let i=0;i<600;i++)assert.deepEqual(stepWorld(a,1/60),stepWorld(b,1/60));assert.deepEqual(a,b);
});
