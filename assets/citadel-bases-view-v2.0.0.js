/* Citadel 2.0.0 · inhabited industrial interiors and articulated human rigs.
 * Geometry is authored here, with shared, bounded meshes. Simulation owns
 * gait, facing and recoil; drawing never changes gameplay or starts a timer.
 * WebGL uses the existing lighting pipeline. The CPU path culls whole chunks,
 * caches transformed static triangles and omits invisible back faces.
 */
(() => {
  'use strict';
  if (globalThis.CITADEL_BASE_VIEW?.version === '2.0.0') return;
  const VERSION='2.0.0', TAU=Math.PI*2;
  const previous={interior:citadelInterior,camera:spaceCamera,draw:spaceDrawCPU,hud:drawBoardHUD,finalHUD:drawFinaleHUD,update:updateArcadeHUD};
  const palettes={
    player:{cloth:'#d2d9cc',pants:'#263e4a',vest:'#47666b',trim:'#7cd6ce'},
    scout:{cloth:'#8b5651',pants:'#303940',vest:'#513f41',trim:'#db9a7f'},
    shield:{cloth:'#777e75',pants:'#303b40',vest:'#485858',trim:'#e6c17d'},
    sniper:{cloth:'#667580',pants:'#303b48',vest:'#40535d',trim:'#cbb4da'},
    relay:{cloth:'#7e6f7c',pants:'#343745',vest:'#4e485a',trim:'#e5a6ba'},
    hunter:{cloth:'#a87854',pants:'#3c4143',vest:'#615246',trim:'#e9bd89'},
    rocketeer:{cloth:'#76816c',pants:'#3b4340',vest:'#4d5c50',trim:'#e1aa72'},
    ninja:{cloth:'#555c71',pants:'#282f42',vest:'#3c425b',trim:'#bda8dd'},
  };
  const skins=['#c58b67','#a57150','#dfaf8b','#79503b','#c79b77','#e5bea0'];
  const hairs=['#32241f','#1e1c20','#76513a','#201c1a','#534338','#a38861'];
  const rigs=new Map(), architecture=new Map(), staticTriangles=new WeakMap();
  const clamp=(v,a=0,z=1)=>Math.max(a,Math.min(z,v));
  const inside=e=>!!e?.board?.cells&&!e.crash&&(!e.finale||e.finale.phase==='maze')&&citadelInside(e);
  function mesh(name,rings,segments=10,axis='y') {
    const p=[],n=[],points=[];
    for(const [height,rx,rz,offset=0]of rings) {
      const row=[];for(let j=0;j<segments;j++) {const a=j/segments*TAU;
        row.push(axis==='y'?[Math.sin(a)*rx,height,Math.cos(a)*rz+offset]:[Math.sin(a)*rx,Math.cos(a)*rz,height]);}
      points.push(row);
    }
    const tri=(a,b,c)=>{const normal=V3.norm(V3.cross(V3.sub(b,a),V3.sub(c,a)));p.push(...a,...b,...c);n.push(...normal,...normal,...normal);};
    for(let i=0;i<points.length-1;i++)for(let j=0;j<segments;j++) {
      const k=(j+1)%segments;tri(points[i][j],points[i+1][j],points[i+1][k]);tri(points[i][j],points[i+1][k],points[i][k]);
    }
    // A stable outward winding, including the z-axis limb loft.
    for(let i=0;i<p.length;i+=9) {
      const dot=axis==='y'?n[i]*(p[i]+p[i+3]+p[i+6])+n[i+2]*(p[i+2]+p[i+5]+p[i+8]):
        n[i]*(p[i]+p[i+3]+p[i+6])+n[i+1]*(p[i+1]+p[i+4]+p[i+7]);
      if(dot<0)for(let j=0;j<9;j++)n[i+j]*=-1;
    }
    SPACE_MESH[name]={p:new Float32Array(p),n:new Float32Array(n)};
  }
  mesh('base_head',[[-1,.42,.55],[-.78,.72,.72],[-.3,.95,.89],[.35,1,1],[.75,.8,.84],[1,.05,.05]],12);
  mesh('base_body',[[-1,.74,.82],[-.7,.76,.78],[.25,.91,.9],[.7,1,.82],[.92,.78,.64],[1,.35,.4]],10);
  mesh('base_limb',[[-1,.65,.65],[-.85,.9,.9],[.45,1,1],[.9,.78,.78],[1,.45,.45]],8,'z');
  mesh('base_soft',[[-1,.02,.02],[-.75,.66,.66],[0,1,1],[.75,.66,.66],[1,.02,.02]],10);
  // Sculpted hair cap: a higher forehead, low nape and a swept parting.
  {
    const p=[],n=[],rows=[];
    for(let k=0;k<4;k++){const row=[];for(let j=0;j<16;j++) {
      const a=j/16*TAU,front=Math.max(0,Math.cos(a));
      const y=k===0?.02+front*.44:k===1?.55:k===2?.88:1.04+Math.sin(a)*.035;
      const radius=[1.015,1.04,.8,.08][k];row.push([Math.sin(a)*radius,y,Math.cos(a)*radius]);
    }rows.push(row);}
    for(let i=0;i<3;i++)for(let j=0;j<16;j++)for(const ids of [[i,j,i+1,j,i+1,(j+1)%16],[i,j,i+1,(j+1)%16,i,(j+1)%16]]) {
      const a=rows[ids[0]][ids[1]],b=rows[ids[2]][ids[3]],c=rows[ids[4]][ids[5]],normal=V3.norm(V3.cross(V3.sub(b,a),V3.sub(c,a)));
      if(normal[0]*a[0]+normal[2]*a[2]<0)for(let q=0;q<3;q++)normal[q]*=-1;
      p.push(...a,...b,...c);n.push(...normal,...normal,...normal);
    }
    SPACE_MESH.base_hair={p:new Float32Array(p),n:new Float32Array(n)};
  }
  function item(mesh,pos,size,color,em=0,basis=SPACE_IDENTITY,alpha=1,feature='') {
    const x=citadelItem(mesh,pos,size,color,em,basis,alpha);x.baseFeature=feature;return x;
  }
  function part(list,mesh,pos,size,color,feature='',em=0,basis=SPACE_IDENTITY,alpha=1) {
    const x=item(mesh,pos,size,color,em,basis,alpha,feature);list.push(x);return x;
  }
  function merge(parts,key) {
    return stationMerge(parts,'bases2_'+key).map(x=>({...x,baseStatic:true}));
  }
  function rig(kind,variant=0) {
    const key=kind+'_'+variant;if(rigs.has(key))return rigs.get(key);
    const c=palettes[kind]||palettes.scout,skin=skins[variant%6],hair=hairs[variant%6],torso=[],head=[],pelvis=[];
    const add=(list,...args)=>part(list,...args);
    add(torso,'base_body',[0,2.22,0],[.5,.6,.27],c.cloth,'uniform-jacket');
    add(torso,'base_body',[0,2.23,.16],[.42,.43,.18],c.vest,'fitted-vest');
    add(torso,'box',[0,2.23,.344],[.014,.42,.015],'#a7a99c','zipper');
    for(const s of [-1,1]) {
      add(torso,'armor',[s*.26,2.2,.34],[.145,.16,.055],c.cloth,'chest-pocket');
      add(torso,'box',[s*.26,2.3,.403],[.13,.018,.008],c.trim,'pocket-flap');
      add(torso,'armor',[s*.27,2.66,.11],[.19,.055,.19],c.vest,'collar');
      add(torso,'armor',[s*.48,2.64,0],[.14,.055,.22],c.trim,'epaulette');
      add(torso,'armor',[s*.3,1.85,.27],[.13,.14,.09],c.vest,'belt-pouch');
    }
    add(torso,'box',[-.23,2.48,.375],[.13,.035,.015],'#e2ddd0','name-tape');
    add(torso,'box',[.23,2.5,.38],[.07,.07,.015],c.trim,'unit-insignia');
    add(torso,'base_soft',[0,2.82,0],[.14,.22,.14],skin,'neck');
    add(torso,'armor',[0,2.28,-.36],[.33,.38,.16],kind==='player'?'#b5b6a2':c.pants,'field-pack');
    add(torso,'box',[0,2.28,-.53],[.25,.025,.02],c.trim,'pack-seam');
    if(kind==='relay'){
      add(torso,'box',[-.26,2.7,-.4],[.025,.46,.025],'#303d42','radio-antenna');
      add(torso,'box',[-.26,3.16,-.4],[.04,.035,.04],c.trim,'radio-tip',.5);
    }
    if(kind==='rocketeer')for(const s of [-1,1])add(torso,'base_limb',[s*.26,2.35,-.57],[.14,.14,.5],'#737969','rocket-case',0,flightBasis(0,Math.PI/2));
    add(pelvis,'base_body',[0,1.6,0],[.4,.22,.27],c.pants,'pelvis');
    add(pelvis,'armor',[0,1.77,0],[.42,.055,.29],'#292f32','belt');
    add(pelvis,'box',[0,1.77,.302],[.09,.055,.025],'#b8b8a5','buckle');
    add(head,'base_head',[0,3.13,.025],[.285,.36,.27],skin,'face');
    add(head,'base_hair',[0,3.13,.015],[.293,.37,.279],hair,'hair');
    // A swept forelock and sideburns give different readable silhouettes.
    add(head,'base_soft',[-.09,3.47,.14],[.24,.115,.17],hair,'forelock');
    for(const s of [-1,1]) {
      add(head,'base_soft',[s*.28,3.11,.015],[.065,.115,.07],skin,'ear');
      add(head,'box',[s*.265,3.21,.065],[.022,.11,.07],hair,'sideburn');
      add(head,'base_soft',[s*.111,3.175,.264],[.067,.027,.015],'#ede6d2','eye');
      add(head,'base_soft',[s*.111,3.175,.279],[.021,.025,.008],'#34332e','iris');
      add(head,'box',[s*.11,3.23,.267],[.075,.018,.018],hair,'eyebrow');
    }
    add(head,'base_soft',[0,3.105,.3],[.052,.081,.071],skin,'nose');
    add(head,'box',[0,2.995,.254],[.085,.015,.012],'#975b51','mouth');
    if(variant===1||variant===3) {
      add(head,'base_soft',[0,2.94,.18],[.2,.1,.14],hair,'beard');
      add(head,'box',[0,3.035,.274],[.08,.02,.012],hair,'moustache');
    }
    if(variant===2||variant===5){
      add(head,'base_soft',[0,3.17,-.31],[.13,.18,.15],hair,'hair-tie');
      add(head,'base_soft',[0,2.94,-.35],[.12,.27,.1],hair,'ponytail');
    }
    const result={palette:c,skin,torso:merge(torso,key+'_torso'),head:merge(head,key+'_head'),pelvis:merge(pelvis,key+'_pelvis')};
    rigs.set(key,result);return result;
  }
  function transform(items,parts,pos,basis,scale=1) {
    for(const source of parts) {
      const m=source.model,model=spaceModel(pos,[scale,scale,scale],basis);
      // Cached rig parts are merged in model space; one common transform.
      items.push({...source,pos:pos.slice(),model,baseStatic:false,baseActor:true});
    }
  }
  function actor(items,pos,yaw,state={},kind='player',hit=false) {
    const variant=kind==='player'?0:(state.appearance||0),r=rig(kind,variant),basis=stationYaw(yaw),m=spaceModel(pos,[1,1,1],basis);
    const gait=state.gait||0,speed=clamp((state.speed||0)/5.5),bob=Math.cos(gait*2)*.035*speed;
    const origin=V3.add(pos,[0,bob,0]),body=spaceModel(origin,[1,1,1],basis);
    const local=p=>spacePoint(body,p),draw=(mesh,off,size,col,feature,em=0,alpha=1)=>{
      const it=part(items,mesh,local(off),size,hit?'#efd7c1':col,feature,em,basis,alpha);it.baseActor=true;return it;
    };
    transform(items,r.torso,origin,basis);transform(items,r.pelvis,origin,basis);
    const headBasis=stationYaw(yaw+(state.headTurn||0));transform(items,r.head,origin,headBasis);
    const link=(a,b,radius,col,feature)=>{
      const p=local(a),q=local(b),d=V3.sub(q,p),it=part(items,'base_limb',V3.lerp(p,q,.5),[radius,radius,V3.len(d)/2],col,feature,0,spaceBasisDir(d));
      it.baseActor=true;
    };
    const direction=(state.moveYaw??yaw)-yaw,ux=Math.sin(direction),uz=Math.cos(direction);
    for(const s of [-1,1]) {
      const phase=gait+(s===1?0:Math.PI),swing=Math.sin(phase)*.56*speed,lift=Math.max(0,Math.cos(phase))*.26*speed;
      const hip=[s*.235,1.55,0],foot=[s*.25+ux*swing,.13+lift,.1+uz*swing];
      const knee=[s*.25+ux*swing*.45,.85+lift*.3,.1+uz*swing*.45+.16];
      link(hip,knee,.19,r.palette.pants,'thigh');link(knee,foot,.145,r.palette.pants,'shin');
      draw('armor',[knee[0],knee[1],knee[2]+.12],[.15,.17,.07],r.palette.vest,'knee-pad');
      draw('armor',[foot[0],foot[1],foot[2]+.12],[.18,.13,.29],'#293338','boot');
      draw('box',[foot[0],foot[1]-.09,foot[2]+.13],[.185,.045,.3],'#1d282c','boot-sole');
      draw('box',[foot[0],foot[1]+.11,foot[2]+.14],[.09,.012,.11],'#89958f','boot-laces');
      const shoulder=[s*.49,2.56,0],elbow=s===1?[.65,2.15,.25]:[-.48,2.13,.35];
      const grip=s===1?[.36,2.19,.66]:[-.06,2.2,1.05];
      const recoil=(state.recoil||0)*.65;
      grip[2]-=recoil;elbow[1]+=Math.sin(gait)*.025*speed;
      link(shoulder,elbow,.165,r.palette.cloth,'upper-arm');link(elbow,grip,.13,r.palette.cloth,'forearm');
      draw('armor',[s*.5,2.48,.02],[.18,.2,.18],r.palette.vest,'shoulder-pad');
      draw('box',[s*.675,2.46,.02],[.018,.08,.1],r.palette.trim,'sleeve-patch');
      draw('base_soft',grip,[.115,.09,.115],r.skin,'hand');
      draw('base_soft',[grip[0]-.07,grip[1]+.045,grip[2]],[.06,.04,.06],r.skin,'thumb');
    }
    const recoil=(state.recoil||0)*.65;
    draw('armor',[.25,2.25,.86-recoil],[.11,.13,.53],'#384b52','rifle');
    draw('box',[.25,2.29,1.47-recoil],[.055,.055,.17],'#a1aca5','rifle-barrel');
    draw('armor',[.25,2.07,.71-recoil],[.07,.18,.105],'#263a41','magazine');
    draw('box',[.25,2.43,.86-recoil],[.045,.05,.15],r.palette.trim,'sight');
    if(kind==='rocketeer'){
      draw('tube',[.62,2.65,.35],[.24,.24,.92],'#536257','launcher');
      draw('torus',[.62,2.65,1.27],[.27,.27,.09],'#c3b78c','launcher-rim');
    }
    if(kind==='shield'&&!state.stun){
      draw('armor',[-.58,1.85,.83],[.48,.75,.09],'#6f827c','ballistic-shield');
      draw('box',[-.58,2.2,.93],[.33,.095,.015],'#a6d5d2','shield-window',.2);
      draw('box',[-.58,1.65,.93],[.035,.28,.01],r.palette.trim,'shield-stripe');
    }
    if((state.recoil||0)>.09)draw('octa',[.25,2.29,1.72],[.12,.12,.25],'#ffe1a1','muzzle',1);
  }
  function buildArchitecture(b,stage) {
    const key=(b.definition.basesVersion||'legacy')+'_'+stage+'_'+(b.definition.addedLength||0);
    if(architecture.has(key))return architecture.get(key);
    const chunks=new Map(),d=b.definition;
    const add=(mesh,p,size,color,feature='',em=0,basis=SPACE_IDENTITY,alpha=1)=>{
      const cx=Math.floor(p[0]/16),cz=Math.floor(p[2]/16),key=cx+':'+cz;
      let chunk=chunks.get(key);if(!chunk){chunk={center:[cx*16+8,0,cz*16+8],parts:[]};chunks.set(key,chunk);}
      return part(chunk.parts,mesh,p,size,color,feature,em,basis,alpha);
    };
    for(const cell of b.cells.values()) {
      const x=cell.x*4,z=cell.z*4,color=(cell.x+cell.z)%2?'#3c5059':'#40555e';
      add('box',[x,-.18,z],[1.98,.17,1.98],color,'floor');
      if((cell.x+cell.z)%3===0){
        add('box',[x,-.003,z],[.65,.006,.016],'#71848a','floor-mark');
        add('box',[x,0,z-.18],[.22,.006,.012],'#84979a','floor-mark');
      }
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(!b.cells.has(stationCellKey(cell.x+dx,cell.z+dz))) {
        const horizontal=dz!==0,near=dx===1||dz===1,height=near?1.2:3.35;
        const wall=[x+dx*2,height/2,z+dz*2],size=horizontal?[2.03,height/2,.18]:[.18,height/2,2.03];
        add('box',wall,size,'#9daaa8','bulkhead');
        add('box',[wall[0],.23,wall[2]],horizontal?[2.03,.22,.23]:[.23,.22,2.03],'#283c46','wall-skirt');
        add('box',[wall[0],height,wall[2]],horizontal?[2.06,.065,.24]:[.24,.065,2.06],'#d4d2bc','wall-cap');
        const inner=[x+dx*1.78,height*.55,z+dz*1.78];
        add('box',inner,horizontal?[1.6,.22,.035]:[.035,.22,1.6],'#607880','wall-panel');
        if(!near&&(cell.x+cell.z)%2===0) {
          add('box',[x+dx*1.75,2.72,z+dz*1.75],horizontal?[1.2,.065,.045]:[.045,.065,1.2],'#e2dfbe','wall-light',.7);
          for(const side of [-1,1])add('box',[wall[0]+(horizontal?side*1.85:0),height/2,wall[2]+(horizontal?0:side*1.85)],
            [.09,height/2,.09],'#56717b','wall-rib');
        }
      }
    }
    for(const c of b.crates) {
      const cabinet=c.kind==='cabinet'||c.kind==='rack',console=c.kind==='console';
      const height=cabinet?2.7:console?1.2:1.65;
      add('armor',[c.x,height/2,c.z],[c.w,height/2,c.h],cabinet?'#344f5e':'#657777','equipment');
      add('box',[c.x,height+.04,c.z],[c.w*.98,.04,c.h*.98],'#a9b3a7','equipment-cap');
      if(cabinet)for(let k=0;k<4;k++) {
        add('box',[c.x,.5+k*.52,c.z+c.h+.015],[c.w*.84,.19,.025],'#213b48','rack-slot');
        for(let j=0;j<3;j++)add('box',[c.x-c.w*.55+j*c.w*.55,.5+k*.52,c.z+c.h+.055],[.06,.11,.015],j===2?'#7eafa6':'#a4b3af','archive-tab',j===2?.3:0);
      } else {
        add('box',[c.x,height+.09,c.z],[c.w*.7,.025,c.h*.65],'#233e49','control-panel');
        add('box',[c.x,height+.12,c.z-.25],[c.w*.5,.015,c.h*.22],d.accent,'control-screen',.35);
      }
    }
    for(const r of d.rooms||[]) {
      const [x,,z]=r.center;
      add('box',[x,.6,z],[5.9,.6,5.9],'#2a414e','central-core');
      if(d.theme==='reactor') {
        add('cylinder',[x,2.3,z],[2.3,2.3,1.7],'#687e7b','reactor',0,flightBasis(0,Math.PI/2));
        for(const y of [1,2.5,4])add('torus',[x,y,z],[2.4,2.4,.16],d.warm,'reactor-ring',.5,flightBasis(0,Math.PI/2));
      } else if(d.theme==='bridge') {
        add('armor',[x,1.5,z],[4.8,.4,3.2],'#879793','command-table');
        add('box',[x,1.93,z],[4.2,.035,2.6],'#35616b','strategic-map',.2);
        for(let i=-2;i<=2;i++)add('box',[x+i*1.5,1.99,z],[.025,.02,2.3],'#9abdb4','map-grid',.2);
      } else {
        for(const side of [-1,1]) {
          add('armor',[x+side*3,2.2,z],[1.5,1.2,4.5],'#3d5662','server-bank');
          for(let k=0;k<5;k++)add('box',[x+side*3,1.3+k*.42,z+4.55],[1.2,.07,.02],k%2?'#718c8c':d.accent,'server-strip',.28);
        }
      }
      // Hazard chevrons mark the edge of a solid, impassable installation.
      for(const side of [-1,1])for(let i=-2;i<=2;i++)add('box',[x+i*1.5,.026,z+side*6.4],[.35,.012,.12],'#c4ad70','hazard-stripe');
    }
    for(const p of b.terminals){
      add('armor',V3.add(p,[0,.7,0]),[1.3,.7,.9],'#8b9d97','terminal-base');
      add('armor',V3.add(p,[0,1.7,-.4]),[1.15,.7,.12],'#344f5b','terminal-screen-frame');
      add('box',V3.add(p,[0,1.43,.55]),[1,.035,.28],'#263f4b','terminal-keyboard');
      for(let i=-3;i<=3;i++)add('box',V3.add(p,[i*.22,1.48,.55]),[.06,.015,.12],'#b6c4b6','key');
    }
    const result=[];let n=0;
    for(const chunk of chunks.values()) {
      const parts=merge(chunk.parts,key+'_'+n++);for(const x of parts){x.baseChunk=chunk.center;x.baseFeature='architecture';}
      result.push({center:chunk.center,items:parts});
    }
    architecture.set(key,result);return result;
  }
  function line(items,a,b,color,width=.045,alpha=1) {
    const d=V3.sub(b,a);part(items,'box',V3.lerp(a,b,.5),[width,width,V3.len(d)/2],color,'warning-line',.65,spaceBasisDir(d),alpha);
  }
  function ring(items,p,r,color,alpha=.8) {
    for(let i=0;i<16;i++){const a=i/16*TAU,z=(i+.72)/16*TAU;
      line(items,V3.add(p,[Math.cos(a)*r,.06,Math.sin(a)*r]),V3.add(p,[Math.cos(z)*r,.06,Math.sin(z)*r]),color,.045,alpha);}
  }
  function scene(e) {
    const b=e.board,items=[],d=b.definition,center=b.camera||b.pos;
    for(const chunk of buildArchitecture(b,e.finale?4:e.stage))if(Math.hypot(chunk.center[0]-center[0],chunk.center[2]-center[2])<46)items.push(...chunk.items);
    for(const door of b.doors) {
      if(Math.hypot(door.x-center[0],door.z-center[2])>38)continue;
      const horizontal=door.w>door.h,half=horizontal?door.w:door.h,opening=stationSmooth(door.open),locked=door.unlockAfter>b.completed.length;
      const alarm=door.reserveRoom!==undefined&&b.baseOps?.alarms[door.reserveRoom]!==null;
      const color=locked?'#d49d7d':alarm?'#f3b86f':'#98d0bf';
      for(const side of [-1,1]) {
        const off=side*(half*.5+opening*(half+.4));
        part(items,'armor',[door.x+(horizontal?off:0),1.7,door.z+(horizontal?0:off)],horizontal?[half*.49,1.7,.15]:[.15,1.7,half*.49],'#81918e','sliding-door');
        part(items,'box',[door.x+(horizontal?off:0),2.1,door.z+(horizontal?0:off)],horizontal?[.04,.7,.18]:[.18,.7,.04],color,'door-status',.7);
      }
      for(const side of [-1,1])part(items,'box',[door.x+(horizontal?side*(half+.15):0),1.9,door.z+(horizontal?0:side*(half+.15))],[.22,1.9,.22],'#c3c5b2','door-jamb');
      // Header is kept thin to preserve sight of the player under it.
      part(items,'box',[door.x,3.85,door.z],horizontal?[half+.4,.14,.24]:[.24,.14,half+.4],'#c3c5b2','door-header');
    }
    const gate=globalThis.CITADEL_DECK_COMBAT?.clearance(e);
    b.terminals.forEach((p,i)=>{
      if(Math.hypot(p[0]-center[0],p[2]-center[2])>38)return;
      const current=i===b.completed.length,done=i<b.completed.length,col=done?'#81d3a4':current?'#83cbd6':'#455c67';
      part(items,'box',V3.add(p,[0,1.76,-.262]),[.99,.51,.016],col,'terminal-screen',.35);
      for(let j=0;j<4;j++)part(items,'box',V3.add(p,[-.2,1.99-j*.16,-.24]),[j===3?.5:.69,.018,.012],done?'#cff5cb':'#173b48','terminal-text');
      if(current)ring(items,p,2.2,gate?.ready?'#9bdeb7':'#d9bd82',.8);
    });
    if(b.completed.length===3)ring(items,b.exit,2.5,'#8fdfb8');
    function character(x,isPlayer=false) {
      if(!isPlayer&&Math.hypot(x.pos[0]-center[0],x.pos[2]-center[2])>32)return;
      part(items,'base_soft',V3.add(x.pos,[.2,.015,.18]),[.74,.012,.46],'#12252e','contact-shadow',0,SPACE_IDENTITY,.38);
      const a=isPlayer?b.baseMotion:x.duty;
      const fallback={gait:b.time*8,speed:isPlayer?V3.len(b.velocity||[0,0,0]):x.route?.length?3:0,bodyYaw:x.yaw,appearance:x.id%6};
      const state={...(a||fallback),stun:x.stun,recoil:isPlayer&&b.firing&&b.cooldown>.09?.14:(a?.recoil||0)};
      if (!isPlayer && x.archetype === 'robodog') stationAgent(items,x.pos,x.yaw,b.time,x.archetype,x.hit>0,{...x,moving:state.speed>0});
      else actor(items,x.pos,state.bodyYaw??x.yaw,state,isPlayer?'player':x.archetype,isPlayer?e.flash>.1:x.hit>0);
      if(!isPlayer&&a?.detection>0&&a.detection<1)ring(items,x.pos,.85,'#e5c789',a.detection);
      if(x.charge&&x.aim)line(items,V3.add(x.pos,[0,2.2,0]),V3.add(x.aim,[0,.1,0]),'#db9dba',.02,.8);
      if(x.decksAttack&&x.decksAttack.phase!=='recover') {
        const at=x.decksAttack;
        if(at.kind==='rocket')ring(items,at.aim,at.radius,'#e9ad7d');
        else {const end=V3.add(at.origin,V3.scale(at.direction,at.kind==='pounce'?4.4:9.9));
          for(const s of [-1,1]){const off=[-at.direction[2]*at.radius*s,.09,at.direction[0]*at.radius*s];line(items,V3.add(at.origin,off),V3.add(end,off),'#dca5ae');}}
      }
    }
    character(b,true);for(const x of b.enemies)if(!x.dead)character(x);
    for(const s of b.bullets)part(items,'box',V3.add(s.pos,[0,2.1,0]),[.035,.035,.55],'#b9e7dc','player-round',1,spaceBasisDir(s.vel));
    for(const s of b.hostile)part(items,'base_soft',V3.add(s.pos,[0,2.1,0]),[.1,.1,.22],'#ecc18b','enemy-round',1,spaceBasisDir(s.vel));
    for(const rocket of b.decks?.rockets||[]){
      part(items,'armor',V3.add(rocket.pos,[0,2.2,0]),[.13,.13,.6],'#bdc0a6','rocket',.1,spaceBasisDir(rocket.vel));ring(items,rocket.aim,rocket.radius,'#dba27c',.55);
    }
    for(const blast of b.decks?.blasts||[])ring(items,blast.pos,blast.radius*(1-blast.life/blast.max),'#f8c583',blast.life/blast.max);
    if(b.pulseWave>0)ring(items,b.pos,(1-b.pulseWave)*11+.5,'#95dfe0',b.pulseWave);
    items.basesView=true;return items;
  }
  function camera(e,time,preview) {
    if(!inside(e))return previous.camera(e,time,preview);
    const b=e.board,p=b.camera||b.pos,aspect=(ARCADE.canvas?.width||1280)/(ARCADE.canvas?.height||720);
    const k=aspect<.9?1.22:1;
    return Object.assign(stationLook(V3.add(p,[11*k,20*k,20*k]),V3.add(p,[0,1,-3]),.76,{near:.6,far:240,interior:1,
      lights:[{pos:V3.add(p,[-4,9,3]),color:[1.3,1.25,1.05]},{pos:V3.add(p,[8,5,-9]),color:[.5,.86,1]},
        {pos:V3.add(p,[-12,4,-6]),color:[.55,.9,.77]}]}),{basesView:true});
  }
  function triangles(it) {
    if(it.baseStatic&&staticTriangles.has(it))return staticTriangles.get(it);
    const mesh=SPACE_MESH[it.mesh],m=it.model,result=[];
    const sx=m[0]**2+m[1]**2+m[2]**2,sy=m[4]**2+m[5]**2+m[6]**2,sz=m[8]**2+m[9]**2+m[10]**2;
    for(let i=0;i<mesh.p.length;i+=9) {
      const v=[];for(let k=0;k<9;k+=3)v.push(spacePoint(m,[mesh.p[i+k],mesh.p[i+k+1],mesh.p[i+k+2]]));
      const nx=mesh.n[i]/Math.max(1e-9,sx),ny=mesh.n[i+1]/Math.max(1e-9,sy),nz=mesh.n[i+2]/Math.max(1e-9,sz);
      const normal=V3.norm([m[0]*nx+m[4]*ny+m[8]*nz,m[1]*nx+m[5]*ny+m[9]*nz,m[2]*nx+m[6]*ny+m[10]*nz]);
      result.push({v,n:normal,mid:V3.scale(V3.add(V3.add(v[0],v[1]),v[2]),1/3)});
    }
    if(it.baseStatic)staticTriangles.set(it,result);return result;
  }
  let lastStats={};
  const rasterSurfaces=new WeakMap();
  function drawCPU(c,items,cam,w,h) {
    if(!cam.basesView)return previous.draw(c,items,cam,w,h);
    const started=performance.now();
    const f=h/(2*Math.tan(cam.fov/2)),polys=[],light=V3.norm([-.35,.85,.55]);let tested=0;
    for(const it of items) {
      if(it.baseActor){const p=spaceProject(V3.add(it.pos,[0,1.5,0]),cam,w,h);if(p.z<.5||p.x< -150||p.x>w+150||p.y< -160||p.y>h+160)continue;}
      for(const t of triangles(it)) {
        tested++;const eye=V3.sub(cam.pos,t.mid);
        if(V3.dot(t.n,eye)<-.001)continue;
        const screen=[],depth=[];let reject=false;
        for(const v of t.v) {
          const dx=v[0]-cam.pos[0],dy=v[1]-cam.pos[1],dz=v[2]-cam.pos[2];
          const z=dx*cam.f[0]+dy*cam.f[1]+dz*cam.f[2];if(z<.35){reject=true;break;}
          screen.push([w/2+(dx*cam.r[0]+dy*cam.r[1]+dz*cam.r[2])*f/z,h/2-(dx*cam.u[0]+dy*cam.u[1]+dz*cam.u[2])*f/z,1/z]);depth.push(z);
        }
        if(reject||screen.every(v=>v[0]<0)||screen.every(v=>v[0]>w)||screen.every(v=>v[1]<0)||screen.every(v=>v[1]>h))continue;
        const area=Math.abs((screen[1][0]-screen[0][0])*(screen[2][1]-screen[0][1])-(screen[1][1]-screen[0][1])*(screen[2][0]-screen[0][0]));
        if(area<.1)continue;
        const lum=it.emissive>.4?1:.49+Math.max(0,V3.dot(t.n,light))*.55;
        const color=it.color.map(v=>Math.round(clamp(v*lum)*255));
        polys.push({s:screen,z:(depth[0]+depth[1]+depth[2])/3,color,alpha:it.alpha});
      }
    }
    // Opaque triangles need a depth buffer: sorting their centres produces
    // diagonal holes in wall panels and uniforms. Perspective-correct inverse
    // depth also keeps a character correctly behind cover on Canvas-only PCs.
    let surface=rasterSurfaces.get(c);
    if(!surface||surface.w!==w||surface.h!==h){
      surface={w,h,image:c.createImageData(w,h),depth:new Float32Array(w*h)};rasterSurfaces.set(c,surface);
    }
    const pixels=surface.image.data,depthBuffer=surface.depth;depthBuffer.fill(0);
    for(let y=0;y<h;y++){
      const t=y/h,red=Math.round(20-12*t),green=Math.round(43-18*t),blue=Math.round(54-19*t);
      for(let x=0,offset=y*w*4;x<w;x++,offset+=4){pixels[offset]=red;pixels[offset+1]=green;pixels[offset+2]=blue;pixels[offset+3]=255;}
    }
    const opaque=polys.filter(p=>p.alpha===1),transparent=polys.filter(p=>p.alpha<1).sort((a,b)=>b.z-a.z);
    for(const p of [...opaque,...transparent]){
      let [a,b,d]=p.s;
      let area=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
      if(area<0){[b,d]=[d,b];area=-area;}if(area<.01)continue;
      const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],d[0])-.5)),maxX=Math.min(w-1,Math.floor(Math.max(a[0],b[0],d[0])-.5));
      const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],d[1])-.5)),maxY=Math.min(h-1,Math.floor(Math.max(a[1],b[1],d[1])-.5));
      const edge=(u,v,x,y)=>(v[0]-u[0])*(y-u[1])-(v[1]-u[1])*(x-u[0]);
      const dx0=b[1]-d[1],dx1=d[1]-a[1],dx2=a[1]-b[1];
      const dy0=d[0]-b[0],dy1=a[0]-d[0],dy2=b[0]-a[0];
      let row0=edge(b,d,minX+.5,minY+.5),row1=edge(d,a,minX+.5,minY+.5),row2=edge(a,b,minX+.5,minY+.5);
      const iz0=a[2]/area,iz1=b[2]/area,iz2=d[2]/area,alpha=p.alpha,inv=1-alpha;
      for(let y=minY;y<=maxY;y++,row0+=dy0,row1+=dy1,row2+=dy2){
        let e0=row0,e1=row1,e2=row2,index=y*w+minX;
        for(let x=minX;x<=maxX;x++,index++,e0+=dx0,e1+=dx1,e2+=dx2){
          if(e0<0||e1<0||e2<0)continue;
          const z=e0*iz0+e1*iz1+e2*iz2;if(z<=depthBuffer[index]+.00000005)continue;
          const offset=index*4;
          if(alpha===1){depthBuffer[index]=z;pixels[offset]=p.color[0];pixels[offset+1]=p.color[1];pixels[offset+2]=p.color[2];}
          else{pixels[offset]=pixels[offset]*inv+p.color[0]*alpha;pixels[offset+1]=pixels[offset+1]*inv+p.color[1]*alpha;pixels[offset+2]=pixels[offset+2]*inv+p.color[2]*alpha;}
        }
      }
    }
    c.putImageData(surface.image,0,0);
    c.globalAlpha=1;lastStats={items:items.length,testedTriangles:tested,visibleTriangles:polys.length,milliseconds:performance.now()-started,
      rigVariants:rigs.size,architectureLayouts:architecture.size};
  }
  function labels(c,e,cam,w,h) {
    if(!inside(e))return;const b=e.board;
    c.save();c.textAlign='center';c.textBaseline='middle';c.font='600 '+Math.max(10,Math.round(w/1280*11))+'px sans-serif';
    for(const r of b.definition.rooms||[]) {
      const p=spaceProject(V3.add(r.center,[0,1.27,0]),cam,w,h);
      if(p.z<=0||p.x<100||p.x>w-100||p.y<100||p.y>h-90)continue;
      c.strokeStyle='#203c48';c.lineWidth=4;c.strokeText(r.name,p.x,p.y);c.fillStyle='#d4d5c0';c.fillText(r.name,p.x,p.y);
    }
    for(const d of b.doors)if(d.reserveRoom!==undefined&&b.baseOps?.alarms[d.reserveRoom]!==null&&d.open<.9) {
      const p=spaceProject([d.x,4.3,d.z],cam,w,h);if(p.z<=0||p.x<80||p.x>w-80||p.y<90||p.y>h-90)continue;
      c.strokeStyle='#203c48';c.lineWidth=4;c.strokeText('РЕЗЕРВ · ШЛЮЗ',p.x,p.y);c.fillStyle='#f1c187';c.fillText('РЕЗЕРВ · ШЛЮЗ',p.x,p.y);
    }
    c.restore();
  }
  citadelInterior=function(e,time,fx){return inside(e)?scene(e):previous.interior(e,time,fx);};
  spaceCamera=camera;spaceDrawCPU=drawCPU;
  drawBoardHUD=function(c,e,cam,w,h){const result=previous.hud.apply(this,arguments);labels(c,e,cam,w,h);return result;};
  drawFinaleHUD=function(c,e,cam,w,h){const result=previous.finalHUD.apply(this,arguments);if(e.finale?.phase==='maze')labels(c,e,cam,w,h);return result;};
  const canvasLabels=new WeakMap(),baseLabel='3D-база: WASD — движение, мышь — прицел, пробел — огонь, Shift — бег, E — импульс, G — проводник, P — пауза.';
  updateArcadeHUD=function(){
    const result=previous.update.apply(this,arguments),base=inside(ARCADE.engine),screen=document.getElementById('arcade-screen');
    screen?.closest?.('.arcade-layout')?.classList.toggle('bases-layout',base);
    const canvas=ARCADE.canvas;
    if(canvas?.getAttribute&&canvas?.setAttribute){
      if(base){if(!canvasLabels.has(canvas))canvasLabels.set(canvas,canvas.getAttribute('aria-label')||'');
        if(canvas.getAttribute('aria-label')!==baseLabel)canvas.setAttribute('aria-label',baseLabel);}
      else if(canvasLabels.has(canvas)){if(canvas.getAttribute('aria-label')===baseLabel)canvas.setAttribute('aria-label',canvasLabels.get(canvas));canvasLabels.delete(canvas);}
    }
    return result;
  };
  globalThis.CITADEL_BASE_VIEW=Object.freeze({version:VERSION,actor,scene,camera,draw:drawCPU,status:()=>({...lastStats}),palettes});
})();
