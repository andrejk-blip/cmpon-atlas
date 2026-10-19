/* Citadel 2.4.0 — hyperspace convoy presentation.
 * Flight tunnel and combat ships, no architectural gates or animal silhouettes.
 * Field openings use the exact simulation coordinates. No timers, listeners,
 * simulation writes, new renderer or texture downloads.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_CONVOY_VIEW?.version==='2.4.0'||globalThis.CITADEL_CONVOY?.version!=='2.4.0')return;
 const api=CITADEL_CONVOY,old={scene:expeditionHyperScene,camera:spaceCamera,hud:drawEscortHUD,mobile:drawMobileGameHUD,brief:expeditionOverlay,ui:updateExpeditionHUD};
 const templates=new Map(),M=20,L=24,TAU=Math.PI*2;
 const C={dark:'#202e43',steel:'#697d91',edge:'#d0dbd9',gold:'#d6b87f',red:'#da6981',cyan:'#8ff7ed',amber:'#ffb167'};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const active=e=>!!e&&(api.active(e)||!!api.legacyActive?.(e));
 const ops=e=>e.escort.ops240||e.escort.ops230;
 const part=(a,mesh,p,s,col,em=0,b=SPACE_IDENTITY,alpha=1,mat=M)=>{
  const item=citadelItem(mesh,p,s,col,em,b,alpha,mat);a.push(item);return item;
 };
 function beam(a,p,q,r,c,em=0,alpha=1){return part(a,'box',V3.lerp(p,q,.5),[r,r,V3.len(V3.sub(q,p))*.5],c,em,spaceBasisDir(V3.sub(q,p)),alpha,L);}
 function compile(key,build){if(templates.has(key))return templates.get(key);const a=[];build(a);const result=stationMerge(a,'c240_'+key);templates.set(key,result);return result;}
 function instance(a,model,p,b=SPACE_IDENTITY,s=[1,1,1],hit=false){const matrix=spaceModel(p,s,b);for(const x of model)a.push({...x,pos:p,model:matrix,color:hit?spaceColor('#fff3dc'):x.color});}
 const role=x=>x.role==='dog'?'interceptor':['scout','interceptor','raider','bomber','shield','jammer','commander'].includes(x.role)?x.role:'raider';
 const roleName=x=>x.role==='dog'?'Перехватчик':x.name;

 // A low-poly cylinder with normals facing the flight corridor. The camera is
 // inside it: identical geometry supplies the tunnel in GL and software mode.
 const vertices=[],faces=[];
 for(let layer=0;layer<=16;layer++)for(let i=0;i<28;i++){const t=i/28*TAU;vertices.push([Math.cos(t),Math.sin(t),-1+layer/8]);}
 for(let layer=0;layer<16;layer++)for(let i=0;i<28;i++){const at=layer*28,j=(i+1)%28;faces.push([at+i,at+i+28,at+j+28,at+j]);}
 SPACE_MESH.c240_tunnel=spaceMesh(vertices,faces);

 function vessel(type){return compile('ship_'+type,a=>{
  const color=api.roles[type]?.color||C.red,small=type==='scout'||type==='interceptor';
  // Long centre fuselage and swept, flat wings make a recognisable spacecraft.
  part(a,'p220_armour',[0,0,0],[small?1.0:1.6,.7,small?3.6:4.5],C.dark);
  part(a,'p220_armour',[0,.5,.3],[small?.8:1.35,.43,small?2.9:3.5],color);
  part(a,'p220_pylon',[0,.1,4],[.65,.5,1.4],C.edge,0,flightBasis(0,Math.PI/2));
  part(a,'p220_armour',[0,1.0,1],[.6,.25,1.2],'#8ab8c9',.18);
  for(const side of [-1,1]){
   beam(a,[side*.8,0,1.2],[side*(small?4.4:5.1),-.3,-2],small?.4:.68,C.steel);
   part(a,'p220_armour',[side*(small?3.3:3.8),-.1,-1.6],[.6,.38,2.3],color);
   part(a,'box',[side*(small?3.3:3.8),-.05,1.6],[.13,.14,1.2],C.dark);
   part(a,'box',[side*(small?3.3:3.8),-.05,2.85],[.15,.15,.13],C.amber,.65);
   part(a,'p220_nozzle',[side*(small?2.1:2.8),-.05,-3.4],[.45,.45,.5],C.steel,0,flightBasis(0,Math.PI/2));
   if(type==='bomber')for(let k=0;k<3;k++){
    const x=side*(2.1+k*.85);part(a,'p220_armour',[x,-.65,.2],[.28,.36,2.7],C.gold);
    part(a,'box',[x,-.65,2.6],[.2,.26,.14],C.amber,.6);
   }
   if(type==='shield'){
    part(a,'p220_armour',[side*5,.15,0],[.8,1.6,3.7],C.steel);
    part(a,'box',[side*5,1.76,0],[.4,.08,2.9],color,.8);
   }
   if(type==='raider'){
    part(a,'p220_armour',[side*1.8,.7,-.7],[.7,.7,2.6],C.steel);
    part(a,'box',[side*2.2,.8,2],[.2,.2,1.7],C.dark);
   }
  }
  if(type==='jammer'){
   beam(a,[0,.6,-1],[0,2.7,-1],.15,C.edge);
   beam(a,[-2.5,2.7,-1],[2.5,2.7,-1],.12,color,.8);
   for(const s of [-1,1])part(a,'p220_armour',[s*2.5,2.7,-1],[.22,.7,.25],color,.7);
  }
  if(type==='commander'){
   part(a,'p220_armour',[0,1.2,-1.1],[1,.65,2.4],C.gold);
   part(a,'box',[0,1.9,-1.2],[.13,.25,2],C.edge);
  }
 });}
 function enemy(a,e,x,time,fx){
  const type=role(x),velocity=x.vel||[0,0,1];
  if(x.torpedo){const b=spaceBasisDir(velocity);part(a,'p220_armour',x.pos,[.55,.55,2],C.gold,.25,b);part(a,'octa',V3.sub(x.pos,V3.scale(V3.norm(velocity),2)),[.3,.3,1.5],C.amber,1,b,1,L);return;}
  const b=spaceBasisDir(V3.sub(e.escort.allies[x.ally]?.pos||e.player.pos,x.pos)),s=type==='scout'?.72:type==='interceptor'?.84:1;
  instance(a,vessel(type),x.pos,b,[s,s,s],x.hit>0);
  const model=spaceModel(x.pos,[s,s,s],b);
  for(const side of [-1,1])part(a,'octa',spacePoint(model,[side*((type==='scout'||type==='interceptor')?2.1:2.8),-.05,-4]),[.35,.35,1.3+(fx?Math.sin(time*17+x.id)*.1:0)],x.color,1,b,1,L);
  if(x.warp>0){for(let k=0;k<5;k++){const q=V3.add(x.pos,[(k-2)*1.4,0,-x.warp*(5+k*4)]);part(a,'box',q,[.06,.09,1+x.warp*7],x.color,1,SPACE_IDENTITY,x.warp*.6,L);}}
  if(type==='shield'){
   part(a,'ring',x.pos,[9.5,6.5,.7],x.color,.8,SPACE_IDENTITY,.4,L);
   for(const n of e.enemies)if(n.shielded&&n.squad===x.squad)citadelBeam(a,x.pos,n.pos,x.color,.03,.3);
  }
  if(x.channel){const ally=e.escort.allies[x.ally];if(ally&&!ally.dead)citadelBeam(a,x.pos,ally.pos,x.color,.05,.55);}
 }
 function transport(a,ally,time,fx){const model=compile('transport',p=>{
  part(p,'p220_armour',[0,0,0],[2,1.3,5.7],'#5d858d');part(p,'p220_armour',[0,.3,5],[1.7,1.4,2.3],'#b8cac2');
  part(p,'box',[0,1.8,4],[1.35,.1,1.1],C.cyan,.8);
  for(const side of [-1,1]){
   part(p,'p220_armour',[side*3.5,-.3,-1],[1.1,1,4.5],'#365871');part(p,'box',[side*3.5,.8,-1],[.7,.07,3.9],C.edge);
   part(p,'box',[side*3.5,.92,-2],[.12,.04,2.5],C.cyan,1);
   for(let k=0;k<3;k++)part(p,'box',[side*2,.2,-3+k*2],[.8,.9,.7],'#839799');
  }
 });const b=flightBasis(0,0,Math.sin(time*.7+ally.id)*.015);instance(a,model,ally.pos,b,[1,1,1],ally.hit>0);
  for(const side of [-1,1])part(a,'octa',spacePoint(spaceModel(ally.pos,[1,1,1],b),[side*3.5,-.3,-7]),[.65,.5,2+(fx?Math.sin(time*22)*.2:0)],C.cyan,1,b,1,L);
 }
 function tunnel(a,e,time,fx){
  const color=e.escort.definition.color,motion=fx?time:0;
  part(a,'c240_tunnel',[0,0,-690],[88,61,790],'#0b203a',1,SPACE_IDENTITY,1,L).convoyTunnel=true;
  // Long, spiralling filaments wrap around the flight volume; no closed hoops.
  for(let strand=0;strand<10;strand++)for(let j=0;j<8;j++){
   const z=50-j*175,twist=motion*.025+strand*TAU/10+j*.12;
   const p=[Math.cos(twist)*85,Math.sin(twist)*58,z];
   const q=[Math.cos(twist+.12)*85,Math.sin(twist+.12)*58,z-175];
   const tint=strand%3?'#54c5ff':color;
   beam(a,p,q,j<3?.18:.28,tint,1,.52).convoyTunnel=true;
   if(strand%2===0)beam(a,p,q,1.7,tint,1,.055).convoyTunnel=true;
  }
  for(let i=0;i<(fx?62:24);i++){
   const angle=i*2.399963,r=62+i%6*3.3,z=65-((motion*(165+i%5*18)+i*47)%810);
   const p=[Math.cos(angle)*r,Math.sin(angle)*r*.69,z];
   part(a,'box',p,[.045+(i%3)*.02,.045,4+i%6*2],i%5?'#96d8f3':color,1,SPACE_IDENTITY,.35+(i%4)*.13,L).convoyTunnel=true;
  }
 }

 // Four non-overlapping danger rectangles cover everything except the real
 // opening. These exact bounds are also exposed for contract/visual tests.
 function fieldRects(f){const x0=f.gapX-f.halfW,x1=f.gapX+f.halfW,y0=f.gapY-f.halfH,y1=f.gapY+f.halfH;
  return [{x0:-76,x1:x0,y0:-52,y1:52},{x0:x1,x1:76,y0:-52,y1:52},{x0,x1,y0:-52,y1:y0},{x0,x1,y0:y1,y1:52}].filter(r=>r.x1>r.x0&&r.y1>r.y0);
 }
 function field(a,f,time,fx){
  if(f.passed||!Number.isFinite(f.z))return;
  const urgency=clamp(1-(f.warning||0)/5.4,0,1),alpha=.16+urgency*.13;
  for(const r of fieldRects(f)){
   const p=[(r.x0+r.x1)/2,(r.y0+r.y1)/2,f.z],size=[(r.x1-r.x0)/2,(r.y1-r.y0)/2,.13];
   const plate=part(a,'box',p,size,'#f2664b',.88,SPACE_IDENTITY,alpha,L);plate.convoyField=f.id;plate.fieldRect={...r};
   const bars=Math.min(8,Math.ceil((r.y1-r.y0)/8));
   for(let j=0;j<bars;j++){
    const y=r.y0+(j+.5)*(r.y1-r.y0)/bars;
    part(a,'box',[(r.x0+r.x1)/2,y,f.z+.2],[(r.x1-r.x0)/2,.07,.025],j%2?'#ffc37c':'#ff8870',1,SPACE_IDENTITY,.24+urgency*.2,L).convoyField=f.id;
   }
  }
  // Thin luminous edges belong to the field, never a solid architectural gate.
  const x=f.gapX,y=f.gapY,hx=f.halfW,hy=f.halfH,z=f.z+.32;
  const points=[[x-hx,y-hy,z],[x+hx,y-hy,z],[x+hx,y+hy,z],[x-hx,y+hy,z]];
  for(let i=0;i<4;i++){const edge=beam(a,points[i],points[(i+1)%4],.12,C.cyan,1,.82);edge.convoyField=f.id;edge.convoyOpening=true;}
 }
 function fields(e){return e.escort.ops240?.fields||[];}
 function nearest(e){return fields(e).filter(f=>!f.passed&&f.z<=4).sort((a,b)=>b.z-a.z)[0]||null;}
 expeditionHyperScene=function(e,time,fx,hidePlayer=false){
  if(!active(e))return old.scene(e,time,fx,hidePlayer);const a=[];tunnel(a,e,time,fx);
  for(const ally of e.escort.allies)if(!ally.dead)transport(a,ally,time,fx);
  for(const x of e.enemies)if(!x.dead)enemy(a,e,x,time,fx);
  for(const f of fields(e))field(a,f,time,fx);
  if(!hidePlayer)expeditionShip(a,e.player.pos,flightBasis(e.player.yaw,e.player.pitch,e.player.bank),1.08,'#bbd4df','#96edff');
  for(const b of e.bullets)part(a,'box',b.pos,[b.type==='missile'?.18:.06,.08,1.8],b.color||C.cyan,1,spaceBasisDir(b.vel),1,L);
  for(const b of e.hostile)part(a,'octa',b.pos,[.35,.3,1.25],b.color,1,spaceBasisDir(b.vel),1,L);
  for(const x of e.explosions){const age=1-x.life/x.max;part(a,'octa',x.pos,Array(3).fill(1+age*7),x.color,1,SPACE_IDENTITY,1-age,L);if(fx)part(a,'ring',x.pos,Array(3).fill(2+age*13),x.color,1,SPACE_IDENTITY,1-age,L);}
  if(e.pulseWave>0)part(a,'ring',e.player.pos,Array(3).fill(4+(1-e.pulseWave)*95),C.cyan,1,SPACE_IDENTITY,e.pulseWave,L);
  return a;
 };
 spaceCamera=function(e,time=0,preview=false){
  if(!active(e)||e.crash&&['crashing','lost','paused'].includes(e.status))return old.camera(e,time,preview);
  const p=e.player.pos,w=ARCADE.canvas?.width||1280,h=ARCADE.canvas?.height||720,portrait=w/h<.85;
  // Keep both flanks visible in portrait; a compact player leaves the window clear.
  return Object.assign(stationLook([p[0]*.48,p[1]*.48+8.5,portrait?43:31],[p[0]*.12,0,-78],portrait?1.21:1.02,{near:.35,far:2000}),{convoy230:true,convoy240:true,chapter:e.stage,clock:e.escort.time});
 };
 function fieldMap(c,e,f,W,H,mobile){
  const compact=mobile&&H<450,mw=compact?112:mobile?152:184,mh=mw*42/80,x=compact?W-mw-20:W/2-mw/2,y=compact?Math.max(112,H-179):H-(mobile?197:218),sx=mw/80,sy=mh/42,r=2.8,cx=x+mw/2;
  c.fillStyle='#071622ef';c.fillRect(x-9,y-(compact?16:25),mw+18,mh+(compact?34:48));
  c.textAlign='center';c.font='bold '+(mobile?10:11)+'px sans-serif';c.fillStyle=C.cyan;c.fillText(compact?'ВАШ КУРС':'КУРС В СВОБОДНОЕ ОКНО',cx,y-(compact?7:11));
  c.save();c.beginPath();c.rect(x,y,mw,mh);c.clip();c.fillStyle='#be493577';c.fillRect(x,y,mw,mh);
  const gx=x+(f.gapX-f.halfW+40)*sx,gy=y+(21-f.gapY-f.halfH)*sy,gw=f.halfW*2*sx,gh=f.halfH*2*sy;
  c.clearRect(gx,gy,gw,gh);c.fillStyle='#103a43';c.fillRect(gx,gy,gw,gh);c.strokeStyle=C.cyan;c.lineWidth=1.5;c.strokeRect(gx,gy,gw,gh);
  c.strokeStyle='#b6fff177';c.setLineDash([3,3]);c.lineWidth=1;c.strokeRect(gx+r*sx,gy+r*sy,gw-r*2*sx,gh-r*2*sy);c.setLineDash([]);
  const px=x+(e.player.pos[0]+40)*sx,py=y+(21-e.player.pos[1])*sy;
  const safe=Math.abs(e.player.pos[0]-f.gapX)<=f.halfW-r&&Math.abs(e.player.pos[1]-f.gapY)<=f.halfH-r;
  c.fillStyle=safe?'#b6fff1':'#fff2d6';c.beginPath();c.moveTo(px,py-5);c.lineTo(px-4,py+4);c.lineTo(px+4,py+4);c.closePath();c.fill();c.restore();
  c.textAlign='center';c.fillStyle=safe?C.cyan:C.amber;c.font=(mobile?10:11)+'px sans-serif';c.fillText(safe?(compact?'БЕЗОПАСНО':'КУРС БЕЗОПАСЕН'):(f.gapX>e.player.pos[0]+2?'ВПРАВО':f.gapX<e.player.pos[0]-2?'ВЛЕВО':f.gapY>e.player.pos[1]?'ВВЕРХ':'ВНИЗ')+(compact?'':' · УЙДИТЕ ИЗ ПОЛЯ'),cx,y+mh+12);
 }
 function aiming(c,e,cam,W,H,mobile,target,aim){
  if(!target||!aim||target.pos[2]>=e.player.pos[2]-4)return;
  const p=e.player.pos,z=target.pos[2],r=(p[2]-z)*aim.cone+(target.r||0),center=spaceProject([p[0],p[1],z],cam,W,H);
  if(center.z<=0)return;const compact=mobile&&H<450,top=compact?98:140,bottom=compact?62:110;c.save();c.beginPath();c.rect(10,top,W-20,Math.max(1,H-top-bottom));c.clip();
  c.strokeStyle=aim.locked?'#8ef7d780':'#d4e7ef60';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();
  for(let i=0;i<=32;i++){const t=i/32*TAU,q=spaceProject([p[0]+Math.cos(t)*r,p[1]+Math.sin(t)*r,z],cam,W,H);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);}c.stroke();c.setLineDash([]);
  c.strokeStyle=aim.locked?C.cyan:'#cee7ee';c.lineWidth=1.5;c.beginPath();c.moveTo(center.x-5,center.y);c.lineTo(center.x+5,center.y);c.moveTo(center.x,center.y-5);c.lineTo(center.x,center.y+5);c.stroke();c.restore();
  const q=spaceProject(target.pos,cam,W,H);if(q.z>0&&(q.x<20||q.x>W-20||q.y<top+10||q.y>H-bottom-5)){
   const x=clamp(q.x,25,W-25),y=clamp(q.y,top+13,H-bottom-6),angle=Math.atan2(q.y-H/2,q.x-W/2);
   c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=C.amber;c.beginPath();c.moveTo(7,0);c.lineTo(-5,-5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
  }
 }
 function hud(c,e,cam,w,h){
  const mobile=w/h<.9||typeof isMobileLayout==='function'&&isMobileLayout(),cssW=ARCADE.canvas?.getBoundingClientRect?.().width||390,W=mobile?clamp(cssW,300,960):1280,H=h/w*W,compact=mobile&&H<450,pad=mobile?12:26,cq=e.escort,o=ops(e),m=api.mission(e),color=cq.definition.color,f=nearest(e);
  c.clearRect(0,0,w,h);c.save();c.scale(w/W,h/H);c.textBaseline='middle';
  c.fillStyle='#081524df';c.fillRect(pad,compact?6:12,W-pad*2,compact?45:mobile?68:77);c.textAlign='left';c.fillStyle=color;c.font='bold '+(mobile?12:17)+'px sans-serif';
  c.fillText('КОНВОЙ '+(e.stage+1)+' / 3 · '+m.subtitle.toUpperCase(),pad+12,compact?20:32);
  c.fillStyle='#c7d6df';c.font=(mobile?10:12)+'px sans-serif';c.fillText('ГРУППЫ '+o.next+'/'+m.groups.length+'   ПУТЬ '+Math.round(cq.distance*100)+'%   ЖИВЫ '+cq.allies.filter(a=>!a.dead).length+'/3',pad+12,compact?38:54);
  c.fillStyle='#314556';c.fillRect(pad+12,compact?49:mobile?68:76,W-pad*2-24,3);c.fillStyle=color;c.fillRect(pad+12,compact?49:mobile?68:76,(W-pad*2-24)*cq.distance,3);
  const alert=o.groups.find(g=>g.state==='telegraph')||o.groups.find(g=>g.state==='attack'),alertY=compact?68:mobile?98:111;
  if(f){
   c.fillStyle='#271b20ed';c.fillRect(pad,compact?58:86,W-pad*2,compact?37:mobile?48:52);c.textAlign='center';c.fillStyle=C.amber;c.font='bold '+(mobile?13:17)+'px sans-serif';c.fillText('ОПАСНОЕ ПОЛЕ · '+Math.max(0,f.warning).toFixed(1)+' с',W/2,compact?70:mobile?102:105);
   c.fillStyle='#f7c7aa';c.font=(mobile?10:12)+'px sans-serif';c.fillText('ПРОЙДИТЕ В СВОБОДНОЕ ОКНО · БОЛЬШОЙ УРОН',W/2,compact?86:mobile?121:126);
   fieldMap(c,e,f,W,H,mobile);
  }else if(alert){
   c.textAlign='center';c.fillStyle=alert.state==='telegraph'?'#ffc195':'#ef9ca7';c.font='bold '+(mobile?11:14)+'px sans-serif';
   c.fillText((alert.state==='telegraph'?'ЗАХОД: ':'АТАКА: ')+alert.name.toUpperCase().replace(/СТАЯ|СТАИ/g,'ЗВЕНО'),W/2,alertY);
   c.font=(mobile?10:12)+'px sans-serif';c.fillText('ЦЕЛЬ → '+(cq.allies[alert.target]?.name||'КОНВОЙ').toUpperCase(),W/2,alertY+17);
  }
  const selected=e.enemies.find(x=>!x.dead&&x.id===e.selectedTarget),aim=e.escort.ops240?.aim;
  aiming(c,e,cam,W,H,mobile,selected,aim);
  for(const x of e.enemies){if(x.dead)continue;const p=spaceProject(x.pos,cam,W,H);if(p.z<0||p.x<16||p.x>W-16||p.y<(compact?105:145)||p.y>H-(compact?66:f?210:110))continue;
   const chosen=x.id===selected?.id,r=chosen?(mobile?18:25):x.torpedo?11:6;
   c.strokeStyle=chosen?(aim?.locked?'#a5ffdb':'#ffe4ad'):x.color;c.lineWidth=chosen?2:1;
   // Four small brackets leave ships and firing telegraphs unobscured.
   for(const s of [-1,1])for(const t of [-1,1]){c.beginPath();c.moveTo(p.x+s*(r-5),p.y+t*r);c.lineTo(p.x+s*r,p.y+t*r);c.lineTo(p.x+s*r,p.y+t*(r-5));c.stroke();}
   if(chosen){c.textAlign='center';c.font=(mobile?10:12)+'px sans-serif';c.fillStyle='#ffdfb3';c.fillText(roleName(x).toUpperCase(),p.x,p.y-r-11);c.fillStyle='#354650';c.fillRect(p.x-r,p.y+r+7,r*2,3);c.fillStyle=x.color;c.fillRect(p.x-r,p.y+r+7,r*2*Math.max(0,x.hp/x.maxHp),3);}
  }
  if(aim&&selected&&!f){c.textAlign='center';c.fillStyle=aim.locked?C.cyan:C.amber;c.font='bold '+(mobile?10:12)+'px sans-serif';c.fillText(aim.locked?'ЦЕЛЬ В ПРИЦЕЛЕ · ОГОНЬ':'СМЕЩАЙТЕСЬ К ЦЕЛИ ДЛЯ ЗАХВАТА',W/2,H-(compact?70:mobile?106:121));}
  const bw=(W-pad*2-16)/3,by=H-(compact?56:mobile?79:92);cq.allies.forEach((a,i)=>{const x=pad+i*(bw+8);c.fillStyle='#081524e8';c.fillRect(x,by,bw,compact?29:42);c.fillStyle=a.dead?'#b28286':a.hp<40?'#ffae88':'#9ee5d0';c.font=(mobile?9:12)+'px sans-serif';c.textAlign='left';c.fillText(a.name,x+6,by+(compact?9:12));c.textAlign='right';c.fillText(a.dead?'ПОТЕРЯН':Math.ceil(a.hp)+'%',x+bw-6,by+(compact?19:27));c.fillRect(x+6,by+(compact?25:35),(bw-12)*a.hp/100,3);});
  c.textAlign='left';c.fillStyle='#b4d5e0';c.font=(mobile?10:11)+'px sans-serif';c.fillText('ЩИТ '+Math.ceil(e.player.hp)+' · РАКЕТЫ '+e.player.missiles+' · '+(mobile?'ПРИКРЫТИЕ ':'E ')+(e.player.pulseCooldown>0?Math.ceil(e.player.pulseCooldown)+'с':'ГОТОВО'),pad,H-(compact?12:22));
  if(!mobile){c.textAlign='right';c.fillText('WASD — МАНЁВР · TAB — ЦЕЛЬ · ПРОБЕЛ — ОГОНЬ · Q — РАКЕТА · E — ПРИКРЫТИЕ',W-pad,H-22);}
  c.restore();
 }
 drawEscortHUD=function(c,e,cam,w,h){return active(e)?hud(c,e,cam,w,h):old.hud(c,e,cam,w,h);};
 drawMobileGameHUD=function(c,e,cam,w,h){return active(e)&&!e.crash?hud(c,e,cam,w,h):old.mobile(c,e,cam,w,h);};
 expeditionOverlay=function(e){
  if(!active(e)||e.status!=='escortbrief')return old.brief(e);const m=api.mission(e),modern=api.active(e);
  return '<div class="arcade-state-card briefing escort-brief"><span class="arcade-serial">ГИПЕРПРОСТРАНСТВО · КОНВОЙ '+(e.stage+1)+' / 3</span><h3>'+esc(m.subtitle)+'.</h3><p>'+esc(modern?m.brief:'Продолжение сохранённого перехода. Сохраните два транспорта и перехватывайте ударные звенья.')+'</p><div class="brief-command"><span class="hostile-symbol">⌖</span><div><b>Сохраните минимум два транспорта</b><small>Маневрируйте к цели и удерживайте огонь. Зелёный прицел означает захват. Ракеты разбивают тяжёлые цели; '+(modern?'прикрытие рассеивает снаряды и защищает конвой на 2,8 секунды.':'прикрытие рассеивает снаряды и восстанавливает щиты.')+'</small></div></div>'+(modern?'<div class="brief-command"><span class="crystal-symbol">↗</span><div><b>Красное поле — опасность. Светлый просвет — путь.</b><small>Заранее сместите корабль в свободное окно. Схема показывает ваше положение; столкновение наносит большой урон.</small></div></div>':'')+'<button class="arcade-play" data-action="citadel-launch">ПРИКРЫТЬ КОНВОЙ ↗</button></div>';
 };
 function touchControls(e){
  const on=!!e&&api.active(e),screen=document.getElementById('arcade-screen');screen?.classList.toggle('convoy240-controls',on);
  const actions=screen?.querySelector?.('.arcade-touch-actions');
  // Only a real mounted DOM can receive controls. Minimal simulation DOMs do
  // not pretend that markup has been inserted; gameplay never depends on it.
  if(actions?.nodeType!==1||typeof actions.querySelector!=='function')return;
  const make=(id,action,label)=>{let b=actions.querySelector('#'+id);if(!b&&on){b=document.createElement('button');b.type='button';b.id=id;b.className='convoy240-touch-control';b.dataset.action=action;b.textContent=label;actions.appendChild(b);}return b;};
  const target=make('convoy240-target-touch','citadel-target','ЦЕЛЬ'),cover=make('convoy240-cover-touch','arcade-pulse','ПРИКРЫТИЕ');
  const playing=on&&e.status==='playing';
  if(target){target.hidden=!on;target.disabled=!playing;target.setAttribute('aria-label','Сменить цель конвоя');}
  if(cover){const wait=on?Math.ceil(e.player.pulseCooldown||0):0,protectedNow=on&&e.escort.ops240.cover>0;
   cover.hidden=!on;cover.disabled=!playing||wait>0;
   const label='ПРИКРЫТИЕ\n'+(protectedNow?'АКТИВНО':wait>0?wait+' с':'ГОТОВО');if(cover.textContent!==label)cover.textContent=label;
   cover.setAttribute('aria-label',protectedNow?'Прикрытие активно':wait>0?'Прикрытие: готово через '+wait+' секунд':'Прикрыть конвой');
  }
 }
 updateExpeditionHUD=function(){const result=old.ui();const e=ARCADE.engine;touchControls(e);if(!active(e))return result;const m=api.mission(e),o=ops(e),route=document.getElementById('citadel-route');
  if(route){const html='<div class="route-missions"><b>'+esc(m.subtitle.toUpperCase())+'</b></div><div class="route-count"><small>ГИПЕРПЕРЕХОД</small><b>'+Math.round(e.escort.distance*100)+'<em>%</em></b></div><div class="route-count"><small>ЗВЕНЬЯ ПРОТИВНИКА</small><b>'+o.next+'<em>/'+m.groups.length+'</em></b></div><p>Манёвр · перехват · прикрытие<br>Сохраните 2 / 3 транспорта</p>';if(route.innerHTML!==html)route.innerHTML=html;}
  const brief=document.getElementById('arcade-mission-brief');if(brief)brief.textContent=api.active(e)?m.brief:'Гиперпереход · сохраните два транспорта';return result;
 };
 globalThis.CITADEL_CONVOY_VIEW=Object.freeze({version:'2.4.0',stats:()=>({templates:templates.size,tunnelSegments:28}),fieldRects,
  testVessel:type=>{const a=[];instance(a,vessel(type),[0,0,0]);return a;}});
})();
