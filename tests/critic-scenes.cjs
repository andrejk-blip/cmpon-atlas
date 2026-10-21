#!/usr/bin/env node
'use strict';
// Visual fixtures only. No campaign-completion or real-browser claim.
const fs=require('node:fs'),path=require('node:path');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const out=path.join(__dirname,'qa-2.5.0');fs.mkdirSync(out,{recursive:true});
async function main(){const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');
 const scenes=[];
 for(const [name,stage,kind]of [['orbit',0,'flight'],['swarm',2,'flight'],['base',0,'base'],['mrg',3,'mrg'],['parallax',3,'parallax']]){
  const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(stage);
  if(kind==='base')e.beginBoarding();else if(kind==='mrg'){e.beginFinale();e.beginMRG();}else if(kind==='parallax'){e.beginFinale();e.launchFinale();}else e.launch();
  for(let i=0;i<180;i++)e.step(1/60,{});
  const w=1280,he=720;h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:false});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});
  const canvas=createCanvas(w,he),ctx=canvas.getContext('2d'),overlay=createCanvas(w,he),hud=overlay.getContext('2d'),cam=h.camera(e,e.elapsed),items=h.scene(e,e.elapsed,true);
  h.draw(ctx,items,cam,w,he);
  if(e.finale)h.run('drawFinaleHUD')(hud,e,cam,w,he);else if(kind==='base')h.run('drawBoardHUD')(hud,e,cam,w,he);else h.flightHUD(hud,e,cam,w,he);
  if(!e.finale&&kind!=='base'){h.campaignHUD(hud,e,cam,w,he);h.clarityHUD(hud,e,cam,w,he);}
  ctx.drawImage(overlay,0,0);fs.writeFileSync(path.join(out,'critic-'+name+'.png'),canvas.toBuffer('image/png'));scenes.push({name,stage,status:e.status,phase:e.phase,finale:e.finale?.phase,items:items.length});
 }
 fs.writeFileSync(path.join(out,'critic-scenes.json'),JSON.stringify({method:'Production scene/HUD native Canvas initial fixtures at 3 seconds, no altered health or outcomes. Not browser/playthrough evidence.',scenes},null,2));console.log(scenes);
}
main().catch(e=>{console.error(e);process.exitCode=1});
