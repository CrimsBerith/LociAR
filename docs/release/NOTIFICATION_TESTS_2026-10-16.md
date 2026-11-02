# Bildirim doğrulaması — 16 Ekim 2026

## Sonuç

**44 backend/emülatör testi geçti. E-posta koduyla production admin girişi artık doğrulandı. Kağan iPhone'da bildirim tercihi açıldı ve canlı sunucu kaydı doğrulandı; APNs/FCM teslimi ve bildirime dokunarak açılma henüz doğrulanmadı.**

## Aynı gün sonraki canlı çalışma

- `build-2026-10-16-001` ile e-posta kodu girişi ve olağan yönetici mesajlarını ayrı pazarlama rızası istemeden gönderen sunucu düzeltmesi yayımlandı. Kullanıcı kodu kendi posta kutusundan girerek paneli açtı; Super Admin / Email Code Verified görüldü.
- Kağan iPhone'da gerçek hesapla Bildirimler açıldı, Kampanyalar kapalı kaldı. Canlı `user_data_preferences.notifications` true, `promotions` false olarak doğrulandı. İlk UI testi yalnız tercih kalıcılığını kanıtladı; sistem bildirim iznini kanıtlamadı.
- Değer içermeyen Debug tanılaması iOS bildirim izninin başlangıçta `notDetermined` olduğunu gösterdi. İkinci test gerçek sistem bildirim penceresini açtı; iOS 26 otomasyon kesinti sorgusu hatası nedeniyle test başarısız oldu. Kullanıcı sonrasında bildirim iznini verdiğini bildirdi. Bu ayrım test kanıtında korunur.
- Güncel fiziksel kanıt: `build/admin-email-code-20261016/physical/`. Eski çalışmanın aşağıdaki kapalı tercih/oturumsuz admin bulguları ilk denetime aittir.

## İlk denetim

- Admin kuyruğu/teslim hattı: 14/14, sıfır atlama. Bildirim rızası, pazarlama rızasının ayrı tutulması, günlük üç iş sınırı, idempotency, eşzamanlı tekrar teslim, yetki/rıza iptali, cihaz sahipliği ve geçersiz cihaz kaydı kontrolleri geçti. FCM göndericisi testte taklittir.
- Push ve kampanya hattı: 30/30, sıfır atlama. Cihaz/FID kaydı ve hesap değişimi, gönderim tekrarları, günlük limit, hesap silme, giriş/çıkış bildirimleri ve yolculukların saat/gün kuralları geçti. Ortam yalnızca `demo-lociar` emülatörüdür.
- Fiziksel iPhone 14 Pro Max, iOS 26.7.1: `testPhysicalCurrentAccountNotificationState` test argümanı/önizleme hesabı kullanmadan açıldı. Gerçek hesap oturumu var; uygulama içindeki Bildirimler ve Kampanyalar anahtarları kapalı. Bu testin başarılı olması bildirimlerin açık olduğu anlamına gelmez.
- Hedef hesabın canlı Firebase kaydı, dar kapsamlı salt okunur sorguyla doğrulandı: bildirim tercih belgesi yok, kayıtlı push cihazı sıfır. Kimlik ve cihaz değerleri bu rapora alınmadı.
- Canlı admin Safari’de `/admin/login?reason=admin_required` sayfasına yönlendirdi. E-posta bağlantısı/MFA oturumu gerekli. Oturumsuz bildirim API isteği `401 Authentication required` döndürdü; bildirim oluşturulmadı.

## Zamanlı bildirim

Mevcut manuel admin formu yalnızca anlık kuyruk oluşturuyor. Otomatik saatli gönderim/scheduler bulunmuyor. Kampanyanın başlangıç/bitiş tarihi erişimi, yolculuğun gün/saat kuralı ise yerinde kabulü sınırlar; hiçbiri gelecekte otomatik push kuyruğu oluşturmaz. `docs/BRAND_CAMPAIGNS.md` de bu sınırı açıkça belgeliyor. Bu özellik başarılı test edildi diye işaretlenemez.

## Canlı kabul için gerekenler

1. Safari’de admin e-posta bağlantısı ve MFA girişini tamamlamak.
2. Kağan iPhone’da uygulama içi Bildirimler seçeneğini açmak ve gerekiyorsa iOS bildirim iznini vermek. Normal admin mesajı için pazarlama rızası gerekli değildir; yereldeki bu düzeltmenin canlıya yayımlandığı bu koşuda doğrulanmadı.
3. Gerçek cihaz kaydını doğruladıktan sonra yalnızca bu hesaba belirgin test mesajı göndermek; FCM kabulü, telefonda görünme ve dokununca doğru ekrana açılmayı ayrı kaydetmek. Canlı günlük kota değiştirilmemeli.

Bu koşuda uygulama/sunucu kodu değiştirilmedi veya deploy edilmedi, rıza değiştirilmedi, canlı bildirim gönderilmedi. Testler sonrasında emülatör portları kapalı, telefonda normal uygulama açık bırakıldı.

Kanıt dizini: `build/notification-phone-20261016/`. Toplu kayıt: `verification.json`; fiziksel sonuç: `account-state.xcresult`; backend günlükleri: `admin-notification-emulator.log`, `push-and-campaign-emulator.log`; canlı yetkisiz istek: `live-unauthenticated-api.json`. Ekran görüntüleri ve dar kapsamlı canlı hesap tanılama kaydı yerel, Git tarafından yok sayılan kanıt dizininde tutuldu.

Sonraki giriş dağıtımı ve 187 testlik yerel kabul: [E-posta kodu kurulumu](../ADMIN_EMAIL_CODE.md). Girişin canlıya alınması gerçek telefon teslim sınırını tek başına kapatmaz.
