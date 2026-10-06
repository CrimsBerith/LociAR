# LociAR Premium QA Matrix

Güncel yayın durumu: [RELEASE_READINESS.md](release/RELEASE_READINESS.md).
Yerel emülatör işleri aynı portları kullanır; rules, Functions entegrasyonu ve admin entegrasyonu sırayla çalıştırılır.
Node 22, Java 21 ve iki Node projesinde `npm ci` gerekir.

## Otomatik kapılar

| Kapı | Komut | Kabul |
|---|---|---|
| Proje üretimi | `xcodegen generate` | `LociAR.xcodeproj` hatasız üretilir |
| iOS build + native test + dil UI | Mac'te `bash scripts/ci-ios.sh` | Kilitli SPM, kurulu iPhone simülatörü, native testler ve İngilizce/Arapça RTL auth UI; gerçek hata kodu ve `.xcresult` |
| Functions | `cd functions && npm run typecheck && npm test` | Hata yok |
| Rules | `cd functions && npm run test:rules` | Firestore + Storage rules testleri geçer (Java 21) |
| Callable entegrasyon | `cd functions && npm run test:emulator` | Emulator entegrasyon testleri geçer |
| Kesintiden sonra silme / atomik yayın | Aynı Functions + rules komutları | Silme aşamaları yeniden denenir; Storage/Auth arızasında kilit kalır; ters sıralı sayaçlar, eşzamanlı yoğunluk/kota/anchor, 5000 üzeri korumalı bölge ve yetim dosya devamı geçer |
| Push sunucu sözleşmesi | `cd functions && npm run test:emulator && npm run test:rules` | Token sahipliği/rotasyonu, çıkış/silme, eşzamanlı cihaz sınırı, tek gönderim girişimi ve token/teslimat belgelerine default-deny geçer; gerçek FCM çağrılmaz |
| Aktivite okundu / silme reauth | Aynı Functions emulator + rules komutları; Mac'te `BackendAndPolicyTests` | Gerçek belge kimliği/ilk okuma zamanı korunur, başka alıcı/oturum reddedilir; parola ve Apple reauth `auth_time` yeniler; yeni Apple code eski Firebase oturumunu tek başına geçirmez |
| Admin | `cd admin && npm run typecheck && npm test && npm run build:ci` | Tip/birim ve production build; CI build public Firebase değerleri gerçek oturum açmaz |
| Admin HTTP + işlem entegrasyonu | `cd admin && npm run build:ci && npm run test:emulator` | Gerçek Next HTTP, Auth/Firestore ve Chromium: cookie, origin, MFA claim, rol iptali, RBAC, iki kişi onayı, atomik davet/audit, network retry, metrik offset ve liste sayfalaması |
| Acil kapatma / bölge / rol / MFA | Aynı admin emülatör komutu | Flags/audit atomik, payload değiştirilmiş retry reddedilir, bölge tek kez oluşur, son super admin korunur, MFA değişikliğinde çift audit oluşmaz |
| Moderasyon geri getirme | Functions ve admin emülatör komutları | False positive yorum geri gelir, filtre marker'ı kalkar, eski create delivery geri gelen yorumu silemez; silinen hesap geri oluşmaz |
| Public admin tarayıcı | `cd admin && ADMIN_E2E_PUBLIC_ONLY=1 npm run test:e2e` | Gerçek desktop/mobile Chromium; CI production build'i başlatır; [kurulum](../admin/PLAYWRIGHT.md) |
| Depo secret taraması | `node --test scripts/test/*.test.mjs && bash scripts/qa-secret-scan.sh` | Dokümanlar/testler dahil; parola değerleri çıktıya yazılmadan hata verir |
| Dil kaynak/katalog | `node scripts/check-localization.mjs --release` | UI + izin kataloğu 12 dilde dolu; `%lld`/`%@` tür/sayı uyumu; yeni literal/metin eksikliği ve `needs_review` yayın CI'ını durdurur |
| Üretim bağımlılıkları | `cd functions && npm audit --omit=dev --audit-level=moderate`; `cd admin && npm audit --omit=dev --audit-level=moderate` | Orta ve üzeri açıklar CI'ı durdurur |
| Tam bağımlılık ağacı | `node scripts/check-dependency-audit.mjs functions`; `node scripts/check-dependency-audit.mjs admin` | İki ağaçta da istisna yok; üretim veya geliştirme fark etmeksizin her bulgu CI'ı durdurur |
| Tüm Linux yayın kontrolleri | `bash scripts/firebase-deploy.command --dry-run` | Kilitli kurulum, tip/birim/audit, rules/callable/admin HTTP+Chromium, public tarayıcı, secret ve dil kapıları; başarı kodu yanında tam test özeti ve sıfır fail/skip/cancel zorunlu. Eksik özet/boş koşu da deploy'u durdurur. Dry-run canlı kimlik veya proje kullanmaz |
| Firebase metadata kabulü | `python3 scripts/qa-live-firebase.py --from-report /private/metadata.json` | [Kaydedilmiş rapor şeması](release/FIREBASE_METADATA_READINESS.md); beklenen kaynakların durumları geçer; canlı sorgu yapılmaz |
| Saha kanıtı | `node scripts/qa-field-evidence.mjs /absolute/private/field-evidence.json` | İki cihaz/23 koşu, ölçüm, resolver, zaman, log/video yapısı; içerikler QA tarafından ayrıca incelenir |

CI `ios` işi macOS 26 / Xcode 26.6 kullanır; Linux'taki sonuçlar bu işin geçtiğini göstermez.
Admin emülatöründeki MFA claim fixture'ı gerçek TOTP challenge/üretim JWT imzası doğrulaması değildir.
Public tarayıcı testi ayrıcalıklı canlı oturumun kanıtı değildir; bu iki canlı kapı yayın planında açık tutulur.
Xcode betiklerinin mock testleri native derleme veya fiziksel cihaz testi olarak sayılmaz.

Katalog 583 UI + 3 izin anahtarı içerir. Yeni otomatik taslaklar İngilizce anlam ve AR/sosyal bağlamı ile incelenip
düzeltilmiştir; runtime çeviri servisi kullanılmaz. Anahtarlar Türkçe, mevcut proje development region ve
katalog source language `en` olarak korunur. Çeviriler `scripts/l10n/translations/*.json` tablolarındadır;
`python3 scripts/l10n/build_catalog.py` katalogları bu tablolardan üretir (elle düzenleme yok). `translated` durumu native ekran/a11y kabulünün yerine geçmez.

## Golden flows

| ID | Akış | Kritik durumlar |
|---|---|---|
| GF-01 | Onboarding → Keşfet | Atla, Reduce Motion, kamera/konum izni istemeden keşif |
| GF-02 | Harita → yüzey seç → AR | selected state, izin, hizalama, etkinleştirme |
| GF-03 | Keşfet → filtre → sonuç | üç filtre, sonuç yok, filtre state'i |
| GF-04 | Kamera reddi → recovery | yeniden iste, Ayarlar, Harita alternatifi |
| GF-05 | Oluştur → düzenle → yayınla → Profil | pose yok, gesture alternatifi, pending review |
| GF-06 | Soğuk açılış → Keşfet → Kamera | Açılışta kamera mount/izin yok; yalnız Camera tabı, AR CTA veya kamera deep link'i ile başlar |
| GF-07 | Profil → Bildirim izni → başka hesabın etkileşimi → post/aktivite | İzin reddi/Ayarlar dönüşü, token rotasyonu, ön/arka plan, soğuk açılış, hesap değişimi/çıkış, iki yönlü engelleme, hesap silme; [fiziksel APNs matrisi](PUSH_NOTIFICATIONS.md#testler-ve-cihaz-kabulü) |
| GF-08 | Aktivite → okundu onayı → tekrar yükleme | Sunucu onayı olmadan gösterge kalkmaz; offline/retry, push dokunma, ilk 50 kayıt, eski oturum yanıtı; [kabul matrisi](ACTIVITY_AND_ACCOUNT_DELETION.md#test-ve-yayın-kabulü) |
| GF-09 | Kalıcı silme → Apple/parola reauth → silme | Eski oturum, yanlış parola, iptal, Apple revocation hatası, hesap değişimi, büyük hesap, nonce/ID token yenileme; gerçek Apple akışı fiziksel cihazda |

## Screenshot matrisi

- iPhone SE sınıfı küçük ekran
- iPhone Pro Max sınıfı büyük ekran
- iPhone portrait (small ve Pro Max)
- Light, dark, büyük font, uzun İngilizce metin
- 12 dilde gerçek bundle seçimi, izin açıklamaları; Arapça RTL'de tab/focus ve sayı/URL yönü
- Loading, empty, error, offline, permission-denied

## Manuel erişilebilirlik

- VoiceOver focus/okuma sırası
- Dynamic Type
- Reduce Motion/Transparency
- Differentiate Without Color / yüksek kontrast
- Kamera üzerinde güneş ışığı okunabilirliği

## Yayın kararı

Fiziksel cihaz AR, screen-reader ve büyük font kanıtları kaydedilmeden sürüm `premium-ready` sayılmaz.
Push için ayrıca fiziksel iPhone ve TestFlight APNs teslimi/oturum değişimi kanıtları gerekir.
