"""Verify deployed release bytes, including the complete new recorded radio."""
import concurrent.futures, hashlib, json, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'version.json').read_text())
assert version['version'] == '2.7.0'
paths = list(dict.fromkeys([
    'index.html', 'version.json', 'citadel.webmanifest',
    *version['active_asset_sha256'],
    'assets/citadel-icon-192.png', 'assets/citadel-icon-512.png',
    'assets/citadel-captain-sheet-v2.3.1.png',
    *[p.relative_to(root).as_posix() for p in sorted((root / 'assets/voice-v2.7.0').iterdir()) if p.is_file()],
]))
commit = sys.argv[1]
base = 'https://andrejk-blip.github.io/cmpon-atlas/'
expected_by_path = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths}
def check(path):
    request = urllib.request.Request(base + path + '?verify=' + commit[:12], headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data, status = response.read(), response.status
    actual = hashlib.sha256(data).hexdigest()
    expected = expected_by_path[path]
    return dict(path=path, status=status, bytes=len(data), sha256=actual, matches=actual == expected)

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    pending = {pool.submit(check, path): path for path in paths}
    results = []
    for future in concurrent.futures.as_completed(pending):
        path = pending[future]
        try:
            results.append(future.result())
        except Exception as error:
            results.append(dict(path=path, status=0, matches=False, error=str(error)))
        if len(results) % 25 == 0:
            print(json.dumps(dict(checked=len(results), total=len(paths))), flush=True)
results.sort(key=lambda item: item['path'])
report = dict(release='2.7.0', activation_commit=commit, url=base,
              verified_at=datetime.now(timezone.utc).isoformat(),
              matched=sum(x['matches'] for x in results), total=len(results), files=results)
(root / 'tests/qa-2.7.0/publication.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k:v for k,v in report.items() if k != 'files'}))
if any(not x['matches'] for x in results):
    print(json.dumps([x for x in results if not x['matches']]))
    sys.exit(1)
