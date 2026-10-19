const fs=require('node:fs');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {convoyInput:pilot}=require('./helpers/convoy-inputs.js');
async function run(){const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');const reports=[];
 for(const assist of [false,true])for(let stage=0;stage<3;stage++)for(const seed of [417147,731,98211]){
  const e=new h.Engine(seed);h.arcade.engine=e;e.assist=assist;e.beginStage(stage);e.upgrades={weapons:stage+1,rockets:0,armor:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();
  for(let i=0;i<60*220&&e.status==='playing';i++){e.step(1/60,pilot(h,e));}
  reports.push({stage,assist,seed,status:e.status,kills:e.escort.kills,hp:e.player.hp,...h.c.CITADEL_CONVOY.inspection(e)});
 }
 fs.writeFileSync('tests/qa-2.3.0/balance.json',JSON.stringify(reports,null,2)+'\n');for(const r of reports)console.log(JSON.stringify({stage:r.stage,assist:r.assist,seed:r.seed,status:r.status,time:r.time,kills:r.kills,hp:r.allies.map(a=>Math.round(a.hp)),stats:r.stats}));
 if(reports.some(r=>r.status!=='escortclear'))process.exitCode=1;
}
module.exports={pilot};if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
