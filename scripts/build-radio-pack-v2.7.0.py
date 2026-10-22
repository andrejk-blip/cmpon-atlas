#!/usr/bin/env python3
"""Build 74 Russian radio MP3s locally with Silero v5_cis_base (MIT).

The model and PyTorch are build-time tools only. No model, credential, request to a
TTS service or OS voice dependency is shipped to a player's browser. The original
110 recordings and the two earlier generated 2.7 recordings are never overwritten.
Requires CPU torch, NumPy, SciPy, ffmpeg and node. See voice-v2.7.0/README.md.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.request
import wave

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'assets' / 'voice-v2.7.0'
MODEL_URL = 'https://models.silero.ai/models/tts/ru/v5_cis_base.pt'
MODEL_SHA256 = 'ba41b18f6a707ad93605a162998865e7c087153d2e010a26dd02229dab0e672a'
LEGACY_IDS = {'radio270-captain-office', 'radio270-enemy-taunt'}
SAMPLE_RATE = 44100
ROLES = {
    'navigator': ('ru_dmitriy', 'Штурман', 'Дмитрий'),
    'engineer': ('ru_bogdan', 'Бортинженер', 'Богдан'),
    'operator': ('ru_eduard', 'Оператор связи', 'Эдуард'),
    'cargo': ('ru_marat', 'Старший конвоя', 'Марат'),
    'antagonist': ('ru_alexandr', None, 'Александр'),
    'hostile': ('ru_roman', None, 'Роман'),
}

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def rms(a):
    return float(np.sqrt(np.mean(a * a))) if len(a) else 0.0

def decode(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le',
                        '-ac', '1', '-ar', str(SAMPLE_RATE), 'pipe:1'],
                       check=True, capture_output=True)
    return np.frombuffer(p.stdout, dtype='<f4').astype(np.float64)

def trim_edges(a):
    hop = int(SAMPLE_RATE * .01)
    active = np.flatnonzero(np.array([rms(a[i:i + hop]) for i in range(0, len(a), hop)]) > .004)
    if not len(active):
        raise ValueError('Silent synthesized recording')
    return a[max(0, (active[0] - 5) * hop):min(len(a), (active[-1] + 13) * hop)]

def noise(n, rng):
    a = sosfilt(butter(2, [650, 4200], 'bandpass', fs=SAMPLE_RATE, output='sos'), rng.standard_normal(n))
    return a / max(rms(a), 1e-9)

def edge(seconds, rng, closing=False):
    n = round(seconds * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    a = noise(n, rng) * .026 * np.sin(np.pi * np.arange(n) / max(n - 1, 1)) ** 1.8
    local = t - (.025 if closing else .045)
    a += np.where(local >= 0, .045 * np.exp(-np.maximum(local, 0) * 125) * np.sin(2 * np.pi * 850 * local), 0)
    return a

def process(dry, target, clip_id):
    a = trim_edges(decode(dry))
    assert .25 < len(a) / SAMPLE_RATE < 24, clip_id
    a = sosfilt(butter(2, [185, 4400], 'bandpass', fs=SAMPLE_RATE, output='sos'), a)
    a *= .125 / max(rms(a), 1e-6)
    a = .65 * np.tanh(a / .65)
    a *= .12 / max(rms(a), 1e-6)
    fade = min(round(.012 * SAMPLE_RATE), len(a) // 2)
    a[:fade] *= np.linspace(0, 1, fade)
    a[-fade:] *= np.linspace(1, 0, fade)
    rng = np.random.default_rng(int(hashlib.sha256(clip_id.encode()).hexdigest()[:8], 16))
    a += noise(len(a), rng) * .0016
    a = np.concatenate([edge(.18, rng), np.zeros(round(.04 * SAMPLE_RATE)), a,
                        np.zeros(round(.06 * SAMPLE_RATE)), edge(.16, rng, True)])
    peak = float(np.max(np.abs(a)))
    if peak > .78:
        a *= .78 / peak
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SAMPLE_RATE),
                    '-ac', '1', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '64k',
                    '-map_metadata', '-1', str(target)], input=a.astype('<f4').tobytes(), check=True, capture_output=True)
    actual = decode(target)
    assert np.all(np.isfinite(actual)) and .015 < rms(actual) < .24, clip_id
    assert float(np.max(np.abs(actual))) < .99, clip_id
    return {'duration': round(len(actual) / SAMPLE_RATE, 4), 'bytes': target.stat().st_size,
            'sha256': sha(target), 'drySha256': sha(dry),
            'peakDbfs': round(20 * np.log10(max(float(np.max(np.abs(actual))), 1e-9)), 2),
            'rmsDbfs': round(20 * np.log10(rms(actual)), 2), 'radioProcessed': True}

def role_for(line):
    ctx = line['contexts'][0]
    if line['speaker'] == 'enemy':
        return 'antagonist' if ctx in ['orbit', 'pursuit', 'parallax'] else 'hostile'
    return {'orbit': 'navigator', 'pursuit': 'navigator', 'base': 'engineer',
            'convoy': 'cargo', 'swarm': 'operator', 'parallax': 'operator', 'mrg': 'operator'}[ctx]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--workdir', type=Path, required=True, help='Temporary WAVs outside the repository')
    parser.add_argument('--download-model', action='store_true')
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args()
    assert not args.workdir.resolve().is_relative_to(ROOT), 'Keep build-time WAVs outside the site'
    if not args.model.exists():
        if not args.download_model:
            parser.error('Model missing. --download-model downloads the public model with a pinned SHA256.')
        args.model.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, args.model)
    assert sha(args.model) == MODEL_SHA256, 'Model bytes differ from the inspected release'
    args.workdir.mkdir(parents=True, exist_ok=True)
    FOLDER.mkdir(parents=True, exist_ok=True)
    pack_path = ROOT / 'assets' / 'citadel-radio-pack-v2.7.0.js'
    node = 'const fs=require("fs"),vm=require("vm");let c={};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],"utf8"),c);process.stdout.write(JSON.stringify(c.CITADEL_RADIO_PACK.lines));'
    lines = json.loads(subprocess.check_output(['node', '-e', node, str(pack_path)], text=True))
    accents = dict(x.split('|', 1) for x in (ROOT / 'scripts' / 'radio270-stressed.txt').read_text().splitlines() if x.strip())
    old_manifest = json.loads((FOLDER / 'manifest.json').read_text())
    legacy = [c for c in old_manifest['clips'] if c['id'] in LEGACY_IDS]
    assert {c['id'] for c in legacy} == LEGACY_IDS
    for c in legacy:
        assert sha(FOLDER / c['file']) == c['sha256'], 'Existing recording changed'
    candidates = [line for line in lines if line['id'] not in LEGACY_IDS]
    assert len(candidates) == len(accents) == 74
    for line in candidates:
        t = accents[line['id']]
        assert t.replace('+', '') == line['text'], line['id']
        for w in re.findall('[А-Яа-яЁё+]+', t):
            if len(re.findall('[аеёиоуыэюя]', w.lower())) > 1:
                assert '+' in w or 'ё' in w.lower(), ('Missing explicit stress', line['id'], w)
    import torch
    torch.set_num_threads(args.threads)
    model = torch.package.PackageImporter(str(args.model)).load_pickle('tts_models', 'model')
    model.to(torch.device('cpu'))
    assert all(v[0] in model.speakers for v in ROLES.values())
    start = time.monotonic()
    clips = list(legacy)
    for index, line in enumerate(candidates):
        role = role_for(line)
        speaker, sender, name = ROLES[role]
        torch.manual_seed(int(hashlib.sha256(line['id'].encode()).hexdigest()[:8], 16))
        a = model.apply_tts(text=accents[line['id']], speaker=speaker, sample_rate=24000)
        dry = args.workdir / (line['id'] + '.wav')
        with wave.open(str(dry), 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000)
            f.writeframes((a.clamp(-1, 1) * 32767).to(torch.int16).numpy().tobytes())
        file = line['id'] + '.mp3'
        meta = process(dry, FOLDER / file, line['id'])
        clips.append({'id': line['id'], 'kind': 'commander', 'speaker': line['speaker'],
                      'voice': (sender or 'Перехваченный канал') + ' · ' + name,
                      'sender': sender, 'role': role, 'text': line['text'], 'spokenText': line['text'],
                      'synthesisText': accents[line['id']], 'file': file,
                      'generation': {'engine': 'Silero', 'model': 'v5_cis_base', 'speaker': speaker,
                                     'license': 'MIT', 'sampleRate': 24000}, **meta})
        if index % 10 == 0 or index == len(candidates)-1:
            print(json.dumps({'generated': index+1, 'total': len(candidates), 'elapsedSeconds': round(time.monotonic()-start, 2)}), flush=True)
    assert len(clips) == len({c['id'] for c in clips}) == 76
    manifest = {'version': '2.7.0', 'language': 'ru',
                'generation': {'service': 'Local CPU synthesis', 'model': 'Silero v5_cis_base',
                               'modelUrl': MODEL_URL, 'modelSha256': MODEL_SHA256, 'license': 'MIT',
                               'software': {'torch': torch.__version__, 'numpy': np.__version__},
                               'newLocalRecordings': 74, 'preservedEarlierRecordings': 2,
                               'roles': {k: {'speaker': v[0], 'sender': v[1], 'voiceName': v[2]} for k, v in ROLES.items()},
                               'legacyRecordingSource': {'service': 'Runway', 'model': 'eleven_v3', 'presets': ['Bernard', 'Clint']},
                               'recordings': 'Original game dialogue. Public preset voices; no cloning or private voice samples.'},
                'processing': {'sampleRate': SAMPLE_RATE, 'channels': 1, 'mp3Kbps': 64, 'pitchShift': False,
                               'speedChange': False, 'radioBandHz': [185, 4400], 'radioEdgesSeconds': [.18, .16]},
                'availability': {'newPreparedCount': len(clips), 'fullNewTextBankPrepared': True,
                                 'expandedTextDelivery': 'All 76 new lines are same-origin MP3 files. No system Russian voice or TTS service required.'},
                'clips': clips}
    (FOLDER / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    runtime_fields = ['id', 'kind', 'speaker', 'voice', 'sender', 'role', 'text', 'spokenText', 'file', 'duration', 'sha256', 'bytes']
    runtime = [{k: c[k] for k in runtime_fields if k in c} for c in clips]
    script = pack_path.read_text()
    script, count = re.subn(r'  const clips = \[.*?\];', '  const clips = ' + json.dumps(runtime, ensure_ascii=False, separators=(',', ':')) + ';', script, count=1, flags=re.S)
    assert count == 1
    pack_path.write_text(script)
    summary = {'clips': len(clips), 'locallyGenerated': 74, 'bytes': sum(c['bytes'] for c in clips),
               'seconds': round(sum(c['duration'] for c in clips), 2), 'maxPeakDbfs': max(c['peakDbfs'] for c in clips),
               'localGenerationSeconds': round(time.monotonic()-start, 2), 'modelSha256': MODEL_SHA256,
               'externalTtsRequests': 0, 'runtimeModels': 0, 'legacy110Touched': False}
    (ROOT / 'tests' / 'qa-2.7.0' / 'audio-local-generation.json').write_text(json.dumps(summary, indent=2)+'\n')
    print(json.dumps(summary), flush=True)

if __name__ == '__main__':
    main()
