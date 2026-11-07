/* One presentation and keyboard router for short quizzes, professional cases,
 * campaign questions and the resonator. Original answer rules remain authoritative. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_QUIZ_UI)return;
 const L=CITADEL_LEARNING_MODES,C=CITADEL_CAMPAIGN;
 const old={overlay:arcadeOverlayHTML,update:updateArcadeOverlay,action:arcadeAction};
 const button=(a,t,v='',cls='')=>'<button type="button" class="'+cls+'" data-action="'+a+'" data-value="'+esc(String(v))+'">'+t+'</button>';
 function answerOrder(e,id,count){
  // Presentation only: saved answers keep their original canonical meaning.
  let n=(e.seed||1)>>>0;for(const ch of id)n=(Math.imul(n^ch.charCodeAt(0),16777619))>>>0;
  const order=Array.from({length:count},(_,i)=>i);for(let i=count-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[order[i],order[j]]=[order[j],order[i]];}return order;
 }
 function current(e){
  if(!e||e.campaign2120?.modal||globalThis.CITADEL_COLLECTION?.view(e)||CITADEL_STORY?.status(e).active||(typeof CUP!=='undefined'&&CUP.panel))return null;
  if(e.status==='campaigncard'){
   const card=e.campaign2120?.card,q=C.questions[card?.mission];if(!q)return null;
   const order=answerOrder(e,card.mission,q.choices.length);
   return {q,order,prompt:q.q,choices:order.map(i=>q.choices[i]),correct:q.correct,feedback:card.answer===null?null:{index:card.answer,correct:card.correct},
    answer:'campaign-answer',next:'campaign-card-next',retry:card.mission==='contradictions'&&!card.correct,explanation:q.why,
    title:C.title(card.mission),sources:card.mission==='contradictions'?['Запрос: что обследовать, где и когда.','Задание: кому поручить конкретную работу.']:null};
  }
  const c=L.current(e);if(!c)return null;
  const {kind,q,feedback}=c,short=L.usesQuiz(e),retry=!!feedback&&!feedback.correct&&!short;
  return {...c,prompt:q.question||q.situation||q.q,choices:q.choices,correct:q.correct,
   answer:kind==='lesson'?'citadel-lesson-answer':kind==='final'?'finale-answer':'citadel-answer',
   next:kind==='lesson'?(retry?'citadel-lesson-retry':'citadel-lesson-next'):kind==='final'?'finale-check-next':'citadel-remark-next',
   retry,explanation:q.explanation||q.why,title:C.active(e)?C.title(C.mission(e)):q.skill||q.title||'Разбор решения',
   hint:short&&L.getMode(e)==='training'?q.hint:null,source:!short&&kind==='lesson'?REQS.get(e.lesson.reqId):null,
   outcome:!short&&feedback?.correct?q.outcome?.after:null};
 }
 function render(e){const c=current(e);if(!c)return null;const done=!!c.feedback,correct=i=>Array.isArray(c.correct)?c.correct.includes(i):c.correct===i;
  return '<section class="quiz2170'+(done?' is-answered':'')+'" aria-labelledby="quiz2170-question"><header><span>'+esc(c.title)+'</span></header>'+
   '<div class="quiz2170-prompt">'+(c.sources?'<p class="quiz2170-context">'+c.sources.map(esc).join('<br>')+'</p>':'')+'<h3 id="quiz2170-question">'+esc(c.prompt)+'</h3></div>'+
   '<div class="quiz2170-choices">'+c.choices.map((text,display)=>{const i=c.order?.[display]??display;return '<button type="button" data-action="'+c.answer+'" data-value="'+i+'"'+(done?' disabled':'')+' class="'+(done&&correct(i)?'is-correct':done&&i===c.feedback.index?'is-wrong':'')+'"><b aria-hidden="true">'+String.fromCharCode(65+display)+'</b><span>'+esc(text)+'</span>'+(done&&correct(i)?'<i aria-label="Верный вариант">✓</i>':done&&i===c.feedback.index?'<i aria-label="Неверный вариант">×</i>':'')+'</button>';}).join('')+'</div>'+
   (done?'<div class="quiz2170-result" role="status"><strong>'+ (c.feedback.correct?'Верно':'Неверно')+(Number.isFinite(c.feedback.points)?' · +'+c.feedback.points+' очков':'')+'</strong><p>'+esc(c.explanation||'')+'</p>'+(c.outcome&&c.outcome!==c.explanation?'<details><summary>Что изменилось</summary><p>'+esc(c.outcome)+'</p></details>':'')+button(c.next,c.retry?'Попробовать ещё раз':'Продолжить →','','quiz2170-next')+'</div>':
    (c.hint?'<details class="quiz2170-hint"><summary>Подсказка</summary><p>'+esc(c.hint)+'</p></details>':'')+(c.source?'<details class="quiz2170-source"><summary>Исходный материал</summary><p>'+esc(c.source.text)+'</p></details>':''))+'</section>';
 }
 arcadeOverlayHTML=function(){return render(ARCADE.engine)??old.overlay.apply(this,arguments);};
 let renderedQuestion='';
 updateArcadeOverlay=function(){const c=current(ARCADE.engine),signature=c?JSON.stringify([c.prompt,c.choices,c.feedback,c.explanation]):'';
  // The editable professional bank loads asynchronously. Refresh its actual
  // question once ready, rather than leaving the fallback text on the screen.
  if(signature!==renderedQuestion){renderedQuestion=signature;ARCADE.overlayToken='';}
  const result=old.update.apply(this,arguments);document.getElementById('arcade-overlay')?.classList.toggle('quiz2170-open',!!c);return result;
 };
 arcadeAction=function(action,value){const before=current(ARCADE.engine);
  if(before?.feedback&&action===before.answer)return true;
  const r=old.action.apply(this,arguments),after=current(ARCADE.engine);
  if(before&&after&&action===before.answer&&!before.feedback&&after.feedback){
   document.querySelector?.('.quiz2170-result')?.scrollIntoView?.({block:'nearest'});
   document.querySelector?.('.quiz2170-next')?.focus?.({preventScroll:true});
   // Academy-decorated cases used to be narrated by a DOM observer on the old card.
   if(after.q.academyLesson||action==='campaign-answer')CITADEL_VOICE?.speakLesson((after.feedback.correct?'Верно. ':'Неверно. ')+after.explanation);
  }return r;
 };
 globalThis.addEventListener?.('keydown',event=>{
  const c=current(ARCADE.engine);if(!c||(typeof STATE!=='undefined'&&STATE.view!=='arcade')||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||(typeof MOBILE!=='undefined'&&(MOBILE.menu||MOBILE.command))||document.querySelector?.('dialog[open]'))return;
  const match=/^(?:Digit|Numpad)([1-4])$/.exec(event.code),letter=/^Key([A-D])$/.exec(event.code);if(!match&&!letter)return;
  event.preventDefault();event.stopImmediatePropagation();const i=match?Number(match[1])-1:letter[1].charCodeAt(0)-65;
  if(!c.feedback&&i<c.choices.length)arcadeAction(c.answer,c.order?.[i]??i);
 },true);
 globalThis.CITADEL_QUIZ_UI=Object.freeze({version:'2.17.7',current,render,answerOrder});
})();
