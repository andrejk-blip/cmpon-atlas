/* Citadel 2.4.0 — hyperspace fields and aimed convoy combat.
 * One existing frame owner; all state is serializable in escort.ops240.
 * Old in-flight missions keep their original simulation until the next departure.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_CONVOY?.version==='2.4.0')return;
 const VERSION='2.4.0',legacy=globalThis.CITADEL_CONVOY,proto=RequirementArcade.prototype;
 const old={step:proto.stepEscort,hit:proto.hit,pulse:proto.pulse,fire:proto.fire,nav:proto.navTarget,objective:proto.objective};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>V3.len(V3.sub(a,b));
 const active=e=>e?.phase==='escort'&&e.escort?.ops240?.version===VERSION;
 const roles={...legacy.roles,
  scout:{name:'Лёгкий истребитель',hp:150,r:3.5,color:'#f49d7e',speed:24},
  interceptor:{name:'Перехватчик',hp:180,r:3.6,color:'#ffad67',speed:31},
  raider:{name:'Штурмовик',hp:240,r:4.5,color:'#e8788e',speed:21},
  jammer:{name:'Глушитель',hp:230,r:4.6,color:'#b49af6',speed:19},
  bomber:{name:'Торпедоносец',hp:260,r:5,color:'#e2b968',speed:18},
  shield:{name:'Щитоносец',hp:300,r:5.4,color:'#78cde6',speed:19},
  commander:{name:'Командный крейсер',hp:300,r:5,color:'#f3d789',speed:22}
 };
 const fields=(times,points,halfW,halfH)=>times.map((at,i)=>({at,gapX:points[i][0],gapY:points[i][1],halfW,halfH}));
 const missions=[
  {name:'Коридор исполнения',subtitle:'Пилот и прикрытие',duration:68,color:'#76dce8',formation:'КЛИН',brief:'Маневрируйте WASD или левым джойстиком. В энергетическом поле ищите светлое окно: вне его корабль получает большой урон. Совмещайте прицел с врагом для захвата. Q — ракета, E — перехват торпед и прикрытие; Tab — цель.',fields:fields([12,31,51],[[22,7],[-21,-7],[20,8]],12,10),groups:[
   {at:4,name:'Разведывательная пара',kind:'flank',roles:['scout','scout']},
   {at:21,name:'Фланговый перехват',kind:'crossfire',roles:['interceptor','scout','scout']},
   {at:37,name:'Ударное звено',kind:'crossfire',roles:['raider','interceptor','scout']},
   {at:53,name:'Последний заслон',kind:'flank',roles:['raider','interceptor','scout']}]},
  {name:'Переход интеграций',subtitle:'Щиты и торпеды',duration:86,color:'#b3a0f1',formation:'КОЛОННА',brief:'Щитоносец прикрывает своё звено: уничтожьте его первым или потратьте ракеты. Янтарные торпеды летят к транспортам — переключайтесь Tab и перехватывайте их. E даёт краткое прикрытие, но не ремонтирует весь конвой. Проходы в полях уже.',fields:fields([9,25,41,57,73],[[-22,8],[22,-8],[-20,-8],[22,8],[-22,0]],10,8.5),groups:[
   {at:4,name:'Защищённое звено',kind:'shield',roles:['shield','interceptor','scout']},
   {at:18,name:'Торпедная засада',kind:'torpedo',roles:['bomber','interceptor','scout']},
   {at:33,name:'Захват канала',kind:'jam',roles:['jammer','raider','interceptor','scout']},
   {at:49,name:'Двойной заход',kind:'shield',roles:['shield','bomber','interceptor','scout']},
   {at:66,name:'Огневые клещи',kind:'crossfire',roles:['bomber','raider','interceptor','interceptor']}]},
  {name:'Последняя миля согласования',subtitle:'Прорыв блокады',duration:108,color:'#e9bd80',formation:'РАССЕЯННЫЙ СТРОЙ',brief:'Командир направляет огонь на слабый транспорт; его потеря на время срывает атаку звена. Прикрытые торпедоносцы дают двойной залп. Совмещайте уход в окно поля с выбором угрозы. Ракеты и E берегите для опасных сочетаний. Нужно доставить хотя бы два транспорта.',fields:fields([8,20,32,44,56,68,80,92],[[24,9],[-23,-9],[22,-8],[-23,8],[24,0],[-24,-8],[22,9],[-22,-8]],8.5,7),groups:[
   {at:3,name:'Командный перехват',kind:'command',roles:['commander','interceptor','scout','raider']},
   {at:16,name:'Бронированный клин',kind:'shield',roles:['shield','bomber','interceptor','scout']},
   {at:29,name:'Перекрёстный захват',kind:'crossfire',roles:['jammer','raider','interceptor','interceptor']},
   {at:42,name:'Двойной торпедный удар',kind:'torpedo',roles:['bomber','bomber','shield','interceptor']},
   {at:56,name:'Охота на архив',kind:'command',roles:['commander','shield','raider','interceptor']},
   {at:70,name:'Глушение и удар',kind:'jam',roles:['jammer','bomber','interceptor','raider']},
   {at:85,name:'Последний рубеж',kind:'command',roles:['commander','shield','bomber','interceptor','raider']}]}
 ];
 const allies=e=>e.escort.allies.filter(a=>!a.dead),members=(e,g)=>e.enemies.filter(x=>!x.dead&&x.squad===g.id&&!x.torpedo);
 function log(e,kind,data={}){const o=e.escort.ops240;o.events.push({at:+e.escort.time.toFixed(2),kind,...data});if(o.events.length>64)o.events.shift();}
 function formation(e){return e.stage===0?0:e.stage===1?Math.floor(e.escort.time/22)%2:Math.floor(e.escort.time/18)%3;}
 function goalForAlly(e,i){const pattern=formation(e),p=(pattern===1?[[0,2,-48],[-5,4,-66],[5,-2,-84]]:pattern===2?[[-23,7,-52],[23,-6,-62],[0,6,-84]]:[[-17,1,-46],[17,5,-62],[0,-4,-82]])[i];return[p[0]+Math.sin(e.escort.time*.32+i),p[1]+Math.sin(e.escort.time*.52+i)*.8,p[2]];}
 proto.beginEscort=function(...args){const ok=RequirementExpeditionBase.prototype.beginEscort.apply(this,args);if(!ok)return ok;const c=this.escort,m=missions[this.stage];
  c.definition={...c.definition,name:m.name,duration:m.duration,color:m.color};this.autopilot=false;
  c.ops240={version:VERSION,groups:[],next:0,serial:0,formation:0,fields:[],nextField:0,events:[],aim:{locked:false,targetId:null,cone:0},stats:{spawned:0,volleys:0,torpedoes:0,intercepts:0,shieldHits:0,disruptions:0,fieldsPassed:0,fieldsHit:0,peakEnemies:0,peakHostile:0}};
  this.say(m.subtitle+'. '+m.brief,'alert',true);return ok;
 };
 function targetAlly(e,g){let a=e.escort.allies[g.target];if(!a||a.dead){a=allies(e)[0];if(a)g.target=e.escort.allies.indexOf(a);}return a;}
 function spawnGroup(e,plan){const c=e.escort,o=c.ops240,id=++o.serial,available=allies(e),a=available[id%available.length];if(!a)return;
  const g={id,kind:plan.kind,name:plan.name,target:c.allies.indexOf(a),state:'assemble',time:0,cycle:0,disrupt:0,flank:id%2?1:-1,originAt:c.time};o.groups.push(g);
  plan.roles.forEach((role,i)=>{const d=roles[role],side=plan.kind==='crossfire'?(i%2?1:-1):g.flank;e.enemies.push({id:e.entityId++,type:role==='scout'||role==='interceptor'?'scout':'heavy',role,convoy240:true,squad:id,slot:i,ally:g.target,name:d.name,pos:[side*(28+i*2),10-i*5,-145-i*5],vel:[0,0,0],hp:d.hp,maxHp:d.hp,r:d.r,color:d.color,dead:false,warp:.8,age:0,hit:0,phase:i*1.7,channel:false,shot:0,order:'assemble',attackCount:-1,burst:0,shielded:false});});
  o.stats.spawned+=plan.roles.length;log(e,'group',{id,kind:plan.kind,count:plan.roles.length});e.emit('warp');e.say(plan.name+'. Цель противника: '+a.name+'.','alert',true);
 }
 function transition(e,g,state){g.state=state;g.time=0;for(const x of members(e,g)){x.order=state;x.burst=0;}
  if(state==='telegraph'){const live=members(e,g),leader=live.some(x=>x.role==='commander');if(leader){const weakest=allies(e).sort((a,b)=>a.hp-b.hp)[0];g.target=e.escort.allies.indexOf(weakest);}for(const x of live)x.ally=g.target;log(e,'mark',{squad:g.id,target:g.target,coordinated:leader});}
  if(state==='attack'){g.cycle++;log(e,'attack',{squad:g.id,target:g.target,cycle:g.cycle});}
 }
 function torpedo(e,x,a){if(e.enemies.filter(n=>!n.dead&&n.torpedo).length>=6)return;const p=x.pos.slice(),speed=13;
  e.enemies.push({id:e.entityId++,name:'Торпеда → '+a.name,role:'torpedo',torpedo:true,convoy240:true,squad:x.squad,ally:x.ally,pos:p,vel:V3.scale(V3.norm(V3.sub(a.pos,p)),speed),hp:30,maxHp:30,r:2,color:'#ffe5a3',warp:0,hit:0,age:0,life:14,dead:false});e.escort.ops240.stats.torpedoes++;log(e,'torpedo',{squad:x.squad,target:x.ally});
 }
 function shot(e,x,a,player=false){if(e.hostile.length>=64)return;const aim=player?e.player.pos:a.pos,speed=player?43:26;e.hostile.push({pos:x.pos.slice(),vel:V3.scale(V3.norm(V3.sub(aim,x.pos)),speed),life:6,damage:x.role==='raider'?12:8,r:1,color:x.color,ally:player?-1:x.ally});e.escort.ops240.stats.volleys++;}
 function hurtAlly(e,a,amount){if(!a||a.dead)return;a.hp=Math.max(0,a.hp-amount*(e.assist?.6:1)*(e.escort.ops240.cover>0?.25:1));a.hit=.35;if(a.hp<=0){a.dead=true;e.explosions.push({pos:a.pos.slice(),life:1.5,max:1.5,color:'#a8e5d0'});e.notify('ПОТЕРЯ ТРАНСПОРТА',a.name);log(e,'transport-lost',{target:e.escort.allies.indexOf(a)});}}
 function move(x,goal,speed,dt){const d=V3.sub(goal,x.pos),desired=V3.scale(V3.norm(d),Math.min(speed,V3.len(d)*2));x.vel=V3.lerp(x.vel,desired,Math.min(1,dt*3.5));x.pos=V3.add(x.pos,V3.scale(x.vel,dt));}
 function stepUnit(e,x,g,dt){x.age+=dt;x.warp=Math.max(0,x.warp-dt);x.hit=Math.max(0,x.hit-dt);if(x.warp>0)return;const a=targetAlly(e,g);if(!a)return;
  const side=g.kind==='crossfire'?(x.slot%2?1:-1):g.flank,inter=x.role==='interceptor';
  let goal=[clamp(a.pos[0]+side*(12+x.slot%2*7)+Math.sin(x.age*(inter?.85:.4)+x.phase)*(inter?9:3),-32,32),clamp(a.pos[1]+(x.slot%3-1)*7,-15,15),a.pos[2]-(x.role==='bomber'?55:36)-x.slot*3];
  if(g.state==='regroup')goal[0]=clamp(goal[0]-side*12,-32,32);
  x.channel=x.role==='jammer'&&g.state!=='assemble'&&g.disrupt<=0;
  if(g.state==='attack'&&g.disrupt<=0){const delay=x.slot*.3,t=g.time-delay;
   if(t>=0&&x.attackCount!==g.cycle){x.attackCount=g.cycle;x.burst=0;x.shot=0;}
   if(t>=0){x.shot-=dt;const maximum=x.role==='bomber'?(e.stage===2?2:1):x.role==='raider'?3:2;
    if(x.shot<=0&&x.burst<maximum&&x.role!=='shield'&&x.role!=='jammer'){x.burst++;x.shot=x.role==='bomber'?1.1:.8;if(x.role==='bomber')torpedo(e,x,a);else {shot(e,x,a);if(inter||x.role==='scout')shot(e,x,a,true);}}
   }
  }
  move(x,goal,roles[x.role].speed,dt);
 }
 function aimState(e){const t=e.target(),p=e.player,cone=e.assist?.24:.19,d=t?V3.sub(t.pos,p.pos):[0,0,-1];return {locked:!!t&&t.warp<=0&&d[2]<-4&&Math.hypot(d[0],d[1])<=-d[2]*cone+t.r,targetId:t?.id||null,cone};}
 proto.fire=function(){if(!active(this))return old.fire.call(this);const p=this.player;if(this.status!=='playing'||p.shotCooldown>0)return false;
  const state=aimState(this),t=this.target(),direction=state.locked?V3.norm(V3.sub(V3.add(t.pos,V3.scale(t.vel||[0,0,0],dist(p.pos,t.pos)/210)),p.pos)):[0,0,-1];
  // Escort guns retain a viable baseline even when all campaign upgrades went to armour.
  const guns=Math.max(1,this.upgrades.weapons);p.shotCooldown=.24*Math.pow(.9,guns);this.shots++;
  for(const side of [-1,1])this.bullets.push({pos:V3.add(p.pos,[side*1.2,0,-3]),vel:V3.scale(direction,210),life:1.7,damage:12*(1+.25*guns),r:.7,type:'laser',color:'#82f8ff'});this.emit('shot');return true;
 };
 proto.hit=function(x,amount){if(!active(this)||!x.convoy240)return old.hit.call(this,x,amount);if(x.dead||x.warp>0)return;
  if(x.torpedo){x.hp-=amount;x.hit=.15;if(x.hp<=0){x.dead=true;this.escort.ops240.stats.intercepts++;this.explosions.push({pos:x.pos.slice(),life:.5,max:.5,color:x.color});this.emit('destroy','escort');}return;}
  if(x.shielded){amount*=amount>=90?.75:.3;this.escort.ops240.stats.shieldHits++;}old.hit.call(this,x,amount);
  if(x.dead&&x.role==='commander'){const g=this.escort.ops240.groups.find(g=>g.id===x.squad);if(g){g.disrupt=3;transition(this,g,'regroup');this.escort.ops240.stats.disruptions++;log(this,'leader-down',{squad:g.id});this.notify('АТАКА СОРВАНА','Командир уничтожен · три секунды на перехват');}}
 };
 proto.pulse=function(){if(!active(this))return old.pulse.call(this);const p=this.player;if(this.status!=='playing'||p.pulseCooldown>0)return false;
  p.pulseCooldown=14;p.invulnerable=Math.max(p.invulnerable,1);this.pulseWave=1;this.escort.ops240.cover=2.8;
  this.hostile=this.hostile.filter(b=>dist(b.pos,p.pos)>105);for(const x of this.enemies)if(x.torpedo&&!x.dead&&dist(x.pos,p.pos)<115)this.hit(x,75);
  this.emit('pulse');this.notify('КОНВОЙ ПРИКРЫТ','2,8 с защиты · ближайшие торпеды перехвачены');log(this,'cover');return true;
 };
 proto.navTarget=function(...args){if(!active(this))return old.nav.apply(this,args);const selected=this.enemies.find(x=>x.id===this.selectedTarget&&!x.dead);if(selected)return selected;
  const rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='bomber'?3:x.role==='jammer'?4:5;
  const best=this.enemies.filter(x=>!x.dead&&x.warp<=0).sort((a,b)=>rank(a)-rank(b)||dist(a.pos,this.player.pos)-dist(b.pos,this.player.pos))[0];if(best){this.selectedTarget=best.id;return best;}return{pos:[0,0,-70],name:'Держите строй конвоя'};
 };
 function stepFields(e,dt){const c=e.escort,o=c.ops240,m=missions[e.stage],plan=m.fields[o.nextField];
  if(plan&&c.time>=plan.at){const lead=e.assist?6.2:5.4,speed=38;const f={id:++o.nextField,z:-lead*speed,gapX:plan.gapX,gapY:plan.gapY,halfW:plan.halfW+(e.assist?2:0),halfH:plan.halfH+(e.assist?1.5:0),speed,warning:lead,passed:false,hit:false};o.fields.push(f);log(e,'field-warning',{id:f.id});e.say('Энергетическое поле! Уведите корабль в светлый проход.','danger',true);}
  for(const f of o.fields){const previous=f.z;f.z+=f.speed*dt;f.warning=Math.max(0,-f.z/f.speed);
   if(!f.passed&&previous<0&&f.z>=0){f.passed=true;f.hit=Math.abs(e.player.pos[0]-f.gapX)>f.halfW-2.8||Math.abs(e.player.pos[1]-f.gapY)>f.halfH-2.8;
    if(f.hit){o.stats.fieldsHit++;e.damage(38);log(e,'field-hit',{id:f.id});e.notify('УДАР ПОЛЯ','Нужен проход: корабль целиком внутри светлого окна');}else{o.stats.fieldsPassed++;log(e,'field-pass',{id:f.id});}
   }
  }o.fields=o.fields.filter(f=>f.z<60);
 }
 proto.stepEscort=function(dt,input={}){if(!active(this))return old.step.call(this,dt,input);
  const c=this.escort,o=c.ops240,p=this.player,m=missions[this.stage];c.time+=dt;this.elapsed+=dt;o.cover=Math.max(0,(o.cover||0)-dt);
  for(const key of ['shotCooldown','missileCooldown','invulnerable','pulseCooldown','flipCooldown'])p[key]=Math.max(0,(p[key]||0)-dt);
  for(const key of ['captainClock','flash','shake','pulseWave'])this[key]=Math.max(0,(this[key]||0)-dt);
  // Autocourse centres the escort only; it never solves fields or acquires a firing lane.
  let dx=input.turn||0,dy=input.pitch||0;if(this.autopilot&&!dx&&!dy){dx=clamp(-p.pos[0]*.14,-1,1);dy=clamp(-p.pos[1]*.15,-1,1);}
  const boost=input.boost&&p.energy>3,speed=boost?26:14;p.pos[0]=clamp(p.pos[0]+dx*speed*dt,-40,40);p.pos[1]=clamp(p.pos[1]+dy*speed*dt,-21,21);p.yaw+=(-dx*.12-p.yaw)*dt*5;p.pitch+=(dy*.1-p.pitch)*dt*5;p.bank+=(-dx*.5-p.bank)*dt*5;p.boosting=boost;p.energy=clamp(p.energy+(boost?-23:15)*dt,0,100);
  stepFields(this,dt);if(this.status!=='playing')return;
  const pattern=formation(this);if(pattern!==o.formation){o.formation=pattern;log(this,'formation',{pattern});}
  c.allies.forEach((a,i)=>{if(a.dead)return;a.pos=V3.lerp(a.pos,goalForAlly(this,i),Math.min(1,dt*.8));a.hit=Math.max(0,a.hit-dt);a.shot-=dt;if(a.shot<=0){const t=this.enemies.find(x=>!x.dead&&x.warp<=0);if(t)this.bullets.push({pos:a.pos.slice(),vel:V3.scale(V3.norm(V3.sub(t.pos,a.pos)),170),life:1.5,damage:5,r:.4,type:'ally',color:'#a8ffe4'});a.shot=2.2;}});
  const plan=m.groups[o.next];if(plan&&c.time>=plan.at&&this.enemies.filter(x=>!x.dead&&!x.torpedo).length+plan.roles.length<=12){spawnGroup(this,plan);o.next++;c.wave=o.next;}
  for(const g of o.groups){const crew=members(this,g);if(!crew.length)continue;g.time+=dt;g.disrupt=Math.max(0,g.disrupt-dt);const limit=g.state==='assemble'?.8:g.state==='telegraph'?(this.assist?2.8:1.9):g.state==='attack'?3.3:2.0;
   if(g.time>=limit&&g.disrupt<=0)transition(this,g,({assemble:'telegraph',telegraph:'attack',attack:'regroup',regroup:'telegraph'})[g.state]);for(const x of crew)stepUnit(this,x,g,dt);
  }o.groups=o.groups.filter(g=>members(this,g).length||this.enemies.some(x=>!x.dead&&x.torpedo&&x.squad===g.id));
  for(const x of this.enemies){if(x.torpedo){const a=c.allies[x.ally];x.age+=dt;x.life-=dt;if(!a||a.dead){x.dead=true;continue;}x.vel=V3.lerp(x.vel,V3.scale(V3.norm(V3.sub(a.pos,x.pos)),13),Math.min(1,dt*.7));const prev=x.pos.slice();x.pos=V3.add(x.pos,V3.scale(x.vel,dt));if(flightSegment(prev,x.pos,a.pos,6)!==null){hurtAlly(this,a,24);x.dead=true;this.explosions.push({pos:x.pos.slice(),life:.7,max:.7,color:x.color});}if(x.life<=0)x.dead=true;}else x.shielded=x.role!=='shield'&&this.enemies.some(n=>!n.dead&&n.role==='shield'&&n.squad===x.squad&&n.warp<=0&&dist(n.pos,x.pos)<55);}
  o.aim=aimState(this);if(input.fire)this.fire();if(input.missile)this.missile();if(input.pulse)this.pulse();
  for(const b of this.bullets){b.life-=dt;const prev=b.pos.slice();if(b.type==='missile'){const target=this.enemies.find(x=>x.id===b.target&&!x.dead);if(target)b.vel=V3.lerp(b.vel,V3.scale(V3.norm(V3.sub(target.pos,b.pos)),100),Math.min(1,dt*5));}b.pos=V3.add(b.pos,V3.scale(b.vel,dt));let hit=null,along=Infinity;for(const x of this.enemies){if(x.dead||x.warp>0)continue;const s=flightSegment(prev,b.pos,x.pos,x.r+b.r);if(s!==null&&s<along){along=s;hit=x;}}if(hit&&b.life>0){this.hit(hit,b.damage);b.life=0;}}
  for(const b of this.hostile){b.life-=dt;const prev=b.pos.slice();b.pos=V3.add(b.pos,V3.scale(b.vel,dt));const a=c.allies[b.ally];if(a&&!a.dead&&flightSegment(prev,b.pos,a.pos,5.5)!==null){hurtAlly(this,a,b.damage);b.life=0;}else if(b.ally===-1&&flightSegment(prev,b.pos,p.pos,2.8)!==null){this.damage(b.damage);b.life=0;}}
  this.enemies=this.enemies.filter(x=>!x.dead);this.bullets=this.bullets.filter(b=>b.life>0);this.hostile=this.hostile.filter(b=>b.life>0);for(const x of this.explosions)x.life-=dt;this.explosions=this.explosions.filter(x=>x.life>0);
  o.stats.peakEnemies=Math.max(o.stats.peakEnemies,this.enemies.length);o.stats.peakHostile=Math.max(o.stats.peakHostile,this.hostile.length);if(this.status!=='playing')return;
  if(allies(this).length<2){this.status='lost';this.lossReason='Конвой потерял два транспорта. Снимайте щиты, перехватывайте торпеды и применяйте E перед попаданием залпа.';this.emit('state','lost');return;}
  const jammers=this.enemies.filter(x=>x.channel&&!x.dead).length;c.distance=clamp(c.distance+dt/m.duration*(1-Math.min(.22,jammers*.11)),0,1);if(c.distance>=1&&o.next===m.groups.length)this.finishEscort();this.target();
 };
 proto.objective=function(...args){if(!active(this))return old.objective.apply(this,args);const m=missions[this.stage],o=this.escort.ops240,f=o.fields.find(f=>!f.passed),g=o.groups.find(g=>g.state==='telegraph');return{title:m.subtitle,detail:f?'Поле через '+f.warning.toFixed(1)+' с · корабль целиком в светлый проход':g?'Готовится '+g.name.toLowerCase()+' → '+this.escort.allies[g.target].name:'Сохраните 2/3 транспорта · группа '+o.next+'/'+m.groups.length+' · совместите прицел с целью'};};
 globalThis.CITADEL_CONVOY=Object.freeze({version:VERSION,active,legacyActive:legacy.active,mission:e=>legacy.active(e)?legacy.mission(e):missions[e.stage],roles,formation,
  inspection:e=>active(e)?{version:VERSION,stage:e.stage,time:+e.escort.time.toFixed(2),wave:e.escort.wave,total:missions[e.stage].groups.length,distance:e.escort.distance,formation:formation(e),allies:e.escort.allies.map(a=>({hp:a.hp,dead:a.dead})),groups:e.escort.ops240.groups.map(g=>({id:g.id,kind:g.kind,state:g.state,time:g.time,target:g.target,members:members(e,g).length})),fields:e.escort.ops240.fields.map(f=>({...f})),aim:{...e.escort.ops240.aim},stats:{...e.escort.ops240.stats},events:e.escort.ops240.events.map(x=>({...x}))}:legacy.inspection(e)});
})();
