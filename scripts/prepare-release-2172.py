#!/usr/bin/env python3
"""Pin mobile audio and gallery loading without invalidating unrelated assets."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parent.parent
digest = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
changed = ['assets/citadel-music-v1.4.2.js', 'assets/citadel-collection-v2.17.0.js']
audio_css = 'assets/citadel-audio-controls-v2.17.2.css'
updates = dict(version='2.17.2', released_on='2026-11-04', music_module_version='2.17.2',
               soundtrack_module_version='2.17.2', music_build='2172r1',
               collection_version='2.17.2', image_previews_version='2.17.2')
for entry in ('index.html', 'play.html'):
    html = (root / entry).read_text()
    html = re.sub(r'(name="application-version" content=")[^"]+', r'\g<1>2.17.2', html)
    html = html.replace('Приложение v2.17.1', 'Приложение v2.17.2')
    for asset in changed:
        html = re.sub('(' + re.escape(asset) + r'\?build=)[^"&]+', r'\g<1>2172r1', html)
    if audio_css not in html:
        html = html.replace('</head>', '<link rel="stylesheet" href="./' + audio_css + '?build=2172r1">\n</head>')
    preload = '<link rel="preload" as="image" type="image/webp" href="./assets/comics2170/departure.webp" fetchpriority="high">'
    if entry == 'play.html' and preload not in html:
        html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + preload)
    match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
    if not match:
        raise ValueError(f'{entry}: release metadata missing')
    data = json.loads(match[2]); data.update(updates)
    html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
    (root / entry).write_text(html)
version = json.loads((root / 'version.json').read_text())
previous = dict(version['active_asset_sha256'])
for asset in changed + [audio_css]:
    version['active_asset_sha256'][asset] = digest(asset)
for key, value in list(version.items()):
    if key.endswith('_sha256') and isinstance(value, str):
        for asset in changed:
            if previous.get(asset) == value:
                version[key] = digest(asset)
version.update(updates)
version['index_sha256'] = digest('index.html')
version['webapp_sha256'] = digest('play.html')
previews = json.loads((root / 'assets/image-previews2172.json').read_text())
version['image_previews_sha256'] = {row['preview']: row['sha256'] for row in previews['images']}
(root / 'version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
print('Pinned Citadel 2.17.2: mobile audio and 24 gallery previews.')
