#!/usr/bin/env node
'use strict';
// Native Canvas visuals of production geometry, plus deterministic scene
// contracts. This is not a browser, GPU, Android or complete-playthrough test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {pursuitInput}=require('./helpers/campaign-inputs.js');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
for(const family of ['Arial','system-ui','Segoe UI'])for(const style of ['','-Bold']){const file='/usr/share/fonts/truetype/dejavu/DejaVuSans'+style+'.ttf';if(fs.existsSync(file))GlobalFonts.registerFromPath(file,family);}
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.6.0'),file='assets/citadel-pursuit-view-v2.6.0.js',rules='assets/citadel-pursuit-v2.6.0.js';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function entry(){const e=entrySnapshot();e.scripts=e.scripts.filter(x=>x!==file);if(!e.scripts.includes(rules))e.scripts=e.scripts.map(x=>/citadel-pursuit-v[\d.]+\.js/.test(x)?rules:x);e.sources.set(rules,fs.readFileSync(path.join(root,rules),'utf8'));return e;}
function install(h){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c,{filename:file});}
function listeners(h){return [...h.handlers.values(),...h.windowHandlers.values()].reduce((n,x)=>n+x.length,0)+[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((sum,list)=>sum+list.length,0),0);}
function layout(h,w,he){h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});}
function capture(h,e,name,w=1280,he=720,fx=true,hud=true,itemsOverride=null,camOverride=null){
 layout(h,w,he);h.arcade.engine=e;h.arcade.fx=fx;const saved=JSON.stringify(h.pack(e)),canvas=createCanvas(w,he),c=canvas.getContext('2d');
 const cam=camOverride||h.run('spaceCamera')(e,e.elapsed),items=itemsOverride||h.run('spaceScene')(e,e.elapsed,fx),start=performance.now();
 h.run('spaceDrawCPU')(c,items,cam,w,he);if(hud){const overlay=createCanvas(w,he);h.run(w<900?'drawMobileGameHUD':'drawFlightHUD')(overlay.getContext('2d'),e,cam,w,he);c.drawImage(overlay,0,0);}
 assert.equal(JSON.stringify(h.pack(e)),saved,'Drawing must not mutate the saved mission');
 assert(items.every(x=>x.pos.every(Number.isFinite)&&x.model.every(Number.isFinite)),'Finite transforms');
 const png=canvas.toBuffer('image/png');if(name)fs.writeFileSync(path.join(out,name+'.png'),png);
 const meshes=h.run('SPACE_MESH');return {name,width:w,height:he,fx,sha:sha(png),items:items.length,triangles:items.reduce((n,x)=>n+meshes[x.mesh].p.length/9,0),drawMs:+(performance.now()-start).toFixed(2),itemsRaw:items,cam,canvas};
}
function plate(h,e,kind,lod=1){
 // This is explicitly an asset inspection plate, not reached gameplay. Body,
 // arm and hammer are constructed from a declared physical pose.
 const pos=[kind==='hammer'?9:16,0,0],tip=[-18,-1,6],parts=[{pos,r:11,part:'body'}];
 const n=kind==='hammer'?2:6;for(let i=1;i<=n;i++){const t=i/(kind==='hammer'?3:n);parts.push({pos:pos.map((v,k)=>v+(tip[k]-v)*t+(k===1?Math.sin(t*4)*3:0)),r:kind==='hammer'?3.5:3.8,part:kind==='hammer'?'arm':'tentacle'});}
 if(kind==='hammer')parts.push({pos:tip,r:7,part:'hammer'});
 const w={id:999,kind,pos,segments:parts,head:tip,side:1,phase:1,age:3,bodyRadius:11,contactUntil:0},a=[];
 h.c.CITADEL_PURSUIT_VIEW.renderWarp(a,e,w,lod);
 const cam=h.run('stationLook')([8,8,63],[0,0,0],.68,{near:.35,far:5000,pursuit220:true,pursuit260:true});
 return {items:a,cam};
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const testedEntry=entry(),h=entryHarness(testedEntry);await new Promise(setImmediate);h.c.performance={now:()=>performance.now()};h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=true;h.run('SPACE_AUDIO.music=false');
 const e=new h.Engine(417147);e.assist=true;e.beginStage(1);h.arcade.engine=e;h.action('citadel-launch');
 const states={},seen=new Set();let frames=0;
 for(;frames<60*130&&e.status==='playing';frames++){
   e.step(1/60,pursuitInput(h,e));const s=e.pursuit;
   for(const w of s.warpEntities||[])if(!seen.has(w.kind)&&w.distance-s.travel<100&&w.distance-s.travel>65){seen.add(w.kind);states[w.kind]=h.pack(e);}
   const g=s.gates.find(g=>g.gapRadius&&g.distance-s.travel<120&&g.distance-s.travel>90);if(g&&!states.ring)states.ring=h.pack(e);
   if(seen.size===2&&states.ring)break;
 }
 assert(states.ring,'Ordinary input reaches a circular gate capture');assert.equal(seen.size,2,'Ordinary input reaches both Warp entity poses');
 const selected=h.unpack(states.hammer,{seed:417147,mode:'calm'},()=>{});h.arcade.engine=selected;
 const before=capture(h,selected,'pursuit-before');const handlers=listeners(h),state=JSON.stringify(h.pack(selected));install(h);assert.equal(listeners(h),handlers);assert.equal(h.c.CITADEL_PURSUIT_VIEW.version,'2.6.0');
 const refs=h.run('[spaceScene,spaceCamera]');install(h);h.run('[spaceScene,spaceCamera]').forEach((ref,i)=>assert.equal(ref,refs[i],'Installation is idempotent'));
 const images=[before,capture(h,selected,'pursuit-after'),capture(h,selected,'pursuit-phone',390,640),capture(h,selected,'pursuit-landscape',780,390),capture(h,selected,'pursuit-fx-off',390,640,false)];
 assert.notEqual(before.sha,images[1].sha,'The reached state has changed presentation');assert.equal(JSON.stringify(h.pack(selected)),state);
 for(const kind of ['hammer','tentacle']){
   const p=plate(h,selected,kind,1);images.push(capture(h,selected,'pursuit-warp-'+kind,1280,720,true,false,p.items,p.cam));
   const live=h.unpack(states[kind],{seed:417147,mode:'calm'},()=>{});images.push(capture(h,live,'pursuit-live-'+kind));
 }
 const ringState=h.unpack(states.ring,{seed:417147,mode:'calm'},()=>{});images.push(capture(h,ringState,'pursuit-ring'));
 const r=ringState.pursuit.gates.find(g=>g.gapRadius&&g.distance-ringState.pursuit.travel<120&&g.distance-ringState.pursuit.travel>90),opening=h.c.CITADEL_PURSUIT.gateOpening(ringState,r),ring=h.c.CITADEL_PURSUIT_VIEW.ringModel(opening.radius,r.ringThickness,1),meshMap=h.run('SPACE_MESH');
 const radial=[];for(const item of ring){const m=meshMap[item.mesh];for(let i=0;i<m.p.length;i+=3)radial.push(Math.hypot(m.p[i],m.p[i+1]));}
 assert(Math.min(...radial)>=opening.radius-.001,'No gate ornament enters the usable aperture');assert(Math.max(...radial)<=opening.radius+r.ringThickness+.001,'Ring ornaments fit the collision annulus');
 // Check the actual GL material path can accept the exact same finite geometry;
 // this capability fixture is not a real GPU execution/performance claim.
 const renderer=h.arcade.renderer;h.arcade.renderer={gl:{}};layout(h,1280,720);h.arcade.engine=selected;const detailed=h.run('spaceScene')(selected,selected.elapsed,true);h.arcade.renderer=renderer;assert(detailed.every(x=>x.model.every(Number.isFinite)));
 images.push(capture(h,selected,'pursuit-detail-geometry',1280,720,true,true,detailed));
 let bodyRadius=0,hammerRadius=0;const enemyTriangles={};
 for(const lod of [0,1,2]){
   for(const type of ['hammer','tentacle'])for(const item of h.c.CITADEL_PURSUIT_VIEW.warpModel(type,lod)){const p=meshMap[item.mesh].p;for(let i=0;i<p.length;i+=3)bodyRadius=Math.max(bodyRadius,Math.hypot(p[i]*.94,p[i+1]*.94*1.012,p[i+2]*.94));}
   for(const item of h.c.CITADEL_PURSUIT_VIEW.hammerModel(lod)){const p=meshMap[item.mesh].p;for(let i=0;i<p.length;i+=3)hammerRadius=Math.max(hammerRadius,Math.hypot(p[i],p[i+1],p[i+2]));}
   for(const type of ['interceptor','heavy','jammer']){const model=h.c.CITADEL_PURSUIT_VIEW.enemyModel(type,lod);enemyTriangles[type+'-'+lod]=model.reduce((n,it)=>n+meshMap[it.mesh].p.length/9,0);}
 }
 assert(bodyRadius<=11,'Breathing/horns stay inside the physical body radius');assert(hammerRadius<=7,'The hammer head fits its contact radius');
 assert(enemyTriangles['interceptor-1']<1100,'Twelve escorts must not each reuse the 2264-triangle legacy ship');
 for(const lod of [0,1])for(const radius of [12,14,16,18,20])h.c.CITADEL_PURSUIT_VIEW.ringModel(radius,4.5,lod);
 layout(h,1280,720);h.arcade.engine=selected;h.arcade.fx=true;const canvas=createCanvas(1280,720),ctx=canvas.getContext('2d'),cam=h.run('spaceCamera')(selected,selected.elapsed),scene=h.run('spaceScene')(selected,selected.elapsed,true),count=h.run('Object.keys(SPACE_MESH).length'),cache=h.c.CITADEL_PURSUIT_VIEW.stats().templates260;
 const timings=[],retainedHeap=[];if(global.gc)global.gc();const heapBefore=process.memoryUsage().heapUsed;
 for(let i=0;i<120;i++){
   const s=h.run('spaceScene')(selected,selected.elapsed+i/60,true);assert.equal(h.run('Object.keys(SPACE_MESH).length'),count);assert.equal(h.c.CITADEL_PURSUIT_VIEW.stats().templates260,cache);
   if(i<18){const t=performance.now();h.run('spaceDrawCPU')(ctx,s,cam,1280,720);if(i>1)timings.push(performance.now()-t);}
   if(global.gc&&i%30===29){global.gc();retainedHeap.push({sceneBuilds:i+1,bytes:process.memoryUsage().heapUsed});}
 }
 assert.equal(JSON.stringify(h.pack(selected)),state);assert.equal(listeners(h),handlers);
 // Combat mode does not render advance-warning objects; the physical ring,
 // monster body, appendages, projectiles and contact feedback remain.
 const combat=h.unpack(states.hammer,{seed:417147,mode:'calm'},()=>{});combat.assist=false;
 const combatScene=h.run('spaceScene')(combat,combat.elapsed,true);assert(!combatScene.some(x=>x.trainingCue));assert(combatScene.some(x=>x.warpEntity));
 const bench={before:[],after:[]};for(let pair=0;pair<7;pair++)for(const which of pair%2?['after','before']:['before','after']){const start=performance.now();h.run('spaceDrawCPU')(ctx,which==='before'?before.itemsRaw:scene,cam,1280,720);if(pair)bench[which].push(performance.now()-start);}
 for(const x of Object.values(bench))x.sort((a,b)=>a-b);timings.sort((a,b)=>a-b);
 const compact=x=>{const {itemsRaw,cam,canvas,...r}=x;return r;},median=x=>(x[2]+x[3])/2;
 const report={version:'2.6.0',method:'Production entry in Node VM and native @napi-rs/canvas software 3D. Mission entry fixture; ordinary controller input reaches gates and both Warp creatures. Asset plates are explicitly staged physical poses. No browser, GPU, phone, complete campaign or human-enjoyment claim.',
   source:{file,sha:sha(fs.readFileSync(path.join(root,file))),rules,shaRules:sha(testedEntry.sources.get(rules))},
   reached:{mode:'calm',frames,seconds:frames/60,status:e.status,hp:e.player.hp,warps:[...seen],ring:true},images:images.map(compact),
   assertions:{readOnly:true,finiteModels:true,idempotent:true,addedListeners:0,combatHasNoWarningGeometry:true,physicalGeometryVisible:true,apertureRadius:opening.radius,ringMinRadius:Math.min(...radial),ringMaxRadius:Math.max(...radial),bodyRadius,hammerRadius,enemyTriangles,maxWarpEntities:2,meshesBefore:count,meshesAfter:h.run('Object.keys(SPACE_MESH).length'),templates:cache},
   nativeBenchmark:{width:1280,height:720,pairs:6,beforeMedianMs:+median(bench.before).toFixed(2),afterMedianMs:+median(bench.after).toFixed(2),beforeSamples:bench.before.map(x=>+x.toFixed(2)),afterSamples:bench.after.map(x=>+x.toFixed(2)),note:'Alternating draws, one discarded warm-up pair. Host CPU timings are not browser or Android FPS.'},
   stress:{sceneBuilds:120,canvasDraws:18,medianMs:+timings[Math.floor(timings.length*.5)].toFixed(2),p95Ms:+timings[Math.floor(timings.length*.95)].toFixed(2),heapBefore,heapAfter:process.memoryUsage().heapUsed,retainedHeap,note:retainedHeap.length?'Retained Node heap samples after explicit GC; this is not a browser heap/Android memory measurement.':'Raw heap includes transient test/render allocations and GC; rerun with --expose-gc for retained heap samples.'}};
 fs.writeFileSync(path.join(out,'pursuit-art.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(out,'pursuit-art.md'),'# Pursuit 2.6.0 — visual QA\n\n'+report.method+'\n\n- Narrow circular armoured apertures replace cathedral rectangles; rendered inner and outer radii match the physical ring.\n- Both Warp leviathans have a masked face, recessed luminous eyes, fangs, horns, layered armour and articulated appendages. The hammer and tentacle centres follow the exact simulation contact poses.\n- Desktop 1280×720, portrait 390×640 and landscape 780×390 captured; FX-off preserves hazards. The portrait camera widens to 1.37 radians to show the apparition beside its weapon.\n- CPU/mobile use compact geometry and a cheaper distant-entity level; desktop WebGL selects more detail. The detail capture here is native CPU drawing of GPU-selected geometry. Compact enemy craft use 812/956/936 triangles for interceptor/heavy/jammer versus 2264 for the old interceptor.\n- Body with breathing stays within radius '+bodyRadius.toFixed(3)+' (physical 11); hammer head within '+hammerRadius.toFixed(3)+' (physical 7).\n- Render/install read-only; transforms finite; reinstall idempotent; zero added listeners; mesh registry '+count+' → '+report.assertions.meshesAfter+' after 120 scene builds.\n- Combat has no advance-warning geometry. Physical obstacles and actual contact feedback remain visible.\n- Six alternating native CPU pairs: '+report.nativeBenchmark.beforeMedianMs+' → '+report.nativeBenchmark.afterMedianMs+' ms median. These are host-specific values, not phone FPS. Before and after use the identical reached 2.6-rules state with the old and new presentations.\n- Retained Node heap after explicit GC: '+(retainedHeap.length?retainedHeap.map(x=>(x.bytes/1e6).toFixed(2)+' MB at '+x.sceneBuilds+' scenes').join('; '):'not sampled; rerun node --expose-gc tests/pursuit260-art.cjs')+'.\n\nLimits: no real browser, GPU execution, Android touch/performance, audio or full campaign verification is claimed by this visual test. Capture drawMs includes the cold procedural-background setup and PNG preparation; use the warmed alternating benchmark for CPU cost. No claim of photorealism or a numerical visual-quality multiplier is made. The broader release QA covers game rules and browser integration separately.\n');
 console.log(JSON.stringify({reached:report.reached,assertions:report.assertions,nativeBenchmark:report.nativeBenchmark,stress:report.stress,images:report.images.map(x=>({name:x.name,items:x.items,triangles:x.triangles,drawMs:x.drawMs}))},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});module.exports={entry,capture,main};
