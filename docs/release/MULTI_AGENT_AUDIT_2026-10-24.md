# LociAR çok ajanlı uçtan uca denetim — 24 Ekim 2026

**Sonuç: Mevcut sürüm yayın için hazır kabul edilemez.** Test paketleri geçiyor; buna rağmen bu tur ayrı senaryolarla anonimlik, özel ilişki mahremiyeti, admin rol yetkisi ve harita okuma geometrisi kusurları yeniden üretildi. Canlı ödeme altyapısı da eksik/sağlıksız. Bu rapor mevcut kodu düzeltmiş veya dağıtmış sayılmaz.

## Kapsam ve yöntem

Üç uzman alt ajan iOS/AR, Firebase/güvenlik/ödemeler ve admin/operasyon alanlarını paralel inceledi. Ana ajan testleri, canlı metadata okumalarını, GitHub karşılaştırmasını ve bulgu doğrulamalarını yürüttü. Alt ajan oturumları kullanım sınırına ulaştıktan sonra kaydedilen araçlarla kalan doğrulamalar ana ajan tarafından tamamlandı.

İnceleme root ve admin `AGENTS.md`, geçerli global talimatlar, güncel kaynak ve yerel değişiklikler, bağımlılıklar, emülatör/simülatör sonuçları ve salt okunur canlı servis metadata'sını kapsar. Üretim kullanıcı içerikleri okunmadı. Kimlik bilgileri/secret değerleri rapora alınmadı. Canlı ortama yazma, deploy, ödeme veya mağaza gönderimi yapılmadı. Önceden bulunan kullanıcı değişiklikleri korundu; eklenen dosyalar denetim raporu ve `build/` altındaki doğrulama/kanıt dosyalarıdır.

Kanıt kökü: `build/multi-agent-audit-20261024/`. Yeniden üretme araçları yalnız `demo-lociar` ve loopback emülatör kabul eder. **Tanı aracının başarılı çıkması, ilgili kusurun yeniden üretildiğini gösterir.** Kabul testlerinden ayrı değerlendirilmelidir.

## Git ve GitHub kanıtı

- Yerel dal: `codex/fix-anonymous-location-audit`; yerel HEAD: `60afbca702fbf5f27e1fd47f24db6d42f8337c48`.
- Başlangıçta 68 değiştirilmiş ve 44 untracked dosya/dizin girdisi vardı. Untracked dizinler tek status girdisi olduğundan bu sayı gerçek dosya toplamı değildir. İzlenen diff: 4.751 ekleme, 604 silme. Yerel dalda upstream tanımlı değil.
- [PR #58](https://github.com/CrimsBerith/LociAR/pull/58) açık ve mergeable; güncel uzak baş `5c371185c373d4287e2996a95983aea4f573e1b5`, main `d760dc2709c3ca33634663ffff7c1a459f9154d7`. Bu SHA'lar `git ls-remote` ve GitHub connector ile çapraz doğrulandı.
- [CI çalışması 39695654976](https://github.com/CrimsBerith/LociAR/actions/runs/39695654976) ve Sonar dahil 7/7 kontrol başarılı. Bu sonuç uzak SHA içindir; yereldeki commit ve mevcut uncommitted değişiklikleri doğrulamaz.
- Güncel Sonar çıktısı **9 yeni issue**, 0 hotspot ve yeni kodda 0,0% ölçülen coverage bildiriyor. Annotation'lar ağırlıkla karmaşıklık/stil ve iki regex performans uyarısı. Quality Gate'in geçmesi “0 issue” veya “test yok” sonucuna dönüştürülemez. PR açıklamasındaki eski sıfır-issue/önceki SHA bilgisi güncel analizle aynı değildir.

Kanıt: `github-evidence.json`, `pr-checks.json`, `sonar-details.json`.

## Doğrulanan öncelikli bulgular

### F1 — P1: Profil sayfalama imleci anonim gönderiyi gerçek yazara bağlıyor

Kaynak: `functions/src/publicContent.ts:76`, `:360–367`.

`creator` sorgusu gerçek `creator_id` ile anonim gönderileri de alıyor. 51 kayıt limiti ve `next` imleci anonim gönderiler elenmeden hesaplanıyor. İmleç base64url JSON içinde doğrudan gönderi kimliği ve zamanını taşıyor. Başkasının profil akışında `posts: []` dönerken, imleç o profilin anonim gönderisinin kimliğini açığa çıkarabiliyor.

Gerçek derlenmiş `readPublicContent.run` ve Firestore emülatöründe 51 anonim gönderili yazar oluşturuldu. Dönen imlecin kimliği yazarın 50. anonim gönderisiyle eşleşti. Anonim mute sonrası sızıntı sürdü; profil engeli imleci kaldırdı. Mevcut anonimlik testi yalnız tek gönderili profilde liste gövdesinin boşluğunu kontrol ettiği için sınırı yakalamıyor.

**Düzeltme/kabul:** Başkasının profil akışının öğeleri ve sayfalama metadata'sı yalnız kamuya açık atfedilen içerikten türemeli. Legacy atıf alanları, owner görünürlüğü, devam sayfaları ve blok bağımsızlığı korunmalı. Sadece imleci kodlamak/gizlemek, gizli adayların sayfalama üzerindeki etkisini tek başına çözmez. 0/1/50/51 anonim ve karışık atfedilen içerik senaryoları regresyona eklenmeli.

Kanıt: `privacy-payment-probes.log`; araç `backend/privacy-payment-probes.mjs`.

### F2 — P1: Anonim beğeni etkinliğinin açık hash kimliği kişiyi ele veriyor

Kaynak: `functions/src/triggers.ts:65–66`, `functions/src/anonymousAccess.ts:180–184`, `firestore.rules:62–64`. İlgili diğer yüzeyler: `functions/src/push.ts:121`, `functions/src/activity.ts:25–39`.

Beğeni etkinliği kimliği `SHA256(like_<postId>_<likerLuid>)`. `readActivity` actor alanını boşaltıyor fakat bu deterministik kimliği aynen iletiyor. Giriş yapmış misafir profilleri listeleyebildiği için aday UUID'leri hashleyip beğenen kişiyle eşleştirebiliyor. Ham UUID uzayının kaba kuvvetle aranması gerekmiyor. iOS `SocialActivity.id` de değeri aynen saklıyor.

Gerçek `onLikeCreated.run → readActivity.run` akışında `actor_id: null` olmasına rağmen üç bilinen aday arasından beğenen tek eşleşme olarak bulundu. iOS ajanı kaynak akışını bağımsız doğruladı. Aynı etkinlik kimliği push veri yüküne de yazılıyor; yalnız liste serileştirmesini değiştirmek bütün yüzeyleri kapatmaz. `markActivityRead` üzerindeki var/yok/yabancı-recipient davranışı da düzeltmenin yakın kapsamına alınmalı; bu ek endpoint yolu bu tur ayrı dinamik probla çalıştırılmadı.

**Düzeltme/kabul:** Dışarı çıkan etkinlik referansı, kamuya açık aday bilgilerinden hesaplanamamalı. Sunucu içi idempotency ve unlike/re-like deduplikasyonu korunmalı. Mevcut etkinlikler, cursor, read işaretleme ve push referansları birlikte ele alınmalı; yalnız yeni oluşturulan etkinlikleri değiştirmek eski kayıtları açık bırakır.

Kanıt: `privacy-payment-probes.log`, native kaynak çapraz incelemesi.

### F3 — P1: Beğeni ve özel kaydetme kayıtları varlık farkından tespit edilebiliyor

Kaynak: `firestore.rules:103`, `:118`; deterministik ID sözleşmeleri `:106`, `:121`.

Yabancı kayıt mevcutsa get reddediliyor; aynı yabancı yol mevcut değilse `resource == null` nedeniyle get başarılı olup `exists: false` dönüyor. `likes/<post>_<candidate>` ve `post_saves/<candidate>_<post>` yolları, bilinen gönderi ve listelenebilen profil kimliklerinden üretilebiliyor. Bu fark anonim beğeni ve özel kaydetme ilişkisinin varlığını gösteriyor.

Gerçek Firestore kuralları yüklenerek Firebase istemcisiyle test edildi. Misafir outsider profilleri listeledi. İki koleksiyonda da olmayan yabancı kayıt için `exists: false`, var olan yabancı kayıt için `permission-denied` alındı. Veri alanlarının okunamaması, ilişki varlığını gizlemiyor.

**Düzeltme/kabul:** Olmayan kayıt okuma izni de istemcinin sahip olduğu ID namespace'ine bağlanmalı. Kendi eksik kaydını okuma ve silmenin idempotency davranışı korunmalı. Yabancı var/yok yollarının observable sonucu aynı olmalı; misafir, normal hesap ve engelli hesap senaryoları kapsanmalı.

Kanıt: `private-edge-probe.log`; araç `backend/private-edge-existence-probe.mjs`. Canlı rules kaynak/parity okuması HTTP 403 ile engellendi; doğrulama yerel güncel rules içindir.

### F4 — P1: E-posta kodu oturumu AAL2 olmadan yeni admin rolü davet edebiliyor

Kaynak: `admin/app/api/admin/v1/users/invite/route.ts:16`, `:27–34`; `admin/lib/admin-invite.ts:103–107`; `admin/lib/rbac.ts:32–43`.

Rol değiştirme için gereken `admin_users.write` e-posta kodu oturumundan çıkarılıyor. Buna karşılık `users.invite` kalıyor ve davet endpoint'i `roleKey` varken ek rol yazma/AAL2 kontrolü yapmıyor. Davet kabul edildiğinde rol atanıyor. Böylece hassas rol değişikliği için konmuş authenticator sınırı davet yolundan aşılabiliyor.

Üretim Next build'i, yerel HTTP sunucusu ve Auth/Firestore emülatöründe aynı email-code super_admin oturumu rol revoke işleminde **403**, `trust_safety_admin` davetinde **201** aldı. Doğrulanmış davetli oturum oluşturunca **200** döndü ve aktif rol kaydı oluştu. Test sahte emülatör kimlikleri kullandı; gerçek admin daveti/e-posta gönderilmedi.

**Düzeltme/kabul:** `roleKey` bulunan davet oluşturma aynı AAL2 + `admin_users.write` sınırına tabi olmalı. Normal kullanıcı daveti ayrı izniyle çalışabilmeli. Rol ekleyen diğer davet/accept/onboarding yolları aynı sözleşmeyle incelenmeli. Email-code ret, AAL2 kabul, normal kullanıcı daveti, idempotency ve rol-revoke sonrası davet replay'i test edilmeli.

Kanıt: `admin-invite-aal2-probe.log`; araç `admin/invite-aal2-repro.mjs`.

### F5 — P1: Zincirleme spot katılımı grup geometrisini ve metin erişimini genişletiyor

Kaynak: `functions/src/denseSpots.ts:37–39`, `:157–164`; `functions/src/placeNoteRules.ts:136–158`; `functions/src/publicContent.ts` map-group okuma yolu.

23 Ekim raporundaki A1 bu tur tekrar üretildi. Gruba katılım merkez yerine çemberin kenarından uzaklıkla seçiliyor; kayan merkez ve 40 m'de kesilen yarıçap üyelerin kapsandığını garanti etmiyor. Grup okuma alanı tek tek uzak üyelere metin erişimi sağlayabiliyor.

Gerçek Firestore ve gerçek `syncSpotMembership`/grup okuma kodunda **17 üye, uçlar arasında 153 m, saklanan yarıçap 40 m, okuyucudan en uzak üye 91 m ve 17/17 açık gövde** sonucu alındı. Bu sentetik GPS girdili backend kanıtıdır.

**Düzeltme/kabul:** Sabit/kanonik 25 m üyelik değişmezi, mevcut bozuk spotların bölünmesi ve sürümlü grup/sayfalama/grant uyumu birlikte tasarlanmalı. Yalnız sabit yarıçap değerini küçültmek yeterli değil. 17 not tam korunarak uygun gruplara ayrılmalı; uzak üye grup izniyle açılmamalı. Aynı koordinat, tarih çizgisi, gizleme/silme ve eski cursor senaryoları korunmalı.

Kanıt: `cost-support-diagnostics.log`, `functions/test/diagnostics/cost-second-pass.mjs:165`; önceki ayrıntı `COST_POST_IMPLEMENTATION_DEEP_AUDIT_2026-10-23.md`.

### F6 — P1 yayın engeli: Canlı protokol ve ödeme servisi eksikleri sürüyor

24 Ekim tarihli salt okunur metadata kontrolü 11 bulgu verdi: `map_group_sessions.expires_at` TTL'si ve şu 10 Function eksik: `beginApplePostSupport`, `beginCryptoPostSupport`, `beginExternalPostSupport`, `confirmApplePostSupport`, `readMyPostSupport`, `readMySupportEarnings`, `readSupportCatalog`, `refreshStripePostSupport`, `supportAppleNotifications`, `supportCryptoWebhook`.

Cloud Run'da `supportcheckoutreturn` ve `supportstripewebhook` **Ready=False / HealthCheckContainerError**; ready revision yok. `readPublicContent`, `readNoteDensity` ve admin servisi Ready=True. Functions ACTIVE metadata'sı ile Cloud Run readiness ayrı kontrol edildi. Başlangıç hataları için sınırlı logging sorgusu sıfır error kaydı döndürdü; kök neden belirlenmiş sayılmıyor.

Canlı maskeli ayarlarda `post_support.enabled=false`, `environment=sandbox`, `apple_enabled=false`, `crypto_enabled=false`, `external_ios_us_enabled=false`; `stripe_enabled=true` olsa da global kapalı. 26/26 bileşik indeks READY; yerel yeni `notification_eligible_at` indeksi listede yok. `system/place_notes` 404; yeni approval-index modunun canlıda açık olduğuna kanıt yok. Geo sorgu bayrağı `geohash_index_version=1`.

**Düzeltme/kabul:** Kod kusurlarından sonra eşleşen Functions/rules/index/TTL ve admin/iOS sürümü birlikte doğrulanmalı. Sağlıksız servislerin gerçek startup nedeni çözülmeli. Gerçek sandbox create/async completion/duplicate webhook/refund/payout doğrulanmadan ödeme anahtarı açılmamalı.

Kanıt: `build/firebase-readiness/multi-agent-audit-20261024.json`, `cloudrun-metadata.json`, `firestore-indexes.json`, `live-feature-flags.json`.

### F7 — P2: Güncel bağımlılık güvenlik kapıları geçmiyor

`npm audit` tam ağaç: Functions **5** bulgu (2 high, 3 moderate), admin **1 critical**. Production-only: Functions `body-parser` high + `fast-uri` moderate; admin `next` critical. İki scope'taki 13'er doğrudan bağımlılığın kurulu sürümleri lockfile sürümleriyle eşleşiyor.

Admin Next 16.3.8 etkilenen aralıkta. Bunun mevcut kurulumda kanıtlanmış uzaktan kod yürütme olduğu iddia edilmiyor: üretim build'inde Cache Components kapalı, `use cache` fonksiyonu yok; Server Actions manifest'i boş; sharp 0.35.5, SVG advisory'sinin workaround koşulunu sağlıyor. Maintainer yine güncelleme öneriyor ve repo dependency gate'i herhangi bir bulguda kapanıyor. Önceki SHA'daki yeşil CI, sonradan yayımlanan registry advisories'inin bugünkü sonucunu geçersiz kılamaz.

Birincil kaynaklar: [Image Optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [use cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r). Kanıt: `functions-audit*.json`, `admin-audit*.json`, `direct-dependency-lock-parity.json`, `admin/advisory-reachability.json`.

**Düzeltme/kabul:** Etkilenen ağaçlar uyumlu yamalara taşınmalı; locked kurulum, production/full audit ve etkilenen backend/admin kabul testleri tekrar geçmeli. Otomatik major upgrade veya kör `audit fix --force` yapılmadı.

### F8 — P2: Canlı gizlilik metni güncel konum notu erişimini yanlış anlatıyor

Kaynak: `admin/app/privacy/page.tsx:141–143`, `admin/app/privacy/en/page.tsx:134–136`; karşılaştırma `functions/src/denseSpots.ts:157–164` ve geçerli ürün sözleşmesi.

TR/EN metinleri yalnız 30'dan fazla notlu yoğun noktanın uzaktan kilitli olduğunu ve konumun bir kez kontrolüyle 30 dakika açık kaldığını söylüyor. Güncel sözleşme başkasının tekil notunu da uzaktan redakte ediyor; grup metnini okumak için güncel yerinde fix gerekiyor. Aynı eski açıklama canlı `/privacy` ve `/privacy/en` HTML'inde de bulundu; bu yalnız yerel taslak sapması değil.

**Düzeltme/kabul:** Sayı eşiği yalnız yoğunluk bildirimiyle ilişkilendirilmeli; note-body erişimi, tazelik ve yorum/support grant farkı doğru anlatılmalı. TR/EN sayfalar ile review/store açıklamaları aynı sürümde gözden geçirilmeli.

Kanıt: `live-privacy-copy.json`, `public-http.json`.

## Yeniden doğrulanan bilinen sınırlamalar ve maliyet işleri

- Stripe intent commit'inden sonra süreç sağlayıcıya ulaşmadan ölürse, 32 dakikalık quote'un ilk 2 dakikası geçince otomatik create tekrarı güvenlik nedeniyle duruyor. URL/session yokken refresh `awaiting_payment` döndürüyor; süre dolduktan sonra da aynı kilit korunuyor. Bu davranış `POST_SUPPORT.md:101` içinde manuel reconciliation gereği olarak zaten belgeli. Bu tur yeniden üretildi; uygulanan bir admin reconciliation akışı veya uçtan uca sağlayıcı onarımı doğrulanmadı. Yeni para kaybı/çift tahsilat iddiası olarak sunulmuyor.
- GIPHY API proxy'si, ID'den media URL üretimi ve byte cache düzeni için özel sağlayıcı izni kanıtı repoda bulunmadı. [GIPHY'nin güncel resmi belgesi](https://developers.giphy.com/docs/api/#best-practices) standart entegrasyonda proxy/URL değişikliği ve izinsiz medya cache'ini kısıtlıyor. Özel izin veya uyumlu mimari ürün kararı gerekiyor; bu bulgu anahtarı uygulamaya taşımaya yetki vermiyor. Sağlayıcı hesabında istisna olup olmadığı okunmadı.
- Güncel Swift gövdeleriyle iki sentetik tanı tekrarlandı: aynı bağlamdaki 6 bölge refresh'i 6 işlem turu ve yalnız 1 uygulama; aynı GIF için 8 eşzamanlı tüketici 8 sentetik indirme. Gerçek GIPHY/ağ kullanılmadı. `native-cost-diagnostics.log` kaynak SHA'larını içeriyor.
- Ek Firestore tanıları eşik 3/300 olgun beğenide 602 mantıksal belge okuması, ilgisiz blok geçmişi taraması, grup devam sayfasında tüm üye taraması ve hard-delete boş sorgu giderini tekrar gösterdi. Bunlar fatura veya canlı trafik ölçümü değildir. Önceki rapordaki kalan maliyet işlerinin çözülmüş sayılmaması gerekir.
- Admin email sender yapılandırmasında `onboarding@resend.dev` mevcut; çok-admin canlı e-posta teslimi ve doğrulanmış özel sender durumu bu tur test edilmedi. Proje bunu `docs/ADMIN_EMAIL_CODE.md` içinde zaten rollout koşulu olarak kaydediyor.

## Bu tur tamamlanan kontroller

| Katman | Güncel sonuç | Kanıt |
|---|---|---|
| Repo script regresyonları | 56/56 | `scripts-regression.log` |
| Secret scan | Geçti; tracked ve non-ignored dosyalar | `secret-scan.log` |
| Localization/catalog | 700 release anahtarı, 12 dil, needs-review 0; generator check geçti | `localization.log`, `catalog-check.log` |
| Compiler strings | 251 dosyadan 663 extracted key katalogda | `ios/compiler-strings.log` |
| Seed generator/store metadata/Python yardımcı testleri | Üç seed check, 12 dil store copy ve 9 Python test geçti | `artifact-check-results.json` |
| Functions typecheck/unit | Geçti; 168/168 unit | `functions-types.log`, `functions-unit.log` |
| Rules | 89/89 | `rules.log` |
| Functions gerçek callable/emülatör entegrasyonu | 167/167 | `functions-integration.log` |
| Konum notları temiz ayrı emülatör | 29/29 | `notes-isolated.log` |
| Ek maliyet/ledger + tanı çalıştırması | 38/38; 8 senaryo bilinen kusurları yeniden üreten baseline tanısı | `cost-support-diagnostics.log` |
| Özel güvenlik/ödeme prob araçları | 3 araç exit 0; yukarıdaki kusurları doğruluyor | `supplemental-results.json`, ilgili probe logları |
| Admin typecheck/unit/production build | Geçti; 41/41 unit | `admin/typecheck.log`, `admin/unit.log`, `admin/build.log` |
| Admin HTTP/auth/RBAC/browser entegrasyonu | 123/123 | `admin-integration.log` |
| Public desktop/mobile Chromium | 26/26 | `admin/playwright-public.log` |
| Native XCTest | 234 passed, 2 physical-only skipped, 0 failure | `ios/unit-tests.xcresult`, `ios/unit-tests-summary.json` |
| Native seçili UI | 11/11; EN/AR, consent, accessibility, map, support recovery/error/repeat | `ios/ui-smoke.xcresult`, `ios/ui-smoke-summary.json` |
| arm64 Release simulator build | Geçti; seçilen üç DEBUG fixture marker binary'de yok | `ios/release-build.log`, `ios/release-fixture-check.json` |
| Bağımlılık güvenlik kapıları | Functions/admin başarısız | `*-audit*.json` |
| Canlı Firebase metadata gate | Başarısız, 11 bulgu | `build/firebase-readiness/multi-agent-audit-20261024.json` |

Yerel kontroller Node 22.23.3 ve Java 21.0.12.1 ile çalıştırıldı. Mac'in varsayılan Homebrew Node 26 komutu eksik `libsimdjson.33.dylib` yüzünden açılmıyor; varsayılan `java` da runtime bulamıyor. Testler mevcut ayrı kurulumların PATH/JAVA_HOME seçimiyle tamamlandı. Sistem kurulumu değiştirilmedi.

Tam `release-preflight` bir bütün olarak yeniden çalıştırılmadı: paket kurulumları tekrarlanmadı; ilgili kontrol komutları bağımsız ve emülatörler çakışmayacak sırayla çalıştırıldı. Dependency ve canlı metadata kapıları zaten başarısız. Yeni `test:cost`/`test:support` script'leri mevcut CI/preflight adımlarında çağrılmıyor; bu tur ek olarak çalıştırıldı. Kusuru yeniden üreten diagnostic assert'ler, düzeltmeden sonra sağlıklı davranışı doğrulayan regresyonlara çevrilmeli.

## Canlı ve fiziksel kanıt sınırları

- Canlı admin `/privacy`, `/privacy/en`, `/terms`, `/support`, `/admin/login` HTTP 200. Login no-store; sayfanın 200 dönmesi admin mail/auth iş akışının uçtan uca çalıştığı kanıtı değil.
- Canlı Firestore rules kaynağına erişim HTTP 403; yerel ve canlı rules eşliği doğrulanamadı. İlgili yerel mahremiyet kusurlarının canlıda sömürüldüğü veya canlı kaynağın birebir aynı olduğu iddia edilmiyor. Metadata/indeks/servis sorguları başarılıydı.
- Simulator: Xcode 26.6, iOS 26.5, ayrı `LociAR Multi Agent Audit 20261024` iPhone 17 Pro. Native seçili UI testleri DEBUG fixture kullanıyor; bu tur gerçek iOS SDK + demo Firebase UI paketi tekrar çalıştırılmadı. Backend'in gerçek callable emülatör testleri ayrı tamamlandı.
- Eşlenmiş fiziksel iPhone offline. Gerçek GPS/AR kamera, Cloud Anchor/VPS yeniden bulma, arka plan/force-quit davranışı, Apple Translation model indirme ve gerçek APNs receipt/tap bu tur doğrulanamadı.
- Gerçek Stripe/NOWPayments/App Store sandbox charge, refund, webhook delivery veya yazar payout yapılmadı. Güncel kapalı/sandbox ayarları canlı ödeme hazırlığı sağlamıyor.
- TestFlight/App Store Connect build/review/submission durumu bu tur sorgulanmadı; local store copy validator mağaza dağıtım kanıtı değildir. Seed import expected/created sayıları ve saha Cloud Anchor çalışması da doğrulanmadı.
- İlgili hidden/ignored config yolları yalnız ad/boyut/git-ignore durumu ile envantere alındı (`config-file-inventory.json`); secret değerleri açığa çıkarılmadı. Secret scan'in başarı kapsamı ignored secret dosyalarının tamamını kapsamaz.

## Uygulama sırası

1. F1/F2/F3 anonimlik ve özel ilişki sızıntılarını; F4 rol-davet AAL2 sınırını düzelt. Her düzeltmede mevcut probun beklenen sonucu tersine dönmeli ve yakın yüzeylerin regresyonu korunmalı.
2. F5 kanonik geometri, eski veri geçişi ve grup/grant/sayfalama tutarlılığını tamamla.
3. Bağımlılık kapılarını, gizlilik açıklamasını ve GIPHY izin/mimari kararını kapat. Gerekli otomatik kabul testlerini CI/preflight kapsamına ekle.
4. Eşleşen sürümleri ve eksik indeks/TTL'yi dağıt; sağlıksız ödeme servislerinin startup nedenini çöz ve canlı protokol smoke testi yap.
5. Fiziksel cihaz, gerçek sandbox ödeme/refund/payout, seed import/saha ve mağaza dağıtım kanıtlarını ayrı tamamla.

Yayın kararı, doğrulanan kusurların kapanmasına ve ilgili canlı/fiziksel kabul kanıtlarının tamamlanmasına bağlıdır.
