/* Цитадель ЦСИИ 2.7.0 — four squadrons, distinct combat silhouettes and bounded LOD.
 * Rendering only: no timers, listeners, RNG, simulation state or image cache.
 * Enemy hulls fit existing collision ellipses. The larger arcade player ship
 * has an explicit luminous vulnerable core at the unchanged radius of 1.65.
 * Navigation marks, exhaust and dive warnings are deliberately non-solid.
 */
(() => {
  'use strict';
  const VERSION = '2.8.0';
  if (globalThis.CITADEL_SWARM_VIEW?.version === VERSION || !globalThis.CITADEL_SWARM ||
      typeof drawFlightHUD !== 'function' || typeof drawMobileGameHUD !== 'function') return;
  const originalFlight = drawFlightHUD, originalMobile = drawMobileGameHUD;
  const TAU = Math.PI * 2, FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const active = e => e?.stage === 2 && !e.finale && e.phase === 'swarm' &&
    ['1.9.0','2.5.0','2.6.0','2.7.0'].includes(e.swarm?.version) && !e.swarm.complete;
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
  // Role silhouettes, not recolours: hooked scout, needle interceptor,
  // cathedral bomber, shield crab, twin-pod torpedo and crowned flagship.
  const roleHulls=Object.freeze({
    scout:[[0,-.98],[.22,-.40],[.67,-.58],[.85,-.25],[.57,.18],[.69,.64],[.28,.43],[0,.76],[-.28,.43],[-.69,.64],[-.57,.18],[-.85,-.25],[-.67,-.58],[-.22,-.40]],
    interceptor:[[0,-.99],[.15,-.23],[.44,-.61],[.58,-.69],[.49,.12],[.77,.53],[.38,.48],[.16,.82],[0,.59],[-.16,.82],[-.38,.48],[-.77,.53],[-.49,.12],[-.58,-.69],[-.44,-.61],[-.15,-.23]],
    bomber:[[0,-.82],[.27,-.48],[.57,-.68],[.84,-.40],[.94,.0],[.81,.43],[.53,.62],[.36,.48],[.22,.85],[-.22,.85],[-.36,.48],[-.53,.62],[-.81,.43],[-.94,0],[-.84,-.40],[-.57,-.68],[-.27,-.48]],
    shield:[[0,-.77],[.27,-.65],[.61,-.68],[.89,-.36],[.97,-.03],[.85,.19],[.73,-.04],[.59,.42],[.28,.72],[0,.80],[-.28,.72],[-.59,.42],[-.73,-.04],[-.85,.19],[-.97,-.03],[-.89,-.36],[-.61,-.68],[-.27,-.65]],
    torpedo:[[0,-.83],[.20,-.32],[.35,-.40],[.43,-.76],[.61,-.67],[.72,-.34],[.66,.46],[.48,.71],[.29,.45],[.17,.64],[-.17,.64],[-.29,.45],[-.48,.71],[-.66,.46],[-.72,-.34],[-.61,-.67],[-.43,-.76],[-.35,-.40],[-.20,-.32]],
    commander:[[0,-.98],[.17,-.66],[.39,-.85],[.46,-.52],[.67,-.57],[.82,-.33],[.95,0],[.76,.36],[.62,.31],[.51,.69],[.28,.56],[0,.95],[-.28,.56],[-.51,.69],[-.62,.31],[-.76,.36],[-.95,0],[-.82,-.33],[-.67,-.57],[-.46,-.52],[-.39,-.85],[-.17,-.66]]
  });
  const roleColors=Object.freeze({scout:'#db8974',interceptor:'#c899d7',bomber:'#e8b469',shield:'#71d2d5',torpedo:'#ec846d',commander:'#f0d88d'});
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
  function ship(c,q,rank,angle,flash,fx,time,boost,role,lod=false) {
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
    const outline=player?hulls[3]:(roleHulls[role]||hulls[rank]),accent=roleColors[role]||color.trim;
    // A dark extrusion and lit upper bevel make the hull read as a solid
    // object. The inset does not enlarge the physical collision silhouette.
    polygon(c,outline,color.low,color.edge);
    c.save();c.scale(.91,.88);c.translate(-.025,-.035);polygon(c,outline,metal,color.edge);c.restore();
    if(!player){
      const flap=fx?Math.sin(time*5+(role==='interceptor'?1:0))*.055:0;
      for(const side of [-1,1]){
        polygon(c,[[side*.23,-.35],[side*.56,-.52+flap],[side*.73,-.16],[side*.41,.22]],color.high);
        polygon(c,[[side*.41,.22],[side*.73,-.16],[side*.61,.38],[side*.30,.44]],color.low);
        line(c,side*.26,-.28,side*.59,-.36+flap,accent,.07);
      }
    }
    if(lod&&!player){
      // Small phone silhouettes retain role markings and cockpit contrast;
      // avoid dozens of sub-pixel armor panels for each of the 64 ships.
      polygon(c,[[0,-.78],[.18,-.12],[0,.45],[-.18,-.12]],color.high);
      ellipse(c,0,-.2,.11,.16,accent);
      if(role==='torpedo')for(const side of [-1,1])line(c,side*.53,-.36,side*.53,.5,'#eeb98c',.17);
      if(role==='shield'){c.strokeStyle='#8ccfe0';c.lineWidth=.11;c.beginPath();c.arc(0,0,.78,Math.PI*.12,Math.PI*.88);c.stroke();}
      if(rank===2)polygon(c,[[-.3,-.52],[0,-.84],[.3,-.52]],accent);
      if(role==='bomber'){ellipse(c,-.48,.13,.12,.15,'#e9a257');ellipse(c,.48,.13,.12,.15,'#e9a257');}
      c.restore();return;
    }
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
    if(role==='torpedo')for(const side of [-1,1]){
      polygon(c,[[side*.43,-.42],[side*.66,-.32],[side*.66,.45],[side*.54,.62],[side*.43,.45]],'#3e2930',color.edge);
      line(c,side*.54,-.26,side*.54,.39,'#e6a377',.10);
    }
    if(role==='shield'){
      c.strokeStyle='#9cdbe1';c.lineWidth=.10;c.beginPath();c.arc(0,0,.78,Math.PI*.12,Math.PI*.88);c.stroke();
      polygon(c,[[-.21,.15],[.21,.15],[.18,.40],[0,.56],[-.18,.40]],'#83afba',color.edge);
    }
    if(!player){
      const pulse=fx?.7+.3*Math.sin(time*7):1;
      c.globalAlpha=pulse;line(c,-.21,-.43,.21,-.43,accent,.07);c.globalAlpha=1;
      if(role==='commander')for(let i=-1;i<=1;i++){
        polygon(c,[[i*.21-.06,-.53],[i*.21,-.81+Math.abs(i)*.07],[i*.21+.06,-.53]],'#f6d99a');
        ellipse(c,i*.19,.28,.055,.08,'#f5c879');
      }
      if(role==='scout')for(const side of [-1,1])line(c,side*.15,-.57,side*.36,-.33,accent,.08);
    }
    c.restore();
  }
  function backdrop(c,e,l,fx) {
    const {W,H}=l,t=fx?e.swarm.time:0,seed=Math.abs(e.seed||0)%197;
    c.fillStyle='#060e1b';c.fillRect(0,0,W,H);
    const haze=c.createRadialGradient(W*.63,H*.26,0,W*.63,H*.26,Math.max(W,H)*.66);
    haze.addColorStop(0,'#193449');haze.addColorStop(.48,'#0c2030');haze.addColorStop(1,'#060e1b');
    c.fillStyle=haze;c.fillRect(0,0,W,H);
    // A shaded distant planet and orbital arcs give the arcade plane depth.
    // These decorations are deliberately dimmer than hulls and projectiles.
    const px=W*.82,py=H*.28,pr=Math.min(W,H)*.43;
    const planet=c.createRadialGradient(px-pr*.3,py-pr*.4,pr*.06,px,py,pr);
    planet.addColorStop(0,'#23425a');planet.addColorStop(.55,'#122a40');planet.addColorStop(1,'#060d1a');
    ellipse(c,px,py,pr,pr,planet);
    c.strokeStyle='#66829323';c.lineWidth=1.3;c.beginPath();c.ellipse(px,py,pr*1.36,pr*.3,-.4,0,TAU);c.stroke();
    c.strokeStyle='#6b8da11a';c.lineWidth=3;c.beginPath();c.arc(px,py,pr,-2.9,-.8);c.stroke();
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
    if(fx)for(const shard of e.particles||[])if(shard.shard){
      const q=project(shard.pos),a=shard.life*17,r=clamp(shard.life/.48,0,1)*(l.compact?2:3);
      c.save();c.translate(q.x,q.y);c.rotate(a);c.globalAlpha=clamp(shard.life/.48,0,1);
      polygon(c,[[-r,-r*.5],[r,r*.2],[-r*.3,r]],'#d1b3a0','#f4d4b1');c.restore();
    }
    for(const x of e.enemies)if(!x.dead) {
      const q=projectedRadius(project,x.pos,x.r),rank=clamp(x.rank||0,0,2);
      const angle=x.mode==='dive'?Math.atan2(x.vel[0],x.vel[1]):Math.PI+(fx?Math.sin(x.age*2+x.slot)*.025:0);
      ship(c,q,rank,angle,x.hit>0,fx,s.time+x.slot*.17,x.mode==='dive',x.role,l.compact&&e.enemies.length>24);
      if(x.thruster>0){
        const muzzle=project([x.pos[0],x.pos[1]-x.r,0]);
        ellipse(c,muzzle.x,muzzle.y,Math.max(2,q.rx*.28),Math.max(2,q.ry*.30),'#fff0b4');
      }
      if(x.shield>0&&x.mode!=='dive'){
        // This is the active, finite armor capacitor, not an attack warning.
        c.strokeStyle='#8ed5e2';c.lineWidth=1.5;c.globalAlpha=.35+.45*x.shield/x.shieldMax;
        c.beginPath();c.ellipse(q.x,q.y,q.rx*.94,q.ry*.94,0,.08,Math.PI-.08);c.stroke();c.globalAlpha=1;
      }
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
        const evading=clamp((4-(p.flipCooldown||0))/.7,0,1),roll=fx&&p.flipCooldown>3.3?Math.sin(evading*Math.PI)*.85:0;
        ship(c,{...player,rx:player.rx*2.5*(1-Math.abs(roll)*.5),ry:player.ry*2.5},3,(p.bank||0)+roll,false,fx,s.time,p.boosting);
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
      const q=project(pickup.pos),r=l.compact?11:14,angle=fx?pickup.age*1.8:Math.PI/6;
      const color=pickup.type==='repair'?'#a4e6c7':pickup.type==='missiles'?'#efbd83':'#82e7e5';
      const width=.68+.28*Math.abs(Math.cos(angle));
      c.save();c.translate(q.x,q.y);c.lineWidth=1;
      // Rotating three-face supply canister. A fixed readable emblem stays
      // on the light face, so shape recognition survives a small phone view.
      polygon(c,[[-r*width,-r*.62],[0,-r],[r*width,-r*.62],[0,-r*.27]],'#d8e2d5',color);
      polygon(c,[[-r*width,-r*.62],[0,-r*.27],[0,r],[ -r*width,r*.55]],'#1c3949',color);
      const sideMetal=c.createLinearGradient(0,-r,r,r);sideMetal.addColorStop(0,color);sideMetal.addColorStop(1,'#263c47');
      polygon(c,[[0,-r*.27],[r*width,-r*.62],[r*width,r*.55],[0,r]],sideMetal,color);
      line(c,-r*width*.82,r*.44,0,r*.8,color,1);
      c.restore();
      ellipse(c,q.x,q.y,r*.5,r*.50,'#07151ee6');
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
      if(e.assist&&x.mode==='tell')telegraph(c,e,x,q);
      const cue=x.attackCue||x.fireCue;
      if(e.assist&&cue>0) {
        c.strokeStyle='#ffe2a0';c.lineWidth=1.5;c.beginPath();c.arc(q.x,q.y+q.ry+3,3+clamp(cue,0,1)*3,0,TAU);c.stroke();
      }
    }
    for(const b of e.hostile) {
      const q=project(b.pos);if(fx)line(c,q.x,q.y-8,q.x,q.y,'#a46d3e80',2.5);
      if(b.type==='swarm-torpedo'){
        const r=projectedRadius(project,b.pos,b.r),rx=Math.max(3,r.rx),ry=Math.max(3,r.ry);
        c.save();c.translate(q.x,q.y);c.rotate(Math.atan2(b.vel[0],-b.vel[1]));
        polygon(c,[[0,ry],[rx*.7,0],[rx*.48,-ry],[-rx*.48,-ry],[-rx*.7,0]],'#eaa28b','#ffe2b7');
        line(c,0,-ry,0,-ry-5,'#c85365',2);c.restore();
      }else{ellipse(c,q.x,q.y,l.compact?3.1:3.8,l.compact?3.1:3.8,'#ffc675');ellipse(c,q.x-.45,q.y-.6,1.15,1.15,'#fff5cf');}
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
    const waveName=CITADEL_SWARM.modern(e)?CITADEL_SWARM.waveDefinition?.(e)?.name:null;
    c.fillText(waveName?'ВОЛНА '+wave+'/'+waveTotal+' · '+waveName:'РОЙ УТОЧНЕНИЙ · ВОЛНА '+wave+' / '+waveTotal,titleX,titleY,maxTitle);
    c.font='600 '+(l.compact?10:12)+'px '+FONT;c.fillStyle='#e6c9a4';
    const overdrive=Math.max(0,(s.overdriveUntil||0)-s.time);
    const state=s.phase==='cleared'?'ВОЛНА ПРОЙДЕНА':'ОСТАЛОСЬ '+count+' / '+total;
    c.fillText(state+' · ФТ '+CITADEL_SWARM.completed(e)+' / 3'+(overdrive>0?' · УСИЛЕНИЕ '+Math.ceil(overdrive)+'с':''),titleX,titleY+(l.compact?19:25),maxTitle);
    if(!l.compact){c.textAlign='center';c.font='11px '+FONT;c.fillStyle='#8fa8ba';c.fillText(e.assist?'Уязвимо светящееся ядро · Кольцо и стрелка — пике · Контейнеры — снабжение':CITADEL_SWARM.tactics?.(e)?'Перехватчики заходят наперерез · Бомбардировщики ведут огонь с флангов · Торпеды можно сбить':'Уязвимо светящееся ядро · Голубая броня — щитоносец · Контейнеры — снабжение',W/2,71,W-30);}
    c.textAlign='center';c.font=(l.compact?10:12)+'px '+FONT;c.fillStyle='#9eb4c4';
    c.fillText(l.compact?'ДЖОЙСТИК — МАНЁВР · УВОРОТ '+(p.flipCooldown>0?Math.ceil(p.flipCooldown)+'с':'ГОТОВ'):'WASD — МАНЁВР · ПРОБЕЛ — ОГОНЬ · ПКМ / Q — РАКЕТА · E — ИМПУЛЬС · R — УВОРОТ',W/2,H-(l.compact?10:13),W-20);c.restore();
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
    layout:CITADEL_SWARM.layout,projectedRadius,hullPoints:hulls,roleHulls,
    status:()=>({version:VERSION,templates:7,roleDetails:6,stars:108,retainedParticles:0,playerRadius:1.65,playerVisualScale:2.5,phoneLOD:true,dimensionalSupplies:true})});
})();
