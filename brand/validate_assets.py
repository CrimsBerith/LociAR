#!/usr/bin/env python3
"""Validate the delivery contract without needing Xcode or a running app."""
from pathlib import Path
from PIL import Image
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'LociAR/Resources/Assets.xcassets'
count = 0


def check(path, size, mode, transparent=False):
    global count
    with Image.open(path) as image:
        image.load()
        assert image.format == 'PNG', f'{path}: not PNG'
        assert image.size == size, f'{path}: {image.size} != {size}'
        assert image.mode == mode, f'{path}: {image.mode} != {mode}'
        if transparent:
            alpha = image.getchannel('A')
            low, high = alpha.getextrema()
            assert low == 0 and high > 0, f'{path}: requires visible art and transparent space'
            for point in [(0, 0), (size[0]-1, 0), (0, size[1]-1), (size[0]-1, size[1]-1)]:
                assert alpha.getpixel(point) == 0, f'{path}: corner is not transparent'
        count += 1


def main():
    icon = CATALOG / 'AppIcon.appiconset'
    contents = json.loads((icon / 'Contents.json').read_text())
    assert len(contents['images']) == 3
    appearances = set()
    for entry in contents['images']:
        assert entry['idiom'] == 'universal' and entry['platform'] == 'ios' and entry['size'] == '1024x1024'
        appearance = entry.get('appearances', [])
        if not appearance:
            check(icon / entry['filename'], (1024, 1024), 'RGB')
            appearances.add('default')
        else:
            assert len(appearance) == 1 and appearance[0]['appearance'] == 'luminosity'
            kind = appearance[0]['value']
            assert kind in ['dark', 'tinted']
            check(icon / entry['filename'], (1024, 1024), 'RGBA', True)
            appearances.add(kind)
            if kind == 'tinted':
                with Image.open(icon / entry['filename']) as image:
                    r, g, b, _ = image.split()
                    assert r.tobytes() == g.tobytes() == b.tobytes(), 'Tinted must be grayscale'
    assert appearances == {'default', 'dark', 'tinted'}
    for name in ['logomark', 'wordmark-light', 'wordmark-dark']:
        root = ET.parse(ROOT / 'brand' / f'{name}.svg').getroot()
        assert root.tag.endswith('svg')
        assert not any(e.tag.endswith('text') for e in root.iter()), 'Wordmark requires font-independent outlines'
        check(ROOT / 'brand' / f'{name}.png', (1024,1024) if name == 'logomark' else (860,256), 'RGBA', True)
    check(ROOT / 'admin/app/icon.png', (512,512), 'RGB')
    check(ROOT / 'admin/app/apple-icon.png', (180,180), 'RGB')
    with Image.open(ROOT / 'admin/app/favicon.ico') as ico:
        assert ico.ico.sizes() == {(16,16),(32,32),(48,48)}
        for size in ico.ico.sizes():
            assert ico.ico.getimage(size).mode == 'RGBA', 'Next ICO decoder needs RGBA entries'
    for name in ['opengraph-image']:
        check(ROOT / 'admin/app' / f'{name}.png', (1200,630), 'RGB')
        assert (ROOT / 'admin/app' / f'{name}.png').stat().st_size < 1_000_000
        assert (ROOT / 'admin/app' / f'{name}.alt.txt').read_text().strip() == 'LociAR – notes pinned to real places'
    onboarding = ['OnboardingPin', 'OnboardingDiscover', 'OnboardingPrivacy']
    empty = ['EmptyDiscover', 'EmptyActivity', 'EmptySaved', 'EmptyBlocked', 'EmptyMyPosts', 'EmptyPublicProfile', 'EmptyMapNearby', 'ErrorGeneric']
    for name in onboarding + empty:
        folder = CATALOG / f'{name}.imageset'
        contents = json.loads((folder / 'Contents.json').read_text())
        assert len(contents['images']) == 3
        assert {i['scale'] for i in contents['images']} == {'1x','2x','3x'}
        for entry in contents['images']:
            assert entry['idiom'] == 'universal'
            size = (400 if name in onboarding else 240) * int(entry['scale'][0])
            check(folder / entry['filename'], (size,size), 'RGBA', True)
    for i in range(1,6):
        check(ROOT / 'docs/release/screenshots/backgrounds' / f'bg-{i:02d}.png', (1320,2868), 'RGB')
    print(f'PASS: {count} PNG exports; SVG outlines, ICO sizes, Xcode appearances/scales, grayscale/alpha and social-image limits.')


if __name__ == '__main__':
    main()
