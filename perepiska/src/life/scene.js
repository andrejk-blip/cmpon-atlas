import { MAPS, nearestNode } from './movement.js';
import { icon } from './icons.js';
import { CHARACTER_ART, createPose, stepPose, loadCharacter, drawCharacter } from './animation.js';
export function createLifeScene(host, world, events) {
  const map = MAPS[world.location],
    abort = new AbortController();
  host.innerHTML = `<div class="life-world ${world.location}"><canvas aria-hidden="true"></canvas><div class="hotspots"></div><div class="npc-targets"></div><button class="hero-hit" aria-label="Аня — мой персонаж"></button></div>`;
  const surface = host.querySelector('.life-world'),
    canvas = host.querySelector('canvas'),
    ctx = canvas.getContext('2d');
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = 1000 * ratio;
  canvas.height = 700 * ratio;
  ctx.scale(ratio, ratio);
  const atlases = {}, poses = new Map();
  let disposed = false, animationClock = 0, reducedMotion = false;
  for (const id of Object.keys(CHARACTER_ART)) loadCharacter(id).then(atlas => {
    if (disposed) return;
    atlases[id] = atlas;
    draw();
  });
  function poseFor(id) {
    if (!poses.has(id)) poses.set(id, createPose([...id].reduce((n,c)=>n+c.charCodeAt(0),0)%51/10));
    return poses.get(id);
  }
  const npcLayer = host.querySelector('.npc-targets');
  const npcButtons = new Map();
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
  function clamp() {
    const w = host.clientWidth,
      h = host.clientHeight;
    pan.x = 1000 * zoom < w ? (w - 1000 * zoom) / 2 : Math.min(0, Math.max(w - 1000 * zoom, pan.x));
    pan.y = 700 * zoom < h ? (h - 700 * zoom) / 2 : Math.min(0, Math.max(h - 700 * zoom, pan.y));
  }
  function transform() {
    clamp();
    surface.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  }
  function center() {
    pan.x = host.clientWidth / 2 - world.player.x * zoom;
    pan.y = host.clientHeight * .58 - world.player.y * zoom;
    follow = true;
    transform();
  }
  function resize() {
    zoom = Math.max(host.clientWidth / 1000, host.clientHeight / 700);
    center();
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
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
    host.querySelector('.hotspots').innerHTML = spots.map(s => {
      const p = map.nodes[s.node];
      return `<button data-spot="${s.id}" class="world-spot ${s.done ? 'done' : ''} ${s.primary ? 'primary-spot' : ''}" style="left:${p.x}px;top:${p.y - 8}px" aria-label="${s.label}">${icon(s.done ? 'check' : s.icon)}<small>${s.short || s.label}</small></button>`;
    }).join('');
    host.querySelectorAll('[data-spot]').forEach(b => b.onclick = () => events.onSpot(b.dataset.spot));
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
    reducedMotion = options.reducedMotion ?? reducedMotion;
    animationClock += Math.max(0, dt);

    if (follow && host.clientWidth < 650 && world.player.moving) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-8 * Math.max(0, dt));
      pan.x += (host.clientWidth / 2 - world.player.x * zoom - pan.x) * ease;
      pan.y += (host.clientHeight * .58 - world.player.y * zoom - pan.y) * ease;
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
    const artFor = actor => actor.id === 'anna' ? 'anna-'+(state.outfit || 'home') : actor.id;
    const heightFor = actor => (CHARACTER_ART[artFor(actor)]?.height || 110) * (.8 + actor.y / 1600) * (actor.id === 'anna' && world.location !== 'home' ? .88 : 1);
    const activeIds = new Set(actors.map(a => a.id));
    for (const [id,button] of npcButtons) if (!activeIds.has(id)) {button.remove();npcButtons.delete(id);}
    for (const actor of actors) {
      let button = npcButtons.get(actor.id);
      if (!button) {
        button = document.createElement('button');
        button.className = 'npc-hit';
        button.setAttribute('aria-label','Поговорить: '+labels[actor.id]);
        button.innerHTML = '<span>'+labels[actor.id]+' '+icon('chat')+'</span>';
        button.onclick=()=>events.onNpc?.(actor.id);
        npcLayer.append(button);npcButtons.set(actor.id,button);
      }
      const height=heightFor(actor);
      button.style.height=height+'px';
      button.style.transform = `translate(${actor.x-24}px,${actor.y-height}px)`;
    }
    actors.push(p);
    for (const actor of actors.sort((a,b)=>a.y-b.y)) {
      const isHero = actor.id === 'anna';
      const artId = artFor(actor);
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
    follow() { follow = true; },
    celebrate(text) {
      effect = {
        text,
        start: animationClock
      };
      draw();
    },
    zoomBy(factor) {
      const old = zoom;
      zoom = Math.max(.5, Math.min(2, zoom * factor));
      pan.x = host.clientWidth / 2 - (host.clientWidth / 2 - pan.x) * zoom / old;
      pan.y = host.clientHeight / 2 - (host.clientHeight / 2 - pan.y) * zoom / old;
      follow = false;
      transform();
    },
    destroy() {
      disposed = true;
      abort.abort();
      observer.disconnect();
    }
  };
}
