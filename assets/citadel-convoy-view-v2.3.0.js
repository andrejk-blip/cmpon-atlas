/* Convoy 2.3: legged jet hounds, role silhouettes and readable squad orders.
 * Bounded meshes/material batches; shared 2.2 depth and material renderer.
 * Scene construction never mutates mission state.
 */
(() => {
 'use strict';if(globalThis.CITADEL_CONVOY_VIEW||!globalThis.CITADEL_CONVOY)return;
 const api=CITADEL_CONVOY,old={scene:expeditionHyperScene,camera:spaceCamera,hud:drawEscortHUD,mobile:drawMobileGameHUD,brief:expeditionOverlay,ui:updateExpeditionHUD};
 const templates=new Map(),M=20,L=24,C={dark:'#24303e',steel:'#607284',edge:'#b3bfbd',gold:'#c9a46a',orange:'#e69054',red:'#b95565',cyan:'#a4ede8'};
 const part=(a,mesh,p,s,col,em=0,b=SPACE_IDENTITY,alpha=1,mat=M)=>a.push(citadelItem(mesh,p,s,col,em,b,alpha,mat));
 function beam(a,p,q,r,c,em=0){part(a,'box',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5],c,em,spaceBasisDir(V3.sub(q,p)));}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];build(a);const result=stationMerge(a,'c230_'+key);templates.set(key,result);return result;}
 function instance(a,model,p,b=SPACE_IDENTITY,s=[1,1,1],hit=false){const matrix=spaceModel(p,s,b);for(const x of model)a.push({...x,pos:p,model:matrix,color:hit?spaceColor('#fff3dc'):x.color});}
 function dogBody(){return compile('hound',a=>{
  part(a,'p220_armour',[0,.3,0],[1.16,.65,2.35],C.dark);part(a,'p220_armour',[0,.8,.8],[1.12,.5,1.2],C.orange);
  for(let k=0;k<5;k++){part(a,'box',[0,1.06,-1.8+k*.65],[.6,.1,.2],k%2?C.dark:C.steel);}
  part(a,'p220_armour',[0,.8,2.15],[.76,.61,.85],C.steel);part(a,'p220_armour',[0,.5,2.98],[.56,.31,.75],C.dark);
  part(a,'box',[0,.73,3.6],[.45,.12,.1],C.gold);part(a,'box',[0,.12,2.9],[.55,.1,.7],C.edge);
  for(const side of [-1,1]){
   part(a,'p220_pylon',[side*.56,1.55,1.96],[.23,.6,.4],C.orange);
   part(a,'box',[side*.72,.99,2.55],[.07,.11,.35],'#ff583f',1,SPACE_IDENTITY,1,L);
   part(a,'p220_armour',[side*1.43,.68,-.8],[.43,.47,1.25],C.steel);
   part(a,'p220_nozzle',[side*1.43,.68,-2.06],[.42,.4,.42],C.gold,0,flightBasis(0,Math.PI/2));
   beam(a,[side*.8,.2,-.9],[side*1.4,.65,-1.2],.12,C.edge);
  }
  beam(a,[0,.4,-2.1],[0,.9,-3.3],.13,C.steel);beam(a,[0,.9,-3.3],[.3,1.6,-3.65],.09,C.orange);
 });}
 function dog(a,x,t,fx){const forward=V3.len(x.vel)>.5?x.vel:[0,0,1],b=spaceBasisDir(forward),scale=[1.12,1.12,1.12],model=spaceModel(x.pos,scale,b);
  instance(a,dogBody(),x.pos,b,scale,x.hit>0);
  for(const side of [-1,1])for(const front of [-1,1]){
   const kick=x.order==='attack'?.8:Math.sin(t*7+x.slot+front+side)*.32;
   const hip=[side*1,.15,front*1.45],knee=[side*1.43,-.7,front*1.45-1+kick],foot=[side*1.3,-1.35,front*1.45+.2+kick];
   const h=spacePoint(model,hip),k=spacePoint(model,knee),f=spacePoint(model,foot);beam(a,h,k,.18,C.gold);beam(a,k,f,.13,C.steel);
   part(a,'octa',k,[.3,.3,.3],C.dark);part(a,'p220_armour',f,[.33,.18,.57],C.orange,0,b);
  }
  for(const side of [-1,1]){const p=spacePoint(model,[side*1.43,.68,-2.48]);part(a,'octa',p,[.26,.26,(x.order==='attack'?2.3:1.2)+(fx?Math.sin(t*23+x.id)*.12:0)],'#81dfff',1,b,1,L);}
 }
 function vessel(role){return compile('ship_'+role,a=>{
  const color=api.roles[role]?.color||C.red;
  part(a,'p220_armour',[0,0,0],[1.8,1.1,4.3],C.dark);part(a,'p220_armour',[0,.6,.3],[1.5,.8,3.4],color);
  part(a,'p220_armour',[0,.3,4.1],[.9,.7,1.6],C.steel);part(a,'box',[0,1.35,2],[1,.1,.9],C.cyan,.75);
  for(const side of [-1,1]){
   part(a,'p220_armour',[side*3.1,-.2,-1],[1.5,.45,2.2],C.steel);part(a,'box',[side*3.2,.3,-1],[1.1,.1,1.7],color);
   part(a,'box',[side*2.4,0,2.9],[.18,.2,1.9],C.dark);part(a,'p220_nozzle',[side*2.8,0,-3.5],[.65,.6,.65],C.gold,0,flightBasis(0,Math.PI/2));
   if(role==='bomber')for(let k=0;k<3;k++)part(a,'p220_armour',[side*(2.3+k*.7),-.6,1],[.28,.36,2.7],C.gold);
   if(role==='shield'){part(a,'p220_armour',[side*5,.1,.6],[.55,1.6,3.4],C.steel);part(a,'box',[side*5,1.76,.6],[.32,.1,2.7],color,1);}
  }
  if(role==='jammer'){beam(a,[0,.8,-1],[0,4,-1],.17,C.edge);part(a,'ring',[0,3.6,-1],[2,2,.3],color,.8);for(const s of [-1,1])beam(a,[s*2,3.6,-1],[s*2,5,-1],.1,C.gold);}
  if(role==='commander'){part(a,'p220_pylon',[0,2,-1],[.6,1.8,2],C.gold);for(let s=-1;s<=1;s++)part(a,'p220_pylon',[s*.6,3,-1],[.17,.75,.3],C.gold);}
 });}
 function enemy(a,e,x,t,fx){if(x.torpedo){part(a,'p220_armour',x.pos,[.65,.65,2],C.gold,.3,spaceBasisDir(x.vel));part(a,'octa',V3.sub(x.pos,V3.scale(V3.norm(x.vel),2)),[.45,.45,1.4],'#ffe8ad',1,spaceBasisDir(x.vel));return;}
  if(x.role==='dog')dog(a,x,t,fx);else {const b=spaceBasisDir(V3.sub(e.escort.allies[x.ally]?.pos||e.player.pos,x.pos));instance(a,vessel(x.role),x.pos,b,Array(3).fill(x.role==='scout'?.75:1),x.hit>0);
   for(const s of [-1,1])part(a,'octa',spacePoint(spaceModel(x.pos,[1,1,1],b),[s*2.8,0,-4.4]),[.5,.5,1.7],x.color,1,b);
  }
  if(x.warp>0)part(a,'lightRing',x.pos,Array(3).fill(6+x.warp*6),x.color,1,SPACE_IDENTITY,x.warp*.4);
  if(x.role==='shield'){
   part(a,'lightRing',x.pos,[10,7,1],x.color,.9,SPACE_IDENTITY,.65);
   for(const n of e.enemies)if(n.shielded&&n.squad===x.squad)citadelBeam(a,x.pos,n.pos,x.color,.035,.4);
  }
  if(x.channel){const ally=e.escort.allies[x.ally];if(ally&&!ally.dead){citadelBeam(a,x.pos,ally.pos,x.color,.05,.6);part(a,'lightRing',ally.pos,[7,5,1],x.color,1,SPACE_IDENTITY,.4);}}
 }
 function scenery(a,e,time,fx){const stage=e.stage,col=e.escort.definition.color,motion=fx?time:0;
  for(let i=0;i<28;i++){const angle=i*2.39996,r=65+i%4*8,z=50-(motion*(100+i%3*12)+i*37)%850;part(a,'box',[Math.cos(angle)*r,Math.sin(angle)*r*.7,z],[.04,.04,5+i%7],i%4?col:'#cedcd3',1,SPACE_IDENTITY,.6);}
  for(let i=0;i<5;i++){
   const z=60-(motion*38+i*150)%780;
   for(const side of [-1,1]){
    const x=side*(stage===2?83:76);part(a,'p220_armour',[x,0,z],[5,stage===1?27:38,9],C.dark);
    part(a,'box',[x-side*5,0,z],[.25,25,5],col,.7);part(a,'p220_armour',[x,33,z],[8,3,12],C.steel);
    if(stage===1){part(a,'ring',[x,10,z+2],[13,13,2],col,.6);beam(a,[x,0,z],[x-side*10,20,z],.7,C.gold);}
    if(stage===2){part(a,'p220_pylon',[x,45,z],[6,15,6],C.steel);for(let k=0;k<4;k++)part(a,'box',[x-side*5.2,3+k*6,z+3],[.3,2,.5],C.gold,.4);}
    if(stage===0)for(let k=0;k<3;k++)part(a,'p220_armour',[x+side*9,10+k*8,z],[5,3,9],k%2?C.steel:C.gold);
   }
   if(stage===2){beam(a,[-83,37,z],[0,63,z],2,C.steel);beam(a,[0,63,z],[83,37,z],2,C.steel);}
  }
 }
 expeditionHyperScene=function(e,time,fx,hidePlayer=false){if(!api.active(e))return old.scene(e,time,fx,hidePlayer);const a=[];scenery(a,e,time,fx);
  for(const ally of e.escort.allies)if(!ally.dead)expeditionTransport(a,ally,time,fx);
  for(const x of e.enemies)if(!x.dead)enemy(a,e,x,time,fx);
  if(!hidePlayer)instance(a,CITADEL_PURSUIT_VIEW.model('player'),e.player.pos,flightBasis(e.player.yaw,e.player.pitch,e.player.bank),[.7,.7,.7]);
  for(const b of e.bullets)part(a,'box',b.pos,[b.type==='missile'?.18:.06,.08,1.8],b.color||C.cyan,1,spaceBasisDir(b.vel));
  for(const b of e.hostile)part(a,'octa',b.pos,[.35,.3,1.25],b.color,1,spaceBasisDir(b.vel));
  for(const x of e.explosions){const age=1-x.life/x.max;part(a,'octa',x.pos,Array(3).fill(1+age*7),x.color,1,SPACE_IDENTITY,1-age);if(fx)part(a,'lightRing',x.pos,Array(3).fill(2+age*13),x.color,1,SPACE_IDENTITY,1-age);}
  if(e.pulseWave>0)part(a,'lightRing',e.player.pos,Array(3).fill(4+(1-e.pulseWave)*95),C.cyan,1,SPACE_IDENTITY,e.pulseWave);
  for(const g of e.escort.ops230.groups)if(g.state==='telegraph'){
   const ally=e.escort.allies[g.target];if(ally&&!ally.dead)part(a,'lightRing',ally.pos,[8+Math.sin(time*6)*.3,6,1],'#ffa884',1,SPACE_IDENTITY,.8);
  }
  return a;
 };
 spaceCamera=function(e,time=0,preview=false){if(!api.active(e)||e.crash&&['crashing','lost','paused'].includes(e.status))return old.camera(e,time,preview);
  const p=e.player.pos,w=ARCADE.canvas?.width||1280,h=ARCADE.canvas?.height||720,portrait=w/h<.85;
  return Object.assign(stationLook([p[0]*.6,p[1]*.6+10.2,portrait?42:35],[p[0]*.2,0,-70],portrait?1.18:.98,{near:.35,far:2000}),{convoy230:true,chapter:e.stage,clock:e.escort.time});
 };
 function hud(c,e,cam,w,h){const mobile=w/h<.9,W=mobile?390:1280,H=h/w*W,pad=mobile?12:26,cq=e.escort,o=cq.ops230,m=api.mission(e),color=cq.definition.color;
  c.clearRect(0,0,w,h);c.save();c.scale(w/W,h/H);c.textBaseline='middle';
  c.fillStyle='#081524e8';c.fillRect(pad,12,W-pad*2,mobile?69:82);c.textAlign='left';c.fillStyle=color;c.font='bold '+(mobile?12:17)+'px monospace';c.fillText('КОНВОЙ '+(e.stage+1)+' / 3 · '+m.subtitle.toUpperCase(),pad+12,32);
  c.fillStyle='#c7d6df';c.font=(mobile?10:12)+'px monospace';c.fillText('ГРУППЫ '+o.next+'/'+m.groups.length+'   ПУТЬ '+Math.round(cq.distance*100)+'%   ЖИВЫ '+cq.allies.filter(a=>!a.dead).length+'/3',pad+12,54);
  c.fillStyle='#314556';c.fillRect(pad+12,mobile?68:77,W-pad*2-24,3);c.fillStyle=color;c.fillRect(pad+12,mobile?68:77,(W-pad*2-24)*cq.distance,3);
  const alert=o.groups.find(g=>g.state==='telegraph')||o.groups.find(g=>g.state==='attack'),alertY=mobile?99:114;
  if(alert){c.textAlign='center';c.fillStyle=alert.state==='telegraph'?'#ffc195':'#ef9ca7';c.font='bold '+(mobile?10:13)+'px monospace';c.fillText((alert.state==='telegraph'?'ЗАХОД: ':'АТАКА: ')+alert.name.toUpperCase(),W/2,alertY);c.font=(mobile?10:11)+'px monospace';c.fillText('ЦЕЛЬ → '+cq.allies[alert.target].name.toUpperCase(),W/2,alertY+17);}
  const target=e.target();for(const x of e.enemies){if(x.dead)continue;const p=spaceProject(x.pos,cam,W,H);if(p.z<0||p.x<16||p.x>W-16||p.y<135||p.y>H-95)continue;
   const chosen=x.id===target?.id,r=chosen?(mobile?18:28):(x.torpedo?12:7);c.strokeStyle=chosen?'#ffe4ad':x.color;c.lineWidth=chosen?2:1;c.strokeRect(p.x-r,p.y-r,r*2,r*2);
   if(chosen){c.textAlign='center';c.font=(mobile?9:11)+'px monospace';c.fillStyle='#ffdfb3';c.fillText(x.name.toUpperCase(),p.x,p.y-r-12);c.fillStyle='#354650';c.fillRect(p.x-r,p.y+r+8,r*2,3);c.fillStyle=x.color;c.fillRect(p.x-r,p.y+r+8,r*2*Math.max(0,x.hp/x.maxHp),3);}
  }
  const bw=(W-pad*2-16)/3,by=H-(mobile?79:92);cq.allies.forEach((a,i)=>{const x=pad+i*(bw+8);c.fillStyle='#081524e8';c.fillRect(x,by,bw,42);c.fillStyle=a.dead?'#b28286':a.hp<40?'#ffae88':'#9ee5d0';c.font=(mobile?9:12)+'px monospace';c.textAlign='left';c.fillText(a.name,x+6,by+12);c.textAlign='right';c.fillText(a.dead?'ПОТЕРЯН':Math.ceil(a.hp)+'%',x+bw-6,by+27);c.fillRect(x+6,by+35,(bw-12)*a.hp/100,3);});
  c.textAlign='left';c.fillStyle='#b4d5e0';c.font=(mobile?9:11)+'px monospace';c.fillText('ЩИТ '+Math.ceil(e.player.hp)+' · РАКЕТЫ '+e.player.missiles+' · E '+(e.player.pulseCooldown>0?Math.ceil(e.player.pulseCooldown)+'с':'ГОТОВО'),pad,H-22);
  if(!mobile){c.textAlign='right';c.fillText('TAB — УГРОЗА · ПРОБЕЛ — ОГОНЬ · Q — РАКЕТА · E — ПРИКРЫТИЕ',W-pad,H-22);}
  c.restore();
 }
 drawEscortHUD=function(c,e,cam,w,h){return api.active(e)?hud(c,e,cam,w,h):old.hud(c,e,cam,w,h);};
 drawMobileGameHUD=function(c,e,cam,w,h){return api.active(e)&&!e.crash?hud(c,e,cam,w,h):old.mobile(c,e,cam,w,h);};
 expeditionOverlay=function(e){if(!api.active(e)||e.status!=='escortbrief')return old.brief(e);const m=api.mission(e);return '<div class="arcade-state-card briefing escort-brief"><span class="arcade-serial">КОНВОЙ '+(e.stage+1)+' / 3 · '+m.groups.length+' ГРУППЫ ПРОТИВНИКА</span><h3>'+m.subtitle+'.</h3><p>'+m.brief+'</p><div class="brief-command"><span class="hostile-symbol">⌖</span><div><b>Сохраните минимум два транспорта</b><small>Tab — сменить цель · Пробел — огонь · Q / ПКМ — ракета.<br>E срывает заход стаи, рассеивает снаряды и восстанавливает щиты союзников.</small></div></div><button class="arcade-play" data-action="citadel-launch">ПРИКРЫТЬ КОНВОЙ ↗</button></div>';};
 updateExpeditionHUD=function(){const result=old.ui();const e=ARCADE.engine;if(!api.active(e))return result;const m=api.mission(e),o=e.escort.ops230,route=document.getElementById('citadel-route');
  if(route){const html='<div class="route-missions"><b>'+m.subtitle.toUpperCase()+'</b></div><div class="route-count"><small>ПУТЬ</small><b>'+Math.round(e.escort.distance*100)+'<em>%</em></b></div><div class="route-count"><small>ГРУППЫ ПРОТИВНИКА</small><b>'+o.next+'<em>/'+m.groups.length+'</em></b></div><p>Стаи · фланги · прикрытие<br>Сохраните 2 / 3 транспорта</p>';if(route.innerHTML!==html)route.innerHTML=html;}
  const brief=document.getElementById('arcade-mission-brief');if(brief)brief.textContent=m.brief;return result;
 };
 globalThis.CITADEL_CONVOY_VIEW=Object.freeze({version:'2.3.0',stats:()=>({templates:templates.size}),testDog:()=>{const a=[];dog(a,{pos:[0,0,0],vel:[0,0,1],slot:0,id:1,hit:0,order:'attack'},1,true);return a;}});
})();
