# LociAR çalışma panosu

Güncelleme: 5 Ekim 2026. Güncel kapsam native iOS + Firebase + Next.js App Hosting'dir.
Önceki çalışma panosu Git geçmişinde korunur; geçmiş test sonuçları bu adayın yayın onayı değildir.

Tek güncel yayın planı: [docs/release/RELEASE_READINESS.md](docs/release/RELEASE_READINESS.md).
Kod kuralları: [AGENTS.md](AGENTS.md). Test komutları: [docs/QA_MATRIX.md](docs/QA_MATRIX.md).

| İş | Durum | Kabul / sonraki adım |
|---|---|---|
| Rules, moderasyon, sayaç idempotency | Kod ve yerel testler tamamlandı | Güncel CI sonuçlarını aday commit'e bağla |
| Kesintiden sonra hesap silme / atomik post kabulü | Kalıcı iş, erişim engeli, mekânsal kilit ve kota transaction'ı hazır | Canlı backfill + kurallar + Functions/Scheduler geçiş sırasını uygula |
| Korumalı bölgeler / yetim AR dosyaları | Tam sayfalama, kalıcı tarama cursor'u ve reclamation işi hazır | Aday cleanup/Storage dağıtımı; gerçek hacimde maliyet/gecikme takibi |
| Admin davet, formlar, listeler / mobil yorumlar | Atomik audit, normal kullanıcı callback'i, ağ retry ve cursor sayfalama hazır | CI Chromium sonuçları; mobil ekran ve yeni indeks kabulü |
| Linux preflight / günlük audit / metadata validator | Dry-run tüm yerel kapıları çalıştırır; offline metadata fixture'ları hazır | CI aday commit; canlı metadata kabulü ayrıca gerekir |
| Admin oturum, MFA claim, RBAC, origin, onay, rate limit | Gerçek HTTP/emülatör testleri geçti | Canlı TOTP girişini ayrıca doğrula |
| Push, aktivite okundu, hesap silme reauth | Kod ve backend testleri tamamlandı | İmzalı iPhone/TestFlight üzerinde Apple ve APNs kabulü |
| 12 dil, AR kopyası, izin açıklamaları | Katalog ve kaynak kontrolleri geçti | macOS derleme, RTL, VoiceOver ve büyük font kabulü |
| macOS ve public tarayıcı CI | İşler hazır; tarayıcı testleri yerelde geçti | macOS işini aday kaynaklarla çalıştır |
| Bağımlılık güvenliği | Admin ve Functions tam ağaç temiz; CLI chokidar 4 override'ı braces açığını kapattı (6 Ekim) | Upstream CLI chokidar 4'e geçince override kaldırılır |
| Canlı credential yenileme | Güvenli yardımcı ve emülatör kanıtı hazır | Yetkili GCP kimliğiyle eski parolaları geçersiz kıl |
| Fiziksel AR matrisi | Kanıt şablonu ve doğrulayıcı hazır | İki iPhone üzerinde 23 koşu + log/video |
| Canlı altyapı ve yayın | Bu oturumda doğrulanmadı | Release planındaki canlı kapıları kapat |

Yayın sorumlusu, yayın planındaki açık kapılar kapanmadan bu panoyu tamamlanmış yayın olarak işaretlemez.

## Claude dalı ile bütünleştirme — 4 Ekim 2026

`claude/busy-franklin-ugxjsg` (`77110fa`) dalındaki 5 commit / 81 dosya karşılaştırıldı.
Mevcut çalışma ağacı yedeklendi; kalıcı hesap silme, atomik yayın, kaynak sayaçları,
sayfalama ve oturum güvenli push korundu. Uyumlu ayar/Crashlytics, yasal sayfa,
nonce CSP, bölge/rol yönetimi ve operasyon ekleri uyarlandı. Flags/audit ve MFA
state/audit tek transaction; yeni mutation receipt'leri aktör/hedef/payload'a bağlı.
False positive yorumda eski delivery ve filtre marker'ı ele alındı. Native accepted
deletion yanıt eşlemesi düzeltildi. Canlı deploy yapılmadı; native build bekleniyor.

4 Ekim doğrulaması: 18 yerel preflight kapısı ve 357 farklı test geçti; 0 fail/skip.
Son MFA temizleme ekinden sonra 10 silme entegrasyonu ve Functions birim/tip kapısı;
son log düzenlemesinden sonra admin tip/birim/production build ayrıca geçti.
586 UI/izin anahtarı 12 dilde tamam; canlı ve native kabul açık.

## Yerel yayın kontrolleri — 5 Ekim 2026

Pub/Sub tüketicisine özel OpenTelemetry core 2.11.0 yaması iki moderate bulguyu kapattı;
eski OpenTelemetry istisnası kaldırıldı. 6 Ekim: braces/chokidar/CLI zinciri chokidar 4 override'ı ile
kapandı; glob ignore farkının etkisi ve testi `docs/DEPENDENCY_SECURITY.md`'de.
Preflight, başarı kodunun yanında tamamlanmış ve tüm testleri geçen Node/Playwright özeti
ister; boş, kesilmiş, skip/cancel içeren koşu deploy'u durdurur.

Son tam koşu: **18 kapı, 367 test, 0 fail/cancel/skip**. İlk koşudaki admin onay tarayıcı
zaman aşımı başarılı sayılmadı; izolasyon, altı tarayıcı akışı ve son tam 47/47 entegrasyon geçti.
İlk timeout'un nedeni kesinleşmedi; akış/aşama ve trace kayıtlarıyla tekrarında incelenmelidir.
Commit/push/deploy yapılmadı. Native/cihaz ve canlı Firebase kapıları açık.

## Derin tarama ve admin içerik paketi — 5 Ekim

24 bulgunun kod düzeltmeleri; kullanıcı seçerek post/yorum oluşturma, metin/yerleştirme
düzenleme, yorum silme ve yönetilen kullanıcı oluşturma eklendi. Korumalı bölgede gerekçeli
admin istisnası var; 18+ kapalı. [İşlemler ve koordineli geçiş](docs/release/ADMIN_CONTENT_OPERATIONS.md).
Tam Linux preflight geçti: **18 kapı, 398 test, 0 fail/cancel/skip**; yeni regresyonlar ve gerçek Chromium akışı dahil. Canlı geçiş
betiği varsayılan salt okunur; bu oturumda canlı çalıştırılmadı. Native derleme/cihaz kapıları açıktır.
