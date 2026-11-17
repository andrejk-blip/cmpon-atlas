import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitResolution,syncPortraits,animatePortraits,setSpeakingCharacter} from '../src/life/portraits.js';

test('portrait backing density follows display pixels instead of a fixed low-resolution thumbnail',()=>{
  assert.deepEqual(portraitResolution(92,98,2),{width:184,height:196});
  assert.deepEqual(portraitResolution(300,380,2),{width:600,height:760});
  assert.deepEqual(portraitResolution(62,62,1.25),{width:78,height:78});
});
test('hidden or invalid portraits do not allocate and oversized surfaces retain a bounded aspect ratio',()=>{
  for(const [w,h]of[[0,100],[100,0],[-5,20],[NaN,100],[100,Infinity]])assert.equal(portraitResolution(w,h,2),null);
  const large=portraitResolution(1200,2400,5);
  assert.deepEqual(large,{width:768,height:1536});
  assert.deepEqual(portraitResolution(80,90,NaN),{width:80,height:90});
});
test('DPR resizing preserves portrait composition and unchanged expressions do not repaint',()=>{
  const saved={document:globalThis.document,window:globalThis.window,Image:globalThis.Image,ResizeObserver:globalThis.ResizeObserver,devicePixelRatio:globalThis.devicePixelRatio};
  let observer,resizeWindow;const draws=[],transforms=[];let clearCount=0;
  const canvas={dataset:{character:'kira',full:'false'},width:160,height:160,clientWidth:92,clientHeight:98,isConnected:true,
    classList:{toggle(){}},getContext:()=>({setTransform:(...v)=>transforms.push(v),clearRect:()=>clearCount++,drawImage:(...v)=>draws.push(v.slice(1))})};
  let nodes=[canvas];
  globalThis.document={querySelectorAll:()=>nodes};
  globalThis.window={addEventListener:(name,cb)=>{if(name==='resize')resizeWindow=cb;}};
  globalThis.Image=class{complete=true;naturalWidth=1086;naturalHeight=1448;};
  globalThis.ResizeObserver=class{constructor(cb){this.cb=cb;observer=this;}observe(){}unobserve(){this.unobserved=true;}};
  globalThis.devicePixelRatio=2;
  try{
    syncPortraits();assert.equal(canvas.width,184);assert.equal(canvas.height,196);
    const composition=draws.at(-1),before=draws.length;
    for(let n=0;n<20;n++)animatePortraits(1/60,{reducedMotion:true});
    assert.equal(draws.length,before,'static expression should not repaint every frame');
    globalThis.devicePixelRatio=3;resizeWindow();
    assert.equal(canvas.width,276);assert.equal(canvas.height,294);
    assert.deepEqual(draws.at(-1),composition,'changing pixel density must not recrop the face');
    assert.deepEqual(transforms.at(-1),[276/160,0,0,294/160,0,0]);
    setSpeakingCharacter('kira');animatePortraits(0,{reducedMotion:false});
    assert(clearCount>0);
    canvas.isConnected=false;nodes=[];animatePortraits(0,{paused:true});
    assert.equal(observer.unobserved,true);
  }finally{for(const [name,value]of Object.entries(saved)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});
