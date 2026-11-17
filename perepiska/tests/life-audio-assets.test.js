import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { SPEECH_LINES } from '../src/life/speech-catalog.js';
import { RECORDINGS, RECORDING_META } from '../assets/audio/voices/manifest.js';

const root = new URL('../', import.meta.url);
const voices = new URL('assets/audio/voices/', root);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Read MPEG Layer III frame headers rather than depending on ffprobe in CI.
// This validates the shipped stream duration/format, independently of its manifest.
function inspectMp3(bytes, id) {
  let offset = 0;
  if (bytes.subarray(0, 3).toString('ascii') === 'ID3') {
    assert.ok(bytes.length >= 10, `${id}: truncated ID3 header`);
    const tagSize = [6, 7, 8, 9].reduce((size, i) => (size << 7) | (bytes[i] & 127), 0);
    offset = 10 + tagSize + (bytes[5] & 16 ? 10 : 0);
  }
  let frames = 0, duration = 0;
  const formats = new Set();
  while (offset < bytes.length) {
    if (bytes.length - offset === 128 && bytes.subarray(offset, offset + 3).toString('ascii') === 'TAG') break;
    assert.ok(bytes.length - offset >= 4, `${id}: truncated MPEG header at ${offset}`);
    const header = bytes.readUInt32BE(offset);
    const version = (header >>> 19) & 3, layer = (header >>> 17) & 3;
    const bitrateIndex = (header >>> 12) & 15, sampleIndex = (header >>> 10) & 3;
    assert.equal(header >>> 21, 2047, `${id}: invalid MPEG sync at ${offset}`);
    assert.notEqual(version, 1, `${id}: reserved MPEG version`);
    assert.equal(layer, 1, `${id}: expected MPEG Layer III`);
    assert.ok(bitrateIndex > 0 && bitrateIndex < 15 && sampleIndex < 3, `${id}: invalid audio format`);
    const table = version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const bitrate = table[bitrateIndex] * 1000;
    const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const channels = ((header >>> 6) & 3) === 3 ? 1 : 2;
    const frameSize = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((header >>> 9) & 1);
    assert.ok(offset + frameSize <= bytes.length, `${id}: incomplete audio frame`);
    formats.add(`${sampleRate}/${channels}/${bitrate}`);
    duration += (version === 3 ? 1152 : 576) / sampleRate;
    frames++;
    offset += frameSize;
  }
  assert.ok(frames > 8, `${id}: recording is too short to contain a spoken line`);
  return { duration, formats };
}

test('every speech line has exactly one shipped recording, with no orphan MP3 files', () => {
  const ids = SPEECH_LINES.map(line => line.id).sort();
  assert.equal(ids.length, 92);
  assert.deepEqual(Object.keys(RECORDINGS).sort(), ids);
  assert.deepEqual(readdirSync(voices).filter(name => name.endsWith('.mp3')).sort(), ids.map(id => `${id}.mp3`).sort());
  const urls = new Set();
  for (const line of SPEECH_LINES) {
    const clip = RECORDINGS[line.id];
    assert.equal(clip.url, `assets/audio/voices/${line.id}.mp3`);
    assert.equal(clip.speakerId, line.speakerId, `${line.id}: wrong speaker`);
    assert.equal(clip.voice, RECORDING_META.profiles[line.speakerId].voice, `${line.id}: wrong voice profile`);
    urls.add(clip.url);
  }
  assert.equal(urls.size, ids.length);
});

test('runtime and source recording manifests describe the same files and metadata', () => {
  const { lines, ...metadata } = JSON.parse(readFileSync(new URL('manifest.json', voices), 'utf8'));
  assert.deepEqual(lines, RECORDINGS);
  assert.deepEqual(metadata, RECORDING_META);
});

test('all recorded files match their hashes, sizes, measured duration and audio format', () => {
  for (const [id, clip] of Object.entries(RECORDINGS)) {
    const bytes = readFileSync(new URL(clip.url, root));
    assert.equal(bytes.length, clip.bytes, `${id}: size mismatch`);
    assert.equal(sha256(bytes), clip.sha256, `${id}: content hash mismatch`);
    assert.ok(Number.isFinite(clip.duration) && clip.duration >= .25, `${id}: invalid duration`);
    const actual = inspectMp3(bytes, id);
    assert.deepEqual([...actual.formats], [`${RECORDING_META.sampleRate}/${RECORDING_META.channels}/${RECORDING_META.bitrate}`], `${id}: audio format differs from manifest`);
    // ffprobe excludes the MPEG Info frame from duration; allow that one frame
    // plus the manifest's millisecond rounding, but not a truncated sentence.
    assert.ok(Math.abs(actual.duration - clip.duration) < .05, `${id}: stream duration ${actual.duration} differs from ${clip.duration}`);
  }
});

test('recordings remain tied to the current authored text and exact synthesis input', () => {
  assert.equal(RECORDING_META.renderInputPath, 'scripts/voice-qwen.json');
  const bytes = readFileSync(new URL(RECORDING_META.renderInputPath, root));
  assert.equal(sha256(bytes), RECORDING_META.renderInputSha256, 'synthesis input changed without regenerating recordings');
  const inputs = JSON.parse(bytes).lines;
  assert.deepEqual(Object.keys(inputs).sort(), SPEECH_LINES.map(line => line.id).sort());
  for (const line of SPEECH_LINES) {
    const input = inputs[line.id], clip = RECORDINGS[line.id];
    assert.equal(input.sourceText, line.text, `${line.id}: recording uses stale authored dialogue`);
    // This corpus has two numeric expressions; preserve every word and stage
    // direction decision already authored by the speech catalog.
    assert.equal(input.synthesisText, line.text.replace(/\b300\b/g, 'триста').replace(/\b12\b/g, 'двенадцать'), `${line.id}: unintended spoken-text edit`);
    assert.equal(clip.textSha256, sha256(Buffer.from(line.text)), `${line.id}: authored text hash mismatch`);
    assert.equal(clip.renderInputSha256, sha256(Buffer.from(input.synthesisText)), `${line.id}: synthesis text hash mismatch`);
    assert.equal(input.referenceId, clip.referenceId, `${line.id}: wrong synthesis reference`);
    assert.equal(input.referenceSha256, clip.referenceSha256, `${line.id}: reference content changed`);
  }
});

test('Qwen recordings identify the actual model and each fixed synthetic character reference', () => {
  assert.equal(RECORDING_META.version, 2);
  assert.equal(RECORDING_META.provider, 'qwen3-tts-local');
  assert.equal(RECORDING_META.license, 'Apache-2.0');
  assert.equal(RECORDING_META.sampleRate, 24000);
  assert.equal(RECORDING_META.channels, 1);
  assert.equal(RECORDING_META.bitrate, 128000);
  const models = Object.values(RECORDING_META.models);
  assert.equal(models.length, 2);
  for (const model of models) {
    assert.match(model.id, /^Qwen\/Qwen3-TTS-12Hz-(?:0\.6B|1\.7B)-(?:Base|VoiceDesign)$/);
    assert.match(model.revision, /^[a-f0-9]{40}$/);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
  }
  const speakers = [...new Set(SPEECH_LINES.map(line => line.speakerId))].sort();
  assert.equal(speakers.length, 10);
  assert.deepEqual(Object.keys(RECORDING_META.profiles).sort(), speakers);
  const voicesUsed = new Set(), referencesUsed = new Set();
  for (const speakerId of speakers) {
    const profile = RECORDING_META.profiles[speakerId], reference = profile.reference;
    assert.ok(typeof profile.voice === 'string' && profile.voice.length > 0);
    assert.ok(typeof profile.referenceId === 'string' && profile.referenceId.length > 0);
    assert.match(profile.referenceSha256, /^[a-f0-9]{64}$/);
    assert.equal(reference.sha256, profile.referenceSha256);
    assert.match(reference.file, /^scripts\/voice-references\/[a-z0-9-]+\.wav$/);
    assert.equal(sha256(readFileSync(new URL(reference.file, root))), reference.sha256, `${speakerId}: synthetic reference content changed`);
    assert.ok(typeof reference.text === 'string' && reference.text.trim());
    voicesUsed.add(profile.voice); referencesUsed.add(reference.sha256);
  }
  assert.equal(voicesUsed.size, speakers.length, 'each character must have its own stable voice identity');
  assert.equal(referencesUsed.size, speakers.length, 'characters must not share the same synthetic reference file');
  for (const [id, clip] of Object.entries(RECORDINGS)) {
    const profile = RECORDING_META.profiles[clip.speakerId];
    assert.equal(clip.provider, RECORDING_META.provider, `${id}: mixed speech providers`);
    assert.equal(clip.license, RECORDING_META.license, `${id}: wrong model license`);
    assert.equal(clip.referenceId, profile.referenceId, `${id}: voice reference differs from character casting`);
    assert.equal(clip.referenceSha256, profile.referenceSha256, `${id}: voice reference differs from character casting`);
    assert.ok(models.some(model => model.id === clip.model && model.revision === clip.modelRevision), `${id}: unpinned synthesis model`);
  }
  assert.match(readFileSync(new URL('LICENSE-QWEN3-TTS.txt', voices), 'utf8'), /Apache License[\s\S]*Version 2\.0, January 2004/);
});
