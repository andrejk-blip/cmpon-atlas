/* Visible identity, existing cup services and personal award announcements.
 * No new score source, game loop, account store or ranked-save migration. */
(()=>{
 'use strict';if(globalThis.CITADEL_SOCIAL)return;
 const C=CITADEL_COLLECTION,old={overlay:arcadeOverlayHTML,update:updateArcadeHUD,action:arcadeAction,editing:cupEditingName};
 const button=(action,text,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+text+'</button>';
 const trophy='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v5m-5 2h10"/></svg>';
 function count(){return C.achievements.filter(a=>C.profile().achievements[a.id]).length;}
 let pendingStart=null;
 function homebar(){scheduleLeader();return '<div class="social2182-home">'+button('social2182-profile','<span class="social2182-avatar" aria-hidden="true">А</span><span><small>АНАЛИТИК</small><b>'+esc(CUP.player?.name||'Войти / имя')+'</b></span>')+button('social2182-records',trophy+'<span>Рейтинг</span>')+'</div>'+button('social2182-records',esc(leaderText()),'class="social2182-leader"');}
 function awardsButton(b){const n=C.pending().length;return b('collection2170-open','Достижения <small>'+count()+'/'+C.achievements.length+'</small>'+(n?'<i class="award2182-dot" aria-label="Новых: '+n+'">'+n+'</i>':''),'achievements','class="social2182-awards"');}
 function profileHTML(){const player=CUP.player;return '<section class="cup-panel social2182-panel" role="dialog" aria-modal="true" aria-labelledby="cup-panel-title"><header class="cup-panel-head"><div><small>ЛИЧНОЕ ДЕЛО</small><h3 id="cup-panel-title">'+(player?'Аналитик '+esc(player.name):'Как тебя записать?')+'</h3></div>'+button('cup-close','×','class="cup-close" aria-label="Закрыть"')+'</header><div class="social2182-body">'+(player?'<div class="social2182-pass"><img src="./assets/home2180/analyst-192.png" alt="" width="72" height="72"><div><b>'+esc(player.name)+'</b><p>Имя в общем рейтинге</p>'+button('cup-rename','Изменить имя')+'</div></div>':'<form id="social2182-form"><label for="social2182-name">Имя или позывной</label><input id="social2182-name" name="name" autocomplete="nickname" enterkeyhint="done" minlength="2" maxlength="32" required placeholder="Например, Андрей" value="'+attr(CUP.nameDraft||'')+'"><p>Это имя будет видно в общей таблице игроков.</p><button type="submit"'+(CUP.busy?' disabled':'')+'>'+(CUP.busy?'Сохраняем…':'Зарегистрироваться')+'</button></form>')+'<p id="cup-message" class="cup-message" role="status">'+esc(CUP.error)+'</p><div class="social2182-summary"><b>'+count()+' / '+C.achievements.length+' наград</b><span>'+C.cards.filter(a=>C.profile().cards[a.id]).length+' / '+C.cards.length+' персонажей</span><span>'+C.comics.filter(a=>C.profile().comics[a.id]).length+' / '+C.comics.length+' комиксов</span></div><p class="social2182-note">После каждой главы результат попадает в рейтинг. Имя запоминается в браузере; продолжение игры и коллекция — на этом устройстве.</p><div class="social2182-links">'+button('social2182-records',trophy+'Рейтинг')+button('social2182-achievements','Мои достижения')+'</div>'+'</div></section>';}
 function openProfile(){cupOpenPanel('identity2182');document.getElementById('social2182-name')?.focus({preventScroll:true});}
 // Preserve an unfinished name when config/profile refresh completes in the background.
 cupEditingName=function(){const input=document.activeElement;return input?.id==='social2182-name'&&CUP.panel==='identity2182'?input:old.editing();};
 document.addEventListener?.('input',ev=>{if(ev.target?.id==='social2182-name')CUP.nameDraft=ev.target.value;});
 async function register(name){
  if(CUP.busy)return false;name=String(name||'').trim();CUP.nameDraft=name;
  if(name.length<2||name.length>32){CUP.error='Имя должно содержать от 2 до 32 символов.';cupRefreshUI(true);return false;}
  CUP.busy=true;CUP.error='';cupRefreshUI(true);
  try{
   // Await any earlier device recovery before asking it to create a profile.
   if(CUP.authPromise)await CUP.authPromise;
   await cupEnsureProfile(name);
   if(!CUP.player)throw Error('Имя не сохранилось. Попробуйте ещё раз.');
   if(pendingStart){const [action,value]=pendingStart;pendingStart=null;cupClosePanel();arcadeAction(action,value);}
   return true;
  }catch(error){CUP.error=error.message||'Не удалось подключиться. Попробуйте ещё раз.';return false;}
  finally{CUP.busy=false;cupRefreshUI(true);}
 }
 document.addEventListener?.('submit',ev=>{if(ev.target?.id!=='social2182-form')return;ev.preventDefault();void register(new FormData(ev.target).get('name'));});
 const openPanel=cupOpenPanel;
 cupOpenPanel=function(kind='records'){if(kind==='records'){openPanel('rating2182');void refreshRanking();return;}return openPanel(kind);};
 arcadeOverlayHTML=function(){
  if(CUP.panel==='identity2182')return profileHTML();
  if(CUP.panel==='rating2182')return rankingHTML();
  return old.overlay.apply(this,arguments);
 };
 const starts=new Set(['learning-start','learning-continue','launch-new','campaign-continue','arcade-start','cup-play','cup-new','cup-guest','launch-local','launch-ranked']);
 arcadeAction=function(action,value){
  if(starts.has(action)&&!CUP.player){pendingStart=[action,value];openProfile();return true;}
  if(action==='social2182-profile'){pendingStart=null;openProfile();return true;}
  if(action==='social2182-records'||action==='cup-records'){rankMode=CITADEL_LEARNING_MODES.preferred;rankPage=0;cupOpenPanel();return true;}
  if(action==='social2182-mode'){if(['training','combat','pro','legacy'].includes(value)){rankMode=value;rankPage=0;void refreshRanking();}return true;}
  if(action==='social2182-refresh'){void refreshRanking(true);return true;}
  if(action==='social2182-page'){rankPage=Math.max(0,Number(value)||0);cupRefreshUI(true);return true;}
  if(action==='social2182-achievements'){cupClosePanel();return old.action('collection2170-open','achievements');}
  if(action==='social2182-dismiss'){dismiss();return true;}
  if(action==='cup-close')pendingStart=null;
  return old.action.apply(this,arguments);
 };
 const modeNames={training:'Учебный',combat:'Боевой',pro:'Кейсы',legacy:'Прежние рекорды'},cache=new Map();
 let rankMode=CITADEL_LEARNING_MODES.preferred,rankPage=0,rankError='',rankSerial=0,leaderRequested='',leaderError=false;
 const number=n=>Math.max(0,Math.floor(Number(n)||0)).toLocaleString('ru-RU');
 function leader(){const mode=CITADEL_LEARNING_MODES.preferred,d=cache.get(mode),winner=d?.rows.find(r=>r.has_result);if(winner)return {...winner,legacy:false};const earlier=cache.get('legacy')?.rows.find(r=>r.has_result);return earlier?{...earlier,legacy:true}:null;}
 function leaderText(){const r=leader();return r?(r.legacy?'Прежний рекорд: ':'Лидер · 1 место: ')+r.name+' · '+number(r.score)+' очков · '+r.progress+'/'+(r.legacy?14:15):leaderError?'Рейтинг временно недоступен · повторить':!cache.has(CITADEL_LEARNING_MODES.preferred)?'Подключаем рейтинг…':'Рейтинг: пройди главу и займи первое место';}
 function paintLeader(){const el=document.querySelector?.('.social2182-leader');if(el){el.textContent=leaderText();el.title=leaderText();}}
 async function fetchRank(mode,force=false){const cached=cache.get(mode);if(!force&&cached&&Date.now()-cached.at<60000)return cached;const d=await cupAPI('ranking?mode='+encodeURIComponent(mode));if(!Array.isArray(d.rows))throw Error('Не удалось прочитать рейтинг.');const item={...d,at:Date.now()};cache.set(mode,item);leaderError=false;paintLeader();return item;}
 function scheduleLeader(){const mode=CITADEL_LEARNING_MODES.preferred;if(globalThis.CITADEL_TEST_MEMORY_ONLY||leaderRequested===mode&&cache.get(mode)&&Date.now()-cache.get(mode).at<60000)return;if(leaderRequested===mode&&!cache.get(mode))return;leaderRequested=mode;Promise.resolve().then(async()=>{try{const d=await fetchRank(mode);if(!d.rows.some(r=>r.has_result))await fetchRank('legacy');}catch{leaderError=true;leaderRequested='';paintLeader();}});}
 async function refreshRanking(force=false){const serial=++rankSerial;rankError='';cupRefreshUI(true);try{await fetchRank(rankMode,force);}catch(e){if(serial===rankSerial)rankError=e.message||'Рейтинг временно недоступен.';}if(serial===rankSerial)cupRefreshUI(true);}
 function rankingHTML(){const data=cache.get(rankMode),rows=data?.rows||[],pages=Math.max(1,Math.ceil(rows.length/10));rankPage=Math.min(rankPage,pages-1);const shown=rows.slice(rankPage*10,rankPage*10+10);return '<section class="cup-panel rating2182-panel" role="dialog" aria-modal="true" aria-labelledby="cup-panel-title"><header class="cup-panel-head"><div><small>ЦИТАДЕЛЬ ТРЕБОВАНИЙ</small><h3 id="cup-panel-title">Рейтинг игроков</h3></div>'+button('cup-close','×','class="cup-close" aria-label="Закрыть"')+'</header><nav class="rating2182-modes" aria-label="Режим рейтинга">'+Object.entries(modeNames).map(([id,title])=>button('social2182-mode',title,'data-value="'+id+'" aria-pressed="'+(id===rankMode)+'"')).join('')+'</nav><div class="rating2182-identity">'+button('social2182-profile',esc(CUP.player?.name||'Войти по имени'))+button('social2182-refresh','↻ Обновить')+'</div><p class="rating2182-explanation">'+(rankMode==='legacy'?'Сохранённые результаты прежней кампании · 14 этапов.':'Экспедиция · 15 глав. Пропущенные главы не засчитываются.')+'</p><div class="rating2182-table">'+(rankError?'<p role="status">'+esc(rankError)+'</p>':!data?'<p role="status">Загружаем рейтинг…</p>':!rows.length?'<p>Игроков пока нет. Введи имя и стань первым!</p>':'<table><thead><tr><th>№</th><th>Игрок</th><th>Главы</th><th>Очки</th></tr></thead><tbody>'+shown.map(r=>'<tr class="'+(r.player_id===CUP.player?.id?'is-you':'')+'"><td>'+number(r.rank)+'</td><th scope="row">'+esc(r.name)+(r.player_id===CUP.player?.id?'<small> · ты</small>':'')+'</th><td>'+r.progress+'/'+data.chapters+'</td><td>'+number(r.score)+'</td></tr>').join('')+'</tbody></table>')+'</div><footer><small>Место: пройденные главы → очки → время.<br>Лучший результат каждого игрока.</small>'+(pages>1?'<nav>'+button('social2182-page','←','data-value="'+(rankPage-1)+'"'+(!rankPage?' disabled':''))+'<span>'+(rankPage+1)+'/'+pages+'</span>'+button('social2182-page','→','data-value="'+(rankPage+1)+'"'+(rankPage===pages-1?' disabled':''))+'</nav>':'')+'</footer></section>';}
 let toast=null,current=null,last=0,visibleTime=0;
 function dismiss(){if(current)C.acknowledge([current.id]);current=null;visibleTime=0;if(toast)toast.hidden=true;}
 function tick(){
  const now=performance.now(),delta=Math.max(0,Math.min(250,now-last));last=now;
  const e=ARCADE.engine,overlay=document.getElementById('arcade-overlay');
  const visible=STATE.view==='arcade'&&!document.hidden&&!CUP.panel&&e&&!['menu','paused','lost','crashing'].includes(e.status)&&overlay?.hidden;
  if(current&&!C.pending().some(a=>a.id===current.id)){current=null;visibleTime=0;}
  if(!visible){if(toast)toast.hidden=true;return;}
  if(!current){current=C.pending()[0];visibleTime=0;if(!current)return;
   if(!toast){toast=document.createElement('aside');toast.id='award2182-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.getElementById('arcade-screen')?.append(toast);}
   toast.innerHTML='<span class="award2182-medal" aria-hidden="true">★</span><div><small>ДОСТИЖЕНИЕ ОТКРЫТО!</small><b>'+esc(current.title)+'</b><span>'+esc(current.hint)+'</span></div>'+button('social2182-dismiss','×','aria-label="Закрыть уведомление о достижении"');
  }
  toast.hidden=false;visibleTime+=delta;if(visibleTime>=6500)dismiss();
 }
 updateArcadeHUD=function(){const r=old.update.apply(this,arguments);tick();return r;};
 globalThis.CITADEL_SOCIAL=Object.freeze({version:'2.18.2',homebar,awardsButton,profileHTML,rankingHTML,register,refreshRanking,leaderText,tick});
})();
