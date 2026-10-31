# LociAR — App Store'a çıkış kontrol listesi (26 Ekim 2026)

Tek sayfalık "gönder / gönderme" listesi. Sırayla git; bir adım bitmeden sonrakine geçme.
27 Ekim adayının güncel testleri ve açık kapıları: [APP_STORE_PREPARATION_2026-10-27.md](APP_STORE_PREPARATION_2026-10-27.md).
Ayrıntılı alan değerleri: [APP_STORE_SUBMISSION_GUIDE.md](APP_STORE_SUBMISSION_GUIDE.md).
İnceleme notu metni: [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) §1.

**Kısa yol:** Mac adımları 1, 3, 4, 5 tek dosyada: Finder'da `scripts/app-store-hazirla.command` dosyasına çift tıkla.
Her adım önce sorar, istediğini atlarsın; hiçbir adım App Store'a gönderim yapmaz.

## Durum özeti

| Alan | Durum |
|---|---|
| Uygulama kodu (PR #58, `codex/fix-anonymous-location-audit`) | Hazır. 26 Ekim'de bir değişiklik eklendi (aşağıda); Mac'te derlenip test edilmeli |
| Mağaza metinleri (12 dil), izin metinleri, privacy manifest, ikon | Hazır; kontroller geçti |
| Canlı backend | **Hazır değil.** 25 Ekim canlı ölçümü: 14 fonksiyon ve 3 yeni zamanlayıcı yok, emekli 7 zamanlayıcı hâlâ çalışıyor, 1 TTL ve 3 bileşik indeks eksik |
| Destek e-postası | Karar verildi (26 Ekim): `support@alfagolab.com` (Hostinger MX). Kodda ve belgelerde güncellendi; yasal sayfalar admin yeniden yayınlanınca canlıya çıkar |
| Ekran görüntüleri | **Kullanılamaz.** 1 Ekim görüntüleri boş harita, simülatör kamerası, tanı yazısı ve kaldırılmış "fotoğraf/video" metni içeriyor |
| İnceleme hesabı ve örnek içerik | Canlıda yapıldığı doğrulanmadı |
| Fiziksel iPhone testi | 27 Ekim'de Release native GPS/kamera ve iki normal hesap UI kontrolü geçti; APNs teslimi, saha anchor ve tam yayın/silme kabulü ayrı açık |

## 26 Ekim'de yapılanlar (Claude)

- **Yazar desteği (ödeme) giriş noktaları Release derlemesinde gizlendi.** Notun destek düğmesi ve Profil →
  Kazançlarım her notta görünüyordu; ödeme sağlayıcısı canlı değil ve `system/post_support.enabled = false`.
  Düğme açılmayan bir ekrana gidiyordu: App Review 2.1 (bitmemiş özellik) ve 3.1.1 (ödeme) reddi riski.
  Debug derlemeleri ve UI testleri düğmeyi görmeye devam eder. Açmak için tek satır:
  `PostSupportAvailability.releaseBuilds = true` (`LociAR/Data/PostSupportClient.swift`); aynı sürümde koşullar,
  gizlilik, App Privacy (Purchases) ve inceleme notları da güncellenir. Test: `StoreReadinessTests`.
- Hata taraması B02 (P2) düzeltildi (`build/bug-audit-20261026/REPORT.md`): `recordPostView` artık okuma yoluyla aynı
  hesap kontrolünü yapıyor; askıya alınmış izleyici veya yazar görüntülenme sayacını artıramaz. Functions birim
  testleri 188/188 geçti; emülatör testleri (`npm run test:emulator`) Mac'te çalıştırılmalı.
- Belgelerdeki çelişkiler düzeltildi: yaş derecelendirmesi metni ("tüm postlar yayından önce incelenir" → doğrudan
  yayın), App Privacy tablosu (konumda "Developer's Advertising or Marketing" amacı manifestle aynı), eski
  ön onaylı inceleme özetleri (`IOS_APP_STORE_ARTIFACTS.md`, `LEGAL_AND_SUPPORT.md`), DSA, üçüncü taraf içerik,
  build numarası ve ekran görüntüsü kuralları rehbere eklendi.
- Kontroller: yerelleştirme kataloğu (694 anahtar × 12 dil) ve `--release` kontrolü, mağaza metni sınırları,
  gizli anahtar taraması geçti. Depo betik testleri 56/57: tek hata, Claude'un çalıştığı ortamın dosya silememesinden
  (`firebase_readiness_test` geçici dosyayı silemedi); Mac'te tekrar çalıştır.
- Çalışma ağacında Codex'in 26 Ekim 03:08'de bıraktığı **commit edilmemiş** bir değişiklik var:
  `LociAR/Data/WorldMapCodec.swift` (silinen hesap önbelleği için `/private/var` yol eşlemesi). Claude dokunmadı.
  Mevcut değişikliği koru; testlerle doğrulayıp aday commit kapsamına al. Hazırlık betiği dosyayı geri almaz.

## 1. Kodu kapat (Mac, ~30 dk)

1. Xcode → `LociAR` şeması → iPhone 16 Pro simülatörü → **Product → Test** (veya `bash scripts/ci-ios.sh`).
   Beklenen: tüm testler geçer, yalnız 2 fiziksel cihaz testi atlanır.
2. Değişiklikleri commit edip dalı gönder: `scripts/commit-push-branch.command` (main'e doğrudan gönderen
   `github-push.command` kullanma).
3. PR #58'de bütün GitHub işleri ve SonarCloud yeşil olunca main'e birleştir. Arşiv bu commit'ten alınır.

## 2. Destek e-postası (karar verildi, ~5 dk)

`lociar.app` kayıtlı olmadığı için iletişim adresi **`support@alfagolab.com`** oldu (Alfago Lab alan adı, Hostinger
MX kayıtları var). `admin/app/legal-entity.ts`, gizlilik/koşullar/destek sayfaları (güncelleme tarihi 26 Ekim),
inceleme notları ve rehber güncellendi. Yapılacaklar:

- Hostinger'da `support@alfagolab.com` kutusunun gerçekten e-posta aldığını dene (başka adresten test e-postası).
- 4.3'teki admin yayını yasal sayfaları yeni adresle canlıya çıkarır.
- İnceleme hesabı da `apple-review@alfagolab.com` oldu (5. adım): eski `apple-review@lociar.app` hesabının parola
  sıfırlama e-postaları, alan adını kim alırsa ona gider. Yeni hesap açılınca eskisini Firebase Auth'tan sil.

## 3. Google Cloud: erişim ve harcama sınırı (~10 dk)

- 25 Ekim canlı ölçümü gcloud ile okunabildiğine göre konsol erişimi (2 adımlı doğrulama) çalışıyor.
- **"LociAR spend cap" (Cloud Run için ₺10/ay sert limit):** 18 ve 20 Ekim'de doldu ve bütün fonksiyonları durdurdu.
  App Review sırasında dolarsa inceleyen kişi hata görür ve uygulama reddedilir. Karar senin: inceleme ve ilk ay
  için sert limiti yükselt (ör. ₺250) ve %50/%90/%100 uyarılarını bırak; ya da ₺10'da kalıp risk al.
  Emekli 7 zamanlayıcı silinmeden (4. adım) sınır yine dolabilir.
- Billing → Budgets'ta limitin şu an dolu olup olmadığına bak; doluysa 4. adımdan önce aç.

## 4. Backend'i yayınla (Mac, 1–2 saat; çoğu bekleme)

1. **Önce iki secret.** Firebase, `--only` filtresinden önce koddaki *bütün* secret'ları çözer
   (`functions/scripts/deploy-support-stripe.mjs` başındaki not). NOWPayments secret'ları Secret Manager'da yok,
   bu yüzden normal deploy ilk fonksiyonda durur. Kripto kapalıyken kimsenin bilmediği rastgele değerler yeterli
   (gerçek anahtar gerekmez, sahte ödeme kabul edilemez; kripto açılırken gerçek değerlerle değiştirilir):

   ```sh
   openssl rand -hex 32 | ./functions/node_modules/.bin/firebase functions:secrets:set SUPPORT_CRYPTO_API_KEY --project lociar-2f38c --data-file=-
   openssl rand -hex 32 | ./functions/node_modules/.bin/firebase functions:secrets:set SUPPORT_CRYPTO_IPN_SECRET --project lociar-2f38c --data-file=-
   ```

   Diğer secret'lar (`APPLE_PRIVATE_KEY`, `GIPHY_API_KEY`, `SUPPORT_STRIPE_SECRET_KEY`,
   `SUPPORT_STRIPE_WEBHOOK_SECRET`) 25 Ekim'de mevcuttu.
2. `bash scripts/firebase-deploy.command` — önce yerel kapıları çalıştırır, sonra kuralları/indeksleri, her
   fonksiyonu tek tek yayınlar, en sonda emekli 7 fonksiyonu ve zamanlayıcılarını siler. Yarıda durursa hatayı oku,
   düzelt, aynı komutu yeniden çalıştır (tekrar güvenli).
   Not: kurallar fonksiyonlardan önce yayınlanır; yeni kural eski yorum listeleme yolunu kapatır. Mağazada eski
   sürüm olmadığı için sorun değil; yalnız telefonundaki eski geliştirme derlemesinde yorumlar açılmaz.
3. `bash scripts/deploy-admin.command` — yasal sayfalar ve admin (yeni destek adresi için zorunlu).
4. Canlı kabul:

   ```sh
   python3 scripts/qa-live-firebase.py --gcloud-configuration <yetkili-konfigürasyon> --report live-20261026.json
   ```

   Beklenen: `ready: true` (TTL `map_group_sessions.expires_at` ACTIVE, beklenen fonksiyonlar ve 3 zamanlayıcı var,
   emekli zamanlayıcı yok). Ayrıca kimliksiz POST ile `createInvites`, `redeemInvite`, `markActivityRead`,
   `unlockDenseSpot` 401 dönmeli, 403 değil (18 Ekim'deki IAM sorunu).
5. Admin → Bakım görevleri → "Map index repair" (`map_cells`) → şimdi çalıştır. Tam tur bitince harita dizini
   kendiliğinden açılır (`system/geo_queries.map_cells_version = 1`); o zamana kadar harita eski tarama yoluyla
   çalışır (daha pahalı ama doğru).

## 5. İnceleme hesabı ve açılış içeriği (~20 dk)

1. `REVIEW_CREDENTIALS_FILE=$HOME/lociar-review.json FIREBASE_PROJECT_ID=lociar-2f38c node functions/scripts/provision-review-account.mjs`
   → `apple-review@alfagolab.com` hesabı açılır, parola depo dışındaki bu dosyaya yazılır; yalnız App Store
   Connect → Sign-In Information alanına girilir. Sonra eski `apple-review@lociar.app` hesabını Firebase Auth'tan sil.
2. Hesapla uygulamada bir kez giriş yap (profil oluşsun), sonra
   `FIREBASE_PROJECT_ID=lociar-2f38c node functions/scripts/seed-review-content.mjs apple-review@alfagolab.com`
   (Apple Park ve İstanbul örnekleri).
3. Açılış seed'i: `scripts/load-launch-seed.command` (varsayılan: başkentler + işletme notları;
   [LAUNCH_SEED.md](LAUNCH_SEED.md)). Kontrol: haritada Cupertino ve İstanbul boş açılmıyor.

## 6. Fiziksel iPhone ile asgari test (~45 dk)

Release yapılandırmasıyla (TestFlight derlemesi en iyisi) şu akışlar hatasız çalışmalı:

- Misafir: harita, ısı haritası, grup listesi, beğen, şikâyet et, engelle.
- Apple ile giriş ve e-posta ile kayıt + doğrulama; koşullar onay kutusu.
- Konum notu bırak (Kullanırken izni); AR'da yüzeye not sabitle ve yeniden aç (Google ARCore uyarısı görünür).
- GIF ara ve GIF'li not yayınla ("Powered by GIPHY" görünür).
- Bildirimler: beğeni/yorum push'u başka hesaptan gelsin; Ayarlar → Bildirimler → "Her Zaman" izni.
- Hesap sil (Apple hesabıyla): Apple onayı istenir, hesap ve içerik gider.
- Destek düğmesi ve Profil → Kazançlarım **görünmemeli** (Release).

Tam saha matrisi (LiDAR'lı + LiDAR'sız iki iPhone, 23 koşu): `FIELD_TEST_CHECKLIST.md`; ilk sürüm için yukarıdaki
asgari liste gönderim kapısı, tam matris yayın sonrası ilk hafta.

## 7. Ekran görüntüleri ve inceleme videosu (~1 saat)

- Seed içerik canlıyken gerçek iPhone'da çek (6.9", 1320 × 2868; Apple 1–10 kare ister, öneri 5):
  harita (ısı + gruplar), konum notu yazma, AR'da not balonu, not detayı ve yorumlar, profil/koleksiyonlar.
  Tanı yazısı veya "yükleniyor" görünen kare kullanma. Arka planlar: `screenshots/backgrounds/`.
- Uygulamada olmayan özellik gösterme (fotoğraf, video, bağlantı, ödeme yok).
- İnceleme videosu (2–3 dk): [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) §6. Liste dışı bağlantıyı notlardaki
  `<VIDEO_LINK>` yerine koy veya dosyayı ek olarak yükle. "Her Zaman" konumu ve arka plan modları için şart.

## 8. App Store Connect (~1 saat)

Rehberdeki değerlerle: [APP_STORE_SUBMISSION_GUIDE.md](APP_STORE_SUBMISSION_GUIDE.md).

- App Information: ad, alt başlık, kategori (Social Networking / Navigation), Content Rights → üçüncü taraf içerik
  var (GIPHY), yaş anketi (UGC evet, özel mesajlaşma hayır, reklam: yayında aktif marka kampanyası varsa evet; çıkan sonucu
  kullan).
- Business → **DSA tüccar durumu** (AB dahil global yayın için zorunlu).
- Pricing and Availability: ücretsiz; bölgeler (AGENTS.md: global — yol haritası ilk sürüm için yalnız Türkiye
  öneriyordu; karar senin).
- App Privacy: rehber §4 (12 veri türü, izleme yok, Purchases yok).
- Sürüm 1.0.0 sayfası: 12 dilin metinleri `store-metadata/`, ekran görüntüleri, destek ve gizlilik URL'leri,
  telif ("2026 Kağan Kartal Babahan").
- App Review Information: demo hesap, notlar (§1, video bağlantısıyla), iletişim bilgisi (çalışan e-posta ve telefon).
- Version Release: **Manually release this version** (onaydan sonra yayın zamanını sen seç).

## 9. Arşiv, TestFlight, gönderim

1. `project.yml` → `CURRENT_PROJECT_VERSION`: ilk yükleme `1`; her yeni yüklemede bir artır, `xcodegen generate`.
2. Xcode → Any iOS Device (arm64) → **Product → Archive** (Release; `aps-environment = production`, App Attest
   production) → Distribute App → App Store Connect → Upload.
3. TestFlight dahili test: 6. adımı bu derlemeyle yap.
4. App Store Connect'te derlemeyi seç → Export Compliance: standart dışı şifreleme yok (Info.plist zaten bildiriyor)
   → **Submit for Review**.

## 10. Yayın kapısı ama inceleme kapısı değil

- **GIPHY production anahtarı:** beta anahtar saatte ~100 çağrı; inceleme için yeter, lansman için yetmez.
  TestFlight/App Store bağlantısıyla başvur: [GIPHY_PRODUCTION_KEY.md](GIPHY_PRODUCTION_KEY.md).
- Moderatör e-posta uyarıları (şikâyetlerin 24 saatte ele alınması için): optimizasyon planı madde 50.
- AR ekranındaki teknik tarama satırı ("Takip · Harita · özellik · düzlem · mesh") Release'de de görünüyor; ret
  sebebi değil, ama 1.1'de sade bir ilerleme göstergesiyle değiştirilmesi önerilir (fiziksel cihaz testleri bu
  satırın etiketini okuduğu için 1.0'da değiştirilmedi).

- **Hata taraması B01:** 27 Ekim adayında spotsuz (`post:`) gruplar ortak erişim çemberi vermiyor;
  her not kendi noktasıyla açılıyor. Üç notun 0/20/40 m zincirinde başka grup istemenin erişimi değiştirmemesi
  regresyon testiyle denetlenir. Bu değişiklik canlıya dağıtılmadan P1 kapanmış sayılmaz.
  Geçici grupların özet/detay üyelik farkı ayrı bir arayüz tutarlılığı sınırıdır; bu düzeltme onu çözmez.

## Gönder / gönderme

Gönderim için 1–9'un hepsi tamam olmalı. En kritik üçü: canlı backend `ready: true` (4), yasal sayfalarda yeni destek adresi (2, 4.3),
gerçek ekran görüntüleri ve video (7).
