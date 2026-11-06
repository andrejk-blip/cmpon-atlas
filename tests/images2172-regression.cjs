'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/citadel-collection-v2.17.0.js'), 'utf8');

function fixture({saveData = false} = {}) {
  const requests = [], overlay = {classList: {toggle() {}}};
  const cards = ['hero','robodog','scout','shield','sniper','hunter','relay','rocketeer','ninja','mech','hammer','tentacle','maw','mantis','medusa','parallax','mrg'];
  const comics = ['departure','first_archive','rift','beacons','breakthrough','accord','final'];
  const profile = {schema:1,cards:Object.fromEntries(cards.map(id=>[id,true])),comics:Object.fromEntries(comics.map(id=>[id,true])),achievements:{}};
  const engine = {status:'menu',score:41};
  let html = '', saves = 0;
  class Engine {start() {} step() {}}
  class Image {
    set src(value) {this._src=value;requests.push(this);}
    get src() {return this._src;}
    load() {this.onload();}
    fail() {this.onerror();}
  }
  const c = {
    Image, navigator:{connection:{saveData}},setTimeout:()=>1,clearTimeout(){},
    RequirementArcade:Engine, ARCADE:{engine,canvas:{focus(){}}},
    CITADEL_CAMPAIGN:{active:e=>!!e.campaign2120,state:e=>e.campaign2120,read:()=>null,save:()=>saves++,title:id=>id},
    CITADEL_LEARNING_MODES:{preferred:'combat',modes:['training','combat','pro'],labels:{training:'Учебный',combat:'Боевой',pro:'Кейсы'}},
    CITADEL_STORY:{status:()=>({active:false}),close(){}},
    localStorage:{getItem:()=>JSON.stringify(profile),setItem(){}},
    document:{getElementById:()=>overlay},
    clearArcadeInput(){},updateArcadeHUD(){},arcadeAction(){},cupUnpack:()=>engine,
    arcadeOverlayHTML:()=>'<section>Previous overlay</section>',
    updateArcadeOverlay(){html=c.arcadeOverlayHTML();},
    esc:value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    addEventListener(){}
  };
  vm.createContext(c);vm.runInContext(source,c);
  return {c,requests,engine,get saves(){return saves;},get html(){return html;},render(){c.updateArcadeOverlay();return html;},action(...args){c.arcadeAction(...args);return html;}};
}

const cases = [
  ['ordinary Atlas does not preload the game; the lobby warms only the first sheet and renders a responsive character scene',()=>{
    const h=fixture();assert.equal(h.requests.length,0);
    h.render();assert.deepEqual(h.requests.map(x=>x.src),['./assets/comics2170/departure.webp']);
    assert.equal(h.requests[0].fetchPriority,'high');
    assert(h.html.includes('srcset="./assets/scene2173/characters-small-r2.webp 640w, ./assets/scene2173/characters-r2.webp 1280w"'));
    assert(h.html.includes('sizes="(max-width: 700px) 100vw, 65vw"'));
    assert(h.html.includes('class="menu2173-scene"'));
    assert(!h.html.includes('menu2173-portrait'));
    h.render();assert.equal(h.requests.length,1,'Repeated menu renders must not repeat requests');
  }],
  ['save-data mode does not prefetch additional character artwork',()=>{
    const h=fixture({saveData:true});h.render();assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].src,'./assets/comics2170/departure.webp');
  }],
  ['gallery uses six thumbnails with one eager first image and native lazy loading for the rest',()=>{
    const h=fixture();h.action('collection2170-open','cards');
    const images=h.html.match(/<img\b[^>]+>/g);assert.equal(images.length,6);
    assert(images.every(tag=>tag.includes('/thumbs/')));assert.equal(images.filter(tag=>tag.includes('loading="eager"')).length,1);
    assert.equal(images.filter(tag=>tag.includes('loading="lazy"')).length,5);
    assert.equal(images.filter(tag=>tag.includes('fetchpriority="high"')).length,1);
    assert(!images.some(tag=>tag.includes('fetchpriority="low"')));
    assert(images.every(tag=>tag.includes('width="1024" height="1536"')));
    h.action('collection2170-page',1);assert(!h.html.includes('/thumbs/hero.webp'));assert(h.html.includes('/thumbs/relay.webp'));
    assert.equal(h.requests.length,0,'Gallery must not fetch full-sized hidden cards');
  }],
  ['full art loads on inspection and warms only one next unlocked card after loading',()=>{
    const h=fixture();h.action('collection2170-open','cards');h.action('collection2170-art','hero');
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].src,'./assets/collection2170/hero.webp');
    assert(h.html.includes('Загружаем иллюстрацию'));assert(h.html.includes('loading="eager"'));
    h.requests[0].load();assert(!h.html.includes('Загружаем иллюстрацию'));
    assert.equal(h.requests.length,2);assert.equal(h.requests[1].src,'./assets/collection2170/robodog.webp');
    h.requests[1].load();assert.equal(h.requests.length,2,'Preloads must not fan out to the entire collection');
    h.action('collection2170-art-next','hero');assert(h.html.includes('Робособака'));assert.equal(h.requests.length,3);
    assert.equal(h.engine.score,41);assert.equal(h.saves,0);
  }],
  ['comic gallery uses thumbnails but four story frames reuse one original sheet',()=>{
    const h=fixture();h.action('collection2170-open','comics');assert(h.html.includes('/comics2170/thumbs/departure.webp'));
    h.action('collection2170-comic','departure');assert.equal(h.requests.length,1);
    assert.equal(h.requests[0].src,'./assets/comics2170/departure.webp');h.requests[0].load();
    for(let i=0;i<3;i++)h.action('collection2170-comic-next');
    assert.equal(h.requests.length,1);assert(h.html.includes('background-position:100% 100%'));
  }],
  ['failed active artwork offers retry without changing game progress',()=>{
    const h=fixture();h.action('collection2170-open','cards');h.action('collection2170-art','hero');
    h.requests[0].fail();assert(h.html.includes('Иллюстрация не загрузилась'));assert(h.html.includes('Повторить'));
    h.action('collection2172-retry','./assets/collection2170/hero.webp');assert.equal(h.requests.length,2);
    h.requests[1].load();assert(!h.html.includes('Иллюстрация не загрузилась'));assert.equal(h.engine.score,41);
    const count=h.requests.length;h.action('collection2172-retry','https://example.invalid/private');assert.equal(h.requests.length,count);
  }],
  ['save-data mode does not prefetch the next full-sized artwork',()=>{
    const h=fixture({saveData:true});h.action('collection2170-open','cards');h.action('collection2170-art','hero');
    h.requests[0].load();assert.equal(h.requests.length,1);
  }]
];
for(const [name,run] of cases){run();console.log('PASS '+name);}
console.log('PASS 7 image-loading regressions');
