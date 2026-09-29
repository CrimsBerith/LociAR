# LociAR — Firebase kurulum ve canlıya alma rehberi

Backend 27 Eylül 2026'da Supabase'ten Firebase'e taşındı. Supabase sürümünün tam yedeği:
`../_backups/lociar-supabase-snapshot-2026-09-27.tar.gz`; eski `supabase/` klasörü, scriptler ve dokümanlar
`../_backups/supabase-legacy-2026-09-28/` altına taşındı.

## Canlı proje durumu — `lociar-2f38c` (28 Eylül 2026)

| Adım | Durum |
|---|---|
| Firestore (nam5) + güvenli kurallar | ✅ yayında |
| Auth: E-posta/Şifre + E-posta bağlantısı, Apple | ✅ açık — ⚠️ Apple `.p8` anahtarı girilmeden Apple kullanıcılarının hesap silmesi (token iptali) çalışmaz; App Store gönderiminden önce zorunlu |
| Cloud Vision API (profil fotoğrafı denetimi) | ⏳ etkinleştirilmeli |
| iOS uygulaması Team ID (ZSRUTGX74S), App Check / App Attest | ✅ (App Check izleme modunda) |
| E-posta şablon dili | ✅ Türkçe |
| Blaze planı | ⏳ bekleniyor |
| Storage (Get started) + storage.rules | ⏳ Blaze sonrası |
| İndeksler, TTL, Cloud Functions (`us-central1`) | ⏳ `scripts/firebase-deploy.command` |
| Bütçe uyarıları, Identity Platform + ilk admin, inceleme hesabı + seed | ⏳ deploy sonrası |

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
   denetimi (`onAvatarUploaded`) bunu kullanır; kapalıysa tüm fotoğraflar reddedilir (fail-closed). Aylık ilk
   1000 görsel ücretsiz.
9. Project settings → Your apps:
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
