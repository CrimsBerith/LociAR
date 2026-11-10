# Simülatör — kamerasız konum notu ve bildirim kabulü

15 Ekim 2026. Dal: `codex/fix-anonymous-location-audit`; başlangıç commit'i `0d00be52df0ebb76f5150d3e09f1dbe89bc844bb`. Çalışma ağacındaki değişiklikler korunmuştur. Xcode 26.6 (17F113), iOS 26.5, ayrı iPhone 17 Pro simülatörü: `LociAR Notes Complete 20261015`.

Sonraki kaynak değişiklikleri ve ek hata senaryoları [derin denetim raporunda](DEEP_SIMULATOR_AUDIT_2026-10-15.md) kayıtlıdır. Aşağıdaki 818 kabul, ilk denetimin kanıtlarıdır.

Uygulamanın gerçek Firebase iOS SDK'sı ve gerçek callable/Firestore kodu, geçici `demo-lociar` servisleriyle çalıştırıldı. Hesaplar, konumlar, notlar ve yönetici kimliği sentetiktir. Konum notunun bildirimi uygulamanın kendi Core Location → callable → yerel bildirim yolundan üretildi. Admin tesliminde üretim fonksiyonu `deliverAdminNotification`, açıkça enjekte edilen `simctl push` göndericisiyle çalıştı; emülatörde dış FCM çağrılarını durduran güvenlik koşulu korundu.

| Düzeltilen sorun | Son davranış |
|---|---|
| Arka plandaki uygulamayı admin bildiriminden açınca çökme | Async Objective-C bildirim köprüsü UIKit tamamlama çağrısını worker thread'de çalıştırıyordu. İki bildirim delegate metodu completion-handler biçimine çevrildi; alıcı kontrolü, yönlendirme ve tamamlama `MainActor` üzerinde kalır. Çökme stack'i UIKit state restoration ve `NotificationService.didReceive` yolunu gösterir. Düzeltmeden sonra gerçek simülatör banner'ına dokunma, Aktivite ekranı ve okundu kaydı geçti. |
| Başarılı konum notu yayınından sonra boş kalan harita | Not penceresi kapanınca seçim/grup filtresi temizlenir ve yakın notlar yeniden yüklenir. Elle Yenile gerektirmeyen yayın → harita → not ekranı testi geçti. |
| Konum izni kapalıyken aynı anda yaklaşık konum uyarısı | İzin reddinde yalnızca izin hatası gösterilir. İzni kapatma ve geri açma akışı geçti. |
| Harita not satırının küçük dokunma alanı | Satır en az 44 punto ve açık button erişilebilirlik niteliği taşır. Son native/UI kabulünde boyut ve açılış kontrol edilir. |

Test araçlarında da üç sorun giderildi: sentetik emülatör anahtarının secret taramasına takılan yazımı, gerçek UTC dakika sınırını aşabilen şikâyet kotası testi ve simülatör metin alanını eksik temizleyebilen otomasyon. Kota testi tek dakika penceresini ve sunucudaki kesin `count: 5` değerini doğrular. Secret taramasına istisna eklenmedi.

| Kontrol | Kabul |
|---|---:|
| Repo script regresyonları | 49/49 |
| Functions unit | 130/130 |
| Firestore + Storage rules | 83/83 |
| Functions tam emülatör | 182/182 |
| Admin unit | 35/35 |
| Admin HTTP + oturumlu entegrasyon | 98/98 |
| Masaüstü/mobil Chromium | 24/24 |
| Genel iOS simülatör UI paketi | 21/21 |
| Native testler, son kaynak | 184 geçti; 1 fiziksel GPS testi atlandı |
| 12 dilde not formu ve bildirim ayarları UI | 1/1; 12 dil, 24 ekran görüntüsü |
| Gerçek SDK + emülatör UI, tekrarsız senaryolar | 11/11; kanıt eşlemesi doğrulama dosyasında |

**Tekrarlar sayılmadan 818 test geçti; 1 fiziksel GPS testi simülatörde atlandı.** Son native/UI paketi 187 test içerir: 186 geçti, 1 atlandı. Bu pakette yeniden çalıştırılan harita testi genel 21 test içinde zaten sayılmıştır. Önceki başarısız denemeler kabul toplamına eklenmedi. Çökme düzeltmesinden sonra değişiklikten etkilenen yedi gerçek SDK/bildirim/hesap senaryosu yeniden koşuldu; kalan dört senaryonun başarılı kayıtları aynı kanıt dizininde tutulur.

Kabul edilen uçtan uca senaryolar: kayıt/doğrulama/giriş; boş ve 221 karakterlik notu engelleme; kamerasız anonim yayın ve haritada açma; güncel konum yokken yayın yapmama ve ölçüm dönünce yeniden deneme; profil düzenleme; bildirim rızasının yeniden açılışta korunması; çıkış/tekrar giriş; konum notu bildirimi ve doğru Post ekranına geçiş; kampanya izni kapalıyken admin bildirimi ve Aktivite ekranına geçiş; genel bildirim rızası kapalıyken yeni admin kuyruğunu reddetme; konum izni reddi/geri açma; sentetik hesabı uygulamadan hard delete.

Bildirim rızası açıkken kampanya, teknik veri ve yönetici konum paylaşımı kapalı tutuldu. Konum notunda tek teslim, `queued` onayı; admin bildiriminde tek kabul ve `read_at` doğrulandı. Bildirim ekranları yalnız metin aramasıyla değil, doğru navigation bar ile de kontrol edildi. Çökme düzeltmesinden sonra ilgili yedi SDK/bildirim/hesap senaryosu yeniden çalıştırıldı ve tamamı geçti.

Özel kanıtlar `build/simulator-complete-20261015/` içindedir:

- `preflight-final.log` + `preflight-remaining.log`: ilk kontroller ve dakika penceresi düzeltmesinden sonraki kalan kontrol zinciri.
- `generic-ui.xcresult`: 21 genel arayüz testi.
- `e2e-final/`: kamerasız yayın, konum kaybı/geri dönüşü, tekrar giriş ve izin kabulü; bu koşudaki profil otomasyonu ve bildirim çökmesi başarısızlıkları da korunur.
- `e2e-notification-fixed/`: çökme ve metin temizleme düzeltmesinden sonra yedi başarılı senaryo; her biri ayrı `.xcresult` ve log içerir.
- `final-native-ui.xcresult`: son kaynakla native, harita dokunma alanı ve 12 dil kontrolü.
- `notification-background-crash.ips`, başarısız koşular ve ekran kayıtları: hata kanıtları; başarı toplamına eklenmez.
- `verification.json`: kabul edilen testlerin eşlemesi, kaynak/log hash'leri ve kapsam sınırları.

Simülatör konumu yaklaşık ±0,11 m kontrollü hareketle beslenir; bu, yinelenen sabit koordinatların birleştirilmesi yüzünden ölçümlerin eskimesini önler. Fiziksel GPS doğruluğu veya mağaza kapısı ölçümü değildir. UI kabulü ve yerel bildirim teslimi, gerçek APNs/FCM ağı, kilitli fiziksel cihaz, OS bölge olayıyla soğuk başlatma, batarya/ısı veya Cloud Anchor/VPS kabulü sayılmaz. Bu çalışmada deploy, GitHub push veya App Store dağıtımı yapılmadı.

Tekrar koşusu için Node 22 ve Java 21 PATH'te olmalı; `functions/` ve `admin/` bağımlılıkları kurulmuş olmalıdır. Kilitli SPM paketlerini hazırlayın:

```sh
xcodebuild -resolvePackageDependencies -project LociAR.xcodeproj -scheme LociAR \
  -clonedSourcePackagesDirPath build/ci-ios/SourcePackages -onlyUsePackageVersionsFromResolvedFile
simulator_id=$(xcrun simctl create "LociAR Notes QA" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5)
LOCIAR_TEST_SIMULATOR="$simulator_id" node scripts/run-simulator-notes.mjs
```

Betik yalnız `LociAR Notes` adlı test simülatörünü kabul eder ve onun test Keychain'ini sıfırlar. Dolu emülatör portunda durur; başka süreçleri kapatmaz. Yerel üretim ayar dosyası değiştirilmez. Önceki loglar ezilmesin diye yeni koşuda farklı `LOCIAR_TEST_OUTPUT` dizini seçilmelidir.
