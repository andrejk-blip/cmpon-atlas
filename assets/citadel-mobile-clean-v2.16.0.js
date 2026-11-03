/* Mobile messages stay in a narrow edge column, outside the central play area.
 * Existing objectives remain in the explicit controls menu and paused screens. */
(()=>{
 'use strict';if(globalThis.CITADEL_MOBILE_CLEAN2160)return;
 const mobile=()=>typeof isMobileLayout==='function'&&isMobileLayout();
 function sideText(c,text,W,H,color='#e9dec6',slot='notice'){
  const width=Math.min(130,W*.31),x=8,y=slot==='objective'?51:Math.max(82,Math.min(134,H*.29));
  c.save();c.font='600 11px Arial, sans-serif';c.textAlign='left';c.textBaseline='top';c.fillStyle=color;c.shadowColor='#06121d';c.shadowBlur=4;
  const words=String(text||'').replace(/\s+/g,' ').trim().split(' '),lines=[''];
  for(const word of words){const i=lines.length-1,next=lines[i]?lines[i]+' '+word:word;if(c.measureText(next).width<=width)lines[i]=next;else if(lines.length<2)lines.push(word);else{lines[i]+='…';break;}}
  lines.forEach((line,i)=>{while(line.length&&c.measureText(line).width>width)line=line.slice(0,-2)+'…';c.fillText(line,x,y+i*15,width);});c.restore();
  return{x,y,width,height:lines.length*15,lines,viewportWidth:W,viewportHeight:H};
 }
 const old=updateArcadeHUD;
 updateArcadeHUD=function(){const r=old.apply(this,arguments);document.getElementById('arcade-layout')?.classList.toggle('mobile2160',mobile());return r;};
 globalThis.CITADEL_MOBILE_CLEAN2160=Object.freeze({version:'2.16.0',mobile,sideText});
})();
