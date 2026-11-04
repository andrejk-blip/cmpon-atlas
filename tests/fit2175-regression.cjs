'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/citadel-fit-v2.17.5.js'),'utf8');
function fixture(html='<section class="campaign-panel"><h3>Что произошло</h3><button data-action="campaign-retry">Ещё раз</button></section>'){
 let updates=0;const engine={status:'lost',score:42,campaign2120:{completed:['orbit1'],document:{goal:'Цель'}}};
 const c={document:{getElementById:()=>null,addEventListener:()=>{}},ARCADE:{engine},arcadeOverlayHTML:()=>html,updateArcadeOverlay:()=>{updates++;return 'legacy-update';},setTimeout:f=>f()};
 vm.createContext(c);vm.runInContext(source,c);return{c,api:c.CITADEL_VIEWPORT_FIT,engine,updates:()=>updates};
}
const cases=[
 ['full-fit content remains on one screen',()=>{const {api}=fixture(),items=[100,90,80,44];assert.equal(api.makePages(items,a=>a.reduce((s,n)=>s+n,0)<=500).length,1);}],
 ['overflow pagination preserves every item and order exactly once',()=>{const {api}=fixture(),items=[180,150,160,44,70],pages=api.makePages(items,a=>a.reduce((s,n)=>s+n,0)<=340);assert.deepEqual(Array.from(pages.flat()),items);for(const page of pages)assert(page.reduce((s,n)=>s+n,0)<=340);assert.equal(pages.length,2);}],
 ['long source text is preserved without dropping whitespace or words',()=>{const {api}=fixture(),text='  Материал\n'+('Сначала цель. Затем границы и приёмка.  '.repeat(60))+'\nКонец. ';const chunks=api.textParts(text);assert.equal(chunks.join(''),text);assert(chunks.length>2);assert(chunks.every(x=>x.length<=420));}],
 ['wrapper preserves original button actions and does not mutate game state',()=>{const {c,engine}=fixture(),before=JSON.stringify(engine),html=c.arcadeOverlayHTML();assert(html.includes('data-action="campaign-retry"'));assert(html.includes('data-fit2175-page="1"'));assert.equal(JSON.stringify(engine),before);assert.equal(c.updateArcadeOverlay(),'legacy-update');}],
 ['menu and active gameplay are left to their existing layout',()=>{const {api}=fixture();for(const html of ['', '  ', '<section class="menu2170 menu2173">Start</section>'])assert.equal(api.wrap(html),html);}],
 ['bootstrap is idempotent and does not replace actions or install a render loop',()=>{const {c,api}=fixture(),overlay=c.arcadeOverlayHTML;vm.runInContext(source,c);assert.equal(c.CITADEL_VIEWPORT_FIT,api);assert.equal(c.arcadeOverlayHTML,overlay);assert(!source.includes('requestAnimationFrame'));assert(!source.includes('setInterval'));assert(!source.includes('localStorage'));}]
];
let failed=0;for(const[name,test]of cases){try{test();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}if(failed)process.exitCode=1;
