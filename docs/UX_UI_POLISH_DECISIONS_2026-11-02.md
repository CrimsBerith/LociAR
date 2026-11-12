# LociAR — kullanıcı dili ve UI polish kararları

**Tarih:** 2 Kasım 2026. **Durum:** tasarım ve uygulama planı; uygulama kodu değiştirilmedi.

## Seçilen yön

**Koyu lacivert, mevcut mint vurgu, daha kompakt not kartları ve okunaklı yüzeyler.** Mekânsal karakter korunacak. Cam; native sekme çubuğu, harita/kamera kontrolleri ve ilgili yüzen yüzeylerde kullanılacak. Uzun metin ve form içeriği daha opak zemin üzerinde okunacak.

İlk öncelik geometri ve durum tutarlılığı. Renk değişikliği, uzayan rozetleri, üst üste gelen sayfalama alanını veya yanlış hata anlatımını çözmüş sayılmayacak. Mevcut iyi native davranışlar ve ortak bileşenler geliştirilecek.

## Kanıt ve bağımsız inceleme

- Baz çizgisi: [44 fiziksel cihaz PNG’si](../build/visual-baseline-2026-11-02-iphone/index.html); iPhone 14 Pro Max, iOS 27.0.1, Türkçe/koyu görünüm, 1290×2796.
- Üç bağımsız alt inceleme: [kullanıcı dili](../build/visual-baseline-2026-11-02-iphone/polish-language.md), [görsel sistem](../build/visual-baseline-2026-11-02-iphone/polish-visual.md), [akış ve yerleşim](../build/visual-baseline-2026-11-02-iphone/polish-flows.md). Her rapor doğrudan açtığı PNG’leri belirtir; 44 dosyanın her ayrıntısının eksiksiz denetlendiği iddia edilmez.
- Ana ajan, kritik 005/007/013/021/028/041/042 görüntülerini bağımsız açarak bulguları karşılaştırdı. Mevcut SwiftUI kaynakları, Graphify ile bulunan bileşenlerin gerçek dosyalarından kontrol edildi.
- Kurulu uygulamanın mevcut çalışma ağacıyla aynı derleme olduğu doğrulanmadı. Kaynak hedefleri olası uygulama yerlerini gösterir; binary eşitliği veya kesin hata nedeni değildir.
- **Kayıt düzeltmeleri:** 028 yeniden deneme sonrası dolu Keşfet listesidir; 042 GPS bulunmuş, ±8 m doğruluk gösterir; 021 ham `UNAUTHENTICATED` içerir. Baz çizgisi README/manifest/galeri kapsam açıklamaları düzeltildi. PNG baytları ve dosya adları korundu.

## Uygulama kararları

P1: okunabilirlik, yerleşim veya doğru durum anlatımı. P2: görsel/dil tutarlılığı ve gezinme iyileştirmesi. Bunlar bu planın sıralamasıdır; güvenlik açığı sınıflandırması değildir.

| Öncelik | Gerçek kanıt | Karar | Kabul ölçütü |
|---|---|---|---|
| P1 | [007](../build/visual-baseline-2026-11-02-iphone/007-my-posts.png), [028](../build/visual-baseline-2026-11-02-iphone/028-discover-retry.png): not türü rozeti dikey uzamış, etiketi kaybolmuş. | Avatar + kullanıcı adı/tarih + içerik boyutunda tür rozeti. Normal metinde yaklaşık 28–32 pt rozet yüksekliği; büyük yazıda ikinci satıra geçebilir. Kart yüksekliği içeriğe göre oluşur. | Konum notu/AR türü ad ve ikonla okunur. Aynı kart bağımsız, List ve NavigationLink içinde karşılaştırılır. Sabit yükseklikle metin kırpılmaz. Label stili mirası aday nedendir; yeniden üretmeden kesin neden sayılmaz. |
| P1 | 028: büyük gri “Daha fazla göster” alanı alt kart ve sekme çubuğuyla yarışıyor. | Sayfalama listenin son satırı olur. Yeni sayfa yüklenirken mevcut notlar kalır; aynı aksiyonda ilerleme durumu gösterilir. | Son kartın metrikleri ve sayfalama tamamen görünür konuma kaydırılır. Tek isteğin çoğaltılmadığı ve son sayfa/hata/yeniden deneme davranışı doğrulanır. |
| P1 | [027](../build/visual-baseline-2026-11-02-iphone/027-discover-error.png): hata ve boş liste dili birlikte. [021](../build/visual-baseline-2026-11-02-iphone/021-invite.png): ham teknik hata. | Yükleniyor, başarılı boş, arama sonucu yok, yüklenemedi ve yetki/oturum hatası ayrı sunulur. Ham kod yerelleştirilmiş ürün mesajına çevrilir. | Başlık/açıklama çelişmez. Davet kodu girişi hatada kaybolmaz. Pasif yükleme hatası zorunlu çıkış veya guest fallback yaratmaz. Hatanın auth/ağ/servis sınıfı gerçek türünden belirlenir. |
| P1 | [040](../build/visual-baseline-2026-11-02-iphone/040-gif-post-detail-half.png), [041](../build/visual-baseline-2026-11-02-iphone/041-post-comments-anonymous-warning.png): yarım panelde içerik ve yorum aksiyonları parçalı. | Harita grubu medium açılır; nota girilince large detent seçilir. Tek içerik akışı, kompakt başlık, GIF oranı korunur. Yorum odakta yazma alanı klavyenin üzerinde kalır; AR CTA aynı alana sıkıştırılmaz. | Not, GIF, yorum ve önemli uyarılar küçük ekran/büyük yazıda erişilebilir. Büyük panel on-site erişim sağlamaz; konum/scene değişiminde mevcut erişim iptali korunur. |
| P1 | [033](../build/visual-baseline-2026-11-02-iphone/033-ar-create-preparing.png), [034](../build/visual-baseline-2026-11-02-iphone/034-ar-create-limited.png): yükleme/reticle ve oturum ifadeleri çelişiyor. | Tek ana durum: kamera açılıyor / çevre taranıyor / yüzey hazır / yaklaşık yerleştirme / işlem durdu. Hazır olmayan eylem gerçekten pasif ve gerekçesi yakında görünür. Tek yönlendirme kartı; uygulanabilir yeniden deneme/kapat yolu. | UI gerçek session state’inden türetilir. Yaklaşık konum, fiziksel yüzey sabitlemesi gibi sunulmaz. Kamera siyahlığı metin/renkle çözülmüş sayılmaz. |
| P2 | [035](../build/visual-baseline-2026-11-02-iphone/035-location-note-editor-top.png)–[038](../build/visual-baseline-2026-11-02-iphone/038-location-pin-manual.png): konum araçları yazma görevini ve paylaşmayı aşağı itiyor. | Kompakt konum özeti → not metni → yazar görünürlüğü. Elle/kamera düzeltme ikincil araçlar. Tek belirgin “Notu paylaş” düğmesi güvenli alt alanda; yaklaşık 160–200 pt başlangıç haritası, gerektiğinde genişleyen düzeltme. | 220 karakter sayacı, izin/konum engeli ve anonimlik açıklaması okunur. Klavye açılınca not ve paylaşma erişilebilir. 12 m düzeltme, fresh fix ve server kontrolleri aynen kalır. |
| P2 | Profil/ayarlar gri grup; not kartları mavi-siyah; davet ekranı siyah liste satırları. | Native List/Form korunarak semantik yüzey ve metin tokenları ortaklaştırılır. Gereksiz nested kart, gölge ve çerçeve kaldırılır. | Davet, profil, ayarlar ve not kartları aynı yüzey ailesinde görünür; native satır, anahtar, VoiceOver davranışı korunur. |
| P2 | Haritadaki Konum notu eylemi başlığa benziyor; Paylaş sekmesi doğrudan AR’a giriyor. | Beş sekme korunur. İkinci uygulama diliminde Paylaş girişinde “Konum notu — Kamera gerekmez” ve “AR notu — Kamerayla yüzeye yerleştir” seçenekleri sunulur. | Girişte gereksiz kamera izni/AR oturumu başlamaz. İki tür mevcut gerçek akışlara gider. Yeni giriş ekranı ayrı gezinme değişikliği olarak doğrulanır. |
| P2 | Boş koleksiyon seçici çıkış dışında yol göstermiyor; çeviri kullanılamıyor ve yorum yenileme metinleri içerikle yarışıyor. | Koleksiyon seçicide açık kullanıcı eylemiyle oluşturma yolu. Çeviri sorunu çeviri seçeneği/isteği bağlamında. Yorum başlığında tek yenileme eylemi. | İlk kaydetme tek dokunuş, koleksiyon seçimi Diğer altında kalır. Desteklenmeyen çeviri orijinali korur. Otomatik ek ağ isteği veya veri mutasyonu eklenmez. |

Native cam başlık/sekme çubuğunun altından kaydırılmış içeriğin görünmesi tek başına yerleşim hatası değildir. Hata ölçütü son içerik/aksiyonun bar üstünde tamamen erişilebilir olamaması veya okunamaz/üst üste kalmasıdır. Otomatik sabit alt padding veya özel sekme çubuğu yazılmayacak.

## Görsel sistem

Koyu görünüm hedefleri; bunlar mevcut ekranlardan ölçülmüş renkler değildir. Mevcut mint korunur. Harita yoğunluk renkleri bu genel paletten bağımsızdır.

| Semantik rol | Hedef | Kullanım |
|---|---|---|
| Arka plan | `#0B1118` | Ana zemin, çok hafif mekânsal vurgu. |
| Yüzey | `#121C28` | Okuma kartları ve ayar grupları. |
| Yükseltilmiş yüzey | `#1A2837` | Yüzen panel ve ikincil kontrol. |
| Alan | `#213248` | Metin girişleri. |
| Mint | `#38E0B8` | Ana eylem, seçim, açık anahtar. |
| Mint üstü metin | `#05251D` | Dolgulu ana düğme. |
| Ana / ikincil / üçüncül metin | `#F3F6F8` / `#B8C3CC` / `#93A2B0` | İçerik / açıklama / tarih. Kritik gizlilik metni üçüncül renge itilmez. |
| Uyarı / tehlike | `#FFC16B` / `#FF7C83` | Gerekçeli uyarı / yıkıcı işlem. Yalnız renk ile anlam verilmez. |
| Ayırıcı | `#2C3C4C` | Gerekli sınır/ayırıcı; her yüzeye çerçeve eklenmez. |

Opak sRGB hesapları: ana metin/yüzey **15,83:1**, ikincil/yüzey **9,58:1**, üçüncül/yükseltilmiş yüzey **5,73:1**, mint üstü metin/mint **9,72:1**. [Hesap kaydı](../build/visual-baseline-2026-11-02-iphone/polish-proposed-contrast.json). Bunlar blur, alfa, fotoğraf/GIF veya harita üstündeki gerçek bileşik kontrastın ölçümü değildir. Normal metin için proje hedefi en az 4,5:1; gerçek materyal üzerinde ayrıca doğrulanacak.

- Sistem fontları ve Dynamic Type. Not metni `.body` (normal boyutta yaklaşık 17 pt), açıklama `.subheadline` (15 pt), ikincil kısa bilgi `.footnote` (13 pt). Kritik uyarı/eylem `.caption2` ile küçültülmez.
- Mevcut **4/8/12/16/24** boşluk ölçeği korunur; gerekirse 32 pt bölüm aralığı eklenir. Kart içi 16, kart arası 12, bölüm arası 24 pt başlangıç hedefidir.
- Mevcut **12/16/20** radius dili korunur: alan / düğme / ana kart. Native sheet ve sekme çubuğu özel köşe maskesiyle yeniden çizilmez.
- Mevcut 50 pt minimum ana düğme korunur; ikincil yaklaşık 46–48 pt, ikon etkin hedefi en az 44×44 pt. Bunlar yazı büyüdüğünde artabilen minimumlardır.
- Bir görev alanında tek baskın dolu mint CTA. Sayaçlar nötr; sıfır beğeni pembe/kırmızı vurgu taşımamalı. Kullanıcının gerçekten beğendiği durum mevcut semantik renk ve ikonla ayrılabilir.
- Reduce Transparency için opak, Reduce Motion için hareket azaltılmış karşılık. Cam altında kaybolan metin daha fazla blur ile çözülmez.

## Kullanıcı dili sözlüğü

Kısa, tekil ve doğrudan hitap. İçerik **not**, türler **Konum notu / AR notu**, görünen hesap alanı **kullanıcı adı**. Sosyal olaylar **Hareketler**, teslimat/izin ayarı **Bildirimler**.

| Mevcut | Seçilen karşılık | Koşul |
|---|---|---|
| Henüz not yok + Notlar yüklenemedi | **Notlar yüklenemedi** · Bir süre sonra tekrar dene. · **Tekrar dene** | Hata durumunda. Başarılı boş listede “Henüz not yok”; arama boşsa “Sonuç bulunamadı”. |
| UNAUTHENTICATED | **Davet kodları yüklenemedi** · Oturumun doğrulanamadı. Tekrar dene. | Gerçek auth türü doğrulanmışsa. Genel hatada “Bir süre sonra tekrar dene.” Kod kullanma işlemi ayrı hata başlığı taşır. |
| Aktivite | **Hareketler** | Profil satırı ve sayfa adı birlikte. Boş durum: “Henüz etkileşim yok”. |
| Pini elle ayarla | **Konumu elle ayarla** | İşlev ve 12 m sınırı değişmez. |
| Kamerayla hassaslaştır | **Kamerayla konumu iyileştir** | İsteğe bağlı araç; başarı garantisi verilmez. |
| Burada paylaş | **Notu paylaş** | Form bağlamında tek yayımlama CTA’sı. |
| Yeni yorumları yenile | **Yorumları yenile** | Başlık yanında ikincil eylem. |
| Adın diğer kullanıcılara görünmez. Notun ve konumu hemen paylaşılır. | **Kullanıcı adın diğer kullanıcılara görünmez. Notunun konumu görünür.** | Anonim form açıklaması; form açıldığında paylaşılmış gibi konuşmaz. |
| Bu not anonim | **Yorumun kullanıcı adınla görünür** | Yalnız kendi anonim notuna yorum yapma uyarısının başlığı. |
| Buraya yazacağın yorum @… adınla görünür… | **Yorumu paylaşırsan @… kullanıcı adın görünür ve bu notun sana ait olduğu anlaşılır.** | Gönderim öncesi ayrı onay korunur; taslak yazmakla yayımlamak ayrılır. |
| Nokta atışı | **Yaklaşık konum** veya gerçek duruma uygun yüzey/yön ifadesi | Yaklaşık yerleştirmede hassasiyet vaadi verilmez. |
| Konum hassaslaşıyor · ±… m | **Konum doğruluğu: ±… m** | Ölçüm. Hazırlık durumunun gerekiyorsa ayrı kısa açıklaması olur. |

Anonimlik, diğer kullanıcılara yazar adının gösterilmemesidir; backend’in yazarı tanıyamadığı veya konumun gizlendiği vaat edilmez. Profil engeli ve anonim yazarın notlarını gizleme ayrı kalır. Google AR bildirimi, veri paylaşımı alıcısı/ilişkilendirme açıklaması ve gerekli iOS izin adları kısaltma uğruna kaybolmaz.

## Kaynak hedefleri

1. `LociAR/DesignSystem/LociTheme.swift`: semantik renkler, status pill, kart/düğme/notice/empty-error varyantları.
2. `LociAR/Features/Social/SocialComponents.swift`: PostCard başlığı, tür rozeti, metrikler.
3. `LociAR/Features/Social/DiscoverView.swift`, `ProfileListsViews.swift`: hata/boş ayrımı, sayfalama, davet hata eşlemesi.
4. `LociAR/Features/Map/NoteDensity.swift`, `Social/PostPreviewView.swift`: grup→detay detent, yorum/composer, anonimlik uyarısı, koleksiyon seçici.
5. `LociAR/Features/Map/PlaceNoteComposer.swift`: konum formu ve yayımlama hiyerarşisi.
6. `LociAR/Features/AR/ARExperienceView.swift`, `Create/CreatePostView.swift`, `Map/CameraLocationRefineView.swift`: AR durum sunumu; kamera işlevi ayrıca doğrulanır.
7. `LociAR/Features/Main/MainTabView.swift`, Profile/ProfileEdit/AppSettings ve Social/ProfileView/ActivityView: mevcut native gezinme ve ortak dil/yüzey uyumu.
8. `scripts/l10n/translations/*.json`: Türkçe kaynak değişikliklerinin tüm 12 dil karşılıkları. Kataloglar elle düzenlenmez.

## Uygulama sırası

1. **Aynı ekranı yeniden üret:** kurulu build ile kaynak ilişkisini kaydet; rozet, sayfalama, hata ve kaydırma durumlarını aynı veriyle doğrula.
2. **Ortak onarımlar:** kart/rozet geometrisi → sayfalama → ayrı hata durumları ve güvenli hata eşlemesi. Aynı bileşenleri kullanan ekranlara uygula.
3. **Görsel ve dil sistemi:** ortak tokenlar, ayar/profil yüzeyleri, kısa metinler, metrik ve açıklama hiyerarşisi.
4. **Görev akışları:** detayın büyük paneli/yorum klavyesi → konum notu formu → AR durumlarının doğru sunumu → iki seçenekli Paylaş girişi ve yardımcı boş durumlar.
5. **Önce/sonra kabulü:** her dilimden sonra aynı fiziksel cihazda aynı ekran/durum/scroll ile PNG karşılaştırması. Gerçek paylaşım gerektiren sınırlar fixture/emülatörde; saha AR/GPS kabulü ayrıca fiziksel cihazda.

## Kabul ve kapsam sınırları

- Standart ve büyük erişilebilirlik yazısı, küçük ekran simülatörü, Türkçe/uzun Almanca/RTL Arapça; 12 dil katalog anahtarı kontrolü. Dynamic Type ile etiket veya uyarı küçültülerek bastırılmaz.
- Son kart/aksiyon kaydırılarak tamamen görünür; yorum ve yayımlama klavyenin üstünde; native sekme çubuğuyla iki footer çakışmaz.
- Not kartı: metin/GIF, kilitli/açık, anonim/adlı, List/NavigationLink/detay. Yanlışlıkla anonim profile link verilmez; KLIPY işareti kalır.
- Keşfet: yükleme→hata→yeniden deneme→başarı→sayfalama; gerçek boş ve arama boş ayrı. Ek otomatik çağrı döngüsü veya cache politikası değişikliği eklenmez.
- Davet: pasif yükleme ile kullanıcının kod kullanma eylemi ayrı. Ham hata gizlenirken temel arıza saklanmaz; zorla çıkış ve doğrudan veritabanı fallback yok.
- Konum: measured fix/freshness/accuracy, 12 m düzeltme, 6 m gruplama ve uzaktan redaksiyon değişmez. Görsel panel konum okuma izni sağlamaz.
- Anonimlik varsayılanı, aynı mutation’daki yazar görünürlüğünün sabitliği, bağımsız engel davranışları ve kendi anonim notuna yorum onayı korunur.
- Cihaz içi çeviri, kullanıcı başlatmalı model indirme, orijinale dönüş, kilitli metin yasağı ve normal build’de gizli ödeme girişleri korunur.
- Çeviri üretimi sonrası `python3 scripts/l10n/build_catalog.py --check`, `node scripts/check-localization.mjs --release` ve compiler-extracted key kontrolü. Gerekli build/UI/erişilebilirlik kontrolleri değişikliğe göre seçilir. Salt renk/boşluk için uygulamayı kopyalayan unit test eklenmez.
- AR metin/GIF editörü, KLIPY seçici, diğer kullanıcı profili/takip sayfaları, yazılım klavyesi ve dolu koleksiyon gibi eksik görüntüler uygulama aşamasında ayrıca alınmalı. Bunlar mevcut görsel incelemeyle tamamlanmış sayılmaz.
- Siyah kamera ve ham auth hatasının kök nedenleri teşhis edilmedi. Canlı Firebase, fiziksel başarılı AR yerleştirme veya App Store hazır olma sonucu çıkarılmadı.

**Bu turda yapılan:** üç inceleme, kanıtların bağımsız karşılaştırılması, baz çizgisi kayıt düzeltmeleri ve bu karar planı. **Yapılmayan:** SwiftUI/katalog/backend değişikliği, build/test koşusu, commit/push/deploy.
