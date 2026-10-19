#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {input,snapshot}=require('./pursuit210-regression.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const out=path.join(__dirname,'qa-2.2.0');fs.mkdirSync(out,{recursive:true});
function render(h,e,name,w=1280,hh=720,hud=true){
 h.c.performance={now:()=>performance.now()};h.c.innerWidth=w;h.c.innerHeight=hh;h.c.devicePixelRatio=1;h.c.matchMedia=()=>({matches:w<900});
 const canvas=createCanvas(w,hh),overlay=createCanvas(w,hh);canvas.getBoundingClientRect=()=>({width:w,height:hh,left:0,top:0});canvas.focus=()=>{};h.arcade.canvas=canvas;
 const before=snapshot(e),start=performance.now(),cam=h.camera(e,e.elapsed),scene=h.scene(e,e.elapsed,true);
 h.draw(canvas.getContext('2d'),scene,cam,w,hh);if(hud){h.flightHUD(overlay.getContext('2d'),e,cam,w,hh);canvas.getContext('2d').drawImage(overlay,0,0);}
 assert.deepEqual(snapshot(e),before,'drawing must not mutate simulation');
 fs.writeFileSync(path.join(out,name+'.png'),canvas.toBuffer('image/png'));
 return{file:name+'.png',milliseconds:performance.now()-start,items:scene.length,...h.c.CITADEL_PURSUIT_VIEW?.stats()};
}
(async()=>{
 const entry=entrySnapshot(),h=entryHarness(entry);await new Promise(r=>setImmediate(r));h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=true;h.run('SPACE_AUDIO.music=false;');
 const e=new h.Engine(417147);e.beginStage(1);h.arcade.engine=e;h.action('citadel-launch');
 const results=[],seen=new Set();let fractureSaved=false;
 for(let i=0;i<180*60&&e.status!=='boarding';i++){
  e.step(1/60,input(h,e));const s=e.pursuit,g=s.gates.find(g=>g.distance>s.travel&&!g.crossed);
  if(s.chapter<3&&!seen.has(s.chapter)&&g&&g.distance-s.travel<155&&g.distance-s.travel>130&&s.link.connected){
   seen.add(s.chapter);const name='stage-'+(s.chapter+1);results.push(render(h,e,name));
   fs.writeFileSync(path.join(out,'checkpoint-'+name+'.json'),JSON.stringify(h.pack(e))+'\n');
   if(s.chapter===0){const bentry=entrySnapshot();bentry.scripts=bentry.scripts.filter(f=>!f.includes('pursuit-view-v2.2.0'));const before=entryHarness(bentry);await new Promise(r=>setImmediate(r));const be=before.unpack(h.pack(e),{seed:417147,mode:'normal'},()=>{});before.arcade.engine=be;results.push(render(before,be,'before-2.1.0'));}
  }
  if(!fractureSaved&&s.visual220?.fragments.length&&s.visual220.fragments.some(f=>f.life<2.7&&f.life>2&&Math.hypot(...f.pos.map((v,i)=>v-e.player.pos[i]))<110)){
   fractureSaved=true;results.push(render(h,e,'fracture'));fs.writeFileSync(path.join(out,'checkpoint-fracture.json'),JSON.stringify(h.pack(e))+'\n');
  }
 }
 assert.equal(e.status,'boarding');assert.equal(seen.size,3);assert(fractureSaved);
 fs.writeFileSync(path.join(out,'art.json'),JSON.stringify({method:'Native Canvas, ordinary pursuit commands, real collisions/damage; no health or victory edits. Before/after use identical reached state.',results,mission:h.c.CITADEL_PURSUIT.inspection(e)},null,2)+'\n');console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={render};
