/* Citadel 2.3.0 — authored convoy encounters and coordinated airborne packs.
 * All simulation data lives in escort/enemies. No timers, listeners or emit wrappers.
 * In-flight legacy saves continue the original rules until the next departure.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_CONVOY)return;
 const VERSION='2.3.0',proto=RequirementArcade.prototype;
 const old={begin:proto.beginEscort,step:proto.stepEscort,hit:proto.hit,pulse:proto.pulse,nav:proto.navTarget,objective:proto.objective};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>V3.len(V3.sub(a,b));
 const active=e=>e.phase==='escort'&&e.escort?.ops230?.version===VERSION;
 const roles={
  scout:{name:'Перехватчик',hp:110,r:3.4,color:'#f49d7e',speed:23},
  dog:{name:'Летающая робособака',hp:135,r:3.2,color:'#ffad67',speed:31},
  raider:{name:'Штурмовик',hp:230,r:4.4,color:'#e8788e',speed:20},
  jammer:{name:'Глушитель',hp:250,r:4.6,color:'#b49af6',speed:17},
  bomber:{name:'Торпедоносец',hp:250,r:5,color:'#e2b968',speed:16},
  shield:{name:'Щитоносец',hp:340,r:5.4,color:'#78cde6',speed:16},
  commander:{name:'Вожак стаи',hp:330,r:5,color:'#f3d789',speed:21}
 };
 const missions=[
  {name:'Коридор исполнения',subtitle:'Первый контакт',duration:68,color:'#76dce8',formation:'КЛИН',brief:'Сначала разведчики, затем стая реактивных робособак. Они собираются на фланге, отмечают транспорт и атакуют вместе. Сбивайте собак до рывка; импульс E срывает заход.',groups:[
   {at:4,name:'Разведывательная пара',kind:'flank',roles:['scout','scout']},
   {at:22,name:'Реактивная стая',kind:'pack',roles:['dog','dog','dog']},
   {at:43,name:'Перекрёстный огонь',kind:'crossfire',roles:['raider','scout','dog','dog']} ]},
  {name:'Переход интеграций',subtitle:'Засада в узле связи',duration:90,color:'#b3a0f1',formation:'КОЛОННА',brief:'Стаи прикрывают глушителей и торпедоносцев. Глушитель задерживает переход. Янтарные торпеды можно сбить лазером или ракетой; E уничтожает ближайшие. Меняйте цель клавишей Tab.',groups:[
   {at:4,name:'Захват канала',kind:'jam',roles:['jammer','dog','dog']},
   {at:24,name:'Торпедная засада',kind:'torpedo',roles:['bomber','scout','dog','dog']},
   {at:46,name:'Фланговые клещи',kind:'crossfire',roles:['raider','raider','dog','dog']},
   {at:68,name:'Удар под прикрытием',kind:'shield',roles:['shield','bomber','jammer','dog']} ]},
  {name:'Последняя миля согласования',subtitle:'Охота на архив',duration:114,color:'#e9bd80',formation:'РАССЕЯННЫЙ СТРОЙ',brief:'Вожаки направляют стаи на самый уязвимый транспорт. Щитоносцы защищают соседей. Сначала уничтожайте командира или щитоносца, затем торпедоносцев. Последние группы заходят с двух флангов.',groups:[
   {at:4,name:'Охотничье звено',kind:'command',roles:['commander','dog','dog','scout']},
   {at:25,name:'Бронированный клин',kind:'shield',roles:['shield','bomber','dog','dog','raider']},
   {at:47,name:'Глушение и захват',kind:'jam',roles:['jammer','jammer','dog','dog','scout']},
   {at:71,name:'Двойной торпедный удар',kind:'torpedo',roles:['bomber','bomber','shield','dog','dog']},
   {at:94,name:'Последний перехват',kind:'command',roles:['commander','shield','raider','dog','dog','dog']} ]}
 ];
 const allies=e=>e.escort.allies.filter(a=>!a.dead);
 function log(e,kind,data={}){const o=e.escort.ops230;o.events.push({at:+e.escort.time.toFixed(2),kind,...data});if(o.events.length>48)o.events.shift();}
 function formation(e){const t=e.escort.time,k=e.stage;return k===0?0:k===1?(Math.floor(t/22)%2?1:0):(Math.floor(t/18)%3);}
 function goalForAlly(e,i){const pattern=formation(e),base=[[-17,1,-46],[17,5,-62],[0,-4,-85]][i];
  const p=pattern===1?[[0,2,-44],[-5,4,-66],[5,-2,-88]][i]:pattern===2?[[-25,7,-55],[25,-6,-63],[0,6,-93]][i]:base;
  return [p[0]+Math.sin(e.escort.time*.32+i)*1.4,p[1]+Math.sin(e.escort.time*.52+i)*.8,p[2]];
 }
 proto.beginEscort=function(...args){const ok=old.begin.apply(this,args);if(!ok)return ok;const c=this.escort,m=missions[this.stage];
  c.definition={...c.definition,name:m.name,duration:m.duration,color:m.color};
  c.ops230={version:VERSION,groups:[],next:0,serial:0,formation:0,events:[],stats:{spawned:0,volleys:0,dogRuns:0,dogHits:0,torpedoes:0,intercepts:0,shieldHits:0,disruptions:0,peakEnemies:0,peakHostile:0}};
  this.say(m.subtitle+'. '+m.brief,'alert',true);return ok;
 };
 function targetAlly(e,g){let a=e.escort.allies[g.target];if(!a||a.dead){a=allies(e)[0];if(a)g.target=e.escort.allies.indexOf(a);}return a;}
 function members(e,g){return e.enemies.filter(x=>!x.dead&&x.squad===g.id&&!x.torpedo);}
 function spawnGroup(e,plan){const c=e.escort,o=c.ops230,id=++o.serial;
  const available=allies(e),a=available[id%available.length];if(!a)return;
  const g={id,kind:plan.kind,name:plan.name,target:c.allies.indexOf(a),state:'assemble',time:0,cycle:0,disrupt:0,flank:id%2?1:-1,originAt:c.time};o.groups.push(g);
  plan.roles.forEach((role,i)=>{const d=roles[role],side=plan.kind==='crossfire'?(i%2?1:-1):g.flank;
   e.enemies.push({id:e.entityId++,type:role==='dog'?'scout':'heavy',role,convoy230:true,squad:id,slot:i,ally:g.target,
    name:d.name,pos:[side*(39+i*2),12-i*6,-139-i*7],vel:[0,0,0],hp:d.hp,maxHp:d.hp,r:d.r,color:d.color,
    dead:false,warp:1,age:0,hit:0,phase:i*1.7,channel:false,shot:0,order:'assemble',attackCount:-1,dogHit:false,shielded:false});
  });o.stats.spawned+=plan.roles.length;log(e,'group',{id,kind:plan.kind,count:plan.roles.length});e.emit('warp');e.say(plan.name+'. Цель противника: '+a.name+'.','alert',true);
 }
 function transition(e,g,state){g.state=state;g.time=0;for(const x of members(e,g)){x.order=state;x.dogHit=false;}
  if(state==='telegraph'){
   const live=members(e,g),leader=live.some(x=>x.role==='commander');
   if(leader){const weakest=allies(e).sort((a,b)=>a.hp-b.hp)[0];g.target=e.escort.allies.indexOf(weakest);}
   for(const x of live)x.ally=g.target;
   log(e,'mark',{squad:g.id,target:g.target,coordinated:leader});
  }
  if(state==='attack'){g.cycle++;log(e,'attack',{squad:g.id,target:g.target,cycle:g.cycle});}
 }
 function torpedo(e,x,a){if(e.enemies.filter(n=>!n.dead&&n.torpedo).length>=5)return;
  const p=x.pos.slice(),v=V3.scale(V3.norm(V3.sub(a.pos,p)),19);e.enemies.push({id:e.entityId++,name:'Торпеда → '+a.name,role:'torpedo',torpedo:true,convoy230:true,squad:x.squad,
   ally:x.ally,pos:p,vel:v,hp:25,maxHp:25,r:1.5,color:'#ffe5a3',warp:0,hit:0,age:0,life:12,dead:false});e.escort.ops230.stats.torpedoes++;log(e,'torpedo',{squad:x.squad,target:x.ally});
 }
 function shot(e,x,a,player=false){if(e.hostile.length>=64)return;const aim=player?e.player.pos:a.pos,speed=player?44:33;
  e.hostile.push({pos:x.pos.slice(),vel:V3.scale(V3.norm(V3.sub(aim,x.pos)),speed),life:5,damage:x.role==='raider'?10:6,r:.9,color:x.color,ally:player?-1:x.ally});e.escort.ops230.stats.volleys++;
 }
 function hurtAlly(e,a,amount){if(!a||a.dead)return;a.hp=Math.max(0,a.hp-amount*(e.assist?.68:1));a.hit=.35;
  if(a.hp<=0){a.dead=true;e.explosions.push({pos:a.pos.slice(),life:1.5,max:1.5,color:'#a8e5d0'});e.notify('ПОТЕРЯ ТРАНСПОРТА',a.name);log(e,'transport-lost',{target:e.escort.allies.indexOf(a)});}
 }
 function move(x,goal,speed,dt){const prev=x.pos.slice(),d=V3.sub(goal,x.pos),n=V3.len(d),desired=V3.scale(V3.norm(d),Math.min(speed,n*2));x.vel=V3.lerp(x.vel,desired,Math.min(1,dt*3.5));x.pos=V3.add(x.pos,V3.scale(x.vel,dt));return prev;}
 function stepUnit(e,x,g,dt){x.age+=dt;x.warp=Math.max(0,x.warp-dt);x.hit=Math.max(0,x.hit-dt);if(x.warp>0)return;
  const a=targetAlly(e,g);if(!a)return;const leader=members(e,g).some(n=>n.role==='commander'),side=g.kind==='crossfire'?(x.slot%2?1:-1):g.flank;
  let goal=V3.add(a.pos,[side*(20+x.slot%2*8),(x.slot%3-1)*10,-32-x.slot*4]);
  x.channel=x.role==='jammer'&&g.state!=='assemble'&&g.disrupt<=0;
  if(g.state==='regroup')goal=V3.add(a.pos,[side*(30+x.slot*3),(x.slot%3-1)*12,-55]);
  if(g.state==='attack'&&g.disrupt<=0){
   const delay=x.slot*(leader?.22:.42),t=g.time-delay;
   if(x.role==='dog'){
    if(t>=0&&t<2.3&&!x.dogHit){goal=a.pos.slice();if(x.attackCount!==g.cycle){x.attackCount=g.cycle;e.escort.ops230.stats.dogRuns++;}}
    else goal=V3.add(a.pos,[-side*(20+x.slot*4),12-x.slot*5,4]);
   }else if(t>=0&&x.attackCount!==g.cycle){x.attackCount=g.cycle;if(x.role==='bomber')torpedo(e,x,a);else if(x.role!=='shield'&&x.role!=='jammer'){shot(e,x,a);if(x.role==='scout')shot(e,x,a,true);}}
  }
  const previous=move(x,goal,x.role==='dog'&&g.state==='attack'?52:roles[x.role].speed,dt);
  if(x.role==='dog'&&g.state==='attack'&&g.disrupt<=0&&!x.dogHit&&flightSegment(previous,x.pos,a.pos,7)!==null){x.dogHit=true;hurtAlly(e,a,11);e.escort.ops230.stats.dogHits++;}
 }
 proto.hit=function(x,amount){if(!active(this)||!x.convoy230)return old.hit.call(this,x,amount);if(x.dead||x.warp>0)return;
  if(x.torpedo){x.hp-=amount;x.hit=.15;if(x.hp<=0){x.dead=true;this.escort.ops230.stats.intercepts++;this.explosions.push({pos:x.pos.slice(),life:.5,max:.5,color:x.color});this.emit('destroy','escort');}return;}
  if(x.shielded){amount*=.42;this.escort.ops230.stats.shieldHits++;}
  old.hit.call(this,x,amount);
  if(x.dead&&x.role==='commander'){const g=this.escort.ops230.groups.find(g=>g.id===x.squad);if(g){g.disrupt=3;transition(this,g,'regroup');this.escort.ops230.stats.disruptions++;log(this,'leader-down',{squad:g.id});this.notify('СТАЯ ДЕЗОРГАНИЗОВАНА','Три секунды на перехват');}}
 };
 proto.pulse=function(...args){const ok=old.pulse.apply(this,args);if(ok&&active(this)){
  for(const x of this.enemies)if(x.torpedo&&!x.dead&&dist(x.pos,this.player.pos)<105)this.hit(x,75);
  for(const g of this.escort.ops230.groups)if(members(this,g).some(x=>x.role==='dog'&&dist(x.pos,this.player.pos)<100)){g.disrupt=2;transition(this,g,'regroup');this.escort.ops230.stats.disruptions++;}
  log(this,'cover');}return ok;
 };
 proto.navTarget=function(...args){if(!active(this))return old.nav.apply(this,args);const selected=this.enemies.find(x=>x.id===this.selectedTarget&&!x.dead);
  if(selected)return selected;const rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='jammer'?3:x.role==='bomber'?4:5;
  const best=this.enemies.filter(x=>!x.dead&&x.warp<=0).sort((a,b)=>rank(a)-rank(b)||dist(a.pos,this.player.pos)-dist(b.pos,this.player.pos))[0];
  if(best){this.selectedTarget=best.id;return best;}return{pos:[0,0,-70],name:'Держите строй конвоя'};
 };
 proto.stepEscort=function(dt,input={}){
  if(!active(this))return old.step.call(this,dt,input);
  const c=this.escort,o=c.ops230,p=this.player,m=missions[this.stage];c.time+=dt;this.elapsed+=dt;
  for(const key of ['shotCooldown','missileCooldown','invulnerable','pulseCooldown','flipCooldown'])p[key]=Math.max(0,(p[key]||0)-dt);
  for(const key of ['captainClock','flash','shake','pulseWave'])this[key]=Math.max(0,(this[key]||0)-dt);
  let dx=input.turn||0,dy=input.pitch||0;const nav=this.navTarget();
  if(this.autopilot){dx=clamp((nav.pos[0]*.45-p.pos[0])*.14,-1,1);dy=clamp((nav.pos[1]*.45-p.pos[1])*.15,-1,1);}
  const boost=input.boost&&p.energy>3,speed=boost?26:14;p.pos[0]=clamp(p.pos[0]+dx*speed*dt,-40,40);p.pos[1]=clamp(p.pos[1]+dy*speed*dt,-21,21);
  p.yaw+=(-dx*.12-p.yaw)*dt*5;p.pitch+=(dy*.1-p.pitch)*dt*5;p.bank+=(-dx*.5-p.bank)*dt*5;p.boosting=boost;p.energy=clamp(p.energy+(boost?-23:15)*dt,0,100);
  const pattern=formation(this);if(pattern!==o.formation){o.formation=pattern;log(this,'formation',{pattern});}
  c.allies.forEach((a,i)=>{if(a.dead)return;a.pos=V3.lerp(a.pos,goalForAlly(this,i),Math.min(1,dt*.8));a.hit=Math.max(0,a.hit-dt);a.shot-=dt;
   if(a.shot<=0){const target=this.enemies.find(x=>!x.dead&&x.warp<=0);if(target)this.bullets.push({pos:a.pos.slice(),vel:V3.scale(V3.norm(V3.sub(target.pos,a.pos)),170),life:1.5,damage:5,r:.4,type:'ally',color:'#a8ffe4'});a.shot=2.2;}});
  const plan=m.groups[o.next];if(plan&&c.time>=plan.at&&this.enemies.filter(x=>!x.dead&&!x.torpedo).length+plan.roles.length<=11){spawnGroup(this,plan);o.next++;c.wave=o.next;}
  for(const g of o.groups){const crew=members(this,g);if(!crew.length)continue;g.time+=dt;g.disrupt=Math.max(0,g.disrupt-dt);
   const limit=g.state==='assemble'?.9:g.state==='telegraph'?(this.assist?2.5:1.7):g.state==='attack'?4.5:3.6;
   if(g.time>=limit&&g.disrupt<=0)transition(this,g,({assemble:'telegraph',telegraph:'attack',attack:'regroup',regroup:'telegraph'})[g.state]);
   for(const x of crew)stepUnit(this,x,g,dt);
  }
  o.groups=o.groups.filter(g=>members(this,g).length||this.enemies.some(x=>!x.dead&&x.torpedo&&x.squad===g.id));
  for(const x of this.enemies){if(x.torpedo){const a=c.allies[x.ally];x.age+=dt;x.life-=dt;if(!a||a.dead){x.dead=true;continue;}x.vel=V3.lerp(x.vel,V3.scale(V3.norm(V3.sub(a.pos,x.pos)),19),Math.min(1,dt*.6));const prev=x.pos.slice();x.pos=V3.add(x.pos,V3.scale(x.vel,dt));if(flightSegment(prev,x.pos,a.pos,6)!==null){hurtAlly(this,a,20);x.dead=true;this.explosions.push({pos:x.pos.slice(),life:.7,max:.7,color:x.color});}if(x.life<=0)x.dead=true;}
   else x.shielded=x.role!=='shield'&&this.enemies.some(n=>!n.dead&&n.role==='shield'&&n.squad===x.squad&&n.warp<=0&&dist(n.pos,x.pos)<55);
  }
  if(input.fire)this.fire();if(input.missile)this.missile();if(input.pulse)this.pulse();
  for(const b of this.bullets){b.life-=dt;const prev=b.pos.slice();if(b.type==='missile'){const target=this.enemies.find(x=>x.id===b.target&&!x.dead);if(target)b.vel=V3.lerp(b.vel,V3.scale(V3.norm(V3.sub(target.pos,b.pos)),100),Math.min(1,dt*5));}b.pos=V3.add(b.pos,V3.scale(b.vel,dt));
   let hit=null,along=Infinity;for(const x of this.enemies){if(x.dead||x.warp>0)continue;const s=flightSegment(prev,b.pos,x.pos,x.r+b.r);if(s!==null&&s<along){along=s;hit=x;}}if(hit&&b.life>0){this.hit(hit,b.damage);b.life=0;}}
  for(const b of this.hostile){b.life-=dt;const prev=b.pos.slice();b.pos=V3.add(b.pos,V3.scale(b.vel,dt));const a=c.allies[b.ally];if(a&&!a.dead&&flightSegment(prev,b.pos,a.pos,5.5)!==null){hurtAlly(this,a,b.damage);b.life=0;}else if(b.ally===-1&&flightSegment(prev,b.pos,p.pos,2.8)!==null){this.damage(b.damage);b.life=0;}}
  this.enemies=this.enemies.filter(x=>!x.dead);this.bullets=this.bullets.filter(b=>b.life>0);this.hostile=this.hostile.filter(b=>b.life>0);
  for(const x of this.explosions)x.life-=dt;this.explosions=this.explosions.filter(x=>x.life>0);
  o.stats.peakEnemies=Math.max(o.stats.peakEnemies,this.enemies.length);o.stats.peakHostile=Math.max(o.stats.peakHostile,this.hostile.length);
  if(this.status!=='playing')return;
  if(allies(this).length<2){this.status='lost';this.lossReason='Конвой потерял два транспорта. Перехватывайте торпеды и срывайте заходы стаи импульсом.';this.emit('state','lost');return;}
  const jammers=this.enemies.filter(x=>x.channel&&!x.dead).length;c.distance=clamp(c.distance+dt/m.duration*(1-Math.min(.28,jammers*.14)),0,1);
  if(c.distance>=1&&o.next===m.groups.length)this.finishEscort();this.target();
 };
 proto.objective=function(...args){if(!active(this))return old.objective.apply(this,args);const m=missions[this.stage],o=this.escort.ops230,g=o.groups.find(g=>g.state==='telegraph');
  return{title:m.subtitle,detail:g?'Готовится '+g.name.toLowerCase()+' → '+this.escort.allies[g.target].name:'Сохраните 2/3 транспорта · группа '+o.next+'/'+m.groups.length+' · Tab — угроза · E — прикрытие'};
 };
 globalThis.CITADEL_CONVOY=Object.freeze({version:VERSION,active,mission:e=>missions[e.stage],roles,formation,
  inspection:e=>active(e)?{version:VERSION,stage:e.stage,time:cTime(e),wave:e.escort.wave,total:missions[e.stage].groups.length,distance:e.escort.distance,
   formation:formation(e),allies:e.escort.allies.map(a=>({hp:a.hp,dead:a.dead})),groups:e.escort.ops230.groups.map(g=>({id:g.id,kind:g.kind,state:g.state,time:g.time,target:g.target,members:members(e,g).length})),stats:{...e.escort.ops230.stats},events:e.escort.ops230.events.map(x=>({...x}))}:null});
 function cTime(e){return +e.escort.time.toFixed(2);}
})();
