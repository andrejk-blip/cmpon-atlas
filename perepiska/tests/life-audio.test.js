import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioDirector, AUDIO_DEFAULTS, MUSIC_TRACKS} from '../src/life/audio.js';

const line = (id, speakerId = 'anna') => ({id, speakerId, text: `Реплика ${id}.`, displayText: `Реплика ${id}.`, group: 'test'});
const russian = (name = 'Русский', extra = {}) => ({name, voiceURI: name, lang: 'ru-RU', localService: true, ...extra});
class Signals {
  listeners = new Map();
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  dispatch(name) { for (const callback of this.listeners.get(name) || []) callback(); }
}
function harness({voices = [russian()], contextAvailable = true, speechAvailable = true} = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), audios = [], contexts = [], spoken = [];
  const clock = {
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, {callback, at: time + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    now: () => time,
    advance(ms) {
      const end = time + ms;
      for (let turns = 0; turns < 10000; turns++) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) { time = end; return; }
        time = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      assert.fail('timer loop did not settle');
    },
  };
  const synth = new Signals();
  Object.assign(synth, {
    voices, current: null, cancelCount: 0,
    getVoices() { return this.voices; },
    speak(utterance) { assert.equal(this.current, null, 'only one utterance may be submitted at a time'); this.current = utterance; spoken.push(utterance); },
    cancel() { this.cancelCount++; this.current = null; },
    finish() { const utterance = this.current; this.current = null; utterance?.onend?.(); },
    fail(error = 'synthesis-failed') { const utterance = this.current; this.current = null; utterance?.onerror?.({error}); },
  });
  class Audio extends Signals {
    constructor() { super(); this.paused = true; this.currentTime = 0; this.playCount = 0; this.volume = 1; audios.push(this); }
    play() { this.playCount++; this.paused = false; return this.playResult || Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { delete this[name]; }
    load() {}
  }
  const parameter = () => ({value: 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; }});
  class Context extends Signals {
    constructor() { super(); this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.gains = []; this.oscillators = []; contexts.push(this); }
    createGain() { const gain = {gain: parameter(), connect() {}, disconnect() {}}; this.gains.push(gain); return gain; }
    createMediaElementSource() { return {connect() {}, disconnect() {}}; }
    createOscillator() { const oscillator = {frequency: parameter(), connect() {}, disconnect() {}, start() {}, stop() {}}; this.oscillators.push(oscillator); return oscillator; }
    resume() { this.state = 'running'; this.dispatch('statechange'); return Promise.resolve(); }
    suspend() { this.state = 'suspended'; this.dispatch('statechange'); return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const document = new Signals(); document.hidden = false;
  const env = {...clock, Audio, AudioContext: contextAvailable ? Context : null, webkitAudioContext: null, document,
    speechSynthesis: speechAvailable ? synth : null,
    SpeechSynthesisUtterance: speechAvailable ? class { constructor(text) { this.text = text; } } : null};
  return {env, clock, synth, spoken, audios, contexts, timers, document};
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('creation is silent and lazy; preferences are normalised independently of caller objects', async () => {
  const h = harness(), changes = [], initial = {music: 2, voices: -.2, effects: 'bad'};
  const director = createAudioDirector({env: h.env, preferences: initial, onPreferencesChange: value => changes.push(value)});
  assert.deepEqual(director.getPreferences(), {...AUDIO_DEFAULTS, music: 1, voices: 0});
  assert.equal(h.audios.length, 0); assert.equal(h.contexts.length, 0); assert.equal(h.spoken.length, 0);
  director.setWorld({scene: 'district', phase: 'shift'});
  assert.equal(h.audios.length, 0);
  assert.equal(director.cue('message'), false);
  await director.unlock();
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].src, MUSIC_TRACKS.courtyard);
  director.updatePreferences({music: .2, voices: .8});
  changes[0].music = 0;
  assert.equal(director.getPreferences().music, .2);
  assert.equal(initial.music, 2);
  director.destroy();
  for (const malformed of [null, [], 'broken', 12]) {
    const empty = createAudioDirector({env: harness().env, preferences: malformed});
    assert.deepEqual(empty.getPreferences(), AUDIO_DEFAULTS);
    assert.deepEqual(empty.updatePreferences(malformed), AUDIO_DEFAULTS);
    empty.destroy();
  }
});

test('only real Russian voices are used; late voice discovery is supported honestly', async () => {
  const h = harness({voices: [{name: 'English', voiceURI: 'en', lang: 'en-US'}]});
  const director = createAudioDirector({env: h.env});
  await director.unlock(); director.playLines([line('first')]);
  h.clock.advance(1500);
  assert.equal(h.spoken.length, 0);
  assert.equal(director.getStatus().voiceStatus, 'missing');
  assert.equal(director.getStatus().voiceCount, 0);
  assert.match(director.getStatus().degradedText, /английский голос не используется/);
  h.synth.voices = [russian(), russian()]; h.synth.dispatch('voiceschanged');
  assert.equal(director.getStatus().voiceCount, 1);
  assert.equal(director.getStatus().voiceStatus, 'ready');
  assert.match(director.getStatus().degradedText, /один русский/);
  assert.equal(h.spoken.length, 0, 'late discovery must not resurrect an expired queue');
  assert.equal(director.replay(), true);
  assert.equal(h.spoken[0].voice.lang, 'ru-RU');
  director.destroy();
  const absent = createAudioDirector({env: harness({speechAvailable: false}).env});
  assert.equal(absent.getStatus().voiceStatus, 'unavailable');
  assert.equal(absent.playLines([line('silent')]), false); absent.destroy();
});

test('queued speech waits for gesture and voices; speaker assignment is deterministic', async () => {
  const h = harness({voices: []}), director = createAudioDirector({env: h.env});
  director.playLines([line('one', 'max')]);
  assert.equal(h.spoken.length, 0);
  h.synth.voices = [russian('Б'), russian('А')]; h.synth.dispatch('voiceschanged');
  assert.equal(h.spoken.length, 0);
  await director.unlock();
  const chosen = h.spoken[0].voice.voiceURI;
  assert.ok(h.spoken[0].rate >= .95 && h.spoken[0].rate <= 1.05);
  assert.ok(h.spoken[0].pitch >= .9 && h.spoken[0].pitch <= 1.1);
  h.synth.finish();
  h.synth.voices.reverse(); h.synth.dispatch('voiceschanged');
  director.replay();
  assert.equal(h.spoken.at(-1).voice.voiceURI, chosen);
  director.destroy();
});

test('rapid replacement, stale callbacks and duplicate endings never overlap or replay lines', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  director.playLines([line('a'), line('b')]);
  const a = h.spoken[0]; h.synth.finish(); a.onend(); h.clock.advance(0);
  assert.equal(h.spoken.length, 2); const b = h.spoken[1];
  director.playLines([line('c')]);
  b.onend(); b.onerror({error: 'canceled'}); a.onend(); h.clock.advance(0);
  assert.equal(h.spoken.length, 3); assert.equal(director.getStatus().currentLineId, 'c');
  h.synth.finish(); h.clock.advance(0);
  assert.equal(director.getStatus().speaking, false);
  assert.equal(h.spoken.length, 3);
  director.replay(); assert.equal(h.spoken.length, 4); assert.equal(h.spoken[3].text, line('c').text);
  director.stopSpeech(); assert.equal(director.getStatus().speaking, false); director.destroy();
});

test('speech ducks music and restores it after completion, cancellation, errors and watchdog expiry', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  const volume = () => h.contexts[0].gains[0].gain.value;
  director.playLines([line('a'), line('b')]);
  assert.equal(volume(), .35 * .24);
  h.synth.finish(); assert.equal(volume(), .35 * .24);
  h.clock.advance(0); h.synth.finish(); assert.equal(volume(), .35);
  director.playLines([line('cancel')]); director.stopSpeech(); assert.equal(volume(), .35);
  director.playLines([line('failure'), line('must-not-start')]); h.synth.fail();
  assert.equal(volume(), .35); assert.equal(director.getStatus().voiceStatus, 'error');
  h.clock.advance(0); assert.equal(director.getStatus().speaking, false);
  director.playLines([line('timeout')]); const stalled = h.spoken.at(-1);
  h.clock.advance(12000);
  assert.equal(volume(), .35); assert.equal(director.getStatus().speaking, false);
  stalled.onend(); assert.equal(director.getStatus().voiceStatus, 'error'); director.destroy();
});

test('music crossfades lazily and rapid scene reversals keep the selected track playing', async () => {
  const h = harness({contextAvailable: false}), director = createAudioDirector({env: h.env}); await director.unlock();
  h.clock.advance(600); const morning = h.audios[0]; morning.currentTime = 31;
  assert.ok(Math.abs(morning.volume - .35) < .0001);
  director.setWorld({scene: 'district', phase: 'shift'});
  const courtyard = h.audios[1]; h.clock.advance(300);
  assert.ok(morning.volume > 0 && morning.volume < .35);
  assert.ok(courtyard.volume > 0 && courtyard.volume < .35);
  director.setWorld({scene: 'home', phase: 'morning'});
  h.clock.advance(600); await flush();
  assert.equal(morning.paused, false); assert.equal(courtyard.paused, true);
  assert.equal(morning.currentTime, 31); assert.equal(morning.volume, .35);
  assert.equal(h.audios.length, 2);
  director.setWorld({phase: 'evening'}); h.clock.advance(600);
  assert.equal(h.audios[2].src, MUSIC_TRACKS.evening); assert.equal(morning.paused, true);
  director.destroy();
});

test('pause preserves music position, stops speech, and hidden-tab return needs a new gesture', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  const track = h.audios[0]; track.currentTime = 45; director.playLines([line('pause')]);
  director.setSuspended('pause', true);
  assert.equal(track.paused, true); assert.equal(director.getStatus().speaking, false);
  director.setSuspended('settings', true); director.setSuspended('pause', false);
  assert.equal(track.paused, true, 'independent suspension reasons must compose');
  director.setSuspended('settings', false); await flush();
  assert.equal(track.paused, false); assert.equal(track.currentTime, 45);
  assert.equal(h.spoken.length, 1, 'resuming music must not repeat old dialogue');
  h.document.hidden = true; h.document.dispatch('visibilitychange');
  assert.equal(director.getStatus().unlocked, false); assert.equal(track.paused, true);
  assert.equal(await director.unlock(), false);
  h.document.hidden = false; h.document.dispatch('visibilitychange'); await flush();
  assert.equal(track.paused, true);
  await director.unlock(); assert.equal(track.paused, false); assert.equal(track.currentTime, 45);
  director.destroy();
});

test('mute cancels all sound and does not auto-read an old line when enabled again', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  director.playLines([line('old')]); assert.equal(director.cue('message'), true);
  director.updatePreferences({enabled: false});
  assert.equal(h.audios[0].paused, true); assert.equal(director.getStatus().speaking, false);
  assert.equal(director.cue('success'), false); assert.equal(director.playLines([line('muted')]), false);
  director.updatePreferences({enabled: true}); await flush();
  assert.equal(h.audios[0].paused, false); assert.equal(h.spoken.length, 1);
  director.updatePreferences({voices: 0}); assert.equal(director.replay(), false);
  director.updatePreferences({effects: 0}); assert.equal(director.cue('click'), false);
  director.updatePreferences({music: 0}); assert.equal(h.audios[0].paused, true);
  director.destroy();
});

test('a rejected or stale media play promise cannot break later playback', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  director.setSuspended('pause', true);
  let rejectOld; h.audios[0].playResult = new Promise((resolve, reject) => { rejectOld = reject; });
  director.setSuspended('pause', false);
  director.setSuspended('pause', true); h.audios[0].playResult = Promise.resolve();
  director.setSuspended('pause', false);
  rejectOld(Object.assign(new Error('old attempt'), {name: 'AbortError'})); await flush();
  assert.equal(h.audios[0].paused, false); assert.equal(director.getStatus().error, null);
  director.setSuspended('pause', true);
  h.audios[0].playResult = Promise.reject(Object.assign(new Error('gesture'), {name: 'NotAllowedError'}));
  director.setSuspended('pause', false); await flush();
  assert.equal(director.getStatus().unlocked, false); assert.equal(h.audios[0].paused, true);
  assert.match(director.getStatus().error, /кнопку звука/); director.destroy();
});

test('effects are gesture-gated and throttled; destroy detaches timers and all browser listeners', async () => {
  const h = harness(), director = createAudioDirector({env: h.env});
  assert.equal(director.cue('step'), false); await director.unlock();
  assert.equal(director.cue('step'), true); assert.equal(director.cue('step'), false);
  h.clock.advance(220); assert.equal(director.cue('step'), true);
  assert.equal(director.cue('unknown'), false);
  director.playLines([line('bye')]); const last = h.spoken.at(-1); director.destroy();
  h.clock.advance(100000); last.onend(); last.onerror({error: 'canceled'});
  assert.equal(h.timers.size, 0); assert.equal(h.synth.listeners.get('voiceschanged').size, 0);
  assert.equal(h.document.listeners.get('visibilitychange').size, 0);
  assert.equal(h.contexts[0].state, 'closed'); assert.equal(h.audios[0].paused, true);
  assert.equal(await director.unlock(), false); assert.equal(director.playLines([line('later')]), false);
});

test('a system audio interruption cannot resume itself or replay a stopped dialogue', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  director.playLines([line('interrupted')]);
  h.contexts[0].state = 'interrupted'; h.contexts[0].dispatch('statechange');
  assert.equal(director.getStatus().unlocked, false);
  assert.equal(director.getStatus().speaking, false); assert.equal(h.audios[0].paused, true);
  h.contexts[0].state = 'running'; h.contexts[0].dispatch('statechange');
  director.setWorld({scene: 'district'}); assert.equal(h.audios.length, 1);
  await director.unlock(); assert.equal(h.audios.length, 2); assert.equal(h.spoken.length, 1);
  director.destroy();
});

test('a delayed pause statechange does not hide a later external audio suspension', async () => {
  const h = harness(), director = createAudioDirector({env: h.env}); await director.unlock();
  const context = h.contexts[0];
  // Browsers dispatch statechange asynchronously, so a quick resume can precede it.
  context.suspend = () => { context.state = 'suspended'; return Promise.resolve(); };
  director.setSuspended('pause', true); director.setSuspended('pause', false);
  assert.equal(context.state, 'running');
  context.state = 'suspended'; context.dispatch('statechange');
  assert.equal(director.getStatus().unlocked, false);
  assert.equal(h.audios[0].paused, true); director.destroy();
});

test('closing a dialogue before voices load permanently cancels its pending auto-read', async () => {
  const h = harness({voices: []}), director = createAudioDirector({env: h.env}); await director.unlock();
  director.playLines([line('already-closed')]); director.stopSpeech();
  h.synth.voices = [russian()]; h.synth.dispatch('voiceschanged'); h.clock.advance(2000);
  assert.equal(h.spoken.length, 0); assert.equal(director.getStatus().speaking, false);
  assert.equal(h.contexts[0].gains[0].gain.value, .35);
  director.destroy();
});

const recordings = Object.fromEntries(['record-a', 'record-b', 'record-c'].map(id => [id, {
  url: `assets/audio/voices/${id}.mp3`, speakerId: 'anna', duration: 2, provider: 'qwen3-tts-local',
}]));
const recordedAudio = h => h.audios.filter(audio => audio.src?.startsWith('assets/audio/voices/'));
function endRecording(audio) { audio.paused = true; audio.dispatch('ended'); }

test('replaced recordings get a new cache URL while the authored manifest path stays stable', async () => {
  const original = recordings['record-a'];
  const sourceFor = async (sha256, url = original.url) => {
    const h = harness({speechAvailable: false});
    const manifest = {'record-a': {...original, url, sha256}};
    const director = createAudioDirector({env: h.env, recordings: manifest});
    await director.unlock(); director.playLines([line('record-a')]);
    const source = recordedAudio(h)[0].src;
    assert.equal(manifest['record-a'].url, url, 'playback must not mutate the source manifest');
    director.destroy();
    return source;
  };
  assert.equal(await sourceFor('1'.repeat(64)), `${original.url}?v=${'1'.repeat(16)}`);
  assert.equal(await sourceFor('2'.repeat(64)), `${original.url}?v=${'2'.repeat(16)}`);
  assert.equal(await sourceFor('a'.repeat(64), `${original.url}?language=ru`), `${original.url}?language=ru&v=${'a'.repeat(16)}`);
  assert.equal(await sourceFor(undefined), original.url, 'legacy recordings remain compatible');
  assert.equal(await sourceFor('not-a-file-hash'), original.url, 'only a full content digest becomes a cache key');
});

test('recorded pacing uses the measured duration and keeps music ducked through long spoken pauses', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings: {
    ...recordings, 'record-a': {...recordings['record-a'], duration: 24},
  }});
  await director.unlock(); director.playLines([line('record-a')]);
  const clip = recordedAudio(h)[0];
  h.clock.advance(25000);
  assert.equal(director.getStatus().currentLineId, 'record-a');
  assert.equal(clip.paused, false); assert.equal(h.spoken.length, 0, 'short display text must not cause premature browser fallback');
  assert.equal(h.contexts[0].gains[0].gain.value, .35 * .24);
  endRecording(clip); h.clock.advance(10000);
  assert.equal(director.getStatus().speaking, false); assert.equal(h.spoken.length, 0);
  assert.equal(h.contexts[0].gains[0].gain.value, .35);
  director.destroy();
});

test('recorded speech works without browser voices and preloads only the current and next clip', async () => {
  const h = harness({speechAvailable: false}), director = createAudioDirector({env: h.env, recordings});
  assert.equal(director.getStatus().canSpeak, true);
  assert.equal(director.getStatus().ready, true);
  assert.equal(director.getStatus().speechProvider, 'recorded');
  assert.equal(director.getStatus().voiceCount, 0);
  assert.equal(director.getStatus().degradedText, '');
  assert.equal(h.audios.length, 0);
  director.playLines([line('record-a'), line('record-b'), line('record-c')]);
  assert.deepEqual(recordedAudio(h).map(audio => audio.src), [recordings['record-a'].url, recordings['record-b'].url]);
  assert.ok(recordedAudio(h).every(audio => audio.playCount === 0));
  await director.unlock();
  const first = recordedAudio(h)[0];
  assert.equal(first.playCount, 1); assert.equal(recordedAudio(h)[1].playCount, 0);
  assert.equal(director.getStatus().currentLineId, 'record-a');
  endRecording(first); h.clock.advance(0);
  assert.deepEqual(recordedAudio(h).map(audio => audio.src), [recordings['record-b'].url, recordings['record-c'].url]);
  assert.equal(director.getStatus().currentLineId, 'record-b');
  endRecording(recordedAudio(h)[0]); h.clock.advance(0);
  assert.equal(director.getStatus().currentLineId, 'record-c');
  endRecording(recordedAudio(h)[0]); h.clock.advance(0);
  assert.equal(director.getStatus().speaking, false); assert.equal(h.spoken.length, 0);
  assert.equal(h.contexts[0].gains[0].gain.value, .35);
  director.destroy();
});

test('browser voice discovery timeout does not interrupt healthy recorded playback', async () => {
  const h = harness({voices: []}), director = createAudioDirector({env: h.env, recordings});
  await director.unlock(); director.playLines([line('record-a')]);
  h.clock.advance(1500);
  assert.equal(director.getStatus().voiceStatus, 'missing');
  assert.equal(director.getStatus().speaking, true);
  assert.equal(director.getStatus().degradedText, '');
  assert.equal(director.getStatus().currentLineId, 'record-a');
  endRecording(recordedAudio(h)[0]);
  assert.equal(director.getStatus().error, null); director.destroy();
});

test('recording failure falls back to the same Russian line and then continues the recording queue', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings});
  await director.unlock(); director.playLines([line('record-a'), line('record-b')]);
  const first = recordedAudio(h)[0]; first.dispatch('error');
  assert.equal(first.paused, true); assert.equal(h.spoken.length, 1);
  assert.equal(h.spoken[0].text, line('record-a').text);
  assert.equal(h.spoken[0].voice.lang, 'ru-RU');
  assert.equal(director.getStatus().speechProvider, 'browser');
  assert.match(director.getStatus().degradedText, /системный голос/);
  assert.equal(h.contexts[0].gains[0].gain.value, .35 * .24);
  h.synth.finish(); h.clock.advance(0);
  assert.equal(director.getStatus().currentLineId, 'record-b');
  assert.equal(director.getStatus().speechProvider, 'recorded');
  endRecording(recordedAudio(h)[0]);
  assert.equal(h.contexts[0].gains[0].gain.value, .35);
  director.destroy();
});

test('a missing recording uses Russian fallback, while failure of both providers is reported without blocking play', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings}); await director.unlock();
  director.playLines([line('not-in-manifest')]);
  assert.equal(director.getStatus().speechProvider, 'browser');
  assert.equal(h.spoken.length, 1); assert.equal(recordedAudio(h).length, 0); director.destroy();
  const missing = harness({speechAvailable: false});
  const silent = createAudioDirector({env: missing.env, recordings}); await silent.unlock();
  silent.playLines([line('record-a'), line('record-b')]); recordedAudio(missing)[0].dispatch('error');
  assert.equal(silent.getStatus().speaking, false);
  assert.equal(silent.getStatus().ready, false);
  assert.equal(silent.getStatus().canSpeak, true, 'a failed clip remains explicitly retryable');
  assert.match(silent.getStatus().error, /Запись реплики недоступна.*русский системный голос не найден/);
  assert.equal(missing.contexts[0].gains[0].gain.value, .35);
  assert.equal(recordedAudio(missing).length, 0);
  assert.equal(silent.replay(), true); assert.equal(silent.getStatus().currentLineId, 'record-a');
  assert.equal(silent.getStatus().error, null);
  assert.equal(silent.playLines([line('not-in-manifest')]), false);
  assert.match(silent.getStatus().error, /Запись этой реплики отсутствует/); silent.destroy();
});

test('recording cancellation ignores captured ended/error callbacks and rejected old play promises', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings});
  director.playLines([line('record-a'), line('record-b')]);
  const first = recordedAudio(h)[0]; let rejectOld;
  first.playResult = new Promise((resolve, reject) => { rejectOld = reject; });
  await director.unlock();
  const ended = [...first.listeners.get('ended')][0], failed = [...first.listeners.get('error')][0];
  director.playLines([line('record-c')]);
  ended(); failed(); rejectOld(new Error('cancelled')); await flush(); h.clock.advance(0);
  assert.equal(first.paused, true); assert.equal(director.getStatus().currentLineId, 'record-c');
  assert.equal(h.spoken.length, 0); assert.equal(director.getStatus().error, null);
  assert.equal(recordedAudio(h).length, 1);
  director.stopSpeech(); h.clock.advance(100000);
  assert.equal(recordedAudio(h).length, 0); assert.equal(director.getStatus().speaking, false);
  assert.equal(h.contexts[0].gains[0].gain.value, .35); director.destroy();
});

test('hidden and mute cancel recorded speech; explicit replay restarts from the beginning', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings}); await director.unlock();
  director.playLines([line('record-a')]); const first = recordedAudio(h)[0]; first.currentTime = 1;
  h.document.hidden = true; h.document.dispatch('visibilitychange');
  assert.equal(first.paused, true); assert.equal(director.getStatus().speaking, false);
  h.document.hidden = false; h.document.dispatch('visibilitychange'); await director.unlock();
  assert.equal(recordedAudio(h).length, 0, 'returning to the tab must not repeat a line');
  director.replay(); assert.equal(recordedAudio(h)[0].currentTime, 0);
  director.updatePreferences({voices: .2}); assert.equal(h.contexts[0].gains[2].gain.value, .2);
  director.updatePreferences({enabled: false}); assert.equal(recordedAudio(h).length, 0);
  director.updatePreferences({enabled: true}); assert.equal(director.getStatus().speaking, false);
  director.destroy();
});

test('a stalled recording times out into fallback and a failing fallback restores the music', async () => {
  const h = harness(), director = createAudioDirector({env: h.env, recordings}); await director.unlock();
  director.playLines([line('record-a')]); h.clock.advance(12000);
  assert.equal(h.spoken.length, 1); assert.equal(director.getStatus().speechProvider, 'browser');
  h.synth.fail(); assert.equal(director.getStatus().speaking, false);
  assert.ok(director.getStatus().error); assert.equal(h.contexts[0].gains[0].gain.value, .35);
  director.destroy();
});
