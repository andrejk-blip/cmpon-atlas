'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const patch=read('assets/citadel-convoy-v2.17.5.js');
function fixture(){
 const media={matches:false},calls=[],retained=[{convoy260:'transport',id:'ally'},{convoyField:1,id:'field'},{warpHazard:'tentacle',id:'hazard'}];
 const V3={add:(a,b)=>a.map((x,i)=>x+b[i]),sub:(a,b)=>a.map((x,i)=>x-b[i]),scale:(a,n)=>a.map(x=>x*n),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len:a=>Math.hypot(...a),norm:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);},cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
 class Renderer{render(items,cam){calls.push({kind:'render',cam});}dispose(){}program(vertex,fragment){return {fragment};}}
 const identity={r:[1,0,0],u:[0,1,0],f:[0,0,1]};
 const c={console,performance,Float32Array,Uint8ClampedArray,Math,SpaceRendererCore:Renderer,V3,SPACE_IDENTITY:identity,SPACE_MESH:{},SPACE_SKY_VERTEX:'sky-vertex',SPACE_VERTEX:'mesh-vertex',
  CITADEL_CONVOY:{active:e=>e.phase==='escort'},ARCADE:{fx:false,canvas:{width:390,height:640}},matchMedia:()=>media,
  document:{createElement:()=>createCanvas(1,1)},arcadeSeed:seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},
  spaceMesh:()=>({p:[],n:[]}),citadelItem:(mesh,pos,size,color,emissive,basis,alpha,kind)=>({mesh,pos,size,color,emissive,basis,alpha,kind}),
  stationLook:(pos,target,fov,opts)=>{const f=V3.norm(V3.sub(target,pos)),r=V3.norm(V3.cross(f,[0,1,0]));return {pos,f,r,u:V3.cross(r,f),fov,...opts};},
  spaceCamera:()=>({other:true}),spaceScene:()=>[...retained,{convoy260:'speed'},{warpMotion2130:true}],spaceDrawCPU:()=>{},expeditionHyperScene:()=>[],drawEscortHUD:()=>{},drawMobileGameHUD:()=>{},expeditionOverlay:()=>'',updateExpeditionHUD:()=>{}};
 vm.createContext(c);vm.runInContext(read('assets/citadel-convoy-view-v2.6.0.js'),c);
 const engine={phase:'escort',status:'playing',stage:0,elapsed:20,escort:{time:2,ops240:{},allies:[]},player:{pos:[0,0,0]},score:321};
 const canvas=createCanvas(156,256),ctx=canvas.getContext('2d');
 const capture=()=>{const cam=c.spaceCamera(engine,engine.elapsed);c.spaceDrawCPU(ctx,[],cam,156,256);return Buffer.from(ctx.getImageData(0,0,156,256).data);};
 return {c,engine,media,calls,retained,capture,install:()=>vm.runInContext(patch,c)};
}
function difference(a,b){let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>3)changed++;return changed/(a.length/4);}
const cases=[
 ['minimum-effects CPU sky actually changes pixels; reproduced static background before fix',()=>{const h=fixture(),a=h.capture();h.engine.escort.time=4;assert.deepEqual(h.capture(),a);h.install();const b=h.capture();h.engine.escort.time=6;const ratio=difference(b,h.capture());assert(ratio>.12,'Only '+ratio+' pixels moved');console.log('  CPU changed pixels: '+(ratio*100).toFixed(1)+'%');assert.equal(h.c.CITADEL_CONVOY_VIEW.stats().surfaceBuilds,1,'Cached sky must not rebuild per frame');}],
 ['paused simulation freezes sky despite changing render timestamp',()=>{const h=fixture();h.install();h.engine.status='paused';const a=h.capture();h.engine.elapsed+=90;assert.deepEqual(h.capture(),a);}],
 ['reduce-motion freezes both sky and decorative streams',()=>{const h=fixture();h.install();h.media.matches=true;const a=h.capture(),items=JSON.stringify(h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine));h.engine.escort.time+=10;assert.deepEqual(h.capture(),a);assert.equal(JSON.stringify(h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine)),items);}],
 ['depth streams approach camera and stay bounded at both quality settings',()=>{const h=fixture();h.install();h.engine.escort.time=1;const a=h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine);h.engine.escort.time=1.1;const b=h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine);assert(b[0].pos[2]>a[0].pos[2]);assert.equal(a.length,32);assert.equal(h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine,false).length,16);for(let t=0;t<100;t+=7){h.engine.escort.time=t;for(const x of h.c.CITADEL_CONVOY_MOTION2175.streams(h.engine))assert(x.pos.every(Number.isFinite)&&x.pos[2]<=34&&x.pos[2]>-1080);}}],
 ['ships, damage fields and monsters retain identity; engine state is never changed',()=>{const h=fixture();h.install();const before=JSON.stringify(h.engine),a=h.c.spaceScene(h.engine,2,false);for(const x of h.retained)assert(a.includes(x));assert(!a.some(x=>x.warpMotion2130||x.convoy260==='speed'));assert.equal(a.filter(x=>x.convoyMotion2175).length,16);assert.equal(JSON.stringify(h.engine),before);}],
 ['other phases, modal previews and crash camera pass through',()=>{const h=fixture();h.install();h.engine.phase='pursuit';assert.equal(h.c.spaceCamera(h.engine).other,true);assert.equal(h.c.spaceScene(h.engine).length,5);h.engine.phase='escort';h.engine.campaign2120={modal:{type:'bestiary'}};assert(!h.c.spaceCamera(h.engine).convoyMotion2175);assert.equal(h.c.spaceScene(h.engine).length,5);h.engine.campaign2120.modal=null;h.engine.crash={};assert(!h.c.spaceCamera(h.engine).convoyMotion2175);}],
 ['WebGL receives progressing sky clock even when quality effects are disabled',()=>{const h=fixture();h.install();const r=new h.c.SpaceRendererCore();r.gl={isContextLost:()=>false,getUniformLocation:(p,n)=>n,getAttribLocation:()=>0,useProgram:()=>{},uniform1f:(name,value)=>h.calls.push({name,value})};r.render([],h.c.spaceCamera(h.engine));h.engine.escort.time+=1;r.render([],h.c.spaceCamera(h.engine));const times=h.calls.filter(x=>x.name==='uClock').map(x=>x.value);assert.equal(times.length,2);assert(times[1]>times[0]&&times[0]>0);assert.equal(h.c.ARCADE.fx,false);}],
 ['duplicate bootstrap does not stack wrappers',()=>{const h=fixture();h.install();const scene=h.c.spaceScene,cam=h.c.spaceCamera;h.install();assert.equal(scene,h.c.spaceScene);assert.equal(cam,h.c.spaceCamera);}]
];
let failures=0;for(const [name,test]of cases){try{test();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack);}}if(failures)process.exitCode=1;
