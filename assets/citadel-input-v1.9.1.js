/* Citadel CSII 1.9.1 — manual touch aim for the existing deck/MRG controls.
 * Pointer coordinates use the same camera ray as mouse aim. One canvas finger
 * owns aiming; the joystick and action buttons retain their separate pointers.
 */
(function () {
  'use strict';
  const VERSION='1.9.1';
  if(typeof ARCADE==='undefined'||typeof STATE==='undefined'||typeof mountArcade!=='function'||
     typeof arcadeInput!=='function'||typeof citadelBoardAim!=='function')return;
  if(globalThis.CITADEL_INPUT?.version===VERSION)return;
  const bound=new WeakSet();let held=null,boundCanvases=0;
  const valid=point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);
  function eligible(canvas) {
    return canvas===ARCADE.canvas&&STATE.view==='arcade'&&!document.hidden&&ARCADE.engine?.status==='boarding'&&
      !!ARCADE.engine.board&&!!ARCADE.camera&&!document.getElementById('detail')?.open&&
      !(typeof MOBILE!=='undefined'&&(MOBILE.menu||MOBILE.command));
  }
  function release() {
    const old=held;if(!old)return;held=null;
    if(ARCADE.firePointer===old.id)ARCADE.firePointer=null;
    if(ARCADE.boardAim===old.aim)ARCADE.boardAim=null;
    try { if(!old.canvas.hasPointerCapture||old.canvas.hasPointerCapture(old.id))old.canvas.releasePointerCapture?.(old.id); } catch (_) {}
  }
  function aimAt(canvas,x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    const rect=canvas.getBoundingClientRect?.();if(!rect?.width||!rect?.height)return null;
    try { const point=citadelBoardAim(x,y,canvas,ARCADE.camera);return valid(point)?point:null; }
    catch (_) { return null; }
  }
  function sync() {
    if(!held)return;
    if(!eligible(held.canvas)||ARCADE.engine!==held.engine||ARCADE.engine.board!==held.board||ARCADE.firePointer!==held.id){release();return;}
    const point=aimAt(held.canvas,held.x,held.y);if(!point){release();return;}
    held.aim=point;ARCADE.boardAim=point;
  }
  function consume(event){event.preventDefault?.();event.stopImmediatePropagation?.();}
  function bind(canvas=ARCADE.canvas) {
    if(held&&held.canvas!==canvas)release();
    if(!canvas?.addEventListener||bound.has(canvas))return;
    bound.add(canvas);boundCanvases++;
    canvas.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='touch'||ARCADE.engine?.status!=='boarding')return;
      // The legacy bubbling handler starts touch fire without an aim point.
      // Own this one case in capture; mouse and every other scene still bubble.
      consume(event);sync();
      if(!eligible(canvas)||event.button!==undefined&&event.button!==0||held&&held.id!==event.pointerId)return;
      const point=aimAt(canvas,event.clientX,event.clientY);if(!point)return;
      held={id:event.pointerId,canvas,engine:ARCADE.engine,board:ARCADE.engine.board,x:event.clientX,y:event.clientY,aim:point};
      ARCADE.firePointer=held.id;ARCADE.boardAim=point;
      try { canvas.focus?.({preventScroll:true});canvas.setPointerCapture?.(held.id); } catch (_) {}
    },{capture:true,passive:false});
    canvas.addEventListener('pointermove',event=>{
      if(event.pointerType!=='touch'||held?.canvas!==canvas||held.id!==event.pointerId)return;
      consume(event);held.x=event.clientX;held.y=event.clientY;sync();
    },{capture:true,passive:false});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{
      if(held?.canvas===canvas&&event.pointerId===held.id)release();
    },true);
  }
  const originalMount=mountArcade;
  mountArcade=function(...args){const result=originalMount.apply(this,args);bind();return result;};
  const originalInput=arcadeInput;
  arcadeInput=function(...args){sync();return originalInput.apply(this,args);};
  if(typeof clearArcadeInput==='function'){
    const original=clearArcadeInput;clearArcadeInput=function(...args){release();return original.apply(this,args);};
  }
  if(typeof updateArcadeOverlay==='function'){
    const original=updateArcadeOverlay;updateArcadeOverlay=function(...args){sync();return original.apply(this,args);};
  }
  if(typeof updateArcadeHUD==='function'){
    const original=updateArcadeHUD;updateArcadeHUD=function(...args){sync();return original.apply(this,args);};
  }
  if(typeof RequirementArcade==='function'&&typeof RequirementArcade.prototype.pause==='function'){
    const original=RequirementArcade.prototype.pause;
    RequirementArcade.prototype.pause=function(...args){const result=original.apply(this,args);if(held?.engine===this&&this.status!=='boarding')release();return result;};
  }
  if(typeof detachArcade==='function'){
    const original=detachArcade;detachArcade=function(...args){release();return original.apply(this,args);};
  }
  if(typeof setView==='function'){
    const original=setView;setView=function(...args){const result=original.apply(this,args);if(STATE.view!=='arcade')release();return result;};
  }
  // The document release also covers older browsers without pointer capture.
  for(const type of ['pointerup','pointercancel'])document.addEventListener?.(type,event=>{if(held?.id===event.pointerId)release();},true);
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden)release();});
  for(const type of ['blur','pagehide'])globalThis.addEventListener?.(type,release);
  bind();
  globalThis.CITADEL_INPUT=Object.freeze({version:VERSION,reset:release,status:()=>({version:VERSION,boundCanvases,
    active:!!held,pointerId:held?.id??null,mode:held?'board-touch-aim':'idle'})});
}());
