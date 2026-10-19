#!/usr/bin/env node
'use strict';
// Captures synthetic checkpoints reached through real campaign inputs. The
// optional --paced run waits 16 ms per step; it is a VM soak, not browser FPS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {play}=require('./campaign-playthrough-1.9.1.cjs');
const calm=process.argv.includes('--calm'),paced=process.argv.includes('--paced'),mode=calm?'calm':'normal';
const out=path.join(__dirname,'qa-2.0.0'),seen=new Set(),crew=[],samples=[];fs.mkdirSync(out,{recursive:true});
let emit,lastEngine,changes=0,initialListeners,wall=Date.now(),lastBase;
(async()=>{
 const result=await play(calm,417147,{sound:true,pace:paced?()=>new Promise(r=>setTimeout(r,16)):undefined,observe({h,e,frame,id}){
  if(frame<10||lastEngine!==e){emit=e.emit;lastEngine=e;}else if(emit!==e.emit){changes++;emit=e.emit;}
  if(frame%1800===0){if(global.gc)global.gc();const listeners=[...h.handlers.values(),...h.windowHandlers.values()].reduce((n,a)=>n+a.length,0);
   if(initialListeners===undefined)initialListeners=listeners;assert.equal(listeners,initialListeners);
   samples.push({wallSeconds:Math.round((Date.now()-wall)/1000),frame,level:id,heap:process.memoryUsage().heapUsed,listeners,emitChanges:changes});
   fs.writeFileSync('/tmp/base2-'+mode+'-progress.json',JSON.stringify(samples.at(-1)));}
  if([2,5,8,11,13].includes(id)&&e.status==='boarding'&&!seen.has(id)){
   seen.add(id);lastBase={level:id,board:e.board,ids:new Set(e.board.enemies.map(x=>x.id)),initialHealth:e.board.enemies.map(x=>({id:x.id,room:x.duty.room,role:x.archetype,hp:x.hp}))};crew.push(lastBase);
   if(!paced)fs.writeFileSync(path.join(out,'checkpoint-'+mode+'-'+id+'.json'),JSON.stringify(h.pack(e))+'\n');
  }
  if(lastBase&&id===lastBase.level&&e.board===lastBase.board){
   for(const x of e.board.enemies)assert(lastBase.ids.has(x.id),'No encounter spawns after landing');
   lastBase.remaining=e.board.enemies.length;
  }
 }});
 assert(result.pass,result.error?.message);assert.equal(changes,0);
 const summary={...result,wallSeconds:Math.round((Date.now()-wall)/1000),paced,pacingMs:paced?16:0,emitChanges:changes,samples,
  crews:crew.map(x=>({level:x.level,initialCrew:x.ids.size,health:x.initialHealth,stats:x.board.baseOps,
   recoveries:x.board.decks.recovered,remaining:x.remaining})),
  environment:'Node VM, all 14 levels with ordinary input. No browser/render/audio-device claim.'};
 fs.writeFileSync(path.join(out,(paced?'wall-soak-':'campaign-')+mode+'.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({mode,paced,pass:result.pass,wallSeconds:summary.wallSeconds,simulatedSeconds:result.simulatedSeconds,levels:result.levels.length,cards:result.cards.length,emitChanges:changes}));
})().catch(error=>{console.error(error);process.exitCode=1;});
