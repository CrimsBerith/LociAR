#!/bin/bash
# Double-click on the Mac: runs the checks the Linux workspace cannot (iOS build/tests,
# Firestore/Storage rules, Functions + Admin emulator suites) and writes every log to
# build/mac-verify/. Nothing is deployed or pushed. Steps continue after a failure.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="build/mac-verify"
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

step ios bash scripts/ci-ios.sh
step functions-rules npm --prefix functions run test:rules
step functions-emulator npm --prefix functions run test:emulator
step admin-emulator npm --prefix admin run test:emulator
log "DONE"
read -r -p "Bitti. Kapatmak icin Enter'a basin... " _ || true
