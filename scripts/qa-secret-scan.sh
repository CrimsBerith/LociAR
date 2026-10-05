#!/usr/bin/env bash
# Scan tracked and new, non-ignored files, including documentation and tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/qa-secret-scan.mjs
