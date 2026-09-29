#!/bin/bash
# One-time setup: installs a JDK via Homebrew so the Firestore/Storage emulators can run
# (firebase emulators:start requires `java` on PATH). Safe to run once; a few minutes.
set -uo pipefail
cd "$(dirname "$0")/.."
pause() { read -r -p "Kapatmak icin Enter'a basin... "; }

BREW="$(command -v brew || true)"
for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -z "$BREW" ] && [ -x "$p" ] && BREW="$p"
done
if [ -z "$BREW" ]; then
  echo "XX Homebrew bulunamadi. https://brew.sh adresinden kurun, sonra bu scripti tekrar calistirin."
  pause
  exit 1
fi

echo ">> Homebrew ile OpenJDK kuruluyor (bir kac dakika surebilir)..."
export NONINTERACTIVE=1
export HOMEBREW_NO_AUTO_UPDATE=1
"$BREW" install openjdk@21 || { echo "XX Kurulum basarisiz."; pause; exit 1; }

echo ""
echo "OK Java kuruldu. Simdi start-emulators.command'i (tekrar) calistirabilirsiniz."
pause
