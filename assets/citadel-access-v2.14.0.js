/* 2.14: shared perks, finite failure assistance and visual chapter discoveries.
 * All progression state is serializable under the existing campaign field.
 * A skipped chapter receives no combat award and remains explicitly marked. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_ACCESS||!globalThis.CITADEL_CAMPAIGN)return;
 const C=CITADEL_CAMPAIGN,S=CITADEL_SKILLS,p=RequirementArcade.prototype;
 const old={step:p.step,damage:p.damage,hit:p.hit,boardHit:p.boardHit,pulse:p.pulse,boardPulse:p.boardPulse,mrgDamage:p.mrgDamage,spawn:p.spawnEnemy,enemy:p.enemyStep,shot:p.hostileShot,fire:p.fire,
  overlay:arcadeOverlayHTML,action:arcadeAction,skills:CITADEL_EXPERIENCE.skills};
 const active=e=>C.active(e),first=e=>active(e)&&e.stage===0&&!e.board&&!e.finale&&e.phase!=='escort';
 const kit=e=>e.upgrades.baseKit260||{},rank=(e,k)=>S.rank(e,k),copy=x=>JSON.parse(JSON.stringify(x));
 const refresh=()=>{ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();};
 const failureKey=e=>C.mission(e)==='route'?'route:'+C.state(e).route:C.mission(e);
 function failure(e){if(!active(e))return;const s=C.state(e);if(e.status!=='lost'||s.lossTracked2140||s.practice)return;
  s.lossTracked2140=true;const key=failureKey(e);s.failures2140={...s.failures2140,[key]:(s.failures2140?.[key]||0)+1};C.save(e,true);
 }
 // First orbit: remove the accelerated 2.6 gun clock, weaken finite enemies,
 // reduce incoming damage and add slow recovery after an undamaged interval.
 p.spawnEnemy=function(...args){const n=this.enemies.length,r=old.spawn.apply(this,args);if(first(this))for(const x of this.enemies.slice(n)){x.hp*=.60;x.maxHp=x.hp;x.shot=Math.max(3,x.shot);x.easy2140=true;}return r;};
 p.enemyStep=function(dt){if(first(this))for(const x of this.enemies){if(!x.easy2140){x.hp*=.60;x.maxHp=x.hp;x.shot=Math.max(2.4,x.shot);x.easy2140=true;}if(x.shot>0)x.shot+=dt*.28;}return old.enemy.apply(this,arguments);};
 p.hostileShot=function(...args){const n=this.hostile.length,r=old.shot.apply(this,args);if(first(this))for(const x of this.hostile.slice(n)){x.vel=V3.scale(x.vel,.78);x.damage*=.75;}return r;};
 p.damage=function(amount,...args){if(active(this))amount*=(first(this)?.65:1)*(1-rank(this,'systems')*.07)*(1-(kit(this).armor||0)*.06);
  const r=old.damage.call(this,amount,...args);failure(this);return r;};
 p.hit=function(x,amount,...args){return old.hit.call(this,x,active(this)?amount*(1+rank(this,'observation')*.12):amount,...args);};
 p.boardHit=function(x,amount,...args){if(active(this)&&!(x.missions270&&(x.stun>0||x.missions270.phase==='recover')))amount*=1+rank(this,'observation')*.12;return old.boardHit.call(this,x,amount,...args);};
 p.pulse=function(...args){const r=old.pulse.apply(this,args);if(r&&active(this))this.player.pulseCooldown*=Math.max(.35,(1-rank(this,'priority')*.08)*(1-(kit(this).capacitor||0)*.08)*(1-(this.upgrades.rockets||0)*.10));return r;};
 p.boardPulse=function(...args){const r=old.boardPulse.apply(this,args);if(r&&active(this))this.board.pulseCooldown*=Math.max(.5,1-(this.upgrades.rockets||0)*.10);return r;};
 p.mrgDamage=function(amount,...args){if(active(this))amount*=(1-rank(this,'systems')*.07)*(1-(kit(this).armor||0)*.06);const r=old.mrgDamage.call(this,amount,...args);failure(this);return r;};
 p.fire=function(...args){const n=this.bullets.length,r=old.fire.apply(this,args);if(r&&active(this)){const k=kit(this);this.player.shotCooldown/=1+(k.parts||0)*.04;
  const s=C.state(this);s.shots2140=(s.shots2140||0)+1;if(k.parts>=3&&s.shots2140%(8-k.parts)===0){const shot=this.bullets[n];if(shot)for(const side of [-1,1]){const a=.065*side,c=Math.cos(a),z=Math.sin(a),v=shot.vel;this.bullets.push({...shot,pos:shot.pos.slice(),vel:[v[0]*c+v[2]*z,v[1],v[2]*c-v[0]*z],damage:shot.damage*.52,sharedTriad2140:true});}}
 }return r;};
 const labels={goal:'Цель',scope:'Границы',terms:'Термины',links:'Связи',acceptance:'Приёмка'};
 const locations={goal:[27,28],scope:[72,28],terms:[26,53],links:[73,53],acceptance:[50,78]};
 const captions={orbit1:'Первая цель найдена',base1:'Границы проведены',convoy1:'Архив дошёл до исполнителя',pursuit:'ФЗ подтвердил цель',base2:'Условия приёмки согласованы',route:'Смежники получили одну версию',swarm:'Уточнения собраны',parallax:'Блокирующая крепость пала',base3:'Мосты между системами построены',convoy3:'Комплект доставлен через блокаду',orbit4:'Новые идеи отделены от выпуска',base4:'История решений сохранена',contradictions:'Термины обрели общий смысл',lair:'Доказательства собраны',mrg:'Пакет передан на исполнение'};
 const btn=(a,t,v='')=>'<button data-action="'+a+'" data-value="'+esc(v)+'">'+t+'</button>';
 function documentScreen(e,summary=false){const s=C.state(e),id=s.completed.at(-1),skipped=s.skipped2140?.[id],revision=s.completed.length;
  return '<section class="xp-desk visual-document"><header><div><small>ПУТЕШЕСТВИЕ ДОКУМЕНТА · '+revision+' / 15</small><h3>'+(skipped?'Следуем дальше':captions[id]||'Карта будущего ФТ')+'</h3></div><b class="doc-seal">'+Object.keys(s.document).length+'/5</b></header><div class="document-atlas" role="img" aria-label="Художественная карта собранных разделов ФТ"><div class="atlas-art"></div>'+Object.entries(labels).map(([k,label])=>{const [x,y]=locations[k],ready=!!s.document[k];return '<span class="atlas-node '+(ready?'ready ':'')+(s.changed===k?'changed':'')+'" style="left:'+x+'%;top:'+y+'%"><i>'+(ready?'✓':'◇')+'</i><b>'+label+'</b></span>';}).join('')+'<div class="atlas-caption">'+(skipped?'↪ Глава пропущена · раздел ещё нужно проверить':s.changed?'✦ '+labels[s.changed]+' · обновлено':'Пять частей одного приключения')+'</div></div><div class="chapter-stamps" aria-label="Прогресс глав">'+C.ids.map((id,i)=>'<span title="'+esc(C.title(id))+'" class="'+(s.completed.includes(id)?'done ':'')+(s.skipped2140?.[id]?'skipped':'')+'">'+(s.skipped2140?.[id]?'↪':s.completed.includes(id)?'✓':i+1)+'</span>').join('')+'</div><footer><span class="xp-hint">'+(skipped?'Пропуск сохранён в истории.':'Светящийся участок — результат этой главы.')+'</span>'+btn(summary?'campaign-summary-next':'campaign-modal-close',summary?'Дальше →':'Продолжить →')+'</footer></section>';
 }
 function skills(e){return old.skills(e)
  .replace(/Урон по оглушённым или остывающим роботам/g,'Урон в полёте и на базе').replace(/Перезарядка импульса на базах/g,'Перезарядка импульса в полёте и на базе').replace(/опасностей базы/g,'опасностей в полёте и на базе').replace('Оборудование баз','Общее оборудование')
  .replace('ЛИЧНОЕ ДЕЛО · АНАЛИТИК','ОБЩАЯ ПРОКАЧКА · КОРАБЛЬ + БАЗА')
  .replace('Щит корабля','Общий щит').replace('Ракеты</b>','Арсенал</b>')
  .replace(/Подбор \+[^<]+/,'Урон +'+Math.min(3,rank(e,'observation')+1)*12+'% · везде')
  .replace(/Импульс −[^<]+/,'Импульс −'+Math.min(3,rank(e,'priority')+1)*8+'% · везде')
  .replace('Урон по кораблю −20%','Урон −20% · корабль и база')
  .replace('Ракеты +4 · урон +30%','Ракеты +4 · импульс −10%')
  .replace(/<p class="xp-hint">[\s\S]*?<\/p>/,'<p class="xp-hint">Все шесть перков работают и в полёте, и на базе. Найденное оборудование — тоже.</p>');}
 function discover(e){if(!active(e)||C.state(e).practice||globalThis.CITADEL_STORY?.status(e).active)return;const s=C.state(e);
  if(s.modal||['lost','crashing','menu','lesson','remark','finalcheck','campaigncard','campaignsource'].includes(e.status))return;
  if(e.status==='campaignsummary'){s.documentSeen2140=s.completed.length;return;}
  if(s.completed.length>(s.documentSeen2140||0)){
   s.documentSeen2140=s.completed.length;s.modal={type:'document',automatic2140:true};clearArcadeInput();C.save(e,true);refresh();return;
  }
  // Only the first actual encounter is forced. Multiple discoveries queue in
  // insertion order; no re-show after retry, reload or a manual bestiary visit.
  const kind=Object.keys(s.encounters).find(k=>!s.shownBeasts2140?.[k]);
  if(kind){s.shownBeasts2140={...s.shownBeasts2140,[kind]:true};s.modal={type:'bestiary',kind,automatic2140:true};clearArcadeInput();C.save(e,true);refresh();}
 }
 p.step=function(dt,input={}){const was=this.status,r=old.step.apply(this,arguments);if(active(this)){
  if(first(this)&&this.status==='playing'&&this.elapsed-(this.lastDamage||0)>4)this.player.hp=Math.min(100,this.player.hp+Math.min(.04,Math.max(0,dt))*1.5);
  failure(this);if(!['lost','crashing'].includes(this.status)&&was==='lost')C.state(this).lossTracked2140=false;discover(this);
 }return r;};
 arcadeOverlayHTML=function(...args){const e=ARCADE.engine;if(!active(e)||globalThis.CITADEL_STORY?.status(e).active)return old.overlay.apply(this,args);const s=C.state(e);
  if(s.modal?.type==='document')return documentScreen(e);
  if(!s.modal&&e.status==='campaignsummary')return documentScreen(e,true);
  if(!s.modal&&['paused','stageclear'].includes(e.status))return skills(e);
  let html=old.overlay.apply(this,args);
  if(s.modal?.type==='bestiary'&&s.modal.automatic2140)html=html.replace('Бестиарий встреч','НОВАЯ ВСТРЕЧА').replace('Закрыть</button>','Понятно, в полёт →</button>');
  if(e.status==='lost'){const n=s.failures2140?.[failureKey(e)]||0;html+='<section class="skip-offer"><b>'+n+' / 3 попытки</b><p>'+(n>=3?'Можно продолжить путешествие и вернуться к этой главе позже.':'После трёх поражений откроется пропуск этой главы.')+'</p>'+(n>=3?btn('campaign-skip','Пропустить главу →'):'')+'</section>';}
  if(e.status==='won'&&Object.keys(s.skipped2140||{}).length)html+='<p class="skip-finish">Кампания завершена с пропусками: '+Object.keys(s.skipped2140).map(C.title).join(', ')+'.</p>';
  return html;
 };
 arcadeAction=function(action,...args){const e=ARCADE.engine;failure(e);const r=old.action.call(this,action,...args);const now=ARCADE.engine;if(active(now)){const s=C.state(now);if(action==='campaign-document'&&s.modal?.type==='document')s.documentSeen2140=s.completed.length;if(['campaign-bestiary','campaign-beast'].includes(action)&&s.modal?.kind)s.shownBeasts2140={...s.shownBeasts2140,[s.modal.kind]:true};discover(now);C.save(now,true);}return r;};
 globalThis.CITADEL_ACCESS=Object.freeze({version:'2.14.0',failure,failureKey,discover,documentScreen,skills,first});
})();
