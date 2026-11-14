/** Movement-only simulation. Coordinates use a 1000 × 700 courtyard.
 * No DOM, clock, random source, story rules or persistence are read here.
 * Commands and ticks mutate this small presentation state; story state stays
 * in engine.js. Supply dt=0 to pause. dt is capped to avoid resume teleports.
 */
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 700;
export const MAX_STEP = 0.1;
export const WALK_SPEED = 90;

export const NODES = Object.freeze({
  'house-marina': {x:275,y:345},
  'house-shared': {x:605,y:275},
  'house-yuri': {x:285,y:600},
  'house-galina': {x:800,y:520},
  west: {x:340,y:400},
  center: {x:440,y:445},
  north: {x:430,y:330},
  'north-bend': {x:500,y:295},
  east: {x:560,y:445},
  'east-path': {x:650,y:455},
  bench: {x:580,y:405},
  base: {x:510,y:560},
  'base-left': {x:460,y:590},
  'base-right': {x:555,y:590},
  'lower-west': {x:360,y:575},
  square: {x:500,y:520},
  corner: {x:660,y:580},
});

// Foot positions traced on courtyard.webp stretched from 1536 × 1024.
// The central lawn separates the north and east paths: no shortcut joins them.
// The bench branch ends on its curb apron; doors end below their entrance steps.
export const EDGES = Object.freeze([
  ['house-marina','west'], ['west','center'], ['west','north'],
  ['center','north'], ['north','north-bend'], ['north-bend','house-shared'],
  ['center','east'], ['east','bench'], ['east','east-path'],
  ['east-path','house-galina'], ['center','square'], ['square','base'],
  ['square','lower-west'], ['lower-west','house-yuri'], ['lower-west','base'],
  ['base','base-left'], ['base','base-right'], ['base','corner'],
  ['square','corner'], ['corner','house-galina'],
]);
export const HOUSE_NODES = ['house-marina','house-shared','house-yuri','house-galina'];
export const TASK_NODES = Object.freeze({marina:HOUSE_NODES[0],shared:HOUSE_NODES[1],yuri:HOUSE_NODES[2],galina:HOUSE_NODES[3],'sample-olga':HOUSE_NODES[0],'sample-daria':HOUSE_NODES[2]});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const adjacency=Object.fromEntries(Object.keys(NODES).map(id=>[id,[]]));
for(const [a,b] of EDGES){adjacency[a].push(b);adjacency[b].push(a);}

/** Shortest walkable route including its start and finish, or [] for bad IDs. */
export function findPath(from,to){
  if(!NODES[from]||!NODES[to])return [];
  const costs={[from]:0}, previous={}, open=new Set([from]), settled=new Set();
  while(open.size){
    const here=[...open].sort((a,b)=>costs[a]-costs[b]||a.localeCompare(b))[0];
    open.delete(here); if(here===to)break; settled.add(here);
    for(const next of adjacency[here]){
      if(settled.has(next))continue;
      const cost=costs[here]+distance(NODES[here],NODES[next]);
      if(cost<(costs[next]??Infinity)){costs[next]=cost;previous[next]=here;open.add(next);}
    }
  }
  if(costs[to]===undefined)return [];
  const route=[to];while(route[0]!==from)route.unshift(previous[route[0]]);
  return route;
}
function routeLength(route){let total=0;for(let i=1;i<route.length;i++)total+=distance(NODES[route[i-1]],NODES[route[i]]);return total;}

/** Touch/click snapping: returns a reachable path-node ID, not an actor teleport. */
export function nearestNode(x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return 'base';
  const p={x,y};return Object.keys(NODES).reduce((best,id)=>distance(p,NODES[id])<distance(p,NODES[best])?id:best,'base');
}

function actor(id,node,type,portraitIndex,route=[]){return {
  id,type,portraitIndex,node,x:NODES[node].x,y:NODES[node].y,dir:'right',facingY:'down',
  moving:false,path:[],destination:null,taskId:null,status:'idle',speed:type==='staff'?WALK_SPEED:65,
  walkCycle:0,travelled:0,arrivalPending:false,wait:2+portraitIndex*.4,
  wanderRoute:route,wanderIndex:0,
};}

export function createWorld(){return {elapsed:0,actors:[
  actor('anna','base','staff',0),actor('lera','base-left','staff',1),actor('sonya','base-right','staff',2),
  actor('resident-1','bench','resident',0,['west','center','square','base','bench']),
  actor('resident-2','square','resident',1,['corner','house-galina','east','center','base','square']),
  actor('resident-3','east-path','resident',2,['east','north','center','west','center','east-path']),
]};}

/** Move along the graph, including when redirecting an actor midway on an edge.
 * meta.taskId links an arrival back to an optional story assignment.
 * Same-node commands produce one arrival on the next positive tick.
 */
export function commandMove(world,actorId,destinationNodeId,meta={}){
  const a=world?.actors?.find(item=>item.id===actorId);
  if(!a||!NODES[destinationNodeId])return false;
  // Both endpoints of the occupied edge are valid reroute anchors.
  const anchors=[a.node];if(a.moving&&a.path[0]&&a.path[0]!==a.node)anchors.push(a.path[0]);
  let best=null;
  for(const anchor of anchors){
    const route=findPath(anchor,destinationNodeId);if(!route.length)continue;
    const cost=distance(a,NODES[anchor])+routeLength(route);
    if(!best||cost<best.cost)best={route,cost};
  }
  if(!best)return false;
  a.path=[...best.route];
  if(distance(a,NODES[a.path[0]])<.000001)a.path.shift();
  a.destination=destinationNodeId;a.taskId=typeof meta?.taskId==='string'?meta.taskId:null;
  a.moving=a.path.length>0;a.status=a.moving?'walking':'arrived';a.arrivalPending=!a.moving;
  return true;
}

/** Mutates world; returns this tick's one-shot arrival events. */
export function stepWorld(world,dtSeconds){
  if(!world||!Array.isArray(world.actors)||!Number.isFinite(dtSeconds)||dtSeconds<=0)return [];
  const dt=Math.min(MAX_STEP,dtSeconds),events=[];world.elapsed+=dt;
  for(const a of world.actors){
    if(a.type==='resident'&&!a.moving&&!a.arrivalPending){
      a.wait=Math.max(0,a.wait-dt);
      if(a.wait<=.000001&&a.wanderRoute.length){
        const destination=a.wanderRoute[a.wanderIndex%a.wanderRoute.length];
        a.wanderIndex=(a.wanderIndex+1)%a.wanderRoute.length;
        commandMove(world,a.id,destination);
      }
    }
    let budget=a.speed*dt;
    while(a.moving&&budget>0&&a.path.length){
      const next=NODES[a.path[0]],length=distance(a,next);
      if(Math.abs(next.x-a.x)>.001)a.dir=next.x>a.x?'right':'left';
      if(Math.abs(next.y-a.y)>.001)a.facingY=next.y>a.y?'down':'up';
      const moved=Math.min(length,budget);
      if(length>.000001){a.x+=(next.x-a.x)*moved/length;a.y+=(next.y-a.y)*moved/length;}
      a.travelled+=moved;a.walkCycle=(a.walkCycle+moved/70)%1;budget-=moved;
      if(length<=moved+.000001){
        a.node=a.path.shift();a.x=next.x;a.y=next.y;
        if(!a.path.length){a.moving=false;a.status='arrived';a.arrivalPending=true;}
      }
    }
    if(a.arrivalPending){
      a.arrivalPending=false;a.walkCycle=0;
      events.push({type:'arrival',actorId:a.id,nodeId:a.destination,taskId:a.taskId});
      if(a.type==='resident'){a.status='idle';a.wait=2;}
    }
  }
  return events;
}
