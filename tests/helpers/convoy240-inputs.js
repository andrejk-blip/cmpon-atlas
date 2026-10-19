/* Observable-state QA pilot: 0.4-second reaction, one target-cycle per decision.
 * Only standard fire/missile/pulse and movement inputs. No future wave data,
 * health writes, teleporting, force-clear or enemy removal.
 */
(function(root){'use strict';const memory=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function convoyInput(h,e){let m=memory.get(e);if(!m){m={at:-1,input:{},wanted:null};memory.set(e,m);}
  if(e.escort.time-m.at<.4)return m.input;m.at=e.escort.time;
  const live=e.enemies.filter(x=>!x.dead&&x.warp<=0),rank=x=>x.torpedo?0:x.role==='shield'?1:x.role==='commander'?2:x.role==='bomber'?3:x.role==='jammer'?4:5;
  const wanted=live.slice().sort((a,b)=>rank(a)-rank(b)||a.hp-b.hp)[0];
  if(wanted&&e.selectedTarget!==wanted.id)h.action('citadel-target');
  const target=e.target(),f=e.escort.ops240?.fields.find(f=>!f.passed),p=e.player;
  const travel=f?Math.max(Math.abs(f.gapX-p.pos[0]),Math.abs(f.gapY-p.pos[1]))/14:0,fieldPriority=f&&f.warning<travel+1.4;
  const goal=fieldPriority?[f.gapX,f.gapY]:target?[clamp(target.pos[0],-32,32),clamp(target.pos[1],-16,16)]:p.pos;
  const torpedoes=live.filter(x=>x.torpedo),imminent=torpedoes.some(x=>{const a=e.escort.allies[x.ally];return a&&Math.hypot(...x.pos.map((v,i)=>v-a.pos[i]))<34;});
  const attack=e.escort.ops240?.groups.some(g=>g.state==='attack'&&g.time>1.2);
  m.input={turn:clamp((goal[0]-p.pos[0])*.18,-1,1),pitch:clamp((goal[1]-p.pos[1])*.18,-1,1),fire:true,missile:!!target&&(target.role==='shield'||target.role==='commander'||target.role==='bomber')&&target.hp>100&&p.missiles>0,pulse:p.pulseCooldown<=0&&(imminent||(attack&&e.hostile.length>=5))};return m.input;
 }
 if(typeof module!=='undefined')module.exports={convoyInput};else root.CITADEL_CONVOY_INPUT=convoyInput;
})(globalThis);
