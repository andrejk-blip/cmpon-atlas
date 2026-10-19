/* Citadel 1.9.3 — one frame owner, bounded local diagnostics and fail-safe pause.
 * No analytics/network, player identity, raw error messages or saves in diagnostics.
 * Gameplay/update/render order is the public arcadeFrame + cupTick order.
 */
(function () {
  'use strict';
  if (globalThis.CITADEL_RUNTIME || typeof ARCADE === 'undefined') return;
  const VERSION = '1.9.3', BUILD = '193r2', LOG_KEY = 'cmpon.citadel.diagnostics.v1';
  const RECOVERY_KEY = 'cmpon.citadel.recovery.v1', LIMIT = 64, GAP = 4000;
  const active = new Set(['playing', 'boarding', 'docking', 'lesson', 'crashing']);
  const statuses = new Set(['menu','briefing','playing','boarding','docking','lesson','crashing','paused','remark','finalcheck','stageclear','escortbrief','escortclear','finalebrief','won','lost']);
  const phases = new Set(['battle','collect','orientation','retrieve','brief','debrief','boarding','finale','dock','escort','pursuit','swarm','boss','breach','landing','maze','mrg','upload','victory']);
  const events = [], faults = [], canvases = new WeakSet();
  let pending = null, epoch = 0, busy = false, stopped = false, contextLost = false;
  let lastFrame = performance.now(), lastUpdate = lastFrame, lastRender = lastFrame;
  let frameCount = 0, updateCount = 0, renderCount = 0, recoveries = 0, failures = 0;
  let renderRetries = 0;
  let stage = 'idle', checkpoint = null, checkpointEngine = null, checkpointAt = -Infinity;
  let observedEngine = null, transition = '', notice = '', saveResult = 'none';
  const now = () => performance.now();
  const mounted = () => !!(ARCADE.canvas && ARCADE.renderer && STATE.view === 'arcade');
  const ready = () => mounted() && !document.hidden && !stopped;
  const num = x => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
  function state() {
    const e = ARCADE.engine;
    return {status: statuses.has(e?.status) ? e.status : 'unknown', stage: num(e?.stage),
      phase: phases.has(e?.phase) ? e.phase : 'other', finale: phases.has(e?.finale?.phase) ? e.finale.phase : null,
      wave: num(e?.wave), seconds: num(e?.elapsed), mode: e?.assist ? 'calm' : 'normal',
      enemies: (e?.board?.enemies || e?.enemies || []).length, renderer: ARCADE.renderer?.cpu ? 'canvas' : 'webgl'};
  }
  function record(kind) {
    events.push({at: Math.round(now()), kind, ...state()});
    if (events.length > LIMIT) events.shift();
  }
  function details(error, location) {
    // Keep only known asset basenames and coordinates, never arbitrary message/URL.
    const stack = String(error?.stack || '').split('\n').flatMap(line => {
      const m = line.match(/((?:citadel-|atlas-)[\w.-]+\.js)(?:\?[^\s():]*)?:(\d+):(\d+)/);
      return m ? [{file:m[1], line:Number(m[2]), column:Number(m[3])}] : [];
    }).slice(0, 6);
    return {at: Math.round(now()), stage:location, module:stack[0]?.file || 'game-loop',
      type:['Error','RangeError','TypeError','ReferenceError','SyntaxError','DOMException'].includes(error?.name) ? error.name : 'Error',
      stack, state:state()};
  }
  function diagnostic() {
    return {version:VERSION, build:BUILD, frames:frameCount, updates:updateCount, renders:renderCount,
      recoveries, failures, stopped, contextLost, pending:pending !== null, stage,
      lastFrameAge:Math.round(now()-lastFrame), lastUpdateAge:Math.round(now()-lastUpdate),
      lastRenderAge:Math.round(now()-lastRender), recoverySave:saveResult,
      faults: faults.map(x=>({...x,stack:x.stack.map(y=>({...y})),state:{...x.state}})),
      events:events.map(x=>({...x}))};
  }
  function persistLog() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(diagnostic())); } catch (_) { /* Storage can be denied. */ }
  }
  function capture(force = false) {
    const e = ARCADE.engine;
    if (!e || !active.has(e.status) || typeof cupPack !== 'function') return;
    if (!force && e === checkpointEngine && now() - checkpointAt < 5000) return;
    const packed = cupPack(e);
    const json = JSON.stringify(packed);
    if (json.length > 2 * 1024 * 1024) return;
    checkpoint = json; checkpointEngine = e; checkpointAt = now();
  }
  function saveRecovery() {
    saveResult = 'unavailable';
    if (!checkpoint || checkpointEngine !== ARCADE.engine) return;
    try {
      // Private local backup of a completed step; never passed to diagnostic().
      localStorage.setItem(RECOVERY_KEY, checkpoint); saveResult = 'local';
    } catch (_) { saveResult = 'memory'; }
  }
  function cancel() {
    epoch++;
    if (pending !== null) cancelAnimationFrame(pending);
    if (ARCADE.raf) cancelAnimationFrame(ARCADE.raf);
    pending = null; ARCADE.raf = 0;
  }
  function schedule() {
    if (!ready() || pending !== null || busy) return;
    const token = epoch;
    pending = requestAnimationFrame(time => {
      if (token !== epoch) return;
      pending = null; ARCADE.raf = 0; frame(time);
    });
    ARCADE.raf = pending;
  }
  function showNotice() {
    if (!notice) return;
    const host = document.getElementById('arcade-screen');
    if (!host) return;
    let box = document.getElementById('citadel-runtime-notice');
    if (!box) {
      box = document.createElement('div'); box.id = 'citadel-runtime-notice';
      box.setAttribute('role','status');
      box.style.cssText = 'position:relative;z-index:30;padding:10px 14px;background:#152b3b;color:#fff;font:14px/1.4 Arial';
      host.appendChild(box);
    }
    box.textContent = notice;
    const diagnosticButton=document.createElement('button');
    diagnosticButton.textContent='Скачать диагностику';
    diagnosticButton.onclick=()=>downloadFile(JSON.stringify(diagnostic(),null,2),'citadel-diagnostics-1.9.3.json','application/json');
    box.appendChild(diagnosticButton);
    if(checkpoint && checkpointEngine===ARCADE.engine) {
      const backupButton=document.createElement('button');backupButton.textContent='Сохранить резервную копию';
      backupButton.onclick=()=>downloadFile(checkpoint,'citadel-recovery.json','application/json');box.appendChild(backupButton);
    }
  }
  function pause() {
    clearArcadeInput();
    const e = ARCADE.engine;
    // Do not emit from a partially failed step: observers may be its cause.
    if (active.has(e?.status)) { e.resumeStatus = e.status; e.status = 'paused'; }
    try { spaceAudioStop(); } catch (_) { /* Simulation is already stopped. */ }
  }
  function fail(error, location) {
    failures++;
    faults.push(details(error, location)); if (faults.length > 3) faults.shift();
    record('fault'); cancel(); saveRecovery(); pause();
    // Only rendering is retryable; an interrupted update might have emitted or
    // credited an event. Never replay it or reload/recreate the engine silently.
    const retry = ['camera','scene','renderer','hud','ui'].includes(location) && renderRetries === 0;
    stopped = !retry;
    notice = retry ? 'Отрисовка прервалась. Игра на паузе; можно продолжить после восстановления кадра.' :
      'Игра остановлена из-за ошибки. '+(saveResult==='local'?'Резервная копия сохранена в этом браузере.':saveResult==='memory'?'Резервная копия доступна в памяти вкладки.':'Резервная копия пока недоступна.');
    if (retry) { recoveries++; renderRetries++; }
    persistLog();
    console.error('[Citadel runtime]', faults[faults.length-1]);
    try { updateArcadeOverlay(); showNotice(); } catch (_) { /* Keep diagnostic available even if UI failed. */ }
  }
  function render(e, time) {
    stage = 'camera'; const cam = spaceCamera(e,time,e.status==='menu'); ARCADE.camera = cam;
    stage = 'scene'; const items = spaceScene(e,time,ARCADE.fx);
    stage = 'renderer'; ARCADE.renderer.render(items,cam);
    stage = 'hud'; const c=ARCADE.ctx,w=ARCADE.hud.width,h=ARCADE.hud.height;
    // A throwing Canvas painter must not leave save()/clip()/transform state
    // on the context used by a later frame. The native frame boundary resets it.
    if (e.finale && e.status!=='crashing' && !(e.status==='paused'&&e.resumeStatus==='crashing')) drawFinaleHUD(c,e,cam,w,h);
    else if (isMobileLayout()) drawMobileGameHUD(c,e,cam,w,h);
    else {
      if (e.crash&&['crashing','paused'].includes(e.status)) drawCrashHUD(c,e,cam,w,h);
      else if (e.phase==='escort'&&e.escort) drawEscortHUD(c,e,cam,w,h);
      else if (stationDocking(e)) drawDockHUD(c,e,cam,w,h);
      else if (citadelInside(e)) drawBoardHUD(c,e,cam,w,h);
      else { drawFlightHUD(c,e,cam,w,h); drawCampaignFlightHUD(c,e,cam,w,h); }
      drawClarityHUD(c,e,cam,w,h);
    }
  }
  function frame(time) {
    if (!ready() || busy) return;
    busy = true; lastFrame = now();
    try {
      const e = ARCADE.engine;
      if (e !== observedEngine) {
        observedEngine=e; checkpoint=null; checkpointEngine=null; checkpointAt=-Infinity;
        transition=''; renderRetries=0; record('engine');
      }
      stage='checkpoint'; capture();
      const dt=Math.min(.04,Math.max(0,(time-ARCADE.lastTime)/1000)); ARCADE.lastTime=time;
      stage='tournament-clock'; cupTick(dt);
      stage='update';
      if (!contextLost && active.has(e.status)) { e.step(dt,arcadeInput()); updateCount++; lastUpdate=now(); }
      const key=[e.stage,e.status,e.phase,e.finale?.phase,e.wave,e.board?.completed?.length].join('/');
      if (key!==transition) { transition=key; record('transition'); }
      // Capture AFTER a completed step; failed updates keep the earlier checkpoint.
      stage='checkpoint'; capture();
      stage='ui'; updateCitadelTypedText(); updateCaptainAnimation(time);
      if (!contextLost) { render(e,e.status==='menu'?time/1000:e.elapsed); renderCount++; lastRender=now(); }
      if (time-ARCADE.hudTime>120) {
        stage='audio'; spaceAudioSync(e);
        stage='ui'; updateArcadeHUD(); updateArcadeOverlay(); ARCADE.hudTime=time;
      }
      frameCount++; stage='idle';
    } catch (error) {
      const failedStage=stage;
      if (failedStage==='hud') { try { ARCADE.hud.width=ARCADE.hud.width; } catch (_) {} }
      fail(error,failedStage);
    } finally { busy=false; schedule(); }
  }
  function restart() {
    cancel(); ARCADE.lastTime=now(); lastFrame=lastUpdate=lastRender=now(); schedule();
  }
  function watchdog() {
    // Tournament restore is asynchronous and can replace the engine after the
    // action handler returns. A new instance may start; a failed one may not.
    if (mounted() && ARCADE.engine && ARCADE.engine!==observedEngine && stopped) {
      stopped=false;renderRetries=0;notice='';restart();
    }
    if (!ready() || busy || contextLost) return;
    if (now()-lastFrame<GAP && (!active.has(ARCADE.engine?.status)||now()-lastUpdate<GAP)) return;
    record('frame-gap'); saveRecovery(); pause(); recoveries++;
    notice='Обновление кадра прерывалось. Игра на паузе; нажмите «Продолжить».';
    restart(); persistLog(); showNotice();
  }
  function bindCanvas() {
    const canvas=ARCADE.canvas;
    if (!canvas || canvases.has(canvas)) return;
    canvases.add(canvas); contextLost=false;
    canvas.addEventListener('webglcontextlost',()=>{if(canvas!==ARCADE.canvas)return;contextLost=true;record('context-lost');saveRecovery();persistLog();});
    canvas.addEventListener('webglcontextrestored',()=>{if(canvas!==ARCADE.canvas)return;contextLost=false;record('context-restored');restart();});
  }
  const previousMount=mountArcade, previousDetach=detachArcade;
  mountArcade=function(...args) {
    const result=previousMount.apply(this,args); bindCanvas();
    // The base mount schedules the old public entry; take ownership once.
    restart(); showNotice(); return result;
  };
  detachArcade=function(...args) { cancel(); record('detach'); return previousDetach.apply(this,args); };
  arcadeFrame=function(time) { cancel(); frame(time); };
  const previousAction=arcadeAction;
  arcadeAction=function(action,...args) {
    // Never log action values, answers, player names or DOM text.
    if (['arcade-pause','arcade-resume','citadel-launch','citadel-lesson-next','citadel-remark-next','citadel-escort-continue','finale-launch','finale-check-next'].includes(action)) record(action);
    if (stopped && ['arcade-resume','arcade-pause'].includes(action)) { showNotice(); return true; }
    const before=ARCADE.engine;
    const result=previousAction.call(this,action,...args);
    if (before!==ARCADE.engine) { stopped=false; renderRetries=0; notice=''; restart(); }
    if (ARCADE.engine?.status!=='paused' && ['arcade-pause','arcade-resume'].includes(action)) lastUpdate=now();
    if (notice && !stopped && ARCADE.engine?.status!=='paused') {
      notice=''; const el=document.getElementById('citadel-runtime-notice'); if(el)el.textContent='';
    }
    return result;
  };
  document.addEventListener('visibilitychange',()=>{
    record(document.hidden?'hidden':'visible');
    if(document.hidden)cancel();else restart();
  });
  globalThis.addEventListener?.('pagehide',()=>{cancel();saveRecovery();});
  globalThis.addEventListener?.('pageshow',()=>{if(!document.hidden)restart();});
  globalThis.addEventListener?.('error',event=>{
    if (!mounted() || !/\/(?:citadel-|atlas-)[\w.-]+\.js(?:\?|$)/.test(event.filename||'')) return;
    faults.push(details(event.error,'async'));if(faults.length>3)faults.shift();record('async-error');saveRecovery();persistLog();
  });
  globalThis.addEventListener?.('unhandledrejection',event=>{
    if (!mounted() || !/(?:citadel-|atlas-)[\w.-]+\.js:\d+/.test(String(event.reason?.stack||''))) return;
    faults.push(details(event.reason,'promise'));if(faults.length>3)faults.shift();record('promise-error');saveRecovery();persistLog();
  });
  setInterval(watchdog,1000);
  globalThis.CITADEL_RUNTIME=Object.freeze({version:VERSION,diagnostic});
  bindCanvas(); restart();
})();
