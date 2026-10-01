#!/bin/bash
# Compile-only check of the iOS app (no signing). Log: scripts/.build-check.log
cd "$(dirname "$0")/.."
xcodebuild -project LociAR.xcodeproj -scheme LociAR -destination 'generic/platform=iOS' -configuration Debug build CODE_SIGNING_ALLOWED=NO > scripts/.build-check.log 2>&1
echo "exit=$?" >> scripts/.build-check.log
tail -5 scripts/.build-check.log
