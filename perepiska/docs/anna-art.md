# Анна и Макс — персонажи первого дня

Созданы встроенным image generation, 14 ноября 2026. Изображения вымышленные, референсы используются для рисованного стиля проекта.

| Файл | Назначение | Размер | Отображение |
| --- | --- | --- | --- |
| `assets/anna-life-walk.webp` | Ходьба Анны, 25 лет | 1448 × 1086 | 4 столбца × 3 строки, клетки 362 × 362 |
| `assets/max-life.webp` | Макс, 27 лет, встреча после смены | 1024 × 1536 | Одна полная фигура, прозрачный фон |

Оригиналы: `assets/source/anna-life-walk.png`, `assets/source/max-life.png`. Формат WebP сохранён с исходным alpha, quality 90; исходные PNG не изменены.

## Атлас Анны

Строки: 0 — домашний кремовый джемпер, пыльно-розовые брюки и тапочки; 1 — коралловый жакет, тёмные брюки, белые кеды и сумка; 2 — шалфейный жакет, белая рубашка, тёмные брюки, кеды и сумка.

Столбцы: контакт правой ноги, проходящая фаза, противоположный контакт, противоположная проходящая фаза. Все фигуры направлены вправо, влево зеркалятся при отрисовке. Основной непрозрачный контур каждой фигуры лежит внутри своей клетки. Верх приблизительно y=10, стопы y=352–353: опорная линия 97,5% высоты клетки. Не следует обрезать на ожидаемых 96% — использовать фактическую опорную линию.

Анна отличается от прежней Нины: взрослая молодая героиня с длинными каштановыми волнистыми волосами, мягким макияжем, небольшими золотыми серьгами. Выбор одежды меняет её внешний вид; статистические навыки от одежды не зависят.

## Макс

Спокойный современный образ: тёмные волнистые волосы, короткая щетина, приглушённая бирюзовая рубашка поверх светлой футболки, тёмные джинсы, белые кеды. Держит стакан кофе. Основной alpha-контур: x=279..712, y=25..1505. Для спрайта оставлять прозрачные боковые поля; для аватара допустимо кадрирование при отрисовке, без изменения исходника.

## Спецификации генерации

Анна: production transparent 2D game character sprite atlas, exactly 4 columns × 3 rows of equal square cells; hand-drawn dark ink, warm sophisticated cartoon coloring; same adult woman age 25 in every cell, long chestnut wavy hair, expressive eyes, subtle makeup, small gold earrings; full-body three-quarter side view walking right. Four distinct alternating gait phases. Home cream/rose outfit, coral blazer work outfit, sage jacket work outfit. All outfits practical and fashionable, sneakers or slippers, no heels. Genuine alpha; no text, scene, shadows, gridlines, labels or overlapping cells. Style references: `world-walk.webp`, `courtyard.webp`.

Макс: one adult male age 27, same ink illustration world; full-body relaxed three-quarter front angled slightly left, warm shy-amused smile, brown eyes, tousled chestnut hair and short stubble; muted teal overshirt, cream T-shirt, charcoal jeans, off-white sneakers, simple watch; one hand in pocket, other holds coffee. Transparent alpha, no scene/text/borders. Style reference: `anna-life-walk.webp`.
