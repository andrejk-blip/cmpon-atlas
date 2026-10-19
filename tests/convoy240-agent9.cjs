'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const root=path.resolve(__dirname,'..');
const sources=['assets/citadel-convoy-v2.4.0.js','assets/citadel-convoy-view-v2.4.0.js'];
function fixture(h,{mode='normal',seed=417147,upgrades=null}={}){
 // Synthetic ENTRY fixture only: the real previously earned progress/upgrades
 // are restored, then beginEscort performs its normal initialization. No combat
 // HP, score, enemies, progression or outcome is ever set by the operator.
 const saved=JSON.parse(fs.readFileSync(path.join(__dirname,'qa-2.3.0/checkpoint-'+mode+'-9.json')));
 saved.engine.seed=seed;
 const e=h.unpack(saved,{seed,mode},()=>{});h.arcade.engine=e;
 if(upgrades)e.upgrades={...upgrades};
 e.status='stageclear'; e.beginEscort();h.action('citadel-launch');
 assert(h.c.CITADEL_CONVOY.active(e));assert.equal(e.stage,2);assert.equal(e.escort.time,0);
 return e;
}
function pilot(h,e,period=.4,style='joystick'){
 let next=0,held={},decisions=0,tabs=0,pulses=0,missiles=0;
 function input(){
  if(e.escort.time+1e-8>=next){
   next=e.escort.time+period;decisions++;
   const live=e.enemies.filter(x=>!x.dead&&x.warp<=0),p=e.player;
   // Only objects currently present in the game. No mission plan/future waves.
   const rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='bomber'?3:x.role==='raider'?4:x.role==='interceptor'?5:x.role==='jammer'?6:7;
   const desired=live.slice().sort((a,b)=>rank(a)-rank(b)||a.hp-b.hp)[0];
   if(desired&&e.selectedTarget!==desired.id){h.action('citadel-target');tabs++;}
   const t=e.target();
   let gx=t?t.pos[0]:p.pos[0],gy=t?t.pos[1]:p.pos[1];
   const f=e.escort.ops240.fields.find(x=>!x.passed);
   if(f){
    const tx=clamp(gx,f.gapX-f.halfW+4.2,f.gapX+f.halfW-4.2),ty=clamp(gy,f.gapY-f.halfH+4.2,f.gapY+f.halfH-4.2);
    const travel=Math.max(Math.abs(tx-p.pos[0]),Math.abs(ty-p.pos[1]))/14;
    if(f.warning<travel+1.25||f.warning<1.2){gx=tx;gy=ty;}
   }
   const axis=error=>style==='keyboard'?(Math.abs(error)>14*period*.48?Math.sign(error):0):clamp(error/(14*period),-1,1);
   held={turn:axis(gx-p.pos[0]),pitch:axis(gy-p.pos[1]),fire:true};
   const incoming=e.enemies.filter(x=>x.torpedo&&!x.dead),inDanger=incoming.some(x=>{const a=e.escort.allies[x.ally];return a&&!a.dead&&Math.hypot(...x.pos.map((v,i)=>v-a.pos[i]))<30;});
   held.pulse=p.pulseCooldown<=0&&(inDanger||e.hostile.filter(x=>x.ally!==-1&&x.life<4).length>=4);
   held.missile=!!t&&!t.torpedo&&p.missiles>0&&p.missileCooldown<=0&&((t.role==='shield'||t.role==='commander'||t.role==='bomber')&&t.hp>120)&&(!f||f.warning<3||e.escort.time>55);
   if(held.pulse)pulses++;if(held.missile)missiles++;
  }
  h.arcade.keys.clear();h.arcade.joystick=null;
  if(style==='keyboard'){
   if(held.turn>0)h.arcade.keys.add('KeyD');else if(held.turn<0)h.arcade.keys.add('KeyA');
   if(held.pitch>0)h.arcade.keys.add('KeyW');else if(held.pitch<0)h.arcade.keys.add('KeyS');
  }else h.arcade.joystick={x:held.turn||0,y:-(held.pitch||0)};
  if(held.fire)h.arcade.keys.add('Space');
  h.arcade.missileQueued=!!held.missile;h.arcade.pulseQueued=!!held.pulse;
  held.missile=held.pulse=false;
  return h.input();
 }
 return {input,stats:()=>({decisions,tabs,pulses,missiles,decisionPeriod:period,style})};
}
async function main(){
 const h=entryHarness(entrySnapshot());await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');
 const runs=[];const options=process.argv.includes('--quick')?[{mode:'normal',seed:417147,hz:60,period:.4,style:'joystick'}]:['normal','calm'].flatMap(mode=>[30,60].flatMap(hz=>[417147,731,98211].map((seed,i)=>({mode,hz,seed,period:i===0?.35:i===1?.45:.6,style:i===1?'keyboard':'joystick'}))));
 for(const opts of options){for(const ctl of ['fire','fire+E','pilot']){
  const e=fixture(h,opts),op=pilot(h,e,opts.period,opts.style);let quiet=0,updates=0;
  for(let i=0;i<opts.hz*220&&e.status==='playing';i++){
   const input=ctl==='pilot'?op.input():{fire:true,pulse:ctl==='fire+E'};e.step(1/opts.hz,input);updates++;if(!e.enemies.length)quiet+=1/opts.hz;
   assert(e.player.pos.every(Number.isFinite));
  }
  const report={...opts,controller:ctl,status:e.status,time:+e.escort.time.toFixed(2),hp:+e.player.hp.toFixed(2),allies:e.escort.allies.map(a=>({hp:+a.hp.toFixed(2),dead:a.dead})),fieldsPassed:e.escort.ops240.stats.fieldsPassed,fieldsHit:e.escort.ops240.stats.fieldsHit,kills:e.escort.kills,campaignShots:e.shots,quietSeconds:+quiet.toFixed(2),updates,stats:clone(e.escort.ops240.stats),controls:ctl==='pilot'?op.stats():null,lossReason:e.lossReason,events:clone(e.escort.ops240.events)};runs.push(report);console.log(JSON.stringify({...report,events:undefined}));
 }}
 const report={method:'Node VM; genuine production rules; isolated level9 entry from prior campaign progress; only ordinary movement/fire/target/missile/pulse commands during play. No browser or physical device. Runtime physics is deterministic; seeds test setup consistency, not randomized encounter variety.',sourceHashes:Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),runs};
 fs.writeFileSync(path.join(__dirname,'qa-2.4.0/agent-level9-runs.json'),JSON.stringify(report,null,2)+'\n');
}
module.exports={fixture,pilot};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
