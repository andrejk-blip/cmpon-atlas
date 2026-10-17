/* «Цитадель ЦСИИ» · arena view 1.7.0
 * Uses the actual platforms and soldiers owned by citadel-mrg-v1.7.0.js.
 * The chamber and player retain the 1.3.5 art; the living MRG grows curved limbs.
 * Uses the core meshes and projection; no images, timers or independent motion.
 * Load after the core and gameplay module; also supports the isolated 1.2.1 lab.
 */
(function () {
  'use strict';
  const VERSION = '1.7.0';
  if (globalThis.CITADEL_MRG_VIEW?.version === VERSION ||
      typeof finaleMRGScene !== 'function' || typeof drawFinaleHUD !== 'function' ||
      typeof stationAgent !== 'function' || typeof citadelItem !== 'function') return;
  const originalScene = finaleMRGScene, originalHUD = drawFinaleHUD, originalCPU = spaceDrawCPU;
  const fallbackAttacks = [
    {title:'ВОЛНА — ПРЫГАЙТЕ',color:'#ffb572'},
    {title:'ВЕЕР — ДВИГАЙТЕСЬ',color:'#cbabff'},
    {title:'ЛУЧ — СМЕНИТЕ ВЫСОТУ',color:'#ff8eaf'}
  ];
  const attack = index => globalThis.CITADEL_MRG?.attacks?.[index] || fallbackAttacks[index] || fallbackAttacks[0];
  const aliveSoldiers = e => (e.board?.enemies || []).filter(enemy => !enemy.dead && enemy.hp > 0);
  const pendingSoldiers = e => Math.max(0,Number(e.finale?.pendingSoldiers)||0);
  const arenaDefeated = e => e.finale.defeatTime>0||((e.finale.mrg?.hp||0)<=0&&aliveSoldiers(e).length===0&&pendingSoldiers(e)===0);
  const roleColor = role => ({jumper:'#91eddf',knife:'#ffd188',rocketeer:'#ff9c88'})[role]||'#ffad9c';
  function currentArena(e) {
    // A restored older checkpoint has no arena marker until its first step.
    // This is the gameplay module's one canonical migration, not view state.
    if (e?.finale?.phase === 'mrg' && e.finale.arenaVersion !== VERSION) globalThis.CITADEL_MRG?.status(e);
    return e?.finale?.arenaVersion === VERSION;
  }
  function tag(items, from, feature, detail) {
    for (let i=from; i<items.length; i++) Object.assign(items[i], {mrgFeature:feature}, detail || {});
  }
  function drawPlatforms(items,e) {
    const f=e.finale;
    for(const p of f.arenaPlatforms||[]) {
      if(p.id==='floor'||![p.lo,p.hi,p.y].every(Number.isFinite)||p.hi<=p.lo)continue;
      const center=(p.lo+p.hi)/2,half=(p.hi-p.lo)/2;
      const color=p.moving?['#8bdcff','#ffd292','#d7b4ff'][f.waveIndex]||'#8bdcff':'#8cf0d5';
      // Clean slabs only: no arrows, pistons, supports or independent motion.
      // y is the standing height, so the actual visible top is exactly y-1.
      const slab=citadelItem('armor',[center,p.y-1.45,0],[half,.45,3],'#596e7b');
      Object.assign(slab,{mrgFeature:'platform',mrgPlatformId:p.id,mrgSurfaceY:p.y-1});
      items.push(slab);
      const edge=citadelItem('box',[center,p.y-1.03,2.94],[half,.03,.08],color,.85);
      Object.assign(edge,{mrgFeature:'platform-edge',mrgPlatformId:p.id});items.push(edge);
    }
  }
  // The brighter 1.3.5 player model is local to this arena, including in old labs.
  function playerModel(items,yaw,time,hit,moving) {
    const basis=stationYaw(yaw),m=spaceModel([0,0,0],[1,1,1],basis);
    const color=hit?'#fff4df':'#ecf6ed',dark='#54758a',walk=Math.sin(time*11)*(moving?.23:.04);
    const part=(mesh,off,size,col,em=0)=>items.push(citadelItem(mesh,spacePoint(m,off),size,col,em,basis));
    part('armor',[0,1.45,0],[.58,.65,.37],dark);
    part('armor',[0,1.55,.3],[.43,.38,.12],color,.45);
    part('sphere',[0,2.45,0],[.37,.42,.36],'#f1f8ef',.28);
    part('box',[0,2.5,.34],[.3,.11,.04],color,1);
    for(const side of [-1,1]) {
      part('armor',[side*.32,.48,walk*side],[.21,.5,.23],dark);
      part('armor',[side*.72,1.5,.08],[.19,.42,.23],color);
    }
    part('armor',[.62,1.45,.8],[.12,.14,.75],dark);
    part('box',[.62,1.45,1.6],[.10,.1,.12],'#81f7ff',1);
  }
  function placeActor(items,actor,origin,scale=1.5,squash=1,lean=0,air=false,facing=1) {
    for(const item of actor) {
      const local=item.pos.slice();
      if(air&&local[1]<1){local[1]+=.25;local[0]+=.25*facing;for(let k=4;k<8;k++)item.model[k]*=.7;}
      for(let k=0;k<12;k++)item.model[k]*=scale;
      for(const k of [0,4,8]) {
        const x=item.model[k],y=item.model[k+1]*squash;
        item.model[k]=x*Math.cos(lean)-y*Math.sin(lean);
        item.model[k+1]=x*Math.sin(lean)+y*Math.cos(lean);
      }
      const x=local[0]*scale,y=local[1]*scale*squash-1.8;
      const pos=[origin[0]+x*Math.cos(lean)-y*Math.sin(lean),origin[1]-1+1.8+x*Math.sin(lean)+y*Math.cos(lean),origin[2]+local[2]*scale];
      item.pos=pos;item.model[12]=pos[0];item.model[13]=pos[1];item.model[14]=pos[2];items.push(item);
    }
  }
  function arenaActor(items,e,time,fx) {
    const b=e.board,actor=[],air=!b.grounded,facing=b.facing===-1?-1:1;
    const landing=fx?arcadeClamp((b.landFX||0)/.28,0,1):0,lean=fx?(air?-.09:.03)*arcadeClamp((b.vx||0)/10,-1,1):0;
    playerModel(actor,facing*Math.PI/2,fx?time:0,e.flash>.1,!air&&Math.abs(b.pos[0]-(b.previous?.[0]??b.pos[0]))>.01);
    actor.splice(8,2);
    const from=items.length;
    placeActor(items,actor,[b.pos[0],b.pos[1],0],1.5,1-landing*.12,lean,air,facing);
    tag(items,from,'player');
    const add=(...x)=>items.push(citadelItem(...x));
    const aim=Array.isArray(b.aimDir)&&b.aimDir.every(Number.isFinite)?V3.norm(b.aimDir):[facing,0,0];
    const hand=V3.add(b.pos,[-aim[0]*.45,.6-aim[1]*.45,0]),gun=V3.add(b.pos,[aim[0]*.05,.6+aim[1]*.05,0]),gunBasis=spaceBasisDir(aim);
    add('armor',gun,[.17,.19,.75],'#59788a',.05,gunBasis);
    add('box',V3.add(b.pos,[aim[0]*.8,.6+aim[1]*.8,0]),[.12,.12,.12],'#8cf7ed',1,gunBasis);
    finaleLink(items,V3.add(b.pos,[facing*.45,1.6,-.65]),hand,.14,'#e0eee5');
    if(fx&&air&&b.vy>0)for(const z of [-.4,.4])add('octa',[b.pos[0]-.3*facing,b.pos[1]-.8,z],[.18,.6,.18],'#93ffe1',1);
    for(const [timer,origin,color]of [[b.jumpFX,b.jumpAt,'#8be9ff'],[b.landFX,b.landAt,'#a4ffdb']])if(fx&&timer>0&&origin){const u=1-timer/.28;add('lightRing',V3.add(origin,[0,.06,0]),[.7+u*2.7,.7+u*2.7,.3],color,1,flightBasis(0,Math.PI/2),(1-u)*.6);}
    const pack=[b.pos[0]-.95*facing,b.pos[1]+1,.65];
    add('armor',pack,[.45,.35,.25],'#dfdfcb');add('box',V3.add(pack,[0,0,.27]),[.35,.25,.02],'#7ff2d7',1);
    return pack;
  }
  function beardModel(actor,yaw) {
    const basis=stationYaw(yaw),m=spaceModel([0,0,0],[1,1,1],basis),from=actor.length;
    const part=(mesh,off,size,color)=>actor.push(citadelItem(mesh,spacePoint(m,off),size,color,.12,basis));
    part('sphere',[0,2.32,.35],[.34,.25,.24],'#d9aa82');
    // A broad cheek line and tapered lower beard remain visible in side view.
    part('armor',[0,2.15,.46],[.43,.22,.26],'#88582f');
    part('octa',[0,1.91,.52],[.44,.53,.28],'#754326');
    for(const side of [-1,1])part('armor',[side*.27,2.17,.34],[.16,.28,.23],'#a16d3d');
    part('box',[0,2.29,.63],[.29,.075,.065],'#57321f');
    for(let i=from;i<actor.length;i++)actor[i].mrgBeard=true;
  }
  function soldierModel(actor,enemy,time,fx) {
    const role=enemy.role||'jumper',kind={jumper:'scout',knife:'hunter',rocketeer:'shield'}[role]||'scout';
    const facing=enemy.facing===-1?-1:1,yaw=facing*Math.PI/2,basis=stationYaw(yaw),m=spaceModel([0,0,0],[1,1,1],basis);
    const moving=Math.abs(enemy.pos[0]-(enemy.previous?.[0]??enemy.pos[0]))>.006;
    stationAgent(actor,[0,0,0],yaw,fx?time:0,kind,enemy.hit>0,{moving,stun:true});
    const base=spaceColor(CITADEL_DRONES[kind].color),accent=roleColor(role),armor=enemy.hit>0?'#fff4df':enemy.color||'#d9908f';
    if(!(enemy.hit>0))for(const item of actor)if(item.color.every((v,i)=>Math.abs(v-base[i])<.0001))item.color=spaceColor(armor);
    const part=(mesh,off,size,color,em=0)=>actor.push(citadelItem(mesh,spacePoint(m,off),size,color,em,basis));
    if(role==='jumper') {
      // A light runner, knee guards and twin jump tanks create a slim silhouette.
      for(const side of [-1,1]) {
        part('armor',[side*.38,1.45,-.49],[.2,.55,.22],'#446d70');
        part('box',[side*.38,1.3,-.75],[.15,.18,.045],accent,.7);
        part('armor',[side*.33,.55,.16],[.25,.24,.15],accent,.3);
      }
      part('box',[0,2.72,0],[.34,.08,.37],accent,.6);
    } else if(role==='knife') {
      // Replace the rifle and right forearm with an actual articulated knife hand.
      actor.splice(8,2);actor.splice(7,1);
      const phase=enemy.knifePhase||'idle',progress=1-arcadeClamp((enemy.knifeTime||0)/Math.max(.001,enemy.knifeDuration||1),0,1);
      const angle=phase==='windup'?.25+progress*1.05:phase==='strike'?1.3-progress*1.6:phase==='recover'?-.3+progress*.4:.1;
      const hand=[.69,1.5+Math.sin(angle)*.65,.6+Math.cos(angle)*.45];
      const shoulder=spacePoint(m,[.67,1.8,.08]),grip=spacePoint(m,hand);
      finaleLink(actor,shoulder,grip,.19,armor);
      const tip=spacePoint(m,[hand[0],hand[1]+Math.sin(angle)*1.2,hand[2]+Math.cos(angle)*1.2]);
      const guard=spacePoint(m,[hand[0],hand[1]-.1,hand[2]+.12]);
      finaleLink(actor,grip,guard,.115,'#644332');
      const from=actor.length;finaleLink(actor,guard,tip,.085,'#f3e8cf');
      tag(actor,from,'knife-blade',{mrgSoldierId:enemy.id});
      part('armor',[0,1.72,.43],[.35,.22,.08],accent,.4);
      part('armor',[0,2.42,-.16],[.46,.36,.4],'#583d49');
      part('box',[0,2.5,.36],[.33,.1,.06],accent,.8);
    } else {
      // The heavy rocket trooper carries a shoulder tube, not a rifle or shield.
      actor.splice(8,2);
      part('armor',[0,1.45,-.57],[.68,.72,.33],'#594b4a');
      for(const side of [-1,1]) {
        part('cylinder',[side*.44,1.55,-.89],[.19,.19,.55],'#a3a392');
        part('armor',[side*.76,1.96,.02],[.34,.28,.42],accent,.22);
      }
      part('box',[0,2.68,.08],[.39,.1,.3],accent,.55);
    }
    if(enemy.beard)beardModel(actor,yaw);
    return role;
  }
  function drawRocketLauncher(items,enemy) {
    const facing=enemy.facing===-1?-1:1,from=items.length,nose=V3.add(enemy.pos,[facing*.8,.8,0]);
    const aim=enemy.rocketPhase==='aim'&&Array.isArray(enemy.rocketTarget)?V3.norm(V3.sub(enemy.rocketTarget,nose)):[facing,0,0];
    const basis=spaceBasisDir(aim),center=V3.sub(nose,V3.scale(aim,1.25));
    items.push(citadelItem('tube',center,[.43,.43,1.25],'#808a82',.05,basis));
    items.push(citadelItem('torus',nose,[.46,.46,.14],'#ffc7a0',.25,basis));
    items.push(citadelItem('cylinder',V3.sub(nose,V3.scale(aim,.15)),[.32,.32,.02],'#18212b',0,basis));
    tag(items,from,'rocket-launcher',{mrgSoldierId:enemy.id,mrgRole:'rocketeer'});
    if(enemy.rocketPhase==='aim'&&Array.isArray(enemy.rocketTarget)) {
      const p=enemy.rocketTarget;
      // An aiming ray comes from the actual stored target; it stays visible with FX off.
      citadelBeam(items,nose,p,'#ffb58a',.035,.4);
      items.push(citadelItem('lightRing',p,[.7,.7,.7],'#ffc18f',.75,SPACE_IDENTITY,.65));
    }
  }
  function drawSoldiers(items,e,time,fx) {
    const b=e.board,f=e.finale;
    for(const enemy of aliveSoldiers(e)) {
      const actor=[],facing=enemy.facing===-1?-1:1,from=items.length;
      const role=soldierModel(actor,enemy,time,fx),air=enemy.grounded===false;
      const lean=air?-.09*facing:enemy.state==='emerging'?-.025*facing:0;
      placeActor(items,actor,[enemy.pos[0],enemy.pos[1],enemy.pos[2]||0],1.5,1,lean,air,facing);
      for(let i=from;i<items.length;i++)Object.assign(items[i],{
        mrgFeature:items[i].mrgFeature||'soldier',mrgSoldierId:enemy.id,mrgRole:role,mrgEnemyState:enemy.state||'active'});
      if(role==='rocketeer')drawRocketLauncher(items,enemy);
      if(role==='jumper'&&air&&enemy.vy>0) {
        for(const side of [-1,1]) {
          const p=V3.add(enemy.pos,[-facing*.8,-.25,side*.4]);
          const item=citadelItem('octa',p,[.19,.7,.19],roleColor(role),.9);
          Object.assign(item,{mrgFeature:'jump-thrust',mrgSoldierId:enemy.id,mrgRole:role});items.push(item);
        }
      }
      if(role==='knife'&&['windup','strike'].includes(enemy.knifePhase)&&Array.isArray(enemy.knifeFrom)&&Array.isArray(enemy.knifeTo)) {
        const start=items.length,strike=enemy.knifePhase==='strike';
        citadelBeam(items,enemy.knifeFrom,enemy.knifeTo,strike?'#fff3d1':'#ffc480',strike?.16:.045,strike?.95:.45);
        tag(items,start,'knife-threat',{mrgSoldierId:enemy.id,mrgRole:role,mrgPhase:enemy.knifePhase,mrgFrom:enemy.knifeFrom.slice(),mrgTo:enemy.knifeTo.slice()});
      }
      if(fx&&enemy.fireFX>0) {
        const muzzle=V3.add(enemy.pos,[facing*2.4,1.175,-facing*.93]);
        const direction=V3.norm(V3.sub(V3.add(b.pos,[0,1.1,0]),muzzle));
        items.push(citadelItem('octa',muzzle,[.32,.26,.24],'#ffe6ba',1));
        citadelBeam(items,muzzle,V3.add(muzzle,V3.scale(direction,1.4)),'#ffc68c',.12,.9);
      }
    }
    if(fx)for(const spark of f.soldierSparks||[]) {
      const u=arcadeClamp(1-spark.life/Math.max(.01,spark.maxLife||.65),0,1);
      for(let i=0;i<5;i++) {
        const angle=i*Math.PI*2/5;
        const p=V3.add(spark.pos,[Math.cos(angle)*u*2,.7+Math.sin(angle)*u*1.5,.4+u*.4]);
        items.push(citadelItem('octa',p,[.13,.22,.13],spark.color||'#ffbd94',1,SPACE_IDENTITY,(1-u)*.85));
      }
    }
  }
  function letterStroke(items,a,b,width,depth,color,z,glyph,front=false) {
    const d=V3.norm([b[0]-a[0],b[1]-a[1],0]),basis={r:[-d[1],d[0],0],u:[0,0,1],f:d};
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const item=citadelItem(front?'box':'armor',[(a[0]+b[0])/2,(a[1]+b[1])/2,z],[width/2,depth/2,length/2],color,front?.2:0,basis);
    Object.assign(item,{mrgFeature:'boss-letter',mrgGlyph:glyph,mrgArenaVersion:VERSION});items.push(item);
  }
  function drawBossTitle(items,e) {
    const f=e.finale,done=arenaDefeated(e);
    const face=done?'#d3ffe9':'#e7dfca',baseline=20.8,start=17.65,height=5.4;
    // Cyrillic М, Р and Г are solid mechanical letterforms with a genuine .9u extrusion.
    // The Р has a closed upper bowl; the Г has its single upper horizontal stroke.
    const letters=[
      {glyph:'М',x:0,strokes:[[[0,0],[0,height]],[[0,height],[1.9,.12]],[[1.9,.12],[3.8,height]],[[3.8,height],[3.8,0]]]},
      {glyph:'Р',x:4.95,strokes:[[[0,0],[0,height]],[[0,height],[2.35,height]],[[2.35,height],[3.05,4.7]],[[3.05,4.7],[3.05,3.5]],[[3.05,3.5],[2.35,2.8]],[[2.35,2.8],[0,2.8]]]},
      {glyph:'Г',x:9.15,strokes:[[[0,0],[0,height]],[[0,height],[3.35,height]]]}
    ];
    items.push(citadelItem('armor',[24,23.5,3.8],[7.5,3.45,.3],'#22384a'));
    for(const side of [-1,1])finaleLink(items,[24+side*8,19.6,.3],[24+side*5.4,20.7,3.5],.18,'#819098');
    for(const letter of letters)for(const [from,to]of letter.strokes) {
      const a=[start+letter.x+from[0],baseline+from[1]],b=[start+letter.x+to[0],baseline+to[1]];
      letterStroke(items,a,b,.65,.9,'#697c8c',4.65,letter.glyph);
      letterStroke(items,a,b,.49,.095,face,5.145,letter.glyph,true);
    }
  }
  function drawDangerPlating(items,e) {
    const f=e.finale,done=f.phase!=='mrg'||arenaDefeated(e);
    const bounds=globalThis.CITADEL_MRG?.bossBounds(e)||{minX:13,maxX:19,minY:-2,maxY:20};
    if(!bounds||![bounds.minX,bounds.maxX,bounds.maxY].every(Number.isFinite))return;
    const color=done?'#92d9be':'#ffc08f',front=2.77,left=bounds.minX+.08;
    // Hazard-painted metal, not an on-screen collision rectangle.
    for(let i=0;i<6;i++) {
      const y=1.6+i*2.9;
      if(y>bounds.maxY-.5)continue;
      items.push(citadelItem('armor',[left+.23,y,front],[.32,.67,.08],'#1c2c39'));
      items.push(citadelItem('box',[left+.23,y,front+.10],[.11,.53,.035],color,.55,stationZBasis(-.5)));
    }
    items.push(citadelItem('box',[(bounds.minX+bounds.maxX)/2,.05,3.08],[(bounds.maxX-bounds.minX)/2,.05,.45],done?'#43675b':'#775041',.2));
    for(let x=bounds.minX+.6;x<bounds.maxX;x+=1.2)items.push(citadelItem('box',[x,.12,3.09],[.15,.035,.36],color,.55,stationYaw(-.4)));
  }

  function drawBossTowers(items,e) {
    const f=e.finale,upload=['upload','victory'].includes(f.phase),emerging=aliveSoldiers(e).some(enemy=>enemy.state==='emerging');
    const preparing=pendingSoldiers(e)>0&&f.batchTimer>0&&f.batchTimer<1.4;
    const add=(...args)=>items.push(citadelItem(...args));
    for(const side of [-1,1]) {
      const x=24+side*8;
      if(side===-1) {
        // A real opening lets the soldiers walk out at their physical positions.
        add('armor',[x,13,-3],[3,7,5],'#34374a');
        add('sphere',[x,13.1,.55],[2.9,6.8,2.3],'#725165');
        add('armor',[x,1.5,-4.6],[3,3.5,1.4],'#1d1c2c');
        const from=items.length,open=emerging?1:0;
        add('sphere',[x,2.4+open*4.9,2.22],[2.75,3.4-open*2,.45],'#633e53');
        for(let i=0;i<=9;i++) {
          const a=i/9*Math.PI,p=[x+Math.cos(a)*2.78,1.05+Math.sin(a)*4.98,2.75];
          add('sphere',p,[.45,.63,.6],i%2?'#a7888a':'#876472');
        }
        for(let i=0;i<3;i++)add('sphere',[x-1.5+i*1.5,6.58,2.96],[.36,.16,.14],emerging||preparing?roleColor(['jumper','knife','rocketeer'][i]):'#765575',.5);
        tag(items,from,'spawn-hatch',{mrgOpen:!!open});
      } else {
        add('armor',[x,9,-3],[3,11,5],'#34374a');
        add('sphere',[x,10,.25],[2.95,9.85,2.65],'#674756');
      }
      for(let j=side===-1?3:0;j<7;j++) {
        add('sphere',[x,1+j*2.3,2.3],[2.25,.45,.45],'#a08188');
        add('sphere',[x-.1,1+j*2.3,2.67],[1.48,.065,.10],upload?'#9de8cc':'#d89a9b',.25);
      }
    }
  }

  function organicTube(items,a,b,radius,color,emissive=0,alpha=1) {
    const delta=V3.sub(b,a),length=V3.len(delta);
    if(length<.001)return;
    items.push(citadelItem('cylinder',V3.lerp(a,b,.5),[radius,radius,length/2],color,emissive,spaceBasisDir(delta),alpha));
  }
  function cubic(a,b,c,d,t) {
    const v=1-t;
    return a.map((n,i)=>v*v*v*n+3*v*v*t*b[i]+3*v*t*t*c[i]+t*t*t*d[i]);
  }
  function drawOrganicBoss(items,e,time,fx) {
    const f=e.finale,b=e.board,m=f.mrg,done=arenaDefeated(e),upload=['upload','victory'].includes(f.phase);
    const t=fx?time:0,breath=1+(done?0:Math.sin(t*1.75)*.025),hurt=m.hit>0;
    const open=upload||done?1:arcadeClamp(f.shellOpen??(f.open?1:0),0,1);
    const skin=hurt?'#f4d9c2':done?'#699689':'#765269',fold=done?'#8cbbaa':'#b58a91';
    const start=items.length,add=(...args)=>items.push(citadelItem(...args));
    // A fleshy, breathing carapace fills the old machine frame. Its contact side
    // remains the established left tower; the central eye remains the actual core.
    add('sphere',[24,8,-.15],[7.45*breath,7.55*breath,3.5],hurt?'#ffead5':'#463646');
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6,bulge=(i%3===0?1.08:1)*breath;
      const p=[24+Math.cos(angle)*6.18,8+Math.sin(angle)*6.48,2.4];
      add('sphere',p,[1.5*bulge,2.22*bulge,1.1],i%2?skin:fold,0,stationZBasis(angle-Math.PI/2));
      const rim=[24+Math.cos(angle)*6.62,8+Math.sin(angle)*6.87,2.95];
      add('sphere',rim,[.36,.83,.32],done?'#b9dac7':'#d4bba5',0,stationZBasis(angle-Math.PI/2));
    }
    add('sphere',[24,8,2.4],[5.52,5.5,1.05],hurt?'#fff4d7':open>.5?'#dfbc83':'#bb9ea5',.18);
    const look=[arcadeClamp((b.pos[0]-24)*.025,-.85,.45),arcadeClamp((b.pos[1]-7)*.085,-.65,1.05)];
    const eye=[24+look[0],8+look[1],3.45],iris=done?'#9ee6c2':f.open?'#eeb568':'#a7779d';
    add('sphere',eye,[3.4,3.55,.62],hurt?'#ffe6ab':iris,.4);
    for(let i=0;i<14;i++) {
      const a=i*Math.PI/7,inner=1.15,outer=3.12;
      organicTube(items,V3.add(eye,[Math.cos(a)*inner,Math.sin(a)*inner,.6]),V3.add(eye,[Math.cos(a)*outer,Math.sin(a)*outer,.25]),.1,i%2?'#795f63':'#f1d799',.3);
    }
    const blink=fx&&!done?Math.pow(Math.max(0,Math.cos(t*.55)),34):0;
    add('sphere',V3.add(eye,[0,0,.68]),[.57,2.65*(1-blink*.65),.18],done?'#315249':'#201b29');
    add('sphere',V3.add(eye,[-.85,1.52,.86]),[.55,.7,.1],'#fff1d3',.65);
    add('sphere',V3.add(eye,[.59,-.94,.82]),[.18,.22,.06],'#f8dabb',.3);
    for(const side of [-1,1]) {
      const y=8+side*(2.75+open*1.9);
      add('sphere',[24,y,3.75],[5.55,1.64-open*.4,.86],skin);
      add('sphere',[24,y-side*.78,4.12],[4.88,.3,.43],fold);
    }
    // Short roots cling to the casing. Only the gameplay-owned long limbs below
    // can reach the arena; these roots do not invent a second attack timeline.
    for(let i=0;i<4;i++) {
      const side=i%2?-1:1,upper=i<2;
      const a=[24+side*5.3,upper?14.3:3.7,.3],d=[24+side*10.35,upper?16.8:1.5,2.4];
      const b0=[24+side*10.0,upper?21.2:1.2,1.0],c0=[24+side*8.2,upper?11.2:6.3,2.1];
      b0[1]+=Math.sin(t*1.5+i)*.5;
      let previous=a;
      for(let j=1;j<=12;j++) {
        const u=j/12,p=cubic(a,b0,c0,d,u),r=.95*(1-u*.7);
        organicTube(items,previous,p,r,skin);
        if(j%3===0)add('sphere',p,[r,r,r],fold);
        previous=p;
      }
    }
    tag(items,start,'boss-organic',{mrgAlive:!done,mrgBreath:breath});
  }

  function drawSafeZone(items,e,t) {
    const sweep=!t.kind||t.kind==='sweep',z=t.safeZone||{minX:-32,maxX:t.safeX??-24,maxY:22};
    const left=Math.max(-32,z.minX),right=Math.min(20,z.maxX),width=Math.max(.1,right-left),from=items.length;
    items.push(citadelItem('box',[(left+right)/2,.1,1.1],[width/2,.07,3.3],'#75e8c0',.55,SPACE_IDENTITY,.23));
    for(const x of [left,right])items.push(citadelItem('box',[x,.18,1.1],[.045,.12,3.3],'#a5ffe0',1));
    citadelBeam(items,[left,.18,4.35],[right,.18,4.35],'#a5ffe0',.04,.65);
    if(sweep)citadelBeam(items,[right,.05,3.9],[right,Math.min(22,z.maxY),3.9],'#92f6cf',.045,.65);
    tag(items,from,'safe-zone',{mrgSafeX:right,mrgSafeLeft:left,mrgSafeZone:{...z},mrgKind:t.kind||'sweep',mrgPhase:t.phase});
  }
  function drawCurvedTentacles(items,e,t) {
    const geometry=globalThis.CITADEL_MRG?.tentacleGeometry(e)||[],warning=t.phase==='telegraph';
    for(const limb of geometry) {
      for(let i=1;i<limb.points.length;i++) {
        const a=limb.points[i-1],b=limb.points[i],r=Math.max(limb.radii[i-1],limb.radii[i]),from=items.length;
        if(V3.len(V3.sub(b,a))<.001)continue;
        if(warning) {
          organicTube(items,a,b,r,'#e5a09c',.35,.08);
          organicTube(items,a,b,.055,'#ffd4a6',.8,.75);
          if(i%4===0)items.push(citadelItem('torus',b,[limb.radii[i],limb.radii[i],.06],'#ffbc9e',.75,spaceBasisDir(V3.sub(b,a)),.5));
        } else {
          const r1=limb.radii[i],phase=t.phase==='retract',skin=phase?'#756074':'#986574';
          organicTube(items,a,b,r,skin);
          // Round the true sampled joints; small ventral cups distinguish flesh
          // from the preserved straight mechanical sweep. No independent wiggle.
          if(i%2===0||i===limb.points.length-1)items.push(citadelItem('sphere',b,[r1,r1,r1],i%4===0?'#ab7e87':skin));
          if(i%3===0&&r1>.4) {
            const cup=V3.add(b,[0,-r1*.2,r1*.89]),size=r1*.36;
            items.push(citadelItem('torus',cup,[size,size,.1],'#edc5ad',.1));
            items.push(citadelItem('sphere',V3.add(cup,[0,0,-.055]),[size*.67,size*.67,.065],'#5a344b'));
          }
        }
        tag(items,from,warning?'tentacle-telegraph':'tentacle',{
          mrgSegment:limb.id,mrgKind:t.kind,mrgSide:limb.side,mrgPointIndex:i-1,mrgPhase:t.phase,
          mrgFrom:a.slice(),mrgTo:b.slice(),mrgRadius:r,mrgRadii:[limb.radii[i-1],limb.radii[i]]});
      }
    }
  }
  function drawTentacles(items,e) {
    const t=e.finale.tentacle;
    if(!t||t.phase==='idle'||arenaDefeated(e))return;
    drawSafeZone(items,e,t);
    if(t.kind&&t.kind!=='sweep'){drawCurvedTentacles(items,e,t);return;}
    const warning=t.phase==='telegraph',active=t.phase==='active';
    const safeX=Number.isFinite(t.safeX)?t.safeX:-24;
    const bounds=t.bounds||{minX:safeX,maxX:20,minY:-2,maxY:22};
    if(warning) {
      const area=items.length;
      items.push(citadelItem('box',[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,-.9],[(bounds.maxX-bounds.minX)/2,(bounds.maxY-bounds.minY)/2,.04],'#b86c76',.4,SPACE_IDENTITY,.07));
      tag(items,area,'tentacle-warning-area',{mrgBounds:{...bounds}});
    }
    for(let index=0;index<(t.segments||[]).length;index++) {
      const s=t.segments[index];
      if(!Array.isArray(s.from)||!Array.isArray(s.to))continue;
      const start=s.from.slice(),end=t.phase==='retract'?V3.lerp(start,s.to,arcadeClamp((t.time||0)/Math.max(.001,t.duration||1),0,1)):s.to.slice();
      const delta=V3.sub(end,start),length=V3.len(delta);if(length<.04)continue;
      const direction=V3.scale(delta,1/length),basis=spaceBasisDir(direction),r=Math.max(.1,s.radius||2.1),mark=items.length;
      if(warning) {
        citadelBeam(items,start,end,'#ffc3a0',.075,.65);
        for(let j=0;j<7;j++) {
          const p=V3.lerp(start,end,(j+.5)/7);
          items.push(citadelItem('torus',p,[r*.78,r*.78,.08],'#f49d91',.7,basis,.25));
        }
      } else {
        const n=Math.max(2,Math.ceil(length/5.5));
        for(let j=0;j<n;j++) {
          const a=V3.lerp(start,end,j/n),b=V3.lerp(start,end,(j+1)/n),p=V3.scale(V3.add(a,b),.5),half=length/n/2;
          items.push(citadelItem('armor',p,[r*.73,r*.73,half],'#635369',.03,basis));
          items.push(citadelItem('box',V3.add(p,[0,r*.47,.72]),[r*.16,r*.12,half*.88],active?'#ef9e9b':'#ac8bae',.6,basis));
          if(j>0)items.push(citadelItem('sphere',a,[r*.83,r*.83,r*.83],'#a290a8',.12));
        }
        // The blunt end finishes at the actual danger boundary, inside the safe line.
        const cap=V3.sub(end,V3.scale(direction,.45));
        items.push(citadelItem('armor',cap,[r*.82,r*.82,.45],active?'#d8b0ae':'#a891aa',.15,basis));
      }
      tag(items,mark,warning?'tentacle-telegraph':'tentacle',{mrgSegment:index,mrgKind:'sweep',mrgPhase:t.phase,mrgFrom:start,mrgTo:end,mrgRadius:r});
    }
  }
  function drawProjectiles(items,e,fx) {
    const add=(...args)=>items.push(citadelItem(...args)),b=e.board;
    for(const s of b.bullets) {
      add(s.grenade?'sphere':'box',s.pos,s.grenade?[.5,.5,.5]:[.09,.09,.9],s.grenade?'#ffd092':'#8cffee',1,spaceBasisDir(s.vel));
      if(s.grenade)citadelBeam(items,s.pos,V3.sub(s.pos,V3.scale(V3.norm(s.vel),4)),'#ffb061',.18,.8);
    }
    for(const s of b.hostile) {
      const from=items.length,soldier=s.source==='soldier';
      if(s.kind==='rocket') {
        const direction=V3.norm(s.vel),basis=spaceBasisDir(direction);
        add('cylinder',s.pos,[.27,.27,.85],'#d2cead',.25,basis);
        add('octa',V3.add(s.pos,V3.scale(direction,.95)),[.3,.3,.42],'#ffab8e',.6,basis);
        add('box',V3.sub(s.pos,V3.scale(direction,.57)),[.52,.065,.25],'#b57e73',.2,basis);
        add('octa',V3.sub(s.pos,V3.scale(direction,1.25)),[.21,.21,.55],'#ffe2a4',1,basis);
        tag(items,from,'rocket',{mrgOwnerId:s.ownerId,mrgPosition:s.pos.slice(),mrgBlastRadius:s.blastRadius});
      } else {
        add(s.wave?'torus':'sphere',s.pos,s.wave?[1.3,2,1]:soldier?[.26,.26,.26]:[.48,.48,.48],soldier?'#ffbe93':'#ff86a6',1);
        if(soldier&&s.vel)citadelBeam(items,s.pos,V3.sub(s.pos,V3.scale(V3.norm(s.vel),1.1)),'#ff8d78',.075,.85);
        if(s.wave){add('box',V3.add(s.pos,[0,-1,0]),[1.4,.15,4],'#ffb47e',1);if(fx)citadelBeam(items,V3.add(s.pos,[3,-1.2,0]),V3.add(s.pos,[7,-1.2,0]),'#ffcf93',.15,.5);}
      }
    }
    for(const burst of e.finale.rocketBlasts||[]) {
      const from=items.length,u=arcadeClamp(1-burst.life/Math.max(.01,burst.maxLife||.7),0,1),r=Math.max(.1,burst.radius||1),fade=1-u;
      add('sphere',burst.pos,[r*(.25+.5*u),r*(.25+.5*u),r*(.25+.5*u)],'#ffb685',.9,SPACE_IDENTITY,fade*.35);
      add('torus',burst.pos,[r,r,.12],burst.color||'#ffbb93',.95,SPACE_IDENTITY,fade*.8);
      if(fx)for(let i=0;i<6;i++) {
        const angle=i*Math.PI/3,offset=[Math.cos(angle)*r*u,Math.sin(angle)*r*u,.35];
        add('octa',V3.add(burst.pos,offset),[.25,.35,.2],'#ffe8b8',1,SPACE_IDENTITY,fade);
      }
      tag(items,from,'rocket-blast',{mrgPosition:burst.pos.slice(),mrgRadius:r});
    }
  }

function renderArena(e,time,fx){const items=[],add=(...x)=>items.push(citadelItem(...x)),f=e.finale,b=e.board,m=f.mrg||{hp:0,maxHp:1,pos:[24,8,0]},upload=f.phase==='upload'||f.phase==='victory',defeated=arenaDefeated(e),t=fx?time:0;
 add('box',[0,-1,0],[70,1,40],'#24394c');add('box',[0,15,-11],[70,24,1],'#122738');add('box',[0,31,0],[70,1,15],'#152d40');for(const side of [-1,1])add('box',[side*45,15,0],[2,20,22],'#20394c');for(const item of items)item.cpuBackground=true;for(let i=0;i<12;i++){const x=-36+i*6;add('box',[x,.03,7],[2.8,.04,.08],'#46666c',.14);add('armor',[x,25,-3],[2,.65,5],'#395768');add('box',[x,24.3,0],[1.7,.06,2.5],'#507381',.18);for(let j=0;j<3;j++)add('box',[x+1,17+j*2,-9.8],[1.3,.4,.03],'#54899a',.3)}for(let i=-4;i<=4;i++){add('armor',[i*8,12,-9.5],[.65,14,1.3],'#40576a');add('box',[i*8+.9,11,-8.1],[.06,11,.06],'#44616f',.18)}drawPlatforms(items,e);
 drawBossTowers(items,e);
 drawOrganicBoss(items,e,time,fx);
 if(f.open&&!upload){for(const sx of [-1,1])for(const sy of [-1,1]){const p=[24+sx*7.2,8+sy*6.7,4];citadelBeam(items,p,V3.add(p,[-sx*2,0,0]),'#fff0be',.1,1);citadelBeam(items,p,V3.add(p,[0,-sy*2,0]),'#fff0be',.1,1)}}for(let i=0;i<3;i++){const a=-Math.PI*.7+i*Math.PI*.7,live=m.hp/m.maxHp>(2-i)/3;add('octa',[24+Math.cos(a)*7.5,8+Math.sin(a)*7.5,3],[.4,.7,.3],live?'#ffce94':'#7cf3c8',1,stationZBasis(a))}
 if(f.telegraph>0){const def=attack(f.pattern),pulse=.45+Math.sin(t*8)*.12;add('lightRing',[24,8,3.1],[8.2,8.2,1],def.color,1,stationZBasis(-t*.4),pulse)}
 if(fx&&f.defeatTime>0){const u=1-f.defeatTime/3;for(let i=0;i<3;i++){const r=8+((u*2+i/3)%1)*14;add('lightRing',[24,8,3+i*.8],[r,r,1],'#a2ffdb',1,stationZBasis(t*.2+i),.45*(1-u))}for(let i=0;i<12;i++){const a=i*Math.PI/6+t*.3,r=7+u*12;add('octa',[24+Math.cos(a)*r,8+Math.sin(a)*r,3+u*5],[.18,.5,.18],i%2?'#ffe8b3':'#b2ffe2',1,stationZBasis(a))}}

 drawBossTitle(items,e);drawDangerPlating(items,e);drawSoldiers(items,e,time,fx);
 const pack=arenaActor(items,e,time,fx);
 drawProjectiles(items,e,fx);drawTentacles(items,e);
 if(f.telegraph>0&&!upload){const color=attack(f.pattern).color;if(f.pattern===2)citadelBeam(items,[-34,f.aimY,1],[23,f.aimY,1],color,.05,.55);if(f.pattern===0)add('box',[-6,.12,1],[28,.06,4],color,1,SPACE_IDENTITY,.25);if(f.pattern===1)for(const a of [2.6,3,3.4])citadelBeam(items,m.pos,V3.add(m.pos,[Math.cos(a)*24,Math.sin(a)*24,0]),color,.045,.45)}if(f.beamTime>0)citadelBeam(items,[-34,f.aimY,1],[24,f.aimY,1],'#ffd4e9',.6,.85);if(b.invulnerable>0)add('sphere',V3.add(b.pos,[0,.5,0]),[1.5,2,1.4],'#8eeede',.8,SPACE_IDENTITY,.17);
 if(upload){const progress=Math.min(1,f.time/8);citadelBeam(items,pack,[24,8,3],'#a2ffe3',.18,.7);for(let i=0;i<12;i++){const u=((t*.5+i/12)%1),p=V3.lerp(pack,[24,8,3],u);add('octa',p,[.25,.4,.25],'#eeffdd',1)}for(let k=0;k<5;k++)add('lightRing',[24,8,3+k*.5],[7+k*.9,7+k*.9,1],'#88e7d0',1,stationZBasis(t*.1),progress*.15)}return items}

  function fitText(c,text,x,y,maxWidth,size=12,min=10,weight='normal') {
    let shown=String(text),font=size;
    c.font=weight+' '+font+'px Arial';
    while(c.measureText(shown).width>maxWidth&&font>min)c.font=weight+' '+(--font)+'px Arial';
    if(c.measureText(shown).width>maxWidth) {
      while(shown.length&&c.measureText(shown+'…').width>maxWidth)shown=shown.slice(0,-1);
      shown+='…';
    }
    c.fillText(shown,x,y);
  }
  function hudLayout(w,h) {
    const display=ARCADE.canvas?.getBoundingClientRect?.().width;
    const W=Math.max(280,Math.min(w,Number.isFinite(display)&&display>0?display:w)),H=h/w*W;
    const tight=H<300,wide=W/H>=1.25,margin=W<700?8:20;
    // The MRG sign occupies the upper right of the arena. Keep it uncovered.
    const width=wide?Math.min(620,Math.max(278,W*.57)):Math.min(W-margin*2,620);
    return {W,H,tight,wide,margin,x:wide?margin:(W-width)/2,width:Math.min(width,W-margin*2),top:tight?5:8,head:tight?70:84,bottom:tight?22:26};
  }
  function soldierLabels(c,e,cam,layout) {
    const {W,H,x,width,top,head,margin,bottom}=layout;
    for(const enemy of aliveSoldiers(e)) {
      const q=spaceProject(V3.add(enemy.pos,[0,4.15,0]),cam,W,H);
      if(q.z<=0||q.x<-20||q.x>W+20)continue;
      const name=['TV','BS','SH'].includes(enemy.name)?enemy.name:'';
      const bw=arcadeClamp(q.scale*3.7,21,38),blockHeight=name?23:5;
      const cx=arcadeClamp(q.x,margin+bw/2+3,W-margin-bw/2-3);
      let y=q.y-(name?16:0);
      if(cx+bw/2>=x&&cx-bw/2<=x+width&&y<top+head+12)y=top+head+12;
      y=arcadeClamp(y,margin,H-bottom-margin-blockHeight-4);
      if(name) {
        c.font='bold 12px Arial';const tw=c.measureText(name).width+10;
        c.fillStyle='#081828eb';c.fillRect(cx-tw/2,y-1,tw,17);
        c.textAlign='center';c.fillStyle='#ffebd7';c.fillText(name,cx,y+7);
      }
      const by=y+(name?18:0),pct=arcadeClamp(enemy.hp/Math.max(1,enemy.maxHp),0,1);
      c.fillStyle='#081525e8';c.fillRect(cx-bw/2-1,by-1,bw+2,5);
      c.fillStyle='#583442';c.fillRect(cx-bw/2,by,bw,3);
      c.fillStyle=enemy.hit>0?'#fff2d0':enemy.color||'#ff9b9e';c.fillRect(cx-bw/2,by,bw*pct,3);
    }
  }
  function renderHUD(c,e,cam,w,h) {
    c.clearRect(0,0,w,h);
    if(['finalebrief','finalcheck','won','lost','paused'].includes(e.status))return;
    const f=e.finale,b=e.board,m=f.mrg,alive=aliveSoldiers(e).length,pending=pendingSoldiers(e);
    const wave=arcadeClamp((f.waveIndex||0)+1,1,3),damage=f.waveDamageMultiplier||[1,2,4][wave-1];
    const batches=Math.max(1,Number(f.totalBatches)||wave),released=arcadeClamp(Number(f.spawnedBatches)||0,0,batches);
    const dead=arenaDefeated(e),warning=f.telegraph>0,def=attack(f.pattern),tentacle=f.tentacle;
    const tentacleWarning=tentacle?.phase==='telegraph',tentacleActive=tentacle?.phase==='active';
    const layout=hudLayout(w,h),{W,H,tight,margin,x,width,top,head,bottom}=layout;
    const color=dead?'#a4ffdb':tentacleActive?'#ffb09c':tentacleWarning?'#ffd0a1':f.waveGateReached&&(alive||pending)?'#ffc092':warning?def.color:f.open?'#ffdc97':'#bda6dd';
    c.save();c.scale(w/W,w/W);c.textBaseline='middle';
    c.fillStyle='#061525ee';c.fillRect(x,top,width,head);c.fillStyle=color;c.fillRect(x,top,3,head);
    // Health is in the first visible row; it never depends on the lower controls.
    const health=arcadeClamp(Number(b.hp)||0,0,100),hpColor=health<30?'#ffb09c':'#a7f5d4';
    c.textAlign='left';c.fillStyle=hpColor;
    fitText(c,'ЗДОРОВЬЕ '+Math.ceil(health)+'%',x+11,top+(tight?12:15),125,tight?11:12,10,'bold');
    c.fillStyle='#274346';c.fillRect(x+11,top+(tight?21:26),114,3);c.fillStyle=hpColor;c.fillRect(x+11,top+(tight?21:26),114*health/100,3);
    c.textAlign='right';c.fillStyle=damage>=4?'#ffb79f':'#e0e7e5';
    fitText(c,'ВОЛНА '+wave+'/3 · УРОН ×'+damage,x+width-10,top+(tight?12:15),width-146,tight?10:11,10,'bold');
    c.textAlign='center';c.fillStyle='#d4dfe0';
    fitText(c,'ПАЧКИ '+released+'/'+batches+' · ЖИВЫ '+alive+' · ЖДУТ '+pending,x+width/2,top+(tight?36:44),width-22,tight?10:11,10,'bold');
    let goal;
    if(dead)goal='МРГ ОБЕЗВРЕЖЕН';
    else if(tentacleActive)goal=tentacle.title||'ЩУПАЛЬЦА — В УКРЫТИЕ';
    else if(tentacleWarning)goal=(tentacle.title||'ЩУПАЛЬЦА')+' · '+Math.max(0,tentacle.time).toFixed(1)+' с';
    else if(f.waveGateReached&&alive)goal='ДОБЕЙТЕ СОЛДАТ ДЛЯ ПЕРЕХОДА';
    else if(f.waveGateReached&&pending)goal='СЛЕДУЮЩАЯ ПАЧКА · '+Math.max(0,f.batchTimer||0).toFixed(1)+' с';
    else if(warning)goal=def.title;
    else if(f.open)goal='ЯДРО ОТКРЫТО — ПРИЦЕЛЬТЕСЬ';
    else if(aliveSoldiers(e).some(enemy=>enemy.state==='emerging'))goal='ПАЧКА ВЫХОДИТ ИЗ МРГ';
    else goal=f.platformLabel||'Прицельтесь и уничтожьте солдат';
    c.fillStyle=color;fitText(c,goal,x+width/2,top+(tight?56:68),width-22,tight?11:12,10,'bold');
    const gap=4,segment=(width-gap*2)/3,pct=arcadeClamp(m.hp/Math.max(1,m.maxHp),0,1);
    for(let i=0;i<3;i++) {
      const sx=x+i*(segment+gap);c.fillStyle='#34334d';c.fillRect(sx,top+head+2,segment,4);
      c.fillStyle=dead?'#9ff7d5':'#d6a9e8';c.fillRect(sx,top+head+2,segment*arcadeClamp(pct*3-i,0,1),4);
    }
    soldierLabels(c,e,cam,layout);
    if(tentacle&&tentacle.phase!=='idle'&&!dead) {
      const zone=tentacle.safeZone||{minX:-32,maxX:tentacle.safeX??-24,maxY:22};
      const q=spaceProject([(zone.minX+zone.maxX)/2,.2,4.1],cam,W,H);
      if(q.z>0) {
        const sy=arcadeClamp(q.y+13,top+head+18,H-bottom-16);
        c.font='bold 10px Arial';c.textAlign='center';const label=zone.maxY<=4?'УКРЫТИЕ · НА ПОЛУ':'УКРЫТИЕ',tw=c.measureText(label).width+10;
        const sx=arcadeClamp(q.x,margin+tw/2,W-margin-tw/2);
        c.fillStyle='#08241ded';c.fillRect(sx-tw/2,sy-8,tw,16);c.fillStyle='#a5ffe0';c.fillText(label,sx,sy);
      }
    }
    if(b.manualAim&&Array.isArray(b.aimPoint)) {
      const q=spaceProject(b.aimPoint,cam,W,H);
      if(q.z>0&&q.x>7&&q.x<W-7&&q.y>7&&q.y<H-bottom-8&&!(q.x>x&&q.x<x+width&&q.y<top+head+8)) {
        c.strokeStyle='#071623';c.lineWidth=3;c.beginPath();c.arc(q.x,q.y,6,0,Math.PI*2);c.stroke();
        c.strokeStyle='#c9ffe6';c.lineWidth=1.2;c.beginPath();c.arc(q.x,q.y,5,0,Math.PI*2);
        c.moveTo(q.x-10,q.y);c.lineTo(q.x-4,q.y);c.moveTo(q.x+4,q.y);c.lineTo(q.x+10,q.y);
        c.moveTo(q.x,q.y-10);c.lineTo(q.x,q.y-4);c.moveTo(q.x,q.y+4);c.lineTo(q.x,q.y+10);c.stroke();
      }
    }
    const y=H-bottom-(tight?5:8);
    c.fillStyle='#061525e8';c.fillRect(margin,y,W-margin*2,bottom);
    c.textAlign='left';c.fillStyle='#d7e5dc';
    const help=tentacleWarning||tentacleActive?tentacle.hint||'Отступите в зелёное укрытие':W>=800?'МЫШЬ / КАСАНИЕ — ПРИЦЕЛ · ПРОБЕЛ — ОГОНЬ · Q — ГРАНАТА':'ПРОБЕЛ / «ОГОНЬ» — СТРЕЛЯТЬ';
    fitText(c,help,margin+8,y+bottom/2,W-margin*2-121,tight?10:11,9);
    c.textAlign='right';c.fillStyle='#ffe1a6';
    fitText(c,'ГРАНАТЫ '+e.player.missiles,W-margin-8,y+bottom/2,105,tight?10:11,10,'bold');
    c.restore();
  }
  // The 1.2.1 compatibility renderer predates the chamber background layer.
  // Its giant floor triangles otherwise sort in front of standing characters.
  // Keep the public core's exact projection/shading, scoped to this arena only.
  function renderArenaCPU(c,items,cam,w,h) {
    spaceSky2D(c,cam,w,h);
    const polys=[],factor=h/(2*Math.tan(cam.fov/2)),light=V3.norm([-1,1,.6]);
    for(const item of items) {
      const mesh=SPACE_MESH[item.mesh==='armor'?'box':item.mesh==='torus'||item.mesh==='lightRing'?'ring':item.mesh],m=item.model;
      for(let i=0;i<mesh.p.length;i+=9) {
        const world=[];
        for(let j=0;j<9;j+=3)world.push(spacePoint(m,Array.from(mesh.p.slice(i+j,i+j+3))));
        let normal=V3.norm(V3.cross(V3.sub(world[1],world[0]),V3.sub(world[2],world[0])));
        if(['sphere','planet'].includes(item.mesh))normal=V3.norm(V3.sub(world[0],item.pos));
        const mid=V3.scale(V3.add(V3.add(world[0],world[1]),world[2]),1/3);
        if(['sphere','planet'].includes(item.mesh)&&V3.dot(normal,V3.sub(cam.pos,mid))<0)continue;
        const verts=world.map(v=>{const p=V3.sub(v,cam.pos);return [V3.dot(p,cam.r),V3.dot(p,cam.u),V3.dot(p,cam.f)];}),clipped=spaceClip(verts);
        if(clipped.length<3)continue;
        const screen=clipped.map(v=>[w/2+v[0]*factor/v[2],h/2-v[1]*factor/v[2]]);
        if(screen.every(p=>p[0]<0)||screen.every(p=>p[0]>w)||screen.every(p=>p[1]<0)||screen.every(p=>p[1]>h))continue;
        let lum=item.emissive?1:.3+.7*Math.max(0,V3.dot(normal,light));
        if(item.kind===1)lum*=.75+.2*Math.sin(normal[1]*27+normal[0]*8);
        const color=item.color.map(v=>Math.round(arcadeClamp(v*lum,0,1)*255));
        polys.push({screen,layer:item.cpuBackground?-1:0,z:verts.reduce((s,v)=>s+v[2],0)/3,color,alpha:item.alpha});
      }
    }
    polys.sort((a,b)=>a.layer-b.layer||b.z-a.z);
    for(const p of polys) {
      c.globalAlpha=p.alpha;c.beginPath();
      p.screen.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();
      c.fillStyle='rgb('+p.color.join(',')+')';c.fill();
      if(p.alpha===1){c.strokeStyle=c.fillStyle;c.lineWidth=.45;c.stroke();}
    }
    c.globalAlpha=1;
  }
  spaceDrawCPU = function(c,items,cam,w,h) {
    if(!items.some(item=>item.mrgFeature==='boss-letter'&&item.mrgArenaVersion===VERSION))return originalCPU(c,items,cam,w,h);
    return renderArenaCPU(c,items,cam,w,h);
  };
  finaleMRGScene = function(e,time,fx) {
    if(!currentArena(e)||!['mrg','upload','victory'].includes(e.finale.phase))return originalScene(e,time,fx);
    return renderArena(e,time,fx);
  };
  drawFinaleHUD = function(c,e,cam,w,h) {
    if(!currentArena(e)||e.finale.phase!=='mrg')return originalHUD(c,e,cam,w,h);
    return renderHUD(c,e,cam,w,h);
  };
  const aimHelp='Мышь или касание поля — прицел. Пробел / «Огонь» — стрелять; Q / «Граната» — граната. Без прицела огонь идёт по направлению взгляда.';
  const pauseHelp=aimHelp+' A/D — бег; W / Shift — прыжок; S — спуск с платформы. Прямой размах — в глубокое левое укрытие. Верхние и боковые щупальца — на пол в зелёный просвет.';
  if(typeof updateFinaleHUD==='function') {
    const update=updateFinaleHUD;
    updateFinaleHUD=function(...args) {
      const result=update.apply(this,args),e=ARCADE.engine;
      if(!currentArena(e)||e.finale.phase!=='mrg')return result;
      const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
      set('citadel-objective-detail',aimHelp);
      const tentacle=e.finale.tentacle,warning=tentacle&&['telegraph','active'].includes(tentacle.phase);
      set('mobile-goal-detail','Наведите касанием поля и нажмите «Огонь». Без прицела стрельба по взгляду. '+(warning?tentacle.hint+'.':'При щупальцах ищите зелёный просвет.'));
      for(const button of document.querySelectorAll('.arcade-touch-actions [data-action="arcade-missile"]'))button.setAttribute('aria-label','Бросить гранату по прицелу или направлению взгляда');
      return result;
    };
  }
  if(typeof finaleOverlay==='function') {
    const overlay=finaleOverlay;
    finaleOverlay=function(e,...args) {
      const html=overlay.call(this,e,...args);
      if(!currentArena(e)||e.finale.phase!=='mrg'||e.status!=='paused'||typeof html!=='string')return html;
      // Replace only the existing paused help paragraph, preserving the card/actions.
      return html.replace(/<p>[\s\S]*?<\/p>/,'<p>'+pauseHelp+'</p>');
    };
  }
  globalThis.CITADEL_MRG_VIEW=Object.freeze({
    version:VERSION,
    status(e=ARCADE.engine) {
      if(!currentArena(e))return {version:VERSION,active:false};
      const f=e.finale;
      return {version:VERSION,active:true,wave:f.waveIndex+1,alive:aliveSoldiers(e).length,pending:pendingSoldiers(e),
        health:e.board.hp,totalBatches:f.totalBatches,spawnedBatches:f.spawnedBatches,
        tentaclePhase:f.tentacle?.phase||'idle',tentacleKind:f.tentacle?.kind||'sweep',tentacleSafeZone:f.tentacle?.safeZone?{...f.tentacle.safeZone}:null,
        tentacleSafeX:f.tentacle?.safeX,manualAim:!!e.board.manualAim,
        damageMultiplier:f.waveDamageMultiplier,platformLabel:f.platformLabel,bossTitle:'МРГ',
        platforms:(f.arenaPlatforms||[]).map(p=>({id:p.id,lo:p.lo,hi:p.hi,topY:p.y-1,moving:p.moving})),
        soldiers:aliveSoldiers(e).map(enemy=>({id:enemy.id,role:enemy.role,state:enemy.state,batch:enemy.batchIndex,grounded:enemy.grounded,knifePhase:enemy.knifePhase,rocketPhase:enemy.rocketPhase})),
        namedSoldiers:aliveSoldiers(e).filter(x=>x.name).map(x=>({id:x.id,name:x.name,beard:Boolean(x.beard)}))};
    }
  });
})();
