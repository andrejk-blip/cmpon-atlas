"""Read-only HTTP verification of the exact public 2.10.0 release."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json
import sys
import argparse

root = Path(__file__).resolve().parent.parent
expected = json.loads((root / 'version.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--commit', required=True)
args = parser.parse_args()
base = expected['public_url']
build = expected['asset_build']
digest = lambda data: hashlib.sha256(data).hexdigest()

def fetch(path):
    request = Request(base + path, headers={'User-Agent': 'Citadel-release-verification', 'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=30) as response:
        return response.status, response.read(), response.url

status, payload, url = fetch('version.json?release=' + build)
actual = json.loads(payload)
if actual.get('version') != '2.10.0':
    print(json.dumps({'ready': False, 'public_version': actual.get('version')}))
    sys.exit(2)
checks = {'index.html': expected['index_sha256'],
          'version.json': digest((root / 'version.json').read_bytes()),
          'citadel.webmanifest': expected['install_manifest_sha256'],
          **expected['active_asset_sha256']}

def check(item):
    path, wanted = item
    suffix = '?app=citadel' if path == 'index.html' else path + '?build=' + build
    try:
        status, payload, url = fetch(suffix)
        got = digest(payload)
        return dict(path=path, status=status, url=url, sha256=got, expected_sha256=wanted, pass_=got == wanted)
    except Exception as error:
        return dict(path=path, pass_=False, error=str(error))

with ThreadPoolExecutor(max_workers=6) as pool:
    rows = list(pool.map(check, checks.items()))
result = dict(version='2.10.0', verified_at=datetime.now(timezone.utc).isoformat(),
              release_commit=args.commit,
              public_url=base + '?app=citadel#arcade',
              passed=sum(row['pass_'] for row in rows), total=len(rows), rows=rows)
result['pass'] = result['passed'] == result['total']
(root / 'tests/qa-2.10.0/production.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'rows'}))
sys.exit(0 if result['pass'] else 1)
