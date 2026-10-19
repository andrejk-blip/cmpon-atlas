#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {pursuitInput}=require('./helpers/campaign-inputs.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.2.0');
const clone=x=>JSON.parse(JSON.stringify(x)),immediate=()=>new Promise(r=>setImmediate(r));
function candidate(){const e=entrySnapshot(),old='assets/citadel-pursuit-v1.9.0.js',file='assets/citadel-pursuit-v2.1.0.js';e.scripts=e.scripts.map(x=>x===old?file:x);e.sources.set(file,fs.readFileSync(path.join(root,file),'utf8'));return e;}
async function setup(assist=false,seed=417147,entry=candidate()){
 const h=entryHarness(entry);await immediate();h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false;');
 const e=new h.Engine(seed);e.assist=assist;e.beginStage(1);h.arcade.engine=e;h.action('citadel-launch');return{h,e};
}
function snapshot(e){return clone({pursuit:e.pursuit,player:e.player,enemies:e.enemies,hostile:e.hostile,bullets:e.bullets,asteroids:e.asteroids,pickups:e.pickups,status:e.status,elapsed:e.elapsed,rescued:e.rescued,decisions:e.decisions,score:e.score,entityId:e.entityId});}
function input(h,e,type='analog',fire=true){const c=pursuitInput(h,e);if(!fire)c.fire=false;
 if(type==='keyboard'){c.turn=Math.abs(c.turn)<.12?0:Math.sign(c.turn);c.pitch=Math.abs(c.pitch)<.12?0:Math.sign(c.pitch);}
 if(type==='touch'){h.arcade.keys.clear();h.arcade.joystick={x:c.turn||0,y:-(c.pitch||0)};h.arcade.firePointer=c.fire?1:null;return h.input();}
 return c;
}
async function play(assist=false,seed=417147,{type='analog',fire=true,render=false,pace=false,limit=450}={}){
 const {h,e}=await setup(assist,seed),dt=type==='touch'?1/30:1/60,peaks={enemies:0,rocks:0,gates:0,bullets:0,hostile:0},history=[],samples=[];
 let chapter=-1,connected=null,maxSpeed=0,minSpeed=999,emit=e.emit,emitChanges=0,frames=0;const began=Date.now(),renders=[];
 for(;frames<limit/dt&&e.status!=='boarding';frames++){
  if(pace)await new Promise(r=>setTimeout(r,dt*1000));
  if(['lost','crashing'].includes(e.status))break;
  const c=input(h,e,type,fire);e.step(dt,c);
  if(frames<3)emit=e.emit;else if(emit!==e.emit){emitChanges++;emit=e.emit;}
  if(e.pursuit.chapter!==chapter){chapter=e.pursuit.chapter;history.push({stage:chapter+1,time:e.pursuit.clock,hp:e.player.hp});}
  if(frames%1800===0){if(global.gc)global.gc();samples.push({wallSeconds:(Date.now()-began)/1000,seconds:e.elapsed,heap:process.memoryUsage().heapUsed,listeners:[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),emitChanges});}
  for(const [k,array]of Object.entries({enemies:e.enemies,rocks:e.asteroids,gates:e.pursuit.gates,bullets:e.bullets,hostile:e.hostile}))peaks[k]=Math.max(peaks[k],array.length);
  minSpeed=Math.min(minSpeed,e.player.speed);maxSpeed=Math.max(maxSpeed,e.player.speed);
  assert(e.player.pos.every(Number.isFinite));assert(e.pursuit.progress>=0&&e.pursuit.progress<=100);
  const channel=h.c.CITADEL_PURSUIT.channel(e);assert.equal(!!channel,h.c.CITADEL_PURSUIT.active(e)&&e.pursuit.link.connected&&['playing','paused'].includes(e.status));
  if(render&&e.phase==='pursuit'&&e.status==='playing'){
   const kind=e.pursuit.link.connected?'connected':e.pursuit.link.reason;
   if(!renders.includes(chapter+'-'+kind)&&((kind==='connected'&&e.pursuit.stageGates[chapter]===0&&e.pursuit.clock>6)||kind==='jammed')){
    const file='stage-'+(chapter+1)+'-'+kind+'.png';draw(h,e,file);renders.push(chapter+'-'+kind);
    fs.writeFileSync(path.join(out,'checkpoint-'+(assist?'calm':'normal')+'-'+(chapter+1)+'-'+kind+'.json'),JSON.stringify(h.pack(e))+'\n');
   }
  }
  if(e.phase==='pursuit')connected=e.pursuit.link.connected;
 }
 return {pass:e.status==='boarding',mode:assist?'calm':'normal',seed,type,fire,frames,wallSeconds:(Date.now()-began)/1000,status:e.status,hp:e.player.hp,score:e.score,
  inspection:h.c.CITADEL_PURSUIT.inspection(e),history,peaks,minSpeed,maxSpeed,emitChanges,samples,rendered:renders,shots:e.shots};
}
function draw(h,e,file,W=1280,H=720,dpr=1){
 const createCanvas=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,root]})).createCanvas;
 h.c.innerWidth=W;h.c.innerHeight=H;h.c.devicePixelRatio=dpr;h.c.matchMedia=()=>({matches:W<900});
 const canvas=createCanvas(W*dpr,H*dpr),overlay=createCanvas(W*dpr,H*dpr);canvas.getBoundingClientRect=()=>({width:W,height:H,left:0,top:0});canvas.focus=()=>{};h.arcade.canvas=canvas;
 const before=snapshot(e),cam=h.camera(e,e.elapsed),scene=h.scene(e,e.elapsed,true);assert(scene.every(x=>x.model.every(Number.isFinite)));
 h.draw(canvas.getContext('2d'),scene,cam,W*dpr,H*dpr);(W<900?h.mobileHUD:h.flightHUD)(overlay.getContext('2d'),e,cam,W*dpr,H*dpr);canvas.getContext('2d').drawImage(overlay,0,0);
 assert.deepEqual(snapshot(e),before,'render must be read only');fs.writeFileSync(path.join(out,file),canvas.toBuffer('image/png'));
}
async function main(){fs.mkdirSync(out,{recursive:true});const args=process.argv.slice(2),paced=args.includes('--paced');
 const modes=args.includes('--calm')?[true]:args.includes('--smoke')?[false]:[false,true],results=[];
 for(const assist of modes)for(const seed of(args.includes('--smoke')||paced?[417147]:[1,417147,620180])){
  const r=await play(assist,seed,{render:args.includes('--render'),pace:paced});results.push(r);console.log(JSON.stringify({pass:r.pass,mode:r.mode,seed,hp:r.hp,history:r.history,status:r.status,seconds:r.inspection.clock,progress:r.inspection.progress,kills:r.inspection.kills,gateCollisions:r.inspection.gateCollisions,stageGates:r.inspection.stageGates,peaks:r.peaks}));
 }
 fs.writeFileSync(path.join(out,paced?'paced-'+(modes[0]?'calm':'normal')+'.json':'mission.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(candidate().sources.get('assets/citadel-pursuit-v2.1.0.js')).digest('hex'),viewSha256:crypto.createHash('sha256').update(candidate().sources.get('assets/citadel-pursuit-view-v2.2.0.js')).digest('hex'),method:'Exact candidate entry in Node VM; ordinary steering/fire and real card answers. Isolated level 4 fixture, no health/enemy/victory edits.',results},null,2)+'\n');
 if(results.some(x=>!x.pass))process.exitCode=1;
}
module.exports={setup,play,draw,snapshot,candidate,input};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
