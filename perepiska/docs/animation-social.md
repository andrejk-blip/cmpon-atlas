# Social portrait expressions

The first-day UI now has original fictional adult portraits for Kira, Ilya,
Anton and Dima. This asset is for chat avatars and the household roster; it does
not add these characters to the walking world or change story content.

## Files and layout

- Runtime: `assets/social-portraits-motion.webp`.
- Original generated PNG: `assets/source/social-portraits-motion.png`.
- Both are **1086 × 1448**, RGBA, **3 columns × 4 rows**.
- Each frame is **362 × 362**. No baked background, labels or grid.
- Source was generated with the built-in image-generation tool using
  `assets/anna-life-walk.webp` only as a drawing-style reference.
- WebP conversion uses quality 90 and alpha quality 100. No retouching,
  extraction, resizing or layout changes were performed.

| Row | Character | Appearance |
| --- | --- | --- |
| 0 | Kira, 25 | Short dark wavy bob, rose blazer, cream top, small gold earrings |
| 1 | Ilya, 31 | Light-brown wavy hair, mustard shirt, longer face |
| 2 | Anton, 26 | Short brown hair, sage shirt, broader face, strong eyebrows |
| 3 | Dima, 29 | Ginger hair and light stubble, coral hoodie |

| Column | Expression | Intended use |
| --- | --- | --- |
| 0 | Eyes open, closed relaxed mouth | Default/rest pose |
| 1 | Eyes fully closed, mouth unchanged | Brief natural blink |
| 2 | Eyes open, gently parted mouth | Short speaking or response accent |

## Crop coordinates

Use integer whole-cell source rectangles:

```js
const sx = column * 362;
const sy = row * 362;
const sw = 362;
const sh = 362;
```

| Character | Neutral rectangle `(x, y, w, h)` | Blink rectangle | Talking rectangle |
| --- | --- | --- | --- |
| Kira | `(0, 0, 362, 362)` | `(362, 0, 362, 362)` | `(724, 0, 362, 362)` |
| Ilya | `(0, 362, 362, 362)` | `(362, 362, 362, 362)` | `(724, 362, 362, 362)` |
| Anton | `(0, 724, 362, 362)` | `(362, 724, 362, 362)` | `(724, 724, 362, 362)` |
| Dima | `(0, 1086, 362, 362)` | `(362, 1086, 362, 362)` | `(724, 1086, 362, 362)` |

For CSS whole-cell presentation, use `background-size: 300% 400%`, horizontal
positions `0% / 50% / 100%` and vertical positions
`0% / 33.333333% / 66.666667% / 100%`. Keep the same viewport and transform for
all expressions of a character. Do not independently center or trim each frame:
the intentionally fixed cell anchor prevents facial jitter.

The bust baseline is approximately cell-local `y = 334`; a useful stable
presentation anchor is `(181, 334)`. For a tighter face avatar, use the same
cell-local crop `(65, 10, 240, 250)` across all frames and rows. That optional
crop is a renderer viewport, not a separately edited image.

## Inspection

The source has real alpha ranging from 0 to 255; 52.3% of its pixels are fully
transparent. The WebP retains the original alpha channel. All 12 frames are
contained in their own cells. At alpha > 127, frame-local opaque bounds are:

| Row | Neutral bounds `(left, top, right, bottom)` | Blink bounds | Talking bounds |
| --- | --- | --- | --- |
| Kira | `(48, 30, 323, 334)` | `(48, 30, 323, 334)` | `(48, 30, 324, 334)` |
| Ilya | `(26, 20, 335, 333)` | `(26, 22, 335, 333)` | `(26, 21, 335, 333)` |
| Anton | `(20, 17, 343, 334)` | `(20, 17, 343, 334)` | `(20, 17, 343, 334)` |
| Dima | `(22, 16, 337, 334)` | `(22, 16, 337, 334)` | `(22, 16, 336, 334)` |

Identity, framing, shoulder position and scale were checked visually. These are
three expression keyframes, not a continuous video or a lip-sync system. The
renderer should keep neutral as the resting pose, use brief blinks and restrained
speaking accents, honor pause/reduced-motion, and avoid animating invisible UI.

## Generation prompt

```text
Use case: stylized-concept. Asset type: production transparent portrait sprite atlas for the hand-drawn adult life-sim game «Переписка». The attached Anna walking atlas is STYLE REFERENCE ONLY. Create a NEW portrait-expression atlas, not a copy of Anna. Match its warm sophisticated cartoon drawing: expressive dark ink contours, subtle cel shading, warm restrained colors, friendly believable adults, clear eyes and readable faces. Exactly THREE equal-width columns and FOUR equal-height rows: 12 separated bust portraits, one character per row. Prefer a 1152×1536 canvas (3:4 aspect ratio), four rows of square cells. Every portrait fully contained inside its cell with generous transparent gutters (at least 9% each side), all top of hair at 8% cell height and bust cut-off at 90%; same fixed head anchor, scale, shoulders and camera angle across the three cells within each row. All busts face almost forward, subtly turned toward viewer's right. Same lighting, hair silhouette, clothing and face proportions across each row. Columns from left to right: 1 calm friendly neutral mouth closed and eyes open; 2 exact same pose and face, eyes fully closed in a natural blink, mouth unchanged; 3 same pose and head anchor, eyes open, lips slightly parted in a gentle speaking expression. Only eyelids and mouth/expression change; do not gesture or tilt between frames. Row 1: Kira, fictional adult woman age 25, short dark wavy bob, rose pink blazer over cream top, lively but natural face and small gold earrings; distinct from long-haired Anna. Row 2: Ilya, fictional adult man age 31, medium light-brown wavy hair, mustard shirt, slightly long face, clean-shaven, thoughtful welcoming expression. Row 3: Anton, fictional adult man age 26, short neat brown hair, sage-green shirt, broader face and expressive dark eyebrows, clean-shaven; visibly distinct from Ilya. Row 4: Dima, fictional adult man age 29, tousled ginger hair, light ginger stubble, coral hoodie, friendly soft features, no caricature. These are original fictional adults, not portraits of real individuals. Scene/backdrop: genuinely transparent alpha, no opaque or painted background. No text, letters, names, labels, gridlines, frames, speech bubbles, decorative icons, props, scenery, watermark or fake checkerboard. Do not include Anna. Production sprite atlas, clean alpha, crisp readable lines; preserve the game's warm 2D illustrated style, no 3D rendering, no photorealism.
```

The generator delivered 1086 × 1448 instead of the preferred 1152 × 1536; the
requested 3:4 ratio and exact equal-cell layout are preserved. Runtime coordinates
above describe the actual delivered file.
