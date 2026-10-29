'use strict';
// Bounded follow-up for the visible release caption. No campaign replay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {readEntry,lab}=require('./release260-verifier.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'qa-2.8.0'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
 const entry=readEntry('tests/entry-2.8.0.html'),file='assets/citadel-learning-modes-v2.7.0.js',baseline='4c39df6',before=cp.execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}),after=entry.sources.get(file);
 const oldCaption="Приложение v'+VERSION+'",newCaption="Приложение v'+esc(typeof APP_RELEASE==='object'&&APP_RELEASE.version||VERSION)+'",checks=[];
 const check=async(name,fn)=>{try{checks.push({name,pass:true,...await fn()});}catch(e){checks.push({name,pass:false,error:e.message});}};
 await check('single-display-interpolation-only',()=>{assert.equal(before.split(oldCaption).length-1,1);assert.equal(after,before.replace(oldCaption,newCaption));return{beforeSHA256:sha(before),afterSHA256:sha(after)};});
 await check('entry-and-resource-cache-key',()=>{assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),entry.html);const refs=[...entry.html.matchAll(/(?:src|href)="([^"]+)"/g)].map(x=>x[1]).filter(x=>/^\.\/assets\//.test(x)&&/\.(?:js|css)(?:\?|$)/.test(x));assert(refs.length>=52);assert(refs.every(x=>x.endsWith('?build=280r2')));return{scriptAndStyleReferences:refs.length,cacheKey:'build=280r2'};});
 const h=await lab(entry),api=h.c.CITADEL_LEARNING_MODES,version=JSON.parse(entry.html.match(/id="release-data">([^<]+)/)[1]).version,next=()=>new Promise(setImmediate);
 for(const mode of ['training','combat'])await check(mode+'-visible-version-and-unchanged-save-schema',async()=>{
  api.setMode(mode);const html=h.run('cupLobbyHTML()');assert(html.includes('<small class="app-release">Приложение v'+version+'</small>'));assert.equal(api.version,'2.7.0');
  h.action('learning-start');await next();const e=h.arcade.engine;assert.equal(api.getMode(e),mode);assert.equal(e.quiz270.bankVersion,'2.7.0');assert.equal(h.pack(e).engine.quiz270.bankVersion,'2.7.0');assert.equal(h.c.CITADEL_RUNTIME.diagnostic().failures,0);h.action('arcade-menu');return{visibleVersion:version,moduleVersion:api.version,bankVersion:e.quiz270.bankVersion};
 });
 await check('missing-release-version-fallback',()=>{const html=h.run('delete APP_RELEASE.version; cupLobbyHTML()');assert(html.includes('Приложение v2.7.0</small>'));h.run('APP_RELEASE.version='+JSON.stringify(version));return{fallback:'2.7.0'};});
 await check('release-version-html-escaped',()=>{const html=h.run('APP_RELEASE.version='+JSON.stringify('2.8.0<test>&"')+'; cupLobbyHTML()');assert(html.includes('Приложение v2.8.0&lt;test&gt;&amp;&quot;</small>'));assert(!html.includes('<test>'));h.run('APP_RELEASE.version='+JSON.stringify(version));return{escaped:true};});
 const report={pass:checks.every(x=>x.pass),passed:checks.filter(x=>x.pass).length,total:checks.length,method:'Exact source diff plus mocked-DOM lobby HTML, ordinary launch routes and preserved save-schema version. No gameplay or full campaign rerun.',entryFile:'tests/entry-2.8.0.html',entrySHA256:sha(entry.html),scripts:entry.scripts.map(file=>({file,sha256:sha(entry.sources.get(file))})),displayOnlyPatch:{file,baseline,beforeSHA256:sha(before),afterSHA256:sha(after),replacement:{before:oldCaption,after:newCaption}},checks};
 fs.writeFileSync(path.join(out,'lobby-version-280r2.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,passed:report.passed,total:report.total,failures:checks.filter(x=>!x.pass)}));if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
