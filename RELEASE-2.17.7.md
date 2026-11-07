# Citadel 2.17.7 — audit fixes and distinct titan attacks

Released 2026-11-07. Baseline: `25e2fdaf7c4ecdea8a85857a260901793e89bc0b` (2.17.6).

Open collection/document windows now freeze the complete simulation and block gameplay controls, including mobile guide controls, while retaining close and keyboard navigation. Turning away from a titan no longer hides its live attack or warning. Local video recording composites the living-art layer between the scene and HUD.

The peaceful resonator no longer spawns damaging titans; legacy saves damaged by that encounter recover without resetting rings. Five titan families have distinct attack geometry, cadence and reachable safe lanes: hammer, whip, closing jaws, diagonal scythe and three rays. Warning geometry contains the full strike, including the hammer head. The final orbital defence has one complete swing; other encounters retain three. Already-started legacy encounters retain their original whip until completion.

Four campaign questions now have similarly plausible, similarly sized alternatives and deterministic presentation order. Mouse and number-key answers map to canonical indices, preserving saved answer meanings.

## Validation

- 15 targeted contract blocks, 12 living-art regressions, 7 image-loading checks and 6 viewport checks passed.
- Final continuous training/convoy, combat/pursuit and pro/convoy campaigns all passed: 15 chapters and 28 reviews each. Inputs use ordinary actions after start, without injected health, resources, score or objective completion.
- Four active swarm trials and three active convoy III trials passed; both idle controls failed. Controllers know exact state and answer keys; these are not human difficulty ratings.
- The first distinct-attack candidate failed one combat/pursuit route. The failing evidence is retained. A paired earned-checkpoint replay identified repeated titan strikes during station defence. Limiting the final orbit to one swing restored the tested route, followed by all three final campaigns.
- Chrome compatibility rendering and native 960×540 video preview verified with the painted titan, attack and HUD present. Physical phones, WebGL performance and subjective audio quality were not tested.

See [audit evidence and reproduction](tests/qa-2.17.7/QA.md). The PDF report includes editorial difficulty/interest/engagement curves, measured before/after campaign data and swarm results; editorial curves are not player telemetry.

## Remaining observations

The chapter-4 comic anticipates later encounters. Boss skip still opens a victory comic without awarding the achievement. At 568×320 the compact briefing's lower block overflows by roughly 9 px, with launch visible. These remain separate follow-up items, outside the six selected fixes.
