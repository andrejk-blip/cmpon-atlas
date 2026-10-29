'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./touch-input-regression.cjs');
const root=path.resolve(__dirname,'..'),rows=[];
function setup(){
  const f=fixture(path.join(root,'assets/atlas-v1.3.6.js'),{patch:false,kind:'space',width:780,height:430});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/citadel-input-v2.6.0.js'),'utf8'),f.c);
  f.api=f.methods();f.input=()=>f.api.input();
  f.button=(action,id=action)=>{const b=f.doc.getElementById(id);b.dataset={action};b.closest=s=>s==='.arcade-touch-actions [data-action]'?b:null;return b;};
  return f;
}
function test(name,fn){try{fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}}
test('Rocket fires at contact even when thumb slides outside before release',()=>{
  const f=setup(),b=f.button('arcade-missile');f.dispatch(b,'pointerdown',{pointerId:81});assert(f.input().missile);
  f.dispatch(b,'pointermove',{pointerId:81,clientX:999});assert(!f.input().missile);
  f.dispatch(f.doc,'pointerup',{pointerId:81,clientX:999});assert(!b.classList.contains('is-held'));
  assert(!f.input().missile);
});
test('Compatibility click is suppressed; keyboard click is not',()=>{
  const f=setup(),b=f.button('arcade-missile');f.dispatch(b,'pointerdown',{pointerId:82});assert(f.input().missile);
  f.dispatch(b,'pointerup',{pointerId:82});const synthetic=f.dispatch(b,'click',{pointerType:'touch',detail:1});assert(synthetic.defaultPrevented);assert(!f.input().missile);
  const keyboard=f.dispatch(b,'click',{pointerType:'',detail:0});assert(!keyboard.defaultPrevented);
});
test('Fire, joystick and rocket keep three independent fingers',()=>{
  const f=setup(),b=f.button('arcade-missile'),stick=f.doc.getElementById('arcade-stick'),fire=f.doc.getElementById('arcade-fire-touch');
  stick.closest=s=>s==='#arcade-stick'?stick:null;
  f.dispatch(stick,'pointerdown',{pointerId:11,clientX:95,clientY:f.rect.height+158});
  const steering=f.input().turn;assert(steering!==0);
  f.dispatch(fire,'pointerdown',{pointerId:12});f.dispatch(b,'pointerdown',{pointerId:13});
  let i=f.input();assert(i.fire&&i.missile);assert.equal(i.turn,steering);
  f.dispatch(stick,'pointerdown',{pointerId:14,clientX:0});assert.equal(f.arcade.drag,11);
  f.dispatch(b,'pointerup',{pointerId:13});i=f.input();assert(i.fire&&!i.missile);
  f.dispatch(f.doc,'pointerup',{pointerId:12});assert(!f.input().fire);
});
test('Newly inserted convoy cover is bound without another mount',()=>{
  const f=setup(),cover=f.button('arcade-pulse','convoy240-cover-touch');
  f.dispatch(cover,'pointerdown',{pointerId:90});assert(f.input().pulse);assert(!f.input().pulse);
  f.dispatch(cover,'pointercancel',{pointerId:90});assert(!cover.classList.contains('is-held'));
});
test('Pause, disabled buttons and hidden tab cannot queue actions',()=>{
  const f=setup(),b=f.button('arcade-missile');b.disabled=true;f.dispatch(b,'pointerdown',{pointerId:1});assert(!f.input().missile);
  b.disabled=false;f.e.pause();f.dispatch(b,'pointerdown',{pointerId:2});assert(!f.input().missile);
  f.e.resume();f.doc.hidden=true;f.dispatch(b,'pointerdown',{pointerId:3});assert(!f.input().missile);
});
test('Blur and orientation release action/fire/steering without stuck controls',()=>{
  for(const event of ['blur','orientationchange'])for(const action of ['arcade-missile','arcade-pulse','arcade-flip']){
    const f=setup(),b=f.button(action),fire=f.doc.getElementById('arcade-fire-touch');
    f.dispatch(fire,'pointerdown',{pointerId:12});f.dispatch(b,'pointerdown',{pointerId:13});f.dispatch(f.c,event);
    const i=f.input();assert(!i.fire&&!i.missile&&!i.pulse&&!i.flip);assert(!b.classList.contains('is-held'));assert.equal(f.arcade.drag,null);
  }
});
test('Rocket hint appears only in live escort with ammunition, and expires',()=>{
  const f=setup();vm.runInContext(fs.readFileSync(path.join(root,'assets/citadel-mobile-v2.7.0.js'),'utf8'),f.c);
  const hint=f.c.CITADEL_MOBILE270.rocketHint,e={phase:'escort',status:'playing',escort:{time:1},player:{missiles:4}};
  assert(hint(e).includes('РАКЕТА'));e.status='paused';assert(!hint(e));e.status='playing';e.player.missiles=0;assert(!hint(e));
  e.player.missiles=4;e.escort.time=20;assert(!hint(e));
});
const report={method:'Node VM with real input handlers and modeled capture/bubble events; not a physical touchscreen test.',passed:rows.filter(r=>r.pass).length,total:rows.length,rows};
fs.mkdirSync(path.join(__dirname,'qa-2.8.0'),{recursive:true});fs.writeFileSync(path.join(__dirname,'qa-2.8.0/input.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
