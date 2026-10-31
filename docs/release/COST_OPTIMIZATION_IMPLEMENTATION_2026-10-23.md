# Maliyet optimizasyonu — yerel uygulama, 23 Ekim 2026

> **Uygulama sonrası yeni denetim:** [Derin denetim raporu](COST_POST_IMPLEMENTATION_DEEP_AUDIT_2026-10-23.md) genişleyen spot geometrisinde uzak notun okunması, bölge yenilemesinde tekrar ve diğer kalan işleri yeniden üretti. Bu dosyanın önceki yeşil testleri bu yeni senaryoların kabul kanıtı değildir. GIF cache önerisi ayrıca güncel sağlayıcı şartına bağlıdır. Yeni bulgular henüz üretim kodunda düzeltilmedi.


Kaynak: `60afbca` + mevcut çalışma ağacı, `codex/fix-anonymous-location-audit`. Önceki harita koordinatörü ve bağımsız ödeme/destek değişiklikleri korundu. Bu paket iOS/Functions koduna uygulandı; canlı Firebase, App Store veya TestFlight dağıtımı yapılmadı. Üretim faturası ölçülmedi.

Başlangıç kanıtları [zincir incelemesinde](COST_CHAIN_DEEP_AUDIT_2026-10-23.md) ve [önceki 16 adayda](COST_OPTIMIZATION_OPPORTUNITIES_2026-10-23.md) korunur. Bu dosya onların güncel uygulama karşılığıdır. Büyük dizin/CDN ve ürün kararı gerektiren işler aynı paket gibi sayılmaz.

## Uygulanan sunucu düzeltmeleri

| Bulgu | Son davranış | Başlıca kaynak |
|---|---|---|
| D13, GIF yayın doğrulaması | Altı saatlik kabul cache'i kaldırıldı. Her yeni yayın GIPHY id/rating/boyutunu yeniden okur; rating değişimi, 404 ve hata kapalı davranır. Tamamlanmış aynı mutation'ın idempotent replay'i pahalı hazırlıktan önce kalır. | `functions/src/giphy.ts`, `posts.ts` |
| D3, aynı GIF araması | Her kullanıcının güncel hesap/kota transaction'ından sonra aynı sorgu/dil/ofset için süreçteki devam eden dış istek paylaşılır. En fazla 500 ayrı bekleyen anahtar; başarısızlıkta temizlenir. Sonuç cache'i korunur. | `functions/src/giphy.ts` |
| D2, push erken ret | Cihaz transaction'ında önce alındı/tercih/kota; retse geniş belge paketi okunmaz. İzin verilecekse aynı transaction'da bütün hesap/engel/gönderi/hedef/süre kontrolleri ve claim-before-send korunur. `activity_ids` kota istisnası değişmez. | `functions/src/push.ts` |
| D4, yayın alındısı | `own_receipt` genel ön transaction'a girmeden kendi hesap + post sahipliği transaction'ını çalıştırır. İstemcinin retry alındısı korunur. | `functions/src/publicContent.ts` |
| D5, kampanya rızası | Promosyon kapalıysa atama sorgusu yapılmaz. İzin açıkken aynı transaction'daki hedef ve hesap/tercih bağlamı paylaşılır; marka/yazar/engel/süre kontrolleri tazedir. | `functions/src/campaigns.ts` |
| D10, bellek limiti | Kapasite dolduğunda geçerli sayaçlar sıfırlanmaz; yeni anahtarlar o pencere için reddedilir. Eski pencere temizliği pencere başına en fazla bir kez yapılır. Bu süreç limiti proje bütçesi diye sunulmaz. | `functions/src/memoryLimits.ts` |
| O1, anonim profil sayımı | Yalnızca atfedilen aktif/genel gönderinin profil katkısı/yazarı değiştiğinde yeniden sayım yapılır. Anonimlik bayrağının değişmesi doğru ele alınır. Medya silme/temizleme görevleri çalışmaya devam eder. | `functions/src/triggers.ts` |
| O2, profil sayaç olayı | Yalnızca bilinen üç sayısal sayaç değişmişse I/O öncesi çıkılır. Tarih/map eşitliği doğru karşılaştırılır. Durum, moderasyon veya ek alan değişikliği güncel hesap yolunu korur. | `functions/src/triggers.ts` |
| O11, handle yayılımı | Anonim postlara gereksiz `creator_handle` yazılmaz; atfedilen post ve yorumlar güncellenir. Eski kaynakları kapsamak için sorgu halen tüm yazar postlarını okur; okuma tasarrufu iddiası yoktur. | `functions/src/triggers.ts` |
| D7, silme aşamaları | Tamamlanan Firestore/Storage aşaması, sonraki Storage/Auth hatasında tekrarlanmaz. Aşama geçişi bütün önceki işlemler beklendikten sonra aynı lease ile kaydedilir. Auth sonrasındaki geç upload temizliği kalır. | `functions/src/accountDeletion.ts` |
| D8, aynı spot onarımı | Worker, hard delete ile aynı transaction'da tekil spot kimliklerini iş kaydına ekler; üyelik temizliği sonrası batch başına bir onarım yapar. Hata/crash sonrası iş kaybolmaz. Bağımsız post tetikleyicisinin güvenli yeniden sayımı ayrıca kalır; bütün tetikleyicilerin birleştirildiği iddia edilmez. | `functions/src/accountDeletion.ts` |
| D9, avatar silme retry | Beş dakikadan başlayan üstel bekleme ve sınırlı rastgele pay, en fazla altı saat; kalıcı hata için `attention_required`. İş silinmez, seçili avatar korunur. | `functions/src/avatar.ts` |
| D12, yayın kabul sırası | Saat/gün kotası reddi 27 yoğunluk kilidinden önce gelir. İzin verilen yayında 27 kilit, tam mesafe sayımı ve atomik kota/post yazması korunur. Storage/GIPHY/yer hazırlıkları halen ana transaction öncesindedir; onlara ek ön sorgu her başarılı yayını pahalılaştırabileceği için bu paket kör bir ön kontrol eklemez. | `functions/src/posts.ts` |

## Yeni hesap beğenileri: güvenli ve geçişli okuma modeli

`functions/src/noteAutomation.ts`, `triggers.ts`, `noteDensity.ts`, `firestore.indexes.json`, `functions/scripts/backfill-note-approval.mjs`.

Yeni bir koleksiyon yerine mevcut `likes` belgesine **yalnızca sunucunun yazabildiği** `notification_eligible_at` sorgu ipucu eklendi. Değer, profilin oluşturulma zamanından 24 saat sonrasıdır. Bu bir aktif hesap/onay kaydı değildir. Son onay transaction'ı kaynak beğenileri, güncel profilleri ve kalıcı silme çitlerini yine okur; eski veya yanlış bir olgunluk ipucu genç/askıya alınmış/silinen hesabı onaylayamaz.

- Yalnızca henüz bildirim onayı bekleyen aktif konum notunun beğenisi işlenirken ipucu hazırlanır. Onaylanmış/revoke edilmiş notun her sonraki beğenisinde bu ek yazma yapılmaz.
- İpucu yazıcısı olayın eski payload'ını değil mevcut beğeni belgesini okur. Unlike sonrası eski olay belgeyi yeniden yaratamaz; re-like güncel üyelikten hazırlanır. Aynı doğru ipucu ikinci kez yazılmaz.
- Beğeni oluşturma yolu ipucunu hazırladıktan sonra onayı kontrol eder. Başka paralel sayım `likes_count` değerini zaten yazmış olsa da son ipucu hazır olunca kontrol çalışır. Eski post-sayaç tetikleyicisindeki ikinci onay kontrolü kaldırıldı.
- `system/place_notes.approval_index_version == 1` olunca yalnızca zamanı gelmiş adaylar sorgulanır. Eksik/sıfır bayrakta eski tam yol çalışır; eksik göçle sessiz not kaybı yaratılmaz.
- Adaylar 200'lük tam sayfalarda incelenir; 200 üzeri eşikler de korunur. Eşik ancak güncel yeterli hesap gerçekten bulununca karşılanır. Yeni hesapların 24 saat geçişi sorgu zamanı ile doğal olarak kapsanır; yeni bir beğeni/onay kontrolü olmadığında yeni polling görevi eklenmez.
- Yeni bileşik indeks `(post_id, notification_eligible_at)`; tekil alanın gereksiz otomatik indeksleri kapalıdır. İpucu beğeniyle birlikte silinir; ayrı yan koleksiyon/TTL temizleme gideri yoktur. Sunucu alanını istemcinin oluşturması/güncellemesi kurallarla reddedilir; sahibi unlike yapabilir.

**Gider sınırı:** İlk ipucu hazırlığı, o pending-not beğenisi için iki nokta okuması ve gerektiğinde bir yazma ekler. Tek seferlik göçün okuma/yazma ve yeni indeksin depolama gideri vardır. Bunlar aşağıdaki salt onay kontrolü karşılaştırmasına dahil değildir. Normal yazıcılarda profil `created_at` değişmez; yetkili bir veri onarımında bu tarih düzeltilirse ipuçları yeniden hazırlanmalıdır.

## Telefona taşınan ve açılışta azaltılan işler

| Alan | Uygulanan davranış |
|---|---|
| GIF araması, O6 | Hesap/dil/ofset/50 UTF-16 birimlik sorgu anahtarı; 120 sn bellek, 24 sonuç sayfası, 256 KiB bütçe. Aynı iş paylaşılır; hata cache'lenmez. Arama terimi diske yazılmaz. |
| Görüntülenme, O5 | Başarılı sunucu alındısı hesap/post/UTC gün için bellekte tutulur: en fazla 512 giriş/16 KiB. Aynı devam eden istek paylaşılır. Tekrar açılışında eski sayaç değeri yeni yetkili sayı gibi döndürülmez. Cache boşalır/taşarsa sunucunun günlük tekilleştirmesi doğruluğu korur; başarısız çağrı sayılmış kabul edilmez. |
| Avatar, D6 | En fazla 64 öğe ve **16 MiB sıkıştırılmış veri**; byte LRU ve en fazla sekiz ayrı byte indirmesi. Gösterim boyutu/ekran ölçeğiyle çözme ana thread dışındadır. Her kullanımda güncel metadata yetkisi korunur. Anahtar hesap/yol/nesne generation'ına bağlıdır. Bu sınır toplam fiziksel RAM ölçümü değildir. |
| Oturum/iptal | `ClientRequestCache` hesap değişimi/çıkış/silme/bellek uyarısında temizlenir. Eski yanıt yeni oturuma cache dolduramaz; A→B→A değişimi de nesil değiştirir. Bekleyen kapasite işleri sürekli döngü kurmadan uyandırılır; iptal edilen bekleyici ilgisiz ağı beklemez. Avatar metadata ve görsel çözme aşamaları da bu nesli kontrol eder. |
| Yerel kuyruk, D11 | SwiftData sahibi + due filtresini ve fetch limit 10'u sorguda uygular. Eski sahipsiz kayıt çözme işi açılış göçüne ayrıldı. Yanlış hesap veriyi yeniden sahiplenemez; manuel retry/dead letter davranışı korunur. 15 sn foreground zamanlayıcısı şimdilik kalır; boş kuyruğa bulut tasarrufu atfedilmez. |
| Kaydedilenler/koleksiyon, O3 | İlk ve devam sayfası en fazla 15 ham kenar + bir bakış satırı. Tek callable içinde seçili postlar toplu alınır, yazar kontrolleri paylaşılır ve uzaktaki not metni kilitlenir. Kullanıcı devamı açana kadar bütün liste getirilmez; öğe başına callable/patlayan task grubu kaldırıldı. |
| Liste doğruluğu | İmleç kullanıcı/mod/koleksiyona bağlıdır; filtrelenmiş/silinmiş sayfa da ilerler. Boş aktif post sayfası engel sorgularını bile yapmaz. İstemci `edgePageVersion=1` ister; eski backend'in varsayılan keşfet yanıtını özel liste sanmaz. Hesap/yenileme nesli eski sayfayı atar; eklenen sayfalarda kimlikler tekilleştirilir. |
| AR açılışı, O4 | Ek `myPosts(limit:50)` sorgusu kalktı. Sunucu zaten taradığı mesafe içindeki adaylardan ilk 100 genel sonuca ek en fazla 50 kendi yakın kaydını korur; 100 daha yakın genel kayıt kendi pending içeriğini gizlemez. Yerel taslaklar kalır. Uzak kendi postları indirilmez. |
| Aktivite, O8 | Yeni istemci ilk 15, devam 50 ister; eski istemci varsayılanı 50 kalır. Aynı post/yazar/engel/report kontrolleri sayfanın tek güncel transaction'ında paylaşılır. Post ikinci kez okunmaz, kilitler toplu çözülür. Kimlik engeli ve anonim mute bağımsızdır; uzaktaki not metni gönderilmez. |

Bu cache'ler yetki kaynağı değildir. Post/yorum/medya erişimi, hesap/engel/rıza, yayın, moderasyon ve sayaç yazmaları sunucuda kalır. Not/çeviri metni diske yazılmaz.

## Sabit dakika işi azaltıldı

`UserContextService.swift` ve `functions/src/userContext.ts`: Değişmeyen cihaz bilgisi 15 dakikalık heartbeat'e ayrıldı; model/OS/app/dil/saat dilimi veya rıza bağlamı değişimi yeniden gönderilebilir. Eski istemci dakika başı yollasa bile sunucu aynı snapshot'ı tekrar yazmaz. Yeni istemci sunucunun snapshot'ı güncel kabul ettiğini öğrenip tekrar çağrıyı atlar; throttled gerçek değişiklik kaybolmayıp yeniden denenir.

Heartbeat yeni analitik olay sayılmaz. Yeni installation/rıza/app sürümü bağlamı için olay saklanır. `received_at` gerçek snapshot tarihidir; daha seyrek cihaz/IP bilgisi canlı konum gibi gösterilmez. Konumun mevcut yükleme sıklığı ve 120 sn tazelik sınırı değiştirilmedi. Güncel tercih okuması, rıza sürümü ve upload'ın atomik hesap/rıza kontrolü korunur. Lokasyon-only çağrı gereksiz cihaz belgesini okumaz.

`functions/src/profile.ts`: `ensureProfile` hâlâ güncel Auth/hesap/silme/terms/kimlik/handle kontrollerini yapar. Değişmeyen özel profil verisi ve erişim durumu kısa dönüşlerde yeniden yazılmaz; last-seen en fazla 15 dakikada bir heartbeat alır. Kimlik/terms/durum değişikliği hemen yazılır. Erişim belgesinin mevcut durumunu kontrol etmek bir ek okuma getirir; iki değişmeyen yazmayı sıfırlamak bütün işlemi sıfır maliyetli yapmaz.

## Önce/sonra kanıtı

| Senaryo | Önce | Sonra / doğrulama kapsamı |
|---|---|---|
| `own_receipt`, henüz yayın yok | 5 mantıksal belge okuması | 3; askıya alınmış hesap postu okuyamıyor |
| Sekiz aynı paralel GIF araması | 8 dış çağrı | 1 dış çağrı; her kullanıcının hesap/kotası yine ayrı kontrol ediliyor |
| On cihazda push retleri | Bildirim kapalı/alındı var/kota dolu için ayrı ayrı 131 okuma | Ayrı ayrı 41; sıfır gönderim/yazma |
| Promosyon kapalı, on atama | 42 okuma, sıfır teklif | 3 okuma, atama sorgusu yok |
| Yeni hesap beğenileri 3→199, 197 onay kontrolü | Sentetik eski yol: 60.085 mantıksal belge okuması | Gerçek Firestore emülatöründe yeni yol: 394 nokta okuması + 197 sorgu, **0 beğeni/profil sonuç satırı**; 24 saat geçişi doğru onaylıyor. İpucu hazırlığı/boş sorgu asgarisi/indeks gideri ayrı. |
| Aynı not için 15 aktivite | Kayıt başına post/yazar doğrulaması ve tekrar post okuması | Sayfa içinde post bir kez, yazar bir kez; uzaktaki metin boş, anonimlik fark testi geçiyor |
| Aynı spotta altı postun hard delete'i | Worker post başına ayrı onarım | Batch için bir deneme; crash halinde kalıcı spot işi sonraki worker'da tamamlanıyor |
| Değişmeyen cihaz snapshot'ı | Her dakika tekrar cihaz/analitik yazması mümkün | Değişmediyse yazma yok; 15 dk heartbeat analitik oluşturmaz; taze konum ayrı kalır |

Mantıksal okuma sayıları üretim faturası değildir. Boş sorgu asgarisi, indeks girdileri, transaction retry, tetikleyiciler, Storage/GIPHY trafiği ve göç gideri ayrıca ölçülür. [Firestore ücretlendirmesi](https://firebase.google.com/docs/firestore/pricing). Yeni indekste kullanılan alanın tekil muafiyeti bileşik indeksi kaldırmaz. [İndeks kapsamı](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Backend TypeScript + birim testleri | 168 geçti |
| Gerçek Firestore maliyet/geçiş testleri | 13 geçti; göç dry-run/apply/aktivasyon/rollback dahil |
| Tam backend emülatör regresyonu | 167 geçti |
| Ayrı temiz not erişimi ortamı | 29 geçti |
| Firestore + Storage kuralları | 89 geçti; sunucu ipucu alanını istemci yazamıyor |
| Native cache/iptal/kapasite testleri | 9 geçti |
| Tam native | 236 test: 234 geçti, fiziksel cihaz isteyen 2 test atlandı; 16 harita + 9 cache testi dahil |
| Gerçek Firebase SDK + simülatör UI | 5/5 geçti: auth, kamerasız yayın, yerinde grup erişimi/sıralama, profil, kaydedilen/koleksiyon ikinci sayfası |
| Lokalizasyon | Release kontrolü ve katalog `--check` geçti; kaldırılan iki mesajın 22 eski çevirisi JSON kaynaklarından çıkarılıp katalog üretildi |
| Git diff biçimi | `git diff --check` geçti |

Testler Node 22 / Java 21 ile, yalnızca `demo-lociar` ve yerel emülatörlerde çalıştı. Native fiziksel kamera/GPS testleri simülatörde kabul kanıtı sayılmaz. Gerçek APNs teslimi, fiziksel pil/RAM/GPS, CI, canlı deployment ve aylık fatura bu sonuçlarla doğrulanmış değildir.

Artefakt kökü: `build/cost-optimization-20261023/`; dondurulmuş app/Info.plist hash'leri, `.xcresult` ve UI ekranları son başarılı `e2e-v2/` altında; native sonucu `e2e-v2/native-summary.json`, backend sonuç özeti `backend-summary.json`. Backend günlükleri `/tmp/lociar-cost-implementation-*.log`, maliyet/geçiş günlüğü `/tmp/lociar-cost-index-tests.log`. Gövde, kesin konum veya kullanıcı kimliği ek optimizasyon metriğine yazılmadı.

**UI regresyonunda yakalanan test altyapısı sorunu:** İlk yeni koleksiyon senaryosu başarısız oldu; SDK günlüğü yerel emülatöre TLS handshake hatası ve offline fallback gösterdi. Firebase 12.19.2 `useEmulator` yalnız host'u değiştirdiği için, `AppConfiguration.swift` içindeki mevcut DEBUG + sentetik `demo-lociar` kimliği + özel LAN + açık opt-in kapısında Firestore TLS kapatılıp bellek cache'i seçildi. Canlı kimlikler ve release yapılandırması bu kapıya girmez. [Resmî Apple SDK emülatör kurulumu](https://firebase.google.com/docs/emulator-suite/connect_firestore). Ardından aynı dondurulmuş son build ile 234 native ve beş UI senaryosu yeniden geçti; kaydedilen/koleksiyon ikinci sayfa ekranları dışa aktarılıp incelendi. İlk başarısız `e2e/` kanıtı silinmedi, son başarılı koşu `e2e-v2/`dir.

## Canlı geçiş ve geri alma

1. İlgili indeksleri dağıtıp READY durumunu doğrula. Yerel emülatör bileşik indeksleri zorunlu kılmadığı için emülatörde başarılı probe üretim READY kanıtı değildir. Uygulama kurallarını gevşetme; beğeni ipucu yazıcısı Admin SDK'dır.
2. Önce yeni `onLikeCreated` yayımlanır; eski yoğunluk tetikleyicisinin onay yolu bu sırada halen çalışır. Sonra yeni `onPostDensityWritten` ve eşleşen diğer Functions yayımlanır. Böylece onay yolunun olmadığı bir geçiş aralığı yaratılmaz. Tekrarlar idempotenttir.
3. Bayrak sıfır/eksikken eski tam onay yolu çalışır. Mevcut Functions ortamı/kimliği ile **önce dry-run** çalıştır:

   ```sh
   node functions/scripts/backfill-note-approval.mjs --project=lociar-2f38c
   ```

4. Sonuç ve göç gideri incelendikten sonra ipuçlarını hazırla ve doğrulayarak aç:

   ```sh
   node functions/scripts/backfill-note-approval.mjs --project=lociar-2f38c --apply --activate
   ```

   Araç yalnızca onay bekleyen konum notlarının beğenilerini tarar; AR ve onaylanmış/revoke edilmiş notlara göç yazması yapmaz. İkinci okuma geçişi eksik uygun kenar bulursa veya bileşik sorgu çalışmıyorsa bayrağı açmaz. Yalnızca sayaçlar loglanır; post/not metni ve kullanıcı kimliği dışa aktarılmaz. Dry-run da gerçek sorgu maliyeti oluşturabilir. Bu komutlar bu çalışmada üretimde yürütülmedi.

5. Yeni iOS, yeni özel liste API'si ve kendi yakın kayıtlarını kapsayan yanıt hazır olduktan sonra dağıtılır. Eski iOS yeni backend ile çalışır. Yeni iOS eski liste yanıtını version kontrolü nedeniyle yanlış veri olarak göstermez.
6. Yeni dizin yolunu kapatmak için:

   ```sh
   node functions/scripts/backfill-note-approval.mjs --project=lociar-2f38c --apply --deactivate
   ```

   Bu eski tam onay yoluna döner; ipuçlarını/kullanıcı beğenilerini silmez. Function kodu da geri alınacaksa önce eski yoğunluk onay yolu, sonra eski beğeni tetikleyicisi geri getirilir. Yayın doğrulamasındaki eski GIF kabul cache'i geri getirilmez.

Cloud Functions bölgesi `us-central1`, Blaze ve server-authoritative sözleşme korunur. Statik/CDN, yeni coğrafi bölge dizinleri, büyük sayaç dönüşümü, bağımsız spot tetikleyicilerinin birleştirilmesi, bütün yayın hazırlığına ek rate ön sorgusu ve düşük trafikli admin işleri bu pakette uygulanmadı; gerçek hacim/toplam gider ve güvenlik geçişi gerektiren ayrı işlerdir.
