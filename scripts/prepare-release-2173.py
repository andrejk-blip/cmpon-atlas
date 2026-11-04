#!/usr/bin/env python3
"""Pin the stage-three presentation without invalidating unrelated game assets."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parent.parent
digest = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
collection = 'assets/citadel-collection-v2.17.0.js'
style = 'assets/citadel-style-v2.17.3.css'
fonts = ['assets/fonts/RussoOne-Regular.woff', 'assets/fonts/Exo2-Variable.woff']
scene = ['assets/scene2173/characters-r2.webp', 'assets/scene2173/characters-small-r2.webp']
updates = dict(version='2.17.3', released_on='2026-11-04', collection_version='2.17.3',
               visual_style_version='2.17.3', visual_style_build='2173r2', artwork_revision=2)
for entry in ('index.html', 'play.html'):
    html = (root / entry).read_text()
    html = re.sub(r'(name="application-version" content=")[^"]+', r'\g<1>2.17.3', html)
    html = re.sub(r'Приложение v2\.17\.\d+', 'Приложение v2.17.3', html)
    html = re.sub('(' + re.escape(collection) + r'\?build=)[^"&]+', r'\g<1>2173r2', html)
    if style not in html:
        html = html.replace('</head>', '<link rel="stylesheet" href="./' + style + '?build=2173r1">\n</head>')
    if entry == 'play.html':
        preloads = ''.join('<link rel="preload" href="./'+p+'" as="font" type="font/woff" crossorigin>\n' for p in fonts)
        hero = '<link rel="preload" href="./assets/scene2173/characters-r2.webp" as="image" type="image/webp" imagesrcset="./assets/scene2173/characters-small-r2.webp 640w, ./assets/scene2173/characters-r2.webp 1280w" imagesizes="(max-width: 700px) 100vw, 65vw" fetchpriority="high">\n'
        html = re.sub(r'<link rel="preload" href="\./assets/collection2170/thumbs/hero.webp"[^>]+>\n?', '', html)
        if fonts[0] not in html:
            html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + preloads)
        html = re.sub(r'<link rel="preload" href="\./assets/scene2173/[^>]+>\n?', '', html)
        if 'imagesrcset=' not in html:
            html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + hero)
    match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
    if not match:
        raise ValueError(f'{entry}: release metadata missing')
    data = json.loads(match[2]); data.update(updates)
    html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
    (root / entry).write_text(html)
version = json.loads((root / 'version.json').read_text())
previous = version['active_asset_sha256'].get(collection)
for old_scene in ('assets/scene2173/characters.webp', 'assets/scene2173/characters-small.webp'):
    version['active_asset_sha256'].pop(old_scene, None)
for path in [collection, style] + fonts + scene:
    version['active_asset_sha256'][path] = digest(path)
for key, value in list(version.items()):
    if key.endswith('_sha256') and isinstance(value, str) and value == previous:
        version[key] = digest(collection)
version.update(updates)
version['index_sha256'] = digest('index.html')
version['webapp_sha256'] = digest('play.html')
(root / 'version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
print('Pinned Citadel 2.17.3: character lobby, Cyrillic fonts and tactile controls.')
