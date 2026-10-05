#!/bin/bash
# CANLI Firebase (lociar-2f38c) uçtan uca testi, bağlı iPhone'da. Emulator YOK.
# Faz A: kayıt -> Faz B: doğrulama bağlantısı tıklanır (scripts/.e2e/verified dosyası oluşunca devam) -> giriş + kalan testler.
# Test hesabı: scripts/.prod-email.txt içindeki e-posta (gerçek posta kutusuna ulaşmalı; ör. ad+e2e1@gmail.com).
set -uo pipefail
: "${TEST_RUNNER_E2E_PASSWORD:?TEST_RUNNER_E2E_PASSWORD ortam değişkeni gerekli; parola kaydedilmez.}"
export TEST_RUNNER_E2E_PASSWORD
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/scripts/.e2e"
mkdir -p "$OUT"
SUMMARY="$OUT/summary-prod-rest.txt"
DEVICE_ID="${DEVICE_ID:-00008120-001079DE0E07C01E}"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$SUMMARY"; }
: > "$SUMMARY"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
sed -i '' "s/^LOCIAR_EMULATOR_HOST.*/LOCIAR_EMULATOR_HOST =/" Config/Local.xcconfig
log "Emulator adresi temizlendi (canli Firebase)."
EMAIL="$(cat scripts/.prod-email.txt 2>/dev/null | tr -d '[:space:]')"
[ -z "$EMAIL" ] && { log "HATA: scripts/.prod-email.txt yok"; exit 1; }
rm -f "$OUT/verified"
export TEST_RUNNER_E2E_EMAIL="$EMAIL"
log "Test hesabi: $EMAIL"
COMMON=(-project LociAR.xcodeproj -scheme LociAR -destination "id=$DEVICE_ID" -allowProvisioningUpdates)
log "build-for-testing..."
xcodebuild build-for-testing "${COMMON[@]}" > "$OUT/build-prod-rest.log" 2>&1 || { log "HATA: build-for-testing"; grep -E "error:" "$OUT/build-prod-rest.log" | head -20 | tee -a "$SUMMARY"; exit 1; }
log "build OK"

run_test() {
  t="$1"; rm -rf "$OUT/$t.xcresult"; log "RUN $t"
  xcodebuild test-without-building "${COMMON[@]}" -only-testing:"LociARUITests/AuthGateUITests/$t" \
    -resultBundlePath "$OUT/$t.xcresult" > "$OUT/$t.log" 2>&1
  code=$?
  if grep -q "Test Case .*$t.* passed" "$OUT/$t.log"; then log "  PASS $t"; return 0
  elif grep -q "skipped" "$OUT/$t.log"; then log "  SKIP $t"; return 0
  else log "  FAIL $t (kod $code)"; grep -E "error: |XCTAssert|failed -|\[E2E\]|\[DEBUG\]|\[LociAR auth\]" "$OUT/$t.log" | head -15 | tee -a "$SUMMARY"; return 1; fi
}

for t in testProd01SignIn testEmulator03BrowseTabsAndEditProfile testEmulator05SignOutAndBackIn testEmulator09DeleteAccount; do
  run_test "$t" || { [ "$t" = testProd01SignIn ] && break; }
done
log "BITTI"
