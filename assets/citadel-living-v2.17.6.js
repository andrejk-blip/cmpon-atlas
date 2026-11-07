/* Living painted titans. Simulation owns encounter time, telegraphs and the
 * exact swept limbs used for hits. Rendering never advances gameplay. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_LIVING2176||typeof RequirementArcade!=='function')return;
 const C=CITADEL_CAMPAIGN,p=RequirementArcade.prototype,TAU=Math.PI*2;
 const old={step:p.step,hit:p.hit,pulse:p.pulse,boardPulse:p.boardPulse,scene:spaceScene,render:SpaceRenderer.prototype.render};
 const CAST=Object.freeze({base1:'hammer',convoy1:'tentacle',pursuit:'maw',base2:'mantis',route:'medusa',swarm:'tentacle',base3:'hammer',convoy3:'medusa',orbit4:'maw',base4:'mantis',lair:'hammer'});
 const ATTACKS=Object.freeze({
  hammer:{period:6,tell:2.8,strike:.9,recover:1.3,label:'МОЛОТ · УЙДИТЕ ВБОК'},
  tentacle:{period:5.4,tell:2.4,strike:.75,recover:1.25,label:'ХЛЫСТ · СМЕНИТЕ ПОЛОСУ'},
  maw:{period:5.8,tell:2.7,strike:.95,recover:1.25,label:'ЧЕЛЮСТИ · УЙДИТЕ ИЗ ЦЕНТРА'},
  mantis:{period:5.2,tell:2.1,strike:.6,recover:1.2,label:'КОСА · УЙДИТЕ С ДИАГОНАЛИ'},
  medusa:{period:6.1,tell:2.9,strike:1,recover:1.2,label:'ЛУЧИ · ВСТАНЬТЕ МЕЖДУ ПОЛОСАМИ'}
 });
 const attack=s=>s.started&&!s.tactics2177?ATTACKS.tentacle:ATTACKS[s.kind]||ATTACKS.tentacle;
 const duration=s=>s.tactics2177&&s.mission==='orbit4'?2+attack(s).period:19;
 function timing(s){const a=attack(s),clock=Math.max(0,s.age-2),cycle=Math.floor(clock/a.period);return{a,cycle,t:clock-cycle*a.period};}
 const TILES={hammer:0,tentacle:1,maw:2,mantis:3,medusa:4};
 const NAMES=CITADEL_PURSUIT.warpNames,ink={hammer:'#ffba69',tentacle:'#bf90ff',maw:'#f19abc',mantis:'#b0e2a1',medusa:'#83e9ed'};
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const fxStates=new WeakMap();let atlas=null,ready=false,layer=null,layerFor=null;
 // Centre and half-thickness sampled from the painted weapon, every 16 px.
 // Fixed geometry also works before the image downloads and after save/load.
 const LIMB=[[248,1],[254,28],[250.5,66.5],[247,81],[248.5,92.5],[250,96],[242,94],[228.5,82.5],[224.5,73.5],[219.5,68.5],[219.5,65.5],[224,59],[227.5,57.5],[232.5,57.5],[240,55],[248.5,52.5],[256.5,50.5],[267.5,46.5],[274.5,46.5],[280.5,43.5],[287.5,41.5],[287.5,37.5],[291.5,36.5],[289,34],[287.5,33.5],[279.5,31.5],[275,34],[217.5,80.5],[210.5,74.5],[205.5,63.5],[201,46],[240,1],[240,1]];
 function limb(u){const v=clamp(u)*32,i=Math.min(31,Math.floor(v)),t=v-i;return LIMB[i].map((n,j)=>n+(LIMB[i+1][j]-n)*t);}
 function warm(){if(atlas||typeof Image!=='function')return;atlas=new Image();atlas.decoding='async';atlas.onload=()=>{ready=true;};atlas.src='./assets/living2176/titans.webp';}
 const permitted=e=>C.active(e);
 const inPlay=e=>permitted(e)&&!globalThis.CITADEL_RESONATOR?.active(e)&&['playing','boarding'].includes(e.status)&&!e.crash&&!e.campaign2120.modal&&!e.campaign2120.card&&!e.campaign2120.station?.reading;
 function state(e){if(!permitted(e))return null;const id=C.mission(e),s=e.campaign2120;
  if(s.rift2176?.mission!==id)s.rift2176={mission:id,kind:CAST[id]||null,clock:0,age:0,started:false,done:false,cycle:-1,side:1,hitCycle:-1,contacts:0,repelledUntil:0,segments:[]};return s.rift2176;
 }
 function basis(e){if(e.board)return{r:[1,0,0],u:[0,0,1],f:[0,1,0]};
  if(['escort','pursuit','swarm'].includes(e.phase))return{r:[1,0,0],u:[0,1,0],f:[0,0,-1]};
  const b=flightBasis(e.player.yaw,e.player.pitch);return{r:b.r,u:b.u,f:b.f};
 }
 const at=(s,x,y,z)=>V3.add(s.origin,V3.add(V3.scale(s.basis.r,x),V3.add(V3.scale(s.basis.u,y),V3.scale(s.basis.f,z))));
 function begin(e,s){const board=!!e.board,pos=(board?e.board:e.player).pos;s.started=true;s.tactics2177=1;s.age=0;s.ground=board;s.origin=pos.slice();s.basis=basis(e);s.side=C.number(e)%2?1:-1;
  s.body=at(s,s.side*(board?8:46),board?-9:16,board?8:148);s.previousPlayer=pos.slice();
  if(!e.campaign2120.practice)e.campaign2120.encounters[s.kind]={at:e.elapsed,mission:s.mission};
  e.notify(NAMES[s.kind].toUpperCase(),'РАЗЛОМ · покиньте подсвеченную полосу перед ударом');
  globalThis.CITADEL_COLLECTION?.observe?.(e);
 }
 function paths(s,reach,resolution=24){
  const g=s.ground,span=g?8.295:48,side=s.side*((s.pose?.cycle??timing(s).cycle)%2?-1:1),height=g?.85:0,scale=g?.173:1,kind=s.tactics2177?s.kind:'tentacle',lines=[];
  const add=(fn,count=resolution)=>{const line=[];for(let i=0;i<=count;i++){const q=fn(i/count);line.push({pos:at(s,q[0],q[1],height),r:q[2]});}lines.push(line);};
  if(kind==='hammer')add(u=>[side*span*.12,span*(1-2*reach*u),(u>.82?6.2:2.5)*scale]);
  else if(kind==='maw')for(const jaw of [-1,1])add(u=>[jaw*span*(1-reach*u),jaw*Math.sin(reach*u*Math.PI)*span*.2,(2.4+reach*u*1.8)*scale]);
  else if(kind==='mantis')add(u=>[side*span*(1-2*reach*u),side*span*.48*(1-2*reach*u),(2.1+Math.sin(reach*u*Math.PI)*1.5)*scale]);
  else if(kind==='medusa')for(const lane of [-1,0,1])add(u=>[lane*span*.48,span*(1-2*reach*u),2.5*scale]);
  else add(u=>{const [center,thickness]=limb(u*reach);return[side*span*(1-2*reach*u),(248-center)*span/256*.42,Math.max(g?.15:.6,thickness*span/256*.42*.82)];});
  return lines;
 }
 function warningPaths(s){const lines=paths(s,1,96),scale=s.ground?.173:1;for(const line of lines)for(const q of line)q.r=(s.kind==='hammer'&&s.tactics2177?6.2*scale:q.r)+(s.ground?.12:.75);return lines;}
 function pose(s){
  const {a,cycle,t}=timing(s),tell=t>=.6&&t<a.tell,strike=t>=a.tell&&t<a.tell+a.strike,recover=t>=a.tell+a.strike&&t<a.tell+a.strike+a.recover;
  const reach=strike?smooth((t-a.tell)/a.strike):recover?1-smooth((t-a.tell-a.strike)/a.recover):0;
  s.pose={cycle,t,tell,strike,recover,reach,emerge:smooth(s.age/1.7)*smooth((duration(s)-s.age)/2)};
  const prev=s.segments||[];s.paths=paths(s,reach);s.segments=s.paths.flat();
  s.segments.forEach((q,i)=>q.previous=prev[i]?.pos||q.pos);s.portal=s.paths[0][0].pos.slice();
 }
 function contact(from,to,s){if(!s.pose?.strike||s.age<s.repelledUntil||s.hitCycle===s.pose.cycle)return false;
  if(s.ground){from=V3.add(from,[0,1,0]);to=V3.add(to,[0,1,0]);}
  return s.segments.some(j=>flightSegment(V3.add(from,V3.sub(j.pos,j.previous||j.pos)),to,j.pos,j.r+(s.ground?.55:2.4))!==null);
 }
 function damage(e,s){const amount=s.ground?15:24;let hit=false;
  if(s.ground&&e.board){const b=e.board,before=b.hp;e.mrgDamage(amount);hit=b.hp<before;
    if(b.hp<=0)e.lossReason='Удар титана из разлома. Уходите из подсвеченной полосы до замаха или применяйте импульс.';
   }else hit=!!e.damage(amount);
  if(e.campaign2120.practice){s.contacts++;s.hitCycle=s.pose.cycle;e.notify('УЧЕБНОЕ ПОПАДАНИЕ','Щит сохранён · уходите из полосы замаха');return true;}
  if(hit){s.contacts++;s.hitCycle=s.pose.cycle;e.notify('УДАР ТИТАНА','Щит повреждён · '+attack(s).label.toLowerCase());globalThis.CITADEL_SFX?.effect?.('player-damage',{engine:e,pos:(e.board||e.player).pos});}return hit;
 }
 function tick(e,s,dt,from){
  if(!s?.kind||s.done)return;s.clock+=dt;warm();
  if(!s.started){if(s.clock>=(s.mission==='swarm'?8:10))begin(e,s);return;}
  s.age+=dt;if(s.age>=duration(s)){s.done=true;s.segments=[];return;}
  const actor=e.board||e.player,pos=actor.pos;
  // Keep the encounter beside a travelling corridor, but never retarget a
  // warning already on screen. The player can leave its locked attack plane.
  if(!s.ground){const delta=V3.sub(pos,s.previousPlayer||pos),travel=V3.scale(s.basis.f,V3.dot(delta,s.basis.f));s.origin=V3.add(s.origin,travel);s.body=V3.add(s.body,travel);}
  const {cycle}=timing(s);
  if(cycle!==s.cycle){s.cycle=cycle;s.origin=pos.slice();s.basis=basis(e);s.body=at(s,s.side*(s.ground?8:46),s.ground?-9:16,s.ground?8:148);s.warned=false;s.sounded=false;}
  pose(s);
  if(s.pose.tell&&!s.warned){s.warned=true;e.notify(attack(s).label,s.ground?'Покиньте подсвеченную область до удара':'Уйдите из подсвеченной области · импульс отталкивает атаку');}
  if(s.pose.strike&&!s.sounded){s.sounded=true;globalThis.CITADEL_SFX?.effect?.('missile',{engine:e,pos:s.portal});}
  if(contact(from,pos,s))damage(e,s);s.previousPlayer=pos.slice();
 }
 p.step=function(dt,input={}){const eligible=inPlay(this),from=(this.board||this.player)?.pos?.slice(),s=eligible?state(this):null;
  if(eligible&&this.escort?.warp290)this.escort.warp290.entities=[];
  const result=old.step.apply(this,arguments);
  const fx=fxStates.get(this);if(eligible&&fx)for(const q of fx)q.life-=clamp(dt,0,.04);
  if(eligible&&inPlay(this)&&s===this.campaign2120.rift2176)tick(this,s,clamp(dt,0,.04),from);return result;
 };
 function impact(e,pos,large=false){let a=fxStates.get(e);if(!a){a=[];fxStates.set(e,a);}a.push({pos:pos.slice(),life:large?.55:.22,max:large?.55:.22,hit:true});while(a.length>24)a.shift();}
 p.hit=function(enemy,amount){const hp=enemy?.hp,r=old.hit.apply(this,arguments);if(enemy&&Number.isFinite(hp)&&enemy.hp<hp&&enemy.hp>0){impact(this,enemy.pos);globalThis.CITADEL_SFX?.effect?.('armor-hit',{engine:this,pos:enemy.pos});}return r;};
 for(const name of ['pulse','boardPulse'])if(typeof old[name]==='function')p[name]=function(){const actor=name==='boardPulse'?this.board:this.player,before=actor?.pulseCooldown||0,r=old[name].apply(this,arguments),s=this.campaign2120?.rift2176;if((r===true||(actor?.pulseCooldown||0)>before)&&s?.started&&!s.done){s.repelledUntil=s.age+2.5;s.hitCycle=s.pose?.cycle??-1;}return r;};
 spaceScene=function(e,time,fx){const items=old.scene.apply(this,arguments);items.living2176={e,fx};return items;};
 function canvasFor(canvas){if(typeof document==='undefined')return null;if(layerFor===canvas&&layer?.isConnected)return layer;
  layer?.remove();layer=document.createElement('canvas');layer.className='living2176-layer';layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';canvas.insertAdjacentElement('afterend',layer);if(ARCADE.hud)ARCADE.hud.style.zIndex='2';layerFor=canvas;return layer;
 }
 function project(v,cam,W,H){const q=spaceProject(v,cam,W,H);return q.z>1&&Number.isFinite(q.x)&&Number.isFinite(q.y)?q:null;}
 function orb(ctx,x,y,r,color,alpha=1){if(r<=0)return;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.27,color);g.addColorStop(1,'transparent');ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=1;}
 function ring(ctx,q,r,age,color,alpha){ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.sin(age*.7)*.12);ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,r*.035);ctx.globalAlpha=alpha;
  for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,r*(.28+i*.045),r*(.85+i*.08),0,age*(i%2?-.3:.3),TAU+age*(i%2?-.3:.3));ctx.stroke();}ctx.restore();}
 function painted(ctx,s,q,size){if(!ready)return;const tile=TILES[s.kind],sx=tile%3*512,sy=Math.floor(tile/3)*512;
  ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.sin(s.age*.65)*.025);ctx.globalAlpha=s.pose.emerge;
  // Continuous strip deformation: the head leads, the torso breathes, lower
  // limbs lag. No separate RAF, geometry allocation or CSS layout per frame.
  const strips=32,band=512/strips;
  for(let i=0;i<strips;i++){const v=i/strips,breath=1+Math.sin(s.age*1.8)*.014*Math.sin(v*Math.PI),offset=Math.sin(s.age*1.35-v*3.4)*size*(s.kind==='medusa'||s.kind==='tentacle'?.014:.007)*Math.sin(v*Math.PI);
   ctx.drawImage(atlas,sx,sy+i*band,512,band,-size*breath/2+offset,-size/2+v*size,size*breath,size/strips+.6);
  }ctx.restore();
 }
 function strokePaths(ctx,lines,cam,W,H,color,warning=false){
  for(const line of lines)for(let i=1;i<line.length;i++){
   const a=project(line[i-1].pos,cam,W,H),b=project(line[i].pos,cam,W,H);if(!a||!b)continue;
   const width=clamp(line[i].r*b.scale*2,warning?4:2,H*.22);
   ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
   if(!warning){ctx.strokeStyle='#eed9df';ctx.lineWidth=Math.max(1,width*.16);ctx.beginPath();ctx.moveTo(a.x,a.y-width*.16);ctx.lineTo(b.x,b.y-width*.16);ctx.stroke();}
  }
 }
 function monster(ctx,e,s,cam,W,H){if(!s?.started||s.done||!s.pose||s.mission==='contradictions')return;warm();
  const body=project(s.body,cam,W,H),col=ink[s.kind],a=s.pose.emerge;
  // The body may be behind the camera after a turn. Attacks remain independent.
  if(body){const size=clamp((s.ground?18:95)*body.scale,8,H*.68);
   ring(ctx,body,size*.56,s.age,col,a*.45);orb(ctx,body.x,body.y,size*.57,col,a*.13);painted(ctx,s,body,size);
   if(!ready){ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(body.x,body.y,size*.25,size*.42,0,0,TAU);ctx.stroke();}
  }
  const full=warningPaths(s),current=paths(s,s.pose.reach);
  for(const line of current){const portal=project(line[0].pos,cam,W,H);if(portal)ring(ctx,portal,clamp((s.ground?2:10)*portal.scale,8,H*.35),s.age*2,col,a);}
  if(s.pose.tell){ctx.save();ctx.lineCap='round';ctx.globalAlpha=.48+.22*Math.sin(s.age*12);strokePaths(ctx,full,cam,W,H,'#ffc87d',true);ctx.restore();}
  function caption(){if(!(s.pose.tell||s.pose.strike))return;ctx.save();ctx.fillStyle='#07141de8';ctx.fillRect(W*.08,Math.max(40,H-65),W*.84,31);ctx.font='600 '+Math.max(12,Math.min(17,W/60))+'px "Citadel UI",sans-serif';ctx.textAlign='center';ctx.fillStyle=s.pose.strike?'#ffad9e':'#ffe1a1';ctx.shadowColor='#07141d';ctx.shadowBlur=5;
   ctx.fillText(attack(s).label,W/2,Math.max(58,H-44),W*.8);ctx.restore();}
  if(s.age<s.repelledUntil||s.pose.reach<.01){caption();return;}
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(ready&&(s.kind==='tentacle'||!s.tactics2177)){
   const side=s.side*(s.pose.cycle%2?-1:1),span=s.ground?8.295:48,z=s.ground?.85:0,point=(x,y)=>project(at(s,side*span*(1-x/256),(248-y)*span/256*.42,z),cam,W,H),a=point(0,138),b=point(512,138),c=point(0,358),visible=Math.min(492,512*s.pose.reach);
   if(a&&b&&c&&visible>8){ctx.save();ctx.transform((b.x-a.x)/512,(b.y-a.y)/512,(c.x-a.x)/220,(c.y-a.y)/220,a.x,a.y);ctx.drawImage(atlas,1032,650,visible-8,220,8,0,visible-8,220);ctx.restore();}
   else strokePaths(ctx,current,cam,W,H,col);
  }else{ctx.shadowColor=col;ctx.shadowBlur=s.kind==='medusa'?15:4;strokePaths(ctx,current,cam,W,H,s.kind==='hammer'?'#876657':s.kind==='mantis'?'#78a48c':s.kind==='maw'?'#88566f':col);}
  for(const line of current){const tip=project(line.at(-1).pos,cam,W,H);if(tip)orb(ctx,tip.x,tip.y,clamp((s.kind==='hammer'?7:3)*tip.scale,3,48),col,.5);}
  ctx.restore();caption();
 }
 function blast(ctx,x,cam,W,H){const q=project(x.pos,cam,W,H);if(!q)return;const t=clamp(1-x.life/x.max),hit=!!x.hit,r=clamp((hit?1.5+t*3:3+t*20)*q.scale,hit?3:5,Math.max(W,H)*.45),fade=(1-t);
  ctx.save();ctx.globalCompositeOperation='screen';orb(ctx,q.x,q.y,r*(hit?1:1.7),'#ff8d36',fade*.8);orb(ctx,q.x,q.y,r*.65,'#ffe9b4',fade);orb(ctx,q.x,q.y,r*.25,'#ffffff',fade);
  ctx.lineWidth=Math.max(1,r*.035);ctx.strokeStyle='#ffd9a2';ctx.globalAlpha=fade*.8;ctx.beginPath();ctx.ellipse(q.x,q.y,r*1.4,r*.45,-.25,0,TAU);ctx.stroke();
  const n=hit?7:17;for(let i=0;i<n;i++){const a=i*2.399,travel=r*(.6+(i%5)*.19),xx=q.x+Math.cos(a)*travel,yy=q.y+Math.sin(a)*travel*.78;ctx.strokeStyle=i%3?'#ffb558':'#f6e9d7';ctx.lineWidth=hit?1:Math.max(1.3,2.5*(1-t));ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+Math.cos(a)*r*.18,yy+Math.sin(a)*r*.18);ctx.stroke();}
  ctx.restore();
 }
 function draw(ctx,e,cam,W,H){ctx.clearRect(0,0,W,H);if(!['playing','boarding','paused','crashing'].includes(e.status)||e.campaign2120?.modal)return;
  const s=e.campaign2120?.rift2176;monster(ctx,e,s,cam,W,H);
  for(const x of (e.explosions||[]).slice(-14))if(x.life>0&&!x.warp)blast(ctx,x,cam,W,H);
  for(const x of (fxStates.get(e)||[]))if(x.life>0)blast(ctx,x,cam,W,H);
 }
 SpaceRenderer.prototype.render=function(items,cam){const result=old.render.call(this,items,cam),info=items.living2176;if(!info)return result;const c=canvasFor(this.canvas);if(!c)return result;
  if(c.width!==this.canvas.width||c.height!==this.canvas.height){c.width=this.canvas.width;c.height=this.canvas.height;}draw(c.getContext('2d'),info.e,cam,c.width,c.height);return result;
 };
 globalThis.CITADEL_LIVING2176=Object.freeze({version:'2.17.7',cast:CAST,attacks:ATTACKS,paths,warningPaths,canvasForScene:canvas=>layerFor===canvas&&layer?.isConnected?layer:null,state,begin,pose,tick,contact,draw,blast,warm,inspection:e=>{const s=e.campaign2120?.rift2176;return s?{mission:s.mission,kind:s.kind,age:s.age,done:s.done,contacts:s.contacts,phase:s.pose?.tell?'tell':s.pose?.strike?'strike':'idle',ready}:null;}});
})();
