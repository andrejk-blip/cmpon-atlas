#!/usr/bin/env python3
"""Pin 2.9 metadata and the exact active assets. Publication is separate."""
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
    version='2.9.0', released_on='2026-10-30', asset_build='290r1',
    launch_build='290r1', input_module_version='2.8.0', mobile_layout_version='2.8.0',
    skills_module_version='2.8.0', skills_max_ranks=9,
    skills_branches=['observation', 'priority', 'systems'],
    pursuit_rules_revision=280, pursuit_build='280r1', pursuit_view_build='290r1',
    pursuit_warp_hazards=['hammer', 'tentacle', 'maw', 'mantis', 'medusa'],
    swarm_tactics_version='2.8.0',
    voice_build='280r1', voice_default_style='original',
    voice_delivery='original-recordings-with-text-radio',
    voice_rerecording_complete=False, music_build='280r1',
    detail_module_version='2.9.0', convoy_monsters_version='2.9.0', convoy_monsters_per_mission=[3,4,5],
    swarm_view_build='290r1', pursuit_geometry_build='290r1',
    third_convoy_replaced=False, base_supplies_per_new_landing=6,
)
html = re.sub(r'(?<=build=)280r2', '290r1', html)
html = html.replace('name="application-version" content="2.8.0"', 'name="application-version" content="2.9.0"')
html = html.replace('Приложение v2.8.0 · 29.10.2026', 'Приложение v2.9.0 · 30.10.2026')
match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
data = json.loads(match[2])
data.update(updates)
html = html[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + html[match.end(2):]
(root / 'index.html').write_text(html)
(root / 'tests/entry-2.9.0.html').write_text(html)
files = dict.fromkeys(re.findall(r'(?:src|href)="\./(assets/[^?"#]+)', html))
active = {path: sha(path) for path in files}
changed_hashes = {digest: active[path] for path, digest in previous.items() if path in active}
for key, value in list(version.items()):
    if key.endswith('_sha256') and isinstance(value, str) and value in changed_hashes:
        version[key] = changed_hashes[value]
version.update(updates)
version['active_asset_sha256'] = active
for key, path in {'input': 'citadel-input-v2.6.0.js',
                  'skills': 'citadel-skills-v2.8.0.js',
                  'skills_style': 'citadel-skills-v2.8.0.css'}.items():
    version[key + '_sha256'] = sha('assets/' + path)
version['index_sha256'] = sha('index.html')
payload = json.dumps(version, ensure_ascii=False, indent=2) + '\n'
(root / 'version.json').write_text(payload)
(root / 'tests/version-2.9.0.json').write_text(payload)
print(f'Pinned 2.9.0 entry and {len(active)} asset hashes.')
