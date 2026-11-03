/* Position-based cast shadows, detailed engine jets and living atlas markers. */
(()=>{
 'use strict';if(globalThis.CITADEL_POLISH)return;
 const old={scene:spaceScene,overlay:arcadeOverlayHTML},sun=V3.norm([-.48,.73,.48]);
 const add=(a,mesh,pos,size,color,em,b,alpha=1)=>{const x=citadelItem(mesh,pos,size,color,em,b,alpha,24);x.exhaust2150=true;a.push(x);};
 function plume(a,e){if(e.board||e.crash||(e.finale&&!globalThis.CITADEL_LEVIATHAN?.arena(e))||!['playing','paused','docking'].includes(e.status))return;
  const p=e.player,t=e.escort?.time??e.pursuit?.clock??e.elapsed,b=flightBasis(p.yaw||0,p.pitch||0,p.bank||0),s=e.finale?1.25:['escort','pursuit'].includes(e.phase)?1:.68,m=spaceModel(p.pos,[s,s,s],b),hot=p.boosting?1.65:1;
  for(const side of [-1,1]){const root=e.finale?[side*1.5,0,-2.3]:e.phase==='pursuit'?[side*3.57,.12,-5.1]:[side*3.7,-.18,-4.45],at=(x,y,z)=>spacePoint(m,V3.add(root,[x,y,z])),back={r:b.r,u:b.u,f:V3.scale(b.f,-1)};
   add(a,'p260_tube_low',at(0,0,0),[.46*s,.37*s,.09*s],'#d0edff',1,b);
   // Overlapping translucent shells, a hot throat and separated shock cells.
   for(let j=0;j<5;j++){const z=j*.82*hot,r=(.40-j*.058)*(1+Math.sin(t*17-j)*.045),len=(1.2-j*.07)*hot;
    add(a,'p260_horn_low',at(0,0,-z-len*.5),[r*s,r*s*.82,len*s],['#a9efff','#79d5f2','#70a9f3','#8c8ce9','#735bb0'][j],1,back,.64-j*.09);
    if(j<4)add(a,'octa',at(0,0,-.38-z),[(.19-j*.026)*s,(.16-j*.021)*s,.28*s*hot],'#f3ffff',1,b,.85-j*.12);
   }
   add(a,'p260_horn_low',at(0,0,-.45),[.20*s,.16*s,.75*s],'#fff4d5',1,back);
   for(let j=0;j<6;j++){const u=(t*(p.boosting?2.8:1.7)+j/6)%1,z=2.6+u*5.8*hot,ang=u*6+j*2.4+side;
    add(a,'p260_horn_low',at(Math.cos(ang)*u*.28,Math.sin(ang)*u*.19,-z),[(.035+u*.025)*s,.04*s,(.28+u*.5)*s],'#b1dcff',1,back,(1-u)*.65);
   }
  }
 }
 function shadeAt(point,casters,own){let shade=0;
  for(const c of casters){if(c.own===own)continue;const d=V3.sub(c.pos,point),along=V3.dot(d,sun);if(along<=.5||along>190)continue;
   const q=V3.sub(d,V3.scale(sun,along));const radius=c.radius;
   const edge=1-Math.hypot(q[0],q[1],q[2])/radius;
   shade=Math.max(shade,arcadeClamp(edge/.24,0,1)*.48*arcadeClamp((190-along)/35,0,1));
  }return shade;
 }
 function shadows(a,e){if(e.board)return;const casters=[],seen=new Set();
  // Only ships that exist in this frame cast a ship shadow. The station's
  // solid pylons cast separately, leaving its open docking aperture open.
  for(const x of a){if(!(x.ship2150||x.convoy260||x.shipRole)||x.emissive>.3)continue;
   const key=x.pos.join(',');if(seen.has(key))continue;seen.add(key);
   casters.push({pos:x.pos,own:key,radius:x.convoy260==='transport'?6.4:x.shipRole==='fz'?6:4.8});
  }
  for(const x of a)if(x.leviathanFeature==='tentacle')casters.push({pos:x.pos,radius:x.radius,own:'limb'});
  if(e.finale&&globalThis.CITADEL_LEVIATHAN?.arena(e))casters.push({pos:[0,24,-182],radius:70,own:'leviathan'});
  if(e.station&&!e.finale&&!['escort','pursuit','swarm'].includes(e.phase))for(const side of [-1,1])casters.push({pos:V3.add(e.station.pos,[side*49,-1,12]),radius:13,own:'station'+side});
  for(const x of a){if(!(x.ship2150||x.convoy260||x.shipRole)||x.emissive>.3)continue;const factor=shadeAt(x.pos,casters,x.pos.join(','));
   if(factor>0){x.color=x.color.map((v,i)=>v*(1-factor*(i===2?.83:1)));x.castShadow2150=factor;}
  }
 }
 function castle(){return '<svg class="atlas-castle2150" viewBox="0 0 100 90" aria-hidden="true"><path class="castle-shadow" d="M12 70L50 89 94 69 53 48Z"/><path class="castle-side" d="M48 31L82 18 82 65 48 81Z"/><path class="castle-front" d="M16 17L48 31 48 81 16 65Z"/><path class="castle-roof" d="M16 17L49 4 82 18 48 31Z"/><path class="castle-towers" d="M9 10L20 14 20 22 29 26 29 18 40 23 40 48 9 35ZM57 19L68 15 68 23 77 20 77 12 89 7 89 35 57 48Z"/><path class="castle-door" d="M28 70V51Q35 40 41 56V77Z"/><path class="castle-window" d="M61 41L70 37V52L61 56Z"/><path class="castle-banner" d="M50 4V-5L70 0 50 5"/></svg>';}
 arcadeOverlayHTML=function(...args){let html=old.overlay.apply(this,args);const e=ARCADE.engine;if(!e?.campaign2120||!html.includes('document-atlas'))return html;
  const s=CITADEL_CAMPAIGN.state(e),loc={goal:[27,28],scope:[72,28],terms:[26,53],links:[73,53],acceptance:[50,78]},changed=s.changed;
  const route=Object.values(loc).map(p=>p.join(',')).join(' ');
  const overlay='<svg class="atlas-trail2150" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+route+'"/></svg>'+Object.entries(loc).map(([k,xy])=>'<div class="atlas-landmark2150 '+(s.document[k]?'built ':'')+(changed===k?'arriving':'')+'" style="left:'+xy[0]+'%;top:'+(xy[1]-7)+'%">'+castle()+'<span class="atlas-beacon2150"></span></div>').join('');
  return html.replace('<div class="atlas-art"></div>','<div class="atlas-art"></div>'+overlay);
 };
 spaceScene=function(e,...args){let a=old.scene.call(this,e,...args);if(!e.campaign2120||e.campaign2120.modal)return a;
  if(!e.board)a=a.filter(x=>!x.effect2140);plume(a,e);shadows(a,e);return a;
 };
 globalThis.CITADEL_POLISH=Object.freeze({version:'2.15.0',plume,shadows,shadeAt});
})();
