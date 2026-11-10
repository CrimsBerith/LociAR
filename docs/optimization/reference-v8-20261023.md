# LociAR — A'dan Z'ye Optimizasyon Planı

**Sürüm:** 8 — uygulama sonrası derin denetim · **Tarih:** 23 Ekim 2026 · **Durum:** Yerel uygulama korundu; yeni grup geometrisi/okuma bulgusu açık, canlı geçiş yapılmadı
**Kapsam:** Firestore, Cloud Functions, Storage, push, iOS uygulaması (AR, konum, medya, açılış, listeler), admin paneli, dağıtım ve maliyet kontrolü
**Kaynak:** 22 Ekim 2026 yerel checkout `60afbca`, mevcut çalışma ağacı ve resmî Apple/Firebase/Google Cloud belgeleri. Önceki sürümün dayandığı `5c37118` bu checkout'ta bulunmadı; GitHub ve canlı dağıtım eşitliği ayrıca doğrulanacak.
**Sahibin önceliği:** Maliyet önce gelir; harita isteklerini birleştirmek için telefonda yaklaşık 1–2 saniye ek bekleme kabul edilir. Güvenle taşınabilen çizim, önbellek ve yenileme kararları cihazda çalışır.
**Bu sürümde:** Önceki harita koordinatörü korunarak zincir denetimindeki D1–D13'ün güvenli uygulamaları ve O1/O2/O3/O4/O5/O6/O7/O8/O11 işleri eklendi. D12'nin dış sağlayıcı hazırlıklarını öne almama, D11'in 15 sn zamanlayıcısını koruma ve D8'in bağımsız yoğunluk tetikleyicilerini birleştirmeme sınırları aşağıda açıktır. 54 maddenin tamamı bitmiş değildir.

**V8, önce düzeltilmesi gereken bulgu:** Gerçek Firestore emülatöründe sunucu spotuna kenardan eklenen 17 not tek grupta 153 m'ye yayıldı; merkezdeki okuyucu 91 m uzaktaki notun gövdesini de aldı. A1 geometri/okuma düzeltmesi daha fazla cache veya grup dizininden önce gelmeli. Önceki testlerin geçmesi bu yeni senaryoyu kapsadığı anlamına gelmiyor.

**V8 sağlayıcı düzeltmesi:** GIPHY'nin güncel resmî belgesi standart entegrasyon için proxy, URL yeniden yazımı ve izinsiz medya cache'ini kısıtlıyor. Önceki cache önerisi sağlayıcı onayı açısından eksikti; artık özel izin/uygun entegrasyon şartına bağlıdır. AGENTS.md'deki sunucuda anahtar/yayın doğrulaması sözleşmesi değiştirilmedi.

**Yeni derin tarama:** 8 gerçek Firestore + 2 mevcut Swift mantık tanısı kalan davranışları yeniden üretti; bunların geçmesi sağlık/kabul sonucu değildir. TypeScript build geçti. Üretim kodu bu tarama turunda değiştirilmedi. Ayrıntı ve kabul koşulları `docs/release/COST_POST_IMPLEMENTATION_DEEP_AUDIT_2026-10-23.md` ve aşağıdaki §Q'dadır.

**23 Ekim uygulama durumu:**
- **Harita telefonda:** 1,2 sn hareket birleştirme, tek devam eden özet isteği, yalnızca son görünüm kuyruğu, kapsam/boş sonuç bellek cache'i, TTL uzatmayan LRU, oturum/engel/yanıt nesli koruması, %12 zoom histerezisi, sınırlı retry ve arka planda durdurma. Otomatik yakın not gövdeleri açılıştan çıkarıldı; metin kullanıcı açınca güncel sunucu kontrolünden gelir.
- **İlk sayfalar:** Harita grubu ilk 15/devam 50; kaydedilenler ve koleksiyon içeriği ilk/devam 15 ham kenar + bir bakış satırı, sayfa başına tek callable; aktivite ilk 15/devam 50. Bütün listeyi ve öğe başına callable'ı açılışta çalıştırma kaldırıldı. Engellenmiş/silinmiş boş sayfa imleci de ilerler.
- **Diğer cihaz işleri:** Günlük başarılı view alındısı tekrar gönderilmez; GIF aramaları kısa bellek cache'i ve aynı iş paylaşımı kullanır. Avatarlar güncel metadata kontrolünden sonra 16 MiB/64 öğe LRU ve gösterim boyutunda çözülür. AR'ın ayrı son 50 kendi-post sorgusu kaldırıldı. Yerel kuyruk hesap/due koşuluyla en fazla 10 kayıt getirir.
- **Sunucu:** `own_receipt` çift ön kontrolü, push retlerinde geniş paket, rıza kapalı kampanya atamaları, anonim post profil sayımı ve sayaç-only profil tetikleyicisi gereksiz işleri atlar. GIF dış araması paylaşılır; yeni yayın GIF doğrulaması her defasında sağlayıcıdan taze okunur. Bellek kota kapasitesi geçerli sayaçları sıfırlamaz.
- **Onay protokolü:** Mevcut beğeniye yalnız sunucunun yazdığı `notification_eligible_at` ipucu ve bileşik indeks eklendi. Son karar gerçek beğeni/profil/silme durumunu taze kontrol eder. Bayrak eksik/0 iken eski tam tarama sürer; indeks READY + dry-run + apply/doğrulama sonrası açık aktivasyon gerekir. Yeni koleksiyon/TTL yoktur. Üretimde açılmadı.
- **Tekrar ve heartbeat:** Silme worker'ı tamamlanan aşamayı tekrar etmez; spot onarım kimlikleri silmeyle atomik iş kaydına alınır, crash sonrası devam eder. Avatar silme backoff'u kalıcı işi korur. Değişmeyen cihaz ve özel profil verisi tekrar yazılmaz; 15 dk heartbeat vardır. Konumun 120 sn tazeliği ve güncel hesap/rıza kontrolleri değişmez.
- **Ölçülen kontrollü sonuç:** `own_receipt` 5→3; on cihazda push retleri 131→41; promosyon kapalı on atama 42→3 mantıksal okuma; sekiz aynı paralel GIF araması 8→1 dış çağrı. Yeni hesapların 197 onay denetimi 394 nokta okuması + 197 sorgu ve 0 beğeni/profil sonuç satırı üretti; eski sentetik 60.085 sayımıyla aynı fatura ölçümü değildir. Yeni ipucu yazıcısının okuma/yazması, boş sorgu asgarisi ve indeks maliyeti ayrıca sayılır.
- **Önceki uygulama doğrulaması (bu tur tümü yeniden çalıştırılmadı):** Backend 168 birim, 13 gerçek Firestore maliyet/geçiş, 167 tam emülatör, 29 ayrı not ve 89 kural testi geçti. Önceki son build ile 234 native test ve 5/5 gerçek SDK UI senaryosu geçti; fiziksel cihaz isteyen 2 native test atlandı. 16 harita ve 9 cache testi native sayıya dahildir. Kaydedilen/koleksiyon ikinci sayfa ekranları incelendi. Bunlar üretim faturası, fiziksel pil/GPS/APNs veya mağaza kanıtı değildir.
- **Ayrı kalan işler:** Statik/CDN üretimi, diskte genel karolar, coğrafi kampanya/bildirim dizinleri, bütün spotu taramayan grup devam sayfası, geniş sayaç dönüşümü, fiziksel sensör ayarı ve admin işleri. Ek bakım/yazma/dağıtım gideri ölçülmeden otomatik eklenmez.
- **Uygulama/dağıtım kaynağı:** `docs/release/COST_OPTIMIZATION_IMPLEMENTATION_2026-10-23.md`. Harita ayrıntısı `MAP_REQUEST_COST_IMPLEMENTATION_2026-10-23.md`; önceki `COST_CHAIN_DEEP_AUDIT` ve `COST_OPTIMIZATION_OPPORTUNITIES` raporları başlangıç kanıtıdır. Yerel kod canlıya dağıtılmadı; önceki bağımsız ödeme/destek değişiklikleri korundu.

Rakamlar kaynak çıkarımı, hedef veya açıkça belirtilen sentetik kontrol sayımıdır. Sentetik sayılar üretim faturalı okuma, gerçek gecikme veya aylık tasarruf kanıtı değildir. Faz 0'da canlı karşılıkları ayrıca ölçülecek.

---

## İçindekiler

- A. Özet ve hedefler
- B. Yöntemler
- B2. Yükü kim taşır: telefon, statik dağıtım, sunucu
- B3. İlk uygulama paketi ve başlangıç ayarları
- C. Bütün maddeler
- D. Eylem bazında önce ve sonra
- E. Ayrıntılı çözümler: veritabanı, sunucu ve uygulama
- F. Admin paneli
- G. Maliyet modeli: toplam fatura ve duyarlılık
- H. Aşamalar ve kabul ölçütleri
- I. Ölçüm, test ve geri alma
- J. Kapsam matrisi
- K. Değişen davranışlar
- L. Kararlar ve en yararlı seçenekler
- M. Önerilmeyenler
- N. Dağıtım öncesi hesap ve ürün işleri
- O. Güvenlik sözleşmesine uyum (AGENTS.md)
- P. Kanıt durumu ve kaynaklar
- Q. Uygulama sonrası yeni bulgular ve öncelik

---

## A. Özet ve hedefler

Maliyeti azaltmanın ilk yolu aynı veriyi yeniden istememek, sonra her isteğin okuduğu belgeyi azaltmaktır. Tek çağrıda 500 belge okumak 500 belge okumasıdır; yalnızca çağrıları birleştirmek yeterli olmaz.

**Uzun vadeli düzen (statik/CDN henüz uygulanmadı):** Genel ısı görünümü ortak, metinsiz statik karolardan; yakın gruplar kullanıcıya özel sunucu özetlerinden; not gövdesi kullanıcı açtığında güncel sunucu kontrolünden gelir. Isı çizimi ve ekran kümelemesi zaten telefondadır. Yeni kazanç istek planlama, tekrar kullanma ve gereksiz içerik indirmeyi kaldırmaktır.

**22 Ekim yerel başlangıç bulguları:**
- `MapFeatureView.refreshLayer` hareket sonunda 300 ms bekliyor; `NoteDensityClient` veri/istek önbelleği tutmuyor.
- Harita açılışı `nearby` ile ayrıca 1 km'lik gönderi verisi yüklüyor; kamera değişimleri `map_groups` veya `readNoteDensity` çağırıyor.
- `publicContent.ts` yakın aramada gönderileri tarıyor; grup sayfası spot üyelerini yeniden okuyor. Bu checkout'ta `map_cells`, `functions/src/maintenance.ts` ve `admin/lib/maintenance.ts` bulunmadı. Bunlar mevcut özellik diye yazılmayacak.
- `noteDensity.ts` uygun hücrelerde gerçek koordinat ortalamasını döndürüyor. Tek notta bu değer notun konumudur; herkese açık dışa aktarımda sabit hücre merkezine dönüştürülmeli.
- `core.ts` callable üst sınırını 2 olarak tanımlıyor; CPU/eşzamanlılık açıkça belirlenmiyor. Canlı yapılandırma okunmadan tek istek/örnek varsayılmayacak.

**Ölçülebilir hedefler:**

| Alan | Hedef ve kapsam |
|---|---|
| Tekrar gezinme | Taze ve tam kapsanan alandaki 20 ayrı hareket sonunda 0 ek harita ağı isteği |
| Soğuk genel görünüm | Son görünümün eksik karoları; aynı karo için tek devam eden indirme, en fazla 2 paralel HTTP indirmesi |
| Yakın görünüm | En fazla 1 devam eden harita-özet callable'ı ve yalnızca son görünüm için 1 bekleyen iş |
| Birleştirme | Elle harita hareketi bittikten 1,2 sn sonra; otomatik özet çağrılarının başlangıçları arasında en az 2 sn |
| Çizim | Önbellek varsa önce mevcut veri; hedef cihazda ilk çizim p95 ≤300 ms, ölçümle doğrulanır |
| Gecikme | 1–2 sn istemci birleştirmesi kabul edilir; ağ, konum doğrulama ve soğuk başlatma ayrıca ölçülür, 2 sn toplam süre garantisi yok |
| İçerik | Gruba/listeye dokunmadan not gövdesi, yorum, GIF ve AR dünya haritası yüklenmez |
| Genel veri güncelliği | 5 dk üretim + en fazla 5 dk yeniden kullanma: sağlıklı işleyişte yaklaşık 10 dk; arıza ayrıca gösterilir |
| Yakın özet | Bellekte 60 sn; erişim hakkı vermez, not/yorum açılışında güncel yetki ve konum kontrolü kalır |
| Toplam kullanım | Aynı senaryoda okuma/yazma/çağrı/byte önce-sonra ölçülür; 300 ve 700 okuma/DAU/gün §G duyarlılık girdileridir |
| Sabit gider | Başlangıçta `minInstances: 0`; Redis, ayrı yük dengeleyici/CDN veya sıcak örnek için sabit gider eklenmez |
| Güvenlik | Anonimlik, engeller, rıza iptali, yoğunluk sınırı ve hard delete testleri geçer |

100 × 700 = 70.000 okuma/gün olduğundan “100 kullanıcı ücretsiz kotada” sözü verilmez. Ücretsiz pay bakım işleriyle de paylaşılır. Önceki ~14 $ toplam fatura ve 7–9 kat tasarruf iddiaları ölçülmüş sonuç değildir; §G bunları bileşen bazında yeniden kurar.

---

## B. Yöntemler

| Yöntem | Karar | Maddeler |
|---|---|---|
| Telefonda istek koordinatörü | Hareketleri birleştir, taze kapsamı tekrar isteme, aynı işi paylaş, yalnızca son görünümü sırada tut | 2, 21, 31, 32, 54 |
| Talep üzerine içerik | Genel harita için gövdeler okunmaz; liste, yorum ve medya kullanıcı açtığında gelir | 1, 23, 36, 41, 53 |
| Ortak statik karolar | Güvenli genel veri bir kez hazırlanır; küçük ölçekte mevcut statik dağıtım veya Storage yerleşik önbelleği karşılaştırılır | 2, 52 |
| Toplu ve sınırlı okuma | Aynı istek içindeki yetki/engel/yazar okumaları tekilleştirilir; sorgunun taradığı kayıtlar da ölçülür | 4, 5, 8, 19, 41, 42 |
| Güvenli türetilmiş dizin | Boyutu ve sıcak belge yükü sınırlandırılır; yetki/rıza/kota için gecikmeli dizin güven kaynağı olmaz | 3, 4, 10, 20, 24, 25, 45, 46 |
| Tekrar güvenli yazma | Alındı, sayaç, işlenme ve ilerleme birlikte tasarlanır; gece onarımı yarışları gizlemez | 6, 7, 12, 13 |
| Görsel önbellek / erişim ayrımı | Genel ısı diskte; kişiye özel grup özeti bellekte; metin ve çeviri diske yazılmaz | 15, 22, 31, 32, 38 |
| Sensör ve medya bütçesi | Konum yalnızca gerekli doğrulukta; görünmeyen medya indirilmez; cihazda ölçülür | 9, 34–37, 39, 40 |
| Ölçüm ve geri alma | Ek okuma/yazma ve statik üretim bedeli dahil toplam kazanç; kaynak bazında bayrak ve protokol sürümü | 28, 49, 51, 54 |

**Dizin geçişi:** Kaynak gerçek kalır → tekrar güvenli güncelleme başlar → sınırlı/imleçli doldurma → eski/yeni sonuç karşılaştırması → doğrulanmış tamamlanma → küçük trafik → kademeli açılış. Geri alma sırasında eski ve yeni tetikleyicilerin aynı sayacı iki kez artırmaması test edilir.

**Zamanlayıcılar:** Bu checkout'ta farklı dosyalarda zamanlanmış işler var; “mevcut üç bakım işi” iddiası doğrulanmadı. Önce envanter çıkarılır. Yeni periyodik sorumluluklar uygun mevcut işe eklenir; gerekiyorsa ortak bakım yöneticisi ayrı değişiklik olarak kurulur. Henüz olmayan dosya/fonksiyon/test, mevcut özellik gibi gösterilmez.

**Boyut:** Büyüyen harita/array alanları için parça kimliği, üst sınır ve imleç gerekir. 1 MiB belge sınırı ve indeks büyümesi, özellikle `viewer_state`, `note_regions`, `place_note_seen`, `campaign_zone_index` ve okuma alındılarında test edilir. [Firestore sınırları](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields).

---

## B2. Yükü kim taşır: telefon, statik dağıtım, sunucu

| İş | Nerede çalışır? | Maliyet ve güvenlik gerekçesi |
|---|---|---|
| Harita hareketi, ekran kapsamı, yakınlaştırma kararı | Telefon | Her kamera olayı ağ isteğine dönüşmez |
| Isı çizimi ve ekran üstü kümeleme | Telefon; zaten mevcut | Aynı karolarla farklı görünümler yeniden hesaplanır |
| Genel p4–p6 ısı karoları | Ortak statik dosya + cihaz önbelleği | Kullanıcı başına Firestore/Functions yok; üretim, GET ve veri çıkışı vardır |
| p7 ısı, yakın gruplar ve hassas özetler | Sunucu; cihazda kısa ömürlü kişiye özel görsel önbellek | Kesin konumları/yazar bağlarını herkese açmadan güncel süzgeç uygulanır |
| Not/yorum gövdesi ve yerinde okuma | Sunucu yetkilendirir; telefon bellekte gösterir | Eski karo veya önbellek bir erişim hakkı değildir |
| Sayaçlar, kotalar, yoğunluk, rıza, moderasyon | Sunucu | İstemciye güvenilmez; başarısız callable doğrudan yazmaya dönüşmez |
| Çeviri, uygun görsel küçültme ve oynatma | Telefon | Apple Translation politikası ve GIPHY/SafeSearch kuralları korunur |
| Bölge bildirimi adayları ve tekrar kontrolü | Sunucu; cihaz yalnızca yetkili sonucu izler | Anonim yazarı bulduracak aday/süzgeç farkı oluşmaz |

**Karma model tercih edilir.** Bütün notların kimliğini/konumunu şehrin tek dosyasına koymak ve engelleri telefonda çözmek kabul edilmez. Yalnızca genel, kaba, kimliksiz ısı dosyaları ortaktır. İki seçeneğin “ayda 8 $ farkı” gibi rakamları henüz doğrulanmış olmadığı için karar gerekçesinden çıkarıldı.

İstek sayısı ile okuma sayısı ayrı ölçülür: tek `getAll` içindeki N belge N okumadır; `ETag`/304 de bir HTTP isteğidir. En ucuz istek, taze cihaz verisi sayesinde hiç gönderilmeyendir. [Firestore faturalandırması](https://firebase.google.com/docs/firestore/pricing).

Cloud Storage yerleşik önbelleği küçük trafikte ek Cloud CDN/yük dengeleyici maliyetinden kaçınabilir; istek ve çıkış maliyetleri sürer. Ayrı CDN kurulumu ancak toplam maliyeti düşürdüğü ölçülürse seçilir. [Google Cloud önbellek karşılaştırması](https://cloud.google.com/storage/docs/caching).

---

## B3. İlk uygulama paketi ve başlangıç ayarları

1. Yerel başlangıç senaryolarını kaydet; canlı yapılandırmayı ve maliyet bileşenlerini ayrı raporla.
2. **54 + 2B:** Koordinatör, aynı isteği paylaşma, kapsam önbelleği, nesil kontrolü ve hata beklemesi. Mevcut callable'larla başlar; istemci değişikliği sunucu sorgusunu kendiliğinden karo sorgusuna dönüştürmez.
3. **1 + 33 + 41 + 42:** Tüm listeyi okuma ve tekrarlanan başlangıç/öğe çağrılarını kaldır.
4. **23 + 53:** Harita açılışındaki otomatik gövde yüklemesini kaldır; kullanıcı açınca 15 satır.
5. **8 + 2A:** Kapsamı ve sayfa başına taramayı gerçekten sınırlayan sunucu protokolü/dizini ekle.
6. **52:** Güvenli statik karoları, üretim+dağıtım toplamı ekonomik olduğunda aç. Tüm harita optimizasyonu bunu beklemez.

**Harita sonrası küçük paket sırası:** `own_receipt` çift hesap okuması (D4), GIPHY'de aynı dış aramayı paylaşma (D3), push retlerini önce çözme (D2), kampanya rızasıyla erken çıkma (D5); önceki O1/O2 ve cihaz O3/O5/O6 işleriyle birlikte. **13/D1 protokolü yerelde uygulandı:** yeni hesap beğenilerinde geçmiş taramasını azaltan ipucu yolu yaş/iptal/tekrar testleriyle doğrulandı; üretimde indeks/backfill sonrası bayrakla açılır. D kimlikleri zincir raporuna aittir; yerel uygulama tamamlandı, sınırlar ve aktivasyon §13/16/24 ile uygulama raporundadır.
**Uygulanan sözleşme düzeltmesi:** D13'te yayın anındaki tamamlanmış eski GIF doğrulama cache'i kaldırıldı; arama/trend cache'i korunabilir. Güvenlik kararı telefona veya eski arama sonucuna devredilmez. Bu gerekli sağlayıcı okumasını azaltılmış maliyet gibi göstermeyiz.

| Ayar | Başlangıç değeri | Anlamı |
|---|---|---|
| Elle hareket sonrası bekleme | 1.200 ms | Son kullanıcı hareketinden itibaren; UI çizimi beklemez |
| Önbelleksiz ilk sabit görünüm | 200 ms | Otomatik açılış yerleşmesini birleştirir; kullanıcı hareket ederse 1.200 ms uygulanır |
| Otomatik özet başlangıç aralığı | ≥2.000 ms | Son başarısız/başarılı başlangıca göre; gruba dokunma erişim kontrolünü geciktirmez |
| Yakınlaştırma kararlılığı | Eşik çevresinde %12 histerezis | 300 m / 1 / 5 / 50 / 500 km sınırında gidip gelmeyi önler |
| Sorgu çevre payı | Her kenarda görünür boyutun %5'i | Doğrusal boyut 1,10×; kutu alanı yaklaşık 1,21×. Yoğun yerde kazanç yoksa kapatılır |
| Harita özeti eşzamanlılığı | 1 callable + yalnızca son bekleyen görünüm | Eski görünümlerden sınırsız kuyruk oluşmaz |
| Genel dosya indirmesi | En fazla 2 paralel, aynı anahtarda tek iş | Yeni alanın gerekli karoları önce; spekülatif şehir indirmesi yok |
| Genel karo yenilik süresi | 5 dk | Kaynak üretim yaşı ve HTTP Age ile birlikte hesaplanır; her hareket HEAD/GET üretmez |
| Yakın kişisel özet | 60 sn, yalnızca bellek | Kullanıcı/oturum/görünürlük nesliyle ayrılır; yeni erişim vermez |
| Genel disk önbelleği | En fazla 20 MiB, 24 saat saklama | 24 saat saklama yenilik süresi değildir; eski genel veri arızada tarihli gösterilebilir |
| İlk liste / grup / yorum | 15 satır | Sonraki sayfa kullanıcı kaydırınca; arka planda bütün sayfalar okunmaz |
| Otomatik hata tekrarları | En fazla 3; ardından ≥60 sn devre kesici | Kamera hareketi sayacı sıfırlamaz; süre bitimi tek başına poll değildir |
| Sıcak örnek | `minInstances: 0` | Başlangıç kararı; sonraki artış ölçüm ve toplam bütçeye bağlı |

Bu ayarlar plan başlangıcıdır, en iyi oldukları kanıtlanmış sabitler değildir. Düşük güç modu ve hücresel ağda spekülatif ön yükleme kapalıdır. 54'teki senaryolar ölçülerek yalnızca gerekli ayar değiştirilir.

---

## C. Bütün maddeler

Boyutlar göreli kapsamı gösterir: **K** küçük, **O** orta, **B** büyük. Güvenlik, emülatör, cihaz ve geçiş doğrulaması süreye dahildir; yarım gün/bir gün teslim sözü değildir. Sayılar aksi belirtilmedikçe v4 kod-yolu tahminidir; gerçek maliyet Faz 0'da ölçülür. Aşamalar §H'de. Tablodaki 0, belirtilen ek işlem içindir; bütün çağrının veya toplam faturanın sıfır olduğu anlamına gelmez.

### C1. Veritabanı okuma yolları

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 1 | Gönderi açılışında kullanıcının bütün beğeni ve kayıt listesi, profilde bütün takip listesi okunuyor; beğeni sayısı için ayrı çağrı | 15 + beğeni + kayıt sayısı (~185 tipik) | Yalnızca ilgili tek belge (`likes`, `post_saves`, `follows`); sayılar satırdan | 3–8 | K | 1B |
| 2 | Her kutu tekrar sorgulanıyor | Çok sayıda hücre belgesi | Önce kapsam/cache koordinatörü, sonra gerçek karo protokolü ve ortak dosyalar | Taze kapsamda 0 ek istek; yeni alanda kaynak maliyeti | B | 1A–3 |
| 3 | Bildirim senkronu çok aday okuyor | 400–900 örnek tahmin | Parçalı note_regions/seen + dar konular ve birleştirme | Parça/yazar/izin dahil ölçülür | B | 3 |
| 4 | Hesap/engel okumaları alt yollarda tekrarlanıyor | ≥5 + engel sayısı | Aynı istekte güncel bağlam; tutarlı projeksiyon varsa tek belge | Tekrarlar azalır; eski yetkiyle izin yok | O | 2 |
| 5 | Yazar tekrar kontrolü | Yazar başına çoklu okuma | Tekilleştirilmiş güncel account_access; göç tutarlılığı | Tekil yazar başına gerekli taze okuma | O | 2 |
| 8 | Her grup sayfasında tam üyelik yeniden okunuyor | Spotun tümü | Sabit sıra oturumu + sonraki sayfada seçili 15 kimlik | Sonraki sayfada sınırlı okuma | B | 2 |
| 10 | Kampanya senkronu çok kayıt okuyor | 300 adaya kadar | Sınırlı dizin parçaları + yakın ilerleme | Parça/erişim maliyetiyle ölçülür | O | 3 |
| 11 | Ayar belgeleri (`system/*`) alt yollarda tekrarlanıyor | Çağrı başına 1–4 | Yalnızca sunum ayarlarında sınırlı bellek; güvenlik kararları taze | Sunum tekrarları azalır; tüm kontroller 0 olmaz | K | 1B |
| 20 | Gönderi ve not oluşturmada bütün aktif korumalı bölgeler okunuyor | Bölge sayısı kadar | Bölgelere `cover_cells`; hücre sorgusu (taze, transaction içinde) | 0–3 | O | 3 |
| 22 | Keşfet ham adayları tekrar okunuyor | 51 aday + izinler | 30 sn ham aday paylaşımı; güncel görünürlük | Yalnızca aday tekrarları azalır | O | 1B |
| 24 | Yoğunluk taraması pahalı | Tarama + 27 kilit okuması | Taze kabulü koru; atomik üyelik olmadan +5 kısayolu yok | Güvenli protokol sonrası ölç | B | 3 |
| 41 | Kayıt/koleksiyon öğesi başına çağrı | 100 kayıt → çok çağrı | Tek sayfa, toplu gövde ve ortak taze bağlam | Sayfa başına 1 çağrı + gerekli okumalar | O | 1B |
| 42 | Etkinlikte kayıt başına tekrar kontrol | Sayfa boyutuyla büyüyor | 15 satır ve tekilleştirilmiş güncel bağlam | Sayfa maliyeti ölçülür | O | 1B |
| 52 | Genel görünüm kullanıcı başına sunucu çalıştırıyor | Hücre/kutu sorguları | Ekonomikse kimliksiz statik karolar | Tüketimde 0 Firestore/Functions; GET/çıkış var | O | 3 |
| 53 | Görülmeyen listeler ve büyük sayfalar | 50–100 satır / tam tarama | Talep üzerine 15 satır; sunucu taraması ayrıca düzeltilir | Yüzde sözü yerine ölçüm | O | 1B |

### C2. Yazma, tetikleyici ve arka plan işleri

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 6 | Kaynak yeniden sayımı pahalı | İş yüküne bağlı | Tekrar/onarım güvenliği kanıtlanınca atomik artış | Protokole göre ölçülür | B | 4 |
| 7 | Görüntülenme post üzerinde sık yazıyor | Alındı + post + trigger | Günlük tekil alındı ve atomik işlenme/ilerleme | Gecikmeli toplama; bakım gideri dahil | B | 4 |
| 12 | İki post tetikleyicisi | İki invocation; bazı erken çıkışlar zaten var | Tekrar güvenli adımlar ve kontrollü birleşme | Olay bazında ölçülür | O | 4 |
| 13 | Onaylanmayan notta eski beğeniler her artışta yeniden taranıyor | 199 yeni hesap için tek kontrolde 599 mantıksal okuma (sentetik) | Üyelik/yaş ilerlemesi; son onayda taze doğrulama | Sınırlı iş hedefi; sabit üç okuma kanıtlanmadı | O | 1B tasarım / 2 geçiş |
| 14 | Profil tetikleyicisi yalnızca sayaç değişse bile transaction açıyor | Sayaç-only olayda 3 hesap okuması doğrulandı | Bilinen sayaç alanlarında erken çıkış | Bu olayın hesap transaction'ı atlanır | K | 1B |
| 16 | Bazı bakım/silme yolları tamamlanan işi veya aynı spotu tekrar tarıyor | İş/arıza/spot sayısına bağlı | Aşama ilerlemesi, spot tekilleştirme, güvenli backoff | Kuyruk bazında önce/sonra ölçülür | O | 1B–2 |
| 18 | *(Ürün kararı)* Her beğeni ayrı aktivite ve push | Beğeni başına 1 push | Gönderi başına saatlik özet | Push çok azalır | O | 4 |
| 19 | Push'ta ucuz retler geniş belge paketinden sonra | 10 cihazlı ret örneğinde 131 mantıksal okuma, 0 gönderim (sentetik) | Aynı transaction'da alındı/tercih/kotayı önce çöz | Rette azalır; izin yolundaki taze kontroller korunur | O | 1B |
| 25 | Okunan not başına alındı | Sayfa boyutuna bağlı | 15 satır; gerekirse sınırlı, not başına süreli alındı parçaları | Ölçülen parça sayısı kadar yazma | O | 2 |
| 43 | Kullanıcı adı değişince adı göstermeyen anonim gönderilere de yazılıyor | Gönderi sayısı kadar yazma + 2× tetikleyici | Anonim gönderilere yazılmaz | Çoğu yazma kalkar | K | 1B |

### C3. Sunucu kapasitesi, hız ve çağrı sayısı

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 17 | Kapasite ayarı canlı envanterle eşleşmiyor | Yerelde maxInstances 1/2; concurrency belirsiz | minInstances 0, sorgu azaltma, yük testine göre CPU/concurrency | Sabit gider eklemeden ölç | O | 4 |
| 21 | Aynı ihtiyaç birden fazla çağrı doğuruyor | near/group ve bölge çağrıları | Koordinatör ve ortak güncel bağlam; yalnızca gerekli paket | Daha az tekrar ve tarama | O | 1A–3 |
| 23 | Harita açılırken tam gönderi listesi okunuyor | 100 adede kadar gövde | Önce özet; liste açılırsa 15 satır | Kapalı listede gövde okuması 0 | O | 1B |
| 26 | Aynı GIF araması cihazda ve sunucu cache dolarken tekrar ediyor | 8 paralel aynı arama → 8 dış çağrı (sentetik); sıcak sunucu cache'i 3 okuma + 1 yazma | Cihaz sonuç belleği + süreçte devam eden dış isteği paylaşma | Cihaz isabetinde çağrı önlenir; sunucuda yalnızca dış çağrı paylaşılır | K | 1B |
| 30 | Ağır başlangıç ve soğuk çağrı | Ölçülecek | Lazy bağımlılık; REST karşılaştırması; minInstances 0 | Boşta gider eklenmez | K | 1B |
| 33 | İlk auth tekrarı azaltıldı; gerçek background dönüşünde `ensureProfile` halen yazıyor | Auth getUser + hesap/private/handle okumaları; private/access yazması | Okuma ağırlıklı oturum yenileme ve seyrek heartbeat; kimlik/terms çitleri taze | Gereksiz yazmalar azalır; taze kontrol sıfır sayılmaz | O | 1B |

### C4. iOS uygulaması (hız, pil, veri)

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 9 | Veri paylaşımı açıkken her dakika tercih, konum/cihaz ve analitik işi | Taze konum açık çevrimde 3 tercih + 5 upload okuması, en çok 3 upload yazması | Statik cihaz değişiklikleri/heartbeat ve amaçla sınırlı taze konumu ayrı planla | İzin/aktif kampanya koşullarıyla ölçülür; sabit saatlik sayı yok | O | 1B |
| 15 | AR her açılışta kendi son 50 gönderini okuyor; yakındakiler önbelleksiz | AR açılışı başına 50'ye kadar ek belge | Kendi yakın/yerel taslağını kaybetmeden fazladan listeyi kaldır | Ek liste önlenir; medya/yetki kontrolleri ayrıca | K | 1B |
| 31 | Ekran yenilerken boş kalıyor / tekrar istiyor | Gereksiz bekleme | Taze görsel cache'te ağ yok; erişim ayrı | Daha az tekrar ve boş ekran | O | 1A |
| 32 | Genel veri tekrar indiriliyor | Diskte uygun cache yok | Yalnızca kaba genel veri; 20 MiB/LRU/24 saat | Taze isabetlerde ağ yok | O | 1A–3 |
| 34 | LiDAR örgüsü her AR oturumunda açık, ama yalnızca tanılama sayacında kullanılıyor | Sürekli ek CPU/GPU, ısınma | Örgü kapalı (tanılamada açık); saha testi | Daha az pil ve ısınma | K | 1B |
| 35 | Harita ekranında GPS en yüksek doğrulukta, süzgeçsiz ve pusulayla sürekli açık | Yüksek pil | İlk konumdan sonra 10 m / 25 m; pusula gerektiğinde | Pil tasarrufu | K | 1B |
| 36 | AR orijinal boyutta GIPHY MP4'ü, kartlar `200w.gif` indiriyor | Büyük indirme ve çözme | Küçük MP4 sürümü; kartlarda MP4/WebP | Daha az veri ve pil | K | 3 |
| 37 | Avatar cache'i öğe sayılı, aynı byte indirmesi paylaşılmıyor | 101 × <3 MiB teorik sıkıştırılmış veri sınırı; fiziksel ölçüm yok | Byte LRU, aynı indirmeyi paylaşma, uygun decode; güncel metadata kontrolünü koru | Daha az tekrar indirme ve kontrollü telefon belleği | K | 1B |
| 38 | Parça erişim kontrolü tekrarlanıyor | Dosya/izin yoluna bağlı | Oturum + güncel iptal; görünürken indirme | İzin güvenliğiyle ölçülür | O | 3 |
| 39 | Uzun listeler tembel olmayan `VStack` ile çiziliyor | Bütün satırlar aynı anda | `LazyVStack` | Akıcı kaydırma | K | 1B |
| 40 | Cihazda performans ölçümü yok | Kör optimizasyon | MetricKit + Xcode Organizer | Kanıtlı iyileşme | K | 0 |
| 54 | Her kamera olayı yeni iş doğurabiliyor | 300 ms; kapsam/iş paylaşımı yok | Tek koordinatör, 1,2 sn, tam kapsam, son plan, nesil kontrolü | Taze kapsamda 20 harekette 0 ek ağ | B | 1A |


### C5. Admin paneli (§F)

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 44 | Liste sayfaları varsayılan 100 kayıt okuyor; yerler sayfası iki listeyi birden yüklüyor | Sayfa başı ~100–200 okuma | Varsayılan 25; ikinci liste sekmeyle | ~25 | K | 1B |
| 45 | Admin araması yalnızca mevcut sayfada | Bellekte filtre | Kapsamı açık kelime/önek dizini ve ID arama | 25 satırlık sorgu; dizin gideri dahil | O | 2 |
| 46 | Analitik her açılışta 500 ham olay + iki aggregate okuyor | Sayfa özeti mevcut UI'da doğru sınırlanıyor | Küçük ham sayfa; global rapor gerekiyorsa günlük özet | Özet üretimi/onarımı dahil ölçülür | O | 2 |
| 47 | Admin layout ve sayfa aynı oturumu ayrı çözüyor | Oturum yoluna bağlı tekrarlar | Yalnızca aynı RSC isteğinde çözümü paylaş; permission/AAL2 ayrı | Tekrarlanan doğrulamalar azalır | K | 1B |
| 48 | Yasal sayfalar origin/proxy bağımlı | Kesinti riski | Gerçek statik origin ve cache/bütçe kesinti testi | Kanıtlanan erişilebilirlik | O | 1B |
| 49 | Optimizasyonu yönetecek ekran yok (dizin bayrakları, doldurma ilerlemesi, kullanım, bütçe) | Konsol gerekiyor (2SV kilitli) | "Sistem sağlığı" sayfası: bayrak aç/kapa (denetimli), ilerleme, günlük okuma/yazma | Konsolsuz yönetim | O | 2 |
| 50 | Yeni şikâyet ve otomatik gizlenen içerik için moderatör uyarısı yok | 24 saat kuralı kaçabilir | E-posta uyarısı + günlük özet | Zamanında müdahale | K | 2 |

### C6. Altyapı, maliyet kontrolü ve dağıtım

| # | Sorun | Başlangıç (≈) | Çözüm | Sonra (≈) | Boyut | Aşama |
|---|---|---|---|---|---|---|
| 27 | Kapsayıcı imajları için temizleme politikası yok | Depolama ücreti birikir | `firebase functions:artifacts:setpolicy` (1 gün) | Sabit, küçük | K | 3 |
| 28 | Okuma maliyeti ölçülmüyor; bütçe uyarısı yok | — | Çağrı başına okuma logu, bütçe uyarıları, hedefler | — | K | 0 |
| 29 | Sorgulanmayan büyük alanlar indeksleniyor | İndeks depolama/fanout | Yeni veri modeliyle birlikte gerekli muafiyet | Depolama/gecikme azalır | K | 1B |
| 51 | Dağıtım sonrası callable erişimi ve temel akışlar doğrulanmıyor (18 Ekim'de 4 callable 403) | Sessiz kırılma | Her callable için public invoker kontrolü + duman testi | Kırılma dağıtımda yakalanır | K | 1B |

---

## D. Eylem bazında önce ve sonra

| Eylem | Doğrulanan başlangıç / v4 tahmini | Uygulama veya açık hedef |
|---|---|---|
| Taze genel karo içinde 20 ayrı hareket | Hareket sonlarında tekrar sorgu; 300 ms bekleme | 0 ek HTTP, callable ve Firestore okuması |
| Soğuk genel görünüm | `readNoteDensity` sorguları | Yalnızca son alanın eksik statik karoları; kullanıcı başına 0 Firestore/Functions, dosya GET maliyeti var |
| Yeni yakın alan | `map_groups` yeniden sorgusu | 1,2 sn birleştirme; 1 devam eden iş, tam kapsam varsa tekrar sorgu yok |
| Harita açılışı | `nearby` ile gövdeler + kamera katmanı sorgusu | Isı/özet önce; liste açılmadan gövde/yorum/medya okunmaz |
| Grup sayfası | 50 satır dönse de spotun tümü taranabiliyor | Sırası dondurulmuş oturumda 15 satır; sonraki sayfada yalnızca seçili üyeler + gerekli taze kontroller |
| Gönderi açma | Bütün beğeni/kayıt listeleri ve ayrı sayaç çağrısı | İlgili üyelik belgeleri; yorum kullanıcı açınca; erişim taze |
| Kaydedilenler / etkinlik | Öğe başına çağrı ve tekrarlanan kontroller | Tek sayfa çağrısı, tekilleştirilmiş yetki/yazar/gönderi okuması |
| Bildirim senkronu | Çok sayıda aday ve geniş konu | Dar alanlar, süreli birleştirme, gerçek sunucu gönderim sayısı ölçümü; iOS teslim süresi garanti edilmez |
| Görüntülenme | Gönderi üzerinde her görüntülemede yazma | Tekil alındı ve tekrar güvenli toplama; işlenme/ilerleme de maliyete dahil |
| Soğuk açılış / kısa dönüş | Tekrarlanan `ensureProfile` | Devam eden çağrı paylaşılır; kısa dönüşte gereksiz yazma yok |
| Genel ısı verisinin yaşı | İstek anına yakın kaynak | Normal işleyişte yaklaşık 10 dk; arızada yaşı açık gösterilir |
| Sunucu ilk çağrısı | Soğuk başlatma olabilir | `minInstances: 0` korunur; kullanıcıya önce mevcut görsel veri |
| AR ve medya | Görünmeyen veriler de indirilebiliyor | Görünür içeriğe göre dosya/sürüm seçimi; saha ölçümü |
| Admin listeleri / analitik | 100–500 kayıt örnekleri | 25 satır / günlük özet; bakım üretim maliyeti ayrıca |
| Yasal sayfalar | Sunucu/proxy bağımlılığı riski | Statik dağıtım ve bütçe kesintisi senaryosu doğrulanır |

Bu tablo uygulanan adımlarla henüz açık hedefleri birlikte gösterir; güncel durum üst kayıtta ve ilgili bölümde ayrılır; “tek çağrı = tek okuma” veya “0 ek çağrı = bütün uygulama ücretsiz” anlamına gelmez.

---

## E. Ayrıntılı çözümler: veritabanı, sunucu ve uygulama

### 1. Gönderi açılışı ve üyelik kontrolleri

- **Sorun:**
  - `PostPreviewView.load()` her açılışta şunları yapıyor:
    - `savedPostIDs` ve `likedPostIDs` ile kullanıcının bütün kayıt ve beğeni belgelerini okuyor.
    - `collections(for:)` ile bütün koleksiyonlarını okuyor.
    - `readLikeCount` (~8 okuma) ve `recordPostView` (~6 okuma) çağırıyor.
  - `PublicProfileView` "takip ediyor muyum?" sorusu için `followingIDs` ile bütün takip listesini okuyor.
- **Çözüm:**
  - `likes/{post}_{user}`, `post_saves/{user}_{post}` ve `follows/{viewer}_{target}` belgeleri tek tek okunur (1'er okuma). Kurallar olmayan belgeye `get` izni zaten veriyor.
  - Beğeni sayısı satırdan alınır. `recordPostView` cevabına `likes`, `comments`, `views` eklenir. `readLikeCount` uygulamadan kalkar; eski sürümler için sunucuda durur.
  - Koleksiyonlar yalnızca "koleksiyona ekle" sayfası açılınca yüklenir.
- **Test:** Depo metotları için iOS birim testleri; beğen, kaydet ve takip akışlarının UI testleri.
- **Kazanç:** Açılış başına 15 + beğeni + kayıt sayısı → 3–8 okuma; profil başına takip sayısı → 1.

### 2. Isı haritası: tekrar kullanılabilir kapsam ve karo verisi

- **Sorun:** `NoteDensityClient` her kutu için yeni istek yapıyor; mevcut sunucu önek sorguları belge tarıyor. Küçük cevap, küçük okuma maliyeti demek değil.
- **B — önce istemci (aşama 1):** 54'teki koordinatör mevcut callable sonucunu tam sorgu kapsamıyla saklar. Her render bunu yeniden kullanır. Kesilmiş (`truncated`) sonuç tam kapsam sayılmaz. Sunucudan `complete`, gerçek `coverage`, `generatedAt` ve veri sürümü alınır; eski sunucu cevabı için tamlık varsayılmaz.
- **A — sonra veri modeli (aşama 2):** `density_tiles/{version}_{p}_{parent}`; p4–p7 için üst önek p−2, 1.024 alt hücre üst sınırı. Sorgulanmayan iç haritalar indeks dışıdır. İstek yalnızca eksik karo kimliklerini ister; callable yükü ve belge/byte sınırı doğrulanır.
- Her değişiklikte bütün üst karolara körlemesine +4 yazma zorunluluğu yoktur. Alt hücre/member güncellemesi tekrar güvenli kalır; ortak üst karolar ölçülen çakışmaya göre biriktirilir/parçalanır. Sabit “1 yazma/sn” eşiği kullanılmaz.
- **C — ortak dağıtım (52):** p4–p6 yalnızca sabit geohash merkezleri ve genel sayımlar. p7 ve gruplar sunucuda kalır. Tek notta gerçek ortalama dışa aktarılmaz.
- **Kapsam/limit:** Görünür alan artı küçük kenar payı; en fazla 8 kaynak karo/plan veya tek boyut sınırlı genel overview ve sıkıştırılmış toplam 256 KiB başlangıç bütçesi. Taşarsa genel görünüm desteklenen daha kaba overview düzeyine iner; hassas yakın gruplarda daha kaba veriden sahte grup üretilmez. Parçalı sonuç eksik olarak işaretlenir.
- **Test:** Eski/yeni sayımlar, boş/kesilmiş karo, 180° sınırı, kutup, sıcak belge ve görünür alanın eksiksizliği. Dizin okuması, belge sayısı ve üretim yazmaları birlikte ölçülür.
- **Kazanç:** Taze kapsam içinde 0 ek istek. Yeni alanda okuma sayısı kaynak karo ve yetki kontrollerine bağlıdır; mevcut kod için 0–4 toplam okuma sözü verilmez.

### 3. Bildirim bölgeleri ve alan push sürüsü

- **Sorun:**
  - Her senkronda `readPlaceNoteRegions` şunları okuyor:
    - `approvedNear` ile 3 km içindeki bütün onaylı notlar.
    - `unseenNotes` ile her aday için bir alındı.
    - `readableNoteIds` ile yazar başına 2–4 belge.
    - Yoğun noktalar ve onların alındıları.
  - Onayda `refreshArea`, geohash-4 konusundaki (~39 × 20 km) bütün telefonlara anında sessiz push gönderiyor.
- **Çözüm:**
  - **Dizin:** `note_regions/{geohash5}` belgeleri (~4,9 × 4,9 km).
    - Sunucuya özel, parça ve boyut sınırlı kayıtlar: `[lat, lng, yarıçap, beğeniKovası, oluşturulmaSn, creatorId, anonim, spotId]`. Yazar/anonim alanlar istemciye gönderilmez.
    - Gönderi tetikleyicisi günceller.
    - Beğeni yerine `floor(log2(beğeni + 1))` kovası tutulur; dizin yalnızca kova değişince yazılır.
    - Senkron coğrafi sınır ve parça sayısı kadar belge okur; 4–9 yalnızca küçük örnek senaryodur.
  - **Gördüklerim:** `place_note_seen` zaman kovası ve sınırlı parçalarda bildirim alınan not/noktaları tutar; tek belge sınırsız büyümez. `recordPlaceNoteVisit` aynı transaction'da günceller. Tek gönderimin asıl güvencesi alındılardır.
  - **Yazar ve engel:** 4 ve 5'teki tekilleştirilmiş güncel bağlamla; anonimlik fark testleri korunur.
  - **Sürü önleme:**
    - Konular geohash-5'e daraltılır; push 3 km'lik çembere değen 4–9 küçük konuya gider.
    - Geçişte sunucu eski `area_` konularına da gönderir; uygulama `area5_` konusuna abone olur.
    - Onayda `area_refresh_queue/{konu}` belgesine yazılır; 5 dakikalık `area_refresh` görevi kirli konu başına tek push gönderir.
    - iOS push sonrası 0–30 sn rastgele bekler; son senkron 5 dakikadan yeniyse ve bölge değişmediyse atlar.
  - `recordPlaceNoteVisit` adayları da aynı dizinden okur.
- **Test:** Eski yol ile dizinin aynı sonucu verdiğini gösteren emülatör testi (engeller ve anonim gizleme dahil); alındıların tek gönderimi koruduğunu gösteren test; kova birim testi; `anonymous.test.mjs` karşılaştırma testi.
- **Değişen davranış:** Yeni onaylanan not ilgili telefonlara sunucu tarafından yaklaşık 5 dk penceresinde yenilemeye aday olur; iOS arka plan teslim zamanı garanti edilmez.
- **Kazanç:** V4 örneği 400–900 okuma; yeni parça/yazar/izin okumaları ve gerçekten uyanan telefon sayısı staging/cihazda ölçülür. 10–15 okuma veya 5–10 kat kazanç garanti değildir.

### 4. Hesap ve engel kontrolü: istekte tekilleştir, iptali geciktirme

- Hesap, silme, iki yönlü kimlik engeli ve anonim gizleme bir sunucu isteğinde bir kez çözümlenir; alt yardımcılar aynı bağlamı kullanır.
- `account_access` mevcut kaynaktır; aktif/suspended/deleting/done durumlarının bütün yazma/silme yollarında tutarlı güncellenmesi doğrulanır. İçerik erişimi ve yazma kararında 60 sn eski `active` kaydıyla izin verilmez.
- `viewer_state` gerekiyorsa sunucuya özel, sürümlü ve parçalı bir projeksiyondur. Birincil engel kaydı ile atomik güncellenmeyen projeksiyon tek güven kaynağı olamaz; mevcut istemcilerin doğrudan engel yazma yolları da denetlenir.
- Kimlik ve anonim gizleme kümeleri ayrı kalır. Bellek önbelleği görüntü adaylarını hızlandırabilir; içerik/yorum/medya yetkisinde gerekli taze kontrol atlanmaz.
- **D4 uygulandı:** `own_receipt` genel ön transaction'dan önce ayrılır; kendi hesap + post sahipliği transaction'ı korunur. Kontrollü 5→3 mantıksal okuma doğrulandı. Publish/retry öncesi alındı çağrısı kaybolmuş sonucu kurtardığı için tamamen kaldırılmaz.
- Geçişte mevcut yetkili yol kalır. Silme ve engel kaldırma tüm projeksiyon parçalarını temizler; gecikmiş tetikleyici silinen hesabı yeniden oluşturamaz.
- **Test:** Sıcak/soğuk önbellek, farklı sunucu örnekleri, engel ekleme/kaldırma, hesap silme ve anonim karşılaştırma testleri.
- **Kazanç:** Aynı istek içindeki tekrarlar azalır; güvenlik pahasına 0–1 toplam okuma hedeflenmez.

### 5. Yazar kontrolü: tekilleştirilmiş güncel durum

- **23 Ekim uygulaması:** Harita adayları ve grup okumalarında tekilleştirme bütün isteği kapsar; 100 gönderilik parça başına aynı yazar tekrar okunmaz. En fazla 100 tekil yazar / 200 belgeyle sınırlı RPC'ler kullanılır. Mevcut profil + silme işi belgeleri taze okunur; `account_access` tek-belge dönüşümü uygulanmış sayılmaz.
- Aynı yazar bir sayfada birden fazla kez bulunursa tek `account_access` okuması paylaşılır; profil gösterim alanları ayrı ele alınır.
- Kullanıcıya yeni içerik, profil, yorum veya medya verilirken yazarın etkinliği ve kalıcı silme engeli taze doğrulanır. Eski “60 sn önbellekten aktif kabul et” yaklaşımı izin kararı için kullanılmaz.
- Eksik eski kayıt kontrollü göçte oluşturulur; silinmiş kullanıcıya ait erişim kaydı rastgele okuma yolunda `active` yapılmaz.
- **Kazanç:** Sayfa başına aynı yazarın tekrar okumaları kalkar; mevcut iki belge kontrolünün tek belgeye inmesi ancak projeksiyon tutarlılığı kanıtlanınca açılır.

### 6. Sayaçlar: ucuz artışa geçmeden tekrar ve onarım güvenliği

- **Başlangıç:** Mevcut `applyCountersOnce`, kaynak sayımı ve alındıyı transaction'da tutarak yeniden teslim ve onarımla yakınsar. Bunun yerine kör `increment` koymak tek başına eşdeğer değildir.
- Basit sosyal olaylarda `create(receipt)` + hedef `increment` aynı atomik grupta denenebilir. Yalnızca doğrulanmış `ALREADY_EXISTS` tekrar sayılır; zaman aşımı, kota ve ağ hataları yutulmaz. Hedef yok hatası ayrı doğrulanır; diğer hedefleri atlayarak alındı yazılmaz.
- Alındı saklama süresi, yeniden teslim/yeniden oynatma penceresiyle uyumlu olur. Alındı silindikten sonra eski olayın tekrar sayılmasını önleyen kalıcı nesil/üyelik veya eşdeğer protokol gerekir.
- Gece mutlak sayımı ile bekleyen artışların aynı kaydı iki kez saymaması için nesil/işlenmiş sınır tasarlanır. Bu kanıtlanmadan mevcut onarım algoritması artımlı sayaca uygulanmaz.
- `public_post_count` anonim olmayan etkin/herkese açık durumun geçişinden hesaplanır; filtrelenmiş yorum, admin offset'leri, silinen hedef ve çok hedefli follow işlemleri korunur.
- Önce toplu seed sırasında yazarı bir defa uzlaştırma gibi sınırlı kazançlar alınır. Parçalı sayaç yalnızca çakışma ölçülürse eklenir.
- **Test:** Ters sıra, eşzamanlı tekrar, hızlı beğen/kaldır, alındı TTL sonrası tekrar, silme, filtrelenmiş yorum, admin düzeltmesi ve onarımla eşzamanlı olay.
- **Kazanç:** Kaynak taraması düşer; 0 okuma iddiası güvenlik ve onarım protokolü tamamlanmadan kullanılmaz. [Tetikleyici teslim sınırları](https://firebase.google.com/docs/functions/firestore-events#limitations).

### 7. Görüntülenme: çökme sonrası kayıpsız/tekrarsız toplama

- **Uygulandı (O5):** Yalnızca başarılı günlük sunucu alındısı cihazın oturum belleğinde tutulur; aynı view çağrısı tekrar gönderilmez. Hata retry'ı engellemez. Cache hit eski sayacı yeni yetkili sayaç gibi döndürmez; hesap değişimi/sign-out/bellek uyarısı temizler. Aşağıdaki sunucuda toplama dönüşümü henüz uygulanmadı.
- Gösterim ancak içerik gerçekten açıldığında kaydedilir; harita çizmek veya metinsiz grup göstermek görüntülenme değildir.
- Günlük tekil alındı sunucuda taze hesap/gönderi/engel kontrollerinden sonra oluşturulur. Aynı alındıya yeniden geliş ücretsiz ağ değildir; istemci oturum içinde başarılı kaydı tekrar göndermez.
- Toplama işi kayıtları işlenme durumu ve sabit sıralamayla `(created_at, documentId)` üzerinden sınırlı partilerde alır. Yalnızca `created_at > cursor` kullanmak eşit zaman damgalarında kayıt atlatır.
- Her partinin sayaç artışları, işlenme/parti alındıları ve ilerlemesi aynı atomik commit'te yer alır; zaman aşımında aynı parti tekrar çalışabilir. İşlem sınırları nedeniyle bölünürse her alt partinin kendi atomik ilerlemesi olur.
- Geç gelen/backfill alındıları için işlenmemiş kayıt kuyruğu ve sınırlı onarım bulunur; “şimdi −60 sn” tek doğruluk güvencesi değildir.
- Süreli görevde tarama, işlenme yazması, checkpoint, TTL silmesi ve tekrar denemeler fiyata dahildir. Güncelleme hedefi sağlıklı işleyişte ~5 dk + biriktirme/süre payıdır; mutlak 5 dk garantisi verilmez.
- **Test:** Commit öncesi/sonrası çökme, iki worker, aynı timestamp, geç kayıt, hedef silinmesi, günlük tekrar ve gece onarımı.

### 8. Grup sayfalaması: her okunabilir notu atlamadan sınırlı okuma

- **V8/A1 önkoşulu:** Mevcut spot katılımı çemberin kenarından 25 m kabul ettiği ve yarıçapı keserek üyelik doğruladığını varsaydığı için grup genişleyebiliyor. 17 not/153 m fixture'ında uzaktaki gövde de açıldı. Sabit anchor ve tüm üyelere uygulanan kanonik geometri değişmezi, eski geniş grupların bölünmesi ve geçişte uzak üyeye toplu izin verilmemesi önce çözülmeli. Yarıçapı küçültmek/kesmeyi kaldırmak tek başına düzeltme değildir.
- **V8/A7 ölçümü:** 300 üyeli grupta ilk 15 + devam 50, toplam 600 post sonucu okudu; her yanıt 300 kimliği tekrar taşıdı (dizi 11.701 byte). Aşağıdaki sınırlı kaynak okuması hâlâ hedeftir; uygulanmış değildir.
- Mevcut sürüm sayfa başına bütün spotu yeniden okuyor. İlk sayfayı 15'e düşürmek bu taramayı kendiliğinden azaltmaz.
- İlk erişimde sunucu güncel yetki/görünürlük ve tam üyeliği doğrular, beğeni + oluşturulma + belge kimliğiyle sıralı kimlikleri dondurur. Metin ve erişim hakkı oturuma yazılmaz.
- Sonraki sayfa yalnızca sıradaki 15 kimliği toplu okur; o kayıtların güncel durum, yazar, engel ve taze yerinde konum kontrollerini tekrar yapar. Tüm spot tekrar taranmaz.
- Büyük grupta üyelik/rank dizini ve oturum sıra parçaları sınırlı boyutta kurulur. Gerekirse ilk liste daha geç açılır; ilk sayfanın ucuz olduğu kanıtlanmadan toplam ~20 okuma sözü verilmez.
- Canlı `likes_count` imleci tek başına kullanılmaz: sıralama değişirken not atlanabilir veya yinelenebilir. Oturum ömründe sıra sabit, yenilemede yeni sıra olur.
- `total` ve grup kimliği kanonik sunucu üyeliğine bağlı kalır; istemci farklı karolardan kendi 25 m gruplarını oluşturmaz. Silinen/gizlenen üyeler sonraki yanıtta çıkarılır; yeni eklenenler yenilemede alınır.
- **Test:** Aynı koordinatta çok not, sayfalar arası beğeni değişimi, silme/engel, süresi dolmuş oturum ve tüm uygun kimliklerin tekrarsız okunması.

### 9. Kullanıcı bağlamı (veri paylaşımı açık kullanıcılar)

- **Uygulandı (O7):** Normalize cihaz snapshot'ı değişince veya 15 dk heartbeat'te yüklenir. Sunucu eski istemcinin aynı verisini de tekrar yazmaz; heartbeat analitik olay oluşturmaz. Yeni kurulum/rıza/app sürümü bağlamı olay oluşturabilir. Throttled gerçek değişiklik yeniden denenir; `deviceCurrent` değişmeyen kabulü ayırır. Location-only çağrı cihaz belgesini okumaz. Konum takvimi/120 sn tazeliği ve her upload'daki rıza/hesap kontrolü korunur. Aşağıdaki başlangıç rakamları güncel toplam ölçüm değildir.
- **Sorun:** `UserContextService` ön plandayken her 60 sn `readDataPreferences` ve `recordUserContext` çağırıyor, her cihaz yüklemesinde analitik kaydı yazıyor. Ayrıca kendi konum yöneticisiyle sürekli konum takibi yapıyor.
- **Çözüm:** Statik cihaz alanları değişince/oturum başında ve seyrek heartbeat ile gönderilir. Dakika başı `app_foreground_context` olayını oturum/özetle değiştirme ihtiyacı ölçülür. Tercihler açılış/dönüş/değişimde okunur; sunucu her upload'da güncel rıza sürümünü yine kontrol eder.
- **Konum ayrı amaçtır:** Aktif kampanya, rıza ve tazelik ihtiyacına göre zamanlanır. Kampanya yollarındaki 120 sn taze fix şartı nedeniyle bütün konum yüklemelerine kör 250 m / 10 dk eşiği konmaz. Kampanya işlevi gerçekten açık değilken gereksiz bağlam takibi çalışmaz; harita/AR konumu ancak aynı amaç/rıza ve tazelik koşulları uygunsa kullanılır. Alışılmış yer cihazda kalır.
- **Sunucu güvencesi:** Rıza ve hesap kontrolü aynı yazma transaction'ında kalır; izin iptali eski upload ile geri alınamaz. Tekil analitik/heartbeat yeni yan kayıt ve TTL maliyeti dahil ölçülür.
- **Ölçüm:** Taze konum açık bir çevrimde tercih çağrısı 3, upload 5 mantıksal okuma ve en çok 3 yazma yapabilir; bölge senkronu/retry ayrıca. Sabit ~20 okuma/saat ve tüm bağlam için sıfır sürekli GPS vaadi kaldırıldı; pil sahada doğrulanır.

### 10. Kampanya bölgeleri

- **Sorun:** `readCampaignZones` her senkronda bütün aktif bölge kampanyalarını (300'e kadar) ve ilerleme belgelerini okuyor.
- **Çözüm:**
  - Sınırlı/parçalı `campaign_zone_index` aktif kampanyaların geometri ve takvim özetini tutar; tek belge 1 MiB sınırına dayanmaz.
  - Bu belgeyi `onCampaignZoneChanged` günceller; gece görevi yeniden kurar. Sunucu belleğinde 60 sn tutulur.
  - İlerleme yalnızca yakın kampanyalar için okunur.
  - `viewer_state.offers_until` ancak atamalarla tutarlı güncellenmesi kanıtlanırsa sorgu atlama ipucudur; eski projeksiyon uygun teklifi düşürmez.
- **Kazanç:** Aktif kampanyaların tümünü tekrar okuma azalır; gerçek parça ve yakın ilerleme maliyeti raporlanır.
- **D5 uygulandı, bölge dizini ayrı:** `ownCampaignOffers` promosyon tercihini atama sorgusundan önce kontrol eder. On atamalı izin-kapalı senaryoda 42→3 mantıksal okuma; atama sorgusu ve teklif yok. İzin açıkken tercih/hedef/hesap aynı transaction içinde paylaşılır; marka/yazar/engel/süre kontrolleri güncel kalır.

### 11. Ayar belgeleri: sunum önbelleği, taze güvenlik kararı

- Genel gösterim ayarları 60 sn sınırlı süreç belleğinde tutulabilir; aynı anahtarın devam eden okuması paylaşılır.
- Acil durdurma, `post_review_required`, yayın kotası ve güvenliği etkileyen kararlar gerekli yazma transaction'ında taze okunur. Önceki 15 sn eski kararla yayın verme önerisi kaldırıldı.
- Ayar yoksa güvenli mevcut varsayılan korunur. Önbellek süreç ve sürümle sınırlıdır; bir örneğin invalidasyonu bütün örnekleri güncel yapmış sayılmaz.

### 12. Gönderi tetikleyicileri: birleşme ve tekrar güvenliği

- **Uygulandı (O1):** Profil sayımı yalnız atfedilen aktif/genel katkı veya yazar değişince yapılır; `is_anonymous` geçişi de hesaba katılır. Anonim yeni post gereksiz profil sayımı yapmaz; medya geri alma/silme sorumlulukları sürer. Geniş tetikleyici birleştirme aşağıdaki koşullara bağlı ve henüz yapılmadı.
- Mevcut `onPostWritten` sayaç-only güncellemelerde zaten erken çıkıyor. Birleştirmede yoğunluk, spot, bildirim onayı, medya geri alımı ve silme sorumlulukları ayrı tekrar güvenli adımlar olarak korunur.
- İki eski tetikleyicinin aynı etkiyi kısa süre birlikte yapacağı varsayılmaz. Üyelik/sürüm/alındı anahtarı veya kontrollü kesimle her yan etkinin tek uygulanması kanıtlanır.
- Beğeni tetikleyicisi birleşmeye rağmen bildirim onayını çalıştırır; koordinat/statü değişimi dizini, sayaç değişimi yalnızca ilgili görevi etkiler.
- Eski fonksiyon emekliye ayrılırken yeniden teslimler ve bakım onarımları test edilir. Kazanç olay başına invocation ve okuma ölçümüyle gösterilir.

### 13. Otomatik onay: uygunluk ipucu, taze karar ve kontrollü geçiş

- **V8/A4 kalan maliyet:** İndeks açık, eşik 3 ve 300 olgun/uygun beğenide gerçek tanı 200 beğeni +400 profil/silme çiti +2 post/ayar =602 mantıksal belge okuması üretti. Genç hesap optimizasyonu bu senaryoyu çözmüyor. Aday sorgusu ve profil çözümü kalan eşik kadar ilerlemeli; geçersiz adayda devam ve >200 eşik desteği kalmalı. İlk üçü geçerli koşulunda 11 okuma tasarım hedefidir, uygulanmış sonuç değildir.
- **Başlangıç D1:** Yeni hesap beğenilerinde aynı geçmiş tekrar taranıyordu; 3→199 için 197 sentetik kontrol 60.085 mantıksal okuma üretti. Bu üretim faturası değildir.
- **Yerelde uygulandı:** `onLikeCreated`, aktif/onay bekleyen konum notunun mevcut beğenisini transaction'da okur; profil oluşturulma zamanı +24 saat olan `notification_eligible_at` ipucunu yalnız Admin SDK yazar. Unlike ile silinen beğeniyi diriltmez; tekrar idempotenttir. Onaylanmış/revoke edilmiş veya AR postları için yeni ipucu yazılmaz.
- **Dizin yolu:** `system/place_notes.approval_index_version=1` ise `post_id + notification_eligible_at<=now` bileşik sorgusu yalnız adayları getirir; 200 satırdan büyük eşiklerde devam sayfası desteklenir. Bayrak yok/0 ise eski tam yol kalır. Yeni koleksiyon veya TTL eklenmedi.
- **Yetki:** İpucu onay hakkı değildir. Mevcut beğeni/profil/hesap silme ve yaş son karar anında taze doğrulanır. Aynı sayaç değerine varan eşzamanlı olaylarda da son ipucu yazıcısı onayı değerlendirir. İstemcinin ipucu oluşturma/değiştirme denemeleri kurallarda reddedilir; unlike serbest kalır.
- **Kanıt ve bedel:** Gerçek emülatörde büyüyen 3→199 fixture'ında 197 değerlendirme 394 nokta okuması +197 sorgu, 0 beğeni/profil sonuç satırı üretti. İpucu yazıcısının beğeni başına iki okuması/bir yazması, boş sorgu asgarisi, indeks ve diğer tetikleyiciler bunun dışındadır; toplam fatura kazancı canlı ölçülür. Yaş geçişi, unlike/re-like, stale hint, askıya alma/silme, >200 ve legacy yolu test edildi.
- **Aktivasyon:** Önce indeks READY, sonra yeni `onLikeCreated`, ardından yeni `onPostDensityWritten` ve eşleşen Functions. Onay boşluğu yaratmadan eski yoğunluk onayı devreden çıkarılır. `functions/scripts/backfill-note-approval.mjs --project=lociar-2f38c` varsayılan dry-run; incelendikten sonra `--apply --activate` mevcut bekleyen notları hazırlar, ikinci geçiş/probe sonrası açar. Emülatör bileşik indeksleri zorunlu kılmaz; üretimde READY doğrulaması şarttır.
- **Geri alma:** Aynı araç `--apply --deactivate` ile bayrağı 0 yapar; kullanıcı beğenileri silinmez. Kod geri alınacaksa eski yoğunluk onay yolu önce geri getirilir. Üretimde göç/aktivasyon yapılmadı; tam komutlar ve sıralama uygulama raporunda.

### 14. Profil tetikleyicisi

- **Yerelde uygulandı (O2):** Yalnız bilinen üç sayısal sayaç (`follower_count`, `following_count`, `public_post_count`) değişmişse I/O öncesi çıkılır. Diğer alanlar tarih/map dahil derin karşılaştırılır; status veya moderasyon değişimi atlanmaz.
- **Kanıt:** Eski sayaç-only olayın üç hesap okuması kaldırıldı; status değişimi taze hesap yolunu koruyor. Bütün takip işleminin toplam maliyeti sıfır değildir.

### 15. AR açılışı ve yakındakiler

- **Yerelde uygulandı (O4):** Ayrı `myPosts(limit:50)` çağrısı kaldırıldı. `nearby(includeOwnNearby:true)`, zaten tam taranmış mesafe içi adaylardan ilk 100 genel kayıt yanında en fazla 50 yakın kendi kaydını korur. Kalabalık alanda kendi pending kaydı ilk 100 dışında kalsa da kaybolmaz; uzak kendi kayıtları indirilmez. Eski istemci 100 sınırında kalır; yerel taslaklar korunur.
- **Test:** 100 daha yakın genel kayıt, yakın kendi pending ve uzak kendi kaydı emülatörde doğrulandı.
- **Ayrı aday:** 60 sn / ~25 m ızgara `NearbyCache` bu pakette eklenmedi. Yetki/medya erişimi ve hesabın güncel görünürlüğü ayrıca korunmadan yeni içerik cache'i açılmaz. Yeni AR erişimi için sıfır okuma vaadi yoktur.

### 16. Bakım ve yerel yayın kuyruğu

- **V8/A8 kalan maliyet:** On post ve tek ortak harita oturumu hard delete tanısı 171 sorgu/169 boş sorgu, oturum koleksiyonuna 11 sorgu üretti. Aşama/spot düzeltmeleri bunu kaldırmıyor. Post bağımlılıkları sınırlı kimlik gruplarıyla toplu temizlenmeli; lease, geç yazma ve tam silme korunmalı. `map_group_sessions.post_ids` indeksi mevcut `array-contains` hard delete yolunda kullanıldığı için körlemesine muaf tutulamaz.
- **D7 uygulandı:** Silme işi lease/fencing ile tamamlanan Firestore ve Storage aşamalarını tekrar etmez. Aşama geçişi önceki işleri bekler. Auth sonrasındaki geç upload temizliği korunur; Storage/Auth hatası retry testleri geçti.
- **D8 uygulandı, worker sınırında:** Post hard delete ile aynı transaction'da tekil spot kimlikleri iş kaydına alınır; üyelik temizliği sonrası batch için bir kez onarılır, başarıdan sonra marker kalkar. Crash sonrası marker sonraki worker'da tamamlanır. Bağımsız yoğunluk tetikleyicisi hâlâ yeniden sayabilir; bütün sistemde tek sayım iddiası yoktur.
- **D9 uygulandı:** Avatar silme 5 dk başlangıç, üstel backoff +%20 jitter, en fazla 6 saat; en az dört hatada kimlik içermeyen attention sinyali. İş kalıcıdır, seçili güncel avatar korunur.
- **D11 uygulandı (telefon):** SwiftData sorgusu hesap + due koşulu ve fetch limit 10 kullanır; sahipsiz eski kayıtlar bir defalık ayrı göçle ele alınır. Manuel retry başka hesabın kaydını sahiplenemez. 15 sn foreground zamanlayıcısı şimdilik korunur; doğrudan Firestore tasarrufu diye sunulmaz.
- **Ayrı ölçüm:** Her bakım görevinin due/lease/boş yazması ölçülür. Sırf `hasWork()` ekleyerek ikinci sorgu oluşturulmaz. Tetikleyiciler arası coalescing ve zamanlayıcıyı olay tabanlı yapma ayrı işlerdir.

### 17. Fonksiyon kapasitesi: gecikme payıyla sabit gideri azalt

- Başlangıç `minInstances: 0`; mevcut üst sınırlar canlı envanterle doğrulanır. Doğrudan bütün callable'ları 5–10 örneğe çıkarmak planın varsayılanı değildir.
- Yerel kod CPU/eşzamanlılık seçmiyor. İkinci nesilde uygun CPU ile varsayılan concurrency 80; 1 vCPU altında çoklu eşzamanlılık kapalıdır. Kesirli CPU ile `concurrency: 40` birlikte önerilmez.
- İstek koordinatörü ve sorgu küçültmesi sonrası gerçek sıcak/soğuk p95, hata oranı ve faturalandırılan örnek süresi ölçülür. Seyrek ağır işler ile I/O ağırlıklı okumalar ayrı değerlendirilir.
- CPU, bellek, concurrency ve maxInstances birlikte sınırlı yük testinden geçirilir. 1 vCPU/çoklu istek ve kesirli CPU/tek istek toplam maliyetle karşılaştırılır; yalnızca CPU etiketine bakılmaz.
- İstemci bekleme süresi telefondadır; fonksiyonun içinde maliyetli `sleep` eklenmez. Instance üst sınırı bütün proje için harcama tavanı değildir.
- [Firebase kapasite ve CPU kuralları](https://firebase.google.com/docs/functions/manage-functions#allow_concurrent_requests).

### 18. Beğeni bildirim özeti (ürün kararı)

- **Çözüm:**
  - Gönderi başına saatlik `like_digest_{post}_{yyyymmddhh}` kaydı (`count` + son 3 kişi).
  - Push yalnızca saatin ilk beğenisinde ya da 1, 5, 10, 50… eşiklerinde gönderilir.

### 19. Push ve admin bildirimi gönderimi

- **D2 uygulandı:** Her cihazın aynı transaction'ında önce alındı/tercih/kota üçlüsü okunur. Ret varsa geniş paket okunmaz; izin yolunda etkinlik/hedef sahipliği, süre, hesap, engel, post ve cihaz kontrolleri taze tamamlanır; claim bundan sonra yazılır.
- **Ölçüm:** On cihazda bildirim kapalı, alındı var ve kota dolu senaryolarının her biri 131→41 mantıksal okuma; sıfır gönderim/yazma. Admin yoluna aynı sayı atfedilmez. İzin yolunda güvenlik belgeleri atlanmaz.
- **Kota güvencesi:** `pushQuotaDecision.activity_ids` istisnası korunur; aynı etkinliğin diğer cihazları salt count sınırıyla yanlış reddedilmez. Claim-before-send ve mevcut dış servis sınırı sürer. Cihazlar arası yetki paylaşımı yapılmadı; gerçek APNs teslimi fiziksel test ister.

### 20. Korumalı bölge kontrolü

- **Çözüm:**
  - Her bölgeye çemberinin değdiği geohash-5 hücrelerinin listesi `cover_cells` olarak eklenir. Bu alanı admin bölge editörü hesaplar; mevcut bölgeler bir betikle doldurulur.
  - Kontrol, transaction içinde ve her denemede taze olarak `where active == true and cover_cells array-contains <hücre>` sorgusuyla yapılır.
  - Bileşik indeks eklenir.
- **Kazanç:** Bölge sayısı kadar okuma → 0–3.

### 21. İstekleri aynı ihtiyaç etrafında birleştirme

- **V8/A3:** Bölge koordinatörü aynı uçuş varken bile her çağrıda revision artırıyor; GPS callback'leri ilk cevabı geçersizleştirip takip turları yaratabiliyor. Mevcut Swift gövdesinde altı aynı ihtiyaç altı işlem turu ve yalnız bir uygulanmış tur üretti. Hesap/rıza/özellik/kapsam/tazelik anahtarı aynıysa ihtiyaç uçuşu yeniden geçersizleştirmemeli; gerçek değişiklik son bekleyen işi üretmeli. Bu bölge yoludur; harita kamera koordinatörünün 1,2 sn birleştirmesiyle aynı sınıf değildir.
- 54'teki tek koordinatör; `.task`, kamera yerleşimi, tab'a dönüş ve kullanıcı yenilemesinden gelen aynı harita ihtiyacını paylaşır. İlk açılışta `nearby` ve `map_groups` otomatik olarak ikisi birden çalışmaz.
- Genel ısı kaynağı statik karodur. Yakın görünüm yalnızca grup özeti ister. Liste açılırsa 15 satırlık ayrı ihtiyaç oluşur; hiç açılmayan liste bir “açılış paketi” içinde zorunlu okunmaz.
- `map_open` modu ancak gerçekten gereken iki sonucu ortak sorgu/erişim bağlamından üretirse eklenir. İki pahalı taramayı aynı HTTP cevabına koymak yeterli değildir.
- `readRegions` üç bölge sonucunu hesap/tercih/yazar bağlamını paylaşarak alır. Kullanıcının kapattığı bildirim türleri için alt sorgu yapılmaz.
- Eski istemciler mevcut callable'larla çalışır. Karo kimliği/kapsam protokolü yetenek sürümüyle açılır; eski kutu sorgusunun tamlık bilgisi uydurulmaz.

### 22. Keşfet: ham adayları paylaş, görünürlüğü güncel çöz

- İlk sayfanın ham aday sorgusu sınırlı süreç belleğinde 30 sn paylaşılır. Aynı önbellek anahtarına eşzamanlı gelen istekler tek okuma kullanır.
- Her yanıtta güncel post statüsü, hesap silme/askıya alma ve ilgili engel türü kontrol edilir. Önbellekteki eski `active` gönderi gövdesi doğrudan döndürülmez.
- Yeni sayfa ve yazar akışı doğru imleçle sınırlıdır; aday filtresi sayfayı boşaltırsa tarama bütçesi dolana kadar kontrollü ilerler, bütün koleksiyon okunmaz.
- Kazanç ham aday sorgusundadır; yetki/yazar okumaları nedeniyle bütün keşfet çağrısına 0 okuma denmez.

### 23. Harita yan listesi: açılana kadar gövde okuma

- Harita ilk açılırken genel ısı veya yakın grup özetleri gelir. Bu metadata için taze hassas GPS beklemek gerekmez; mevcut kamera alanı kullanılabilir. “Konumum” ve notu yerinde açma/yayınlama gerektiğinde taze konum alınır. `loadNearby` ile otomatik 100 tam gönderi okuma kaldırılır; listeye ihtiyaç duyan eski akışlar ayrı doğrulanır.
- Kullanıcı yan listeyi genişletince veya gruba dokununca ilk 15 kayıt; yalnızca kaydırırsa devamı gelir. Her görünürlük eylemi tekilleştirilir.
- Özet alanları minimumdur. `pose`, `anchor_bundle`, `edit_data`, GIF ve dünya haritası yalnızca ilgili AR/gönderi görünümünde alınır.
- Not gövdesi için taze yerinde erişim, kilit redaksiyonu ve anonimlik korunur. Genel dosyalardan yakın not kimliği türetilmez.
- Kullanıcının yeni gönderisi callable sonucundan geçici kendi işaretiyle gösterilebilir; bu, başkalarının içeriği için erişim vermez.
- **Kabul:** Sadece haritada gezinilen testte gövde/yorum/GIF/dünya haritası indirmesi 0; liste açıldığında tek sayfa isteği.

### 24. Not oluştururken yoğunluk: gecikmeli dizinle kabul yok

- “Dizin sayısı +5 sınırdan düşükse kabul” kaldırıldı. Asenkron dizinin en fazla beş kayıt geride kalacağını garanti eden bir protokol yoktur.
- Mevcut tam mesafe kontrolü ve yoğunluk kilidi korunur. Yerel `readDensityLocks` 27 komşu kilit belgesi okuyor; bu korunurken çağrının tamamına 1–2 okuma denmez.
- Daha ucuz kabul yolu ancak oluşturma/silme/statü değişimiyle aynı transaction'da tutulan doğru üyelik/sayaç ve komşu sınır protokolüyle açılır. Yaklaşık indeks yalnızca ret/ön bilgi için kullanılabilir; yanlış kabul veremez.
- Harita dizini pazarın/yükün göstergesidir, güvenlik/kota otoritesi değildir. Korumalı bölgeler ve 18+ kontrolleri değişmez.
- **D12 kısmen uygulandı:** 27 yoğunluk kilidi okuması transaction içinde saat/gün kabul kapısının sonrasına taşındı; bu retlerde çalışmaz. İzin yolunda aynı atomik kilitler ve tam mesafe kontrolü kalır. Storage/GIPHY/yer hazırlıkları hâlâ transaction öncesidir; her izinli isteğe fazladan ön okuma ekleyen genel preflight bu pakette eklenmedi. Kota hazırlık bitmeden tüketilmez.
- **Test:** Biriken tetikleyiciler altında paralel oluşturma, komşu hücre, pending/active, silme ve sınırın tam kenarı.

### 25. Okuma alındıları: sınırlı parçalar, not başına süre

- Yalnızca gerçekten açılıp sunucuca okunabilir bulunan notlar için yorum erişim alındısı yazılır. Listeyi 15'e indirmek gereksiz alındıları da azaltır.
- Gruplanmış alındı protokolü gerekiyorsa anahtar `(viewer, cell7, shard)`; her post için ayrı `expiresAt` korunur. Hücrenin tamamına erişim veya bütün notlar için süre yenileme verilmez.
- Parça hesabı kuralların sabit maliyetle çözeceği şekilde sunucuca belirlenir. Map alanı boyut sınırlı ve indeks dışıdır; belge TTL'si ile içteki sürelerin temizliği ayrı tasarlanır.
- Kuralların bağlı belge okuma sınırı, eksik alan davranışı, eski istemci alındıları, post hücre değişimi ve silme temizliği test edilir. Mevcut per-note alındı bu geçiş kanıtlanana kadar kalır.
- **Kazanç:** 15 not için yazmaları birkaç parçaya indirme hedefi; evrensel sayfa başı 1 yazma garantisi yok.

### 26. GIF arama ve yayın doğrulaması

- **V8/A2 sağlayıcı koşulu:** Aşağıdakiler yereldeki uygulamanın kaydıdır; sağlayıcı uyum onayı değildir. [GIPHY resmî kuralları](https://developers.giphy.com/docs/api/#best-practices) proxy, URL yeniden yazımı ve izinsiz medya cache'ini kısıtlıyor. İncelenen repo içinde özel izin kanıtı bulunmadı; sağlayıcı hesabındaki istisna ayrıca doğrulanır. Sunucu secret'ını istemciye taşımaya yetki vermez. Cache genişletme önerisi bu koşula bağlandı.
- **V8/A9 medya tanısı:** Arama sonuç cache'inden ayrı `GifDataCache` aynı URL için sekiz eşzamanlı tüketicide sekiz sentetik indirme başlattı. Sağlayıcı koşullarıyla uyumlu devam eden indirme paylaşımı ve rendition/byte seçimi adaydır; bitmiş medya cache'ini otomatik büyütme önerilmiyor.
- **Arama sunucusu:** 30 dk arama/10 dk trend cache'i korunur. D3 uygulandı: her kullanıcının güncel hesap/kota kontrolünden sonra sorgu/dil/ofsete göre aynı süreçteki dış istek paylaşılır; 500 bekleyen anahtar sınırı ve finally temizliği vardır. Sekiz aynı paralel arama 8→1 dış çağrı; her kullanıcının kotası ayrı kontrol edilir. Farklı örneklerde tek çağrı garantisi yoktur.
- **Cihaz O6 uygulandı:** Hesap/locale/normalize sorgu/ofset anahtarıyla 120 sn, 24 öğe/256 KiB bellek cache'i; aynı istek paylaşımı, sınırlı pending ve TTL uzatmayan LRU. Başarısızlık başarı diye saklanmaz; hesap/oturum değişimi geç sonucu atar. Terimler diske yazılmaz. Cihaz çağrıyı hiç göndermediğinde callable ve hesap/kota I/O'su da oluşmaz.
- **D13 düzeltildi:** Altı saatlik kabul edilmiş GIF doğrulama cache'i kaldırıldı. Her yeni yayında id/rating/boyut sağlayıcıdan yeniden okunur; varsayılan fetch yolunda rating g→r, kaldırılan GIF ve boyut değişimi regresyonları eklendi. Aynı tamamlanmış mutation replay'i idempotent yol olarak ayrı kalır. Bu zorunlu taze okuma maliyet tasarrufu diye sayılmaz.
- **Sınır:** GIPHY anahtarı sunucuda; arama cache'i yayın yetkisi vermez. Sıcak sunucu cache hit'inde de hesap/kota okuma/yazması vardır; bütün aramaya sıfır Firestore denmez.

### 27. Kapsayıcı imaj temizliği

- **Çözüm:** `firebase functions:artifacts:setpolicy --location us-central1 --days 1` bir kez çalıştırılır ya da dağıtım betiğine eklenir; mevcut boyut konsoldan kontrol edilir.

### 28. Ölçüm ve bütçe: tasarrufun kendisi pahalı olmasın

- İstemcide yerel toplu sayaçlar: kamera olayı, kapsanan/eksik alan, cache hit, paylaşılan iş, gönderilen/önlenen çağrı, boşa gelen yanıt, indirme byte'ı ve hata beklemesi.
- Her harita hareketi için Firestore analitik kaydı yazılmaz. Sunucu ölçümleri örneklenmiş yapılandırılmış loglardan gelir; pan/zoom izi, not metni, yazar kimliği ve kesin koordinat loglanmaz. Telemetri dışa aktarımı mevcut rıza sözleşmesini izler.
- Belge okumaları, indeks okumaları, boş sorgular, yeniden denemeler, tetikleyiciler, TTL ve bakım giderleri ayrılır. Önemli sorgular staging'de Query Explain ile ölçülür; emülatör faturanın kanıtı değildir.
- Aylık %50/%90/%100 uyarısı kurulur. Uyarı bütçesi ile hizmet durduran spend cap farklıdır; mevcut hesapta hangi ürünlerin kapsandığı ayrıca doğrulanır. `maxInstances` veya App Check tek başına proje harcama tavanı değildir.
- **D10:** Bellek `WindowLimiter` kapasitede bütün aktif sayaçları temizleyebiliyor; küçük kapasiteli kontrollü deney aynı pencerede tekrar izin verdi. Geçerli pencereyi sıfırlamayan kapasite politikası gerekir. Süreç yeniden başlatma/ölçekleme nedeniyle bu limit proje çapında kesin kota değildir; her harita hareketine yeni Firestore kota yazması eklenmez.
- Örneklem büyüklüğü ve istemci/sunucu sürümü kaydedilir. 54 senaryoları için istek sayısı, okuma ve byte önce-sonra raporu hazırlanır.
- [Query Explain](https://firebase.google.com/docs/firestore/query-explain), [bütçe uyarıları](https://firebase.google.com/docs/projects/billing/budget-alerts).

### 29. İndeks muafiyetleri: ilk veri modeliyle birlikte

- Sorgulanmayan büyük metin/map/array alanları ve uygun TTL alanları için muafiyet yeni koleksiyon açılırken tanımlanır; faz 4'e ertelenmez.
- Adaylar: `posts.caption`, gerçekten sorgulanmayan profil metni, `comments.text`, analitik özellikleri, karo hücre haritaları ve alındı post haritaları. Kullanılan sorguların alanları ve `caption_tokens` indeksli kalır.
- Muafiyet listesi repo sorgu envanteri ve Query Explain ile doğrulanır. Kazanç indeks depolaması ve yazma gecikmesinde ölçülür; Standard edition için her indeks kaydını ayrı belge yazması diye saymayız.
- [Firestore indeks iyi uygulamaları](https://firebase.google.com/docs/firestore/best-practices#indexes).

### 30. Soğuk başlatma: önce sabit gider eklemeden

- Başlangıçta `minInstances: 0` korunur. Önbellekli harita hemen çizilir; pahalı veri ihtiyaç olunca istenir. Sıcak örnek bütün fonksiyonlara varsayılan eklenmez.
- Vision gibi ağır bağımlılıkları gerektiğinde yükleme ölçülür; giriş modülünün tüm fonksiyonları yüklemesi ve mevcut SDK sürümü incelenir.
- `preferRest` otomatik üstün kabul edilmez: kullanılan transaction, aggregation ve diğer Firestore özellikleriyle gerçek soğuk/sıcak testinde karşılaştırılır. Kullanılan özellik yeniden gRPC başlatıyorsa beklenen kazanç yazılmaz.
- Sonraki sıcak örnek kararı ancak gerçek p95/kullanıcı etkisi ve boşta maliyet bütçesiyle alınır. Kullanıcının 1–2 sn toleransı kesin soğuk başlatma üst sınırı değildir.
- [Sıcak örnek maliyeti](https://firebase.google.com/docs/functions/manage-functions#keep_a_minimum_number_of_instances_warm).

### 31. Önce mevcut görsel veri; yenileme yalnızca gerekince

- Genel karolar tazeyse ağ kontrolü bile yapılmaz. Süre dolması tek başına arka plan timer'ı başlatmaz; görünür ihtiyaç, kullanıcı yenilemesi veya veri değişimi yenilemeyi tetikler.
- Kişisel grup özetleri bellekte kısa süreli görsel veri olarak tutulur. Hesap/engel değişimi kendi neslini geçersiz kılar; metin/yorum/medya için yeni erişim hakkı oluşmaz.
- Not gövdesi/çeviri yalnızca bellekte ve mevcut görünürlük/konum/dil/scene politikası içinde tutulur. Yeniden açılışta gerekli sunucu kontrolü sürer; “aynı oturumda bütün içerik 0 okuma” sözü kaldırıldı.
- Eski bir isteğin geç cevabı, aynı zoom katmanında olsa bile yeni görünümü ezemez. Kapsamı kullanılabiliyorsa doğru anahtarla önbelleğe alınır; ekrana uygulanması `requestGeneration` ile kontrol edilir (54).
- Hata sırasında yalnızca güvenli görsel veri korunur. Yüklenemeyen yeni alan boş olarak etiketlenir; eski alandaki noktalar yeni alana aitmiş gibi gösterilmez.

### 32. Disk önbelleği: yalnızca herkese açık kaba veri

- p4–p6 genel ısı dosyaları sürümlü anahtarla `Caches` altında en fazla 20 MiB/LRU ve 24 saat tutulur. Silinen/boşalan hücreleri taşıyan yeni dosya eskisini değiştirir; eski-yeni sayımlar maksimum alınarak birleştirilmez.
- Kişiye özel yakın grup kimlikleri/konumları, post kimlikleri, not/yorum metni, çeviri ve erişim kararları bu disk önbelleğine yazılmaz. Yakın özet belleği hesap/oturum/görünürlük nesliyle ayrılır.
- Disk saklama süresi ile 5 dk yenilik süresi ayrıdır. Dosyanın üretim yaşı, HTTP Age/yeniden doğrulama bilgisi korunur; uygulamayı yeniden açmak veya 304 almak verinin gerçek üretim yaşını sıfırlamaz.
- Arızada eski genel ısı tarihli gösterilebilir. Kişisel içerik veya yerinde okuma izni arıza önbelleğinden verilmez. Payload'a girmeden önce byte/girdi sınırları ve sürüm doğrulanır.
- Çıkış/hesap silme mevcut hesap verilerini temizler; genel dosyalar kimlik içermese de son görüntülenen alan geçmişi loglanmaz ve hesabı izlemek için kullanılmaz.

### 33. Açılışta ve dönüşte ensureProfile

- İlk auth dinleyicisindeki gereksiz tekrar önceki pakette azaltıldı. Gerçek dönüş hâlâ taze `ensureProfile` çalıştırır; Auth/getUser, claims/luid, terms, profil/handle, hesap silme ve askıya alma kontrolleri korunur.
- **Yerelde uygulandı:** Değişmeyen özel kimlik/terms verisi tekrar yazılmaz; last_seen 15 dk heartbeat alır. Mevcut `account_access` okunup yalnız durum değişince yazılır. Kimlik/terms/durum değişimi hemen işlenir; kör 30 dk doğrulama atlama yoktur.
- **Bedel/kanıt:** Kısa değişmeyen dönüş iki tekrar yazmadan sıfır yazmaya iner; mevcut access belgesi için bir ek okuma vardır. Hesap/suspension/kimlik değişimi testleri geçti. Çağrı veya bütün bootstrap maliyeti sıfır değildir.

### 34. AR'da LiDAR örgüsü

- **Sorun:**
  - `ARPinningEngine.makeConfiguration()` LiDAR'lı cihazlarda her oturumda `sceneReconstruction = .mesh` açıyor.
  - Örgü yalnızca `meshAnchorCount` tanılama sayacında kullanılıyor; iğneleme ışınları düzlemlere atılıyor.
  - Bu durum ısınmaya ve termal duraklatmaya katkı veriyor. Örgü dünya haritasını büyütüyor olabilir; kontrol edilmeli.
- **Çözüm:**
  - Örgü kapatılır; yalnızca tanılama ekranında açılır.
  - Düzlem algılama oluşturma modunda iki yönde çalışır.
  - LiDAR'lı ve LiDAR'sız iki iPhone ile saha testi yapılır; dünya haritası boyutları önce ve sonra karşılaştırılır.
- **Kazanç:** Daha az pil ve ısınma, daha az termal duraklatma; büyük olasılıkla daha küçük haritalar.

### 35. Harita ekranında GPS ve pusula

- **Çözüm:**
  - `LocationController` haritada ilk taze konumdan sonra doğruluğu 10 m'ye, mesafe süzgecini 25 m'ye düşürür.
  - Pusula yalnızca yön gösterimi açıkken çalışır.
  - AR, not yazma ve yerinde not/grup açma gerektiğinde taze yeterli doğruluk alınır. Sırf genel haritada gezinmek için sürekli hassas GPS çalışmaz.
- **Kazanç:** Harita açıkken belirgin pil tasarrufu.

### 36. GIF sürümleri

- **Çözüm:**
  - AR'da orijinal `giphy.mp4` yerine baloncuk boyutuna uygun küçük bir MP4 sürümü kullanılır (ör. `200w.mp4`); kalite sahada kontrol edilir.
  - Kartlarda döngülü MP4 ya da (ImageIO destekliyorsa) WebP kullanılır.
  - "Powered by GIPHY" ve yalnızca kimlik saklama kuralı değişmez.
- **Kazanç:** Daha az mobil veri ve pil.

### 37. Avatar boyutu ve tekrar kontrolü

- **V8/A10 kalan:** Byte indirmesi paylaşılmış olsa da metadata cache kontrolünden önce her tüketicide ayrı okunuyor. Yalnız aynı anda devam eden güncel metadata isteği hesap/yol/nesil kapsamında paylaşılabilir. Bitmiş eski yetki TTL ile kabul edilmez. Bu tur kanıt kaynak analizi; gerçek Storage metadata çağrısı ölçülmedi.
- **D6 yerelde uygulandı:** 64 öğe/16 MiB sıkıştırılmış byte bütçeli LRU; hesap/yol/Storage generation anahtarıyla aynı indirme paylaşımı. Cache dolunca bütün cache yerine en eski kayıtlar çıkar. Bellek uyarısı/sign-out/hesap değişimi temizler; A→B→A ve clear sonrası geç sonuç yeni nesli dolduramaz.
- **Görsel:** ImageIO ile gösterim boyutu × ekran ölçeğinde küçültülerek ana thread dışında çözülür. Mevcut 1024 px/3 MiB upload sınırı değiştirilmedi; tek görsel için 60–120 KB garantisi verilmez. Sıkıştırılmış cache bütçesi toplam fiziksel RAM değildir.
- **Erişim:** Her kullanımda güncel metadata kontrolü kalır; generation bulunamazsa cache kullanılmaz. Eski izinle silinmiş avatar gösterilmez; SafeSearch ve kalıcı bearer URL yasağı korunur. Yetki okuması sıfırlanmaz.

### 38. AR dünya haritası: oturum, erişim iptalini aşamaz

- İndirme yalnızca ilgili AR içeriği gerektiğinde başlar. Mevcut sıkıştırma ve disk cache korunur; cache hit de güncel yetki denetimini atlamaz.
- `world_map_downloads` oturumu uygulanırsa kullanıcı, post, dosya generation'ı, byte aralığı, son kullanma ve erişim sürümüne bağlı olur. Sahip klasörü veya kalıcı bearer URL dışa çıkmaz.
- Her parçada silme/engel/özel olma iptali korunur. İlk ve son parçada kontrol edip aradaki kısımları eski izinle vermek varsayılan çözüm değildir.
- Aynı istek içindeki çift kontroller ortak güncel bağlamla azaltılabilir; indirme sırasında değişim yarışları test edilmeden ~70→15 okuma iddiası yapılmaz.

### 39. Uzun listeler

- **Çözüm:** `MapFeatureView` yan listesi ve `PostPreviewView` yorumları `LazyVStack` ile çizilir; avatar ve GIF'ler yalnızca görünen satırlarda yüklenir.

### 40. Cihaz ve ağda ölçüm

- İlk aşamada mevcut URL/callable katmanından yerel sayaç ve süreler, Instruments/signpost ile çizim/CPU/bellek ölçümü alınır. Test metrikleri kullanıcı konumu veya içeriğini içermez.
- MetricKit ve Xcode Organizer uzun dönem açılış, takılma ve pil için kullanılır. Her payload veya kamera olayı Crashlytics'e topluca yazılmaz; örnekleme, boyut sınırı, rıza ve log gideri değerlendirilir.
- Düşük güç modu, hücresel ağ ve LiDAR'lı/LiDAR'sız fiziksel cihaz kanıtı ayrı raporlanır. Simulator akıcılığı fiziksel pil/ısı kanıtı değildir.

### 41. Kaydedilenler ve koleksiyonlar: sunucuda toplu sayfa

- **V8/A6 kalan:** 15 kendi kaydedileni ve 400 ilgisiz engel kenarı tanısı 415 sorgu belgesi +19 nokta okuması üretti. Ham sayfa sınırlı, dışlama geçmişi sınırsız. Sayfa yazarları için gerekli güncel kimlik/anonim kenarları toplu çöz; anonimlik fark testlerini koru. Tam engel geçmişini eski yetki cache'ine taşımak çözüm değildir.
- **O3 uygulandı:** `readPublicContent.saved` ve `.collection`, ilk/devam 15 ham kenar + bir bakış satırı kullanır. Kaydedilenler belge kimliğiyle kararlı sıradadır; imleç bu kimliği taşır. Koleksiyon sort_order + kimlik sırasındadır. Kaydetme tarihine göre yeni sıralama bu paketle eklenmedi. İmleç kullanıcı/mod/koleksiyona bağlıdır; her collection isteği güncel sahiplik kontrolü yapar.
- Seçili postlar toplu alınır; aynı post/yazar tekilleştirilir, tek taze hesap/engel bağlamı kullanılır. Boş aktif post sayfası engel sorgularını bile atlar. Uzaktaki not gövdesi sunucuda kilitli kalır.
- Silinmiş/gizlenmiş kayıtlarla boş kalan sayfa da next taşır. iOS yalnız kullanıcı devamı açınca yenisini alır; yükleme/oturum nesli eski cevabı atar. `edgePageVersion=1` eski backend yanıtını özel liste sanmayı engeller. Tam liste indirme ve öğe başına callable kaldırıldı.
- **Sınır:** 15 ham satır 15 görünür satır garantisi değildir. Kenar + post + tekil yazar + yetki I/O'su ayrıca sayılır; toplam ~55 veya sıfır okuma iddiası yoktur. Koleksiyon başlık listesinin mevcut doğrudan Firestore yolu bu içerik sayfalamasından ayrıdır.

### 42. Etkinlik listesi: taze ortak bağlam

- **V8/A11 kaynak bulgusu:** Activity ilk sayfada `nextCursor` istek nesli kontrolünden önce yazılıyor; eski cevap yeni listeye eski imleci bırakabilir. Discover ilk yükleme ve GIF query debounce nesli de aynı kuralla gözden geçirilmeli. Herhangi bir UI state yazmasından önce istek/hesap geçerliliği kontrolü ve nesle bağlı defer gerekli; bu üç yarış için yeni XCUITest henüz yok.
- **O8 uygulandı:** Yeni istemci ilk 15/devam 50 ister; eski istemcinin varsayılan 50 davranışı korunur. Sayfanın postları ve yazarları tekilleştirilir; izleyici, gerçek post, hesap/silme, ilgili engel/report kontrolleri tek güncel transaction'da yapılır. İçerik çözümlemesinde aynı post yeniden okunmaz; `denseLocks` toplu çözülür.
- **Kanıt:** Aynı notu gösteren 15 etkinlikte post bir kez, yazar bir kez okunur. Kimlik engeli ve anonim gizleme bağımsızlığı; kilitli uzaktaki notun boş gövdesi ve null caption davranışı test edildi. Liste yerinde yorum erişimi grant'i üretmez.
- Kazanç eşit satır sayısında ölçülür; eski 50 ile yeni 15 doğrudan aynı yükmüş gibi kıyaslanmaz. Güncel yetki farklı istekler arasında cache'lenmez.

### 43. Kullanıcı adı yayılımı

- **O11 uygulandı:** `fanOut` anonim postlara `creator_handle` yazmaz; atfedilen postlar ve yorumlar güncellenir. Boş batch commit'i atlanır. Admin anonim yazarı sunucudaki sahiplikten çözer.
- Kaynak sorgusu eski kayıtları da kapsamak için hâlâ yazarın bütün postlarını okur. Kazanç gereksiz yazma/tetikleyici işidir; bu pakete okuma tasarrufu atfedilmez.

### 51. Dağıtım sonrası doğrulama

- **Sorun:** 18 Ekim'de dört callable (`createInvites`, `redeemInvite`, `markActivityRead`, `unlockDenseSpot`) herkese açık çağırma izni olmadığı için 403 veriyordu. Dağıtım betiği bunu kontrol etmiyor.
- **Çözüm:**
  - Dağıtımdan sonra mevcut readiness betiği/Cloud Run envanteri her callable'ın beklenen invoker erişimini doğrular; betik yolu ve allowlist bu checkout'ta önce bulunur. Auth/App Check kontrolleri korunur; webhook/özel HTTP yollarına körlemesine aynı politika uygulanmaz.
  - Kimliksiz/yanlış App Check testi callable protokolünün beklenen yapılandırılmış hatasını vermeli; yalnızca HTTP 401/403 sayısına bakılmaz. Geçerli kimlik+App Check ile temel yetkili akış da çalıştırılır.
  - Eksik izin varsa betik uyarır ve düzeltme komutunu yazar.
- **Kazanç:** Sessiz kırılmalar dağıtım anında yakalanır.

### 52. Genel ısı için statik dağıtım: gizlilik ve toplam bedel

- **Sıra:** Önce 54 ile gereksiz istekler kesilir. Statik dağıtım, mevcut callable çağrısı/okuma maliyetinden üretim+GET+saklama+çıkış maliyeti düşüldüğünde kazançlıysa açılır.
- **Üretim:** Yalnızca değişen p4–p6 karoları yaklaşık 5 dk'da bir yeniden üretilir; her beğeni veya her harita görüntülemesi dosya üretmez. Kirli kayıt/işlenme işlemi tekrar güvenli ve boyut sınırlıdır. Her tur bütün gönderileri/şehri taramak yok; ilk doldurma ve imleçli onarım ayrı giderdir.
- **Dosya:** Sürüm, precision, tileID, `generatedAt`, hücre ve sayı. Dünya/çok geniş görünüm için aynı gizlilik sınırlarıyla boyut sınırlı `overview` üretilir; geniş görünüm yüzlerce karo istemez. Daha kaba overview şeması renk/yoğunluk referanslarını alan ve hassasiyetle tutarlı kılacak görsel testten geçer. Koordinat sabit geohash hücre merkezidir; en iyi seçenek istemcinin merkezini hücreden türetmesidir. Gerçek koordinat ortalaması, not/post/grup/yazar kimliği, geometri ve metin çıkmaz. Tek not ve ardışık snapshot farklarıyla kesin konum/kimlik çıkarımı test edilir.
- **Dağıtım:** Çıktı için ayrı okunabilir prefix/bucket veya mevcut statik Firebase dağıtımı seçilir; mevcut özel Storage alanı açılmaz. Küçük trafikte ek Cloud CDN/yük dengeleyici kurulmaz. App Hosting alternatifi kullanılırsa cache miss'in origin maliyeti ve mevcut bütçe bağımlılığı ölçülür.
- **Güncellik:** Üretim hedefi 5 dk, HTTP/cihaz yeniden kullanımı en fazla 300 sn. Yeni indirme eski nesneyi yeniden taze saymaz; kaynak yaşı ve HTTP Age dikkate alınır. Sağlıklı sistemde yaklaşık 10 dk toplam gecikme hedefidir; kuyruk/başarısız üretim ayrı izlenir. 24 saat yalnızca disk saklama/arıza gösterim sınırıdır.
- **Yayın tutarlılığı:** Her karo nesnesi atomik değiştirilir; silinen ve boşalan karo da geçerli boş sonuç olarak yayımlanır. Üretim nesli geriye gitmez. İstemci daha yeni boş dosyayı eski dolu dosyayla birleştirmez. Görünümdeki farklı karo yaşları alan bazında tutulur.
- **İstemci:** Yerel tazelik geçerliyse HEAD/GET/manifest kontrolü yapmaz. Süre dolup görünür ihtiyaç doğunca koşullu istek kullanır; 304 istek maliyeti olabilir. Yalnızca eksik karolar indirilir; bütün şehir dosyası yok.
- **Arıza:** Önce tarihli güvenli genel veri; sonra sınırlı geri çekilme. Her başarısız CDN isteğini otomatik pahalı `readNoteDensity` taramasına çevirmek yok. Sunucu yedeği gerekiyorsa yetenek bayrağı, alan başına cooldown ve kesin okuma sınırıyla ayrı ölçülür.
- **Test:** Sayı eşitliği + koordinat/kimlik sızıntısı + kaynak yaşı + silme/boş karo + hata sırasında istek fırtınası. p7, yakın gruplar ve metin bu dosyalardan türetilmez.
- **Kazanç:** Genel görünüm tüketiminde kullanıcı başına 0 Firestore/Functions; üretim ve HTTP/çıkış ücretleri devam eder. [Yerleşik cache / Cloud CDN karşılaştırması](https://cloud.google.com/storage/docs/caching).

### 53. Sayfa boyutu ve kullanıcının gerçekten açtığı içerik

- Harita listesi, grup sayfası, yorum ve etkinlik ilk 15 satırla açılır. Kaydedilenler başlangıçta 15–25 aralığında ölçülür. Görünen satır sayısına göre tek kontrollü ön yükleme olabilir; bütün devam sayfaları okunmaz.
- **Mevcut grup protokolü için istisna:** İlk 15, sonraki sayfalar 50'dir; her devam sayfası halen grubun tamamını taradığından bütün sayfaları 15 yapmak derin kaydırmada maliyeti büyütür. 120 notta 8 kaynak taraması yerine 4 gerekir (yalnızca değişmeyen grubun kaynak post sorguları: 960→480; toplam fatura değildir). Yeni üyelik dizini bu maliyeti değiştirdiğinde sayfa boyutu yeniden ölçülür. Devam token'ı varsa istemci üye ipuçlarını tekrar göndermez.
- Harita listesi ve yorum bölümü kapalıysa sorguları yapılmaz. Medya yalnızca görünür/az sonra görünür kayıtlar için, düşük güç/hücreselde daha tutumlu alınır.
- Sunucuda tüm grubu/çevreyi tarayıp sonucu 15'e kesmek okuma tasarrufu sayılmaz; 8 ve 23 ile birlikte ölçülür.
- İmleçler boş/filtrelenmiş sayfa, sıra değişimi ve devam hatasını doğru ele alır. 8'deki sabit oturum sırası korunur.
- **Kazanç:** İlk yük ve kullanılmadan kalan kayıtlar azalır. “Günlük okuma kesin %30 azalır” kaldırıldı; kaydırma derinliği ve gerçek sorgu maliyeti ölçülür.

### 54. Harita hareketlerini telefonda birleştiren koordinatör

**Amaç:** Ekran akıcı kalırken aynı veri tekrar istenmesin; eski hareketlerden sunucu kuyruğu oluşmasın. Gecikme telefonda uygulanır. Kullanıcının nota dokunması, kimlik/konum kontrolü veya yazması bu kuyruğun arkasında tutulmaz.

#### 54.1. Tek sahip ve durum modeli

- `MapRequestCoordinator` servis ömrü `AppContainer`/hesap oturumuna bağlı tek paylaşılan örnektir. View yeniden oluşması yeni indirme/önbellek yaratmaz. Kamera olayları için `@MainActor` üzerinde gözlemlenmeyen hafif bir son-değer yuvası kullanılır; actor seçilirse yalnızca planlama anında snapshot aktarılır. Her karede actor'a yeni Task gönderilmez. Ağ/çözme işleri UI'ı bloklamaz; sonuç nesil denetiminden sonra uygulanır.
- Durum: son görünür alan/katman, kamera değişim/kullanıcı hareket zamanı, tek bekleme görevi, anahtar→devam eden iş, en son bekleyen özet isteği, sınırlı önbellek, son başlangıç zamanı ve hata bekleme süresi. Her kare için yeni async iş üretmeden son değer saklanır.
- Bir `viewportGeneration` yalnızca görünür ihtiyaç anlamlı değişince artar. Hesap/çıkış/engel/gizleme için ayrı `sessionGeneration`/`visibilityGeneration` bulunur. Dil/konum/scene nesli gövde/çeviri erişimine de uygulanır.
- Özet anahtarı: kaynak/protokol sürümü + veri hassasiyeti + kanonik alan + kişiselse izleyici/oturum/görünürlük nesli. Ekranın piksel piksel merkez koordinatı doğrudan cache anahtarı olmaz.

#### 54.2. Kamera olayı → ihtiyaç → ağ kararı

1. Kamera değişimleri tek hafif girişten izlenir. `.continuous` kullanıldığında yalnızca son alan/zaman/deadline gözlemlenmeyen durumda güncellenir; her karede `@State` yeniden çizimi, actor Task'ı, ağır kümeleme veya ağ planı oluşturulmaz. `.onEnd` varsa yalnızca bitiş sinyalidir; beklerken yeni hareketi algılamak için tek başına yeterli değildir.
2. **Tek bekleme görevi** vardır. Olaylar bu görevi her karede iptal edip yeniden yaratmaz; yalnızca son hareket zamanını/deadline'ı değiştirir. Görev uyandığında henüz 1.200 ms sakinlik yoksa kalan süreye bir kez yeniden kurulur. Böylece hareket başına Task/timer patlaması olmaz.
3. İlk sabit otomatik açılış 200 ms'de değerlendirilebilir; bu sırada kullanıcı hareket ederse 1.200 ms sakinlik gerekir. Ağ bekleme süresi çizimi ve dokunulan notun erişim kontrolünü bekletmez. GPS güncellemeleri kullanıcının harita hareketi sayılmaz; kamera gerçekten değiştiğinde kapsam değerlendirilir.
4. Yakınlaştırma eşiklerinde %12 histerezis; örneğin 1 km sınırında üst katmana geçiş >1.120 m, geri geçiş <880 m. İlk katman nominal eşikten seçilir. Güvenlik/hassasiyet sınırı yumuşatılmaz; yanlış kaynaktan metin/grup üretilmez. `counts`/`notes` aynı güvenli özetle çizilebiliyorsa yeni çağrı yoktur.
5. Cache değerlendirmesi açılışta veya tek planlama adımında yapılır; her karede karo çözme yoktur. Taze ve **tam** veri alanı kapsıyorsa hemen çizilir ve ağ planı kaldırılır. Saat ilerledi diye otomatik poll yapılmaz; 60 sn sonunda görünür bir ihtiyaç/olay varsa yeniden değerlendirilir.
6. Eksik veride yalnızca son alanın planı tutulur. En erken otomatik başlangıç `max(sonHareket + bekleme, sonBaşlangıç + 2 sn, retryDeadline)` olur. Devam eden hareket bu süre doldu diye ağ başlatmaz. İlk açılış için ayrı 200 ms kuralı uygulanır.
7. Aynı anahtardaki işe katılınır. Başka özet callable'ı devam ediyorsa yalnızca en son plan bekler. Slot boşalınca plan yeniden cache/kapsam kontrolünden geçer; biten iş ihtiyacı doldurduysa yeni istek atılır.

MapKit `.onEnd`, etkileşim tamamlandığında bildirim verir; cache, sakinlik beklemesi veya devam eden iş paylaşımını kendiliğinden sağlamaz. [Apple MapCameraUpdateFrequency](https://developer.apple.com/documentation/mapkit/mapcameraupdatefrequency/onend).

#### 54.3. Kapsam: yakın merkez aynı veri demek değildir

- Genel karolar kanonik geohash/precision/sürümle hizalanır. Antimeridyen kutuları normalize edilip aynı karo tek kez istenir. Dünya görünümünde yüzlerce p4 ebeveyni açmak yerine ayrı boyut sınırlı `overview` dosyası kullanılır. Gerekirse p4'ten daha kaba hücreleri yalnızca genel ısı olarak taşıyan sürümlü şema hazırlanır; mevcut callable'a desteklemediği precision gönderilmez. Böyle bir overview yoksa kısıtlı kapsam açık gösterilir; bütçe dolunca diğer karolar sessizce tam sayılmaz.
- İlk istemci sürümünde mevcut `readNoteDensity.truncated` alanı decode edilir; sunucu sürümü ve sorgu sözleşmesi doğrulanır. Eski kutu cevabı tüm karo doluymuş gibi genişletilmez. Tamlık bilinmiyorsa aynı kesin isteğin eksik olabilen görsel sonucu paylaşılabilir; daha geniş alana “tam cache hit” verilmez. Yakın grup için gerçek radius/scan sözleşmesi doğrulanır veya minimal kapsam/tamlık metadata'sı eklenir. Karo ID ile yalnızca eksik parça alma 2A protokolünü gerektirir.
- Yakın grup sorgusunda merkez/yarıçap ve gerçek kapsama alanı saklanır. `merkezler arası mesafe + yeni görünüm yarı köşegeni + grup sınır payı ≤ kaynak yarıçapı` doğrulanmadan hit verilmez. Yarıçap 2 km'ye kırpıldıysa daha büyük görünüm tam sayılmaz.
- 25 m grup üyeliği sunucuya aittir; kenar payı, sınırın ötesindeki üyeleri düşürmemelidir. Tamlık garantisi veremeyen cevap `complete:false` olur; gerekirse daha yakın zoom istenir. İstemci iki kısmi yanıttan yeni kanonik grup uydurmaz.
- Her kenarda %5 ek alan başlangıç ayarıdır; dikdörtgen alanı yaklaşık %21 büyütür. Çember/karo kaplama gerçek okuma yükünü daha fazla artırabilir. Büyüme getirisi sorgu okuması/byte ile ölçülür; yoğun alanda sıfıra indirilebilir.
- Boş fakat tam sonuç da 60 sn/ilgili kaynak TTL boyunca saklanır. `truncated`, hata ve zaman aşımı “burada not yok” sonucuna dönüştürülmez.

#### 54.4. Devam eden iş, iptal ve geç gelen yanıt

- Aynı harita özeti için en fazla 1 devam eden callable; genel dosyalarda en fazla 2 indirme. Detay/yazma çağrıları bu kota dışındadır; kendi güvenlik sınırları sürer.
- Henüz gönderilmemiş eski iş iptal edilir. Gönderilmiş callable'ı iptal etmek sunucu okumasını geri almaz; aynı kapsam yararlıysa bitmesine izin verilip cache'e konur. Yeni ihtiyaç tek bekleyen planı değiştirir.
- Yanıt yalnızca geçerli oturum/görünürlük nesline yazılır. Eski hesap veya engel öncesi kişisel yanıt cache'e ve UI'a alınmaz. Genel kimliksiz karolar kendi veri sürümünde saklanabilir.
- Eski görünümün yanıtı yeni görünümü ezemez. Güncel görünümle aynı katmanda olması yeterli değildir. Son görünümü gerçekten kapsıyorsa güncel plandan yeniden seçilerek çizilebilir.
- `.onDisappear` beklemeyi/aboneliği durdurur; referansı kalmayan spekülatif HTTP indirimi iptal edilebilir. Uygulama arka plana geçince yeni harita işi başlamaz; yeniden görünüşte TTL/kapsam değerlendirilir.

#### 54.5. Yenileme, değişiklik ve hata politikası

- “Yenile” aynı devam eden güncel ihtiyacı paylaşır; düğmeye peş peşe basmak paralel çağrı açmaz. Eski istek başladıktan sonra yayın/silme olduysa etkilenen veri nesli değişir ve en fazla bir yeni iş sıraya konur; olaydan önceki cevap güncel sayılmaz.
- Başarılı yayın, silme, kimlik engeli ve anonim gizleme ilgili kişisel sunum cache'lerini geçersiz kılar. Kimlik ve anonim engelin ürün semantiği ayrı kalır; hesap değişimi bütün kişisel harita belleğini temizler.
- Bilinen geçici ağ/servis/`busy_retry` hatasında en fazla 3 otomatik yeniden deneme: 2, 5, 15 sn + 0–250 ms rastgele pay. `resource-exhausted` (kota, yoğun alan veya büyük grup dahil) aynı sorguyla otomatik tekrar edilmez; mevcut 60 sn pencereyi 2/5/15 sn denemeleri düzeltemez. Sonrasında en az 60 sn ortak kaynak devre kesicisi; süre bitmesi tek başına yeni timer/poll başlatmaz, yeni kullanıcı ihtiyacı/ağ dönüşü beklenir. Sunucu daha uzun `Retry-After` sunarsa onu taşımak/uygulamak gerekir; mevcut API bu alanı taşımıyor. Aynı kaynak arızası farklı karo/merkezle aşılmaz; yeni kamera olayı retry sayacını sıfırlamaz.
- `permission-denied`/hesap/konum hatası otomatik ağ retry döngüsüne sokulmaz. İzin/oturum/konum düzeltme akışı çalışır. Tek manuel yenileme fırtına yaratmaz ve `Retry-After` sınırını aşmaz.
- CDN arızası her hareketi pahalı Firestore yedeğine çeviremez (52). UI güvenli eski genel veriyi yaşıyla gösterir; kişisel veri veya erişim hakkı için fail-closed davranır.

#### 54.6. Kaynak ve doğruluk sınırları

- Genel disk 20 MiB/LRU/24 saat; genel bellek başlangıç üst sınırı 8 MiB. Yakın özet belleği en fazla 32 kapsam veya 2 MiB, hangisi önce dolarsa. Bellek uyarısında azaltılır.
- Genel görünüm planı en fazla 8 kaynak karo ve toplam 256 KiB sıkıştırılmış veri hedefler. Açılmış veri/girdi sayısına ayrıca sınır konur; aşımda kontrollü kaba genel görünüm gerekir. Yakın eksik sonuç tam gösterilmez.
- HTTP TTL ve gerçek üretim yaşı korunur; diskten yükleme, 304 veya cihaz saatini geri alma sınırsız tazelik yaratamaz. Aynı açılış içindeki beklemeler monotonic clock ile yönetilir.
- Not metni, çeviri, konum kanıtı, erişim grant'i veya yazar eşlemesi bu cache'e girmez. Görünür genel ısı verisini tutmak telefonun geçmiş konumunu sunucuya yükleme izni değildir.

#### 54.7. Kabul senaryoları

Sahte saat ve sayan ağ istemcisiyle bekleme testleri; ayrıca gerçek staging'de okuma/byte ve simulator UI doğrulaması:

| Senaryo | Beklenen sonuç |
|---|---|
| Taze tam kapsam içinde 20 ayrı dur-kaydır | 0 ek HTTP/callable; eski veri yeni alanmış gibi taşınmaz |
| Soğuk ekranda 1,2 sn içinde 20 hareket | Son ihtiyaç için tek özet planı; kaynak karo sayısı kadar indirme, 20 callable yok |
| Aynı alanı eşzamanlı isteyen `.task` ve kamera olayı | Aynı anahtarda tek devam eden iş |
| A → B → A; A isteği hâlâ sürüyor | A işine tekrar katıl; B eskidiyse gönderme; paralel aynı A isteği yok |
| A yanıtı B'den sonra geliyor | B ekranı A ile ezilmez; cache yalnızca geçerli kapsam/nesle yazılır |
| 10 sn hareket / 1,2 sn dolmadan yeniden hareket | Tek bekleme işi; hareket sırasında ağ yok; durduktan sonra yalnızca son ihtiyaç |
| Dünya görünümü / 8 karoyu aşan alan | Boyut sınırlı overview veya açık eksik kapsam; yüzlerce GET ve desteklenmeyen precision yok |
| Katman eşiğinde 20 küçük zoom | %12 kararlılık aralığında veri kaynağı/çağrı salınımı yok |
| Önbellek boş, sonuç boş / kesilmiş | Tam boş cache edilir; kesilmiş sonuç eksiksiz kabul edilmez |
| 180° sınırı, kutup, 2 km cap, kenarda 25 m grup | Tekrarsız karo, doğru kapsam ve eksiksiz üyelik; sahte hit yok |
| İş sürerken çıkış/engel/silme | Eski kişisel yanıt atılır; yeni oturum/grup metni sızmaz |
| Karo yeni sürümde boşalıyor | Eski yoğunluk ve noktalar silinir; maksimum-sayım birleşmesi yok |
| CDN/ağ arızası + 20 hareket | Ortak backoff; otomatik sunucu yedeği/yeniden deneme fırtınası yok |
| Bir gruba dokunma / yerinde konum değişimi | Taze erişim kontrolü; harita debounce veya eski gövde izin yerine geçmez |
| Arka plan → ön plan / bellek uyarısı | Görünmeyen ekranda ağ yok; son ihtiyaç kontrollü tekrar değerlendirilir |

**Kanıt:** Gönderilen istek sayısı kadar Firestore belge/indeks okumaları ve statik byte ölçülür. İstemci koordinatörü tamamlanmış sayılsa da sunucu taraması ucuzladı veya fiziksel pil testi geçti diye raporlanmaz.

---

## F. Admin paneli

**V4 incelemesinden devralınan admin başlangıcı (uygulama öncesi bu checkout ve canlıda yeniden doğrulanacak):**
- **İyi olanlar:**
  - Pano sayıları ucuz `count()` sorgularıyla geliyor.
  - Listeler imleçle sayfalanıyor.
  - Bakım sayfası çalışıyor.
  - Her yıkıcı işlem denetim kaydına yazılıyor.
  - App Hosting boşta ücret doğurmuyor (`minInstances: 0`).
  - E-posta kodu hız sınırı doğru istemci IP'sini (`x-fah-client-ip`) kullanıyor.
- **Sorunlar:**
  - Bazı sayfalar gereğinden fazla okuyor.
  - Arama ve analitik doğru sonuç vermiyor.
  - Yasal sayfalar sunucuya bağımlı.
  - Optimizasyonu yönetecek bir ekran yok.

### 44. Liste sayfalarının boyutu

- **Sorun:** `readDocumentPage` varsayılan olarak 100 (+1) kayıt okuyor. Denetim, bağlantılar, bölgeler, moderasyon, gönderiler ve yerler sayfaları her açılışta ~100 okuma yapıyor. Yerler sayfası gönderileri ve kampanya konumlarını birlikte yükleyip ~200 okuma yapıyor. Günde 100 sayfa görüntüleyen bir moderatör tek başına ücretsiz okuma kotasının ~%20'sini harcar.
- **Çözüm:**
  - Varsayılan sayfa 25 olur (gerekirse 50).
  - Yerler sayfasında ikinci liste ayrı sekmede ve yalnızca açılınca yüklenir.
- **Kazanç:** Sayfa başına ~100–200 → ~25 okuma.

### 45. Admin araması: kapsamı açık kelime/önek dizini

- Mevcut sayfa içi filtre yerine sunucunun yazdığı `caption_tokens` üzerinden imleçli sorgu planlanır. Bu, desteklenen kelime/önek aramasıdır; tam metin veya bütün dillerde alt dize araması diye sunulmaz.
- Unicode normalleştirme, Türkçe I/İ, diğer alfabeler ve kelime ayrımı tanımlanır. Token/önek sınırı, eksik dizin ve çok sözcüklü sorgu davranışı açık olur; sessizce ilk 50 tokeni tutup bütün başlıklar aranıyor denmez.
- `createPost` ve admin düzenlemesi aynı üreticiyi kullanır; eski kayıtlar imleçli doldurulur. Durum/sıralama indeksleri ve token fanout'u ölçülür.
- Post kimliğiyle doğrudan bulma ucuz yönetim yolu olarak korunur. İlk 25 sonuç + doğru devam; ücretli arama altyapısı başlangıçta eklenmez.

### 46. Analitik özetleri

- **Mevcut:** Analitik sayfası 500 ham olay ve iki aggregate okuyor; tablo özetini "bu partideki" diye doğru sınırlıyor. Mevcut örnek özetini yanlış global toplam diye sunmuyor. Sık kullanılıyorsa bu okuma hacmi azaltılabilir.
- **Çözüm:**
  - Gece bakım görevi imleçli/sınırlı taramayla `analytics_daily` adlı günlük özet belgesini yazar: bir önceki günün olaylarını bir kez okur, olay başına sayıyı ve tekil kullanıcı ile gönderi sayısını hesaplar.
  - Sayfa seçilen aralık için en fazla 30 özet belgesi okur. Bugünün kısmi sayısı `count()` ile gösterilir. Çok günlü tekil kullanıcı/gönderi sayısı günlük tekiller toplanarak bulunmaz; bu kapsam ayrı hesaplanır veya günlük tekil diye etiketlenir. Geç olaylar ve silme/düzeltme için sürümlü yeniden üretim gerekir.
  - Olay listesi isteğe bağlı ayrı bir sekmede, 25'lik sayfalarla.
- **Kabul:** Global özet gerçekten gerekiyorsa toplam üretim/onarım/sorgu gideri ve gecikmesi karşılaştırılır. Küçük admin trafiğinde ilk adım 25'lik ham sayfa olabilir; mevcut doğru etiketlemeyi yeni veri hatası gibi tanımlama.

### 47. Oturum çözümü

- **Sorun:** Korumalı layout ve sayfa aynı `requireAdmin` çözümünü ayrı yapabiliyor. Email oturumunda session/Auth/silme/rol okuması tekrarlanabilir; Proxy ve sayfanın kesin iki tam doğrulama yaptığı varsayılmaz.
- **Çözüm:** Mevcut Next.js yerel belgeleri doğrulanarak yalnızca aynı RSC render isteğinde React `cache()` ile temel oturum çözümü paylaşılır. Sayfa kendi permission/AAL2 kararını uygular; API/Route Handler/mutasyon taze yetki kontrolünü korur. İstekler arasında global oturum cache'i yok.
- **Kabul:** Email ve eski Firebase yolu, askıya alma/silme/rol iptali, AAL2 step-up ve yeni istek. Kazanç oturum yoluna göre ölçülür; kesin ~6→~3 okuma vaadi kaldırıldı. [React cache kapsamı](https://react.dev/reference/react/cache).

### 48. Yasal sayfalar: statik origin ve kesinti doğrulaması

- `/privacy`, `/terms`, `/support` mevcut Next.js sürümünün belgeleri ve gerçek response header'larıyla statik dağıtıma alınır; public yollar admin oturum proxy'sinden çıkarılır. Yetkili admin yollarının kontrolü sürer.
- App Hosting cache'i sıcak isteği ucuzlatabilir; cache miss/sona ermiş nesne origin 503 veriyorsa erişilebilirliği tek başına garanti etmez. Header yazılması cache'in gerçekten devrede olduğunun kanıtı değildir.
- Firebase Hosting'de bağımsız statik origin, uygun domain/URL ile değerlendirilir. Aynı projedeki bütçe/spend cap'in hangi servisleri durdurduğu kontrol edilir; bütçe kesintisinde koşulsuz açık kalır sözü verilmez.
- Gerçek test: sıcak/soğuk cache, origin kapalı, eski/yeni deployment, robots/redirect ve App Store/uygulama URL'leri. Statik sayfa sürümü ve hukuki güncelleme dağıtımı tutarlı kalır.

### 49. Sistem sağlığı ve optimizasyon paneli

- **Sorun:**
  - Dizin bayraklarını (`system/geo_queries.*_version`), doldurma ilerlemesini ve gerçek kullanımı görmek için Google Cloud konsolu gerekiyor.
  - V4 konsol için 2SV erişim engeli bildirmişti; güncel durum yeniden doğrulanır.
- **Çözüm (mevcut "Sistem" sayfasına):**
  - **Dizinler:** Her dizin için durum, doldurma imleci ve son tam tur. Bayrak aç/kapa düğmesi `system.maintenance` yetkisi ister, gerekçe zorunludur ve denetim kaydına yazılır.
  - **Kullanım:**
    - Son 7 günün günlük okuma, yazma ve silme sayıları ile fonksiyon çağrıları.
    - Veri Cloud Monitoring API'den gelir; App Hosting hizmet hesabına `roles/monitoring.viewer` verilir.
    - En çok okuma yapan çağrılar 28'deki loglardan listelenir.
  - **Bütçe:** Harcama sınırı ve bütçe uyarılarının bağlantıları ile son uyarı tarihi.
  - **Bakım görevleri:** Yeni görevler otomatik listelenir (16).
- **Kazanç:** Optimizasyonun açılması, izlenmesi ve geri alınması konsolsuz ve denetimli yapılır.

### 50. Moderatör uyarıları

- **Sorun:** Yeni şikâyet ya da otomatik gizlenen içerik için moderatöre bildirim gitmiyor. App Store 1.2 ve kullanım koşulları şikâyetlerin 24 saat içinde ele alınmasını öngörüyor.
- **Çözüm:**
  - `onReportCreated` ve otomatik gizleme, moderatörlere e-posta gönderir.
    - Mevcut Resend gönderici kullanılır: `ADMIN_EMAIL_API_KEY` Secret Manager'da, fonksiyona bağlanır.
    - Aynı içerik için saatte en fazla bir e-posta gider.
    - Her sabah açık şikâyet özeti gönderilir.
  - Admin panosunda "24 saati geçen açık şikâyet" sayacı gösterilir.
- **Not:** Gönderici alan adı (`support@lociar.app` + MX) sahip adımıdır; `onboarding@resend.dev` yalnız hesap sahibine gönderir.

---

## G. Maliyet modeli: toplam fatura ve duyarlılık

**Sabit aylık fiyat sözü yok.** V4'teki ~14 $ toplamı, 0,167 vCPU varsayımını 1 vCPU önerisiyle karıştırıyor ve bazı üretim/TTL/çıkış giderlerini dışarıda bırakıyordu. Canlı fatura, SKU, konum, ücretsiz paylar ve faturalandırılan örnek süreleriyle doğrulanır.

`toplam = belge + indeks okumaları + yazmalar + normal/TTL silmeleri + veri/indeks depolama + Functions/Cloud Run istek ve CPU/bellek süreleri + statik üretim/GET/çıkış + App Hosting/build/artifact/log/secret + kullanılan diğer servisler`

| Girdi | Modelde nasıl tutulur? |
|---|---|
| DAU | Günlük aktif kullanıcı; kayıtlı kullanıcı veya aylık aktif sayısı değildir |
| Okuma/yazma | Kullanıcı eylemi + tetikleyici zinciri + kural bağımlılığı + retry + bakım ayrı bileşenler |
| Firestore birim fiyatı | Örnek hesap için 100 bin okumada 0,06 $, yazmada 0,18 $, silmede 0,02 $ varsayımı; nam5 güncel SKU/fatura ile teyit edilir |
| Ücretsiz pay | Uygun tek veritabanı için günlük 50 bin okuma, 20 bin yazma, 20 bin normal silme; bakım da aynı payı kullanır |
| TTL | Normal silme ücretsiz payına dahil edilmez; alındı artışı yalnızca yazma maliyeti değildir |
| Functions CPU/bellek | Gerçek runtime ayarı ve faturalandırılan instance süresi; eşzamanlılık varsa `çağrı × süre × CPU` doğrudan doğru toplam değildir |
| Sıcak örnek | Başlangıç 0; sonradan seçilirse boşta gider ayrı satır |
| Statik veri | Üretim, Storage/Hosting GET/304/metadata, byte çıkışı ve saklama; cache hit ücretsiz varsayılmaz |
| Sabit/ortak gider | Build, artifact, log, mail/secret ve admin; uygulama kullanımından ayrı gösterilir |

**Duyarlılık örneği:** Her gün aynı DAU, 30 gün, kişi başına 300–700 okuma ve 55 yazma; yalnızca kullanıcıyla ilişkilendirilen Firestore okuma+yazma. Bu aralık hedef faturayı veya ölçülmüş performansı temsil etmez.

| DAU | Okuma / ay | Yazma / ay | Okuma+yazma alt toplamı |
|---|---|---|---|
| 100 | 0–0,36 $ | 0 $ | 0–0,36 $ |
| 1.000 | 4,50–11,70 $ | 1,89 $ | 6,39–13,59 $ |
| 10.000 | 53,10–125,10 $ | 28,62 $ | 81,72–153,72 $ |

Hesap: `30 × max(DAU × günlükOkuma − 50.000, 0) × 0,06 / 100.000`; yazmada 20.000 ve 0,18 kullanılır. Günlük dalgalanma varsa her gün ayrı hesaplanır. Bakımın ücretsiz paydan kullanacağı bölüm, indeks okumaları, TTL, CPU, depolama ve diğer satırlar bu alt toplamda yoktur. 100 kullanıcı ×700 okuma ücretsiz kota içinde değildir.

**Harita karşılaştırma senaryosu:** Aynı taze kapsamda 20 hareket → 0 ek istek; yeni alanda statik tüketim → kullanıcı başına 0 Firestore/Functions ama dosya indirme maliyeti; yeni yakın alan → sınırlı tek özet çağrısı + gerçek tarama maliyeti. Kullanıcı nota dokunmadıysa gövde/yorum/medya gideri yoktur. Tasarruf yüzdesi bu senaryoların gerçek kullanım sıklığıyla hesaplanır.

**CDN geçiş koşulu:** Önlenen callable+okuma maliyeti, ek üretim+saklama+GET+çıkış maliyetini aşmalı. Küçük trafikte yalnızca istemci önbelleği daha ekonomik olabilir. Ayrı Cloud CDN/yük dengeleyici otomatik kurulmaz; ortak dosya üretiminin maliyeti kullanıcılardan bağımsız kalabilir, toplam dağıtım maliyeti kullanıcı/byte ile büyür.

**Resmî kaynaklar:** [Firestore fiyatlandırma](https://cloud.google.com/firestore/pricing), [okuma/indeks/TTL hesabı](https://firebase.google.com/docs/firestore/pricing), [Cloud Run fiyatları](https://cloud.google.com/run/pricing), [App Hosting](https://firebase.google.com/docs/app-hosting/costs), [Storage cache seçenekleri](https://cloud.google.com/storage/docs/caching).

---

## H. Aşamalar ve kabul ölçütleri

**V8 öncelik kapısı:** Önce A1 grup geometrisi/okuma doğruluğu ve A2 sağlayıcı uyumu; sonra A3 tekrarları, A5 ucuz ret, A4/A6 sayfa içi sınırlı iş. Önceki fazların yerel testleri yeni geometri tanısını ortadan kaldırmıyor.

**Yerel uygulama kaydı:** Faz 1 istemci/ucuz ret işleri ve onay protokolünün kodu/testleri uygulandı. Tablo dağıtım/ölçüm sırasını da içerir; “yerelde geçti” canlı kesim/indeks aktivasyonu anlamına gelmez.

| Aşama | Kapsam | Kabul / ilerleme koşulu |
|---|---|---|
| **0. Başlangıç kanıtı** | 28, 40, commit/dağıtım/env envanteri | Harita senaryolarında istek, belge/indeks okuma, byte ve p95; fatura bileşenleri ayrı |
| **1A. İstemci koordinatörü** | 54, 2B, 31, 32'nin güvenli kısmı | 54.7 testleri; taze kapsamda 20 harekette 0 ek ağ; eski yanıt/hesap sızıntısı yok |
| **1B. Gereksiz işi kaldır** | 1, 9, 11, 14, 15, 16, 23, 29, 30, 33, 39, 41, 42, 44, 47, 48, 51, 53 | Liste açılmadan gövde/yorum/medya yok; tekrarlanan başlangıç/öğe çağrıları yok; güvenlik testleri |
| **1B ek. Zincirlerde ucuz ret / tekrar** | D4 own_receipt, D3 GIF, D2 push, D5 kampanya; D10 kapasite | Önce/sonra mantıksal sayım; izin yolunda taze güvenlik/iptal ve paralellik korunur; sentetik sayı canlı faturayla karıştırılmaz |
| **Öncelikli sözleşme düzeltmesi** | D13 yayın GIF doğrulaması | Varsayılan fetch yolunda her yeni yayında taze sağlayıcı okuması; rating/404/timeout/boyut değişiminde doğru ret; arama cache'i ayrı |
| **Açılış öncesi onay protokolü** | 13 / D1 | Yeni hesapların büyüyen beğenileri, 24 saat geçişi, unlike/re-like/silme/tekrar altında sınırlı iş ve doğru bildirim onayı |
| **2. Sınırlı sunucu okuma modeli** | 2A, 4, 5, 8, 25, 45, 46; gerekli 49 | Sonraki grup sayfası bütün spotu taramıyor; tamlık/sıra ve kurallar korunuyor; dizin boyutu/hotspot sınırları |
| **3. Ekonomik ortak dağıtım ve bölge işleri** | 52; 3, 10, 13, 19, 20, 21, 24'ün güvenli tasarımı; 26, 27, 34–38, 43, 50 | Üretim dahil toplam gider düşüyor; kesin koordinat/kimlik yok; bildirim adayları eşdeğer; cihaz işleri sahada doğrulanıyor |
| **4. Ölçüme bağlı riskli dönüşümler** | 6, 7, 12, 17, 18 ve parçalı sayaç | Onarım/yeniden teslim testleri ve toplam maliyet kazancı; bildirim özeti ayrıca ürün kararı |

Statik karoların ekonomikliği Faz 1 sonrası görülür; 52 için diğer bütün bölge/medya işlerinin bitmesi beklenmez. LiDAR, GPS ve GIF değişikliklerinin fiziksel testleri ayrıca yürütülür. Faz 1B tek büyük PR değildir; bağımsız küçük paketlere ayrılır.

**Her paket:** İlgili testler → güncel kaynak/istemci protokolü → gerekiyorsa indeks/doldurma → küçük trafik → dağıtım duman testi → gerçek gider karşılaştırması. iOS-only paket gereksiz backend dağıtımı yapmaz; dağıtım adımları uygulama ve canlı ortam kanıtıyla ayrı yürütülür.

**Plan önkoşulları:** Ortak bakım yöneticisi, `map_cells` veya başka dosya/fonksiyon eksikse önce bunların gerekli olup olmadığı kararlaştırılır; isimleri mevcutmuş gibi test/dağıtım listesine eklenmez.

---

## I. Ölçüm, test ve geri alma

- **İstemci:** 54.7 deterministik saat/ağ senaryoları; kapsanan alan, boş/kesilmiş sonuç, geç yanıt, byte/memory sınırı ve etkileşim gecikmesi. Salt “timer 1.200 ms oldu” testi yeterli değildir.
- **Sunucu:** Yeni dizin ile kaynak sonuç eşitliği; tam grup üyeliği, sabit sıra ve sayfa başına gerçekten okunan belgeler. Query Explain/staging faturası emülatör kanıtından ayrılır.
- **Güvenlik:** `anonymous.test.mjs`, kurallar, rıza iptaliyle eşzamanlı context yükleme, hesap hard delete, sıcak/soğuk cache, başka cihazda engel/askıya alma ve medya iptali.
- **Sayaç:** Tekrar/ters sıra/TTL sonrası teslim, çökme ve onarım yarışları. Yeni protokol kanıtlanana kadar eski güvenli algoritma kalır.
- **Cihaz:** Simulator UI + fiziksel konum/AR/pil/ısı; gerçek APNs teslim/tap ile backend gönderimi ayrı.
- **Admin:** Sayfa okuma bütçesi; RBAC/AAL2, canlı oturum ve yasal sayfa kesinti senaryosu. Analitik üretim bedeli ayrıca.

**Geri alma:** İstemci koordinatörü, statik kaynak ve yeni indeks okuyucusu ayrı sürüm/bayrakla yönetilir. Sunucu kapatma bayrağı uygulamada varsa son bilinen güvenli ayara ve sürüm uyumluluğuna göre çalışır; her hareket flag sorgusu yapmaz. CDN arızasında sınırsız taramaya dönüş yoktur. Eski callable/protokol eski uygulamalar için korunur.

Yerel test, staging, canlı revizyon, fiziksel cihaz ve App Store/TestFlight ayrı raporlanır. Doldurma tamamlanması ve gerekli TTL/indeksler canlı olarak görülmeden “hazır” denmez.

---

## J. Kapsam matrisi

### J1. Kullanıcı çağrıları (callable)

| Fonksiyon | Maddeler |
|---|---|
| `ensureProfile` | 33 |
| `updateHandle` | 43 |
| `readDataPreferences`, `setDataPreferences`, `recordUserContext` | 9 |
| `readCampaignRegions` | 10, 21 |
| `readCampaignZones` | 10, 21 |
| `readPlaceNoteRegions` | 3, 21 |
| `recordPlaceNoteVisit` | 3 |
| `recordCampaignArrival`, `recordCampaignStep` | Olay başına, küçük; sorun yok |
| `createPost`, `createPlaceNote` | 20, 24, 26 |
| `beginWorldMapUpload`, `registerCloudAnchor`, `deleteOwnPost` | Seyrek; sorun yok |
| `readNoteDensity` | 2, 52, 54; yedek kullanım sınırlı ve bayraklı |
| `unlockDenseSpot`, `markActivityRead`, `createInvites`, `redeemInvite` | Küçük; 51 (403 kontrolü) |
| `submitReport` | Sorun yok; 50 |
| `readActivity` | 42 |
| `readLikeCount` | 1 (uygulamadan kalkar) |
| `blockPostAuthor` | 4 |
| `readAnonymousWorldMap` | 38 |
| `recordPostView` | 7 |
| `deleteAccount` | 16 / D7–D8; aşama tekrarı ve spot onarımı; yeni koleksiyonlar tam silme kapsamında (O) |
| `beginAvatarUpload`, `screenAvatar` | 30, 37 |
| `getArcoreToken` | Token 1 saat önbellekte; sorun yok |
| `registerPushToken`, `unregisterPushToken` | Günde en fazla 1; sorun yok |
| `searchGifs` | 26 |
| `submitBrandCampaign` | Seyrek; sorun yok |
| `readPublicContent` `nearby` | Bu checkout'ta post taraması; 4, 5, 15, 23, 31, 54 |
| `readPublicContent` `map_groups` | Mevcut; 2, 4, 5, 21, 54 |
| `readPublicContent` `map_group` | 8, 25 |
| `readPublicContent` `discover`, `creator`, `single` | 22, 5 |
| `readPublicContent` `profile`, `search_profiles`, `eligible_authors` | 4, 5 |
| `readPublicContent` yeni `saved`, `posts_by_ids`, `map_open` | 41, 21 |

### J2. Tetikleyiciler ve zamanlanmış işler

| Fonksiyon | Maddeler |
|---|---|
| `onPostWritten`, `onPostDensityWritten` | 12 (birleşir); dizinler 2, 3; 6 |
| `onLikeCreated` / `Deleted`, `onComment*`, `onSave*`, `onFollow*` | 6, 13 |
| `onProfileUpdated` | 14, 43 |
| `onActivityCreated` | 18, 19 |
| `onAdminNotificationQueued` | 19 |
| `onReportCreated` | 50 |
| `onCampaignZoneChanged` | 3, 10 |
| Olası `onMaintenanceRequested` | Mevcut olduğu bu checkout'ta doğrulanmadı |
| `onWorldMapFinalized`, `onDeletedAccountObjectFinalized` | Yükleme başına; sorun yok |
| Mevcut zamanlanmış işler; olası ortak bakım yöneticisi | Önce gerçek envanter; 16 ve yeni sorumluluklar 2, 3, 7, 10, 45, 46, 52 |

### J3. iOS ekranları ve servisleri

| Ekran / servis | Maddeler |
|---|---|
| Açılış ve giriş | 30, 33, 21 |
| Harita | 2, 15, 21, 23, 31, 32, 35, 39, 52, 53, 54 |
| Grup sayfası | 8, 25, 53 |
| Konum notu yazma | 20, 24 |
| AR | 15, 34, 36, 38 |
| Gönderi oluşturma ve GIF seçici | 20, 24, 26, 36 |
| Keşfet | 22, 31 |
| Gönderi önizleme ve yorumlar | 1, 7, 31, 39, 53 |
| Herkese açık profil | 1, 5 |
| Profil ve kendi gönderilerim | 31 |
| Kaydedilenler ve koleksiyonlar | 41 |
| Engellenenler | Seyrek; sorun yok |
| Etkinlik | 31, 42, 53 |
| Ayarlar ve veri paylaşımı | 9 |
| Arka plan bölge servisi | 3, 9, 10, 21 |
| Push | 18, 19 |

### J4. Admin sayfaları

| Sayfa | Maddeler |
|---|---|
| Pano | Sorun yok; 50 (24 saat sayacı) |
| Analitik | 46 |
| Gönderiler, arama | 44, 45 |
| Gönderi ayrıntısı, yeni gönderi | Sorun yok |
| Kullanıcılar | 44 |
| Moderasyon | 44, 50 |
| Avatarlar, onaylar, konum notları, kampanyalar | Sorun yok |
| Bağlantılar, yerler | 44 |
| Bölgeler | 44, 20 (`cover_cells`) |
| Denetim | 44 |
| Sistem | 49 |
| Bakım | 16, 49 |
| Giriş, MFA, oturum | 47 |
| Gizlilik, şartlar, destek | 48 |

### J5. Altyapı

| Kalem | Madde |
|---|---|
| Artifact Registry | 27 |
| Bütçe ve izleme | 28, 49 |
| İndeksler | 29 |
| Dağıtım doğrulaması | 51 |
| App Hosting | `minInstances: 0`; sorun yok |

---

## K. Değişen davranışlar

| Madde | Yeni davranış |
|---|---|
| 54 | Elle hareket sonunda 1,2 sn birleştirme; cache ile çizim hemen; otomatik başlangıçlar ≥2 sn aralıklı |
| 2, 31, 32 | Aynı taze/tam alan tekrar sorgulanmaz; yalnızca genel kaba ısı diskte kalır |
| 21, 23, 53 | Harita açılışında otomatik tam liste yok; kullanıcı açınca 15 satır ve kaydırdıkça devam |
| 52 | Normal işleyişte genel ısı yaklaşık 10 dk geriden gelebilir; arıza/yaş ayrıca görünür |
| 4, 5, 9, 11 | Sunucu içerik/yazma/izin kararları eski hesap, engel veya rıza kaydıyla verilmez |
| 8 | Oturum içinde sıra sabit; beğeni değişimi ancak yenilemede yeni sıraya geçer |
| 7 | Görüntülenme toplama başarılı işler ve kuyruk payıyla gecikmeli; en geç 5 dk kesin sözü yok |
| 3 | Bölge yenileme gönderimleri ~5 dk birleştirilir; iOS arka plan teslim zamanı garanti edilmez |
| 22 | Ham keşfet adayları 30 sn paylaşılabilir; güncel görünürlük/hesap kontrolleri sürer |
| 33 | Kısa dönüşlerde gereksiz profil çağrısı yok; her yazmanın sunucu kontrolü sürer |
| 17, 30 | Başlangıçta sıcak örnek yok; soğuk başlatma toplamı ölçülür |
| 34–38 | Sensör/medya değişiklikleri kalite, izin iptali ve fiziksel cihaz testine bağlı |
| 46 | Günlük olay toplamları özetlenir; çok günlü tekil kullanıcı sayısı günlük tekillerin toplamı değildir |
| 48 | Yasal sayfa kaynağı ve cache süresi gerçek kesinti/dağıtım koşullarıyla doğrulanır |

---

## L. Kararlar ve en yararlı seçenekler

| Konu | v6 tercihi | Sonraki değişim koşulu |
|---|---|---|
| İlk yatırım | 54 koordinatör + talep üzerine içerik + tekilleştirilmiş okumalar | Mevcut protokolle tasarruf hemen ölçülebilir |
| Bekleme | Elle hareketten sonra 1,2 sn; UI ve gruba dokunma ayrı | Gerçek p95/istek sayısıyla 1–2 sn aralığında ayarla |
| Yakın çevre payı | Her kenarda %5, kota/okuma bütçesine bağlı | Ek okuma kazancı aşıyorsa sıfıra indir |
| Genel veri | Önce cihaz cache'i, sonra ekonomik ortak statik dosya | Üretim+GET+çıkış toplamı daha ucuzsa 52 açılır |
| CDN altyapısı | Küçük trafikte ek yük dengeleyici/ayrı CDN yok | Gerçek hacim ve toplam maliyet karşılaştırması |
| Sıcak örnek | `minInstances: 0` | Kullanıcı etkisi ve boşta gider bütçesi haklı çıkarırsa |
| Gövde/yorum | Kullanıcı açınca 15 satır; erişim taze | Gerçek kaydırma derinliği / byte / güvenlik ölçümü |
| Sayaçlar | Mevcut güvenli yol; basit kazançlar önce | Tekrar ve onarım protokolü kanıtlanırsa 6/7 |
| Bildirim özeti | Ayrı ürün kararı | Her beğeni yerine özet davranışı kabul edilirse |
| Gizlilik | Ortak karoda sabit kaba merkez, kimliksiz sayım | Kesin not dosyası/istemcide yazar süzme seçilmez |

---

## M. Önerilmeyenler

- Sadece 300 ms'yi 1.200 ms yapmak: kapsam/cache ve devam eden iş paylaşımı olmadan tekrarlar sürer.
- Her kamera olayında timer, Task, Firestore logu veya metadata/HEAD sorgusu üretmek.
- Gönderilmiş callable'ı iptal ederek sunucu ücretinin geri alınacağını varsaymak.
- Bütün şehir/not/yazar dosyasını indirmek veya anonim engelleri telefonda çözmek.
- P6 etiketi olduğu için gerçek ortalama koordinatını güvenli saymak; tek notta kesin konum çıkar.
- Gecikmeli dizin +5 gibi kanıtsız payla yayın/yoğunluk/korumalı bölge kabulü vermek.
- Kişisel grup kimliklerini, gövde/yorum/çeviri veya erişim grant'ini genel disk cache'ine koymak.
- CDN arızasını her hareket için sınırsız Firestore yedeğine çevirmek.
- Bütün fonksiyonları sıcak tutmak veya maxInstances yükseltmeyi bedelsiz kapasite saymak.
- Küçük trafikte Redis/Memorystore, ayrı Cloud CDN/yük dengeleyici, ücretli arama veya veritabanı göçü eklemek.
- Günlük onarımın bütün artımlı sayaç yarışlarını kendiliğinden düzelteceğini varsaymak.
- Sayfa boyutunu küçültüp arka planda bütün grubu okumaya devam etmek.

---

## N. Dağıtım öncesi hesap ve ürün işleri

1. Canlı proje, bütçe/spend cap, 2SV erişimi ve servis durumunu yeniden doğrula. Önceki kesinti notları güncel durum kanıtı değildir.
2. Aylık bütçe ve %50/%90/%100 uyarılarını kur; gideri kullanıcı, bakım, statik dağıtım ve ortak altyapı olarak ayır.
3. Artifact saklama politikasını mevcut geri alma ihtiyacıyla birlikte kontrol et (27).
4. 49 gerekiyorsa Monitoring erişimini dar hizmet hesabı yetkisiyle ekle; başlangıç tasarrufu yeni admin panelini beklemez.
5. Moderatör e-posta alan adı/sender kurulumunu sağlayıcının güncel DNS gereksinimleriyle doğrula (50).
6. Yasal statik sayfa kaynağı ve uygulama/App Store bağlantıları için tutarlı dağıtım planı hazırla (48).
7. 52 ekonomikse yalnızca ortak çıktı için ayrı statik yayın alanı kur; mevcut özel bucket/rules açılmaz.
8. LiDAR'lı/LiDAR'sız iPhone'da AR, konum, hücresel ağ ve düşük güç testlerini yap.
9. Genel ısının yaklaşık 10 dk güncellik hedefini, 15 satırla talep üzerine listeyi ve varsa bildirim özetini sürüm davranışında açık tut.

---

## O. Güvenlik sözleşmesine uyum (AGENTS.md)

- **Sunucu otoritesi:** Gönderi, profil, sayaç, kota, alındı, moderasyon ve hard delete sunucuda kalır. Callable hatası doğrudan istemci yazmasına dönüşmez.
- **Yetki iptali:** Hesap/silme/engel/rıza ve güvenlik ayarları gerekli içerik/yazma kararında taze doğrulanır. Görsel cache bir okuma hakkı değildir; 54'ün gecikmesi yalnızca harita metadata ihtiyacını birleştirir.
- **Anonimlik:** Kimlik engeli ve anonim gizleme ayrı kalır; cache sıcak/soğuk farkları, hata yanıtları ve projeksiyonlarla kimlik bağı kurulamaz. İstemciye anonim yazar listesi gönderilmez.
- **Ortak karolar:** En fazla p6, sabit hücre merkezi, genel sayım; gerçek ortalama, post/grup/yazar kimliği, metin ve AR geometri yok. Tek not/snapshot farkı testleri şarttır.
- **Disk:** Genel kaba veri dışında kişisel grup metadata'sı, gövde, yorum, çeviri veya grant yazılmaz. Mevcut dünya haritası cache'i kendi güncel yetki politikasını korur.
- **Konum:** Taze yerinde okuma, doğruluk/radius kuralı, korumalı bölge ve 18+ sınırları sürer. Zoom, eski grup veya disk dosyası metin açamaz. Rıza kapatılırken eski yükleme veriyi yeniden yaratamaz.
- **Yeni koleksiyonlar:** Olası `viewer_state`, `density_tiles`, `note_regions`, `place_note_seen`, `note_approval`, `area_refresh_queue`, `campaign_zone_index`, `world_map_downloads`, `analytics_daily` ile snapshot/işlenme parçaları sunucuya özel/default-deny olur; kullanılanlar kurallar ve silme envanterine eklenir. Son kullanıcıya ait parçalar hard delete ile temizlenir.
- **Boyut/indeks:** Büyüyen alanlar parçalanır, sorgulanmayan iç haritalar indeks dışı tutulur. İçteki grant süreleri belge TTL'siyle karıştırılmaz.
- **Bakım:** Zamanlayıcı sayısı önce gerçek envanterle belirlenir; v4'ün “AGENTS toplam üç iş istiyor” iddiası mevcut talimatta bulunmadı. Gereksiz yeni periyodik gider eklenmez.
- **Admin:** Statik RBAC, canlı hesap/rol kontrolü, dar izin/gerekçe/audit ve konum/IP/rol/audit dışa aktarımında AAL2 korunur.
- **Ürün sözleşmesi:** iOS native; metin ve/veya tek GIPHY GIF; yayın sırasında GIPHY yeniden doğrulaması; Apple cihaz içi çeviri; 12 dil kaynak dosyaları üzerinden güncellenir. Sunucuya medya/link/çeviri fallback'i eklenmez.
- **Dağıtım:** İndeks/TTL/protokol eşitliği, eski istemci uyumu ve gerçek revizyon ayrı doğrulanır. Blaze gereksinimi ve default-deny kurallar korunur.

---

## P. Kanıt durumu ve kaynaklar

| Alan | Bu sürümün kanıtı |
|---|---|
| Yerel kod | `60afbca` + mevcut dirty worktree; harita ve seçilmiş sunucu/iOS maliyet paketi uygulandı; önceki bağımsız değişiklikler korundu. `docs/release/COST_OPTIMIZATION_IMPLEMENTATION_2026-10-23.md` |
| Native / UI | Son build: 234 native geçti (16 harita, 9 cache dahil), fiziksel cihaz isteyen 2 test atlandı; 5/5 gerçek Firebase SDK + emülatör UI senaryosu geçti. Canlı dağıtım yapılmadı. |
| Statik/CDN ve coğrafi dizinler | Uygulanmadı/açılmadı. Beğeni uygunluk bileşik indeksi kodda eklendi; üretimde READY ve backfill/aktivasyon ayrı gerekir. |
| Zincir denetimi ve uygulama | İlk 14 tanısal senaryo başlangıçtır. D1–D13 güvenli yerel karşılıkları ve kapsam sınırları uygulama raporunda; onay indeksi üretimde açık değildir. Backend 168 birim, 13 maliyet/geçiş, 167 emülatör, 29 not ve 89 kural testi geçti. |
| “map_cells yapıldı” | Bu checkout'ta bulunmadı; ayrı revizyonda varsa önce uzlaştırılacak |
| Ortak bakım yöneticisi | Önceki adlandırmalar bu checkout'ta bulunmadı; gerçek işler envantere alınacak |
| Firestore/Functions aylık toplam | Canlı ölçüm yok; §G açık girdili duyarlılık modeli |
| CI / canlı Firebase | Bu belge güncellemesinde doğrulanmadı; önceki yeşil sonuç yeni sürüm kanıtı değildir |
| APNs / AR / pil / ısı | Fiziksel test gerektirir; plan veya simulator kanıtı yeterli değildir |
| App Store / TestFlight | Bu dosya değişikliği dağıtım/gönderim durumu oluşturmaz |

Uygulamada mevcut cache, sıkıştırma, arka plan ve medya sınırları yeni sürüm başlangıcında tekrar doğrulanır. Geçmiş raporlardaki sayılar güncel canlı doğrulama yerine kullanılmaz.

**Uygulama kanıtı:** `build/cost-optimization-20261023/e2e-v2/` son başarılı native/UI koşusudur; önceki `e2e/` koleksiyon testinin TLS/offline hatasını saklar. DEBUG demo emülatör bağlantısı resmî Firestore ayarıyla düzeltildikten sonra aynı kullanıcı akışı geçti. Emülatör bileşik indeksleri zorunlu kılmaz; üretim READY ve fatura ölçümü ayrıca gerekir.

**Teknik kaynaklar:** [MapKit hareket sonu](https://developer.apple.com/documentation/mapkit/mapcameraupdatefrequency/onend), [Firestore ücretlendirme](https://firebase.google.com/docs/firestore/pricing), [Query Explain](https://firebase.google.com/docs/firestore/query-explain), [Firestore iyi uygulamalar](https://firebase.google.com/docs/firestore/best-practices), [belge sınırları](https://firebase.google.com/docs/firestore/quotas), [tetikleyici teslimi](https://firebase.google.com/docs/functions/firestore-events#limitations), [Functions kapasite/maliyet](https://firebase.google.com/docs/functions/manage-functions), [Cloud Storage cache](https://cloud.google.com/storage/docs/caching).



## Q. Uygulama sonrası yeni bulgular ve öncelik

Ayrıntılı kanıt: `docs/release/COST_POST_IMPLEMENTATION_DEEP_AUDIT_2026-10-23.md`. Bu bölüm v7 kodunu otomatik olarak değiştirmez; kalan sorunları ve sonraki uygulama kabulünü tanımlar.

| Öncelik | Bulgu | Kanıt / sonraki adım |
|---|---|---|
| P1 | A1, grup kenarından katılım ve uzak gövde | 17 not/153 m; merkezden 91 m uzaktaki gövde açık. Kanonik geometri + geçiş + kapalı okuma kontrolü önce. |
| Sağlayıcı kararı | A2, GIPHY proxy/medya cache koşulları | Resmî belge ve kaynak karşılaştırması; özel izin varsa kanıtı doğrulanmalı. Önceki cache önerisi bu bakımdan eksikti. |
| P2 | A3, aynı bölge ihtiyacında tekrar | 6 aynı yenileme →6 işlem turu, 1 uygulama. Anlamı değişmeyen ihtiyaç aynı uçuşu yeniden geçersizleştirmesin. |
| P2 | A4, olgun beğenide sabit 200'lük çözüm | Eşik 3 için 602 mantıksal belge; hem aday hem profil parçasını kalan eşikle sınırla, devamı koru. |
| P2 | A5, geçersiz mode pahalı ret | 400 ilgisiz engel +2 hesap okumasından sonra ret. Parametre/mod doğrulamasını öne al. |
| P2 | A6, küçük sayfada tüm engel geçmişi | 15 kendi kayıt için 415 sorgu belgesi +19 nokta; yalnız ilgili taze kenarlar. |
| P2 | A7, devamda tam grup taraması | 65 gövde için 600 post sonucu; her sayfada 300 kimlik/11.701 byte. A1'den sonra üyelik/sıra protokolü. |
| P2 | A8, silmede boş sorgular | 10 post/tek oturum için 171 sorgu, 169 boş. Sınırlı toplu bağımlılık temizliği; mevcut post_ids indeksi gerekli. |
| P2 | A9/A10, medya ve metadata | GIF:8 tüketici/8 indirme tanısı. Avatar metadata paylaşımı kaynak adayı; güncel yetki korunmalı. |
| P2 | A11, eski yanıt/imleç | Activity/Discover/GIF state nesilleri kaynak bulgusu; ayrı UI regresyonu gerekli. |
| P3 | A12, eşit sayaç yazması | Doğru sayaçta da hedef update girişimi; yalnız farkları yaz, receipt'i koru. |
| Geçiş | A13, yerel/canlı ayrımı | Canlı yeni onay indeksi ve harita oturumu TTL'si yok; 26 indeks READY, 37 TTL ACTIVE. Dağıtım/göç gerekir. |
| Ölçüm | A14, tercih dakika döngüsü | Cihaz heartbeat'i seyrek olsa da tercih çağrısı dakikada3 okuma. Kapalı özelliklerde uyarlama; rıza/taze konum değişmez. |

**Canlı doğrulama:** 62 Functions listelendi; pozitif minInstanceCount görünmedi. Yedi Scheduler ENABLED. Geo bayrağı zaten 1: enlem bandı fallback'inin 80→1 tanısı canlıda yeni açılacak kazanç değildir. İlgili dört Function'ın görünen son güncellemesi 18 Ekim Türkiye saatidir; metadata kaynak hash/parity kanıtı sayılmaz. Yeni onay bayrağı belgesi için maskelenmiş GET 404 döndü. Kullanıcı postu/profili/konumu veya secret okunmadı, canlı ayar değişmedi.

**Yeni kanıt:** TypeScript build, 8 Firestore başlangıç tanısı, 2 mevcut Swift mantık tanısı; `build/cost-second-pass-20261023/`. Tanıların geçmesi kalan davranışı yeniden ürettikleri anlamına gelir. Önceki 234 native/5 UI bu tur yeniden koşulmadı; A1 yeni senaryosu eski yeşil sonuçların kapsamında değildi.
