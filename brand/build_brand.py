#!/usr/bin/env python3
"""Export the vector brand masters. Requires cairosvg, fonttools and Pillow.

Uses only local geometry and an installed DejaVu Sans font; no remote assets.
Illustrations are generated independently and aren't modified by this script.
"""
from pathlib import Path
import json
import os

from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'brand'
ICON = ROOT / 'LociAR/Resources/Assets.xcassets/AppIcon.appiconset'
WEB = ROOT / 'admin/app'
MINT = '#38E0B8'
NIGHT = '#060912'


def mark(color=MINT):
    return f'''<g fill="none" stroke="{color}" stroke-linecap="round" stroke-linejoin="round">
  <path stroke-width="64" d="M512 177C388 177 304 267 304 375C304 508 431 644 512 722C593 644 720 508 720 375C720 267 636 177 512 177Z"/>
  <path stroke-width="48" d="M316 650L224 690L512 810L800 690L708 650"/>
  <circle cx="512" cy="375" r="62" fill="{color}" stroke="none"/>
</g>'''


def svg(content, width=1024, height=1024):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{content}</svg>\n'


def render(source, destination, width, height, opaque=False):
    cairosvg.svg2png(bytestring=source.encode(), write_to=str(destination), output_width=width, output_height=height)
    if opaque:
        with Image.open(destination) as img:
            img = img.convert('RGBA')
            base = Image.new('RGB', img.size, NIGHT)
            base.paste(img, mask=img.getchannel('A'))
            base.save(destination, optimize=True)


def outlined_word(text, start_x, baseline, size, color, font):
    """SVG glyph outlines keep the approved lettering independent of client fonts."""
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    paths = []
    x = start_x
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        paths.append(f'<path fill="{color}" transform="translate({x:.3f} {baseline}) scale({scale:.6f} {-scale:.6f})" d="{pen.getCommands()}"/>')
        x += glyph.width * scale
    return ''.join(paths), x


def main():
    BRAND.mkdir(exist_ok=True)
    master = svg(mark())
    (BRAND / 'logomark.svg').write_text(master)
    render(master, BRAND / 'logomark.png', 1024, 1024)
    main_icon = svg(f'<rect width="1024" height="1024" fill="{NIGHT}"/>' + mark())
    render(main_icon, ICON / 'App-Icon-1024x1024@1x.png', 1024, 1024, opaque=True)
    for name, color in [('Dark', '#E9FFF8'), ('Tinted', '#E6E6E6')]:
        render(svg(mark(color)), ICON / f'App-Icon-{name}-1024x1024@1x.png', 1024, 1024)
    entries = []
    for variant in ['', 'Dark', 'Tinted']:
        entry = {'filename': f'App-Icon-{variant + "-" if variant else ""}1024x1024@1x.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}
        if variant:
            entry['appearances'] = [{'appearance': 'luminosity', 'value': variant.lower()}]
        entries.append(entry)
    (ICON / 'Contents.json').write_text(json.dumps({'images': entries, 'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')
    font_path = Path(os.environ.get('LOCIAR_BRAND_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    font = TTFont(font_path)
    for theme, color in [('light', '#F5F8FB'), ('dark', '#11161F')]:
        # Light names the lettering for dark surfaces; dark names lettering for light surfaces.
        first, x = outlined_word('Loci', 294, 187, 136, color, font)
        second, _ = outlined_word('AR', x, 187, 136, MINT, font)
        content = f'<g transform="translate(0 0) scale(0.25)">{mark()}</g>' + first + second
        wordmark = svg(content, 860, 256)
        (BRAND / f'wordmark-{theme}.svg').write_text(wordmark)
        render(wordmark, BRAND / f'wordmark-{theme}.png', 860, 256)
    render(main_icon, WEB / 'icon.png', 512, 512, opaque=True)
    render(main_icon, WEB / 'apple-icon.png', 180, 180, opaque=True)
    # Render each favicon size from vector rather than downscaling a large bitmap.
    import io
    frames = []
    for size in [16, 32, 48]:
        # Next's ICO loader accepts RGBA PNG entries; opaque alpha is preserved.
        frames.append(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=main_icon.encode(), output_width=size, output_height=size))).convert('RGBA'))
    frames[-1].save(WEB / 'favicon.ico', format='ICO', sizes=[(16,16), (32,32), (48,48)], append_images=frames[:-1])
    print('Brand masters, three icon appearances and web icons exported.')


if __name__ == '__main__':
    main()
