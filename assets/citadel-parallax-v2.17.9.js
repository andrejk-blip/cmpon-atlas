/* A 2.4 km living fortress. The eye is a shaded 3D surface, not a flat badge.
 * Existing boss saves keep their original coordinate system. */
(()=>{
 'use strict';if(globalThis.CITADEL_PARALLAX2179)return;
 const TAU=Math.PI*2,P=RequirementArcade.prototype,oldStep=P.stepFinalSpace,cache=new Map();
 const part=(a,mesh,p,s,c,em=0,b=SPACE_IDENTITY,alpha=1,kind=0)=>{const q=citadelItem(mesh,p,s,c,em,b,alpha,kind);q.parallax2179=true;a.push(q);return q;};
 const eyeBranch=`if(uKind>98.5&&uKind<99.5){
 vec2 gaze=clamp((uEye.xy-vec2(0.))/vec2(3400.,2500.),vec2(-.16),vec2(.16));
 vec2 ep=vLocal.xy-gaze;float er=length(ep),ea=atan(ep.y,ep.x),pr=.19+uEmissive*.055;
 float fibre=noise(vec3(ea*120.,er*34.,4.))* .55+.45*(.5+.5*sin(ea*210.+er*19.+noise(vec3(ea*18.,er*8.,2.))*8.));
 float crypt=pow(.5+.5*sin(ea*69.+noise(vec3(ea*21.,er*29.,3.))*7.),3.);
 vec3 iris=mix(vec3(.055,.17,.17),vec3(.29,.60,.47),fibre);
 iris=mix(iris,vec3(.72,.47,.16),pow(1.-smoothstep(pr,.48,er),1.4)*.75);
 iris*=.68+.43*fibre;iris*=1.-crypt*.32;iris*=mix(1.,.19,smoothstep(.48,.58,er));
 float veins=pow(.5+.5*sin(ea*18.+er*27.+noise(vLocal*8.)*12.),32.)*smoothstep(.48,.95,er);
 vec3 sclera=mix(vec3(.64,.66,.57),vec3(.43,.13,.17),veins*.66);sclera*=.62+.38*sqrt(max(0.,vLocal.z));
 col=mix(iris,sclera,smoothstep(.56,.60,er));col=mix(vec3(.002,.009,.012),col,smoothstep(pr-.018,pr+.015,er));
 float spot=exp(-dot(ep-vec2(-.16,.22),ep-vec2(-.16,.22))*500.);
 float arc=exp(-pow(abs(length((ep-vec2(.02,.06))*vec2(1.,1.15))-.39),2.)*2400.)*smoothstep(.1,.25,ep.y);
 col=col*(.7+.3*ndl)+vec3(.8,.95,1.)*(spot*.9+arc*.35+shine*.75);}
else `;
 function eyeShader(source){return source.includes('if(uKind>=19.5)')?source.replace('if(uKind>=19.5)',eyeBranch+'if(uKind>=19.5)'):source;}
 const program=SpaceRendererCore.prototype.program;
 SpaceRendererCore.prototype.program=function(v,f){return program.call(this,v,eyeShader(f));};
 let shaderError=null;
 // The core can already be mounted when a deferred addon is evaluated.
 const renderer=ARCADE.renderer;
 if(renderer?.gl&&renderer.program3D)try{const gl=renderer.gl,replaced=renderer.program(SPACE_VERTEX,SPACE_FRAGMENT),previous=renderer.program3D;
  renderer.program3D=replaced;for(const key of Object.keys(renderer.loc))renderer.loc[key]=gl.getUniformLocation(replaced,key);
  renderer.position=gl.getAttribLocation(replaced,'aPosition');renderer.normal=gl.getAttribLocation(replaced,'aNormal');gl.deleteProgram(previous);
 }catch(error){shaderError=String(error);}
 SPACE_MESH.eye2179=spaceSphere(64,36);
 let cpuCells=null;
 function cpuEye(){if(cpuCells)return cpuCells;const groups=new Map(),segments=128,rings=24;
  const point=(r,angle)=>[r*Math.cos(angle),r*Math.sin(angle),Math.sqrt(Math.max(0,1-r*r))];
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
   const r=(j+.5)/rings,a=(i+.5)/segments*TAU,f=.5+.25*Math.sin(a*119+r*27)+.25*Math.sin(a*71-r*18);let col;
   if(r<.21)col=[.008,.018,.022];
   else if(r<.57){const amber=Math.max(0,1-(r-.21)/.24),rim=r>.52?.38:1;col=[(.10+f*.22+amber*.24)*rim,(.23+f*.25+amber*.06)*rim,(.20+f*.20-amber*.08)*rim];}
   else {const vein=Math.pow(.5+.5*Math.sin(a*29+r*41+Math.sin(a*13)*4),28)*(r-.55)*1.2,shade=.58+.42*Math.sqrt(1-r*r);col=[(.78-vein*.2)*shade,(.77-vein*.58)*shade,(.67-vein*.42)*shade];}
   const x=r*Math.cos(a),y=r*Math.sin(a),shine=Math.exp(-((x+.15)**2+(y-.24)**2)*750)+Math.exp(-((Math.hypot(x-.03,(y-.04)*1.1)-.41)**2)*3800)*(y>.18?.3:0);
   col=col.map(c=>Math.min(.98,c+shine*.75));const color='#'+col.map(c=>Math.round(c*20)*12).map(v=>v.toString(16).padStart(2,'0')).join('');
   let g=groups.get(color);if(!g){g={color,v:[],f:[]};groups.set(color,g);}const n=g.v.length;
   g.v.push(point(j/rings,i/segments*TAU),point((j+1)/rings,i/segments*TAU),point((j+1)/rings,(i+1)/segments*TAU),point(j/rings,(i+1)/segments*TAU));g.f.push([n,n+1,n+2,n+3]);
  }
  cpuCells=[...groups.values()].map((g,i)=>{const mesh='eye2179-cpu-'+i;SPACE_MESH[mesh]=spaceMesh(g.v,g.f,true);return{mesh,color:g.color};});return cpuCells;
 }
 function structures(slot){if(cache.has(slot))return cache.get(slot);const a=[],p=[slot===0||slot===3?-780:780,slot<2?420:-420,-116];
  for(let i=0;i<20;i++){const angle=i/20*TAU,at=V3.add(p,[Math.cos(angle)*86,Math.sin(angle)*67,-64]),b=stationZBasis(angle);
   part(a,'armor',at,[11,19,30],i%3?'#354c5a':'#756f68',0,b);
   part(a,'box',V3.add(at,[0,0,31]),[3,11,.4],i%4?'#749b9d':'#d5b98b',.3,b);
   for(let j=0;j<3;j++)part(a,'box',V3.add(at,[Math.cos(angle)*(j-1)*7,Math.sin(angle)*(j-1)*7,33]),[.7,2.4,.5],'#a3d6cc',.55,b);
  }
  for(const side of [-1,1]){part(a,'armor',V3.add(p,[side*38,0,-36]),[14,52,23],'#536b74');for(let j=0;j<8;j++){part(a,'box',V3.add(p,[side*39,(j-3.5)*11,-11]),[12,.9,1.3],'#162d36');part(a,'octa',V3.add(p,[side*39,(j-3.5)*11,-8]),[1.6,2.5,1.2],j%3?'#86b1ab':'#d2a568',.45);}}
  const merged=stationMerge(a,'parallax2179-sector-'+slot);cache.set(slot,merged);return merged;
 }
 function decorate(a,e,time,fx){const s=e.finale?.leviathan;if(!s||s.worldScale2179!==10)return;
  const clock=s.clock,eyeClosed=e.finale.phase==='breach',blink=clock%9.1,open=blink>8.76?Math.max(.05,Math.abs(blink-8.93)/.17):1;
  // Thick orbital lids and wet sclera enclose the pupil/core target.
  part(a,'torus',[0,0,-198],[440,390,25],'#654c62',.05);
  part(a,'torus',[0,0,-172],[415,365,12],'#a27f7d',.08);
  if(!eyeClosed){
   if(ARCADE.renderer?.gl)part(a,'eye2179',[0,0,-215],[400,350*open,100],'#b1c3ad',.5+.5*Math.sin(clock*1.1),SPACE_IDENTITY,1,99);
   else for(const cell of cpuEye())part(a,cell.mesh,[0,0,-215],[400,350*open,100],cell.color,.8);
  }
  for(let i=0;i<4;i++){
   const b=e.enemies.find(x=>x.beacon2110&&x.slot===i),p=b?.pos||[i===0||i===3?-780:780,i<2?420:-420,-116],alive=b&&!b.dead,focus=b?.id===s.focus;
   if(V3.len(V3.sub(p,e.player.pos))<500||s.clock<5)a.push(...structures(i));
   const color=alive?focus?'#ffe8aa':'#9fe8de':'#5e4e68';
   part(a,'torus',V3.add(p,[0,0,-8]),[17,17,4],'#81776a');
   for(let ring=0;ring<3;ring++)part(a,'lightRing',V3.add(p,[0,0,ring*.7]),[10.5+ring*3,10.5+ring*3,.35],color,alive?.9:.05,stationZBasis(clock*(ring%2?-.25:.3)),alive?.7:.2);
   for(let j=0;j<8;j++){const angle=j/8*TAU+clock*.12,offset=[Math.cos(angle)*15,Math.sin(angle)*15,1.2];part(a,'armor',V3.add(p,offset),[1.5,3.2,.7],j%2?'#bc9f6d':'#5d808a',.1,stationZBasis(angle));if(alive)part(a,'octa',V3.add(p,[offset[0]*.8,offset[1]*.8,2]),[.75,1.1,.45],color,.85);}
   if(alive){part(a,'sphere',p,[8.2,10.5,5.5],color,.8,SPACE_IDENTITY,.08+.04*Math.sin(clock*2));part(a,'octa',p,[2.3,7.5,2.3],'#fff0d0',.9,stationZBasis(-clock*.35));}
  }
 }
 const lines=['Нееет! Ты не соберёшь эти требования!','Мои маяки не отдадут тебе ни одной формулировки!','Хватит! Каждое требование принадлежит мне!','Нет! Не трогай последний маяк!','Нееет! Только не в глаз!'];
 P.stepFinalSpace=function(dt,input){const r=oldStep.apply(this,arguments),s=this.finale?.leviathan;
  if(!CITADEL_LEVIATHAN.active(this)||this.status!=='playing'||!s||s.clock<6)return r;
  const index=Math.min(4,s.beacons||0);s.taunts2179=s.taunts2179||[];
  if(!s.taunts2179.includes(index)&&s.clock-(s.lastTaunt2179||-20)>7){s.taunts2179.push(index);s.lastTaunt2179=s.clock;globalThis.CITADEL_CINEMA2179?.enemyLine(this,lines[index],'ПАРАЛЛАКС',[this.player.pos[0],this.player.pos[1]+14,this.player.pos[2]-60]);}
  return r;
 };
 globalThis.CITADEL_PARALLAX2179=Object.freeze({version:'2.17.9',decorate,eyeShader,lines,status:()=>({shaderError,cachedSectors:cache.size,worldScale:10})});
})();
