#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
(async()=>{
 const entry=entrySnapshot(),file='assets/citadel-presentation-v2.5.0.js';
 if(!entry.sources.has(file)){entry.scripts.push(file);entry.sources.set(file,fs.readFileSync(file,'utf8'));}
 const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;
 const api=h.c.CITADEL_PRESENTATION,rows=[];
 for(let n=1;n<=14;n++){
  const e=new h.Engine(417147);h.arcade.engine=e;e.beginStage(Math.min(3,Math.floor((n-1)/3)));
  if(n===14){e.beginFinale();e.beginMRG();}
  else if(n===13){e.beginFinale();e.beginLair();}
  else if(n===12){e.beginFinale();e.launchFinale();}
  else if([3,6,9].includes(n)){e.status='stageclear';e.upgradeChoice='weapons';e.beginEscort();e.launch();}
  else if([2,5,8,11].includes(n))e.beginBoarding();else e.launch();
  const before=h.pack(e),emitter=e.emit,m=api.model(e);assert.equal(m.number,n);
  const get=id=>h.c.document.getElementById(id),button=get('test-pulse'),help=get('test-help');
  get('arcade-screen').querySelector=()=>({querySelector:()=>button});
  get('arcade-layout').querySelector=()=>help;
  api.refresh();
  assert.equal(get('citadel-primary').dataset.action,'citadel-guidance');
  assert.equal(button.hidden,[3,6,9].includes(n));
  assert.equal(m.pulseName,n===14?'ЩИТ':[3,6,9].includes(n)?'ПРИКРЫТИЕ':'ИМПУЛЬС');
  assert.equal(get('citadel-objective-phase').textContent,'УРОВЕНЬ '+String(n).padStart(2,'0')+' / 14');
  assert.deepEqual(h.pack(e),before,'Presentation must not change the game or save');
  assert.equal(e.emit,emitter);assert(!help.textContent.includes('после отпускания'));
  e.pause();api.refresh();assert(button.disabled);e.resume();
  const target=e.status==='boarding'?e.board:e.player;
  target.pulseCooldown=3.2;api.refresh();assert(button.disabled);assert.match(button.textContent,/4 с/);
  rows.push({level:n,phase:e.finale?.phase||e.phase,defense:m.pulseName,guide:m.guideName,pass:true});
 }
 const wrapper=h.run('updateArcadeHUD');h.run(fs.readFileSync(file,'utf8'));assert.equal(h.run('updateArcadeHUD'),wrapper,'Repeated installation is a no-op');
 const result={method:'DOM contract simulation and pure presentation model. Initial-level fixtures, not campaign completion, CSS layout, touch or browser evidence.',pass:true,levels:rows,idempotent:true};
 fs.writeFileSync('tests/qa-2.5.0/presentation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
