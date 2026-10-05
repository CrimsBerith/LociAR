# LociAR — Firebase kurulum ve canlıya alma rehberi

Her şey Firebase'de: Auth, Firestore, Storage, Cloud Functions, Cloud Messaging (push), Crashlytics ve admin paneli
(Firebase App Hosting).
Docker, Vercel veya başka bir barındırma kullanılmaz.

Güncel kapsam ve yayın kararı: [RELEASE_READINESS.md](release/RELEASE_READINESS.md).

## Tarihsel canlı proje bildirimi — `lociar-2f38c` (28 Eylül 2026)

Aşağıdaki tablo önceki ekip bildirimidir; 4 Ekim bulut oturumunda canlı projeye yetkili GCP kimliği
olmadığı için yeniden doğrulanmadı. Eski 20 Functions bildirimi yeni push/aktivite callable'larının
dağıtıldığını göstermez. App Check'in izleme modunda olması üretim enforcement kabulü değildir;
review/test hesapları yeni parolalara geçirilmeli ve güncel aday ayrı doğrulanmalıdır.

| Adım | Durum |
|---|---|
| Firestore (nam5) + güvenli kurallar | ✅ yayında |
| Auth: E-posta/Şifre + E-posta bağlantısı, Apple | ✅ açık — ⚠️ Sign in with Apple `.p8` anahtarı Firebase Console'a ve Functions'a (`APPLE_PRIVATE_KEY`, hesap silmede token iptali) girilmeli |
| Push (FCM + APNs) | ⚠️ kod hazır — APNs Auth Key (`.p8`, ayrı anahtar) Firebase Console → Project settings → Cloud Messaging → Apple app configuration'a yüklenmeli |
| Crashlytics | ✅ SDK + dSYM yükleme fazı (`project.yml`); kullanıcı Profil → Ayarlar'dan kapatabilir |
| Cloud Vision API (profil fotoğrafı denetimi) | ✅ etkinleştirildi |
| iOS uygulaması Team ID (ZSRUTGX74S), App Check / App Attest | ✅ (App Check izleme modunda) |
| E-posta şablon dili | ✅ Türkçe |
| Blaze planı | ✅ aktif |
| Storage + storage.rules | ✅ yayında |
| İndeksler, TTL, Cloud Functions (`us-central1`) | ⚠️ 24 fonksiyon — yeni sürüm (push, kill switch, `terms_version`) deploy bekliyor |
| Admin + yasal sayfalar (App Hosting, backend `lociar-admin`) | ⚠️ yeni sürüm (EN sayfalar, kill switch paneli, nonce CSP) deploy bekliyor |
| Identity Platform + ilk süper admin | ✅ yapıldı (proje sahibinin hesabı, TOTP MFA açık) |
| İnceleme hesabı + seed içerik | ✅ yapıldı (`apple-review@lociar.app`, 7 onaylı post) |

## Mimari özeti

| Parça | Firebase karşılığı | Kod |
|---|---|---|
| Kimlik | Firebase Auth (e-posta+şifre, Apple) | `LociAR/Data/AuthRepository.swift` |
| Kullanıcı UUID'si | `luid` = UUIDv5(Firebase UID) + custom claim | `FirebaseBackend.swift`, `functions/src/core.ts` |
| Veritabanı | Cloud Firestore | `firestore.rules`, `firestore.indexes.json` |
| Avatar / AR çevre haritası | Cloud Storage; post fotoğraf/video yüklemesi kapalı | `storage.rules`, `AvatarStore.swift`, `WorldMapStore.swift` |
| Push | FCM (APNs üzerinden); token `registerPushToken`/`unregisterPushToken` (kurulum kimliğiyle), gönderim `onActivityCreated` tetikleyicisinden | `functions/src/push.ts`, `NotificationService.swift` |
| Kill switch | `system/flags.kill_switch` (admin → System); callable'lar `service_paused` döner | `functions/src/core.ts`, `admin/app/admin/(protected)/system` |
| create_post / delete_account | Callable Cloud Functions | `functions/src/posts.ts`, `account.ts`, `profile.ts` |
| Sayaçlar, aktivite | Firestore tetikleyicileri | `functions/src/triggers.ts` |
| Aktivite okundu durumu | Auth + App Check callable; doğrudan istemci yazması yok | `functions/src/activity.ts` |
| Admin panel + yasal sayfalar | Next.js, Firebase App Hosting (`lociar-admin`), Admin SDK, session cookie, TOTP MFA | `admin/lib/admin.ts`, `admin/lib/ops.ts`, `admin/apphosting.yaml` |

Önemli davranışlar:
- Her yeni post `pending_review` olarak açılır; yüksek kaliteli AR kilidinin otomatik yayını
  varsayılan olarak kapalı (`LOCIAR_AUTO_PUBLISH_HIGH_QUALITY=true` ile açılabilir). App Review notlarıyla uyumlu.
- Şifreli hesaplarda e-posta doğrulanmadan uygulamaya girilemez; Apple hesapları doğrulanmış sayılır.
- "Giriş bağlantısı gönder" (magic link) iOS'ta kaldırıldı; Firebase e-posta bağlantısı Universal Link gerektirir.
- Hesap silme: iOS Apple veya mevcut parola ile Firebase yeniden doğrulaması yapar
  ve ID token'ı yeniler. Sunucu son 5 dakika `auth_time` şartını korur; Apple
  kullanıcılarında önce token iptali, sonra `deleteAccount` kalıcı silme yapar.
  Akış ve cihaz kabulü: [ACTIVITY_AND_ACCOUNT_DELETION.md](ACTIVITY_AND_ACCOUNT_DELETION.md).
- Giriş ekranında gizlilik/topluluk kuralları onay kutusu zorunludur; `ensureProfile` kabul edilen sürümü
  `users_private.terms_version` / `terms_accepted_at` olarak kaydeder.

## 0. Tek komutla kurulum (önerilen)

Mac'te `scripts/google-cloud-setup.command` dosyasına çift tıkla. Sırayla: Google girişi, Blaze kontrolü,
gerekli API'ler (ARCore, Cloud Vision, IAM Credentials, Cloud Scheduler, Functions/Run/Build, Eventarc, Pub/Sub,
Storage, Firestore, App Check, Identity Toolkit, Cloud Messaging, Crashlytics, App Hosting), Functions servis hesabı
yetkileri (ARCore anahtarsız token için Token Creator), Storage bucket kontrolü, elle yapılacakların listesi
(Sign in with Apple .p8, APNs .p8, App Check debug token, bütçe) ve
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
   - Settings → Authorized domains: admin panel alan adını ekle: `lociar-admin--lociar-2f38c.us-central1.hosted.app` (özel alan adı bağlanırsa onu da).
6. Authentication → Settings → **Upgrade to Identity Platform** (admin TOTP MFA için gerekli; 50K MAU'ya kadar ücretsiz katman).
7. **App Check** → iOS uygulaması → App Attest'i kaydet. Firestore/Storage için önce "Unenforced" kalsın;
   TestFlight doğrulandıktan sonra enforce et; üretim yayını öncesi Firestore/Storage enforcement doğrulanmış olmalı. **Callable Functions** konsoldan değil koddan zorlanır:
   `functions/src/core.ts` → `ENFORCE_APP_CHECK` (emulator dışında her zaman açık). Debug build'lerle canlı
   backend'e bağlanacaksan Xcode konsolunda basılan App Check debug token'ını konsolda "Manage debug tokens"
   altına ekle; yoksa callable'lar `unauthenticated` döner.
8. **Cloud Vision API**: Google Cloud Console → APIs & Services → *Cloud Vision API* → Enable. Profil fotoğrafı
   denetimi (`screenAvatar`) bunu kullanır; kapalıysa tüm fotoğraflar reddedilir (fail-closed). Aylık ilk
   1000 görsel ücretsiz.
9. **Google ARCore (Geospatial + Cloud Anchors)** — keyless yetkilendirme, anahtar dosyası yok:
   - Google Cloud Console → APIs & Services → **ARCore API** → Enable.
   - Ayrı, **rolsüz** bir imzalayıcı hesap: `arcore-client-signer@<PROJE>.iam.gserviceaccount.com`.
     Functions'ın çalıştığı hesap (varsayılan `<PROJE_NUMARASI>-compute@developer.gserviceaccount.com`) yalnız bu
     hesap üzerinde **Service Account Token Creator** alır; kendi üzerinde almaz, Editor almaz.
     `scripts/google-cloud-setup.command` bunları yapar ve `functions/.env.<PROJE>` içine
     `ARCORE_SIGNER_EMAIL` yazar.
   - `getArcoreToken` callable bu hesap adına 1 saatlik JWT imzalar; uygulama `GARSession.setAuthToken` ile kullanır.
     `ARCORE_SIGNER_EMAIL` yoksa `arcore_signer_env_missing` uyarısı loglanır.
   - Billing → ARCore API kullanım/ücret satırını deploy öncesi kontrol et (dokümanda yalnız kota var).
10. Project settings → Your apps:
   - iOS app ekle: bundle ID `com.khankartal.lociar`. `GoogleService-Info.plist` içindeki değerleri
     `Config/Local.xcconfig`'e yaz (dosyanın kendisi projeye eklenmez, bkz. `Config/Local.xcconfig.example`).
   - Web app ekle (admin panel için): apiKey, authDomain, projectId, appId değerlerini al.

## 2. Backend'i deploy et (Mac terminali)

```sh
cd LociAR
cp .firebaserc.example .firebaserc && sed -i '' 's/YOUR-FIREBASE-PROJECT-ID/<proje-id>/' .firebaserc
cd functions && npm ci && npm test && cd ..
./functions/node_modules/.bin/firebase login
./functions/node_modules/.bin/firebase deploy --only firestore:rules,firestore:indexes,storage,functions
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
3. Parolayı [CREDENTIALS.md](CREDENTIALS.md) adımlarına göre yenile ve App Store Connect'in Sign-In Information alanına gir; inceleme notlarına veya depoya yazma.

## 4. iOS uygulaması

```sh
cp Config/Local.xcconfig.example Config/Local.xcconfig   # değerleri doldur
xcodegen generate            # veya mevcut LociAR.xcodeproj'u aç (Firebase paketleri eklendi)
```
Xcode ilk açılışta firebase-ios-sdk'yı indirir (File → Packages → Resolve Package Versions).
Signing & Capabilities: Sign in with Apple, App Attest ve Push Notifications (`aps-environment`) entitlement'ları
`LociAR.entitlements` içinde. `aps-environment` dosyada `development`; App Store için arşivlenip dağıtıldığında Xcode
imzalama sırasında `production` yapar.
Yerelleştirme: `LociAR/Resources/Localizable.xcstrings` + `InfoPlist.xcstrings` (12 dil) `scripts/l10n/build_catalog.py`
ile üretilir; elle düzenlenmez (bkz. `scripts/l10n/`).

## 5. Admin panel ve yasal sayfalar (Firebase App Hosting)

Admin paneli ve uygulamanın bağlantı verdiği `/privacy`, `/terms`, `/support` (İngilizceleri `/privacy/en`, `/terms/en`,
`/support/en`) sayfaları `admin/` içindeki Next.js
uygulamasıdır ve **Firebase App Hosting** üzerinde çalışır (`admin/apphosting.yaml`, `firebase.json` → `apphosting`).
Sunucu, App Hosting backend'inin servis hesabıyla çalışır; **servis hesabı anahtarı yoktur**.

İlk kurulum (bir kez, Mac'te):
```sh
npm ci --prefix functions        # depo kökünde; gözden geçirilen lockfile ve overrides
gcloud services enable firebaseapphosting.googleapis.com --project lociar-2f38c
./functions/node_modules/.bin/firebase apphosting:backends:create --project lociar-2f38c \
  --backend lociar-admin --primary-region us-central1 --root-dir admin
```
- Sihirbaz bir **web app** bağlamayı sorar → "LociAR Admin" web app'ini seç/oluştur. Public istemci kimlikleri
  derleme sırasında `FIREBASE_WEBAPP_CONFIG` olarak gelir (`admin/next.config.ts`), elle girilmez.
- Backend servis hesabına (`firebase-app-hosting-compute@lociar-2f38c.iam.gserviceaccount.com`)
  `Firebase Admin SDK Administrator Service Agent` rolü gerekir (Auth/Firestore/Storage). Avatar incelemesi
  görüntüyü sunucu üzerinden aktarır (imzalı URL yok), bu yüzden kendi üzerinde Token Creator verilmez.
  `scripts/google-cloud-setup.command` bunu verir.
- Authentication → Settings → Authorized domains: `lociar-admin--lociar-2f38c.us-central1.hosted.app`.

Dağıtım: `./functions/node_modules/.bin/firebase deploy --only apphosting --project lociar-2f38c` (ya da GitHub bağlantısıyla
otomatik). Adres: `https://lociar-admin--lociar-2f38c.us-central1.hosted.app` — iOS `Config/Base.xcconfig`
içindeki gizlilik/şartlar/destek bağlantıları bu adresi kullanır. Özel alan adı bağlanırsa (App Hosting →
Settings → Custom domain) `Config/Base.xcconfig`, `admin/apphosting.yaml` (`ADMIN_ORIGIN`) ve App Store
Connect URL'leri birlikte güncellenir.

Yerel geliştirme: `admin/.env.local` (`admin/.env.example`), `npm run dev`. Yerelde Admin SDK için
`FIREBASE_SERVICE_ACCOUNT_JSON` yalnız geliştirici makinesinde tutulur; repo'ya ve App Hosting'e girmez.

Admin girişi: e-posta bağlantısı → ilk seferde TOTP kaydı (QR) → yeniden giriş → kod → panel.

## 6. Bilinen farklar / sonraki adımlar

- Firestore'da tam metin arama yok: admin arama handle önekine ve cursor ile devam eden post caption sayfalarına bakar. Sonuçsuz bir sayfadan da eski kayıtlara devam edilebilir; küresel tam metin indeksi ayrıca ürün/altyapı kararıdır.
- Engelleme yalnız engelleyen tarafta içerik gizler (Apple'ın beklediği davranış).
- Push APNs/Firebase Messaging üzerinden uygulanmıştır; Firebase Console APNs anahtarı,
  Functions dağıtımı ve fiziksel cihaz/TestFlight kabulü ayrıca gereklidir.
  Kayıt, gönderim ve test sözleşmesi: [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md).
- ~5K aktif kullanıcıdan sonra medyayı Cloudflare R2'ye taşımak indirme maliyetini sıfırlar.

## 6a. Kill switch (acil durdurma)

Admin → System → "Kill switch": `system/flags.kill_switch` açılınca post oluşturma, Cloud Anchor kaydı, ARCore token
ve avatar yükleme callable'ları `unavailable` + `service_paused` döner. Uygulama "LociAR geçici olarak durduruldu"
mesajını gösterir, sıradaki postlar deneme hakkı harcamadan bekler. İşlem audit log'a yazılır; kapatınca 15 sn
içinde normale döner.

## 6b. İzleme ve alarmlar (bir kez, owner)

`scripts/monitoring-setup.command` (Mac'te çift tıkla; tekrar çalıştırılabilir) şunları kurar:

- **E-posta bildirim kanalı:** adresi betik sorar. Google'ın doğrulama e-postasını onayla.
- **Log tabanlı metrikler ve alarmlar** (Cloud Functions ve App Hosting logları):

| Metrik | Alarm koşulu | Ne yapılır |
|--------|--------------|------------|
| `lociar_server_errors` | 10 dk'da >10 ERROR satırı | Logs'ta `severity>=ERROR` filtresine bak |
| `lociar_account_deletion_deferred` | 1 saatte herhangi biri | Silme işi zamanlayıcıyla yeniden denenir; tamamlandığını doğrula |
| `lociar_storage_cleanup_deferred` | 1 saatte >3 | Storage yetkileri ve temizlik zamanlayıcıları |
| `lociar_cloud_anchor_cleanup_failed` | 1 saatte herhangi biri | `arcoreManagement.ts` logları; iş kendini yeniden dener |
| `lociar_arcore_token_failed` | 10 dk'da >3 | Functions servis hesabının Token Creator yetkisi (`google-cloud-setup.command`) |
| `lociar_avatar_screening_failed` | 1 saatte >3 | Cloud Vision API / kota |
| `lociar_push_failed` | 1 saatte >20 | Firebase Console → Cloud Messaging → APNs anahtarı |
| `lociar_service_paused` | herhangi biri | Kill switch açık kaldıysa kapat (6a) |

- **Aylık bütçe:** varsayılan 50 USD. %50, %90 ve %100'de e-posta gelir.

Crashlytics çökme uyarıları ayrıca Firebase Console → Crashlytics → ⋮ → *Alert settings* üzerinden açılır.

## 7. Güvenlik/maliyet ek adımları (owner)

**Storage → Firestore çapraz servis yetkisi.** `storage.rules` artık `post-world-maps` okumasında `firestore.get(...)` ile post durumuna bakıyor. `firebase deploy --only storage` sırasında CLI "Firebase Rules hizmet hesabına Firestore erişimi verilsin mi?" diye sorar; **Evet** de. (Elle: IAM → `service-<PROJE_NUMARASI>@gcp-sa-firebasestorage.iam.gserviceaccount.com` hesabına `Firebase Rules Firestore Service Agent` rolü.) Verilmezse world map okumaları kapalı kalır (güvenli taraf), AR haritası yüklenmez.

**Eski klasörler için GCS lifecycle** (fotoğraf/video kaldırıldı, bu klasörler artık yazılamıyor; 30 gün sonra kalıntılar silinir). `lifecycle.json`:

```json
{ "rule": [
  { "action": {"type": "Delete"}, "condition": {"age": 30, "matchesPrefix": ["post-layer-assets/", "post-video-assets/", "post-reference-images/", "post-surface-textures/"]} }
] }
```

Uygula: `gcloud storage buckets update gs://lociar-2f38c.firebasestorage.app --lifecycle-file=lifecycle.json`; doğrula: `gcloud storage buckets describe gs://lociar-2f38c.firebasestorage.app --format="default(lifecycle_config)"`.

**Firestore TTL.** `firestore.indexes.json` içindeki `expires_at` TTL alanları (`post_view_receipts` 30 gün, `activity_events` 180 gün, `filtered_comments` 90 gün, `trigger_receipts` 7 gün, `push_tokens` 30 gün, `push_delivery_receipts` 180 gün, `post_quota`, `arcore_token_quota`, `anchor_quota`, bağlanmamış `cloud_anchors` 30 gün) `firebase deploy --only firestore:indexes` ile etkinleşir.

**Apple token iptali (sunucu, zorunlu).** iOS nonce'lu Sign in with Apple yanıtının identity token'ıyla Firebase `reauthenticate` yapar, ID token'ı yeniler ve aynı yanıttaki `authorizationCode` değerini `deleteAccount`'a gönderir. Yeni code tek başına Firebase `auth_time` değerini yenilemez. Sunucu Apple'da iptal eder. Functions ortamında `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` (`functions/.env.<PROJE>`) ve `APPLE_PRIVATE_KEY` (.p8 içeriği, Secret Manager) yoksa (`apple_revoke_unavailable`) ya da Apple iptali reddederse (`apple_revoke_failed`) **hiçbir şey silinmez**.

**Cloud Anchor göç betikleri.** Eski postlar için bir kez: `FIREBASE_PROJECT_ID=lociar-2f38c node functions/scripts/backfill-cloud-anchors.mjs --apply`; uzun `display_name` düzeltmesi: `node functions/scripts/fix-long-display-names.mjs --apply`. (Önce `--apply`sız kuru çalıştırma yap.)

**Admin.** `ADMIN_ORIGIN` `admin/apphosting.yaml` içinde App Hosting adresine sabit (Origin kontrolü buna bakar); özel alan adına geçince orada güncelle.
