/* Browser operator: normal actions, ordinary input fields, wall-clock RAF. */
(async function(){
 'use strict';
 const config=window.AUDIT_QA, mode=config.mode,started=performance.now(),samples=[],transitions=[],cards=[],levels=new Set();
 const operators=CITADEL_QA_INPUTS;
 setView('arcade'); CUP.panel=null;CUP.attached=false;ARCADE.mode=mode==='calm'?'calm':'normal';
 const e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;e.assist=mode==='calm';
 if(config.scene==='campaign')e.start(mode==='calm');
 else {e.beginStage(({swarm:2,pursuit:1,mrg:3,parallax:3,convoy:2,foundry:1,wreck:3})[config.scene]||0);
  if(['base','foundry'].includes(config.scene))e.beginBoarding();
  else if(config.scene==='wreck'){e.beginFinale();e.beginBoarding();}
  else if(config.scene==='mrg'){e.beginFinale();e.beginMRG();}
  else if(config.scene==='parallax'){e.beginFinale();e.launchFinale();}
  else if(config.scene==='convoy'){e.status='stageclear';e.upgradeChoice='weapons';e.upgrades.weapons=2;e.upgrades.armor=1;e.beginEscort();e.launch();}
  else e.launch();
  if(!ARCADE.expanded)arcadeAction('arcade-expand');
 }
 ARCADE.overlayToken=''; updateArcadeHUD();updateArcadeOverlay();
 const answered=new Set();
 const h={action:(action,...args)=>{
  const kind=action==='citadel-lesson-answer'?'flight':action==='citadel-answer'?'terminal':action==='finale-answer'?'final':null;
  if(kind){const index=kind==='flight'?e.lesson?.caseIndex:kind==='terminal'?e.board?.question:e.board?.completed?.length;const stamp=level()+'/'+kind+'/'+index;if(!answered.has(stamp)){answered.add(stamp);cards.push({level:level(),kind,index});}}
  return arcadeAction(action,...args);
 },lessonCase:citadelLessonCase,arcade:ARCADE,deckQA:{path:stationPath,line:stationLine,input:arcadeInput}};
 const convoyPilots=new WeakMap();
 const convoyCommand=()=>{let p=convoyPilots.get(e.escort);if(!p){p=CITADEL_CONVOY_PILOT(h,e,{reaction:.35,device:'joystick'});convoyPilots.set(e.escort,p);}return p.input();};
 const orbital=CITADEL_QA_ORBITAL260.createOrbitalController(h,{resupply:false}),deck=CITADEL_QA_BASE270.createController(h),swarm=CITADEL_QA_SWARM270.createController(CITADEL_SWARM,{reaction:.2}),mrg=operators.createMrgController();
 let parallax=null,key='',frameCalls=0,emitChanges=0,lastEmit=e.emit,finished=null,manualPause=false;
 let lastElapsed=e.elapsed,lastMovement=performance.now(),lastSample=0,maxGap=0,lastInputTime=performance.now();
 const level=()=>e.finale?(['mrg','upload','victory'].includes(e.finale.phase)?14:e.finale.phase==='maze'?13:12):e.phase==='escort'?e.stage*3+3:e.board?e.stage*3+2:e.stage*3+1;
 const originalInput=arcadeInput;
 const command=function(){
  if(finished||manualPause||config.manual)return originalInput();
  frameCalls++;const time=performance.now();maxGap=Math.max(maxGap,time-lastInputTime);lastInputTime=time;
  if(e.emit!==lastEmit){emitChanges++;lastEmit=e.emit;}
  if(e.finale?.phase==='mrg')return mrg(e);
  if(e.finale?.phase==='boss')return(parallax||=operators.createParallaxController(h,e))();
  if(e.status==='boarding')return deck(e);
  if(e.phase==='pursuit')return operators.pursuitInput(h,e);
  if(e.phase==='swarm')return swarm(e);
  if(CITADEL_CONVOY.active(e))return convoyCommand();
  if(e.status==='playing')return orbital(e);
  return{};
 };
 let rafInputCalls=0;
 arcadeInput=function(){
  rafInputCalls++;
  if(config.accelerated&&!config.manual&&!finished&&!manualPause) {
   for(let i=0;i<599;i++) {next();if(finished||e.status==='paused')break;if(['playing','boarding','docking','lesson','crashing'].includes(e.status))e.step(1/60,command());}
  }
  return command();
 };
 function next(){
  if(finished||manualPause||config.manual||document.hidden)return;
  const id=level(),nextKey=[id,e.status,e.phase,e.finale?.phase,e.wave,e.board?.completed?.length].join('/');levels.add(id);
  if(nextKey!==key){transitions.push({level:id,status:e.status,phase:e.phase,finale:e.finale?.phase||null,seconds:+e.elapsed.toFixed(2)});key=nextKey;}
  if(CITADEL_STORY.status(e).active){h.action('story-next');return;}
  if(['briefing','escortbrief'].includes(e.status)){h.action('citadel-launch');return;}
  if(e.status==='lesson'){const q=citadelLessonCase(e,e.lesson.caseIndex);if(!e.lesson.solved){h.action('citadel-lesson-answer',q.correct);}h.action('citadel-lesson-next');}
  else if(e.status==='remark'){if(CITADEL_DECK_COMBAT.clearance(e).remaining)throw Error('Terminal before clearance');h.action('citadel-answer',citadelRemarkCase(e,e.board.question).correct);h.action('citadel-remark-next');}
  else if(e.status==='finalcheck'){if(CITADEL_DECK_COMBAT.clearance(e).remaining)throw Error('Final card before clearance');h.action('finale-answer',FINALE_TRIALS[e.board.completed.length].correct);h.action('finale-check-next');}
  else if(e.status==='stageclear'){h.action('citadel-upgrade',['weapons','weapons','armor'][e.stage]);e.next();}
  else if(e.status==='escortclear')h.action('citadel-escort-continue');
  else if(e.status==='finalebrief')h.action('finale-launch');
  else if(e.status==='won')finished='won';
  else if(['crashing','lost'].includes(e.status))finished='pilot-lost';
 }
 function inspectDOM(){
  const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,w:r.width,h:r.height,display:s.display,visible:!!(r.width&&r.height)&&s.display!=='none'&&s.visibility!=='hidden',text:el.textContent?.slice(0,180),disabled:!!el.disabled};};
  const root=document.getElementById('arcade-layout');return{viewport:{w:innerWidth,h:innerHeight},layout:rect(root),canvas:rect(ARCADE.canvas),header:rect(document.querySelector('.citadel-objective')),route:rect(document.getElementById('citadel-route')),defense:rect(document.querySelector('.citadel-touch-defense')),cover:rect(document.getElementById('convoy240-cover-touch')),boost:rect(document.getElementById('arcade-boost-touch')),buttons:[...document.querySelectorAll('.arcade-touch-actions button')].map(rect).filter(x=>x.visible),horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
 }
 function report(){
  const time=performance.now(),metrics=CITADEL_QA_METRICS();
  if(e.elapsed!==lastElapsed){lastElapsed=e.elapsed;lastMovement=time;}
  if(!finished&&!manualPause&&!document.hidden&&['playing','boarding','docking'].includes(e.status)&&time-lastMovement>6000&&metrics.errors.length)finished='frame-failed';
  if(time-lastSample>10000){samples.push({wallSeconds:Math.round((time-started)/1000),gameSeconds:Math.round(e.elapsed),level:level(),listeners:metrics.listeners,heap:metrics.heap,rafPending:metrics.rafPending});lastSample=time;if(samples.length>360)samples.shift();}
  updateArcadeHUD();const sound=CITADEL_SFX.status(),voice=CITADEL_VOICE.status();
  parent.postMessage({kind:'citadel-qa',report:{version:'2.7.0',config,renderer:ARCADE.renderer?.mode,mode,accelerated:!!config.accelerated,rafInputCalls,finished,status:e.status,level:level(),levels:[...levels],cards:cards.length,wallSeconds:Math.round((time-started)/1000),simulatedSeconds:+e.elapsed.toFixed(2),frameCalls,emitChanges,maxInputGapMs:Math.round(maxGap),metrics,input:globalThis.CITADEL_INPUT?.status?.(),player:{hp:e.board?.hp??e.player.hp,missiles:e.player.missiles},runtime:window.CITADEL_RUNTIME?.diagnostic()||null,sound:{context:sound.contextState,loaded:sound.loadedClips,active:sound.activeVoices,cacheBytes:sound.cachedBytes,played:sound.played},voice:{busy:voice.busy,source:voice.source,radio:voice.radio},swarm:e.swarm?{wave:e.swarm.wave,enemies:e.enemies.filter(x=>!x.dead).length,hostile:e.hostile.length}:null,base:globalThis.CITADEL_BASE_MISSIONS?.inspection?.(e),samples,transitions,presentation:CITADEL_PRESENTATION.model(e),art:globalThis.CITADEL_SWARM_VIEW?.stats?.()||null,dom:inspectDOM()}},new URL(document.baseURI).origin);
 }
 setInterval(()=>{try{next();}catch(error){finished='operator-error';console.error(error);}},100);
 setInterval(report,2000);
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.kind!=='citadel-qa-control')return;
  if(event.data.action==='audio'){spaceAudioUnlock();arcadeAudio();CITADEL_VOICE.setEnabled?.(true);}
  if(event.data.action==='pause'){manualPause=!manualPause;h.action(manualPause?'arcade-pause':'arcade-resume');lastMovement=lastInputTime=performance.now();}
 });
 report();
})();
