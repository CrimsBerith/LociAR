# Derin Xcode, simülatör ve Firebase denetimi — 16 Ekim 2026

**Son kabul: 1225 başarılı test çalıştırması, 0 başarısız, 3 fiziksel GPS testi atlandı.** Tamamlanma: 16.10.2026 16:08 (Türkiye). Bir native paketin üç simülatörde çalışması bu sayıya dahildir; bu sayı farklı özellik sayısı değildir. Önceki başarısız tanı koşuları kabul toplamına dahil edilmez.

[Makineyle doğrulanan kabul kaydı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/verification.json>)

## Ortam ve kapsam

Xcode 26.6 / iOS 26.5. iPhone SE (3. nesil) ve iPhone 17 Pro Max üzerinde 185'er native test, 23'er genel UI senaryosu; ayrı iPhone 17 Pro üzerinde gerçek iOS Firebase SDK'sıyla 185 native test ve 15 uçtan uca senaryo. Her native paketteki tek atlama, gerçek Core Location akışı gerektiren `testPhysicalGPSStreamStopsAndRestartsWithNewMeasurements` testidir.

Sunucu yazmaları yalnızca yerel `demo-lociar` emülatörüne yapıldı. Admin gerçek production Next.js derlemesi, HTTP ve Chromium ile sınandı. Mevcut çalışma ağacı değişiklikleri korundu. Bu denetim canlıya dağıtım yapmadı.

Node v22.23.3, Java 21; kilitli npm/SPM bağımlılıkları. Admin birim testleri ayrıca eski yerel Node 22.17 üzerinde 35/35 geçti.

## Bu koşuda düzeltilenler

1. **Xcode sonrası dil kontrolü:** kullanıcı adı ve sayısal etiketler otomatik çevirisiz katalog kayıtları oluşturuyordu. Kullanıcı adları `Text(verbatim:)`, sayılar yerel sayı biçimlendirmesiyle gösteriliyor. Karakter sayaçları da çeviri anahtarı üretmiyor. Eksik çeviri durumunda kontrol betiği artık inceleme sayacında çökmek yerine eksik kaynağı raporluyor; regresyon testi eklendi. Kataloglar yalnızca `build_catalog.py` ile üretildi.
2. **Admin test komutu:** eski Node 22 sürümü `.ts` içe aktarımlarını varsayılan olarak yükleyemiyordu. Birim test komutu açıkça `--experimental-strip-types` kullanıyor; üretim kodu değişmedi.
3. **Kalıcı onay ve UI izolasyonu:** iki giriş testi, önceki SDK oturumundan kalan onayı yok sayıyordu. Testler gerçek onay kontrolünün seçili durumuyla başlangıcı hazırlıyor. Anonim giriş testi kabul ve geri çekmenin yeniden açılışta korunduğunu da doğruluyor. Uygulamanın kalıcı onay davranışı değiştirilmedi.
4. **Kampanya GPS fixture'ı:** sahte GPS örneği, başka hesap oluşturma/soğuk başlangıç işlemlerinden önce üretiliyordu; istek sırasında 10 saniyelik sınırı aşabiliyordu. Örnek artık gönderim anında oluşuyor. Eşzamanlı iki istek aynı payload'ı kullanıyor; eski/uygunsuz örnek reddi ve sunucu sınırları korunuyor.
5. **Asenkron konum notu izolasyonu:** 22 konum notu senaryosu `functions/test/notes/place-notes.test.mjs` dosyasına taşındı. `npm run test:notes` ayrı temiz emülatör açıyor; başlangıçta posts/yoğunluk/üyelik/spot koleksiyonlarının boşluğunu doğruluyor. CI ve release preflight bu kapıyı zorunlu çalıştırıyor. Yoğunluk kaydı 610 ms'de gözlendi; 120 × 250 ms sınırı, beklentiler ve üretim tetikleyicileri değişmedi. Otomatik başarısız test tekrarı eklenmedi.

QA matrisindeki eski metadata dosya yolu örneği de aracın kabul ettiği dosya adı biçimine düzeltildi.

## Test sonuçları

| Paket | Geçti | Atlandı |
|---|---:|---:|
| Repository script regressions | 51 | 0 |
| Functions unit tests and build | 130 | 0 |
| Admin unit tests | 35 | 0 |
| Firestore and Storage rules | 83 | 0 |
| Functions emulator acceptance | 162 | 0 |
| Location notes isolated emulator acceptance | 22 | 0 |
| Admin HTTP and authenticated browser acceptance | 102 | 0 |
| Public desktop and mobile browser acceptance | 24 | 0 |
| se native | 185 | 1 |
| se ui | 23 | 0 |
| max native | 185 | 1 |
| max ui | 23 | 0 |
| iPhone 17 Pro SDK native | 185 | 1 |
| iPhone 17 Pro real SDK workflows | 15 | 0 |

Kabul edilen paketlerde başarısız test yoktur. Yerel kapı logu, değişmeyen ve başarılı ön kapıların `acceptance-prefix.log` kaydıyla kampanya fixture düzeltmesinden sonraki tam sunucu/admin koşusunun `acceptance-final-tail.log` kaydını birleştirir. Başarısız tanı logları ayrı tutuldu. 20 yerel release kapısı tamamlandı: tip kontrolleri, production/full bağımlılık denetimleri, secret taraması, dil kontrolü, derlemeler, rules/Functions/admin/tarayıcı kabulü. Bağımlılık taramalarında bulgu yok.

- Xcode Analyze başarılı. Fiziksel iPhone SDK'sıyla imzasız Release uygulama derlemesi ve Release test derlemesi başarılı. Test derlemesinde `ENABLE_TESTABILITY=YES`; uygulama derlemesinde normal Release ayarı kullanıldı. Bu doğrulama derlemesinde Crashlytics sembol yüklemesi komut satırından kapatıldı; dSYM internet teslimi doğrulanmadı.
- Xcode'un çıkardığı metin anahtarları Debug, Release ve analiz çıktılarında katalogla eşleşti. Kataloglar 649 uygulama + 4 InfoPlist anahtarı, 12 dil; dil incelemesi bekleyen kayıt yok. Xcode sonrası katalog üretim kontrolü de geçti.
- SE ve Pro Max'te 12 dilde form ve bildirim ayarları: 48 kayıtlı ekran görüntüsü. Arapça RTL, uzun başlıklar, Unicode sınırları, izin reddi/toparlanma, erişilebilirlik ve büyük yazı kontrolleri genel UI paketinde.
- Gerçek SDK akışı: kayıt/doğrulama/giriş; kamerasız anonim GPS notu ve elle yenilemeden haritada açılması; eksik konum ve metin filtresinden sonra tekrar deneme; profil; bağımsız bildirim rızası; çıkış/giriş; konum girişi; arka plan/kapalı uygulama/ön plan admin bildirimi; yabancı alıcının engellenmesi; rıza kapatma; konum izni reddi/toparlanma; hesap silme. Silmede Auth, notlar, tokenlar, aktivite ve yoğunluk üyeliği doğrulandı.
- SDK testlerinde ayrı, değişmeyen ürün kopyası kullanıldı. Binary/Info.plist hash'leri başlangıç ve bitişte eşleşti; 15 `.xcresult` ayrı ayrı tek başarılı ve atlanmamış test olarak doğrulandı.
- 436 kaynak/derleme girdisinin hash'i kabul sonunda aynıydı.

11 test portu boş; bu koşuda uygulamaya ait yeni çökme kaydı yok. Test simülatörleri başlangıçtaki açık/kapalı durumlarına döndürüldü.

## Canlı, salt okunur kontroller

- Firebase altyapı metadata kapısı: **hazır, 0 bulgu**. Fonksiyonlar, API'ler, TTL'ler, zamanlayıcılar, Storage metadata ve secret sürümlerinin durumu doğrulandı; secret değerleri okunmadı.
- Firestore bileşik indeksleri ayrıca denetlendi: **26 beklenen / 26 mevcut / 26 READY**, tanımla eşleşiyor.
- Uygulamadaki gizlilik, koşullar ve destek HTTPS adresleri: **3/3 HTTP 200**.

Altyapı metadata başarısı, dağıtılmış kaynak/rules sürümünün yerel düzeltmelerle aynı olduğunu veya canlı kullanıcı işlemlerinin geçtiğini göstermez.

## Kanıtlar

- [Yerel kapıların kabul logu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/acceptance.log>)
- [Xcode Analyze](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/xcode-analyze-final.log>) / [Release uygulama](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/release-app.log>) / [Release test derlemesi](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/release-test-final.log>)
- [SE UI sonuçları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/se-accepted-ui.xcresult>) / [Pro Max UI sonuçları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/max-accepted-ui.xcresult>)
- [Kamerasız yayın onayı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/sdk-note-screens/2BC45F91-7794-4E6C-8335-9DB643BA74E3.png>) / [Haritada görünen not](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/sdk-note-screens/C5DDF3A9-96EC-42C3-849E-DF3107DE75DC.png>)
- [SDK senaryoları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/sdk/accepted.json>) / [SDK çalışma logu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/sdk-runner.log>)
- [SE form görüntüleri](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/se-screens/SE-composer-sheet.png>) / [SE ayarlar](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/se-screens/SE-settings-sheet.png>)
- [Pro Max form görüntüleri](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/max-screens/Max-composer-sheet.png>) / [Pro Max ayarlar](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/max-screens/Max-settings-sheet.png>)
- [Canlı Firebase metadata](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/firebase-readiness/deep-audit-20261016.json>) / [İndeks karşılaştırması](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/live-index-verification.json>) / [Canlı adresler](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/live-urls.log>)
- [Temizlik kaydı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261016/cleanup.json>)

## Kabul sınırları

Bu koşuda iOS 26.5 kullanıldı. Fiziksel iPhone GPS/AR düzlemi/Cloud Anchor/VPS, iki fiziksel cihazda yeniden konumlama, pil/ısı, gerçek APNs/FCM teslimi, kilitli cihazın bölge olayıyla uyanması, elle VoiceOver gezinmesi, gerçek TOTP/App Check ve imzalı TestFlight kabulü doğrulanmadı. Simülatör bildirimi `simctl push` taşıyıcısını kullanır; gerçek APNs/FCM kanıtı değildir. Bildirime dokunarak kapalı uygulamayı açmak, uygulama kapalıyken GPS bölgesiyle işletim sistemi uyanmasını kanıtlamaz.

Taranan yerel kapsamda açık hata kalmadı; tüm projede sıfır hata garantisi verilmez.
