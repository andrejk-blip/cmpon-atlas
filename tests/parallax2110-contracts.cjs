const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readEntry,gitEntry,lab,fixture}=require('./release260-verifier.cjs');
const {restore}=require('./learning280-verifier.cjs');
const {pilot}=require('./parallax2110-qa.cjs');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]}));
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','Arial');
const out=path.join(__dirname,'qa-2.11.0'),clone=x=>JSON.parse(JSON.stringify(x));
function layout(h,w,height){h.c.innerWidth=w;h.c.innerHeight=height;h.c.matchMedia=()=>({matches:w<900});h.arcade.canvas.width=w;h.arcade.canvas.height=height;h.arcade.canvas.getBoundingClientRect=()=>({left:0,top:0,width:w,height});}
async function main(){
 const entry=readEntry('index.html'),h=await lab(entry),checks=[],api=h.c.CITADEL_LEVIATHAN;
 const brief=fixture(h,12,false);brief.beginFinale();const briefHTML=h.run('finaleOverlay')(brief);assert(briefHTML.includes('4 маяка'));assert(!briefHTML.includes('45%'));checks.push({brief_matches_arena:true});
 for(const hz of [30,60])for(const serial of [0,1,2]){
  const e=fixture(h,12,false),s=e.finale.leviathan;s.serial=serial;s.droneClock=1e9;
  for(let i=0;i<hz*18&&!s.hits;i++)e.step(1/hz,{});
  assert(s.hits>0,`Visible ${api.patterns[serial].id} must damage at ${hz} Hz`);assert(e.player.hp<100);
  const hp=e.player.hp;for(let i=0;i<hz*.3;i++)e.step(1/hz,{});assert.equal(e.player.hp,hp,'A single strike cannot hit repeatedly');checks.push({kind:api.patterns[serial].id,hz,damage:100-e.player.hp});
 }
 const e=fixture(h,12,false);h.c.CITADEL_LEARNING_MODES.setEngineMode(e,'combat');e.upgrades.weapons=2;e.upgrades.armor=1;const control=pilot(e),snapshots={arrival:h.pack(e)};
 for(let i=0;i<60*150&&e.finale.phase==='boss'&&e.status==='playing';i++){
  e.step(1/60,control());const s=e.finale.leviathan;
  if(s.beacons===0&&s.attack?.phase==='windup'&&!snapshots.warning)snapshots.warning=h.pack(e);
  if(s.beacons===2&&!snapshots.half)snapshots.half=h.pack(e);
  if(s.beacons===4&&s.transit>=s.transitDuration&&!snapshots.crystal)snapshots.crystal=h.pack(e);
 }
 assert.equal(e.finale.phase,'breach');snapshots.breach=h.pack(e);
 for(let i=0;i<60*30&&e.finale.phase==='breach';i++)e.step(1/60,{});assert.equal(e.finale.phase,'landing','The opened crystal leads into the ordinary landing');
 checks.push({breach_to_landing:true});
 for(const [key,snapshot]of Object.entries(snapshots)){
  const current=restore(h,snapshot);current.pause();const saved=clone(h.pack(current));current.step(.04,{fire:true,pulse:true,turn:1});assert.deepEqual(clone(h.pack(current)),saved);
  const loaded=restore(h,saved);assert.deepEqual(clone(h.pack(loaded)),saved);current.resume();loaded.resume();
  for(let i=0;i<60;i++){current.step(1/60,{fire:true,turn:.3});loaded.step(1/60,{fire:true,turn:.3});}
  assert.deepEqual(clone(h.pack(loaded).engine),clone(h.pack(current).engine));checks.push({save:key,pass:true});
 }
 const legacy=await lab(gitEntry('603789c08cd3ddf03c978d01f57b3c8ec494ea14'));
 for(const mode of ['training','combat','pro'])for(let id=1;id<=14;id++){
  const before=fixture(legacy,id,mode==='training');legacy.c.CITADEL_LEARNING_MODES.setEngineMode(before,mode);before.step(.04,{});before.pause();const saved=clone(legacy.pack(before));
  const after=restore(h,saved);assert.deepEqual(clone(h.pack(after)),saved);before.resume();after.resume();
  for(let i=0;i<60;i++){before.step(1/60,{fire:true});after.step(1/60,{fire:true});}
  assert.deepEqual(clone(h.pack(after).engine),clone(legacy.pack(before).engine));
 }
 checks.push({legacy_exact_continuations:42,baseline:'603789c'});
 console.log('PASS six collision cases, five save checkpoints and 42 legacy continuations; rendering frames');
 const shield=fixture(h,12,false),hp=shield.boss.hp;shield.hit(shield.boss,1e6);assert.equal(shield.boss.hp,hp);assert.equal(shield.finale.phase,'boss');checks.push({shield_blocks_premature_core:true});
 const frames=[];
 for(const [key,snapshot]of Object.entries(snapshots))for(const [w,height,fx]of key==='warning'?[[1280,720,true],[640,360,false],[390,640,true]]:[[1280,720,true]]){
  const e=restore(h,snapshot);layout(h,w,height);h.arcade.fx=fx;const before=JSON.stringify(h.pack(e)),cam=h.camera(e,e.elapsed),scene=h.scene(e,e.elapsed,fx);
  assert(scene.length>100&&scene.length<650);const canvas=createCanvas(w,height),hud=createCanvas(w,height);h.draw(canvas.getContext('2d'),scene,cam,w,height);h.run('drawFinaleHUD')(hud.getContext('2d'),e,cam,w,height);canvas.getContext('2d').drawImage(hud,0,0);
  assert.equal(JSON.stringify(h.pack(e)),before,'Rendering must not mutate a save');
  const filename=`parallax-${key}-${w}${fx?'':'-fx-off'}.jpg`;fs.writeFileSync(path.join(out,filename),canvas.toBuffer('image/jpeg',90));frames.push({filename,items:scene.length,width:w,height,fx});
  const limbs=scene.filter(x=>x.leviathanFeature==='tentacle');assert.equal(limbs.length,128);for(const l of limbs){assert(l.from.every(Number.isFinite));assert(l.to.every(Number.isFinite));assert(l.radius>0);}
 }
 const refs=h.run('[RequirementArcade.prototype.stepFinalSpace,spaceScene,drawFinaleHUD]');h.run(fs.readFileSync(path.join(__dirname,'../assets/citadel-parallax-v2.11.0.js'),'utf8'));h.run('[RequirementArcade.prototype.stepFinalSpace,spaceScene,drawFinaleHUD]').forEach((x,i)=>assert.equal(x,refs[i]));
 fs.writeFileSync(path.join(out,'parallax-contracts.json'),JSON.stringify({pass:true,checks,frames,idempotent:true},null,2)+'\n');console.log('PASS collisions, one-hit strikes, shield, save/pause/replay, 42 exact legacy continuations, breach, readonly bounded rendering and idempotence');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
