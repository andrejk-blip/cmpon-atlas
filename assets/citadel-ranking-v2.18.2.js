/* Completed chapter checkpoints, queued per player. Ranking never blocks play. */
(()=>{
 'use strict';if(globalThis.CITADEL_RANKING)return;
 const C=CITADEL_CAMPAIGN,KEY='cmpon.citadel.ranking2182.outbox',p=RequirementArcade.prototype,oldStep=p.step;
 let outbox=[],sending=false,lastAttempt=0;
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))outbox=saved.slice(-30);}catch{}
 function persist(){try{if(!globalThis.CITADEL_TEST_MEMORY_ONLY)localStorage.setItem(KEY,JSON.stringify(outbox));}catch{}}
 const marks=new WeakMap();
 function capture(e){
  if(!C.active(e)||C.state(e).practice||!CUP.player||CUP.attached||globalThis.CITADEL_TEST_MEMORY_ONLY)return;
  const s=C.state(e),count=s.completed.length;if(!count||count===marks.get(e))return;
  const progress=count-Object.keys(s.skipped2140||{}).filter(id=>s.completed.includes(id)).length;
  const clock=Math.floor((e.elapsed||0)*1000);if(clock<Math.max(1,progress)*6000)return;
  if(!s.ranking2182)s.ranking2182={id:'exp_'+crypto.randomUUID(),owner:CUP.player.id};
  if(s.ranking2182.owner!==CUP.player.id)return;
  const payload={id:s.ranking2182.id,mode:e.educationMode||'pro',completed:s.completed.slice(),skipped:Object.keys(s.skipped2140||{}).filter(id=>s.completed.includes(id)),score:Math.max(0,Math.floor(e.score||0)),clock};
  if(!['training','combat','pro'].includes(payload.mode))return;
  marks.set(e,count);outbox=outbox.filter(x=>x.payload?.id!==payload.id);outbox.push({owner:CUP.player.id,payload});outbox=outbox.slice(-30);persist();C.save(e,true);void flush();
 }
 async function flush(){
  if(sending||globalThis.CITADEL_TEST_MEMORY_ONLY||!CUP.player)return;const owner=CUP.player.id;
  sending=true;lastAttempt=Date.now();
  try{for(const job of outbox.filter(x=>x.owner===owner)){
   try{await cupAPI('expedition',job.payload);}catch(error){
    if(error.status===401){CUP.verified=false;await cupEnsureProfile();if(CUP.player?.id!==owner)break;await cupAPI('expedition',job.payload);}else throw error;
   }
   outbox=outbox.filter(x=>x!==job);persist();
  }}catch{ /* Keep the exact checkpoint for reconnect or the next menu visit. */ }
  finally{sending=false;}
 }
 p.step=function(){const r=oldStep.apply(this,arguments);capture(this);if(outbox.length&&Date.now()-lastAttempt>30000)void flush();return r;};
 globalThis.addEventListener?.('online',()=>void flush());
 const oldAction=arcadeAction;arcadeAction=function(action,value){const r=oldAction.apply(this,arguments);capture(ARCADE.engine);if(['arcade-menu','social2182-records'].includes(action))void flush();return r;};
 Promise.resolve().then(()=>{if(ARCADE.engine?.status==='menu'&&!CUP.panel){ARCADE.overlayToken='';updateArcadeOverlay();}});
 globalThis.CITADEL_RANKING=Object.freeze({version:'2.18.2',capture,flush,pending:()=>outbox.length});
})();
