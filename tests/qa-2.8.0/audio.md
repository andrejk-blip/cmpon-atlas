# Audio / music 2.8.0

29 October 2026. Files retain their public filenames and compatibility version
numbers; the changed music and voice report `build: 280r1`.

## Delivered

- Swarm selects an original 8-bit score for waves 1–2, a faster assault score
  for waves 3–4, and a final score for waves 5–6: 148 / 164 / 176 BPM. Each has
  four distinct eight-bar sections, pulse melody, triangle bass, percussion,
  fills and changing counterpoint. These are newly composed sequences, not
  sampled game music or copies of existing melodies.
- Pursuit has a dedicated breakbeat theme and a darker synthwave theme in
  chapter 3. Existing synthwave/breakbeat cues now have sparse breakdowns,
  followed by the return of the main arrangement.
- Real `grounddog270` / `robodog` enemy-fire events produce a short two-syllable
  robotic bark. It uses one cached 0.38-second PCM buffer on the existing FX
  bus, a 1.3-second cooldown and the existing cap/stop lifecycle.
- Default voice style is **Капитан + текстовое радио**. Existing recordings by
  the original captain play unchanged; expanded jokes and enemy replies are
  still selected but shown as text when no matching original recording exists.
  Text and speech counters are separate. No unrelated audio is played behind
  another line's caption. Unrecorded lesson text remains readable, not spoken
  by a surprise system voice. Existing recorded lessons continue to speak.
- The audio-panel button toggles to **Радио: все голоса**, preserving the entire
  previous prepared bank and optional system fallback. Choice is local to the
  device. Switching cancels current/pending speech. In original mode the rare
  separate soldier spoken quips are also disabled; ordinary nonverbal SFX stay.

## Original-voice limitation

The historical source manifest identifies the original voice exactly:
`assets/voice-v1.8.2/manifest.json` → Runway / Bernard / eleven_v3 / speed 1.
There are eight original radio recordings plus the newer `captain-office`
recording in Bernard. The other paid 2.7 recording is **Clint**, not Bernard;
74 more recordings use Silero voices.

One request to synthesize a short new rocket hint using the exact original
preset was refused by the connected service (`paid_plan_required`). The account
reported Free / 0 credits. Nothing was purchased. The full re-recording of the
75 non-Bernard additions is **not delivered** and must not be claimed complete.
The default recorded+text mode is an explicit compromise, not a new synthesis.
All existing audio files are preserved; no remote speech generation is used by
the game. A paid plan for that provider is required to regenerate the exact
voice. No additional generation requests were attempted after rejection.

## Verification

Command: `node tests/audio280-regression.cjs` — **8/8 PASS**.

- 600 seconds of deterministic pursuit radio: 14 recorded starts + 21 text
  messages, five unique original recordings, no Silero/Clint/system speech in
  original mode, maximum one voice and zero overlap.
- Ensemble, persistent preference, switching during playback, missing original
  recording, failed fetch and unknown lesson do not trigger an unwanted voice.
- Pause, hidden page, mute and dispose stop speech and release playback.
- A field subtitle remains available when the side panel is hidden in landscape,
  yields to the rocket tutorial and hides on pause. It uses the existing tick,
  adds no timer, does not intercept touch, and is tested as a DOM contract; actual
  mobile geometry is part of the root browser verification.
- All three 8-bit scores have four distinct sections; finite pitch/duration
  events and a layered score are verified.
- 900 seconds of live music scheduling: maximum 23 voices under the existing
  cap of 72, one shared AudioContext, correct wave/chapter switching, no voices
  left after hidden/stop/dispose. The lab prunes disconnected historical mock
  nodes so it does not add quadratic bookkeeping unrelated to the game.
- A fresh real base-5 dog, placed in its charge phase by the test fixture,
  executes its actual AI transition and produces the bark. Repeated immediate
  calls are limited; bark can play again after the cooldown; pause stops it.
  PCM is finite and bounded, with 18,240 samples at the lab's 48 kHz.

Evidence: `audio280-regression.json`, `audio280-regression.log` and
`tests/audio280-regression.cjs`.

This is Node VM testing with the actual production modules and a deterministic
Web Audio/network boundary. It does not assert physical-phone playback or
human listening approval. General regression scripts that assume the former
multi-voice default or exact 2.7 bank cadence need the ensemble setting; their
old expected behavior is intentionally not the new default.

Frozen source SHA-256:

- Music: `f277463e7ac27f43fd46b8a03d7880e2c49474b065f543f6b1f8feae75dd6077`
- Voice: `a0f53c76589b64e49ee1e44ff8fe999f2dab380cc567a829b7b81284db5ac76a`
- SFX: `f267691f3606edf751a427153304942d6d7188aeb917210c8e51ace5f44b21af`
