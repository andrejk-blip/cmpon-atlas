import { MAPS, nearestNode } from './movement.js';
import { icon } from './icons.js';
import { CHARACTER_ART, createPose, stepPose, loadCharacter, drawCharacter } from './animation.js';
import { canvasBackingSize, splitSceneSpots, placeSceneLabels } from './scene-layout.js';
import { cameraViewport, cameraFitZoom, avoidCameraOccluder, clampCameraPan, fitCamera, resizeCamera, zoomCamera } from './camera.js';
export function createLifeScene(host, world, events) {
  const map = MAPS[world.location],
    abort = new AbortController();
  host.innerHTML = `<div class="life-world ${world.location}"><canvas aria-hidden="true"></canvas><div class="npc-targets"></div><button class="hero-hit" aria-label="Аня — мой персонаж"></button></div><div class="scene-label-layer"><svg class="scene-label-lines" aria-hidden="true"></svg><div class="hotspots"></div><div class="npc-labels"></div></div>`;
  const surface = host.querySelector('.life-world'),
    canvas = host.querySelector('canvas'),
    ctx = canvas.getContext('2d');
  const atlases = {}, poses = new Map(), requestedArt = new Set();
  let disposed = false, animationClock = 0, reducedMotion = false;
  function ensureArt(id) {
    if(requestedArt.has(id)||!CHARACTER_ART[id])return;
    requestedArt.add(id);
    loadCharacter(id).then(atlas=>{
      if(disposed)return;
      atlases[id]=atlas;draw();
    });
  }
  function poseFor(id) {
    if (!poses.has(id)) poses.set(id, createPose([...id].reduce((n,c)=>n+c.charCodeAt(0),0)%51/10));
    return poses.get(id);
  }
  const npcLayer = host.querySelector('.npc-targets');
  const npcLabelLayer = host.querySelector('.npc-labels'), lineLayer = host.querySelector('.scene-label-lines');
  const npcButtons = new Map();
  const placeButtons = new Map();
  let actorSpots = new Map(), previousLabels = new Map(), viewWidth = host.clientWidth, viewHeight = host.clientHeight, backingDpr = 0;
  let viewport=cameraViewport(viewWidth,viewHeight), cameraReady=false;
  const labels = {'resident-1':'Николай','resident-2':'Денис',vera:'Вера',max:'Макс'};
  let state = null,
    zoom = 1,
    pan = {
      x: 0,
      y: 0
    },
    drag = null,
    follow = true,
    effect = null;
  const heroHit = host.querySelector('.hero-hit');
  heroHit.onclick = events.onHero;
  function refreshCanvas() {
    backingDpr = globalThis.devicePixelRatio || 1;
    const size = canvasBackingSize(zoom, backingDpr);
    if (canvas.width === size.width && canvas.height === size.height) return;
    canvas.width = size.width;canvas.height = size.height;
    ctx.setTransform(size.scaleX,0,0,size.scaleY,0,0);
    ctx.imageSmoothingEnabled = true;ctx.imageSmoothingQuality = 'high';
  }
  function newLabelLine() {
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    lineLayer.append(line);return line;
  }
  function actorArt(actor) {return actor.id === 'anna' ? 'anna-'+(state?.outfit || 'home') : actor.id;}
  function actorHeight(actor) {return (CHARACTER_ART[actorArt(actor)]?.height || 110) * (.8 + actor.y / 1600) * (actor.id === 'anna' && world.location !== 'home' ? .88 : 1);}
  function placeAnchor(spot) {
    // The address belongs to the entrance, not to the resident's approach point.
    if(world.location==='district'&&spot.id==='respondent')return {x:615,y:234,offsetX:84*zoom,offsetY:-8*zoom};
    return {...map.nodes[spot.node],offsetX:0,offsetY:0};
  }
  function layoutLabels() {
    if(!state||!viewWidth||!viewHeight)return;
    const actors=[...world.npcs,...(world.companions||[]),world.player];
    const obstacles=actors.map(actor=>{
      const height=actorHeight(actor)*zoom;
      return {x:pan.x+actor.x*zoom-height*.23,y:pan.y+actor.y*zoom-height,width:height*.46,height:height+5};
    });
    const items=[], records=new Map();
    const add=(id,entry,x,y,priority,offsetX=0,offsetY=0)=>{
      const visible=x>-80&&x<viewWidth+80&&y>-50&&y<viewHeight+80;
      entry.label.hidden=!visible;entry.line.toggleAttribute('hidden',!visible);
      if(!visible)return;
      items.push({id,x,y,width:entry.width,height:entry.height,priority,offsetX,offsetY});records.set(id,entry);
    };
    for(const [id,entry] of placeButtons){const anchor=placeAnchor(entry.spot);add('place:'+id,entry,pan.x+anchor.x*zoom,pan.y+anchor.y*zoom,entry.spot.primary?3:1,anchor.offsetX,anchor.offsetY);}
    for(const actor of actors){
      const entry=npcButtons.get(actor.id);if(!entry)continue;
      add('actor:'+actor.id,entry,pan.x+actor.x*zoom,pan.y+(actor.y-actorHeight(actor))*zoom-5,actorSpots.get(actor.id)?.primary?4:2);
    }
    const bounds={left:viewport.left,top:viewport.top,right:viewport.left+viewport.width,bottom:viewport.top+viewport.height};
    const arranged=placeSceneLabels(items,obstacles,bounds,previousLabels);
    for(const [id,box] of arranged){
      const entry=records.get(id);
      entry.label.style.transform=`translate(${Math.round(box.x)}px,${Math.round(box.y)}px)`;
      const x=Math.max(box.x+7,Math.min(box.x+box.width-7,box.anchorX));
      const y=Math.max(box.y,Math.min(box.y+box.height,box.anchorY));
      const distance=Math.hypot(x-box.anchorX,y-box.anchorY);
      entry.line.toggleAttribute('hidden',distance<18);
      entry.line.setAttribute('x1',String(box.anchorX));entry.line.setAttribute('y1',String(box.anchorY));
      entry.line.setAttribute('x2',String(x));entry.line.setAttribute('y2',String(y));
    }
    previousLabels=arranged;
  }
  function clamp() {
    pan=clampCameraPan(pan,zoom,viewport);
  }
  function transform() {
    clamp();
    surface.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    layoutLabels();
  }
  function center() {
    pan.x = viewport.left+viewport.width/2-world.player.x*zoom;
    pan.y = viewport.top+viewport.height*.58-world.player.y*zoom;
    follow = true;
    transform();
  }
  function resize() {
    if(disposed)return;
    const previous=cameraReady?{viewport,zoom,pan}:null;
    viewWidth=host.clientWidth;viewHeight=host.clientHeight;
    const next=resizeCamera(previous,measureViewport());
    viewport=next.viewport;zoom=next.zoom;pan=next.pan;cameraReady=true;
    refreshCanvas();
    transform();
    draw();
  }
  const game=host.closest('.life-game');
  const topControls=[...game.querySelectorAll('.life-hud > *')];
  const floatingControls=[...game.querySelectorAll('.location-tag')];
  const bottomControls=[...game.querySelectorAll('.life-footer > *, .quick-actions')];
  const sideControls=game.querySelector('.camera-controls');
  function measureViewport() {
    const box=host.getBoundingClientRect(),insets={left:12,right:12,top:12,bottom:12};
    const visibleRect=element=>{
      const rect=element.getBoundingClientRect();
      return rect.width>0&&rect.height>0?rect:null;
    };
    for(const element of topControls){const rect=visibleRect(element);if(rect)insets.top=Math.max(insets.top,rect.bottom-box.top+8);}
    for(const element of bottomControls){const rect=visibleRect(element);if(rect)insets.bottom=Math.max(insets.bottom,box.bottom-rect.top+8);}
    if(sideControls){
      const rect=visibleRect(sideControls);
      if(rect&&rect.top<box.bottom-insets.bottom&&rect.bottom>box.top+insets.top)insets.right=Math.max(insets.right,box.right-rect.left+8);
    }
    let safe=cameraViewport(viewWidth,viewHeight,insets);
    for(const element of floatingControls){
      const rect=visibleRect(element);
      if(rect)safe=avoidCameraOccluder(safe,{left:rect.left-box.left-8,right:rect.right-box.left+8,top:rect.top-box.top-8,bottom:rect.bottom-box.top+8});
    }
    return safe;
  }
  function fit() {
    const next=fitCamera(measureViewport());
    viewport=next.viewport;zoom=next.zoom;pan=next.pan;cameraReady=true;follow=true;
    refreshCanvas();transform();draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  for(const control of [...topControls,...floatingControls,...bottomControls,...(sideControls?[sideControls]:[])])observer.observe(control);
  resize();
  document.fonts?.ready.then(()=>{
    if(disposed)return;
    for(const entry of [...placeButtons.values(),...npcButtons.values()]){
      const hidden=entry.label.hidden;entry.label.hidden=false;
      entry.width=entry.label.offsetWidth;entry.height=entry.label.offsetHeight;
      entry.label.hidden=hidden;
    }
    previousLabels=new Map();resize();
  });
  globalThis.addEventListener('resize',resize,{signal:abort.signal});
  host.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      px: pan.x,
      py: pan.y,
      moved: false
    };
    host.setPointerCapture(e.pointerId);
  }, {
    signal: abort.signal
  });
  host.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      follow = false;
      pan.x = drag.px + dx;
      pan.y = drag.py + dy;
      transform();
    }
  }, {
    signal: abort.signal
  });
  host.addEventListener('pointerup', e => {
    if (!drag) return;
    if (!drag.moved) {
      const box = host.getBoundingClientRect();
      events.onGround(nearestNode(world, (e.clientX - box.left - pan.x) / zoom, (e.clientY - box.top - pan.y) / zoom));
    }
    drag = null;
  }, {
    signal: abort.signal
  });
  host.addEventListener('pointercancel', () => drag = null, {
    signal: abort.signal
  });
  function update(nextState, spots) {
    state = nextState;
    surface.classList.toggle('evening', state.phase === 'evening' || state.phase === 'complete');
    const split=splitSceneSpots(spots,[...world.npcs,...(world.companions||[])].map(a=>a.id));
    actorSpots=split.actors;
    for(const entry of placeButtons.values())entry.line.remove();
    placeButtons.clear();
    host.querySelector('.hotspots').innerHTML = split.places.map(s => {
      return `<button data-spot="${s.id}" class="world-spot scene-label ${s.done ? 'done' : ''} ${s.primary ? 'primary-spot' : ''}" aria-label="${s.label}">${icon(s.done ? 'check' : s.icon)}<small>${s.short || s.label}</small></button>`;
    }).join('');
    host.querySelectorAll('.hotspots [data-spot]').forEach(label => {
      const spot=split.places.find(s=>s.id===label.dataset.spot);
      placeButtons.set(spot.id,{label,spot,line:newLabelLine(),width:label.offsetWidth,height:label.offsetHeight});
      label.onclick=()=>events.onSpot(spot.id);
    });
    draw();
  }
  function plant() {
    ctx.save();
    ctx.translate(150, 300);
    ctx.fillStyle = '#dc917b';
    ctx.strokeStyle = '#695546';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -25);
    ctx.lineTo(15, -25);
    ctx.lineTo(10, 0);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#4f6b3a';
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, -80);
    ctx.stroke();
    for (const [x, y, r] of [[-13, -64, -.8], [12, -75, .8], [-12, -43, -.7], [13, -53, .7]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.fillStyle = '#81964c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 16, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function lamp() {
    ctx.save();
    ctx.translate(190, 300);
    if (state.phase === 'evening' || state.phase === 'complete') {
      const glow = ctx.createRadialGradient(0, -60, 1, 0, -60, 100);
      glow.addColorStop(0, '#ffdd8470');
      glow.addColorStop(1, '#ffdd8400');
      ctx.fillStyle = glow;
      ctx.fillRect(-100, -160, 200, 200);
    }
    ctx.strokeStyle = '#8c7343';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -75);
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.fillStyle = '#e3ba83';
    ctx.strokeStyle = '#715a43';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, -95);
    ctx.lineTo(13, -95);
    ctx.lineTo(24, -65);
    ctx.lineTo(-24, -65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function draw(dt = 0, options = {}) {
    if (!state || disposed) return;
    if(backingDpr!==(globalThis.devicePixelRatio||1))refreshCanvas();
    reducedMotion = options.reducedMotion ?? reducedMotion;
    animationClock += Math.max(0, dt);

    if (follow && zoom>cameraFitZoom(viewport)*(1+1e-7) && host.clientWidth < 650 && world.player.moving) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-8 * Math.max(0, dt));
      pan.x += (viewport.left+viewport.width/2-world.player.x*zoom-pan.x)*ease;
      pan.y += (viewport.top+viewport.height*.58-world.player.y*zoom-pan.y)*ease;
      transform();
    }
    ctx.clearRect(0, 0, 1000, 700);
    if (world.location === 'home') {
      if (state.homeItems?.includes('plant')) plant();
      if (state.homeItems?.includes('lamp')) lamp();
    }
    const p = world.player;
    if (p.moving) {
      ctx.save();
      ctx.strokeStyle = world.location === 'home' ? '#9c5e5388' : '#fff8e4';
      ctx.lineWidth = 4;
      ctx.setLineDash([2, 11]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (const node of p.path) ctx.lineTo(map.nodes[node].x, map.nodes[node].y);
      ctx.stroke();
      ctx.restore();
    }
    const actors = [...world.npcs, ...(world.companions || [])];
    const artFor = actorArt, heightFor = actorHeight;
    const activeIds = new Set(actors.map(a => a.id));
    for (const [id,entry] of npcButtons) if (!activeIds.has(id)) {entry.hit.remove();entry.label.remove();entry.line.remove();npcButtons.delete(id);}
    for (const actor of actors) {
      let entry = npcButtons.get(actor.id);
      if (!entry) {
        const hit=document.createElement('button'),label=document.createElement('button');
        hit.className='npc-hit';hit.dataset.actor=actor.id;hit.tabIndex=-1;
        hit.setAttribute('aria-label',labels[actor.id]+' — персонаж');
        hit.onclick=()=>events.onNpc?.(actor.id);
        label.dataset.npc=actor.id;
        label.onclick=()=>{const task=actorSpots.get(actor.id);if(task)events.onSpot(task.id);else events.onNpc?.(actor.id);};
        npcLayer.append(hit);npcLabelLayer.append(label);
        entry={hit,label,line:newLabelLine(),contentKey:null};npcButtons.set(actor.id,entry);
      }
      const task=actorSpots.get(actor.id),contentKey=task?`${task.id}:${task.primary}:${task.done}:${task.label}`:'chat';
      if(entry.contentKey!==contentKey){
        entry.contentKey=contentKey;
        entry.label.className=`scene-label npc-label ${task?.primary?'primary-spot':''} ${task?.done?'done':''}`;
        entry.label.setAttribute('aria-label',task?.label||'Поговорить: '+labels[actor.id]);
        if(task)entry.label.dataset.spot=task.id;else delete entry.label.dataset.spot;
        entry.label.innerHTML=`<small>${labels[actor.id]}</small>${icon(task?.done?'check':task?.primary?'pin':'chat')}`;
        entry.label.hidden=false;
        entry.width=entry.label.offsetWidth;entry.height=entry.label.offsetHeight;
      }
      const height=heightFor(actor);
      entry.hit.style.height=height+'px';
      entry.hit.style.transform = `translate(${actor.x-24}px,${actor.y-height}px)`;
    }
    actors.push(p);
    for (const actor of actors.sort((a,b)=>a.y-b.y)) {
      const isHero = actor.id === 'anna';
      const artId = artFor(actor);
      ensureArt(artId);
      const height = heightFor(actor);
      const pose = poseFor(actor.id);
      stepPose(pose,actor,dt,{reducedMotion});
      ctx.save();
      ctx.fillStyle = '#392b3226';
      ctx.beginPath();ctx.ellipse(actor.x,actor.y,height*.14,height*.035,0,0,Math.PI*2);ctx.fill();
      if (isHero) {
        ctx.strokeStyle='#fff8eb';ctx.lineWidth=1.8;ctx.beginPath();ctx.ellipse(actor.x,actor.y,22,7,0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
      drawCharacter(ctx,atlases[artId],pose,actor.x,actor.y,height,{reducedMotion});
    }
    heroHit.style.height=heightFor(p)+'px';
    heroHit.style.transform = `translate(${p.x - 24}px,${p.y - heightFor(p)}px)`;
    layoutLabels();
    if (effect && animationClock - effect.start < 1.5) {
      const t = (animationClock - effect.start) / 1.5;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#fff8e7';
      ctx.strokeStyle = '#9c6f5a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(p.x - 55, p.y - 155 - t * 25, 110, 32, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#70504a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(effect.text, p.x, p.y - 134 - t * 25);
      ctx.restore();
    }
  }
  return {
    update,
    draw,
    center,
    fit,
    follow() { follow = true; },
    celebrate(text) {
      effect = {
        text,
        start: animationClock
      };
      draw();
    },
    zoomBy(factor) {
      const next=zoomCamera({viewport,zoom,pan},factor);
      zoom=next.zoom;pan=next.pan;
      follow = false;
      refreshCanvas();
      transform();
      draw();
    },
    destroy() {
      disposed = true;
      abort.abort();
      observer.disconnect();
    }
  };
}
