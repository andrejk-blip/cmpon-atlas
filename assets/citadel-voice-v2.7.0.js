/* «Цитадель ЦСИИ» · голос капитана и радио 2.7.0
   Prepared radio recordings use the game's one shared AudioContext. Expanded
   dialogue is shipped as same-origin MP3; an installed Russian system voice
   remains an optional fallback if a recording cannot load. No network TTS, credentials, gameplay changes or queue.
   Load after all gameplay/audio patches, before the academy bridge and lab controls. */
(() => {
  'use strict';
  if(globalThis.CITADEL_VOICE?.version==='2.7.0'&&!globalThis.CITADEL_VOICE.status().disposed)return;
  globalThis.CITADEL_VOICE?.dispose?.();
  const VERSION='2.7.0',PREF='citadel-academy-voice-v1',STYLE_PREF='citadel-radio-voice-style-v2';
  const CARD_STATES=['lesson','remark','finalcheck'];
  const fallbackJokes=Object.freeze([
    'Без ТЗ и результат ХЗ! Держим формулировки под прицелом.',
    'Ну как там требования? Приёмка уже интересуется.',
    'Это не баг. Это требование, которое научилось стрелять.',
    'Сначала критерии приёмки. Потом героизм.',
    'Уточнение на пять минут опять вызвало босса.',
    'Технический долг замечен справа. Проценты уже летят.',
    'Продакшен спокоен. Кажется, он ещё не видел наш релиз.',
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
  let radioStyle='original';
  try{if(localStorage.getItem(STYLE_PREF)==='ensemble')radioStyle='ensemble';}catch{}
  let generation=0,current=null,jokeIndex=0,disposed=false,selectedVoice='',selectedEnemyVoice='';
  const SILENCE=3.2, CADENCE=3, restorers=[];
  const nextInterval=()=> (35+Math.random()*30)/CADENCE;
  function replace(get,set,wrapped) { const previous=get();set(wrapped);restorers.push(()=>{if(get()===wrapped)set(previous);}); }
  const soundOn=()=>typeof ARCADE==='undefined'||ARCADE.sound!==false;
  let radioCaption=null;
  const stats={textRadioStarts:0,radioStarts:0,radioCompleted:0,radioInterrupted:0,recordedStarts:0,systemStarts:0};
  let lastRadioEnd=-Infinity,systemRadioBlockedUntil=-Infinity;
  const wallNow=()=>typeof performance!=='undefined'?performance.now()/1000:Date.now()/1000;
  function markStarted(job) {
    if(job.kind!=='commander'||job.preview)return;
    stats.radioStarts++;stats[job.source==='recorded'?'recordedStarts':'systemStarts']++;
    const c=clocks.get(job.engine);if(c){c.next=c.elapsed+nextInterval();c.turn++;}
    if(job.radioId){radioRecent.push(job.radioId);if(radioRecent.length>18)radioRecent.shift();}
    // Caption is published only after actual speech/audio starts, with the
    // speaker identity. A rejected autoplay promise never produces fake radio.
    if(job.caption&&permitted(job)){job.engine.say?.(job.caption,'order',false);showRadioCaption(job.engine,job.caption,Math.max(6,(job.buffers||[]).reduce((n,b)=>n+b.duration,0)));}
  }
  function markFinished(job,reason) {
    if(job.radioEnded||job.kind!=='commander'||job.preview||!job.started)return;
    job.radioEnded=true;lastRadioEnd=wallNow();
    stats[reason==='ended'?'radioCompleted':'radioInterrupted']++;
    const c=clocks.get(job.engine);if(c)c.quietUntil=c.elapsed+SILENCE;
  }

  const radioCycles=new Map(),radioRecent=[];
  const radioPools=Object.freeze({
    orbit:['commander-02','commander-01','commander-04','commander-03','commander-12'],
    base:['commander-04','commander-05','commander-03','commander-12'],
    pursuit:['commander-01','commander-04','commander-05','commander-12'],
    swarm:['commander-03','commander-05','commander-04','commander-12'],
    convoy:['commander-04','commander-12','commander-01','commander-10'],
    parallax:['commander-04','commander-05','commander-12','commander-03'],
    mrg:['commander-04','commander-05','commander-12','commander-03']
  });
  const fallbackIds=['commander-02','commander-01','commander-03','commander-04','commander-05','commander-08','commander-10','commander-12'];
  let clocks=new WeakMap(),lastError='',lastReason='',lastSpoken=null;
  const synth=()=>globalThis.speechSynthesis;
  const speechSupported=()=>!!synth()&&typeof globalThis.SpeechSynthesisUtterance==='function';
  const russianRadioAvailable=()=>speechSupported()&&ruVoices().length>0&&wallNow()>=systemRadioBlockedUntil;
  function radioSpeechFailure(job) {if(job.kind==='commander')systemRadioBlockedUntil=wallNow()+60;}
  const audioContext=()=>typeof ARCADE==='undefined'?null:ARCADE.audio;
  const recordingSupported=()=>typeof globalThis.fetch==='function'&&
    (!!audioContext()||typeof globalThis.AudioContext==='function'||typeof globalThis.webkitAudioContext==='function');
  const supported=()=>speechSupported()||recordingSupported()&&prepared().clips.length>0;
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
  function chooseVoice() {
    const available=ruVoices(),local=available.filter(v=>v.localService!==false),pool=local.length?local:available;
    const key=v=>String(v.voiceURI||v.name||'')+'|'+String(v.lang||'');
    // Keep one identity when voiceschanged returns new objects or a different
    // list order. Late voices can fill an empty choice, never rotate narration.
    const previous=available.find(v=>key(v)===selectedVoice);
    const voice=previous||pool.find(v=>maleName.test(v.name||''))||available.find(v=>maleName.test(v.name||''))||pool[0]||null;
    if(voice)selectedVoice=key(voice);
    return voice;
  }
  let radioRef=null,packRef=null,packIndex={clips:[],byText:new Map(),commanders:[],prefixes:[],voice:'Капитан',baseUrl:''};
  const buffers=new Map(),duckBaselines=new WeakMap();
  let cachedBytes=0;
  function prepared() {
    const pack=globalThis.CITADEL_VOICE_PACK,radio=globalThis.CITADEL_RADIO_PACK;
    if(pack===packRef&&radio===radioRef)return packIndex;
    packRef=pack;radioRef=radio;
    const clips=[],byText=new Map(),ids=new Set();
    const all=[...(Array.isArray(pack?.clips)?pack.clips:[]).map(x=>({...x,baseUrl:pack.baseUrl})),
      ...(Array.isArray(radio?.clips)?radio.clips:[]).map(x=>({...x,baseUrl:radio.baseUrl}))];
    for(const entry of all) {
      if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||typeof entry.file!=='string'||!entry.file||typeof entry.text!=='string')continue;
      const text=sanitizeText(entry.text);
      if(!text||byText.has(text))continue;
      const clip={...entry,text};clips.push(clip);byText.set(text,clip);ids.add(clip.id);
    }
    packIndex={clips,byText,commanders:clips.filter(x=>x.kind==='commander'),prefixes:clips.filter(x=>x.kind==='prefix'),
      voice:String(pack?.voice||'Капитан'),baseUrl:String(pack?.baseUrl||'./assets/voice-v1.8.2/')};
    return packIndex;
  }
  const originalClip=clip=>!!clip&&(!clip.id.startsWith('radio270-')||clip.preset==='Bernard'||clip.voice==='Капитан · Bernard');
  function playlist(kind,text) {
    const pack=prepared(),direct=pack.byText.get(text);
    if(direct&&(radioStyle==='ensemble'||originalClip(direct))&&(kind==='commander'?direct.kind==='commander':['lesson','preview','prefix'].includes(direct.kind)))return [direct];
    if(kind==='lesson')for(const prefix of pack.prefixes) {
      if(!text.startsWith(prefix.text+' '))continue;
      const body=pack.byText.get(text.slice(prefix.text.length+1));
      if(body?.kind==='lesson'&&(radioStyle==='ensemble'||originalClip(prefix)&&originalClip(body)))return [prefix,body];
    }
    return null;
  }
  function clipUrl(clip) {
    const base=clip.baseUrl||prepared().baseUrl,origin=typeof document!=='undefined'?document.baseURI:null;
    try{return new URL(clip.file,new URL(base,origin||globalThis.location?.href)).href;}
    catch{return /^(?:https?:|data:|blob:)/i.test(clip.file)?clip.file:base.replace(/\/?$/,'/')+clip.file;}
  }
  function cached(url) {
    const entry=buffers.get(url);
    if(entry){buffers.delete(url);buffers.set(url,entry);return entry.buffer;}
    return null;
  }
  function remember(url,buffer) {
    const size=Math.max(0,Number(buffer.length)||0)*Math.max(1,Number(buffer.numberOfChannels)||1)*4;
    // Decode only requested clips; a bounded LRU keeps long Android sessions
    // from retaining the entire lesson bank as uncompressed PCM.
    if(size>12*1024*1024)return;
    const old=buffers.get(url);if(old)cachedBytes-=old.size;
    buffers.delete(url);buffers.set(url,{buffer,size});cachedBytes+=size;
    while(buffers.size>24||cachedBytes>12*1024*1024){const key=buffers.keys().next().value;cachedBytes-=buffers.get(key).size;buffers.delete(key);}
  }
  function alive(job,attempt=job.attempt) {
    if(current!==job||job.token!==generation||job.attempt!==attempt)return false;
    if(!permitted(job)){stop('inactive');return false;}
    return true;
  }
  function ramp(param,value,time,fade) {
    if(!param)return;
    try{param.cancelScheduledValues?.(time);if(param.setTargetAtTime)param.setTargetAtTime(value,time,fade);else param.value=value;}catch{}
  }
  function duck(job) {
    const context=job.context||audioContext(),bus=typeof SPACE_AUDIO==='undefined'?null:SPACE_AUDIO.bus;
    if(!context||context.state!=='running'||!bus?.gain)return;
    if(!duckBaselines.has(bus))duckBaselines.set(bus,Number.isFinite(bus.gain.value)?bus.gain.value:1);
    job.duck={bus,context,baseline:duckBaselines.get(bus)};
    ramp(bus.gain,job.duck.baseline*.35,context.currentTime,.06);
  }
  function unduck(job) {
    const state=job.duck;if(!state)return;job.duck=null;
    ramp(state.bus.gain,state.baseline,state.context.currentTime,.18);
  }
  function clearRecording(job) {
    try{job.controller?.abort();}catch{}job.controller=null;
    const source=job.sourceNode;job.sourceNode=null;
    if(source){source.onended=null;try{source.stop();}catch{}try{source.disconnect();}catch{}}
    try{job.gain?.disconnect();}catch{}job.gain=null;job.buffers=null;
    if(job.context&&job.contextChanged)try{job.context.removeEventListener?.('statechange',job.contextChanged);}catch{}
    job.contextChanged=null;unduck(job);
  }
  function sharedContext() {
    if(typeof ARCADE==='undefined')return null;
    let context=ARCADE.audio;
    if(context?.state==='closed')return null;
    if(!context) {
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(typeof Audio!=='function')return null;
      // arcadeAudio() declines to create a context when both music and SFX are
      // muted. Voice is a separate preference, but still shares ARCADE.audio.
      context=new Audio();ARCADE.audio=context;
    }
    if(typeof spaceAudioInit==='function')spaceAudioInit(context);
    return context;
  }
  function decode(context,data) {
    return new Promise((resolve,reject)=>{
      try{
        // Callback form remains usable on older WebViews; Promise form works
        // too. A Promise settles once if a browser implements both forms.
        const pending=context.decodeAudioData(data,resolve,reject);
        if(pending?.then)pending.then(resolve,reject);
      }catch(error){reject(error);}
    });
  }
  async function loadClip(job,clip,attempt) {
    const url=clipUrl(clip),hit=cached(url);if(hit)return hit;
    const response=await globalThis.fetch(url,{cache:'force-cache',credentials:'same-origin',...(job.controller?{signal:job.controller.signal}:{})});
    if(!alive(job,attempt))return null;
    if(!response?.ok)throw Error('recording-http-'+String(response?.status||'error'));
    const data=await response.arrayBuffer();
    if(!alive(job,attempt))return null;
    if(!data?.byteLength||data.byteLength>8*1024*1024)throw Error('recording-size');
    const buffer=await decode(job.context,data);
    if(!alive(job,attempt))return null;
    if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('recording-decode');
    remember(url,buffer);return buffer;
  }
  function beginClip(job,index,attempt) {
    if(!alive(job,attempt))return;
    if(job.context.state!=='running'){lastError='audio-suspended';stop('audio-suspended');return;}
    const buffer=job.buffers[index];
    if(!buffer){finish(job,'ended');return;}
    try{
      const source=job.context.createBufferSource();source.buffer=buffer;source.connect(job.gain);job.sourceNode=source;
      source.onended=()=>{
        if(!alive(job,attempt)||job.sourceNode!==source)return;
        source.onended=null;try{source.disconnect();}catch{}job.sourceNode=null;
        beginClip(job,index+1,attempt);
      };
      job.clipIndex=index;
      // BufferSource has no onstart event. We report success only after its
      // immediate start() succeeds in a running, resumed context.
      source.start();
      if(!job.started) {
        job.started=true;job.phase='playing';duck(job);
        const spokenText=job.clips.map(x=>x.spokenText||x.text).join(' ');
        lastSpoken={kind:job.kind,text:job.text,spokenText,voice:job.voice.name,source:'recorded',clipIds:job.clips.map(x=>x.id),maleNameHint:false,speaker:job.speaker||'captain',context:job.contextKey||null};
        markStarted(job);
        settle(job,{ok:true,started:true,text:job.text,spokenText,voice:job.voice.name,source:'recorded'});
        later(job,()=>{lastError='recording-timeout';stop('recording-timeout');},Math.min(300000,Math.max(15000,job.buffers.reduce((sum,x)=>sum+x.duration,0)*1000+6000)));
      }
      announce();
    }catch(error){lastError=String(error?.message||'recording-play');if(!job.started)fallback(job,lastError);else stop('recording-play');}
  }
  function fallback(job,reason) {
    if(!alive(job))return;
    job.attempt++;clearTimers(job);clearRecording(job);lastError=reason;
    if(radioStyle==='original'||!speechSupported()||(job.kind==='commander'&&!ruVoices().length)){finish(job,reason||'recording-unavailable');return;}
    job.source='system';job.phase='preparing';job.voice=null;
    startSystem(job);
  }
  async function startRecording(job) {
    const attempt=++job.attempt;
    try{
      job.context=sharedContext();
      if(!job.context){fallback(job,'audio-unavailable');return;}
      job.controller=typeof globalThis.AbortController==='function'?new globalThis.AbortController():null;
      job.phase='loading';job.voice={name:job.clips[0]?.voice||prepared().voice};announce();
      const timeout=later(job,()=>fallback(job,'recording-load-timeout'),12000);
      // resume() is invoked synchronously inside the user's answer/preview
      // gesture, before any network await. Its late completion cannot start a
      // cancelled job, nor mute or revive music after leaving the game.
      const resumed=job.context.state==='running'?Promise.resolve():Promise.resolve(job.context.resume());
      const [loaded]=await Promise.all([Promise.all(job.clips.map(clip=>loadClip(job,clip,attempt))),resumed]);
      if(!alive(job,attempt))return;
      clearTimeout(timeout);job.timers.delete(timeout);
      if(job.context.state!=='running')throw Error('audio-blocked');
      if(loaded.some(x=>!x))throw Error('recording-unavailable');
      job.buffers=loaded;job.gain=job.context.createGain();job.gain.gain.value=1;
      job.gain.connect(typeof SPACE_AUDIO!=='undefined'&&SPACE_AUDIO.limit?SPACE_AUDIO.limit:job.context.destination);
      job.contextChanged=()=>{if(current===job&&job.started&&job.context.state!=='running')stop('audio-suspended');};
      job.context.addEventListener?.('statechange',job.contextChanged);
      beginClip(job,0,attempt);
    }catch(error){if(alive(job,attempt))fallback(job,String(error?.message||'recording-unavailable'));}
  }
  function combat(e) {
    if(!e||!['playing','boarding'].includes(e.status)||!visible()||!inView()||!soundOn())return false;
    if(e.finale?.phase==='mrg')return !(e.finale.defeatTime>0);
    if(e.finale&&['upload','victory','landing'].includes(e.finale.phase))return false;
    // A quiet flight, a collection leg and a cleared corridor are still part
    // of the mission. Only enemy turns require an actually present adversary.
    return true;
  }
  function enemyPresent(e) {
    if(e?.phase==='pursuit'&&e.pursuit&&!e.pursuit.complete)return true;
    if(e?.finale?.phase==='boss')return true;
    const bodies=e?.status==='boarding'?e.board?.enemies:e?.enemies;
    if(bodies?.some(x=>!x.dead&&(x.hp??1)>0))return true;
    if(e?.finale?.phase==='mrg')return !!e.finale.mrg?.soldiers?.some(x=>!x.dead&&(x.hp??1)>0)||
      !!e.finale.soldiers?.some(x=>!x.dead&&(x.hp??1)>0)||!!e.board?.enemies?.some(x=>!x.dead&&(x.hp??1)>0);
    return !!e?.boss&&!e.boss.dead&&(e.boss.hp??1)>0;
  }
  function sceneStamp(e) {return [e?.seed,e?.stage,radioContext(e),e?.finale?.phase||e?.phase].join('|');}
  function cardStamp(e) {
    if(!e)return '';
    return [e.seed,e.status,e.lesson?.caseIndex,e.board?.question,e.board?.completed?.length,
      e.lesson?.feedback?.index,e.remarkFeedback?.index,e.finale?.answer].join('|');
  }
  function permitted(job) {
    if(disposed||!enabled||!soundOn()||!visible()||!inView())return false;
    if(job.engine!==engine())return false;
    return job.preview||job.kind==='lesson'&&CARD_STATES.includes(job.engine?.status)&&job.card===cardStamp(job.engine)||
      job.kind==='commander'&&combat(job.engine)&&(!job.scene||job.scene===sceneStamp(job.engine))&&
        (job.speaker!=='enemy'||enemyPresent(job.engine));
  }
  function status() {
    const list=voices(),pack=prepared(),preparedAvailable=pack.clips.length>0&&recordingSupported();
    return {version:VERSION,build:'280r1',radioStyle,textRadioStarts:stats.textRadioStarts,originalRadioClips:pack.commanders.filter(originalClip).length,supported:supported(),enabled,busy:!!current,phase:current?.phase||'idle',
      kind:current?.kind||null,preview:!!current?.preview,started:!!current?.started,
      voice:current?.voice?.name||null,ruVoices:list.length,maleCommanderAvailable:list.some(v=>v.maleNameHint),
      preparedAvailable,preparedClips:pack.clips.length,backend:preparedAvailable?'recorded':speechSupported()?'system':'unavailable',
      source:current?.source||lastSpoken?.source||null,clipId:current?.clips?.[current.clipIndex]?.id||null,
      lastSpoken:lastSpoken?{...lastSpoken}:null,lastError,lastReason,disposed,
      radioContext:radioContext(engine()),radioRecent:radioRecent.slice(),muted:!soundOn(),
      radioBank:radioLines().length,radioPrepared:pack.commanders.length,
      radioSystemAvailable:russianRadioAvailable(),
      radioDelivery:radioStyle==='original'?'original-recordings-and-text':radioLines().every(line=>pack.commanders.some(clip=>clip.id===line.id))?'all-prepared':russianRadioAvailable()?'prepared-and-russian-system':'prepared-only',
      cadenceMultiplier:CADENCE,minimumSilenceSeconds:SILENCE,
      radioStarts:stats.radioStarts,radioCompleted:stats.radioCompleted,radioInterrupted:stats.radioInterrupted,
      recordedRadioStarts:stats.recordedStarts,systemRadioStarts:stats.systemStarts,
      cachedClips:buffers.size,cachedBytes};
  }
  function showRadioCaption(e,text,seconds=8) {
    radioCaption={engine:e,text,scene:sceneStamp(e),until:wallNow()+Math.min(18,Math.max(6,seconds))};syncRadioCaption();
  }
  function syncRadioCaption() {
    if(typeof document==='undefined')return;
    const field=document.querySelector?.('#arcade-layout .arcade-field');if(!field)return;
    let el=field.querySelector?.('.citadel-radio-subtitle280');
    if(!el){el=document.createElement('div');el.className='citadel-radio-subtitle280';el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');el.hidden=true;field.appendChild(el);}
    const valid=radioCaption&&radioCaption.engine===engine()&&radioCaption.scene===sceneStamp(engine())&&
      wallNow()<radioCaption.until&&enabled&&combat(engine());
    const rocket=document.querySelector?.('.citadel-rocket-tip');
    el.hidden=!valid||!!rocket&&!rocket.hidden;
    if(valid&&el.textContent!==radioCaption.text)el.textContent=radioCaption.text;
  }
  function syncControls() {
    if(typeof document==='undefined')return;
    // Core initialize() can render the panel before this deferred module loads.
    // Reconcile that existing DOM as well as panels created by later renders.
    for(const panel of document.querySelectorAll?.('.space-audio-buttons')||[]) {
      if(!panel.querySelector('[data-action="arcade-voice-style"]')){
        const mode=document.createElement('button');mode.type='button';mode.setAttribute('data-action','arcade-voice-style');panel.appendChild(mode);
      }
      if(panel.querySelector('[data-action="arcade-voice"]'))continue;
      const button=document.createElement('button');
      button.type='button';button.setAttribute('data-action','arcade-voice');
      panel.insertBefore(button,panel.firstChild);
    }
    for(const button of document.querySelectorAll?.('[data-action="arcade-voice-style"]')||[]) {
      const label=radioStyle==='original'?'Капитан + текстовое радио':'Радио: все голоса';
      if(button.textContent!==label)button.textContent=label;
      button.setAttribute('aria-pressed',String(radioStyle==='original'));
      button.setAttribute('title',radioStyle==='original'?'Исходный голос капитана. Новые шутки и реплики врагов показываются текстом. Нажмите, чтобы включить все записи.':'Полный банк записей разными голосами. Нажмите для исходного голоса капитана.');
    }
    for(const button of document.querySelectorAll?.('[data-action="arcade-voice"]')||[]) {
      const label='Голос '+(enabled?'вкл':'выкл');
      if(button.textContent!==label)button.textContent=label;
      button.setAttribute('aria-pressed',String(enabled));
      button.setAttribute('aria-label','Озвучка и радио: '+(enabled?'включены':'выключены'));
    }
  }
  function setRadioStyle(value) {
    if(!['original','ensemble'].includes(value))return false;
    if(value===radioStyle)return true;
    stop('voice-style-change');radioStyle=value;radioCycles.clear();radioRecent.length=0;
    try{localStorage.setItem(STYLE_PREF,value);}catch{}announce();return true;
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
    generation++;const job=current;current=null;lastReason=reason;radioCaption=null;syncRadioCaption();
    if(job)markFinished(job,reason);
    if(job){clearTimers(job);clearRecording(job);if(job.utter){job.utter.onstart=job.utter.onend=job.utter.onerror=null;try{synth()?.cancel();}catch{}}
      settle(job,{ok:false,reason});}
    if(job?.radioUsed)try{globalThis.CITADEL_SFX?.stopRadio?.();}catch{}
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
    clearRecording(job);markFinished(job,reason);current=null;lastReason=reason;
    settle(job,{ok:false,reason,source:job.source});
    announce();
  }
  function startSpeech(job) {
    if(current!==job||job.token!==generation||job.phase!=='preparing')return;
    if(!permitted(job)){stop('inactive');return;}
    const speech=synth();
    if(!speechSupported()){finish(job,'unsupported');return;}
    if(speech.speaking||speech.pending){finish(job,'busy');return;}
    try {
      job.voice=job.speaker==='enemy'?chooseEnemyVoice():chooseVoice();
      const utter=new globalThis.SpeechSynthesisUtterance(job.text);job.utter=utter;utter.lang='ru-RU';
      if(job.voice)utter.voice=job.voice;
      utter.rate=1;utter.pitch=job.speaker==='enemy'?.86:1;utter.volume=1;
      job.phase='starting';
      const startup=later(job,()=>{lastError='not-started';radioSpeechFailure(job);stop('not-started');},6000);
      utter.onstart=()=>{
        if(current!==job||job.token!==generation)return;
        if(!permitted(job)){stop('inactive');return;}
        clearTimeout(startup);job.timers.delete(startup);job.started=true;job.phase='speaking';
        duck(job);
        lastSpoken={kind:job.kind,text:job.text,spokenText:job.text,voice:job.voice?.name||'ru-RU system',source:'system',maleNameHint:maleName.test(job.voice?.name||''),speaker:job.speaker||'captain',context:job.contextKey||null};
        markStarted(job);
        settle(job,{ok:true,started:true,text:job.text,voice:job.voice?.name||null,source:'system'});
        // A slow installed voice is allowed to finish. The bounded watchdog is
        // for a missing end event, never a second cadence timer cutting speech.
        later(job,()=>{lastError='speech-timeout';radioSpeechFailure(job);stop('speech-timeout');},
          Math.min(300000,Math.max(job.kind==='commander'?45000:20000,job.text.length*200+10000)));
        announce();
      };
      utter.onend=()=>finish(job,'ended',job.kind==='commander');
      utter.onerror=event=>{if(current!==job)return;lastError=String(event?.error||'speech-error');radioSpeechFailure(job);finish(job,lastError);};
      speech.speak(utter);announce();
    }catch(error){lastError=String(error?.message||'speech-error');radioSpeechFailure(job);finish(job,'speech-error');}
  }
  function startSystem(job) {
    if(!alive(job))return;
    if(job.kind!=='commander'){startSpeech(job);return;}
    job.radioUsed=true;
    if(!job.preview){later(job,()=>startSpeech(job),syncRadio('radio-in')?110:0);return;}
    const sfx=globalThis.CITADEL_SFX;
    if(!sfx?.play){startSpeech(job);return;}
    // A blocked effect must not strand fallback speech. Invalidate a delayed
    // radio resume before starting without that prefix. Prepared MP3s never
    // enter this branch: they already contain their own gentle radio effects.
    const timeout=later(job,()=>{job.prefixDone=true;try{sfx.stopRadio?.();}catch{}startSpeech(job);},700);
    try{Promise.resolve(sfx.play('radio-in')).then(result=>{
      if(current!==job||job.token!==generation||job.prefixDone)return;
      job.prefixDone=true;clearTimeout(timeout);job.timers.delete(timeout);
      later(job,()=>startSpeech(job),result?.ok?110:0);
    },()=>{
      if(current!==job||job.prefixDone)return;job.prefixDone=true;clearTimeout(timeout);job.timers.delete(timeout);startSpeech(job);
    });}catch{job.prefixDone=true;clearTimeout(timeout);job.timers.delete(timeout);startSpeech(job);}
  }
  function request(kind,text,{preview=false,speaker='captain',radioId=null,caption=null,contextKey=null}={}) {
    const clean=sanitizeText(text);
    const reason=disposed?'disposed':!supported()?'unsupported':!enabled?'disabled':!soundOn()?'muted':!visible()?'hidden':!inView()?'outside-game':!clean?'empty':null;
    if(reason)return Promise.resolve({ok:false,kind,reason});
    const source=engine(),check={kind,preview,engine:source,card:cardStamp(source),speaker,radioId,caption,contextKey,scene:kind==='commander'&&!preview?sceneStamp(source):null};
    if(!permitted(check))return Promise.resolve({ok:false,kind,reason:'inactive'});
    if(current&&kind==='commander'&&!preview)return Promise.resolve({ok:false,kind,reason:'busy'});
    if(current)stop(kind==='lesson'?'lesson-priority':'replaced');
    else if(synth()?.speaking||synth()?.pending)return Promise.resolve({ok:false,kind,reason:'busy'});
    const clips=recordingSupported()?playlist(kind,clean):null;
    if(!clips&&radioStyle==='original')return Promise.resolve({ok:false,kind,reason:'original-recording-unavailable',source:'text'});
    if(!clips&&!speechSupported())return Promise.resolve({ok:false,kind,reason:'recording-unavailable'});
    lastError='';lastReason='';
    return new Promise(resolve=>{
      const job={...check,text:clean,token:++generation,attempt:0,resolve,timers:new Set(),settled:false,started:false,
        phase:'preparing',voice:null,utter:null,source:clips?'recorded':'system',clips,clipIndex:0};
      current=job;announce();
      if(clips)startRecording(job);else startSystem(job);
    });
  }
  const speakLesson=(text,options={})=>request('lesson',text,options);
  const previewLesson=text=>request('lesson',text??'Хорошее требование понятно, проверяемо и не оставляет места догадкам.',{preview:true});
  function radioContext(e) {
    if(e?.finale){if(e.finale.phase==='mrg')return 'mrg';if(['maze','landing'].includes(e.finale.phase))return 'base';return 'parallax';}
    if(['escort','pursuit','swarm'].includes(e?.phase))return e.phase==='escort'?'convoy':e.phase;
    return e?.board&&['boarding','remark','paused'].includes(e.status)?'base':'orbit';
  }
  function chooseEnemyVoice() {
    const captain=chooseVoice(),available=ruVoices(),key=v=>String(v.voiceURI||v.name||'')+'|'+String(v.lang||'');
    const different=available.filter(v=>!captain||key(v)!==key(captain));
    const previous=different.find(v=>key(v)===selectedEnemyVoice);
    const voice=previous||different.find(v=>maleName.test(v.name||''))||captain;
    if(voice)selectedEnemyVoice=key(voice);return voice;
  }
  function radioLines() {
    const recordings=prepared().commanders;
    const legacy=(recordings.length?recordings.filter(x=>!x.id.startsWith('radio270-')):
      fallbackJokes.map((text,i)=>({id:fallbackIds[i],text}))).filter(x=>x.id!=='commander-08')
      .map(x=>({...x,speaker:'captain',contexts:Object.keys(radioPools).filter(k=>radioPools[k].includes(x.id))}));
    return [...legacy,...(globalThis.CITADEL_RADIO_PACK?.lines||[])];
  }
  function speakerName(e,speaker) {
    if(speaker!=='enemy')return 'Капитан';
    const context=radioContext(e);
    return ({pursuit:'ФЗ',parallax:'Параллакс',mrg:'МРГ',swarm:'Рой уточнений',base:'Канал охраны',convoy:'Вражеский командир'})[context]||'Вражеский канал';
  }
  function nextJoke(e,preview=false) {
    const key=radioContext(e),ru=russianRadioAvailable(),recordings=prepared().commanders;
    const theme=globalThis.CITADEL_BASE_MISSIONS?.active?.(e)?e?.board?.missions270?.theme:null;
    const enemyCount=e?.enemies?.filter(x=>!x.dead&&(x.hp??1)>0).length||0;
    const available=radioLines().filter(line=>(preview||!line.contexts?.length||line.contexts.includes(key))&&
      (preview||!line.theme||line.theme===theme)&&(preview||!line.minEnemies||enemyCount>=line.minEnemies)&&
      (radioStyle==='original'||ru||recordingSupported()&&recordings.some(c=>c.id===line.id)));
    if(!available.length)return null;
    let line;
    if(preview)line=available[(jokeIndex++)%available.length];
    else {
      const clock=clocks.get(e),speaker=enemyPresent(e)&&(clock?.turn||0)%3===2?'enemy':'captain';
      const pool=available.filter(c=>c.speaker===speaker);
      const choices=pool.length?pool:available.filter(c=>c.speaker!=='enemy');
      if(!choices.length)return null;
      const cycleKey=key+'/'+speaker;let used=radioCycles.get(cycleKey);
      if(!used){used=new Set();radioCycles.set(cycleKey,used);}
      let fresh=choices.filter(c=>!used.has(c.id));if(!fresh.length){used.clear();fresh=choices;}
      line=fresh.find(c=>!radioRecent.slice(-12).includes(c.id))||fresh.find(c=>c.id!==radioRecent.at(-1))||fresh[0];
      // Selection happens only on the empty channel, with no pending queue.
      used.add(line.id);
    }
    const caption=(line.sender||speakerName(e,line.speaker))+': '+(line.caption||line.text);
    return {...line,caption,contextKey:key};
  }
  const previewCommander=text=>{
    const line=text==null?nextJoke(null,true):null;
    return request('commander',text??line?.text??fallbackJokes[0],{preview:true,speaker:line?.speaker||'captain'});
  };
  function tacticalWarning(e) {
    if(!e)return false;
    const f=e.finale;
    if(f?.telegraph>0||f?.beamTime>0||f?.waveIntro>0||['telegraph','active'].includes(f?.tentacle?.phase)||
      ['windup','strike'].includes(f?.parallax?.attack?.phase)||
      ['telegraph','active'].includes(e.swarm?.attack?.stage)&&!e.swarm?.attack?.cancelled||e.swarm?.transition>0)return true;
    // Formation combat exposes its tells on the actual ships, rather than the
    // old experimental swarm.attack object. These are gameplay warnings.
    if(e.phase==='swarm'&&(e.enemies?.some(x=>!x.dead&&(['tell','dive'].includes(x.mode)||x.fireCue>0||x.attackCue>0))||
      e.hostile?.some(x=>x.life>0&&e.player?.pos&&Math.hypot(x.pos[0]-e.player.pos[0],x.pos[1]-e.player.pos[1])<18)))return true;
    const hp=e.status==='boarding'?e.board?.hp:e.player?.hp;
    if(Number.isFinite(hp)&&hp<=25)return true;
    const o=e.phase==='escort'&&e.escort?.ops240;
    if(o){
      if(o.fields?.some(x=>!x.passed&&x.warning>=0&&x.warning<=6.3)||
        o.groups?.some(x=>['telegraph','attack'].includes(x.state)))return true;
      if(e.enemies?.some(x=>{const a=e.escort.allies?.[x.ally];return x.torpedo&&!x.dead&&a&&!a.dead&&
        Math.hypot(...x.pos.map((v,i)=>v-a.pos[i]))<60;}))return true;
    }
    const s=e.phase==='pursuit'&&e.pursuit;
    if(s){
      if(s.linkRecovery>0||s.gates?.some(g=>!g.crossed&&g.distance>s.travel&&g.distance-s.travel<Math.max(1,s.speed)*4.2)||
        e.enemies?.some(x=>!x.dead&&x.telegraph>0))return true;
      const p=e.player?.pos;
      if(p&&e.asteroids?.some(a=>{
        const eta=a.passAt-s.clock;if(a.dead||a.contact||!(eta>0&&eta<3.3))return false;
        return Math.hypot(p[0]+(s.velocity?.[0]||0)*Math.min(1,eta)-a.pos[0],
          p[1]+(s.velocity?.[1]||0)*Math.min(1,eta)-a.pos[1])<a.r+5;
      }))return true;
    }
    return false;
  }
  function tick(e,delta) {
    if(disposed)return;
    syncRadioCaption();
    if(current&&!permitted(current))stop('inactive');
    if(e!==engine()||!enabled)return;
    let clock=clocks.get(e);
    if(!clock){clock={elapsed:0,next:nextInterval(),active:false,captainSerial:null,captainUntil:0,quietUntil:0,turn:0};clocks.set(e,clock);}
    if(!combat(e)){clock.active=false;return;}
    if(!clock.active){clock.next=Math.max(clock.next,clock.elapsed+4);clock.active=true;}
    clock.elapsed+=Math.max(0,Math.min(.04,Number(delta)||0));
    const captainSerial=e.captain?.serial??e.captain?.text??null;
    if(clock.captainSerial!==captainSerial) {
      clock.captainSerial=captainSerial;
      clock.captainUntil=clock.elapsed+Math.min(6,Math.max(0,Number(e.captainClock)||0));
    }
    if(clock.elapsed<clock.next||clock.elapsed<clock.quietUntil||wallNow()-lastRadioEnd<SILENCE)return;
    if(current||synth()?.speaking||synth()?.pending)return;
    // Training keeps advance telegraphs unobstructed. Normal combat has no
    // advance hints: banter neither predicts attacks nor vanishes on every
    // attack frame. A started line finishes unless education/lifecycle wins.
    if(e.captainClock>0&&clock.elapsed<clock.captainUntil||e.assist&&tacticalWarning(e))return;
    const line=nextJoke(e);if(!line){clock.next=clock.elapsed+nextInterval();return;}
    if(radioStyle==='original'&&!originalClip(prepared().commanders.find(c=>c.id===line.id))){
      // Keep every joke and enemy reply visible without mislabelling another
      // voice as the captain. No audio job, fake playback event or TTS fallback.
      e.say?.(line.caption,'order',false);showRadioCaption(e,line.caption,Math.max(7,line.caption.length/17));stats.textRadioStarts++;clock.turn++;
      clock.next=clock.elapsed+nextInterval();clock.quietUntil=clock.elapsed+SILENCE;
      radioRecent.push(line.id);if(radioRecent.length>18)radioRecent.shift();return;
    }
    clock.next=clock.elapsed+2;
    request('commander',line.text,{speaker:line.speaker,radioId:line.id,caption:line.caption,contextKey:line.contextKey})
      .then(result=>{if(!result.ok&&clocks.get(e)===clock)clock.next=Math.max(clock.next,clock.elapsed+2);});
  }
  function hookAnswers(proto) {
    for(const [name,kind,total] of [['answerLesson','lesson',4],['answer','remark',3],['answerFinale','finalcheck',3]]) {
      const original=proto[name];if(typeof original!=='function')continue;
      const wrapped=function(index,...rest) {
        const active=this.status===kind&&Number.isInteger(index)&&index>=0&&index<total&&
          (kind==='lesson'?!this.lesson?.solved:kind==='remark'?!this.board?.answered:this.finale?.answer===null);
        const slot=kind==='lesson'?this.lesson?.caseIndex:kind==='remark'?this.board?.question:this.board?.completed?.length;
        const result=original.call(this,index,...rest);
        if(!disposed&&active&&this===engine())try {
          const q=kind==='lesson'?citadelLessonCase(this,slot):kind==='remark'?citadelRemarkCase(this,slot):
            typeof citadelFinalCase==='function'?citadelFinalCase(slot):typeof FINALE_TRIALS!=='undefined'?FINALE_TRIALS[slot]:null;
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
      replace(()=>proto[name],value=>{proto[name]=value;},wrapped);
    }
  }
  if(typeof RequirementArcade!=='undefined') {
    const proto=RequirementArcade.prototype,step=proto.step;
    replace(()=>proto.step,value=>{proto.step=value;},function(delta,...args){const result=step.call(this,delta,...args);tick(this,delta);return result;});
    for(const name of ['pause','continueLesson','continueRemark','continueFinaleCheck','beginStage','beginMRG','retryFinale']) {
      const original=proto[name];if(typeof original!=='function')continue;
      replace(()=>proto[name],value=>{proto[name]=value;},function(...args){if(!disposed&&this===engine())stop(name);return original.apply(this,args);});
    }
    hookAnswers(proto);
  }
  if(typeof spaceAudioStop==='function') {
    const original=spaceAudioStop;
    replace(()=>spaceAudioStop,value=>{spaceAudioStop=value;},function(...args){try{return original.apply(this,args);}finally{if(!disposed)stop('audio-stop');}});
  }
  if(typeof spaceAudioMarkup==='function') {
    const original=spaceAudioMarkup;
    replace(()=>spaceAudioMarkup,value=>{spaceAudioMarkup=value;},function(...args) {
      const markup=original.apply(this,args);
      return markup.includes('data-action="arcade-voice"')?markup:markup.replace('<div class="space-audio-buttons">','<div class="space-audio-buttons"><button type="button" data-action="arcade-voice" aria-pressed="'+enabled+'">Голос '+(enabled?'вкл':'выкл')+'</button>');
    });
  }
  if(typeof spaceAudioAction==='function') {
    const original=spaceAudioAction;
    replace(()=>spaceAudioAction,value=>{spaceAudioAction=value;},function(action,...args){
      if(action==='arcade-voice-style'&&!disposed){setRadioStyle(radioStyle==='original'?'ensemble':'original');return true;}
      if(action==='arcade-voice'&&!disposed){setEnabled(!enabled);return true;}
      const result=original.call(this,action,...args);if(!disposed&&!soundOn())stop('muted');return result;
    });
  }
  if(typeof spaceAudioControls==='function') {
    const original=spaceAudioControls;
    replace(()=>spaceAudioControls,value=>{spaceAudioControls=value;},function(...args){const result=original.apply(this,args);if(!disposed)syncControls();return result;});
  }
  if(typeof arcadeAction==='function') {
    const original=arcadeAction;
    replace(()=>arcadeAction,value=>{arcadeAction=value;},function(...args){const result=original.apply(this,args);if(!disposed&&current&&!permitted(current))stop(soundOn()?'scene-change':'muted');return result;});
  }
  const hidden=()=>{if(!visible())stop('hidden');},pagehide=()=>stop('pagehide'),blur=()=>stop('blur'),changed=()=>announce('citadel-voice-change');
  const keyboard=event=>{if(event.target?.closest?.('[data-action="arcade-voice"],[data-action="arcade-voice-style"]'))event.stopImmediatePropagation();};
  if(typeof document!=='undefined'){document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',keyboard,true);}
  globalThis.addEventListener?.('pagehide',pagehide);globalThis.addEventListener?.('blur',blur);
  synth()?.addEventListener?.('voiceschanged',changed);
  globalThis.CITADEL_VOICE=Object.freeze({
    version:VERSION,get enabled(){return enabled;},get radioStyle(){return radioStyle;},setRadioStyle,setEnabled,speakLesson,previewLesson,previewCommander,stop,status,sanitizeText,voices,
    tacticalWarning,
    get jokes(){return Object.freeze(radioLines().map(x=>x.caption||x.text));},
    dispose(){if(disposed)return;disposed=true;stop('disposed');buffers.clear();cachedBytes=0;
      if(typeof document!=='undefined'){document.removeEventListener?.('visibilitychange',hidden);document.removeEventListener?.('keydown',keyboard,true);}
      globalThis.removeEventListener?.('pagehide',pagehide);globalThis.removeEventListener?.('blur',blur);
      synth()?.removeEventListener?.('voiceschanged',changed);
      for(const restore of restorers.reverse())restore();restorers.length=0;radioCycles.clear();radioRecent.length=0;
    }
  });
  if(typeof document!=='undefined'&&document.head&&!document.getElementById('citadel-radio-subtitle-style280')){
    const style=document.createElement('style');style.id='citadel-radio-subtitle-style280';
    style.textContent='.citadel-radio-subtitle280{display:none;pointer-events:none;position:absolute;top:72px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 28px);box-sizing:border-box;padding:5px 9px;border-radius:6px;background:#071420df;color:#eef6ff;text-shadow:0 1px 2px #000;font:11px/1.35 system-ui,sans-serif;text-align:center;z-index:6}.citadel-landscape270 .citadel-radio-subtitle280:not([hidden]){display:block}.citadel-radio-subtitle280[hidden]{display:none}';
    document.head.appendChild(style);
  }
  syncControls();
})();
