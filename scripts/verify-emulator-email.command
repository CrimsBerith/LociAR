#!/bin/bash
# Marks a test account's email as verified inside the running Firebase Auth Emulator,
# equivalent to clicking the verification link -- but no real email is ever sent by the
# emulator, so this replaces that step during local testing.
#
# Usage: double-click. Reads the email from scripts/.pending-verify-email.txt if present,
# otherwise prompts for it (or run: ./verify-emulator-email.command someone@example.com)
set -uo pipefail
cd "$(dirname "$0")/.."
pause() { read -r -p "Kapatmak icin Enter'a basin... "; }

EMAIL="${1:-}"
if [ -z "$EMAIL" ] && [ -f scripts/.pending-verify-email.txt ]; then
  EMAIL="$(cat scripts/.pending-verify-email.txt | tr -d '[:space:]')"
fi
if [ -z "$EMAIL" ]; then
  read -r -p "Uygulamada kayit olurken kullandiginiz e-posta: " EMAIL
fi
[ -z "$EMAIL" ] && { echo "XX E-posta girilmedi."; pause; exit 1; }

PROJECT="demo-lociar"
EMULATOR_HOST="${LOCIAR_TEST_LAN_IP:-$(cat scripts/.emulator-host.txt 2>/dev/null | tr -d '[:space:]')}"
HOST="${EMULATOR_HOST:-127.0.0.1}:9099"

if ! curl -sf --max-time 5 "http://$HOST/emulator/v1/projects/$PROJECT/config" >/dev/null 2>&1; then
  echo "XX Auth emulator'a ulasilamiyor ($HOST). Once start-emulators.command calisiyor olmali."
  pause
  exit 1
fi

RESPONSE="$(curl -sf --max-time 10 "http://$HOST/emulator/v1/projects/$PROJECT/oobCodes")" || {
  echo "XX Dogrulama kodlari okunamadi ($HOST)."; pause; exit 1; }
OOB_CODE="$(echo "$RESPONSE" | EMAIL_ARG="$EMAIL" python3 -c "
import json, sys, os
data = json.load(sys.stdin)
email = os.environ['EMAIL_ARG'].lower()
codes = [c for c in data.get('oobCodes', []) if c.get('email','').lower() == email and c.get('requestType') == 'VERIFY_EMAIL']
print(codes[-1]['oobCode'] if codes else '')
")"

if [ -z "$OOB_CODE" ]; then
  echo "XX '$EMAIL' icin bekleyen bir dogrulama kodu bulunamadi."
  echo "   Once uygulamada bu e-posta ile kayit olduğunuzdan emin olun, sonra tekrar deneyin."
  pause
  exit 1
fi

# -G with --data-urlencode encodes the code; -f turns an emulator error into a failure instead of "OK".
if ! curl -sfG --max-time 10 "http://$HOST/emulator/action" --data-urlencode "mode=verifyEmail" \
    --data-urlencode "oobCode=$OOB_CODE" --data-urlencode "apiKey=fake-api-key" >/dev/null; then
  echo "XX '$EMAIL' dogrulanamadi (emulator hata dondu)."
  pause
  exit 1
fi

echo "OK '$EMAIL' dogrulandi. Simdi uygulamada 'Giris yap' ile ayni bilgilerle giris yapabilirsiniz."
rm -f scripts/.pending-verify-email.txt
pause
