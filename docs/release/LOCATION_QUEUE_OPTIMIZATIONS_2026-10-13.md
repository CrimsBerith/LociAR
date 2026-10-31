# Konum bildirimi kuyruğu optimizasyonları — 13 Ekim 2026

[Önceki adayın devamı](LOCATION_DELIVERY_OPTIMIZATIONS_2026-10-13.md). Üç değişiklik uygulandı:

1. **Bölge yenilemesi onay kuyruğunu beklemez.** `PlaceNoteAcknowledgementPump` bağımsız bir görevde, en fazla üç onay isteği işler. Başarısız kimlikler 60 saniye bekler; yeni kimlikler bu sırada ilerleyebilir. Her callable için 5 saniye zaman aşımı korunur. Hesap/izin değişimi görevi iptal eder; geç dönen eski ağ yanıtı yeni oturumun kuyruğunu değiştiremez. Bildirim kuyruğa alındıktan sonra GPS kapanışı da onayı beklemez.
2. **Eski denemeler konum takibi oluşturmaz.** Telefon ve sunucu tekrar denemeyi 24 saatle sınırlar. `retry_until` olmayan eski kayıtlar `created_at` üzerinden değerlendirilir; açık bir son tarih 24 saatlik sınırı uzatamaz. Süresi dolan denemeler sunucunun bölge listesinden çıkar; telefon bunların önbellek ve Core Location izleme kayıtlarını da temizler. Süresiz post alındısı silinmez ve TTL eklenmez: yeni bir kimlikle aynı not tekrar bildirilmez. Geç gelen gerçek kuyruk onayı kabul edilir. Notun kendisi bu nedenle yayından kaldırılmaz.
3. **Tekrar eden okumalar azaltıldı.** Önce alındılar toplu okunur; daha önce tüketilen notlar için yazar/rapor kontrollerine girilmez. Aynı yazarın profil ve hesap silme kontrolleri işlem içinde paylaşılır. Yalnız aktif yazarların iki yönlü normal/anonim engelleme kayıtları okunur. Rapor sorguları not başına `limit(1)` ile paralel yürür; ortak limit yüzünden bir notun raporu kaybolmaz. Yoğun nokta alındıları da toplu okunur. İzin sonucu istekler veya transaction tekrarları arasında önbelleğe alınmaz.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Native iOS | 161/161; bekleyen ACK, eşzamanlı planlama, sınırlı parti, cooldown, iptal/oturum değişimi ve süre sınırı dahil |
| Functions birim | 123/123; eski/bozuk/gelecek tarihli kayıtlar ve tam 24 saat sınırı dahil |
| Functions tam entegrasyon | 152/152; hata/atlama yok |
| Firestore/Storage kuralları | 82/82; kurallar değiştirilmedi |
| Hedefli script kontrolleri | 6/6; yerelleştirme ve native test çıkış kodu |
| Yerelleştirme | Katalog üretimi kontrolü geçti; 650 toplam anahtar / 12 dil; compiler'dan çıkarılan 615 anahtar katalogda |
| Secret scan / diff | Geçti |
| Release arşivi | Apple Development imzalı arşiv başarılı; codesign doğrulaması ve Crashlytics sembol yüklemesi başarılı |

Emülatörde gerçek Firestore transaction'ı gözlenerek, aynı yazara ait iki notun ortak profil/engelleme kontrollerinin **12 yerine 6 belge** okuduğu doğrulandı. Askıya alınmış yazar için yalnız iki profil/silme belgesi okunur; blok veya rapor okuması yapılmaz. Bu, ilgili kontrol grubunun sonucudur; uygulamanın toplam maliyetinde veya gerçek cihaz pilinde yüzde kazanç iddiası değildir.

Yeni isteklerde eklenen/silinen engeller, raporlar, askıya alma ve kalıcı hesap silme çiti tekrar okunarak test edildi. Süresi dolan teslimin bölgeyi serbest bıraktığı, sonradan yeni kimlikle aynı notu tüketemediği ve süresiz alındının korunduğu doğrulandı.

## Canlı ve cihaz durumu

- `recordPlaceNoteVisit` ve `readPlaceNoteRegions`: Node.js 22 / `us-central1` olarak güncellendi. Yeni function, indeks veya TTL gerekmiyor. App Check zorlaması korunur.
- Firebase metadata denetimi PASS, sıfır eksik. Admin ve genel yakındaki içerik servisi bu aşamada değiştirilmedi.
- Özel kanıtlar: `build/firebase-readiness/queue-optimization-20261013/`; canlı envanter: `build/firebase-readiness/queue-optimization-live-20261013.json`.
- Güncel arşiv: `build/LociAR-QueueOptimized-20261013.xcarchive`. Fiziksel telefona kurulum veya App Store/TestFlight yayını yapılmadı.
- Güncel davranışın telefona geçmesi için yeni iOS yapısı kurulmalıdır. Gerçek mağazaya giriş gecikmesi, iOS arka plan/zorla kapatma davranışı ve pil ölçümü, kullanıcının sonraya bıraktığı fiziksel cihaz kabulünde doğrulanacak.

10 saniye giriş teyidi, 15–100 metre not alanı, onay/rapor/engelleme kuralları ve anonimlik korunur. Onay, bildirimin yerel kuyruğa alındığını belirtir; ekranda gösterildiğini veya okunduğunu garanti etmez.
