/* Citadel 2.7.0 — ground machines, physical industrial decks and lift travel.
 * Rendering consumes the saved mission/actor pose. It never advances AI,
 * changes a cell, moves a platform, changes health or installs a frame owner.
 * First-base introduction and all existing human face/uniform rigs are kept.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_BASE_MISSIONS_VIEW?.version==='2.7.0'||!globalThis.CITADEL_BASE_VIEW)return;
 const VERSION='2.7.0',TAU=Math.PI*2,old={interior:citadelInterior,camera:spaceCamera,draw:spaceDrawCPU,hud:drawBoardHUD,mobile:drawMobileGameHUD,final:drawFinaleHUD};
 const templates=new Map(),architecture=new Map(),EMPTY_CELLS=new Map();
 const C={black:'#13232d',dark:'#263b49',steel:'#6c8591',edge:'#c3d1cf',ivory:'#ddd8be',gold:'#c3a065',red:'#943d43',orange:'#f5a751',cyan:'#88e9e2',blue:'#6dafe0',purple:'#ac8ec8'};
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 const active=e=>!!e?.board?.missions270&&e.board.missions270.schema===1&&!e.crash&&(!e.finale||e.finale.phase==='maze')&&citadelInside(e);
 const advanced=e=>active(e)&&(e.board.missions270.tier??e.stage)>0;
 const detail=fx=>fx!==false&&!!ARCADE.renderer?.gl&&(ARCADE.canvas?.getBoundingClientRect?.().width||ARCADE.canvas?.width||390)>=900&&!(typeof isMobileLayout==='function'&&isMobileLayout());
 const own=x=>!!x.missions270&&['dog','mech'].includes(x.missions270.kind);
 function mesh(name,v,f){SPACE_MESH[name]=spaceMesh(v,f);}
 // Low poly pieces are genuinely small geometries. Their profile, metal edge
 // and joint spacing carry detail instead of tiny hidden subdivisions.
 {const shape=[[-.72,-1],[.72,-1],[1,-.72],[1,.72],[.72,1],[-.72,1],[-1,.72],[-1,-.72]],v=[],f=[];
  for(const y of [-1,1])for(const [x,z]of shape)v.push([x,y,z]);for(let i=0;i<8;i++)f.push([i,(i+1)%8,(i+1)%8+8,i+8]);f.push([7,6,5,4,3,2,1,0],[8,9,10,11,12,13,14,15]);mesh('b270_plate',v,f.map(face=>face.reverse()));
  const av=[],af=[];for(const [y,s]of [[-1,.72],[-.60,1],[.57,1],[1,.73]])for(const [x,z]of shape)av.push([x*s,y,z*s]);
  for(let ring=0;ring<3;ring++)for(let i=0;i<8;i++){const j=(i+1)%8;af.push([ring*8+i,(ring+1)*8+i,(ring+1)*8+j,ring*8+j]);}af.push([0,1,2,3,4,5,6,7],[31,30,29,28,27,26,25,24]);mesh('b270_armour',av,af);
 }
 function tube(name,sides){const v=[],f=[];for(const z of [-1,1])for(let i=0;i<sides;i++){const a=i/sides*TAU;v.push([Math.cos(a),Math.sin(a),z]);}for(let i=0;i<sides;i++){const j=(i+1)%sides;f.push([i,j,j+sides,i+sides]);}f.push(Array.from({length:sides},(_,i)=>sides-1-i),Array.from({length:sides},(_,i)=>sides+i));mesh(name,v,f);}
 tube('b270_tube',6);tube('b270_tube_detail',10);
 {const v=[[0,0,0]],f=[];for(let i=0;i<32;i++){const a=i/32*TAU;v.push([Math.cos(a),0,Math.sin(a)]);}for(let i=1;i<=32;i++)f.push([0,i%32+1,i]);mesh('b270_disc',v,f);}
 mesh('b270_floor',[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],[[3,2,1,0]]);
 {const v=[],f=[];for(const [y,r,drift]of [[0,1,0],[.65,.78,-.20],[1.15,.38,.10]])for(let i=0;i<5;i++){const a=i/5*TAU;v.push([Math.cos(a)*r+drift,y,Math.sin(a)*r]);}v.push([-.28,1.9,.06]);for(let ring=0;ring<2;ring++)for(let i=0;i<5;i++)f.push([ring*5+i,ring*5+(i+1)%5,(ring+1)*5+(i+1)%5,(ring+1)*5+i]);for(let i=0;i<5;i++)f.push([10+i,10+(i+1)%5,15]);mesh('b270_flame',v,f);}
 {const v=[[0,0,0]],f=[];for(let i=0;i<24;i++){const a=i/24*TAU,r=.86+(i%3)*.07;v.push([Math.cos(a)*r,0,Math.sin(a)*r]);}for(let i=1;i<=24;i++)f.push([0,i%24+1,i]);mesh('b270_scorch',v,f);}
 const part=(a,name,p,s,col,feature,em=0,b=SPACE_IDENTITY,alpha=1)=>{const it=citadelItem(name,p,s,col,em,b,alpha);it.base270=feature;it.baseFeature='base270-'+feature;a.push(it);return it;};
 function beam(a,p,q,r,color,feature,em=0,alpha=1,detailed=false){return part(a,detailed?'b270_tube_detail':'b270_tube',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5],color,feature,em,spaceBasisDir(V3.sub(q,p)),alpha);}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];build(a);const result=stationMerge(a,'b270_'+key);templates.set(key,result);return result;}
 function instance(a,model,pos,basis,s,tag){const transform=spaceModel(pos,s,basis);for(const src of model)a.push({...src,pos,model:transform,baseActor:true,base270:tag.kind,base270EntityId:tag.id,base270Lod:tag.lod,baseStatic:false});}
 function dogBody(high){return compile('dog-body-'+Number(high),a=>{
  part(a,'b270_plate',[0,1.02,-.13],[.43,.39,1.05],C.black,'chassis');
  part(a,'b270_armour',[0,1.29,.24],[.57,.28,.69],C.red,'chest-armour');
  part(a,'b270_armour',[0,1.17,-.73],[.46,.21,.45],C.steel,'rear-armour');
  for(const side of [-1,1]){
   part(a,'box',[side*.5,1.34,.13],[.045,.12,.36],C.ivory,'armour-edge');
   part(a,'b270_plate',[side*.43,1.22,-.43],[.12,.2,.49],C.dark,'radiator');
   part(a,'box',[side*.565,1.22,-.43],[.025,.07,.38],C.orange,'radiator-core',.45);
   if(high)for(let j=0;j<4;j++)part(a,'box',[side*.59,1.22,-.74+j*.2],[.025,.15,.035],C.edge,'radiator-fin');
  }
  for(let j=0;j<(high?6:3);j++)part(a,'box',[0,1.48,-.90+j*(high?.22:.44)],[.24,.04,.075],C.gold,'spine-plate');
  part(a,'b270_plate',[0,.84,.74],[.40,.35,.37],C.steel,'neck');
  beam(a,[0,1.1,-1.0],[.0,1.4,-1.48],.09,C.steel,'tail');beam(a,[.0,1.4,-1.48],[.0,1.53,-1.82],.055,C.gold,'tail');
 });}
 function dogHead(high){return compile('dog-head-'+Number(high),a=>{
  part(a,'b270_armour',[0,1.39,.93],[.38,.30,.38],C.ivory,'head-armour');
  part(a,'b270_plate',[0,1.17,1.25],[.27,.20,.47],C.black,'muzzle');
  part(a,'box',[0,1.25,1.68],[.24,.09,.045],C.steel,'nose');
  part(a,'b270_plate',[0,.98,1.24],[.28,.07,.37],C.steel,'jaw');
  for(const side of [-1,1]){
   part(a,'b270_plate',[side*.29,1.71,.84],[.09,.25,.15],C.dark,'ear');
   part(a,'box',[side*.356,1.43,1.03],[.025,.055,.12],'#ff774f','eye',1);
   part(a,'box',[side*.20,1.07,1.52],[.035,.09,.04],C.ivory,'fang');
   if(high)part(a,'box',[side*.24,1.66,.94],[.045,.10,.09],C.gold,'brow-rivet');
  }
 });}
 function dog(a,x,time,high,fx){const m=x.missions270,duty=x.duty||{},gait=fx===false?0:m.gait??duty.gait??0,speed=clamp((m.speed??duty.speed??0)/7),dash=m.phase==='dash',yaw=Number.isFinite(x.yaw)?x.yaw:Math.atan2(m.heading?.[0]||0,m.heading?.[2]||1),b=stationYaw(yaw),origin=V3.add(x.pos,[0,dash?-.13:Math.cos(gait*2)*.025*speed,0]),matrix=spaceModel(origin,[1,1,1],b),local=p=>spacePoint(matrix,p),tag={id:x.id,kind:'grounddog',lod:high?'detail':'compatible'};
  instance(a,dogBody(high),origin,b,[1,1,1],tag);instance(a,dogHead(high),origin,b,[1,1,1],tag);
  const limb=(from,to,r,c,feature)=>{const it=beam(a,local(from),local(to),r,c,feature,0,1,high);Object.assign(it,{baseActor:true,base270EntityId:x.id,base270Lod:tag.lod});};
  for(const side of [-1,1])for(const front of [-1,1]){
   const phase=gait+(side===front?0:Math.PI),stride=Math.sin(phase)*(dash?.52:.38)*speed,lift=Math.max(0,Math.cos(phase))*.24*speed;
   const hip=[side*.43,1.02,front*.68],knee=[side*.65,.57+lift*.15,front*.72+(front===1?-.22:.25)+stride*.38],foot=[side*.62,.105+lift,front*.79+stride];
   limb(hip,knee,.125,C.steel,'dog-upper-leg');limb(knee,foot,.09,C.gold,'dog-lower-leg');
   part(a,'b270_plate',local(knee),[.17,.16,.19],C.dark,'dog-knee',0,b).baseActor=true;
   part(a,'b270_plate',local([foot[0],foot[1],foot[2]+.12]),[.19,.105,.27],C.black,'dog-foot',0,b).baseActor=true;
   part(a,'box',local([foot[0],foot[1]+.10,foot[2]+.21]),[.14,.022,.11],C.ivory,'dog-toes',0,b).baseActor=true;
   if(high)limb([hip[0]*.87,hip[1]-.09,hip[2]],[knee[0]*.95,knee[1]+.03,knee[2]],.045,C.ivory,'dog-piston');
  }
  part(a,'b270_disc',V3.add(x.pos,[0,.014,0]),[.79,1,1.45],'#0c1722','machine-shadow',0,SPACE_IDENTITY,.32);
 }
 function mechBody(high){return compile('mech-body-'+Number(high),a=>{
  part(a,'b270_plate',[0,3.55,0],[.83,.45,.5],C.dark,'waist');
  part(a,'b270_armour',[0,4.58,0],[1.08,.84,.62],C.black,'torso');
  for(const side of [-1,1])part(a,'b270_armour',[side*.49,4.72,.39],[.48,.69,.49],C.red,'breastplate');
  part(a,'b270_armour',[0,4.89,.82],[.27,.43,.14],C.ivory,'sternum');
  part(a,'box',[0,4.89,.97],[.055,.28,.026],C.orange,'reactor-sliver',.7);
  part(a,'b270_plate',[0,4.56,-.82],[.76,.79,.29],C.steel,'reactor-pack');
  for(const side of [-1,1]){
   part(a,'b270_armour',[side*1.18,5.03,0],[.55,.57,.73],C.ivory,'pauldron');
   part(a,'b270_plate',[side*1.19,5.59,.02],[.34,.035,.46],C.gold,'pauldron-rim');
   beam(a,[side*1.3,4.82,-.26],[side*1.3,4.82,.32],.30,C.dark,'shoulder-bearing');
   part(a,'b270_tube',[side*1.3,4.82,.34],[.15,.15,.035],C.gold,'shoulder-hub');
   part(a,'b270_plate',[side*.67,4.66,.72],[.22,.5,.12],C.steel,'chest-plate');
   part(a,'b270_tube',[side*.45,4.55,-1.13],[.22,.22,.08],C.dark,'reactor-vent');
   part(a,'box',[side*.45,4.55,-1.23],[.1,.23,.025],C.orange,'reactor-heat',.45);
   if(high)for(let k=0;k<4;k++){
    part(a,'box',[side*1.66,4.70+k*.2,.15],[.035,.035,.33],C.gold,'shoulder-vent');
    part(a,'box',[side*.67,4.4+k*.2,.87],[.12,.022,.02],C.edge,'plate-rivet');
   }
  }
  part(a,'b270_armour',[0,5.90,.10],[.50,.48,.45],C.steel,'helmet');
  part(a,'b270_armour',[0,6.28,.03],[.54,.16,.45],C.ivory,'helmet-crest');
  part(a,'box',[0,5.94,.56],[.40,.11,.04],C.black,'visor');
  for(const side of [-1,1])part(a,'box',[side*.21,5.94,.61],[.12,.045,.025],'#ffc878','optic',1);
  part(a,'b270_plate',[0,5.63,.43],[.29,.16,.18],C.dark,'breather');
  for(let k=-1;k<=1;k++)part(a,'box',[k*.13,5.64,.62],[.025,.1,.025],C.gold,'breather-grille');
  for(const side of [-1,1])beam(a,[side*.36,3.96,.35],[side*.63,3.66,.24],.10,C.gold,'waist-piston');
 });}
 function cannon(high){return compile('mech-cannon-'+Number(high),a=>{
  part(a,'b270_plate',[0,0,-.50],[.38,.39,.74],C.dark,'cannon-body');
  part(a,'b270_plate',[0,.26,-.57],[.34,.15,.58],C.ivory,'cannon-armour');
  part(a,high?'b270_tube_detail':'b270_tube',[0,0,.43],[.25,.25,.75],C.steel,'cannon-barrel');
  for(let i=0;i<(high?5:3);i++)part(a,high?'b270_tube_detail':'b270_tube',[0,0,.0+i*(high?.22:.44)],[.33,.33,.06],i%2?C.gold:C.dark,'cannon-coil');
  part(a,'b270_tube',[0,0,1.18],[.32,.32,.12],C.ivory,'cannon-muzzle');
  part(a,'b270_tube',[0,0,1.31],[.21,.21,.035],C.cyan,'cannon-aperture',.55);
  part(a,'box',[.40,-.02,-.45],[.055,.19,.45],C.red,'cannon-feed');
 });}
 function mech(a,x,time,high,fx){const m=x.missions270,duty=x.duty||{},yaw=Number.isFinite(x.yaw)?x.yaw:0,b=stationYaw(yaw),gait=fx===false?0:m.gait??duty.gait??0,speed=clamp((m.speed??duty.speed??0)/4),tag={id:x.id,kind:'mech',lod:high?'detail':'compatible'},origin=V3.add(x.pos,[0,Math.cos(gait*2)*.045*speed,0]),model=spaceModel(origin,[1,1,1],b),local=p=>spacePoint(model,p);
  instance(a,mechBody(high),origin,b,[1,1,1],tag);
  for(const side of [-1,1]){
   const stride=Math.sin(gait+(side===1?0:Math.PI))*.58*speed,lift=Math.max(0,Math.cos(gait+(side===1?0:Math.PI)))*.30*speed;
   const hip=[side*.56,3.45,0],knee=[side*.78,1.75+lift*.25,.24+stride*.4],foot=[side*.81,.22+lift,.20+stride];
   beam(a,local(hip),local(knee),.32,C.dark,'mech-thigh',0,1,high).baseActor=true;beam(a,local(knee),local(foot),.24,C.steel,'mech-shin',0,1,high).baseActor=true;
   beam(a,local([knee[0]-.39,knee[1],knee[2]]),local([knee[0]+.39,knee[1],knee[2]]),.27,C.steel,'mech-knee-bearing').baseActor=true;
   part(a,'b270_armour',local([knee[0],knee[1],knee[2]+.27]),[.42,.48,.24],C.ivory,'mech-knee',0,b).baseActor=true;
   part(a,'b270_armour',local([foot[0],foot[1]+.43,foot[2]-.04]),[.32,.48,.30],C.red,'mech-greave',0,b).baseActor=true;
   part(a,'b270_plate',local([foot[0],foot[1],foot[2]+.32]),[.47,.22,.63],C.dark,'mech-foot',0,b).baseActor=true;
   part(a,'box',local([foot[0],foot[1]+.22,foot[2]+.62]),[.40,.035,.25],C.ivory,'mech-toes',0,b).baseActor=true;
   if(high)beam(a,local([hip[0]*1.22,2.94,-.2]),local([knee[0]*1.11,1.93,knee[2]-.14]),.09,C.gold,'mech-piston',0,1,true).baseActor=true;
   const actual=m.beams?.[side===-1?0:1],muzzle=actual?.origin||local([side*1.43,3.1,1.2]),toward=actual?.to||V3.add(muzzle,V3.scale(b.f,12)),dir=V3.norm(V3.sub(toward,muzzle)),gunBasis=spaceBasisDir(dir),gunPos=V3.sub(muzzle,V3.scale(dir,1.34));
   const shoulder=local([side*1.25,4.95,0]),elbow=local([side*1.63,3.69,-.17]);
   beam(a,shoulder,elbow,.25,C.steel,'mech-upper-arm',0,1,high).baseActor=true;beam(a,elbow,V3.sub(gunPos,V3.scale(dir,.15)),.22,C.dark,'mech-forearm',0,1,high).baseActor=true;
   instance(a,cannon(high),gunPos,gunBasis,[1,1,1],tag);
  }
  part(a,'b270_disc',V3.add(x.pos,[0,.015,0]),[1.43,1,1.35],'#09131c','machine-shadow',0,SPACE_IDENTITY,.35);
 }
 function laser(a,from,to,width,feature,color=C.cyan,high=false){
  if(!Array.isArray(from)||!Array.isArray(to)||!from.every(Number.isFinite)||!to.every(Number.isFinite))return;
  // Width is the actual damaging beam radius. Bright shell and central core
  // share the exact same endpoints, including collision/LOS truncation.
  const shell=beam(a,from,to,width,color,feature,1,.30,high);shell.base270Beam={from:from.slice(),to:to.slice(),radius:width};
  beam(a,from,to,Math.max(.035,width*.24),'#e5ffff',feature+'-core',1,1,high);
  part(a,'octa',to,[width*1.3,width*1.3,width*1.3],C.ivory,feature+'-impact',1,SPACE_IDENTITY,.85);
 }
 function buildArchitecture(b,high){
  const state=b.missions270,tier=state.tier??0,key=VERSION+'_'+String(b.definition.layoutId||'base-'+tier)+'_'+Number(high);if(architecture.has(key))return architecture.get(key);
  const chunks=new Map(),holes=new Set((state.hazards||[]).filter(x=>x.type==='breach').flatMap(x=>(x.removedCells||[]).map(p=>stationCellKey(p[0],p[1]))));
  const add=(name,p,s,col,feature,em=0,basis=SPACE_IDENTITY,alpha=1)=>{const k=Math.floor(p[0]/16)+':'+Math.floor(p[2]/16);let chunk=chunks.get(k);if(!chunk){chunk={center:[Math.floor(p[0]/16)*16+8,0,Math.floor(p[2]/16)*16+8],items:[]};chunks.set(k,chunk);}return part(chunk.items,name,p,s,col,feature,em,basis,alpha);};
  const ruin=tier===4,floor=ruin?['#27333d','#2c3c46']:['#2c424f','#304956'];
  for(const cell of b.cells.values()){
   const x=cell.x*4,z=cell.z*4;add('b270_floor',[x,-.01,z],[1.965,1,1.965],floor[Math.abs(cell.x+cell.z)%2],'floor');
   if((cell.x+cell.z)%3===0){add('box',[x,.003,z-1.45],[1.27,.012,.035],ruin?'#52636a':'#839993','floor-inlay');if(high)add('box',[x-1.50,.004,z],[.025,.012,1.30],C.dark,'floor-inlay');}
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const neighbor=stationCellKey(cell.x+dx,cell.z+dz);if(b.cells.has(neighbor))continue;const horizontal=dz!==0,border=[x+dx*2,0,z+dz*2],opening=holes.has(neighbor);
    if(opening){
     add('box',[border[0],-2.25,border[2]],horizontal?[2.02,2.25,.13]:[.13,2.25,2.02],C.black,'breach-wall');
     add('box',[border[0],-.08,border[2]],horizontal?[2.04,.14,.16]:[.16,.14,2.04],C.steel,'breach-lip');
     add('box',[border[0],.065,border[2]],horizontal?[1.80,.028,.055]:[.055,.028,1.80],C.orange,'breach-edge',.55);
     for(const s of [-1,1])add('box',[border[0]+(horizontal?s*1.24:0),-1.55,border[2]+(horizontal?0:s*1.24)],horizontal?[.08,1.4,.2]:[.2,1.4,.08],C.steel,'breach-strut');
     if((cell.x+cell.z)%2===0){add('octa',[border[0]+dx*.27,-.50,border[2]+dz*.27],horizontal?[.86,.50,.50]:[.50,.50,.86],C.steel,'broken-deck');add('b270_tube',[border[0]+dx*.40,-1.30,border[2]+dz*.40],[.075,.075,.83],C.gold,'severed-conduit',0,flightBasis(0,Math.PI/2));}
     continue;
    }
    const near=dx===1||dz===1,height=near?1.08:3.15,skin=ruin?'#5b7079':'#8098a0';
    add('box',[border[0],height/2,border[2]],horizontal?[2.03,height/2,.17]:[.17,height/2,2.03],skin,'bulkhead');
    add('box',[border[0],.19,border[2]],horizontal?[2.04,.19,.23]:[.23,.19,2.04],C.dark,'wall-plinth');
    add('box',[border[0],height,border[2]],horizontal?[2.06,.055,.23]:[.23,.055,2.06],C.ivory,'wall-cap');
    if(!near&&(cell.x+cell.z)%2===0){
     add('box',[x+dx*1.78,2.53,z+dz*1.78],horizontal?[1.20,.055,.035]:[.035,.055,1.20],ruin?C.orange:C.cyan,'wall-lamp',.75);
     for(const s of [-1,1])add('box',[border[0]+(horizontal?s*1.84:0),height*.5,border[2]+(horizontal?0:s*1.84)],[.085,height*.49,.085],C.dark,'wall-rib');
    }
   }
  }
  for(const key of holes){const [x,z]=key.split(',').map(Number);if(Number.isFinite(x)&&Number.isFinite(z))add('box',[x*4,-4.55,z*4],[1.98,.14,1.98],'#0b1923','breach-bottom');}
  for(const c of b.crates||[]){
   const cabinet=c.kind==='cabinet'||c.kind==='rack',console=c.kind==='console',height=Number(c.height)||(cabinet?2.65:console?1.20:1.65),col=ruin?'#53636c':C.steel;
   add('b270_plate',[c.x,height/2,c.z],[c.w,height/2,c.h],col,'physical-cover');add('box',[c.x,height+.045,c.z],[c.w*.96,.035,c.h*.96],C.edge,'cover-cap');
   if(cabinet){for(let k=0;k<4;k++){add('box',[c.x,.44+k*.52,c.z+c.h+.02],[c.w*.78,.17,.025],C.black,'rack-slot');add('box',[c.x+c.w*.65,.44+k*.52,c.z+c.h+.06],[.045,.07,.02],k%2?C.cyan:C.gold,'rack-light',.45);}}
   else {add('box',[c.x,height+.085,c.z],[c.w*.72,.02,c.h*.63],C.dark,'cover-control');add('box',[c.x,height+.11,c.z],[c.w*.44,.02,c.h*.26],ruin?C.orange:C.cyan,'cover-screen',.35);}
  }
  for(const room of b.definition.rooms||[]){const core=room.core;if(!core)continue;const x=core.x,z=core.z,w=core.w,h=core.h;
   add('box',[x,.62,z],[w,.62,h],C.dark,'physical-core');const reactor=room.plan==='reactor'||b.definition.theme==='reactor';
   if(reactor){add('b270_tube',[x,2.1,z],[Math.min(w*.65,2.4),Math.min(h*.65,2.4),1.25],C.steel,'reactor',0,flightBasis(0,Math.PI/2));for(const side of [-1,1])add('box',[x+side*Math.min(w*.48,2),2.45,z],[.12,.75,Math.min(h*.6,2.3)],C.cyan,'reactor-window',.7);}
   else {for(const side of [-1,1]){add('b270_plate',[x+side*w*.45,1.85,z],[w*.34,.65,h*.77],C.steel,'installation');for(let k=0;k<3;k++)add('box',[x+side*w*.45,1.45+k*.35,z+h*.78],[w*.25,.055,.025],k%2?C.ivory:C.cyan,'installation-display',.35);}}
  }
  for(const p of b.terminals){const q=V3.add(p,[0,0,-1.8]);add('b270_plate',V3.add(q,[0,.70,0]),[1.3,.70,.9],C.steel,'terminal');add('b270_plate',V3.add(q,[0,1.7,-.4]),[1.15,.70,.12],C.dark,'terminal-frame');add('box',V3.add(q,[0,1.43,.55]),[1,.035,.28],C.black,'terminal-keyboard');}
  const result=[];let index=0;for(const chunk of chunks.values()){const merged=stationMerge(chunk.items,'base270_arch_'+key+'_'+index++).map(it=>({...it,baseStatic:true,baseChunk:chunk.center,base270:'architecture',baseFeature:'base270-architecture'}));result.push({center:chunk.center,items:merged});}architecture.set(key,result);return result;
 }
 function fire(a,h,time,high,fx){const p=h.pos,r=h.radius||1.5;part(a,'b270_scorch',V3.add(p,[0,.022,0]),[r,1,r],'#20262b','fire-scorch');
  if(!h.active)return;const n=high?9:5,clock=fx===false?0:h.clock??time;
  for(let i=0;i<n;i++){const t=i*2.399963,rad=r*(.15+(i%3)*.24),at=V3.add(p,[Math.cos(t)*rad,.04,Math.sin(t)*rad]),height=(.65+r*.30)*(1+.14*Math.sin(clock*8+i));part(a,'b270_flame',at,[r*.22,height,r*.22],i%2?'#ef6d2d':'#ffac44','active-fire',1,stationYaw(t),.87);part(a,'b270_flame',at,[r*.11,height*.62,r*.11],'#ffe8a0','fire-core',1,stationYaw(t));beam(a,V3.add(p,[Math.cos(t)*rad,.035,Math.sin(t)*rad]),V3.add(p,[Math.cos(t+.2)*r*.83,.035,Math.sin(t+.2)*r*.83]),.035,C.orange,'floor-heat',.8);}
  if(fx)for(let i=0;i<(high?10:4);i++){const age=(clock*.7+i*.21)%1,t=i*2.399963;part(a,'box',V3.add(p,[Math.cos(t)*r*.5,age*2.5+.3,Math.sin(t)*r*.5]),[.025,.045,.025],C.orange,'ember',1,SPACE_IDENTITY,1-age);}
 }
 function systemModel(a,s,b,time,high){const state=b.missions270,moving=state.transport?.id===s.id?state.transport:null,type=s.type,used=s.state==='used';
  if(type==='lift'){
   const pos=moving?.pos||s.dockPos||s.pos,hw=s.halfExtents?.[0]||1.65,hh=s.halfExtents?.[1]||1.65,ready=(s.unlockAfter??0)<=b.completed.length,col=ready?C.cyan:C.gold;
   part(a,'b270_plate',V3.add(pos,[0,-.02,0]),[hw,.18,hh],C.steel,'lift-platform');
   part(a,'box',V3.add(pos,[0,.17,0]),[hw*.82,.025,hh*.82],C.dark,'lift-deck');
   for(const side of [-1,1]){
    part(a,'box',V3.add(pos,[side*(hw-.12),.22,0]),[.08,.035,hh-.14],C.ivory,'lift-border');part(a,'box',V3.add(pos,[0,.22,side*(hh-.12)]),[hw-.14,.035,.08],col,'lift-status',.55);
    part(a,'box',V3.add(pos,[side*(hw-.12),1.05,-hh+.12]),[.085,.90,.085],C.gold,'lift-stanchion');part(a,'box',V3.add(pos,[side*(hw-.12),1.95,-hh+.12]),[.12,.035,.12],col,'lift-light',.7);
   }
   part(a,'b270_plate',V3.add(pos,[hw-.35,.62,-hh+.35]),[.22,.62,.22],C.steel,'lift-console');part(a,'box',V3.add(pos,[hw-.35,1.27,-hh+.35]),[.20,.03,.20],col,'lift-console-status',.55);
   return;
  }
  const pos=s.pos,col=used?'#627b82':type==='coolant'?C.cyan:C.orange;
  part(a,'b270_plate',V3.add(pos,[0,.56,0]),[.65,.56,.54],C.dark,'system-console');part(a,'b270_plate',V3.add(pos,[0,1.20,-.19]),[.60,.36,.16],C.steel,'system-panel');part(a,'box',V3.add(pos,[0,1.25,.0]),[.42,.19,.025],col,'system-screen',used?.1:.55);
  if(type==='coolant'){for(const side of [-1,1])part(a,'b270_tube',V3.add(pos,[side*.62,.65,-.25]),[.20,.20,.55],C.ivory,'coolant-tank',0,flightBasis(0,Math.PI/2));}
  else {for(const side of [-1,1])part(a,'box',V3.add(pos,[side*.27,.57,.56]),[.10,.25,.035],C.gold,'power-contact');}
 }
 citadelInterior=function(e,time=0,fx=true){
  if(!advanced(e))return old.interior.apply(this,arguments);const b=e.board,s=b.missions270,high=detail(fx),center=b.camera||b.pos;
  // Private render projection prevents old cached ring-room architecture and
  // fallback human models for robots. Alive/room/HP are retained for clearance;
  // only the legacy renderer's distance culling sees the remote robot pose.
  const view=Object.create(e);view.board={...b,cells:EMPTY_CELLS,crates:[],definition:{...b.definition,rooms:[],addedLength:'view270-dynamic'},enemies:b.enemies.map(x=>own(x)?{...x,pos:[1e7,0,1e7]}:x)};
  let a=old.interior.call(this,view,time,fx);a=a.filter(it=>it.baseFeature!=='architecture');a.basesView=true;
  for(const chunk of buildArchitecture(b,high))if(distance(chunk.center,center)<44)a.push(...chunk.items);
  for(const x of b.enemies)if(!x.dead&&own(x)&&distance(x.pos,center)<37){if(x.missions270.kind==='dog')dog(a,x,time,high,fx);else mech(a,x,time,high,fx);
   for(const shot of x.missions270.beams||[])if(shot.active)laser(a,shot.origin,shot.to,shot.width||.45,'mech-laser',C.cyan,high);
   if(e.assist&&x.missions270.phase==='charge'){const heading=x.missions270.heading||[Math.sin(x.yaw),0,Math.cos(x.yaw)];beam(a,V3.add(x.pos,[0,.06,0]),V3.add(x.pos,V3.add(V3.scale(heading,6),[0,.06,0])),.025,C.gold,'training-aim',.5,.7);}
  }
  for(const h of s.hazards||[]){if(h.type==='fire'&&distance(h.pos,center)<36)fire(a,h,time,high,fx);if(h.type==='laser-grid'&&h.active)laser(a,h.from,h.to,h.width||.30,'active-grid',C.purple,high);}
  for(const system of s.systems||[])if(distance(system.pos,center)<38||s.transport?.id===system.id)systemModel(a,system,b,time,high);
  return a;
 };
 spaceCamera=function(e,time=0,preview=false){const cam=old.camera(e,time,preview);if(!advanced(e))return cam;const b=e.board,fire=b.missions270.hazards?.filter(x=>x.type==='fire'&&x.active).sort((a,c)=>distance(a.pos,b.pos)-distance(c.pos,b.pos))[0];
  return {...cam,base270:true,...(fire&&distance(fire.pos,b.pos)<16?{lights:[...(cam.lights||[]).slice(0,2),{pos:V3.add(fire.pos,[0,2.2,0]),color:[1.7,.57,.18]}]}:{})};
 };
 // The older Canvas fallback allocated arrays for every world vertex, normal,
 // screen vertex and polygon on every frame. Retain its exact depth/lighting
 // rules, but reuse flat numeric storage; only transparent faces need sorting.
 // This path is scoped to new mission decks. Other game modes keep their draw.
 const raster270=new WeakMap(),world270=new WeakMap(),bounds270=new WeakMap(),light270=V3.norm([-.35,.85,.55]);
 let scratch270=new Float64Array(0),lastRaster270={};
 function visible270(it,cam,tx,ty){
  const mesh=SPACE_MESH[it.mesh],m=it.model;let bound=bounds270.get(mesh);
  if(!bound){const p=mesh.p;let lx=Infinity,ly=Infinity,lz=Infinity,hx=-Infinity,hy=-Infinity,hz=-Infinity;for(let i=0;i<p.length;i+=3){lx=Math.min(lx,p[i]);ly=Math.min(ly,p[i+1]);lz=Math.min(lz,p[i+2]);hx=Math.max(hx,p[i]);hy=Math.max(hy,p[i+1]);hz=Math.max(hz,p[i+2]);}bound={center:[(lx+hx)/2,(ly+hy)/2,(lz+hz)/2],radius:Math.hypot(hx-lx,hy-ly,hz-lz)/2};bounds270.set(mesh,bound);}
  const p=spacePoint(m,bound.center),dx=p[0]-cam.pos[0],dy=p[1]-cam.pos[1],dz=p[2]-cam.pos[2],z=dx*cam.f[0]+dy*cam.f[1]+dz*cam.f[2],radius=bound.radius*Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
  return z+radius>=.35&&Math.abs(dx*cam.r[0]+dy*cam.r[1]+dz*cam.r[2])<=z*tx+radius*Math.sqrt(1+tx*tx)&&Math.abs(dx*cam.u[0]+dy*cam.u[1]+dz*cam.u[2])<=z*ty+radius*Math.sqrt(1+ty*ty);
 }
 function transformed270(it){
  const mesh=SPACE_MESH[it.mesh];if(it.baseStatic&&world270.has(it))return world270.get(it);
  const count=mesh.p.length/9,length=count*15,m=it.model,p=mesh.p,n=mesh.n;
  let out;if(it.baseStatic)out=new Float64Array(length);else{if(scratch270.length<length)scratch270=new Float64Array(length);out=scratch270;}
  const sx=Math.max(1e-9,m[0]**2+m[1]**2+m[2]**2),sy=Math.max(1e-9,m[4]**2+m[5]**2+m[6]**2),sz=Math.max(1e-9,m[8]**2+m[9]**2+m[10]**2);
  for(let i=0,j=0;i<p.length;i+=9,j+=15){
   for(let k=0;k<9;k+=3){const x=p[i+k],y=p[i+k+1],z=p[i+k+2];out[j+k]=m[0]*x+m[4]*y+m[8]*z+m[12];out[j+k+1]=m[1]*x+m[5]*y+m[9]*z+m[13];out[j+k+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}
   const nx=n[i]/sx,ny=n[i+1]/sy,nz=n[i+2]/sz,x=m[0]*nx+m[4]*ny+m[8]*nz,y=m[1]*nx+m[5]*ny+m[9]*nz,z=m[2]*nx+m[6]*ny+m[10]*nz,len=Math.hypot(x,y,z);
   out[j+9]=len>1e-8?x/len:0;out[j+10]=len>1e-8?y/len:0;out[j+11]=len>1e-8?z/len:-1;
   out[j+12]=(out[j]+out[j+3]+out[j+6])/3;out[j+13]=(out[j+1]+out[j+4]+out[j+7])/3;out[j+14]=(out[j+2]+out[j+5]+out[j+8])/3;
  }
  const result={data:out,length};if(it.baseStatic)world270.set(it,result);return result;
 }
 function triangle270(surface,ax,ay,az,bx,by,bz,cx,cy,cz,red,green,blue,alpha){
  let area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  if(area<0){let t=bx;bx=cx;cx=t;t=by;by=cy;cy=t;t=bz;bz=cz;cz=t;area=-area;}if(area<.01)return;
  const w=surface.w,h=surface.h,pixels=surface.image.data,depth=surface.depth;
  const minX=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),maxX=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5)),minY=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),maxY=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
  const dx0=by-cy,dx1=cy-ay,dx2=ay-by,dy0=cx-bx,dy1=ax-cx,dy2=bx-ax;
  let row0=(cx-bx)*(minY+.5-by)-(cy-by)*(minX+.5-bx),row1=(ax-cx)*(minY+.5-cy)-(ay-cy)*(minX+.5-cx),row2=(bx-ax)*(minY+.5-ay)-(by-ay)*(minX+.5-ax);
  const iz0=az/area,iz1=bz/area,iz2=cz/area,inv=1-alpha;
  for(let y=minY;y<=maxY;y++,row0+=dy0,row1+=dy1,row2+=dy2){
   let e0=row0,e1=row1,e2=row2,index=y*w+minX;
   for(let x=minX;x<=maxX;x++,index++,e0+=dx0,e1+=dx1,e2+=dx2){
    if(e0<0||e1<0||e2<0)continue;const z=e0*iz0+e1*iz1+e2*iz2;if(z<=depth[index]+.00000005)continue;
    const offset=index*4;if(alpha===1){depth[index]=z;pixels[offset]=red;pixels[offset+1]=green;pixels[offset+2]=blue;}
    else{pixels[offset]=pixels[offset]*inv+red*alpha;pixels[offset+1]=pixels[offset+1]*inv+green*alpha;pixels[offset+2]=pixels[offset+2]*inv+blue*alpha;}
   }
  }
 }
 spaceDrawCPU=function(c,items,cam,w,h){
  if(!cam.base270)return old.draw.apply(this,arguments);const started=performance.now();let surface=raster270.get(c);
  if(!surface||surface.w!==w||surface.h!==h){
   surface={w,h,image:c.createImageData(w,h),depth:new Float32Array(w*h),background:new Uint8ClampedArray(w*h*4),pool:[],transparent:[]};
   const bg=surface.background;for(let y=0;y<h;y++){const t=y/h,r=Math.round(20-12*t),g=Math.round(43-18*t),b=Math.round(54-19*t);for(let x=0,i=y*w*4;x<w;x++,i+=4){bg[i]=r;bg[i+1]=g;bg[i+2]=b;bg[i+3]=255;}}raster270.set(c,surface);
  }
  surface.image.data.set(surface.background);surface.depth.fill(0);surface.transparent.length=0;
  const ty=Math.tan(cam.fov/2),tx=ty*w/h,f=h/(2*ty),cp=cam.pos,cf=cam.f,cr=cam.r,cu=cam.u;let tested=0,visible=0,pooled=0,culled=0;
  for(const it of items){
   if(it.baseActor){const p=spaceProject(V3.add(it.pos,[0,1.5,0]),cam,w,h);if(p.z<.5||p.x< -150||p.x>w+150||p.y< -160||p.y>h+160)continue;}
   if(!visible270(it,cam,tx,ty)){culled++;continue;}
   const transformed=transformed270(it),v=transformed.data;
   for(let j=0;j<transformed.length;j+=15){
    tested++;if(v[j+9]*(cp[0]-v[j+12])+v[j+10]*(cp[1]-v[j+13])+v[j+11]*(cp[2]-v[j+14])<-.001)continue;
    const adx=v[j]-cp[0],ady=v[j+1]-cp[1],adz=v[j+2]-cp[2],bdx=v[j+3]-cp[0],bdy=v[j+4]-cp[1],bdz=v[j+5]-cp[2],cdx=v[j+6]-cp[0],cdy=v[j+7]-cp[1],cdz=v[j+8]-cp[2];
    const aZ=adx*cf[0]+ady*cf[1]+adz*cf[2],bZ=bdx*cf[0]+bdy*cf[1]+bdz*cf[2],cZ=cdx*cf[0]+cdy*cf[1]+cdz*cf[2];if(aZ<.35||bZ<.35||cZ<.35)continue;
    const ax=w/2+(adx*cr[0]+ady*cr[1]+adz*cr[2])*f/aZ,ay=h/2-(adx*cu[0]+ady*cu[1]+adz*cu[2])*f/aZ,bx=w/2+(bdx*cr[0]+bdy*cr[1]+bdz*cr[2])*f/bZ,by=h/2-(bdx*cu[0]+bdy*cu[1]+bdz*cu[2])*f/bZ,cx=w/2+(cdx*cr[0]+cdy*cr[1]+cdz*cr[2])*f/cZ,cy=h/2-(cdx*cu[0]+cdy*cu[1]+cdz*cu[2])*f/cZ;
    if(ax<0&&bx<0&&cx<0||ax>w&&bx>w&&cx>w||ay<0&&by<0&&cy<0||ay>h&&by>h&&cy>h||Math.abs((bx-ax)*(cy-ay)-(by-ay)*(cx-ax))<.1)continue;
    const lum=it.emissive>.4?1:.49+Math.max(0,v[j+9]*light270[0]+v[j+10]*light270[1]+v[j+11]*light270[2])*.55,r=Math.round(clamp(it.color[0]*lum)*255),g=Math.round(clamp(it.color[1]*lum)*255),b=Math.round(clamp(it.color[2]*lum)*255);visible++;
    if(it.alpha===1)triangle270(surface,ax,ay,1/aZ,bx,by,1/bZ,cx,cy,1/cZ,r,g,b,1);
    else if(it.alpha<1){let row=surface.pool[pooled];if(!row){row=new Float64Array(14);surface.pool[pooled]=row;}pooled++;row[0]=ax;row[1]=ay;row[2]=1/aZ;row[3]=bx;row[4]=by;row[5]=1/bZ;row[6]=cx;row[7]=cy;row[8]=1/cZ;row[9]=r;row[10]=g;row[11]=b;row[12]=it.alpha;row[13]=(aZ+bZ+cZ)/3;surface.transparent.push(row);}
   }
  }
  surface.transparent.sort((a,b)=>b[13]-a[13]);for(const p of surface.transparent)triangle270(surface,p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],p[9],p[10],p[11],p[12]);
  c.putImageData(surface.image,0,0);c.globalAlpha=1;lastRaster270={items:items.length,culledItems:culled,testedTriangles:tested,visibleTriangles:visible,transparentCapacity:surface.pool.length,scratchValues:scratch270.length,milliseconds:performance.now()-started};
 };
 function labels(c,e,cam,w,h){if(!advanced(e)||e.status!=='boarding')return;const b=e.board,cssW=ARCADE.canvas?.getBoundingClientRect?.().width||w,scale=w/cssW,H=h/scale;c.save();c.scale(scale,scale);c.textAlign='center';c.textBaseline='middle';c.font='600 '+(cssW<600?9:11)+'px sans-serif';c.lineWidth=3;c.strokeStyle='#11222e';
  for(const s of b.missions270.systems||[]){if(distance(s.dockPos||s.pos,b.pos)>17)continue;const moving=b.missions270.transport?.id===s.id?b.missions270.transport:null,p=spaceProject(V3.add(moving?.pos||s.dockPos||s.pos,[0,s.type==='lift'?2.45:1.85,0]),cam,cssW,H);if(p.z<=0||p.x<55||p.x>cssW-55||p.y<105||p.y>H-90)continue;
   const title=s.type==='lift'?(moving?'ЛИФТ · '+Math.round(moving.progress*100)+'%':(s.unlockAfter??0)>b.completed.length?'ЛИФТ · ЗАБЛОКИРОВАН':'ЛИФТ · ГОТОВ'):s.state==='used'?'СИСТЕМА ОТКЛЮЧЕНА':s.type==='coolant'?'ОХЛАЖДЕНИЕ':'ПИТАНИЕ';c.fillStyle=s.state==='used'?'#9aaeb9':s.type==='coolant'?C.cyan:C.ivory;c.strokeText(title,p.x,p.y);c.fillText(title,p.x,p.y);
  }c.restore();}
 for(const [name,fn]of [['hud',old.hud],['mobile',old.mobile],['final',old.final]]){const wrapper=function(c,e,cam,w,h){const result=fn.apply(this,arguments);labels(c,e,cam,w,h);return result;};if(name==='hud')drawBoardHUD=wrapper;else if(name==='mobile')drawMobileGameHUD=wrapper;else drawFinaleHUD=wrapper;}
 globalThis.CITADEL_BASE_MISSIONS_VIEW=Object.freeze({version:VERSION,active,detail,stats:()=>({templates:templates.size,architectureLayouts:architecture.size}),rasterStats:()=>({...lastRaster270}),
  actor(kind,subject,high=false,time=0,fx=true){const a=[];if(kind==='dog')dog(a,subject,time,high,fx);else mech(a,subject,time,high,fx);return a;},
  dimensions:Object.freeze({humanHeight:3.5,dogHeight:1.96,mechHeight:6.44,liftHalfExtents:[1.65,1.65]}),architecture:buildArchitecture});
})();
