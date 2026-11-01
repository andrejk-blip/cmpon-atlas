/* Citadel 2.13 — compact illustrated command desk, document atlas and interlude.
 * Presentation reads real upgrades/document values. Choices use existing APIs.
 * Comic modal pauses simulation; no independent timer, score or reward source. */
(() => {
 'use strict';
 if(globalThis.CITADEL_EXPERIENCE||!globalThis.CITADEL_CAMPAIGN)return;
 const C=CITADEL_CAMPAIGN,S=CITADEL_SKILLS,p=RequirementArcade.prototype;
 const old={overlay:arcadeOverlayHTML,update:updateArcadeOverlay,action:arcadeAction};
 const local=new WeakMap(),labels={goal:'Цель',scope:'Границы',terms:'Термины',links:'Связи',acceptance:'Приёмка'};
 const keys=Object.keys(labels),icons=['◎','⬡','≡','⇄','✓'];
 const ui=e=>{if(!local.has(e))local.set(e,{docTab:'map'});return local.get(e);};
 const button=(action,text,value='',disabled=false)=>'<button type="button" data-action="'+action+'" data-value="'+esc(value)+'"'+(disabled?' disabled':'')+'>'+text+'</button>';
 function art(index,cls=''){return '<span aria-hidden="true" class="xp-perk-art '+cls+'" style="background-position:'+[0,50,100][index%3]+'% '+(index<3?0:100)+'%"></span>';}
 function ranks(n,max=3){return '<span class="xp-ranks" aria-label="Уровень '+n+' из '+max+'">'+Array.from({length:max},(_,i)=>'<i class="'+(i<n?'on':'')+'"></i>').join('')+'</span>';}
 function skills(e){
  const s=S.status(e),kit=e.upgrades.baseKit260||{},clear=e.status==='stageclear';
  const names=['Наблюдательность','Приоритеты','Системность'];
  const skillRows=Object.entries(S.definitions).map(([id,d],i)=>{const n=S.rank(e,id),next=Math.min(3,n+1),available=s.points>0&&n<3;
   const effect=i===0?'Подбор +'+(next*.65).toFixed(2).replace('.',',')+' м · урон +'+next*12+'%':i===1?'Импульс −'+next*8+'% · стан +'+(next*.25).toFixed(2).replace('.',',')+' с':'Входящий урон −'+next*7+'%';
   return '<button class="xp-perk" data-action="analyst-skill" data-value="'+id+'" aria-label="'+names[i]+'. '+n+' из 3. '+esc(d.effect(next))+'"'+(!available?' disabled':'')+'>'+art(i)+'<b>'+names[i]+'</b>'+ranks(n)+'<span>'+effect+'</span><em>'+(n===3?'Максимум':available?'+1 · 1 очко':'Нет очков')+'</em></button>';
  });
  const shipRows=Object.entries(CITADEL_UPGRADES).map(([id,d],i)=>{const n=e.upgrades[id]||0,chosen=e.upgradeChoice===id;
   return '<button class="xp-perk ship" data-action="citadel-upgrade" data-value="'+id+'" aria-label="'+esc(d.title)+'. Уровень '+n+'. '+esc(d.text)+'"'+(!clear||e.upgradeChoice?' disabled':'')+'>'+art(i+3)+'<b>'+['Плазма','Щит корабля','Ракеты'][i]+'</b>'+ranks(n,4)+'<span>'+['Урон +25% · темп ↑','Урон по кораблю −20%','Ракеты +4 · урон +30%'][i]+'</span><em>'+(chosen?'✓ Установлено':clear&&!e.upgradeChoice?'+ Установить':'Уровень '+n)+'</em></button>';
  });
  return '<section class="xp-desk" aria-label="Вся прокачка на одном экране"><header><div><small>ЛИЧНОЕ ДЕЛО · АНАЛИТИК</small><h3>Прокачка</h3></div><strong>'+s.points+' <small>очк. навыков</small></strong></header><div class="xp-grid">'+skillRows.join('')+shipRows.join('')+'</div><div class="xp-equipment" aria-label="Оборудование баз"><span>ϟ Конденсатор '+(kit.capacitor||0)+'/5</span><span>⬡ Броня '+(kit.armor||0)+'/5</span><span>⋮ Триада '+(kit.parts||0)+'/5</span></div><p class="xp-hint">'+(clear?'Выберите модуль корабля. Навыки можно развить отдельно за очки.':'Навыки действуют на базах. Очки дают первый и третий терминалы.')+'</p><footer>'+button('campaign-document','Схема ФТ')+button('campaign-bestiary','Встречи')+button(clear?'arcade-next':'arcade-resume',clear?'Дальше →':'В игру →','',clear&&!e.upgradeChoice)+'</footer></section>';
 }
 function documentHTML(e){const s=C.state(e),ready=keys.filter(k=>s.document[k]).length;
  return '<section class="xp-document" aria-label="Все пять разделов собранного документа"><div class="xp-document-heading"><b>ЕДИНЫЙ ПАКЕТ ФТ</b><span>Редакция '+s.completed.length+' · '+ready+'/5 разделов</span></div><div class="xp-document-flow" role="img" aria-label="Цель задаёт границы; термины и связи ведут к приёмке">'+keys.map((k,i)=>'<span class="'+(s.document[k]?'ready':'')+'"><i>'+icons[i]+'</i>'+labels[k]+'</span>').join('<b aria-hidden="true">→</b>')+'</div><div class="xp-document-grid">'+keys.map((k,i)=>'<article class="'+(s.changed===k?'changed':'')+'"><h4><i>'+icons[i]+'</i>'+labels[k]+'<small>'+(s.document[k]?'✓':'○')+'</small></h4><p>'+esc((s.document[k]||'Ещё предстоит согласовать.').replace(/^[^:]+:\s*/,''))+'</p></article>').join('')+'</div></section>';
 }
 function comicTile(index,caption){return '<figure><div class="xp-story-tile" role="img" aria-label="'+esc(caption)+'" style="background-position:'+(index%2?100:0)+'% '+(index>1?100:0)+'%"></div><figcaption>'+esc(caption)+'</figcaption></figure>';}
 function documentScreen(e,summary=false){const s=C.state(e),tab=ui(e).docTab;
  const strip='<div class="xp-document-comic">'+comicTile(1,'Собрать потребности')+comicTile(2,'Связать в один документ')+comicTile(3,s.completed.includes('mrg')?'Передано на исполнение':'Довести до исполнения')+'</div>';
  return '<section class="xp-desk xp-doc-screen"><header><div><small>СОБРАННЫЙ ДОКУМЕНТ</small><h3>'+(summary?'Пакет обновлён':'Карта ФТ')+'</h3></div><nav aria-label="Вид документа">'+button('xp-document-tab','Схема','map',tab==='map')+button('xp-document-tab','Комикс','comic',tab==='comic')+'</nav></header>'+(tab==='comic'?strip:documentHTML(e))+'<footer><span class="xp-hint">'+(s.changed?'Последнее изменение: '+labels[s.changed]:'Схема заполнится по ходу кампании')+'</span>'+button(summary?'campaign-summary-next':'campaign-modal-close',summary?'Дальше →':'Назад')+'</footer></section>';
 }
 const pages=[
  ['ПАРАЛЛАКС ПОБЕЖДЁН','Блокер снят. Работа продолжается.','Маяки погасли, кристалл расколот. «Аналитик-01» проходит сквозь обломки живой мегабазы.'],
  ['НИ ОДНОГО ФРАГМЕНТА НЕ ПОТЕРЯТЬ','Победа — ещё не готовый документ.','Собранные уточнения возвращаются на борт. Теперь нужно убедиться, что они не противоречат друг другу.'],
  ['СОБРАТЬ ОДНУ ВЕРСИЮ','Цель. Границы. Связи.','Команда сводит фрагменты в общий пакет ФТ. У каждой связи должен быть владелец, у каждого результата — проверка.'],
  ['К ПАЛУБЕ ИНТЕГРАЦИЙ','Впереди — проверка связей.','Цитадель открывает док. За следующим рубежом уже ждут последние противоречия.']
 ];
 function comicHTML(e){const n=C.state(e).modal.page||0,[tag,title,text]=pages[n];return '<section class="xp-desk xp-interlude" role="dialog" aria-modal="true" aria-label="После Параллакса"><div class="xp-interlude-art xp-story-tile" role="img" aria-label="'+esc(title)+'" style="background-position:'+(n%2?100:0)+'% '+(n>1?100:0)+'%"><strong>'+tag+'</strong></div><div class="xp-interlude-copy"><small>ПОСЛЕ ПАРАЛЛАКСА · '+(n+1)+' / 4</small><h3>'+title+'</h3><p>'+text+'</p><footer>'+button('xp-comic-skip','Пропустить')+button('xp-comic-back','←','',n===0)+button('xp-comic-next',n===3?'На палубу →':'Дальше →')+'</footer></div></section>';}
 function refresh(){ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}
 function openAfterParallax(e){const s=C.state(e);if(s.comic2130Seen)return false;s.modal={type:'afterparallax',page:0};clearArcadeInput();C.save(e,true);return true;}
 function closeComic(e){const s=C.state(e);s.modal=null;s.comic2130Seen=true;C.checkpoint(e);C.save(e,true);refresh();}
 arcadeOverlayHTML=function(...args){const e=ARCADE.engine;if(!C.active(e)||CITADEL_STORY.status(e).active)return old.overlay.apply(this,args);const m=C.state(e).modal;
  if(m?.type==='afterparallax')return comicHTML(e);
  if(m?.type==='document')return documentScreen(e);
  if(!m&&e.status==='campaignsummary')return documentScreen(e,true);
  if(!m&&['paused','stageclear'].includes(e.status))return skills(e);
  const html=old.overlay.apply(this,args);
  return e.status==='escortclear'?'<div class="xp-arrival" aria-hidden="true"><span>ВЫХОД ИЗ ГИПЕРПРОСТРАНСТВА</span></div>'+html:html;
 };
 arcadeAction=function(action,value){const e=ARCADE.engine;
  if(C.active(e)&&action==='xp-document-tab'){ui(e).docTab=value==='comic'?'comic':'map';refresh();return true;}
  if(C.active(e)&&C.state(e).modal?.type==='afterparallax'){
   const m=C.state(e).modal;if(action==='xp-comic-skip'||action==='xp-comic-next'&&m.page===3){closeComic(e);return true;}
   if(action==='xp-comic-next')m.page=Math.min(3,m.page+1);else if(action==='xp-comic-back')m.page=Math.max(0,m.page-1);else if(['arcade-resume','arcade-pause','campaign-modal-close'].includes(action))return true;else return old.action.apply(this,arguments);
   C.save(e,true);refresh();return true;
  }
  if(action==='campaign-document'&&e)ui(e).docTab='map';
  return old.action.apply(this,arguments);
 };
 updateArcadeOverlay=function(...args){const r=old.update.apply(this,args),el=document.getElementById('arcade-overlay');if(el){const fit=!!el.querySelector?.('.xp-desk');el.classList.toggle('xp-fit',fit);if(fit)el.hidden=false;}return r;};
 globalThis.CITADEL_EXPERIENCE=Object.freeze({version:'2.13.0',skills,documentHTML,documentScreen,comicHTML,openAfterParallax,closeComic});
})();
