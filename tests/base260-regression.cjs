#!/usr/bin/env node
'use strict';
// These are isolated mission inputs from previously recorded campaign entries,
// not a claimed end-to-end browser campaign. No health, enemy death, score,
// terminal completion or victory status is injected during any mission run.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createDeckController}=require('./helpers/campaign-inputs.js');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.6.0');fs.mkdirSync(out,{recursive:true});
const file='assets/citadel-base-rewards-v2.6.0.js',entry=entrySnapshot();
if(!entry.scripts.includes(file)){entry.scripts.push(file);entry.sources.set(file,fs.readFileSync(path.join(root,file),'utf8'));}
const h=entryHarness(entry),rows=[],runs=[];h.c.performance={now:()=>performance.now()};
h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
const api=h.c.CITADEL_BASE_REWARDS,clone=x=>JSON.parse(JSON.stringify(x));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
function test(name,fn){if(process.argv.includes('--unit')&&/^(Five bases|Equipment keeps)/.test(name))return;const start=performance.now();try{const data=fn();rows.push({name,pass:true,seconds:+((performance.now()-start)/1000).toFixed(3),data});console.log('PASS '+name);}catch(error){rows.push({name,pass:false,error:error.stack});console.error('FAIL '+name+' '+error.message);}}
function restore(level=2,mode='normal') {
  const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'qa-2.0.0','checkpoint-'+mode+'-'+level+'.json'),'utf8'));
  const e=h.unpack(snap,{seed:snap.engine.seed,mode},()=>{});h.arcade.engine=e;return e;
}
function inputController(e) {
  const controller=createDeckController(h,{boost:true});let route=[],goal=null,previous=null,stalled=0;
  // Combat pilot cannot read the invisible windup geometry. It sees the real
  // positions and projectiles, aims, strafes and uses pulse at close enemies.
  const board=new Proxy(e.board,{get(target,key){return key==='enemies'&&!e.assist?target.enemies.map(x=>({...x,decksAttack:null})):target[key];}});
  const perceived=Object.create(e);perceived.board=board;
  return ()=> {
    const b=e.board,room=b.completed.length,enemies=b.enemies.filter(x=>!x.dead&&(x.duty?.room??x.zone)===room);
    const pickup=b.armory260.pickups.find(x=>!x.taken&&x.room<room)||(!enemies.length?b.armory260.pickups.find(x=>!x.taken&&x.room===room):null);
    if(!pickup)return controller(perceived);
    if(previous && dist(previous,b.pos)<.001)stalled+=1/60;else stalled=0;previous=b.pos.slice();
    if(goal!==pickup.id||!route.length||stalled>.7){route=h.deckQA.path(b,b.pos,pickup.pos);goal=pickup.id;stalled=0;}
    while(route.length && (dist(route[0],b.pos)<.12 || dist(route[0],b.pos)<.6&&route.length>1&&h.deckQA.line(b,b.pos,route[1],.68,true)))route.shift();
    const next=route[0]||pickup.pos,d=Math.max(dist(next,b.pos),6.5/60),visible=b.enemies.filter(x=>!x.dead&&h.deckQA.line(b,b.pos,x.pos,.08)).sort((a,c)=>dist(a.pos,b.pos)-dist(c.pos,b.pos));
    return {moveX:(next[0]-b.pos[0])/d,moveZ:(next[2]-b.pos[2])/d,fire:true,aim:visible[0]?.pos,
      pulse:b.pulseCooldown<=0&&visible.some(x=>dist(x.pos,b.pos)<8)};
  };
}
const earned=[];
test('Old mission entries gain only reachable side-room contents, not a new map',()=>{
  const result=[];
  for(const level of [2,5,8,11,13]) {
    const saved=JSON.parse(fs.readFileSync(path.join(__dirname,'qa-2.0.0','checkpoint-normal-'+level+'.json'),'utf8')),e=restore(level);
    assert.deepEqual(clone(e.board.definition),saved.engine.board.definition);assert.deepEqual(clone(e.board.pos),saved.engine.board.pos);
    assert.equal(e.board.hp,saved.engine.board.hp);assert.equal(e.score,saved.engine.score);assert.equal(e.board.enemies.length,saved.engine.board.enemies.length);
    const s=api.status(e);assert.equal(s.pickups.length,3);assert.equal(new Set(s.pickups.map(x=>x.type)).size,3);
    for(const x of s.pickups){assert(h.deckQA.path(e.board,e.board.definition.rooms[x.room].posts[0],x.pos).length);assert(!x.taken);}
    result.push({level,pickups:s.pickups.map(x=>({type:x.type,pos:x.pos}))});
  }
  return result;
});
test('A 1.9.3 deck without side rooms retains its saved map and crew',()=>{
  const html=execFileSync('git',['show','e25cd4e42eb175dd796d687fae3b26c9f39bf0d9:index.html'],{cwd:root,encoding:'utf8'});
  const scripts=[...html.matchAll(/<script\s+defer\s+src="\.\/(.*?)"[^>]*>/g)].map(x=>x[1].split('?')[0]);
  const previous=entryHarness({html,scripts,sources:new Map(scripts.map(x=>[x,fs.readFileSync(path.join(root,x),'utf8')]))});
  const old=new previous.Engine(417147,()=>{});old.beginStage(0);old.beginBoarding();const saved=clone(previous.pack(old));
  const e=h.unpack(saved,{seed:417147,mode:'normal'},()=>{});
  assert.deepEqual(clone(e.board.definition),clone(old.board.definition));assert.deepEqual(clone(e.board.enemies),clone(old.board.enemies));
  assert.equal(e.board.armory260.pickups.length,0);assert.equal(e.board.hp,old.board.hp);e.step(1/60,{});
  return{authoredSideRooms:false,pickups:0,geometryUnchanged:true};
});
test('Five bases × two modes: normal input, optional rooms, every card and exit',()=>{
  const modes=process.argv.includes('--quick')?['normal']:['normal','calm'];
  for(const mode of modes)for(const level of [2,5,8,11,13]) {
    const e=restore(level,mode),b=e.board,control=inputController(e),ids=new Set(b.enemies.map(x=>x.id)),start=e.elapsed;
    e.step(0,{});const initialScore=e.score,emit=e.emit,initialCheckpoint=e.checkpoint();let frame=0,minHp=b.hp,cards=0,peakProjectiles=0,usedPulse=0,lastPulse=0,finalBaseHp=b.hp;
    for(;frame<60*1000;frame++) {
      if(e.status==='lost')break;
      if(e.board!==b||e.finale&&e.finale.phase!=='maze'||e.status==='stageclear')break;
      if(e.status==='remark') {
        assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0);cards++;
        h.action('citadel-answer',h.run('citadelRemarkCase(ARCADE.engine,ARCADE.engine.board.question)').correct);h.action('citadel-remark-next');continue;
      }
      if(e.status==='finalcheck') {
        assert.equal(h.c.CITADEL_DECK_COMBAT.clearance(e).remaining,0);cards++;
        h.action('finale-answer',h.run('FINALE_TRIALS[ARCADE.engine.board.completed.length]').correct);h.action('finale-check-next');continue;
      }
      finalBaseHp=b.hp;e.step(1/60,control());minHp=Math.min(minHp,b.hp);peakProjectiles=Math.max(peakProjectiles,b.hostile.length+(b.decks?.rockets.length||0));
      if(b.pulseCooldown>lastPulse)usedPulse++;lastPulse=b.pulseCooldown;
      assert.equal(e.emit,emit);if(!e.finale||e.finale.phase==='maze')for(const x of b.enemies)assert(ids.has(x.id),'Finite original crew, no surprise spawns');
    }
    const row={mode,level,status:e.status,phase:e.finale?.phase||e.phase,seconds:+(e.elapsed-start).toFixed(2),minHp:+minHp.toFixed(2),hp:+finalBaseHp.toFixed(2),
      cards,completed:b.completed.length,pickups:b.armory260.pickups.filter(x=>x.taken).length,enemyShots:b.armory260.shotsFired,peakProjectiles,usedPulse,
      startingCrew:ids.size,remaining:b.enemies.filter(x=>ids.has(x.id)).length,scoreGain:e.score-initialScore,events:b.armory260.events};
    runs.push(row);console.log(JSON.stringify(row));
    assert.notEqual(e.status,'lost','Pilot lost base '+level+' '+mode);assert.equal(cards,3);assert.equal(b.completed.length,3);assert.equal(row.pickups,3);
    assert(frame<60*1000,'Input pilot timed out');assert(b.enemies.every(x=>!ids.has(x.id)),'All existing crew defeated normally');
    assert.equal(e.upgrades.baseKit260.collected.length,3);assert(e.upgrades.baseKit260.achievements.includes('supply-'+([2,5,8,11,13].indexOf(level))));
    assert.equal(initialCheckpoint.upgrades.baseKit260.collected.length,0,'Later pickups cannot mutate an older in-memory checkpoint');
    e.step(0,{});assert.equal(e.emit,emit,'A transition cannot retain the scoped equipment emitter');
    earned.push({mode,level,snapshot:clone(h.pack(e)),kit:clone(e.upgrades.baseKit260)});
  }
  return runs;
});
test('Pause / save / restore keeps exact pickups, equipment and active AI',()=>{
  const e=restore(8),control=inputController(e);for(let i=0;i<600 && e.status==='boarding';i++)e.step(1/60,control());
  e.pause();const saved=clone(h.pack(e));for(let i=0;i<300;i++)e.step(1/60,{fire:true,moveX:1,pulse:true});
  assert.deepEqual(clone(h.pack(e).engine.board),saved.engine.board);assert.deepEqual(clone(h.pack(e).engine.upgrades),saved.engine.upgrades);
  const r=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(clone(h.pack(r).engine.board),clone(h.pack(e).engine.board));assert.deepEqual(clone(r.upgrades),clone(e.upgrades));
  e.resume();r.resume();for(let i=0;i<120 && e.status==='boarding';i++){e.step(1/60,{moveZ:1,fire:true});r.step(1/60,{moveZ:1,fire:true});}
  assert.deepEqual(clone(h.pack(r).engine.board),clone(h.pack(e).engine.board));return{secondsPaused:5,deterministicFrames:120};
});
test('Equipment keeps score formulas and becomes useful without a new key',()=>{
  assert(earned.length>=3,'Needs three successful input missions');
  // A separate equipment composition fixture combines only parts actually
  // obtained by the input pilot. It is not counted as a campaign playthrough.
  const e=restore(2),k=e.upgrades.baseKit260;for(const x of earned.filter(x=>x.mode==='normal').slice(0,3)) {
    k.collected.push(...x.kit.collected);k.parts+=x.kit.parts;k.armor+=x.kit.armor;k.capacitor+=x.kit.capacitor;
  }
  const score=e.score;e.boardPulse();assert(Math.abs(e.board.pulseCooldown-9*.76)<1e-10);assert.equal(e.score,score);
  // At the original clear landing, firing down an empty corridor exercises the
  // ordinary core weapon and projectile path, not a damage/death shortcut.
  let pelletsSeen=false;for(let i=0;i<120;i++){e.step(1/60,{fire:true,aim:[0,0,100]});if(e.board.bullets.some(x=>x.baseKitPellet))pelletsSeen=true;}
  assert(e.board.armory260.events.some(x=>x.kind==='triad-volley'));assert(pelletsSeen);
  assert.equal(e.score,score);
  const scout=e.board.enemies.find(x=>x.archetype==='scout'&&x.duty.room===0);e.board.pos=[scout.pos[0],0,scout.pos[2]+4];e.step(1/60,{});
  const hostile=e.board.hostile.find(x=>x.owner===scout.id);assert(hostile);assert(Math.abs(hostile.damage-scout.damage*scout.decksDamage*.82)<1e-9);
  const saved=clone(h.pack(e)),r=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});
  assert.deepEqual(clone(r.upgrades.baseKit260),clone(k));assert.deepEqual(clone(r.board.armory260),clone(e.board.armory260));
  return{parts:k.parts,armorReduction:k.armor*.06,pulseCooldown:9*.76,volleys:e.board.armory260.events.filter(x=>x.kind==='triad-volley').length,
    note:'Equipment composition fixture; all constituent parts earned by the ordinary input runs above.'};
});
test('Combat shoots on sight, calm preserves warnings, render does not mutate saves',()=>{
  const result=[];
  for(const mode of ['normal','calm']) {
    const e=restore(5,mode),b=e.board,events=[];e.emit=(kind,value)=>events.push({kind,value});
    // Explicit close-contact fixture, not part of the input completion runs.
    const scout=b.enemies.find(x=>x.archetype==='scout'&&x.duty.room===0);b.pos=[scout.pos[0],0,scout.pos[2]+4];b.camera=b.pos.slice();
    let first=-1;for(let i=0;i<120;i++){e.step(1/60,{});if(first<0&&b.hostile.some(x=>x.owner===scout.id))first=i;}
    assert(first>=0);if(mode==='normal'){assert(first<=1,'First normal shot must not wait for a warning');assert(!events.some(x=>x.kind==='comic'&&x.value?.kind==='warning'));}
    else assert(events.some(x=>x.kind==='comic'&&x.value?.kind==='warning'));
    b.camera=b.definition.rooms[0].reserve.slice();h.arcade.canvas={width:1100,height:760};
    const saved=clone(h.pack(e)),items=h.scene(e,0),warnings=items.filter(x=>x.baseFeature==='warning-line').length;
    if(mode==='normal')assert.equal(warnings,0);else assert(warnings>0);
    const canvas=createCanvas(1100,760);h.draw(canvas.getContext('2d'),items,h.camera(e,0),1100,760);
    fs.writeFileSync(path.join(out,'base-rewards-'+mode+'.png'),canvas.toBuffer('image/png'));assert.deepEqual(clone(h.pack(e)),saved);
    // Staged HUD-only warning fixture; no combat or completion claim.
    const sniper=b.enemies.find(x=>x.archetype==='sniper');sniper.charge=.8;sniper.signal='Прицельный выстрел';
    const text=[],hud=createCanvas(1100,760).getContext('2d'),fill=hud.fillText;hud.fillText=function(value){text.push(value);return fill.apply(this,arguments);};
    h.run('drawBoardHUD')(hud,e,h.camera(e,0),1100,760);const warned=text.some(x=>/^СНАЙПЕР ·/.test(x));assert.equal(warned,mode==='calm');
    result.push({mode,firstShotFrame:first,warningGeometry:warnings,warningText:warned,items:items.length});
  }
  return result;
});
test('Repeated loads do not add wrappers, listeners, pickups or meshes',()=>{
  const listeners=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0),count=listeners();
  const before=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,scene:citadelInterior,unpack:cupUnpack})');
  for(let i=0;i<50;i++)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),h.c);
  const after=h.run('({step:RequirementArcade.prototype.stepBoard,enemy:RequirementArcade.prototype.enemyBoardStep,scene:citadelInterior,unpack:cupUnpack})');
  for(const name of Object.keys(before))assert.equal(after[name],before[name]);assert.equal(listeners(),count);
  const e=restore(5);e.step(0,{});const emit=e.emit;e.boardMove=function(){throw Error('base260 fixture exception');};
  assert.throws(()=>e.step(1/60,{}),/base260 fixture exception/);assert.equal(e.emit,emit);delete e.boardMove;
  return{loads:50,listeners:count,wrappersUnchanged:true,emitterRestoredAfterException:true};
});
const report={version:'2.6.0',environment:'Node VM + native Canvas. Mission entries restored from input-recorded 2.0.0 campaign checkpoints; no browser claim.',
  passed:rows.filter(x=>x.pass).length,total:rows.length,rows,runs};
fs.writeFileSync(path.join(out,process.argv.includes('--unit')?'base-rewards-unit.json':'base-rewards.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,total:report.total,runs:runs.map(({mode,level,status,seconds,minHp,pickups})=>({mode,level,status,seconds,minHp,pickups}))}));
if(report.passed!==report.total)process.exitCode=1;
