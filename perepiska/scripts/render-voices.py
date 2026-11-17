#!/usr/bin/env python3
"""Render the authored speech catalog with a pinned, MIT Silero CIS model.

Build-time tooling only: no Python, model weights, or network inference ships
with the game. See docs/VOICE_RECORDINGS.md for setup and license sources.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
MODEL_URL = "https://models.silero.ai/models/tts/ru/v5_cis_base.pt"
MODEL_SHA256 = "ba41b18f6a707ad93605a162998865e7c087153d2e010a26dd02229dab0e672a"
SAMPLE_RATE = 24000
PROVIDER = "silero-v5-cis-base"
PROFILES = {
    "anna": {"voice": "ru_ekaterina", "tempo": 1.025},
    "vera": {"voice": "ru_oksana", "tempo": 0.975},
    "kira": {"voice": "ru_vika", "tempo": 1.035},
    "max": {"voice": "ru_dmitriy", "tempo": 0.98},
    "resident-1": {"voice": "ru_eduard", "tempo": 0.95},
    "resident-2": {"voice": "ru_bogdan", "tempo": 1.0},
    "ilya": {"voice": "ru_roman", "tempo": 1.0},
    "anton": {"voice": "ru_igor", "tempo": 1.025},
    "dima": {"voice": "ru_marat", "tempo": 1.03},
    "narrator": {"voice": "ru_zhadyra", "tempo": 0.97},
}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_catalog() -> list[dict]:
    uri = (ROOT / "src/life/speech-catalog.js").as_uri()
    script = f"import {{SPEECH_LINES}} from {json.dumps(uri)}; console.log(JSON.stringify(SPEECH_LINES));"
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", script], text=True))


def get_model(path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".download")
        try:
            with urllib.request.urlopen(MODEL_URL, timeout=45) as response, temporary.open("wb") as target:
                shutil.copyfileobj(response, target)
            if digest(temporary) != MODEL_SHA256:
                raise RuntimeError("Downloaded model checksum changed; review its provenance before updating the pin.")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    if digest(path) != MODEL_SHA256:
        raise RuntimeError(f"Model checksum mismatch: {path}")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "perepiska-voices/v5_cis_base.pt")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/audio/voices")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--ids", nargs="*", help="Regenerate only these ids, preserving other existing recordings.")
    args = parser.parse_args()
    for executable in ("node", "ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            raise SystemExit(f"Required executable is missing: {executable}")

    catalog = read_catalog()
    stress = json.loads((ROOT / "scripts/voice-stress.json").read_text())["lines"]
    if set(stress) != {line["id"] for line in catalog}:
        raise SystemExit("Stress inventory does not match the speech catalog. Update it before rendering.")
    for line in catalog:
        authored = stress[line["id"]]
        if authored["source"] != line["text"]:
            raise SystemExit(f"Stale stress text: {line['id']}")
        if not re.fullmatch(r"[a-zA-Z0-9._-]+", line["id"]):
            raise SystemExit(f"Unsafe speech id: {line['id']}")
        if line["speakerId"] not in PROFILES:
            raise SystemExit(f"Missing voice profile: {line['speakerId']}")
    selected = set(args.ids) if args.ids is not None else {line["id"] for line in catalog}
    if selected - {line["id"] for line in catalog}:
        raise SystemExit("Unknown speech id in --ids")

    import numpy as np
    import torch

    torch.set_num_threads(args.threads)
    model = torch.package.PackageImporter(str(get_model(args.model))).load_pickle("tts_models", "model")
    model.to(torch.device("cpu"))
    for profile in PROFILES.values():
        if profile["voice"] not in model.speakers:
            raise SystemExit(f"Pinned model has no voice {profile['voice']}")

    args.output.mkdir(parents=True, exist_ok=True)
    existing = args.output / "manifest.json"
    recordings = json.loads(existing.read_text())["lines"] if args.ids is not None and existing.exists() else {}
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="perepiska-voices-") as temporary:
        wav_path = Path(temporary) / "raw.wav"
        for index, line in enumerate(catalog, 1):
            if line["id"] not in selected:
                continue
            profile = PROFILES[line["speakerId"]]
            torch.manual_seed(int(hashlib.sha256(line["id"].encode()).hexdigest()[:8], 16))
            with torch.inference_mode():
                samples = model.apply_tts(
                    text=stress[line["id"]]["text"], speaker=profile["voice"],
                    sample_rate=SAMPLE_RATE, put_accent=False,
                    put_stress_homo=False, put_yo=False, put_yo_homo=False,
                ).detach().cpu().numpy()
            if not np.all(np.isfinite(samples)) or np.max(np.abs(samples)) < 0.002:
                raise RuntimeError(f"Invalid waveform: {line['id']}")
            # Peak guard for the intermediate PCM; final audio is loudness-normalized.
            peak = float(np.max(np.abs(samples)))
            if peak > 0.98:
                samples *= 0.98 / peak
            with wave.open(str(wav_path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(SAMPLE_RATE)
                wav.writeframes((samples * 32767).astype("<i2").tobytes())

            output = args.output / f"{line['id']}.mp3"
            # Reverse/start-trim/reverse trims only the edges, preserving sentence pauses.
            trim = "silenceremove=start_periods=1:start_duration=0.015:start_threshold=-50dB"
            filters = f"{trim},areverse,{trim},areverse,atempo={profile['tempo']},afade=t=in:d=0.008,areverse,afade=t=in:d=0.012,areverse,adelay=35,apad=pad_dur=0.08,loudnorm=I=-19:TP=-2:LRA=7,aresample={SAMPLE_RATE}"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path), "-af", filters, "-ac", "1", "-ar", str(SAMPLE_RATE), "-codec:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", str(output)], check=True)
            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(output)], text=True))
            duration = round(float(probe["format"]["duration"]), 3)
            if duration < 0.25 or output.stat().st_size < 1000:
                raise RuntimeError(f"Empty encoded recording: {line['id']}")
            recordings[line["id"]] = {
                "url": f"assets/audio/voices/{output.name}",
                "speakerId": line["speakerId"], "voice": profile["voice"],
                "duration": duration, "provider": PROVIDER, "license": "MIT",
                "sha256": digest(output), "bytes": output.stat().st_size,
            }
            print(f"{index:02d}/{len(catalog)} {line['id']} {duration:.3f}s", flush=True)

    metadata = {
        "version": 1, "provider": PROVIDER, "license": "MIT",
        "model": {"url": MODEL_URL, "sha256": MODEL_SHA256, "bytes": args.model.stat().st_size},
        "licenseUrl": "https://github.com/snakers4/silero-models/blob/master/LICENSE_CIS",
        "licenseScopeUrl": "https://github.com/snakers4/silero-models#v5-cis-base-models",
        "runtime": f"torch {torch.__version__}", "sampleRate": SAMPLE_RATE,
        "channels": 1, "bitrate": 64000, "targetLufs": -19, "truePeakLimitDb": -2,
        "profiles": PROFILES,
        "catalogSha256": hashlib.sha256(json.dumps(catalog, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
        "stressSha256": digest(ROOT / "scripts/voice-stress.json"),
    }
    recordings = {line["id"]: recordings[line["id"]] for line in catalog if line["id"] in recordings}
    (args.output / "manifest.json").write_text(json.dumps({**metadata, "lines": recordings}, ensure_ascii=False, indent=2) + "\n")
    (args.output / "manifest.js").write_text(
        "// Generated by scripts/render-voices.py. Do not edit by hand.\n"
        + "export const RECORDINGS = Object.freeze(" + json.dumps(recordings, ensure_ascii=False, indent=2) + ");\n"
        + "export const RECORDING_META = Object.freeze(" + json.dumps(metadata, ensure_ascii=False, indent=2) + ");\n"
    )
    print(f"Rendered {len(selected)} lines in {time.monotonic() - started:.1f}s; manifest contains {len(recordings)}.")


if __name__ == "__main__":
    main()
