import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSceneSpots,canvasBackingSize,placeSceneLabels,overlapArea} from '../src/life/scene-layout.js';

test('Vera and Max have one task label each; absent actors keep their destination',()=>{
  const mentor={id:'mentor',primary:true},bench={id:'bench'},address={id:'respondent'};
  const current=splitSceneSpots([mentor,bench,address],['vera','max','resident-1']);
  assert.deepEqual(current.places,[address]);
  assert.strictEqual(current.actors.get('vera'),mentor);
  assert.strictEqual(current.actors.get('max'),bench);
  const withoutMax=splitSceneSpots([mentor,bench,address],['vera']);
  assert.deepEqual(withoutMax.places,[bench,address]);
  assert.equal(withoutMax.actors.size,1);
});

test('canvas physical resolution follows zoom and Retina without unbounded allocation',()=>{
  assert.deepEqual(canvasBackingSize(1.36,2),{width:2720,height:1904,scaleX:2.72,scaleY:2.72});
  assert.ok(canvasBackingSize(2,1).width>canvasBackingSize(1,1).width);
  for(const [zoom,dpr] of [[2,3],[4,4],[.6,2],[NaN,Infinity]]){
    const size=canvasBackingSize(zoom,dpr);
    assert(size.width>0&&size.height>0);
    assert(size.width*size.height<=8_000_000);
    assert(size.width<=4096);
  }
});

test('crowded yard labels avoid each other and every character silhouette',()=>{
  const people=[{x:492,y:220,width:58,height:158},{x:462,y:315,width:58,height:145},{x:560,y:130,width:62,height:180}];
  const items=[
    {id:'vera',x:521,y:214,width:82,height:32,priority:3},
    {id:'nikolay',x:491,y:309,width:102,height:32,priority:2},
    {id:'apartment',x:578,y:260,width:130,height:32,priority:1},
  ];
  const result=placeSceneLabels(items,people,{left:12,top:100,right:852,bottom:620});
  const placed=[...result.values()];
  for(let i=0;i<placed.length;i++){
    assert(placed[i].x>=12&&placed[i].y>=100);
    assert(placed[i].x+placed[i].width<=852&&placed[i].y+placed[i].height<=620);
    for(const person of people)assert.equal(overlapArea(placed[i],person),0);
    for(const other of placed.slice(i+1))assert.equal(overlapArea(placed[i],other),0);
  }
  assert.deepEqual(placeSceneLabels(items,people,{left:12,top:100,right:852,bottom:620}),result);
});

test('narrow viewport placement remains readable and inside its safe region',()=>{
  const items=[{id:'vera',x:24,y:220,width:82,height:32},{id:'address',x:350,y:238,width:130,height:32}];
  const result=placeSceneLabels(items,[],{left:12,top:100,right:378,bottom:690});
  for(const box of result.values())assert(box.x>=12&&box.x+box.width<=378&&box.y>=100&&box.y+box.height<=690);
  assert.equal(overlapArea(...result.values()),0);
});
