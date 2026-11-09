/* Synthetic visual fixtures; excluded from production entry points. */
globalThis.CITADEL_TEST_MEMORY_ONLY=true;
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search),kind=q.get('kind')||'grid',e=new RequirementArcade(417147,arcadeEvent);
 ARCADE.engine=e;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;
 e.beginStage(kind==='fire'?1:2);e.beginBoarding();const s=CITADEL_CAMPAIGN.enable(e);s.modal=null;s.documentSeen2140=99;s.shownBeasts2140={hammer:true,tentacle:true,maw:true,mantis:true,medusa:true};s.story2170={seen:Object.fromEntries(CITADEL_COLLECTION.comics.map(c=>[c.id,true]))};
 const b=e.board,hazard=b.missions270.hazards.find(x=>x.type===(kind==='fire'?'fire':'laser-grid')),point=hazard.pos||V3.lerp(hazard.from,hazard.to,.5);
 b.enemies=[];b.hp=55;b.intro=0;b.time=3;b.camera=V3.add(point,[0,0,3]);b.pos=V3.add(point,[2.5,0,5]);b.previous=b.pos.slice();b.invulnerable=99;e.player.missiles=16;
 e.step=function(dt){b.time+=dt;hazard.clock=(hazard.clock||0)+dt;};ARCADE.fx=q.get('fx')!=='off';ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:2px;left:2px;right:2px;z-index:99999;background:#081923;color:#fff;padding:5px;font:11px sans-serif';panel.innerHTML='<button id="qa2178-exit">Проверить выход</button> <button id="qa2178-off">Отключить опасность</button> <output id="qa2178-result">QA '+kind+'</output>';document.body.append(panel);for(const type of ['pointerdown','pointerup','click'])panel.addEventListener(type,x=>x.stopPropagation());
 document.getElementById('qa2178-exit').onclick=()=>{b.completed=[e.stage*3,e.stage*3+1,e.stage*3+2];b.pos=b.exit.slice();b.camera=b.pos.slice();const result=e.boardInteract();document.getElementById('qa2178-result').textContent=JSON.stringify({result,status:e.status,history:e.decisions.length,completed:s.completed});updateArcadeHUD();updateArcadeOverlay();};
 document.getElementById('qa2178-off').onclick=()=>{hazard.active=!hazard.active;document.getElementById('qa2178-result').textContent='Опасность '+(hazard.active?'включена':'отключена');};
});
