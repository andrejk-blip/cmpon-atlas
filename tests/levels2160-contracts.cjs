'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {readEntry,lab}=require('./release260-verifier.cjs');
const {createCanvas}=require('@napi-rs/canvas');
const out='tests/qa-2.16.0',copy=x=>JSON.parse(JSON.stringify(x));
(async()=>{fs.mkdirSync(out,{recursive:true});const h=await lab(readEntry('index.html')),C=h.c.CITADEL_CAMPAIGN,R=h.c.CITADEL_RESONATOR,rows=[];
const fresh=(stage=3)=>{const e=new h.Engine(417147,()=>{});h.arcade.engine=e;C.enable(e);e.stage=stage;e.campaign2120.documentSeen2140=99;return e;};
async function test(name,fn){try{await fn();rows.push({name,pass:true});console.log('PASS',name);}catch(e){rows.push({name,pass:false,error:e.stack});console.log('FAIL',name,e.stack);}}
await test('Resonator has no deck; three solvable circuits use ordinary controls and pause/save correctly',()=>{
 const e=fresh();C.startStation(e);assert(R.active(e));assert.equal(e.board,null);assert.equal(e.status,'briefing');h.action('resonator-start');assert.equal(e.status,'playing');
 for(let phase=0;phase<3;phase++){
  const s=R.state(e);assert.equal(s.phase,phase);const before=copy(s.rings.map(r=>r.step));h.action('resonator-select',0);h.action('resonator-turn',1);assert.equal(s.rings[0].step,(before[0]+1)%8);if(phase)assert.equal(s.rings[1].step,(before[1]+7)%8);
  for(let i=0;i<s.rings.length;i++){h.action('resonator-select',i);let guard=0;while(s.rings[i].step!==s.rings[i].target&&guard++<8)h.action('resonator-turn',1);assert(guard<8);}
  const save=copy(h.pack(e)),restored=h.unpack(save,{seed:e.seed,mode:'normal'},()=>{});assert.deepEqual(copy(R.state(restored).rings),copy(s.rings));
  e.pause();const frozen=JSON.stringify(h.pack(e));e.step(.04,{turn:1});assert.equal(JSON.stringify(h.pack(e)),frozen);e.resume();
  for(let i=0;i<230&&e.status==='playing'&&s.phase===phase;i++)e.step(1/60,{});
 }
 assert.equal(e.status,'campaigncard');assert.equal(R.state(e).solved.length,3);h.action('campaign-answer',0);h.action('campaign-card-next');
 for(let i=0;i<180&&R.active(e);i++)e.step(1/60,{});assert.equal(C.mission(e),'lair');assert(e.board?.cells);assert(e.campaign2120.completed.includes('contradictions'));
});
await test('Old station save upgrades without erasing campaign answers or progress',()=>{const e=fresh();e.campaign2120.completed=['orbit1','base1'];e.campaign2120.answers.convoy1={index:1,correct:true};e.campaign2120.station={reads:[0],reading:null,solution:null};e.phase='boarding';e.status='boarding';const next=h.unpack(copy(h.pack(e)),{seed:e.seed,mode:'normal'},()=>{});assert(R.active(next));assert.equal(next.board,null);assert.equal(next.campaign2120.completed.length,2);assert(next.campaign2120.answers.convoy1.correct);});
await test('New floor plans have distinct topology, reachable objectives and gated future wings',()=>{
 const make=h.run('stationMakeDeck'),nav=h.run('stationBuildNav'),route=h.run('stationPath'),line=h.run('stationLine');
 for(const stage of [1,3]){const b=make(stage);b.completed=[];b.pos=b.definition.spawn.slice();b.time=0;nav(b);assert(b.definition.variant2160);assert.equal(b.definition.layoutId,'base2160-'+stage);
  const points=[b.definition.spawn,...b.definition.terminals,b.definition.exit];for(let i=1;i<points.length;i++)assert(route(b,points[i-1],points[i]).length,'unreachable '+stage+'/'+i);
  const reachable=(start,goal,n)=>{for(const d of b.doors)d.open=d.unlockAfter<=n?1:0;const nearest=h.run('stationNearestNode'),a=nearest(b,start),z=nearest(b,goal),q=[a.key],seen=new Set(q);for(let i=0;i<q.length;i++){const node=b.nav.get(q[i]);for(const l of node.links){if(seen.has(l.key))continue;const next=b.nav.get(l.key);if(line(b,node.pos,next.pos,.68)){seen.add(l.key);q.push(l.key);}}}return seen.has(z.key);};
  assert(reachable(points[0],points[1],0),'current first sector');assert(!reachable(points[0],points[2],0),'future sector 2 bypass');assert(!reachable(points[0],points[3],1),'future sector 3 bypass');assert(reachable(points[0],points[3],2),'all sectors open');
  const canvas=createCanvas(780,520),c=canvas.getContext('2d'),span=Math.max(b.bounds.maxX-b.bounds.minX,b.bounds.maxZ-b.bounds.minZ),scale=430/span,xy=p=>[390+(p[0]-(b.bounds.maxX+b.bounds.minX)/2)*scale,65+(p[2]-b.bounds.minZ)*scale];c.fillStyle='#091b27';c.fillRect(0,0,780,520);c.font='bold 24px sans-serif';c.fillStyle='#edd7a6';c.fillText(b.definition.name,30,35);
  for(const cell of b.cells.values()){const [x,z]=xy([cell.x*4,0,cell.z*4]);c.fillStyle=['#647279','#6a9a91','#a89168','#8e83a0'][cell.zone]||'#415a65';c.fillRect(x,z,4*scale-.4,4*scale-.4);}
  for(const d of b.doors){const [x,z]=xy([d.x,0,d.z]);c.fillStyle=d.rear2160?'#ffb16c':'#ffe9a1';c.fillRect(x-d.w*scale,z-d.h*scale,Math.max(2,d.w*2*scale),Math.max(2,d.h*2*scale));}
  points.forEach((p,i)=>{const [x,z]=xy(p);c.beginPath();c.arc(x,z,6,0,Math.PI*2);c.fillStyle=i?'#fae4b0':'#96fff0';c.fill();c.font='12px sans-serif';c.fillText(i===0?'ВХОД':i===4?'ВЫХОД':String(i),x+8,z-4);});fs.writeFileSync(out+'/deck-'+stage+'.png',canvas.toBuffer('image/png'));
 }
});
await test('Rear reserves wait for a warning and walk through a real hatch without teleporting',()=>{
 const e=fresh(1);e.beginBoarding();if(e.status==='campaignsummary')h.action('campaign-summary-next');const b=e.board;assert(b.squads2160);
 const reserves=b.enemies.filter(x=>x.duty.room===0&&x.rear2160?.role==='reserve');assert.equal(reserves.length,2);const r=b.definition.rooms[0];
 // Staged alarm fixture: the player has entered the first hall. Movement below
 // is performed only by the production step, without actor-position edits.
 b.pos=r.center.slice();b.previous=b.pos.slice();b.camera=b.pos.slice();b.invulnerable=999;b.baseOps.alarms[0]=b.time;
 const homes=reserves.map(x=>x.pos.slice());for(let i=0;i<60;i++)e.step(1/60,{});reserves.forEach((x,i)=>assert.deepEqual(copy(x.pos),copy(homes[i])));assert(b.squads2160.warnings.includes(0));
 let traveled=0;for(let i=0;i<650;i++){for(const x of reserves){const from=x.pos.slice(),exiting=x.rear2160.phase==='hatch';e.enemyBoardStep(x,1/60);const step=Math.hypot(x.pos[0]-from[0],x.pos[2]-from[2]);assert(step<(exiting?x.speed:18)/60+.05,'teleport');traveled+=step;}b.time+=1/60;for(const d of b.doors)if(d.unlockAfter===0)d.open=1;}
 assert(traveled>5);assert(b.squads2160.events.some(x=>x.kind==='rear-departure'&&x.from[2]>x.player[2]+10));assert(reserves.every(x=>x.duty.reserveReleased));
});
await test('Production station painter is read-only and fits portrait and landscape frames',()=>{const e=fresh();C.startStation(e);e.launch();const before=JSON.stringify(h.pack(e));for(const [w,height]of [[390,580],[844,286],[1280,720]]){const canvas=createCanvas(w,height),c=canvas.getContext('2d');R.draw(c,e,null,w,height);fs.writeFileSync(out+'/resonator-'+w+'.png',canvas.toBuffer('image/png'));const l=R.layout(w,height,R.state(e).rings.length);assert(l.cx-l.R>0&&l.cx+l.R<w);assert(l.cy-l.R>=0&&l.cy+l.R<height-58);}assert.equal(JSON.stringify(h.pack(e)),before);});
fs.writeFileSync(out+'/contracts.json',JSON.stringify({pass:rows.every(r=>r.pass),rows},null,2));if(rows.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
