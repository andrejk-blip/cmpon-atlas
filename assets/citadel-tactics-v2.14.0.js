/* Finite, deterministic squad tactics. Later decks add decisions, not HP.
 * Every destination is checked against the authored walkable navigation map. */
(()=>{
 'use strict';if(globalThis.CITADEL_TACTICS)return;
 const p=RequirementArcade.prototype,old=p.enemyBoardStep;
 const active=e=>e?.campaign2120&&e.board?.cells&&!e.campaign2120.station&&(!e.finale||e.finale.phase==='maze');
 const tier=e=>e.finale?.phase==='maze'?4:e.stage,dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 const names=['Держит пост','Обходит с фланга','Перекрёстный огонь','Прикрытие связного','Смена боевых ролей'];
 function decide(e,x){const b=e.board,t=tier(e),a=x.tactics2140||(x.tactics2140={next:0,goal:null,role:'guard',volley:0});
  if(b.time<a.next)return a;a.next=b.time+1.1+(x.id%3)*.25;a.goal=null;a.role='guard';
  if(t<1||!x.alert||x.duty?.room>b.completed.length||!e.boardLOS(x.pos,b.pos,.15))return a;
  const sign=x.id%2?1:-1,dir=V3.norm(V3.sub(x.pos,b.pos)),side=[dir[2]*sign,0,-dir[0]*sign];
  let candidates=[];
  if(t>=3&&x.archetype==='shield'){
   const relay=b.enemies.find(y=>!y.dead&&y.archetype==='relay'&&y.duty?.room===x.duty?.room&&dist(y.pos,x.pos)<18);
   if(relay){const toward=V3.norm(V3.sub(b.pos,relay.pos));candidates=[V3.add(relay.pos,V3.scale(toward,4))];a.role='screen';}
  }
  if(t>=3&&x.archetype==='relay'){
   const shield=b.enemies.find(y=>!y.dead&&y.archetype==='shield'&&y.duty?.room===x.duty?.room&&dist(y.pos,x.pos)<18);
   if(shield){candidates=[V3.add(shield.pos,V3.scale(V3.norm(V3.sub(shield.pos,b.pos)),4))];a.role='support';}
  }
  if(t>=4&&x.hp<x.maxHp*.4){candidates=[V3.add(x.pos,V3.scale(dir,5)),V3.add(x.pos,V3.scale(side,5))];a.role='retreat';}
  else if(!candidates.length&&['scout','hunter','sniper','rocketeer'].includes(x.archetype)){
   candidates=[V3.add(x.pos,V3.scale(side,t>=2?5:3.5)),V3.add(x.pos,V3.scale(side,-3))];a.role=t>=2?'crossfire':'flank';
  }
  a.goal=candidates.find(q=>stationWalkable(b,q,.8,true)&&stationLine(b,x.pos,q,.8,true))||null;
  a.label=names[t];return a;
 }
 p.enemyBoardStep=function(x,dt){if(!active(this)||x.dead)return old.apply(this,arguments);
  const b=this.board,t=tier(this),before=b.hostile.length,from=x.pos.slice(),a=decide(this,x);
  const custom=t>0&&a.goal&&!x.missions270&&!x.decksAttack&&!x.charge&&!(x.stun>0)&&x.alert;
  // Alternating fire teams leave a readable gap. A sniper already winding up
  // completes its shot; the next team waits instead of overlapping all guns.
  if(t>=2&&!x.charge&&!x.missions270&&x.alert&&Math.floor(b.time/(t>=4?1.6:2.2))%2!==x.id%2)x.shot=Math.max(x.shot||0,dt*5+.12);
  const r=old.apply(this,arguments);
  if(custom&&!x.dead&&!x.charge&&!(x.stun>0)&&this.status==='boarding'){
   // Replace that tick's ordinary displacement, never add extra speed.
   x.pos=from;this.boardMoveToward(x,a.goal,dt,x.speed*(this.assist?.7:.85));
   x.signal=a.role==='retreat'?'Отходит к укрытию':a.role==='screen'?'Прикрывает связного':a.role==='support'?'Держится за щитом':names[t];
   if(x.duty){x.duty.bodyYaw=x.yaw;x.duty.speed=dist(from,x.pos)/Math.max(dt,.001);}
  }
  for(const shot of b.hostile.slice(before)){shot.art2140=x.archetype;shot.owner=x.id;}
  return r;
 };
 globalThis.CITADEL_TACTICS=Object.freeze({version:'2.14.0',tier,decide,names,active});
})();
