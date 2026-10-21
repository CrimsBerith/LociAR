# Mac üzerinde yapılan QA — kontrol listesi

**16 Ekim güncellemesi:** iPhone SE (3. nesil) ve iPhone 17 Pro Max ile tekrar denetimi tamamlandı: 1057 başarılı test çalıştırması, 0 başarısız, 2 fiziksel GPS testi atlandı. Her modelde 15 SDK senaryosu; toplam 607 repo/Firebase/admin/tarayıcı testi; 10 rol için 160 sayfa erişim kontrolü. Yeni bulgular, düzeltmeler, canlı kontrol sınırları ve ham kanıtlar [16 Ekim matris raporunda](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/release/SIMULATOR_MATRIX_2026-10-16.md>). Aşağıdaki sayılar 15 Ekim'in tarihsel kayıtlarıdır; birbirine eklenmez.

15 Ekim 2026. Native iOS uygulaması Mac'te Xcode 26.6 ve iOS 26.5 simülatörüyle çalıştırıldı. Sunucu testleri yerel Firebase `demo-lociar` üzerinde yapıldı. Admin bildiriminde gerçek teslim fonksiyonuna `simctl push` taşıyıcısı enjekte edildi.

Son ek denetim: **614 geçti, 0 başarısız, 1 fiziksel GPS testi atlandı.** Kanıt kaydının tamamlanma zamanı: `2026-10-15T21:55:32+03:00`. Başarısız tanı denemeleri bu kabule dahil değildir. İlk denetimin 818 testiyle sonuçlar örtüşür; toplamlar birbirine eklenmez.

`[x]` belirtilen kapsamda gözlenen/test edilen maddeyi, `[ ]` tamamlanmamış kabulü gösterir. Bu liste kalan maddeler kapanmadan tam yayın onayı vermez.

## Uygulamada yürütülen akışlar

- [x] Gerçek Firebase iOS SDK ile kayıt, emülatör e-posta doğrulaması ve giriş.
- [x] Profil düzenleme; çıkış ve tekrar giriş; oturumun yeniden açılışta korunması.
- [x] Uygulamadan hesap silme akışı.
- [x] Kamerayı açmadan ölçülen simülatör konumunda anonim not yayınlama.
- [x] Başarılı notun elle Yenile gerekmeden haritada görünmesi ve açılması.
- [x] Boş ve fazla uzun metnin yayınlanmaması; emoji ve birleşen Unicode karakterlerinin sunucuyla aynı sınırı kullanması.
- [x] Başarılı yayından sonra ikinci gönderimin engellenmesi; sunucuda tek not bulunması.
- [x] Yayın beklerken metin değişikliği, Kapat düğmesi ve sürükleyerek kapatmanın engellenmesi.
- [x] Güncel konum yokken sunucuya not yazılmaması; konum dönünce aynı formdan yeniden deneme.
- [x] Konum izni reddinde yayın engeli; izni geri açınca toparlanma.
- [x] İzin reddinde çelişen yaklaşık konum uyarısının gösterilmemesi.
- [x] Bağlantı ve uygunsuz metnin çevrilmiş açıklamayla reddedilmesi; reddedilen metnin post olarak yazılmaması.
- [x] Filtre reddinden sonra geçerli metinle yayın yapılabilmesi.
- [x] Sunucuda incelemede/gizlenmiş/kaldırılmış notun tekrar yanıtında yanlış “Haritada görünüyor” mesajı verilmemesi — native ve sunucu testleri.

Kanıt: `build/deep-simulator-20261015/e2e-final/`, `native-ui.xcresult`, `functions-emulator.log`. **14 uçtan uca testin tamamı aynı temiz koşuda geçti.**

## Bildirim, izin ve hesap sınırları

- [x] Genel bildirim rızasının ayarlardan açılması ve yeniden başlatmada korunması.
- [x] Kampanya, yönetici konum paylaşımı ve teknik veri paylaşımı kapalıyken admin bildiriminin çalışması.
- [x] Konum girişinin gerçek uygulama servisi → callable → yerel bildirim yolunu çalıştırması.
- [x] Konum notunda tek aktivite ve `queued` onayının sunucuda bulunması.
- [x] Konum notu bildirimine dokununca ilgili Post ekranının açılması.
- [x] Arka plandaki uygulamada admin bildirimine dokununca Aktivite ekranının açılması.
- [x] Tamamen kapatılmış uygulamayı admin bildirimine dokunarak açma; mesajın listelenmesi ve `read_at` kaydı.
- [x] Tamamlanmış admin işinin yeniden çağrılınca tekrar gönderilmemesi.
- [x] Başka alıcıya ait sentetik bildirimin ön planda gösterilmemesi.
- [x] Başka alıcıya ait sentetik arka plan bildirimine dokununca Post/Aktivite yönlendirmesi yapılmaması.
- [x] Genel bildirim rızası kapatılınca yeni admin kuyruğunun reddedilmesi.
- [x] Token sahipliği, hesap değişimi, izin revizyonu ve gecikmiş temizleme kontrolleri — native/sunucu/admin entegrasyonu.

Sentetik arka plan push'unda iOS banner'ı uygulamadan önce gösterebilir. Alıcı testi uygulama yönlendirmesini doğrular. **Gerçek APNs/FCM ağı üzerinden fiziksel telefona teslim henüz bu listede onaylı değildir.**

## Mac üzerindeki kalite ve regresyon kontrolleri

- [x] Güncel uygulama ve test hedeflerinin Xcode ile derlenmesi.
- [x] Native testler: 185 geçti, 1 fiziksel GPS testi atlandı.
- [x] Üç UI testi: harita dokunma alanı/açılış, Unicode sınırı, 12 dilde form ve bildirim ayarları.
- [x] 12 dilde 24 ekran görüntüsü; kabul edilen bildirim ve filtre hata ekranlarının görsel incelemesi.
- [x] Harita not satırının en az 44 punto dokunma alanı.
- [x] Functions unit: 130/130; Functions tam emülatör paketi: 184/184.
- [x] Admin unit: 35/35; admin bildirim/kampanya entegrasyonu: 14/14.
- [x] Repo script regresyonları: 49/49; Functions tip kontrolü.
- [x] Secret taraması; release localization; 12 dil katalog güncelliği; derleyiciden çıkarılan 618 anahtarın katalogda bulunması.
- [x] Betik sözdizimi ve `git diff --check`.
- [x] Kabul edilen testlerin `.xcresult` özetleri, kaynak/log/binary hash'leri ve dondurulmuş sunucu kodunun eşleşmesi.
- [x] Koşu sonunda test portlarının kapanması, simülatör konumu ve demo ortam izninin temizlenmesi, ayrılmış simülatörün durdurulması.

## Aynı gün yapılan ilk geniş Mac denetimi

Bu bölümün ayrıntıları [ilk raporda](SIMULATOR_NOTES_NOTIFICATIONS_2026-10-15.md), ek denetim sonuçları [derin raporda](DEEP_SIMULATOR_AUDIT_2026-10-15.md) bulunur.

- [x] Firestore ve Storage erişim kuralları: 83/83.
- [x] Admin HTTP ve oturumlu entegrasyon paketi: 98/98.
- [x] Masaüstü/mobil Chromium kabulü: 24/24.
- [x] Genel iOS simülatör UI paketi: 21/21.
- [x] Bildirimden arka plana/ön plana geçişte bulunan çökme ve yayın sonrası harita yenileme sorununun düzeltilip yeniden sınanması.

## Tam yayın kabulü için açık maddeler

Canlı Firebase altyapı metadata kontrolü 15 Ekim 2026, 16:38'de geçti: `build/firebase-readiness/missing-audit-20261015.json`, `validation_mode: live_metadata`, `ready: true`, sıfır bulgu. Bu kayıt altyapı hazırlığını gösterir; son yerel düzeltmelerin canlıda çalıştığına dair uçtan uca kabul değildir.

- [ ] Fiziksel iPhone'da kamerasız not yayını ve gerçek GPS saha ölçümleri; iç/dış mekân ve konum kaybı.
- [ ] Canlı admin oturumundan gerçek telefona APNs/FCM teslimi; uygulama açık, arka planda ve kapalıyken gözlenen sonuçlar.
- [ ] Kilitli fiziksel telefonun bölge olayıyla uyanması; Always/Kesin Konum/Background App Refresh koşulları ve force-quit davranışı.
- [ ] Fiziksel cihazda uzun süreli pil, ısı, zayıf bağlantı ve hareketli kullanım ölçümü.
- [ ] Uygulamanın AR kapsamı için fiziksel Cloud Anchor/VPS ve iki cihazda yeniden konumlama kabulü.
- [x] Birden fazla iPhone modeli: 16 Ekim'de SE (3. nesil) ve 17 Pro Max ile tekrarlandı; ayrıntı yeni matris raporunda.
- [ ] Farklı iOS sürümleri; bu Mac'teki mevcut runtime ve yeni kayıtlar yalnızca iOS 26.5.
- [ ] Canlı admin panelinin tüm sayfa, rol ve hata kombinasyonlarıyla manuel kabulü. Mevcut 98 entegrasyon testi oturumlu HTTP ve seçili gerçek Chromium işlemlerini içerir; 24 public tarayıcı testi ayrıca çalıştırılmıştır.
- [ ] Son yerel düzeltmelerin sürüm adayı olarak CI'da ve dağıtılmış canlı ortamda doğrulanması.
- [ ] İmzalı Release/TestFlight sürümünün gerçek servislerle uçtan uca kabulü.

Bu açık maddeler hata bulunduğu anlamına gelmez; henüz tamamlanmış kanıt bulunmayan kontrollerdir. Mac/simülatör sonuçları bu alanlar için sıfır hata garantisi vermez.

Ham kanıt: `build/deep-simulator-20261015/verification.json`. Bu liste hazırlanırken kayıtlı 22 dosyanın hash'leri yeniden karşılaştırıldı; denetimden beri değişiklik bulunmadı. Çalışma ağacı yereldir; bu denetim üretime deploy veya GitHub push yapmadı.
