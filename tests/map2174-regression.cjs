'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/citadel-map-v2.17.4.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/citadel-map-v2.17.4.css'),'utf8');
function fixture(){
 const requests=[],forwarded=[],focused=[];
 const engine={status:'paused',score:421,campaign2120:{modal:{type:'document'},completed:['orbit1','base1'],document:{goal:'Готовая цель',scope:'Границы'},changed:'scope',answers:{orbit1:1}}};
 const oldHTML='<section class="xp-desk visual-document"><header>Результат главы</header><div class="document-atlas" role="img"><div class="atlas-art"></div><svg class="atlas-trail2150"></svg><div class="atlas-landmark2150">old castle</div></div><div class="chapter-stamps">✓</div><footer><button data-action="campaign-modal-close">Продолжить</button></footer></section>';
 class Image{set src(value){this._src=value;requests.push(this);}get src(){return this._src;}}
 const c={Image,ARCADE:{engine,overlayToken:'unchanged'},CITADEL_CAMPAIGN:{active:e=>!!e?.campaign2120,state:e=>e.campaign2120},document:{querySelector:q=>({focus:()=>focused.push(q)})},arcadeOverlayHTML:()=>oldHTML,arcadeAction:(...args)=>{forwarded.push(args);return 'legacy';},updateArcadeOverlay:()=>{}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,engine,requests,forwarded,focused,oldHTML,render:()=>c.arcadeOverlayHTML(),action:(...args)=>c.arcadeAction(...args),ready(){requests.slice(-2).forEach(x=>x.onload());}};
}
const cases=[
 ['map assets are lazy and warmed once; loading keeps the original picture',()=>{const h=fixture();assert.equal(h.requests.length,0);const html=h.render();assert.equal(h.requests.length,2);assert(html.includes('map2174-static'));h.render();assert.equal(h.requests.length,2);h.ready();assert(h.render().includes('map2174-art'));assert(!h.render().includes('atlas-landmark2150'));}],
 ['selection and motion never mutate earned progress, answers or score',()=>{const h=fixture();h.render();h.ready();const before=JSON.stringify(h.engine);for(const id of ['goal','scope','terms','links','acceptance']){h.action('map2174-select',id);assert(h.render().includes('data-selected="'+id+'"'));}h.action('map2174-motion');assert(h.render().includes('data-motion="off"'));assert.equal(JSON.stringify(h.engine),before);assert.equal(h.forwarded.length,0);assert(h.focused.length>=6);}],
 ['unearned regions remain unearned when selected',()=>{const h=fixture();h.render();h.ready();h.action('map2174-select','acceptance');assert(h.render().includes('Раздел предстоит собрать'));assert.equal(h.engine.campaign2120.document.acceptance,undefined);}],
 ['repeated rendering is stable and includes independently articulated original parts',()=>{const h=fixture();h.render();h.ready();assert.equal(h.render(),h.render());for(const part of ['woman-head','woman-arm','man-head','telescope','dish','papers'])assert(h.render().includes('map2174-'+part),part);assert(!h.render().includes('<animate'));}],
 ['outside the document view all legacy actions and markup pass through',()=>{const h=fixture();h.engine.campaign2120.modal=null;h.engine.status='playing';assert.equal(h.render(),h.oldHTML);assert.equal(h.requests.length,0);assert.equal(h.action('map2174-select','terms'),'legacy');assert.equal(h.action('arcade-resume'),'legacy');}],
 ['unknown actions and invalid region IDs pass through without injecting markup',()=>{const h=fixture();h.render();assert.equal(h.action('map2174-future','x'),'legacy');const before=h.render();h.action('map2174-select','<script>alert(1)</script>');assert.equal(h.render(),before);assert(!h.render().includes('<script>'));}],
 ['asset failure preserves the map and supports one bounded retry',()=>{const h=fixture();h.render();h.requests[1].onerror();assert.equal(h.c.CITADEL_LIVING_MAP.assetStatus(),'error');assert(h.render().includes('Карта доступна без движения'));assert(h.render().includes('map2174-static'));h.action('map2174-retry');h.render();assert.equal(h.requests.length,4);h.ready();assert.equal(h.c.CITADEL_LIVING_MAP.assetStatus(),'ready');}],
 ['duplicate bootstrap is harmless and the reduced-motion rule stops every layer',()=>{const h=fixture();const api=h.c.CITADEL_LIVING_MAP;vm.runInContext(source,h.c);assert.equal(h.c.CITADEL_LIVING_MAP,api);assert(css.includes('@media(prefers-reduced-motion:reduce)'));assert(/\.map2174-art \*\{animation:none!important/.test(css));assert(css.includes('[data-motion=off]'));}]
];
let failed=0;for(const [name,test]of cases){try{test();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}if(failed)process.exitCode=1;
