/* Five mineral families, cinematic blasts and articulated deaths.
 * Transient FX use simulation time, bounded storage and the existing renderer.
 * Geometry, random seeds and rendering never advance gameplay RNG. */
(()=>{
 'use strict';if(globalThis.CITADEL_CINEMA2179)return;
 const P=RequirementArcade.prototype,TAU=Math.PI*2,states=new WeakMap(),seen=new WeakSet();
 const old={step:P.step,hit:P.hit,boardHit:P.boardHit,block:P.blockFlightShot,scene:spaceScene};
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),fract=x=>x-Math.floor(x);
 const rand=(seed,i)=>fract(Math.sin(seed*12.9898+i*78.233)*43758.5453);
 const minerals=Object.freeze([
  {id:'basalt',name:'Базальт',color:'#777f88',dust:'#a5aab0',breakup:'radial',speed:12,count:9},
  {id:'slate',name:'Слоистая плита',color:'#8a7e76',dust:'#c4afa0',breakup:'sheets',speed:9,count:7},
  {id:'iron',name:'Железистая глыба',color:'#7b817c',dust:'#f3c38a',breakup:'heavy',speed:7,count:6},
  {id:'ice',name:'Ледяной кристалл',color:'#94b9c5',dust:'#c8f3ff',breakup:'splinters',speed:20,count:14},
  {id:'pumice',name:'Пористый камень',color:'#998b79',dust:'#cfbca1',breakup:'crumble',speed:15,count:12}
 ]);
 const blasts=Object.freeze([
  {id:'reactor',name:'Реактор',hot:'#fff9d0',flame:'#ffb344',edge:'#c74926',n:72,spread:1},
  {id:'missile',name:'Ракета',hot:'#fff5e4',flame:'#ff8646',edge:'#a52e20',n:78,spread:.78},
  {id:'ion',name:'Ионный разряд',hot:'#efffff',flame:'#72dcff',edge:'#466bd5',n:72,spread:1.3},
  {id:'plasma',name:'Плазма',hot:'#fff0ff',flame:'#de8aff',edge:'#7047bb',n:72,spread:1.12},
  {id:'collapse',name:'Схлопывание ядра',hot:'#f3ffdf',flame:'#a8f0c6',edge:'#428f95',n:72,spread:.9}
 ]);
 function seedOf(x){return (x.id||0)+x.pos[0]*.71+x.pos[1]*1.17+x.pos[2]*.37+(x.phase||0)*11;}
 function family(x){return Number.isInteger(x.mineral2179)?minerals[(x.mineral2179%5+5)%5]:minerals[Math.floor(rand((x.id||0)+(x.phase||0)*11+(x.variant||0)*7+(x.r||1)*3,2)*5)];}
 function state(e){const key=(e.campaign2120?.mission||e.stage)+'/'+e.phase,board=e.board||null;let s=states.get(e);if(!s||s.key!==key||s.board!==board){s={key,board,clock:0,rocks:[],deaths:[],lastLine:-100};states.set(e,s);}return s;}
 function part(a,mesh,pos,size,color,em=0,basis=SPACE_IDENTITY,alpha=1){const q=citadelItem(mesh,pos,size,color,em,basis,alpha);q.cinema2179=true;a.push(q);return q;}
 function rockMesh(type,lod){const seg=lod?12:24,rings=lod?7:13,v=[],f=[];
  for(let y=0;y<=rings;y++)for(let x=0;x<seg;x++){
   const t=y/rings*Math.PI,p=x/seg*TAU,u=[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)];
   let r=.82+.11*Math.sin(p*3+t*7+type)+.07*Math.cos(p*5-t*3);
   if(type===2)r*=.75+.25*Math.abs(Math.cos(p));
   if(type===4)for(let k=0;k<7;k++){const a=k*2.399,b=.5+rand(43,k)*2.1,d=[Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];r-=.24*Math.exp(-(V3.len(V3.sub(u,d))**2)*32);}
   const scales=type===1?[1,.29,.72]:type===3?[.56,1,.56]:type===2?[1,.68,.65]:[.91,.86,.93];
   if(type===3)r=.68+.28*Math.abs(Math.cos(t))+.08*Math.cos(p*4);
   v.push(u.map((n,i)=>n*r*scales[i]));
  }
  for(let y=0;y<rings;y++)for(let x=0;x<seg;x++)f.push([y*seg+x,y*seg+(x+1)%seg,(y+1)*seg+(x+1)%seg,(y+1)*seg+x]);
  const max=Math.max(...v.map(p=>V3.len(p)));SPACE_MESH['mineral2179_'+type+'_'+lod]=spaceMesh(v.map(p=>V3.scale(p,.99/max)),f,false);
 }
 for(let i=0;i<5;i++)for(let lod=0;lod<2;lod++)rockMesh(i,lod);
 function rockDeath(e,r){if(seen.has(r)||r.wall)return;seen.add(r);const s=state(e),m=family(r),seed=seedOf(r),index=minerals.indexOf(m);
  const pieces=Array.from({length:m.count},(_,i)=>{const a=i*2.399+seed,b=(rand(seed,i+4)-.5)*1.7,d=V3.norm([Math.cos(a),b,Math.sin(a)]),k=.5+rand(seed,i+9);
   if(m.breakup==='sheets'){d[1]*=.12;d[0]*=1.4;}if(m.breakup==='splinters')d[1]*=1.8;
   return{vel:V3.scale(d,m.speed*k),offset:V3.scale(d,r.r*.22),size:r.r*(m.breakup==='crumble'?.10:.17)*(1+rand(seed,i+18)),spin:[rand(seed,i+22)*3,rand(seed,i+42)*3,rand(seed,i+62)*3]};});
  s.rocks.push({pos:r.pos.slice(),r:r.r,index,age:0,life:2.8,seed,pieces});if(s.rocks.length>10)s.rocks.shift();
  e.explosions.push({pos:r.pos.slice(),life:1.5,max:1.5,color:m.dust,mineral2179:index,style2179:index,size2179:Math.max(2,r.r*.7)});
 }
 // The legacy orbit path hit a COPY of each asteroid and never reduced HP.
 // Handle the real nearest rock before that path, retaining hull occlusion.
 P.blockFlightShot=function(from,to,shot,hostile){
  if(old.block?.apply(this,arguments))return true;
  if(hostile||this.board||this.finale||['escort','pursuit','swarm'].includes(this.phase))return false;
  let rock=null,nearest=2;
  for(const r of this.asteroids||[]){if(r.dead||r.wall)continue;const t=flightSegment(from,to,r.pos,r.r+(shot.r||0));if(t!==null&&t<nearest){nearest=t;rock=r;}}
  if(!rock)return false;
  for(const x of [...this.enemies,...(this.boss?[this.boss]:[])])if(!x.dead){const t=flightSegment(from,to,x.pos,x.r+(shot.r||0));if(t!==null&&t<=nearest)return false;}
  const damage=Number(shot.damage);if(!(damage>0)||!Number.isFinite(damage))return true;
  rock.hp=(Number.isFinite(rock.hp)?rock.hp:35+rock.r*6)-damage;rock.hit=.15;
  if(rock.hp<=0){rock.dead=true;rockDeath(this,rock);this.asteroids=this.asteroids.filter(x=>!x.dead);this.emit('destroy','asteroid');}
  else this.burst(V3.lerp(from,to,nearest),family(rock).dust,5);
  return true;
 };
 P.hit=function(x,amount){const alive=x&&!x.dead,before=this.explosions.length,r=old.hit.apply(this,arguments);if(alive&&x.dead){for(let i=before;i<this.explosions.length;i++){const q=this.explosions[i];if(!q.warp){q.style2179=Math.floor(rand(seedOf(x),8)*5);q.size2179=Math.min(12,Math.max(3,x.r||4));}}}return r;};
 function deathParts(x,kind){const mech=kind==='mech',dog=kind==='dog',scale=mech?1:dog?.7:.55;
  const specs=dog?[
   ['b270_plate',[0,1.1,0],[.6,.4,1.1],'#82414b'],['b280_skull',[0,1.4,1.1],[.3,.35,.5],'#c2c5b6'],
   ...[-1,1].flatMap(side=>[-1,1].map(end=>['b270_plate',[side*.55,.5,end*.7],[.14,.5,.16],'#7e949a']))
  ]:[['b280_skull',[0,5.9,.25],[.5,.55,.48],'#dbd8c4'],['b270_armour',[0,4.3,0],[1.05,1,.6],mech?'#6f8791':'#607984'],
   ...[-1,1].flatMap(side=>[['b270_tube',[side*1.55,3.5,.2],[.4,.4,1.15],'#d4cfb7'],['b270_plate',[side*.78,1.6,.1],[.33,1.35,.37],'#7a8991'],['b270_plate',[side*.8,.25,.6],[.48,.23,.65],'#984b4f']])];
  const yaw=x.yaw||0,b=stationYaw(yaw),origin=x.pos,seed=seedOf(x);
  return specs.map(([mesh,p,size,color],i)=>{if(!mech&&!dog){p=p.map(n=>n*scale);size=size.map(n=>n*scale);}
   const offset=spacePoint(spaceModel([0,0,0],[1,1,1],b),p),a=(i*2.399+yaw),speed=mech?3.5:dog?3:2.5;
   return{mesh,offset,size,color,vel:[Math.cos(a)*speed*(.7+rand(seed,i)),2+rand(seed,i+20)*4,Math.sin(a)*speed],spin:[(rand(seed,i+40)-.5)*5,(rand(seed,i+50)-.5)*6,(rand(seed,i+60)-.5)*5],delay:mech?i===0?.08:i<4?.20:.32:0};});
 }
 function enemyLine(e,text,label,anchor){globalThis.CITADEL_VOICE?.enemyLine?.(text,{label,anchor});}
 P.boardHit=function(x,amount,source,ignoreShield){const alive=x&&!x.dead,before=this.explosions.length,r=old.boardHit.apply(this,arguments);if(!alive||!x.dead||seen.has(x))return r;seen.add(x);
  const s=state(this),kind=x.missions270?.kind||(/dog|robo/i.test(x.archetype)?'dog':'human');
  for(let i=before;i<this.explosions.length;i++){const q=this.explosions[i];q.ground2179=true;q.size2179=kind==='mech'?1:.45;q.life=q.max=.6;q.style2179=kind==='mech'?2:0;}
  s.deaths.push({pos:x.pos.slice(),kind,age:0,life:kind==='mech'?3.8:2.8,seed:seedOf(x),parts:deathParts(x,kind),subject:{...x,dead:false,missions270:x.missions270?{...x.missions270,beams:[],speed:0}:null}});if(s.deaths.length>8)s.deaths.shift();
  if(kind==='mech'&&s.clock-s.lastLine>5){s.lastLine=s.clock;enemyLine(this,'Нет… Системы отказали! Требования… не пропускать!','ОСАДНЫЙ МЕХ',V3.add(x.pos,[0,5.5,0]));}
  return r;
 };
 P.step=function(dt,input){const active=['playing','boarding'].includes(this.status)&&!this.campaign2120?.modal&&!this.crash,s=active?state(this):null,rocks=active?(this.asteroids||[]).slice():[];
  const r=old.step.apply(this,arguments);if(!s||state(this)!==s)return r;
  const d=clamp(Number(dt)||0,0,.04);s.clock+=d;
  for(const q of [...s.rocks,...s.deaths])q.age+=d;
  s.rocks=s.rocks.filter(x=>x.age<x.life);s.deaths=s.deaths.filter(x=>x.age<x.life);
  for(const x of rocks)if(x.dead||x.hp<=0)rockDeath(this,x);
  return r;
 };
 function debris(a,e,fx){const s=states.get(e);if(!s)return;
  const low=fx===false||isMobileLayout()||!ARCADE.renderer?.gl;
  for(const d of s.rocks){const alpha=clamp((d.life-d.age)/.7);for(const f of d.pieces){const t=d.age,p=V3.add(d.pos,V3.add(f.offset,V3.scale(f.vel,t))),size=f.size*(1-t*.11);part(a,'mineral2179_'+d.index+'_'+Number(low),p,[size,size,size],minerals[d.index].color,0,flightBasis(f.spin[0]+t*f.spin[1],f.spin[2]+t, t*f.spin[0]),alpha);}}
  for(const d of s.deaths){if(V3.len(V3.sub(d.pos,e.board?.camera||e.player.pos))>65)continue;
   if(d.kind!=='human'&&d.age<.23){const actor={...d.subject,pos:V3.add(d.pos,[0,-d.age*.5,0])};a.push(...CITADEL_BASE_MISSIONS_VIEW.actor(d.kind,actor,!low,d.age,true));continue;}
   for(let i=0;i<d.parts.length;i++){const f=d.parts[i],t=Math.max(0,d.age-f.delay),p=V3.add(d.pos,V3.add(f.offset,V3.scale(f.vel,t))),fall=p[1]-5.5*t*t,floor=d.pos[1]+Math.min(...f.size)*.6;
    p[1]=Math.max(floor,fall);const landed=fall<floor,spinT=landed?Math.min(t,1.15):t,basis=flightBasis(f.spin[0]*spinT,f.spin[1]*spinT,f.spin[2]*spinT),alpha=clamp((d.life-d.age)/.7);
    const q=part(a,f.mesh,p,f.size,f.color,0,basis,alpha);q.deathPart2179=d.kind;q.deathPiece2179=i;
    if(d.kind==='mech'){part(a,'b270_plate',V3.add(p,V3.scale(basis.f,f.size[2])),f.size.map(n=>n*.46),i===0?'#a52f38':'#b39d76',0,basis,alpha);if(i===0&&d.age<.9)part(a,'box',V3.add(p,V3.scale(basis.f,.5)),[.3,.06,.03],'#f56c4d',.7,basis,alpha);}
   }
  }
 }
 spaceScene=function(e,time,fx){let a=old.scene.apply(this,arguments);if(!e.campaign2120?.modal&&!e.board&&!e.crash){
   const low=fx===false||isMobileLayout()||!ARCADE.renderer?.gl;
   for(let i=0;i<a.length;i++){const item=a[i];if(!/^(rock[0-2]|p220_rock[0-2])$/.test(item.mesh))continue;
    const rock=e.asteroids.find(x=>!x.dead&&x.pos===item.pos)||e.asteroids.find(x=>!x.dead&&V3.len(V3.sub(x.pos,item.pos))<.001);if(!rock||rock.wall)continue;
    const m=family(rock),index=minerals.indexOf(m);item.mesh='mineral2179_'+index+'_'+Number(low);item.color=spaceColor(rock.hit>0?'#e0c9a2':m.color);item.mineral2179=m.id;
   }
  }debris(a,e,fx);return a;};
 function orb(c,x,y,r,color,alpha){if(r<=0||alpha<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.35,color+'b0');g.addColorStop(1,color+'00');c.globalAlpha=alpha;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
 function blast(c,x,cam,W,H,fx=true){const q=spaceProject(x.pos,cam,W,H);if(q.z<=.4||q.x<-W*.3||q.x>W*1.3||q.y<-H*.3||q.y>H*1.3)return;
  const t=clamp(1-x.life/x.max),seed=seedOf(x),index=Number.isInteger(x.style2179)?x.style2179:Math.floor(rand(seed,14)*5),v=blasts[(index%5+5)%5],size=x.size2179||4,fade=(1-t),r=clamp((size+(index===4&&t<.22?10*(.22-t):t*(x.ground2179?4:21)))*q.scale,4,Math.max(W,H)*.44);
  const n=fx===false||r<18?18:isMobileLayout()?48:v.n,turn=rand(seed,3)*TAU;
  c.save();c.translate(q.x,q.y);c.globalCompositeOperation='screen';
  orb(c,0,0,r*1.6,v.flame,fade*.65);orb(c,0,0,r*.57,v.hot,fade);orb(c,0,0,r*.19,'#ffffff',fade);
  // 24 irregular hot lobes, 24 cooler smoke cells, three streak layers and
  // large fragments: >210 visible details at close mobile/desktop range.
  for(let i=0;i<24;i++){const a=i*2.399+turn,travel=r*(.2+.8*rand(seed,i+10))*t**.25,rr=r*(.10+.16*rand(seed,i+40))*(1-t*.7);
   c.globalAlpha=fade*.45;c.fillStyle=i%3?v.flame:v.hot;c.beginPath();c.ellipse(Math.cos(a)*travel,Math.sin(a)*travel*v.spread,rr,rr*(.6+rand(seed,i+90)),a,0,TAU);c.fill();}
  for(let layer=0;layer<3;layer++){c.strokeStyle=layer===0?v.edge:layer===1?v.flame:v.hot;c.lineWidth=(3-layer)*Math.max(.65,r*.012);c.globalAlpha=fade*(layer===2?.95:.6);c.beginPath();
   for(let i=0;i<n;i++){const a=i*2.399+turn+layer*.11,travel=r*(.65+rand(seed,i+120)*1.4)*(1+layer*.08),tail=(.08+.18*rand(seed,i+140))*r,stretch=index===1?1.5:1;const px=Math.cos(a)*travel,py=Math.sin(a)*travel*v.spread;
    c.moveTo(px,py);c.lineTo(px+Math.cos(a)*tail*stretch,py+Math.sin(a)*tail*v.spread);}
   c.stroke();}
  for(let i=0;i<(index===2||index===3?3:2);i++){c.strokeStyle=i?v.flame:v.hot;c.globalAlpha=fade*.7;c.lineWidth=Math.max(1,r*.025);c.beginPath();c.ellipse(0,0,r*(1.1+i*.35),r*(.35+i*.17),turn+i*.8,0,TAU);c.stroke();}
  if(index===2||index===3){c.strokeStyle=v.hot;c.lineWidth=1;c.globalAlpha=fade;c.beginPath();for(let j=0;j<8;j++){const a=j*TAU/8+turn;for(let i=0;i<9;i++){const rad=r*(.3+i*.13),angle=a+Math.sin(i*3+j)*.09,px=Math.cos(angle)*rad,py=Math.sin(angle)*rad;(i?c.lineTo:c.moveTo).call(c,px,py);}}c.stroke();}
  c.globalCompositeOperation='source-over';
  for(let i=0;i<24;i++){const a=i*2.399+turn,travel=r*(.3+rand(seed,i+210)*.55),rr=r*(.08+rand(seed,i+230)*.13);c.globalAlpha=Math.sin(t*Math.PI)*.18;c.fillStyle=i%2?'#43505a':'#302e39';c.beginPath();c.ellipse(Math.cos(a)*travel,Math.sin(a)*travel*v.spread,rr,rr*.7,a,0,TAU);c.fill();}
  for(let i=0;i<16;i++){const a=i*2.399+turn,travel=r*(.6+rand(seed,i+300)*.9),xx=Math.cos(a)*travel,yy=Math.sin(a)*travel*v.spread,sz=Math.max(1.4,r*.025);c.globalAlpha=fade;c.fillStyle=i%3?'#665d57':v.hot;c.beginPath();c.moveTo(xx-sz,yy-sz);c.lineTo(xx+sz*1.8,yy);c.lineTo(xx,yy+sz);c.closePath();c.fill();}
  c.restore();
 }
 function draw(c,e,cam,W,H,fx){const s=states.get(e);if(!s||e.campaign2120?.modal)return;
  for(const d of s.deaths)if(d.age<.65)blast(c,{pos:V3.add(d.pos,[0,d.kind==='mech'?3:1,0]),life:.65-d.age,max:.65,ground2179:true,style2179:d.kind==='mech'?2:0,size2179:d.kind==='mech'?1.1:.45},cam,W,H,fx);
 }
 globalThis.CITADEL_CINEMA2179=Object.freeze({version:'2.17.9',minerals,blasts,family,state,rockDeath,deathParts,blast,draw,enemyLine,limits:{rocks:10,deaths:8,blasts:8},detailCount:fx=>3*(fx?48:18)+24+24+16+5});
})();
