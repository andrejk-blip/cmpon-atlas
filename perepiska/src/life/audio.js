import {RECORDINGS} from '../../assets/audio/voices/manifest.js';

/** Presentation audio. It never reads or changes story/save state. */
export const AUDIO_DEFAULTS = Object.freeze({enabled: true, music: .35, voices: .9, effects: .3});
export const MUSIC_TRACKS = Object.freeze({
  morning: 'assets/audio/music/morning.mp3',
  courtyard: 'assets/audio/music/courtyard.mp3',
  evening: 'assets/audio/music/evening.mp3',
});

const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;
const normalise = (value = {}, previous = AUDIO_DEFAULTS) => {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : previous.enabled,
    music: clamp(settings.music ?? previous.music, previous.music),
    voices: clamp(settings.voices ?? previous.voices, previous.voices),
    effects: clamp(settings.effects ?? previous.effects, previous.effects),
  };
};
const profiles = {
  anna: [0, 1.02, 1.03], vera: [1, .97, .98], max: [2, .99, .94],
  'resident-1': [3, .95, .94], nikolay: [3, .95, .94],
  'resident-2': [4, 1.02, .98], denis: [4, 1.02, .98],
};
const hash = value => [...String(value)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);

/**
 * env is an optional browser dependency injection seam for tests/native shells:
 * Audio, AudioContext, speechSynthesis, SpeechSynthesisUtterance, document,
 * setTimeout, clearTimeout and now (milliseconds). No resources load at creation.
 */
export function createAudioDirector({preferences, onPreferencesChange, onStateChange, recordings = RECORDINGS, env = {}} = {}) {
  const browser = globalThis;
  const supplied = key => Object.prototype.hasOwnProperty.call(env, key) ? env[key] : browser[key];
  const synth = supplied('speechSynthesis'), Utterance = supplied('SpeechSynthesisUtterance');
  const Audio = supplied('Audio'), Context = supplied('AudioContext') || supplied('webkitAudioContext');
  const document = supplied('document');
  const later = env.setTimeout || browser.setTimeout.bind(browser);
  const clear = env.clearTimeout || browser.clearTimeout.bind(browser);
  const now = env.now || (() => browser.performance?.now?.() ?? Date.now());
  let prefs = normalise(preferences), destroyed = false, unlocked = false;
  let world = {scene: 'home', phase: 'morning'}, context = null, musicGain = null, effectsGain = null, voicesGain = null;
  let currentMusic = null, error = null, speechError = null, lastPlaylist = [], queue = [], active = null;
  let expectedSuspension = false;
  let waitingRecordedFallback = false, usedBrowserFallback = false;
  let speechGeneration = 0, speechTimer = null, nextTimer = null, voiceTimer = null;
  let voices = [], voiceStatus = synth && Utterance ? 'loading' : 'unavailable';
  const suspensions = new Set(), tracks = new Map(), effects = new Set(), cueTimes = new Map();
  const clips = new Map(), failedRecordings = new Set();
  const catalogue = recordings && typeof recordings === 'object' ? recordings : {};
  const recordingFor = entry => entry && Audio && typeof catalogue[entry.id]?.url === 'string' && catalogue[entry.id].url ? catalogue[entry.id] : null;
  const recordingCount = Audio ? Object.values(catalogue).filter(value => typeof value?.url === 'string' && value.url).length : 0;
  const canPlay = () => !destroyed && unlocked && prefs.enabled && !suspensions.size;
  const musicLevel = () => prefs.music * (active || queue.length ? .24 : 1);
  const selectedTrack = () => ['evening', 'complete'].includes(world.phase) ? 'evening' : world.scene === 'district' ? 'courtyard' : 'morning';
  const safely = callback => { try { return callback(); } catch { return undefined; } };

  function getStatus() {
    const selected = active?.entry || queue[0] || lastPlaylist[0];
    const hasRecording = selected ? Boolean(recordingFor(selected)) : recordingCount > 0;
    const speechProvider = active?.provider || (hasRecording && !usedBrowserFallback ? 'recorded' : 'browser');
    const canSpeak = hasRecording || voices.length > 0;
    const degradedText = speechProvider === 'recorded' && !speechError ? ''
      : usedBrowserFallback && voices.length > 0 && !speechError ? 'Для этой реплики используется русский системный голос.'
      : voiceStatus === 'unavailable' ? 'Браузер не поддерживает системную озвучку. Реплики доступны в тексте.'
      : voiceStatus === 'loading' ? 'Проверяем русские системные голоса…'
      : voiceStatus === 'missing' ? 'Русский системный голос не найден. Реплики доступны в тексте; английский голос не используется.'
      : voiceStatus === 'error' ? 'Системная озвучка прервалась. Можно повторить реплику или читать текст.'
      : voices.length === 1 ? 'Доступен один русский системный голос. Все персонажи используют его с небольшими различиями темпа.' : '';
    return {
      unlocked, suspended: suspensions.size > 0, suspensionReasons: [...suspensions],
      speaking: Boolean(active), currentLineId: active?.entry.id ?? null,
      musicPlaying: [...tracks.values()].some(track => !track.audio.paused && track.desired),
      musicTrack: currentMusic?.name ?? selectedTrack(), voiceCount: voices.length, voiceStatus,
      speechProvider, canSpeak, ready: canSpeak && !speechError, recordingCount, degradedText, error: speechError || error,
      canReplay: lastPlaylist.length > 0, enabled: prefs.enabled,
    };
  }
  function emit() { if (!destroyed) safely(() => onStateChange?.(getStatus())); }
  function parameter(param, value, duration = .12) {
    if (!param || !context) return;
    const time = context.currentTime || 0;
    safely(() => { param.cancelScheduledValues(time); param.setValueAtTime(param.value, time); param.linearRampToValueAtTime(value, time + duration); });
  }
  function applyVolumes() {
    parameter(musicGain?.gain, musicLevel());
    parameter(effectsGain?.gain, prefs.effects);
    parameter(voicesGain?.gain, prefs.voices);
    for (const track of tracks.values()) if (!track.gain) track.audio.volume = clamp(readLevel(track) * musicLevel(), 0);
    for (const clip of clips.values()) if (!clip.source) clip.audio.volume = prefs.voices;
  }
  function readLevel(track) {
    if (!track.fade) return track.level;
    const progress = Math.min(1, Math.max(0, (now() - track.fade.start) / track.fade.duration));
    return track.fade.from + (track.fade.to - track.fade.from) * progress;
  }
  function cancelFade(track) {
    track.level = readLevel(track);
    if (track.fadeTimer !== null) clear(track.fadeTimer);
    track.fadeTimer = null;
    track.fade = null;
  }
  function fadeTo(track, level, done) {
    cancelFade(track);
    track.fade = {from: track.level, to: level, start: now(), duration: 600};
    if (track.gain) {
      safely(() => track.gain.gain.setValueAtTime(track.level, context.currentTime));
      parameter(track.gain.gain, level, .6);
    }
    const tick = () => {
      if (destroyed || !track.fade) return;
      track.level = readLevel(track);
      if (!track.gain) track.audio.volume = clamp(track.level * musicLevel(), 0);
      if (now() - track.fade.start >= 600) {
        track.level = level; track.fade = null; track.fadeTimer = null;
        done?.(); emit();
      } else track.fadeTimer = later(tick, track.gain ? 600 : 40);
    };
    track.fadeTimer = later(tick, track.gain ? 600 : 40);
  }
  function pauseTrack(track) {
    cancelFade(track);
    track.desired = false;
    track.attempt++; track.pending = false;
    safely(() => track.audio.pause());
  }
  function pauseMusic() { for (const track of tracks.values()) pauseTrack(track); }
  function ensureContext() {
    if (context || !Context) return;
    try {
      context = new Context();
      musicGain = context.createGain(); effectsGain = context.createGain(); voicesGain = context.createGain();
      musicGain.gain.value = musicLevel(); effectsGain.gain.value = prefs.effects; voicesGain.gain.value = prefs.voices;
      musicGain.connect(context.destination); effectsGain.connect(context.destination); voicesGain.connect(context.destination);
      context.addEventListener?.('statechange', contextChanged);
    } catch { context = null; musicGain = null; effectsGain = null; voicesGain = null; }
  }
  function contextChanged() {
    if (destroyed || !context) return;
    if (context.state === 'running') expectedSuspension = false;
    if (context.state === 'suspended' && expectedSuspension) { expectedSuspension = false; return; }
    if (['suspended', 'interrupted', 'closed'].includes(context.state) && !suspensions.size) {
      unlocked = false;
      stopSpeech(); pauseMusic(); emit();
    }
  }
  function ensureTrack(name) {
    if (tracks.has(name)) return tracks.get(name);
    if (!Audio) return null;
    try {
      const audio = new Audio();
      audio.preload = 'none'; audio.loop = true; audio.volume = 0;
      audio.src = MUSIC_TRACKS[name];
      const track = {name, audio, gain: null, source: null, level: 0, fade: null, fadeTimer: null, desired: false, pending: false, failed: false, attempt: 0};
      if (context?.createMediaElementSource && musicGain) {
        safely(() => {
          track.source = context.createMediaElementSource(audio);
          track.gain = context.createGain(); track.gain.gain.value = 0;
          track.source.connect(track.gain); track.gain.connect(musicGain); audio.volume = 1;
        });
      }
      track.onError = () => {
        track.failed = true; pauseTrack(track);
        error = 'Музыка сейчас недоступна. Игра продолжает работать.'; emit();
      };
      audio.addEventListener?.('error', track.onError);
      tracks.set(name, track);
      return track;
    } catch { error = 'Музыка недоступна в этом браузере.'; return null; }
  }
  function playTrack(track) {
    track.desired = true;
    if (track.pending || !track.audio.paused || track.failed) return;
    track.pending = true;
    const attempt = ++track.attempt;
    let result;
    try { result = track.audio.play(); }
    catch (failure) { result = Promise.reject(failure); }
    Promise.resolve(result).then(() => {
      if (destroyed || attempt !== track.attempt) return;
      track.pending = false;
      if (!canPlay() || !track.desired || prefs.music <= 0) safely(() => track.audio.pause());
      emit();
    }, failure => {
      if (destroyed || attempt !== track.attempt) return;
      track.pending = false;
      if (destroyed || !track.desired) return;
      pauseTrack(track);
      if (failure?.name === 'NotAllowedError') unlocked = false;
      error = failure?.name === 'NotAllowedError' ? 'Нажми кнопку звука, чтобы включить аудио.' : 'Музыка сейчас недоступна. Игра продолжает работать.';
      emit();
    });
  }
  function syncMusic() {
    if (!canPlay() || prefs.music <= 0) { pauseMusic(); return; }
    const wanted = ensureTrack(selectedTrack());
    if (!wanted) return;
    if (currentMusic !== wanted) {
      currentMusic = wanted;
      for (const track of tracks.values()) if (track !== wanted && track.desired) fadeTo(track, 0, () => pauseTrack(track));
    }
    const needsFade = !wanted.desired || wanted.fade?.to === 0 || wanted.level < 1 && !wanted.fade;
    playTrack(wanted);
    if (needsFade) fadeTo(wanted, 1);
    applyVolumes();
  }

  function clearSpeechTimers() {
    if (speechTimer !== null) clear(speechTimer);
    if (nextTimer !== null) clear(nextTimer);
    speechTimer = null; nextTimer = null;
  }
  function detachClip(clip) {
    if (!clip) return;
    if (clip.onEnd) clip.audio.removeEventListener?.('ended', clip.onEnd);
    if (clip.onError) clip.audio.removeEventListener?.('error', clip.onError);
    clip.onEnd = null; clip.onError = null;
  }
  function releaseClip(id) {
    const clip = clips.get(id);
    if (!clip) return;
    detachClip(clip);
    safely(() => clip.audio.pause()); safely(() => clip.source?.disconnect());
    safely(() => { clip.audio.removeAttribute?.('src'); clip.audio.load?.(); });
    clips.delete(id);
  }
  function getClip(entry) {
    if (clips.has(entry.id)) return clips.get(entry.id);
    const recording = recordingFor(entry);
    if (!recording) return null;
    try {
      const audio = new Audio();
      audio.preload = 'auto'; audio.volume = prefs.voices; audio.src = recording.url;
      const clip = {audio, recording, source: null, onEnd: null, onError: null};
      clips.set(entry.id, clip);
      safely(() => audio.load?.());
      return clip;
    } catch { return null; }
  }
  function prepareClips() {
    // The active line and its immediate successor are the only audio preloads.
    const wanted = active ? [active.entry, queue[0]] : queue.slice(0, 2);
    const ids = new Set(wanted.filter(Boolean).map(entry => entry.id));
    for (const id of clips.keys()) if (!ids.has(id)) releaseClip(id);
    for (const entry of wanted) if (entry && !failedRecordings.has(entry.id)) getClip(entry);
  }
  function stopSpeech() {
    speechGeneration++;
    clearSpeechTimers();
    queue = []; active = null;
    waitingRecordedFallback = false;
    for (const id of clips.keys()) releaseClip(id);
    safely(() => synth?.cancel());
    applyVolumes(); emit();
  }
  function refreshVoices() {
    if (!synth || !Utterance || destroyed) return;
    const all = safely(() => synth.getVoices()) || [];
    const distinct = new Map();
    for (const voice of all) if (/^ru(?:[-_]|$)/i.test(voice.lang || '')) {
      distinct.set(`${voice.voiceURI || voice.name}|${voice.lang}`, voice);
    }
    voices = [...distinct.values()].sort((a, b) => Number(Boolean(b.localService)) - Number(Boolean(a.localService)) || `${a.voiceURI || a.name}|${a.lang}`.localeCompare(`${b.voiceURI || b.name}|${b.lang}`));
    if (voices.length) {
      voiceStatus = 'ready'; speechError = null;
      if (voiceTimer !== null) clear(voiceTimer);
      voiceTimer = null;
      startNext();
    } else if (voiceStatus !== 'loading') voiceStatus = 'missing';
    emit();
  }
  function speechFailure(message) {
    stopSpeech();
    speechError = message; voiceStatus = 'error'; emit();
  }
  function finishLine(generation) {
    if (speechTimer !== null) clear(speechTimer);
    speechTimer = null;
    if (active?.clip) detachClip(active.clip);
    active = null;
    prepareClips(); applyVolumes(); emit();
    if (queue.length) nextTimer = later(() => { nextTimer = null; if (generation === speechGeneration) startNext(); }, 0);
  }
  function fallbackFromRecording(entry, generation) {
    if (destroyed || generation !== speechGeneration) return;
    if (speechTimer !== null) clear(speechTimer);
    speechTimer = null;
    if (active?.clip) { detachClip(active.clip); safely(() => active.clip.audio.pause()); }
    active = null; failedRecordings.add(entry.id); releaseClip(entry.id); usedBrowserFallback = true;
    if (voices.length) { startBrowserLine(entry); return; }
    if (voiceStatus === 'loading') {
      queue.unshift(entry); waitingRecordedFallback = true; applyVolumes(); emit(); return;
    }
    speechFailure('Запись реплики недоступна, и русский системный голос не найден. Можно повторить реплику или прочитать текст.');
  }
  function startRecording(entry) {
    const generation = speechGeneration, clip = getClip(entry);
    if (!clip) { fallbackFromRecording(entry, generation); return; }
    if (!clip.source && context?.createMediaElementSource && voicesGain) {
      safely(() => { clip.source = context.createMediaElementSource(clip.audio); clip.source.connect(voicesGain); clip.audio.volume = 1; });
    }
    safely(() => { clip.audio.currentTime = 0; });
    active = {entry, clip, generation, provider: 'recorded'};
    const current = () => !destroyed && generation === speechGeneration && active?.clip === clip;
    clip.onEnd = () => { if (current()) finishLine(generation); };
    clip.onError = () => { if (current()) fallbackFromRecording(entry, generation); };
    clip.audio.addEventListener?.('ended', clip.onEnd); clip.audio.addEventListener?.('error', clip.onError);
    const expected = Number(clip.recording.duration) > 0 ? Number(clip.recording.duration) * 1000 : entry.text.length * 160;
    speechTimer = later(() => { if (current()) fallbackFromRecording(entry, generation); }, Math.min(120000, Math.max(12000, expected + 8000)));
    prepareClips(); applyVolumes(); emit();
    try { Promise.resolve(clip.audio.play()).catch(() => { if (current()) fallbackFromRecording(entry, generation); }); }
    catch { if (current()) fallbackFromRecording(entry, generation); }
  }
  function startBrowserLine(entry) {
    const generation = speechGeneration;
    const [voiceIndex, rate, pitch] = profiles[entry.speakerId] || [hash(entry.speakerId), 1, 1];
    let utterance;
    try { utterance = new Utterance(entry.text); }
    catch { speechFailure('Системная озвучка недоступна. Реплики остаются в тексте.'); return; }
    utterance.voice = voices[voiceIndex % voices.length];
    utterance.lang = utterance.voice.lang; utterance.rate = rate; utterance.pitch = pitch; utterance.volume = prefs.voices;
    active = {entry, utterance, generation, provider: 'browser'};
    const current = () => !destroyed && generation === speechGeneration && active?.utterance === utterance;
    utterance.onend = () => {
      if (!current()) return;
      finishLine(generation);
    };
    utterance.onerror = event => {
      if (!current()) return;
      speechFailure(`Не удалось озвучить реплику${event?.error === 'not-allowed' ? ': браузер ждёт нажатия кнопки звука' : ''}. Можно повторить её.`);
    };
    // A missing browser callback must never leave music ducked indefinitely.
    speechTimer = later(() => { if (current()) speechFailure('Озвучка не ответила. Можно повторить реплику.'); }, Math.min(90000, Math.max(12000, entry.text.length * 160 + 5000)));
    applyVolumes(); emit();
    try { synth.speak(utterance); }
    catch { if (current()) speechFailure('Не удалось запустить системную озвучку. Можно повторить реплику.'); }
  }
  function startNext() {
    if (active || !queue.length || !canPlay() || prefs.voices <= 0) return;
    const entry = queue[0];
    if (recordingFor(entry) && !failedRecordings.has(entry.id)) {
      queue.shift(); startRecording(entry); return;
    }
    if (!voices.length) {
      if (voiceStatus !== 'loading') speechFailure('Запись реплики недоступна, и русский системный голос не найден. Реплика доступна в тексте.');
      return;
    }
    queue.shift(); waitingRecordedFallback = false; startBrowserLine(entry); prepareClips();
  }
  function playLines(entries) {
    if (destroyed) return false;
    const lines = (Array.isArray(entries) ? entries : [entries]).filter(entry => entry && typeof entry.text === 'string' && entry.text.trim()).map(entry => ({...entry, text: entry.text.trim()}));
    stopSpeech();
    lastPlaylist = lines;
    usedBrowserFallback = false;
    for (const entry of lines) failedRecordings.delete(entry.id);
    speechError = null;
    if (voiceStatus === 'error') voiceStatus = voices.length ? 'ready' : 'missing';
    if (!lines.length || !prefs.enabled || prefs.voices <= 0 || suspensions.size) { emit(); return false; }
    if (!recordingFor(lines[0]) && ['missing', 'unavailable'].includes(voiceStatus)) {
      if (recordingCount) speechFailure('Запись этой реплики отсутствует, и русский системный голос не найден. Реплика доступна в тексте.');
      else emit();
      return false;
    }
    queue = [...lines];
    prepareClips(); startNext(); emit();
    return true;
  }
  function replay() { return lastPlaylist.length ? playLines(lastPlaylist) : false; }

  function stopEffects() {
    for (const effect of effects) {
      safely(() => effect.oscillator.stop()); safely(() => effect.oscillator.disconnect()); safely(() => effect.gain.disconnect());
    }
    effects.clear();
  }
  function cue(name) {
    if (!canPlay() || prefs.effects <= 0 || !context || context.state !== 'running') return false;
    const sounds = {
      click: [[760, 0, .025, .035]], message: [[740, 0, .075, .05], [980, .09, .1, .04]],
      paper: [[1350, 0, .035, .018], [980, .035, .025, .012]], coins: [[1175, 0, .06, .04], [1568, .075, .09, .03]],
      door: [[130, 0, .075, .06]], step: [[90, 0, .035, .025]],
      success: [[523, 0, .09, .045], [659, .1, .09, .04], [784, .2, .15, .035]],
    };
    if (!sounds[name] || now() - (cueTimes.get(name) ?? -Infinity) < (name === 'step' ? 220 : 90)) return false;
    cueTimes.set(name, now());
    try {
      for (const [frequency, delay, duration, level] of sounds[name]) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + delay, effect = {oscillator, gain};
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level, start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(gain); gain.connect(effectsGain); effects.add(effect);
        oscillator.onended = () => { effects.delete(effect); safely(() => oscillator.disconnect()); safely(() => gain.disconnect()); };
        oscillator.start(start); oscillator.stop(start + duration + .01);
      }
      return true;
    } catch { return false; }
  }
  function updatePreferences(patch = {}) {
    if (destroyed) return {...prefs};
    prefs = normalise(patch, prefs);
    if (!prefs.enabled || prefs.voices <= 0) stopSpeech();
    if (!prefs.enabled || prefs.effects <= 0) stopEffects();
    if (active?.utterance) active.utterance.volume = prefs.voices;
    applyVolumes(); syncMusic();
    safely(() => onPreferencesChange?.({...prefs})); emit();
    return {...prefs};
  }
  function setWorld(value = {}) {
    if (destroyed) return;
    world = {...world, ...value}; syncMusic(); emit();
  }
  function setSuspended(reason, value) {
    if (destroyed) return;
    if (value) {
      suspensions.add(reason);
      if (reason === 'hidden') unlocked = false;
      stopSpeech(); stopEffects(); pauseMusic();
      if (context?.state === 'running') {
        expectedSuspension = true;
        safely(() => Promise.resolve(context.suspend()).catch(() => { expectedSuspension = false; }));
      }
    } else {
      suspensions.delete(reason);
      if (!suspensions.size && unlocked && prefs.enabled) {
        if (context?.state === 'suspended') safely(() => Promise.resolve(context.resume()).catch(() => {}));
        syncMusic();
      }
    }
    emit();
  }
  function unlock() {
    if (destroyed || suspensions.size) return Promise.resolve(false);
    unlocked = true; error = null;
    ensureContext();
    for (const track of tracks.values()) track.failed = false;
    let resume = Promise.resolve();
    if (context?.state === 'suspended' || context?.state === 'interrupted') {
      try { resume = Promise.resolve(context.resume()); } catch { resume = Promise.reject(new Error('resume')); }
    }
    // Both calls happen inside the initiating gesture, before any await.
    syncMusic(); startNext(); emit();
    return resume.then(() => !destroyed && unlocked && !suspensions.size, () => {
      unlocked = false; pauseMusic(); stopSpeech(); error = 'Нажми кнопку звука, чтобы включить аудио.'; emit(); return false;
    });
  }
  const visibilityChanged = () => setSuspended('hidden', Boolean(document?.hidden));
  synth?.addEventListener?.('voiceschanged', refreshVoices);
  document?.addEventListener?.('visibilitychange', visibilityChanged);
  if (document?.hidden) suspensions.add('hidden');
  if (voiceStatus === 'loading') {
    voiceTimer = later(() => {
      voiceTimer = null;
      if (!voices.length && !destroyed) {
        voiceStatus = 'missing';
        if (waitingRecordedFallback) speechFailure('Запись реплики недоступна, и русский системный голос не найден. Можно повторить реплику или прочитать текст.');
        else if (active?.provider !== 'recorded' && !recordingFor(queue[0])) stopSpeech();
        emit();
      }
    }, 1500);
    refreshVoices();
  }
  function destroy() {
    if (destroyed) return;
    stopSpeech(); stopEffects(); pauseMusic();
    if (voiceTimer !== null) clear(voiceTimer);
    synth?.removeEventListener?.('voiceschanged', refreshVoices);
    document?.removeEventListener?.('visibilitychange', visibilityChanged);
    context?.removeEventListener?.('statechange', contextChanged);
    for (const track of tracks.values()) {
      track.audio.removeEventListener?.('error', track.onError);
      safely(() => track.source?.disconnect()); safely(() => track.gain?.disconnect());
      safely(() => { track.audio.removeAttribute?.('src'); track.audio.load?.(); });
    }
    destroyed = true; unlocked = false;
    safely(() => Promise.resolve(context?.close()).catch(() => {}));
  }
  return {unlock, setWorld, setSuspended, playLines, stopSpeech, replay, cue,
    getPreferences: () => ({...prefs}), updatePreferences, getStatus, destroy};
}
