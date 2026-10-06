# Admin içerik işlemleri ve veri geçişi

5 Ekim 2026. Bu çalışma yalnız yerel kod ve emülatörlerde yapıldı. Canlı Firebase'e dağıtılmadı.

## Panelde kullanılabilen işlemler

`super_admin`, **Users → Create content user** üzerinden benzersiz handle ve görünen adla
bir içerik hesabı oluşturabilir. İsteğe bağlı e-posta doğrulanmış kabul edilmez; Firebase Auth
kimliği oluşturulur fakat giriş kapalıdır. Hesaba admin rolü verilmez. Gerçek bir kişinin
uygulamada oturum açması için mevcut normal kullanıcı davet akışı kullanılmalıdır.

**Posts → Create post** ekranında mevcut kullanıcı handle/UUID ile seçilir. Koordinat seçici veya
latitude/longitude alanlarıyla yer, metin/sosyal bağlantı, renk, ölçek, dönüş, opaklık, fiziksel
boyut, yön, yükseklik, görünürlük ve yaş derecesi düzenlenir. Desteklenen bağlantılar Spotify,
YouTube, Instagram, X ve Facebook'tur. Cihaz fotoğraf/video postları kapalıdır. Önizleme tek metin
katmanı içindir; mevcut çok katmanlı tasarımı bu düzenleyiciyle kaydetmek önizleme ile değiştirir.

Panelden yerleştirme **yaklaşık AR konumu** üretir. Dünya haritası veya Cloud Anchor üretilmiş
gibi gösterilmez; fiziksel yüzeye kesin kilit için konumda iPhone taraması gerekir. Fiziksel
postun konumunu/boyutunu değiştirmek açık onay ister ve eski anchor silme kuyruğuna alınır.

Korumalı bölgede yayın için `zones.override` yetkisi ve ayrı istisna gerekçesi gerekir. Bölge
kimlikleri, gerekçe ve işlemi yapan admin kaydedilir. **18+ engeli admin için de geçerlidir.**
Mobil kullanıcılar korumalı bölge engelini atlayamaz. Varsayılan yayın durumu `pending_review`;
yetkili admin doğrudan `active` seçebilir.

Post detayında kullanıcı seçilerek yorum açılır; yorumlar düzenlenir veya silinir. Görünen yazar
seçilen kullanıcıdır; admin ayrı audit aktörüdür. Yazar değiştirilmez. Silinmiş/askıdaki hesaplar,
aktif olmayan postlar ve iki yönlü kullanıcı engelleri yorum işlemlerini durdurur.
`trust_safety_admin` mevcut moderasyon yetkilerini korur; yeni kullanıcı/posta kullanıcı adına
oluşturma yetkileri `super_admin` ile sınırlıdır.

## Güvenilirlik ve saklama

İşlem anahtarı aktöre, hedefe, içeriğe ve gerekçeye bağlanır. Aynı istek tekrarında aynı kayıt
kullanılır; aynı anahtarla farklı içerik 409 verir. Büyük metrik değişiklikleri ikinci admin onayı
ister. Onay isteği ve audit atomiktir. Rol ve hesap durumu yeni içerik transaction'larında tekrar
kontrol edilir. Mobil yayın kuyruğu, yanıt kaybından sonra `own_receipt` ile sahibine bağlı
yayın sonucunu okur; tamamlanmış post için dünya haritasını tekrar yüklemez.

Filtrelenmiş yorum/profil geri yükleme yalnız sunucu kökenli `moderation_originals` arşivini
kullanır. İstemci raporundaki metin veya yazar güvenilir orijinal sayılmaz. Eski, arşivi olmayan
filtre kayıtları otomatik olarak geri getirilemez; manuel inceleme gerekir.

`avatar_screenings` ve `moderation_originals` 90 günlük TTL, `admin_audit_log` 180 günlük TTL
kullanır. Avatar silme işleri 5 dakikalık sınırlı worker ile denenir. Anchor tombstone'u yeniden
bağlamayı önler ve silinen hesabın `owner_luid` alanı kaldırılır. Kritik Firestore/Storage
olayları yeniden denenebilir; yinelenen olaylar işlem kayıtlarıyla korunur.

## Canlı geçiş — daha sonra yetkili Firebase oturumunda

Adım adım uygulanacak sıra: [`LIVE_MIGRATION_RUNBOOK.md`](LIVE_MIGRATION_RUNBOOK.md).

Bu bölüm yürütülmedi. Kurallar, yeni Functions, admin ve mobil sürüm birlikte planlanmalıdır.
`createPost`/`updateHandle` artık hedef `userId` ister. Public Firestore listeleri kapanır;
mobil public okumaları `readPublicContent` kullanır. Eski istemci sürümleri bu yeni kurallarla
uyumlu değildir; zorunlu sürüm geçişi/bakım penceresi ve geri dönüş planı olmadan uygulanmaz.

1. iOS adayını macOS/Xcode'da derle; yeni public okuma/sayfalama, hesap değiştirme, hesap silme,
   avatar ve sınırlandırılmış world map decode testlerini simülatör ve cihazda kabul et.
2. Canlı TTL/indeksleri ve yeni Functions/Scheduler'ı hazırla. `account_access` kayıtlarını
   mevcut hesaplar için önceki hesap silme geçiş planıyla doğrula.
3. Eski postların world map erişim aynasını ve eski kalıcı dosya tokenlarını incele:

   ```sh
   node scripts/world-map-security-migration.mjs --project lociar-2f38c
   ```

   Varsayılan salt okunur incelemedir; 20 sayfa ile sınırlıdır. Sonuçtaki `nextPost` ve
   `nextObject` doluysa `--post-cursor` ve `--object-cursor` ile devam et. Tüm sayfalar biterken
   ilgili cursor `null` olur. Bu cursor'lar dosya adları içerir; yalnız operasyon kaydında tut.
4. İnceleme kabul edildikten sonra **aynı yetkili oturumda**, `--apply` ekleyerek uygula ve kalan
   cursor'larla tamamla. Bu işlem yalnız erişim aynasını/world_map_path'i günceller ve dünya
   haritası nesnelerindeki kalıcı Firebase tokenlarını tam Storage generation koşuluyla kaldırır.
   Hesap silme/reclamation kayıtları korunur. Geçiş bitmeden eski bearer URL'leri iptal olmuş
   sayılmaz. Yeni finalize tetikleyicisi geçmiş dosyaları kendiliğinden taramaz.
5. Mobil/admin sürümü ve sıkı Firestore/Storage kurallarını koordineli devreye al. Özel/silinmiş/
   18+ post haritası okumasının ve eski tokenların reddini gerçek Firebase'de doğrula.

Bu aday için Linux kontrolleri fiziksel AR, gerçek TOTP/App Check, Apple revoke, Vision,
APNs, IAM veya App Store kabulünün yerine geçmez.
