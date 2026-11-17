import { icon } from './icons.js';

const DETAILS = [
  {id:'address',x:39.3,y:27.7,icon:'door',label:'Первый адрес',title:'Всё начинается с квартиры 12',text:'За этой дверью Аня познакомится с Ильёй и Антоном. Одна квартира ещё не означает одно домохозяйство.'},
  {id:'coffee',x:71,y:51,icon:'coffee',label:'Два стаканчика',title:'У Макса кофе на двоих',text:'Рабочие сообщения — не единственная переписка в телефоне Ани. Как пройдёт вечер, решишь ты.'},
  {id:'plant',x:41,y:72,icon:'plant',label:'Растение на скамейке',title:'Немного уюта на первую оплату',text:'За принятую анкету Аня заработает монеты. Растение или лампа могут стать первой покупкой для её дома.'},
  {id:'rocket',x:47,y:81,icon:'star',label:'Ракета на сумке',title:'Привет из «Цитадели»',text:'Маленькая отсылка к «Цитадели требований». Здесь экспедиция начинается с обычного двора.'}
];

export function titleScreenMarkup({started=false,complete=false,audioEnabled=true,clock='07:30'}={}) {
  return `<div class="title-art-region" aria-hidden="true"><div class="title-art-stage"><img class="title-keyart" src="./assets/title-cover06-vera.webp" alt="" width="1672" height="941" fetchpriority="high"><div class="title-sunlight"></div><span class="title-mote mote-one"></span><span class="title-mote mote-two"></span><span class="title-mote mote-three"></span></div></div>
  <div class="title-shade" aria-hidden="true"></div>
  <div class="title-story">
    <div class="title-edition"><span></span> ИСТОРИЯ О РАБОТЕ И НЕ ТОЛЬКО</div>
    <h1 id="title-wordmark" class="title-wordmark">Переписка<span class="title-heart" aria-hidden="true">♡</span></h1>
    <p class="title-hook">Первый рабочий день.<br>И одно сообщение не по работе.</p>
    <div class="title-route">
      <span class="title-clip" aria-hidden="true"></span>
      <div class="title-chapter"><span>ГЛАВА 01</span><span>${complete?'День прожит':started?clock:'07:30'}</span></div>
      <h2>Первый день Ани</h2>
      <button id="start-pilot" class="title-play"><span>${complete?'Вспомнить мой день':started?'Продолжить историю':'Начать первый день'}<small>${complete?'Твои решения и итог истории':started?'Аня ждёт тебя':'Твоя история начинается здесь'}</small></span><span class="title-play-arrow">${icon('arrow')}</span></button>
      <div class="title-route-foot">${icon(started?'check':'pin')}<span>${started?'История сохранена на этом устройстве':'Лесная улица · Первый адрес'}</span></div>
    </div>
    <nav class="title-menu" aria-label="Меню игры"><button id="welcome-help">${icon('map')}<span>Как играть</span></button><button id="welcome-settings">${icon('settings')}<span>Настройки</span></button>${started?'<button id="welcome-new" class="title-restart">'+icon('sun')+'<span>Сначала</span></button>':''}</nav>
  </div>
  <div class="title-top-tools"><button id="welcome-audio" class="title-sound" aria-label="${audioEnabled?'Выключить':'Включить'} музыку и голоса" aria-pressed="${audioEnabled}"><span class="title-sound-icon" aria-hidden="true">${audioEnabled?'♫':'♪'}</span><span data-title-sound>${audioEnabled?'Звук включён':'Звук выключен'}</span></button></div>
  <div class="title-credits"><span>Один день. Твоя история.</span><span>Пилот 0.6</span></div>
  <div class="title-secrets"><button id="welcome-secrets" aria-expanded="false" aria-controls="title-detail-list">${icon('star')}<span>Найди 4 детали</span></button><div id="title-detail-list" hidden>${DETAILS.map(d=>`<button data-cover-detail="${d.id}" aria-label="${d.label}" title="${d.label}">${icon(d.icon)}</button>`).join('')}</div></div>
  <aside class="title-detail-note" hidden aria-label="Деталь обложки"><button data-close-cover-note aria-label="Закрыть подсказку">${icon('close')}</button><small data-cover-detail-count></small><h3></h3><p></p></aside>`;
}

/** Decorative cover interactions do not alter the player's saved story. */
export function bindTitleScreen(root,{onAudio,getAudioEnabled}={}) {
  const abort=new AbortController(), seen=new Set();
  const sound=root.querySelector('#welcome-audio');
  const updateAudio=()=>{
    const enabled=Boolean(getAudioEnabled?.());
    sound.setAttribute('aria-pressed',String(enabled));
    sound.setAttribute('aria-label',`${enabled?'Выключить':'Включить'} музыку и голоса`);
    sound.querySelector('[data-title-sound]').textContent=enabled?'Звук включён':'Звук выключен';
    sound.querySelector('.title-sound-icon').textContent=enabled?'♫':'♪';
  };
  sound.addEventListener('click',()=>{onAudio?.();updateAudio();},{signal:abort.signal});
  const art=root.querySelector('.title-keyart');
  art.addEventListener('error',()=>root.classList.add('cover-unavailable'),{once:true,signal:abort.signal});
  const menu=root.querySelector('#welcome-secrets'), list=root.querySelector('#title-detail-list');
  const note=root.querySelector('.title-detail-note');
  let returnFocus=menu;
  const closeNote=()=>{note.hidden=true;returnFocus.focus();};
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));list.hidden=!open;if(!open)note.hidden=true;},{signal:abort.signal});
  list.querySelectorAll('[data-cover-detail]').forEach(button=>button.addEventListener('click',()=>{
    const detail=DETAILS.find(d=>d.id===button.dataset.coverDetail);seen.add(detail.id);returnFocus=button;
    note.querySelector('h3').textContent=detail.title;note.querySelector('p').textContent=detail.text;
    note.querySelector('[data-cover-detail-count]').textContent=`ДЕТАЛИ ОБЛОЖКИ · ${seen.size} ИЗ 4`;
    list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(seen.has(b.dataset.coverDetail))));
    menu.querySelector('span').textContent=seen.size===4?'Все детали найдены':`Найди 4 детали · ${seen.size}/4`;
    note.hidden=false;note.querySelector('button').focus();
  },{signal:abort.signal}));
  note.querySelector('button').addEventListener('click',closeNote,{signal:abort.signal});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!note.hidden){e.preventDefault();closeNote();}},{signal:abort.signal});
  return ()=>abort.abort();
}
