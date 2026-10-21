/* Citadel 2.6.0 — optional side-room equipment and active combat crews.
 * The authored map, finite crews, review cards and score awards stay intact.
 * Equipment lives under the existing upgrades save field; board-local pickups
 * are plain serializable data. No listeners, timers or additional frame owner.
 */
(() => {
  'use strict';
  const VERSION = '2.6.0';
  if (globalThis.CITADEL_BASE_REWARDS?.version === VERSION || !globalThis.CITADEL_BASES) return;
  const p = RequirementArcade.prototype, old = { step:p.stepBoard, enemy:p.enemyBoardStep,
    pulse:p.boardPulse, begin:p.beginBoarding, lair:p.beginLair, objective:p.objective, say:p.say,
    interior:citadelInterior, hud:drawBoardHUD, mobile:drawMobileGameHUD, final:drawFinaleHUD,
    unpack:typeof cupUnpack === 'function' ? cupUnpack : null };
  const clamp = (x,a=0,z=1) => Math.max(a,Math.min(z,x)), distance = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
  const active = e => !!e?.board?.cells && !e.crash && (!e.finale || e.finale.phase === 'maze');
  const modern = e => active(e) && CITADEL_BASES.modern(e.board);
  const tier = e => e.finale?.phase === 'maze' ? 4 : clamp(e.stage,0,3);
  const definitions = Object.freeze({
    capacitor:{title:'ИМПУЛЬСНЫЙ КОНДЕНСАТОР',short:'КОНДЕНСАТОР',color:'#75d9de'},
    triad:{title:'ДЕТАЛЬ «ТРИАДЫ»',short:'ДЕТАЛЬ ОРУЖИЯ',color:'#eec586'},
    armor:{title:'РЕАКТИВНАЯ БРОНЯ',short:'БРОНЕПЛАСТИНА',color:'#a5c9b5'}
  });
  function equipment(e) {
    let k = e.upgrades.baseKit260;
    if (!k || k.schema !== 1) k = e.upgrades.baseKit260 = {schema:1,collected:[],capacitor:0,armor:0,parts:0,achievements:[]};
    return k;
  }
  function ensure(e) {
    if (!active(e)) return null;
    const b=e.board,k=equipment(e);
    if (b.armory260?.schema===1) return b.armory260;
    const pickups=[];
    // Only use side rooms that really exist in the stored layout. A 1.x save
    // without authored annexes is deliberately left geometrically unchanged.
    for (const room of b.definition.rooms || []) {
      if (!Array.isArray(room.reserve) || !Number.isInteger(room.id)) continue;
      const type=['capacitor','triad','armor'][room.id],id='base-'+tier(e)+'-'+room.id;
      if (!type) continue;
      const office=[room.center[0]-28,0,room.center[2]+8];
      const pos=room.id===1 && stationWalkable(b,office,.8,true) ? office : room.reserve.slice();
      if (!stationWalkable(b,pos,.8,true) || !stationPath(b,room.posts?.[0]||b.pos,pos).length) continue;
      pickups.push({id,type,room:room.id,pos,taken:k.collected.includes(id)});
    }
    b.armory260={schema:1,pickups,shots:0,notice:null,events:[],firstContact:null,shotsFired:0};
    return b.armory260;
  }
  function log(b,event) {
    const s=b.armory260;if(!s)return;s.events.push({at:+b.time.toFixed(3),...event});if(s.events.length>32)s.events.shift();
  }
  function take(e,pickup) {
    const b=e.board,current=equipment(e),s=ensure(e);
    if (pickup.taken || current.collected.includes(pickup.id)) {pickup.taken=true;return false;}
    // Legacy checkpoints shallow-copy upgrades. Copy-on-write prevents a
    // later discovery from changing an earlier in-memory checkpoint.
    const k=e.upgrades.baseKit260={...current,collected:current.collected.slice(),achievements:current.achievements.slice()};
    pickup.taken=true;k.collected.push(pickup.id);
    let detail;
    if(pickup.type==='capacitor') {
      k.capacitor=Math.min(5,k.capacitor+1);b.energy=Math.min(100,b.energy+45);b.pulseCooldown=Math.max(0,b.pulseCooldown-3);
      detail='Импульс перезаряжается на '+k.capacitor*8+'% быстрее. Энергия +45; текущая перезарядка −3 с.';
    } else if(pickup.type==='armor') {
      k.armor=Math.min(5,k.armor+1);b.hp=Math.min(100,b.hp+25);
      detail='Урон вражеских снарядов −'+k.armor*6+'%. Щит восстановлен на 25.';
    } else {
      k.parts=Math.min(5,k.parts+1);
      detail=k.parts<3 ? 'Сборка '+k.parts+'/3. Темп огня +'+k.parts*4+'%. Третья деталь добавит тройной залп.' :
        '«Триада» собрана: каждый '+(8-k.parts)+'-й выстрел — тройной залп. Обычная кнопка огня.';
      if(k.parts===3 && !k.achievements.includes('triad'))k.achievements.push('triad');
    }
    if(s.pickups.length===3 && s.pickups.every(x=>x.taken)) {
      const badge='supply-'+tier(e);if(!k.achievements.includes(badge)){k.achievements.push(badge);detail+=' Знак «Снабженец '+(tier(e)+1)+'».';}
    }
    s.notice={title:definitions[pickup.type].title,detail,until:b.time+8};
    log(b,{kind:'equipment',id:pickup.id,type:pickup.type});e.notify(definitions[pickup.type].title,detail);
    return true;
  }
  function collect(e) {
    const b=e.board,s=ensure(e);if(!s || e.status!=='boarding')return;
    for(const x of s.pickups)if(!x.taken && x.room<=b.completed.length && distance(x.pos,b.pos)<2.15 && e.boardLOS(b.pos,x.pos,.15))take(e,x);
  }
  for(const [key,fn] of [['beginBoarding',old.begin],['beginLair',old.lair]])p[key]=function(){const result=fn.apply(this,arguments);ensure(this);return result;};
  if(old.unpack)cupUnpack=function(){const e=old.unpack.apply(this,arguments);ensure(e);return e;};

  // This one scoped adapter removes only advance warning comics from the old
  // base closures. It is restored in finally; emit identity outside a step is
  // unchanged, and no emitter/listener chain is accumulated on room changes.
  const emitters=new WeakMap();
  function stepEmitter(e,original) {
    let q=emitters.get(e);if(!q || q.original!==original){q={original,fn:function(kind,value){
      if(!e.assist && kind==='comic' && value?.kind==='warning')return;
      if(kind==='shot' && e.status==='boarding') {
        const b=e.board,s=b.armory260,k=equipment(e),shot=b.bullets.at(-1);
        if(s && shot && !shot.baseKitPellet) {
          s.shots++;if(k.parts>0)b.cooldown/=1+k.parts*.04;
          if(k.parts>=3 && s.shots%(8-k.parts)===0) {
            for(const sign of [-1,1]) {
              const a=.065*sign,c=Math.cos(a),z=Math.sin(a),v=shot.vel;
              b.bullets.push({...shot,pos:shot.pos.slice(),origin:shot.origin.slice(),vel:[v[0]*c+v[2]*z,v[1],v[2]*c-v[0]*z],damage:shot.damage*.52,baseKitPellet:true});
            }
            log(b,{kind:'triad-volley',shot:s.shots});
          }
        }
      }
      return original.apply(this,arguments);
    }};emitters.set(e,q);}return q.fn;
  }
  p.say=function(text){
    if(active(this) && !this.assist && typeof text==='string' && /^(Охрана заметила тебя\. Резерв|Резерв выходит|Ракета —|Рывок —)/i.test(text))return;
    return old.say.apply(this,arguments);
  };
  p.enemyBoardStep=function(x,dt) {
    if(!active(this) || x.dead)return old.enemy.apply(this,arguments);
    const b=this.board,k=equipment(this),s=ensure(this),room=x.duty?.room ?? x.decksRoom ?? x.zone;
    const combat=!this.assist,engaged=room<=b.completed.length && distance(x.pos,b.pos)<29 && this.boardLOS(x.pos,b.pos,.12);
    const pressure=2.4+tier(this)*.15;
    if(combat && engaged && !x.base260Engaged && !(x.stun>0)) {
      x.base260Engaged=true;x.alert=true;x.shot=0;x.lastSeen=b.pos.slice();x.memory=7;
      if(x.duty)x.duty.detection=1;
      if(x.duty?.reserve && !x.duty.reserveReleased){x.duty.reserveReleased=true;x.duty.mode='hunt';CITADEL_BASES.state(this).reserveDepartures++;}
      if(s.firstContact===null)s.firstContact=b.time;
      log(b,{kind:'contact',enemy:x.id,room});
    }
    if(combat) {
      if(x.base260Speed===undefined){x.base260Speed=x.speed;x.speed*=1.12+tier(this)*.025;}
      if(x.shot>0)x.shot=Math.max(0,x.shot-dt*(pressure-1));
      // The sniper fires a real projectile immediately on sight. Rocket
      // travel and the physical melee motion remain avoidable by movement.
      if(x.charge>0)x.charge=Math.min(x.charge,dt);
      if(x.decksAttack?.phase==='windup')x.decksAttack.windup=x.decksAttack.kind==='rocket'?0:.34;
    }
    const shotStart=b.hostile.length,rocketStart=b.decks?.rockets.length||0;
    const result=old.enemy.call(this,x,dt);
    if(combat && x.charge>dt)x.charge=dt;
    if(combat && x.decksAttack) {
      if(x.decksAttack.phase==='windup')x.decksAttack.windup=x.decksAttack.kind==='rocket'?0:.34;
      x.decksAttack.recovery=Math.min(x.decksAttack.recovery,.58);
    }
    const protection=1-k.armor*.06;
    for(let i=shotStart;i<b.hostile.length;i++) {
      const shot=b.hostile[i];shot.damage*=protection;shot.baseKitScaled=true;s.shotsFired++;
    }
    for(let i=rocketStart;i<(b.decks?.rockets.length||0);i++) {
      b.decks.rockets[i].damage*=protection;b.decks.rockets[i].baseKitScaled=true;s.shotsFired++;
    }
    return result;
  };
  p.boardPulse=function(){const result=old.pulse.apply(this,arguments);if(result && active(this))this.board.pulseCooldown*=1-equipment(this).capacitor*.08;return result;};
  p.stepBoard=function(dt,input) {
    if(!active(this) || this.status!=='boarding')return old.step.apply(this,arguments);
    const b=this.board,emit=this.emit;ensure(this);
    // Old snapshots can already contain projectiles. Only newly generated
    // shots receive the perk; saved shots keep exactly their saved damage.
    this.emit=stepEmitter(this,emit);
    let result;try{result=old.step.call(this,dt,input);}finally{this.emit=emit;}
    if(this.board!==b || this.status!=='boarding')return result;
    collect(this);return result;
  };
  p.objective=function(){
    const result=old.objective.apply(this,arguments);if(!active(this) || !['boarding','paused'].includes(this.status))return result;
    const s=this.board.armory260;if(!s || !s.pickups.length)return result;
    const taken=s.pickups.filter(x=>x.taken).length;
    return {...result,progress:result.progress+' · ТАЙНИКИ '+taken+'/'+s.pickups.length,
      detail:s.notice?.until>this.board.time ? s.notice.title+': '+s.notice.detail : result.detail+' В боковых отсеках — оборудование; заберите его при подходе.'};
  };

  function add(items,mesh,pos,size,color,feature,em=0,basis=SPACE_IDENTITY,alpha=1) {
    const it=citadelItem(mesh,pos,size,color,em,basis,alpha);it.baseFeature=feature;items.push(it);return it;
  }
  function ring(items,pos,r,color,alpha=.8,feature='objective-ring') {
    for(let i=0;i<20;i++) {
      const a=i/20*Math.PI*2,z=(i+.72)/20*Math.PI*2;
      const from=V3.add(pos,[Math.cos(a)*r,.065,Math.sin(a)*r]),to=V3.add(pos,[Math.cos(z)*r,.065,Math.sin(z)*r]),d=V3.sub(to,from);
      add(items,'box',V3.lerp(from,to,.5),[.035,.035,V3.len(d)/2],color,feature,.6,spaceBasisDir(d),alpha);
    }
  }
  function station(items,x,time) {
    const pos=x.pos,c=definitions[x.type].color,feature='supply-'+x.type;
    const put=(mesh,off,size,color,em=0,basis=SPACE_IDENTITY)=>add(items,mesh,V3.add(pos,off),size,color,feature,em,basis);
    put('armor',[0,.2,0],[1.12,.2,.83],'#4c6266');put('box',[0,.47,0],[.82,.12,.64],'#b2c1b8');
    for(const side of [-1,1]) {put('box',[side*.91,.25,0],[.07,.26,.77],'#243b46');put('box',[side*.92,.57,0],[.055,.035,.6],x.taken?'#577268':c,.55);}
    if(x.taken){put('box',[0,.62,0],[.65,.055,.45],'#4d6668');return;}
    const lift=.075*Math.sin(time*2+x.room),y=1.2+lift;
    if(x.type==='capacitor') {
      for(const q of [-1,0,1]) {put('armor',[q*.38,y,0],[.135,.47,.2],'#839e9d');put('box',[q*.38,y,.21],[.055,.32,.025],c,.8);
        for(const sign of [-1,1])put('box',[q*.38,y+sign*.51,0],[.17,.055,.23],'#e1cf9c');}
    } else if(x.type==='triad') {
      put('armor',[0,y,.12],[.58,.2,.23],'#697d7f');put('box',[-.4,y-.25,.12],[.12,.22,.13],'#2c414b');
      for(const q of [-1,0,1]) {put('armor',[q*.25,y,-.4],[.095,.11,.47],'#c2b89c');put('box',[q*.25,y,-.87],[.06,.07,.045],c,.9);}
      put('box',[0,y+.24,.12],[.24,.055,.075],c,.35);
    } else {
      for(const side of [-1,1])put('armor',[side*.32,y,0],[.31,.5,.16],'#98a99d');
      put('armor',[0,y+.13,.2],[.2,.34,.08],'#d2d5ba');put('box',[0,y+.12,.3],[.04,.2,.025],c,.8);
      for(const side of [-1,1])put('box',[side*.33,y-.27,.19],[.22,.035,.025],'#384e56');
    }
    ring(items,pos,1.4,c,.55,'supply-marker');
  }
  citadelInterior=function(e) {
    let items=old.interior.apply(this,arguments);if(!active(e))return items;
    const b=e.board;
    if(!e.assist && items.basesView) {
      // The 2.0 renderer shares its line primitive for targeting and feedback.
      // Remove targeting, then restore objective / actual impact feedback.
      const viewFlag=items.basesView;items=items.filter(x=>x.baseFeature!=='warning-line');items.basesView=viewFlag;
      const gate=CITADEL_DECK_COMBAT.clearance(e),terminal=b.terminals[b.completed.length];
      if(terminal)ring(items,terminal,2.2,gate.ready?'#9bdeb7':'#d9bd82');
      if(b.completed.length===3)ring(items,b.exit,2.5,'#8fdfb8');
      if(b.pulseWave>0)ring(items,b.pos,(1-b.pulseWave)*11+.5,'#95dfe0',b.pulseWave,'pulse-feedback');
      for(const blast of b.decks?.blasts||[])ring(items,blast.pos,blast.radius*(1-blast.life/blast.max),'#f8c583',blast.life/blast.max,'blast-feedback');
    }
    for(const x of b.armory260?.pickups||[])if(distance(x.pos,b.camera||b.pos)<36)station(items,x,b.time);
    return items;
  };
  function labels(c,e,cam,w,h) {
    if(!active(e) || e.status!=='boarding')return;
    const width=ARCADE.canvas?.getBoundingClientRect?.().width||w,scale=w/width,height=h/scale;
    c.save();c.scale(scale,scale);c.font='600 '+(width<600?10:11)+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineWidth=3;c.strokeStyle='#152b35';
    for(const x of e.board.armory260?.pickups||[]) {
      if(x.taken || distance(x.pos,e.board.pos)>20)continue;
      const a=spaceProject(V3.add(x.pos,[0,2.75,0]),cam,width,height);
      if(a.z<=0 || a.x<70 || a.x>width-70 || a.y<90 || a.y>height-95)continue;
      c.fillStyle=definitions[x.type].color;c.strokeText(definitions[x.type].short,a.x,a.y);c.fillText(definitions[x.type].short,a.x,a.y);
    }
    c.restore();
  }
  for(const [name,fn] of [['hud',old.hud],['mobile',old.mobile],['final',old.final]]) {
    const wrapped=function(c,e,cam,w,h) {
      const fill=c.fillText,stroke=c.strokeText,quiet=active(e)&&!e.assist;
      const warning=text=>/^(РАКЕТА!|РЫВОК!|ПРЫЖОК!|РЕЗЕРВ · ШЛЮЗ|ПРИЦЕЛЬНЫЙ ВЫСТРЕЛ|ЗАРЯЖАЕТ ВЫСТРЕЛ|НАВОДИТ РАКЕТУ|ГОТОВИТ ПРЫЖОК|ГОТОВИТ РЫВОК)$/.test(text);
      if(quiet){c.fillText=function(text){if(!warning(text))return fill.apply(this,arguments);};c.strokeText=function(text){if(!warning(text))return stroke.apply(this,arguments);};}
      let result;try{result=fn.apply(this,arguments);}finally{if(quiet){c.fillText=fill;c.strokeText=stroke;}}
      labels(c,e,cam,w,h);return result;
    };
    if(name==='hud')drawBoardHUD=wrapped;else if(name==='mobile')drawMobileGameHUD=wrapped;else drawFinaleHUD=wrapped;
  }
  globalThis.CITADEL_BASE_REWARDS=Object.freeze({version:VERSION,definitions,
    status(e){const s=e?.board?.armory260,k=e?.upgrades?.baseKit260;return {active:active(e),modern:modern(e),
      equipment:k?JSON.parse(JSON.stringify(k)):null,pickups:(s?.pickups||[]).map(x=>({...x,pos:x.pos.slice()})),
      pressure:e?.assist?1:2.4+tier(e)*.15,shots:s?.shotsFired||0,events:(s?.events||[]).map(x=>({...x}))};}});
})();
