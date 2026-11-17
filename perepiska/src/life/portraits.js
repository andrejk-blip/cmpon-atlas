import {createPose,stepPose,drawCharacter,loadCharacter} from './animation.js';
const socialRows={kira:0,ilya:1,anton:2,dima:3};
const entries=new Map();
let socialImage;
function getSocialImage(){if(!socialImage){socialImage=new Image();socialImage.onload=()=>{for(const [element,entry]of entries)if(entry.id in socialRows&&element.isConnected)paint(element,entry,true);};socialImage.src='./assets/social-portraits-motion.webp';}return socialImage;}
export function portrait(id,label='',full=false,extra=''){
  return `<canvas class="character-portrait ${full?'full-body ':''}${extra}" width="${full?180:160}" height="${full?260:160}" data-character="${id}" data-full="${full}" role="img" aria-label="${label}"></canvas>`;
}
export function syncPortraits(){
  for(const [element]of entries)if(!element.isConnected)entries.delete(element);
  for(const element of document.querySelectorAll('canvas[data-character]')){
    if(entries.has(element))continue;
    const id=element.dataset.character;
    const phase=[...id].reduce((seed,char)=>seed+char.charCodeAt(0),0)*.137;
    const entry={id,ctx:element.getContext('2d'),pose:createPose(phase),atlas:null,time:phase};entries.set(element,entry);
    if(id in socialRows){getSocialImage();paint(element,entry,true);}else loadCharacter(id).then(atlas=>{entry.atlas=atlas;paint(element,entry,true);});
  }
}
function paint(element,entry,reducedMotion){
  const {ctx,id}=entry,w=element.width,h=element.height;ctx.clearRect(0,0,w,h);
  if(id in socialRows){
    const img=getSocialImage();if(!img.complete||!img.naturalWidth)return;
    const phase=entry.time%6.4,frame=reducedMotion?0:phase>5.9&&phase<6.05?1:0;
    const cw=img.naturalWidth/3,ch=img.naturalHeight/4;
    ctx.drawImage(img,frame*cw+cw*65/362,socialRows[id]*ch+ch*10/362,cw*240/362,ch*250/362,0,0,w,h);
  }else{
    const full=element.dataset.full==='true',height=full?h*.92:h*2.9;
    drawCharacter(ctx,entry.atlas,entry.pose,w*.5,full?h*.98:height+5,height,{reducedMotion});
  }
}
export function animatePortraits(dt,{reducedMotion=false,paused=false}={}){
  for(const [element,entry]of entries){
    if(!element.isConnected){entries.delete(element);continue;}
    if(!paused){entry.time+=dt;stepPose(entry.pose,{dir:'right',moving:false,speedRatio:0,walkCycle:0},dt,{reducedMotion});}
    if(!paused||dt===0)paint(element,entry,reducedMotion);
  }
}
