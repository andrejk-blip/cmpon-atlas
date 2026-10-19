/* Isolated test-only networking and storage. Never loaded by index.html. */
(function(){
  'use strict';
  const store=new Map(window.LAUNCH_QA.memory),memory={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()};
  Object.defineProperty(window,'localStorage',{value:memory});Object.defineProperty(window,'sessionStorage',{value:memory});
  window.LAUNCH_QA_MEMORY=()=>[...store];window.LAUNCH_QA_ERRORS=[];
  const original=window.fetch.bind(window),origin=new URL(document.baseURI).origin;
  window.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'?input:input.url,document.baseURI);
    if(url.origin===origin)return original(url.href,options);
    if(url.pathname.includes('/api/tournament/')){
      if(LAUNCH_QA.scenario==='down')return Promise.reject(new TypeError('Failed to fetch'));
      if(LAUNCH_QA.scenario==='hang')return new Promise(()=>{});
      const endpoint=url.pathname.split('/').pop(),player={id:'qa-player',name:'Тест запуска'},run={id:'qa-run',seed:417147,mode:'calm',status:'active',gameVersion:'1.3.0',progress:0,clock:0,revision:0};
      const data=endpoint==='config'?{cups:[]}:endpoint==='enter'?{token:'qa-token',player}:endpoint==='me'?{player,runs:[]}:['start','save','run'].includes(endpoint)?{run}:{rows:[]};
      return Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
    }
    return Promise.resolve(new Response('{}',{headers:{'Content-Type':'application/json'}}));
  };
  addEventListener('error',event=>LAUNCH_QA_ERRORS.push({kind:'error',message:String(event.message).slice(0,120)}));
  addEventListener('unhandledrejection',event=>LAUNCH_QA_ERRORS.push({kind:'promise',message:String(event.reason?.message||event.reason).slice(0,120)}));
})();
