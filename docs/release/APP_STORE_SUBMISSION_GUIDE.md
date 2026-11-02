# LociAR App Store Gönderim ve İnceleme Rehberi

Bu belge, LociAR'ın App Store Connect üzerinden Apple İnceleme Ekibi'ne (App Review) gönderilmesi sırasında girilmesi gereken tüm meta verileri, yasal bildirimleri, inceleme notlarını ve teknik parametreleri içerir.

---

## 1. Uygulama Bilgileri (App Information)

| Alan | Değer | Kısıt / Not |
|---|---|---|
| **Uygulama Adı** | `LociAR: Gerçek Mekânlarda AR` | Max 30 karakter (28 karakter); diğer diller: `store-metadata/` |
| **Alt Başlık (Subtitle)** | `Mekânsal Hikâyeler ve Paylaşım` | Max 30 karakter (30 karakter) |
| **Birincil Kategori** | `Social Networking` (Sosyal Ağlar) | `LSApplicationCategoryType` ile uyumlu |
| **İkincil Kategori** | `Navigation` (Navigasyon) | Harita ve kamera deneyimi için |
| **Bundle ID** | `com.khankartal.lociar` | Developer portal ile eşleşmeli |
| **SKU** | `lociar-ios-v1` | Benzersiz iç takip kodu |
| **Kripto Bildirimi** | Standart olmayan şifreleme yok (`ITSAppUsesNonExemptEncryption = NO`) | Özel ihracat lisansı gerektirmez |

---

## 2. Fiyatlandırma ve Dağıtım (Pricing and Availability)

* **Fiyat:** Ücretsiz ($0.00 / Free)
* **Uygulama İçi Satın Alma:** Yok (v1.0 için tamamen ücretsiz). Yazar desteği ödemeleri Release derlemesinde gizli
  (`PostSupportAvailability.releaseBuilds = false`); App Privacy'de "Purchases" işaretlenmez. Açılacağı sürümde
  bu bölüm, App Privacy, inceleme notları ve kullanım koşulları birlikte güncellenir.
* **Kullanılabilirlik:** Tüm bölgeler (global, All territories) — AGENTS.md sahip kararı. AB ülkeleri dahil olduğu için
  App Store Connect → Business → **Digital Services Act (DSA) tüccar durumu** beyan edilmeden AB'de yayın yapılmaz.
  Ücretsiz olması tek başına "tüccar değilim" sonucu vermez. Mesleki/ticari faaliyet, pazarlama ve gelir amacı
  dahil ölçütlerle hesap sahibi kendi durumunu değerlendirir; tüccar ise doğrulanmış adres, telefon ve e-posta
  AB mağaza sayfasında görünür. [Apple'ın öz değerlendirme ölçütleri](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/).
* **Üçüncü taraf içerik (Content Rights):** "Evet, üçüncü taraf içerik içerir ve gerekli haklara sahibim" —
  GIF'ler GIPHY API koşullarıyla gösterilir, "Powered by GIPHY" atfı arama ekranında var.
* **Build numarası:** `project.yml` → `CURRENT_PROJECT_VERSION`. İlk yükleme `1`; App Store Connect'e her yeni
  yükleme (TestFlight dahil) için bir artırılır, sonra `xcodegen generate`.
* **Diller:** 12 dil (tr, en, de, es, fr, pt, ru, ar, hi, bn, ja, zh-Hans). App Store Connect'te her dil için
  ayrı açıklama/anahtar kelime/ekran görüntüsü girilebilir. Mevcut kaydın ana dili Türkçe; diğer mağaza
  dillerinde Apple'ın yerelleştirme fallback'i uygulanır. Uygulamanın kendi geliştirme/fallback dili İngilizcedir.

---

## 3. Canlı Yasal ve Destek Bağlantıları (Live URLs)

Uygulamanın kullandığı URL'ler aşağıdadır. 27 Ekim 2026 yerel HTTP kontrolünde sayfalar 200 döndü;
Apple'ın doğruladığı iddia edilmez. Canlı sayfalar hâlâ eski destek adresini gösteriyor; aday admin yayını ve
yeni adresin sayfalarda görünmesi gönderimden önce doğrulanmalı.

* **Gizlilik Politikası (Privacy Policy URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy`
* **Kullanım Koşulları ve EULA (Terms of Use URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms`
* **Destek Sayfası (Support URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support`
* **İngilizce sürümler** (İngilizce App Store sayfası için): `/privacy/en`, `/terms/en`, `/support/en`
* **Destek İletişim E-Postası (Contact Email):**  
  `support@alfagolab.com` *(Apple Guideline 1.2 ve 1.5 gereği destek sayfasında açıkça yayımlanmalıdır; Alfago Lab
  alan adı, Hostinger e-postası — sahip kararı 26 Ekim 2026. `lociar.app` kayıtlı olmadığı için kullanılmaz.)*

---

## 4. Uygulama Gizlilik Bildirimi (App Privacy - Nutrition Labels)

`LociAR/Resources/PrivacyInfo.xcprivacy` ile birebir aynı App Store Connect yanıtları (12 veri türü; manifest
değişirse bu tablo da değişir, `LociARTests/StoreReadinessTests.swift` manifesti doğrular):

### Veri Toplama: "Evet, bu uygulamadan veri topluyoruz"
İzleme (Tracking): **HAYIR** — hiçbir veri türü izleme için kullanılmaz, izleme alan adı yoktur.

| Toplanan Veri Türü (App Store Connect) | Kimlikle ilişkili mi? | İzleme? | Amaç |
|---|---|---|---|
| **Precise Location** (Kesin Konum) | Evet | Hayır | App Functionality — yakındaki AR postları, postun konumu; Developer's Advertising or Marketing — kampanya adımı doğrulaması (yalnız "Kampanyalar ve teklifler" açıksa) |
| **Coarse Location** (Yaklaşık Konum) | Evet | Hayır | App Functionality, Analytics — kullanım/güvenlik olayları (180 gün); Developer's Advertising or Marketing — kampanya bölgeleri |
| **User ID** | Evet | Hayır | App Functionality — hesap |
| **Email Address** | Evet | Hayır | App Functionality — giriş ve hesap doğrulama |
| **Name** | Evet | Hayır | App Functionality — Apple ile girişte paylaşılan ad |
| **Photos or Videos** | Evet | Hayır | App Functionality — yalnız isteğe bağlı profil fotoğrafı (post olarak fotoğraf/video yok) |
| **Other User Content** | Evet | Hayır | App Functionality — metin mesajı, GIPHY GIF kimliği, yorum, beğeni, AR kaydı |
| **Product Interaction** | Evet | Hayır | App Functionality, Analytics — görüntülenme/beğeni sayaçları |
| **Device ID** | Evet | Hayır | App Functionality — push bildirim belirteci (FCM/APNs) |
| **Crash Data** | Hayır | Hayır | App Functionality — Firebase Crashlytics (kapatılabilir) |
| **Other Diagnostic Data** | Hayır | Hayır | App Functionality — Crashlytics teşhis bilgisi |
| **Environment Scanning** — AR çevre haritaları ve kamera kaynaklı görsel özellikler | Evet | Hayır | App Functionality — yeniden konumlandırma, Cloud Anchors / Geospatial. Çevre haritası ve anchor kaydı sunucuda hesap/post ile ilişkilidir; herkese açık anonim atıf bu bağlantıyı kaldırmaz. ARCore görsel özellikleri Google ile paylaşılır |
| **Other Data Types** — Firebase Messaging SDK meta verileri | Hayır | Hayır | Analytics — arşivdeki Firebase Messaging SDK manifesti tarafından beyan edilir; AR çevre taramasından ayrı bir veri türüdür. Firebase Analytics SDK'sının kullanıldığı veya izleme yapıldığı anlamına gelmez |

---

## 5. Yaş Derecelendirmesi (Age Rating)

Uygulama Kullanıcı Tarafından Üretilen İçerik (UGC) barındırdığı için Apple anketinde şu yanıtlar verilmelidir:
* **Kullanıcı Etkileşimi / UGC:** Evet (Kullanıcılar kısa metin mesajı ve/veya GIPHY'den bir GIF paylaşabilir; fotoğraf, video, çizim veya bağlantı yok. GIF'ler GIPHY `pg-13` sınırıyla aranır ve sunucuda yeniden doğrulanır. Postlar otomatik metin filtresi, bağlantı yasağı, korumalı bölge ve 18+ kontrollerinden geçince hemen yayınlanır; denetim sonradan yapılır: şikâyet, birden çok şikâyette otomatik gizleme, 24 saat içinde moderatör incelemesi — sahip kararı 18 Ekim 2026)
* **Mesajlaşma / sohbet:** Hayır (özel mesaj yok; yorumlar herkese açık ve şikâyet edilebilir)
* **Reklam:** Üçüncü taraf reklam SDK'sı yok. Marka teklifleri (varsayılan kapalı, ayrı onaylı) reklam sayılır:
  yayında aktif kampanya varsa "Evet", yoksa "Hayır" de ve ilk kampanyadan önce cevabı güncelle.
* **Konum Paylaşımı:** Evet (Gönderiler gerçek koordinatlara sabitlenir)
* **Kısıtlanmamış Web Erişimi:** Hayır
* **18+ / Müstehcenlik:** Hayır (Sunucu tarafında hard-block; profil fotoğrafları otomatik SafeSearch taramasından geçer)
* **Sonuç Yaş Derecesi:** Apple'ın güncel anketi (4+/9+/13+/16+/18+). Denetimli UGC ve kullanıcılar arası iletişim
  (yorumlar) olduğu için beklenen sonuç **13+**; anketin verdiği sonucu kullan.

---

## 6. App Review İnceleme Notları ve Test Bilgileri (App Review Notes)

App Store Connect'te **App Review Information** bölümüne girilecek metin:

### Giriş Bilgileri (Sign-In Information)
* **Giriş Gerekli mi (Sign-in required):** Evet (Kutu işaretlenmeli)
* **Kullanıcı Adı (Username):** `apple-review@alfagolab.com`
* **Şifre (Password):** Parola yöneticisindeki güncel değeri yalnızca App Store Connect'in Sign-In Information alanına girin; depoya veya inceleme notlarına yazmayın.

Daha önce depoda bulunan parola canlı hesapta değiştirilmeli ve App Store Connect güncellenmelidir. Güvenli oluşturma/yenileme adımları: [CREDENTIALS.md](../CREDENTIALS.md).

### İnceleme Notları (Notes for Reviewer - İngilizce)

Tek ve güncel metin: [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) §1. AR paylaşımı, konum notları, iki konum izni (Kullanırken / Her Zaman), arka plan modları, pazarlama onayı (4.5.4) ve güvenlik (1.2) tek metinde; 4.000 karakter sınırının altında. Eski ayrı metin kaldırıldı, çünkü ikisi birlikte sınırı aşıyordu.

### 6.1 Büyüme kapıları açılmadan önce (inceleme notlarına etkisi)

Aşağıdaki anahtarlar varsayılan olarak **kapalıdır**; kapalıyken yukarıdaki inceleme metni doğrudur. Açmadan önce notları güncelle:

* `LOCIAR_INVITE_REQUIRED=true` (davet kodu kapısı): inceleme hesabına `users_private/{luid}.invite_exempt = true` yaz, aksi halde reviewer post yayınlayamaz. Notlara ekle: "Browsing is open to everyone; publishing requires an invite code (Profile > Invite code). The demo account is exempt."
* `system/flags.post_review_required = true` (acil durum ön onayı): açıkken yeni postlar moderatör onayı bekler. SAFETY paragrafının ilk cümlesini şöyle değiştir: "Every new post is held for moderator review before it goes public; an automatic text filter (no links, blocked terms) runs first." Anahtar kapanınca eski metne dön.

---

## 7. App Store Tanıtım Metinleri (Store Copy)

12 dilin metinleri (ad, alt başlık, tanıtım metni, açıklama, anahtar kelimeler, "Bu sürümde yenilikler")
`docs/release/store-metadata/<dil>.md` dosyalarında; App Store Connect'te her dilin sayfasına kopyala-yapıştır.
Kaynak `scripts/store-metadata/metadata.json`; düzenledikten sonra `python3 scripts/store-metadata/build.py`
çalıştır (karakter sınırlarını ve anahtar kelimelerde marka adı olmamasını, Guideline 2.3.7, denetler).
App Store Connect bazı dillerde anahtar kelime sınırını farklı sayarsa listenin sonundan kısalt.

---

## 8. Ekran Görüntüsü Hazırlama Planı (Screenshots Required)

App Store Connect yüklemesi için aşağıdaki iki ana boyutta ekran görüntüleri hazırlanmalıdır:
1. **6.9" Ekran (iPhone 16 Pro Max):** 1320 x 2868 piksel (Dikey)
2. **6.7" Ekran (iPhone 15 Pro Max):** 1290 x 2796 piksel (Dikey)

### Önerilen 4 Temel Sahne:
Ekim başındaki görüntüler (`screenshots/`) kullanılamaz: boş harita, yükleniyor simgesi, simülatör kamerası ve tanı
yazısı, kaldırılmış "fotoğraf/video" metni ve aynı iki kare içeriyor. Seed içerik canlıdayken gerçek iPhone'da
yeniden çekilmeli (Apple en az 1, en fazla 10 kare ister; öneri 4–6. 6.9" boyutu zorunlu, diğer boyutlar
ondan küçültülür). Yüklemeden önce App Store Connect'in o gün gösterdiği zorunlu ekran yuvasını ve
[Apple'ın güncel ölçülerini](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
doğrula; görüntüler alfa kanalı içermemeli.

1. **Sahne 1 (AR Kamera):** Merkez nişangâh (reticle) ve gerçek duvar/masa üzerine yerleştirilmiş mesaj balonu (metin ve/veya GIF).  
   *Pazarlama Başlığı:* "Anılarınızı Gerçek Dünyaya Sabitleyin"
2. **Sahne 2 (Harita / Keşfet):** Yakındaki mekânsal pinlerin ve AR noktalarının haritada gösterimi.  
   *Pazarlama Başlığı:* "Çevrenizdeki Mekânsal Hikâyeleri Keşfedin"
3. **Sahne 3 (İçerik Detay & Yüzey):** Post önizleme kartı, yazar profili ve "AR'da Aç" butonu.  
   *Pazarlama Başlığı:* "Bırakıldığı Noktada Yeniden Yaşayın"
4. **Sahne 4 (Profil & Koleksiyonlar):** Kullanıcının oluşturduğu ve kaydettiği mekânsal koleksiyonlar.  
   *Pazarlama Başlığı:* "Kendi Mekânsal Arşivinizi Oluşturun"
