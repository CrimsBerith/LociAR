# LociAR App Store kabulü — 28 Ekim 2026

**Karar: henüz gönderime hazır değil.** Firebase mimarisi ve kullanıcının ₺10 Cloud Functions sınırı
korundu. Yerel kabul, canlı web, canlı mobil API ve App Store alanları ayrı değerlendirilir.

## Tamamlanan hazırlık

- Güncel Release arşivi: `build/release-check-20261028/LociAR-Privacy-Final.xcarchive`.
- Dağıtım IPA'sı: `build/release-check-20261028/export-final/LociAR.ipa`, sürüm `1.0.0 (1)`.
  Üretim APNs/App Attest, debugger kapalı, geçerli derin imza; binary/dSYM UUID'leri eşleşiyor.
  Xcode 26.6 / iOS SDK 26.5. Son arşivde Crashlytics sembol yüklemesi başarılı.
- AR çevre haritaları `post-world-maps/<luid>/<post>/...` altında hesapla ilişkilidir. Yanlış genel
  “Other Data Types / ilişkisiz” beyanı, “Environment Scanning / ilişkili / App Functionality” olarak
  düzeltildi. Paket içindeki gerçek manifesti denetleyen Release StoreReadiness testleri **11/11** geçti.
- Gömülü SDK manifestleri ayrıca okundu: Firebase Messaging'in ilişkisiz “Other Data Types / Analytics”
  beyanı, AR çevre taramasından ayrı tutuldu. Hazırlanan mağaza yanıtları toplam **13 veri türü** içerir.
  Uygulama manifesti ve SDK manifestleri ayrı kaynaklardır; bu işlem Firebase Analytics SDK'sı eklemez.
- On iki dilin mağaza metni sınırları, 700 anahtar × 12 dil yerelleştirme ve gizli anahtar taraması geçti.
- Admin tip kontrolü, production derleme, **43/43** birim ve **26/26** yerel masaüstü/mobil web testi geçti.
- Güncel admin Firebase App Hosting'e dağıtıldı. Revision `lociar-admin-build-2026-10-28-001`, trafik %100;
  min 0, revision max 2, service max 3 korundu. Cloud Build ve rollout başarılı.
- Eksik üç bileşik indeks oluşturuldu: artık **29 indeks READY**. `map_group_sessions.expires_at` TTL
  **ACTIVE**. Diğer indeksler, güvenlik kuralları ve IAM izinleri değiştirilmedi.
- Apple Developer Program License Agreement'ın **27 Ekim 2026'da kabul edildiği** canlı hesapta doğrulandı.
  App Store Connect Business ekranında Free/Paid Apps anlaşmaları Active. Önceki sözleşme engeli kapandı.

## Test katmanları

| Katman | Kanıt / sınır |
|---|---|
| Native ve genel UI, 27 Ekim | 272 native geçti, 2 fiziksel cihaz testi atlandı; 39 UI geçti. Bugün başlangıçta kabul edilen kaynak hash'leri yeniden karşılaştırıldı; yeni manifest değişikliği ayrıca 11 Release testiyle doğrulandı. |
| Gerçek iOS SDK + yerel Firebase | 17 senaryo geçti: not yayımlama/açma, hatadan toparlanma, rıza, profil, oturum ve hesap temizliği. Canlı sağlayıcı kanıtı değildir. |
| Yerel admin → simülatör bildirimi | 5 senaryo geçti; gerçek panel formu ve gönderim işleyicisi, açıkça enjekte edilen `simctl push` taşıyıcısı. Banner, dokunma ve okundu durumu doğrulandı; gerçek APNs teslimi değildir. |
| Oturumlu admin entegrasyonu, 27 Ekim | 132/132 geçti; bugünkü admin test/dağıtımında ilgili kaynaklar korundu. Üretimde her yönetim işleminin gerçek kullanıcılar üzerinde yapıldığı anlamına gelmez. |
| Canlı genel web, yeni yayın sonrası | Son koşu **26/26**, hata/atlama/flaky yok. `/support` ayrıca 200 ve `support@alfagolab.com` içeriyor. Bu koşu oturumlu üretim mutasyonlarını kapsamaz. |
| Canlı mobil API | `readDataPreferences` son kimliksiz kontrolde **503**. ₺10 Functions spend cap engeli ayrı açık. |

## Admin neden “Rate exceeded” diyordu?

Cloud Run kayıtlarında HTTP **429**, `WARNING` ve **“The request was aborted because there was no
available instance”** görüldü. Yetkili operatör kimliğiyle doğrudan Cloud Run `/support` isteği de 429 aldı;
hata yalnız tarayıcı, oturum veya App Hosting ön yüzü kaynaklı değildi. Uygulama koduna ulaşmadan
Cloud Run isteğe instance ayıramıyordu. Bir dakikalık metrik örneklerinde admin en fazla bir instance
gösterdi; max 2 sınırının dolduğu veya bölgesel CPU'nun tükendiği kanıtlanmadı. Kesin alt neden için
“çok fazla kullanıcı var” denemez. [Google'ın hata açıklaması](https://docs.cloud.google.com/run/docs/troubleshooting#abort-request).

Yeni yayın ilk kontrolünde de 429 sürdü. Daha sonraki `/support` kontrolü 200 döndü ve ardından 26 canlı
web kontrolünün tamamı geçti. **Son kabul başarılı; önceki aralıklı hatanın kalıcı olarak ortadan kalktığı
uzun süreli gözlemle henüz doğrulanmadı.** Cloud Functions harcama engeli ile adminin Cloud Run kapasite
reddi tek hata gibi sunulmaz; yalnız Functions cap'inin varlığı admin 429'un kesin nedenini kanıtlamaz.

## Açık gönderim kapıları

1. **Canlı Functions kapalı:** kullanıcı ₺10 eşiğini koruyup Kasım döneminde otomatik açılmasını seçti.
   Limit kaldırılmadı/artırılmadı. Yeni dönemde sıfırlandığı ve gerçek kullanıcı çağrıları çalıştığı ölçülmeli.
2. **Kaynak/canlı backend uyumu:** dört bakım fonksiyonu ve üç yeni Scheduler işi eksik; yedi eski iş hâlâ
   var. Önce yeni bakım çalışması doğrulanmalı, ardından emekli işler kaldırılmalı. Hesap silme tekrarları
   durdurulmaz. Dört callable'ın public HTTP taşıma invoker ayarı eksik; Auth/App Check korunarak koordineli
   dağıtım ve geçerli kullanıcı/kimliksiz istek kabulü gerekir. İzinler bu kontrolde genişletilmedi.
3. **Gerçek teslim/saha:** gerçek APNs/FCM alma ve dokunma; AR Cloud Anchor/VPS saha yeniden bulma ve
   diğer donanım/harici sağlayıcı akışları tamamlanmadı. Simülatör başarısı bunların kanıtı değildir.
   Release'de ödeme girişleri kapalı; gerçek ödeme kabulü iddia edilmez.
4. **App Store Connect:** build yükleme/seçme, güncel ekran görüntüleri ve inceleme videosu, çalışan review
   hesabı, iletişim bilgileri, yaş derecesi ve Content Rights açık. Telefon bilgisi kullanıcıya soruldu.
   Privacy Policy URL kaydı kalıcı doğrulandı; 12 veri türü listesi kaydedildi. SDK'dan gelen 13. tür ile
   amaç/ilişkilendirme yanıtları henüz tamamlanmadı; App Privacy yayımlanmadı.
5. **Adayın izlenebilirliği:** çalışma ağacı hâlâ commit edilmemiş değişiklikler içeriyor. Önceki commit'in
   CI başarısı bu adayı kapsamaz. Gönderilecek commit, CI ve son imzalı IPA aynı adaya bağlanmalı.

Apple'a build yüklemesi veya App Review gönderimi yapılmadı. Eski ekran görüntüleri, kaldırılmış
özellikler/boş harita/tanı metinleri içerdiği için gönderim seti sayılmaz. Hazır dosyalar bu eksikleri kapatmaz.

## Kanıt kökü

`build/release-check-20261028/verification.json`, `release-artifact-final-verification.json`,
`store-readiness.xcresult`, `admin-live-browser-after-deploy.json`, `admin-deploy.log`,
`admin-service-after-deploy.json`, `admin-authorized-runtime-probe.json`, `index-parity.json`,
`firestore-indexes-after.json`, `ttls-after.json`, `submission/`.

Önceki ayrıntılı akış kabulü: [USER_FLOW_QA_2026-10-27.md](USER_FLOW_QA_2026-10-27.md).
