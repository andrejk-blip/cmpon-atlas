/* One readable comic HUD, using the existing frame and UI owners. */
(()=>{
 'use strict';if(globalThis.CITADEL_HUD2178)return;
 const live=e=>!!e&&!e.campaign2120?.modal&&!globalThis.CITADEL_RESONATOR?.active(e)&&['playing','boarding','docking','crashing'].includes(e.status);
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
 let open=false;
 // Read mission state, never advance it. Each label says what the bar measures.
 function progress(e){
  const C=globalThis.CITADEL_CAMPAIGN,S=globalThis.CITADEL_SWARM,number=C?.active(e)?C.number(e):CITADEL_PRESENTATION.level(e);
  let fraction=0,label='ЗАДАЧИ УРОВНЯ';
  if(e.phase==='escort'&&e.escort){fraction=e.escort.distance;label='ПЕРЕХОД · '+e.escort.allies.filter(x=>!x.dead).length+' В СТРОЮ';}
  else if(e.phase==='pursuit'&&e.pursuit){fraction=e.pursuit.progress/100;label='ПЕРЕДАЧА · ЭТАП '+(e.pursuit.chapter+1)+'/3';}
  else if(e.phase==='swarm'&&e.swarm){const wave=S.waveIndex(e),total=S.waveTotal(e),count=S.secondsNeeded(e),alive=e.enemies.filter(x=>!x.dead&&x.hp>0).length;fraction=(wave+clamp(1-alive/Math.max(1,count)))/total;label='РОЙ · ВОЛНА '+(wave+1)+'/'+total;}
  else if(e.finale?.phase==='mrg'){const m=e.finale.mrg;fraction=1-(m?.hp||0)/Math.max(1,m?.maxHp||1);label='МРГ · ФИНАЛЬНЫЙ БОЙ';}
  else if(e.finale?.phase==='boss'){const beacons=e.finale.leviathan?.beacons??(4-e.enemies.filter(x=>!x.dead).length),boss=e.boss;fraction=(beacons+clamp(1-(boss?.hp||0)/Math.max(1,boss?.maxHp||1)))/5;label='ПАРАЛЛАКС · МАЯКИ '+beacons+'/4';}
  else if(e.board){const n=e.board.completed?.length||0;fraction=n/3;label=n<3?'ТЕРМИНАЛЫ · '+n+'/3':'ТЕРМИНАЛЫ ГОТОВЫ · К ВЫХОДУ';}
  else if(e.status==='docking'){fraction=e.dockProgress?.()||0;label='СТЫКОВКА';}
  else if(e.finale){fraction=['breach','victory'].includes(e.finale.phase)?1:clamp(e.finale.time/(e.finale.phase==='upload'?8:ARCADE.fx?13:4));label=e.finale.phase==='upload'?'ПЕРЕДАЧА ФТ':'ВЫСАДКА';}
  else {const p=e.progress();fraction=(Math.min(3,p.modules)+Math.min(p.enemies,p.kills))/Math.max(1,3+p.enemies);label='ФТ '+p.modules+'/3 · ЦЕЛИ '+p.kills+'/'+p.enemies;}
  return{number,label,fraction:clamp(fraction),percent:Math.floor(clamp(fraction)*100)};
 }
 function sync(){
  const e=ARCADE.engine,layout=document.getElementById('arcade-layout');if(!layout)return;
  const active=live(e);if(!active)open=false;
  layout.classList.toggle('hud2178-active',active);layout.classList.toggle('hud2178-settings-open',active&&open);
  const mobile=isMobileLayout(),r=ARCADE.canvas?.getBoundingClientRect?.(),wide=mobile&&r?.width>r?.height*1.25;
  layout.classList.toggle('hud2181-mobile',mobile);layout.classList.toggle('hud2181-wide',!!wide);
  const parent=document.getElementById('arcade-pause')?.parentElement;if(!parent)return;
  let toggle=document.getElementById('hud2178-settings');
  if(!toggle){toggle=document.createElement('button');toggle.id='hud2178-settings';toggle.dataset.action='hud2178-settings';toggle.textContent='⚙';toggle.setAttribute('aria-label','Настройки игры');toggle.setAttribute('title','Настройки игры');parent.appendChild(toggle);}
  toggle.hidden=!active;toggle.setAttribute('aria-expanded',String(active&&open));
 }
 const hud=updateArcadeHUD;updateArcadeHUD=function(){const r=hud.apply(this,arguments);sync();return r;};
 const action=arcadeAction;arcadeAction=function(name,...args){if(name==='hud2178-settings'){open=!open;sync();return true;}return action.call(this,name,...args);};
 function panel(c,x,y,w,h,fill){
  c.fillStyle='#020b13';c.fillRect(x+3,y+4,w,h);
  c.beginPath();c.moveTo(x+7,y);c.lineTo(x+w,y);c.lineTo(x+w-4,y+h);c.lineTo(x,y+h);c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle='#081820';c.lineWidth=3;c.stroke();
 }
 function draw(c,e,cam,w,h){
  if(!live(e))return;
  const cssW=ARCADE.canvas?.getBoundingClientRect?.().width||w,scale=w/cssW,W=cssW,H=h/scale;
  const mobile=typeof isMobileLayout==='function'&&isMobileLayout(),landscape=mobile&&W>H*1.25,width=Math.min(mobile?W-(landscape?120:16):410,landscape?500:W-16),left=8,y=mobile?8:Math.max(8,H-122),gap=8,sw=Math.round(width*.57),rw=width-sw-gap;
  const inside=typeof citadelInside==='function'&&citadelInside(e),hp=clamp(inside?e.board?.hp:e.player.hp,0,100),ammo=Math.max(0,Math.floor(e.player.missiles||0));
  c.save();c.scale(scale,scale);c.textAlign='left';c.textBaseline='middle';c.shadowBlur=0;
  if(mobile)c.clearRect(0,0,W,108);
  else if(inside&&!e.finale)c.clearRect(0,H*630/720,W*370/1280,H*80/720);
  panel(c,left,y,sw,52,hp<=25?'#ffd1ad':'#d5f3dd');panel(c,left+sw+gap,y,rw,52,'#ffdc88');
  c.fillStyle='#102b30';c.font='italic 400 '+(W<350?15:17)+'px "Citadel Display", sans-serif';c.fillText('ЩИТ',left+10,y+15);c.textAlign='right';c.fillText(Math.ceil(hp)+'%',left+sw-10,y+15);
  const barX=left+10,barY=y+29,barW=sw-20;
  c.fillStyle='#122831';c.fillRect(barX-2,barY-2,barW+4,16);
  for(let i=0;i<10;i++){const x=barX+i*barW/10,segment=barW/10-2;c.fillStyle='#395157';c.fillRect(x,barY,segment,12);const fraction=clamp((hp-i*10)/10);if(fraction){c.fillStyle=hp<=25?'#ed593b':hp<=50?'#eaa937':'#25b99d';c.fillRect(x,barY,segment*fraction,12);}}
  const rx=left+sw+gap;c.textAlign='left';c.fillStyle='#382b21';c.font='italic 400 '+(W<350?12:14)+'px "Citadel Display", sans-serif';c.fillText('РАКЕТЫ',rx+10,y+14);c.textAlign='right';c.font='400 21px "Citadel Display", sans-serif';c.fillText(String(ammo),rx+rw-10,y+15);
  const step=(rw-20)/12;c.fillStyle='#5f4934';for(let i=0;i<12;i++){const x=rx+10+i*step;c.fillStyle=i<ammo?'#c74a2f':'#b59b63';c.fillRect(x,y+31,Math.max(2,step-2),11);c.beginPath();c.moveTo(x,y+31);c.lineTo(x+(step-2)/2,y+27);c.lineTo(x+step-2,y+31);c.fill();}
  if(ammo===0){c.fillStyle='#752d24';c.font='bold 10px sans-serif';c.textAlign='center';c.fillText('НЕТ БОЕЗАПАСА',rx+rw/2,y+45);}
  if(!mobile){const source=inside?e.board:e.player;c.fillStyle='#101f29ed';c.fillRect(left,y+56,width,18);c.fillStyle='#d5f3dd';c.font='bold 11px sans-serif';c.textAlign='left';c.fillText('ЭНЕРГИЯ '+Math.ceil(source.energy||0)+'%  ·  ИМПУЛЬС '+(source.pulseCooldown>0?Math.ceil(source.pulseCooldown)+' с':'ГОТОВ'),left+8,y+65);}
  const p=progress(e),pw=mobile?Math.min(W-(landscape?208:16),500):width,py=mobile?66:y-46;
  panel(c,8,py,pw,38,'#d4e5ff');c.textAlign='left';c.fillStyle='#182936';c.font='italic 400 '+(W<350?11:13)+'px "Citadel Display", sans-serif';
  c.fillText('УРОВЕНЬ '+p.number+' · '+p.label,18,py+12,pw-66);c.textAlign='right';c.font='400 13px "Citadel Display", sans-serif';c.fillText(p.percent+'%',pw-2,py+12);
  c.fillStyle='#213441';c.fillRect(18,py+23,pw-20,8);c.fillStyle='#678ce9';c.fillRect(18,py+23,(pw-20)*p.fraction,8);
  c.strokeStyle='#d4e5ff';c.lineWidth=2;for(let i=1;i<12;i++){const x=18+(pw-20)*i/12;c.beginPath();c.moveTo(x,py+23);c.lineTo(x,py+31);c.stroke();}
  c.restore();
 }
 const mobile=drawMobileGameHUD;drawMobileGameHUD=function(){const r=mobile.apply(this,arguments);draw(...arguments);return r;};
 const clarity=drawClarityHUD;drawClarityHUD=function(){const r=clarity.apply(this,arguments);if(!isMobileLayout())draw(...arguments);return r;};
 const finale=drawFinaleHUD;drawFinaleHUD=function(){const r=finale.apply(this,arguments);draw(...arguments);return r;};
 globalThis.CITADEL_HUD2178=Object.freeze({version:'2.18.1',draw,sync,progress});
})();
