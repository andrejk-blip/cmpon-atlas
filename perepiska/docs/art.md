# Art direction: «Живая линия»

Approved direction: the second hand-drawn 2D variation chosen by the user on 2026-11-14. Warm sage/coral/cream, lively ink contours, sparse hatching, adult facial proportions and distinct silhouettes.

## Runtime assets

- `assets/courtyard.webp`: 1536 × 1024, 476,446 bytes. Clean residential courtyard background. Interactive entrances, routes, status markers and characters belong to the renderer, not the image.
- `assets/team.webp`: 2172 × 724, 316,880 bytes. Transparent three-column waist-up character strip. Left Nina (green), middle Lena (coral), right Vera (lavender). Three equal 724 × 724 cells. CSS: `background-size: 300% 100%`, `background-position: 0% 50% / 50% 50% / 100% 50%` respectively. Preserve transparent margins.
- `assets/favicon.svg`: original vector speech-bubble monogram.

The original PNGs are retained in `assets/source/` for future editing; runtime uses WebP. Image assets generated with the built-in OpenAI image generation tool from the user's approved concept reference, not downloaded stock art. WebP conversion is a format/compression operation only. Character motion in this first version is implemented by the game renderer; these sprites do not contain pre-rendered animation frames.

## Residents walk sheet

`assets/residents-walk.webp`: 1448 × 1086, 350,470 bytes, true alpha. Same four-column × three-row layout as staff walk sprites, equal 362 × 362 cells and approximately 96% foot baseline. Row 0: older gray-haired man in mustard vest. Row 1: younger bearded man in teal sweater. Row 2: mother with dark tied-back hair in coral sweater. Four opposing contact/passing walk phases facing right; mirror in the renderer for leftward movement. All twelve figures are fully contained in their cells.

Source retained at `assets/source/residents-walk.png`. Generated with built-in image generation using `assets/source/world-walk.png` as layout, gait and drawing-style reference, replacing only character identities/outfits. Requested true alpha, no backgrounds, labels or shadows, identical scale and baseline. WebP conversion only used ImageMagick.

## Generation prompts

### Full-body walk sheet

`assets/world-walk.webp` is a transparent 1448 × 1086 sheet: four columns, three rows, equal cells 362 × 362. Rows: Nina, Lena, Vera. Columns: contact, passing, opposite contact, opposite passing. Characters face right; mirror the runtime sprite for leftward travel. Source: `assets/source/world-walk.png`. A second image-generation pass corrected repeated gait poses in columns three and four. Heads and feet remain contained in their respective cells; vertical padding is smaller than the requested 15–20%, so use whole-cell slicing and avoid aggressive trimming. Foot baseline is approximately 96% of each cell's height, with slight drawn-frame variation. Four frames support a lightweight stepped animation, not skeletal animation.

Generation: built-in image generation, using `assets/source/team.png` as identity/style reference. Requested full-body right-facing walking, exact 4 × 3 equal cells, true alpha, unchanged character identities and outfits, alternating opposing limbs. No text, labels, backdrop or baked shadows. WebP conversion only used ImageMagick.

### courtyard

Use case: stylized-concept. Create a production game background for the 2D cartoon game «Переписка». Reference image is STYLE ONLY; use the approved 'Живая линия' loose hand-drawn comic style, expressive imperfect black ink outlines, occasional scratchy crosshatching, flat cel colors in sage, coral, cream, muted denim, warm offwhite. Landscape aspect about 1536x1024. FULL BLEED clean scene, no margins or presentation layout. Show a small contemporary residential courtyard from slightly elevated three-quarter view, four clearly distinct apartment entrances distributed across the scene, low-rise and midrise buildings, a curved walking path connecting them, a bench, a few trees, small lawn. Broad quiet open center path for overlaying tiny game character tokens and four house pins; entrances should be visible and visually separated. Make the environment handsome, believable, very readable as a clickable map, cozy lived-in but no fantasy. Buildings across upper third and sides, scene fully contained. NO PEOPLE, NO ANIMALS, NO TEXT, NO NUMBERS, NO UI, NO PHONES, NO LOGOS, NO borders or panels. Warm afternoon light, mature witty drawn animation background, clean color shapes with lively pen strokes. Not 3D, not paper cutout, not painterly watercolor.

### team

Use case: stylized-concept. Create a transparent-background production character sprite strip for the 2D game «Переписка». Attached reference establishes exact approved 'Живая линия' adult hand-drawn cartoon style: lively imperfect black ink, sparse hatching, confident cel colors, expressive warm faces. Output ONE wide horizontal strip with EXACTLY THREE SEPARATE waist-up characters, evenly occupying three equal-width columns; generous transparent gaps, no overlaps. All characters centered within own third, heads at same height, shoulders/waists fully inside frame. Left: Nina, woman ~40, short wavy brown bob, slightly long nose and expressive eyebrows, green jacket over ochre shirt, one hand holds a small dark phone, friendly amused attentive expression. Middle: Lena, woman ~30, dark hair in a loose bun, round dark glasses, coral jacket over navy top, lively curious smile. Right: Vera, woman ~55, round pleasant face, short wavy blonde hair, lavender blouse/cardigan and understated earrings, calm knowing smile. Respect adult ages and varied silhouettes. Same named women as style reference, no glamour or baby faces. Forward three-quarter facing camera, well-drawn anatomical hands. GENUINELY TRANSPARENT background, no checkerboard drawing, no shadows behind figures, no floor, no scenery, no captions, no text, no labels, no frame, no phones outside hands. This is a real reusable game art strip, NOT a concept presentation board. Keep faces large and distinguishable when displayed as portrait avatars.

