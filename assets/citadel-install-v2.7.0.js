/* Installable online edition. No service worker: a new release cannot be
   trapped behind an old cached engine. The native prompt runs on a user click. */
(() => {
  'use strict';
  if(globalThis.CITADEL_INSTALL || typeof updateArcadeOverlay!=='function'||window.top!==window)return;
  let installPrompt=null;
  const installed=()=>!!navigator.standalone||!!globalThis.matchMedia?.('(display-mode: standalone)').matches;
  function help(){
    let dialog=document.getElementById('citadel-install-help');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='citadel-install-help';dialog.setAttribute('aria-labelledby','citadel-install-title');
      dialog.innerHTML='<h2 id="citadel-install-title">Игра на главном экране</h2><p><b>Android:</b> откройте меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран».</p><p><b>iPhone:</b> в Safari нажмите «Поделиться» → «На экран Домой» → «Добавить».</p><p>Иконка открывает сразу «Цитадель». Для загрузки игры нужен интернет.</p><button type="button">Понятно</button>';
      dialog.style.cssText='max-width:420px;width:calc(100% - 32px);max-height:85vh;max-height:85dvh;overflow:auto;background:#102b38;color:#e7f3ef;border:1px solid #82e7e5;border-radius:12px;padding:22px;font:16px/1.5 system-ui';
      dialog.querySelector('button').onclick=()=>typeof dialog.close==='function'?dialog.close():dialog.removeAttribute('open');document.body.appendChild(dialog);
    }
    if(typeof dialog.showModal==='function')dialog.showModal();
    else {dialog.setAttribute('open','');dialog.style.position='fixed';dialog.style.inset='10% 0 auto';dialog.style.zIndex='10000';}
  }
  function decorate(){
    if(installed())return;
    const overlay=document.getElementById('arcade-overlay');
    if(!overlay||overlay.querySelector('[data-citadel-install270]'))return;
    const host=overlay.querySelector('.cup-panel,.arcade-menu,.arcade-state-card');
    if(!host||['playing','boarding','docking'].includes(ARCADE.engine?.status))return;
    const button=document.createElement('button');button.type='button';button.className='arcade-secondary';
    button.dataset.citadelInstall270='';button.textContent='Добавить игру на главный экран';
    button.style.cssText='display:block;margin:12px auto 0;min-height:44px;max-width:450px;white-space:normal';
    button.onclick=async()=>{
      if(!installPrompt){help();return;}
      const prompt=installPrompt;installPrompt=null;
      try{await prompt.prompt();await prompt.userChoice;}catch(_){help();}
    };host.appendChild(button);
  }
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;decorate();});
  addEventListener('appinstalled',()=>{installPrompt=null;document.querySelectorAll('[data-citadel-install270]').forEach(x=>x.remove());});
  const old=updateArcadeOverlay;updateArcadeOverlay=function(){const result=old.apply(this,arguments);decorate();return result;};
  globalThis.CITADEL_INSTALL=Object.freeze({version:'2.7.0',delivery:'online-standalone',decorate});decorate();
})();
