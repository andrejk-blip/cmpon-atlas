#!/usr/bin/env python3
"""Prepare the space cinema and Parallax release; retain existing save schemas."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-cinema-v2.17.9.js','assets/citadel-parallax-v2.17.9.js','assets/citadel-parallax-v2.11.0.js','assets/citadel-living-v2.17.6.js','assets/citadel-sfx-v1.9.3.js','assets/citadel-voice-v2.7.0.js']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.17.9',released_on='2026-11-10',cinematic_effects_version='2.17.9',parallax_visual_version='2.17.9',asteroid_damage_revision='2.17.9',robot_death_revision='2.17.9')
v=json.loads((root/'version.json').read_text());previous={p:v.get('active_asset_sha256',{}).get(p) for p in assets}
for entry in ['index.html','play.html']:
 s=(root/entry).read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.17.9',s)
 s=re.sub(r'Приложение v2\.17\.\d+ · \d{2}\.\d{2}\.\d{4}','Приложение v2.17.9 · 10.11.2026',s)
 for a in assets:s=re.sub(r'(\./'+re.escape(a)+r')(?:\?[^"\s]+)?',r'\1?build=2179r1',s)
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
print('Prepared 2.17.9: mineral asteroids, five blasts, articulated deaths, giant Parallax and three technical fixes.')
