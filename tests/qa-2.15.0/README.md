# Citadel 2.15.0 validation

- Keyboard and real pointer handlers: Space boosts without firing; LMB fires; RMB spends one missile; separate touch fire is preserved.
- Deck rockets: swept enemy/wall contacts, occluded splash, ammunition/cooldown, serialized in-flight state, pause stability.
- Continuous deterministic combat run via the convoy route: victory after all 15 chapters and 28 cards, using the new independent fire input. No missions skipped.
- Anatomical collision: 720 sampled poses; paired arms/tentacles, collidable legs, at least 18 m open side corridor.
- Native CPU renderer: finite geometry, detailed exhaust, frozen simulation-time effects, five enemy projectile families.
- Cloud-browser UI: 390 × 844 and 844 × 390 layouts; no bestiary card scrolling; animated document castle visible. These are simulated viewports, not physical phones.
- Browser MediaRecorder: created a playable VP8 video, 960 × 540; downloaded and decoded the actual recording. `browser-recording.webm` is a synthetic paused-deck QA sample. Recording now optionally taps the existing game audio mixer; no microphone or camera access.
- Private lab: 25 entry points × 3 modes, exact source hashes, no campaign/record storage reads or writes. Recordings are separate durable user-owned data.
- Clips service: authentication, origin checks, owner isolation, upload validation, idempotency, byte-range playback, notes and upload-error cleanup tested with isolated storage doubles; schema migration applied locally.

Screenshots and staged renders are review fixtures, not evidence of a human gameplay run. The native publishing workflow verifies deployment; the owner's signed-in production upload is not impersonated by these tests.
