/* Synthetic visual QA controls; never loaded by the published game. */
addEventListener('load',()=>{
 const kind=new URLSearchParams(location.search).get('kind')||'rocks',e=new RequirementArcade(417147,arcadeEvent);ARCADE.engine=e;
 CITADEL_VOICE.setEnabled(false);ARCADE.sound=false;SPACE_AUDIO.music=false;CITADEL_LEARNING_MODES.setEngineMode(e,'combat');
 e.beginStage(1);if(kind==='mech')e.beginBoarding();else if(kind==='parallax'){e.beginFinale();e.launchFinale();}else e.launch();
 const c=CITADEL_CAMPAIGN.enable(e);c.modal=null;c.documentSeen2140=99;c.shownBeasts2140=Object.fromEntries(['hammer','tentacle','maw','mantis','medusa'].map(k=>[k,true]));c.story2170={seen:Object.fromEntries(CITADEL_COLLECTION.comics.map(x=>[x.id,true]))};c.rift2176={mission:CITADEL_CAMPAIGN.mission(e),done:true};
 let deadSubject=null;
 if(kind==='mech'){
  const b=e.board;deadSubject=b.enemies.find(x=>x.missions270?.kind==='mech');const center=deadSubject.pos.slice();b.enemies=[deadSubject];b.completed=[3,4];b.pos=V3.add(center,[2,0,7]);b.camera=V3.add(center,[0,0,2]);b.intro=0;b.time=3;deadSubject.yaw=.8;deadSubject.alert=false;deadSubject.missions270.phase='recover';
 }else if(kind!=='parallax'){
  e.phase='battle';e.status='playing';e.player.pos=[0,0,50];e.player.yaw=0;e.player.pitch=0;e.enemies=[];e.boss=null;e.nodes=[];e.pickups=[];e.station.pos=[1000,0,-2000];e.asteroids=kind==='rocks'?Array.from({length:5},(_,i)=>({id:700+i,pos:[(i-2)*19,0,-20],r:7.5,phase:i*.7,variant:i%3,mineral2179:i})):[];
  const cam=spaceCamera;spaceCamera=function(target,...args){return target===e?stationLook([0,17,100],[0,0,-20],.9,{near:.4,far:6000}):cam(target,...args);};
 }
 let frozen=true;
 const tick=dt=>{e.elapsed+=dt;if(e.board)e.board.time+=dt;if(e.finale?.leviathan)e.finale.leviathan.clock+=dt;const s=CITADEL_CINEMA2179.state(e);s.clock+=dt;for(const x of [...s.rocks,...s.deaths])x.age+=dt;s.rocks=s.rocks.filter(x=>x.age<x.life);s.deaths=s.deaths.filter(x=>x.age<x.life);for(const x of e.explosions)x.life-=dt;e.explosions=e.explosions.filter(x=>x.life>0);};
 e.step=dt=>{if(!frozen)tick(dt);};
 const overlay=updateArcadeOverlay;updateArcadeOverlay=function(){const r=overlay.apply(this,arguments);document.getElementById('arcade-overlay').hidden=true;return r;};ARCADE.fx=true;ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();
 const p=document.createElement('div');p.style.cssText='position:fixed;bottom:3px;left:3px;right:3px;z-index:99999;background:#081923ef;color:#fff;padding:6px;font:12px sans-serif';p.innerHTML='<button id="qa-action">'+(kind==='mech'?'Уничтожить меха':kind==='rocks'?'Разрушить астероиды':kind==='parallax'?'Показать глаз':'Пять взрывов')+'</button> <button id="qa-frame">+0,35 с</button> <button id="qa-play">Анимация</button> <button id="qa-voice">Реплика</button> <button id="qa-renderer">Графика</button> <output id="qa-result">Тестовая сцена · '+kind+'</output>';document.body.append(p);for(const t of ['pointerdown','pointerup','click'])p.addEventListener(t,x=>x.stopPropagation());
 const out=t=>document.getElementById('qa-result').textContent=t;
 document.getElementById('qa-action').onclick=()=>{
  if(kind==='mech'){e.boardHit(deadSubject,99999,e.board.pos,true);tick(.55);}
  else if(kind==='rocks'){for(const x of e.asteroids.slice())e.blockFlightShot(V3.add(x.pos,[0,0,20]),V3.add(x.pos,[0,0,-20]),{damage:9999,r:.2},false);tick(.4);}
  else if(kind==='parallax'){e.player.pos=[0,0,160];e.finale.leviathan.clock=6;e.finale.leviathan.transit=e.finale.leviathan.transitDuration;}
  else e.explosions=Array.from({length:5},(_,i)=>({pos:[(i-2)*21,0,-20],max:1.8,life:1.3,color:CITADEL_CINEMA2179.blasts[i].flame,style2179:i,size2179:4}));
  out(JSON.stringify({scene:kind,fx:CITADEL_CINEMA2179.state(e).rocks.length,deaths:CITADEL_CINEMA2179.state(e).deaths.length,shader:CITADEL_PARALLAX2179.status()}));
 };
 document.getElementById('qa-frame').onclick=()=>{tick(.35);out('Кадр +0,35 с');};document.getElementById('qa-play').onclick=()=>{frozen=!frozen;out(frozen?'Стоп-кадр':'Анимация');};
 document.getElementById('qa-renderer').onclick=()=>{const canvas=document.createElement('canvas');let r;try{r=new SpaceRendererCore(canvas);out(JSON.stringify({mode:r.mode,error:r.error?.message,shader:CITADEL_PARALLAX2179.status()}));}catch(error){out(String(error));}finally{r?.dispose();}};
 document.getElementById('qa-voice').onclick=async()=>{ARCADE.sound=true;CITADEL_VOICE.setEnabled(true);await CITADEL_SFX.play('robot-death');const result=await CITADEL_VOICE.enemyLine('Нееет! Ты не соберёшь эти требования!',{label:'ПАРАЛЛАКС',anchor:V3.add(e.player.pos,[0,7,-40])});out(JSON.stringify(result));};
});
