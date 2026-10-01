# LociAR — Firebase kurulum ve canlıya alma rehberi

Backend 27 Eylül 2026'da Supabase'ten Firebase'e taşındı. Supabase sürümünün tam yedeği:
`../_backups/lociar-supabase-snapshot-2026-09-27.tar.gz`; eski `supabase/` klasörü, scriptler ve dokümanlar
`../_backups/supabase-legacy-2026-09-28/` altına taşındı.

## Canlı proje durumu — `lociar-2f38c` (28 Eylül 2026)

| Adım | Durum |
|---|---|
| Firestore (nam5) + güvenli kurallar | ✅ yayında |
| Auth: E-posta/Şifre + E-posta bağlantısı, Apple | ✅ açık — ⚠️ Apple `.p8` anahtarı developer.apple.com'dan alınıp Firebase Console'a girilmeli (hesap silme token iptali) |
| Cloud Vision API (profil fotoğrafı denetimi) | ✅ etkinleştirildi |
| iOS uygulaması Team ID (ZSRUTGX74S), App Check / App Attest | ✅ (App Check izleme modunda) |
| E-posta şablon dili | ✅ Türkçe |
| Blaze planı | ✅ aktif |
| Storage + storage.rules | ✅ yayında |
| İndeksler, TTL, Cloud Functions (`us-central1`) | ✅ 20 fonksiyon yayında |
| Identity Platform + ilk süper admin | ✅ yapıldı (`khankartal@gmail.com`, TOTP MFA açık) |
| İnceleme hesabı + seed içerik | ✅ yapıldı (`apple-review@lociar.app`, 7 onaylı post) |

## Mimari özeti

| Parça | Firebase karşılığı | Kod |
|---|---|---|
| Kimlik | Firebase Auth (e-posta+şifre, Apple) | `LociAR/Data/AuthRepository.swift` |
| Kullanıcı UUID'si | `luid` = UUIDv5(Firebase UID) + custom claim | `FirebaseBackend.swift`, `functions/src/core.ts` |
| Veritabanı | Cloud Firestore | `firestore.rules`, `firestore.indexes.json` |
| Medya | Cloud Storage (eski bucket adları klasör oldu) | `storage.rules`, `MediaAssetStore.swift`, `WorldMapStore.swift` |
| create_post / delete_account | Callable Cloud Functions | `functions/src/posts.ts`, `account.ts`, `profile.ts` |
| Sayaçlar, aktivite | Firestore tetikleyicileri | `functions/src/triggers.ts` |
| Admin panel | Next.js + Firebase Admin SDK, session cookie, TOTP MFA | `admin/lib/admin.ts`, `admin/lib/ops.ts` |

Önemli davranışlar:
- Her yeni post `pending_review` olarak açılır; yüksek kaliteli AR kilidinin otomatik yayını
  varsayılan olarak kapalı (`LOCIAR_AUTO_PUBLISH_HIGH_QUALITY=true` ile açılabilir). App Review notlarıyla uyumlu.
- Şifreli hesaplarda e-posta doğrulanmadan uygulamaya girilemez; Apple hesapları doğrulanmış sayılır.
- "Giriş bağlantısı gönder" (magic link) iOS'ta kaldırıldı; Firebase e-posta bağlantısı Universal Link gerektirir.
- Hesap silme: Apple kullanıcılarında önce Apple token'ı iptal edilir, sonra `deleteAccount` tüm
  postları, medyayı, sosyal kayıtları ve Auth kullanıcısını kalıcı siler.

## 0. Tek komutla kurulum (önerilen)

Mac'te `scripts/google-cloud-setup.command` dosyasına çift tıkla. Sırayla: Google girişi, Blaze kontrolü,
gerekli API'ler (ARCore, Cloud Vision, IAM Credentials, Cloud Scheduler, Functions/Run/Build, Eventarc, Pub/Sub,
Storage, Firestore, App Check, Identity Toolkit), Functions servis hesabı yetkileri (ARCore anahtarsız token için
Token Creator), Storage bucket kontrolü, elle yapılacakların listesi (Apple .p8, App Check debug token, bütçe) ve
`scripts/firebase-deploy.command` ile deploy. Tekrar çalıştırmak güvenlidir. Aşağıdaki adımlar aynı işin
elle yapılışıdır.

## 1. Firebase projesi (konsol, ~30 dk)

1. console.firebase.google.com → proje oluştur (Analytics isteğe bağlı).
2. **Blaze** planına geç (Storage ve Functions için şart). Google Cloud Billing → Budgets: $10 ve $50 uyarısı.
3. **Firestore**: Create database → *Production mode* → bölge. Mevcut proje: `nam5` (US) — Functions bu yüzden `us-central1`
   (nam5 ile aynı bölge ailesi; Firestore trigger şartı). Bölge sonradan değişmez.
4. **Storage**: Get started → aynı bölge ailesi. (Ücretsiz Storage kotası yalnız us-central1/us-east1/us-west1'de.)
5. **Authentication** → Sign-in method:
   - Email/Password: açık (Email link açık olsun — admin panel girişinde kullanılıyor)
   - Apple: açık. Services ID, Apple Team ID `ZSRUTGX74S`, Key ID ve `.p8` anahtarını gir.
   - Settings → Authorized domains: admin panel alan adını ekle (ör. `lociar-admin.vercel.app`).
6. Authentication → Settings → **Upgrade to Identity Platform** (admin TOTP MFA için gerekli; 50K MAU'ya kadar ücretsiz katman).
7. **App Check** → iOS uygulaması → App Attest'i kaydet. Firestore/Storage için önce "Unenforced" kalsın;
   TestFlight doğrulandıktan sonra enforce et. **Callable Functions** konsoldan değil koddan zorlanır:
   `functions/src/core.ts` → `ENFORCE_APP_CHECK` (emulator dışında her zaman açık). Debug build'lerle canlı
   backend'e bağlanacaksan Xcode konsolunda basılan App Check debug token'ını konsolda "Manage debug tokens"
   altına ekle; yoksa callable'lar `unauthenticated` döner.
8. **Cloud Vision API**: Google Cloud Console → APIs & Services → *Cloud Vision API* → Enable. Profil fotoğrafı
   denetimi (`screenAvatar`) bunu kullanır; kapalıysa tüm fotoğraflar reddedilir (fail-closed). Aylık ilk
   1000 görsel ücretsiz.
9. **Google ARCore (Geospatial + Cloud Anchors)** — keyless yetkilendirme, anahtar dosyası yok:
   - Google Cloud Console → APIs & Services → **ARCore API** → Enable.
   - IAM → Functions'ın çalıştığı servis hesabı (varsayılan: `<PROJE_NUMARASI>-compute@developer.gserviceaccount.com`)
     → kendi üzerinde **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) rolünü ver:
     `gcloud iam service-accounts add-iam-policy-binding <SA> --member=serviceAccount:<SA> --role=roles/iam.serviceAccountTokenCreator`
   - `getArcoreToken` callable bu hesapla 1 saatlik JWT imzalar; uygulama `GARSession.setAuthToken` ile kullanır.
     Farklı bir hesap kullanılacaksa Functions ortamında `ARCORE_SIGNER_EMAIL` ayarla.
   - Billing → ARCore API kullanım/ücret satırını deploy öncesi kontrol et (dokümanda yalnız kota var).
10. Project settings → Your apps:
   - iOS app ekle: bundle ID `com.khankartal.lociar`. `GoogleService-Info.plist` içindeki değerleri
     `Config/Local.xcconfig`'e yaz (dosyanın kendisi projeye eklenmez, bkz. `Config/Local.xcconfig.example`).
   - Web app ekle (admin panel için): apiKey, authDomain, projectId, appId değerlerini al.

## 2. Backend'i deploy et (Mac terminali)

```sh
cd LociAR
npm i -g firebase-tools        # veya: npx firebase-tools
firebase login
cp .firebaserc.example .firebaserc && sed -i '' 's/YOUR-FIREBASE-PROJECT-ID/<proje-id>/' .firebaserc
cd functions && npm ci && npm test && cd ..
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Functions bölgesi `us-central1` (Firestore nam5 ile aynı bölge olmalı; Firestore trigger şartı) (değiştirmek için deploy öncesi `LOCIAR_FUNCTIONS_REGION` ortam değişkeni
ve iOS'ta `LOCIAR_FIREBASE_FUNCTIONS_REGION` aynı olmalı).

Kurallar için yerel test (Java 21 gerekir):
```sh
cd functions && npm run test:rules
```

## 3. İlk yönetici, korumalı bölgeler, App Review içeriği

```sh
cd functions
gcloud auth application-default login          # veya GOOGLE_APPLICATION_CREDENTIALS=servis-hesabi.json
export FIREBASE_PROJECT_ID=<proje-id>
node scripts/bootstrap-admin.mjs sen@alanadin.com            # super_admin + TOTP MFA'yı açar
node scripts/import-protected-zones.mjs zones.json           # okul/hastane/ibadethane listesi
```

App Review hesabı:
1. Uygulamada `apple-review@lociar.app` ile hesap aç, gelen doğrulama e-postasındaki bağlantıya tıkla,
   uygulamada bir kez giriş yap (profil oluşur).
2. `node scripts/seed-review-content.mjs apple-review@lociar.app` → İstanbul ve Cupertino'da 7 onaylı örnek post.
3. Şifreyi güçlü ve yeni bir değere ayarla; repoda duran eski örnek şifreyi kullanma.

## 4. iOS uygulaması

```sh
cp Config/Local.xcconfig.example Config/Local.xcconfig   # değerleri doldur
xcodegen generate            # veya mevcut LociAR.xcodeproj'u aç (Firebase paketleri eklendi)
```
Xcode ilk açılışta firebase-ios-sdk'yı indirir (File → Packages → Resolve Package Versions).
Signing & Capabilities: Sign in with Apple ve App Attest entitlement'ları `LociAR.entitlements` içinde.

## 5. Admin panel (Vercel)

Vercel → Project → Settings → Environment Variables (`admin/.env.example`):
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Project settings → Service accounts → Generate new private key; base64 önerilir)
- `FIREBASE_STORAGE_BUCKET`, `FIREBASE_FUNCTIONS_REGION`

Eski Supabase değişkenlerini Vercel'den ve `admin/.env.local`'dan sil. Sonra `vercel --prod`.

Admin girişi: e-posta bağlantısı → ilk seferde TOTP kaydı (QR) → yeniden giriş → kod → panel.

## 6. Bilinen farklar / sonraki adımlar

- Firestore'da tam metin arama yok: admin arama handle önekine ve son 500 post başlığına bakar.
- Engelleme yalnız engelleyen tarafta içerik gizler (Apple'ın beklediği davranış).
- Push bildirimleri 1.0 kapsamında değil (APNs entitlement yok).
- ~5K aktif kullanıcıdan sonra medyayı Cloudflare R2'ye taşımak indirme maliyetini sıfırlar.

## 7. Güvenlik/maliyet ek adımları (owner)

**Storage → Firestore çapraz servis yetkisi.** `storage.rules` artık `post-world-maps` okumasında `firestore.get(...)` ile post durumuna bakıyor. `firebase deploy --only storage` sırasında CLI "Firebase Rules hizmet hesabına Firestore erişimi verilsin mi?" diye sorar; **Evet** de. (Elle: IAM → `service-<PROJE_NUMARASI>@gcp-sa-firebasestorage.iam.gserviceaccount.com` hesabına `Firebase Rules Firestore Service Agent` rolü.) Verilmezse world map okumaları kapalı kalır (güvenli taraf), AR haritası yüklenmez.

**Eski klasörler için GCS lifecycle** (fotoğraf/video kaldırıldı, bu klasörler artık yazılamıyor; 30 gün sonra kalıntılar silinir). `lifecycle.json`:

```json
{ "rule": [
  { "action": {"type": "Delete"}, "condition": {"age": 30, "matchesPrefix": ["post-layer-assets/", "post-video-assets/", "post-reference-images/", "post-surface-textures/"]} }
] }
```

Uygula: `gcloud storage buckets update gs://lociar-2f38c.firebasestorage.app --lifecycle-file=lifecycle.json`; doğrula: `gcloud storage buckets describe gs://lociar-2f38c.firebasestorage.app --format="default(lifecycle_config)"`.

**Firestore TTL.** `firestore.indexes.json` içindeki `expires_at` TTL alanları (`post_view_receipts` 30 gün, `activity_events` 180 gün, `filtered_comments` 90 gün, `trigger_receipts` 7 gün, `post_quota`, `arcore_token_quota`) `firebase deploy --only firestore:indexes` ile etkinleşir.

**Apple token iptali (sunucu).** `deleteAccount` sunucuda iptal yapabilir; Functions ortamına `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` (bundle id) ve `APPLE_PRIVATE_KEY` (.p8 içeriği, Secret Manager) verilince devreye girer. O zamana kadar istemci iptal edip `appleRevokedByClient: true` gönderir; ikisi de yoksa Apple hesabı silinmez.

**Cloud Anchor göç betikleri.** Eski postlar için bir kez: `FIREBASE_PROJECT_ID=lociar-2f38c node functions/scripts/backfill-cloud-anchors.mjs --apply`; uzun `display_name` düzeltmesi: `node functions/scripts/fix-long-display-names.mjs --apply`. (Önce `--apply`sız kuru çalıştırma yap.)

**Admin.** Üretimde `ADMIN_ORIGIN=https://<admin-alan-adı>` ayarla (Origin kontrolü buna sabitlenir). Docker imajı artık `next build` + `next start`, root olmayan kullanıcıyla çalışır; gizli bilgiler imaja girmez, çalışma zamanında verilir.
