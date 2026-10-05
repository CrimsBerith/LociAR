#!/bin/bash
# LociAR — projeyi gizli GitHub reposuna gönderir. Finder'da çift tıkla.
# Token gerekmez: GitHub CLI tarayıcıda onay ister (bir kerelik), sonra git girişini kaydeder.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO_URL="${1:-https://github.com/CrimsBerith/LociAR.git}"
LOG="scripts/.github-push.log"
pause() { read -r -p "Kapatmak için Enter…"; }

# 1) GitHub CLI'ı bul, yoksa kullanıcı klasörüne indir (yönetici şifresi gerekmez)
GH="$(command -v gh || true)"
for p in /opt/homebrew/bin/gh /usr/local/bin/gh "$HOME/.homebrew/bin/gh" "$HOME/.local/bin/gh"; do
  [ -z "$GH" ] && [ -x "$p" ] && GH="$p"
done
if [ -z "$GH" ]; then
  echo "==> GitHub CLI indiriliyor…"
  ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && ARCH="amd64"
  URL="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest \
        | grep -Eo "https://[^\"]+macOS_(${ARCH}|universal)\.zip" | head -1)"
  [ -z "$URL" ] && { echo "❌ GitHub CLI indirme adresi bulunamadı."; pause; exit 1; }
  TMP="$(mktemp -d)"
  curl -fsSL "$URL" -o "$TMP/gh.zip" && unzip -q "$TMP/gh.zip" -d "$TMP" || { echo "❌ İndirme başarısız."; pause; exit 1; }
  mkdir -p "$HOME/.local/bin"
  cp "$(find "$TMP" -type f -path '*/bin/gh' | head -1)" "$HOME/.local/bin/gh" && chmod +x "$HOME/.local/bin/gh"
  GH="$HOME/.local/bin/gh"
fi

# 2) Giriş (yalnızca ilk sefer): ekrandaki 8 haneli kodu tarayıcıda onayla
if ! "$GH" auth status --hostname github.com >/dev/null 2>&1; then
  echo ""
  echo "==> GitHub girişi: birazdan tarayıcı açılacak. Terminal'de görünen kodu oradaki kutuya gir ve 'Authorize' de."
  "$GH" auth login --hostname github.com --git-protocol https --web || { echo "❌ GitHub girişi tamamlanmadı."; pause; exit 1; }
fi
"$GH" auth setup-git --hostname github.com

# 3) Gönder
if [ -e .git/index.lock ]; then
  echo "❌ Git işlemi kilitli. Açık Git işlemini tamamlayıp tekrar dene."
  pause; exit 1
fi
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REPO_URL" || git remote add origin "$REPO_URL"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ] || [ "$CURRENT_BRANCH" = "main" ]; then
  echo "❌ main'e (veya dal olmadan) doğrudan gönderim yapılmaz. Önce bir dal aç: git switch -c <dal-adı>, sonra PR aç."
  pause; exit 1
fi
echo "==> $REPO_URL ($CURRENT_BRANCH) adresine gönderiliyor…"
git push -u origin "HEAD:$CURRENT_BRANCH" 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
echo ""
if [ "$status" -eq 0 ]; then echo "✅ Bitti: ${REPO_URL%.git}"; else echo "❌ Gönderim başarısız (kod $status). Ayrıntı: $LOG"; fi
pause
exit "$status"
