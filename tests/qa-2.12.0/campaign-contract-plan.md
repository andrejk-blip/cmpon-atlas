# Independent campaign QA plan — 2.12.0

Role: reviewer/tester. Written before implementation review. No game source was
changed by this agent. Source baseline: `f4afdf8758f1fe186b8f69e8332782fb0548be4e`.

## Required behavior

- Preserve ordinary input playability through every required chapter and both
  sides of the single optional route choice. Parallax follows the swarm; the
  Contradictions Station occupies the former late-boss slot.
- Existing base content is retained unless explicitly replaced. With that
  interpretation there are 15 mandatory chapters and one optional alternate
  route, not 14 chapters with a duplicated/missing base.
- Previously empty educational chapters: convoy I, convoy II, convoy III,
  Parallax. Each gets one card. MRG remains the exception. Station has its own
  meaningful educational resolution. Existing 23 cards remain reachable.
- No additional compulsory collectible for the bestiary and no hidden combat
  reward/penalty for recognizing the delayed story consequence.

## High-risk compatibility seams in current code

1. `stage` is an edition index (0–3), not the future displayed chapter number.
   `lesson.caseIndex`, `board.question`, `plan`, `completedRemarks`, RPG reward
   identifiers and geometric base definitions depend on it.
2. `CUP_ENGINE_KEYS` owns full cloud/local snapshot serialization. New campaign
   state must be included there, but restoring an old snapshot calls `start()`
   before overwriting saved fields. Modern state created by `start()` must not
   leak into a legacy run whose snapshot has no new key.
3. `citadelSave/citadelRestore`, `finalePersist/finaleRestore` and quiz `saveLocal`
   are separate paths. The old finale validator requires the complete late-game
   packet (12 rescued, 12 remarks, 8 decisions); it cannot validate the new
   intermediate Parallax snapshot without an explicit new path.
4. Legacy tournament hooks use fixed progress 0–14 and fixed `beginBreach→11`.
   Inserting a boss earlier and a new station later must not submit malformed
   stage results or make an old tournament run continue on the new route.
5. Retry may replace the engine; checkpoint fields must be copied deeply or
   copy-on-write. New choices, cards, document edits and story flags must not
   mutate an earlier retry boundary.
6. HUD, pause help, story mood, `CITADEL_NARRATIVE.chapter` and existing QA runners
   compute chapter numbers separately. An old QA result that still says 14 levels
   cannot demonstrate the new order.
7. Pursuit records use `stage===1`, `plan[1]` and case IDs 2/3. Reusing pursuit as
   the route after base 2 must not reset or duplicate that earlier education.
8. Warp entities spawn ahead of the player (up to 900 world units). The mere
   presence of an object in `warpEntities` is not yet a close/visible encounter.
9. The bestiary and document must not change engine RNG or progress while being
   rendered, including rotating model rendering and opening/closing panels.
10. Defeat tips must cite actual events or say the cause is uncertain. A generic
    hardcoded torpedo/tentacle accusation is not acceptable evidence.

## Contract cases after implementation

| ID | Scenario | Required assertion |
|---|---|---|
| R01 | New game in training/combat/pro | New route marker, clean one-time flags, correct displayed version/order |
| R02 | Both post-base-2 routes | Same required packet, exactly one selected mission, common next swarm |
| R03 | Swarm completion | Outstanding swarm cards first, then Parallax, then the retained integration base |
| R04 | Mid-boss victory | No late-lair shortcut; document/card boundary resumes the integration base |
| R05 | Late base-4 completion | Station starts; no second Parallax |
| R06 | Station success, both valid resolutions | Finite exit to lair; understandable disagreement; no mandatory enemy clearance while reading |
| R07 | Full route | Each mandatory mission once, all prerequisites, real MRG win, no missing-card chapter except MRG |
| C01 | New one-card scenes | Answer once; duplicated taps/next do not double points, resources or document edits |
| C02 | Pause/reload while unanswered and answered | Exact selected card/answer/next destination retained |
| S01 | Checkpoint, retry twice, reload again | Route choice and earned flags respect the same boundary; no duplication |
| S02 | Old 2.11 snapshots before/inside/after boss | Existing arena/progress/resources remain coherent; no inserted middle boss retroactively |
| S03 | Old professional cloud campaign | Legacy 14-stage score submission contract retained |
| D01 | E01 interchapter document | Current change highlighted, old lines retained, one action dismisses, no forced long reading |
| D02 | E06 correct and incorrect early decision | Different recognizable delayed text; both paths completable; no extra combat stats |
| D03 | E07 two known defeat causes | Event-derived reason and exactly one actionable coaching focus; practice is optional |
| D04 | E07 practice return | Safe exercise cannot overwrite live save/score/progression; return restores boundary |
| D05 | E08 no encounter vs near encounter | Asset load/pre-spawn does not unlock; actual encounter unlocks only the matching species |
| D06 | E08 open/close/pause/render | No battle time/RNG/health drift, no reward, entries persist, no completion gate |
| UI01 | Portrait 390×844, landscape 844×390 | New route/card/document/bestiary/practice controls visible, large and closable |
| UI02 | Entry parity | Public index, standalone game and private lab load the same active version and module hashes |

Full-route tests use ordinary actions after explicit initial setup. Targeted
save-contract fixtures may position the engine at a boundary; those are reported
as contracts, never human or continuous playthroughs. Physical iPhone ergonomics
and Add to Home Screen remain browser/device verification, not Node simulation.
