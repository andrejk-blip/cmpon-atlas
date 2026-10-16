/* CMPON Metrics 0.1.0. Standalone, no cookies, no fingerprinting, no persistent visitor ID. */
(function(root){
'use strict';
const IDLE=30*60*1000, MAX_SESSION=4*60*60*1000;
const ROUTE=/^[a-z][a-z0-9_-]{0,31}$/;
function storage(kind,method,key,value){try{return root[kind][method](key,value);}catch{return null;}}
function blocked(){const n=root.navigator||{};return n.globalPrivacyControl===true||n.doNotTrack==='1'||root.doNotTrack==='1'||n.msDoNotTrack==='1'||n.webdriver===true;}
function meta(){
 const n=root.navigator||{}, ua=n.userAgent||'', w=root.innerWidth||1024;
 const tablet=/iPad|Tablet/i.test(ua)||(/Macintosh/i.test(ua)&&(n.maxTouchPoints||0)>1);
 const os=/iPad|iPhone|iPod/.test(ua)||tablet&&/Macintosh/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh|Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
 const browser=/Edg\//.test(ua)?'Edge':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'Other';
 let source='direct';
 try{const u=new URL(root.document?.referrer||'');const host=u.hostname.toLowerCase();source=u.origin===root.location.origin?'internal':/(^|\.)(t\.me|telegram\.org)$/.test(host)?'telegram':/(^|\.)(max\.ru|web\.max\.ru)$/.test(host)?'max':/(^|\.)(google\.[a-z.]+|yandex\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(host)?'search':'other';}catch{}
 const lang=String(n.language||'').split('-')[0].toLowerCase();
 return {device:tablet?'tablet':/Mobi|iPhone|Android/.test(ua)?'phone':'desktop',browser,os,language:['ru','en'].includes(lang)?lang:'other',viewport:w<600?'compact':w<1100?'medium':'wide',source};
}
function init(options={}){
 const site=options.site, consentKey=`cmpon.metrics.consent.${site}`, sessionKey=`cmpon.metrics.session.${site}`;
 const routes=new Set(options.routes||[]),events=new Set(options.events||[]);
 let endpoint='';try{const u=new URL(options.endpoint);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.endsWith('/collect'))endpoint=u.href;}catch{}
 const ready=/^[a-z][a-z0-9-]{2,47}$/.test(site||'')&&!!endpoint&&routes.size>0;
 const now=()=>Date.now();let choice=storage('localStorage','getItem',consentKey),session=null,current=routes.has(options.route)?options.route:[...routes][0],pageSent='',dead=false;
 let activeMs=0,tickAt=now(),lastInput=now(),lastSendAt=now(),pending=new Set();const listeners=[],controls=new Set();
 function allowed(){return ready&&!dead&&!blocked()&&choice==='allow';}
 function listen(target,type,fn,opt){target?.addEventListener?.(type,fn,opt);listeners.push(()=>target?.removeEventListener?.(type,fn,opt));}
 function newUUID(){try{return root.crypto.randomUUID();}catch{return null;}}
 function getSession(){
   if(!allowed())return null;const t=now();
   if(!session){try{session=JSON.parse(storage('sessionStorage','getItem',sessionKey)||'null');}catch{session=null;}}
   if(!session||!/^[0-9a-f-]{36}$/.test(session.id||'')||t-session.last>IDLE||t-session.start>MAX_SESSION||t<session.start){const id=newUUID();if(!id)return null;session={id,start:t,last:t};pageSent='';}
   session.last=t;storage('sessionStorage','setItem',sessionKey,JSON.stringify(session));return session.id;
 }
 function clear(){session=null;pageSent='';activeMs=0;storage('sessionStorage','removeItem',sessionKey);for(const c of pending)c.abort();pending.clear();}
 function send(event,seconds=0){
   if(!allowed()||!ROUTE.test(event)||!events.has(event)||!routes.has(current))return false;
   const sid=getSession(),id=newUUID();if(!sid||!id)return false;
   const payload={schema:1,site,id,session:sid,event,route:current,seconds,...meta()};
   const controller=new AbortController();pending.add(controller);
   // ReferrerPolicy prevents query strings / fragment state being carried in the HTTP Referer header.
   Promise.resolve().then(()=>{if(controller.signal.aborted)return;return root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),credentials:'omit',referrerPolicy:'no-referrer',mode:'cors',keepalive:true,signal:controller.signal});}).catch(()=>{}).finally(()=>pending.delete(controller));
   return true;
 }
 function ensurePage(){const sid=getSession();if(sid&&pageSent!==`${sid}:${current}`&&send('page_view'))pageSent=`${sid}:${current}`;}
 function updateClock(){const t=now(),dt=Math.max(0,Math.min(2000,t-tickAt));tickAt=t;if(allowed()&&root.document?.visibilityState!=='hidden'&&t-lastInput<60000)activeMs+=dt;}
 function flush(){updateClock();const seconds=Math.min(30,Math.floor(activeMs/1000));if(seconds>0&&allowed()){ensurePage();send('engagement',seconds);}activeMs=0;lastSendAt=now();}
 function tick(){
  if(blocked()){clear();updateControls();return;}
  updateClock();
  if(allowed()&&root.document?.visibilityState!=='hidden'){if(now()-lastInput<60000)ensurePage();if(now()-lastSendAt>=30000)flush();}
 }
 function updateControls(){for(const fn of controls)fn();}
 const api={
  page(route){if(!routes.has(route)||!ROUTE.test(route))return false;if(route!==current){flush();current=route;pageSent='';}if(allowed())ensurePage();return true;},
  event(name){if(!events.has(name)||['page_view','engagement'].includes(name))return false;lastInput=now();ensurePage();return send(name);},
  consent(value){if(!['allow','deny'].includes(value))return false;choice=value;storage('localStorage','setItem',consentKey,value);if(value==='deny'||blocked())clear();else{tickAt=lastInput=now();ensurePage();}updateControls();return true;},
  status(){return {configured:ready,choice:choice||'unset',enabled:allowed(),blocked:blocked()};},
  destroy(){flush();dead=true;clear();for(const remove of listeners)remove();root.clearInterval(interval);controls.clear();},
  mountPrivacy(container){
   if(!container||!root.document)return;
   const box=root.document.createElement('section');box.className='metrics-privacy';box.setAttribute('aria-label','Настройки статистики');
   const title=root.document.createElement('strong');title.textContent='Помочь сделать атлас удобнее';
   const desc=root.document.createElement('p');desc.textContent='Считать посещения и использование разделов? Только после вашего выбора. Тексты, поисковые запросы, IP и личные данные в статистику не записываем.';
   const status=root.document.createElement('span');status.className='metrics-privacy-status';status.setAttribute('aria-live','polite');
   const yes=root.document.createElement('button');yes.type='button';yes.textContent='Разрешить статистику';yes.addEventListener('click',()=>api.consent('allow'));
   const no=root.document.createElement('button');no.type='button';no.textContent='Без статистики';no.addEventListener('click',()=>api.consent('deny'));
   const buttons=root.document.createElement('div');buttons.append(yes,no);box.append(title,desc,status,buttons);container.append(box);
   const update=()=>{const s=api.status();box.classList.toggle('metrics-privacy-decided',s.choice!=='unset'||s.blocked);status.textContent=!s.configured?'Статистика ещё не подключена':s.blocked?'Сбор отключён настройкой приватности браузера':s.enabled?'Статистика включена. Вы можете отключить её в любой момент.':s.choice==='deny'?'Статистика отключена':'Выбор ещё не сделан — сбор отключён';yes.disabled=!s.configured||s.blocked;yes.setAttribute('aria-pressed',String(s.enabled));no.setAttribute('aria-pressed',String(!s.enabled&&s.choice==='deny'));};controls.add(update);update();return box;
  }
 };
 for(const type of ['pointerdown','keydown','scroll'])listen(root,type,()=>{lastInput=now();if(allowed())ensurePage();},{passive:true});
 listen(root.document,'visibilitychange',()=>{if(root.document.visibilityState==='hidden')flush();else{tickAt=lastInput=now();if(allowed())ensurePage();}});
 listen(root,'pagehide',flush);listen(root,'storage',e=>{if(e.key===consentKey){choice=e.newValue;clear();if(allowed())ensurePage();updateControls();}});
 const interval=root.setInterval(tick,1000);if(allowed())ensurePage();return api;
}
root.AtlasMetrics=Object.freeze({init,version:'0.1.0'});
})(globalThis);

