/* Independent level-3 QA: ordinary UI actions and bounded-rate keyboard/joystick inputs.
 * Synthetic mission-start fixture; no enemy/ally HP edits, teleporting or victory overrides.
 */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const output='tests/qa-2.4.0';
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const entry=entrySnapshot();
async function harness(){const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');return h;}
function fixture(h,{seed=417147,assist=false}={}){const e=new h.Engine(seed);h.arcade.engine=e;e.assist=assist;e.beginStage(0);e.upgrades={weapons:1,rockets:0,armor:0};e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();h.action('citadel-launch');assert.equal(e.autopilot,false);assert(h.c.CITADEL_CONVOY.active(e));return e;}
function operator(h,e,{strategy='reactive',device='keyboard',reaction=.45}={}){
 let nextDecision=0,held={turn:0,pitch:0,fire:strategy!=='idle'},decisions=0,cycles=0,missileCommands=0,pulseCommands=0;
 const applyInput=()=>{h.arcade.keys.clear();h.arcade.joystick=null;if(held.fire)h.arcade.keys.add('Space');if(device==='joystick')h.arcade.joystick={x:held.turn,y:-held.pitch};else {if(held.turn)h.arcade.keys.add(held.turn>0?'KeyD':'KeyA');if(held.pitch)h.arcade.keys.add(held.pitch>0?'KeyW':'KeyS');}return h.input();};
 function input(){const now=e.escort.time;if(now+1e-8>=nextDecision){nextDecision=now+reaction;decisions++;
  if(strategy==='reactive'){
   const live=e.enemies.filter(x=>!x.dead&&x.warp<=0),rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='bomber'?3:x.role==='raider'?4:5;
   const best=live.slice().sort((a,b)=>rank(a)-rank(b)||distance(a.pos,e.player.pos)-distance(b.pos,e.player.pos))[0];
   if(best&&e.selectedTarget!==best.id){h.action('citadel-target');cycles++;}
   const target=e.target(),field=e.escort.ops240.fields.find(f=>!f.passed);
   let goal=target?target.pos.slice(0,2):e.player.pos.slice(0,2);
   // Stay away from the visible edge by the hull radius plus one delayed
   // keyboard half-step. An operator hugging the edge can overshoot it.
   if(field){const margin=device==='keyboard'?2.8+14*reaction*.65+1:4.5,mx=Math.max(0,field.halfW-margin),my=Math.max(0,field.halfH-margin);goal=[clamp(goal[0],field.gapX-mx,field.gapX+mx),clamp(goal[1],field.gapY-my,field.gapY+my)];}
   goal=[clamp(goal[0],-34,34),clamp(goal[1],-17,17)];
   const control=(g,p)=>device==='joystick'?clamp((g-p)/(14*reaction),-1,1):Math.abs(g-p)>14*reaction*.55?Math.sign(g-p):0;
   held={fire:true,turn:control(goal[0],e.player.pos[0]),pitch:control(goal[1],e.player.pos[1])};
   const d=target?target.pos.map((v,i)=>v-e.player.pos[i]):null,locked=d&&d[2]<-4&&Math.hypot(d[0],d[1])<=-d[2]*(e.assist?.24:.19)+(target.r||0);
   if(locked&&target.hp>160&&e.player.missiles>0&&e.player.missileCooldown<=0){h.arcade.missileQueued=true;missileCommands++;}
   const imminent=e.hostile.some(b=>b.ally>=0&&e.escort.allies[b.ally]&&!e.escort.allies[b.ally].dead&&distance(b.pos,e.escort.allies[b.ally].pos)<28);
   if(imminent&&e.player.pulseCooldown<=0){h.arcade.pulseQueued=true;pulseCommands++;}
  } else if(strategy==='fire-pulse'&&e.player.pulseCooldown<=0){h.arcade.pulseQueued=true;pulseCommands++;}
 }return applyInput();}
 return {input,stats:()=>({decisions,cycles,missileCommands,pulseCommands,reaction,device,strategy})};
}
function gameState(e){return clone({escort:e.escort,player:e.player,enemies:e.enemies,bullets:e.bullets,hostile:e.hostile,status:e.status,score:e.score,entityId:e.entityId,elapsed:e.elapsed});}
async function run(options){const h=await harness(),e=fixture(h,options),pilot=operator(h,e,options),hz=options.hz||60;let idleSeconds=0,frames=0;
 while(!['escortclear','lost'].includes(e.status)&&frames<hz*160){if(!e.enemies.length)idleSeconds+=1/hz;e.step(1/hz,pilot.input());frames++;}
 return {...options,status:e.status,seconds:+e.escort.time.toFixed(3),playerHP:e.player.hp,allies:e.escort.allies.map(a=>({hp:a.hp,dead:a.dead})),kills:e.escort.kills,shots:e.shots,missilesRemaining:e.player.missiles,idleSeconds:+idleSeconds.toFixed(3),input:pilot.stats(),inspection:clone(h.c.CITADEL_CONVOY.inspection(e))};
}
async function contracts(){const results=[];let h=await harness(),e=fixture(h),pilot=operator(h,e,{});for(let i=0;i<13*60;i++)e.step(1/60,pilot.input());assert(e.escort.ops240.fields.some(f=>!f.passed));
 h.action('arcade-pause');const before=gameState(e);for(let i=0;i<9*60;i++)e.step(1/60,{fire:true,turn:1,pitch:1,pulse:true});assert.deepEqual(gameState(e),before);h.action('arcade-resume');assert.equal(e.status,'playing');results.push({name:'Pause during first warning freezes field, projectiles, positions and clock',pass:true});
 const packed=h.pack(e),h2=await harness(),other=h2.unpack(packed,{seed:e.seed,mode:'normal'},()=>{});h2.arcade.engine=other;assert.deepEqual(gameState(other),gameState(e));
 const originalAction=h.action;h.action=(name,value)=>{h2.action(name,value);return originalAction(name,value);};
 for(let i=0;i<10*60;i++){const input=pilot.input();e.step(1/60,input);other.step(1/60,clone(input));}
 assert.deepEqual(gameState(other),gameState(e));const events=e.escort.ops240.events.filter(x=>/^field-(hit|pass)$/.test(x.kind)&&x.id===1);assert.equal(events.length,1);results.push({name:'Save/restore during warning produces equal outcomes and a single field crossing',pass:true,fieldEvent:events[0],playerHP:e.player.hp});
 const h3=await harness(),e3=fixture(h3),pilot3=operator(h3,e3,{device:'joystick',reaction:.6});for(let i=0;i<18*60;i++)e3.step(1/60,pilot3.input());assert(e3.escort.ops240.stats.fieldsPassed===1);assert.equal(e3.escort.ops240.stats.fieldsHit,0);results.push({name:'First teaching field is reachable by joystick with 0.6-second decisions',pass:true});
 return results;
}
async function main(){fs.mkdirSync(output,{recursive:true});const runs=[];for(const strategy of ['idle','fire','fire-pulse'])for(const assist of [false,true])runs.push(await run({strategy,assist,hz:60,seed:417147}));
 for(const device of ['keyboard','joystick'])for(const assist of [false,true])for(const hz of [30,60])for(const seed of [417147,731,98211])runs.push(await run({strategy:'reactive',device,assist,hz,seed,reaction:device==='joystick'?.6:.45}));
 const checks=await contracts();const report={generatedAt:new Date().toISOString(),method:'Independent Node VM simulation using production entry and arcadeInput/actions. Synthetic level-3 entry, weapons=1. Decisions every 0.45 s (keyboard) or 0.6 s (joystick); at most one target-cycle per decision. No HP edits, teleports or forced victory. No browser/physical phone test.',sourceHashes:Object.fromEntries(['assets/citadel-convoy-v2.4.0.js','assets/citadel-convoy-view-v2.4.0.js'].map(p=>[p,crypto.createHash('sha256').update(entry.sources.get(p)).digest('hex')])),runs,checks};fs.writeFileSync(output+'/agent-level3.json',JSON.stringify(report,null,2)+'\n');for(const r of runs)console.log(JSON.stringify({strategy:r.strategy,assist:r.assist,device:r.device,hz:r.hz,seed:r.seed,status:r.status,playerHP:r.playerHP,allies:r.allies.map(a=>a.hp),fields:r.inspection.stats.fieldsPassed+'/'+r.inspection.stats.fieldsHit,kills:r.kills}));console.log(JSON.stringify({checks}));}
module.exports={run,contracts,operator,fixture,harness};
if(require.main===module)main().then(()=>{
 const report=JSON.parse(fs.readFileSync(output+'/agent-level3.json','utf8'));
 const reactive=report.runs.filter(x=>x.strategy==='reactive');
 assert.equal(reactive.length,24);
 assert(reactive.every(x=>x.status==='escortclear'&&x.inspection.stats.fieldsPassed===3&&x.inspection.stats.fieldsHit===0),'Reactive pilot must complete every field at 30/60 Hz');
 assert(report.runs.filter(x=>x.strategy!=='reactive'&&!x.assist).every(x=>x.status==='lost'),'Normal mode must require actual manoeuvring');
 assert(report.checks.every(x=>x.pass));
}).catch(e=>{console.error(e);process.exitCode=1;});
