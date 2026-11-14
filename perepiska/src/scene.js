import { NODES, TASK_NODES, nearestNode } from './world.js';

/** Rendering and camera only. The movement model stays independent of the DOM. */
export function createScene(host, world, callbacks) {
  host.innerHTML = '<div class="world"><canvas aria-hidden="true"></canvas><div class="places"></div><div class="actors"></div></div>';
  const surface = host.querySelector('.world'),
    canvas = surface.querySelector('canvas'),
    ctx = canvas.getContext('2d');
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = 1000 * ratio;
  canvas.height = 700 * ratio;
  ctx.scale(ratio, ratio);
  const atlas = new Image();
  atlas.src = './assets/world-walk.webp';
  const residents = new Image();
  residents.src = './assets/residents-walk.webp';
  const listeners = new AbortController();
  let zoom = 1,
    pan = {
      x: 0,
      y: 0
    },
    gesture = null,
    following = true,
    selected = 'anna',
    tasks = [],
    staff = [],
    reduced = false;
  const buttons = new Map();
  for (const actor of world.actors.filter(a => a.type === 'staff')) {
    const b = document.createElement('button');
    b.className = 'actor-hit';
    b.dataset.actor = actor.id;
    b.setAttribute('aria-label', `Выбрать ${['Нину', 'Лену', 'Веру'][actor.portraitIndex]}`);
    b.addEventListener('click', () => callbacks.onActor(actor.id));
    surface.querySelector('.actors').append(b);
    buttons.set(actor.id, b);
  }
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
  function resize() {
    zoom = Math.max(host.clientWidth / 1000, host.clientHeight / 700);
    if (host.clientWidth < 600) zoom = Math.max(zoom, .85);
    center();
  }
  function center() {
    const a = world.actors.find(a => a.id === selected);
    pan = {
      x: host.clientWidth / 2 - a.x * zoom,
      y: host.clientHeight * .65 - a.y * zoom
    };
    following = true;
    transform();
  }
  atlas.onload = draw;
  residents.onload = draw;
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    gesture = {
      x: e.clientX,
      y: e.clientY,
      px: pan.x,
      py: pan.y,
      moved: false
    };
    host.setPointerCapture(e.pointerId);
  }, {
    signal: listeners.signal
  });
  host.addEventListener('pointermove', e => {
    if (!gesture) return;
    const dx = e.clientX - gesture.x,
      dy = e.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 6) {
      gesture.moved = true;
      following = false;
      pan.x = gesture.px + dx;
      pan.y = gesture.py + dy;
      transform();
    }
  }, {
    signal: listeners.signal
  });
  host.addEventListener('pointerup', e => {
    if (!gesture) return;
    if (!gesture.moved) {
      const box = host.getBoundingClientRect();
      callbacks.onGround(nearestNode((e.clientX - box.left - pan.x) / zoom, (e.clientY - box.top - pan.y) / zoom));
    }
    gesture = null;
  }, {
    signal: listeners.signal
  });
  host.addEventListener('pointercancel', () => gesture = null, {
    signal: listeners.signal
  });
  function update(data) {
    selected = data.selected;
    tasks = data.tasks;
    staff = data.staff;
    reduced = data.reduced;
    const places = surface.querySelector('.places');
    places.replaceChildren();
    tasks.forEach((task, i) => {
      const n = NODES[TASK_NODES[task.id]];
      if (!n) return;
      const done = task.status === 'accepted' || task.transmission === 'accepted';
      const travelling = world.actors.some(a => a.taskId === task.id && a.moving);
      const ready = world.actors.some(a => a.taskId === task.id && !a.moving && a.node === TASK_NODES[task.id]);
      const b = document.createElement('button');
      b.className = `house-pin ${done ? 'done' : ''} ${ready && !done ? 'ready' : ''}`;
      b.style.left = n.x + 'px';
      b.style.top = n.y - 16 + 'px';
      b.dataset.house = task.id;
      b.setAttribute('aria-label', `${task.name}, ${task.address}${done ? ', завершено' : ''}`);
      b.title = `${task.name} · ${task.address}`;
      const symbol = done ? '✓' : ready ? '···' : travelling ? '↗' : String(i + 1);
      b.innerHTML = `<span>${symbol}</span><small>${task.address.split(' · ')[1] || 'адрес'}</small>`;
      b.onclick = () => callbacks.onHouse(task.id);
      places.append(b);
    });
    const base = document.createElement('button');
    base.className = 'base-pin';
    base.style.left = NODES.base.x + 'px';
    base.style.top = NODES.base.y + 5 + 'px';
    base.setAttribute('aria-label', 'Вернуться к штабу');
    base.innerHTML = '<span>⌂</span><small>Штаб</small>';
    base.onclick = () => callbacks.onGround('base');
    places.append(base);
  }
  function drawResident(a) {
    if (!residents.complete || !residents.naturalWidth) return;
    const size = 105 * (.76 + a.y / 1700),
      frame = a.moving ? Math.floor(a.walkCycle * 4) % 4 : 0;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.fillStyle = '#25372828';
    ctx.beginPath();
    ctx.ellipse(0, -1, size * .17, size * .05, 0, 0, 7);
    ctx.fill();
    if (a.dir === 'left') ctx.scale(-1, 1);
    const sw = residents.naturalWidth / 4,
      sh = residents.naturalHeight / 3;
    ctx.drawImage(residents, frame * sw, a.portraitIndex * sh, sw, sh, -size / 2, -size * .96, size, size);
    ctx.restore();
  }
  function draw() {
    if (following && host.clientWidth < 600) {
      const a = world.actors.find(a => a.id === selected);
      if (a.moving) {
        const targetX = host.clientWidth / 2 - a.x * zoom,
          targetY = host.clientHeight * .6 - a.y * zoom;
        pan.x += (targetX - pan.x) * .08;
        pan.y += (targetY - pan.y) * .08;
        transform();
      }
    }
    ctx.clearRect(0, 0, 1000, 700);
    const active = world.actors.find(a => a.id === selected);
    if (active?.moving) {
      ctx.save();
      ctx.strokeStyle = '#fbf5dce6';
      ctx.lineWidth = 5;
      ctx.setLineDash([3, 12]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(active.x, active.y);
      for (const id of active.path) ctx.lineTo(NODES[id].x, NODES[id].y);
      ctx.stroke();
      ctx.restore();
    }
    for (const a of [...world.actors].sort((a, b) => a.y - b.y)) {
      if (a.type === 'resident') {
        drawResident(a);
        continue;
      }
      const person = staff.find(s => s.id === a.id),
        size = 112 * (.76 + a.y / 1700),
        frame = a.moving ? Math.floor(a.walkCycle * 4) % 4 : 0;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.fillStyle = a.id === selected ? '#f8cd5cc9' : '#25372830';
      ctx.strokeStyle = '#456953';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -1, size * .2, size * .065, 0, 0, 7);
      ctx.fill();
      if (a.id === selected) ctx.stroke();
      if (a.dir === 'left') ctx.scale(-1, 1);
      if (person && !person.available) ctx.globalAlpha = .65;
      if (atlas.complete && atlas.naturalWidth) {
        const sw = atlas.naturalWidth / 4,
          sh = atlas.naturalHeight / 3;
        ctx.drawImage(atlas, frame * sw, a.portraitIndex * sh, sw, sh, -size / 2, -size * .96, size, size);
      } else {
        ctx.fillStyle = '#d88969';
        ctx.fillRect(-12, -65, 24, 65);
      }
      ctx.restore();
      if (a.id === selected) {
        ctx.fillStyle = '#fffaf0';
        ctx.strokeStyle = '#44664f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x - 6, a.y - size - 8);
        ctx.lineTo(a.x + 6, a.y - size - 8);
        ctx.lineTo(a.x, a.y - size + 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      const b = buttons.get(a.id);
      b.style.transform = `translate(${a.x - 25}px,${a.y - 90}px)`;
      b.classList.toggle('chosen', a.id === selected);
    }
  }
  return {
    update,
    draw,
    center,
    zoomBy(factor) {
      const old = zoom;
      zoom = Math.max(.5, Math.min(2, zoom * factor));
      pan.x = host.clientWidth / 2 - (host.clientWidth / 2 - pan.x) * zoom / old;
      pan.y = host.clientHeight / 2 - (host.clientHeight / 2 - pan.y) * zoom / old;
      following = false;
      transform();
    },
    destroy() {
      observer.disconnect();
      listeners.abort();
    }
  };
}
