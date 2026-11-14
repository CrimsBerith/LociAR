#!/bin/bash
# LociDrop — Mac doğrulama ve push. Tek betik; her Swift değişikliğinden sonra çift tıkla.
# 1) iOS birim testleri (simülatör)  2) cihaz hedefli derleme  3) yeşilse mevcut dalı push eder.
# Merge, deploy, App Store Connect, secret YOK. Log: build/verify/verify.log
cd "$(dirname "$0")/.."
caffeinate -dimsu -w $$ &
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
OUT=build/verify; mkdir -p "$OUT"; LOG="$OUT/verify.log"; : > "$LOG"
LOCKDIR=$OUT/.running; mkdir "$LOCKDIR" 2>/dev/null || { echo "verify zaten çalışıyor; bitmesini bekle."; exit 1; }
trap 'rmdir "$LOCKDIR"' EXIT
step() { echo "=== $* $(date +%H:%M:%S) ===" | tee -a "$LOG"; }
fail() { echo "FAIL: $*" | tee -a "$LOG"; echo "Durdu. Claude'a 'verify bitti' yaz ve FAIL satırını gönder."; exit 1; }
BR=$(git branch --show-current)
step "branch $BR"
for f in .git/*.lock; do [ -e "$f" ] && fail "kilit dosyası var: $f"; done
[ -z "$(git status --porcelain --untracked-files=no)" ] || { git status --short | head -20 | tee -a "$LOG"; fail "commit edilmemiş değişiklik var; önce commit et (ya da stash)"; }
git log --oneline -3 >>"$LOG"
step unit-tests
CI=$OUT/run-$(date +%Y%m%d-%H%M%S); mkdir -p "$CI"
SIM=$(xcrun simctl list devices available -j | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
for r in sorted(d,reverse=True):
    if 'iOS' not in r: continue
    c=[x for x in d[r] if x.get('isAvailable') and x['name'].startswith('iPhone')]
    if c: print(c[0]['udid']); break")
[ -n "$SIM" ] || fail "no simulator"
xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1
xcodebuild -project LociAR.xcodeproj -scheme LociAR -configuration Debug -destination "platform=iOS Simulator,id=$SIM" \
  -derivedDataPath "$OUT/DerivedData" -resultBundlePath "$CI/tests.xcresult" -only-testing:LociARTests \
  -parallel-testing-enabled NO -testLanguage tr -testRegion TR CODE_SIGNING_ALLOWED=NO test > "$CI/tests.log" 2>&1
RC=$?
grep -E "error:|Executed [0-9]+ tests, with|\*\* TEST (SUCCEEDED|FAILED) \*\*|failed \(" "$CI/tests.log" | grep -v "Firebase" | tail -30 >>"$LOG"
[ $RC -eq 0 ] || fail "unit tests rc=$RC ($CI/tests.log)"
python3 scripts/l10n/check_stringsdata.py "$OUT/DerivedData" >>"$LOG" 2>&1 || fail stringsdata
step device-build
xcodebuild -project LociAR.xcodeproj -scheme LociAR -configuration Debug -destination "generic/platform=iOS" \
  -derivedDataPath "$OUT/DerivedDataDevice" CODE_SIGNING_ALLOWED=NO build > "$CI/device-build.log" 2>&1
RC=$?
grep -E "error:|\*\* BUILD (SUCCEEDED|FAILED) \*\*" "$CI/device-build.log" | tail -20 >>"$LOG"
[ $RC -eq 0 ] || fail "device build rc=$RC ($CI/device-build.log)"
step push
git push -u origin "$BR" >>"$LOG" 2>&1 || fail push
# Eski koşu klasörlerini temizle (son 3 kalsın)
ls -dt "$OUT"/run-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null
step DONE
echo "Bitti ($BR push edildi). Claude'a 'verify bitti' yaz."
