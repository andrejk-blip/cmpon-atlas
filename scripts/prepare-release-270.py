#!/usr/bin/env python3
"""Pin exact release resources; activation is an explicit final operation."""
from pathlib import Path
import hashlib, json, re, sys

root = Path(__file__).resolve().parent.parent
sha = lambda p: hashlib.sha256((root / p).read_bytes()).hexdigest()
entry = root / 'tests/entry-2.7.0.html'
html = entry.read_text()
radio = json.loads((root / 'assets/voice-v2.7.0/manifest.json').read_text())
clips = len(radio['clips'])
updates = dict(version='2.7.0', released_on='2026-10-22', voice_module_version='2.7.0',
               voice_clips=110+clips, voice_base_clips=110, radio_pack_version='2.7.0', radio_clips=clips,
               swarm_module_version='2.7.0', swarm_view_version='2.7.0',
               swarm_wave_population_normal=[8,16,32,64,64,64], swarm_wave_population_calm=[8,10,12,14,16,18],
               base_missions_version='2.7.0', base_missions_view_version='2.7.0',
               mobile_layout_version='2.7.0', install_module_version='2.7.0',
               learning_modes_version='2.7.0', quiz_bank_version='2.7.0',
               launch_build='270r4', launch_module_version='2.7.0',
               education_modes=['training','combat','pro'],
               quiz_questions=len(re.findall(r'^\s+add\(', (root/'assets/citadel-quiz-bank-v2.7.0.js').read_text(), re.M)),
               install_delivery='online-standalone', install_manifest='citadel.webmanifest')
match = re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)', html)
data = json.loads(match[2]); data.update(updates)
html = html[:match.start(2)] + json.dumps(data,ensure_ascii=False,separators=(',',':')) + html[match.end(2):]
entry.write_text(html)
version = json.loads((root / 'version.json').read_text()); version.update(updates)
files = dict.fromkeys(re.findall(r'(?:src|href)="\./(assets/[^?"#]+)', html))
version['active_asset_sha256'] = {p:sha(p) for p in files}
for key,file in {
 'voice':'citadel-voice-v2.7.0.js','radio_pack':'citadel-radio-pack-v2.7.0.js',
 'swarm':'citadel-swarm-v2.7.0.js','swarm_view':'citadel-swarm-view-v2.7.0.js',
 'base_missions':'citadel-base-missions-v2.7.0.js','base_missions_view':'citadel-base-missions-view-v2.7.0.js',
 'mobile_layout':'citadel-mobile-v2.7.0.js','mobile_layout_style':'citadel-mobile-v2.7.0.css',
 'install':'citadel-install-v2.7.0.js','radio_manifest':'voice-v2.7.0/manifest.json',
 'learning_modes':'citadel-learning-modes-v2.7.0.js', 'learning_modes_style':'citadel-learning-modes-v2.7.0.css',
 'quiz_bank':'citadel-quiz-bank-v2.7.0.js', 'launch':'citadel-launch-v2.7.0.js'
}.items(): version[key+'_sha256']=sha('assets/'+file)
version['install_manifest_sha256']=sha('citadel.webmanifest')
version['index_sha256']=sha('tests/entry-2.7.0.html')
text=json.dumps(version,ensure_ascii=False,indent=2)+'\n'
(root/'tests/version-2.7.0.json').write_text(text)
if '--activate' in sys.argv:
 (root/'index.html').write_text(html); (root/'version.json').write_text(text)
 print('Activated exact 2.7 entry locally; GitHub publication is separate.')
else: print('Candidate metadata pinned; production unchanged.')
