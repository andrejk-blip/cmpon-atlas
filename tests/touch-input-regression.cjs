#!/usr/bin/env node
'use strict';
// Real mountArcade listeners and arcadeInput on both frozen cores. The event
// fixture models capture/bubble ordering and independent pointer capture; it
// does not claim Android browser/device coverage or assign ARCADE.boardAim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHarness}=require('./mrg-regression.cjs');
const root=path.resolve(__dirname,'..'),asset=name=>path.join(root,'assets',name);
const inputPath=asset('citadel-input-v1.9.1.js');
const createCanvas=require(require.resolve('@napi-rs/canvas',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,root].filter(Boolean)})).createCanvas;
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(core,{patch=true,width=390,height=480,dpr=1,kind='mrg',assist=false}={}){
  const h=createHarness(core,asset('citadel-mrg-v1.7.0.js'),asset('citadel-mrg-view-v1.6.0.js'),createCanvas);
  const c=h.context,doc=c.document,events=new WeakMap(),captures=new Map(),rect={left:17,top:83,width,height};
  function instrument(target){
    if(events.has(target))return target;events.set(target,new Map());
    target.addEventListener=(type,fn,options=false)=>{const list=events.get(target).get(type)||[];list.push({fn,capture:options===true||!!options?.capture});events.get(target).set(type,list);};
    target.removeEventListener=(type,fn)=>{events.get(target).set(type,(events.get(target).get(type)||[]).filter(x=>x.fn!==fn));};
    target.setPointerCapture=id=>captures.set(id,target);target.hasPointerCapture=id=>captures.get(id)===target;
    target.releasePointerCapture=id=>{if(captures.get(id)!==target)return;captures.delete(id);dispatch(target,'lostpointercapture',{pointerId:id});};
    return target;
  }
  const get=doc.getElementById;doc.getElementById=id=>instrument(get(id));
  for(const target of h.nodes.values())instrument(target);instrument(doc);instrument(c);
  function dispatch(target,type,properties={}){
    const ev={type,target,currentTarget:null,pointerType:'touch',pointerId:41,button:0,isPrimary:false,clientX:rect.left+width/2,clientY:rect.top+height/2,
      defaultPrevented:false,stopped:false,immediate:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},
      stopImmediatePropagation(){this.immediate=true;this.stopped=true;},...properties};
    const route=target===doc||target===c?[[target,true],[target,false]]:[[doc,true],[target,true],[target,false],[doc,false]];
    for(const [current,capture]of route){
      if(ev.immediate)break;if(ev.stopped&&current!==target)break;ev.currentTarget=current;
      for(const entry of [...(events.get(current)?.get(type)||[])])if(entry.capture===capture){entry.fn(ev);if(ev.immediate)break;}
    }
    if(['pointerup','pointercancel'].includes(type)&&captures.has(ev.pointerId)){
      const owner=captures.get(ev.pointerId);captures.delete(ev.pointerId);dispatch(owner,'lostpointercapture',{pointerId:ev.pointerId});
    }
    return ev;
  }
  Object.assign(c,{innerWidth:width,innerHeight:height+250,devicePixelRatio:dpr,visualViewport:{height:height+250,addEventListener(){}},
    location:{href:'https://test.invalid/cmpon-atlas/#arcade',protocol:'https:',origin:'https://test.invalid',pathname:'/cmpon-atlas/',search:'',hash:'#arcade'}});
  const run=code=>vm.runInContext(code,c);
  // These are the later gameplay wrappers in the actual entry. None of them
  // provides a touch-aim route; include them to preserve their input contracts.
  for(const match of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script defer src="\.\/([^"?]+)"/g)){
    if(/\/citadel-(flight|aim|pursuit|swarm|parallax|decks)-/.test(match[1]))
      vm.runInContext(fs.readFileSync(path.join(root,match[1]),'utf8'),c,{filename:match[1]});
  }
  const loadPatch=()=>vm.runInContext(fs.readFileSync(inputPath,'utf8'),c,{filename:path.basename(inputPath)});
  if(patch===true)loadPatch();
  const methods=()=>run('({mount:mountArcade,input:arcadeInput,setup:setupArcade,clear:clearArcadeInput,event:arcadeEvent,action:arcadeAction,overlay:updateArcadeOverlay,hud:updateArcadeHUD,camera:spaceCamera,project:spaceProject,aim:citadelBoardAim,detach:detachArcade})');
  let api=methods();
  const e=new h.Engine(417147,()=>{});h.arcade.engine=e;e.start(assist);e.upgrades={weapons:0,armor:0,rockets:0};
  if(kind==='mrg'){e.beginStage(3);e.beginFinale();e.beginMRG();}
  else if(kind==='deck'){e.beginStage(1);e.beginBoarding();}
  else{e.beginStage(0);e.launch();}
  e.emit=(...args)=>api.event(...args);h.arcade.sound=false;h.arcade.fx=false;h.arcade.expanded=true;
  run('MOBILE.autoFire=false;MOBILE.menu=false;MOBILE.command=false;');
  function geometry(canvas){instrument(canvas);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.getBoundingClientRect=()=>({...rect});return canvas;}
  const canvas=geometry(doc.getElementById('arcade-canvas'));
  const stick=doc.getElementById('arcade-stick');stick.getBoundingClientRect=()=>({left:10,top:height+110,width:96,height:96});
  api.setup();api.mount();h.arcade.camera=api.camera(e,e.elapsed,false);
  if(patch==='late'){loadPatch();api=methods();}
  const point=world=>{const r=h.arcade.canvas.getBoundingClientRect(),q=api.project(world,h.arcade.camera,r.width,r.height);return {clientX:r.left+q.x,clientY:r.top+q.y};};
  const touch=(type,world,id=41,target=h.arcade.canvas)=>dispatch(target,type,{...point(world),pointerId:id});
  return {...h,c,doc,e,api,rect,events,captures,dispatch,point,touch,geometry,loadPatch,methods,
    input:()=>api.input(),step:seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)e.step(1/60,api.input());},
    count:(target,type,capture)=>events.get(target).get(type).filter(x=>x.capture===capture).length};
}
function near(actual,expected,epsilon=1e-6){assert(actual);for(let i=0;i<3;i++)assert(Math.abs(actual[i]-expected[i])<epsilon,JSON.stringify({actual,expected}));}
function isolate(e){
  e.board.invulnerable=1000;e.finale.attackClock=1000;e.finale.waveIntro=0;
  for(const key of ['tentacle','tentacles'])if(e.finale[key])Object.assign(e.finale[key],{phase:'idle',time:1000});
  const enemy=e.board.enemies[0];
  for(const x of e.board.enemies)Object.assign(x,{emergeDelay:1000,spawnTime:1000});
  for(const x of e.board.enemies.slice(1)){x.dead=true;x.hp=0;}
  Object.assign(enemy,{pos:[-17,6,0],previous:[-17,6,0],hp:100,maxHp:100,dead:false,state:'emerging'});
  return enemy;
}
function idle(f){assert.equal(f.c.CITADEL_INPUT.status().active,false);assert.equal(f.arcade.firePointer,null);assert.equal(f.arcade.boardAim,null);assert.equal(f.input().fire,false);assert.equal(f.input().aim??null,null);}

function suite(core){
  const results=[];
  function test(name,fn){try{const detail=fn();results.push({name,ok:true,...(detail?{detail}:{})});}catch(error){results.push({name,ok:false,error:error.message,stack:error.stack?.split('\n').slice(1,5)});}}
  test('Original mounted touch listeners reproduce firing with no aim point',()=>{
    const f=fixture(core,{patch:false});f.touch('pointerdown',[-17,6.65,0]);
    assert.equal(f.input().fire,true);assert.equal(f.input().aim,null);f.touch('pointermove',[-25,9,0]);assert.equal(f.input().aim,null);
    return {baseline:'Touch fires but pointerdown/move never update aim'};
  });
  test('Real pointerdown/move hits an elevated MRG soldier manually in portrait/landscape/desktop and normal/calm modes',()=>{
    const output=[];
    for(const [width,height,dpr]of [[390,480,1],[844,330,2],[1280,720,1.5]])for(const assist of [false,true]){
      const f=fixture(core,{width,height,dpr,assist}),enemy=isolate(f.e);
      f.touch('pointerdown',[-37,12,0]);near(f.input().aim,[-37,12,0]);f.step(.2);assert.equal(enemy.hp,100,'A manual miss stays a miss');
      f.touch('pointermove',[-17,6.65,0]);near(f.input().aim,[-17,6.65,0]);f.step(.36);
      assert(enemy.hp<100,'A real oblique bullet reaches the elevated soldier');
      const hp=enemy.hp;f.touch('pointerup',[-17,6.65,0]);idle(f);
      output.push({width,height,dpr,assist,hpAfterManualHit:hp});
    }return output;
  });
  test('Deck touch uses the existing ground-plane ray without selecting or following an enemy',()=>{
    const f=fixture(core,{kind:'deck'}),world=[-8,0,7];f.touch('pointerdown',world);near(f.input().aim,world);
    const point=plain(f.input().aim);for(const x of f.e.board.enemies)x.pos=[8,0,4];near(f.input().aim,point);
    f.touch('pointermove',[7,0,-3]);near(f.input().aim,[7,0,-3]);f.e.step(1/60,f.input());assert(f.e.board.bullets.length>0);
    f.touch('pointerup',[7,0,-3]);idle(f);
  });
  test('Joystick, canvas aim and fire button use independent non-primary touch pointers',()=>{
    const f=fixture(core),stick=f.doc.getElementById('arcade-stick'),fire=f.doc.getElementById('arcade-fire-touch');
    f.dispatch(stick,'pointerdown',{pointerId:11,clientX:95,clientY:f.rect.height+158});
    f.touch('pointerdown',[-17,6.65,0],12);const initial=plain(f.input());assert(initial.moveX>.5);near(initial.aim,[-17,6.65,0]);
    f.touch('pointerdown',[-37,10,0],13);assert.equal(f.arcade.firePointer,12);near(f.input().aim,[-17,6.65,0]);
    f.touch('pointerup',[-37,10,0],13);assert.equal(f.arcade.firePointer,12);
    f.dispatch(stick,'pointercancel',{pointerId:11});assert.equal(f.input().moveX,0);assert(f.input().fire);
    f.dispatch(stick,'pointerdown',{pointerId:14,clientX:95,clientY:f.rect.height+158});f.touch('pointerup',[-17,6.65,0],12);
    assert(f.input().moveX>.5);assert.equal(f.input().fire,false);assert.equal(f.arcade.boardAim,null);
    f.dispatch(fire,'pointerdown',{pointerId:15});f.touch('pointerdown',[-17,6.65,0],16);f.touch('pointercancel',[-17,6.65,0],16);
    assert(f.input().fire,'The independently held fire button keeps its ordinary behavior');
    f.dispatch(fire,'pointerup',{pointerId:15});f.dispatch(stick,'pointerup',{pointerId:14});idle(f);
  });
  test('Up, cancel, lost capture, outside release and capture-less browsers do not leave touch fire stuck',()=>{
    const f=fixture(core);
    for(const event of ['pointerup','pointercancel','lostpointercapture']){f.touch('pointerdown',[-17,6.65,0]);f.dispatch(f.arcade.canvas,event,{pointerId:41});idle(f);}
    f.arcade.canvas.setPointerCapture=undefined;f.arcade.canvas.releasePointerCapture=undefined;
    f.touch('pointerdown',[-17,6.65,0]);f.dispatch(f.doc,'pointerup',{pointerId:41});idle(f);
    for(const event of ['blur','pagehide']){if(f.e.status==='paused')f.e.resume();f.touch('pointerdown',[-17,6.65,0]);assert(f.c.CITADEL_INPUT.status().active);f.dispatch(f.c,event);idle(f);}
  });
  test('Pause, hidden page, actual terminal card and new board clear aim; old move cannot reactivate it',()=>{
    const f=fixture(core);f.touch('pointerdown',[-17,6.65,0]);f.e.pause();assert.equal(f.c.CITADEL_INPUT.status().active,false);
    f.e.resume();f.touch('pointermove',[-17,6.65,0]);idle(f);
    f.touch('pointerdown',[-17,6.65,0]);f.doc.hidden=true;f.dispatch(f.doc,'visibilitychange');f.doc.hidden=false;f.e.resume();idle(f);
    f.touch('pointerdown',[-17,6.65,0]);f.e.beginMRG();f.api.hud();idle(f);
    const deck=fixture(core,{kind:'deck'}),b=deck.e.board;
    // A cleared-room fixture allows the actual boardInteract/card path to run.
    for(const x of b.enemies){x.dead=true;x.hp=0;}for(const wave of b.decks.waves){wave.phase='done';wave.remaining=[];}
    b.pos=b.terminals[0].slice();deck.touch('pointerdown',[-8,0,7]);assert(deck.e.boardInteract());assert.equal(deck.e.status,'remark');
    assert.equal(deck.c.CITADEL_INPUT.status().active,false);assert.equal(deck.arcade.firePointer,null);assert.equal(deck.arcade.boardAim,null);
    deck.touch('pointermove',[-8,0,7]);assert.equal(deck.arcade.firePointer,null);
  });
  test('Existing canvas and remount/replacement bind once; stale canvas pointers cannot claim the new game',()=>{
    const f=fixture(core,{patch:'late'}),old=f.arcade.canvas;
    assert.equal(f.c.CITADEL_INPUT.status().boundCanvases,1);const listeners=f.count(old,'pointerdown',true);
    f.api.mount();f.loadPatch();assert.equal(f.count(old,'pointerdown',true),listeners);assert.equal(f.c.CITADEL_INPUT.status().boundCanvases,1);
    f.touch('pointerdown',[-17,6.65,0]);
    const replacement=f.geometry(f.doc.createElement('canvas'));f.nodes.set('arcade-canvas',replacement);f.api.mount();
    assert.equal(f.c.CITADEL_INPUT.status().boundCanvases,2);idle(f);
    f.dispatch(old,'pointerdown',{pointerId:45});idle(f);
    f.touch('pointerdown',[-17,6.65,0],46);near(f.input().aim,[-17,6.65,0]);f.api.detach();
    assert.equal(f.c.CITADEL_INPUT.status().active,false);assert.equal(f.arcade.firePointer,null);assert.equal(f.arcade.boardAim,null);
  });
  test('Mouse and keyboard behavior match the original; flight touches and invalid projections remain inactive',()=>{
    for(const kind of ['mrg','space']){
      const a=fixture(core,{kind}),b=fixture(core,{kind,patch:false});
      for(const f of [a,b]){
        f.e.autopilot=false;f.dispatch(f.arcade.canvas,'pointerdown',{pointerType:'mouse',pointerId:8,clientX:201,clientY:291});
        f.dispatch(f.arcade.canvas,'pointermove',{pointerType:'mouse',pointerId:8,clientX:279,clientY:171});
        f.dispatch(f.doc,'keydown',{code:'KeyD',key:'d',target:{tagName:'BODY'}});
      }
      assert.deepEqual(plain(a.input()),plain(b.input()));
      for(const f of [a,b]){f.dispatch(f.arcade.canvas,'pointerup',{pointerType:'mouse',pointerId:8});f.dispatch(f.doc,'keyup',{code:'KeyD'});}
      assert.deepEqual(plain(a.input()),plain(b.input()));
      if(kind==='space'){a.dispatch(a.arcade.canvas,'pointerdown');assert.equal(a.arcade.firePointer,null);assert.equal(a.c.CITADEL_INPUT.status().active,false);}
    }
    const f=fixture(core);f.arcade.camera=null;f.dispatch(f.arcade.canvas,'pointerdown');idle(f);
    f.arcade.camera=f.api.camera(f.e,0,false);f.rect.width=0;f.dispatch(f.arcade.canvas,'pointerdown');idle(f);
  });
  return {core:path.basename(core),coreSha256:sha(core),passed:results.filter(x=>x.ok).length,total:results.length,results};
}
function main(argv=process.argv.slice(2)){
  let report;for(let i=0;i<argv.length;i++)if(argv[i]==='--report')report=path.resolve(argv[++i]);else throw Error('Usage: touch-input-regression.cjs [--report path]');
  const results=[asset('atlas-v1.3.5.js'),path.resolve(root,'../cmpon-analytics-admin/game-lab/engine-v1.2.1.js')].map(suite);
  const output={version:'1.9.1',runtimeSha256:sha(inputPath),method:'Actual frozen cores, latest gameplay wrappers, native canvas, real installed pointer and keyboard listeners with capture/bubble event dispatch, actual arcadeInput and projectile collision. No physical Android/browser test.',results};
  if(report)fs.writeFileSync(report,JSON.stringify(output,null,2)+'\n');
  const failures=results.flatMap(r=>r.results.filter(x=>!x.ok).map(x=>({core:r.core,...x})));
  console.log(JSON.stringify({passed:results.reduce((n,r)=>n+r.passed,0),total:results.reduce((n,r)=>n+r.total,0),report,failures},null,2));
  if(failures.length)process.exitCode=1;return output;
}
if(require.main===module)main();
module.exports={fixture,suite,main};
