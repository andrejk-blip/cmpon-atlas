/* Viewport-sized intermissions. Pagination changes only the visible DOM:
 * answers, rewards, campaign state and existing action handlers stay authoritative. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_VIEWPORT_FIT)return;
 const old={overlay:arcadeOverlayHTML,update:updateArcadeOverlay},states=new WeakMap(),briefs=new WeakMap();
 const containers='.campaign-panel,.arcade-state-card,.campaign-intermission,.skip-offer,.quiz2170,.quiz2170-choices,.quiz2170-result,.quiz2170-prompt,.campaign-choices,.xp-desk,.xp-grid,.xp-document-grid,.collection2170,.collection2170-grid,.collection2170-achievements,.collection2170-art,.comic2170,.comic2170-body,.comic2170-copy,.resonator-intro2160,.resonator-sources2160,.mission-check,.mission-check-layout,.mission-check-options,.review-card,.review-choices,.citadel-prologue,.prologue-copy,.xp-interlude,.xp-interlude-copy,.fit2175-text,details[open]';
 let current=null,pending=false;
 function eligible(html){return typeof html==='string'&&html.trim()&&!/class="[^"]*\bmenu217[035]\b/.test(html);}
 function wrap(html){return eligible(html)?'<div class="fit2175-shell"><div class="fit2175-content">'+html+'</div><nav class="fit2175-pager" aria-label="Страницы окна" hidden><button type="button" data-fit2175-page="-1">← Назад</button><span aria-live="polite"></span><button type="button" data-fit2175-page="1">Далее →</button></nav></div>':html;}
 arcadeOverlayHTML=function(){return wrap(old.overlay.apply(this,arguments));};
 function textParts(text,limit=420){const parts=[];let part='';for(const word of String(text).match(/\S+\s*|\s+/g)||[]){if(part.length+word.length>limit&&part){parts.push(part);part='';}part+=word;}if(part)parts.push(part);return parts;}
 const escapeText=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function briefCopy(status,mission){
  if(status==='escortbrief')return{goal:'Доставьте минимум два транспорта. Перехватывайте торпеды и проходите через светлые кольца.',rules:[['Прикрывайте конвой','Ракеты — против тяжёлых целей. Прикрытие — против залпа.'],['Следите за проходом','Светлое кольцо безопасно. Красное поле наносит урон.']]};
  if(mission==='pursuit'||mission==='route')return{goal:'Держитесь в канале связи с ФЗ и передайте три пакета уточнений.',rules:[['Возвращайтесь в канал','После уклонения снова сблизьтесь с кораблём ФЗ.'],['Обходите опасности','Щупальца, обломки и закрытая часть ворот наносят урон.']]};
  if(mission==='parallax')return{goal:'Отключите четыре маяка живой крепости, затем разрушьте центральный кристалл.',rules:[['Сначала маяки','Маневрируйте вокруг крепости и стреляйте по открытым целям.'],['Берегите щит','Уходите из полосы замаха. Ракеты ускоряют бой.']]};
  if(status==='finalebrief')return{goal:'Пройдите последний рубеж и передайте согласованный пакет ФТ на исполнение.',rules:[['Следуйте цели этапа','Контрольные точки сохраняют пройденные участки.'],['Используйте арсенал','Ракеты — тяжёлым целям, импульс — близким снарядам.']]};
  return{goal:'Соберите три зелёных модуля ФТ и перехватите замечания. Автокурс поможет выйти к первой цели.',rules:[['Зелёный модуль — забрать','Подлетите ближе: сбор произойдёт автоматически.'],['Красная цель — перехватить','Огонь и ракеты устраняют угрозу. Импульс защищает щит.']]};
 }
 function compactBrief(shell,content){
  const e=globalThis.ARCADE?.engine||(typeof ARCADE!=='undefined'?ARCADE.engine:null);
  if(!e||!['briefing','escortbrief','finalebrief'].includes(e.status)||briefs.has(shell)||content.querySelector('.citadel-prologue'))return;
  const panel=content.querySelector('.arcade-state-card.briefing,.arcade-state-card.finale-brief'),launch=panel?.querySelector('[data-action="citadel-launch"],[data-action="finale-launch"]');if(!panel||!launch)return;
  const C=globalThis.CITADEL_CAMPAIGN,mission=C?.active(e)?C.mission(e):'',copy=briefCopy(e.status,mission),summary=document.createElement('section');summary.className='fit2175-brief';
  const headingNode=panel.querySelector('h3')?.cloneNode(true);headingNode?.querySelectorAll('br').forEach(br=>br.replaceWith(' '));
  const heading=headingNode?.textContent?.replace(/\s+/g,' ').trim()||'Задание на вылет';
  summary.innerHTML='<small>ИНСТРУКТАЖ · '+escapeText(C?.active(e)?C.title(mission):'ЦИТАДЕЛЬ')+'</small><h3>'+escapeText(heading)+'</h3><p class="fit2175-brief-goal">'+escapeText(copy.goal)+'</p><div class="fit2175-brief-rules">'+copy.rules.map(([title,text])=>'<div><b>'+escapeText(title)+'</b><span>'+escapeText(text)+'</span></div>').join('')+'</div>';
  const launchCopy=launch.cloneNode(true);launchCopy.classList.add('fit2175-launch');summary.append(launchCopy);
  const links=document.createElement('nav');links.className='fit2175-brief-links';links.setAttribute('aria-label','Материалы главы');
  for(const b of content.querySelectorAll('.campaign-intermission button'))links.append(b.cloneNode(true));
  const help=document.createElement('button');help.type='button';help.dataset.fit2175Help='open';help.textContent='Подробности';links.append(help);summary.append(links);
  const original=document.createDocumentFragment();while(content.firstChild)original.append(content.firstChild);content.append(summary);
  briefs.set(shell,{original,summary,helpbar:null,inHelp:false});
 }
 function nodes(content){
  const units=[],groups=[];
  function visit(el){
   // A long source paragraph can itself exceed a phone. Split only plain text;
   // the words and original paragraph remain intact, with no stateful controls cloned.
   if(el.matches('p')&&!el.children.length&&el.textContent.length>500){
    const parts=textParts(el.textContent);el.textContent='';el.classList.add('fit2175-text');
    for(const part of parts){const span=document.createElement('span');span.className='fit2175-text-part';span.textContent=part;el.append(span);}
    groups.push(el);Array.from(el.children).forEach(child=>units.push(child));return;
   }
   // Map, illustrated page and indivisible controls keep their own layout.
   if(el.matches('.map2174-screen,.collection2170-art,.prologue-art,button,a,input,select,textarea,svg,img,figure,details:not([open])')){units.push(el);return;}
   if(el.matches(containers)&&el.children.length){groups.push(el);Array.from(el.children).forEach(visit);}else units.push(el);
  }
  Array.from(content.children).forEach(visit);return{units,groups};
 }
 function visible(state,list){
  const selected=new Set(list);
  state.units.forEach(el=>el.toggleAttribute('data-fit2175-hidden',!selected.has(el)));
  // Empty containers otherwise retain their padding/margins and create blank pages.
  for(let i=state.groups.length-1;i>=0;i--){const group=state.groups[i];group.toggleAttribute('data-fit2175-hidden',!list.some(el=>group.contains(el)));}
 }
 function fits(content){return content.scrollHeight<=content.clientHeight+1&&content.scrollWidth<=content.clientWidth+1;}
 function makePages(units,test){
  const pages=[];let page=[];
  for(const unit of units){const candidate=page.concat(unit);if(page.length&&!test(candidate)){pages.push(page);page=[unit];}else page=candidate;}
  if(page.length)pages.push(page);return pages;
 }
 function show(state,index,focus=false){
  state.index=Math.max(0,Math.min(state.pages.length-1,index));visible(state,state.pages[state.index]||state.units);
  const nav=state.nav,buttons=nav.querySelectorAll('button');nav.hidden=state.pages.length<2;
  buttons[0].disabled=state.index===0;buttons[1].disabled=state.index===state.pages.length-1;
  nav.querySelector('span').textContent=(state.index+1)+' / '+state.pages.length;
  state.shell.dataset.page=String(state.index+1);state.shell.dataset.pages=String(state.pages.length);
  state.content.scrollTop=0;state.content.scrollLeft=0;
  if(focus)(buttons[1].disabled?buttons[0]:buttons[1]).focus({preventScroll:true});
 }
 function fit(force=false){
  const overlay=document.getElementById('arcade-overlay'),shell=overlay?.querySelector('.fit2175-shell');
  overlay?.classList.toggle('fit2175-open',!!shell);
  if(!shell||overlay.hidden){current=null;return;}
  // HUD refreshes call this frequently. Dimensions are read only for a new
  // overlay or an explicit resize/font/image/content event, never per frame.
  if(!force&&shell===current)return;
  const height=Math.floor(shell.clientHeight);
  current=shell;shell.style.setProperty('--fit2175-height',height+'px');
  const content=shell.querySelector('.fit2175-content'),nav=shell.querySelector('.fit2175-pager');compactBrief(shell,content);
  let state=states.get(shell);if(!state){state={shell,content,nav,...nodes(content),index:0,pages:[]};states.set(shell,state);}else if(force){visible(state,state.units);Object.assign(state,nodes(content));}
  visible(state,state.units);nav.hidden=true;shell.classList.remove('fit2175-paginated');
  if(fits(content)){state.pages=[state.units];show(state,0);return;}
  // Reserve the real navigation height before measuring page contents.
  nav.hidden=false;shell.classList.add('fit2175-paginated');
  state.pages=makePages(state.units,list=>{visible(state,list);return fits(content);});
  // Open answer feedback directly, retaining prior question/choices on earlier pages.
  const feedback=state.units.find(el=>el.closest('.quiz2170-result'));
  const target=feedback?state.pages.findIndex(page=>page.includes(feedback)):state.index;
  show(state,target<0?0:target);
 }
 updateArcadeOverlay=function(){const r=old.update.apply(this,arguments);fit();return r;};
 function schedule(){if(pending)return;pending=true;setTimeout(()=>{pending=false;fit(true);},0);}
 document.addEventListener?.('click',event=>{
  const help=event.target?.closest?.('[data-fit2175-help]');if(help){
   const shell=help.closest('.fit2175-shell'),brief=briefs.get(shell),content=shell?.querySelector('.fit2175-content');if(!brief||!content)return;
   event.preventDefault();event.stopPropagation();
   if(help.dataset.fit2175Help==='open'){
    brief.summary.remove();content.append(brief.original);brief.inHelp=true;
    const bar=document.createElement('div');bar.className='fit2175-helpbar';bar.innerHTML='<button type="button" data-fit2175-help="close">← К заданию</button><span>Полный инструктаж</span>';shell.prepend(bar);brief.helpbar=bar;
   }else{while(content.firstChild)brief.original.append(content.firstChild);content.append(brief.summary);brief.helpbar?.remove();brief.helpbar=null;brief.inHelp=false;}
   states.delete(shell);current=null;fit(true);return;
  }
  const b=event.target?.closest?.('[data-fit2175-page]');if(!b)return;
  const state=states.get(b.closest('.fit2175-shell'));if(!state)return;
  event.preventDefault();event.stopPropagation();show(state,state.index+Number(b.dataset.fit2175Page),true);
 });
 document.addEventListener?.('toggle',event=>{if(event.target?.closest?.('.fit2175-shell'))schedule();},true);
 document.addEventListener?.('load',event=>{if(event.target?.closest?.('.fit2175-shell'))schedule();},true);
 globalThis.addEventListener?.('resize',schedule);globalThis.visualViewport?.addEventListener?.('resize',schedule);
 document.fonts?.ready?.then(schedule);
 globalThis.CITADEL_VIEWPORT_FIT=Object.freeze({version:'2.17.5',eligible,wrap,textParts,briefCopy,makePages,fit});
})();
