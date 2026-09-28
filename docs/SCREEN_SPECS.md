# LociAR Screen Specifications

## Harita

- Ana amaç: Kullanıcının şehirdeki bir AR yüzeyini seçmesi.
- Giriş: uygulama açılışı, Profil/Keşfet dönüşü.
- Ana CTA: seçili yüzeyi `AR'da aç`.
- Durumlar: konum bekliyor, izin verilmiş, izin reddedilmiş, yüzey yok, seçili yüzey.
- Konum reddinde harita ve arama çalışır; Ayarlar recovery'si görünür.
- Kabul: seçili pin yalnız renkle ayrılmaz; seçili yüzey bilgisi screen reader tarafından tek anlamlı grup olarak okunur.

## Keşfet

- Ana amaç: Kullanıcının neden önerildiğini anlayarak içerik seçmesi.
- Filtreler: Yakındakiler, Popüler, Yeni.
- İlk sonuç editorial feature; devamı kompakt ve taranabilir satırdır.
- Durumlar: dolu, sonuç yok, yükleniyor/yenileniyor, offline/cached, hata.
- Kabul: filtre state'i okunur; empty state filtreyi/haritayı/oluşturmayı anlamlı biçimde önerir.

## AR Kamera

- Ana amaç: Yüzeye hizalanıp içeriği etkinleştirmek.
- Kilit öncesi: geri, tek ARStatus ve hizalama/proximity göstergesi.
- Kilit sonrası: yüzey içeriği, caption/meta ve alt playback/social kontroller.
- Durum önceliği: güvenlik → pil → tracking → hazır.
- Kamera izni otomatik istenmez; fayda açıklaması sonrası kullanıcı CTA'sı ile istenir.
- Kamera yalnız ekran odaktayken aktiftir.
- Kabul: izin reddinde Ayarlar ve Harita alternatifi; büyük fontta CTA kaybolmaz.

## Oluştur

- Ana amaçlar ayrı progressive adımlardır: Sabitle → İçerik → Yerleştir → Yayınla.
- Yalnız aktif adımın araçları alt sheet içinde görünür.
- Gesture'lara silme, öne alma, katman seçme ve z-order buton alternatifleri vardır.
- Yayınla CTA'sı pose ve reference frame olmadan disabled kalır ve nedenini açıklar.

## Onboarding

- Üç değer anlatımı: Haritada keşfet, AR'da hizala, kendi yüzeyini oluştur.
- Emoji yerine ürün yüzeylerini temsil eden görsel kompozisyon kullanır.
- Son CTA `Keşfetmeye başla`; izinler onboarding içinde istenmez ve hedef izin gerektirmeyen Keşfet ekranıdır.

## Uygulama Açılışı

- Normal soğuk/sıcak açılışın ana hedefi `Keşfet`tir; AR Kamera başlangıç rotası değildir.
- Kamera ve konum oturumu onboarding, bootstrap veya Keşfet mount edilirken başlatılmaz.
- Kamera yalnız kullanıcının Camera sekmesine, `View in AR` CTA'sına veya `lociar://camera` bağlantısına açıkça gitmesiyle mount edilir.
- Store-like yapılarda ilk açılış misafir kimliğiyle başlar; mock kullanıcı ve Los Angeles seed kataloğu gösterilmez.

## Profil

- Ana amaç: kimlik, içerikler ve hesap tercihlerini yönetmek.
- Tema tercihi: Sistem/Açık/Koyu.
- Owner operasyonları görünür tab değildir; Profil içinden açılır.
- Hesap silme açık, kalıcı ve onaylı destructive akıştır.
