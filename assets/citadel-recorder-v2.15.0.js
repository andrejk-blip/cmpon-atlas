/* Explicit 60-second game-only recording. Never requests camera/microphone. */
(()=>{
 'use strict';if(globalThis.CITADEL_RECORDER)return;
 const ADMIN='https://cmpon-analytics-admin.carlafloriano1958.chatgpt.site',MAX=60,MAX_BYTES=20*1024*1024;
 let audioTap=null,audioSink=null,rec=null,stream=null,canvas=null,ctx=null,chunks=[],bytes=0,startAt=0,timer=null,lastFrame=0,clip=null,clipURL=null,bridge=null,nonce='',sent=false,sendWhenDone=false,dialog=null,events=[];
 const clock=()=>performance.now();
 const supported=()=>typeof MediaRecorder==='function'&&typeof HTMLCanvasElement!=='undefined'&&!!HTMLCanvasElement.prototype.captureStream;
 const message=t=>{const el=document.getElementById('record-status2150');if(el)el.textContent=t;};
 function meta(){const e=ARCADE.engine;return {version:globalThis.CITADEL_RELEASE?.version||'2.15.0',createdAt:new Date().toISOString(),duration:Math.min(MAX,Math.round((clock()-startAt)/1000)),mission:globalThis.CITADEL_CAMPAIGN?.active(e)?CITADEL_CAMPAIGN.mission(e):e.phase,phase:e.phase,stage:e.stage,status:e.status,mode:e.campaign2120?.mode||'game',width:canvas?.width,height:canvas?.height,events:events.slice(-60)};}
 function controls(){if(typeof document==='undefined'||!ARCADE.canvas)return;const field=ARCADE.canvas.parentElement;if(!field||document.getElementById('record-controls2150'))return;
  const bar=document.createElement('div');bar.id='record-controls2150';bar.className='citadel-record2150';bar.innerHTML='<button type="button" id="record-toggle2150" aria-label="Записать игровой эпизод">● Запись</button><button type="button" id="record-last2150" hidden>Эпизод</button>';field.appendChild(bar);
  bar.querySelector('#record-toggle2150').onclick=()=>rec?stop(true):start();bar.querySelector('#record-last2150').onclick=()=>show();
 }
 function label(){const b=document.getElementById('record-toggle2150');if(b){b.dataset.recording=String(!!rec);b.textContent=rec?'■ '+Math.min(60,Math.floor((clock()-startAt)/1000))+'с · сохранить':'● Запись';b.setAttribute('aria-label',rec?'Остановить и сохранить в админке':'Записать игровой эпизод');}const last=document.getElementById('record-last2150');if(last)last.hidden=!clip;}
 function release(){try{audioTap?.disconnect(audioSink);}catch(_){}audioTap=audioSink=null;clearInterval(timer);timer=null;for(const t of stream?.getTracks()||[])t.stop();stream=null;rec=null;label();}
 function start(){if(rec)return;if(!supported()){show('Этот браузер не поддерживает запись игры. Откройте игру в браузере с MediaRecorder.');return;}
  try{canvas=document.createElement('canvas');const source=ARCADE.canvas,scale=Math.min(1,960/source.width);canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);ctx=canvas.getContext('2d');
   chunks=[];bytes=0;events=[];startAt=clock();lastFrame=0;sendWhenDone=false;stream=canvas.captureStream(24);
   if(ARCADE.audio?.createMediaStreamDestination&&typeof SPACE_AUDIO!=='undefined'&&SPACE_AUDIO.limit){audioSink=ARCADE.audio.createMediaStreamDestination();audioTap=SPACE_AUDIO.limit;audioTap.connect(audioSink);for(const track of audioSink.stream.getAudioTracks())stream.addTrack(track);}
   const mime=['video/webm;codecs=vp8','video/mp4','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
   rec=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:1500000});
   rec.ondataavailable=ev=>{if(ev.data?.size){chunks.push(ev.data);bytes+=ev.data.size;if(bytes>=MAX_BYTES&&rec?.state==='recording')stop(false);}};
   rec.onerror=()=>{message('Запись прервалась. Сохранённую часть можно скачать.');stop(false);};
   rec.onstop=()=>{const type=chunks[0]?.type||mime||'video/webm',blob=new Blob(chunks,{type});const metadata={...meta(),audio:!!audioSink};release();if(!blob.size){show('Браузер не записал кадры. Попробуйте ещё раз.');return;}clip={id:crypto.randomUUID(),blob,metadata};if(clipURL)URL.revokeObjectURL(clipURL);clipURL=URL.createObjectURL(blob);persist(clip);label();show();if(sendWhenDone)send();};
   rec.start(500);captureFrame(true);timer=setInterval(()=>{label();if(clock()-startAt>=MAX*1000)stop(false);},250);label();
  }catch(error){release();show('Не удалось начать запись: '+String(error.message||error));}
 }
 function captureFrame(force=false){if(!rec||!ctx||!ARCADE.canvas)return;const now=clock();if(!force&&now-lastFrame<1000/24)return;lastFrame=now;
  try{ctx.fillStyle='#071722';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(ARCADE.canvas,0,0,canvas.width,canvas.height);if(ARCADE.hud)ctx.drawImage(ARCADE.hud,0,0,canvas.width,canvas.height);
   const e=ARCADE.engine,caption=e.campaign2120?.modal?.type==='document'?'Карта документа':e.campaign2120?.modal?.type==='bestiary'?'Бестиарий':e.status==='paused'?'Пауза':'';
   ctx.fillStyle='#061320df';ctx.fillRect(0,canvas.height-24,canvas.width,24);ctx.fillStyle='#ebd3a2';ctx.font='12px sans-serif';ctx.fillText('ЦИТАДЕЛЬ · '+(caption||e.phase)+' · '+Math.floor((now-startAt)/1000)+'с · v'+(globalThis.CITADEL_RELEASE?.version||'2.15.0'),10,canvas.height-8);
  }catch(_){stop(false);}
 }
 function openBridge(){nonce=crypto.randomUUID();sent=false;bridge=window.open(ADMIN+'/clips/receive?nonce='+encodeURIComponent(nonce),'citadel-recording');if(!bridge)message('Окно админки заблокировано. Разрешите всплывающее окно или скачайте эпизод.');}
 function stop(save=false){if(!rec)return;sendWhenDone=save;if(save)openBridge();if(rec.state!=='inactive')rec.stop();}
 function send(){if(!clip||!bridge||bridge.closed)return;bridge.postMessage({type:'citadel-clip-offer',nonce},ADMIN);}
 globalThis.addEventListener?.('message',ev=>{if(ev.origin!==ADMIN||ev.source!==bridge||ev.data?.nonce!==nonce)return;
  if(ev.data.type==='citadel-clip-ready'&&clip&&!rec&&!sent){sent=true;bridge.postMessage({type:'citadel-clip',nonce,clip:{...clip,metadata:{...clip.metadata,note:document.getElementById('record-note2150')?.value||''}}},ADMIN);message('Отправляем эпизод в админку…');}
  if(ev.data.type==='citadel-clip-saved'){message('Эпизод сохранён в админке.');clip.saved=true;persist(clip);}
  if(ev.data.type==='citadel-clip-error'){sent=false;message('Не удалось сохранить. Эпизод остался здесь — повторите отправку или скачайте.');}
 });
 function show(error){if(!dialog){dialog=document.createElement('dialog');dialog.className='record-dialog2150';document.body.appendChild(dialog);}ARCADE.engine?.pause();clearArcadeInput();
  dialog.innerHTML='<h3>'+ (error?'Запись эпизода':'Игровой эпизод')+'</h3>'+(error?'<p id="record-status2150"></p>':'<video controls playsinline></video><small>До 60 секунд · игра и HUD · без микрофона</small><textarea id="record-note2150" maxlength="500" placeholder="Что здесь не так? Необязательно"></textarea><p id="record-status2150" role="status">'+(clip?.saved?'Уже сохранено в админке.':'Запись готова. Отправьте её в админку или скачайте.')+'</p>')+'<menu>'+(clip?'<button id="record-send2150">Сохранить в админке</button><a id="record-download2150">Скачать</a>':'')+'<button id="record-close2150">Закрыть</button></menu>';
  if(error)message(error);const v=dialog.querySelector('video');if(v&&clipURL)v.src=clipURL;
  const dl=dialog.querySelector('#record-download2150');if(dl){dl.href=clipURL;dl.download='citadel-'+clip.id+(clip.blob.type.includes('mp4')?'.mp4':'.webm');}
  const b=dialog.querySelector('#record-send2150');if(b)b.onclick=()=>{openBridge();send();};dialog.querySelector('#record-close2150').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
 }
 function persist(value){if(!globalThis.indexedDB)return;const q=indexedDB.open('citadel-clips2150',1);q.onupgradeneeded=()=>q.result.createObjectStore('clips');q.onsuccess=()=>{const db=q.result,tx=db.transaction('clips','readwrite');tx.objectStore('clips').put(value,'latest');tx.oncomplete=()=>db.close();};}
 function restore(){if(!globalThis.indexedDB)return;const q=indexedDB.open('citadel-clips2150',1);q.onupgradeneeded=()=>q.result.createObjectStore('clips');q.onsuccess=()=>{const db=q.result,tx=db.transaction('clips'),get=tx.objectStore('clips').get('latest');get.onsuccess=()=>{if(!clip&&get.result?.blob){clip=get.result;clipURL=URL.createObjectURL(clip.blob);label();}};tx.oncomplete=()=>db.close();};}
 const oldHUD=updateArcadeHUD;updateArcadeHUD=function(...args){const r=oldHUD.apply(this,args);controls();return r;};
 const oldInput=arcadeInput;arcadeInput=function(...args){const input=oldInput.apply(this,args);if(rec&&events.length<1000&&(!events.length||clock()-startAt-events.at(-1).t>500))events.push({t:Math.round(clock()-startAt),phase:ARCADE.engine.phase,fire:!!input.fire,boost:!!input.boost,missile:!!input.missile});return input;};
 globalThis.addEventListener?.('pagehide',()=>stop(false));
 globalThis.CITADEL_RECORDER=Object.freeze({version:'2.15.0',start,stop,captureFrame,supported,status:()=>({recording:!!rec,seconds:rec?Math.floor((clock()-startAt)/1000):0,hasClip:!!clip,saved:!!clip?.saved})});
 restore();
})();
