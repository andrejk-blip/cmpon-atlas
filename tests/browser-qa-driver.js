/* Browser operator: normal actions, ordinary input fields, wall-clock RAF. */
(async function(){
 'use strict';
 const mode=window.CITADEL_QA_MODE,started=performance.now(),samples=[],transitions=[],cards=[],levels=new Set();
 const operators=CITADEL_QA_INPUTS;
 setView('arcade'); CUP.panel=null;CUP.attached=false;ARCADE.mode=mode==='calm'?'calm':'normal';
 const e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;e.start(mode==='calm');
 const h={action:(...args)=>arcadeAction(...args),lessonCase:citadelLessonCase,deckQA:{path:stationPath,line:stationLine,input:arcadeInput}};
 const deck=operators.createDeckController(h),swarm=operators.createSwarmController(CITADEL_SWARM),mrg=operators.createMrgController();
 let parallax=null,key='',frameCalls=0,emitChanges=0,lastEmit=e.emit,finished=null,manualPause=false;
 let lastElapsed=e.elapsed,lastMovement=performance.now(),lastSample=0,maxGap=0,lastInputTime=performance.now();
 const level=()=>e.finale?(['mrg','upload','victory'].includes(e.finale.phase)?14:e.finale.phase==='maze'?13:12):e.phase==='escort'?e.stage*3+3:e.board?e.stage*3+2:e.stage*3+1;
 const originalInput=arcadeInput;
 const command=function(){
  if(finished||manualPause)return originalInput();
  frameCalls++;const time=performance.now();maxGap=Math.max(maxGap,time-lastInputTime);lastInputTime=time;
  if(e.emit!==lastEmit){emitChanges++;lastEmit=e.emit;}
  if(e.finale?.phase==='mrg')return mrg(e);
  if(e.finale?.phase==='boss')return(parallax||=operators.createParallaxController(h,e))();
  if(e.status==='boarding')return deck(e);
  if(e.phase==='pursuit')return operators.pursuitInput(h,e);
  if(e.phase==='swarm')return swarm(e);
  if(e.status==='playing'){const target=e.target?.(),close=e.hostile.some(x=>Math.hypot(...x.pos.map((v,i)=>v-e.player.pos[i]))<12);return{fire:true,missile:!!target&&e.player.missiles>0,pulse:close,interact:e.phase==='dock'};}
  return{};
 };
 let rafInputCalls=0;
 arcadeInput=function(){
  rafInputCalls++;
  if(window.CITADEL_QA_ACCELERATED&&!finished&&!manualPause) {
   for(let i=0;i<119;i++) {next();if(finished||e.status==='paused')break;if(['playing','boarding','docking','lesson','crashing'].includes(e.status))e.step(1/60,command());}
  }
  return command();
 };
 function next(){
  if(finished||manualPause||document.hidden)return;
  const id=level(),nextKey=[id,e.status,e.phase,e.finale?.phase,e.wave,e.board?.completed?.length].join('/');levels.add(id);
  if(nextKey!==key){transitions.push({level:id,status:e.status,phase:e.phase,finale:e.finale?.phase||null,seconds:+e.elapsed.toFixed(2)});key=nextKey;}
  if(CITADEL_STORY.status(e).active){h.action('story-next');return;}
  if(['briefing','escortbrief'].includes(e.status)){h.action('citadel-launch');return;}
  if(e.status==='lesson'){const q=citadelLessonCase(e,e.lesson.caseIndex);if(!e.lesson.solved){cards.push({level:id,kind:'flight'});h.action('citadel-lesson-answer',q.correct);}h.action('citadel-lesson-next');}
  else if(e.status==='remark'){if(CITADEL_DECK_COMBAT.clearance(e).remaining)throw Error('Terminal before clearance');cards.push({level:id,kind:'terminal'});h.action('citadel-answer',citadelRemarkCase(e,e.board.question).correct);h.action('citadel-remark-next');}
  else if(e.status==='finalcheck'){if(CITADEL_DECK_COMBAT.clearance(e).remaining)throw Error('Final card before clearance');cards.push({level:id,kind:'final'});h.action('finale-answer',FINALE_TRIALS[e.board.completed.length].correct);h.action('finale-check-next');}
  else if(e.status==='stageclear'){h.action('citadel-upgrade',['weapons','weapons','armor'][e.stage]);e.next();}
  else if(e.status==='escortclear')h.action('citadel-escort-continue');
  else if(e.status==='finalebrief')h.action('finale-launch');
  else if(e.status==='won')finished='won';
  else if(['crashing','lost'].includes(e.status))finished='pilot-lost';
 }
 function report(){
  const time=performance.now(),metrics=CITADEL_QA_METRICS();
  if(e.elapsed!==lastElapsed){lastElapsed=e.elapsed;lastMovement=time;}
  if(!finished&&!manualPause&&!document.hidden&&['playing','boarding','docking'].includes(e.status)&&time-lastMovement>6000&&metrics.errors.length)finished='frame-failed';
  if(time-lastSample>10000){samples.push({wallSeconds:Math.round((time-started)/1000),gameSeconds:Math.round(e.elapsed),level:level(),listeners:metrics.listeners,heap:metrics.heap,rafPending:metrics.rafPending});lastSample=time;if(samples.length>360)samples.shift();}
  const sound=CITADEL_SFX.status(),voice=CITADEL_VOICE.status();
  parent.postMessage({kind:'citadel-qa',report:{mode,accelerated:!!window.CITADEL_QA_ACCELERATED,rafInputCalls,finished,status:e.status,level:level(),levels:[...levels],cards:cards.length,wallSeconds:Math.round((time-started)/1000),simulatedSeconds:+e.elapsed.toFixed(2),frameCalls,emitChanges,maxInputGapMs:Math.round(maxGap),metrics,runtime:window.CITADEL_RUNTIME?.diagnostic()||null,sound:{context:sound.contextState,loaded:sound.loadedClips,active:sound.activeVoices,cacheBytes:sound.cachedBytes,played:sound.played},voice:{busy:voice.busy,source:voice.source},samples,transitions}},new URL(document.baseURI).origin);
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
