#!/bin/bash
# LociAR: build the app for an iOS Simulator against the live Firebase project (Config/Local.xcconfig),
# put the simulator at a seed place and launch it, to check the launch seed on the map.
# Double-click in Finder or run in Terminal on a Mac with Xcode. Writes nothing to Firebase by itself.
# SIM_LOCATION="lat,lng" moves the simulator (default: Piccadilly Circus, London, a world-capitals seed place).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
LOG="$REPO/.git/lociar-sim-live.log"
exec > >(tee "$LOG") 2>&1
finish() { echo ""; echo "Log: $LOG"; read -r -p "Kapatmak için Enter…" || true; }
trap finish EXIT

BUNDLE="com.khankartal.lociar"
LOCATION="${SIM_LOCATION:-51.51002,-0.13445}"
DERIVED="$REPO/build/sim-live"
command -v xcodebuild >/dev/null || { echo "❌ Xcode gerekli."; exit 1; }
grep -q '^LOCIAR_FIREBASE_PROJECT_ID *= *lociar-2f38c' Config/Local.xcconfig 2>/dev/null \
  || { echo "❌ Config/Local.xcconfig canlı proje (lociar-2f38c) için ayarlı değil."; exit 1; }
if grep -Eq '^LOCIAR_EMULATOR_HOST *= *[^ ]+' Config/Local.xcconfig; then
  echo "❌ LOCIAR_EMULATOR_HOST dolu: uygulama emülatöre bağlanır. Canlı test için boş bırak."; exit 1
fi

# The newest available iPhone simulator, booted if needed.
SIM="${SIM_UDID:-$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = [d for runtime, items in sorted(json.load(sys.stdin)["devices"].items()) if "iOS" in runtime
           for d in items if d["name"].startswith("iPhone")]
booted = [d for d in devices if d["state"] == "Booted"]
print((booted or devices or [{"udid": ""}])[-1]["udid"])')}"
[ -n "$SIM" ] || { echo "❌ Kullanılabilir iPhone simülatörü yok."; exit 1; }
echo "Simülatör: $(xcrun simctl list devices | grep "$SIM" | sed 's/^ *//')"
xcrun simctl boot "$SIM" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$SIM"

echo ""
echo "==> Derleniyor (Debug, simülatör)"
xcodebuild -project LociAR.xcodeproj -scheme LociAR -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM" -derivedDataPath "$DERIVED" build -quiet
APP="$(ls -d "$DERIVED"/Build/Products/Debug-iphonesimulator/*.app | head -n 1)"

echo ""
echo "==> Yükleniyor ve açılıyor (konum: $LOCATION)"
xcrun simctl bootstatus "$SIM" -b >/dev/null
xcrun simctl install "$SIM" "$APP"
xcrun simctl privacy "$SIM" grant location-always "$BUNDLE" 2>/dev/null || xcrun simctl privacy "$SIM" grant location "$BUNDLE" 2>/dev/null || true
xcrun simctl location "$SIM" set "$LOCATION"
xcrun simctl launch "$SIM" "$BUNDLE"
echo ""
echo "✅ Uygulama açık. Haritada seed notlarını kontrol et."
