#!/usr/bin/env bash
# Deploys only the admin panel (Firebase App Hosting backend lociar-admin). Double-click in Finder.
set -euo pipefail
cd "$(dirname "$0")/.."
FIREBASE=./functions/node_modules/.bin/firebase
if [ ! -x "$FIREBASE" ]; then npm ci --prefix functions; fi
echo "== Firebase hesabı kontrol ediliyor =="
if ! "$FIREBASE" projects:list --json >/dev/null 2>&1; then
  echo "Firebase'e giriş gerekli; tarayıcı açılacak."
  "$FIREBASE" login
fi
echo "== Admin panel kontrolleri (tip kontrolü + testler) =="
( cd admin && npx --no-install tsc --noEmit && npm test --silent )
echo "== Admin panel yayınlanıyor (App Hosting: lociar-admin) =="
"$FIREBASE" deploy --only apphosting --project lociar-2f38c
echo
echo "Bitti: https://lociar-admin--lociar-2f38c.us-central1.hosted.app/admin/login"
read -r -p "Kapatmak için Enter'a bas…" _
