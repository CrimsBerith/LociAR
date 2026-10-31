#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"

echo "======================================================================"
echo "LociAR — Modern Cihaz Test Matrisi (iPhone 14 Pro Sonrası: 15 & 16)"
echo "Eşzamanlı Tek Simülatör Garantisi (Sequential Execution)"
echo "======================================================================"

node scripts/run-post14pro-device-matrix.mjs

