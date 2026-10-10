# Native iOS / Firebase yayın hazırlığı

Güncelleme: **10 Ekim 2026**. Bu belge kapsamı ve açık yayın kapılarını tutar.
Yayın adayı henüz onaylı değildir. Aşağıdaki 5 Ekim test kayıtları tarihseldir;
güncel kaynak, CI ve canlı metadata kanıtı ayrıca değerlendirilir.

## 10 Ekim düzeltme paketi

- Mac/Xcode 26.6: 127 native birim ve 19 simülatör UI testi geçti. Giriş ekranındaki disabled
  Apple düğmesi artık erişilebilirlik trait'ini taşıyor; yasal profil linkleri kaydırılarak
  sınanıyor; İngilizce sekme beklentisi `Discover` ile eşleşiyor. Consent açma/kapatma kontrolü de geçti.
- `ci-ios.sh` iki lokalizasyon smoke testi yerine simülatöre uygun tüm navigasyon,
  erişilebilirlik, oluşturma ve İngilizce/Arapça RTL testlerini seçer. Fiziksel/emülatör testleri ayrı kalır.
- 19 kapılı yerel preflight geçti. Chromium kurulumu kapıya dahil; admin test sunucuları
  `.env.local` içindeki canlı bucket/credential ayarlarından bağımsız, açık demo ayarlarıyla çalışır.
- Brand validator'unun karmaşıklık ve tekrarlanan path bulguları düzeltildi; 47 PNG kontrolü geçti.
- Named gcloud backfill, Firestore'un desteklemediği custom Firebase Credential yerine OAuth
  kullanır; credential seçim/cache/fail-closed regresyonları geçti. Token bitişi Google
  token-info yanıtından alınır; sabit bir kalan süre varsayılmaz, geçersiz/bitmiş süre reddedilir. Canlıdaki iki profilin
  `account_access` kaydı hazırlandı, tekrar koşusunda `changed=0`; world-map ön incelemesi 0 post / 0 token.
- `GIPHY_API_KEY` Secret Manager'da ENABLED; tek GIF'li API kontrolü HTTP 200. Anahtar koda
  veya iOS bundle'a konmaz. Beta anahtarının toplam limiti 100 çağrı/saat; production yükseltmesi ayrı kapıdır.
- Canlı Firestore/Storage rules repo ile aynı; 18 composite index READY ve 19 TTL ACTIVE.
  Storage bucket US-EAST1 ile Functions us-central1 arasında private Pub/Sub identity/generation
  bildirimi kullanılır; retry ve doğru topic/region metadata kapısında sınanır.
- Metadata raporları yalnız private `build/firebase-readiness/` klasöründe düz JSON dosya adıyla
  okunur/oluşturulur; traversal, symlink ve mevcut dosyanın üzerine yazma reddedilir.
- GitHub `main` koruması CI ve SonarCloud sonuçlarını zorunlu kılar; force-push ve dal silme kapalıdır.

Canlı Functions/rules/index/TTL/Scheduler kabulü, aday dağıtımından sonra
`qa-live-firebase.py` ile yeniden doğrulanır. Fiziksel AR, gerçek Apple/APNs/TOTP,
TestFlight ve App Store gönderimi bu otomatik sonuçlarla onaylanmaz.

## Kapsam

- iOS 17+, Swift 6, SwiftUI, ARKit/RealityKit, ARCore Cloud Anchors/Geospatial, MapKit ve SwiftData.
- Firebase `lociar-2f38c`: Firestore `nam5`, Functions `us-central1`; üretimde callable App Check zorunlu.
- Postlar metin ve/veya 1 GIPHY GIF'i içerir (GIPHY anahtarı `GIPHY_API_KEY` secret'ı). Sosyal medya bağlantısı, çizim ve fotoğraf/video post yüklemesi kapalıdır;
  avatar fotoğrafları Cloud Vision incelemesinden geçer.
- Mobil yeni postlar `pending_review`; korumalı bölge ve 18+ engelleri korunur.
  Yetkili admin seçilen kullanıcı adına yayın/yorum oluşturabilir; korumalı bölge istisnası
  gerekçe ve ayrı yetki ister. 18+ admin için de kapalıdır.
- Post/profil/sayaç/aktivite/admin yazmaları sunucu denetimindedir. Apple hesabı silinmeden önce
  güncel Firebase yeniden doğrulaması ve Apple token iptali gerekir.
- Admin: Next.js 16, Firebase App Hosting, güvenli session cookie, TOTP MFA, statik RBAC ve audit.
- Push açık; 12 dil: `tr`, `en`, `zh-Hans`, `hi`, `es`, `fr`, `ar`, `bn`, `pt`, `ru`, `de`, `ja`.

Expo, Android, Supabase, Docker ve Vercel dönemindeki arşivler bu sürümün kapsamı veya kanıtı değildir.

## İnceleme bulguları

| Bulgu | Yapılan düzeltme / kanıt | Yayın için kalan |
|---|---|---|
| F01 — Eksik koleksiyon belgesi okuması | İmzalı kullanıcı için eksik belge `get` davranışı ve sahiplik/list rules testleri | Canlı rules dağıtımı |
| F02 — Yazarın sildiği postun admin ile geri gelmesi | Admin restore/relabel engeli; gerçek Firestore işlem testi | Aday admin ve Functions deploy |
| F03 — Filtrelenmiş yorum sayacının tekrar azalması | İşlem kaydı, hedef ve filtre işareti tek transaction; eşzamanlı tekrar testleri | Canlı tetikleyici sürümü |
| F04 — Bağımlılıklar | Next/sharp/CLI ve geçişli yamalar, kilitli kurulum, üretim ve tam audit CI; Pub/Sub'a özel OpenTelemetry yaması iki moderate bulguyu kapattı | Kapandı (6 Ekim): CLI'ın chokidar'ı 4.x'e zorlandı, braces ağaçtan çıktı; tam audit iki projede temiz, istisna kaldırıldı ([ayrıntı](../DEPENDENCY_SECURITY.md)) |
| F05 — Depoda test/review parolaları | Literal değerler kaldırıldı; redakte scanner, özel dosya, mevcut hesabı yenileme ve refresh token iptali testleri | Eski canlı parolalar değiştirilmeli; parola yöneticisi/App Store Connect güncellenmeli |
| F06 — Push akışı | Token sahipliği/rotasyonu/sınırı, gizli payload, engelleme, çıkış/silme, tek gönderim girişimi; native oturum koordinatörü | Gerçek APNs/FCM, izin/Ayarlar, soğuk açılış, hesap değişimi, TestFlight |
| F07 — Statik admin güvenlik kontrolleri | Gerçek Next HTTP ve Auth/Firestore emülatör testleri: cookie, origin, MFA claim, RBAC, role iptali, onay, audit/idempotency, rate limit | Canlı Identity Platform TOTP challenge ve App Hosting origin |
| F08 — Aktivite okundu yazımı | Sunucu callable, gerçek belge ID, ilk zamanın korunması, yabancı alıcı/oturum reddi, UI retry | Fiziksel UI ve push dokunma akışı |
| F09 — Hesap silmede reauth | Parola ve Apple provider reauth, nonce/ID token yenileme, taze oturum; Apple revoke hatasında silme iptali | Gerçek Apple ve parola hesabıyla fiziksel silme kabulü |
| F10 — Dil/izin metni eksikleri | 583 UI + 3 izin anahtarı, 12 dil, biçim argümanı ve kaynak taraması; yeni metinlere bağlam incelemesi | Derlenmiş bundle, dil değişimi, RTL, VoiceOver, Dynamic Type |
| F11 — Native/cihaz CI kanıtı | macOS/Xcode CI ve Mac'te 127 native + 19 geniş UI testi; 23 saha koşusu için kanıt doğrulayıcı | Yeni adayın CI sonucu ve iki fiziksel iPhone matrisi |
| F12 — Eski çalışma/yayın belgeleri | Güncel pano, bu plan, QA komutları, tarihsel saha/canlı iddialarının ayrılması | Her yayın adayının sonuçları bu plana bağlanmalı |
| F13 — Kesintiye uğrayan hesap silme | Kalıcı, aşamalı ve lease ile korunan iş; beklenen batch sonuçları; beş dakikalık retry; yeni yazmalara engel; silmeden sonra tamamlanan yüklemeler için retry edilen generation koşullu finalize temizliği | [Geçiş sırası](../ACTIVITY_AND_ACCOUNT_DELETION.md#canlıya-geçiş-sırası), `account_access` backfill ve canlı Scheduler/Eventarc/IAM kabulü |
| F14 — Ters sıralı sayaç olayları | Transaction içinde kaynak sayımı; tekrar/ters sıra testleri; tüm kayıtları sırayla dolaşan reconciler ve engagement onarımı; açık admin düzeltmeleri için offset | Aday tetikleyici ve scheduler dağıtımı |
| F15 — Eşzamanlı yakın postlar | Mekânsal kilit, yoğunluk, kota, anchor ve post tek transaction; tekrar denemede kota tüketilmez | Yeni `post_density_locks.expires_at` TTL alanı ve aday Functions |
| F16 — Eksik korumalı bölge kontrolü | Her transaction denemesinde tüm aktif bölgeler sayfalanır; önbellek/sabit kayıt sınırı kaldırıldı; geçersiz aktif geometri reddedilir | Gerçek veri hacminde gecikme/maliyet takibi |
| F17 — Yetim AR dosyalarının takılması | Kalıcı tarama cursor'u ve dosya/faz ilerlemesi; yeniden yayınla yarış için reclamation kaydı; generation koşullu silme | Storage kuralları ve cleanup dağıtımı; [emülatör sınırları](../ORPHAN_UPLOAD_CLEANUP.md) |
| F18 — Admin davet ve form işlemleri | Davet/rol/audit atomik; payload'a bağlı idempotency; normal kullanıcı callback'i; ağ/HTML hatasında form tekrar denenir; Chromium işlem testleri | Gerçek e-posta teslimi, TOTP ve App Hosting |
| F19 — Eski kayıtlara erişim | Admin envanterleri ve caption taraması cursor ile devam eder; analytics toplamları server COUNT; mobil yorumlarda en yeni 50 + eski sayfalar | Yeni yorum indeksi; Swift ekranı/native test kabulü; tam metin araması ayrıca ürün kararı |
| F20 — Eksik yayın kontrolleri | Linux Node 22/Java 21 preflight tüm yerel kapıları zorunlu çalıştırır; başarı koduna ek olarak tam Node/Playwright özeti ve sıfır fail/skip/cancel aranır; eksik test kanıtı deploy'u durdurur; günlük/manuel audit ve metadata validator | CI'ı aday commit ile çalıştırmak; canlı metadata ve cihaz kapıları |
| F21 — Claude dalıyla birlikte geliştirme | 5 commit / 81 dosya karşılaştırıldı; nonce CSP, ayarlar, yasal sayfalar, bölge/rol işlemleri ve hata düzeltmeleri mevcut kalıcı silme/atomik yayın altyapısına uyarlandı | Çalışma ağacını aday commit olarak CI'da doğrulama |
| F22 — İşlem güvenliği ve acil kapatma | Flags + audit atomik/payload'a bağlı; okuma hatasında admission kapalı; eşzamanlı MFA audit ve son super admin koruması | Canlı IAM/MFA ve en çok 15 saniyelik instance cache yayılımı |
| F23 — Yorum geri getirme / silme yanıtı | Moderatör geri getirmesi marker'ı kaldırır; eski delivery yorumu tekrar silemez; accepted deletion yanıtı native pending ekranına eşlenir | Native ekran/test koşusu |


## Bu oturumdaki doğrulama

5 Ekim son tam koşusunda Linux bulut ortamında **367 farklı test geçti,
0 başarısız / 0 iptal / 0 atlanan**:
Functions 76 birim + 74 rules + 96 entegrasyon, admin 26 birim + 47 entegrasyon,
depo betikleri 40 ve gerçek Chromium'da 8 public tarayıcı testi. Admin entegrasyonu
6 gerçek authenticated/mobile Chromium işlem akışını da içerir; toplamda ayrıca sayılmaz.
18 kapılı tam preflight; Functions/admin tipleri, admin production build, production/tam
audit, secret taraması, 586 anahtar/12 dil, actionlint ve betik/plist/JSON kontrolleri geçti.
Production dependency audit temiz. 6 Ekim'de CLI'ın chokidar'ı 4.x'e zorlandı; braces ağaçtan çıktı,
tam audit de iki projede temiz ve istisna kaldırıldı.
Test toplamı native testleri içermez. Xcode mock testleri yalnız betik hata kodunu sınar.
Offline metadata validator'unun 17 Python fixture'ı depo regresyon testinin içinde koşulur;
bu toplama ayrıca eklenmez. MFA state temizleme değişikliği son tam derleme/entegrasyon
koşusunda da doğrulanmıştır.

İlk 5 Ekim koşusu admin bağımsız onay tarayıcı testindeki 120 saniyelik zaman aşımında
durdu (47 test: 46 pass, 1 cancel); public tarayıcı kapısı çalışmadı. Bu koşu başarı
olarak sayılmaz. İzole onay ve altı tarayıcı akışı geçti; son tam koşuda 47/47 geçti.
İlk zaman aşımının nedeni kesinleşmedi. Akışlara dış timeout'tan önce hata/iz kaydı
üretme ve context temizleme sınırları eklendi; tekrar ederse aşama/trace ile incelenmelidir.

Ayrıntılı rapor ve ham loglar `/workspace/LociAR-review/` altındadır;
bu makineye özgü dizin Git'e eklenmez. Son rapor: `DUZELTME-PAKETI-7.md`;
sayım ve lockfile kanıtı: `final-test-counts-2026-10-05.json`.
Başarısız/eski veya elle durdurulmuş koşular son başarılı koşu yerine kullanılmaz.
Testleri sürüm adayında tekrarlamak için [QA_MATRIX.md](../QA_MATRIX.md) ve CI kullanılır.

Admin emülatör testleri üretim Next HTTP sunucusunu, gerçek cookie/API/Firestore işlemlerini kullanır.
Auth emülatörünün kabul ettiği MFA claim fixture'ları gerçek TOTP challenge veya üretim JWT imzası kanıtı değildir.
Public Chromium koşuları gerçek tarayıcıdır; ayrıcalıklı canlı admin oturumunun testi ayrıca gerekir.

## Açık yayın kapıları

**İlk canlı geçiş:** Yeni Storage kurallarından önce mevcut profillerin `account_access` kayıtları
hazırlanmalıdır. [Salt okunur backfill, sonuç inceleme ve geçiş sırası](../ACTIVITY_AND_ACCOUNT_DELETION.md#canlıya-geçiş-sırası)
bakım penceresinde uygulanır. Yerel preflight bu canlı veri göçünü gerçekleştirmez.

| Sorumlu | Kapı | Kapanma kanıtı |
|---|---|---|
| iOS / CI | macOS native build ve test | Aday commit için CI'daki `iOS simulator` işi başarılı; `.xcresult`, Xcode sürümü, bundle/dil testleri |
| QA / iOS | İki cihaz AR ve erişilebilirlik | [Saha matrisi](../../FIELD_TEST_CHECKLIST.md), 23 gerçek koşu; log/video, ölçülmüş drift ve kilit süresi; VoiceOver/RTL/büyük font |
| iOS / Firebase | Apple silme ve APNs | [Push](../PUSH_NOTIFICATIONS.md) ve [silme](../ACTIVITY_AND_ACCOUNT_DELETION.md) kabul matrisleri; Release entitlement/APNs yapılandırması; TestFlight teslimi |
| Firebase / yayın sorumlusu | Canlı erişim ve credential yenileme | Doğru projeye yetkili GCP kimliği; eski parola girişinin reddi, yeni girişin başarısı, refresh session iptali; özel kaydın güvenli aktarılması |
| Firebase / admin | Canlı altyapı | Aday rules/indexes/Functions/App Hosting, TTL, Scheduler, Storage lifecycle, Vision/ARCore/signing yetkileri, App Check enforcement, Apple secret metadata |
| Admin / QA | Canlı admin güvenliği | Gerçek TOTP AAL2 girişi, rol iptali, origin politikası, audit, iki kişi onayı; public yasal/destek URL'leri HTTP 200 |
| Yayın sorumlusu | Son aday kararı | İmzalı arşiv, doğru build/commit, privacy/App Review metadata, tüm kapılara bağlı kanıt |

Bu bulut ortamında Swift/Xcode ve fiziksel iPhone yoktur. Yönetilen GCP bağlantı manifesti boştur;
platformun bootstrap credential yolu kullanıcıya ait canlı Firebase yetkisi olarak kullanılamaz.
Canlı değişiklikler için güvenli ortam ayarlarında GCP kimliği bağlanır; credential içeriği sohbete veya depoya konmaz.

Yerel yayın kontrolleri (deploy veya canlı kimlik seçimi yapılmaz):

```sh
bash scripts/firebase-deploy.command --dry-run
```

Node 22, Java 21 ve Playwright Chromium gerekir. Emülatör kapıları sırayla çalışır;
herhangi bir test/audit/secret/dil kontrolü hatası sonraki aşamaları durdurur.

Yetkili makinede metadata toplayıp kabul koşullarını denetleyen yardımcı:

```sh
python3 scripts/qa-live-firebase.py --gcloud-configuration <yetkili-konfigurasyon> --report /private/firebase-readiness.json
# Kaydedilmiş metadata için; canlı durumu yenilemez:
python3 scripts/qa-live-firebase.py --from-report /private/firebase-readiness.json
```

Bu komut deploy/rotasyon yapmaz ve secret değeri okumaz. Sıfır çıkış kodu modellenen metadata
kabul koşullarının geçtiğini gösterir: beklenen API'ler, TTL, Functions, Scheduler, Firestore,
Storage lifecycle ve Apple secret sürüm durumu. Dağıtılan rules içeriği, index build, gerçek IAM,
App Check enforcement ve cihaz akışları ayrıca doğrulanır. [Şema ve sınırlar](FIREBASE_METADATA_READINESS.md).
Canlı kurulum: [FIREBASE_SETUP.md](../FIREBASE_SETUP.md). Parolalar: [CREDENTIALS.md](../CREDENTIALS.md).

## MVP sonrası karar gerektiren işler

Bu maddeler mevcut güvenlik düzeltmelerinden ayrıdır; davranış değişikliği için ürün kararı gerekir.

| İş | Mevcut sınır | Kabul / sorumlu |
|---|---|---|
| Koleksiyon görünürlüğü | MVP'de koleksiyonlar özel; public görünürlük akışı tamamlanmış sayılmaz | Ürün + Firebase: paylaşım/izin kararı ve rules/UI kabulü |
| Tam metin arama ve bölgesel ölçek | Caption taraması tüm kayıtlar boyunca devam eder; Firestore tam metin indeksi sağlamaz. Korumalı bölgelerin tamamını okuma maliyeti veriyle büyür | Ürün + Firebase: ölçek hedefi, arama servisi/bölgesel indeks kararı |

Bu sınırların kaldırıldığı veya fiziksel/canlı kapıların geçtiği varsayılmaz.

## 5 Ekim derin tarama düzeltmeleri ve admin içerik işlemleri

Yeni akışlar, yetkiler, saklama süreleri ve henüz çalıştırılmamış canlı veri geçişi:
[Admin içerik işlemleri](ADMIN_CONTENT_OPERATIONS.md). 24 maddelik derin tarama kapsamı bu
pakette ele alındı; native kod değişiklikleri macOS/iPhone kabulü bekler. Linux/emülatör
sonuçları güncel çalışma ağacına aittir; fiziksel veya canlı kabul olarak değerlendirilmez.

Bu paketin yerel sonucu: **18 kapı, 398 test, 0 fail/cancel/skip**. 42 depo, 79 Functions birim,
26 admin birim, 77 rules, 106 Functions emülatör, 60 admin HTTP/Chromium ve 8 public Chromium.
Sonraki native regresyon/kod eklemeleri için Xcode kabulü beklenir; native testler bu sayıya dahil değildir.
