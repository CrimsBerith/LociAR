#!/usr/bin/env bash
# High-confidence secret patterns in source trees (not node_modules / Pods / dist / local temp).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Patterns that indicate real leaked credentials (not docs saying "never put SERVICE_ROLE").
# Exclude: local Supabase docker temp, this scanner script, lockfiles, binaries.
hits="$(
  grep -RIn \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=Pods \
    --exclude-dir=dist \
    --exclude-dir=.next \
    --exclude-dir=artifacts \
    --exclude-dir=ios \
    --exclude-dir=.temp \
    --exclude-dir=start-secrets \
    --exclude='*.md' \
    --exclude='*.log' \
    --exclude='package-lock.json' \
    --exclude='*.png' \
    --exclude='*.jpg' \
    --exclude='qa-secret-scan.sh' \
    --exclude='qa-predeploy.sh' \
    -E 'SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*["'\'']?eyJ|BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|BEGIN PRIVATE KEY' \
    . 2>/dev/null || true
)"

# Drop any residual hits under supabase/.temp (CLI local stack secrets — never ship).
hits="$(printf '%s\n' "$hits" | grep -v 'supabase/\.temp/' | grep -v '/.temp/' || true)"

if [[ -n "${hits// }" ]]; then
  echo "$hits"
  echo "Potential secrets found"
  exit 1
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo ".env is tracked by git — FAIL"
    exit 1
  fi
fi

echo "No high-confidence secret patterns in source; .env untracked OK"
