#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createController}=require('./helpers/swarm270-inputs.js');
const {realInput}=require('./swarm-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.10.0'),baseline='2c007716b5ffc6ba6103bf4e4c7bd99148d6ed2d';
const clone=x=>JSON.parse(JSON.stringify(x));
async function boot(profile='current'){
 const entry=entrySnapshot();
 if(profile==='baseline')entry.sources.set('assets/citadel-swarm-v2.7.0.js',cp.execFileSync('git',['show',baseline+':assets/citadel-swarm-v2.7.0.js'],{cwd:root,encoding:'utf8'}));
 if(['mild','relaxed'].includes(profile)){const variant=profile==='mild'?{cadence:1.08,shooters:5,hostile:72,speed:.97,damage:.96,divers:6,diveEvery:1,diveTell:.25,shotGap:.75,homing:.95,pickupReach:2}:{cadence:1.3,shooters:3,hostile:56,speed:.9,damage:.88,divers:4,diveEvery:1.2,diveTell:.6,shotGap:1.4,homing:.65,pickupReach:2.8};entry.sources.set('assets/citadel-swarm-v2.7.0.js',entry.sources.get('assets/citadel-swarm-v2.7.0.js').replace(/const BALANCE_2100 = Object.freeze\([^;]+;/,'const BALANCE_2100 = Object.freeze('+JSON.stringify(variant)+');'));}
 const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false');return h;
}
function play(h,{seed=417147,reaction=.35,hz=60,mode='combat',gear='standard',control='pilot',seconds=500,checkpoints=false}={}){
 const e=new h.Engine(seed);h.arcade.engine=e;e.assist=mode==='training';
 e.upgrades=gear==='standard'?{weapons:1,armor:1,rockets:0}:{weapons:0,armor:0,rockets:0};
 h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);e.beginStage(2);e.launch();
 const pilot=createController(h.c.CITADEL_SWARM,{reaction}),waves=[],snaps=[],hits=[],seen=new Set();
 let peakHostile=0,peakDivers=0,minHp=100,maxBurst=0;
 const damage=e.damage;e.damage=function(amount){const before=this.player.hp,ok=damage.call(this,amount);if(ok)hits.push({wave:this.swarm.waveIndex+1,time:+this.swarm.time.toFixed(2),amount,hp:before-this.player.hp,source:amount===24?'hull':'shot'});return ok;};
 for(let frame=0;frame<seconds*hz;frame++){
  if(e.swarm.complete||['lost','crashing'].includes(e.status))break;
  const wave=e.swarm.waveIndex;
  if(!seen.has(wave)){seen.add(wave);waves.push({wave:wave+1,count:e.enemies.length,hp:e.player.hp,time:+e.swarm.time.toFixed(2)});if(checkpoints)snaps.push(h.pack(e));}
  let command=control==='stationary'?{fire:true}:pilot(e);
  if(control==='no-fire')command={...command,fire:false,missile:false,pulse:false,flip:false};
  if(control==='no-dodge')command={...command,flip:false};
  e.step(1/hz,realInput(h,e,command,true));
  peakHostile=Math.max(peakHostile,e.hostile.length);peakDivers=Math.max(peakDivers,e.enemies.filter(x=>x.mode==='dive').length);minHp=Math.min(minHp,e.player.hp);
  assert(e.player.pos.every(Number.isFinite)&&Number.isFinite(e.player.hp));
 }
 for(const hit of hits)maxBurst=Math.max(maxBurst,hits.filter(x=>x.time>=hit.time&&x.time<hit.time+2).reduce((n,x)=>n+x.hp,0));
 const row={seed,reaction,hz,mode,gear,control,complete:e.swarm.complete,status:e.status,seconds:+e.swarm.time.toFixed(2),wave:e.swarm.waveIndex+1,kills:e.stageKills,hp:+e.player.hp.toFixed(1),minHp:+minHp.toFixed(1),peakHostile,peakDivers,maxBurst2s:+maxBurst.toFixed(1),hits:hits.length,damage:+hits.reduce((n,x)=>n+x.hp,0).toFixed(1),waves,drops:clone(e.swarm.dropsCollected)};
 return{e,row,snaps,hits};
}
async function main(){
 const profile=process.argv[2]||'current',h=await boot(profile),runs=[];fs.mkdirSync(out,{recursive:true});
 const cases=[];for(const reaction of [.25,.4])for(const seed of [417147,819337,260030,905117])cases.push({seed,reaction});
 for(const seed of [417147,819337])cases.push({seed,reaction:.35,gear:'none'});
 for(const args of cases){const r=play(h,args);runs.push(r.row);console.log(JSON.stringify(r.row));}
 const report={profile,baseline,method:'Ordinary joystick input via the current full entry; fixed controller and entry loadouts, no health/ammo/position/victory overrides during flights. Reaction is a model, not a human success probability.',runs};
 fs.writeFileSync(path.join(out,'balance-'+profile+'.json'),JSON.stringify(report,null,2)+'\n');console.log('DONE '+profile+': '+runs.filter(x=>x.complete).length+'/'+runs.length);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={boot,play,clone,out,baseline};
