/* Citadel 2.7.0: authored ground missions, pack hunters and siege machines.
 * Only fresh landings receive new floor plans. Existing boards retain their
 * geometry, roster, health and rules; no save schema or score formula changes.
 * All simulation state is serializable. Rendering is in the companion module.
 */
(() => {
  'use strict';
  const VERSION='2.7.0';
  if(globalThis.CITADEL_BASE_MISSIONS?.version===VERSION || !globalThis.CITADEL_BASE_REWARDS)return;
  const base=CITADEL_BASES,p=RequirementArcade.prototype;
  const old={nav:stationBuildNav,path:stationPath,los:p.boardLOS,enemy:p.enemyBoardStep,move:p.boardMoveToward,
    step:p.stepBoard,hit:p.boardHit,pulse:p.boardPulse,objective:p.objective,unpack:typeof cupUnpack==='function'?cupUnpack:null,segment:flightSegment,guide:stationGuideControl};
  const clone=x=>JSON.parse(JSON.stringify(x)),dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]),clamp=(x,a=0,z=1)=>Math.max(a,Math.min(z,x));
  const inside=e=>!!e?.board?.cells&&!e.crash&&(!e.finale||e.finale.phase==='maze');
  const modern=b=>b?.definition?.missions270Version===VERSION,active=e=>inside(e)&&modern(e.board);
  const modes=[
    {theme:'academy',name:'Архив: полевая подготовка',plans:['intro-ring','intro-ring','intro-ring'],detail:'Укрытия, импульс и три учебных терминала.'},
    {theme:'foundry',name:'Завод: аварийное охлаждение',plans:['assembly','reactor','arena'],detail:'Робопсы охраняют линии сборки. Найдите клапан охлаждения; последний цех держит осадный мех.'},
    {theme:'switchyard',name:'Интеграции: силовые контуры',plans:['split-grid','assembly','arena'],detail:'Выключайте силовые полосы на боковых пультах или обходите их. Робопсы заходят парами.'},
    {theme:'command',name:'Менеджмент: захваченный мостик',plans:['gallery','fracture','arena'],detail:'Два подхода к секторам и подъёмная платформа. Мех прикрывает командный терминал.'},
    {theme:'wreck',name:'Логово: аварийный маршрут',plans:['fracture','fracture','arena'],detail:'Пожар, настоящие проломы и грузовые платформы. Обходите опасные зоны или отключайте их на пультах.'}
  ];
  const units={
    grounddog270:{name:'Наземный робопёс',hp:94,speed:7.3,range:10,cool:2.6,damage:13,color:'#b5c8ac'},
    mech270:{name:'Осадный мех',hp:470,speed:2.15,range:27,cool:3.4,damage:24,color:'#d8b37d'}
  };
  Object.assign(CITADEL_DRONES,units);
  function compress(cells) {
    const rows=new Map();for(const c of cells.values()){const key=c.z+':'+c.zone;if(!rows.has(key))rows.set(key,[]);rows.get(key).push(c.x);}
    const rects=[];for(const [key,xs]of rows){const [z,zone]=key.split(':').map(Number);xs.sort((a,b)=>a-b);let from=xs[0],last=from;
      for(const x of xs.slice(1)){if(x!==last+1){rects.push([from,last,z,z,zone]);from=x;}last=x;}rects.push([from,last,z,z,zone]);}
    return rects;
  }
  function make(t) {
    const b=base.make(t);if(!b)return b;const d=b.definition,m=modes[t];
    Object.assign(d,{missions270Version:VERSION,layoutId:'base270-'+t,missionTheme:m.theme,missionName:m.name});
    const hazards=[],systems=[];d.rooms.forEach((r,i)=>r.plan=m.plans[i]);
    if(!t){d.mission270={schema:1,tier:t,theme:m.theme,hazards,systems};return b;}
    b.crates=[];b.props=[];
    function cover(r,x,z,w,h,kind='machinery') {
      const c={x:r.center[0]+x,z:r.center[2]+z,w,h,kind,room:r.id};
      if(dist([c.x,0,c.z],r.terminal)<Math.max(w,h)+3.2)return;
      b.crates.push(c);b.props.push(c);
    }
    function breach(r,x0,x1,z0,z1) {
      const removedCells=[],cx=r.center[0]/4,cz=r.center[2]/4;
      for(let x=cx+x0;x<=cx+x1;x++)for(let z=cz+z0;z<=cz+z1;z++)if(b.cells.delete(stationCellKey(x,z)))removedCells.push([x,z]);
      if(removedCells.length)hazards.push({id:'breach-'+r.id+'-'+hazards.length,type:'breach',room:r.id,pos:r.center.slice(),radius:0,active:true,removedCells});
    }
    function system(type,r,off,target) {
      const id=type+'-'+r.id,pos=V3.add(r.center,off);
      systems.push({id,type,pos,room:r.id,unlockAfter:r.id,state:'ready',progress:0,cooldown:0,
        ...(target?{target,halfExtents:[1.65,1.65]}:{})});return id;
    }
    for(const r of d.rooms) {
      const [wx,,wz]=r.center,cx=wx/4,cz=wz/4,zone=r.id+1;
      if(r.plan!=='reactor') {for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)b.cells.set(stationCellKey(x,z),{x,z,zone});r.core=null;}
      if(r.plan==='assembly') {
        cover(r,-8,0,1.25,6.2);cover(r,8,0,1.25,6.2);cover(r,-15,-11,1.6,1.5);cover(r,15,11,1.6,1.5);
      } else if(r.plan==='reactor') {
        for(const x of [-13,13])for(const z of [-10,10])cover(r,x,z,1.45,1.25);
      } else if(r.plan==='split-grid') {
        for(const x of [-5,5])cover(r,x,0,1.2,10);cover(r,-16,-11,1.5,1.1);cover(r,15,10,1.5,1.1);
      } else if(r.plan==='gallery') {
        for(const z of [-10,0,10])cover(r,z===0?6:-6,z,2.1,1.3,'console');cover(r,15,-8,1.5,3.3,'console');
      } else if(r.plan==='fracture') {
        breach(r,-2,2,-1,1);cover(r,-14,-9,1.25,1.7);cover(r,14,9,1.25,1.7);
        const a=V3.add(r.center,[0,0,8]),z=V3.add(r.center,[0,0,-8]);system('lift',r,[0,0,8],z);
        // The outer walkways remain connected; the lift is an optional shortcut.
        r.liftApproach=a.slice();
      } else {
        for(const x of [-9,9])for(const z of [-7,7])cover(r,x,z,1.35,2.4,'cabinet');
        if(t===4){breach(r,-5,-4,-4,-3);breach(r,4,5,3,4);}
      }
      if(t===1 || t===4) {
        const off=r.plan==='reactor'?[13,0,3]:r.plan==='fracture'?[-14,0,3]:[0,0,6];
        hazards.push({id:'fire-'+r.id,type:'fire',room:r.id,pos:V3.add(r.center,off),radius:t===4?2.6:2.2,active:true,phase:'burn',clock:0,damage:t===4?13:9,systemId:'coolant-0'});
        if(t===4&&r.id===2)hazards.push({id:'fire-core',type:'fire',room:2,pos:V3.add(r.center,[14,0,-2]),radius:2.4,active:true,phase:'burn',clock:0,damage:13,systemId:'coolant-0'});
      }
      if((t===2 || t===3)&&r.id<2) {
        const id=system('power',r,[-17,0,12]);
        hazards.push({id:'grid-'+r.id,type:'laser-grid',room:r.id,from:V3.add(r.center,[-19,0,3]),to:V3.add(r.center,[-9,0,3]),
          width:.6,active:true,phase:'beam',clock:0,damage:14+t,systemId:id});
      }
    }
    if(t===1 || t===4)system('coolant',d.rooms[0],[17,0,14]);
    d.covers=b.crates.map(c=>[c.x,c.z,c.w,c.h]);d.rects=compress(b.cells);
    d.mission270={schema:1,tier:t,theme:m.theme,hazards,systems};return b;
  }
  function state(b) {
    if(!modern(b))return null;if(b.missions270?.schema===1)return b.missions270;
    b.missions270={...clone(b.definition.mission270),clock:0,crewInitialized:false,transport:null,events:[],stats:{dogDashes:0,dogHits:0,beamCycles:0,beamHits:0,hazardHits:0,systemsUsed:0,liftTrips:0},room:-1};
    return b.missions270;
  }
  function log(b,event){const s=state(b);if(!s)return;s.events.push({at:+s.clock.toFixed(3),...event});if(s.events.length>48)s.events.shift();}
  function populate(e) {
    base.populate(e);if(!active(e))return;const b=e.board,s=state(b);if(s.crewInitialized)return;s.crewInitialized=true;
    if(!s.tier)return;
    for(const r of b.definition.rooms) {
      const crew=b.enemies.filter(x=>x.duty?.room===r.id),count=s.tier===1?(r.id===1?2:1):s.tier===2?2:r.id===1||s.tier===4&&r.id===0?3:2;
      const candidates=crew.slice().sort((a,z)=>rank(a)-rank(z));
      function rank(x){return ['rocketeer','ninja','robodog','hunter','scout','relay','sniper','shield'].indexOf(x.archetype);}
      for(const x of candidates.slice(0,count))convert(e,x,'dog');
      if(r.id===2){const x=crew.find(x=>!x.missions270&&x.archetype!=='shield')||crew.find(x=>!x.missions270);if(x)convert(e,x,'mech');}
    }
    log(b,{kind:'mission-crew',dogs:b.enemies.filter(x=>x.missions270?.kind==='dog').length,mechs:b.enemies.filter(x=>x.missions270?.kind==='mech').length});
  }
  function convert(e,x,kind) {
    const t=state(e.board).tier,archetype=kind==='dog'?'grounddog270':'mech270',info=units[archetype];
    const health=Math.round((kind==='dog'?86+t*12:410+t*85)*(e.assist?.73:1));
    Object.assign(x,info,{archetype,hp:health,maxHp:health,charge:0,aim:null,decksAttack:null,shot:0,alert:false,
      missions270:{kind,phase:'hunt',phaseClock:0,clock:0,heading:[0,0,-1],gait:0,scale:kind==='mech'?1.9:.75,
        cooldown:0,hit:false,beams:[],speed:0,stuck:0,packSide:x.id%2?1:-1}});
    if(kind==='mech') {
      const center=e.board.definition.rooms[x.duty.room].center,candidate=V3.add(center,[0,0,-8]);
      if(stationWalkable(e.board,candidate,1.35,true))x.pos=candidate;
      x.duty.reserve=false;x.duty.mode='guard';
    }
  }
  globalThis.CITADEL_BASES=Object.freeze({...base,make,populate});

  function segmentDistance(p,a,z) {const dx=z[0]-a[0],dz=z[2]-a[2],n=dx*dx+dz*dz,t=n?clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/n):0;return Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t);}
  function hazardCost(s,a,z) {
    let cost=0;for(const h of s.hazards){if(!h.active||h.type==='breach')continue;
      if(h.type==='fire'&&segmentDistance(h.pos,a,z)<h.radius+1)cost+=22;
      else if(h.type==='laser-grid'&&[a,z,V3.lerp(a,z,.5)].some(p=>segmentDistance(p,h.from,h.to)<h.width+1))cost+=28;
    }return cost;
  }
  stationBuildNav=function(b) {
    old.nav(b);if(!modern(b))return;const s=state(b);
    for(const node of b.nav.values())for(const link of node.links)link.cost+=hazardCost(s,node.pos,b.nav.get(link.key).pos);
    for(const lift of s.systems.filter(x=>x.type==='lift'&&x.unlockAfter<=(b.completed?.length||0))) {
      const a=stationNearestNode(b,lift.pos),z=stationNearestNode(b,lift.target);if(!a||!z)continue;
      const cost=dist(a.pos,z.pos)/2+1;a.links.push({key:z.key,cost,missionLift:lift.id});z.links.push({key:a.key,cost,missionLift:lift.id});
    }
    s.room=b.completed?.length||0;
  };
  let enemyRouting=false;
  // A* uses the real floor for ordinary movement and explicit lift links for
  // the player. Ground enemies always route along walkable outer bridges.
  stationPath=function(b,from,goal) {
    if(!modern(b))return old.path.apply(this,arguments);
    const s=state(b),a=stationNearestNode(b,from),z=stationNearestNode(b,goal);if(!a||!z)return [];
    if(stationLine(b,from,goal,.68,true)&&!hazardCost(s,from,goal))return [goal.slice()];
    const queue=[],closed=new Set(),came=new Map(),g=new Map([[a.key,0]]);
    function push(v){queue.push(v);let i=queue.length-1;while(i){const j=(i-1)>>1;if(queue[j].f<=v.f)break;queue[i]=queue[j];i=j;}queue[i]=v;}
    function pop(){const first=queue[0],last=queue.pop();if(queue.length){let i=0;while(i*2+1<queue.length){let j=i*2+1;if(j+1<queue.length&&queue[j+1].f<queue[j].f)j++;if(queue[j].f>=last.f)break;queue[i]=queue[j];i=j;}queue[i]=last;}return first;}
    push({key:a.key,f:0});let found=false;
    while(queue.length){const {key}=pop();if(closed.has(key))continue;if(key===z.key){found=true;break;}closed.add(key);
      const n=b.nav.get(key);for(const link of n.links){
        const lift=link.missionLift&&s.systems.find(x=>x.id===link.missionLift);
        // The arriving passenger must leave the landing before boarding again.
        // A path to loot on the other side must therefore use the outer bridge
        // while the lift is latched/cooling, not walk into an impassable shaft.
        if(closed.has(link.key)||link.missionLift&&(enemyRouting||lift?.arrivalLatch||lift?.cooldown||s.transport))continue;const next=g.get(key)+link.cost;
        if(next<(g.get(link.key)??Infinity)){came.set(link.key,key);g.set(link.key,next);const v=b.nav.get(link.key);push({key:link.key,f:next+dist(v.pos,z.pos)/2});}}
    }
    if(!found)return [];const points=[z.pos];let key=z.key;while(came.has(key)){key=came.get(key);points.push(b.nav.get(key).pos);}points.reverse();
    while(points.length&&dist(points[0],from)<.05)points.shift();if(stationLine(b,z.pos,goal,.65,true))points.push(goal.slice());return points;
  };
  p.boardMoveToward=function(){const prior=enemyRouting;enemyRouting=true;try{return old.move.apply(this,arguments);}finally{enemyRouting=prior;}};
  stationGuideControl=function(e,dt,speed) {
    if(!active(e))return old.guide.apply(this,arguments);
    const b=e.board,s=state(b),key=b.completed.length,target=key<3?b.terminals[key]:b.exit;
    let w=b.guideWatch;if(!w||w.key!==key)w=b.guideWatch={key,pos:b.pos.slice(),stalled:0,repath:0};
    const traveled=dist(w.pos,b.pos);w.pos=b.pos.slice();w.stalled=traveled<.002?w.stalled+dt:0;w.repath=Math.max(0,w.repath-dt);
    if(w.stalled>1){b.guideRoute=null;w.stalled=0;w.repath=0;}
    if((!b.guideRoute?.length||b.guideGoal!==key)&&w.repath<=0){b.guideRoute=stationPath(b,b.pos,target);b.guideGoal=key;w.repath=.35;}
    const route=b.guideRoute||[];while(route.length&&(dist(route[0],b.pos)<.08||dist(route[0],b.pos)<.55&&route.length>1&&stationLine(b,b.pos,route[1],.68,true)&&!hazardCost(s,b.pos,route[1])))route.shift();
    if(!route.length)return [0,0];const delta=V3.sub(route[0],b.pos),scale=1/Math.max(dist(route[0],b.pos),dt*speed,.001);return[delta[0]*scale,delta[2]*scale];
  };
  const holes=new WeakMap();
  function floorOrAir(b,pos) {
    if(stationFloor(b,pos))return true;let set=holes.get(b);if(!set){set=new Set(state(b).hazards.filter(x=>x.type==='breach').flatMap(x=>x.removedCells.map(p=>stationCellKey(...p))));holes.set(b,set);}
    return set.has(stationCellKey(Math.floor((pos[0]+2)/4),Math.floor((pos[2]+2)/4)));
  }
  p.boardLOS=function(a,z,pad=.12) {
    if(!active(this))return old.los.apply(this,arguments);const b=this.board,n=Math.max(1,Math.ceil(dist(a,z)/.45));
    for(let i=0;i<=n;i++){const q=V3.lerp(a,z,i/n);if(!floorOrAir(b,q))return false;
      for(const c of b.crates)if(Math.abs(q[0]-c.x)<c.w+pad&&Math.abs(q[2]-c.z)<c.h+pad)return false;
      for(const c of b.doors)if(c.open<.82&&Math.abs(q[0]-c.x)<c.w+pad&&Math.abs(q[2]-c.z)<c.h+pad)return false;
    }return true;
  };
  // The larger chassis has a correspondingly larger projectile hit volume.
  // Weak keys refer to current position vectors, never retain retired actors.
  const hitVolumes=new WeakMap();
  flightSegment=function(a,z,point,r){return old.segment(a,z,point,hitVolumes.get(point)||r);};
  function damage(e,amount,kind,from) {
    const b=e.board,s=state(b);if(e.status!=='boarding'||b.invulnerable>0||b.hp<=0||s.transport)return false;
    if(from&&!e.boardLOS(from,b.pos,.04))return false;
    const ranged=kind==='beam'||kind==='grid',kit=ranged?1-(e.upgrades.baseKit260?.armor||0)*.06:1;
    const n=amount*(e.assist?.52:1)*Math.pow(.8,e.upgrades.armor||0)*kit*(globalThis.CITADEL_SKILLS?.protection(e)||1);
    b.hp=Math.max(0,b.hp-n);b.invulnerable=.68;e.flash=.2;e.emit('damage');
    log(b,{kind:'hit',source:kind,damage:+n.toFixed(3)});
    if(b.hp<=0){e.status='lost';e.lossReason='Щит исчерпан. Используйте внешние проходы, пульты и укрытия; после рывка или лазера машины делают паузу.';e.emit('state','lost');}return true;
  }
  function move(e,x,goal,dt,speed,radius=.8) {
    const before=x.pos.slice();
    if(e.boardLOS(x.pos,goal,radius)&&stationLine(e.board,x.pos,goal,radius))e.boardMove(x,V3.scale(V3.norm(V3.sub(goal,x.pos)),Math.min(dist(goal,x.pos),dt*speed)),radius);
    else e.boardMoveToward(x,goal,dt,speed);
    const m=x.missions270,traveled=dist(before,x.pos);m.speed=dt?traveled/dt:0;m.gait=(m.gait+traveled*3)%(Math.PI*2);
    m.stuck=traveled<.003?m.stuck+dt:0;if(m.stuck>.5){x.route=[];x.repath=0;m.stuck=0;}
    if(traveled>.001)x.yaw=Math.atan2(x.pos[0]-before[0],x.pos[2]-before[2]);return traveled;
  }
  function dog(e,x,dt) {
    const b=e.board,s=state(b),m=x.missions270,t=s.tier,d=dist(x.pos,b.pos);m.cooldown=Math.max(0,m.cooldown-dt);
    if(m.phase==='recover'){m.speed=0;if(m.phaseClock>=(e.assist?1.45:1.05)){m.phase='hunt';m.phaseClock=0;}return;}
    if(m.phase==='charge') {m.speed=0;x.yaw=Math.atan2(m.heading[0],m.heading[2]);if(m.phaseClock>=(e.assist?.72:.38)){m.phase='dash';m.phaseClock=0;m.hit=false;s.stats.dogDashes++;e.emit('enemy-fire');}return;}
    if(m.phase==='dash') {
      const before=x.pos.slice(),speed=e.assist?13:16+t*.45;e.boardMove(x,V3.scale(m.heading,speed*dt),.8);m.speed=dist(before,x.pos)/Math.max(dt,.001);m.gait=(m.gait+m.speed*dt*3)%(Math.PI*2);
      if(!m.hit&&segmentDistance([0,0,0],V3.sub(before,b.previous||b.pos),V3.sub(x.pos,b.pos))<1.08&&damage(e,10+t*2,'dog',x.pos)){m.hit=true;s.stats.dogHits++;}
      if(m.phaseClock>.48||dist(before,x.pos)<.002){m.phase='recover';m.phaseClock=0;m.cooldown=e.assist?1.8:.9;}return;
    }
    const sees=d<26&&e.boardLOS(x.pos,b.pos,.15);
    if(sees&&d<10.5&&m.cooldown<=0) {
      const aim=V3.add(b.pos,V3.scale(b.velocity||[0,0,0],.16));m.heading=V3.norm(V3.sub(aim,x.pos));m.phase='charge';m.phaseClock=0;m.speed=0;
      if(e.assist)e.emit('comic',{text:'РОБОПЁС — ШАГ В СТОРОНУ',kind:'warning',anchor:x.pos.slice()});return;
    }
    let target=b.pos.slice();if(sees&&d>11){const dir=V3.norm(V3.sub(b.pos,x.pos));const flank=V3.add(b.pos,[-dir[2]*m.packSide*4,0,dir[0]*m.packSide*4]);if(stationWalkable(b,flank,.8,true))target=flank;}
    move(e,x,target,dt,(6.6+t*.4)*(e.assist?.76:1));
  }
  function ray(e,origin,direction,length) {
    let to=origin.slice();for(let n=.4;n<=length;n+=.4){const q=V3.add(origin,V3.scale(direction,n));if(!e.boardLOS(to,q,.12))break;to=q;}to[1]=1.7;return to;
  }
  function mech(e,x,dt) {
    const b=e.board,s=state(b),m=x.missions270,t=s.tier,d=dist(x.pos,b.pos),sees=d<28&&e.boardLOS(x.pos,b.pos,.2);
    hitVolumes.set(x.pos,1.45);m.beams=[];
    if(m.phase==='recover'){
      m.speed=0;if(m.phaseClock<(e.assist?2.5:2.05-t*.12))return;
      const dir=V3.norm(V3.sub(b.pos,x.pos)),side=[-dir[2],0,dir[0]];
      const options=[1,-1].map(sign=>V3.add(x.pos,V3.scale(side,sign*m.packSide*(6+t*.4))))
        .filter(q=>stationWalkable(b,q,1.35)&&stationLine(b,x.pos,q,1.35));
      m.phase=options.length?'reposition':'hunt';m.phaseClock=0;m.repositionGoal=options[0]||null;return;
    }
    if(m.phase==='reposition') {
      if(m.repositionGoal)move(e,x,m.repositionGoal,dt,(7+t*.5)*(e.assist?.72:1),1.35);
      if(!m.repositionGoal||dist(x.pos,m.repositionGoal)<.4||m.phaseClock>(e.assist?1:.75)){m.phase='hunt';m.phaseClock=0;m.repositionGoal=null;m.packSide*=-1;}return;
    }
    if(m.phase==='charge') {
      m.speed=0;if(m.phaseClock>=(e.assist?1.25:.25)){m.phase='beam';m.phaseClock=0;s.stats.beamCycles++;e.emit('enemy-fire');}return;
    }
    if(m.phase==='beam') {
      const duration=e.assist?2.3:2.05-t*.1,progress=clamp(m.phaseClock/duration),angle=m.aimAngle-.42+progress*.84;
      const direction=[Math.sin(angle),0,Math.cos(angle)],side=[direction[2],0,-direction[0]];x.yaw=angle;m.heading=direction;m.speed=0;
      for(const sign of [-1,1]) {
        const origin=V3.add(x.pos,V3.add([0,3.1,0],V3.scale(side,sign*.8))),to=ray(e,origin,direction,27),width=.42+t*.025;
        const beam={origin,to,width,active:true};m.beams.push(beam);
        if(segmentDistance(b.pos,origin,to)<width+.66&&damage(e,18+t*3,'beam',origin))s.stats.beamHits++;
      }
      if(m.phaseClock>=duration){m.phase='recover';m.phaseClock=0;m.beams=[];}return;
    }
    if(sees&&d>5&&m.phaseClock>.8){m.aimAngle=Math.atan2(b.pos[0]-x.pos[0],b.pos[2]-x.pos[2]);m.heading=[Math.sin(m.aimAngle),0,Math.cos(m.aimAngle)];m.phase='charge';m.phaseClock=0;
      if(e.assist)e.emit('comic',{text:'МЕХ — УКРОЙТЕСЬ ОТ ЛАЗЕРА',kind:'warning',anchor:x.pos.slice()});return;}
    const center=b.definition.rooms[x.duty.room].center,dir=V3.norm(V3.sub(b.pos,x.pos));let goal=V3.sub(b.pos,V3.scale(dir,12));
    goal=[clamp(goal[0],center[0]-16,center[0]+16),0,clamp(goal[2],center[2]-12,center[2]+12)];
    if(stationWalkable(b,goal,1.35)&&stationLine(b,x.pos,goal,1.35))move(e,x,goal,dt,(5.5+t*.4)*(e.assist?.72:1),1.35);
    else {m.speed=0;if(sees){m.aimAngle=Math.atan2(b.pos[0]-x.pos[0],b.pos[2]-x.pos[2]);if(m.phaseClock>1.2){m.phase='charge';m.phaseClock=0;}}
      else {
        const candidates=[[0,-8],[0,8],[-14,0],[14,0],[-14,-11],[14,11]].map(q=>V3.add(center,[q[0],0,q[1]]))
          .filter(q=>stationWalkable(b,q,1.35)&&stationLine(b,x.pos,q,1.35));
        candidates.sort((a,z)=>(e.boardLOS(a,b.pos,.2)?0:35)+dist(a,b.pos)-(e.boardLOS(z,b.pos,.2)?0:35)-dist(z,b.pos));
        if(candidates.length&&dist(candidates[0],x.pos)>.3)move(e,x,candidates[0],dt,(5.5+t*.4)*(e.assist?.72:1),1.35);
      }}
    hitVolumes.set(x.pos,1.45);
  }
  p.enemyBoardStep=function(x,dt) {
    if(!active(this)||!x.missions270)return old.enemy.apply(this,arguments);
    if(x.dead)return;const b=this.board,s=state(b),m=x.missions270;
    x.hit=Math.max(0,x.hit-dt);x.stun=Math.max(0,x.stun-dt);m.clock+=dt;m.phaseClock+=dt;
    if(x.stun>0){m.phase='recover';m.phaseClock=0;m.beams=[];m.speed=0;return;}
    if(x.duty.room>b.completed.length)return;
    const sees=dist(x.pos,b.pos)<28&&this.boardLOS(x.pos,b.pos,.12),alarm=b.baseOps?.alarms[x.duty.room];
    if(sees||alarm!==null&&alarm!==undefined||b.firing&&dist(x.pos,b.pos)<25)x.alert=true;
    if(!x.alert)return;
    if(sees&&alarm===null){b.baseOps.alarms[x.duty.room]=b.time;log(b,{kind:'alarm',room:x.duty.room});}
    x.duty.reserveReleased=true;x.duty.detection=1;
    if(m.kind==='dog')dog(this,x,dt);else mech(this,x,dt);
    x.duty.gait=m.gait;x.duty.speed=m.speed;x.duty.bodyYaw=x.yaw;
  };
  p.boardHit=function(x,amount,source,ignoreShield=false) {
    if(active(this)&&x.missions270?.kind==='mech'&&!ignoreShield) {
      const m=x.missions270,toward=V3.norm(V3.sub(source,x.pos)),front=[Math.sin(x.yaw),0,Math.cos(x.yaw)];
      if(m.phase!=='recover'&&!x.stun&&V3.dot(toward,front)>.3)amount*=.5;
    }
    const result=old.hit.call(this,x,amount,source,ignoreShield);if(x.dead&&x.missions270)x.missions270.beams=[];return result;
  };
  p.boardPulse=function(){const result=old.pulse.apply(this,arguments);if(result&&active(this))for(const x of this.board.enemies)if(x.missions270&&x.stun>0){x.missions270.beams=[];x.missions270.phase='recover';x.missions270.phaseClock=0;}return result;};
  function systems(e,dt) {
    const b=e.board,s=state(b);for(const x of s.systems) {
      x.cooldown=Math.max(0,x.cooldown-dt);if(x.unlockAfter>b.completed.length)continue;
      if(x.type==='lift') {
        if(x.arrivalLatch){if(dist(b.pos,x.pos)>2.5&&dist(b.pos,x.target)>2.5)x.arrivalLatch=false;else continue;}
        if(x.cooldown||s.transport)continue;
        const end=dist(b.pos,x.pos)<1.75?0:dist(b.pos,x.target)<1.75?1:-1;if(end<0){x.progress=0;continue;}
        const from=end?x.target:x.pos,to=end?x.pos:x.target;
        // A lateral crossing of the landing is an ordinary walkway. Board by
        // stepping towards the shaft, or by briefly stopping on the platform.
        // Otherwise a route to a side room can be carried away on every pass.
        const velocity=b.velocity||V3.scale(V3.sub(b.pos,b.previous||b.pos),1/Math.max(dt,.001)),speed=V3.len(velocity);
        const boarding=speed>.25&&V3.dot(V3.scale(velocity,1/speed),V3.norm(V3.sub(to,from)))>.45;
        x.progress=speed<=.25?x.progress+dt:0;if(!boarding&&x.progress<.3)continue;x.progress=0;
        s.transport={id:x.id,from:from.slice(),to:to.slice(),progress:0,duration:2.8,pos:from.slice(),rider:true};x.cooldown=6;
        s.stats.liftTrips++;b.guideRoute=null;e.emit('gate');log(b,{kind:'lift-start',id:x.id});continue;
      }
      if(x.state==='used')continue;
      if(dist(b.pos,x.pos)<2.15&&e.boardLOS(b.pos,x.pos,.1)&&V3.len(b.velocity||[0,0,0])<2.4)x.progress+=dt;else x.progress=0;
      if(x.progress<.9)continue;x.state='used';x.progress=1;s.stats.systemsUsed++;
      for(const h of s.hazards)if(h.systemId===x.id){h.active=false;h.phase='off';}
      stationBuildNav(b);b.guideRoute=null;log(b,{kind:'system',id:x.id});e.emit('terminal');
      e.notify(x.type==='coolant'?'ОХЛАЖДЕНИЕ ВОССТАНОВЛЕНО':'СИЛОВОЙ КОНТУР ОТКЛЮЧЁН',x.type==='coolant'?'Пожарные линии погашены. Открыт короткий путь.':'Лазерная полоса безопасна. Можно сменить фланг.');
    }
  }
  function tickTransport(e,dt) {
    const b=e.board,s=state(b),t=s.transport;if(!t)return;
    t.progress=clamp(t.progress+dt/t.duration);t.pos=V3.lerp(t.from,t.to,t.progress);t.pos[1]=Math.sin(Math.PI*t.progress)*4;
    b.pos=t.pos.slice();b.previous=b.pos.slice();b.velocity=[0,0,0];b.invulnerable=Math.max(b.invulnerable,.2);b.baseMotion&&(b.baseMotion.speed=0);
    if(t.progress>=1){b.pos=t.to.slice();s.transport=null;b.guideRoute=null;const lift=s.systems.find(x=>x.id===t.id);if(lift){lift.cooldown=2.5;lift.arrivalLatch=true;lift.dockPos=t.to.slice();}log(b,{kind:'lift-arrive',id:t.id});}
  }
  function tickHazards(e,dt) {
    const b=e.board,s=state(b);if(s.transport)return;
    for(const h of s.hazards){h.clock=(h.clock||0)+dt;if(!h.active||h.room>b.completed.length)continue;
      if(h.type==='fire'&&dist(b.pos,h.pos)<h.radius+.42&&damage(e,h.damage,'fire',h.pos))s.stats.hazardHits++;
      if(h.type==='laser-grid'&&segmentDistance(b.pos,h.from,h.to)<h.width+.6&&damage(e,h.damage,'grid'))s.stats.hazardHits++;
    }
  }
  p.stepBoard=function(dt,input) {
    if(!active(this)||this.status!=='boarding')return old.step.apply(this,arguments);
    const b=this.board,s=state(b);if(s.room!==b.completed.length){stationBuildNav(b);b.guideRoute=null;}
    const riding=!!s.transport,guide=b.guide;if(riding){b.invulnerable=Math.max(b.invulnerable,.2);b.guide=false;}
    let result;try{result=old.step.call(this,dt,riding?{}:input);}finally{b.guide=guide;}
    if(this.board!==b||!active(this)||this.status!=='boarding')return result;
    s.clock+=dt;if(riding)tickTransport(this,dt);else {systems(this,dt);tickHazards(this,dt);}return result;
  };
  if(old.unpack)cupUnpack=function(){const e=old.unpack.apply(this,arguments);if(active(e)){state(e.board);stationBuildNav(e.board);}return e;};
  p.objective=function(){const result=old.objective.apply(this,arguments);if(!active(this)||!['boarding','paused'].includes(this.status))return result;
    const s=state(this.board),used=s.systems.filter(x=>x.type!=='lift'&&x.state==='used').length,total=s.systems.filter(x=>x.type!=='lift').length;
    return {...result,detail:this.board.armory260?.notice?.until>this.board.time?result.detail:modes[s.tier].detail+(total?' Пульт включается короткой остановкой рядом.':''),
      progress:result.progress+(total?' · СИСТЕМЫ '+used+'/'+total:'')+(s.transport?' · ПЛАТФОРМА В ДВИЖЕНИИ':'')};};
  globalThis.CITADEL_BASE_MISSIONS=Object.freeze({version:VERSION,active,modes,
    inspection(e){const b=e?.board,s=b?.missions270;return {active:active(e),version:VERSION,legacy:inside(e)&&!modern(b),layout:b?.definition?.layoutId,
      tier:s?.tier??null,theme:s?.theme??null,stats:s?{...s.stats}:null,hazards:clone(s?.hazards||[]),systems:clone(s?.systems||[]),transport:s?.transport?clone(s.transport):null,
      enemies:(b?.enemies||[]).filter(x=>x.missions270).map(x=>({id:x.id,kind:x.missions270.kind,room:x.duty.room,hp:x.hp,pos:x.pos.slice(),...clone(x.missions270)})),events:clone(s?.events||[])};}});
})();
