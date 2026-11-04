#!/usr/bin/env python3
"""Publish only the living document-map layer; preserve unrelated asset caches."""
from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parent.parent
digest = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
js = 'assets/citadel-map-v2.17.4.js'
css = 'assets/citadel-map-v2.17.4.css'
updates = dict(version='2.17.4', released_on='2026-11-04', map_animation_version='2.17.4', map_animation_build='2174r1')
for entry in ('index.html', 'play.html'):
    html = (root / entry).read_text()
    html = re.sub(r'(name="application-version" content=")[^"]+', r'\g<1>2.17.4', html)
    html = re.sub(r'Приложение v2\.17\.\d+', 'Приложение v2.17.4', html)
    if css not in html:
        html = html.replace('</head>', '<link rel="stylesheet" href="./'+css+'?build=2174r1">\n</head>')
    if js not in html:
        html = html.replace('<script defer src="./assets/citadel-runtime-', '<script defer src="./'+js+'?build=2174r1"></script>\n<script defer src="./assets/citadel-runtime-')
    match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
    if not match:
        raise ValueError(f'{entry}: release metadata missing')
    data = json.loads(match[2]); data.update(updates)
    html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
    (root / entry).write_text(html)
version = json.loads((root / 'version.json').read_text())
for path in [js, css, 'assets/map2174/atlas-clean.webp']:
    version['active_asset_sha256'][path] = digest(path)
version.update(updates)
version['index_sha256'] = digest('index.html')
version['webapp_sha256'] = digest('play.html')
(root / 'version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
print('Pinned Citadel 2.17.4: living document map.')
