# Harita maliyeti derin inceleme — 23 Ekim 2026

İncelenen kaynak: `60afbca` üzerine mevcut çalışma ağacı ve ilk harita optimizasyon paketi. İnceleme; istemci zamanlayıcısı, hata politikası, kapsam/TTL/bellek, grup sayfalaması, yazar kontrolleri ve yoğunluk sorgularını kapsar. Bu kayıttaki değişiklikler yereldir; canlı Firebase/CI/App Store eşitliği doğrulanmadı.

## Düzeltilen bulgular

| Öncelik | Bulgu ve etkisi | Uygulanan düzeltme / kanıt |
|---|---|---|
| P1 | `resource-exhausted`, yoğun alan taramasının veya dolu kota penceresinin tekrarına yol açıyordu. Aynı başarısız koşul 2/5/15 sn içinde düzelmezken pahalı sorgu dört kez çalışabiliyordu. | Bu hata otomatik tekrar edilmez; 60 sn devre kesicisi korunur. Eski kodda yeni test dört çağrı buldu, beklenen bir çağrıydı. |
| P1 | Her sayfayı 15 yapmak, sunucunun her defasında bütün grubu okuduğu mevcut protokolde derin kaydırma maliyetini artırıyordu. | İlk sayfa 15, sonraki sayfalar 50; kendiliğinden devam sayfası alma yok. 120 not emülatör testinde 15+50+50+5 geldi; sıralama/tekillik ve güncel erişim testleri geçti. |
| P2 | Notları 100'lük parçalara ayırmak aynı yazarın profil/silme belgelerini her parçada yeniden okuyordu. | Önce bütün adayların tekil yazarları bulunur; RPC'ler en çok 100 yazar / 200 belgeyle sınırlanır. 260 aynı-yazar notunda hesap kontrolü 6 belgeden 2'ye iner. Sonraki istekte askıya alma tekrar okunur. |
| P2 | `busy_retry`, `BackendTransientError.busy` türüne çevrildiğinde koordinatör bunu kalıcı hata sayıyordu. Tanınmayan başka hatalar ise otomatik tekrar ediliyordu. | Bilinen `busy` tekrar edilir; duraklatılmış hizmet, kota, kimlik, biçim ve tanınmayan hatalar edilmez. Ağ hataları açık listeyle sınırlıdır; tekrarlara 0–250 ms rastgele pay eklenir. |
| P2 | Önbellek kapasite sınırında ilk eklenen alanı atıyordu; o alanın yakın zamanda kullanılması dikkate alınmıyordu. | Gerçek LRU uygulanır. Bir hit yalnızca kullanım sırasını değiştirir; TTL'yi uzatmaz. Yeni kapasite/son kullanma testi eski kodda hatayı yakaladı. |
| P2 | Hesap/engel nesli değişirken bir grup okuması sürüyorsa yenileme `isLoading` nedeniyle kaybolabiliyordu. | Eski gövde hemen atılır; süren okumadan sonra en fazla bir yenileme sıraya alınır. Kapanmış/arka plandaki sayfa için yeni okuma başlatılmaz; eski neslin hatası da yeni ekrana yazılmaz. |
| P3 | Her devam isteğinde bütün `postIds` yeniden gönderiliyordu. | Devam token'ı varsa üye kimlikleri sunucudaki oturumdan kullanılır; istemci boş ipucu listesi gönderir. İlk isteğin eski-ankor kurtarma yolu korunur. |

Kaynak gönderi okuması için 120 not örneği: bütün sayfalar 15 iken 8 × 120 = 960; ilk 15, devam 50 iken 4 × 120 = 480. Bunlar yalnızca aynı değişmeyen grubun kaynak post sorgularıdır. Hesap/engel, grup, oturum, yorum grant'i, indeks ve boş sorgu giderleri ayrıca vardır; aylık faturanın yarıya indiği sonucu çıkarılamaz. Eski 50'lik ilk sayfa düzeni aynı örneği 3 sorguda okurdu; 15'lik ilk sayfa, kullanılmayacak gövdeleri indirmemek için bilinçli bir ilk-yük tercihidir.

## Hâlâ en büyük maliyet kaynakları

1. **Yeni yakın alan ve devam sayfası kaynak postları tarıyor.** Önbellek hit'i bunu önler; miss veya her devam sayfası önlemez. Sabit sıralama oturumu erişim yetkisi değildir. Tam taramayı kaldırmak için canlı grup üyeliği/geometri sürümüyle uyumlu sunucu dizini gerekir. Eski spot çemberi veya oturumun geçmiş üye listesi tek başına yeni metin izni veremez. Eski/yeni sonuç eşitliği ve silme/engel/taşınma yarışları doğrulanmadan bu yol değiştirilmedi.
2. **Geohash göç bayrağı kapalıysa enlem şeridi sorgulanıyor.** Aynı enlemde, başka boylamdaki gönderiler de kaynak adaylarına girebilir. Bayrağı yalnızca bütün legacy koordinatların doldurulduğu kanıtlanınca açmak gerekir; yerel kaynağa bakarak üretim bayrağının durumu varsayılmadı.
3. **Isı sorguları gösterdiğinden fazla hücre okuyabilir.** Mevcut prefix başına 500 ve yanıt başına 1.500 sınırları kaynak okumalarının toplam sınırı değildir. Çok geniş görünüm, birçok prefix/boş sorgu ve kesilmiş yanıt oluşturabilir. Kesilmiş yanıt yalnızca kesin istekte yeniden kullanılır; tam alan gibi genişletilmez. Kısmi kapsama için ayrı kullanıcı yönlendirmesi sonraki UI iyileştirmesidir.
4. **Kısmen kapsanan yeni görünümde yalnızca eksik parçayı alma henüz yok.** %5 kenar payı küçük hareketleri karşılar; sınır aşılırsa yeni tam kapsam sorgusu yapılır. Gerçek karo kimlikleri olmadan üst üste binen iki yanıtı birleştirip tam/kanonik grup ilan etmek güvenli değildir.
5. **Genel p4–p6 statik/CDN ve disk yolu hâlâ kapalı.** Büyümede en güçlü aday budur; üretim, onarım, HTTP istekleri ve çıkış byte'ları dahil maliyet ölçülerek açılır. Yakın kişisel gruplar, p7 ve metin genel dosyaya konmaz.
6. **Grup yanıtı her sayfada bütün üye kimliklerini taşıyor.** Devam isteğinin upload'ı azaltıldı; response için eski istemci uyumlu, sürümlü kompakt metadata seçeneği ayrıca değerlendirilebilir. Bu, kaynak Firestore okuma sayısını tek başına azaltmaz.

## Ölçüm eklendi

- `map_density_query`: precision, prefix sorgu sayısı, kaynakta dönen belge sayısı, sorgu başına en az bir okuma hesabı, dönen hücre sayısı, kesilme ve süre.
- `map_group_page`: bulunan aday, görünür grup ve dönen sayfa boyutları, devam sayfası bilgisi ve süre. `candidatePosts` bir iş hacmi göstergesidir; tek başına bütün faturalı okumalar değildir.
- Bu yeni kayıtlar koordinat, viewport, hücre/post/grup/yazar kimliği, kullanıcı kimliği veya metin içermez. Log üretiminin kendi gideri de toplam işletim hesabına dahildir.

Firebase ücretlendirmesi belge ve bazı sorgularda indeks girdisi okumalarını da sayar; boş sorgu ücretsiz değildir. Buradaki `lat`/`geohash` sıralamasına ek `__name__` alanı, indeks okuma hesabı için özellikle kontrol edilmelidir. Gerçek indeks planı ve gideri staging/üretimde Query Explain ile ölçülmelidir. Analyze gerçek sorgu maliyetine tabidir; bu incelemede canlı analyze çalıştırılmadı. [Firestore ücretlendirmesi](https://firebase.google.com/docs/firestore/pricing), [Query Explain](https://firebase.google.com/docs/firestore/query-explain).

## Doğrulama

- Değişiklik öncesi: yeni üç native senaryo kota tekrarı, busy ve FIFO sorunlarını yakaladı. Backend maliyet testi 260 aynı-yazar notu için beklenen 1 yerine 3 hesap kontrolü RPC'si buldu.
- Değişiklik sonrası backend: 156/156 birim, 29/29 temiz not ve 6/6 anonimlik entegrasyonu geçti.
- Son Xcode derlemesi başarılı. Native 223 geçti / 0 başarısız / yalnızca fiziksel kamera ve GPS gerektiren 2 test atlandı; 16 koordinatör testi bu toplama dahildir. Önceki kodda başarısız olan kota/busy/LRU senaryoları düzeltmeden sonra geçti.
- Firebase SDK + yerel `demo-lociar` emülatörleriyle 4/4 UI senaryosu geçti: kayıt/giriş, kamerasız yayın ve otomatik harita görünümü, yerinde grup okuma/sıralama/ayrılınca kilitlenme, profil. Aynı dondurulmuş uygulama ürünlerinin başlangıç/bitiş hash'leri eşleşti.
- Yerelleştirme release kontrolü: 702 anahtar / 12 dil / 0 `needs_review`; katalog üretim kontrolü güncel. `git diff --check` geçti. Firestore/Storage kuralları değiştirilmedi; önceki paketin 88/88 kural testi bu incelemede yeniden çalıştırılmış gibi sayılmadı.

Kanıtlar: `build/map-cost-deep-20261023/native-summary.json`, `accepted.json`, native ve dört UI `.xcresult` paketi. CLI günlükleri: `/tmp/lociar-map-cost-deep-e2e.log`, `/tmp/lociar-map-deep-functions-final.log`, `/tmp/lociar-map-deep-notes.log`, `/tmp/lociar-map-deep-anonymous.log`. Değişiklik öncesi hatayı gösteren günlükler: `/tmp/lociar-map-deep-before.log` ve `/tmp/lociar-map-deep-backend-before.log`. Geçici günlükler silinebilir; bu belge kapsam ve sonuçları kalıcı kaydeder.

Canlı dağıtım, GitHub CI, üretim fatura/Query Explain, fiziksel pil/ısı/GPS/AR veya App Store/TestFlight kanıtı üretilmedi. Commit/push/deploy yapılmadı; önceden var olan değişiklikler korundu.

## Öncelik kararı

İlk koordinatör paketi korundu ve bu kayıttaki sınırlı düzeltmeler uygulandı. Sonraki büyük yatırım önce gerçek `sourceDocuments`/`candidatePosts`, cache hit oranı, kaydırma derinliği ve indeks giderini ölçmek; sonra yakın üyelik dizini ve genel statik karoları karşılaştırmaktır. Güvenlik kontrollerini telefona taşımak, yalnızca TTL'yi büyütmek veya sıcak sunucu açmak mevcut maliyet sorununun doğrulanmış çözümü sayılmaz.
