#!/usr/bin/env python3
"""Prepare staged exact entry; does not activate production index."""
from pathlib import Path
import re,json
r=Path(__file__).resolve().parent.parent
s=(r/'index.html').read_text()
replacements={
'citadel-input-v1.9.1.js':'citadel-input-v2.6.0.js',
'citadel-pursuit-v2.1.0.js':'citadel-pursuit-v2.6.0.js',
'citadel-convoy-v2.4.0.js':'citadel-convoy-v2.6.0.js',
'citadel-swarm-v2.5.0.js':'citadel-swarm-v2.6.0.js',
'citadel-swarm-view-v2.5.0.js':'citadel-swarm-view-v2.6.0.js',
'citadel-parallax-v1.8.0.js':'citadel-parallax-v2.6.0.js',
'citadel-mrg-v1.7.0.js':'citadel-mrg-v2.6.0.js',
'citadel-mrg-view-v1.7.0.js':'citadel-mrg-view-v2.6.0.js'}
for old,new in replacements.items():
 s=re.sub(r'assets/'+re.escape(old)+r'(?:\?[^\"]*)?', 'assets/'+new+'?build=260r2',s)
for after,add in [('citadel-bases-view-v2.0.0.js','citadel-base-rewards-v2.6.0.js'),('citadel-pursuit-view-v2.3.0.js','citadel-pursuit-view-v2.6.0.js'),('citadel-convoy-view-v2.4.0.js','citadel-convoy-view-v2.6.0.js'),('citadel-presentation-v2.5.0.js','citadel-combat-v2.6.0.js')]:
 if add not in s:s=re.sub(r'(<script defer src="./assets/'+re.escape(after)+r'[^\"]*"></script>)',r'\1\n<script defer src="./assets/'+add+r'?build=260r2"></script>',s)
s=s.replace('name="application-version" content="2.5.0"','name="application-version" content="2.6.0"').replace('Приложение v2.5.0','Приложение v2.6.0')
m=re.search(r'(<script type="application/json" id="release-data">)([^<]+)(</script>)',s);data=json.loads(m[2]);data['version']='2.6.0'
for key in ['input_module_version','pursuit_module_version','convoy_module_version','swarm_module_version','parallax_module_version','mrg_module_version','convoy_view_version','swarm_view_version'] : data[key]='2.6.0'
data.update(pursuit_view_version='2.6.0',mrg_view_version='2.6.0',base_rewards_version='2.6.0',combat_module_version='2.6.0',mouse_missiles='right-button',combat_warnings=False,training_warnings=True)
s=s[:m.start(2)]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+s[m.end(2):]
# Two retained prerequisites changed; invalidate their previous URLs too.
for file in ['citadel-pursuit-view-v2.3.0.js','citadel-comic-v1.9.3.js']:
 s=re.sub(r'assets/'+re.escape(file)+r'(?:\?[^\"]*)?', 'assets/'+file+'?build=260r2',s)
(r/'tests/entry-2.6.0.html').write_text(s)
print('Staged entry2.6 prepared')
