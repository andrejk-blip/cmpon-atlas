/** Presentation-only animation. No story state or save fields are stored here. */
export const CHARACTER_ART = Object.freeze({
  'anna-home': {file:'anna-home-motion.webp', fallback:'anna-life-walk.webp', fallbackRow:0, height:142},
  'anna-coral': {file:'anna-coral-motion.webp', fallback:'anna-life-walk.webp', fallbackRow:1, height:142},
  'anna-sage': {file:'anna-sage-motion.webp', fallback:'anna-life-walk.webp', fallbackRow:2, height:142},
  vera: {file:'vera-motion.webp', fallback:'world-walk.webp', fallbackRow:2, height:115},
  max: {file:'max-motion.webp', fallback:'max-life.webp', single:true, height:129},
  'resident-1': {file:'resident-1-motion.webp', fallback:'residents-walk.webp', fallbackRow:0, height:107},
  'resident-2': {file:'resident-2-motion.webp', fallback:'residents-walk.webp', fallbackRow:1, height:111},
});
const TAU = Math.PI * 2;
const damp = (current,target,rate,dt) => target+(current-target)*Math.exp(-rate*dt);
export function createPose(seed=0) {
  return {stride:0, locomotion:0, facing:1, targetFacing:1, turn:1, idleClock:seed, clock:0, footfall:0};
}
export function stepPose(pose, actor, dt, {reducedMotion=false}={}) {
  if (!(dt>0) || !Number.isFinite(dt)) return pose;
  const step=Math.min(dt,.1);
  pose.clock+=step;
  pose.idleClock+=step;
  const actual=Number.isFinite(actor.speedRatio)?actor.speedRatio:(actor.moving?1:0);
  pose.locomotion=damp(pose.locomotion,Math.min(1,Math.max(0,actual)),14,step);
  if (actor.dir==='left' || actor.dir==='right') pose.targetFacing=actor.dir==='left'?-1:1;
  // Turn through a narrow three-quarter silhouette rather than mirroring in one frame.
  if(pose.facing!==pose.targetFacing) {
    pose.turn=Math.max(0,pose.turn-step*8);
    if(pose.turn===0) pose.facing=pose.targetFacing;
  } else pose.turn=Math.min(1,pose.turn+step*8);
  pose.stride=Number.isFinite(actor.walkCycle)?actor.walkCycle:pose.stride;
  if(reducedMotion) {pose.turn=1;pose.facing=pose.targetFacing;}
  return pose;
}
export function samplePose(pose, {reducedMotion=false}={}) {
  const walking=pose.locomotion>.10;
  const cycle=((pose.stride%1)+1)%1;
  const blinkPhase=pose.idleClock%5.8;
  // Long neutral holds; blink is brief, no repeated rapid blinking.
  const idleFrame=blinkPhase>5.48&&blinkPhase<5.63?10:blinkPhase>2.2&&blinkPhase<3.6?9:blinkPhase>4.3&&blinkPhase<4.65?11:8;
  return {
    frame:walking?Math.floor(cycle*8)%8:reducedMotion?8:idleFrame,
    flip:pose.facing,
    scaleX:reducedMotion?1:.2+.8*pose.turn,
    scaleY:reducedMotion||walking?1:1+Math.sin(pose.idleClock*1.65)*.003,
    bob:reducedMotion?0:walking?-Math.abs(Math.sin(cycle*TAU))*1.1*pose.locomotion:0,
    lean:reducedMotion?0:walking?Math.sin(cycle*TAU)*.008*pose.locomotion:Math.sin(pose.idleClock*.8)*.002,
    walking,
  };
}

/** A single cache shared by scenes and UI portraits. Each atlas is decoded once. */
const cache=new Map();
export function loadCharacter(id) {
  if(cache.has(id)) return cache.get(id);
  const spec=CHARACTER_ART[id];
  if(!spec) return Promise.reject(new Error('Unknown character '+id));
  const pending=new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(prepareAtlas(img,spec,false));
    img.onerror=()=>{
      const old=new Image();old.onload=()=>resolve(prepareAtlas(old,spec,true));
      old.onerror=()=>resolve(null);old.src='./assets/'+spec.fallback;
    };
    img.src='./assets/'+spec.file;
  });
  cache.set(id,pending);return pending;
}
function prepareAtlas(img,spec,legacy) {
  const cols=legacy&&spec.single?1:4,rows=legacy&&spec.single?1:3;
  const cw=img.naturalWidth/cols,ch=img.naturalHeight/rows;
  const sheet=document.createElement('canvas');sheet.width=img.naturalWidth;sheet.height=img.naturalHeight;
  const context=sheet.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0);
  const frames=[];
  for(let i=0;i<cols*rows;i++) {
    const x=Math.round((i%cols)*cw),y=Math.round(Math.floor(i/cols)*ch);
    const w=Math.round(cw),h=Math.round(ch),pixels=context.getImageData(x,y,Math.min(w,sheet.width-x),Math.min(h,sheet.height-y));
    let left=w,top=h,right=0,bottom=0;
    for(let yy=0;yy<pixels.height;yy++)for(let xx=0;xx<pixels.width;xx++)if(pixels.data[(yy*pixels.width+xx)*4+3]>48){
      left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);
    }
    if(bottom<=top){left=0;top=0;right=w;bottom=h;}
    // Torso centre stays steady even when the leading foot extends beyond it.
    let sum=0,count=0;
    for(let yy=Math.floor(top+(bottom-top)*.40);yy<Math.floor(top+(bottom-top)*.58);yy++)
      for(let xx=left;xx<=right;xx++)if(pixels.data[(yy*pixels.width+xx)*4+3]>128){sum+=xx;count++;}
    frames.push({x,y,w:Math.min(w,sheet.width-x),h:Math.min(h,sheet.height-y),pivotX:count?sum/count:(left+right)/2,pivotY:bottom,top,height:bottom-top});
  }
  const active=legacy&&spec.single?frames:legacy?frames.slice(spec.fallbackRow*4,spec.fallbackRow*4+4):frames;
  const height=[...active.map(f=>f.height)].sort((a,b)=>a-b)[Math.floor(active.length/2)]||ch;
  return {img,frames,height,legacy,spec};
}
export function drawCharacter(ctx,atlas,pose,x,y,height,options={}) {
  if(!atlas)return;
  const sample=samplePose(pose,options);
  const index=atlas.legacy?(atlas.spec.single?0:atlas.spec.fallbackRow*4+(sample.walking?Math.floor(sample.frame/2):0)):sample.frame;
  const f=atlas.frames[index]||atlas.frames[0],scale=height/atlas.height;
  ctx.save();ctx.translate(x,y+sample.bob);ctx.scale(sample.flip*sample.scaleX,sample.scaleY);ctx.rotate(sample.lean);
  ctx.drawImage(atlas.img,f.x,f.y,f.w,f.h,-f.pivotX*scale,-f.pivotY*scale,f.w*scale,f.h*scale);
  ctx.restore();
}
