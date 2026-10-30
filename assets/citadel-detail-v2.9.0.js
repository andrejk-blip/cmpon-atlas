/* Citadel 2.9: authored relief, service machinery and articulated alien detail.
 * Presentation only. Finite shared meshes, spatially culled base chunks,
 * simpler distant/mobile silhouettes; no simulation writes or frame owner. */
(() => {
 'use strict';
 if(globalThis.CITADEL_DETAIL)return;
 const old={scene:spaceScene,base:spaceSceneBase,interior:citadelInterior,hyper:expeditionHyperScene,hud:drawEscortHUD,mobile:drawMobileGameHUD,brief:expeditionOverlay};
 const TAU=Math.PI*2,templates=new Map(),architecture=new Map(),fleet=new Map();
 const C={dark:'#162632',black:'#091821',steel:'#526e7e',light:'#b8cec9',gold:'#bfa579',cyan:'#80dbe4',warm:'#edba8b'};
 const part=(a,mesh,p,s,col,em=0,b=SPACE_IDENTITY,alpha=1)=>{const it=citadelItem(mesh,p,s,col,em,b,alpha,em?24:20);it.detail290=true;a.push(it);return it;};
 const box=(a,p,s,col,em=0)=>part(a,'box',p,s,col,em);
 const beam=(a,p,q,r,col,em=0)=>part(a,'p260_tube',V3.lerp(p,q,.5),[r,r,Math.max(.0001,V3.len(V3.sub(q,p))*.5)],col,em,spaceBasisDir(V3.sub(q,p)));
 const plate=(a,p,s,col)=>part(a,'c260_plate',p,s,col);
 const near=(p,q,r)=>V3.len(V3.sub(p,q))<r;
 function quality(fx){return fx!==false&&(ARCADE.canvas?.getBoundingClientRect?.().width||1280)>=900&&!!ARCADE.renderer?.gl?0:1;}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];build(a);const result=stationMerge(a,'d290_'+key);templates.set(key,result);return result;}
 function instance(a,model,p,b=SPACE_IDENTITY,scale=1,feature='relief'){
  const transform=spaceModel(p,Array.isArray(scale)?scale:[scale,scale,scale],b);
  for(const it of model)a.push({...it,pos:p,model:transform,detail290:feature});
 }
 function serviceHull(type,lod){return compile('hull_'+type+'_'+lod,a=>{
  const friendly=type==='player'||type==='transport'||type==='fz',transport=type==='transport',lit=friendly?C.cyan:type==='jammer'?'#c2a5eb':C.warm;
  const w=transport?3.4:type==='scout'||type==='interceptor'?3.05:3.7;
  // Two rows of recessed heat exchangers, fastening bosses and segmented
  // wing skins. Each is a true solid with a dark recess and a highlighted lip.
  for(const side of [-1,1]){
   plate(a,[side*w,.61,-1.0],[transport?.79:.55,.10,.68],C.dark);
   for(let k=0;k<(lod?3:5);k++)box(a,[side*w,.73,-1.52+k*.24],[transport?.57:.37,.045,.045],C.light);
   for(const z of [-2.6,.15]){
    plate(a,[side*w,.60,z],[.43,.08,.33],friendly?'#476f80':'#9b6e61');
    if(!lod)for(const edge of [-1,1])part(a,'octa',[side*w+edge*.29,.70,z],[.065,.04,.065],C.light);
   }
   box(a,[side*1.05,1.01,-1.8],[.045,.05,.85],C.black);
   box(a,[side*1.08,1.08,-1.85],[.025,.025,.68],lit,.65);
   part(a,'p260_tube',[side*w,.30,-3.65],[.48,.48,.10],C.light,0,SPACE_IDENTITY);
   part(a,'p260_tube',[side*w,.30,-3.78],[.30,.30,.10],C.black,0,SPACE_IDENTITY);
   box(a,[side*(transport?1.6:1.1),.42,2.6],[.12,.06,.62],C.gold);
  }
  // Canopy frame and a small triangular insignia distinguish the squadron.
  beam(a,[-.42,1.57,.5],[.42,1.57,.5],.045,C.light);
  beam(a,[0,1.65,.6],[0,1.57,1.7],.04,C.light);
  plate(a,[0,.80,3.3],[.42,.04,.42],C.gold);
  box(a,[0,.86,3.35],[.09,.02,.21],C.dark);
  if(transport)for(const side of [-1,1])for(let j=0;j<3;j++){
   plate(a,[side*1.72,.12,-3+j*2.1],[.16,.62,.81],C.steel);
   box(a,[side*1.90,.35,-3+j*2.1],[.04,.055,.5],C.cyan,.6);
  }
 });}
 function shipDetails(a,x,type,lod,basis=null,scale=1){
  if(!x?.pos)return;const b=basis||(type==='player'?flightBasis(x.yaw||0,x.pitch||0,x.bank||0):spaceBasisDir(x.vel&&V3.len(x.vel)>1?x.vel:[0,0,-1]));
  instance(a,serviceHull(type,lod),x.pos,b,scale,'ship-machinery');
 }
 function fullShip(a,x,type,lod,scale){
  if(!fleet.has(type))fleet.set(type,CITADEL_CONVOY_VIEW.testVessel(type));
  const start=a.length;
  const b=type==='player'?flightBasis(x.yaw||0,x.pitch||0,x.bank||0):spaceBasisDir(x.vel&&V3.len(x.vel)>1?x.vel:[0,0,-1]);
  instance(a,fleet.get(type),x.pos,b,scale,'flight-hull');shipDetails(a,x,type,lod,b,scale);
  if(x.hit>0)for(let i=start;i<a.length;i++)a[i].color=[1,.96,.85];
  const m=spaceModel(x.pos,[scale,scale,scale],b);
  for(const s of [-1,1])part(a,'p260_horn',spacePoint(m,[s*3.05,.2,-4.1]),[.32*scale,.32*scale,(x.boosting?2.7:1.3)*scale],type==='player'?C.cyan:C.warm,1,b);
 }
 spaceSceneBase=function(e,time,fx=true){
  // The core exposes a local ship closure. Hide only that closure's actors in
  // a read-only projection; retain original asteroids, boss, cargo and trails.
  const a=old.base({...e,enemies:[],status:'lost'},time,fx),lod=quality(fx);
  for(const x of e.enemies||[])if(!x.dead&&near(x.pos,e.player.pos,600))fullShip(a,x,x.type==='heavy'?'raider':x.type==='hunter'?'interceptor':'scout',lod,x.type==='heavy'?.86:.63);
  if(e.status!=='lost')fullShip(a,e.player,'player',lod,.68);
  return a;
 };
 function anatomy(kind,lod){return compile('anatomy_'+kind+'_'+lod,a=>{
  const bone=kind==='mantis'?'#acd2b8':'#c7b9a2',skin=kind==='hammer'?'#5b6170':'#695369';
  if(kind!=='maw'&&kind!=='medusa')for(const side of [-1,1]){
   part(a,'p260_muscle_low',[side*1.8,.8,4.0],[1.6,3.3,.85],kind==='mantis'?'#4a7974':'#785a66');
   for(let i=0;i<4;i++)beam(a,[side*.55,2.8-i*1.25,4.6],[side*3.05,2.15-i*1.05,4.45],.14,bone);
  }
  if(kind==='medusa')for(let i=-3;i<=3;i++){
   const x=i*2;beam(a,[x*.75,7.8,2.2],[x,5.8,4.1],.12,'#a5a1c0');
  }
  for(const side of [-1,1])for(let i=0;i<(lod?3:5);i++){
   const x=side*(3.6-i*.25),y=3.3-i*1.35;
   plate(a,[x,y,3.2],[.63,.22,.69],skin);
   beam(a,[side*1.4,y,4.15],[x,y-.18,3.85],.085,bone);
   if(!lod)for(let k=0;k<2;k++)part(a,'p260_bone',[x+side*k*.34,y-.3,3.75],[.14,.17,.09],bone);
  }
  // Socket rims and a segmented spinal crest stay inside the body volumes.
  for(const side of [-1,1]){
   beam(a,[side*.7,6.1,5.5],[side*2.0,6.1,5.3],.13,bone);
   for(let i=0;i<3;i++)part(a,'p260_horn',[side*(3+i*.4),2.5-i*1.6,3.4],[.25,.25,.65],bone,0,flightBasis(side*.7,.3));
  }
  for(let i=0;i<4;i++)part(a,'p260_bone',[0,4-i*1.8,3.9],[.35,.48,.35],skin);
 });}
 function alienDetails(a,w,lod){instance(a,anatomy(w.kind,lod),w.pos,SPACE_IDENTITY,w.scale||.94,'alien-anatomy');}
 expeditionHyperScene=function(e,time,fx,hidePlayer=false){
  const a=old.hyper(e,time,fx,hidePlayer);if(!e.escort||!CITADEL_CONVOY.active(e))return a;
  const lod=quality(fx);
  if(!hidePlayer)shipDetails(a,e.player,'player',lod);
  for(const x of e.escort.allies)if(!x.dead)shipDetails(a,x,'transport',lod,flightBasis(0,0,Math.sin(time*.7+x.id)*.012));
  for(const x of e.enemies)if(!x.dead&&!x.torpedo)shipDetails(a,x,x.role==='dog'?'interceptor':x.role||'raider',lod);
  const facade={pursuit:{clock:e.escort.time},assist:e.assist};
  for(const w of CITADEL_CONVOY_MONSTERS.entities(e)){
   const start=a.length;CITADEL_PURSUIT_VIEW.renderWarp(a,facade,w,lod);alienDetails(a,w,lod);
   for(let i=start;i<a.length;i++)a[i].convoyMonster=w.id;
   // A small amber marker sits on the physical weapon while it approaches.
   // It is not a full-screen overlay and remains visible with effects off.
   const tip=w.segments.find(j=>j.part==='hammer'||j.part==='blade')||w.segments.at(-1);
   if(tip&&w.cross-e.escort.time>0&&w.cross-e.escort.time<3.2){
    const r=tip.r+1;part(a,'ring',tip.pos,[r,r,.08],w.repelledUntil>e.escort.time?C.cyan:C.warm,.8,SPACE_IDENTITY,.75);
   }
  }
  return a;
 };
 function baseArchitecture(b,lod){
  const key=String(b.definition.layoutId||b.definition.theme)+'_'+(b.missions270?.tier||0)+'_'+lod;
  if(architecture.has(key))return architecture.get(key);
  const chunks=new Map(),put=(mesh,p,s,col,em=0,basis=SPACE_IDENTITY)=>{
   const k=Math.floor(p[0]/16)+':'+Math.floor(p[2]/16);let chunk=chunks.get(k);
   if(!chunk){chunk={center:[Math.floor(p[0]/16)*16+8,0,Math.floor(p[2]/16)*16+8],items:[]};chunks.set(k,chunk);}
   part(chunk.items,mesh,p,s,col,em,basis);
  };
  for(const cell of b.cells?.values()||[]){const x=cell.x*4,z=cell.z*4;
   // Shallow drainage channels and bolt sockets are below ankle height.
   if((cell.x+cell.z)%3===0){
    put('box',[x,.014,z],[1.52,.012,.37],C.dark);
    for(let k=0;k<(lod?4:7);k++)put('box',[x-1.24+k*(lod?.8:.41),.035,z],[.035,.018,.32],C.steel);
    for(const side of [-1,1])put('box',[x+side*1.65,.035,z],[.11,.025,.11],C.gold);
   }
   for(const [dx,dz]of [[-1,0],[0,-1]]){
    if(b.cells.has(stationCellKey(cell.x+dx,cell.z+dz)))continue;
    const p=[x+dx*1.78,0,z+dz*1.78],horizontal=dz!==0;
    // Pipework follows existing bulkheads and never extends across a route.
    for(let j=0;j<(lod?1:2);j++)put('p260_tube',[p[0],1.0+j*.32,p[2]], [.075,.075,1.85],j?C.gold:C.steel,0,horizontal?flightBasis(Math.PI/2,0):SPACE_IDENTITY);
    for(const side of [-1,1])put('box',[p[0]+(horizontal?side*1.35:0),1.06,p[2]+(horizontal?0:side*1.35)],horizontal?[.08,.19,.11]:[.11,.19,.08],C.light);
    if((cell.x+cell.z)%2===0){
     put('box',[p[0],1.9,p[2]],horizontal?[.48,.45,.08]:[.08,.45,.48],C.dark);
     put('box',[p[0]-dx*.1,2.01,p[2]-dz*.1],horizontal?[.31,.08,.025]:[.025,.08,.31],C.cyan,.5);
    }
   }
  }
  let serial=0;const result=[];
  for(const c of chunks.values())result.push({center:c.center,items:stationMerge(c.items,'d290_base_'+key+'_'+serial++).map(it=>({...it,baseStatic:true,baseChunk:c.center,detail290:'base-architecture'}))});
  architecture.set(key,result);return result;
 }
 function humanKit(lod){return compile('human_kit_'+lod,a=>{
  plate(a,[0,1.31,-.30],[.32,.39,.16],C.dark);
  plate(a,[0,1.32,-.49],[.27,.28,.07],C.steel);
  for(const s of [-1,1]){
   part(a,'p260_tube',[s*.26,1.35,-.42],[.075,.075,.30],C.gold,0,flightBasis(0,Math.PI/2));
   box(a,[s*.28,1.49,.25],[.09,.11,.055],C.light);
   box(a,[s*.33,1.34,.28],[.035,.035,.02],C.cyan,.6);
  }
  for(let k=0;k<3;k++)box(a,[0,1.48-k*.13,-.57],[.18,.025,.025],C.black);
  beam(a,[.24,1.6,-.34],[.24,2.18,-.34],.018,C.steel);
 });}
 function baseDetails(a,e,time,fx){
  const b=e.board,lod=quality(fx),center=b.camera||b.pos;
  for(const c of baseArchitecture(b,lod))if(near(c.center,center,38))a.push(...c.items);
  for(const x of [b,...(b.enemies||[]).filter(x=>!x.dead&&!x.missions270&&x.archetype!=='robodog')])if(near(x.pos,center,30)){
   const yaw=x===b?(b.baseMotion?.bodyYaw??b.yaw):x.duty?.bodyYaw??x.yaw;
   instance(a,humanKit(lod),x.pos,stationYaw(yaw||0),1,'actor-equipment');
  }
  for(const x of b.enemies||[])if(!x.dead&&x.missions270&&near(x.pos,center,32)){
   const dog=x.missions270.kind==='dog',m=spaceModel(x.pos,[1,1,1],stationYaw(x.yaw||0));
   for(const side of [-1,1])for(let i=0;i<3;i++){
    const p=spacePoint(m,[side*(dog?.32:.55),dog?1.01:2.65-i*.22,dog?-.32+i*.24:.39]);
    part(a,'box',p,dog?[.09,.025,.055]:[.16,.035,.045],i%2?C.dark:C.gold,0,stationYaw(x.yaw||0));
   }
  }
  for(const p of b.terminals||[])if(near(p,center,32)){
   for(let i=0;i<3;i++)for(let j=0;j<(lod?4:7);j++)box(a,V3.add(p,[-.72+j*(lod?.46:.24),1.48,-1.11+i*.12]),[.065,.025,.034],i===2&&j===0?C.gold:C.light);
   box(a,V3.add(p,[1.13,1.8,-2.03]),[.035,.22,.04],C.cyan,.55);
  }
 }
 citadelInterior=function(e,time=0,fx=true){const a=old.interior(e,time,fx);if(e.board?.cells)baseDetails(a,e,time,fx);return a;};
 function orbitDetails(a,e,time,lod){
  for(const n of e.nodes||[])if(!n.dead&&near(n.pos,e.player.pos,330)){
   const model=compile('relay_'+lod,m=>{
    for(const side of [-1,1]){
     plate(m,[side*3.1,1.4,0],[.35,1.5,2.7],C.steel);
     for(let i=0;i<4;i++)box(m,[side*3.48,1.2,-1.8+i*1.2],[.06,.65,.35],C.black);
     beam(m,[side*2,4.5,0],[side*4,8,0],.10,C.gold);
    }box(m,[0,4.55,0],[2.4,.1,2.4],C.light);
    part(m,'p260_tube',[0,5.4,0],[1.2,1.2,.6],C.dark,0,flightBasis(0,Math.PI/2));
   });instance(a,model,n.pos,SPACE_IDENTITY,1,'relay-machinery');
  }
  if(e.boss?.pos){const b=spaceBasisDir(V3.sub(e.player.pos,e.boss.pos));
   instance(a,compile('boss_cruiser_'+lod,m=>{for(const side of [-1,1])for(let i=0;i<5;i++){
    plate(m,[side*13,3.15,-12+i*4.3],[3.3,.45,1.65],i%2?C.steel:'#84778b');
    for(let j=0;j<2;j++)box(m,[side*13,3.7,-12+i*4.3+j*.6],[2.6,.10,.10],C.dark);
    box(m,[side*17,2.1,-12+i*4.3],[.12,.10,.65],'#d6a9b7',.4);
   }}),e.boss.pos,b,1,'cruiser-armour');
  }
  if(e.station?.pos&&near(e.station.pos,e.player.pos,500)){
   instance(a,compile('orbital_installation_'+lod,m=>{for(const side of [-1,1])for(let i=0;i<5;i++){
    const x=side*(28+i*4);box(m,[x,11,-5],[1.5,.25,8],C.steel);box(m,[x,11.3,-5],[1.25,.06,6.7],C.dark);
    for(let j=0;j<3;j++)box(m,[x,11.42,-9+j*4],[1.10,.035,.055],C.cyan,.25);
   }}),e.station.pos,SPACE_IDENTITY,1,'station-radiators');
  }
 }
 function arenaDetails(a,e,time,lod){
  instance(a,compile('arena_'+lod,m=>{
   for(let x=-32;x<=32;x+=8){
    for(const y of [5,20]){plate(m,[x,y,-9.3],[2.4,.8,.32],C.dark);for(let j=0;j<4;j++)box(m,[x-1.6+j, y,-8.9],[.18,.53,.06],C.steel);}
    beam(m,[x-2,2,-8.7],[x-2,23,-8.7],.13,C.gold);
    for(let y=3;y<24;y+=5)box(m,[x-2,y,-8.5],[.29,.12,.10],C.light);
   }
  }),[0,0,0],SPACE_IDENTITY,1,'arena-machinery');
  const m=e.finale.mrg;if(!m)return;
  for(let i=0;i<(lod?10:18);i++){
   const t=i*TAU/(lod?10:18),r=6.25,p=[24+Math.cos(t)*r,8+Math.sin(t)*r,3.5];
   part(a,'p260_bone',p,[.18,.55,.18],i%2?'#cfb5a0':'#8c6c79',0,stationZBasis(t-Math.PI/2));
  }
 }
 // Replace the final guardian's square tentacle links with continuous rounded
 // segments. Their endpoints and radii remain the original animation's data.
 finaleLink=function(items,p,q,r,col,glow=0,alpha=1){
  const b=spaceBasisDir(V3.sub(q,p));part(items,'p260_tube_low',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5],col,glow,b,alpha);
  part(items,'p260_bone_low',q,[r*1.03,r*1.03,r*1.03],'#89949b',0,SPACE_IDENTITY,alpha);
 };
 function parallaxDetails(a,e,lod){
  instance(a,compile('parallax_'+lod,m=>{
   for(const side of [-1,1]){
    for(let i=0;i<6;i++){
     const y=-19+i*7.6;
     plate(m,[side*29,y,-134],[7.2,2.6,1.6],i%2?'#4d5b72':'#647381');
     beam(m,[side*23,y-1.5,-132],[side*34,y+1.2,-132],.23,C.gold);
     for(let j=0;j<(lod?2:4);j++)box(m,[side*(25+j*2.3),y+.6,-132.1],[.36,1.25,.12],C.dark);
    }
    for(let i=0;i<5;i++){
     const x=-18+i*9;plate(m,[x,side*24,-136],[3.5,2.1,1.5],C.steel);
     box(m,[x,side*24,-134.3],[2.6,.22,.12],C.gold);
    }
   }
   for(let i=0;i<16;i++){
    const t=i*TAU/16,p=[Math.cos(t)*15,Math.sin(t)*15,-133];
    part(m,'p260_bone_low',p,[.65,1.9,.7],C.light,0,stationZBasis(t-Math.PI/2));
   }
  }),[0,0,0],SPACE_IDENTITY,1,'guardian-carapace');
  for(const core of e.enemies.filter(x=>x.core&&!x.dead)){
   for(let i=0;i<8;i++){
    const t=i*TAU/8,p=V3.add(core.pos,[Math.cos(t)*6.3,Math.sin(t)*6.3,2.4]);
    part(a,'c260_plate',p,[.55,.8,.55],C.light,0,stationZBasis(t));
   }
  }
 }
 function explosions(a,e,lod){
  for(const x of (e.explosions||[]).slice(-4)){
   if(x.warp||!x.max)continue;const u=Math.max(0,Math.min(1,1-x.life/x.max));
   for(let i=0;i<(lod?5:9);i++){
    const angle=i*2.399,dir=[Math.cos(angle),Math.sin(angle),Math.sin(i*1.9)],p=V3.add(x.pos,V3.scale(dir,u*(5+i*.7)));
    part(a,'c260_plate',p,[.2*(1-u),.11*(1-u),.4*(1-u)],i%3?C.steel:C.warm,i%3?0:.65,flightBasis(u*8+i,u*4),1-u);
   }
  }
 }
 spaceScene=function(e,time,fx=true){
  const a=old.scene(e,time,fx),lod=quality(fx);
  if(e.phase==='swarm'||e.crash)return a;
  if(e.phase==='pursuit'&&e.pursuit){
   shipDetails(a,e.player,'player',lod);shipDetails(a,e.pursuit.leader,'fz',lod,null,1.2);
   for(const w of e.pursuit.warpEntities||[])if(near(w.pos,e.player.pos,550))alienDetails(a,w,lod);
  }else if(e.finale&&['mrg','upload','victory'].includes(e.finale.phase))arenaDetails(a,e,time,lod);
  else if(e.finale&&e.finale.phase!=='maze'){shipDetails(a,e.player,'player',lod,null,1.25);parallaxDetails(a,e,lod);}
  else if(!e.board&&e.phase!=='escort')orbitDetails(a,e,time,lod);
  if(fx&&!e.board)explosions(a,e,lod);
  return a;
 };
 function warning(c,e,cam,w,h){
  if(!CITADEL_CONVOY_MONSTERS.active(e)||e.status!=='playing')return;
  const monster=CITADEL_CONVOY_MONSTERS.entities(e).find(x=>x.cross-e.escort.time<3.2&&x.cross-e.escort.time>-.7);
  if(!monster)return;const css=ARCADE.canvas?.getBoundingClientRect?.().width||w,s=w/css,H=h/s;
  c.save();c.scale(s,s);c.font='600 '+(css<700?10:12)+'px sans-serif';c.textAlign='center';
  const text=monster.repelledUntil>e.escort.time?'СУЩЕСТВО ОТТОЛКНУТО':(monster.side>0?'СПРАВА':'СЛЕВА')+' · ОБХОДИТЕ КОНЕЧНОСТИ',width=Math.min(css-24,c.measureText(text).width+22),y=H<400?110:136;
  c.fillStyle='#101e29e8';c.fillRect((css-width)/2,y,width,23);c.fillStyle=monster.repelledUntil>e.escort.time?C.cyan:C.warm;c.fillText(text,css/2,y+16);c.restore();
 }
 drawEscortHUD=function(c,e,cam,w,h){const r=old.hud.apply(this,arguments);warning(c,e,cam,w,h);return r;};
 drawMobileGameHUD=function(c,e,cam,w,h){const r=old.mobile.apply(this,arguments);warning(c,e,cam,w,h);return r;};
 expeditionOverlay=function(e){
  const html=old.brief(e);if(e.status!=='escortbrief'||!CITADEL_CONVOY_MONSTERS.active(e))return html;
  return html.replace('<button class="arcade-play"','<div class="brief-command"><span class="hostile-symbol">!</span><div><b>Существа у края коридора</b><small>Обходите движущиеся конечности: столкновение снимает щит. E / «Прикрытие» отталкивает существо на несколько секунд.</small></div></div><button class="arcade-play"');
 };
 globalThis.CITADEL_DETAIL=Object.freeze({version:'2.9.0',quality,stats:()=>({templates:templates.size,architecture:architecture.size,fleets:fleet.size})});
})();
