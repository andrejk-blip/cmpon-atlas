/* Citadel 2.0.0: authored interiors and persistent security crews.
 * No timers, event listeners, emitter wrappers or independent animation loop.
 * A saved 1.x deck keeps its geometry and encounter rules. Only fresh landings
 * use these layouts. All runtime state is plain data inside board/enemies.
 */
(() => {
  'use strict';
  if (globalThis.CITADEL_BASES?.version === '2.0.0') return;
  const VERSION = '2.0.0', TAU = Math.PI * 2;
  const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const modern = b => b?.definition?.basesVersion === VERSION;
  const alive = b => b.enemies.filter(x => !x.dead && x.hp > 0);
  const templates = [
    { centers: [[0,-4],[4,-19],[-1,-34]], names: ['АРХИВ ПОТРЕБНОСТЕЙ','СЦЕНАРНЫЙ ОТДЕЛ','РЕЕСТР РЕШЕНИЙ'], annex: 'АРХИВНЫЙ ПОСТ' },
    { centers: [[0,-4],[-5,-21],[3,-38]], names: ['СБОРОЧНЫЙ ЦЕХ','РЕАКТОРНЫЙ БЛОК','ИСПЫТАТЕЛЬНЫЙ КОНТУР'], annex: 'КОМНАТА СМЕНЫ' },
    { centers: [[0,-4],[6,-22],[-3,-40]], names: ['КОНТРОЛЬ ДОСТУПА','СЕТЕВОЙ УЗЕЛ','ШЛЮЗ ИНТЕГРАЦИЙ'], annex: 'ПОСТ ОХРАНЫ' },
    { centers: [[0,-4],[-6,-22],[-6,-40]], names: ['ЗАЛ ПРИОРИТЕТОВ','ОБСЕРВАТОРИЯ','КОМАНДНЫЙ ЦЕНТР'], annex: 'РЕЗЕРВ МОСТИКА' },
    { centers: [[0,-4],[5,-24],[-4,-44]], names: ['ДОКАЗАТЕЛЬСТВА','ИСПЫТАНИЯ','СОГЛАСОВАНИЕ'], annex: 'ОХРАНА ЯДРА' },
  ];
  function make(stage) {
    const t = templates[stage]; if (!t) return null;
    const old = CITADEL_DECKS[stage], cells = new Map(), crates = [], props = [], doors = [], rooms = [], rects = [];
    function rect(x0,x1,z0,z1,zone) {
      rects.push([x0,x1,z0,z1,zone]);
      for (let x=x0;x<=x1;x++) for (let z=z0;z<=z1;z++) cells.set(stationCellKey(x,z),{x,z,zone});
    }
    function corridor(points, zone, width=0) {
      for (let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i];
        rect(Math.min(a[0],b[0])-width,Math.max(a[0],b[0])+width,
          Math.min(a[1],b[1])-width,Math.max(a[1],b[1])+width,zone);
      }
    }
    const gate = (x,z,horizontal,after,label) => doors.push({x:x*4,z:z*4,w:horizontal?5.75:.35,h:horizontal?.35:5.75,
      open:0,latched:false,unlockAfter:after,label});
    rect(-3,3,5,9,0); corridor([[0,5],[0,0]],0,1);
    gate(0,2,true,0,'ПРИЁМНЫЙ ШЛЮЗ');
    t.centers.forEach(([cx,cz],room) => {
      const zone=room+1;
      // A real ring around a solid core. The two sides remain independent
      // routes; the guards cannot see or fire through the central installation.
      rect(cx-5,cx+5,cz-4,cz+4,zone);
      for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)cells.delete(stationCellKey(x,z));
      // Barracks are part of the walkable plan. Reserves exist here from the
      // beginning, behind the same sliding door through which they will walk.
      rect(cx+6,cx+6,cz,cz,zone); rect(cx+7,cx+9,cz-1,cz+1,zone);
      doors.push({x:(cx+5.5)*4,z:cz*4,w:.35,h:1.85,open:0,latched:false,unlockAfter:room,
        reserveRoom:room,label:t.annex});
      const terminal=[(cx+3)*4,0,(cz-3)*4];
      const points=[[-3,2],[-3,-2],[3,-2],[3,2]].map(([x,z])=>[(cx+x)*4,0,(cz+z)*4]);
      const posts=[[-4,2],[2,3],[-3,-3],[4,-1],[-4,-1],[1,-3],[8,-.5],[8,.5]]
        .map(([x,z])=>[(cx+x)*4,0,(cz+z)*4]);
      const covers=[[-4,-3,1.1,1.6],[4,3,1.8,1.1],[-2,3,.65,1.5],[2,-1,.6,1.3]];
      for(const [x,z,w,h]of covers) {
        const p={x:(cx+x)*4,z:(cz+z)*4,w,h,kind:stage===1?'machinery':stage===3?'console':'cabinet',room};
        crates.push(p);props.push(p);
      }
      // A side office introduces an extra corner on advanced bases.
      if(stage>1) {rect(cx-8,cx-6,cz+1,cz+3,zone); rect(cx-6,cx-5,cz+2,cz+2,zone);}
      rooms.push({id:room,name:t.names[room],center:[cx*4,0,cz*4],terminal,posts,patrol:points,
        reserveDoor:[(cx+5.5)*4,0,cz*4],reserve:[(cx+8)*4,0,cz*4],core:{x:cx*4,z:cz*4,w:6,h:6}});
      if(room) {
        const [px,pz]=t.centers[room-1], middle=Math.round((pz+cz)/2);
        corridor([[px-3,pz-4],[px-3,middle],[cx+3,middle],[cx+3,cz+4]],zone,1);
        gate(cx+3,cz+5.5,true,room,'СЕКТОР '+(room+1));
        if(stage>0) {
          // Narrow maintenance bypass with its own physical access gate.
          const side=Math.min(px,cx)-7-(stage===4?2:0);
          corridor([[px-4,pz-3],[side,pz-3],[side,cz+3],[cx-4,cz+3]],zone,0);
          doors.push({x:side*4,z:(cz+5.5)*4,w:1.85,h:.35,open:0,latched:false,
            unlockAfter:room,label:'СЕРВИСНЫЙ ПРОХОД'});
        }
      }
    });
    const last=t.centers[2],exit=[last[0]*4,0,(last[1]-6)*4];
    corridor([[last[0],last[1]-4],[last[0],last[1]-7]],3,1);
    const definition={...old,basesVersion:VERSION,layoutId:'base-'+stage,stage,rects,rooms,
      spawn:[0,0,30],centers:rooms.map(r=>r.center.slice()),terminals:rooms.map(r=>r.terminal.slice()),exit,
      zones:['ПРИЁМНЫЙ ДОК',...t.names],covers:crates.map(c=>[c.x,c.z,c.w,c.h]),
      doors:doors.map(d=>[d.x,d.z,d.w,d.h]),addedLength:0};
    return {definition,cells,crates,props,doors,bounds:{
      minX:Math.min(...[...cells.values()].map(c=>c.x))*4-2,maxX:Math.max(...[...cells.values()].map(c=>c.x))*4+2,
      minZ:Math.min(...[...cells.values()].map(c=>c.z))*4-2,maxZ:Math.max(...[...cells.values()].map(c=>c.z))*4+2}};
  }
  function profile(e,room) {
    const t=e.finale?.phase==='maze'?4:e.stage, calm=!!e.assist;
    const count=(t===0?5:Math.min(8,6+Math.floor(t/2)+(room===2?1:0)))-(calm&&t>0?1:0);
    return {tier:t,level:t===4?13:t*3+2,room,tutorial:t===0,initial:count,cap:8,waves:[],
      hp:(1.30+t*.13+room*.055)*(calm?.82:1),damage:1+t*.09,warning:calm?2.8:2.2};
  }
  function state(e) {
    const b=e.board;
    if(!b.baseOps)b.baseOps={version:VERSION,initialized:false,alarms:[null,null,null],events:[],
      reserveDepartures:0,shots:0,patrolDistance:0,stuckRepaths:0};
    return b.baseOps;
  }
  function log(e,event) {
    const s=state(e);s.events.push({time:+e.board.time.toFixed(3),...event});if(s.events.length>64)s.events.shift();
  }
  function populate(e) {
    const b=e.board,s=state(e); if(s.initialized)return;
    // A single finite roster, not three surprise spawns after educational cards.
    s.initialized=true;
    for(const r of b.definition.rooms) {
      const p=profile(e,r.id),kinds=r.id===0&&p.tier===0?['scout','scout','shield','sniper','hunter']:
        ['scout','shield','sniper','hunter','relay','rocketeer','scout','ninja'];
      for(let i=0;i<p.initial;i++) {
        const reserve=i>=p.initial-2&&p.tier>0,post=reserve?r.posts[6+i-(p.initial-2)]:r.posts[i];
        const node=stationNearestNode(b,post);if(!node)throw Error('Base roster post is unreachable');
        const kind=kinds[i],info=CITADEL_DRONES[kind],maxHp=Math.round(info.hp*p.hp);
        const x={...info,archetype:kind,id:++e.entityId,pos:node.pos.slice(),hp:maxHp,maxHp,
          shot:1.3+(i%3)*.24,hit:0,phase:i,dead:false,zone:r.id,decksRoom:r.id,
          alert:false,lastSeen:null,memory:0,route:[],repath:0,stun:0,charge:0,aim:null,yaw:Math.PI,heal:0,
          signal:reserve?'Резерв':'Патруль',strafe:i%2?1:-1,decksCombat:true,decksDamage:p.damage,
          decksArrival:0,decksAttack:null,decksCalling:null,
          duty:{room:r.id,post:node.pos.slice(),patrol:r.patrol.map(p=>p.slice()),index:i%4,
            mode:reserve?'reserve':i%3===2?'guard':'patrol',reserve,reserveReleased:false,
            detection:0,wait:0,bodyYaw:Math.PI,gait:0,speed:0,cover:null,coverClock:0,
            stuck:0,travel:0,lastPos:node.pos.slice(),appearance:(i+r.id*3+p.tier)%6}};
        b.enemies.push(x);log(e,{kind:'crew-posted',id:x.id,room:r.id,role:kind,reserve,pos:x.pos.slice()});
      }
    }
  }
  function alarm(e,x) {
    const b=e.board,s=state(e),room=x.duty.room;
    if(s.alarms[room]!==null)return;
    s.alarms[room]=b.time;log(e,{kind:'alarm',room,caller:x.id});
    const hasReserve=alive(b).some(y=>y.duty?.room===room&&y.duty.reserve);
    if(hasReserve){e.emit('comic',{text:'ТРЕВОГА · РЕЗЕРВ ВЫХОДИТ ИЗ ШЛЮЗА',kind:'warning',anchor:b.definition.rooms[room].reserveDoor.slice()});
      e.say('Охрана заметила тебя. Резерв выходит из отмеченного помещения. Используй обход и укрытия.','alert',true);}
  }
  function turn(from,to,rate) {return from+clamp(Math.atan2(Math.sin(to-from),Math.cos(to-from)),-rate,rate);}
  function animate(x,old,dt) {
    const d=distance(x.pos,old),a=x.duty;
    a.speed=dt?d/dt:0;a.gait=(a.gait+d*2.35)%TAU;a.travel+=d;
    if(d>.0001)a.moveYaw=Math.atan2(x.pos[0]-old[0],x.pos[2]-old[2]);
    const facing=x.alert?x.yaw:a.moveYaw??x.yaw;
    a.bodyYaw=turn(a.bodyYaw,facing,dt*7);
  }
  function move(e,x,goal,dt,speed) {
    const b=e.board,old=x.pos.slice();
    // Reuse the tested corner-aware A* graph. Separation is a small physical
    // displacement, never a teleport, and every component checks collisions.
    e.boardMoveToward(x,goal,dt,speed);
    for(const y of b.enemies)if(y!==x&&!y.dead&&y.duty?.room===x.duty.room) {
      const dx=x.pos[0]-y.pos[0],dz=x.pos[2]-y.pos[2],d=Math.hypot(dx,dz);
      if(d<1.45&&d>.001)e.boardMove(x,[dx/d*(1.45-d)*dt*2.5,0,dz/d*(1.45-d)*dt*2.5],.68);
    }
    const moved=distance(old,x.pos);x.duty.stuck=moved<.003?x.duty.stuck+dt:0;
    if(x.duty.stuck>1.2){x.route=[];x.repath=0;x.duty.stuck=0;state(e).stuckRepaths++;}
    return moved;
  }
  function enemy(e,x,dt,specialStep) {
    const b=e.board,a=x.duty;if(!a||x.dead)return;
    const old=x.pos.slice(),r=b.definition.rooms[a.room],s=state(e);
    x.hit=Math.max(0,x.hit-dt);x.stun=Math.max(0,x.stun-dt);x.heal=0;
    if(x.stun>0){x.decksAttack=null;x.signal='Оглушён';a.speed=0;return;}
    // Future sectors remain on duty behind their locked bulkheads.
    const unlocked=a.room<=b.completed.length;
    const d=distance(x.pos,b.pos),line=unlocked&&d<29&&e.boardLOS(x.pos,b.pos,.12);
    const toward=Math.atan2(b.pos[0]-x.pos[0],b.pos[2]-x.pos[2]);
    const front=Math.cos(toward-a.bodyYaw)>.05;
    const sees=line&&(x.alert||front||d<5);
    const heard=unlocked&&b.firing&&d<20;
    if(sees){a.detection=Math.min(1,a.detection+dt/(e.assist?.65:.4));x.lastSeen=b.pos.slice();x.memory=7;}
    else a.detection=Math.max(0,a.detection-dt*.6);
    if(heard){x.lastSeen=b.pos.slice();x.memory=5;if(!x.alert)a.mode='investigate';}
    if(unlocked&&(a.detection>=1||x.hit>0||x.alert&&!s.alarms[a.room]))alarm(e,x);
    const elapsed=s.alarms[a.room]===null?-1:b.time-s.alarms[a.room];
    if(a.reserve&&!a.reserveReleased) {
      if(elapsed<(e.assist?3.2:2.6)){x.signal=elapsed<0?'Резерв':'Получает приказ';a.speed=0;return;}
      a.reserveReleased=true;a.mode='engage';x.alert=true;x.lastSeen=b.pos.slice();x.memory=8;
      s.reserveDepartures++;log(e,{kind:'reserve-departed',id:x.id,room:a.room,pos:x.pos.slice(),door:r.reserveDoor.slice()});
      e.emit('gate');
    }
    if(unlocked&&(a.detection>=1||elapsed>1.1))x.alert=true;
    if(!x.alert) {
      x.signal=a.mode==='investigate'?'Проверяет шум':a.mode==='guard'?'На посту':'Патруль';
      a.wait=Math.max(0,a.wait-dt);
      if(a.mode==='investigate'&&x.lastSeen){
        move(e,x,x.lastSeen,dt,x.speed*.6);x.memory-=dt;
        if(x.memory<=0||distance(x.pos,x.lastSeen)<1){a.mode='patrol';x.lastSeen=null;}
      } else if(a.mode==='guard')a.bodyYaw=turn(a.bodyYaw,Math.PI+Math.sin(b.time*.35+x.id)*.8,dt*.65);
      else if(!a.wait){
        const goal=a.patrol[a.index];
        if(distance(x.pos,goal)<.8){a.index=(a.index+1)%a.patrol.length;a.wait=.6+(x.id%3)*.4;}
        else state(e).patrolDistance+=move(e,x,goal,dt,x.speed*.42);
      }
      animate(x,old,dt);return;
    }
    x.memory=Math.max(0,x.memory-dt);x.yaw=toward;
    if(x.decksAttack){specialStep(e,x,dt);animate(x,old,dt);return;}
    if(!line){
      x.signal='Ищет проход';
      // Alarm conveys the last radio contact; no wall vision. Search the last
      // known location, then resume a local sweep so every guard stays reachable.
      if(elapsed>0&&!x.lastSeen)x.lastSeen=r.patrol[0].slice();
      const goal=x.lastSeen&&distance(x.pos,x.lastSeen)>1?x.lastSeen:a.patrol[a.index];
      if(distance(x.pos,goal)<1)a.index=(a.index+1)%a.patrol.length;
      move(e,x,goal,dt,x.speed*.7);animate(x,old,dt);return;
    }
    x.lastSeen=b.pos.slice();
    if(['rocketeer','ninja','robodog'].includes(x.archetype)) {
      specialStep(e,x,dt);animate(x,old,dt);return;
    }
    x.shot=Math.max(0,x.shot-dt);a.coverClock-=dt;
    const ideal=x.archetype==='shield'?8:x.archetype==='hunter'?6:16;
    let goal=b.pos.slice(),moving=d>ideal+2;
    if(x.archetype==='relay') {
      const ally=alive(b).filter(y=>y!==x&&y.duty?.room===a.room&&y.hp<y.maxHp&&distance(x.pos,y.pos)<12&&e.boardLOS(x.pos,y.pos))[0];
      if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+dt*5);x.heal=ally.id;}
    }
    if(x.archetype==='scout'||x.archetype==='sniper'||x.archetype==='relay') {
      // Select a reachable cover shoulder once, and hold it rather than
      // orbiting the player as a tightly packed group every frame.
      if(a.coverClock<=0){
        a.coverClock=2+(x.id%3)*.35;a.cover=null;let best=Infinity;
        for(const c of b.crates.filter(c=>c.room===a.room))for(const sign of [-1,1]) {
          const p=[c.x+sign*(c.w+1.5),0,c.z+(b.pos[2]<c.z?-1:1)*(c.h+1.1)];
          const score=Math.abs(distance(p,b.pos)-ideal)*1.5+distance(p,x.pos)*.4;
          if(score<best&&stationWalkable(b,p,.7)&&e.boardLOS(p,b.pos,.12)) {best=score;a.cover=p;}
        }
      }
      if(a.cover){goal=a.cover;moving=distance(goal,x.pos)>.65;}
      else if(d<9){const dir=V3.norm(V3.sub(x.pos,b.pos)),p=V3.add(x.pos,V3.scale(dir,4));if(stationWalkable(b,p,.7)){goal=p;moving=true;}}
      x.signal=moving?'К укрытию':'Держит сектор';
    } else x.signal=x.archetype==='shield'?'Прикрывает отряд':'Обходит фланг';
    if(moving&&!x.charge)move(e,x,goal,dt,x.speed*(e.assist?.78:.9));
    const sniper=x.archetype==='sniper';
    if(sniper&&x.charge>0){
      x.charge-=dt;x.signal='Прицельный выстрел';
      if(x.charge<=0&&x.aim){shoot(e,x,x.aim,30);x.aim=null;x.shot=x.cool;}
    } else if(d<26&&x.shot<=0){
      if(sniper){x.charge=e.assist?1.6:1.2;x.aim=b.pos.slice();}
      else {shoot(e,x,V3.add(b.pos,V3.scale(b.velocity||[0,0,0],Math.min(.45,d/40))),17);x.shot=x.cool*(e.assist?1.6:1.2);}
    }
    animate(x,old,dt);
  }
  function shoot(e,x,target,speed) {
    const direction=V3.norm(V3.sub(target,x.pos));
    e.board.hostile.push({pos:x.pos.slice(),vel:V3.scale(direction,speed),life:2.2,
      damage:x.damage*x.decksDamage*(e.assist?.6:1),color:x.color,r:.18,owner:x.id,decksScaled:true});
    x.duty.recoil=.16;state(e).shots++;e.emit('enemy-fire');
  }
  function before(e,dt,input) {
    const b=e.board;state(e);
    for(const d of b.doors)if(d.unlockAfter>b.completed.length){d.open=0;d.latched=false;}
    if(b.guide)return input;
    const a=b.baseMotion||(b.baseMotion={x:0,z:0,gait:0,bodyYaw:b.yaw,speed:0});
    let x=Number(input.moveX)||0,z=Number(input.moveZ)||0,n=Math.max(1,Math.hypot(x,z));x/=n;z/=n;
    const moving=Math.hypot(x,z)>.01,rate=moving?14:22;
    const blend=1-Math.exp(-rate*dt);a.x+=(x-a.x)*blend;a.z+=(z-a.z)*blend;
    if(!moving&&Math.hypot(a.x,a.z)<.015)a.x=a.z=0;
    return {...input,moveX:a.x,moveZ:a.z};
  }
  function after(e,dt) {
    const b=e.board;
    for(const d of b.doors)if(d.unlockAfter>b.completed.length){d.open=0;d.latched=false;}
    const a=b.baseMotion||(b.baseMotion={x:0,z:0,gait:0,bodyYaw:b.yaw,speed:0});
    const traveled=distance(b.pos,b.previous);a.gait=(a.gait+traveled*2.35)%TAU;a.speed=dt?traveled/dt:0;
    if(traveled>.0001)a.moveYaw=Math.atan2(b.pos[0]-b.previous[0],b.pos[2]-b.previous[2]);
    a.bodyYaw=turn(a.bodyYaw,b.yaw,dt*8);
    for(const x of b.enemies)if(x.duty)x.duty.recoil=Math.max(0,(x.duty.recoil||0)-dt);
  }
  globalThis.CITADEL_BASES=Object.freeze({version:VERSION,modern,make,profile,populate,state,enemy,before,after,alarm,templates});
})();
