# LociDrop — gereksinim → kanıt izlenebilirliği

İlk sürüm: 12 Kasım 2026. Plan: `claude/unified-release-test-plan-2026-11-12.md` (T2). Test planı: `loci/reports/LociAR Otonom Test Planı.md`.
Kod tabanı: `claude/klipy-migration` @ `e5eab19`. Her PR değişen satırı günceller.

Kanıt kolonları: **B** birim/bileşen · **E** emülatör + Rules · **U** simülatör UI · **C** fiziksel cihaz / kontrollü canlı.
Durum: ✅ bu commit'te yeşil · 🟡 eski commit'te yeşil (yeniden koşulmalı) · ❌ kırmızı · ⬜ kanıt yok.

## Altın akışlar (docs/QA_MATRIX.md)

| ID | Akış | B | E | U | C | Açık kanıt |
|---|---|---|---|---|---|---|
| GF-01 | Onboarding → Keşfet | `LaunchReadabilityTests`, `StoreReadinessTests` 🟡 | — | `AuthGateUITests/testScreenTour01Onboarding` 🟡 | ⬜ | Reduce Motion fiziksel |
| GF-02 | Harita → yüzey seç → AR | `PinStateMachineTests`, `ARCameraHealthTests` 🟡 | — | `testCreateFlowOpensAndCloses`, `testScreenTour08` 🟡 | `testPhysicalDevicePostPinFlows` 🟡 (12 Kas 3/3 düzeltme sonrası) | Kalıcı gerçek yüzey kilidi + relocalization ⬜; Cloud Anchor/VPS saha ⬜ |
| GF-03 | Keşfet → filtre → sonuç | `MapRequestCoordinatorTests`, `ClientRequestCacheTests` 🟡 | `map-cells`, `metadata-projection` ✅ | `testMapTabLoadsNearbyPosts` 🟡 | ⬜ | — |
| GF-04 | Kamera reddi → recovery | `ARCameraHealthTests` 🟡 | — | `testCameraPermissionDenialOffersSettingsRecovery`, `testScreenTour10a` 🟡 | ⬜ | Fiziksel izin reddet → ver |
| GF-05 | Oluştur → yayınla → Profil | `GifPostTests`, `KlipyTests`, `ArchitectureAndPublishTests` 🟡 | `callables`, `post-admission`, `security`, placement birim ✅ | `testScreenTour07EditorAndGIF` 🟡 | KLIPY canlı ⬜ (`getGifConfig` deploy yok) | Gerçek anahtarla GIF'li post |
| GF-06 | Soğuk açılış → Kamera | `ARCameraHealthTests/testScreensWaitLongerThanTheWholeWatchdogBudget` (yeni, derlenmedi) | — | — | `testPhysicalARTabsTenCyclesKeepCameraHealthy` ❌ ilk tur (12 Kas, düzeltme `b5980be` öncesi) | Düzeltme sonrası 10 tur × 3 |
| GF-07 | Bildirim izni → etkileşim → aktivite | `ReliabilityTests` 🟡 | `push` 16/16, `activity` 6/6 ✅ | — | APNs teslimi ⬜ | Fiziksel APNs matrisi |
| GF-08 | Aktivite okundu → yeniden yükleme | `ReliabilityTests` 🟡 | `activity` ✅ | — | ⬜ | Offline/retry fiziksel |
| GF-09 | Kalıcı silme → reauth | `CallableAuthenticationRecoveryTests` 🟡 | `account-deletion` 10/10, `account-storage-finalize` 3/3 ✅ | — | Gerçek Apple revoke ⬜ | Tek kullanımlık hesapla uçtan uca silme |

## P0/P1 kurallar

| Kural | Kanıt | Durum |
|---|---|---|
| İstemci korunan koleksiyona doğrudan yazamaz | Rules 97/97, `security` 18/18 | ✅ |
| Sunucu otoritesi: post/konum notu yalnız callable | `callables` 18/18, `place-notes` 31/31, `post-admission` 9/9 | ✅ |
| Idempotency / tekrar | `counter-reliability` 11/11, `account-deletion` (eşzamanlı işçi), toplu bildirim tekrar sayfası | ✅ |
| Konum notu eşiği ve gizlilik (uzak yanıtta metin yok) | `location-audit-regressions` 11/11, `anonymity-differential-fix`, `LocationNoteTests` 🟡 | ✅/🟡 |
| Link ve içerik filtresi (functions = admin) | `moderation.test.mjs` (yanlış pozitif örnekleri dahil) | ✅ |
| KLIPY: sunucu yalnız slug + boyut saklar, URL yok | placement birim, `callables` | ✅ |
| KLIPY marka atfı ("Search KLIPY" zorunlu) | `gif-attribution` UI testleri | 🟡 (H betiği bekliyor) |
| Toplu bildirim: izin, kota, kill switch, rol | `campaigns` 13/13 | ✅ |
| Teşhis verisinde kişisel veri yok, opt-out | `DiagnosticsReporterTests` 🟡; canary testi ⬜ | ⬜ (T5) |
| Admin tarayıcı akışları | `browser-operations` 12 test | ⬜ (VM'de Chromium kütüphanesi yok; Mac'te koşulacak) |
| En çok 3 zamanlanmış fonksiyon | `scripts/test` 65/65 + python 40/40 | ✅ |

## Bu commit'te koşulanlar (VM, 12 Kas 2026)

Functions birim 192/192 · Rules 97/97 · Functions emülatör entegrasyonu 26 dosya + notes = 229/229 (her dosya ayrı emülatörde; birlikte koşunca 4 GB VM'de bellek yetmiyor) · cost 29/29 · support 17/17 · Admin tsc ✅, birim 52/52, emülatör entegrasyonu (tarayıcı hariç) 128/128 · l10n 739×12 · secret scan ✅.
