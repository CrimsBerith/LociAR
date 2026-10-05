#!/bin/bash
# Compile-only check of the iOS app (no signing). Log: scripts/.build-check.log
set -euo pipefail
cd "$(dirname "$0")/.."
command -v xcodebuild >/dev/null || { echo 'Xcode on macOS is required.' >&2; exit 2; }
status=0
xcodebuild -project LociAR.xcodeproj -scheme LociAR -destination 'generic/platform=iOS' -configuration Debug build CODE_SIGNING_ALLOWED=NO > scripts/.build-check.log 2>&1 || status=$?
printf 'exit=%s\n' "$status" >> scripts/.build-check.log
tail -5 scripts/.build-check.log
exit "$status"
