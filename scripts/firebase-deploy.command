#!/usr/bin/env bash
# Portable Firebase deployment. --dry-run runs every local gate without live access.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22 is required.' >&2
  exit 1
fi
exec node scripts/firebase-deploy.mjs "$@"
