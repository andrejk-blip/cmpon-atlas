/* The opening scene is ordinary accessible HTML over original layered art.
 * No animation loop, cursor tracking or save mutation; gameplay owns actions. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_HOME2180)return;
 const ART='./assets/home2180/';
 let crewReady=false,cancelLoading=null;
 // Wait for decoding, not merely a network load: show the four layers together.
 // A failed image never blocks the menu or starting/continuing a game.
 function prepare(root){
  if(!root)return;
  if(cancelLoading)cancelLoading();
  const images=Array.from(root.querySelectorAll('.home2180-crew img'));
  if(images.length!==4)return;
  const notice=root.querySelector('.home2181-loading'),label=notice?.querySelector('span'),retry=notice?.querySelector('button');
  let active=true,done=0,settled=false;const cleanups=[];
  function cleanup(){clearTimeout(timer);for(const off of cleanups)off();}
  function finish(ok){
   if(!active||settled)return;settled=true;cleanup();
   if(ok){crewReady=true;root.classList.remove('home2181-pending');root.classList.add('home2181-ready');if(notice)notice.hidden=true;}
   else if(notice){notice.hidden=false;if(label)label.textContent='Экипаж не загрузился';if(retry)retry.hidden=false;}
  }
  const timer=setTimeout(()=>finish(false),12000);
  cancelLoading=()=>{active=false;cleanup();};
  if(label)label.textContent='Загружаем экипаж · 0 / 4';
  if(retry){retry.hidden=true;retry.onclick=()=>{
   for(const img of images)if(!img.complete||!img.naturalWidth)img.src=img.src.split('?')[0]+'?retry='+Date.now();
   prepare(root);
  };}
  for(const img of images){
   if(settled)break;
   let decoding=false;
   const loaded=()=>{
    if(!active||settled||decoding)return;decoding=true;
    Promise.resolve().then(()=>typeof img.decode==='function'?img.decode():null).then(()=>{
     if(!active||settled)return;
     if(!img.naturalWidth){finish(false);return;}
     done++;if(label)label.textContent='Загружаем экипаж · '+done+' / 4';
     if(done===images.length)finish(true);
    },()=>finish(false));
   };
   const failed=()=>finish(false);
   img.addEventListener('load',loaded);img.addEventListener('error',failed);
   cleanups.push(()=>{img.removeEventListener('load',loaded);img.removeEventListener('error',failed);});
   if(img.complete){if(img.naturalWidth)loaded();else failed();}
  }
 }
 function lobby({mode,canContinue,button:b}){
  const L=globalThis.CITADEL_LEARNING_MODES;
  const crew=['mech','ninja','analyst','doberman'].map(name=>'<div class="home2180-actor home2180-'+name+'"><img src="'+ART+name+'.webp" alt="" decoding="async" loading="eager" fetchpriority="high"></div>').join('');
  const stars=Array.from({length:7},(_,i)=>'<i style="--i:'+i+'"></i>').join('');
  Promise.resolve().then(()=>prepare(document.querySelector?.('.home2180')));
  return '<section class="menu2170 menu2173 home2180" aria-label="Цитадель требований — главное меню">'+
   '<picture class="home2180-environment" aria-hidden="true"><source media="(max-width: 700px)" srcset="'+ART+'hangar-small.webp"><img src="'+ART+'hangar.webp" width="1672" height="941" loading="eager" fetchpriority="high" decoding="async" alt=""></picture>'+
   '<div class="home2180-atmosphere" aria-hidden="true"></div><div class="home2180-glints" aria-hidden="true">'+stars+'</div>'+
   '<header class="home2180-title"><p class="home2180-eyebrow"><i aria-hidden="true"></i> БАЗА КОСМИЧЕСКИХ АНАЛИТИКОВ</p><h3>ЦИТАДЕЛЬ <span>ТРЕБОВАНИЙ</span></h3><p class="home2180-story">Собери требования. <br>Защити свою цитадель.</p></header>'+
   '<div class="home2180-crew" data-crew-ready="'+crewReady+'" role="img" aria-label="Команда цитадели: аналитик, мех, ниндзя и кибердоберман в орбитальном ангаре">'+crew+'</div>'+
   '<div class="home2181-loading" role="status"'+(crewReady?' hidden':'')+'><span>Загружаем экипаж · 0 / 4</span><button type="button" hidden>Повторить</button></div>'+
   '<div class="home2180-console">'+(globalThis.CITADEL_SOCIAL?.homebar()||'')+'<div class="home2180-console-label" aria-hidden="true"><span>ЭКСПЕДИЦИЯ · 15 ГЛАВ</span><i></i> СВЯЗЬ ЕСТЬ</div>'+
   '<div class="home2180-modes" role="group" aria-label="Режим игры">'+L.modes.map(m=>b('learning-mode',m==='pro'?'Кейсы':L.labels[m],m,'aria-pressed="'+(m===mode)+'"')).join('')+'</div>'+
   '<p class="home2180-description">'+({training:'Спокойный бой. Подсказки рядом.',combat:'Полный бой. Короткие вопросы.',pro:'Полный бой. Задачи аналитика.'}[mode])+'</p>'+
   '<div class="home2180-play">'+(canContinue?b('campaign-continue','Продолжить <span aria-hidden="true">↗</span>',mode,'class="home2180-primary"'):'')+b(mode==='pro'?'launch-new':'learning-start',canContinue?'Сначала':'Начать игру <span aria-hidden="true">↗</span>','','class="'+(canContinue?'home2180-restart':'home2180-primary')+'"')+'</div>'+
   '<nav class="home2180-nav" aria-label="Коллекция и дополнительные возможности">'+b('collection2170-open','Коллекция','cards')+b('collection2170-open','Комиксы','comics')+(globalThis.CITADEL_SOCIAL?.awardsButton(b)||b('collection2170-open','Достижения','achievements'))+'<details><summary>Ещё <span aria-hidden="true">···</span></summary><div class="home2180-more">'+'<a href="./academy.html" target="_blank" rel="noopener">Академия ↗</a><button type="button" data-metrics-settings aria-controls="atlas-metrics-consent" aria-expanded="false">Статистика посещений</button></div></details></nav></div>'+
   '<div class="home2180-coordinate" aria-hidden="true">ОРБИТАЛЬНАЯ СТАНЦИЯ <b>01 / ДОМ</b></div></section>';
 }
 // The shared Atlas entry gets the game icon only while its game route is open.
 const icon=document.querySelector?.('link[rel="icon"]'),atlasTitle=document.title;
 const originalIcon=icon?{href:icon.getAttribute('href'),type:icon.getAttribute('type')}:null;
 function brand(){if(!icon)return;const game=typeof STATE!=='undefined'&&STATE.view==='arcade';document.title=game?'Цитадель требований — игра':atlasTitle;icon.setAttribute('href',game?ART+'analyst-32.png':originalIcon.href);if(game)icon.setAttribute('type','image/png');else if(originalIcon.type)icon.setAttribute('type',originalIcon.type);else icon.removeAttribute('type');}
 if(typeof setView==='function'){const oldView=setView;setView=function(){const result=oldView.apply(this,arguments);brand();return result;};}
 brand();
 globalThis.CITADEL_HOME2180=Object.freeze({version:'2.18.2',lobby,prepare});
})();
