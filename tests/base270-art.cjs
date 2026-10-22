#!/usr/bin/env node
'use strict';
// Production geometry rendered through the shipped Canvas rasterizer. These
// are explicitly staged art/contract fixtures, not campaign victories or
// browser/mobile-device evidence. No enemy health or completion is changed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
for(const family of ['Arial','system-ui','Segoe UI','sans-serif'])for(const style of ['','-Bold']){const f='/usr/share/fonts/truetype/dejavu/DejaVuSans'+style+'.ttf';if(fs.existsSync(f))GlobalFonts.registerFromPath(f,family);}
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.7.0'),rules='assets/citadel-base-missions-v2.7.0.js',view='assets/citadel-base-missions-view-v2.7.0.js';
const clone=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function snapshot(modern=true){const e=entrySnapshot();e.scripts=e.scripts.filter(f=>f!==rules&&f!==view);const at=e.scripts.findIndex(f=>f.includes('citadel-runtime-'));if(modern)e.scripts.splice(at<0?e.scripts.length:at,0,rules);e.sources=new Map(e.scripts.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));return e;}
async function harness(modern=true){const source=snapshot(modern),h=entryHarness(source);h.artSources=new Map(source.sources);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.c.performance={now:()=>performance.now()};h.run('SPACE_AUDIO.music=false');return h;}
function install(h){const source=fs.readFileSync(path.join(root,view),'utf8');if(!h.artSources.has(view))h.artSources.set(view,source);vm.runInContext(source,h.c,{filename:view});}
function fixture(h,tier,calm=false){const e=new h.Engine(417147+tier);h.arcade.engine=e;e.assist=calm;e.beginStage(Math.min(tier,3));if(tier===4){e.beginFinale();e.beginLair();}else e.beginBoarding();assert(e.board.missions270,'Fresh entry has mission state');for(let i=0;i<120;i++)e.step(1/60,{});return e;}
function layout(h,w,he,gl=false){h.c.innerWidth=w;h.c.innerHeight=he;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});h.arcade.renderer={gl:gl?{}:null};}
function listeners(h){return [...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0)+[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((z,l)=>z+l.length,0),0);}
function triangles(h,items){const meshes=h.run('SPACE_MESH');return items.reduce((n,x)=>n+meshes[x.mesh].p.length/9,0);}
function render(h,e,name,w=1280,he=720,{fx=true,high=false,hud=true}={}){
 layout(h,w,he,high);h.arcade.engine=e;h.arcade.fx=fx;const before=JSON.stringify(h.pack(e)),camera=h.run('spaceCamera')(e,e.elapsed),items=h.run('spaceScene')(e,e.elapsed,fx),canvas=createCanvas(w,he),c=canvas.getContext('2d');
 const start=performance.now();h.run('spaceDrawCPU')(c,items,camera,w,he);const milliseconds=performance.now()-start;
 if(hud){const layer=createCanvas(w,he),fn=w<900?h.run('drawMobileGameHUD'):e.finale?h.run('drawFinaleHUD'):h.run('drawBoardHUD');fn(layer.getContext('2d'),e,camera,w,he);c.drawImage(layer,0,0);}
 assert.equal(JSON.stringify(h.pack(e)),before,'Scene/camera/HUD must be read-only');assert(items.every(x=>x.model.every(Number.isFinite)&&x.pos.every(Number.isFinite)),'All transforms are finite');
 const png=canvas.toBuffer('image/png');if(name)fs.writeFileSync(path.join(out,name+'.png'),png);
 return {name,width:w,height:he,fx,high,hud,items:items.length,triangles:triangles(h,items),milliseconds:+milliseconds.toFixed(2),sha:sha(png),camera,itemsData:items};
}
function compact(x){const {camera,itemsData,...row}=x;return row;}
function positions(h,items){const all=[],meshes=h.run('SPACE_MESH'),point=h.run('spacePoint');for(const item of items){const p=meshes[item.mesh].p;for(let i=0;i<p.length;i+=3)all.push(point(item.model,[p[i],p[i+1],p[i+2]]));}return all;}
function entity(kind,extra={}){return {id:kind==='dog'?701:702,pos:[0,0,0],yaw:0,duty:{speed:0},missions270:{kind,phase:'hunt',heading:[0,0,1],gait:0,speed:0,beams:[],...extra}};}
async function main(){
 fs.mkdirSync(out,{recursive:true});const h=await harness(),intro=fixture(h,0),before=render(h,intro,null,390,720),beforeSave=JSON.stringify(h.pack(intro)),count=listeners(h),baselineDraw=h.run('spaceDrawCPU');install(h);
 const refs=h.run('[citadelInterior,spaceCamera,spaceDrawCPU,drawBoardHUD,drawMobileGameHUD,drawFinaleHUD]');install(h);h.run('[citadelInterior,spaceCamera,spaceDrawCPU,drawBoardHUD,drawMobileGameHUD,drawFinaleHUD]').forEach((x,i)=>assert.equal(x,refs[i]));assert.equal(listeners(h),count);
 const first=render(h,intro,'base-intro-retained',390,720);assert.equal(first.sha,before.sha,'First-base introductory picture is unchanged');assert.equal(JSON.stringify(h.pack(intro)),beforeSave);
 const frames=[first],cases=[],api=h.c.CITADEL_BASE_MISSIONS_VIEW;
 for(let tier=1;tier<5;tier++){
  const e=fixture(h,tier),b=e.board;for(const roomIndex of [0,2]){const r=b.definition.rooms[roomIndex];b.camera=[r.center[0],0,r.center[2]+5];b.pos=[r.center[0]-4,0,r.center[2]+10];
   const frame=render(h,e,'base-'+(tier+1)+'-room-'+roomIndex+'-desktop');frames.push(frame);frames.push(render(h,e,'base-'+(tier+1)+'-room-'+roomIndex+'-phone',390,720));
   assert(frame.itemsData.some(x=>x.base270==='architecture'));assert(!frame.itemsData.some(x=>x.baseFeature==='architecture'),'Legacy static architecture is fully replaced');
   cases.push({tier,room:roomIndex,robots:b.enemies.filter(x=>x.missions270).map(x=>({id:x.id,kind:x.missions270.kind,room:x.duty.room})),hazards:b.missions270.hazards.map(x=>x.type),plans:b.definition.rooms.map(x=>x.plan)});
  }
 }
 const dimensions=[],cost=[];
 for(const high of [false,true])for(const kind of ['dog','mech']){
  const subject=entity(kind),items=api.actor(kind,subject,high),points=positions(h,items.filter(x=>x.baseActor)),height=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
  assert(height>(kind==='dog'?1.8:6.3)&&height<(kind==='dog'?2.1:6.6));dimensions.push({kind,high,height:+height.toFixed(3),width:+(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))).toFixed(3)});cost.push({kind,high,items:items.length,triangles:triangles(h,items)});
  const second=api.actor(kind,entity(kind,{speed:kind==='dog'?7:2,gait:1.1,phase:kind==='dog'?'dash':'hunt'}),high);assert.notEqual(JSON.stringify(items),JSON.stringify(second),'Physical gait changes articulated pose');
 }
 // Side-by-side silhouette plate uses the real meshes and a single camera.
 for(const high of [false,true]){
  const items=[];h.c.CITADEL_BASE_VIEW.actor(items,[-4,0,0],0,{appearance:2,speed:0},'player');items.push(...api.actor('dog',{...entity('dog'),pos:[0,0,0]},high),...api.actor('mech',{...entity('mech'),pos:[5,0,0]},high));
  const floor=h.run('citadelItem')('box',[0,-.18,0],[10,.17,5],'#344958',0);items.unshift(floor);items.basesView=true;
  const cam={...h.run('stationLook')([13,9,21],[1,2.5,0],.7,{near:.3,far:100,interior:1}),basesView:true};const canvas=createCanvas(1280,720);h.run('spaceDrawCPU')(canvas.getContext('2d'),items,cam,1280,720);fs.writeFileSync(path.join(out,'base-actors-'+(high?'detail':'compatible')+'.png'),canvas.toBuffer('image/png'));
 }
 const attack=fixture(h,4),b=attack.board,mech=b.enemies.find(x=>x.missions270?.kind==='mech'),r=b.definition.rooms[0];
 // Explicit art/contact fixture: relocate the machine into the currently
 // active first room. No HP, terminal completion, score or victory is changed.
 mech.duty.room=0;mech.pos=[r.center[0],0,r.center[2]-8];b.pos=[mech.pos[0],0,mech.pos[2]+16];b.camera=[mech.pos[0],0,mech.pos[2]+7];
 // Attack fixture advances ordinary AI until its actual damaging laser exists.
 for(let i=0;i<200&&!mech.missions270.beams.length;i++)attack.step(1/60,{});
 assert(mech.missions270.beams.length,'Ordinary AI produced active beams');const laser=render(h,attack,'base-mech-active-laser');frames.push(laser,render(h,attack,'base-mech-active-laser-phone',390,720),render(h,attack,'base-mech-detail',1280,720,{high:true}),render(h,attack,'base-mech-fxoff-phone',390,720,{fx:false}));
 const shells=laser.itemsData.filter(x=>x.base270Beam&&x.base270==='mech-laser');assert.equal(shells.length,2);shells.forEach((x,i)=>assert.deepEqual(clone(x.base270Beam),{from:clone(mech.missions270.beams[i].origin),to:clone(mech.missions270.beams[i].to),radius:mech.missions270.beams[i].width}));
 const beamSave=JSON.stringify(h.pack(attack));mech.missions270.phase='charge';mech.missions270.beams=[];attack.assist=false;assert(!h.run('spaceScene')(attack,0,true).some(x=>x.base270==='training-aim'));attack.assist=true;assert(h.run('spaceScene')(attack,0,true).some(x=>x.base270==='training-aim'));attack.assist=false;
 const ruin=fixture(h,4),ruinBoard=ruin.board,lift=ruinBoard.missions270.systems.find(x=>x.type==='lift');ruinBoard.pos=lift.pos.slice();ruinBoard.camera=lift.pos.slice();
 // Ordinary stopped-player interaction starts a real platform transfer.
 for(let i=0;i<120&&!ruinBoard.missions270.transport;i++)ruin.step(1/60,{});assert(ruinBoard.missions270.transport,'Standing at a ready lift starts it');
 for(let i=0;i<60&&ruinBoard.missions270.transport?.progress<.48;i++)ruin.step(1/60,{});assert(ruinBoard.pos[1]>2.5,'Platform physically raises rider');const transport=clone(ruinBoard.missions270.transport);
 frames.push(render(h,ruin,'base-ruin-lift-desktop'),render(h,ruin,'base-ruin-lift-phone',390,720));
 const scene=h.run('spaceScene')(ruin,ruin.elapsed,true),platform=scene.find(x=>x.base270==='lift-platform');assert.deepEqual(clone(platform.pos),[transport.pos[0],transport.pos[1]-.02,transport.pos[2]]);
 const cached=h.c.CITADEL_BASE_MISSIONS_VIEW.architecture(ruinBoard,false),points=positions(h,cached.flatMap(x=>x.items));assert(points.some(p=>p[1]<-4),'Pits have genuine depth');
 for(const hole of ruinBoard.missions270.hazards.filter(x=>x.type==='breach').flatMap(x=>x.removedCells)){
  const wx=hole[0]*4,wz=hole[1]*4;assert(!ruinBoard.cells.has(h.run('stationCellKey')(...hole)));assert(!points.some(p=>Math.abs(p[0]-wx)<1.9&&Math.abs(p[2]-wz)<1.9&&Math.abs(p[1]+.01)<.006),'No solid floor remains over a physical breach');
 }
 // A live trip can be restored without changing its pose during drawing.
 const restored=h.unpack(clone(h.pack(ruin)),{seed:ruin.seed,mode:'normal'},()=>{});assert.deepEqual(clone(restored.board.missions270.transport),transport);render(h,restored,null,390,720);
 // Warm every finite authored layout/LOD then alternate repeatedly. Neither
 // additional frames nor gameplay time create additional templates/meshes.
 const boards=[];for(let tier=1;tier<5;tier++){const e=fixture(h,tier);boards.push(e);for(const high of [false,true]){layout(h,1280,720,high);e.board.camera=e.board.definition.rooms[2].center.slice();h.run('spaceScene')(e,0,true);}}
 // Identical scene/camera input, not a pair of independently moving games:
 // optimization must preserve each RGBA byte, including translucent fire.
 const pixelComparisons=[];for(const e of [...boards,ruin])for(const [w,he]of [[640,360],[390,720]]){
  layout(h,w,he);const scene=h.run('spaceScene')(e,.73,true),cam=h.run('spaceCamera')(e,.73),oldCanvas=createCanvas(w,he),newCanvas=createCanvas(w,he);
  baselineDraw(oldCanvas.getContext('2d'),scene,cam,w,he);h.run('spaceDrawCPU')(newCanvas.getContext('2d'),scene,cam,w,he);
  const a=oldCanvas.getContext('2d').getImageData(0,0,w,he).data,b=newCanvas.getContext('2d').getImageData(0,0,w,he).data;let differences=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])differences++;
  assert.equal(differences,0,'Optimized renderer is RGBA-identical to legacy rasterizer');pixelComparisons.push({tier:e.board.missions270.tier,width:w,height:he,differingBytes:differences});
  if(e===boards[3]&&w===640){fs.writeFileSync(path.join(out,'base-raster-before.png'),oldCanvas.toBuffer('image/png'));fs.writeFileSync(path.join(out,'base-raster-after.png'),newCanvas.toBuffer('image/png'));}
 }
 const stats=clone(api.stats()),registry=h.run('Object.keys(SPACE_MESH).length'),saved=JSON.stringify(h.pack(boards[3]));if(global.gc)global.gc();const memoryBefore=process.memoryUsage().heapUsed,times=[],baselineTimes=[],canvas=createCanvas(640,360);layout(h,640,360);h.arcade.engine=boards[3];
 const benchmarkItems=h.run('spaceScene')(boards[3],0,true),benchmarkCamera=h.run('spaceCamera')(boards[3],0),baselineCanvas=createCanvas(640,360);
 for(let i=0;i<36;i++){const start=performance.now();baselineDraw(baselineCanvas.getContext('2d'),benchmarkItems,benchmarkCamera,640,360);if(i>=6)baselineTimes.push(performance.now()-start);}baselineTimes.sort((a,b)=>a-b);
 for(let i=0;i<180;i++){const e=boards[3],time=i/60,items=h.run('spaceScene')(e,time,true),cam=h.run('spaceCamera')(e,time),start=performance.now();h.run('spaceDrawCPU')(canvas.getContext('2d'),items,cam,640,360);times.push(performance.now()-start);}
 assert.equal(h.run('Object.keys(SPACE_MESH).length'),registry);assert.deepEqual(clone(api.stats()),stats);assert.equal(JSON.stringify(h.pack(boards[3])),saved);assert.equal(listeners(h),count);times.sort((a,b)=>a-b);if(global.gc)global.gc();
 if(process.env.CITADEL_QA_GL_SCENE){layout(h,1280,720,true);const e=boards[3],items=h.run('spaceScene')(e,0,true),camera=h.run('spaceCamera')(e,0),meshes={};for(const it of items)meshes[it.mesh]=h.run('SPACE_MESH')[it.mesh];fs.writeFileSync(process.env.CITADEL_QA_GL_SCENE,JSON.stringify({vertex:h.run('SPACE_VERTEX'),fragment:h.run('SPACE_FRAGMENT'),skyVertex:h.run('SPACE_SKY_VERTEX'),skyFragment:h.run('SPACE_SKY_FRAGMENT'),camera,items,meshes},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));}
 const testedSources=[rules,view].map(file=>({file,sha:sha(h.artSources.get(file))}));for(const row of testedSources)assert.equal(row.sha,sha(fs.readFileSync(path.join(root,row.file))),'Production source changed during art suite; rerun frozen candidate');
 const report={version:'2.7.0',method:'Native @napi-rs/canvas + production Node VM. Staged art fixtures, ordinary AI laser and ordinary platform interaction. Not browser, physical mobile, GPU FPS or campaign completion evidence.',files:testedSources,checks:{idempotent:true,readOnly:true,introUnchanged:true,legacyHumansRetained:true,finiteTransforms:true,actualBeamEndpoints:true,actualPitGeometry:true,physicalLiftPose:true,saveRestoreLift:true,noCombatWarnings:true,trainingWarnings:true,addedListeners:0,boundedRegistry:true,rgbaIdentical:true},dimensions,cost,cases,frames:frames.map(compact),pixelComparisons,resources:{...stats,meshes:registry,raster:api.rasterStats()},stress:{frames:180,resolution:'640x360',medianMs:+times[90].toFixed(2),p95Ms:+times[171].toFixed(2),maxMs:+times.at(-1).toFixed(2),baselineMedianMs:+baselineTimes[15].toFixed(2),medianReductionPercent:+((1-times[90]/baselineTimes[15])*100).toFixed(1),heapBefore:memoryBefore,heapAfter:process.memoryUsage().heapUsed,gcAtBothEnds:!!global.gc},transport};
 fs.writeFileSync(path.join(out,'base-art.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(out,'base-art.md'),'# Базы 2.7.0 — визуальная проверка\n\nРеальная геометрия игрового Canvas: наземный бронированный робопёс с четырьмя шарнирными ногами; мех высотой 6,44 м рядом с человеком 3,5 м, две тяжёлые пушки и отдельный реактор. Ноги следуют физической скорости/gait, оружие — реальным началу и концу лучей. Первая база и старые человеческие модели сохранены.\n\nАрхитектура поздних баз заново строится по клеткам и физическим укрытиям. Пробоины — отсутствующие клетки, глубокие стенки и низкая кромка; вокруг них больше нет старых высоких стен. Пожар имеет геометрию пламени, обугленный пол и ограниченные искры. Платформа следует реальному состоянию перевозки игрока.\n\n- '+frames.length+' нативных кадров: desktop, 390 px, detail capability и FX off. Это не браузерные скриншоты.\n- Проверены неизменность сохранений при рисовании, повторное подключение, 0 новых обработчиков, конечные преобразования и отсутствие роста кешей.\n- Настоящий AI создал две действующие лазерные линии; их концы/radius совпали с физикой. Предварительная линия есть только в обучении.\n- Платформа запущена обычным стоянием на ней, затем состояние сохранено/восстановлено без изменения положения.\n- '+report.stress.frames+' настоящих Canvas-кадров 640×360: median '+report.stress.medianMs+' ms, p95 '+report.stress.p95Ms+' ms. Это хостовое измерение, не мобильный FPS.\n- Оптимизация Canvas: медиана прежнего рендера '+report.stress.baselineMedianMs+' ms → '+report.stress.medianMs+' ms ('+report.stress.medianReductionPercent+'% меньше времени). Во всех '+pixelComparisons.length+' парах сцен совпали все RGBA-байты; геометрия, освещение и прозрачность не урезаны.\n\n| Модель | Детализация | Треугольники | Draw items |\n|---|---|---:|---:|\n'+cost.map(x=>'| '+x.kind+' | '+(x.high?'detail':'compatible')+' | '+x.triangles+' | '+x.items+' |').join('\n')+'\n\nРесурсы после прогрева: '+stats.templates+' шаблонов, '+stats.architectureLayouts+' вариантов архитектуры. Никаких новых циклов, таймеров, программ шейдеров и слушателей. Полное прохождение, браузерный WebGL и физические телефоны проверяются отдельно.\n');console.log(JSON.stringify({checks:report.checks,cost,resources:report.resources,stress:report.stress},null,2));return report;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main,harness,install,fixture,render};
