import { ROUTES } from './metrics-catalog.mjs';
const known=new Set(ROUTES.map(r=>r.id));
// Only fixed route names cross the collection boundary. URL parameters never do.
export function pageRoute({pathname='',hash='',activeTab='',legacyView='',atlasScope='',atlasView=''}={}){
 const file=pathname.split('/').at(-1),path=hash.replace(/^#/,'').split('?')[0];
 if(file==='atlas.html'){
  if(['cmpon','all'].includes(atlasScope)&&known.has(`${atlasScope}-${atlasView}`))return `${atlasScope}-${atlasView}`;
  const bits=path.split('/'),scope=['all','other'].includes(bits[0])?'all':'cmpon';
  const view=['cmpon','all','other'].includes(bits[0])?bits[1]:bits[0];
  return known.has(`${scope}-${view}`)?`${scope}-${view}`:`${scope}-map`;
 }
 if(file==='academy.html')return known.has(`academy-${activeTab}`)?`academy-${activeTab}`:'academy-home';
 if(file==='play.html'||(['','index.html'].includes(file)&&/^(arcade|tournament)(\/|$)/.test(path)))return path.startsWith('tournament')?'game-tournament':'game';
 if(file==='atlas-legacy.html')return known.has(legacyView)?legacyView:'map';
 return null; // The root redirects to the atlas; do not count an intermediate page.
}
