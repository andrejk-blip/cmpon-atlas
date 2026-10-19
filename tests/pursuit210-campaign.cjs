#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {play}=require('./campaign-playthrough-1.9.1.cjs');
(async()=>{
 const calm=process.argv.includes('--calm'),mode=calm?'calm':'normal',out=path.join(__dirname,'qa-2.1.0');let saved=false,inspection=null;
 const r=await play(calm,417147,{observe({h,e,id}){
  if(id===4&&!saved){fs.writeFileSync(path.join(out,'checkpoint-'+mode+'-4.json'),JSON.stringify(h.pack(e))+'\n');saved=true;}
  if(id===4)inspection=h.c.CITADEL_PURSUIT.inspection(e);
 }});r.pursuit=inspection;fs.writeFileSync(path.join(out,'campaign-'+mode+'.json'),JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({pass:r.pass,mode,levels:r.levels.length,cards:r.cards.length,seconds:r.simulatedSeconds,pursuit:inspection?.clock,error:r.error}));assert(r.pass,r.error?.message);
})().catch(e=>{console.error(e);process.exitCode=1;});
