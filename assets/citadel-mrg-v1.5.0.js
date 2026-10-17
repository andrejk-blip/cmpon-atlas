/* «Цитадель ЦСИИ» · МРГ 1.5.0
   Three guarded waves and physical moving platforms. Shared by game and lab.
   Load after the core and its checkpoint/metrics hooks. State remains plain JSON. */
(() => {
  'use strict';
  if (typeof RequirementArcade === 'undefined' || globalThis.CITADEL_MRG?.version === '1.5.0') return;
  const VERSION = '1.5.0';
  const waves = Object.freeze([
    {index:0,title:'Периметр МРГ',damageMultiplier:1,soldiers:2,platformLabel:'Горизонтальный ход',color:'#ffa86c'},
    {index:1,title:'Подвижный контур',damageMultiplier:2,soldiers:3,platformLabel:'Вертикальные лифты',color:'#d7a1ff'},
    {index:2,title:'Последний рубеж',damageMultiplier:4,soldiers:4,platformLabel:'Смешанный ход',color:'#ff859b'}
  ].map(Object.freeze));
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
  const old = {begin:proto.beginMRG,step:proto.stepMRG,grenade:proto.mrgGrenade,damage:proto.mrgDamage,objective:proto.objective,upload:proto.beginUpload};
  const starting = new WeakSet();
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const alive = enemy => !enemy.dead && enemy.hp > 0;
  const liveEnemies = e => e.board.enemies.filter(alive);
  const targetPos = enemy => V3.add(enemy.pos,[0,.65,0]);
  const threshold = f => f.mrg.maxHp * (2 - f.waveIndex) / 3;
  function initPlatforms(f) {
    f.arenaPlatforms = layout.map(p => ({...p,previousLo:p.lo,previousHi:p.hi,previousY:p.y,moving:false}));
  }
  function spawnSoldiers(e) {
    const f=e.finale,b=e.board,w=waves[f.waveIndex],count=w.soldiers;
    const places = [['floor',-8],['middle',2],['left',-13],['right',10.5]];
    b.enemies=[];
    for(let i=0;i<count;i++) {
      const [id,x]=places[i],p=f.arenaPlatforms.find(p=>p.id===id);
      const hp=Math.round((72+f.waveIndex*16)*(e.assist?.8:1));
      const pos=[clamp(x,p.lo+1,p.hi-1),p.y,0];
      b.enemies.push({id:'mrg-'+f.waveIndex+'-'+i,archetype:'scout',pos,previous:pos.slice(),
        hp,maxHp:hp,hit:0,dead:false,spawnTime:1.6+i*.3,facing:-1,fireFX:0,
        name:i===0?['TV','BS','SH'][f.waveIndex]:'',beard:i===0&&f.waveIndex===2,
        cooldown:1.15+i*.27,supportId:id,patrol:i%2?1:-1,radius:.8,color:w.color,score:180+f.waveIndex*60});
    }
  }
  function setWave(e,index,{quiet=false,spawn=true}={}) {
    const f=e.finale,b=e.board,w=waves[index];
    Object.assign(f,{arenaVersion:VERSION,waveIndex:index,waveDamageMultiplier:w.damageMultiplier,
      waveTitle:w.title,platformLabel:w.platformLabel,waveSoldiersTotal:w.soldiers,
      waveGateReached:false,waveIntro:2.2,waveTime:0,telegraph:0,pattern:-1,
      attackClock:1.2,exposedFor:0,open:false,beamTime:0,phaseFlash:1});
    f.mrg.stage=index;
    b.hostile=[];b.bullets=[];f.soldierSparks=[];
    if(spawn)spawnSoldiers(e);
    if(!quiet)e.say('Волна '+(index+1)+' из трёх. '+w.title+'. Солдат: '+w.soldiers+'. Урон противников ×'+w.damageMultiplier+'. '+w.platformLabel+'.','order',true);
  }
  function ensureArena(e) {
    const f=e?.finale,b=e?.board;
    if(!f||f.phase!=='mrg'||!b||!f.mrg||starting.has(e))return false;
    if(f.arenaVersion===VERSION&&Array.isArray(f.arenaPlatforms)&&f.arenaPlatforms.length===4&&
       Number.isInteger(f.waveIndex)&&f.waveIndex>=0&&f.waveIndex<3)return true;
    // Cloud snapshots may bypass beginMRG. Migrate the live checkpoint in place;
    // do not replay a campaign transition, award points, or reset health/position.
    const defeated=f.mrg.hp<=0&&f.defeatTime>0,defeatTime=f.defeatTime;
    const index=clamp(Math.floor((1-f.mrg.hp/f.mrg.maxHp)*3+1e-8),0,2);
    initPlatforms(f);
    Object.assign(b,{jumpBuffer:b.jumpBuffer||0,coyote:b.grounded?.12:0,dropTimer:0,
      jumpHeld:!!b.jumpHeld,dropHeld:false,jumpFX:0,landFX:0,knockbackX:0,facing:b.facing||1,supportId:null});
    b.previous=b.pos.slice();b.vy=b.vy||0;b.vx=b.vx||0;
    setWave(e,index,{quiet:true,spawn:!defeated});
    if(defeated){b.enemies=[];f.defeatTime=defeatTime;f.open=true;f.waveGateReached=true;f.waveIntro=0;}
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
      grenadeCooldown:0,knockbackX:0,facing:1,supportId:'floor'});
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
      const desired=-15+Math.sin(f.time*.62)*9;
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
  function nearestSoldier(e,origin) {
    let target=null,distance=Infinity;
    for(const enemy of e.board.enemies)if(alive(enemy)) {
      const d=V3.len(V3.sub(targetPos(enemy),origin));
      if(d<distance){distance=d;target=enemy;}
    }
    return target;
  }
  proto.mrgGrenade = function () {
    if(this.finale?.phase!=='mrg')return old.grenade.apply(this,arguments);
    if(!ensureArena(this)||this.status!=='boarding'||this.player.missiles<=0||this.board.grenadeCooldown>0||this.finale.defeatTime>0)return false;
    const b=this.board,enemy=nearestSoldier(this,b.pos),target=enemy?targetPos(enemy):this.finale.mrg.pos;
    const pos=V3.add(b.pos,[.7,.7,0]);
    this.player.missiles--;b.grenadeCooldown=1.3;
    b.bullets.push({pos,vel:V3.scale(V3.norm(V3.sub(target,pos)),36),life:3,damage:160,grenade:true,targetId:enemy?.id||'core'});
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
    if(b.hp<=0){this.status='lost';this.lossReason='МРГ остановил носитель. Уничтожайте солдат каждой волны, меняйте высоту перед лучом и держитесь подальше от корпуса.';this.emit('state','lost');}
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
    if(enemy.hp===0){enemy.dead=true;enemy.fireFX=0;e.board.kills++;e.totalKills=(e.totalKills||0)+1;e.score+=enemy.score;
      e.finale.soldierSparks.push({pos:targetPos(enemy),life:.65,maxLife:.65,color:enemy.color});e.emit('destroy',enemy.id);}
  }
  function hitCore(e,damage) {
    const f=e.finale,m=f.mrg;
    if(!f.open||m.hp<=0)return;
    m.hp=Math.max(threshold(f),m.hp-damage);m.hit=.16;
    if(e.board.time-(f.lastCoreSound||0)>.16){f.lastCoreSound=e.board.time;e.emit('destroy','core');}
    f.waveGateReached=m.hp<=threshold(f)+.00001;
  }
  function updateSoldiers(e,dt) {
    const f=e.finale,b=e.board;
    for(const enemy of b.enemies) {
      enemy.previous=enemy.pos.slice();enemy.hit=Math.max(0,enemy.hit-dt);enemy.fireFX=Math.max(0,enemy.fireFX-dt);
      if(!alive(enemy))continue;
      const p=f.arenaPlatforms.find(p=>p.id===enemy.supportId)||f.arenaPlatforms[0];
      enemy.pos[0]+=p.lo-p.previousLo;enemy.pos[1]+=p.y-p.previousY;
      enemy.spawnTime=Math.max(0,enemy.spawnTime-dt);
      if(enemy.spawnTime>0)continue;
      const left=p.id==='floor'?-20:p.lo+.9,right=p.id==='floor'?9:p.hi-.9;
      enemy.pos[0]+=enemy.patrol*(1.8+f.waveIndex*.25)*dt;
      if(enemy.pos[0]<left){enemy.pos[0]=left;enemy.patrol=1;}
      if(enemy.pos[0]>right){enemy.pos[0]=right;enemy.patrol=-1;}
      enemy.pos[1]=p.y;enemy.facing=b.pos[0]>=enemy.pos[0]?1:-1;
      if(f.waveIntro>0)continue;
      enemy.cooldown-=dt;
      if(enemy.cooldown<=0){enemy.cooldown=(e.assist?3.1:2.6)+Number(enemy.id.slice(-1))*.17;enemy.fireFX=.12;
        const pos=V3.add(enemy.pos,[enemy.facing*.65,.65,0]),target=V3.add(b.pos,[0,.55,0]);
        b.hostile.push({pos,vel:V3.scale(V3.norm(V3.sub(target,pos)),11+f.waveIndex*1.2),life:5,r:.32,damage:10,
          source:'soldier',ownerId:enemy.id,color:enemy.color});e.emit('shot');}
    }
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
    if(!f.waveGateReached||liveEnemies(e).length)return;
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
    movePlatforms(f,dt);
    const victory=m.hp<=0&&liveEnemies(this).length===0&&f.waveIndex===2;
    if(victory) {
      if(!(f.defeatTime>0)){f.defeatTime=3;f.open=true;f.telegraph=0;f.beamTime=0;b.hostile=[];b.bullets=[];b.guide=false;b.vx=0;
        this.say('Все три волны пройдены. МРГ освобождён! Передаём согласованный пакет на исполнение.','success',true);this.emit('boss');}
      f.defeatTime=Math.max(.0001,f.defeatTime-dt);f.shellOpen=Math.min(1,(f.shellOpen||0)+dt*2);
      movePlayer(this,dt,{},true);
      if(f.defeatTime<=.001)this.beginUpload();return;
    }
    f.waveIntro=Math.max(0,f.waveIntro-dt);f.exposedFor=Math.max(0,(f.exposedFor||0)-dt);f.open=f.exposedFor>0;
    movePlayer(this,dt,input);contactBoss(this);if(this.status!=='boarding')return;
    const guideDanger=b.guide&&b.hostile.some(s=>Math.abs(s.pos[0]-b.pos[0])<4&&Math.abs(s.pos[1]-b.pos[1]-.5)<2);
    if((input.pulse||guideDanger)&&b.pulseCooldown<=0){b.hostile=[];b.pulseCooldown=7;b.invulnerable=1.6;b.pulseWave=1;this.emit('pulse');}
    b.pulseWave=Math.max(0,(b.pulseWave||0)-dt);
    if(input.missile)this.mrgGrenade();
    if(input.fire&&b.cooldown<=0){
      b.cooldown=.14*Math.pow(.9,this.upgrades?.weapons||0);
      const enemy=nearestSoldier(this,b.pos),target=enemy?targetPos(enemy):m.pos,pos=V3.add(b.pos,[.8,.6,0]);
      b.facing=target[0]>=b.pos[0]?1:-1;
      b.bullets.push({pos,vel:V3.scale(V3.norm(V3.sub(target,pos)),65),life:1.5,damage:21*(1+.25*(this.upgrades?.weapons||0)),targetId:enemy?.id||'core'});this.emit('shot');
    }
    updateSoldiers(this,dt);
    if(f.waveIntro<=0&&!f.open&&f.telegraph<=0){f.attackClock-=dt;
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
    for(const shot of b.hostile){const from=shot.pos;shot.pos=V3.add(from,V3.scale(shot.vel,dt));shot.life-=dt;
      if(flightSegment(from,shot.pos,V3.add(b.pos,[0,.5,0]),shot.r+.7)!==null){shot.life=0;this.mrgDamage(shot.damage,shot.source);}}
    b.hostile=b.hostile.filter(shot=>shot.life>0);
    if(this.status==='boarding')advanceGate(this);
  };
  proto.objective = function (...args) {
    if(!ensureArena(this))return old.objective.apply(this,args);
    const f=this.finale,count=liveEnemies(this).length,dead=f.mrg.hp<=0&&count===0;
    const title=dead?'МРГ освобождён!':f.waveIntro>0?'Волна '+(f.waveIndex+1)+': '+f.waveTitle:
      f.telegraph>0?attacks[f.pattern].title:count>0?'Уничтожьте солдат волны':f.open?'Золотое ядро открыто — огонь!':'Переждите атаку МРГ';
    return {title,detail:f.telegraph>0?attacks[f.pattern].detail:
      f.waveGateReached&&count?'Предел урона по ядру достигнут. Для перехода уничтожьте оставшихся солдат.':
      f.platformLabel+'. Урон противников ×'+f.waveDamageMultiplier+'. Огонь выбирает ближайшего солдата; после зачистки — ядро. Не касайтесь корпуса.',
      progress:'ВОЛНА '+(f.waveIndex+1)+' / 3 · СОЛДАТЫ '+(f.waveSoldiersTotal-count)+' / '+f.waveSoldiersTotal+' · МРГ '+Math.ceil(Math.max(0,f.mrg.hp/f.mrg.maxHp*100))+'%'};
  };
  proto.beginUpload = function (...args) {
    const award=args[0],f=this.finale;
    if(f&&['upload','victory'].includes(f.phase))return false;
    if(f?.phase==='mrg'&&ensureArena(this)&&award!==false&&
       (f.waveIndex<2||f.mrg.hp>0||liveEnemies(this).length))return false;
    const result=old.upload.apply(this,args);
    if(this.finale?.phase==='upload'&&this.finale.arenaVersion===VERSION){
      this.board.enemies=[];this.finale.telegraph=0;this.finale.beamTime=0;
      this.finale.waveIntro=0;this.board.guide=false;
    }
    return result;
  };
  function status(e) {
    if(!ensureArena(e))return {version:VERSION,active:false};
    const f=e.finale,b=e.board;
    return {version:VERSION,active:true,waveIndex:f.waveIndex,waveDamageMultiplier:f.waveDamageMultiplier,
      waveTitle:f.waveTitle,platformLabel:f.platformLabel,soldiersAlive:liveEnemies(e).length,soldiersTotal:f.waveSoldiersTotal,
      waveGateReached:f.waveGateReached,waveIntro:f.waveIntro,bossHp:f.mrg.hp,bossMaxHp:f.mrg.maxHp,playerHp:b.hp,
      defeatTime:f.defeatTime||0};
  }
  globalThis.CITADEL_MRG=Object.freeze({version:VERSION,waves,attacks,bossBounds:()=>bounds,status});
})();
