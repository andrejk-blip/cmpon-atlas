/* Art-directed exhaust and weapon families, all driven by simulation time. */
(()=>{
 'use strict';if(globalThis.CITADEL_EFFECTS)return;
 const old={scene:spaceScene,interior:citadelInterior},TAU=Math.PI*2;
 const add=(a,mesh,pos,size,color,em=1,b=SPACE_IDENTITY,alpha=1)=>{const it=citadelItem(mesh,pos,size,color,em,b,alpha,24);it.effect2140=true;a.push(it);return it;};
 function exhaust(a,e){if(!e.campaign2120||e.crash||e.board||!['playing','paused','docking'].includes(e.status))return;
  const p=e.player,t=e.phase==='escort'?e.escort.time:e.phase==='pursuit'?e.pursuit.clock:e.elapsed,b=flightBasis(p.yaw||0,p.pitch||0,p.bank||0),scale=e.phase==='escort'||e.phase==='pursuit'?1:.68,m=spaceModel(p.pos,[scale,scale,scale],b),hot=p.boosting?1.5:1;
  for(const side of [-1,1]){const nozzle=e.phase==='pursuit'?[side*3.57,.12,-5.1]:[side*3.7,-.18,-4.45],at=o=>spacePoint(m,[nozzle[0]+o[0],nozzle[1]+o[1],nozzle[2]+o[2]]),back={r:b.r,u:b.u,f:V3.scale(b.f,-1)};
   add(a,'p260_horn_low',at([0,0,-2.1*hot]),[.62*scale,.47*scale,2.8*scale*hot],'#517fe4',.9,back,.22);
   add(a,'p260_horn_low',at([0,0,-1.45*hot]),[.31*scale,.29*scale,1.9*scale*hot],'#9bf8fb',1,back,.7);
   add(a,'p260_horn_low',at([0,0,-.55]),[.19*scale,.18*scale,.8*scale],'#fff3d0',1,back);
   for(let i=0;i<3;i++){const d=.8+i*.85*hot+Math.sin(t*12+i)*.06;add(a,'octa',at([0,0,-d]),[(.27-i*.05)*scale,(.24-i*.05)*scale,.16*scale],'#d2ffff',1,b,.7-i*.15);}
   for(let i=0;i<4;i++){const age=((t*2.2+i*.25)%1+1)%1,d=2+age*5*hot;add(a,'p260_horn_low',at([Math.sin(i*2.4+age*4)*age*.24,Math.cos(i*1.9+age*5)*age*.18,-d]),[.06*scale,.06*scale,.5*scale],'#82b6ed',1,back,(1-age)*.5);}
  }
 }
 function shotArt(a,shot,b){const kind=shot.art2140||b.enemies.find(x=>x.id===shot.owner)?.archetype||'scout',p=V3.add(shot.pos,[0,2.1,0]),dir=V3.norm(shot.vel),basis=spaceBasisDir(shot.vel),back=d=>V3.sub(p,V3.scale(dir,d));
  if(kind==='sniper'){
   add(a,'p260_tube_low',back(.9),[.035,.035,1.3],'#ffebc0',1,basis);add(a,'p260_horn_low',back(.3),[.15,.12,.6],'#ffa96b',1,basis,.55);
   for(const d of [.5,1.4])add(a,'lightRing',back(d),[.17,.17,.035],'#ffd99d',.9,basis,.65);
  }else if(kind==='shield'){
   add(a,'octa',p,[.22,.22,.36],'#ffd093',1,basis);add(a,'lightRing',p,[.34,.34,.055],'#ea9273',1,basis,.6);add(a,'p260_horn_low',back(.45),[.15,.15,.65],'#c67850',1,basis,.45);
  }else if(kind==='relay'){
   add(a,'octa',p,[.21,.21,.3],'#d3b5ff',1,flightBasis(b.time*3,0));
   for(let i=0;i<3;i++){const angle=b.time*9+i*TAU/3;add(a,'octa',V3.add(p,[Math.cos(angle)*.28,Math.sin(angle)*.28,0]),[.06,.06,.1],'#ad8eff',1,basis,.7);}
  }else if(kind==='hunter'||kind==='ninja'){
   for(const side of [-1,1])add(a,'p260_horn_low',V3.add(back(.3),V3.scale(basis.r,side*.12)),[.065,.1,.8],'#ff7894',1,basis);add(a,'octa',p,[.12,.12,.25],'#ffe8dc',1,basis);
  }else{
   add(a,'p260_horn_low',back(.3),[.11,.11,.65],'#f0b46f',1,basis,.8);add(a,'octa',p,[.13,.13,.23],'#fff1ce',1,basis);add(a,'p260_horn_low',back(.8),[.08,.08,.55],'#d77745',1,basis,.3);
  }
 }
 citadelInterior=function(e,...args){const a=old.interior.call(this,e,...args);if(!e.campaign2120||!e.board)return a;const out=a.filter(x=>x.baseFeature!=='enemy-round');for(const s of e.board.hostile.slice(0,48))shotArt(out,s,e.board);return out;};
 spaceScene=function(e,...args){const a=old.scene.call(this,e,...args);if(e.campaign2120&&!e.campaign2120.modal)exhaust(a,e);return a;};
 globalThis.CITADEL_EFFECTS=Object.freeze({version:'2.14.0',exhaust,shotArt});
})();
