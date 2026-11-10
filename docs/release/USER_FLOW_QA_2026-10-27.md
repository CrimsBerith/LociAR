# iOS simülatör, not, bildirim ve admin kabulü — 27 Ekim 2026

**Simülatörde gerçek Firebase iOS SDK'sıyla not yayınlama/açma ve yerel panelin gönder düğmesinden
simülatör bildirimine kadar zincir geçti. Canlı admin e-posta koduyla açıldı, ancak kararsız HTTP 429 veriyor.
Canlı uygulamada normal konuk oturumu açıldı; Firebase → APNs Sandbox → simülatör teslimi canlı callable
500/503 hataları yüzünden engelli.** Xcode 26.6, iOS Simulator 26.5; iPhone 17 Pro
ve iPhone SE (3. nesil). Kullanıcının son yönlendirmesi: hedef fiziksel telefon değil Xcode simülatörü.

## Kabul sonuçları

| Katman | Sonuç | Kanıt |
|---|---|---|
| Debug native XCTest | 274 toplam: 272 geçti, 2 yalnız fiziksel cihaz testi atlandı | `simulator-final/native-tests.xcresult` |
| Release konum/güvenlik regresyonları | 83/83 geçti | `release-location-security.xcresult` |
| Gerçek iOS SDK + yerel Firebase kullanıcı akışları | 17/17 geçti | `simulator-final/accepted.json`, ayrı xcresult dosyaları |
| Yerel admin arayüzü → bildirim → simülatör | 5/5 geçti; hazırlık ve hesap temizliği dahil | `panel-to-simulator-final/accepted.json` |
| iPhone SE genel UI | 39/39 geçti; 12 dil, erişilebilirlik ve küçük ekran dahil | `generic-ui-se.xcresult` |
| Admin unit / tip kontrolü / production build | 43/43; tip kontrolü ve derleme başarılı | `admin-unit.log`, `admin-typecheck.log`, `admin-build.log` |
| Admin oturumlu HTTP + Chromium entegrasyonu | 132/132 geçti | `admin-integration.log` |
| Yerel masaüstü/mobil genel web UI | 26/26 geçti | `admin-local-public-browser.json` |
| Functions unit | 188/188 geçti | `functions-unit.log` |
| Firestore + Storage rules | 96/96 geçti | `security-rules.log` |
| Canlı genel web UI, ilk deneme | 0/26; HTTP 429 engeli | `admin-live-public-browser.json` |
| Canlı genel web UI, daha sonra tek worker | 13/26 geçti, 13 başarısız; 429 yinelendi | `admin-live-public-browser-recheck.json` |
| Canlı oturumlu panel, salt okunur kontrol | Gösterge paneli, Konum notları ve Kampanyalar açıldı; Sistem durumu 429; Kullanıcılar 429 sonrası tekrar açıldı | `live-admin-authenticated-pages.json` |
| Canlı konuk oturumu ve bildirim tercihi | Normal konuk girişi açıldı; tercihi kaydetme ve tekrar deneme başarısız, APNs kaydı başlamadı | `live-guest-push-attempt.json` |

Kanıt kökü `build/full-user-flow-20261027/`. Test katmanları ve tekrar koşuları toplanıp tek bir benzersiz
test sayısı gibi sunulmaz. Release testleri native kontrollerin alt kümesidir; panel akışı bazı SDK hazırlık
senaryolarını tekrarlar. `xcresult-independent-verification.json` sonuç paketlerini ayrıca okur; başarısızlık
ve atlamaları kontrol eder. Her SDK/panel koşusunda kurulan app Info.plist/binary hash'leri koşu başı/sonu aynıdır.

## Not ve mobil işlevler

Gerçek iOS SDK'sı, gerçek callable/Firestore kodu ve yalnız geçici `demo-lociar` servisleri kullanıldı.
Sentetik hesaplar ve İstanbul'daki kontrollü simülatör koordinatı kullanıldı; canlı kullanıcı içeriği oluşturulmadı.

Doğrulananlar: kayıt, emülatör e-posta doğrulaması, giriş, boş/221 karakter notu engelleme, kamerasız anonim
not yayınlama, elle yenilemeden haritada görünme, notu açma, güncel konum yokken yayınlamama ve ölçüm dönünce
yeniden deneme, filtrelenmiş metnin yerelleştirilmiş hatası ve düzeltip yayınlama, uzaktaki notları kilitli tutma,
yerinde map-group erişimi ve beğeni sırası, profil düzenleme, kaydedilen/koleksiyon sayfalaması, rıza kalıcılığı,
çıkış/giriş, konum notu bildirimi ve doğru nota yönlenme, test hesabını Auth/Firestore/Storage'dan silme.

Genel UI paketi ayrıca beş sekme/profil rotaları, AR düzenleme ve görüntüleme arayüzü, şikâyet/engelleme
kontrollerinin erişimi, 12 dil, RTL, büyük yazı/erişilebilirlik ve Debug ödeme durumlarının taklit sağlayıcıyla
akışlarını kapsar. Gerçek ödeme yapılmadı; Release ödeme girişlerinin kapalı olduğu mevcut politika korundu.

## Panelden bildirim zinciri

`LOCIAR_SIMULATOR_ADMIN_PANEL=1` ile `scripts/simulator-admin-panel.mjs` gerçek yerel Next.js admin arayüzünü
açar. Sentetik emülatör admin oturumuyla kullanıcı satırından bildirim formunu doldurur; **Queue notification**
düğmesine basar. Aynı alıcı/başlık/mesajın `admin_notification_jobs` kaydını doğrular.

Üretim `deliverAdminNotification` işlevi, açıkça enjekte edilen `simctl push` taşıyıcısıyla çalışır. Simülatörde
bildirim görünür; dokununca **Aktivite** açılır, aynı mesaj görünür, `accepted=1` ve `read_at` doğrulanır.
Bu, gerçek FCM/APNs ağına teslim kanıtı değildir. Emülatörün dış FCM gönderimini engelleyen koşulu korunur.

17 senaryoluk pakette arka plan, soğuk açılış, ön plan, yabancı alıcıyı sunmama/yönlendirmeme, tekrar teslimi
engelleme ve bildirim rızası kapalıyken admin kuyruğunu reddetme de geçti. Pazarlama rızası ayrı ve kapalı kaldı.
Admin emülatör oturumunun MFA claim'leri sentetiktir; gerçek OTP/TOTP veya imza doğrulaması kabulü sayılmaz.

Ekranlar: `note-published.png`, `note-opened.png`, `admin-panel-queued.png`, `panel-notification-banner.png`,
`panel-notification-opened.png`. Başarılı not testinin sonuç paketi Xcode Reports görünümünde açık bırakıldı;
`xcode-note-test-passed.png` aynı kanıttır.

## Düzeltilenler

1. **Simülatör GPS sınırı tutarsızlığı:** `LocationSample` bütün simülatör GPS'ini kabul ederken not ölçümü
   raw provenance'ı reddediyordu. İlk gerçek SDK not denemesi bu nedenle konum hazır durumuna ulaşmadı ve
   sunucuya yayın isteği gitmedi. `LocationProvenancePolicy` ölçüm, seed, sample ve AR erişiminde tek sınır oldu.
   İstisna yalnız **Debug + iOS Simulator + açık opt-in + tam eşleşen sentetik demo Firebase ayarları + özel LAN
   adresi** için çalışır. Gerçek cihaz ve Release her durumda simüle GPS'i reddeder. Release 83/83, Debug
   güvenlik kontrolleri ve asıl yayın/açma senaryosu ile doğrulandı.
2. **Daraltılmış test planının temizliği:** fixture, her seçimde üç not yayımlandığını varsayıyordu. Panel
   denemesi tek not yayımlayınca hazırlık assertion'ı başarısız oldu; ürün silme hatası değildi. Beklenen not sayısı
   seçilen yayın senaryolarından türetiliyor. Tam planda üç, dar planda bir notla temizleme geçti. İlk başarısız
   koşu `panel-to-simulator/`, son başarılı koşu `panel-to-simulator-final/` altında korundu.
3. **429 izleme boşluğu:** Cloud Run'ın `no available instance` kapasite hatası `WARNING` olduğu için sadece
   `severity>=ERROR` filtresi bunu kaçırıyordu. Mevcut `server_errors` politikası bu özel HTTP 429'u da kapsayacak
   biçimde güncellendi. Gerçek kayıtla eski koşulun eşleşmediği, yeni koşulun eşleştiği ayrıca doğrulandı:
   `monitoring-429-live-query-proof.json`. Üç politika, aynı alıcı ve saatte bir bildirim sınırı korundu; özel metrik,
   Scheduler işi veya yeni ücretli servis eklenmedi. E-posta gelen kutusu teslimi hâlâ doğrulanmadı.

## Canlı ortam ve kalan sınırlar

- **P1 — canlı admin kullanılabilirliği kararsız:** App Hosting hem tarayıcıda hem bağımsız HTTP isteğinde
  `429 Rate exceeded` verdi. Cloud Run kayıtlarında `The request was aborted because there was no available
  instance` var. Daha sonra tek istek 200 dönse de tek worker'lı masaüstü/mobil tekrarında 13 kontrol yine
  başarısız oldu. Sorun yalnız test paralelliğiyle açıklanamaz. [Google hata açıklaması](https://docs.cloud.google.com/run/docs/troubleshooting#abort-request).
- Cloud Run `Ready=True`, son ready revision `lociar-admin-build-2026-10-17-001`; canlı runtime Next.js 16.3.8,
  incelenen yerel sürüm 16.4.3. Billing enabled; bakılan CPU/bellek/instance kotalarında sıfır limit görülmedi.
  Bu veriler kesin alt nedeni tek başına belirlemez. Instance/kota/bütçe sınırları yükseltilmedi, backend deploy
  edilmedi. `admin-cloudrun-http-errors.json`, `admin-run-quota.json`, `admin-service-scaling.json` kayıtlıdır.
- **Canlı admin oturumu kullanıcı tarafından e-posta koduyla açıldı.** Bu oturum AAL2/MFA değildir.
  Gösterge paneli, Konum notları ve Kampanyalar sayfalarının gerçek başlık/içerikleri görüldü. Kullanıcılar
  sayfası önce yüklemede kaldı, doğrudan gezinmede `Rate exceeded.` verdi; başarılı sayılmadı.
  Sonraki yeniden yüklemede Kullanıcılar sayfasının gerçek liste ve arama alanları açıldı; hata aralıklıdır.
  Sistem durumu sayfası yeniden yüklemede de aynı hatayı verdi. `admin-live-users-rate-exceeded.png`
  kayıtlıdır. Oturum atlatma, yeni rol veya izin verme yapılmadı.
  Canlı panelden simülatöre gerçek APNs bildirimi henüz gönderilmedi; aşağıdaki canlı sunucu engeli sürüyor.
- **Hedef düzeltmesi:** başlangıçta fiziksel cihaz için bağlantı sorusu iletildi; kullanıcı Xcode simülatörünü
  seçti. Bundan sonraki push hedefi simülatördür. Apple, uygun Mac/iOS simülatörlerinde gerçek APNs Sandbox
  teslimini destekler ([resmi Xcode notları](https://developer.apple.com/documentation/xcode-release-notes/xcode-14-release-notes)).
  Sabitlenmiş Firebase 12.19.3 kodu da simülatör APNs kaydını sandbox olarak işliyor.
  `LociAR Notes SE 20261016` üzerine canlı `lociar-2f38c` projesine bağlı, emulatorHost boş, imzalı Debug app
  derlenip kuruldu. Kullanıcının "sen dene bir hesapla" yönlendirmesi üzerine, kurallar onayı zaten seçiliyken
  uygulamanın normal "Hesapsız devam et" düğmesiyle canlı konuk oturumu açıldı. Yeni parola, doğrulanmış
  kimlik, rol veya oturum atlatma oluşturulmadı. Bu hazırlık gerçek FCM/APNs teslimi kanıtı değildir. Fiziksel kamera/GPS/Cloud Anchor alan testi ayrıca
  bu simülatör kapsamının dışındadır.
- **P1 — canlı temel callable'lar çalışmıyor:** konuk oturumunda harita yüklemesi hata verdi. Bildirimleri açma
  ve uygulamanın normal "Tekrar dene" eylemi sonrasında "Veri paylaşımı güncellenemedi" kaldı. Pazarlama,
  teknik veri ve yöneticiyle konum paylaşımı kapalı. iOS bildirim izni `authorized`, fakat push tanılama
  kayıtlarında `delivery=false`, Functions hata kodları 13/14 var; APNs kayıt başarı izi yok.
  Aynı zaman aralığındaki Cloud Run kayıtlarında `ensureprofile` iki kez HTTP 500 ve "no available instance",
  `readdatapreferences` HTTP 500 ve "The request failed because billing is disabled for this project." verdi.
  Bağımsız, kimliksiz salt okunur `readDataPreferences` isteği HTTP 503 döndü; bu yanıt yetki aşımı veya başarılı
  callable testi sayılmaz. Billing API aynı anda `billingEnabled=true`, bağlı hesap `open=true` gösterdiği için
  27 Ekim denemesinde hesabın kapalı olduğu veya kesin alt neden söylenemedi. Faturalandırma bağlantısı, ödeme, limit ve servis
  dağıtımı değiştirilmedi. `live-guest-preferences-error.png`, `live-account-runtime-errors.json`,
  `live-billing-after-guest-attempt.json`, `live-billing-account-open-status.json` ve
  `live-read-preferences-independent-response.json` kanıtları kayıtlıdır. Google, faturalandırma yeniden
  etkinleştirildiğinde bazı servislerin elle yeniden başlatılmasını gerektirebileceğini belirtir; bunun bu projedeki
  kesin neden olduğu o denemede doğrulanmadı ([resmi servis kurtarma belgesi](https://docs.cloud.google.com/billing/docs/how-to/restart-services)).
- **28 Ekim kök neden doğrulaması:** Billing Budgets API'de projeye ve Cloud Run Functions'a özel
  `LociAR spend cap` aylık **₺10**, `EXCLUDE_ALL_CREDITS`, `outputState=ENFORCED` döndü. Aynı anda
  `readDataPreferences` 503 vermeye devam etti. Hesap açıkken hizmetin durması bu hizmet cap'iyle
  açıklanıyor; yeniden dağıtım veya instance artırımı engeli çözmez. Canlıda yedi eski Scheduler işi hâlâ
  `ENABLED`; kaynakta hazırlanmış üç işlik geçiş henüz yayında değil. Yirmi üç odaklı dağıtım/bakım testi
  geçti. Ayrıca izole `demo-lociar` ortamında iki bakım entegrasyon testi (lease, pause, hata kaydı,
  panelden çalıştırma ve geçersiz iş reddi) geçti; geçici emülatörler kapandı. Bütçe ve iş tanımları
  `build/runtime-recovery-20261028/` altında yedeklendi; harcama sınırını artırmak
  için kullanıcının tutar seçimi bekleniyor. Cap veya altyapı değiştirilmedi.
- GIPHY production sağlayıcısı, gerçek Apple Translation model indirme ve gerçek ödemeler bu yerel başarıların
  kapsamı dışındadır. Simülatör UI'sı gerçek AR donanımını kanıtlamaz.
- Canlı Firebase metadata kontrolü **25 bulguyla hazır değil**; rapor `build/firebase-readiness/full-user-flow-20261027.json`.
  Rapordaki kaynak/dağıtım uyumsuzluğu, map-group TTL ve eksik callable/zamanlayıcı bulguları ayrıca ele alınmalıdır.

## Çalışma ağacı ve temizlik

Başlangıçtaki 43 kirli dosya `worktree-before.tar.gz` ve `baseline.json` ile yedeklendi. Bu çalışmada bunlardan
yalnız not ölçümü, tanılama betiği/testi ve ilgili dokümantasyonun beş dosyası değiştirildi; diğer başlangıç
dosyalarının hash'leri korundu. Yerel testler geçici hesapları temizledi; iki emülatör grubu ve yerel test
sunucuları kendi koşuları sonunda kapandı. GitHub push, App Store upload veya uygulama/backend yayını yapılmadı.

Tekrar kurulum: `scripts/run-simulator-notes.mjs`; Node 22 + Java 21. Ayrı `LociAR Notes` adlı simülatör ve
yeni `LOCIAR_TEST_OUTPUT` seçilir. Panel zinciri için önce `npm --prefix admin run build:ci` çalıştırılır,
`LOCIAR_SIMULATOR_ADMIN_PANEL=1` eklenir. Üretim Firebase ayar dosyası bu testler için düzenlenmez.
