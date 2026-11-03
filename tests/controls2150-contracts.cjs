'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture:inputFixture}=require('./touch-input-regression.cjs');
const {readEntry,lab,fixture}=require('./release260-verifier.cjs');
(async()=>{const rows=[],h=await lab(readEntry('index.html'));const copy=x=>JSON.parse(JSON.stringify(x));
async function test(name,fn){try{await fn();rows.push({name,pass:true});console.log('PASS',name);}catch(e){rows.push({name,pass:false,error:e.stack});console.log('FAIL',name,e.stack);}}
const modern=id=>{const e=fixture(h,id);h.arcade.engine=e;h.c.CITADEL_CAMPAIGN.enable(e);e.campaign2120.documentSeen2140=99;e.campaign2120.shownBeasts2140=Object.fromEntries(h.c.CITADEL_PURSUIT.warpKinds.map(k=>[k,true]));return e;};
await test('Space boosts without shooting; independent LMB/RMB and touch fire',()=>{for(const kind of ['space','deck','mrg']){
 const f=inputFixture(path.resolve('assets/atlas-v1.3.6.js'),{kind,patch:false});vm.runInContext(fs.readFileSync('assets/citadel-input-v2.6.0.js','utf8'),f.c);const input=()=>f.methods().input();
 f.dispatch(f.doc,'keydown',{code:'Space',key:' ',target:{tagName:'BODY'}});assert(input().boost);assert(!input().fire);
 f.dispatch(f.arcade.canvas,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,clientX:100,clientY:100});assert(input().fire&&input().boost);
 f.dispatch(f.arcade.canvas,'mousedown',{pointerType:'mouse',button:2,clientX:100,clientY:100});assert(input().missile);assert(!input().missile);
 f.dispatch(f.arcade.canvas,'pointerup',{pointerType:'mouse',pointerId:1});f.dispatch(f.doc,'keyup',{code:'Space'});assert(!input().boost&&!input().fire);
 f.dispatch(f.doc.getElementById('arcade-fire-touch'),'pointerdown',{pointerId:12});assert(input().fire&&!input().boost);f.dispatch(f.c,'blur');assert(!input().fire&&!input().boost);
 }});
await test('Deck rocket spends one round, respects cooldown, saves in flight and hits',()=>{const e=modern(2),b=e.board;e.boardLOS=()=>true;const x=b.enemies[0];x.pos=[b.pos[0],0,b.pos[2]-8];x.hp=500;x.dead=false;b.enemies=[x];const ammo=e.player.missiles;assert(h.c.CITADEL_CONTROLS.rocket(e,x.pos));assert.equal(e.player.missiles,ammo-1);assert(!h.c.CITADEL_CONTROLS.rocket(e,x.pos));
 const restored=h.unpack(h.pack(e),{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(copy(restored.board.rockets2150),copy(b.rockets2150));
 for(let n=0;n<40;n++)h.c.CITADEL_CONTROLS.stepRockets(e,1/60);assert(x.hp<500);assert.equal(b.rockets2150.length,0);
});
await test('Wall blocks both rocket flight and splash; pause consumes nothing',()=>{const e=modern(2),b=e.board,start=b.pos.slice();const x=b.enemies[0];x.pos=[start[0],0,start[2]-8];x.hp=500;x.dead=false;b.enemies=[x];e.boardLOS=(a,z)=>z[2]>=start[2]-3;assert(h.c.CITADEL_CONTROLS.rocket(e,x.pos));for(let n=0;n<50;n++)h.c.CITADEL_CONTROLS.stepRockets(e,1/60);assert.equal(x.hp,500);assert(!b.rockets2150.length);e.pause();const before=JSON.stringify(h.pack(e));e.step(.04,{missile:true,boost:true});assert.equal(JSON.stringify(h.pack(e)),before);});
await test('Shadows require a real caster in the light direction; exhaust freezes',()=>{const api=h.c.CITADEL_POLISH,sun=h.run('V3.norm')([-.48,.73,.48]);assert.equal(api.shadeAt([0,0,0],[],'self'),0);const ahead=sun.map(v=>v*20);assert(api.shadeAt([0,0,0],[{own:'ship',pos:ahead,radius:6}],'self')>.4);assert.equal(api.shadeAt([0,0,0],[{own:'ship',pos:ahead.map(v=>-v),radius:6}],'self'),0);assert.equal(api.shadeAt([0,0,0],[{own:'self',pos:ahead,radius:6}],'self'),0);
 const e=modern(1);e.elapsed=3;let a=[],b=[];api.plume(a,e);e.pause();api.plume(b,e);assert.deepEqual(copy(a),copy(b));assert.equal(a.length,34);e.player.boosting=true;b=[];api.plume(b,e);assert.notDeepEqual(copy(a),copy(b));});
await test('Deck radio keeps one position as enemies and camera move',()=>{const e=modern(2);e.board.intro=0;h.c.CITADEL_COMIC.post(e,{text:'Проверка связи. Охрана у терминала.',kind:'enemy',anchor:e.board.enemies[0].pos,actorId:e.board.enemies[0].id});const {createCanvas}=require('@napi-rs/canvas');const c=createCanvas(800,600).getContext('2d'),cam=h.run('spaceCamera')(e,0);h.c.CITADEL_COMIC.draw(c,e,cam,800,600);const a=h.c.CITADEL_COMIC.status(e).bounds;assert(a);e.board.enemies[0].pos=[100,0,100];h.c.CITADEL_COMIC.draw(c,e,{...cam,pos:[100,100,100]},800,600);const b=h.c.CITADEL_COMIC.status(e).bounds;assert.equal(a.x,b.x);assert.equal(a.y,b.y);});
await test('Both Kузнец arms and both Спрут tentacles exist; legs are collidable',()=>{for(const kind of ['hammer','tentacle']){const e=modern(4),w={schema:280,portal2130:true,kind,scale:3.4,center:[0,0,0],pos:[0,0,0],side:1,phase:1,age:1,segments:[]};h.c.CITADEL_PURSUIT.poseWarp(e,w,0);const parts=w.segments.filter(j=>j.part===(kind==='hammer'?'arm':'tentacle'));assert.equal(new Set(parts.map(j=>j.chain)).size,2);if(kind==='hammer')assert.equal(w.segments.filter(j=>j.part==='leg').length,8);}});
fs.mkdirSync('tests/qa-2.15.0',{recursive:true});fs.writeFileSync('tests/qa-2.15.0/contracts.json',JSON.stringify({pass:rows.every(r=>r.pass),rows},null,2));if(rows.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
