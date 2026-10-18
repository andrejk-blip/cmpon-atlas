/* Citadel 1.9.0 — prologue and the captain's changing bridge.
 * Narrative UI is transient. It never writes campaign progress or records.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_STORY?.version === '1.9.0' || typeof RequirementArcade !== 'function') return;
  const VERSION = '1.9.0', prologues = new WeakMap();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pages = Object.freeze([
    Object.freeze({tag:'ФТ ГОТОВЫ!',title:'Всё начинается в Цитадели',text:'Команда ЦСИИ подготовила функциональные требования. Проверила формулировки, собрала пакет и уже видит, как всё заработает.',accent:'Осталось только согласовать. Казалось бы…',box:'0 0 627 573',alt:'Аналитики завершают пакет требований на фоне орбитальной Цитадели.'}),
    Object.freeze({tag:'ФЗ УХОДИТ СО СВЯЗИ!',title:'Но согласование — отдельная миссия',text:'Функциональный заказчик — ФЗ — уходит от связи. Нужно догнать его, собрать уточнения и довести требования до согласования.',accent:'Держи связь. Требования сами себя не соберут.',box:'627 0 627 573',alt:'Корабль ФЗ уходит между астероидами, аналитик следует за ним.'}),
    Object.freeze({tag:'МРГ УЖЕ ЖДЁТ!',title:'Запустить пакет будет непросто',text:'МРГ не даст так просто передать ФТ в работу. Его солдаты уже вышли из логова: впереди засады, ракетчики, ниндзя и робособаки.',accent:'На поздних палубах жди подкрепления. Даже за спиной.',box:'0 574 627 680',alt:'Живой компьютер МРГ отправляет солдат, ниндзя и робособак остановить аналитика.'}),
    Object.freeze({tag:'ТВОЯ ОЧЕРЕДЬ, АНАЛИТИК!',title:'Вся надежда на тебя',text:'Сможешь ли ты собрать уточнения, защитить решения и запустить функциональные требования в работу? Капитан на связи. Цитадель рассчитывает на тебя.',accent:'Пора вылетать. Без ТЗ — и результат ХЗ.',box:'627 574 627 680',alt:'Аналитик берётся за штурвал корабля и готовится выполнить миссию.'}),
  ]);
  const art = Object.freeze({
    calm: typeof CITADEL_CAPTAIN_SHEET === 'string' ? CITADEL_CAPTAIN_SHEET : '',
    worried:'./assets/citadel-captain-worried-v1.9.0.webp',
    crisis:'./assets/citadel-captain-crisis-v1.9.0.webp',
  });
  const captions = {calm:'КАНАЛ СТАБИЛЕН',worried:'ТРЕВОГА В РУБКЕ',crisis:'РУБКА ПОД УДАРОМ'};
  const loaded = new Set(['calm']), loading = new Map(), failed = new Set();
  let lastNoise = -Infinity;
  function level(e) {
    if (!e) return 1;
    if (e.finale) return ['mrg','upload','victory'].includes(e.finale.phase) ? 14 : e.finale.phase === 'maze' || e.finale.phase === 'landing' ? 13 : 12;
    return Math.min(11, Math.max(1, (Number(e.stage) || 0) * 3 + (e.escort || e.phase === 'escort' ? 3 : e.board && ['boarding','remark','paused'].includes(e.status) ? 2 : 1)));
  }
  function mood(e) { const n = level(e); return n >= 10 ? 'crisis' : n >= 5 ? 'worried' : 'calm'; }
  function active(e = ARCADE.engine) {
    const s = e && prologues.get(e);
    if (!s?.active || (typeof CUP !== 'undefined' && CUP.panel)) return null;
    if (s.preview) return ['menu','briefing','paused','finalebrief'].includes(e.status) ? s : null;
    return e.stage === 0 && !e.finale && e.status === 'briefing' ? s : null;
  }
  function blocked() {
    return document.hidden || (typeof MOBILE !== 'undefined' && (MOBILE.menu || MOBILE.command)) ||
      !!document.querySelector?.('dialog[open]');
  }
  function refresh() {
    ARCADE.overlayToken = '';
    if (typeof updateArcadeHUD === 'function') updateArcadeHUD();
    if (typeof updateArcadeOverlay === 'function') updateArcadeOverlay();
  }
  function open(e = ARCADE.engine, preview = true) {
    if (!e) return false;
    const s = {active:true,page:0,preview:!!preview,status:e.status,resumeStatus:e.resumeStatus};
    if (preview && !['menu','briefing','paused','finalebrief'].includes(e.status)) {
      e.pause();
      if (e.status !== 'paused') { e.resumeStatus = e.status; e.status = 'paused'; }
    }
    prologues.set(e,s);
    globalThis.CITADEL_VOICE?.stop('prologue');
    if (typeof clearArcadeInput === 'function') clearArcadeInput();
    refresh();
    document.querySelector?.('.prologue-nav [data-action="story-next"]')?.focus?.({preventScroll:true});
    return true;
  }
  function close(e = ARCADE.engine, launch = false) {
    const s = e && prologues.get(e);
    if (!s?.active) return false;
    s.active = false;
    if (s.preview) {
      const playing = ['playing','boarding','docking','crashing'].includes(s.status);
      if (blocked() && playing) { e.status='paused';e.resumeStatus=s.status; }
      else { e.status=s.status;e.resumeStatus=s.resumeStatus; }
    } else if (launch && e.status === 'briefing') e.launch();
    if (typeof clearArcadeInput === 'function') clearArcadeInput();
    refresh();
    ARCADE.canvas?.focus?.({preventScroll:true});
    return true;
  }
  function html(e = ARCADE.engine) {
    const s = active(e); if (!s) return '';
    const page = pages[s.page], last = s.page === pages.length - 1;
    const skip = s.preview ? 'Закрыть' : 'Пропустить';
    const next = last ? (s.preview ? 'Вернуться' : 'Начать операцию') : 'Дальше';
    return '<section class="citadel-prologue" role="dialog" aria-modal="true" aria-labelledby="prologue-title">'+
      '<div class="prologue-art"><svg viewBox="'+page.box+'" preserveAspectRatio="xMidYMid slice" role="img" aria-label="'+escape(page.alt)+'"><image href="./assets/citadel-prologue-v1.9.0.webp" x="0" y="0" width="1254" height="1254"/></svg><span>'+escape(page.tag)+'</span></div>'+
      '<div class="prologue-copy"><header class="prologue-topline"><span>ЦИТАДЕЛЬ ЦСИИ · ПРОЛОГ '+(s.page+1)+' / 4</span><button type="button" data-action="story-skip">'+skip+'</button></header>'+
      '<h3 id="prologue-title">'+escape(page.title)+'</h3><p>'+escape(page.text)+'</p><strong>'+escape(page.accent)+'</strong>'+
      '<nav class="prologue-nav" aria-label="Страницы вступления"><button type="button" data-action="story-back"'+(s.page===0?' disabled':'')+' aria-label="Предыдущая страница">←</button><div class="prologue-dots" aria-hidden="true">'+pages.map((_,i)=>'<i'+(i===s.page?' class="active"':'')+'></i>').join('')+'</div><button type="button" data-action="story-next">'+next+' →</button></nav></div></section>';
  }
  const proto = RequirementArcade.prototype, start = proto.start, launch = proto.launch, beginStage = proto.beginStage;
  proto.start = function () {
    const result = start.apply(this, arguments);
    if (this.stage === 0 && this.status === 'briefing') prologues.set(this,{active:true,page:0,preview:false,status:this.status,resumeStatus:this.resumeStatus});
    return result;
  };
  proto.launch = function () {
    const s=prologues.get(this);if(s)s.active=false;
    return launch.apply(this,arguments);
  };
  proto.beginStage = function () {
    const s=prologues.get(this);if(s)s.active=false;
    return beginStage.apply(this,arguments);
  };
  const originalOverlay = arcadeOverlayHTML;
  arcadeOverlayHTML = function () { return active() ? html() : originalOverlay.apply(this,arguments); };
  const originalUpdate = updateArcadeOverlay;
  updateArcadeOverlay = function () {
    const result=originalUpdate.apply(this,arguments),s=active(),overlay=document.getElementById('arcade-overlay');
    overlay?.classList.toggle('citadel-prologue-open',!!s);
    if(s&&overlay){overlay.hidden=false;overlay.classList.remove('review-open','citadel-readable');document.getElementById('arcade-touch')?.classList.remove('flight-active');}
    return result;
  };
  const action = arcadeAction;
  arcadeAction = function (name,value) {
    if (name === 'story-open') return open();
    if (!String(name).startsWith('story-')) {
      if (active() && ['arcade-resume','arcade-pause','citadel-launch'].includes(name)) return true;
      return action.apply(this,arguments);
    }
    const s=active();if(!s)return true;
    if(name==='story-skip')close();
    else if(name==='story-back'){s.page=Math.max(0,s.page-1);refresh();document.querySelector?.('.prologue-nav [data-action="story-next"]')?.focus?.({preventScroll:true});}
    else if(name==='story-next'){
      if(s.page===pages.length-1)close(ARCADE.engine,true);
      else{s.page++;refresh();document.querySelector?.('.prologue-nav [data-action="story-next"]')?.focus?.({preventScroll:true});}
    }
    return true;
  };
  const render = renderArcade;
  renderArcade = function () {
    return render.apply(this,arguments).replace('<div class="captain-photo">','<div class="captain-photo"><div class="captain-interference" id="captain-interference" aria-hidden="true"></div><div class="captain-condition" id="captain-condition"><span>КАНАЛ СТАБИЛЕН</span><b>01 / 14</b></div>');
  };
  function applyPortrait() {
    const e=ARCADE.engine,portrait=document.getElementById('captain-live'),card=document.getElementById('citadel-captain');
    if(!e||!portrait)return;
    const key=mood(e);
    if(card)card.dataset.campaignMood=key;
    if(loaded.has(key)) {
      if(portrait.dataset.campaignMood!==key){portrait.style.backgroundImage='url("'+art[key]+'")';portrait.dataset.campaignMood=key;}
    } else if(!loading.has(key)&&!failed.has(key)&&typeof Image==='function') {
      const img=new Image();loading.set(key,img);
      img.onload=()=>{loaded.add(key);loading.delete(key);if(ARCADE.engine&&mood(ARCADE.engine)===key)applyPortrait();};
      img.onerror=()=>{loading.delete(key);failed.add(key);};
      img.src=art[key];
    }
    const label=document.getElementById('captain-condition');
    if(label&&label.dataset.level!==String(level(e))){label.dataset.level=String(level(e));label.innerHTML='<span>'+captions[key]+'</span><b>'+String(level(e)).padStart(2,'0')+' / 14</b>';}
  }
  const animate = updateCaptainAnimation;
  updateCaptainAnimation = function (now) {
    const result=animate.apply(this,arguments);applyPortrait();
    const card=document.getElementById('citadel-captain'),e=ARCADE.engine;
    if(card&&e&&now-lastNoise>=90){
      lastNoise=now;
      const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      const live=ARCADE.fx&&!document.hidden&&!reduced&&['playing','boarding','docking'].includes(e.status);
      const key=mood(e),base=key==='crisis'?.2:key==='worried'?.1:.035;
      const burst=live&&Math.sin(now/1450)>.975?.11:0;
      card.style.setProperty('--captain-static',String(base+burst));
      card.style.setProperty('--captain-scan',live?Math.round(Math.sin(now/1700)*20)+'%':'0%');
    }
    return result;
  };
  const hud=updateArcadeHUD;
  updateArcadeHUD=function(){const result=hud.apply(this,arguments);applyPortrait();return result;};
  document.addEventListener('keydown',event=>{
    if(!active())return;
    if(blocked() || event.target?.closest?.('dialog[open]'))return;
    const inButton=event.target?.closest?.('.citadel-prologue button');
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(!inButton&&[' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();
    if(event.key!=='Tab')event.stopImmediatePropagation();
  },true);
  globalThis.CITADEL_STORY=Object.freeze({version:VERSION,pages,level,mood,open,close,html,
    status(e=ARCADE.engine){const s=active(e);return {version:VERSION,active:!!s,page:s?.page??null,preview:!!s?.preview,level:level(e),mood:mood(e),portraitLoaded:loaded.has(mood(e))};},
  });
}());
