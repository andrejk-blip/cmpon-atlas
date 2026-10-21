#!/usr/bin/env node
'use strict';
// Isolated final-boss fixture. Only normal controls after the fixture's beginMRG.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {createMrgController}=require('./helpers/campaign-inputs.js');
(async()=>{const entry=entrySnapshot(),h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');const runs=[];
for(const assist of [false,true])for(const strategy of ['reactive','paced-0.35','no-move','core-only']){
 const e=new h.Engine(417147,()=>{});e.assist=assist;e.upgrades={weapons:2,armor:1,rockets:0};e.beginStage(3);e.beginFinale();e.beginMRG();h.arcade.engine=e;
 const pilot=createMrgController();let input={},at=-1,minHP=100,hits=0,lastHP=100,frames=0,peak=0;
 for(;frames<60*240&&e.finale.phase==='mrg'&&e.status==='boarding';frames++){
  if(strategy==='core-only')input={fire:true,aim:e.finale.mrg.pos.slice()};
  else if(strategy!=='paced-0.35'||e.finale.time-at>=.35){input=pilot(e);at=e.finale.time;if(strategy==='no-move')input={...input,moveX:0,moveZ:0,jump:false};}
  e.step(1/60,input);if(e.board.hp<lastHP-.001)hits++;lastHP=e.board.hp;minHP=Math.min(minHP,lastHP);peak=Math.max(peak,e.board.enemies.filter(x=>!x.dead&&x.hp>0).length);
 }
 runs.push({mode:assist?'calm':'normal',strategy,passed:e.finale.phase==='upload'||e.status==='won',status:e.status,phase:e.finale.phase,seconds:frames/60,minHP,hits,peakEnemies:peak,coreHP:e.finale.mrg.hp,wave:e.finale.waveIndex,soldiersRemaining:e.board.enemies.filter(x=>!x.dead&&x.hp>0).map(x=>({hp:x.hp,role:x.role})),position:e.board.pos});
}
fs.writeFileSync('tests/qa-2.5.0/verifier-mrg-strategies.json',JSON.stringify({method:'Node VM/current index; direct beginMRG fixture with legal 2 weapons/1 armour build; no HP, ammo or victory writes after initialization.',runs},null,2)+'\n');console.log(JSON.stringify(runs,null,2));
})();
