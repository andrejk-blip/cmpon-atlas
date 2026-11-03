# Citadel 2.14.0 — release review

All 11 requested changes are implemented for the current personal campaign. Historical campaigns and cloud-tournament rules retain their original progression and balance.

- Chase: 90 seconds of transmission (72 training), wider channel, fewer escorts, readable attack warnings and packet repairs. All three convoys have wider openings, weaker enemies, reduced field damage and repairs. First orbit has weaker enemies, slower hostile shots, damage reduction and recovery after a safe interval.
- Ship and base share skill and equipment benefits. The existing illustrated perk cards explain the common effects.
- Document progress uses an illustrated five-part atlas with current chapter captions, section highlighting and 15 chapter stamps. It opens after each completion. First actual monster encounters open the bestiary and pause combat. Discovery flags survive retry/reload.
- Five anatomical giant silhouettes replace the circular monsters; body and joint collision follows the same physical poses. Telegraphs precede the strike.
- Convoy nebula moves in both WebGL and CPU renderers. Detailed hull material uses local coordinates instead of the world's floor-seam pattern. The ship has aligned layered exhaust. Five enemy projectile families have distinct silhouettes and colors.
- Later bases add flanking, alternating crossfire, shield/relay coordination and retreat decisions, respecting navigation and line of sight.
- After three defeats in the same chapter, a skip button appears. Counters survive reload, practice does not count, and skipped chapters are recorded without granting combat points.

## Evidence

- Six continuous input-only campaign runs (three modes × two routes) reached victory, all 15 chapters and 28 cards. The operators read exact positions and answer keys; this is not human playtesting.
- Ten delayed joystick scenarios at 30/60 Hz with 0.60/0.75-second decisions passed. Combat chase completed in 95.3–95.5 seconds, versus 148.9–152.3 in 2.13. All six combat convoy scenarios delivered 3/3 transports. Six save/legacy check groups passed.
- Eight assistance/progression/equipment/tactics contract groups passed, including save/retry/reload and each combat family's skip transition.
- 720 monster poses passed contact/clearance checks; minimum unobstructed side-route radius 19.62 m. Fifteen staged native production-renderer captures cover five creatures, portrait, landscape and attack poses.
- Animated CPU background changed visibly between clocks, stayed identical at the same paused clock; ship and five weapon families rendered with the production geometry.
- Live browser review of the private memory-only game bundle: perk cards and atlas at 390×844, 844×390 and desktop. The browser used the compatible CPU renderer. An initial frame-gap guard paused some previews and resumed normally; no runtime fault was reported. No physical phone, GPU-performance or audio-listening claim.

## Screenshots

`document-browser.jpg`, `document-map-portrait.jpg` and `document-map-landscape.jpg` are browser captures. The monster and effects PNGs are native CPU fixture captures. The viewport harness only frames the existing private memory-only launcher; it is not part of the production entry.
