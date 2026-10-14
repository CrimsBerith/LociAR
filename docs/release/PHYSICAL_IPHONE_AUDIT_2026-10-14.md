# Fiziksel iPhone doğrulaması — 14 Ekim 2026

Kod: `54369321ac74d1e70fdad636f4049eaa1aa931b4`. iPhone 14 Pro Max, iOS 26.7.1; Xcode 26.6.

Güncel, imzalı Release arşivi iPhone’a kuruldu ve normal başlatma argümanlarıyla açıldı. Sonraki süreç kontrolünde aynı uygulama çalışıyordu. Firebase projesi `lociar-2f38c`; emülatör adresi boş. Kurulan sürüm Apple Development imzalıdır; gerçek imzadaki APNs ortamı **development**. TestFlight/App Store dağıtımı yapılmadı.

| Kabul edilen cihaz testleri | Geçti | Hata | Atlandı |
|---|---:|---:|---:|
| Native testler, gerçek GPS testi dahil | 171 | 0 | 14 |
| Gerçek kamera, yüzey, yaşam döngüsü ve kamera kullanmadan GPS | 6 | 0 | 0 |
| Gerçek Firebase SDK, yerel `demo-lociar` servisleriyle hesap akışları | 4 | 0 | 0 |
| Açıkça seçilmeyen gerçek e-posta/production hesap senaryoları | 0 | 0 | 2 |
| **Tekrarlar sayılmadan toplam** | **181** | **0** | **16** |

14 native kontrol, depodaki kaynak dosyalarını okur; bu dosyalar fiziksel telefona gönderilmediğinden bu platformda atlanır. İki production hesap testi açık seçim ve gerçek test hesabı gerektirir. Atlanan senaryolar başarılı kabul edilmedi.

Sabit telefonda GPS’i durdurup yeniden başlatınca yeni ölçüm alınamayan bir regresyon yakalandı: ikinci oturum 45 saniyelik sınırı aşarak başarısız oldu. Ön plandaki `LocationController` için 1 metre hareket filtresi kaldırıldı ve otomatik duraklatma kapatıldı. Son cihaz turunda aynı durdur–yeniden başlat testi **2,52 saniyede**, yeni zaman damgalı ve simüle edilmemiş konumlarla geçti. Arka plan varış servisinin izinleri veya veri paylaşımı bu değişiklikle açılmadı.

Core Location’ın bildirdiği ölçüm belirsizliği denemeler arasında yaklaşık **4,4–18,5 metre** değişti. Son native ölçümler **14,6 ve 18,5 metre**, ölçüm yaşları yaklaşık **0,21 saniye** idi. Bunlar cihazın belirsizlik tahminidir; yerinde ölçülmüş bir referans koordinatla mutlak konum hatası karşılaştırılmadı. Son konum notu UI testi kamerayı açmadan ölçüm aldı ve arka plandan dönüşte yeni ölçüm oturumunu açabildi. **2–5 metre veya mağaza kapısı/kat ayrımı doğrulanmış değildir.**

Kamera açılışı, içerik görüntüleyicisini kapattıktan sonra kamera dönüşü, 10 AR/Paylaş sekme döngüsü, üç arka plan/ön plan döngüsü ve yeniden başlatma geçti. Haritadan açılan yerleştirme ve Paylaş ekranında gerçek yüzey kilidi geçti. İlk Paylaş denemesinde nişangâh mobilya kenarına yönelmişti; testin iki ekranın farklı yüzey etiketlerini tanımaması da düzeltildi. Tahmini yüzey gerçek yüzey olarak kabul edilmedi.

Hesap testleri telefondaki gerçek Firebase SDK ile kayıt, yerel doğrulama bağlantısı, giriş, profil düzenleme, çıkış/tekrar giriş ve yalnızca oluşturulan demo hesabının silinmesini doğruladı. Otomasyonda alanın ortasına dokunup silmenin eski e-posta son ekini bırakabildiği yakalandı. Native **Tümünü Seç** ile temizleme ve düz metin alanının tam değerini doğrulama eklendi; son dört hesap testi bununla geçti.

Firebase 12.19.2 LAN üzerindeki HTTP çağrılarına kimlik bilgisi eklemeyi varsayılan olarak reddeder. SDK’nin DEBUG seçeneği yalnızca açık test seçimi, `demo-lociar`, tümü sentetik Firebase kimlikleri ve özel LAN IPv4 adresiyle açılır. Canlı Firebase ayarlarını veya internet adreslerini kabul etmediğini cihazdaki güvenlik testi doğruladı. Demo Google app id, Firebase Auth’un Keychain alanını canlı app id’den ayırır. Release ikilisinde bu test seçeneği bulunmadığı ayrıca kontrol edildi.

Test araçlarında yanlış/eksik test seçicileri ve atlanan testlere başarılı sonuç verilmesi düzeltildi. Production test araçları Release/App Attest yolunu seçer; gerçek hesap senaryoları açık seçim gerektirir. Demo araçları üretim `Local.xcconfig` dosyasını değiştirmez, çalışan başka servisleri öldürmez ve Functions gerçekten yüklenmeden hesap işlemlerine başlamaz. Manuel demo başlangıcı hem dolu portta güvenli biçimde durma hem de boş portlarda başlatılıp callable’ın `401 UNAUTHENTICATED` vermesiyle kontrol edildi. Test servisleri ve e-posta doğrulama döngüsü kapatıldı; test portları boş.

Bu tur Firebase Functions, admin veya kurallarda değişiklik/deploy yapılmadı. Gerçek production kullanıcı verisiyle işlevsel bir senaryo yürütülmedi. Lokalizasyon kontrolü: 653 anahtar, 12 dil, inceleme bekleyen çeviri yok.

**Açık fiziksel kabul senaryoları:** ekran kilitliyken gerçek mağaza sınırına giriş, 10–15 saniyede not bildiriminin teslimi, işletim sisteminin uygulamayı bölge olayıyla soğuk başlatması, gerçek APNs/FCM mesaj teslimi ve Cloud Anchor/VPS ile fiziksel yeniden konumlandırma. Kamera yaşam döngüsü testi, arka planda GPS varışının kanıtı değildir. Bildirim senaryosu ayrıca kullanıcı izni, uygun/onaylı not ve fiziksel hareket gerektirir. Uygulamayı çoklu görev ekranından zorla kapatmak arka plan yeniden başlatmayı engelleyebilir; bunun için garanti verilmez. [Apple DTS açıklaması](https://developer.apple.com/forums/thread/685525).

Özel kanıtlar (Git’e eklenmez):

- `build/PhysicalPhone-20261014/verification.json`: kod/ikili/log hash’leri, cihaz ve sınırlar.
- `Physical-Final.xcresult`: son 193 native/UI senaryo; 177 geçiş, 16 koşullu atlama.
- `sdk-account/final-2/`: dört ayrı başarılı gerçek SDK cihaz sonucu.
- `LociAR-PhysicalGPS-Final.xcarchive`, `release-install.json`, `release-launch.json`: imzalı arşiv ve cihaz kurulum/başlatma kayıtları.
- Önceki başarısız denemeler saklandı; GPS regresyonu, otomasyon ayarı, Functions kaynak yolu ve metin temizleme sorunlarının son başarılı testleriyle ilişkisi korunur.
