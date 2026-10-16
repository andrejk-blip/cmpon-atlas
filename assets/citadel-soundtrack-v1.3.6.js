/* Citadel CSII — soundtrack patch 1.3.6
   Original live Web Audio score. No external samples, recordings, CDNs or paid services.
   Intentionally additive: if the patch cannot initialize, game 1.3.5 audio remains usable. */
'use strict';
(() => {
  try {
    if (typeof SPACE_THEMES === 'undefined' || typeof SPACE_AUDIO === 'undefined' ||
        typeof spaceScoreStep !== 'function' || typeof spaceAudioVoice !== 'function' ||
        typeof spaceAudioSync !== 'function' || typeof spaceAudioControls !== 'function') return;

    const cues = {
      port:          {genre:'ambient',    alt:'classical',  bpm:76,  title:'Порт ЦСИИ',        bright:1450},
      orbit0:        {genre:'techno',     alt:'synthwave',  bpm:130, title:'Редакция I',       bright:3300},
      deck0:         {genre:'classical',  alt:'ambient',    bpm:92,  title:'Архив ФЗ',         bright:2200},
      hyper0:        {genre:'rock',       alt:'breakbeat',  bpm:142, title:'Гиперпереход I',   bright:3700},
      orbit1:        {genre:'synthwave',  alt:'techno',     bpm:116, title:'Редакция II',      bright:3450},
      deck1:         {genre:'ambient',    alt:'classical',  bpm:78,  title:'Коридоры',         bright:1800},
      hyper1:        {genre:'breakbeat',  alt:'rock',       bpm:160, title:'Гиперпереход II',  bright:4400},
      orbit2:        {genre:'rock',       alt:'synthwave',  bpm:126, title:'Редакция III',     bright:4000},
      deck2:         {genre:'classical',  alt:'synthwave',  bpm:100, title:'Переход смежников',bright:2550},
      hyper2:        {genre:'industrial', alt:'orchestral', bpm:152, title:'Гиперпереход III', bright:4100},
      orbit3:        {genre:'rock',       alt:'techno',     bpm:138, title:'Редакция IV',      bright:4100},
      deck3:         {genre:'orchestral', alt:'ambient',    bpm:108, title:'Зал согласования', bright:2800},
      finaleBoss:    {genre:'industrial', alt:'rock',       bpm:148, title:'Параллакс',        bright:4050},
      finaleLair:    {genre:'classical',  alt:'ambient',    bpm:72,  title:'Лабиринт',         bright:1800},
      finaleMRG:     {genre:'chiptune',   alt:'rock',       bpm:168, title:'Протокол МРГ',     bright:4550},
      finaleVictory: {genre:'orchestral', alt:'ambient',    bpm:104, title:'Команда на связи', bright:3200}
    };
    const genreLabels = {
      ambient:'КОСМИЧЕСКИЙ ЭМБИЕНТ', techno:'ТЕХНО', classical:'НЕОКЛАССИКА',
      rock:'РОК', synthwave:'СИНТВЕЙВ', breakbeat:'БРЕЙКБИТ',
      industrial:'ИНДАСТРИАЛ', orchestral:'ОРКЕСТР', chiptune:'ЧИПТЮН'
    };
    const mix = {scene:'', version:0, rotateAt:0, rotations:0};
    const originalVoice = spaceAudioVoice;
    const originalTrack = spaceAudioTrack;
    const originalSync = spaceAudioSync;
    const originalControls = spaceAudioControls;
    const noiseCache = new WeakMap();
    for (const [key, cue] of Object.entries(cues)) {
      if (!SPACE_THEMES[key]) continue;
      SPACE_THEMES[key].scoreKey = key;
      SPACE_THEMES[key].bpm = cue.bpm;
    }

    function randomNoise(ctx) {
      let buffer = noiseCache.get(ctx);
      if (buffer) return buffer;
      buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .42), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, buffer);
      return buffer;
    }

    // Render brighter, genre-specific instruments while keeping the original FX bus intact.
    const instruments = new Set(['kick','snare','hat','guitar','bass','piano','strings','pad','lead','pluck','chip']);
    spaceAudioVoice = function(ctx, track, note, time, duration, amp, type='sine', pan=0, attack=.04, glide=null) {
      if (!instruments.has(type)) return originalVoice(ctx,track,note,time,duration,amp,type,pan,attack,glide);
      if (!track?.gain || SPACE_AUDIO.voices.size > 66) return;
      const life = Math.max(.075,Math.min(7.8,duration)), target = Math.max(.0002,amp);
      const envelope = ctx.createGain(), nodes=[envelope], sources=[];
      let outlet = envelope;
      if (ctx.createStereoPanner) {
        const stereo = ctx.createStereoPanner();
        stereo.pan.value = Math.max(-.85, Math.min(.85, pan));
        outlet.connect(stereo); stereo.connect(track.gain); nodes.push(stereo);
      } else outlet.connect(track.gain);
      let inlet = envelope;
      if (type==='guitar' || type==='bass' || type==='strings' || type==='pad' || type==='lead') {
        const filter = ctx.createBiquadFilter();
        filter.type='lowpass';
        filter.frequency.value = type==='bass'?850:type==='pad'?1100:type==='strings'?1700:type==='guitar'?2300:3100;
        filter.Q.value = type==='bass'?3.3:.65;
        filter.connect(envelope); inlet=filter; nodes.push(filter);
      }
      if (type==='guitar') {
        const curve = new Float32Array(256);
        for(let i=0;i<256;i++) {const x=i/127.5-1; curve[i]=Math.tanh(x*2.35);}
        const shape=ctx.createWaveShaper();shape.curve=curve;shape.oversample='2x';
        shape.connect(inlet);inlet=shape;nodes.push(shape);
      }
      const freq=440*Math.pow(2,(note-69)/12);
      const addOsc=(wave,offset=0,ratio=1)=>{
        const osc=ctx.createOscillator();
        osc.type=wave;osc.frequency.setValueAtTime(Math.max(20,freq*ratio),time);
        osc.detune.value=offset;osc.connect(inlet);sources.push(osc);return osc;
      };
      let end=time+life;
      if(type==='kick') {
        const osc=addOsc('sine');
        osc.frequency.setValueAtTime(155,time);
        osc.frequency.exponentialRampToValueAtTime(47,time+Math.min(life*.8,.18));
        end=time+Math.min(life,.28);
      } else if(type==='snare'||type==='hat') {
        const src=ctx.createBufferSource();src.buffer=randomNoise(ctx);
        const filter=ctx.createBiquadFilter();filter.type=type==='hat'?'highpass':'bandpass';
        filter.frequency.value=type==='hat'?5900:1850;filter.Q.value=type==='hat'?.6:.8;
        src.connect(filter);filter.connect(inlet);nodes.push(filter);sources.push(src);
        end=time+Math.min(life,type==='hat'?.095:.19);
      } else if(type==='guitar') {addOsc('sawtooth',-7);addOsc('square',7,.997);}
      else if(type==='bass') {addOsc('sawtooth');addOsc('sine',0,.5);}
      else if(type==='piano') {addOsc('triangle');addOsc('sine',0,2);}
      else if(type==='strings') {addOsc('sawtooth',-5);addOsc('triangle',4);}
      else if(type==='pad') {addOsc('triangle',-9);addOsc('sine',9,2);}
      else if(type==='chip') {addOsc('square');}
      else if(type==='lead') {addOsc('sawtooth',-3);addOsc('triangle',3);}
      else {addOsc('triangle');addOsc('sine',0,2);}

      const isSlow=type==='pad'||type==='strings';
      const start=Math.min(end-.01,time+(isSlow?Math.min(.24,life*.2):.004));
      const env=envelope.gain;env.setValueAtTime(.0001,time);
      env.linearRampToValueAtTime(target,start);
      if (isSlow&&life>.5) {
        env.setValueAtTime(target*.78,Math.max(start+.01,end-.28));
        env.exponentialRampToValueAtTime(.0001,end);
      } else env.exponentialRampToValueAtTime(.0001,end);
      let closed=false;
      const voice={track,osc:{stop:(at)=>{for(const src of sources)try{src.stop(at)}catch{}}}};
      const clean=()=>{if(closed)return;closed=true;SPACE_AUDIO.voices.delete(voice);for(const node of [...sources,...nodes])try{node.disconnect()}catch{}};
      if(sources[0])sources[0].onended=clean;
      SPACE_AUDIO.voices.add(voice);
      for(const src of sources){try{src.start(time);src.stop(end+.015)}catch{clean();}}
    };

    spaceAudioTrack = function(key,ctx) {
      const track=originalTrack(key,ctx),cue=cues[key];
      if(cue&&track?.nodes) {
        const filter=track.nodes[1], wet=track.nodes[4], feedback=track.nodes[3];
        if(filter?.frequency)filter.frequency.value=cue.bright;
        if(wet?.gain)wet.gain.value=['ambient','classical','orchestral'].includes(cue.genre)?.23:.12;
        if(feedback?.gain)feedback.gain.value=cue.genre==='ambient'?.29:.16;
      }
      return track;
    };

    function emit(notes,note,duration,volume,type='pluck',pan=0) {
      notes.push({note,duration,amp:volume,type,pan,attack:.015,glide:null});
    }
    // 8 eighth-note steps to the bar. Each scene has its own genre and develops in sections.
    spaceScoreStep = function(theme,index) {
      const key=theme.scoreKey||SPACE_AUDIO.track?.key||'port';
      const cue=cues[key]||cues.port;
      const genre=(mix.version%2===0?cue.genre:cue.alt);
      const bar=Math.floor(index/8), tick=index%8, beat=60/theme.bpm;
      const section=(Math.floor(bar/8)+Math.floor(mix.version/2))%4;
      const home=theme.root+theme.chords[(Math.floor(bar/2)+(mix.version%2))%4];
      const motif=theme.motif[(tick+bar%4*2+mix.version)%8];
      const note=motif===null?home+19:home+motif;
      const notes=[];
      const add=(n,d,a,t,p=0)=>emit(notes,n,d,a,t,p);
      const kick=(v=.10)=>add(36,beat*.4,v,'kick');
      const snare=(v=.068)=>add(45,beat*.28,v,'snare');
      const hat=(v=.027)=>add(82,beat*.12,v,'hat',(tick%2?-.22:.22));
      const bass=(shift=0,v=.062)=>add(home-12+shift,beat*.66,v,'bass');
      const lead=(v=.04)=>{if(motif!==null)add(note,beat*(genre==='chiptune'?.38:.82),v,genre==='chiptune'?'chip':'lead',tick%2?-.3:.3);};
      const harmony=(voice,volume,length=7.3)=>{
        if(tick===0&&bar%2===0)for(const [i,off] of [0,3,7,12].entries())
          add(home+12+off,beat*length,volume,voice,(i-1.5)*.2);
      };

      if(genre==='ambient') {
        harmony('pad',section===2?.020:.026);
        if(tick===0&&bar%2===0)add(home-12,beat*6,.055,'bass');
        if((tick===1||tick===5)&&bar%2===1)add(home+24+(tick===5?7:0),beat*1.2,.027,'pluck',tick===1?-.55:.55);
        if(section===3&&tick===4)lead(.018);
      } else if(genre==='classical') {
        harmony('strings',.023);
        if(tick%2===0)add(home+12+[0,7,3,12][tick/2],beat*.92,.042,'piano',tick%4?.3:-.3);
        if(section!==2&&(tick===3||tick===7))lead(.025);
        if(tick===0&&bar%2===1)add(home-12,beat*1.8,.027,'piano');
      } else if(genre==='orchestral') {
        harmony('strings',.031);
        if(tick===0||tick===4)kick(.055);
        if(tick%2===0)add(home+12+[0,7,12,3][tick/2],beat*.76,.028,'strings');
        if(section!==2&&(tick===1||tick===3||tick===6))lead(.039);
        if(tick===0)bass(0,.055);
      } else if(genre==='techno') {
        if(tick%2===0)kick(.105);
        if(tick===2||tick===6)snare(.054);
        if(tick%2===1)hat(section===2?.021:.035);
        if([0,3,4,7].includes(tick))bass(tick===7?7:0,.072);
        if(section!==2&&(tick===1||tick===5))add(home+24+[0,7][tick===5?1:0],beat*.34,.04,'chip');
        if(tick===0&&bar%4===0)harmony('pad',.015,7.1);
      } else if(genre==='synthwave') {
        if(tick%2===0)kick(.082);
        if(tick===2||tick===6)snare(.05);
        if(tick%2===1)hat(.022);
        harmony('pad',.027,7.6);
        if([0,2,3,4,6].includes(tick))bass(tick===3?7:0,.052);
        if((tick%2===1)&&section!==2)lead(.048);
      } else if(genre==='breakbeat') {
        if([0,3,4,7].includes(tick))kick(tick===0?.11:.075);
        if(tick===2||tick===6)snare(.085);
        hat(tick%2===0?.014:.027);
        if([0,1,4,6].includes(tick))bass(tick===6?7:0,.074);
        if(tick===3||tick===7)lead(.040);
        if(tick===0&&bar%4===0)harmony('pad',.017);
      } else if(genre==='rock'||genre==='industrial') {
        if([0,3,4,6].includes(tick)||(genre==='industrial'&&tick===7))kick(tick===0?.12:.075);
        if(tick===2||tick===6)snare(.079);
        hat(tick%2===0?.018:.032);
        if(tick===0||tick===4) {
          add(home+12,beat*(genre==='industrial'?.72:1.25),.036,'guitar',-.22);
          add(home+19,beat*(genre==='industrial'?.72:1.25),.030,'guitar',.22);
        } else if(genre==='industrial'&&tick%2===1) add(home+12,beat*.24,.021,'guitar',-.2);
        if(tick===0||tick===3||tick===4||tick===6)bass(tick===6?7:0,.070);
        if(section!==2&&(tick===1||tick===5)&&bar%2===1)lead(.034);
      } else if(genre==='chiptune') {
        if(tick%2===0)kick(.081);
        if(tick===2||tick===6)snare(.056);
        if(tick%2===1)hat(.014);
        if([0,2,4,6].includes(tick))bass(tick===6?7:0,.059);
        add(home+12+[0,7,12,15,19,15,12,7][(tick+bar)%8],beat*.34,.031,'chip',tick%2?.32:-.32);
        if([1,3,5,7].includes(tick))lead(.039);
      }
      // Rest and evolving arrangement: instrumental drops, fills, motif changes.
      if(section===2&&['rock','techno','breakbeat','industrial','chiptune'].includes(genre)) {
        return notes.filter(n=>n.type==='kick'||n.type==='bass'||(tick===6&&n.type==='snare'));
      }
      if(section===3&&tick===7&&['rock','techno','breakbeat','industrial','chiptune'].includes(genre)) {
        snare(.052);hat(.016);
      }
      return notes;
    };

    function stopCurrentTrack() {
      const ctx=ARCADE.audio;
      if(ctx&&SPACE_AUDIO.track) {
        spaceAudioRetire(SPACE_AUDIO.track,ctx.currentTime);
        SPACE_AUDIO.track=null;SPACE_AUDIO.theme='';
      }
    }
    function rotate() {
      if(STATE.view!=='arcade')return;
      mix.version=(mix.version+1)%4;
      mix.rotations++;
      mix.rotateAt=Date.now()+110000;
      stopCurrentTrack();
      originalSync(ARCADE.engine);
      spaceAudioControls();
    }
    spaceAudioSync = function(engine=ARCADE.engine) {
      const key=spaceAudioScene(engine);
      if(key!==mix.scene) {
        mix.scene=key;mix.version=0;mix.rotateAt=Date.now()+110000;
      } else if(SPACE_AUDIO.music&&engine?.status==='playing'&&STATE.view==='arcade'&&
                !document.hidden&&Date.now()>=mix.rotateAt) rotate();
      return originalSync(engine);
    };
    spaceAudioControls = function(...args) {
      originalControls(...args);
      if(STATE.view!=='arcade')return;
      const cue=cues[spaceAudioScene(ARCADE.engine)]||cues.port;
      const genre=mix.version%2?cue.alt:cue.genre;
      const label=document.getElementById('space-track-name');
      if(label)label.textContent=cue.title+' · '+genreLabels[genre]+' · '+(mix.version+1)+'/4';
      const wrap=document.querySelector('.space-audio-buttons');
      if(wrap&&!wrap.querySelector('[data-action="soundtrack-next"]')) {
        const button=document.createElement('button');
        button.type='button';button.dataset.action='soundtrack-next';
        button.textContent='След. тема ↻';button.title='Сменить музыкальную аранжировку без перезапуска игры';
        button.setAttribute('aria-label','Следующая музыкальная тема');
        wrap.appendChild(button);
      }
    };
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-action="soundtrack-next"]');
      if(!button)return;
      event.preventDefault();event.stopImmediatePropagation();rotate();
    },true);
    const style=document.createElement('style');
    style.textContent='.space-audio-buttons [data-action="soundtrack-next"]{white-space:nowrap;cursor:pointer}.space-audio-panel #space-track-name{max-width:100%;line-height:1.25}@media(max-width:700px){.space-audio-buttons [data-action="soundtrack-next"]{font-size:11px;padding:7px 9px}}';
    document.head.appendChild(style);
    // If the user enters Arcade without reloading the page, the new controls appear on next UI update.
    if(typeof window!=='undefined')window.citadelSoundtrack={version:'1.3.6',cues:Object.keys(cues),next:rotate};
    if(STATE.view==='arcade')spaceAudioControls();
  } catch(error) {
    console.warn('Citadel soundtrack patch disabled; original audio retained.',error);
  }
})();