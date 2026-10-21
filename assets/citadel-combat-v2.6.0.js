/* Citadel 2.6.0 — orbital attack cadence and shared control labels.
 * Motion, mission quotas, enemy HP, score and save schema remain unchanged.
 * Pursuit, convoy, swarm, bases and bosses own their separate combat rules.
 */
(() => {
  'use strict';
  const VERSION='2.6.0';
  if(typeof RequirementArcade!=='function'||globalThis.CITADEL_COMBAT?.version===VERSION)return;
  const proto=RequirementArcade.prototype;
  const orbital=e=>!e.assist&&!e.finale&&e.status==='playing'&&e.phase==='battle'&&![1,2].includes(e.stage);
  const spawn=proto.spawnEnemy,step=proto.enemyStep,shot=proto.hostileShot;
  proto.spawnEnemy=function(...args){
    const before=this.enemies?.length||0,result=spawn.apply(this,args);
    if(orbital(this))for(let i=before;i<this.enemies.length;i++){
      const x=this.enemies[i];x.shot=0;x.warp=0;x.combat260=true;
    }
    return result;
  };
  proto.enemyStep=function(dt){
    if(!orbital(this))return step.call(this,dt);
    // Only weapon clocks are faster. Passing dt*3 to the old integrator would
    // also triple movement, collisions and objective damage, and is incorrect.
    for(const x of this.enemies){
      if(x.dead)continue;
      if(!x.combat260){x.combat260=true;x.shot=0;}
      else x.shot=Math.max(0,x.shot-dt*2);
    }
    if(this.boss&&!this.boss.dead){
      if(!this.boss.combat260){this.boss.combat260=true;this.boss.shot=0;}
      else this.boss.shot=Math.max(0,this.boss.shot-dt*2);
    }
    const result=step.call(this,dt);
    // Blockers formerly only drained a node. They now defend themselves with
    // a real projectile once in range, using the same collision path as fighters.
    for(const x of this.enemies)if(!x.dead&&x.role==='hacker'&&x.warp<=0&&x.shot<=0&&V3.len(V3.sub(x.pos,this.player.pos))<160){
      x.shot=3;this.hostileShot(x);
    }
    return result;
  };
  proto.hostileShot=function(...args){
    const count=this.hostile.length,result=shot.apply(this,args);
    if(orbital(this))for(let i=count;i<this.hostile.length;i++){
      const b=this.hostile[i];if(!b.stationShot)b.vel=V3.scale(b.vel,1.12);
    }
    return result;
  };
  const update=proto.step;
  proto.step=function(...args){if(this.status==='paused')return;return update.apply(this,args);};
  function labels(){
    if(typeof ARCADE==='undefined'||typeof document==='undefined')return;
    const e=ARCADE.engine,grenade=e?.finale?.phase==='mrg';
    for(const el of document.querySelectorAll?.('[data-action="arcade-missile"]')||[]){
      const label=grenade?'Граната · ПКМ / Q':'Ракета · ПКМ / Q';
      el.setAttribute('title',label);el.setAttribute('aria-label',label);
    }
    for(const id of ['arcade-controls','arcade-help','citadel-controls','citadel-control-help']){
      const el=document.getElementById(id);if(el?.textContent?.includes('Q —')&&!el.textContent.includes('ПКМ / Q'))el.textContent=el.textContent.replace(/Q —/g,'ПКМ / Q —');
    }
  }
  if(typeof updateArcadeHUD==='function'){
    const original=updateArcadeHUD;updateArcadeHUD=function(...args){const result=original.apply(this,args);labels();return result;};
  }
  globalThis.CITADEL_COMBAT=Object.freeze({version:VERSION,isTraining:e=>!!e?.assist,cues:e=>!!e?.assist,orbital});
})();
