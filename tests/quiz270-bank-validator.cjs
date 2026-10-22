#!/usr/bin/env node
'use strict';
// Data-contract and real selector API checks in a Node VM. These fixtures do not
// complete missions or claim psychometric calibration; see quiz-bank.md.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'assets/citadel-quiz-bank-v2.7.0.js');
const source=fs.readFileSync(file,'utf8'),c={};vm.createContext(c);vm.runInContext(source,c,{filename:file});
const bank=c.CITADEL_QUIZ_BANK;assert(bank);assert.equal(bank.version,'2.7.0');assert.equal(bank.language,'ru');assert.equal(bank.entries.length,84);
assert(Object.isFrozen(bank));assert(Object.isFrozen(bank.entries));
const allowedTags=new Set(['BA','SA','данные','requirements','stakeholders','API','acceptance','process']);
const allowedContexts=new Set(['orbit','base','convoy','pursuit','swarm','parallax','mrg']);
const unique=new Set(),questions=new Set(),positions=[0,0,0,0],tiers={},tags={},lengths={question:[],options:[],explanation:[],hint:[]};
let strictLongest=0;
for(const q of bank.entries){
 assert(/^quiz270-\d{2}-[a-z]+$/.test(q.id),q.id);assert(!unique.has(q.id));unique.add(q.id);
 assert(Number.isInteger(q.tier)&&q.tier>=1&&q.tier<=14,q.id);tiers[q.tier]=(tiers[q.tier]||0)+1;
 assert(q.tags.length&&q.tags.every(tag=>allowedTags.has(tag)));q.tags.forEach(tag=>tags[tag]=(tags[tag]||0)+1);
 assert(q.contexts.length&&q.contexts.every(ctx=>allowedContexts.has(ctx)));
 assert.equal(q.options.length,4,q.id);assert.equal(new Set(q.options.map(x=>x.toLocaleLowerCase('ru').trim())).size,4,q.id);
 assert(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4,q.id);positions[q.correct]++;
 assert(Object.isFrozen(q)&&Object.isFrozen(q.tags)&&Object.isFrozen(q.options)&&Object.isFrozen(q.contexts),q.id);
 for(const key of ['question','explanation','hint']){
  const text=q[key];assert(typeof text==='string'&&text.trim()===text&&text.length>=15,q.id+' '+key);
  assert(!/[<>]|https?:|@[\w.-]+\./i.test(text),q.id+' unsafe/unwanted rich text');lengths[key].push(text.length);
 }
 const prompt=q.question.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu,'');assert(!questions.has(prompt),'Repeated prompt');questions.add(prompt);
 for(const text of q.options){assert(typeof text==='string'&&text.trim()===text&&(text.length>=7||/^\d+(?:[.,]\d+)?%\.$/.test(text)),q.id);assert(!/все (?:ответы|варианты)|ничего из|ни один из|https?:|[<>]/i.test(text),q.id);lengths.options.push(text.length);}
 assert(q.question.length<=150,q.id+' long question');assert(q.options.every(x=>x.length<=90),q.id+' long option');
 assert(q.explanation.length<=160,q.id+' long explanation');assert(q.hint.length<=145,q.id+' long hint');
 assert.equal((q.explanation.match(/[.!?](?:\s|$)/g)||[]).length,1,q.id+' explanation must be one sentence');
 const len=q.options.map(x=>x.length);if(len[q.correct]>Math.max(...len.filter((_,i)=>i!==q.correct)))strictLongest++;
}
for(let tier=1;tier<=14;tier++)assert.equal(tiers[tier],6);
assert(positions.every(n=>n===21));assert(strictLongest<=42,'Correct answer is too often the longest');
// These are the actual 23 existing campaign card slots, not a simulated victory.
const slots=[{level:1,context:'orbit',kind:'lesson',start:0,count:2},{level:2,context:'base',kind:'remark',start:0,count:3},{level:4,context:'pursuit',kind:'lesson',start:2,count:2},{level:5,context:'base',kind:'remark',start:3,count:3},{level:7,context:'swarm',kind:'lesson',start:4,count:2},{level:8,context:'base',kind:'remark',start:6,count:3},{level:10,context:'orbit',kind:'lesson',start:6,count:2},{level:11,context:'base',kind:'remark',start:9,count:3},{level:13,context:'base',kind:'final',start:0,count:3}];
const points=[],reachablePool=new Set();
for(const slot of slots){
 slot.tiers=Array.from({length:slot.count},(_,i)=>slot.level+(slot.context==='base'&&i===2?1:0));
 const pool=bank.entries.filter(q=>slot.tiers.includes(q.tier)&&q.contexts.includes(slot.context));slot.available=pool.length;pool.forEach(q=>reachablePool.add(q.id));
 assert.equal(slot.available,slot.context==='base'?12:6);
 for(let i=0;i<slot.count;i++)points.push({level:slot.level,context:slot.context,kind:slot.kind,index:slot.start+i,tier:slot.tiers[i]});
}
assert.equal(slots.reduce((n,x)=>n+x.count,0),23);
assert.equal(reachablePool.size,84,'All questions must have a current campaign location');
const original=bank;vm.runInContext(source,c);assert.equal(c.CITADEL_QUIZ_BANK,original,'Reload must not rebuild the bank');assert.deepEqual(Object.keys(c),['CITADEL_QUIZ_BANK'],'Data module must not mutate unrelated globals');
const boundary=bank.entries.find(q=>q.id==='quiz270-08-boundary'),numbers=boundary.options.map(s=>[...s.matchAll(/\d+/g)].map(m=>+m[0]));
const expected=[17,18,65,66];assert.equal(numbers.filter(ns=>expected.every(n=>ns.includes(n))).length,1);assert(expected.every(n=>numbers[boundary.correct].includes(n)));
const weight=bank.entries.find(q=>q.id==='quiz270-10-weight'),counts=[...weight.question.matchAll(/\d+/g)].map(m=>+m[0]);assert.deepEqual(counts,[8,10,12,30]);
const combined=(counts[0]+counts[2])/(counts[1]+counts[3])*100;assert.equal(combined,50);assert.equal(parseFloat(weight.options[weight.correct]),combined);
assert.notEqual((counts[0]/counts[1]+counts[2]/counts[3])/2*100,combined,'Numeric question must distinguish unweighted averaging');
const statistics=Object.fromEntries(Object.entries(lengths).map(([key,values])=>[key,{min:Math.min(...values),max:Math.max(...values),mean:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)}]));
async function selectorCoverage(){
 const {readEntry,lab}=require('./release260-verifier.cjs'),entryFile='tests/entry-2.7.0.html',entry=readEntry(entryFile),h=await lab(entry),api=h.c.CITADEL_LEARNING_MODES;
 assert(api&&typeof api.getCase==='function','Exact entry must load the real selection module');assert.equal(entry.sources.get('assets/citadel-quiz-bank-v2.7.0.js'),source);
 const copy=x=>JSON.parse(JSON.stringify(x)),byId=new Map(bank.entries.map(q=>[q.id,q])),rows=[],referenceIds=new Map();
 for(const mode of ['training','combat']){
  const counts=Object.fromEntries(bank.entries.map(q=>[q.id,0]));
  for(let seed=1;seed<=256;seed++){
   const e={seed,educationMode:mode,educationLegacyCases:false},fresh={...e},seen=new Set(),ids=[];let restored=null;
   for(const [position,point] of points.entries()){
    const q=api.getCase(e,point.kind,point.index),snapshot=e.quiz270.cards[point.kind+':'+point.index],original=byId.get(q.quizId);
    assert(original,'Unknown question selected');assert(!seen.has(q.quizId),'Repeated question within campaign');seen.add(q.quizId);ids.push(q.quizId);counts[q.quizId]++;
    assert.equal(snapshot.level,point.level);assert.equal(snapshot.tier,point.tier,'Wrong campaign difficulty');assert(original.contexts.includes(point.context));
    assert.equal(q.question,original.question);assert.deepEqual(copy(q.choices),copy(original.options));assert.equal(q.correct,original.correct);
    assert.deepEqual(copy(api.getCase(fresh,point.kind,point.index)),copy(q),'Same seed must reproduce selection');
    const before=JSON.stringify(e.quiz270);assert.deepEqual(copy(api.getCase(e,point.kind,point.index)),copy(q));assert.equal(JSON.stringify(e.quiz270),before,'Reopening a card must not change selected state');
    if(restored)assert.deepEqual(copy(api.getCase(restored,point.kind,point.index)),copy(q),'JSON-restored selection must continue identically');
    if(position===7)restored=copy(e);
   }
   assert.equal(seen.size,23);assert.deepEqual(copy(restored.quiz270),copy(e.quiz270));
   if(mode==='training')referenceIds.set(seed,ids);else assert.deepEqual(ids,referenceIds.get(seed),'Difficulty mode must not alter the seeded bank selection');
  }
  const unreachable=Object.entries(counts).filter(([,n])=>n===0).map(([id])=>id);assert.deepEqual(unreachable,[],'Questions unreachable through the actual API');
  rows.push({mode,seeds:256,cardsPerCampaign:23,selections:256*23,reachableQuestions:84,unreachableIds:unreachable,minSelectionsPerQuestion:Math.min(...Object.values(counts)),maxSelectionsPerQuestion:Math.max(...Object.values(counts)),counts});
 }
 return {method:'Actual CITADEL_LEARNING_MODES.getCase in the exact release entry, Node VM fixtures in campaign order; no mission completion or browser rendering claimed.',entryFile,selectionSha256:crypto.createHash('sha256').update(entry.sources.get('assets/citadel-learning-modes-v2.7.0.js')).digest('hex'),rows,deterministic:true,noRepeatedCards:true,reopenedCardsStable:true,jsonSelectionRestoreStable:true};
}
async function main(){
 const coverage=await selectorCoverage(),report={version:'2.7.0',pass:true,sha256:crypto.createHash('sha256').update(source).digest('hex'),entries:84,tiers,positions,tags,statistics,strictLongestCorrect:strictLongest,cardSlots:slots,uniqueCardCapacity:reachablePool.size,coverage,
  method:'Bank and actual selection API in Node VM; original scenarios manually reviewed against primary references. Full engine save/score/mission and browser UI checks are separate integration tests.',
  semanticReview:'Every option is an original answer alternative; topics grow from goals and measurable requirements to conflicts, data consistency, transaction boundaries and acceptance evidence.'};
 const out=path.join(__dirname,'qa-2.7.0');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'quiz-bank.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,coverage:{...coverage,rows:coverage.rows.map(({counts,...row})=>row)}},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
