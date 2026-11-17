# Recorded Russian voices for the pilot

The pilot ships one recorded MP3 for each of the 92 authored entries in `src/life/speech-catalog.js`, covering ten characters. Speech ids and saved stories are unchanged. The browser plays ordinary audio files; it does not load a speech model, send dialogue to a generation service, or require an API key.

## Voices and their origin

The current performances use **Qwen3-TTS**. All character references were created from written descriptions with `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`. The pinned `Qwen/Qwen3-TTS-12Hz-1.7B-Base` model conditions the other lines on those fixed synthetic references. The actual model id and revision for every line are recorded in the manifest, including the original VoiceDesign performances that are reused directly. The 0.6B model was evaluated during preparation but is not used in this release.

The Anya, Vera and Max reference performances were approved by the project owner on 17 November 2026. The other seven characters use separately designed voices. No external human voice sample or catalogue recording was used as a reference.

| Character | Voice direction |
| --- | --- |
| Анна | Young adult woman; warmth, slight nervousness and a sincere conversational tone |
| Вера | Mature woman; calm confidence and personal, reassuring support |
| Макс | Young adult man; warm mid-range voice, quiet interest and an unforced smile |
| Кира | Adult female friend; lively, bright and supportive without childish delivery |
| Николай | Mature male neighbour; rounded lower-middle register and relaxed dry humour |
| Денис | Open, casual male neighbour; clear middle register |
| Илья | Grounded male voice; measured explanations and understated amusement |
| Антон | Lighter, drier male register; precise speech and practical humour |
| Дима | Sociable male guest; flowing, friendly conversational delivery |
| Рассказчица | Warm adult female storyteller; clear short thoughts and meaningful pauses |

The stable voice identities, exact descriptions, reference texts, seeds and WAV hashes are in `scripts/voice-cast.json`. Reference WAVs are kept in `scripts/voice-references/`. Both locations are source-only and excluded from the browser build. Conditioning on a fixed reference supports a consistent character voice; it does not guarantee identical inflection or completely accent-free Russian on every line. The approved prototype's mild foreign-sounding inflections remain an accepted working limitation.

## Model provenance and licensing

- Official model family and code: https://github.com/QwenLM/Qwen3-TTS
- Voice design model: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
- Qwen model id, pinned revision, main weight SHA-256 and byte size: `RECORDING_META.models` in `assets/audio/voices/manifest.js`, also present in `manifest.json`.
- Model/code licence: **Apache-2.0**. The official licence text is preserved in `assets/audio/voices/LICENSE-QWEN3-TTS.txt`, sourced from https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE .
- Offline build tools: Python 3.12, `qwen-tts 0.1.1`, `torch 2.11.0+cpu`, `torchaudio 2.11.0+cpu`, `transformers 4.57.3`, and FFmpeg. Runtime versions are recorded in the render metadata. No model weights or Python runtime are shipped with the game.

The manifest's `license` field describes the synthesis model licence. It does not relicense the game, its story or source code, and does not imply a licence from or endorsement by a real speaker. Synthetic voice references are original assets created for this game's fictional cast. The old Silero notice and `scripts/render-voices.py` document the previous prototype pipeline; they are not the provenance of the current Qwen recordings.

## Exact text and stable references

`scripts/voice-qwen.json` is the checked synthesis inventory. Each id records the exact `sourceText` from `getSpeech(id).text`, the actual `synthesisText`, reference identity and hash, and a generation seed. `300` is spoken as `триста` and `12` as `двенадцать`; other words are preserved. The renderer does not use the UI's `displayText` as a substitute for the separately authored spoken line. Silero's `+` stress notation is not passed to Qwen.

Each manifest entry retains the existing `url`, `speakerId`, `voice`, `duration`, `provider`, `license`, `sha256` and `bytes` fields. Version 2 adds `model`, `modelRevision`, `referenceId`, `referenceSha256`, `textSha256` and `renderInputSha256`. The line-level input hash covers that line's actual synthesis text. The metadata-level `renderInputSha256` covers the exact bytes of the input file named by `renderInputPath`. Updating dialogue, references or generation settings invalidates the corresponding renderer checkpoint.

The input also fixes small batches of up to four similarly sized lines by one speaker. Each batch records its ordered ids, texts and seed, because changing the batch can change sampled speech even with the same line text. After an interrupted run, unfinished lines may receive a new batch plan; completed line inputs and all historical batch definitions stay intact. A historical batch can therefore contain a line whose current `batchId` points elsewhere. The renderer uses the batch context belonging to each line's recipe and keys temporary audio by both batch id and speech id. Reference reuse is explicit: `referenceSpeechId` identifies the source line and `reuseReferenceForSpeech: false` disables direct reuse when the reference is suitable for its timbre but the exact spoken line needs a fresh take.

## Reproduce or update

Install build tools in an isolated environment outside the repository. CPU BF16 inference was used for this release; it requires a suitable CPU and sufficient RAM. Existing reference files make it unnecessary to redesign the cast for ordinary dialogue updates.

```bash
python3 -m venv /tmp/perepiska-qwen
/tmp/perepiska-qwen/bin/python -m pip install torch==2.11.0+cpu torchaudio==2.11.0+cpu --index-url https://download.pytorch.org/whl/cpu
/tmp/perepiska-qwen/bin/python -m pip install qwen-tts==0.1.1 transformers==4.57.3
```

The small pinned model manifests are preserved in `scripts/voice-models/`; the weights themselves stay outside the source repository. For a fresh cache, download the exact public revisions and place the renderer's provenance files beside them:

```bash
/tmp/perepiska-qwen/bin/python - <<'PY'
from pathlib import Path
import json, shutil
from huggingface_hub import snapshot_download

source = Path('scripts/voice-models')
cache = Path.home() / '.cache' / 'perepiska-qwen'
base = json.loads((source / 'qwen-base-1.7b.json').read_text())
design = json.loads((source / 'qwen-voice-design.json').read_text())
snapshot_download(base['id'], revision=base['revision'], local_dir=cache / 'base', token=False)
snapshot_download(design['id'], revision=design['sha'], local_dir=cache / 'voice-design' / 'model', token=False)
shutil.copyfile(source / 'qwen-base-1.7b.json', cache / 'base' / 'provenance.json')
shutil.copyfile(source / 'qwen-voice-design.json', cache / 'voice-design' / 'model-provenance.json')
PY
```

`--model` points to the Base directory including `provenance.json`. `--voice-design-model` points to the directory containing `model-provenance.json` and `model/model.safetensors`. The renderer checks the Base weight hash against its pinned provenance before loading it and runs with Hugging Face/Transformers offline mode enabled. The model manifests also retain the publisher's hashes for the speech-tokenizer weights.

For the first run, create a working copy of the inputs, cast and renderer. The recovery helpers expect those three files directly inside `--work-dir`; do not overwrite this working copy when resuming it. Export the current catalogue from the repository root, then render into a staging directory:

```bash
mkdir -p /tmp/perepiska-voice-checkpoints
cp scripts/voice-qwen.json scripts/voice-cast.json scripts/render-voices-qwen.py /tmp/perepiska-voice-checkpoints/
node --input-type=module -e "import {SPEECH_LINES} from './src/life/speech-catalog.js'; process.stdout.write(JSON.stringify(SPEECH_LINES));" > /tmp/perepiska-speech-catalog.json
/tmp/perepiska-qwen/bin/python scripts/render-voices-qwen.py \
  --model "$HOME/.cache/perepiska-qwen/base" \
  --voice-design-model "$HOME/.cache/perepiska-qwen/voice-design" \
  --catalog /tmp/perepiska-speech-catalog.json \
  --inputs /tmp/perepiska-voice-checkpoints/voice-qwen.json \
  --cast /tmp/perepiska-voice-checkpoints/voice-cast.json \
  --references scripts/voice-references \
  --output /tmp/perepiska-voices-staging \
  --work-dir /tmp/perepiska-voice-checkpoints \
  --threads 6
```

`--ids <id> <id>` limits the files written to selected lines; generating one selected line can still evaluate its fixed batch to preserve the original sampling conditions. `--force` reruns the same recipe, including its seed. To request a genuinely new take, wait for the renderer to exit, then archive the prior attempt and assign an explicit new single-line seed:

```bash
/tmp/perepiska-qwen/bin/python scripts/prepare-retake.py \
  --inputs /tmp/perepiska-voice-checkpoints/voice-qwen.json \
  --work-dir /tmp/perepiska-voice-checkpoints \
  --output /tmp/perepiska-voices-staging \
  --ids chat.team.opening
```

Then rerun the renderer with the same arguments, adding `--ids chat.team.opening`. The helper preserves the authored words and other lines' batch recipes. A directly reused reference performance must first have `reuseReferenceForSpeech` disabled in its cast profile if it should instead receive a new Base take.

Otherwise, completed matching files are reused after their hashes are verified. Per-line checkpoints retain the original WAV, actual model, recipe, hashes, timing and memory measurements. Byte-identical regeneration also depends on the library versions, CPU kernels and fixed batch ordering. A completed run creates both runtime manifests and `ready.marker.json`; partial runs can also write manifests, so require all 92 entries and a matching completion marker before copying. After review, copy the final working inputs and cast back to `scripts/`, replace the runtime MP3s and both manifests together, then run `npm test` and `npm run build`.

### Pause, resume and recover batches

The renderer holds an OS lock on `render.lock` and updates `heartbeat.json` about every five seconds. The lock file may remain after exit; lock ownership, rather than the file's existence, indicates an active renderer. Only one renderer or input-changing helper may use the working directory at a time. `prepare-retake.py` does not acquire the lock itself, so run it only after the renderer has exited.

To request a pause, create `/tmp/perepiska-voice-checkpoints/stop-after-batch.request`. The renderer finishes and commits the current batch before stopping at the next checkpoint boundary. Wait for process exit; a heartbeat or log message alone is not a completion marker. Remove the request file before resuming with the same rendering command. A hard interruption can lose the unfinished batch, but completed matching WAV/MP3 checkpoints are reused.

If recovery would otherwise rerender many already completed batch peers, optionally regroup only the unfinished Base lines while the renderer is stopped:

```bash
/tmp/perepiska-qwen/bin/python scripts/regroup-unfinished.py \
  --work-dir /tmp/perepiska-voice-checkpoints
```

This helper acquires `render.lock`, archives the previous input in `input-history/`, records the change under `replans`, assigns explicit new seeds and batches to unfinished lines, and invalidates the completion marker. Completed line inputs and historical batches are preserved. Directly reused VoiceDesign references are excluded from regrouping. The helper uses completed record status to select lines; resume still verifies their hashes and fingerprints. Regrouping changes the recipe for pending lines, so it is a recovery choice rather than a requirement for an ordinary resume.

### Reuse a verified preflight take

`scripts/adopt-control.py` accepts `--work-dir`, `--output`, `--control`, `--source-script` and optional `--model`. Use `--model` with the pinned Base cache from the example above; its default is `models/1.7B` inside the working directory. `--control` names a preflight JSON sidecar with the same-named WAV beside it. Its original batch peers' JSON/WAV evidence must be in the same directory; `--source-script` names the script that actually generated that take. This helper requires an existing output manifest and acquires the renderer lock, so use it after the main run.

Adoption checks the authored words, reference identity, WAV hashes, model and documented generation settings. It archives the prior take, preserves the original control evidence and source script under `adopted-controls/`, records the real seed/batch recipe, and re-encodes the selected WAV using the release settings. Older preflight sidecars did not record a model revision or weight hash; those omissions remain explicit in `adoption-validation.json`. The pinned local model is checked during adoption, without retroactively claiming that the old sidecar contained that evidence.

After adoption, rerun the full renderer command with a bare `--ids` flag (no following ids). This selects no new synthesis and refreshes manifests from matching completed checkpoints. Require 92 validated entries again before copying the final working inputs and output into the game. An unmatched checkpoint remains incomplete and needs an explicit selected render.

The legacy Silero renderer is deliberately not the default instruction here: using it would restore version-1 provenance, which the current asset checks reject.

## Encoding and browser playback

Files are mono MP3 at **24 kHz / 128 kbit/s**, normalised toward **−19 LUFS** with a **−2 dB true-peak target** before MP3 encoding. Only edge silence is trimmed; internal pauses remain. Short fades and silent margins avoid abrupt edges. No post-processing changes pitch or speech tempo. Encoding targets do not replace decoded-file measurements: MP3 reconstruction can differ slightly from the pre-encoding peak.

An individual input line may set `encodingOverrides.leadingSilenceKeepMs` (0–250 ms) to preserve a short lead-in when trimming would cut a quiet initial consonant. `pilot.ending` keeps 80 ms for this reason. The renderer and control-adoption helper apply the same override; it is included in the checkpoint recipe and runtime manifest entry.

To correct trimming without synthesising a new take, stop the renderer and re-encode the verified original WAV:

```bash
/tmp/perepiska-qwen/bin/python scripts/reencode-voice.py \
  --work-dir /tmp/perepiska-voice-checkpoints \
  --output /tmp/perepiska-voices-staging \
  --id pilot.ending \
  --leading-silence-ms 80
```

The helper acquires `render.lock`, verifies the existing WAV/MP3 hashes and text, archives the previous inputs, record and MP3 under `encoding-revisions/`, and records the override in the working input file. The original WAV, words, model, reference and synthesis seed remain unchanged; the MP3 hash, duration and recipe fingerprint are updated. It invalidates `ready.marker.json`, so refresh both manifests by rerunning the full renderer command with a bare `--ids` flag, then require 92 matching entries and copy the final inputs and output together as described above.

The browser preloads only the current line and its immediate successor. Music is ducked during speech and restored when the queue ends or is cancelled. Closing or replacing a dialogue, muting, pausing and hiding the tab cancel the current voice; old callbacks cannot revive it. Playback timeouts use the measured recording duration, allowing expressive pauses rather than relying only on text length.

At playback the audio director appends `?v=<first 16 characters of the file SHA-256>` to each valid recording URL. This prevents an older active service worker from serving a cached Silero clip after an update, while manifest URLs remain ordinary file paths. Missing or failed recordings retain the existing Russian system-voice fallback; subtitles remain available when audio cannot play.

## Verification limits

Automated asset checks require all 92 exact ids and no orphan MP3s; actual MPEG frames, measured durations, format, file sizes and SHA-256 hashes are checked independently of the manifest. They also validate the exact source/synthesis text, ten stable voice identities, reference WAV hashes, model revisions, and licence metadata. Runtime tests cover interruption, replay, fallback, music ducking, lazy loading and content-specific cache URLs.

Local speech recognition and signal analysis are used to flag omitted or changed words, clipped samples and suspicious silence. Recognition can join homophones such as `со всем` into `совсем`; such flags require review instead of automatic text rewriting. These checks do not establish acting quality or guarantee accent-free delivery. The owner's approval applies to the three audition voices; the complete pilot still benefits from listening during playtesting.
