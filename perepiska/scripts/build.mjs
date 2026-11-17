import {mkdir,rm,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true}); await mkdir('dist',{recursive:true});
for(const name of ['index.html','style.css','manifest.webmanifest','src','assets']) await cp(name,`dist/${name}`,{recursive:true,filter:(source)=>!source.includes('assets/source')});
async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;out.push(...(e.isDirectory()?await walk(p):[p]));}return out;}
const files=(await walk('dist')).sort();const hash=createHash('sha256');for(const p of files)hash.update(await readFile(p));
// Audio is loaded when needed. Do not download every conversation during install.
const version=hash.digest('hex').slice(0,12), urls=files.filter(p=>!p.endsWith('.mp3')).map(p=>'./'+p.slice(5));
await writeFile('dist/sw.js',`const CACHE='perepiska-${version}';const FILES=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('perepiska-')&&k!==CACHE).map(k=>caches.delete(k))))));
async function audioResponse(request){
  let cache;
  try{cache=await caches.open(CACHE);const cached=await cache.match(request.url);if(cached)return cached;}catch{}
  // Fetch a complete file so partial media responses never enter the cache.
  const response=await fetch(new Request(request.url,{credentials:'same-origin'}));
  if(cache&&response.status===200)try{await cache.put(request.url,response.clone());}catch{}
  return response;
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  if(new URL(e.request.url).pathname.endsWith('.mp3')){e.respondWith(audioResponse(e.request).catch(()=>new Response('Звук недоступен',{status:503})));return;}
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):null)).then(r=>r||new Response('Нет соединения',{status:503}))));
});`);
console.log(`Built ${files.length} files, release ${version}`);
