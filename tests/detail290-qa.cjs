#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {pilot}=require('./helpers/convoy260-inputs.js');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','sans-serif');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.9.0');fs.mkdirSync(out,{recursive:true});
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(before=false){const ent=entrySnapshot();if(before){ent.scripts=ent.scripts.filter(x=>!x.includes('detail-v2.9')&&!x.includes('monsters-v2.9'));for(const f of ['assets/citadel-swarm-view-v2.7.0.js','assets/citadel-pursuit-view-v2.6.0.js'])ent.sources.set(f,execFileSync('git',['show','d278bf1:'+f],{cwd:root,encoding:'utf8'}));}const h=entryHarness(ent);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');return h;}
function convoy(h,stage=0,assist=false){const e=new h.Engine(417147);h.arcade.engine=e;e.assist=assist;e.beginStage(stage);e.upgrades={weapons:stage===0?1:2,armor:stage?1:0,rockets:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();return e;}
function layout(h,w,he){h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});}
function capture(h,e,w=780,he=430,fx=true){
 layout(h,w,he);h.arcade.engine=e;h.arcade.fx=fx;const saved=JSON.stringify(h.pack(e)),canvas=createCanvas(w,he),ctx=canvas.getContext('2d'),cam=h.run('spaceCamera')(e,e.elapsed),items=h.run('spaceScene')(e,e.elapsed,fx),t=performance.now();
 if(e.phase==='swarm')h.c.CITADEL_SWARM_VIEW.drawScene(ctx,e,w,he,{fx});else h.run('spaceDrawCPU')(ctx,items,cam,w,he);
 assert.equal(JSON.stringify(h.pack(e)),saved,'render is read-only');assert(items.every(x=>x.model.every(Number.isFinite)&&x.pos.every(Number.isFinite)));
 return {canvas,items,ms:+(performance.now()-t).toFixed(2),triangles:items.reduce((n,x)=>n+h.run('SPACE_MESH')[x.mesh].p.length/9,0),details:items.filter(x=>x.detail290||x.convoyMonster).length};
}
async function visuals(){
 const h=harness(),before=harness(true);await new Promise(setImmediate);const states={};
 let e=new h.Engine(417147);h.arcade.engine=e;e.start(true);e.launch();states.orbit=h.pack(e);
 e=convoy(h,0,true);const op=pilot(h,e,{reaction:.3});while(e.escort.time<5.6&&e.status==='playing')e.step(1/60,op.input());states.convoy=h.pack(e);
 const reached=JSON.parse(fs.readFileSync(path.join(__dirname,'qa-2.8.0/pursuit-reached.json'),'utf8'));states.pursuit=reached.mantis;
 e=new h.Engine(417147);h.arcade.engine=e;e.assist=true;e.beginStage(0);e.beginBoarding();states.base=h.pack(e);
 e=new h.Engine(417147);h.arcade.engine=e;e.assist=false;e.beginStage(2);e.launch();for(let i=0;i<90;i++)e.step(1/60,{});states.swarm=h.pack(e);
 e=new h.Engine(417147);h.arcade.engine=e;e.assist=true;e.beginStage(3);e.beginFinale();e.beginMRG();states.mrg=h.pack(e);
 e=new h.Engine(417147);h.arcade.engine=e;e.assist=true;e.beginStage(3);e.beginFinale();e.launchFinale();states.parallax=h.pack(e);
 const report={method:'Production functions in Node VM and native Canvas, explicit scene fixtures. Not a physical device or browser FPS test.',frames:[],checks:[]};
 const sheet=createCanvas(1280,Math.ceil(Object.keys(states).length/2)*395),sc=sheet.getContext('2d');sc.fillStyle='#0a1420';sc.fillRect(0,0,sheet.width,sheet.height);
 let index=0;
 for(const [name,snap] of Object.entries(states)){
  const live=h.unpack(snap,{seed:snap.engine.seed,mode:snap.engine.assist?'calm':'normal'},()=>{}),prior=before.unpack(snap,{seed:snap.engine.seed,mode:snap.engine.assist?'calm':'normal'},()=>{});
  const a=capture(h,live),b=capture(before,prior);assert.notDeepEqual(a.canvas.toBuffer('image/png'),b.canvas.toBuffer('image/png'),name+' must visibly change');
  fs.writeFileSync(path.join(out,name+'-780.png'),a.canvas.toBuffer('image/png'));
  const pair=createCanvas(1560,462),p=pair.getContext('2d');p.fillStyle='#0b1520';p.fillRect(0,0,1560,462);p.fillStyle='#dce9ed';p.font='17px sans-serif';p.fillText(name+' · 2.8',12,23);p.fillText(name+' · 2.9',792,23);p.drawImage(b.canvas,0,32);p.drawImage(a.canvas,780,32);fs.writeFileSync(path.join(out,name+'-comparison.jpg'),pair.toBuffer('image/jpeg',85));
  const x=(index%2)*640,y=Math.floor(index/2)*395;sc.fillStyle='#c5dfe9';sc.font='19px sans-serif';sc.fillText(name.toUpperCase(),x+14,y+26);sc.drawImage(a.canvas,x,y+34,640,353);index++;
  const saved=JSON.stringify(h.pack(live));capture(h,live,640,360,false);capture(h,live,390,640,true);capture(h,live,1280,720,true);
  // Warm all quality-dependent branches, then assert the mesh registry stays bounded.
  const renderer=h.arcade.renderer;h.arcade.renderer={gl:{}};capture(h,live,1280,720,true);h.arcade.renderer=renderer;
  const meshes=h.run('Object.keys(SPACE_MESH).length');for(let i=0;i<90;i++)h.run('spaceScene')(live,i/60,true);assert.equal(h.run('Object.keys(SPACE_MESH).length'),meshes);assert.equal(JSON.stringify(h.pack(live)),saved);
  report.frames.push({name,trianglesBefore:b.triangles,trianglesAfter:a.triangles,detailObjects:a.details,canvasDrawMsBefore:b.ms,canvasDrawMsAfter:a.ms});
 }
 fs.writeFileSync(path.join(out,'overview.jpg'),sheet.toBuffer('image/jpeg',88));
 const refs=h.run('[spaceScene,spaceSceneBase,citadelInterior,expeditionHyperScene,drawEscortHUD,drawMobileGameHUD,finaleLink,expeditionOverlay]');h.run(fs.readFileSync(path.join(root,'assets/citadel-detail-v2.9.0.js'),'utf8'));h.run('[spaceScene,spaceSceneBase,citadelInterior,expeditionHyperScene,drawEscortHUD,drawMobileGameHUD,finaleLink,expeditionOverlay]').forEach((x,i)=>assert.equal(x,refs[i]));
 report.checks=['7 scene fixtures visibly change','640 landscape, 390 portrait, 780 and 1280 widths; effects off','render does not mutate saves','finite transforms','90 repeated builds per scene without mesh growth','idempotent graphics module'];report.cache=h.c.CITADEL_DETAIL.stats();
 fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
if(require.main===module)visuals().catch(e=>{console.error(e);process.exitCode=1;});module.exports={harness,convoy,capture,layout,out,clone};
