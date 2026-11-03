/* Explicit synthetic browser-layout fixtures. Never loaded by the game entry. */
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search),kind=q.get('kind')||'lesson',mode=q.get('mode')||'combat',index=Number(q.get('index')||0);
 const e=new RequirementArcade(417147,()=>{});ARCADE.engine=e;e.caseBank=1;CITADEL_LEARNING_MODES.setEngineMode(e,mode);CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;
 if(kind==='menu'){ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();return;}
 e.beginStage(kind==='final'?3:0);CITADEL_CAMPAIGN.enable(e);
 if(kind==='lesson'){e.lesson={caseIndex:index,stage:0,reqId:e.plan[0][0],attempts:0,feedback:null,solved:false,readClock:0};e.status='lesson';}
 else if(kind==='remark'){e.beginBoarding();if(e.status==='campaignsummary')arcadeAction('campaign-summary-next');e.board.question=index;e.board.answered=false;e.status='remark';}
 else if(kind==='final'){e.beginFinale();e.campaign2120.station=null;e.finale={phase:'maze',checkpoint:'maze',time:0,tests:[],answer:null};e.beginLair();e.board.completed=Array.from({length:index},(_,i)=>i);e.status='finalcheck';}
 else if(kind==='campaign'){e.campaign2120.card={mission:q.get('id')||'contradictions',answer:null,correct:null};e.status='campaigncard';}
 else {e.status='paused';e.campaign2120.completed=CITADEL_CAMPAIGN.ids.slice();e.campaign2120.encounters=Object.fromEntries(['hammer','tentacle','maw','mantis','medusa'].map(k=>[k,true]));}
 e.campaign2120.modal=null;CITADEL_COLLECTION.observe(e);
 if(kind==='art'||kind==='comics'||kind==='cards'){arcadeAction('collection2170-open',kind==='comics'?'comics':'cards');if(kind==='art')arcadeAction('collection2170-art',q.get('id')||'parallax');if(kind==='comics')arcadeAction('collection2170-comic',q.get('id')||'departure');}
 if(q.has('answer')){const c=CITADEL_QUIZ_UI.current(e);if(c)arcadeAction(c.answer,Number(q.get('answer')));}
 ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
});
