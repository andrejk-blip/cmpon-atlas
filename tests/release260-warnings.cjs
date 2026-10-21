#!/usr/bin/env node
'use strict';
// Independent advance-warning checks: live observations plus render-only
// comparisons of the same genuine calm attack checkpoint in the two modes.
// Mode changes below are INITIAL SCENE FIXTURES, not campaign play or wins.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
const {createParallaxController,createMrgController,createSwarmController}=require('./helpers/campaign-inputs.js');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const out=path.join(__dirname,'qa-2.6.0'),clone=x=>JSON.parse(JSON.stringify(x));
const tactical=/УДАР ЧЕРЕЗ|АТАКА ЧЕРЕЗ|ЗОНА УДАРА|В ЗЕЛЁНЫЙ ПРОСВЕТ|До удара|СМЕНИ КУРС|ХЛЁСТ —|КЛЕЩИ —|Подсвеченные корабли|Подсветка врага|На пол слева от центра|На пол между захватами|В глубокое левое укрытие|ИМПУЛЬС ПЕРЕД УДАРОМ|ЩУПАЛЬЦА — В УКРЫТИЕ/i;
function hud(h,e,width,height){
 h.c.innerWidth=width;h.c.innerHeight=height;h.c.matchMedia=()=>({matches:width<900});h.arcade.canvas.width=width;h.arcade.canvas.height=height;h.arcade.canvas.getBoundingClientRect=()=>({left:0,top:0,width,height});h.arcade.engine=e;
 const ctx=createCanvas(width,height).getContext('2d'),texts=[],traces=[];
 const proxy=new Proxy(ctx,{get(target,key){if(['fillText','strokeText'].includes(key))return(...args)=>{texts.push(String(args[0]));return target[key](...args);};if(['arc','ellipse','stroke'].includes(key))return(...args)=>{traces.push({op:key,style:target.strokeStyle,args:args.slice(0,4)});return target[key](...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}});
 const before=JSON.stringify(h.pack(e)),cam=h.run('spaceCamera')(e,e.elapsed);
 h.run(e.finale?'drawFinaleHUD':width<900?'drawMobileGameHUD':'drawFlightHUD')(proxy,e,cam,width,height);
 const items=h.run('spaceScene')(e,e.elapsed,true),features=items.filter(x=>x.mrgFeature).map(x=>({kind:x.mrgFeature,phase:x.mrgPhase}));
 assert(items.every(x=>x.model.every(Number.isFinite)&&x.pos.every(Number.isFinite)));
 assert.equal(JSON.stringify(h.pack(e)),before,'Warning rendering mutated gameplay');
 return{width,height,texts,traces,features,items:items.length};
}
function operator(h,e){
 if(e.phase==='swarm'){const fn=createSwarmController(h.c.CITADEL_SWARM);return()=>({...fn(e),fire:false,missile:false});}
 if(e.finale?.phase==='boss'){const fn=createParallaxController(h,e);return()=>({...fn(),fire:false,missile:false});}
 if(e.finale?.phase==='mrg'){const fn=createMrgController();return()=>({...fn(e),fire:false,missile:false});}
 return()=>({});
}
async function main(){
 const entryFile=process.argv.find(x=>x.startsWith('--entry='))?.slice(8)||'tests/entry-2.6.0.html',entry=readEntry(entryFile);
 assert(entry.scripts.some(x=>/v2\.6\.0\.js$/.test(x)));const h=await lab(entry),checks=[],failures=[],live=[];
 const check=(name,fn)=>{try{checks.push({name,pass:true,...fn()});}catch(error){failures.push({name,error:error.message});}};
 const specimens=[];
 // Collect genuine, unmodified calm combat checkpoints with each attack visible.
 for(const id of [7,12,14]){
  const events=[],e=fixture(h,id,true,(kind,data)=>events.push({kind,data:clone(data??null)})),control=operator(h,e),seen=new Set();
  for(let i=0;i<60*75&&!['lost','crashing'].includes(e.status);i++){
   e.step(1/60,control());let key=null;
   if(id===7&&e.enemies.some(x=>x.mode==='tell'||x.fireCue>0||x.attackCue>0))key='swarm-tell';
   if(id===12&&e.finale.parallax?.attack?.phase==='windup')key='parallax-'+e.finale.parallax.attack.kind;
   if(id===14){if(e.finale.tentacle?.phase==='telegraph')key='mrg-'+e.finale.tentacle.kind;else if(e.finale.telegraph>0)key='mrg-shot-'+e.finale.pattern;}
   if(key&&!seen.has(key)){seen.add(key);specimens.push({id,key,seconds:e.elapsed,snapshot:clone(h.pack(e))});}
   if(id===7&&seen.size||id===12&&seen.size===3||id===14&&seen.size>=6)break;
  }
  live.push({level:id,mode:'calm',seen:[...seen],seconds:e.elapsed,status:e.status});
 }
 for(const s of specimens){const render=[];
  for(const assist of [false,true]){
   const saved=clone(s.snapshot);saved.engine.assist=assist;
   const e=h.unpack(saved,{seed:417147,mode:assist?'calm':'normal'},()=>{});h.arcade.engine=e;
   for(const [width,height]of [[1280,720],[390,640],[780,390]]){
    const r=hud(h,e,width,height),objective=JSON.stringify(e.objective());
    check(s.key+'-'+(assist?'calm':'normal')+'-'+width,()=>{
     if(!assist){assert(!tactical.test(r.texts.join('\n')),'Tactical HUD leak: '+r.texts.filter(x=>tactical.test(x)).join(' / '));assert(!tactical.test(objective),'Objective leak: '+objective);assert(!r.features.some(x=>['safe-zone','tentacle-telegraph','tentacle-warning-area'].includes(x.kind)||x.kind==='knife-threat'&&x.phase==='windup'),'3D advance-warning feature visible in normal');}
     else if(s.key.startsWith('mrg-')&&!s.key.startsWith('mrg-shot'))assert(r.features.some(x=>x.kind==='safe-zone'),'Calm safe-zone teaching geometry missing');
     else if(s.key.startsWith('parallax'))assert(tactical.test(r.texts.join('\n')),'Calm Parallax direction cue missing');
     return{level:s.id,source:s.key,mode:assist?'calm':'normal',width,height,items:r.items,hudTexts:r.texts,featureCounts:r.features.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{})};
    });render.push({assist,width,traceCount:r.traces.length});
   }
  }
  if(s.id===7)check('swarm-mode-specific-marker-geometry',()=>{for(const w of [1280,390,780]){const normal=render.find(x=>!x.assist&&x.width===w),calm=render.find(x=>x.assist&&x.width===w);assert(calm.traceCount>normal.traceCount,'Calm should add tell geometry at width '+w);}return{traces:render};});
 }
 // A live normal run must not announce its actual impending attack via speech,
 // comics or objective even when the native HUD is not being drawn.
 for(const id of [7,12,14]){
  const events=[],e=fixture(h,id,false,(kind,data)=>events.push({kind,data:clone(data??null)})),control=operator(h,e),messages=new Set();
  for(let i=0;i<60*35&&!['lost','crashing'].includes(e.status);i++){
   e.step(1/60,control());messages.add(e.captain?.text||'');if(i%12===0)messages.add(JSON.stringify(e.objective()));
  }
  const warnings=events.filter(x=>x.kind==='comic'&&x.data?.kind==='warning');
  check('live-normal-no-tactical-announcements-'+id,()=>{const leaked=[...messages].filter(x=>tactical.test(x));assert.equal(leaked.length,0,'Live messages leaked: '+leaked.join(' / '));assert.equal(warnings.length,0,'Advance warning comics in normal');return{level:id,seconds:e.elapsed,status:e.status,messages:[...messages],warningComics:warnings.length};});
 }
 check('coverage',()=>{for(const key of ['swarm-tell','parallax-lunge','parallax-sweep','parallax-pincer','mrg-sweep','mrg-crown','mrg-pincer'])assert(specimens.some(x=>x.key===key),'Missing genuine attack checkpoint: '+key);return{specimens:specimens.map(({snapshot,...s})=>s)};});
 const report={pass:failures.length===0,method:'Node VM gameplay and native Canvas HUD interception. Genuine calm attack snapshots are loaded with each mode as separate render-only fixtures. No HP/ammo/victory changes. Live normal speech/comic checks use only defensive ordinary input. Not browser/device evidence.',entryFile,entrySHA256:crypto.createHash('sha256').update(entry.html).digest('hex'),sourceHashes:entry.scripts.map(file=>({file,sha256:crypto.createHash('sha256').update(entry.sources.get(file)).digest('hex')})),checks,failures,live};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verifier-warnings.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,checks:checks.length,failures,live}));if(!report.pass)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});module.exports={hud};
