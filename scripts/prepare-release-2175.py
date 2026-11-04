#!/usr/bin/env python3
"""Bounded mobile/presentation release; monster concepts are not game changes."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
assets=['assets/citadel-collection-v2.17.0.js','assets/citadel-lobby-v2.17.5.css','assets/citadel-fit-v2.17.5.js','assets/citadel-fit-v2.17.5.css','assets/citadel-convoy-v2.17.5.js','assets/atlas-site-metrics.js','assets/atlas-site-metrics.css','assets/scene2175/portrait.webp','assets/scene2175/portrait-small.webp']
digest=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
updates=dict(version='2.17.5',released_on='2026-11-05',visual_style_version='2.17.5',visual_style_build='2175r1',collection_version='2.17.5',viewport_fit_version='2.17.5',convoy_motion_version='2.17.5',metrics_consent_version='2.17.5')
for entry in ['index.html','play.html']:
 s=(root/entry).read_text()
 s=re.sub(r'(name="application-version" content=")[^"]+',r'\g<1>2.17.5',s)
 s=re.sub(r'Приложение v2\.17\.\d+','Приложение v2.17.5',s)
 s=re.sub(r'(citadel-collection-v2.17.0.js\?build=)[^"\s]+',r'\g<1>2175r1',s)
 s=re.sub(r'(atlas-site-metrics\.(?:js|css)\?v=)[^"\s]+',r'\g<1>20261105',s)
 for css in ['assets/citadel-lobby-v2.17.5.css','assets/citadel-fit-v2.17.5.css']:
  if css not in s:s=s.replace('</head>','<link rel="stylesheet" href="./'+css+'?build=2175r1">\n</head>')
 for js in ['assets/citadel-convoy-v2.17.5.js','assets/citadel-fit-v2.17.5.js']:
  if js not in s:s=s.replace('<script defer src="./assets/citadel-runtime-','<script defer src="./'+js+'?build=2175r1"></script>\n<script defer src="./assets/citadel-runtime-')
 # Preload only the actual aspect-ratio variant, avoiding two hero downloads.
 s=re.sub(r'(<link rel="preload" href="./assets/scene2173/characters-r2.webp"[^>]*)(>)',r'\1 media="not all and (max-width: 700px) and (min-height: 740px)"\2',s) if 'portrait-small.webp' not in s else s
 if 'portrait-small.webp' not in s:
  s=s.replace('</head>','<link rel="preload" href="./assets/scene2175/portrait.webp" as="image" type="image/webp" imagesrcset="./assets/scene2175/portrait-small.webp 400w, ./assets/scene2175/portrait.webp 640w" imagesizes="70vw" media="(max-width: 700px) and (min-height: 740px)" fetchpriority="high">\n</head>')
 m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data.update(updates)
 s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):]
 (root/entry).write_text(s)
v=json.loads((root/'version.json').read_text());v.update(updates)
for p in assets:v['active_asset_sha256'][p]=digest(p)
v['index_sha256']=digest('index.html');v['webapp_sha256']=digest('play.html')
(root/'version.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2.17.5: viewport, opening scene, consent, convoy motion.')
