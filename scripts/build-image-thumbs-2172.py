#!/usr/bin/env python3
"""Build gallery previews; preserve all full-size artwork and comic atlases."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parent.parent
entries = []
for folder in ('collection2170', 'comics2170'):
    directory = root / 'assets' / folder
    (directory / 'thumbs').mkdir(exist_ok=True)
    for source in sorted(directory.glob('*.webp')):
        target = directory / 'thumbs' / source.name
        with Image.open(source) as image:
            image.thumbnail((320, 480), Image.Resampling.LANCZOS)
            image.save(target, 'WEBP', quality=84, method=6)
            dimensions = list(image.size)
        entries.append(dict(source=str(source.relative_to(root)), preview=str(target.relative_to(root)),
                            width=dimensions[0], height=dimensions[1], source_bytes=source.stat().st_size,
                            preview_bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
payload = dict(version='2.17.2', source_bytes=sum(x['source_bytes'] for x in entries),
               preview_bytes=sum(x['preview_bytes'] for x in entries), images=entries)
(root / 'assets' / 'image-previews2172.json').write_text(json.dumps(payload, indent=2) + '\n')
print(json.dumps({key: value for key, value in payload.items() if key != 'images'}))
