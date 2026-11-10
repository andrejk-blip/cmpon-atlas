/* Synthetic browser fixtures only; never loaded by production entries. */
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search);const e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;
 ARCADE.sound=false;SPACE_AUDIO.music=false;CITADEL_VOICE.setEnabled(false);CUP.run=null;
 CITADEL_LEARNING_MODES.setEngineMode(e,'combat');e.beginStage(0);e.launch();e.autopilot=false;e.player.hp=78;e.player.missiles=7;
 // Freeze world movement so UI shots are repeatable; ordinary UI actions stay live.
 let comicPreview=false;e.step=function(dt){this.elapsed+=dt;if(comicPreview)CITADEL_COMIC.post(this,{text:'ЕЩЁ ОДНО УТОЧНЕНИЕ! КОСМИЧЕСКИЕ АНАЛИТИКИ, ПРИГОТОВЬТЕСЬ К НОВОЙ ВОЛНЕ ЗАМЕЧАНИЙ! '+Math.floor(this.elapsed),kind:'enemy'});};
 const C=CITADEL_CAMPAIGN,s=C.enable(e);s.modal=null;s.story2170={seen:Object.fromEntries(CITADEL_COLLECTION.comics.map(x=>[x.id,true]))};s.documentSeen2140=99;
 ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 const qaStatus=document.createElement('output');qaStatus.id='qa2181-status';qaStatus.style.cssText='position:fixed;top:0;left:0;z-index:20060;color:white;background:#132e38;font:10px Arial';document.body.appendChild(qaStatus);
 const draw=drawMobileGameHUD;drawMobileGameHUD=function(){const r=draw.apply(this,arguments),s=CITADEL_COMIC.status(ARCADE.engine);qaStatus.textContent=s.active?(s.bounds?'комикс виден':'комикс без места'):'QA';return r;};
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  if(ARCADE.engine.status==='paused')arcadeAction('arcade-resume');
  if(event.data==='comic')comicPreview=true;
  if(event.data==='comic')CITADEL_COMIC.post(ARCADE.engine,{text:'ЕЩЁ ОДНО УТОЧНЕНИЕ! КОСМИЧЕСКИЕ АНАЛИТИКИ, ПРИГОТОВЬТЕСЬ К НОВОЙ ВОЛНЕ ЗАМЕЧАНИЙ!',kind:'enemy'});
  if(event.data==='fault'){let failures=2;const old=drawMobileGameHUD;drawMobileGameHUD=function(){if(failures-->0)throw Error('QA paint failure');drawMobileGameHUD=old;return old.apply(this,arguments);};}
  if(event.data==='deck'){e.beginBoarding();e.board.intro=0;e.board.hp=62;e.board.completed=[0];e.step=function(dt){this.elapsed+=dt;};ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}
 });
});
