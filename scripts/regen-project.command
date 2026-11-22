#!/bin/bash
# Regenerates LociAR.xcodeproj from project.yml (picks up Localizable.xcstrings) and compile-checks. Double-click in Finder.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v xcodegen >/dev/null || brew install xcodegen
# pipefail keeps a failing xcodegen or build visible through tee.
xcodegen generate 2>&1 | tee scripts/.regen.log
bash scripts/check-build.command 2>&1 | tail -20 | tee -a scripts/.regen.log
