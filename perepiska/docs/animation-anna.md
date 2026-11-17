# Анна: расширенные циклы движения

Дата: 17 ноября 2026. Три новые production-полосы созданы встроенным image generation с сохранением персонажа из `assets/anna-life-walk.webp`. Старый атлас и код не менялись.

## Контракт файлов

| Образ | WebP | Оригинал PNG |
| --- | --- | --- |
| Домашний | `assets/anna-home-motion.webp` | `assets/source/anna-home-motion.png` |
| Коралловый | `assets/anna-coral-motion.webp` | `assets/source/anna-coral-motion.png` |
| Шалфейный | `assets/anna-sage-motion.webp` | `assets/source/anna-sage-motion.png` |

Все листы: 1448 × 1086, сетка 4 × 3, клетки 362 × 362. Формат RGBA с реальной прозрачностью; WebP quality 92, method 6. Оптимизация меняет только формат/сжатие, не рисунок.

| Образ | Вес WebP, байт | Верх WALK, px | Стопы WALK, px | Стопы IDLE, px |
| --- | ---: | ---: | ---: | ---: |
| Home | 316690 | 41–42 | 332–333 | 334 |
| Coral | 280312 | 39–40 | 332–334 | 333 |
| Sage | 279458 | 39–40 | 334 | 335 |

Стопы в таблице — нижняя эксклюзивная граница alpha-bbox внутри клетки, то есть опорный пиксель расположен на единицу выше. У всех файлов alpha содержит значения 0 и 255.

Кадры нумеруются с нуля слева направо, сверху вниз:

| Кадры | Цикл | Фазы |
| --- | --- | --- |
| 0–3 | WALK, первая половина | contact → down → passing → up |
| 4–7 | WALK, вторая половина | противоположный contact → down → passing → up |
| 8–11 | IDLE | нейтральная стойка → вдох → моргание → успокоение |

Направление — три четверти вправо. Для движения влево зеркалить при отрисовке. У idle ноги и руки не принимают позу шага: стопы стоят на месте, руки опущены, в кадре 10 глаза закрыты. Не прокручивать idle с тем же темпом, что шаги; моргание должно быть коротким между более долгими нейтральными кадрами.

## Проверка геометрии

После первой пробы выполнена одна целевая коррекция геометрии: добавлены поля, уменьшено поднятие коленей, выровнены масштаб и опорная линия. Затем coral/sage получены по той же геометрии поз, с заменой только одежды.

Основной контур измерялся по alpha > 127, чтобы не включать почти прозрачные пиксели сглаживания. На домашнем листе верх WALK y=41–42, стопы y=332–333; IDLE верх y=40, стопы y=334. Нормализованная опорная линия около 0.92. Для всех листов использовать размеры реального файла и одинаковую геометрию клетки, а не прежние 97.5% старого атласа.

В полном цикле есть небольшие рисованные изменения силуэта, волос, рукавов и сумки. Это покадровый рисованный атлас, не скелетный риг; окончательный темп и привязку шага к пройденному расстоянию проверять в игре.

## Точные промпты

### Home — первая проба

Use case: identity-preserve. Production 2D game animation sprite atlas. Keep EXACT Anna identity from reference first/toprow: same adult25face, longwavychestnuthair, smallgoldearrings, creamknitjumper, dustyrose loungepants, creamslippers. Improve animation anatomy without redesigning her. Handdrawn expressive darkink, warmcartoon shading exactlyreference. ONE outfitonly, no bag. Layout EXACT4columns ×3rows equalSQUAREcells, landscape4:3. Twelvefullbodyfigures in rowmajor order. Eachbodycenter samehorizontalposition initscell; hairtop around10%cellheight; contactfootbottom precisely92%cellheight, noobjectextendsbeyond95%; generouspadding betweenfigures. Consistentcharacterheight&face. ALL facingthreequarterRIGHT. Row1frames1-4 = smoothnaturalWALK firsthalf: 1rightheelcontactinfront,lefttoebehind,armsopposite; 2weightdropsontoRIGHTfoot,bothkneesgentlybend,leftheelraises; 3LEFTlegpassesclosebytheplantedRIGHTleg,armsnearmidpoint; 4bodyrisesonRIGHTtoe,LEFTfootmovesforwardlow,armscontinue. Row2frames5-8 = correspondingoppositehalf: 5LEFTheelcontactinfront,RIGHTtoebehind,armsoppositeframe1; 6weightdropsontoLEFTfoot,rightheelraises; 7RIGHTlegpassesclosebyplantedLEFTleg; 8bodyrisesonLEFTtoe,RIGHTfootforwardlow,readytolandframe1. These8framesmustvisiblydiffer,no repeatedposes, a complete8phasewalkcycle. WALKcalmnaturaladultstride, NOTmarching, NOhighknees, NOrunning, feetstaycloseground; subtlebob,counter-swingarms, hairlagsmotiongently. Row3frames9-12 = standingIDLEcycle, bothfeetplantedsidebysideONTHESAMEpositionsall4frames, armsrelaxeddown, notwalking: 9neutralpleasantlook; 10gentleinhaleslightchestlift; 11BLINKeyesclosed; 12relaxedsettle. Keepstationaryidlefootplacementandcenter. Genuine transparentalpha background. NOscene, NOgroundshadow, NOfloor, NOcheckerboard, NOtextnumbersorlabels, NOgridlines,borders,UI. Nevercrophead/hands/feet oroverlapcells. Cleanproductionedges.

### Home — выбранная коррекция

Edit this production animation sprite sheet. Preserve Anna's exact face, hair, cream knit top, dustyrose pants, slippers, ink drawing style and the EXACT4columns×3rowsequal-squarecell grid. Correct ONLY production alignment and the WALK poses. In everycell shrinkfigure uniformly enough that hairtop is10%cellheight and plantedfootbottom92%cellheight. Allfigures samephysicalheight; fixedcenterx50%, noframecrossing, widepadding. Preserve natural veryslightverticalbodybob. Toprow fourposes firsthalf ofnormalwalkingright: contact(rightfootforward/leftarmforward), down(weightonright,bothkneesslightlybend), passing(leftfootpassesrightclosetoground,armsbesidetorso), up(rightheelraised,leftfootlowreachingforward). SECONDrow MUST be the OPPOSITEhalf: contactLEFTfootforward and RIGHTarmforward (bothlimbsvisiblyoppositefromtoprowcontact); downweightonLEFT; passingRIGHTfootpassesleft; upLEFTheelraisedRIGHTfootlowforward. NOTjogging,marching, highknees; feetneverliftmorethanankleheight. Nearleg/farlegoverlapchangescorrectly. Armsoppositemovinglegs. Retain the bottomrow fourstationaryIDLEs: relaxedarmsdown, bothfeetplantedunchanged; neutral, gentleinhale, eyesclosedblink, settled. Bottomrowfaceandbodyscaleexactlymatchwalkingrows. KeepaquietwarmpleasantadultAnnaexpression. NOnewcharacters,outfits,objects,labels,gridlines,text,scene,drop-shadowsorfloor. Output genuine transparent alpha withcleanedges, nohalo. EXACT4×3grid, samecanvassize.

### Coral

Use case: identity-preserve. Production2Danimation spriteatlas. Image1 is the exact target grid/animation/identity; image2 is only clothing reference. Keep exact Anna adult25 identity, face, longwavychestnuthair, goldearrings, inkstyle, scaleandcellplacement. Keep the4columns×3rows grid, sameimage4:3, all12fullfigures, transparentalpha. Top8frames are eight successiveWALKphases withalternatinglegweight (row1rightlegcontact/down/passing/up,row2oppositeleftlegcontact/down/passing/up); bottom4frames areSTATIONARYIDLE neutral/breath/blink/settle,bothfeetfixedandarmsrelaxeddown. Preserve eachdifferentpose, allfaces/hairexceptidleblink; nohighknees/running. Maintain hairtoparound10% andsupportfootbottom92%ineachcell; samecenterscaleandbaseline, allfiguresinsidecellswithpadding. Theonlyintentionalchange is clothing as follows: coral shortblazer overcreamtop, darknavystraighttrousers,white sneakers andsmalltan crossbodybag, EXACTmiddle-rowoutfit ofimage2. Preserve smalltanleathercrossbodybag atsamehip in EVERYframe, strapstaysdiagonallyontorso; bagtinyinertiallagonlynotdeforming. Clothesfollowexactanatomicalposes. Cleaninkoutlinesandwarmflatshadingconsistentreference. No text,numbers,labels,gridlines,scene,floor,shadows,borders, paintedcheckerboard. Genuinealpha.

### Sage

Use case: identity-preserve. Production2Danimation spriteatlas. Image1 is the exact target grid/animation/identity; image2 is only clothing reference. Keep exact Anna adult25 identity, face, longwavychestnuthair, goldearrings, inkstyle, scaleandcellplacement. Keep the4columns×3rows grid, sameimage4:3, all12fullfigures, transparentalpha. Top8frames are eight successiveWALKphases withalternatinglegweight (row1rightlegcontact/down/passing/up,row2oppositeleftlegcontact/down/passing/up); bottom4frames areSTATIONARYIDLE neutral/breath/blink/settle,bothfeetfixedandarmsrelaxeddown. Preserve eachdifferentpose, allfaces/hairexceptidleblink; nohighknees/running. Maintain hairtoparound10% andsupportfootbottom92%ineachcell; samecenterscaleandbaseline, allfiguresinsidecellswithpadding. Theonlyintentionalchange is clothing as follows: sagegreen croppedjacketoverwhiteshirt, darknavywidelegtrousers, white sneakers andsmalltan crossbodybag, EXACTbottom-rowoutfit ofimage2. Preserve smalltanleathercrossbodybag atsamehip in EVERYframe, strapstaysdiagonallyontorso; bagtinyinertiallagonlynotdeforming. Clothesfollowexactanatomicalposes. Cleaninkoutlinesandwarmflatshadingconsistentreference. No text,numbers,labels,gridlines,scene,floor,shadows,borders, paintedcheckerboard. Genuinealpha.

