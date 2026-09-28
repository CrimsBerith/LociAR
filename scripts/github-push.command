#!/bin/bash
# LociAR — projeyi gizli GitHub reposuna gönderir. Finder'da çift tıkla.
# Önkoşul: github.com'da boş, gizli (private) "LociAR" reposu oluşturulmuş olmalı.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_URL="${1:-https://github.com/CrimsBerith/LociAR.git}"

rm -f .git/index.lock 2>/dev/null || true
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi
echo "==> $REPO_URL adresine gönderiliyor (ilk seferde GitHub girişi istenebilir)…"
LOG="scripts/.github-push.log"
set +e
git push -u origin HEAD:main 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e
echo ""
if [ "$status" -eq 0 ]; then
  echo "✅ Bitti: ${REPO_URL%.git}"
else
  echo "❌ Gönderim başarısız (kod $status). Ayrıntı: $LOG"
  echo "   Şifre yerine GitHub token'ı (repo izinli) girildiğinden emin ol."
fi
read -r -p "Kapatmak için Enter…"
