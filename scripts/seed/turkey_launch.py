#!/usr/bin/env python3
"""Build the A/B launch drafts, never publish them. All street pins require map review.

Geometry: frozen OpenStreetMap street points, ODbL attribution in launch-street-points.geojson.
Text: individually edited LociAR notes, not customer reviews or claims of personal visits.
A has 150 Kadikoy + 100 Beyoglu notes and 12 field-only AR drafts. B has 120 notes + 11 AR.
Run with --check in CI; without it to rebuild both JSON files. No network or credentials.
"""
import json
import re
import unicodedata
import sys
from pathlib import Path

from world_capitals import distance, MAX_TEXT, MIN_SPACING_M, URL, style_problems

HERE = Path(__file__).resolve().parent
AUTHOR = 'loci.guide'
# Every item has an individually edited text. No modulo rotation or place-name
# substitution: adding a pin requires adding its own reviewed editorial entry.
def load_editorial():
    data = json.loads((HERE / 'editorial/turkey-notes.json').read_text())
    rows = data['items']
    if len({row['id'] for row in rows}) != len(rows):
        raise ValueError('duplicate editorial item ids')
    for row in rows:
        if not row.get('text') or len(row['text'].encode('utf-16-le')) // 2 > MAX_TEXT:
            raise ValueError(f"{row['id']}: invalid editorial text length")
        if row.get('persona_id') not in {f'P{number:02d}' for number in range(1, 51)}:
            raise ValueError(f"{row['id']}: missing writing persona")
        if row.get('persona_status', 'editorial_draft') not in {'editorial_draft', 'reviewed'}:
            raise ValueError(f"{row['id']}: invalid editorial review status")
    return {row['id']: row for row in rows}


EDITORIAL = load_editorial()
SEED_TYPES = {'reflection': 'hidden', 'quiet': 'aesthetic', 'comic': 'comic',
              'question': 'hidden', 'dialogue': 'talking', 'wordplay': 'comic',
              'observation': 'aesthetic', 'quest': 'quest'}

AREAS = [
    ('kadikoy', 'İstanbul', 'A', 150, 6), ('beyoglu', 'İstanbul', 'A', 100, 6),
    ('ankara', 'Ankara', 'B', 26, 1), ('izmir', 'İzmir', 'B', 10, 1),
    ('bursa', 'Bursa', 'B', 9, 1), ('antalya', 'Antalya', 'B', 10, 1),
    ('eskisehir', 'Eskişehir', 'B', 10, 1), ('konya', 'Konya', 'B', 10, 1),
    ('gaziantep', 'Gaziantep', 'B', 5, 1), ('izmit', 'İzmit', 'B', 10, 1),
    ('samsun', 'Samsun', 'B', 10, 1), ('trabzon', 'Trabzon', 'B', 10, 1),
    ('kayseri', 'Kayseri', 'B', 10, 1),
]


def choose_anchors(area, ar_count, points):
    anchors, seen = [], set()
    priorities = {'kadikoy': ['General Asım', 'Moda Caddesi', 'Rıhtım', 'Mühürdar Caddesi', 'Güneşlibahçe', 'Hacı Şükrü'],
                  'beyoglu': ['İstiklal', 'Galip Dede', 'Bankalar', 'Kemankeş', 'Meşrutiyet', 'Necatibey'],
                  'izmit': ['Fethiye']}
    for name in priorities.get(area, []):
        match = next((point for point in points if name in point['place']), None)
        if match is not None and len(anchors) < ar_count:
            anchors.append(match)
            seen.add(match['place'])
    for point in points:
        if point['place'] not in seen and len(anchors) < ar_count:
            anchors.append(point)
            seen.add(point['place'])
    if len(anchors) != ar_count:
        raise ValueError(f'{area}: not enough distinct streets for {ar_count} AR drafts')
    return anchors


def draft_item(area, city, layer, index, point, note_count):
    is_ar = index >= note_count
    editorial = EDITORIAL[f'{area}-{index + 1}']
    text = editorial['text']
    item = {'id': f'{area}-{index + 1}', 'kind': 'ar' if is_ar else 'note', 'type': 'talking' if is_ar else SEED_TYPES[editorial['editorial_type']],
            'persona_id': editorial['persona_id'], 'persona_status': editorial.get('persona_status', 'editorial_draft'),
            'editorial_type': editorial['editorial_type'],
            **({key: editorial[key] for key in ('author_handle', 'author_attribution') if key in editorial}),
            'lang': 'tr', 'text': text, 'lat': point['lat'], 'lng': point['lng'], 'radius_m': 25,
            'notify': not is_ar and index == 0, 'city': city, 'country': 'Türkiye', 'place': point['place'],
            'area_id': area, 'coord': 'approx', 'source': f"https://www.openstreetmap.org/way/{point['way']}",
            'content_origin': 'lociar-editorial-original', 'source_scope': 'street geometry; text is original editorial writing'}
    if is_ar: item['placement_requirement'] = 'field_cloud_anchor'
    return item


def area_items(area, city, layer, note_count, ar_count, points):
    anchors = choose_anchors(area, ar_count, points)
    notes = [point for point in points if point not in anchors][:note_count]
    if len(notes) != note_count:
        raise ValueError(f'{area}: only {len(notes)} usable note points, need {note_count}')
    return [draft_item(area, city, layer, index, point, note_count)
            for index, point in enumerate(notes + anchors)]


def problems_for(items, existing):
    # Ordinary voices can share "Bir şey" without being a template. Require
    # distinct full texts here, rather than forcing unnatural opening synonyms.
    problems = style_problems(items, check_openers=False)
    normalized = [re.sub(r'[^\w]+', ' ', unicodedata.normalize('NFKC', item['text']).casefold()).strip() for item in items]
    if len(normalized) != len(set(normalized)):
        problems.append('duplicate normalized editorial texts')
    if len({i['id'] for i in items}) != len(items): problems.append('duplicate ids')
    for index, item in enumerate(items):
        if len(item['text']) > MAX_TEXT or URL.search(item['text']): problems.append(f"{item['id']}: invalid text length or link")
        if not (-90 <= item['lat'] <= 90 and -180 <= item['lng'] <= 180): problems.append(f"{item['id']}: invalid coordinate")
        point = item['lat'], item['lng']
        if any(distance(point, (other['lat'], other['lng'])) < MIN_SPACING_M for other in items[:index] + existing):
            problems.append(f"{item['id']}: too close to another seed")
    return problems


def build():
    geometry = json.loads((HERE / 'launch-street-points.geojson').read_text())
    points = {f['properties']['id']: f['properties']['points'] for f in geometry['features']}
    existing = []
    for name in ['world-capitals', 'landmark-businesses']: existing += json.loads((HERE / f'{name}.json').read_text())['items']
    layers = {'A': [], 'B': []}
    for area, city, layer, notes, ar in AREAS:
        layers[layer] += area_items(area, city, layer, notes, ar, points[area])
    all_items = layers['A'] + layers['B']
    if {item['id'] for item in all_items} != set(EDITORIAL):
        raise ValueError('editorial ids must exactly match the A/B geometry items')
    problems = problems_for(all_items, existing)
    if problems: raise ValueError('\n'.join(problems))
    for layer, name in [('A', 'istanbul-beta'), ('B', 'turkey-streets')]:
        data = {'batch': f'{name}-2026-10', 'author_handle': AUTHOR,
                'review_required': 'All coordinates need map review; A AR requires field Cloud Anchors.',
                'geometry_attribution': '© OpenStreetMap contributors, ODbL 1.0', 'items': layers[layer]}
        text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
        path = HERE / f'{name}.json'
        if '--check' in sys.argv:
            if not path.exists() or path.read_text() != text: raise ValueError(f'{path.name} is out of date')
        else: path.write_text(text)
        print(f"{name}: {sum(i['kind'] == 'note' for i in layers[layer])} notes + {sum(i['kind'] == 'ar' for i in layers[layer])} AR drafts; all held for review")


if __name__ == '__main__':
    try: build()
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
