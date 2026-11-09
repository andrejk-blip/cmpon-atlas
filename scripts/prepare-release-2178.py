#!/usr/bin/env python3
"""Prepare the deck-exit and combat-readability fix; retain existing save schemas."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-campaign-v2.12.0.js','assets/citadel-base-missions-v2.7.0.js','assets/citadel-base-missions-view-v2.7.0.js','assets/citadel-hud-v2.17.8.js','assets/citadel-hud-v2.17.8.css']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.17.8',released_on='2026-11-10',deck_exit_revision='2.17.8',combat_hud_version='2.17.8',hazard_readability_version='2.17.8')
v=json.loads((root/'version.json').read_text());previous={p:v.get('active_asset_sha256',{}).get(p) for p in assets}
for entry in ['index.html','play.html']:
 s=(root/entry).read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.17.8',s)
 s=re.sub(r'Приложение v2\.17\.\d+ · \d{2}\.\d{2}\.\d{4}','Приложение v2.17.8 · 10.11.2026',s)
 if 'citadel-hud-v2.17.8.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="./assets/citadel-hud-v2.17.8.css?build=2178r1">\n</head>')
 if 'citadel-hud-v2.17.8.js' not in s:s=s.replace('</body>','<script defer src="./assets/citadel-hud-v2.17.8.js?build=2178r1"></script>\n</body>')
 for a in assets:s=re.sub(r'(\./'+re.escape(a)+r')(?:\?[^"\s]+)?',r'\1?build=2178r1',s)
 m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data.update(updates)
 s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):]
 (root/entry).write_text(s)
v.update(updates)
for a in assets:
 current=digest(a);old=previous[a]
 for key,value in list(v.items()):
  if key.endswith('_sha256') and old and value==old:v[key]=current
 v.setdefault('active_asset_sha256',{})[a]=current
v['index_sha256']=digest('index.html');v['webapp_sha256']=digest('play.html')
(root/'version.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2.17.8: deck exits, comic HUD, distinct fire and electrical hazards.')
