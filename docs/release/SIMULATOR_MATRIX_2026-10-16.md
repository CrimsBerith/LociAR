# 16 Ekim 2026 — simülatör, Firebase ve admin tekrar denetimi

**Son kabul: 1057 başarılı test çalıştırması, 0 başarısız, 2 fiziksel GPS testi atlandı.** Kanıt doğrulaması 16 Ekim 2026, 01:31'de tamamlandı. Aynı senaryoların iki modelde çalıştırılması ve son yerleşim tekrarları bu sayıya dahildir; 1057 farklı özellik anlamına gelmez. Başarısız tanı koşuları ve ek native tekrarları toplama eklenmedi.

## Kapsam ve ortam

Native iOS, Xcode 26.6, iOS 26.5. Ayrı test cihazları: iPhone SE (3. nesil) `D6B100D9-1430-4397-BDBB-A3B05E763BA6` ve iPhone 17 Pro Max `2E16FEBA-2988-4BEA-A904-20360EE59BD8`. Başka işlere ait simülatörler değiştirilmedi. Bu Mac'te başka iOS simülatör sürümü bulunmuyor.

Yazma testleri yalnızca yerel Firebase `demo-lociar` üzerinde. Admin, üretim Next.js derlemesiyle gerçek HTTP ve Chromium üzerinden sınandı. Yönetici bildirimi gerçek kuyruk/teslim fonksiyonundan geçiyor; taşıyıcı `simctl push`. Bu, APNs/FCM internet tesliminin kanıtı değildir.

## Tamamlanan sunucu ve admin kontrolleri

| Paket | Geçen | Kanıt |
|---|---:|---|
| Repo betikleri | 49 | `build/simulator-matrix-20261016/guards-accepted.log` |
| Functions unit | 130 | `preflight.log` |
| Admin unit | 35 | `guards-accepted.log` |
| Firestore / Storage kuralları | 83 | `preflight.log` |
| Functions tam emülatör paketi | 184 | `preflight-resume.log` |
| Admin entegrasyonu / oturumlu Chromium | 102 | `admin-final.log` |
| Public masaüstü / mobil Chromium | 24 | `admin-final.log` |

Log yolları `build/simulator-matrix-20261016/` altındadır. Kabul edilen paketlerde sıfır başarısız/atlanmış test vardır. Önceki başarısız tanı koşuları toplama dahil edilmez.

- [x] Functions ve admin tip kontrolleri; üretim derlemesi; production/full bağımlılık denetimleri.
- [x] Secret taraması, 12 dil katalog güncelliği ve release localization.
- [x] Kayıt/kimlik, anonim veri izdüşümleri, gönderi, beğeni, yorum, kayıt, engelleme, raporlama ve sayaçlar — ilgili native/sunucu/kural paketleri.
- [x] Hesap silme, Storage temizliği, işlem tekrarları ve eşzamanlılık — sunucu/admin entegrasyonu.
- [x] GPS sınırları, not onayı, raporla gizleme, konum girişleri, yoğun alanlar, kampanya yolculukları ve kodlar — sunucu/admin entegrasyonu.
- [x] Rıza iptali, token sahibi değişimi, eski izin revizyonları, gönderim tekrarları ve kota — bildirim entegrasyonu.
- [x] 10 admin rolü × 16 statik korumalı sayfa = 160 gerçek HTTP erişim kontrolü; yetkisiz 9 rolün admin bildirimi isteği reddedildi.
- [x] 17 korumalı sayfa, gönderi detayı dahil, masaüstü ve mobil Chromium'da açıldı; tarayıcı çalışma zamanı hatası görülmedi. Mobil düzen MFA alt bilgisini gizler; oturum işareti DOM'da ayrıca doğrulandı.
- [x] Bildirim formunda sunucu kaydı tamamlandıktan sonra yanıt kesildi. Yeniden deneme aynı işlem anahtarını kullandı: tek iş, tek aktivite, tek audit ve tek kota tüketimi. Genel rıza iptalinden sonraki yeni istek engellendi. Pazarlama/konum/telemetri rızaları kapalıydı.

## Bu koşuda bulunan ve düzeltilenler

1. **Kamerasız notta klavye kapatma:** SE'de klavye açıkken yayın düğmesine erişilemedi. `PlaceNoteComposer` içine odak kontrolü, klavyede “Bitti” ve etkileşimli kaydırarak kapatma eklendi.
   **Başarı/hata görünürlüğü:** Gerçek SE SDK akışında not sunucuya yazıldı, fakat tüm `Form` kilitlendiğinden aşağıdaki başarı mesajına kaydırılamadı. Kilit iki düzenlenebilir bölüme daraltıldı, harita etkileşimi bekleme/başarı sırasında kapatıldı ve durum mesajı altta sabit, görünür bir alana taşındı. SDK testi mesajın ekran sınırlarında kaldığını da doğruluyor. Başarısız tanı koşusu `se-e2e/` altında saklı.
   Uzun İspanyolca/Rusça başlıklar büyük başlık stilinde kısalıyordu; başlık kompakt stile alındı ve 12 dilde yeniden sınandı.
2. **Adminin erken yetki kapısı:** `campaigns` ve `place-notes`, Proxy'nin sayfa izin tablosunda eksikti. Sayfa bileşeni yine izin kontrolü yapıyordu; ancak yetkisiz istek 200 ile akışa başlayabiliyordu. İki rota artık akış başlamadan 307 ile yönlendiriliyor; rol matrisi bunu doğruladı. Canlıya deploy yapılmadı.
3. **Test hazırlığı ve hedefleme:** Küçük ekranda görünmeyen profil satırları kaydırılarak bulunuyor; tam ekran savurmaları yerine kısa sürüklemeler kullanılıyor. Genel metin doğrulama UI paketi için simülatöre açıkça foreground konum izni veriliyor. Gerçek izin reddi ayrı SDK senaryosunda sınanıyor. Admin davet formu seçimleri kendi formuyla sınırlandı.
4. **Crashlytics test zamanlaması:** Başarılı sahte yükleyici için 1 saniyelik test bütçesi, eşzamanlı Xcode yükünde sahte zaman aşımı üretti. Yalnızca başarılı testlerin hazırlık bütçesi 10 saniye oldu; durdurma testi hâlâ 1 saniyelik watchdog ve aynı 7,5 saniyelik üst sınırla çalışıyor. Üretim yükleme betiği değişmedi.
5. **SDK test paketi izolasyonu:** `se-final-e2e/` sırasında başka simülatörün derlemesi ortak DerivedData'daki imzalı uygulama dosyalarını değiştirdi; çıkış/giriş testinden sonraki açılış giriş ekranına döndü. Bu koşu geçerli kabul edilmedi. Her SDK koşusu artık ürünlerin ayrı bir kopyasını ve kendi `.xctestrun` dosyasını kullanıyor. Uygulamanın binary/Info.plist hash'leri başta ve sonda karşılaştırılıyor. Bu, uygulama oturum mantığını değiştiren bir düzeltme değildir; test düzeni düzeltmesidir.

## Simülatör kabulü

| Model | Native | Genel UI | Son dil/Unicode tekrarı | Gerçek SDK uçtan uca |
|---|---:|---:|---:|---:|
| iPhone SE (3. nesil) | 185 geçti, 1 GPS atlandı | 23/23 | 2/2 | 15/15 |
| iPhone 17 Pro Max | 185 geçti, 1 GPS atlandı | 23/23 | 2/2 | 15/15 |

İki modelde de aynı temiz SDK koşusunda 15 senaryonun tamamı geçti: kayıt/doğrulama/giriş; kamerasız anonim GPS notu ve haritada açma; güncel konum yokluğu ve tekrar deneme; URL içeren/uygunsuz metin reddi ve düzeltme; profil; bağımsız bildirim rızası; çıkış/giriş; konum girişi bildirimi; arka plan, kapalı uygulama ve ön plan admin bildirimi; yabancı alıcı engeli; bildirim rızasını kapatma; konum izni reddi ve toparlanma; hesap silme. Silmede Auth, notlar, tokenlar, bildirimler ve yoğunluk üyeliklerinin de silinmesi doğrulandı.

- [x] Kamerasız not, `active`, anonim, ölçülen GPS konumunda, işletme seçilmeden yazıldı; elle yenilemeden haritada açıldı.
- [x] Boş/uzun/Unicode metin sınırları; görünür başarı/hata alanı; beklerken alan ve kapatma kilitleri; başarısız ölçüm/filtre sonrasında tekrar deneme.
- [x] Genel bildirim rızası açık; pazarlama, admin konum paylaşımı ve telemetri kapalıyken admin bildirimi.
- [x] Konum örneği → gerçek uygulama servisi → callable → tek aktivite/`queued` onayı → yerel bildirim → ilgili notun açılması.
- [x] Admin kuyruğu → gerçek teslim fonksiyonu → simülatör push'u → Aktivite ekranı → sunucuda `read_at`; biten işi tekrar çağırınca ek gönderim yok.
- [x] Ön plan, arka plan ve kapalı uygulamadan bildirimle açılış ayrı testler; yanlış alıcının sunum/yönlendirme engeli.
- [x] Genel bildirim rızası kapatıldığında yeni admin işi yok; gerçek simülatör konum izni reddedilip geri verildiğinde toparlanma.
- [x] 12 dilde, her modelde 24 form/ayar ekranı: toplam 48 son ekran görüntüsü ve görsel inceleme. Uzun başlıklar son kompakt düzende tam görünüyor.
- [x] Her SDK koşusunda sabit `.xctestrun` ürün kopyası kullanıldı; uygulama binary/Info.plist hash'leri başta/sonda aynı. 30 SDK `.xcresult` kaydının her biri tek başarılı, atlanmamış senaryo olarak doğrulandı.

Kabul dizinleri: `se-immutable-e2e/`, `max-immutable-e2e/`, `se-accepted/`, `max-final/`, `se-layout/`, `max-layout/`. Son yayın ekranı değişiklikleri için iki dil/Unicode UI testi ayrıca yeniden çalıştırıldı. Eski geniş UI paketindeki diğer ekranlar değişmedi.

## Kanıt ve temizlik

374 kaynak dosyasının son hash kaydı yeniden karşılaştırıldı; fark yok. İki test simülatörü durduruldu, GPS enjeksiyonları temizlendi, geçici demo HTTP izni geri alındı. Kontrol edilen 11 test portu boş. Bu iki cihazın hedef uygulamasına ait bu denetimde yeni çökme raporu bulunmadı.

- [Doğrulama kaydı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/verification.json>)
- [Temizlik kaydı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/cleanup.json>)
- [SE'de görünür yayın onayı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/se-success-screens/75BC51FB-B190-465A-91D4-FA1F5C6A1217.png>)
- [SE — 12 dil form](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/se-final-screens/SE-composer-sheet.png>) / [ayarlar](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/se-final-screens/SE-settings-sheet.png>)
- [Pro Max — 12 dil form](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/max-final-screens/Max-composer-sheet.png>) / [ayarlar](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/simulator-matrix-20261016/max-final-screens/Max-settings-sheet.png>)

## Canlı, salt okunur kontroller

- [x] Güncel Firebase altyapı metadata kontrolü: `build/firebase-readiness/simulator-matrix-20261016.json`, `live_metadata`, hazır, sıfır bulgu. Secret değerleri okunmadı.
- [x] Canlı admin/yasal sayfalarda 20 GET: 4 public sayfa 200; 16 korumalı adres oturumsuz kullanıcıyı girişe yönlendirdi. Hepsinde CSP vardı; özel içerik işaretleri bulunmadı. Kanıt: `live-admin-public.json`.

Canlı MFA oturumu ile içerik yazılması veya gerçek telefona bildirim gönderilmesi bu kontrollerin parçası değildir. Yerel düzeltmelerin deploy edildiği anlamına gelmez.

## Takip notu ve açık kabul sınırları

İlk Functions koşusunda yoğunluk testi, aktif notun sayılmasını 30 saniyede gözleyemedi (183/184). İkinci tam koşu 184/184 geçti. 16 Ekim takip incelemesinde aynı hata kontrollü yükle yeniden üretildi: emülatörde biriken olaylar yoğunluk tetikleyicisini 36,5 saniye geciktirdi; ardından yaklaşık 20 ms'de tamamlandı ve dört sayaç da doğru biçimde 1 oldu. Güncel tam paket de 184/184 geçti; hedef notta 28 saniyelik teslim gecikmesi ölçüldü. Süre veya beklenen sayı gevşetilmedi. Test izolasyonu henüz düzeltilmedi; yük altında zaman aşımı tekrar edebilir. Ayrıntı ve kanıtlar: [zaman aşımı incelemesi](DENSITY_TIMEOUT_INVESTIGATION_2026-10-16.md). İki SDK akışında da notun yoğunluk üyeliğinin oluşması ve silinmesi ayrıca kontrol ediliyor.

Aynı yoğunluk ekleme/silme senaryosu, SDK emülatör ortamında ayrıca beş kez tekrarlandı: **5/5 geçti**, atlanan test yok. Kanıt: `density-repeat-1.log` … `density-repeat-5.log`. Bu ek tekrarlar ana paket toplamına eklenmez.

- [ ] Farklı iOS sürümleri; bu koşu yalnızca iOS 26.5.
- [ ] Fiziksel iPhone GPS/AR düzlemi/Cloud Anchor/VPS, iki cihazda yeniden konumlama, pil ve ısı.
- [ ] Gerçek APNs/FCM teslimi; kilitli cihazın bölge olayıyla uyanması; force-quit sınırlamaları.
- [ ] Canlı MFA oturumunda tüm admin işlemleri ve son yerel düzeltmelerin dağıtılmış sürümde kabulü.
- [ ] İmzalı Release/TestFlight ile gerçek servis kabulü.

Örnek içerikli AR UI testleri fiziksel AR doğruluğunu kanıtlamaz. Kapalı uygulamayı admin bildirimine dokunarak açmak, uygulama kapalıyken GPS bölgesinin işletim sistemini uyandırmasını kanıtlamaz. Sıfır hata garantisi verilmez.
