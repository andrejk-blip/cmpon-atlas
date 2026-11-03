/* Desktop controls and real deck rockets: swept contact, occluded blast. */
(()=>{
 'use strict';if(globalThis.CITADEL_CONTROLS)return;
 const oldInput2150=arcadeInput;arcadeInput=function(...args){const i=oldInput2150.apply(this,args);if(ARCADE.engine?.finale?.phase==='mrg'&&ARCADE.keys.has('TouchBoost')){i.jump=true;i.boost=ARCADE.keys.has('Space');}return i;};
 const p=RequirementArcade.prototype,old={board:p.stepBoard,landing:p.beginBoarding,hud:updateArcadeHUD,interior:citadelInterior};
 p.beginBoarding=function(...args){const r=old.landing.apply(this,args);if(this.board)this.player.missiles=Math.max(6,this.player.missiles||0);return r;};
 function rocket(e,aim){const b=e.board,pl=e.player;if(!b||e.status!=='boarding'||pl.missiles<1||b.rocketCooldown2150>0)return false;
  const target=b.enemies.filter(x=>!x.dead&&e.boardLOS(b.pos,x.pos)).sort((a,c)=>V3.len(V3.sub(a.pos,b.pos))-V3.len(V3.sub(c.pos,b.pos)))[0];
  const end=aim||target?.pos||V3.add(b.pos,[Math.sin(b.yaw)*20,0,Math.cos(b.yaw)*20]);
  const d=V3.norm([end[0]-b.pos[0],0,end[2]-b.pos[2]]);if(V3.len(d)<.5)return false;
  pl.missiles--;b.rocketCooldown2150=.8;b.rockets2150=b.rockets2150||[];
  b.rockets2150.push({pos:b.pos.slice(),vel:V3.scale(d,32),origin:b.pos.slice(),life:2,damage:110*(1+.3*(e.upgrades.rockets||0))});e.emit('missile');return true;
 }
 function blast(e,r,pos){const b=e.board;
  for(const x of b.enemies){const dist=V3.len(V3.sub(x.pos,pos));if(!x.dead&&dist<5.5&&e.boardLOS(pos,x.pos,.08))e.boardHit(x,r.damage*(1-dist/7),r.origin,true);}
  b.sparks.push({pos:pos.slice(),life:.55,max:.55,color:'#ffc97f',rocket2150:true});e.emit('explosion');
 }
 function stepRockets(e,dt){const b=e.board;
  for(const r of b.rockets2150||[]){const from=r.pos,to=V3.add(from,V3.scale(r.vel,dt));r.life-=dt;let nearest=2;
   for(const x of b.enemies)if(!x.dead){const t=flightSegment(from,to,x.pos,1.1);if(t!==null)nearest=Math.min(nearest,t);}
   const wall=!e.boardLOS(from,to,.12);if(wall){let lo=0,hi=1;for(let n=0;n<8;n++){const mid=(lo+hi)/2;if(e.boardLOS(from,V3.lerp(from,to,mid),.12))lo=mid;else hi=mid;}nearest=Math.min(nearest,lo);}
   if(nearest<=1){r.pos=V3.lerp(from,to,nearest);blast(e,r,r.pos);r.life=0;}else r.pos=to;
  }b.rockets2150=(b.rockets2150||[]).filter(x=>x.life>0).slice(-8);
 }
 p.stepBoard=function(dt,input={}){const b=this.board;if(!b||this.finale?.phase==='mrg')return old.board.apply(this,arguments);
  b.rocketCooldown2150=Math.max(0,(b.rocketCooldown2150||0)-dt);if(input.missile)rocket(this,input.aim);
  stepRockets(this,dt);return old.board.apply(this,arguments);
 };
 citadelInterior=function(e,...args){const a=old.interior.call(this,e,...args);for(const r of e.board?.rockets2150||[]){const pos=V3.add(r.pos,[0,1.8,0]),b=spaceBasisDir(r.vel),d=V3.norm(r.vel);
  for(const [mesh,back,size,col,em]of [['p260_horn_low',-.2,[.16,.16,.65],'#e4d7b6',.1],['p260_horn_low',1,[.13,.13,.85],'#ffc36d',1],['octa',.35,[.12,.12,.22],'#edffff',1]])a.push(citadelItem(mesh,V3.sub(pos,V3.scale(d,back)),size,col,em,b));
 }return a;};
 updateArcadeHUD=function(...args){const r=old.hud.apply(this,args),e=ARCADE.engine;if(e?.board&&e.status==='boarding')for(const b of document.querySelectorAll?.('[data-action="arcade-missile"]')||[]){b.hidden=false;b.disabled=e.player.missiles<1;b.textContent='РАКЕТА '+e.player.missiles;b.setAttribute('aria-label','Ракета · ПКМ / Q · осталось '+e.player.missiles);}
  return r;};
 globalThis.CITADEL_CONTROLS=Object.freeze({version:'2.15.0',rocket,stepRockets});
})();
