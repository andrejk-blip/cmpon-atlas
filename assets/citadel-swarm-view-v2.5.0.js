/* Цитадель ЦСИИ 2.5.0 — shared fleet materials for the orthographic swarm.
 * Rendering only: no timers, listeners, RNG, simulation state or image cache.
 * Enemy hulls fit existing collision ellipses. The larger arcade player ship
 * has an explicit luminous vulnerable core at the unchanged radius of 1.65.
 * Navigation marks, exhaust and dive warnings are deliberately non-solid.
 */
(() => {
  'use strict';
  const VERSION = '2.5.0';
  if (globalThis.CITADEL_SWARM_VIEW?.version === VERSION || !globalThis.CITADEL_SWARM ||
      typeof drawFlightHUD !== 'function' || typeof drawMobileGameHUD !== 'function') return;
  const originalFlight = drawFlightHUD, originalMobile = drawMobileGameHUD;
  const TAU = Math.PI * 2, FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const active = e => e?.stage === 2 && !e.finale && e.phase === 'swarm' &&
    ['1.9.0','2.5.0'].includes(e.swarm?.version) && !e.swarm.complete;
  const palettes = Object.freeze([
    Object.freeze({low:'#182b38', mid:'#4e6672', high:'#a7b4b6', edge:'#c2cdca', trim:'#a8535a', glass:'#e4a3a0'}),
    Object.freeze({low:'#202a35', mid:'#526574', high:'#b2bfbc', edge:'#d2d2c2', trim:'#9b404f', glass:'#f1b4a5'}),
    Object.freeze({low:'#252937', mid:'#596574', high:'#c7c8b9', edge:'#e0d2b0', trim:'#89404f', glass:'#f6c3ab'}),
    Object.freeze({low:'#294d60', mid:'#94b3bc', high:'#e3e6d7', edge:'#f2f5e9', trim:'#43b9c6', glass:'#a5f4f2'}),
  ]);
  // All points are inside the unit disk. Scaling by the projected radius
    // therefore remains truthful even on a narrow or anisotropic viewport.
    // Player template is a visible spacecraft; its separate core shows damage.
  const hulls = Object.freeze([
    Object.freeze([[0,-.96],[.22,-.39],[.69,-.51],[.84,-.16],[.67,.58],[.32,.36],[.21,.76],[-.21,.76],[-.32,.36],[-.67,.58],[-.84,-.16],[-.69,-.51],[-.22,-.39]]),
    Object.freeze([[0,-.92],[.29,-.57],[.58,-.65],[.86,-.23],[.86,.24],[.54,.66],[.26,.46],[.19,.82],[-.19,.82],[-.26,.46],[-.54,.66],[-.86,.24],[-.86,-.23],[-.58,-.65],[-.29,-.57]]),
    Object.freeze([[0,-.98],[.23,-.57],[.49,-.62],[.70,-.38],[.88,-.19],[.88,.21],[.63,.61],[.43,.47],[.21,.84],[-.21,.84],[-.43,.47],[-.63,.61],[-.88,.21],[-.88,-.19],[-.70,-.38],[-.49,-.62],[-.23,-.57]]),
    Object.freeze([[0,-.98],[.19,-.44],[.29,-.16],[.73,.17],[.82,.46],[.43,.43],[.28,.62],[.17,.80],[-.17,.80],[-.28,.62],[-.43,.43],[-.82,.46],[-.73,.17],[-.29,-.16],[-.19,-.44]]),
  ].map(points => Object.freeze(points.map(point => Object.freeze(point)))));
  function polygon(c, points, fill, stroke) {
    c.beginPath(); for (let i=0;i<points.length;i++) i ? c.lineTo(...points[i]) : c.moveTo(...points[i]);
    c.closePath(); if(fill){c.fillStyle=fill;c.fill();} if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  function line(c, x1,y1,x2,y2,color,width) {
    c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
  }
  function ellipse(c,x,y,rx,ry,color) {
    c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);c.fill();
  }
  function projectedRadius(project,pos,r) {
    const q=project(pos),x=project([pos[0]+r,pos[1],pos[2]||0]),y=project([pos[0],pos[1]+r,pos[2]||0]);
    return {x:q.x,y:q.y,rx:Math.abs(x.x-q.x),ry:Math.abs(y.y-q.y)};
  }
  function ship(c,q,rank,angle,flash,fx,time,boost,role) {
    const color=palettes[rank],player=rank===3;
    c.save();c.translate(q.x,q.y);c.scale(q.rx,q.ry);c.rotate(angle);c.scale(.97,.97);
    c.lineJoin='round';c.lineWidth=.045;
    // Exhaust is a translucent effect outside the hull, never a collision cue.
    if(fx)for(const side of [-1,1]) {
      const x=side*(player?.29:rank===0?.53:.58),y=player?.49:.46;
      const length=(boost?1.7:.46)+(Math.sin(time*19+side)*.08);
      polygon(c,[[x-.095,y],[x+.095,y],[x+.04,y+length],[x,y+length+.15],[x-.04,y+length]],player?'#66d5e345':'#dc879532');
      ellipse(c,x,y+.10,.065,.16,player?'#a9faffbd':'#f7c1b69c');
    }
    const metal=c.createLinearGradient(-.7,-.6,.5,.8);
    metal.addColorStop(0,flash?'#fff4df':color.high);metal.addColorStop(.35,flash?'#fff8eb':color.mid);metal.addColorStop(.7,color.low);metal.addColorStop(1,color.mid);
    polygon(c,hulls[rank],metal,color.edge);
    for(const side of [-1,1]) {
      // Paired nacelles, bevels, nozzle collars and separate armor plates.
      const x=side*(player?.43:rank===0?.58:.63),wing=player?.12:.15;
      polygon(c,[[x-wing,-.32],[x+wing,-.22],[x+wing,.35],[x,.57],[x-wing,.34]],color.low);
      polygon(c,[[x-wing*.7,-.30],[x+wing*.55,-.20],[x+wing*.55,.27],[x-wing*.7,.19]],flash?'#fff9eb':color.high);
      line(c,x-wing*.7,.31,x+wing*.7,.31,color.trim,.08);
      line(c,x-wing*.68,.41,x+wing*.68,.41,color.edge,.04);
      if(!player) {
        polygon(c,[[side*.25,-.34],[side*.48,-.42],[side*.47,.17],[side*.29,.25]],color.trim);
        line(c,side*.28,-.31,side*.43,-.33,color.edge,.025);
        // The heavy rank has split shoulders; the commander has a crown.
        if(rank>0)line(c,side*.72,-.25,side*.80,.06,color.trim,.10);
      }
    }
    polygon(c,[[0,-.92],[.17,-.43],[.20,.31],[0,.68],[-.20,.31],[-.17,-.43]],flash?'#fff6df':color.high);
    polygon(c,[[0,-.85],[.055,-.37],[.055,.48],[0,.60],[-.05,.46],[-.05,-.36]],color.edge);
    polygon(c,[[0,-.48],[.11,-.29],[.12,-.02],[0,.10],[-.12,-.02],[-.11,-.29]],color.low);
    polygon(c,[[0,-.43],[.074,-.27],[.075,-.045],[0,.03],[-.075,-.045],[-.074,-.27]],color.glass);
    line(c,-.07,-.25,.06,-.30,'#f6ffff',.025);
    for(const side of [-1,1]) {
      line(c,side*.09,.15,side*.14,.33,color.low,.025);
      ellipse(c,side*(player?.31:.29),.31,.033,.055,player?'#bcffff':color.glass);
    }
    if(rank===2) {
      polygon(c,[[-.22,-.59],[0,-.72],[.22,-.59],[.18,-.49],[-.18,-.49]],color.trim);
      for(let i=-1;i<=1;i++)line(c,i*.1,-.61,i*.1,-.52,color.edge,.035);
    }
    if(role==='interceptor')for(const side of [-1,1])
      line(c,side*.32,-.49,side*.33,-.12,color.edge,.055);
    if(role==='bomber')for(const side of [-1,1])
      polygon(c,[[side*.30,.12],[side*.48,.12],[side*.49,.48],[side*.33,.56]],color.trim,color.edge);
    c.restore();
  }
  function backdrop(c,e,l,fx) {
    const {W,H}=l,t=fx?e.swarm.time:0,seed=Math.abs(e.seed||0)%197;
    c.fillStyle='#060e1b';c.fillRect(0,0,W,H);
    const haze=c.createRadialGradient(W*.63,H*.26,0,W*.63,H*.26,Math.max(W,H)*.66);
    haze.addColorStop(0,'#193449');haze.addColorStop(.48,'#0c2030');haze.addColorStop(1,'#060e1b');
    c.fillStyle=haze;c.fillRect(0,0,W,H);
    // Fixed stars: no allocations retained and no particles spawned by render.
    for(let i=0;i<108;i++) {
      const depth=i%3+1,x=((i*137.71+seed)%997)/997*W;
      const y=((i*71.31+t*depth*2.1)%809)/809*H;
      c.globalAlpha=.18+(i%5)*.1;c.fillStyle=depth===1?'#e8ede1':'#6d99b3';
      const size=i%19===0?1.7:1;c.fillRect(x,y,size,size);
      if(fx&&i%19===0)line(c,x,y-2,x,y+3,'#8eb8c1',.5);
    }
    c.globalAlpha=1;
    // A distant, subdued station rim establishes scale without inventing hazards.
    c.strokeStyle='#7da4b80d';c.lineWidth=Math.max(2,W*.004);
    c.beginPath();c.ellipse(W*.11,H*.52,W*.57,H*.87,-.21,-1.6,1.7);c.stroke();
    c.lineWidth=1;c.strokeStyle='#5c829f26';
    c.beginPath();c.moveTo(l.x-4,l.top);c.lineTo(l.x-4,H-l.bottom);c.moveTo(l.x+l.width+4,l.top);c.lineTo(l.x+l.width+4,H-l.bottom);c.stroke();
    for(let i=0;i<7;i++)for(const side of [-1,1]) {
      const x=side<0?l.x-4:l.x+l.width+4,y=l.top+(l.height-4)*i/6;
      line(c,x,y,x-side*5,y,'#6b91a64d',1);
    }
  }
  function telegraph(c,e,x,q) {
    const duration=e.assist?1.35:1.05,u=clamp(x.modeTime/duration,0,1),r=Math.max(q.rx,q.ry)+5;
    c.save();c.strokeStyle='#ffe4a6';c.lineWidth=1.5;
    c.setLineDash([4,4]);c.beginPath();c.ellipse(q.x,q.y,q.rx+5,q.ry+5,0,0,TAU);c.stroke();c.setLineDash([]);
    c.beginPath();c.arc(q.x,q.y,r,-Math.PI/2,-Math.PI/2+u*TAU);c.stroke();
    // Indicates the impending downwards dive, not a falsely precise target path.
    const y=q.y+q.ry+9;c.fillStyle='#ffe6b3';
    polygon(c,[[q.x-4,y],[q.x,y+5],[q.x+4,y],[q.x+4,y+3],[q.x,y+8],[q.x-4,y+3]],'#ffe6b3');
    c.font='700 11px '+FONT;c.textAlign='center';c.fillText('!',q.x,q.y-q.ry-9);c.restore();
  }
  function drawScene(c,e,W,H,options={}) {
    const l=CITADEL_SWARM.layout(W,H),camera=CITADEL_SWARM.cameraFor(W,H);
    const fx=options.fx??(ARCADE.fx!==false),s=e.swarm,p=e.player,project=pos=>spaceProject(pos,camera,W,H);
    c.save();c.textBaseline='middle';backdrop(c,e,l,fx);
    c.save();c.beginPath();c.rect(l.x-8,l.top-8,l.width+16,l.height+16);c.clip();
    // Decoration first. Hostile bullets and warnings are painted last.
    if(fx)for(const x of e.enemies)if(!x.dead&&x.mode==='dive') {
      const q=project(x.pos),speed=Math.hypot(x.vel[0],x.vel[1])||1;
      const tail=project([x.pos[0]-x.vel[0]/speed*9,x.pos[1]-x.vel[1]/speed*9,0]);
      const gradient=c.createLinearGradient(q.x,q.y,tail.x,tail.y);gradient.addColorStop(0,'#b9768c4d');gradient.addColorStop(1,'#b9768c00');
      line(c,q.x,q.y,tail.x,tail.y,gradient,Math.max(1,l.sy*.65));
    }
    if(fx)for(const x of e.explosions) {
      const q=project(x.pos),u=clamp(1-x.life/x.max,0,1),r=l.sy*(2+u*9);
      c.globalAlpha=(1-u)*.65;c.strokeStyle='#d6c6b0';c.lineWidth=1.2;
      c.beginPath();c.ellipse(q.x,q.y,r*1.25,r,0,0,TAU);c.stroke();
      for(let i=0;i<6;i++){const a=i*TAU/6;line(c,q.x+Math.cos(a)*r*.65,q.y+Math.sin(a)*r*.65,q.x+Math.cos(a)*r,q.y+Math.sin(a)*r,'#e4c4a0',1.5);}
    }
    c.globalAlpha=1;
    for(const x of e.enemies)if(!x.dead) {
      const q=projectedRadius(project,x.pos,x.r),rank=clamp(x.rank||0,0,2);
      const angle=x.mode==='dive'?Math.atan2(x.vel[0],x.vel[1]):Math.PI+(fx?Math.sin(x.age*2+x.slot)*.025:0);
      ship(c,q,rank,angle,x.hit>0,fx,s.time,false,x.role);
      if(rank&&x.hp<x.maxHp) {
        const y=q.y-q.ry-5;c.fillStyle='#344655';c.fillRect(q.x-q.rx,y,q.rx*2,2);
        c.fillStyle='#cda59b';c.fillRect(q.x-q.rx,y,q.rx*2*clamp(x.hp/x.maxHp,0,1),2);
      }
    }
    const player=projectedRadius(project,p.pos,1.65);
    // Open brackets are a location aid, not hull or a shield/hitbox promise.
    if(p.hp>0) {
      const r=Math.max(16,player.rx*2.5+5);c.strokeStyle='#78d9e56e';c.lineWidth=1;
      for(const side of [-1,1]){c.beginPath();c.moveTo(player.x+side*(r-3),player.y-5);c.lineTo(player.x+side*r,player.y-5);c.lineTo(player.x+side*r,player.y+5);c.lineTo(player.x+side*(r-3),player.y+5);c.stroke();}
      if(!(p.invulnerable>0&&Math.floor(s.time*13)%2)) {
        ship(c,{...player,rx:player.rx*2.5,ry:player.ry*2.5},3,p.bank||0,false,fx,s.time,p.boosting);
        // The ring is the real projected damage radius; the central light
        // keeps the exact vulnerable center legible even on small screens.
        c.strokeStyle='#b9ffffbb';c.lineWidth=1;c.beginPath();
        c.ellipse(player.x,player.y,player.rx,player.ry,0,0,TAU);c.stroke();
        ellipse(c,player.x,player.y,Math.max(1.2,player.rx*.18),Math.max(1.2,player.ry*.18),'#edffff');
      }
    }
    if(e.pulseWave>0) {
      c.globalAlpha=Math.min(.6,e.pulseWave);c.strokeStyle='#a4ffff';c.lineWidth=2;
      c.beginPath();c.ellipse(player.x,player.y,(1-e.pulseWave)*l.width,(1-e.pulseWave)*l.height,0,0,TAU);c.stroke();c.globalAlpha=1;
    }
    if(e.crash&&fx) {
      const t=e.crash.time||0;c.globalAlpha=Math.max(.1,1-t/3);c.strokeStyle='#ffc281';c.lineWidth=2;
      c.beginPath();c.arc(player.x,player.y,8+t*24,0,TAU);c.stroke();c.globalAlpha=1;
    }
    for(const pickup of s.pickups||[])if(!pickup.dead) {
      const q=project(pickup.pos),r=l.compact?8:10;
      const color=pickup.type==='repair'?'#a4e6c7':pickup.type==='missiles'?'#efbd83':'#82e7e5';
      c.lineWidth=1.5;polygon(c,[[q.x,q.y-r],[q.x+r,q.y],[q.x,q.y+r],[q.x-r,q.y]],'#07151e',color);
      if(pickup.type==='repair') {
        line(c,q.x-3,q.y,q.x+3,q.y,color,2);line(c,q.x,q.y-3,q.x,q.y+3,color,2);
      }else if(pickup.type==='missiles') {
        polygon(c,[[q.x,q.y-4],[q.x+2,q.y-1],[q.x+2,q.y+3],[q.x-2,q.y+3],[q.x-2,q.y-1]],color);
      }else polygon(c,[[q.x+1,q.y-5],[q.x-3,q.y+1],[q.x,q.y+1],[q.x-1,q.y+5],[q.x+3,q.y-1],[q.x,q.y-1]],color);
    }
    // Essential cues remain visible when optional effects are disabled.
    for(const b of e.bullets) {
      const q=project(b.pos),missile=b.type==='missile';c.fillStyle=missile?'#edf0d5':'#b5f7f5';
      c.fillRect(q.x-(missile?2:1.2),q.y-(missile?7:5),missile?4:2.4,missile?11:9);
      if(missile&&fx)line(c,q.x,q.y+5,q.x,q.y+10,'#96ecea',2);
    }
    for(const x of e.enemies)if(!x.dead) {
      const q=projectedRadius(project,x.pos,x.r);
      if(x.mode==='tell')telegraph(c,e,x,q);
      const cue=x.attackCue||x.fireCue;
      if(cue>0) {
        c.strokeStyle='#ffe2a0';c.lineWidth=1.5;c.beginPath();c.arc(q.x,q.y+q.ry+3,3+clamp(cue,0,1)*3,0,TAU);c.stroke();
      }
    }
    for(const b of e.hostile) {
      const q=project(b.pos);if(fx)line(c,q.x,q.y-8,q.x,q.y,'#a46d3e80',2.5);
      ellipse(c,q.x,q.y,l.compact?3.1:3.8,l.compact?3.1:3.8,'#ffc675');
      ellipse(c,q.x-.45,q.y-.6,1.15,1.15,'#fff5cf');
    }
    if(e.flash>0){c.fillStyle='rgba(255,108,91,'+Math.min(.10,e.flash*.3)+')';c.fillRect(l.x,l.top,l.width,l.height);}
    c.restore();
    if(s.phase==='entry'&&s.waveAge<1.2||s.phase==='cleared') {
      c.font='700 '+(l.compact?17:25)+'px '+FONT;c.textAlign='center';c.fillStyle=s.phase==='cleared'?'#a7ffe0':'#d2e7ff';
      const wave=(s.waveIndex??s.packet)+1;
      c.fillText(s.phase==='cleared'?'ВОЛНА '+wave+' · ПРОЙДЕНА':'ВОЛНА '+wave,W/2,l.cy+8,l.width);
    }
    c.restore();return l;
  }
  function drawHUD(c,e,W,H) {
    const l=CITADEL_SWARM.layout(W,H),s=e.swarm,p=e.player,pad=l.compact?9:22;
    const y=l.landscape?17:l.compact?18:H-29,titleY=l.landscape?15:l.compact?51:25;
    const titleX=l.landscape?W-12:W/2,maxTitle=l.landscape?Math.max(200,W-334):W-18;
    const count=e.enemies.reduce((n,x)=>n+!x.dead,0),total=CITADEL_SWARM.secondsNeeded(e);
    c.save();c.textBaseline='middle';c.textAlign='left';c.font='700 '+(l.compact?11:13)+'px '+FONT;
    c.fillStyle=p.hp<30?'#ffb19a':'#b5ffe2';c.fillText('ЩИТ '+Math.ceil(p.hp)+'%',pad,y);
    c.fillStyle='#ffe1a0';c.fillText('РАКЕТЫ '+p.missiles,pad+91,y);
    c.fillStyle='#b4d5ef';c.fillText((l.compact?'ИМПУЛЬС ':'E · ИМПУЛЬС ')+(p.pulseCooldown>0?Math.ceil(p.pulseCooldown)+'с':'ГОТОВ'),pad+186,y);
    const width=Math.min(293,W-pad*2);c.fillStyle='#25445c';c.fillRect(pad,y+10,width,3);c.fillStyle='#92e2c0';c.fillRect(pad,y+10,width*clamp(p.hp/100,0,1),3);
    c.textAlign=l.landscape?'right':'center';c.font='700 '+(l.compact?13:18)+'px '+FONT;c.fillStyle='#dce9e9';
    const waveTotal=s.waveTotal||3,wave=Math.min(waveTotal,(s.waveIndex??s.packet)+1);
    const waveName=s.rulesVersion==='2.5.0'?CITADEL_SWARM.waves?.[s.waveIndex]?.name:null;
    c.fillText(waveName?'ВОЛНА '+wave+'/'+waveTotal+' · '+waveName:'РОЙ УТОЧНЕНИЙ · ВОЛНА '+wave+' / '+waveTotal,titleX,titleY,maxTitle);
    c.font='600 '+(l.compact?10:12)+'px '+FONT;c.fillStyle='#e6c9a4';
    const overdrive=Math.max(0,(s.overdriveUntil||0)-s.time);
    const state=s.phase==='cleared'?'ВОЛНА ПРОЙДЕНА':'ОСТАЛОСЬ '+count+' / '+total;
    c.fillText(state+' · ФТ '+CITADEL_SWARM.completed(e)+' / 3'+(overdrive>0?' · УСИЛЕНИЕ '+Math.ceil(overdrive)+'с':''),titleX,titleY+(l.compact?19:25),maxTitle);
    if(!l.compact){c.textAlign='center';c.font='11px '+FONT;c.fillStyle='#8fa8ba';c.fillText('Уязвимо светящееся ядро корабля · Кольцо и стрелка — пике · Ромбы — снабжение',W/2,71,W-30);}
    c.textAlign='center';c.font=(l.compact?10:12)+'px '+FONT;c.fillStyle='#9eb4c4';
    c.fillText(l.compact?'ДЖОЙСТИК — МАНЁВР · ОГОНЬ — ВВЕРХ':'WASD — МАНЁВР · ПРОБЕЛ — ОГОНЬ · Q — РАКЕТА · E — ИМПУЛЬС',W/2,H-(l.compact?10:13),W-20);c.restore();
  }
  function draw(c,e,cam,w,h,options={}) {
    const mobile=typeof isMobileLayout==='function'&&isMobileLayout();
    const cssW=mobile?(ARCADE.canvas?.getBoundingClientRect().width||w):w;
    const ratio=w/cssW,W=w/ratio,H=h/ratio;
    c.clearRect(0,0,w,h);c.save();c.scale(ratio,ratio);drawScene(c,e,W,H,options);
    if(options.hud!==false)drawHUD(c,e,W,H);c.restore();
  }
  drawFlightHUD=function(c,e,cam,w,h){return active(e)?draw(c,e,cam,w,h):originalFlight(c,e,cam,w,h);};
  drawMobileGameHUD=function(c,e,cam,w,h){return active(e)?draw(c,e,cam,w,h):originalMobile(c,e,cam,w,h);};
  globalThis.CITADEL_SWARM_VIEW=Object.freeze({version:VERSION,active,draw,drawScene,drawHUD,
    layout:CITADEL_SWARM.layout,projectedRadius,hullPoints:hulls,
    status:()=>({version:VERSION,templates:4,stars:108,retainedParticles:0,playerRadius:1.65,playerVisualScale:2.5})});
})();
