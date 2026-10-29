#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup,control,play}=require('./pursuit260-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.8.0'),clone=x=>JSON.parse(JSON.stringify(x));
async function contracts(){
 const {h,e}=await setup(false),api=h.c.CITADEL_PURSUIT;const checks=[];
 for(let i=0;i<60*24&&!e.pursuit.warpEntities.length;i++)e.step(1/60,control(h,e));
 const w=e.pursuit.warpEntities.find(x=>x.schema===280);assert(w);assert(w.scale>=3);assert(api.warpKinds.length===5);
 assert(w.segments.every(x=>x.r<20),'anatomical parts, no giant enclosing invisible sphere');
 assert(api.warpHit(e,w.segments[0].pos,w.segments[0].pos,0));
 assert.equal(api.warpHit(e,[1e5,1e5,1e5],[1e5,1e5,1e5],1.8),null);checks.push('physical hit/miss');
 const snapshot=h.pack(e),res=h.unpack(snapshot,{seed:e.seed,mode:'normal'},()=>{});
 assert.deepEqual(clone(res.pursuit),clone(e.pursuit));res.pause();const paused=clone(res.pursuit);res.step(.04,{fire:true});assert.deepEqual(clone(res.pursuit),paused);checks.push('save + pause');
 // Synthetic swept collision: limb crosses the ship although both end poses miss.
 const fixture={pursuit:{warpEntities:[{id:900,segments:[{pos:[10,0,0],previous:[-10,0,0],r:2}]}]}};
 assert.equal(api.warpHit(fixture,[0,0,0],[0,0,0],0),null);
 assert(api.warpHit(fixture,[0,0,0],[0,0,0],0,true));checks.push('moving appendage cannot tunnel');
 assert(!e.enemies.some(x=>x.id===w.id));assert.equal(w.hp,undefined);checks.push('unkillable geometry');
 // Explicit isolated contact fixture; this is NOT a campaign playthrough.
 for(const dt of [1/60,1/30]){
  const {h:f,e:x}=await setup(false);for(let i=0;i<1800&&!x.pursuit.warpEntities.length;i++)x.step(1/60,control(f,x));
  const s=x.pursuit,monster=s.warpEntities[0],joint=monster.segments.find(z=>z.part==='hammer')||monster.segments.at(-1);
  x.asteroids=[];s.gates=[];s.nextGateDistance=s.nextRockDistance=s.nextWarpDistance=1e9;s.nextEncounter=1e9;x.enemies=[];x.hostile=[];
  x.player.pos=[joint.pos[0],joint.pos[1],joint.pos[2]+.5];s.travel=s.origin[2]-x.player.pos[2];s.leadTravel=s.travel+84;s.velocity=[0,0];x.player.invulnerable=0;monster.contactUntil=0;
  const before=x.player.hp,contacts=s.warpContacts;x.step(dt,{});
  assert(x.player.hp<before,'moving visible limb must remove shield');assert.equal(s.warpContacts,contacts+1);
  const after=x.player.hp;x.player.invulnerable=0;x.step(dt,{});assert.equal(x.player.hp,after,'monster cooldown prevents repeat contact burst');
 }
 checks.push('real damage + cooldown at 30/60 Hz');
 // Existing 2.6 entity retains scale and body until passed; next spawn uses new creatures.
 const saved=clone(snapshot);const legacy=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{}),old=legacy.pursuit.warpEntities[0];delete old.schema;delete old.scale;old.bodyRadius=11;
 const preserved=old.pos.slice();legacy.step(1/60,{});assert.deepEqual(clone(old.pos),clone(preserved));assert.equal(old.segments[0].r,11);checks.push('legacy entity keeps physical size');
 const shot=await setup(false),p=shot.e.player,s=shot.e.pursuit;shot.e.asteroids=[];s.gates=[];s.warpEntities=[];s.nextGateDistance=s.nextRockDistance=s.nextWarpDistance=s.nextEncounter=1e9;p.invulnerable=0;
 shot.e.hostile=[{pursuitShot:true,pos:[p.pos[0],p.pos[1],p.pos[2]-2],vel:[0,0,80],r:.8,life:2,damage:12,color:'#ffb277'}];
 const hp=p.hp;shot.e.step(1/30,{});assert(p.hp<hp);assert.equal(shot.e.hostile.length,0);checks.push('hostile projectile removes player shield in moving frame');
 return checks;
}
async function natural(){
 const results=[];for(const assist of [false,true])for(const dt of [1/60,1/30]){
  const {h,e}=await setup(assist,417147),seen=new Set(),captured={};let peak=0;
  for(let i=0;i<600/dt&&!['boarding','lost','crashing'].includes(e.status);i++){
   e.step(dt,control(h,e));
   for(const w of e.pursuit.warpEntities){peak=Math.max(peak,w.segments.length);if(w.distance-e.pursuit.travel<240&&w.distance-e.pursuit.travel>90){seen.add(w.kind);if(!captured[w.kind]&&w.distance-e.pursuit.travel<125)captured[w.kind]=h.pack(e);}}
  }
  assert.equal(e.status,'boarding','ordinary pilot must complete');assert.equal(seen.size,5,'five kinds must be encountered in ordinary flight');
  results.push({assist,Hz:Math.round(1/dt),hp:e.player.hp,time:e.pursuit.clock,warpHits:e.pursuit.warpContacts,seen:[...seen],peakSegments:peak,progress:e.pursuit.progress});
  if(!assist&&dt===1/60)fs.writeFileSync(path.join(out,'pursuit-reached.json'),JSON.stringify(captured));
 }
 return results;
}
(async()=>{fs.mkdirSync(out,{recursive:true});const report={method:'Node VM. Contracts use explicit fixtures. Four flights use ordinary steering/fire/missile and real card commands, no HP or victory edits. Not device/browser QA.',checks:await contracts(),flights:await natural(),sha:{}};for(const f of ['assets/citadel-pursuit-v2.6.0.js','assets/citadel-pursuit-view-v2.6.0.js'])report.sha[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');fs.writeFileSync(path.join(out,'pursuit-rules.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));})().catch(err=>{console.error(err);process.exitCode=1});
