#!/usr/bin/env python3
"""Version the reviewed living-art/combat patch without changing old save IDs."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-living-v2.17.6.js','assets/citadel-polish-v2.17.6.css','assets/living2176/titans.webp','assets/citadel-pursuit-v2.6.0.js','assets/citadel-convoy-monsters-v2.9.0.js','assets/citadel-swarm-v2.7.0.js','assets/citadel-sfx-v1.9.3.js','assets/citadel-base-missions-view-v2.7.0.js','assets/citadel-collection-v2.17.0.js','assets/citadel-fit-v2.17.5.js']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.17.6',released_on='2026-11-06',living_monsters_version='2.17.6',combat_feedback_version='2.17.6',collection_version='2.17.6',visual_style_build='2176r1',swarm_final_waves=[32,24],swarm_wave_population_normal=[8,16,32,64,32,24],swarm_balance_version='2.17.6',rift_first_chapter=2,rift_encounters_per_chapter=1)
for entry in ['index.html','play.html']:
 s=(root/entry).read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.17.6',s)
 s=re.sub(r'Приложение v2\.17\.\d+','Приложение v2.17.6',s)
 if 'citadel-polish-v2.17.6.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="./assets/citadel-polish-v2.17.6.css?build=2176r1">\n</head>')
 if 'citadel-living-v2.17.6.js' not in s:s=s.replace('<script defer src="./assets/citadel-runtime-','<script defer src="./assets/citadel-living-v2.17.6.js?build=2176r1"></script>\n<script defer src="./assets/citadel-runtime-')
 for a in assets:
  if a.endswith(('.js','.css')):s=re.sub(r'(\./'+re.escape(a)+r')(?:\?[^"\s]+)?',r'\1?build=2176r1',s)
 m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data.update(updates)
 s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):]
 (root/entry).write_text(s)
v=json.loads((root/'version.json').read_text());v.update(updates)
for p in assets:v['active_asset_sha256'][p]=digest(p)
v['index_sha256']=digest('index.html');v['webapp_sha256']=digest('play.html')
(root/'version.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2.17.6: living titans, fair attacks, swarm, feedback, portraits.')
