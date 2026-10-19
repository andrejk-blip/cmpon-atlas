'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {entrySnapshot,entryHarness}=require('./mission-integration-regression-1.9.1.cjs');
const {fixture,pilot}=require('./convoy240-agent9.cjs');
// Same independent movement/target policy. E is issued on the already visible
// attack, instead of waiting until four projectiles have almost expired.
// This transforms ONLY the test operator, never the production source.
const source=pilot.toString(),needle='(inDanger||e.hostile.filter(x=>x.ally!==-1&&x.life<4).length>=4)';
assert(source.includes(needle),'Independent operator changed: re-review its E policy');
const makePilot=new Function('clamp','return ('+source.replace(needle,"(inDanger||e.escort.ops240.groups.some(g=>g.state==='attack'&&g.time>.4&&g.time<1.5))")+')')((v,a,b)=>Math.max(a,Math.min(b,v)));
(async()=>{
 const entry=entrySnapshot(),rules=entry.sources.get('assets/citadel-convoy-v2.4.0.js');
 const results=[];
 for(const hz of [30,60]){
  const h=entryHarness(entry);await new Promise(setImmediate);h.cup.panel=null;h.arcade.sound=false;h.run('SPACE_AUDIO.music=false');
  const e=fixture(h,{mode:'normal',seed:417147,upgrades:{weapons:0,armor:3,rockets:0}}),op=makePilot(h,e,.45,'joystick');
  for(let i=0;i<hz*220&&e.status==='playing';i++)e.step(1/hz,op.input());
  assert.deepEqual(JSON.parse(JSON.stringify(e.upgrades)),{weapons:0,armor:3,rockets:0},'The saved build must not be changed by minimum laser effectiveness');
  const r={hz,decisionInterval:.45,mode:'normal',upgrades:e.upgrades,status:e.status,pass:e.status==='escortclear',time:+e.escort.time.toFixed(2),hp:e.player.hp,allies:e.escort.allies.map(a=>a.hp),stats:e.escort.ops240.stats,controls:op.stats(),events:e.escort.ops240.events};results.push(r);console.log(JSON.stringify({...r,events:undefined}));
 }
 const report={method:'Real production sources in Node VM, no in-memory rule patches. All-armor initial build; only ordinary commands while playing. Independent 0.45s joystick operator, one Tab per decision; E after a visible attack begins. This is not browser or human-device QA.',sourceSHA256:crypto.createHash('sha256').update(rules).digest('hex'),passed:results.filter(x=>x.pass).length,total:results.length,results};
 fs.writeFileSync('tests/qa-2.4.0/agent-level9-armor3-release.json',JSON.stringify(report,null,2)+'\n');
 // Protect both independently verified paths for this legal upgrade build.
 assert(results.every(r=>r.pass),'A proven all-armor route no longer completes');
})().catch(e=>{console.error(e);process.exitCode=1;});
