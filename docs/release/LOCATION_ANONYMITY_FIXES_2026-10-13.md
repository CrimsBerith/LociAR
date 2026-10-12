# Konum notu ve anonimlik düzeltmeleri — 13 Ekim 2026

12 Ekim denetiminin devamı: [ilk rapor](LOCATION_ANONYMITY_AUDIT_2026-10-12.md). Dal `codex/fix-anonymous-location-audit`. **Kod ve canlı servis işleri tamamlandı.** Kullanıcı fiziksel iPhone testini sonraya bıraktı. Yeni GPS/bildirim davranışı için güncellenmiş iOS yapısının telefona kurulması gerekir; mevcut telefona veya App Store/TestFlight'a bu çalışmada kurulum/yayın yapılmadı.

## Mağaza senaryosu

Bir kullanıcı, bulunduğu yerde anonim bir ürün notu bırakır. Başka bir kullanıcı bildirim izni ve konum notu tercihi açıkken notun GPS alanında 10 saniye kalırsa en çok beğenilen, bildirim için onaylanmış ve daha önce almadığı not seçilir. Yeni iOS sürümü geçerli konum örneklerinin devam etmesini ister; 5 saniyeden uzun kesinti, geçersiz ölçüm veya alan dışına çıkış teyidi baştan başlatır. Tekrar/geriye tarihli örnekler süreyi ilerletmez. Sunucu da 10 saniyeden kısa teyidi reddeder; erken istek tek seferlik alındı kaydını tüketmez.

300–400 metre uyanma alanı GPS'in notun yanına gelmeden hazırlanmasını sağlar. Bildirim yarıçapı 15–100 metre kalır. Uyanma alanı bildirimi o mesafeden göndermek için kullanılmaz. Sunucunun eski/teyitsiz ölçüm yanıtında yeni konum alınır ve 2 saniye sonra yeni denemeye izin verilir.

**10–15 saniye hedefi ilk uygun GPS ölçümünden başlar; kapıdan fiziksel girişten başlamaz.** GPS mağazanın içini kaldırımdan, komşu işletmeden veya farklı kattan kesin ayıramaz. iOS uyanması ve ağ gecikmesi bu süreyi uzatabilir; zorla kapatmadan sonra teslim garanti değildir. Kapı düzeyinde giriş için ayrıca doğrulanmış bir yakınlık sinyali gerekir. [Apple bölge izleme açıklaması](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/LocationAwarenessPG/RegionMonitoring/RegionMonitoring.html).

Bildirim onayı, rapor/engelleme kontrolü, hesap durumu, izinler ve aynı notu aynı hesaba yalnız bir kez gönderme kuralı korunur. Yeni bir notun yayınlanması tek başına bildirim onayı değildir: varsayılan otomatik onay için bir günden eski 3 farklı hesabın beğenisi gerekir; admin ayrıca onaylayabilir. Yoğun noktalardaki kilitli notlar mevcut ürün kuralına göre metinsiz sayı bildirimi verir; metin konumda açılır.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Son kaynakla native iOS testleri | 156/156, sıfır hata |
| Son kaynakla Functions birim testleri | 122/122 |
| Son kaynakla Functions tam entegrasyon | 146/146, hata/atlama yok |
| Ürün kalitesi notu dahil konum notu entegrasyonu | 14/14; erken çağrı bildirmez, 10 s teyidinde metin döner, yazar kimliği dönmez, ikinci ziyaret yeniden bildirmez |
| Repository script testleri | 46/46; sembol yükleme başarı/hata/zaman aşımı dahil |
| Önceki aynı uygulama akışında simülatör UI testleri | 20/20 |
| Değişmeyen kurallar | 82/82 |
| Değişmeyen admin birim/HTTP-tarayıcı/public testleri | 35/35, 87/87, 24/24 |
| Tam yayın öncesi kontrol | 19 adım geçti; yeni zamanlama ayrıca yukarıdaki tam paketlerle doğrulandı |
| iPhone Release arşivleri | İmzasız ve Apple Development imzalı arşiv başarılı; son yapı `build/LociAR-ShopArrival-Final-20261013.xcarchive`, `codesign --verify --deep --strict` ve otomatik Crashlytics sembol yüklemesi başarılı. APNs ortamı development; App Store/TestFlight yayını yapılmadı |
| Canlı anonim oturum açma | Firebase client SDK ile başarılı; geçici Auth hesabı Admin SDK ile silindi |
| E-posta / SMS | E-posta açık, SMS kapalı korunuyor |
| Canlı Firebase envanteri | PASS, 0 eksik; 58/58 işlev ACTIVE, tamamı Node.js 22 / us-central1; emülatör modu açık değil |
| Canlı TTL / zamanlanmış görevler | 32/32 TTL ACTIVE, 6/6 görev ENABLED; süresiz not alındı kayıtlarında TTL yok |
| Canlı Firestore indeksleri | 23/23 bileşik indeks READY |
| Admin App Hosting | Temiz yerel admin kaynağıyla bulut derlemesi SUCCESS, rollout tamamlandı; [canlı site](https://lociar-admin--lociar-2f38c.us-central1.hosted.app) |
| Canlı public masaüstü / mobil tarayıcı testleri | 24/24 geçti, 0 tekrar / atlama; güvenlik başlıkları, erişilebilirlik, klavye odağı ve 404 dahil |

Özel kanıtlar `build/firebase-readiness/deployment-20261013/` içinde; anonim giriş kanıtı `build/firebase-readiness/anonymous-signin-20261013.json`, sıfır eksikli canlı envanter `build/firebase-readiness/deploy-final-20261013.json`. Simülatör/emülatör ve metadata sonuçları gerçek GPS, App Attest ve APNs kanıtı değildir.

## Yayın sırasında düzeltilenler

- Firebase anonim giriş sağlayıcısı açıldı. Kurallar ve indeksler yayınlandı; 13 eksik TTL politikası oluşturuldu. Süresiz `place_note_notification_receipts` için TTL tanımlanmadı.
- Fonksiyonlar Node.js 22 ile `us-central1` bölgesine dağıtıldı; 58'i de aktif. Yeni tekrar teslim politikası yalnız kaynakta adı olan seçili fonksiyonlar için onaylandı; tekrar teslim testleri geçti.
- Google Cloud bölgesel CPU kotası 20 vCPU. 100 vCPU talebi kabul edilmedi ve etkin değer 20 kaldı. Tek tek dağıtım ve boş örneklerin kapanmasına izin veren tekrar deneme kullanıldı. CPU, bölge, güvenlik kuralları veya App Check azaltılmadı.
- Kota hatasının bu çalışmada oluşturduğu, hiç aktif olmamış `onReportCreated` kaydı `FAILED` durumunda ve olay tetikleyicisi olmadan kalmıştı. İlk canlı envanterde mevcut değildi. Yalnız bu bozuk kayıt kaldırılıp doğru Firestore tetikleyicisiyle yeniden oluşturuldu; rapor verileri silinmedi.
- Crashlytics dış sembol yükleyicisi dSYM üretilmeden çalışıp arşivi sınırsız bekletiyordu. [Firebase'in belirttiği DWARF dosyası girdisi](https://firebase.google.com/docs/crashlytics/ios/get-deobfuscated-reports) eklendi; Xcode artık `GenerateDSYMFile` aşamasını yüklemeden önce çalıştırıyor. Son imzalı Release arşivi ve otomatik sembol yüklemesi başarılı. Ek olarak 120 saniye sınırı ve sonlandırma koruması var; dış servis yanıt vermezse dSYM arşivde korunur ve uyarı görünür. İlk imzalı arşivin sembolleri de arşivden ayrıca başarıyla yüklendi.
- XcodeGen'in desteklediği `showEnvVars: false` ayarıyla sembol yükleme aşamasının tüm ortam değişkenlerini günlüğe dökmesi kapatıldı. Proje `xcodegen generate` ile yenilendi.
- İlk Functions paketinde çalışmaya gerekmeyen emülatör günlüğü, geçici gizli dosyalar ve yerel yönetim scriptleri de bulunuyordu. Hariç tutma kapsamı genişletildi: gizli/geçici dosyalar, günlükler, kimlik bilgisi dosyaları ve yerel yönetim scriptleri paket dışı. Son paket arşivi doğrulandı: 112 dosya, yalnız `lib/`, `package.json` ve kilit dosyası. App Hosting için yalnız admin kaynaklarının temiz kopyası hazırlandı ve yayınlandı.

## Açık doğrulama

Canlı Firebase envanteri, App Hosting dağıtımı ve canlı public tarayıcı kontrolleri tamamlandı. Kullanıcının isteğiyle sonraya bırakılan cihaz kabulü: güncellenmiş imzalı iOS yapısıyla fiziksel mağaza/GPS, kilit ekranı, normal arka plan, iOS tarafından sonlandırma, zorla kapatma, izin azaltma, ağ geçişi ve APNs. Bu aşama yeni iOS yapısının gerçek telefona kurulmasını gerektirir. Sunucu kabulünden sonra süreç/ağ kesilirse yerel bildirim kaybolabilir; kalıcı aktivite kaydı kalır. Her koşulda teslim veya 2–5 metre hassasiyet iddiası yoktur.
