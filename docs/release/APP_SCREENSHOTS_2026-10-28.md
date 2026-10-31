# LociAR ekran turu — 28 Ekim 2026

Güncel Debug uygulaması iPhone 17 Pro / iOS 26.5 simülatörü için derlendi. 54 ekran/durum görüntüsü,
10 başlıklı görsel ve tam boyutlu HTML galeri hazırlandı. Her PNG, başarılı bir XCTest senaryosunun
ekinden çıkarıldı; sonuç paketleri `xcresulttool` ile ayrıca doğrulandı.

## Doğrulama

| Kapsam | Sonuç | Kanıt |
|---|---|---|
| Normal yapılandırma native testleri | 272 geçti, 2 fiziksel cihaz testi atlandı | `build/screens-20261028/screens.xcresult` |
| Genel ekran turu ve ödeme fixture kontrolü | 13 farklı UI testi geçti; 12 ekran turu + 1 ödeme testi | `screens.xcresult`, `followup.xcresult`, `clean-captures.xcresult` |
| Demo Firebase yapılandırması native testleri | 272 geçti, aynı 2 fiziksel cihaz testi atlandı | `sdk/native-tests.xcresult` |
| Gerçek iOS SDK + yerel Firebase akışları | 4/4 geçti | `sdk/accepted.json` ve ayrı sonuç paketleri |
| Görüntü envanteri | 54 PNG, her biri 1206 × 2622; tümü başarılı testlerden | `screenshots.json`, `verification.json` |
| Uygulama bütünlüğü | Genel turdaki üç ürün kopyasının uygulama hash'i eşit; SDK turunda başlangıç/son hash'leri eşit | `verification.json`, `sdk/app-artifact-*.json` |

Kanıt kökü: `build/screens-20261028/`. Native testlerin iki yapılandırmadaki tekrarları veya UI tekrarları
benzersiz test sayısına eklenmedi. Son geçerli sonuçlar test kimliğine göre birleştirildi.

İlk turdaki iki başarısızlık test beklentileriydi: örnek oturum hesap silmeyi bilerek kapatıyor;
iOS bazı `confirmationDialog` pencerelerinde iptal satırı yerine dışarı dokunmayı kullanıyor.
Beklentiler düzeltildi ve ilgili testler geçti. Hesap silme ekranları ayrıca gerçek SDK ile,
yalnız yerel emülatörün tek kullanımlık test hesabından alındı. İlk sonuç paketleri korundu.

## Görüntü kapsamı

İlk açılışın üç adımı; giriş, kayıt ve şifre kurtarma; beş ana sekme; profil ve hesap işlemleri;
postlar, aktivite, koleksiyon oluşturma/ayrıntısı, kaydedilenler, engellenenler ve davet;
profil düzenleme/avatarlar; bildirim, veri paylaşımı, çeviri ve tanılama ayarları;
post ayrıntısı, şikâyet nedenleri, koleksiyona ekleme, diğer profil ve engelleme onayı;
AR düzenleyici, GIPHY seçici, konum notu taslağı, yüzey seçimi ve AR görüntüleyici;
kamera/konum izni hataları ve konuk hesap kapıları; Debug ARCore kapsam ekranı;
hesap silme onayı ve parola doğrulaması; kamerasız not yayını ve haritada görünmesi;
ısı haritası, 25 m not grubu, uzaktan kilit, yerinde okuma ve uzaklaşınca tekrar kilit.

“Yazara destek ol” ve Profil → “Kazançlarım” genel UI turunda görünmüyor. Ödeme arayüzü,
yalnız `UITEST_AUTHENTICATED` + `UITEST_SUPPORT_UI` ile açılan taklit sağlayıcı testinde erişilebilir.
Genel fixture oturumları bu istisnayı artık açmıyor. Konuk ekranları `UITEST_GUEST_ACCOUNT` kullanıyor.

## Sınırlar

- Genel tur örnek hesap/içerik ve etkisiz servisler kullanıyor. Ek SDK turu yalnız `demo-lociar` yerel
  emülatörlerine not yazdı ve tek kullanımlık test hesabını sildi; canlı kullanıcı içeriği değiştirilmedi.
- Fiziksel kamera takibi, Cloud Anchors/VPS, gerçek ödeme, APNs teslimi veya mağaza dağıtımı doğrulanmadı.
- Kamerayla konum hassaslaştırma simülatörde desteklenmiyor. Google AR bildirimi, ARCore servisi etkisiz
  olduğu için fixture/emülatör turunda açılmıyor. Apple'ın sistem giriş pencereleri ve dış yasal/destek
  siteleri yakalanan uygulama rotalarına dahil değil.

Galeri: `build/screens-20261028/index.html`. Arşiv: `build/screens-20261028/LociAR-ekranlar-2026-10-28.zip`.
Yeniden üretilebilir tur: `LociARUITests/AuthGateUITests.swift` içindeki `testScreenTour*` metotları.
