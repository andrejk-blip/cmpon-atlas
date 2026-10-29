#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup,control}=require('./pursuit260-regression.cjs');
const {capture}=require('./pursuit260-art.cjs');
const out=path.join(__dirname,'qa-2.8.0');
(async()=>{
 const {h}=await setup(false),states=JSON.parse(fs.readFileSync(path.join(out,'pursuit-reached.json'),'utf8')),rows=[];
 const kindList=['hammer','tentacle','maw','mantis','medusa'];
 for(const kind of kindList){
  const e=h.unpack(states[kind],{seed:417147,mode:'normal'},()=>{});h.arcade.engine=e;
  for(let i=0;i<180&&e.status==='playing'&&e.pursuit.warpEntities.find(x=>x.kind===kind)?.distance-e.pursuit.travel>125;i++)e.step(1/60,control(h,e));
  for(const [width,height] of [[1280,720],[780,390]]){
   const r=capture(h,e,null,width,height,true,true);fs.writeFileSync(path.join(out,'pursuit-'+kind+'-'+width+'.png'),r.canvas.toBuffer('image/png'));
   const w=e.pursuit.warpEntities.find(x=>x.kind===kind);assert(w);assert(r.itemsRaw.some(x=>x.warpEntity===w.id));assert(r.itemsRaw.some(x=>x.warpPart==='body'));
   rows.push({kind,width,height,items:r.items,triangles:r.triangles,drawMs:r.drawMs});
  }
 }
 const e=h.unpack(states.medusa,{seed:417147,mode:'normal'},()=>{}),before=JSON.stringify(h.pack(e));
 const initial=h.run('Object.keys(SPACE_MESH).length');for(let i=0;i<90;i++)h.run('spaceScene')(e,i/60,true);assert.equal(h.run('Object.keys(SPACE_MESH).length'),initial);assert.equal(JSON.stringify(h.pack(e)),before);
 const refs=h.run('[spaceScene,spaceCamera]');h.run(fs.readFileSync(path.join(__dirname,'../assets/citadel-pursuit-view-v2.6.0.js'),'utf8'));assert(h.run('[spaceScene,spaceCamera]').every((x,i)=>x===refs[i]));
 const sources={};for(const file of ['citadel-pursuit-v2.6.0.js','citadel-pursuit-view-v2.6.0.js'])sources[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../assets',file))).digest('hex');
 const report={sources,method:'Reached states from ordinary Node VM flights. Native CPU Canvas renders, not browser/device performance.',rows,checks:['five naturally encountered monster types rendered at desktop and landscape sizes','finite transforms','drawing read-only','90 scene builds no new meshes','idempotent module load']};
 fs.writeFileSync(path.join(out,'pursuit-art.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(err=>{console.error(err);process.exitCode=1});
