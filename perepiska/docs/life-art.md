# Квартира первого дня

- Игровой файл: `assets/apartment.webp`, 1499 × 1049, RGB, 402 412 байт.
- Исходник: `assets/source/apartment.png`.
- Создан встроенным генератором изображений; затем выполнено только преобразование PNG → WebP (quality 90), без правки композиции.
- Референс стиля: `assets/courtyard.webp`. Это новая интерьерная локация, а не правка двора.
- В изображении нет персонажей, интерфейса и осмысленных надписей.

## Пространство для игры

Фон растягивается в систему координат 1000 × 700. Эти точки обозначают положение ног у объекта, а не центр самого предмета; окончательный граф закреплён в модуле движения.

| Объект | Рекомендуемая точка подхода |
| --- | --- |
| Кровать | 300, 320 |
| Кухня | 745, 325 |
| Шкаф и зеркало | 220, 610 |
| Диван / кофейный столик | 390, 540 |
| Рабочий стол с планшетом и сумкой | 600, 520 |
| Входная дверь | 880, 540 |
| Свободный центр | 490, 450 |

У балкона оставлен небольшой свободный участок. Для накладных декоративных предметов подходят ориентировочно 140,300 и 180,300; размеры предметов следует проверить в игре, чтобы не перекрыть кровать и диван.

## Финальный запрос генератору

Use case: stylized-concept. Asset type: finished 2D game environment/background, landscape 1536×1024. The attached courtyard is a STYLE REFERENCE ONLY, not an edit target. Create a completely new cozy, fashion-conscious studio apartment for a 25-year-old adult female heroine on the morning of her first workday. Match the reference's expressive hand-ink contours, warm watercolor/gouache coloring, sophisticated cartoon style, cream/coral/sage palette and lived-in details; no photorealism, no 3D rendered look. Camera: roofless cutaway apartment, viewed slightly from above and from the front, the entire room and its large open walkable floor visible. No ceiling or front walls obscuring the floor. Make it a real playable room rather than a crowded decorative dollhouse. Keep all central walkways broad and visibly clear. Lay out the scene on an imaginary 1000×700 canvas: bed against upper-left/back wall with accessible foot position near (220,430); wardrobe plus tall gold-edged mirror to the left foreground with accessible floor near (175,590); compact sage kitchen on upper-right/back wall with counter access near (745,325); small dining/work table at right foreground with floor access near (650,535), with an unbranded tablet and small shoulder bag on table; entrance door on the far right with accessible threshold near (880,540); small pink couch towards middle-left with access near (390,540); generous continuous open wood flooring around center (490,450). Bright small balcony/window on left, gentle morning sunlight across floor. Subtle glamorous details: curved gold mirror, pink textiles, small cosmetics tray, neat clothes rail, two fashion books with blank/unreadable covers. Leave a visibly empty little decor corner near the left window for a later plant/lamp purchase; no plant or floor lamp in that empty corner. Apartment should feel charming and attainable, not a mansion. Furniture never seals walkways. No people, no animals, no characters, no labels, no writing, no HUD, no UI, no numbers, no watermark. Render a crisp full-bleed illustration.
