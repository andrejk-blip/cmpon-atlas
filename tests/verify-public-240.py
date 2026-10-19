"""Compare the deployed entry and every local script/stylesheet to release bytes."""
import concurrent.futures, hashlib, json, re, sys, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

root=Path(__file__).resolve().parent.parent
class Assets(HTMLParser):
    def __init__(self): super().__init__(); self.paths=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); value=a.get('src') if tag=='script' else a.get('href') if tag=='link' and a.get('rel')=='stylesheet' else None
        if value and value.startswith('./'): self.paths.append(value[2:].split('?')[0])
p=Assets();p.feed((root/'index.html').read_text())
paths=list(dict.fromkeys(['index.html','version.json',*p.paths,'assets/citadel-captain-sheet-v2.3.1.png']))
commit=sys.argv[1]
base='https://andrejk-blip.github.io/cmpon-atlas/'
def check(path):
    url=base+path+'?verify='+commit[:12]
    request=urllib.request.Request(url,headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=45) as response:
        data=response.read(); status=response.status
    expected=hashlib.sha256((root/path).read_bytes()).hexdigest(); actual=hashlib.sha256(data).hexdigest()
    return {'path':path,'status':status,'bytes':len(data),'sha256':actual,'matches':actual==expected}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: results=list(pool.map(check,paths))
report={'release':'2.4.0','activation_commit':commit,'url':base,'verified_at':datetime.now(timezone.utc).isoformat(),'matched':sum(x['matches'] for x in results),'total':len(results),'files':results}
(root/'tests/qa-2.4.0/publication.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
if any(not x['matches'] for x in results):
    print(json.dumps([x for x in results if not x['matches']]));sys.exit(1)
