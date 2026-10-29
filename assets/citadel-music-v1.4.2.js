/* «Цитадель ЦСИИ» · music 1.4.2
   One catalogue and the original genre-aware 1.3.6 composer.
   Synthesized locally with Web Audio; no recordings or external dependencies.
   Load after the game core, instead of both previous 1.3.6 music patches. */
(function () {
  'use strict';
  if (typeof SPACE_THEMES === 'undefined' || typeof SPACE_AUDIO === 'undefined' ||
      typeof spaceAudioTrack !== 'function' || typeof spaceAudioScene !== 'function' ||
      globalThis.CITADEL_MUSIC_VERSION === '1.4.2') return;

  const VERSION = '1.4.2';
  const catalogue = Object.freeze([
    ['port', 'Нулевая гравитация', 'Космический эмбиент', 72, 'ambient'],
    ['orbit0', 'Первая редакция', 'Техно', 126, 'techno'],
    ['deck0', 'Архив ФЗ', 'Камерная классика', 94, 'classical'],
    ['hyper0', 'Гиперпереход I', 'Хард-рок', 142, 'rock'],
    ['orbit1', 'Орбитальный патруль', 'Синтвейв', 112, 'synthwave'],
    ['deck1', 'Коридоры исполнителя', 'Неоклассика', 90, 'classical'],
    ['hyper1', 'Гиперпереход II', 'Брейкбит', 146, 'breakbeat'],
    ['orbit2', 'Тихая граница', 'Космический эмбиент', 70, 'ambient'],
    ['swarm280', 'Пиксельная эскадрилья', '8-бит · разведка', 148, 'arcade8'],
    ['swarm280Assault', 'Ответить всем', '8-бит · атака', 164, 'arcade8'],
    ['swarm280Final', 'Последний кредит', '8-бит · финальная волна', 176, 'arcade8'],
    ['pursuit280', 'На хвосте у ФЗ', 'Космический брейкбит', 140, 'breakbeat'],
    ['pursuit280Final', 'Сквозь разлом', 'Тёмный синтвейв', 154, 'synthwave'],
    ['deck2', 'Переход смежников', 'Индастриал', 132, 'industrial'],
    ['hyper2', 'Гиперпереход III', 'Симфоник-метал', 152, 'metal'],
    ['orbit3', 'Последняя редакция', 'Транс', 134, 'trance'],
    ['deck3', 'Зал согласования', 'Оркестр', 108, 'orchestral'],
    ['finaleBoss', 'Параллакс', 'Индастриал-метал', 148, 'metal'],
    ['finaleLair', 'Архив нулевой редакции', 'Дарк-эмбиент', 62, 'darkambient'],
    ['finaleMRG', 'Протокол МРГ', 'Чиптюн с гитарой', 162, 'chiptune'],
    ['finaleVictory', 'Команда на связи', 'Симфонический оркестр', 88, 'orchestral']
  ].map(([key, name, genre, bpm, style]) => Object.freeze({key, name, genre, bpm, style})));
  const byKey = new Map(catalogue.map(cue => [cue.key, cue]));
  Object.assign(SPACE_THEMES, {
    swarm280: {root:45,chords:[0,5,3,7,0,3,5,7],motif:[12,19,24,22,19,15,17,19],kind:'orbit',arcadeStage:0},
    swarm280Assault: {root:45,chords:[0,3,5,7,5,3,0,7],motif:[24,19,22,15,24,26,22,19],kind:'orbit',arcadeStage:1},
    swarm280Final: {root:45,chords:[0,1,5,7,0,3,1,7],motif:[24,25,31,27,24,22,19,25],kind:'orbit',arcadeStage:2},
    pursuit280: {root:42,chords:[0,3,5,7],motif:[12,19,15,22,19,14,17,22],kind:'hyper'},
    pursuit280Final: {root:42,chords:[0,1,5,7],motif:[24,19,25,22,17,19,26,22],kind:'hyper'}
  });
  for (const cue of catalogue) {
    if (SPACE_THEMES[cue.key]) Object.assign(SPACE_THEMES[cue.key], {
      name: cue.name + ' · ' + cue.genre, bpm: cue.bpm, style: cue.style
    });
  }

  const original = {
    track: spaceAudioTrack, retire: spaceAudioRetire, stop: spaceAudioStop,
    save: spaceAudioSave, action: spaceAudioAction, controls: spaceAudioControls
  };
  const playback = {mode: 'auto', key: null, savedEnabled: null, serial: 0, disposed: false};
  // Music cannot exhaust the core voice pool used by combat effects.
  const musicVoices = new Set(), musicTracks = new Set();
  let pickerKey = null, notice = '';

  function sceneKey(engine = ARCADE.engine) {
    if(engine && engine.status!=='menu') {
      if(engine.phase==='swarm') {const wave=engine.swarm?.waveIndex??0;return wave>=4?'swarm280Final':wave>=2?'swarm280Assault':'swarm280';}
      if(engine.phase==='pursuit') return (engine.pursuit?.chapter??0)>=2?'pursuit280Final':'pursuit280';
    }
    const key = spaceAudioScene(engine);
    return byKey.has(key) ? key : 'port';
  }
  function selectedKey(engine = ARCADE.engine) {
    return playback.mode !== 'auto' && byKey.has(playback.key) ? playback.key : sceneKey(engine);
  }
  function registerVoice(track, sources, nodes, end, when) {
    let closed = false;
    const active = {track, stop(at) {
      for (const source of sources) try { source.stop(at); } catch (_) {}
    }, clean() {
      if (closed) return;
      closed = true;
      musicVoices.delete(active);
      track.musicVoices?.delete(active);
      for (const node of [...sources, ...nodes]) try { node.disconnect(); } catch (_) {}
    }};
    musicVoices.add(active);
    track.musicVoices.add(active);
    sources[0].onended = active.clean;
    try {
      for (const source of sources) { source.start(when); source.stop(end); }
    } catch (_) {
      active.stop(when);
      active.clean();
    }
  }
  spaceAudioRetire = function (track, now) {
    if (track && !track.retired && track.musicVoices) {
      for (const active of track.musicVoices) active.stop(now + .7);
      setTimeout(() => musicTracks.delete(track), 1850);
    }
    return original.retire(track, now);
  };
  spaceAudioTrack = function (key, ctx) {
    if (!byKey.has(key)) key = 'port';
    const track = original.track(key, ctx), kind = byKey.get(key).style;
    track.musicVoices = new Set();
    musicTracks.add(track);
    const filter = track.nodes[1], delay = track.nodes[2], feedback = track.nodes[3], wet = track.nodes[4];
    filter.frequency.value = ['ambient', 'darkambient'].includes(kind) ? 2600 :
      ['classical', 'orchestral'].includes(kind) ? 4100 : 5900;
    filter.Q.value = .55;
    delay.delayTime.value = 60 / byKey.get(key).bpm * .75;
    feedback.gain.value = ['ambient', 'darkambient'].includes(kind) ? .32 : .15;
    wet.gain.value = ['ambient', 'darkambient'].includes(kind) ? .25 : .105;
    return track;
  };

  let cachedNoise = null, noiseContext = null;
  function noiseBuffer(ctx) {
    if (cachedNoise && ctx === noiseContext) return cachedNoise;
    noiseContext = ctx;
    cachedNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate * .35), ctx.sampleRate);
    const data = cachedNoise.getChannelData(0);
    let seed = 17413;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    return cachedNoise;
  }
  function drum(ctx, track, part, when, level) {
    if (musicVoices.size >= 72) return;
    const gain = ctx.createGain();
    if (part === 'kick' || part === 'timpani') {
      const osc = ctx.createOscillator(), long = part === 'timpani', span = long ? .43 : .19;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(long ? 105 : 165, when);
      osc.frequency.exponentialRampToValueAtTime(long ? 52 : 47, when + span * .7);
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.linearRampToValueAtTime(level * (long ? .53 : 1), when + .007);
      gain.gain.exponentialRampToValueAtTime(.0001, when + span);
      osc.connect(gain).connect(track.gain);
      registerVoice(track, [osc], [gain], when + span + .02, when);
      return;
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    const span = part === 'snare' ? .16 : part === 'crash' ? .31 : .065;
    source.buffer = noiseBuffer(ctx);
    filter.type = part === 'snare' ? 'bandpass' : 'highpass';
    filter.frequency.value = part === 'snare' ? 1800 : part === 'crash' ? 4700 : 7200;
    filter.Q.value = part === 'snare' ? .8 : .5;
    gain.gain.setValueAtTime(Math.max(.0001, level), when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + span);
    source.connect(filter).connect(gain).connect(track.gain);
    registerVoice(track, [source], [filter, gain], when + span + .01, when);
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
    bell:      {waves:['sine','triangle'],detune:[0,0],cut:5000,attack:.006,tail:.18},
    pulse8:    {waves:['square'],detune:[0],cut:5200,attack:.002,tail:.015},
    triangle8:{waves:['triangle'],detune:[0],cut:1800,attack:.003,tail:.025}
  };
  function voice(ctx, track, event, when) {
    if (musicVoices.size >= 62) return;
    const def = instrument[event.inst] || instrument.piano;
    const duration = Math.max(.07, Math.min(5, event.duration));
    const freq = 440 * Math.pow(2, (event.note - 69) / 12);
    const env = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner?.();
    const oscs = [], nodes = [filter, env];
    filter.type = 'lowpass'; filter.frequency.value = def.cut; filter.Q.value = .65;
    env.gain.setValueAtTime(.0001, when);
    const attack = Math.min(duration * .23, def.attack);
    env.gain.linearRampToValueAtTime(event.amp, when + attack);
    const hold = Math.max(when + attack + .008, when + duration - def.tail * .22);
    if (hold < when + duration) env.gain.setValueAtTime(event.amp * .63, hold);
    env.gain.exponentialRampToValueAtTime(.0001, when + duration);
    filter.connect(env);
    if (pan) { pan.pan.value = event.pan || 0; env.connect(pan); pan.connect(track.gain); nodes.push(pan); }
    else env.connect(track.gain);
    for (let i = 0; i < def.waves.length; i++) {
      const osc = ctx.createOscillator(); oscs.push(osc); osc.type = def.waves[i];
      osc.frequency.setValueAtTime(freq, when);
      osc.detune.setValueAtTime(def.detune[i], when);
      if (event.inst === 'acid') osc.frequency.exponentialRampToValueAtTime(freq * .96, when + duration);
      osc.connect(filter);
    }
    registerVoice(track, oscs, nodes, when + duration + .012, when);
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
    // Original, deliberately recognisable arcade score: four eight-bar
    // sections, different bass/melody lines and late-wave counterpoint.
    // No sampled music or melodies copied from an existing game.
    if(style==='arcade8'){
      const act=theme.arcadeStage||0, part=Math.floor(bar/8)%4, turn=bar%8;
      const phrases=[
        [12,19,24,null,22,19,15,17,19,null,24,26,22,19,17,null],
        [24,22,19,15,17,null,19,22,24,31,27,26,24,null,22,19],
        [12,null,15,19,null,22,24,null,19,17,null,15,14,null,19,22],
        [24,19,27,26,24,22,19,17,19,22,24,31,29,27,26,24]
      ];
      const pos=(bar%2)*8+step, tune=phrases[(part+act)%4][pos];
      if(tune!==null)put(root+tune+(part===3?12:0),step%4===0?.72:.40,.040,'pulse8',-.20);
      const bass=[0,12,0,7,0,12,7,10][(step+part*2)%8];
      if(part!==2||step%2===0)put(root-12+bass,.44,.065,'triangle8',.05);
      if((act>0||part===1||part===3)&&step%2===1)
        put(root+[12,15,19,24][(step+turn)%4],.24,.021,'pulse8',.26);
      if(part!==2||step%4===0){
        if([0,4].includes(step)||act===2&&step===3)hit('kick',.085);
        if([2,6].includes(step))hit('snare',.032);
        if(step%2===1||act===2)hit('hat',.008);
      }
      if(turn===7&&step>=6){hit('snare',.027);hit('hat',.009,.07);}
      return {notes,percussion};
    }
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
      if(section===2&&bar%4<2){if(step===0)for(const iv of [0,15,19])put(root+iv,3.6,.024,'pad');if(step===3||step===7)put(root+melody+12,.7,.037,'bell',.2);return {notes,percussion};}
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
      if(section===2&&bar%4<2){if(step===0)put(root-12,3.2,.047,'bass');if(step%2===1)put(root+melody+12,.55,.031,'bell',step%4===1?-.3:.3);if(step===6)hit('snare',.035);return {notes,percussion};}
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


  function silenceMusic(immediate = false) {
    const ctx = ARCADE.audio;
    if (ctx) {
      if (ctx.state !== 'running') immediate = true;
      spaceAudioRetire(SPACE_AUDIO.track, ctx.currentTime);
      for (const track of musicTracks) {
        const fade = immediate ? .008 : .035, end = ctx.currentTime + (immediate ? .03 : .18);
        spaceAudioGain(track.gain.gain, 0, ctx.currentTime, fade);
        if (track.nodes[4]?.gain) spaceAudioGain(track.nodes[4].gain, 0, ctx.currentTime, fade);
        for (const active of [...track.musicVoices]) {
          active.stop(end);
          // A suspended AudioContext may not dispatch onended until much later.
          if (immediate) active.clean();
        }
      }
    }
    SPACE_AUDIO.track = null;
    SPACE_AUDIO.theme = '';
  }
  function restoreAuto() {
    if (playback.savedEnabled !== null) SPACE_AUDIO.music = playback.savedEnabled;
    playback.savedEnabled = null;
    playback.mode = 'auto';
    playback.key = null;
    pickerKey = null;
  }
  spaceAudioSync = function (engine = ARCADE.engine) {
    const ctx = ARCADE.audio;
    if (STATE.view !== 'arcade' || document.hidden || playback.disposed) {
      silenceMusic(true);
      return;
    }
    if (!SPACE_AUDIO.music || playback.mode === 'stopped') {
      if (SPACE_AUDIO.track) silenceMusic();
      return;
    }
    if (!ctx || !SPACE_AUDIO.ready || ctx.state !== 'running') return;
    const key = selectedKey(engine), theme = SPACE_THEMES[key];
    if (!theme) return;
    const track = SPACE_AUDIO.track?.key === key ? SPACE_AUDIO.track : spaceAudioTrack(key, ctx);
    // Audition is deliberately audible in the menu and on pause.
    const duck = playback.mode === 'preview' ? 1 :
      ['lesson', 'remark', 'finalcheck', 'paused'].includes(engine?.status) ? .28 :
      ['menu', 'briefing', 'escortbrief', 'finalebrief'].includes(engine?.status) ? .65 : 1;
    const volume = SPACE_AUDIO.volume * duck;
    if (track.volume !== volume) {
      track.volume = volume;
      spaceAudioGain(track.gain.gain, volume, ctx.currentTime, .34);
    }
    if (SPACE_AUDIO.next < ctx.currentTime - .2) SPACE_AUDIO.next = ctx.currentTime + .04;
    let count = 0;
    while (SPACE_AUDIO.next < ctx.currentTime + .39 && count++ < 8) {
      const when = SPACE_AUDIO.next, scheduled = compose(theme, SPACE_AUDIO.step);
      for (const event of scheduled.notes) voice(ctx, track, event, when);
      for (const event of scheduled.percussion) drum(ctx, track, event.part, when + event.off, event.amp);
      SPACE_AUDIO.next += 30 / theme.bpm;
      SPACE_AUDIO.step++;
    }
  };

  function status() {
    const ctx = ARCADE.audio, key = selectedKey();
    let reason = null;
    if (playback.disposed) reason = 'disposed';
    else if (STATE.view !== 'arcade') reason = 'outside-game';
    else if (document.hidden) reason = 'hidden';
    else if (playback.mode === 'stopped') reason = 'stopped';
    else if (!SPACE_AUDIO.music) reason = 'disabled';
    else if (!ctx || !SPACE_AUDIO.ready) reason = 'audio-unavailable';
    else if (ctx.state !== 'running') reason = 'audio-suspended';
    else if (!SPACE_AUDIO.track) reason = 'idle';
    const activeKey = !reason ? SPACE_AUDIO.track.key : null;
    return {
      version: VERSION, build: '280r1', mode: playback.mode, selectedKey: key, activeKey,
      sceneKey: sceneKey(), selected: byKey.get(key), active: byKey.get(activeKey) || null,
      enabled: SPACE_AUDIO.music, autoEnabled: playback.savedEnabled ?? SPACE_AUDIO.music,
      volume: SPACE_AUDIO.volume, contextState: ctx?.state || 'unavailable',
      playing: !reason, reason, voices: musicVoices.size
    };
  }
  function result(ok, reason = null) { return {ok, reason, status: status()}; }
  async function startAudio(serial) {
    const ctx = spaceAudioUnlock() || ARCADE.audio;
    if (!ctx) return result(false, 'audio-unavailable');
    if (ctx.state !== 'running') {
      // A browser may keep resume pending without user activation (e.g. a hidden
      // iframe). Return a truthful status instead of leaving the UI waiting forever.
      let timer;
      try {
        await Promise.race([
          Promise.resolve(ctx.resume()),
          new Promise(resolve => { timer = setTimeout(resolve, 900); })
        ]);
      } catch (_) {
        return result(false, 'audio-suspended');
      } finally { clearTimeout(timer); }
    }
    if (serial !== playback.serial) return result(false, 'superseded');
    spaceAudioSync();
    spaceAudioControls();
    const current = status();
    return result(current.playing, current.reason);
  }
  async function preview(key) {
    if (!byKey.has(key)) return result(false, 'unknown-theme');
    if (playback.disposed) return result(false, 'disposed');
    if (STATE.view !== 'arcade') return result(false, 'outside-game');
    if (document.hidden) return result(false, 'hidden');
    if (playback.savedEnabled === null) playback.savedEnabled = SPACE_AUDIO.music;
    playback.mode = 'preview'; playback.key = key; pickerKey = key;
    SPACE_AUDIO.music = true;
    notice = '';
    const serial = ++playback.serial;
    // Re-listening to the selected theme starts its first phrase again.
    if (SPACE_AUDIO.track?.key === key) {
      spaceAudioRetire(SPACE_AUDIO.track, ARCADE.audio.currentTime);
      SPACE_AUDIO.track = null; SPACE_AUDIO.theme = '';
    }
    return startAudio(serial);
  }
  function stop() {
    if (playback.disposed) return result(false, 'disposed');
    if (playback.savedEnabled === null) playback.savedEnabled = SPACE_AUDIO.music;
    playback.key = selectedKey();
    playback.mode = 'stopped'; playback.serial++;
    SPACE_AUDIO.music = false;
    silenceMusic();
    notice = '';
    spaceAudioControls();
    return result(true);
  }
  async function resumeAuto() {
    if (playback.disposed) return result(false, 'disposed');
    restoreAuto();
    notice = '';
    const serial = ++playback.serial;
    if (!SPACE_AUDIO.music) {
      silenceMusic(); spaceAudioControls();
      return result(true);
    }
    if (STATE.view !== 'arcade' || document.hidden) {
      silenceMusic(true); spaceAudioControls();
      return result(true);
    }
    return startAudio(serial);
  }
  async function next() {
    const index = catalogue.findIndex(cue => cue.key === selectedKey());
    return preview(catalogue[(index + 1) % catalogue.length].key);
  }

  // Saving effects or volume during audition must not save its temporary music flag.
  spaceAudioSave = function () {
    if (playback.savedEnabled === null) return original.save();
    const enabled = SPACE_AUDIO.music;
    SPACE_AUDIO.music = playback.savedEnabled;
    try { return original.save(); }
    finally { SPACE_AUDIO.music = enabled; }
  };
  spaceAudioAction = function (action) {
    if (action === 'arcade-music') {
      const enabled = !SPACE_AUDIO.music;
      restoreAuto(); playback.serial++;
      SPACE_AUDIO.music = enabled;
      spaceAudioSave(); spaceAudioUnlock(); spaceAudioSync(); spaceAudioControls();
      return true;
    }
    return original.action(action);
  };
  // The core calls this for leaving the game and for hiding the page. Its FX
  // behavior is preserved; public stop() above is intentionally music-only.
  spaceAudioStop = function (...args) {
    playback.serial++; restoreAuto();
    silenceMusic(true);
    return original.stop(...args);
  };

  function cueLabel(cue) { return cue.name + ' · ' + cue.genre + ' · ' + cue.bpm + ' уд/мин'; }
  function makeControls() {
    const panel = document.querySelector('.space-audio-panel');
    if (!panel || panel.querySelector('.citadel-music-picker')) return;
    const details = document.createElement('details'); details.className = 'citadel-music-picker';
    const summary = document.createElement('summary'); summary.textContent = 'Выбрать музыкальную тему';
    const label = document.createElement('label'); label.htmlFor = 'citadel-music-choice';
    label.textContent = 'Тема для прослушивания';
    const select = document.createElement('select'); select.id = 'citadel-music-choice';
    for (const cue of catalogue) {
      const option = document.createElement('option'); option.value = cue.key; option.textContent = cueLabel(cue);
      select.appendChild(option);
    }
    select.value = pickerKey || selectedKey();
    select.addEventListener('change', () => { pickerKey = select.value; });
    const actions = document.createElement('div'); actions.className = 'citadel-music-actions';
    for (const [action, text] of [
      ['citadel-music-preview', 'Прослушать'], ['soundtrack-next', 'Следующая'],
      ['citadel-music-stop', 'Стоп'], ['citadel-music-auto', 'Авто по этапу']
    ]) {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.action = action; button.textContent = text; actions.appendChild(button);
    }
    const state = document.createElement('small'); state.id = 'citadel-music-state'; state.setAttribute('role', 'status');
    details.append(summary, label, select, actions, state); panel.appendChild(details);
  }
  spaceAudioControls = function (...args) {
    original.controls(...args);
    if (STATE.view !== 'arcade') return;
    makeControls();
    const current = status(), cue = current.active || current.selected;
    const label = document.getElementById('space-track-name');
    if (label) label.textContent = current.playing ? cueLabel(cue) :
      current.mode === 'stopped' ? 'Музыка остановлена' : !current.enabled ? 'Музыка выключена' :
      'Выбрано: ' + cueLabel(cue);
    const select = document.getElementById('citadel-music-choice');
    if (select && select !== document.activeElement) select.value = pickerKey || current.selectedKey;
    const state = document.getElementById('citadel-music-state');
    if (state) state.textContent = notice || (current.mode === 'stopped' ? 'Прослушивание остановлено.' :
      !current.enabled ? 'Музыка выключена. «Прослушать» временно включит выбранную тему.' :
      current.reason === 'audio-suspended' || current.reason === 'audio-unavailable' ?
        'Нажмите «Прослушать», чтобы включить звук.' :
      current.mode === 'preview' ? 'Ручной выбор. «Авто по этапу» вернёт музыку игры.' :
        'Музыка меняется вместе с этапом игры.');
  };
  async function handleClick(event) {
    const button = event.target.closest?.('[data-action]');
    const action = button?.dataset.action;
    if (!['citadel-music-preview', 'citadel-music-stop', 'citadel-music-auto', 'soundtrack-next'].includes(action)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const operation = action === 'citadel-music-preview' ? preview(document.getElementById('citadel-music-choice')?.value || selectedKey()) :
      action === 'citadel-music-stop' ? stop() : action === 'citadel-music-auto' ? resumeAuto() : next();
    const answer = await operation;
    if (!answer.ok && answer.reason !== 'superseded') {
      notice = answer.reason === 'audio-unavailable' ? 'Браузер не предоставил аудиоконтекст.' :
        answer.reason === 'audio-suspended' ? 'Браузер приостановил звук. Нажмите «Прослушать» ещё раз.' :
        'Прослушивание сейчас недоступно.';
    }
    spaceAudioControls();
  }
  function handleControlKey(event) {
    // Keep native Enter/Space/Tab behavior inside the picker. Game shortcuts
    // must not steer the ship or select a target while using audio controls.
    if (event.target.closest?.('.citadel-music-picker')) event.stopImmediatePropagation();
  }
  function onHidden() {
    if (document.hidden) { playback.serial++; restoreAuto(); silenceMusic(true); }
  }
  function onPageHide() { playback.serial++; restoreAuto(); silenceMusic(true); }
  function dispose() {
    playback.serial++; restoreAuto(); playback.disposed = true;
    silenceMusic(true);
    for (const active of [...musicVoices]) active.clean();
    for (const track of musicTracks) for (const node of track.nodes) try { node.disconnect(); } catch (_) {}
    musicTracks.clear(); cachedNoise = noiseContext = null;
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleControlKey, true);
    document.removeEventListener('visibilitychange', onHidden);
    globalThis.removeEventListener?.('pagehide', onPageHide);
    return result(true);
  }

  const css = document.createElement('style'); css.id = 'citadel-music-style';
  css.textContent = '.citadel-music-picker{margin-top:9px;border-top:1px solid #527180;padding-top:8px;font:12px/1.45 system-ui,sans-serif;min-width:0}.citadel-music-picker summary{cursor:pointer;color:inherit}.citadel-music-picker label{display:block;margin:9px 0 5px}.citadel-music-picker select{width:100%;min-width:0;max-width:100%;min-height:38px;background:#0f2837;color:#e8f3f4;border:1px solid #73929e;border-radius:5px;padding:6px;font:inherit}.citadel-music-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.citadel-music-actions button{min-height:36px;padding:6px 8px;background:#153748;color:#eef7f6;border:1px solid #5a8493;border-radius:5px;font:inherit;cursor:pointer}.citadel-music-picker small{display:block;margin-top:7px;color:#c8dfe5}.space-audio-panel #space-track-name{max-width:100%;line-height:1.35;white-space:normal}';
  document.head.appendChild(css);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleControlKey, true);
  document.addEventListener('visibilitychange', onHidden);
  globalThis.addEventListener?.('pagehide', onPageHide);
  globalThis.citadelMusic = Object.freeze({version: VERSION, catalog: catalogue, preview, stop, resumeAuto, status, next, dispose, score:(key,index)=>byKey.has(key)?compose(SPACE_THEMES[key],Math.max(0,Math.floor(index))):null});
  // Compatibility for callers of the old button/API, now with a real track change.
  globalThis.citadelSoundtrack = Object.freeze({version: VERSION, cues: catalogue.map(cue => cue.key), next});
  globalThis.CITADEL_MUSIC_VERSION = VERSION;
  if (STATE.view === 'arcade') spaceAudioControls();
})();
