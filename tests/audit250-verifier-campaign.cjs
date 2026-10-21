#!/usr/bin/env node
'use strict';
// Whole public campaign with the exact index.html chain and real Academy bank.
// The QA operator supplies ordinary inputs/actions, never HP, ammo, damage,
// cleared enemies or completed objectives. Reading the answer key verifies
// progression, not a human's learning or ability to solve a question.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createController}=require('./decks-regression.cjs');
const {pursuitInput,createSwarmController,createParallaxController}=require('./helpers/campaign-inputs.js');
const {createMrgController}=require('./helpers/campaign-inputs.js');
const {convoyInput}=require('./helpers/convoy240-inputs.js');
const immediate=()=>new Promise(resolve=>setImmediate(resolve));
const level=e=>e.finale?(['mrg','upload','victory'].includes(e.finale.phase)?14:e.finale.phase==='maze'?13:12):e.phase==='escort'?e.stage*3+3:e.board?e.stage*3+2:e.stage*3+1;
const rounded=n=>Number.isFinite(n)?+n.toFixed(2):null;

function flightTrace(h,e){
 const distance=pos=>Math.hypot(...pos.map((v,i)=>v-e.player.pos[i]));
 const hull=h.run('citadelHullHit'),segment=h.run('flightSegment');
 return{stationHp:rounded(e.stationHp),wave:e.wave,waveSpawned:e.waveSpawned,waveTotal:typeof e.waveTotal==='function'?e.waveTotal():e.waveTotal,
  kills:e.stageKills,selected:e.selectedTarget,lock:e.lock,navMode:e.navMode,autopilot:e.autopilot,
  position:e.player.pos.map(rounded),speed:rounded(e.player.speed),yaw:rounded(e.player.yaw),pitch:rounded(e.player.pitch),
  missiles:e.player.missiles,pulseCooldown:rounded(e.player.pulseCooldown),navRecoveries:e.navRecoveries||0,
  enemies:[...e.enemies,...(e.boss?[e.boss]:[])].filter(x=>!x.dead).map(x=>({id:x.id,role:x.role||x.type,hp:rounded(x.hp),
   distance:rounded(distance(x.pos)),position:x.pos.map(rounded),hullBlocked:!!hull(e,e.player.pos,x.pos,1.2),
   rockBlocked:e.asteroids.some(a=>segment(e.player.pos,x.pos,a.pos,a.r+1.2)!==null)}))};
}

async function play(assist=false,seed=417147,options={}){
 const entry=options.entry||entrySnapshot(),h=entryHarness(entry),framesPerSecond=options.fps||60;
 await immediate();assert(h.c.citadelAcademyBridge.ready);
 h.cup.panel=null;h.arcade.sound=options.sound ?? true;h.arcade.fx=false;h.run('SPACE_AUDIO.music=false;');
 h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
 const transitions=[],cards=[],levels=[],events=[],progress=[];
 let e;
 const emit=(kind,data)=>{if(['phase','state','stage','lost','won'].includes(kind))events.push({kind,data,time:e?.elapsed});};
 e=options.snapshot?h.unpack(options.snapshot,{seed,mode:assist?'calm':'normal'},emit):new h.Engine(seed,emit);
 h.arcade.engine=e;if(!options.snapshot)e.start(assist);
 const deck=createController(h),swarm=createSwarmController(h.c.CITADEL_SWARM),mrg=createMrgController();
 let parallax=null,current=null,phaseKey='',progressKey='',nextHeartbeat=0,phaseFrames=0,frame=0,error=null;
 try{
  for(;frame<framesPerSecond*3600;frame++){
   if(options.pace)await options.pace(frame);
   const id=level(e),key=[id,e.status,e.phase,e.finale?.phase].join('/');
   const detailKey=[key,e.board?.completed?.length??'',e.wave??''].join('/');
   if(detailKey!==progressKey||e.elapsed>=nextHeartbeat){
    const row={kind:detailKey!==progressKey?'transition':'heartbeat',level:id,status:e.status,phase:e.phase,finale:e.finale?.phase||null,
     room:e.board?e.board.completed.length+1:null,seconds:rounded(e.elapsed),hp:rounded(e.board?.hp??e.player.hp),
     ...(e.board?{clearance:h.c.CITADEL_DECK_COMBAT.clearance(e)}:flightTrace(h,e))};
    progress.push(row);progressKey=detailKey;nextHeartbeat=e.elapsed+20;
    if(options.progress)console.log('[campaign] '+JSON.stringify(row));
   }
   options.observe?.({h,e,frame,id});
   if(key!==phaseKey){phaseKey=key;phaseFrames=0;transitions.push({level:id,status:e.status,phase:e.phase,finale:e.finale?.phase||null,seconds:+e.elapsed.toFixed(2),hp:+(e.board?.hp??e.player.hp).toFixed(2)});}
   if(!current||current.level!==id){current={level:id,started:+e.elapsed.toFixed(2),minHp:100,minStationHp:100,frames:0,peakEnemies:0};levels.push(current);}
   current.minHp=Math.min(current.minHp,e.board?.hp??e.player.hp);current.frames++;
   if(Number.isFinite(e.stationHp))current.minStationHp=Math.min(current.minStationHp,e.stationHp);
   current.peakEnemies=Math.max(current.peakEnemies,(e.board?.enemies||e.enemies).filter(x=>!x.dead).length);
   if(e.status==='won')break;
   if(h.c.CITADEL_STORY.status(e).active){h.action('story-next');continue;}
   if(['lost','crashing'].includes(e.status))throw Error(`Pilot failed level ${id}: ${e.status}; ${e.lossReason||''}`);
   if(++phaseFrames>framesPerSecond*480)throw Error(`No phase progression for 480 seconds: ${phaseKey}; ${JSON.stringify(e.objective())}`);
   if(e.status==='briefing'||e.status==='escortbrief'){h.action('citadel-launch');continue;}
   if(e.status==='lesson'){
    const q=h.lessonCase(e,e.lesson.caseIndex);
    if(!e.lesson.solved){cards.push({level:id,kind:'flight',index:e.lesson.caseIndex,title:q.title||q.situation||q.q});h.action('citadel-lesson-answer',q.correct);}
    h.action('citadel-lesson-next');continue;
   }
   if(e.status==='remark'){
    const q=h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)');
    cards.push({level:id,kind:'terminal',index:e.board.question,title:q.title||q.q});
    assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0);
    h.action('citadel-answer',q.correct);h.action('citadel-remark-next');continue;
   }
   if(e.status==='finalcheck'){
    const q=h.run('FINALE_TRIALS[ARCADE.engine.board.completed.length]');
    cards.push({level:id,kind:'final',index:e.board.completed.length,title:q.title||q.q});
    assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0);
    h.action('finale-answer',q.correct);h.action('finale-check-next');continue;
   }
   if(e.status==='stageclear'){h.action('citadel-upgrade',['weapons','weapons','armor'][e.stage]);e.next();continue;}
   if(e.status==='escortclear'){h.action('citadel-escort-continue');continue;}
   if(e.status==='finalebrief'){h.action('finale-launch');parallax=createParallaxController(h,e);continue;}
   let input={};
   if(e.finale?.phase==='mrg')input=mrg(e);
   else if(e.finale?.phase==='boss')input=(parallax||=createParallaxController(h,e))();
   else if(e.status==='boarding')input=deck(e);
   else if(e.phase==='pursuit')input=pursuitInput(h,e);
   else if(e.phase==='swarm')input=swarm(e);
   else if(e.status==='playing'){
    const target=e.target?.(),close=e.hostile.some(x=>Math.hypot(...x.pos.map((v,i)=>v-e.player.pos[i]))<12);
    input={fire:true,missile:!!target&&e.player.missiles>0,pulse:close,interact:e.phase==='dock'};
    if(options.flightInput)input=options.flightInput({h,e,input,target});
   }
   e.step(1/framesPerSecond,input);
   assert(e.player.pos.every(Number.isFinite)&&Number.isFinite(e.player.hp));
   if(e.board)assert(e.board.pos.every(Number.isFinite)&&Number.isFinite(e.board.hp));
  }
  assert.equal(e.status,'won','The operator must reach the real victory state');
 }catch(err){error={message:err.message,stack:err.stack?.split('\n').slice(1,4)};}
 options.finished?.({h,e,frame,id:level(e)});
 for(let i=0;i<levels.length;i++){const row=levels[i];row.duration=+(((levels[i+1]?.started??e.elapsed)-row.started).toFixed(2));row.minHp=rounded(row.minHp);row.minStationHp=rounded(row.minStationHp);}
 return{version:JSON.parse(entry.html.match(/id="release-data">([^<]+)/)[1]).version,entrySha256:crypto.createHash('sha256').update(entry.html).digest('hex'),scripts:entry.scripts.map(file=>({file,sha256:crypto.createHash('sha256').update(entry.sources.get(file)).digest('hex')})),mode:assist?'calm':'normal',seed,pass:!error,error,resumedDiagnostic:!!options.snapshot,frames:frame,simulatedSeconds:+e.elapsed.toFixed(2),status:e.status,phase:e.phase,finale:e.finale?.phase||null,levels,cards,transitions,progress,score:e.score,rescued:e.rescued.length,completedRemarks:e.completedRemarks.length,decisions:e.decisions.length,upgrades:e.upgrades,limits:['Deterministic QA operator has precise positions and answer keys. This verifies a reachable path, not human difficulty or learning.','Rendering, hardware timing, browser gestures, hearing and network latency are not simulated by this run.']};
}

async function main(){
 const fps=Number(process.argv.find(x=>x.startsWith('--fps='))?.split('=')[1]||60),assist=process.argv.includes('--calm'),mode=assist?'calm':'normal',tag=process.argv.find(x=>x.startsWith('--tag='))?.slice(6)||'';
 assert(!tag||/^[a-z0-9-]+$/i.test(tag),'Report tag uses letters, digits or hyphens');
 const out=path.join(__dirname,'qa-2.5.0');fs.mkdirSync(out,{recursive:true});
 const starts=[],samples=[],mrg={waves:[],incoming:0},swarm={waves:[],packets:[]},convoys=new Map(),phases=new Map();let last='';
 const stressEnabled=process.argv.includes('--stress'),stress={enabled:stressEnabled,forcedGC:typeof global.gc==='function',scope:'Node VM logic, mocked DOM listener registries, full process heap including retained QA reports; no browser RAF/FPS/WebGL/audio measurement',samples:[],emitIdentityChanges:[],listenerBaseline:null};
 let nextStress=0,lastEmit=null;
 function listenerState(h){const sum=map=>[...map.values()].reduce((n,a)=>n+a.length,0);return{window:sum(h.windowHandlers),document:sum(h.handlers),elements:[...h.nodes.values()].reduce((n,x)=>n+Object.values(x.handlers||{}).reduce((a,b)=>a+b.length,0),0)};}
 function observeRuntime({h,e,id,frame},force=false){
  if(!stressEnabled)return;
  if(lastEmit&&lastEmit!==e.emit)stress.emitIdentityChanges.push({level:id,seconds:rounded(e.elapsed),frame});lastEmit=e.emit;
  if(!force&&e.elapsed<nextStress)return;nextStress=e.elapsed+30;
  if(global.gc)global.gc();const memory=process.memoryUsage(),listeners=listenerState(h);
  stress.listenerBaseline??=listeners;stress.samples.push({level:id,seconds:rounded(e.elapsed),frame,heapUsed:memory.heapUsed,external:memory.external,rss:memory.rss,listeners,retainedMockNodes:h.nodes.size,engineEntities:(e.enemies?.length||0)+(e.board?.enemies?.length||0)+(e.hostile?.length||0)+(e.board?.hostile?.length||0)+(e.bullets?.length||0)+(e.board?.bullets?.length||0)});
 }
 const result=await play(assist,417147,{fps,sound:false,flightInput({h,e,input}){return h.c.CITADEL_CONVOY.active(e)?convoyInput(h,e):input;},finished(state){observeRuntime(state,true);},observe({h,e,id,frame}){
   observeRuntime({h,e,id,frame});
   const key=[id,e.status,e.phase,e.finale?.phase||''].join('/');
   if(key!==last){starts.push({level:id,key,elapsed:e.elapsed,objective:e.objective(),weapons:e.upgrades.weapons,armor:e.upgrades.armor,missiles:e.player.missiles,boardEnemyCount:e.board?.enemies.length||0,boardEnemyHP:e.board?.enemies.reduce((n,x)=>n+x.hp,0)||0});last=key;}
   if(!phases.has(id))phases.set(id,{level:id,initialHP:e.board?.hp??e.player.hp,initialStationHP:e.stationHp,minBoardOrShipHP:100,incomingHits:0,peakHostile:0,passiveSeconds:0,activeSeconds:0,lastHP:e.board?.hp??e.player.hp,firstEnemies:null,lastEnemies:null});
   const s=phases.get(id),hp=e.board?.hp??e.player.hp,live=(e.board?.enemies||e.enemies).filter(x=>!x.dead&&x.hp>0).length;
   s.minBoardOrShipHP=Math.min(s.minBoardOrShipHP,hp);if(hp<s.lastHP-.01)s.incomingHits++;s.lastHP=hp;s.peakHostile=Math.max(s.peakHostile,(e.board?.hostile||e.hostile).length);
   if(['playing','boarding'].includes(e.status)){s.activeSeconds+=1/fps;if(!live)s.passiveSeconds+=1/fps;else{s.firstEnemies??=e.elapsed;s.lastEnemies=e.elapsed;}}
   if(e.finale?.phase==='mrg'&&!mrg.waves.includes(e.finale.waveIndex))mrg.waves.push(e.finale.waveIndex);
   if(id===7&&e.swarm){
    const w=e.swarm.waveIndex??e.swarm.packet;if(!swarm.waves.includes(w)&&w<(e.swarm.waveTotal||3))swarm.waves.push(w);
    if(!swarm.packets.includes(e.swarm.packet))swarm.packets.push(e.swarm.packet);
    Object.assign(swarm,{version:e.swarm.version,wavesCleared:e.swarm.wavesCleared??e.swarm.packet,complete:e.swarm.complete,damageTaken:e.swarm.damageTaken,hitsTaken:e.swarm.hitsTaken,pickupsCollected:e.swarm.pickupsCollected});
   }
   if(e.phase==='escort'&&e.escort){
    if(!convoys.has(id))convoys.set(id,{level:id,minTransportHP:100,minSurviving:3});
    const c=convoys.get(id),allies=e.escort.allies;
    c.minTransportHP=Math.min(c.minTransportHP,...allies.map(a=>a.hp));c.minSurviving=Math.min(c.minSurviving,allies.filter(a=>!a.dead&&a.hp>0).length);
    c.lastTransportHP=allies.map(a=>rounded(a.hp));c.distance=e.escort.distance;c.stats={...e.escort.ops240?.stats};
   }
   if(frame%(fps*30)===0)samples.push({frame,level:id,time:e.elapsed,hp,phase:e.phase,finale:e.finale?.phase||null});
 }});
 if(stressEnabled){stress.listenerInvariant=stress.samples.every(x=>JSON.stringify(x.listeners)===JSON.stringify(stress.listenerBaseline));stress.emitIdentityStable=stress.emitIdentityChanges.length===0;stress.heapStart=stress.samples[0].heapUsed;stress.heapEnd=stress.samples.at(-1).heapUsed;stress.heapMax=Math.max(...stress.samples.map(x=>x.heapUsed));}
 Object.assign(result,{audit:'full-current-index-unmodified-production-input-only',fps,starts,metrics:[...phases.values()],samples,mrg,swarm,convoys:[...convoys.values()],stress});
 const file=path.join(out,'verifier-campaign-'+(tag?tag+'-':'')+mode+'-'+fps+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({report:file,pass:result.pass,mode,fps,levels:result.levels,cards:result.cards.length,error:result.error,metrics:result.metrics},null,2));if(!result.pass)process.exitCode=1;
}
module.exports={play,flightTrace};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
