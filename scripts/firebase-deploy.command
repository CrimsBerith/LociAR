#!/bin/bash
# LociAR — Firebase deploy (Firestore rules + indexes, Storage rules, Cloud Functions)
# Finder'da çift tıkla veya Terminal'de çalıştır. Önkoşul: proje Blaze planında ve Storage "Get started" yapılmış.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="lociar-2f38c"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kur, sonra bu dosyayı tekrar aç."
  read -r -p "Kapatmak için Enter…"; exit 1
fi

echo "==> Functions bağımlılıkları kuruluyor…"
(cd functions && npm ci --no-audit --no-fund && npm run build)

echo "==> Birim testleri (geohash, yerleşim kuralları)…"
(cd functions && node --test test/*.test.mjs)

if /usr/libexec/java_home >/dev/null 2>&1; then
  echo "==> Güvenlik kuralı testleri (emülatör)…"
  (cd functions && npm run test:rules) || { echo "❌ Kural testleri başarısız — deploy durduruldu."; read -r -p "Enter…"; exit 1; }
else
  echo "ℹ️  Java yok, kural testleri atlandı (isteğe bağlı: https://adoptium.net → Temurin 21)."
fi

echo "==> Firebase girişi (tarayıcı açılacak, projenin sahibi olan Google hesabıyla giriş yap)…"
npx -y firebase-tools@latest login

echo "==> Deploy: $PROJECT"
npx -y firebase-tools@latest deploy --only firestore,storage,functions --project "$PROJECT" --force

echo ""
echo "✅ Bitti. Bu pencereyi kapatabilirsin."
read -r -p "Kapatmak için Enter…"
