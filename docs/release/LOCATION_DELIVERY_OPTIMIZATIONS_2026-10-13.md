# Konum bildirimi ve sorgu iyileştirmeleri — 13 Ekim 2026

**Sonraki aday:** [onay kuyruğu, süre sınırı ve toplu okuma optimizasyonları](LOCATION_QUEUE_OPTIMIZATIONS_2026-10-13.md). Aşağıdaki sayılar bu ilk iyileştirme adayının kanıtıdır.

[Önceki adayın devamı](LOCATION_ANONYMITY_FIXES_2026-10-13.md). Bu çalışma kod düzeltmeleri, yerel doğrulama ve canlı Firebase/App Hosting dağıtımını kapsar. Fiziksel iPhone kabulü kullanıcının önceki kararıyla sonraya bırakıldı.

## Düzeltilenler

- **Admin hız sınırı:** `/api/admin/v1/place-notes` artık hız sınırının döndürdüğü 429 yanıtını hemen döndürür. Gerçek HTTP testi, hedef post ve audit kaydının değişmediğini doğrular. MFA, RBAC ve origin kontrolleri korunur.
- **Kesilen bildirim yanıtı:** iOS, istekten önce hesaba bağlı rastgele teslim kimliğini saklar. Aynı kimlikle tekrar denemede başka not tüketilmez. Bildirim kuyruğa alınmadan GPS penceresi sonlandırılmaz. Kuyruğa alma başarılı olunca cihaz onay yollar; onay kaybolursa sonraki senkronizasyonda yeniden denenir. Yerel bekleyen/gösterilen bildirim kimlikleri tekrar kuyruğa almayı önler. Bu kayıtlar 24 saat tutulur; metin ve GPS ölçümü içermez ve çıkış/tercih kapatmada temizlenir.
- **Tekrar denemenin güvenliği:** sunucu her denemede güncel konum, onay, rıza, moderasyon, engelleme, raporlar ve yazar hesabını yeniden kontrol eder. Yoğun noktalar metinsiz kalır. Aynı hesapta farklı cihazların yarışması aynı not için ikinci bir teslim kaydı oluşturmaz. Eski istemciler için teslim kimliği olmadan mevcut davranış korunur.
- **Yakındaki içerik sorgusu:** doğrulanmış geohash aralıklarıyla adaylar daraltılır; kesin mesafe, hesap durumu, engelleme, anonimlik ve yoğun nokta kontrolleri korunur. Kutuplar/geniş alanlar ve henüz taşınmamış veri için eksiksiz, sınırlı enlem sorgusu korunur. Eski koordinatlar işlem içinde yeniden okunarak backfill yapılır; ikinci tam denetim geçmeden indeks yolu açılmaz. Canlı denetimde mevcut `posts` koleksiyonu boştu; doğrulama tamamlandı ve yol etkinleştirildi.
- **GPS ve izin durumu:** konum özellikleri kapalıyken foreground GPS'in gereksiz başlatılması kaldırıldı. Hassas pencere dışında düşük güç ayarı kullanılır. Bildirim izni yoksa ziyaret alındısı tüketilmez. Ayarlar ekranında konum bildirimleri için izinlerin hazır olup olmadığı gösterilir; iki yeni metin 12 dile çevrildi.
- **Ölçüm:** sunucuda `nearby_query` ve `place_note_visit`; cihazda `place-note-delivery` kategorisine süre/sonuç kayıtları eklendi. Kimlik, not metni veya GPS koordinatı eklenmez. Üretim hızlanması ve pil kazancı yüzdesi henüz ölçülmedi; minimum instance ayarları artırılmadı.
- **Derleme:** ayrı `-clonedSourcePackagesDirPath` ile arşiv oluştururken sembol yükleyici yolu `LOCIAR_SOURCE_PACKAGES_DIR` ile belirtilebilir. Başarı/hata/zaman aşımı ve ayrı paket klasörü testleri geçti. Son Release arşivinde otomatik Crashlytics sembol yüklemesi başarılı.
- **Dokümantasyon:** ana mimaride eski “yalnız metin”, cihazda push yerelleştirme ve istemci yazmaları açıklamaları güncellendi. Konum notu rehberine teslim kurtarma ve kuyruk/gösterim ayrımı eklendi.

## Doğrulama

| Kontrol | Güncel sonuç |
|---|---|
| Native iOS | 157/157, sıfır hata |
| Functions birim | 122/122 |
| Functions tam entegrasyon | 150/150, hata/atlama yok |
| Admin birim | 35/35 |
| Admin HTTP ve tarayıcı entegrasyonu | 88/88; yeni 429 testi dahil |
| Firestore/Storage kuralları | 82/82; kurallar değiştirilmedi |
| Repository scriptleri | 49/49 |
| Yerelleştirme | 650 toplam anahtar, 12 dil, inceleme bekleyen çeviri yok; compiler'dan çıkarılan 615 anahtar katalogda |
| Üretim bağımlılık denetimi | Functions ve admin: sıfır güvenlik açığı |
| Secret scan / diff | Geçti |
| Canlı public masaüstü ve mobil tarayıcı | 24/24; tekrar ve atlama yok |
| İmzalı Release arşivi | Başarılı; `codesign --verify --deep --strict` geçti, Crashlytics sembolleri yüklendi |

İlk sunucu koşusunda izin kapalı test hesabı beklenen başka-hesap hata kontrolüne ulaşmıyordu; test hesabı açık izinle tekrar doğrulandı ve tam paket 150/150 geçti. Bir admin HTTP denemesi kapanmış emülatöre bağlandı; doğru emülatör yaşam döngüsüyle tam admin paketi 88/88 geçti. Bu geçersiz ilk koşular kabul kanıtı sayılmadı.

## Canlı durum

- `recordPlaceNoteVisit`, `readPlaceNoteRegions`, `readPublicContent`: seçili dağıtımlar başarıyla tamamlandı, Node.js 22 / `us-central1` korunuyor.
- Admin, yerel kaynakla Firebase App Hosting'e dağıtıldı; rollout tamamlandı: <https://lociar-admin--lociar-2f38c.us-central1.hosted.app>.
- `system/geo_queries.geohash_index_version = 1`: canlı audit/backfill ve ikinci doğrulama geçti. Gerektiğinde bu sunucu ayarını 0 yapmak enlem sorgusuna geri döndürür.
- Canlı Firebase metadata denetimi: PASS, sıfır eksik. Gizli değerler okunmadı.
- Eski dünya haritası denetimi: `posts` ve `post-world-maps/` taramaları tamamlandı; post/nesne ve kaldırılması gereken indirme tokenı bulunmadı. Başka dosya klasörleri hakkında genel bir silinme iddiası değildir.
- Özel kanıtlar `build/firebase-readiness/optimization-20261013/` ve `build/firebase-readiness/optimization-live-20261013.json` altında tutulur.
- Son iOS arşivi: `build/LociAR-Optimized-20261013.xcarchive`. Apple Development imzalıdır; App Store/TestFlight yayını veya fiziksel telefona kurulum yapılmadı.

## Sınırlar

Telefonun bildirimi kuyruğa alması, iOS'un ekranda göstermesi veya kullanıcının okuması anlamına gelmez. Teslim kimliği/yerel journal kurtarma penceresi ve güncel erişim kontrolleri, her koşulda tam bir kez gösterim garantisi sağlamaz. Eski kurulmuş iOS sürümleri yeni istemci davranışını kazanmak için güncellenmelidir.

10 saniye giriş teyidi ve 15–100 metre not yarıçapı korunur. GPS fiziksel mağaza kapısını, komşu işletmeyi veya katı kesin ayıramaz; 2–5 metre ve kapıdan girişin ardından her koşulda 10–15 saniye teslim garantisi verilmez. Fiziksel iPhone'da kilit ekranı, normal arka plan, iOS sonlandırması, zorla kapatma, çevrimdışı giriş, ağ geçişi, izin değişimi, gerçek konum sapması ve pil tüketimi ölçülecek. Sosyal/admin FCM gönderimleri ayrı, en iyi çaba akışıdır; burada yapılan düzeltme konum notlarının yerel teslim zincirini kapsar.
