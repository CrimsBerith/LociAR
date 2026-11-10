# LociAR altı uzmanlı denetim — 24 Ekim 2026

**Karar: İncelenen çalışma ağacı yayın için hazır kabul edilemez.** Yerel kabul paketleri geçerken özel karşı örnekler anonimlik, yetki ve grup erişimi kusurlarını yeniden üretti. Canlı ödeme servisleri ve dağıtım eşliği de eksik. Bu çalışma denetimdir; uygulama kaynakları düzeltilmedi, canlı dağıtım veya mağaza gönderimi yapılmadı.

## Kapsam, ekip ve başlangıç

Altı uzman iş paketi yürütüldü: gizlilik/Firebase; native iOS/harita/AR; admin/ödeme/bağımlılıklar; performans/maliyet; güvenilirlik/kurtarma; bağımsız QA/ürün kabulü. Ana ajan sürüm envanterini, seri emülatör testlerini, canlı metadata/GitHub kontrollerini ve sentezi yönetti. Aynı anda ana ajan ve en fazla üç uzman çalıştı. Kritik sonuçlar kaynak akışı, gerçek yerel handler/rules deneyleri veya ayrı karşı incelemeyle çapraz kontrol edildi.

Uzman raporları: [Gizlilik](../../build/six-specialist-audit-20261024/privacy/evidence-report.md), [Native](../../build/six-specialist-audit-20261024/native/native-report.md), [Admin/ödeme](../../build/six-specialist-audit-20261024/admin-payments/REPORT.md), [Performans](../../build/six-specialist-audit-20261024/performance/report.md), [Kurtarma](../../build/six-specialist-audit-20261024/reliability/REPORT.md), [Bağımsız QA](../../build/six-specialist-audit-20261024/qa/REPORT.md).

- Dal: codex/fix-anonymous-location-audit; HEAD: 60afbca702fbf5f27e1fd47f24db6d42f8337c48.
- GitHub compare, uzak dalın bu yerel HEAD’den 5 commit ileride olduğunu doğruladı; 40 dosyada uzak commit değişikliği var. Yerel dalda upstream yok. Merge/fetch/switch yapılmadı; çalışma ağacı sabit tutuldu. Uzak-only bakım/zamanlama/harita kaynaklarından seçili dosyalar ayrı salt okunur snapshot olarak incelendi; uzak sürüm bu çalışma ağacında build/test edilmiş sayılmaz.
- Başlangıç: 68 değiştirilmiş izlenen dosya, 108 izlenmeyen gerçek dosya. Eski rapordaki untracked dizin-girdisi sayısıyla aynı ölçü değildir.
- Kanıt kökü: build/six-specialist-audit-20261024/. baseline.json başlangıç durumunu ve mevcut değiştirilmiş dosyaların hashlerini içerir.
- Global ve root AGENTS.md, RTK.md ve admin/AGENTS.md okundu. Yerel/ignored yapılandırmalar isim, boyut ve izin metadata'sıyla envanterlendi; secret değerleri raporlanmadı. Secret scan ignored dosyaların bütününü kapsamaz.
- Önceki 24 Ekim raporu başlangıç hipoteziydi. Yedi seçili kaynak hash'i eşleşti; bu sınırlı eşlik eski bütün test sonuçlarını güncel kanıt yapmaz. Yeni sonuçlar aşağıda ayrıdır.
- Tüm dinamik güvenlik yazmaları disposable demo-lociar ve loopback emülatörlerde sentetik verilerle yapıldı. Doğrudan .run çağrıları gerçek derlenmiş handler'ı sınar; HTTP gateway, gerçek Firebase Auth veya App Check doğrulamasını tek başına kanıtlamaz.

## Öncelikli bulgular

### S1 — P1: Profil sayfalaması anonim postu gerçek yazara bağlayabiliyor

Kaynak: functions/src/publicContent.ts:76,357–367. Creator sorgusunun devam imleci anonim kayıtlar elenmeden hesaplanıyor. Bir yazara ait 51 anonim postla dönen gövde boşken cursor, 50. anonim postun ID'sini gerçek profil altında açığa çıkardı. Anonim mute imleci değiştirmedi; profil engeli kaldırdı.

Kanıt: privacy/probes.log; bağımsız kaynak karşı incelemesi qa/REPORT.md. Bu, yalnız maskelenmiş UI değerlendirmesi değildir. Kabul: başkasının profilinin bütün pagination metadata'sı yalnız gösterilmesine izin verilen atfedilen içerikten türemeli; 0/1/50/51, karma içerik, sonraki sayfa ve owner görünürlüğü sınanmalı.

### S2 — P1: Anonim beğeni etkinliği hesaplanabilir; mark-read başka alıcının ilişkisinin varlığını da sızdırıyor

Kaynak: functions/src/triggers.ts:65–66; anonymousAccess.ts:180–184; push.ts:114–122; activity.ts:18–32.

Actor alanı null olsa da SHA256(like_postId_likerLuid) biçimindeki dış ID, bilinen üç adaydan beğeneni tek eşleşmeyle buldurdu. İlgisiz üçüncü kişi markActivityRead üzerinde olmayan ID için boş başarı, mevcut yabancı ID için permission-denied aldı. İkinci yol alıcının activity listesini okumayı gerektirmiyor; aynı tahmin edilebilir ID sözleşmesini farklı endpoint üzerinden kullanıyor.

Kanıt: privacy/probes.log ve bağımsız QA. Push'un aynı ID'yi taşıdığı kaynakta doğrulandı; gerçek APNs payload teslimi bu tur gözlenmedi. Kabul: dış referanslar bilinen adaylardan hesaplanamamalı; eski kayıtlar, cursor, push ve mark-read birlikte ele alınmalı. Sunucu içi deduplikasyon korunmalı; yabancı var/yok cevapları eşdeğer olmalı.

### S3 — P1: Like/save/follow/block ilişkisinin varlığı rules cevabından çıkarılabiliyor

Kaynak: firestore.rules:103,118,134,151. Yabancı mevcut belge reddedilirken aynı yabancı namespace'te eksik belge resource == null nedeniyle okunabiliyor. Misafir outsider, kamuya açık profil adaylarından deterministik yolları üreterek dört koleksiyonda exists:false ile permission-denied farkını gözledi.

Kanıt: privacy/private-edges.log; repository rules gerçekten emülatöre yüklendi. Alanları okuyamamak ilişkiyi gizlemiyor. collection_items benzer desen taşır; collection UUID keşfedilebilirliği gösterilmediğinden ayrı doğrulanmış sömürü sayılmadı. Kabul: eksik kayıt izni de istemcinin kendi namespace'iyle sınırlanmalı; kendi eksik kaydını okuma ve idempotent silme korunmalı.

### S4 — P1: Rol daveti email-code super_admin oturumunun AAL2 sınırını aşıyor

Kaynak: admin/app/api/admin/v1/users/invite/route.ts:16,27–34; admin/lib/rbac.ts:32–43; admin/lib/admin-invite.ts:103–107; admin/app/api/auth/session/route.ts:43.

Aynı email-code super_admin oturumu doğrudan rol revoke için 403, trust_safety_admin daveti için 201 aldı. Davetli kabulünde 200 ve aktif rol kaydı oluştu. Bu, sıradan support_agent'ın super_admin olması iddiası değildir; hassas rol yazma için zorunlu authenticator sınırının alternatif yazma yoludur.

Kanıt: admin-invite.log, admin-payments/REPORT.md, QA. Ek varyantta davet edenin rolü ilk kabulden önce kaldırıldığında bekleyen davet yine rol verdi (admin-revoked-invite.log). Davetin kalıcı yetki devri politikası netleşmediğinden bu varyant ayrı kesin kusur sayılmadı; incident-response kabul sınırıdır. Gerçek e-posta gönderilmedi.

Kabul: roleKey içeren davetlerde AAL2 ve admin_users.write denetlenmeli; normal kullanıcı daveti ayrı izniyle korunmalı. Accept/onboarding/replay yolları aynı yetki sözleşmesini uygulamalı.

### S5 — P1: Zincirleme üyelik 25 m grup sözleşmesini ve yerinde metin erişimini genişletiyor

Kaynak: functions/src/denseSpots.ts:37–39,157–164; placeNoteRules.ts:136–158; publicContent.ts:mapGroupDocuments/readMapGroup.

Gerçek Firestore ve derlenmiş handler deneyinde 17 post aynı grupta kaldı: uçlar 153 m, kaydedilen yarıçap 40 m, okuyucuya en uzak üye 91 m; 17 metnin tamamı açıldı. Yarıçapın kesilmesi üyelerin gerçekten kapsandığını garantilemiyor. QA'nın farklı pure-source veri kümesi de 17 üyede 66,94 m uzaklık üretti; aynı noktalar spot kimliği yokken dört gruba ayrıldı. Aynı koordinattaki 10 post ve tarih çizgisi karşı örnekleri geçti.

Kanıt: cost-diagnostics.log/cost-diagnostic-measures.json; qa/pure-crosscheck.json. Tekil okumanın eski spot çemberiyle açılmasını önleyen kontrol mevcut; kalan kusur grup readArea geometrisindedir. Bu sentetik fix'li backend kanıtıdır; GPS attestation veya sahadaki fiziksel deney değildir.

Kabul: kanonik 25 m üyelik değişmezi, eski bozuk grupların kayıpsız bölünmesi ve sürümlü group/cursor/grant uyumu birlikte çözülmeli. Yalnız yarıçap sabitini küçültmek yeterli değildir.

### S6 — P1 yayın engeli: Canlı protokol/ödeme dağıtımı tamamlanmamış

Yeni metadata raporu 11 bulgu verdi: 10 beklenen ödeme Function'ı eksik, map_group_sessions.expires_at TTL yok. Cloud Run supportcheckoutreturn ve supportstripewebhook Ready=False/HealthCheckContainerError. Sınırlı startup log taraması kesin uygulama nedenini saptamadı; sağlık hata mesajı kök neden olarak sunulmuyor. Ek per-service describe denemeleri exit 1 ile tamamlandığından doğrudan HTTP endpoint sağlığı gözlenemedi (payment-service-http.json); Ready durumu başarılı service-list metadata okumasından geliyor.

Canlı ödeme yapılandırması: enabled=false, apple_enabled=false, external_ios_us_enabled=false, crypto_enabled=false, stripe_enabled=true, environment=sandbox. Stripe alt bayrağı üst kapalı bayrağı geçersiz kılmaz. Yazar payout kaynakta kapalı (payoutsAvailable:false).

Yerel 27 composite indeksin canlı 26 karşılığı var; eksik likes(post_id, notification_eligible_at) indeksi yeni onay optimizasyonuna ait. system/place_notes 404 olduğundan indexedLikes sürüm bayrağı etkin değil; bu eksiklik mevcut canlı sorgunun hata verdiği kanıtı değildir, rollout bağımlılığıdır. Canlı geohash_index_version=1.

Kanıt: build/firebase-readiness/six-specialist-20261024.json; cloudrun-metadata.json; live-selected-config.json; index-parity.json. Canlı rules kaynağı HTTP 403: yerel/canlı rules eşliği doğrulanamadı. Bu nedenle yerel mahremiyet kusurlarının canlıda mevcut olduğu veya sömürüldüğü iddia edilmiyor.

### S7 — P2: Bağımlılık güvenlik kapıları geçmiyor

Güncel npm audit: admin full/prod 1 critical; Functions full 3 high + 2 moderate, production 1 high + 1 moderate. Eski raporun dağılımı güncel sayılmadı.

Admin Next advisory koşulları ayrıca incelendi: sharp 0.35.5 workaround sürümünde; Cache Components kapalı; Server Actions node/edge manifestleri boş. Critical etiketi mevcut kurulumda kanıtlanmış RCE anlamına çevrilmedi. Uyumlu yama ve locked kurulum/test/audit gereklidir; audit fix --force uygulanmadı.

Kanıt: admin-payments/*audit.json, REPORT.md. Birincil kaynaklar: [Next image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Cache Components advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).

### S8 — P2: Canlı gizlilik açıklaması güncel okuma sözleşmesine uymuyor

Kaynak: admin/app/privacy/page.tsx:141–143 ve privacy/en/page.tsx:134–136. TR/EN sayfalar yalnız 30'dan fazla notta metin kilidi ve tek kontrol sonrası 30 dakika açık kalma anlatıyor. Güncel sözleşme başkasının tekil notunu da uzaktan redakte ediyor, grup metni için taze yerinde fix istiyor. Yeni HTTP okumalarında aynı metin bulundu.

Kanıt: public-http-current.json. Kabul: sayı eşiği yoğunluk bildirimiyle; metin, yorum ve support grant süreleri kendi gerçek erişim kurallarıyla açıklanmalı. Store/review metinleri aynı ürün sözleşmesine bağlanmalı.

### S9 — P2: AR açılışı stale/coarse konumu ve bekleme sırasında uzaklaşmayı yeniden doğrulamıyor

Kaynak: LociAR/Domain/ProximityPolicy.swift:30–46; Features/AR/ARPostViewerView.swift:288–313; AppCore/LocationController.swift:105–111,21–24. İlk intake stale ve simulated fix'i reddediyor; buna karşılık 3 km accuracy kabul ediliyor. Saklanan fix yaşlanabiliyor; bir kez verilen proximityVerified kararı resolver dönüşünde yeni konumla geri alınmıyor.

Gerçek Swift metotlarından çıkarılan CoreLocation probe'unda bir saat eski yakın fix ve 3 km accuracy allowed=true; taze uzak konum false. Negatif accuracy intake'te reddedildiğinden production bypass sayılmadı. QA ikinci kontrol bulamadı.

Kanıt: native/ar-proximity-probe.swift ve logu; native/native-report.md. Bu AR konum doğruluğu bulgusudur; backend kilitli not metninin aşıldığı veya fiziksel sömürü kanıtı değildir. Kabul: karar ve her async render dönüşünde tazelik, doğruluk ve mesafe; konum/izin kaybında içerik geri alınmalı.

### S10 — P2: Kamerasız notta belirsiz commit sonucu composer yeniden açılınca ikinci post oluşabiliyor

Kaynak: LociAR/Features/Map/PlaceNoteComposer.swift:154–155,192,361–370; functions/src/placeNotes.ts:43–62; posts.ts:69–79. Mutation UUID yalnız composer @State içinde. Commit sonrası yanıt kaybolursa hata gösteriliyor; yeniden açılış/re-entry yeni UUID kullanıyor.

Gerçek createPlaceNote.run ile aynı UUID replay'i aynı postu verdi; aynı metin/koordinata yeni UUID iki ayrı post oluşturdu. Gerçek rate/density kapıları bunu durdurmadı. Kaynak yaşam döngüsü ile bu backend sonucu birlikte kurtarma boşluğunu gösterir; fiziksel UI timeout/reopen uçtan uca deneyi yapılmadı.

Kanıt: reliability/note-direct.log ve REPORT.md. Kabul: kullanıcıya bağlı metinsiz pending UUID/receipt metadata'sı ile belirsiz sonuç uzlaştırılmalı. Bilerek yeni not oluşturma korunmalı; yeni yayın taze GPS istemeli. Not/çeviri metnini diske yazmak çözüm olarak önerilmedi.

### S11 — P2: Geciken yorum trigger'ı tek kullanıcı adı değişikliğini geri ezebiliyor

Kaynak: functions/src/triggers.ts:14–19,113–117,195–209,263–266. Comment handler H1'i transaction dışında okuyor; profil rename fanout'ı H2'yi yazdıktan sonra eski handler H1'i tekrar yazabiliyor.

Gerçek exported onCommentCreated/onProfileUpdated ve Firestore emülatöründe ilk transaction kontrollü bekletildi: profile=new_handle, comment=old_handle. Bir rename yeterli; 30 gün handle cooldown karşı örneği bunu engellemiyor. QA, normal iOS yorumunda username alanının yazılmadığını ve persisted username'in SocialRepository.swift:418 üzerinden PostPreviewView.swift:209/211 avatar/etiketine gittiğini bağımsız doğruladı. Admin delegated yorumun başlangıç alanları farklı olabilir.

Kanıt: reliability/comment-direct.log, comment-handle-race-result.json, qa/REPORT.md. Bu metadata/atıf tutarsızlığıdır; anonim yazar sızıntısı olarak sayılmadı. Kabul: transaction güncel profili/sürümü doğrulamalı; ters sıra, redelivery ve deletion fence testleri eklenmeli.

### S12 — P2: Tekrarlanan iş ve büyüyen sorgular için ölçülmüş maliyet riskleri

- Gerçek Swift gövdelerinden sentetik ağ harness'ı: aynı GIF'te 1/4/8 tüketici 1/4/8 indirme. Seri sonraki cache hit 0 ek indirme; tamamlanmış cache çalışıyor, in-flight paylaşımı yok.
- Aynı harita ihtiyacında 1/3/6 refresh 1/3/6 işlem turu, her ölçekte 1 uygulanmış sonuç. Arrival iş paylaşımı mevcut; refresh revision davranışı ayrıca incelendi.
- 300 üyeli grubun ilk 15 ve sonraki 50 postluk sayfaları toplam 600 post satırı okuyor.
- 400 blok geçmişi ilgisiz own_saved/hatta invalid mode çağrısında da taranıyor.
- Threshold 3 / 300 olgun liker senaryosu 402 point read + 200 query row üretiyor. Bunlar 602 mantıksal belge erişimidir; gerçek fatura kalemleri ölçülmedi.
- 10 post silmede 171 query call; 169 boş sorgu. Optimizasyon deletion/grant temizliğini korumalı.
- Bildirim kapalı 10 cihazda activity/approval denial yolu sırasıyla 31/61 point read yapıyor; gerçek push gönderilmedi.

Kanıt: performance/report.md, native-diagnostics.log, cost-diagnostic-measures.json. Bunlar canlı trafik, fiziksel cihaz p95'i veya parasal fatura değildir. Önce doğruluk/gizlilik değişmezleri, sonra ölçüm bütçesi ve hedefli iyileştirme gerekir.

### S13 — P2 test altyapısı: XXXL kaydırma varsayımı ve guest notification fixture güncel sözleşmeyle uyuşmuyor

Mevcut testProfileSupportsAccessibilityXXXL, büyük metin/lazy list altında görünür alana kaydırmadan Kaydedilenler ve yeterli kaydırma yapmadan alt ayarlar/silme uyarısını arıyor. Seçili UI turu 10 başarılı/1 başarısız; izole aynı test 0/1. Hierarchy ve xxxl-17s.png, Kaydedilenler hücresinin sonraki kaydırmada tam olarak bulunduğunu gösteriyor. Ürün öğelerinin erişilemezliği kanıtlanmadı; başarısız test kapısı yine açıktır.

scripts/simulator-note-fixture.mjs:152 bildirim fixture'ında newAnonymousUser ile createPlaceNote çağırıyor. Güncel verified publishing kontrolü doğru biçimde reddediyor; fixture HTTP 500 ile gerçek notification kabul aşamasına ulaşamıyor. Bu, ürünün verified-identity kontrolünün hatası değildir. Fixture doğrulanmış sentetik hesap kullanmalı.

İlk gerçek SDK seçkisinin ham sonucu 3 başarılı/5 başarısız. Yeni simülatörün OS klavye tanıtımı yayınlamayı engelledi; no-fix testi önceki yayın sayısına bağlıydı. Ayrıca denetim seçkisi notification-consent ve delete için gerekli ek post adımlarını atlamıştı; bu iki driver önkoşulu hatası uygulama kusuru sayılmadı. Bağımlı sıralı, artifact-only fixture uyarlamalı tekrar 9 senaryoda 8 başarılı/1 başarısız tamamlandı. Başarısız 06 testinde simülatör bildirimi göründü, tap Post sayfasına ulaştı ve fixture deliveries=1/state=queued doğrulandı; yalnız doğrudan body assertion'ı başarısız. MainTabView (LociAR/Features/Main/MainTabView.swift:85–94) publicPost(mode=post) okuyor; functions/src/publicContent.ts:125–130 tekil notu konumsuz rows ile güvenli kilitli gösteriyor, fresh on-site map-group çağrısı yapılmıyor. Ekran Kilitli not / haritada aç yönlendirmesinde. Bu, mevcut map üzerinden okuma sözleşmesi ile eski direct-body test beklentisi arasındaki kabul uyuşmazlığıdır; testi yeşile çevirmek için metin kilidi gevşetilmedi.

Adapted 02/02b/02c gerçek SDK ile kamerasız yayın, no-fix reddi/fresh retry, filtreli metin reddi/düzeltilmiş retry; 04 rıza; 05 logout/login; 07c yabancı recipient; 09 üç gerçek notla Auth/Firestore/Storage silme geçti. Önceki ham turda map-group yerinde fix/ranking de geçti. Original ve adapted uygulama executable/Info.plist SHA256 aynı (native/sdk-artifact-comparison.json); uygulama veya assertion değiştirilmedi. Artifact fixture'ın tek davranış farkı arrival yazarı için doğrulanmış sentetik newUser kullanımıdır. Bu uyarlanmış başarı, mevcut repository fixture'ının olduğu hâliyle geçtiği anlamına gelmez. Simülatör bildirimi gerçek APNs değildir. Mevcut repo fixture'ının özgün başarısız sonucu silinmedi.

## Uzak sürüme özgü hedefli ek inceleme

Kesin uzak SHA 5c371185 snapshotları remote/manifest.json içinde. S1 creator cursor kusuru uzak publicContent.ts:398–408 içinde de kaynakta sürüyor. S5 için uzak denseSpots yerel kaynakla son boş satır dışında aynı; publicContent grubun readArea bilgisini policy'ye aktarmayı sürdürüyor. Yerel dinamik 17-not ölçüleri uzak SHA üzerinde çalıştırılmış sayılmadı. Uzak RBAC yalnız maintenance izni ekliyor; compare çıktısında invite/accept dosyaları değişmiyor, AAL2 sınırına düzeltme bu commitlerde yok.

Yeni map_cells yolunda metinler canlı post/account/block ve denseLocks kapısından geçiyor. Özet author görünürlüğü 60 saniye cache'leniyor; bu kaynakta görülen tazelik sınırıdır, metin sızıntısı olarak doğrulanmadı.

**R1 — P2, uzak maintenance lease/fencing riski:** functions/src/maintenance.ts:59–85 ilk worker'ın lease süresini aşmasında yeni claim'e izin veriyor; ilk worker tamamlanınca ownership token denetlemeden running_until alanını siliyor. Root bağımsız olarak gerçek uzak runMaintenanceTask fonksiyonunu transpile edip sistem/ağ erişimsiz VM'de sahte Firestore ve ilerletilen saatle sınadı: ikinci worker başladı; ilk worker'ın tamamlanması ikinci lease'i kaldırdı (remote/lease-probe-result.json). Bu bir koşullu concurrency mekanizması kanıtıdır; gerçek görevlerin lease süresini aşması veya üretim çakışması ölçülmedi. Fencing/heartbeat/deadline ve iki worker interleaving kabul testi gerekir.

Manual request running olduktan sonra crash olursa retry:false ve running redelivery no-op davranışında açık recovery görülmedi; bu ikinci konu statik risk olarak kaldı. Yeni admin maintenance endpoint'lerinde origin, RBAC, rate, reason ve idempotency kontrolleri var; ürün sözleşmesi maintenance için ayrıca AAL2 zorunlu tutmadığından bu bir step-up bypass diye sayılmadı. Ayrıntı admin-payments/remote-review.md ve privacy/remote-review.md. Tam uzak kaynak bu çalışma ağacında build/emülatör/cihaz testinden geçirilmedi.

## Geçen kontroller ve kanıt sınırları

| Katman | Bu tur sonuç | Kanıt |
|---|---|---|
| Repository script | 56/56 | scripts.log |
| Secret scan / localization / generator | Geçti; 700 release key, 12 dil | secrets.log, localization.log, catalog.log |
| Store metadata / üç seed generator / Python yardımcı testleri | Geçti | artifact-results.json |
| Functions types/unit | Geçti; 168/168 | functions-types.log, functions-unit.log |
| Rules | 89/89 | rules.log |
| Functions entegrasyon | 167/167 | functions-integration.log |
| Temiz ayrı konum notları | 29/29 | notes-isolated.log |
| Cost/support kabul paketleri | 13/13 ve 17/17 | cost.log, support.log |
| Admin types/unit/production build | Geçti; 41/41 | admin-payments/ |
| Admin HTTP/auth/browser | 123/123 | admin-integration.log |
| Public desktop/mobile Chromium | 26/26 | public-browser.log |
| Native XCTest | 234 passed, 2 physical-only skipped, 0 failure | native/unit-tests-summary.json |
| Özel kusur tanıları | 10/10 baseline + privacy/admin/recovery probes yeniden üretti | cost-diagnostics.log, extra-results.json |
| Native seçili fixture UI | 10 başarılı / 1 XXXL failure; izole XXXL 0/1; yetersiz kaydırma kanıtı | native/ui-smoke-summary.json |
| Release simulator build | Geçti; arm64+x86_64; seçili üç DEBUG fixture marker yok | native/release-build.log |
| Gerçek Firebase SDK UI | Ham 3 başarılı/5 başarısız; önkoşullu/artifact fixture uyarlamalı tekrar 8 başarılı/1 başarısız, kalan body beklentisi uyuşmazlığı | native/demo-sdk/, native/demo-sdk-adapted/ |
| Dependency / canlı metadata | Başarısız | admin-payments/*audit.json, live-metadata.log |

Tanı testinin exit 0 vermesi kusurun yeniden üretildiğini gösterir; sağlıklı davranış kabulü değildir. test:cost ve test:support normal CI/preflight içinde çağrılmıyor; diagnostics glob dışında. Bunlar bu tur ayrıca çalıştırıldı. Tam release-preflight tek komut olarak çalıştırılmadı; locked npm ci tekrar edilmedi. Mevcut paket ağacıyla bağımsız kontroller yapıldı; temiz locked kurulum kanıtı yerine geçmez.

Hard delete batch/Storage/Auth crash, lease/retry, concurrent worker ve late upload testleri; sırasız/tekrar counter event'leri; verified publishing ve client post/counter write-denial kontrolleri geçti. Bunlar canlı kullanıcı silme, Apple revocation sağlayıcısı veya sahadaki AR temizliği kanıtı değildir.

## GitHub, cihaz, sağlayıcı ve yayın sınırları

- [PR #58](https://github.com/CrimsBerith/LociAR/pull/58) açık/mergeable; uzak head 5c371185c373d4287e2996a95983aea4f573e1b5, main d760dc2709c3ca33634663ffff7c1a459f9154d7. Connector ve git ls-remote çapraz kontrol edildi. [CI run](https://github.com/CrimsBerith/LociAR/actions/runs/39695654976) başarılı; altı Actions job success, Sonar dahil 7/7 check success. Güncel Sonar check çıktısı 9 yeni issue, 0 hotspot, yeni kodda %0,0 ölçülen coverage ve %0,8 duplication bildiriyor. Geçen quality gate sıfır issue veya test yok anlamına gelmiyor (github-check-runs.json). Bu sonuç farklı yerel HEAD ve uncommitted çalışmaların kanıtı değildir. PR gövdesinin eski SHA/issue sayıları güncel audit olarak alınmadı.
- Fiziksel iPhone unavailable. Gerçek GPS/kamera, Cloud Anchor/VPS, Translation model indirme, background/force-quit ve gerçek APNs receipt/tap açık. Fixture notification tap gerçek APNs değildir.
- Gerçek StoreKit sandbox charge/refund, Stripe/crypto provider teslimi, settlement veya payout yapılmadı. Uncertain external checkout için manuel reconciliation ve gerçek payout altyapısı ayrı işlerdir.
- Seed expected/created import sayıları ve saha anchor'ları doğrulanmadı. App Store Connect salt okunur erişim denemesi login formuna yönlendi; bu tarayıcıda yetkili oturum yok (store-access.json). Kimlik bilgisi girilmedi; TestFlight/App Store build/review durumu doğrulanamadı. Yerel seed/store validator mağaza/seed dağıtımı değildir.
- [GIPHY resmi kuralları](https://developers.giphy.com/docs/api/#best-practices) bu tur okundu: standart entegrasyonda proxy, media URL yeniden yazımı ve izinsiz medya cache'i kısıtlı. Mevcut server-secret/proxy/id-derived URL/cache mimarisi için özel izin kanıtı görülmedi; sağlayıcı hesabında istisna olup olmadığı doğrulanmadı. Anahtarı uygulamaya taşımaya yetki vermez; sahibiyle izin/uyumlu mimari kararı gerekir.

## Düzeltme ve kabul sırası

1. S1–S4 mahremiyet/yetki sınırları; eski kayıt, cursor, push ve mark-read birlikte. Mevcut tanıların sağlıklı sonucu zorunlu tutan regresyonlara dönüşmesi.
2. S5 kanonik grup üyeliği, mevcut verinin kayıpsız geçişi, istemci/grant/cursor sürüm uyumu.
3. S9–S11 AR yeniden doğrulama, metinsiz publish-intent recovery ve yorum handle concurrency; native UI/fixture kabul beklentilerinin düzeltilmesi.
4. S7/S8 bağımlılıklar ve public metin; kabul testlerinin CI/preflight'a alınması. GIPHY sağlayıcı kararının kapatılması.
5. S6 eksik fonksiyon/TTL/indeks ve sağlıksız servisler için eşleşen rollout/rollback; yalnız sonrasında canlı protokol smoke.
6. S12 ölçümlü maliyet iyileştirmeleri; ardından fiziksel cihaz, sağlayıcı sandbox, seed/saha ve gerçek mağaza kanıtları.

Kaynak düzeltmesi, deploy, gerçek ödeme, e-posta/push gönderimi veya mağaza gönderimi yapılmadı.

Son koruma kontrolü: başlangıçtaki mevcut dosyalarda hash farkı 0; yeni tracked diff 0 (preservation-check.json). Native157dosyanın manifesti de eşit. Public browser koşusunun ürettiği next-env.d.ts route import farkı incelenip eski hâline getirildi. Yalnız yeni audit simulatoru kaldırıldı; mevcut audit/kullanıcı simulatorlarının başlangıç durumları korundu, emulator portları serbest (native/cleanup-preservation.json). Yeni repository çıktısı bu rapor; diğer denetim kanıtları build/ altındadır.
