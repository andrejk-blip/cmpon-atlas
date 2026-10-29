/* Citadel 2.6.0 — the pursuit's circular apertures and Warp leviathans.
 * Code-native meshes, shared GL/Canvas materials, fixed geometry caches.
 * This module consumes physical poses. It never advances time or writes a
 * mission, projectile, health, score, save, timer or event listener.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_PURSUIT_VIEW?.build==='280'||!globalThis.CITADEL_PURSUIT_VIEW||!globalThis.CITADEL_PURSUIT)return;
 const VERSION='2.6.0',P=CITADEL_PURSUIT,base=CITADEL_PURSUIT_VIEW;
 const old={scene:spaceScene,camera:spaceCamera},TAU=Math.PI*2;
 const M=20,S=21,L=24,templates=new Map();
 const C={black:'#111724',steel:'#596676',edge:'#c9c8bb',gold:'#9e7951',red:'#a63d48',cyan:'#8be7ef',warm:'#f0be77',skin:'#563e52',flesh:'#9b5962',bone:'#d1bf9d',void:'#160e24',violet:'#ad6dce',eye:'#ffbc83'};
 const compactMeshes={p260_muscle:'p260_muscle_low',p260_bone:'p260_bone_low',p260_tube:'p260_tube_low',p260_horn:'p260_horn_low'};
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const active=e=>P.active(e);
 const part=(a,mesh,p,s,color,em=0,b=SPACE_IDENTITY,alpha=1,material=M)=>{
   const x=citadelItem(a.compact?compactMeshes[mesh]||mesh:mesh,p,s,color,em,b,alpha,material);a.push(x);return x;
 };
 function beam(a,p,q,r,color,em=0,material=M){return part(a,'p260_tube',V3.lerp(p,q,.5),[r,r,Math.max(.001,V3.len(V3.sub(q,p))*.5)],color,em,spaceBasisDir(V3.sub(q,p)),1,material);}
 function taper(a,p,q,r,color,em=0){return part(a,'p260_horn',V3.lerp(p,q,.5),[r,r,Math.max(.001,V3.len(V3.sub(q,p))*.5)],color,em,spaceBasisDir(V3.sub(q,p)));}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];a.compact=key.endsWith('_1')||key.endsWith('_2');build(a);const result=stationMerge(a,'p260_'+key);templates.set(key,result);return result;}
 function instance(a,model,p,b=SPACE_IDENTITY,s=[1,1,1],tag={},hit=false){const m=spaceModel(p,s,b);for(const x of model)a.push({...x,pos:p,model:m,...tag,...(hit?{color:spaceColor('#ffddbd')}:null)});}
 function mesh(name,vertices,faces,smooth=false){SPACE_MESH[name]=spaceMesh(vertices,faces,smooth);}
 function spindle(name,rings,sides=8,smooth=false){
   const v=[],f=[];for(const [z,r] of rings)for(let i=0;i<sides;i++){const a=i/sides*TAU;v.push([Math.cos(a)*r,Math.sin(a)*r,z]);}
   for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const n=(i+1)%sides,k=j*sides;f.push([k+i,k+n,k+n+sides,k+i+sides]);}
   f.push(Array.from({length:sides},(_,i)=>sides-1-i));f.push(Array.from({length:sides},(_,i)=>(rings.length-1)*sides+i));mesh(name,v,f,smooth);
 }
 spindle('p260_tube',[[-1,.84],[-.7,1],[.7,1],[1,.84]],6);
 spindle('p260_horn',[[-1,1],[-.1,.62],[.7,.22],[1,.025]],6);
 // Low polygon count is spent on silhouettes, armour seams, jaws and the
 // moving appendages. A phone does not receive a hidden high-detail mesh.
 spindle('p260_muscle',[[-1,.15],[-.82,.62],[-.5,.9],[0,1],[.5,.92],[.82,.62],[1,.15]],10,true);
 spindle('p260_bone',[[-1,.12],[-.7,.7],[0,1],[.7,.76],[1,.12]],8,true);
 spindle('p260_tube_low',[[-1,.8],[0,1],[1,.8]],8,true);
 spindle('p260_horn_low',[[-1,1],[.25,.5],[1,.025]],5,true);
 spindle('p260_muscle_low',[[-1,.15],[-.5,.88],[.5,.9],[1,.15]],6,true);
 spindle('p260_bone_low',[[-1,.12],[0,1],[1,.12]],5,true);
 function torus(name,radius,tube,segments,cross=6,start=0,end=TAU){
   const v=[],f=[];for(let i=0;i<=segments;i++){const t=start+(end-start)*i/segments;for(let j=0;j<cross;j++){const u=j/cross*TAU,r=radius+Math.cos(u)*tube;v.push([Math.cos(t)*r,Math.sin(t)*r,Math.sin(u)*tube]);}}
   for(let i=0;i<segments;i++)for(let j=0;j<cross;j++){const k=i*cross,n=(j+1)%cross;f.push([k+j,k+cross+j,k+cross+n,k+n]);}mesh(name,v,f);return name;
 }
 torus('p260_sucker',.72,.19,8,4);
 function ring(radius,thickness,lod){
   // Physical ring dimensions are a finite rules vocabulary; rounding avoids
   // creating a mesh for arbitrary fractional save values on every frame.
   const r=Math.round(clamp(radius,8,28)*100)/100,t=Math.round(clamp(thickness,2,8)*100)/100;
   const key='ring_'+r+'_'+t+'_'+lod;
   return compile(key,a=>{
     const major=r+t/2,segments=lod?40:64;
     part(a,torus('p260_'+key+'_body',major,t/2,segments,6),[0,0,0],[1,1,.66],C.black);
     part(a,torus('p260_'+key+'_rim',r+.28,.18,segments,4),[0,0,1.05],[1,1,1],C.cyan,.8,SPACE_IDENTITY,1,L);
     part(a,torus('p260_'+key+'_back',r+t-.4,.25,segments,4),[0,0,.6],[1,1,1],C.steel);
     // Individual armoured sectors sit inside the collision annulus, leaving
     // the complete aperture open. There are no screen-spanning fake walls.
     const n=lod?12:20;
     for(let i=0;i<n;i++){
       const q=i/n*TAU,rr=major+.05,b={r:[Math.cos(q),Math.sin(q),0],u:[-Math.sin(q),Math.cos(q),0],f:[0,0,1]};
       part(a,'p220_armour',[Math.cos(q)*rr,Math.sin(q)*rr,.9],[t*.31,Math.min(2.1,Math.PI*major/n*.72),.55],i%5===0?C.gold:C.steel,0,b);
       part(a,'box',[Math.cos(q)*rr,Math.sin(q)*rr,1.48],[t*.1,.32,.05],i%5===0?C.warm:C.edge,.12,b);
       if(!lod){const seam=q+.042;part(a,'box',[Math.cos(seam)*rr,Math.sin(seam)*rr,1.48],[t*.16,.055,.045],C.black,0,b);}
     }
   });
 }
 function horn(a,points,r,color){
   // Curved contiguous horns, with constant shared joints instead of a stack
   // of disconnected cones. All are compiled into a bounded static model.
   for(let i=0;i<points.length-1;i++){const width=r*(1-i/(points.length-1)*.82);const b=spaceBasisDir(V3.sub(points[i+1],points[i]));
     part(a,'p260_bone',points[i],[width,width,width],color);taper(a,points[i],points[i+1],width,color);
     if(i===points.length-2)part(a,'p260_bone',V3.lerp(points[i],points[i+1],.4),[width*.47,width*.47,width*.12],C.gold,0,b);
   }
 }
 function leviathan(kind,lod){return compile('leviathan_'+kind+'_'+lod,a=>{
   if(['maw','mantis','medusa'].includes(kind)){
     const skin=kind==='maw'?'#60485b':kind==='mantis'?'#365f61':'#695c88';
     const organic=kind==='medusa';
     part(a,'p260_muscle',[0,0,0],[organic?8.7:6.0,organic?7:8.3,4.6],skin);
     part(a,'p260_muscle',[0,1.4,2.9],[organic?8:5.4,organic?5.4:7,2.5],C.black);
     if(kind==='maw'){
       // A vertical tooth-lined abyss, rib cage and asymmetrical tusks.
       part(a,'p260_muscle',[0,1.8,4.8],[4.5,6.8,1.5],C.void);
       for(const side of [-1,1])for(let i=0;i<(lod===2?4:7);i++){
         const y=-4.8+i*(lod===2?3:1.7),x=side*(3.3+Math.cos(y*.3)*.8);
         taper(a,[x,y,5.1],[x-side*1.4,y-.5,6.2],.38,C.bone);
         beam(a,[side*5.0,y,2.4],[side*6.3,y+1,1.2],.38,C.gold);
       }
       for(const side of [-1,1])horn(a,[[side*4,6,2],[side*7,9,3],[side*4,11,4]],1.2,C.bone);
       part(a,'p260_bone',[0,7.3,4.2],[1.4,.55,.65],C.eye,1,SPACE_IDENTITY,1,L);
     }else if(kind==='mantis'){
       part(a,'p260_muscle',[0,6.5,3.7],[3.2,3.7,2.4],C.black);
       for(const side of [-1,1]){
         part(a,'p260_muscle',[side*2,6.5,5.5],[1.65,2.4,.9],side<0?'#80c9a8':'#e4ba7c',.35,SPACE_IDENTITY,1,L);
         horn(a,[[side*2,9,3],[side*5,12,1],[side*4,14,4]],.8,C.bone);
         part(a,'p220_armour',[side*6,3,0],[2.4,5.2,3],skin,0,flightBasis(0,0,side*.3));
         for(let i=0;i<4;i++)horn(a,[[side*3,-1-i*1.6,2],[side*6,-2-i*1.7,3],[side*8,-3-i*1.7,6]],.75,C.bone);
         horn(a,[[side*1.6,3.8,5.6],[side*2.1,2.5,6.5],[side*.3,2.4,7]],.6,C.gold);
       }
     }else{
       // Wide bell, crown and one enormous recessed eye; unmistakable silhouette.
       part(a,'p260_muscle',[0,5,0],[10,4.5,5.0],skin);
       part(a,'p260_muscle',[0,1.8,5],[5.5,4.6,1.3],C.bone);
       part(a,'p260_muscle',[0,1.8,6.1],[3.3,3.4,.8],'#93d3c4',.45,SPACE_IDENTITY,1,L);
       part(a,'p260_muscle',[0,1.8,6.8],[.65,2.6,.22],C.void);
       for(let i=0;i<(lod===2?5:9);i++){
         const x=(i-(lod===2?2:4))*(lod===2?3:1.7);
         horn(a,[[x,7,0],[x*1.25,9.2,-.5],[x*1.35,11,1.6]],.55,C.bone);
         beam(a,[x,-3.5,2.5],[x*.8,-7,3.3],.5,C.gold);
       }
     }
     return;
   }

   const hammer=kind==='hammer',skin=hammer?C.skin:'#394653';
   // Chest, neck and overlapping rib plates form a solid anatomical mass.
   part(a,'p260_muscle',[0,.0,.0],[5.3,6.8,3.7],skin);
   part(a,'p260_muscle',[0,1.4,2.4],[4.7,4.5,1.9],C.black);
   part(a,'p260_muscle',[0,4.5,2.5],[2.1,2.8,1.8],skin);
   for(const side of [-1,1]){
     part(a,'p260_muscle',[side*4.7,3.0,.3],[2.7,2.8,3.7],C.steel,0,flightBasis(0,0,side*.18));
     part(a,'p260_muscle',[side*4.8,3.3,2.1],[2.6,2.2,2.1],C.gold,0,flightBasis(0,0,side*.18));
     part(a,'p260_muscle',[side*4.8,3.5,2.8],[2.25,1.85,1.7],C.black,0,flightBasis(0,0,side*.18));
     for(let i=0;i<(lod===2?2:4);i++){
       const yy=1.7-i*1.14;
       horn(a,[[side*.72,yy+.25,4.3],[side*2.2,yy+.55,4.15],[side*(3.9-i*.3),yy-.3,3.4]],.32,C.bone);
       if(!lod)part(a,'octa',[side*(3.9-i*.3),yy-.4,3.4],[.17,.17,.18],C.warm,.2);
     }
     horn(a,[[side*5.7,5.1,.3],[side*7.5,6.4,.5],[side*7.7,7.3,2.1]],.85,C.bone);
     horn(a,[[side*3.5,-2.8,1.1],[side*5.6,-5.3,1.5],[side*4.5,-7.3,3.0]],1.4,skin);
     // The small folded lower claws remain inside the body's contact sphere.
     for(let i=0;i<(lod===2?1:3);i++)horn(a,[[side*(2+i*.6),-4.5,2.4],[side*(2.5+i*.65),-6.5,3.9],[side*(1.8+i*.6),-7.3,4.2]],.38,C.bone);
   }
   part(a,'p220_armour',[0,-3.8,2.5],[2.9,1.4,.8],C.gold);
   part(a,'p220_armour',[0,-4.9,2.4],[1.8,1.6,.65],C.black);
   for(let i=0;i<(lod===2?2:4);i++){const y=.8-i*1.2;part(a,'p220_armour',[0,y,3.9],[.55,.42,.28],C.gold);}
   // A recessed mouth, two rows of teeth, cheek plates and deep eye sockets
   // read as a face even in the software/phone LOD, rather than an orb.
   part(a,'p260_muscle',[0,5.6,3.2],[2.65,2.8,2.9],C.bone);
   part(a,'p260_muscle',[0,5.5,5.0],[2.1,1.7,1.3],C.black);
   part(a,'p260_bone',[0,6.85,5.4],[2.35,.64,.86],C.bone);
   part(a,'p260_horn',[0,5.5,6.15],[.45,.9,.7],C.bone);
   part(a,'p260_bone',[0,3.72,5.45],[1.75,.55,.9],C.bone);
   part(a,'p260_muscle',[0,4.6,5.95],[1.45,.68,.45],C.void);
   for(const side of [-1,1]){
     part(a,'p260_bone',[side*1.25,6.1,5.95],[.7,.37,.25],C.void,0,flightBasis(0,0,side*.16));
     part(a,'p260_bone',[side*1.25,6.06,6.19],[.45,.11,.09],C.eye,1,flightBasis(0,0,side*.16),1,L);
     part(a,'p260_bone',[side*2.05,4.9,5.55],[.4,1.0,.65],C.bone,0,flightBasis(0,0,side*.2));
     horn(a,[[side*1.0,6.55,6],[side*1.75,6.78,5.8],[side*2.4,7.3,5.3]],.32,C.gold);
     horn(a,[[side*1.7,7.0,2.9],[side*3.4,8.1,2.4],[side*3.7,9.8,3.1],[side*2.9,10,4.5]],.95,C.gold);
     for(let i=0;i<(lod===2?2:3);i++){
       taper(a,[side*(.32+i*.46),5.2,6.4],[side*(.3+i*.45),4.35+(i===2?-.18:0),6.5],.16,C.bone);
       taper(a,[side*(.3+i*.45),4.0,6.35],[side*(.32+i*.44),4.55,6.5],.12,C.bone);
     }
     for(let i=0;i<(lod===2?0:lod?3:6);i++){
       const y=3.0+i*.38;
       beam(a,[side*1.95,y,5.5],[side*2.15,y+.18,5.45],.04,C.black);
     }
   }
   if(!lod){
     for(let i=0;i<7;i++){const y=-3.8+i*1.15;taper(a,[0,y,-3.2],[0,y+.4,-5.2],.6,C.bone);}
     for(const s of [-1,1])for(let j=0;j<4;j++)part(a,'octa',[s*(3.3+j*.65),4.9,3.92],[.18,.18,.16],C.edge);
     for(let i=0;i<3;i++)beam(a,[-2.3+i*.35,-1.3,3.9],[-1.1+i*.35,.6,4.05],.055,C.flesh,.24);
   }
 });}
 function hammerHead(lod){return compile('hammer_'+lod,a=>{
   part(a,'p220_armour',[0,0,0],[5.4,3.2,2.6],C.black);
   for(const side of [-1,1]){
     part(a,'p220_armour',[side*4.1,0,0],[1.2,3.7,3.1],C.steel);
     part(a,'p220_armour',[side*5.25,0,0],[.35,3.1,2.5],C.gold);
     for(let i=0;i<3;i++)part(a,'box',[side*5.63,-1.7+i*1.7,0],[.09,.1,1.95],C.warm,.6,SPACE_IDENTITY,1,L);
   }
   part(a,'p220_armour',[0,.0,2.7],[1.7,1.65,.35],C.gold);
   part(a,'p220_armour',[0,.0,3.08],[1.2,1.2,.16],C.void);
   part(a,'box',[0,0,3.28],[.16,.95,.06],C.violet,.8,SPACE_IDENTITY,1,L);
   part(a,'box',[0,0,3.28],[.8,.14,.06],C.violet,.8,SPACE_IDENTITY,1,L);
   if(!lod)for(const side of [-1,1])for(const z of [-1.6,1.6])part(a,'octa',[side*3.6,2.9,z],[.22,.23,.23],C.edge);
 });}
 function arm(a,p,q,r,lod,tag){
   const x=part(a,'p260_muscle',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.55],C.skin,0,spaceBasisDir(V3.sub(q,p)));Object.assign(x,tag);
   const mid=V3.lerp(p,q,.62),b=spaceBasisDir(V3.sub(q,p));
   Object.assign(part(a,'p220_armour',mid,[r*1.02,r*1.02,V3.len(V3.sub(q,p))*.22],C.steel,0,b),tag);
   if(!lod)Object.assign(part(a,'p260_tube',V3.lerp(p,q,.76),[r*1.08,r*1.08,.18],C.gold,0,b),tag);
 }
 function escortFighter(type,lod){return compile('fighter_'+type+'_'+lod,a=>{
   const heavy=type==='heavy',jam=type==='jammer',color=jam?'#715985':heavy?'#8e6c4b':C.red;
   part(a,'hull',[0,0,0],[1.6,.95,1.35],C.black);
   part(a,'p220_armour',[0,.22,-.2],[heavy?1.45:1.1,.48,2.7],color);
   part(a,'hull',[0,.67,1.6],[.72,.65,.57],C.edge);
   part(a,'p260_muscle',[0,.75,1.2],[.55,.25,.95],'#466a78',.25);
   for(const s of [-1,1]){
     part(a,'wing',[s*.3,0,0],[s*(heavy?1.05:.95),.8,1.3],C.steel);
     part(a,'p220_armour',[s*(heavy?3.45:2.85),-.1,-1.2],[heavy?.8:.5,.45,2.3],color);
     part(a,'box',[s*(heavy?3.45:2.85),.38,-.9],[.15,.05,1.7],C.edge);
     part(a,'box',[s*(heavy?3.45:2.85),-.1,1.4],[heavy?.18:.13,.12,1.0],C.black);
     part(a,'box',[s*(heavy?3.45:2.85),-.1,2.42],[heavy?.22:.17,.16,.12],C.warm,.7,SPACE_IDENTITY,1,L);
     part(a,'p260_tube',[s*2.0,-.1,-3.1],[.43,.43,.55],C.steel);
     part(a,'p260_tube',[s*2.0,-.1,-3.65],[.3,.3,.08],C.warm,.75,SPACE_IDENTITY,1,L);
     if(heavy){part(a,'p220_armour',[s*1.7,.7,-.8],[.5,.55,1.5],C.gold);part(a,'box',[s*1.7,.8,1.1],[.15,.14,1.0],C.black);}
     if(!lod)for(let i=0;i<3;i++)part(a,'box',[s*2.85,.4,-2.2+i*.55],[.32,.05,.04],C.black);
   }
   if(jam){
     part(a,'box',[0,1.35,-1.7],[.15,.7,.15],C.edge);
     part(a,'p220_armour',[0,2.15,-1.7],[2.2,.25,.4],color);
     for(const s of [-1,1])part(a,'p260_bone',[s*2.1,2.15,-1.7],[.3,.65,.3],C.violet,.55,SPACE_IDENTITY,1,L);
   }
 });}
 function warp(a,e,w,lod){
   const tag={pursuit260:true,warpEntity:w.id,warpKind:w.kind},parts=(P.warpParts?.(e,w)||w.segments||[]).filter(x=>x.pos?.every(Number.isFinite));
   const root=w.pos,phase=w.phase||0,age=w.age||0,scale=w.scale||.94;a.compact=lod>0;
   if(!root?.every(Number.isFinite))return;
   const breath=1+Math.sin(age*2.1)*.018;
   instance(a,leviathan(w.kind,lod),root,SPACE_IDENTITY,[scale,scale*breath,scale],{...tag,warpPart:'body'});
   const appendages=parts.filter(x=>x.part!=='body'&&x.part!=='hammer'&&x.part!=='blade');
   for(const chain of [...new Set(appendages.map(x=>x.chain||0))]){
     const joints=appendages.filter(x=>(x.chain||0)===chain);
     let last=w.schema===280?joints[0]?.pos:V3.add(root,[-(w.side||1)*4,-2,2]);
     if(!last)continue;
     // The phone joins alternate physical samples into a continuous tube.
     const stride=lod?2:1;
     for(let i=w.schema===280?stride:0;i<joints.length;i+=stride){
       const j=joints[Math.min(i,joints.length-1)],r=j.r*.82,b=spaceBasisDir(V3.sub(j.pos,last));
       if(w.kind==='hammer'||w.kind==='mantis')arm(a,last,j.pos,r,lod,{...tag,warpPart:j.part});
       else Object.assign(beam(a,last,j.pos,r,i%2?C.skin:C.flesh,0,S),{...tag,warpPart:j.part});
       if(w.kind==='maw'&&i%4===0){const tooth=V3.add(j.pos,[0,chain%2?2.4:-2.4,2.5]);Object.assign(taper(a,j.pos,tooth,1.1,C.bone),{...tag,warpPart:'jaw-tooth'});}
       if(i%4===0){
         Object.assign(part(a,'p260_tube',j.pos,[r*1.06,r*1.06,.35],C.gold,0,b),{...tag,warpPart:'ridge'});
         if(w.kind!=='hammer'){
           const pos=V3.add(V3.lerp(last,j.pos,.6),[0,0,r*.8]);
           Object.assign(part(a,'p260_sucker',pos,[r*.4,r*.4,r*.4],C.bone,0,SPACE_IDENTITY),{...tag,warpPart:'sucker'});
         }
       }
       last=j.pos;
     }
     const tip=joints.at(-1);
     if(tip&&w.kind!=='hammer'){
       const prev=joints.at(-2)?.pos||root,dir=V3.norm(V3.sub(tip.pos,prev));
       Object.assign(taper(a,tip.pos,V3.add(tip.pos,V3.scale(dir,2.5)),Math.min(tip.r,3),C.bone),{...tag,warpPart:'tip'});
     }
   }
   const hammer=parts.find(x=>x.part==='hammer');
   if(hammer)instance(a,hammerHead(lod),hammer.pos,flightBasis(0,0,Math.sin(phase)*.55),[1.4,1.4,1.4],{...tag,warpPart:'hammer'});
   for(const blade of parts.filter(x=>x.part==='blade')){
     const handed=blade.chain%2?-1:1,points=[[0,-5,0],[2*handed,-3,1],[4*handed,1,2],[3*handed,5,2],[0,6,2]].map(p=>V3.add(blade.pos,p));
     for(let i=0;i<points.length-1;i++){
       Object.assign(taper(a,points[i],points[i+1],1.3-i*.2,C.bone),{...tag,warpPart:'scythe-blade'});
       Object.assign(beam(a,V3.add(points[i],[0,0,.4]),V3.add(points[i+1],[0,0,.4]),.14,'#9cefd4',.85,L),{...tag,warpPart:'scythe-edge'});
     }
   }
   // Living jaws and iris movement stay inside the large body volume.
   if(w.schema===280){
     const eyeY=w.kind==='medusa'?1.8:5.8,eyeZ=w.kind==='medusa'?6.9:6.2;
     for(const side of w.kind==='medusa'?[0]:[-1,1]){
       const pos=V3.add(root,[(side*1.25+Math.sin(phase)*.15)*scale,eyeY*scale,eyeZ*scale]);
       Object.assign(part(a,'p260_bone',pos,[scale*.35,scale*.13,scale*.10],w.kind==='mantis'?'#9fffd0':C.eye,1,SPACE_IDENTITY,1,L),{...tag,warpPart:'eye'});
     }
     // Narrow luminous rib seams give the dark anatomy a readable rim against
     // the planet, without a screen-space outline or hiding approaching shots.
     const seam=w.kind==='hammer'?'#efbb7c':w.kind==='mantis'?'#8bdfc1':'#b4c3f1';
     for(const side of [-1,1])for(let i=0;i<(lod===2?1:3);i++){
       const p=V3.add(root,[side*scale*1.2,(2-i*1.55)*scale,4.35*scale]);
       const q=V3.add(root,[side*scale*(3.6-i*.25),(1.65-i*1.4)*scale,3.8*scale]);
       Object.assign(beam(a,p,q,scale*.065,seam,.72,L),{...tag,warpPart:'rib-light'});
     }
     // Energy veins pulse through the armour, not a static halo over the ship.
     if(lod<2)for(let i=0;i<3;i++){
       const pos=V3.add(root,[Math.sin(i*2.1)*scale*3,(-2+i*1.7)*scale,scale*4.1]);
       Object.assign(part(a,'octa',pos,[.3,.8,.25],C.violet,.5+.5*Math.sin(phase*2+i),SPACE_IDENTITY,1,L),{...tag,warpPart:'vein'});
     }
   }
   if((w.contactUntil||0)>(e.pursuit.clock||0))for(const j of parts.filter(x=>x.part!=='body').slice(-1))Object.assign(part(a,'octa',j.pos,[j.r*.6,j.r*.6,j.r*.6],C.warm,1,SPACE_IDENTITY,.45,L),{...tag,warpPart:'contact'});
   if(e.assist&&appendages.length&&w.age<1.5){const j=appendages.at(-1);Object.assign(part(a,'ring',j.pos,[j.r+1,j.r+1,.1],C.warm,.8,SPACE_IDENTITY,.45,L),{...tag,trainingCue:true});}
 }
 function ship(a,e,x,type,time,lod){
   const player=type==='player',b=player?flightBasis(x.yaw,x.pitch,x.bank):spaceBasisDir(x.vel||[0,0,-1]),scale=player?1:type==='fz'?1.2:.85;
   instance(a,player||type==='fz'?base.model(type):escortFighter(type,lod),x.pos,b,[scale,scale,scale],{pursuit260:true,shipRole:type},x.hit>0);
   const m=spaceModel(x.pos,[scale,scale,scale],b),color=player?C.cyan:type==='fz'?C.warm:'#eb8165';
   for(const side of [-1,1]){
     const pos=spacePoint(m,[side*(player||type==='fz'?3.57:2),.12,player||type==='fz'?-6.0:-4.0]);
     part(a,'p260_horn',pos,[.48,.4,1.9+Math.sin(time*22+(x.id||0))*.12],color,1,b,1,L);
   }
   if(x.muzzleFlash>0)for(const side of [-1,1])Object.assign(part(a,'octa',V3.add(x.pos,[side*2,.15,4.5]),[.6,.6,1.4],C.warm,1,SPACE_IDENTITY,1,L),{pursuit260:true,muzzleFlash:true});
   if(e.assist&&x.telegraph>0)Object.assign(part(a,'octa',V3.add(x.pos,[0,0,4]),[.75,.75,.75],C.warm,1,SPACE_IDENTITY,1,L),{trainingCue:true});
 }
 function gate(a,e,g,lod){
   const o=P.gateOpening(e,g),circle=o.shape==='circle'||Number.isFinite(g.gapRadius);
   if(circle){const r=o.radius||g.gapRadius,t=g.ringThickness||4.5;instance(a,ring(r,t,lod),[o.x,o.y,g.pos[2]],SPACE_IDENTITY,[1,1,1],{pursuit260:true,ringGate:g.id,aperture:r,ringThickness:t});}
   else{
     // A pre-2.6 save may contain a rectangle already in the flight path.
     // Preserve its physical form until passed; new gates are all circles.
     for(const p of P.gateParts(e,g))Object.assign(part(a,'p220_armour',p.pos,p.size,C.steel),{pursuit260:true,legacyGate:g.id});
   }
 }
 function scene(e,time,fx){
   if(!active(e))return old.scene(e,time,fx);
   const a=[],s=e.pursuit,p=e.player,w=ARCADE.canvas?.getBoundingClientRect?.().width||1280;
   const lod=w<900||!fx||!ARCADE.renderer?.gl?1:0,clock=s.clock;a.compact=lod>0;
   part(a,'sphere',V3.add(p.pos,[1200,550,-3500]),[950,950,950],'#4f6c74',.03,SPACE_IDENTITY,1,25);
   part(a,'ring',V3.add(p.pos,[1200,550,-3500]),[1450,300,1450],C.gold,.07,flightBasis(0,.35,.2),.7,26);
   for(const r of e.asteroids){
     if(r.dead||V3.len(V3.sub(r.pos,p.pos))>1000||r.pos[2]>p.pos[2]+45)continue;
     const near=V3.len(V3.sub(r.pos,p.pos))<235,b=flightBasis(r.phase+clock*.018,r.phase*.2,r.phase*.7);
     part(a,near&&!lod?'p220_rock'+r.variant:'rock'+r.variant,r.pos,[r.r,r.r,r.r],r.hit>0?'#d4ab78':r.wall?'#46545e':'#8b8479',0,b,1,S);
   }
   for(const g of s.gates||[]){const d=g.distance-s.travel;if(d>=-42&&d<1050)gate(a,e,g,lod||d>350?1:0);}
   for(const w of (P.warpEntities?.(e)||s.warpEntities||[]).slice(0,2)){
     const distance=V3.len(V3.sub(w.pos,p.pos));
     if(w.pos[2]<p.pos[2]+50&&distance<650)warp(a,e,w,lod&&w.distance-s.travel>300?2:lod);
   }
   for(const x of e.enemies)if(!x.dead)ship(a,e,x,['jammer','heavy'].includes(x.role)?x.role:'interceptor',clock,lod);
   if(fx){
     for(const f of (s.visual220?.fragments||[]).slice(0,lod?24:48))part(a,'p220_fragment'+f.variant+'_'+f.piece,f.pos,[f.r,f.r,f.r],f.life>3?'#caa276':'#7b766d',f.life>3?.12:0,flightBasis(...f.rotation),clamp(f.life/.5),S);
     for(const q of e.particles.slice(0,lod?40:90))part(a,'octa',q.pos,[q.size*.32,q.size*.32,q.size*.8],q.color,1,spaceBasisDir(q.vel),Math.min(1,q.life/q.max),L);
     for(let i=0;i<18;i++){const z=p.pos[2]-((s.travel*.8+i*37)%500),x=s.origin[0]+(i%2?1:-1)*(61+i%3*9),y=s.origin[1]+(i%5-2)*19;beam(a,[x,y,z],[x,y,z+8],.025,'#7297b6',.65,L);}
   }
   for(const b of [...e.bullets,...e.hostile]){const hostile=b.pursuitShot;Object.assign(part(a,'box',b.pos,[hostile?.28:.1,hostile?.28:.1,hostile?4.5:2.8],hostile?'#ffba77':b.color,1,spaceBasisDir(b.vel),1,L),{pursuit260:true,hostileShot:!!hostile});}
   ship(a,e,s.leader,'fz',clock,lod);ship(a,e,p,'player',clock,lod);
   a.pursuit220=true;a.pursuit260=true;return a;
 }
 spaceScene=scene;
 spaceCamera=function(e,time){
   const cam=old.camera(e,time);if(!active(e))return cam;
   const rect=ARCADE.canvas?.getBoundingClientRect?.(),portrait=rect&&rect.height>rect.width*1.15;
   // A portrait camera needs enough horizontal space to read the entire
   // apparition beside its hammer, instead of seeing only a cropped weapon.
   return {...cam,fov:portrait?Math.max(cam.fov,1.37):cam.fov,pursuit220:true,pursuit260:true};
 };
 globalThis.CITADEL_PURSUIT_VIEW=Object.freeze({...base,version:VERSION,build:'280',
   scene,ringModel:ring,warpModel:leviathan,hammerModel:hammerHead,enemyModel:escortFighter,
   stats:()=>({...base.stats(),visualVersion:VERSION,templates260:templates.size}),
   inspect:e=>({...base.inspect(e),visualVersion:VERSION,warps:(P.warpEntities?.(e)||e?.pursuit?.warpEntities||[]).length,maxWarps:2}),
   renderWarp:(a,e,w,lod=1)=>warp(a,e,w,lod),
   testAssets:()=>({...base.testAssets(),ring:ring(16,4.5,1),hammer:leviathan('hammer',1),tentacle:leviathan('tentacle',1)})});
})();
