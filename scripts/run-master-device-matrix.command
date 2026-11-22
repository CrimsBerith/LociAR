#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Homebrew lives in /opt/homebrew on Apple Silicon and /usr/local on Intel; keep a JAVA_HOME the user set.
for prefix in /opt/homebrew /usr/local; do
  [ -d "$prefix/opt/node@22/bin" ] && export PATH="$prefix/opt/node@22/bin:$PATH"
  [ -d "$prefix/opt/openjdk@21/bin" ] && export PATH="$prefix/opt/openjdk@21/bin:$PATH"
  if [ -z "${JAVA_HOME:-}" ] && [ -d "$prefix/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="$prefix/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  fi
done

echo "======================================================================"
echo "LociAR — Master Cihaz Test Matrisi (iPhone 14 & Önceki Aileler)"
echo "Eşzamanlı Tek Simülatör Garantisi (Sequential Execution)"
echo "======================================================================"

node scripts/run-master-device-matrix.mjs

