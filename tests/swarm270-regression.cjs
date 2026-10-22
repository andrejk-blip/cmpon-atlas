#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {realInput}=require('./swarm-regression.cjs');
const {createController}=require('./helpers/swarm270-inputs.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0'),clone=x=>JSON.parse(JSON.stringify(x));
function entry(version='2.7.0'){
 let html=fs.readFileSync(path.join(__dirname,'entry-2.6.0.html'),'utf8');
 if(version==='2.7.0')html=html.replaceAll('citadel-swarm-v2.6.0.js','citadel-swarm-v2.7.0.js').replaceAll('citadel-swarm-view-v2.6.0.js','citadel-swarm-view-v2.7.0.js');
 if(version==='2.5.0')html=fs.readFileSync(path.join(__dirname,'entry-2.5.0.html'),'utf8');
 const scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(x=>x[1].split('?')[0]);
 return{html,scripts,sources:new Map(scripts.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]))};
}
async function boot(version='2.7.0'){
 const data=entry(version),h=entryHarness(data);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false');h.entry=data;return h;
}
function make(h,assist=false,seed=417147,upgrades={weapons:0,armor:0,rockets:0}){
 const e=new h.Engine(seed);e.assist=assist;e.upgrades={...upgrades};e.beginStage(2);h.arcade.engine=e;e.launch();return e;
}
function play(h,{assist=false,seed=417147,fps=60,profile='helper',maxSeconds=600,touch=false,snapshot=null,upgrades,reaction=.2,onStep}={}){
 const e=snapshot?h.unpack(snapshot,{seed,mode:assist?'calm':'normal'},()=>{}):make(h,assist,seed,upgrades);h.arcade.engine=e;
 const pilot=createController(h.c.CITADEL_SWARM,{reaction}),waves=[],seen=new Set(),samples=[],checkpoints=[];let peakEnemies=0,peakHostile=0,peakDivers=0,minHP=100,lessons=0,cueFrames=0;
 const started=performance.now();
 for(let i=0;i<maxSeconds*fps;i++){
  if(e.status==='lesson'){e.answerLesson(h.lessonCase(e,e.lesson.caseIndex).correct);e.continueLesson();lessons++;}
  if(e.swarm.complete&&e.status==='playing'||['lost','crashing'].includes(e.status))break;
  const n=e.swarm.waveIndex??e.swarm.packet;
  if(!seen.has(n)){seen.add(n);waves.push({wave:n+1,count:e.enemies.length,start:e.swarm.time,hp:e.player.hp});checkpoints.push(h.pack(e));}
  let command=profile==='stationary-fire'?{fire:true}:pilot(e);if(profile==='no-fire')command={...command,fire:false,missile:false,pulse:false};
  const input=realInput(h,e,command,touch),before=performance.now();e.step(1/fps,input);samples.push(performance.now()-before);
  peakEnemies=Math.max(peakEnemies,e.enemies.length);peakHostile=Math.max(peakHostile,e.hostile.length);peakDivers=Math.max(peakDivers,e.enemies.filter(x=>x.mode==='dive').length);minHP=Math.min(minHP,e.player.hp);
  cueFrames+=e.enemies.filter(x=>x.fireCue>0||x.attackCue>0||x.mode==='tell').length;
  if(!e.player.pos.every(Number.isFinite)||!Number.isFinite(e.player.hp))throw Error('Nonfinite state');
  onStep?.(e,i);
 }
 samples.sort((a,b)=>a-b);const q=p=>samples[Math.min(samples.length-1,Math.floor(samples.length*p))];
 return{e,checkpoints,metrics:{mode:assist?'calm':'normal',seed,fps,touch,profile,reaction,complete:e.swarm.complete,status:e.status,seconds:e.swarm.time,minHP,hp:e.player.hp,kills:e.stageKills,score:e.score,packets:h.c.CITADEL_SWARM.completed(e),lessons,waves,peakEnemies,peakHostile,peakDivers,cueFrames,drops:e.swarm.dropsCollected,patterns:e.swarm.patternCounts||{},cpuStepMs:{median:q(.5),p95:q(.95),p99:q(.99),max:samples.at(-1)},wallSeconds:(performance.now()-started)/1000}};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const h=await boot(),report={method:'Node VM, real arcadeInput and production modules; not a browser/human difficulty assessment.',runs:[]};
 for(const assist of [false,true])for(const fps of [60,30]){const p=play(h,{assist,fps,touch:fps===30});report.runs.push(p.metrics);console.log(JSON.stringify(p.metrics));}
 for(const profile of ['stationary-fire','no-fire'])report.runs.push(play(h,{profile,maxSeconds:180}).metrics);
 report.pass=report.runs.filter(x=>x.profile==='helper').every(x=>x.complete)&&report.runs.filter(x=>x.profile!=='helper').every(x=>!x.complete);
 fs.writeFileSync(path.join(out,'swarm-regression.json'),JSON.stringify(report,null,2)+'\n');if(!report.pass)process.exitCode=1;
}
module.exports={entry,boot,make,play};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
