import {createPose,stepPose,samplePose,drawCharacter,loadCharacter} from './animation.js';
const socialRows={kira:0,ilya:1,anton:2,dima:3};
const entries=new Map();
let socialImage, sizeObserver, observingWindow=false;
let speakingCharacter=null;

/** Only the backing pixels change; composition remains in its original units. */
export function portraitResolution(width,height,dpr=1){
  if(!(width>0)||!(height>0)||!Number.isFinite(width)||!Number.isFinite(height))return null;
  const density=Number.isFinite(dpr)&&dpr>0?Math.min(dpr,3):1;
  const scale=Math.min(density,1536/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function isSpeaking(id){return id===speakingCharacter||(speakingCharacter==='anna'&&id.startsWith('anna-'));}
export function setSpeakingCharacter(id){
  speakingCharacter=id||null;
  for(const [element,entry] of entries){element.classList.toggle('is-speaking',isSpeaking(entry.id));}
}
function getSocialImage(){
  if(!socialImage){
    socialImage=new Image();socialImage.decoding='async';
    socialImage.onload=()=>{for(const [element,entry]of entries)if(entry.id in socialRows&&element.isConnected)paint(element,entry,entry.reducedMotion,true);};
    socialImage.src='./assets/social-portraits-motion.webp';
  }
  return socialImage;
}
export function portrait(id,label='',full=false,extra=''){
  return `<canvas class="character-portrait ${full?'full-body ':''}${extra}" width="${full?180:160}" height="${full?260:160}" data-character="${id}" data-full="${full}" role="img" aria-label="${label}"></canvas>`;
}
function resizeBacking(element,entry,width,height){
  const resolution=portraitResolution(width,height,globalThis.devicePixelRatio||1);
  if(!resolution)return;
  entry.cssWidth=width;entry.cssHeight=height;
  if(element.width===resolution.width&&element.height===resolution.height)return;
  element.width=resolution.width;element.height=resolution.height;
  entry.paintKey=null;
  paint(element,entry,entry.reducedMotion,true);
}
function observeSizes(){
  if(!sizeObserver&&typeof ResizeObserver!=='undefined'){
    sizeObserver=new ResizeObserver(changes=>{
      for(const change of changes){
        const entry=entries.get(change.target);
        if(entry)resizeBacking(change.target,entry,change.contentRect.width,change.contentRect.height);
      }
    });
  }
  if(!observingWindow&&typeof window!=='undefined'){
    observingWindow=true;
    // Changing screen density/desktop zoom can leave CSS dimensions unchanged.
    window.addEventListener('resize',()=>{
      for(const [element,entry]of entries)resizeBacking(element,entry,entry.cssWidth,entry.cssHeight);
    },{passive:true});
  }
}
function removeEntry(element){sizeObserver?.unobserve(element);entries.delete(element);}
export function syncPortraits(){
  observeSizes();
  for(const [element]of entries)if(!element.isConnected)removeEntry(element);
  for(const element of document.querySelectorAll('canvas[data-character]')){
    if(entries.has(element))continue;
    const id=element.dataset.character,full=element.dataset.full==='true';
    const phase=[...id].reduce((seed,char)=>seed+char.charCodeAt(0),0)*.137;
    const entry={id,ctx:element.getContext('2d'),pose:createPose(phase),atlas:null,time:phase,
      logicalWidth:full?180:160,logicalHeight:full?260:160,reducedMotion:true,paintKey:null,
      cssWidth:element.clientWidth,cssHeight:element.clientHeight};
    entries.set(element,entry);
    element.classList.toggle('is-speaking',isSpeaking(id));
    resizeBacking(element,entry,entry.cssWidth,entry.cssHeight);
    sizeObserver?.observe(element);
    if(id in socialRows){getSocialImage();paint(element,entry,true,true);}
    else loadCharacter(id).then(atlas=>{if(entries.get(element)!==entry||!element.isConnected)return;entry.atlas=atlas;paint(element,entry,entry.reducedMotion,true);});
  }
}
function paint(element,entry,reducedMotion,force=false){
  const {ctx,id}=entry,w=entry.logicalWidth,h=entry.logicalHeight;
  entry.reducedMotion=reducedMotion;
  let frame=0,key;
  if(id in socialRows){
    const img=getSocialImage();if(!img.complete||!img.naturalWidth)return;
    const phase=entry.time%6.4;
    frame=reducedMotion?0:speakingCharacter===id?(entry.time%.32<.14?2:0):phase>5.9&&phase<6.05?1:0;
    key='social:'+frame;
  }else{
    if(!entry.atlas)return;
    const sample=samplePose(entry.pose,{reducedMotion});
    // Ignore changes below a tiny fraction of a pixel, preserving visible breathing.
    key=[sample.frame,sample.flip,sample.scaleX.toFixed(4),sample.scaleY.toFixed(4),sample.bob.toFixed(3),sample.lean.toFixed(4)].join(':');
  }
  if(!force&&entry.paintKey===key)return;
  entry.paintKey=key;
  ctx.setTransform(element.width/w,0,0,element.height/h,0,0);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.clearRect(0,0,w,h);
  if(id in socialRows){
    const img=getSocialImage(),cw=img.naturalWidth/3,ch=img.naturalHeight/4;
    ctx.drawImage(img,frame*cw+cw*65/362,socialRows[id]*ch+ch*10/362,cw*240/362,ch*250/362,0,0,w,h);
  }else{
    const full=element.dataset.full==='true',height=full?h*.92:h*2.9;
    drawCharacter(ctx,entry.atlas,entry.pose,w*.5,full?h*.98:height+5,height,{reducedMotion});
  }
}
export function animatePortraits(dt,{reducedMotion=false,paused=false}={}){
  for(const [element,entry]of entries){
    if(!element.isConnected){removeEntry(element);continue;}
    if(!paused){entry.time+=dt;stepPose(entry.pose,{dir:'right',moving:false,speedRatio:0,walkCycle:0},dt,{reducedMotion});}
    if(!paused||dt===0)paint(element,entry,reducedMotion);
  }
}
