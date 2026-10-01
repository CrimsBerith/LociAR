#!/bin/bash
# End-to-end test of the real app on the connected iPhone against the local Firebase
# Emulator Suite: sign-up -> email verification -> sign-in (ensureProfile) -> AR camera ->
# publish + discover + delete post -> tabs + profile edit -> sign-out/in -> account deletion.
# Results: scripts/.e2e/summary.txt (+ per-test logs and .xcresult bundles with screenshots).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/scripts/.e2e"
mkdir -p "$OUT"
SUMMARY="$OUT/summary.txt"
if [ -z "${DEVICE_ID:-}" ]; then
  DETECTED_DEVICE="$(xcrun devicectl list devices 2>/dev/null | grep "available" | awk '{print $3}' | head -1)"
  DEVICE_ID="${DETECTED_DEVICE:-B2E7EFB8-A5CD-5671-BBE9-2A86FE9D7EB8}"
fi
PROJECT_ID="lociar-2f38c"
AUTH="127.0.0.1:9099"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$SUMMARY"; }
: > "$SUMMARY"

for jdk in /opt/homebrew/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk@21/bin; do
  if [ -x "$jdk/java" ]; then export PATH="$jdk:$PATH"; break; fi
done
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 1) LAN IP -> Local.xcconfig (the phone reaches the Mac over Wi-Fi)
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$LAN_IP" ] && { log "HATA: LAN IP yok"; exit 1; }
sed -i '' "s/^LOCIAR_EMULATOR_HOST.*/LOCIAR_EMULATOR_HOST = $LAN_IP/" Config/Local.xcconfig
log "LAN IP: $LAN_IP"

# 2) Emulators. Reuse only if the PHONE can reach them (bound to 0.0.0.0, see firebase.json);
#    an older instance bound to 127.0.0.1 is stopped and restarted.
if curl -sf "http://$LAN_IP:9099/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1; then
  log "Emulator zaten calisiyor (LAN'dan erisilebilir)."
else
  if curl -sf "http://$AUTH/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1; then
    log "Eski emulator sadece 127.0.0.1'de; durdurulup yeniden baslatiliyor."
  fi
  for port in 9099 8080 9199 5001 4400 4500 9150; do
    lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  done
  sleep 2
  log "Functions build + emulator baslatiliyor..."
  ( cd functions && npm install --no-fund --no-audit >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) || { log "HATA: functions build"; exit 1; }
  nohup npx -y firebase-tools@latest emulators:start --only auth,firestore,storage,functions \
    --project "$PROJECT_ID" > "$ROOT/scripts/.emulator.log" 2>&1 &
  disown || true
  for i in $(seq 1 90); do
    curl -sf "http://$LAN_IP:9099/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1 && grep -q "All emulators ready" "$ROOT/scripts/.emulator.log" && break
    sleep 2
  done
  grep -q "All emulators ready" "$ROOT/scripts/.emulator.log" || { log "HATA: emulator hazir olmadi (scripts/.emulator.log)"; exit 1; }
  log "Emulator hazir."
fi

# 3) Background loop: verify every pending verification email (replaces clicking the link)
(
  while true; do
    curl -s "http://$AUTH/emulator/v1/projects/$PROJECT_ID/oobCodes" | python3 -c '
import json,sys,urllib.request
try: data=json.load(sys.stdin)
except Exception: sys.exit(0)
for c in data.get("oobCodes",[]):
    if c.get("requestType")=="VERIFY_EMAIL":
        try: urllib.request.urlopen("http://127.0.0.1:9099/emulator/action?mode=verifyEmail&oobCode=%s&apiKey=fake-api-key" % c["oobCode"], timeout=5).read()
        except Exception: pass
' >/dev/null 2>&1
    sleep 2
  done
) &
VERIFY_PID=$!
trap 'kill $VERIFY_PID 2>/dev/null' EXIT

# 4) Build once, then run tests one by one in a fixed order
export TEST_RUNNER_E2E_EMAIL="e2e$(date +%s)@lociar.test"
export TEST_RUNNER_E2E_PASSWORD="E2eTest!2026x"
log "Test hesabi: $TEST_RUNNER_E2E_EMAIL"
COMMON=(-project LociAR.xcodeproj -scheme LociAR -destination "id=$DEVICE_ID" -allowProvisioningUpdates)
log "build-for-testing..."
xcodebuild build-for-testing "${COMMON[@]}" > "$OUT/build.log" 2>&1 || { log "HATA: build-for-testing (scripts/.e2e/build.log)"; grep -E "error:" "$OUT/build.log" | head -20 | tee -a "$SUMMARY"; exit 1; }
log "build OK"

TESTS=(
  testEmulator01SignUpVerifyAndSignIn
  testPhysicalNormalAccountARTabReceivesCameraFrame
  testPhysicalNormalAccountPublishesSocialARPostAndDeletesIt
  testEmulator03BrowseTabsAndEditProfile
  testEmulator05SignOutAndBackIn
  testEmulator09DeleteAccount
)
for t in "${TESTS[@]}"; do
  rm -rf "$OUT/$t.xcresult"
  log "RUN $t"
  xcodebuild test-without-building "${COMMON[@]}" -only-testing:"LociARUITests/AuthGateUITests/$t" \
    -resultBundlePath "$OUT/$t.xcresult" > "$OUT/$t.log" 2>&1
  code=$?
  if grep -q "Test Case .*$t.* passed" "$OUT/$t.log"; then log "  PASS $t"
  elif grep -q "Test Case .*$t.* skipped\|Test skipped" "$OUT/$t.log"; then log "  SKIP $t"; grep -E "Test skipped|XCTSkip" "$OUT/$t.log" | head -3 | tee -a "$SUMMARY"
  else
    log "  FAIL $t (kod $code)"
    grep -E "error: |XCTAssert|failed -|\[E2E\]|\[LociAR auth\]" "$OUT/$t.log" | head -15 | tee -a "$SUMMARY"
  fi
done
log "BITTI"
