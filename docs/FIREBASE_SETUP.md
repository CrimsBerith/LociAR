# LociAR — Firebase kurulum ve canlıya alma rehberi

Her şey Firebase'de: Auth, Firestore, Storage, Cloud Functions ve admin paneli (Firebase App Hosting).
Docker, Vercel veya başka bir barındırma kullanılmaz.

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
- Güvenilir yazar otomatik yayını: `LOCIAR_TRUSTED_AUTO_PUBLISH=true` (varsayılan kapalı; açmadan önce App Review notları güncellenmeli).
  Kural `functions/src/trust.ts`: hesap 7 günden eski, en az 5 onaylı herkese açık post, `flagged` post yok,
  `users_private.trust_revoked` değil; ayrıca AR kilidi yüksek kaliteli olmalı. Çizim içeren postlar hiçbir zaman otomatik yayınlanmaz.
  Moderatör `removed` kararları algılanmaz: tekrar eden ihlalde admin `trust_revoked: true` yazmalı.
- Davet kodu (beta): `createInvites` (kullanıcı başına 3 kod) ve `redeemInvite` callable'ları `functions/src/invites.ts` içinde.
  `LOCIAR_INVITE_REQUIRED=true` iken kod kullanmamış hesap post yayınlayamaz (`invite_required`); gezmek serbest.
  App Review demo hesabının `users_private/{luid}` belgesine `invite_exempt: true` yazılmalı.
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
   - Settings → Authorized domains: admin panel alan adını ekle: `lociar-admin--lociar-2f38c.us-central1.hosted.app` (özel alan adı bağlanırsa onu da).
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

## 5. Admin panel ve yasal sayfalar (Firebase App Hosting)

Admin paneli ve uygulamanın bağlantı verdiği `/privacy`, `/terms`, `/support` sayfaları `admin/` içindeki Next.js
uygulamasıdır ve **Firebase App Hosting** üzerinde çalışır (`admin/apphosting.yaml`, `firebase.json` → `apphosting`).
Sunucu, App Hosting backend'inin servis hesabıyla çalışır; **servis hesabı anahtarı yoktur**.

İlk kurulum (bir kez, Mac'te):
```sh
gcloud services enable firebaseapphosting.googleapis.com --project lociar-2f38c
npx firebase-tools@14 apphosting:backends:create --project lociar-2f38c \
  --backend lociar-admin --primary-region us-central1 --root-dir admin
```
- Sihirbaz bir **web app** bağlamayı sorar → "LociAR Admin" web app'ini seç/oluştur. Public istemci kimlikleri
  derleme sırasında `FIREBASE_WEBAPP_CONFIG` olarak gelir (`admin/next.config.ts`), elle girilmez.
- Backend servis hesabına (`firebase-app-hosting-compute@lociar-2f38c.iam.gserviceaccount.com`) şu roller gerekir:
  `Firebase Admin SDK Administrator Service Agent` (Auth/Firestore/Storage) ve kendi üzerinde
  `Service Account Token Creator` (avatar incelemesindeki imzalı URL'ler ve oturum çerezleri için).
  `scripts/google-cloud-setup.command` bunları verir.
- Authentication → Settings → Authorized domains: `lociar-admin--lociar-2f38c.us-central1.hosted.app`.

Dağıtım: `npx firebase-tools@14 deploy --only apphosting --project lociar-2f38c` (ya da GitHub bağlantısıyla
otomatik). Adres: `https://lociar-admin--lociar-2f38c.us-central1.hosted.app` — iOS `Config/Base.xcconfig`
içindeki gizlilik/şartlar/destek bağlantıları bu adresi kullanır. Özel alan adı bağlanırsa (App Hosting →
Settings → Custom domain) `Config/Base.xcconfig`, `admin/apphosting.yaml` (`ADMIN_ORIGIN`) ve App Store
Connect URL'leri birlikte güncellenir.

Yerel geliştirme: `admin/.env.local` (`admin/.env.example`), `npm run dev`. Yerelde Admin SDK için
`FIREBASE_SERVICE_ACCOUNT_JSON` yalnız geliştirici makinesinde tutulur; repo'ya ve App Hosting'e girmez.

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

**Firestore TTL.** `firestore.indexes.json` içindeki `expires_at` TTL alanları (`post_view_receipts` 30 gün, `activity_events` 180 gün, `filtered_comments` 90 gün, `trigger_receipts` 7 gün, `post_quota`, `arcore_token_quota`, `anchor_quota`, bağlanmamış `cloud_anchors` 7 gün) `firebase deploy --only firestore:indexes` ile etkinleşir.

**Apple token iptali (sunucu, zorunlu).** iOS hesap silmede Sign in with Apple ile yeni bir `authorizationCode` alır ve `deleteAccount`'a gönderir; sunucu Apple'da iptal eder. Functions ortamında `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` (`functions/.env.<PROJE>`) ve `APPLE_PRIVATE_KEY` (.p8 içeriği, Secret Manager) yoksa (`apple_revoke_unavailable`) ya da Apple iptali reddederse (`apple_revoke_failed`) **hiçbir şey silinmez**.

**Cloud Anchor göç betikleri.** Eski postlar için bir kez: `FIREBASE_PROJECT_ID=lociar-2f38c node functions/scripts/backfill-cloud-anchors.mjs --apply`; uzun `display_name` düzeltmesi: `node functions/scripts/fix-long-display-names.mjs --apply`. (Önce `--apply`sız kuru çalıştırma yap.)

**Admin.** `ADMIN_ORIGIN` `admin/apphosting.yaml` içinde App Hosting adresine sabit (Origin kontrolü buna bakar); özel alan adına geçince orada güncelle.

**Bütçe uyarısı (Faz 3.4, owner).** Blaze planında kötüye kullanım veya hatalı bir döngü faturayı sessizce büyütebilir. Faturalama hesabı için aylık bütçe ve eşik uyarıları kur (tutarı kendi hedefine göre değiştir; e-posta alıcıları Billing > Budgets & alerts ekranından eklenir):

```bash
gcloud billing accounts list
gcloud billing budgets create --billing-account=<FATURA_HESABI_ID> \
  --display-name="lociar-aylik" --budget-amount=20USD \
  --filter-projects=projects/lociar-2f38c \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

Bütçe harcamayı durdurmaz, yalnızca haber verir. Uyarı gelirse sırayla bak: Functions çağrı sayıları (özellikle `createPost`, `redeemInvite`, `registerPushToken`), Firestore okuma/yazma, FCM gönderimi. Post oluşturma (saatlik/günlük kota), davet kodu denemeleri (saatte 10 hatalı) ve push (günde kullanıcı başına 3) sınırlıdır; diğer callable'ların kendi kotası yoktur, `maxInstances` ile sınırlanır.

**App Check izleme (Faz 3.4, owner).** Firebase Console > App Check > APIs: Cloud Functions, Firestore ve Storage için "Verified / Unverified requests" oranına bak. Callable'larda zorlama açık (`ENFORCE_APP_CHECK`); Firestore ve Storage için zorlamayı, doğrulanmamış istek oranı yaklaşık sıfıra inmeden açma, yoksa App Attest'e geçemeyen eski sürümler kilitlenir. TestFlight/App Store sürümü yayınlandıktan sonra bir hafta bu oranı izle.

**Büyüme hunisi.** `analytics_events` içinde admin Analytics sayfasında şu olaylar sayılır: `post_published_active`, `post_pending_review_created`, `invite_redeemed`, `protected_zone_blocked`, `avatar_accepted`. Davet kapısı açıldıktan sonra `invite_redeemed` ile `post_*` olaylarını karşılaştırarak kayıttan ilk posta geçişi okunur.

**Mekan katmanı (Faz 2.5, sunucu).** `places/{id}` (`name`, `city`, `lat`, `lng`, `radius_meters`, `active`) herkese açık okunur, yalnızca betikle yazılır. `createPost` bir postun konumu bir mekanın yarıçapına düşüyorsa sunucuda `place_id` yazar (en yakın merkez kazanır; istemciye güvenilmez; mekan okunamazsa post yine yayınlanır, `place_id: null`). Mekanları yüklemek için: `cd functions && FIREBASE_PROJECT_ID=lociar-2f38c node scripts/import-places.mjs scripts/places.sample.json` (kuru çalıştırma), sonra `--apply`. Betik, korumalı bölgeyle çakışan mekanı reddeder: `createPost` orada post yayınlamayı zaten engellediği için listeye girmemeli. `places.sample.json` içindeki koordinatlar yaklaşıktır; yüklemeden önce haritadan doğrula ve her mekan için ARCore VPS uygunluğunu kontrol et. Henüz iOS mekan haritası/sayfası yok. Deploy sonrası `firebase deploy --only firestore:rules` gerekir.
