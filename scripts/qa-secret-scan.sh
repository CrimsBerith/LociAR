#!/usr/bin/env bash
# High-confidence secret patterns in source trees (not node_modules / Pods / dist / local temp).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Patterns that indicate real leaked credentials (service-account keys, private keys).
# Exclude: local temp folders, this scanner script, lockfiles, binaries.
# Only tracked files are scanned: git-ignored local files (e.g. the throwaway functions/.secret.local
# that the emulator test setup generates) never reach the repo.
hits="$(
  git grep -In \
    -E 'BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|BEGIN PRIVATE KEY|"type"[[:space:]]*:[[:space:]]*"service_account"' \
    -- . ':!*.md' ':!*package-lock.json' ':!scripts/qa-secret-scan.sh' ':!scripts/qa-predeploy.sh' \
       ':!LociARTests/**' ':!**/test/**' ':!**/tests/**' 2>/dev/null || true
)"

# Drop any residual hits under local temp folders (never shipped).
hits="$(printf '%s\n' "$hits" | grep -v '/.temp/' || true)"

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
