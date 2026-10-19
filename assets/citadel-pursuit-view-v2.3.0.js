/* Citadel 2.3.0 — shared convoy / Cathedral Run material renderer.
 * Bounded, material-batched 3D assets; depth-correct software fallback;
 * a dedicated metal/stone/cloth shader. No new loop, listeners or emit hooks.
 * Fracture simulation is serialized inside pursuit; rendering is read-only.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_PURSUIT_VIEW||globalThis.CITADEL_PURSUIT?.version!=='2.1.0')return;
 const VERSION='2.3.0',P=CITADEL_PURSUIT,TAU=Math.PI*2;
 const old={scene:spaceScene,camera:spaceCamera,draw:spaceDrawCPU,step:RequirementArcade.prototype.step,
   render:SpaceRendererCore.prototype.render,dispose:SpaceRendererCore.prototype.dispose,hud:drawFlightHUD,mobileHUD:drawMobileGameHUD};
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),active=e=>P.active(e);
 const MAT={metal:20,stone:21,cloth:22,glass:23,light:24};
 const C={steel:'#46566a',dark:'#202b3a',edge:'#7d8b99',gold:'#b58b4a',goldLight:'#e0be7c',blue:'#34557d',ivory:'#b9b4a0',red:'#8d3039',black:'#111a24',cyan:'#83ecf1',warm:'#ffcc83',purple:'#bba5f1'};
 const templates=new Map(),gpu=new WeakMap(),surfaces=new WeakMap();
 let lastStats={};
 function mesh(name,vertices,faces,smooth=false){SPACE_MESH[name]=spaceMesh(vertices,faces,smooth);return name;}
 function loft(name,rings,sides=10){
   const v=[],f=[];
   for(const [y,rx,rz]of rings)for(let j=0;j<sides;j++){const a=j/sides*TAU;v.push([Math.cos(a)*rx,y,Math.sin(a)*rz]);}
   for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides;f.push([a,a+sides,b+sides,b]);}
   f.push(Array.from({length:sides},(_,j)=>j));f.push(Array.from({length:sides},(_,j)=>(rings.length-1)*sides+sides-1-j));
   return mesh(name,v,f);
 }
 // Chamfered armour, a thick turbine, and sculpted cloth/hood silhouettes.
 loft('p220_armour',[[-1,.76,.76],[-.68,1,1],[.68,1,1],[1,.76,.76]],8);
 loft('p220_pylon',[[-1,1,1],[.72,.72,.72],[1,.04,.04]],4);
 loft('p220_robe',[[0,.86,.61],[.17,.97,.7],[1.2,.68,.48],[2.2,.55,.37],[2.55,.72,.35],[2.78,.32,.26]],12);
 loft('p220_hood',[[-1,.56,.6],[-.6,.9,.92],[.3,1,1],[.9,.64,.6],[1.13,.08,.04]],10);
 loft('p220_nozzle',[[-1,.78,.78],[-.7,1,1],[.7,1,1],[1,.86,.86]],12);
 function item(list,mesh,pos,size,color,em=0,basis=SPACE_IDENTITY,mat=MAT.metal,alpha=1){
   const it=citadelItem(mesh,pos,size,color,em,basis,alpha,mat);list.push(it);return it;
 }
 function beam(list,a,b,r,color,em=0,mat=MAT.metal){const d=V3.sub(b,a);return item(list,'box',V3.lerp(a,b,.5),[r,r,V3.len(d)/2],color,em,spaceBasisDir(d),mat);}
 function arch(list,x,y,z,w,h,r,color,em=0){
   const pts=[[-w,0],[-w*.98,h*.32],[-w*.76,h*.66],[-w*.42,h*.9],[0,h*1.12],[w*.42,h*.9],[w*.76,h*.66],[w*.98,h*.32],[w,0]];
   for(let i=1;i<pts.length;i++)beam(list,[x+pts[i-1][0],y+pts[i-1][1],z],[x+pts[i][0],y+pts[i][1],z],r,color,em);
 }
 function cog(list,p,r,color){
   item(list,'ring',p,[r,r,.12],color,.08);
   for(let i=0;i<12;i++){const a=i/12*TAU;item(list,'box',[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r,p[2]],[r*.19,r*.12,.16],color,0,flightBasis(0,0,a));}
 }
 function skull(list,p,s=1){
   item(list,'p220_hood',p,[s*.6,s*.62,s*.4],C.ivory);
   for(const side of [-1,1])item(list,'box',V3.add(p,[side*s*.24,s*.08,s*.38]),[s*.17,s*.13,s*.05],C.black);
   item(list,'p220_pylon',V3.add(p,[0,-s*.2,s*.4]),[s*.12,s*.16,s*.05],C.black);
   for(let i=-2;i<=2;i++)item(list,'box',V3.add(p,[i*s*.13,-s*.42,s*.26]),[s*.045,s*.14,s*.11],C.ivory);
 }
 function compile(key,build){if(templates.has(key))return templates.get(key);const parts=[];build(parts);const result=stationMerge(parts,'p220_'+key);templates.set(key,result);return result;}
 function instance(list,parts,pos,basis=SPACE_IDENTITY,scale=[1,1,1],tint=null){
   const model=spaceModel(pos,scale,basis);
   for(const src of parts)list.push({...src,pos,model,color:tint||src.color});
 }
 function priest(){return compile('priest',list=>{
   item(list,'p220_robe',[0,0,0],[1,1,1],C.red,0,SPACE_IDENTITY,MAT.cloth);
   for(let i=-3;i<=3;i++)beam(list,[i*.22,.1,.56],[i*.12,2.34,.33],.035,i%2?C.red:'#b45748',0,MAT.cloth);
   item(list,'p220_hood',[0,3.03,.02],[.57,.67,.48],C.red,0,SPACE_IDENTITY,MAT.cloth);
   item(list,'p220_hood',[0,2.99,.4],[.34,.43,.15],C.black);
   item(list,'p220_armour',[.12,3,.55],[.19,.24,.09],C.ivory);
   item(list,'box',[-.15,3.1,.58],[.105,.035,.04],C.cyan,1,SPACE_IDENTITY,MAT.light);
   item(list,'box',[.18,3.1,.59],[.045,.06,.03],C.warm,1,SPACE_IDENTITY,MAT.light);
   for(let i=-1;i<=1;i++)beam(list,[i*.11,2.78,.56],[i*.15,2.55,.32],.045,C.edge);
   cog(list,[0,3.25,-.34],.91,C.gold);
   for(const side of [-1,1]){
     item(list,'p220_armour',[side*.65,2.35,0],[.29,.24,.31],C.gold);
     beam(list,[side*.6,2.25,0],[side*.96,1.77,.4],.15,C.red,0,MAT.cloth);
     beam(list,[side*.96,1.77,.4],[side*.8,2,.78],.1,C.edge);
     item(list,'p220_armour',[side*.8,2,.8],[.13,.1,.16],C.ivory);
     // Mechanical tendrils anchored to the backpack, never into the flight opening.
     const points=[[side*.3,2.25,-.3],[side*1.1,2.8,-.5],[side*1.5,3.42,-.15],[side*1.3,3.7,.4]];
     for(let i=1;i<points.length;i++){beam(list,points[i-1],points[i],.07,C.edge);item(list,'octa',points[i],[.12,.12,.12],C.gold);}
   }
   beam(list,[.86,.1,.88],[.86,3.6,.88],.055,C.gold);
   cog(list,[.86,3.65,.88],.28,C.goldLight);
   item(list,'box',[0,1.8,.49],[.15,.21,.04],C.gold);
   for(const side of [-1,1])item(list,'box',[side*.18,1.1,.6],[.08,.43,.014],C.ivory,0,flightBasis(0,0,side*.1),MAT.cloth);
 });}
 function ship(kind,lod=0){return compile('ship_'+kind+'_'+lod,list=>{
   const player=kind==='player',fz=kind==='fz',jammer=kind==='jammer';
   const paint=player?C.blue:fz?C.ivory:jammer?'#634573':C.red,trim=fz?C.gold:C.goldLight;
   item(list,'p220_armour',[0,0,0],[2,1,4.8],C.dark);
   item(list,'p220_armour',[0,.5,.55],[1.73,.85,4.25],paint);
   item(list,'p220_armour',[0,.16,4.5],[1.5,.67,1.2],C.ivory);
   item(list,'box',[0,.04,-4.57],[1.3,.65,.16],paint);
   item(list,'box',[0,.04,-4.75],[.83,.48,.05],C.dark);
   for(let j=-2;j<=2;j++)item(list,'box',[0,j*.18,-4.82],[.77,.045,.04],C.edge);
   for(const side of [-1,1])item(list,'box',[side*1.15,.3,-4.8],[.05,.19,.05],trim);
   item(list,'p220_armour',[0,1.28,.3],[1.1,.55,2.3],C.dark);
   item(list,'p220_armour',[0,1.63,1.6],[.85,.34,1.1],'#52798b',.12,SPACE_IDENTITY,MAT.glass);
   beam(list,[-.85,1.96,1.4],[.85,1.96,1.4],.045,trim);
   beam(list,[0,1.98,.8],[0,1.98,2.4],.05,trim);
   for(const side of [-1,1]){
     item(list,'p220_armour',[side*3.23,0,-.6],[1.47,.57,2.9],paint);
     item(list,'p220_armour',[side*3.57,.12,-2.5],[.96,.86,2.5],paint);
     item(list,'box',[side*3.58,.98,-2.3],[.1,.035,2.25],C.ivory);
     item(list,'p220_nozzle',[side*3.57,.12,-4.8],[.75,.9,.75],C.edge,0,flightBasis(0,Math.PI/2));
     item(list,'ring',[side*3.57,.12,-5.75],[.66,.66,.2],trim,.15,flightBasis(0,0));
     item(list,'p220_armour',[side*4.52,-.42,1.7],[.38,.38,1.9],C.dark);
     for(const dx of [-.13,.13]){
       item(list,'box',[side*4.52+dx,-.42,3.7],[.07,.07,1.35],C.edge);
       item(list,'box',[side*4.52+dx,-.42,5.1],[.1,.1,.12],C.black);
     }
     item(list,'p220_pylon',[side*3.6,1.8,-3],[.38,1.6,1.1],paint);
     if(!lod){
       for(let i=0;i<5;i++)item(list,'box',[side*3.6,.99,-4+i*.7],[.6,.04,.1],C.dark);
       for(let i=0;i<4;i++){
         item(list,'p220_armour',[side*1.7,.7,-2.9+i*1.7],[.23,.38,.66],paint);
         item(list,'box',[side*1.94,.68,-2.9+i*1.7],[.035,.03,.5],trim);
       }
       for(const z of [-3,-1,1,3])item(list,'octa',[side*1.49,1.4,z],[.07,.06,.07],trim);
       // Votive seals and riveted gold wing insignia.
       item(list,'octa',[side*2.7,.64,1.3],[.23,.09,.23],C.red);
       item(list,'box',[side*2.7,.65,.7],[.09,.025,.48],C.ivory,0,SPACE_IDENTITY,MAT.cloth);
       for(let i=0;i<4;i++)beam(list,[side*.45,1.39,-2.3-i*.2],[side*(1.32-i*.12),1.39,-1.6-i*.3],.065,trim);
     }
   }
   item(list,'box',[0,1.42,-2.5],[.16,.035,.49],trim);
   item(list,'octa',[0,1.46,-1.99],[.2,.05,.2],C.ivory);
   // Antenna is at the existing channel endpoint, without a permanent beam.
   const antenna=fz?[0,1.1/1.2,-5/1.2]:[0,1.6,3];beam(list,V3.add(antenna,[0,-.5,0]),antenna,.07,trim);item(list,'octa',antenna,[.15,.12,.15],C.cyan,1,SPACE_IDENTITY,MAT.light);
   if(jammer){cog(list,[0,3,-1],1.5,C.gold);item(list,'octa',[0,3,-.9],[.42,.42,.3],C.purple,1,SPACE_IDENTITY,MAT.light);}
 });}
 function gateFrame(hx,hy,lod){return compile('gate_'+hx+'_'+hy+'_'+lod,list=>{
   const stone='#596474';
   for(const side of [-1,1]){
     const x=side*(hx+5.4);
     item(list,'p220_armour',[x,0,0],[5.1,hy+6,5],stone,0,SPACE_IDENTITY,MAT.stone);
     item(list,'p220_armour',[x,-hy-4,1],[7,3.8,7],C.dark);
     item(list,'p220_armour',[x,hy+5,1],[6.1,2.1,6.3],C.edge);
     item(list,'p220_pylon',[x,hy+14,0],[4.3,8,4.3],stone,0,SPACE_IDENTITY,MAT.stone);
     beam(list,[x,hy+20,0],[x,hy+26,0],.25,C.gold);
     beam(list,[x-1.4,hy+23,0],[x+1.4,hy+23,0],.2,C.gold);
     for(const dx of [-2.2,2.2]){
       beam(list,[x+dx,-hy-2,5.2],[x+dx,hy+4,5.2],.36,C.gold);
       item(list,'p220_pylon',[x+dx,hy+7,5],[.7,3,.7],C.gold);
     }
     for(let j=-2;j<=2;j++){
       item(list,'box',[x,j*hy*.39,5.1],[2.3,.14,.35],C.dark);
       if(!lod){arch(list,x,j*hy*.39-.8,5.5,1.1,2,.13,C.gold);item(list,'box',[x,j*hy*.39+.1,5.35],[.35,.8,.05],C.warm,.72,SPACE_IDENTITY,MAT.light);}
     }
     if(!lod){
       const px=side*(hx+13);
       item(list,'p220_armour',[px,-hy+2,1],[4,2.1,6],C.dark);
       instance(list,priest(),[px,-hy+4,4],SPACE_IDENTITY,[3.2,3.2,3.2]);
       arch(list,px,-hy+4,1,4.8,13,.35,C.gold);
       for(let j=-1;j<=1;j++)beam(list,[x+side*5,-hy+5+j*6,0],[x+side*13,-hy+5+j*6,-6],.45,C.edge);
     }
     beam(list,[side*(hx+.7),-hy,5.65],[side*(hx+.7),hy,5.65],.26,C.cyan,.9,MAT.light);
   }
   item(list,'p220_armour',[0,hy+4,0],[hx+2,3.9,5.5],C.dark);
   item(list,'p220_armour',[0,-hy-3,0],[hx+3,2.8,5.5],C.edge);
   arch(list,0,hy+2,4.5,hx+3,24,.8,C.gold);
   arch(list,0,hy+3,4.65,hx,21,.24,C.goldLight);
   cog(list,[0,hy+15,3.9],4,C.gold);
   item(list,'octa',[0,hy+15,4],[2.7,2.7,.35],C.warm,.55,SPACE_IDENTITY,MAT.light);
   for(let j=0;j<8;j++){const a=j/8*TAU;beam(list,[0,hy+15,4.5],[Math.cos(a)*3.8,hy+15+Math.sin(a)*3.8,4.5],.14,C.dark);}
   item(list,'p220_armour',[0,hy+7,5.2],[4,3,.8],C.dark);
   skull(list,[0,hy+7,6.2],2.2);
   for(const side of [-1,1])for(let i=0;i<4;i++)beam(list,[side*1.7,hy+7-i*.6,6.1],[side*(7-i*.8),hy+9-i*1.3,6.1],.25,C.gold);
   for(const side of [-1,1])beam(list,[side*hx,hy+.7,5.7],[0,hy+.7,5.7],.26,C.cyan,.85,MAT.light);
   beam(list,[-hx,-hy-.7,5.7],[hx,-hy-.7,5.7],.26,C.cyan,.85,MAT.light);
 });}
 // One seeded irregular body, six closed pieces cut from its actual triangles.
 const rockCentres=[];
 for(let variant=0;variant<3;variant++){
   const seed=variant*17+3,vertices=[],faces=[],seg=28,rings=14;
   for(let y=0;y<=rings;y++)for(let x=0;x<seg;x++){
     const a=Math.PI*y/rings,b=x/seg*TAU,d=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
     const r=.87+.075*Math.sin(d[0]*8+seed)*Math.cos(d[1]*7-seed)+.045*Math.sin(d[2]*19+seed);
     vertices.push(d.map(v=>v*r));
   }
   for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){const a=y*seg+x,b=y*seg+(x+1)%seg,c=(y+1)*seg+(x+1)%seg,d=(y+1)*seg+x;faces.push([a,b,c],[a,c,d]);}
   mesh('p220_rock'+variant,vertices,faces);
   const centres=[];
   for(let part=0;part<6;part++){
     const partFaces=faces.filter(f=>{const c=f.reduce((sum,j)=>V3.add(sum,vertices[j]),[0,0,0]);let axis=0;for(let i=1;i<3;i++)if(Math.abs(c[i])>Math.abs(c[axis]))axis=i;return axis*2+(c[axis]<0?1:0)===part;});
     const edges=new Map(),used=new Set();for(const f of partFaces)for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3];used.add(a);const k=Math.min(a,b)+':'+Math.max(a,b);if(edges.has(k))edges.delete(k);else edges.set(k,[b,a]);}
     const centre=V3.scale([...used].reduce((v,i)=>V3.add(v,vertices[i]),[0,0,0]),1/used.size);centres.push(centre);
     const cut=vertices.map(v=>V3.sub(v,centre));cut.push(V3.scale(centre,-.6));
     const caps=[...edges.values()].map(([a,b])=>[a,b,cut.length-1]);mesh('p220_fragment'+variant+'_'+part,cut,partFaces.concat(caps));
   }rockCentres.push(centres);
 }
 function fractures(e,before,dt){
   const s=e.pursuit;if(!s)return;
   let v=s.visual220;if(!v||v.version!==VERSION)v=s.visual220={version:VERSION,fragments:[],fractures:0};
   for(const f of v.fragments){f.life-=dt;f.pos=V3.add(f.pos,V3.scale(f.vel,dt));f.rotation=f.rotation.map((a,i)=>a+f.spin[i]*dt);f.vel=V3.scale(f.vel,Math.exp(-dt*.14));}
   v.fragments=v.fragments.filter(f=>f.life>0&&f.pos[2]<e.player.pos[2]+70).slice(-48);
   for(const a of before)if(a.dead&&!a.wall){
     const basis=flightBasis(a.phase+s.clock*.018,a.phase*.2,a.phase*.7),model=spaceModel(a.pos,[a.r,a.r,a.r],basis);
     for(let i=0;i<6;i++){
       const centre=rockCentres[a.variant][i],pos=spacePoint(model,centre),dir=V3.norm(V3.sub(pos,a.pos));
       v.fragments.push({variant:a.variant,piece:i,r:a.r,pos,vel:V3.scale(dir,12+i*3.7),rotation:[a.phase+s.clock*.018,a.phase*.2,a.phase*.7],spin:[.15+i*.13,.31-i*.09,.23+i*.08],life:3.6,max:3.6});
     }v.fractures++;
   }v.fragments=v.fragments.slice(-48);
 }
 RequirementArcade.prototype.step=function(delta,input){
   if(!active(this)||this.status!=='playing')return old.step.call(this,delta,input);
   const before=this.asteroids.filter(a=>!a.dead),clock=this.pursuit.clock;
   const result=old.step.call(this,delta,input),dt=this.pursuit.clock-clock;
   if(dt>0)fractures(this,before,dt);return result;
 };
 spaceCamera=function(e,time,preview){
   if(!active(e))return old.camera(e,time,preview);
   const p=e.player.pos,l=e.pursuit.leader.pos,rect=ARCADE.canvas?.getBoundingClientRect?.(),aspect=rect?.height?rect.width/rect.height:16/9;
   return Object.assign(stationLook([p[0]*.88+l[0]*.12,p[1]+9.8,p[2]+33],[p[0]*.78+l[0]*.22,p[1]+2,p[2]-120],aspect<.85?1.23:1.01,{near:.35,far:5000}),{pursuit220:true,clock:e.pursuit.clock,chapter:e.pursuit.chapter});
 };
 function addShip(list,x,kind,time,lod=0){
   const basis=kind==='player'?flightBasis(x.yaw,x.pitch,x.bank):spaceBasisDir(x.vel);
   const size=kind==='player'?1:kind==='fz'?1.2:.78,scale=[size,size,size],model=spaceModel(x.pos,scale,basis);
   instance(list,ship(kind,lod),x.pos,basis,scale,x.hit>0?[1,.86,.63]:null);
   for(const side of [-1,1]){
     const pulse=1+Math.sin(time*23+side)*.09;
     for(let i=0;i<3;i++)item(list,'octa',spacePoint(model,[side*3.57,.12,-6.1-i*1.1]),[size*(.65-i*.18),size*(.55-i*.13),size*(1.3+i*.45)*pulse],i===0?'#e4ffff':i===1?'#74dbea':'#3f78b5',1,basis,MAT.light,i===2?.48:1);
   }
 }
 spaceScene=function(e,time,fx=true){
   if(!active(e))return old.scene(e,time,fx);
   const s=e.pursuit,p=e.player,clock=s.clock,list=[];
   // A distant, lit world establishes scale and a clear, dark flight corridor.
   item(list,'planet',V3.add(p.pos,[1200,550,-3500]),[950,950,950],'#6b777f',0,flightBasis(.2,.1,.2),25);
   item(list,'ring',V3.add(p.pos,[1200,550,-3495]),[1450,310,1450],'#9d9380',.15,flightBasis(.1,.3,-.3),26,.28);
   for(const a of e.asteroids){if(a.dead)continue;const distance=V3.len(V3.sub(a.pos,p.pos));
     if(distance>1100||a.pos[2]>p.pos[2]+50)continue;
     const b=flightBasis(a.phase+clock*.018,a.phase*.2,a.phase*.7),near=distance<235;
     item(list,near?'p220_rock'+a.variant:'rock'+a.variant,a.pos,[a.r,a.r,a.r],a.hit>0?'#e6a26a':a.wall?'#64717b':'#8e8377',0,b,MAT.stone);
     if(near&&!a.wall){const m=spaceModel(a.pos,[a.r,a.r,a.r],b),damage=1-clamp(a.hp/52);
       for(let i=0;i<3;i++){const c=rockCentres[a.variant][i*2];item(list,'octa',spacePoint(m,V3.scale(c,1.45)),[a.r*.09,a.r*.13,a.r*.12],damage>.4?'#efa364':'#a7a29a',damage>.4?.7:.05,b,damage>.4?MAT.light:MAT.stone);}}
   }
   for(const g of s.gates){
     const gap=g.distance-s.travel;if(gap< -42||gap>1000)continue;
     const o=P.gateOpening(e,g),lod=gap>400?1:0,z=g.pos[2];
     // Keep the complete original collision silhouette behind the ornament.
     for(const part of P.gateParts(e,g))item(list,'box',part.pos,part.size,'#354150',0,SPACE_IDENTITY,MAT.metal);
     if(g.kind!=='ring'){
       for(const side of [-1,1]){
         const left=s.origin[0]+side*92,start=o.x+side*(o.hx+17),width=Math.abs(left-start);
         if(width>2){
           const mid=(left+start)/2;
           item(list,'p220_armour',[mid,s.origin[1],z+.6],[width/2,62,2.7],'#424e5d',0,SPACE_IDENTITY,MAT.metal);
           for(let j=-2;j<=2;j++)beam(list,[start,s.origin[1]+j*23,z+3.6],[left,s.origin[1]+j*23,z+3.6],.5,C.dark);
           for(let j=0;j<4;j++){const x=start+(left-start)*j/4;beam(list,[x,s.origin[1]-62,z+3.7],[x,s.origin[1]+62,z+3.7],.32,C.edge);}
         }
       }
     }
     instance(list,gateFrame(o.hx,o.hy,lod),[o.x,o.y,z]);
     if(g.kind==='shutter')for(const side of [-1,1]){
       const railX=s.origin[0]+side*91;
       beam(list,[railX,o.y,z+4],[o.x+side*(o.hx+17),o.y,z+4],.55,C.gold);
       item(list,'p220_armour',[o.x+side*(o.hx+2),o.y,z+5.2],[.8,o.hy,1.1],C.gold);
     }
     if(g.passed)for(const side of [-1,1])item(list,'octa',[o.x+side*o.hx,o.y-o.hy,z+6],[1,1,.5],'#a2f7d9',1,SPACE_IDENTITY,MAT.light);
   }
   for(const x of e.enemies)if(!x.dead){
     addShip(list,x,x.role==='jammer'?'jammer':'interceptor',clock,1);
     if(x.role==='jammer')instance(list,priest(),V3.add(x.pos,[0,1,-1]),SPACE_IDENTITY,[.9,.9,.9]);
     if(x.telegraph>0)item(list,'octa',V3.add(x.pos,[0,0,4]),[1,1,1],C.warm,1,SPACE_IDENTITY,MAT.light);
   }
   if(fx){
     for(const f of s.visual220?.fragments||[])item(list,'p220_fragment'+f.variant+'_'+f.piece,f.pos,[f.r,f.r,f.r],f.life>3?'#bb976f':'#81786f',f.life>3?.16:0,flightBasis(...f.rotation),MAT.stone,clamp(f.life/.5));
     for(const q of e.particles)item(list,'octa',q.pos,[q.size*.32,q.size*.32,q.size*1.2],q.color,1,spaceBasisDir(q.vel),MAT.light,Math.min(1,q.life/q.max));
     for(let i=0;i<16;i++){
       const z=p.pos[2]-((s.travel*.8+i*37)%500),x=s.origin[0]+(i%2?1:-1)*(59+i%3*9),y=s.origin[1]+(i%5-2)*19;
       beam(list,[x,y,z],[x,y,z+8],.014,'#68929a',.55,MAT.light);
     }
   }
   for(const b of [...e.bullets,...e.hostile])item(list,'box',b.pos,[.09,.09,2.8],b.color,1,spaceBasisDir(b.vel),MAT.light);
   addShip(list,s.leader,'fz',clock);addShip(list,p,'player',clock);
   list.pursuit220=true;return list;
 };

 // Dedicated material pass. It reuses the renderer's mesh buffers and sky,
 // and owns exactly one extra program per active GL renderer.
 const FRAGMENT=[
 'precision highp float;varying vec3 vNormal;varying vec3 vLocal;varying vec3 vWorld;uniform vec3 uColor;uniform vec3 uEye;uniform float uEmissive;uniform float uAlpha;uniform float uKind;',
 'float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}',
 'float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
 'void main(){vec3 n=normalize(vNormal),eye=normalize(uEye-vWorld),sun=normalize(vec3(-.5,.85,.65));float diffuse=max(0.,dot(n,sun)),rim=pow(1.-max(0.,dot(n,eye)),3.);float rough=.43;vec3 albedo=uColor;float grain=noise(vLocal*7.);',
 'if(uKind>24.5){rough=.9;albedo*=.65+.4*noise(vLocal*8.)+.18*noise(vLocal*25.);}',
 'else if(uKind>20.5&&uKind<21.5){rough=.92;albedo*=.72+.24*noise(vLocal*4.)+.15*noise(vLocal*30.);}',
 'else if(uKind>21.5&&uKind<22.5){rough=.86;albedo*=.82+.16*grain;}',
 'else if(uKind<20.5){albedo*=.88+.12*noise(vLocal*vec3(2.,36.,2.));}',
 'if(uKind>22.5&&uKind<23.5){rough=.17;albedo=mix(albedo*.3,vec3(.3,.66,.78),rim);}',
 'float shine=pow(max(0.,dot(n,normalize(sun+eye))),mix(110.,8.,rough))*(1.-rough);',
 'vec3 light=vec3(.27,.35,.46)+vec3(1.07,.9,.66)*diffuse+vec3(.13,.2,.32)*max(0.,-n.x);vec3 col=albedo*light+vec3(.9,.86,.73)*shine*.65+vec3(.13,.32,.48)*rim*.3;',
 'col=mix(col,albedo*1.4,clamp(uEmissive,0.,1.));float fog=1.-exp(-length(vWorld-uEye)*.00048);col=mix(col,vec3(.045,.075,.11),fog);col=col/(col+vec3(.5));col=pow(col,vec3(.85));gl_FragColor=vec4(col,uAlpha);}'
 ].join('\n');
 function glRender(renderer,items,cam){
   const gl=renderer.gl;if(gl.isContextLost())return;
   let state=gpu.get(renderer);if(!state){const program=renderer.program(SPACE_VERTEX,FRAGMENT),loc={};for(const name of ['uModel','uView','uProjection','uColor','uEye','uEmissive','uAlpha','uKind'])loc[name]=gl.getUniformLocation(program,name);
     for(const name of ['uInterior','uLightA','uLightB','uLightC','uTintA','uTintB','uTintC'])loc[name]=null;
     state={program,loc,position:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal')};gpu.set(renderer,state);}
   const saved={program3D:renderer.program3D,loc:renderer.loc,position:renderer.position,normal:renderer.normal};
   // The shared render procedure accepts null locations for unused lighting uniforms.
   renderer.program3D=state.program;renderer.loc=state.loc;renderer.position=state.position;renderer.normal=state.normal;
   try{old.render.call(renderer,items,cam);}finally{Object.assign(renderer,saved);}
 }
 SpaceRendererCore.prototype.render=function(items,cam){return (cam.pursuit220||cam.convoy230)&&this.gl?glRender(this,items,cam):old.render.call(this,items,cam);};
 SpaceRendererCore.prototype.dispose=function(){const state=gpu.get(this);if(state&&this.gl){this.gl.deleteProgram(state.program);gpu.delete(this);}return old.dispose.call(this);};

 function sky(c,cam,w,h){
   if(cam.convoy230){c.fillStyle='#070f20';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w*.5,h*.4,0,w*.5,h*.4,w*.75);g.addColorStop(0,['#204858','#373050','#282e42'][cam.chapter||0]);g.addColorStop(1,'#050c1a');c.fillStyle=g;c.fillRect(0,0,w,h);const r=arcadeSeed(230);for(let i=0;i<170;i++){c.fillStyle=i%4?'#88a9b877':'#d2c69b99';c.fillRect(r()*w,r()*h,1,1);}return;}

   c.fillStyle='#080e19';c.fillRect(0,0,w,h);
   const haze=c.createRadialGradient(w*.3,h*.3,0,w*.35,h*.4,w*.85);haze.addColorStop(0,'#30434d');haze.addColorStop(.35,'#1b293b');haze.addColorStop(1,'#080b15');c.fillStyle=haze;c.fillRect(0,0,w,h);
   const seed=arcadeSeed(22039);for(let i=0;i<15;i++){
     const x=seed()*w,y=(.18+x/w*.5+(seed()-.5)*.22)*h,r=w*(.08+seed()*.12),g=c.createRadialGradient(x,y,0,x,y,r);
     g.addColorStop(0,i%3?'#54788012':'#b58b5a12');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
   }
   for(let i=0;i<450;i++){const x=seed()*w,y=seed()*h,r=seed();c.fillStyle=r>.94?'#e8cf9c':'#829aaa';c.globalAlpha=.3+r*.6;c.fillRect(x,y,r>.98?1.8:.8,r>.98?1.8:.8);}c.globalAlpha=1;
   // Analytic, smoothly shaded distant world for the software fallback.
   // Cached per surface size: no per-frame noise/planet texture allocation.
   const cx=w*.79,cy=h*.29,r=h*.35;
   const glow=c.createRadialGradient(cx,cy,r*.94,cx,cy,r*1.13);glow.addColorStop(0,'#82c0cc32');glow.addColorStop(1,'#82c0cc00');c.fillStyle=glow;c.fillRect(cx-r*1.14,cy-r*1.14,r*2.28,r*2.28);
   c.save();c.translate(cx,cy);c.rotate(-.28);for(let i=0;i<6;i++){c.strokeStyle=i%2?'#9f967b44':'#ccc1a366';c.lineWidth=1+i*.35;c.beginPath();c.ellipse(0,0,r*(1.43+i*.025),r*(.23+i*.014),0,0,TAU);c.stroke();}c.restore();
   const planet=document.createElement('canvas');planet.width=256;planet.height=256;
   const pc=planet.getContext('2d'),data=pc.createImageData(256,256),pixels=data.data;
   const grids=[8,16,32,64].map(size=>({size,values:Float32Array.from({length:(size+1)*(size+1)},()=>seed())}));
   function noise(x,y){let sum=0,weight=.55;for(const g of grids){const fx=clamp(x)*g.size,fy=clamp(y)*g.size,ix=Math.min(g.size-1,Math.floor(fx)),iy=Math.min(g.size-1,Math.floor(fy)),u=fx-ix,v=fy-iy,k=iy*(g.size+1)+ix;
     sum+=weight*((g.values[k]*(1-u)+g.values[k+1]*u)*(1-v)+(g.values[k+g.size+1]*(1-u)+g.values[k+g.size+2]*u)*v);weight*=.48;}return sum;}
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){
     const nx=(x-127.5)/127.5,ny=(127.5-y)/127.5,rr=nx*nx+ny*ny;if(rr>1)continue;const nz=Math.sqrt(1-rr);
     const light=Math.max(0,nx*-.55+ny*.65+nz*.5),rim=Math.pow(1-nz,4),field=noise((nx+1)*.5,(ny+1)*.5);
     const land=clamp((field-.42)*4),cloud=clamp((noise((nx+1)*.5+.08,(ny+1)*.5+.13)-.57)*2)*.3;
     const color=[42+land*43,72+land*9,86-land*20],offset=(y*256+x)*4;
     for(let j=0;j<3;j++)pixels[offset+j]=Math.round(clamp((color[j]*(.12+light*.9)+cloud*100*light+[20,48,65][j]*rim)/255)*255);
     pixels[offset+3]=Math.round(clamp((1-rr)*128)*255);
   }pc.putImageData(data,0,0);c.drawImage(planet,cx-r,cy-r,r*2,r*2);
 }
 const bounds=new WeakMap();
 function inView(it,cam,w,h){
   const mesh=SPACE_MESH[it.mesh];let bound=bounds.get(mesh);
   if(!bound){const p=mesh.p,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){
     const axis=i%3;min[axis]=Math.min(min[axis],p[i]);max[axis]=Math.max(max[axis],p[i]);}
     const center=min.map((v,i)=>(v+max[i])/2),radius=Math.hypot(...max.map((v,i)=>v-center[i]));bound={center,radius};bounds.set(mesh,bound);}
   const m=it.model,center=spacePoint(m,bound.center),d=V3.sub(center,cam.pos),z=V3.dot(d,cam.f),radius=bound.radius*Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
   if(z+radius<.35)return false;const sy=Math.tan(cam.fov/2),sx=sy*w/h;
   return Math.abs(V3.dot(d,cam.r))<z*sx+radius*Math.sqrt(1+sx*sx)&&Math.abs(V3.dot(d,cam.u))<z*sy+radius*Math.sqrt(1+sy*sy);
 }
 function shade(it,n,mid,local){
   const sun=clamp(n[0]*-.45+n[1]*.74+n[2]*.5),view=V3.norm(V3.sub(local.eye,mid));
   const half=V3.norm(V3.add([-.45,.74,.5],view));
   const metal=it.kind===MAT.metal,glass=it.kind===MAT.glass,stone=it.kind===MAT.stone;
   const spec=Math.pow(Math.max(0,V3.dot(n,half)),glass?50:metal?20:4)*(glass?.32:metal?.16:.015);
   const noise=stone?.85+.12*Math.sin(mid[0]*.71+mid[1]*.93+mid[2]*.2):1;
   const fog=clamp(local.depth/1600,0,.62),em=clamp(it.emissive);
   return it.color.map((v,i)=>{
     const ambient=[.4,.46,.55][i],warm=[.8,.7,.53][i];
     const lit=v*(ambient+warm*sun)*noise+spec;
     const value=(lit*(1-em)+v*1.08*em)*(1-fog)+[.055,.085,.12][i]*fog;
     return Math.round(clamp(value)*255);
   });
 }
 function clipNear(vertices,near){
   const out=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],ina=a[2]>=near,inb=b[2]>=near;if(ina)out.push(a);if(ina!==inb){const t=(near-a[2])/(b[2]-a[2]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,near]);}}return out;
 }
 function raster(surface,tri,color,alpha){
   const w=surface.w,h=surface.h,pix=surface.image.data,dep=surface.depth;
   let [a,b,d]=tri,area=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);if(area<0){[b,d]=[d,b];area=-area;}if(area<.1)return;
   const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],d[0])-.5)),maxX=Math.min(w-1,Math.floor(Math.max(a[0],b[0],d[0])-.5)),minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],d[1])-.5)),maxY=Math.min(h-1,Math.floor(Math.max(a[1],b[1],d[1])-.5));
   const edge=(u,v,x,y)=>(v[0]-u[0])*(y-u[1])-(v[1]-u[1])*(x-u[0]);
   const dx0=b[1]-d[1],dx1=d[1]-a[1],dx2=a[1]-b[1],dy0=d[0]-b[0],dy1=a[0]-d[0],dy2=b[0]-a[0];
   let row0=edge(b,d,minX+.5,minY+.5),row1=edge(d,a,minX+.5,minY+.5),row2=edge(a,b,minX+.5,minY+.5);
   const iz0=a[2]/area,iz1=b[2]/area,iz2=d[2]/area,inv=1-alpha;
   for(let y=minY;y<=maxY;y++,row0+=dy0,row1+=dy1,row2+=dy2){let e0=row0,e1=row1,e2=row2,index=y*w+minX;
     for(let x=minX;x<=maxX;x++,index++,e0+=dx0,e1+=dx1,e2+=dx2){if(e0<0||e1<0||e2<0)continue;const z=e0*iz0+e1*iz1+e2*iz2;if(z<=dep[index]+.000000005)continue;const o=index*4;
       if(alpha>=1){dep[index]=z;pix[o]=color[0];pix[o+1]=color[1];pix[o+2]=color[2];}else{pix[o]=pix[o]*inv+color[0]*alpha;pix[o+1]=pix[o+1]*inv+color[1]*alpha;pix[o+2]=pix[o+2]*inv+color[2]*alpha;}
     }
   }
 }
 spaceDrawCPU=function(c,items,cam,w,h){
   if(!cam.pursuit220&&!cam.convoy230)return old.draw(c,items,cam,w,h);
   const start=performance.now(),factor=h/(2*Math.tan(cam.fov/2));
   let surface=surfaces.get(c);if(!surface||surface.w!==w||surface.h!==h||surface.scene!==(cam.convoy230?'convoy'+cam.chapter:'pursuit')){sky(c,cam,w,h);surface={w,h,scene:cam.convoy230?'convoy'+cam.chapter:'pursuit',image:c.getImageData(0,0,w,h),background:c.getImageData(0,0,w,h).data,depth:new Float32Array(w*h)};surfaces.set(c,surface);}
   surface.image.data.set(surface.background);surface.depth.fill(0);const translucent=[];let tested=0,visible=0;
   for(const it of items){
     if(it.kind>=25)continue;
     if(!inView(it,cam,w,h))continue;
     const geometry=SPACE_MESH[it.mesh],m=it.model,np=geometry.p,nn=geometry.n;
     const sx=m[0]**2+m[1]**2+m[2]**2,sy=m[4]**2+m[5]**2+m[6]**2,sz=m[8]**2+m[9]**2+m[10]**2;
     for(let i=0;i<np.length;i+=9){tested++;
       const v=[];for(let j=0;j<9;j+=3)v.push([m[0]*np[i+j]+m[4]*np[i+j+1]+m[8]*np[i+j+2]+m[12],m[1]*np[i+j]+m[5]*np[i+j+1]+m[9]*np[i+j+2]+m[13],m[2]*np[i+j]+m[6]*np[i+j+1]+m[10]*np[i+j+2]+m[14]]);
       const nx=nn[i]/sx,ny=nn[i+1]/sy,nz=nn[i+2]/sz,n=V3.norm([m[0]*nx+m[4]*ny+m[8]*nz,m[1]*nx+m[5]*ny+m[9]*nz,m[2]*nx+m[6]*ny+m[10]*nz]),mid=V3.scale(V3.add(V3.add(v[0],v[1]),v[2]),1/3);
       // Rings are two-sided; closed solids may discard the hidden face.
       if(it.mesh!=='ring'&&V3.dot(n,V3.sub(cam.pos,mid))<-.0001)continue;
       const camera=v.map(q=>{const d=V3.sub(q,cam.pos);return[V3.dot(d,cam.r),V3.dot(d,cam.u),V3.dot(d,cam.f)];});
       if(camera.every(q=>q[2]<.35))continue;
       const clipped=camera.some(q=>q[2]<.35)?clipNear(camera,.35):camera;if(clipped.length<3)continue;
       const screen=clipped.map(q=>[w/2+q[0]*factor/q[2],h/2-q[1]*factor/q[2],1/q[2]]);
       if(screen.every(q=>q[0]<0)||screen.every(q=>q[0]>w)||screen.every(q=>q[1]<0)||screen.every(q=>q[1]>h))continue;
       const depth=camera.reduce((s,q)=>s+q[2],0)/3,color=shade(it,n,mid,{eye:cam.pos,depth});
       for(let j=1;j<screen.length-1;j++){const tri=[screen[0],screen[j],screen[j+1]];visible++;if(it.alpha<1)translucent.push({tri,color,alpha:it.alpha,depth});else raster(surface,tri,color,1);}
     }
   }
   translucent.sort((a,b)=>b.depth-a.depth);for(const x of translucent)raster(surface,x.tri,x.color,x.alpha);
   c.putImageData(surface.image,0,0);c.globalAlpha=1;
   lastStats={items:items.length,triangles:tested,visibleTriangles:visible,milliseconds:performance.now()-start,templates:templates.size,meshes:Object.keys(SPACE_MESH).length,pixels:w*h};
 };
 function lens(c,e,cam,w,h){
   if(!active(e)||!['playing','paused'].includes(e.status))return;
   const p=e.player,b=flightBasis(p.yaw,p.pitch,p.bank),m=spaceModel(p.pos,[1,1,1],b);
   c.save();c.globalCompositeOperation='lighter';
   for(const side of [-1,1]){
     const q=spaceProject(spacePoint(m,[side*3.57,.12,-5.8]),cam,w,h);if(q.z<0||q.y<110)continue;
     const r=clamp(q.scale*1.8,8,40),g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,r);
     g.addColorStop(0,'#a6efff70');g.addColorStop(.2,'#5bdaf64a');g.addColorStop(1,'#2a7ecc00');c.fillStyle=g;c.fillRect(q.x-r,q.y-r,r*2,r*2);
   }
   c.restore();
 }
 drawFlightHUD=function(c,e,cam,w,h){const result=old.hud.apply(this,arguments);lens(c,e,cam,w,h);return result;};
 drawMobileGameHUD=function(c,e,cam,w,h){const result=old.mobileHUD.apply(this,arguments);lens(c,e,cam,w,h);return result;};
 globalThis.CITADEL_PURSUIT_VIEW=Object.freeze({version:VERSION,stats:()=>({...lastStats,templates:templates.size}),materials:MAT,
   inspect:e=>({version:VERSION,active:active(e),fragments:e?.pursuit?.visual220?.fragments.length||0,fractures:e?.pursuit?.visual220?.fractures||0,maxFragments:48}),
   channelEndpoints:e=>({from:spacePoint(spaceModel(e.player.pos,[1,1,1],flightBasis(e.player.yaw,e.player.pitch,e.player.bank)),[0,1.6,3]),to:spacePoint(spaceModel(e.pursuit.leader.pos,[1.2,1.2,1.2],spaceBasisDir(e.pursuit.leader.vel)),[0,1.1/1.2,-5/1.2]),phase:e.pursuit.clock}),
   model:kind=>ship(kind),testAssets:()=>({ship:ship('player'),priest:priest(),gate:gateFrame(20,15,0)}),shader:FRAGMENT});
})();
