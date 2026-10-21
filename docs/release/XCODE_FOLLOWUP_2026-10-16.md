# Xcode takip doğrulaması — 16 Ekim 2026

Son tekrar, **21:18–21:24, Kağan iPhone’u (iPhone 14 Pro Max / iOS 26.7.1): 175 native + 7 UI = 182 başarılı test, 0 başarısız, Mac'e özel 14 kaynak denetimi atlandı.** Xcode hedefi fiziksel telefona çevrildi; Run ile normal uygulama telefonda açıldı ve çalıştığı doğrulandı. [Son fiziksel doğrulama](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/kagan-iphone-20261016-rerun/verification.json>).

Bu tekrarda gerçek GPS, üç kamera oturumunun yeniden başlaması, ana ekran/profil gezinmesi, AR görüntüleyicisini açma/kapatma, 10 AR/Paylaş kamera döngüsü, arka plan/ön plan ve yeniden açılış, gerçek düzlem/yüzey kilidi, kamerasız GPS ölçümü ve güvenlik kontrollerine erişim geçti. Taze GPS örnekleri yaklaşık **4,24 m yatay belirsizlik**, **0,03–0,22 saniye yaş**, `simulated=false` bildirdi. UI içeriği yerel önizleme verileriydi; canlı paylaşım veya gerçek APNs/FCM teslimi iddia edilmez. Test sırasında Swift kaynakları değişmedi; yeni kod düzeltmesi gerekmedi.

Son kanıtlar: [Kağan iPhone native](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/kagan-iphone-20261016-rerun/native.xcresult>), [Kağan iPhone UI](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/kagan-iphone-20261016-rerun/ui.xcresult>).

İlk yerel/simülatör kabulü: **418 başarılı test çalıştırması, 0 başarısız, 2 fiziksel GPS atlaması.** Native paket iki simülatör ortamında tekrarlandığından bu sayı farklı test sayısı değildir. Makine kaydı: [verification.json](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/verification.json>). Kullanıcı onayından sonraki fiziksel kabul aşağıdadır.

## Düzeltilenler

1. **Xcode Run açılışında beyaz ekran:** Normal Xcode çalıştırmasında, ilk ekran çizilmeden `AppContainer → ARPinningEngine.init → ARView.init` zinciri Metal pipeline hazırlığında bekledi. Başlangıçtan yaklaşık 71 saniye sonra alınan çağrı yığını bunu gösterdi. AR görünümü artık ilk AR kullanımı sırasında oluşturuluyor ve sonraki ekranlarda aynı görünüm korunuyor. Oturum temizleme, kamera pozu sorgulama ve yaşam döngüsü olayları kullanılmamış bir AR görünümünü başlatmıyor. İki native regresyon testi eklendi; Xcode Run ile giriş ekranının açıldığı görsel olarak doğrulandı.
2. **Xcode sonrasında bozulan katalog kontrolü:** IDE, `CFBundleName` ve `CFBundleDisplayName` kayıtlarını yalnızca İngilizce ekliyordu. İki uygulama adı 12 dilin kaynak tablosuna eklendi; katalog yalnızca `build_catalog.py` ile üretildi. `--check` artık Xcode'un anahtar sırası ve boşluk değişikliklerinden etkilenmiyor; tüm anahtarlar, çeviri değerleri ve durumları yine karşılaştırılıyor. Eksik dosya, bozuk JSON, eksik çeviri, değişen değer ve çeviri durumu regresyonla sınandı. Xcode Run sonrasında kontrol yeniden geçti; derlenmiş Release paketinde 12 dilin uygulama adları ayrıca okundu.

## Sonuçlar

Xcode 26.6; simülatörler iOS 26.5. Genel paket iPhone 16 Pro'da, gerçek Firebase iOS SDK paketi ayrılmış iPhone SE simülatöründe çalıştırıldı.

| Kontrol | Başarılı | Atlanan |
|---|---:|---:|
| Native — genel ortam | 187 | 1 |
| Native — SDK ortamı | 187 | 1 |
| Genel arayüz | 23 | 0 |
| Gerçek iOS SDK + yerel Firebase uçtan uca | 15 | 0 |
| Localization betik regresyonları | 6 | 0 |

Atlanan test her iki ortamda da `testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements`; fiziksel cihaz gerektiriyor. Genel UI paketi 12 dil, Arapça RTL, erişilebilirlik, büyük yazı, Unicode sınırı, izin reddi, ekran gezinmesi ve örnek içerikle AR açma/kapatmayı içeriyor.

15 SDK senaryosu kayıt/doğrulama/giriş, kamerasız anonim konum notu, haritada otomatik görünme, konum kaybından ve metin filtresinden sonra tekrar deneme, profil, bağımsız bildirim rızası, çıkış/giriş, konum bildirimi, ön plan/arka plan/kapalı uygulama bildirimleri, yabancı alıcı engeli, rıza iptali, konum izni toparlanması ve hesap silmeyi kapsıyor. Her `.xcresult` tek başarılı ve atlanmamış test olarak ayrıca doğrulandı. SDK uygulama dosyalarının başlangıç/bitiş hash'leri eşleşti; kabul sırasında Swift kaynakları değişmedi.

- Xcode statik analiz başarılı.
- Fiziksel iPhone SDK'sıyla imzasız Release derlemesi başarılı; Crashlytics sembol yükleyicisi başarılı teslim bildirdi. Bu, imzalı arşiv veya TestFlight kabulü değildir.
- 649 uygulama + 6 InfoPlist anahtarı, 12 dil; inceleme bekleyen çeviri yok. Derleyiciden çıkarılan Debug ve Release anahtarları katalogda mevcut.
- Son `git diff --check` geçti. Önceden var olan çalışma ağacı değişiklikleri korundu.

Keşif sırasında düzeltme öncesi ürünlerle başlayan UI/SDK koşuları durduruldu; kabul toplamı yalnızca `native-final`, `ui-final`, `sdk-final` ve son betik sonuçlarından oluşur. Son uygulama adı kaynak değişikliği ayrıca Xcode Run ve Release kaynak derlemesiyle doğrulandı.

## Kullanıcı onayından sonraki fiziksel kabul

iPhone 14 Pro Max, iOS 26.7.1: **180 başarılı test, 0 başarısız test, 14 Mac kaynak denetimi atlandı.** [Fiziksel kabul kaydı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/verification.json>).

| Kontrol | Başarılı | Atlanan |
|---|---:|---:|
| Fiziksel native paket | 174 | 14 |
| Yeni fiziksel kamera regresyonu | 1 | 0 |
| Fiziksel kamera/GPS/yaşam döngüsü UI | 4 | 0 |
| Gerçek yüzey bulma ve kilitleme UI | 1 | 0 |

- Telefonun kilidi açıldıktan sonra geliştirici imajı ve native testler çalıştı. Gerçek GPS testi artık geçti: ilk ve yeniden başlatılmış ölçümlerde yaklaşık **7,76 m yatay belirsizlik**, yaklaşık **0,22 saniye yaş**, `simulated=false`. Bu değerler mutlak konum hata ölçümü değildir.
- `ArrivalRuntimeTests` içine fiziksel kamera regresyonu eklendi. Üç yeni pin oturumunda yeni kamera karesi ve kamera pozu alındı; aynı AR görünümü korundu; her durdurmada oturum `idle` durumuna döndü. Test ayrı çalıştırıldı ve atlanmadan geçti.
- Fiziksel UI: AR kamera, post görüntüleyicisini açma/kapatma, 10 AR/Paylaş döngüsü, üç arka plan/ön plan dönüşü ve yeniden açılış, kamerasız GPS ölçümü ve arka plandan sonra yeni ölçüm oturumu geçti.
- Kullanıcı telefonu dokulu yüzeye doğru hareket ettirirken gerçek düzlem adayı bulundu ve yüzey kilidi oluşturuldu; yaklaşık yerleştirme kullanılmadı.
- UI test çalıştırıcısı başlangıçta iki kez `Timed out while enabling automation mode` hatası verdi; bu koşularda uygulama senaryoları başlamadı. Test servisini yeniden başlatmak yeterli olmadı. Yalnızca geçici `com.khankartal.LociARUITests.xctrunner` uygulaması kaldırılıp Xcode tarafından temiz kurulduktan sonra dört UI testi ve ayrı yüzey testi başarılı tamamlandı. Ana uygulama kaldırılmadı.

## Canlı App Check kaydı

Kullanıcının açık onayıyla yalnızca bu Mac simülatörünün hata ayıklama anahtarı, `lociar-2f38c` projesinde **Codex Mac simulator 2026-10-16** adıyla kaydedildi. Kayıt listeden doğrulandı; canlı `exchangeDebugToken` isteği geçerli token ve **3600 saniye TTL** döndürdü. Normal Xcode Run yeniden başlatıldı; yeni oturumda önceki token değişim hatası görülmedi. [Anahtar değeri içermeyen doğrulama](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/appcheck-verification.json>).

Anahtar kayıtlı bırakıldı. Anahtar ve token yanıtları Git tarafından yok sayılan, yalnızca dosya sahibinin okuyabildiği yerel kanıt dosyalarında tutuluyor; kaynak koda veya bu rapora eklenmedi.

## Kalan kabul sınırları

15 SDK senaryosu yerel `demo-lociar` emülatöründe, fiziksel UI senaryoları yerel önizleme içerikleriyle çalıştı. Canlı post veya hesap değişikliği yapılmadı. Gerçek telefona APNs/FCM teslimi, kilitli cihazın GPS bölgesiyle uyanması, fiziksel Cloud Anchor/VPS ve iki cihazda yeniden konumlama bu koşuda doğrulanmadı. Uygulama veya sunucu kodu deploy edilmedi; onaylanan canlı değişiklik App Check test anahtarı kaydıdır.

Test uygulamaları durduruldu; test GPS enjeksiyonu ve geçici demo HTTP izni temizlendi; 11 test portu kapalı doğrulandı. Xcode projesi ve normal Run simülatörü açık bırakıldı.

Fiziksel kabul sonunda telefondaki uygulama test argümanları olmadan normal biçimde yeniden açıldı; işlemin çalıştığı ayrıca doğrulandı.

Kanıtlar: [native sonuç](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/native-final.xcresult>), [UI sonuç](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/ui-final.xcresult>), [SDK kabul listesi](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/sdk-final/accepted.json>), [açılış çağrı yığını](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/xcode-launch-sample.txt>).

Fiziksel kanıtlar: [native](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/physical-native.xcresult>), [kamera oturumları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/physical-camera-native.xcresult>), [dört UI senaryosu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/physical-ui-clean-runner.xcresult>), [yüzey kilidi](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/xcode-followup-20261016/approved-live/physical-surface.xcresult>).
