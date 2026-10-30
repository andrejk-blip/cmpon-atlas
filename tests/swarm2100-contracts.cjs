'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {boot,clone,out}=require('./swarm2100-balance.cjs');
(async()=>{
 const old=await boot('baseline'),h=await boot(),e=new old.Engine(417147);old.arcade.engine=e;e.assist=false;old.c.CITADEL_LEARNING_MODES.setEngineMode(e,'combat');e.beginStage(2);e.launch();
 for(let i=0;i<240;i++)e.step(1/60,{fire:true,turn:.1});assert(e.hostile.length>0);e.pause();const saved=clone(old.pack(e));
 const restored=h.unpack(saved,{seed:e.seed,mode:'normal'},()=>{});h.arcade.engine=restored;assert.deepEqual(clone(h.pack(restored)),saved);
 restored.step(1/60,{fire:true});assert.deepEqual(clone(h.pack(restored)),saved,'Pause must not migrate or advance state');
 const bullets=restored.hostile.map(b=>({ref:b,damage:b.damage,speed:b.speed})),hp=restored.player.hp,kills=restored.stageKills,score=restored.score;
 restored.resume();restored.step(1/60,{});assert.equal(restored.swarm.balanceVersion,'2.10.0');assert(restored.player.hp<=hp);assert.equal(restored.stageKills,kills);assert.equal(restored.score,score);
 bullets.forEach(({ref,damage,speed})=>{assert.equal(ref.damage,damage);assert.equal(ref.speed,speed);});
 const legacy=clone(saved);delete legacy.engine.swarm.tacticsVersion;const older=h.unpack(legacy,{seed:e.seed,mode:'normal'},()=>{});h.arcade.engine=older;older.resume();older.step(1/60,{});assert.equal(older.swarm.balanceVersion,undefined);
 const fresh=new h.Engine(417147);h.arcade.engine=fresh;fresh.beginStage(2);fresh.launch();for(let i=0;i<120;i++)fresh.step(1/60,{});assert.equal(fresh.hostile.length,0,'No incoming fire before the entry animation completes');
 const report={pass:true,checks:['paused saves remain byte-identical','active 2.8/2.9 saves adopt easier attacks once','in-flight shot damage and speed retained','no health, kill or score reset','pre-tactics saves retain their rules','2-second safe wave entry'],inFlightShotsChecked:bullets.length};
 fs.writeFileSync(path.join(out,'balance-contracts.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1;});
