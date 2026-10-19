/* Test-only bootstrap: never included in the game entry. */
(function(){
 'use strict';
 const store=new Map(),memory={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()};
 Object.defineProperty(window,'localStorage',{value:memory});Object.defineProperty(window,'sessionStorage',{value:memory});
 const fetchReal=window.fetch.bind(window),origin=new URL(document.baseURI).origin;
 window.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url,document.baseURI);if(u.origin!==origin){return Promise.resolve(new Response(JSON.stringify({cups:[],rows:[]}),{headers:{'Content-Type':'application/json'}}));}return fetchReal(u.href,options);};
 const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
 const tracked=new WeakMap();let listeners=0,peakListeners=0;
 EventTarget.prototype.addEventListener=function(type,fn,options){
  if(this===window||this===document){let list=tracked.get(this);if(!list)tracked.set(this,list=[]);const capture=typeof options==='boolean'?options:!!options?.capture;
   if(fn&&!list.some(x=>x.type===type&&x.fn===fn&&x.capture===capture)){list.push({type,fn,capture});listeners++;peakListeners=Math.max(listeners,peakListeners);}}
  return add.call(this,type,fn,options);
 };
 EventTarget.prototype.removeEventListener=function(type,fn,options){const list=tracked.get(this),capture=typeof options==='boolean'?options:!!options?.capture;
  const at=list?.findIndex(x=>x.type===type&&x.fn===fn&&x.capture===capture)??-1;if(at>=0){list.splice(at,1);listeners--;}return remove.call(this,type,fn,options);};
 const errors=[];
 window.addEventListener('error',e=>{errors.push({type:e.error?.name||'load',message:String(e.message||'').slice(0,160),file:(e.filename||'').split('/').pop(),line:e.lineno});if(errors.length>10)errors.shift();});
 window.addEventListener('unhandledrejection',e=>{errors.push({type:'promise',message:String(e.reason?.message||'').slice(0,160)});if(errors.length>10)errors.shift();});
 let rafCalls=0,rafDone=0,rafPeak=0;const pending=new Set(),raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
 window.requestAnimationFrame=fn=>{let id=raf(time=>{pending.delete(id);rafDone++;fn(time);});pending.add(id);rafCalls++;rafPeak=Math.max(rafPeak,pending.size);return id;};
 window.cancelAnimationFrame=id=>{pending.delete(id);return cancel(id);};
 window.CITADEL_QA_METRICS=()=>({listeners,peakListeners,rafCalls,rafDone,rafPending:pending.size,rafPeak,errors:errors.slice(),heap:performance.memory?.usedJSHeapSize||null});
})();
