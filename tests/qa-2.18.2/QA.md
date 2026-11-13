# Citadel 2.18.2 — names, ranking, achievements and requirement document

## Changes

- Require a saved player name before starting or continuing any expedition mode. Reuse the existing device-bound profile and rename flow; preserve the pending start action after registration.
- Put profile, ranking and a real leader/result line on the home screen. Replace cup navigation with the three expedition modes and a separate archive of prior records.
- Submit completed expedition chapters through an owner-scoped persistent retry queue. Skipped chapters and practice runs do not add ranked progress. Existing campaign saves and old tournament records remain compatible.
- Announce newly earned achievements with a comic toast and an unread badge. Pause toast exposure while menus, pause or another tab hide it; do not announce restored historical awards again.
- Replace the decorative requirement map with five accumulating sections, a progress indicator and selectable real requirement text. Skipped rewards remain incomplete.

## Verification

- `node tests/social2182-contracts.cjs`: 6 contracts pass, covering mandatory names, returned ranking data and HTML escaping, actual document rewards, achievement persistence/migration and offline/owner-safe result retry.
- `node tests/home2180-contracts.cjs`: 13 existing home, story-order, save and control contracts pass.
- `node tests/mobile2181-contracts.cjs`: 9 existing loading, guidance, HUD and pause/recovery contracts pass.
- Managed Chromium preview at 390×844, 844×390 and 360×640: name submission resumes the first story; ranking and personal highlight render; two- and five-part documents show real text; compact cards contain their contents; achievement toast sits above the controls.
- `document-mobile.jpg` uses explicitly labelled synthetic players and campaign state. It demonstrates responsive layout, not a completed real expedition.
- Backend release `4ac872ecd4283c11f11028f38fbf9a611e467e59` adds `/api/tournament/expedition` and `/api/tournament/ranking` to the existing public metrics service. Production deployment succeeded. No database migration or access change.
- Backend isolated SQLite suites `verify-expedition.mjs`, `verify.mjs` and `verify-roster.mjs` pass: authorization, ownership, ordered chapter history, skipped chapters, idempotency, mode separation, ranking order, renaming, blocked-player handling, and legacy standings/snapshots.
- No synthetic results were submitted to the production ranking. Physical iPhone/Safari and a complete real 15-chapter playthrough are not covered by these checks.

## Published-page check

- GitHub Pages deployed frontend commit `08fd83125d268acaf281fd8b793f6c8ca37a8bc5`; the live page reports 2.18.2.
- Live anonymous Start opens the mandatory name form (`registration-live.jpg`). No test account was created on production.
- The public endpoint returns the five existing registered players. Archived records load, led by Алёша (14/14, 95,198 points); the home leader line correctly labels this as a prior record until the new expedition has results.
