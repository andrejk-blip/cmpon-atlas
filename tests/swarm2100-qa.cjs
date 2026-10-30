#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {boot,play,clone,out}=require('./swarm2100-balance.cjs');
const {createCanvas,GlobalFonts}=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','sans-serif');
async function holdout(){
 const h=await boot(),runs=[];
 for(const hz of [30,60])for(const seed of [1729,861023,982451,73591]){const x=play(h,{seed,reaction:.4,hz});runs.push(x.row);console.log(JSON.stringify(x.row));}
 for(const control of ['stationary','no-fire']){const x=play(h,{seed:1729,reaction:.4,control});assert(!x.row.complete,'Inactive controls must not win');runs.push(x.row);}
 const pro=play(h,{seed:1729,reaction:.4,mode:'pro'});runs.push(pro.row);assert.equal(pro.row.complete,runs[4].complete);
 fs.writeFileSync(path.join(out,'holdout.json'),JSON.stringify({method:'Unseen seeds; ordinary fixed joystick pilot, no in-flight state changes. Not human success rates.',runs},null,2)+'\n');
 console.log('HOLDOUT '+runs.slice(0,8).filter(x=>x.complete).length+'/8');
}
async function visual(){
 const h=await boot();h.c.OffscreenCanvas=function(w,he){return createCanvas(w,he);};
 const art=h.c.CITADEL_SWARM_ART;assert(art);const sheet=createCanvas(1400,1000),c=sheet.getContext('2d');c.fillStyle='#08131f';c.fillRect(0,0,1400,1000);
 const names=['Разведчик','Перехватчик','Бомбардировщик','Щитоносец','Торпедоносец','Командир','Корабль игрока'];
 art.roles.forEach((role,i)=>{const x=100+i*200;c.fillStyle='#e0d9bf';c.font='17px sans-serif';c.textAlign='center';c.fillText(names[i],x,35);art.ship(c,{x,y:145,rx:86,ry:90},i===6?3:1,0,false,true,1,false,role);for(const lod of [true,false])for(const flash of [true,false])art.ship(c,{x,y:290+(lod?80:0),rx:28,ry:28},i===6?3:1,Math.PI,flash,true,1,false,role,lod);});
 for(const [j,type]of ['repair','missiles','overdrive'].entries())for(let i=0;i<8;i++){const x=90+i*174,y=450+j*130;art.pickup(c,{x,y},type,i*.45,45,true);}
 for(let i=0;i<8;i++)art.explosion(c,{x:90+i*174,y:860},i/8,6);
 for(let i=0;i<8;i++)art.projectile(c,{x:90+i*174,y:950},{x:i%2?1:0,y:-1},{type:i%4===0?'missile':i%4===1?'swarm-torpedo':'swarm-bolt'},i%2===1,true,false);
 fs.writeFileSync(path.join(out,'fleet-supplies-effects.jpg'),sheet.toBuffer('image/jpeg',91));
 const reached=play(h,{seed:417147,reaction:.4,checkpoints:true}),snap=reached.snaps.find(x=>x.engine.swarm.waveIndex===3);assert(snap);
 const e=h.unpack(snap,{seed:417147,mode:'normal'},()=>{});h.arcade.engine=e;for(let i=0;i<150;i++)e.step(1/60,{fire:true});const saved=JSON.stringify(h.pack(e));
 const frames=[];for(const [w,he,fx]of [[1280,720,true],[640,360,true],[390,640,true],[640,360,false]]){const cv=createCanvas(w,he),ctx=cv.getContext('2d');h.c.CITADEL_SWARM_VIEW.drawScene(ctx,e,w,he,{fx});h.c.CITADEL_SWARM_VIEW.drawHUD(ctx,e,w,he);const name='swarm-'+w+(fx?'':'-fx-off')+'.png';fs.writeFileSync(path.join(out,name),cv.toBuffer('image/png'));frames.push({name,w,he,fx,enemies:e.enemies.length});}
 const initial=art.stats();for(let i=0;i<120;i++){art.ship(c,{x:50,y:50,rx:20,ry:20},1,i/10,false,true,i,false,'bomber');art.pickup(c,{x:80,y:50},'repair',i/10,15,true);}
 assert.equal(art.stats().tiles,initial.tiles);assert(art.stats().tiles<=28);assert(art.stats().bytes<4*1024*1024);assert.equal(JSON.stringify(h.pack(e)),saved);
 const still=createCanvas(64,64),ctx=still.getContext('2d');art.pickup(ctx,{x:32,y:32},'repair',0,25,true);const first=still.toBuffer('image/png');ctx.clearRect(0,0,64,64);art.pickup(ctx,{x:32,y:32},'repair',.8,25,true);assert.notDeepEqual(first,still.toBuffer('image/png'));
 const refs=h.c.CITADEL_SWARM_ART;h.run(fs.readFileSync(path.join(__dirname,'../assets/citadel-swarm-art-v2.10.0.js'),'utf8'));assert.equal(h.c.CITADEL_SWARM_ART,refs);
 fs.writeFileSync(path.join(out,'swarm-visual.json'),JSON.stringify({method:'Native Canvas production renderer and naturally reached wave 4. Enlarged art contact sheet is an explicit visual fixture, not gameplay. No device FPS claim.',frames,cache:art.stats(),checks:['real supply rotation','read-only rendering','bounded 28-tile cache','idempotence','effects-off ordnance','portrait and landscape']},null,2)+'\n');console.log('VISUAL PASS',art.stats());
}
(process.argv[2]==='visual'?visual():holdout()).catch(e=>{console.error(e);process.exitCode=1;});
