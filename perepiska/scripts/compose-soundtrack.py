#!/usr/bin/env python3
"""Compose and render three original, quiet, loopable cues for Переписка.

No external songs/MIDI are used. The score, voicings and timing live here.
Requirements: Python 3 + numpy, libfluidsynth, ffmpeg; an MIT FluidR3Mono_GM.sf3.
The SoundFont is a build input, not a shipped game asset. See docs/MUSIC.md.
"""
from __future__ import annotations

import argparse
import ctypes as C
import ctypes.util
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
import wave

import numpy as np

SAMPLE_RATE = 44100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/audio/music'
DEFAULT_SF = Path(os.environ.get('PEREPISKA_SOUNDFONT',
    '/usr/share/fluidr3mono-gm-soundfont/FluidR3Mono_GM.sf3'))

# Program numbers use the zero-based General MIDI convention.
# Five-note family motif: scale degrees 2, 3, 5, 3, 1, with composed answers.
TRACKS = {
    'morning': {
        'title': 'Окно на Лесную', 'bpm': 88, 'bars': 32, 'tonic': 62, 'seed': 271828,
        'lead': 0, 'comp': 0, 'guitar': 24, 'bass': 32,
        'chords': [
            (50, [62, 66, 69, 73, 76]), (54, [61, 64, 66, 69, 73]),
            (43, [59, 62, 66, 69, 74]), (45, [62, 67, 69, 71, 76]),
            (47, [62, 66, 69, 73, 78]), (40, [59, 62, 66, 67, 71]),
            (45, [61, 64, 67, 71, 78]), (50, [62, 66, 69, 71, 76]),
        ],
        'lead_velocity': 53, 'comp_velocity': 39, 'guitar_velocity': 38,
        'pan': [62, 49, 85, 60], 'volumes': [83, 69, 68, 70], 'reverb': .23,
    },
    'courtyard': {
        'title': 'Знакомые окна', 'bpm': 96, 'bars': 32, 'tonic': 67, 'seed': 314159,
        'lead': 73, 'comp': 4, 'guitar': 24, 'bass': 32,
        'chords': [
            (43, [59, 62, 66, 69, 74]), (45, [60, 64, 67, 71, 76]),
            (50, [60, 64, 66, 69, 76]), (43, [59, 62, 64, 69, 74]),
            (40, [59, 62, 67, 71, 74]), (48, [59, 64, 67, 71, 74]),
            (45, [60, 64, 67, 71, 76]), (50, [60, 64, 66, 71, 76]),
        ],
        'lead_velocity': 43, 'comp_velocity': 36, 'guitar_velocity': 43,
        'pan': [68, 47, 83, 60], 'volumes': [70, 57, 78, 68], 'reverb': .20,
    },
    'evening': {
        'title': 'После смены', 'bpm': 76, 'bars': 24, 'tonic': 65, 'seed': 161803,
        'lead': 4, 'comp': 4, 'guitar': 24, 'bass': 32,
        'chords': [
            (41, [57, 60, 64, 67, 72]), (38, [57, 60, 64, 65, 69]),
            (43, [58, 62, 65, 69, 74]), (48, [58, 62, 64, 69, 74]),
            (45, [60, 64, 67, 71, 76]), (38, [57, 60, 64, 65, 69]),
            (46, [57, 62, 65, 69, 72]), (48, [58, 60, 65, 67, 74]),
        ],
        'lead_velocity': 53, 'comp_velocity': 40, 'guitar_velocity': 34,
        'pan': [63, 48, 82, 62], 'volumes': [84, 62, 67, 65], 'reverb': .29,
    },
}


def score(name: str) -> list[tuple[float, float, int, int, int]]:
    """Return authored notes (beat, duration, channel, MIDI pitch, velocity)."""
    cfg = TRACKS[name]
    rng = random.Random(cfg['seed'])
    notes = []

    def note(beat, duration, channel, pitch, velocity, human=True):
        # Tiny, bounded timing/velocity changes repeat identically every loop.
        timing = rng.uniform(-.017, .017) if human else 0
        vel = int(round(velocity + rng.uniform(-3, 3))) if human else int(velocity)
        notes.append((max(.015, beat + timing), duration, channel, int(pitch), max(1, min(100, vel))))

    for bar in range(cfg['bars']):
        phrase, pos = divmod(bar, 8)
        root, tones = cfg['chords'][pos]
        start = bar * 4
        # The middle section breathes: reduced comp/guitar and more melodic space.
        lift = [0.94, 1.0, .84, .98][phrase % 4]
        if name == 'evening':
            lift = [.94, .82, 1.0][phrase % 3]
        chord = tones[:-1] if phrase % 2 == 0 else tones[1:]
        # Chords are quietly rolled rather than mechanically simultaneous.
        for i, pitch in enumerate(chord):
            note(start + .06 + i * .025, 2.35 if name != 'evening' else 3.15,
                 1, pitch, cfg['comp_velocity'] * lift - i * .7)
        if pos in (1, 3, 5, 7) and phrase != 2:
            for i, pitch in enumerate(chord[-3:]):
                note(start + 2.6 + i * .025, .95, 1, pitch,
                     cfg['comp_velocity'] * .72 * lift)
        # Nylon guitar: irregular but recurring fingerpicked pattern, no busy strum.
        pattern = [(0, root + 12), (.75, tones[1]), (1.5, tones[2]),
                   (2.25, tones[0]), (3, tones[3]), (3.5, tones[1])]
        if name == 'evening':
            pattern = [(0.15, root + 12), (1.1, tones[1]), (2.15, tones[2]), (3.1, tones[0])]
        if name == 'courtyard':
            pattern = [(0, root + 12), (.5, tones[1]), (1.25, tones[2]),
                       (2, tones[0]), (2.75, tones[3]), (3.5, tones[2])]
        if phrase == 2 and not (name == 'evening' and pos == 7):
            pattern = pattern[::2]
        for i, (offset, pitch) in enumerate(pattern):
            note(start + offset, .72 if name != 'evening' else 1.25, 2, pitch,
                 cfg['guitar_velocity'] * lift * (1 if i % 3 == 0 else .9))
        # Upright bass has long releases and sparse roots/fifths.
        note(start + .025, 2.0 if name != 'evening' else 3.1, 3, root, 48 * lift)
        if name != 'evening':
            note(start + 2.45, 1.15, 3, root + (7 if pos in (1, 5) else 12), 35 * lift)
        # Barely audible brush/shaker punctuation in courtyard only.
        if name == 'courtyard':
            for off, key, velocity in [(.5, 82, 16), (1.5, 82, 12), (2.5, 82, 15), (3.5, 82, 11)]:
                note(start + off, .08, 9, key, velocity)
            if bar % 2 == 0:
                note(start + 1, .08, 9, 37, 16)
                note(start + 3, .08, 9, 37, 13)

    # A composed eight-bar melody; the core five-note motif receives short answers.
    t = cfg['tonic'] + (12 if name == 'morning' else 0)
    phrases = [
        [(0.5, .65, 2), (1.5, .65, 4), (2.5, 1.0, 7)],
        [(0.4, 1.05, 4), (2.1, 1.55, 0)],
        [(0.5, .7, 0), (1.5, .7, 2), (2.6, 1.05, 5)],
        [(0.5, 1.0, 4), (2.2, 1.4, 2)],
        [(0.6, .75, 4), (1.6, .65, 7), (2.6, .95, 9)],
        [(0.4, 1.15, 7), (2.2, 1.45, 2)],
        [(0.5, .65, -1), (1.5, .65, 2), (2.6, 1.0, 4)],
        [(0.5, 1.0, 2), (2.1, 1.6, 0)],
    ]
    if name == 'courtyard':
        # Flute in a mellow register; jaunty response rhythm, not a copied tune.
        phrases[2] = [(.65, .7, 4), (1.65, .6, 2), (2.75, .9, -1)]
        phrases[3] = [(.5, 1.25, 0), (2.45, .95, 2)]
        phrases[6] = [(.6, .65, 2), (1.6, .65, 5), (2.7, .9, 4)]
        phrases[7] = [(.6, .9, 2), (2.0, 1.55, -1)]
    if name == 'evening':
        # The same motif stretched over an intimate Rhodes reply.
        phrases[0] = [(.5, 1.0, 2), (2, 1.3, 4)]
        phrases[1] = [(.25, 1.05, 7), (1.75, .8, 4), (3, .8, 0)]
        phrases[6] = [(.6, 1.25, 4), (2.4, 1.1, 2)]
        phrases[7] = [(.5, 1.1, 0), (2.25, 1.4, 2)]
    for bar in range(cfg['bars']):
        phrase, pos = divmod(bar, 8)
        line = list(phrases[pos])
        if phrase == 1:
            # A variation: change the answer, retain the recognisable opening.
            if pos in (1, 5):
                line = [(0.75, .8, line[0][2]), (2.0, .65, 2), (3.0, .75, 0)]
            if pos == 7:
                line = [(1.0, 2.25, 0)]
        elif phrase == 2:
            # B section: long held tones with empty bars, leaving room for dialogue.
            line = [] if pos % 2 else [(0.75, 2.75, (2, 0, 4, 2)[pos // 2])]
            if name == 'evening' and pos == 7:
                # A gentle final reply carries into the next cycle, without a silent ending.
                line = [(.75, 1.05, 2), (2.25, 1.55, 0)]
        elif phrase == 3 and pos in (3, 7):
            line = [(0.75, 2.55, 0 if pos == 7 else 2)]
        for k, (offset, duration, interval) in enumerate(line):
            dynamics = cfg['lead_velocity'] * (.92 if phrase == 2 else 1.0)
            note(bar * 4 + offset, duration, 0, t + interval, dynamics - (3 if k == 2 else 0))
    return sorted(notes)


class FluidRenderer:
    def __init__(self, soundfont: Path, cfg: dict):
        library = ctypes.util.find_library('fluidsynth')
        if not library:
            raise RuntimeError('libfluidsynth is required to render the original score')
        self.lib = C.CDLL(library)
        functions = {
            'new_fluid_settings': (C.c_void_p, []),
            'fluid_settings_setnum': (C.c_int, [C.c_void_p, C.c_char_p, C.c_double]),
            'fluid_settings_setint': (C.c_int, [C.c_void_p, C.c_char_p, C.c_int]),
            'new_fluid_synth': (C.c_void_p, [C.c_void_p]),
            'fluid_synth_sfload': (C.c_int, [C.c_void_p, C.c_char_p, C.c_int]),
            'fluid_synth_program_change': (C.c_int, [C.c_void_p, C.c_int, C.c_int]),
            'fluid_synth_cc': (C.c_int, [C.c_void_p, C.c_int, C.c_int, C.c_int]),
            'fluid_synth_noteon': (C.c_int, [C.c_void_p, C.c_int, C.c_int, C.c_int]),
            'fluid_synth_noteoff': (C.c_int, [C.c_void_p, C.c_int, C.c_int]),
            'fluid_synth_write_float': (C.c_int, [C.c_void_p, C.c_int, C.c_void_p, C.c_int, C.c_int, C.c_void_p, C.c_int, C.c_int]),
            'fluid_synth_set_interp_method': (C.c_int, [C.c_void_p, C.c_int, C.c_int]),
            'delete_fluid_synth': (None, [C.c_void_p]),
            'delete_fluid_settings': (None, [C.c_void_p]),
            'fluid_version_str': (C.c_char_p, []),
        }
        for name, (restype, argtypes) in functions.items():
            fn = getattr(self.lib, name)
            fn.restype, fn.argtypes = restype, argtypes
        self.settings = self.lib.new_fluid_settings()
        for key, value in {'synth.sample-rate': SAMPLE_RATE, 'synth.gain': .62,
                           'synth.reverb.room-size': .48, 'synth.reverb.damp': .6,
                           'synth.reverb.width': 12, 'synth.reverb.level': cfg['reverb']}.items():
            if self.lib.fluid_settings_setnum(self.settings, key.encode(), value) != 0:
                raise RuntimeError(f'Unsupported setting {key}')
        for key, value in {'synth.reverb.active': 1, 'synth.chorus.active': 0,
                           'synth.polyphony': 192, 'synth.cpu-cores': 1}.items():
            if self.lib.fluid_settings_setint(self.settings, key.encode(), value) != 0:
                raise RuntimeError(f'Unsupported setting {key}')
        self.synth = self.lib.new_fluid_synth(self.settings)
        if self.lib.fluid_synth_sfload(self.synth, str(soundfont).encode(), 1) < 0:
            raise RuntimeError(f'Could not load {soundfont}')
        self.lib.fluid_synth_set_interp_method(self.synth, -1, 7)
        for channel, program in enumerate([cfg['lead'], cfg['comp'], cfg['guitar'], cfg['bass']]):
            self.lib.fluid_synth_program_change(self.synth, channel, program)
            self.lib.fluid_synth_cc(self.synth, channel, 7, cfg['volumes'][channel])
            self.lib.fluid_synth_cc(self.synth, channel, 10, cfg['pan'][channel])
            self.lib.fluid_synth_cc(self.synth, channel, 91, 30 if channel != 3 else 9)
        self.lib.fluid_synth_cc(self.synth, 9, 7, 36)
        self.version = self.lib.fluid_version_str().decode()

    def render(self, cfg: dict, notes: list) -> tuple[np.ndarray, int]:
        seconds_per_beat = 60 / cfg['bpm']
        loop_frames = round(cfg['bars'] * 4 * seconds_per_beat * SAMPLE_RATE)
        total_frames = loop_frames * 2
        events = []
        # First cycle warms the reverberation and release tails. Only cycle two ships.
        for repeat in range(2):
            for beat, duration, channel, pitch, velocity in notes:
                on = repeat * loop_frames + round(beat * seconds_per_beat * SAMPLE_RATE)
                off = on + round(duration * seconds_per_beat * SAMPLE_RATE)
                events.append((on, 1, channel, pitch, velocity))
                events.append((off, 0, channel, pitch, 0))
        events.sort()
        audio = np.zeros((total_frames, 2), dtype=np.float32)
        cursor = 0
        for sample, kind, channel, pitch, velocity in events + [(total_frames, -1, 0, 0, 0)]:
            target = min(sample, total_frames)
            while cursor < target:
                length = min(target - cursor, 4096)
                buf = audio[cursor:cursor + length]
                self.lib.fluid_synth_write_float(self.synth, length,
                    C.c_void_p(buf.ctypes.data), 0, 2, C.c_void_p(buf.ctypes.data), 1, 2)
                cursor += length
            if sample >= total_frames:
                break
            if kind:
                self.lib.fluid_synth_noteon(self.synth, channel, pitch, velocity)
            else:
                self.lib.fluid_synth_noteoff(self.synth, channel, pitch)
        return audio, loop_frames

    def close(self):
        self.lib.delete_fluid_synth(self.synth)
        self.lib.delete_fluid_settings(self.settings)


def write_wav(path: Path, audio: np.ndarray):
    peak = float(np.max(np.abs(audio)))
    if peak >= .97:
        audio = audio * (.92 / peak)
    pcm = (np.clip(audio, -.999, .999) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(pcm.tobytes())


def command(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, text=True, capture_output=True)


def loudness(path: Path) -> dict:
    result = command(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
        '-af', 'loudnorm=I=-23:TP=-3:LRA=8:print_format=json', '-f', 'null', '-'])
    return json.loads(re.findall(r'\{[^{}]+\}', result.stderr)[-1])


def produce(name: str, soundfont: Path, temporary: Path) -> dict:
    cfg = TRACKS[name]
    synth = FluidRenderer(soundfont, cfg)
    notes = score(name)
    audio, loop_frames = synth.render(cfg, notes)
    synth_version = synth.version
    synth.close()
    source = temporary / f'{name}-two-cycles.wav'
    write_wav(source, audio)
    del audio
    # Process the complete warmup + second cycle, so filter tails are also warmed.
    tone = 'highpass=f=65,lowpass=f=7000,equalizer=f=280:t=q:w=.7:g=-1.3'
    toned = temporary / f'{name}-tone.wav'
    command(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
             '-af', tone, '-c:a', 'pcm_s16le', str(toned)])
    measured = loudness(toned)
    normalization = 'loudnorm=I=-23:TP=-3:LRA=8:linear=true:' + ':'.join([
        f'measured_I={measured["input_i"]}', f'measured_TP={measured["input_tp"]}',
        f'measured_LRA={measured["input_lra"]}', f'measured_thresh={measured["input_thresh"]}',
        f'offset={measured["target_offset"]}'])
    normalized = temporary / f'{name}-normalized.wav'
    command(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(toned),
        '-af', normalization, '-ar', str(SAMPLE_RATE), '-c:a', 'pcm_s16le', str(normalized)])
    loop = temporary / f'{name}-loop.wav'
    with wave.open(str(normalized), 'rb') as source_wav:
        source_wav.setpos(loop_frames)
        pcm = source_wav.readframes(loop_frames)
    # Sampled instrument/reverb phases need not repeat bit-for-bit. A 128-sample
    # (2.9 ms) cosine edge correction removes the residual discontinuity while
    # retaining the exact bar count. This is not a musical fade-out or end gap.
    pcm_array = np.frombuffer(pcm, dtype='<i2').reshape(-1, 2).astype(np.float32)
    edge = np.sin(np.linspace(0, np.pi / 2, 128)) ** 2
    pcm_array[:128] *= edge[:, None]
    pcm_array[-128:] *= edge[::-1, None]
    pcm = np.rint(pcm_array).astype('<i2').tobytes()
    with wave.open(str(loop), 'wb') as target_wav:
        target_wav.setnchannels(2)
        target_wav.setsampwidth(2)
        target_wav.setframerate(SAMPLE_RATE)
        target_wav.writeframes(pcm)
    output = OUTPUT / f'{name}.mp3'
    command(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(loop),
        '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', str(SAMPLE_RATE), '-write_xing', '1',
        '-metadata', f'title={cfg["title"]}', '-metadata', 'album=Переписка — Первый день',
        '-metadata', 'comment=Original score; FluidR3Mono_GM MIT samples; see LICENSE.txt', str(output)])
    final = loudness(output)
    decoded = np.frombuffer(pcm, dtype='<i2').reshape(-1, 2).astype(np.float32) / 32768
    return {
        'file': f'./assets/audio/music/{name}.mp3', 'title': cfg['title'],
        'bpm': cfg['bpm'], 'bars': cfg['bars'], 'sampleRate': SAMPLE_RATE,
        'loopFrames': loop_frames, 'edgeCorrectionFrames': 128,
        'loopStart': 0, 'loopEnd': loop_frames / SAMPLE_RATE,
        'sceneCrossfadeSeconds': .8, 'loopCrossfadeSeconds': 0,
        'notes': len(notes), 'seed': cfg['seed'],
        'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'integratedLufs': float(final['input_i']), 'truePeakDbtp': float(final['input_tp']),
        'loudnessRangeLu': float(final['input_lra']),
        'seamStepDbfs': round(20 * math.log10(max(1e-8, float(np.max(np.abs(decoded[0] - decoded[-1]))))), 2),
        'firstHalfSecondRmsDbfs': round(20 * math.log10(max(1e-8, float(np.sqrt(np.mean(decoded[:22050] ** 2))))), 2),
        'lastHalfSecondRmsDbfs': round(20 * math.log10(max(1e-8, float(np.sqrt(np.mean(decoded[-22050:] ** 2))))), 2),
        'fluidSynthVersion': synth_version,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--soundfont', type=Path, default=DEFAULT_SF)
    parser.add_argument('--track', choices=list(TRACKS), action='append')
    parser.add_argument('--work-dir', type=Path)
    args = parser.parse_args()
    if not args.soundfont.is_file():
        parser.error('Supply --soundfont pointing to FluidR3Mono_GM.sf3 (MIT), see docs/MUSIC.md')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    context = tempfile.TemporaryDirectory(prefix='perepiska-music-') if not args.work_dir else None
    work = args.work_dir or Path(context.name)
    work.mkdir(parents=True, exist_ok=True)
    report = []
    try:
        for name in args.track or TRACKS:
            result = produce(name, args.soundfont, work)
            report.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        manifest = {'version': 1, 'sampleLicense': 'MIT',
            'sampleLicenseFile': './assets/audio/music/LICENSE.txt',
            'soundfontSha256': hashlib.sha256(args.soundfont.read_bytes()).hexdigest(),
            'tracks': report}
        # Partial rebuilds preserve metadata for tracks that were not rendered.
        manifest_path = OUTPUT / 'manifest.json'
        if args.track and manifest_path.exists():
            previous = json.loads(manifest_path.read_text())
            tracks = {Path(item['file']).stem: item for item in previous['tracks']}
            tracks.update({Path(item['file']).stem: item for item in report})
            manifest['tracks'] = [tracks[name] for name in TRACKS if name in tracks]
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(manifest, ensure_ascii=False), flush=True)
    finally:
        if context:
            context.cleanup()


if __name__ == '__main__':
    main()
