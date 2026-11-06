/* Explicit synthetic browser QA. Never included in production. */
globalThis.CITADEL_TEST_MEMORY_ONLY=true;
addEventListener('load',()=>{
 const q=new URLSearchParams(location.search),kind=q.get('kind')||'pursuit',e=new RequirementArcade(417147,()=>{});
 ARCADE.engine=e;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;
 e.beginStage(kind==='swarm'?2:kind==='pursuit'?1:0);
 if(kind==='convoy'){e.status='stageclear';e.upgradeChoice='shield';e.beginEscort();e.launch();}
 else if(kind==='dog')e.beginBoarding();else e.launch();
 const s=CITADEL_CAMPAIGN.enable(e);s.modal=null;s.shownBeasts2140=Object.fromEntries(['hammer','tentacle','maw','mantis','medusa'].map(k=>[k,true]));s.story2170={seen:Object.fromEntries(CITADEL_COLLECTION.comics.map(c=>[c.id,true]))};
 if(kind==='cards'||kind==='art'){s.completed=CITADEL_CAMPAIGN.ids.slice();s.encounters={hammer:true,tentacle:true,maw:true,mantis:true,medusa:true};CITADEL_COLLECTION.observe(e);e.status='paused';arcadeAction('collection2170-open','cards');if(kind==='art')arcadeAction('collection2170-art','hammer');}
 else if(kind==='swarm'){e.swarm.waveIndex=Number(q.get('wave')||4);e.swarm.phase='cleared';e.swarm.transition=.001;e.step(.02,{});s.modal=null;e.enemies.forEach(x=>{x.pos=CITADEL_SWARM.formationPoint(e,x.slot,0);x.mode='formation';});}
 else if(kind==='dog'){e.board.intro=0;e.board.time=3;e.board.enemies=[{...e.board.enemies[0],id:777,archetype:'robodog',pos:V3.add(e.board.pos,[3,0,-5]),yaw:2.6,hp:70,maxHp:70,r:.9,dead:false,hit:0,stun:0,missions270:{kind:'dog',phase:'hunt',phaseClock:0,clock:1,heading:[.5,0,-1],gait:1.5,speed:7,scale:1}}];}
 else{e.enemies=[];const r=CITADEL_LIVING2176.state(e);CITADEL_LIVING2176.begin(e,r);r.age=Number(q.get('age')||5.16);r.cycle=0;CITADEL_LIVING2176.pose(r);e.explosions=[{pos:V3.add(e.player.pos,[9,3,-65]),life:.8,max:1.1,color:'#ffc888'}];}
 e.resumeStatus=kind==='dog'?'boarding':'playing';e.status=kind==='dog'?'boarding':'paused';if(kind==='dog')e.step=()=>{};ARCADE.fx=q.get('fx')!=='off';
 ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 if(!['cards','art'].includes(kind)){document.getElementById('arcade-overlay').hidden=true;const update=updateArcadeOverlay;updateArcadeOverlay=function(){const r=update.apply(this,arguments);document.getElementById('arcade-overlay').hidden=true;return r;};}
 const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:5px;left:5px;z-index:99999;background:#081923;color:#fff;padding:6px;font:12px sans-serif';
 panel.innerHTML='<button id="qa2176-pose">Следующая поза</button> <button id="qa2176-audio">Звук попадания / взрыва</button> <button id="qa2176-diag">Диагностика</button> <output id="qa2176-result">QA '+kind+'</output>';document.body.append(panel);for(const event of ['pointerdown','pointerup','click'])panel.addEventListener(event,x=>x.stopPropagation());
 document.getElementById('qa2176-pose').onclick=()=>{const r=s.rift2176;if(r){r.age+=.18;CITADEL_LIVING2176.pose(r);}if(kind==='dog')e.board.enemies[0].missions270.gait+=1.5;document.getElementById('qa2176-result').textContent='QA '+kind+' · другая поза';};
 document.getElementById('qa2176-diag').onclick=()=>{document.getElementById('qa2176-result').textContent=JSON.stringify(CITADEL_RUNTIME.diagnostic());};
 document.getElementById('qa2176-audio').onclick=async()=>{ARCADE.sound=true;const a=await CITADEL_SFX.play('armor-hit');const b=await CITADEL_SFX.play('destroy');document.getElementById('qa2176-result').textContent='АУДИО '+JSON.stringify({hit:a,blast:b});};
});
