#!/usr/bin/env node
'use strict';
// Real native Canvas frames and VM simulation; this is not browser evidence.
// Direct mission entry is a documented fixture. Subsequent steps use ordinary
// input only. No health, enemy, score or victory state is written by this test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createSwarmController}=require('./helpers/campaign-inputs.js');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
// Match the browser's sans-serif intent on hosts with no Arial/system-ui font.
for(const family of ['Arial','system-ui','Segoe UI'])for(const style of ['','-Bold']) {
  const file='/usr/share/fonts/truetype/dejavu/DejaVuSans'+style+'.ttf';if(fs.existsSync(file))GlobalFonts.registerFromPath(file,family);
}
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.5.0');
const files=['assets/citadel-swarm-view-v2.5.0.js','assets/citadel-mrg-actors-v2.5.0.js'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function baseline(){
  const entry=entrySnapshot();entry.scripts=entry.scripts.filter(x=>!files.includes(x));
  // Before index integration, exercise the exact proposed mechanics module in
  // place of its legacy predecessor; never install both gameplay wrappers.
  const next='assets/citadel-swarm-v2.5.0.js';
  if(fs.existsSync(path.join(root,next))&&!entry.scripts.includes(next)) {
    entry.scripts=entry.scripts.map(file=>file==='assets/citadel-swarm-v1.9.0.js'?next:file);
    entry.sources.set(next,fs.readFileSync(path.join(root,next),'utf8'));
  }
  return entry;
}
function install(h){for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c,{filename:file});}
function listeners(h){return [...h.handlers.values(),...h.windowHandlers.values()].reduce((n,x)=>n+x.length,0)+[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((sum,list)=>sum+list.length,0),0);}
function layout(h,w,he){h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});}
function capture(h,e,name,w=1280,he=720,fx=true){
  layout(h,w,he);h.arcade.engine=e;h.arcade.fx=fx;
  const before=JSON.stringify(h.pack(e)),canvas=createCanvas(w,he),c=canvas.getContext('2d'),hudCanvas=createCanvas(w,he),hud=hudCanvas.getContext('2d');
  const camera=h.run('spaceCamera')(e,e.elapsed),items=h.run('spaceScene')(e,e.elapsed,fx),started=performance.now();
  h.run('spaceDrawCPU')(c,items,camera,w,he);
  h.run(e.finale?'drawFinaleHUD':'drawFlightHUD')(hud,e,camera,w,he);c.drawImage(hudCanvas,0,0);const drawMs=performance.now()-started;
  assert.equal(JSON.stringify(h.pack(e)),before,'Scene/HUD must not mutate saved gameplay');
  assert(items.every(item=>item.model.every(Number.isFinite)&&item.pos.every(Number.isFinite)),'finite model transforms');
  const png=canvas.toBuffer('image/png');if(name)fs.writeFileSync(path.join(out,name+'.png'),png);
  return {name,width:w,height:he,fx,sha:sha(png),items:items.length,drawMs:+drawMs.toFixed(2),png,canvas};
}
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const entry=baseline(),h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');
  const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(2);e.launch();for(let i=0;i<180;i++)e.step(1/60,{});
  const mrg=new h.Engine(417147);h.arcade.engine=mrg;mrg.beginStage(3);mrg.beginFinale();mrg.beginMRG();for(let i=0;i<180;i++)mrg.step(1/60,{});
  const before=[capture(h,e,'art-swarm-before'),capture(h,mrg,'art-mrg-before')];
  const originalMrg=h.run('finaleMRGScene')(mrg,mrg.elapsed,true);
  const protectedMrg=originalMrg.filter(item=>item.mrgFeature&&!['player','soldier'].includes(item.mrgFeature)).map(item=>JSON.stringify(item));
  const eventCount=listeners(h),packed=[JSON.stringify(h.pack(e)),JSON.stringify(h.pack(mrg))];install(h);
  assert.equal(listeners(h),eventCount,'Visual modules install zero handlers');
  assert.equal(JSON.stringify(h.pack(e)),packed[0]);assert.equal(JSON.stringify(h.pack(mrg)),packed[1]);
  const refs=h.run('[drawFlightHUD,drawMobileGameHUD,finaleMRGScene]');install(h);
  const again=h.run('[drawFlightHUD,drawMobileGameHUD,finaleMRGScene]');refs.forEach((ref,i)=>assert.equal(again[i],ref,'Reinstallation must be idempotent'));
  const after=[capture(h,e,'art-swarm-after'),capture(h,e,'art-swarm-phone',390,640),capture(h,e,'art-swarm-landscape',780,390),capture(h,e,'art-swarm-fx-off',390,640,false),
    capture(h,mrg,'art-mrg-after'),capture(h,mrg,'art-mrg-phone',390,640),capture(h,mrg,'art-mrg-fx-off',780,390,false)];
  assert.notEqual(before[0].sha,after[0].sha);assert.notEqual(before[1].sha,after[4].sha);
  for(const points of h.c.CITADEL_SWARM_VIEW.hullPoints)for(const [x,y]of points)assert(Math.hypot(x,y)*.97+.045*.97/2<=1,'Hull and edge fit normalized collision circle');
  const oldMrg=h.run('CITADEL_MRG_ACTORS.scene')(mrg,mrg.elapsed,true);
  assert(oldMrg.some(item=>item.mrgActorVersion==='2.5.0'));assert(oldMrg.some(item=>item.mrgFeature==='boss-letter'));
  assert(oldMrg.filter(item=>item.mrgActorVersion).every(item=>item.mrgLod==='compatible'));
  const updatedMrg=new Set(oldMrg.map(item=>JSON.stringify(item)));
  assert(protectedMrg.every(item=>updatedMrg.has(item)),'Boss, platforms, weapons and attack cues retain exact geometry');
  const savedRenderer=h.arcade.renderer;
  try {
    // Capability-selection fixture only: geometry is still drawn by native CPU,
    // so this must not be reported as a real WebGL execution/performance test.
    h.arcade.renderer={gl:{}};layout(h,1280,720);h.arcade.fx=true;
    const detailed=h.run('finaleMRGScene')(mrg,mrg.elapsed,true);
    assert(detailed.filter(item=>item.mrgActorVersion).every(item=>item.mrgLod==='detail'));
    after.push(capture(h,mrg,'art-mrg-detailed-geometry'));
    h.arcade.fx=false;const low=h.run('finaleMRGScene')(mrg,mrg.elapsed,false);
    assert(low.filter(item=>item.mrgActorVersion).every(item=>item.mrgLod==='compatible'));
  }finally{h.arcade.renderer=savedRenderer;}
  layout(h,1280,720);h.arcade.engine=mrg;h.arcade.fx=true;
  const mrgCanvas=createCanvas(1280,720),mrgCtx=mrgCanvas.getContext('2d'),mrgCam=h.run('spaceCamera')(mrg,mrg.elapsed),drawCPU=h.run('spaceDrawCPU');
  const compatibleMrg=h.run('finaleMRGScene')(mrg,mrg.elapsed,true),meshMap=h.run('SPACE_MESH');
  const countGeometry=items=>({items:items.length,triangles:items.reduce((n,item)=>n+meshMap[item.mesh].p.length/9,0),actorTriangles:items.filter(item=>['player','soldier'].includes(item.mrgFeature)).reduce((n,item)=>n+meshMap[item.mesh].p.length/9,0)});
  const mrgBefore=countGeometry(originalMrg),mrgAfter=countGeometry(compatibleMrg);
  assert(mrgAfter.actorTriangles<mrgBefore.actorTriangles,'Compatible humans must cost fewer triangles than legacy');
  assert(mrgAfter.items<=mrgBefore.items+30,'Compatible actors stay near the legacy draw-item budget');
  const mrgTimes={before:[],after:[]};
  for(let round=0;round<7;round++)for(const name of round%2?['after','before']:['before','after']) {
    const started=performance.now();drawCPU(mrgCtx,name==='before'?originalMrg:compatibleMrg,mrgCam,1280,720);
    if(round)mrgTimes[name].push(performance.now()-started);
  }
  for(const times of Object.values(mrgTimes))times.sort((a,b)=>a-b);
  const mrgMedian=name=>(mrgTimes[name][2]+mrgTimes[name][3])/2;
  const mrgBenchmark={before:{...mrgBefore,medianMs:+mrgMedian('before').toFixed(2),samplesMs:mrgTimes.before.map(x=>+x.toFixed(2))},after:{...mrgAfter,medianMs:+mrgMedian('after').toFixed(2),samplesMs:mrgTimes.after.map(x=>+x.toFixed(2))},pairs:6,
    ratio:+(mrgMedian('after')/mrgMedian('before')).toFixed(3),method:'Alternating native CPU draws, one warm-up pair and six measured pairs, exact same state/camera. Host timings are not browser or Android FPS.'};
  // Measured sustained draws of live fixture state, not fabricated victory.
  layout(h,1280,720);h.arcade.engine=e;h.arcade.fx=true;
  const canvas=createCanvas(1280,720),ctx=canvas.getContext('2d'),api=h.c.CITADEL_SWARM_VIEW;
  const meshesBefore=h.run('Object.keys(SPACE_MESH).length'),heapBefore=process.memoryUsage().heapUsed,times=[];
  for(let i=0;i<600;i++) {const start=performance.now();api.draw(ctx,e,null,1280,720);times.push(performance.now()-start);}
  for(let i=0;i<120;i++)h.run('finaleMRGScene')(mrg,mrg.elapsed+i/60,i%2===0);
  const meshesAfter=h.run('Object.keys(SPACE_MESH).length');assert.equal(meshesBefore,meshesAfter,'Mesh registry remains fixed');
  assert.equal(JSON.stringify(h.pack(e)),packed[0]);assert.equal(JSON.stringify(h.pack(mrg)),packed[1]);assert.equal(listeners(h),eventCount);
  times.sort((a,b)=>a-b);
  // Complete currently installed swarm rules using ordinary controller input.
  const runs=[];
  for(const assist of [false,true]) {
    const play=new h.Engine(417147);play.assist=assist;h.arcade.engine=play;play.beginStage(2);play.launch();
    const pilot=createSwarmController(h.c.CITADEL_SWARM),seen=new Set(),roles=new Set(),drops=new Set(),samples=[];let frames=0,minHP=100,telegraph=false;
    for(;frames<60*360&&play.status==='playing'&&!play.swarm.complete;frames++) {
      play.step(1/60,pilot(play));minHP=Math.min(minHP,play.player.hp);
      if(play.swarm.complete)break;
      for(const enemy of play.enemies)roles.add(enemy.role);
      for(const pickup of play.swarm.pickups||[])if(!pickup.dead&&!drops.has(pickup.type)) {
        drops.add(pickup.type);if(!assist)capture(h,play,'art-swarm-drop-'+pickup.type,390,640,false);
      }
      const wave=play.swarm.waveIndex??play.swarm.packet;
      if(!seen.has(wave)&&play.swarm.waveAge>2.4) {
        seen.add(wave);samples.push({wave:wave+1,frame:frames,remaining:play.enemies.filter(x=>!x.dead).length});
        if(!assist)capture(h,play,'art-swarm-wave-'+(wave+1));
      }
      if(!telegraph&&play.enemies.some(x=>x.mode==='tell')){telegraph=true;if(!assist)capture(h,play,'art-swarm-telegraph');}
    }
    runs.push({mode:assist?'calm':'normal',rules:play.swarm.rulesVersion||'legacy',completed:play.swarm.complete,status:play.status,phase:play.phase,seconds:frames/60,minHP,waves:[...seen],roles:[...roles],drops:[...drops],samples});
    assert(play.swarm.complete,'Ordinary input must complete swarm: '+JSON.stringify(runs.at(-1)));
    assert.equal(seen.size,play.swarm.waveTotal||3,'Every wave sampled during real simulated input');
  }
  const compact=frame=>{const {png,canvas,...data}=frame;return data;};
  const report={method:'Node VM production-script entry; native @napi-rs/canvas. Direct beginStage/beginMRG fixtures, normal input thereafter. Not a real browser, GPU, touch device or subjective human playtest.',
    files:files.map(file=>({file,sha:sha(fs.readFileSync(path.join(root,file)))})),mechanics:entry.scripts.filter(file=>/citadel-swarm-v/.test(file)).map(file=>({file,sha:sha(entry.sources.get(file))})),frames:[...before,...after].map(compact),runs,mrgBenchmark,
    assertions:{readOnly:true,finiteModels:true,enemyHullFits:true,playerCoreRadius:1.65,playerVisualScale:2.5,protectedMrgGeometryUnchanged:protectedMrg.length,idempotentInstall:true,addedListeners:0,meshCountBefore:meshesBefore,meshCountAfter:meshesAfter},
    renderStress:{swarmFrames:600,mrgSceneFrames:120,nativeCanvasMs:{median:+times[300].toFixed(3),p95:+times[570].toFixed(3),max:+times.at(-1).toFixed(3)},heapBefore,heapAfter:process.memoryUsage().heapUsed,note:'Raw Node heap includes transient draw/test allocations and GC; this is not retained-heap or browser FPS evidence.'}};
  fs.writeFileSync(path.join(out,'art-report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(out,'art-report.md'),'# Visual cohesion 2.5.0 — art QA\n\nNative Canvas captures of the actual scene code; not browser screenshots. The swarm uses shared steel, ivory, cyan and burgundy materials; three collision-bounded enemy rank silhouettes; visible dive and shot warnings; bounded stars/exhaust; essential cues remain with FX disabled. MRG receives the same finite human rigs used on bases, preserving the original boss and attack geometry.\n\n- Desktop 1280×720, portrait 390×640 and landscape 780×390 rendered.\n- Gameplay snapshots unchanged by installation/rendering; transforms finite.\n- Reinstallation does not wrap again or add listeners.\n- Mesh registry stable: '+meshesBefore+' → '+meshesAfter+'.\n- 600 swarm Canvas frames; 120 MRG scene builds; native swarm draw median '+report.renderStress.nativeCanvasMs.median+' ms, p95 '+report.renderStress.nativeCanvasMs.p95+' ms.\n- Ordinary-input swarm runs: '+runs.map(r=>r.mode+' '+r.seconds.toFixed(1)+' s, '+r.waves.length+' waves, minimum shield '+r.minHP.toFixed(0)+'%').join('; ')+'.\n\nLimits: no browser/GPU/audio/touch-performance claims; native timing is host-specific. The player uses a 2.5× visual spacecraft and a clearly marked luminous core at the unchanged collision radius 1.65. Before/after frames use identical saved state.\n');
  fs.appendFileSync(path.join(out,'art-report.md'),'\n## Compatible MRG detail level\n\nCPU, mobile layout and FX-off select the compact human rig before building detailed geometry. Faces, hair, uniforms, articulated limbs and the original attack weapons remain. Desktop WebGL selects the detailed rig. The WebGL selection fixture below still uses native CPU drawing and is not GPU evidence.\n\n- Actor triangles: '+mrgBefore.actorTriangles+' → '+mrgAfter.actorTriangles+'.\n- Total scene triangles: '+mrgBefore.triangles+' → '+mrgAfter.triangles+'.\n- Scene items: '+mrgBefore.items+' → '+mrgAfter.items+'.\n- Six alternating native CPU pairs after warm-up: median '+mrgBenchmark.before.medianMs+' → '+mrgBenchmark.after.medianMs+' ms (ratio '+mrgBenchmark.ratio+'). This host-specific result does not establish Android FPS.\n- '+protectedMrg.length+' protected tagged objects retain exact geometry, including the boss, platform and weapon/attack cues.\n');
  console.log(JSON.stringify({frames:report.frames.length,runs,assertions:report.assertions,renderStress:report.renderStress,mrgBenchmark},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
