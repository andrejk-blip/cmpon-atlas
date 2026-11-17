# Анимация прохожих — 17 ноября 2026

Два самостоятельных атласа подготовлены встроенной генерацией изображений (built-in imagegen), затем сохранены в PNG и WebP без изменения рисунка. Прежний `residents-walk.webp` не заменён.

## Персонажи

- `resident-1`: Николай, седые волосы и усы, горчичный вязаный жилет, светлая рубашка, коричневые брюки и туфли.
- `resident-2`: Денис, тёмные волосы и короткая борода, свитер цвета морской волны, джинсы, светлые кеды.

Исходный `assets/residents-walk.webp` использован как референс внешности. У каждого персонажа был один целевой повтор генерации: убраны высокое поднимание коленей и «бегущие» согнутые руки. Одежда, лицо и рисованный стиль сохранены.

## Формат и интеграция

| Атлас | Размер | Сетка / клетка | WebP | PNG |
| --- | --- | --- | --- | --- |
| `assets/resident-1-motion.webp` | 1448 × 1086 | 4 × 3 / 362 × 362 | 295200 B | 1163745 B |
| `assets/resident-2-motion.webp` | 1448 × 1086 | 4 × 3 / 362 × 362 | 262610 B | 981846 B |

Оригиналы: `assets/source/resident-1-motion.png`, `assets/source/resident-2-motion.png`. WebP использует quality 90, method 6. Alpha измерен: диапазон 0–255 у обоих файлов; фон прозрачен.

Порядок — построчно слева направо:

- Кадры 0–7: ходьба вправо в ракурсе 3/4.
- Кадры 8–11: спокойная стойка, небольшое движение плеч и головы; кадр 10 с закрытыми глазами.
- Для движения влево лист допускает отражение в отрисовке.

Запрошенная в генерации опора 94% фактически получилась около 97,5%. Не использовать 94% в renderer без поправки: персонаж будет висеть над землёй. Николай — нижний видимый пиксель в клетке y=349..352, Денис y=350..354. Метаданные по каждому кадру лежат в `animation-residents-metadata.json`: `alphaBox`, `footY` (правая/нижняя границы exclusive), `headCenterX`. Измерение выполнено при alpha >64. Центр головы пригоден для проверки горизонтального дрожания; он не является физической точкой опоры.

Визуальная проверка подтвердила 12 отдельных полных фигур, отсутствие соседних персонажей в клетках, спокойную стойку и видимое моргание. Некоторые фазы двух половин шага остаются сходными по силуэту, поэтому окончательный темп, переход walk/idle и устойчивость стоп следует оценивать в работающем renderer, а не по одному листу.

## Запросы генерации

### Николай — первоначальный запрос

Use case: identity-preserve.
Asset type: production 2D game character animation sprite sheet, exactly 4 columns by 3 rows, twelve equally sized square cells, landscape 4:3 canvas, genuinely transparent alpha background.
Reference image: ONLY the older grey-haired moustached man in the FIRST ROW is the identity reference. Ignore the other two people. Preserve his warm hand-inked storybook style, friendly round face, swept silver hair, big grey moustache, cream shirt with rolled sleeves, ochre mustard cable-knit vest, brown trousers and brown shoes.
Create Nikolai alone repeated twelve times. Every sprite faces three-quarter RIGHT, full body. Constant proportions and drawing scale, head centre consistent, feet at 92% cell height, generous transparent space around each figure. No grids, labels, text, ground, shadows or environment. No overlap between cells.
First eight cells, read row-major: a complete slow natural walking cycle in place with TWO alternating steps. 1 right heel contacts forward, left toe behind; 2 weight lowers onto right foot and left heel lifts; 3 left leg passes the planted right leg, left knee only slightly lifted; 4 left heel reaches forward while right heel lifts; 5 LEFT heel contacts forward and right toe trails (opposite of frame 1); 6 weight lowers onto LEFT foot; 7 RIGHT leg passes the planted left leg; 8 right heel reaches forward into frame1. Counter-swing arms, elbows relaxed, torso stable, slight shoulder movement. Natural heel-to-toe contact, not marching or running. The planted foot meets the same baseline. Make the individual inbetween poses visibly different and the cycle smooth; DO NOT just repeat four silhouettes twice.
Last row: 9 neutral standing with BOTH feet resting and arms down, 10 subtle inhale chest and shoulder rise with both feet unchanged, 11 soft blink (eyes closed) and tiny friendly smile, 12 neutral settle smoothly returning to9. Last four sprites feet stay in exactly the same locations and torso stays upright.
Keep all twelve complete figures fully inside their cells, including hair and shoes. Clean strong outlines and soft warm painted colour, retain the character's identity across every frame.

### Николай — целевая коррекция

Edit the supplied twelve-frame sprite sheet. Preserve the SAME friendly older grey moustached man, his face, hairstyle, mustard knit vest, cream rolled-sleeve shirt, brown pants/shoes, clean inked watercolor style, genuine transparency, and exact 4-column by 3-row layout. Preserve the last four idle poses.
CRITICAL FIX: the first two rows currently repeat the same exaggerated four marching silhouettes. REPLACE all eight walking poses with EIGHT SMALL, GRADUALLY CHANGING INBETWEEN POSES of one normal relaxed continuous walk, low knees. Walking legs should be mostly below the hips, never lifted halfway to waist. Hands are relaxed, arms swing with straightish elbows, not pumping as if jogging.
Row 1 is the first half of a cycle: 
cell1 RIGHT leg forward heel strikes, LEFT leg trailing;
cell2 RIGHT leg planted directly under front hip, left toe leaving rear ground, body lowers 2%;
cell3 RIGHT support leg vertical, LEFT foot swings just above floor beside it, legs nearly parallel;
cell4 RIGHT support leg behind hip, LEFT leg extending halfway forward with relaxed knee.
Row 2 is the opposite half, visibly swapping near/far legs:
cell5 LEFT leg forward heel strikes, RIGHT trailing;
cell6 LEFT leg planted under front hip, RIGHT toe leaves rear floor, body lowers 2%;
cell7 LEFT support leg vertical, RIGHT foot swings just above floor, legs nearly parallel;
cell8 LEFT support leg behind hip, RIGHT leg extends halfway forward.
Keep all heads SAME size and location, with very small vertical body motion only. Every figure in a consistent cell and same scale. Leave clear transparent margins at every cell edge. Baseline should be at 94% of each cell, with transparent pixels below shoes. Full figures, no cropping. No text, grids, shadows or background. Smooth professional walk-cycle asset, not a collage of walking cartoons.

### Денис — первоначальный запрос

Use case: identity-preserve. Production transparent sprite atlas for a 2D illustrated life simulation game.
Input image1 is CHARACTER reference: use ONLY the young dark-haired bearded man from its SECOND ROW. Preserve his exact friendly face, short tousled dark brown hair, dark short beard, teal long-sleeve sweater, blue denim jeans and cream sneakers. Ignore the elderly man and woman.
Input image2 is LAYOUT and ANIMATION reference only. Replace that old man in every cell with this young man Denis, preserving its 4 equal columns × 3 equal rows and in-place proportions. Exact twelve full-body frames on a genuinely transparent landscape 4:3 canvas. No background, ground, shadows, text, lines or cell borders.
All poses face three-quarter RIGHT, consistent size and identity. Keep feet baseline at 94% of each square cell, transparent margin below shoes, equal transparent margins on left/right/top. Never crop hair or footwear.
Rows1–2 are eight distinct phases of ONE complete smooth relaxed walking cycle, TWO alternating steps; low natural knees, no marching or jogging, no giant strides. Arms relaxed and counter-swing, elbows not pumped. Read row-major: right heel contact; weight down on right with left toe leaving ground; left foot passing just above ground beside right support leg; left leg half extending forward; LEFT heel contact with RIGHT trailing; weight down on LEFT; RIGHT foot passing beside left support; right half extending forward to loop into first. The two half cycles should visibly swap which arm and leg lead. No repeated four-frame sequence. Do not stretch body proportions between cells.
Last row four idle frames with both feet resting on fixed spots and arms comfortably down: neutral; subtle inhale; soft blink with eyes closed and small smile; settle. Small movements only.
Retain the refined hand-drawn ink outline and softly painted warm colour of the character reference. Clear animation production asset, no stickers, no halo.

### Денис — целевая коррекция

Edit this 4-column × 3-row sprite sheet while preserving the exact young man Denis, his face, dark hair and beard, teal sweater, blue jeans and cream sneakers, and genuine transparency.
The walking poses in first eight cells currently march with high bent knees and pumping arms. Replace them with a RELAXED NATURAL SMALL-STEP WALK with STRAIGHTER LEGS and LOWER ARMS. Walking foot lifts no more than the height of one shoe off the ground. Elbows mostly extended, hands open and relaxed. No high knees or clenched fist running posture.
Top row: frame1 forward right heel / trailing left toe; frame2 slight bend in planted right knee, left heel starts rising; frame3 left foot just clearing the floor next to vertical right support leg, nearly parallel legs; frame4 left leg gently reaching forward, right behind.
Middle row: frame5 forward LEFT heel / trailing right toe; frame6 slight bend planted left knee, right heel rises; frame7 right foot just clearing floor beside vertical left leg; frame8 right leg gently reaching forward. Swap the visible near/far arms and legs between the two rows. These are consecutive evenly spaced inbetweens, not four repeated running silhouettes.
Keep the last row of four idle standing and blinking frames, with both feet down. Keep identical scale and facial identity for all twelve figures. 4×3 equal square cells, constant baseline, leave 6% transparent padding below shoes and above hair in each cell. No shadows, no text, no labels, no grid, no background.

