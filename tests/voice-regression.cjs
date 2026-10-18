#!/usr/bin/env node
'use strict';
// Deterministic speech events/timers around the real game cores. This verifies
// text and lifecycle contracts; it cannot verify an installed OS voice's timbre.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./mrg-regression.cjs');
const root=path.resolve(__dirname,'..'),modulePath=path.join(root,'assets/citadel-voice-v1.8.2.js');
const source=fs.readFileSync(modulePath,'utf8'),bridge=fs.readFileSync(path.join(root,'assets/citadel-academy-bridge-v1.7.0.js'),'utf8');
const localVoices=[
  {name:'Milena',lang:'ru-RU',localService:true},
  {name:'Microsoft Pavel Desktop',lang:'ru-RU',localService:true},
  {name:'Irina',lang:'ru-RU',localService:true}
];
function setup(core,{memory=false,voiceList=localVoices}={}) {
  const h=createHarness(core,null,null),ctx=h.context,timers=new Map(),events=new Map();
  let now=0,id=0,listed=voiceList.slice(),cancelled=0,radioStops=0,effectStops=0,lateRadio=null;
  const spoken=[],radio=[],speechEvents=new Map();
  ctx.setTimeout=(fn,ms)=>{const n=++id;timers.set(n,{fn,at:now+ms});return n;};
  ctx.clearTimeout=n=>timers.delete(n);
  ctx.document.addEventListener=(type,fn)=>{const key='doc:'+type;events.set(key,[...(events.get(key)||[]),fn]);};
  ctx.document.removeEventListener=(type,fn)=>events.set('doc:'+type,(events.get('doc:'+type)||[]).filter(x=>x!==fn));
  ctx.addEventListener=(type,fn)=>events.set(type,[...(events.get(type)||[]),fn]);
  ctx.removeEventListener=(type,fn)=>events.set(type,(events.get(type)||[]).filter(x=>x!==fn));
  ctx.dispatchEvent=ev=>{for(const fn of events.get(ev.type)||[])fn(ev);};
  ctx.CustomEvent=function(type,{detail}={}){this.type=type;this.detail=detail;};
  ctx.SpeechSynthesisUtterance=function(text){this.text=text;};
  const speech=ctx.speechSynthesis={
    speaking:false,pending:false,getVoices:()=>listed,
    speak(utter){spoken.push(utter);this.speaking=true;utter.onstart?.();},
    cancel(){cancelled++;this.speaking=false;this.pending=false;},
    addEventListener(type,fn){speechEvents.set(type,fn);},removeEventListener(type){speechEvents.delete(type);}
  };
  ctx.CITADEL_SFX={
    play(kind){radio.push(kind);return lateRadio||Promise.resolve({ok:true,kind});},
    status:()=>({contextState:'running'}),
    stopRadio(){radioStops++;},stop(){effectStops++;}
  };
  ctx.qaRadio=kind=>{radio.push(kind);return true;};
  vm.runInContext('Math.random=()=>0;spacePlayEffect=globalThis.qaRadio;',ctx);
  if(memory) {
    ctx.localStorage={getItem(){throw Error('Real storage read');},setItem(){throw Error('Real storage write');}};
    vm.runInContext('const localStorage=(()=>{const memory=new Map();return {getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};})();',ctx);
  }
  vm.runInContext(source,ctx,{filename:path.basename(modulePath)});
  const e=h.engine({assist:true});
  const fire=(type)=>{for(const fn of events.get(type)||[])fn({type});};
  const advance=ms=>{
    const end=now+ms;let guard=0;
    while(true){let next=null;for(const entry of timers)if(entry[1].at<=end&&(!next||entry[1].at<next[1].at))next=entry;
      if(!next)break;if(++guard>1000)throw Error('Timer loop');timers.delete(next[0]);now=next[1].at;next[1].fn();}
    now=end;
  };
  const end=()=>{const utter=spoken.at(-1);speech.speaking=false;speech.pending=false;utter?.onend?.();};
  return {...h,e,api:ctx.CITADEL_VOICE,speech,spoken,radio,fire,advance,end,timers,
    counts:()=>({cancelled,radioStops,effectStops}),setVoices:list=>{listed=list;speechEvents.get('voiceschanged')?.();},
    delayRadio:promise=>{lateRadio=promise;},run:script=>vm.runInContext(script,ctx)};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
async function main(argv=process.argv.slice(2)) {
  let cores=[];
  for(let i=0;i<argv.length;i++){if(argv[i]!=='--core')throw Error('Usage: voice-regression.cjs [--core path]');cores.push(path.resolve(argv[++i]));}
  if(!cores.length)cores=[path.join(root,'assets/atlas-v1.3.5.js')];
  const report=[];
  for(const core of cores) {
    const tests=[];
    async function test(name,fn){try{await fn();tests.push({name,ok:true});}catch(error){tests.push({name,ok:false,error:error.message});}}
    await test('deferred boot mounts the voice toggle in an existing real-core panel once, and rerenders keep delegation and accessibility',async()=>{
      const h=createHarness(core,null,null),ctx=h.context,doc=ctx.document,panels=[];
      const queryAll=doc.querySelectorAll.bind(doc),selector='[data-action="arcade-voice"]';
      const buttons=()=>panels.flatMap(panel=>panel.children||[]).filter(button=>button.getAttribute('data-action')==='arcade-voice');
      doc.querySelectorAll=selector=>selector==='.space-audio-buttons'?panels:selector==='[data-action="arcade-voice"]'?buttons():queryAll(selector);
      // Materialize the actual old core's HTML before loading the addon. This
      // small DOM fixture exercises insertion/querying; no markup is invented
      // by the test and no later engine/controls call can mask a missing boot.
      function renderPanel(markup) {
        panels.length=0;
        const content=markup.match(/<div class="space-audio-buttons">([\s\S]*?)<\/div>/);
        assert(content,'The real core emitted its audio-button container');
        const panel=doc.createElement('div');panel.children=[];
        Object.defineProperty(panel,'firstChild',{get(){return this.children[0]||null;}});
        panel.insertBefore=function(button,before){const at=before?this.children.indexOf(before):this.children.length;assert(at>=0);this.children.splice(at,0,button);return button;};
        panel.querySelector=selector=>selector==='[data-action="arcade-voice"]'?panel.children.find(button=>button.getAttribute('data-action')==='arcade-voice')||null:null;
        for(const match of content[1].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
          const button=doc.createElement('button');
          for(const attribute of match[1].matchAll(/([\w:-]+)="([^"]*)"/g))button.setAttribute(attribute[1],attribute[2]);
          button.textContent=match[2];panel.appendChild(button);
        }
        panels.push(panel);return panel;
      }
      const originalMarkup=vm.runInContext('spaceAudioMarkup()',ctx),panel=renderPanel(originalMarkup),originalButtons=panel.children.slice();
      assert.equal(buttons().length,0);assert(originalButtons.length>=3);
      h.storage.set('citadel-academy-voice-v1','false');
      vm.runInContext(source,ctx,{filename:path.basename(modulePath)});
      assert.equal(buttons().length,1,'Voice button exists immediately after addon boot');
      const button=buttons()[0];assert.equal(button.type,'button');assert.equal(button.textContent,'Голос выкл');
      assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.getAttribute('aria-label'),'Озвучка и радио: выключены');
      assert(originalButtons.every(item=>panel.children.includes(item)),'Existing music/effect controls retain their DOM nodes');
      assert.equal(vm.runInContext("spaceAudioAction('arcade-voice')",ctx),true);
      assert.equal(ctx.CITADEL_VOICE.enabled,true);assert.equal(h.storage.get('citadel-academy-voice-v1'),'true');
      assert.equal(button.textContent,'Голос вкл');assert.equal(button.getAttribute('aria-pressed'),'true');
      assert.equal(button.getAttribute('aria-label'),'Озвучка и радио: включены');
      vm.runInContext('spaceAudioControls();spaceAudioControls();',ctx);vm.runInContext(source,ctx);
      assert.equal(buttons().length,1);assert.equal(buttons()[0],button,'Repeated sync/boot preserves the existing toggle');
      renderPanel(vm.runInContext('spaceAudioMarkup()',ctx));vm.runInContext('spaceAudioControls();spaceAudioControls();',ctx);
      assert.equal(buttons().length,1,'Future wrapped markup is not supplemented with a duplicate');
      assert.equal(buttons()[0].getAttribute('aria-label'),'Озвучка и радио: включены');
      renderPanel(originalMarkup);vm.runInContext('spaceAudioControls();spaceAudioControls();',ctx);
      assert.equal(buttons().length,1,'A later pre-addon panel is repaired idempotently too');
      assert.equal(vm.runInContext("spaceAudioAction('unrelated-action')",ctx),false,'Existing action delegation is preserved');
      ctx.CITADEL_VOICE.dispose();
    });
    await test('spoken text strips nested escapes, HTML, entities, links and markdown; source is unchanged',async()=>{
      const h=setup(core),api=h.api,bt=String.fromCharCode(96);
      const cases=[
        [String.raw`<p class=\"lesson\">Первое<\/p>\n<p>Второе &amp; третье.</p>`,'Первое. Второе и третье.'],
        [String.raw`## **Проверка**\n[Критерий](https://example.test/a/b)\\nПонятно \slash проверяемо.`,'Проверка. Критерий. Понятно проверяемо.'],
        [String.raw`\text{Одна мысль} \mathrm{за раз}.`,'Одна мысль за раз.'],
        ['&amp;lt;b&amp;gt;Решение&amp;lt;/b&amp;gt; &#x41f;&#1088;&#1086;&#1074;&#1077;&#1088;&#1077;&#1085;&#1086;','Решение Проверено'],
        ['<script>bad()</script><style>body{}</style><p>Хорошо.</p>','Хорошо.'],
        [bt.repeat(3)+'text\nОдна мысль\n'+bt.repeat(3), 'Одна мысль.'],
        [String.raw`ФТ/ТЗ \n API и IT`,'эф тэ тэ зэ. эй пи ай и айти'],
        [String.raw`\u003cp\u003eЧисто\u003c\/p\u003e`,'Чисто.']
      ];
      for(const [input,expected] of cases){const saved=input;assert.equal(api.sanitizeText(input),expected);assert.equal(input,saved);}
      assert.equal(api.sanitizeText(null),'');
      assert(!api.sanitizeText('a'.repeat(20000)).includes('\\'));
      assert(bridge.includes('text.textContent=c.lesson;'),'Visual card text is untouched');
      assert(bridge.includes('CITADEL_VOICE?.speakLesson(s)'),'Academy uses the shared sanitizer');
      assert(!bridge.includes('new SpeechSynthesisUtterance'),'No competing bridge speech queue');
      api.dispose();
    });
    await test('one stable Russian voice for lessons and commander, actual onstart and fallback radio ordering',async()=>{
      const h=setup(core);h.e.status='paused';
      const first=await h.api.previewLesson('Первый разбор.');assert.equal(first.ok,true);assert.equal(h.spoken[0].lang,'ru-RU');
      h.end();const second=await h.api.previewLesson('Второй разбор.');assert.equal(second.ok,true);
      assert.equal(h.spoken[0].voice.name,'Microsoft Pavel Desktop');assert.equal(h.spoken[0].voice.name,h.spoken[1].voice.name);
      assert.equal(h.spoken[0].rate,1);assert.equal(h.spoken[0].pitch,1);assert.equal(h.spoken[1].pitch,1);h.end();
      const p=h.api.previewCommander('Проверка связи.');await flush();assert.equal(h.radio.at(-1),'radio-in');
      h.advance(109);assert.equal(h.spoken.length,2);h.advance(1);
      assert.equal((await p).started,true);assert.equal(h.spoken.at(-1).voice.name,'Microsoft Pavel Desktop');
      assert.equal(h.api.status().phase,'speaking');assert.equal(h.spoken.at(-1).rate,1);assert.equal(h.spoken.at(-1).pitch,1);
      assert.equal(h.api.status().source,'system');
      h.end();assert.equal(h.radio.at(-1),'radio-out');await flush();h.advance(80);assert.equal(h.api.status().busy,false);
      assert.equal(h.counts().effectStops,0);h.api.dispose();
    });
    await test('late voices and no Russian voice use a truthful system fallback',async()=>{
      const h=setup(core,{voiceList:[]});
      await h.api.previewLesson('Русский текст.');assert.equal(h.spoken.at(-1).lang,'ru-RU');assert.equal(h.spoken.at(-1).voice,undefined);
      assert.equal(h.api.status().maleCommanderAvailable,false);h.end();
      h.setVoices(localVoices);assert.equal(h.api.status().ruVoices,3);assert.equal(h.api.status().maleCommanderAvailable,true);
      h.api.dispose();
    });
    await test('existing voice preference persists; lab lexical storage never touches browser storage',async()=>{
      const h=setup(core);h.api.setEnabled(false);assert.equal(h.storage.get('citadel-academy-voice-v1'),'false');
      assert.equal((await h.api.previewCommander()).reason,'disabled');h.api.setEnabled(true);assert.equal(h.api.enabled,true);h.api.dispose();
      const memory=setup(core,{memory:true});memory.api.setEnabled(false);
      assert.equal(memory.run("localStorage.getItem('citadel-academy-voice-v1')"),'false');
      assert.equal(memory.api.enabled,false);memory.api.dispose();
    });
    await test('no speech queue; cancellation invalidates old speech callbacks and delayed radio',async()=>{
      const h=setup(core);h.speech.speaking=true;
      assert.equal((await h.api.previewLesson('Не ставить в очередь.')).reason,'busy');assert.equal(h.spoken.length,0);h.speech.speaking=false;
      await h.api.previewLesson('Первое.');const stale=h.spoken[0].onstart;
      await h.api.previewLesson('Второе.');stale();assert.equal(h.api.status().busy,true);assert.equal(h.spoken.length,2);h.end();
      let resolve;h.delayRadio(new Promise(r=>{resolve=r;}));
      const pending=h.api.previewCommander();h.api.stop('dialog-closed');resolve({ok:true});await flush();h.advance(1000);
      assert.equal((await pending).reason,'dialog-closed');assert.equal(h.spoken.length,2);
      assert.equal(h.counts().effectStops,0);assert(h.counts().radioStops>0);h.api.dispose();
    });
    await test('a stalled radio prefix neither blocks nor restarts spoken preview',async()=>{
      const h=setup(core);let resolve;h.delayRadio(new Promise(r=>{resolve=r;}));
      const p=h.api.previewCommander();h.advance(700);assert.equal((await p).ok,true);assert.equal(h.spoken.length,1);
      resolve({ok:false,reason:'cancelled'});await flush();h.advance(1000);assert.equal(h.spoken.length,1);assert.equal(h.api.status().busy,true);
      h.api.dispose();
    });
    await test('pause, hidden tab, scene change and disabled voice stop immediately without muting effects',async()=>{
      const h=setup(core);await h.api.previewLesson('Тест.');h.e.pause();assert.equal(h.api.status().busy,false);
      const p=h.api.previewCommander('Проверка.');await flush();h.advance(110);assert.equal((await p).ok,true);
      h.context.document.hidden=true;h.fire('doc:visibilitychange');assert.equal(h.api.status().busy,false);
      assert.equal((await h.api.previewLesson('Скрыто.')).reason,'hidden');h.context.document.hidden=false;
      await h.api.previewLesson('Снова.');h.api.setEnabled(false);assert.equal(h.api.status().busy,false);
      h.api.setEnabled(true);await h.api.previewLesson('Новая сцена.');h.e.beginStage(0);assert.equal(h.api.status().busy,false);
      assert.equal(h.counts().effectStops,0);h.api.dispose();
    });
    await test('onstart is required for success, missing starts time out, and unsupported devices fail cleanly',async()=>{
      const h=setup(core);h.speech.speak=utter=>{h.spoken.push(utter);h.speech.pending=true;};
      const p=h.api.previewLesson('Ждём фактического начала.');assert.equal(h.api.status().phase,'starting');assert.equal(h.api.status().started,false);
      h.speech.pending=false;h.speech.speaking=true;h.spoken.at(-1).onstart();assert.equal((await p).started,true);h.end();
      const missing=h.api.previewLesson('Не запустилось.');h.advance(6000);assert.equal((await missing).reason,'not-started');assert.equal(h.api.status().busy,false);
      delete h.context.SpeechSynthesisUtterance;assert.equal((await h.api.previewCommander()).reason,'unsupported');h.api.dispose();
    });
    await test('pending preview radio-out is cancelled on close without a late tail or stuck job',async()=>{
      const h=setup(core);h.e.status='menu';const p=h.api.previewCommander('Приём.');await flush();h.advance(110);await p;
      let resolve;h.delayRadio(new Promise(r=>{resolve=r;}));h.end();assert.equal(h.api.status().phase,'radio-out');
      h.api.stop('dialog-closed');resolve({ok:true});await flush();h.advance(1000);assert.equal(h.api.status().busy,false);
      assert.equal(h.spoken.length,1);assert.equal(h.counts().effectStops,0);h.api.dispose();
    });
    await test('real core decision feedback sanitizes why/outcome and academy cards suppress duplicate fallback',async()=>{
      const h=setup(core),e=h.e;h.run("const voiceOriginalLesson=citadelLessonCase;citadelLessonCase=(e,i)=>({...voiceOriginalLesson(e,i),why:'<b>Одна мысль</b>\\\\n[Проверка](https://example.test/x/y)'});");
      e.status='lesson';e.lesson={caseIndex:0,solved:false,attempts:0,feedback:null,readClock:0,reqId:'voice-test',stage:0};
      const q=h.run('citadelLessonCase(ARCADE.engine,0)'),before=e.score;
      assert.equal(e.answerLesson(q.correct),true);assert.equal(e.score,before+300);assert.equal(h.spoken.length,1);
      assert(h.spoken[0].text.includes('Одна мысль. Проверка'));assert(!/[<>\\\/]/.test(h.spoken[0].text));
      h.end();h.run("citadelLessonCase=(e,i)=>({...voiceOriginalLesson(e,i),academyLesson:'Авторский разбор.'});");
      e.lesson={caseIndex:0,solved:false,attempts:0,feedback:null,readClock:0,reqId:'voice-test',stage:0};
      e.answerLesson(q.correct);assert.equal(h.spoken.length,1,'The external bridge is the only narrator');
      await h.api.speakLesson('<p>Авторский разбор.</p>');assert.equal(h.spoken.length,2);assert.equal(h.spoken[1].text,'Авторский разбор.');
      h.end();h.run("citadelLessonCase=(e,i)=>({...voiceOriginalLesson(e,i),why:'',lesson:'',outcome:{...voiceOriginalLesson(e,i).outcome,after:'<i>Проверяемый результат.</i>'}});");
      e.lesson={caseIndex:0,solved:false,attempts:0,feedback:null,readClock:0,reqId:'voice-test',stage:0};
      e.answerLesson(q.correct);assert(h.spoken.at(-1).text.includes('Проверяемый результат.'));
      h.api.dispose();
    });
    await test('real combat step emits rare radio among natural boss warnings and freezes on pause/cards',async()=>{
      const h=setup(core),e=h.e;
      e.board.invulnerable=1e6;
      for(let i=0;i<34.9*60;i++)e.step(1/60,{});h.advance(200);assert.equal(h.spoken.length,0);
      let speechAt=0;
      for(let i=0;i<65*60&&!h.spoken.length;i++){e.step(1/60,{});h.advance(17);if(h.spoken.length)speechAt=e.elapsed;}
      assert(speechAt>=35&&speechAt<100,'Natural boss warnings eventually leave the radio channel free');
      assert.equal(h.spoken.length,1);assert.equal(h.api.status().kind,'commander');assert.equal(h.radio[0],'radio-in');
      e.pause();assert.equal(h.api.status().busy,false);const count=h.spoken.length;
      for(let i=0;i<80*60;i++)e.step(1/60,{});h.advance(10000);assert.equal(h.spoken.length,count);
      e.resume();e.captainClock=0;
      h.context.document.hidden=true;h.fire('doc:visibilitychange');
      for(let i=0;i<80*60;i++)e.step(1/60,{});h.advance(10000);assert.equal(h.spoken.length,count);
      h.context.document.hidden=false;e.status='lesson';
      for(let i=0;i<80*60;i++)e.step(1/60,{});h.advance(10000);assert.equal(h.spoken.length,count);
      h.api.dispose();
    });
    report.push({core:path.basename(core),version:'1.8.2',tests});
  }
  console.log(JSON.stringify(report,null,2));
  if(report.some(x=>x.tests.some(t=>!t.ok)))process.exitCode=1;
  return report;
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,setup};
