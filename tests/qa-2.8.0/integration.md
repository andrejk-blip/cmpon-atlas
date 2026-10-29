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
| Launch/save/network routing contracts | PASS 5/5 | `learning-network-final.json` |
| Cold initialization and runtime lifecycle | PASS 10/10 | `runtime-final.json` |

The successful campaigns use seed `417147` at a simulated 60 Hz. None purchases analyst skills; all collect the base rewards along the ordinary route. The new skills are therefore optional for this demonstrated completion path. The 51 integrity cases include local reload with preserved question/feedback, separate records, preserved pro saves, three successive retries at stage/escort/finale checkpoints, and pause/save/deterministic continuation at all 14 levels in all three modes.

Legacy checks create real snapshots using commit `5e057d5bca56fe3c16b15ebcb6cf9c3b26584e8d`, run ordinary inputs, pause, restore with the candidate chain, compare the entire packed state, then continue for two seconds. These are direct level fixtures, not full legacy campaigns. The checkout lacks the older 2.6 commit used by the historical verifier, so this suite makes no new 2.6 compatibility claim.

Across each complete campaign, the engine emitter remains identical and mocked listener counts remain 33 window / 44 document / 43 element listeners. Mission, swarm and runtime journals stay within their production caps. Heap samples include deliberately retained checkpoints and report data; they are not a browser memory-leak measurement. Runtime checks cover hidden-tab pause, lost RAF recovery, fault backup, stopped repeated faults, context restoration and bounded diagnostics. Network tests mock fetch and verify routing/payloads; they do not contact the live ranking service.

Initial combat/pro attempts lost the station at level 10. Their reports and logs remain in this directory. The prior QA pilot spent missiles through blocked lines of fire and defended the station too late. A new QA-only `orbital280-inputs.js` uses visible geometry, prioritizes station threats, chooses pulse timing and permits the existing resupply command. It changes no game rules or engine state. Both modes then completed on the frozen game sources. Training uses the released calm controller; the early generated campaign metadata labels for orbital resupply apply only to the normal-mode pilot.

One full contract process was interrupted after making no further progress at its first duplicate-answer case. An isolated replay, including preceding bank-selection tests, passed; the unchanged full suite was restarted. Its interrupted log is retained as `integration-contracts-attempt1-interrupted.log`.

The full card run passed 259 checks and exposed 18 defects in the historical test comparator: `escortStart` has been serialized by the learning module since the actual 2.7 baseline, but the synthetic pre-learning chain omits that module. The comparator already normalized other added save fields and had omitted this one. Only those 18 cases were rerun after the explicit envelope normalization: all pass, including new guards requiring equivalent state before any answer and proving that wrong answers preserve the entire escort checkpoint. The initial failing report is retained; the combined summary contains 277 unique passing contracts. No game code was changed for this correction.

The final entry metadata was updated after the full campaigns. `index.html` and `tests/entry-2.8.0.html` now match exactly; their SHA-256 is `20a58b82f4d127085e65a459282c5d98eae7afd15d9a7286537d97f549ceee7f`. Every one of the 52 loaded script files and their order still matches the successful campaigns, integrity, legacy, runtime and network runs. The targeted contracts loaded the final entry. The per-run JSON records the bytes actually tested; `integration-fingerprint.json` records the final comparison and final skills CSS hash. The last narrow-landscape CSS refinement is outside Node VM coverage and belongs to the separate browser review.

This evidence establishes a reachable completion path and save/routing/runtime contracts. It does not establish human difficulty, touchscreen ergonomics, rendered frame time, visual quality, audio quality or live backend behavior. Those require the separate browser and feature reviews. Level 9 remains the third convoy mission; its optional replacement with pursuit is deferred and is not claimed here.
