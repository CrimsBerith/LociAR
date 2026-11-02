# LociAR — üçüncü derin tarama ve kabul kanıtı

14 Ekim 2026. Backend kaynağı `c8e7717` (önceki ana düzeltme `5c4fc574b`, rıza tamamlaması `4adb3af`); GPS `b1c0381`, onboarding/operatör aracı `949cd8f`. Başlangıç `28b31d18cfcfd370478baec90305a000b25f7508`. Bu çalışma [ikinci taramadaki](FOLLOWUP_RISK_AUDIT_2026-10-14.md) şikâyet, dil filtresi, Messaging SDK ve büyük Storage prefix'i bulgularını tamamlar. Yeni inceleme ayrıca tüm bildirim yollarındaki genel rıza koşulunu ve hesap silmede şikâyet hedefinin kimliğini kapsar.

## Kullanıcı açısından değişenler

- Şikâyet gönderimi artık sunucu üzerinden yapılır. Ağ tekrarı veya art arda dokunma aynı hedef için yeni kayıt ve kota tüketmez. Yeni hedefler için dakikada 5, UTC gününde 20 sınırı vardır. Sınır mesajı 12 dilde gösterilir. Kullanıcı kendi postunu şikâyet etme menüsünü görmez.
- Yeni, askıya alınmış, silinmiş veya silinmekte olan hesapların şikâyetleri otomatik gizleme sayısına eklenmez. Yeni ve askıya alınmış kullanıcılar yine şikâyet gönderebilir; admin incelemesi erişilebilir kalır.
- Genel bildirim rızası açık değilse konum notu, atanmış kampanya veya yalnız push içeren yolculuk bildirimi oluşmaz. Konum notu için ayrıca kendi rızası gerekir. Haritada görünen teklifler genel push rızasından bağımsız kalır; karma harita/AR ödülü geçerli ziyarette kullanılabilir.
- Anonim içeriğin kamuya açık kimlik redaksiyonu korunur. Şikâyet hedefi ve yorumu istemcinin gönderdiği metadata'dan alınmaz. Hesap silmede yeni özel şikâyet kayıtları temizlenir; moderasyon kaydındaki hedef kimliği de anonimleştirilir.
- Kamera açmadan haritada not görme ve AR world lock olmadan GPS notu bırakma mevcut davranıştır. Bu tur bu davranışı kapı/kat algılamasına dönüştürmez.

## Bulgular ve düzeltme

| Bulgu | Önceki risk | Son davranış / regresyon |
|---|---|---|
| Şikâyet çoğaltma ve sahte metadata | İstemci doğrudan moderasyon kaydı yazabiliyor; tekrar ve kota sunucuda zorunlu değildi. | `submitReport` kimliği Auth claim'inden, hedefi gerçek dokümandan alır. Beklenmeyen alan, başka oturum, prototype reason, özel hedef ve kendi hedefi reddedilir. 8 eşzamanlı istek 1 flag, 1 receipt ve 1 kota tüketir. |
| Çok yeni hesaplarla otomatik gizleme | Farklı UUID'ler tek başına yeterliydi. | Farklı şikâyetçiler gerçek, en az 24 saatlik, askıya alınmamış ve silinmeyen hesaplar olmalıdır. Sayfalama ve yinelenen raporların sonraki şikâyetçileri aç bırakmama testi korunur. Bu kontrol aynı kişinin eski hesaplarla işbirliğini tamamen engellemez. |
| Şikâyet içindeki Unicode kesme | 500 UTF-16 biriminde kesilen emoji bozulabilirdi. | Sonda kalan high surrogate atılır. Uzun emoji yorumu kabul edilir; kaydedilen kesitte replacement character oluşmaz. |
| Bildirim rızasını yalnız kategoriyle kontrol etme | Kategori açıkken genel rıza eksik/kapalı durumda bazı arka plan yolları bildirim üretebiliyordu. | Bütün görünür push yolları `notifications === true` koşulunu kullanır. Eksik, `null`, yanlış tür ve `false` senaryoları test edilir. Yalnız push yolculuğunda rıza yokken ilerleme, bütçe veya kod tüketilmez. Karma ödülde harita/kod korunur, push kapalıdır. |
| Dil ve Unicode kaçınmaları / yanlış pozitifler | Türkçe-İngilizce ağırlığı, görünmez karakter, büyük harf ve tam genişlikli URL kaçınmaları; ilgisiz baş harfleri birleştirme ve Fransızca normal kelimeyi engelleme. | Admin ve Functions aynı normalizasyonu kullanır: NFKC, görünmez karakter ve Türkçe/Arabik varyantlar, Hintçe/Bengalce combining mark desteği, 12 dilde temsilî örnekler. Yalnız bitişik tek harf dizileri birleştirilir; Fransızca normal gecikme ifadesi geçer. URL filtresi Unicode normalizasyonunu uygular. |
| Eski Messaging token API'leri | Pinned SDK token API'leri deprecated; yeni kayıt callback'i token döndürmüyor. | iOS register/unregister + Firebase Installation ID kullanır. SDK kayıt işlemi tek uçuşla yürür; çıkış önce uçuşu boşaltır. Sunucu FID ve eski token'ı ayrı adres türü olarak destekler. Global adres sahipliği, oturum/rıza fencing ve gecikmiş eski hata sonrası yeni sahibin kaydını koruma testleri geçer. |
| Storage listesini ve silmelerini sınırsız büyütme | Büyük prefix tüm nesneleri belleğe ve sınırsız eşzamanlı silmeye taşıyordu. | Sayfa 100, silme eşzamanlılığı en çok 10. Hata geldiğinde başlamış işler boşaltılır; retry kalan nesnelerden devam eder. Cursor ilerlememe açık hata olur. 1.300 nesnelik unit fixture 13 sayfa ve peak 10 ölçer; gerçek Storage emulator 107 nesneyi sayfalar arasında siler, başka prefix korunur. |
| Silinen şikâyet hedefinin kimliğini tutma | Kullanıcı raporunda `metadata.reported_user_id` silme sonrası kalabiliyordu. | Hedef kimliği null olur, `target_deleted` işaretlenir; hedefe ait receipt silinir. Başka şikâyetçinin kimliği ve kendi kotası bu hesap silmeyle kaldırılmaz. |

GPS callback sınırı ayrıca kapatıldı: `LocationController` durdurulduktan sonraki konum, pusula ve hata callback'lerini kabul etmez; yeni `start()` eski hata mesajını temizler. Yetkilendirme callback'i durum bilgisini güncellemeye devam eder. Manager injection yalnız testte sistem izin penceresi açmadan gerçek delegate akışını denemek içindir; production varsayılanı aynı `CLLocationManager` kalır. Düzeltme öncesi callback mantığı 1 testte 6 assertion'ı bozdu; son kaynak 183 native testi geçti. İlk heading stub formatter çöküşü ürün hata kanıtı sayılmadı, stub description düzeltildikten sonra davranış regresyonu üretildi.

Fiziksel E2E araç seçicisi kaldırılmış sosyal post testinden mevcut text AR testine düzeltildi. FAIL veya zorunlu test SKIP artık başarısız exit üretir; altı seçicinin kaynakta bulunduğu ve Bash syntax kontrolü doğrulandı. Fiziksel koşu yapılmış sayılmaz.

Onboarding erişilebilirlik kökündeki kimlik alt düğmelere taşınıyordu; gerçek SDK giriş testinde `onboarding-next/finish` bulunamıyordu. Root `.contain` grubu alt kontrol kimliklerini ayırır. Örnek içerik testleri ilk kurulum ekranını atladığı için bu kusuru göstermiyordu. Onboarding düzeltmesiyle gerçek SDK kayıt/doğrulama/giriş akışı demo backend'de geçti. Profil düzenleme, çıkıştan sonra yeniden giriş ve parola ile yeniden doğrulayıp hard delete de aynı sırayla geçti: 4/4, ayrı `.xcresult` paketleri `build/hardening-20261014/native-e2e/attempt-5/` içindedir. Hesap doğrulaması yalnız Auth emulator'un yerel OOB action'ıyla yapıldı; gerçek kişiye e-posta gönderilmedi. Test sarmalayıcısının `TEST EXECUTE SUCCEEDED` işaretini tanımama ve diagnostic string derleme hatası ürün hata kanıtı sayılmadı; son koşu dört testte exit 0 ve gerçek XCTest pass'i doğrular. Demo Firebase client anahtarı sentetik, bütün Auth/Firestore/Storage/Functions uçları loopback; production kullanıcı verisine test yazımı yapılmadı. Functions lib'i hash karşılaştırmalı ayrı kopyadan çalıştı; canlı deploy'un build işlemleri test backend'ini yeniden yüklemedi.

Şikâyet kotası ve receipt sunucuya özeldir; Firestore client erişimi yoktur. Kota `expires_at` TTL'i 2 gündür. Receipt tekilleştirme için kalır ve taraflardan biri hesap sildiğinde temizlenir. Açık veya son 24 saatte kabul edilmiş raporun tekrarı ücretsizdir; moderasyon bu sırada hedefi kaldırmış olsa bile kabul edilmiş sonuç yeniden alınabilir. Transaction saati bekleyen hedef okumalarından sonra okunur; gecikmiş eski istek yeni kota penceresini geriye yazamaz.

Kelime filtresi semantik nefret/tehdit sınıflandırıcısı değildir. Temsilî dil testleri tüm cümlelerin veya bütün kaçınmaların yakalandığını kanıtlamaz; kullanıcı raporu ve insan incelemesi gereklidir. Eski kaynakta 7 hedefli normalizasyon/yanlış pozitif senaryosu başarısızdı; son kaynak ve iki gerçek policy uygulaması bu regresyonları geçer.

## Xcode, simülatör ve otomatik doğrulama

| Kontrol | Kabul |
|---|---:|
| Native LociARTests, imzalı Debug simulator | 183/183 |
| Functions unit | 130/130 |
| Functions tam emulator | 182/182 |
| Firestore + Storage rules | 83/83 |
| Admin unit | 35/35 |
| Admin tam emulator + HTTP | 97/97 |
| Repo script regresyonları | 49/49 |
| Simülatör UI + gerçek SDK demo | 28 geçti, 11 fiziksel skip, 0 hata |
| Yeni canlı admin, masaüstü/mobil Chromium | 24/24, sıfır retry |

Simülatör harita ekranı, örnek post fixture'ıyla kamera açmadan görsel olarak da incelendi: `build/hardening-20261014/simulator-map.png`. Simülatöre verilen 41.0082/28.9784 noktası sentetik test konumudur; gerçek GPS ölçümü veya mağaza girişi kabulü değildir.

Son native + UI kabul paketi: `build/HardeningGPSXcodeFinal-20261014.xcresult`. Release arşivi: `build/LociAR-OnboardingFinal-20261014.xcarchive`; archive, deep/strict codesign ve Crashlytics symbol upload başarılı. Apple Development imzasıdır; fiziksel telefona kurulmadı, TestFlight/App Store'a dağıtılmadı.

İlk UI denemesi paylaşılan simülatörde test bundle'ı yüklenirken durdu; bu sonuç app testlerinin geçtiği sayılmadı. Aynı simülatörde başka proje test çalıştırdığı gözlendi. Ayrı `LociAR Hardening 20261014` simülatörü, iPhone 17 Pro / iOS 26.5 ve paralel UI koşusu kapalı olarak kullanıldı. Fiziksel AR ve emulator hesap akışı için önkoşulu olmayan testlerin skip sonucu başarı toplamına eklenmez. Şikâyet erişimi testi ilk koşuda kendi yazar fixture'ında düğme bekliyordu; ayrı okuyucu fixture'ı ve kendi postunda düğmelerin gizliliği için yeni UI regresyonu eklendi. Son 39 UI testi 24 pass, 15 skip, 0 failure ile tamamlandı. Örnek içerik ve Debug auth fixture'ı canlı oturum veya fiziksel GPS kanıtı değildir.

Yerel kontrollerde 787 test geçti (759 native/backend/admin/scripts + 28 UI); canlı browser kontrolüyle toplam **811 geçen test**. İlk tam UI koşusundaki 15 skip'in 4'ü daha sonra gerçek SDK demo hesabıyla çalıştırıldı ve geçti. Kalan 11 fiziksel UI skip bu toplama eklenmedi. 27 yeni regresyon eklendi; daha önce kabul tablosunda olmayan mevcut UI senaryoları da bu tur çalıştırıldı.

İmzasız native test hostundaki Firebase Installations `SecItemCopyMatching (-34018)` uyarısı ayrıca ayrıştırıldı: Apple Development ile imzalı simülatör kabulünde 182/182 test geçti ve bu Keychain hatası sıfırdı. Sonuç `build/HardeningSignedSimulator-20261014.xcresult` içindedir. Aynı testler toplamda ikinci kez sayılmadı; bu kontrol gerçek APNs teslimi değildir.

Yerelleştirme: 12 dil, 653 toplam anahtar (649 app), 0 needs_review; compiler 618 anahtar / 70 kaynak dosyası. Release kontrolü, secret scan, Functions/admin dependency audit ve admin production build geçti. İlgili Messaging deprecation ve kullanılmayan Swift binding uyarıları kaldırıldı. AppIntents framework'ü kullanılmadığı için Xcode'un metadata extraction notu kalır; sırf bu notu susturmak için kullanılmayan framework eklenmedi.

Post kota testinde saat sınırına denk gelen eski assertion düzeltildi: gerçek kanıt 13:59'da 10, 14:00'da 1 kabul gösteriyordu. Bu 11 kabul aynı saat kotasının aşılması değildi. Son test her gerçek UTC saat belgesinin en çok 10 olmasını, toplamının başarılı çağrılara eşitliğini ve saat başına en çok bir ihlal flag'ini doğrular. Başarısız eski kaynak/fixture koşuları ve tekrar koşuları kabul toplamına eklenmez.

## Canlı geçiş ve uyumluluk

Admin `build-2026-10-14-003`: READY, rollout SUCCEEDED, trafik %100. Yeni quota TTL'i yayımlandı. Etkilenen 26 Functions son kaynakla doğrulandı; her biri ACTIVE, Node.js 22 ve dağıtım başlangıcından yeni updateTime değerine sahip. Sıkı Firestore report kuralları bu doğrulamadan sonra yayımlandı. Son canlı readiness PASS: 60 ACTIVE Functions, 33 TTL, 7 scheduler; 26 gerekli birleşik indeks READY. Üç değişmiş endpoint kimliksiz POST'u 401 UNAUTHENTICATED ile reddetti. Son canlı posts/campaigns sayısı sıfır; gerçek kullanıcı verisiyle mağaza bildirimi veya yük testi yapılmadı.

Geçiş sırası: admin; şikâyet gizleme trigger'ı ve `submitReport`; FID anlayan göndericiler; kayıt API'si; kalan etkilenen Functions; son olarak client `moderation_flags` yazımını reddeden kurallar. Bir Functions update CLI'da başarılı oldu, metadata okumada ECONNRESET çıktı. Yalnız `submitBrandCampaign` tekrar edildi ve canlı metadata ile doğrulandı; hata logu korundu. Kurallar veya IAM zayıflatılmadı.

Bölge `us-central1` ve Firestore `nam5` korunur. Fonksiyonlar bölgesel CPU/deploy baskısını sınırlamak için tek tek yayımlanır; başarısız işin logu korunur ve yalnız o iş yeniden denenir.

Eski iOS sürümü doğrudan rapor yazdığı için sıkı kurallardan sonra şikâyet gönderimi yeni iOS build'ini gerektirir. Güvenlik kuralı veya başarısız callable için doğrudan yazma fallback'i eklenmedi. FCM'de eski token adresleri desteklenir; kayıt migration'ı mevcut kullanıcıların eski push adreslerini zorunlu toplu silmez.

Pinned Firebase iOS header'ı ve Admin SDK 14.5 tip/runtime validator'ı kullanıldı. Canlı FCM `validate_only` çağrısı sentetik, kayıtsız FID için `messaging/installation-id-not-registered` döndürdü. Bu API'nin FID adresini tanıdığının kanıtıdır; gerçek mesaj gönderilmedi ve APNs teslimi ölçülmedi.

Son özel attestation `build/hardening-20261014/verification.json`: 58 kaynak dosyası, kabul logları, son imzalı executable hash'i, dört gerçek SDK testinin sonuçları ve deployment/metadata hash'leri. Native kaynak `949cd8f08cd81d3df105b256c6a9b24d70412467`; bu commit ile dağıtılan backend kaynağı arasında Functions/admin/rules/indexes farkı yoktur. Test emülatörleri ve doğrulama worker'ı kapatıldı; Debug bundle normal production proje ayarlarına ve boş emulator host'una geri alındı, simülatöre bu bundle kuruldu. Harita önizlemesinin örnek içeriği canlı post sayılmaz.

## Kalan doğrulama sınırları

- Fiziksel mağaza girişi, komşu dükkân/kat, batarya/ısı, APNs teslimi, ekran kilidi ve OS sonlandırmasından uyanma fiziksel iPhone'da ölçülmelidir. Bu aşama kullanıcı tarafından ertelendi; simülatör bu kabulün yerine geçmez.
- GPS giriş çemberi 15–100 m, `mesafe ≤ yarıçap + min(doğruluk,20 m)`, doğruluk ≤35 m ve örnek yaşı ≤10 s. 10 s devamlı doğrulama ilk kabul edilen ölçümden başlar; 5 s üstü örnek boşluğu sıfırlar. OS uyandırma çemberi mağaza kapısı veya 2–5 m hassasiyet kanıtı değildir.
- Arka plana alma ile kullanıcı force-quit işlemi farklıdır. Force-quit sonrası normalde OS arka planda yeniden başlatmayı engeller. Sabit 10–15 s teslim ve her kapatma durumunda konum alma garantisi yoktur. [Apple DTS açıklaması](https://developer.apple.com/forums/thread/685525).
- Dış FCM sınırında claim sonrası process kesintisi sosyal push'ı kaybettirebilir; kalıcı aktivite kaydı korunur. Dış servis ile Firestore arasında atomik veya tam bir kez teslim iddiası yoktur.
- Yoğun bölge p95/p99, gerçek trafik maliyeti ve enerji ölçümü ayrıca gerekir. Yapay fixture sınır testi bütün canlı işlerin aynı sürede bitmesini kanıtlamaz.

Özel kanıt klasörü `build/hardening-20261014/`. Kabul logları, kaynak/arşiv hash'leri, başarılı/başarısız deployment kayıtları ve canlı trafik/metadata aynı klasörde tutulur; credential, cihaz adresi veya kullanıcı koordinatı bu rapora kopyalanmaz. Bu çalışma GitHub push veya App Store dağıtımı değildir.
