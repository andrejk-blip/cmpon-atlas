/* Browser suite: real runtime/render/audio with normal gameplay commands. */
(async()=>{
 'use strict';const config=CONVOY_QA,started=performance.now(),keys=config.checkpoint==='suite'?['normal-3','normal-6','normal-9','calm-3','calm-6','calm-9']:[config.checkpoint];
 
 setView('arcade');CUP.panel=null;CUP.attached=false;let e,index=-1,finished=null,paused=false,steps=0,rafCalls=0,emitChanges=0,emitter=null,lastSample=0;const runs=[],samples=[],pauseChecks=[];let pausedState=null;
 const h={action:(...args)=>arcadeAction(...args)},originalInput=arcadeInput;
 function load(){index++;const mode=keys[index].startsWith('calm')?'calm':'normal',stage=keys[index]==='preview'?0:Number(keys[index].split('-')[1])/3-1;ARCADE.mode=mode;e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;e.assist=mode==='calm';e.beginStage(stage);e.upgrades={weapons:stage+1,rockets:0,armor:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();ARCADE.overlayToken='';emitter=null;h.action('citadel-launch');}
 function advance(){if(finished||paused||config.manual)return;
  if(keys[index]==='preview'&&e.escort.time>=15.5){h.action('arcade-pause');paused=true;finished='field-preview';return;}
  if(e.status==='paused'){h.action('arcade-resume');}

  if(e.status==='escortclear'){runs.push({key:keys[index],status:e.status,hp:e.player.hp,convoy:CITADEL_CONVOY.inspection(e)});if(index+1<keys.length)load();else finished='all-convoys-delivered';}
  else if(['lost','crashing'].includes(e.status)){runs.push({key:keys[index],status:e.status,convoy:CITADEL_CONVOY.inspection(e)});finished='pilot-lost';}
 }
 function command(){if(config.manual||paused||finished)return originalInput();if(emitter&&e.emit!==emitter)emitChanges++;emitter=e.emit;steps++;return CITADEL_CONVOY_INPUT(h,e);}
 load();
 arcadeInput=function(){rafCalls++;if(config.accelerated&&!config.manual&&!paused&&!finished)for(let n=0;n<119;n++){advance();if(finished||paused)break;if(e.status==='playing')e.step(1/60,command());}return command();};
 function snapshot(){return JSON.stringify({escort:e.escort,player:e.player,enemies:e.enemies,hostile:e.hostile,bullets:e.bullets});}
 function report(){advance();const now=performance.now(),metrics=CITADEL_QA_METRICS();if(now-lastSample>10000){samples.push({wallSeconds:Math.round((now-started)/1000),key:keys[index],seconds:e.escort.time,listeners:metrics.listeners,heap:metrics.heap,rafPending:metrics.rafPending});lastSample=now;if(samples.length>180)samples.shift();}
  parent.postMessage({kind:'citadel-qa',report:{version:'2.4.0',config,finished,key:keys[index],status:e.status,wallSeconds:Math.round((now-started)/1000),steps,rafCalls,emitChanges,renderer:ARCADE.renderer?.mode,convoy:CITADEL_CONVOY.inspection(e),runs,samples,pauseChecks,metrics,runtime:CITADEL_RUNTIME.diagnostic(),geometry:CITADEL_CONVOY_VIEW.stats(),renderStats:CITADEL_PURSUIT_VIEW.stats(),sound:CITADEL_SFX.status(),voice:CITADEL_VOICE.status()}},new URL(document.baseURI).origin);
 }
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.kind!=='citadel-qa-control')return;
  if(event.data.action==='audio'){spaceAudioUnlock();arcadeAudio();CITADEL_VOICE.setEnabled?.(true);}
  if(event.data.action==='pause'){if(!paused){if(e.status!=='paused')h.action('arcade-pause');pausedState=snapshot();paused=true;}else{pauseChecks.push({unchanged:pausedState===snapshot()});paused=false;if(e.status==='paused')h.action('arcade-resume');}}
 });setInterval(()=>{try{report();}catch(error){finished='qa-error';console.error(error);}},1500);report();
})().catch(error=>{console.error(error);parent.postMessage({kind:'citadel-qa',report:{finished:'load-error',error:String(error)}},new URL(document.baseURI).origin);});
