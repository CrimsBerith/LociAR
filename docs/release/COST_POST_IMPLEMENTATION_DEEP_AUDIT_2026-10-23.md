# Maliyet uygulaması sonrası derin denetim — 23 Ekim 2026

Kaynak: `60afbca` + `codex/fix-anonymous-location-audit` çalışma ağacı. Bu inceleme önceki optimizasyon paketinin **sonraki denetimidir**. Üretim kaynakları bu tur değiştirilmedi; iki yeniden üretme aracı, bu rapor ve plan güncellemesi eklendi. Önceki ödeme/destek/harita değişiklikleri korundu. Canlı Firebase'e yalnızca metadata ve iki maskelenmiş sistem ayarı okuması yapıldı; dağıtım, veri göçü veya ayar değişikliği yapılmadı.

**Sonuç:** Optimize edilecek yerler var. En önce düzeltilmesi gereken bulgu maliyetten önce grup geometrisi/okuma doğruluğu. Önceki testlerin geçmesi aşağıdaki yeni senaryoları kapsadıkları anlamına gelmiyor. İkinci bir konu, GIPHY'nin yayımlanan entegrasyon koşullarıyla mevcut proxy/medya cache düzeni arasındaki uyuşmazlık; önceki cache önerisi bu açıdan eksikti.

## A1 — Grup kenarından katılım, 25 m grubunu genişletiyor

**Öncelik: P1, yeniden üretildi.** `functions/src/denseSpots.ts:37`, `functions/src/placeNoteRules.ts:136`, `:147`, `functions/src/publicContent.ts:323`, `functions/src/denseSpots.ts:157`.

`spotsNear`, merkeze mesafeyi değil `distanceToSpot` ile çemberin kenarına mesafeyi 25 m ile karşılaştırıyor. `joinSpot` merkezi yeni üyeye doğru kaydırıp yarıçapı 40 m'de kesiyor. Kesme, eski/yeni üyelerin gerçekten bu çemberde kaldığını doğrulamıyor. Posta yalnız `spot_id` yazılması da koordinat değişmediği için yoğunluk tetikleyicisinde üyelik kontrolünü yeniden çalıştırmıyor.

Gerçek Firestore emülatöründe önce 40 m'ye yayılan beş not, ardından mevcut çemberin kenarından 25 m'den az uzakta 12 not oluşturuldu ve gerçek `syncSpotMembership` çağrıldı:

| Sonuç | Ölçüm |
|---|---:|
| Aynı spot altında kalan not | 17 |
| En uç notlar arası mesafe | 153 m |
| Kayıtlı grup yarıçapı | 40 m |
| Grup merkezindeki okuyucudan en uzak üye | 91 m |
| Merkezdeki taze, 0 m doğruluklu test fix'i ile açık dönen gövde | 17/17 |

Bu, tek bir kanonik 25 m grubu olarak sunulacak geometriyi karşılamıyor. `readMapGroup` mevcut üyelerin ortalamasını hesaplayıp yarıçapı yine kesiyor; `locationNoteLock` grup alanını bütün üyelere okuma izni olarak kullanınca 91 m uzaktaki gövde de açılıyor. Test sentetik GPS girdisidir; fiziksel GPS ölçümü değildir. Sunucu kodunda katılım ve kilit davranışını gerçekten yeniden üretir.

**Düzeltme sözleşmesi:** Kanonik üyelik sabit bir 25 m anchor etrafında, tüm üyelere uygulanabilen açık bir geometri değişmeziyle kurulmalı. Merkez kayması/çember kenarı art arda zincir oluşturamamalı. Eski genişlemiş spotlar bölünüp üyelikleri yeniden hazırlanmalı. Geçişte geçersiz grup geometrisi uzak üyelere toplu okuma hakkı vermemeli; o üyelerin kendi güncel konum kontrolü kapalı kalmalı. Yalnızca yarıçapı 40→25 yapmak veya kesmeyi kaldırmak eşdeğer düzeltme değildir. Harita özeti, kanonik grup, devam oturumu ve okuma grant'i aynı üyelik sürümüne dayanmalı.

**Kabul:** Bu 17 not atlanmadan uygun ayrı gruplara bölünmeli; merkezden 91 m uzaktaki not bu grubun izniyle açılmamalı. Aynı koordinat, tarih çizgisi, gizleme/silme, beğeni sırası ve eski imleç testleri korunmalı. Sonraki cache/dizin tasarımı bu geometri sorununun üzerine kurulmamalı.

## A2 — GIPHY için cache/proxy önerisi koşulsuz olamaz

**Öncelik: sağlayıcı uyumu ve mimari karar.** `functions/src/giphy.ts`, `LociAR/Data/GifRepository.swift`, `LociAR/DesignSystem/AnimatedGIFView.swift`, `LociAR/Domain/Models.swift:359`.

23 Ekim'de açılan [resmî GIPHY API belgesi](https://developers.giphy.com/docs/api/#best-practices), standart entegrasyonda API/medya proxy'sini, medya URL'si yeniden yazımını ve izinsiz medya cache'ini kısıtlıyor; özel cache için yazılı onay ve yeniden doğrulama düzeni açıklıyor. Repo ise sunucuda API çağrısı, id'den URL üretimi ve açık medya byte cache'i kullanıyor. İncelenen repo belgelerinde bu düzen için özel izin kanıtı bulunmadı; bu, hesapta böyle bir izin olmadığına dair kanıt değildir.

**Önceki öneri düzeltmesi:** GIPHY cache'ini büyütmek koşulsuz maliyet önerisi olmamalı. Sağlayıcı istisnası/entegrasyon şartları doğrulanmalı; yayın rating doğrulaması taze kalmalı. Mevcut AGENTS.md anahtarın sunucuda kalmasını emrediyor; bu bulgu anahtarı istemciye taşımaya yetki vermez. [Boyut/rendition önerileri](https://developers.giphy.com/docs/api/#rendition-guide) de onaylanan URL ve medya akışıyla birlikte ele alınmalı. GIPHY'ye mesaj gönderilmedi, anahtar okunmadı, sağlayıcı planı/kotası veya fiyatı doğrulanmadı.

## Yeniden üretme sonuçları

Bu tablodaki “başarılı” tanı, sorunun mevcut kodda yeniden üretildiğini belirtir; sağlık/kabul sonucu değildir. Firestore sayıları mantıksal nokta okumaları ve dönen sorgu belgeleridir; indeks, retry ve boş sorgu asgarisi ayrıca sayılır. [Resmî ücretlendirme](https://firebase.google.com/docs/firestore/pricing).

| Kimlik | Senaryo | Mevcut sonuç | İyileştirme |
|---|---|---|---|
| A3 | Aynı bağlam için altı bölge yenilemesi | 6 işlem turu; yalnız 1 tur uygulanıyor | Anlamı değişmeyen ihtiyaç aynı uçuşu paylaşmalı; yalnız gerçek yeni bağlam takip işi doğurmalı |
| A4 | Eşik 3; 300 uygun, olgun beğeni; yeni indeks açık | 200 beğeni + 400 profil/silme çiti + post/ayar 2 = **602 mantıksal belge okuması** | Hem aday sorgusu hem profil çözümü kalan eşik kadar ilerlemeli; geçersiz adayda devam etmeli |
| A5 | Geçersiz içerik modu, 400 ilgisiz engel kenarı | Reddedilmeden önce 400 sorgu belgesi + 2 hesap okuması | Şekil/mod doğrulaması pahalı dışlama sorgularından önce |
| A6 | 15 kendi kaydedileni, 400 ilgisiz engel kenarı | 415 sorgu belgesi + 19 nokta okuması | Tüm engel geçmişi yerine sayfadaki yazarların ilgili güncel kenarları |
| A7 | 300 notluk grupta ilk 15 + devam 50 | 65 gövde için 600 post sonucu; iki istekte toplam 9 nokta okuması ve 8 sorgu | Mevcut bütün grubu tarayan devam yolu, sürümlü üyelik/sıra protokolüyle sınırlandırılmalı |
| A7 | Aynı iki grup sayfasının yükü | Her yanıtta 300 kimlik; üye dizisi tek başına **11.701 byte** | Devam yanıtında yeniden bütün kimlikler yerine sürümlü küçük özet; eski istemci/hint toparlama korunmalı |
| A8 | 10 post ve hepsini içeren tek oturumun hard delete'i | 171 sorgu; **169'u boş**; oturum koleksiyonuna 11 sorgu | Post bağımlılıklarını sınırlı kimlik gruplarıyla toplu temizleme; hard delete kapsamı/lease korunmalı |
| A9 | Aynı GIF URL'sini isteyen 8 eşzamanlı tüketici | **8 sentetik URL isteği**; sonraki seri hit 0 ek istek | Sağlayıcı koşullarıyla uyumlu devam eden indirme paylaşımı ve byte sınırı |
| A12 | Sayaç zaten doğru, yeni event alındısı | 1 değişmeyen hedef update girişimi + zorunlu 1 receipt create | Yalnız farklı sayaç alanlarını yaz; event receipt ve activity davranışı korunmalı |
| N1 | Aynı enlemde 80 post; yalnız 1'i 120 m içinde | Fallback 80 post okuyor; indeksli yol 1 post sonucu | Bu fallback koşullu kalmalı; **canlıda geo bayrağı zaten 1**, yeni göç önerilmiyor |

### A3 — Bölge yenilemesinde “aynı uçuş” yeterli değil

`LociAR/AppCore/ArrivalRuntimePolicy.swift:39` her `refresh` çağrısında revision artırıyor. `CampaignArrivalService.swift:540` önceki revision ile alınan cevabı atıyor. `:1220` içinde GPS callback'i, son başarılı yenileme 60 sn'den eski kaldıkça tekrar `synchronize()` başlatabiliyor. İş yavaşsa tekrarlar ilk cevabı geçersizleştiriyor; başarılı tarih ilerlemediği için yeni tekrarlar geliyor.

Mevcut Swift sınıfının gövdesi değiştirilmeden çıkarılıp sentetik gecikmeyle yürütüldü: aynı bağlamdaki altı ihtiyaç altı işlem turu, tek uygulama üretti. Gerçek uygulama izinlere göre tur başına en çok üç endpoint çağırabilir; test 18 gerçek Firebase isteği yapıldığı iddiası değildir. Sürekli callback ile gecikme/tüketim uzayabilir.

**Çözüm:** Hesap + rıza/özellik sürümü + kapsanan arama alanı + gerekli tazelikten oluşan ihtiyaç anahtarı kullan. Aynı anahtar bekleyen işi yeniden geçersizleştirmesin. Gerçek alan/rıza/hesap değişimi takip turu oluştursun; son bildirim/yerinde giriş yetkisi taze fix ile kalsın. Telefon, son doğrulanmış bölge listesini kullanırken aynı ihtiyacı tekrar sunucuya yollamasın. Sunucu kapasitesini artırmak bu döngüyü düzeltmez.

### A4 — Yeni onay indeksi her maliyeti çözmüyor

`functions/src/noteAutomation.ts:66`, `:88`: sorgu sayfası sabit 200, ardından sayfadaki bütün kullanıcıların profil ve silme çiti aynı anda alınıyor; eşik kontrolü bundan sonra. Önceki paket genç hesap sonuçlarını taramayı azaltmıştı. Bu farklı senaryoda bütün 300 aday geçerli ve eşik 3 olduğu halde ilk 200'ü çözülüyor.

**Çözüm:** Küçük ilk aday sayfası ve kalan eşiğe göre profil parçası; geçersiz/kendine ait/silinmiş/askıya alınmış adaylarda devam. Uygun ilk üç aday için 3 kaynak + 6 profil/çit + 2 post/ayar = 11 okuma bir tasarım hedefidir, uygulanmış ölçüm değildir. >200 eşik, işlem snapshot'ı ve unlike/re-like doğruluğu korunmalı; `limit(3)` çekip diğer adayları unutmak kabul edilmez.

### A5–A6 — Sayfa sınırlı olsa da engel geçmişi sınırsız

`functions/src/publicContent.ts:30`, `:83`, `:135`: üç dışlama sorgusu izleyicinin bütün gönderdiği/aldığı profil engellerini ve anonim mute'larını alıyor. Genel içerik modlarında pahalı sorgular mod/parametre kontrolünden önce. Saved/collection küçük sayfası da seçili yazarlarla ilgisiz bütün geçmişi alıyor.

Aktivite yolundaki gibi sayfanın tekil yazarları için iki yönlü profil engeli veya yalnız gerekli anonim mute kayıtları taze toplu okunabilir. Anonim ve atfedilen içerik için doğru kenar türü seçilmeli; iki engel türü birleştirilmemeli. Kendi içeriklerinde gereksiz dışlama sorgusu yapılmaması ayrıca değerlendirilmeli. Sayfa dışı engel büyümesiyle tekrar ölçüm ve anonimlik fark testleri şart.

### A7–A8 — Grup oturumu kimlikleri ve silme maliyeti birlikte tasarlanmalı

`publicContent.ts:314` devam sayfasında da bütün kaynak grubu alıyor. `:328` dondurulmuş sıra var; fakat kaynak/yazar taraması dondurulmuş seçili üyelerle sınırlı değil. Bu önceki planda kalan, bu tur yeniden ölçülen bir darboğazdır. Geometri A1 düzeltilmeden yalnızca daha küçük sayfayı okumak grup tamlığını/erişim alanını bozabilir.

**Yanlış optimizasyonu eleme:** `map_group_sessions.post_ids` dizisinin otomatik indeksini kaldırmak ilk bakışta cazip. Ancak `functions/src/accountDeletion.ts:120`, her post için `array-contains` ile bu dizini kullanıyor. Mevcut hard delete test/kapsamı bunu gerektiriyor; indeks körlemesine kaldırılamaz. Önce sınırlı toplu bağımlılık silme veya eşdeğer ters üyelik düzeni, ardından toplam yazma/okuma/TTL gideri değerlendirilir. Yeni ters dizin kendisi de bedava değildir. Sırf TTL'yi beklemek hard delete'in yerini tutmaz.

### A9–A10 — Byte paylaşımı ve metadata sorgusu ayrı

`AnimatedGIFView.swift:12`: aktör cache miss'inden sonra `await` sırasında yeniden girişe izin veriyor; aynı URL için devam eden görev tablosu yok. Mevcut aktörle sekiz tüketici sekiz indirme başlatıyor. NSCache'teki sonradan seri hit doğru çalışıyor. GIPHY için A2 çözülmeden tamamlanmış medya cache'ini büyütmek önerilmiyor.

**A10, kaynak analizi:** `LociAR/Data/AvatarStore.swift:90` güncel metadata kontrolünü byte cache'inden önce her tüketicide yapıyor. Byte indirmeleri artık paylaşılmış olsa da aynı anda aynı avatarın metadata istekleri paylaşılmıyor. Yalnız devam eden aynı metadata kontrolünü hesap/yol/nesil kapsamında paylaşmak değerlendirilebilir; bitmiş eski yetkiyi TTL ile kabul etmek doğru değildir. Bu tur gerçek Storage metadata sayımı yapılmadı; kanıt kaynak akışıdır.

### A11 — Liste cevaplarının geç gelme koruması eşit değil

**Kaynak analizi:** `LociAR/Features/Social/ActivityView.swift:93`, `nextCursor` değerini `isCurrentLoad` kontrolünden önce yazıyor. Daha yeni yenileme tamamlandıktan sonra eski cevap gelirse öğeler korunurken imleç eskisi olabilir. `DiscoverView.swift:65` ilk yükleme sonucunda aynı istek nesli kontrolünü yapmıyor; loadMore yapıyor. `GifPickerView.swift:68` arama neslini query değiştiği anda değil debounce sonrasında artırıyor; eski sonuç yeni query beklerken kısa süre gösterilebilir ve eski sayfanın devamı yeni sorguyla karışabilir.

**Çözüm:** Her ilk yüklemede ve query/hesap değişiminde ortak istek nesli; yanıtın herhangi bir state alanını değiştirmesinden önce geçerlilik kontrolü. Loading/defer da nesle bağlı olmalı. Yeni saved/collection koruması bu diğer ekranların tamamında varmış gibi raporlanmamalı. Bu üç UI yarışını bu tur XCUITest ile yeniden üretmedim.

### A12–A14 — Daha küçük, güvenli adaylar

- **A12, tanı ile doğrulandı:** `functions/src/counters.ts:86` eşit olsa da hedefi update ediyor. `reconciliation.ts` zaten yalnız farklı alanları yazıyor; aynı mantık event yolunda da kullanılabilir. Receipt silinmez, kaynak sayımı atlanmaz, `applyCountersOnce` dönüşü/aktivite semantiği değiştirilmez. İdempotent artışa kör geçiş önerilmiyor.
- **A13, canlı geçiş:** Aşağıdaki metadata eksikleri çözülmeden yerel yeni onay ve harita oturum optimizasyonu canlı kazanç diye sayılamaz.
- **A14, kaynak analizi ve koşullu hesap:** `UserContextService.swift:117–125` cihaz heartbeat'i 15 dk olsa da tercih yenilemesini 60 sn döngüsünde sürdürüyor. Her tercih çağrısı normal yolda 2 hesap/çit +1 tercih okur; tüm özellikler kapalı olsa da bu döngü var. Örneğin 1.000 kişi ×10 dakika ×3 okuma =30.000 okuma/gün yalnız bu varsayımsal kullanım içindir; canlı trafik sayısı değildir. Tüm özellikler kapalıyken uyarlanabilir yenileme; açılış/ayar/rıza değişiminde hemen refresh önerilir. Konum upload'ının rıza kontrolü ve 120 sn tazeliği gevşetilmez; çapraz cihaz tercih yayılımı ürün davranışı korunmalı.

## Canlı metadata — 23 Ekim, salt okuma

Kaynaklar: gcloud `default` yapılandırması, açık proje `lociar-2f38c`, Functions `us-central1`; Firestore REST'te yalnız iki sistem bayrağını döndüren field mask. Token/secret değerleri kaydedilmedi; kullanıcı postu, profil veya konum belgesi okunmadı.

| Kontrol | Güncel canlı sonuç | Anlamı |
|---|---|---|
| Cloud Functions | 62; listede pozitif minInstanceCount yok | İncelenen Functions envanterinde zorunlu sıcak örnek tabanı görünmüyor; toplam fatura sıfır anlamına gelmez |
| İlgili dört Function | `readPublicContent`, `readNoteDensity`, `onLikeCreated`, `onPostDensityWritten` ACTIVE; görünen updateTime Türkiye saatiyle 18 Ekim | Metadata tek başına kaynak hash eşitliği kanıtı değildir; 23 Ekim yerel uygulaması canlı diye sayılamaz |
| İndeksler | 26/26 READY | Yeni `notification_eligible_at` bileşik indeksi listede yok |
| Onay bayrağı | `system/place_notes` için maskelenmiş GET 404 | Yeni onay modu canlıda etkin diye sayılamaz |
| TTL | 37 ACTIVE | `map_group_sessions` TTL'si listede yok; geçişte ayrıca kurulmalı |
| Scheduler | 7/7 ENABLED | Boşta çalışma ve bakım kaynak taraması ayrıca ölçülmeli |
| Geo sorgu bayrağı | `system/geo_queries.geohash_index_version = 1` | Eski enlem bandı yolu canlıda varsayılanmış gibi tasarruf hesabı yapılmamalı |

Canlı Cloud Run/App Hosting runtime, son iOS dağıtımı, gerçek fatura/egress veya cihaz pil/RAM/GPS bu metadata okumalarıyla ölçülmedi. Admin kaynak yapılandırması `minInstances:0/maxInstances:2`; bu canlı App Hosting parity kanıtı değildir.

## Daha geniş dönüşümler ve elenen kısa yollar

- Günlük yoğunluk onarımı 500 post ve 100 spot seçiyor; spot başına `repairSpotCount` tüm üyeleri okuyabiliyor. “100 spot” toplam 100 okuma demek değil. Kaynak başına iş bütçesi/ilerleme gerekir; güncel üyelik doğruluğu ve gecikmiş tetikleyici onarımı korunmalı.
- Profil public sayımı atfedilen olaylar için azaltıldı; gerçek sayım hâlâ aktif/genel yazar postlarını okuyup anonimlik/legacy alanlarını kodda eliyor. Tutarlı, sürümlü atıf projeksiyonu olmadan eşitlik filtresi eklemek legacy kayıtları düşürebilir.
- Kampanya bölge yolu en fazla 300 aktif kampanyayı konumdan sonra eliyor. Coğrafi dizin ve tamlık gerektirir; `limit` küçültmek yakındaki uygun kampanyayı kaybettirebilir.
- `geohash`/uygunluk-zamanı + açık `__name__` sıralamaları için indeks girdi ücretleri Query Explain ile ayrıca ölçülmeli. Emulator bunları fatura olarak doğrulamaz. Canlı ölçüm yapılmadan fazladan sıralamayı silmek veya kesin kazanç vermek önerilmiyor.
- Admin layout ve sayfa ayrı `requireAdmin` çağrıları yapabiliyor. Aynı RSC isteği içinde session çözümünü paylaşmak aday; farklı isteklerde rol/hesap yetkisi cache'lenmez. Admin liste/analitik iyileştirmeleri önceki planın kalan işleridir, bu tur yeni uygulanmış sayılmaz.
- `SpatialContentRenderer` 30 render/40 asset sayısıyla sınırlı; ayrıca gerçek memory-pressure temizliği **zaten var**. Byte bütçesi ve aynı render miss'ini paylaşma aday; mevcut temizliği yokmuş gibi yeniden önerme. Çevrilmiş metin cache'e/disk'e eklenmez.
- `readNoteDensity.truncated` istemcide kapsam cache'i kararına katılıyor; `MapFeatureView` açık bir kısmi-sonuç durumu göstermiyor. Gerçek truncation halinde eksik ısıyı tam veri sanmayı önleyen, daha yakın zoom isteyen bir gösterim adaydır. Eski sunucuda metadata bulunmaması ile doğrulanmış truncation aynı uyarı sayılmamalı; otomatik tekrar fırtınası yaratılmamalı.
- Statik/CDN ısı dağıtımı kullanıcı başına tekrarları azaltabilir; üretici, invalidasyon, dosya GET, Storage ve eski veri bedeli birlikte ölçülmeli. Okuma azalmış düşük trafik uygulamasına sırf yeni mimari eklemek otomatik net kazanç değildir.
- Kör sayaç increment, uzun süreli aktif-hesap cache'i, direkt istemci post yazması, konum tazeliğini düşürme, eksik grup döndürme ve indeks/TTL'yi hard delete yerine kullanma önerilmiyor. Tekrarlı/sırasız olay sözleşmesi korunmalı. [Firestore olay garantileri](https://docs.cloud.google.com/run/docs/triggering/trigger-functions-with-firestore-documents), [TTL davranışı](https://firebase.google.com/docs/firestore/ttl).

## Önerilen uygulama sırası

1. **A1:** Grup geometrisi ve uzak üyenin toplu izinyle açılması; geçiş ve yeni regresyon.
2. **A2:** GIPHY mevcut akışı için sağlayıcı şartı/istisnası kanıtı; cache önerisini buna bağlama.
3. **A3 + A5:** Telefonda aynı bölge ihtiyacını tekrar geçersizleştirmeme ve geçersiz isteklerde ucuz ret. Bunlar yeni veri dizini gerektirmeden kazanım sağlayabilir.
4. **A4 + A6:** Onayda kalan eşik kadar ilerleme; sayfa yazarları için ilgili taze engeller. Anonimlik ve >200 eşik testleriyle.
5. **A7 + A8:** Grup üyelik/sıra/dönüş yükü ve hard delete bağımlılıklarını birlikte sınırlandırma. A1 düzeltmesinden sonra.
6. **A9–A12 + A14:** Uygun medya/metadata aynı-iş paylaşımı, liste yanıt nesilleri, eşit sayaç yazmasını atlama, uyarlanabilir kapalı-özellik tercih döngüsü.
7. Eşleşen Functions/kurallar/indeks/TTL ve gerekli göçler, ardından iOS ve canlı duman testi. Bu rapor deploy işlemi yapmaz.

## Kanıt ve yeniden çalıştırma

- TypeScript build bu tur geçti.
- **8 gerçek Firestore tanı senaryosu** geçti: `functions/test/diagnostics/cost-second-pass.mjs`. Bu dosya varsayılan test glob'una dahil değildir; başlığı ve sonuçları kalan davranışı yeniden ürettiğini açıklar.
- **2 native mantık tanısı** mevcut Swift gövdeleri değiştirilmeden çıkarılarak Swift 6 ile yürütüldü: `scripts/audit-native-cost-paths.py`. URLProtocol yalnız `.invalid` alanındaki sentetik medya isteğini yanıtladı; dış ağ/gerçek GIPHY, Firebase veya cihaz GPS'i kullanılmadı. Bunlar Xcode UI testi değildir.
- Artefaktlar `build/cost-second-pass-20261023/`: `diagnostic-results.json`, `audited-source-hashes.json`, `firestore-diagnostics.log`, `native-diagnostics.log`, sınırlı canlı metadata ve bayrak sonuçları.
- Önceki 234 native +5 UI ve backend regresyon sonuçları önceki paketin kanıtıdır; bu tur tamamı yeniden çalıştırılmış gibi sunulmaz. Özellikle A1'in yeni geometri senaryosu o yeşil testlerin kapsamı dışındaydı.

```sh
# Repo kökünde, PATH'te Node 22 ve Java 21 ile:
cd functions
npm run build
GCLOUD_PROJECT=demo-lociar firebase emulators:exec --only firestore --project demo-lociar \
  'node --test --test-concurrency=1 test/diagnostics/cost-second-pass.mjs'
cd ..
python3 scripts/audit-native-cost-paths.py
```

Tanı aracı proje/localhost emülatör guard'ı olmadan yazma yapmayı reddeder. Yeni iyileştirmeler uygulanınca bu başlangıç tanılarının sayıları değişmelidir; “eski kötü davranış hâlâ var” assert'leri release kabul kapısı yapılmamalıdır.
