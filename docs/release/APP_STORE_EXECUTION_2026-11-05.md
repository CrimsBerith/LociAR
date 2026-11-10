# App Store yayın planı — uygulama durumu, 5 Kasım 2026

## Karar

**App Store'a gönderime henüz hazır değil.** Yerel yazılım ve emülatör kapıları geçti; ancak gerçek iPhone/TestFlight doğrulaması, güncel imzalı sürüm adayı, App Store Connect hazırlıkları ve hukuki/ülke kapsamı kararları eksik. App Store incelemesine gönderim veya canlı dağıtım yapılmadı. Hiçbir test %100 sorunsuzluk garantisi vermez.

6 Kasım'daki tekrar ve ek emulator suite sonuçları: [EMULATOR_FLOW_VERIFICATION_2026-11-06.md](./EMULATOR_FLOW_VERIFICATION_2026-11-06.md).

## Bu koşuda tamamlananlar

| Alan | Sonuç |
|---|---|
| iOS simülatör CI | 282 native test geçti, 2 fiziksel sensör testi atlandı; UI 53/53 geçti. |
| Release StoreReadiness | 11/11 geçti. |
| Functions | Tip kontrolü/build ve birim testler 192/192 geçti; emülatör kabulü 177/177 geçti. |
| Firestore / Storage kuralları | Emülatör testleri 96/96 geçti. |
| Admin | Tip kontrolü ve production build geçti; birim testler 48/48, emülatör kabulü 31/31, kimlik doğrulamalı entegrasyon 138/138 geçti. |
| Admin web | Masaüstü ve mobil Chromium kabulü 26/26 geçti. |
| Bağımlılıklar | Functions ve admin production/full dependency audit temiz; production audit'lerinde 0 açık bulundu. |
| Repo kontrolleri | Betik regresyonları 65/65 geçti; secret scan başarılı. |
| Yerelleştirme | 12 dilde 732 anahtar, `needs_review` yok. |
| Yasal/support URL'leri | Üç HTTPS URL'si 200 döndü; destek adresi İngilizce yasal/support sayfalarında mevcut. |
| Firebase canlı metadata | Yalnızca-okuma kontrolü tamamlandı: 10 eksik Functions bulgusu, tümü destek/ödeme özelliklerine ait. Ayrıntı: [app-store-plan-20261105.json](../../build/firebase-readiness/app-store-plan-20261105.json). |
| Firebase deploy dry-run | Tüm yerel kontroller geçti. Komut canlı kimlik doğrulama veya dağıtım yapmadı. |

Üretim bağımlılık taramalarında bilinen açık bulunmadı; bu, kaynak kodun veya canlı hizmetin güvenlik garantisi değildir. Emülatör test günlüklerinde beklenen hata dalları için `ERROR` kayıtları yer aldı; testler başarılı sonuçlandı.

## Açık yayın kapıları

1. **Sürüm adayı:** Bu çalışma ağacı kirli ve güncel `.xcarchive` / `.ipa` yok. Mevcut HEAD `1dc042f96017c7d846aade110124a2566c19ea88`; bu commit tek başına değiştirilmiş dosyaları kapsamaz. Değişiklikler gözden geçirilip temiz bir release commit'i oluşturulmalı, aynı commit CI'dan geçirilmeli, imzalı arşiv/IPA üretilip doğrulanmalı ve TestFlight'a yüklenmelidir.
2. **Gerçek cihaz:** Kayıtlı iPhone 14 Pro Max bu koşuda `unavailable` durumundaydı. Kamera/ARCore, fiziksel GPS, arka plan konum ve gerçek APNs teslimi/doğrulaması yapılamadı. Simülatörde iki fiziksel sensör testi atlandı. Bu akışlar cihazda, izin verme/reddetme ve uygulama yeniden başlatma senaryolarıyla test edilmelidir.
3. **App Store Connect:** Mevcut hesapta güncel kayıtlar bu koşuda doğrulanmadı. App Privacy yanıtları uygulama ve SDK privacy manifestleriyle eşleştirilmeli; yaş derecesi, bölge kapsamı, metadata, destek iletişimi ve sözleşmeler doğrulanmalıdır. İnceleme notlarındaki `<VIDEO_LINK>` gerçek video/ekle değiştirilmeli; demo hesabı ve içerikleri güvenli biçimde hazırlanıp giriş bilgileri yalnızca App Store Connect'e girilmelidir. Güncel ekran görüntüleri ve fiziksel cihaz inceleme videosu da hazırlanmalıdır.
4. **Hukuki kararlar:** Yayına açılacak ülkeler/yaş grupları ile ilgili hukuki ve gizlilik kararları ürün sahibi ve uygun hukuk danışmanı tarafından onaylanmalı. KVKK ve sınır ötesi veri aktarımı dahil açık yükümlülükler kapatılmadan gönderim yapılmamalıdır.
5. **Canlı backend özellik eşleşmesi:** Canlı metadata'daki eksik 10 uç: `beginApplePostSupport`, `beginCryptoPostSupport`, `beginExternalPostSupport`, `confirmApplePostSupport`, `readMyPostSupport`, `readMySupportEarnings`, `readSupportCatalog`, `refreshStripePostSupport`, `supportAppleNotifications`, `supportCryptoWebhook`. Release testleri destek/ödeme girişlerinin kapalı olduğunu doğruluyor; bu özellikler kapalı kalmalı ve mağaza metninde vaat edilmemeli. Açılmaları istenirse ayrı dağıtım, sağlayıcı yapılandırması ve canlı kabul testi gerekir.
6. **Kademeli yayın ve izleme:** TestFlight kabulü ve tüm yukarıdaki onaylardan sonra kademeli yayın; çökme, giriş, konum, bildirim, maliyet ve destek metrikleri için sorumlu/geri alma planı belirlenmelidir.

## İzlenmesi gereken uyarılar

- Simülatör konum notu akışında `Invalid frame dimension (negative or non-finite)` uyarısı iki testte görüldü. Kaynağın uygulama kodu mu yoksa MapKit/XCUITest mi olduğu doğrulanmadı.
- Örnek AR gönderisi görüntüleme akışında QoS öncelik terslenmesi uyarısı görüldü.
- Admin web kabulünde Next.js `metadataBase` tanımlı olmadığı için Open Graph/Twitter görsel URL'lerinde `http://localhost:3100` varsayım uyarısı verdi. Üretim sosyal paylaşım metadata'sı doğrulanmalı.

Bu uyarılar test başarısızlığı değildi; gerçek cihaz/üretim doğrulamasından önce kök nedenleri belirlenmeli. Ayrıntılı iOS koşusu: [IOS_SIMULATOR_QA_2026-11-05.md](./IOS_SIMULATOR_QA_2026-11-05.md).

## Yapılmayan işlemler

Canlı Functions veya admin dağıtımı, App Store Connect'e yükleme/gönderim, sözleşme kabulü, harcama sınırı değişikliği ve kullanıcıya etkisi olan üretim mutasyonu yapılmadı. Firebase canlı kontrolü metadata ile sınırlıydı; secret değerleri okunmadı.
