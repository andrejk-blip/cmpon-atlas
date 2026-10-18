#!/usr/bin/env python3
"""Build the small, licensed Citadel 1.9.1 combat recording pack.

Requires ffmpeg, numpy and scipy. Source archives/voice originals stay outside
the repository. Run with --source pointing to the extracted source directory.
Selections, edits, provenance, output levels and hashes are recorded in the pack.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt

VERSION = '1.9.1'
RATE = 44100
SOURCES = {
    'firearm': {
        'title': 'The Free Firearm Sound Library',
        'authors': 'Ben Jaszczak; Brian Nelson; Kevin Heras; Matthew Nanney',
        'url': 'https://opengameart.org/content/the-free-firearm-sound-library',
        'license': 'CC0-1.0',
        'archive_sha256': 'cc1ab5a99a0a365105c7c5dd783f4b0b1fe90938114d3ceec53856bfe005f7d6',
    },
    'scifi': {'title': 'Sci-Fi Sounds 1.0', 'authors': 'Kenney', 'url': 'https://kenney.nl/assets/sci-fi-sounds', 'license': 'CC0-1.0', 'archive_sha256': '119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04'},
    'impact': {'title': 'Impact Sounds 1.0', 'authors': 'Kenney', 'url': 'https://kenney.nl/assets/impact-sounds', 'license': 'CC0-1.0', 'archive_sha256': '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'},
    'rpg': {'title': 'RPG Audio 1.0', 'authors': 'Kenney', 'url': 'https://kenney.nl/assets/rpg-audio', 'license': 'CC0-1.0', 'archive_sha256': '6dbeaf8544da958d8f2adcb4a4b76c1ade34a05f8ab9edccd327da7375f38b'},
    'human': {'title': 'Hurt / Death sound effect for character', 'authors': 'Badre-Eddine', 'url': 'https://opengameart.org/content/hurt-death-sound-effect-for-character', 'license': 'CC0-1.0', 'archive_sha256': 'dcee665f2aa48eabc06ab8e93d8345744231ba631d6eb5bff0f2649b3c444e9b'},
    'soldier-lines': {'title': 'Original Russian soldier lines for Citadel CSII', 'authors': 'Citadel CSII project; prepared with Runway / Eleven v3 preset voices', 'license': 'Generated project asset; service terms apply', 'model': 'eleven_v3', 'language': 'ru', 'speed': 1.08},
}


def decode(file):
    return np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(file), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-']), dtype='<f4').copy()


def trim_signal(x, human=False):
    # Keep the full consonant/transient and a short natural release, not padding.
    step = 220
    blocks = np.array([np.max(np.abs(x[i:i + step])) for i in range(0, len(x), step)])
    threshold = max(.001, float(blocks.max()) * (.009 if human else .006))
    nonzero = np.flatnonzero(blocks > threshold)
    if not len(nonzero):
        raise ValueError('Source has no usable signal')
    start = max(0, int(nonzero[0] * step - .018 * RATE))
    end = min(len(x), int((nonzero[-1] + 1) * step + .035 * RATE))
    return x[start:end], start / RATE, end / RATE


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / 'assets')
    args = parser.parse_args()
    output = args.output / f'combat-audio-v{VERSION}'
    output.mkdir(parents=True, exist_ok=True)
    clips = []
    serials = {}

    def add(kind, source, relative, crop=None, gain=1, caption=None, voice=None, task=None, spoken=None):
        serials[kind] = serials.get(kind, 0) + 1
        clip_id = f'{kind}-{serials[kind]:02d}'
        file = args.source / relative
        raw = file.read_bytes()
        x = decode(file)
        start, end = crop if crop else (0, len(x) / RATE)
        x = x[int(start * RATE):int(end * RATE)]
        human = kind.startswith('soldier-')
        x, trim_start, trim_end = trim_signal(x, human)
        # Gentle helmet colour on people; leave the captain's separate pack alone.
        lo, hi = (135, 6500) if human else (65, 11500) if kind.startswith('shot-') else (38, 10500)
        x = sosfilt(butter(2, [lo, hi], btype='bandpass', fs=RATE, output='sos'), x)
        x -= np.mean(x)
        if source == 'firearm':
            # Recorded muzzle transients have a much higher crest factor than
            # the energy weapons. A soft compressor keeps the body audible at
            # the same game volume without a clipped sample or a louder peak.
            x = np.tanh(x * min(6, .25 / max(float(np.sqrt(np.mean(x ** 2))), 1e-8)))
        fade_in = min(len(x) // 4, int(RATE * (.004 if human else .0012)))
        fade_out = min(len(x) // 4, int(RATE * .022))
        if fade_in: x[:fade_in] *= np.linspace(0, 1, fade_in)
        if fade_out: x[-fade_out:] *= np.linspace(1, 0, fade_out)
        rms = float(np.sqrt(np.mean(x ** 2)))
        peak = float(np.max(np.abs(x)))
        x *= min((.13 if human else .145) / max(rms, 1e-8), .60 / max(peak, 1e-8))
        dest = output / (clip_id + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '1', str(dest)], input=x.astype('<f4').tobytes(), check=True)
        decoded = decode(dest)
        actual_peak = float(np.max(np.abs(decoded)))
        if actual_peak > .79:
            raise ValueError(f'{clip_id}: unexpected MP3 overshoot {actual_peak}')
        encoded = dest.read_bytes()
        item = {'id': clip_id, 'kind': kind, 'file': dest.name, 'gain': gain, 'rate': 1,
                'duration': round(len(decoded) / RATE, 4), 'bytes': len(encoded),
                'sha256': hashlib.sha256(encoded).hexdigest(), 'source': source,
                'source_file': relative, 'source_sha256': hashlib.sha256(raw).hexdigest(),
                'edit': {'start': round(start + trim_start, 4), 'end': round(start + trim_end, 4), 'mono_hz': RATE, 'band_hz': [lo, hi]},
                'peak': round(actual_peak, 5), 'rms': round(float(np.sqrt(np.mean(decoded ** 2))), 5)}
        if caption: item['caption'] = caption
        if voice: item['voice'] = voice
        if task: item['generation_task'] = task
        if spoken: item['spokenText'] = spoken
        clips.append(item)

    firearm = 'firearm-prepared/Prepared SFX Library/'
    for onset in [.323, 2.239, 5.247]:
        add('shot-ground', 'firearm', firearm + 'Carl Gustav M45/G_20P.wav', (onset, onset + .43))
    for onset in [.594, 3.243, 6.006]:
        add('shot-deck', 'firearm', firearm + 'AK-47/C_28P.wav', (onset, onset + .47))
    for onset in [.560, 3.910]:
        add('shot-mrg', 'firearm', firearm + 'AR-15/D_24P.wav', (onset, onset + .44))
    add('shot-mrg', 'firearm', firearm + '1911/A_34P.wav', (1.520, 2.040))
    for i in range(3):
        add('shot-space', 'scifi', f'kenney-sci-fi/Audio/laserSmall_{i:03d}.ogg')
        add('shot-convoy', 'scifi', f'kenney-sci-fi/Audio/laserLarge_{i:03d}.ogg')
    for i in range(2):
        add('missile', 'scifi', f'kenney-sci-fi/Audio/thrusterFire_{i:03d}.ogg', (0, .66), gain=.92)
        add('destroy', 'scifi', f'kenney-sci-fi/Audio/explosionCrunch_{i:03d}.ogg', gain=.93)
        add('detonate', 'scifi', f'kenney-sci-fi/Audio/explosionCrunch_{i + 2:03d}.ogg', gain=1)
        add('robot-hit', 'scifi', f'kenney-sci-fi/Audio/impactMetal_{i + 2:03d}.ogg', gain=.86)
        add('robot-death', 'scifi', f'kenney-sci-fi/Audio/lowFrequency_explosion_{i:03d}.ogg', crop=(0, 1.25), gain=.88)
    add('crash', 'scifi', 'kenney-sci-fi/Audio/explosionCrunch_004.ogg', gain=1)
    for i in range(3):
        add('armor-hit', 'impact', f'kenney-impact/Audio/impactMetal_medium_{i:03d}.ogg', gain=.88)
    add('player-damage', 'impact', 'kenney-impact/Audio/impactPlate_heavy_002.ogg', gain=.9)
    for n, crop in [(4, (.27, .79)), (12, (.44, 1.01)), (16, (.49, 1.27))]:
        add('soldier-hit', 'human', f'human-reactions/{n}.mp3', crop=crop, gain=.88)
    for n in [5, 11, 13]:
        add('soldier-death', 'human', f'human-reactions/{n}.mp3', gain=.95)
    for filename in ['knifeSlice.ogg', 'knifeSlice2.ogg']:
        add('knife-swing', 'rpg', 'kenney-rpg/Audio/' + filename, gain=.95)
    lines = [
        ('Нет! Мои правки… дойдут!', 'Clint', '9368aaab-877c-433a-bac8-ebcefe598019', '[shouting] Нет! Мои правки... дойдут!'),
        ('ФТ… не согласую!', 'Elliot', '77840b58-c825-4247-ba77-cb08b155fc62', '[shouting] Эф тэ... не согласую!'),
        ('ФЗ, прикрой!', 'Mark', 'c2899175-9256-4b09-990d-35eb80f25199', '[shouting] Эф зэ, прикрой!'),
        ('Без визы… не пройдёшь!', 'Kirk', 'ea54a089-5a06-4196-af41-a81dc62cd586', '[sighs] Без визы... не пройдёшь!'),
    ]
    for i, (caption, voice, task, spoken) in enumerate(lines, 1):
        add('soldier-death-voice', 'soldier-lines', f'soldier-line-{i:02d}.mp3', gain=.93, caption=caption, voice=voice, task=task, spoken=spoken)
    pack = {'version': VERSION, 'baseUrl': f'./assets/combat-audio-v{VERSION}/', 'clips': clips}
    manifest = {**pack, 'sources': SOURCES, 'licensing_note': 'CC0 applies to the listed source effect libraries, not to the separately generated project dialogue.', 'processing': 'One event per clip; silence trimmed; gentle bandpass; soft firearm transient compression; fades; level matched; 44.1 kHz mono MP3 at 96 kbps.', 'validation': {'clips': len(clips), 'bytes': sum(x['bytes'] for x in clips), 'maximum_decoded_peak': max(x['peak'] for x in clips), 'codec': 'mp3', 'human_listening_review': 'not performed by automated checks'}}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    credits = ['Citadel CSII — combat recordings ' + VERSION, '', 'Prepared effects:']
    for key, source in SOURCES.items():
        credits += ['', source['title'], source['authors'], 'License: ' + source['license']]
        if source.get('url'): credits.append(source['url'])
    credits += ['', 'Edits: isolated event cuts, silence trims, mono conversion, gentle EQ, fades and level matching.', 'The per-file manifest retains source filenames, SHA-256 hashes and crop positions.', 'Original generated dialogue is a separate project asset; it is not claimed as CC0.', 'CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/']
    (output / 'credits.txt').write_text('\n'.join(credits) + '\n')
    js = '/* Citadel CSII: prepared combat recordings. See combat-audio-v1.9.1/credits.txt. */\n(function(){\n\'use strict\';\nglobalThis.CITADEL_SFX_PACK = ' + json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + ';\n})();\n'
    (args.output / f'citadel-sfx-pack-v{VERSION}.js').write_text(js)
    print(json.dumps(manifest['validation'], ensure_ascii=False))


if __name__ == '__main__':
    main()
