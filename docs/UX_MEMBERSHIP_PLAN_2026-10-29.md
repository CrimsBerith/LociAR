# UX ve üyelik uygulama planı — 29 Ekim 2026

Kullanıcı kararı: uygulamaya girmek için doğrulanmış Apple veya e-posta üyeliği zorunlu. Yeni konum notu ve AR notu varsayılan anonim; kullanıcı isterse kullanıcı adını gösterir. Para desteği gizli kalır.

Önceki uzmanların önerileri aşağıdaki uygulama kapsamına birleştirildi. Bu devam aşamasında yeni agent açılmadı. Başlangıçtaki kullanıcı değişiklikleri korunur; görev başlangıcı kopyaları `build/ux-implementation-20261028/baseline/` altında.

| Alan | Uygulanacak değişiklik | Kabul ölçütü |
|---|---|---|
| Giriş | Hesapsız devam kaldırılır; eski anonim oturum ana uygulamaya alınmaz | Çıkış ve eski misafir oturumlarında sekmeler yok; Apple/e-posta akışı çalışır |
| Paylaşım kimliği | İki oluşturucuda Anonim paylaş açık başlar; kapatınca kullanıcı adı görünür | İstemci seçimi sunucuya iletilir; yazar sunucudan belirlenir |
| Tekrar gönderme | Bir işlem kimliğinin anonimlik seçimi değiştirilemez | Zaman aşımı/tekrar gönderme aynı kimliği korur; sunucu değişikliği reddeder |
| Anonimlik | Anonim not profilde yazarı ifşa etmez; yazar gizleme ve profil engeli bağımsız | Mevcut gizlilik ve engel fark testleri geçer |
| İlk kullanım | Üç kısa adım; üyelik ile anonim yazarlık ayrılır | Çelişen hesapsız kullanım vaadi yok |
| Harita | Konum notu ve AR notu doğrudan iki eylem olarak kalır | Ek seçim menüsü yok; harita atıfları görünür |
| AR yerleştirme | Kısa yönlendirme; tek yaklaşık yerleştirme seçeneği; teknik sayaçlar yalnız Debug tanılamasında | Fiziksel ve yaklaşık yerleştirme birbirinden anlaşılır |
| İçerik oluşturma | Caption yerine Mesajın; kısa yer tutucu; teknik yardımcı açıklama kaldırılır | 220 UTF-16 sınırı, metin ve tek GIF korunur |
| GIF | Kısa hata/boş arama metinleri; tekrar deneme | Powered by GIPHY görünür |
| Not ayrıntısı | Başlık Not; yinelenen profil kartı kaldırılır | Anonim notta profil bağlantısı yok |
| Kaydetme | Tek dokunuşla kaydet; koleksiyon Diğer menüsünde | Sahip olunan notlar da koleksiyona eklenebilir |
| Konum notu AR | İkincil AR eylemi Diğer menüsünde | Yerinde okuma ana akışı önde kalır |
| Güvenlik | Anonim yazarı gizleme ve profil engelleme açıklamaları kısalır | İki işlem arasındaki fark açık kalır |
| Keşfet | Notlarda ara; kısa boş/hata durumları | Arama var olmayan mekân rehberi vaat etmez |
| Profil | Hesap aktif rozeti ve yinelenen bildirim bağlantısı kaldırılır; renkler sadeleşir | Tek Ayarlar girişi; Notlarım terminolojisi |
| Profil düzenleme | Başlık ve alan etiketleri tutarlı; avatarlar okunabilir | Kaydet/Vazgeç ve kullanıcı adı kuralları korunur |
| Ayarlar | Bildirimler, Gizlilik ve veri, Çeviri, Tanılama detay sayfaları | Genel sayfa kısa ve taranabilir |
| Bildirim izni | Sosyal bildirim ile yakındaki not bildirimi ayrı tercihler | Sosyal bildirim açılması konum izni veya yeni yakın not onayı üretmez |
| Gizlilik açıklaması | Kritik veri/hesap ilişkilendirme bilgisi görünür, ayrıntılar açılabilir | Yanıltıcı tamamen anonim veya konum yalnız cihazda iddiası yok |
| Hesap silme | Üye için Kimliğini doğrula; geri alınamaz sonuç açıklaması | Mevcut yeniden doğrulama ve tam silme korunur |
| Liste ve davet | Kısa not terminolojisi; gereksiz boş uyarılar kaldırılır | Hata durumunda tekrar deneme ve davet ihtiyacı açık |
| Görsel dil | Ana vurgu rengi tutarlı; büyük yazı ve küçük ekran kontrolü | Metin kesilmesi/erişilemeyen ana işlem yok |
| Yerelleştirme | 12 dil tabloları güncellenir, katalog araçla üretilir | Catalog check ve release localization kontrolü geçer |

Uygulama sırası: (1) üyelik/sunucu sözleşmesi, (2) metin ve UI, (3) çeviriler, (4) native, Firebase emulator ve UI testleri; değişen ekranların görsel kontrolü.

Kanıt sınırı: yerel kaynak, simülatör ve emulator doğrulanır. Canlı Firebase dağıtımı, gerçek cihaz AR/GPS/APNs ve App Store bu çalışmanın sonucu olarak doğrulanmış sayılmaz. Dağıtım bu görev kapsamında yapılmaz.

Durum: tamamlandı. Xcode 27.1 ile yeniden derleme, 274 native test (2 fiziksel cihaz atlandı), 17 farklı UI testi, 5 farklı gerçek SDK akışı ve 334 backend testi başarılı. 12 dil ve Admin TypeScript kontrolleri geçti. 96 güncel ekran `build/ux-final-20261029/` altında. Ayrıntılar: `docs/release/UX_MEMBERSHIP_VERIFICATION_2026-10-29.md`.
