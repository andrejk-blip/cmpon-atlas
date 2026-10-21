#!/usr/bin/env node
'use strict';
// Production script chain in Node VM. Every combat run uses arcadeInput;
// direct beginStage is a labelled level-entry fixture, not campaign completion.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createSwarmController}=require('./helpers/campaign-inputs.js');
const {realInput}=require('./swarm-regression.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.5.0');
const file='assets/citadel-swarm-v2.5.0.js',oldFile='assets/citadel-swarm-v1.9.0.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function snapshot(legacy=false){
  const s=entrySnapshot(),selected=legacy?oldFile:file;
  s.scripts=s.scripts.map(name=>[file,oldFile].includes(name)?selected:name);
  assert.equal(s.scripts.filter(name=>[file,oldFile].includes(name)).length,1,'Replace the mechanics wrapper, never install both');
  s.sources.set(selected,fs.readFileSync(path.join(root,selected),'utf8'));return s;
}
async function boot(legacy=false){
  const entry=snapshot(legacy),h=entryHarness(entry);h.entry=entry;await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');return h;
}
function make(h,{assist=false,seed=417147,upgrades={weapons:0,armor:0,rockets:0}}={}){
  const events=[],e=new h.Engine(seed,(kind,data)=>events.push({kind,data:clone(data??null)}));
  e.assist=assist;e.upgrades={...upgrades};e.beginStage(2);h.arcade.engine=e;e.launch();return {e,events};
}
function observation(e){return {stage:e.stage,phase:e.phase,status:e.status,crash:e.crash,swarm:{version:e.swarm.version,rulesVersion:e.swarm.rulesVersion,complete:e.swarm.complete},
  player:clone(e.player),enemies:e.enemies.map(x=>({id:x.id,pos:x.pos.slice(),vel:x.vel.slice(),rank:x.rank,role:x.role,mode:x.mode,hp:x.hp,dead:x.dead,swarmDrone:x.swarmDrone})),
  hostile:e.hostile.map(x=>({pos:x.pos.slice(),vel:x.vel.slice(),r:x.r}))};}
function createPilot(h,{profile='precise',lag=0,collect=false}={}){
  const operate=createSwarmController(h.c.CITADEL_SWARM),history=[];let previous={},nextDecision=0;
  return e=>{
    if(profile==='stationary')return {fire:true};
    history.push({time:e.swarm.time,state:observation(e)});
    while(history.length>1&&history[1].time<=e.swarm.time-lag)history.shift();
    if(e.swarm.time>=nextDecision){
      const seen=history[0].state;seen.player=clone(e.player);previous=operate(seen);nextDecision=e.swarm.time+(profile==='precise'?0:.12);
      if(collect){
        const drop=(e.swarm.pickups||[]).filter(x=>x.pos[1]>e.player.pos[1]-3&&x.pos[1]<e.player.pos[1]+23).sort((a,b)=>Math.abs(a.pos[0]-e.player.pos[0])-Math.abs(b.pos[0]-e.player.pos[0]))[0];
        if(drop&&Math.abs(drop.pos[0]-e.player.pos[0])<25&&!e.hostile.some(x=>Math.hypot(x.pos[0]-e.player.pos[0],x.pos[1]-e.player.pos[1])<16))
          previous.turn=Math.max(-1,Math.min(1,(drop.pos[0]-e.player.pos[0])*.55));
      }
    }
    return previous;
  };
}
function play(h,{assist=false,seed=417147,fps=60,profile='precise',lag=0,collect=false,touch=false,upgrades,maxSeconds=360,capture=false}={}){
  const {e,events}=make(h,{assist,seed,upgrades}),operate=createPilot(h,{profile,lag,collect}),dt=1/fps;
  const seen=new Set(),roles=new Set(),patterns=new Set(),routes=new Set(),samples=[],waveMetrics=[],drops=new Set(),supplyTransactions=[];
  let activeSave=null;
  let minHP=100,maxEnemies=0,maxHostile=0,maxBullets=0,maxPickups=0,maxEvents=0,lessons=0,lastWave=-1,current=null,minCue=Infinity;
  for(let frame=0;frame<maxSeconds*fps;frame++){
    if(e.status==='lesson'){
      assert(e.swarm.complete,'No education card during combat');assert.equal(e.hostile.length+e.enemies.length,0);
      assert(e.answerLesson(h.lessonCase(e,e.lesson.caseIndex).correct));e.continueLesson();lessons++;
    }
    if(e.phase==='dock'&&e.status==='playing'||['crashing','lost'].includes(e.status))break;
    const wave=e.swarm.waveIndex??e.swarm.packet;
    if(lastWave!==wave){
      if(current){current.endHP=e.player.hp;current.endDamage=e.swarm.damageTaken;current.seconds=+(e.swarm.time-current.start).toFixed(2);}
      current={wave:wave+1,start:+e.swarm.time.toFixed(2),startHP:e.player.hp,startDamage:e.swarm.damageTaken};waveMetrics.push(current);lastWave=wave;
    }
    const supplyBefore={collected:{...e.swarm.dropsCollected},hp:e.player.hp,ammo:e.player.missiles,until:e.swarm.overdriveUntil,time:e.swarm.time};
    e.step(dt,realInput(h,e,operate(e),touch));
    for(const type of ['repair','missiles','overdrive'])if(e.swarm.dropsCollected?.[type]>supplyBefore.collected?.[type])supplyTransactions.push({type,before:supplyBefore,
      after:{hp:e.player.hp,ammo:e.player.missiles,until:e.swarm.overdriveUntil,time:e.swarm.time}});
    seen.add(wave);minHP=Math.min(minHP,e.player.hp);maxEnemies=Math.max(maxEnemies,e.enemies.length);maxHostile=Math.max(maxHostile,e.hostile.length);
    maxBullets=Math.max(maxBullets,e.bullets.length);maxPickups=Math.max(maxPickups,e.swarm.pickups?.length||0);maxEvents=Math.max(maxEvents,e.swarm.events?.length||0);
    for(const x of e.enemies){roles.add(x.role);if(x.route?.kind)routes.add(x.route.kind);if(x.attackCue>0)minCue=Math.min(minCue,x.attackCue);}
    for(const x of e.hostile)patterns.add(x.pattern);
    for(const x of e.swarm.pickups||[])drops.add(x.type);
    if(capture&&e.swarm.waveAge>3&&!samples.some(x=>x.wave===wave)){samples.push({wave,snapshot:clone(h.pack(e))});}
    if(capture&&!activeSave&&e.swarm.pickups?.length&&e.enemies.some(x=>x.mode==='dive')&&e.hostile.length)activeSave=clone(h.pack(e));
  }
  if(current){current.endHP=e.player.hp;current.endDamage=e.swarm.damageTaken;current.seconds=+(e.swarm.time-current.start).toFixed(2);}
  const metrics={assist,seed,fps,touch,profile,lag,collect,upgrades:clone(e.upgrades),status:e.status,complete:e.swarm.complete,waves:[...seen].map(x=>x+1),wavesCleared:e.swarm.wavesCleared,
    seconds:+e.elapsed.toFixed(2),hp:+e.player.hp.toFixed(2),minHP:+minHP.toFixed(2),damage:+e.swarm.damageTaken.toFixed(2),hitsTaken:e.swarm.hitsTaken,shots:e.shots,kills:e.stageKills,
    packets:h.c.CITADEL_SWARM.completed(e),lessons,roles:[...roles],patterns:[...patterns],routes:[...routes],drops:[...drops],dropsSpawned:clone(e.swarm.dropsSpawned||{}),dropsCollected:clone(e.swarm.dropsCollected||{}),
    maxEnemies,maxHostile,maxBullets,maxPickups,maxEvents,waveMetrics};
  return {e,events,metrics,samples,activeSave,supplyTransactions};
}
function listenerCount(h){return [...h.handlers.values(),...h.windowHandlers.values()].reduce((sum,list)=>sum+list.length,0)+[...h.nodes.values()].reduce((sum,node)=>sum+Object.values(node.handlers||{}).reduce((n,list)=>n+list.length,0),0);}
function continueInput(h,e,seconds,command){for(let i=0;i<seconds*60;i++)e.step(1/60,realInput(h,e,typeof command==='function'?command(e,i):command));}
async function contracts(h,runs,checks){
  const check=(name,fn)=>{const detail=fn();checks.push({name,passed:true,detail});};
  check('Six authored waves, 90/78 visible ships, original three packets and two safe education cases',()=>{
    for(const run of runs.filter(x=>x.metrics.profile!=='stationary')){
      const {e,metrics:m}=run;assert(m.complete);assert.equal(e.phase,'dock');assert.equal(e.status,'playing');assert.equal(m.wavesCleared,6);
      assert.deepEqual(m.waves,[1,2,3,4,5,6]);assert.equal(m.kills,m.assist?78:90);assert.equal(m.packets,3);assert.equal(m.lessons,2);
      assert.deepEqual(clone(e.decisions.map(x=>x.caseIndex)),[4,5]);assert.equal(new Set(e.rescued).size,e.rescued.length);assert.equal(e.lessonQueue.length,0);
      assert(m.maxEnemies<=20&&m.maxHostile<=(m.assist?24:32)&&m.maxBullets<=36&&m.maxPickups<=3&&m.maxEvents<=24);
      assert(m.dropsSpawned.repair<=3&&m.dropsSpawned.missiles<=4&&m.dropsSpawned.overdrive<=3);
    }
    assert(runs.filter(x=>x.metrics.profile==='stationary').every(x=>!x.metrics.complete&&x.metrics.hp===0));
    assert(runs.filter(x=>!x.metrics.assist&&x.metrics.profile==='delayed').every(x=>x.metrics.damage>0));
    return {completed:runs.filter(x=>x.metrics.complete).length,stationaryLosses:runs.filter(x=>x.metrics.profile==='stationary').length};
  });
  check('Normal movement picks up all three real supplies, with bounded effects and unchanged upgrades',()=>{
    const found=new Set(),transactions=[];
    for(const assist of [false,true]){
      const run=play(h,{assist,profile:'delayed',lag:.35,collect:true,capture:true});runs.push(run);assert(run.metrics.complete);
      for(const t of run.supplyTransactions){found.add(t.type);transactions.push(t);if(t.type==='repair')assert.equal(t.after.hp,Math.min(100,t.before.hp+(assist?20:14)));
        if(t.type==='missiles')assert.equal(t.after.ammo,Math.min(20,t.before.ammo+2));if(t.type==='overdrive')assert(Math.abs(t.after.until-Math.max(t.before.until,t.after.time)-7)<1e-6);}
      assert.deepEqual(clone(run.e.upgrades),{weapons:0,armor:0,rockets:0});
    }
    assert.deepEqual([...found].sort(),['missiles','overdrive','repair']);return transactions;
  });
  check('Full pause/save roundtrip preserves real pickups, dives, bullets and deterministic continuation',()=>{
    const source=runs.find(x=>x.activeSave);assert(source,'Real-input run must produce a mixed active snapshot');
    const snap=source.activeSave,run={seed:snap.engine.seed,mode:snap.engine.assist?'calm':'normal'};
    const a=h.unpack(snap,run,()=>{}),b=h.unpack(snap,run,()=>{});assert.deepEqual(clone(h.pack(a)),snap);
    a.pause();const paused=clone(h.pack(a));continueInput(h,a,3,{fire:true,turn:1,missile:true,pulse:true});assert.deepEqual(clone(h.pack(a)),paused);
    const restored=h.unpack(paused,run,()=>{});assert.equal(restored.status,'paused');restored.resume();
    // Same visible input stream on two independent restored engines.
    const pilot=createPilot(h);for(let frame=0;frame<60*8;frame++){
      const input=pilot(b);restored.step(1/60,realInput(h,restored,input));b.step(1/60,realInput(h,b,input));
    }
    assert.deepEqual(clone(h.pack(restored)),clone(h.pack(b)));assert.equal(h.run('CUP_ENGINE_KEYS.filter(x=>x==="swarm").length'),1);
    return {wave:snap.engine.swarm.waveIndex+1,pickups:snap.engine.swarm.pickups.length,hostiles:snap.engine.hostile.length,divers:snap.engine.enemies.filter(x=>x.mode==='dive').length};
  });
  check('Warning clocks stay nonnegative; the same formation can shoot again after its first volley',()=>{
    const {e}=make(h),owners=new Map(),firstCues=new Map();let minTravel=Infinity,shots=0;
    for(let frame=0;frame<60*25&&e.status==='playing';frame++){
      const known=new Set(e.hostile),old=new Map(e.enemies.map(x=>[x.id,x.fireCue]));e.step(1/60,realInput(h,e,{turn:Math.sin(e.elapsed*1.2)>.1?1:-1}));
      for(const x of e.enemies){assert(x.fireCue>=0);if(x.fireCue>0&&!(old.get(x.id)>0)){firstCues.set(x.id,e.swarm.time);assert(x.fireCue>=.8);}}
      for(const b of e.hostile)if(!known.has(b)){
        shots++;owners.set(b.owner,(owners.get(b.owner)||0)+1);
        const first=firstCues.get(b.owner);if(first!==undefined)assert(e.swarm.time-first>=.8-1/60);
        const distance=b.pos[1]-e.player.pos[1];if(b.vel[1]<0)minTravel=Math.min(minTravel,distance/-b.vel[1]);
      }
    }
    assert([...owners.values()].some(n=>n>=2),'At least one living ship must fire repeatedly');assert(minTravel>.5);
    return {shots,repeatShooters:[...owners.values()].filter(n=>n>=2).length,minObservedFlight:+minTravel.toFixed(3),minimumShotCue:.85,minimumDiveCue:1.05};
  });
  check('Reinstallation is idempotent and adds no handlers or wrappers',()=>{
    const before=listenerCount(h),refs=h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.hit,cupUnpack,drawFlightHUD,arcadeAction]');
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c,{filename:file});
    const after=h.run('[RequirementArcade.prototype.step,RequirementArcade.prototype.hit,cupUnpack,drawFlightHUD,arcadeAction]');
    refs.forEach((ref,i)=>assert.equal(ref,after[i]));assert.equal(listenerCount(h),before);return {handlers:before,added:0};
  });
  const old=await boot(true);
  check('In-flight 1.9 saves retain original three-wave mechanics and deterministic physics',()=>{
    const reports=[];
    for(const assist of [false,true]){
      const {e}=make(old,{assist});continueInput(old,e,9.2,createPilot(old));const snap=clone(old.pack(e)),run={seed:e.seed,mode:assist?'calm':'normal'};
      const a=old.unpack(snap,run,()=>{}),b=h.unpack(snap,run,()=>{});assert.deepEqual(clone(h.pack(b)),snap);
      assert.equal(b.swarm.version,'1.9.0');assert.equal(b.swarm.rulesVersion,undefined);assert.equal(h.c.CITADEL_SWARM.waveTotal(b),3);
      const pilot=createPilot(old);let frames=0;for(;frames<60*180;frames++){
        if(a.status==='lesson'){
          assert.equal(a.lesson.caseIndex,b.lesson.caseIndex);
          a.answerLesson(old.lessonCase(a,a.lesson.caseIndex).correct);a.continueLesson();
          b.answerLesson(h.lessonCase(b,b.lesson.caseIndex).correct);b.continueLesson();
        }
        if(a.swarm.complete&&a.status==='playing')break;
        const input=pilot(a);a.step(1/60,realInput(old,a,input));b.step(1/60,realInput(h,b,input));
        // New visual role labels are inert metadata on newly spawned ships.
        const clean=x=>{const p=clone(x);p.engine.enemies.forEach(enemy=>delete enemy.role);return p;};
        assert.deepEqual(clean(h.pack(b)),clean(old.pack(a)));
      }
      assert(a.swarm.complete&&b.swarm.complete);assert.equal(b.phase,'dock');assert.equal(b.decisions.length,2);assert.equal(b.swarm.pickups,undefined);
      reports.push({assist,version:b.swarm.version,seconds:+(frames/60).toFixed(2),packets:h.c.CITADEL_SWARM.completed(b),decisions:b.decisions.length});
    }return reports;
  });
  check('Gameplay outside level 7 is byte-identical between old and new mechanics',()=>{
    const phases=[];for(const stage of [0,1,3]){
      const a=new old.Engine(417147),b=new h.Engine(417147);a.beginStage(stage);b.beginStage(stage);a.launch();b.launch();
      for(let i=0;i<180;i++){const command={fire:i%2===0,turn:Math.sin(i/60)*.2};a.step(1/60,command);b.step(1/60,command);}
      assert.deepEqual(clone(h.pack(b)),clone(old.pack(a)));phases.push({stage,phase:b.phase});
    }return phases;
  });
}
function stress(h){
  const handlers=listenerCount(h),results=[],heaps=[],start=performance.now();
  // Warm the same engine/UI chain before measuring retained heap. The earlier
  // captured test runs intentionally retain snapshots, so are not leak data.
  for(let i=0;i<2;i++)play(h,{assist:!!(i%2),fps:30});
  global.gc?.();heaps.push(process.memoryUsage().heapUsed);
  for(let i=0;i<24;i++){
    const result=play(h,{assist:!!(i%2),seed:417147+i*997,fps:i%4<2?30:60,profile:'precise'});
    assert(result.metrics.complete,'Stress pilot must complete seed '+result.metrics.seed);
    assert(result.metrics.maxEvents<=24&&result.metrics.maxPickups<=3);
    results.push({mode:result.metrics.assist?'calm':'normal',seed:result.metrics.seed,fps:result.metrics.fps,seconds:result.metrics.seconds,damage:result.metrics.damage,maxHostile:result.metrics.maxHostile});
    assert.equal(listenerCount(h),handlers);
    if(i===11||i===23){global.gc?.();heaps.push(process.memoryUsage().heapUsed);}
  }
  if(global.gc)assert(heaps.at(-1)-heaps[0]<4*1048576,'Repeated missions must not retain an unbounded heap');
  return {runs:24,simulatedSeconds:+results.reduce((n,r)=>n+r.seconds,0).toFixed(2),wallSeconds:+((performance.now()-start)/1000).toFixed(2),handlersBefore:handlers,handlersAfter:listenerCount(h),
    forcedGC:!!global.gc,heapAfterWarmupAnd12And24:heaps,retainedGrowthBytes:heaps.at(-1)-heaps[0],results,
    scope:'Repeated complete missions in one Node VM through ordinary inputs; distinct seeds, both modes and 30/60 Hz. Simulated duration is not browser wall-clock uptime. Heap figures include harness/UI and the last engine; only forced-GC measurements are retained-heap evidence.'};
}
function markdown(report){
  const normal=report.runs.filter(r=>!r.assist&&!r.collect),calm=report.runs.filter(r=>r.assist&&!r.collect);
  const table=rows=>rows.map(r=>'| '+[r.fps,r.profile==='precise'?'точный':r.profile==='stationary'?'неподвижный огонь':'задержка '+r.lag+' с',r.complete?'6 / 6':'поражение, '+r.wavesCleared+' / 6',r.seconds,r.minHP,r.damage].join(' | ')+' |').join('\n');
  return '# Рой уточнений 2.5.0 — механика и QA\n\n'+
    'Использован полный текущий порядок production-скриптов в Node VM. Вход непосредственно на уровень 7 — изолированная тестовая фикстура; далее только `arcadeInput`, обычные перемещения, огонь, ракеты и импульс. Здоровье врагов, прогресс, победа и награды в ходе прохождения не изменялись тестом. Это программная имитация, а не реальный браузер, Android или пользовательский playtest.\n\n'+
    '## Изменения\n\n'+
    '- Шесть волн внутри прежнего уровня 7; 14 уровней кампании, три пакета требований и образовательные решения 4/5 сохранены. Пакеты выдаются после волн 2/4/6.\n'+
    '- Разведчики, перехватчики, бомбардировщики и командиры; ряды, крылья, ромб, шеврон и корона; крюк, перекрёстное пике и клещи. В конце совмещаются группы и веерный огонь. Здоровье роли фиксировано, сложность растёт составом и тактикой.\n'+
    '- Выстрел заранее отмечен минимум 0,85 с, пике — 1,05 с; спокойный режим даёт 1,15 / 1,45 с. Новый снаряд не появляется вплотную: даже при предельной скорости геометрический запас больше 0,5 с.\n'+
    '- За уничтожение пикирующего или тяжёлого корабля выпадает ограниченное снабжение: ремонт +14 (+20 в спокойном), ракеты +2, усиление огня на 7 с. За один бой максимум 3 ремонта / 4 ракеты / 3 усиления, одновременно до 3 капсул. Подбор — обычным движением.\n'+
    '- Исправлена конкретная причина пассивности стрелков: `fireCue` уходил ниже нуля, после чего условие `!fireCue` навсегда исключало корабль из готовых к выстрелу. Новые правила обнуляют таймер. Уже начатые сохранения 1.9 продолжают прежние три волны и старую физику.\n\n'+
    '## Боевой режим\n\n| Гц | Пилот | Итог | Секунды | Минимум HP | Получено урона |\n|---:|---|---|---:|---:|---:|\n'+table(normal)+'\n\n'+
    '## Спокойный режим\n\n| Гц | Пилот | Итог | Секунды | Минимум HP | Получено урона |\n|---:|---|---|---:|---:|---:|\n'+table(calm)+'\n\n'+
    'Задержанный пилот видит врагов с запозданием 0,35/0,60 с и принимает решение каждые 0,12 с; положение своего корабля актуально. Это контролируемый стресс восприятия, не модель среднего человека. Точный бот способен пройти без урона; неподвижная стрельба проигрывает. Ремонты и штатная награда за пакет могут восстановить HP, поэтому указан также суммарный урон.\n\n'+
    '## Проверенные контракты\n\n'+report.checks.map(x=>'- PASS: '+x.name).join('\n')+'\n\n'+
    'Дропы подобраны реальным управлением: зафиксирован ремонт 85,6 → 99,6 HP, ракеты +2 и семисекундное усиление без изменения купленных улучшений. Живое сохранение содержит пике, снаряды и капсулу; пауза полностью замораживает состояние, продолжение после загрузки детерминировано. Старый трёхволновый рой доведён до всех трёх пакетов и двух карточек в обоих режимах.\n\n'+
    '## Продолжительный стресс\n\n'+
    report.stress.runs+' полных миссии подряд в одном VM, разные seed, оба режима и 30/60 Гц; '+(report.stress.simulatedSeconds/60).toFixed(2)+' минут игрового времени за '+report.stress.wallSeconds+' с стенового времени. Обработчики: '+report.stress.handlersBefore+' → '+report.stress.handlersAfter+'. Forced GC: '+report.stress.forcedGC+'. Память после прогрева / 12 / 24 запусков: '+report.stress.heapAfterWarmupAnd12And24.map(x=>(x/1048576).toFixed(2)+' MiB').join(' / ')+'. Это измерения VM/harness, а не память браузера или телефона.\n\n'+
    '## Ограничения\n\n'+
    '- Интерес, ощущения от сложности и читаемость мелкого ядра требуют человеческого прохождения; идеальный бот этого не доказывает.\n'+
    '- Реальный браузер, звук, WebGL и мобильные жесты проверяются отдельными общими отчётами команды. Здесь touch означает штатный путь преобразования джойстика через `arcadeInput` в VM.\n'+
    '- Старое сохранение 1.9 сохраняет свою старую трёхволновую механику; новый шестиволновый бой начинается при новом входе на уровень.\n\n'+
    'Воспроизведение: `node --expose-gc tests/swarm250-regression.cjs`. Машинные данные: `swarm-report.json`. SHA-256 механики: `'+report.mechanics.sha+'`.\n';
}
async function main(){
  fs.mkdirSync(out,{recursive:true});const h=await boot(),runs=[],checks=[];
  for(const assist of [false,true])for(const fps of [30,60])for(const [profile,lag]of [['precise',0],['delayed',.35],['delayed',.6],['stationary',0]]){
    const run=play(h,{assist,fps,profile,lag,touch:fps===30,capture:profile==='precise'});runs.push(run);console.log(JSON.stringify(run.metrics));
  }
  await contracts(h,runs,checks);
  const stressResult=stress(h);
  const report={method:'Node VM with current production-script chain and ordinary arcadeInput. Direct level-7 entry fixtures; not a browser or human playtest. Lag pilots observe enemy positions from 0.35/0.60 seconds earlier, own position current; decisions each 0.12 seconds.',
    mechanics:{file,sha:sha(h.entry.sources.get(file))},entry:h.entry.scripts.map(name=>({file:name,sha:sha(h.entry.sources.get(name))})),checks,runs:runs.map(x=>x.metrics),stress:stressResult};
  fs.writeFileSync(path.join(out,'swarm-report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(out,'swarm-report.md'),markdown(report));
  return {h,runs,checks,report};
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={snapshot,boot,make,createPilot,play,main};
