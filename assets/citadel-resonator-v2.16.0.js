/* Orbital resonance puzzle. One serializable simulation, ordinary campaign
 * transitions and the existing frame owner. No deck, character or combat. */
(()=>{
 'use strict';if(globalThis.CITADEL_RESONATOR)return;
 const C=CITADEL_CAMPAIGN,p=RequirementArcade.prototype,TAU=Math.PI*2,STEP=Math.PI/4;
 const old={damage:p.damage,step:p.step,objective:p.objective,launch:p.launch,scene:spaceScene,camera:spaceCamera,flight:drawFlightHUD,mobile:drawMobileGameHUD,clarity:drawClarityHUD,campaign:drawCampaignFlightHUD,hud:updateArcadeHUD,overlay:arcadeOverlayHTML,action:arcadeAction,unpack:cupUnpack};
 const active=e=>C.active(e)&&e.campaign2120.station?.kind==='resonator2160';
 function repairRift(e){
  if(!active(e)||e.campaign2120.rift2176?.mission!=='contradictions')return;
  const invalid=e.campaign2120.rift2176;
  if(invalid.contacts>0){const saved=e.campaign2120.retry?.engine;const hp=saved?.campaign2120?.station?.kind==='resonator2160'?saved.player?.hp:null;e.player.hp=Math.max(e.player.hp,Number.isFinite(hp)&&hp>0?hp:100);
   if(['crashing','lost'].includes(e.status)){e.status='playing';e.crash=null;e.lossReason='';}
  }
  delete e.campaign2120.rift2176;e.campaign2120.station.riftRepaired2177=true;
 }
 p.damage=function(){if(active(this))return false;return old.damage.apply(this,arguments);};
 const state=e=>e.campaign2120.station,wrap=n=>(n%8+8)%8,angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const titles=['Разделить два источника','Связать владельцев','Собрать одну версию'];
 const notes=['Запрос описывает обследование. Задание назначает работу исполнителю.','Внешнее кольцо поворачивает соседнее в обратную сторону.','Два внешних кольца связаны с соседями. Настраивайте их снаружи внутрь.'];
 function phase(e,n){const s=state(e),offset=(e.seed||0)%8,targets=[[0,4],[1,5,2],[6,3,0]][n];s.phase=n;s.mode='align';s.selected=0;s.charge=0;s.phaseTime=0;s.rings=targets.map((v,i)=>({step:wrap(v+offset),target:wrap(v+offset),angle:wrap(v+offset)*STEP}));
  for(const [i,d] of [[0,1],[1,-1],[0,1],[n?2:1,1],[0,-1],[1,1],[0,1]])rotate(e,i,d,true);
  for(const r of s.rings)r.angle=r.step*STEP;s.hint=notes[n];
 }
 function start(e,legacy=null){const s=e.campaign2120;s.station={kind:'resonator2160',schema:1,phase:0,clock:0,phaseTime:0,moves:0,selected:0,charge:0,mode:'align',solved:[],reads:[],reading:null,solution:null,rings:[],repeat:0,selectionHeld:false,migrated:!!legacy};
  e.board=null;e.finale=null;e.crash=null;e.escort=null;e.dock=null;e.boss=null;e.pursuit=null;e.swarm=null;e.enemies=[];e.hostile=[];e.bullets=[];e.explosions=[];e.autopilot=false;e.phase='resonance';e.status='briefing';e.player.pos=[0,0,0];e.player.speed=0;e.player.boosting=false;e.warning='';
  phase(e,0);if(legacy?.solution!=null){s.station.solution=legacy.solution;s.station.solved=[0,1,2];s.station.mode='release';s.station.countdown=2.5;e.status='playing';}
  clearArcadeInput();C.checkpoint(e);C.save(e,true);e.emit('state',e.status);return true;
 }
 function rotate(e,i,dir,scramble=false){if(!active(e))return false;const s=state(e);if(!scramble&&(e.status!=='playing'||s.mode!=='align'||s.modal||e.campaign2120.modal))return false;if(!Number.isInteger(i)||!s.rings[i]||![-1,1].includes(dir))return false;
  s.rings[i].step=wrap(s.rings[i].step+dir);
  if(s.phase>=1&&i===0||s.phase>=2&&i===1)s.rings[i+1].step=wrap(s.rings[i+1].step-dir);
  if(!scramble){s.moves++;s.charge=0;s.selected=i;e.emit('gate');C.save(e,true);}return true;
 }
 function select(e,i){if(!active(e)||!state(e).rings[i])return;state(e).selected=i;}
 function afterCard(e){const s=state(e);s.solution=e.campaign2120.answers.contradictions.index;s.mode='release';s.countdown=2.5;e.status='playing';C.save(e,true);}
 p.launch=function(){if(active(this)&&this.status==='briefing'){this.status='playing';clearArcadeInput();C.checkpoint(this);C.save(this,true);this.emit('state','playing');return true;}return old.launch.apply(this,arguments);};
 p.step=function(delta,input={}){if(!active(this))return old.step.apply(this,arguments);repairRift(this);if(this.status!=='playing'||this.campaign2120.modal)return;
  const dt=Math.min(.04,Math.max(0,Number(delta)||0)),s=state(this);this.elapsed+=dt;this.stageTime+=dt;s.clock+=dt;s.phaseTime+=dt;s.repeat=Math.max(0,s.repeat-dt);
  for(const r of s.rings)r.angle+=angle(r.step*STEP-r.angle)*Math.min(1,dt*12);
  if(s.mode==='release'){s.countdown-=dt;if(s.countdown<=0)C.finishStation(this);return;}
  if(s.mode==='surge'){s.countdown-=dt;if(s.countdown<=0){if(s.phase<2){phase(this,s.phase+1);C.checkpoint(this);C.save(this,true);}else{s.reads=[0,1];C.stationCard(this);}}return;}
  const turn=Math.abs(input.turn||input.moveX||0)>.3?Math.sign(input.turn||input.moveX):0,choose=Math.abs(input.pitch||input.moveZ||0)>.5?Math.sign(input.pitch||input.moveZ):0;
  if(choose&&!s.selectionHeld){s.selected=(s.selected+(choose>0?-1:1)+s.rings.length)%s.rings.length;}s.selectionHeld=!!choose;
  if(turn&&!s.repeat){rotate(this,s.selected,turn);s.repeat=.22;}
  const aligned=s.rings.every(r=>r.step===r.target&&Math.abs(angle(r.angle-r.target*STEP))<.055);
  s.charge=aligned?Math.min(1,s.charge+dt/(this.assist?1.2:1.7)):0;
  if(s.charge>=1){s.solved.push(s.phase);s.mode='surge';s.countdown=1.4;this.score+=75;this.emit('terminal');C.save(this,true);}else C.save(this);
 };
 p.objective=function(){if(active(this)){const s=state(this);return{title:'Орбитальный резонатор',detail:s.mode==='release'?'Связь установлена. Открывается путь в логово.':titles[s.phase]+'. Тяните кольца к светлым меткам. A/D — вращение, W/S — выбор кольца.',progress:(s.solved.length)+' / 3 КОНТУРА'};}return old.objective.apply(this,arguments);};
 const layout=(w,h,n=3)=>{const footer=64,top=h<300?34:w<600?104:64,R=Math.max(48,Math.min(w*.38,(h-top-footer)*.43,220));return{cx:w/2,cy:top+(h-top-footer)/2,R,radii:Array.from({length:n},(_,i)=>R*(1-i*.27)),top,footer};};
 const point=(l,r,a)=>[l.cx+Math.cos(a)*r,l.cy+Math.sin(a)*r];
 function path(c,points,color,width=2){c.beginPath();points.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
 function diamond(c,x,y,r,color,fill=false){c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.strokeStyle=color;c.lineWidth=2;if(fill){c.fillStyle=color;c.fill();}else c.stroke();}
 function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#10253500');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
 function draw(c,e,cam,w,h){if(!active(e))return;const s=state(e),l=layout(w,h,s.rings.length),{cx,cy,R}=l,small=w<600,time=s.clock;
  c.clearRect(0,0,w,h);c.save();const bg=c.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)*.65);bg.addColorStop(0,'#183c4a');bg.addColorStop(.5,'#0b2131');bg.addColorStop(1,'#040e1c');c.fillStyle=bg;c.fillRect(0,0,w,h);
  for(let i=0;i<90;i++){const x=((i*137.19)%w),y=((i*91.73)%h);c.fillStyle=i%7?'#a4c6d152':'#e9dec997';c.fillRect(x,y,i%7?1:2,i%7?1:2);}
  glow(c,cx-R,cy,R*1.4,'#267e783a');glow(c,cx+R,cy,R*1.4,'#b1683935');
  // Deep metal housing, raised ribs and independently moving gimbals.
  c.beginPath();c.arc(cx,cy+7,R+18,0,TAU);c.strokeStyle='#020910';c.lineWidth=24;c.stroke();
  c.beginPath();c.arc(cx,cy,R+18,0,TAU);c.strokeStyle='#3e5a63';c.lineWidth=17;c.stroke();c.strokeStyle='#91aba260';c.lineWidth=1;c.stroke();
  for(let i=0;i<32;i++){const a=i/32*TAU,p1=point(l,R+12,a),p2=point(l,R+24,a);path(c,[p1,p2],i%4?'#6c858b':'#d5bb86',i%4?2:4);}
  c.setLineDash([3,8]);c.beginPath();c.arc(cx,cy,R+32,-time*.06,TAU-time*.06);c.strokeStyle='#58878d60';c.lineWidth=1;c.stroke();c.setLineDash([]);
  s.rings.forEach((r,i)=>{const radius=l.radii[i],ok=r.step===r.target;
   c.beginPath();c.arc(cx,cy+5,radius,0,TAU);c.strokeStyle='#030c17';c.lineWidth=21;c.stroke();
   const metal=c.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);metal.addColorStop(0,'#9d947e');metal.addColorStop(.35,'#435765');metal.addColorStop(.65,'#203744');metal.addColorStop(1,'#a3aa94');
   c.beginPath();c.arc(cx,cy,radius,0,TAU);c.strokeStyle=metal;c.lineWidth=15;c.stroke();
   c.beginPath();c.arc(cx,cy,radius-7,0,TAU);c.strokeStyle='#cbdfd345';c.lineWidth=1;c.stroke();
   for(let k=0;k<8;k++){const a=k*STEP+r.angle,xy=point(l,radius,a);c.fillStyle='#162b37';c.beginPath();c.arc(...xy,3,0,TAU);c.fill();}
   for(const [off,col] of [[0,'#8ce7db'],[Math.PI,'#efb776']]){
    const target=point(l,radius,r.target*STEP+off);glow(c,...target,13,ok?'#a7ffdd66':'#fff2cd25');diamond(c,...target,9,'#f3ecd0');
    const pos=point(l,radius,r.angle+off);c.beginPath();c.arc(cx,cy,radius,r.angle+off-.14,r.angle+off+.14);c.strokeStyle=col;c.lineWidth=19;c.stroke();
    c.fillStyle='#061a28';c.beginPath();c.arc(...pos,4,0,TAU);c.fill();
   }
   if(i===s.selected&&s.mode==='align'){c.beginPath();c.arc(cx,cy,radius+11,0,TAU);c.strokeStyle='#e9ce87';c.lineWidth=1.5;c.setLineDash([4,4]);c.stroke();c.setLineDash([]);}
   const label=point(l,radius,-Math.PI/2-.25);c.fillStyle='#091b28';c.beginPath();c.arc(...label,10,0,TAU);c.fill();c.fillStyle='#f3e4ba';c.textAlign='center';c.font='bold 11px sans-serif';c.fillText(String(i+1),label[0],label[1]+4);
  });
  // Both sources follow the same physical sockets from opposite directions.
  for(const [off,col]of [[0,'#9cf6e2'],[Math.PI,'#ffc477']]){
   const start=point(l,R+38,s.rings[0].target*STEP+off),points=[start];let blocked=false;
   for(let i=0;i<s.rings.length;i++){const r=s.rings[i];points.push(point(l,l.radii[i],r.target*STEP+off));if(r.step!==r.target){blocked=true;break;}}
   if(!blocked)points.push([cx,cy]);c.save();c.shadowColor=col;c.shadowBlur=10;path(c,points,col,2.5);c.restore();
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],t=(time*.65+i*.17)%1;glow(c,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,7,col+'bb');}
   if(blocked){const q=points.at(-1);glow(c,...q,12,'#ff9e6460');}
  }
  const energy=s.mode==='surge'||s.mode==='release'?1:s.charge;
  glow(c,cx,cy,Math.max(22,R*.34),'#73d9c7'+Math.round(55+energy*100).toString(16));
  for(let i=0;i<6;i++){const a=time*.18+i*Math.PI/3;path(c,[[cx,cy],point(l,R*.16,a)],'#8ab8b4',1);}
  diamond(c,cx,cy,R*.15,'#e6d49c',true);diamond(c,cx,cy,R*.09,'#163b47',true);
  c.textAlign='center';c.fillStyle='#e9d8af';c.font='600 '+(small?13:18)+'px sans-serif';c.fillText(s.mode==='release'?'ЕДИНАЯ ВЕРСИЯ СОБРАНА':titles[s.phase].toUpperCase(),cx,h<300?18:small?66:28);
  if(h>=300){c.fillStyle='#9fbfca';c.font=(small?11:13)+'px sans-serif';c.fillText(s.mode==='surge'?'Потоки совпали · контур заряжен':s.phase===0?'Два источника → один устойчивый контур':s.phase===1?'Кольцо 1 связано с кольцом 2':'Кольцо 1 → 2 → 3 · настраивай по порядку',cx,small?85:47);}
  for(let i=0;i<3;i++){const px=cx+(i-1)*32,py=h-77;c.fillStyle=s.solved.includes(i)?'#9ae4c9':i===s.phase?'#e4bf78':'#354d5c';c.beginPath();c.arc(px,py,5,0,TAU);c.fill();}
  if(energy>0){c.beginPath();c.arc(cx,cy,R*.24,-Math.PI/2,-Math.PI/2+TAU*energy);c.strokeStyle='#baffdc';c.lineWidth=3;c.stroke();}
  if(s.mode==='surge'||s.mode==='release'){c.beginPath();c.arc(cx,cy,(R+30)*(1-(s.countdown||0)/(s.mode==='release'?2.5:1.4)),0,TAU);c.strokeStyle='#b9ffe3aa';c.lineWidth=3;c.stroke();}
  c.restore();
 }
 spaceScene=function(e){return active(e)&&!e.campaign2120.modal?[]:old.scene.apply(this,arguments);};
 spaceCamera=function(e){return active(e)&&!e.campaign2120.modal?stationLook([0,90,60],[0,0,0],1,{near:1,far:800}):old.camera.apply(this,arguments);};
 drawFlightHUD=function(c,e){return active(e)&&!e.campaign2120.modal?draw.apply(this,arguments):old.flight.apply(this,arguments);};
 drawMobileGameHUD=function(c,e){return active(e)&&!e.campaign2120.modal?draw.apply(this,arguments):old.mobile.apply(this,arguments);};
 drawClarityHUD=function(c,e){if(active(e))return;return old.clarity.apply(this,arguments);};
 drawCampaignFlightHUD=function(c,e){if(active(e))return;return old.campaign.apply(this,arguments);};
 const button=(a,t,v='')=>'<button type="button" data-action="'+a+'" data-value="'+v+'">'+t+'</button>';
 arcadeOverlayHTML=function(){const e=ARCADE.engine;if(!active(e)||e.campaign2120.modal)return old.overlay.apply(this,arguments);const s=state(e);
  if(e.status==='briefing'||e.status==='paused')return'<section class="resonator-intro2160"><small>ГЛАВА 13 · НОВАЯ МЕХАНИКА</small><div class="resonator-emblem2160" aria-hidden="true">◈</div><h3>Станция противоречий</h3><p>Два источника спорят. Совмести каналы колец со светлыми метками — и собери устойчивую связь.</p><div class="resonator-lesson2160"><span>① Тяни кольцо</span><span>② Совмести метки ◇</span><span>③ Заряди 3 контура</span></div><small>Мышь / палец · A/D — вращение · W/S — выбор<br>Ошибки не отнимают жизни. Время не ограничено.</small>'+button(e.status==='paused'?'arcade-resume':'resonator-start',e.status==='paused'?'Продолжить →':'Включить резонатор →')+'</section>';
  if(e.status==='campaigncard'&&e.campaign2120.card?.mission==='contradictions'){const card=e.campaign2120.card,q=C.questions.contradictions,done=card.answer!==null;
   return'<section class="resonator-intro2160 resonator-result2160"><small>ТРИ КОНТУРА СОГЛАСОВАНЫ</small><h3>Теперь свяжем смысл</h3><div class="resonator-sources2160"><div><b>◇ ЗАПРОС</b><span>Что обследовать, где и когда</span></div><div><b>◆ ЗАДАНИЕ</b><span>Кому поручить конкретную работу</span></div></div><p>Обе службы называли это «заявкой». Как уточнить модель?</p><div class="campaign-choices">'+q.choices.map((t,i)=>'<button data-action="campaign-answer" data-value="'+i+'"'+(done?' disabled':'')+'>'+t+'</button>').join('')+'</div>'+(done?'<p>'+(card.correct?'Верно. Смысл, владелец и состояния теперь определены.':'Одно слово скрывает два разных смысла. Выбери явную модель.')+'</p>'+button('campaign-card-next',card.correct?'Открыть путь →':'Исправить'):'')+'</section>';
  }if(e.status==='playing')return'';return old.overlay.apply(this,arguments);
 };
 arcadeAction=function(action,value){const e=ARCADE.engine;if(active(e)){
  if(action==='resonator-start'){e.launch();refresh();return true;}
  if(action==='resonator-select'){select(e,Number(value));return true;}
  if(action==='resonator-turn'){rotate(e,state(e).selected,Number(value));return true;}
  if(['citadel-interact','citadel-target','citadel-primary','citadel-guidance','arcade-missile','arcade-pulse'].includes(action))return true;
 }return old.action.apply(this,arguments);};
 function refresh(){ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}
 const bound=new WeakSet();
 function bind(){const canvas=ARCADE.canvas;if(!canvas||bound.has(canvas))return;bound.add(canvas);let drag=null;
  const pos=ev=>{const r=canvas.getBoundingClientRect();return[(ev.clientX-r.left)*canvas.width/r.width,(ev.clientY-r.top)*canvas.height/r.height];};
  const can=()=>active(ARCADE.engine)&&ARCADE.engine.status==='playing'&&!ARCADE.engine.campaign2120.modal&&state(ARCADE.engine).mode==='align';
  const down=ev=>{if(!can()||ev.button>0)return;const e=ARCADE.engine,s=state(e),l=layout(canvas.width,canvas.height,s.rings.length),[x,y]=pos(ev),rad=Math.hypot(x-l.cx,y-l.cy);let i=0;for(let j=1;j<s.rings.length;j++)if(Math.abs(rad-l.radii[j])<Math.abs(rad-l.radii[i]))i=j;
   if(Math.abs(rad-l.radii[i])>Math.max(24,l.R*.18))return;select(e,i);drag={id:ev.pointerId,last:Math.atan2(y-l.cy,x-l.cx),rest:0};canvas.setPointerCapture?.(ev.pointerId);ev.preventDefault();ev.stopImmediatePropagation();};
  canvas.addEventListener('pointerdown',down,{capture:true});
  canvas.addEventListener('pointermove',ev=>{if(!drag||ev.pointerId!==drag.id||!can())return;const e=ARCADE.engine,l=layout(canvas.width,canvas.height,state(e).rings.length),[x,y]=pos(ev),a=Math.atan2(y-l.cy,x-l.cx);drag.rest+=angle(a-drag.last);drag.last=a;
   while(Math.abs(drag.rest)>=STEP*.68){const sign=Math.sign(drag.rest);rotate(e,state(e).selected,sign);drag.rest-=sign*STEP;}ev.preventDefault();ev.stopImmediatePropagation();},{capture:true});
  const end=ev=>{if(!drag||ev.pointerId!==drag.id)return;drag=null;canvas.releasePointerCapture?.(ev.pointerId);clearArcadeInput();ev.preventDefault();ev.stopImmediatePropagation();};
  canvas.addEventListener('pointerup',end,{capture:true});canvas.addEventListener('pointercancel',end,{capture:true});
 }
 updateArcadeHUD=function(){const result=old.hud.apply(this,arguments),e=ARCADE.engine,on=active(e),screen=document.getElementById('arcade-screen');screen?.classList.toggle('resonator2160',on);
  let bar=document.getElementById('resonator-controls2160');if(on&&!bar&&ARCADE.canvas?.parentElement){bar=document.createElement('div');bar.id='resonator-controls2160';bar.innerHTML='<div role="group" aria-label="Выбор кольца">'+[0,1,2].map(i=>button('resonator-select','Кольцо '+(i+1),i)).join('')+'</div><div>'+button('resonator-turn','↶',-1)+button('resonator-turn','↷',1)+'</div>';ARCADE.canvas.parentElement.appendChild(bar);}
  if(bar){bar.hidden=!on||e.status!=='playing'||!!e.campaign2120.modal;if(on){const s=state(e);for(const b of bar.querySelectorAll('[data-action="resonator-select"]')){b.hidden=!s.rings[Number(b.dataset.value)];b.setAttribute('aria-pressed',String(Number(b.dataset.value)===s.selected));}for(const b of bar.querySelectorAll('[data-action="resonator-turn"]')){b.disabled=s.mode!=='align';b.setAttribute('aria-label',b.dataset.value==='-1'?'Повернуть кольцо против часовой стрелки':'Повернуть кольцо по часовой стрелке');}}}
  bind();if(on){ARCADE.canvas.setAttribute?.('aria-label','Орбитальный резонатор. Тяните кольца к светлым меткам. A/D — вращение, W/S — выбор кольца.');}return result;
 };
 cupUnpack=function(){const e=old.unpack.apply(this,arguments);if(C.active(e)&&e.campaign2120.station&&!active(e))start(e,e.campaign2120.station);repairRift(e);return e;};
 bind();
 globalThis.CITADEL_RESONATOR=Object.freeze({version:'2.16.0',active,state,start,rotate,select,afterCard,layout,draw});
})();

