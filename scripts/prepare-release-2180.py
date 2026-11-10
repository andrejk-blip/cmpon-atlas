#!/usr/bin/env python3
"""Layered home, analyst icons and versioned swarm scenario order."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-collection-v2.17.0.js','assets/citadel-swarm-v2.7.0.js','assets/citadel-home-v2.18.0.js','assets/citadel-home-v2.18.0.css']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.18.0',released_on='2026-11-10',game_title='Цитадель требований',home_scene_version='2.18.0',game_icons_version='2.18.0',swarm_order_version='2.18.0',swarm_scenario_order=[1,2,3,5,6,4],swarm_wave_population_normal=[8,16,32,32,24,64],swarm_wave_population_calm=[8,10,12,16,18,14],swarm_final_waves=[24,64])
v=json.loads((root/'version.json').read_text());previous={p:v.get('active_asset_sha256',{}).get(p) for p in assets}
for entry in ['index.html','play.html']:
 p=root/entry;s=p.read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.18.0',s)
 s=re.sub(r'Приложение v2\.\d+\.\d+ · \d{2}\.\d{2}\.\d{4}','Приложение v2.18.0 · 10.11.2026',s)
 s=re.sub(r'<link rel="preload"[^>]*(?:scene2173|scene2175|comics2170/departure)[^>]*>\n?','',s)
 if 'assets/home2180/hangar.webp' not in s:
  s=s.replace('</head>','<link rel="preload" href="./assets/home2180/hangar.webp" as="image" type="image/webp" media="(min-width: 701px)" fetchpriority="high">\n<link rel="preload" href="./assets/home2180/hangar-small.webp" as="image" type="image/webp" media="(max-width: 700px)" fetchpriority="high">\n<link rel="preload" href="./assets/home2180/analyst.webp" as="image" type="image/webp">\n<link rel="stylesheet" href="./assets/citadel-home-v2.18.0.css?build=2180r1">\n</head>')
 if 'src="./assets/citadel-home-v2.18.0.js' not in s:
  s=s.replace('<script defer src="./assets/citadel-collection-v2.17.0.js','<script defer src="./assets/citadel-home-v2.18.0.js?build=2180r1"></script>\n<script defer src="./assets/citadel-collection-v2.17.0.js')
 for a in assets:s=re.sub(r'(\./'+re.escape(a)+r')(?:\?[^"\s]+)?',r'\1?build=2180r1',s)
 s=re.sub(r'(<link rel="manifest" href=")[^"]+',r'\g<1>./citadel.webmanifest?build=2180r1',s)
 s=re.sub(r'(<link rel="apple-touch-icon" href=")[^"]+',r'\g<1>./assets/home2180/analyst-180.png',s)
 if entry=='play.html':
  s=re.sub(r'<link rel="icon"[^>]+>\n?','',s)
  s=s.replace('</head>','<link rel="icon" href="./assets/home2180/analyst-32.png" type="image/png" sizes="32x32">\n<link rel="icon" href="./assets/home2180/analyst-192.png" type="image/png" sizes="192x192">\n</head>')
  s=re.sub(r'(<meta name="description" content=")[^"]+',r'\g<1>Цитадель требований — история космических аналитиков и их базы. 15 глав: полёты, бои, исследования и решения.',s)
  s=re.sub(r'(name="apple-mobile-web-app-title" content=")[^"]+',r'\g<1>Цитадель требований',s)
  if 'apple-mobile-web-app-title' not in s:s=s.replace('</head>','<meta name="apple-mobile-web-app-title" content="Цитадель требований">\n</head>')
 m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data.update(updates)
 s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):]
 p.write_text(s)
# Preserve the already published app identity, icon paths and description.
v.update(updates)
for a in assets+['citadel.webmanifest']+[str(p.relative_to(root)) for p in (root/'assets/home2180').iterdir()]:
 current=digest(a);old=previous.get(a)
 for key,value in list(v.items()):
  if key.endswith('_sha256') and old and value==old:v[key]=current
 v.setdefault('active_asset_sha256',{})[a]=current
v['index_sha256']=digest('index.html');v['webapp_sha256']=digest('play.html')
(root/'version.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2.18.0 entries, manifest and asset checksums.')
