#!/usr/bin/env python3
"""Pin 2.15 metadata and the exact active assets. Publication is separate."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parent.parent
sha = lambda path: hashlib.sha256((root / path).read_bytes()).hexdigest()
html = (root / 'index.html').read_text()
version = json.loads((root / 'version.json').read_text())
previous = version.get('active_asset_sha256', {})
updates = dict(
    version='2.15.0', released_on='2026-11-03', asset_build='2150r2',
    campaign_version='2.12.0', experience_version='2.13.0', accessibility_version='2.14.0', controls_version='2.15.0', recording_version='2.15.0', input_module_version='2.15.0', motion_version='2.13.0', pursuit_campaign_seconds=90, pursuit_campaign_training_seconds=72, campaign_chapters=15, campaign_cards=28, campaign_parallax_chapter=8, campaign_station_chapter=13, campaign_optional_route_chapter=6, legacy_campaign_chapters=14, legacy_campaign_cards=23, online_app_entry='play.html', leviathan_version='2.11.0', leviathan_beacons=4, leviathan_tentacles=8,
    leviathan_body_to_ship_ratio=40, leviathan_save_policy='existing-boss-saves-retain-their-arena',
    leviathan_warnings='all-modes',
)
html = re.sub(r'build=[^\"&]+', 'build=2150r2', html)
html = re.sub(r'(name="application-version" content=")[^"]+', r'\g<1>2.15.0', html)
html = re.sub(r'Приложение v[\d.]+ · \d{2}\.\d{2}\.\d{4}', 'Приложение v2.15.0 · 03.11.2026', html)
match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
data = json.loads(match[2])
data.update(updates)
html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
(root / 'index.html').write_text(html)
(root / 'tests/entry-2.15.0.html').write_text(html)
import runpy
runpy.run_path(str(root/'scripts/build-game-webapp.py'),run_name='__main__')
files = dict.fromkeys(re.findall(r'(?:src|href)="\./(assets/[^?"#]+)', html))
active = {path: sha(path) for path in files}
changed_hashes = {digest: active[path] for path, digest in previous.items() if path in active}
for key, value in list(version.items()):
    if key.endswith('_sha256') and isinstance(value, str) and value in changed_hashes:
        version[key] = changed_hashes[value]
version.update(updates)
version['active_asset_sha256'] = active
version['visual_art_sha256'] = {p: sha(p) for p in ['assets/citadel-after-parallax-v2.13.0.webp','assets/citadel-perks-v2.13.0.webp','assets/citadel-document-atlas-v2.14.0.webp']}
version['leviathan_sha256'] = sha('assets/citadel-parallax-v2.11.0.js')
version['index_sha256'] = sha('index.html')
version['webapp_sha256'] = sha('play.html')
version['manifest_sha256'] = sha('citadel.webmanifest')
version['campaign_sha256'] = sha('assets/citadel-campaign-v2.12.0.js')
payload = json.dumps(version, ensure_ascii=False, indent=2) + '\n'
(root / 'version.json').write_text(payload)
(root / 'tests/version-2.15.0.json').write_text(payload)
print(f'Pinned 2.15.0 entry and {len(active)} asset hashes.')
