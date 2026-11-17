import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENE_SIZE,cameraViewport,cameraFitZoom,avoidCameraOccluder,clampCameraPan,fitCamera,resizeCamera,zoomCamera,cameraFocalPoint} from '../src/life/camera.js';

const near=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} ≠ ${expected}`);
function assertContained(camera){
  const {viewport:v,zoom,pan}=camera;
  assert.ok(pan.x>=v.left-1e-8&&pan.y>=v.top-1e-8);
  assert.ok(pan.x+SCENE_SIZE.width*zoom<=v.left+v.width+1e-8);
  assert.ok(pan.y+SCENE_SIZE.height*zoom<=v.top+v.height+1e-8);
}

test('whole-scene view contains all four world edges across screen shapes and HUD reservations',()=>{
  for(const [width,height] of [[1363,936],[2560,1440],[3440,1440],[390,844],[844,390],[320,568]]){
    for(const insets of [{},{top:170,bottom:190,left:12,right:64}]){
      const v=cameraViewport(width,height,insets),camera=fitCamera(v);
      assertContained(camera);
      near(camera.zoom,Math.min(v.width/1000,v.height/700));
      near(cameraFocalPoint(camera).x,500);near(cameraFocalPoint(camera).y,350);
    }
  }
});

test('zoom starts from fit, is monotone on very large and small displays, and returns exactly to fit',()=>{
  for(const [width,height] of [[3440,2160],[390,844]]){
    const initial=fitCamera(cameraViewport(width,height)),minimum=initial.zoom;
    let camera=zoomCamera(initial,1.2);assert.ok(camera.zoom>minimum);
    for(let i=0;i<30;i++)camera=zoomCamera(camera,1.2);
    near(camera.zoom,minimum*3);
    camera=zoomCamera(camera,1e-10);assert.deepEqual(camera,initial);assertContained(camera);
    assert.deepEqual(zoomCamera(camera,1/1.2),initial);
  }
});

test('resize retains whole-scene mode and recentres every edge in the changed safe region',()=>{
  let camera=fitCamera(cameraViewport(1363,936,{top:180,bottom:180,right:74}));
  for(const v of [cameraViewport(390,844,{top:150,bottom:240,right:60}),cameraViewport(1920,1080,{top:180,bottom:180})]){
    camera=resizeCamera(camera,v);assertContained(camera);near(camera.zoom,cameraFitZoom(v));
  }
});

test('corner labels do not needlessly shrink the entire picture into their vertical gap',()=>{
  const desktop=cameraViewport(1363,936,{top:108,bottom:178,right:78,left:12});
  const label={left:20,right:248,top:118,bottom:200};
  const safe=avoidCameraOccluder(desktop,label),picture=fitCamera(safe);
  assertContained(picture);
  assert.ok(picture.pan.x>=label.right||picture.pan.y>=label.bottom);
  assert.ok(picture.zoom>cameraFitZoom(cameraViewport(1363,936,{top:200,bottom:178,right:78,left:12})));
  const narrow=cameraViewport(390,844,{top:142,bottom:242,right:58,left:12});
  assert.deepEqual(avoidCameraOccluder(narrow,{left:4,right:190,top:88,bottom:150}),narrow);
});

test('resizing a panned close-up preserves relative zoom and the central world point',()=>{
  const initial=zoomCamera(fitCamera(cameraViewport(1363,936,{top:180,bottom:180,right:74})),2.4);
  initial.pan=clampCameraPan({x:initial.pan.x-50,y:initial.pan.y+25},initial.zoom,initial.viewport);
  const focal=cameraFocalPoint(initial),next=resizeCamera(initial,cameraViewport(1500,1000,{top:190,bottom:180,right:74}));
  near(next.zoom/cameraFitZoom(next.viewport),2.4);
  near(cameraFocalPoint(next).x,focal.x);near(cameraFocalPoint(next).y,focal.y);
  const enlarged=zoomCamera(next,1.1);near(cameraFocalPoint(enlarged).x,focal.x);near(cameraFocalPoint(enlarged).y,focal.y);
});

test('edge clamps and invalid geometry never expose empty areas inside a zoomed viewport',()=>{
  const v=cameraViewport(800,600,{top:100,bottom:100,right:60}),camera=zoomCamera(fitCamera(v),3);
  for(const target of [{x:1e9,y:1e9},{x:-1e9,y:-1e9}]){
    const p=clampCameraPan(target,camera.zoom,v);
    assert.ok(p.x<=v.left&&p.y<=v.top);
    assert.ok(p.x+1000*camera.zoom>=v.left+v.width);
    assert.ok(p.y+700*camera.zoom>=v.top+v.height);
  }
  assert.deepEqual(zoomCamera(camera,NaN),camera);
  const tiny=cameraViewport(0,0,{top:1000,bottom:1000,left:1000,right:1000});
  assert.ok(tiny.width>0&&tiny.height>0);assertContained(fitCamera(tiny));
});
