/* Citadel 2.7: separate training/combat quizzes and professional case studies.
 * Existing active saves retain their original questions. Quiz results never
 * enter the legacy cloud leaderboard; their checkpoints/records stay local.
 */
(()=>{
 'use strict';
 const VERSION='2.7.0';if(globalThis.CITADEL_LEARNING_MODES?.version===VERSION||typeof RequirementArcade==='undefined')return;
 const p=RequirementArcade.prototype,MODES=['training','combat','pro'],LABEL={training:'Учебный',combat:'Боевой',pro:'Профессиональный'};
 const CARDS=['lesson','remark','finalcheck'],clone=x=>JSON.parse(JSON.stringify(x)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const storage=()=>!globalThis.CITADEL_TEST_MEMORY_ONLY&&typeof CUP!=='undefined'&&typeof cupPack==='function';
 const PREF='cmpon.citadel.learning.mode.v1',SAVE='cmpon.citadel.quiz.run.v1.',RECORDS='cmpon.citadel.quiz.records.v1';
 const read=(key,fallback=null)=>{if(!storage())return fallback;try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
 const write=(key,value)=>{if(!storage())return false;try{localStorage.setItem(key,JSON.stringify(value));return true}catch{if(typeof ARCADE!=='undefined')ARCADE.storage=false;return false}};
 const old={start:p.start,answerLesson:p.answerLesson,answer:p.answer,answerFinale:p.answerFinale,continueLesson:p.continueLesson,continueRemark:p.continueRemark,
  continueFinal:p.continueFinaleCheck,step:p.step,pause:p.pause,beginStage:p.beginStage,checkpoint:p.checkpoint,retryFinale:p.retryFinale,
  lesson:citadelLessonCase,remark:citadelRemarkCase,final:citadelFinalCase,review:citadelReviewHTML,reviewState:citadelReviewState,
  action:arcadeAction,event:arcadeEvent,overlay:arcadeOverlayHTML,updateOverlay:updateArcadeOverlay,hud:updateArcadeHUD,record:saveArcadeRecord,report:citadelDecisionReport,
  unpack:typeof cupUnpack==='function'?cupUnpack:null,enqueue:typeof cupEnqueue==='function'?cupEnqueue:null,
  save:typeof citadelSave==='function'?citadelSave:null,finalPersist:typeof finalePersist==='function'?finalePersist:null,
  restore:typeof citadelRestore==='function'?citadelRestore:null,finalRestore:typeof finaleRestore==='function'?finaleRestore:null,
  retry:typeof citadelRetry==='function'?citadelRetry:null,lobby:typeof cupLobbyHTML==='function'?cupLobbyHTML:null,
  launch:typeof cupLaunch==='function'?cupLaunch:null,startDefault:typeof cupStartDefault==='function'?cupStartDefault:null,flush:typeof cupFlush==='function'?cupFlush:null,panel:typeof cupPanelHTML==='function'?cupPanelHTML:null};
 let preferred=read(PREF,'combat');if(!MODES.includes(preferred))preferred='combat';
 const storedRecords=read(RECORDS,{}),histories={training:0,combat:0};for(const k of ['training','combat'])if(Number.isFinite(storedRecords?.[k])&&storedRecords[k]>=0)histories[k]=storedRecords[k];
 let cloudLaunchMode=null;
 const saveMarks=new WeakMap();
 const getMode=e=>MODES.includes(e?.educationMode)?e.educationMode:e?.assist?'training':'pro';
 const usesQuiz=e=>!!e&&MODES.includes(e.educationMode)&&e.educationMode!=='pro'&&!e.educationLegacyCases;
 function setEngineMode(e,mode){if(!e||!MODES.includes(mode))throw new Error('Unknown education mode');
  const changed=e.educationMode!==mode;e.educationMode=mode;e.educationLegacyCases=false;e.assist=mode==='training';
  if(changed||!e.quiz270)e.quiz270={schema:1,bankVersion:VERSION,cards:{},answers:{},points:0};return e;
 }
 function setMode(mode){if(!MODES.includes(mode))return false;preferred=mode;write(PREF,mode);if(typeof ARCADE!=='undefined'){ARCADE.educationMode=mode;ARCADE.mode=mode==='training'?'calm':'normal';ARCADE.overlayToken='';}return true;}
 function migrate(e,saved){if(MODES.includes(saved?.educationMode)){e.educationMode=saved.educationMode;e.educationLegacyCases=!!saved.educationLegacyCases;
   e.quiz270=saved.quiz270?clone(saved.quiz270):{schema:1,bankVersion:VERSION,cards:{},answers:{},points:0};
  }else{e.educationMode=e.assist?'training':'pro';e.educationLegacyCases=true;delete e.quiz270;}return e;
 }
 function state(e){if(!e.quiz270||e.quiz270.schema!==1)e.quiz270={schema:1,bankVersion:VERSION,cards:{},answers:{},points:0};return e.quiz270;}
 function levelFor(kind,index){return kind==='lesson'?Math.floor(index/2)*3+1:kind==='remark'?Math.floor(index/3)*3+2:13;}
 function hash(s){let n=2166136261;for(const c of String(s)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
 function selectQuestion(e,kind,index){const s=state(e),key=kind+':'+index;if(s.cards[key])return s.cards[key];
  const bank=globalThis.CITADEL_QUIZ_BANK?.entries;if(!Array.isArray(bank)||!bank.length)throw new Error('Citadel quiz bank unavailable');
  // The third terminal prepares the next encounter, so the intervening
  // convoy/boss topics remain reachable without adding another gameplay stop.
  const level=levelFor(kind,index),tier=level+(kind!=='lesson'&&index%3===2?1:0),used=new Set(Object.values(s.cards).map(x=>x.id));
  let pool=bank.filter(x=>x.tier===tier&&!used.has(x.id));if(!pool.length)pool=bank.filter(x=>x.tier<=tier&&!used.has(x.id));if(!pool.length)pool=bank.filter(x=>!used.has(x.id));
  if(!pool.length)throw new Error('Citadel quiz bank exhausted');pool=pool.slice().sort((a,b)=>a.id.localeCompare(b.id));
  const q=pool[hash(e.seed+':'+key)%pool.length];if(q.options?.length!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3)throw new Error('Invalid quiz question');
  return s.cards[key]={id:q.id,level,tier:q.tier,question:q.question,options:q.options.slice(),correct:q.correct,explanation:q.explanation,hint:q.hint,points:100+25*(level-1)};
 }
 function getCase(e,kind,index){if(!usesQuiz(e))return kind==='lesson'?old.lesson(e,index):kind==='remark'?old.remark(e,index):old.final(index);
  const x=selectQuestion(e,kind,index);return {quizId:x.id,caseId:x.id,quizPoints:x.points,quizLevel:x.level,question:x.question,explanation:x.explanation,hint:x.hint,
   skill:'Короткий вопрос',title:'Короткий вопрос',situation:x.question,q:x.question,choices:x.options.slice(),correct:x.correct,why:x.explanation,
   outcome:{label:'Ответ принят',title:'Вопрос разобран',symbol:'✓',before:x.question,after:x.explanation,color:'#91e5c7'}};
 }
 function current(e){if(!e||!CARDS.includes(e.status))return null;const kind=e.status==='lesson'?'lesson':e.status==='remark'?'remark':'final',index=kind==='lesson'?e.lesson.caseIndex:kind==='remark'?e.board.question:e.board.completed.length;
  const q=getCase(e,kind,index),feedback=usesQuiz(e)?state(e).answers[kind+':'+index]||null:kind==='lesson'?e.lesson.feedback:kind==='remark'?e.remarkFeedback:e.finale.answer===null?null:{index:e.finale.answer,correct:e.finale.answer===q.correct};
  return{kind,index,q,feedback};
 }
 citadelLessonCase=(e,index)=>getCase(e,'lesson',index);
 citadelRemarkCase=(e,index)=>getCase(e,'remark',index);
 citadelFinalCase=index=>getCase(typeof ARCADE!=='undefined'?ARCADE.engine:null,'final',index);
 p.start=function(assist=false){const mode=cloudLaunchMode|| (MODES.includes(this.educationMode)?this.educationMode:assist?'training':preferred);setEngineMode(this,mode);
  this.quiz270={schema:1,bankVersion:VERSION,cards:{},answers:{},points:0};if(cloudLaunchMode){this.educationLegacyCases=true;delete this.quiz270;}return old.start.call(this,mode==='training');};
 if(typeof CUP_ENGINE_KEYS!=='undefined')for(const key of ['educationMode','educationLegacyCases','quiz270','overdriveUntil','escortStart'])if(!CUP_ENGINE_KEYS.includes(key))CUP_ENGINE_KEYS.push(key);
 if(old.unpack)cupUnpack=function(snapshot,...rest){return migrate(old.unpack.call(this,snapshot,...rest),snapshot?.engine);};
 p.checkpoint=function(){return{...old.checkpoint.apply(this,arguments),educationMode:getMode(this),educationLegacyCases:!!this.educationLegacyCases,...(usesQuiz(this)?{quiz270:clone(state(this))}:{})};};
 p.beginStage=function(){const result=old.beginStage.apply(this,arguments);if(usesQuiz(this)&&this.stageStart)this.stageStart.learning270=clone(state(this));return result;};
 function count(e){return usesQuiz(e)?Object.keys(state(e).answers).length:citadelResolvedCases(e).length;}
 function localRecord(e){if(!usesQuiz(e))return;const mode=getMode(e),score=Math.floor(e.score);if(!Number.isFinite(score)||score<=(histories[mode]||0))return;histories[mode]=score;write(RECORDS,histories);}
 function saveLocal(e,force=false){if(!usesQuiz(e)||typeof ARCADE==='undefined'||ARCADE.engine!==e||!storage()||e.status==='menu')return false;
  const key=[e.status,e.phase,e.stage,e.board?.completed.length,e.lesson?.caseIndex,count(e)].join('|'),mark=saveMarks.get(e);
  if(!force&&mark?.key===key&&Math.abs((e.elapsed||0)-mark.elapsed)<5)return false;
  const saved={schema:1,mode:getMode(e),snapshot:cupPack(e)};const ok=write(SAVE+saved.mode,saved);if(ok)saveMarks.set(e,{key,elapsed:e.elapsed||0});return ok;
 }
 function answer(e,index){const c=current(e);if(!usesQuiz(e)||!c||!Number.isInteger(index)||index<0||index>3||c.feedback)return false;
  const {kind,q}=c,key=kind+':'+c.index,s=state(e),correct=index===q.correct,points=correct?q.quizPoints:0;
  const feedback={index,correct,points,quizId:q.quizId};s.answers[key]=feedback;s.points+=points;e.score+=points;
  if(kind==='lesson'){const l=e.lesson;l.attempts=1;l.solved=true;l.feedback={...feedback};l.readClock=999;
   e.decisions.push({reqId:l.reqId,caseIndex:l.caseIndex,stage:l.stage,firstTry:correct,decision:index,quizId:q.quizId,quizCorrect:correct});
  }else if(kind==='remark'){e.board.answered=true;e.remarkFeedback={...feedback,why:q.why};
  }else e.finale.answer=index;
  e.emit(kind==='lesson'?'lesson-answer':'answer',correct);saveLocal(e,true);
  queueMicrotask(()=>{const now=current(e);if(typeof ARCADE!=='undefined'&&ARCADE.engine===e&&now?.q.quizId===q.quizId&&now.feedback)globalThis.CITADEL_VOICE?.speakLesson((correct?'Верно. ':'Правильный ответ: '+q.choices[q.correct]+'. ')+q.explanation);});
  return correct;
 }
 p.answerLesson=function(index){return usesQuiz(this)?answer(this,index):old.answerLesson.apply(this,arguments);};
 p.answer=function(index){return usesQuiz(this)?answer(this,index):old.answer.apply(this,arguments);};
 p.answerFinale=function(index){return usesQuiz(this)?answer(this,index):old.answerFinale.apply(this,arguments);};
 p.continueLesson=function(){if(!usesQuiz(this))return old.continueLesson.apply(this,arguments);const c=current(this);if(c?.kind!=='lesson'||!c.feedback)return;
  // This fixed intermission supply is independent of answer correctness.
  // Keep the normal flight balance while the quiz itself changes score only.
  this.player.hp=Math.min(100,this.player.hp+25);this.overdriveUntil=this.elapsed+12;
  globalThis.CITADEL_VOICE?.stop('quiz-next');const result=old.continueLesson.apply(this,arguments);saveLocal(this,true);return result;};
 function nextBoard(e,final){const c=current(e);if(!c||c.kind!==(final?'final':'remark')||!c.feedback)return;
  const b=e.board;globalThis.CITADEL_VOICE?.stop('quiz-next');
  if(!b.completed.includes(c.index))b.completed.push(c.index);
  if(final){e.finale.tests.push(c.index);e.finale.answer=null;}else if(!e.completedRemarks.includes(c.index))e.completedRemarks.push(c.index);
  e.status='boarding';b.hostile=[];b.bullets=[];b.hp=Math.min(100,b.hp+(final?30:22));b.energy=100;b.invulnerable=2;
  b.guideRoute=null;b.guideWatch=null;b.terminalGrace=final?.8:.45;e.remarkFeedback=null;
  if(b.completed.length<3)e.spawnBoardWave(final?(e.assist?5:8):5+e.stage);else b.returning=true;
  if(b.missions270&&typeof stationBuildNav==='function')stationBuildNav(b);
  e.say(b.completed.length<3?'Ответ сохранён. Следующий терминал отмечен на карте.':'Три вопроса разобраны. Следуйте к выходу.','success',true);
  e.emit('state','boarding');saveLocal(e,true);return true;
 }
 p.continueRemark=function(){return usesQuiz(this)?nextBoard(this,false):old.continueRemark.apply(this,arguments);};
 p.continueFinaleCheck=function(){return usesQuiz(this)?nextBoard(this,true):old.continueFinal.apply(this,arguments);};
 p.step=function(){const result=old.step.apply(this,arguments);if(usesQuiz(this)){saveLocal(this);if(this.status==='won')localRecord(this);}return result;};
 p.pause=function(){const result=old.pause.apply(this,arguments);saveLocal(this,true);return result;};
 if(old.enqueue)cupEnqueue=function(){if(usesQuiz(ARCADE.engine)){saveLocal(ARCADE.engine,true);return;}return old.enqueue.apply(this,arguments);};
 if(old.flush)cupFlush=function(){return preferred!=='pro'?Promise.resolve():old.flush.apply(this,arguments);};
 if(old.startDefault)cupStartDefault=function(){return preferred!=='pro'?Promise.resolve(localStart(false)):old.startDefault.apply(this,arguments);};
 if(old.save)citadelSave=function(){if(usesQuiz(ARCADE.engine))return saveLocal(ARCADE.engine,true);return old.save.apply(this,arguments);};
 if(old.finalPersist)finalePersist=function(e){if(usesQuiz(e)){if(e.finale){e.finale.checkpointScore=e.score;e.finale.learningCheckpoint=clone(state(e));}return saveLocal(e,true);}return old.finalPersist.apply(this,arguments);};
 if(old.retryFinale)p.retryFinale=function(){if(!usesQuiz(this))return old.retryFinale.apply(this,arguments);if(this.finale?.learningCheckpoint)this.quiz270=clone(this.finale.learningCheckpoint);return old.retryFinale.call(this,getMode(this)==='training');};
 if(old.restore)citadelRestore=function(){const saved=ARCADE.checkpoint||citadelReadSave(),result=old.restore.apply(this,arguments);if(saved)migrate(ARCADE.engine,saved);return result;};
 if(old.finalRestore)finaleRestore=function(){const saved=finaleReadSave(),result=old.finalRestore.apply(this,arguments);if(saved)migrate(ARCADE.engine,saved);return result;};
 if(old.retry)citadelRetry=function(...args){const before=ARCADE.engine;if(!usesQuiz(before))return old.retry.apply(this,args);
  const mode=getMode(before),saved=before.finale?.learningCheckpoint||before.escortStart?.quiz270||before.stageStart?.learning270||state(before),run=typeof CUP!=='undefined'?CUP.run:null;
  let result;try{if(typeof CUP!=='undefined')CUP.run=null;result=old.retry.call(this,mode==='training');}finally{if(typeof CUP!=='undefined')CUP.run=run;}
  const e=ARCADE.engine;setEngineMode(e,mode);e.quiz270=clone(saved);
  // The legacy retry builds its replacement before the education mode is
  // installed. Seed its new retry checkpoint too; a second death must roll
  // answers and score back to the same boundary as the first death.
  if(!e.finale&&e.phase!=='escort'&&e.stageStart)e.stageStart.learning270=clone(saved);
  if(e.phase==='escort'&&e.escortStart){e.escortStart.educationMode=mode;e.escortStart.educationLegacyCases=false;e.escortStart.quiz270=clone(saved);}
  saveLocal(e,true);refresh();return result;
 };
 saveArcadeRecord=function(){if(usesQuiz(ARCADE.engine))return localRecord(ARCADE.engine);return old.record.apply(this,arguments);};
 arcadeEvent=function(type,value){if(usesQuiz(ARCADE.engine)&&type==='state'&&value==='won'){
   // The legacy victory handler deletes its old checkpoint. A separate quiz
   // campaign must leave that unrelated professional/legacy save intact.
   arcadeEventBase(type,value);saveLocal(ARCADE.engine,true);ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();return;
  }return old.event.apply(this,arguments);};
 citadelDecisionReport=function(e,all=false){if(!usesQuiz(e))return old.report.apply(this,arguments);const s=state(e),rows=Object.entries(s.answers).filter(([key])=>all||Math.floor((s.cards[key].level-1)/3)===e.stage),correct=rows.filter(([,x])=>x.correct).length;
  return '<div class="decision-report learning-report"><p>Короткие вопросы: '+rows.length+' · верных ответов: '+correct+' · бонус: '+rows.reduce((n,[,x])=>n+x.points,0)+' очков.</p><details><summary>Разобранные вопросы</summary><ol>'+rows.map(([key,a])=>'<li><strong>'+esc(s.cards[key].question)+'</strong><p>'+esc(s.cards[key].explanation)+' <b>+'+a.points+'</b></p></li>').join('')+'</ol></details></div>';};
 function modePicker(){return '<div class="learning-mode-picker" role="group" aria-label="Режим игры">'+MODES.map(x=>'<button type="button" data-action="learning-mode" data-value="'+x+'" aria-pressed="'+(preferred===x)+'" class="'+(preferred===x?'active':'')+'">'+LABEL[x]+'</button>').join('')+'</div>';}
 const DESCRIPTIONS={training:'Мягкий бой, подсказки и короткие вопросы. Результаты — на этом устройстве.',combat:'Полный бой и короткие вопросы. Ошибка влияет только на очки. Результаты — на этом устройстве.',pro:'Полный бой и развёрнутые профессиональные кейсы. Сохраняются прежние правила вопросов и облачный рейтинг.'};
 function localSave(mode=preferred){const s=read(SAVE+mode);return s?.schema===1&&s.mode===mode&&s.snapshot?.engine?.educationMode===mode?s:null;}
 function quizLobby(){const saved=localSave(),continueRun=saved&&saved.snapshot.engine.status!=='won';return '<div class="arcade-menu campaign-menu learning-lobby"><span class="arcade-serial">ЦИТАДЕЛЬ ЦСИИ · 14 МИССИЙ</span><h3>ЦИТАДЕЛЬ <span>ЦСИИ</span></h3>'+modePicker()+'<p class="learning-mode-description">'+DESCRIPTIONS[preferred]+'</p>'+(continueRun?'<button class="arcade-play" data-action="learning-continue">Продолжить игру →</button>':'')+'<button class="'+(continueRun?'arcade-secondary':'arcade-play')+'" data-action="learning-start">'+(continueRun?'Начать заново':'Начать игру →')+'</button><p class="learning-local-record">Рекорд · '+LABEL[preferred]+' · <b>'+Math.floor(histories[preferred]||0).toLocaleString('ru-RU')+'</b> очков<br><small>на этом устройстве</small></p><button class="cup-link" data-action="learning-mode" data-value="pro">Профессиональные кейсы и прежние облачные рекорды ↗</button><small class="app-release">Приложение v'+esc(typeof APP_RELEASE==='object'&&APP_RELEASE.version||VERSION)+'</small></div>';}
 function withPicker(html){if(html.includes('class="learning-mode-picker"'))return html;const picker=modePicker()+'<p class="learning-mode-description">'+DESCRIPTIONS[preferred]+'</p>';return /<div class="arcade-mode">/.test(html)?html.replace(/<div class="arcade-mode">[\s\S]*?<\/div>/,picker):html.replace('<div class="cup-entry">','<div class="cup-entry">'+picker);}
 if(old.lobby)cupLobbyHTML=function(){return preferred==='pro'?withPicker(old.lobby.apply(this,arguments)):quizLobby();};
 if(old.panel)cupPanelHTML=function(){const local='<div class="learning-record-summary"><b>Короткие вопросы · на этом устройстве</b><p>Учебный: '+histories.training+' · Боевой: '+histories.combat+'</p><small>Ниже — отдельный облачный зачёт профессиональных кейсов и прежних прохождений.</small></div>';
  return old.panel.apply(this,arguments).replace('</header>','</header>'+local).replace(/(<option value="normal"[^>]*>)Боевой(<\/option>)/g,'$1Профессиональный / прежний боевой$2').replace(/(<option value="calm"[^>]*>)Учебный(<\/option>)/g,'$1Прежний учебный · развёрнутые кейсы$2');};
 function modeLabel(e){const menu=e?.status==='menu';return LABEL[menu?preferred:getMode(e)]+(!menu&&e?.educationLegacyCases?' · прежние кейсы':'');}
 arcadeOverlayHTML=function(){const e=ARCADE.engine,story=globalThis.CITADEL_STORY?.status(e).active;
  if(usesQuiz(e)&&CARDS.includes(e.status)&&!story&&(typeof CUP==='undefined'||!CUP.panel))return quizHTML(e);
  if(e?.status==='menu'&&preferred!=='pro'&&!story&&(typeof CUP==='undefined'||!CUP.panel))return quizLobby();let html=withPicker(old.overlay.apply(this,arguments));
  if(usesQuiz(e))html=html.replace(/<p class="lesson-summary">[\s\S]*?<\/p>/,'<p class="lesson-summary">Разобрано коротких вопросов: <b>'+count(e)+' / 23</b></p>');
  if(e&&!story&&['paused','stageclear','won','lost'].includes(e.status))html=html.replace('<h3','<p class="learning-mode-current">'+modeLabel(e)+'</p><h3');return html;};
 updateArcadeOverlay=function(){const e=ARCADE.engine;document.getElementById('arcade-overlay')?.classList.toggle('learning-review-open',usesQuiz(e)&&CARDS.includes(e.status));return old.updateOverlay.apply(this,arguments);};
 function quizHTML(e){const c=current(e);if(!c)return '';const {q,feedback,kind}=c,done=!!feedback,mode=getMode(e),answerAction=kind==='lesson'?'citadel-lesson-answer':kind==='final'?'finale-answer':'citadel-answer',nextAction=kind==='lesson'?'citadel-lesson-next':kind==='final'?'finale-check-next':'citadel-remark-next';
  return '<section class="learning-quiz '+(done?'is-answered':'')+'" aria-label="Короткий вопрос"><header><span>'+LABEL[mode]+' · УРОВЕНЬ '+q.quizLevel+'</span><b>Вопрос '+(count(e)+(done?0:1))+' / 23</b></header><h3>'+esc(q.question)+'</h3>'+(mode==='training'&&!done?'<p class="learning-hint"><b>Подсказка:</b> '+esc(q.hint)+'</p>':'')+'<div class="learning-choices">'+q.choices.map((x,i)=>'<button type="button" data-action="'+answerAction+'" data-value="'+i+'"'+(done?' disabled':'')+' class="'+(done&&i===q.correct?'is-correct':done&&i===feedback.index?'is-wrong':'')+'"><b>'+String.fromCharCode(65+i)+'</b><span>'+esc(x)+'</span>'+(done&&i===q.correct?'<i aria-label="Правильный ответ">✓</i>':done&&i===feedback.index?'<i aria-label="Неверный ответ">×</i>':'')+'</button>').join('')+'</div>'+(done?'<div class="learning-feedback" role="status"><strong class="'+(feedback.correct?'is-correct':'is-wrong')+'">'+(feedback.correct?'Верно':'Ответ принят')+' · +'+feedback.points+' очков</strong><p>'+esc(q.explanation)+'</p><button class="review-continue" data-action="'+nextAction+'">Продолжить →</button></div>':'<p class="learning-rule">Один ответ. Верный — +'+q.quizPoints+' очков. Ошибка — +0. Время на чтение не ограничено.</p>')+'</section>';
 }
 citadelReviewHTML=function(e){return usesQuiz(e)?quizHTML(e):old.review.apply(this,arguments);};
 citadelReviewState=function(e){if(!usesQuiz(e))return old.reviewState.apply(this,arguments);const c=current(e);return {...c,lesson:c.kind==='lesson',final:c.kind==='final',solved:!!c.feedback,correct:!!c.feedback?.correct};};
 updateArcadeHUD=function(){const result=old.hud.apply(this,arguments),e=ARCADE.engine;if(e){const mode=document.getElementById('arcade-stage-label');if(mode)mode.textContent=modeLabel(e).toUpperCase();}
  if(usesQuiz(e)){const el=document.getElementById('arcade-record');if(el){el.textContent=Math.floor(histories[getMode(e)]||0).toLocaleString('ru-RU');el.title=LABEL[getMode(e)]+' · на этом устройстве';}}return result;};
 function refresh(){if(typeof ARCADE==='undefined')return;ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}
 function localStart(resume){if(!['training','combat'].includes(preferred))return false;globalThis.CITADEL_VOICE?.stop('new-quiz-run');const saved=resume?localSave():null;
  globalThis.CITADEL_LAUNCH?.releaseLocalSession?.();
  if(typeof CUP!=='undefined'){CUP.attached=false;if(CUP.panel)cupClosePanel(false);}
  let e;if(saved){const snap=saved.snapshot;e=cupUnpack(snap,{seed:snap.engine.seed,mode:snap.engine.assist?'calm':'normal'},arcadeEvent);}
  else {e=new RequirementArcade(Date.now(),arcadeEvent);setEngineMode(e,preferred);e.start(preferred==='training');}
  ARCADE.engine=e;ARCADE.mode=e.assist?'calm':'normal';ARCADE.feed=[];ARCADE.camera=null;ARCADE.overlayToken='';ARCADE.captainSerial=-1;clearArcadeInput();
  spaceAudioUnlock();if(resume&&e.status!=='paused')e.pause();saveLocal(e,true);refresh();ARCADE.canvas?.focus({preventScroll:true});return true;
 }
 if(old.launch)cupLaunch=async function(run,...rest){const previous=preferred;preferred='pro';cloudLaunchMode=run.mode==='calm'?'training':'pro';try{const result=await old.launch.call(this,run,...rest);const e=ARCADE.engine;
   if(!run.snapshot){e.educationMode=run.mode==='calm'?'training':'pro';e.educationLegacyCases=true;delete e.quiz270;}
   preferred=getMode(e)==='training'?'pro':getMode(e);ARCADE.educationMode=preferred;refresh();return result;
  }catch(error){preferred=previous;throw error;}finally{cloudLaunchMode=null;}};
 arcadeAction=function(action,value){const e=ARCADE.engine;
  if(action==='learning-mode'||action==='arcade-mode'){if(e&&e.status!=='menu'&&!['won','lost'].includes(e.status))return true;const m=value==='calm'?'training':value==='normal'?'combat':value;if(setMode(m))refresh();return true;}
  if(action==='learning-start'||action==='learning-continue'||preferred!=='pro'&&['arcade-start','cup-play','cup-new','launch-local','launch-new','cup-guest'].includes(action)){localStart(action==='learning-continue');return true;}
  if(usesQuiz(e)&&action==='citadel-lesson-retry')return true;
  const result=old.action.apply(this,arguments);if(usesQuiz(ARCADE.engine))saveLocal(ARCADE.engine,true);return result;
 };
 // The existing keyboard router only accepts three answers on ground decks.
 // Capture every quiz choice once, including Digit4, before that legacy router.
 document.addEventListener('keydown',event=>{const e=typeof ARCADE!=='undefined'?ARCADE.engine:null;if(!usesQuiz(e)||!CARDS.includes(e.status)||(typeof STATE!=='undefined'&&STATE.view!=='arcade')||(typeof MOBILE!=='undefined'&&(MOBILE.menu||MOBILE.command))||(typeof CUP!=='undefined'&&CUP.panel)||document.querySelector('dialog[open]')||!/^Digit[1-4]$/.test(event.code)||event.repeat||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
  event.preventDefault();event.stopImmediatePropagation();const c=current(e);arcadeAction(c.kind==='lesson'?'citadel-lesson-answer':c.kind==='final'?'finale-answer':'citadel-answer',Number(event.code.slice(-1))-1);},true);
 // Window capture precedes the older document-capture ranking form handler.
 // An old form still in the DOM must never start a ranked quiz campaign.
 globalThis.addEventListener('submit',event=>{if(preferred==='pro'||event.target?.id!=='cup-entry-form')return;event.preventDefault();event.stopImmediatePropagation();localStart(false);},true);
 globalThis.CITADEL_LEARNING_MODES=Object.freeze({version:VERSION,modes:MODES.slice(),labels:{...LABEL},getMode,usesQuiz,setMode,setEngineMode,configureEngine:setEngineMode,current,getCase,count,
  saveLocal,recordKey:e=>usesQuiz(e)?'quiz-'+getMode(e):e?.assist?'legacy-calm':'legacy-normal',get preferred(){return preferred;},get records(){return {...histories};}});
 setMode(preferred);
})();
