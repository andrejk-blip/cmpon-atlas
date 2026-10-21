/* Цитадель ЦСИИ 2.5.0 — the base human rig in the MRG arena.
 * Only replaces tagged actor geometry. Boss, weapons, attack cues, collision,
 * progression, HUD and the existing arena renderer retain their owners.
 */
(() => {
  'use strict';
  const VERSION='2.5.0';
  if(globalThis.CITADEL_MRG_ACTORS?.version===VERSION||!globalThis.CITADEL_BASE_VIEW||
    typeof finaleMRGScene!=='function')return;
  const original=finaleMRGScene;
  const ownBody=new Set(['player','soldier']);
  const heldParts=new Set(['upper-arm','forearm','hand','thumb','rifle','rifle-barrel','magazine','sight','muzzle','launcher','launcher-rim']);
  const appearances=Object.freeze({jumper:[2,1],knife:[0,3],rocketeer:[0,1]});
  const kinds=Object.freeze({jumper:'scout',knife:'hunter',rocketeer:'rocketeer'});
  const skins=['#c58b67','#a57150','#dfaf8b','#79503b'];
  const hairs=['#32241f','#1e1c20','#76513a','#201c1a'];
  const playerColors=Object.freeze({cloth:spaceColor('#d2d9cc'),vest:spaceColor('#47666b'),
    lightCloth:spaceColor('#e7f3ef'),lightVest:spaceColor('#8caeaf')});
  const sameColor=(a,b)=>Math.abs(a[0]-b[0])<.001&&Math.abs(a[1]-b[1])<.001&&Math.abs(a[2]-b[2])<.001;
  const lowRigs=new Map();
  function mesh(name,rings,segments,axis='y') {
    const p=[],n=[],rows=[];
    for(const [height,rx,rz]of rings){const row=[];for(let j=0;j<segments;j++) {
      const a=j/segments*Math.PI*2;row.push(axis==='y'?[Math.sin(a)*rx,height,Math.cos(a)*rz]:[Math.sin(a)*rx,Math.cos(a)*rz,height]);
    }rows.push(row);}
    for(let k=0;k<rows.length-1;k++)for(let j=0;j<segments;j++) {
      const next=(j+1)%segments;
      for(const tri of [[rows[k][j],rows[k+1][j],rows[k+1][next]],[rows[k][j],rows[k+1][next],rows[k][next]]]) {
        const normal=V3.norm(V3.cross(V3.sub(tri[1],tri[0]),V3.sub(tri[2],tri[0]))),mid=V3.scale(V3.add(V3.add(...tri.slice(0,2)),tri[2]),1/3);
        if((axis==='y'?normal[0]*mid[0]+normal[2]*mid[2]:normal[0]*mid[0]+normal[1]*mid[1])<0)for(let i=0;i<3;i++)normal[i]*=-1;
        p.push(...tri[0],...tri[1],...tri[2]);n.push(...normal,...normal,...normal);
      }
    }
    SPACE_MESH[name]={p:new Float32Array(p),n:new Float32Array(n)};
  }
  // Dedicated low-detail meshes preserve anatomy without tiny fingers, straps
  // or dense rings. They are authored once; the CPU route never builds full rigs.
  mesh('mrg250_body',[[-1,.72,.78],[.65,1,.83],[1,.42,.5]],6);
  mesh('mrg250_head',[[-1,.45,.5],[.4,1,.94],[1,.24,.3]],8);
  mesh('mrg250_limb',[[-1,.5,.5],[0,1,1],[1,.35,.35]],5,'z');
  mesh('mrg250_hair',[[0,1,.98],[.62,1.04,1],[1.05,.08,.08]],8);
  function lowRig(kind,appearance) {
    const key=kind+'_'+appearance;if(lowRigs.has(key))return lowRigs.get(key);
    const c=CITADEL_BASE_VIEW.palettes[kind],skin=skins[appearance],hair=hairs[appearance],parts=[];
    const add=(name,pos,size,color)=>parts.push(citadelItem(name,pos,size,color));
    add('mrg250_body',[0,2.22,0],[.5,.6,.27],c.cloth);
    add('mrg250_body',[0,2.24,.17],[.42,.43,.16],c.vest);
    add('mrg250_body',[0,1.59,0],[.4,.22,.26],c.cloth);
    add('mrg250_head',[0,3.13,.025],[.285,.36,.27],skin);
    add('mrg250_head',[0,3.105,.29],[.052,.08,.07],skin);
    add('mrg250_hair',[0,3.12,.005],[.293,.37,.277],hair);
    add('mrg250_body',[-.07,3.45,.12],[.22,.08,.16],hair);
    for(const side of [-1,1]) {
      add('box',[side*.11,3.18,.263],[.064,.025,.016],'#e7e4d4');
      add('box',[side*.11,3.18,.281],[.022,.026,.008],hair);
    }
    if(appearance===1||appearance===3)add('mrg250_head',[0,2.95,.17],[.21,.11,.15],hair);
    if(kind!=='player')add('mrg250_body',[0,2.27,-.36],[.34,.41,.18],c.vest);
    if(kind==='rocketeer')for(const side of [-1,1])add('mrg250_limb',[side*.25,2.3,-.48],[.13,.13,.55],c.pants);
    const result=stationMerge(parts,'mrg250_'+key);lowRigs.set(key,result);return result;
  }
  function lowActor(parts,yaw,state,kind,appearance) {
    const basis=stationYaw(yaw),model=spaceModel([0,0,0],[1,1,1],basis),local=p=>spacePoint(model,p),c=CITADEL_BASE_VIEW.palettes[kind];
    for(const source of lowRig(kind,appearance))parts.push({...source,pos:[0,0,0],model:spaceModel([0,0,0],[1,1,1],basis),baseFeature:'body-lod'});
    const link=(from,to,radius)=>{const a=local(from),b=local(to),d=V3.sub(b,a);parts.push(citadelItem('mrg250_limb',V3.lerp(a,b,.5),[radius,radius,V3.len(d)/2],c.pants,0,spaceBasisDir(d)));};
    for(const side of [-1,1]) {
      const phase=state.gait+(side===1?0:Math.PI),swing=Math.sin(phase)*.48*state.speed/5.5,lift=Math.max(0,Math.cos(phase))*.22*state.speed/5.5;
      const knee=[side*.25,.85+lift*.3,.12+swing*.45],foot=[side*.25,.13+lift,.10+swing];
      link([side*.235,1.55,0],knee,.19);link(knee,foot,.145);
      parts.push(citadelItem('box',local([foot[0],foot[1],foot[2]+.1]),[.18,.13,.29],'#293338',0,basis));
    }
  }
  // Fixed seven rig variants, created at installation rather than during play.
  // Shared meshes are then reused by both the base and MRG scenes.
  CITADEL_BASE_VIEW.actor([], [0,0,0],0,{},'player');
  lowRig('player',0);
  for(const role of Object.keys(kinds))for(const appearance of appearances[role])
    {CITADEL_BASE_VIEW.actor([], [0,0,0],0,{appearance},kinds[role]);lowRig(kinds[role],appearance);}
  const active=e=>!!(e?.finale?.arenaVersion==='1.7.0'&&['mrg','upload','victory'].includes(e.finale.phase)&&e.board);
  const compatible=fx=>fx===false||!ARCADE.renderer?.gl||(typeof isMobileLayout==='function'&&isMobileLayout());
  function arm(items,a,elbow,b,cloth,skin,detail,low) {
    for(const [from,to,radius,color]of [[a,elbow,.18,cloth],[elbow,b,.14,cloth]]) {
      const d=V3.sub(to,from),part=citadelItem(low?'mrg250_limb':'base_limb',V3.lerp(from,to,.5),[radius,radius,V3.len(d)/2],color,0,spaceBasisDir(d));
      Object.assign(part,detail,{baseActor:true,baseFeature:'posed-arm'});items.push(part);
    }
    const hand=citadelItem(low?'box':'base_soft',b,[.13,.11,.14],skin);Object.assign(hand,detail,{baseActor:true,baseFeature:'posed-hand'});items.push(hand);
  }
  function actor(items,subject,player,time,fx,weapon) {
    const facing=subject.facing===-1?-1:1,role=player?'player':subject.role||'jumper';
    const kind=player?'player':kinds[role]||'scout';
    const appearance=player?0:(appearances[role]||appearances.jumper)[subject.beard?1:0];
    const speed=Math.abs(subject.vx||((subject.pos[0]-(subject.previous?.[0]??subject.pos[0]))*60));
    const parts=[],animated=fx!==false,low=compatible(fx);
    const pose={appearance,speed:animated?Math.min(5.5,speed):0,gait:animated?time*9:0,moveYaw:facing*Math.PI/2};
    if(low)lowActor(parts,facing*Math.PI/2,pose,kind,appearance);
    else CITADEL_BASE_VIEW.actor(parts,[0,0,0],facing*Math.PI/2,pose,kind,subject.hit>0);
    const customHands=low||player||role==='knife'||role==='rocketeer',scale=1.2;
    const lean=animated&&subject.grounded===false?-.06*facing:0,co=Math.cos(lean),si=Math.sin(lean);
    const detail={mrgFeature:player?'player':'soldier',mrgActorVersion:VERSION,mrgLod:low?'compatible':'detail'};
    if(!player)Object.assign(detail,{mrgSoldierId:subject.id,mrgRole:role,mrgEnemyState:subject.state||'active',mrgBeard:!!subject.beard});
    for(const source of parts) {
      if(customHands&&heldParts.has(source.baseFeature))continue;
      const part={...source,model:Array.from(source.model)},m=part.model;
      if(player) {
        if(sameColor(playerColors.cloth,part.color))part.color=playerColors.lightCloth;
        else if(sameColor(playerColors.vest,part.color))part.color=playerColors.lightVest;
      }
      // Affine transform only; neither the cached rig nor gameplay pose mutates.
      for(let j=0;j<12;j+=4) {
        const x=m[j]*scale,y=m[j+1]*scale;m[j]=x*co-y*si;m[j+1]=x*si+y*co;m[j+2]*=scale;
      }
      const x=m[12]*scale,y=m[13]*scale-1.8;
      part.pos=[subject.pos[0]+x*co-y*si,subject.pos[1]+.8+x*si+y*co,(subject.pos[2]||0)+m[14]*scale];
      [m[12],m[13],m[14]]=part.pos;
      Object.assign(part,detail);items.push(part);
    }
    if(customHands) {
      let grip;
      if(player) {
        const aim=Array.isArray(subject.aimDir)&&subject.aimDir.every(Number.isFinite)?V3.norm(subject.aimDir):[facing,0,0];
        grip=V3.add(subject.pos,[-aim[0]*.35,.6-aim[1]*.35,0]);
      } else if(role==='knife'&&weapon)grip=spacePoint(weapon.model,[0,0,-1]);
      else grip=V3.add(subject.pos,[facing*.1,.65,0]);
      for(const side of [-1,1]) {
        const shoulder=V3.add(subject.pos,[facing*.03,2.04,side*.57]);
        const hand=V3.add(grip,[side<0?0:-facing*.18,side<0?0:-.07,side*.10]);
        const elbow=V3.add(V3.lerp(shoulder,hand,.54),[-facing*.16,-.08,side*.12]);
        arm(items,shoulder,elbow,hand,player?'#e7f3ef':CITADEL_BASE_VIEW.palettes[kind].cloth,skins[appearance],detail,low);
      }
    }
    if(low&&role==='jumper') {
      const center=V3.add(subject.pos,[facing*.55,.8,0]),basis=spaceBasisDir([facing,0,0]);
      for(const [pos,size,color]of [[center,[.13,.16,.65],'#384b52'],[V3.add(center,[facing*.66,0,0]),[.07,.07,.15],'#a1aca5']]) {
        const weapon=citadelItem('box',pos,size,color,0,basis);Object.assign(weapon,detail,{baseFeature:'rifle'});items.push(weapon);
      }
    }
  }
  function scene(e,time,fx=true) {
    const old=original(e,time,fx);if(!active(e))return old;
    const playerParts=old.map((part,index)=>part.mrgFeature==='player'?index:-1).filter(index=>index>=0);
    if(!playerParts.length)return old;
    // The legacy arena places its aiming gun, muzzle and one arm immediately
    // after the tagged player. Keep the actual gun/muzzle; replace its arm.
    const legacyArm=playerParts[playerParts.length-1]+3;
    const items=old.filter((part,index)=>!ownBody.has(part.mrgFeature)&&index!==legacyArm);
    actor(items,e.board,true,time,fx);
    const visible=new Set(old.filter(part=>part.mrgFeature==='soldier').map(part=>part.mrgSoldierId));
    for(const enemy of e.board.enemies||[])if(visible.has(enemy.id)) {
      const knife=old.find(part=>part.mrgFeature==='knife-blade'&&part.mrgSoldierId===enemy.id);
      actor(items,enemy,false,time,fx,knife);
    }
    return items;
  }
  finaleMRGScene=scene;
  globalThis.CITADEL_MRG_ACTORS=Object.freeze({version:VERSION,scene,active,
    status:()=>({version:VERSION,sharedRigVersion:'2.0.0',fixedRigVariants:7,compatibleRigVariants:7,compatible:compatible(ARCADE.fx),retainedParticles:0})});
})();
