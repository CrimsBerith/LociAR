#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/openjdk@21/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"

echo "======================================================================"
echo "LociAR — Master Cihaz Test Matrisi (iPhone 14 & Önceki Aileler)"
echo "Eşzamanlı Tek Simülatör Garantisi (Sequential Execution)"
echo "======================================================================"

node scripts/run-master-device-matrix.mjs

