'use strict';
const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto'),path=require('path');
const baseline=path.resolve(process.env.CITADEL_BASELINE_DIR||'../cmpon-baseline2176');
const {lab,readEntry}=require('./release260-verifier.cjs');
const {createOrbitalController}=require('./helpers/orbital280-inputs.js');
const {question}=require('./learning280-verifier.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const snap=JSON.parse(zlib.gunzipSync(fs.readFileSync('tests/qa-2.17.7/orbit4-earned-checkpoint.json.gz')));
(async()=>{const results=[];for(const variant of ['baseline','current']){
 const entry=readEntry('play.html');entry.scripts=entry.scripts.filter(s=>!s.includes('atlas-site-metrics'));
 if(variant==='baseline')for(const file of entry.scripts)entry.sources.set(file,fs.readFileSync(path.join(baseline,file),'utf8')); 
 const h=await lab(entry),e=h.unpack(clone(snap),{seed:snap.engine.seed,mode:'normal'},()=>{});h.arcade.engine=e;
 const op=createOrbitalController(h),r={variant,fixture:'Same earned after-convoy3 save; ordinary actions and orbital280 controller after load',startHP:e.player.hp,startStation:e.stationHp,livingSha256:crypto.createHash('sha256').update(entry.sources.get('assets/citadel-living-v2.17.6.js')).digest('hex'),events:[],stateSamples:[]};let time=0,lastRift=0;
 h.action('citadel-escort-continue');h.action('citadel-launch');
 for(let i=0;i<160*60;i++){
  if(['lost','crashing'].includes(e.status)||h.c.CITADEL_CAMPAIGN.mission(e)!=='orbit4'||e.status==='campaignsummary')break;
  if(e.campaign2120.modal?.type==='comic2170'){h.action('collection2170-comic-next');continue;}
  if(e.campaign2120.modal){h.action('campaign-modal-close');continue;}
  if(h.c.CITADEL_STORY.status(e).active){h.action('story-next');continue;}
  if(e.status==='lesson'){const q=question(h,e);h.action('citadel-lesson-answer',q.q.correct);h.action('citadel-lesson-next');continue;}
  const hp=e.player.hp,station=e.stationHp,contacts=e.campaign2120.rift2176?.contacts||0;
  e.step(1/60,op(e));time+=1/60;
  const rift=e.campaign2120.rift2176;
  if(e.player.hp<hp||e.stationHp<station||rift?.contacts>contacts){r.events.push({time:+time.toFixed(3),hpBefore:hp,hpAfter:e.player.hp,stationBefore:station,stationAfter:e.stationHp,riftAge:rift?.age,riftPhase:rift?.pose,contacts:rift?.contacts,nav:e.navMode,target:e.selectedTarget,enemies:e.enemies.filter(x=>!x.dead).map(x=>({role:x.role,hp:x.hp,id:x.id,pos:x.pos})),shots:e.hostile.filter(x=>x.stationShot).length});}
  if(i%600===0)r.stateSamples.push({time:+time.toFixed(2),hp:e.player.hp,station:e.stationHp,nav:e.navMode,kills:e.stageKills,riftContacts:rift?.contacts});
 }
 Object.assign(r,{status:e.status,phase:e.phase,hp:e.player.hp,station:e.stationHp,seconds:+time.toFixed(3),riftContacts:e.campaign2120.rift2176?.contacts,lossReason:e.lossReason,stationHits:r.events.filter(x=>x.stationAfter<x.stationBefore).length,shipHits:r.events.filter(x=>x.hpAfter<x.hpBefore).length});results.push(r);console.log(JSON.stringify({...r,events:undefined}));}
 fs.writeFileSync('tests/qa-2.17.7/orbit4-paired-review.json',JSON.stringify({method:'Earned checkpoint replay, not a new whole-campaign result',results},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
