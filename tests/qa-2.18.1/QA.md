# Citadel 2.18.1 — mobile repair verification

## Changes

- Preload all four opening-scene layers before styles/scripts; decode and reveal the crew together. Keep start/continue available during slow or failed image loads, with retry.
- Relocate the existing guidance control outside the mobile objective block. Reuse mission controllers and preserve manual joystick takeover.
- Reserve separate HUD rows for shield/ammunition, level progress and controls. Expanded settings stay below both bars. Use the registered Cyrillic Citadel Display font instead of the nonexistent canvas family “Russo One”.
- Restore mobile printed comic panels/bubbles and their protected bounds; retain story milestones and collection replays.
- Reset render retry budget after healthy frames, restart the frame owner on resume, and provide recovery from completed checkpoints after simulation faults. Render-only faults recover the same engine without replay. A failed ranked simulation does not rewind a server-scored run.
- Put recovery controls outside the playfield stacking context, above the fixed pause/upgrade overlay (the previous notice was covered).

## Verification

- `node tests/mobile2181-contracts.cjs`: 9 checks, including decode barriers/errors/cancellation, real guidance state, non-mutating mission progress, native canvas comic pixels, transient and consecutive paint failures, checkpoint recovery, discarded animation callbacks and visibility pause/resume.
- `node tests/home2180-contracts.cjs`: 13 prior scenario/save/control contracts pass.
- Managed preview, Chromium: actual new-game start, first four-frame story, launch, guidance on/off; 390×844, 844×390 and 640×360 fixtures; expanded settings do not cover resources/progress. Two injected rendering failures show a reachable recovery button; clicking it removes the notice and restores play.
- Screenshot is a synthetic UI fixture with fixed resources/world position. It verifies HUD geometry, not a completed mission.
- Physical iPhone/Safari and intermittent device-specific GPU failures remain untested.
