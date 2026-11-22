#!/bin/bash
# Double-click on the Mac: runs the checks the Linux workspace cannot (iOS build/tests,
# Firestore/Storage rules, Functions + Admin emulator suites) and writes every log to
# scripts/.mac-verify/. Nothing is deployed or pushed. Steps continue after a failure.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="scripts/.mac-verify" # readable from the Linux workspace (build/ may be a symlink to another volume)
mkdir -p "$OUT"
SUMMARY="$OUT/summary.txt"
: > "$SUMMARY"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$SUMMARY"; }

for jdk in /opt/homebrew/opt/openjdk@21/bin /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk@21/bin; do
  if [ -x "$jdk/java" ]; then export PATH="$jdk:$PATH"; break; fi
done
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

log "branch $(git branch --show-current) @ $(git rev-parse --short HEAD)"
log "node $(node -v 2>&1) | $(java -version 2>&1 | head -1)"

step() {
  local name="$1"; shift
  log "START $name"
  "$@" > "$OUT/$name.log" 2>&1
  local rc=$?
  log "END $name rc=$rc"
}

# The suites read the Firestore port from FIRESTORE_EMULATOR_HOST (set by emulators:exec), so a
# busy 8080 (another local server) only moves Firestore to a free port in a throwaway config.
# Auth (9099), Storage (9199) and Functions (5001) are fixed in the tests; a busy one is reported.
for port in 8080 9099 9199 5001 4400 4500; do
  owner="$(lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1" pid="$2}')"
  [ -z "$owner" ] || log "port $port busy: $owner"
done
CONFIG="firebase.json"
if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync("firebase.json"));c.emulators.firestore.port=8280;fs.writeFileSync(".firebase.verify.json",JSON.stringify(c))'
  CONFIG=".firebase.verify.json"
  log "Firestore emulator on 8280 ($CONFIG)"
fi
FIREBASE="$(pwd)/functions/node_modules/.bin/firebase"

# xcodebuild refuses to overwrite a result bundle from an earlier run.
rm -rf build/ci-ios/*.xcresult
step ios bash scripts/ci-ios.sh
mkdir -p "$OUT/ci-ios" && cp build/ci-ios/*.log "$OUT/ci-ios/" 2>/dev/null || true
step functions-rules bash -c "cd functions && '$FIREBASE' emulators:exec --config '../$CONFIG' --only firestore,storage --project demo-lociar 'node --test --test-concurrency=1 test/rules/*.test.mjs'"
step functions-emulator bash -c "cd functions && npm run build && node test/integration/prepare-env.mjs && '$FIREBASE' emulators:exec --config '../$CONFIG' --only auth,firestore,storage,functions --project demo-lociar 'node --test --test-concurrency=1 test/integration/*.test.mjs'"
step admin-emulator bash -c "cd admin && '$FIREBASE' emulators:exec --config '../$CONFIG' --only auth,firestore,storage --project demo-lociar 'node --conditions=react-server --import ./tests/register-typescript.mjs --test --test-concurrency=1 tests/integration/*.test.mjs'"
log "DONE"
read -r -p "Bitti. Kapatmak icin Enter'a basin... " _ || true
