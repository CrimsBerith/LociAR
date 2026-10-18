#!/usr/bin/env python3
"""Lists the UI strings of the iOS app (LociAR/**/*.swift) that need a catalog entry.

Keys are the Turkish source literals. A literal is collected when it
  * is the first argument of a SwiftUI initializer/modifier that localizes literals
    (Text, Button, Label, navigationTitle, alert, ...), or of String(localized:), or
  * contains Turkish letters or reads like a sentence (it may be shown through a String
    property that the views localize at display time with `.localizedUI`).
Interpolations become format specifiers: names in INT_HINTS → %lld, everything else → %@.
Output: JSON {key: [files]} on stdout. Used by build-catalog.mjs / check scripts.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'LociAR')
TURKISH = re.compile(r"[çğıöşüÇĞİÖŞÜâÂîû]")
INT_HINTS = re.compile(r"(count|Count|meters|Meters|degrees|attempt|Int\(|roundedMeters|\.count\b|minutes|seconds|days|hours|length|limit|index|remaining|failed|Failed)")
SKIP_PREFIXES = (
    'systemImage:', 'systemName:', 'accessibilityIdentifier(', 'forKey:', 'collection(',
    'whereField(', 'document(', 'named:', 'subsystem:', 'category:', 'withPurposeKey:',
    '.child(', 'URL(string:', 'order(by:', 'httpsCallable(', 'call(', 'logger.', 'Logger(',
    'print(', 'NSLog(', 'debugTrace(', 'fatalError(', 'precondition', 'assert', 'predicate',
    'NSPredicate', 'environment[', 'arguments.contains(', 'AppStorage(', 'font(', 'format:',
)


def escaped_at(text, index):
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and text[cursor] == chr(92):
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 1


def strip_comments(text):
    out, i, n = [], 0, len(text)
    in_str = False
    while i < n:
        if not in_str and text.startswith('//', i):
            j = text.find('\n', i); i = n if j < 0 else j; continue
        if not in_str and text.startswith('/*', i):
            j = text.find('*/', i); i = n if j < 0 else j + 2; continue
        c = text[i]
        if c == '"' and not text.startswith('"""', i):
            if not escaped_at(text, i): in_str = not in_str
        out.append(c); i += 1
    return ''.join(out)

LIT = re.compile(r'"((?:[^"\\\n]|\\.)*)"')

def interpolation_end(raw, start):
    depth, cursor = 1, start + 2
    while cursor < len(raw) and depth:
        if raw[cursor] == '(': depth += 1
        elif raw[cursor] == ')': depth -= 1
        cursor += 1
    return cursor


def to_key(raw):
    """Swift literal body → catalog key (interpolations → specifiers)."""
    out, i = [], 0
    escapes = {'\\n': '\n', '\\"': '"', '\\\\': '\\'}
    while i < len(raw):
        if raw.startswith('\\(', i):
            end = interpolation_end(raw, i)
            expression = raw[i + 2:end - 1]
            out.append('%lld' if INT_HINTS.search(expression) else '%@')
            i = end
            continue
        pair = raw[i:i + 2]
        if pair in escapes:
            out.append(escapes[pair])
            i += 2
        else:
            out.append(raw[i])
            i += 1
    return ''.join(out)

SKIP_FILES = {'ARCoreCoverageDebugView.swift', 'UITestFixtures.swift'}  # DEBUG / fixture content
ENGLISH_WORDS = {
    'At', 'Content', 'Creation', 'Dropped', 'Invalid', 'Legacy', 'accuracy', 'after', 'allowed', 'cancelled', 'caption', 'content', 'date', 'disabled', 'edit', 'enabled', 'error', 'failed', 'frame', 'hosting', 'image', 'invalid', 'layer', 'least', 'limit', 'link', 'missing', 'not', 'out', 'permission', 'reached', 'required', 'session', 'start', 'state', 'the', 'timed', 'to', 'undecodable', 'was', 'with'
}

def contains_english(text):
    return any(word in ENGLISH_WORDS for word in re.findall(r'\b\w+\b', text)) or bool(re.search(r'\bGPS accuracy\b', text))


# Literals the extractor would pick up but that are never shown to users: log/diagnostic lines,
# DEBUG-only paths, identifiers and unit-only formats (numbers and units stay as formatted).
EXCLUDE = {
    '\n[DEBUG] %@ %@: %@', '%@ m', '%lld m', 'AR frame: %@', 'tracking=%@ mapping=%@ features=%lld planes=%lld meshes=%lld', 'AR state=%@ tracking=%@ mapping=%@ message=%@',
    'Dikey yüzeyde AR görünümü açılamadı: %@', 'Geçersiz AR durum geçişi: %@ → %@',
    'World map size raw=%lld compressed=%lld', 'World-map %lld. denemede alındı; %lld anchor içeriyor.',
    'World-map alma denemesi %lld/%@ başarısız: %@', 'Publish committed post=%@', 'Publish intent persisted post=%@',
    'Publish paused post=%@', 'Publish queued post=%@ reason=offline', 'Sync committed operation=%@ id=%@', 'Sync paused id=%@',
    'apns_registration_failed: %@', 'ensure_profile_failed: %@', 'push_authorization_failed: %@', 'push_register_failed: %@',
    'push_unregister_failed: %@', 'registerCloudAnchor rejected: %@', 'world_map_save_failed: %@',
    'Visit request completed in %lld ms; admitted: %@', 'Local notification queue completed in %lld ms',
    ' : cleanHandle)', '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._', 'AIza', 'YOUR-', 'begin ', 'LZM1',
    'GeospatialAccuracy', 'CFBundleShortVersionString', 'CFBundleVersion', 'LociARStagedMedia', 'LociARWorldMaps', 'RCTAsyncLocalStorage', 'RCTAsyncLocalStorage_V1',
    'RNCAsyncLocalStorage_V1', 'Legacy dead-letter', '^[a-z0-9_.]{3,30}$', 'cannot publish', 'protected zone', 'verified Apple',
    'verified Apple, Google, or email identity', '18+ content', 'E', 'LociAR Pin',
    '⚠️ Yetki yok (token / ARCore API)', '✅ VPS mevcut', '❌ VPS yok', '❓ Bilinmiyor',
    'ARCore kapsam kontrolü (debug)', 'ARCore kapsamı', 'Kontrol ediliyor…', 'VPS kapsamını kontrol et', 'Loci', '%lld', '%lld/500', '%lld/220', 'Only text', 'Only one GIF', 'Powered by GIPHY',
    'Physical AR world lock evidence is incomplete',
    ') : cleanHandle)', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._', 'LociAR.Push', 'LociAR.RegionMonitoring', 'Report reason',
    '^[A-Za-z0-9_-]{1,200}$', 'lociar.acceptedAccountDeletions',
}

# Shown to users but not written as a literal in the app (activity texts written by Cloud
# Functions, functions/src/triggers.ts), or nested inside an interpolation the scanner skips
# ('kullanıcı' in ProfileEditView).
EXTRA = ['kullanıcı', 'yorum', 'bilinmiyor', 'normal', 'Postunu beğendi.', 'Postuna yorum yaptı.', 'Seni takip etmeye başladı.']

UI_CONTEXT = re.compile(r"(Text|Button|Label|navigationTitle|alert|confirmationDialog|TextField|SecureField|Toggle|Section|Link|Menu|accessibilityLabel|accessibilityHint|Annotation|String\(localized:)\(?\s*$")

def wanted(key, before):
    if key in EXCLUDE: return False
    if UI_CONTEXT.search(before) and re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", key): return True
    if re.fullmatch(r"[A-Z0-9_]+", key) or key.startswith(('Brand', 'HelveticaNeue')): return False
    if not TURKISH.search(key) and contains_english(key): return False
    if not re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", key): return False
    if before.rstrip().endswith(SKIP_PREFIXES): return False
    if re.fullmatch(r"[a-z0-9_.\-/:%@]+", key): return False      # identifiers, keys, paths
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", key) and not TURKISH.search(key) and key[0].islower(): return False
    if key.startswith(('http', 'lociar:', 'com.', '#', 'UITEST', 'NS', 'UI')): return False
    return True

def main():
    keys = {}
    for dirpath, _, files in os.walk(SRC):
        for name in sorted(files):
            if not name.endswith('.swift') or name in SKIP_FILES: continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT)
            text = strip_comments(open(path, encoding='utf-8').read())
            for m in LIT.finditer(text):
                raw = m.group(1)
                before = text[max(0, m.start() - 60):m.start()]
                key = to_key(raw)
                if not wanted(key, before.split('\n')[-1]): continue
                keys.setdefault(key, set()).add(rel)
    for key in EXTRA: keys.setdefault(key, set()).add('functions/src')
    json.dump({k: sorted(v) for k, v in sorted(keys.items())}, sys.stdout, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
