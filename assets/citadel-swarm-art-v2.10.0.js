/* Citadel 2.10 — original gothic fleets, rotating supply meshes and ordnance.
 * Read-only Canvas art. All animation uses simulation time. A bounded cache
 * holds seven hulls at two detail levels and two damage states (28 tiles).
 */
(()=>{
 'use strict';
 if(globalThis.CITADEL_SWARM_ART?.version==='2.10.0')return;
 const TAU=Math.PI*2,cache=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const hulls={
  scout:[[0,-1],[.18,-.46],[.65,-.60],[.88,-.32],[.59,.05],[.73,.59],[.27,.46],[.19,.82],[-.19,.82],[-.27,.46],[-.73,.59],[-.59,.05],[-.88,-.32],[-.65,-.60],[-.18,-.46]],
  interceptor:[[0,-1.12],[.18,-.3],[.49,-.78],[.65,-.66],[.47,.18],[.68,.64],[.25,.52],[0,.87],[-.25,.52],[-.68,.64],[-.47,.18],[-.65,-.66],[-.49,-.78],[-.18,-.3]],
  bomber:[[0,-.87],[.29,-.61],[.58,-.66],[.88,-.39],[1.02,.1],[.79,.49],[.48,.69],[.21,.57],[.18,.88],[-.18,.88],[-.21,.57],[-.48,.69],[-.79,.49],[-1.02,.1],[-.88,-.39],[-.58,-.66],[-.29,-.61]],
  shield:[[0,-.86],[.35,-.7],[.73,-.64],[1.04,-.31],[1.02,.14],[.73,.06],[.61,.48],[.3,.76],[0,.89],[-.3,.76],[-.61,.48],[-.73,.06],[-1.02,.14],[-1.04,-.31],[-.73,-.64],[-.35,-.7]],
  torpedo:[[0,-.89],[.22,-.34],[.32,-.4],[.39,-.88],[.67,-.81],[.8,-.35],[.7,.61],[.47,.86],[.26,.51],[0,.72],[-.26,.51],[-.47,.86],[-.7,.61],[-.8,-.35],[-.67,-.81],[-.39,-.88],[-.32,-.4],[-.22,-.34]],
  commander:[[0,-1.12],[.21,-.7],[.4,-.94],[.49,-.54],[.73,-.64],[.91,-.31],[1.02,.02],[.72,.45],[.49,.82],[.26,.62],[0,.96],[-.26,.62],[-.49,.82],[-.72,.45],[-1.02,.02],[-.91,-.31],[-.73,-.64],[-.49,-.54],[-.4,-.94],[-.21,-.7]],
  player:[[0,-1.12],[.22,-.51],[.33,-.21],[.82,.14],[.94,.5],[.48,.47],[.3,.72],[.17,.92],[-.17,.92],[-.3,.72],[-.48,.47],[-.94,.5],[-.82,.14],[-.33,-.21],[-.22,-.51]]
 };
 const metals={scout:['#5b655b','#a68a5c','#e56e44'],interceptor:['#635769','#b2a5a0','#b87aff'],bomber:['#806449','#d0a165','#ff9c42'],shield:['#3f686b','#a2bbb1','#6de8eb'],torpedo:['#713e43','#bd9677','#ff7451'],commander:['#79725a','#e1c58c','#ffce64'],player:['#516b77','#e0d7b7','#74e9ff']};
 function poly(c,p,fill,stroke){c.beginPath();p.forEach((v,i)=>i?c.lineTo(v[0],v[1]):c.moveTo(v[0],v[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
 function line(c,a,b,color,w){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();}
 function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);c.fill();}
 function shade(hex,k){const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16));return 'rgb('+a.map(x=>Math.round(clamp(x*k,0,255))).join(',')+')';}
 function face(mesh,p,color,glow=false){mesh.push({p,color,glow});}
 function prism(mesh,p,z,h,color){face(mesh,[...p].reverse().map(v=>[...v,z]),color);for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];face(mesh,[[...a,z],[...b,z],[...b,z+h],[...a,z+h]],color);}face(mesh,p.map(v=>[...v,z+h]),color);}
 function box(mesh,x,y,w,d,z,h,color){prism(mesh,[[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]],z,h,color);}
 function diamond(mesh,x,y,w,d,z,h,color){prism(mesh,[[x,y-d],[x+w,y],[x,y+d],[x-w,y]],z,h,color);}
 function meshFor(role,lod){
  const [steel,brass,light]=metals[role],m=[],p=hulls[role];
  prism(m,p,0,.15,'#26333b');prism(m,p.map(([x,y])=>[x*.92,y*.95]),.15,.09,steel);
  diamond(m,0,-.52,.18,.44,.24,.13,brass);box(m,0,.05,.31,.74,.24,.18,steel);
  diamond(m,0,-.08,.15,.27,.42,.1,brass);box(m,0,.03,.15,.22,.52,.14,'#b5bcb4');
  // Raised cathedral bridge and a visibly separate luminous viewport.
  diamond(m,0,-.03,.09,.13,.66,.1,steel);box(m,0,-.07,.10,.07,.77,.01,light);
  const heavy=['bomber','shield','commander'].includes(role),pods=role==='torpedo';
  for(const s of [-1,1]){
   const x=s*(pods?.54:heavy?.64:.48);
   box(m,x,.22,pods?.23:.20,.6,.20,.16,steel);box(m,x,.47,.22,.13,.19,.12,brass);
   box(m,x,.56,.14,.07,.21,.06,light);
   for(let i=0;i<(lod?2:4);i++){
    const y=-.23+i*.18;
    box(m,s*.37,y,.15,.12,.22,.12,brass);
    box(m,s*(heavy?.66:.48),y,.23,.055,.27,.07,'#9aa39b');
    if(!lod){box(m,s*.31,y-.035,.035,.035,.35,.02,'#f0dba3');box(m,x,y,.11,.025,.38,.01,'#15232d');}
   }
   if(pods){diamond(m,x,-.47,.13,.27,.25,.16,brass);box(m,x,-.30,.06,.35,.42,.04,light);}
   if(role==='interceptor'){box(m,s*.48,-.42,.07,.45,.25,.1,brass);diamond(m,s*.48,-.7,.06,.15,.25,.05,'#d0c7b5');}
   if(role==='shield')prism(m,[[s*.37,-.63],[s*.79,-.56],[s*.92,-.29],[s*.65,-.27]],.26,.18,brass);
   if(role==='bomber'){diamond(m,s*.49,.38,.20,.23,.36,.13,'#aa7a4e');box(m,s*.49,.38,.09,.09,.5,.03,light);}
   if(role==='commander'){diamond(m,s*.34,-.46,.08,.17,.36,.18,brass);diamond(m,s*.34,-.46,.055,.11,.54,.17,'#d4c6a6');}
  }
  if(!lod){
   for(let i=0;i<4;i++){const y=.03+i*.13;box(m,0,y,.19,.035,.45,.025,'#18242e');box(m,-.025,y-.035,.20,.025,.45,.025,brass);}
   for(const s of [-1,1])for(let i=0;i<3;i++){const y=-.34+i*.19;diamond(m,s*.22,y,.028,.047,.32,.01,light);}
   // Armored prows, inset panels, paired spires and broadside batteries.
   box(m,0,-.59,.06,.27,.38,.05,'#eee1b7');
   for(const s of [-1,1])diamond(m,s*.13,.24,.04,.10,.48,.23,brass);
  }
  return m;
 }
 const project=p=>[p[0]+p[2]*.28,p[1]-p[2]*.52,p[2]+p[0]*.28-p[1]*.52];
 function normal(p){const n=[0,0,0];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}const d=Math.hypot(...n)||1;return n.map(x=>x/d);}

 function render(c,mesh,transform=project,scale=1,flash=false){
  const faces=mesh.map(f=>{const v=f.p.map(transform),n=normal(v),k=.57+.55*Math.max(0,-n[0]*.35-n[1]*.55+n[2]*.76);return{v,visible:n[2]>0,depth:v.reduce((n,p)=>n+p[2],0)/v.length,color:flash?'#fff1c8':f.glow?f.color:shade(f.color,k)};}).filter(f=>f.visible);if(transform!==project)faces.sort((a,b)=>a.depth-b.depth);
  c.lineJoin='round';c.lineWidth=.008*scale;
  for(const f of faces)poly(c,f.v.map(p=>[p[0]*scale,p[1]*scale]),f.color,f.color);
 }
 function makeTile(role,lod,flash){
  const mesh=meshFor(role,lod),radius=Math.max(...mesh.flatMap(f=>f.p.map(project).map(p=>Math.hypot(p[0],p[1])))),scale=.96/radius;
  const size=lod?96:224;let canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(size,size):globalThis.document?.createElement?.('canvas');
  if(!canvas?.getContext)canvas=null;
  if(canvas){canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.translate(size/2,size/2);c.scale(size/2,size/2);render(c,mesh,project,scale,flash);}
  return{canvas,mesh,scale,size};
 }
 function ship(c,q,rank,angle,flash,fx,time,boost,role,lod=false){
  role=rank===3?'player':hulls[role]?role:'scout';const key=role+':'+(+lod)+':'+(+!!flash);
  let tile=cache.get(key);if(!tile){tile=makeTile(role,lod,flash);cache.set(key,tile);}
  c.save();c.translate(q.x,q.y);c.scale(q.rx,q.ry);c.rotate(angle);
  if(fx)for(const s of [-1,1]){const x=s*.38,y=.56,len=(boost?.95:.36)+Math.sin(time*27)*.07;poly(c,[[x-.09,y],[x+.09,y],[x+.045,y+len],[x,y+len+.2],[x-.045,y+len]],rank===3?'#63dfff55':'#e58a4b45');oval(c,x,y+.1,.055,.17,rank===3?'#d1ffff':'#ffe1a1');}
  if(tile.canvas)c.drawImage(tile.canvas,-1,-1,2,2);else render(c,tile.mesh,project,tile.scale,flash);c.restore();
 }
 const supplyMeshes={};
 function supplyMesh(type){
  if(supplyMeshes[type])return supplyMeshes[type];const m=[],color=type==='repair'?'#99e1b0':type==='missiles'?'#efb672':'#77e4e2';
  if(type==='overdrive'){
   const ring=Array.from({length:6},(_,i)=>[Math.cos(i*TAU/6)*.47,0,Math.sin(i*TAU/6)*.47]);
   for(let i=0;i<6;i++){face(m,[ring[i],ring[(i+1)%6],[0,-.91,0]],color);face(m,[ring[(i+1)%6],ring[i],[0,.91,0]],'#43aabf');}
   box(m,0,0,1.02,.18,-.14,.28,'#c9ba83');
  }else{
   box(m,0,0,1.12,type==='missiles'?1.6:1.1,-.48,.96,shade(color,.57));
   box(m,0,0,.99,type==='missiles'?1.43:.99,.48,.09,color);
   for(const s of [-1,1])box(m,s*.42,0,.12,type==='missiles'?1.65:1.15,-.53,1.13,'#b1b4a1');
   if(type==='repair'){box(m,0,0,.22,.68,.58,.045,'#ecffec');box(m,0,0,.68,.22,.58,.045,'#ecffec');}
   else for(const s of [-1,1]){diamond(m,s*.2,-.05,.11,.52,.59,.08,'#f7e6c8');box(m,s*.2,.32,.3,.08,.59,.09,'#a34c36');}
  }return supplyMeshes[type]=m;
 }
 function pickup(c,q,type,age,r,fx){
  const a=fx?age*1.65:.65,b=fx?.25+Math.sin(age*.8)*.37:.35,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
  const rotate=p=>{const x=p[0]*ca+p[2]*sa,z=-p[0]*sa+p[2]*ca,y=p[1]*cb-z*sb;return[x,y,p[1]*sb+z*cb];};
  c.save();c.translate(q.x,q.y+(fx?Math.sin(age*2.7)*1.5:0));
  if(fx)oval(c,0,r*.9,r*.8,r*.19,'#020a1480');render(c,supplyMesh(type),rotate,r*.7);c.restore();
 }
 function projectile(c,q,d,b,hostile,fx,compact){
  const rocket=b.type==='missile'||b.type==='swarm-torpedo',r=hostile?(compact?3.1:3.8):1.4,len=rocket?9:hostile?5:7,angle=Math.atan2(d.y,d.x)+Math.PI/2;
  const hot=hostile?'#ffe3a2':'#e0ffff',edge=hostile?'#e97844':'#66d8e9';
  c.save();c.translate(q.x,q.y);c.rotate(angle);
  if(fx){const g=c.createLinearGradient(0,0,0,len*(rocket?3:2.6));g.addColorStop(0,hostile?'#f08a4f9c':'#76e5ec9c');g.addColorStop(1,hostile?'#c64e2200':'#53c8e000');poly(c,[[-r*.65,0],[r*.65,0],[r*.2,len*2.6],[-r*.2,len*2.6]],g);}
  if(rocket){poly(c,[[0,-len],[2.5,-len*.4],[2.5,len*.3],[4,len*.65],[1.3,len*.5],[-1.3,len*.5],[-4,len*.65],[-2.5,len*.3],[-2.5,-len*.4]],'#8b9ca0',hot);line(c,[-.65,-len*.68],[-.65,len*.4],hot,1.25);line(c,[-2.1,-len*.15],[2.1,-len*.15],edge,2);if(fx)poly(c,[[-1.6,len*.5],[1.6,len*.5],[0,len*1.5]],hot);}
  else{oval(c,0,0,r,hostile?r:len*.65,edge);oval(c,-.2,-.3,Math.max(1,r*.48),hostile?r*.55:len*.44,hot);}
  c.restore();
 }
 function explosion(c,q,u,sy){
  c.save();c.translate(q.x,q.y);const r=sy*(2+u*9),fade=Math.max(0,1-u);
  // A fast incandescent core, slower uneven gas and cooling fragments.
  for(let i=0;i<7;i++){const a=i*2.399,dist=r*(.25+u*.75),x=Math.cos(a)*dist,y=Math.sin(a)*dist*.72,rad=r*(.35+(i%3)*.06);const g=c.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,u<.38?'#ffb54bb0':'#5e4b4380');g.addColorStop(.5,u<.45?'#b9503270':'#342f324a');g.addColorStop(1,'#1c242900');c.globalAlpha=fade;oval(c,x,y,rad,rad,g);}
  const fire=c.createRadialGradient(0,0,0,0,0,Math.max(.01,r*.9));fire.addColorStop(0,'#fffbd9');fire.addColorStop(.23,'#ffe89bd9');fire.addColorStop(.6,'#ed783b88');fire.addColorStop(1,'#dc402000');c.globalAlpha=fade*fade;oval(c,0,0,r*.9,r*.78,fire);
  c.globalAlpha=fade*.65;c.strokeStyle='#e7c191';c.lineWidth=Math.max(.6,sy*.22);c.beginPath();c.ellipse(0,0,r*1.5,r*.95,0,0,TAU);c.stroke();
  for(let i=0;i<8;i++){const a=i*2.399+.4,dist=r*(.7+u);c.globalAlpha=fade;line(c,[Math.cos(a)*dist,Math.sin(a)*dist*.8],[Math.cos(a)*(dist+sy*1.5),Math.sin(a)*(dist+sy*1.5)*.8],i%2?'#f5c889':'#859296',Math.max(.7,sy*.28));}c.restore();
 }
 globalThis.CITADEL_SWARM_ART=Object.freeze({version:'2.10.0',ship,pickup,projectile,explosion,roles:Object.freeze(Object.keys(hulls)),stats:()=>({tiles:cache.size,maxTiles:28,bytes:[...cache.values()].reduce((n,t)=>n+(t.canvas?t.size*t.size*4:0),0),supplies:Object.keys(supplyMeshes).length,retainedEffects:0})});
})();
