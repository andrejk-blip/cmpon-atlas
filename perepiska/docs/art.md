# Art direction: «Живая линия»

Approved direction: the second hand-drawn 2D variation chosen by the user on 2026-11-14. Warm sage/coral/cream, lively ink contours, sparse hatching, adult facial proportions and distinct silhouettes.

## Runtime assets

- `assets/courtyard.webp`: 1536 × 1024, 476,446 bytes. Clean residential courtyard background. Interactive entrances, routes, status markers and characters belong to the renderer, not the image.
- `assets/team.webp`: 2172 × 724, 316,880 bytes. Transparent three-column waist-up character strip. Left Nina (green), middle Lena (coral), right Vera (lavender). Three equal 724 × 724 cells. CSS: `background-size: 300% 100%`, `background-position: 0% 50% / 50% 50% / 100% 50%` respectively. Preserve transparent margins.
- `assets/favicon.svg`: original vector speech-bubble monogram.

The original PNGs are retained in `assets/source/` for future editing; runtime uses WebP. Image assets generated with the built-in OpenAI image generation tool from the user's approved concept reference, not downloaded stock art. WebP conversion is a format/compression operation only. Character motion in this first version is implemented by the game renderer; these sprites do not contain pre-rendered animation frames.

## Generation prompts

### courtyard

Use case: stylized-concept. Create a production game background for the 2D cartoon game «Переписка». Reference image is STYLE ONLY; use the approved 'Живая линия' loose hand-drawn comic style, expressive imperfect black ink outlines, occasional scratchy crosshatching, flat cel colors in sage, coral, cream, muted denim, warm offwhite. Landscape aspect about 1536x1024. FULL BLEED clean scene, no margins or presentation layout. Show a small contemporary residential courtyard from slightly elevated three-quarter view, four clearly distinct apartment entrances distributed across the scene, low-rise and midrise buildings, a curved walking path connecting them, a bench, a few trees, small lawn. Broad quiet open center path for overlaying tiny game character tokens and four house pins; entrances should be visible and visually separated. Make the environment handsome, believable, very readable as a clickable map, cozy lived-in but no fantasy. Buildings across upper third and sides, scene fully contained. NO PEOPLE, NO ANIMALS, NO TEXT, NO NUMBERS, NO UI, NO PHONES, NO LOGOS, NO borders or panels. Warm afternoon light, mature witty drawn animation background, clean color shapes with lively pen strokes. Not 3D, not paper cutout, not painterly watercolor.

### team

Use case: stylized-concept. Create a transparent-background production character sprite strip for the 2D game «Переписка». Attached reference establishes exact approved 'Живая линия' adult hand-drawn cartoon style: lively imperfect black ink, sparse hatching, confident cel colors, expressive warm faces. Output ONE wide horizontal strip with EXACTLY THREE SEPARATE waist-up characters, evenly occupying three equal-width columns; generous transparent gaps, no overlaps. All characters centered within own third, heads at same height, shoulders/waists fully inside frame. Left: Nina, woman ~40, short wavy brown bob, slightly long nose and expressive eyebrows, green jacket over ochre shirt, one hand holds a small dark phone, friendly amused attentive expression. Middle: Lena, woman ~30, dark hair in a loose bun, round dark glasses, coral jacket over navy top, lively curious smile. Right: Vera, woman ~55, round pleasant face, short wavy blonde hair, lavender blouse/cardigan and understated earrings, calm knowing smile. Respect adult ages and varied silhouettes. Same named women as style reference, no glamour or baby faces. Forward three-quarter facing camera, well-drawn anatomical hands. GENUINELY TRANSPARENT background, no checkerboard drawing, no shadows behind figures, no floor, no scenery, no captions, no text, no labels, no frame, no phones outside hands. This is a real reusable game art strip, NOT a concept presentation board. Keep faces large and distinguishable when displayed as portrait avatars.

