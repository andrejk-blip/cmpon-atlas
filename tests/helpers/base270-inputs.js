/* Shared QA operator for 2.7 ground missions. Ordinary movement, aim, fire and
 * pulse only. Reads physical geometry/actors; never edits health or objectives. */
(function(root){
 'use strict';
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]),clamp=(n,a,z)=>Math.max(a,Math.min(z,n));
 function segment(p,a,z){const dx=z[0]-a[0],dz=z[2]-a[2],n=dx*dx+dz*dz,t=n?clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/n,0,1):0;return Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t);}
function createController(h,{mobile=false,reaction=0,loot=true,systems=true,lifts=true,boost=true}={}) {
  const q=h.deckQA;if(!q?.path||!q?.line)throw new Error('Base QA controller needs visible navigation and input adapters');
  let board=null,room=-1,route=[],goal=null,clock=0,previous=null,stalled=0,seen=new Map(),visits=new Set(),lastInput={},reactClock=0;
  return e=>{
    const b=e.board;if(e.status!=='boarding'||!b?.cells||e.finale&&e.finale.phase!=='maze')return{};
    if(board!==b||room!==b.completed.length){board=b;room=b.completed.length;route=[];goal=null;previous=b.pos.slice();stalled=0;seen.clear();}
    clock+=1/60;
    if(b.missions270?.transport){route=[];goal=null;previous=null;return{};}
    const hazards=(b.missions270?.hazards||[]).filter(x=>x.active&&x.room<=room&&x.type!=='breach');
    function risk(pos){let n=0;for(const z of hazards){const d=z.type==='fire'?dist(pos,z.pos)-z.radius:segment(pos,z.from,z.to)-z.width;n+=Math.max(0,1.1-d)*6;}return n;}
    const enemies=b.enemies.filter(x=>!x.dead&&x.hp>0&&(x.duty?.room??x.decksRoom??x.zone)===room);
    const visible=enemies.filter(x=>dist(x.pos,b.pos)<28&&e.boardLOS(b.pos,x.pos,.08)).sort((a,z)=>dist(a.pos,b.pos)-dist(z.pos,b.pos));
    const focus=visible[0]||enemies.slice().sort((a,z)=>dist(a.pos,b.pos)-dist(z.pos,b.pos))[0];
    const pickup=loot&&(b.armory260?.pickups||[]).find(x=>!x.taken&&x.room<=room);
    const panel=systems&&(b.missions270?.systems||[]).find(x=>x.type!=='lift'&&x.state!=='used'&&x.room<=room);
    const lift=lifts&&!enemies.length&&(b.missions270?.systems||[]).find(x=>x.type==='lift'&&x.room===room&&!visits.has(x.id));
    if(lift&&b.missions270.stats.liftTrips>visits.size)visits.add(lift.id);
    let target=room>=3?b.exit:focus?focus.pos:pickup?pickup.pos:panel?panel.pos:lift?lift.pos:b.terminals[room];
    if(!enemies.length&&pickup)target=pickup.pos;else if(!enemies.length&&panel)target=panel.pos;
    if(lift&&visits.has(lift.id)&&target===lift.pos)target=b.terminals[room];
    stalled=previous&&dist(previous,b.pos)<.002?stalled+1/60:0;previous=b.pos.slice();
    if(!route.length||stalled>.7||!goal||dist(goal,target)>2){route=q.path(b,b.pos,target);goal=target.slice();stalled=0;}
    while(route.length&&(dist(route[0],b.pos)<.08||dist(route[0],b.pos)<.52&&route.length>1&&q.line(b,b.pos,route[1],.68,true)&&!risk(route[1])))route.shift();
    const next=route[0]||target,speed=boost&&b.energy>4?10.5:6.5,delta=Math.max(dist(next,b.pos),speed/60,.001);
    let dx=(next[0]-b.pos[0])/delta,dz=(next[2]-b.pos[2])/delta;
    if(visible.length&&dist(focus.pos,b.pos)<25) {
      const d=Math.max(.1,dist(focus.pos,b.pos)),ux=(focus.pos[0]-b.pos[0])/d,uz=(focus.pos[2]-b.pos[2])/d;
      const range=focus.missions270?.kind==='mech'?14:12,radial=clamp((d-range)/4,-1.3,1),wanted=[ux*radial-uz*.9,uz*radial+ux*.9];
      let best=-Infinity;
      for(let i=0;i<24;i++){
        const angle=i/24*Math.PI*2,x=Math.cos(angle),z=Math.sin(angle),to=[b.pos[0]+x*2.6,0,b.pos[2]+z*2.6];
        if(!q.line(b,b.pos,to,.72))continue;
        let value=x*wanted[0]+z*wanted[1]-risk(to);
        if(!e.boardLOS(to,focus.pos,.1))value-=2;
        for(const enemy of visible){value-=Math.max(0,5-dist(to,enemy.pos))*.8;
          // Only visible active lasers and physical projectiles are observed.
          for(const beam of enemy.missions270?.beams||[])if(beam.active)value-=Math.max(0,2-segment(to,beam.origin,beam.to))*4;
        }
        for(const shot of b.hostile){if(dist(shot.pos,b.pos)>10)continue;const end=[shot.pos[0]+shot.vel[0]*.35,0,shot.pos[2]+shot.vel[2]*.35];value-=Math.max(0,1.2-segment(to,shot.pos,end))*.6;}
        if(value>best){best=value;dx=x;dz=z;}
      }
    }
    if(!enemies.length&&panel&&dist(b.pos,panel.pos)<1.5){dx=0;dz=0;}
    if(lift&&target===lift.pos&&dist(b.pos,lift.pos)<1.35){dx=0;dz=0;}
    let aim;if(visible.length){const prev=seen.get(focus.id),lead=Math.min(.32,dist(focus.pos,b.pos)/54),vx=prev?(focus.pos[0]-prev[0])*60:0,vz=prev?(focus.pos[2]-prev[2])*60:0;
      aim=[focus.pos[0]+vx*lead,0,focus.pos[2]+vz*lead];}
    for(const x of enemies)seen.set(x.id,x.pos.slice());
    const close=visible.filter(x=>dist(x.pos,b.pos)<8.5),pulse=b.pulseCooldown<=0&&close.length>0;
    let control={moveX:dx,moveZ:dz,boost,fire:true,aim,pulse};
    if(reaction){reactClock-=1/60;if(reactClock>0)control=lastInput;else{lastInput=control;reactClock=reaction;}}
    if(!mobile)return control;
    h.arcade.engine=e;h.arcade.joystick={x:control.moveX,y:control.moveZ};h.arcade.firePointer=1;h.arcade.boardAim=control.aim;h.arcade.pulseQueued=control.pulse;
    boost?h.arcade.keys.add('TouchBoost'):h.arcade.keys.delete('TouchBoost');return q.input();
  };
}
 const api={createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CITADEL_QA_BASE270=api;
})(typeof globalThis!=='undefined'?globalThis:this);
