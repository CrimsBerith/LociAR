#!/usr/bin/env python3
"""CI check after an Xcode build: every localizable key the Swift compiler extracted (the
*.stringsdata files under the derived data folder) must exist in Localizable.xcstrings. This
catches what extract.py can only guess, e.g. the exact format specifier of an interpolation.

  python3 scripts/l10n/check_stringsdata.py <derived-data-path>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import EXCLUDE  # noqa: E402  keys deliberately left untranslated (brands, DEBUG, numbers)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CATALOG = os.path.join(ROOT, 'LociAR', 'Resources', 'Localizable.xcstrings')
LETTERS = re.compile(r'[A-Za-zÇĞİÖŞÜçğıöşü]')
SPECIFIERS = re.compile(r'%(?:lld|@|d|lf|%)')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    catalog = set(json.load(open(CATALOG, encoding='utf-8'))['strings'])
    extracted = {}
    files = 0
    for dirpath, _, names in os.walk(sys.argv[1]):
        for name in names:
            if not name.endswith('.stringsdata') or 'LociARTests' in dirpath or 'UITests' in dirpath:
                continue
            files += 1
            with open(os.path.join(dirpath, name), encoding='utf-8') as f:
                data = json.load(f)
            for entry in data.get('tables', {}).get('Localizable', []):
                key = entry.get('key', '')
                if key not in EXCLUDE and LETTERS.search(SPECIFIERS.sub('', key)):
                    extracted.setdefault(key, data.get('source', name))
    if files == 0:
        sys.exit('No .stringsdata files found; was SWIFT_EMIT_LOC_STRINGS enabled for this build?')
    missing = sorted(k for k in extracted if k not in catalog)
    for key in missing:
        print(f'missing in Localizable.xcstrings: {key!r}  ({os.path.basename(extracted[key])})')
    if missing:
        sys.exit(f'{len(missing)} extracted key(s) have no translation')
    print(f'OK: {len(extracted)} extracted keys from {files} files are all in the catalog')


if __name__ == '__main__':
    main()
