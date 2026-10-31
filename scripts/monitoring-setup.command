#!/bin/bash
# Existing logs -> rate-limited email alerts. No custom metrics, jobs or budget changes.
set -euo pipefail
cd "$(dirname "$0")/.."
read -r -p "Uyarılar hangi e-posta adresine gelsin? " diagnostics_email
python3 scripts/setup-diagnostics-monitoring.py --email "$diagnostics_email"
read -r -p "Bu üç log uyarısını uygula? [e/H] " diagnostics_apply
if [[ "$diagnostics_apply" =~ ^[eEyY]$ ]]; then
  python3 scripts/setup-diagnostics-monitoring.py --email "$diagnostics_email" --apply
fi
read -r -p "Kapatmak için Enter…" _ || true
