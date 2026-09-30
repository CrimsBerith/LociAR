#!/bin/bash
# Regenerates LociAR.xcodeproj from project.yml (picks up Localizable.xcstrings) and compile-checks. Double-click in Finder.
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v xcodegen >/dev/null || brew install xcodegen
xcodegen generate 2>&1 | tee scripts/.regen.log
bash scripts/check-build.command 2>&1 | tail -20 | tee -a scripts/.regen.log
