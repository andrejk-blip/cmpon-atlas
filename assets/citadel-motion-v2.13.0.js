/* Shared 3D motion: physical gate, moving warp depth, smooth walkable route. */
(() => {
 'use strict';
 if(globalThis.CITADEL_MOTION)return;
 const old={scene:spaceScene,station:citadelStationExterior,path:citadelGuidePath,interior:citadelInterior},cache=new WeakMap();
 const modern=e=>!!e?.campaign2120,TAU=Math.PI*2;
 const add=(a,mesh,pos,size,col,em=0,basis=SPACE_IDENTITY,alpha=1)=>{const x=citadelItem(mesh,pos,size,col,em,basis,alpha,24);a.push(x);return x;};
 function gateState(e){const t=e.dock?Math.max(0,Math.min(1,e.phaseClock/Math.max(.1,e.dock.duration))):0;
  return {progress:t,open:e.dock?stationSmooth((t-.06)/.36):0};}
 citadelStationExterior=function(e,time,fx){const a=old.station.apply(this,arguments);if(!modern(e))return a;
  // Remove the old iris and its floating lock indicators. Hull stays unchanged.
  const st=e.station.pos,{open}=gateState(e),filtered=a.filter(x=>x.mesh!=='iris'&&!(x.mesh==='box'&&Math.abs(x.pos[2]-st[2]+24.4)<.03));
  const part=(mesh,off,size,col,em=0)=>{const x=add(filtered,mesh,V3.add(st,off),size,col,em);x.dock2130=true;return x;};
  for(const side of [-1,1]){
   const x=side*(7.5+open*16.5),color=open>.93?'#9df5cb':'#ffc16b';
   part('box',[x,0,-25.1],[7.45,12.5,.55],'#283e4b');
   part('armor',[x,0,-25.8],[6.9,11.8,.65],'#738787');
   part('box',[x-side*6.8,0,-26.6],[.12,10,.1],color,.9);
   for(let k=-2;k<=2;k++){part('box',[x,k*4.2,-26.5],[6.1,.12,.12],'#314d58');part('box',[x-side*4.9,k*4.2+1.2,-26.6],[.35,.7,.14],'#c6ba96');}
   for(const y of [-10,10]){part('box',[side*18,y,-24.8],[4,.55,.65],'#1c303e');part('box',[side*(14+open*7),y,-25.2],[2+open*5,.24,.2],'#a4b6b8');}
   for(let i=0;i<5;i++)part('box',[side*16.5,-9+i*4,-27],[.2,1.2,.15],color,.8);
  }
  part('box',[0,13.4,-25.4],[17,.7,1.2],'#435b63');
  for(let i=-3;i<=3;i++)part('box',[i*3.7,13.3,-26.7],[1.3,.15,.08],open>.93?'#8ff5d7':'#ffc37d',1);
  return filtered;
 };
 function route(e,target){const b=e.board;if(!b?.cells)return old.path(e,target);
  const key=target.join(',')+'/'+b.completed.length,previous=cache.get(b);
  let path=previous?.key===key?previous.points:null;
  if(!path||!path.length||Math.hypot(b.pos[0]-previous.from[0],b.pos[2]-previous.from[2])>2){path=stationPath(b,b.pos,target).map(x=>x.slice());cache.set(b,{key,from:b.pos.slice(),points:path});}
  // String-pulling only across a walkable swept corridor. It removes tile
  // zigzags without drawing through crates or cutting the corner of a wall.
  const out=[],points=[b.pos,...path];let i=0;
  while(i<points.length-1){let next=i+1;for(let j=points.length-1;j>i+1;j--)if(stationLine(b,points[i],points[j],.82,true)){next=j;break;}
   if(V3.len(V3.sub(points[next],points[i]))>.12)out.push(points[next].slice());i=next;
  }
  return out;
 }
 citadelGuidePath=function(e,target){return modern(e)?route(e,target):old.path(e,target);};
 citadelInterior=function(e){const a=old.interior.apply(this,arguments);if(!modern(e)||!e.board)return a;
  for(const x of e.board.enemies||[]){if(x.dead||x.archetype!=='sniper'||!(x.charge>0)||!x.aim)continue;
   const from=V3.add(x.pos,[0,1.5,0]),to=V3.add(x.aim,[0,.15,0]),d=V3.sub(to,from);
   const cue=add(a,'box',V3.lerp(from,to,.5),[.025,.025,V3.len(d)/2],'#ffae87',.8,spaceBasisDir(d),.65);cue.sniperAim2130=true;
   const dot=add(a,'octa',to,[.25,.15,.25],'#ffe1a7',1);dot.sniperAim2130=true;
  }return a;
 };
 function warpDepth(a,e){const pursuit=e.phase==='pursuit'&&e.pursuit,convoy=e.phase==='escort'&&e.escort;if(!pursuit&&!convoy)return;
  const clock=pursuit?pursuit.clock:convoy.time,p=e.player.pos,origin=pursuit?p:[0,0,0],motion=ARCADE.fx!==false&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const t=motion?clock:0;
  // Bounded geometry in both WebGL and CPU: streams move towards the camera,
  // with a slow corkscrew motion around the route rather than a frozen sky.
  for(let i=0;i<36;i++){
   const angle=i*2.399+t*.09,z=-40-((i*47-t*145)%1050+1050)%1050,r=90+(i%4)*26;
   const x=origin[0]+Math.cos(angle)*r,y=origin[1]+Math.sin(angle)*r*.7;
   const pos=[x,y,origin[2]+z],len=10+(i%3)*9;
   const it=add(a,'box',pos,[.10+(i%2)*.08,.10,len],i%3?'#65b7db':'#d994f1',.85);it.warpMotion2130=true;
  }
  for(let i=0;i<5;i++){
   const z=-80-((i*230-t*95)%1150+1150)%1150,roll=t*.06+i*.5;
   const it=add(a,'lightRing',V3.add(origin,[Math.sin(t*.3+i)*9,Math.cos(t*.2+i)*6,z]),[105,80,2.5],i%2?'#8267a9':'#408b9e',.65,flightBasis(0,0,roll),.35);it.warpMotion2130=true;
  }
 }
 spaceScene=function(e,time,fx){const a=old.scene.apply(this,arguments);if(modern(e)&&['playing','paused'].includes(e.status)&&!e.finale)warpDepth(a,e);return a;};
 globalThis.CITADEL_MOTION=Object.freeze({version:'2.13.0',gateState,route,warpDepth});
})();
