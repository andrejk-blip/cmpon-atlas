const fs=require('node:fs'),assert=require('node:assert/strict');const {play}=require('./campaign-playthrough-1.9.1.cjs');const {convoyInput}=require('./helpers/convoy-inputs.js');
(async()=>{const calm=process.argv.includes('--calm'),mode=calm?'calm':'normal',saved=new Set(),convoys={};
 const r=await play(calm,417147,{flightInput({h,e,input}){return h.c.CITADEL_CONVOY.active(e)?convoyInput(h,e):input;},observe({h,e,id}){
  if([3,6,9].includes(id)){if(!saved.has(id)){fs.writeFileSync('tests/qa-2.3.0/checkpoint-'+mode+'-'+id+'.json',JSON.stringify(h.pack(e))+'\n');saved.add(id);}convoys[id]=h.c.CITADEL_CONVOY.inspection(e);}
 }});r.convoys=convoys;fs.writeFileSync('tests/qa-2.3.0/campaign-'+mode+'.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({pass:r.pass,mode,levels:r.levels.length,cards:r.cards.length,seconds:r.simulatedSeconds,error:r.error,convoys:Object.values(convoys).map(x=>({stage:x.stage,stats:x.stats,allies:x.allies}))}));assert(r.pass,r.error?.message);
})().catch(e=>{console.error(e);process.exitCode=1;});
