/* Citadel 2.11 — Parallax, a living fortress with four flight approaches.
 * New sorties use this arena. Existing boss saves retain their original rules.
 * Draw calls consume the same tentacle curves used by collision detection.
 */
(()=>{
 'use strict';
 if(globalThis.CITADEL_LEVIATHAN||typeof RequirementArcade!=='function')return;
 const VERSION='2.11.0',P=RequirementArcade.prototype,TAU=Math.PI*2;
 const old={launch:P.launchFinale,step:P.stepFinalSpace,hit:P.hit,fire:P.fire,missile:P.missile,target:P.target,nav:P.navTarget,guidance:P.guidance,objective:P.objective,scene:spaceScene,camera:spaceCamera,hud:drawFinaleHUD,overlay:finaleOverlay,update:updateArcadeHUD,action:arcadeAction,mobile:mobileAction};
 const clamp=(n,a=-1,b=1)=>Math.max(a,Math.min(b,n)),smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};
 const state=e=>e?.finale?.leviathan,arena=e=>!!state(e)&&['boss','breach'].includes(e.finale.phase),active=e=>arena(e)&&e.finale.phase==='boss';
 const live=e=>e.enemies.filter(x=>x.beacon2110&&!x.dead&&x.hp>0);
 const ports=[[-78,42,-116],[78,42,-116],[78,-42,-116],[-78,-42,-116]];
 const approaches=[[-15,10],[15,10],[15,-10],[-15,-10],[0,0]];
 const names=['СЕВЕРО-ЗАПАД','СЕВЕРО-ВОСТОК','ЮГО-ВОСТОК','ЮГО-ЗАПАД'];
 const patterns=[{id:'lunge',label:'ЩУПАЛЬЦЕ — СМЕНИ ПОЗИЦИЮ',color:'#ffb17c'}, {id:'sweep',label:'ХЛЁСТ — ВВЕРХ ИЛИ ВНИЗ',color:'#ffc979'}, {id:'pincer',label:'КЛЕЩИ — УХОДИ В СТОРОНУ',color:'#ec9de5'}];
 const pattern=a=>patterns.find(p=>p.id===a?.kind)||patterns[0];
 function goal(e){const s=state(e);return live(e).find(x=>x.id===s.focus)||live(e)[0]||e.boss;}
 function route(e){
  const s=state(e),g=goal(e);if(!g)return;
  s.focus=g.id;s.sector=g.beacon2110?g.slot:4;s.transit=0;s.transitDuration=s.clock?5.5:5;
  s.from=s.center.slice();const a=approaches[s.sector];s.to=[g.pos[0]+a[0],g.pos[1]+a[1],s.sector===4?-45:-35];
  s.attack=null;s.nextAttack=s.transitDuration;s.droneClock=s.transitDuration-1.6;s.drones=[];e.hostile=[];
  e.selectedTarget=g.id;
 }
 P.launchFinale=function(...args){
  const allowed=this.status==='finalebrief',r=old.launch.apply(this,args);
  if(!allowed||this.status!=='playing'||this.finale?.phase!=='boss')return r;
  const hp=this.assist?900:1350;
  this.enemies=ports.map((pos,slot)=>({id:++this.entityId,pos:pos.slice(),vel:[0,0,0],r:6.4,hp,maxHp:hp,core:true,beacon2110:true,slot,name:'Маяк '+(slot+1)+' · '+names[slot],hit:0,dead:false,color:'#ffd48e'}));
  const life=this.assist?2400:3300;
  Object.assign(this.boss,{pos:[0,0,-119],r:9,hp:life,maxHp:life,name:'Параллакс · кристалл-вход',crystal2110:true});
  this.finale.leviathan={version:VERSION,clock:0,center:[0,0,95],offset:[0,0],velocity:[0,0],sector:0,focus:this.enemies[0].id,transit:0,from:[0,0,95],to:[0,0,0],attack:null,serial:Math.abs(this.seed||0)%3,nextAttack:7,droneClock:7,drones:[],droneSerial:0,beacons:0,hits:0,evaded:0,blocked:0,contacts:0,events:[]};
  this.player.pos=[0,0,95];this.player.yaw=0;this.player.pitch=0;this.autopilot=false;
  route(this);this.notify('ПАРАЛЛАКС · ЖИВАЯ КРЕПОСТЬ','Четыре маяка на корпусе → центральный кристалл');
  this.say('Держим курс вдоль корпуса. Джойстиком или WASD совмещай прицел с маяком, стреляй и уходи из зоны замаха. Ракеты ускорят разрушение.','order',true);
  return r;
 };
 P.guidance=function(input={}){return active(this)?input:old.guidance.call(this,input);};
 P.navTarget=function(...args){return active(this)?goal(this):old.nav.apply(this,args);};
 function targets(e){return [...live(e),...state(e).drones.filter(x=>!x.dead),...(!live(e).length&&e.boss&&!e.boss.dead?[e.boss]:[])];}
 P.target=function(...args){
  if(!active(this))return old.target.apply(this,args);
  const p=this.player.pos,candidates=targets(this).filter(x=>{const d=V3.sub(x.pos,p);return d[2]<-6&&V3.len(d)<230&&Math.hypot(d[0],d[1])<Math.max(x.r+2,-d[2]*(this.assist?.145:.11));});
  candidates.sort((a,b)=>Math.hypot(a.pos[0]-p[0],a.pos[1]-p[1])-Math.hypot(b.pos[0]-p[0],b.pos[1]-p[1]));
  const t=candidates[0]||null;this.lock=t?.id??null;return t;
 };
 P.fire=function(...args){
  if(!active(this))return old.fire.apply(this,args);const p=this.player;
  if(this.status!=='playing'||p.shotCooldown>0||this.bullets.length>100)return false;
  p.shotCooldown=.15*Math.pow(.88,this.upgrades.weapons||0);this.shots++;
  const t=this.target(),dir=t?V3.norm(V3.sub(t.pos,p.pos)):[0,0,-1];
  for(const side of [-1,1])this.bullets.push({pos:V3.add(p.pos,[side*1.7,0,-3]),vel:V3.scale(dir,210),life:1.5,damage:13*(1+.25*(this.upgrades.weapons||0)),r:.4,type:'laser',color:'#96fff0'});
  this.emit('shot');return true;
 };
 P.missile=function(...args){
  if(!active(this))return old.missile.apply(this,args);const p=this.player;
  if(this.status!=='playing'||p.missileCooldown>0||p.missiles<1)return false;
  const t=this.target();if(!t){this.emit('notice','Совместите прицел с маяком или защитником: ракете нужен захват.');return false;}
  p.missiles--;p.missileCooldown=.9;this.bullets.push({pos:V3.add(p.pos,[0,-.6,-4]),vel:V3.scale(V3.norm(V3.sub(t.pos,p.pos)),110),life:4,damage:150*(1+.3*(this.upgrades.rockets||0)),r:.8,type:'missile',target:t.id,color:'#ffcc8d',trail:[]});this.emit('missile');return true;
 };
 function record(e,kind){const s=state(e);s.events.push({kind,at:s.clock,sector:s.sector});if(s.events.length>24)s.events.shift();}
 P.hit=function(enemy,amount){
  if(!active(this))return old.hit.call(this,enemy,amount);
  if(!enemy||enemy.dead||!(amount>0)||!Number.isFinite(amount))return;
  if(enemy===this.boss&&live(this).length)return;
  if((enemy.beacon2110||enemy===this.boss)&&state(this).transit<state(this).transitDuration)return;
  if(!enemy.beacon2110&&!enemy.drone2110&&enemy!==this.boss)return;
  enemy.hp=Math.max(0,enemy.hp-amount);enemy.hit=.18;this.hitFlash=.14;
  if(enemy.hp>0)return;
  enemy.dead=true;this.explosions.push({pos:enemy.pos.slice(),life:1.2,max:1.2,color:'#ffd39c'});this.emit('destroy');
  const s=state(this);
  if(enemy.drone2110){this.score+=120;this.totalKills++;return;}
  this.score+=enemy.beacon2110?600:3500;this.player.hp=Math.min(100,this.player.hp+(this.assist?14:10));this.player.missiles=Math.min(16,this.player.missiles+2);this.selectedTarget=null;
  if(enemy.beacon2110){
   s.beacons++;record(this,'beacon-'+(enemy.slot+1));
   this.notify('МАЯК '+(enemy.slot+1)+' РАЗРУШЕН',live(this).length?'Щупальца сектора отступают. Следующий заход.':'Щит упал. Открыт центральный кристалл!');
   this.say(live(this).length?'Есть пробитие! Эта пара щупалец больше не атакует. Перехожу к следующему маяку.':'Четыре маяка погасли. Бей в центральный кристалл, но следи за двумя последними щупальцами!','success',true);route(this);
  }else{record(this,'crystal');s.attack=null;s.drones=[];this.beginBreach();}
 };
 function powered(e,arm){return live(e).some(x=>x.slot===Math.floor(arm/2));}
 function rootAt(arm){const a=[Math.PI*.75,Math.PI*.25,-Math.PI*.25,-Math.PI*.75][Math.floor(arm/2)]+(arm%2?.19:-.19);return [Math.cos(a)*91,Math.sin(a)*62,-153];}
 function idleTip(e,arm){const a=[Math.PI*.75,Math.PI*.25,-Math.PI*.25,-Math.PI*.75][Math.floor(arm/2)]+(arm%2?.19:-.19),t=state(e).clock,cut=!powered(e,arm);return [Math.cos(a)*(134+Math.sin(t*.6+arm)*10),Math.sin(a)*91+Math.sin(t*.9+arm)*7,-98+(cut?-31:Math.sin(t*.5+arm)*12)];}
 function tip(e,arm,a,index=0){
  const idle=idleTip(e,arm);if(!a)return idle;
  const start=V3.add(a.aim,a.kind==='sweep'?[-45,0,-32]:a.kind==='pincer'?[0,index?38:-38,-30]:[index?-26:26,25,-40]);
  const strike=u=>a.kind==='sweep'?V3.add(a.aim,[-45+90*smooth(u),0,0]):a.kind==='pincer'?V3.add(a.aim,[0,(index?1:-1)*38*(1-smooth(u/.72)),0]):V3.lerp(start,a.aim,smooth(u/.65));
  if(a.phase==='windup')return V3.lerp(idle,start,smooth(a.time/a.windup));
  if(a.phase==='strike')return strike(a.time/a.strike);
  return V3.lerp(a.end||strike(1),idle,smooth(a.time/a.recovery));
 }
 function limb(e,arm,a=null,index=0){
  const root=rootAt(arm),end=tip(e,arm,a,index),side=root[0]<0?-1:1;
  const b=V3.add(root,[side*26,Math.sin(state(e).clock*.55+arm)*11,19]);
  const c=V3.add(end,[side*16,index?-17:17,-28]),points=[],radii=[];
  for(let i=0;i<=16;i++){const u=i/16,v=1-u;points.push([0,1,2].map(k=>v*v*v*root[k]+3*v*v*u*b[k]+3*v*u*u*c[k]+u*u*u*end[k]));if(i)radii.push(5.6-u*3.5);}
  return {arm,points,radii};
 }
 function attackGeometry(e,attack=state(e)?.attack){return active(e)&&attack?attack.arms.map((arm,i)=>limb(e,arm,attack,i)):[];}
 function contact(e,a,previous,before){
  for(let j=0;j<=4;j++){const u=j/4,ship=V3.lerp(previous,e.player.pos,u),pose={...a,time:before+(a.time-before)*u};
   for(const x of attackGeometry(e,pose))for(let i=1;i<x.points.length;i++)if(CITADEL_PARALLAX.pointSegmentDistance(ship,x.points[i-1],x.points[i])<=x.radii[i-1]+2.3)return true;
  }return false;
 }
 function startAttack(e){
  const s=state(e),pool=Array.from({length:8},(_,i)=>i).filter(i=>powered(e,i)),available=pool.length?pool:[1,5],first=available[s.serial%available.length],kind=patterns[s.serial%3].id;
  s.attack={id:++s.serial,kind,phase:'windup',time:0,windup:e.assist?2.15:1.55,strike:kind==='sweep'?1.35:1.05,recovery:1.5,aim:e.player.pos.slice(),arms:kind==='pincer'?[first,available.find(i=>i!==first)??(first+4)%8]:[first],hit:false,damage:e.assist?14:18};
 }
 function tentacles(e,dt,previous,input){
  const s=state(e),a=s.attack;
  if(!a){s.nextAttack-=dt;if(s.nextAttack<=0)startAttack(e);return;}
  const before=a.time;a.time+=dt;
  if(input.pulse&&e.player.pulseCooldown<=0){e.player.pulseCooldown=8;e.player.invulnerable=1.2;e.hostile=[];s.blocked++;a.end=tip(e,a.arms[0],a);a.phase='recover';a.time=0;e.emit('pulse');}
  if(a.phase==='windup'&&a.time>=a.windup){a.phase='strike';a.time=0;}
  else if(a.phase==='strike'){
   if(!a.hit&&contact(e,a,previous,before)){a.hit=true;s.contacts++;if(e.damage(a.damage))s.hits++;}
   if(a.time>=a.strike){if(!a.hit)s.evaded++;a.phase='recover';a.time=0;}
  }else if(a.phase==='recover'&&a.time>=a.recovery){s.attack=null;s.nextAttack=e.assist?2.3:1.7;}
 }
 function drones(e,dt){
  const s=state(e);s.droneClock-=dt;
  if(s.droneClock<=0&&s.drones.filter(x=>!x.dead).length<(e.assist?2:3)){
   const i=s.droneSerial++,side=i%2?1:-1,base=s.center;
   s.drones.push({id:++e.entityId,drone2110:true,pos:V3.add(base,[side*22,(i%3-1)*15,-48]),vel:[0,0,0],origin:base.slice(),slot:i,age:0,r:3,hp:e.assist?40:65,maxHp:e.assist?40:65,shot:2.5,telegraph:0,aim:null,dead:false,hit:0});s.droneClock=e.assist?5:4;
  }
  for(const x of s.drones){if(x.dead)continue;x.age+=dt;x.hit=Math.max(0,x.hit-dt);const before=x.pos;
   x.pos=[x.origin[0]+Math.sin(x.age*.7+x.slot*2.4)*24,x.origin[1]+Math.sin(x.age*.9+x.slot)*17,x.origin[2]-48+Math.sin(x.age*.4)*7];x.vel=V3.scale(V3.sub(x.pos,before),1/dt);
   if(x.age>18){x.dead=true;continue;}x.shot-=dt;
   if(x.telegraph>0){x.telegraph=Math.max(0,x.telegraph-dt);if(x.telegraph===0){if(e.hostile.length<36)e.hostile.push({pos:x.pos.slice(),vel:V3.scale(V3.norm(V3.sub(x.aim,x.pos)),70),life:3,r:.7,damage:e.assist?6:9,color:'#ff927c'});x.shot=e.assist?4:3.2;}}
   else if(x.shot<=0){x.telegraph=.85;x.aim=e.player.pos.slice();}
  }s.drones=s.drones.filter(x=>!x.dead);
 }
 function projectiles(e,dt,input,previous){
  if(input.fire)e.fire();if(input.missile)e.missile();
  if(input.pulse&&e.player.pulseCooldown<=0){e.hostile=[];e.player.pulseCooldown=8;e.player.invulnerable=1.2;e.emit('pulse');}
  for(const x of e.bullets){const before=x.pos;
   if(x.type==='missile'){const t=targets(e).find(t=>t.id===x.target);if(t)x.vel=V3.scale(V3.norm(V3.lerp(V3.norm(x.vel),V3.norm(V3.sub(t.pos,x.pos)),Math.min(1,dt*6))),110);}
   x.pos=V3.add(x.pos,V3.scale(x.vel,dt));x.life-=dt;
   for(const t of targets(e)){if(flightSegment(before,x.pos,t.pos,t.r)===null)continue;x.life=0;e.hit(t,x.damage);break;}
   if(!active(e))return;
  }
  for(const x of e.hostile){const before=x.pos;x.pos=V3.add(x.pos,V3.scale(x.vel,dt));x.life-=dt;if(flightSegment(V3.sub(before,previous),V3.sub(x.pos,e.player.pos),[0,0,0],2.4)!==null){x.life=0;e.damage(x.damage);}}
  e.bullets=e.bullets.filter(x=>x.life>0);e.hostile=e.hostile.filter(x=>x.life>0);
 }
 P.stepFinalSpace=function(dt,input={}){
  if(!active(this))return old.step.call(this,dt,input);if(this.status!=='playing'||!(dt>0))return;
  dt=Math.min(.04,dt);const s=state(this),p=this.player,previous=p.pos.slice();s.clock+=dt;this.finale.time+=dt;this.elapsed+=dt;
  for(const k of ['shotCooldown','missileCooldown','pulseCooldown','invulnerable','flipCooldown'])p[k]=Math.max(0,(p[k]||0)-dt);
  for(const k of ['flash','shake','hitFlash','captainClock'])this[k]=Math.max(0,(this[k]||0)-dt);
  const x=clamp(Number(input.moveX)||Number(input.turn)||0),y=clamp(Number(input.moveY)||Number(input.pitch)||0),blend=1-Math.exp(-dt*8),speed=input.boost?36:26;
  s.velocity[0]+=(x*speed-s.velocity[0])*blend;s.velocity[1]+=(y*speed-s.velocity[1])*blend;
  s.offset[0]=clamp(s.offset[0]+s.velocity[0]*dt,-31,31);s.offset[1]=clamp(s.offset[1]+s.velocity[1]*dt,-26,26);
  s.transit=Math.min(s.transitDuration,s.transit+dt);s.center=V3.lerp(s.from,s.to,smooth(s.transit/s.transitDuration));
  const cruising=s.transit>=s.transitDuration;
  p.pos=V3.add(s.center,[s.offset[0]+(cruising?Math.sin(s.clock*.32)*3:0),s.offset[1]+(cruising?Math.cos(s.clock*.28)*2:0),cruising?Math.sin(s.clock*.5)*2:0]);
  p.yaw=0;p.pitch=0;p.bank+=(-x*.45-p.bank)*blend;p.speed=cruising?18:35;p.boosting=!!input.boost;
  this.target();tentacles(this,dt,previous,input);if(this.status!=='playing')return;drones(this,dt);projectiles(this,dt,input,previous);if(!active(this))return;
  for(const t of [this.boss,...this.enemies].filter(Boolean))t.hit=Math.max(0,t.hit-dt);
  for(const q of this.explosions)q.life-=dt;this.explosions=this.explosions.filter(x=>x.life>0).slice(-16);
 };
 P.objective=function(...args){
  if(!active(this))return old.objective.apply(this,args);const s=state(this),g=goal(this),a=s.attack;
  return {title:live(this).length?'Параллакс · маяк '+(s.sector+1)+'/4':'Параллакс · кристалл-вход',detail:'Курс вдоль корпуса автоматический. WASD / джойстик — сместить корабль; совместите прицел с маяком и стреляйте. Ракеты ускоряют разрушение, импульс отбивает щупальца.',progress:a&&a.phase!=='recover'?pattern(a).label+' · '+(a.phase==='windup'?'УДАР ЧЕРЕЗ '+Math.max(0,a.windup-a.time).toFixed(1)+' С':'УКЛОНЯЙСЯ'):s.transit<s.transitDuration?'ПЕРЕЛЁТ · ЩИТ ЦЕЛИ ЗАКРЫТ · МАЯКИ '+s.beacons+'/4':g?.beacon2110?names[s.sector]+' · МАЯКИ '+s.beacons+'/4':'ЩИТ СНЯТ · УНИЧТОЖЬТЕ КРИСТАЛЛ'};
 };
 const part=(a,mesh,pos,size,color,em=0,b=SPACE_IDENTITY,alpha=1)=>{const q=citadelItem(mesh,pos,size,color,em,b,alpha);a.push(q);return q;};
 function tube(a,p,q,r,color,em=0){return part(a,'parallaxTendon',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5+.1],color,em,spaceBasisDir(V3.sub(q,p)));}
 function body(items,e,time,fx){
  const s=state(e),lod=isMobileLayout()||!fx?1:0;
  const breath=1+Math.sin(s.clock*1.1)*.018;
  const model=spaceModel([0,-19.8,-182],[12*breath,11*breath,9],SPACE_IDENTITY);
  for(const p of CITADEL_PURSUIT_VIEW.warpModel('medusa',lod))items.push({...p,pos:[0,-19.8,-182],model,leviathanFeature:'bell'});
  for(let i=0;i<12;i++){
   const angle=i/12*TAU,pulse=.2+.2*(1+Math.sin(s.clock*2-i*.6));
   const vein=[.47,.65,.82,.97].map((r,j)=>[Math.cos(angle+j*.04)*105*r,Math.sin(angle+j*.04)*72*r-8,-132-j*2]);
   for(let j=1;j<vein.length;j++)tube(items,vein[j-1],vein[j],1.1,'#9b79ac',pulse);
   part(items,'sphere',vein[2],[1.7,2.3,1.3],'#a7e7dd',pulse);
  }
  for(let i=0;i<20;i++){const a=i/20*TAU,p=[Math.cos(a)*103,Math.sin(a)*71-8,-146],b=stationZBasis(a);
   part(items,'armor',p,[7,3.4,4.5],i%4?'#344659':'#8f775c',0,b);part(items,'box',V3.add(p,[0,0,4.6]),[3.8,.22,.12],'#9adbd0',.6,b);
   if(i%2===0){part(items,'box',V3.add(p,[0,4,-2]),[1.1,5.8,2.5],'#627181');part(items,'octa',V3.add(p,[0,10,-2]),[1.9,3,2],'#c2ae87');}
  }
  for(let arm=0;arm<8;arm++){
   const attack=s.attack,ix=attack?attack.arms.indexOf(arm):-1,a=ix>=0?attack:null,l=limb(e,arm,a,Math.max(0,ix));
   const color=a&&a.phase!=='recover'?pattern(a).color:powered(e,arm)?'#785c79':'#343b4d';
   for(let i=1;i<l.points.length;i++){const q=tube(items,l.points[i-1],l.points[i],l.radii[i-1],color,a?.phase==='strike'?.45:.08);Object.assign(q,{leviathanFeature:'tentacle',arm,from:l.points[i-1],to:l.points[i],radius:l.radii[i-1]});
    if(i%3===0){part(items,'p260_sucker',V3.add(l.points[i],[0,0,l.radii[i-1]]),[l.radii[i-1]*.72,l.radii[i-1]*.72,.65],'#c0a9a1',.1);}
   }
  }
  for(let i=0;i<4;i++){const beacon=e.enemies.find(x=>x.beacon2110&&x.slot===i),p=ports[i],alive=beacon&&!beacon.dead;
   part(items,'torus',p,[8,8,2.2],alive?'#9a8262':'#343344');part(items,'armor',V3.add(p,[0,0,-7]),[10,11,6],'#364457');
   if(alive&&s.transit<s.transitDuration)part(items,'sphere',p,[8,10,6],'#9a91dd',.25,SPACE_IDENTITY,.2);
   if(alive){const selected=beacon.id===s.focus,color=beacon.hit?'#fff7d9':selected?'#ffd68f':'#93b6ed';part(items,'octa',p,[4.3,8,4.3],color,.7,stationZBasis(time*.35));part(items,'lightRing',V3.add(p,[0,0,2]),[9.4,9.4,.4],color,.85,SPACE_IDENTITY,.8);tube(items,p,[0,0,-126],.3,'#9d79cd',.55);}
   else part(items,'octa',p,[2.5,3,2],'#7f5266',.15);
  }
  const shield=live(e).length>0,breach=e.finale.phase==='breach';
  part(items,'torus',[0,0,-117],[13,13,2.7],shield?'#9277b0':'#d4aa70');
  if(!breach)part(items,'octa',[0,0,-115],[6.7,12,6],e.boss?.hit?'#fff6d8':shield?'#b493d1':'#ffc78b',.8,stationZBasis(time*.18));
  else{part(items,'box',[0,0,-118],[9.7,8.7,1],'#050a17');part(items,'lightRing',[0,0,-116],[10,9,1],'#ffe3a4',1);}
  if(shield)part(items,'sphere',[0,0,-119],[16,16,9],'#9f8cdd',.3,SPACE_IDENTITY,.14);
  if(s.attack&&s.attack.phase==='windup'){
   const a=s.attack,col=pattern(a).color;part(items,'lightRing',a.aim,[8.5,8.5,.3],col,1,SPACE_IDENTITY,.7);
   if(a.kind==='sweep')for(let i=-42;i<42;i+=12)tube(items,V3.add(a.aim,[i,0,0]),V3.add(a.aim,[i+6,0,0]),.25,col,1);
   if(a.kind==='pincer')for(let i=-34;i<34;i+=12)tube(items,V3.add(a.aim,[0,i,0]),V3.add(a.aim,[0,i+6,0]),.25,col,1);
  }
 }
 spaceScene=function(e,time,fx=true){
  if(!arena(e)||e.crash)return old.scene(e,time,fx);const items=[];body(items,e,time,fx);
  part(items,'planet',[-650,-420,-1600],[800,800,800],'#324c69');part(items,'ring',[-650,-420,-1590],[980,980,980],'#546f86',.3,flightBasis(.8,.4),.3);
  const firstShip2150=items.length;expeditionShip(items,e.player.pos,flightBasis(0,0,e.player.bank),1.25,'#a8c5d2','#79eaff',false,true);for(let i=firstShip2150;i<items.length;i++)items[i].ship2150='player';
  for(const side of [-1,1]){part(items,'armor',V3.add(e.player.pos,[side*1.7,.3,0]),[.4,.35,1.7],'#8ca6b7',0,flightBasis(0,0,e.player.bank));}
  for(const x of state(e).drones){expeditionShip(items,x.pos,flightBasis(Math.PI,0,Math.sin(x.age)*.25),1.6,x.hit?'#fff1cf':'#ad7772','#ffc48b');if(x.telegraph>0)part(items,'lightRing',x.pos,[5,5,.4],'#ff987c',1,SPACE_IDENTITY,.75);}
  for(const x of e.bullets)if(x.type==='missile')finaleMissile(items,x,time,fx);else part(items,'box',x.pos,[.15,.15,2.8],x.color,1,spaceBasisDir(x.vel));
  for(const x of e.hostile)part(items,'octa',x.pos,[.65,.65,2.5],x.color,1,spaceBasisDir(x.vel));
  for(const x of e.explosions){const u=1-x.life/x.max;part(items,'sphere',x.pos,[4+u*8,4+u*8,4+u*8],'#ffc58c',.9,SPACE_IDENTITY,1-u);part(items,'lightRing',x.pos,[4+u*18,4+u*18,1],'#ffd9a1',1,SPACE_IDENTITY,1-u);}
  return items;
 };
 spaceCamera=function(e,time,preview){
  if(!active(e)||e.crash)return old.camera(e,time,preview);const p=e.player.pos,rect=ARCADE.canvas?.getBoundingClientRect?.(),portrait=rect&&rect.height>rect.width;
  return stationLook(V3.add(p,[0,6,28]),V3.add(p,[0,2,-110]),portrait?1.32:1.04,{near:.4,far:6000,lights:[{pos:V3.add(p,[0,15,4]),color:[.7,1,1.2]},{pos:[0,0,-100],color:[1,.55,.8]}]});
 };
 drawFinaleHUD=function(c,e,cam,w,h){
  if(!active(e))return old.hud(c,e,cam,w,h);c.clearRect(0,0,w,h);if(e.status!=='playing')return;
  const W=Math.max(320,ARCADE.canvas?.getBoundingClientRect?.().width||w),H=h/w*W,s=state(e),g=goal(e),mobile=W<700,a=s.attack;
  c.save();c.scale(w/W,w/W);c.textBaseline='middle';c.textAlign='center';const bw=Math.min(W-24,580),left=(W-bw)/2;
  c.fillStyle='#071524e8';c.fillRect(left,10,bw,68);c.fillStyle='#e8edf0';c.font='bold '+(mobile?13:17)+'px Arial';c.fillText(e.objective().title,W/2,29,bw-16);
  c.fillStyle=a&&a.phase!=='recover'?pattern(a).color:'#accdcf';c.font=(mobile?10:12)+'px Arial';c.fillText(e.objective().progress,W/2,51,bw-16);
  for(let i=0;i<4;i++){c.fillStyle=e.enemies.some(x=>x.slot===i&&!x.dead)?i===s.sector?'#ffd18b':'#74688f':'#83d6b3';c.fillRect(W/2-40+i*22,66,15,4);}
  const aim=spaceProject(V3.add(e.player.pos,[0,0,-82]),cam,W,H);c.strokeStyle=e.lock?'#ffdb99':'#c4f7ef';c.lineWidth=1.6;
  for(const sign of [-1,1]){arcadeLine(c,aim.x+sign*8,aim.y,aim.x+sign*19,aim.y);arcadeLine(c,aim.x,aim.y+sign*8,aim.x,aim.y+sign*19);}
  if(g){const q=spaceProject(g.pos,cam,W,H),x=clamp(q.x,25,W-25),y=clamp(q.y,105,H-88),radius=clamp(g.r*q.scale+6,15,48);c.strokeStyle='#ffd18b';c.setLineDash([5,4]);c.strokeRect(x-radius,y-radius,radius*2,radius*2);c.setLineDash([]);c.fillStyle='#ffdda7';c.font='bold '+(mobile?10:12)+'px Arial';c.fillText(g.beacon2110?'МАЯК '+(g.slot+1):'КРИСТАЛЛ',x,Math.max(93,y-radius-12));c.fillStyle='#344455';c.fillRect(x-28,y+radius+7,56,4);c.fillStyle='#ffd18b';c.fillRect(x-28,y+radius+7,56*g.hp/g.maxHp,4);}
  const by=H-49;c.fillStyle='#061725e5';c.fillRect(10,by-16,W-20,56);c.fillStyle=e.player.hp<30?'#ff9d87':'#bff7eb';c.textAlign='left';c.font='bold '+(mobile?12:15)+'px Arial';c.fillText('ЩИТ '+Math.ceil(e.player.hp),22,by);c.textAlign='right';c.fillStyle='#ffdda4';c.fillText('РАКЕТЫ '+e.player.missiles,W-22,by);
  c.textAlign='center';c.fillStyle='#a3c8cd';c.font=(mobile?9:11)+'px Arial';c.fillText(e.lock?'ЦЕЛЬ ЗАХВАЧЕНА · ОГОНЬ / РАКЕТА':'WASD / ДЖОЙСТИК — СМЕЩЕНИЕ · СОВМЕСТИТЕ ПРИЦЕЛ',W/2,H-25,W-36);
  c.restore();
 };
 finaleOverlay=function(e){
  let html=old.overlay(e);if(e?.status!=='finalebrief'||typeof html!=='string')return html;
  return html.replace('Уклоняйся от щупалец → 4 опоры → ядро','Перелёты вдоль корпуса → 4 маяка → кристалл')
   .replace(/<div class="brief-command">[\s\S]*?<\/div><\/div>/g,'')
   .replace('<button class="arcade-play"','<div class="brief-command"><span class="hostile-symbol">◈</span><div><b>Параллакс · живая мегабаза</b><small>Летим вдоль корпуса: четыре маяка → кристалл-вход. WASD или джойстиком смещай корабль, совмести прицел с маяком и стреляй. Замахи щупалец видны во всех режимах. Ракеты ускоряют разрушение; импульс отбивает удар.</small></div></div><button class="arcade-play"')
   .replace(/(<button class="arcade-play" data-action="finale-launch">[^<]*<\/button>)<small>[\s\S]*?<\/small>/,'$1<small>Каждый маяк отключает пару щупалец. Перелёты идут автоматически; уклонение и огонь — за пилотом. Контрольные точки сохраняются.</small>');
 };
 const help='Курс между маяками автоматический. WASD / джойстик — смещение; огонь — удерживать. Ракеты ускоряют бой, импульс отбивает замах щупалец.';
 function explain(e){e.notify('ПОЛЁТ ВДОЛЬ КОРПУСА',help);return true;}
 arcadeAction=function(action,...args){if(active(ARCADE.engine)&&['citadel-guidance','citadel-primary','citadel-crystal'].includes(action))return explain(ARCADE.engine);return old.action.call(this,action,...args);};
 mobileAction=function(action,...args){if(active(ARCADE.engine)&&action==='mobile-guide')return explain(ARCADE.engine);return old.mobile.call(this,action,...args);};
 updateArcadeHUD=function(...args){
  const r=old.update.apply(this,args),e=ARCADE.engine;if(!active(e))return r;
  for(const [id,label]of [['citadel-primary','Курс вдоль корпуса'],['citadel-guidance','G · Управление'],['mobile-guide','Управление']]){
   const el=document.getElementById(id);if(el){el.textContent=label;el.setAttribute('aria-label',label+' · подсказка');el.removeAttribute('aria-pressed');}
  }
  const bar=document.getElementById('arcade-bossbar');if(bar)bar.hidden=true;
  for(const el of document.querySelectorAll('.mobile-controls-help,.mobile-toolbox > p'))el.textContent=help;
  for(const el of document.querySelectorAll('#citadel-quickbar [data-action="citadel-guidance"]'))el.textContent='G · Управление';
  return r;
 };
 globalThis.CITADEL_LEVIATHAN=Object.freeze({version:VERSION,active,arena,goal,targets,attackGeometry,limb,bodyWidth:240,shipWidth:6,patterns});
})();
