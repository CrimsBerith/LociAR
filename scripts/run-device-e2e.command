#!/bin/bash
# End-to-end test of the real app on the connected iPhone against the local Firebase
# Emulator Suite: sign-up -> email verification -> sign-in (ensureProfile) -> AR camera ->
# publish + discover + delete text post -> tabs + profile edit -> sign-out/in -> account deletion.
# Results: scripts/.e2e/summary.txt (+ per-test logs and .xcresult bundles with screenshots).
set -uo pipefail
umask 077
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/scripts/.e2e/device-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$OUT"
SUMMARY="$OUT/summary.txt"
if [ -z "${DEVICE_ID:-}" ]; then
  xcrun devicectl list devices --json-output "$OUT/devices.json" >/dev/null 2>&1 || exit 1
  DETECTED_DEVICE="$(python3 -c 'import json,sys; ds=[d for d in json.load(open(sys.argv[1]))["result"]["devices"] if d.get("hardwareProperties",{}).get("deviceType")=="iPhone"]; print(ds[0]["hardwareProperties"]["udid"] if len(ds)==1 else "")' "$OUT/devices.json")"
  DEVICE_ID="$DETECTED_DEVICE"
  [ -z "$DEVICE_ID" ] && { echo "HATA: bagli iPhone yok (DEVICE_ID=...)"; exit 1; }
fi
PROJECT_ID="demo-lociar"
AUTH="127.0.0.1:9099"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$SUMMARY"; }
: > "$SUMMARY"

for jdk in /opt/homebrew/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk@21/bin; do
  if [ -x "$jdk/java" ]; then export PATH="$jdk:$PATH"; break; fi
done
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
[ "$NODE_MAJOR" = 22 ] || { log "HATA: PATH içinde Node 22 seçilmeli"; exit 1; }

# Keep a running emulator's dependencies intact.
[ -x functions/node_modules/.bin/firebase ] || { log "HATA: önce Node 22 ile functions bağımlılıklarını kurun"; exit 1; }

# 1) The phone reaches the Mac over Wi-Fi; configuration is passed only to this build.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$LAN_IP" ] && { log "HATA: LAN IP yok"; exit 1; }
log "LAN IP: $LAN_IP"
AUTH="$LAN_IP:9099"
EMULATOR_PID=""
VERIFY_PID=""
cleanup() {
  [ -n "$VERIFY_PID" ] && kill "$VERIFY_PID" 2>/dev/null || true
  [ -n "$EMULATOR_PID" ] && kill "$EMULATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 2) Emulators. Reuse only if the PHONE can reach them (bound to 0.0.0.0, see firebase.json);
#    occupied ports are reported without stopping another project's services.
if curl -sf "http://$LAN_IP:9099/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1; then
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"data":{}}' "http://$LAN_IP:5001/$PROJECT_ID/us-central1/readPlaceNoteRegions")"
  [ "$STATUS" = 401 ] || { log "HATA: mevcut Functions emulator demo-lociar projesine ait değil"; exit 1; }
  log "Emulator zaten calisiyor (LAN'dan erisilebilir)."
else
  if curl -sf "http://$AUTH/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1; then
    log "HATA: mevcut emulator yalnız 127.0.0.1'de. Sahibinden durdurmasını isteyin."
    exit 1
  fi
  for port in 9099 8080 9199 5001 4400 4500 9150; do
    if lsof -ti tcp:$port -sTCP:LISTEN >/dev/null 2>&1; then
      log "HATA: $port portu kullanımda; mevcut servisi sahibi durdurmalı."
      exit 1
    fi
  done
  sleep 2
  log "Functions build + emulator baslatiliyor..."
  ( cd functions && npm run build >/dev/null 2>&1 ) || { log "HATA: functions build"; exit 1; }
  nohup ./functions/node_modules/.bin/firebase emulators:start --only auth,firestore,storage,functions \
    --project "$PROJECT_ID" > "$ROOT/scripts/.emulator.log" 2>&1 &
  EMULATOR_PID=$!
  for i in $(seq 1 90); do
    curl -sf "http://$LAN_IP:9099/emulator/v1/projects/$PROJECT_ID/config" >/dev/null 2>&1 && grep -q "All emulators ready" "$ROOT/scripts/.emulator.log" && break
    sleep 2
  done
  grep -q "All emulators ready" "$ROOT/scripts/.emulator.log" || { log "HATA: emulator hazir olmadi (scripts/.emulator.log)"; exit 1; }
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"data":{}}' "http://$LAN_IP:5001/$PROJECT_ID/us-central1/ensureProfile")"
  [ "$STATUS" = 401 ] || { log "HATA: Functions yüklenmedi; emulator hazır mesajı tek başına yeterli değil"; exit 1; }
  log "Emulator hazir."
fi

# 3) Background loop: verify every pending verification email (replaces clicking the link)
(
  while true; do
    curl -s "http://$AUTH/emulator/v1/projects/$PROJECT_ID/oobCodes" | AUTH_BASE="$AUTH" python3 -c '
import json,sys,os,urllib.request
try: data=json.load(sys.stdin)
except Exception: sys.exit(0)
for c in data.get("oobCodes",[]):
    if c.get("requestType")=="VERIFY_EMAIL":
        try: urllib.request.urlopen("http://%s/emulator/action?mode=verifyEmail&oobCode=%s&apiKey=fake-api-key" % (os.environ["AUTH_BASE"], c["oobCode"]), timeout=5).read()
        except Exception: pass
' >/dev/null 2>&1
    sleep 2
  done
) &
VERIFY_PID=$!

# 4) Build once, then run tests one by one in a fixed order
export TEST_RUNNER_E2E_EMAIL="e2e$(date +%s)@lociar.test"
export TEST_RUNNER_E2E_PASSWORD="$(openssl rand -hex 24)"
export TEST_RUNNER_E2E_DEMO_EMULATOR_HTTP=1
[ -n "$TEST_RUNNER_E2E_PASSWORD" ] || { log "HATA: test parolası üretilemedi"; exit 1; }
log "Test hesabi: $TEST_RUNNER_E2E_EMAIL"
COMMON=(-project LociAR.xcodeproj -scheme LociAR -configuration Debug -destination "id=$DEVICE_ID" -allowProvisioningUpdates -parallel-testing-enabled NO -derivedDataPath "$OUT/DerivedData"
  "LOCIAR_EMULATOR_HOST=$LAN_IP"
  "LOCIAR_FIREBASE_PROJECT_ID=$PROJECT_ID"
  "LOCIAR_FIREBASE_STORAGE_BUCKET=$PROJECT_ID.firebasestorage.app"
  "LOCIAR_FIREBASE_API_KEY=AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  "LOCIAR_FIREBASE_GOOGLE_APP_ID=1:123456789012:ios:abcdef0123456789"
  "LOCIAR_FIREBASE_GCM_SENDER_ID=123456789012")
log "build-for-testing..."
xcodebuild build-for-testing "${COMMON[@]}" > "$OUT/build.log" 2>&1 || { log "HATA: build-for-testing (scripts/.e2e/build.log)"; grep -E "error:" "$OUT/build.log" | head -20 | tee -a "$SUMMARY"; exit 1; }
log "build OK"
python3 - "$OUT/DerivedData/Build/Products/Debug-iphoneos/LociAR.app/Info.plist" "$LAN_IP" <<'PY' || exit 1
import plistlib,sys
with open(sys.argv[1], "rb") as f: d=plistlib.load(f)
assert d["LOCIAR_EMULATOR_HOST"]==sys.argv[2]
assert d["LOCIAR_FIREBASE_PROJECT_ID"]=="demo-lociar"
assert d["LOCIAR_FIREBASE_STORAGE_BUCKET"]=="demo-lociar.firebasestorage.app"
assert d["LOCIAR_FIREBASE_API_KEY"]=="AIza"+"A"*35
assert d["LOCIAR_FIREBASE_GOOGLE_APP_ID"]=="1:123456789012:ios:abcdef0123456789"
assert d["LOCIAR_FIREBASE_GCM_SENDER_ID"]=="123456789012"
PY

TESTS=(
  testEmulator01SignUpVerifyAndSignIn
  testPhysicalNormalAccountARTabReceivesCameraFrame
  testPhysicalNormalAccountPublishesTextARPostAndDeletesIt
  testEmulator03BrowseTabsAndEditProfile
  testEmulator05SignOutAndBackIn
  testEmulator09DeleteAccount
)
FAILED_TESTS=0
SKIPPED_TESTS=0
for t in "${TESTS[@]}"; do
  rm -rf "$OUT/$t.xcresult"
  log "RUN $t"
  xcodebuild test-without-building "${COMMON[@]}" -only-testing:"LociARUITests/AuthGateUITests/$t" \
    -resultBundlePath "$OUT/$t.xcresult" > "$OUT/$t.log" 2>&1
  code=$?
  if [ "$code" -eq 0 ] && grep -q "Test Case .*$t.* passed" "$OUT/$t.log"; then log "  PASS $t"
  elif [ "$code" -eq 0 ] && grep -q "Test Case .*$t.* skipped\|Test skipped" "$OUT/$t.log"; then
    SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
    log "  SKIP $t"; grep -E "Test skipped|XCTSkip" "$OUT/$t.log" | head -3 | tee -a "$SUMMARY"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log "  FAIL $t (kod $code)"
    grep -E "error: |XCTAssert|failed -|\[E2E\]|\[LociAR auth\]" "$OUT/$t.log" | head -15 | tee -a "$SUMMARY"
  fi
done
log "BITTI"
if [ "$FAILED_TESTS" -gt 0 ] || [ "$SKIPPED_TESTS" -gt 0 ]; then
  log "KABUL BASARISIZ: $FAILED_TESTS hata, $SKIPPED_TESTS atlanan zorunlu test"
  exit 1
fi
