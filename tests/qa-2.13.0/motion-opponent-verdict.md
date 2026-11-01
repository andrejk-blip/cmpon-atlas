# Independent motion and combat review · 2.13.0

Verdict: all 12 bounded opponent contracts pass on the active `index.html` build. Run `node tests/motion2130-contracts.cjs`; structured results are in `motion2130-contracts.json`.

This is simulation and source review, not a human playthrough or an iPhone performance measurement. Explicitly placed geometry and enemies test collision boundaries; ordinary engine steps test timing, pause, projectiles and saved continuation. Full campaign and browser checks are separate workstreams.

## Findings resolved before sign-off

1. **Invisible sniper aim cue in combat.** The base reward renderer discarded the earlier `warning-line` meshes. The new motion renderer now adds the sniper beam and target marker after that filtering (`citadel-motion-v2.13.0.js`, `citadelInterior`, `sniperAim2130`). The test sees both cue items and measures about 0.57 seconds before the faster shot.
2. **Visible medusa bell lacked physical contact.** A ship crossing the drawn bell at `[-20,52,-20] → [-20,52,20]` previously missed every collider. Anatomical body volumes now catch that sweep. Rim and tentacle sweeps remain physical and the centre remains open.
3. **Convoy brief contradicted central monsters.** The modern campaign brief now explains flying through the central opening, matching the new pose. Legacy brief remains appropriate to the older lateral monsters.

## Measured results

| Check | Result |
| --- | --- |
| Five monster kinds across 32 phases each | 160 clear central passages; minimum measured radial free space 28.3 m |
| Swept rim and limb intersections | 10 / 10 contacts detected |
| Medusa visible bell regression | Contact with anatomical body detected |
| Maximum monster collision parts in samples | 99 |
| Modern normal pursuit link requirement | 120 seconds; first central monster spawned at 9.78 seconds in fixture |
| Moving hyperspace | 41 bounded render items; changes during play; unchanged through two paused seconds |
| Pursuit save continuation | Paused snapshot restores exactly; 1.5 seconds of equal input remain equal |
| Convoy central monster | Central spawn, open passage, pause and one-second restored continuation pass |
| Sniper / training sniper / old-save sniper speed | 84 / 66 / 30 units per second |
| Scout / unmodified enemy speed | 22.95 / 17 units per second |
| Fast shot at 30 Hz | 13 damage applied despite crossing player between frame endpoints |
| Dock gate | Fully open when ship reaches the gate approach at 59.46% of docking animation; paused state retained |
| Base guide paths | 188 source/target pairs across four base layouts; all segments walkable at 0.65 m clearance; 177 routes reduced, maximum reduction 25 points; stationary calls stable |

The 0.65 m path criterion matches the existing path planner's accepted goal connection. Testing 0.70 m would flag legacy routes that are deliberately accepted at 0.68–0.65 m, rather than a new wall-cutting regression. Initial projectile test placements were inside an unavailable floor region; those fixture errors were corrected before judging the implementation.

## Remaining limits

Automated geometry checks cannot establish that the monsters feel spectacular or that their silhouettes are readable on a physical phone. The sniper speed increase is deliberately substantial; the visible warning and real swept collision are verified, but phone-player comfort still needs a device play session. This review does not claim an iPhone frame rate, subjective balance optimum, or complete campaign finish.
