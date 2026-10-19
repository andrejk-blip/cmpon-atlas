const fs=require('node:fs');const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');const {convoyInput}=require('./helpers/convoy240-inputs.js');
async function run(){const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');const reports=[];
for(const policy of ['idle','fire','fire-cover','pilot'])for(const assist of [false,true])for(let stage=0;stage<3;stage++){
 const e=new h.Engine(417147);h.arcade.engine=e;e.assist=assist;e.beginStage(stage);e.upgrades={weapons:stage+1,rockets:0,armor:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();let occupied=0;
 for(let i=0;i<60*230&&['playing','crashing'].includes(e.status);i++){if(e.enemies.length)occupied+=1/60;const input=policy==='pilot'?convoyInput(h,e):policy==='idle'?{}:{fire:true,pulse:policy==='fire-cover'};e.step(1/60,input);}
 const r={policy,assist,status:e.status,hp:+e.player.hp.toFixed(1),occupied:+occupied.toFixed(1),...h.c.CITADEL_CONVOY.inspection(e)};reports.push(r);console.log(JSON.stringify({policy,assist,stage,status:r.status,hp:r.hp,allies:r.allies.map(x=>Math.round(x.hp)),time:r.time,occupied:r.occupied,fields:r.stats.fieldsHit,torpedoes:r.stats.torpedoes,volleys:r.stats.volleys}));}
fs.writeFileSync('tests/qa-2.4.0/balance.json',JSON.stringify(reports,null,2)+'\n');}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});
