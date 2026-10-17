/* «Цитадель ЦСИИ» · речь и радио 1.7.0
   Built-in speech synthesis only. No remote TTS, game-state changes or speech queue.
   Load after the core/audio patches, before the academy bridge and lab controls. */
(() => {
  'use strict';
  if(globalThis.CITADEL_VOICE?.version==='1.7.0')return;
  const VERSION='1.7.0',PREF='citadel-academy-voice-v1';
  const CARD_STATES=['lesson','remark','finalcheck'];
  const jokes=Object.freeze([
    'Ну как там требования? Приёмка уже интересуется.',
    'Без ТЗ и результат ХЗ! Держим формулировки под прицелом.',
    'Это не баг. Это требование, которое научилось стрелять.',
    'Сначала критерии приёмки. Потом героизм.',
    'Уточнение на пять минут опять вызвало босса.',
    'Если всё срочно, значит, приоритеты ушли на обед.',
    'Рефакторинг согласования: убираем лишних согласующих.',
    'Технический долг замечен справа. Проценты уже летят.',
    'Требование «сделать красиво» отклонено. Нужны измеримые параметры.',
    'Продакшен спокоен. Кажется, он ещё не видел наш релиз.',
    'Мы почти закончили. Осталось согласовать, что значит «почти».',
    'Команда, без паники. Откат предусмотрен планом.'
  ]);
  const maleName=/(?:^|[^\p{L}])(?:pavel|павел|dmitry|dmitri|дмитрий|yuri|yury|юрий|maxim|максим|alexander|alexandr|aleksandr|александр|mikhail|михаил|vladimir|владимир|viktor|victor|виктор|anton|антон|nikolay|nikolai|николай|sergey|sergei|сергей|ivan|иван|danil|данил)(?=$|[^\p{L}])/iu;
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',
    ndash:' — ',mdash:' — ',hellip:'…',laquo:'«',raquo:'»',lsquo:"'",rsquo:"'",ldquo:'"',rdquo:'"',bull:' ',middot:' ',sol:'/',bsol:'\\'};
  const abbreviations={IT:'айти',API:'эй пи ай',UI:'ю ай',UX:'ю икс',SQL:'эс кью эл',JSON:'джейсон',
    HTML:'эйч ти эм эл',CSS:'си эс эс','ТЗ':'тэ зэ','ХЗ':'ха зэ','ФТ':'эф тэ','МРГ':'эм эр гэ','ЦСИИ':'цэ эс и и'};
  function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,(whole,key)=>{
      if(key[0]==='#') {
        const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
        return Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):' ';
      }
      return entities[key.toLowerCase()]??' ';
    });
  }
  function sanitizeText(value) {
    let text=String(value??'').slice(0,16000);
    // Editors can save literal escapes, sometimes escaped twice. Decode data,
    // never execute it or assign the card's visual text to an HTML container.
    for(let i=0;i<3;i++)text=decodeEntities(text
      .replace(/\\+(?:text|textbf|textit|mathrm|mathbf|emph)\s*\{([^}]*)\}/g,'$1')
      .replace(/\\+([/"'])/g,'$1')
      .replace(/\\+u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
      .replace(/\\+x([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
      .replace(/\\+(?:r\\+n|[nr])/g,'\n').replace(/\\+t/g,' ')
      .replace(/\\+(?:slash|backslash)\b/gi,' '));
    text=text.replace(/<!--[\s\S]*?-->/g,' ')
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
      .replace(/<(?:br|hr)\b[^>]*\/?>|<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote)\s*>/gi,'\n')
      .replace(/<\/?[a-z][^>]*>/gi,' ')
      .replace(/\x60{3}(?:[\w+-]+)?[ \t]*\r?\n/g,'\n').replace(/\x60{3}/g,' ')
      .replace(/!?\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g,'$1')
      .replace(/!?\[([^\]]+)\]\[[^\]]*\]/g,'$1')
      .replace(/^\s*\[[^\]]+\]:[^\n]*$/gm,' ')
      .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi,' ')
      .replace(/^[ \t]*(?:#{1,6}\s*|>\s*|[-+*]\s+|\d+[.)]\s+)/gm,'')
      .replace(/(?:\*\*|__|~~|\x60)/g,'').replace(/[*_]/g,' ')
      .replace(/\\+(?:text|mathrm|mathbf|emph)\s*\{([^}]*)\}/g,'$1')
      .replace(/[\\/|{}[\]]+/g,' ')
      .replace(/[<>]/g,' ')
      .replace(/&+/g,' и ')
      .replace(/[\p{Extended_Pictographic}\u200b-\u200f\u2060\ufeff\ufe0f]/gu,' ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ')
      .replace(/\r/g,'\n').replace(/[ \t]*\n+[ \t]*/g,'. ')
      .replace(/\s+/g,' ').replace(/\s+([.,;:!?])/g,'$1')
      .replace(/\.{2,}/g,'.').replace(/([.!?])\s*\./g,'$1')
      .replace(/(^|[^\p{L}])(IT|API|UI|UX|SQL|JSON|HTML|CSS|ТЗ|ХЗ|ФТ|МРГ|ЦСИИ)(?=$|[^\p{L}])/gu,(_,before,key)=>before+abbreviations[key]);
    return text.replace(/^[\s.,;:]+|[\s,;:]+$/g,'').trim();
  }
  let enabled=true;
  try{enabled=JSON.parse(localStorage.getItem(PREF)||'true')!==false;}catch{}
  let generation=0,current=null,lessonIndex=0,jokeIndex=Math.floor(Math.random()*jokes.length),disposed=false;
  let clocks=new WeakMap(),lastError='',lastReason='',lastSpoken=null;
  const synth=()=>globalThis.speechSynthesis;
  const supported=()=>!!synth()&&typeof globalThis.SpeechSynthesisUtterance==='function';
  const engine=()=>typeof ARCADE==='undefined'?null:ARCADE.engine;
  const inView=()=>typeof STATE==='undefined'||STATE.view==='arcade';
  const visible=()=>typeof document==='undefined'||!document.hidden;
  function ruVoices() {
    try{return (synth()?.getVoices()||[]).filter(v=>/^ru(?:[-_]|$)/i.test(v.lang||''))
      .sort((a,b)=>Number(a.localService===false)-Number(b.localService===false));}catch{return [];}
  }
  function voices() {
    return ruVoices().map(v=>({name:v.name,lang:v.lang,local:v.localService!==false,maleNameHint:maleName.test(v.name||'')}));
  }
  function chooseVoice(kind) {
    const available=ruVoices(),local=available.filter(v=>v.localService!==false),pool=local.length?local:available;
    if(kind==='commander')return pool.find(v=>maleName.test(v.name||''))||available.find(v=>maleName.test(v.name||''))||pool[0]||null;
    return pool.length?pool[(lessonIndex++)%pool.length]:null;
  }
  function combat(e) {
    if(!e||!['playing','boarding'].includes(e.status)||!visible()||!inView())return false;
    if(e.finale?.phase==='mrg')return !(e.finale.defeatTime>0);
    if(e.finale&&['upload','victory','landing'].includes(e.finale.phase))return false;
    if(e.status==='boarding')return !!e.board?.enemies?.some(x=>!x.dead&&(x.hp??1)>0)||!!e.board?.hostile?.length;
    return ['battle','escort'].includes(e.phase)||['boss','breach'].includes(e.finale?.phase)||
      !!e.boss||!!e.enemies?.some(x=>!x.dead)||!!e.hostile?.length;
  }
  function cardStamp(e) {
    if(!e)return '';
    return [e.seed,e.status,e.lesson?.caseIndex,e.board?.question,e.board?.completed?.length,
      e.lesson?.feedback?.index,e.remarkFeedback?.index,e.finale?.answer].join('|');
  }
  function permitted(job) {
    if(disposed||!enabled||!visible()||!inView())return false;
    if(job.engine&&engine()&&job.engine!==engine())return false;
    return job.preview||job.kind==='lesson'&&CARD_STATES.includes(job.engine?.status)&&job.card===cardStamp(job.engine)||
      job.kind==='commander'&&combat(job.engine);
  }
  function status() {
    const list=voices();
    return {version:VERSION,supported:supported(),enabled,busy:!!current,phase:current?.phase||'idle',
      kind:current?.kind||null,preview:!!current?.preview,started:!!current?.started,
      voice:current?.voice?.name||null,ruVoices:list.length,maleCommanderAvailable:list.some(v=>v.maleNameHint),
      lastSpoken:lastSpoken?{...lastSpoken}:null,lastError,lastReason,disposed};
  }
  function syncControls() {
    if(typeof document==='undefined')return;
    // Core initialize() can render the panel before this deferred module loads.
    // Reconcile that existing DOM as well as panels created by later renders.
    for(const panel of document.querySelectorAll?.('.space-audio-buttons')||[]) {
      if(panel.querySelector('[data-action="arcade-voice"]'))continue;
      const button=document.createElement('button');
      button.type='button';button.setAttribute('data-action','arcade-voice');
      panel.insertBefore(button,panel.firstChild);
    }
    for(const button of document.querySelectorAll?.('[data-action="arcade-voice"]')||[]) {
      const label='Голос '+(enabled?'вкл':'выкл');
      if(button.textContent!==label)button.textContent=label;
      button.setAttribute('aria-pressed',String(enabled));
      button.setAttribute('aria-label','Озвучка и радио: '+(enabled?'включены':'выключены'));
    }
  }
  function announce(name='citadel-voice-status') {
    syncControls();
    try{globalThis.dispatchEvent?.(new CustomEvent(name,{detail:status()}));}catch{}
  }
  function later(job,callback,ms) {
    const timer=setTimeout(()=>{job.timers.delete(timer);if(current===job&&job.token===generation)callback();},ms);
    job.timers.add(timer);return timer;
  }
  function clearTimers(job) {for(const id of job.timers)clearTimeout(id);job.timers.clear();}
  function settle(job,result) {if(!job.settled){job.settled=true;job.resolve({...result,kind:job.kind});}}
  function stop(reason='stopped') {
    generation++;const job=current;current=null;lastReason=reason;
    if(job){clearTimers(job);if(job.utter){job.utter.onstart=job.utter.onend=job.utter.onerror=null;try{synth()?.cancel();}catch{}}
      settle(job,{ok:false,reason});}
    try{globalThis.CITADEL_SFX?.stopRadio?.();}catch{}
    announce();return {ok:true,stopped:!!job};
  }
  function setEnabled(value) {
    const next=!!value;if(next===enabled)return status();
    enabled=next;clocks=new WeakMap();
    // Deliberately use lexical storage: the private lab supplies an in-memory
    // implementation before this module. Never access window.localStorage here.
    try{localStorage.setItem(PREF,JSON.stringify(enabled));}catch{}
    if(!enabled)stop('disabled');
    announce('citadel-voice-change');return status();
  }
  function syncRadio(kind) {
    try{
      if(typeof spacePlayEffect!=='function'||globalThis.CITADEL_SFX?.status?.().contextState!=='running')return false;
      return !!spacePlayEffect(kind);
    }catch{return false;}
  }
  function finish(job,reason='ended',withRadio=false) {
    if(current!==job||job.token!==generation)return;
    if(withRadio&&job.phase==='radio-out')return;
    clearTimers(job);job.utter=null;
    if(withRadio&&job.preview&&permitted(job)&&globalThis.CITADEL_SFX?.play) {
      job.phase='radio-out';announce();
      const sfx=globalThis.CITADEL_SFX;
      const timeout=later(job,()=>{job.tailDone=true;try{sfx.stopRadio?.();}catch{}finish(job,reason,false);},700);
      try{Promise.resolve(sfx.play('radio-out')).then(result=>{
        if(current!==job||job.token!==generation||job.tailDone)return;
        job.tailDone=true;clearTimeout(timeout);job.timers.delete(timeout);
        later(job,()=>finish(job,reason,false),result?.ok?80:0);
      },()=>{if(current===job&&!job.tailDone){job.tailDone=true;finish(job,reason,false);}});}
      catch{finish(job,reason,false);}
      return;
    }
    if(withRadio&&permitted(job)&&syncRadio('radio-out')) {
      job.phase='radio-out';announce();later(job,()=>finish(job,reason,false),80);return;
    }
    current=null;lastReason=reason;
    settle(job,{ok:false,reason:job.started?reason:'not-started'});
    announce();
  }
  function startSpeech(job) {
    if(current!==job||job.token!==generation||job.phase!=='preparing')return;
    if(!permitted(job)){stop('inactive');return;}
    const speech=synth();
    if(speech.speaking||speech.pending){finish(job,'busy');return;}
    try {
      job.voice=chooseVoice(job.kind);
      const utter=new globalThis.SpeechSynthesisUtterance(job.text);job.utter=utter;utter.lang='ru-RU';
      if(job.voice)utter.voice=job.voice;
      const variation=lessonIndex%3;
      utter.rate=job.kind==='commander'?1.06:[1.01,1.04,.99][variation];
      utter.pitch=job.kind==='commander'?.94:[1.02,1,.98][variation];utter.volume=1;
      job.phase='starting';
      const startup=later(job,()=>{lastError='not-started';stop('not-started');},6000);
      utter.onstart=()=>{
        if(current!==job||job.token!==generation)return;
        if(!permitted(job)){stop('inactive');return;}
        clearTimeout(startup);job.timers.delete(startup);job.started=true;job.phase='speaking';
        lastSpoken={kind:job.kind,text:job.text,voice:job.voice?.name||'ru-RU system',maleNameHint:maleName.test(job.voice?.name||'')};
        settle(job,{ok:true,started:true,text:job.text,voice:job.voice?.name||null});
        later(job,()=>{lastError='speech-timeout';stop('speech-timeout');},Math.min(300000,Math.max(20000,job.text.length*160+5000)));
        announce();
      };
      utter.onend=()=>finish(job,'ended',job.kind==='commander');
      utter.onerror=event=>{if(current!==job)return;lastError=String(event?.error||'speech-error');finish(job,lastError);};
      speech.speak(utter);announce();
    }catch(error){lastError=String(error?.message||'speech-error');finish(job,'speech-error');}
  }
  function request(kind,text,{preview=false}={}) {
    const clean=sanitizeText(text);
    const reason=disposed?'disposed':!supported()?'unsupported':!enabled?'disabled':!visible()?'hidden':!inView()?'outside-game':!clean?'empty':null;
    if(reason)return Promise.resolve({ok:false,kind,reason});
    const source=engine(),check={kind,preview,engine:source,card:cardStamp(source)};
    if(!permitted(check))return Promise.resolve({ok:false,kind,reason:'inactive'});
    if(current)stop('replaced');
    else if(synth().speaking||synth().pending)return Promise.resolve({ok:false,kind,reason:'busy'});
    lastError='';lastReason='';
    return new Promise(resolve=>{
      const job={...check,text:clean,token:++generation,resolve,timers:new Set(),settled:false,started:false,phase:'preparing',voice:null,utter:null};
      current=job;announce();
      if(kind!=='commander'){startSpeech(job);return;}
      if(!preview){later(job,()=>startSpeech(job),syncRadio('radio-in')?110:0);return;}
      const sfx=globalThis.CITADEL_SFX;
      if(!sfx?.play){startSpeech(job);return;}
      // A silent/blocked effect must not strand the speech preview. Invalidate a
      // delayed radio resume before starting speech without its prefix.
      const timeout=later(job,()=>{job.prefixDone=true;try{sfx.stopRadio?.();}catch{}startSpeech(job);},700);
      Promise.resolve(sfx.play('radio-in')).then(result=>{
        if(current!==job||job.token!==generation||job.prefixDone)return;
        job.prefixDone=true;
        clearTimeout(timeout);job.timers.delete(timeout);
        later(job,()=>startSpeech(job),result?.ok?110:0);
      },()=>{
        if(current!==job||job.prefixDone)return;job.prefixDone=true;clearTimeout(timeout);job.timers.delete(timeout);startSpeech(job);
      });
    });
  }
  const speakLesson=(text,options={})=>request('lesson',text,options);
  const previewLesson=text=>request('lesson',text??'Хорошее требование понятно, проверяемо и не оставляет места догадкам.',{preview:true});
  const nextJoke=()=>jokes[(jokeIndex++)%jokes.length];
  const previewCommander=text=>request('commander',text??nextJoke(),{preview:true});
  function tick(e,delta) {
    if(current&&!permitted(current))stop('inactive');
    if(e!==engine()||!enabled||disposed)return;
    let clock=clocks.get(e);
    if(!clock){clock={elapsed:0,next:35+Math.random()*30,active:false,captainSerial:null,captainUntil:0};clocks.set(e,clock);}
    if(!combat(e)){clock.active=false;return;}
    if(!clock.active){clock.next=Math.max(clock.next,clock.elapsed+8);clock.active=true;}
    clock.elapsed+=Math.max(0,Math.min(.04,Number(delta)||0));
    const captainSerial=e.captain?.serial??e.captain?.text??null;
    if(clock.captainSerial!==captainSerial) {
      clock.captainSerial=captainSerial;
      // The frozen lab's original MRG step never reduces captainClock. Respect
      // each fresh message for its normal lifetime without changing game state
      // or letting a stale HUD message silence the radio for an entire mission.
      clock.captainUntil=clock.elapsed+Math.min(6,Math.max(0,Number(e.captainClock)||0));
    }
    if(clock.elapsed<clock.next)return;
    clock.next=clock.elapsed+35+Math.random()*30;
    // Never queue a joke behind speech. A tactical warning instead gets a short
    // retry window: no line is selected until the channel is actually clear.
    const f=e.finale;
    if(current||synth()?.speaking||synth()?.pending)return;
    if(e.captainClock>0&&clock.elapsed<clock.captainUntil||f?.telegraph>0||f?.waveIntro>0||['telegraph','active'].includes(f?.tentacle?.phase)) {
      clock.next=clock.elapsed+8+Math.random()*4;return;
    }
    const line=nextJoke();
    request('commander',line).then(result=>{if(result.ok&&combat(e))e.say?.(line,'order',false);});
  }
  function hookAnswers(proto) {
    for(const [name,kind,total] of [['answerLesson','lesson',4],['answer','remark',3],['answerFinale','finalcheck',3]]) {
      const original=proto[name];if(typeof original!=='function')continue;
      proto[name]=function(index,...rest) {
        const active=this.status===kind&&Number.isInteger(index)&&index>=0&&index<total&&
          (kind==='lesson'?!this.lesson?.solved:kind==='remark'?!this.board?.answered:this.finale?.answer===null);
        const slot=kind==='lesson'?this.lesson?.caseIndex:kind==='remark'?this.board?.question:this.board?.completed?.length;
        const result=original.call(this,index,...rest);
        if(active&&this===engine())try {
          const q=kind==='lesson'?citadelLessonCase(this,slot):kind==='remark'?citadelRemarkCase(this,slot):citadelFinalCase(slot);
          // The later academy bridge speaks its actual edited lesson. It must be
          // the only narrator for decorated cards, including incorrect answers.
          if(!q?.academyLesson) {
            const correct=kind==='lesson'?!!this.lesson?.feedback?.correct:kind==='remark'?!!this.remarkFeedback?.correct:result===true;
            const explanation=q?.why||q?.lesson||q?.outcome?.after||'Проверьте формулировку и критерий приёмки.';
            speakLesson((correct?'Верное решение. ':'Это решение требует пересмотра. ')+explanation);
          }
        }catch{}
        return result;
      };
    }
  }
  if(typeof RequirementArcade!=='undefined') {
    const proto=RequirementArcade.prototype,step=proto.step;
    proto.step=function(delta,...args){const result=step.call(this,delta,...args);tick(this,delta);return result;};
    for(const name of ['pause','continueLesson','continueRemark','continueFinaleCheck','beginStage','beginMRG','retryFinale']) {
      const original=proto[name];if(typeof original!=='function')continue;
      proto[name]=function(...args){if(this===engine())stop(name);return original.apply(this,args);};
    }
    hookAnswers(proto);
  }
  if(typeof spaceAudioStop==='function') {
    const original=spaceAudioStop;
    spaceAudioStop=function(...args){try{return original.apply(this,args);}finally{stop('audio-stop');}};
  }
  if(typeof spaceAudioMarkup==='function') {
    const original=spaceAudioMarkup;
    spaceAudioMarkup=function(...args) {
      return original.apply(this,args).replace('<div class="space-audio-buttons">','<div class="space-audio-buttons"><button type="button" data-action="arcade-voice" aria-pressed="'+enabled+'">Голос '+(enabled?'вкл':'выкл')+'</button>');
    };
  }
  if(typeof spaceAudioAction==='function') {
    const original=spaceAudioAction;
    spaceAudioAction=function(action,...args){if(action==='arcade-voice'){setEnabled(!enabled);return true;}return original.call(this,action,...args);};
  }
  if(typeof spaceAudioControls==='function') {
    const original=spaceAudioControls;
    spaceAudioControls=function(...args){const result=original.apply(this,args);syncControls();return result;};
  }
  if(typeof arcadeAction==='function') {
    const original=arcadeAction;
    arcadeAction=function(...args){const result=original.apply(this,args);if(current&&!permitted(current))stop('scene-change');return result;};
  }
  const hidden=()=>{if(!visible())stop('hidden');},pagehide=()=>stop('pagehide'),blur=()=>stop('blur'),changed=()=>announce('citadel-voice-change');
  const keyboard=event=>{if(event.target?.closest?.('[data-action="arcade-voice"]'))event.stopImmediatePropagation();};
  if(typeof document!=='undefined'){document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',keyboard,true);}
  globalThis.addEventListener?.('pagehide',pagehide);globalThis.addEventListener?.('blur',blur);
  synth()?.addEventListener?.('voiceschanged',changed);
  globalThis.CITADEL_VOICE=Object.freeze({
    version:VERSION,get enabled(){return enabled;},setEnabled,speakLesson,previewLesson,previewCommander,stop,status,sanitizeText,voices,jokes,
    dispose(){if(disposed)return;stop('disposed');disposed=true;
      if(typeof document!=='undefined'){document.removeEventListener?.('visibilitychange',hidden);document.removeEventListener?.('keydown',keyboard,true);}
      globalThis.removeEventListener?.('pagehide',pagehide);globalThis.removeEventListener?.('blur',blur);
      synth()?.removeEventListener?.('voiceschanged',changed);
    }
  });
  syncControls();
})();
