#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {boot,make,play,entry}=require('./swarm270-regression.cjs');
const {entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createController}=require('./helpers/swarm270-inputs.js');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.8.0'),clone=x=>JSON.parse(JSON.stringify(x));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 fs.mkdirSync(out,{recursive:true});for(const family of ['system-ui','Segoe UI','sans-serif'])for(const style of ['','-Bold']){const file='/usr/share/fonts/truetype/dejavu/DejaVuSans'+style+'.ttf';if(fs.existsSync(file))GlobalFonts.registerFromPath(file,family);}const h=await boot(),api=h.c.CITADEL_SWARM,report={version:'2.8.0',method:'Node VM; production modules and ordinary arcadeInput. Canvas frames are native render fixtures, not browser or device-FPS evidence. Only explicitly named contract fixtures alter state.',checks:[],runs:[],frames:[]};
 const check=(name,data={})=>report.checks.push({name,pass:true,...data});
 report.files=['assets/citadel-swarm-v2.7.0.js','assets/citadel-swarm-view-v2.7.0.js'].map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
 const successful=play(h,{reaction:.1});assert(successful.metrics.complete);assert.equal(successful.metrics.kills,248);assert.equal(successful.metrics.packets,3);assert.equal(successful.metrics.lessons,2);assert.deepEqual(successful.metrics.waves.map(x=>x.count),[8,16,32,64,64,64]);report.runs.push(successful.metrics);
 const routeKinds=['bulwark','flank','intercept','orbit','serpent','siege'];assert.deepEqual(Object.keys(successful.e.swarm.routeCounts).sort(),routeKinds);assert(successful.e.swarm.torpedoesIntercepted>0);check('All six distinct combat routes and shootable torpedoes occur during a genuine passage',{routes:successful.e.swarm.routeCounts,torpedoesIntercepted:successful.e.swarm.torpedoesIntercepted});
 for(const args of [{reaction:.2},{reaction:.2,upgrades:{weapons:1,armor:1,rockets:1}},{reaction:.2,fps:30,touch:true},{reaction:.1,seed:819337},{assist:true,fps:60},{assist:true,fps:30,touch:true},{profile:'stationary-fire'},{profile:'no-fire'}]){
  const result=play(h,args);report.runs.push(result.metrics);
  assert(result.metrics.peakEnemies<=64&&result.metrics.peakHostile<=80&&result.metrics.peakDivers<=6);assert(result.e.swarm.events.length<=24);assert(result.e.particles.length<=36&&result.e.explosions.length<=14);
  if(args.assist||args.upgrades||args.fps===30)assert(result.metrics.complete,JSON.stringify(args));
  if(args.profile)assert(!result.metrics.complete);
 }
 check('Training, improved build and 30 Hz touch commands reach the exit; stationary fire/no-fire do not',{successful:report.runs.filter(x=>x.complete).length,runs:report.runs.length});
 check('Six waves keep all projectile, diver, visual-effect and event caps');
 for(const saved of successful.checkpoints){
  const a=h.unpack(clone(saved),{seed:417147,mode:'normal'},()=>{});for(let i=0;i<75;i++)a.step(1/60,{turn:.4,fire:true});const b=h.unpack(clone(h.pack(a)),{seed:a.seed,mode:'normal'},()=>{});assert.deepEqual(clone(h.pack(b)),clone(h.pack(a)));
  const pilot=createController(api,{reaction:.2});for(let i=0;i<180;i++){const input=pilot(a);a.step(1/60,input);b.step(1/60,input);}assert.deepEqual(clone(h.pack(a)),clone(h.pack(b)));
  a.pause();const paused=JSON.stringify(h.pack(a));for(let i=0;i<50;i++)a.step(1/30,{fire:true,turn:1});assert.equal(JSON.stringify(h.pack(a)),paused);
 }
 check('Each earned wave save roundtrips and continues deterministically; pause freezes state',{waves:6});
 const previous=entry();previous.sources.set('assets/citadel-swarm-v2.7.0.js',cp.execFileSync('git',['show','5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d:assets/citadel-swarm-v2.7.0.js'],{cwd:root,encoding:'utf8'}));
 const old=entryHarness(previous);await new Promise(setImmediate);old.arcade.sound=false;old.arcade.fx=false;old.run('SPACE_AUDIO.music=false');
 const oldGame=make(old);for(let i=0;i<320;i++)oldGame.step(1/60,{turn:.4,fire:true});const restored=h.unpack(clone(old.pack(oldGame)),{seed:oldGame.seed,mode:'normal'},()=>{});assert(!api.tactics(restored));const pilot=createController(old.c.CITADEL_SWARM,{reaction:.2});
 for(let i=0;i<300;i++){const input=pilot(oldGame);oldGame.step(1/60,input);restored.step(1/60,input);}assert.deepEqual(clone(h.pack(restored)),clone(old.pack(oldGame)));check('Existing 2.7 sortie retains byte-equivalent deterministic rules; new tactics require a new sortie');
 const live=make(h),references=[h.Engine.prototype.step,h.c.CITADEL_SWARM_VIEW.draw];for(const file of report.files)vm.runInContext(fs.readFileSync(path.join(root,file.file),'utf8'),h.c);assert.equal(h.Engine.prototype.step,references[0]);assert.equal(h.c.CITADEL_SWARM_VIEW.draw,references[1]);check('Reloading modules does not stack hooks');
 // Contract fixture: existing torpedo in the upward firing lane must be
 // destructible without awarding a ship kill or a requirement packet.
 const fixture=make(h);fixture.enemies=[];fixture.hostile=[{pos:[0,-40,0],vel:[0,-30,0],life:6,r:1.35,damage:22,type:'swarm-torpedo',homing:0}];fixture.bullets=[{pos:[0,-43,0],vel:[0,132,0],life:1,r:.5,damage:14,type:'laser'}];fixture.swarm.fireClock=999;fixture.swarm.diveClock=999;fixture.swarm.phase='battle';
 fixture.enemies=[{...clone(live.enemies[0]),pos:[42,50,0],from:[42,50,0]}];const kills=fixture.stageKills;fixture.step(.025,{});assert.equal(fixture.swarm.torpedoesIntercepted,1);assert.equal(fixture.stageKills,kills);assert.equal(fixture.hostile.length,0);check('Torpedo interception removes projectile and awards no fake ship kill');
 const art=h.unpack(clone(successful.checkpoints[3]),{seed:417147,mode:'normal'},()=>{});for(let i=0;i<150;i++)art.step(1/60,{});
 // Representative rendering fixtures for the three supply shapes (not gameplay).
 art.swarm.pickups=['repair','missiles','overdrive'].map((type,i)=>({id:900+i,type,pos:[-24+i*24,-15,0],age:1.1+i,life:10,r:2.5,dead:false}));
 for(const [w,he] of [[1280,720],[640,360],[390,720]])for(const fx of [true,false]){
  h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});const canvas=createCanvas(w,he),ctx=canvas.getContext('2d'),before=JSON.stringify(h.pack(art));const t=performance.now();h.c.CITADEL_SWARM_VIEW.draw(ctx,art,api.cameraFor(w,he),w,he,{fx});const ms=performance.now()-t;assert.equal(JSON.stringify(h.pack(art)),before);const name='swarm280-'+w+'x'+he+(fx?'':'-fxoff')+'.png';const buffer=canvas.toBuffer('image/png');fs.writeFileSync(path.join(out,name),buffer);report.frames.push({name,ms,width:w,height:he,fx,sha256:hash(buffer)});
 }
 check('Native render works for 64 ships and three dimensional supply types at desktop/portrait/landscape, FX on/off; state unchanged');
 const templates=Object.values(h.c.CITADEL_SWARM_VIEW.roleHulls);assert.equal(new Set(templates.map(x=>JSON.stringify(x))).size,6);assert(templates.flat().every(p=>Math.hypot(...p)<=1.001));check('Six physically honest distinct silhouettes fit unit collision disk');
 report.pass=true;fs.writeFileSync(path.join(out,'swarm280-regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:true,checks:report.checks.length,runs:report.runs.map(x=>({mode:x.mode,reaction:x.reaction,fps:x.fps,seed:x.seed,profile:x.profile,complete:x.complete,kills:x.kills,minHP:x.minHP,seconds:x.seconds})),frames:report.frames},null,2));return report;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main};
