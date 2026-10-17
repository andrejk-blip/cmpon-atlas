/* «Цитадель ЦСИИ» · МРГ 1.6.0
   Manual fire, mixed reinforcement batches and a physical tentacle sweep. Shared by game and lab.
   Load after the core and its checkpoint/metrics hooks. State remains plain JSON. */
(() => {
  'use strict';
  if (typeof RequirementArcade === 'undefined' || globalThis.CITADEL_MRG?.version === '1.6.0') return;
  const VERSION = '1.6.0';
  const waves = Object.freeze([
    {index:0,title:'Периметр МРГ',damageMultiplier:1,batches:1,soldiers:3,soldierHp:144,assistSoldierHp:116,platformLabel:'Горизонтальный ход',color:'#ffa86c'},
    {index:1,title:'Подвижный контур',damageMultiplier:2,batches:2,soldiers:6,soldierHp:288,assistSoldierHp:232,platformLabel:'Вертикальные лифты',color:'#d7a1ff'},
    {index:2,title:'Последний рубеж',damageMultiplier:4,batches:3,soldiers:9,soldierHp:576,assistSoldierHp:464,platformLabel:'Смешанный ход',color:'#ff859b'}
  ].map(Object.freeze));
  const roles = Object.freeze(['jumper','knife','rocketeer']);
  const BATCH_INTERVAL = 7;
  const tentacleSpec = Object.freeze({safeX:-24,warning:5.2,active:2.5,retract:.7,idle:5.6,damage:18});
  const attacks = Object.freeze([
    {title:'ВОЛНА — ПРЫГАЙ',detail:'Разряд идёт по полу. Перепрыгни или поднимись на платформу.',color:'#ffb572',damage:16},
    {title:'ВЕЕР — ДВИГАЙСЯ',detail:'Заряды летят веером. Смещайся между ними; затем бей в открытое ядро.',color:'#cbabff',damage:10},
    {title:'ЛУЧ — СМЕНИ ВЫСОТУ',detail:'Высота луча зафиксирована. Прыгни или спустись с платформы.',color:'#ff8eaf',damage:22}
  ].map(Object.freeze));
  const bounds = Object.freeze({minX:13,maxX:19,minY:-2,maxY:20});
  const layout = [
    {id:'floor',lo:-35,hi:22,y:1}, {id:'left',lo:-18,hi:-9,y:5},
    {id:'middle',lo:-3,hi:6,y:7}, {id:'right',lo:9,hi:16,y:4}
  ];
  const proto = RequirementArcade.prototype;
  const old = {begin:proto.beginMRG,step:proto.stepMRG,grenade:proto.mrgGrenade,damage:proto.mrgDamage,objective:proto.objective,upload:proto.beginUpload,
    aim:typeof citadelBoardAim==='function'?citadelBoardAim:null};
  const starting = new WeakSet();
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const alive = enemy => !enemy.dead && enemy.hp > 0;
  const liveEnemies = e => e.board.enemies.filter(alive);
  const targetPos = enemy => V3.add(enemy.pos,[0,.65,0]);
  const threshold = f => f.mrg.maxHp * (2 - f.waveIndex) / 3;
  const waveCleared = e => e.finale.pendingSoldiers===0 && liveEnemies(e).length===0;
  // The deck helper intersects Y=0. The side-view arena instead lives on Z=0.
  // Keep the existing pointer listeners and every other stage's projection.
  if(old.aim)citadelBoardAim=function(clientX,clientY,canvas,cam) {
    if(typeof ARCADE==='undefined'||ARCADE.engine?.finale?.phase!=='mrg')return old.aim.apply(this,arguments);
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height||!cam)return null;
    const nx=(clientX-rect.left)/rect.width*2-1,ny=1-(clientY-rect.top)/rect.height*2;
    const ray=V3.norm(V3.add(cam.f,V3.add(V3.scale(cam.r,nx*rect.width/rect.height*Math.tan(cam.fov/2)),V3.scale(cam.u,ny*Math.tan(cam.fov/2)))));
    if(Math.abs(ray[2])<.000001)return null;
    const t=-cam.pos[2]/ray[2];
    if(t<=0)return null;
    const point=V3.add(cam.pos,V3.scale(ray,t));return [point[0],point[1],0];
  };
  function initPlatforms(f) {
    f.arenaPlatforms = layout.map(p => ({...p,previousLo:p.lo,previousHi:p.hi,previousY:p.y,moving:false}));
  }
  function spawnBatch(e) {
    const f=e.finale,b=e.board,w=waves[f.waveIndex],batch=f.spawnedBatches;
    if(batch>=f.totalBatches)return false;
    for(let slot=0;slot<3;slot++) {
      const i=batch*3+slot,hp=e.assist?w.assistSoldierHp:w.soldierHp,pos=[17.5+slot*.65,1,0];
      b.enemies.push({id:'mrg-'+f.waveIndex+'-'+i,role:roles[slot],archetype:['scout','hunter','shield'][slot],
        batchIndex:batch,state:'emerging',pos,previous:pos.slice(),hp,maxHp:hp,hit:0,dead:false,
        spawnTime:1.65+slot*.42,emergeDelay:slot*.32,facing:-1,fireFX:0,vx:0,vy:0,grounded:true,
        name:i===0?['TV','BS','SH'][f.waveIndex]:'',beard:i===0&&f.waveIndex===2,
        cooldown:1.2+slot*.3,jumpCooldown:.9,jumpPhase:'grounded',supportId:'floor',
        knifePhase:'idle',knifeTime:0,knifeDuration:0,knifeFrom:null,knifeTo:null,knifeHit:false,
        rocketPhase:'idle',rocketTime:0,rocketTarget:null,radius:.8,color:w.color,score:180+f.waveIndex*60});
    }
    f.spawnedBatches++;f.batchIndex=batch;
    f.pendingSoldiers=(f.totalBatches-f.spawnedBatches)*3;
    f.batchTimer=f.pendingSoldiers?BATCH_INTERVAL:0;
    return true;
  }
  function initTentacle(f) {
    f.tentacle={phase:'idle',time:9,duration:9,safeX:tentacleSpec.safeX,
      bounds:{minX:tentacleSpec.safeX,maxX:20,minY:-2,maxY:22},
      segments:[0,4,8,12,16,20].map(y=>({from:[17,y,0],to:[tentacleSpec.safeX,y,0],radius:2.1}))};
  }
  function setWave(e,index,{quiet=false,spawn=true}={}) {
    const f=e.finale,b=e.board,w=waves[index];
    Object.assign(f,{arenaVersion:VERSION,waveIndex:index,waveDamageMultiplier:w.damageMultiplier,
      waveTitle:w.title,platformLabel:w.platformLabel,waveSoldiersTotal:w.soldiers,
      totalBatches:w.batches,spawnedBatches:0,batchIndex:-1,pendingSoldiers:w.soldiers,batchTimer:0,
      waveGateReached:false,waveIntro:2.2,waveTime:0,telegraph:0,pattern:-1,
      attackClock:1.2,exposedFor:0,open:false,beamTime:0,phaseFlash:1});
    f.mrg.stage=index;
    b.hostile=[];b.bullets=[];b.enemies=[];f.soldierSparks=[];f.rocketBlasts=[];
    initTentacle(f);
    if(spawn)spawnBatch(e);
    if(!quiet)e.say('Волна '+(index+1)+' из трёх. Пачек: '+w.batches+'. В каждой — прыгун, ножевой боец и ракетчик. HP солдат '+(e.assist?w.assistSoldierHp:w.soldierHp)+'. Урон ×'+w.damageMultiplier+'.','order',true);
  }
  function ensureArena(e) {
    const f=e?.finale,b=e?.board;
    if(!f||f.phase!=='mrg'||!b||!f.mrg||starting.has(e))return false;
    if(f.arenaVersion===VERSION&&Array.isArray(f.arenaPlatforms)&&f.arenaPlatforms.length===4&&
       Number.isInteger(f.waveIndex)&&f.waveIndex>=0&&f.waveIndex<3&&f.tentacle&&Number.isInteger(f.spawnedBatches))return true;
    // Cloud snapshots may bypass beginMRG. Migrate the live checkpoint in place;
    // do not replay a campaign transition, award points, or reset health/position.
    const prior=Array.isArray(b.enemies)?b.enemies.slice():[];
    // At an exact third, retain the wave whose soldiers are still guarding it.
    const hpIndex=clamp(Math.ceil((1-f.mrg.hp/f.mrg.maxHp)*3-1e-8)-1,0,2);
    const savedIndex=Number.isInteger(f.waveIndex)?f.waveIndex:Number.isInteger(f.mrg.stage)?f.mrg.stage:hpIndex;
    const index=clamp(Math.max(savedIndex,hpIndex),0,2);
    if(!prior.length&&f.defeatTime>0)for(let i=0;i<(f.waveSoldiersTotal||0);i++)prior.push({hp:0,maxHp:1,dead:true});
    if(!Array.isArray(f.arenaPlatforms)||f.arenaPlatforms.length!==4)initPlatforms(f);
    else for(const p of f.arenaPlatforms){p.previousLo=p.lo;p.previousHi=p.hi;p.previousY=p.y;p.moving=false;}
    Object.assign(b,{jumpBuffer:b.jumpBuffer||0,coyote:b.grounded?.12:0,dropTimer:b.dropTimer||0,
      jumpHeld:!!b.jumpHeld,dropHeld:!!b.dropHeld,jumpFX:0,landFX:0,knockbackX:b.knockbackX||0,facing:b.facing||1,supportId:b.supportId||null,
      manualAim:false,aimPoint:null,aimDir:[b.facing||1,0,0]});
    b.previous=b.pos.slice();b.vy=b.vy||0;b.vx=b.vx||0;
    setWave(e,index,{quiet:true,spawn:false});
    const batches=Math.min(f.totalBatches,Math.max(1,Math.ceil(prior.length/3)));
    for(let i=0;i<batches;i++)spawnBatch(e);
    for(let i=0;i<Math.min(prior.length,b.enemies.length);i++) {
      const saved=prior[i],enemy=b.enemies[i],ratio=clamp((Number(saved.hp)||0)/(Number(saved.maxHp)||1),0,1);
      enemy.dead=!!saved.dead||ratio<=0;enemy.hp=enemy.dead?0:enemy.maxHp*ratio;
      enemy.state=enemy.dead?'dead':'active';enemy.spawnTime=0;enemy.emergeDelay=0;
      if(Array.isArray(saved.pos)&&saved.pos.every(Number.isFinite)){enemy.pos=[saved.pos[0],saved.pos[1],0];enemy.previous=enemy.pos.slice();}
      enemy.supportId=saved.supportId||null;enemy.grounded=!!saved.grounded||f.arenaPlatforms.some(p=>enemy.pos[0]>=p.lo&&enemy.pos[0]<=p.hi&&Math.abs(enemy.pos[1]-p.y)<.12);
      enemy.vy=Number(saved.vy)||0;enemy.facing=saved.facing===1?1:-1;
    }
    // A saved MRG fight must still clear the new roster. Completed upload/victory
    // checkpoints never enter this migration and keep their original semantics.
    f.defeatTime=0;f.waveGateReached=f.mrg.hp<=threshold(f)+.00001;
    return true;
  }
  proto.beginMRG = function (...args) {
    // Keep current wrappers (cupHook, metrics and checkpoint recording).
    starting.add(this);
    let result;
    try { result=old.begin.apply(this,args); } finally { starting.delete(this); }
    const f=this.finale,b=this.board;
    if(f?.phase!=='mrg'||!b)return result;
    initPlatforms(f);
    Object.assign(b,{vx:0,vy:0,grounded:true,jumpHeld:false,jumpBuffer:0,coyote:.12,
      dropHeld:false,dropTimer:0,jumpFX:0,landFX:0,landAt:[-25,0,0],guideJumpUntil:0,
      grenadeCooldown:0,knockbackX:0,facing:1,supportId:'floor',manualAim:false,aimPoint:null,aimDir:[1,0,0]});
    Object.assign(f,{defeatTime:0,shellOpen:0,arenaVersion:VERSION});
    setWave(this,0);
    return result;
  };
  function movePlatforms(f,dt) {
    for(let i=0;i<f.arenaPlatforms.length;i++) {
      const p=f.arenaPlatforms[i],base=layout[i];
      p.previousLo=p.lo;p.previousHi=p.hi;p.previousY=p.y;
      if(i===0){p.moving=false;continue;}
      let x=0,y=0;
      const t=f.time,phase=i*1.55;
      if(f.waveIndex===0)x=Math.sin(t*.55+phase)*(i===3?1.4:3.1);
      else if(f.waveIndex===1)y=Math.sin(t*.65+phase)*(i===2?2.2:1.8);
      else {x=Math.sin(t*.73+phase)*(i%2?3.3:-3.3);y=Math.sin(t*.52+phase)*1.8;}
      // New wave modes approach their new path; positions never jump on a gate.
      const dx=clamp(base.lo+x-p.lo,-3.4*dt,3.4*dt);
      p.lo+=dx;p.hi+=dx;p.y+=clamp(base.y+y-p.y,-2.6*dt,2.6*dt);
      p.moving=Math.abs(dx)+Math.abs(p.y-p.previousY)>.00001;
    }
  }
  function carryPlayer(b,platforms) {
    if(!b.grounded)return null;
    const p=platforms.find(p=>Math.abs(b.pos[1]-p.previousY)<.12&&b.pos[0]>=p.previousLo-.01&&b.pos[0]<=p.previousHi+.01);
    if(p){b.pos[0]+=p.lo-p.previousLo;b.pos[1]+=p.y-p.previousY;b.supportId=p.id;}
    else b.supportId=null;
    return p;
  }
  function movePlayer(e,dt,input,defeated=false) {
    const f=e.finale,b=e.board,platforms=f.arenaPlatforms;
    b.previous=b.pos.slice();const support=carryPlayer(b,platforms);
    let dx=defeated?0:clamp(input.moveX||0,-1,1);
    let jump=!defeated&&(!!input.jump||(input.moveZ||0)<-.4||!!input.boost);
    let drop=!defeated&&(input.moveZ||0)>.5;
    if(b.guide&&!defeated) {
      const retreat=['telegraph','active'].includes(f.tentacle.phase);
      const desired=retreat?-28:-15+Math.sin(f.time*.62)*9;
      dx=clamp((desired-b.pos[0])*.7,-1,1);drop=false;
      const threat=b.hostile.some(s=>Math.abs(s.pos[0]-b.pos[0])<11&&Math.abs(s.pos[1]-b.pos[1]-.5)<2.8);
      const beam=f.pattern===2&&f.telegraph>0&&f.telegraph<.55;
      if(b.grounded&&(threat||beam))b.guideJumpUntil=b.time+.4;
      jump=b.time<(b.guideJumpUntil||0);
    }
    b.knockbackX=(b.knockbackX||0)*Math.exp(-dt*8);
    b.vx=dx*10+b.knockbackX;b.pos[0]=clamp(b.pos[0]+b.vx*dt,-32,20);
    if(Math.abs(dx)>.05)b.facing=dx>0?1:-1;
    b.jumpBuffer=jump&&!b.jumpHeld?.16:Math.max(0,(b.jumpBuffer||0)-dt);
    b.coyote=b.grounded?.12:Math.max(0,(b.coyote||0)-dt);
    if(drop&&!b.dropHeld&&b.grounded&&b.pos[1]>1.1){b.dropTimer=.22;b.pos[1]-=.08;b.vy=-4;b.grounded=false;b.coyote=0;b.jumpBuffer=0;b.supportId=null;}
    b.dropHeld=drop;
    if(b.jumpBuffer>0&&b.coyote>0&&!b.dropTimer){b.vy=22.4;b.grounded=false;b.coyote=0;b.jumpBuffer=0;b.jumpFX=.26;b.jumpAt=[b.pos[0],b.pos[1]-1,0];b.supportId=null;e.emit('flip');}
    if(!jump&&b.jumpHeld&&b.vy>0)b.vy*=.5;
    b.jumpHeld=jump;
    const oldY=b.pos[1],impact=b.vy,wasGrounded=b.grounded;
    b.vy-=36*dt;b.pos[1]+=b.vy*dt;b.grounded=false;
    let surface=null;
    for(const p of platforms) {
      const previousY=support===p?p.y:p.previousY;
      if(b.pos[0]>=p.lo&&b.pos[0]<=p.hi&&b.vy<=0&&oldY>=previousY-.001&&b.pos[1]<=p.y&&
        (!b.dropTimer||p.id==='floor')&&(!surface||p.y>surface.y))surface=p;
    }
    if(surface){b.pos[1]=surface.y;b.vy=0;b.grounded=true;b.supportId=surface.id;}
    if(b.pos[1]<1){b.pos[1]=1;b.vy=0;b.grounded=true;b.supportId='floor';}
    if(!b.grounded)b.supportId=null;
    if(b.grounded&&!wasGrounded&&impact<-3){b.landFX=.28;b.landAt=[b.pos[0],b.pos[1]-1,0];}
  }
  function updateAim(b,input) {
    const point=input.aim;
    if(Array.isArray(point)&&Number.isFinite(point[0])&&Number.isFinite(point[1])) {
      const delta=[point[0]-b.pos[0],point[1]-b.pos[1]-.6,0];
      if(V3.len(delta)>.05) {
        b.aimDir=V3.norm(delta);b.manualAim=true;b.aimPoint=[point[0],point[1],0];
        if(Math.abs(b.aimDir[0])>.05)b.facing=b.aimDir[0]>0?1:-1;
        return;
      }
    }
    b.manualAim=false;b.aimPoint=null;b.aimDir=[b.facing||1,0,0];
  }
  const muzzle = b => V3.add(b.pos,[b.aimDir[0]*.8,.6+b.aimDir[1]*.8,0]);
  proto.mrgGrenade = function () {
    if(this.finale?.phase!=='mrg')return old.grenade.apply(this,arguments);
    if(!ensureArena(this)||this.status!=='boarding'||this.player.missiles<=0||this.board.grenadeCooldown>0||this.finale.defeatTime>0)return false;
    const b=this.board,pos=muzzle(b);
    this.player.missiles--;b.grenadeCooldown=1.3;
    b.bullets.push({pos,vel:V3.scale(b.aimDir,36),life:3,damage:160,grenade:true});
    this.emit('missile');return true;
  };
  proto.mrgDamage = function (base,source='projectile') {
    if(this.finale?.phase!=='mrg')return old.damage.apply(this,arguments);
    if(!ensureArena(this)||this.status!=='boarding'||this.board.invulnerable>0||this.finale.defeatTime>0)return false;
    const b=this.board,mult=this.finale.waveDamageMultiplier;
    const damage=Math.max(0,Number(base)||0)*mult*(this.assist?.5:1)*Math.pow(.8,this.upgrades?.armor||0);
    if(!damage)return false;
    b.hp=Math.max(0,b.hp-damage);b.invulnerable=.8;this.flash=.3;this.emit('damage');
    if(source==='contact'){b.knockbackX=-15;b.vy=Math.max(b.vy,7);b.grounded=false;}
    if(b.hp<=0){this.status='lost';this.lossReason='МРГ остановил носитель. Цельтесь вручную, уничтожайте все пачки солдат и уходите в левое укрытие перед щупальцами.';this.emit('state','lost');}
    return true;
  };
  function contactBoss(e) {
    const b=e.board;
    if(b.pos[0]+.7>bounds.minX&&b.pos[0]-.7<bounds.maxX&&b.pos[1]+1>bounds.minY&&b.pos[1]-1<bounds.maxY) {
      e.mrgDamage(18,'contact');
      b.pos[0]=bounds.minX-.72; // solid left tower; prevent tunnelling while shielded.
    }
  }
  function hitSoldier(e,enemy,damage) {
    if(!alive(enemy))return;
    enemy.hp=Math.max(0,enemy.hp-damage);enemy.hit=.17;
    if(enemy.hp===0){enemy.dead=true;enemy.state='dead';enemy.fireFX=0;enemy.knifePhase='idle';enemy.rocketPhase='idle';e.board.kills++;e.totalKills=(e.totalKills||0)+1;e.score+=enemy.score;
      e.finale.soldierSparks.push({pos:targetPos(enemy),life:.65,maxLife:.65,color:enemy.color});e.emit('destroy',enemy.id);}
  }
  function hitCore(e,damage) {
    const f=e.finale,m=f.mrg;
    if(!f.open||m.hp<=0)return;
    m.hp=Math.min(m.hp,Math.max(threshold(f),m.hp-damage));m.hit=.16;
    if(e.board.time-(f.lastCoreSound||0)>.16){f.lastCoreSound=e.board.time;e.emit('destroy','core');}
    f.waveGateReached=m.hp<=threshold(f)+.00001;
  }
  function moveSoldier(enemy,platforms,dt,vx,jump=0) {
    const support=carryPlayer(enemy,platforms),oldY=enemy.pos[1];
    if(jump&&enemy.grounded){enemy.vy=jump;enemy.grounded=false;enemy.supportId=null;}
    enemy.vx=vx;enemy.pos[0]=clamp(enemy.pos[0]+vx*dt,-31.5,19);
    enemy.vy-=32*dt;enemy.pos[1]+=enemy.vy*dt;enemy.grounded=false;
    let surface=null;
    for(const p of platforms)if(enemy.pos[0]>=p.lo&&enemy.pos[0]<=p.hi&&enemy.vy<=0&&
      oldY>=(support===p?p.y:p.previousY)-.001&&enemy.pos[1]<=p.y&&(!surface||p.y>surface.y))surface=p;
    if(surface){enemy.pos[1]=surface.y;enemy.vy=0;enemy.grounded=true;enemy.supportId=surface.id;}
    if(enemy.pos[1]<1){enemy.pos[1]=1;enemy.vy=0;enemy.grounded=true;enemy.supportId='floor';}
    if(!enemy.grounded)enemy.supportId=null;
    enemy.jumpPhase=enemy.grounded?'grounded':enemy.vy>0?'rising':'falling';
  }
  function fireSoldier(e,enemy) {
    const pos=V3.add(enemy.pos,[enemy.facing*.65,.65,0]),target=V3.add(e.board.pos,[0,.55,0]);
    e.board.hostile.push({pos,vel:V3.scale(V3.norm(V3.sub(target,pos)),11+e.finale.waveIndex*1.2),life:5,r:.32,
      damage:10,kind:'bolt',source:'soldier',ownerId:enemy.id,color:enemy.color});
    enemy.fireFX=.12;e.emit('shot');
  }
  function fireRocket(e,enemy) {
    const pos=V3.add(enemy.pos,[enemy.facing*.8,.8,0]),target=enemy.rocketTarget.slice(),delta=V3.sub(target,pos);
    const speed=10+e.finale.waveIndex*.6;
    e.board.hostile.push({pos,vel:V3.scale(V3.norm(delta),speed),life:6,r:.42,damage:16,
      kind:'rocket',source:'rocket',ownerId:enemy.id,color:'#ffd294',blastRadius:3.2,
      target,travelled:0,travelLimit:Math.max(1,V3.len(delta)),trail:[pos.slice()]});
    enemy.fireFX=.18;enemy.rocketPhase='idle';enemy.rocketTime=0;
    enemy.cooldown=(e.assist?4.5:3.9)+enemy.batchIndex*.18;e.emit('missile');
  }
  function updateKnife(e,enemy,dt) {
    if(enemy.knifePhase==='idle') {
      if(Math.abs(e.board.pos[0]-enemy.pos[0])<2.8&&Math.abs(e.board.pos[1]-enemy.pos[1])<2) {
        enemy.knifePhase='windup';enemy.knifeTime=enemy.knifeDuration=.55;enemy.knifeHit=false;
        enemy.facing=e.board.pos[0]>=enemy.pos[0]?1:-1;
      } else return;
    } else {
      enemy.knifeTime=Math.max(0,enemy.knifeTime-dt);
      if(enemy.knifeTime===0) {
        if(enemy.knifePhase==='windup'){enemy.knifePhase='strike';enemy.knifeTime=enemy.knifeDuration=.22;enemy.fireFX=.12;e.emit('shot');}
        else if(enemy.knifePhase==='strike'){enemy.knifePhase='recover';enemy.knifeTime=enemy.knifeDuration=.9;}
        else {enemy.knifePhase='idle';enemy.knifeTime=enemy.knifeDuration=0;}
      }
    }
    enemy.knifeFrom=targetPos(enemy);enemy.knifeTo=V3.add(enemy.knifeFrom,[enemy.facing*2.7,0,0]);
    if(enemy.knifePhase==='strike'&&!enemy.knifeHit&&
      flightSegment(enemy.knifeFrom,enemy.knifeTo,V3.add(e.board.pos,[0,.55,0]),1)!==null) {
      enemy.knifeHit=true;e.mrgDamage(14,'melee');
    }
  }
  function updateSoldiers(e,dt) {
    const f=e.finale,b=e.board;
    if(f.pendingSoldiers>0) {
      f.batchTimer=Math.max(0,f.batchTimer-dt);
      if(f.batchTimer===0){spawnBatch(e);e.say('Из корпуса МРГ выходит пачка '+f.spawnedBatches+' / '+f.totalBatches+'.','alert',true);}
    }
    for(const enemy of b.enemies) {
      enemy.previous=enemy.pos.slice();enemy.hit=Math.max(0,enemy.hit-dt);enemy.fireFX=Math.max(0,enemy.fireFX-dt);
      if(!alive(enemy))continue;
      if(enemy.state==='emerging') {
        enemy.spawnTime=Math.max(0,enemy.spawnTime-dt);enemy.emergeDelay=Math.max(0,enemy.emergeDelay-dt);
        if(enemy.emergeDelay===0){enemy.vx=-4.2;enemy.pos[0]=Math.max(12.1,enemy.pos[0]-4.2*dt);}
        if(enemy.pos[0]<=12.1&&enemy.spawnTime===0){enemy.state='active';enemy.vx=0;enemy.cooldown=Math.max(.8,enemy.cooldown);}
        continue;
      }
      const dx=b.pos[0]-enemy.pos[0],face=dx>=0?1:-1;
      let vx=0,jump=0;
      enemy.cooldown=Math.max(0,enemy.cooldown-dt);enemy.jumpCooldown=Math.max(0,enemy.jumpCooldown-dt);
      if(enemy.role==='jumper') {
        enemy.facing=face;
        vx=enemy.grounded?(Math.abs(dx)>3?face*3.2:0):clamp(dx*.65,-6.1,6.1);
        if(enemy.grounded&&enemy.jumpCooldown===0&&Math.abs(dx)<25){jump=23.2;enemy.jumpCooldown=e.assist?3:2.5;vx=clamp(dx*.65,-6.1,6.1);}
      } else if(enemy.role==='knife') {
        if(enemy.knifePhase==='idle'){enemy.facing=face;vx=Math.abs(dx)>2.3?face*4.6:0;}
      } else if(enemy.rocketPhase==='idle') {
        enemy.facing=face;vx=Math.abs(dx)>18?face*2.6:Math.abs(dx)<10?-face*2.8:0;
      }
      moveSoldier(enemy,f.arenaPlatforms,dt,vx,jump);
      if(f.waveIntro>0)continue;
      if(enemy.role==='jumper') {
        if(enemy.cooldown===0){fireSoldier(e,enemy);enemy.cooldown=e.assist?3.6:3.1;}
        if(!enemy.grounded&&Math.abs(enemy.pos[0]-b.pos[0])<1.3&&Math.abs(enemy.pos[1]-b.pos[1])<1.6)e.mrgDamage(12,'jump');
      } else if(enemy.role==='knife')updateKnife(e,enemy,dt);
      else if(enemy.rocketPhase==='aim') {
        enemy.rocketTime=Math.max(0,enemy.rocketTime-dt);
        if(enemy.rocketTime===0)fireRocket(e,enemy);
      } else if(enemy.cooldown===0) {
        enemy.rocketPhase='aim';enemy.rocketTime=.85;enemy.rocketTarget=V3.add(b.pos,[0,.55,0]);
      }
    }
  }
  function updateTentacle(e,dt) {
    const f=e.finale,t=f.tentacle;
    if(f.waveIntro>0)return;
    t.time=Math.max(0,t.time-dt);
    if(t.time===0) {
      if(t.phase==='idle') {
        t.phase='telegraph';t.time=t.duration=tentacleSpec.warning;
        f.telegraph=0;f.beamTime=0;f.exposedFor=Math.max(f.exposedFor,tentacleSpec.warning+tentacleSpec.active+tentacleSpec.retract);f.open=true;
        e.say('ЩУПАЛЬЦА! Уходите в глубокое левое укрытие. До удара '+tentacleSpec.warning+' секунды.','alert',true);
      } else if(t.phase==='telegraph'){t.phase='active';t.time=t.duration=tentacleSpec.active;e.emit('missile');}
      else if(t.phase==='active'){t.phase='retract';t.time=t.duration=tentacleSpec.retract;}
      else {t.phase='idle';t.time=t.duration=tentacleSpec.idle;}
    }
    // The whole marked rectangle is occupied, including the gaps between limbs.
    // The player's centre at or left of safeX is always outside this attack.
    const b=e.board,z=t.bounds;
    if(t.phase==='active'&&b.pos[0]>t.safeX&&b.pos[0]<=z.maxX+.7&&b.pos[1]+1>=z.minY&&b.pos[1]-1<=z.maxY)e.mrgDamage(tentacleSpec.damage,'tentacle');
  }
  function detonateRocket(e,shot) {
    if(shot.exploded)return;
    shot.exploded=true;shot.life=0;
    e.finale.rocketBlasts.push({pos:shot.pos.slice(),radius:shot.blastRadius,life:.5,maxLife:.5,color:shot.color});
    if(V3.len(V3.sub(V3.add(e.board.pos,[0,.55,0]),shot.pos))<=shot.blastRadius+.65)e.mrgDamage(shot.damage,'rocket');
    e.emit('destroy','rocket');
  }
  function resolveHostile(e,dt) {
    const f=e.finale,b=e.board;
    for(const shot of b.hostile) {
      const from=shot.pos;shot.pos=V3.add(from,V3.scale(shot.vel,dt));shot.life-=dt;
      const contact=flightSegment(from,shot.pos,V3.add(b.pos,[0,.5,0]),shot.r+.7)!==null;
      if(shot.kind==='rocket') {
        shot.travelled+=V3.len(V3.sub(shot.pos,from));shot.trail.push(shot.pos.slice());if(shot.trail.length>9)shot.trail.shift();
        const terrain=f.arenaPlatforms.some(p=>from[1]>=p.y-1&&shot.pos[1]<=p.y-1&&shot.pos[0]>=p.lo&&shot.pos[0]<=p.hi);
        if(contact||terrain||shot.life<=0||shot.travelled>=shot.travelLimit)detonateRocket(e,shot);
      } else if(contact){shot.life=0;e.mrgDamage(shot.damage,shot.source);}
    }
    b.hostile=b.hostile.filter(shot=>shot.life>0);
  }
  function resolvePlayerShots(e,dt) {
    const f=e.finale,b=e.board,m=f.mrg;
    for(const shot of b.bullets) {
      if(shot.life<=0)continue;
      const from=shot.pos;shot.pos=V3.add(from,V3.scale(shot.vel,dt));shot.life-=dt;
      let enemyHit=null,near=Infinity;
      for(const enemy of b.enemies)if(alive(enemy)){const t=flightSegment(from,shot.pos,targetPos(enemy),1.05);if(t!==null&&t<near){near=t;enemyHit=enemy;}}
      const coreT=flightSegment(from,shot.pos,m.pos,3.6),hitsCore=coreT!==null&&coreT<near;
      if(!enemyHit&&!hitsCore&&shot.life>0)continue;
      if(shot.grenade){
        const at=hitsCore?m.pos:enemyHit?targetPos(enemyHit):shot.pos;
        for(const enemy of b.enemies)if(alive(enemy)&&V3.len(V3.sub(targetPos(enemy),at))<=6)hitSoldier(e,enemy,shot.damage);
        if(V3.len(V3.sub(m.pos,at))<=7.5)hitCore(e,shot.damage);
        f.soldierSparks.push({pos:at.slice(),life:.5,maxLife:.5,color:'#ffe1a3'});
        e.emit('destroy','grenade');
      }else if(hitsCore)hitCore(e,shot.damage);
      else if(enemyHit)hitSoldier(e,enemyHit,shot.damage);
      shot.life=0;
    }
    b.bullets=b.bullets.filter(shot=>shot.life>0);
  }
  function advanceGate(e) {
    const f=e.finale,b=e.board;
    f.waveGateReached=f.mrg.hp<=threshold(f)+.00001;
    if(!f.waveGateReached||!waveCleared(e))return;
    if(f.waveIndex<2){const next=f.waveIndex+1;b.hp=Math.min(100,b.hp+18);e.player.missiles+=2;setWave(e,next);e.emit('boss');}
  }
  proto.stepMRG = function (delta,input={}) {
    if(this.finale?.phase!=='mrg')return old.step.call(this,delta,input);
    if(!ensureArena(this)||this.status!=='boarding')return;
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.04);if(!dt)return;
    const f=this.finale,b=this.board,m=f.mrg;
    f.time+=dt;f.waveTime=(f.waveTime||0)+dt;b.time+=dt;this.elapsed+=dt;
    for(const key of ['flash','shake','captainClock'])this[key]=Math.max(0,(this[key]||0)-dt);
    for(const key of ['cooldown','pulseCooldown','invulnerable','grenadeCooldown','jumpFX','landFX','dropTimer'])b[key]=Math.max(0,(b[key]||0)-dt);
    m.hit=Math.max(0,m.hit-dt);f.beamTime=Math.max(0,(f.beamTime||0)-dt);f.phaseFlash=Math.max(0,(f.phaseFlash||0)-dt);
    for(const s of f.soldierSparks)s.life-=dt;f.soldierSparks=f.soldierSparks.filter(s=>s.life>0);
    for(const blast of f.rocketBlasts)blast.life-=dt;f.rocketBlasts=f.rocketBlasts.filter(blast=>blast.life>0);
    movePlatforms(f,dt);
    const victory=m.hp<=0&&waveCleared(this)&&f.waveIndex===2;
    if(victory) {
      if(!(f.defeatTime>0)){f.defeatTime=3;f.open=true;f.telegraph=0;f.beamTime=0;f.tentacle.phase='idle';f.rocketBlasts=[];b.hostile=[];b.bullets=[];b.guide=false;b.vx=0;
        this.say('Все три волны пройдены. МРГ освобождён! Передаём согласованный пакет на исполнение.','success',true);this.emit('boss');}
      f.defeatTime=Math.max(.0001,f.defeatTime-dt);f.shellOpen=Math.min(1,(f.shellOpen||0)+dt*2);
      movePlayer(this,dt,{},true);
      if(f.defeatTime<=.001)this.beginUpload();return;
    }
    f.waveIntro=Math.max(0,f.waveIntro-dt);f.exposedFor=Math.max(0,(f.exposedFor||0)-dt);f.open=f.exposedFor>0;
    movePlayer(this,dt,input);contactBoss(this);if(this.status!=='boarding')return;
    updateAim(b,input);
    const guideDanger=b.guide&&b.hostile.some(s=>Math.abs(s.pos[0]-b.pos[0])<4&&Math.abs(s.pos[1]-b.pos[1]-.5)<2);
    if((input.pulse||guideDanger)&&b.pulseCooldown<=0){b.hostile=[];b.pulseCooldown=7;b.invulnerable=1.6;b.pulseWave=1;this.emit('pulse');}
    b.pulseWave=Math.max(0,(b.pulseWave||0)-dt);
    if(input.missile)this.mrgGrenade();
    if(input.fire&&b.cooldown<=0){
      b.cooldown=.14*Math.pow(.9,this.upgrades?.weapons||0);
      b.bullets.push({pos:muzzle(b),vel:V3.scale(b.aimDir,65),life:1.5,damage:21*(1+.25*(this.upgrades?.weapons||0))});this.emit('shot');
    }
    updateSoldiers(this,dt);
    updateTentacle(this,dt);if(this.status!=='boarding')return;
    if(f.tentacle.phase==='idle'&&f.waveIntro<=0&&!f.open&&f.telegraph<=0){f.attackClock-=dt;
      if(f.attackClock<=0){f.pattern=(f.pattern+1)%3;f.telegraph=this.assist?1.55:1.3;f.aimY=b.pos[1]+.5;this.say(attacks[f.pattern].detail,'alert',true);}}
    if(f.telegraph>0){f.telegraph=Math.max(0,f.telegraph-dt);
      if(f.telegraph===0){
        if(f.pattern===0)b.hostile.push({pos:[21,1.7,0],vel:[-17-f.waveIndex*2,0,0],life:4,wave:true,r:1.4,damage:16,source:'boss',color:'#ffb572'});
        else if(f.pattern===1){const aim=Math.atan2(b.pos[1]+.5-m.pos[1],b.pos[0]-m.pos[0]),count=5+f.waveIndex*2;
          for(let i=0;i<count;i++){const a=aim+(i-(count-1)/2)*.19;b.hostile.push({pos:m.pos.slice(),vel:[Math.cos(a)*(14+f.waveIndex*2),Math.sin(a)*(14+f.waveIndex*2),0],life:5,r:.4,damage:10,source:'boss',color:'#cbabff'});}}
        else f.beamTime=.38;
        f.exposedFor=this.assist?4:3.5;f.open=true;f.attackClock=.7;
      }
    }
    f.shellOpen=(f.shellOpen||0)+((f.open?1:0)-(f.shellOpen||0))*Math.min(1,dt*7);
    if(f.beamTime>0&&Math.abs(b.pos[1]+.5-f.aimY)<1.25)this.mrgDamage(22,'beam');
    if(this.status!=='boarding')return;
    resolvePlayerShots(this,dt);
    resolveHostile(this,dt);
    if(this.status==='boarding')advanceGate(this);
  };
  proto.objective = function (...args) {
    if(!ensureArena(this))return old.objective.apply(this,args);
    const f=this.finale,count=liveEnemies(this).length,dead=f.mrg.hp<=0&&waveCleared(this),t=f.tentacle;
    const retreat=['telegraph','active'].includes(t.phase);
    const title=dead?'МРГ освобождён!':retreat?'ЩУПАЛЬЦА — В ЛЕВОЕ УКРЫТИЕ':f.waveIntro>0?'Волна '+(f.waveIndex+1)+': '+f.waveTitle:
      f.telegraph>0?attacks[f.pattern].title:count>0?'Уничтожьте солдат волны':f.pendingSoldiers?'Подкрепление выходит из МРГ':f.open?'Золотое ядро открыто — огонь!':'Переждите атаку МРГ';
    return {title,detail:retreat?'Уходите в глубокое левое укрытие. '+(t.phase==='telegraph'?'До удара '+t.time.toFixed(1)+' с.':'Щупальца занимают всю остальную арену.'):
      f.telegraph>0?attacks[f.pattern].detail:f.waveGateReached&&!waveCleared(this)?'Предел урона по ядру достигнут. Нужна зачистка всех '+f.totalBatches+' пачек.':
      f.platformLabel+'. Урон противников ×'+f.waveDamageMultiplier+'. Мышь + огонь: ручной прицел. Без прицела огонь и гранаты летят по направлению взгляда.',
      progress:'ВОЛНА '+(f.waveIndex+1)+' / 3 · ПАЧКИ '+f.spawnedBatches+' / '+f.totalBatches+' · УНИЧТОЖЕНО '+(f.waveSoldiersTotal-count-f.pendingSoldiers)+' / '+f.waveSoldiersTotal+' · МРГ '+Math.ceil(Math.max(0,f.mrg.hp/f.mrg.maxHp*100))+'%'};
  };
  proto.beginUpload = function (...args) {
    const award=args[0],f=this.finale;
    if(f&&['upload','victory'].includes(f.phase))return false;
    if(f?.phase==='mrg'&&ensureArena(this)&&award!==false&&
       (f.waveIndex<2||f.mrg.hp>0||!waveCleared(this)))return false;
    const result=old.upload.apply(this,args);
    if(this.finale?.phase==='upload'&&this.finale.arenaVersion===VERSION){
      this.board.enemies=[];this.finale.telegraph=0;this.finale.beamTime=0;
      this.finale.waveIntro=0;this.finale.pendingSoldiers=0;this.finale.batchTimer=0;
      this.finale.tentacle.phase='idle';this.finale.rocketBlasts=[];this.board.guide=false;
    }
    return result;
  };
  function status(e) {
    if(!ensureArena(e))return {version:VERSION,active:false};
    const f=e.finale,b=e.board;
    return {version:VERSION,active:true,waveIndex:f.waveIndex,waveDamageMultiplier:f.waveDamageMultiplier,
      waveTitle:f.waveTitle,platformLabel:f.platformLabel,soldiersAlive:liveEnemies(e).length,soldiersTotal:f.waveSoldiersTotal,
      totalBatches:f.totalBatches,spawnedBatches:f.spawnedBatches,batchIndex:f.batchIndex,pendingSoldiers:f.pendingSoldiers,batchTimer:f.batchTimer,
      waveGateReached:f.waveGateReached,waveIntro:f.waveIntro,bossHp:f.mrg.hp,bossMaxHp:f.mrg.maxHp,playerHp:b.hp,
      tentaclePhase:f.tentacle.phase,tentacleTime:f.tentacle.time,safeX:f.tentacle.safeX,manualAim:b.manualAim,aimDir:b.aimDir.slice(),
      defeatTime:f.defeatTime||0};
  }
  globalThis.CITADEL_MRG=Object.freeze({version:VERSION,waves,roles,attacks,tentacleSpec,batchInterval:BATCH_INTERVAL,bossBounds:()=>bounds,status});
})();
