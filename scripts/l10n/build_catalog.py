#!/usr/bin/env python3
"""Builds LociAR/Resources/Localizable.xcstrings and InfoPlist.xcstrings from the tables in
scripts/l10n (12 languages). Keys are the Turkish source literals found by extract.py.

  python3 scripts/l10n/build_catalog.py           # write both catalogs
  python3 scripts/l10n/build_catalog.py --check   # CI: fail if a key or language is missing,
                                                   # a format specifier differs, or the
                                                   # committed catalogs are out of date

The development region stays `en` (unsupported device languages fall back to English); `tr`
values are the keys themselves unless translations/tr.json overrides them (e.g. push.* keys).
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LANGS = ['tr', 'en', 'de', 'es', 'fr', 'pt', 'ru', 'ar', 'hi', 'bn', 'ja', 'zh-Hans']
CATALOG = os.path.join(ROOT, 'LociAR', 'Resources', 'Localizable.xcstrings')
INFOPLIST_CATALOG = os.path.join(ROOT, 'LociAR', 'Resources', 'InfoPlist.xcstrings')
SPEC = re.compile(r'%(?:lld|@|d|lf)')


def load(name):
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return json.load(f)


def unit(value):
    return {'stringUnit': {'state': 'translated', 'value': value}}


def specs(text):
    return sorted(SPEC.findall(text))


def build():
    keys = json.loads(subprocess.check_output([sys.executable, os.path.join(HERE, 'extract.py')]))
    tables = {lang: load(f'translations/{lang}.json') for lang in LANGS}
    plurals = load('plurals.json')
    problems = []
    strings = {}
    for key in sorted(keys):
        localizations = {}
        for lang in LANGS:
            value = tables[lang].get(key, key if lang == 'tr' else None)
            if value is None:
                problems.append(f'missing {lang}: {key!r}')
                continue
            expected = specs(key) if not key.startswith('push.') else ['%@']
            if specs(value) != expected:
                problems.append(f'format specifiers differ in {lang}: {key!r} -> {value!r}')
            forms = plurals.get(key, {}).get(lang)
            if forms:
                for form, text in forms.items():
                    if specs(text) != expected:
                        problems.append(f'plural {form} specifiers differ in {lang}: {key!r}')
                localizations[lang] = {'variations': {'plural': {form: unit(text) for form, text in forms.items()}}}
            else:
                localizations[lang] = unit(value)
        strings[key] = {'extractionState': 'manual', 'localizations': localizations}
    for lang in LANGS:
        for stale in sorted(set(tables[lang]) - set(keys)):
            if lang != 'tr':
                problems.append(f'unused {lang} entry: {stale!r}')
    catalog = {'sourceLanguage': 'en', 'strings': strings, 'version': '1.0'}

    info = load('infoplist.json')
    info_strings = {}
    for key, values in sorted(info.items()):
        missing = [lang for lang in LANGS if lang not in values]
        if missing:
            problems.append(f'InfoPlist {key} missing {missing}')
        info_strings[key] = {
            'extractionState': 'manual',
            'localizations': {lang: unit(values[lang]) for lang in LANGS if lang in values},
        }
    info_catalog = {'sourceLanguage': 'en', 'strings': info_strings, 'version': '1.0'}
    return catalog, info_catalog, problems, len(keys)


def dump(obj):
    # Xcode writes " : " separators and 2-space indentation; match it to keep diffs small.
    return json.dumps(obj, ensure_ascii=False, indent=2, separators=(',', ' : ')) + '\n'


def main():
    check = '--check' in sys.argv
    catalog, info_catalog, problems, count = build()
    if problems:
        print('\n'.join(problems[:50]))
        print(f'{len(problems)} localization problem(s)')
        sys.exit(1)
    outputs = {CATALOG: dump(catalog), INFOPLIST_CATALOG: dump(info_catalog)}
    if check:
        stale = [path for path, text in outputs.items()
                 if not os.path.exists(path) or open(path, encoding='utf-8').read() != text]
        if stale:
            print('Out of date (run python3 scripts/l10n/build_catalog.py):', *stale, sep='\n  ')
            sys.exit(1)
        print(f'OK: {count} keys × {len(LANGS)} languages, catalogs up to date')
        return
    for path, text in outputs.items():
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
    print(f'Wrote {count} keys × {len(LANGS)} languages')


if __name__ == '__main__':
    main()
