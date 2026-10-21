# Konum ve anonim not düzeltmeleri — 13 Ekim 2026

Derin taramadaki F1–F9 bulguları ve harita yakınlık sıralaması düzeltildi. Uygulama/servis kaynak commit'i: `478c183`.

## Kullanıcıya yansıyan davranış

- GPS notu bırakmak veya haritada okumak için kamera, AR kaydı ve world lock gerekmez. Kamera akışı ayrıca kullanılabilir.
- Harita 1 km içindeki en yakın 100 notu seçer; yer grupları yakınlıkla, aynı yerin notları beğeniyle sıralanır. Yoğun yerlerde mevcut yerinde açma kuralı sürer.
- Görülmüş/gizlenmiş kayıtlar yeni bir notun bildirim adayları arasına girmesini engellemez. Tarama bütçesi aşılırsa servis açık hata verir; eksik taramayı "yeni not yok" diye sunmaz.
- Hassas konum penceresi bitince ön planda düşük güç moduna dönülür; arka planda aktif hedef kalmadığında sürekli konum ölçümü durur.

## Düzeltmeler

| Bulgu | Uygulanan değişiklik | Doğrulama |
| --- | --- | --- |
| F1 — uygunluk öncesi aday kesilmesi | Geohash sayfalama; makbuz, hesap, engel ve rapor kontrollerinden sonra 80/40 sınırı; yer uyarılarında da makbuz sonrası sınır | 80/40 görülmüş aday, 400 gizlenmiş aday ve açık bütçe aşımı regresyonları |
| F2 — eski anonim medya yolları | Kamuya açık edit verisi izinli alanlara indirgenir; eski kaynak/URI/texture alanları çıkarılır. Emekli medya klasörleri okunamaz ve listelenemez | Birim/entegrasyon ve Storage erişim testleri |
| F3 — kalıcı silme sonrası yanlış yer sayacı | Sunucuya özel kalıcı üyelik; silme ve tekrar teslimde idempotent temizleme; kaynak postlardan sayaç onarımı; devam edebilen hesap silme işi | Kalıcı silme, tekrar işleme, kilit ve hesap üyeliği temizliği regresyonları |
| F4 — hassas GPS güç durumu | Ortak konum modu kararı; pencere kapanışı ve hedef yenilemesi aynı geçişi uygular | Native konum modu testleri ve imzalı Release arşivi |
| F5 — 200 üzeri beğeni eşiği | Beğeniler sayfalı okunur; en az 24 saatlik farklı hesaplar sayılır; silinmekte olan hesaplar dışlanır | 201 geçerli beğeni ve hesap silme engeli regresyonu |
| F6 — döngülü kampanya | Adım yalnız daha önceki bir adıma bağımlı olabilir | Admin ileri/döngülü bağımlılık testleri |
| F7 — uzun sokakta eksik izleme | 3 km uyandırma çemberine sığmayan sokak admin tarafından reddedilir; eski büyük tanım kırpılmış kapsamla dağıtılmaz | Admin sokak kapsamı testleri; canlı eski tanım kontrolü |
| F8 — metin üzerinden URL | Admin ve Functions aynı URL kontrolünü kullanır; açıklama, metin katmanı, not ve kampanya metinlerinde uygulanır | URL birim/HTTP/callable regresyonları |
| F9 — kutup çevresinde boş sorgu | Geohash kapsaması üretilemezse sayfalı enlem sorgusu kullanılır | Kutup ve tarih değiştirme çizgisi regresyonu |

## Doğrulama

| Paket | Başarılı test |
| --- | ---: |
| Native iOS | 162 |
| Functions birim | 125 |
| Functions emülatör entegrasyonu | 162 |
| Firestore/Storage kuralları | 82 |
| Admin birim | 35 |
| Admin emülatör/HTTP/tarayıcı entegrasyonu | 89 |
| Repository betik regresyonları | 49 |
| Yerel toplam | **704** |
| Canlı admin genel sayfa/güvenlik tarayıcı testleri | 24 |
| Toplam | **728** |

Functions entegrasyon paketi, emülatör çalışırken yeniden derlemenin neden olduğu watcher yenilemesi ve ortak test ayarı temizlendikten sonra baştan, seri çalıştırıldı: 162 test, sıfır hata ve sıfır atlama. Admin üretim build'i geçti. Yerelleştirme kontrolü ve secret scan temiz; iki çalışma zamanı bağımlılık taramasında bildirilen açık sıfır. Canlı tarayıcı paketi genel/kimliksiz uçları kontrol eder; üretimde gerçek admin oturumuyla içerik mutasyonu ve TOTP challenge çalıştırılmadı.

Son native arşiv: `build/LociAR-AuditFixedFinal-20261013.xcarchive`. İmza `codesign --verify --deep --strict` ile doğrulandı; Crashlytics sembolleri yüklendi. Native test sonucu: `build/LocationAuditFixesFinal-20261013.xcresult`.

## Canlı servisler

**Dağıtım tamamlandı.** Firebase projesi `lociar-2f38c`, Functions bölgesi `us-central1`, Firestore `nam5`.

- Yeni Firestore indeksi ve Storage kuralları yayımlandı. Kaynaktaki **24 composite indeksin tamamı `READY`**; bu kontrol genel readiness betiğinden ayrı, alan/sıra/kapsam eşleştirmesiyle yapıldı.
- Değişen **11 Functions** bölgesel CPU kotasına uygun olarak tek tek yayımlandı: `createPost`, `createPlaceNote`, `readPlaceNoteRegions`, `recordPlaceNoteVisit`, `unlockDenseSpot`, `readPublicContent`, `onPostDensityWritten`, `reconcileNoteDensity`, `readCampaignZones`, `deleteAccount`, `retryAccountDeletions`. Her birinin dağıtım başlangıcından daha yeni `updateTime` ve `ACTIVE` durumu doğrulandı.
- Canlı metadata readiness: **PASS, sıfır bulgu**; 58 Functions aktif, 32 TTL ve 6 zamanlayıcı kaynak yapılandırmasıyla uyumlu. Bu metadata kontrolü fiziksel APNs teslimi veya uygulama içi işlevlerin tamamının üretim testi değildir.
- Not oluşturma, bölge sorgulama ve ziyaret kaydı için dört canlı kimliksiz callable isteği **401 / `UNAUTHENTICATED`** döndü; örnek üretim içeriği oluşturulmadı.
- [Admin paneli](https://lociar-admin--lociar-2f38c.us-central1.hosted.app) yerel kaynak arşivinden yayımlandı. Build `build-2026-10-13-002`; rollout **`SUCCEEDED`**, aktif trafik **%100 yeni build**. [Rollout](https://firebase.google.com/docs/reference/apphosting/rest/v1/projects.locations.backends.rollouts) ve [aktif trafik](https://firebase.google.com/docs/reference/apphosting/rest/v1/projects.locations.backends.traffic) API metadata'sı ile ayrı doğrulandı. Dağıtım sonrasında 24 masaüstü/mobil Chromium testi, sıfır hata ve sıfır retry ile geçti.

Canlı metadata raporu: `build/firebase-readiness/location-audit-fixes-live-20261013.json`. Ayrıntılı kanıt manifesti: `build/firebase-readiness/location-audit-fixes-20261013/verification.json`; test/dağıtım loglarının SHA-256 değerlerini, sürüm zamanlarını ve native arşiv hash'ini içerir.

Salt okunur eski veri kontrolünde dört emekli medya klasörü boş; erişim token'ı taşıyan eski dosya bulunmadı. Aktif zone kampanyası ve düzeltilmesi gereken büyük sokak tanımı yok. Bu kontrol üretime örnek içerik yazmadı.

## Gerçek cihazda henüz doğrulanmayan kısım

Fiziksel iPhone testi kullanıcının talebiyle sonraya bırakıldı. İmzalı arşiv henüz kullanıcılara dağıtılmadı; telefon tarafındaki GPS ve harita değişiklikleri yeni iOS sürümü kurulduğunda devreye girer. İmzalı arşiv, simülatör ve servis sonuçları; gerçek kapalı alan GPS'i, kilitli ekran/arka plan uyanması, APNs teslim süresi ve pil tüketimi ölçümü değildir. Bildirim alanı mevcut 15–100 m GPS çemberidir; uygun ölçümlerle 10 saniye doğrulama gerekir. Mağaza kapısından itibaren kesin 10–15 saniye teslim veya yan yana mağazaların 2–5 m hassasiyetle ayrılması garanti edilmez.

Kanıtlar `build/firebase-readiness/location-audit-fixes-20261013/` altında tutulur. Bu dizin ve JSON/log dosyaları yalnız yerel kullanıcıya açıktır.
