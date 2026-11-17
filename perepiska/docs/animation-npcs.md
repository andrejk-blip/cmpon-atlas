# Анимационные атласы Веры и Макса

Созданы встроенным генератором изображений, затем выполнено только форматное преобразование PNG → WebP (quality 92, method 6). Старые активы не заменены. Оба файла предназначены для непосредственного подключения в игру.

## Спецификация

- Размер каждого атласа: **1448 × 1086**, RGBA.
- Сетка: **4 колонки × 3 ряда**, одинаковые клетки **362 × 362**.
- Чтение кадров: слева направо, сверху вниз, нумерация 0–11.
- Кадры 0–7: спокойная ходьба вправо в три четверти; 8–11: нейтральная стойка, дыхание, моргание и возврат в нейтральную стойку.
- Вера — та же старшая наставница из третьего ряда world-walk.webp: короткие светлые кудри, золотые серьги, сиреневый кардиган, розовая рубашка, коричневые брюки, светлая сумка. Макс — тот же взрослый мужчина из max-life.webp: волнистые каштановые волосы, лёгкая щетина, зелёно-бирюзовая рубашка, кремовая футболка, тёмные джинсы и светлые кеды. Очков у Макса нет. Стакан кофе сохранён.
- Тени, подписи, номера и линии сетки отсутствуют. Фон имеет настоящий alpha.

## Фактическая регистрация

Сетка ровная, но генератор не выдержал единую запрошенную опору 92% во всех строках. Используйте фактический footY каждого кадра ниже; единая опора приводит к скачку Веры при переключении walk → idle. Bounds измерены по alpha > 128 и записаны как [left,top,right,bottom], правая/нижняя границы исключающие, координаты **внутри клетки**. Это измерение основного силуэта, не обрезка исходника. Сохраняйте постоянный масштаб; не нормализуйте каждый силуэт независимо по высоте.

```json
{
  "vera": {
    "file": "assets/vera-motion.webp",
    "source": "assets/source/vera-motion.png",
    "size": [
      1448,
      1086
    ],
    "bytes": 416284,
    "grid": [
      4,
      3
    ],
    "cell": [
      362,
      362
    ],
    "footY": [
      346,
      346,
      346,
      346,
      345,
      345,
      345,
      345,
      336,
      336,
      336,
      336
    ],
    "bounds": [
      [
        93,
        38,
        282,
        346
      ],
      [
        117,
        38,
        269,
        346
      ],
      [
        120,
        38,
        280,
        346
      ],
      [
        107,
        38,
        283,
        346
      ],
      [
        98,
        38,
        282,
        345
      ],
      [
        120,
        38,
        270,
        345
      ],
      [
        105,
        38,
        257,
        345
      ],
      [
        106,
        38,
        279,
        345
      ],
      [
        116,
        32,
        254,
        336
      ],
      [
        117,
        32,
        254,
        336
      ],
      [
        117,
        32,
        252,
        336
      ],
      [
        117,
        32,
        257,
        336
      ]
    ]
  },
  "max": {
    "file": "assets/max-motion.webp",
    "source": "assets/source/max-motion.png",
    "size": [
      1448,
      1086
    ],
    "bytes": 301996,
    "grid": [
      4,
      3
    ],
    "cell": [
      362,
      362
    ],
    "footY": [
      343,
      343,
      343,
      341,
      342,
      343,
      343,
      342,
      346,
      346,
      346,
      346
    ],
    "bounds": [
      [
        102,
        19,
        277,
        343
      ],
      [
        117,
        19,
        238,
        343
      ],
      [
        140,
        19,
        232,
        343
      ],
      [
        107,
        19,
        284,
        341
      ],
      [
        98,
        19,
        289,
        342
      ],
      [
        131,
        20,
        233,
        343
      ],
      [
        126,
        20,
        232,
        343
      ],
      [
        107,
        20,
        288,
        342
      ],
      [
        141,
        19,
        234,
        346
      ],
      [
        141,
        19,
        234,
        346
      ],
      [
        141,
        19,
        234,
        346
      ],
      [
        141,
        19,
        234,
        346
      ]
    ]
  }
}
```

## Проверки изображения

- Обе сетки делятся на 4 × 3 без остатка; все основные силуэты целиком находятся в клетках, соседние персонажи не пересекаются.
- У Веры сохранён возраст и округлое телосложение, у Макса исправлено первоначально неверное направление взгляда/шага.
- У Веры исправлены высокие маршевые колени: шаги стали низкими, руки расслаблены. Idle-ряд имеет обе ноги на земле и не повторяет шагающую позу.
- У Веры 45.54% пикселей имеют alpha=0 и 77.1% — alpha<8; у Макса 72.01% имеют alpha=0 и 84.07% — alpha<8. Слабый цветной шум в почти прозрачных краях оставлен как выдал генератор; ярко-красные пиксели имеют alpha не более 2/255, непрозрачных красных пикселей нет.
- Атласы проверены визуально и измерением RGBA. Плавность окончательного цикла зависит от времени кадров и опор в игровом рендерере и должна проверяться в интеграции.

## Запросы генерации

### Вера — исходный запрос

Use case: identity-preserve. Asset type: production 2D character animation atlas, truly transparent RGBA, 4 columns by 3 rows, 12 equal square cells, overall 4:3 landscape. Reference image is a character sheet containing three women: use ONLY THE THIRD / BOTTOM ROW, Vera, the older round-bodied blonde mentor. Do not use the younger first two women. Strictly preserve Vera's identity: older adult, friendly round face, short curly pale-blonde hair, gold round earrings, lilac cardigan over pale pink collared blouse, dark brown wide-leg trousers, dark flat shoes and small cream shoulder bag. Match exactly the warm hand-ink cartoon linework and soft color shading of the reference. No rejuvenation, no thinner new woman, no costume changes.
Create one consistent Vera in all 12 cells, full body including complete shoes, three-quarter view facing RIGHT, constant body scale and camera. Every cell has the exact same invisible anchor: pelvis horizontally centered; grounded shoe baseline at 92% of cell height. Leave safe blank margins on every side. Transparent empty background; absolutely no floor shadow, no foot oval, no scenery, no labels, no grid lines.
Cell reading order left-to-right then down:
row 1 = WALK 1 left-foot forward contact; WALK 2 weight/down absorption on that left foot with trailing right heel beginning lift; WALK 3 right foot passing under the body with support leg straight, very small knee lift; WALK 4 right leg beginning forward reach, left heel rising.
row 2 = WALK 5 right-foot forward contact, genuinely opposite arm and leg arrangement to frame 1; WALK 6 weight/down absorption on right foot with trailing left heel lift; WALK 7 left foot passing underneath with right supporting; WALK 8 left leg forward reach preparing frame 1.
Walking must look like a calm older adult walking on level ground, modest short strides, low foot clearance, restrained counter-swinging arms, not marching or running. Her body and head remain level with only tiny 1–2px vertical changes. Eight distinct sequential phases of a smooth two-step cycle, no duplicated alternating poses.
row 3 = IDLE 1 neutral relaxed standing with both feet comfortably planted; IDLE 2 same planted feet and stance with very subtle breathing in chest; IDLE 3 same pose with a brief natural blink; IDLE 4 settle back to neutral, tiny hand relaxation. Idle feet must stay in exactly the same position; idle is NOT another walking stride. All twelve frames must be completely separate inside their own equal cell, aligned consistently. No text or numbers.

### Вера — целевая коррекция

Edit this Vera animation atlas, preserving EXACTLY the same older round-bodied blonde woman, lilac cardigan, pale pink shirt, brown trousers, cream shoulder bag, face and ink style. Preserve the 4-column by 3-row transparent grid and all 12 complete characters. Correct ONLY animation posing, spacing and foot registration. Reduce each character's scale slightly so her top is 8% below cell top and grounded soles are at 92% cell height, with blank margin underneath. First two rows must be a coherent EIGHT-FRAME calm walk to SCREEN RIGHT. The existing high bent knees look like marching; remove that. Passing feet clear the floor by only a few pixels, both knees never rise above the opposite ankle. Keep body level. Row1: frame1 left foot forward, RIGHT arm forward, left arm back; frame2 left weight absorption with bent supporting knee and low trailing right heel; frame3 right foot passing beside left ankle, LEFT arm moving forward; frame4 right foot extending forward low near ground, LEFT arm forward. Row2: frame5 RIGHT foot forward, LEFT arm forward (visibly opposite arm/leg silhouette to frame1); frame6 right supporting knee soft, trailing left heel low; frame7 LEFT foot passing beside right ankle, RIGHT arm moving forward; frame8 left leg reaching forward low to ground, RIGHT arm forward. These eight drawings must be visibly different sequential phases; row2 must not repeat row1. Keep hands open and relaxed, no raised clenched fists or running pose. Third row must remain four true idle poses: both feet planted in exactly the same positions, arms naturally relaxed, neutral/breathe/blink/settle. No floor shadows, no floating toe marks, no detached artifacts, no text, no visible grid. True transparency.

### Макс — исходный запрос

Use case: identity-preserve. Asset type: production 2D character animation atlas, truly transparent RGBA, 4 columns by 3 rows, 12 equal square cells, overall 4:3 landscape. Use the attached Max image as exact identity and outfit reference. Max is a 27-year-old adult man: wavy swept brown hair, warm expressive face, light short stubble, no glasses, teal/sage-green open overshirt with rolled sleeves over cream T-shirt, charcoal loose jeans, cream/white sneakers, simple watch. Preserve his same face, proportions, clothes, warm hand-drawn ink illustration style, line weight and shading. Keep a small plain takeaway coffee cup upright in one hand throughout; the other arm can gently counter-swing. Do not add eyewear, bag, logos or change his age.
Create the SAME full-body Max in every cell, including complete shoes, three-quarter view facing RIGHT. Constant camera, scale, body proportions and lighting. Same invisible anchor in every cell: pelvis horizontally centered; grounded shoe baseline at exactly 92% of cell height. Generous clear margins. True transparent empty background. No floor shadows, no foot oval, no labels, no numbers, no grid lines.
Frames in reading order left-to-right then down:
row1 = WALK 1 left-foot-forward contact; WALK 2 relaxed weight/down absorption on left foot, trailing right heel beginning lift; WALK 3 right foot passing under body with little knee lift; WALK 4 right leg reaching forward and left heel rising.
row2 = WALK 5 right-foot-forward contact with genuinely opposite legs to frame 1; WALK 6 weight/down absorption on right foot with left heel lifting; WALK 7 left foot passing beneath body; WALK 8 left leg reaching forward preparing next cycle's first contact.
Eight distinct progressive animation drawings, smooth calm adult walk on level ground, moderate short natural steps, very low foot clearance, no jumping, no exaggerated knee lift, no running. Keep head and torso level; tiny breathing shifts only. Coffee hand remains stable while free arm moves naturally.
row3 = IDLE 1 relaxed upright standing with both feet planted together comfortably; IDLE 2 same planted stance with tiny breathing motion; IDLE 3 same exact stance with a natural eye blink; IDLE 4 settling back to neutral with a small relaxed hand adjustment. Keep idle foot positions identical. Idle poses must NOT contain walking strides. All 12 complete figures fit safely within equal square cells. No text, no added objects or decorative graphic elements.

### Макс — целевая коррекция

Edit this Max sprite atlas while strictly preserving the same 27-year-old brown-haired lightly stubbled man, open teal overshirt, cream T-shirt, charcoal jeans, white sneakers, watch, coffee cup, facial identity and hand-ink rendering. Preserve the 4-column by 3-row equal-square grid and transparent background. IMPORTANT CORRECTION: all characters must face and walk towards SCREEN RIGHT, with the NOSE on the right side of the face silhouette and forward foot travelling towards the RIGHT edge. The current sheet faces left; reorient the person in every cell, not the layout order. Keep the coffee cup steady in the hand. First two rows must form eight distinct sequential calm walking phases: left-foot-contact, down, passing, up/reach, opposite right-foot-contact, down, opposite passing, up/reach, in reading order. Grounded feet share baseline 92% of each cell, with 8% blank space beneath. Make bodies smaller inside cells so full shoes and hair have a safe blank margin. Modest steps, low foot lift, no running and no bouncing. Row3 stays four idle poses with exactly stationary planted feet: relaxed neutral, subtle breathing, natural blink, settle. No floor shadow, no detached pixels around feet, no text or grid lines. True transparent RGBA background.
