'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {lab,readEntry,fixture}=require('./release260-verifier.cjs');
const rows=[];async function test(name,fn){try{await fn();rows.push({name,pass:true});console.log('PASS '+name);}catch(e){rows.push({name,pass:false,error:e.stack});console.error('FAIL '+name+' '+e.stack);}}
const next=()=>new Promise(setImmediate);
(async()=>{
 const entry=readEntry('play.html');entry.scripts=entry.scripts.filter(s=>!s.includes('atlas-site-metrics'));
 const h=await lab(entry);
 await test('guidance toggles the actual orbit and deck controllers, and clears pending joystick restore',()=>{
  for(const id of [1,2,4,3]){
   const e=fixture(h,id,false);h.mobile.guideReturn=true;const inside=id===2,source=inside?e.board:e,key=inside?'guide':'autopilot',before=!!source[key];
   h.action('citadel-guidance');if(id!==3)assert.equal(!!source[key],!before);assert.equal(h.mobile.guideReturn,false);
   h.action('citadel-guidance');if(id!==3)assert.equal(!!source[key],before);
  }
 });
 await test('progress reads all mission families, does not mutate saves, and remains bounded',()=>{
  for(const id of [1,2,3,4,7,12,13,14]){const e=fixture(h,id,false),snapshot=JSON.stringify(h.pack(e)),p=h.c.CITADEL_HUD2178.progress(e);assert(Number.isFinite(p.percent));assert(p.percent>=0&&p.percent<=100);assert(p.label.length);assert.equal(JSON.stringify(h.pack(e)),snapshot);}
  const e=fixture(h,3,false);e.escort.distance=.42;assert.equal(h.c.CITADEL_HUD2178.progress(e).percent,42);
  const b=fixture(h,2,false);b.board.completed=[0];assert.equal(h.c.CITADEL_HUD2178.progress(b).percent,33);
 });
 await test('comic reactions retain printable panels on mobile and safe geometry metadata',()=>{
  const e=fixture(h,1,false);h.state.view='arcade';h.c.CITADEL_COMIC.post(e,{text:'ЗАМЕЧАНИЯ ОТБИТЫ!',kind:'action'});
  const canvas=h.c.document.getElementById('arcade-hud-canvas'),c=canvas.getContext('2d'),cam=h.camera(e,e.elapsed);
  h.mobileHUD(c,e,cam,390,480);const s=h.c.CITADEL_COMIC.status(e);assert(s.active);assert(s.bounds,'Comic has room on portrait field');assert(Array.isArray(s.bounds.protected));assert(s.bounds.height>40);assert(s.bounds.y>=108);const b=s.bounds,data=c.getImageData(Math.ceil(b.x),Math.ceil(b.y),Math.floor(b.width),Math.floor(b.height)).data;let paper=0;for(let i=0;i<data.length;i+=4)if(data[i]>210&&data[i+1]>190&&data[i+3]>180)paper++;assert(paper>500,'Public HUD must not erase the comic panel');
 });
 await test('four decoded crew layers appear together; errors and retries cannot block navigation',async()=>{
  let timer;const ctx={document:{querySelector:()=>null,title:'QA'},setTimeout:fn=>(timer=fn,1),clearTimeout(){},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/citadel-home-v2.18.0.js','utf8'),ctx);
  function scene(){const classes=new Set(),label={textContent:''},retry={hidden:true},notice={hidden:false,querySelector:s=>s==='span'?label:retry};const images=Array.from({length:4},()=>{let resolve,reject;const handlers={};return{src:'./hero.webp',complete:true,naturalWidth:300,handlers,decode:()=>new Promise((a,b)=>{resolve=a;reject=b}),addEventListener(k,f){handlers[k]=f;},removeEventListener(k){delete handlers[k];},ready(){resolve();},fail(){reject(Error('synthetic'));}};});return{images,label,retry,notice,classes,querySelectorAll:()=>images,querySelector:()=>notice,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};}
  const s=scene();ctx.CITADEL_HOME2180.prepare(s);await next();for(let i=0;i<3;i++)s.images[i].ready();await next();assert(!s.classes.has('home2181-ready'));s.images[3].ready();await next();assert(s.classes.has('home2181-ready'));assert(s.notice.hidden);
  const broken=scene();ctx.CITADEL_HOME2180.prepare(broken);await next();broken.images[0].fail();await next();assert(!broken.retry.hidden);assert.equal(broken.label.textContent,'Экипаж не загрузился');broken.retry.onclick();await next();broken.images.forEach(x=>x.ready());await next();assert(broken.classes.has('home2181-ready'));
  const late=scene(),newer=scene();ctx.CITADEL_HOME2180.prepare(late);await next();ctx.CITADEL_HOME2180.prepare(newer);await next();late.images.forEach(x=>x.ready());await next();assert(!late.classes.has('home2181-ready'));timer();assert(!newer.retry.hidden);
 });
 let time=0,id=0;const frames=new Map();
 const r=await lab(entry,{frameClock:true,beforeScripts({c}){c.performance.now=()=>time;c.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};c.cancelAnimationFrame=n=>frames.delete(n);}});
 function step(n=1){for(let i=0;i<n;i++){time+=17;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time);}}
 function start(){const e=fixture(r,1,true);r.state.view='arcade';r.arcade.renderer={cpu:true,render(){},resize(){}};r.arcade.hud=r.c.document.getElementById('arcade-hud-canvas');r.arcade.ctx=r.arcade.hud.getContext('2d');r.run('CUP.run=null');step(3);return e;}
 await test('separate transient render faults each resume after a healthy frame window',()=>{
  start();for(let n=0;n<2;n++){r.run('(function(){const old=spaceScene;spaceScene=function(){spaceScene=old;throw new Error("Synthetic paint failure");};})()');step();assert.equal(r.arcade.engine.status,'paused');assert.equal(r.c.CITADEL_RUNTIME.diagnostic().stopped,false);step(65);r.action('arcade-resume');assert.equal(r.arcade.engine.status,'playing');const elapsed=r.arcade.engine.elapsed;step(10);assert(r.arcade.engine.elapsed>elapsed);}
 });
 await test('interrupted simulation restores a completed checkpoint without reloading the page',()=>{
  const old=r.arcade.engine;step(10);const before=old.elapsed;old.step=()=>{throw Error('Synthetic update failure');};step();assert(r.c.CITADEL_RUNTIME.diagnostic().stopped);assert.equal(old.status,'paused');r.action('arcade-resume');assert.notEqual(r.arcade.engine,old);assert.equal(r.c.CITADEL_RUNTIME.diagnostic().stopped,false);assert(r.arcade.engine.elapsed<=before);assert.equal(r.arcade.engine.status,'playing');const elapsed=r.arcade.engine.elapsed;step(5);assert(r.arcade.engine.elapsed>elapsed);
 });
 await test('resume schedules a fresh frame even if a browser discarded the pending callback',()=>{
  r.action('arcade-pause');frames.clear();r.action('arcade-resume');assert(frames.size>0);const elapsed=r.arcade.engine.elapsed;step(4);assert(r.arcade.engine.elapsed>elapsed);
 });
 await test('two consecutive render failures recover the same paused engine without rolling back score',()=>{
  const e=r.arcade.engine;r.run('(function(){let failures=2;const old=spaceScene;spaceScene=function(){if(failures-->0)throw new Error("Synthetic consecutive render failures");spaceScene=old;return old.apply(this,arguments);};})()');step(2);assert(r.c.CITADEL_RUNTIME.diagnostic().stopped);assert.equal(e.status,'paused');const score=e.score;r.action('arcade-resume');assert.equal(r.arcade.engine,e);assert.equal(e.score,score);assert.equal(e.status,'playing');assert(!r.c.CITADEL_RUNTIME.diagnostic().stopped);step(3);
 });
 await test('background and return preserve a resumable pause',()=>{
  r.c.document.hidden=true;for(const fn of r.handlers.get('visibilitychange')||[])fn({});assert.equal(r.arcade.engine.status,'paused');r.c.document.hidden=false;for(const fn of r.handlers.get('visibilitychange')||[])fn({});r.action('arcade-resume');const elapsed=r.arcade.engine.elapsed;step(4);assert(r.arcade.engine.elapsed>elapsed);
 });
 const report={version:'2.18.1',method:'Engine boundary fixtures, controlled image decode promises and deterministic RAF fault injection. Not a physical iPhone test.',pass:rows.every(x=>x.pass),rows};fs.mkdirSync('tests/qa-2.18.1',{recursive:true});fs.writeFileSync('tests/qa-2.18.1/contracts.json',JSON.stringify(report,null,2)+'\n');process.exitCode=report.pass?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});
