#!/usr/bin/env python3
"""Mobile loading, guidance, comic HUD and recoverable pause fixes."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-home-v2.18.0.js','assets/citadel-guidance-v2.18.1.js','assets/citadel-loading-guidance-v2.18.1.css','assets/citadel-hud-v2.17.8.js','assets/citadel-comic-v1.9.3.js','assets/citadel-runtime-v1.9.3.js']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.18.1',released_on='2026-11-10',home_scene_version='2.18.1',mobile_guidance_version='2.18.1',combat_hud_version='2.18.1',comic_module_version='2.18.1',runtime_module_version='2.18.1')
v=json.loads((root/'version.json').read_text());previous={p:v.get('active_asset_sha256',{}).get(p) for p in assets}
preloads='\n'.join('<link rel="preload" href="./assets/home2180/'+name+'.webp" as="image" type="image/webp"'+media+' fetchpriority="high">' for name,media in [('hangar',' media="(min-width: 701px)"'),('hangar-small',' media="(max-width: 700px)"')]+[(name,'') for name in ['analyst','mech','ninja','doberman']])+'\n'
for entry in ['index.html','play.html']:
 p=root/entry;s=p.read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.18.1',s)
 s=re.sub(r'Приложение v2\.\d+\.\d+ · \d{2}\.\d{2}\.\d{4}','Приложение v2.18.1 · 10.11.2026',s)
 s=re.sub(r'<link rel="preload"[^>]*home2180[^>]*>\n?','',s)
 s=s.replace('<link rel="stylesheet"',preloads+'<link rel="stylesheet"',1)
 if 'citadel-loading-guidance-v2.18.1.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="./assets/citadel-loading-guidance-v2.18.1.css?build=2181r1">\n</head>')
 if 'citadel-guidance-v2.18.1.js' not in s:s=s.replace('</body>','<script defer src="./assets/citadel-guidance-v2.18.1.js?build=2181r1"></script>\n</body>')
 for a in assets:s=re.sub(r'(\./'+re.escape(a)+r')(?:\?[^"\s]+)?',r'\1?build=2181r1',s)
 m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data.update(updates)
 s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):];p.write_text(s)
v.update(updates)
for a in assets:
 current=digest(a);old=previous.get(a)
 for key,value in list(v.items()):
  if key.endswith('_sha256') and old and value==old:v[key]=current
 v.setdefault('active_asset_sha256',{})[a]=current
v['index_sha256']=digest('index.html');v['webapp_sha256']=digest('play.html')
(root/'version.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2.18.1 entries and asset checksums.')
