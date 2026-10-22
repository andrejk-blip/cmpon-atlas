#!/usr/bin/env node
'use strict';
// Native graphics fixture. This does not claim a campaign or browser pass.
const fs=require('node:fs'),crypto=require('node:crypto');
const {harness,install,fixture}=require('./base270-art.cjs');
(async()=>{
 const h=await harness();install(h);const e=fixture(h,4),b=e.board,mech=b.enemies.find(x=>x.missions270?.kind==='mech'),room=b.definition.rooms[0];
 // Stage the active-room machine without changing its HP or winning anything.
 mech.duty.room=0;mech.pos=[room.center[0],0,room.center[2]-8];b.pos=[mech.pos[0],0,mech.pos[2]+16];b.camera=[mech.pos[0],0,mech.pos[2]+7];
 for(let i=0;i<200&&!mech.missions270.beams.length;i++)e.step(1/60,{});
 if(!mech.missions270.beams.length)throw Error('Ordinary mech AI must produce a live laser');
 h.arcade.canvas.width=1280;h.arcade.canvas.height=720;h.arcade.canvas.getBoundingClientRect=()=>({width:1280,height:720});h.arcade.renderer={gl:{}};
 const items=h.run('spaceScene')(e,e.elapsed,true),camera=h.run('spaceCamera')(e,e.elapsed),meshes={};for(const item of items)meshes[item.mesh]=h.run('SPACE_MESH')[item.mesh];
 const files=[...h.artSources].filter(([file])=>/base-missions/.test(file)).map(([file,source])=>({file,sha:crypto.createHash('sha256').update(source).digest('hex')}));
 const target=process.argv[2]||'/tmp/base270-gl-scene.json';fs.writeFileSync(target,JSON.stringify({vertex:h.run('SPACE_VERTEX'),fragment:h.run('SPACE_FRAGMENT'),camera,items,meshes,files},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
 console.log(JSON.stringify({target,items:items.length,files}));
})().catch(error=>{console.error(error);process.exitCode=1;});
