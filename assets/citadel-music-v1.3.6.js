/* Citadel CSII sound hotfix 1.3.6: locally synthesized genre-aware score.
   No external recordings, downloads, cookies or additional permissions.
   The original FX, music toggle, pause and volume settings are preserved. */
(function () {
  'use strict';
  if (typeof SPACE_THEMES === 'undefined' ||
      typeof SPACE_AUDIO === 'undefined' ||
      typeof spaceAudioTrack !== 'function' ||
      typeof spaceAudioScene !== 'function') return;

  const styles = {
    port:          ['Нулевая гравитация · эмбиент',72,'ambient'],
    orbit0:        ['Первая редакция · техно',126,'techno'],
    deck0:         ['Архив ФЗ · камерная классика',94,'classical'],
    hyper0:        ['Гиперпереход I · хард-рок',142,'rock'],
    orbit1:        ['Орбитальный патруль · синтвейв',112,'synthwave'],
    deck1:         ['Коридоры исполнителя · неоклассика',90,'classical'],
    hyper1:        ['Гиперпереход II · брейкбит',146,'breakbeat'],
    orbit2:        ['Тихая граница · космический эмбиент',70,'ambient'],
    deck2:         ['Переход смежников · индастриал',132,'industrial'],
    hyper2:        ['Гиперпереход III · симфоник-метал',152,'metal'],
    orbit3:        ['Последняя редакция · транс',134,'trance'],
    deck3:         ['Зал согласования · оркестр',108,'orchestral'],
    finaleBoss:    ['Параллакс · индастриал-метал',148,'metal'],
    finaleLair:    ['Архив нулевой редакции · дарк-эмбиент',62,'darkambient'],
    finaleMRG:     ['Протокол МРГ · аркадный рок',162,'chiptune'],
    finaleVictory: ['Команда на связи · симфония',88,'orchestral']
  };
  for (const [key, fields] of Object.entries(styles)) {
    if (SPACE_THEMES[key]) Object.assign(SPACE_THEMES[key],
      {name:fields[0],bpm:fields[1],style:fields[2]});
  }

  const oldTrack = spaceAudioTrack;
  spaceAudioTrack = function(key, ctx) {
    const track = oldTrack(key,ctx), kind = SPACE_THEMES[key].style;
    const filter = track.nodes[1];
    if(filter){
      filter.frequency.value = ['ambient','darkambient'].includes(kind) ? 2600 :
        ['classical','orchestral'].includes(kind) ? 4100 : 5900;
      filter.Q.value = 0.55;
    }
    const delay=track.nodes[2], feedback=track.nodes[3], wet=track.nodes[4];
    if(delay) delay.delayTime.value = (60/SPACE_THEMES[key].bpm)*.75;
    if(feedback) feedback.gain.value = kind==='ambient'||kind==='darkambient'?.32:.15;
    if(wet) wet.gain.value = kind==='ambient'||kind==='darkambient'?.25:.105;
    return track;
  };

  let cachedNoise=null, noiseContext=null;
  function noiseBuffer(ctx) {
    if(cachedNoise && ctx===noiseContext) return cachedNoise;
    noiseContext=ctx;
    const frames=Math.round(ctx.sampleRate*.35);
    cachedNoise=ctx.createBuffer(1,frames,ctx.sampleRate);
    const data=cachedNoise.getChannelData(0);
    let seed=17413;
    for(let i=0;i<data.length;i++){
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      data[i]=(seed/2147483648)-1;
    }
    return cachedNoise;
  }
  function drum(ctx,track,part,when,level) {
    if (part==='kick'||part==='timpani') {
      const o=ctx.createOscillator(),g=ctx.createGain(),long=part==='timpani',
            span=long?.43:.19;
      o.type='sine';
      o.frequency.setValueAtTime(long?105:165,when);
      o.frequency.exponentialRampToValueAtTime(long?52:47,when+span*.7);
      g.gain.setValueAtTime(.0001,when);
      g.gain.linearRampToValueAtTime(level*(long?.53:1),when+.007);
      g.gain.exponentialRampToValueAtTime(.0001,when+span);
      o.connect(g).connect(track.gain);
      o.start(when);o.stop(when+span+.02);
      o.onended=()=>{o.disconnect();g.disconnect()};
      return;
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),
          g=ctx.createGain(),span=part==='snare'?.16:part==='crash'?.31:.065;
    source.buffer=noiseBuffer(ctx);
    filter.type=part==='snare'?'bandpass':'highpass';
    filter.frequency.value=part==='snare'?1800:part==='crash'?4700:7200;
    filter.Q.value=part==='snare'?.8:.5;
    g.gain.setValueAtTime(Math.max(.0001,level),when);
    g.gain.exponentialRampToValueAtTime(.0001,when+span);
    source.connect(filter).connect(g).connect(track.gain);
    source.start(when);source.stop(when+span+.01);
    source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect()};
  }

  const instrument = {
    pad:       {waves:['sine','triangle'],detune:[0,5],cut:1900,attack:.30,tail:.95},
    air:       {waves:['sine','sine'],detune:[0,8],cut:3400,attack:.14,tail:.85},
    piano:     {waves:['triangle','sine'],detune:[0,3],cut:4500,attack:.009,tail:.08},
    strings:   {waves:['sawtooth','triangle'],detune:[-4,4],cut:1750,attack:.13,tail:.60},
    pizz:      {waves:['triangle','sine'],detune:[0,0],cut:2300,attack:.008,tail:.08},
    bass:      {waves:['triangle','sawtooth'],detune:[0,1],cut:560,attack:.009,tail:.06},
    acid:      {waves:['sawtooth','square'],detune:[0,4],cut:850,attack:.012,tail:.12},
    lead:      {waves:['sawtooth','triangle'],detune:[-4,4],cut:2400,attack:.02,tail:.17},
    guitar:    {waves:['sawtooth','sawtooth'],detune:[-8,8],cut:2850,attack:.008,tail:.08},
    chip:      {waves:['square','triangle'],detune:[0,0],cut:3900,attack:.003,tail:.02},
    bell:      {waves:['sine','triangle'],detune:[0,0],cut:5000,attack:.006,tail:.18}
  };
  function voice(ctx,track,event,when) {
    if(SPACE_AUDIO.voices.size>=62) return;
    const def=instrument[event.inst]||instrument.piano,
          duration=Math.max(.07,Math.min(5,event.duration)),
          freq=440*Math.pow(2,(event.note-69)/12),
          amp=event.amp,
          env=ctx.createGain(),filter=ctx.createBiquadFilter(),
          pan=ctx.createStereoPanner?.(),oscs=[];
    filter.type='lowpass';filter.frequency.value=def.cut;filter.Q.value=.65;
    env.gain.setValueAtTime(.0001,when);
    const attack=Math.min(duration*.23,def.attack);
    env.gain.linearRampToValueAtTime(amp,when+attack);
    const hold=Math.max(when+attack+.008,when+duration-(def.tail*.22));
    if(hold<when+duration)env.gain.setValueAtTime(amp*.63,hold);
    env.gain.exponentialRampToValueAtTime(.0001,when+duration);
    filter.connect(env);
    if(pan){pan.pan.value=event.pan||0;env.connect(pan);pan.connect(track.gain);}
    else env.connect(track.gain);
    for(let i=0;i<def.waves.length;i++){
      const o=ctx.createOscillator();oscs.push(o);o.type=def.waves[i];
      o.frequency.setValueAtTime(freq,when);
      o.detune.setValueAtTime(def.detune[i],when);
      if(event.inst==='acid')o.frequency.exponentialRampToValueAtTime(freq*.96,when+duration);
      o.connect(filter);o.start(when);o.stop(when+duration+.012);
    }
    const active={osc:oscs[0],track};
    SPACE_AUDIO.voices.add(active);
    oscs[0].onended=()=>{for(const o of oscs)try{o.disconnect()}catch{}
      filter.disconnect();env.disconnect();pan?.disconnect();
      SPACE_AUDIO.voices.delete(active);};
  }

  function compose(theme,index) {
    const style=theme.style||'ambient',beat=60/theme.bpm,
          step=index%8,bar=Math.floor(index/8),
          phrase=Math.floor(bar/8)%4,section=Math.floor(bar/16)%4,
          chord=theme.chords[Math.floor(bar/2)%theme.chords.length],
          root=theme.root+chord,
          energy=section===1||section===3,
          fill=bar%8===7, notes=[],percussion=[];
    const put=(note,beats,amp,inst,pan=0)=>notes.push(
      {note,duration:beat*beats,amp,inst,pan});
    const hit=(part,amp,off=0)=>percussion.push({part,amp,off});
    const melody=theme.motif[(step+phrase*2)%8],
          lead=root+(melody===null?19:melody)+(energy?12:0);
    const verseMod=bar%16<8?0:3;
    if(style==='ambient'||style==='darkambient'){
      if(step===0&&bar%2===0){
        for(const [degree,pan] of [[12,-.30],[15,0],[19,.28],[24,.1]])
          put(root+degree,7.4,style==='darkambient'?.011:.018,'pad',pan);
        put(root-12,5.5,.034,'air',-.15);
      }
      if((step===2||step===6||step===4&&bar%2===0)&&melody!==null)
        put(root+melody+12,2.8,.024,bar%2?'bell':'air',step===6?.34:-.30);
      if(step===0&&bar%4===3)put(root+7,3.7,.019,'strings',.35);
      return {notes,percussion};
    }
    if(style==='classical'||style==='orchestral'){
      if(step===0){
        put(root,5.8,.032,style==='orchestral'?'strings':'piano',-.1);
        for(const iv of [12,15,19])put(root+iv,6.9,style==='orchestral'?.019:.012,
          'strings',iv===19?.25:-.18);
      }
      if([0,2,4,6].includes(step))put(root+[12,19,24,15][(step/2+phrase)%4],
        style==='orchestral'?1.7:1.12,.039,'piano',step%4===0?-.24:.25);
      if((step===1||step===5||step===7)&&energy)
        put(root+[19,24,15][(step+phrase)%3]+12,1.35,.021,
          style==='orchestral'?'strings':'pizz',.32);
      if(step===6&&melody!==null)put(root+melody+12,2.7,.03,'strings',.15);
      if(style==='orchestral'&&step===0&&bar%2===0)hit('timpani',.058);
      if(style==='orchestral'&&step===0&&fill)hit('crash',.014);
      return {notes,percussion};
    }
    if(style==='techno'||style==='trance'||style==='synthwave'){
      if(step%2===0)hit('kick',style==='techno'?.13:.108);
      if(step===2||step===6)hit('snare',style==='synthwave'?.038:.027);
      if(step%2===1)hit('hat',.015);
      else if(energy)hit('hat',.006);
      if(step===0)for(const iv of [12,15,19])put(root+iv,3.6,.015,'pad');
      if(step===0||step===3||step===5||step===7)
        put(root-12+[0,0,7,12][step%4],.72,.063,
          style==='techno'?'acid':'bass',-.18);
      if((step===1||step===3||step===6||step===7)&&melody!==null)
        put(root+melody+verseMod,style==='trance'?1.75:.8,
          energy?.046:.031,style==='synthwave'?'lead':'acid',step%2?.26:-.26);
      if(style==='trance'&&energy&&step===4)put(root+31,2.9,.034,'lead',.35);
      return {notes,percussion};
    }
    if(style==='rock'||style==='metal'||style==='industrial'){
      const heavy=style==='metal',mechanical=style==='industrial';
      if([0,3,4,6].includes(step)||(heavy&&[1,5,7].includes(step)))
        hit('kick',heavy?.117:.102);
      if(step===2||step===6)hit('snare',.060);
      if(step%2===0||mechanical)hit('hat',mechanical?.015:.012);
      if(step===0&&fill)hit('crash',.030);
      if([0,1,3,4,6,7].includes(step)){
        const d=step>=4?7:0;
        put(root+d+12,heavy?.80:.66,.029,'guitar',-.35);
        put(root+d+19,heavy?.80:.66,.026,'guitar',.35);
        put(root-12+d,.60,.064,'bass',0);
      }
      if(energy&&(step===2||step===5||step===7)&&melody!==null)
        put(root+melody+12+verseMod,1.25,.043,'lead',.17);
      if(heavy&&step===0&&bar%2===0)
        for(const d of [12,19,24])put(root+d,4.1,.014,'strings',0);
      return {notes,percussion};
    }
    if(style==='breakbeat'){
      if([0,3,5].includes(step))hit('kick',.116);
      if([2,6].includes(step))hit('snare',.058);
      hit('hat',step%2?.012:.019);
      if(fill&&step===7)hit('snare',.025,.075);
      if(step===0||step===3||step===5)put(root-12+[0,7,3][step%3],
        .75,.066,'bass');
      if(step%2===1&&melody!==null)put(root+melody+verseMod,
        .82,.041,'lead',step===3?.35:-.35);
      if(step===0)for(const d of [12,15,19])put(root+d,3.2,.013,'pad');
      return {notes,percussion};
    }
    if(style==='chiptune'){
      if([0,3,4,6].includes(step))hit('kick',.088);
      if([2,6].includes(step))hit('snare',.041);
      if(step%2===1)hit('hat',.009);
      put(root-12+[0,0,7,12,0,7,10,7][step],.45,.059,'bass');
      put(root+12+[0,7,12,10,7,3,5,7][(step+phrase)%8]+verseMod,
        .65,.046,'chip',step%2?.25:-.25);
      if(step===0||step===4)for(const d of [12,19])
        put(root+d,.73,.022,'guitar');
      return {notes,percussion};
    }
    return {notes,percussion};
  }

  spaceAudioSync = function(e=ARCADE.engine){
    const ctx=ARCADE.audio;
    if(!ctx||!SPACE_AUDIO.ready)return;
    if(STATE.view!=='arcade'||document.hidden||!SPACE_AUDIO.music){
      if(SPACE_AUDIO.track){
        spaceAudioRetire(SPACE_AUDIO.track,ctx.currentTime);
        SPACE_AUDIO.track=null;SPACE_AUDIO.theme='';
      }
      return;
    }
    if(ctx.state!=='running')return;
    const key=spaceAudioScene(e),
          track=SPACE_AUDIO.track?.key===key?SPACE_AUDIO.track:spaceAudioTrack(key,ctx),
          theme=SPACE_THEMES[key];
    if(!theme)return;
    const duck=['lesson','remark','finalcheck','paused'].includes(e?.status)?.28:
      ['menu','briefing','escortbrief','finalebrief'].includes(e?.status)?.65:1;
    const volume=SPACE_AUDIO.volume*duck;
    if(track.volume!==volume){
      track.volume=volume;
      spaceAudioGain(track.gain.gain,volume,ctx.currentTime,.34);
    }
    if(SPACE_AUDIO.next<ctx.currentTime-.2)SPACE_AUDIO.next=ctx.currentTime+.04;
    let count=0;
    while(SPACE_AUDIO.next<ctx.currentTime+.39&&count++<8){
      const when=SPACE_AUDIO.next,beat=60/theme.bpm,
            scheduled=compose(theme,SPACE_AUDIO.step);
      for(const ev of scheduled.notes)voice(ctx,track,ev,when);
      for(const ev of scheduled.percussion)drum(ctx,track,ev.part,when+ev.off,ev.amp);
      SPACE_AUDIO.next+=beat/2;SPACE_AUDIO.step++;
    }
  };
  globalThis.CITADEL_MUSIC_VERSION='1.3.6';
})();