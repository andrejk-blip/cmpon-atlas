'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const engine=fs.readFileSync(path.join(__dirname,'../assets/atlas-metrics-v0.2.0.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../assets/atlas-site-metrics.js'),'utf8').replace(/^import .*;\n/gm,'');
const KEY='cmpon.metrics.consent.cmpon-atlas',SEEN='cmpon.metrics.prompt-seen.cmpon-atlas';
function fixture({store=new Map(),session=new Map(),blocked=false,storageFails=false,origin='https://andrejk-blip.github.io'}={}){
 const ids=new Map(),all=[],posted=[],windowListeners=new Map();let focus=null,serial=0;
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners=new Map();this.dataset={};this.isConnected=true;this.classList={toggle(){}};all.push(this);}
  set id(v){this._id=v;ids.set(v,this);}get id(){return this._id;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  prepend(node){node.parentElement=this;this.children.unshift(node);}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  removeEventListener(){}focus(){focus=this;}
  closest(selector){if(selector==='[data-metrics-settings]')return this.attrs['data-metrics-settings']!==undefined?this:this.parentElement?.closest(selector)||null;
   if(selector==='[data-action]')return this.dataset.action?this:this.parentElement?.closest(selector)||null;
   if(selector==='.metrics-privacy > div > button')return this.tagName==='button'&&this.parentElement?.tagName==='div'&&this.parentElement?.parentElement?.className==='metrics-privacy'?this:null;
   return null;}
 }
 const document=new Node('document'),body=new Node('body'),rail=new Node('div');body.append(rail);document.body=body;document.readyState='complete';document.visibilityState='visible';
 document.createElement=tag=>new Node(tag);document.getElementById=id=>ids.get(id)||null;
 document.querySelector=selector=>selector==='#site-rail .rail-bottom'?rail:null;
 document.querySelectorAll=selector=>selector==='[data-metrics-settings]'?all.filter(n=>n.attrs['data-metrics-settings']!==undefined):[];
 const storage=(map,fail=false)=>({getItem:k=>{if(fail)throw Error('blocked storage');return map.get(k)||null;},setItem:(k,v)=>{if(fail)throw Error('blocked storage');map.set(k,v);},removeItem:k=>map.delete(k)});
 const context={document,navigator:{doNotTrack:blocked?'1':'0',userAgent:'Mobile Safari',language:'ru'},innerWidth:390,location:{origin,pathname:'/cmpon-atlas/play.html',hash:'#arcade'},URL,AbortController,Date,Promise,
  localStorage:storage(store,storageFails),sessionStorage:storage(session),crypto:{randomUUID:()=>`00000000-0000-0000-0000-${String(++serial).padStart(12,'0')}`},
  setInterval(){return 1;},clearInterval(){},fetch:(...args)=>{posted.push(args);return Promise.resolve({ok:true});},
  ROUTES:[{id:'game'}],pageRoute:()=> 'game',MutationObserver:class{observe(){}},
  addEventListener(k,fn){if(!windowListeners.has(k))windowListeners.set(k,[]);windowListeners.get(k).push(fn);},removeEventListener(){}
 };context.window=context;vm.createContext(context);vm.runInContext(engine,context);vm.runInContext(source,context);
 const click=node=>{const e={target:node};for(let p=node;p;p=p.parentElement)for(const fn of p.listeners.get('click')||[])fn(e);for(const fn of document.listeners.get('click')||[])fn(e);};
 const panel=ids.get('atlas-metrics-consent'),box=panel?.children[0];
 return{context,store,session,posted,body,rail,panel,box,ids,click,get focus(){return focus;},get api(){return context.CMPON_METRICS;},
  allow(){click(box.children.at(-1).children[0]);},deny(){click(box.children.at(-1).children[1]);},close(){click(box.children[0]);},
  menu(){const b=new Node('button');b.setAttribute('data-metrics-settings','');return b;},
  storage(choice){store.set(KEY,choice);for(const fn of windowListeners.get('storage')||[])fn({key:KEY,newValue:choice});},
  escape(){const e={key:'Escape',preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const fn of document.listeners.get('keydown')||[])fn(e);return e;}
 };
}
const cases=[
 ['fresh invitation has no floating control and appears only once',()=>{const h=fixture();assert.equal(h.panel.hidden,false);assert.equal(h.store.get(SEEN),'1');assert.equal(h.body.children.filter(n=>n.tagName==='button').length,0);assert.equal(h.ids.get('atlas-metrics-settings').parentElement,h.rail);assert.equal(fixture({store:h.store}).panel.hidden,true);assert.equal(h.api.status().choice,'unset');}],
 ['allow persists and hides invitation on revisit',()=>{const h=fixture();h.allow();assert.equal(h.panel.hidden,true);assert.equal(h.api.status().choice,'allow');assert.equal(h.store.get(KEY),'allow');assert.equal(fixture({store:h.store}).panel.hidden,true);}],
 ['deny persists without enabling telemetry',()=>{const h=fixture();h.deny();assert.equal(h.panel.hidden,true);assert.equal(h.api.status().enabled,false);assert.equal(h.store.get(KEY),'deny');assert.equal(fixture({store:h.store}).panel.hidden,true);}],
 ['closing does not grant consent and does not prompt again',()=>{const h=fixture();h.close();assert.equal(h.panel.hidden,true);assert.equal(h.api.status().choice,'unset');assert.equal(h.api.status().enabled,false);assert.equal(fixture({store:h.store}).panel.hidden,true);}],
 ['inline menu can reopen settings and revoke consent',()=>{const h=fixture();h.allow();const b=h.menu();h.click(b);assert.equal(h.panel.hidden,false);assert.equal(b.getAttribute('aria-expanded'),'true');h.deny();assert.equal(h.panel.hidden,true);assert.equal(h.api.status().choice,'deny');assert.equal(h.focus,b);assert.equal(b.getAttribute('aria-expanded'),'false');}],
 ['escape closes settings without leaking into gameplay',()=>{const h=fixture(),e=h.escape();assert.equal(h.panel.hidden,true);assert.equal(e.prevented,true);assert.equal(e.stopped,true);assert.equal(h.api.status().choice,'unset');}],
 ['cross-tab consent closes auto invitation',()=>{const h=fixture();h.storage('deny');assert.equal(h.panel.hidden,true);assert.equal(h.api.status().choice,'deny');}],
 ['browser privacy blocking suppresses automatic invitation',()=>{const h=fixture({blocked:true});assert.equal(h.panel.hidden,true);assert.equal(h.api.status().enabled,false);assert.equal(h.store.has(SEEN),false);}],
 ['storage restrictions retain one-time state for current session',()=>{const h=fixture({storageFails:true});h.close();assert.equal(h.session.get(SEEN),'1');assert.equal(fixture({storageFails:true,session:h.session}).panel.hidden,true);}],
 ['local QA never enters production metrics',()=>{const h=fixture({origin:'http://terminal.local:4173'});assert.equal(h.api,undefined);assert.equal(h.panel,undefined);assert.equal(h.store.has(SEEN),false);}],
];
for(const[name,test]of cases){test();console.log('PASS '+name);}console.log(`${cases.length} metrics UI checks passed`);
