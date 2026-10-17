/* «Цитадель ЦСИИ» · образовательная интеграция 1.4.1
   Переподключает 23 игровые проверки к редактируемому учебному банку.
   Не изменяет исходный сценарий боя, начисление очков, Supabase и схему сохранений.
   BABOK Guide v3 §7.2: авторские пересказы, не дословные цитаты. */
(()=>{'use strict';
 const VERSION='1.4.1', SOURCE='./assets/citadel-academy-cards-v1.4.0.json',
       EDIT='citadel-academy-edit-v1', PROGRESS='citadel-academy-progress-v1',
       VOICE='citadel-academy-voice-v1', CAMPAIGN='citadel-academy-campaign-v1',
       SAVE='cmpon.citadel.review.v3', TOTAL=23;
 const CORE=['completeness','unambiguity','atomicity','testability','traceability','feasibility'];
 const LABEL={completeness:'Полнота',unambiguity:'Однозначность',atomicity:'Атомарность',
  testability:'Проверяемость',traceability:'Трассируемость',feasibility:'Выполнимость',
  consistency:'Согласованность',conciseness:'Краткость',prioritized:'Приоритетность',
  understandable:'Понятность'};
 const SLOT_EXTRAS=new Set([4,9,14,19,22]);
 const state={ready:false,source:'ожидание',bank:[],published:[],error:'',selectedSeed:null,lastOverlay:'',voice:true,legacySeed:null,utter:null};
 const old={};
 function read(key,def){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):def}catch{return def}}
 function write(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
 function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function validBank(data){
  if(!data||!Array.isArray(data.cards)||!data.cards.length||data.cards.length>300)return null;
  const ids=new Set(),result=[];
  for(const c of data.cards){
   if(!c||typeof c.id!=='string'||!(/^[A-Za-z0-9_-]{2,64}$/).test(c.id)||ids.has(c.id)||!LABEL[c.criterion])return null;
   if(!Array.isArray(c.choices)||c.choices.length!==4||!Number.isInteger(c.correct)||c.correct<0||c.correct>3)return null;
   if(!['context','requirement','why','better','test','lesson','title'].every(k=>typeof c[k]==='string'&&c[k].length<=2400))return null;
   if(c.choices.some(v=>typeof v!=='string'||!v.trim()||v.length>1000))return null;
   ids.add(c.id);result.push(c);
  }
  if(CORE.some(k=>!result.some(c=>c.criterion===k)))return null;
  return result;
 }
 function selectedBank(){const local=validBank(read(EDIT,null));return local?(state.source='локальный редактор',local):state.published.length?(state.source='опубликованный JSON',state.published):(state.source='ожидание',[])}
 function reloadLocal(){const chosen=selectedBank();if(chosen.length)state.bank=chosen}
 async function load(){
  reloadLocal();
  try{
   const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
   const parsed=validBank(await r.json());if(!parsed)throw Error('Неверная структура JSON');
   state.published=parsed;reloadLocal();state.ready=true;
  }catch(err){state.error=String(err?.message||err);state.ready=state.bank.length>0;}
  window.dispatchEvent(new CustomEvent('citadel-academy-ready',{detail:{count:state.bank.length,source:state.source}}));
 }
 function seed32(x){return (Number(x)||0)>>>0}
 function code(seed,shift=0){let x=(seed32(seed)+Math.imul(shift+1,0x9e3779b1))>>>0;x^=x>>>16;x=Math.imul(x,0x85ebca6b)>>>0;x^=x>>>13;return x>>>0}
 function plan(seed){
  if(!state.bank.length)return null;
  const keys=CORE.map((_,i)=>CORE[(i+code(seed)%CORE.length)%CORE.length]);
  const core=[];
  for(let round=0;round<3;round++)for(const [i,k] of keys.entries()){
   const pool=state.bank.filter(c=>c.criterion===k);
   core.push(pool[(code(seed,i+4)%pool.length+round)%pool.length]);
  }
  const additional=state.bank.filter(c=>!CORE.includes(c.criterion));
  const extras=additional.length?additional:[...state.bank];
  const picked=[],seen=new Set();let ci=0,ei=0;
  for(let i=0;i<TOTAL;i++){
   let c;if(SLOT_EXTRAS.has(i)){
    const start=(code(seed,50)+ei++)%extras.length;c=extras[start];
    for(let n=0;n<extras.length&&seen.has(c.id);n++)c=extras[(start+n+1)%extras.length];
   }else c=core[ci++];
   // Local editors can remove cards. Keep the game playable, though the shield
   // only fills on three DIFFERENT solved cases per criterion.
   picked.push(c);seen.add(c.id);
  }
  return picked;
 }
 const planCache={seed:null,bank:null,cards:null};
 function getPlan(seed){if(planCache.seed!==seed||planCache.bank!==state.bank){planCache.seed=seed;planCache.bank=state.bank;planCache.cards=plan(seed)}return planCache.cards}
 function candidate(e,kind,index){if(!state.ready||!e||isLegacy(e))return null;
  const slot=kind==='lesson'?index:kind==='remark'?8+index:20+index;
  if(!Number.isInteger(slot)||slot<0||slot>=TOTAL)return null;
  return getPlan(e.seed)?.[slot]||null;
 }
 function makeChoices(c,correct,total){
  const choices=new Array(total),wrong=c.choices.filter((_,i)=>i!==c.correct);
  choices[correct]=c.choices[c.correct];let j=0;for(let i=0;i<total;i++)if(i!==correct)choices[i]=wrong[j++];return choices;
 }
 function outcome(c,old){return {...old,label:'Критерий качества отработан',title:LABEL[c.criterion]+': '+c.title,
   symbol:'✓',before:c.requirement,after:c.better, color:'#91e5c7'} }
 function decorate(q,c,kind){const correct=q.correct,total=kind==='lesson'?4:3;
  const prefix='Ситуация: '+c.context+'\n\nПРОЕКТ ТРЕБОВАНИЯ: '+c.requirement+'\n\n'+(c.task||'Выберите наиболее обоснованное исправление.');
  return {...q,academyId:c.id,academyCriterion:c.criterion,academyTest:c.test,academyLesson:c.lesson,
   academySource:c.source||'Учебный сценарий ЦМПОН',
   skill:LABEL[c.criterion]+' · '+c.title, title:LABEL[c.criterion]+' · '+c.title,
   situation:prefix,q:prefix,choices:makeChoices(c,correct,total),
   why:c.why+'\n\nПроверка: '+c.test,
   resolution:'accepted',outcome:outcome(c,q.outcome)};
 }
 function sessionKey(){return read(CAMPAIGN,null)}
 function isLegacy(e){if(state.legacySeed!==null&&seed32(e.seed)===state.legacySeed){
    const stamp=sessionKey();return !(stamp&&seed32(stamp.seed)===state.legacySeed);
  }return false}
 function record(e,kind,index,correct){const c=candidate(e,kind,index);if(!c)return;
  const p=read(PROGRESS,{solved:{},attempts:{},errors:{},totalRight:0,totalWrong:0});
  if(!p||typeof p!=='object')return;
  p.solved=p.solved&&typeof p.solved==='object'?p.solved:{};
  p.attempts=p.attempts&&typeof p.attempts==='object'?p.attempts:{};
  p.errors=p.errors&&typeof p.errors==='object'?p.errors:{};
  p.attempts[c.id]=(p.attempts[c.id]||0)+1;
  if(correct){p.solved[c.id]=true;p.totalRight=(p.totalRight||0)+1}
  else{p.errors[c.id]=(p.errors[c.id]||0)+1;p.totalWrong=(p.totalWrong||0)+1}
  write(PROGRESS,p);
 }
 function shield(){const p=read(PROGRESS,{solved:{}}),solved=p?.solved||{};
  return CORE.filter(k=>state.bank.filter(c=>c.criterion===k&&solved[c.id]).length>=3).length}
 function stopVoice(){try{speechSynthesis.cancel()}catch{}state.utter=null}
 function speak(s){stopVoice();if(!state.voice||document.hidden||!('speechSynthesis'in window))return;
  try{const utter=new SpeechSynthesisUtterance(s);utter.lang='ru-RU';utter.rate=.95;
   const voice=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ru'));if(voice)utter.voice=voice;
   state.utter=utter;speechSynthesis.speak(utter)}catch{}}
 function clearOverlay(){if(state.lastOverlay){stopVoice();state.lastOverlay=''}}
 function currentState(){try{if(typeof ARCADE==='undefined'||!ARCADE.engine)return null;
  const e=ARCADE.engine,status=e.status;
  if(!['lesson','remark','finalcheck'].includes(status))return null;
  const kind=status==='lesson'?'lesson':status==='remark'?'remark':'final';
  const index=kind==='lesson'?e.lesson?.caseIndex:kind==='remark'?e.board?.question:e.board?.completed.length;
  const c=candidate(e,kind,index);if(!c)return null;
  const feedback=kind==='lesson'?e.lesson?.feedback:kind==='remark'?e.remarkFeedback:
    e.finale?.answer==null?null:{index:e.finale.answer,correct:e.finale.answer===FINALE_TRIALS[index].correct};
  return {e,kind,index,c,feedback};
 }catch{return null}}
 function scan(){
  const root=document.getElementById('arcade-overlay');if(!root)return;
  const menu=root.querySelector('.arcade-menu');
  if(menu&&!menu.querySelector('.citadel-academy-menu')){
   const link=document.createElement('a');link.href='./academy.html';link.target='_blank';link.rel='noopener noreferrer';
   link.className='citadel-academy-menu';link.textContent='АКАДЕМИЯ ТРЕБОВАНИЙ · ТРЕНИРОВКА И РЕДАКТОР ↗';
   menu.append(link);
  }
  const current=currentState(),card=root.querySelector('.review-card');
  if(!current||!card){clearOverlay();return}
  const {kind,index,c,feedback,e}=current,correct=!!feedback?.correct;
  const identity=[seed32(e.seed),kind,index,c.id,feedback?.index??'?',correct,!!card.querySelector('.review-result')].join(':');
  if(state.lastOverlay===identity&&card.querySelector('.citadel-academy-note'))return;
  if(state.lastOverlay!==identity)stopVoice();state.lastOverlay=identity;
  card.querySelectorAll('.citadel-academy-note').forEach(x=>x.remove());
  const title=card.querySelector('.review-prompt h3');if(title&&kind==='remark')title.textContent=LABEL[c.criterion]+' · '+c.title;
  const panel=document.createElement('section');panel.className='citadel-academy-note';
  const head=document.createElement('div');head.className='citadel-academy-head';
  const label=document.createElement('b');label.textContent='АКАДЕМИЯ · '+LABEL[c.criterion].toUpperCase();
  const count=document.createElement('span');count.textContent='ЩИТ '+shield()+'/6';head.append(label,count);panel.append(head);
  if(feedback){
   const text=document.createElement('p');text.className='citadel-academy-excerpt';text.textContent=c.lesson;
   panel.append(text);
   const details=document.createElement('details');const sum=document.createElement('summary');sum.textContent='Как проверить исправленное ФТ';
   const test=document.createElement('p');test.textContent=c.test;details.append(sum,test);panel.append(details);
   const actions=document.createElement('div');actions.className='citadel-academy-actions';
   const listen=document.createElement('button');listen.type='button';listen.textContent='🔈 Зачитать';
   listen.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();speak(c.lesson)});
   const toggle=document.createElement('button');toggle.type='button';toggle.textContent=state.voice?'Озвучка: вкл':'Озвучка: выкл';
   toggle.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();state.voice=!state.voice;
    write(VOICE,state.voice);toggle.textContent=state.voice?'Озвучка: вкл':'Озвучка: выкл';if(!state.voice)stopVoice()});
   actions.append(listen,toggle);panel.append(actions);
  }else{
   const p=document.createElement('p');p.textContent='Оцени качество формулировки. Если сомневаешься — уточни, что можно будет проверить на приёмке.';panel.append(p);
  }
  const link=document.createElement('a');link.href='./academy.html?criterion='+encodeURIComponent(c.criterion);
  link.target='_blank';link.rel='noopener noreferrer';link.textContent='Отработать ещё кейсы этого критерия ↗';panel.append(link);
  card.append(panel);
  if(feedback&&state.voice)speak((correct?'Верное решение. ':'Это решение требует пересмотра. ')+c.lesson);
 }
 function attach(){
  if(typeof citadelLessonCase!=='function'||typeof citadelRemarkCase!=='function'||typeof citadelFinalCase!=='function'||
    typeof RequirementArcade==='undefined'||typeof FINALE_TRIALS==='undefined'){
   state.error='Основная игра не найдена';return false;
  }
  old.lesson=citadelLessonCase;old.remark=citadelRemarkCase;old.final=citadelFinalCase;
  citadelLessonCase=function(e,index){const q=old.lesson(e,index),c=candidate(e,'lesson',index);return c?decorate(q,c,'lesson'):q};
  citadelRemarkCase=function(e,index){const q=old.remark(e,index),c=candidate(e,'remark',index);return c?decorate(q,c,'remark'):q};
  const originalFinals=FINALE_TRIALS.map(x=>({...x}));let lastFinalSeed=null,lastFinalBank=null;
  function primeFinal(e){if(!e||!state.ready||isLegacy(e))return;
   if(lastFinalSeed===e.seed&&lastFinalBank===state.bank)return;
   lastFinalSeed=e.seed;lastFinalBank=state.bank;
   for(let i=0;i<3;i++){
    const c=candidate(e,'final',i);if(!c)continue;
    const original=originalFinals[i],choices=makeChoices(c,original.correct,3);
    Object.assign(FINALE_TRIALS[i],{title:LABEL[c.criterion]+' · '+c.title,
      q:'Ситуация: '+c.context+'\n\nПРОЕКТ ТРЕБОВАНИЯ: '+c.requirement+'\n\n'+(c.task||'Выберите наиболее обоснованное исправление.'),
      why:c.why+'\n\nПроверка: '+c.test,choices,correct:original.correct});
   }
  }
  citadelFinalCase=function(index){const e=typeof ARCADE!=='undefined'?ARCADE.engine:null;primeFinal(e);
   const q=old.final(index),c=candidate(e,'final',index);return c?decorate(q,c,'final'):q};
  // The finale checks correctness against FINALE_TRIALS directly, unlike the
  // two earlier kinds of checks. Prime it before the first finale answer.
  const p=RequirementArcade.prototype;
  old.start=p.start;p.start=function(...args){reloadLocal();write(CAMPAIGN,{seed:seed32(this.seed),version:VERSION});return old.start.apply(this,args)};
  old.answerLesson=p.answerLesson;p.answerLesson=function(index){const active=this.status==='lesson'&&!this.lesson?.solved;
   const i=this.lesson?.caseIndex,result=old.answerLesson.call(this,index);
   if(active&&Number.isInteger(index)&&index>=0&&index<4)record(this,'lesson',i,result===true);
   return result};
  old.answer=p.answer;p.answer=function(index){const active=this.status==='remark'&&!this.board?.answered;
   const i=this.board?.question,result=old.answer.call(this,index);
   if(active&&Number.isInteger(index)&&index>=0&&index<3)record(this,'remark',i,result===true);
   return result};
  old.answerFinale=p.answerFinale;p.answerFinale=function(index){primeFinal(this);
   const active=this.status==='finalcheck'&&this.finale?.answer===null;
   const i=this.board?.completed.length,result=old.answerFinale.call(this,index);
   if(active&&Number.isInteger(index)&&index>=0&&index<3)record(this,'final',i,result===true);
   return result};
  state.voice=read(VOICE,true)!==false;
  try{const save=read(SAVE,null),campaign=sessionKey();if(save&&Number.isFinite(save.seed)&&(!campaign||seed32(campaign.seed)!==seed32(save.seed)))state.legacySeed=seed32(save.seed)}catch{}
  const css=document.createElement('style');css.id='citadel-academy-style';css.textContent=`
   #arcade-overlay .citadel-academy-note{grid-column:1/-1;grid-row:auto;width:100%;flex:none;border:1px solid #477c80;border-radius:9px;background:#123343;color:#dcf3ef;padding:11px 14px;margin-top:7px;font:12px/1.45 system-ui,sans-serif;text-align:left}
   #arcade-overlay .citadel-academy-head{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#98f0d2;font:700 10px monospace;letter-spacing:.5px}
   #arcade-overlay .citadel-academy-head span{border:1px solid #427b68;border-radius:5px;padding:3px 8px;white-space:nowrap}
   #arcade-overlay .review-question .review-prompt>p{white-space:pre-line}
   #arcade-overlay .citadel-academy-note p{font:12px/1.5 system-ui,sans-serif;margin:7px 0;color:#e3f4f3}
   #arcade-overlay .citadel-academy-note summary{cursor:pointer;color:#b0f1de;min-height:24px}
   #arcade-overlay .citadel-academy-note button{font-size:11px;min-height:38px;padding:6px 10px;border:1px solid #6bb3aa;background:#204958;color:#f0fffa;border-radius:5px}
   #arcade-overlay .citadel-academy-note a{color:#b9ead7;font-size:11px;display:inline-block;margin-top:5px}
   #arcade-overlay .citadel-academy-actions{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0}
   #arcade-overlay .citadel-academy-menu{display:block;color:#b5ecd9;border:1px solid #659a96;text-decoration:none;border-radius:7px;text-align:center;padding:11px;margin-top:12px;font:700 11px/1.5 system-ui,sans-serif;min-height:44px}
   @media(max-width:600px){#arcade-overlay .citadel-academy-note{padding:8px 10px;margin-top:5px}#arcade-overlay .citadel-academy-note .citadel-academy-excerpt{font-size:11px}}
  `;document.head.append(css);
  let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()})});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-game-status']});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="citadel-lesson-next"], [data-action="citadel-remark-next"], [data-action="finale-check-next"], [data-action="arcade-menu"]'))stopVoice()},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice()});window.addEventListener('pagehide',stopVoice);
  window.citadelAcademyBridge={version:VERSION,get ready(){return state.ready},get count(){return state.bank.length},get source(){return state.source},get error(){return state.error},get shield(){return shield()},get selected(){return currentState()?.c?.id||null},plan:(seed)=>getPlan(seed)?.map(x=>x.id)||[],refresh:()=>{reloadLocal();return state.bank.length}};
  load();scan();return true;
 }
 try{attach()}catch(err){state.error=String(err?.message||err);console.warn('Академия: интеграция не активирована, базовая игра доступна.',err)}
})();