# Crash ve hata izleme — 27 Ekim 2026

## Yapılanlar

- iOS Crashlytics entegrasyonu korundu. Callable servis/yanıt, push, region monitoring ve ARCore başlangıç
  hataları `DiagnosticsReporter` üzerinden sabit ve kişisel veri içermeyen kategorilerle kaydedilir.
- Nonfatal tekrarları kategori başına 300 saniye, süreç başına 8 kayıtla sınırlandı. Fatal SDK kayıtları bu
  sınırdan etkilenmez. Opt-out korunur; kapalıyken nonfatal gönderilmez ve bekleyen raporların silinmesi istenir.
- Harici Swift paket klasörüyle arşiv alırken dSYM yükleyicisinin bulunamaması düzeltildi. Arşiv artık sembol
  yüklenmezse başarısız olur; 120 saniye süre sınırı korunur.
- Önceki `LociAR-Final.xcarchive` sembolleri resmi Firebase uploader ile başarıyla yüklendi.
- Yeni `LociAR-Diagnostics.xcarchive` ve App Store export IPA üretildi. Yeni dSYM UUID:
  `2C9F9B6F-FD00-3DE2-B1BD-2644014F79AD`; binary ile aynı, Crashlytics yüklemesi başarılı.

## Canlı Google Cloud

- Alıcı: **support@alfagolab.com** (kullanıcının seçimi).
- Bir e-posta kanalı ve üç log eşleşmesi politikası oluşturuldu, API'den yeniden okunarak doğrulandı:
  hesap/temizlik/kill switch; diğer sunucu ERROR kayıtları; iOS fatal crash kayıtları.
- E-posta politika başına en fazla saatte bir; incident otomatik kapanma 24 saat. Kullanıcı/içerik etiketi çıkarılmaz.
- Ek Scheduler işi, özel log metriği, BigQuery export, IAM veya bütçe değişikliği yapılmadı.
- `_Default` log saklama 30 gün. `_Required` zorunlu audit bucket'ı mevcut 400 gün ve kilitli; değiştirilmedi.
- Kişisel veri içermeyen bir test ERROR kaydı yazıldı. Google Logging'de canlı sunucu alarm filtresiyle geri
  okunabildi. **Gelen kutusuna teslim henüz kullanıcı tarafından doğrulanmadı.**

## Tamamlanmayan dış adımlar

1. Firebase paneli Google hesabı için 2 Adımlı Doğrulama istiyor. Kullanıcıya kendisinin tamamlaması için
   soru iletildi. Hesap güvenliği ayarları ajan tarafından değiştirilmedi.
2. iOS fatal alarm politikası hazır; veri kaynağı ayrıca Firebase → Project settings → Integrations →
   Cloud Logging'de LociAR iOS için bağlanmalı. **Include sessions kapalı** tutulmalı. Bu bağlantı bu çalışmada
   doğrulanamadı; dolayısıyla iOS crash → destek e-postası hattı tamamlandı sayılamaz.
3. Gerçek kontrollü iOS crash → yeniden açılış → Crashlytics panelinde sembollü stack kabulü yapılmadı.
   Fiziksel iPhone son sorguda erişilemiyordu. Simülatör XCTest'lerindeki Firebase keychain uyarıları nedeniyle
   yerel test sonucu cloud ingestion kanıtı olarak kullanılmadı.
4. Yeni IPA Apple'a yüklenmedi; kaynak değişiklikleri henüz kullanıcılara dağıtılmadı. GitHub/CI güncellenmedi.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Native XCTest (simülatör) | 272 toplam; 270 geçti, 2 fiziksel cihaz testi atlandı, 0 hata |
| Uploader + monitoring Node testleri | 9/9 geçti (monitoring wrapper ayrıca 5 Python testi çalıştırır) |
| Tüm mevcut Python regresyonları | 40/40 geçti |
| Yerelleştirme release kontrolü | 700 anahtar × 12 dil, needs_review 0 |
| Release archive + export | başarılı |
| Export IPA kod imzası | geçerli; APNs/App Attest production, get-task-allow false |
| Sembol UUID eşleşmesi ve yükleme | başarılı |
| Canlı alarm read-back | 3 politika + e-posta kanalı |
| Test logunun canlı filtreyle eşleşmesi | doğrulandı |
| E-posta teslimi / gerçek iOS crash teslimi | doğrulanmadı |

IPA: `build/crash-collector-20261027/export/LociAR.ipa` (21,401,088 bayt).
SHA-256: `86ed951de5b8343e0171c596811728f4024d562e324889c496d15dda4b12d944`.

Kanıtlar: `build/crash-collector-20261027/summary.json`, `release-artifact-verification.json`,
`monitoring-final.json`, `alert-test-log.json`, `native-final.xcresult`, `archive.log`, `export.log`.
Önceki kirli çalışma yedeği aynı klasörde `worktree-before.tar.gz`, patch ve hash listesiyle korundu.

## Maliyet

[Crashlytics ücretsiz](https://firebase.google.com/pricing). [Cloud Logging'in](https://cloud.google.com/products/observability/pricing)
proje başına ilk 50 GiB/ay kotası ve 30 gün saklaması ücretsiz; aşan kayıt hacmi $0.50/GiB.
Crashlytics Cloud Logging bağlantısı açılırsa onun kayıtları da bu ortak kotaya dahil olur.
Cloud Monitoring alarm ücretlendirmesi en erken 1 Eylül 2027 olarak ilan edilmiştir; tarih yaklaşınca tekrar
kontrol edilmeli. İzleme için sabit ücretli abonelik eklenmedi. Bu, uygulamanın diğer Firebase maliyetlerinin
sıfır olduğu veya faturanın üstten sınırlandığı anlamına gelmez.

İşletim/yeniden kurulum: [DIAGNOSTICS.md](../DIAGNOSTICS.md).

## Teslim kontrolü — aynı gün takip

Kullanıcı Google 2 Adımlı Doğrulama ve ona bağlı iOS crash veri bağlantısını sonraya bıraktı;
bu adımlar için hesap ayarı değiştirilmedi. Kullanıcı test e-postasının henüz gelmediğini bildirdi.

Panel gerektirmeyen API kontrolleriyle şu ek kanıtlar alındı:

- Test ERROR kaydı **27 Ekim 2026 03:31:40 Türkiye saati / 00:31:40 UTC** zamanında gerçek alarm açmış:
  `projects/lociar-2f38c/alerts/0.oeaup4s3q8iy`, durum `OPEN`, politika `Server errors`.
- E-posta kanalı açık ve alıcı `support@alfagolab.com`; üç politika açık, API'de validity hatası yok.
- Snooze yok; `stackdriver_notification_channel` kayıtlarında kontrol aralığında hata bulunmadı.
  Hata kaydı bulunmaması e-posta gönderildiği veya teslim edildiği anlamına gelmez.
- `alfagolab.com` MX kayıtları `mx1.hostinger.com` / `mx2.hostinger.com`. MX kaydı tek başına destek
  posta kutusunun varlığını veya teslimi kanıtlamaz.
- Yeni test mesajı gönderilmedi; yeni ücretli servis veya izin eklenmedi.

Dolayısıyla test için **log → alarm doğrulandı, alarm → gelen kutusu doğrulanmadı**. Kök neden henüz
belirlenmedi. Sonraki somut kontrol Hostinger → Email Logs → Delivery → Inbound altında alıcı ve tarih
ile aramaktır. Google Monitoring göndereni `alerting-noreply@google.com` olarak belgeler; gerekiyorsa
bu gönderen özelinde spam/filtre sonucu incelenir, genel güvenlik korumaları kapatılmaz.

[Google bildirim rehberi](https://docs.cloud.google.com/monitoring/support/notification-options) ·
[Hostinger teslim kayıtları](https://www.hostinger.com/support/6404796-how-to-check-delivery-logs-for-hostinger-email/).
Ek kanıt: `build/crash-collector-20261027/delivery-followup.json`.
