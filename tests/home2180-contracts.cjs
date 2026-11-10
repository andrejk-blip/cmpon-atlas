'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {lab,readEntry,fixture}=require('./release260-verifier.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const entry=readEntry('play.html');entry.scripts=entry.scripts.filter(s=>!s.includes('atlas-site-metrics'));
 const h=await lab(entry),S=h.c.CITADEL_SWARM,C=h.c.CITADEL_CAMPAIGN,rows=[];
 const test=(name,fn)=>{try{fn();rows.push({name,pass:true});console.log('PASS '+name);}catch(error){rows.push({name,pass:false,error:error.stack});console.error('FAIL '+name+' '+error.stack);}};
 function wave(n,legacy=false,assist=false){
  const e=fixture(h,7,assist);C.enable(e);e.campaign2120.modal=null;e.campaign2120.story2170={seen:Object.fromEntries(h.c.CITADEL_COLLECTION.comics.map(c=>[c.id,true]))};
  if(legacy)delete e.swarm.orderVersion;
  if(n){e.swarm.waveIndex=n-1;e.swarm.packet=Math.floor((n-1)/2);e.swarm.phase='cleared';e.swarm.transition=.001;e.step(.02,{});}
  return e;
 }
 for(const assist of [false,true])test('all six '+(assist?'training':'combat')+' scenarios move with their formations and attacks',()=>{
  const expected=assist?[8,10,12,16,18,14]:[8,16,32,32,24,64];
  for(let n=0;n<6;n++){
   const e=wave(n,false,assist),old=wave([0,1,2,4,5,3][n],true,assist);
   assert.equal(e.swarm.waveIndex,n);assert.equal(S.secondsNeeded(e),expected[n]);assert.equal(e.enemies.length,expected[n]);
   assert.deepEqual(copy(S.waveDefinition(e)),copy(S.waveDefinition(old)));
   assert.deepEqual(copy(e.enemies.map(x=>[x.role,x.maxHp])),copy(old.enemies.map(x=>[x.role,x.maxHp])));
   assert.deepEqual(copy(e.enemies.map(x=>S.formationPoint(e,x.slot,0))),copy(old.enemies.map(x=>S.formationPoint(old,x.slot,0))));
   assert.deepEqual(copy(S.balanceFor(e)),copy(S.balanceFor(old)));
  }
 });
 test('legacy active sorties retain 8,16,32,64,32,24',()=>{for(let n=0;n<6;n++){const e=wave(n,true);assert.equal(e.enemies.length,[8,16,32,64,32,24][n]);assert.equal(S.scenarioIndex(e),n);}});
 for(const legacy of [false,true])for(const n of [3,4,5])test((legacy?'legacy':'new')+' wave '+(n+1)+' survives pause, save, reload and deterministic continuation',()=>{
  const e=wave(n,legacy);e.pause();const snapshot=h.pack(e),before=copy(snapshot);for(let i=0;i<10;i++)e.step(.02,{fire:true});assert.deepEqual(copy(h.pack(e)),before);
  const restored=h.unpack(snapshot,{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(copy(restored.swarm),copy(e.swarm));assert.deepEqual(copy(restored.enemies),copy(e.enemies));assert.equal(S.waveDefinition(restored).name,S.waveDefinition(e).name);
  e.resume();restored.resume();for(let i=0;i<30;i++){h.arcade.engine=e;e.step(.02,{fire:true,moveX:.1});h.arcade.engine=restored;restored.step(.02,{fire:true,moveX:.1});}assert.deepEqual(copy(restored.swarm),copy(e.swarm));assert.deepEqual(copy(restored.enemies),copy(e.enemies));
 });
 test('support still arrives once before chronological waves four to six',()=>{for(const n of [3,4,5]){const e=wave(n);assert(e.swarm.repairedWaves.includes(n));const ammo=e.player.missiles,hp=e.player.hp;for(let i=0;i<5;i++)e.step(.02,{});assert.equal(e.player.missiles,ammo);assert.equal(e.player.hp,hp);}});
 test('one requirement is awarded only after waves two, four and six',()=>{
  for(let n=0;n<6;n++){const e=wave(n);e.swarm.phase='combat';const before=e.rescued.length;for(const enemy of e.enemies)e.hit(enemy,99999);e.step(.02,{});assert.equal(e.swarm.phase,'cleared');assert.equal(e.rescued.length-before,n%2);const score=e.score;for(let i=0;i<5;i++)e.step(.02,{});assert.equal(e.rescued.length-before,n%2);assert.equal(e.score,score);}
 });
 test('home controls preserve all three education mode actions and optional continue',()=>{
  const button=(a,t,v='',extra='')=>`<button data-action="${a}" data-value="${v}" ${extra}>${t}</button>`;
  for(const mode of ['training','combat','pro'])for(const canContinue of [false,true]){
   const html=h.c.CITADEL_HOME2180.lobby({mode,canContinue,button});assert(html.includes('Цитадель требований'));assert(!html.includes('ЦСИИ'));
   assert.equal((html.match(/data-action="learning-mode"/g)||[]).length,3);assert(html.includes('data-action="'+(mode==='pro'?'launch-new':'learning-start')+'"'));
   assert.equal(html.includes('data-action="campaign-continue"'),canContinue);assert(html.includes('class="menu2170 menu2173 home2180"'));assert.equal((html.match(/class="home2180-actor /g)||[]).length,4);
  }
 });
 test('game naming and manifest keep the installed app identity',()=>{
  const m=JSON.parse(fs.readFileSync('citadel.webmanifest','utf8'));assert.equal(m.id,'./citadel');assert.equal(m.start_url,'./play.html#arcade');assert.equal(m.name,'Цитадель требований');assert(m.icons.every(x=>fs.existsSync(x.src)));
  for(const f of ['assets/atlas-v1.3.6.js','assets/citadel-story-v1.9.0.js','assets/citadel-collection-v2.17.0.js','assets/citadel-learning-modes-v2.7.0.js','assets/citadel-launch-v2.7.0.js','play.html'])assert(!fs.readFileSync(f,'utf8').includes('ЦСИИ'),f);
 });
 const report={version:'2.18.0',method:'Actual engine boundary fixtures: scenario mapping, formations, rewards, pause and save/load continuation.',pass:rows.every(r=>r.pass),rows};fs.mkdirSync('tests/qa-2.18.0',{recursive:true});fs.writeFileSync('tests/qa-2.18.0/contracts.json',JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
