/* QA pilot for 2.7. Positions/velocities and own gauges only; ordinary inputs. */
(function(root){
 'use strict';
 const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
 function createController(api,{reaction=.2}={}){
  let last=-Infinity,command={};
  return e=>{
   if(!api.active(e)||e.status!=='playing')return {};
   const p=e.player,now=e.swarm.time;
   if(now>=last&&now-last<reaction)return command;last=now;
   const lead=x=>clamp(x.pos[0]+clamp(x.vel[0],-15,15)*Math.min(.8,(x.pos[1]-p.pos[1])/132),-48,48);
   const live=e.enemies.filter(x=>!x.dead&&x.pos[1]>p.pos[1]+9);
   live.sort((a,b)=>Math.abs(lead(a)-p.pos[0])+(a.mode==='dive'?-4:0)-Math.abs(lead(b)-p.pos[0])-(b.mode==='dive'?-4:0));
   const target=live[0],desired=target?lead(target):0;
   const supplies=(e.swarm.pickups||[]).filter(x=>!x.dead&&x.pos[1]<4&&x.pos[1]>-61&&
    (x.type!=='repair'||p.hp<92)).sort((a,b)=>Math.abs(a.pos[0]-p.pos[0])-Math.abs(b.pos[0]-p.pos[0]));
   const pickup=supplies.find(x=>Math.abs(x.pos[0]-p.pos[0])<32*Math.max(.2,(x.pos[1]+51)/8.5)&&
    (x.type==='repair'&&p.hp<75||x.pos[1]<-26&&Math.abs(x.pos[0]-p.pos[0])<18));
   const goal=pickup?pickup.pos[0]:desired,goalY=pickup?clamp(pickup.pos[1]-4,-56,-31):-50;
   const xs=[goal,p.pos[0],goal-10,goal+10,p.pos[0]-15,p.pos[0]+15,-47,47].map(x=>clamp(x,-49,49));
   const ys=[goalY,-56,-42,-29],threats=[...e.hostile,...e.enemies.filter(x=>x.mode==='dive'&&x.pos[1]<12)];
   let best=[goal,goalY],cost=Infinity;
   for(const x of xs)for(const y of ys){
    const dx=x-p.pos[0],dy=y-p.pos[1],length=Math.hypot(dx,dy)||1;
    let score=Math.abs(x-goal)*.6+Math.abs(y-goalY)*.25+length*.08;
    for(const shot of threats)for(const t of [.12,.28,.5,.8]){
     const travel=Math.min(length,32*t),ownX=p.pos[0]+dx/length*travel,ownY=p.pos[1]+dy/length*travel;
     const distance=Math.hypot(shot.pos[0]+shot.vel[0]*t-ownX,shot.pos[1]+shot.vel[1]*t-ownY);
     const radius=(shot.swarmDrone?shot.r+1.65:shot.r+1.65)+2.5;
     if(distance<radius)score+=(radius-distance)*(1.2-t)*180;
    }
    if(score<cost){cost=score;best=[x,y];}
   }
   // Ease into a chosen lane, so a held joystick direction does not overshoot
   // its destination during the configured observation/reaction interval.
   const dx=best[0]-p.pos[0],dy=best[1]-p.pos[1],length=Math.max(2,32*reaction,Math.hypot(dx,dy)),vx=dx/length*32,vy=dy/length*32;
   const imminent=threats.some(x=>{
    const rx=x.pos[0]-p.pos[0],ry=x.pos[1]-p.pos[1],sx=x.vel[0]-vx,sy=x.vel[1]-vy,v2=sx*sx+sy*sy;
    const t=v2?clamp(-(rx*sx+ry*sy)/v2,0,Math.max(.24,reaction+.12)):0;
    return Math.hypot(rx+sx*t,ry+sy*t)<(x.r||1)+3;
   });
   command={turn:dx/length,pitch:dy/length,fire:true,
    missile:!!target&&target.hp>35&&Math.abs(lead(target)-p.pos[0])<3,
    pulse:imminent&&p.invulnerable<.12,
    flip:imminent&&p.pulseCooldown>0&&p.invulnerable<.12};return command;
  };
 }
 const api={createController};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CITADEL_QA_SWARM270=api;
})(typeof globalThis!=='undefined'?globalThis:this);
