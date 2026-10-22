#!/usr/bin/env node
'use strict';
// Independent focused design contracts, not campaign completion. Read-only
// geometry graphs plus isolated robot/lift fixtures; fixture placement and
// roster selection are explicit. No health, score or victory is overwritten.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0');
const copy=x=>JSON.parse(JSON.stringify(x)),distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
function segmentDistance(p,a,b){const x=b[0]-a[0],z=b[2]-a[2],n=x*x+z*z,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[2]-a[2])*z)/n)):0;return Math.hypot(p[0]-a[0]-x*t,p[2]-a[2]-z*t);}
function hazardous(p,hazards){return hazards.some(h=>h.active&&(h.type==='fire'&&distance(p,h.pos)<h.radius+.7||h.type==='laser-grid'&&segmentDistance(p,h.from,h.to)<h.width+.7));}
function safeSegment(a,b,hazards){const n=Math.ceil(distance(a,b)/.2);for(let i=0;i<=n;i++){const t=n?i/n:0;if(hazardous([a[0]+(b[0]-a[0])*t,0,a[2]+(b[2]-a[2])*t],hazards))return false;}return true;}
function physicalPath(h,b,start,goal,{room,half=0}={}){
 const nodes=[...b.nav.values()].filter(n=>!room||Math.abs(n.pos[0]-room.center[0])<=22&&Math.abs(n.pos[2]-room.center[2])<=18),hazards=b.missions270.hazards;
 const allowed=n=>(!half||half*(n.pos[0]-room.center[0])>=-.01)&&!hazardous(n.pos,hazards),set=new Set(nodes.filter(allowed).map(n=>n.key));
 const nearest=p=>nodes.filter(n=>set.has(n.key)&&safeSegment(p,n.pos,hazards)&&h.run('stationLine')(b,p,n.pos,.68,true)).sort((a,c)=>distance(a.pos,p)-distance(c.pos,p))[0];
 const a=nearest(start),z=nearest(goal);if(!a||!z)return null;const queue=[a.key],seen=new Set(queue),prev=new Map();
 for(let i=0;i<queue.length;i++){const key=queue[i];if(key===z.key){const points=[goal,z.pos];let p=key;while(prev.has(p)){p=prev.get(p);points.push(b.nav.get(p).pos);}points.push(start);points.reverse();return points;}
  const n=b.nav.get(key);for(const link of n.links){const to=b.nav.get(link.key);if(link.missionLift||seen.has(link.key)||!set.has(link.key)||!safeSegment(n.pos,to.pos,hazards))continue;seen.add(link.key);prev.set(link.key,key);queue.push(link.key);}}
 return null;
}
async function main(){
 const entryFile=process.argv.find(x=>x.startsWith('--entry='))?.slice(8)||'tests/entry-2.7.0.html',entry=readEntry(entryFile),h=await lab(entry),rows=[];
 assert(entry.scripts.includes('assets/citadel-base-missions-v2.7.0.js'));
 function test(name,fn){try{const data=fn();rows.push({name,pass:true,data});console.log('PASS '+name);}catch(error){rows.push({name,pass:false,error:error.stack});console.error('FAIL '+name+' '+error.message);}}
 test('Every advanced room has a safe physical route to its terminal and controls',()=>{
  const results=[];for(const level of [5,8,11,13]){const e=fixture(h,level),b=e.board;for(const room of b.definition.rooms){
   const goals=[{kind:'terminal',pos:room.terminal},...b.missions270.systems.filter(x=>x.room===room.id&&x.type!=='lift').map(x=>({kind:x.type,pos:x.pos}))];
   for(const goal of goals){const route=physicalPath(h,b,room.posts[0],goal.pos,{room});assert(route,'Safe route missing: level '+level+', room '+room.id+', '+goal.kind);results.push({level,room:room.id,goal:goal.kind,waypoints:route.length});}
   if(room.plan==='fracture'){const lift=b.missions270.systems.find(x=>x.type==='lift'&&x.room===room.id);for(const half of [-1,1]){const route=physicalPath(h,b,lift.pos,lift.target,{room,half});assert(route,'Physical bypass missing on '+(half<0?'left':'right')+' of fracture');results.push({level,room:room.id,goal:half<0?'left outer bypass':'right outer bypass',waypoints:route.length});}}
  }}return{scope:'Local room topology; doors ignored for graph construction, no lift edges, active fire/grid excluded with 0.7 m player clearance.',routes:results};
 });
 test('An actual lift trip stays docked and needs leave/re-enter to ride back',()=>{
  const e=fixture(h,13),b=e.board,s=b.missions270,lift=s.systems.find(x=>x.type==='lift'&&x.room===0);b.enemies=[];b.pos=lift.pos.slice();b.velocity=[0,0,0];
  for(let i=0;i<60*12;i++)e.step(1/60,{});
  assert.equal(e.status,'boarding');assert.equal(s.stats.liftTrips,1);assert.equal(s.transport,null);assert(lift.arrivalLatch);assert(distance(b.pos,lift.target)<.01);assert.deepEqual(copy(lift.dockPos),copy(lift.target));
  const saved=h.pack(e),restored=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(copy(restored.board.missions270.systems),copy(s.systems));
  for(let i=0;i<40;i++)e.step(1/60,{moveX:1});assert(!lift.arrivalLatch,'Leaving landing clears latch');
  for(let i=0;i<40&&!s.transport;i++)e.step(1/60,{moveX:-1});
  for(let i=0;i<60&&!s.transport;i++)e.step(1/60,{});assert(s.transport,'Stopping on the landing starts a return trip');
  for(let i=0;i<180;i++)e.step(1/60,{});assert.equal(s.stats.liftTrips,2);assert.equal(s.transport,null);assert(distance(b.pos,lift.pos)<.01);
  return{method:'Isolated non-combat fixture: enemies omitted and starting player placed on platform. Thereafter only ordinary movement and empty input; no completion/health edits.',stationarySeconds:12,trips:2,arrivalSaved:true};
 });
 test('A future-room lift cannot bypass the educational-sector lock',()=>{
  const e=fixture(h,13),b=e.board,s=b.missions270,lift=s.systems.find(x=>x.type==='lift'&&x.room===1);b.enemies=[];b.pos=lift.pos.slice();
  assert.equal(b.completed.length,0);assert(![...b.nav.values()].some(n=>n.links.some(l=>l.missionLift===lift.id)));
  for(let i=0;i<180;i++)e.step(1/60,{});assert.equal(s.stats.liftTrips,0);assert.equal(s.transport,null);assert.equal(b.completed.length,0);
  return{method:'Explicit locked-endpoint placement for access-control unit check, not a reachable playthrough.',lockedRoom:1,completedRooms:0};
 });
 test('Crossing a landing does not board, and a latched lift has a physical return path',()=>{
  const e=fixture(h,13),b=e.board,s=b.missions270,lift=s.systems.find(x=>x.type==='lift'&&x.room===0);b.enemies=[];
  b.pos=[lift.pos[0]-4,0,lift.pos[2]];b.previous=b.pos.slice();b.velocity=[0,0,0];
  for(let i=0;i<100;i++)e.step(1/60,{moveX:1});assert.equal(s.stats.liftTrips,0,'Crossing the pad sideways must not abduct the player');assert(b.pos[0]>lift.pos[0]+3);
  b.pos=lift.target.slice();b.previous=b.pos.slice();b.velocity=[0,0,0];lift.arrivalLatch=true;lift.cooldown=2.5;
  const route=h.run('stationPath')(b,b.pos,lift.pos);assert(route.length>2);let from=b.pos;
  for(const to of route){assert(h.run('stationLine')(b,from,to,.65,true),'Latched path crossed an open shaft');from=to;}
  return{method:'Isolated landing fixture, ordinary lateral movement; separate arrival-state path contract using the player collider radius 0.65 m.',sidewaysFrames:100,unwantedTrips:0,physicalReturnWaypoints:route.length};
 });
 test('A dog commits its heading and makes a real recovery window',()=>{
  const results=[];for(const assist of [false,true]){const e=fixture(h,5,assist),b=e.board,dog=b.enemies.find(x=>x.missions270?.kind==='dog'&&x.duty.room===0),c=b.definition.rooms[0].center;
   b.enemies=[dog];dog.pos=[c[0],0,c[2]-7];b.pos=[c[0],0,c[2]-1];b.velocity=[0,0,0];const m=dog.missions270;let frames=0;
   for(;frames<180&&m.phase!=='charge';frames++)e.step(1/60,{});assert.equal(m.phase,'charge');const heading=copy(m.heading);let dash=0,charge=0,recovery=0;
   for(let i=0;i<180;i++){e.step(1/60,{moveX:1});if(['charge','dash'].includes(m.phase))assert.deepEqual(copy(m.heading),heading,'Dash retargeted during commitment');if(m.phase==='charge')charge++;if(m.phase==='dash')dash++;if(m.phase==='recover'){recovery++;if(recovery>=30)break;}assert(m.gait>=0&&m.gait<Math.PI*2);}
   assert(dash>0);assert(recovery>=30);results.push({mode:assist?'calm':'normal',chargeSeconds:+(charge/60).toFixed(2),dashSeconds:+(dash/60).toFixed(2),verifiedRecoverySeconds:recovery/60});
  }return{method:'Single-dog contact fixture with ordinary lateral player input after AI acquisition.',results};
 });
 test('The mech sweeps a frozen angle and exposes recovery without tracking the dodge',()=>{
  const e=fixture(h,5),b=e.board,mech=b.enemies.find(x=>x.missions270?.kind==='mech'),c=b.definition.rooms[0].center;mech.duty.room=0;mech.pos=[c[0],0,c[2]-8];b.enemies=[mech];b.pos=[c[0],0,c[2]+3];b.velocity=[0,0,0];
  const m=mech.missions270;for(let i=0;i<180&&m.phase!=='charge';i++)e.step(1/60,{});assert.equal(m.phase,'charge');const aim=m.aimAngle,angles=[];let recovery=0;
  for(let i=0;i<240;i++){e.step(1/60,{moveX:-1});assert.equal(m.aimAngle,aim,'Laser changed target angle during active cycle');if(m.beams.length){const beam=m.beams[0],a=Math.atan2(beam.to[0]-beam.origin[0],beam.to[2]-beam.origin[2]);angles.push(Math.atan2(Math.sin(a-aim),Math.cos(a-aim)));assert(m.beams.every(q=>q.active&&q.origin.every(Number.isFinite)&&q.to.every(Number.isFinite)));}if(m.phase==='recover'){recovery++;if(recovery>=45)break;}}
  assert(angles.length>60);assert(Math.min(...angles)>=-.43&&Math.max(...angles)<=.43);for(let i=1;i<angles.length;i++)assert(angles[i]>=angles[i-1]-.00001);assert(recovery>=45);
  return{method:'Single-mech fixture relocated to unlocked room; ordinary lateral movement. No health/ammunition/completion edits.',beamFrames:angles.length,sweepRadians:+(Math.max(...angles)-Math.min(...angles)).toFixed(3),verifiedRecoverySeconds:recovery/60,hpAfter:b.hp};
 });
 test('The late mech makes a real fast flank after its cooling interval',()=>{
  const e=fixture(h,13),b=e.board,mech=b.enemies.find(x=>x.missions270?.kind==='mech'),c=b.definition.rooms[0].center,m=mech.missions270;
  mech.duty.room=0;mech.pos=[c[0],0,c[2]-12];b.enemies=[mech];b.pos=[c[0]+1,0,c[2]-8];b.velocity=[0,0,0];mech.alert=true;
  m.phase='recover';m.phaseClock=0;let cooling=0,moving=0,peak=0,distanceMoved=0,last=mech.pos.slice();
  for(let i=0;i<180;i++){const before=m.phase;e.step(1/60,{});if(before==='recover')cooling++;if(before==='reposition'){moving++;peak=Math.max(peak,m.speed);distanceMoved+=distance(last,mech.pos);assert(h.run('stationWalkable')(b,mech.pos,1.35),'Mech clipped geometry during flank');assert.equal(m.beams.length,0);if(m.phase!=='reposition')break;}last=mech.pos.slice();}
  assert(cooling/60>=1.55);assert(moving>0);assert(peak>=8.9&&peak<=9.01);assert(distanceMoved>5);
  return{method:'One live mech begins an explicit cooling-state fixture in an open lane, then advances through its own AI; no health or victory changes.',coolingSeconds:+(cooling/60).toFixed(2),movingSeconds:+(moving/60).toFixed(2),peakMetresPerSecond:+peak.toFixed(2),distanceMetres:+distanceMoved.toFixed(2)};
 });
 const result={version:'2.7.0',entry:entryFile,method:'Node VM design contracts; not browser, real-device or full-campaign evidence.',source:entry.scripts.filter(x=>x.includes('base-missions-v2.7')).map(file=>({file,sha256:crypto.createHash('sha256').update(entry.sources.get(file)).digest('hex')})),passed:rows.filter(x=>x.pass).length,total:rows.length,rows};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'design-contracts.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,total:result.total}));if(result.passed!==result.total)process.exitCode=1;return result;
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
