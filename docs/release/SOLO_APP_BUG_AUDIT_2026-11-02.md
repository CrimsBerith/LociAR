# LociDrop — tek ajanla uygulama hata taraması

Oturum başlangıcı: 2 Kasım 2026. Son kontrol: 3 Kasım 2026 (Europe/Istanbul). Kanıt klasörleri oturum başlangıcının tarihini korur.

**Kapsam kapanışı — 3 Kasım 2026:** Kullanıcı açıkça “Şimdilik yalnız simülatör ve sunucu kontrolüyle bitir” dedi. Bu kapsam tamamlandı. Son iPhone kurulumu, normal hesapla davet ekranı kabulü ve fiziksel kamera doğrulaması kullanıcı isteğiyle ertelendi; aşağıdaki bağlantı bekleme kaydı önceki girişimin tarihçesidir. Siyah kamera sorunu çözülmüş sayılmıyor.

Kullanıcının “multi ve alt ajanlar olmadan” talebinden sonraki inceleme, düzeltme ve doğrulamayı ana ajan tek başına yürüttü. Önceki ajan çalışmalarından kalan değişiklikler güncel kaynak ve yeni test koşularıyla yeniden kontrol edildi. İlgisiz çalışma ağacı değişiklikleri korundu.

## Doğrulanan bulgular

| Öncelik | Bulgu ve kanıt | Sonuç |
| --- | --- | --- |
| P1 | Kamera görünümünün öndeki ekran yerine altta kalan host'a taşınması. Güncel kodda iki mevcut sahiplik testi ayrı koşuda başarısız oldu (`host-regression-before`). | `ARPinningEngine.activateARViewHost` sıradan SwiftUI güncellemesinde host önceliğini değiştirmiyor. Son native koşuda iki test de geçti; pencereye henüz bağlanmamış host'lar arasındaki mevcut yeniden kullanım davranışı da korundu. |
| P1 | Eski oturumun yüzey arama tekrarının yeni oturumu eski zaman aşımı bütçesiyle `.failed` durumuna düşürmesi. Yeni regresyon testi düzeltmeden önce `failed != scanning` ile başarısız oldu (`raycast-regression-before`). | Gecikmiş tekrarlar ve raycast callback'leri başladıkları oturumun generation değeriyle sınırlandı. Aynı test son koşuda geçti. |
| P2 | Gecikmiş GPS/heading sonucu koşulsuz olarak `currentAnchor` üzerine yazılıyordu. Bekleme sırasında pin veya kamera sahibi değişirse eski ölçüm yeni pine aktarılabiliyordu. | Tamamlama hem hedef pin kimliğini hem kamera sahibini kontrol ediyor. Yeni test eski pin/eski sahip sonuçlarını reddediyor, güncel pin/sahip sonucunu kabul ediyor. Telefonda yanlış konumla yayınlama yapılmadı; bu kaynak ve regresyon testiyle doğrulanan bir yarış. |
| P2 | AR keşif modunda Google AR bildirim düğmesi yoktu; yalnız yerleştirme panelinde bulunuyordu. | ARCore etkin keşif moduna da mevcut erişilebilir bildirim düğmesi eklendi. Tanılama sürümünün fiziksel keşif ekranında görünür olduğu kontrol edildi. |
| P2 | Canlı `createinvites` ve `redeeminvite` servislerinde invoker izni eksikti. İstekler callable kimlik kontrolüne ulaşmadan platform katmanında reddediliyordu. | Kullanıcının açık onayıyla yalnız bu iki servise `allUsers → roles/run.invoker` eklendi. Tam dağıtılmış kaynak arşivlerindeki Auth/App Check korumaları incelendi. Onarım sonrası iki servis de kimlik/App Check taşımayan isteği JSON `401 UNAUTHENTICATED` ile reddediyor. Normal hesapla telefon kabulü bağlantı bekliyor. Ayrıntı: [izin onarım kaydı](INVITE_IAM_REPAIR_REVIEW_2026-11-02.md). |

Değişen başlıca kaynaklar: `LociAR/ARCore/ARPinningEngine.swift`, `LociAR/ARCore/ARViewContainer.swift`, `LociAR/Features/AR/ARExperienceView.swift`, `LociARTests/PinStateMachineTests.swift`. DEBUG kamera ölçüm metinleri ürün çeviri anahtarlarına alınmıyor; extractor için dar istisna ve regresyon testi eklendi. Gerçek kullanıcı metinleri çıkartılmaya devam ediyor.

## Siyah kamera: çözülmüş sayılmayan cihaz sorunu

Kullanıcı ortamın aydınlık olduğunu doğruladı. Fiziksel tanılamada ARView ve host **430×932 pt**, pencereye bağlı, gizlenmemiş ve aynı öndeki host üzerinde. 16×16 örnekten ortalama sensör luma değeri **16** (siyah seviyesi). Görüntü kaydedilmeden yalnız bu sayısal örnek hesaplanıyor. Bu koşulda sıfır boyutlu/gizli ARView açıklaması desteklenmiyor.

Bağımsız karşılaştırmalar:

1. Apple Kamera önizlemesi de siyah; kullanıcı bunu telefonun kendi ekranında doğruladı.
2. LociDrop süreci tamamen sonlandırıldı, Apple Kamera yeniden açıldı; siyah önizleme devam etti.
3. Kullanıcı telefonu yeniden başlattıktan sonra da Apple Kamera'nın siyah kaldığını bildirdi.

Bu kanıtlar sorunun cihaz/iOS kamera katmanında da bulunduğunu gösterir; kesin donanım arızası tanısı değildir. Gerçek cihazdaki iki önceki native test kamera karesi taşınmasını ve GPS yeniden başlatılmasını geçti; bu, kullanılabilir kamera görüntüsü veya yüzey algılama kabulü sayılmaz. AR yüzey, Cloud Anchor ve canlı yeniden konumlama kabulü açık kalır.

Bir sonraki cihaz tanısı ön/arka kameraları karşılaştırmak ve Apple'ın siyah kamera için önerdiği iOS Diagnostics kontrolüdür. [Apple'ın resmi kamera sorun giderme yönergesi](https://support.apple.com/en-gb/102514). Bu audit sırasında sistem ayarları sıfırlanmadı, iOS güncellenmedi veya servis işlemi başlatılmadı.

## Testler ve pratik sınırlar

| Kontrol | Sonuç / kanıt |
| --- | --- |
| Son native simülatör koşusu | **291 çalıştırıldı: 289 geçti, 2 donanım testi atlandı, 0 hata** — `solo-native-final.xcresult` |
| UI görünüm, ana sekmeler, AR viewer, izin dönüşleri | **7 geçti** — `solo-simulator-r1.xcresult`; aynı birleşik koşudaki eski unattached-host testi uyumsuzluğu son native koşuda düzeltildi |
| Genişletilmiş UI | **10 geçti** — `solo-expanded-ui.xcresult`: profil listeleri, ayarlar, not/güvenlik, editör/GIF, konum notu/yüzey, İngilizce, Arapça/RTL, anonim varsayılanı ve kullanıcı adı seçimi, üyelik, otomatik erişilebilirlik audit'i |
| Önceki fiziksel native koşu | **2 geçti** — `physical-runtime-r1.xcresult`: kamera üç stop/start döngüsünde kare üretti; GPS yeni ölçümle yeniden başladı. Son kaynak değişikliklerinden önceki koşudur. |
| Son imzalı fiziksel iOS derlemesi | `device-solo-final-r2-build.log`: **BUILD SUCCEEDED** |
| Katalog tutarlılığı | 727 kaynak anahtarı × 12 dil, güncel |
| Release yerelleştirme | 733 toplam katalog anahtarı, 12 dil, 0 needs-review |
| Extractor regresyonları | 3 geçti |
| Yama biçimi | `git diff --check` geçti |

UI testleri açıkça seçilmiş, canlı veri kullanmayan fixture'lardır. Tüm 96 UI/emülatör/üretim testi çalıştırılmış değildir. Genel cihaz, bütün erişilebilirlik boyutları, canlı bildirim/ödeme veya mağaza kabulü iddiası yoktur.

Keşfet'in telefondaki ilk isteği hata verdi, elle tekrar denemede gerçek içerik yüklendi. Kalıcı boş liste değildir. O ilk isteğin kesin nedeni bu incelemede belirlenmedi; kanıtsız otomatik tekrar veya kimlik/App Check bypass'ı eklenmedi.

## Telefon kurulumu ve canlı değişiklikler

Tanılama ve sahiplik düzeltmesi içeren ara sürüm telefon verileri silinmeden kuruldu. Son iki ek AR yarış düzeltmesini içeren imzalı sürümün kurulumu, yeniden başlatma sonrasında telefon Device Hub'da **Currently Unavailable** olduğu için CoreDevice **4016** ile tamamlanamadı. Son sürümün kurulumu ve onarılmış davet ekranının normal hesapla kontrolü için USB/kilit açık bağlantısı bekleniyor.

Yapılan tek canlı yapılandırma değişikliği, kullanıcı onaylı iki davet servisinin invoker binding'idir. Firebase kod deploy'u, hesap değişikliği, gerçek kod kullanımı, not yayını, commit veya push yapılmadı. Önceki/sonraki IAM politikaları ve yetkisiz istek sonuçları `build/device-fixes-20261102/` altında kayıtlı.

Ek kanıtlar: `solo-audit-evidence.json`, `phone-solo-02-black-diagnostic.png`, `phone-solo-04-camera-without-lociar.png`, `invite-platform-evidence.json`, `deployed-invite-guards.json`, `invite-guards-after-repair.json`.
