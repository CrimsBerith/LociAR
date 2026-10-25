# Harita istek maliyeti uygulama kaydı — 23 Ekim 2026

Yerel başlangıç: `60afbca` ve mevcut kirli çalışma ağacı. Önceden var olan destek/ödeme değişiklikleri korunmuştur. Kullanıcı, v5 maliyet planının uygulanmasını istedi; bu kayıt uygulanan harita paketini ve ölçüm/geçiş koşullu işleri ayırır.

## Uygulanan davranış

- `MapRequestCoordinator`: gözlemlenmeyen kamera girdisi, tek bekleme işi, kullanıcı hareketinden sonra 1,2 sn sakinlik, ilk otomatik görünümde 200 ms, otomatik başlangıçlar arasında en az 2 sn.
- Tek özet isteği çalışır; yalnızca son görünüm bekler. A→B→A aynı A isteğine katılır. Gönderilmiş işi iptal etmek tasarruf sayılmaz. Geç gelen eski alan yanıtı yeni ekranı ezemez.
- Tam ve taze kapsam, boş sonuç dahil yeniden kullanılır. Genel ısı 300 sn, yakın/p7/grup 60 sn; en fazla 32 giriş/2 MiB tahmini bellek ve bellek uyarısında temizleme. Kesilmiş veya eski protokol yanıtı yalnızca aynı sorgunun sonucu olarak kullanılabilir.
- Yakın grup kapsamı gerçek sunucu yarıçapı ve sınır payıyla doğrulanır. 2 km cap daha büyük alanı tam saymaz. Antimeridyen kutuları doğru ayrılır.
- %12 zoom histerezisi; aynı grup verisini kullanan sayım/not sunumu yeni istek gerektirmez.
- Hesap, anonim gizleme, profil engeli, yayın/silme/rapor değişimlerinde kişisel özet ve açık grup gövdeleri geçersizleşir. Yeni oturuma eski yanıt yazılamaz. Yerinde okuma ve yorum grant'leri sunucudadır.
- Bilinen geçici ağ/servis/`busy` için en fazla üç otomatik tekrar ve 0–250 ms rastgele pay, ardından en az 60 sn kaynak devre kesicisi. Kamera hareketi sayacı sıfırlamaz; süre bitimi tek başına poll başlatmaz. Kota/yoğun alan, izin/kimlik/yanıt biçimi ve tanınmayan hata otomatik tekrar edilmez.
- Kapasite sınırında gerçek LRU kullanılır; cache hit'i TTL'yi uzatmaz. Açık grup geçersizleşirken bir okuma sürüyorsa eski gövde atılır, gerekirse tek yenileme sıraya alınır.
- Ekran veya uygulama arka plandayken yeni harita işi başlamaz. İptal edilmiş eski bekleme görevi yeniden açılan ekranın görev kaydını silemez.

## Gereksiz okumalar

- Backend haritası `nearby` ile otomatik tam gövde yüklemiyor; genel ısı veya metinsiz grup özeti çiziliyor. Grup açılana kadar not/yorum/medya okunmuyor.
- Harita metadata'sı hassas GPS beklemiyor. Not yayınlama ve yerinde okuma kendi taze konum akışını koruyor. Başarılı yayın haritayı notun konumuna odaklıyor.
- Yeni iOS grup ilk sayfası 15, devam sayfaları 50; eski istemcinin 50 varsayılanı korunuyor. Sunucu tam grubu taradığı için bütün sayfaları 15 yapmak derin kaydırmada maliyeti büyütüyordu. Devam isteğinde üye ipuçları tekrar gönderilmiyor. Yorumlar 15 + lookahead ile okunuyor.
- Gönderi detayında tüm beğeni/kayıt listeleri yerine ilgili iki belge; profil için tek takip belgesi. Ayrı `readLikeCount` başlangıç çağrısı kaldırıldı; sayım mevcut projeksiyondan başlıyor.
- Koleksiyonlar kullanıcı seçim sayfasını açınca yükleniyor. Auth dinleyicisinin ilk olayında yakın zamanda kurulmuş aynı kimlik/rol/terms sürümü tekrar bootstrap edilmiyor; açık oturum açma/yazma güvenliği sunucuda kalıyor.
- Sunucu harita/grup okumaları yazarları bütün istekte tekilleştirir; aynı yazar her 100 gönderilik parçada yeniden okunmaz. Her yeni istekte profil/silme kontrolleri tazedir; yetki cache'i eklenmedi.

## Sunucu uyumu

`readPublicContent map_groups` özet sürümü ve gerçek çember kapsamını döndürür. `readNoteDensity` sürüm ve mevcut `truncated` bilgisini taşır; p4–p6 yanıt koordinatları sabit geohash merkezidir, tek notun gerçek ortalaması değildir. p7'nin mevcut ince yerleştirmesi bu değişikliğe dahil edilmemiştir.

İndeks, güvenlik kuralı, Storage izni, Cloud Functions bölgesi veya minimum örnek kapasitesi değiştirilmedi. Yeni sunucu koleksiyonu eklenmedi. iOS eski sunucuda çalışabilir; geniş alan cache isabeti için sürüm/kapsam bilgisi gerekir. Yerel kod canlı dağıtım kanıtı değildir.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Xcode, iOS 26.5 / iPhone SE (3. nesil) simülatörü | `build-for-testing` başarılı |
| Native testler | 223 geçti, 0 başarısız; yalnızca fiziksel kamera/GPS gerektiren 2 test atlandı |
| Yeni koordinatör testleri, native toplamına dahil | 16/16 geçti |
| Firebase SDK ile uçtan uca UI | 4/4 geçti: kayıt/giriş, kamerasız yayın, yerinde grup erişimi/sıralama/ayrılınca kilitlenme, profil |
| Temiz `npm run test:notes` | 29/29 geçti; kaba koordinat gizliliği, özet kapsamı ve ilk 15/devam 50 tekrarsız sayfalama dahil |
| Functions birim testleri | 156/156 geçti; istek içi tekil yazar maliyeti ve sonraki istekte taze askıya alma kontrolü dahil |
| Firestore/Storage kuralları | 88/88 geçti; kurallar değiştirilmedi |
| Anonimlik entegrasyonu | 6/6 geçti; anonim gizleme/profil engeli ayrımı dahil |
| Yerelleştirme | Release kontrolü: 702 anahtar, 12 dil, 0 `needs_review`; katalog üretim kontrolü güncel |
| `git diff --check` | Geçti |

16 koordinatör testi; tek sakinlik penceresindeki 20 hareketi, taze kapsam içindeki 20 ayrı harekette ek ağ isteği olmamasını (boş sonuç dahil), A→B→A, geç yanıtı, hesap/engel neslini, görünmez ekranı, TTL'nin poll başlatmamasını, kesilmiş kapsamı, antimeridyeni, 2 km sınırını, zoom histerezisini, hata devre kesicisini, kota/busy ayrımını ve TTL'yi uzatmayan LRU'yu doğrular. Bu sayılar sahte saat/ağ testidir; üretim Firestore okuma veya fatura ölçümü değildir.

İlk UI koşusunda grubun sabit 10 not beklentisi yanlıştı: önceki senaryonun aynı konuma yayınladığı notla gerçek üyelik 11 oldu. Fixture beklenen sayıyı bağımsız Firestore üyeliğinden alacak şekilde düzeltildi; son koşuda yayın ve grup senaryoları birlikte geçti. Gerçek SDK koşusu yalnızca `demo-lociar` yerel Auth/Firestore/Storage/Functions emülatörlerini kullandı.

İlk paket kanıt dizini `build/map-cost-20261023-final/`: `native-summary.json`, dört UI `.xcresult` paketi, `accepted.json` ve başlangıç/bitiş uygulama artefakt hash'leri bulunur. Aynı dondurulmuş uygulama ürünleri test edildi. Grup testinin altı ekran görüntüsü `map-group-attachments/` içine aktarıldı; geniş ısı ve yerinde sıralı liste görsel olarak da incelendi. Son derin inceleme değişikliklerinin kanıt dizini `build/map-cost-deep-20261023/`; ayrıntılar `docs/release/MAP_COST_DEEP_AUDIT_2026-10-23.md`.

İlk paket CLI günlükleri: `/tmp/lociar-map-cost-e2e-final.log`, `/tmp/lociar-map-cost-notes.log`, `/tmp/lociar-map-cost-functions.log`, `/tmp/lociar-map-cost-rules.log`, `/tmp/lociar-map-cost-anonymous.log`. Son derin inceleme günlükleri: `/tmp/lociar-map-cost-deep-e2e.log`, `/tmp/lociar-map-deep-functions-final.log`, `/tmp/lociar-map-deep-notes.log`, `/tmp/lociar-map-deep-anonymous.log`. Bunlar yerel/geçici dosyalardır; depo belgesi test kapsamını kalıcı olarak kaydeder. Değişmeyen kuralların 88/88 sonucu ilk pakettendir; diğer tablodaki sonuçlar son koşuya güncellendi.

## Değişikliklerin ana giriş noktaları

- İstek planlama ve kapsam önbelleği: `LociAR/Features/Map/MapRequestCoordinator.swift`; testler: `LociARTests/MapRequestCoordinatorTests.swift`.
- Harita sunumu/yaşam döngüsü: `MapFeatureView.swift`, `NoteDensity.swift`, `PlaceNoteComposer.swift`.
- Oturum/engel/yayın geçersizleştirmesi: `AppSession.swift`, `FirebaseBackend.swift`, `SocialRepository.swift`; başlangıç tekrarının azaltılması: `AuthRepository.swift`.
- Detay/profil okumaları: `PostPreviewView.swift`, `PublicProfileView.swift`.
- Sunucu protokolü: `functions/src/publicContent.ts`, `functions/src/noteDensity.ts`; senaryolar: `functions/test/notes/place-notes.test.mjs`, `scripts/simulator-note-fixture.mjs`, ilgili UI testleri.
- Yeni Swift dosyaları için `xcodegen generate` ile proje referansları yenilendi. Başlangıçta mevcut ödeme/destek değişiklikleri korunmuştur.

## Koşullu veya kalan işler

Bu paket bütün 54 maddelik planın tamamlandığı anlamına gelmez. Genel karo disk önbelleği/CDN, ortak snapshot üretimi, yeni hücre/üyelik dizini, tüm spotu taramayan devam sayfası, toplu kaydedilenler/etkinlik API'leri ve diğer admin/sensör/sayaç paketleri ayrı değişikliklerdir. Mevcut sunucu yeni yakın alan için hâlâ kaynak post taraması yapar. “Tek callable” küçük Firestore maliyetinin tek başına kanıtı değildir.

Üretim faturası, canlı Firebase revizyonu, fiziksel pil/ısı/GPS/AR/APNs ve App Store/TestFlight bu yerel doğrulamayla kanıtlanmadı. CDN ve sıcak örnek kararı gerçek kullanım/üretim+dağıtım toplam gideriyle verilir.

## Nihai sonuç

Harita istemci paketi ve bu kayıttaki gereksiz okuma azaltımları yerelde uygulandı ve yukarıdaki kontroller geçti. Önceden var olan çalışma ağacı değişiklikleri korunmuştur. Commit/push, GitHub CI, canlı Firebase deploy veya mağaza dağıtımı yapılmadı. Statik/CDN ve yeni dizin aşamalarının uygulanmış olduğu iddia edilmez.
