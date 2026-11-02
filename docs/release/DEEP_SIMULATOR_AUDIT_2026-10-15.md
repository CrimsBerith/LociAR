# Konum notu ve bildirim — derin simülatör denetimi

15 Ekim 2026. Önceki kabul: [simülatör raporu](SIMULATOR_NOTES_NOTIFICATIONS_2026-10-15.md). Bu ek denetim aynı çalışma ağacındaki değişiklikleri korur; ayrı `LociAR Notes Complete 20261015` simülatörü ve sentetik `demo-lociar` kullanır. Üretim deploy'u veya GitHub push yapılmadı.

## Bulgular ve düzeltmeler

| Bulgu | Düzeltme ve kanıt |
|---|---|
| Not formu Unicode sınırını sunucudan farklı sayıyordu | Swift `String.count` yerine gönderilen kırpılmış metnin UTF-16 uzunluğu kullanılır; AR formu ve sunucuyla aynı 220 sınırı. Düzeltme öncesi gerçek UI testi 111 emojiyi geçerli saydığı için başarısız oldu (`unicode-before.xcresult`). |
| Yayın beklerken metin veya pencere değişebiliyordu | Form ve kapatma düğmesi işlem boyunca kilitlenir; sürükleyerek kapatma engellenir. Fonksiyon girişindeki koruma, sıraya girmiş ikinci bir dokunmayı da durdurur. Konum bekleme, hata sonrası kilidin açılması ve aynı formdan yeniden deneme UI testinde kontrol edilir. |
| Filtre retleri ham İngilizce gösteriliyordu | Sunucu `invalid_caption`, `content_not_allowed`, `links_not_allowed` nedenlerini ayırır. iOS mevcut 12 dil çevirilerini kullanır; eski sunucunun ortak hata metni de çevrilir. `location_inaccurate` için mevcut konum açıklaması kullanılır. Eski yanıt `legacy-filter-response.json` içinde korunur. |
| Commit edilmiş ancak sonradan gizlenmiş/kaldırılmış notun tekrar yanıtı başarı sayılıyordu | Onay metni sunucunun `publishStatus` değerini izler. Yalnız `active`, “Haritada görünüyor” der; inceleme ve erişilemeyen kayıt ayrı açıklama gösterir. Sunucu tekrar çağrısında moderasyon durumunu korumaya devam eder. |

Yeni çeviri anahtarı veya katalog değişikliği gerekmedi. Sunucu metin filtresi, rıza, moderasyon ve yazma yetkisi korunur.

## Soğuk açılış testinin ortamı

İlk yeni soğuk açılış denemesinde Aktivite ekranı açıldı, ağ isteği başarısız oldu. Aynı anda alınan sunucu yanıtı geçerliydi (`cold-activity-response.json`); UI hiyerarşisi yükleme hatasını gösterir (`cold-all/`). XCTest'in `launchEnvironment` değeri, SpringBoard'un başlattığı yeni uygulama sürecine taşınmıyordu. Test koşucusu, yalnız ayrılmış simülatörün launchd ortamına `LOCIAR_DEMO_EMULATOR_HTTP=1` koyar ve bitişte önceki değeri geri yükler. Uygulamadaki DEBUG, sentetik proje/anahtar/uygulama kimlikleri ve özel LAN kontrolleri değiştirilmedi.

Yabancı alıcı testinde ön plan bildiriminin gösterilmemesi ve arka plan bildirimine dokununca yönlendirme yapılmaması ayrı kontrol edilir. Sentetik arka plan push'u sunucu alıcı kontrolünü kasıtlı olarak atlar; iOS uygulama kodundan önce banner gösterebilir. Bu test, gerçek sunucunun yanlış kullanıcıya push gönderdiği anlamına gelmez.

## Kabul kayıtları

| Kontrol | Sonuç |
|---|---:|
| Repo script regresyonları | 49/49 |
| Functions unit | 130/130 |
| Admin unit | 35/35 |
| Functions tam emülatör paketi | 184/184 |
| Admin bildirim/kampanya entegrasyonu | 14/14 |
| Native ve üç UI testi | 188 geçti; 1 fiziksel GPS testi atlandı |
| Gerçek SDK ile tek temiz koşuda uçtan uca senaryolar | 14/14 |

**Bu ek denetimde tekrarlar sayılmadan 614 test geçti; 1 fiziksel GPS testi simülatörde atlandı.** Native/UI paketi 189 test içerir: 186 native testten 185'i geçti, biri fiziksel cihaz gerektirdi; üç UI testi geçti. UI testleri harita satırının 44 punto alanını ve açılışını, Unicode sınırını ve 12 dilde not formu/bildirim ayarlarını kapsar. Dil döngüsünde 24 ekran görüntüsü alındı.

14 uçtan uca senaryo: kayıt/doğrulama/giriş; kamerasız anonim yayın ve otomatik harita yenileme; konum kaybı/bekleyen form kilidi/yeniden deneme; bağlantı ve uygunsuz metnin çevrilmiş hatası ve geçerli metne dönüş; profil düzenleme; rızanın yeniden açılışta korunması; çıkış/tekrar giriş; konum notu bildirimi ve Post'a geçiş; arka planda admin bildirimi; kapalı uygulamada admin bildirimi; yabancı alıcı kontrolü; bildirim rızasını kapatma; konum iznini kapatma/geri açma; hesap silme. Admin bildirimleri kampanya ve yönetici konum/teknik veri paylaşımı kapalıyken çalıştı. Bildirim onayı, `read_at` ve aynı işin ikinci kez gönderilememesi sunucuda kontrol edildi.

Özel loglar ve `.xcresult` kayıtları `build/deep-simulator-20261015/` altındadır:

- `e2e-final/`: 14 başarılı senaryo; her biri ayrı log ve `.xcresult` içerir. Koşucu çıkış kodu 0; her kayıt 1 geçti, 0 başarısız, 0 atlandı.
- `native-ui.xcresult`, `native-ui-summary.json`: 188 geçti, 0 başarısız, 1 atlandı.
- `functions-emulator.log`: 184 geçti, 0 başarısız/atlanan/iptal edilen.
- `script-tests.log`, `functions-unit-final.log`, `admin-unit.log`, `admin-campaigns.log`: kalan kabul paketleri.
- `cold-accepted/`, `foreign-accepted/`, `filter-accepted/`: kabul edilen ekranlar. Soğuk açılış, yönlendirme engeli ve çevrilmiş ret açıklamaları görsel olarak incelendi.
- `verification.json`: test eşlemesi, kaynak/log hash'leri ve kapsam sınırları.
- `unicode-before.xcresult`, `e2e/`, `cold-all/`: başarısız tanı denemeleri; kabul toplamına katılmaz.

Secret taraması, release localization, katalog güncelliği, derleyiciden çıkarılmış 618 anahtar, betik sözdizimi ve `git diff --check` geçti. Ayrılmış simülatörün uygulaması kapalı, konumu temizlenmiş ve simülatör durdurulmuştur. Eklenen demo ortam izni temizlendi; sekiz test portu kapalıdır. Diğer açık simülatörlere dokunulmadı.

## Kapsam sınırı

Simülatör konumu ve `simctl push`, gerçek GPS doğruluğunu, APNs/FCM ağı üzerinden fiziksel telefona teslimi, kilitli telefonun bölge olayıyla uyanmasını, force-quit sonrası konum davranışını veya pil tüketimini kanıtlamaz. Konum notu bildirimi gerçek uygulama servisi ve callable üzerinden üretilir; admin bildirimi gerçek teslim fonksiyonuna enjekte edilen simülatör taşıyıcısıyla sınanır.
