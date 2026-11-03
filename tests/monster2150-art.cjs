#!/usr/bin/env node
'use strict';
// Staged production-renderer anatomy checks, not a browser/device playthrough.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,lab}=require('./release260-verifier.cjs');
const {capture}=require('./pursuit260-art.cjs');
const out=path.join(__dirname,'qa-2.15.0');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const h=await lab(readEntry('index.html')),P=h.c.CITADEL_PURSUIT,V=h.c.CITADEL_PURSUIT_VIEW;
 const e=new h.Engine(417147,()=>{});h.arcade.engine=e;h.c.CITADEL_CAMPAIGN.enable(e);e.beginStage(1);e.launch();
 const make=(kind,age=4.6,side=1)=>({id:999,schema:280,portal2130:true,kind,side,scale:3.4,center:[0,0,-130],pos:[0,0,-130],phase:age*.8,age,distance:130,segments:[],contactUntil:0});
 const rows=[];let samples=0,minClear=Infinity,maximumParts=0;
 for(const kind of P.warpKinds)for(const side of [-1,1])for(let i=0;i<72;i++){
  const w=make(kind,i/10,side);P.poseWarp(e,w,0);e.pursuit.warpEntities=[w];
  assert(w.anatomy2140);assert(!w.segments.some(j=>j.part==='rim'),'Organic ring must be gone');
  const lane=w.safeRoute2140,clear=Math.min(...w.segments.map(j=>Math.hypot(j.pos[0]-lane[0],j.pos[1]-lane[1])-j.r));
  minClear=Math.min(minClear,clear);maximumParts=Math.max(maximumParts,w.segments.length);
  assert(clear>=17.9,kind+' closes safe side route: '+clear);
  assert.equal(P.warpHit(e,[lane[0],lane[1],-250],[lane[0],lane[1],40],3),null,kind+' route blocked');
  const body=w.segments.find(j=>j.part==='body'),limb=w.segments.find(j=>j.part!=='body');
  for(const joint of [body,limb])assert(P.warpHit(e,[joint.pos[0],joint.pos[1],joint.pos[2]-40],[joint.pos[0],joint.pos[1],joint.pos[2]+40],1.8),kind+' visible anatomy has no contact');
  samples++;
 }
 for(const kind of P.warpKinds){
  const w=make(kind);P.poseWarp(e,w,0);e.pursuit.warpEntities=[w];e.asteroids=[];e.enemies=[];e.pursuit.gates=[];
  for(const [width,height] of [[780,390],[390,640]]){
   const shot=capture(h,e,null,width,height,true,true),name='monster2150-'+kind+'-'+width+'.png';
   fs.writeFileSync(path.join(out,name),shot.canvas.toBuffer('image/png'));rows.push({kind,width,height,image:name,items:shot.items,triangles:shot.triangles});
  }
  const a=[];V.renderWarp(a,e,w,1);assert(a.some(x=>x.monsterWindup2140),'No visible windup for '+kind);
  const strike=make(kind,5.8);P.poseWarp(e,strike,0);e.pursuit.warpEntities=[strike];
  const shot=capture(h,e,null,780,390,true,true);fs.writeFileSync(path.join(out,'monster2150-'+kind+'-strike.png'),shot.canvas.toBuffer('image/png'));
  // A moving joint uses the same prior/next pose as a swept contact.
  const before=strike.segments.find(j=>j.key==='limb0j14').pos.slice();strike.age+=1/30;strike.phase+=.8/30;P.poseWarp(e,strike,1/30);
  const after=strike.segments.find(j=>j.key==='limb0j14').pos,mid=before.map((v,i)=>(v+after[i])/2);
  assert(P.warpHit(e,mid,mid,1.8,true),'Moving limb has no swept contact');
  e.pursuit.warpEntities=[w];
  const first=h.run('Object.keys(SPACE_MESH).length'),saved=JSON.stringify(h.pack(e));
  for(let i=0;i<10;i++)V.renderWarp([],e,w,1);
  assert.equal(h.run('Object.keys(SPACE_MESH).length'),first,'Renderer creates unbounded meshes');assert.equal(JSON.stringify(h.pack(e)),saved,'Renderer mutates saved state');
 }
 const report={pass:true,method:'Node VM staged physical poses and native CPU drawing of production scene. No human or phone-performance claim.',samples,minClearRadius:minClear,maximumCollisionParts:maximumParts,rows};
 fs.writeFileSync(path.join(out,'monster2150-art.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
