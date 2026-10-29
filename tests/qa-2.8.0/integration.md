# 2.8.0 independent integration QA

The frozen JavaScript chain completes all 14 levels in training, combat and pro, with all 23 educational checkpoints per run. These are deterministic Node VM playthroughs using ordinary movement, weapons, target selection, interaction, upgrade and answer commands. The operator reads precise positions and answer keys. It does not edit health, ammunition, enemy deaths or objective completion.

| Check | Result | Evidence |
|---|---|---|
| Training full campaign | PASS, 14 levels / 23 checkpoints, 1240.07 simulated seconds | `learning-campaign-training-final.json` |
| Combat full campaign | PASS, 14 / 23, 1389.27 seconds | `learning-campaign-combat-attempt2.json` |
| Pro full campaign | PASS, 14 / 23, 1389.27 seconds | `learning-campaign-pro-attempt2.json` |
| Quiz answer, duplicate reward, save and case contracts | PASS 277/277 unique checks, including a targeted comparator correction | `learning-contracts-summary.json` |
| Reload, records, retries and pause/save continuations | PASS 51/51 | `learning-integrity-final.json` |
| Actual 2.7 snapshots continued by 2.8 | PASS 42/42 | `legacy-continuation.json` |
| Launch/save/network routing contracts, final 280r2 assets | PASS 5/5 | `learning-network-280r2.json` |
| Release caption, escaping/fallback, unchanged schema and cache references | PASS 6/6 | `lobby-version-280r2.json` |
| Cold initialization and runtime lifecycle | PASS 10/10 | `runtime-final.json` |

The successful campaigns use seed `417147` at a simulated 60 Hz. None purchases analyst skills; all collect the base rewards along the ordinary route. The new skills are therefore optional for this demonstrated completion path. The 51 integrity cases include local reload with preserved question/feedback, separate records, preserved pro saves, three successive retries at stage/escort/finale checkpoints, and pause/save/deterministic continuation at all 14 levels in all three modes.

Legacy checks create real snapshots using commit `5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d`, run ordinary inputs, pause, restore with the candidate chain, compare the entire packed state, then continue for two seconds. These are direct level fixtures, not full legacy campaigns. The checkout lacks the older 2.6 commit used by the historical verifier, so this suite makes no new 2.6 compatibility claim.

Across each complete campaign, the engine emitter remains identical and mocked listener counts remain 33 window / 44 document / 43 element listeners. Mission, swarm and runtime journals stay within their production caps. Heap samples include deliberately retained checkpoints and report data; they are not a browser memory-leak measurement. Runtime checks cover hidden-tab pause, lost RAF recovery, fault backup, stopped repeated faults, context restoration and bounded diagnostics. Network tests mock fetch and verify routing/payloads; they do not contact the live ranking service.

Initial combat/pro attempts lost the station at level 10. Their reports and logs remain in this directory. The prior QA pilot spent missiles through blocked lines of fire and defended the station too late. A new QA-only `orbital280-inputs.js` uses visible geometry, prioritizes station threats, chooses pulse timing and permits the existing resupply command. It changes no game rules or engine state. Both modes then completed on the frozen game sources. Training uses the released calm controller; the early generated campaign metadata labels for orbital resupply apply only to the normal-mode pilot.

One full contract process was interrupted after making no further progress at its first duplicate-answer case. An isolated replay, including preceding bank-selection tests, passed; the unchanged full suite was restarted. Its interrupted log is retained as `integration-contracts-attempt1-interrupted.log`.

The full card run passed 259 checks and exposed 18 defects in the historical test comparator: `escortStart` has been serialized by the learning module since the actual 2.7 baseline, but the synthetic pre-learning chain omits that module. The comparator already normalized other added save fields and had omitted this one. Only those 18 cases were rerun after the explicit envelope normalization: all pass, including new guards requiring equivalent state before any answer and proving that wrong answers preserve the entire escort checkpoint. The initial failing report is retained; the combined summary contains 277 unique passing contracts. No game code was changed for this correction.

The final `280r2` entry and `index.html` match exactly, SHA-256 `75023f3e85ad01a25408d90b9795815a71ca6579ec60559ef5f4e02899ddd18a`. Of the 52 loaded scripts, 51 match the completed campaigns and card/save/lifecycle checks byte for byte. The sole exception is `citadel-learning-modes-v2.7.0.js`: an exact source-diff assertion proves only the lobby release-caption interpolation changed, from the module's `2.7.0` to escaped application release metadata. All game logic and save-schema version bytes are unchanged. Final launch/network checks pass 5/5; lobby checks pass 6/6, including visible `2.8.0` in both quiz modes, preserved `2.7.0` bank schema, fallback, escaping and `build=280r2` references for all loaded scripts/styles. One initial cache fixture incorrectly expected `v=`; its failure is retained and the test now checks the actual `build=` parameter.

Historical reports and `integration-fingerprint-280r1.json` remain intact. `integration-fingerprint.json` records the 51 exact matches, the explicitly verified caption-only exception, final-entry follow-ups and final skills CSS hash. No full campaign/card rerun was warranted by this display-only correction. The narrow-landscape CSS refinement is outside Node VM coverage and belongs to the separate browser review.

This evidence establishes a reachable completion path and save/routing/runtime contracts. It does not establish human difficulty, touchscreen ergonomics, rendered frame time, visual quality, audio quality or live backend behavior. Those require the separate browser and feature reviews. Level 9 remains the third convoy mission; its optional replacement with pursuit is deferred and is not claimed here.
