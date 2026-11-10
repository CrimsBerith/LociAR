# LociAR — derin tarama, 13 Ekim 2026

İncelenen kaynak: `bfb111239b62db1f65abc1993429b5171742f6ff`.

**Sonuç: 9 düzeltilebilir bulgu.** İki P1, altı P2, bir P3. Sekiz bulgu grubu 10 özel tekrar üretme senaryosuyla doğrulandı; GPS güç durumu bulgusu kod akışı üzerinden doğrulandı. Bu çalışma uygulama kodunu veya canlı servisleri değiştirmedi. Önceki optimizasyonları yeniden hata olarak saymaz.

P1: temel bildirim akışını veya anonimlik sözleşmesini bozar; yayından önce öncelikli düzeltme. P2: işlev, ayar veya enerji kullanım hatası. P3: düşük sıklıklı coğrafi uç durum.

## Kullanıcının göreceği sorunlar

| Öncelik | Bulgu | Kullanıcıya etkisi |
| --- | --- | --- |
| P1 / F1 | Not adayları, uygunluk kontrollerinden önce kesiliyor | Ziyaretçinin henüz görmediği mağaza notu varken bildirim gelmeyebilir. Aynı sorguyu tekrar çalıştırmak sorunu çözmez. |
| P1 / F2 | Eski anonim medya alanlarında hesap kimliği kalıyor | Eski bir anonim fotoğraf/texture kaydının dosya yolu gerçek yazarın UUID'sini gösterebilir. Yeni metin/GIF notlarında bu örnek sızıntı oluşmadı. |
| P2 / F3 | Kalıcı silme, yoğun yer sayacını düşürmüyor | Artık olmayan notlar sayılıyor; kalan notlar yanlışlıkla kilitli kalabiliyor. |
| P2 / F4 | Hassas GPS sonrasında güç durumu eksik toparlanıyor | Ön planda gereksiz yüksek doğruluk sürüyor; yenileme bütün hedefleri kaldırdığında arka plan ölçüm penceresi açık kalabiliyor. |
| P2 / F5 | Beğeni eşiği ile okuma sınırı uyumsuz | Admin 201–1000 eşiği seçerse otomatik bildirim onayı o eşiğe hiçbir zaman ulaşamıyor. |
| P2 / F6 | Döngülü kampanya adımları kabul ediliyor | Birbirini bekleyen iki adımlı kampanya kaydediliyor ama hiç başlamıyor. |
| P2 / F7 | Uzun sokak bölgesi eksik izleniyor | Kullanıcı tanımlanan sokağın ucuna girdiğinde uyandırma çemberinin dışında kalabiliyor. |
| P2 / F8 | AR post metninde URL yasağı uygulanmıyor | Link metni normal metin katmanı ve açıklaması üzerinden sunucuya kaydedilebiliyor. |
| P3 / F9 | Kutba yaklaşan not sorgusunda alternatif tarama yok | Geçerli bir not kullanıcının tam konumunda olsa da boş bölge listesi dönebiliyor. |

## F1 — aday sınırları yeni notları kalıcı olarak dışarıda bırakıyor

Kaynaklar: [bölge adayları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/placeNotes.ts:134>), [ziyaret adayları](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/placeNotes.ts:206>), [geohash sayfası](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/placeNotes.ts:69>).

Üç ayrı noktada aynı veri kaybı oluşuyor:

1. `readPlaceNoteRegions`, yakınlık sırasındaki ilk 80 kaydı alıyor; ancak ardından görülmüş, raporlanmış veya erişilemez notları eliyor. İlk 80 kayıt görülmüşse 81. geçerli not değerlendirilmez. İlerleyen bir cursor bulunmadığından sonraki yenileme de aynı ilk 80 kaydı alır.
2. `recordPlaceNoteVisit`, beğeni sırasındaki ilk 40 kaydı alıyor; ardından yaşam boyu teslim makbuzlarını kontrol ediyor. Bu 40 not görülmüşse 41. yeni not için `nothing_new` döner.
3. `approvedNear`, geohash aralığının yalnız ilk 400 kaydını alıyor. 400 m ve daha küçük aramalarda dolu sayfa tamamlanmış gibi kullanılıyor. Sorgu sadece `push_state` ile filtrelendiğinden hâlâ `approved` olan gizlenmiş/silinmiş kayıtlar da bu sayfayı doldurabilir. Büyük aramada yarıçapın sessizce küçültülmesi de kapsamı değiştirir.

**Tekrar üretme:** 80 görülmüş + bir yeni not: üç ardışık sorguda `regions: []`. İlk 80 aday sorgudan çıkarıldığında yeni not bulundu. Aynı yerde 40 görülmüş + bir yeni not: `nothing_new`; bir görülmüş aday sorgudan çıkarılınca yeni not gönderildi. 400 gizlenmiş kayıt + bir aktif not: aktif not sorgu sayfasının dışında kaldı; tek gizlenmiş kayıt çıkarıldığında gönderildi. Üç senaryo da gerçek emülatör callable uç noktalarından çalıştırıldı.

**Düzeltme:** geohash aralıklarını cursor ile tamamla; makbuz ve görünürlük kontrollerini gruplar halinde sürdür; 80/40 sınırını uygun sonuçlara uygula. Maliyet bütçesi dolarsa açık bir `resource-exhausted` veya devam bilgisi dön. Eksik taramadan `nothing_new` üretme. Yeniden teslim ve anonimlik kontrollerini koru.

## F2 — eski anonim medya yolları hesap kimliğini açığa çıkarıyor

Kaynak: [publicContent.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/publicContent.ts:34>).

`pose` ve `anchor_bundle`, `anonymousGeometry` ile temizleniyor. `edit_data` ve `content_source` ise olduğu gibi çözülüp yanıta konuyor. Eski bir image katmanının `uri`, eski `surfaceTextureUri` veya kaynak medyanın `url` alanı `storage://…/{gerçek-yazar-UUID}/…` içerirse, sahte `creator_id` kullanılmasına rağmen gerçek hesap kimliği JSON içinde kalır. Dosyayı indirme izninin kapalı olması, dosya yolunda taşınan kimliği gizlemez. Profil kayıtlarının okunabilir olması da bu UUID'nin profil ile eşleştirilmesine izin verir.

**Tekrar üretme:** eski medya alanları bulunan anonim fixture için `readPublicContent(mode: single)` çağrıldı. `creator_id` post ID'sine maskelendi; hem `edit_data` hem `content_source` gerçek yazar UUID'sini içerdi.

**Canlı kapsam:** bu turdaki salt okunur üretim taraması `posts` koleksiyonunda **0 kayıt** buldu. Bu bulgu aktif bir kullanıcı verisi sızıntısı kanıtı değildir. Eski kayıtların yeniden içe alınması veya benzer bir legacy kaydın bulunması halinde oluşan kod açığıdır.

**Düzeltme:** herkese açık anonim projeksiyonu tüm alanlarda izin verilen anahtarlar üzerinden üret; kimlik taşıyan eski medya ve texture yollarını çıkar. Eski çizim çözümlemesini koru; kaldırılmış medya/link özelliklerini yeniden açma. Hem `single`, `nearby`, `discover`, `creator` hem kilitli/açılmış yoğun yer yanıtlarında yazar UUID'sinin tamamıyla bulunmadığını test et.

## F3 — hard delete sonrası yoğun yer sayacı eski kalıyor

Kaynaklar: [denseSpots.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/denseSpots.ts:49>), [silme akışı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/accountDeletion.ts:100>), [yoğunluk tetikleyicisi](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/noteDensity.ts:48>).

Küme üyeliği yalnız postun `spot_id` alanında duruyor. Post kalıcı silindikten sonra `syncSpotMembership(postId)` canlı postu okuyup `undefined` buluyor; eski kümenin kimliği kaybolduğu için sayacı azaltamıyor. `onPostDensityWritten` olayın önceki üyeliğini bu işleve aktarmıyor. Saatlik düzeltici yalnız mevcut postları taradığından silinen üyeyi onaramıyor. Hesap silme yolu da postları doğrudan kalıcı siliyor.

**Tekrar üretme:** gerçek beş üyeli küme oluşturuldu; bir post kalıcı silindi ve üyelik eşitlemesi çalıştırıldı. Dört canlı post kaldı, sayaç hâlâ beşti. Yoğunluk eşiği beşken dört kalan postun tamamı yanlışlıkla kilitli kaldı. Sayaç fixture içinde şişirilmedi.

**Düzeltme:** yoğunluk hücrelerindeki yaklaşım gibi server-only kalıcı üyelik kaydı kullan. Postun yok olduğu durumlarda da eski üyeliği transaction içinde bul; yeniden teslimde ikinci kez azaltmayı önle. Mevcut kümelerin gerçek üyelerini sayan onarım ekle. Küme ilk oluşturulurken `members` ile `members.slice(0, 200)` arasındaki kapsam farkını da aynı işlemde kaldır.

## F4 — GPS güç durumu bütün çıkışlarda toparlanmıyor

Kaynaklar: [pencereyi kapatma](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/LociAR/AppCore/CampaignArrivalService.swift:615>), [normal ön plan modu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/LociAR/AppCore/CampaignArrivalService.swift:335>).

`stopPreciseWindow()` hedefleri temizleyip `setLowPower(false)` ve `distanceFilter = 1` yapıyor. Uygulama ön plandaysa konum güncellemelerini durdurmuyor. Böylece iş bitiminde normal 10 m doğruluk / 10 m filtre moduna dönmek yerine en yüksek doğrulukta kalıyor. Sonraki izin/ayar/ön plan yenilemesi bunu düzeltebilir; normal tercihler döngüsünde bu yenileme yaklaşık dakikada bir gerçekleşir.

Ayrıca `synchronize()` yeni bölge listesiyle `precisionTargets` kümesini boşaltabiliyor ama mevcut hassas pencereyi bu durumda kapatmıyor. İptal edilmiş veya kaldırılmış son hedef için ölçüm, pencerenin zaman aşımına kadar sürebilir.

**Kanıt sınırı:** dallar ve CLLocationManager ayarları koddan doğrulandı. Gerçek pil yüzdesi, enerji tüketimi ve cihazdaki GPS callback sıklığı ölçülmedi.

**Düzeltme:** konum çalışma modunu tek yerde hesapla: geçerli hassas hedef varsa hassas; yalnız ön planda izleme gerekiyorsa düşük güç; diğer durumlarda standart GPS kapalı. Son hedefin teslim edilmesi, silinmesi, zaman aşımı, izin değişimi ve kategori kapatılması aynı toparlama yolunu kullansın. ACK işlemini GPS'e yeniden bağlama.

## F5 — 200 üzeri beğeni eşiği otomatik onaylanamıyor

Kaynaklar: [admin eşik aralığı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/admin/lib/place-notes.ts:106>), [sunucu beğeni sorgusu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/noteAutomation.ts:30>).

Admin 1–1000 aralığını kabul ediyor. `autoApproveNote`, en fazla 200 beğeni okuyup bunların içindeki en az 24 saatlik hesapları sayıyor. Sonuç 200'ü aşamayacağından 201–1000 aralığı erişilemez.

**Tekrar üretme:** eşik 201; 201 farklı, iki günlük aktif hesap ve 201 beğeni. `autoApproveNote` false döndü; not otomatik bildirim onayı almadı.

**Düzeltme:** ayar aralığı ile gerçek tarama kapasitesini eşitle. 1000 desteklenecekse profilleri ve silme engellerini kontrollü sayfalarda değerlendir; eşiğe ulaşıldığında dur. İlk sayfadaki genç hesapların sonraki sayfalardaki uygun hesapları engellemesini de test et.

## F6 — döngülü adım bağımlılıkları kabul ediliyor

Kaynak: [campaign-journeys.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/admin/lib/campaign-journeys.ts:77>).

Doğrulayıcı, bağımlı adımın mevcut ve kendisinden farklı olmasını kontrol ediyor; gerçekten önceki adım olmasını veya bağımlılık grafiğinin döngüsüz olmasını denetlemiyor.

**Tekrar üretme:** `s1 requires s2`, `s2 requires s1` kabul edildi. Boş ilerleme durumunda `requirementMet` iki adım için de false döndü. `readCampaignZones` bu nedenle başlatılacak adım sunamaz.

**Düzeltme:** mevcut ürün sıralı yolculuk olduğundan bağımlılığı yalnız önceki adımlara izin verecek şekilde doğrula. Daha genel grafik desteklenirse döngü kontrolü ve başlangıç düğümü gereksinimi uygula. Kullanıcıya kaydetmeden açıklayıcı hata göster.

## F7 — uzun sokaklar uyandırma çemberini aşıyor

Kaynaklar: [sokak doğrulaması](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/admin/lib/campaign-journeys.ts:50>), [uyandırma yarıçapı](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/campaignJourneys.ts:66>).

Admin 2–20 geçerli noktalı sokak için uzunluk veya kapsayan yarıçap sınırı koymuyor. Sunucu ise sokağın kapsayan çemberini 3000 m ile kesiyor. Hassas ölçümü başlatan native kod bu kesilmiş çemberi kullanıyor. Sonuçta tanımlı sokağın bir kısmı arka plan uyandırma kapsamının dışında kalıyor.

**Tekrar üretme:** yaklaşık 8.9 km uzunluğunda geçerli sokak kabul edildi. `zoneBounds` kapsayan yarıçapı 4458 m hesapladı; yayınlanan uyandırma yarıçapı 3000 m oluyor. Bu, mağazalar arasındaki uzun bir cadde senaryosunda da oluşabilir.

**Düzeltme:** ilk adımda izlenebilir azami uzunluğu doğrulayıp sınırı aşan tanımı reddet. Daha uzun güzergâh desteklenecekse birkaç uyandırma çemberine ayır; aynı adım için tek ilerleme/teslim makbuzu kullan ve iOS bölge bütçesini koru. Yakın segmentlere göre bölge seçimini yenile.

## F8 — düz metin URL, AR post yasağını geçiyor

Kaynaklar: [placement.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/placement.ts:192>), [admin metin girişi](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/admin/lib/content-ops.ts:18>).

Politika medya/link kaynak nesnesini ve katmanın `uri` alanını kontrol ediyor. Açıklama ve metin katmanlarında URL kontrolü bulunmuyor. Konum notundaki `plain()` bunları engellerken AR postu aynı metni kabul ediyor. Admin açıklama/metin doğrulayıcısı da aynı eksikliği taşıyor. Bu bulgu otomatik açılan bir web bağlantısı veya XSS kanıtı değildir; "URL içeren yeni post kabul etme" sözleşmesinin uygulanmamasıdır.

**Tekrar üretme:** açıklaması ve text katmanı `https://example.com/product` olan yeni anonim `createPost` çağrısı kabul edildi, `pending_review` kaydedildi. Varsayılan moderasyon kapısı korunuyor; ancak yasak içerik ilk kabul kapısını geçiyor.

**Düzeltme:** metin URL denetimini konum notu, AR post ve admin yeni post/edit işlemlerinin ortak giriş politikasına taşı. GIF kimliğinden sunucunun kurduğu GIPHY medya adreslerini kullanıcı metniyle karıştırma. Legacy kaynakların güvenli çözülmesini ve linklerin gösterilmemesini koru.

## F9 — kutup çevresinde boş geohash listesi boş sonuç sayılıyor

Kaynaklar: [geo.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/geo.ts:44>), [placeNotes.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/placeNotes.ts:68>), [denseSpots.ts](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/functions/src/denseSpots.ts:34>).

`geohashCoverPrefixes`, çember bir kutba ulaşıyorsa alternatif tam sorgu isteyen boş liste döndürüyor. Genel `readPublicContent(nearby)` bunu enlem sorgusuyla karşılıyor. Not ve yoğun yer sorguları ise boş listeyi boş içerik sayıyor.

**Tekrar üretme:** 89.9999° enlemde ziyaretçinin tam konumunda geçerli onaylı not; `readPlaceNoteRegions` sıfır bölge döndü.

**Düzeltme:** F1'deki sayfalı coğrafi sorgu yardımcısına enlem alternatifi ekleyip not/yoğun yer sorgularında ortak kullan. Tarih değiştirme çizgisi ve kutup testlerini birlikte tut.

## Doğrulama ve canlı durum

Bu taramadaki taze sonuçlar:

- iOS: **161 test, 0 hata**; simülatör build/test başarılı. Sonuç paketi: `build/DeepAudit-20261013.xcresult`.
- Functions: **123 birim testi ve 152 tam entegrasyon testi, 0 hata**.
- Firestore/Storage: **82 güvenlik testi, 0 hata**.
- Admin: **35 birim testi ve 88 tam entegrasyon testi, 0 hata**.
- Canlı admin genel sayfaları: **24 masaüstü/mobil tarayıcı testi, 0 hata**.
- Özel tekrar üretmeler: **10 senaryo**. Üretim verisine yazmadan `demo-lociar` emülatörü ve gerçek doğrulayıcı modüller kullanıldı.
- Yerelleştirme: 646 uygulama anahtarı, 650 toplam anahtar, 12 dil; compiler'ın çıkardığı 615 anahtar katalogda mevcut.
- Secret scan temiz. Functions ve admin çalışma zamanı bağımlılıklarında `npm audit --omit=dev`: **0 bildirilen açık**. Bu, uygulama mantığının tamamının güvenli olduğu anlamına gelmez.
- Canlı Firebase metadata kontrolü: **PASS, 0 bulgu**. Functions, indeks, TTL ve zamanlayıcı hazırlığı doğrulandı; gerçek kullanıcıya APNs teslimi bu kontrolün kapsamı değildir.
- Salt okunur canlı `posts` taraması: **0 kayıt**, tam tarama, 0 geohash uyumsuzluğu; `--apply` kullanılmadı.

Tam Functions entegrasyon paketi bu turda yeniden çalıştırıldı ve geçti. Ayrıntılı loglar ve özel tekrar üretme kaynakları `build/deep-audit-20261013/` altında tutulur. Canlı metadata: `build/firebase-readiness/deep-audit-live-20261013.json`. [Kanıt manifesti](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261013/verification.json>); [10 tekrar üretme sonucu](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/deep-audit-20261013/reproductions.json>). Mevcut paketlerde toplam **665 test geçti**. Özel senaryolar mevcut kod hatalarını doğrular; henüz uygulanmış bir düzeltmenin regresyon testleri değildir.

Başarılı güvenlik testleri; server-authoritative yazma, anonimin ham postuna erişim engeli, sahipli Storage, hesap silme engelleri ve sosyal işlemlerin mevcut test kapsamı için geçerlidir. Admin oturum/MFA/origin/rate-limit girişleri ve ayrı izinli teknik/konum paylaşımı kod üzerinden incelendi; emülatör HTTP güvenlik/işlem paketi de geçti. TOTP kontrolü test claim'leriyle doğrulanmıştır; canlı TOTP challenge testi değildir. Oturum açmış gerçek adminin üretimde tüm mutation işlemlerini çalıştırma veya fiziksel telefonla bölgeye girme testi yapılmadı.

## Mağazaya giriş hedefinin pratik sınırı

Mevcut akış GPS çemberine girişi doğrular; hangi mağazanın kapısından geçildiğini bağımsız olarak ölçmez. Bildirim alanı 15–100 m, izin verilen doğruluk katkısı en fazla 20 m'dir. Yan yana mağazalar ve çok katlı yapılar bu yöntemle kesin ayrıştırılamaz. On saniye sayacı, uygun ve kesintisiz ölçüm akışı geldikten sonra başlar; kapıdan giriş anından itibaren kesin teslim süresi değildir.

Arka planda bölge değişince uygulamayı uyandırma mekanizması vardır; işletim sistemi ve izin durumu belirleyicidir. Apple, uygulama çalışmıyorken sistemi bölge olayı için başlatmayı deneyebileceğini ve yeniden açılışta izlemenin kurulması gerektiğini belirtir. iOS aynı anda en fazla 20 koşul izletir. [Apple bölge izleme dokümanı](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions).

Apple ayrıca arka plandaki uygulamaların askıya alınabileceğini ve zamanında konum güncellemeleri için uygun arka plan yapılandırması/oturumlarının gerektiğini açıklar. Kodda ilgili mekanizmalar bulunsa da fiziksel iPhone testi olmadan "uygulama kapalıyken mağazaya girdikten 10–15 saniye sonra her koşulda bildirim" doğrulanmış sayılamaz. [Apple arka plan konum dokümanı](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

## Uygulama sırası

1. F1: aday sayfalama ve uygun notlar üzerinden limit; F2: anonim projeksiyonun tüm alanlarını temizleme.
2. F3: kalıcı üyelik ve sayaç onarımı; F4: konum güç modunu bütün çıkışlarda toparlama.
3. F5/F6/F7/F8: ayar ve içerik girişlerini sunucu kapasitesi/ürün politikasıyla eşitleme.
4. F9: ortak coğrafi sorgu alternatifleri.
5. Her bulguya özel regresyonu normal test paketine ekleme; hedefli kontrol ve gerektiğinde deploy.
6. Son aşamada fiziksel iPhone ile mağaza girişi, kilitli ekran/arka plan, zayıf kapalı alan GPS'i ve pil ölçümü.

Bu sıralama mevcut anonimlik, explicit consent, App Check, moderation, 24 saatlik retry ve yaşam boyu teslim engelini korur.
