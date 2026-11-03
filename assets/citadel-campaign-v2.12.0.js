/* 2.12: stable mission IDs, a local 15-chapter campaign and reversible drills.
 * Legacy/cloud snapshots keep their original route. No server-score migration.
 * UI actions are the same entry points used by the automated regression tests. */
(()=>{
 'use strict';
 if(globalThis.CITADEL_CAMPAIGN||typeof RequirementArcade!=='function')return;
 const VERSION='2.12.0',p=RequirementArcade.prototype,clone=x=>JSON.parse(JSON.stringify(x));
 const ids=['orbit1','base1','convoy1','pursuit','base2','route','swarm','parallax','base3','convoy3','orbit4','base4','contradictions','lair','mrg'];
 const names=['Орбита Цитадели','Палуба требований','Первый конвой','Погоня за ФЗ','Палуба согласования','Маршрут смежников','Рой уточнений','Параллакс','Палуба интеграции','Последний конвой','Последняя орбита','Палуба выпуска','Станция противоречий','Логово МРГ','МРГ · последний рубеж'];
 const old={};for(const k of ['start','beginStage','beginBoarding','finishBoarding','beginFinale','beginFinalLanding','beginLair','beginMRG','beginUpload','beginEscort','finishEscort','completeEscort','next','step','boardInteract','spawnBoardWave','objective','launch','launchEscort','launchFinale','answer','continueRemark','damage','mrgDamage','pulse','boardPulse','pause','resume','checkpoint'])old[k]=p[k];
 Object.assign(old,{unpack:cupUnpack,pack:cupPack,action:arcadeAction,overlay:arcadeOverlayHTML,update:updateArcadeOverlay,hud:updateArcadeHUD,scene:spaceScene,camera:spaceCamera,finalPersist:finalePersist,retry:citadelRetry,finalRetry:p.retryFinale,case:citadelRemarkCase});
 const active=e=>e?.campaign2120?.schema===1;
 const state=e=>e.campaign2120;
 function fresh(){return{schema:1,version:VERSION,completed:[],answers:{},route:null,branchActive:false,branchPackets:0,earlyBoss:false,parallaxDone:false,station:null,document:{},changed:null,echo:null,encounters:{},events:[],card:null,modal:null,next:null,retry:null,practice:null};}
 function enable(e){if(!active(e))e.campaign2120=fresh();return state(e);}
 function mission(e){
  if(!active(e))return null;const s=state(e);
  if(s.card)return s.card.mission;
  if(e.status==='campaignroute')return'route';
  if(s.station)return'contradictions';
  if(s.earlyBoss||e.finale&&['boss','breach','landing'].includes(e.finale.phase))return'parallax';
  if(e.finale)return['mrg','upload','victory'].includes(e.finale.phase)?'mrg':'lair';
  if(s.branchActive)return'route';
  if(e.phase==='escort')return e.stage===0?'convoy1':e.stage===1?'route':'convoy3';
  return(e.board?['base1','base2','base3','base4']:['orbit1','pursuit','swarm','orbit4'])[e.stage]||'orbit1';
 }
 const number=e=>ids.indexOf(mission(e))+1;
 const title=id=>names[ids.indexOf(id)]||'Цитадель';
 function refresh(){if(typeof ARCADE==='undefined')return;ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}
 function checkpoint(e){if(!active(e)||state(e).practice)return;const s=state(e),keep=s.retry;s.retry=null;try{s.retry=old.pack(e);}catch(_){s.retry=keep;}}
 const saveKey=e=>'cmpon.citadel.campaign2120.'+(e.educationMode||'combat');
 let savedAt=-Infinity,savedState='';
 function save(e,force=false){if(!active(e)||state(e).practice||globalThis.CITADEL_TEST_MEMORY_ONLY||typeof localStorage==='undefined'||e.status==='menu')return false;
  const key=[e.status,mission(e),e.board?.completed.length,state(e).completed.length,state(e).card?.answer].join('|');
  if(!force&&key===savedState&&(e.elapsed||0)-savedAt<4)return false;
  try{localStorage.setItem(saveKey(e),JSON.stringify(old.pack(e)));savedAt=e.elapsed||0;savedState=key;return true;}catch(_){return false;}
 }
 function read(mode){try{const x=JSON.parse(localStorage.getItem('cmpon.citadel.campaign2120.'+mode)||'null');return x?.schema===1&&x.engine?.campaign2120?.schema===1?x:null;}catch(_){return null;}}
 function restore(snapshot){const e=cupUnpack(snapshot,{seed:snapshot.engine.seed,mode:snapshot.engine.assist?'calm':'normal'},arcadeEvent);ARCADE.engine=e;ARCADE.camera=null;clearArcadeInput();refresh();return e;}
 function log(e,text,kind='event'){if(!active(e))return;const list=state(e).events;list.push({at:+(e.elapsed||0).toFixed(2),mission:mission(e),text,kind});if(list.length>8)list.shift();}
 const updates={
  orbit1:['goal','Цель: доставить проверяемый пакет требований до исполнения.'],base1:['scope','Границы: потребности заказчика отделены от дополнительных пожеланий.'],
  convoy1:['links','Передача: исходная редакция доставлена исполнителю.'],pursuit:['goal','Цель уточнена: назначение результата подтверждено по каналу ФЗ.'],
  base2:['acceptance','Приёмка: условия результата согласованы до начала исполнения.'],route:['links','Связи: смежникам передан один подтверждённый комплект.'],
  swarm:['links','Связи: замечания смежников сведены в общий пакет.'],parallax:['scope','Границы: блокирующие условия сняты; путь к проверке интеграций открыт.'],
  base3:['links','Связи: владельцы, обмены и полномочия согласованы.'],convoy3:['links','Передача: итоговый комплект доставлен через блокаду.'],
  orbit4:['scope','Границы: новые идеи отделены от состава согласованной версии.'],base4:['acceptance','Приёмка: подтверждённые блокеры закрыты, история решений сохранена.'],
  contradictions:['terms','Термины: заявка на обследование и задание исполнителю явно различены.'],lair:['acceptance','Приёмка: доказательства, испытания и согласование относятся к одной версии.'],mrg:['acceptance','Приёмка: проверенный комплект передан на исполнение.']};
 function complete(e,id){const s=state(e);if(s.completed.includes(id))return false;s.completed.push(id);const [key,line]=updates[id];s.document[key]=id==='contradictions'&&s.answers.contradictions?.index===1?'Термины: единый объект имеет явный вид, владельца и отдельные состояния обследования и работы.':line;s.changed=key;return true;}
 const questions={
  convoy1:{q:'Перед передачей архива обнаружены две редакции требования. Что передаём исполнителю?',choices:['Обе без пояснений','Одну согласованную редакцию с датой и владельцем','Самую длинную редакцию'],correct:1,why:'У получателя должен быть один определённый комплект: версия, дата и ответственный за согласование.'},
  route:{q:'Смежник подтверждает только формат обмена. Достаточно ли этого для согласования интеграции?',choices:['Да, формат определяет всё','Нет: нужны состав данных, владелец, момент передачи и обработка ошибок','Да, остальное решится при запуске'],correct:1,why:'Интеграция — договор о данных и поведении сторон, а не только формат сообщения.'},
  convoy3:{q:'Во время доставки предложили срочно добавить новую функцию. Как сохранить управляемость версии?',choices:['Незаметно добавить её в согласованный пакет','Сохранить согласованную версию, оформить изменение и оценить его влияние','Остановить доставку всех требований'],correct:1,why:'Предложение не теряется, но включается в выпуск через явное решение об изменении.'},
  parallax:{q:'Блокирующее условие снято. Что позволяет считать путь к исполнению открытым?',choices:['Яркое сообщение о победе','Подтверждённые критерии и проверяемые основания решения','Количество потраченных ракет'],correct:1,why:'Готовность подтверждают основания и критерии: эффектный результат сам по себе их не заменяет.'},
  contradictions:{q:'Заказчик называет «заявкой» запрос на обследование, исполнитель — назначенную работу. Как устранить противоречие?',choices:['Разделить объекты: «заявка на обследование» и «задание исполнителю», связать их идентификатором','Ввести общий объект с явным видом, владельцем и отдельными состояниями','Оставить одно слово без определения'],correct:[0,1],why:'Допустимы обе модели: раздельные связанные объекты или общий объект с явным видом. В обоих случаях владельцы и состояния определены, смысл нельзя угадывать.'}
 };
 function openCard(e,id,next){const s=state(e);if(s.answers[id])return transition(e,next);s.card={mission:id,answer:null,correct:null};s.next=next;e.status='campaigncard';e.hostile=[];e.bullets=[];save(e,true);e.emit('state',e.status);}
 function answer(e,index){const s=state(e),c=s?.card,q=c&&questions[c.mission];if(!c||c.answer!==null||!Number.isInteger(index)||!q?.choices[index])return false;
  c.answer=index;c.correct=Array.isArray(q.correct)?q.correct.includes(index):q.correct===index;
  // Station has two defensible solutions; an incompatible command must be corrected.
  if(c.mission!=='contradictions'||c.correct){s.answers[c.mission]={index,correct:c.correct};if(c.correct)e.score+=100;}
  save(e,true);refresh();return c.correct;
 }
 function nextCard(e){const s=state(e);if(!s.card||s.card.answer===null)return false;if(s.card.mission==='contradictions'&&!s.card.correct){s.card.answer=null;s.card.correct=null;refresh();return false;}
  const id=s.card.mission,next=s.next;complete(e,id);s.card=null;s.next=null;transition(e,next);save(e,true);refresh();return true;
 }
 function summary(e,id,next){complete(e,id);state(e).next=next;e.status='campaignsummary';save(e,true);e.emit('state',e.status);}
 function transition(e,next){const s=state(e);s.next=null;
  if(next==='boarding'){old.beginBoarding.call(e);checkpoint(e);}
  else if(next==='boss'){s.earlyBoss=true;old.beginFinale.call(e);e.say('Рой рассеян, но путь к палубе интеграций перекрыл Параллакс. Четыре маяка, затем центральный кристалл.','order',true);checkpoint(e);}
  else if(next==='afterboss'){s.earlyBoss=false;s.parallaxDone=true;e.finale=null;e.crash=null;e.phase='boarding';old.beginBoarding.call(e);checkpoint(e);globalThis.CITADEL_EXPERIENCE?.openAfterParallax(e);}
  else if(next==='escortclear'){e.status='escortclear';e.emit('state','escortclear');}
  else if(next==='branchclear'){s.branchActive=false;e.status='escortclear';e.phase='escort';e.escort={completed:true,definition:{name:'Уточнение через погоню',destination:'Узел интеграций'},allies:[],kills:0};e.emit('state','escortclear');}
  else if(next==='station-read'){const b=e.board,index=s.station.reading;s.station.reads.push(index);if(!b.completed.includes(index))b.completed.push(index);s.station.reading=null;e.status='boarding';b.guideRoute=null;stationBuildNav(b);e.emit('state','boarding');}
  else if(next==='station-resolved'){s.station.solution=s.answers.contradictions.index;e.board.completed=[0,1,2];e.board.returning=true;e.board.guideRoute=null;e.status='boarding';stationBuildNav(e.board);e.say('Определение согласовано. Проверочный шлюз открыт. Пройди к выходу и передай этот комплект дальше.','success',true);}
 }
 function completeBranch(e){const s=state(e);if(!s.branchActive||s.card)return;s.branchPackets=3;e.pursuit.state='return';e.score+=900;openCard(e,'route','branchclear');}
 function selectRoute(e,route){if(!active(e)||e.status!=='campaignroute'||!['convoy','pursuit'].includes(route))return false;const s=state(e);if(s.route)return false;s.route=route;
  if(route==='convoy'){e.status='stageclear';old.beginEscort.call(e);}
  else{s.branchActive=true;s.branchPackets=0;e.board=null;e.finale=null;e.escort=null;e.player.hp=100;e.player.energy=100;e.player.missiles=Math.max(e.player.missiles,10);CITADEL_PURSUIT.startBranch(e);e.status='briefing';}
  echo(e);checkpoint(e);save(e,true);refresh();return true;
 }
 function echo(e){const s=state(e);if(!s.echo||s.echo.delivered)return;s.echo.delivered=true;const x=s.echo;s.echo.text=(x.correct?'Смежники получили твоё решение из первого архива: «':'Смежники получили уточнение после разбора в первом архиве: «')+(x.resolution||'Сохранить проверяемое основание решения')+'». '+(x.correct?'Оно включено в передаваемый комплект.':'Первоначальный ответ и исправление сохранены в истории комплекта.');log(e,s.echo.text,'story');e.say(s.echo.text,'success',true);}
 function startStation(e){const s=state(e);s.station={reads:[],reading:null,solution:null};e.finale=null;e.crash=null;e.escort=null;e.dock=null;e.boss=null;e.phase='boarding';e.status='boarding';
  const deck=stationMakeDeck(0),d=deck.definition=clone(deck.definition);d.name='Станция противоречий';d.missionName=d.name;d.missionTheme='contradictions';d.accent='#a6d6cb';
  e.board={...deck,pos:d.spawn.slice(),previous:d.spawn.slice(),camera:d.spawn.slice(),yaw:Math.PI,hp:100,energy:100,cooldown:0,pulseCooldown:0,pulseWave:0,invulnerable:2,time:0,kills:0,enemies:[],bullets:[],hostile:[],sparks:[],terminal:0,completed:[],question:null,answered:false,returning:false,guide:false,guideRoute:null,terminals:d.terminals.map(x=>x.slice()),exit:d.exit.slice(),intro:1,zone:0,lastZone:0,zoneBanner:4,terminalGrace:0};
  stationBuildNav(e.board);globalThis.CITADEL_BASE_REWARDS?.ensure(e);e.say('Две службы называют заявкой разные объекты. Найди обе записи, затем согласуй определение на третьем терминале. Здесь можно спокойно читать.','order',true);checkpoint(e);save(e,true);e.emit('state','boarding');
 }
 function stationInteract(e){const s=state(e),b=e.board,n=b.completed.length,goal=n<3?b.terminals[n]:b.exit;if(V3.len(V3.sub(b.pos,goal))>3.1||!stationLine(b,b.pos,goal,.15))return false;
  if(n===3){complete(e,'contradictions');s.station=null;e.finale={phase:'maze',checkpoint:'maze',time:0,tests:[],answer:null};old.beginLair.call(e);checkpoint(e);return true;}
  if(n<2){s.station.reading=n;s.next='station-read';e.status='campaignsource';save(e,true);e.emit('state',e.status);return true;}
  openCard(e,'contradictions','station-resolved');return true;
 }
 p.start=function(...args){if(typeof CUP!=='undefined'&&CUP.attached)delete this.campaign2120;else this.campaign2120=fresh();return old.start.apply(this,args);};
 if(typeof CUP_ENGINE_KEYS!=='undefined'&&!CUP_ENGINE_KEYS.includes('campaign2120'))CUP_ENGINE_KEYS.push('campaign2120');
 cupUnpack=function(snapshot,...args){const e=old.unpack.call(this,snapshot,...args);if(!snapshot.engine.campaign2120)delete e.campaign2120;return e;};
 const saveReview=citadelSave,saveRecord=saveArcadeRecord;
 citadelSave=function(e,...args){if(e?.campaign2120?.practice||ARCADE.engine?.campaign2120?.practice)return;return saveReview.call(this,e,...args);};
 saveArcadeRecord=function(...args){if(ARCADE.engine?.campaign2120?.practice)return;return saveRecord.apply(this,args);};
 p.checkpoint=function(){const x=old.checkpoint.apply(this,arguments);if(active(this)){const s=clone(state(this));s.retry=null;x.campaign2120=s;}return x;};
 finalePersist=function(e){return active(e)?save(e,true):old.finalPersist.apply(this,arguments);};
 p.beginStage=function(...args){const r=old.beginStage.apply(this,args);if(active(this))checkpoint(this);return r;};
 p.beginBoarding=function(...args){if(!active(this))return old.beginBoarding.apply(this,args);const s=state(this);
  if(s.branchActive)return completeBranch(this);
  if(!this.finale&&!this.board){const id=['orbit1','pursuit','swarm','orbit4'][this.stage];if(this.stage===2&&!s.parallaxDone)return summary(this,id,'boss');if(!s.completed.includes(id))return summary(this,id,'boarding');}
  const r=old.beginBoarding.apply(this,args);checkpoint(this);return r;
 };
 p.finishBoarding=function(...args){if(active(this)&&state(this).station)return stationInteract(this);const id=active(this)?mission(this):null,r=old.finishBoarding.apply(this,args);if(r&&active(this)&&id?.startsWith('base'))complete(this,id);return r;};
 p.beginFinale=function(...args){if(active(this)&&!state(this).earlyBoss)return startStation(this);return old.beginFinale.apply(this,args);};
 p.beginFinalLanding=function(...args){if(active(this)&&state(this).earlyBoss)return openCard(this,'parallax','afterboss');return old.beginFinalLanding.apply(this,args);};
 p.beginMRG=function(...args){if(active(this))complete(this,'lair');const r=old.beginMRG.apply(this,args);if(active(this))checkpoint(this);return r;};
 p.beginUpload=function(...args){const r=old.beginUpload.apply(this,args);if(r&&active(this))complete(this,'mrg');return r;};
 p.next=function(...args){if(active(this)&&this.status==='stageclear'&&this.stage===1&&this.upgradeChoice&&!state(this).route){this.status='campaignroute';save(this,true);this.emit('state',this.status);return;}return old.next.apply(this,args);};
 p.beginEscort=function(...args){const r=old.beginEscort.apply(this,args);if(r&&active(this))checkpoint(this);return r;};
 p.finishEscort=function(...args){const r=old.finishEscort.apply(this,args);if(active(this)&&this.status==='escortclear'){const id=this.stage===0?'convoy1':this.stage===1?'route':'convoy3';openCard(this,id,'escortclear');}return r;};
 p.completeEscort=function(...args){if(active(this)&&this.stage===1&&state(this).route==='pursuit'&&this.status==='escortclear')return this.beginStage(2);return old.completeEscort.apply(this,args);};
 p.spawnBoardWave=function(...args){if(active(this)&&state(this).station)return;return old.spawnBoardWave.apply(this,args);};
 p.boardInteract=function(...args){return active(this)&&state(this).station?stationInteract(this):old.boardInteract.apply(this,args);};
 p.answer=function(index){const watch=active(this)&&this.status==='remark'&&!this.board?.answered&&this.stage===0&&this.board?.question===0&&!state(this).echo;const q=watch?citadelRemarkCase(this,0):null,r=old.answer.apply(this,arguments);if(watch&&this.remarkFeedback)state(this).echo={correct:index===q.correct,delivered:false,answer:index,question:q.q,resolution:q.choices[q.correct],chosen:q.choices[index]};return r;};
 function retry(){const e=ARCADE.engine;if(!active(e)||!state(e).retry)return false;const snapshot=state(e).retry,failures=clone(state(e).failures2140||{}),shown=clone(state(e).shownBeasts2140||{}),encounters=clone(state(e).encounters||{}),documentSeen=state(e).documentSeen2140||0;const next=restore(snapshot);state(next).retry=clone(snapshot);state(next).failures2140=failures;state(next).shownBeasts2140=shown;state(next).encounters={...state(next).encounters,...encounters};state(next).documentSeen2140=Math.max(state(next).documentSeen2140||0,documentSeen);state(next).lossTracked2140=false;save(next,true);return true;}
 function skipChapter(){
  const e=ARCADE.engine;if(!active(e)||e.status!=='lost')return false;const s=state(e),id=mission(e),key=id==='route'?id+':'+s.route:id;
  if(s.practice||(s.failures2140?.[key]||0)<3)return false;
  s.skipped2140={...s.skipped2140,[id]:{attempts:s.failures2140[key],route:s.route,at:e.elapsed}};
  s.lossTracked2140=false;s.modal=null;s.card=null;s.next=null;e.crash=null;e.hostile=[];e.bullets=[];e.enemies=[];e.player.hp=100;e.player.invulnerable=3;
  complete(e,id);const field=updates[id][0];s.document[field]='Переход с пропуском: '+title(id)+'. Раздел требует отдельной проверки.';s.changed=field;
  if(['orbit1','pursuit','swarm','orbit4'].includes(id)){
   e.board=null;e.status='campaignsummary';s.next=id==='swarm'&&!s.parallaxDone?'boss':'boarding';
  }else if(id.startsWith('base')){
   if(id==='base4')startStation(e);else{e.status='stageclear';e.phase='debrief';e.upgradeChoice='';}
  }else if(id==='convoy1'||id==='convoy3'||id==='route'){
   s.branchActive=false;e.escort=null;e.board=null;e.beginStage(e.stage+1);
  }else if(id==='parallax'){transition(e,'afterboss');}
  else if(id==='contradictions'){s.station=null;e.finale={phase:'maze',checkpoint:'maze',time:0,tests:[],answer:null};old.beginLair.call(e);}
  else if(id==='lair'){old.beginMRG.call(e);}
  else if(id==='mrg'){old.beginUpload.call(e,false);}
  e.notify('ГЛАВА ПРОПУЩЕНА','Продолжаем путешествие. Пропуск отмечен в карте; очки за победу не начислены.');
  checkpoint(e);save(e,true);refresh();return true;
 }
 citadelRetry=function(...args){return active(ARCADE.engine)?retry():old.retry.apply(this,args);};
 p.retryFinale=function(...args){return active(this)?retry():old.finalRetry.apply(this,args);};
 function practice(e){if(!active(e)||e.status!=='lost'||!state(e).retry)return false;const returnTo=old.pack(e),snapshot=state(e).retry,next=restore(snapshot);state(next).retry=clone(snapshot);state(next).practice={returnTo,seconds:0,contacts:0};if(next.status==='paused')next.resume();if(['briefing','escortbrief'].includes(next.status))next.launch();if(next.status==='finalebrief')next.launchFinale();refresh();return true;}
 function exitPractice(e){const snapshot=state(e)?.practice?.returnTo;if(!snapshot)return false;restore(snapshot);return true;}
 for(const key of ['damage','mrgDamage'])p[key]=function(...args){if(active(this)&&state(this).practice){state(this).practice.contacts++;log(this,'Учебное попадание: щит сохранён.','practice');return false;}const before=key==='mrgDamage'?this.board?.hp:this.player.hp,r=old[key].apply(this,args),after=key==='mrgDamage'?this.board?.hp:this.player.hp;if(active(this)&&Number.isFinite(before)&&after<before)log(this,'Щит '+(key==='mrgDamage'?'персонажа':'корабля')+' −'+Math.round(before-after),'damage');return r;};
 for(const key of ['pulse','boardPulse'])p[key]=function(...args){const before=key==='pulse'?this.player.pulseCooldown:this.board?.pulseCooldown,r=old[key].apply(this,args),after=key==='pulse'?this.player.pulseCooldown:this.board?.pulseCooldown;if(active(this)&&after>before)log(this,'Защитный импульс использован.','pulse');return r;};
 const traits={hammer:'Обходите бронированное тело. Золотой молот светится перед замахом.',tentacle:'Летите между щупальцами или с открытой стороны. Перед ударом отросток отводится назад.',maw:'Держитесь сбоку от челюстей. Раскрытая пасть — опасность, а не ворота.',mantis:'Обходите корпус с открытой стороны. Следите за поднятым серпом.',medusa:'Пролетайте рядом с куполом, оставляя место для движения щупалец.'};
 function encounters(e){const s=state(e),entities=[...(e.pursuit?.warpEntities||[]),...(e.escort?.warp290?.entities||[])];for(const w of entities){if(!traits[w.kind]||s.encounters[w.kind]||!w.pos)continue;const d=V3.sub(w.pos,e.player.pos);if(d[2]>55||d[2]<-360||Math.hypot(d[0],d[1])>220)continue;s.encounters[w.kind]={at:e.elapsed,mission:mission(e)};}}
 p.step=function(dt,input={}){if(!active(this))return old.step.apply(this,arguments);const s=state(this);if(s.modal||this.status.startsWith('campaign'))return;
  const hp=this.board?.hp,transport=(this.escort?.allies||[]).map(x=>({hp:x.hp,dead:x.dead}));const r=old.step.apply(this,arguments);
  if(s.practice){s.practice.seconds+=Math.max(0,Math.min(.04,dt));if(this.board&&hp>this.board.hp){s.practice.contacts++;this.board.hp=100;if(this.status==='lost')this.status='boarding';}for(const a of this.escort?.allies||[]){a.hp=100;a.dead=false;}if(this.status==='lost'){this.player.hp=100;this.status=this.board?'boarding':'playing';}if(s.practice.seconds>=25||['campaigncard','campaignsummary','escortclear','stageclear','won'].includes(this.status)){this.status='campaignpractice';refresh();}return r;}
  if(this.board&&hp>this.board.hp)log(this,'Щит персонажа −'+Math.round(hp-this.board.hp),'damage');
  for(let i=0;i<transport.length;i++){const a=this.escort?.allies?.[i];if(a&&a.hp<transport[i].hp)log(this,a.name+': щит −'+Math.round(transport[i].hp-a.hp),'transport');if(a?.dead&&!transport[i].dead)log(this,'Потерян транспорт: '+a.name,'transport-lost');}
  if(['playing','boarding'].includes(this.status))encounters(this);save(this);return r;
 };
 p.objective=function(...args){if(active(this)&&state(this).station){const n=this.board.completed.length;return{title:n<2?'Найдите запись '+(n+1)+' / 2':n===2?'Согласуйте определение':'Проверьте открывшийся шлюз',detail:['Терминал заказчика: что именно он называет заявкой.','Терминал исполнителя: владелец и состояния работы.','Сопоставьте обе записи. Два решения допустимы, если смысл задан явно.','Определение сохранено в ФТ. Пройдите к выходу.'][n],progress:n+' / 3 · без обязательной зачистки'};}return old.objective.apply(this,args);};
 const labels={goal:'Цель',scope:'Границы',terms:'Термины',links:'Связи',acceptance:'Приёмка'};
 function documentHTML(e){if(globalThis.CITADEL_EXPERIENCE)return CITADEL_EXPERIENCE.documentHTML(e);const s=state(e);return'<section class="campaign-document"><header><span>ЕДИНЫЙ ПАКЕТ ФТ</span><b>Редакция '+s.completed.length+'</b></header><dl>'+Object.entries(labels).map(([k,label])=>'<div class="'+(s.changed===k?'changed':'')+'"><dt>'+label+'</dt><dd>'+esc(s.document[k]||'Ещё предстоит согласовать')+'</dd></div>').join('')+'</dl></section>';}
 const button=(a,text,v='')=>'<button type="button" class="arcade-secondary" data-action="'+a+'" data-value="'+esc(v)+'">'+text+'</button>';
 function shell(title,content){return'<section class="campaign-panel"><p class="arcade-serial">ЦИТАДЕЛЬ · НОВАЯ КАМПАНИЯ</p><h3>'+title+'</h3>'+content+'</section>';}
 function cardHTML(e){const c=state(e).card,q=questions[c.mission],done=c.answer!==null;return shell(title(c.mission)+' · разбор','<p>'+esc(q.q)+'</p><div class="campaign-choices">'+q.choices.map((x,i)=>'<button type="button" data-action="campaign-answer" data-value="'+i+'"'+(done?' disabled':'')+'>'+String.fromCharCode(65+i)+'. '+esc(x)+'</button>').join('')+'</div>'+(done?'<div role="status"><b>'+(c.correct?'Решение обосновано':'Нужно уточнение')+'</b><p>'+esc(q.why)+'</p>'+button('campaign-card-next',c.mission==='contradictions'&&!c.correct?'Исправить решение':'Продолжить →')+'</div>':'<p class="campaign-muted">Бой остановлен. Время на ответ не ограничено.</p>'));}
 const sourceText=[['Заказчик · запрос на обследование','«Заявка» создаётся руководителем обследования. Она описывает цель, территорию и период. Состояния: черновик → согласована → отменена. Одна согласованная заявка может породить несколько назначенных работ.'],['Исполнитель · назначенная работа','«Заявка» назначается конкретному исполнителю. Она содержит участок и срок работы. Состояния: назначена → выполняется → выполнена. Выполненная работа закрывает только своё назначение, а не всё обследование.']];
 function defeat(e){const s=state(e),id=mission(e),events=s.events.filter(x=>x.mission===id).slice(-4);const tip=id==='pursuit'||id==='route'&&s.branchActive?'Верните корабль в канал связи после уклонения: прогресс передачи растёт внутри канала.':id==='orbit1'||id==='orbit4'?'При сближении снарядов используйте защитный импульс, затем продолжайте перехват.':id==='convoy3'||id==='convoy1'||id==='route'?'Сначала перехватите торпеду; «Прикрытие» сохраните для одновременного залпа.':id==='swarm'?'Когда снаряды сблизятся, используйте импульс и смените полосу.':id==='mrg'?'На предупреждение напольной волны ответьте прыжком; стреляйте после приземления.':id==='parallax'?'Во время замаха сместитесь из подсвеченной полосы, затем верните прицел на маяк.':'Отойдите за укрытие и дождитесь восстановления защитного импульса.';return{events:events.map(x=>({...x})),tip};}
 function bestiaryHTML(e){const s=state(e),kind=s.modal?.kind||Object.keys(s.encounters)[0],known=Object.keys(s.encounters),i=known.indexOf(kind);
  return '<section class="campaign-panel beast2150"><header><small>БЕСТИАРИЙ · '+known.length+' / 5</small><h3>'+esc(kind?CITADEL_PURSUIT.warpNames[kind]:'Пока нет встреч')+'</h3></header><div class="campaign-beast-window" aria-label="Объёмная модель существа"></div><div class="beast2150-caption"><p>'+esc(traits[kind]||'Встретьте существо в полёте.')+'</p><nav aria-label="Встреченные существа">'+known.map((k,n)=>'<button data-action="campaign-beast" data-value="'+k+'" aria-label="'+esc(CITADEL_PURSUIT.warpNames[k])+'" aria-pressed="'+(k===kind)+'">'+(n+1)+'</button>').join('')+'</nav>'+button('campaign-modal-close','Продолжить →')+'</div></section>';
 }
 arcadeOverlayHTML=function(...args){const e=ARCADE.engine;if(!active(e))return old.overlay.apply(this,args);const s=state(e);
  if(globalThis.CITADEL_STORY?.status(e).active)return old.overlay.apply(this,args);
  if(s.modal?.type==='document')return shell('Собранный документ',documentHTML(e)+button('campaign-modal-close','Закрыть'));
  if(s.modal?.type==='bestiary')return bestiaryHTML(e);
  if(e.status==='campaigncard')return cardHTML(e)+(state(e).card.mission==='contradictions'?shell('Сопоставьте источники',sourceText.map(([h,t])=>'<article><h4>'+esc(h)+'</h4><p>'+esc(t)+'</p></article>').join('')):'');
  if(e.status==='campaignsummary')return shell('Пакет обновлён',documentHTML(e)+button('campaign-summary-next','Дальше →'));
  if(e.status==='campaignsource'){const [heading,text]=sourceText[s.station.reading];return shell(heading,'<p>'+text+'</p>'+button('campaign-source-next','Запись сохранена →'));}
  if(e.status==='campaignroute')return shell('Как передадим уточнения смежникам?','<p>Оба маршрута дают один обязательный комплект и ведут к рою. Выберите один; второй будет доступен после финала.</p><div class="campaign-choices">'+button('campaign-route','Защитить конвой · доставка под огнём','convoy')+button('campaign-route','Уточнить по связи · погоня за ФЗ','pursuit')+'</div>');
  if(e.status==='escortclear'&&e.stage===1&&s.route==='pursuit')return shell('Уточнения переданы','<p>Три пакета подтверждены по связи. Смежники получили согласованную редакцию.</p>'+documentHTML(e)+button('citadel-escort-continue','К рою уточнений →')+button('campaign-bestiary','Бестиарий встреч'));
  if(e.status==='campaignpractice')return shell('Репетиция завершена','<p>'+ (s.practice.optional?'Дополнительный маршрут завершён.':'Репетиция завершена. Учебных попаданий: '+s.practice.contacts+'.')+' Прогресс основной игры сохранён.</p>'+button('campaign-practice-exit','Вернуться к разбору'));
  let html=old.overlay.apply(this,args);
  if(s.earlyBoss&&e.status==='finalebrief')html=html.replace('ОПЕРАЦИЯ 05 · ПОСЛЕДНИЙ РУБЕЖ','ГЛАВА 08 · ПАРАЛЛАКС').replace('ПРОТОКОЛ<br><span>МРГ</span>','ПАРАЛЛАКС').replace('Четыре редакции пройдены. Доставьте согласованный пакет ФТ на исполнение.','Рой рассеян. Живая мегабаза закрыла путь к палубе интеграций. Отключите четыре маяка, затем разрушьте центральный кристалл.').replace(/<ol class="finale-itinerary">[\s\S]*?<\/ol>/,'');
  if(s.branchActive)html=html.replace('УРОВЕНЬ 04 · ПОГОНЯ','ГЛАВА 06 · УТОЧНЕНИЕ ПО СВЯЗИ').replace('После полной загрузки спокойно сверим решения и вернёмся в Цитадель.','После передачи уточнений идём к рою. Основные карточки первой погони повторять не нужно.');
  if(e.status==='lost'){const d=defeat(e);html=shell('Что произошло','<p>'+esc(e.lossReason||'Щит исчерпан.')+'</p><ol>'+d.events.map(x=>'<li>'+esc(x.text)+'</li>').join('')+'</ol><p><b>Следующая попытка:</b> '+d.tip+'</p>'+button('campaign-retry','Повторить главу')+button('campaign-practice','Безопасная репетиция · 25 с')+button('arcade-menu','В меню'));}
  if(['briefing','escortbrief','finalebrief','stageclear','escortclear','won'].includes(e.status)){html+='<div class="campaign-intermission"><p><b>Единый пакет ФТ · редакция '+s.completed.length+'</b><br>'+esc(s.document[s.changed]||'Результаты глав появятся здесь.')+'</p>'+button('campaign-document','Посмотреть документ')+(s.echo?.delivered&&mission(e)==='route'?'<p class="campaign-echo">'+esc(s.echo.text)+'</p>':'')+button('campaign-bestiary','Бестиарий встреч')+'</div>';}
  if(e.status==='paused')html+=button('campaign-document','Собранный документ')+button('campaign-bestiary','Бестиарий встреч');
  if(s.practice)html+=button('campaign-practice-exit','Завершить репетицию');
  if(e.status==='won'&&s.route)html+=button('campaign-other-route','Попробовать второй маршрут · вне кампании');
  return html.replace(/14 МИССИЙ/g,'15 ГЛАВ').replace(/\/ 23/g,'/ 28');
 };
 updateArcadeOverlay=function(...args){const e=ARCADE.engine,r=old.update.apply(this,args);if(active(e)){const el=document.getElementById('arcade-overlay');el?.classList.toggle('campaign-overlay',!!state(e).modal||e.status.startsWith('campaign'));el?.classList.toggle('campaign-bestiary',state(e).modal?.type==='bestiary');if(state(e).modal&&el)el.hidden=false;}return r;};
 updateArcadeHUD=function(...args){const r=old.hud.apply(this,args),e=ARCADE.engine;if(active(e)||e?.status==='menu'){for(const id of ['citadel-objective-phase','arcade-mission-index']){const el=document.getElementById(id);if(el)el.textContent='ГЛАВА '+(active(e)?number(e):1)+' / 15';}const el=document.getElementById('citadel-objective-title');if(el)el.textContent=title(active(e)?mission(e):'orbit1');if(active(e)&&state(e).earlyBoss){const route=document.getElementById('citadel-route');if(route)route.innerHTML='<div class="finale-route"><span class="done">Рой ✓</span><span class="active">Параллакс</span><span>Палуба интеграции</span></div>';}}return r;};
 function openModal(e,type){if(!active(e)||!['paused','briefing','escortbrief','finalebrief','stageclear','escortclear','won','campaignsummary'].includes(e.status))return false;state(e).modal={type,kind:Object.keys(state(e).encounters)[0]||null};clearArcadeInput();refresh();return true;}
 arcadeAction=function(action,value){const e=ARCADE.engine;
  if(action==='campaign-continue'){const saved=read(value||CITADEL_LEARNING_MODES.preferred);if(saved)restore(saved);return true;}
  if(active(e)){
   if(action==='campaign-answer'){answer(e,Number(value));return true;}
   if(action==='campaign-card-next'){nextCard(e);return true;}
   if(action==='campaign-summary-next'||action==='campaign-source-next'){transition(e,state(e).next);save(e,true);refresh();return true;}
   if(action==='campaign-route'){selectRoute(e,value);return true;}
   if(action==='campaign-document'||action==='campaign-bestiary'){openModal(e,action==='campaign-document'?'document':'bestiary');return true;}
   if(action==='campaign-modal-close'){state(e).modal=null;refresh();return true;}
   if(action==='campaign-beast'){if(state(e).modal&&state(e).encounters[value]){state(e).modal.kind=value;refresh();}return true;}
   if(action==='campaign-retry'){retry();return true;}
   if(action==='campaign-skip'){skipChapter();return true;}
   if(action==='campaign-practice'){practice(e);return true;}
   if(action==='campaign-practice-exit'){exitPractice(e);return true;}
   if(action==='campaign-other-route'&&e.status==='won'){const saved=old.pack(e),route=state(e).route==='convoy'?'pursuit':'convoy';state(e).practice={returnTo:saved,seconds:-1e9,contacts:0,optional:true};e.stage=1;e.finale=null;e.board=null;e.status='campaignroute';state(e).route=null;delete state(e).answers.route;selectRoute(e,route);return true;}
   if(state(e).modal&&['arcade-resume','arcade-pause','citadel-pause','arcade-guidance'].includes(action))return true;
  }
  const r=old.action.call(this,action,value);if(active(ARCADE.engine))save(ARCADE.engine,true);return r;
 };
 // Surface the current local campaign even for professional-mode local games.
 const wrappedOverlay=arcadeOverlayHTML;
 for(const key of ['pause','resume'])p[key]=function(...args){if(active(this)&&state(this).modal)return;return old[key].apply(this,args);};
 function suspend(){const e=ARCADE.engine;if(!active(e))return;e.pause();clearArcadeInput();save(e,true);}
 globalThis.addEventListener?.('pagehide',suspend);
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)suspend();});
 arcadeOverlayHTML=function(...args){let html=wrappedOverlay.apply(this,args);const e=ARCADE.engine;if(e?.status==='menu'){const mode=CITADEL_LEARNING_MODES.preferred,s=read(mode);if(s&&s.engine.status!=='won')html=button('campaign-continue','Продолжить новую кампанию',mode)+html;html=html.replace(/14 МИССИЙ/g,'15 ГЛАВ').replace('Начать игру →','Начать кампанию →').replace('Начать заново','Новая кампания');html+='<p class="campaign-save-note">Новая кампания — 15 глав с облегчённым роем и конвоем. Старые сохранения и облачный турнир продолжают прежний маршрут и баланс.</p>';}return html;};
 spaceScene=function(e,time,...args){if(active(e)&&state(e).modal?.type==='bestiary'&&state(e).modal.kind){time=(globalThis.performance?.now?.()||Date.now())/1000;const kind=state(e).modal.kind,w={schema:280,portal2130:true,kind,scale:2.6,side:1,center:[0,0,0],pos:[0,0,0],phase:time*.55,segments:[],age:1};CITADEL_PURSUIT.poseWarp(e,w,0);const off=w.pos.slice();w.pos=[0,0,0];for(const j of w.segments){j.pos=V3.sub(j.pos,off);j.previous=j.pos.slice();}const items=[];CITADEL_PURSUIT_VIEW.renderWarp(items,{...e,player:{...e.player,pos:[0,0,80]},pursuit:{clock:time}},w,1);return items;}return old.scene.call(this,e,time,...args);};
 spaceCamera=function(e,time,...args){if(active(e)&&state(e).modal?.type==='bestiary'&&state(e).modal.kind){time=(globalThis.performance?.now?.()||Date.now())/1000;const angle=Math.sin(time*.24)*.48,aspect=(ARCADE.canvas?.width||1280)/(ARCADE.canvas?.height||720),wide=(globalThis.innerHeight||800)<450&&aspect>1.4,dist=wide?90:Math.max(155,95/Math.max(.4,aspect)),shift=wide?55:0;return stationLook([Math.sin(angle)*dist+Math.cos(angle)*shift,20,Math.cos(angle)*dist-Math.sin(angle)*shift],[Math.cos(angle)*shift,-8,-Math.sin(angle)*shift],1.1,{near:1,far:800});}return old.camera.call(this,e,time,...args);};
 globalThis.CITADEL_CAMPAIGN=Object.freeze({version:VERSION,ids:ids.slice(),names:names.slice(),active,enable,state,mission,number,title,checkpoint,save,read,questions,answer,nextCard,selectRoute,completeBranch,startStation,stationInteract,documentHTML,defeat,practice,exitPractice,openModal,encounters,complete,skipChapter,
  inspection:e=>active(e)?{mission:mission(e),number:number(e),completed:state(e).completed.slice(),route:state(e).route,cards:Object.keys(state(e).answers),encounters:Object.keys(state(e).encounters),document:{...state(e).document}}:null});
})();
