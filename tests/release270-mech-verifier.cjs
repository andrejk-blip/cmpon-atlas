#!/usr/bin/env node
'use strict';
// Focused physical-motion fixture, not a campaign completion. One real mech
// is placed in an unlocked room with the player. Afterwards only left movement
// during its laser cycle is supplied; no health, speed or AI phase is set.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
(async()=>{
 const entryFile=process.argv.find(x=>x.startsWith('--entry='))?.slice(8)||'tests/entry-2.7.0.html';
 const entry=readEntry(entryFile),h=await lab(entry),e=fixture(h,5),b=e.board;
 const mech=b.enemies.find(x=>x.missions270?.kind==='mech'),center=b.definition.rooms[0].center;
 mech.duty.room=0;mech.pos=[center[0],0,center[2]-8];b.enemies=[mech];
 b.pos=[center[0],0,center[2]+3];b.velocity=[0,0,0];
 const transitions=[];let previous='',distance=0,maximumSpeed=0,repositionFrames=0;
 for(let frame=0;frame<600&&e.status==='boarding';frame++){
  const before=mech.pos.slice(),phaseBefore=mech.missions270.phase;
  e.step(1/60,{moveX:['charge','beam'].includes(phaseBefore)?-1:0});
  const m=mech.missions270;
  if(m.phase!==previous){previous=m.phase;transitions.push({frame,phase:m.phase,position:mech.pos.slice()});}
  if(phaseBefore==='reposition'){
   const step=Math.hypot(mech.pos[0]-before[0],mech.pos[2]-before[2]);
   distance+=step;maximumSpeed=Math.max(maximumSpeed,step*60);repositionFrames++;
   assert(h.run('stationWalkable')(b,mech.pos,1.35),'Fast mech crossed solid collision geometry');
  }
 }
 assert(transitions.some(x=>x.phase==='beam')&&transitions.some(x=>x.phase==='recover'));
 assert(repositionFrames>0&&repositionFrames<=46,'Reposition is a finite burst');
 assert(maximumSpeed>=7.4&&maximumSpeed<=7.6,'Actual displacement must reach configured 7.5 m/s');
 assert(distance>5,'Mech really changes position between laser cycles');
 const report={pass:true,entryFile,method:'Node VM isolated physical-motion fixture. Initial roster/position selects a visible encounter; afterwards ordinary movement only. Not a full mission or browser FPS test.',
  transitions,repositionFrames,maximumSpeed:+maximumSpeed.toFixed(3),distance:+distance.toFixed(3),hpAfter:b.hp,
  source:entry.scripts.filter(x=>x.includes('base-missions-v2.7')).map(file=>({file,sha256:crypto.createHash('sha256').update(entry.sources.get(file)).digest('hex')}))};
 const file=path.join(__dirname,'qa-2.7.0','verifier-mech-motion.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:file,pass:true,maximumSpeed:report.maximumSpeed,distance:report.distance}));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
