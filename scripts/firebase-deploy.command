#!/usr/bin/env bash
# Portable Firebase deployment. --dry-run runs every local gate without live access.
set -euo pipefail
cd "$(dirname "$0")/.."
LOCIAR_NODE22_BIN=''
for candidate in /opt/homebrew/opt/node@22/bin/node /usr/local/opt/node@22/bin/node "$(command -v node || true)"; do
  if [[ -x "$candidate" ]] && [[ "$("$candidate" --version 2>/dev/null)" == v22.* ]]; then
    LOCIAR_NODE22_BIN="$candidate"
    break
  fi
done
if [[ -z "$LOCIAR_NODE22_BIN" ]]; then
  echo 'Node.js 22 is required.' >&2
  exit 1
fi
export PATH="$(dirname "$LOCIAR_NODE22_BIN"):$PATH"
if [[ "${1:-}" == '--support-stripe' ]]; then
  shift
  exec "$LOCIAR_NODE22_BIN" functions/scripts/deploy-support-stripe.mjs "$@"
fi
exec "$LOCIAR_NODE22_BIN" scripts/firebase-deploy.mjs "$@"
