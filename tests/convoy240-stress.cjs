const fs=require('node:fs'),assert=require('node:assert/strict');const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');const {convoyInput}=require('./helpers/convoy240-inputs.js');
(async()=>{const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');const samples=[],began=performance.now();let total=0,updates=0,emitterChanges=0,maxEnemies=0,maxEvents=0;const listenerCount=()=>[...h.handlers.values(),...h.windowHandlers.values()].reduce((s,a)=>s+a.length,0),baseline=listenerCount();
 for(let n=0;n<30;n++){
  const e=new h.Engine(417147+n);h.arcade.engine=e;e.assist=n%2===1;e.beginStage(n%3);e.upgrades={weapons:n%3+1,armor:0,rockets:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();e.step(1/60,{});const emitter=e.emit;
  for(let i=0;i<180*60&&e.status==='playing';i++){e.step(1/60,convoyInput(h,e));updates++;if(e.emit!==emitter)emitterChanges++;maxEnemies=Math.max(maxEnemies,e.enemies.length);maxEvents=Math.max(maxEvents,e.escort.ops240.events.length);assert(e.player.pos.every(Number.isFinite));}
  assert.equal(e.status,'escortclear');total+=e.escort.time;assert.equal(listenerCount(),baseline);h.scene(e,e.elapsed,true);
  if(global.gc)global.gc();samples.push({run:n+1,seconds:Math.round(total),heapBytes:process.memoryUsage().heapUsed,listeners:listenerCount(),templates:h.c.CITADEL_CONVOY_VIEW.stats().templates});
 }
 assert.equal(emitterChanges,0);assert(maxEvents<=64&&maxEnemies<=18);const heapGrowth=samples.at(-1).heapBytes-samples[5].heapBytes;assert(heapGrowth<12*1024*1024);
 const r={pass:true,method:'Node VM, 30 ordinary-input convoy completions, real damage and interceptions; explicit GC samples. Simulation duration is not browser wall time.',missions:30,simulatedSeconds:total,wallSeconds:(performance.now()-began)/1000,updates,emitterChanges,maxEnemies,maxEvents,heapGrowthAfterWarmup:heapGrowth,samples};fs.writeFileSync('tests/qa-2.4.0/stress.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({...r,samples:undefined}));
})().catch(e=>{console.error(e);process.exitCode=1;});
