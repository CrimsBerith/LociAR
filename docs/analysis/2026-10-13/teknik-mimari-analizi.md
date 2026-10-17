# LociAR - Kod, admin ve mimari derin analiz

13 Ekim 2026 | Kaynak commit: 6052dcd | Native iOS + Firebase + Next.js

## 1. Kapsam ve kanıt yöntemi

Bu rapor güncel kaynak, API/işlev envanteri, güvenlik kuralları ve son yerel/canlı doğrulama kayıtlarını birlikte değerlendirir. Fonksiyonun kodda bulunması, canlıda ACTIVE olması ve gerçek telefonda çalışmasının kanıtlanması üç farklı düzeydir. Bu rapor bu düzeyleri birleştirip tek bir "tam hazır" etiketi üretmez.

Mobil hedef iOS 17+, Swift 6, SwiftUI, Observation, SwiftData, ARKit, RealityKit ve Core Location'dır. Proje XcodeGen ile project.yml'den üretilir. Firebase iOS SDK için kaynak gereksinimi 12.19.0'dan, ARCore için 1.56.0'dan başlar; bunlar paket gereksinimleridir, her bağımlılığın çözülmüş sürümü iddiası değildir. Backend Node.js 22 ve TypeScript'tir. Admin package.json Next ^16.3.8, React 19.3.0 ve TypeScript ~6.0.3 ister.

Firebase projesi lociar-2f38c, Firestore nam5, Functions us-central1 ve bucket lociar-2f38c.firebasestorage.app'tir. Admin Firebase App Hosting'de lociar-admin backend'i olarak çalışır. Uygulama mimarisinde Expo/React Native, Android, Supabase, Vercel veya elle yönetilen Docker dağıtımı yoktur. Son tam canlı metadata örneği 13 Ekim 2026, 02:26:46 Türkiye saatiyle toplanmıştır; sürekli izleme sonucu değildir.

![Sistem mimarisi](../../../output/pdf/images/04-sistem-mimarisi.png)

## 2. Mimari katmanlar ve bağımlılık yönü

AppContainer tek üretim composition root'udur. Yapılandırma, oturum, repository adaptörleri, yayın use case'i, yönlendirici, bağlantı gözlemcisi ve tek ARPinningEngine örneği burada bağlanır. SwiftUI Feature katmanı Firebase adaptörlerini kendi içinde oluşturmaz; dependency injection ile container'daki protokolleri kullanır.

RootView; onboarding, loading, signedOut, signedIn ve passwordRecovery durumları arasında geçiş yapar. Hesap değişiminde router sıfırlanır. Bağlantı geri geldiğinde ve ön plana dönüldüğünde kuyruk/sunum durumları yeniden eşlenir. Kullanıcı `.inactive` olduğunda her seferinde profil kurulumu başlatılmaz; izin penceresi gibi geçici kesintiler ile gerçek background dönüşü ayrılmıştır.

| Katman | Ana dosyalar | Sorumluluk |
|---|---|---|
| AppCore | AppContainer, AppSession, RootView, AppRouter, LociARApp | Bağımlılık bağlama, oturum, yaşam döngüsü ve yönlendirme |
| Features | Auth, Onboarding, Map, AR, Create, Social, Profile | Kullanıcı etkileşimi, ekran durumları ve hata/izin sunumu |
| Application | PublishPostCoordinator, PinCommitCoordinator | Yayın saga'sı, pin commit ve yan etkilerin sırası |
| Domain | Models, LocationNotePolicy, CampaignZone, ProximityPolicy | Veri kontratları, saf geometri ve davranış kuralları |
| Data | Auth/Post/Social/Gif repository'leri, WorldMapStore, SyncQueueProcessor | Firebase adaptörleri, kalıcı taslak ve kuyruk, veri çözümleme |
| ARCore | ARPinningEngine, ARCoreService, GeoPoseCaptureService, SpatialContentRenderer | Tek ARKit oturumu, Google çözücüleri, geometri ve render |
| DesignSystem | LociTheme, Localization, AnimatedGIFView | Ortak görünüm, lokalizasyon ve güvenli GIF sunumu |

Bu katmanlama bir mikroservis sistemi değildir. Firebase işlevleri tek TypeScript codebase'inden ayrı entrypoint'ler olarak dağıtılır; ortak helper'lar aynı runtime paketinde bulunur. Admin ayrı Next.js sunucusudur ve aynı Firestore/Storage/Auth kaynaklarına güvenilir Admin SDK ile bağlanır. UI-test/preview repository'leri ayrı adaptörlerdir; demo veya eksik yapılandırma dalının varlığı üretimde doğrudan Firestore yazma fallback'i anlamına gelmez.

## 3. İstek yolu ve güven sınırları

Üç temel veri yolu vardır. Birincisi Auth + üretim App Check ile callable çağrılarıdır. Post oluşturma/silme, profil kurma, handle, halka açık içerik projeksiyonu, görüntüleme, anonim engelleme, konum tercihleri ve bildirim cihaz kayıtları bu yolu kullanır. İkincisi Firestore Security Rules altında sınırlı istemci işlemleridir. Üçüncüsü Admin SDK'nın kuralları aşan sunucu işlemleridir; bu yolda uygulama düzeyinde MFA, RBAC, transaction ve audit denetimi zorunludur.

"İstemci Firestore'a hiçbir şey yazmaz" ifadesi yanlış olur. İstemci kendi beğeni/kayıt/takip/engel kenarlarını, yorumlarını, koleksiyonlarını ve raporlarını kurallar altında yazabilir. Profilin bio/display_name/avatar_preset gibi sınırlı alanlarını değiştirme istisnası da vardır. Ancak posts, sayaçlar, aktivite, gizli tercih/telemetri, push kayıtları, moderasyon ve hesap silme sonuçları sunucunun otoritesindedir.

![Veri yetkileri ve depolar](../../../output/pdf/images/07-veri-ve-guven-sinirlari.png)

| Yol | İstemci izni | Sunucu sonucu |
|---|---|---|
| posts | Doğrudan yazma yok; sahibin listesi veya izinli get istisnası | createPost/createPlaceNote + Admin SDK |
| likes, post_saves, follows | Kendi deterministik kimlikli kenarı; hedef ve hesap kontrolleri | Trigger kaynak satırları sayar, sayaç/aktivite üretir |
| comments | Sınırlı alanlar, metin en fazla 500 karakter; sahte username kabul edilmez | Sunucu profil adını doldurur ve filtre/moderasyon uygular |
| collections, collection_items | Sahibine bağlı okuma/yazma | Public alanı henüz başkasına erişim sağlamaz |
| user_blocks | Kendi engel ilişkisi | Public okumalarda iki yönlü dışlama |
| moderation_flags | Sınırlı şemayla open rapor oluşturma | Moderasyon ve otomatik gizleme |
| activity_events | Kimlikli kayıtlar yalnız alıcıya; anonim akış callable üzerinden | markActivityRead okundu durumunu yazar |
| user_data_preferences / user_locations / user_device_context | Doğrudan erişim kapalı | Auth/App Check callable ve gerekçeli admin okuması |
| push_tokens / receipts / quotas / admin verileri | Doğrudan erişim kapalı | Fonksiyonlar, worker'lar ve izinli admin işlemleri |

Default-deny kuralları, istemci hatasında doğrudan yazma fallback'i olmaması ve server-side hesap silme çitleri bu mimarinin ana güven sözleşmesidir. Firebase Admin SDK kuralları uygulamadığı için admin uygulamasındaki izin kodu ikinci bir güven sınırıdır.

## 4. Kimlik, oturum ve hesap çiti

Firebase UID, sunucuda UUIDv5 tabanlı luid kimliğine eşlenir. ensureProfile profil ve özel kayıtları kurar, luid custom claim'ini sağlar; Firestore/Storage sahiplik kontrolleri bu claim ile yapılır. İstemci türetilmiş UUID'yi görüntü/sahiplik işlemlerinde kullanır, sunucu request.auth kimliğiyle yeniden bağlar. İstemciden gelen userId başka hesaba yazma yetkisi vermez. AdminContext ve admin_role_assignments ise Firebase Auth UID ile rol/aktör bağını kurar; target luid ile acting admin UID aynı anahtar alanı sanılmamalıdır.

Anonim Auth kurulum kimliğidir; doğrulanmış e-posta gibi kabul edilmez. Yeni anonim oturum veya Apple/doğrulanmış e-posta hesabı mayPublishAnonymously üzerinden yayın yapabilir. E-posta hesabı doğrulaması, anonim hesaptan bağlama ve Apple nonce akışları AuthRepository'dedir. Güncel adaptörde magic link ve e-posta OTP unsupported döner; eski protokol isimleri aktif ürün sayılmaz. SMS kapalıdır; Google giriş UI'sı güncel kaynakta yoktur.

account_deletion_jobs ve account_access çitleri profil/Auth kaydı silinse bile eski token'ın erişimini sınırlamak için kullanılır. Askıya alınmış hesap, silinmekte olan hesap ve aktif hesap aynı durum değildir. Bazı okuma/raporlama yolları askıda hesap için kalabilir; sosyal yazma ve yayın kontrolleri ayrıca daraltılır.

### 4.1. Ana belge kontratları ve ilişki anahtarları

Firestore ilişkiyi yabancı anahtar constraint'iyle korumaz. Referansların geçerliliği Rules, callable ve transaction'larla uygulanır. Aşağıdaki alanlar temsilî uydurma şema değil, güncel kayıtların önemli sözleşme alanlarıdır; bütün opsiyonel legacy alanları içermez.

| Belge / bağ | Ana alanlar | Otorite / ilişki |
|---|---|---|
| profiles/{luid} | handle, avatar_url/preset, bio, display_name, follower/following/public_post_count, suspended/deleted_at | luid hesap kimliği; sayaç ve profil kurma sunucuda |
| users_private/{luid} | Özel hesap/terms/invite/trust durumu | Kendi özel okuma ve server yazma; public profil ile ayrı |
| handles/{handle} | luid rezervasyonu | updateHandle benzersizliği transaction ile sağlar |
| posts/{postId} | id, creator_id, is_anonymous, lat/lng/geohash, caption, status, visibility, age_rating, sayaçlar | creator_id gerçek sahipliği; id mutation kimliği |
| Post geometri/model | pose_json, edit_data_json, content_source_json, anchor_bundle_json, world_map_path, cloud_anchor_id | Ham JSON/string alanlardan public yapılandırılmış projection'a dönüşüm |
| Konum notu eklentisi | note_kind, location_note source/accuracy_m/pin_drag_m, notify_radius_m, push_state, ends_at | Görünürlük ve bildirim onayı ayrı alanlar |
| likes/{postId_luid} | post_id, user_id, created_at | Tek kenar; yalnız kendi niyeti, server sayaç |
| post_saves/{luid_postId} | post_id, user_id, created_at | Kendi kaydı; public kaydedenler listesi değil |
| follows / user_blocks | follower/following veya blocker/blocked, created_at | İki kimlikle deterministik belge; blok iki yönde kontrol |
| activity_events | kind, recipient_id, actor_id, post_id/body, read_at, expires_at | Alıcı akışı; anonim projection için actor gizlenir |
| place_note_notification_receipts | owner_luid, post_id, created_at | Hesap/not ömürlük dedup; expires_at yok |
| user_data_preferences | Rıza seçenekleri, owner ve revision | Eski queued report'u revision ile çitler |
| user_locations / device_context | owner_luid, ölçüm/bağlam, kurulum ve expires_at | En son kabul edilmiş rapor; gerçek fiziksel kimlik kanıtı değil |
| brands / campaigns / targets | Marka/author, status, coğrafya, takvim, alıcı ataması ve expiry | Server-only özel teklif domain'i; public posts değil |
| campaign_progress / codes | Hesap, kampanya/adım, zaman, code ve kullanım durumu | recordCampaignStep transaction'ı + izinli redeem |
| admin_audit_log / mutation receipt | actor, action, resource, reason, before/after, risk; işlem anahtarı | Kritik hedef değişikliğiyle atomik audit/idempotency |

JSON string kullanımı Firebase belge içinde saklanan legacy/kontrat şeklidir; iOS Domain katmanının tamamı string tabanlı değildir. BackendPostContract ve repository çözücüleri bunları tipli modele dönüştürür. Sunucu placement_state/native_provider/resolver_strategy gibi güven alanlarını istemci etiketinden aynen almamalıdır; güncel yayın kodu bunları türetir.

## 5. Anonimlik uygulaması ve veri kontratı

Mobil createPostHandler yeni postu is_anonymous: true ile üretir. Ham belgede creator_id korunur. Başka kullanıcıya çıkan creator_id gerçek luid yerine post id'siyle eşlenir; creator_handle null'dır. Sahibin kendi okumasında sahiplik kimliği korunur. Bu tasarım hesabı sunucudan silmez; herkese açık erişimde kimliği ayırır.

readPublicContent; profil/single/discover/creator/nearby/search_profiles/eligible_authors/own_receipt modlarını tek güven kontrollü callable üzerinde toplar. Hesap çitleri, iki yönlü normal ve anonim engeller, aktif/halka açık durum ve 18+ kontrolleri uygulanır. Başka bir yazarın profil listesinde anonim postlar gösterilmez; public_post_count da anonim yayınları yazara bağlayacak şekilde saymaz.

anonymousGeometry, owner klasörünü içeren Storage locator'larını anonymous-world-map://postId ile değiştirir; reference/asset URL alanları gizlenir. readAnonymousWorldMap yetkili okuma kontrolünden sonra sınırlı parçalarda veri döndürür. Ham anonim post ve doğrudan sahibin Storage yolu başka istemciye açılmaz. readActivity kimliksiz aktivite projeksiyonunu, readLikeCount toplamı, blockPostAuthor gizli yazar engelini sağlar.

Önemli sınır: yorum/takip/profil işlemleri ayrı sosyal kontratlardır; anonim post tüm etkileşimleri anonimleştirmez. Admin'in kullanıcı adına oluşturduğu içerikte seçilen yazar kamuya açık olabilir; acting admin ayrı audit alanındadır. Yeni admin içeriğinde genel bir anonimleştirme parametresi görülmüyor; anonim var olan içeriği düzenlemek ile yeni delegated içerik üretmek ayrılmalıdır.

## 6. Yayın transaction'ı ve yerel saga

AR editörü sabit bir post/mutation id'si kullanır. PublishPostCoordinator önce DraftRecord ve SyncQueueRecord'u SwiftData'ya kalıcı kaydeder. Sonra repository üzerinden gerekli dünya haritası upload'ı ve createPost çalışır. Yanıt kaybında own_receipt sorgusu tamamlanmış kaydı sahibine bağlı olarak bulabilir; aynı post için tekrar oluşturma veya gereksiz dünya haritası yükleme azaltılır.

createPostHandler önce kimlik/oturum, payload ve yayın yetkisini kontrol eder. İsteğe bağlı davet kapısı environment flag'ine bağlıdır. Storage/GIF doğrulaması transaction'dan önce yapılır; geçersiz varlık ağ çağrısı kota tüketmemelidir. Transaction içinde aktif hesap, korumalı bölge, anchor sahiplik/bağlama, yoğunluk kilidi ve yayın kotası yeniden doğrulanır. Post, bağlı anchor, reclamation kaydı ve admission sonucu birlikte yazılır.

![İki farklı yayın ve moderasyon akışı](../../../output/pdf/images/08-yayin-durumlari.png)

Normal AR postu varsayılan pending_review'dur. Yüksek kaliteli/trusted otomatik yayın flag'leri kodda vardır; flag varlığı aktif ürün politikası olarak sunulmamalıdır. Konum notu aynı admission helper'ını kullanır ama metin filtresi/konum/güvenlik koşullarından sonra active olur; push_state başlangıçta none'dır. Görünürlük ile bildirim onayı ayrı state machine'lerdir.

SyncQueueProcessor yalnız publish_post işlemini yürütür. Her hesap yalnız kendi kuyruğunu tüketir; koşu en fazla 10 kayıt işler. En çok 5 deneme, 120 saniye in-flight lease, artan bekleme ve dead-letter durumu vardır. Servis kill switch nedeniyle durmuşsa 300 saniye beklenir, deneme bütçesi tüketilmez. RootView aktifken 15 saniyelik döngü, bağlantı dönüşü ve giriş tetikleri kuyruğu çalıştırır. Bu kuyruk konum notu composer'ı veya tüm sosyal işlemler için genel bir offline outbox değildir.

## 7. Medya, avatar ve Storage güvenliği

Yeni post modeli text ve en fazla bir GIPHY GIF'idir. GIPHY anahtarı Secret Manager'dadır; searchGifs ve createPost sunucuda kullanır. GIF id'si doğrulanır, rating en fazla pg-13 olur; boyut sunucunun GIPHY yanıtından alınır. İstemci yalnız izinli media.giphy.com URL'si kurar. Yeni fotoğraf, video, çizim ve URL reddedilir. Eski payload çözümlenirken crash olmaması gerekir; eski linkler gösterilmez.

Avatar bu post medya kısıtlamasından ayrıdır. beginAvatarUpload saatlik yükleme slotu açar, istemci pending alanına sınırlandırılmış JPEG yükler. Pending avatar okunamaz. screenAvatar Cloud Vision SafeSearch ile tarar; yayınlanan current avatarı ve profil alanını yalnız sunucu değiştirir. Preset seçme ve avatarı temizleme kurallı profil istisnasıdır.

World map 20 MB'dan küçük, değiştirilemez ilk upload ve uygun draft reclamation claim'iyle yazılır. Storage claim/account_access kontrolleri kural başına belge erişim bütçesini dikkate alır. Anonim haritada public_readable tek başına doğrudan erişim açmaz; is_anonymous kontrolü de vardır. Eski post-layer-assets, post-video-assets ve kamera referans upload'ları kapalıdır. Legacy surface texture read yolu hâlâ vardır; yeni upload kapalı olması, bütün eski varlıkların silinmiş olduğu anlamına gelmez.

## 8. AR yaşam döngüsü ve çözücü zinciri

ARPinningEngine tek ARKit oturumu üretir. Aynı ARFrame, ARCoreService'e aktarılır; ikinci bir bağımsız kamera oturumu yaratılmaz. RealityKit/SpatialContentRenderer metin ve GIF'i sohbet balonu biçiminde gösterir. Kamera, AR ekranının yaşam döngüsüne bağlıdır; kesinti, arka plan, termal baskı ve iptal akışları ayrılır.

![AR sabitleme ve yeniden bulma zinciri](../../../output/pdf/images/06-ar-cozumleme.png)

Cloud Anchor önce barındırılır ve registerCloudAnchor ile sahipliğe kaydedilir. createPost bu anchor'ı bir kez sahibinin postuna bağlar. getArcoreToken uzun ömürlü API anahtarı dağıtmak yerine runtime servis hesabıyla sınırlı süreli token üretir. Cloud Anchor saklama ayarı 365 gündür. Silme başarısızlıkları cloud_anchor_deletions kuyruğunda tekrar denenir.

İzleyici önce Cloud Anchor, sonra Geospatial, sonra ARKit world map, sonunda aim-guided approximate reveal dener. Geospatial pose kapısı yatay doğruluk 5 m ve yaw 15 derece eşiklerini kullanır. Bunlar kabul eşiğidir; GPS'in her yerde bu hassasiyeti sağlayacağına dair vaat değildir. ARCoreDisclosure Google'a görsel özellik verisi aktarımını kullanıcıya bildirir; projede kamera referans görüntüsü upload edilmez.

ProximityPolicy normal uzaklık kapısını 60 m, hedefli açmada 1.35 çarpanını kullanır. Fiziksel yüzey için eski yaratma yönünü zorunlu tutmak yerine konum/yüzey arama kullanılır; yaklaşık içerikte yön ve pitch rehberliği vardır. Yükseklik farkı kontrolleri olsa da bunlar kat/bina içi doğrulama sistemi değildir. Bu AR erişim eşiği konum notu bildirim yarıçapından ayrıdır.

## 9. Konum notu yazma ve bildirim algoritması

LocationFixEstimator sadece ölçüm başlangıcından sonraki taze örnekleri kullanır. Örnek yaşı en fazla 3 saniye, zaman toleransı ileriye en fazla 5 saniyedir; gerçek cihazda software-simulated ölçüm reddedilir. Tekrar timestamp'i yeni örnek sayılmaz. Ortalama inverse-variance ağırlıklıdır; raporlanan belirsizlik en iyi tek ölçüm ile örnek yayılımının büyüğüdür. Ortalama alma sahte hassasiyet yaratmaz.

Hazır kapısı: doğruluk en fazla 10 m, 2 saniye ısınma ve son üç örneğin 5 m içinde tutarlı olması. GPS olarak kabul en fazla 15 m; 15-50 m manuel pin ve ölçümden en fazla 50 m sürükleme; 50 m üstü ret. createPlaceNote en fazla 220 karakter linksiz metin kabul eder; bu GPS kaynağı istemci raporudur, kriptografik fiziksel konum kanıtı değildir.

readPlaceNoteRegions yaklaşık konumla 3 km çevrede onaylı görünür içerik arar, görülmemiş adayları kümeler ve en fazla 15 not bölgesi döndürür. Native servis iOS'un toplam izleme bütçesi içinde en yakın bölgeleri seçer. Kümelerin 300-400 m wake alanı bildirim alanı değildir. Gerçek bildirim yarıçapı 15-100 m'dir.

Giriş kuralı: distance <= radius + min(accuracy, 20 m), accuracy <= 35 m. Son fix en fazla 10 saniye eski olmalıdır. Native ölçüm akışı hızlı geçişleri filtreler ve 10 saniye sürekli uygunluk ister; 5 saniyeden büyük boşluk, dışarı çıkma veya geçersiz fix teyidi sıfırlar. Tekrar/geriye tarihli ölçümler süreyi ilerletmez. Sunucu confirmationStartedAt ile en az 10 saniyelik pencereyi ve son fix'i doğrular; sunucu tüm ara GPS geçmişini alıp bağımsız sürekli varlık kanıtlamaz.

recordPlaceNoteVisit uygun ve görülmemiş notları likes/newest sırasıyla seçer. Onay, hesap durumu, kill switch, engel ve kullanıcı raporu yeniden kontrol edilir. place_note_notification_receipts ile anonim activity aynı transaction'da oluşur. Normal notun metni callable yanıtıyla yerel bildirime gider; bu akış sosyal FCM worker'ı ile aynı teslim kanalı değildir. Süresiz alındı kaydında TTL yoktur; garanti bir fiziksel insan için değil aynı hesap/not çifti içindir.

Native hassas pencere notlarda normalde 600 saniye, eski kampanya gelişlerinde 120 saniyedir. Zone dwell adımları gerektiğinde dwell + 300 saniyeye uzayabilir; tavan 1800 saniyedir. CLBackgroundActivitySession ve Always izni arka plan ölçümünde kullanılır. Süreç işlem task'ı ayrıca 20 saniye koruma taşır; GPS penceresi ile tek network/işlem task'ının süresi karıştırılmamalıdır. iOS'un gerçek çalışma süresi fiziksel kabul konusudur.

Cold location launch, NotificationService.swift içindeki LociAppDelegate'te SwiftUI task'ı beklenmeden Firebase yapılandırması, mevcut luid ve UserContextService hesabı kurularak ele alınır. Hesaba bağlı cached/pending tercihler izleme kararı için kullanılır. didEnterRegion ve didDetermineState içeride olmayı işleme yollarına taşır; kayıtlı veya yeni izlenen bölge için requestState çağrılması, zaten alanın içinde olan kullanıcıyı yalnız sonraki geçişe bırakmaz. didExitRegion teyit/pencereyi temizler; izin azaltılması veya Kesin Konum kaybı ölçüm akışını sınırlar. didVisit alışılmış yer öğrenimini yalnız kampanya rızasıyla cihazda yürütür. BGTaskScheduler ve region_refresh silent push ek yenileme yollarıdır; sistemin bunları zamanında çalıştırması garanti edilmez.

## 10. Yoğunluk, dense spot ve coğrafi sorgu

onPostDensityWritten idempotent hücre sayımlarını günceller; reconcileNoteDensity saatlik yeniden eşleme yapar. readNoteDensity geniş görünümde özet hücreler döndürür. Ayrı note_spots modeli yakın notları bir araya getirir; dense threshold varsayılan 30'dur. unlockDenseSpot sunucu kapısıyla 30 dakikalık kullanıcı erişimi verir; normal giriş ve unlock toleransları ayrı kurallardır.

readPublicContent nearby yolu lat aralığı adaylarını sınırlı sayfalarda tarar, gerçek mesafe/hesap/blok filtresi uygular ve sonucu sınırlar. Bu yol tümüyle geohash sorgusu değildir. Konum notu araması geohash prefix kullanır; yoğunluk görünümü ayrı özetler kullanır. Discover ilk kronolojik sayfayı engagement ve zaman etkisiyle sıralar; tüm veritabanının küresel trend sıralaması değildir. engagement_score = views + 3*likes + 5*comments; ilk sayfa skorunda yaş azaltması uygulanır.

Ölçek riski: sınırlandırılmış tarama doğruluğu korur ama sıcak enlem bantlarında ve yoğun alanlarda okuma/süre maliyeti artabilir. Yük testinde query başına doküman sayısı, transaction süresi, cold start ve GPS penceresi içindeki uçtan uca süre ölçülmelidir; bu raporda ölçülmemiş latency veya kapasite SLO'su verilmez.

## 11. Sayaçlar, olay tekrar teslimi ve tutarlılık

Beğeni/kayıt/yorum/takip kenarlarını istemci yazabilir; sayaçların sahibi Functions'tır. counters helper'ı tarihsel delta'yı körlemesine toplamak yerine transaction snapshot'ındaki kaynak satırları/aggregate count'u yeniden sayar. trigger_receipts ile tekrar olay teslimi tek kez uygulanır. Böylece sil-oluştur yarışları, ters sıralı olaylar ve retry mevcut duruma yakınsar.

Yorum filtreleme işaretleri aynı transaction'da tüketilir. Profil public_post_count anonim postları dışlar. recordPostView post/kullanıcı/UTC gününe göre idempotent görüntüleme kaydı tutar; istemci kendi başına başarı sayısı uydurmaz. reconcilePostCounters periyodik onarım sağlar.

Admin metrik düzeltmeleri ayrı offsets ile kaynak sayaçlara eklenir. Eski offset'siz manuel düzeltmeler otomatik olarak güvenilir organik sayaca çevrilemez. Kampanya performansı hesaplarında offset farkı ve legacy düzeltmeler için ayrı kontroller vardır. Büyük metrik farkı >= 10.000 olduğunda bağımsız ikinci admin onayı gerekir.

## 12. Üç bildirim kanalı

| Kanal | Başlatıcı | Veri yolu | Temel sınır |
|---|---|---|---|
| Sosyal/approval push | Beğeni, yorum, takip veya post onayı | activity/trigger -> FCM -> APNs -> telefon | En fazla bir gönderim girişimi; gerçek teslim cihazda ölçülür |
| Konum notu/geliş | iOS bölge ve GPS -> sunucu admission | Callable sonucu -> yerel UN bildirimi + kalıcı aktivite | Sunucu kabulünden sonra süreç koparsa yerel uyarı kaybolabilir |
| Admin/kampanya | Gerekçeli yetkili admin/teklif/adım | Atomik job/aktivite/kota -> worker -> FCM veya yerel kanal | Opt-in, pazarlama izni, kampanya/geometri ve günlük kota |

registerPushToken/unregisterPushToken sunucu push_tokens kayıtlarını kurulum kimliğiyle yönetir; hesap değişimi ve token yenilenmesi koordinatör üzerinden çitlenir. Geçersiz token'lar temizlenir. Sosyal metinler sunucuda 12 dilde seçilir. Sosyal günlük sınır 3'tür; post onayı ayrı istisnadır. Promotional/admin günlük kota da 3'tür ama farklı quota koleksiyonudur; tek ortak bütün bildirim kotası sanılmamalıdır.

FCM Firestore transaction'ının parçası olamaz. Gönderim receipt'i çağrıdan önce claim edilir; tekrar teslim aynı gönderimi yeniden başlatmaz. Bunun bedeli çökme sınırında teslim kaybı olasılığıdır. APNs collapse id dedup yardımcısıdır, exactly-once delivery kanıtı değildir. accepted/FCM success, cihazda gösterildi/okundu anlamına gelmez.

## 13. Kullanıcı rızası ve admin görünürlüğü

UserContextService ayrı varsayılan kapalı teknik paylaşım ve admin konum paylaşımı tercihlerini yönetir. Bildirimler ve promotions da ayrı tercihlerdir. Consent revision, eski veya çevrimdışı bekleyen raporların kapatılmış izni yeniden canlandırmasını önler; conflict halinde taze tercih ile tekrar gerekir. Yerel başarısız değişiklik sırasında paylaşım fail-closed kalır.

recordUserContext teknik raporu dakikada bir, konumu 30 saniyede bir sınırlar. Admin konumu ön planda raporlanır; GPS giriş kontrolü bu snapshot'ı güncellemez. Konum en fazla iki dakika eski kabul edilip raporlanabilir. user_locations 24 saat, user_device_context 30 gün saklanır; çoklu kurulumda en son kabul edilen rapor kazanır. Bu alanlar client-reported'dır; "şu an kesin orada" iddiası değildir.

Admin özel veri okumasında users.location.read/users.telemetry.read, MFA, gerekçe ve commit edilmiş audit gerekir. Yanıt private/no-store'dur, eski ölçüm stale işaretlenir; tarayıcı sekmesi gizlenince gösterilen veri temizlenir. IP veya koordinat audit snapshot'ına tekrar kopyalanmaz. Notun konumu, giriş fix'i, admin snapshot'ı ve cihazdaki usual place dört ayrı veri sınıfıdır.

## 14. Admin uygulamasının yapısı ve güvenlik zinciri

Admin App Router sayfaları server component ağırlıklıdır; form/harita/mutasyon etkileşimleri client component'tir. admin/lib/firebase-admin sunucu bağını kurar; App Hosting runtime servis hesabını kullanır. Public Firebase web tanımlayıcıları admin login istemcisinde bulunabilir; Admin SDK credential veya Secret Manager değeri NEXT_PUBLIC alanına taşınmaz.

![Admin işlem ve yetkilendirme zinciri](../../../output/pdf/images/05-admin-islem-zinciri.png)

Login ID token'ını /api/auth/session'e verir. Origin ve JSON boyut/şema kontrolü, revoked token doğrulaması, son 5 dakikada oturum açmış olma ve aktif rol gerekir. 8 saatlik __session cookie httpOnly, secure ve SameSite strict'tir. MFA UI TOTP kullanır; aal2 sunucuda Firebase second-factor claim'iyle belirlenir. Her istek aktif rol kataloğuna tekrar bakar; rol cookie içine kalıcı yetki olarak gömülmez.

Proxy, korumalı sayfalarda erken session/MFA/permission yönlendirmesi yapar. Server component ve API handler da kendi denetimini yapar; proxy tek güven kapısı değildir. Mutasyonlarda requireSameOrigin, requireAdminApi, rate-limit sonucu, payload doğrulama, gerekçe ve idempotency anahtarı işlenir. Kritik servis transaction'ları aktör/hesap/rol durumunu yeniden kontrol eder, mutation receipt + hedef değişiklik + audit birlikte commit edilir. Aynı anahtar farklı içerikle tekrar kullanılırsa conflict oluşur.

Dinamik admin/auth sayfalarında script nonce CSP kullanılır. Public statik legal sayfaların farklı CSP profili vardır; aynı nonce politikasını aldıkları söylenemez. X-Frame-Options DENY, nosniff, referrer ve permissions policy başlıkları vardır. Tarayıcı geolocation kapalıdır; admin harita seçicisi tile görüntüsü ve tıklanan koordinatı kullanır, yöneticinin canlı GPS'ini istemez.

## 15. Admin'de gerçekten kullanılabilen modüller

| Modül | Mevcut işlem | Yetki/sınır |
|---|---|---|
| Kullanıcılar | Arama, normal davet, managed içerik kimliği oluşturma, askıya alma | users.read/invite/create/suspend; managed Auth disabled ve doğrulanmış sayılmaz |
| Postlar | Kullanıcı seçerek metin üretme, düzenleme, moderasyon, yorum üretme/düzenleme/silme | posts.create/edit/moderate, comments.write; audit aktörü ile görünen yazar ayrı |
| Konum notları | Bildirim onayı/geri alma, yarıçap, bitiş, silme, eşikler | posts.moderate; yarıçap için places.write |
| Moderasyon/avatar | Rapor kararı, güvenilir sunucu arşivinden restore, avatar kararı | posts.moderate / users.suspend; istemci rapor metni restore kaynağı sayılmaz |
| Metrikler/onaylar | Sayaç düzeltmesi, büyük fark için bağımsız karar | posts.metrics.write; self-approval ve eski target sürümü engellenir |
| Kampanyalar | Marka, draft/live durum, audience, tek kişiye teklif/job, zone adımları, kod kullanımı | brands.write, campaigns.write/audience, notifications.send ayrı |
| Özel kullanıcı bağlamı | Gerekçeli konum/telemetri okuma ve izinli kişiye özel job | Ayrı yüksek yetkiler; sürekli takip ekranı değildir |
| Korumalı bölgeler | Bölge oluşturma ve aktifleştirme | zones.write; normal kullanıcı yayınını sert engeller |
| Anchor/Places | Resolver, yerleştirme ve yer kayıtlarını inceleme | Mevcut ekranlar ağırlıklı read-only; anchor disable/retire API'si görünmüyor |
| System/Audit/Analytics | Reachability, kill switch, olay/audit/özet okuma | Gerçek saha SLO'su veya her cihazın teslim paneli değildir |

Admin metin editörü tam serbest medya editörü değildir. Yeni metin içeriği üretir; eski çok katmanlı postu kaydetmek tek katmanlı tasarımla değiştirebilir. Fiziksel post koordinat/boyut/yönü değişirse açık approximate replacement onayı ve anchor silme kuyruğu gerekir. Uzaktan admin yerleşimi admin_geo_estimate'tir; Cloud Anchor barındırılmış veya gerçek yüzey taranmış gibi gösterilmez.

Korumalı bölgede admin istisnası zones.override ve ayrıca gerekçe ister; 18+ yasağı tüm aktörlerde sürer. Geçmiş kaynakta admin içerik operasyonları için eski "canlıya dağıtılmadı" notları vardır; güncel rollout ve metadata kanıtı bunlardan ayrı tutulmalıdır.

## 16. Rol kataloğu: yetki adı ile bitmiş ürün ayrımı

Katalog on rolden oluşur. super_admin tüm katalog izinlerini taşır. Diğer roller aşağıda özetlenir. Bunlar kaynakta tanımlı izin kümeleridir; canlıda hangi kişiye hangi rol verildiğine dair kişisel veri sorgulanmadı.

| Rol | Katalogda verilen başlıca yetkiler |
|---|---|
| super_admin | Tüm Permission katalogu |
| trust_safety_admin | Kullanıcı/post okuma, askıya alma, moderasyon, audit |
| ar_operations_admin | Post/anchor okuma, anchor disable/retire katalogu, places/zones yazma, audit |
| product_operations | Dashboard, production flag katalogu, audit |
| engineering_observer | Dashboard, anchor okuma, audit |
| analyst | Dashboard, anchor okuma, audit |
| support_agent | Dashboard ve kullanıcı okuma |
| legal_privacy_admin | Dashboard, kullanıcı/audit okuma, audit.export katalogu |
| ad_operations_admin | Dashboard ve kampanya okuma; alıcı seçme/gönderme yok |
| finance_admin | Dashboard; ödeme/iade özelliği verilmiş değildir |

finance.refund, ads.approve, users.terminate, anchors.disable/retire ve audit.export gibi izin adları tek başına tamamlanmış UI/API akışı anlamına gelmez. Mevcut route envanteriyle eşleşmeyenleri çalışır özellik diye sunmamak gerekir. Son super_admin rolünün kaldırılmasını engelleyen koruma vardır.

## 17. Kampanya ve yolculuk domain'i

Seçilmiş kullanıcı kampanyaları public posts'tan ayrı server-only brands/campaigns/campaign_targets üzerinde çalışır. Alıcılar ancak izin, taze konum, hesap durumu ve performans koşullarından geçince atanır. Audience okuma, konum okuma ve notification send ayrı yetkilerdir. Atama/job/aktivite/kota aynı transaction'da oluşur; worker gönderim öncesi canlı koşulları yeniden kontrol eder.

Zone yolculuğu en fazla beş adım içerir. Circle ve street geometrileri, campaign zaman diliminde takvim, önceki adım/geçerlilik, frequency, budget, shared/unique code ve notification/map/AR kanalları birlikte doğrulanır. recordCampaignStep ilerlemeyi ve kodu atomik tutar. Kodun redeem olması POS/satın alma kanıtı değil admin işaretidir. Zone test gönderimi gerçek alan/geometri kabul testi sayılmaz.

Usual place cihazdaki visit kayıtlarından öğrenilir; en az üç gece/21 günlük pencere kuralı ve yerel 150 m çıkış bölgesi kullanılır. Ev etiketi veya koordinatı sunucuya usual-place veri modeli olarak gitmez. Sessiz area-topic push, yaklaşık hareket, sınır bölgesi ve background refresh konfigürasyonu region listesini yenilemeye yardımcı olur; iOS sessiz push'u garanti etmez. submitBrandCampaign bir draft callable'ıdır; ayrı marka portalı mevcut değildir.

## 18. Hesap silme ve telafi işlemleri

deleteAccount oturumun hedef hesapla eşleşmesini doğrular. Bağlı Apple/e-posta hesapları taze oturum ister; gerçek anonim hesap sağlayıcısız olduğu sunucudan doğrulanarak ayrı kabul edilir. Apple revocation başarılı olmadan silme state'i kabul edilmez. Bu dış servis başarısızlığı hesap verisini yarım silmeye başlatmamalıdır.

acceptAccountDeletion transaction'ı silme işi, profil deleted_at ve account_access deleting çitini kurar. Worker lease/budget ile Firestore cascade'i, Storage/anchor temizliğini, Auth ve kalan kimlik bağlarını aşamalı yürütür. Batch hatasında sonraki aşamaya atlanmaz. retryAccountDeletions beş dakikada bir işi oturumdan bağımsız devam ettirir. Geç upload nesneleri Storage finalize/PubSub yolu üzerinden yakalanır. Minimum silme çiti/tombstone tekrar diriltmeyi önlemek için kalabilir; hard delete hedefi operasyon çitlerinin güvenli saklanmasını dışlamaz.

İstemci de silme kabulünü yerel tombstone'a kaydeder. LocalAccountDeletion yeniden açılışta yalnız bu hesabın taslak/kuyruk/asset/cache kayıtlarını temizler; başka hesabın taslağına dokunmaz. Anchor management dış servisi ve çoklu koleksiyon silme tek büyük transaction değildir; yeniden denenebilir telafi işleri gerekir.

## 19. Dağıtım, çalışma kapasitesi ve gözlemlenebilirlik

Functions runtime Node.js 22, üretim App Check zorunlu ve bütün hedefler us-central1'dir. Kaynak export envanteri 58 işlevdir. Deploy helper emülatör ortamını üretime taşımayı reddeder; seçilmiş işlev isimleriyle dağıtım ve kaynak paket denetimi yapılır. Son paket yalnız lib, package.json ve lockfile içerir; secrets değerleri kaynak pakete eklenmez.

App Hosting runConfig minInstances 0, maxInstances 2, concurrency 80, CPU 1 ve memory 512 MiB'dir. minInstances 0 cold start olasılığına işaret eder; 80 concurrency tek başına ölçülmüş throughput değildir. Functions ve Cloud Run bölgesel CPU kotası son dağıtımda 20 vCPU idi; dağıtım bu sınır içinde tek tek tamamlandı. Bu kota canlı kullanımda sınırsız ölçek veya garanti edilmiş latency anlamına gelmez.

Crashlytics varsayılan açık, kullanıcı opt-out mümkündür. Release build aşamasında DWARF dosya bağımlılığı doğru sırada tutulur; dSYM oluşturma yüklemeden önce çalışır. Dış yükleyiciye 120 saniyelik sınır ve cleanup vardır. Son imzalı arşivde sembol yüklemesi başarılı. İmza Apple Development, APNs development; bu TestFlight dağıtım paketi veya production APNs cihaz kanıtı değildir.

Localization 12 dil için JSON çevirilerinden üretilen xcstrings kullanır; development region en, anahtarlar Türkçe kaynak literalidir. Katalogların elle değiştirilmesi yerine generator/compiler key checks gerekir. Server push metinleri de dil seçimini server'da yapar. Bazı eski mimari yazılardaki loc-key-on-device ifadesi güncel push.ts davranışıyla uyuşmuyor.

System sayfası Auth/Firestore/Storage ve birkaç endpoint reachability kontrolü yapar. Endpoint OPTIONS dönüşü, fonksiyonun sağlıklı bir gerçek iş akışı çalıştırdığı anlamına gelmez. Metadata readiness de APNs/AR/GPS/Vision/Apple revoke veya bütün IAM yollarının saha testi yerine geçmez. Gerçek p95/p99, cold-start ve battery ölçümleri henüz bu kanıtta yoktur.

### 19.1. Canlı scheduler görevleri

| İşlev | Takvim | Saat dilimi / rol |
|---|---|---|
| cleanupPostMedia | Her gün 03:17 | Europe/Istanbul; medya/anchor temizlik işi |
| reconcilePostCounters | Her gün 04:11 | Europe/Istanbul; sayaç onarımı |
| retryAccountDeletions | Her 5 dakika | UTC; kabul edilmiş hesap silme |
| retryAvatarDeletions | Her 5 dakika | UTC; avatar nesne silme retry |
| expireScheduledNotes | Her 15 dakika | UTC; admin bitiş tarihli not kaldırma |
| reconcileNoteDensity | Her 60 dakika | UTC; yoğunluk/spot onarımı |

Altı görev son metadata örneğinde ENABLED'dır. Periyodik cleanup gecikmesi, süresi dolan özel kayıt okunabilir demek değildir; erişim kodu expiry kontrolünü önce uygular. Hesap silme gibi kritik işler client'ın tekrar uygulama açmasına bağlı kalmaz.

## 20. Kanıt matrisi

| Kontrol | Son kayıt | Kanıt sınırı |
|---|---|---|
| Native iOS | 156/156 | Saf politika/adaptör/runtime testleri; saha GPS/AR değil |
| Functions unit / integration | 122/122 ve 146/146 | Emülatör ve enjekte edilmiş dış servis davranışları |
| Firestore/Storage kuralları | 82/82 | İzin sözleşmesi; eski bearer URL varlığını tek başına kaldırmaz |
| Admin unit / integration | 35/35 ve 87/87 | Yerel gerçek HTTP/Chromium ve server işlemleri |
| Canlı public browser | 24/24, retry/skip yok | Public web güvenlik/erişilebilirlik; bütün yetkili işlemler değil |
| Repository script tests | 46/46 | Sembol timeout/cleanup ve release yardımcıları dahil |
| Canlı envanter | PASS, 0 eksik; 58 ACTIVE / 32 TTL / 23 READY indeks / 6 ENABLED görev | Kaynak/altyapı varlığı ve durumları |
| Canlı anonim Auth | SDK sign-in başarılı; geçici Auth kaydı kaldırıldı | Telefondaki App Check + profil + publish golden path değil |
| App Hosting | Cloud Build SUCCESS ve tamamlanmış rollout | Gerçek sahibin TOTP saha kabulü değil |
| Arşiv | Release archive + codesign verify + otomatik dSYM upload başarılı | Telefondaki yeni sürüm kurulumu ve Store yayını yapılmadı |

Canlı metadata snapshot'ı ve test sayıları source-inventory.json ile son yayın raporunda kaydedildi. Bu analiz için uygulama/backend üretim davranışı değiştirilmedi; daha önce tamamlanmış doğrulama kanıtları kullanıldı. Fiziksel cihaz kabulü kullanıcı isteğiyle ertelenmiştir.

## 21. Somut bulgular, mimari sınırlar ve öncelikler

### B1 - Admin konum notu hız sınırı yanıtı kullanılmıyor

admin/app/api/admin/v1/place-notes/route.ts:16, await enforceRateLimit(...) çağırıyor fakat dönen NextResponse'ı handler'dan döndürmüyor. api.ts kota aşımında 429 response döndürür, exception fırlatmaz. Bu nedenle bu route'ta limit tüketilir ama işlem akışı devam edebilir. MFA/RBAC açığı olduğu söylenmiyor; burada tespit edilen şey yetkili bir adminin istek hızının doğru durdurulmamasıdır. Öncelik P2. Çözüm: diğer route'lar gibi sonucu limited değişkenine alıp varsa return etmek ve gerçek HTTP üzerinden limit sonrası hedefin değişmediğini doğrulamak. Bu analizde üretim kodu değiştirilmedi.

### B2 - Görünür anonimlik ile sunucu anonimliği farklı

Ham creator_id, konum ve AR geometri operasyonel amaçla korunur. Admin delegated içerik ve yorum akışı anonim post ile aynı model değildir. Ürün metinleri mutlak, operatöre karşı da kimliksiz veri iddiası taşımamalı; kullanıcı ve teknik rapordaki izin sınıfları birlikte korunmalıdır.

### B3 - Bildirim için gerçek mağaza varlığı ve exactly-once teslim yok

GPS toleransı kaldırım/komşu mağazayı dahil edebilir. Sürekli 10 saniye kontrolü native taraftadır; server client timestamp/fix doğrular. FCM veya yerel UN işlemi Firestore transaction'ıyla atomik değildir. receipt-before-send modeli duplicate girişimi azaltır, kayıp teslim ihtimalini kaldırmaz. Öncelik, fiziksel iPhone kilit ekranı/normal arka plan/sistem sonlandırma/force-quit/ağ kesintisi matrisi ve ölçülen delivery latency'dir.

### B4 - Legacy varlık güvenliği ayrıca kanıtlanmalı

Yeni Storage kuralları ve finalize işlevleri eski bearer download token'larını kendiliğinden geriye dönük iptal etmiş sayılmaz. Eski world-map güvenlik migration'ının bütün cursor/sayfalarda tamamlandığını gösteren kanıt bu analizde yoktur. scripts/world-map-security-migration.mjs'nin salt okunur incelemesiyle gerçek nesne envanteri doğrulanmalı; işlem gereksinimi varsa ayrıca planlanmalıdır. Burada canlı eski token açığı olduğu iddia edilmiyor, kanıt sınırı belirtiliyor.

### B5 - Yakın sorgu ve olay tutarlılığı için yük ölçümü gerekli

Latitude aday taraması ve transaction içi çoklu uygunluk okumaları yoğun alanlarda maliyet/süre oluşturabilir. Sayaç yeniden sayımı doğru tutarlılık modelidir ama aşırı sıcak postlarda contention yaratabilir. Dosya/sorgu limitleri vardır; bu bir production kapasite benchmark'ı değildir. Veri hacmine göre bounded geospatial indeks ve gözlenen sorgu bütçeleri değerlendirilmelidir.

### B6 - Dokümantasyon sapması mevcut

docs/ARCHITECTURE_AND_FLOW_DIAGRAMS.md ve APP_STORE_1_0_SCOPE.md eski Expo/Supabase dönemini içeriyor. Güncel ARCHITECTURE.md içinde bile text-only ve cihazda loc-key ile push lokalizasyonu ifadeleri yeni text+GIF/server-localized modeline göre eski. BRAND_CAMPAIGNS içinde legacy arrival açıklaması ile güncel ortak GPS tolerans kuralı arasında sapma var. ADMIN_CONTENT_OPERATIONS'daki eski canlıya dağıtılmadı notu tarihsel. Bu rapor kaynakla bu ayrımları düzeltiyor; eski belgeler sessizce yeni kanıt sayılmadı.

### B7 - Katalog ile çalışan operasyon ayrı tutulmalı

Anchor diagnostics/Places read-only, finans/refund ve bazı purge/export yetki isimleri mevcutken route/UI tamamlanmış değil. Yolculuk backend'i ile ayrı marka portalı da ayrı kapsamdır. Ürün sunumu, API envanteri ve permission katalogu aynı özellik listesi gibi kullanılmamalı.

## 22. Kaynak dosya rehberi

| Alan | Esas kaynak |
|---|---|
| Native yapı | project.yml; LociAR/AppCore/AppContainer.swift; RootView.swift; AppRouter.swift |
| Oturum | LociAR/Data/AuthRepository.swift; functions/src/core.ts; profile.ts; anonymous.ts |
| Yayın/kuyruk | LociAR/Application/PublishPostCoordinator.swift; Data/PostRepository.swift; SyncQueueProcessor.swift; functions/src/posts.ts; placement.ts |
| Konum | LociAR/Domain/LocationNotePolicy.swift; AppCore/CampaignArrivalService.swift; Features/Map/PlaceNoteComposer.swift; functions/src/placeNotes.ts; placeNoteRules.ts |
| Gizlilik/projeksiyon | functions/src/publicContent.ts; anonymousAccess.ts; anonymous.ts; firestore.rules; storage.rules |
| AR | LociAR/ARCore/ARCoreService.swift; ARPinningEngine.swift; Features/AR/ARPostViewerView.swift; Domain/ProximityPolicy.swift; functions/src/arcore.ts; anchors.ts |
| Sosyal/sayaç | LociAR/Data/SocialRepository.swift; functions/src/triggers.ts; counters.ts; activity.ts; push.ts; pushPolicy.ts |
| Tercihler/özel veri | LociAR/AppCore/UserContextService.swift; functions/src/userContext.ts; admin/lib/user-context.ts |
| Admin giriş/güvenlik | admin/lib/admin.ts; rbac.ts; api.ts; policy.ts; proxy.ts; app/api/auth/session/route.ts |
| Admin işlemler | admin/lib/ops.ts; content-ops.ts; place-notes.ts; campaigns.ts; campaign-journeys.ts; app/api/admin/v1 |
| Hesap silme | functions/src/account.ts; accountDeletion.ts; accountStorage.ts; LociAR/Data/PersistenceModels.swift |
| Release | scripts/release-preflight.mjs; qa-live-firebase.py; upload-crashlytics-symbols.sh; admin/apphosting.yaml; firebase.json; firestore.indexes.json |

Platform kaynakları: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background ; https://firebase.google.com/docs/crashlytics/ios/get-deobfuscated-reports

Sonuç ve kanıt dosyası: docs/release/LOCATION_ANONYMITY_FIXES_2026-10-13.md. Aşağıdaki ek envanterler source-inventory.json'dan üretilir; kaynak commit ve snapshot zamanı korunur.








## 23. İşlev envanteri - 58 export

Kaynak index.ts’den otomatik çıkarılmıştır. Tür dağılımı: Callable: 35, Firestore create: 7, Firestore write: 3, Scheduler: 6, PubSub/Storage: 2, Firestore delete: 4, Firestore update: 1. Callable türü üretimde Auth/App Check kapısını kullanır; diğerleri güvenilir olay/scheduler girişleridir.

| İşlev | Tür | Sorumluluk | Kaynak |
|---|---|---|---|
| ensureProfile | Callable | Profil/özel kayıt ve luid claim kurulumu; Auth kimliğine bağlı. | profile.ts:42 |
| updateHandle | Callable | Benzersiz handle rezervasyonu ve değişim bekleme kuralı. | profile.ts:142 |
| readDataPreferences | Callable | Kendi rıza/tercih revizyonunu okur. | userContext.ts:20 |
| setDataPreferences | Callable | Revizyon kontrollü rıza değişimi ve kapatma temizliği. | userContext.ts:29 |
| recordUserContext | Callable | İzinli teknik/son konum snapshot’ı; hız ve tazelik kontrolü. | userContext.ts:83 |
| onAdminNotificationQueued | Firestore create | İzinli job’u tekrar doğrular, FCM girişimini claim eder. | campaigns.ts:135 |
| submitBrandCampaign | Callable | Yetkili marka editöründen yalnız draft kampanya kabulü. | campaigns.ts:142 |
| readCampaignRegions | Callable | Atanmış canlı tekliflerin yerel izleme bölgelerini verir. | campaignArrivals.ts:12 |
| recordCampaignArrival | Callable | Geliş/ayrılış ölçümünü kabul eder; tek claim, kota ve aktivite. | campaignArrivals.ts:41 |
| createPlaceNote | Callable | Ölçülmüş konum, kısa metin ve ortak yayın admission. | placeNotes.ts:32 |
| readPlaceNoteRegions | Callable | Yakın, onaylı, görülmemiş notların wake kümeleri. | placeNotes.ts:104 |
| recordPlaceNoteVisit | Callable | 10 s teyit + fix doğrulama; not seçimi ve kalıcı alındı. | placeNotes.ts:142 |
| onPostDensityWritten | Firestore write | Post değişiminden idempotent yoğunluk/spot güncellemesi. | noteDensity.ts:40 |
| reconcileNoteDensity | Scheduler | Saatlik yoğunluk ve spot yeniden eşleme. | noteDensity.ts:56 |
| readNoteDensity | Callable | Harita için sınırlı yoğunluk hücresi özeti. | noteDensity.ts:71 |
| expireScheduledNotes | Scheduler | Admin ends_at süresi dolan içeriği periyodik kaldırır. | noteDensity.ts:114 |
| unlockDenseSpot | Callable | Yerinde geometri kontrolüyle süreli metin erişimi. | denseSpots.ts:110 |
| onReportCreated | Firestore create | Açık farklı raporlarla eşik aşımında gizleme/iptal. | noteAutomation.ts:59 |
| readCampaignZones | Callable | Yakın zone journey adımlarını ve uygunluklarını verir. | campaignJourneys.ts:42 |
| recordCampaignStep | Callable | Adım sırası/geometri/takvim/kota/kod/progress admission. | campaignJourneys.ts:77 |
| onCampaignZoneChanged | Firestore write | Aktif zone değişimlerinde bölge yenileme bildirimi. | campaignJourneys.ts:164 |
| readActivity | Callable | Alıcıya ait, anonimlik kontrollü aktivite projeksiyonu. | anonymousAccess.ts:85 |
| readLikeCount | Callable | Yazar/kişi listesi sızdırmadan uygun toplam beğeni. | anonymousAccess.ts:35 |
| blockPostAuthor | Callable | Post üzerinden gerçek yazarı göstermeden engel ilişkisi. | anonymousAccess.ts:43 |
| readAnonymousWorldMap | Callable | Sahiplik yolu vermeden izinli sınırlı world-map parçaları. | anonymousAccess.ts:60 |
| beginWorldMapUpload | Callable | Post/hesaba bağlı draft upload claim/reclamation hazırlığı. | posts.ts:267 |
| createPost | Callable | Sunucu otoriteli AR/text/GIF oluşturma ve anchor bind. | posts.ts:197 |
| deleteOwnPost | Callable | Sahibin post kaldırması ve asset/anchor temizliği. | posts.ts:199 |
| recordPostView | Callable | Post/kullanıcı/UTC gününe göre idempotent görüntüleme. | posts.ts:224 |
| deleteAccount | Callable | Taze kimlik, Apple revoke ve devam ettirilebilir hard delete. | account.ts:14 |
| retryAccountDeletions | Scheduler | Beş dakikalık kabul edilmiş hesap silme onarımı. | account.ts:56 |
| onDeletedAccountObjectFinalized | PubSub/Storage | Silinen hesaba geç gelen Storage nesnesini temizler. | accountStorageFinalize.ts:52 |
| onLikeCreated | Firestore create | Beğeni sonrası kaynak sayaç, aktivite ve not onayı. | triggers.ts:51 |
| onLikeDeleted | Firestore delete | Beğeni kaynağını yeniden sayar; tekrar olay güvenliği. | triggers.ts:59 |
| onCommentCreated | Firestore create | Yorum filtreleme/profil bağlama, sayaç ve aktivite. | triggers.ts:65 |
| onCommentDeleted | Firestore delete | Yorum sayaçlarını canlı kaynaktan yeniden sayar. | triggers.ts:112 |
| onSaveCreated | Firestore create | Kaydetme sonrası sunucu sayaçlarını eşler. | triggers.ts:119 |
| onSaveDeleted | Firestore delete | Kaydetme kaldırma sonrası yeniden sayım. | triggers.ts:124 |
| onFollowCreated | Firestore create | Takip sayaçları ve uygun aktivite üretimi. | triggers.ts:129 |
| onFollowDeleted | Firestore delete | İki profil takip sayaçlarının yeniden sayımı. | triggers.ts:139 |
| onPostWritten | Firestore write | Post değişimiyle profil/sunum sayaçları, onay bildirimi. | triggers.ts:148 |
| onProfileUpdated | Firestore update | Profil değişiminin gerekli yayın/operasyon yansımaları. | triggers.ts:205 |
| beginAvatarUpload | Callable | Kotalı ve süreli avatar upload slotu açar. | avatar.ts:42 |
| screenAvatar | Callable | Cloud Vision taraması ve kabul edilmiş avatar yayını. | avatar.ts:71 |
| cleanupPostMedia | Scheduler | Sahipsiz/eski varlık ve anchor temizlik kuyruğu. | cleanup.ts:144 |
| reconcilePostCounters | Scheduler | Periyodik post/profil sayaç onarımı. | cleanup.ts:173 |
| retryAvatarDeletions | Scheduler | Başarısız avatar nesne silmelerini yeniden dener. | cleanup.ts:180 |
| getArcoreToken | Callable | Aktif hesaba sınırlı keyless ARCore yetkilendirmesi. | arcore.ts:30 |
| registerCloudAnchor | Callable | Host edilmiş anchor’ı sahipliğe ve bağlama durumuna kaydeder. | anchors.ts:22 |
| registerPushToken | Callable | Hesap/kurulum bazında sunucu push cihaz kaydı. | push.ts:20 |
| unregisterPushToken | Callable | Kurulum push kaydını kaldırır ve hesap geçişini çitler. | push.ts:52 |
| onActivityCreated | Firestore create | Uygun sosyal aktivite için lokalize FCM girişimi. | push.ts:199 |
| markActivityRead | Callable | Alıcıya bağlı aktivitenin okunma durumunu sunucuda yazar. | activity.ts:6 |
| createInvites | Callable | İzinli davet kodu oluşturma. | invites.ts:59 |
| redeemInvite | Callable | Davet kodunu kullanma ve kullanıcının yayın kapısı durumu. | invites.ts:91 |
| searchGifs | Callable | Server-only anahtarla GIPHY arama ve sonuç doğrulama. | giphy.ts:116 |
| readPublicContent | Callable | Mod bazında hesap/blok/anonim/dense kilit projeksiyonu. | publicContent.ts:52 |
| onWorldMapFinalized | PubSub/Storage | PubSub Storage finalize üzerinden world-map güvenlik/temizlik. | mapStorageFinalize.ts:33 |

## 24. HTTP API envanteri - 24 route dosyası

Server component okuma sorguları ayrı route olmak zorunda değildir; aşağıdaki liste HTTP mutasyon/auth uçlarıdır. Dinamik action izinleri ilgili route içinde seçilir.

| Yol | HTTP | Gerekli izin / kapı |
|---|---|---|
| /api/admin/v1/approvals/[approvalId]/decision | POST | posts.metrics.write |
| /api/admin/v1/approvals | POST | posts.metrics.write |
| /api/admin/v1/avatars/[luid]/decision | POST | users.suspend |
| /api/admin/v1/avatars/[luid]/image | GET | users.suspend |
| /api/admin/v1/campaigns | POST | action: brands.write; campaigns.write; campaigns.audience; notifications.send |
| /api/admin/v1/moderation/[flagId]/decision | POST | posts.moderate |
| /api/admin/v1/place-notes | POST | action: posts.moderate veya places.write |
| /api/admin/v1/posts/[postId]/comments | POST | comments.write |
| /api/admin/v1/posts/[postId]/edit | POST | posts.edit |
| /api/admin/v1/posts/[postId]/metrics | POST | posts.metrics.write |
| /api/admin/v1/posts/[postId]/moderate | POST | posts.moderate |
| /api/admin/v1/posts | POST | posts.create |
| /api/admin/v1/roles/[assignmentId]/revoke | POST | admin_users.write |
| /api/admin/v1/system/kill-switch | POST | system.kill_switch |
| /api/admin/v1/users/[luid]/context | POST | kind: users.location.read veya users.telemetry.read |
| /api/admin/v1/users/[luid]/suspend | POST | users.suspend |
| /api/admin/v1/users/create | POST | users.create |
| /api/admin/v1/users/invite | POST | users.invite |
| /api/admin/v1/users/lookup | GET | users.read |
| /api/admin/v1/zones/[zoneId]/active | POST | zones.write |
| /api/admin/v1/zones | POST | zones.write |
| /api/auth/invite | POST | Origin + Auth/session/invite politikası |
| /api/auth/session | POST | Origin + Auth/session/invite politikası |
| /api/auth/signout | POST | Origin + Auth/session/invite politikası |

## 25. TTL politika envanteri - 32 koleksiyon

Alan bütününde expires_at kullanılır. TTL fiziksel silme zamanlayıcısıdır; süresi dolmuş kayıt erişimini kod hemen reddetmelidir. Süresiz place_note_notification_receipts bu listede yoktur. cloud_anchor_deletions/account deletion çitleri de bu listeyle aynı yaşam döngüsünde değildir.

| Koleksiyon | TTL alanı |
|---|---|
| admin_rate_limits | expires_at |
| analytics_events | expires_at |
| arcore_token_quota | expires_at |
| gif_search_quota | expires_at |
| post_view_receipts | expires_at |
| activity_events | expires_at |
| filtered_comments | expires_at |
| trigger_receipts | expires_at |
| post_quota | expires_at |
| cloud_anchors | expires_at |
| anchor_quota | expires_at |
| avatar_uploads | expires_at |
| push_tokens | expires_at |
| push_delivery_receipts | expires_at |
| push_quota | expires_at |
| post_density_locks | expires_at |
| moderation_originals | expires_at |
| avatar_screenings | expires_at |
| admin_audit_log | expires_at |
| user_locations | expires_at |
| user_device_context | expires_at |
| admin_notification_jobs | expires_at |
| admin_notification_receipts | expires_at |
| promotion_push_quota | expires_at |
| campaign_targets | expires_at |
| campaign_view_receipts | expires_at |
| brand_submission_quota | expires_at |
| campaign_departure_regions | expires_at |
| dense_spot_unlocks | expires_at |
| dense_spot_receipts | expires_at |
| campaign_progress | expires_at |
| campaign_codes | expires_at |

## 26. Bakım ve değişiklik sırası

Önce P2 rate-limit yanıtını gerçek HTTP testiyle kapat; ardından eski dokümanları güncel kaynak modeline göre düzelt. Ayrı iş olarak legacy world-map migration kanıtını tamamla. Kullanıcının ertelediği fiziksel iPhone kabulünde AR çapraz cihaz, gerçek App Attest, APNs, GPS giriş/çıkış, force-quit, ağ kesintisi ve pil ölç. Ölçek optimizasyonunu gerçek query/latency ölçümüyle seç; güvenlik kurallarını veya Auth/App Check’i gevşeterek performans üretme.

Bu rapordaki bulgular kaynak analizi olarak sunulmuştur; bu turda app/backend davranışı değiştirilmedi veya yeniden yayınlanmadı.
