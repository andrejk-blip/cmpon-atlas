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

test('recordings remain tied to the current authored text and checked pronunciation input', () => {
  const bytes = readFileSync(new URL('scripts/voice-stress.json', root));
  assert.equal(sha256(bytes), RECORDING_META.stressSha256, 'pronunciation input changed without regenerating recordings');
  const stress = JSON.parse(bytes).lines;
  assert.deepEqual(Object.keys(stress).sort(), SPEECH_LINES.map(line => line.id).sort());
  for (const line of SPEECH_LINES) assert.equal(stress[line.id].source, line.text, `${line.id}: recording uses stale authored dialogue`);
});
