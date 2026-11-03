#!/usr/bin/env node
'use strict';
// Independent input-only campaign pilot. Reads exact positions and answer keys;
// no health, score, resource, objective or route-state mutation after start.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {readEntry,lab,listenerState}=require('./release260-verifier.cjs');
const {question}=require('./learning280-verifier.cjs');
const {createController:createBase}=require('./helpers/base270-inputs.js');
const {createController:createSwarm}=require('./helpers/swarm270-inputs.js');
const {createOrbitalController}=require('./helpers/orbital280-inputs.js');
const {pilot:createConvoy}=require('./helpers/convoy2150-inputs.js');
const {pursuitInput,createMrgController}=require('./helpers/campaign-inputs.js');
const {pilot:createParallax}=require('./parallax2110-qa.cjs');
const out=path.join(__dirname,'qa-2.16.0'),copy=x=>JSON.parse(JSON.stringify(x));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function play(mode='training',route='convoy',options={}){
 const entry=readEntry(options.entry||'index.html'),h=await lab(entry),api=h.c.CITADEL_CAMPAIGN;
 assert(api?.version==='2.12.0','Candidate campaign module not loaded');
 assert(h.c.CITADEL_EXPERIENCE?.version==='2.13.0','2.13 experience not loaded');
 h.deckQA={path:h.run('stationPath'),line:h.run('stationLine'),input:h.input};
 const e=new h.Engine(options.seed||417147,()=>{});h.arcade.engine=e;h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);e.start(mode==='training');
 const base=createBase(h,{reaction:.2,mobile:false}),swarm=createSwarm(h.c.CITADEL_SWARM,{reaction:.2,mobile:false}),orbit=createOrbitalController(h),mrg=createMrgController();
 const convoy=new WeakMap(),boss=new WeakMap(),cards=[],transitions=[],levels=[],earned=[],seen=new Set(),initialListeners=listenerState(h);
 let last='',current=null,error=null,frames=0,phaseFrames=0;
 const firstSnapshot=copy(h.pack(e));
 try{
  for(;frames<60*3600;frames++){
   const id=api.mission(e),key=[id,e.status,e.phase,e.finale?.phase,e.board?.completed.length].join('/');
   if(key!==last){phaseFrames=0;last=key;const row={mission:id,number:api.number(e),status:e.status,phase:e.phase,finale:e.finale?.phase||null,completed:e.board?.completed.length??null,seconds:+e.elapsed.toFixed(2),hp:+(e.board?.hp??e.player.hp).toFixed(2)};transitions.push(row);console.log(JSON.stringify(row));}
   if(!current||current.mission!==id){current={mission:id,number:api.number(e),start:e.elapsed,minHp:100};levels.push(current);}
   current.minHp=Math.min(current.minHp,e.board?.hp??e.player.hp);
   const captureKey=[id,e.status,e.campaign2120.modal?.type||'',e.campaign2120.modal?.page??'',e.status==='campaignsource'?e.campaign2120.station.reading:'',e.status==='remark'?e.board.question:''].join('/');
   if(!seen.has(captureKey)&&(e.campaign2120.modal?.type==='afterparallax'||['campaignroute','campaigncard','campaignsource','campaignsummary','finalebrief','stageclear','escortclear','won'].includes(e.status))){
    seen.add(captureKey);earned.push({key:captureKey,mission:id,status:e.status,snapshot:copy(h.pack(e))});
   }
   if(e.status==='won')break;
   if(['document','bestiary'].includes(e.campaign2120.modal?.type)){h.action('campaign-modal-close');continue;}
   if(e.campaign2120.modal?.type==='afterparallax'){h.action('xp-comic-next');continue;}
   if(h.c.CITADEL_STORY.status(e).active){h.action('story-next');continue;}
   if(['lost','crashing'].includes(e.status))throw Error(`Pilot failed at ${id}: ${e.status}; ${e.lossReason||''}`);
   if(++phaseFrames>60*480)throw Error('No phase progression for 480 seconds: '+key);
   assert.equal(h.c.CITADEL_LEARNING_MODES.getMode(e),mode);
   if(e.status==='campaignsummary'){h.action('campaign-summary-next');continue;}
   if(e.status==='campaignroute'){h.action('campaign-route',route);continue;}
   if(e.status==='campaignsource'){h.action('campaign-source-next');continue;}
   if(e.status==='campaigncard'){
    const card=e.campaign2120.card,q=api.questions[card.mission];
    const index=Array.isArray(q.correct)?Number(options.stationSolution||0):q.correct;
    cards.push({mission:id,kind:'new',key:card.mission,answer:index});h.action('campaign-answer',index);h.action('campaign-card-next');continue;
   }
   if(['lesson','remark','finalcheck'].includes(e.status)){
    const q=question(h,e),actions={lesson:['citadel-lesson-answer','citadel-lesson-next'],remark:['citadel-answer','citadel-remark-next'],finalcheck:['finale-answer','finale-check-next']}[e.status];
    cards.push({mission:id,kind:q.kind,key:q.index,answer:q.q.correct});h.action(actions[0],q.q.correct);h.action(actions[1]);continue;
   }
   if(e.status==='briefing'||e.status==='escortbrief'){h.action('citadel-launch');continue;}
   if(e.status==='stageclear'){h.action('citadel-upgrade',['weapons','weapons','armor'][e.stage]);e.next();continue;}
   if(e.status==='escortclear'){h.action('citadel-escort-continue');continue;}
   if(e.status==='finalebrief'){h.action('finale-launch');continue;}
   let input={};
   if(h.c.CITADEL_RESONATOR?.active(e)){
    const s=h.c.CITADEL_RESONATOR.state(e),i=s.rings.findIndex(r=>r.step!==r.target);
    if(s.mode==='align'&&i>=0){h.action('resonator-select',i);h.action('resonator-turn',1);}
   }
   else if(e.finale?.phase==='mrg')input=mrg(e);
   else if(e.finale?.phase==='boss'){if(!boss.has(e.finale))boss.set(e.finale,createParallax(e,{reaction:.3}));input=boss.get(e.finale)();}
   else if(e.status==='boarding')input=base(e);
   else if(e.phase==='pursuit')input=pursuitInput(h,e);
   else if(e.phase==='swarm')input=swarm(e);
   else if(e.status==='playing'){
    if(h.c.CITADEL_CONVOY.active(e)){if(!convoy.has(e.escort))convoy.set(e.escort,createConvoy(h,e,{reaction:.35,device:'joystick'}));input=convoy.get(e.escort).input();}
    else if(mode!=='training')input=orbit(e);
    else {const target=e.target?.(),close=e.hostile.some(x=>Math.hypot(...x.pos.map((v,i)=>v-e.player.pos[i]))<12);input={fire:true,missile:!!target&&e.player.missiles>0,pulse:close,interact:e.phase==='dock'};}
   }
   e.step(1/60,input);
   assert(e.player.pos.every(Number.isFinite)&&Number.isFinite(e.player.hp));
   if(e.board)assert(e.board.pos.every(Number.isFinite)&&Number.isFinite(e.board.hp));
   if(frames%1800===0){assert.deepEqual(listenerState(h),initialListeners);await new Promise(setImmediate);}
  }
  assert.equal(e.status,'won');
  assert.deepEqual(copy(e.campaign2120.completed),copy(api.ids),'All missions must complete in the declared order');
  const expected=Object.fromEntries(api.ids.map(id=>[id,id==='mrg'?0:['orbit1','pursuit','swarm','orbit4'].includes(id)?2:['base1','base2','base3','base4','lair'].includes(id)?3:1]));
  const actual=Object.fromEntries(api.ids.map(id=>[id,cards.filter(x=>x.mission===id).length]));assert.deepEqual(actual,expected,'Cards per mission');
  assert.equal(e.campaign2120.route,route);assert.equal(cards.length,28);
 }catch(err){error={message:err.message,stack:err.stack?.split('\n').slice(1,4)};}
 const result={pass:!error,error,mode,route,seed:e.seed,frames,seconds:+e.elapsed.toFixed(2),status:e.status,mission:api.mission(e),levels,cards,transitions,inspection:copy(api.inspection(e)),listenersStable:JSON.stringify(listenerState(h))===JSON.stringify(initialListeners),entrySha256:sha(entry.html),moduleSha256:sha(entry.sources.get('assets/citadel-campaign-v2.12.0.js')),experienceSha256:sha(entry.sources.get('assets/citadel-experience-v2.13.0.js')),pursuitSha256:sha(entry.sources.get('assets/citadel-pursuit-v2.6.0.js')),method:'Fresh continuous ordinary-input campaign with exact-state and answer-key QA operators. No health/resources/score/progression writes after e.start.',limitations:['Not a human playthrough or a physical-phone test.','Reading time is not simulated.']};
 fs.mkdirSync(out,{recursive:true});const stem=`campaign2160-${mode}-${route}`;
 fs.writeFileSync(path.join(out,stem+'.json'),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(path.join(out,stem+'-earned.json.gz'),zlib.gzipSync(JSON.stringify({entrySha256:result.entrySha256,moduleSha256:result.moduleSha256,experienceSha256:result.experienceSha256,pursuitSha256:result.pursuitSha256,mode,route,firstSnapshot,earned,finalSnapshot:copy(h.pack(e))}),{level:9}));
 console.log(JSON.stringify({DONE:true,...Object.fromEntries(['pass','error','mode','route','status','mission','seconds'].map(k=>[k,result[k]])),cards:cards.length,missions:levels.map(x=>x.mission)}));return result;
}
module.exports={play};if(require.main===module)play(process.argv[2]||'training',process.argv[3]||'convoy',{stationSolution:Number(process.argv[4])||0}).then(r=>{if(!r.pass)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
