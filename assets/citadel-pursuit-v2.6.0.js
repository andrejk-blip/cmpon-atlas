/* Citadel 2.6.0 — front-facing squadrons, circular gates and physical Warp entities.
 * One ordinary steering/fire loop. All motion, encounters and packet state
 * are serializable; no timers, listeners, emitter interception or render writes.
 */
(function () {
  'use strict';
  const VERSION = '2.6.0', RULES_REVISION = 280;
  const WARP_KINDS = Object.freeze(['hammer','tentacle','maw','mantis','medusa']);
  const WARP_NAMES = Object.freeze({hammer:'Кузнец разлома',tentacle:'Спрут пустоты',maw:'Пожиратель сигнала',mantis:'Косарь',medusa:'Медуза помех'});
  if (globalThis.CITADEL_PURSUIT || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype;
  const before = {
    beginStage: proto.beginStage, launch: proto.launch, step: proto.step,
    collect: proto.collect, checkStage: proto.checkStage, openNextLesson: proto.openNextLesson, continueLesson: proto.continueLesson,
    navTarget: proto.navTarget, guidance: proto.guidance, selectTarget: proto.selectTarget,
    objective: proto.objective, hit: proto.hit, target: proto.target, scene: spaceScene, camera: spaceCamera,
    flightHUD: drawFlightHUD, campaignHUD: drawCampaignFlightHUD,
    clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD,
    updateHUD: updateArcadeHUD, overlay: arcadeOverlayHTML,
  };
  const RULES = Object.freeze({ seconds: 142, calmSeconds: 114, speed: 82, calmSpeed: 74,
    horizontalSpeed: 46, verticalSpeed: 34, halfWidth: 82, halfHeight: 52,
    minRange: 46, maxRange: 137, safeSeconds: 10, lookAhead: 900,
    maxRocks: 28, maxBullets: 64, maxHostile: 64, maxEnemies: 12, maxGates: 5, maxWarp: 2, acquisition: .55 });
  const STAGES = Object.freeze([
    Object.freeze({ name: 'Захват сигнала', packet: 'Исходные требования', seconds: 38, calm: 30, speed: 82, surge: 17, period: 20, radius: 18, gates: 2, gap: 650, halfX: 16, halfY: 16, wave: 20 }),
    Object.freeze({ name: 'Канал под огнём', packet: 'Уточнения', seconds: 46, calm: 38, speed: 103, surge: 26, period: 16, radius: 16, gates: 3, gap: 570, halfX: 14, halfY: 14, wave: 17 }),
    Object.freeze({ name: 'Последняя редакция', packet: 'Подтверждённая версия', seconds: 58, calm: 46, speed: 124, surge: 35, period: 13, radius: 14, gates: 4, gap: 490, halfX: 12, halfY: 12, wave: 14 }),
  ]);
  const stageOf = e => STAGES[e.pursuit.chapter];
  const packetSeconds = (e, i) => e.assist ? STAGES[i].calm : STAGES[i].seconds;
  const linkRadius = e => stageOf(e).radius + (e.assist ? 4 : 0);
  const granting = new WeakSet();
  const loaded = e => !!e && e.stage === 1 && !e.finale && e.pursuit?.version === VERSION;
  const active = e => loaded(e) && e.phase === 'pursuit' && !e.crash;
  const distance = (a, b) => V3.len(V3.sub(a, b));
  const count = e => e.plan[1].filter(id => e.rescued.includes(id)).length;
  const casesDone = e => [2, 3].every(n => e.decisions.some(d => d.stage === 1 && d.caseIndex === n));
  const comic = (e, text, kind, pos) => e.emit('comic', { text, kind, anchor: pos.slice() });
  const smooth = n => { const t = arcadeClamp(n, 0, 1); return t * t * (3 - 2 * t); };
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

  // Spatial course: obstacle generation never changes when the packet stage changes.
  function route(e, travel) {
    const s = e.pursuit, d = Math.max(0, travel), t = d / 90, ease = smooth(d / 450), ph = s.routePhase;
    return [s.origin[0] + ease * (31 * Math.sin(t * .19 + ph) + 12 * Math.sin(t * .43 + ph * .7)),
      s.origin[1] + ease * (17 * Math.sin(t * .17 + ph * .6) + 6 * Math.sin(t * .37 + ph)), s.origin[2] - d];
  }
  function gateOpening(e, g) {
    if (g.kind === 'circle') {
      const phase=e.pursuit.clock*.66+g.index, moving=g.chapter===2;
      return {x:g.pos[0]+(moving?Math.sin(phase)*2.2:0),y:g.pos[1]+(moving?Math.cos(phase*.8)*1.5:0),
        hx:g.gapRadius,hy:g.gapRadius,radius:g.gapRadius,shape:'circle'};
    }
    // Existing 2.1 saves keep the shape already in front of the player.
    const moving = g.kind === 'shutter', phase = e.pursuit.clock * .8 + g.index;
    return { x: g.pos[0] + (moving ? Math.sin(phase) * 5 : 0),
      y: g.pos[1] + (moving ? Math.cos(phase * .8) * 3 : 0), hx: g.hx, hy: g.hy, shape:'legacy' };
  }
  function gateParts(e, g) {
    if(g.kind==='circle')return []; // The ring uses analytical, circular collision below.
    const o = gateOpening(e, g), s = e.pursuit, left = s.origin[0] - 94, right = s.origin[0] + 94,
      bottom = s.origin[1] - 65, top = s.origin[1] + 65;
    if (g.kind === 'ring') return [
      {pos:[o.x-o.hx-2,o.y,g.pos[2]],size:[2,o.hy+4,2.4]},
      {pos:[o.x+o.hx+2,o.y,g.pos[2]],size:[2,o.hy+4,2.4]},
      {pos:[o.x,o.y-o.hy-2,g.pos[2]],size:[o.hx,2,2.4]},
      {pos:[o.x,o.y+o.hy+2,g.pos[2]],size:[o.hx,2,2.4]}];
    return [
      {pos:[(left+o.x-o.hx)/2,(top+bottom)/2,g.pos[2]],size:[(o.x-o.hx-left)/2,(top-bottom)/2,2.8]},
      {pos:[(right+o.x+o.hx)/2,(top+bottom)/2,g.pos[2]],size:[(right-o.x-o.hx)/2,(top-bottom)/2,2.8]},
      {pos:[o.x,(bottom+o.y-o.hy)/2,g.pos[2]],size:[o.hx,(o.y-o.hy-bottom)/2,2.8]},
      {pos:[o.x,(top+o.y+o.hy)/2,g.pos[2]],size:[o.hx,(top-o.y-o.hy)/2,2.8]}];
  }
  function boxSegment(a, b, box, radius = 0) {
    let enter=0,leave=1;
    for(let i=0;i<3;i++){
      const d=b[i]-a[i],min=box.pos[i]-box.size[i]-radius,max=box.pos[i]+box.size[i]+radius;
      if(Math.abs(d)<1e-8){if(a[i]<min||a[i]>max)return null;continue;}
      let lo=(min-a[i])/d,hi=(max-a[i])/d;if(lo>hi)[lo,hi]=[hi,lo];
      enter=Math.max(enter,lo);leave=Math.min(leave,hi);if(enter>leave)return null;
    }
    return enter;
  }
  // Swept sphere against a finite annular cylinder. Diagonal corners are solid;
  // the aperture is genuinely circular, rather than an invisible square hole.
  function ringSegment(e,g,a,b,radius=0) {
    const o=gateOpening(e,g),inner=Math.max(0,o.radius-radius),outer=o.radius+g.ringThickness+radius;
    const z=g.pos[2],depth=2.4+radius,dz=b[2]-a[2];let lo=0,hi=1;
    if(Math.abs(dz)<1e-8){if(Math.abs(a[2]-z)>depth)return null;}
    else {let x=(z-depth-a[2])/dz,y=(z+depth-a[2])/dz;if(x>y)[x,y]=[y,x];lo=Math.max(0,x);hi=Math.min(1,y);if(lo>hi)return null;}
    const x=a[0]-o.x,y=a[1]-o.y,dx=b[0]-a[0],dy=b[1]-a[1],A=dx*dx+dy*dy,B=2*(x*dx+y*dy),cuts=[lo,hi];
    if(A>1e-10)for(const R of [inner,outer]){const C=x*x+y*y-R*R,D=B*B-4*A*C;if(D>=0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>lo&&t<hi)cuts.push(t);}
    cuts.sort((a,b)=>a-b);const solid=t=>{const r=Math.hypot(x+dx*t,y+dy*t);return r>=inner-1e-8&&r<=outer+1e-8;};
    if(solid(lo))return lo;
    for(let i=1;i<cuts.length;i++)if(solid((cuts[i-1]+cuts[i])/2))return cuts[i-1];
    return solid(hi)?hi:null;
  }
  function gateHit(e, from, to, radius=0) {
    let first=null;
    for(const g of e.pursuit.gates){
      if(g.kind==='circle'){const t=ringSegment(e,g,from,to,radius);if(t!==null&&(!first||t<first.t))first={t,gate:g};}
      else for(const box of gateParts(e,g)){const t=boxSegment(from,to,box,radius);if(t!==null&&(!first||t<first.t))first={t,gate:g};}
    }
    return first;
  }
  function warpParts(e,w){return w.segments||[];}
  function warpHit(e,from,to,radius=0,moving=false){
    let first=null;
    for(const w of e.pursuit.warpEntities||[])for(const part of warpParts(e,w)){
      // Sweep in each moving joint's frame. A fast tentacle crossing the ship
      // between two simulation ticks now hits exactly like the visible pose.
      const start=moving&&part.previous?V3.add(from,V3.sub(part.pos,part.previous)):from;
      const t=flightSegment(start,to,part.pos,part.r+radius);
      if(t!==null&&(!first||t<first.t))first={t,entity:w,part};
    }
    return first;
  }
  function poseWarp(e,w,dt){
    const previous=new Map((w.segments||[]).map((x,i)=>[x.key||String(i),x.pos]));
    const c=w.center,side=w.side||1,phase=w.phase;
    if(w.schema!==280){
      // Keep an already encountered 2.6 apparition at its original size.
      const head=[c[0]+side*(25+5*Math.sin(phase)),c[1]+Math.cos(phase*.83)*13,c[2]+Math.sin(phase)*8];
      w.head=head;w.segments=[{pos:w.pos.slice(),r:w.bodyRadius,part:'body'}];
      const n=w.kind==='hammer'?2:6;
      for(let i=1;i<=n;i++){const t=i/(w.kind==='hammer'?3:n),pos=V3.lerp(w.pos,head,t);pos[1]+=Math.sin(phase+t*4)*4*Math.sin(t*Math.PI);w.segments.push({pos,r:w.kind==='hammer'?3.5:3.8,part:w.kind==='hammer'?'arm':'tentacle'});}
      if(w.kind==='hammer')w.segments.push({pos:head.slice(),r:7,part:'hammer'});
    }else{
      w.segments=[];
      const add=(key,pos,r,part,chain=0)=>w.segments.push({key,pos,r,part,chain,previous:dt>0?(previous.get(key)||pos).slice():pos.slice()});
      const scale=w.scale||3.4, body=(key,off,r)=>add(key,V3.add(w.pos,V3.scale(off,scale)),r*scale,'body');
      // Piecewise anatomical volumes, not one giant invisible sphere around
      // the whole silhouette. Open space between horns/limbs remains flyable.
      body('torso',[0,0,0],4.5);body('chest',[0,3,1],4.4);body('pelvis',[0,-4,1],2.8);
      if(w.kind==='medusa'){
        body('bell',[0,5,0],4.8);body('eye',[0,1.8,5],3.7);
        for(const side of [-1,1])body('bell'+side,[side*6,5,0],3.6);
      }else if(w.kind==='mantis'){
        body('head',[0,6.5,3.7],3.2);
        for(const side of [-1,1])body('shoulder'+side,[side*5.5,3,0],3.1);
      }else if(w.kind==='maw'){
        body('skull',[0,6,2],3.8);
        for(const side of [-1,1]){body('rib'+side,[side*4,0,2],2.5);body('cheek'+side,[side*3.8,4,3],2.5);}
      }else{
        body('head',[0,5.6,3.2],2.7);
        for(const side of [-1,1])body('shoulder'+side,[side*4.8,3,1],2.8);
      }
      // Large bodies remain at the corridor edge; only articulated weapons
      // sweep the navigable space. Ring apertures are never covered by a spawn.
      const arms=w.kind==='medusa'?3:w.kind==='mantis'||w.kind==='maw'?2:1;
      for(let arm=0;arm<arms;arm++){
        const ph=phase+arm*1.4,down=arm%2?-1:1;
        let head,part='tentacle',radius=4.4;
        if(w.kind==='hammer'){head=[c[0]+side*(17+15*Math.sin(ph)),c[1]+Math.cos(ph)*19,c[2]+Math.sin(ph)*8];part='arm';radius=4.8;}
        else if(w.kind==='tentacle')head=[c[0]+side*(20+19*Math.sin(ph)),c[1]+Math.sin(ph*1.3)*20,c[2]+Math.cos(ph)*12];
        else if(w.kind==='maw'){head=[c[0]+side*(22+7*Math.sin(ph)),c[1]+down*(11+8*(1+Math.sin(phase))),c[2]+5];part='jaw';radius=6;}
        else if(w.kind==='mantis'){head=[c[0]+side*(20+17*Math.sin(ph)),c[1]+down*(10+Math.cos(ph)*14),c[2]+Math.sin(ph)*10];part='scythe';radius=4.8;}
        else head=[c[0]+side*(29+16*Math.sin(ph)),c[1]+(arm-1)*19+Math.cos(ph)*9,c[2]+Math.sin(ph)*11];
        if(arm===0)w.head=head;
        const start=V3.add(w.pos,[-side*13,(arm-(arms-1)/2)*10,3]);
        // Overlapping spheres cover the same tube rendered between the joints.
        const n=16;
        for(let i=0;i<=n;i++){
          const t=i/n,pos=V3.lerp(start,head,t);
          pos[1]+=Math.sin(ph+t*5)*7*Math.sin(t*Math.PI);
          pos[2]+=Math.cos(ph+t*4)*4*Math.sin(t*Math.PI);
          add('a'+arm+'j'+i,pos,radius*(1-t*.18),part,arm);
        }
        if(w.kind==='hammer')add('hammer',head.slice(),10,'hammer',arm);
        if(w.kind==='mantis')add('blade'+arm,head.slice(),7,'blade',arm);
      }
    }
  }
  function updateWarp(e,dt){
    const s=e.pursuit;
    s.warpEntities=s.warpEntities.filter(w=>w.distance>s.travel-100);
    while(s.nextWarpDistance<s.travel+RULES.lookAhead){
      const index=s.nextWarp++;let d=s.nextWarpDistance;
      const nearby=s.gates.find(g=>Math.abs(g.distance-d)<180);
      if(nearby)d=nearby.distance+stageOf(e).gap*.5;
      s.nextWarpDistance=d+[1200,1000,820][s.chapter];
      const center=route(e,d),side=index%2?-1:1,kind=WARP_KINDS[index%WARP_KINDS.length];
      s.warpEntities.push({id:++e.entityId,schema:280,kind,name:WARP_NAMES[kind],scale:3.4,
        pos:[center[0]+side*87,center[1]+(index%3-1)*8,center[2]],center,distance:d,side,
        phase:index*1.73,age:0,reach:100,bodyRadius:34,segments:[],contactUntil:0});s.warpSpawned++;
    }
    s.warpEntities=s.warpEntities.slice(-RULES.maxWarp);
    for(const w of s.warpEntities){
      w.age+=dt;w.phase=(w.phase+dt*({hammer:1.15,tentacle:1.35,maw:.85,mantis:1.65,medusa:1.05}[w.kind]||1.3))%(Math.PI*2);
      poseWarp(e,w,dt);
    }
    // Edge boulders must not hide a monster's face or occupy the same body.
    // Keep central destructible obstacles and every mandatory ring intact.
    e.asteroids=e.asteroids.filter(a=>!a.wall||!s.warpEntities.some(w=>w.schema===280&&Math.abs(a.pos[2]-w.pos[2])<90&&Math.hypot(a.pos[0]-w.pos[0],a.pos[1]-w.pos[1])<60));
  }
  function coursePoint(e, travel) {
    const point=route(e,travel), nearby=e.pursuit.gates.filter(g=>Math.abs(g.distance-travel)<140)
      .sort((a,b)=>Math.abs(a.distance-travel)-Math.abs(b.distance-travel))[0];
    if(nearby){const gap=gateOpening(e,nearby),blend=smooth(1-Math.abs(nearby.distance-travel)/140);
      point[0]+=(gap.x-point[0])*blend;point[1]+=(gap.y-point[1])*blend;}
    return point;
  }
  function navigationPoint(e) {
    const s=e.pursuit,p=e.player,gate=s.gates.find(g=>!g.crossed&&g.distance>s.travel&&g.distance-s.travel<s.speed*2.1);
    if(gate){const o=gateOpening(e,gate),blend=smooth(1-(gate.distance-s.travel)/(s.speed*2.1));
      return [s.leader.pos[0]*(1-blend)+o.x*blend,s.leader.pos[1]*(1-blend)+o.y*blend,gate.pos[2]];}
    return s.leader.pos.slice();
  }
  const TAUNTS=Object.freeze(['Хе-хе, не отдам тебе требования!','Нормально делай — нормально будет!','Последняя правка. Хотя нет, предпоследняя!','Требования согласованы… с моей траекторией!','Догони сначала, потом уточняй!','Это не манёвр. Это новая редакция!']);
  function evasion(e,dt,nearGate){
    const s=e.pursuit,m=s.evasion;
    if(s.clock>=m.next){
      m.index++;m.until=s.clock+(e.assist?3.2:4.2)+s.chapter*.55;m.next=s.clock+17-s.chapter*2-(s.chapter===2?2:0);
      m.phase=arcadeSeed((e.seed+26061+m.index*7919)>>>0)()*Math.PI*2;s.maneuvers++;
      e.say('ФЗ: «'+TAUNTS[(m.index-1)%TAUNTS.length]+'»','enemy',true);s.lastTaunt=TAUNTS[(m.index-1)%TAUNTS.length];
      e.emit('pursuit-evasion',{stage:s.chapter+1,index:m.index});
    }
    const enabled=s.clock<m.until&&!nearGate&&s.clock>7,amp=(e.assist?7:12)+s.chapter*2+(s.chapter===2&&!e.assist?3:0);
    const tx=enabled?amp*(.7*Math.sin(s.clock*1.7+m.phase)+.3*Math.sin(s.clock*3.2+m.phase*2)):0;
    const ty=enabled?amp*.65*Math.sin(s.clock*2.15+m.phase*.8):0;
    // Slew limit bounds apparent lateral speed; no teleport, impossible corner or RNG per frame.
    for(let i=0;i<2;i++){const goal=i?ty:tx,limit=(e.assist?15:s.chapter===2?31:24)*dt;m.offset[i]+=arcadeClamp(goal-m.offset[i],-limit,limit);}
    m.active=enabled;return m.offset;
  }
  function moveLead(e, dt) {
    const s=e.pursuit,stage=stageOf(e),old=s.leader.pos;
    const cycle=s.chapterClock%stage.period;
    s.burst = cycle>stage.period-6 ? Math.sin((cycle-(stage.period-6))/6*Math.PI) : 0;
    s.leadSpeed=(stage.speed+stage.surge*s.burst)*(e.assist?.9:1);
    if(dt>0)s.leadTravel+=s.leadSpeed*dt;
    const point=coursePoint(e,s.leadTravel), gate=s.gates.some(g=>Math.abs(g.distance-s.leadTravel)<180);
    const weave=s.chapter*(gate?.12:1)*smooth(s.clock/8);
    point[0]+=weave*3.4*Math.sin(s.clock*(.6+s.chapter*.16));
    point[1]+=weave*2.2*Math.sin(s.clock*.51+1.4);
    const offset=evasion(e,dt,gate);point[0]+=offset[0];point[1]+=offset[1];
    s.leader.pos=point;s.leader.vel=dt>0?V3.scale(V3.sub(point,old),1/dt):[0,0,-s.leadSpeed];
    for(const c of s.carriers){c.pos=point.slice();c.vel=s.leader.vel.slice();c.delivered=e.rescued.includes(c.reqId);c.dead=c.delivered;c.transfer=c.delivered?1:s.packets[c.index]/packetSeconds(e,c.index);}
    for(const item of e.pickups)if(item.type==='requirement')item.pos=point.slice();
  }
  function sync(e) {
    const s=e.pursuit;e.boss=null;e.lock=null;
    e.enemies=e.enemies.filter(x=>x.pursuitEnemy&&!x.dead).slice(0,RULES.maxEnemies);
    e.hostile=e.hostile.filter(x=>x.pursuitShot).slice(-RULES.maxHostile);
    e.pickups=e.pickups.filter(p=>p.type!=='requirement').concat(e.plan[1].map(reqId=>{
      const item=e.pickups.find(p=>p.type==='requirement'&&p.reqId===reqId)||{type:'requirement',reqId,r:2};
      item.pos=s.leader.pos.slice();item.dead=e.rescued.includes(reqId);item.pursuitCarrier=s.leader.id;return item;
    }));
    s.carriers.forEach((c,i)=>{if(e.rescued.includes(c.reqId)){c.delivered=true;c.dead=true;s.packets[i]=packetSeconds(e,i);}});
    updateProgress(e);
  }
  function updateProgress(e) {
    const s=e.pursuit;s.uploaded=s.packets.reduce((n,x)=>n+x,0);
    // Each actual requirement is one third; packet lengths differ by stage.
    s.progress=Math.min(100,s.packets.reduce((n,x,i)=>n+Math.min(1,x/packetSeconds(e,i)),0)/3*100);
  }
  function generateRocks(e) {
    const s=e.pursuit,stage=stageOf(e);
    e.asteroids=e.asteroids.filter(a=>!a.dead&&a.distance>s.travel-45);
    while(s.nextRockDistance<s.travel+RULES.lookAhead){
      const d=s.nextRockDistance,index=s.nextRock++;s.nextRockDistance+=s.chapter===2?150:190;
      const rnd=arcadeSeed((e.seed+2100417+index*7919)>>>0),point=route(e,d);
      const add=(x,y,r,wall=false)=>e.asteroids.push({id:++e.entityId,pursuitRock:true,pos:[x,y,point[2]],r,variant:index%3,
        phase:rnd()*Math.PI*2,distance:d,passAt:s.clock+(d-s.travel)/s.speed,spawnedAt:s.clock,hp:wall?null:52,wall,hit:0,contact:false,dead:false});
      for(const side of [-1,1])add(s.origin[0]+side*(88+rnd()*10),s.origin[1]+(rnd()-.5)*90,12+rnd()*6,true);
      if(d<1000||s.gates.some(g=>Math.abs(g.distance-d)<80))continue;
      const r=5+rnd()*3,angle=rnd()*Math.PI*2;
      add(point[0]+Math.cos(angle)*(r+17),point[1]+Math.sin(angle)*(r+17),r);
    }
    e.asteroids=e.asteroids.slice(-RULES.maxRocks);
    s.gates=s.gates.filter(g=>g.distance>s.travel-70);
    while(s.nextGateDistance<s.travel+RULES.lookAhead){
      const index=s.nextGate++,d=s.nextGateDistance;
      s.nextGateDistance+=stage.gap+(s.chapter===2&&index%3===1?-140:0);
      const kind='circle',gapRadius=stage.halfX+(e.assist?4:0);
      s.gates.push({id:++e.entityId,index,distance:d,pos:route(e,d),kind,chapter:s.chapter,
        hx:gapRadius,hy:gapRadius,gapRadius,ringThickness:4.5,crossed:false,passed:false,hit:false});
    }
    s.gates=s.gates.slice(-RULES.maxGates);
  }
  function initialize(e, migrating = false) {
    const previous=e.pursuit,rescued=count(e),seconds=e.assist?RULES.calmSeconds:RULES.seconds;
    let fraction=rescued/3;
    if(migrating&&previous?.version==='1.9.0')fraction=Math.max(fraction,arcadeClamp(finite(previous.progress)/100,0,1));
    if(migrating&&previous?.version==='1.8.0')fraction=Math.max(fraction,(rescued+Math.max(0,...previous.carriers.filter(c=>!e.rescued.includes(c.reqId)).map(c=>Math.min(.99,finite(c.transfer)/Math.max(.1,finite(c.transferTime,3))))))/3);
    const origin=e.player.pos.slice(),leaderId=++e.entityId,chapter=Math.min(2,rescued);
    const packets=STAGES.map((x,i)=>arcadeClamp(fraction*3-i,0,1)*(e.assist?x.calm:x.seconds));
    e.pursuit={version:VERSION,rulesRevision:RULES_REVISION,clock:0,state:'chase',migrated:!!migrating,origin,returnStation:previous?.returnStation?.slice()||e.station.pos.slice(),
      speed:(STAGES[chapter].speed)*(e.assist?.9:1),travel:0,leadTravel:84,leadSpeed:82,burst:0,
      routePhase:arcadeSeed((e.seed+91047)>>>0)()*Math.PI*2,requiredSeconds:seconds,packets,uploaded:0,progress:0,
      chapter,chapterClock:0,stageHistory:[{stage:chapter+1,at:0}],stageGates:[0,0,0],gates:[],nextGate:0,nextGateDistance:950,
      nextRock:0,nextRockDistance:380,velocity:[0,0],linkId:null,linkJammed:false,linkRecovery:0,lockTime:0,
      link:{connected:false,reason:'acquiring',distance:84,offset:0,blockedId:null},linkedSeconds:0,disconnectedSeconds:0,
      collisions:0,gateCollisions:0,gatesPassed:0,gatesMissed:0,rocksDestroyed:0,kills:0,jammersDestroyed:0,nextEncounter:12,encounter:0,enemiesSpawned:0,
      completedAt:null,announced:false,lostLinkAt:null,shotsOpened:0,
      warpEntities:[],nextWarp:0,nextWarpDistance:1700,warpContacts:0,warpSpawned:0,
      evasion:{next:8.5,index:0,until:0,phase:0,offset:[0,0],active:false},maneuvers:0,lastTaunt:null,
      leader:{id:leaderId,name:'ФЗ',pos:V3.add(origin,[0,0,-84]),vel:[0,0,-82],color:'#ffcc88',r:5.6,pursuitCarrier:true,profile:'lead',open:true,delivered:false},
      carriers:e.plan[1].map((reqId,index)=>({id:++e.entityId,index,reqId,name:STAGES[index].packet,profile:'radio',
        pos:V3.add(origin,[0,0,-84]),vel:[0,0,-82],open:true,hp:0,maxHp:0,transfer:0,transferTime:1,escaped:false,
        delivered:e.rescued.includes(reqId),dead:e.rescued.includes(reqId)}))};
    e.phase='pursuit';e.location='ФЗ уходит со связи';e.wave=0;e.waveSpawned=0;e.waveClock=0;e.spawnClock=999;
    e.enemies=[];e.hostile=[];e.bullets=[];e.asteroids=[];e.particles=[];e.trails=[];e.explosions=[];e.boss=null;
    e.selectedTarget=null;e.navMode='objective';e.autopilot=false;e.detour=null;e.navWatch=null;e.hullCache=null;e.warning='';
    Object.assign(e.player,{yaw:0,pitch:0,bank:0,speed:e.pursuit.speed,boosting:true});
    generateRocks(e);updateWarp(e,0);moveLead(e,0);sync(e);
    if(!migrating)e.say('Три пакета у ФЗ. Держи канал, пролетай внутри колец и сбивай эскадрильи. Сущности Варпа неуязвимы: обходи молоты и щупальца. ФЗ резко меняет курс; тяга подстроится сама.','brief',true);
    return e.pursuit;
  }
  function linkState(e) {
    const s = e.pursuit, from = e.player.pos, to = s.leader.pos;
    const range = distance(from, to), offset = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const radius = linkRadius(e);
    let reason = offset > radius ? 'off-course' : range < RULES.minRange || range > RULES.maxRange ? 'range' : s.linkRecovery > 0 ? 'recovering' : 'connected';
    let blockedId = null;
    if (reason === 'connected') {
      const rock = e.asteroids.find(a => !a.dead && flightSegment(from, to, a.pos, a.r + .7) !== null);
      if (rock) { reason = 'occluded'; blockedId = rock.id; }
    }
    if (reason === 'connected') {
      const wall=gateHit(e,from,to,.15);
      if(wall){reason='obstructed';blockedId=wall.gate.id;}
    }
    if (reason === 'connected') {
      const jammer=e.enemies.find(x=>x.pursuitEnemy&&x.role==='jammer'&&!x.dead&&x.age>(e.assist?2:0)&&x.age<17&&distance(x.pos,from)<132);
      if(jammer){reason='jammed';blockedId=jammer.id;}
    }
    if(reason==='connected'&&warpHit(e,from,to,.2)){reason='obstructed';blockedId='warp';}
    if(reason==='connected'&&s.lockTime<RULES.acquisition)reason='acquiring';
    return { connected: reason === 'connected', reason, distance: range, offset, blockedId };
  }
  function linkEligible(e, carrier) {
    return active(e) && e.status === 'playing' && e.pursuit.state === 'chase' &&
      (!carrier || !carrier.delivered) && linkState(e).connected;
  }
  function queueReviews(e) {
    const current = e.status === 'lesson' ? e.lesson?.caseIndex : null;
    const done = new Set(e.decisions.filter(d => d.stage === 1).map(d => d.caseIndex)), seen = new Set();
    e.lessonQueue = e.lessonQueue.filter(l => {
      if (l.stage !== 1) return true;
      if (done.has(l.caseIndex) || l.caseIndex === current || seen.has(l.caseIndex)) return false;
      seen.add(l.caseIndex); return true;
    });
    for (const [caseIndex, reqId] of [[2, e.plan[1][0]], [3, e.plan[1][2]]]) {
      if (!done.has(caseIndex) && caseIndex !== current && !seen.has(caseIndex)) e.lessonQueue.push({ reqId, caseIndex, stage: 1 });
    }
  }
  function review(e) {
    const s = e.pursuit;
    if (s.state !== 'review') {
      s.state = 'review'; s.completedAt = s.clock; s.progress = 100; s.uploaded = s.requiredSeconds;
      s.linkId = null; e.enemies = []; e.hostile = []; e.bullets = []; e.lock = null;
      e.autopilot = false; e.player.speed = 0; e.player.boosting = false;
      e.say('Все требования у нас! Ушли из астероидного поля. Спокойно сверим два решения — и в Цитадель.', 'success', true);
      comic(e, 'ТЗ СКАЧАНО!', 'success', s.leader.pos);
    }
    queueReviews(e);
    if (!casesDone(e)) { if (e.status === 'playing') before.openNextLesson.call(e); return; }
    if (e.status !== 'playing') return;
    // The review cards are the safe cut between the outbound chase and the
    // home approach. Return to the shared, bounded world at the visible FRONT
    // of the Citadel, so its physical gate and the 1.8.1 docking still agree.
    s.state = 'return'; e.phase = 'dock'; e.station.pos = s.returnStation.slice();
    e.player.pos = V3.add(e.station.pos, [0, 1, -180]);
    Object.assign(e.player, { yaw: Math.PI, pitch: 0, bank: 0, speed: 22, boosting: false });
    e.asteroids = []; e.trails = []; e.particles = []; e.explosions = [];
    e.selectedTarget = null; e.navMode = 'objective'; e.autopilot = true;
    e.detour = null; e.navWatch = null; e.hullCache = null; e.warning = '';
    e.say('Загрузка завершена, решения сохранены. Впереди голубой шлюз Цитадели. Автокурс ведёт на посадку.', 'success', true);
    e.emit('phase', 'dock');
  }
  function acquire(e, c) {
    if (c.delivered || e.rescued.includes(c.reqId)) return;
    const item = e.pickups.find(p => p.type === 'requirement' && p.reqId === c.reqId);
    if (!item) return;
    item.pos = e.player.pos.slice();
    granting.add(e);
    try { e.collect(item); } finally { granting.delete(e); item.pos = e.pursuit.leader.pos.slice(); }
    if (!e.rescued.includes(c.reqId)) return;
    c.delivered = true; c.dead = true; c.transfer = 1;
    comic(e, count(e) === 3 ? 'ПОСЛЕДНЕЕ УТОЧНЕНИЕ!' : 'ТРЕБОВАНИЕ ПРИНЯТО!', 'success', e.pursuit.leader.pos);
  }
  function encounters(e,dt) {
    const s=e.pursuit,p=e.player,stage=stageOf(e);
    if(s.clock>=s.nextEncounter){
      s.nextEncounter=s.clock+stage.wave+(e.assist?4:0);s.encounter++;
      // Three times the former 2 / 2 / 3 formation. Keep every craft in the firing hemisphere.
      const count=s.chapter===2?9:6;
      for(let i=0;i<count&&e.enemies.length<RULES.maxEnemies;i++){
        const side=(s.encounter+i)%2?1:-1,role=s.chapter>0&&i%3===0?'jammer':i%3===2?'heavy':'interceptor';
        const pos=V3.add(p.pos,[side*(24+i%3*9),(i%3-1)*14,-175-i*6]);
        const hp=(role==='jammer'?78:role==='heavy'?96:58)*(e.assist?.78:1);
        e.enemies.push({id:++e.entityId,pursuitEnemy:true,type:'fighter',role,pos,vel:[0,0,-s.speed],
          r:role==='heavy'?5:4.1,hp,maxHp:hp,color:role==='jammer'?'#d4a6ff':role==='heavy'?'#dba766':'#ff826d',points:role==='jammer'?180:role==='heavy'?180:120,
          age:0,side,slot:i,shot:e.assist?2.4+i*.3:0,telegraph:0,aim:null,warp:0,hit:0,dead:false,volleys:0});s.enemiesSpawned++;
      }
      if(e.assist)e.say(s.chapter?'Глушители впереди. Сбивай их, чтобы восстановить канал.':'Перехватчики на курсе. Стреляй и меняй позицию.','alert');
    }
    const shoot=x=>{
      const lead=e.assist?.20:.32;
      // Aim at the current moving flight frame; a maneuver can evade the shot.
      const aim=x.aim||[p.pos[0]+s.velocity[0]*lead,p.pos[1]+s.velocity[1]*lead,p.pos[2]];
      const velocity=V3.add(V3.scale(V3.norm(V3.sub(aim,x.pos)),e.assist?96:112),[0,0,-s.speed]);
      e.hostile.push({pursuitShot:true,pos:x.pos.slice(),vel:velocity,life:2.8,r:.8,damage:x.role==='heavy'?14:x.role==='jammer'?9:11,color:x.color});
      x.volleys++;x.muzzleFlash=.12;s.shotsOpened++;x.aim=null;x.shot=(e.assist?4.4:3.3)-s.chapter*.2+x.slot%3*.18;
    };
    for(const x of e.enemies){
      if(x.dead)continue;const old=x.pos.slice();x.age+=dt;x.hit=Math.max(0,x.hit-dt);x.muzzleFlash=Math.max(0,(x.muzzleFlash||0)-dt);
      const departing=x.age>19,forward=departing?245+(x.age-19)*72:82+(x.slot%3)*30;
      const target=[p.pos[0]+x.side*(departing?40:10+(x.slot%3)*8+Math.sin(x.age*.9+x.slot)*8),
        p.pos[1]+Math.sin(x.age*.65+x.slot)*12+(x.slot%3-1)*7,p.pos[2]-forward];
      // The old loop eased a stationary world point toward a moving target. At
      // 124 units/s that lag alone put ships behind the player. Move the reference
      // frame first; then ease the formation offset, with a forward safety bound.
      x.pos[2]-=s.speed*dt;x.pos=V3.lerp(x.pos,target,1-Math.exp(-dt*(departing?2:.9)));
      x.pos[2]=Math.min(x.pos[2],p.pos[2]-48);x.vel=V3.scale(V3.sub(x.pos,old),1/dt);
      if(departing){x.telegraph=0;continue;}
      x.shot-=dt;
      if(e.assist){
        if(e.assist&&x.telegraph>0){x.telegraph=Math.max(0,x.telegraph-dt);if(x.telegraph===0)shoot(x);}
        else if(x.age>2&&x.shot<=0){x.telegraph=1.25;x.aim=[p.pos[0]+s.velocity[0]*.2,p.pos[1]+s.velocity[1]*.2,p.pos[2]];}
      }else {x.telegraph=0;if(x.shot<=0)shoot(x);}
    }
    e.enemies=e.enemies.filter(x=>!x.dead&&x.age<23);
  }
  proto.target=function(){
    if(!active(this))return before.target.call(this);
    const from=this.player.pos,basis=flightBasis(this.player.yaw,this.player.pitch);
    const candidates=this.enemies.filter(x=>!x.dead&&distance(x.pos,from)<230&&V3.dot(V3.norm(V3.sub(x.pos,from)),basis.f)>.91&&
      !gateHit(this,from,x.pos,.5)&&!warpHit(this,from,x.pos,.5)&&!this.asteroids.some(a=>!a.dead&&flightSegment(from,x.pos,a.pos,a.r+.5)!==null));
    candidates.sort((a,b)=>(a.role==='jammer'?0:1)-(b.role==='jammer'?0:1)||distance(a.pos,from)-distance(b.pos,from));
    const selected=candidates.find(x=>x.id===this.selectedTarget)||candidates[0]||null;this.lock=selected?.id??null;return selected;
  };
  proto.hit=function(enemy,amount){
    if(!active(this)||!enemy?.pursuitEnemy)return before.hit.call(this,enemy,amount);
    if(enemy.dead)return;
    before.hit.call(this,enemy,amount);
    if(enemy.dead){this.pursuit.kills++;if(enemy.role==='jammer'){this.pursuit.jammersDestroyed++;this.pursuit.lockTime=0;this.notify('ПОМЕХА СНЯТА','Канал связи можно восстановить');}}
  };
  function hazards(e, old, dt) {
    const s=e.pursuit,p=e.player;
    for(const rock of e.asteroids){
      rock.hit=Math.max(0,finite(rock.hit)-dt);rock.passAt=s.clock+(rock.distance-s.travel)/s.speed;
      if(rock.dead||rock.contact||flightSegment(old,p.pos,rock.pos,rock.r+1.8)===null)continue;
      rock.contact=true;if(e.damage(17)){s.collisions++;s.linkRecovery=.9;e.burst(rock.pos,'#ffc096',9);}
      if(e.status!=='playing')return;
    }
    for(const gate of s.gates){
      if(gate.crossed||old[2]<gate.pos[2]||p.pos[2]>gate.pos[2])continue;
      gate.crossed=true;const t=(gate.pos[2]-old[2])/(p.pos[2]-old[2]),at=V3.lerp(old,p.pos,t),o=gateOpening(e,gate);
      gate.passed=o.shape==='circle'?Math.hypot(at[0]-o.x,at[1]-o.y)<o.radius-2.2:Math.abs(at[0]-o.x)<o.hx-2.2&&Math.abs(at[1]-o.y)<o.hy-2.2;
      if(gate.passed){s.gatesPassed++;s.stageGates[s.chapter]++;e.emit('pursuit-gate',{stage:s.chapter+1,passed:true});}
      else {s.gatesMissed++;s.linkRecovery=1.1;
        if((gate.kind==='circle'?ringSegment(e,gate,old,p.pos,2.2)!==null:gateParts(e,gate).some(box=>boxSegment(old,p.pos,box,2.2)!==null))&&e.damage(e.assist?20:28)){s.gateCollisions++;gate.hit=true;}
        e.notify('ПРОЛЁТ ПРОПУЩЕН','Следующие ворота впереди. Принятые данные сохранены.');}
      if(e.status!=='playing')return;
    }
    const contact=warpHit(e,old,p.pos,1.8,true);
    if(contact&&s.clock>=contact.entity.contactUntil){
      contact.entity.contactUntil=s.clock+1.4;
      if(e.damage(e.assist?18:24)){s.warpContacts++;s.linkRecovery=1.1;e.burst(p.pos,'#b8a0ff',8);e.notify('УДАР ВАРПА',contact.entity.name||'Обходите движущиеся щупальца и оружие');}
    }
  }
  function projectiles(e, dt, input, playerOld) {
    const s=e.pursuit,p=e.player;
    if(input.fire){
      const beforeCount=e.bullets.length;
      e.fire();
      // Inherit forward flight speed: the weapons stay usable during FZ's surge.
      const target=e.target();
      for(const b of e.bullets.slice(beforeCount)){
        const speed=s.speed+235,aim=target&&CITADEL_AIM.intercept(b.pos,target.pos,target.vel,speed,1.7);
        b.vel=aim?V3.scale(aim.direction,speed):V3.add(V3.scale(flightBasis(p.yaw,p.pitch).f,235),[0,0,-s.speed]);
      }
    }
    if(input.missile)e.missile();
    if(input.pulse&&p.pulseCooldown<=0)e.pulse();
    for(const shot of e.bullets){
      if(shot.type==='missile'){
        const t=e.enemies.find(x=>x.id===shot.target&&!x.dead);
        if(t)shot.vel=V3.scale(V3.norm(V3.sub(t.pos,shot.pos)),s.speed+135);
      }
      const old=shot.pos;shot.pos=V3.add(old,V3.scale(shot.vel,dt));shot.life-=dt;
      let target=null,first=2,wall=gateHit(e,old,shot.pos,shot.r||.4),warp=warpHit(e,old,shot.pos,shot.r||.4);if(wall)first=wall.t;if(warp)first=Math.min(first,warp.t);
      for(const rock of e.asteroids){if(rock.dead)continue;const t=flightSegment(old,shot.pos,rock.pos,rock.r+shot.r);if(t!==null&&t<first){target=rock;first=t;}}
      for(const x of e.enemies){if(x.dead)continue;const t=flightSegment(V3.add(old,V3.scale(x.vel,dt)),shot.pos,x.pos,x.r+shot.r);if(t!==null&&t<first){target=x;first=t;}}
      if(first>1)continue;
      shot.life=0;e.burst(V3.lerp(old,shot.pos,first),target?.color||'#e7c59e',3);
      if(target?.pursuitEnemy)e.hit(target,shot.damage);
      else if(target&&!target.wall){target.hp-=shot.damage;target.hit=.1;if(target.hp<=0){target.dead=true;s.rocksDestroyed++;e.burst(target.pos,'#c5bbb0',10);e.emit('destroy','asteroid');}}
    }
    e.bullets=e.bullets.filter(b=>b.life>0).slice(-RULES.maxBullets);
    for(const shot of e.hostile){
      const old=shot.pos;shot.pos=V3.add(old,V3.scale(shot.vel,dt));shot.life-=dt;
      const obstruction=gateHit(e,old,shot.pos,shot.r),hit=flightSegment(V3.add(old,V3.sub(p.pos,playerOld||p.pos)),shot.pos,p.pos,shot.r+1.8);
      if(obstruction||warpHit(e,old,shot.pos,shot.r)||(e.asteroids.some(a=>!a.dead&&flightSegment(old,shot.pos,a.pos,a.r+shot.r)!==null)))shot.life=0;
      else if(hit!==null){shot.life=0;e.damage(shot.damage);}
    }
    e.hostile=e.hostile.filter(b=>b.life>0).slice(-RULES.maxHostile);
    for(const item of e.pickups)if(!item.dead&&item.type!=='requirement'&&distance(item.pos,p.pos)<10)e.collect(item);
    e.pickups=e.pickups.filter(x=>x.type==='requirement'||!x.dead&&x.pos[2]<p.pos[2]+45);
  }
  function transfer(e,dt) {
    const s=e.pursuit;
    let link=linkState(e);
    if(link.reason==='acquiring'||link.connected){s.lockTime=Math.min(RULES.acquisition,s.lockTime+dt);link=linkState(e);}
    else s.lockTime=0;
    const changed=s.link.connected!==link.connected;s.link=link;s.linkId=link.connected?s.leader.id:null;s.linkJammed=link.reason==='jammed';
    if(changed)e.emit('pursuit-link',{connected:link.connected,reason:link.reason,stage:s.chapter+1});
    if(link.connected){s.linkedSeconds+=dt;s.lostLinkAt=null;s.packets[s.chapter]=Math.min(packetSeconds(e,s.chapter),s.packets[s.chapter]+dt);}
    else{s.disconnectedSeconds+=dt;if(s.lostLinkAt===null)s.lostLinkAt=s.clock;}
    updateProgress(e);
    if(s.packets[s.chapter]+1e-7>=packetSeconds(e,s.chapter)&&s.stageGates[s.chapter]>=stageOf(e).gates){
      acquire(e,s.carriers[s.chapter]);
      if(!s.carriers[s.chapter].delivered)return;
      s.packets[s.chapter]=packetSeconds(e,s.chapter);updateProgress(e);
      if(s.chapter===2){review(e);return;}
      s.chapter++;s.chapterClock=0;s.lockTime=0;s.link.connected=false;s.link.reason='acquiring';s.linkId=null;
      s.stageHistory.push({stage:s.chapter+1,at:s.clock});s.nextEncounter=Math.min(s.nextEncounter,s.clock+6);
      e.say('Пакет принят. Этап '+(s.chapter+1)+': '+stageOf(e).name+'. ФЗ наращивает скорость.','order',true);
      comic(e,'ЭТАП '+(s.chapter+1)+' / 3','action',s.leader.pos);e.emit('pursuit-stage',s.chapter+1);
    }
  }
  function effects(e, dt) {
    for (const particle of e.particles) { particle.pos = V3.add(particle.pos, V3.scale(particle.vel, dt)); particle.life -= dt; }
    e.particles = e.particles.filter(p => p.life > 0).slice(-64);
    for (const effect of e.explosions) effect.life -= dt;
    e.explosions = e.explosions.filter(x => x.life > 0).slice(-12);
  }

  proto.beginStage = function (n, ...args) {
    this.pursuit = null;
    const result = before.beginStage.call(this, n, ...args);
    if (n === 1 && !this.finale) {
      initialize(this);
      if (ARCADE.engine === this) ARCADE.overlayToken = '';
      this.emit('state', this.status);
    }
    return result;
  };
  proto.launch = function (...args) {
    if (!active(this) || this.status !== 'briefing') return before.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = false;
    if (!this.pursuit.announced) {
      this.pursuit.announced = true;
      comic(this, 'ФЗ УХОДИТ СО СВЯЗИ!', 'action', this.pursuit.leader.pos);
    }
    this.say('Вижу ФЗ. Голубой канал появится после захвата связи. Пролетай внутри колец; пробел или кнопка огня — по эскадрильям, правая кнопка мыши — ракета. Сущности Варпа обходи: оружие их не берёт.', 'order', true);
    this.emit('state', 'playing'); return true;
  };
  proto.collect = function (item, ...args) {
    if (active(this) && item.type === 'requirement' && !granting.has(this)) return;
    return before.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) {
    if (active(this) && this.pursuit.state !== 'review') return;
    return before.openNextLesson.apply(this, args);
  };
  proto.continueLesson = function (...args) {
    const oldFlightReview = active(this) && this.pursuit.state === 'chase';
    const result = before.continueLesson.apply(this, args);
    // A pre-1.9 saved lesson may have been open in the middle of the orbit.
    // Continuing it starts the new steering loop in its normal manual mode.
    if (oldFlightReview && active(this) && this.pursuit.state === 'chase') this.autopilot = false;
    return result;
  };
  proto.checkStage = function (...args) {
    if (!active(this)) return before.checkStage.apply(this, args);
    if (this.status === 'playing' && count(this) === 3) review(this);
  };
  proto.navTarget = function (...args) {
    if (!active(this)) return before.navTarget.apply(this, args);
    return { ...this.pursuit.leader, pos: navigationPoint(this), name: 'ФЗ · курс через ворота' };
  };
  proto.selectTarget = function (...args) {
    if (!active(this)) return before.selectTarget.apply(this, args);
    this.selectedTarget = this.pursuit.leader.id; this.navMode = 'objective';
  };
  proto.guidance = function (input = {}) {
    if (!active(this)) return before.guidance.call(this, input);
    if (!this.autopilot) return input;
    const d = V3.sub(navigationPoint(this), this.player.pos);
    return { ...input, turn: arcadeClamp(d[0] * .075, -1, 1), pitch: arcadeClamp(d[1] * .085, -1, 1) };
  };
  proto.step = function (delta, input = {}) {
    if (!active(this)) return before.step.call(this, delta, input);
    if (this.status === 'lesson') return before.step.call(this, delta, input);
    if (this.status !== 'playing') return;
    if (count(this) === 3 || this.pursuit.state === 'review') { review(this); return; }
    const dt = arcadeClamp(finite(delta), 0, .04);
    if (!dt) return;
    const s = this.pursuit, p = this.player, old = p.pos.slice();
    s.clock += dt; s.chapterClock += dt; this.elapsed += dt; this.stageTime += dt; this.phaseClock += dt;
    this.captainClock = Math.max(0, this.captainClock - dt);
    for (const key of ['flash', 'shake', 'hitFlash', 'pulseWave']) this[key] = Math.max(0, finite(this[key]) - dt);
    for (const key of ['shotCooldown', 'missileCooldown', 'pulseCooldown', 'flipCooldown', 'invulnerable']) p[key] = Math.max(0, finite(p[key]) - dt);
    s.linkRecovery = Math.max(0, s.linkRecovery - dt);
    generateRocks(this); updateWarp(this,dt); moveLead(this, dt);
    const gap=s.leadTravel-s.travel,targetSpeed=stageOf(this).speed*(this.assist?.9:1)+arcadeClamp((gap-85)*1.25,-18,54);
    s.speed+=(targetSpeed-s.speed)*(1-Math.exp(-dt*1.6));s.travel+=s.speed*dt;
    const control = this.guidance(input), turn = arcadeClamp(finite(control.turn), -1, 1), pitch = arcadeClamp(finite(control.pitch), -1, 1);
    const blend = 1 - Math.exp(-dt * 8);
    s.velocity[0] += (turn * RULES.horizontalSpeed - s.velocity[0]) * blend;
    s.velocity[1] += (pitch * RULES.verticalSpeed - s.velocity[1]) * blend;
    p.pos = [arcadeClamp(p.pos[0] + s.velocity[0] * dt, s.origin[0] - RULES.halfWidth, s.origin[0] + RULES.halfWidth),
      arcadeClamp(p.pos[1] + s.velocity[1] * dt, s.origin[1] - RULES.halfHeight, s.origin[1] + RULES.halfHeight),
      s.origin[2] - s.travel];
    p.yaw = Math.atan2(s.velocity[0], s.speed) * .7;
    p.pitch = Math.atan2(s.velocity[1], s.speed) * .7;
    p.bank += (-turn * .62 - p.bank) * blend; p.speed = s.speed; p.boosting = true;
    hazards(this, old, dt);
    if (this.status !== 'playing') return;
    encounters(this,dt); projectiles(this, dt, input,old); effects(this, dt);
    if(this.status!=='playing')return;
    transfer(this,dt);
  };
  proto.objective = function (...args) {
    if (!active(this) || !['briefing', 'playing', 'paused'].includes(this.status)) return before.objective.apply(this, args);
    const s = this.pursuit;
    const stage=stageOf(this),pending=s.packets[s.chapter]>=packetSeconds(this,s.chapter)&&s.stageGates[s.chapter]<stage.gates;
    return { title: 'Этап '+(s.chapter+1)+'/3 · '+stage.name,
      detail: pending ? 'Пакет передан. Завершите пролёт через кольца этого этапа.' : 'Держите голубой канал, проходите внутри колец. Перехватчики стреляют по вашему щиту, глушители рвут связь; неуязвимые сущности Варпа нужно обходить.',
      progress: 'ПАКЕТ '+Math.floor(s.packets[s.chapter]/packetSeconds(this,s.chapter)*100)+'% · ВОРОТА '+Math.min(stage.gates,s.stageGates[s.chapter])+'/'+stage.gates+' · ЩИТ '+Math.ceil(this.player.hp) };

  };

  function shipMeshes(ship, time, fx, player = false) {
    const b = player ? flightBasis(ship.yaw, ship.pitch, ship.bank) : spaceBasisDir(ship.vel);
    const scale = player ? 1.35 : 2, model = spaceModel(ship.pos, [scale, scale, scale], b), items = [];
    const add = (mesh, off, size, color, em = 0, mirror = false) => {
      const basis = mirror ? { ...b, r: V3.scale(b.r, -1) } : b;
      const item = citadelItem(mesh, spacePoint(model, off), size.map(n => n * scale), color, em, basis);
      if (!player) item.pursuitCarrier = ship.id;
      items.push(item);
    };
    add('hull', [0, 0, 0], [1.25, 1.15, 1.8], player ? '#d8e6e8' : '#f2c990');
    for (const side of [-1, 1]) {
      add('wing', [0, 0, -.9], [1.15, 1, 1.3], player ? '#547f9c' : '#d87d45', 0, side < 0);
      add('armor', [side * 1.7, 0, -2], [.38, .33, 1.6], player ? '#658799' : '#374b60');
      add('box', [side * 1.7, 0, -3.65], [.25, .23, .15], '#9dfaff', 1);
      add('octa', [side * 1.7, 0, -4.7], [.23, .19, 1.3 + Math.sin(time * 23 + side) * .2], '#86eaff', 1);
      add('box', [side * 2.7, -.04, -1.3], [.09, .07, .8], player ? '#b0f4fa' : '#fff0c4', .5);
    }
    add('sphere', [0, .48, .5], [.49, .36, 1.2], player ? '#3a8fab' : '#76d9e5', .18);
    add('box', [0, .75, -2.7], [.09, .68, .7], player ? '#9acbd5' : '#ffe4b5');
    if (fx) for (const side of [-1, 1]) add('octa', [side * 1.7, 0, -7], [.08, .08, 2], '#b0f4ff', 1);
    return items;
  }
  function carrierMeshes(c, time, fx) { return c?.delivered ? [] : shipMeshes(c, time, fx); }
  spaceCamera = function (e, time, preview) {
    if (!active(e)) return before.camera(e, time, preview);
    const p = e.player.pos, lead = e.pursuit.leader.pos;
    const rect = ARCADE.canvas?.getBoundingClientRect?.(), aspect = rect?.height ? rect.width / rect.height : 16 / 9;
    const fov = aspect < .85 ? 1.2 : 1.02;
    return stationLook([p[0] * .8 + lead[0] * .2, p[1] + 7.3, p[2] + 24],
      [p[0] * .75 + lead[0] * .25, p[1] + 2.5, p[2] - 110], fov, { near: .3, far: 3200 });
  };
  spaceScene = function (e, time, fx = true) {
    if (!active(e)) return before.scene(e, time, fx);
    const s = e.pursuit, p = e.player, items = [];
    for (const a of e.asteroids) {
      if (a.dead) continue;
      items.push(citadelItem('rock' + a.variant, a.pos, [a.r, a.r, a.r], a.hit > 0 ? '#ffddb4' :
        a.wall ? ['#586878', '#867b79', '#62737f'][a.variant] : '#b59d86', 0,
        flightBasis(a.phase + time * .018, a.phase * .2, a.phase * .7)));
    }
    for(const gate of s.gates){
      const color=gate.passed?'#5ddbb0':gate.hit?'#f57a6e':gate.kind==='shutter'?'#9d8dcc':'#42677e';
      for(const part of gateParts(e,gate))items.push(citadelItem('box',part.pos,part.size,color,.06));
      const o=gateOpening(e,gate),z=gate.pos[2]+3.1;
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[o.x+x*o.hx,o.y+y*o.hy,z]);
      for(let i=0;i<4;i++)citadelBeam(items,corners[i],corners[(i+1)%4],gate.kind==='shutter'?'#f0b77c':'#73cfd8',.65,.85);
      for(const side of [-1,1]){
        items.push(citadelItem('box',[o.x+side*(o.hx+4),o.y,z],[1.2,o.hy+5,1.8],'#253e4f',.03));
        for(let mark=-1;mark<=1;mark++)items.push(citadelItem('box',[o.x+side*(o.hx+4),o.y+mark*(o.hy*.7),z+2],[1.3,.7,.25],'#e4b668',.45));
      }
      for(const x of [-1,1])for(const y of [-1,1]){
        const at=[o.x+x*o.hx,o.y+y*o.hy,z];
        citadelBeam(items,at,[at[0]-x*7,at[1],z],gate.passed?'#82ffcb':'#7ee9ff',.25,.9);
        citadelBeam(items,at,[at[0],at[1]-y*5,z],gate.passed?'#82ffcb':'#7ee9ff',.25,.9);
      }
      if(gate.kind==='shutter')for(const side of [-1,1])items.push(citadelItem('box',[o.x+side*(o.hx+3),o.y,z],[.5,o.hy,1],'#ffce83',.7));
    }
    // There is deliberately no persistent FZ wake. The actual channel is a
    // translucent screen-space ribbon attached to BOTH antenna positions.
    for(const x of e.enemies){
      if(x.dead)continue;const b=spaceBasisDir(x.vel),m=spaceModel(x.pos,[1,1,1],b);
      items.push(citadelItem('hull',x.pos,[2.5,1.35,4.2],x.hit>0?'#fff4cd':x.color,.05,b));
      for(const side of [-1,1]){
        items.push(citadelItem('box',spacePoint(m,[side*4,0,-1]),[2.3,.28,1.8],'#354957',0,b));
        items.push(citadelItem('octa',spacePoint(m,[side*3,0,-5]),[.5,.45,2.5],x.color,1,b));
      }
      items.push(citadelItem('sphere',spacePoint(m,[0,.8,1.7]),[.8,.5,1.1],'#fff0b0',.6,b));
      if(x.role==='jammer')items.push(citadelItem('ring',spacePoint(m,[0,2,-1]),[3,3,.25],'#d9a7ff',.7,b));
      if(e.assist&&x.telegraph>0)items.push(citadelItem('octa',spacePoint(m,[0,0,5]),[1.1,1.1,1.1],'#ffb185',1,b));
    }
    if (fx) {
      for (let i = 0; i < 12; i++) {
        const z = p.pos[2] - ((s.travel * .75 + i * 47) % 530);
        const x = s.origin[0] + (i % 2 ? 1 : -1) * (46 + i % 4 * 8), y = s.origin[1] + (i % 3 - 1) * 34;
        citadelBeam(items, [x, y, z], [x, y, z + 19], '#6b9baa', .025, .28);
      }
      for (const q of e.particles) items.push(citadelItem('octa', q.pos, [q.size, q.size, q.size], q.color, 1, SPACE_IDENTITY, Math.min(1, q.life / q.max)));
    }
    for (const b of [...e.bullets,...e.hostile]) items.push(citadelItem('box', b.pos, [.08, .08, 3.8], b.color, 1, spaceBasisDir(b.vel)));
    items.push(...shipMeshes(s.leader, time, fx), ...shipMeshes(p, time, fx, true));
    return items;
  };
  function danger(e) {
    const s = e.pursuit, p = e.player.pos;
    return e.asteroids.filter(a => !a.dead && !a.contact && a.passAt > s.clock && a.passAt - s.clock < 3.3)
      .map(a => ({ rock: a, eta: a.passAt - s.clock,
        miss: Math.hypot(p[0] + s.velocity[0] * Math.min(1, a.passAt - s.clock) - a.pos[0],
          p[1] + s.velocity[1] * Math.min(1, a.passAt - s.clock) - a.pos[1]) }))
      .filter(a => a.miss < a.rock.r + 5).sort((a, b) => a.eta - b.eta)[0] || null;
  }
  // CSS-pixel rectangles for the outer comic / caption compositor. The caller
  // supplies CSS dimensions, just like the HUD after its DPR transform.
  function hudBounds(e, cam, W, H) {
    if (!active(e) || !cam) return [];
    const width = Math.min(480, W - 20), target = spaceProject(e.pursuit.leader.pos, cam, W, H);
    const aim = spaceProject([e.player.pos[0], e.player.pos[1], e.pursuit.leader.pos[2]], cam, W, H);
    const boxes = [{ x: (W - width) / 2, y: 10, width, height: 94, kind: 'hud' }];
    if (target.z > 0 && aim.z > 0) {
      const radius = Math.min(86, (linkRadius(e)) * aim.scale);
      const left = arcadeClamp(Math.min(aim.x - radius - 12, target.x - 55), 0, W);
      const top = arcadeClamp(Math.min(aim.y - radius - 12, target.y - 45), 0, H);
      const right = arcadeClamp(Math.max(aim.x + radius + 12, target.x + 55), 0, W);
      const bottom = arcadeClamp(Math.max(aim.y + radius + 12, target.y + 35), 0, H);
      boxes.push({ x: left, y: top, width: right - left, height: bottom - top, kind: 'target' });
    }
    return boxes;
  }
  function channel(e) {
    if(!active(e)||!e.pursuit.link.connected||!['playing','paused'].includes(e.status))return null;
    return globalThis.CITADEL_PURSUIT_VIEW?.channelEndpoints?.(e)||{from:V3.add(e.player.pos,[0,1.6,-3]),to:V3.add(e.pursuit.leader.pos,[0,1.1,5]),phase:e.pursuit.clock};
  }
  function drawChannel(ctx,e,cam,W,H) {
    const c=channel(e);if(!c)return;
    const a=spaceProject(c.from,cam,W,H),b=spaceProject(c.to,cam,W,H);
    if(a.z<=0||b.z<=0)return;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<4)return;
    const nx=-dy/len,ny=dx/len,width=Math.min(13,Math.max(6,W*.011)),bend=Math.sin(c.phase*1.3)*width*.5;
    const cx=(a.x+b.x)/2+nx*bend,cy=(a.y+b.y)/2+ny*bend;
    ctx.save();
    const grad=ctx.createLinearGradient(a.x,a.y,b.x,b.y);grad.addColorStop(0,'#55e8ff18');grad.addColorStop(.48,'#7bf8e34d');grad.addColorStop(1,'#a2ffee24');
    ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(a.x+nx*width,a.y+ny*width);ctx.quadraticCurveTo(cx+nx*width*.8,cy+ny*width*.8,b.x+nx*3,b.y+ny*3);
    ctx.lineTo(b.x-nx*3,b.y-ny*3);ctx.quadraticCurveTo(cx-nx*width*.8,cy-ny*width*.8,a.x-nx*width,a.y-ny*width);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#88f5ecb0';ctx.lineWidth=1;ctx.setLineDash([4,7]);ctx.lineDashOffset=c.phase*24;
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(a.x+nx*width*side,a.y+ny*width*side);ctx.quadraticCurveTo(cx+nx*width*.8*side,cy+ny*width*.8*side,b.x+nx*3*side,b.y+ny*3*side);ctx.stroke();}
    ctx.setLineDash([]);
    for(let i=0;i<5;i++){
      const t=1-((c.phase*.6+i/5)%1),v=1-t,x=v*v*a.x+2*v*t*cx+t*t*b.x,y=v*v*a.y+2*v*t*cy+t*t*b.y,r=2.3+v*2;
      ctx.fillStyle='#b7fff1';ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();
    }
    for(const q of [a,b]){ctx.strokeStyle='#a3fff0';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(q.x,q.y,5+Math.sin(c.phase*5)*1.5,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function hud(ctx,e,cam,w,h) {
    ctx.clearRect(0,0,w,h);if(!['playing','paused'].includes(e.status))return;
    const rect=ARCADE.canvas?.getBoundingClientRect?.(),scale=rect?.width?w/rect.width:1,W=w/scale,H=h/scale,s=e.pursuit,stage=stageOf(e);
    const connected=s.link.connected,color=connected?'#a5f6dc':s.linkJammed?'#d9b1ff':'#ffd299',width=Math.min(480,W-20),x=(W-width)/2,top=10;
    ctx.save();ctx.scale(scale,scale);ctx.textBaseline='middle';drawChannel(ctx,e,cam,W,H);
    ctx.fillStyle='#071624ef';ctx.fillRect(x,top,width,94);ctx.strokeStyle='#7aacbc66';ctx.lineWidth=1;ctx.strokeRect(x+.5,top+.5,width-1,93);
    ctx.font='bold 12px Arial';ctx.textAlign='left';ctx.fillStyle='#e7f5f4';ctx.fillText((s.chapter+1)+'/3 · '+stage.name.toUpperCase(),x+10,top+15,width-110);
    ctx.textAlign='right';ctx.font='11px Arial';ctx.fillStyle='#bcd0d8';ctx.fillText('Щит '+Math.ceil(e.player.hp)+' · '+Math.round(s.speed)+' м/с',x+width-10,top+15);
    const piece=(width-28)/3;
    for(let i=0;i<3;i++){
      const left=x+10+i*(piece+4);ctx.fillStyle='#263e4c';ctx.fillRect(left,top+31,piece,7);
      ctx.fillStyle=i<s.chapter?'#69caa6':i===s.chapter?color:'#597286';ctx.fillRect(left,top+31,piece*Math.min(1,s.packets[i]/packetSeconds(e,i)),7);
    }
    ctx.textAlign='left';ctx.fillStyle=color;ctx.font='11px Arial';
    const messages={acquiring:'Захват канала… '+Math.floor(s.lockTime/RULES.acquisition*100)+'%',jammed:'ПОМЕХА · сбейте фиолетовый глушитель',obstructed:'Заграждение перекрыло канал',occluded:'Астероид перекрыл канал',recovering:'Восстановление после удара',range:'Дистанция велика · тяга догоняет ФЗ','off-course':'Следуйте за ФЗ · канал потерян'};
    ctx.fillText(connected?'КАНАЛ УСТАНОВЛЕН · передача '+Math.floor(s.progress)+'%':messages[s.link.reason]||'Приблизьтесь к ФЗ',x+10,top+54,width-20);
    const completed=Math.min(stage.gates,s.stageGates[s.chapter]),waiting=s.packets[s.chapter]>=packetSeconds(e,s.chapter)&&completed<stage.gates;
    ctx.fillStyle='#b7cbd7';ctx.fillText('Ворота '+completed+'/'+stage.gates+' · '+(waiting?'Завершите пролёт':s.burst>.3?'ФЗ УСКОРЯЕТСЯ':e.enemies.length?'По вам стреляют · ОГОНЬ / РАКЕТА':'Следуйте через светящиеся проёмы'),x+10,top+78,width-20);
    const q=spaceProject(s.leader.pos,cam,W,H),aim=spaceProject([e.player.pos[0],e.player.pos[1],s.leader.pos[2]],cam,W,H);
    if(aim.z>0){ctx.strokeStyle=color+'66';ctx.lineWidth=1.1;ctx.setLineDash([4,7]);ctx.beginPath();ctx.arc(aim.x,aim.y,Math.min(86,linkRadius(e)*aim.scale),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(q.z>0){ctx.textAlign='center';ctx.font='bold 12px Arial';ctx.fillStyle='#ffe4b5';ctx.strokeStyle='#071624';ctx.lineWidth=4;
      const lx=arcadeClamp(q.x,30,W-30),ly=arcadeClamp(q.y-24,120,H-30);ctx.strokeText('ФЗ',lx,ly);ctx.fillText('ФЗ',lx,ly);}
    const gate=s.gates.find(g=>!g.crossed&&g.distance>s.travel&&g.distance-s.travel<s.speed*4);
    if(gate&&e.assist){const o=gateOpening(e,gate),q=spaceProject([o.x,o.y+o.hy,gate.pos[2]],cam,W,H);
      if(q.z>0){ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.fillStyle='#b6f5ff';ctx.strokeStyle='#071624';ctx.lineWidth=3;
        const label=(gate.kind==='shutter'?'ПОДВИЖНЫЙ ПРОЁМ':'ПРОЛЁТ')+' · '+((gate.distance-s.travel)/s.speed).toFixed(1)+' с',xx=arcadeClamp(q.x,90,W-90),yy=arcadeClamp(q.y-12,118,H-26);ctx.strokeText(label,xx,yy);ctx.fillText(label,xx,yy);}}
    for(const enemy of e.enemies){
      if(enemy.dead)continue;const q=spaceProject(enemy.pos,cam,W,H);if(q.z<=0||q.x<10||q.x>W-10||q.y<112||q.y>H-20)continue;
      const r=arcadeClamp(enemy.r*q.scale+7,10,32);ctx.strokeStyle=enemy.role==='jammer'?'#d8b1ff':'#ffb4a5';ctx.lineWidth=1;
      ctx.strokeRect(q.x-r,q.y-r,r*2,r*2);ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(q.x-r,q.y+r+4,r*2*enemy.hp/enemy.maxHp,3);
      if(enemy.role==='jammer'){ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('ГЛУШИТЕЛЬ',q.x,Math.max(115,q.y-r-9));}
    }
    const warning=e.assist?danger(e):null;if(warning){const q=spaceProject(warning.rock.pos,cam,W,H);if(q.z>0&&q.y>112&&q.y<H){ctx.strokeStyle='#ffb88a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,Math.min(80,warning.rock.r*q.scale+6),0,Math.PI*2);ctx.stroke();}}
    if(e.flash>0){ctx.strokeStyle='rgba(255,120,84,'+Math.min(.6,e.flash*2)+')';ctx.lineWidth=6;ctx.strokeRect(3,3,W-6,H-6);}
    ctx.restore();
  }
  drawFlightHUD = function (ctx, e, cam, w, h) {
    if (!active(e)) return before.flightHUD(ctx, e, cam, w, h);
    return hud(ctx, e, cam, w, h);
  };
  drawCampaignFlightHUD = function (...args) { if (!active(args[1])) return before.campaignHUD.apply(this, args); };
  drawClarityHUD = function (...args) { if (!active(args[1])) return before.clarityHUD.apply(this, args); };
  drawMobileGameHUD = function (ctx, e, cam, w, h) {
    if (!active(e)) return before.mobileHUD(ctx, e, cam, w, h);
    return hud(ctx, e, cam, w, h);
  };
  updateArcadeHUD = function (...args) {
    const result = before.updateHUD.apply(this, args), e = ARCADE.engine;
    document.querySelector('.arcade-layout')?.classList.toggle('pursuit-layout',active(e));
    if (!active(e)) return result;
    const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    set('arcade-mission-title', 'ФЗ уходит со связи');
    set('arcade-mission-brief', 'Три пакета · круглые пролёты · эскадрильи и сущности Варпа. Огонь по кораблям, обход монстров.');
    set('citadel-objective-phase', 'ПОГОНЯ · ЭТАП '+(e.pursuit.chapter+1)+'/3');
    set('citadel-primary', e.autopilot ? 'Ручное управление' : 'Помощь в погоне');
    set('mobile-crystal', 'Следовать за ФЗ');
    set('citadel-threat-count', 'ЗАГРУЗКА ' + Math.floor(e.pursuit.progress) + '%');
    const routeNode = document.getElementById('citadel-route');
    if (routeNode) routeNode.innerHTML = '<span>04 · ПОГОНЯ ЗА ФЗ</span><span>ТРЕБОВАНИЯ <b>' + Math.floor(e.pursuit.progress) + '%</b></span><span>КАНАЛ · ВОРОТА · ОГОНЬ</span>';
    return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine;
    if (!active(e) || e.status !== 'briefing') return before.overlay.apply(this, args);
    const controls = isMobileLayout() ? 'Обычный джойстик: в стороны, вверх и вниз.' : 'Обычное управление: WASD, стрелки или мышь.';
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 04 · ПОГОНЯ</span>' +
      '<h3>ФЗ уходит со связи</h3><p>ФЗ уносит три пакета требований. Пройдите <b>три этапа</b>: захват сигнала, канал под огнём и последний рывок до <b>100%</b>.</p>' +
      '<div class="brief-command"><span class="crystal-symbol">↗</span><div><b>Пролетайте внутри колец и обходите Варп</b><small>' + controls + ' ФЗ ускоряется и резко меняет курс. Молоты и щупальца Варпа неуязвимы: обходите их. Тяга подстраивается сама.</small></div></div>' +
      '<div class="brief-command"><span class="crystal-symbol">◉</span><div><b>Голубой канал — передача данных</b><small>После захвата связи между кораблями виден поток пакетов. Канал исчез — передача остановилась. Полученные данные сохраняются.</small></div></div>' +
      '<div class="brief-command"><span class="crystal-symbol">✦</span><div><b>Перехватчиков нужно сбивать</b><small>Пробел, левая кнопка мыши или кнопка огня. Правая кнопка мыши — ракеты. Перехватчики стреляют по вашему кораблю и снимают щит. ФЗ не получает урон. Фиолетовый глушитель мешает связи.</small></div></div>' +
      '<p>После полной загрузки спокойно сверим решения и вернёмся в Цитадель.</p>' +
      '<button class="arcade-play" data-action="citadel-launch">В ПОГОНЮ ↗</button></div>';
  };

  function upgrade(e){
    const s=e.pursuit;if(!s||s.version!=='2.1.0')return false;
    s.version=VERSION;s.migrated=true;s.previousVersion='2.1.0';
    s.warpEntities=[];s.nextWarp=0;s.nextWarpDistance=s.travel+1000;s.warpContacts=0;s.warpSpawned=0;
    s.evasion={next:s.clock+8.5,index:0,until:0,phase:0,offset:[0,0],active:false};s.maneuvers=0;s.lastTaunt=null;
    for(const x of e.enemies.filter(x=>x.pursuitEnemy)){x.pos[2]=Math.min(x.pos[2],e.player.pos[2]-48);x.volleys=0;if(!e.assist)x.telegraph=0;}
    // In-flight gates intentionally remain legacy geometry until crossed.
    sync(e);return true;
  }
  if (typeof CUP_ENGINE_KEYS !== 'undefined' && !CUP_ENGINE_KEYS.includes('pursuit')) CUP_ENGINE_KEYS.push('pursuit');
  if (typeof CUP_LEVELS !== 'undefined') CUP_LEVELS[3] = 'ФЗ уходит со связи';
  if (typeof cupUnpack === 'function') {
    const unpack = cupUnpack;
    cupUnpack = function (...args) {
      const e = unpack.apply(this, args);
      if (e.stage !== 1 || e.finale || !['orientation', 'battle', 'retrieve', 'pursuit'].includes(e.phase)) return e;
      if(e.pursuit?.version==='2.1.0')upgrade(e);
      if (loaded(e)) {
        if (active(e)) sync(e);
      } else if (['briefing', 'playing', 'paused', 'lesson'].includes(e.status)) initialize(e, true);
      return e;
    };
  }
  globalThis.CITADEL_PURSUIT = Object.freeze({ version: VERSION, active, flight: active, count, linkEligible, carrierMeshes, hudBounds,
    rules: RULES, rulesRevision:RULES_REVISION, warpKinds:WARP_KINDS, warpNames:WARP_NAMES, stages: STAGES, channel, gateOpening, gateParts, gateHit, warpHit, warpParts, warpEntities:e=>e.pursuit?.warpEntities||[], navigationPoint,
    carriers: e => loaded(e) ? e.pursuit.carriers.map(c => ({ id: c.id, reqId: c.reqId, profile: c.profile,
      pos: c.pos.slice(), shield: 0, open: true, escaped: false, delivered: c.delivered,
      transfer: c.transfer, transferTime: 1 })) : [],
    inspection: e => loaded(e) ? { version: VERSION, active: active(e), state: e.pursuit.state,
      clock: e.pursuit.clock, chapter: e.pursuit.chapter+1, stageHistory: e.pursuit.stageHistory.map(x=>({...x})), packets: e.pursuit.packets.slice(), stageGates: e.pursuit.stageGates.slice(), warpSpawned:e.pursuit.warpSpawned,warpContacts:e.pursuit.warpContacts,maneuvers:e.pursuit.maneuvers,shotsOpened:e.pursuit.shotsOpened,kills: e.pursuit.kills, jammersDestroyed: e.pursuit.jammersDestroyed, gatesPassed: e.pursuit.gatesPassed, gatesMissed: e.pursuit.gatesMissed, gateCollisions: e.pursuit.gateCollisions, enemiesSpawned: e.pursuit.enemiesSpawned, progress: e.pursuit.progress, uploaded: e.pursuit.uploaded,
      requiredSeconds: e.pursuit.requiredSeconds, leader: e.pursuit.leader.pos.slice(),
      player: e.player.pos.slice(), speed: e.player.speed, link: { ...e.pursuit.link },
      requirements: count(e), decisions: e.decisions.filter(d => d.stage === 1).length,
      collisions: e.pursuit.collisions, rocksDestroyed: e.pursuit.rocksDestroyed,
      asteroids: e.asteroids.map(a => ({ id: a.id, pos: a.pos.slice(), r: a.r, wall: a.wall,
        eta: a.passAt - e.pursuit.clock, spawnedAt: a.spawnedAt, contact: a.contact, dead: a.dead })) } : null,
  });
})();
