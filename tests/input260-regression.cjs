#!/usr/bin/env node
'use strict';
// Actual legacy canvas handlers plus replacement input module, with capture and
// bubble dispatch. Mission entry is a fixture, never a campaign completion.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./touch-input-regression.cjs');
const root=path.resolve(__dirname,'..'),file=path.join(root,'assets/citadel-input-v2.6.0.js'),source=fs.readFileSync(file,'utf8'),rows=[];
function setup(kind='space'){
 const f=fixture(path.join(root,'assets/atlas-v1.3.6.js'),{patch:false,kind,width:1280,height:720});
 vm.runInContext(source,f.c,{filename:file});f.api=f.methods();f.input=()=>f.api.input();return f;
}
function test(name,fn){try{rows.push({name,pass:true,...fn()});}catch(e){rows.push({name,pass:false,error:e.stack});}}
function click(f){return f.dispatch(f.arcade.canvas,'mousedown',{button:2,pointerType:'mouse'});}
for(const id of [1,3,4,6,7,9,10,12,14])test('RMB routes one missile request: level '+id,()=>{
 const f=setup(id===14?'mrg':'space'),e=f.e;
 if(id!==14){e.beginStage(Math.min(3,Math.floor((id-1)/3)));if(id===12){e.beginFinale();e.launchFinale();}else if([3,6,9].includes(id)){e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();}else e.launch();}
 assert(['playing','boarding'].includes(e.status));const event=click(f);assert(event.defaultPrevented);assert(f.input().missile);assert(!f.input().missile);assert.equal(f.arcade.firePointer,null);return{level:id};
});
test('Held LMB survives RMB and fires together',()=>{const f=setup();f.dispatch(f.arcade.canvas,'pointerdown',{button:0,pointerType:'mouse',pointerId:8});click(f);let i=f.input();assert(i.fire&&i.missile);assert.equal(f.arcade.firePointer,8);i=f.input();assert(i.fire&&!i.missile);f.dispatch(f.arcade.canvas,'pointerup',{pointerType:'mouse',pointerId:8});assert(!f.input().fire);});
test('Pause, modal, navigation and blur cannot queue a future missile',()=>{
 for(const state of ['pause','modal','blur','hidden','menu','view']){const f=setup();click(f);
  if(state==='pause')f.e.pause();if(state==='modal')f.doc.getElementById('detail').open=true;
  if(state==='blur')f.dispatch(f.c,'blur');if(state==='hidden'){f.doc.hidden=true;f.dispatch(f.doc,'visibilitychange');}
  if(state==='menu')vm.runInContext('MOBILE.menu=true',f.c);if(state==='view')vm.runInContext("STATE.view='overview'",f.c);
  assert(!f.input().missile,state);click(f);assert(!f.input().missile,state+' new click');
 }
});
test('RMB aims MRG grenade without taking left pointer',()=>{const f=setup('mrg');click(f);const i=f.input();assert(i.missile);assert(Array.isArray(i.aim)&&i.aim.every(Number.isFinite));assert.equal(f.arcade.firePointer,null);});
test('Touch held fire and independent joystick remain owned',()=>{const f=setup('mrg');f.touch('pointerdown',[-10,5,0],41);assert(f.input().fire);assert(f.c.CITADEL_INPUT.status().active);click(f);assert(f.input().missile);assert(f.input().fire);f.touch('pointerup',[-10,5,0],41);assert(!f.input().fire);});
test('Repeated installation and mount do not accumulate canvas bindings',()=>{const f=setup(),before=f.count(f.arcade.canvas,'mousedown',true),input=f.methods().input;for(let i=0;i<12;i++){vm.runInContext(source,f.c);f.api.mount();}assert.equal(f.count(f.arcade.canvas,'mousedown',true),before);assert.equal(f.methods().input,input);assert.equal(f.c.CITADEL_INPUT.status().boundCanvases,1);});
const report={method:'Node VM on actual 1.3.6 engine and current module chain, real installed input handlers under capture/bubble event emulation. Not a physical mouse/Android test.',passed:rows.filter(x=>x.pass).length,total:rows.length,rows};fs.mkdirSync(path.join(__dirname,'qa-2.6.0'),{recursive:true});fs.writeFileSync(path.join(__dirname,'qa-2.6.0/input.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
