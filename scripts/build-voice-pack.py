#!/usr/bin/env python3
"""Prepare local captain recordings; never makes network requests or changes text.

Requires ffmpeg, NumPy and SciPy. Pass the approved JSON plan and dry MP3 folder.
The delivered MP3 files are self-contained; runtime has no TTS service dependency.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt

parser = argparse.ArgumentParser()
parser.add_argument('--plan', required=True)
parser.add_argument('--dry', required=True)
args = parser.parse_args()
plan = json.loads(Path(args.plan).read_text())
root = Path(__file__).resolve().parents[1]
folder = root / 'assets' / 'voice-v1.8.2'
folder.mkdir(parents=True, exist_ok=True)
sample_rate = 44100

def decode(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le',
                             '-ac', '1', '-ar', str(sample_rate), 'pipe:1'],
                            check=True, capture_output=True)
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)

def rms(samples):
    return float(np.sqrt(np.mean(samples * samples))) if len(samples) else 0.0

def trim_edges(samples):
    # Trim only exterior quiet blocks; pauses inside a sentence remain intact.
    hop = int(sample_rate * .01)
    blocks = np.array([rms(samples[i:i + hop]) for i in range(0, len(samples), hop)])
    active = np.flatnonzero(blocks > .004)
    if not len(active):
        raise ValueError('Silent speech recording')
    begin = max(0, (active[0] - 5) * hop)
    end = min(len(samples), (active[-1] + 13) * hop)
    return samples[begin:end]

def noise(length, rng, low=650, high=4200):
    values = rng.standard_normal(length)
    values = sosfilt(butter(2, [low, high], 'bandpass', fs=sample_rate, output='sos'), values)
    return values / max(rms(values), 1e-9)

def radio_edge(seconds, rng, closing=False):
    n = round(seconds * sample_rate)
    t = np.arange(n) / sample_rate
    signal = noise(n, rng) * .026 * np.sin(np.pi * np.arange(n) / max(n - 1, 1)) ** 1.8
    # A soft relay transient and a short squelch tail, with no piercing beep.
    at = .045 if not closing else .025
    local = t - at
    mask = local >= 0
    signal += np.where(mask, .045 * np.exp(-np.maximum(local, 0) * 125)
                       * np.sin(2 * np.pi * 850 * local), 0)
    return signal

def prepare(clip):
    filename = clip['file']
    assert filename == Path(filename).name and filename.endswith('.mp3')
    source = Path(args.dry) / filename
    samples = trim_edges(decode(source))
    is_radio = clip['kind'] == 'commander'
    low, high = (185, 4400) if is_radio else (100, 6800)
    samples = sosfilt(butter(2, [low, high], 'bandpass', fs=sample_rate, output='sos'), samples)
    assert 0.25 < len(samples) / sample_rate < 24, clip['id']
    # Preserve natural pitch and timing; gentle companding only reins in peaks.
    samples *= .125 / max(rms(samples), 1e-6)
    samples = .65 * np.tanh(samples / .65)
    samples *= .12 / max(rms(samples), 1e-6)
    fade = min(round(.012 * sample_rate), len(samples) // 2)
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    rng = np.random.default_rng(int(hashlib.sha256(clip['id'].encode()).hexdigest()[:8], 16))
    if is_radio:
        # Quiet carrier under speech; syllables remain untouched by dropout FX.
        samples += noise(len(samples), rng) * .0016
        samples = np.concatenate([radio_edge(.18, rng), np.zeros(round(.04 * sample_rate)),
                                  samples, np.zeros(round(.06 * sample_rate)), radio_edge(.16, rng, True)])
    else:
        # Small natural gap lets the shared prefix and explanation join cleanly.
        samples = np.concatenate([np.zeros(round(.02 * sample_rate)), samples,
                                  np.zeros(round(.06 * sample_rate))])
    peak = float(np.max(np.abs(samples)))
    if peak > .78:
        samples *= .78 / peak
    target = folder / filename
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sample_rate),
                    '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '64k',
                    '-map_metadata', '-1', str(target)], input=samples.astype('<f4').tobytes(),
                   capture_output=True, check=True)
    actual = decode(target)
    assert np.all(np.isfinite(actual)) and .015 < rms(actual) < .24, clip['id']
    assert float(np.max(np.abs(actual))) < .99, clip['id']
    return {**clip, 'duration': round(len(actual) / sample_rate, 4),
            'bytes': target.stat().st_size,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'drySha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'peakDbfs': round(20 * np.log10(max(float(np.max(np.abs(actual))), 1e-9)), 2),
            'rmsDbfs': round(20 * np.log10(rms(actual)), 2),
            'radioProcessed': is_radio}

with ThreadPoolExecutor(max_workers=4) as pool:
    clips = list(pool.map(prepare, plan['clips']))
assert len(clips) == len({clip['id'] for clip in clips})
manifest = {'version': '1.8.2', 'voice': 'Капитан', 'language': 'ru',
            'generation': {'service': 'Runway', 'preset': 'Bernard', 'model': 'eleven_v3',
                           'speed': 1, 'recordings': 'Original generated speech; no voice cloning.'},
            'processing': {'sampleRate': sample_rate, 'channels': 1, 'mp3Kbps': 64,
                           'pitchShift': False, 'speedChange': False,
                           'radioBandHz': [185, 4400], 'lessonBandHz': [100, 6800],
                           'radioEdgesSeconds': [.18, .16]},
            'clips': [{k: v for k, v in c.items() if k != 'existingProbe'} for c in clips]}
(folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
runtime_fields = ['id', 'kind', 'text', 'spokenText', 'caption', 'file', 'duration', 'sha256', 'bytes']
runtime = {'version': '1.8.2', 'voice': 'Капитан', 'baseUrl': './assets/voice-v1.8.2/',
           'clips': [{k: c[k] for k in runtime_fields if k in c} for c in clips]}
script = ('/* Citadel 1.8.2: prepared captain voice, loaded before the voice runtime. */\n'
          '(function(){\'use strict\';const pack=' + json.dumps(runtime, ensure_ascii=False, separators=(',', ':')) +
          ';pack.clips=Object.freeze(pack.clips.map(Object.freeze));globalThis.CITADEL_VOICE_PACK=Object.freeze(pack);})();\n')
(root / 'assets' / 'citadel-voice-pack-v1.8.2.js').write_text(script)
print(json.dumps({'clips': len(clips), 'bytes': sum(c['bytes'] for c in clips),
                  'seconds': round(sum(c['duration'] for c in clips), 2),
                  'maxPeakDbfs': max(c['peakDbfs'] for c in clips)}, ensure_ascii=False))
