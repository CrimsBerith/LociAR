# Harita dışı optimizasyon fırsatları — 23 Ekim 2026

> **Güncel durum:** Bu dosya uygulama öncesi başlangıç denetimidir; aşağıdaki eski davranışlar güncel kodun durumu diye okunmamalıdır. Yerelde uygulanan karşılıklar, ölçülen sonuçlar, kapsam sınırları ve geçiş sırası [uygulama raporundadır](COST_OPTIMIZATION_IMPLEMENTATION_2026-10-23.md). Canlıya dağıtım yapılmadı.


Kaynak: `60afbca` + mevcut çalışma ağacı. Önceki harita paketleri korunarak iOS, Functions ve admin kod yolları yeniden incelendi. Aşağıdakiler uygulanmış özellikler değil, mevcut kaynakta doğrulanmış adaylardır. Etki sırası olay sıklığına ve veri hacmine bağlıdır; üretim faturası ölçülmedi.

**Devam eden derin inceleme:** [Olay zincirleri ve eşzamanlılık raporu](COST_CHAIN_DEEP_AUDIT_2026-10-23.md), 13 bulgu/ayrıntı ve 14 tanısal senaryoyla bu listeyi derinleştirir. Özellikle yeni hesap beğenilerinin tekrar taranması, push'ta geç ret, sunucu GIF aramalarının paralel tekrarı ve yayın GIF doğrulamasındaki altı saatlik cache uyumsuzluğu uygulama sırasını etkiler. Aşağıdaki eski 16 adayla yeni bulgular iki ayrı uygulanmış paket gibi sayılmaz.

## Öncelikli adaylar

| Kimlik | Öncelik | Mevcut davranış ve kaynak | Önerilen değişiklik | Etki / koşul |
|---|---|---|---|---|
| O1 | İlk paket | Anonim yeni gönderi de `public_post_count` yeniden sayımını tetikliyor; sayım bütün aktif/genel yazar gönderilerini okuyup anonim olanları sonuçtan çıkarıyor. `functions/src/triggers.ts:149`, `functions/src/counters.ts:30` | Önce/sonra için **atfedilen genel gönderi katkısı** hesaplanmalı; katkı veya ilgili yazar değişmiyorsa yalnızca profil sayımı atlanmalı. | Çok not üreten yazarda geçmişle büyüyen okuma kalkar. Storage reclamation, silme, onay bildirimi ve anonimlik kuralları aynı fonksiyonda çalışmaya devam etmeli. |
| O2 | İlk paket | `onProfileUpdated` sayaç değişiminde bile profil + `account_access` + silme işini okuyor; alan karşılaştırması bu okumalardan sonra. `functions/src/triggers.ts:206` | Yalnızca bilinen sayaç alanları değişmişse transaction öncesinde çık. | Takipçi/takip edilen sayısı gibi sık değişim başına üç hesap okuması azalabilir. Askıya alma/silme, bio/ad moderasyonu ve handle değişiklikleri atlanamaz. |
| O3 | İlk paket | Kaydedilenlerin kimlik sorgusu sınırsız; her kimlik ayrı `publicPost` callable'ına gidiyor ve hepsi paralel başlatılıyor. Koleksiyon ise en çok 500 kimlik okuyup aynı callable'ları seri çağırıyor. `LociAR/Data/SocialRepository.swift:192`, `:334`; `LociAR/Features/Social/ProfileListsViews.swift:166`, `:235` | Kaydedilenler için sunucuda sahiplik kontrollü imleçli sayfa; koleksiyon için aynı yol; ilk 15–25 öğe. Post ve tekil yazar kontrollerini sayfa içinde toplu yap. | Bir ekran açılışında yüzlerce çağrı oluşması önlenir. Sadece paralellik sınırı koymak maliyet sayısını azaltmaz; sayfa şart. Silinen/gizlenen öğe imleci durdurmamalı. |
| O4 | İlk paket | AR her açılışta 120 m yakın sorgusuna ek `myPosts(limit:50)` okuyor, sonra cihazda uzakları eliyor. `LociAR/Features/AR/ARExperienceView.swift:512`, `LociAR/Data/PostRepository.swift:155` | Yerel taslak + yetkili yakın aday yolunu ortaklaştır; kendi uzak son 50 kaydını otomatik yükleme. Önce yakın sorgunun kendi gönderilerini ve eski/pending taslakları doğru kapsadığını doğrula. | AR açılışı başına 50'ye kadar doğrudan gönderi okuması ve çözme işi azalabilir. Yakın API'nin ilk 100 sınırı, başka cihazda oluşturulan kendi içerik ve resolver verileri kaybolmamalı. |
| O5 | İlk paket | Sunucu görüntülenmeyi kullanıcı/post/UTC gün için tekilleştiriyor; istemcideki `didCountView` sadece tek View ömründe yaşıyor. Aynı detay yeniden açılınca callable yeniden gidiyor. `LociAR/Features/Social/PostPreviewView.swift:507`, `functions/src/posts.ts:224` | Başarılı sunucu alındısından sonra hesap + post + UTC gün anahtarlı sınırlı cihaz belleği ve devam eden isteği paylaşma. | Aynı gönderiyi tekrar açmada gereksiz transaction/callable önlenir. Sunucu alındısı korunur; başarısız istek sayılmış kabul edilmez. Bu cache toplam güncel görüntülenme sayısının kaynağı değildir. |
| O6 | İlk paket | GIPHY sunucu belleğinde cache var; fakat her arama cache hit olsa bile önce aktif hesap/kota transaction'ı yapılıyor. iOS repository'de sonuç cache'i yok. `functions/src/giphy.ts:140`, `LociAR/Data/GifRepository.swift:49` | Hesap/dil/normalize sorgu/ofset için sınırlı, kısa süreli **bellek** cache'i; aynı istekleri paylaş; arama terimlerini diske yazma. | Tekrar aramada callable + yaklaşık üç belge okuması + bir kota yazması önlenebilir (retry hariç). Anahtar cihazda olmaz; yayın sırasında sunucu GIF/rating doğrulaması korunur. |
| O7 | Sonraki paket | Kullanıcı bağlamı döngüsü her 60 sn tercihleri okuyor, izin varsa cihaz/konum yolluyor; cihaz snapshot'ına ek `app_foreground_context` analitik olayı yaratılıyor. `LociAR/AppCore/UserContextService.swift:117`, `:242`; `functions/src/userContext.ts:97` | Statik cihaz alanlarını değişiklik/foreground başlangıcında, seyrek heartbeat ile gönder. Konum akışını amacı/aktif kampanya/freshness ihtiyacına göre ayrı planla. Gereksiz dakika başı analitik olayını oturum/özet olarak değerlendir. | Telemetri + taze konum açık bir çevrimde tercih çağrısı 3, upload 5 mantıksal belge okuması; upload cihaz + analitik + konum için 3 yazma yapabilir. Bölge senkronu ve retry bunlara eklenir. Rıza iptali ve kampanyanın 120 sn tazelik ihtiyacı korunmalı. |
| O8 | Sonraki paket | `readActivity` ilk 50 olayı alıyor; her `place_note` için ayrı aktif hesap/post/yazar/engel/report transaction'ı, ardından aynı postu tekrar okuyup `denseLocks` çağrısı çalıştırıyor. `functions/src/anonymousAccess.ts:123` | İlk sayfayı 15–25 ölç; sayfa içi tekil post/yazar/engel bağlamı ve toplu kilit çözümü. | Not bildirimi ağırlıklı sayfada tekrarlar azalır. İşlem içindeki güncel kararlar korunmalı; bildirim listesi uzaktan not metni açamaz. |
| O9 | Dizin/göç | `readCampaignZones` coğrafi filtreyi sorguda uygulamıyor: aktif zone kampanyalarından en çok 300'ünü okuyup konuma göre sunucuda eliyor; sonuç en çok 8. `functions/src/campaignJourneys.ts:66` | Kampanya hücre/kapsam dizini + kullanıcı ilerlemesini yalnızca adaylarda oku; sürümlü doldurma ve eski/yeni eşitliği. | Kampanyaların coğrafyaya yayılmasıyla önemli olur. Sadece `limit(300)` düşürmek uzaktaki sıralama nedeniyle doğru kampanyayı gizleyebilir. Sınır geçen/geniş bölgeler eksilmemeli. |
| O10 | Dizin/göç | Yayın kabulü her defasında **bütün aktif korumalı bölgeleri** transaction içinde 250'lik sayfalarla tarıyor. `functions/src/protectedZones.ts:20` | Bütün yazıcıların atomik güncellediği sürümlü kapsama dizini; transaction içinde güncel sürüm ve ilgili hücreler. | Bölge sayısı arttığında gönderi başına gideri azaltır. Mevcut taze ve fail-closed sözleşme gevşetilemez; cihaz/cache kararı yayın izni veremez. |
| O11 | Sonraki paket | Kullanıcı adı değişince bütün yazar gönderileri okunup farklı `creator_handle` değerleri yazılıyor; anonim gönderiler ayrılmıyor. `functions/src/triggers.ts:180`, `:241` | Önce anonim kayıtlara gereksiz yazmayı atla; legacy alanları doğrulanınca sadece atfedilen içerik için dizinle sorgula. | Gönderi sayısı kadar yazma ve bunların tetikleyici çalışması azalabilir. Handle değişimi 30 günle sınırlı olduğundan sürekli sıcak yol değildir; gizlilik fark testleri şart. |
| O12 | Küçük, düşük riskli paket | Admin layout ve sayfa ayrı `requireAdmin` çağırıyor; ortak resolver request memoization kullanmıyor. Email yolu session belgesi, Auth kullanıcı durumu, silme/rol sorgularını yeniden yapabiliyor. `admin/app/admin/(protected)/layout.tsx:34`, `admin/lib/admin.ts:10`, `admin/lib/admin-session.ts:31` | Yalnızca aynı RSC render isteğinde ortak oturum çözümünü paylaş. Her sayfa kendi permission/AAL2 kararını uygulasın; API ve mutasyon taze kontrol etsin. | Admin trafiğinde tekrarlar azalır. Süreli global yetki cache'i kurulmaz; `React.cache` RSC istekleri için uygundur, Route Handler'lara aynı garantiyi vermez. |
| O13 | Ayrı güvenlikli paket | Anonim AR world map, 2 MiB parça başına iki `readablePost` kontrolü, Storage metadata ve base64 gövdeyle okunuyor; iOS anonim yolunda tekrar indirmeyi önleyen cache yok. `functions/src/anonymousAccess.ts:97`, `LociAR/Data/WorldMapStore.swift:168` | Aynı indirmeyi paylaş; kullanıcı/post/nesne generation/ofset/erişim sürümüyle sınırlandırılmış aktarım oturumu ve iptali koruyan yetkili cache tasarla. | Büyük/tekrar açılan AR içerikte ağ/CPU ve kontrol tekrarları azalır. Base64 ham byte'ı yaklaşık 4/3 oranında büyütür. Kalıcı bearer URL, yazar klasörü veya eski cache ile iptal aşımı yok. |
| O14 | Ölçüm sonrası | Sosyal sayaçlar her olayda `count()`; public profil sayımı ise belgeleri gerçekten getiriyor. Gece onarımı 100 post + 100 profile benzer kontroller uyguluyor. `functions/src/counters.ts:30`, `:75`; `functions/src/reconciliation.ts:29` | Önce O1/O2 gereksiz işi kaldır. Sonra sıcak ve büyük sayaçlarda teslim/üyelik nesliyle idempotent artış + imleçli onarım maliyetini karşılaştır. | `count()` kaynak N belgeyi istemciye getiren sorguyla aynı faturaya sahip değildir. Sırasız/tekrar olay, unlike→like, silinen alındı, admin offset ve hard delete yakınsaması bozulamaz. |
| O15 | Admin kullanımına bağlı | Analytics her sayfada 500 ham olay + tüm saklanan ve pencere olayları için iki aggregate çalıştırıyor. Özetin bu 500'lük sayfaya ait olduğu UI'da doğru belirtiliyor. `admin/app/admin/(protected)/analytics/page.tsx:31` | Küçük ham olay sayfası; gerçekten global rapor gerekiyorsa günlük özet ve sınırlı gecikme. Kendi özet üretim/onarım giderini de hesapla. | Sık analitik ekranı kullanımında kazanç. Mevcut sayfa özetini global benzersiz kullanıcı sayısı gibi sunma; yaklaşık veri varsa tarihini belirt. |
| O16 | Düşük öncelik | Sistem sayfası her render'da Firestore, Auth, Storage ve üç Function `OPTIONS` erişim kontrolü yapıyor. `admin/app/admin/(protected)/system/page.tsx:28` | Tarihli 30–60 sn sağlık sonucu veya kullanıcı tetiklemeli kontrol; canlı kill-switch okumasını/otoritesini ayır. | Birkaç admin için beklenen kazanç sınırlı; nadiren kullanılan sayfa büyük mobil sıcak yollardan önce ele alınmaz. |

## İki bulgu çalıştırılarak doğrulandı

Güncel TypeScript kaynakları `npm --prefix functions run build` ile derlendi. Gerçek `onPostWritten.run` ve `onProfileUpdated.run` girişleri çağrıldı; Firestore transaction işlemleri sahte bağımlılıkla değiştirildi. Gerçek Firebase'e veya emülatöre bağlanılmadı. Beklenmeyen belge yolu olursa kontrol hata verir.

```json
{"scenario":"anonymous_post_create","syntheticSourcePosts":250,"publicPostCountWritten":0,"counterReceiptWrites":1}
{"scenario":"profile_counter_only_update","accountStatusReads":3}
```

İlk örnekte bir yazarın 250 anonim aktif/genel kaydı temsil edildi. Yeni anonim gönderi için profil sayımı bu 250 satırı tüketti, sonuç yine sıfır oldu ve sayaç alındısı yazıldı. Bu, kod yolunun israfını gösterir; 250 gerçek faturalı üretim okuması ölçüldüğü anlamına gelmez. İkinci örnekte sadece `follower_count` 1→2 değişti; üç hesap durumu okuması yine çalıştı.

Artefaktlar: `build/cost-discovery-20261023/probe.mjs`, `probe-results.jsonl`, `backend-build.log`. Başlangıç kopyası `/tmp/lociar-cost-discovery-20261023.mjs`. `build/` ve `/tmp` geçicidir; bulgular burada kalıcı kaydedildi.

## Telefona taşınabilecek işler

- Başarılı görüntülenme alındısının aynı gün yeniden gönderilmesini önlemek (O5).
- GIF arama sonuçlarını kısa süre bellekte paylaşmak (O6).
- Liste sayfalarını ihtiyaç oldukça istemek ve sınırsız paralel çağrı üretmemek (O3).
- Yerel taslakları kullanmak, uzak kendi gönderilerini her AR açılışında indirmemek (O4).
- Statik cihaz bilgisi/değişiklik algılama ve amaçla sınırlı upload planlaması (O7).

Profil sayaçları, moderasyon, aktif hesap/engel/rıza ve yayın/yerinde okuma kararları sunucuda kalır. Genel kaba harita diski, yakın kişisel özet ve not metni aynı cache politikasıyla yönetilemez.

## Önce dokunulmaması gerekenler

- GIPHY aramasında sunucu sonuç cache'i **zaten var**; cihaz katmanı tekrar callable'ı önleyebilir. Derin inceleme D3 aynı süreçte devam eden aramaların paylaşılmadığını ayrıca doğruladı. Yayın doğrulamasının altı saatlik cache kullanması ise D13'te sözleşme uyumsuzluğu olarak ayrılır; arama cache'i ile aynı güvenlik kararı değildir.
- Görüntülenmede günlük sunucu alındısı **zaten var**; azaltılacak kısım tekrar eden çağrı ve okuma.
- Post/sayaç yazmalarında bazı erken çıkışlar **zaten var**; bütün post güncellemelerinin büyük sayım yaptığını söylemek yanlış olur.
- `admin/apphosting.yaml` zaten `minInstances:0`; sabit gideri azaltmak adına bunu tekrar yapılacak iş gibi sayma.
- Kaynakta yedi `onSchedule` tanımı var. Bunlar canlı scheduler envanteri/fatura değildir; silme ve avatar retry periyotlarını körlemesine uzatmak ilk tasarruf işi değildir.
- `count()` için N kaynak belge = N belge okuması varsayma. Aggregate fiyatı indeks girdisi üzerinden hesaplanır. [Firestore ücretlendirmesi](https://firebase.google.com/docs/firestore/pricing).
- Basit `increment` dönüşümünü otomatik kazanç sayma. Firestore olayları sırasız ve birden fazla teslim edilebilir. [Tetikleyici garantileri](https://firebase.google.com/docs/functions/firestore-events#limitations). Yazma anı aggregate seçimi veri ölçeğine bağlıdır. [Aggregate seçenekleri](https://firebase.google.com/docs/firestore/solutions/aggregation).
- Admin oturum paylaşımı sadece aynı RSC isteği içindir; her yeni istekte cache yeniden değerlendirilir. [React cache](https://react.dev/reference/react/cache).

## Önerilen uygulama sırası

1. **O1 + O2:** Anonim profil sayımı ve sayaçtan doğan hesap kontrolünü kaldır; önce/sonra mantıksal okuma sayısını ölç. Anonimlik, silme ve sırasız tekrar testleriyle doğrula.
2. **O3 + O4:** Kaydedilen/kolleksiyon sayfalaması ve AR kendi gönderi okuması. Boş/filtrelenmiş sayfa, başka cihazdaki kendi içerik ve kalabalık alan senaryoları gerekir.
3. **O5 + O6:** Sunucu onayını koruyan cihaz bellek cache'leri; hesap/dil/gün anahtarı, sınırlı boyut, in-flight paylaşımı ve başarısız yanıtı başarı saymama.
4. **O7 + O8:** Sabit upload/analitik işi ve not ağırlıklı etkinlik listesi. Taze rıza, konum ve uzak metin kilidi testleri gerekir.
5. **O9 + O10 + önceki harita üyelik/CDN işleri:** Sürüm, doldurma ve küçük trafik geçişiyle dizinler. Üretim+onarım gideri dahil kazancı ölç.
6. Admin, büyük dünya haritası ve sayaç mimarisi işleri gerçek kullanım dağılımına göre seçilir.

Bu turda uygulama/Functions/admin kaynak kodu değiştirilmedi. TypeScript derlemesi ve iki sentetik inceleme kontrolü geçti; yeni iOS build/UI, tam regresyon, CI, canlı deploy veya üretim fatura ölçümü yapılmadı. Daha önceki paketlerin test sayıları bu incelemede yeniden koşulmuş gibi sunulmaz.
