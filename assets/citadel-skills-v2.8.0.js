/* Citadel 2.8 — a small, campaign-local analyst skill tree.
 * Finite terminal milestones; no score awards and no new cloud schema.
 * Every state edit is copy-on-write because older checkpoints share upgrades.
 * Load after the learning module so both quiz and professional cases earn XP.
 */
(() => {
 'use strict';
 if(globalThis.CITADEL_SKILLS?.version==='2.8.0'||!globalThis.CITADEL_BASE_REWARDS)return;
 const p=RequirementArcade.prototype,old={answer:p.answer,answerFinal:p.answerFinale,remark:p.continueRemark,final:p.continueFinaleCheck,pulse:p.boardPulse,hit:p.boardHit,
  overlay:arcadeOverlayHTML,action:arcadeAction,objective:p.objective};
 const definitions=Object.freeze({
  observation:{title:'Наблюдательность',icon:'◉',color:'#90debd',effect:n=>'Подбор с расстояния +'+(n*.65).toFixed(2).replace('.',',')+' м. Урон по оглушённым или остывающим роботам +'+n*12+'%.'},
  priority:{title:'Приоритизация',icon:'ϟ',color:'#f1ca88',effect:n=>'Перезарядка импульса на базах −'+n*8+'%. Оглушение от импульса +'+(n*.25).toFixed(2).replace('.',',')+' с.'},
  systems:{title:'Системное мышление',icon:'◇',color:'#9dcdf4',effect:n=>'Урон от снарядов, лазеров, робопсов и опасностей базы −'+n*7+'%.'}
 });
 const empty=()=>({schema:1,earned:[],points:0,ranks:{observation:0,priority:0,systems:0}});
 const state=e=>e?.upgrades?.analyst280?.schema===1?e.upgrades.analyst280:empty();
 const rank=(e,key)=>Math.min(3,Math.max(0,Number(state(e).ranks?.[key])||0));
 const inside=e=>!!e?.board?.cells&&!e.crash&&(!e.finale||e.finale.phase==='maze');
 const tier=e=>e?.finale?.phase==='maze'?4:Math.max(0,Math.min(3,e.stage));
 function persist(e){if(typeof ARCADE==='undefined'||ARCADE.engine!==e)return;
  if(globalThis.CITADEL_LEARNING_MODES?.usesQuiz(e))CITADEL_LEARNING_MODES.saveLocal(e,true);
  else if(typeof citadelSave==='function')citadelSave();
 }
 function reward(e,b,before){
  if(!b||b.completed.length<=before||![1,3].includes(b.completed.length))return false;
  const s=state(e),id='base-'+tier(e)+'-terminal-'+b.completed.length;
  if(s.earned.includes(id)||s.earned.length>=9)return false;
  e.upgrades.analyst280={...s,earned:[...s.earned,id],points:s.points+1,ranks:{...s.ranks}};
  e.notify('ОЧКО НАВЫКА +1','Первый и третий терминалы развивают аналитика. Пауза → Навыки: выберите улучшение.');
  persist(e);return true;
 }
 // Professional cards append completed in answer(); quiz cards append it in
 // continue(). Watching both transitions covers either policy exactly once.
 for(const [name,fn]of [['answer',old.answer],['answerFinale',old.answerFinal],['continueRemark',old.remark],['continueFinaleCheck',old.final]])p[name]=function(){
  const b=this.board,before=b?.completed?.length||0,result=fn.apply(this,arguments);reward(this,b,before);return result;
 };
 function choose(e,key){
  if(!e||!['paused','stageclear'].includes(e.status)||!definitions[key])return false;
  const s=state(e),n=rank(e,key);if(s.points<1||n>=3)return false;
  e.upgrades.analyst280={...s,earned:s.earned.slice(),points:s.points-1,ranks:{...s.ranks,[key]:n+1}};
  e.notify(definitions[key].title.toUpperCase()+' · '+(n+1)+'/3',definitions[key].effect(n+1));persist(e);return true;
 }
 p.boardHit=function(x,amount,source,ignoreShield=false){
  if(inside(this)&&x.missions270&&(x.stun>0||x.missions270.phase==='recover'))amount*=1+rank(this,'observation')*.12;
  return old.hit.call(this,x,amount,source,ignoreShield);
 };
 p.boardPulse=function(){const prior=inside(this)?new Map(this.board.enemies.map(x=>[x.id,x.stun||0])):null;
  const result=old.pulse.apply(this,arguments);if(result&&inside(this)){
  const n=rank(this,'priority');this.board.pulseCooldown*=1-n*.08;
  if(n)for(const x of this.board.enemies)if(!x.dead&&x.stun>(prior?.get(x.id)||0))x.stun+=n*.25;
 }return result;};
 function panel(e){const s=state(e),total=Object.values(s.ranks).reduce((a,b)=>a+b,0);
  return '<section class="analyst-skills" aria-label="Навыки аналитика"><header><span>АНАЛИТИК · '+total+'/9</span><b>Очков: '+s.points+'</b></header><p>Первый и третий терминалы базы дают по очку. Выберите специализацию; навыки действуют на базах.</p><div class="analyst-skills-grid">'+Object.entries(definitions).map(([id,d])=>{
   const n=rank(e,id),next=Math.min(3,n+1);return '<button type="button" data-action="analyst-skill" data-value="'+id+'" style="--skill-color:'+d.color+'"'+(s.points<1||n>=3?' disabled':'')+'><span class="analyst-skill-title"><i>'+d.icon+'</i><b>'+d.title+'</b><strong>'+n+'/3</strong></span><span class="analyst-skill-ranks" aria-hidden="true">'+[1,2,3].map(r=>'<i class="'+(r<=n?'earned':'')+'"></i>').join('')+'</span><span>'+d.effect(next)+'</span><em>'+(n===3?'Развито полностью':s.points>0?'Развить · 1 очко':'Следующее улучшение')+'</em></button>';
  }).join('')+'</div></section>';
 }
 arcadeOverlayHTML=function(){const html=old.overlay.apply(this,arguments),e=ARCADE.engine;
  return e&&['paused','stageclear'].includes(e.status)&&!(typeof CUP!=='undefined'&&CUP.panel)&&!ARCADE.story?'<div class="analyst-pause-stack">'+html+panel(e)+'</div>':html;
 };
 arcadeAction=function(action,value){if(action!=='analyst-skill')return old.action.apply(this,arguments);
  if(choose(ARCADE.engine,value)){ARCADE.overlayToken='';updateArcadeHUD();updateArcadeOverlay();}return true;
 };
 p.objective=function(){const result=old.objective.apply(this,arguments),s=state(this);
  return inside(this)&&s.points?{...result,detail:result.detail+' Навыки: '+s.points+' очк. — откройте паузу.'}:result;
 };
 globalThis.CITADEL_SKILLS=Object.freeze({version:'2.8.0',definitions,choose,rank,
  status:e=>JSON.parse(JSON.stringify(state(e))),pickupReach:e=>rank(e,'observation')*.65,
  protection:e=>1-rank(e,'systems')*.07,panel});
})();
