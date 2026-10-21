#!/usr/bin/env node
'use strict';
// Independent release checks. Initial mission fixtures are NOT playthroughs.
// After setup, only normal game inputs/actions are used. No enemy/player HP,
// ammunition, victory status or objective completion is changed by a test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.6.0');
const baselineSha='0391d60f26157648e96ce51c77278e261fffdab1';
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function readEntry(file){
 if(!file)return entrySnapshot();
 const full=path.resolve(root,file),html=fs.readFileSync(full,'utf8'),sources=new Map();
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1].split('?')[0]).filter(f=>!/^https?:/.test(f)).map(f=>{
  const candidate=fs.existsSync(path.resolve(root,f))?path.resolve(root,f):path.resolve(path.dirname(full),f);
  const relative=path.relative(root,candidate);sources.set(relative,fs.readFileSync(candidate,'utf8'));return relative;
 });return{html,scripts,sources};
}
function gitEntry(ref=baselineSha){
 const read=file=>cp.execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 const html=read('index.html'),scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(m=>m[1].split('?')[0]);
 return{html,scripts,sources:new Map(scripts.map(file=>[file,read(file)]))};
}
async function lab(entry,profile={}){
 const h=entryHarness(entry,profile);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false');return h;
}
function fixture(h,id,assist=false,emit=()=>{}){
 const e=new h.Engine(417147,emit);e.assist=assist;h.arcade.engine=e;e.beginStage(Math.min(3,Math.floor((id-1)/3)));
 if(id>=12){e.beginFinale();if(id===12)e.launchFinale();else if(id===13)e.beginLair();else e.beginMRG();}
 else if([2,5,8,11].includes(id))e.beginBoarding();
 else if([3,6,9].includes(id)){e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();}
 else e.launch();return e;
}
const state=(h,e)=>copy({engine:h.pack(e).engine,rng:h.pack(e).rng});
function anchors(e){return copy({status:e.status,phase:e.phase,stage:e.stage,score:e.score,totalKills:e.totalKills,rescued:e.rescued,completedRemarks:e.completedRemarks,decisions:e.decisions,upgrades:{weapons:e.upgrades.weapons,armor:e.upgrades.armor,rockets:e.upgrades.rockets},elapsed:e.elapsed,player:{pos:e.player.pos,hp:e.player.hp,missiles:e.player.missiles,energy:e.player.energy},board:e.board?{pos:e.board.pos,hp:e.board.hp,completed:e.board.completed,definition:e.board.definition,enemies:e.board.enemies.map(x=>({id:x.id,hp:x.hp,pos:x.pos,dead:x.dead}))}:null,enemies:e.enemies.map(x=>({id:x.id,hp:x.hp,pos:x.pos,dead:x.dead})),boss:e.boss?{hp:e.boss.hp,pos:e.boss.pos}:null});}
function listenerState(h){return{window:[...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),document:[...h.handlers.values()].reduce((n,a)=>n+a.length,0),elements:[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((a,b)=>a+b.length,0),0)};}
async function contracts(entry){
 const h=await lab(entry),rows=[],failures=[];
 async function test(name,fn){try{rows.push({name,pass:true,...await fn()});}catch(err){failures.push({name,error:err.message});}}
 for(const assist of [false,true])for(let id=1;id<=14;id++)await test('pause-save-'+id+'-'+(assist?'calm':'normal'),()=>{
  const e=fixture(h,id,assist);for(let i=0;i<60;i++)e.step(1/60,{});e.pause();const before=state(h,e),snapshot=h.pack(e);
  for(let i=0;i<120;i++)e.step(1/60,{fire:true,missile:true,moveX:1,turn:1,pulse:true});assert.deepEqual(state(h,e),before,'Paused state changed');
  const other=h.unpack(snapshot,{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.deepEqual(state(h,other),before,'Saved state changed on load');
  e.resume();other.resume();for(let i=0;i<120;i++){const input={fire:true,moveX:.2,turn:.2,pitch:0};h.arcade.engine=e;e.step(1/60,input);h.arcade.engine=other;other.step(1/60,input);}assert.deepEqual(state(h,other),state(h,e),'Restored continuation diverged');
  return{level:id,mode:assist?'calm':'normal',continuedSeconds:2};
 });
 const old=await lab(gitEntry());
 for(const assist of [false,true])for(let id=1;id<=14;id++)await test('legacy-250-'+id+'-'+(assist?'calm':'normal'),()=>{
  const e=fixture(old,id,assist);for(let i=0;i<120;i++)e.step(1/60,{fire:true});const before=anchors(e),saved=old.pack(e);
  const other=h.unpack(saved,{seed:417147,mode:assist?'calm':'normal'},()=>{});assert.deepEqual(anchors(other),before,'Legacy resources, progress or geometry changed on load');
  if(other.upgrades.baseKit260)assert.deepEqual(copy(other.upgrades.baseKit260),{schema:1,collected:[],capacitor:0,armor:0,parts:0,achievements:[]},'Legacy load must not grant unearned kit rewards');
  h.arcade.engine=other;for(let i=0;i<120;i++)other.step(1/60,{fire:true,turn:.1,moveX:.1});assert(other.player.pos.every(Number.isFinite));assert(Number.isFinite(other.board?.hp??other.player.hp));
  return{level:id,mode:assist?'calm':'normal',from:'2.5.0',continuedSeconds:2};
 });
 await test('idempotent-install',()=>{
  const modules=entry.scripts.filter(f=>/v2\.6\.0\.js$/.test(f)),before=listenerState(h),methods=h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.stepEscort,RequirementArcade.prototype.stepMRG,drawFlightHUD,spaceScene,arcadeInput]');
  for(let n=0;n<5;n++)for(const file of modules)h.run(entry.sources.get(file));
  const after=h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.stepEscort,RequirementArcade.prototype.stepMRG,drawFlightHUD,spaceScene,arcadeInput]');methods.forEach((fn,i)=>assert.equal(after[i],fn,'Repeated installation changed wrapper identity'));assert.deepEqual(listenerState(h),before);return{modules,listeners:before};
 });
 return{pass:failures.length===0,method:'Node VM. 14 direct mission-entry fixtures per mode; pause/save and old-save contracts, not campaign completion.',passed:rows.length,failed:failures.length,rows,failures};
}
async function campaign(entry,assist=false,fps=60,options={}){
 const {play}=require('./audit250-verifier-campaign.cjs');
 const {convoyInput,pilot}=require('./helpers/convoy260-inputs.js');
 const {createOrbitalController}=require('./helpers/orbital260-inputs.js');
 const samples=[],operators=new WeakMap(),orbitalOperators=new WeakMap(),checkpoints=new Set();let next=0,base=null,emitter=null;const changes=[];
 const result=await play(assist,417147,{entry,fps,sound:false,flightInput({h,e,input}){
  if(!h.c.CITADEL_CONVOY.active(e)){if(e.assist)return input;let op=orbitalOperators.get(e);if(!op){op=createOrbitalController(h,{resupply:false});orbitalOperators.set(e,op);}return op(e);}
  if(!options.convoyReaction)return convoyInput(h,e);let op=operators.get(e.escort);if(!op){op=pilot(h,e,{reaction:options.convoyReaction,device:options.convoyDevice||'joystick'});operators.set(e.escort,op);}return op.input();
 },observe({h,e,id,frame}){
  if([10,12,14].includes(id)&&['playing','boarding'].includes(e.status)&&!checkpoints.has(id)){checkpoints.add(id);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verifier-checkpoint-'+(assist?'calm':'normal')+'-'+id+'.json'),JSON.stringify({method:'Actual full-campaign reached checkpoint, normal input only before save.',level:id,mode:assist?'calm':'normal',snapshot:h.pack(e)},null,2)+'\n');}
  if(emitter&&emitter!==e.emit)changes.push({id,frame});emitter=e.emit;
  if(e.elapsed<next)return;next=e.elapsed+30;if(global.gc)global.gc();const listeners=listenerState(h);base??=listeners;
  samples.push({level:id,seconds:+e.elapsed.toFixed(2),listeners,heap:process.memoryUsage().heapUsed,entities:(e.enemies?.length||0)+(e.board?.enemies?.length||0)+(e.hostile?.length||0)+(e.board?.hostile?.length||0)+(e.bullets?.length||0)+(e.board?.bullets?.length||0)});
 }});
 result.orbitalOperator=assist?'prior calm input: auto-course/fire/missiles/nearby-projectile pulse':'orbital260: visible bomber priority, predicted incoming projectiles, ordinary Tab/fire/missiles/pulse';result.convoyOperator={reaction:options.convoyReaction||.4,device:options.convoyDevice||'joystick',ordinaryControls:true};result.stress={method:'Node VM logic; full-process heap, mocked DOM registrations. No browser RAF/GPU/Android timing.',forcedGC:typeof global.gc==='function',samples,listenersStable:samples.every(x=>JSON.stringify(x.listeners)===JSON.stringify(base)),emitterStable:changes.length===0,emitterChanges:changes};return result;
}
async function main(){
 const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),entryFile=arg('entry'),entry=readEntry(entryFile),kind=arg('kind')||'contracts';
 assert(entry.scripts.some(f=>/v2\.6\.0\.js$/.test(f)),'Release 2.6 is not integrated: pass --entry=tests/entry-2.6.0.html after it is ready.');
 fs.mkdirSync(out,{recursive:true});let result;
 if(kind==='contracts')result=await contracts(entry);
 else if(kind==='campaign')result=await campaign(entry,process.argv.includes('--calm'),Number(arg('fps')||60),{convoyReaction:Number(arg('convoy-reaction'))||undefined,convoyDevice:arg('convoy-device')});
 else throw Error('Unknown --kind '+kind);
 const tag=arg('tag')||kind+(kind==='campaign'?'-'+(process.argv.includes('--calm')?'calm':'normal')+'-'+Number(arg('fps')||60):'');assert(/^[a-z0-9-]+$/i.test(tag));
 Object.assign(result,{entryFile:entryFile||'index.html',entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))}))});
 const file=path.join(out,'verifier-'+tag+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({report:file,pass:result.pass,passed:result.passed,failed:result.failed,error:result.error,failures:result.failures,mode:result.mode,levels:result.levels?.length,seconds:result.simulatedSeconds}));if(!result.pass)process.exitCode=1;
}
module.exports={readEntry,gitEntry,lab,fixture,listenerState,contracts,campaign};if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
