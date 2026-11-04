/* Synthetic convoy preview only. Never load this fixture in a release entry. */
globalThis.CITADEL_TEST_MEMORY_ONLY=true;
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search),e=new RequirementArcade(417147,()=>{});
 ARCADE.engine=e;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');
 CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;
 e.beginStage(Math.min(2,Math.max(0,Number(q.get('stage'))||0)));
 const s=CITADEL_CAMPAIGN.enable(e);s.modal=null;
 e.status='stageclear';e.upgradeChoice='hull';e.beginEscort();s.modal=null;
 if(q.get('state')!=='brief'){e.launch();e.escort.time=2;e.elapsed=2;}
 ARCADE.fx=q.get('fx')!=='off';
 ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 const note=document.createElement('output');note.id='convoy2175-fixture';note.style.cssText='position:fixed;left:8px;bottom:3px;color:#d7e6ee;background:#071825;padding:2px 5px;font:10px sans-serif;pointer-events:none;z-index:99999';document.body.appendChild(note);
 const report=()=>{note.textContent='QA · '+e.status+' · конвой '+e.escort.time.toFixed(2)+' с · '+(ARCADE.fx?'полные эффекты':'минимум эффектов')+' · '+(ARCADE.renderer?.gl?'WebGL':'CPU');};
 report();const previous=updateArcadeHUD;updateArcadeHUD=function(...args){const r=previous.apply(this,args);report();return r;};
});
