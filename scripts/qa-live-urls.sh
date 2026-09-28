#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <LociAR.app-or-Info.plist>"
  exit 64
fi

info_path="$1"
if [[ -d "$info_path" ]]; then
  info_path="$info_path/Info.plist"
fi
if [[ ! -f "$info_path" ]]; then
  echo "Info.plist not found: $info_path"
  exit 66
fi

failures=0
for key in LOCIAR_PRIVACY_URL LOCIAR_TERMS_URL LOCIAR_SUPPORT_URL; do
  url="$(/usr/libexec/PlistBuddy -c "Print :$key" "$info_path" 2>/dev/null || true)"
  if [[ "$url" != https://* ]]; then
    echo "$key FAIL: missing public HTTPS URL"
    failures=$((failures + 1))
    continue
  fi

  if ! status="$(curl -sS -L -o /dev/null -w '%{http_code}' --max-time 20 "$url")"; then
    echo "$key FAIL: network error for $url"
    failures=$((failures + 1))
    continue
  fi
  if [[ "$status" == 2?? ]]; then
    echo "$key PASS: $status $url"
  else
    echo "$key FAIL: $status $url"
    failures=$((failures + 1))
  fi
done

if [[ $failures -ne 0 ]]; then
  echo "Live legal/support URL preflight failed: $failures"
  exit 1
fi

echo "Live legal/support URL preflight passed"
