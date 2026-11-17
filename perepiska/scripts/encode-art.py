#!/usr/bin/env python3
"""Deliver existing production PNGs as pixel-identical lossless WebP.

This is format encoding only: no resampling, retouching, sharpening or alpha edits.
Requires Pillow with WebP support. Originals stay in assets/source.
"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NAMES = (
    'anna-home-motion', 'anna-coral-motion', 'anna-sage-motion',
    'vera-motion', 'max-motion', 'resident-1-motion', 'resident-2-motion',
    'social-portraits-motion', 'apartment', 'courtyard',
)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify files without writing')
    args = parser.parse_args()
    report = []
    for name in NAMES:
        source = ROOT / 'assets' / 'source' / (name + '.png')
        destination = ROOT / 'assets' / (name + '.webp')
        with Image.open(source) as source_image:
            image = source_image.convert('RGBA')
            if not args.check:
                image.save(destination, format='WEBP', lossless=True, method=6, exact=True)
            with Image.open(destination) as result:
                actual = result.convert('RGBA')
                if image.size != actual.size or image.tobytes() != actual.tobytes():
                    raise SystemExit(f'Pixel mismatch: {name}')
            report.append({'file': 'assets/' + destination.name, 'size': list(image.size),
                           'bytes': destination.stat().st_size,
                           'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
    print(json.dumps({'encoding': 'lossless WebP', 'rgbaIdentical': True,
                      'totalBytes': sum(x['bytes'] for x in report), 'files': report}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
