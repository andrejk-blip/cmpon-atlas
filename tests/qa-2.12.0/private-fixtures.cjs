#!/usr/bin/env node
'use strict';
// Independent fixture/serialization checks of the prepared private artifact.
// Only an in-memory export statement is inserted in the bundle's closure; the
// on-disk bundle and game functions are unchanged. Fixtures are NOT playthroughs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readEntry}=require('../release260-verifier.cjs');
const {entryHarness}=require('../mission-integration-regression-1.9.1.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 const entry=readEntry(process.argv[2]||'/workspace/sites/cmpon-release-2120/public/citadel-test/index.html');
 const key=entry.scripts.find(x=>/game-test-v2\.12\.0\.js/.test(x));assert(key);const original=entry.sources.get(key),at=original.lastIndexOf('})();');assert(at>0);
 const exports=`Object.assign(globalThis,{RequirementArcade,ARCADE,STATE,MOBILE,CUP:typeof CUP==='undefined'?undefined:CUP,arcadeAction,arcadeInput,citadelLessonCase,arcadeOverlayHTML,updateArcadeHUD,updateArcadeOverlay,arcadeEvent,cupPack,cupUnpack,spaceScene,spaceCamera,spaceDrawCPU,drawFlightHUD,drawMobileGameHUD,drawCampaignFlightHUD,drawClarityHUD,spaceProject,testCreateEngine,testLaunch,TEST,TEST_LEVELS,TEST_BUILD_VERSION,testClosePicker,testOpenPicker});\n`;
 entry.sources.set(key,original.slice(0,at)+exports+original.slice(at));
 const h=entryHarness(entry);await new Promise(setImmediate);h.arcade.fx=false;h.arcade.sound=false;
 const storageBefore=[...h.storage.entries()],api=h.c.CITADEL_CAMPAIGN,rows=[],failures=[];
 const test=(name,fn)=>{try{rows.push({name,pass:true,...fn()});console.log('PASS '+name);}catch(e){failures.push({name,error:e.message.slice(0,2000)});console.log('FAIL '+name+': '+e.message.slice(0,1200));}};
 test('version-and-memory-only',()=>{assert.equal(h.c.TEST_BUILD_VERSION,'2.12.0');assert(h.c.CITADEL_TEST_MEMORY_ONLY);assert(api);return{levels:h.c.TEST_LEVELS.length};});
 const expected=id=>({campaign:'orbit1','route-choice':'route',contradictions:'contradictions',parallax:'parallax',breach:'parallax',landing:'parallax',maze:'lair',mrg:'mrg',upload:'mrg',victory:'mrg'}[id]||(/^orbit-/.test(id)?['orbit1','pursuit','swarm','orbit4'][Number(id.at(-1))-1]:/^dock-|^deck-/.test(id)?['base1','base2','base3','base4'][Number(id.at(-1))-1]:['convoy1','route','convoy3'][Number(id.at(-1))-1]));
 for(const mode of ['training','combat','pro'])for(const level of h.c.TEST_LEVELS)test('private-'+mode+'-'+level.id,()=>{
  const e=h.c.testCreateEngine(level,417147,mode);h.arcade.engine=e;assert(api.active(e));assert.equal(e.educationMode,mode);assert(e.player.pos.every(Number.isFinite));if(e.board)assert(e.board.pos.every(Number.isFinite));
  // A dock fixture is still in its orbital docking animation before boarding.
  const want=level.kind==='dock'?['orbit1','pursuit','swarm','orbit4'][level.stage]:expected(level.id);assert.equal(api.mission(e),want,'Wrong stable mission at fixture start');
  const serialized=copy(h.pack(e));const restored=h.unpack(serialized,{seed:417147,mode:e.assist?'calm':'normal'},()=>{});assert.deepEqual(copy(h.pack(restored)),serialized);assert.equal(h.c.CITADEL_LEARNING_MODES.count(restored),h.c.CITADEL_LEARNING_MODES.count(e));
  h.arcade.engine=e;h.overlay();h.camera(e,0);h.scene(e,0,false);api.save(e,true);h.c.CITADEL_LEARNING_MODES.saveLocal(e,true);e.pause();assert.deepEqual([...h.storage.entries()],storageBefore,'Private fixture modified browser localStorage');return{mode,id:level.id,mission:api.mission(e),status:serialized.engine.status};
 });
 test('picker-close-without-launch',()=>{h.c.TEST.level=null;h.c.testOpenPicker();assert(h.nodes.get('test-picker').open);h.c.testClosePicker();assert(!h.nodes.get('test-picker').open);return{closed:true};});
 test('no-browser-persistence-or-tournament-requests',()=>{assert.deepEqual([...h.storage.entries()],storageBefore);assert(!h.fetchCalls.some(x=>['start','save','enter','me','config'].includes(x.endpoint)));return{browserStorageWrites:0,tournamentRequests:0};});
 const result={pass:!failures.length,passed:rows.length,failed:failures.length,rows,failures,bundleSha256:sha(original),entrySha256:sha(entry.html),method:'Exact prepared private artifact in Node VM; only closure references exposed to harness in memory. Synthetic fixture launches, no human/phone claim.'};fs.writeFileSync(path.join(__dirname,'private-fixtures.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({DONE:true,pass:result.pass,passed:result.passed,failed:result.failed,failures}));if(!result.pass)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
