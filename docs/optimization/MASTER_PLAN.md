# LociAR — Maliyet Öncelikli Optimizasyon Denetimi

**Tarih:** 23 Ekim 2026 · **Durum:** Aşama 0 envanter/izleme kuruldu; Aşama 1 sürüyor. Aşama 2–4 tamamlanmadı.

Bu belge onaylanan 54 paketlik planın uygulama kaydıdır. Bütün modüller değerlendirilmeden ürün optimizasyonuna geçilmez. Daha önceki çalışma ağacı ve optimizasyonlar başlangıç durumunun parçasıdır; bu turun kazanımı olarak sayılmaz.

## 1. Canlı durum tablosu

<!-- audit-status:start -->
Snapshot: 2026-10-23T18:00:46+00:00

- Envanter: 616 dosya; 1201 bağımlılık kaydı; sahipsiz dosya: 0.
- Kendi kaynak kodu: 267 dosya, 35344 satır; açıkça incelenen 7585 satır.
- Tam değerlendirilmiş paket: **0/54**. Rapor dosyası oluşturmak değerlendirmeyi tamamlamaz.
- Bulgu: 28; kanıt: 20; uygulama kapısı: **kapalı**.

| Paket | Başlık | Değerlendirme | Kaynak dosyası incelemesi |
|---|---|---|---|
| [U01](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U01.md>) | Açılış, container ve yönlendirme | in_review | 4/7 |
| [U02](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U02.md>) | SwiftUI ve Observation | in_review | 4/26 |
| [U03](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U03.md>) | Swift concurrency ve yaşam döngüsü | in_review | 20/60 |
| [U04](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U04.md>) | Ağ katmanı ve tekrar paylaşımı | in_review | 1/3 |
| [U05](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U05.md>) | Harita istek koordinatörü | in_review | 1/3 |
| [U06](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U06.md>) | Harita çizimi ve özet cache'i | in_review | 1/6 |
| [U07](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U07.md>) | CoreLocation ve erişim fix'i | in_review | 1/5 |
| [U08](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U08.md>) | Kampanya ve varış istemcisi | in_review | 2/5 |
| [U09](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U09.md>) | ARKit/GARSession yaşam döngüsü | in_review | 1/9 |
| [U10](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U10.md>) | AR yeniden konumlama ve anchors | in_review | 1/13 |
| [U11](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U11.md>) | RealityKit çizimi ve texture belleği | in_review | 2/4 |
| [U12](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U12.md>) | On-device çeviri | pending | 0/5 |
| [U13](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U13.md>) | Avatar, GIF ve ImageIO | in_review | 5/6 |
| [U14](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U14.md>) | SwiftData, outbox, migration | in_review | 2/7 |
| [U15](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U15.md>) | Native sosyal listeler | in_review | 2/10 |
| [U16](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U16.md>) | Composer ve publish | in_review | 1/8 |
| [U17](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U17.md>) | Kimlik ve yerel veri temizliği | pending | 0/6 |
| [U18](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U18.md>) | Native push ve arka plan | in_review | 2/3 |
| [U19](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U19.md>) | Callable/HTTP giriş maliyeti | in_review | 28/72 |
| [U20](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U20.md>) | İstek içi güvenlik bağlamı | in_review | 4/7 |
| [U21](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U21.md>) | Sorgu ve indeks envanteri | in_review | 37/102 |
| [U22](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U22.md>) | Transaction ve batch | in_review | 28/74 |
| [U23](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U23.md>) | Post kabulü ve moderasyon | in_review | 1/9 |
| [U24](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U24.md>) | 25 m grup geometrisi ve erişim | in_review | 5/7 |
| [U25](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U25.md>) | Yoğunluk ve coğrafi özet | in_review | 4/7 |
| [U26](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U26.md>) | Grup sayfalaması | in_review | 3/5 |
| [U27](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U27.md>) | Sosyal sunucu okumaları | in_review | 3/6 |
| [U28](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U28.md>) | Not bildirim onayı | in_review | 2/5 |
| [U29](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U29.md>) | Sayaç ve alındılar | in_review | 3/4 |
| [U30](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U30.md>) | Tetikleyici zincirleri | in_review | 1/5 |
| [U31](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U31.md>) | Kampanya sunucusu | pending | 0/5 |
| [U32](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U32.md>) | Push sunucusu | in_review | 3/3 |
| [U33](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U33.md>) | Hard delete ve hesap yaşam döngüsü | in_review | 2/7 |
| [U34](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U34.md>) | Storage, avatar ve Vision | in_review | 1/12 |
| [U35](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U35.md>) | Scheduler, TTL, reconciliation | in_review | 3/6 |
| [U36](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U36.md>) | Functions runtime | in_review | 2/9 |
| [U37](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U37.md>) | GIPHY sağlayıcı entegrasyonu | in_review | 3/5 |
| [U38](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U38.md>) | StoreKit ve Apple server | in_review | 4/8 |
| [U39](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U39.md>) | Stripe | in_review | 4/6 |
| [U40](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U40.md>) | NOWPayments | in_review | 4/5 |
| [U41](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U41.md>) | Resend ve giriş kodu | in_review | 1/5 |
| [U42](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U42.md>) | Next.js sunucu/istemci ayrımı | in_review | 11/126 |
| [U43](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U43.md>) | Admin auth ve RBAC | in_review | 7/38 |
| [U44](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U44.md>) | Admin sorgu ve analiz | in_review | 4/47 |
| [U45](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U45.md>) | Admin içerik, seed ve moderation | in_review | 1/37 |
| [U46](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U46.md>) | App Hosting gider ve runtime | in_review | 2/5 |
| [U47](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U47.md>) | Admin React UI ve erişilebilirlik | in_review | 1/104 |
| [U48](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U48.md>) | SPM/npm bağımlılıklar ve SBOM | in_review | 1/9 |
| [U49](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U49.md>) | Derleme, araç ve CI | in_review | 3/99 |
| [U50](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U50.md>) | Kaynaklar, l10n ve privacy | pending | 0/112 |
| [U51](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U51.md>) | Test sistemi ve kanıt geçerliliği | in_review | 1/138 |
| [U52](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U52.md>) | Gözlemleme ve Crashlytics | in_review | 1/8 |
| [U53](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U53.md>) | FinOps ve bütçe | in_review | 2/4 |
| [U54](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/docs/optimization/reports/U54.md>) | Geçiş, deploy ve geri alma | in_review | 3/115 |
<!-- audit-status:end -->

Dosya sayısı kapsam envanteridir; satır incelemesi veya runtime kanıtı değildir. 74 Swift + 72 Functions + 126 admin TS/TSX ilk dosya envanteridir. Admin içindeki iki E2E, iki araç yapılandırması ve bir generated declaration ayrıldığında kendi çalışma kaynağı 267 dosyadır. Test, araç, generated, asset, manifest ve politika dosyaları ayrıca izlenir. Vendor kayıtları 875 Functions + 312 admin + 14 SPM konumudur; lock konumu, benzersiz SBOM component ve uygulamada gerçekten kullanılan paket farklı sayılardır.

## 2. Kesin kararlar ve güvenlik sınırları

- Maliyet önce gelir; map hareketi için1–2sn ek birleştirme beklemesi kabul edilir. İstek, belge, byte, CPU/GPU, bellek ve enerji ayrı ölçülür.
- Hedef ölçekler100/1.000/10.000 DAU. Aylık bütçe, doğrulanmış unit rate, gerçek trafik dağılımı ve para tasarrufu şu anda null/bilinmiyor; sıfır değildir.
- Telefona çizim, ekran kümelemesi, istemci planlama, uygun önbellek ve görünürlük işleri taşınabilir. Yazma otoritesi, sayaç, moderasyon, ödeme ve güncel erişim kararı sunucuda kalır.
- Anonim yazarlar profile/likes/activity/storage/AR geometry karşılaştırmalarıyla belirlenememeli. Identity block ve anonymous mute bağımsız kalır.
- Başkasının uzak not metni sunucu tarafından redakte edilir. Harita zoomu, grup özeti veya session metne erişim hakkı vermez.10sn/35m fix ve farklı feature freshness kuralları gevşetilmez.
- Başkasının not/çeviri metni diske yazılmaz. Apple on-device Translation, runtime dil desteği ve kullanıcı tetiklemeli model izni korunur. Draft/outbox politikası ayrıca incelenir.
- Yalnız metin ve bir GIPHY GIF; legacy decode güvenli. Provider key cihazda olmaz; publish validation taze kalır. Provider cache/proxy izni belgesiz varsayılmaz.
- Hard delete ve Apple revoke abort, Storage/anchor temizliği, rıza ve AAL2 step-up korunur. TTL erişim yetkisi veya hard-delete yerine geçmez.
- iOS native/Firebase/App Hosting düzeni; Functions us-central1, Firestore nam5. Supabase/Expo/Android/Vercel veya yeni sürekli servis eklenmez.

Başlangıç parametreleri catalog.json ve audit-register.json içinde: map1200ms settle,2000ms start gap,1active+1latest pending,near60s/coarse300s,2MiB/32özet,ilk15/devam50 uygun listeler,server minInstances0. Bunlar bu tur yeniden uygulanmadı; mevcut değerler değerlendirme girdisidir.

## 3. Bu turda doğrulanan bulgular

Ayrıntı, kaynak hashleri, olması gereken, öneri ve kabul koşulları audit-register.json findings alanında ve ilgili U raporlarında.

| Öncelik | Bulgu | Kanıt ve sınırı |
|---|---|---|
| P1 | F003 grup geometrisi/okuma | Emulator17not153m yayılım; merkezden91m uzaktaki not gövdesi okunuyor. Canlı kullanıcı içeriği okunmadı. |
| P1 | F001 Next güvenlik aralığı | Yerel 16.3.8 üç npm bildirimine giriyor; patch adayı 16.4.1. Sharp 0.35.5 workaround mevcut; use cache/Server Actions işareti kaynak taramasında bulunmadı. Çalışan appte exploit iddiası yok. |
| P1 | F002 Firebase iOS yaması | Yerel 12.19.2; resmî 12.19.3 Firestore trust-store güvenlik düzeltmesi. SDK yükseltmesi henüz yapılmadı. |
| P1/sağlayıcı | F004 GIPHY | Standart proxy/cache şartları ile mevcut server-only sözleşme için yazılı istisna/uygun entegrasyon kanıtı açık. |
| P1/dağıtım | F025 canlı eşlik | Güncel salt-okunur readiness11finding:10support endpointi eksik ve map_group_sessions TTL yok. Dağıtım yapılmadı. |
| P2 | F005 geçersiz mod | Ret öncesi2point+400query sonucu. |
| P2 | F006 saved | 15own edge,415query sonucu+19point. Sadece ilgili taze kontroller aday; az engelli kullanıcıda point-get yaklaşımı daha pahalı olabilir. |
| P2 | F007 onay | Threshold3,mature300,indexed fixture:200liker+402point=602logical belge sonucu. Live approval flag doğrulanmadı. |
| P2 | F008 group pagination | 15+50gövde için600post sonucu; her yanıtta11.701byte IDs array. |
| P2 | F009 deletion | 10post171query;169empty;11session query. Query kapsamı azaltılmadan batch alternatifi incelenecek. |
| P2 | F010 no-op sayaç | Doğru counter için1unchanged update+1gerekli receipt create. |
| P2 | F011–F013 cevap yarışları | Activity cursor guard sırası; Discover ilk load; GIF query debounce generation. Source findings; runtime race kabul testleri henüz eklenmedi. |
| P2 | F014–F017 metadata/refresh/media | Avatar metadata consumer başına; aynı6region refresh6tur/1apply;8GIFconsumer8sentetik request;60snpreference loop. |
| P2/dev | F022 ip-address |10.7.3 moderate; npm explain dev firebase-tools zincirini gösteriyor. Prod Functions açığı olarak sunulmadı. |
| P2 | F026–F027 | Bakımda spot limiti toplam üye işini sınırlamıyor;push alıcı düzeyinde deny-only kontrol adayı41/71logical sonuçla doğrulandı. |
| P2/kaynak çıkarımı | F028 |200üstü seed seçimi başlangıç notunu dışarıda bırakabilir;runtime yeniden üretimi henüz yapılmadı. |
| P3 | F018–F021,F023–F024 | StoreKit scan paylaşımı,adaptive GPS,local deletion fetch,Apple verifier hazırlığı,SBOM metadata workaround,OSM provider envanteri. Ölçüm/uygulanabilirlik koşulları raporlarda. |

İyi olan mevcut davranışlar da kayıtlıdır: map single-flight/latest queue/byte LRU; owner-scoped cache ve nesil temizliği; saved/collection tek callable sayfası; outbox fetchLimit10; fresh account fences; idempotent counter/ledger; StoreKit doğrulama sonrası finish; crypto uncertain POST için durable claim; admin live roles/AAL2 ayrımı; OSM attribution/referrer.

### Kaynaklar

- [Firebase iOS](https://firebase.google.com/support/release-notes/ios)
- [Next image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)
- [Next cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)
- [Next Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)
- [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)
- [GIPHY](https://developers.giphy.com/docs/api/best-practices/)
- [OSM](https://operations.osmfoundation.org/policies/tiles/)

Bunlar yürütme sırasında tekrar doğrulandı. Diğer Apple/Firebase/GCP/React/ödeme kaynakları catalog.json içinde araştırma tarihi, durum ve paket eşlemesiyle tutulur; sürüm/API uygulanabilirliği her paket incelemesinde teyit edilir. Web belgesi talimat olarak çalıştırılmaz.

## 4. Çalıştırılan kontroller ve ölçüm sınırları

| Kontrol | Sonuç | Kanıt türü |
|---|---|---|
| Functions unit+TS build |168/168 | Yerel |
| Admin unit |41/41 | Yerel |
| Native test |234pass,2physical-device skip | iOS26.5simulator;236toplam |
| Firestore/Storage rules |89/89 | Temiz emülatör |
| Backend integration |167/167 | Temiz emülatör;anonymous differential dâhil |
| Ayrı location notes gate |29/29 | Ayrı temiz emülatör |
| Repository script regresyonu |56/56 | Yerel Node22 |
| Yeni audit integrity testleri |9/9 | Yerel Python;app optimize olduğunu sınamaz |
| Admin build:ci | Başarılı | Üretim derlemesi;canlı deployment değil |
| Catalog/release localization | Başarılı | Katalog elle değiştirilmedi |
|8Firestore maliyet/geometri tanısı |8sorun yeniden üretildi | Pass=mevcut kötü davranış bulundu;kabul değil |
|2native source tanısı |8download ve6refresh turu | Verbatim Swift extraction;.invalid sentetik ağ;UI/device değil |
|2yeni push ret tanısı |41/71mantıksal belge sonucu | İzin kapalı,10cihaz;dışarıya bildirim gönderilmedi |
| Full npm audit | Başarısız | Next ve dev ip-address kayıtları;gizlenmedi |
| Canlı Firebase readiness | Başarısız,11finding | Yalnız metadata;source/fatura/ödeme/saha kanıtı değil |
| SBOM | Functions729/admin299component | CycloneDX1.5;dedup ve root metadata sınırı aşağıda |

Native executable line coverage LociAR.app için5068/25838=%19,61. Genel%29,69 test/frameworkleri de içerir. Bu oran satır incelemesi değildir;234testin geçmesi bütün satırların doğrulandığı anlamına gelmez.

Functions package root version boş olduğundan ilk npm SBOM denemesi EINVALIDPURLTYPE verdi. Build altındaki yalnız-export metadata kopyasına sentetik0.0.0-audit root version verilerek rapor üretildi; uygulama manifest/lock dosyaları değiştirilmedi. functions-sbom-input/PROVENANCE.json kaynak hashlerini taşır. SBOM runtime link, bütün lisansların uygunluğu veya vendor kaynak incelemesi kanıtı değildir.

Fiziksel pil/GPS/APNs,Cloud Anchor/VPS,Release Instruments p50/p95,gerçek provider charge/refund/payout,gerçek fatura,GitHub CI ve App Store/TestFlight bu tur doğrulanmadı. Tam release-preflight npmci/install adımlarıyla çalıştırılmadı; ayrı başarılı kontroller full preflight PASS olarak adlandırılmaz.

## 5. Maliyet modeli

Model audit-register.json cost_model alanındadır.30gün ve100/1000/10000DAU için yoğun fixture hacimleri hesaplanır; para değerleri ve after alanı null kalır.

- Harita sentetik girdisi:2group açılışı/DAU/gün; her grup300not ve bir devam sayfası. Owner/same-author fixture; çok-yazarlı gerçek erişim maliyetini kapsamaz.
- Saved sentetik girdisi:1sayfa/DAU/gün;15own saved ve400ilgisiz block. Tipik kullanım varsayımı değildir.
- 20camera-end/DAU,2session ve10content-open plan girdileri parameter kaydında durur; henüz ölçülmüş istek sayısına dönüştürülmedi.
- Point read,query sonucu,query call,empty query,response byte ayrı alanlardır. Aggregate/index girdisi,transaction retry,tetikleyici,Storage rules FS read ve provider ek işleri tam ölçülmedi.
- Tüm aylık fatura:Firestore R/W/D/index/storage/network + FunctionsCPU/GiB/request + Storage operations/egress + Scheduler/TTL/reconciliation + Hosting/build/artifact/log/secret + provider giderleri.
- Ücretsiz pay proje genelinde ilgili zaman penceresinde bir kez uygulanır. Bütçe alerti,maxInstances ve uygun Cloud Run spend-cap bütün Firebase faturasına kesin tavan değildir.
- Geohash fallback80→1tanısı strateji farkını gösterir. Önceki canlı bayrağın zaten1olması nedeniyle yeni canlı tasarruf gibi sayılmaz.

Güvenlik/doğruluk düzeltmesi maliyeti artırabilir. Yeni indeks,statik karo veya kuyruk kendi yazma/üretim/saklama/temizlik/geçiş bedeliyle değerlendirilir. Ölçüm gürültüsünün altındaki fark kazanç yazılmaz.

## 6. Kayıt biçimi ve bütünlük

- catalog.json:54paket,scope patterns,hedef/kabul kontrolleri,resmî kaynaklar ve parametreler.
- audit-register.json:hashli dosya/bağımlılık envanteri,explicit review ranges,kanıt kayıtları,bulgular,maliyet modeli ve54V8eşlemesi.
- reports/U01–U54.md:9bölümlü raporlar. Bunlar kayıtların görünümüdür; sırf oluşturuldukları için değerlendirme tamamlanmaz.
- Regex işaret envanteri yalnız inceleme bulma aracıdır. Semantik çağrı grafiği veya eksiksiz query/billing denetimi sayılmaz.
- Own source review,unit decision,application status ve evidence kind ayrıdır. Source değişince line review ve unit scope eski sayılır; artifact değişince kanıt eski sayılır.
- Third-party her kayıt sürüm/lisans/security/privacy/reachability/binary-size ve kaynak erişimi sınırlarıyla değerlendirilecek; şu anda pending. Native resolved Ads/AppMeasurement runtime tracking kanıtı değildir.
- Önceki V8tablo1–54tam eşlendi; eski dosyanın hash ve satırları kayıtlı. Eski sonuçlar otomatik yeni pass taşımadı. D1/O1/A1gibi önceki bulgular ilgili raporlarla yeniden değerlendirilecek.

Denetim kapısı:own source tam current-hash review +54assessed package +tüm dependency assessments +current inventory hashine bağlı toplu portfolio. Fiziksel/dış kanıt eksikliği gerekçesiyle açık tutulabilir; tamamlandı olarak gösterilemez. Script semantik doğruluğu kendi başına ispatlamaz.

## 7. Kullanım ve devam sırası

Komutlar repo kökünde çalışır; hiçbirisi deploy,provider çağrısı veya uygulama optimizasyonu yapmaz.

~~~sh
python3 scripts/optimization_audit.py refresh
python3 scripts/optimization_audit.py check
python3 scripts/optimization_audit.py render
python3 scripts/optimization_audit.py check --require-assessed
python3 -m unittest discover -s scripts/test -p optimization_audit_test.py -v
~~~

Normal check yalnız envanterin güncelliğini ve sahipsiz dosya bulunmadığını denetler. require-assessed şu anda bilerek başarısızdır;bu bir app test arızası değil,eksik değerlendirme göstergesidir. Check salt okunurdur;refresh/render yalnız denetim dosyalarını yazar.

İnceleme kaydı yalnız gerçekten okunan satırlardan sonra review komutuyla path,START:END,note ve atanmış unit verilerek eklenir. Aynı satır aralığı çift sayılmaz;eski hash incelemesi kapsamı artırmaz. Unit tamamlandığında assessment_status,assessed_scope_sha256,decision ve ayrıntılı assessment raporu açıkça doldurulur. Dependency ve portfolio da kanıtla tamamlanır;otomatik toplu assessed işareti kullanılmaz.

Devam sırası:

1. Kalan bütün dosyaları ve bağlanan çağrı zincirlerini incele;generated girdileri,testler,assets ve bağımlılık uygulanabilirliğini tamamla.
2. P1geometri/SDK/framework bulgularının uygulama tasarımını tam rapora ekle. Bu sırada henüz ürün değiştirme.
3. Kaynak/IO/cost/failure/rollback alanlarını tamamla;100/1000/10000DAU iş yükü duyarlılığını ve gerçek birim fiyatları doğrula.
4.54paket değerlendirmesinden sonra current-hash portfolio:security/correctness→duplicate work→query/dataflow→device energy→net-positivearchitecture→secondaryops.
5. Gate açılınca küçük kod paketleriyle uygula ve önce/sonra kanıtla. Provider koşulu belirsiz paket ayrı kalır;diğer doğru işleri engellemez.
6. Matching index READY,dry-run/backfill,sonuç eşliği,eski client,flag ve rollback olmadan canlı geçiş tamamlandı denmez. Canlı ödeme,APNs/saha ve mağaza kanıtları ayrı kalır.

Tamamlanma raporu;zaten uygun,değişen,ölçülen kazanç,yeni gider,yerel/canlı/device kanıtı ve kalanları ayrı sunacak. Bu belgenin şu anki durumu tam değerlendirme veya tam optimizasyon sonucu değildir.
