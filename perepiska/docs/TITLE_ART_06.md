# Обложка «Переписки» — пилот 0.6

17 ноября 2026 года.

Создана отдельная сюжетная иллюстрация для полноэкранного стартового меню. Использован встроенный генератор изображений ChatGPT. Три изображения проекта служили референсами внешности и рисунка: стартовый экран с Аней, `max-life.webp`, `team.webp` (Вера справа).

## Файлы и проверка

- `assets/source/title-cover06.png` — исходная генерация, 1672 × 941 px, RGB.
- `assets/title-cover06.webp` — рабочая версия того же размера, WebP без потерь. Декодированные RGB-пиксели побайтно совпадают с исходником.
- Апскейл, повышение резкости и перерисовка кодом не применялись.
- Название и управление не встроены в растр: они реализуются доступными HTML-элементами поверх обложки.

## Композиция

Аня держит телефон, Макс предлагает кофе, Вера стоит рядом с планшетом. Персонажи образуют сюжетную группу справа. Слева — спокойная освещённая стена, место для названия и реальных кнопок. Основная область текста: примерно x8–34%, y14–64%. Все лица сохранены внутри кадра.

Пасхалки: табличка «12» у подъезда, два стаканчика кофе, растение на скамейке и ракета на сумке Ани. Нормализованные центры: номер (39%,27%), растение (41%,70%), ракета (47%,81%), кофе (70%,52%)/(87%,56%). При `object-fit:cover` координаты нужно пересчитать относительно видимой композиции.

## Промпт

```text
Use case: illustration-story.
Asset type: polished commercial illustrated game key art, full-screen title background, landscape 16:9, ideally 2560x1440 or highest available crisp resolution.
Primary request: generate a brand-new story cover for the Russian life-simulation game «Переписка». Use attached images ONLY as character identity and drawing-style references, never copy their screen layout. Image1: Anna's exact modern face, long chestnut wavy hair, sage jacket, white blouse, charcoal wide-leg trousers, tan crossbody bag. Image2: Max's exact identity, chestnut wavy hair, friendly dark eyes and light stubble, teal overshirt, cream T-shirt, no glasses. Image3: Vera is the older curly blonde woman at the right; only use her identity and lilac/pink clothing. Do not add the woman with glasses.
Scene: a lush residential courtyard with warm peach and cream apartment buildings, a curved path, a flowering tree, and a welcoming entrance. Golden afternoon light, inviting everyday adventure, warm romantic comedy energy, rich depth, premium handmade editorial illustration.
Composition: the LEFT 38–40% is a quiet sunlit cream plaster façade flowing naturally into pale sky and the courtyard, elegant usable negative space for a separately typeset title and real play controls. It must still feel like the illustrated world, not a blank UI rectangle. No faces, props, lettering, or contrast-heavy details in the left central title/control area. Frame top edge with sparse soft foliage, subtle architectural depth at far left. Three heroes occupy the RIGHT 58%, striking asymmetric triangular story composition, not a lineup or three isolated stickers.
Anna is the dominant foreground figure at x~61%, shown from head to knees, long hair catching a breeze, gold hoop earrings, sage jacket, white blouse, charcoal trousers, tan crossbody bag. She holds her smartphone low near her waist and looks warmly toward Max with a slightly playful smile. Max at x~84%, head to knees, offers Anna one takeaway coffee while holding his own cup in the other hand; friendly romantic chemistry, lively natural gesture, perfectly drawn anatomically plausible hands. Vera at x~73%, a little behind them, short blonde curls, older fuller face and figure, lilac cardigan, pale pink blouse, brown trousers, holding a census tablet/clipboard with a pleased encouraging expression. Keep all three faces, hair and bodies within the frame, including Max's right shoulder, no edge cropping.
Story easter eggs, small but clean: entrance number 12 on a modest plaque; two takeaway cups in Max's hands; a small thriving potted plant on the courtyard bench; a tiny tasteful rocket sticker on Anna's bag as a nod to a space-game companion project. Smartphone/tablet screens show only simple abstract form lines, no text.
Style: match the references' adult charming cartoon character design, confident dark hand-inked contours, beautiful hair shapes, expressive faces, warm watercolor/gouache shading, restrained paper texture, detailed but clean architecture. Upgrade to spectacular finished store-cover quality, crisp edges, no pixelation, no blurry faces, no excessive grain. Preserve recognizable character identities, wardrobe and proportions. No 3D, no anime, no photorealism, no childish chibi.
No title, logo, words, subtitle, letters, watermark, border, frame, mockup, panels, interface, chat bubbles, or buttons baked into this image. Only small entrance number 12 is allowed. The UI will be implemented separately. Deliver an actual standalone panoramic illustration.
```

