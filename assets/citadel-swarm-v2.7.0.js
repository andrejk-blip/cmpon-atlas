/* Citadel 2.7.0 — level 7, «Рой уточнений».
 * A self-contained formation shooter. Visible ships leave their rows, dive,
 * Six authored waves introduce formations, paired dives and readable volleys.
 * Two waves earn each of the original three requirement packets. Old in-flight
 * 1.9 saves retain their three-wave rules. Drops, cues and patterns serialize.
 */
(function () {
  'use strict';
  const VERSION = '2.7.0', LEGACY = '1.9.0';
  if (globalThis.CITADEL_SWARM?.version === VERSION || typeof RequirementArcade !== 'function') return;
  const proto = RequirementArcade.prototype, previous = {};
  for (const name of ['beginStage', 'launch', 'step', 'fire', 'missile', 'hit', 'pulse', 'collect',
    'openNextLesson', 'continueLesson', 'checkStage', 'navTarget', 'guidance', 'objective', 'interact', 'flip']) previous[name] = proto[name];
  const view = { scene: spaceScene, camera: spaceCamera, flightHUD: drawFlightHUD,
    campaignHUD: drawCampaignFlightHUD, clarityHUD: drawClarityHUD, mobileHUD: drawMobileGameHUD,
    update: updateArcadeHUD, mobileUpdate: updateMobileArcade, clarityUpdate: updateCitadelClarity,
    overlay: arcadeOverlayHTML, action: arcadeAction, mobileAction };
  const AWARDING = new WeakSet();
  const ARENA = Object.freeze({ x: 54, y: 70, playerMinY: -58, playerMaxY: -27 });
  const FORMS = Object.freeze(['РАЗВЕДЧИКИ', 'ЭСКАДРИЛЬЯ', 'ФЛАГМАНЫ']);
  const COLORS = ['#8ddfff', '#f4a3d4', '#ffd184'];
  const WAVE_COUNTS = { normal: [12, 15, 18], calm: [10, 12, 15] };
  const WAVES = Object.freeze([
    {name:'РАЗВЕДКА КУРСА',form:'rows',normal:10,calm:8,divers:1,dive:'hook',fire:2.5,diveEvery:4.8,volley:'aimed',lesson:'Одиночные пике. Подсветка показывает, кто выйдет из строя.'},
    {name:'ВСТРЕЧНЫЙ КУРС',form:'wings',normal:12,calm:10,divers:2,dive:'cross',fire:2.15,diveEvery:4.4,volley:'aimed',lesson:'Перехватчики заходят парами с разных сторон.'},
    {name:'УДАРНЫЙ РОМБ',form:'diamond',normal:14,calm:12,divers:2,dive:'hook',fire:1.85,diveEvery:4.1,volley:'fan',lesson:'Бомбардировщики дают веер. Между лучами остаётся проход.'},
    {name:'КЛЕЩИ СОГЛАСОВАНИЯ',form:'wings',normal:16,calm:14,divers:2,dive:'pincer',fire:1.65,diveEvery:3.8,volley:'pair',lesson:'Два края атакуют вместе. Уходи из отмеченного направления.'},
    {name:'СМЕШАННОЕ ЗВЕНО',form:'chevron',normal:18,calm:16,divers:3,dive:'cross',fire:1.45,diveEvery:3.6,volley:'fan',lesson:'Перехватчики отвлекают, тяжёлые корабли прикрывают строй.'},
    {name:'ПОСЛЕДНЯЯ РЕДАКЦИЯ',form:'crown',normal:20,calm:18,divers:3,dive:'mixed',fire:1.25,diveEvery:3.35,volley:'mixed',lesson:'Командиры ведут смешанные атаки. Береги импульс для тесного прохода.'}
  ]);
  // New sorties only. Saved 2.5/2.6 formations retain their original counts,
  // clocks, routes and rewards all the way through their remaining six waves.
  const CHALLENGE = Object.freeze([
    {name:'ПЕРВАЯ ВОСЬМЁРКА',normal:8,groups:2,divers:1,dive:'hook',diveEvery:4.2,fire:.82,shooters:1},
    {name:'ДВОЙНОЕ ОКРУЖЕНИЕ',normal:16,groups:4,divers:2,dive:'cross',diveEvery:3.7,fire:.74,shooters:2},
    {name:'ЧЕТЫРЕ ФЛОТИЛИИ',normal:32,groups:4,divers:3,dive:'pincer',diveEvery:3.3,fire:.68,shooters:3},
    {name:'ШЕСТЬДЕСЯТ ЧЕТЫРЕ',normal:64,groups:4,divers:4,dive:'mixed',diveEvery:3.05,fire:.62,shooters:4},
    {name:'ОСАДНЫЙ ПОРЯДОК',normal:64,groups:4,divers:5,dive:'flank',diveEvery:2.9,fire:.57,shooters:4},
    {name:'ПОСЛЕДНИЙ КОНТРАРГУМЕНТ',normal:64,groups:4,divers:6,dive:'mixed',diveEvery:2.75,fire:.52,shooters:5}
  ].map(Object.freeze));
  const LIMITS = Object.freeze({enemies:64,hostile:80,playerShots:36,pickups:4,divers:6});
  // 2.10 softens overlapping attacks while preserving all six large waves.
  // Existing tactical sorties adopt this once; in-flight shots keep their data.
  const BALANCE_2100 = Object.freeze({cadence:1.18,shooters:4,hostile:64,speed:.94,damage:.92,divers:5,diveEvery:1.08,diveTell:.45,shotGap:1.15,homing:.8,pickupReach:2.5});
  const TACTIC_TIPS=Object.freeze([
    'Перехватчики режут курс. Стреляй и меняй полосу.',
    'Бомбардировщики заходят по дуге. Сбей их до следующего веера.',
    'Щитоносцы закрывают строй. Ракета вскрывает их броню.',
    'Красные торпеды можно сбивать огнём. Импульс оставь на окружение.',
    'Уходи из перекрёстного огня. На флангах работают торпедоносцы.',
    'Командиры идут восьмёркой. Убирай тяжёлые цели и подбирай снабжение.'
  ]);
  const clamp = (n, a, b) => arcadeClamp(n, a, b);
  const mobile = () => typeof isMobileLayout === 'function' && isMobileLayout();
  const completed = e => e.plan[2].filter(id => e.rescued.includes(id)).length;
  const modern = e => [VERSION,'2.6.0','2.5.0'].includes(e?.swarm?.rulesVersion);
  const challenge = e => e?.swarm?.rulesVersion===VERSION&&!e.assist;
  // Tactics are attached to a new sortie, never silently applied to an active
  // 2.7 save. State, schedules and route choice remain deterministic on reload.
  const tactics = e => challenge(e) && e.swarm.tacticsVersion === '2.8.0';
  const balanced = e => tactics(e) && e.swarm.balanceVersion === '2.10.0';
  function adoptBalance(e){if(tactics(e)&&!e.swarm.balanceVersion){e.swarm.balanceVersion='2.10.0';e.swarm.fireClock=Math.max(e.swarm.fireClock,.65);e.swarm.diveClock=Math.max(e.swarm.diveClock,1);}}
  const classic = e => e?.swarm?.rulesVersion==='2.5.0';
  const configured = e => !!e && e.stage === 2 && !e.finale && [VERSION,'2.6.0','2.5.0',LEGACY].includes(e.swarm?.version);
  const inArena = e => configured(e) && e.phase === 'swarm' && !e.swarm.complete;
  const active = e => inArena(e) && !e.crash;
  const living = e => e.enemies.filter(x => x.swarmDrone && !x.dead && x.hp > 0);
  const waveIndex = e => modern(e) ? Math.min(5,e.swarm.waveIndex||0) : Math.min(2,e.swarm.packet);
  const waveTotal = e => modern(e) ? 6 : 3;
  const waveDef = e => (challenge(e)?CHALLENGE:WAVES)[waveIndex(e)];
  const waveCount = (e, n = waveIndex(e)) => modern(e) ? (challenge(e)?CHALLENGE:WAVES)[Math.min(5,n)][e.assist?'calm':'normal'] : WAVE_COUNTS[e.assist ? 'calm' : 'normal'][Math.min(2,n)];
  const waveName = e => modern(e) ? waveDef(e).name : FORMS[Math.min(2,e.swarm.packet)];
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function formationPoint(e, index, time = e.swarm.time) {
    const s = e.swarm, count = waveCount(e), columns = count === 10 || count === 15 ? 5 : 6;
    const row = Math.floor(index / columns), col = index % columns;
    if(challenge(e)){
      const n=waveIndex(e),groups=waveDef(e).groups,size=count/groups,group=Math.floor(index/size),slot=index%size;
      const cols=size>=8?4:2,rows=Math.ceil(size/cols),r=Math.floor(slot/cols),c=slot%cols;
      const side=group%2?-1:1,upper=group<2,cx=side*27,cy=groups===2?43:upper?51:15;
      // Four separated squadrons occupy a 2×2 grid. Each has its own small
      // motion and silhouette; 64 ships never expand outside the arena.
      const swing=Math.sin(time*(.36+n*.025)+group*1.7+s.seedPhase),shape=(n+group)%3;
      let x=(c-(cols-1)/2)*9.2,y=(rows-1)/2*8.4-r*8.4;
      if(shape===1)y-=Math.abs(c-(cols-1)/2)*1.3;
      if(shape===2)x+=Math.sin((r+1)*1.3)*1.2;
      if(tactics(e)){
        // Squadrons breathe, wheel and change altitude independently. There is
        // always a corridor between groups; even 64 hulls remain in bounds.
        const bank=Math.sin(time*(.34+n*.035)+group*1.4)*(.12+n*.018);
        const turnX=x*Math.cos(bank)-y*Math.sin(bank),turnY=x*Math.sin(bank)+y*Math.cos(bank);
        const drift=Math.sin(time*.59+group*2.1)*(2.3+n*.45);
        return [clamp(cx+turnX+swing*3.5,-50,50),cy+turnY+drift,0];
      }
      return [cx+x+swing*2.8,cy+y+Math.cos(time*.48+group)*1.1,0];
    }
    if(modern(e)){
      const n=waveIndex(e),def=waveDef(e),cols=count<=12?Math.ceil(count/2):Math.ceil(count/3),r=Math.floor(index/cols),c=index%cols,mid=(cols-1)/2;
      let x=(c-mid)*12,y=51-r*12;
      if(def.form==='wings'){x=(c-mid)*13.5+(c<mid?-3:3);y=49-r*12-Math.abs(c-mid)*3;}
      else if(def.form==='diamond'){x=(c-mid)*13*(r===1?1:.8);y=53-r*12-Math.abs(c-mid)*2;}
      else if(def.form==='chevron'){x=(c-mid)*13;y=55-r*11-Math.abs(c-mid)*4;}
      else if(def.form==='crown'){x=(c-mid)*12.4;y=52-r*12+Math.cos((c-mid)*.75)*5;}
      return [x+Math.sin(time*(.34+n*.035)+s.seedPhase)*(4.5+n*.35),y+Math.sin(time*.55+r)*1.3,0];
    }
    return [(col - (columns - 1) / 2) * 14 + Math.sin(time * .46 + s.seedPhase) * 7,
      48 - row * 14 + Math.sin(time * .7 + s.seedPhase) * 1.4, 0];
  }
  function spawn(e, index) {
    const s = e.swarm, count = waveCount(e), columns = count === 10 || count === 15 ? 5 : 6;
    const row = Math.floor(index / columns),n=waveIndex(e);
    let role=modern(e)?n===5&&index<2?'commander':n>=2&&index%6===2?'bomber':n>=1&&index%3===1?'interceptor':'scout':'fighter';
    if(challenge(e))role=n>=3&&index%16===0?'commander':n>=3&&index%8===5?'torpedo':n>=2&&index%8===0?'shield':n>=1&&index%4===2?'bomber':index%4===1?'interceptor':'scout';
    const rank = modern(e)?role==='commander'?2:['bomber','shield','torpedo'].includes(role)?1:0:s.packet === 2 && row === 0 ? 2 : row === 0 && s.packet > 0 ? 1 : 0;
    const hp = modern(e)?({scout:26,interceptor:34,bomber:46,commander:60,shield:46,torpedo:40}[role]):[26, 48, 72][rank], side = index % 2 ? 1 : -1;
    const enemy = { id: ++e.entityId, swarmDrone: true, slot: index, formation: s.packet,
      row, rank, pos: [side * (62 + row * 4), 76 + index % columns * 3, 0], vel: [0, 0, 0],
      hp, maxHp: hp, r: rank === 2 ? 4 : 3.3, type: rank === 2 ? 'heavy' : 'scout', role,
      name: modern(e)?({scout:'Разведчик',interceptor:'Перехватчик',bomber:'Бомбардировщик',commander:'Командир правок',shield:'Щитоносец',torpedo:'Торпедоносец'}[role]):['Разведчик уточнений', 'Ведущий согласования', 'Флагман правок'][rank], color: modern(e)?['#d39683','#d2b786','#cf9fac'][rank]:COLORS[rank],
      mode: 'enter', modeTime: -index % columns * .06, from: [side * (62 + row * 4), 76 + index % columns * 3, 0],
      hit: 0, age: 0, warp: 0, phase: index * .7, channel: false, dead: false, fireCue: 0, route: null };
    if(challenge(e))Object.assign(enemy,{squad:Math.floor(index/(count/waveDef(e).groups)),shield:role==='shield'?24:0,shieldMax:role==='shield'?24:0});
    if(tactics(e))Object.assign(enemy,{lastShot:-100,attackSerial:0,thruster:0});
    s.slots[index].id = enemy.id; e.enemies.push(enemy); return enemy;
  }
  function formSwarm(e, announce = true, credit = 0) {
    const s = e.swarm, count = waveCount(e);
    s.formationStart = s.time; s.waveAge = 0; s.phase = 'entry'; s.transition = 2.3;
    s.fireClock = e.assist ? 3.9 : 3.1; s.diveClock = e.assist ? 5.4 : 4.1; s.diveSerial = 0; s.fireSerial = 0;
    s.attack = null; s.window = null; s.slots = Array.from({ length: count }, (_, index) =>
      ({ index, id: null, paid: index < credit, dead: index < credit, credited: index < credit }));
    s.transfer[s.packet] = credit; s.cleared[s.packet] = credit;
    if(modern(e)) {s.waveKills=credit;s.droppedThisWave=0;s.fireClock=e.assist?4.6:classic(e)?3.4:0;s.diveClock=e.assist?5.8:classic(e)?4.5:1.2;}
    if(challenge(e)){s.squads=waveDef(e).groups;s.squadSerial=0;s.patternCounts=s.patternCounts||{};s.peakHostile=s.peakHostile||0;}
    e.enemies = []; e.bullets = []; e.hostile = []; e.selectedTarget = null; e.lock = null;
    for (let i = credit; i < count; i++) spawn(e, i);
    if (announce) {
      e.notify('ВОЛНА ' + (waveIndex(e)+1) + ' / '+waveTotal(e)+' · ' + waveName(e), e.assist?(modern(e)?waveDef(e).lesson:'Подсвеченные корабли готовятся пикировать.'):tactics(e)?TACTIC_TIPS[waveIndex(e)]:'Разбей звено. Ракеты — ПКМ / Q. Снабжение подбирается кораблём.');
      e.emit('wave', waveIndex(e)+1);
    }
  }
  function lessonQueue(e) {
    const pending = new Set(e.lessonQueue.map(x => x.caseIndex));
    if (e.lesson) pending.add(e.lesson.caseIndex);
    for (const index of [0, 2]) {
      const caseIndex = index === 0 ? 4 : 5, reqId = e.plan[2][index];
      if (e.rescued.includes(reqId) && !e.decisions.some(x => x.caseIndex === caseIndex) && !pending.has(caseIndex)) {
        e.lessonQueue.push({ reqId, caseIndex, stage: 2 }); pending.add(caseIndex);
      }
    }
  }
  function finish(e, announce = true) {
    const s = e.swarm; s.complete = true; s.packet = 3; s.finishedAt = s.time; s.phase = 'complete';
    if(modern(e)){s.pickups=[];s.waveIndex=5;s.wavesCleared=6;}
    e.phase = 'dock'; e.autopilot = true; e.navMode = 'objective'; e.enemies = []; e.bullets = []; e.hostile = [];
    e.selectedTarget = null; e.lock = null; e.detour = null; e.navWatch = null; e.hullCache = null;
    Object.assign(e.player, { pos: V3.add(e.station.pos, [clamp(e.player.pos[0], -32, 32), 1, -125]),
      yaw: Math.PI, pitch: 0, bank: 0, speed: 18, boosting: false });
    lessonQueue(e);
    if (announce) {
      e.say('Рой разбит. Все три пакета требований на борту! Разберём решения и вернёмся в голубой шлюз Цитадели.', 'success', true);
      e.emit('phase', 'dock');
    }
    if (e.status === 'playing') previous.openNextLesson.call(e);
  }
  function initialise(e, migration = false) {
    const old = e.swarm, savedStatus = e.status, savedResume = e.resumeStatus;
    const s = e.swarm = { version: migration?LEGACY:VERSION, time: 0, packet: 0, transfer: [0, 0, 0], cleared: [0, 0, 0],
      complete: false, seedPhase: (e.seed % 65521) / 65521 * Math.PI * 2, phase: 'entry',
      window: null, radius: 0, inside: false, blocked: false, attack: null, slots: [],
      formationStart: 0, waveAge: 0, transition: 2.3, diveSerial: 0, fireSerial: 0,
      shotsCleared: 0, damageTaken: 0, hitsTaken: 0, dodgedDives: 0, warnedManual: false };
    if(!migration)Object.assign(s,{rulesVersion:VERSION,tacticsVersion:'2.8.0',balanceVersion:'2.10.0',waveIndex:0,waveTotal:6,wavesCleared:0,waveKills:0,pickups:[],dropSerial:0,droppedThisWave:0,
      dropsSpawned:{repair:0,missiles:0,overdrive:0},dropsCollected:{repair:0,missiles:0,overdrive:0},overdriveUntil:0,events:[]});
    s.packet = e.plan[2].findIndex(id => !e.rescued.includes(id)); if (s.packet < 0) s.packet = 3;
    if(modern(e))s.waveIndex=Math.min(5,s.packet*2);
    for (let i = 0; i < 3; i++) if (e.rescued.includes(e.plan[2][i])) s.transfer[i] = s.cleared[i] = waveCount(e, i);
    e.phase = 'swarm'; e.autopilot = false; e.navMode = 'objective'; e.wave = 0; e.waveSpawned = 0;
    e.waveClock = 0; e.waveSpawnTimer = 999; e.spawnClock = 999; e.detour = null; e.navWatch = null;
    e.hullCache = null; e.board = null; e.boss = null; e.asteroids = []; e.hostile = []; e.bullets = [];
    e.particles = []; e.explosions = []; e.station = { ...e.station, pos: [0, 0, -185] }; e.location = 'Рой уточнений';
    e.pickups = e.plan[2].map(reqId => ({ type: 'requirement', reqId, pos: [0, 0, 0], r: 7, dead: e.rescued.includes(reqId) }));
    Object.assign(e.player, { pos: [0, -50, 0], yaw: 0, pitch: 0, bank: 0, speed: 0, boosting: false });
    if (!migration) e.player.invulnerable = 3;
    if (s.packet < 3) {
      const fraction = old?.version === '1.8.0' ? clamp((old.transfer?.[s.packet] || 0) / (e.assist ? 12 : 15), 0, .95) : 0;
      const credit = Math.floor(fraction * waveCount(e));
      if (migration) s.migration = { from: old?.version || 'legacy-orbit', credited: credit };
      formSwarm(e, false, credit);
    } else finish(e, false);
    if (migration && ['paused', 'lesson', 'briefing'].includes(savedStatus)) { e.status = savedStatus; e.resumeStatus = savedResume; }
  }
  function awardWave(e) {
    const s = e.swarm, reqId = e.plan[2][s.packet];
    if(modern(e)){
      s.wavesCleared=waveIndex(e)+1;s.phase='cleared';s.transition=2.6;
      s.events.push({type:'wave-cleared',wave:waveIndex(e)+1,time:+s.time.toFixed(2),hp:+e.player.hp.toFixed(2)});s.events=s.events.slice(-24);
      e.hostile=[];e.bullets=[];e.lock=null;e.selectedTarget=null;
      if(s.waveIndex%2===0){e.notify('ВОЛНА '+(s.waveIndex+1)+' / 6 ПРОЙДЕНА','Подберите снабжение. Ещё одно звено — и пакет ФТ на борту.');return;}
    }
    if (!e.rescued.includes(reqId)) {
      const item = e.pickups.find(x => x.type === 'requirement' && x.reqId === reqId);
      AWARDING.add(e);
      try { previous.collect.call(e, item); } finally { AWARDING.delete(e); }
    }
    s.transfer[s.packet] = s.cleared[s.packet] = waveCount(e); s.phase = 'cleared'; s.transition = modern(e)?3.2:2.4;
    e.hostile = []; e.bullets = []; e.lock = null; e.selectedTarget = null;
    e.notify('ВОЛНА ПРОЙДЕНА · ФТ ' + completed(e) + '/3', 'Пакет требований на борту. Щит +10, ракеты +2.');
    e.emit('comic', { text: s.packet === 2 ? 'РОЙ РАЗБИТ! ТЗ У НАС!' : 'ПАКЕТ ТРЕБОВАНИЙ ЗАХВАЧЕН!', kind: 'success', anchor: [0, 0, 0] });
  }
  function enemyShot(e, x) {
    if(modern(e))return modernShot(e,x);
    if (e.hostile.length >= 22 || x.pos[1] < e.player.pos[1] + 14) return;
    const speed = (e.assist ? 30 : 38) + e.swarm.packet * 3;
    const dx = clamp(e.player.pos[0] - x.pos[0], -26, 26), dy = Math.min(-24, e.player.pos[1] - x.pos[1]);
    const norm = Math.hypot(dx, dy);
    e.hostile.push({ pos: [x.pos[0], x.pos[1] - 4, 0], vel: [dx / norm * speed, dy / norm * speed, 0],
      life: 6, r: .8, damage: 14 + e.swarm.packet * 2, type: 'swarm-bolt', color: '#ffb765', owner: x.id });
    e.emit('shot', { swarmEnemy: true });
  }
  function chooseDivers(e) {
    if(modern(e))return modernDivers(e);
    const s = e.swarm, candidates = living(e).filter(x => x.mode === 'formation');
    const maximum = e.assist ? 2 : 3;
    const busy = living(e).filter(x => ['tell', 'dive'].includes(x.mode)).length;
    if (!candidates.length || busy >= maximum) return;
    candidates.sort((a, b) => b.row - a.row || a.slot - b.slot);
    const count = Math.min(candidates.length, maximum - busy, e.assist ? (s.packet ? 2 : 1) : (s.packet === 2 ? 3 : 2));
    for (let i = 0; i < count; i++) {
      const x = candidates[(s.diveSerial * 3 + i) % candidates.length];
      x.mode = 'tell'; x.modeTime = 0; x.fireCue = 0;
      x.route = { side: (x.slot + s.diveSerial) % 2 ? 1 : -1, duration: e.assist ? 4.8 : 3.9, fired: false, firedAgain: false, hit: false };
    }
    if (e.assist && s.diveSerial === 0) e.emit('comic', { text: 'ПРАВКИ ИДУТ В ПИКЕ!', kind: 'warning', anchor: [0, 23, 0] });
    s.diveSerial++;
  }
  function modernShot(e,x){
    if(challenge(e))return challengeShot(e,x);
    const s=e.swarm,p=e.player,n=waveIndex(e),cap=e.assist?24:32;
    // No point-blank bullets: even the fastest shot starts at least 24 units
    // above the player after its muzzle offset (>0.5 seconds of travel).
    if(e.hostile.length>=cap||x.pos[1]<p.pos[1]+30)return;
    const target=x.cueAim||p.pos,speed=(e.assist?27:33)+n*1.8;
    const dx=clamp(target[0]-x.pos[0],-40,40),dy=Math.min(-26,target[1]-x.pos[1]),a=Math.atan2(dx,-dy);
    const def=waveDef(e),fan=(x.role==='bomber'||x.role==='commander')&&['fan','mixed'].includes(def.volley);
    const angles=fan?(e.assist?[-.16,.16]:[-.22,0,.22]):[0];
    for(const offset of angles){if(e.hostile.length>=cap)break;const angle=a+offset;e.hostile.push({pos:[x.pos[0],x.pos[1]-4,0],vel:[Math.sin(angle)*speed,-Math.cos(angle)*speed,0],
      life:6.5,r:.8,damage:12+n*1.2,type:'swarm-bolt',color:'#ffb765',owner:x.id,pattern:fan?'fan':'aimed'});}
    x.cueAim=null;x.attackCue=0;e.emit('shot',{swarmEnemy:true});
  }
  function challengeShot(e,x){
    const s=e.swarm,p=e.player,n=waveIndex(e);
    // Muzzle separation and finite homing give time to react to the projectile
    // itself. No hidden region damage or advance targeting markers are used.
    const soft=balanced(e),cap=soft?BALANCE_2100.hostile:LIMITS.hostile;
    if(e.hostile.length>=cap||x.pos[1]<p.pos[1]+30||soft&&s.time-(x.lastShot??-100)<BALANCE_2100.shotGap)return;
    const tactical=tactics(e),lead=x.role==='interceptor'?(tactical?.42:.25):0,target=p.pos[0]+clamp((s.playerVelocity?.[0]||0)*lead,-12,12);
    const dx=clamp(target-x.pos[0],-65,65),dy=Math.min(-28,p.pos[1]-x.pos[1]),angle=Math.atan2(dx,-dy);
    const torpedo=x.role==='torpedo',speed=(torpedo?26+n:35+n*(tactical?1.9:1.4))*(soft?BALANCE_2100.speed:1);
    const angles=x.role==='commander'?[-.32,-.16,0,.16,.32]:x.role==='bomber'?(tactical?[-.34,0,.34]:[-.24,0,.24]):x.role==='shield'?[-.105,.105]:tactical&&torpedo&&n>3?[-.15,.15]:[0];
    const pattern=torpedo?'torpedo':x.role==='commander'?'crown':x.role==='bomber'?'fan':x.role==='shield'?'pair':x.role==='interceptor'?'lead':'aimed';
    for(const offset of angles){
      if(e.hostile.length>=cap)break;const a=angle+offset;
      e.hostile.push({pos:[x.pos[0],x.pos[1]-4,0],vel:[Math.sin(a)*speed,-Math.cos(a)*speed,0],
        life:6.5,r:torpedo?1.35:.8,damage:(torpedo?22:14+n*1.4)*(soft?BALANCE_2100.damage:1),type:torpedo?'swarm-torpedo':'swarm-bolt',
        color:torpedo?'#ee897c':'#ffb765',owner:x.id,pattern,age:0,homing:torpedo?(soft?BALANCE_2100.homing:tactical?1.05:.75):0,speed});
    }
    if(tactical){x.lastShot=s.time;x.attackSerial++;x.thruster=.18;}
    s.patternCounts[pattern]=(s.patternCounts[pattern]||0)+1;x.cueAim=null;x.fireCue=x.attackCue=0;e.emit('shot',{swarmEnemy:true});
  }
  function modernDivers(e){
    const s=e.swarm,def=waveDef(e),available=living(e).filter(x=>x.mode==='formation'),busy=living(e).filter(x=>['tell','dive'].includes(x.mode)).length;
    const max=challenge(e)?Math.min(def.divers,balanced(e)?BALANCE_2100.divers:6):e.assist?2:3,count=Math.min(available.length,max-busy,e.assist?Math.max(1,def.divers-1):def.divers);
    if(count<=0)return;
    // Alternate opposite wings. The left/right staging is observable, and the
    // target position freezes when each highlighted ship commits to its dive.
    available.sort((a,b)=>a.pos[0]-b.pos[0]);
    for(let i=0;i<count;i++){
      const fromLeft=(s.diveSerial+i)%2===0,x=fromLeft?available.shift():available.pop();if(!x)break;
      const kind=tactics(e)?({scout:'serpent',interceptor:'intercept',bomber:'siege',shield:'bulwark',torpedo:'flank',commander:'orbit'}[x.role]):def.dive==='mixed'?(challenge(e)?['hook','cross','pincer','flank']:['hook','cross','pincer'])[(s.diveSerial+i)%(challenge(e)?4:3)]:def.dive;
      x.mode='tell';x.modeTime=0;x.fireCue=0;x.attackCue=0;
      x.route={kind,side:fromLeft?1:-1,duration:e.assist?5.05:challenge(e)?4.1-waveIndex(e)*.13:4.15-waveIndex(e)*.07,fired:false,firedAgain:false,hit:false};
      if(tactics(e)){
        x.route.duration*=({serpent:1.0,intercept:.81,siege:1.85,bulwark:1.6,flank:1.3,orbit:1.75}[kind]||1);
        s.routeCounts=s.routeCounts||{};s.routeCounts[kind]=(s.routeCounts[kind]||0)+1;
      }
    }
    if(e.assist&&s.diveSerial===0)e.emit('comic',{text:waveIndex(e)<2?'ПРАВКИ ИДУТ В ПИКЕ!':'СОГЛАСОВАНИЕ С ДВУХ СТОРОН!',kind:'warning',anchor:[0,23,0]});
    s.diveSerial++;
  }
  function dropSupply(e,enemy){
    const s=e.swarm;if(!modern(e)||s.droppedThisWave>=(challenge(e)?[1,2,3,4,4,5][waveIndex(e)]:(waveIndex(e)?2:1))||s.pickups.length>=(challenge(e)?4:3))return;
    if(enemy.mode!=='dive'&&!['bomber','commander','shield','torpedo'].includes(enemy.role))return;
    const cycle=['repair','missiles','overdrive'],limits=challenge(e)?{repair:6,missiles:8,overdrive:5}:{repair:3,missiles:4,overdrive:3};let type=null;
    for(let i=0;i<3;i++){const candidate=cycle[s.dropSerial++%3];if(s.dropsSpawned[candidate]<limits[candidate]){type=candidate;break;}}
    if(!type)return;s.droppedThisWave++;s.dropsSpawned[type]++;
    s.pickups.push({id:++e.entityId,type,pos:[clamp(enemy.pos[0],-46,46),clamp(enemy.pos[1],-22,55),0],r:2.5,age:0,life:15,dead:false});
    s.events.push({type:'drop',supply:type,wave:waveIndex(e)+1,time:+s.time.toFixed(2)});s.events=s.events.slice(-24);
  }
  function updateSupplies(e,dt,oldPlayer){
    if(!modern(e))return;const s=e.swarm,p=e.player;
    for(const item of s.pickups){
      const old=item.pos.slice();item.age+=dt;item.life-=dt;item.pos[1]-=8.5*dt;
      if(flightSegment(V3.sub(old,oldPlayer),V3.sub(item.pos,p.pos),[0,0,0],item.r+(balanced(e)?BALANCE_2100.pickupReach:1.65))!==null){
        item.dead=true;s.dropsCollected[item.type]++;
        const text=item.type==='repair'?'Щит +'+(e.assist?20:14):item.type==='missiles'?'Ракеты +2':'Усиление огня · 7 секунд';
        if(item.type==='repair')p.hp=Math.min(100,p.hp+(e.assist?20:14));
        else if(item.type==='missiles')p.missiles=Math.min(20,p.missiles+2);
        else s.overdriveUntil=Math.max(s.overdriveUntil,s.time)+7;
        s.events.push({type:'pickup',supply:item.type,wave:waveIndex(e)+1,time:+s.time.toFixed(2)});s.events=s.events.slice(-24);
        e.emit('pickup',text);e.notify(text,'Снабжение подобрано.');
      }
    }
    s.pickups=s.pickups.filter(x=>!x.dead&&x.life>0&&x.pos[1]>-66).slice(-(challenge(e)?4:3));
  }
  function updateEnemy(e, x, dt) {
    const s = e.swarm, before = x.pos.slice();
    x.age += dt; x.modeTime += dt; x.hit = Math.max(0, x.hit - dt); x.channel = false;
    if(tactics(e))x.thruster=Math.max(0,(x.thruster||0)-dt);
    if (x.fireCue > 0) {
      x.fireCue -= dt;
      // A negative timer is truthy: leaving it below zero permanently excludes
      // this ship from the ready-shooter list. Legacy saves keep old rules.
      if (modern(e)) x.attackCue = x.fireCue = Math.max(0, x.fireCue);
      if (x.fireCue <= 0) enemyShot(e, x);
    }
    const home = formationPoint(e, x.slot);
    if (x.mode === 'enter' || x.mode === 'return') {
      const t = clamp(x.modeTime / (x.mode === 'enter' ? 1.6 : 1.3), 0, 1), k = smooth(t);
      x.pos = [mix(x.from[0], home[0], k), mix(x.from[1], home[1], k) + Math.sin(t * Math.PI) * 9, 0];
      if (t >= 1) { x.mode = 'formation'; x.modeTime = 0; }
    } else if (x.mode === 'formation' || x.mode === 'tell') {
      x.pos = home;
      if (x.mode === 'tell' && x.modeTime >= (e.assist ? (modern(e)?1.45:1.35) : classic(e)?1.05:balanced(e)?BALANCE_2100.diveTell:0)) {
        x.mode = 'dive'; x.modeTime = 0; x.route.from = x.pos.slice();
        x.route.targetX = clamp(e.player.pos[0] + x.route.side * (modern(e)?9:5), -44, 44);
      }
    } else if (x.mode === 'dive') {
      const r = x.route, t = clamp(x.modeTime / r.duration, 0, 1);
      const curve=modern(e)?r.kind==='flank'?Math.sin(t*Math.PI)*r.side*34:r.kind==='pincer'?Math.sin(t*Math.PI)*r.side*21:r.kind==='cross'?Math.sin(t*Math.PI*2)*r.side*12:Math.sin(t*Math.PI*2)*Math.sin(t*Math.PI)*r.side*16:Math.sin(t*Math.PI*2)*Math.sin(t*Math.PI)*r.side*18;
      const diveX=mix(r.from[0],r.targetX,t)+curve;
      x.pos = [challenge(e)?clamp(diveX,-52,52):diveX,
        mix(r.from[1], -76, t), 0];
      if(tactics(e)){
        // Attack roles have different routes and different commitments. Siege
        // ships strafe above the player; interceptors can be sidestepped after
        // their aim locks. None teleports into the player corridor.
        if(r.kind==='serpent')x.pos=[clamp(mix(r.from[0],r.targetX,t)+Math.sin(t*Math.PI*3)*r.side*13*Math.sin(t*Math.PI),-52,52),mix(r.from[1],-76,t),0];
        if(r.kind==='intercept')x.pos=[clamp(mix(r.from[0],r.targetX,smooth(t)),-52,52),mix(r.from[1],-76,t),0];
        if(r.kind==='flank')x.pos=[clamp(mix(r.from[0],-r.side*46,Math.sin(t*Math.PI)),-52,52),r.from[1]-Math.sin(t*Math.PI)*49,0];
        if(r.kind==='siege')x.pos=[clamp(r.from[0]+Math.sin(t*Math.PI*2)*r.side*25,-50,50),r.from[1]-Math.sin(t*Math.PI)*Math.max(10,r.from[1]+5),0];
        if(r.kind==='bulwark')x.pos=[clamp(mix(r.from[0],-r.from[0],smooth(t)),-50,50),r.from[1]-Math.sin(t*Math.PI)*Math.max(8,r.from[1]-1),0];
        if(r.kind==='orbit')x.pos=[clamp(r.from[0]+Math.sin(t*Math.PI*2)*24,-50,50),r.from[1]-Math.sin(t*Math.PI)*Math.max(12,r.from[1]+3)+Math.sin(t*Math.PI*4)*5,0];
      }
      if (!r.fired && t > .28) { r.fired = true;if(modern(e)){x.cueAim=e.player.pos.slice();if(e.assist||classic(e))x.fireCue=x.attackCue=e.assist?1.15:.85;else enemyShot(e,x);}else enemyShot(e,x); }
      if (!modern(e)&&s.packet === 2 && !e.assist && !r.firedAgain && t > .53) { r.firedAgain = true; enemyShot(e, x); }
      if(challenge(e)&&!r.firedAgain&&t>.43&&['interceptor','commander'].includes(x.role)){r.firedAgain=true;enemyShot(e,x);}
      if(tactics(e)&&!r.firedAgain&&t>.56&&['bomber','torpedo','shield'].includes(x.role)){r.firedAgain=true;enemyShot(e,x);}
      if(tactics(e)&&!r.thirdShot&&t>.74&&['bomber','commander'].includes(x.role)){r.thirdShot=true;enemyShot(e,x);}
      if (t >= 1) {
        x.mode = 'return'; x.modeTime = 0; x.from = tactics(e)&&['siege','bulwark','flank','orbit'].includes(r.kind)?x.pos.slice():[clamp(r.targetX + r.side * 13, -53, 53), 80, 0];
        x.pos = x.from.slice(); s.dodgedDives++;
      }
    }
    x.vel = V3.scale(V3.sub(x.pos, before), 1 / Math.max(.001, dt));
    return before;
  }
  function takeDamage(e, amount) {
    const hp = e.player.hp, ok = e.damage(amount);
    if (ok) { e.swarm.damageTaken += hp - e.player.hp; e.swarm.hitsTaken++; }
    return ok;
  }
  function stepSwarm(e, dt, input) {
    adoptBalance(e);
    const s = e.swarm, p = e.player, oldPlayer = p.pos.slice();
    e.autopilot = false; s.time += dt; s.waveAge += dt; e.elapsed += dt; e.stageTime += dt; e.phaseClock += dt;
    e.captainClock = Math.max(0, e.captainClock - dt);
    for (const key of ['shotCooldown', 'missileCooldown', 'invulnerable', 'pulseCooldown', 'flipCooldown']) p[key] = Math.max(0, p[key] - dt);
    for (const key of ['flash', 'shake', 'hitFlash', 'pulseWave']) e[key] = Math.max(0, (e[key] || 0) - dt);
    e.comboTime = Math.max(0, e.comboTime - dt); if (!e.comboTime) e.combo = 0;
    const dx = clamp(Number(input.turn) || 0, -1, 1), dy = clamp(Number(input.pitch) || 0, -1, 1), length = Math.max(1, Math.hypot(dx, dy));
    const boosting = !!input.boost && p.energy > 2, speed = boosting ? 47 : 32;
    p.pos = [clamp(p.pos[0] + dx / length * speed * dt, -ARENA.x + 3, ARENA.x - 3),
      clamp(p.pos[1] + dy / length * speed * dt, ARENA.playerMinY, ARENA.playerMaxY), 0];
    p.bank += (-dx * .24 - p.bank) * Math.min(1, dt * 8); p.yaw = 0; p.pitch = 0;
    p.speed = Math.hypot(dx, dy) * speed; p.boosting = boosting;
    if(challenge(e))s.playerVelocity=[(p.pos[0]-oldPlayer[0])/dt,(p.pos[1]-oldPlayer[1])/dt];
    p.energy = clamp(p.energy + (boosting ? -25 : 17) * dt, 0, 100);
    updateSupplies(e,dt,oldPlayer);
    s.transition = Math.max(0, s.transition - dt);
    if (s.phase === 'entry' && s.transition <= 0) s.phase = 'battle';
    if (s.phase === 'cleared') {
      if (s.transition <= 0) {
        if(modern(e)){
          if(s.waveIndex>=5){finish(e);return;}
          s.waveIndex++;s.packet=Math.floor(s.waveIndex/2);formSwarm(e);
        }else{
        const next = e.plan[2].findIndex(id => !e.rescued.includes(id));
        if (next < 0) { finish(e); return; }
        s.packet = next; formSwarm(e);
        }
      }
    } else {
      if (s.phase === 'battle' || !e.assist && !classic(e) && !balanced(e) && s.phase === 'entry') {
        s.diveClock -= dt; s.fireClock -= dt;
        if (s.diveClock <= 0) { chooseDivers(e); s.diveClock = modern(e)?(e.assist?waveDef(e).diveEvery+1.4:challenge(e)||classic(e)?waveDef(e).diveEvery:waveDef(e).diveEvery*.65):e.assist ? 5.5 : 4.4 - s.packet * .25; if(balanced(e))s.diveClock*=BALANCE_2100.diveEvery; }
        if (s.fireClock <= 0) {
          const ready = living(e).filter(x => (x.mode === 'formation'||!e.assist&&!classic(e)&&x.mode==='enter') && !x.fireCue);
          if(modern(e)){
            const def=waveDef(e),many=challenge(e)?Math.min(def.shooters,balanced(e)?BALANCE_2100.shooters:5):!e.assist&&['pair','mixed'].includes(def.volley)?2:1;
            if(challenge(e)){
              // Rotate real squadrons, rather than letting all 64 fire in the
              // same frame. Depleted groups hand their turn to the next group.
              const group=s.squadSerial++%def.groups;
              ready.sort((a,b)=>((a.squad-group+def.groups)%def.groups)-((b.squad-group+def.groups)%def.groups)||(tactics(e)?(a.lastShot||-100)-(b.lastShot||-100):0)||a.slot-b.slot);
            }else
            ready.sort((a,b)=>a.pos[0]-b.pos[0]);
            for(let i=0;i<Math.min(many,ready.length);i++){
              const x=challenge(e)?ready[(s.fireSerial%Math.max(1,Math.min(4,ready.length))+i)%ready.length]:ready[(s.fireSerial+(i?Math.floor(ready.length/2):0))%ready.length];x.cueAim=p.pos.slice();if(e.assist||classic(e))x.fireCue=x.attackCue=e.assist?1.15:.85;else enemyShot(e,x);
            }
            s.fireSerial++;s.fireClock=e.assist?def.fire+.85:challenge(e)||classic(e)?def.fire:def.fire/3;
            if(tactics(e))s.fireClock*=1-waveIndex(e)*.035;
            if(balanced(e))s.fireClock*=BALANCE_2100.cadence;
          }else{
            if (ready.length) { ready[s.fireSerial++ % ready.length].fireCue = e.assist ? .95 : .7; }
            s.fireClock = e.assist ? 2.5 - s.packet * .15 : 1.75 - s.packet * .12;
          }
        }
      }
      for (const x of e.enemies) if (!x.dead) {
        const oldEnemy = updateEnemy(e, x, dt);
        if (x.mode === 'dive' && !x.route.hit && flightSegment(V3.sub(oldEnemy, oldPlayer), V3.sub(x.pos, p.pos), [0, 0, 0], x.r + 1.65) !== null) {
          if (takeDamage(e, 24)) x.route.hit = true;
        }
      }
      if (e.status !== 'playing') return;
      if (input.fire) e.fire(); if (input.missile) e.missile(); if (input.pulse) e.pulse(); if (input.flip) e.flip();
      for (const b of e.bullets) {
        const old = b.pos; b.pos = V3.add(b.pos, V3.scale(b.vel, dt)); b.life -= dt;
        let target = null, first = Infinity;
        for (const x of e.enemies) {
          if (x.dead) continue;
          const contact = flightSegment(old, b.pos, x.pos, x.r + b.r);
          if (contact !== null && contact < first) { target = x; first = contact; }
        }
        // Torpedoes are physical targets: holding a firing lane can destroy
        // them. This creates an offensive answer besides pulse/evade.
        if(tactics(e))for(const rocket of e.hostile){
          if(rocket.type!=='swarm-torpedo'||rocket.life<=0)continue;
          const contact=flightSegment(old,b.pos,rocket.pos,rocket.r+b.r);
          if(contact!==null&&contact<first){rocket.life=0;b.life=0;target=null;first=contact;
            s.torpedoesIntercepted=(s.torpedoesIntercepted||0)+1;e.explosions.push({pos:rocket.pos.slice(),life:.28,max:.28,color:'#eeb98c'});break;}
        }
        if (target) {
          b.life = 0; e.hit(target, b.damage);
          if (b.type === 'missile') for (const x of e.enemies) if (!x.dead && x !== target && V3.len(V3.sub(x.pos, target.pos)) < 12) e.hit(x, b.damage * .65);
        }
      }
      for (const b of e.hostile) {
        if(tactics(e)&&b.life<=0)continue;
        if(challenge(e)&&b.homing>0){
          b.age=(b.age||0)+dt;b.homing=Math.max(0,b.homing-dt);
          const delta=V3.sub(p.pos,b.pos),length=Math.hypot(delta[0],delta[1])||1,k=Math.min(1,dt*1.15),speed=b.speed||30;
          b.vel=[mix(b.vel[0],delta[0]/length*speed,k),mix(b.vel[1],delta[1]/length*speed,k),0];
        }
        const old = b.pos; b.pos = V3.add(b.pos, V3.scale(b.vel, dt)); b.life -= dt;
        if (flightSegment(V3.sub(old, oldPlayer), V3.sub(b.pos, p.pos), [0, 0, 0], 1.65 + b.r) !== null) { b.life = 0; takeDamage(e, b.damage); }
      }
      e.enemies = e.enemies.filter(x => !x.dead);
      e.bullets = e.bullets.filter(x => x.life > 0 && x.pos[1] < 82).slice(-36);
      e.hostile = e.hostile.filter(x => x.life > 0 && x.pos[1] > -80 && Math.abs(x.pos[0]) < 78).slice(-(challenge(e)?LIMITS.hostile:modern(e)?e.assist?24:32:22));
      if(challenge(e))s.peakHostile=Math.max(s.peakHostile,e.hostile.length);
      if (e.status === 'playing' && !living(e).length) awardWave(e);
    }
    for (const x of e.explosions) x.life -= dt;
    e.explosions = e.explosions.filter(x => x.life > 0).slice(-14);
    for (const x of e.particles) { x.life -= dt; x.pos = V3.add(x.pos, V3.scale(x.vel, dt)); }
    e.particles = e.particles.filter(x => x.life > 0).slice(-36);
  }

  proto.beginStage = function (n) {
    this.swarm = null; const result = previous.beginStage.call(this, n);
    if (n === 2 && !this.finale) { initialise(this); this.say('Шесть звеньев роя. Каждые две волны дают пакет требований. Маневрируй, сбивай опасные корабли и подбирай снабжение.', 'brief', true); }
    return result;
  };
  proto.launch = function (...args) {
    if (!active(this) || this.status !== 'briefing') return previous.launch.apply(this, args);
    this.status = 'playing'; this.autopilot = false;
    this.say('Корабль внизу экрана. WASD или джойстик — манёвр, огонь — прямо вверх. '+(this.assist?'Подсветка врага означает скорое пике. ':'ПКМ / Q — ракеты. ')+ 'Импульс очищает экран от снарядов.', 'order', true);
    this.emit('state', 'playing');
  };
  proto.step = function (delta, input = {}) {
    if (!active(this) || this.status !== 'playing') return previous.step.call(this, delta, input);
    const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, .04); if (dt > 0) stepSwarm(this, dt, input);
  };
  proto.fire = function (...args) {
    if (!active(this)) return previous.fire.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.shotCooldown > 0 || this.swarm.phase === 'cleared') return false;
    const boosted=modern(this)&&this.swarm.time<this.swarm.overdriveUntil;
    p.shotCooldown = .24 * Math.pow(.9, this.upgrades.weapons)*(boosted?.72:1); this.shots++;
    for (const side of [-1, 1]) this.bullets.push({ pos: [p.pos[0] + side * 1.45, p.pos[1] + 4, 0],
      vel: [0, 132, 0], life: 1.25, damage: 14 * (1 + .25 * this.upgrades.weapons)*(boosted?1.1:1), r: .5, type: 'laser', color: boosted?'#fff0ad':'#9cffff' });
    this.emit('shot'); return true;
  };
  proto.missile = function (...args) {
    if (!active(this)) return previous.missile.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.missileCooldown > 0 || p.missiles < 1 || this.swarm.phase === 'cleared') return false;
    p.missiles--; p.missileCooldown = .8;
    this.bullets.push({ pos: [p.pos[0], p.pos[1] + 5, 0], vel: [0, 103, 0], life: 1.6,
      damage: 80 * (1 + .3 * this.upgrades.rockets), r: 1.1, type: 'missile', color: '#ffe3a0' });
    this.emit('missile'); return true;
  };
  proto.hit = function (enemy, amount) {
    if (!active(this) || !enemy.swarmDrone) return previous.hit.call(this, enemy, amount);
    if (enemy.dead || !Number.isFinite(amount) || amount <= 0) return;
    if(challenge(this)&&enemy.shield>0){
      // One finite frontal capacitor, visible around the hull. A missile
      // breaks it immediately; dives expose the unshielded body.
      if(enemy.mode==='dive'||amount>=60)enemy.shield=0;
      else{const absorbed=Math.min(enemy.shield,amount*.65);enemy.shield-=absorbed;amount-=absorbed;}
    }
    enemy.hp -= amount; enemy.hit = .16; this.hitFlash = .12; this.hits++;
    if (enemy.hp > 0) return;
    dropSupply(this,enemy);enemy.dead = true; this.totalKills++; this.stageKills++; this.combo++; this.comboTime = 5; this.maxCombo = Math.max(this.maxCombo, this.combo);
    const s = this.swarm, slot = s.slots[enemy.slot];
    if (slot && !slot.paid) { this.score += [55, 85, 125][enemy.rank]; slot.paid = true; slot.dead = true; s.cleared[s.packet]++; s.transfer[s.packet] = s.cleared[s.packet]; }
    s.shotsCleared++; this.explosions.push({ pos: enemy.pos.slice(), life: .5, max: .5, color: enemy.color });
    if(modern(this))s.waveKills++;
    if(tactics(this))for(let i=0;i<4;i++){
      const angle=(enemy.slot*.7+i*Math.PI*.5);this.particles.push({pos:enemy.pos.slice(),vel:[Math.cos(angle)*12,Math.sin(angle)*12,0],life:.48,max:.48,color:enemy.color,shard:true});
    }
    this.emit('destroy', 'swarm');
  };
  proto.pulse = function (...args) {
    if (!active(this)) return previous.pulse.apply(this, args);
    const p = this.player;
    if (this.status !== 'playing' || p.pulseCooldown > 0) return false;
    p.pulseCooldown = 12; p.invulnerable = Math.max(1, p.invulnerable); this.pulseWave = 1; this.hostile = [];
    for (const x of this.enemies) if (!x.dead && x.mode === 'dive' && x.pos[1] < -10) this.hit(x, 40);
    this.emit('pulse'); return true;
  };
  proto.flip = function (...args) {
    if (!active(this)) return previous.flip.apply(this, args);
    if (this.status !== 'playing' || this.player.flipCooldown > 0) return false;
    this.player.flipCooldown = 4; this.player.invulnerable = Math.max(.7, this.player.invulnerable); this.emit('flip'); return true;
  };
  proto.collect = function (item, ...args) {
    if (active(this) && item?.type === 'requirement' && !AWARDING.has(this)) return false;
    return previous.collect.call(this, item, ...args);
  };
  proto.openNextLesson = function (...args) { if (!active(this)) return previous.openNextLesson.apply(this, args); };
  proto.continueLesson = function (...args) { const result = previous.continueLesson.apply(this, args); if (active(this)) this.autopilot = false; return result; };
  proto.checkStage = function (...args) { if (!active(this)) return previous.checkStage.apply(this, args); };
  proto.navTarget = function (...args) { return active(this) ? { pos: [0, 38, 0], name: 'Рой · волна ' + (waveIndex(this)+1), swarmFormation: true } : previous.navTarget.apply(this, args); };
  proto.guidance = function (input) { return active(this) ? input : previous.guidance.call(this, input); };
  proto.interact = function (...args) { if (!active(this)) return previous.interact.apply(this, args); this.say(this.objective().detail, 'order', true); return false; };
  proto.objective = function (...args) {
    if (!active(this)) return previous.objective.apply(this, args);
    const s = this.swarm;
    return { title: s.phase === 'cleared' ? modern(this)&&s.waveIndex%2===0?'Звено разбито · подберите снабжение':'Пакет требований на борту' : modern(this)?waveName(this):'Разбейте три волны роя',
      detail: (mobile() ? 'Джойстик — манёвр, «Огонь» — стрелять вверх. ' : 'WASD — манёвр, пробел — стрелять вверх. ') +
        (this.assist?(modern(this)?waveDef(this).lesson+' Снабжение подбирается кораблём.':'Подсвеченные корабли пикируют. Уклоняйтесь от янтарных снарядов; импульс их рассеивает.'):'ПКМ / Q — ракеты, E — импульс. Подбирайте снабжение и меняйте позицию.'),
      progress: 'ВОЛНА ' + (waveIndex(this)+1) + '/'+waveTotal(this)+' · ОСТАЛОСЬ ' + living(this).length + ' · ФТ ' + completed(this) + '/3' };
  };

  function layout(W, H) {
    const compact = W < 650 || H < 420 || mobile(), landscape = compact && W > H * 1.5;
    const top = landscape ? 51 : compact ? 92 : 91, bottom = compact ? 26 : 55;
    const height = Math.max(130, H - top - bottom), sy = height / 142;
    const width = Math.min(W - 24, sy * 116 * 1.55), sx = width / 116;
    return { W, H, compact, landscape, top, bottom, x: (W - width) / 2, y: top, width, height, sx, sy,
      cx: W / 2, cy: top + height * 72 / 142 };
  }
  function cameraFor(W, H) {
    const l = layout(W, H), depth = 100;
    return { pos: [0, (l.cy - H / 2) / l.sy, depth], f: [0, 0, -1], r: [l.sx / l.sy, 0, 0], u: [0, 1, 0],
      fov: 2 * Math.atan(H / (2 * depth * l.sy)), near: 1, far: 600, swarmArcade: true, layout: l };
  }
  function hudBounds(e, W, H) {
    if (!inArena(e)) return [];
    const l = layout(W, H), cam = cameraFor(W, H), unit = clamp(Math.min(l.sx * .55, l.sy * .95), 1, 3.5);
    const boxes = [{ x: 0, y: 0, width: W, height: l.top - 2, kind: 'progress' },
      { x: 0, y: H - l.bottom, width: W, height: l.bottom, kind: 'controls' }];
    const actor = (pos, kind, wide = 1) => {
      const q = spaceProject(pos, cam, W, H), r = unit * 11 * wide + 6;
      return { x: q.x - r, y: q.y - r, width: r * 2, height: r * 2, kind };
    };
    boxes.push(actor(e.player.pos, 'player', 1.15));
    const formation = [];
    for (const x of e.enemies) if (!x.dead) {
      const box = actor(x.pos, x.mode === 'dive' ? 'diver' : 'formation');
      if (e.assist && x.mode === 'tell') { box.y -= unit * 8; box.height += unit * 8; }
      if (x.mode === 'dive') boxes.push(box); else if (x.pos[1] < 73) formation.push(box);
    }
    if (formation.length) {
      const x = Math.min(...formation.map(b => b.x)), y = Math.min(...formation.map(b => b.y));
      boxes.push({ x, y, width: Math.max(...formation.map(b => b.x + b.width)) - x,
        height: Math.max(...formation.map(b => b.y + b.height)) - y, kind: 'formation' });
    }
    for (const b of e.hostile) { const q = spaceProject(b.pos, cam, W, H); boxes.push({ x: q.x - 9, y: q.y - 15, width: 18, height: 24, kind: 'projectile' }); }
    if (e.swarm.phase === 'cleared' || e.swarm.phase === 'entry' && e.swarm.waveAge < 1.2)
      boxes.push({ x: l.x, y: l.cy - 16, width: l.width, height: 45, kind: 'wave-banner' });
    return boxes;
  }
  spaceScene = function (e, time, fx = true) { return inArena(e) ? [] : view.scene(e, time, fx); };
  spaceCamera = function (e, time = 0, preview = false) {
    if (!inArena(e)) return view.camera(e, time, preview);
    const w = ARCADE.canvas?.width || 1280, h = ARCADE.canvas?.height || 720;
    const cssW = mobile() ? (ARCADE.canvas?.getBoundingClientRect().width || w) : w;
    return cameraFor(cssW, h / (w / cssW));
  };
  function polygon(c, points, fill) { c.fillStyle = fill; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
  function ship(c, x, y, unit, rank, color, angle = 0, flash = false, player = false) {
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(unit, unit);
    const pale = flash ? '#ffffff' : color;
    if (player) {
      polygon(c, [[0, -9], [2, -3], [3, 0], [8, 4], [8, 7], [3, 5], [2, 8], [-2, 8], [-3, 5], [-8, 7], [-8, 4], [-3, 0], [-2, -3]], '#4fa8c9');
      polygon(c, [[0, -9], [2, -2], [2, 6], [-2, 6], [-2, -2]], pale);
      c.fillStyle = '#fff4ad'; c.fillRect(-1, -3, 2, 4); c.fillStyle = '#7df8ff'; c.fillRect(-5, 2, 2, 4); c.fillRect(3, 2, 2, 4);
    } else {
      const wing = rank === 2 ? 9 : rank === 1 ? 8 : 7;
      polygon(c, [[-wing, -5], [-wing + 2, -5], [-4, 0], [-3, -4], [3, -4], [4, 0], [wing - 2, -5], [wing, -5], [wing, 3], [4, 6], [2, 3], [-2, 3], [-4, 6], [-wing, 3]], pale);
      polygon(c, [[-3, -5], [3, -5], [4, 0], [2, 7], [-2, 7], [-4, 0]], flash ? '#ffffff' : '#49679e');
      c.fillStyle = '#fff7ba'; c.fillRect(-3, -1, 2, 2); c.fillRect(1, -1, 2, 2);
      c.fillStyle = pale; c.fillRect(-1, 3, 2, 4);
      if (rank === 2) { c.fillStyle = '#fff1be'; c.fillRect(-2, -7, 4, 2); }
    }
    c.restore();
  }
  function drawSwarmHUD(c, e, cam, w, h) {
    c.clearRect(0, 0, w, h);
    const cssW = mobile() ? (ARCADE.canvas?.getBoundingClientRect().width || w) : w;
    const ratio = w / cssW, W = w / ratio, H = h / ratio, l = layout(W, H), camera = cameraFor(W, H);
    const s = e.swarm, p = e.player, unit = clamp(Math.min(l.sx * .55, l.sy * .95), 1, 3.5);
    c.save(); c.scale(ratio, ratio); c.textBaseline = 'middle'; c.fillStyle = '#060d20'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 82; i++) {
      const x = ((i * 137.71 + e.seed % 197) % 997) / 997 * W;
      const y = ((i * 71.31 + s.time * (i % 3 + 1) * 3) % 809) / 809 * H;
      c.fillStyle = ['#c2d9f0', '#7183ad', '#52728f'][i % 3]; c.globalAlpha = .3 + (i % 5) * .1;
      c.fillRect(x, y, i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
    }
    c.globalAlpha = 1;
    const project = pos => spaceProject(pos, camera, W, H);
    c.strokeStyle = '#21425f'; c.lineWidth = 1; c.beginPath();
    c.moveTo(l.x - 4, l.top); c.lineTo(l.x - 4, H - l.bottom); c.moveTo(l.x + l.width + 4, l.top); c.lineTo(l.x + l.width + 4, H - l.bottom); c.stroke();
    c.save(); c.beginPath(); c.rect(l.x - 8, l.top - 8, l.width + 16, l.height + 16); c.clip();
    for (const x of e.enemies) if (!x.dead) {
      const q = project(x.pos), diving = x.mode === 'dive';
      if (diving) {
        c.strokeStyle = x.color + '54'; c.lineWidth = unit * 1.2;
        const d = V3.norm(x.vel); c.beginPath(); c.moveTo(q.x, q.y); const tail = project(V3.sub(x.pos, V3.scale(d, 8))); c.lineTo(tail.x, tail.y); c.stroke();
      }
      if (e.assist && x.mode === 'tell') {
        c.strokeStyle = '#fff1b3'; c.lineWidth = 1.5; c.beginPath(); c.arc(q.x, q.y, unit * 11, -.4, Math.PI + .4); c.stroke();
        c.fillStyle = '#ffe48e'; c.font = 'bold ' + Math.max(12, unit * 6) + 'px Arial'; c.textAlign = 'center'; c.fillText('!', q.x, q.y - unit * 15);
      }
      const angle = diving ? clamp(Math.atan2(x.vel[0], -x.vel[1]), -.75, .75) : Math.sin(x.age * 5 + x.slot) * .045;
      ship(c, q.x, q.y, unit, x.rank, x.color, angle, x.hit > 0);
      if (e.assist && x.fireCue > 0) { c.fillStyle = '#fff0b2'; c.beginPath(); c.arc(q.x, q.y + unit * 9, unit * (2.3 + Math.sin(x.fireCue * 19) * .6), 0, Math.PI * 2); c.fill(); }
      if (x.rank && x.hp < x.maxHp) { c.fillStyle = '#294059'; c.fillRect(q.x - unit * 7, q.y - unit * 11, unit * 14, 2); c.fillStyle = x.color; c.fillRect(q.x - unit * 7, q.y - unit * 11, unit * 14 * x.hp / x.maxHp, 2); }
    }
    for (const b of e.bullets) {
      const q = project(b.pos); c.fillStyle = b.color; c.fillRect(q.x - (b.type === 'missile' ? 2.5 : 1.4), q.y - (b.type === 'missile' ? 8 : 6), b.type === 'missile' ? 5 : 2.8, b.type === 'missile' ? 13 : 10);
      if (b.type === 'missile') { c.fillStyle = '#ffae61'; c.fillRect(q.x - 1.5, q.y + 5, 3, 7); }
    }
    for (const b of e.hostile) {
      const q = project(b.pos); c.strokeStyle = '#e79c535c'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(q.x, q.y - 10); c.lineTo(q.x, q.y); c.stroke();
      c.fillStyle = '#ffe4a6'; c.beginPath(); c.arc(q.x, q.y, l.compact ? 3.1 : 3.8, 0, Math.PI * 2); c.fill();
    }
    const player = project(p.pos);
    if (p.hp > 0 && !(p.invulnerable > 0 && Math.floor(s.time * 13) % 2)) {
      c.fillStyle = '#69dffb88'; c.fillRect(player.x - unit, player.y + unit * 7, unit * 2, unit * (p.boosting ? 10 : 4 + Math.sin(s.time * 25)));
      ship(c, player.x, player.y, unit * 1.1, 0, '#defaff', p.bank, false, true);
    }
    if (e.pulseWave > 0) { c.strokeStyle = '#a4ffff'; c.lineWidth = 2; c.globalAlpha = e.pulseWave; c.beginPath(); c.ellipse(player.x, player.y, (1 - e.pulseWave) * l.width, (1 - e.pulseWave) * l.height, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    for (const x of e.explosions) {
      const q = project(x.pos), age = 1 - x.life / x.max; c.strokeStyle = x.color; c.lineWidth = 2; c.globalAlpha = 1 - age;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = unit * (3 + age * 15); c.beginPath(); c.moveTo(q.x + Math.cos(a) * r * .5, q.y + Math.sin(a) * r * .5); c.lineTo(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); c.stroke(); }
    }
    c.globalAlpha = 1;
    if (e.crash) { const t = e.crash.time || 0; c.strokeStyle = '#ffc281'; c.lineWidth = 3; c.globalAlpha = Math.max(.1, 1 - t / 3); c.beginPath(); c.arc(player.x, player.y, 8 + t * 24, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    c.restore();
    const pad = l.compact ? 9 : 22, metricsY = l.landscape ? 17 : l.compact ? 18 : H - 29;
    c.textAlign = 'left'; c.font = 'bold ' + (l.compact ? 11 : 13) + 'px Arial'; c.fillStyle = p.hp < 30 ? '#ffb19a' : '#b5ffe2';
    c.fillText('ЩИТ ' + Math.ceil(p.hp) + '%', pad, metricsY); c.fillStyle = '#ffe1a0'; c.fillText('РАКЕТЫ ' + p.missiles, pad + 91, metricsY);
    c.fillStyle = '#b4d5ef'; c.fillText((l.compact ? 'ИМПУЛЬС ' : 'E · ИМПУЛЬС ') + (p.pulseCooldown > 0 ? Math.ceil(p.pulseCooldown) + 'с' : 'ГОТОВ'), pad + 186, metricsY);
    c.fillStyle = '#25445c'; c.fillRect(pad, metricsY + 10, Math.min(293, W - 2 * pad), 3); c.fillStyle = '#92e2c0'; c.fillRect(pad, metricsY + 10, Math.min(293, W - 2 * pad) * p.hp / 100, 3);
    const titleY = l.landscape ? 15 : l.compact ? 51 : 25;
    const titleX = l.landscape ? W - 12 : W / 2, maxTitle = l.landscape ? Math.max(200, W - 334) : W - 18;
    c.textAlign = l.landscape ? 'right' : 'center'; c.fillStyle = '#dcedff'; c.font = 'bold ' + (l.compact ? 13 : 18) + 'px Arial';
    c.fillText('РОЙ УТОЧНЕНИЙ · ВОЛНА ' + (waveIndex(e)+1) + ' / '+waveTotal(e), titleX, titleY, maxTitle);
    c.font = 'bold ' + (l.compact ? 10 : 12) + 'px Arial'; c.fillStyle = '#ffd294';
    const hint = s.phase === 'cleared' ? modern(e)&&s.waveIndex%2===0?'ЗВЕНО РАЗБИТО · ПОДБЕРИТЕ СНАБЖЕНИЕ':'ВОЛНА ПРОЙДЕНА · ПАКЕТ ФТ НА БОРТУ' :
      'ОСТАЛОСЬ ' + living(e).length + ' / ' + waveCount(e) + '    ·    ПАКЕТЫ ФТ ' + completed(e) + ' / 3';
    c.fillText(hint, titleX, titleY + (l.compact ? 19 : 25), maxTitle);
    if (!l.landscape && !l.compact) { c.fillStyle = '#829db8'; c.font = '11px Arial'; c.fillText('Строй подсветился → враги пикируют. Янтарные точки — вражеские снаряды.', W / 2, 71, W - 30); }
    c.textAlign = 'center'; c.font = (l.compact ? 10 : 12) + 'px Arial'; c.fillStyle = '#a9c6dc';
    c.fillText(l.compact ? 'ДЖОЙСТИК — МАНЁВР  ·  ОГОНЬ — ВВЕРХ' : 'WASD — МАНЁВР  ·  ПРОБЕЛ — ОГОНЬ ВВЕРХ  ·  Q — РАКЕТА  ·  E — ИМПУЛЬС', W / 2, H - (l.compact ? 10 : 13), W - 20);
    if (s.phase === 'entry' && s.waveAge < 1.2 || s.phase === 'cleared') {
      c.font = 'bold ' + (l.compact ? 18 : 27) + 'px Arial'; c.fillStyle = s.phase === 'cleared' ? '#a7ffe0' : '#d2e7ff';
      c.fillText(s.phase === 'cleared' ? modern(e)&&s.waveIndex%2===0?'ЗВЕНО РАЗБИТО!':'ФТ ' + completed(e) + ' / 3 · ПРИНЯТО!' : 'ВОЛНА ' + (waveIndex(e)+1), W / 2, l.cy + 8, l.width);
    }
    if (e.flash > 0) { c.fillStyle = 'rgba(255,108,91,' + Math.min(.13, e.flash * .35) + ')'; c.fillRect(l.x, l.top, l.width, l.height); }
    c.restore();
  }
  drawFlightHUD = function (c, e, cam, w, h) { return inArena(e) ? drawSwarmHUD(c, e, cam, w, h) : view.flightHUD(c, e, cam, w, h); };
  drawMobileGameHUD = function (c, e, cam, w, h) { return inArena(e) ? drawSwarmHUD(c, e, cam, w, h) : view.mobileHUD(c, e, cam, w, h); };
  drawCampaignFlightHUD = function (...args) { if (!inArena(args[1])) return view.campaignHUD(...args); };
  drawClarityHUD = function (...args) { if (!inArena(args[1])) return view.clarityHUD(...args); };
  function controls(e) {
    const crystal = document.getElementById('mobile-crystal');
    const arena=active(e);
    document.getElementById('arcade-screen')?.classList.toggle('swarm270-controls',arena);
    for(const node of document.querySelectorAll('.arcade-touch [data-action="arcade-flip"]')){
      node.textContent=arena?'УВОРОТ':'РАЗВОРОТ';
      node.setAttribute('aria-label',arena?'Уворот: защита на 0,7 секунды, восстановление 4 секунды':'Разворот');
    }
    if (!active(e)) {
      if (crystal?.dataset.swarmCaption === VERSION) {
        if (/^Цель: (три|шесть) волн/.test(crystal.textContent)) crystal.textContent = 'К кристаллу ↗';
        delete crystal.dataset.swarmCaption;
      }
      return;
    }
    for (const id of ['citadel-primary', 'mobile-guide']) {
      const node = document.getElementById(id); if (!node) continue;
      node.textContent = mobile() ? 'Джойстик · Манёвр' : 'WASD · Манёвр'; node.disabled = true;
      node.setAttribute('aria-label', 'В рое управляйте кораблём вручную; после '+waveTotal(e)+' волн вернётся автокурс'); node.setAttribute('aria-pressed', 'false');
    }
    if (crystal) { crystal.textContent = modern(e)?'Цель: шесть волн':'Цель: три волны'; crystal.disabled = false; crystal.dataset.swarmCaption = VERSION; }
    ARCADE.canvas?.setAttribute?.('aria-label', 'Рой уточнений: корабль игрока внизу, '+waveTotal(e)+' волн космических врагов сверху. Джойстик перемещает корабль, огонь направлен вверх.');
  }
  updateMobileArcade = function (...args) { const result = view.mobileUpdate.apply(this, args); controls(ARCADE.engine); return result; };
  updateCitadelClarity = function (...args) {
    const e = ARCADE.engine; if (!active(e)) return view.clarityUpdate.apply(this, args);
    const route = document.getElementById('citadel-route');
    if (route) {
      const html = '<div class="route-missions"><b>УРОВЕНЬ 7 · РОЙ УТОЧНЕНИЙ</b></div>' +
        '<div class="route-count"><small>ВОЛНА</small><b>' + (waveIndex(e)+1) + '<em>/'+waveTotal(e)+'</em></b></div>' +
        '<div class="route-count"><small>ПРОТИВНИКОВ</small><b>' + living(e).length + '</b></div>' +
        '<div class="route-count"><small>ПАКЕТЫ ФТ</small><b>' + completed(e) + '<em>/3</em></b></div>';
      if (route.innerHTML !== html) route.innerHTML = html;
    }
    const toast = document.getElementById('citadel-toast'); if (toast) toast.hidden = true; controls(e);
  };
  updateArcadeHUD = function (...args) {
    const result = view.update.apply(this, args), e = ARCADE.engine; if (!active(e)) return result;
    for (const [id, text] of [['arcade-mission-title', 'Рой уточнений'], ['arcade-stage-label', 'УРОВЕНЬ 07 / 14'],
      ['arcade-mission-brief', modern(e)?'Шесть разных атак. Два звена — один пакет требований. Подбирайте снабжение.':'Разбейте три эскадрильи и заберите три пакета требований.'], ['arcade-mission-kills', e.stageKills]]) {
      const node = document.getElementById(id); if (node) node.textContent = String(text);
    }
    controls(e); return result;
  };
  arcadeOverlayHTML = function (...args) {
    const e = ARCADE.engine; if (!active(e) || e.status !== 'briefing') return view.overlay.apply(this, args);
    return '<div class="arcade-state-card briefing simple-brief"><span class="arcade-serial">УРОВЕНЬ 7 / 14 · КОСМИЧЕСКАЯ АРКАДА</span>' +
      '<h3>Рой уточнений</h3><p>'+(challenge(e)?'8, 16, 32, затем три армады по 64 корабля. Четыре звена заходят с флангов; щитоносцы прикрывают торпедоносцев и командиров. Каждые две волны — один пакет требований.':modern(e)?'Шесть волн: разведка, встречный курс, ромб, клещи, смешанное звено и командиры. Каждые две волны — один пакет требований.':'Противники собираются в строй и группами пикируют на тебя. Разбей три волны — получишь три пакета требований.')+'</p>' +
      '<div class="brief-command"><span class="crystal-symbol">✦</span><div><b>Корабль внизу. Огонь — вверх.</b>' +
      '<small>WASD или джойстик перемещают корабль. Совмещайся с врагом по горизонтали и стреляй. Ракета летит прямо и взрывается при попадании. Уязвимо светящееся ядро корабля.</small></div></div>' +
      '<div class="brief-command"><span class="hostile-symbol">!</span><div><b>'+(e.assist?'Подсвеченный враг готовится пикировать':'Читай движение кораблей и снарядов')+'</b>' +
      '<small>Импульс (E) очищает экран, восстанавливается 12 секунд. Уворот (R) защищает на 0,7 секунды, восстанавливается 4 секунды. На телефоне — кнопки «Импульс» и «Уворот» рядом с огнём.</small></div></div>' +
      (modern(e)?'<div class="brief-command"><span class="crystal-symbol">+</span><div><b>Снабжение за опасные перехваты</b><small>Подлети к капсуле: крест — ремонт, ракета — боезапас, молния — усиление огня на 7 секунд. За снабжением не обязательно рисковать.</small></div></div>':'')+
      '<button class="arcade-play" data-action="citadel-launch">В БОЙ С РОЕМ ↗</button>' +
      '<small>'+waveTotal(e)+' волн → 3 пакета ФТ → разбор решений → Цитадель.</small></div>';
  };
  function explainManual(e) { e.autopilot = false; e.say((modern(e)?'Шесть волн роя. ':'Три волны роя. ')+'WASD или джойстик — манёвр, огонь — прямо вверх. Уклоняйся от пикирующих кораблей и янтарных снарядов. После боя автокурс вернётся.', 'order', true); }
  arcadeAction = function (action, value) {
    const e = ARCADE.engine;
    if (active(e) && ['citadel-guidance', 'citadel-primary', 'citadel-crystal'].includes(action)) { explainManual(e); return true; }
    return view.action(action, value);
  };
  mobileAction = function (action, value) {
    const e = ARCADE.engine; if (active(e) && action === 'mobile-guide') { explainManual(e); return true; }
    return view.mobileAction(action, value);
  };
  if (typeof CUP_ENGINE_KEYS !== 'undefined' && !CUP_ENGINE_KEYS.includes('swarm')) CUP_ENGINE_KEYS.push('swarm');
  // The original phone dock hides the pulse and flip controls. A four-button
  // grid exposes the existing combat actions without reducing touch targets
  // or covering the arena; the generic flight dock returns on mission exit.
  if(!document.getElementById('citadel-swarm-controls270')){
    const style=document.createElement('style');style.id='citadel-swarm-controls270';
    style.textContent='@media(max-width:899px){'+
      '.arcade-layout .arcade-screen.swarm270-controls .arcade-touch-actions{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:48px 48px}'+
      '.arcade-layout .arcade-screen.swarm270-controls #arcade-fire-touch{grid-column:1;grid-row:1;min-height:48px;height:48px}'+
      '.arcade-layout .arcade-screen.swarm270-controls [data-action="arcade-missile"]{grid-column:2;grid-row:1}'+
      '.arcade-layout .arcade-screen.swarm270-controls #arcade-boost-touch{display:none}'+
      '.arcade-layout .arcade-screen.swarm270-controls .arcade-touch .desktop-touch-extra{display:block;min-height:48px;height:48px}'+
      '.arcade-layout .arcade-screen.swarm270-controls [data-action="arcade-pulse"]{grid-column:1;grid-row:2}'+
      '.arcade-layout .arcade-screen.swarm270-controls [data-action="arcade-flip"]{grid-column:2;grid-row:2}'+
      '}';document.head.appendChild(style);
  }
  if (typeof CUP_LEVELS !== 'undefined') CUP_LEVELS[6] = 'Рой уточнений';
  if (typeof cupUnpack === 'function') {
    const unpack = cupUnpack;
    cupUnpack = function (...args) {
      const e = unpack.apply(this, args);
      if (e.stage === 2 && !e.finale && !e.crash && ['orientation', 'battle', 'retrieve', 'swarm'].includes(e.phase) &&
        (!e.swarm || ![VERSION,'2.6.0','2.5.0',LEGACY].includes(e.swarm.version))) initialise(e, true);
      return e;
    };
  }
  // Older diagnostics may still ask about the retired communication window or
  // hazard rectangles. Keep those query names harmless, but expose real waves.
  globalThis.CITADEL_SWARM = Object.freeze({ version: VERSION, tacticsVersion:'2.8.0',balanceVersion:'2.10.0',balance:BALANCE_2100,balanced,active, completed, modern, challenge, tactics,waveIndex, waveTotal, waveDefinition:waveDef, waves:CHALLENGE,trainingWaves:WAVES,limits:LIMITS,
    insideWindow: () => false, windowAt: () => null, formationPoint, secondsNeeded: waveCount,
    arena: ARENA, formations: FORMS, liveRegions: () => [], regionContains: () => false,
    regionPoint: (a, u, v, z = 0) => [a.u[0] * u + a.v[0] * v, a.u[1] * u + a.v[1] * v, z],
    layout, cameraFor, hudBounds,
    inspection: e => !configured(e) ? null : ({ packet: e.swarm.packet, wave: waveIndex(e)+1,totalWaves:waveTotal(e),wavesCleared:modern(e)?e.swarm.wavesCleared:completed(e), downloaded: completed(e),
      transfer: e.swarm.transfer.slice(), formation: waveName(e), inside: false, blocked: false,
      drones: living(e).length, remaining: living(e).length, total: waveCount(e), cleared: e.swarm.cleared.slice(),
      divers: living(e).filter(x => ['tell', 'dive'].includes(x.mode)).length, hazards: e.hostile.length, complete: e.swarm.complete,
      pickups:modern(e)?e.swarm.pickups.length:0,overdrive:modern(e)?Math.max(0,e.swarm.overdriveUntil-e.swarm.time):0 }) });
})();
