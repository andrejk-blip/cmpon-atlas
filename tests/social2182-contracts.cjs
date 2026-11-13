const assert=require('node:assert/strict'),fs=require('node:fs');
const {lab,readEntry,fixture}=require('./release260-verifier.cjs');
const rows=[],next=()=>new Promise(setImmediate);
async function test(name,fn){try{await fn();rows.push({name,pass:true});console.log('PASS '+name);}catch(e){rows.push({name,pass:false,error:e.stack});console.error('FAIL '+name+' '+e.stack);}}
(async()=>{
 const entry=readEntry('play.html');entry.scripts=entry.scripts.filter(x=>!x.includes('atlas-site-metrics'));
 const h=await lab(entry,{beforeScripts({c}){c.CITADEL_TEST_MEMORY_ONLY=true;}}),C=h.c.CITADEL_CAMPAIGN,A=h.c.CITADEL_COLLECTION;
 await test('anonymous start and continue require a name in all three modes, then restore intended action',async()=>{
  h.cup.player=null;for(const action of ['learning-start','launch-new','campaign-continue']){h.action(action);assert.equal(h.cup.panel,'identity2182');assert.match(h.overlay(),/social2182-form/);h.action('cup-close');}
  h.action('learning-start');assert(await h.c.CITADEL_SOCIAL.register('Андрей'));assert(h.cup.player);assert.equal(h.cup.panel,null);assert.notEqual(h.arcade.engine.status,'menu');
  assert(!await h.c.CITADEL_SOCIAL.register(' '));
 });
 await test('rating is visible, no cup menu; leader uses returned results and escapes names',async()=>{
  h.run(`cupAPI=async function(path){return {chapters:15,rows:[{name:'<Лидер>',player_id:'top',progress:9,score:14500,rank:1,has_result:true}]};}`);
  h.action('social2182-records');await h.c.CITADEL_SOCIAL.refreshRanking(true);await next();assert.equal(h.cup.panel,'rating2182');assert.match(h.overlay(),/Рейтинг игроков/);assert(!h.overlay().includes('Кубок'));assert(h.c.CITADEL_SOCIAL.leaderText().includes('<Лидер>'));assert.match(h.overlay(),/&lt;Лидер&gt;/);assert.match(h.c.CITADEL_SOCIAL.homebar(),/&lt;Лидер&gt;/);assert(!h.c.CITADEL_SOCIAL.homebar().includes('<Лидер>'));h.action('cup-close');
 });
 await test('document pieces derive from actual rewards, display actual text and ignore skipped parts',()=>{
  const e=fixture(h,1,false),s=C.enable(e);s.modal={type:'document'};assert.equal(h.c.CITADEL_DOSSIER.model(e).filter(x=>x.ready).length,0);
  C.complete(e,'orbit1');C.complete(e,'base1');assert.equal(h.c.CITADEL_DOSSIER.model(e).filter(x=>x.ready).length,2);const before=JSON.stringify(s);h.action('dossier2182-select','goal');assert.equal(JSON.stringify(s),before);assert(h.overlay().includes(s.document.goal));assert.match(h.overlay(),/aria-valuenow="2"/);
  s.document.scope='Переход с пропуском: Палуба. Раздел требует отдельной проверки.';assert.equal(h.c.CITADEL_DOSSIER.model(e).filter(x=>x.ready).length,1);assert(h.c.CITADEL_DOSSIER.model(e).find(x=>x.id==='scope').review);
 });
 await test('achievement unlocks persist once, survive unread, and practice cannot earn them',()=>{
  const e=h.arcade.engine,s=C.state(e);s.modal=null;e.status='playing';A.unlock(e);const first=A.pending().length;assert(first>0);A.unlock(e);assert.equal(A.pending().length,first);const ids=A.pending().map(x=>x.id);A.acknowledge(ids);assert.equal(A.pending().length,0);A.unlock(e);assert.equal(A.pending().length,0);
  s.practice={};s.completed.push('parallax');A.unlock(e);assert(!A.profile().achievements.beacons);s.practice=null;A.unlock(e);assert(A.pending().some(x=>x.id==='beacons'));
 });
 await test('old profiles remain owned without being announced again on restore',async()=>{
  const key=A.storageKey,saved=JSON.stringify({schema:1,cards:{hero:true},comics:{departure:true},achievements:{first:true}});
  const t=await lab(entry,{beforeScripts({storage}){storage.set(key,saved);}});assert.equal(t.c.CITADEL_COLLECTION.pending().length,0);assert(t.c.CITADEL_COLLECTION.profile().achievements.first);
 });
 await test('completed chapters queue safely, retry offline, preserve player ownership and never send practice',async()=>{
  const e=fixture(h,1,false),s=C.enable(e);e.educationMode='combat';e.elapsed=120;e.score=2000;s.completed=['orbit1'];s.practice=null;h.c.CITADEL_TEST_MEMORY_ONLY=false;h.cup.attached=false;h.cup.player={id:'qa',name:'QA'};
  h.run('cupAPI=async()=>{throw new Error("offline")};');h.c.CITADEL_RANKING.capture(e);await next();assert.equal(h.c.CITADEL_RANKING.pending(),1);const saved=JSON.parse(h.storage.get('cmpon.citadel.ranking2182.outbox'));assert.equal(saved[0].payload.completed[0],'orbit1');assert.equal(saved[0].owner,'qa');
  s.practice={};s.completed.push('base1');h.c.CITADEL_RANKING.capture(e);assert.equal(h.c.CITADEL_RANKING.pending(),1);
  h.cup.player={id:'different',name:'Other'};h.run('cupAPI=async()=>({accepted:true})');await h.c.CITADEL_RANKING.flush();assert.equal(h.c.CITADEL_RANKING.pending(),1);
  h.cup.player={id:'qa',name:'QA'};await h.c.CITADEL_RANKING.flush();assert.equal(h.c.CITADEL_RANKING.pending(),0);
 });
 const report={version:'2.18.2',pass:rows.every(r=>r.pass),rows};fs.mkdirSync('tests/qa-2.18.2',{recursive:true});fs.writeFileSync('tests/qa-2.18.2/contracts.json',JSON.stringify(report,null,2)+'\n');process.exitCode=report.pass?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});
