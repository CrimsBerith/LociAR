# LociAR Screen Specifications

## Harita

- Ana amaç: Kullanıcının şehirdeki bir AR yüzeyini seçmesi.
- Giriş: uygulama açılışı, Profil/Keşfet dönüşü.
- Ana CTA: seçili yüzeyi `AR'da aç`.
- Durumlar: konum bekliyor, izin verilmiş, izin reddedilmiş, yüzey yok, seçili yüzey.
- Konum reddinde harita ve arama çalışır; Ayarlar recovery'si görünür.
- Kabul: seçili pin yalnız renkle ayrılmaz; seçili yüzey bilgisi screen reader tarafından tek anlamlı grup olarak okunur.

## Keşfet

- Ana amaç: yayındaki postları listelemek ve aramak (kişi, yer veya içerik).
- Düz liste + arama kutusu (`.searchable`); filtre veya editorial öne çıkarma yok.
- Durumlar: dolu, sonuç yok, yükleniyor/yenileniyor, hata (Tekrar dene).
- Kabul: boş durum aramayı veya yeni postları anlamlı biçimde açıklar.

## AR Kamera

- Ana amaç: Yüzeye hizalanıp içeriği etkinleştirmek.
- Kilit öncesi: geri, tek ARStatus ve hizalama/proximity göstergesi.
- Kilit sonrası: yüzey içeriği, caption/meta ve alt playback/social kontroller.
- Durum önceliği: güvenlik → pil → tracking → hazır.
- Kamera izni otomatik istenmez; fayda açıklaması sonrası kullanıcı CTA'sı ile istenir.
- Kamera yalnız ekran odaktayken aktiftir.
- Kabul: izin reddinde Ayarlar ve Harita alternatifi; büyük fontta CTA kaybolmaz.

## Oluştur

- Adımlar: Sabitle (merkez nişangâh, "Yüzeye sabitle" veya açıkça "Önüme yerleştir · 0,8 m") → İçerik ekle
  (metin ve/veya Spotify, YouTube, Instagram, X, Facebook bağlantısı) → "Yüzeyde yayınla".
- Sabitleme kaydı: Geospatial etiketi, Google Cloud Anchor, olmazsa ARKit dünya haritası (`PinCommitCoordinator`).
- Katman, fotoğraf/video veya z-order yok (29 Eyl 2026'da kaldırıldı).
- Yayınla CTA'sı içerik yokken veya kayıt sürerken disabled kalır; çift dokunma aynı post id'sini gönderir.
- İlk başarılı yayından sonra bildirim izni istenir.

## Onboarding

- Üç değer anlatımı: Haritada keşfet, AR'da hizala, kendi yüzeyini oluştur.
- Emoji yerine ürün yüzeylerini temsil eden görsel kompozisyon kullanır.
- Son CTA `Başlayalım`; izinler onboarding içinde istenmez.

## Uygulama Açılışı

- Varsayılan sekme `Harita`dır; AR kamera başlangıç rotası değildir.
- Kamera ve konum oturumu onboarding veya açılış sırasında başlatılmaz.
- Kamera yalnız AR / Paylaş sekmesine, `AR'da aç` CTA'sına veya `lociar://post/<id>` bağlantısına gidilince açılır.
- Giriş zorunludur (e-posta+şifre veya Apple); gizlilik/topluluk kuralları onay kutusu işaretlenmeden giriş yapılamaz.
- Google AR bildirimi ilk AR ekranında gösterilir; kabul edilmeden ARCore çalışmaz.

## Profil

- Ana amaç: kimlik, içerikler ve hesap tercihlerini yönetmek.
- Tema: koyu (zorunlu).
- Ayarlar: bildirim izni durumu ve çökme raporları anahtarı (`AppSettingsView`).
- Owner/moderasyon işlemleri uygulamada değil, admin web panelindedir.
- Hesap silme açık, kalıcı ve onaylı destructive akıştır; önce yeniden kimlik doğrulanır (Apple veya şifre).
