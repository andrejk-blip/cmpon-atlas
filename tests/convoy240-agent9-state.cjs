'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {fixture,pilot}=require('./convoy240-agent9.cjs');
const state=e=>JSON.stringify({status:e.status,phase:e.phase,elapsed:e.elapsed,escort:e.escort,player:e.player,enemies:e.enemies,bullets:e.bullets,hostile:e.hostile,score:e.score,entityId:e.entityId,selectedTarget:e.selectedTarget,shots:e.shots});
async function harness(){const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');return h;}
(async()=>{
 const out=[];
 for(const mode of ['normal','calm'])for(const hz of [30,60]){
  const h=await harness(),e=fixture(h,{mode}),op=pilot(h,e,.4,'joystick');
  for(let frame=0;frame<hz*30&&e.status==='playing';frame++){e.step(1/hz,op.input());const f=e.escort.ops240.fields[0];if(f&&!f.passed&&f.warning<.24)break;}
  assert.equal(e.status,'playing');assert.equal(e.escort.ops240.stats.fieldsPassed,0);assert.equal(e.escort.ops240.stats.fieldsHit,0);
  const near=e.escort.ops240.fields[0].warning;
  h.action('arcade-pause');const before=state(e);for(let i=0;i<hz*15;i++)e.step(1/hz,{fire:true,turn:1,pulse:true});assert.equal(state(e),before,'Pause mutates field or combat');h.action('arcade-resume');assert.equal(e.status,'playing');
  const saved=h.pack(e),other=await harness(),restored=other.unpack(saved,{seed:417147,mode},()=>{});other.arcade.engine=restored;assert(other.c.CITADEL_CONVOY.active(restored));
  assert.equal(state(restored),state(e),'Save roundtrip differs');
  const a=pilot(h,e,.4,'joystick'),b=pilot(other,restored,.4,'joystick');
  for(let i=0;i<hz*8;i++){e.step(1/hz,a.input());restored.step(1/hz,b.input());assert.equal(state(restored),state(e),'Post-load divergence at frame '+i);}
  assert.equal(e.escort.ops240.stats.fieldsPassed,1);assert.equal(e.escort.ops240.stats.fieldsHit,0);
  out.push({mode,hz,pass:true,warningSecondsBeforePause:near,pauseSimulatedSeconds:15,postLoadComparisonSeconds:8,fieldsPassed:e.escort.ops240.stats.fieldsPassed,fieldsHit:e.escort.ops240.stats.fieldsHit,stateSHA256:crypto.createHash('sha256').update(state(e)).digest('hex')});
 }
 const result={method:'Node VM only. Pausing 0.24s before the first visible field, full save roundtrip, ordinary independent commands after load; no HP or outcome changes.',passed:out.length,results:out};fs.writeFileSync('tests/qa-2.4.0/agent-level9-state.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
