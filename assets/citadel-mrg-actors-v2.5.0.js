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
  // Fixed seven rig variants, created at installation rather than during play.
  // Shared meshes are then reused by both the base and MRG scenes.
  CITADEL_BASE_VIEW.actor([], [0,0,0],0,{},'player');
  for(const role of Object.keys(kinds))for(const appearance of appearances[role])
    CITADEL_BASE_VIEW.actor([], [0,0,0],0,{appearance},kinds[role]);
  const active=e=>e?.finale?.arenaVersion==='1.7.0'&&['mrg','upload','victory'].includes(e.finale.phase)&&e.board;
  function arm(items,a,elbow,b,cloth,skin,detail) {
    for(const [from,to,radius,color]of [[a,elbow,.18,cloth],[elbow,b,.14,cloth]]) {
      const d=V3.sub(to,from),part=citadelItem('base_limb',V3.lerp(from,to,.5),[radius,radius,V3.len(d)/2],color,0,spaceBasisDir(d));
      Object.assign(part,detail,{baseActor:true,baseFeature:'posed-arm'});items.push(part);
    }
    const hand=citadelItem('base_soft',b,[.13,.11,.14],skin);Object.assign(hand,detail,{baseActor:true,baseFeature:'posed-hand'});items.push(hand);
  }
  function actor(items,subject,player,time,fx,weapon) {
    const facing=subject.facing===-1?-1:1,role=player?'player':subject.role||'jumper';
    const kind=player?'player':kinds[role]||'scout';
    const appearance=player?0:(appearances[role]||appearances.jumper)[subject.beard?1:0];
    const speed=Math.abs(subject.vx||((subject.pos[0]-(subject.previous?.[0]??subject.pos[0]))*60));
    const parts=[],animated=fx!==false;
    CITADEL_BASE_VIEW.actor(parts,[0,0,0],facing*Math.PI/2,
      {appearance,speed:animated?Math.min(5.5,speed):0,gait:animated?time*9:0,moveYaw:facing*Math.PI/2},kind,subject.hit>0);
    const customHands=player||role==='knife'||role==='rocketeer',scale=1.2;
    const lean=animated&&subject.grounded===false?-.06*facing:0,co=Math.cos(lean),si=Math.sin(lean);
    const detail={mrgFeature:player?'player':'soldier',mrgActorVersion:VERSION};
    if(!player)Object.assign(detail,{mrgSoldierId:subject.id,mrgRole:role,mrgEnemyState:subject.state||'active',mrgBeard:!!subject.beard});
    for(const source of parts) {
      if(customHands&&heldParts.has(source.baseFeature))continue;
      const part={...source,model:Array.from(source.model)},m=part.model;
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
        arm(items,shoulder,elbow,hand,CITADEL_BASE_VIEW.palettes[kind].cloth,skins[appearance],detail);
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
    status:()=>({version:VERSION,sharedRigVersion:'2.0.0',fixedRigVariants:7,retainedParticles:0})});
})();
