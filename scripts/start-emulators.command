#!/bin/bash
# Starts an isolated demo backend without changing the production client configuration.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/start-demo-emulators.mjs "$@"
