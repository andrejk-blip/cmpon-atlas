/* Citadel 2.6.0 — convoy: dark hyperspace, armoured fleet and circular breaches.
 * Presentation only. No gameplay writes, event handlers, timers or new loops.
 * A flat fully-emissive cylinder used to cover both sky renderers. It is gone:
 * a bounded sky pass supplies depth, with real 3D ships/fields in front of it.
 * Canvas keeps reciprocal-depth occlusion; GL owns one disposable sky program.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_CONVOY_VIEW?.version==='2.6.0'||!globalThis.CITADEL_CONVOY)return;
 const api=CITADEL_CONVOY,TAU=Math.PI*2,M=20,L=24;
 const old={scene:expeditionHyperScene,camera:spaceCamera,draw:spaceDrawCPU,hud:drawEscortHUD,mobile:drawMobileGameHUD,brief:expeditionOverlay,ui:updateExpeditionHUD,
  render:SpaceRendererCore.prototype.render,dispose:SpaceRendererCore.prototype.dispose};
 const templates=new Map(),surfaces=new WeakMap(),bounds=new WeakMap(),gpu=new WeakMap();
 let lastStats={},surfaceBuilds=0;
 const C={dark:'#111b2b',steel:'#506579',edge:'#b5c4ce',ivory:'#d4d0b9',gold:'#b79256',red:'#8d3547',cyan:'#7ae9f5',white:'#dbfcff',amber:'#ffc280'};
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const active=e=>!!e?.escort&&e.phase==='escort'&&(api.active(e)||api.legacyActive?.(e)||!!e.escort.ops240||!!e.escort.ops230);
 const fields=e=>e.escort.ops240?.fields||[];
 const role=x=>x.role==='dog'?'interceptor':['scout','interceptor','raider','bomber','shield','jammer','commander'].includes(x.role)?x.role:'raider';
 const part=(a,mesh,p,s,col,em=0,b=SPACE_IDENTITY,alpha=1,mat=M)=>{const it=citadelItem(mesh,p,s,col,em,b,alpha,mat);a.push(it);return it;};
 function beam(a,p,q,r,col,em=0,alpha=1){return part(a,'box',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5],col,em,spaceBasisDir(V3.sub(q,p)),alpha,em?L:M);}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];build(a);const model=stationMerge(a,'c260_'+key);templates.set(key,model);return model;}
 function instance(a,model,p,b=SPACE_IDENTITY,s=[1,1,1],hit=false,tag='ship'){const transform=spaceModel(p,s,b);for(const it of model)a.push({...it,pos:p,model:transform,color:hit?spaceColor('#fff4d8'):it.color,convoy260:tag});}
 // Dedicated longitudinal hull. Chamfers catch the key light; stepped dorsal
 // armour and a dark lower hull remain distinguishable at phone resolution.
 function hullMesh(){const v=[],f=[],rings=[[-1,.70,.60],[-.83,1,.88],[.36,.87,1],[.85,.56,.64],[1,.08,.12]];
  for(const [z,x,y]of rings)for(let i=0;i<8;i++){const t=(i+.5)*TAU/8;v.push([Math.cos(t)*x,Math.sin(t)*y,z]);}
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<8;i++){const a=j*8+i,b=j*8+(i+1)%8;f.push([a,b,b+8,a+8]);}
  f.push([7,6,5,4,3,2,1,0]);f.push([32,33,34,35,36,37,38,39]);SPACE_MESH.c260_hull=spaceMesh(v,f);
 }
 function annulus(name,inner,outer,segments=48){const v=[],f=[];for(let i=0;i<segments;i++){const t=i/segments*TAU;v.push([Math.cos(t)*inner,Math.sin(t)*inner,0],[Math.cos(t)*outer,Math.sin(t)*outer,0]);}
  for(let i=0;i<segments;i++){const j=(i+1)%segments;f.push([i*2,i*2+1,j*2+1,j*2]);}SPACE_MESH[name]=spaceMesh(v,f);
 }
 hullMesh();annulus('c260_field',1,24);annulus('c260_rim',1,1.045);annulus('c260_collar',1.045,1.12);
 function panel(a,p,s,col=C.ivory){part(a,'c260_hull',p,s,col);}
 function nozzle(a,x,y,z,size=1,col=C.cyan){
  part(a,'p220_nozzle',[x,y,z],[size,size*.4,size],C.dark,0,flightBasis(0,Math.PI/2));
  part(a,'p220_nozzle',[x,y,z-.32*size],[size*.82,size*.22,size*.82],C.edge,0,flightBasis(0,Math.PI/2));
  part(a,'p220_nozzle',[x,y,z-.53*size],[size*.63,size*.08,size*.63],col,1,flightBasis(0,Math.PI/2),1,L);
 }
 function fleetModel(type){return compile('ship_'+type,a=>{
  const player=type==='player',transport=type==='transport',small=type==='scout'||type==='interceptor';
  const tint=player?'#286680':transport?'#385868':type==='jammer'?'#7861a3':type==='shield'?'#345b76':type==='bomber'?'#986844':type==='commander'?'#a38754':C.red;
  const lit=player||transport?C.cyan:type==='jammer'?'#c5a2ff':C.amber;
  const w=transport?2.05:small?1.14:1.6,len=transport?6.5:small?4:4.7;
  part(a,'c260_hull',[0,0,0],[w,transport?1.25:.82,len],C.dark);
  part(a,'c260_hull',[0,.38,.2],[w*.93,.65,len*.9],tint);
  part(a,'box',[0,.02,-len*.99],[w*.58,transport?.62:.40,.075],C.steel);
  for(const s of [-1,1])part(a,'box',[s*w*.47,.02,-len*1.005],[.06,transport?.56:.34,.09],C.gold);
  for(let k=0;k<3;k++)part(a,'box',[0,-.2+k*.20,-len*1.012],[w*.34,.035,.035],C.dark);
  // Three separated plates, raised keels and vents create actual relief.
  for(let k=0;k<3;k++){
   panel(a,[0,.82,-2.9+k*2.2],[w*.64,.18,.89],k===2?C.ivory:C.steel);
   for(const s of [-1,1])part(a,'box',[s*w*.8,.86,-2.8+k*2.2],[.075,.09,.61],C.gold);
  }
  panel(a,[0,.37,len*.79],[w*.62,.32,1.3],C.ivory);
  part(a,'c260_hull',[0,1.05,.5],[w*.53,.53,1.8],C.dark);
  part(a,'c260_hull',[0,1.39,1.1],[w*.43,.23,1.0],'#4c8da3',.24,SPACE_IDENTITY,1,23);
  part(a,'box',[0,1.62,1.07],[w*.32,.035,.52],lit,.7,SPACE_IDENTITY,1,L);
  part(a,'box',[0,1.67,.93],[.045,.04,.73],C.ivory);
  for(const s of [-1,1]){
   const wx=transport?3.4:small?3.05:3.7;
   beam(a,[s*w*.7,-.24,.6],[s*wx,-.32,-1.9],small?.3:.5,C.steel);
   panel(a,[s*wx,-.18,-1.5],[transport?1:small?.58:.87,transport?.82:.5,transport?4.3:2.65],tint);
   panel(a,[s*wx,.40,-1.35],[transport?.83:small?.48:.72,.14,transport?3.4:2.1],C.ivory);
   part(a,'box',[s*wx,.56,-2.1],[.09,.04,transport?2.3:1.25],tint);
   for(let k=0;k<4;k++)part(a,'box',[s*wx,.58,-3.1+k*.42],[transport?.54:.34,.025,.09],C.dark);
   // Dark barrel, barrel collar and luminous firing aperture (no pre-fire cue).
   const gx=s*(transport?2.1:small?2.35:2.8);
   part(a,'box',[gx,-.18,2.1],[.14,.16,1.45],C.dark);part(a,'box',[gx,-.18,3.5],[.22,.22,.24],C.edge);
   part(a,'box',[gx,-.18,3.76],[.12,.13,.035],lit,.42,SPACE_IDENTITY,1,L);
   nozzle(a,s*wx,-.18,transport?-6:-4,transport?.82:small?.5:.72,lit);
   part(a,'box',[s*(wx+(small?.58:.85)),.05,-1.6],[.065,.1,.35],lit,1,SPACE_IDENTITY,1,L);
   if(transport)for(let k=0;k<3;k++){
    part(a,'box',[s*1.9,-.1,-3.2+k*2.1],[.69,.77,.86],k%2?C.steel:C.ivory);
    part(a,'box',[s*1.9,.7,-3.2+k*2.1],[.54,.05,.67],tint);
    for(const dz of [-.5,.5])part(a,'box',[s*1.9,.77,-3.2+k*2.1+dz],[.58,.045,.06],C.gold);
   }
   if(type==='bomber')for(let k=0;k<3;k++){panel(a,[s*(1.8+k*.62),-.8,.4],[.23,.30,2.2],C.gold);part(a,'box',[s*(1.8+k*.62),-.8,2.28],[.16,.21,.09],lit,.6);}
   if(type==='shield'){panel(a,[s*4.4,.18,-.2],[.5,1.25,3.3],C.steel);part(a,'box',[s*4.4,1.45,-.1],[.16,.08,2.4],lit,.6);}
   if(type==='raider'){panel(a,[s*1.8,.75,-.5],[.5,.45,1.7],C.ivory);part(a,'box',[s*1.8,1.2,.5],[.17,.17,1.6],C.dark);}
  }
  if(player||transport){part(a,'box',[0,1.86,-1.8],[.1,.42,.82],C.ivory);part(a,'box',[0,2.29,-1.8],[.11,.045,.32],lit,.6);}
  if(type==='jammer'){
   beam(a,[0,1.2,-1.3],[0,3.3,-1.3],.16,C.edge);
   for(const s of [-1,1]){beam(a,[0,3.3,-1.3],[s*2.7,3.3,-1.3],.13,C.gold);part(a,'box',[s*2.7,3.3,-1.3],[.17,.95,.17],C.dark);part(a,'box',[s*2.7,3.3,-1.07],[.07,.74,.06],lit,.7);}
  }
  if(type==='commander'){
   panel(a,[0,1.6,-2.2],[.93,.54,1.7],C.gold);part(a,'box',[0,2.2,-2.2],[.12,.45,1.0],C.ivory);
   for(const s of [-1,1])part(a,'box',[s*.65,2.12,-2.2],[.12,.22,.6],C.ivory);
  }
 });}
 function engines(a,position,b,type,time,fx){const transport=type==='transport',small=type==='scout'||type==='interceptor',player=type==='player',wx=transport?3.4:small?3.05:3.7,z=transport?-6.5:-4.5;
  const color=player||transport?C.cyan:type==='jammer'?'#bd8dff':C.amber,transform=spaceModel(position,[1,1,1],b),size=transport?.55:small?.3:.46;
  for(const side of [-1,1]){
   const p=spacePoint(transform,[side*wx,-.18,z]),q=spacePoint(transform,[side*wx,-.18,z-(fx?3.6+Math.sin(time*19+side)*.25:2.8)]);
   beam(a,p,q,size*.35,C.white,1);const flame=part(a,'octa',V3.lerp(p,q,.35),[size,size,V3.len(V3.sub(p,q))*.6],color,1,b,.7,L);flame.convoy260='engine';
   if(fx)beam(a,p,spacePoint(transform,[side*wx,-.18,z-7.5]),size*.10,color,1,.3);
  }
 }
 function vessel(a,e,x,time,fx){
  if(x.torpedo){const b=spaceBasisDir(x.vel||[0,0,1]);part(a,'c260_hull',x.pos,[.55,.55,2.3],C.ivory,.1,b);part(a,'octa',V3.sub(x.pos,V3.scale(V3.norm(x.vel),2)),[.35,.35,1.4],C.amber,1,b,1,L);return;}
  const type=role(x),b=spaceBasisDir(V3.sub(e.escort.allies[x.ally]?.pos||e.player.pos,x.pos));
  instance(a,fleetModel(type),x.pos,b,[1,1,1],x.hit>0,'enemy');engines(a,x.pos,b,type,time+x.id,fx);
  // Actual shield/channel effects are information about present protection.
  // No warp/assembly flashes or target rings are forecast in battle mode.
  if(x.shielded&&fx)part(a,'ring',x.pos,[5.3,4.4,.3],'#70b6dd',.7,SPACE_IDENTITY,.22,L);
  if(x.channel){const ally=e.escort.allies[x.ally];if(ally&&!ally.dead)citadelBeam(a,x.pos,ally.pos,'#bb8eed',.035,.45);}
 }
 function scenery(a,e,time,fx){
  const count=fx?58:24,motion=fx?time:0;
  for(let i=0;i<count;i++){
   const angle=i*2.399963+Math.sin(i*7)*.12,r=54+i%9*4.5,z=70-((motion*(130+i%7*14)+i*71)%980);
   const p=[Math.cos(angle)*r,Math.sin(angle)*r*.76,z],length=5+i%6*4;
   const it=part(a,'box',p,[.035+i%3*.026,.035,length],i%11===0?'#d9aadd':i%4?'#5ca7d7':'#bce9f3',1,SPACE_IDENTITY,.35+i%4*.12,L);it.convoy260='speed';
  }
  // Broad refracted ribbons carry parallax; no solid tube hides the sky.
  for(let k=0;k<8;k++)for(let j=0;j<4;j++){
   const t=k/8*TAU+j*.21+motion*.012,r=84+k%2*12,z=-120-j*210;
   const p=[Math.cos(t)*r,Math.sin(t)*r*.8,z],q=[Math.cos(t+.21)*r,Math.sin(t+.21)*r*.8,z-210];
   const it=beam(a,p,q,.12+(k%3)*.08,k%3===0?'#9b72c5':'#347baf',1,.22);it.convoy260='ribbon';
  }
 }
 function fieldRects(f){const x0=f.gapX-f.halfW,x1=f.gapX+f.halfW,y0=f.gapY-f.halfH,y1=f.gapY+f.halfH;return [{x0:-76,x1:x0,y0:-52,y1:52},{x0:x1,x1:76,y0:-52,y1:52},{x0,x1,y0:-52,y1:y0},{x0,x1,y0:y1,y1:52}].filter(r=>r.x1>r.x0&&r.y1>r.y0);}
 function field(a,f,time,fx){
  if(f.passed||!Number.isFinite(f.z))return;const p=[f.gapX,f.gapY,f.z],round=f.shape==='ring'&&Number.isFinite(f.radius);
  if(!round){for(const r of fieldRects(f)){const it=part(a,'box',[(r.x0+r.x1)/2,(r.y0+r.y1)/2,f.z],[(r.x1-r.x0)/2,(r.y1-r.y0)/2,.015],'#c13e51',1,SPACE_IDENTITY,.15,L);it.convoyField=f.id;}return;}
  const radius=f.radius;
  const membrane=part(a,'c260_field',p,[radius,radius,1],'#b53b62',1,SPACE_IDENTITY,.13,L);membrane.convoyField=f.id;membrane.convoyRing={radius,gapX:f.gapX,gapY:f.gapY};
  part(a,'c260_collar',[p[0],p[1],p[2]+.02],[radius,radius,1],'#6d435c',.3,SPACE_IDENTITY,.86,M).convoyField=f.id;
  part(a,'c260_rim',[p[0],p[1],p[2]+.05],[radius,radius,1],C.white,1,SPACE_IDENTITY,.95,L).convoyField=f.id;
  for(let i=0;i<12;i++){
   const t=i/12*TAU,x=Math.cos(t),y=Math.sin(t),p1=[p[0]+x*radius*1.065,p[1]+y*radius*1.065,p[2]+.08],p2=[p[0]+x*(radius*1.065+.8),p[1]+y*(radius*1.065+.8),p[2]+.08];
   beam(a,p1,p2,.085,i%3?C.gold:C.white,i%3?.2:1,.9).convoyField=f.id;
  }
  // Ripples exist on the dangerous membrane, never inside the real opening.
  if(fx)for(let k=0;k<3;k++)part(a,'c260_rim',[p[0],p[1],p[2]-.03],[radius*(1.8+k*.9),radius*(1.8+k*.9),1],'#b7547a',1,SPACE_IDENTITY,.10,L).convoyField=f.id;
 }
 expeditionHyperScene=function(e,time,fx,hidePlayer=false){
  if(!active(e))return old.scene(e,time,fx,hidePlayer);const a=[];scenery(a,e,time,fx);
  for(const ally of e.escort.allies)if(!ally.dead){const b=flightBasis(0,0,Math.sin(time*.7+ally.id)*.012);instance(a,fleetModel('transport'),ally.pos,b,[1,1,1],ally.hit>0,'transport');engines(a,ally.pos,b,'transport',time+ally.id,fx);}
  for(const x of e.enemies)if(!x.dead)vessel(a,e,x,time,fx);
  for(const f of fields(e))field(a,f,time,fx);
  if(!hidePlayer){const b=flightBasis(e.player.yaw,e.player.pitch,e.player.bank);instance(a,fleetModel('player'),e.player.pos,b,[1,1,1],e.player.hit>0,'player');engines(a,e.player.pos,b,'player',time,fx);}
  for(const b of e.bullets)part(a,'box',b.pos,[b.type==='missile'?.18:.065,.08,b.type==='missile'?1.9:1.25],b.color||C.cyan,1,spaceBasisDir(b.vel),1,L);
  for(const b of e.hostile){part(a,'octa',b.pos,[.36,.32,1.35],b.color||C.amber,1,spaceBasisDir(b.vel),1,L);if(fx)part(a,'box',b.pos,[.08,.08,2.5],C.white,1,spaceBasisDir(b.vel),1,L);}
  for(const x of e.explosions){const age=clamp(1-x.life/x.max);part(a,'octa',x.pos,Array(3).fill(1+age*7),C.amber,1,SPACE_IDENTITY,1-age,L);if(fx)part(a,'ring',x.pos,Array(3).fill(2+age*13),x.color,1,SPACE_IDENTITY,1-age,L);}
  if(e.pulseWave>0)part(a,'ring',e.player.pos,Array(3).fill(4+(1-e.pulseWave)*95),C.cyan,1,SPACE_IDENTITY,e.pulseWave,L);
  return a;
 };
 spaceCamera=function(e,time=0,preview=false){
  if(!active(e)||e.crash&&['crashing','lost','paused'].includes(e.status))return old.camera(e,time,preview);
  const p=e.player.pos,w=ARCADE.canvas?.width||1280,h=ARCADE.canvas?.height||720,portrait=w/h<.85;
  // A closer but wider view shows armoured backs, engines and both flanks.
  return Object.assign(stationLook([p[0]*.43,p[1]*.43+14.5,portrait?44:33],[p[0]*.10,1,-92],portrait?1.23:1.04,{near:.35,far:2000}),{convoy230:true,convoy260:true,chapter:e.stage,clock:e.escort.time,fx:ARCADE.fx!==false});
 };
 function sky(c,cam,w,h){
  c.fillStyle='#030713';c.fillRect(0,0,w,h);const cx=w*.50,cy=h*.43,r=Math.hypot(w,h)*.69;
  const base=c.createRadialGradient(cx,cy,0,cx,cy,r);base.addColorStop(0,'#223c5a');base.addColorStop(.12,'#11233d');base.addColorStop(.42,'#0a152c');base.addColorStop(1,'#02040d');c.fillStyle=base;c.fillRect(0,0,w,h);
  const rand=arcadeSeed(26040+(cam.chapter||0));
  // A low-resolution, once-per-surface turbulent light field replaces hard
  // radial triangles. It is smoothly scaled before ships are depth-rastered.
  // This is cached sky lighting, not an image substituted for gameplay.
  const fogCanvas=document.createElement('canvas'),fw=384,fh=Math.max(120,Math.round(fw*h/w));fogCanvas.width=fw;fogCanvas.height=fh;
  const fc=fogCanvas.getContext('2d'),data=fc.createImageData(fw,fh),grid=Float32Array.from({length:4096},()=>rand());
  const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v),at=(x,y)=>grid[((y%64+64)%64)*64+(x%64+64)%64];return (at(ix,iy)*(1-s)+at(ix+1,iy)*s)*(1-t)+(at(ix,iy+1)*(1-s)+at(ix+1,iy+1)*s)*t;};
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
   const dx=(x/fw-.5)*w/h,dy=y/fh-.43,rad=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),d=Math.log(rad+.024),turn=angle+d*.29;
   const nx=Math.cos(turn)*4.5,ny=Math.sin(turn)*4.5,n=noise(nx+9,ny+d*2+23)*.60+noise(nx*2.07+17,ny*2.07+d*3.3)*.28+noise(nx*5.1,ny*5.1+d*5.7)*.12;
   const vein=Math.pow(Math.max(0,Math.sin(turn*4.3+n*7.2)),2),haze=Math.exp(-rad*.65)*(vein*.7+.13)*(.30+n),edge=Math.min(1,rad/.10),core=Math.exp(-rad*20),o=(y*fw+x)*4;
   const purple=clamp(n*1.8-.55),color=[8+(20+purple*14)*haze*edge+34*core,13+(64-purple*30)*haze*edge+44*core,28+(104-purple*5)*haze*edge+49*core];
   for(let k=0;k<3;k++)data.data[o+k]=color[k];data.data[o+3]=255;
  }
  fc.putImageData(data,0,0);c.save();c.imageSmoothingEnabled=true;c.drawImage(fogCanvas,0,0,w,h);
  c.globalAlpha=1;
  for(let i=0;i<290;i++){const x=rand()*w,y=rand()*h,v=rand();c.fillStyle=i%5?'#91bbd8':'#c9b4d8';c.globalAlpha=.16+v*.4;c.fillRect(x,y,v>.95?1.5:.65,v>.95?1.5:.65);}
  c.globalAlpha=1;const core=c.createRadialGradient(cx,cy,0,cx,cy,h*.16);core.addColorStop(0,'#c1dfee18');core.addColorStop(.12,'#86b5d514');core.addColorStop(.6,'#26517608');core.addColorStop(1,'#00000000');c.fillStyle=core;c.fillRect(cx-h*.16,cy-h*.16,h*.32,h*.32);c.restore();
 }
 const SKY_FRAGMENT=`precision highp float;varying vec2 uv;uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;uniform float uAspect;uniform float uTan;uniform float uClock;uniform float uChapter;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 void main(){vec3 ray=normalize(uForward+uRight*uv.x*uAspect*uTan+uUp*uv.y*uTan);float z=max(.08,-ray.z),r=length(ray.xy)/z,a=atan(ray.y,ray.x),turn=a+log(max(r,.015))*.32+uClock*.012;vec3 p=vec3(cos(turn)*3.,sin(turn)*3.,log(max(r,.025))*1.5+uChapter*3.);
 float n=noise(p)*.64+noise(p*2.07)*.25+noise(p*4.03)*.11;float vein=pow(max(0.,sin(turn*4.+n*7.)),3.);float haze=exp(-r*.72)*(.26+vein*.65)*smoothstep(.015,.14,r);vec3 col=mix(vec3(.009,.014,.036),vec3(.035,.095,.17),exp(-r*1.4));col+=mix(vec3(.075,.055,.16),vec3(.06,.24,.36),n)*haze*(.45+n);col+=vec3(.18,.25,.32)*exp(-r*12.)*.36;
 vec3 cell=floor(ray*650.);float star=step(.9985,hash(cell));col+=vec3(.40,.52,.64)*star*.38;gl_FragColor=vec4(col,1.);}`;
 SpaceRendererCore.prototype.render=function(items,cam){
  if(!cam.convoy260||!this.gl)return old.render.call(this,items,cam);const gl=this.gl;if(gl.isContextLost())return;
  let state=gpu.get(this);if(!state){const program=this.program(SPACE_SKY_VERTEX,SKY_FRAGMENT),loc={};for(const name of ['uForward','uRight','uUp','uAspect','uTan','uClock','uChapter'])loc[name]=gl.getUniformLocation(program,name);state={program,loc,position:gl.getAttribLocation(program,'aPos')};gpu.set(this,state);}
  const saved={skyProgram:this.skyProgram,skyLoc:this.skyLoc,skyPosition:this.skyPosition};this.skyProgram=state.program;this.skyLoc=state.loc;this.skyPosition=state.position;
  gl.useProgram(state.program);gl.uniform1f(state.loc.uClock,cam.fx?cam.clock:0);gl.uniform1f(state.loc.uChapter,cam.chapter||0);
  try{return old.render.call(this,items,cam);}finally{Object.assign(this,saved);}
 };
 SpaceRendererCore.prototype.dispose=function(){const state=gpu.get(this);if(state&&this.gl){this.gl.deleteProgram(state.program);gpu.delete(this);}return old.dispose.call(this);};
 function inView(it,cam,w,h){const mesh=SPACE_MESH[it.mesh];let bound=bounds.get(mesh);if(!bound){const p=mesh.p,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],p[i]);max[axis]=Math.max(max[axis],p[i]);}const center=min.map((v,i)=>(v+max[i])/2);bound={center,radius:Math.hypot(...max.map((v,i)=>v-center[i]))};bounds.set(mesh,bound);}
  const m=it.model,center=spacePoint(m,bound.center),d=V3.sub(center,cam.pos),z=V3.dot(d,cam.f),radius=bound.radius*Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));if(z+radius<.35)return false;const sy=Math.tan(cam.fov/2),sx=sy*w/h;return Math.abs(V3.dot(d,cam.r))<z*sx+radius*Math.sqrt(1+sx*sx)&&Math.abs(V3.dot(d,cam.u))<z*sy+radius*Math.sqrt(1+sy*sy);
 }
 function shade(it,n,mid,cam,depth){
  const sun=clamp(n[0]*-.48+n[1]*.73+n[2]*.48),view=V3.norm(V3.sub(cam.pos,mid)),half=V3.norm(V3.add([-.48,.73,.48],view));
  const spec=Math.pow(clamp(V3.dot(n,half)),it.kind===23?45:26)*(it.kind===23?.32:.13),rim=Math.pow(1-clamp(V3.dot(n,view)),3),em=clamp(it.emissive),fog=clamp((depth-170)/1800,0,.32);
  return it.color.map((v,i)=>{const lit=v*([.28,.32,.40][i]+[.96,.88,.69][i]*sun)+spec+[.035,.07,.1][i]*rim;return Math.round(clamp((lit*(1-em)+v*1.08*em)*(1-fog)+[.02,.04,.075][i]*fog)*255);});
 }
 function clipNear(vertices){const out=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],ina=a[2]>=.35,inb=b[2]>=.35;if(ina)out.push(a);if(ina!==inb){const t=(.35-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,.35]);}}return out;}
 function raster(s,tri,col,alpha){
  const w=s.w,h=s.h,pix=s.image.data,dep=s.depth;let [a,b,d]=tri,area=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);if(area<0){[b,d]=[d,b];area=-area;}if(area<.1)return;
  const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],d[0])-.5)),maxX=Math.min(w-1,Math.floor(Math.max(a[0],b[0],d[0])-.5)),minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],d[1])-.5)),maxY=Math.min(h-1,Math.floor(Math.max(a[1],b[1],d[1])-.5));
  const edge=(u,v,x,y)=>(v[0]-u[0])*(y-u[1])-(v[1]-u[1])*(x-u[0]),dx0=b[1]-d[1],dx1=d[1]-a[1],dx2=a[1]-b[1],dy0=d[0]-b[0],dy1=a[0]-d[0],dy2=b[0]-a[0];
  let row0=edge(b,d,minX+.5,minY+.5),row1=edge(d,a,minX+.5,minY+.5),row2=edge(a,b,minX+.5,minY+.5);const iz0=a[2]/area,iz1=b[2]/area,iz2=d[2]/area,inv=1-alpha;
  for(let y=minY;y<=maxY;y++,row0+=dy0,row1+=dy1,row2+=dy2){let e0=row0,e1=row1,e2=row2,index=y*w+minX;for(let x=minX;x<=maxX;x++,index++,e0+=dx0,e1+=dx1,e2+=dx2){if(e0<0||e1<0||e2<0)continue;const z=e0*iz0+e1*iz1+e2*iz2;if(z<=dep[index]+.000000005)continue;const o=index*4;if(alpha>=1){dep[index]=z;pix[o]=col[0];pix[o+1]=col[1];pix[o+2]=col[2];}else{pix[o]=pix[o]*inv+col[0]*alpha;pix[o+1]=pix[o+1]*inv+col[1]*alpha;pix[o+2]=pix[o+2]*inv+col[2]*alpha;}}}
 }
 spaceDrawCPU=function(c,items,cam,w,h){
  if(!cam.convoy260)return old.draw(c,items,cam,w,h);const started=performance.now(),factor=h/(2*Math.tan(cam.fov/2));let s=surfaces.get(c);
  if(!s||s.w!==w||s.h!==h||s.chapter!==cam.chapter){sky(c,cam,w,h);s={w,h,chapter:cam.chapter,image:c.getImageData(0,0,w,h),background:c.getImageData(0,0,w,h).data,depth:new Float32Array(w*h)};surfaces.set(c,s);surfaceBuilds++;}
  s.image.data.set(s.background);s.depth.fill(0);const translucent=[];let triangles=0,visible=0;
  for(const it of items){if(!inView(it,cam,w,h))continue;const mesh=SPACE_MESH[it.mesh],m=it.model,p=mesh.p,nn=mesh.n,sx=m[0]**2+m[1]**2+m[2]**2,sy=m[4]**2+m[5]**2+m[6]**2,sz=m[8]**2+m[9]**2+m[10]**2;
   for(let i=0;i<p.length;i+=9){triangles++;const v=[];for(let j=0;j<9;j+=3)v.push([m[0]*p[i+j]+m[4]*p[i+j+1]+m[8]*p[i+j+2]+m[12],m[1]*p[i+j]+m[5]*p[i+j+1]+m[9]*p[i+j+2]+m[13],m[2]*p[i+j]+m[6]*p[i+j+1]+m[10]*p[i+j+2]+m[14]]);
    const nx=nn[i]/sx,ny=nn[i+1]/sy,nz=nn[i+2]/sz,n=V3.norm([m[0]*nx+m[4]*ny+m[8]*nz,m[1]*nx+m[5]*ny+m[9]*nz,m[2]*nx+m[6]*ny+m[10]*nz]),mid=V3.scale(V3.add(V3.add(v[0],v[1]),v[2]),1/3);
    if(it.mesh!=='ring'&&!it.mesh.startsWith('c260_')&&V3.dot(n,V3.sub(cam.pos,mid))<-.0001)continue;
    if(it.mesh.startsWith('deck_c260_')&&V3.dot(n,V3.sub(cam.pos,mid))<-.0001)continue;
    const view=v.map(q=>{const d=V3.sub(q,cam.pos);return [V3.dot(d,cam.r),V3.dot(d,cam.u),V3.dot(d,cam.f)];});if(view.every(q=>q[2]<.35))continue;const clipped=view.some(q=>q[2]<.35)?clipNear(view):view;if(clipped.length<3)continue;
    const screen=clipped.map(q=>[w/2+q[0]*factor/q[2],h/2-q[1]*factor/q[2],1/q[2]]);if(screen.every(q=>q[0]<0)||screen.every(q=>q[0]>w)||screen.every(q=>q[1]<0)||screen.every(q=>q[1]>h))continue;
    const depth=view.reduce((sum,q)=>sum+q[2],0)/3,color=shade(it,n,mid,cam,depth);for(let j=1;j<screen.length-1;j++){const tri=[screen[0],screen[j],screen[j+1]];visible++;if(it.alpha<1)translucent.push({tri,color,alpha:it.alpha,depth});else raster(s,tri,color,1);}
   }
  }
  translucent.sort((a,b)=>b.depth-a.depth);for(const it of translucent)raster(s,it.tri,it.color,it.alpha);c.putImageData(s.image,0,0);c.globalAlpha=1;
  lastStats={items:items.length,triangles,visibleTriangles:visible,milliseconds:performance.now()-started,pixels:w*h,surfaceBytes:w*h*12};
 };
 function text(c,value,x,y,size,color,bold=false){c.font=(bold?'700 ':'')+size+'px sans-serif';c.fillStyle=color;c.fillText(value,x,y);}
 function hud(c,e,cam,w,h){
  const mobile=w/h<.9||typeof isMobileLayout==='function'&&isMobileLayout(),cssW=ARCADE.canvas?.getBoundingClientRect?.().width||390,W=mobile?clamp(cssW,300,960):1280,H=h/w*W,short=H<450,pad=mobile?12:26,cq=e.escort,o=cq.ops240||cq.ops230,m=api.mission(e),top=short?6:12,bar=short?45:mobile?62:70;
  c.clearRect(0,0,w,h);c.save();c.scale(w/W,h/H);c.textBaseline='middle';c.textAlign='left';
  c.fillStyle='#060e1de8';c.fillRect(pad,top,W-pad*2,bar);c.fillStyle='#78dcf0';c.fillRect(pad,top,2,bar);
  text(c,'КОНВОЙ '+(e.stage+1)+' / 3',pad+12,top+(short?13:18),mobile?11:14,C.cyan,true);
  c.textAlign='right';text(c,Math.round(cq.distance*100)+'% ПУТИ',W-pad-12,top+(short?13:18),mobile?11:14,'#e3eef4',true);c.textAlign='left';
  text(c,m.subtitle.toUpperCase(),pad+12,top+(short?31:41),mobile?10:14,'#c7d5e4');
  c.fillStyle='#1c2c40';c.fillRect(pad+12,top+bar-7,W-pad*2-24,2);c.fillStyle=C.cyan;c.fillRect(pad+12,top+bar-7,(W-pad*2-24)*cq.distance,2);
  const target=e.enemies.find(x=>!x.dead&&x.id===e.selectedTarget),aim=o.aim;
  if(target){const q=spaceProject(target.pos,cam,W,H);if(q.z>0&&q.x>18&&q.x<W-18&&q.y>top+bar+20&&q.y<H-(short?56:105)){
   const r=mobile?17:24;c.strokeStyle=aim?.locked?C.cyan:'#dfb382';c.lineWidth=1.4;
   for(const s of [-1,1])for(const t of [-1,1]){c.beginPath();c.moveTo(q.x+s*(r-6),q.y+t*r);c.lineTo(q.x+s*r,q.y+t*r);c.lineTo(q.x+s*r,q.y+t*(r-6));c.stroke();}
   c.textAlign='center';text(c,target.torpedo?'ТОРПЕДА':target.name||'ЦЕЛЬ',q.x,q.y-r-9,mobile?9:11,'#f2d6b4');c.fillStyle='#203247';c.fillRect(q.x-r,q.y+r+6,r*2,3);c.fillStyle=target.color||C.amber;c.fillRect(q.x-r,q.y+r+6,r*2*clamp(target.hp/target.maxHp),3);
  }}
  // Training alone explains forthcoming attacks and shows the safe-centre aid.
  if(e.assist){const field=fields(e).find(f=>!f.passed),group=o.groups?.find(g=>g.state==='telegraph');c.textAlign='center';
   if(field){text(c,'ПРОЙДИТЕ В СВЕТЛЫЙ ПРОСВЕТ · '+Math.max(0,field.warning||0).toFixed(1)+' с',W/2,top+bar+18,mobile?10:13,C.amber,true);const q=spaceProject([field.gapX,field.gapY,field.z],cam,W,H);if(q.z>0){c.strokeStyle='#c9ffff';c.setLineDash([3,4]);c.lineWidth=1;c.beginPath();c.arc(q.x,q.y,Math.max(5,q.scale*(field.radius||Math.min(field.halfW,field.halfH)-2.8)),0,TAU);c.stroke();c.setLineDash([]);}}
   else if(group)text(c,'ЗАХОД: '+group.name.toUpperCase(),W/2,top+bar+18,mobile?10:13,C.amber,true);
  }
  const by=H-(short?49:mobile?77:86),bw=(W-pad*2-12)/3;
  cq.allies.forEach((ally,i)=>{const x=pad+i*(bw+6);c.fillStyle='#060e1de8';c.fillRect(x,by,bw,short?28:39);c.textAlign='left';text(c,ally.name,x+6,by+(short?8:12),mobile?9:11,ally.dead?'#b68493':'#b9cadb');c.textAlign='right';text(c,ally.dead?'ПОТЕРЯН':Math.ceil(ally.hp)+'%',x+bw-6,by+(short?18:27),mobile?9:11,ally.hp<40?'#ffae88':C.cyan,true);c.fillStyle=ally.hp<40?'#e79078':C.cyan;c.fillRect(x+6,by+(short?25:35),(bw-12)*clamp(ally.hp/100),2);});
  c.textAlign='left';text(c,'ЩИТ '+Math.ceil(e.player.hp)+' · РАКЕТЫ '+e.player.missiles+' · '+(mobile?'ПРИКРЫТИЕ ':'E ')+(e.player.pulseCooldown>0?Math.ceil(e.player.pulseCooldown)+'с':'ГОТОВО'),pad,H-(short?10:18),mobile?10:11,'#b7cadb');
  if(!mobile){c.textAlign='right';text(c,'WASD — МАНЁВР · TAB — ЦЕЛЬ · ЛКМ / ПРОБЕЛ — ОГОНЬ · ПКМ / Q — РАКЕТА',W-pad,H-18,11,'#9bb1c7');}
  c.restore();
 }
 drawEscortHUD=function(c,e,cam,w,h){return active(e)?hud(c,e,cam,w,h):old.hud(c,e,cam,w,h);};
 drawMobileGameHUD=function(c,e,cam,w,h){return active(e)&&!e.crash?hud(c,e,cam,w,h):old.mobile(c,e,cam,w,h);};
 expeditionOverlay=function(e){
  if(!active(e)||e.status!=='escortbrief')return old.brief(e);const m=api.mission(e);
  return '<div class="arcade-state-card briefing escort-brief"><span class="arcade-serial">ГИПЕРПРОСТРАНСТВО · КОНВОЙ '+(e.stage+1)+' / 3</span><h3>'+esc(m.subtitle)+'.</h3><p>'+esc(m.brief)+'</p><div class="brief-command"><span class="hostile-symbol">⌖</span><div><b>Сохраните минимум два транспорта</b><small>ЛКМ / Пробел — огонь · ПКМ / Q — ракета · E — прикрытие · Tab — сменить цель. На телефоне используйте кнопки оружия и прикрытия.</small></div></div><div class="brief-command"><span class="crystal-symbol">◯</span><div><b>Круглый светлый просвет — единственный безопасный проход</b><small>За пределами кольца энергетическое поле наносит большой урон. В боевом режиме противник атакует без предварительных сигналов.</small></div></div><button class="arcade-play" data-action="citadel-launch">ПРИКРЫТЬ КОНВОЙ ↗</button></div>';
 };
 function touchControls(e){
  const on=active(e),screen=document.getElementById('arcade-screen');screen?.classList.toggle('convoy240-controls',on);const dock=screen?.querySelector?.('.arcade-touch-actions');
  if(dock?.nodeType!==1||typeof dock.querySelector!=='function')return;
  for(const [id,action,label]of [['convoy240-target-touch','citadel-target','ЦЕЛЬ'],['convoy240-cover-touch','arcade-pulse','ПРИКРЫТИЕ']]){
   let button=dock.querySelector('#'+id);if(!button&&on){button=document.createElement('button');button.type='button';button.id=id;button.dataset.action=action;button.className='convoy240-touch-control';dock.appendChild(button);}if(!button)continue;
   const wait=on&&action==='arcade-pulse'?Math.ceil(e.player.pulseCooldown||0):0;button.hidden=!on;button.disabled=!on||e.status!=='playing'||wait>0;const value=label+(action==='arcade-pulse'?'\n'+(wait>0?wait+' с':'ГОТОВО'):'');if(button.textContent!==value)button.textContent=value;button.setAttribute('aria-label',action==='citadel-target'?'Сменить цель конвоя':wait>0?'Прикрытие: готово через '+wait+' секунд':'Прикрыть конвой');
  }
 }
 updateExpeditionHUD=function(){
  const e=ARCADE.engine;touchControls(e);if(!active(e))return old.ui();
  // Own the convoy path. Calling the old 2.3 UI here would dereference ops230
  // on a new ops240 mission when the 2.4 view guard skips a 2.6 rules module.
  const cq=e.escort,o=cq.ops240||cq.ops230,m=api.mission(e),set=(id,value)=>{const node=document.getElementById(id);if(node&&node.textContent!==value)node.textContent=value;};
  document.getElementById('arcade-layout')?.classList.toggle('hyper-mode',true);document.getElementById('citadel-quickbar')?.classList.toggle('hyper-controls',true);
  const panel=document.getElementById('convoy-panel');if(panel){panel.hidden=false;const html='<small>СОХРАНИТЕ МИНИМУМ 2 / 3</small>'+cq.allies.map(a=>'<div class="convoy-status '+(a.dead?'destroyed':a.hp<35?'danger':'')+'"><div><span>'+esc(a.name)+'</span><b>'+(a.dead?'ПОТЕРЯН':Math.ceil(a.hp)+'%')+'</b></div><i><b style="width:'+a.hp+'%"></b></i></div>').join('');if(panel.innerHTML!==html)panel.innerHTML=html;}
  set('citadel-objective-phase','ГИПЕРПЕРЕХОД / '+(e.stage+1));set('arcade-stage-label','СОПРОВОЖДЕНИЕ '+(e.stage+1)+' / 3');set('arcade-mission-title',m.name);set('arcade-mission-brief',m.brief);set('citadel-guidance','WASD · Манёвр · Tab · Цель');set('citadel-primary','E · Прикрытие');
  const skip=document.getElementById('citadel-skip-dock');if(skip)skip.hidden=!['docking','crashing'].includes(e.status);
  const route=document.getElementById('citadel-route');if(route){const html='<div class="route-missions"><b>'+esc(m.subtitle.toUpperCase())+'</b></div><div class="route-count"><small>ГИПЕРПЕРЕХОД</small><b>'+Math.round(cq.distance*100)+'<em>%</em></b></div><div class="route-count"><small>ЗВЕНЬЯ ПРОТИВНИКА</small><b>'+o.next+'<em>/'+m.groups.length+'</em></b></div><p>Манёвр · перехват · прикрытие<br>Сохраните 2 / 3 транспорта</p>';if(route.innerHTML!==html)route.innerHTML=html;}
  if(ARCADE.radar)ARCADE.radar.canvas.setAttribute('aria-label','Карта конвоя: белый — ваш корабль, зелёные — транспорты, красные и фиолетовые — противники');
 };
 globalThis.CITADEL_CONVOY_VIEW=Object.freeze({version:'2.6.0',stats:()=>({...lastStats,templates:templates.size,surfaceBuilds}),fieldRects,
  testVessel:type=>{const a=[];instance(a,fleetModel(type),[0,0,0]);return a;},fieldBoundary:f=>({shape:f.shape||'legacy-rectangle',x:f.gapX,y:f.gapY,z:f.z,radius:f.radius,halfW:f.halfW,halfH:f.halfH}),skyShader:SKY_FRAGMENT});
})();
