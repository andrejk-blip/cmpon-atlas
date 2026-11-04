/* Explicit synthetic layout states for browser QA only. Never load in production. */
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search),kind=q.get('kind')||'lost';
 const e=new RequirementArcade(417147,()=>{});ARCADE.engine=e;e.caseBank=1;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;
 e.beginStage(0);CITADEL_CAMPAIGN.enable(e);e.campaign2120.modal=null;
 if(kind==='lost'){e.status='lost';e.lossReason='Столкновение с корпусом Цитадели. Входить в док можно только по разрешённому маршруту стыковки.';e.campaign2120.events=[1,2,3,4].map((x,i)=>({mission:'orbit1',text:'Щит корабля −'+(10+i*4)}));}
 else if(kind==='briefing'){e.status='briefing';}
 else if(kind==='escortbrief'){e.status='stageclear';e.upgradeChoice='shield';e.beginEscort();}
 else if(kind==='map'){e.status='paused';e.campaign2120.modal={type:'document'};}
 else if(kind==='skills'){e.status='paused';}
 else if(kind==='story'){e.status='briefing';CITADEL_STORY.open(e,true);}
 else if(kind==='quiz'){e.lesson={caseIndex:0,stage:0,reqId:e.plan[0][0],attempts:0,feedback:null,solved:false,readClock:0};e.status='lesson';if(q.has('answer')){const c=CITADEL_QUIZ_UI.current(e);if(c)arcadeAction(c.answer,0);}}
 else if(kind==='cards'){e.status='paused';e.campaign2120.completed=CITADEL_CAMPAIGN.ids.slice();e.campaign2120.encounters=Object.fromEntries(['hammer','tentacle','maw','mantis','medusa'].map(k=>[k,true]));CITADEL_COLLECTION.observe(e);arcadeAction('collection2170-open','cards');}
 ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
});
