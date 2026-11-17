# Recorded Russian voices for the pilot

The pilot has a build-time Russian voice recording for every authored entry in `src/life/speech-catalog.js`. The browser receives ordinary MP3 files; it does not download model weights or run neural inference. These are synthetic prototype performances, with character-specific voices and modest tempo adjustments, not actor recordings.

## Source and license

- Model: **Silero `v5_cis_base`**, downloaded from the publisher: https://models.silero.ai/models/tts/ru/v5_cis_base.pt
- Model bytes: `91680514`.
- SHA-256: `ba41b18f6a707ad93605a162998865e7c087153d2e010a26dd02229dab0e672a`.
- The publisher explicitly assigns **MIT** to the CIS **base** models: https://github.com/snakers4/silero-models#v5-cis-base-models . This is a specific exception to the repository's general noncommercial model license. Other Silero Russian models and CIS **ext** models were not used.
- Full model license: `assets/audio/voices/LICENSE-SILERO-CIS.txt`, copied from https://github.com/snakers4/silero-models/blob/master/LICENSE_CIS . Copyright (c) 2025-present Silero Team.
- Offline synthesis runtime: `torch 2.15.0+cpu`, installed from the official CPU wheel index, https://download.pytorch.org/whl/cpu . PyTorch's BSD-style terms and component notices are preserved in `assets/audio/voices/LICENSE-PYTORCH.txt` from https://github.com/pytorch/pytorch/blob/main/LICENSE . Runtime and weights are build tools and are not included in the game.
- Inference follows the publisher's package loader and examples: https://github.com/snakers4/silero-models/blob/master/src/silero/silero.py and https://github.com/snakers4/silero-models/blob/master/examples_tts_cis.ipynb . The model's actual `speakers` inventory is checked before rendering, rather than assuming every documented name has a Russian variant.

MIT permits commercial use and redistribution subject to its notice requirement. The included notice records the actual model used; it does not claim ownership of a human voice or imply endorsement by the original speakers. No cloned player voice, paid API, account, or undocumented service endpoint is used.

## Character casting

| Game character | Model speaker | Tempo multiplier |
| --- | --- | ---: |
| Анна | `ru_ekaterina` | 1.025 |
| Вера | `ru_oksana` | 0.975 |
| Кира | `ru_vika` | 1.035 |
| Макс | `ru_dmitriy` | 0.980 |
| Николай | `ru_eduard` | 0.950 |
| Денис | `ru_bogdan` | 1.000 |
| Илья | `ru_roman` | 1.000 |
| Антон | `ru_igor` | 1.025 |
| Дима | `ru_marat` | 1.030 |
| Рассказчица | `ru_zhadyra` | 0.970 |

These are distinct base voices, not pitch-shifted copies. Regional inflections and limited emotional delivery are expected from the multilingual model. Casting and tempo can be changed in `PROFILES` without changing saved games or dialogue ids.

## Reproduce or update

Requirements: Python 3.12, Node.js, FFmpeg/ffprobe with `libmp3lame`, and a CPU supporting AVX2. A clean generation environment can be prepared outside the repository:

```bash
python3 -m venv /tmp/perepiska-voice-tools
/tmp/perepiska-voice-tools/bin/python -m pip install 'torch==2.15.0+cpu' --index-url https://download.pytorch.org/whl/cpu
/tmp/perepiska-voice-tools/bin/python -m pip install numpy
/tmp/perepiska-voice-tools/bin/python scripts/render-voices.py
```

The script downloads the 91.7 MB model to a dedicated cache if absent and verifies the pinned checksum before loading it. Use `--model /path/to/v5_cis_base.pt` to use an existing verified copy. No GPU package or hosted generation service is required. `--threads 4` is the default. An altered publisher download fails closed until its provenance and hash are deliberately reviewed.

`voice-stress.json` contains the exact original text and manually authored Russian lexical stresses (`+` before the stressed vowel) for all 92 lines. `300` is spoken as `триста`, `12` as `двенадцать`; no other wording is removed or replaced. The renderer refuses stale source text, unknown ids, missing voices, or an incomplete stress inventory. When changing dialogue, update its stress entry first. To regenerate a selection:

```bash
/tmp/perepiska-voice-tools/bin/python scripts/render-voices.py --ids chat.team.opening date.hello
```

Full runs regenerate all entries and write both manifests. Partial runs preserve existing manifest entries. Rendering seeds are derived from stable line ids; exact byte reproducibility also depends on PyTorch/FFmpeg versions and CPU kernels.

## Output contract and processing

`assets/audio/voices/manifest.js` exports `RECORDINGS` and `RECORDING_META`; `manifest.json` contains the same metadata and a `lines` map. Each exact speech id maps to a relative `url`, `speakerId`, model `voice`, duration in seconds, provider, license, SHA-256, and byte size. Metadata pins the model, stress file, catalog, runtime, voice profiles, and encoding settings. The manifest `license` field records the synthesis model license; it does not relicense the game or its source code.

Files are mono MP3 at 24 kHz / 64 kbit/s. Only leading and trailing silence is trimmed (internal sentence pauses are retained), with 8/12 ms fades and short silent margins. Loudness targets -19 LUFS and -2 dB true peak before MP3 encoding. A per-line intermediate peak guard and post-render waveform checks protect against clipping. Files are loaded lazily by the browser; the model is never shipped.

## Verification record

- 92 original texts round-trip from the stress inventory after removing `+` and expanding the two numeric expressions.
- Every generated source text is checked against the current speech catalog before synthesis.
- Every manifest entry records the actual MP3 duration, byte size, and SHA-256.
- Acoustic measurements and total asset sizes are recorded below after the completed render. They establish signal integrity, not an independent human review of acting or pronunciation.

Completed render: **92/92 clips**, **4132240 bytes** total, **513.816 seconds** of audio, generated in **41.7 seconds** on CPU. Durations range from 0.984 to 14.88 seconds. Decoding all MP3s produced finite, non-silent waveforms with **0 clipped samples**; the highest decoded sample peak was **-1.3 dBFS**. Human auditory review remains separate from these measurements.
