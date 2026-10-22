#!/usr/bin/env python3
"""Prepare an isolated 2.7 candidate from the released 2.6 entry."""
from pathlib import Path
import re, json

root = Path(__file__).resolve().parent.parent
source = (root / 'index.html').read_text()
for old, new in [('citadel-swarm-v2.6.0.js','citadel-swarm-v2.7.0.js'), ('citadel-swarm-view-v2.6.0.js','citadel-swarm-view-v2.7.0.js')]:
    source = re.sub(r'assets/' + re.escape(old) + r'(?:\?[^\"]*)?', 'assets/' + new + '?build=270r2', source)
source = re.sub(r'assets/citadel-voice-v2\.5\.0\.js(?:\?[^\"]*)?',
                'assets/citadel-voice-v2.7.0.js?build=270r2', source)
source = re.sub(r'assets/citadel-launch-v2\.3\.1\.js(?:\?[^\"]*)?',
                'assets/citadel-launch-v2.7.0.js?build=270r4', source)
radio = '<script defer src="./assets/citadel-radio-pack-v2.7.0.js?build=270r2"></script>'
if 'citadel-radio-pack-v2.7.0.js' not in source:
    source = re.sub(r'(<script defer src="\./assets/citadel-voice-pack-v1\.8\.2\.js[^\"]*"></script>)',
                    lambda m: m[1] + '\n' + radio, source)
for name in ['citadel-base-missions-v2.7.0.js', 'citadel-base-missions-view-v2.7.0.js']:
    if name not in source:
        source = source.replace('<script defer src="./assets/citadel-runtime-v1.9.3.js',
            '<script defer src="./assets/' + name + '?build=270r4"></script>\n<script defer src="./assets/citadel-runtime-v1.9.3.js')
for name in ['citadel-quiz-bank-v2.7.0.js', 'citadel-learning-modes-v2.7.0.js',
             'citadel-mobile-v2.7.0.js', 'citadel-install-v2.7.0.js']:
    source = re.sub(r'<script defer src="\./assets/' + re.escape(name) + r'[^\"]*"></script>\s*', '', source)
    source = source.replace('<script defer src="./assets/citadel-runtime-v1.9.3.js',
        '<script defer src="./assets/' + name + '?build=270r4"></script>\n<script defer src="./assets/citadel-runtime-v1.9.3.js')
source = source.replace('name="application-version" content="2.6.0"',
                        'name="application-version" content="2.7.0"').replace('Приложение v2.6.0', 'Приложение v2.7.0')
for stylesheet in ['citadel-mobile-v2.7.0.css', 'citadel-learning-modes-v2.7.0.css']:
    if stylesheet not in source:
        source = source.replace('</head>', '<link rel="stylesheet" href="./assets/' + stylesheet + '?build=270r4">\n</head>')
if 'citadel.webmanifest' not in source:
    source = source.replace('</head>', '<link rel="manifest" href="./citadel.webmanifest">\n<link rel="apple-touch-icon" href="./assets/citadel-icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Цитадель">\n</head>')
match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', source)
data = json.loads(match[2])
data.update(version='2.7.0', released_on='2026-10-22', swarm_module_version='2.7.0', swarm_view_version='2.7.0', voice_module_version='2.7.0', radio_pack_version='2.7.0',
            mobile_layout_version='2.7.0', install_module_version='2.7.0', base_missions_version='2.7.0', base_missions_view_version='2.7.0')
source = source[:match.start(2)] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + source[match.end(2):]
(root / 'tests/entry-2.7.0.html').write_text(source)
print('Staged 2.7 entry prepared; production index unchanged')
