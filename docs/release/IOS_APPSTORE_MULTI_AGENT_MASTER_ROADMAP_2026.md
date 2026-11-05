# iOS APP STORE — MULTI-AGENT MASTER ROADMAP (2026)

> Sürüm: 1.0 — 2 Kasım 2026  
> Hedef: Mevcut veya yeni bir iOS uygulamasını, fikrin/doğrulamanın başlangıcından App Store yayınına ve yayın sonrası izlemeye kadar denetlenebilir bir süreçten geçirmek.  
> Platform: Xcode, Swift / SwiftUI veya UIKit, SPM, GitHub, App Store Connect, TestFlight.  
> Model: 16 uzman ajan (1 orkestratör + 15 uzman), 12 yayın öncesi aşama (P0–P11), 8 Quality Gate, 1 yayın sonrası faz.  
> ÖNEMLİ: Bu belge **bir uygulamada fiilen yapılmış denetim raporu değildir**. Gerçek denetim için kaynak kod, build ve cihaz testleri gerekir. %100 hatasızlık garanti edilemez; tüm kararlar kanıta dayalıdır.

---

## 1. Nihai hedef ve yayın ilkeleri

Bir release ancak aşağıdakiler belgelenerek doğrulanır:

- Doğru ürün kapsamı, kullanıcı akışları ve desteklenen cihazlar belirlenmiş.
- Debug ve **Release** konfigürasyonları temiz build alıyor; doğru imzalı, arşivlenebilir ve yüklenebilir.
- Kritik akışların tamamında otomatik ve gerçek cihaz üzerinde test kanıtı var.
- Bilinen P0/P1 kusuru, veri kaybı riski, sır ifşası ve çözülmemiş yüksek önem dereceli güvenlik açığı yok.
- Büyük/küçük refaktörler davranış koruma testleri ve geri dönüş planıyla uygulanmış.
- Eşzamanlılık, API, veritabanı, ağ, offline, cache, izin ve arka plan senaryoları doğrulanmış.
- Performans baz çizgisi, hedefler, p95 ölçümleri ve cihaz test sonuçları var; anlamlı regresyon yok.
- App Store Review, gizlilik, gerekli SDK manifestleri, giriş/hesap silme, uygulama içi satın alma gibi **uygulanabilir** kurallar sağlanmış.
- TestFlight bulguları kapanmış, sürüm dondurulmuş, sürüm notları ve rollback/hotfix planı hazırlanmış.
- Yayın sonrası telemetri, destek, olay yönetimi ve bakım sorumluları belli.

**Temel kural:** 'Test geçti' iddiası test komutu, cihaz/OS, commit SHA, sonuç dosyası ve tarih olmadan kabul edilmez. Bulunamayan kanıt **NOT VERIFIED** olarak raporlanır.

## 2. Kritik terimler: büyük refaktör / küçük refaktör

| Sınıf | Ne zaman? | Örnekler | Güvenlik kuralı |
|---|---|---|---|
| **Büyük refaktör** | Ölçülebilir sistemik mimari problem varsa | Modülerleştirme; veri katmanını ayırma; DI; navigation/state yönetimi; monolitik ViewModel ayrıştırma; geniş concurrency modeli değişimi | Önce mevcut davranış testleri, ADR, küçük dilimlere bölme, migrate/backout planı; tek seferde 'rewrite' yok |
| **Küçük refaktör** | Yerel okunabilirlik/test edilebilirlik sorunu varsa | Uzun fonksiyon bölme; isimlendirme; ölü kod temizliği; tekrarları giderme; local actor izolasyonu; küçük SwiftUI view ayrıştırma | Dış davranış, API ve veri formatı korunmalı; ilgili testler her dilimde koşmalı |
| **Bug fix** | Kullanıcının gözlediği hatalı davranış varsa | Crash, yanlış veri, UI problemi, izin/oturum hatası | Önce başarısız regresyon testi; sonra minimal düzeltme |
| **Optimizasyon** | Gerçek ölçümle sorun doğrulanmışsa | CPU/memory/launch time/energy/network azaltma | Aynı cihaz/senaryoda önce/sonra ölçümü; ölçüm yoksa 'optimize edildi' denmez |

Büyük refaktörü, yalnızca 'daha temiz kod' hissine dayanarak başlatma. Yaklaşan yayınla ilgisiz, yüksek riskli rewrite işlerindeki kararı orkestratör + mimari ajan + test ajanı birlikte versin.

---

## 3. Multi-agent ekibi (16 ajan)

Ajanlar birbirinin yerine 'onay vermemeli'. Kritik değişikliği yapan ajan ile kalite/güvenlik incelemesini yapan ajan farklı olmalıdır.

| Kimlik | Rol / sahiplik | Ne arar ve ne üretir? |
|---|---|---|
| **A00** | **Release Orchestrator / Teknik Lider** | Repo haritası; iş planı; görev bağımlılıkları; risk skoru; merge sırası; gate kararları; nihai GO/NO-GO |
| **A01** | Product & Requirements Auditor | Özellik envanteri, acceptance criteria, kullanıcı yolculuğu, kapsam dışı işler, edge-case matrisi |
| **A02** | Architecture & **Büyük Refaktör** | Modüller, katman sınırları, bağımlılık yönü, ownership, ADR, inkremental migrasyon |
| **A03** | Swift Code Quality & **Küçük Refaktör** | Dead code, duplications, force unwrap, retain cycles, stil, hatalı hata yönetimi, lokal sadeleştirme |
| **A04** | Swift Concurrency & App Lifecycle | `async/await`, `Task`, cancellation, `@MainActor`, actor isolation, race, background/foreground, lifecycle |
| **A05** | Data / Offline / Migration | SwiftData/Core Data/SQLite, atomic write, cache, persistence, schema migration, offline-sync, data loss |
| **A06** | Network / Backend / Reliability | API kontratları, retries/backoff, timeout, auth refresh, idempotency, pagination, rate limits, server failure |
| **A07** | Security / Privacy / Auth | Secrets, Keychain, ATS/TLS, permissions, token storage, account deletion, privacy inventory, threat model |
| **A08** | Performance / Memory / Battery | Instruments, cold/warm start, Time Profiler, Allocations, Leaks, hangs, energy, render and network profiling |
| **A09** | Unit / Integration / Contract Testing | Swift Testing/XCTest, fixtures, mocks, boundary cases, fault injection, coverage ve test planları |
| **A10** | UI / E2E / Accessibility QA | XCUIAutomation, kritik uçtan uca akışlar, VoiceOver, Dynamic Type, reduce motion, izin reddi ve hata ekranları |
| **A11** | Design System / Localization | HIG, layout, tipografi, Dark Mode, Türkçe/İngilizce, RTL gerekiyorsa, uzun metin, iPad/iPhone adaptasyonu |
| **A12** | CI/CD / Build / Signing | Xcode sürüm sabitleme, reproducible build, workflow, dependency scanning, certificates, provisioning, archive |
| **A13** | SDK / Monetization / Compliance | SDK inventory ve privacy manifest; StoreKit abonelik/IAP (varsa); export compliance; yaş sınıflaması, gerekli beyanlar |
| **A14** | App Store / TestFlight / ASO | Metadata, ekran görüntüleri, açıklamalar, destek URL, review notes, demo account, TestFlight ve submission |
| **A15** | **Independent Red Team / Final QA** | Diğer ajanların bulamadığı kusurlar; adversarial senaryolar; yanlış pozitiflerin ayıklanması; final release veto |

### Çalışma kuralları

1. **A00** repo commit SHA'sını, branch'i, Xcode sürümünü ve hedef cihaz/OS listesini kilitler.
2. A01, A02, A04–A08, A12, A13 ilk turda **read-only keşif** yapar; ortak dosyalara aynı anda kod yazmaz.
3. Her ajan bulguyu `ISSUE-ID | severity | affected files | reproduction | evidence | fix proposal | owner` biçiminde verir.
4. A00 tekrarları birleştirir; P0/P1 önce, P2 sonra, P3 yalnızca etkisi kanıtlıysa.
5. Kod değişiklikleri küçük PR'lara ayrılır. Her PR'ın tek sahibi, bağımsız reviewer'ı ve test listesi olur.
6. Geniş refaktör önce feature flag/adapter veya strangler yaklaşımıyla bölünür; veri migrasyonu için dry-run ve rollback doğrulanır.
7. Bir ajan başka ajanın henüz merge edilmemiş değişikliğini temel alarak release onayı vermez.
8. Her PR sonrası hedeflenen testler, her birleşik değişiklik seti sonrası bütün regresyon seti çalışır.
9. A15 kod değişimini değil, sadece bağımsız son değerlendirmeyi yapar. A15'in açık P0/P1 bulgusu **veto**dur.
10. Testler, coverage yüzdeleri, metrikler ve Apple onayları **uydurulamaz**. Erişim yoksa NOT RUN / NOT VERIFIED.

### Paralellik ve bağımlılıklar

```text
A00 → A01 (ürün kapsamı) ─┐
    → A02 (mimari) ────────┼→ Ortak risk listesi → Refaktör/bug-fix PR'ları
    → A03/A04/A05/A06 ────┤                         │
    → A07/A08/A12/A13 ────┘                         ↓
                              A09 + A10 + A11 → A12 CI → A14 TestFlight
                                                        ↓
                                             A15 bağımsız denetim
                                                        ↓
                                              A00 GO / NO-GO
                                                        ↓
                                               App Store Review
```

---

## 4. 12 aşamalı yayın öncesi roadmap

### P0 — Ürün, release kapsamı ve risk hedefleri
**Sahip:** A00, A01, A14.  
**İşler:** User stories; support matrix (en düşük desteklenen iOS sürümü ve cihazlar); offline gerekliliği; özel donanım/camera/AR/push gibi özellikler; ülke/dil; hesap/sosyal giriş; IAP/abonelik; backend; veri sınıfları; regülasyon; P0–P3 hata tanımı; hangi özelliklerin v1'e girmediği.  
**Çıktı:** `PRODUCT_SCOPE.md`, `ACCEPTANCE_MATRIX.md`, `RELEASE_POLICY.md`.  
**Bitiş:** Ürünün tüm *kritik* kullanıcı yolculukları numaralı test senaryolarına bağlandı.

### P1 — Repo keşfi, baz çizgisi ve teknik borç haritası
**Sahip:** A00, A02, A03, A04, A05, A06, A08, A12, A13.  
**İşler:** Xcode proje/scheme/target; dependencies/lockfile; tüm Swift/Obj-C/asset/config/entitlement dosyaları; build warning; hard-coded secret scan; force unwrap; TODO/FIXME; crash logs; test targets; önceki release; düşük bağlantı; ilk açılış; Instruments ile başlangıç metrikleri. Tüm uygulama akışlarını ekran ve API bazında çıkar.  
**Çıktı:** `REPO_MAP.md`, `BASELINE.md`, `RISK_REGISTER.md`, `DEPENDENCY_SBOM.md` (en azından bağımlılık envanteri).  
**Bitiş:** Kanıtlı bir başlangıç build'i ve önceliklendirilmiş sorun listesi. **Gate G1**.

### P2 — Güvenlik öncelikli hata ve mimari planı
**Sahip:** A02, A04–A07, A09.  
**İşler:** P0/P1 sorunları triage; auth & veri erişimi; thread/data races; migration riskleri; API hata semantiği; doğru mimari hedefinin çizilmesi; her refaktörün ölçülebilir gerekçesi, kapsadığı dosyalar, tahmini riski, davranış testleri ve rollback mekanizması.  
**Çıktı:** `ARCHITECTURE_ADRS.md`, `REFACTOR_PLAN.md`, `THREAT_MODEL.md`.  
**Bitiş:** Büyük refaktör gerekliyse ADR/denetim onayı; değilse iptal edilip küçük düzeltmelere geçilir.

### P3 — Büyük refaktör (gerekiyorsa, kontrollü ve parça parça)
**Sahip:** A02; reviewer A09 + A15 (sonradan).  
**İşler:** UI/Domain/Data sınırları; API arayüzü ve DI; navigation; state ownership; actor izolasyonu; katmanların test edilebilirliği; feature flag; persistence contract; modül bağımlılık döngülerini azaltma. Eski-yeni davranış için golden/characterization testleri.  
**Çıktı:** Birden fazla küçük PR, ADR güncellemeleri, migration ve rollback prosedürü.  
**Bitiş:** Her dilim sorunsuz build, regresyon ve migration testleriyle biter. **Gate G2**.

### P4 — Küçük refaktör, Swift hataları ve sağlamlık
**Sahip:** A03, A04, A05, A06.  
**İşler:** Long function, duplicate state, dead code, force unwrap riski, optional handling, memory ownership, delegate/notification cleanup, SwiftUI task lifetimes, cancellation, stale requests, retry storm, cache invalidation, offline conflict, corrupted data, stale token/refresh race.  
**Çıktı:** Öncesi/sonrası davranış testleriyle küçük PR'lar; açık TODO riskleri.  
**Bitiş:** Kalite lint/analyze clean veya açıklamalı ve onaylı istisnalar; P0/P1 sıfır.

### P5 — Security, privacy ve Apple uyumluluğu
**Sahip:** A07, A13, A14.  
**İşler:** Keychain/token, entitlements, least privilege, transport security, backend authorization, dependency provenance; veri toplama/amaç/saklama/silme matrisi; gerekiyorsa kullanıcı izni; `PrivacyInfo.xcprivacy` ve required-reason APIs; listed SDK'ların geçerli manifest/imzası; ATT yalnızca tracking varsa; uygulama içi hesap silme hesap oluşturma varsa; sosyal giriş varsa eşdeğer Apple kurallarına uygun alternatif; gizlilik politikası; App Privacy beyanı; IAP/StoreKit doğrulama gerekiyorsa; export compliance, yaş derecesi, KVKK/GDPR gibi uygulanabilir yasalar için hukuk kontrolü.  
**Çıktı:** `SECURITY_AUDIT.md`, `DATA_INVENTORY.md`, `PRIVACY_COMPLIANCE.md`, `SDK_COMPLIANCE.md`.  
**Bitiş:** Kritik güvenlik açıkları ve zorunlu uyumluluk eksikleri kapandı. **Gate G3**.

### P6 — Otomasyonlu test piramidi ve uçtan uca doğrulama
**Sahip:** A09, A10, A05, A06.  
**İşler:**
- Swift Testing/XCTest: iş kuralları, validation, date/locale, para hesapları, boundary, concurrency cancel.
- Integration/contract: API response decoding, backend hata durumları, auth refresh, storage migration, repository, cache.
- UI/XCUITest: açılış, onboarding, login/logout/deletion varsa, ana değer akışı, paywall/restore varsa, izin reddi, offline/online, deep link, background resume.
- Hata enjeksiyonu: 401/403/429/500, timeout, DNS failure, düşük depolama, app kill/restart, eski veritabanından upgrade.
- Test veri üretimi: deterministik seed, mock server, izole kullanıcılar; gerçek kişisel veri kullanma.
- Flaky testleri işaretle, sebebini çöz; flaky testi sessizce kaldırma.
**Çıktı:** `TEST_MATRIX.md`, `.xctestplan`, CI'da test ve coverage raporları.  
**Bitiş:** Kritik akışların %100'ünün test planı ve başarılı kanıtı var; core/business modüllerinde örnek **≥%85 line coverage** (hedef, Apple gerekliliği değil); tüm repo için öneri ≥%75 (gerektiğinde farklılaştırılır). Yalnızca yüzde yeterli değildir. **Gate G4**.

### P7 — UX, erişilebilirlik, localization ve cihaz matrisi
**Sahip:** A10, A11, A01.  
**İşler:** HIG, navigation consistency, empty/loading/error/retry states, permission education, keyboard/Focus, safe area, orientation, Dynamic Type (büyük metin), VoiceOver label/rotor, contrast, reduced motion, Dark/Light, farklı ekran boyutları, iPad destekleniyorsa iPad, Türkçe/İngilizce, tarih/sayı/para formatı, uzun çeviri, offline UX, cihaz dönüşü ve arka plan.  
**Çıktı:** `UX_A11Y_CHECKLIST.md`, ekran kaydı ve screenshot diff raporları.  
**Bitiş:** P0/P1 UX/A11y bloklayıcı yok; kritik akışlar erişilebilirlik incelemesinden geçti. **Gate G5**.

### P8 — Ölçümlü optimizasyon (performans / enerji / boyut)
**Sahip:** A08, A03, A04, A05, A06.  
**İşler:** Debug ile değil, mümkün olduğunca Release/profiling uyumlu konfigürasyonda gerçek cihaz + Instruments. Cold/warm launch, Time Profiler, memory leak/retain cycle, Allocations, app hang, SwiftUI over-invalidation, network payload count, cache efficiency, images, scroll/render, background energy, build/binary size, thermal throttling.  
**Çıktı:** `PERFORMANCE_BASELINE_VS_FINAL.md` (cihaz, iOS, build, ağ, senaryo, n tekrar, p50/p95 ve ham ölçüm).  
**Bitiş:** Önce-sonra karşılaştırmasında kritik regresyon yok; hedef bütçeler karşılanıyor. Örnek hedefler: *ürüne göre* cold launch p95 ≤2.5 sn, kritik ekran etkileşiminde görünür donma yok, sürekli bellek artışı yok. Bunlar **özelleştirilecek ekip hedefleridir**, Apple sınırı değildir. **Gate G6**.

### P9 — CI/CD, signing, release branch ve observability
**Sahip:** A12, A07, A08, A00.  
**İşler:** Clean checkout ile build; branch protection; automated format/lint/analyze; unit/integration/UI test; Release archive; dSYM; symbolication; signing/Apple certificates/provisioning; secrets'i GitHub Encrypted Secrets/kurumsal vault'ta tut; SBOM/SDK kontrolü; app version/build number; crash/hang/performance telemetry, PII redaction, consent; feature flags, server-side kill switch yalnızca uygun yerlerde; release/hotfix branch; rollback planı.  
**Çıktı:** `.github/workflows/ios-ci.yml` veya Xcode Cloud workflow, `RUNBOOK_RELEASE.md`, `OBSERVABILITY.md`.  
**Bitiş:** Temiz branch'ten tekrar üretilebilen CI, imzalı arşiv ve hata sinyalleri. **Gate G7 (teknik hazırlık)**.

### P10 — TestFlight ve bağımsız red-team turu
**Sahip:** A14, A10, A15, A00.  
**İşler:** Internal testing → external beta (gerekiyorsa Apple beta review); farklı iOS sürümleri ve gerçek cihazlar; flaky ağ, restore/install, update/migration, izin reddi, kullanıcı gizliliği, gözlenebilir metrikler ve katılımcı feedback'i; A15 ikinci kez baştan sona riskli akışları dener. TestFlight build'leri en çok 90 gün test edilebilir; external tester üst limiti 10.000.  
**Çıktı:** `TESTFLIGHT_REPORT.md`, `FINAL_RED_TEAM_REPORT.md`, açık issue listesi.  
**Bitiş:** P0/P1 sıfır; kararlı test ortamı, kritik senaryolarda crash yok; yeterli ölçüm varsa crash-free session hedefi örn. ≥%99.9 (hedef, garanti değil). **Gate G7 (beta kapanışı)**.

### P11 — App Store Connect / Review / kontrollü yayın
**Sahip:** A14, A13, A07, A00.  
**İşler:** Apple Developer programı ve yetkiler; bundle ID, signing, app record; doğru build; ad, subtitle, category, keywords, description, destek URL, gizlilik URL, screenshots/app previews, localizations, yaş derecesi, content rights, export compliance, App Privacy, erişilebilirlik beyanları; varsa IAP/abonelik ve vergi/banka/sözleşmeler; demo hesap ve App Review açıklamaları; pricing/territories; manuel/otomatik/uygunsa aşamalı release seçimi; son PR freeze ve commit SHA.  
**Çıktı:** `APPSTORE_SUBMISSION_CHECKLIST.md`, `REVIEW_NOTES.md`, `RELEASE_NOTES.md`, GO/NO-GO karar tutanağı.  
**Bitiş:** **Gate G8**; App Store Connect'te `Add for Review` → `Submit for Review`, review yanıtları ve yayın durumunun kontrolü. Apple inceleme kabulü ekip tarafından garanti edilemez.

### P12 — YAYIN SONRASI (release bitti sanma)
**Sahip:** A00, A06, A08, A12, A14.  
**İşler:** İlk 24–72 saat crash, hang, login başarısı, API error, satın alma restore, kullanıcı feedback, App Store yorumları, backend yükü ve maliyet; crash symbolication; P0/P1 on-call rotasyonu; sorun görülürse hotfix, feature rollback/kill switch veya uygun mağaza aksiyonu; postmortem, sonraki sprint backlog'u ve dependency bakım döngüsü.  
**Çıktı:** `POST_LAUNCH_HEALTH.md`, `INCIDENT_RUNBOOK.md`, `RELEASE_RETROSPECTIVE.md`.

---

## 5. Quality Gates: yayın engelleme sistemi

Aşağıdaki eşikler proje başlangıcında doğrulanarak ilan edilir. Sadece kapsam dışı olduğu kanıtlanan satırlar `N/A` olabilir; `NOT RUN` **PASS değildir**.

| Gate | Geçiş şartı | Onaylayıcı |
|---|---|---|
| **G1 — Envanter & baseline** | Repo/feature haritası, build/test başlangıç durumu, cihaz matrisi ve riskler belgeli | A00 + A01 + A12 |
| **G2 — Mimari / refaktör** | Davranış koruma testleri, tüm migration testleri, kanıtlı temiz build; büyük refaktörde ADR + rollback | A02 + A09 |
| **G3 — Güvenlik / uyumluluk** | P0/P1 güvenlik 0; gizlilik, SDK/manifest, account deletion vb. uygulanabilir kurallar PASS | A07 + A13 |
| **G4 — İşlevsel test** | 100% kritik kullanıcı akışında test+başarı kanıtı; CI regression PASS; core coverage için kabul edilen hedef | A09 + A10 |
| **G5 — UI & accessibility** | Kritik cihaz/dil/izin durumları testli; P0/P1 A11y/UX 0 | A10 + A11 |
| **G6 — Performans** | Aynı senaryoda karşılaştırmalı cihaz ölçümü; kabul edilmiş p95 / bellek / enerji bütçelerinde bloklayıcı regresyon yok | A08 |
| **G7 — Release / beta** | Reproducible signed Release archive; CI PASS; TestFlight gerçek cihaz sign-off; red-team P0/P1 0 | A12 + A14 + A15 |
| **G8 — App Store** | Bütün required metadata ve beyanlar tamam; doğru build, reviewer erişimi, release planı; bütün önceki gate'ler PASS | A00 + A14 |

### Önem dereceleri

- **P0 / Critical:** Güvenlik anahtarı sızıntısı, hesaplar arası veri erişimi, ciddi veri kaybı, temel akışta sistematik çökme → **hemen blokla**.
- **P1 / High:** Oturum/ödeme/ana görev ciddi bozuk; yüksek önem güvenlik açığı; tekrarlanan crash; geri dönüşsüz migration riski → **release blokla**.
- **P2 / Medium:** Alternatifi olan önemli kusur; performans sapması; yerel UX problemi → risk gerekçesi ve açık sahip/son tarih ile karar.
- **P3 / Low:** Küçük stil/polish; belgelenip sonraki sürüme planlanabilir.

### Nihai GO/NO-GO

`GO` = G1–G8 PASS + P0/P1=0 + Release archive/test SHA aynı + A15 veto yok + düzeltmeler sonrası full regression tekrarlandı.  
`NO-GO` = Bunlardan herhangi biri doğrulanmadı. `UNKNOWN` ve `NOT VERIFIED` olan yüksek riskli kontrol onaya dönüşemez.

---

## 6. Test stratejisi: risk tabanlı, tekrar edilebilir

### Kritik senaryo matrisi (uygulanabilenleri doldur)

| Akış | Normal durum | Olumsuz durum | Ölçüm/kanıt |
|---|---|---|---|
| Launch/onboarding | İlk kurulum, yeniden açma | Bozuk state, düşük bellek | UI recording + logs |
| Auth & session | Login, logout, refresh | 401, iptal, token expiry, clock skew | Integration + E2E |
| Core user journey | Ana görev başarıyla tamamlanır | Cancel, iki kez dokunma, retry, conflict | E2E + domain tests |
| Network | Wi‑Fi, mobil data | Offline, 429, 500, timeout, yarıda kesilme | Mock server + real device |
| Data/persistence | Kaydet, tekrar aç | App kill, migration, disk full, corrupt DB | Integration/migration |
| Permission | İzin verildi | İzin verilmedi, sonra Settings'ten değişti | Real-device manual+UI |
| IAP (varsa) | Buy, restore, entitlement | Cancel, pending, refund, offline, duplicate | StoreKit sandbox/test |
| Localization/A11y | Varsayılan dil/metin | XL Dynamic Type, VoiceOver, uzun string | Device screenshot + inspector |
| Update path | Eski sürümden yenisine geçiş | Eski cache/data, yarım kalan işlem | Upgrade/install test |
| Push/deeplink/AR (varsa) | Normal tetikleme | İzin yok, cihaz uyumsuz, background | Cihaz + feature-specific |

### Cihaz matrisi

- Düşük/orta/yüksek performans sınıfından **en az birer** gerçek iPhone; ürünün minimum desteklenen OS, en güncel kararlı OS ve anlamlı bir ara OS sürümü.
- Küçük/büyük ekran; tüm desteklenen orientation; cihaz özellikleri (kamera, LiDAR, ARKit, NFC, HealthKit, Bluetooth, push) yalnızca ürün kapsamına göre.
- Simülatör testleri hızlı regresyon için; **kamera/AR/enerji/gerçek bellek ve permission davranışı için tek başına yeterli değildir**.
- Test edilen gerçek OS/build/cihaz modeli kaydedilmeli; 'tüm iPhone' veya 'her iOS sürümü test edildi' denmemeli.

---

## 7. Önerilen otomatik CI pipeline

Aşağıdaki adımlar, projeye göre `scheme`, `workspace/project`, `destination` ve araç kurulumları ayarlanarak GitHub Actions macOS runner veya Xcode Cloud üzerinde yürütülmelidir.

```text
PR opened / updated
  → checkout + pin Xcode + resolve Swift packages
  → format/lint (varsa SwiftLint / swift-format)
  → secret scan + dependency/license audit + privacy manifest validation
  → xcodebuild clean build (Debug + Release)
  → xcodebuild analyze
  → Swift Testing/XCTest unit + integration + coverage
  → UI smoke tests (simulator)
  → test result bundle (.xcresult), coverage, diagnostics upload
  → independent reviewer + required status checks
Main / Release branch
  → full test matrix + regression + release archive
  → correct signing and upload to TestFlight (approved credentials)
  → manual release gate → App Store submission
```

**Örnek komut şablonları — doğrulamadan doğrudan çalıştırma:**

```bash
# Proje türüne göre -workspace yerine -project kullan.
xcodebuild -list -workspace YourApp.xcworkspace

# Simülatör smoke/unit; workspace, scheme ve destination gerçek değerlerle değişmeli.
xcodebuild test \
  -workspace YourApp.xcworkspace \
  -scheme YourApp \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -enableCodeCoverage YES \
  -resultBundlePath ./artifacts/ios-tests.xcresult

# Static analyze
xcodebuild analyze \
  -workspace YourApp.xcworkspace \
  -scheme YourApp \
  -destination 'generic/platform=iOS Simulator'

# Release archive — signing/provisioning ortamı hazırlanmış olmalı.
xcodebuild archive \
  -workspace YourApp.xcworkspace \
  -scheme YourApp \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ./artifacts/YourApp.xcarchive
```

**Uyarı:** Örnek 'iPhone 17' simülatörü her CI runner'ında bulunmayabilir. `xcrun simctl list devices available` ile gerçek kullanılabilir destination seç. `resultBundlePath` önce var olmayan bir path olmalı; repeated CI runs için temizle. CI'a certificate/API key/developer credentials'ın kendisini commit etme; log redaction kullan.

### Kontrol listesi — kod taraması

- [ ] Clean build / Release archive / no blocking warning.
- [ ] Build sırasında dependency conflict ve deprecated API raporlandı.
- [ ] Hardcoded secret / private endpoint credentials yok.
- [ ] `try!`, `as!`, `fatalError`, `force unwrap`, `unowned` gibi riskli kalıplar bağlama göre denetlendi; her biri otomatik hata kabul edilmedi.
- [ ] `Task` cancellation, `MainActor`, actor isolation, data races, Notification/observer cleanup doğrulandı.
- [ ] Network error handling, retries/backoff, 429, idempotency, token refresh race test edildi.
- [ ] DB migration/upgrade; offline write; veri bütünlüğü doğrulandı.
- [ ] UI screenshot, VoiceOver, Dark Mode, Dynamic Type, localization ve permission-denied akışları doğrulandı.
- [ ] TestFlight crash/hang, dSYM ve telemetri bilgisi görüntülenebiliyor.
- [ ] PrivacyInfo.xcprivacy ve tüm third-party SDK yükümlülükleri gerçek dependency inventory ile eşleştirildi.
- [ ] App Review metadata, demo hesap, URL ve gerekiyorsa IAP/abonelik akışları doğrulandı.

---

## 8. Ajan bulgu çıktısı ve PR şablonu

Her ajan şu JSON değil, okunabilir Markdown şablonunu doldurmalı:

```markdown
## [ISSUE-ID] Kısa başlık
- Agent / owner:
- Priority: P0 / P1 / P2 / P3
- Confidence: Confirmed / Likely / Suspected
- Status: OPEN / IN_PROGRESS / FIXED / VERIFIED / N/A / NOT_VERIFIED
- Git SHA / branch / Xcode / target OS:
- Files / symbols:
- Reproduction: Adım adım / test / cihaz
- Evidence: Log, screenshot, stack, failing test, ölçüm, source ref
- Root cause:
- Proposed smallest safe fix:
- Behavior/migration risks:
- Tests BEFORE / AFTER:
- Reviewer:
- Verification command/result:
- Rollback / mitigation:
```

PR kabul şartları:

- Sorunla bağıntılı minimum diff; gizli anahtar yok; yeni paket ihtiyacı gerekçeli.
- Kritik bug için önceden fail eden ve fix sonrasında geçen regression test.
- Fonksiyonel değişiklik varsa UI/ürün kabul kriteri güncellenmiş.
- Refaktör semantiği değiştirmemiş veya değişiklik açıkça dokümante.
- Bağımsız reviewer, CI, cihaz ve perf etkisini incelemiş.
- Build/test çıktısının SHA'sı PR'daki commit'e bağlı.

---

## 9. Tek seferde Gemini / Codex / Xcode ajanına verilecek MASTER PROMPT

Aşağıdaki metni uygulama reposu açıkken çok ajanlı çalışabilen asistanına ver. Araçlar gerçek paralel ajan çalıştıramıyorsa aynı rolleri ayrı, sıralı inceleme turlarında uygula.

```text
You are the Release Orchestrator (A00) of a 16-role iOS engineering audit.
Use the role definitions and P0–P12 phases in IOS_APPSTORE_MULTI_AGENT_MASTER_ROADMAP_2026.md.
Goal: make this existing iOS app defensibly production-ready for App Store review,
not to claim it is '100% bug-free'. All claims require evidence.

NON-NEGOTIABLE:
1. Read the complete repository, Xcode targets/schemes, dependencies, tests,
   entitlements, Info.plist, privacy manifests, configuration, CI and app flows.
2. Record HEAD commit SHA, toolchain version, target SDK, deployment target,
   supported devices and initial build status BEFORE modifying anything.
3. Run parallel READ-ONLY specialist audits if supported. Never let agents
   concurrently modify the same files. Each issue must include file/path,
   risk priority, reproducible evidence, minimal fix, proposed tests and owner.
4. Distinguish BIG REFACTOR (architecture-level migration with ADR + rollback)
   from SMALL REFACTOR (local behavior-preserving cleanup). Do not rewrite
   major subsystems without measurable justification and characterization tests.
5. Triage P0/P1 first; use one scoped PR/commit per fix cluster. Preserve API,
   user data, persistence and existing working behavior. Require explicit
   permission before destructive migrations, irreversible actions or deployment.
6. Audit Swift concurrency, memory, lifecycle, persistence, API reliability,
   offline behavior, auth, security, data minimization, privacy manifests,
   required-reason APIs, third-party SDKs, UI accessibility, localization,
   app review risks, build signing, and StoreKit where relevant.
7. Create/repair unit, integration, UI and migration tests. Prefer reproducing
   bugs with failing tests before applying fixes. Perform full regression
   after merges, and profile performance on real devices when available.
8. Use quality gates G1–G8. 'NOT RUN' or 'NOT VERIFIED' is never 'PASS'.
   Don't invent coverage, crash-free rates, Xcode outputs or Apple approvals.
9. Do not modify signing credentials, App Store Connect records, billing,
   production infrastructure or publish without explicit authorization.
10. At the end, generate:
    - REPO_MAP.md
    - MASTER_AUDIT_REPORT.md
    - PRIORITIZED_ISSUES.md
    - REFACTOR_PLAN.md
    - TEST_MATRIX.md
    - SECURITY_PRIVACY_REPORT.md
    - PERFORMANCE_BASELINE_VS_FINAL.md
    - APPSTORE_SUBMISSION_CHECKLIST.md
    - FINAL_GO_NO_GO.md

FINAL_GO_NO_GO.md must include each gate status, actual commands/tests run,
results and evidence paths, remaining issues, changed files, commit SHAs,
risks and what a human needs to do next. Only say GO when every required
release gate has been independently verified. Otherwise say NO-GO.

Start with repository inventory and a risk-ranked PLAN, not blind code edits.
```

### Operasyonel teslim düzeni

```text
docs/release/
├── PRODUCT_SCOPE.md
├── ACCEPTANCE_MATRIX.md
├── REPO_MAP.md
├── BASELINE.md
├── MASTER_AUDIT_REPORT.md
├── PRIORITIZED_ISSUES.md
├── ARCHITECTURE_ADRS.md
├── REFACTOR_PLAN.md
├── THREAT_MODEL.md
├── SECURITY_PRIVACY_REPORT.md
├── SDK_COMPLIANCE.md
├── TEST_MATRIX.md
├── PERFORMANCE_BASELINE_VS_FINAL.md
├── UX_A11Y_CHECKLIST.md
├── TESTFLIGHT_REPORT.md
├── FINAL_RED_TEAM_REPORT.md
├── APPSTORE_SUBMISSION_CHECKLIST.md
├── REVIEW_NOTES.md
├── RUNBOOK_RELEASE.md
├── FINAL_GO_NO_GO.md
└── POST_LAUNCH_HEALTH.md
```

**Not:** Dosyalar anlamsız şekilde boş şablonlarla çoğaltılmamalı. Gerçek kanıtı olmayan rapor `NOT VERIFIED` diye açıkça işaretlenmeli.

---

## 10. App Store submission için özel kontrol listesi

- [ ] Doğru Apple Developer ekip/rol erişimi; aktif gerekli sözleşmeler.
- [ ] Gerçek Bundle Identifier, Team, Signing, Provisioning Profiles, App ID/entitlements.
- [ ] Minimum deployment target ile doğru SDK requirement ayrımı yapılmış.
- [ ] 2 Kasım 2026 itibarıyla upload için minimum **Xcode 26 + iOS 26 SDK**; iOS 27/Xcode 27 uyumluluğu test edilmiş; Nisan 2027 SDK 27 gerekliliğine plan var.
- [ ] App Store Connect'te sürüm/build eşleşmesi; release archive/dSYM erişilebilir.
- [ ] Ad, alt başlık, açıklama, kategori, anahtar kelimeler, telif/rights, yerelleştirme.
- [ ] App icon, doğru cihaz ve boyutlarda gerçek uygulama screenshotları/app previews (gerekli olanlar).
- [ ] Aktif support URL ve privacy policy URL; App Privacy bilgilerinde bütün 3rd-party SDK veri pratikleri doğru.
- [ ] `PrivacyInfo.xcprivacy` ve required-reason API / SDK signature şartları karşılanmış.
- [ ] Yaş derecesi soruları ve uygun özellik/ülke beyanları tamam.
- [ ] Uygulama hesap açıyorsa hesap silme in-app; sosyal login varsa Apple 4.8 eşdeğer login gereksinimi ve istisnalar incelenmiş.
- [ ] Reklam takibi varsa ATT; yoksa gereksiz ATT prompt'u yok.
- [ ] Dijital ürün veya abonelik satılıyorsa ilgili App Store ödeme ve StoreKit kuralları, restore ve entitlement testleri uygulanmış.
- [ ] Encryption/export compliance cevapları doğru; diğer yasal gereklilikler gerekli kişilerce kontrol edildi.
- [ ] Review notes: ürünün çalışması, demo account, gerekli external service, özel donanım ve özel inceleme adımları.
- [ ] Ağ hatası, offline, izin reddi, veri silme ve gerçek cihaz testleri tamam.
- [ ] Fiyat/bölgeler, privacy, release option (manual/automatic/phased if offered), iletişim/sürüm notları.
- [ ] App Review onayı yayın öncesi hâlâ harici bir bağımlılık; reddedilirse kural bazlı düzeltme ve yeniden test süreci hazır.

---

## 11. Önerilen uygulama takvimi (kaba; iş büyüklüğüne bağlı)

Bu tarihler zorunluluk değildir; proje karmaşıklığına göre paralel çalıştırılır.

| Dönem | Kritik işler | Çıkış |
|---|---|---|
| Sprint 0 | P0–P1, ürün/repo baz çizgisi | G1 |
| Sprint 1 | P2, kritik bugfix, büyük refaktör kararları | Mimari plan |
| Sprint 2 | P3–P4 mimari ve lokal iyileştirmeler | G2 |
| Sprint 3 | P5 security/privacy + P6 test altyapısı | G3–G4 |
| Sprint 4 | P7 UX/A11y + P8 Instruments profili | G5–G6 |
| Sprint 5 | P9 CI + P10 TestFlight + A15 red team | G7 |
| Sprint 6 | P11 App Store submission | G8 → Review |
| Yayın sonrası | P12 telemetri, hotfix, bakım | Release health |

> Küçük ve halihazırda testli uygulamada fazlar çok daha kısa olabilir. Büyük/AR/fintech/health/offline-first uygulamada daha uzun sürer. Süre varsayımı yayın tarihi taahhüdü değildir.

---

## 12. Resmi Apple kaynakları (2 Kasım 2026 kontrol edilerek)

1. **Upcoming requirements:** https://developer.apple.com/news/upcoming-requirements/
2. **Latest submission SDK/Xcode timeline:** https://developer.apple.com/news/?id=k1mtkt1k
3. **App Store Connect release notes:** https://developer.apple.com/help/app-store-connect/release-notes/
4. **App Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
5. **App Store submissions overview:** https://developer.apple.com/app-store/submitting/
6. **Complete Review Information:** https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
7. **App Privacy:** https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
8. **Privacy manifests:** https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
9. **Third-party SDK requirements:** https://developer.apple.com/support/third-party-SDK-requirements/
10. **Testing in Xcode:** https://developer.apple.com/documentation/xcode/testing
11. **Instruments & performance:** https://developer.apple.com/documentation/technologyoverviews/testing-and-performance
12. **TestFlight overview:** https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
13. **Submit an app:** https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app

**Güncellik notu:** Bu belgede sayılan kurallar zamanla değişebilir. Submission gününde Apple'ın güncel dokümantasyonuna ve App Store Connect ekranındaki gerçek gerekliliklere yeniden bakılmalıdır.

---

## 13. Final release raporu için kısa karar şablonu

```markdown
# FINAL GO / NO-GO — <APP_NAME> v<VERSION>
- Decision: GO | NO-GO
- Date / reviewer:
- Git SHA / branch / Xcode / SDK:
- CI build and xcresult links:
- TestFlight build / real devices:
- G1: PASS | FAIL | NOT VERIFIED | N/A
- G2: PASS | FAIL | NOT VERIFIED | N/A
- G3: PASS | FAIL | NOT VERIFIED | N/A
- G4: PASS | FAIL | NOT VERIFIED | N/A
- G5: PASS | FAIL | NOT VERIFIED | N/A
- G6: PASS | FAIL | NOT VERIFIED | N/A
- G7: PASS | FAIL | NOT VERIFIED | N/A
- G8: PASS | FAIL | NOT VERIFIED | N/A
- Remaining P0: <count>
- Remaining P1: <count>
- Other known risks / owner / mitigation:
- Crash / hang / performance evidence:
- Independent red-team sign-off:
- App Review notes and links:
- Release / hotfix / rollback owner:
- Next required human action:
```

**Yayın kuralı:** Bu şablonda gerekli bütün gate'ler PASS olmadan ve P0/P1 sıfırlanmadan GO verilmez. Bu belge tek başına gerçek test veya gerçek Apple inceleme onayı değildir.
