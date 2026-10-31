#!/bin/bash
# LociAR: App Store öncesi Mac adımlarını sırayla çalıştırır (docs/release/APP_STORE_GO_LIVE_2026-10-26.md).
# Finder'da çift tıkla. Her adım önce sorar; "e" yazmazsan atlanır, yani yarıda kalırsa yeniden çalıştırıp
# bitmiş adımları geçebilirsin. Hiçbir adım App Store'a gönderim yapmaz.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
PROJECT="lociar-2f38c"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p build
LOG="$REPO/build/app-store-hazirla-$STAMP.log"
exec > >(tee "$LOG") 2>&1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

step() { echo; echo "================================================================"; echo "==> $*"; echo "================================================================"; }
ask() { local reply; read -r -p "$1 [e/H] " reply; [[ "$reply" =~ ^[eEyY]$ ]]; }
fail() { echo "❌ $*"; exit 1; }
finish() { echo; echo "Kayıt: $LOG"; read -r -p "Kapatmak için Enter…" _ || true; }
trap finish EXIT

# Node 22 (Firebase CLI ve betikler için).
NODE22=''
for c in /opt/homebrew/opt/node@22/bin/node /usr/local/opt/node@22/bin/node "$(command -v node || true)"; do
  if [[ -n "$c" && -x "$c" ]] && [[ "$("$c" --version 2>/dev/null)" == v22.* ]]; then NODE22="$c"; break; fi
done
[[ -n "$NODE22" ]] || fail "Node.js 22 bulunamadı (brew install node@22)."
export PATH="$(dirname "$NODE22"):$PATH"
FIREBASE="$REPO/functions/node_modules/.bin/firebase"

BRANCH="$(git branch --show-current)"
echo "Dal: $BRANCH   Commit: $(git rev-parse --short HEAD)"
[[ -n "$BRANCH" && "$BRANCH" != "main" ]] || fail "main dalındasın; bu betik yalnız geliştirme dalında çalışır."
git status --short

# ---------------------------------------------------------------- 1
step "1/8  iOS testleri (simülatör: birim + UI, ~20 dk)"
if ask "Testleri çalıştırayım mı?"; then
  bash scripts/ci-ios.sh || fail "iOS testleri geçmedi. Ayrıntı: build/ci-ios/*.log"
  echo "✅ iOS testleri geçti."
fi

# ---------------------------------------------------------------- 2
step "2/8  Commit ve gönderim (dal: $BRANCH, main'e değil)"
echo "Mevcut değişiklikler korunur. Commit kapsamını önce git diff ile incele."
if ask "Değişiklikleri commit edip GitHub'a göndereyim mi?"; then
  GH="$(command -v gh || true)"; [[ -n "$GH" ]] && "$GH" auth setup-git --hostname github.com >/dev/null 2>&1
  git add -A
  git reset -q -- available_luxury_com_results.txt scripts/.prod-email.txt 2>/dev/null || true
  if git diff --cached --quiet; then echo "Commit'lenecek değişiklik yok."; else
    git commit -q -F - <<'MSG' || fail "Commit başarısız."
fix(release): App Store 1.0 readiness

- Hide creator-support payment entry points in Release builds until a provider is live
  (App Review 2.1 / 3.1.1); Debug builds and UI tests keep them.
- Support contact and review account move to alfagolab.com (lociar.app is not registered).
- recordPostView applies the same active-account fences as the read path (bug audit B02).
- Align submission guide, App Privacy table, age rating and review summaries with direct publishing.
- Add the App Store go-live checklist and this preparation script.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PqaT2vHnVZEYNBrX6Ughta
MSG
  fi
  git push -u origin "HEAD:$BRANCH" || fail "Gönderim başarısız."
  echo "✅ Gönderildi. PR #58'de GitHub işleri yeşil olunca main'e birleştir."
fi

# ---------------------------------------------------------------- 3
step "3/8  Firebase girişi ve harcama sınırı"
[[ -x "$FIREBASE" ]] || (cd functions && npm ci --no-audit --no-fund) || fail "Firebase CLI kurulamadı."
"$FIREBASE" projects:list --json >/dev/null 2>&1 || "$FIREBASE" login || fail "Firebase girişi yapılamadı."
echo "Google Cloud → Billing → Budgets & alerts → \"LociAR spend cap\" (Cloud Run için ₺10/ay sert sınır)."
echo "Sınır doluysa deploy edilen fonksiyonlar çalışmaz; App Review sırasında dolarsa uygulama reddedilir."
open "https://console.cloud.google.com/billing/budgets?project=$PROJECT" >/dev/null 2>&1 || true
ask "Harcama sınırını kontrol ettim (dolu değil ya da yükselttim), devam edeyim mi?" || fail "Harcama sınırı kontrol edilmeden deploy yapılmadı."

# ---------------------------------------------------------------- 4
step "4/8  Eksik secret'lar (Firebase deploy her secret'ı ister)"
for name in APPLE_PRIVATE_KEY GIPHY_API_KEY SUPPORT_STRIPE_SECRET_KEY SUPPORT_STRIPE_WEBHOOK_SECRET; do
  if "$FIREBASE" functions:secrets:get "$name" --project "$PROJECT" >/dev/null 2>&1; then echo "✓ $name var"
  else fail "$name Secret Manager'da yok; bu gerçek bir anahtar, rastgele değerle doldurulamaz (docs/CREDENTIALS.md)."; fi
done
for name in SUPPORT_CRYPTO_API_KEY SUPPORT_CRYPTO_IPN_SECRET; do
  if "$FIREBASE" functions:secrets:get "$name" --project "$PROJECT" >/dev/null 2>&1; then echo "✓ $name var"
  elif ask "$name yok. Kripto kapalıyken kimsenin bilmediği rastgele bir değerle oluşturayım mı?"; then
    openssl rand -hex 32 | "$FIREBASE" functions:secrets:set "$name" --project "$PROJECT" --data-file=- --non-interactive \
      || fail "$name oluşturulamadı."
    echo "✓ $name oluşturuldu (rastgele; kripto açılırken gerçek NOWPayments değeriyle değiştir)."
  else fail "$name olmadan fonksiyon deploy'u ilk adımda durur."; fi
done

# ---------------------------------------------------------------- 5
step "5/8  Backend deploy (kurallar, indeksler, tüm fonksiyonlar, emekli 7 zamanlayıcının silinmesi; 1-2 saat)"
if ask "Canlı Firebase'e deploy edeyim mi?"; then
  bash scripts/firebase-deploy.command || fail "Backend deploy yarıda kaldı. Hatayı düzeltip bu adımı yeniden çalıştır (tekrar güvenli)."
  echo "✅ Backend yayınlandı."
fi

# ---------------------------------------------------------------- 6
step "6/8  Admin ve yasal sayfalar (yeni destek adresi support@alfagolab.com)"
if ask "Admin panelini yayınlayayım mı?"; then
  (cd admin && npx --no-install tsc --noEmit && npm test --silent) || fail "Admin kontrolleri geçmedi."
  "$FIREBASE" deploy --only apphosting --project "$PROJECT" --non-interactive || fail "Admin yayını başarısız."
  echo "✅ Kontrol: https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support (support@alfagolab.com görünmeli)"
fi

# ---------------------------------------------------------------- 7
step "7/8  Canlı kabul kontrolü (salt okunur)"
if command -v gcloud >/dev/null 2>&1 && ask "Canlı ortamı kontrol edeyim mi?"; then
  CFG="$(gcloud config configurations list --filter=is_active=true --format='value(name)' 2>/dev/null)"
  python3 scripts/qa-live-firebase.py --gcloud-configuration "${CFG:-default}" --report "live-$STAMP.json" \
    && echo "✅ ready: true" \
    || echo "⚠️  Hazır değil: build/firebase-readiness/live-$STAMP.json içindeki bulgulara bak (yeni TTL/indeksler birkaç dakika sürebilir)."
fi

# ---------------------------------------------------------------- 8
step "8/8  App Review hesabı ve açılış içeriği"
if command -v gcloud >/dev/null 2>&1 && ask "apple-review@alfagolab.com hesabını açayım ve örnek içeriği yükleyeyim mi?"; then
  gcloud auth application-default print-access-token >/dev/null 2>&1 || gcloud auth application-default login || fail "Google kimliği yok."
  gcloud auth application-default set-quota-project "$PROJECT" >/dev/null 2>&1 || true
  CRED="$HOME/Desktop/lociar-review-$STAMP.json"
  (cd functions && REVIEW_CREDENTIALS_FILE="$CRED" FIREBASE_PROJECT_ID="$PROJECT" node scripts/provision-review-account.mjs) \
    || fail "İnceleme hesabı açılamadı."
  echo "Parola: $CRED (yalnız App Store Connect → Sign-In Information alanına gir; sonra dosyayı sil)."
  read -r -p "Şimdi telefonda bu hesapla bir kez giriş yap (profil oluşsun), sonra Enter'a bas… " _
  (cd functions && FIREBASE_PROJECT_ID="$PROJECT" node scripts/seed-review-content.mjs apple-review@alfagolab.com) \
    || fail "Örnek içerik yüklenemedi (hesapla uygulamada giriş yapıldı mı?)."
  echo "✅ İnceleme içeriği hazır. Eski apple-review@lociar.app hesabını admin panelinden sil."
  if ask "Açılış seed'ini (başkentler + işletme notları) de yükleyeyim mi?"; then
    bash scripts/load-launch-seed.command || echo "⚠️  Seed yüklemesi tamamlanmadı; kaydına bak."
  fi
fi

echo
echo "Bitti. Kalanlar (telefon ve App Store Connect): docs/release/APP_STORE_GO_LIVE_2026-10-26.md §6–9"
