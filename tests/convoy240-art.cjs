#!/usr/bin/env node
'use strict';
// Visual contract tests and native Canvas render plates. These are explicitly
// scene fixtures, not evidence of campaign completion or a physical phone.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.4.0','visual');
function snapshot(){const entry=entrySnapshot();for(const file of ['assets/citadel-convoy-v2.4.0.js','assets/citadel-convoy-view-v2.4.0.js'])if(!entry.scripts.includes(file)){
 entry.scripts.push(file);entry.sources.set(file,fs.readFileSync(path.join(root,file),'utf8'));
}return entry;}
function prepare(h,stage){const e=new h.Engine(417147+stage);h.arcade.engine=e;e.assist=false;e.beginStage(stage);
 e.upgrades={weapons:stage,rockets:0,armor:1};e.status='stageclear';e.upgradeChoice='weapons';assert(e.beginEscort());e.launch();return e;
}
function configure(h,w,he){h.c.innerWidth=w;h.c.innerHeight=he;h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});}
function draw(h,e,w,he,name){configure(h,w,he);const before=JSON.stringify(h.pack(e)),canvas=createCanvas(w,he),c=canvas.getContext('2d'),cam=h.camera(e,e.elapsed),items=h.scene(e,e.elapsed,true);
 assert(cam.convoy240,'Final camera override must select the new view');assert(items.some(it=>it.convoyTunnel),'The shared renderer must receive moving tunnel geometry');
 assert(!items.some(it=>/hound|c230/.test(it.mesh)),'New convoy scene must not use the old dog/architecture template');
 const start=performance.now();h.draw(c,items,cam,w,he);const hud=createCanvas(w,he);h.run('drawEscortHUD')(hud.getContext('2d'),e,cam,w,he);c.drawImage(hud,0,0);
 assert.equal(JSON.stringify(h.pack(e)),before,'Scene construction and HUD must be read-only');
 fs.writeFileSync(path.join(out,name+'.png'),canvas.toBuffer('image/png'));
 return {name,width:w,height:he,items:items.length,renderMs:+(performance.now()-start).toFixed(2),field:e.escort.ops240.fields.find(f=>!f.passed)||null,renderer:'Native @napi-rs/canvas + production software 3D raster',state:e.status};
}
function fieldContract(h,f){const rects=h.c.CITADEL_CONVOY_VIEW.fieldRects(f);
 const total=rects.reduce((sum,r)=>sum+(r.x1-r.x0)*(r.y1-r.y0),0);assert(Math.abs(total-(152*104-f.halfW*f.halfH*4))<1e-7);
 for(let x=-75.5;x<76;x+=1)for(let y=-51.5;y<52;y+=1){if(rects.some(r=>Math.abs(x-r.x0)<1e-7||Math.abs(x-r.x1)<1e-7||Math.abs(y-r.y0)<1e-7||Math.abs(y-r.y1)<1e-7))continue;const inGap=x>f.gapX-f.halfW&&x<f.gapX+f.halfW&&y>f.gapY-f.halfH&&y<f.gapY+f.halfH;
  const cover=rects.filter(r=>x>r.x0&&x<r.x1&&y>r.y0&&y<r.y1).length;assert.equal(cover,inGap?0:1,'The render must cover exactly the physical danger plane');
 }
 return {id:f.id,gapX:f.gapX,gapY:f.gapY,halfW:f.halfW,halfH:f.halfH,collisionRadius:2.8,dangerRectangles:rects.length};
}
async function main(){fs.mkdirSync(out,{recursive:true});const h=entryHarness(snapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');
 assert.equal(h.c.CITADEL_CONVOY_VIEW.version,'2.4.0');const images=[],contracts=[];
 const mesh=h.run('SPACE_MESH.c240_tunnel');assert(mesh.n[0]*mesh.p[0]+mesh.n[1]*mesh.p[1]<0,'Tunnel normals must face the camera inside the flight corridor');
 for(let stage=0;stage<3;stage++){
  const e=prepare(h,stage);let f=null;
  for(let i=0;i<60*40&&e.status==='playing';i++){
   e.step(1/60,{fire:true});f=e.escort.ops240.fields.find(x=>!x.passed&&x.warning<=3.2);
   if(f)break;
  }
  assert(f,'Each mission must offer a clearly announced physical field');contracts.push(fieldContract(h,f));
  images.push(draw(h,e,1280,720,'convoy-'+(stage+1)+'-desktop'));
  images.push(draw(h,e,390,720,'convoy-'+(stage+1)+'-phone'));
  if(stage===2){images.push(draw(h,e,780,390,'convoy-3-landscape'));images.push(draw(h,e,528,302,'convoy-3-mobile-field'));}
  const before=JSON.stringify(h.pack(e));h.scene(e,e.elapsed+1,true);assert.equal(JSON.stringify(h.pack(e)),before);
 }
 // All templates are compiled once; stationary frame generation must not grow
 // the mesh registry. A model plate also verifies that every role has a vessel.
 for(const type of ['scout','interceptor','raider','bomber','shield','jammer','commander'])h.c.CITADEL_CONVOY_VIEW.testVessel(type);
 const count=h.run('Object.keys(SPACE_MESH).length'),stats=h.c.CITADEL_CONVOY_VIEW.stats(),e=h.arcade.engine;
 for(let i=0;i<300;i++)h.scene(e,e.elapsed+i/60,true);
 assert.equal(h.run('Object.keys(SPACE_MESH).length'),count);assert.equal(h.c.CITADEL_CONVOY_VIEW.stats().templates,stats.templates);
 const report={version:'2.4.0',method:'Native Canvas scene fixtures using the real entry modules and normal simulation ticks; no browser/device/FPS or campaign-completion claim.',checks:{allThreeFields:true,physicalWindowAgreement:true,tunnelNormals:true,readOnlyRender:true,boundedTemplates:true},templates:stats.templates,meshes:count,contracts,images};
 fs.writeFileSync(path.join(out,'art.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks,templates:stats.templates,images:images.map(x=>({name:x.name,items:x.items,renderMs:x.renderMs}))},null,2));return report;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={main,snapshot};
