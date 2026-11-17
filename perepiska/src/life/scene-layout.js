/** Screen-space presentation geometry; never changes routes or story state. */
export const ACTOR_SPOTS = Object.freeze({mentor: 'vera', bench: 'max'});

/** Use the moving character's label for a task whenever that character exists. */
export function splitSceneSpots(spots, actorIds) {
  const present = new Set(actorIds), places = [], actors = new Map();
  for (const spot of spots) {
    const id = ACTOR_SPOTS[spot.id];
    if (id && present.has(id)) actors.set(id, spot);
    else places.push(spot);
  }
  return {places, actors};
}

/** Allocate enough physical pixels for the displayed world, within 32 MB RGBA. */
export function canvasBackingSize(zoom = 1, dpr = 1, maxPixels = 8_000_000) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const limit = Number.isFinite(maxPixels) && maxPixels >= 700_000 ? maxPixels : 8_000_000;
  const ratio = Math.min(safeZoom * safeDpr, Math.sqrt(limit / 700_000), 4096 / 1000);
  const width = Math.max(1, Math.floor(1000 * ratio));
  const height = Math.max(1, Math.floor(700 * ratio));
  return {width, height, scaleX: width / 1000, scaleY: height / 700};
}

const clamp = (n, low, high) => Math.max(low, Math.min(Math.max(low, high), n));
export const overlapArea = (a, b, gap = 0) => Math.max(0, Math.min(a.x+a.width+gap, b.x+b.width+gap)-Math.max(a.x-gap,b.x-gap)) * Math.max(0, Math.min(a.y+a.height+gap,b.y+b.height+gap)-Math.max(a.y-gap,b.y-gap));

/**
 * Place a small collection of labels around anchors, avoiding people and other
 * labels. Coordinates are CSS pixels, so labels stay readable at every zoom.
 * Previous positions are preferred only while still clear, avoiding jitter.
 */
export function placeSceneLabels(items, obstacles, bounds, previous = new Map()) {
  const placed = [], result = new Map();
  const sorted = [...items].sort((a,b)=>(b.priority||0)-(a.priority||0)||a.id.localeCompare(b.id));
  for (const item of sorted) {
    const width = Math.min(item.width, Math.max(1,bounds.right-bounds.left));
    const height = item.height;
    const preferred = {x: item.x-width/2+(item.offsetX||0), y:item.y-height-8+(item.offsetY||0)};
    const candidates = [{...preferred}];
    const old = previous.get(item.id);
    if (old && Math.hypot(old.anchorX-item.x,old.anchorY-item.y) < 42) {
      candidates.push({x:old.x+item.x-old.anchorX,y:old.y+item.y-old.anchorY,sticky:true});
    }
    // Bounded search: enough lateral/vertical choices for the five-person yard.
    for (let ring=1;ring<=5;ring++) {
      const dx = ring*(width*.55+10), dy = ring*(height+8);
      for (const [x,y] of [[-dx,0],[dx,0],[0,-dy],[0,dy],[-dx,-dy],[dx,-dy],[-dx,dy],[dx,dy]])
        candidates.push({x:preferred.x+x,y:preferred.y+y});
    }
    let best = null;
    for (const candidate of candidates) {
      const box = {x:clamp(candidate.x,bounds.left,bounds.right-width),y:clamp(candidate.y,bounds.top,bounds.bottom-height),width,height};
      const labelOverlap=placed.reduce((n,p)=>n+overlapArea(box,p,4),0);
      const personOverlap=obstacles.reduce((n,p)=>n+overlapArea(box,p,3),0);
      const distance=(box.x-preferred.x)**2+(box.y-preferred.y)**2;
      const score=labelOverlap*1_000_000+personOverlap*10_000+distance-(candidate.sticky?160:0);
      if(!best || score<best.score)best={...box,score};
    }
    const label = {...best,anchorX:item.x,anchorY:item.y};
    placed.push(label);result.set(item.id,label);
  }
  return result;
}
