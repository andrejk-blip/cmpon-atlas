const fs=require('node:fs');const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createCanvas}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
(async()=>{const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');const e=new h.Engine(417147);h.arcade.engine=e;e.assist=false;e.beginStage(2);e.upgrades={weapons:2,rockets:0,armor:1};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();
 for(let i=0;i<32*60&&e.status==='playing';i++)e.step(1/60,{});
 fs.writeFileSync('tests/qa-2.3.0/checkpoint-action.json',JSON.stringify(h.pack(e))+'\n');
 for(const [w,he,name]of [[1280,720,'convoy-desktop'],[390,720,'convoy-phone']]){
  h.c.innerWidth=w;h.c.innerHeight=he;h.arcade.canvas.width=w;h.arcade.canvas.height=he;h.arcade.canvas.getBoundingClientRect=()=>({width:w,height:he});
  const canvas=createCanvas(w,he),c=canvas.getContext('2d'),cam=h.camera(e,e.elapsed),scene=h.scene(e,e.elapsed,true),before=JSON.stringify(h.pack(e));
  const started=performance.now();h.draw(c,scene,cam,w,he);const overlay=createCanvas(w,he);h.run('drawEscortHUD')(overlay.getContext('2d'),e,cam,w,he);c.drawImage(overlay,0,0);
  if(JSON.stringify(h.pack(e))!==before)throw Error('Render mutated game');
  fs.writeFileSync('tests/qa-2.3.0/'+name+'.png',canvas.toBuffer('image/png'));console.log(JSON.stringify({name,items:scene.length,ms:performance.now()-started,status:e.status,hp:e.escort.allies.map(a=>a.hp),stats:h.c.CITADEL_PURSUIT_VIEW.stats()}));
 }
 // Read-only model plate, the very same world mesh used by flying hounds.
 const canvas=createCanvas(1000,700),c=canvas.getContext('2d'),items=h.c.CITADEL_CONVOY_VIEW.testDog(),cam=h.run('Object.assign(stationLook([8,5,10],[0,0,0],.8,{near:.35,far:200}),{convoy230:true,chapter:0})');h.draw(c,items,cam,1000,700);fs.writeFileSync('tests/qa-2.3.0/hound-model.png',canvas.toBuffer('image/png'));
})().catch(e=>{console.error(e);process.exitCode=1;});
