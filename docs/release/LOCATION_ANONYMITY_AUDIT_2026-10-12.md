# Anonim mesaj, GPS ve arka plan bildirim denetimi — 12 Ekim 2026

**13 Ekim devamı:** [Kod, canlı dağıtım ve son doğrulama raporu](LOCATION_ANONYMITY_FIXES_2026-10-13.md). Aşağıdaki canlı eksikler denetimin ilk anını gösterir; sonraki dağıtımda kapatıldı. Fiziksel iPhone kabulü kullanıcı isteğiyle sonraya bırakıldı.

**Karar: canlı yayın için tamam değil.** Yerel kod, simülatör, emülatör ve canlı Firebase ayrı değerlendirildi. Başlangıç `feat/location-notes`, kaynak commit `8445620de`; düzeltmeler `codex/fix-anonymous-location-audit` dalında. Bu denetimde üretime dağıtım yapılmadı.

## Düzeltilenler

- Konum notu ölçümlerinde eski, geleceğe aşırı tarihli, geçersiz ve tekrar teslim edilen GPS örnekleri elenir. Ölçüm kesildiğinde hazır durumu kaybolur; yayın sırasında eski koordinat kullanılmaz. Çelişen örneklerin yayılımı belirsizliğe eklenir; ortalamaya sahte hassasiyet atanmaz.
- Kameradan alınan konum 3 saniyeden eskiyse yeni GPS ölçümü kullanılır. AR konum yakalama ilk kaba ölçüm yerine 15 m veya daha iyi ölçüm bekler; zaman aşımındaki eski konum kabul edilmez. Gerçek yüzey kilidi ARKit/ARCore ile ayrıdır.
- iOS konum olayıyla süreci açtığında Firebase, hesap ve kaydedilmiş bölge tercihleri SwiftUI başlangıcından önce yüklenir. Kampanya tercihleri hesaplar arasında taşınmaz; bekleyen tercih değişiklikleri izlemeyi kapalı tutar.
- Kampanya veya konum notu tercihi kapatıldığında ilgili bölgeler hemen kaldırılır. Kampanyalar da arka plandaki önemli konum değişimlerinde yenilenir. Yenileme sınırından çıkınca yeni ölçüm istenir.
- Her Zaman, Kesin Konum ve Arka Planda Uygulama Yenile eksikleri ayarlarda görünür. Ziyaretlerden sık kalınan yeri öğrenme yalnız onaylı kampanyalarda, cihazda çalışır.
- Konum notu bildirim alındı kayıtları süresiz kalmalı; yanlış TTL beklentisi kaldırıldı. Aynı notun aynı kişiye yeniden gönderilmemesi korunur.
- Web yükleme ekranındaki yinelenen `main` hedefi kaldırıldı. Klavyeyle içeriğe atlama, parça parça yüklenen sayfa görünür olduğunda odağı ana içeriğe taşır; sunucudan gelen bağlantı JavaScript başlamadan kullanılmışsa niyet korunur. 24 masaüstü/mobil tarayıcı testi tekrar gerektirmeden geçti.
- Anonim beğeni olayının tekrar teslim testi artık eski açık kimlik yerine tek, kimlik gizleyen kayıt oluşmasını ve okunmuş durumun korunmasını doğrular.

## Kanıt

| Kontrol | Sonuç |
|---|---|
| Son iOS native test çalıştırması | 153/153, 0 hata; son kaynak değişiklikleri dahil |
| Simülatöre uygun UI testleri | 20 test, 0 hata; anonim giriş onayı dahil |
| Functions tür kontrolü ve birim testleri | 122/122 geçti |
| Firestore ve Storage kuralları | 82/82 geçti |
| Functions tam entegrasyon paketi | 145/145, 0 hata, 0 atlama; anonim yayın, gizlilik, konum notları ve tekrar teslim dahil |
| Admin tür kontrolü ve birim testleri | 35/35 geçti |
| Admin entegrasyon testleri | 87/87, 0 hata, 0 atlama; gerçek HTTP ve yetkili Chromium işlemleri dahil |
| Public masaüstü ve mobil tarayıcı testleri | Üretim test yapısında 24/24 geçti; tekrar veya atlama yok |
| Repository testleri | 42/42 geçti; TTL denetimi güncellemesi 22 Python testiyle ayrıca geçti |
| Bağımlılık güvenlik denetimleri | Functions/admin üretim ve tam bağımlılık denetimleri geçti |
| 12 dil, katalog, derleyici anahtarları, mağaza metinleri | Geçti |
| Marka varlıkları | 47 PNG, SVG ve ikon denetimleri geçti |
| Gizlilik, koşullar, destek adresleri | Üçü de HTTP 200 |
| Firebase ücretli planı | Faturalama etkin |
| Canlı Firebase kaynak denetimi | 38 eksik: 23 fonksiyon, 13 aktif TTL, 2 zamanlanmış görev |
| Canlı anonim giriş sağlayıcısı ayarı | HTTP 403; etkinliği doğrulanamadı |
| Fiziksel iPhone | Kayıtlı iPhone erişilebilir değil; saha testi yapılmadı |
| GitHub | main CI başarılı; bu yerel düzeltmeler için CI veya üretim kanıtı değil |

Harita yoğunluğu testi geniş koşularda 10 saniyelik beklemeyi aştı. Emülatörde sonradan doğru sayaç oluştuğu doğrudan okundu; asenkron toplu tetikleyiciler için bekleme 30 saniyeye çıkarıldı, sayaç koşulları değiştirilmedi.

İlk genel UI koşusu fiziksel cihaz testlerini de seçtiği için kesildi; başarı kanıtı olarak kullanılmıyor. Sonraki koşu `scripts/ci-ios.sh` içindeki simülatör test seçimini kullanır.

Doğrulama özeti: `build/location-audit-20261012/evidence.json`; son başarılı test günlükleri aynı klasörde saklandı. İlk kesilen/başarısız koşular başarı kanıtına dahil değildir.

## Anonimlik kapsamı

Emülatör kontrolleri: anonim hesapla yayın, moderasyon, tekrar çağırma, sahibin silme hakkı, herkese açık yanıtta yazar kimliğinin gizlenmesi, profil listelerinden anonim yazarlığın çıkarılması, gizli engelleme, beğeni sayısı, kimliksiz aktivite ve hesap silme. Firestore anonim postların ham belgelerini başka kullanıcılara açmaz; Storage anonim dünya haritasının sahibine ait yolunu herkese açmaz. Üretimde eksik fonksiyonlar ve anonim sağlayıcı ayarı ayrıca tamamlanmalıdır.

## Uygulama kapalıyken davranış

Sürekli sunucuya konum geçmişi yüklemek yerine iOS bölge izleme ve önemli konum değişimleri kullanılır. Yakındaki bölgeye girişte kısa hassas GPS penceresi açılır; iki uygun ölçüm ve canlı sunucu kontrolünden sonra bildirim oluşturulur. Genel bildirim izni, uygulama içi bildirim tercihi, Her Zaman, Kesin Konum, Arka Planda Uygulama Yenile ve internet gerekir.

Ekranın kilitlenmesi veya ana ekrana dönülmesi ile uygulamanın zorla kapatılması farklıdır. iOS yeniden başlatma ve bildirim zamanlaması garanti edilemez. GPS kapı veya masa düzeyinde kesin giriş kanıtı değildir. Ağ/süreç kesintisi sunucu kabulünden sonra yerel bildirimi kaybettirebilir; aktivite kaydı kalır. Fiziksel iPhone üzerinde kilit ekranı, normal arka plan, iOS tarafından sonlandırma, zorla kapatma, yeniden başlatma, izin azaltma, yaklaşık konum, çevrimdışı giriş ve pil ölçümü ayrı test edilmelidir.

Apple kaynakları: [Bölge izleme](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/RegionMonitoring/RegionMonitoring.html), [arka planda konum](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

## Canlı eksikler

Metadata raporu: `build/firebase-readiness/location-audit-final-20261012.json`. Süresiz alındı kaydı TTL beklentisi düzeltildikten sonra canlı kaynaklar yeniden okundu; son metadata örneği 23:41 Türkiye saatiyle toplandı.

### Eksik fonksiyonlar

- `blockPostAuthor`
- `createPlaceNote`
- `expireScheduledNotes`
- `onAdminNotificationQueued`
- `onCampaignZoneChanged`
- `onPostDensityWritten`
- `onReportCreated`
- `readActivity`
- `readAnonymousWorldMap`
- `readCampaignRegions`
- `readCampaignZones`
- `readDataPreferences`
- `readLikeCount`
- `readNoteDensity`
- `readPlaceNoteRegions`
- `reconcileNoteDensity`
- `recordCampaignArrival`
- `recordCampaignStep`
- `recordPlaceNoteVisit`
- `recordUserContext`
- `setDataPreferences`
- `submitBrandCampaign`
- `unlockDenseSpot`

### Eksik aktif TTL politikaları

- `admin_notification_jobs.expires_at`
- `admin_notification_receipts.expires_at`
- `brand_submission_quota.expires_at`
- `campaign_codes.expires_at`
- `campaign_departure_regions.expires_at`
- `campaign_progress.expires_at`
- `campaign_targets.expires_at`
- `campaign_view_receipts.expires_at`
- `dense_spot_receipts.expires_at`
- `dense_spot_unlocks.expires_at`
- `promotion_push_quota.expires_at`
- `user_device_context.expires_at`
- `user_locations.expires_at`

### Eksik zamanlanmış görevler

- `expireScheduledNotes`
- `reconcileNoteDensity`

## Tamamlanması gerekenler

Testlerden sonra Functions, kurallar, indeksler/TTL ve App Hosting dağıtımı; canlı metadata denetiminin yeniden geçmesi; Firebase anonim giriş ayarının yetkili hesapla doğrulanması; imzalı iPhone yapısında APNs ve gerçek konum saha testleri. Bunlar kapanmadan canlı kullanımın eksiksiz olduğu söylenemez.
