#!/bin/bash
# LociAR — Google Cloud / Firebase one-time setup (ARCore, Vision, scheduler, IAM, App Hosting) + deploy.
# Double-click in Finder or run in Terminal on a Mac. Needs: Google Cloud CLI (gcloud) and Node.js.
# Safe to re-run: every step checks or is idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="lociar-2f38c"

pause() { read -r -p "${1:-Devam etmek için Enter…}"; }
step() { echo ""; echo "==> $*"; }

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI (gcloud) bulunamadı."
  echo "Kurulum: brew install --cask google-cloud-sdk   (veya https://cloud.google.com/sdk/docs/install)"
  pause "Kurduktan sonra bu dosyayı tekrar aç. Kapatmak için Enter…"; exit 1
fi

step "Google hesabıyla giriş (projenin sahibi olan hesap). Tarayıcı açılacak."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
  gcloud auth login
fi
gcloud config set project "$PROJECT" >/dev/null
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
echo "Hesap: $ACCOUNT · Proje: $PROJECT"

step "Faturalandırma (Blaze) kontrolü"
gcloud services enable cloudbilling.googleapis.com --project "$PROJECT" >/dev/null 2>&1 || true
if [ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo False)" != "True" ]; then
  echo "❌ Projede faturalandırma kapalı. Storage, Functions ve ARCore için Blaze planı şart."
  echo "   Aç: https://console.firebase.google.com/project/$PROJECT/usage/details  → 'Upgrade'"
  open "https://console.firebase.google.com/project/$PROJECT/usage/details" 2>/dev/null || true
  pause "Blaze'e geçtikten sonra Enter'a bas…"
fi

step "Gerekli Google API'leri etkinleştiriliyor (birkaç dakika sürebilir)"
gcloud services enable \
  arcore.googleapis.com \
  vision.googleapis.com \
  iamcredentials.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  firebaseappcheck.googleapis.com \
  identitytoolkit.googleapis.com \
  firebaseapphosting.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT"
echo "✅ API'ler açık."

step "Cloud Functions servis hesabı yetkileri"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Servis hesabı: $SA"
# ARCore keyless tokens: the runtime account signs JWTs for itself through IAM signJwt.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountTokenCreator" \
  --project "$PROJECT" --quiet >/dev/null
echo "✅ Token Creator (ARCore anahtarsız yetkilendirme)"
ROLES="$(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:$SA" --format='value(bindings.role)' || true)"
if ! echo "$ROLES" | grep -qE 'roles/(editor|owner)'; then
  echo "ℹ️  Servis hesabında Editor rolü yok; Firestore/Storage/Vision/ARCore için gerekli roller ekleniyor."
  for ROLE in roles/datastore.user roles/storage.objectAdmin roles/firebaseauth.admin \
              roles/serviceusage.serviceUsageConsumer roles/logging.logWriter roles/iam.serviceAccountUser; do
    gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" \
      --condition=None --quiet >/dev/null
    echo "   + $ROLE"
  done
  echo "   ⚠️  ARCore Cloud Anchor silme (Management API) proje düzeyinde yetki ister. Silme loglarında"
  echo "      PERMISSION_DENIED görürsen bu hesaba IAM'de 'Editor' ver ya da anchor'lar TTL ile (≤365 gün) silinir."
else
  echo "✅ Servis hesabında Editor/Owner var."
fi

step "Admin paneli: Firebase App Hosting (backend lociar-admin)"
if ! npx --yes firebase-tools@14 apphosting:backends:get lociar-admin --project "$PROJECT" >/dev/null 2>&1; then
  echo "App Hosting backend yok; oluşturuluyor. Sihirbaz bir web app soracak → 'LociAR Admin' seç/oluştur."
  npx --yes firebase-tools@14 apphosting:backends:create --project "$PROJECT" \
    --backend lociar-admin --primary-region us-central1 --root-dir admin
fi
AH_SA="firebase-app-hosting-compute@${PROJECT}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$AH_SA" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$AH_SA" \
    --role="roles/firebase.sdkAdminServiceAgent" --condition=None --quiet >/dev/null
  gcloud iam service-accounts add-iam-policy-binding "$AH_SA" --project "$PROJECT" \
    --member="serviceAccount:$AH_SA" --role="roles/iam.serviceAccountTokenCreator" --quiet >/dev/null
  echo "✅ App Hosting servis hesabı: Admin SDK + imzalı URL yetkileri ($AH_SA)"
else
  echo "⚠️  $AH_SA bulunamadı; backend oluşturulduktan sonra bu adımı tekrar çalıştır."
fi
echo "   Authentication → Settings → Authorized domains: lociar-admin--${PROJECT}.us-central1.hosted.app ekle."

step "Cloud Storage bucket kontrolü"
BUCKET="gs://${PROJECT}.firebasestorage.app"
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  echo "✅ $BUCKET mevcut."
else
  echo "❌ Storage henüz başlatılmamış. Firebase Console → Storage → 'Get started' (bölge: us-central1)."
  open "https://console.firebase.google.com/project/$PROJECT/storage" 2>/dev/null || true
  pause "Storage'ı başlattıktan sonra Enter'a bas…"
fi

step "Elle yapılması gerekenler (API ile yapılamıyor)"
cat <<TXT
  1) Apple ile Giriş .p8 anahtarı (hesap silmede Apple token iptali için ZORUNLU):
     https://console.firebase.google.com/project/$PROJECT/authentication/providers → Apple
     → Services ID, Team ID ZSRUTGX74S, Key ID ve .p8 dosyası.
  2) App Check: iOS uygulamasında App Attest kayıtlı olmalı. Debug build ile canlıya bağlanacaksan
     Xcode konsolundaki App Check debug token'ını ekle:
     https://console.firebase.google.com/project/$PROJECT/appcheck/apps
  3) Bütçe uyarısı ($10 / $50): https://console.cloud.google.com/billing/budgets?project=$PROJECT
TXT
pause "Bunları yaptıysan (veya sonra yapacaksan) deploy için Enter…"

step "Backend deploy (kurallar, indeksler, TTL, Storage kuralları, Cloud Functions)"
bash scripts/firebase-deploy.command

step "Admin paneli + yasal sayfalar deploy (Firebase App Hosting)"
npx --yes firebase-tools@14 deploy --only apphosting --project "$PROJECT"
echo "✅ https://lociar-admin--${PROJECT}.us-central1.hosted.app/privacy"

step "İsteğe bağlı: eski referans kamera karelerini temizle (önce sayar)"
read -r -p "Eski referans karelerini say/sil? [e/H] " ANSWER
if [[ "${ANSWER:-H}" =~ ^[eE]$ ]]; then
  gcloud auth application-default login
  (cd functions && FIREBASE_PROJECT_ID="$PROJECT" node scripts/purge-reference-images.mjs)
  read -r -p "Silinsin mi? [e/H] " CONFIRM
  if [[ "${CONFIRM:-H}" =~ ^[eE]$ ]]; then
    (cd functions && FIREBASE_PROJECT_ID="$PROJECT" node scripts/purge-reference-images.mjs --apply)
  fi
fi

echo ""
echo "✅ Google Cloud / Firebase kurulumu tamam."
echo "   Sonraki: docs/FIREBASE_SETUP.md §3 (ilk admin, korumalı bölgeler, App Review hesabı)."
pause "Kapatmak için Enter…"
