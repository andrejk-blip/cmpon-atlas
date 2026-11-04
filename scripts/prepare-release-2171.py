#!/usr/bin/env python3
"""Pin the local-only recorder fix without invalidating unrelated assets."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parent.parent
recorder = 'assets/citadel-recorder-v2.15.0.js'
digest = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
updates = dict(version='2.17.1', released_on='2026-11-04',
               recording_version='2.17.1', recording_build='2171r1',
               recording_delivery='local-preview-and-download')
for entry in ('index.html', 'play.html'):
    html = (root / entry).read_text()
    html = re.sub(r'(name="application-version" content=")[^"]+',
                  r'\g<1>2.17.1', html)
    html = html.replace('Приложение v2.17.0', 'Приложение v2.17.1')
    html = re.sub(r'(citadel-recorder-v2\.15\.0\.js\?build=)[^"&]+',
                  r'\g<1>2171r1', html)
    match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
    if not match:
        raise ValueError(f'{entry}: release metadata missing')
    data = json.loads(match[2])
    data.update(updates)
    html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
    (root / entry).write_text(html)
version = json.loads((root / 'version.json').read_text())
version.update(updates)
version['active_asset_sha256'][recorder] = digest(recorder)
version['index_sha256'] = digest('index.html')
version['webapp_sha256'] = digest('play.html')
(root / 'version.json').write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
print('Pinned Citadel 2.17.1; only the recorder cache key changed.')
