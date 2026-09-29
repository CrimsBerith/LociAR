#!/bin/bash
# Starts the Firebase Local Emulator Suite (Auth, Firestore, Storage, Functions) for LociAR
# so the app can be tested end-to-end on a physical iPhone without a paid Firebase plan.
#
# What this does:
#   1. Detects this Mac's LAN IP (the iPhone must reach it over WiFi -- "localhost" won't work
#      from a physical device) and writes it into Config/Local.xcconfig as LOCIAR_EMULATOR_HOST.
#   2. Builds the Cloud Functions.
#   3. Starts the emulators in the foreground. Leave this window open while testing; Ctrl+C to stop.
#
# After this is running, rebuild + reinstall the app on the iPhone from Xcode (Debug config)
# so it picks up the new LOCIAR_EMULATOR_HOST value, then use the app normally: sign-up,
# sign-in, posting, etc. all go through these emulators instead of production.
set -uo pipefail
cd "$(dirname "$0")/.."
pause() { read -r -p "Kapatmak icin Enter'a basin... "; }

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null)"
if [ -z "$LAN_IP" ]; then
  echo "XX LAN IP bulunamadi (en0/en1). WiFi'ye bagli oldugunuzdan emin olun."
  pause
  exit 1
fi
echo ">> Mac LAN IP: $LAN_IP  (iPhone bu adrese baglanacak)"

CONFIG_FILE="Config/Local.xcconfig"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '^LOCIAR_EMULATOR_HOST' "$CONFIG_FILE"; then
    sed -i '' "s/^LOCIAR_EMULATOR_HOST.*/LOCIAR_EMULATOR_HOST = $LAN_IP/" "$CONFIG_FILE"
  else
    echo "LOCIAR_EMULATOR_HOST = $LAN_IP" >> "$CONFIG_FILE"
  fi
  echo "OK $CONFIG_FILE guncellendi -> LOCIAR_EMULATOR_HOST = $LAN_IP"
else
  echo "XX $CONFIG_FILE bulunamadi. Config/Local.xcconfig.example dosyasini kopyalayip doldurun."
  pause
  exit 1
fi

echo "$LAN_IP" > scripts/.emulator-host.txt

# macOS always ships a /usr/bin/java stub that fails at runtime if no JDK is installed,
# so `command -v java` alone is not a reliable check -- always prefer a real Homebrew JDK
# when one is present, regardless of what's already on PATH.
for jdk in /opt/homebrew/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk@21/bin /usr/local/opt/openjdk/bin; do
  if [ -x "$jdk/java" ]; then export PATH="$jdk:$PATH"; break; fi
done
if ! java -version >/dev/null 2>&1; then
  echo "XX Java bulunamadi/calismiyor. Once scripts/install-java.command dosyasini calistirin, sonra bunu tekrar baslatin."
  pause
  exit 1
fi

echo "Cloud Functions build ediliyor..."
( cd functions && npm install --no-fund --no-audit && npm run build ) || { echo "XX Functions build basarisiz."; pause; exit 1; }

echo ""
echo ">> Emulator Suite baslatiliyor (Auth :9099, Firestore :8080, Storage :9199, Functions :5001)"
echo "   Bu pencereyi ACIK birakin. Durdurmak icin Ctrl+C."
echo ""
echo "!!  Simdi Xcode'da uygulamayi Debug modda yeniden derleyip iPhone'a kurun ki"
echo "    LOCIAR_EMULATOR_HOST = $LAN_IP degerini alsin."
echo ""

# Stop an older instance (e.g. one bound only to 127.0.0.1) so the ports are free.
for port in 9099 8080 9199 5001 4400 4500 9150; do
  lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
done
sleep 1

npx -y firebase-tools@latest emulators:start \
  --only auth,firestore,storage,functions \
  --project lociar-2f38c \
  --import=./.emulator-data \
  --export-on-exit=./.emulator-data

pause
