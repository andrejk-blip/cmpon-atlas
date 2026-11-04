/* Persistent illustrated collection and seven story milestones. Awards never
 * affect score or cloud ranking. Practice cannot earn or overwrite progress. */
(()=>{
 'use strict';if(globalThis.CITADEL_COLLECTION)return;
 const C=CITADEL_CAMPAIGN,L=CITADEL_LEARNING_MODES,p=RequirementArcade.prototype,KEY='cmpon.citadel.collection2170.v1';
 const CARDS=[
  ['hero','Аналитик','Начать кампанию'],['robodog','Робособака','Пройти Палубу требований'],
  ['scout','Обходчик','Пройти Палубу требований'],['shield','Блокер','Пройти Палубу требований'],
  ['sniper','Снайпер','Пройти Палубу согласования'],['hunter','Преследователь','Пройти Палубу согласования'],
  ['relay','Ретранслятор','Пройти Палубу согласования'],['rocketeer','Ракетчик','Пройти Палубу интеграции'],
  ['ninja','Ниндзя','Пройти Логово МРГ'],['mech','Мех','Пройти Палубу интеграции'],
  ['hammer','Кузнец разлома','Встретить в разломе'],['tentacle','Спрут пустоты','Встретить в разломе'],
  ['maw','Пожиратель сигнала','Встретить в разломе'],['mantis','Косарь','Встретить в разломе'],
  ['medusa','Медуза помех','Встретить в разломе'],['parallax','Параллакс','Добраться до Параллакса'],['mrg','МРГ','Добраться до последнего рубежа']
 ].map(([id,title,hint])=>({id,title,hint,src:'./assets/collection2170/'+id+'.webp',thumb:'./assets/collection2170/thumbs/'+id+'.webp'}));
 const COMICS=[
  {id:'departure',title:'Пакет для Цитадели',after:null,captions:['Один пакет требований. Пятнадцать глав до исполнения.','Аналитик принимает задание и поднимается на борт.','Цитадель остаётся позади. Впереди — первый архив.','Его охрана уже знает о приближении корабля.']},
  {id:'first_archive',title:'Первый фрагмент',after:'base1',captions:['В глубине архива найден первый фрагмент пакета.','Обходчик и Блокер перекрывают путь к выходу.','Робособака бросается наперерез — нужно успеть к шлюзу.','Фрагмент на борту. Теперь его необходимо защитить в конвое.']},
  {id:'rift',title:'По следу сигнала',after:'pursuit',captions:['Золотой корабль ФЗ уходит в разлом. Аналитик следует за ним.','Кузнец разлома и Косарь сжимают коридор.','Спрут пустоты и Пожиратель сигнала рвут связь.','Медуза помех остаётся позади. Три фрагмента приняты — картина становится яснее.']},
  {id:'beacons',title:'Четыре маяка',after:'swarm',captions:['За рассеянным роем открывается огромная станция.','Параллакс поднимает четыре маяка над бронированным корпусом.','Маяки питают щит центрального кристалла.','Корабль выходит на первый маяк. Блокаду придётся прорвать.']},
  {id:'breakthrough',title:'Разрыв блокады',after:'parallax',captions:['Четыре маяка гаснут. Кристалл Параллакса раскалывается.','Корабль проходит сквозь разрыв в обороне станции.','Аналитик соединяет добытые фрагменты пакета.','На палубе интеграции ждёт новый гарнизон.']},
  {id:'accord',title:'Общий смысл',after:'contradictions',captions:['Два источника посылают в резонатор разные определения.','Три кольца сходятся: смысл, владелец и состояния.','Спорные записи становятся согласованной моделью.','Путь к МРГ открыт. Последний гарнизон готовится к встрече.']},
  {id:'final',title:'Сигнал принят',after:'mrg',captions:['Глаз МРГ тускнеет. Последний рубеж пройден.','Аналитик передаёт согласованный пакет через терминал.','В Цитадели принимают документ и подтверждают доставку.','Над крепостью встаёт солнце. Теперь требования могут стать результатом.']}
 ].map(x=>({...x,src:'./assets/comics2170/'+x.id+'.webp',thumb:'./assets/comics2170/thumbs/'+x.id+'.webp'}));
 const ACHIEVEMENTS=[
  ['first','Первый вылет','Начать кампанию'],['archive','Хранитель архива','Пройти Палубу требований'],
  ['rift','Исследователь разлома','Открыть все пять монстров'],['beacons','Гаситель маяков','Победить Параллакс'],
  ['accord','Общий язык','Пройти Станцию противоречий'],['citadel','Сигнал принят','Победить МРГ'],
  ['collector','Полная колода','Открыть все 17 персонажей'],['reader','Вся история','Открыть семь комиксов']
 ].map(([id,title,hint])=>({id,title,hint}));
 const empty=()=>({schema:1,cards:{},comics:{},achievements:{}});
 let profile=empty(),menuView=null;
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.schema===1)for(const k of ['cards','comics','achievements'])profile[k]=saved[k]&&typeof saved[k]==='object'?saved[k]:{};}catch{}
 const old={start:p.start,step:p.step,action:arcadeAction,overlay:arcadeOverlayHTML,update:updateArcadeOverlay,unpack:cupUnpack};
 const btn=(a,t,v='',extra='')=>'<button type="button" data-action="'+a+'" data-value="'+esc(String(v))+'" '+extra+'>'+t+'</button>';
 const view=e=>C.active(e)?e.campaign2120.modal:menuView;
 const owned=v=>v&&['collection2170','art2170','comic2170','bestiary'].includes(v.type);
 // Warm only the first story sheet and the currently inspected art. Four comic
 // frames share one sheet; changing frames must never fetch four new images.
 const imageLoads=new Map(),saveData=()=>!!globalThis.navigator?.connection?.saveData;
 function sourceFor(v){return v?.type==='comic2170'?(COMICS.find(c=>c.id===v.id)||COMICS[0]).src:['art2170','bestiary'].includes(v?.type)?(CARDS.find(c=>c.id===(v.id||v.kind))||CARDS[0]).src:null;}
 function warmImage(src,priority='low',retry=false){
  if(!src||typeof Image!=='function')return null;
  let state=imageLoads.get(src);if(state&&!(retry&&state.status==='error')){if(priority==='high')state.image.fetchPriority='high';return state;}
  const image=new Image();state={image,status:'loading'};imageLoads.set(src,state);image.decoding='async';image.fetchPriority=priority;
  const settled=status=>{state.status=status;const e=typeof ARCADE!=='undefined'?ARCADE.engine:null;if(e&&sourceFor(view(e))===src)refresh(e,false);};
  image.onload=()=>settled('ready');image.onerror=()=>settled('error');image.src=src;return state;
 }
 function imageNotice(src){const state=imageLoads.get(src);if(!state||state.status==='ready')return '';
  return '<span class="image2172-status" role="status" style="padding:10px 14px;border-radius:8px;background:#102630e8;color:#eee5d2;font:14px/1.4 system-ui;text-align:center">'+(state.status==='error'?'Иллюстрация не загрузилась. '+btn('collection2172-retry','Повторить',src):'Загружаем иллюстрацию…')+'</span>';
 }
 function warmNextArt(card){if(saveData()||imageLoads.get(card.src)?.status!=='ready')return;const unlocked=CARDS.filter(c=>profile.cards[c.id]),i=unlocked.findIndex(c=>c.id===card.id);if(unlocked.length>1)warmImage(unlocked[(i+1)%unlocked.length].src);}

 function persist(){try{if(!globalThis.CITADEL_TEST_MEMORY_ONLY)localStorage.setItem(KEY,JSON.stringify(profile));}catch{if(typeof ARCADE!=='undefined')ARCADE.storage=false;}}
 function grant(group,id){if(profile[group][id])return false;profile[group][id]=true;persist();return true;}
 function campaign(e,fresh=false){const s=C.state(e);if(!s.story2170){s.story2170={seen:{}};if(!fresh)for(const c of COMICS)if(!c.after||s.completed.includes(c.after))s.story2170.seen[c.id]=true;}s.comic2130Seen=true;return s;}
 function setView(e,v){if(C.active(e))C.state(e).modal=v;else menuView=v;warmImage(sourceFor(v),'high');clearArcadeInput();}
 function refresh(e=ARCADE.engine,save=true){ARCADE.overlayToken='';if(save&&C.active(e))C.save(e,true);updateArcadeHUD();updateArcadeOverlay();}
 function unlock(e){
  if(!C.active(e)||C.state(e).practice||e.status==='menu')return;
  const s=campaign(e);grant('cards','hero');grant('achievements','first');
  for(const id of Object.keys(s.encounters||{}))if(CARDS.some(c=>c.id===id))grant('cards',id);
  const b=e.board;
  if(b&&['boarding','remark','finalcheck'].includes(e.status))for(const x of b.enemies||[]){
   if(!x.pos||!b.pos||Math.hypot(...x.pos.map((v,i)=>v-b.pos[i]))>24||typeof stationLine==='function'&&!stationLine(b,b.pos,x.pos,.15))continue;
   const id=x.missions270?.kind==='dog'?'robodog':x.missions270?.kind==='mech'?'mech':x.archetype;
   if(CARDS.some(c=>c.id===id))grant('cards',id);
  }
  // Completed deck rewards also migrate older saves which did not track troops.
  for(const [mission,cards]of Object.entries({base1:['scout','shield','robodog'],base2:['sniper','hunter','relay'],base3:['rocketeer','mech'],lair:['ninja']}))if(s.completed.includes(mission)&&!s.skipped2140?.[mission])for(const id of cards)grant('cards',id);
  if(s.earlyBoss||s.parallaxDone||s.completed.includes('parallax'))grant('cards','parallax');
  if(e.finale&&['mrg','upload','victory'].includes(e.finale.phase)||s.completed.includes('mrg'))grant('cards','mrg');
  for(const [mission,id]of [['base1','archive'],['parallax','beacons'],['contradictions','accord'],['mrg','citadel']])if(s.completed.includes(mission)&&!s.skipped2140?.[mission])grant('achievements',id);
  if(['hammer','tentacle','maw','mantis','medusa'].every(id=>profile.cards[id]))grant('achievements','rift');
  for(const c of COMICS)if(!c.after||s.completed.includes(c.after))grant('comics',c.id);
  if(CARDS.every(c=>profile.cards[c.id]))grant('achievements','collector');
  if(COMICS.every(c=>profile.comics[c.id]))grant('achievements','reader');
 }
 function observe(e){if(!C.active(e)||C.state(e).practice||e.status==='menu')return;unlock(e);const s=campaign(e);
  if(s.modal?.type==='afterparallax')s.modal=null;
  if(s.modal||['lesson','remark','finalcheck','campaigncard','campaignsource','lost','crashing'].includes(e.status))return;
  const next=COMICS.find(c=>(!c.after||s.completed.includes(c.after))&&!s.story2170.seen[c.id]);
  if(next){setView(e,{type:'comic2170',id:next.id,page:0,replay:false});C.save(e,true);ARCADE.overlayToken='';}
 }
 p.start=function(){const r=old.start.apply(this,arguments);menuView=null;if(C.active(this)){campaign(this,true);CITADEL_STORY.close(this,false);observe(this);}return r;};
 p.step=function(){if(owned(view(this)))return;const r=old.step.apply(this,arguments);observe(this);return r;};
 cupUnpack=function(){const e=old.unpack.apply(this,arguments);if(C.active(e)){campaign(e);unlock(e);}return e;};
 function nav(){return '<nav class="nav2170">'+btn('campaign-document','Документ')+btn('collection2170-open','Коллекция','cards')+btn('collection2170-open','Комиксы','comics')+'</nav>';}
 function lobby(){warmImage(COMICS[0].src,'high');const mode=L.preferred,saved=C.read(mode),canContinue=saved&&saved.engine.status!=='won';

  return '<section class="menu2170 menu2173 menu2175" aria-label="Цитадель ЦСИИ — главное меню"><header class="menu2175-title"><div class="menu2173-kicker">Космическая сага · 15 глав</div><h3>ЦИТАДЕЛЬ<span>ЦСИИ</span></h3><p class="menu2173-tagline">Проведи экспедицию сквозь хаос замечаний.</p></header><div class="menu2173-art"><picture><source media="(max-width: 700px) and (min-height: 740px)" srcset="./assets/scene2175/portrait-small.webp 400w, ./assets/scene2175/portrait.webp 640w" sizes="70vw"><img class="menu2173-scene" src="./assets/scene2173/characters-r2.webp" srcset="./assets/scene2173/characters-small-r2.webp 640w, ./assets/scene2173/characters-r2.webp 1280w" sizes="(max-width: 700px) 100vw, 65vw" width="1280" height="853" loading="eager" fetchpriority="high" decoding="async" alt="Аналитик с голограммой, мех, кибердоберман и ниндзя; над Цитаделью летит истребитель"></picture></div><div class="menu2173-controls"><div class="menu2170-modes" role="group" aria-label="Режим игры">'+L.modes.map(m=>btn('learning-mode',m==='pro'?'Кейсы':L.labels[m],m,'aria-pressed="'+(m===mode)+'"')).join('')+'</div><p class="menu2173-mode-description">'+({training:'Спокойный бой и вопросы с подсказками.',combat:'Полный бой и короткие вопросы.',pro:'Полный бой и профессиональные задачи.'}[mode])+'</p><div class="menu2170-play">'+(canContinue?btn('campaign-continue','Продолжить →',mode,'class="menu2170-primary"'):'')+btn(mode==='pro'?'launch-new':'learning-start',canContinue?'Новая игра':'Начать игру →','','class="'+(canContinue?'':'menu2170-primary')+'"')+'</div><nav class="menu2170-nav">'+btn('collection2170-open','Коллекция','cards')+btn('collection2170-open','Комиксы','comics')+'<details><summary>Ещё</summary><div>'+btn('collection2170-open','Достижения','achievements')+btn('collection2170-legacy','Рекорды и сохранения')+'<a href="./academy.html" target="_blank" rel="noopener">Академия ↗</a><button type="button" data-metrics-settings aria-controls="atlas-metrics-consent" aria-expanded="false">Статистика посещений</button></div></details></nav></div></section>';
 }

 function gallery(v){const tab=v.tab||'cards',items=tab==='comics'?COMICS:CARDS,open=items.filter(x=>profile[tab]?.[x.id]).length,page=Math.max(0,Math.min(Math.ceil(items.length/6)-1,v.page||0));
  const visible=items.slice(page*6,page*6+6),firstVisible=visible.find(x=>profile[tab]?.[x.id]);
  const header='<header><div><h3>'+(tab==='comics'?'Комиксы':tab==='achievements'?'Достижения':'Коллекция')+'</h3>'+(tab!=='achievements'?'<p>'+open+' / '+items.length+' открыто</p>':'')+'</div>'+btn('collection2170-close','Закрыть')+'</header>';
  const tabs='<nav class="collection2170-tabs" aria-label="Раздел коллекции">'+[['cards','Персонажи'],['comics','Комиксы'],['achievements','Достижения']].map(([id,t])=>btn('collection2170-tab',t,id,'aria-pressed="'+(tab===id)+'"')).join('')+'</nav>';
  if(tab==='achievements')return '<section class="collection2170">'+header+tabs+'<div class="collection2170-achievements">'+ACHIEVEMENTS.map(a=>'<article class="'+(profile.achievements[a.id]?'earned':'')+'"><h4>'+(profile.achievements[a.id]?'✓ ':'◇ ')+a.title+'</h4><p>'+a.hint+'</p></article>').join('')+'</div></section>';
  return '<section class="collection2170">'+header+tabs+'<div class="collection2170-grid '+(tab==='comics'?'collection2170-comics':'')+'">'+visible.map(x=>btn(tab==='comics'?'collection2170-comic':'collection2170-art',(profile[tab][x.id]?'<img src="'+x.thumb+'" alt="'+x.title+'" decoding="async" loading="'+(x===firstVisible?'eager':'lazy')+'"'+(x===firstVisible?' fetchpriority="high"':'')+(tab==='cards'?' width="1024" height="1536"':'')+'>':'<div class="collection2170-lock" aria-hidden="true">◇</div>')+'<span>'+x.title+(!profile[tab][x.id]?'<small>'+(tab==='comics'?(x.after?'После главы «'+C.title(x.after)+'»':'Начать кампанию'):x.hint)+'</small>':'')+'</span>',x.id,profile[tab][x.id]?'':'disabled')).join('')+'</div><nav class="collection2170-pager">'+btn('collection2170-page','←',page-1,page===0?'disabled aria-label="Предыдущая страница"':'aria-label="Предыдущая страница"')+'<span>'+(page+1)+' / '+Math.ceil(items.length/6)+'</span>'+btn('collection2170-page','→',page+1,page>=Math.ceil(items.length/6)-1?'disabled aria-label="Следующая страница"':'aria-label="Следующая страница"')+'</nav></section>';
 }
 function art(v){const card=CARDS.find(c=>c.id===(v.id||v.kind))||CARDS[0],known=profile.cards[card.id];if(known){warmImage(card.src,'high');warmNextArt(card);}return '<section class="collection2170"><header><h3>'+card.title+'</h3>'+btn('collection2170-close','Закрыть')+'</header><div class="collection2170-art">'+(known?'<img src="'+card.src+'" alt="'+card.title+' — коллекционная карточка" width="1024" height="1536" loading="eager" decoding="async" fetchpriority="high">':'')+'<aside><p class="collection2170-notice">'+(v.automatic2140?'Открыт новый персонаж':known?'Карточка открыта':card.hint)+'</p>'+(known?imageNotice(card.src):'')+'<nav>'+btn('collection2170-art-prev','←',card.id,'aria-label="Предыдущий персонаж"')+btn('collection2170-tab','В коллекцию','cards')+btn('collection2170-art-next','→',card.id,'aria-label="Следующий персонаж"')+'</nav></aside></div></section>';}
 function comic(v){const c=COMICS.find(c=>c.id===v.id)||COMICS[0],page=Math.max(0,Math.min(3,v.page||0));warmImage(c.src,'high');return '<section class="comic2170" role="dialog" aria-modal="true" aria-labelledby="comic2170-title"><header><h3 id="comic2170-title">'+c.title+'</h3>'+btn('collection2170-close',v.replay?'Закрыть':'Пропустить')+'</header><div class="comic2170-body"><div class="comic2170-picture" role="img" aria-label="'+esc(c.captions[page])+'" style="position:relative;display:grid;place-items:center;background-image:url('+c.src+');background-position:'+(page%2*100)+'% '+(Math.floor(page/2)*100)+'%">'+imageNotice(c.src)+'</div><div class="comic2170-copy"><p>'+esc(c.captions[page])+'</p><nav>'+btn('collection2170-comic-back','←','',page===0?'disabled aria-label="Предыдущий кадр"':'aria-label="Предыдущий кадр"')+'<span>'+(page+1)+' / 4</span>'+btn('collection2170-comic-next',page===3?(v.replay?'В комиксы':'Продолжить'):'Дальше →')+'</nav></div></div></section>';}
 function close(e){const v=view(e);if(!owned(v))return;
  if(v.type==='comic2170'&&!v.replay&&C.active(e))campaign(e).story2170.seen[v.id]=true;
  setView(e,v.type==='comic2170'&&v.replay?{type:'collection2170',tab:'comics',page:v.galleryPage||0}:null);observe(e);refresh(e);ARCADE.canvas?.focus?.({preventScroll:true});
 }
 arcadeOverlayHTML=function(){const e=ARCADE.engine,v=view(e);
  if(owned(v))return v.type==='comic2170'?comic(v):v.type==='collection2170'?gallery(v):art(v);
  if(e?.status==='menu'&&!menuView&&!(typeof CUP!=='undefined'&&CUP.panel)&&!CITADEL_STORY.status(e).active)return lobby();
  let html=old.overlay.apply(this,arguments);
  if(e?.status==='menu'&&menuView?.type==='legacy2170')return html+'<nav class="nav2170">'+btn('collection2170-home','← В меню')+'</nav>';
  if(C.active(e)&&!C.state(e).modal){
   if(e.status==='campaignroute')return '<section class="menu2170"><h3>Выбери маршрут</h3><p>Два пути к рою. Один пакет уточнений.</p><div class="menu2170-play">'+btn('campaign-route','Защитить конвой','convoy')+btn('campaign-route','Погоня за ФЗ','pursuit')+'</div></section>';
   html=html.replace(/<div class="campaign-intermission">[\s\S]*?<\/div>/,nav());
   html=html.replace(/<button\b[^>]*data-action="campaign-bestiary"[^>]*>[\s\S]*?<\/button>/g,btn('collection2170-open','Коллекция','cards')+btn('collection2170-open','Комиксы','comics'));
   if(['paused','stageclear'].includes(e.status)&&!html.includes('data-action="collection2170-open"'))html+=nav();
  }return html;
 };
 updateArcadeOverlay=function(){const r=old.update.apply(this,arguments),e=ARCADE.engine,el=document.getElementById('arcade-overlay');el?.classList.toggle('collection2170-open',!!owned(view(e)));el?.classList.toggle('menu2170-open',e?.status==='menu'&&!view(e)&&!(typeof CUP!=='undefined'&&CUP.panel)||e?.status==='campaignroute');if(owned(view(e))&&el)el.hidden=false;return r;};
 arcadeAction=function(action,value){const e=ARCADE.engine,v=view(e);
  if(action==='collection2170-legacy'){menuView={type:'legacy2170'};refresh(e,false);return true;}
  if(action==='collection2170-home'){menuView=null;refresh(e,false);return true;}
  if(action==='collection2170-open'||action==='campaign-bestiary'){
   if(C.active(e)&&!['paused','briefing','escortbrief','finalebrief','stageclear','escortclear','won','campaignsummary'].includes(e.status))return true;
   setView(e,{type:'collection2170',tab:value==='comics'?'comics':value==='achievements'?'achievements':'cards',page:0});refresh(e);return true;
  }
  if(owned(v)){
   if(action==='collection2172-retry'&&value===sourceFor(v)){warmImage(value,'high',true);refresh(e,false);return true;}
   if(action==='collection2170-close'||action==='campaign-modal-close'){close(e);return true;}
   if(action==='collection2170-tab'){setView(e,{type:'collection2170',tab:['cards','comics','achievements'].includes(value)?value:'cards',page:0});refresh(e);return true;}
   if(action==='collection2170-page'&&v.type==='collection2170'){const count=v.tab==='comics'?COMICS.length:CARDS.length;v.page=Math.max(0,Math.min(Math.ceil(count/6)-1,Number(value)||0));refresh(e);return true;}
   if(action==='collection2170-art'&&profile.cards[value]){setView(e,{type:'art2170',id:value});refresh(e);return true;}
   if(action==='collection2170-art-prev'||action==='collection2170-art-next'){const unlocked=CARDS.filter(c=>profile.cards[c.id]),index=unlocked.findIndex(c=>c.id===value);if(unlocked.length)setView(e,{type:'art2170',id:unlocked[(index+(action.endsWith('prev')?-1:1)+unlocked.length)%unlocked.length].id});refresh(e);return true;}
   if(action==='collection2170-comic'&&profile.comics[value]){setView(e,{type:'comic2170',id:value,page:0,replay:true,galleryPage:v.page||0});refresh(e);return true;}
   if(action==='collection2170-comic-next'&&v.type==='comic2170'){if(v.page===3)close(e);else{v.page++;refresh(e);}return true;}
   if(action==='collection2170-comic-back'&&v.type==='comic2170'){v.page=Math.max(0,v.page-1);refresh(e);return true;}
   if(['arcade-resume','arcade-pause','citadel-pause','citadel-launch','finale-launch','resonator-start','campaign-summary-next'].includes(action))return true;
  }
  if(action==='arcade-menu'||action==='learning-mode')menuView=null;
  const r=old.action.apply(this,arguments);observe(ARCADE.engine);if(owned(view(ARCADE.engine)))refresh(ARCADE.engine);return r;
 };
 globalThis.addEventListener?.('keydown',event=>{const e=ARCADE.engine,v=view(e);if(!owned(v)||event.repeat||event.target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(e);}
  else if(v.type==='comic2170'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();arcadeAction(event.key==='ArrowRight'?'collection2170-comic-next':'collection2170-comic-back');}
 },true);
 globalThis.CITADEL_COLLECTION=Object.freeze({version:'2.17.3',cards:CARDS,comics:COMICS,achievements:ACHIEVEMENTS,view,observe,unlock,profile:()=>JSON.parse(JSON.stringify(profile)),storageKey:KEY});
})();
