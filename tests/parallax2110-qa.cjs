const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
const clamp=n=>Math.max(-1,Math.min(1,n));
const out=path.join(__dirname,'qa-2.11.0');fs.mkdirSync(out,{recursive:true});
function pilot(e,{reaction=.3,move=true,pulse=true,missile=true}={}){
 let next=0,input={},attack=0,avoid=null;
 return()=>{
  if(e.elapsed<next)return input;next=e.elapsed+reaction;
  const s=e.finale.leviathan,g=e.enemies.find(x=>x.id===s.focus&&!x.dead)||e.boss,a=s.attack;
  let x=g.pos[0],y=g.pos[1];input={fire:true,missile:missile&&e.player.missiles>0};
  if(a&&a.phase!=='recover'){
   if(a.id!==attack){attack=a.id;avoid=a.aim.slice();if(a.kind==='pincer')avoid[0]+=s.offset[0]>0?-23:23;else avoid[1]+=s.offset[1]>0?-23:23;}
   if(a.phase==='strike'||a.windup-a.time<.85){x=avoid[0];y=avoid[1];}
   if(pulse&&a.phase==='windup'&&a.windup-a.time<.4&&e.player.pulseCooldown<=0)input.pulse=true;
  }
  if(move){input.turn=clamp((x-e.player.pos[0])*.16);input.pitch=clamp((y-e.player.pos[1])*.16);}
  return input;
 };
}
async function main(){
 const h=await lab(readEntry('index.html')),api=h.c.CITADEL_LEVIATHAN;assert(api);
 const rows=[];let renderSave=null;
 for(const mode of ['training','combat','pro'])for(const fps of [30,60])for(const seed of [417147,731,939]){
  const e=fixture(h,12,mode==='training');h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);
  // Standard pre-boss loadout, established before the flight starts.
  e.upgrades.weapons=2;e.upgrades.armor=1;e.seed=seed;e.beginFinale();e.launchFinale();
  const control=pilot(e),startHP=e.player.hp;let peakHostile=0,peakDrones=0;
  for(let i=0;i<fps*180&&e.finale.phase==='boss'&&e.status==='playing';i++){
   e.step(1/fps,control());assert(e.player.pos.every(Number.isFinite));
   peakHostile=Math.max(peakHostile,e.hostile.length);peakDrones=Math.max(peakDrones,e.finale.leviathan.drones.length);
   if(!renderSave&&mode==='combat'&&e.finale.leviathan.beacons===0&&e.elapsed>7)renderSave=h.pack(e);
  }
  const s=e.finale.leviathan,row={mode,fps,seed,pass:e.finale.phase==='breach',phase:e.finale.phase,status:e.status,seconds:+s.clock.toFixed(2),hp:+e.player.hp.toFixed(1),beacons:s.beacons,hits:s.hits,evaded:s.evaded,blocked:s.blocked,peakHostile,peakDrones};rows.push(row);console.log(JSON.stringify(row));
 }
 const basic=[];
 for(const mode of ['training','combat','pro']){
  const e=fixture(h,12,mode==='training');h.c.CITADEL_LEARNING_MODES.setEngineMode(e,mode);
  const control=pilot(e,{reaction:.55,missile:false,pulse:false});
  for(let i=0;i<60*200&&e.finale.phase==='boss'&&e.status==='playing';i++)e.step(1/60,control());
  basic.push({mode,pass:e.finale.phase==='breach',seconds:+e.finale.leviathan.clock.toFixed(2),hp:e.player.hp,hits:e.finale.leviathan.hits});
 }
 fs.writeFileSync(path.join(out,'parallax-basic-pilot.json'),JSON.stringify({method:'Ordinary inputs; 0.55 s response, no missiles or pulse, no weapon upgrades, not human win rate.',rows:basic},null,2)+'\n');
 const e=fixture(h,12,false),control=pilot(e,{move:false,pulse:false,missile:false});for(let i=0;i<60*180&&e.status==='playing'&&e.finale.phase==='boss';i++)e.step(1/60,control());
 const negative={phase:e.finale.phase,status:e.status,beacons:e.finale.leviathan.beacons,hp:e.player.hp};assert.notEqual(negative.phase,'breach','Holding fire without steering must not complete the boss');
 const report={pass:rows.every(r=>r.pass)&&basic.every(r=>r.pass),method:'Node VM, ordinary movement/weapon inputs at 0.3 s reaction. No changes to health, ammo or objectives during flight. Not a human win rate.',rows,basicPilots:basic,stationary:negative};
 fs.writeFileSync(path.join(out,'parallax-playthroughs.json'),JSON.stringify(report,null,2)+'\n');
 if(renderSave)fs.writeFileSync(path.join(out,'parallax-frame-save.json'),JSON.stringify(renderSave));
 if(!report.pass)process.exitCode=1;
}
module.exports={pilot};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
