/* Local QA only: UI commands build synthetic campaign boundaries. */
addEventListener('load',()=>{
 ARCADE.sound=false;SPACE_AUDIO.music=false;CITADEL_VOICE.setEnabled(false);
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  if(event.data==='home'){if(CUP.panel)cupClosePanel();arcadeAction('arcade-menu');return;}
  if(!['doc','full','award'].includes(event.data))return;
  if(CUP.panel)cupClosePanel();
  const e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');e.beginStage(0);e.launch();
  const C=CITADEL_CAMPAIGN,s=C.enable(e);s.story2170={seen:Object.fromEntries(CITADEL_COLLECTION.comics.map(c=>[c.id,true]))};s.documentSeen2140=99;e.step=function(dt){this.elapsed+=dt;};
  for(const id of event.data==='full'?C.ids:['orbit1','base1'])C.complete(e,id);
  if(event.data==='award'){e.status='playing';s.modal=null;CITADEL_COLLECTION.acknowledge();C.complete(e,'parallax');CITADEL_COLLECTION.unlock(e);}else{s.modal={type:'document'};e.status='paused';e.resumeStatus='playing';}
  ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 });
});
