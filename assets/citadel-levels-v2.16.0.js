/* Authored floor plans and finite, physical rear/flank approaches.
 * Fresh landings opt in through their definition. Saved decks keep their map.
 * No new enemies, teleport spawns, health multipliers or hidden damage. */
(()=>{
 'use strict';if(globalThis.CITADEL_LEVELS2160)return;
 const base=CITADEL_BASES,p=RequirementArcade.prototype,oldEnemy=p.enemyBoardStep,oldStep=p.stepBoard;
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 function makeBase(stage){
  const foundry=stage===1,cells=new Map(),rects=[],doors=[],rooms=[];
  const world=([x,z])=>[x*4,0,z*4];
  function rect(x0,x1,z0,z1,zone){rects.push([x0,x1,z0,z1,zone]);for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)cells.set(stationCellKey(x,z),{x,z,zone});}
  function walk(points,zone,width=1){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];rect(Math.min(a[0],b[0])-width,Math.max(a[0],b[0])+width,Math.min(a[1],b[1])-width,Math.max(a[1],b[1])+width,zone);}}
  function gate(x,z,horizontal,after,label,extra={}){doors.push({x:x*4,z:z*4,w:horizontal?5.85:.35,h:horizontal?.35:5.85,open:0,latched:false,unlockAfter:after,label,...extra});}
  const centers=foundry?[[-14,0],[3,0],[3,-16]]:[[0,0],[-16,-8],[16,-8]];
  const names=foundry?['ПОПЕРЕЧНЫЙ СБОРОЧНЫЙ ЦЕХ','РЕАКТОРНЫЙ ОСТРОВ','ИСПЫТАТЕЛЬНЫЙ АНГАР']:['ЦЕНТРАЛЬНЫЙ ЗАЛ','ЗАПАДНОЕ КРЫЛО','ВОСТОЧНЫЙ МОСТИК'];
  centers.forEach(([cx,cz],i)=>{
   const rx=foundry?(i===1?5:7):(i===0?7:5),rz=foundry?(i===2?5:4):(i===0?5:4),zone=i+1;
   rect(cx-rx,cx+rx,cz-rz,cz+rz,zone);
   if(!foundry&&i===0)for(let x=cx-rx;x<=cx+rx;x++)for(let z=cz-rz;z<=cz+rz;z++)if(Math.abs(x-cx)+Math.abs(z-cz)>10)cells.delete(stationCellKey(x,z));
   // A room-sized rear barracks connected by a narrow, actual hatch.
   const bx=cx-(rx-1),bz=cz+rz+4;
   if(foundry&&i===1)for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)cells.delete(stationCellKey(x,z));
   walk([[bx,cz+rz],[bx,bz]],zone,0);rect(bx-1,bx+1,bz-1,bz+1,zone);
   gate(bx,cz+rz+.5,true,i,'ТЫЛОВОЙ ШЛЮЗ',{w:1.85,reserveRoom:i,rear2160:true});
   const terminal=world([cx+3,cz-3]);
   rooms.push({id:i,name:names[i],center:world([cx,cz]),terminal,
    posts:[[-3,2],[2,3],[-3,-3],[4,-1],[-4,-1],[1,-3]].map(([x,z])=>world([cx+x,cz+z])).concat([world([bx-.5,bz]),world([bx+.5,bz])]),
    patrol:[[-3,2],[-3,-2],[3,-2],[3,2]].map(([x,z])=>world([cx+x,cz+z])),
    reserve:world([bx,bz]),reserveDoor:world([bx,cz+rz+.5]),entryDirection:i===1&&foundry?[1,0,0]:[0,0,-1],core:{x:cx*4,z:cz*4,w:6,h:6}});
  });
  let spawn,exit;
  if(foundry){
   walk([[-14,9],[-14,4]],0);gate(-14,5.5,true,0,'ПОГРУЗОЧНЫЙ ДОК');spawn=world([-14,8]);
   walk([[-7,0],[-2,0]],2);gate(-4.5,0,false,1,'К РЕАКТОРУ');
   walk([[3,-4],[3,-11]],3);gate(3,-7.5,true,2,'К ИСПЫТАНИЯМ');
   walk([[3,-21],[3,-24]],3);exit=world([3,-23]);
   // A second lane along the assembly line makes the first room genuinely wide.
   walk([[-20,3],[-20,-3],[-8,-3]],1,0);
  }else{
   walk([[0,10],[0,5]],0);gate(0,6.5,true,0,'ЦЕНТРАЛЬНЫЙ ШЛЮЗ');spawn=world([0,9]);
   walk([[-7,-2],[-9,-2],[-9,-8]],2,0);walk([[-9,-8],[-11,-8]],2);gate(-10,-8,false,1,'ЗАПАДНОЕ КРЫЛО');
   walk([[7,-2],[9,-2],[9,-8]],3,0);walk([[9,-8],[11,-8]],3);gate(10,-8,false,2,'ВОСТОЧНОЕ КРЫЛО');
   walk([[-16,-12],[-16,-16],[16,-16],[16,-12]],3);gate(0,-16,false,2,'ОБЗОРНАЯ ГАЛЕРЕЯ');
   walk([[21,-8],[24,-8]],3);exit=world([23,-8]);
  }
  const d={...CITADEL_DECKS[stage],basesVersion:'2.0.0',variant2160:foundry?'cross-foundry':'three-wing-command',squadsVersion:'2.16.0',
   layoutId:'base2160-'+stage,name:foundry?'Завод: поперечный цех':'Мостик: три крыла',stage,rects,rooms,spawn,exit,
   centers:rooms.map(r=>r.center.slice()),terminals:rooms.map(r=>r.terminal.slice()),zones:['ВХОДНОЙ ШЛЮЗ',...names],covers:[],doors:doors.map(d=>[d.x,d.z,d.w,d.h]),addedLength:0};
  return{definition:d,cells,crates:[],props:[],doors,bounds:{minX:Math.min(...[...cells.values()].map(c=>c.x))*4-2,maxX:Math.max(...[...cells.values()].map(c=>c.x))*4+2,minZ:Math.min(...[...cells.values()].map(c=>c.z))*4-2,maxZ:Math.max(...[...cells.values()].map(c=>c.z))*4+2}};
 }
 const active=e=>!!e?.board?.squads2160&&!e.campaign2120?.station&&(!e.finale||e.finale.phase==='maze');
 function populate(e){const r=base.populate(e),b=e.board;if(b?.definition.squadsVersion!=='2.16.0'||b.squads2160)return r;
  b.squads2160={version:'2.16.0',warnings:[],events:[]};
  for(const room of b.definition.rooms){const crew=b.enemies.filter(x=>x.duty?.room===room.id);let reserve=0,flank=0;
   for(const x of crew){if(x.duty.reserve){x.rear2160={role:'reserve',slot:reserve++,phase:'waiting',home:x.pos.slice(),gate:room.reserveDoor.slice(),releasedAt:null};}
    else if(flank<1&&['scout','hunter','grounddog270','ninja'].includes(x.archetype)){x.rear2160={role:'flank',side:flank++%2?1:-1,phase:'waiting'};}}
  }return r;
 }
 globalThis.CITADEL_BASES=Object.freeze({...base,make(stage){const b=base.make(stage);if(b&&stage>0)b.definition.squadsVersion='2.16.0';return b;},populate});
 function log(b,row){b.squads2160.events.push({at:+b.time.toFixed(2),...row});if(b.squads2160.events.length>64)b.squads2160.events.shift();}
 function move(e,x,target,dt){const from=x.pos.slice();e.boardMoveToward(x,target,dt,x.speed*(e.assist?.72:.82));const d=dist(from,x.pos);x.duty.speed=d/Math.max(.001,dt);x.duty.gait=(x.duty.gait+d*2.35)%(Math.PI*2);if(d>.001)x.yaw=x.duty.bodyYaw=Math.atan2(x.pos[0]-from[0],x.pos[2]-from[2]);if(x.missions270){x.missions270.speed=x.duty.speed;x.missions270.gait=x.duty.gait;x.missions270.cooldown=Math.max(.9,x.missions270.cooldown||0);}x.shot=Math.max(1,x.shot||0);}
 p.enemyBoardStep=function(x,dt){if(!active(this)||!x.rear2160||x.dead)return oldEnemy.apply(this,arguments);
  const b=this.board,a=x.rear2160,room=b.definition.rooms[x.duty.room],alarm=b.baseOps.alarms[x.duty.room],unlocked=x.duty.room<=b.completed.length;
  if(a.role==='reserve'&&a.phase==='waiting'){
   if(x.hit>0&&unlocked&&alarm===null)CITADEL_BASES.alarm(this,x);
   if(!unlocked||alarm==null||b.time-alarm<(this.assist?4.2:3.4)+a.slot*1.5){x.duty.speed=0;x.signal='Резерв за шлюзом';return;}
   a.phase='hatch';a.releasedAt=b.time;x.duty.reserveReleased=true;x.alert=true;x.lastSeen=b.pos.slice();x.memory=8;b.baseOps.reserveDepartures++;
   log(b,{kind:'rear-departure',id:x.id,room:x.duty.room,from:x.pos.slice(),player:b.pos.slice(),gate:a.gate.slice()});
  }
  if(a.phase==='hatch'&&!(x.stun>0)){
   if(dist(x.pos,a.gate)>1&&b.time-a.releasedAt<9){x.signal='Выходит с тыла';move(this,x,a.gate,dt);return;}
   a.phase='engage';x.shot=Math.max(1.2,x.shot||0);if(x.missions270)x.missions270.cooldown=Math.max(1.2,x.missions270.cooldown||0);
  }
  if(a.role==='flank'&&unlocked&&alarm!=null&&b.time-alarm>2&&a.phase==='waiting'){
   const forward=room.entryDirection||[0,0,-1],side=[-forward[2]*a.side,0,forward[0]*a.side];
   const candidates=[V3.add(b.pos,V3.add(V3.scale(forward,-9),V3.scale(side,10))),V3.add(b.pos,V3.scale(side,14))];
   a.goal=candidates.find(q=>stationWalkable(b,q,.8)&&stationPath(b,x.pos,q).length);a.phase=a.goal?'routing':'engage';a.until=b.time+7;
   if(a.goal)log(b,{kind:'flank-route',id:x.id,from:x.pos.slice(),goal:a.goal.slice()});
  }
  if(a.phase==='routing'&&!(x.stun>0)&&!x.decksAttack&&!x.charge&&(!x.missions270||['hunt','recover'].includes(x.missions270.phase))){
   if(b.time<a.until&&dist(x.pos,a.goal)>1.8){x.alert=true;x.signal='Обходит через фланг';move(this,x,a.goal,dt);return;}a.phase='engage';
  }
  return oldEnemy.apply(this,arguments);
 };
 p.stepBoard=function(dt,input){const r=oldStep.apply(this,arguments);if(!active(this))return r;const b=this.board;
  for(let room=0;room<3;room++){if(b.baseOps.alarms[room]==null||b.squads2160.warnings.includes(room))continue;b.squads2160.warnings.push(room);
   const reserves=b.enemies.some(x=>!x.dead&&x.duty?.room===room&&x.rear2160?.role==='reserve'&&x.rear2160.phase==='waiting');
   if(reserves){b.squads2160.warningUntil=b.time+4.5;this.say('Резерв обходит с тыла. Янтарный шлюз — за спиной. Развернись или займи укрытие.','alert',true);this.emit('comic',{text:'РЕЗЕРВ С ТЫЛА · ШЛЮЗ ОТКРОЕТСЯ',kind:'warning',anchor:b.definition.rooms[room].reserveDoor.slice()});}
  }return r;
 };
 // A small true floor-plan overlay makes the new topology legible while moving.
 function map(c,e,w,h){if(!active(e)||!e.board.definition.variant2160)return;const b=e.board,small=w<650,size=small?64:106,x=w-size-12,y=small?64:76;
  const span=Math.max(b.bounds.maxX-b.bounds.minX,b.bounds.maxZ-b.bounds.minZ),scale=(size-12)/span;
  const xy=p=>[x+6+(p[0]-b.bounds.minX)*scale,y+18+(p[2]-b.bounds.minZ)*scale];
  c.save();if(!small){c.fillStyle='#071923e8';c.fillRect(x,y,size,size+20);c.strokeStyle='#758d8b';c.strokeRect(x,y,size,size+20);c.fillStyle='#d7c594';c.font='10px sans-serif';c.fillText('ПЛАН ПАЛУБЫ',x+6,y+12);}
  for(const cell of b.cells.values()){const [a,z]=xy([cell.x*4,0,cell.z*4]);c.fillStyle=cell.zone<=b.completed.length?'#4f9c8a':cell.zone===b.completed.length+1?'#987e57':'#344d5b';c.fillRect(a,z,Math.max(1,4*scale),Math.max(1,4*scale));}
  for(const d of b.doors.filter(d=>d.rear2160)){const [a,z]=xy([d.x,0,d.z]);c.fillStyle='#f4ad65';c.fillRect(a-1,z-1,3,3);}
  const [a,z]=xy(b.pos);c.fillStyle='#b9fff4';c.beginPath();c.arc(a,z,3,0,Math.PI*2);c.fill();c.restore();
 }
 for(const key of ['drawBoardHUD','drawMobileGameHUD']){const prior=key==='drawBoardHUD'?drawBoardHUD:drawMobileGameHUD;const fn=function(c,e,cam,w,h){const r=prior.apply(this,arguments);map(c,e,w,h);return r;};if(key==='drawBoardHUD')drawBoardHUD=fn;else drawMobileGameHUD=fn;}
 globalThis.CITADEL_LEVELS2160=Object.freeze({version:'2.16.0',makeBase,active,map});
})();
