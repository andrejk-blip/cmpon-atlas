# Citadel 2.17.5 — mobile composition and convoy motion

Released 2026-11-05 (Europe/Moscow).

## Changes

- Remove the permanent floating statistics control. Show the consent invitation once per browser, preserve existing choices, and expose settings through the menu. Closing does not grant consent.
- Compose the opening screen within one viewport. Preserve the entire landscape illustration and add a portrait variant with the established characters, symmetric fighter and cyber Doberman. Keep music and all main actions accessible.
- Fit incident, briefing, question/result, upgrades, collection and document-map windows to mobile dimensions without scrolling. Briefings show the objective, two key rules and launch action together; the unchanged detailed briefing is available separately. Long optional material uses explicit pages instead of clipped content or tiny fonts.
- Restore convoy background movement with minimum effects. Bounded particles move toward the camera independently of bloom quality. Pause and reduced-motion preferences still stop movement.

Monster illustrations, collision rules, damage, save data and campaign rewards are unchanged. Three visual monster concepts were presented separately for the user's selection.

## Validation

53 automated checks passed: 10 consent, 8 convoy, 6 viewport, 8 living map, 8 mobile music, 7 image loading, 6 recording privacy. JavaScript syntax checked. Low-effects CPU rendering changes 56.5% of pixels in the deterministic comparison; paused frames are identical. WebGL receives a progressing background clock.

Chrome layout/interaction checks: opening screen at 390×844, 320×568, 844×390 and desktop; incidents, briefings, questions with answer feedback, upgrades and collection at 320×568; convoy briefing, upgrades and map at 844×390. The tested core windows fit one page without vertical or horizontal scrolling. Detailed briefing opens, paginates, returns to the objective and launches the convoy through existing handlers. Actual convoy sky movement was visually checked with minimum effects.

No physical iPhone/Safari or low-end device performance test was performed. Existing optional long documents may use multiple pages. QA fixtures remain under tests and are never loaded by production entries.
