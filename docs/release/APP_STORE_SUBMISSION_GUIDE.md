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
* **Uygulama İçi Satın Alma:** Yok (v1.0 için tamamen ücretsiz)
* **Kullanılabilirlik:** Tüm bölgeler (global, All territories)
* **Diller:** 12 dil (tr, en, de, es, fr, pt, ru, ar, hi, bn, ja, zh-Hans). App Store Connect'te her dil için
  ayrı açıklama/anahtar kelime/ekran görüntüsü girilebilir; girilmeyen diller İngilizce metni gösterir.

---

## 3. Canlı Yasal ve Destek Bağlantıları (Live URLs)

Apple tarafından canlı doğrulamadan geçen ve HTTP 200 yanıtı veren güncel URL'ler:

* **Gizlilik Politikası (Privacy Policy URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy`
* **Kullanım Koşulları ve EULA (Terms of Use URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms`
* **Destek Sayfası (Support URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support`
* **İngilizce sürümler** (İngilizce App Store sayfası için): `/privacy/en`, `/terms/en`, `/support/en`
* **Destek İletişim E-Postası (Contact Email):**  
  `support@lociar.app` *(Apple Guideline 1.2 ve 1.5 gereği destek sayfasında açıkça yayımlanmıştır)*

---

## 4. Uygulama Gizlilik Bildirimi (App Privacy - Nutrition Labels)

`LociAR/Resources/PrivacyInfo.xcprivacy` ile birebir aynı App Store Connect yanıtları (12 veri türü; manifest
değişirse bu tablo da değişir, `LociARTests/StoreReadinessTests.swift` manifesti doğrular):

### Veri Toplama: "Evet, bu uygulamadan veri topluyoruz"
İzleme (Tracking): **HAYIR** — hiçbir veri türü izleme için kullanılmaz, izleme alan adı yoktur.

| Toplanan Veri Türü (App Store Connect) | Kimlikle ilişkili mi? | İzleme? | Amaç |
|---|---|---|---|
| **Precise Location** (Kesin Konum) | Evet | Hayır | App Functionality — yakındaki AR postları, postun konumu |
| **Coarse Location** (Yaklaşık Konum) | Evet | Hayır | App Functionality, Analytics — kullanım/güvenlik olayları (180 gün) |
| **User ID** | Evet | Hayır | App Functionality — hesap |
| **Email Address** | Evet | Hayır | App Functionality — giriş ve hesap doğrulama |
| **Name** | Evet | Hayır | App Functionality — Apple ile girişte paylaşılan ad |
| **Photos or Videos** | Evet | Hayır | App Functionality — yalnız isteğe bağlı profil fotoğrafı (post olarak fotoğraf/video yok) |
| **Other User Content** | Evet | Hayır | App Functionality — metin mesajı, GIPHY GIF kimliği, yorum, beğeni, AR kaydı |
| **Product Interaction** | Evet | Hayır | App Functionality, Analytics — görüntülenme/beğeni sayaçları |
| **Device ID** | Evet | Hayır | App Functionality — push bildirim belirteci (FCM/APNs) |
| **Crash Data** | Hayır | Hayır | App Functionality — Firebase Crashlytics (kapatılabilir) |
| **Other Diagnostic Data** | Hayır | Hayır | App Functionality — Crashlytics teşhis bilgisi |
| **Other Data Types** — Google ARCore'a giden kamera kaynaklı görsel özellikler | Hayır | Hayır | App Functionality — Cloud Anchors / Geospatial. Üçüncü tarafla (Google) paylaşılır |

---

## 5. Yaş Derecelendirmesi (Age Rating)

Uygulama Kullanıcı Tarafından Üretilen İçerik (UGC) barındırdığı için Apple anketinde şu yanıtlar verilmelidir:
* **Kullanıcı Etkileşimi / UGC:** Evet (Kullanıcılar kısa metin mesajı ve/veya GIPHY'den bir GIF paylaşabilir; fotoğraf, video, çizim veya bağlantı yok. GIF'ler GIPHY `pg-13` sınırıyla aranır ve sunucuda yeniden doğrulanır; tüm postlar yayından önce incelenir)
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
* **Kullanıcı Adı (Username):** `apple-review@lociar.app`
* **Şifre (Password):** Parola yöneticisindeki güncel değeri yalnızca App Store Connect'in Sign-In Information alanına girin; depoya veya inceleme notlarına yazmayın.

Daha önce depoda bulunan parola canlı hesapta değiştirilmeli ve App Store Connect güncellenmelidir. Güvenli oluşturma/yenileme adımları: [CREDENTIALS.md](../CREDENTIALS.md).

### İnceleme Notları (Notes for Reviewer - İngilizce)

Tek ve güncel metin: [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) §1. AR paylaşımı, konum notları, iki konum izni (Kullanırken / Her Zaman), arka plan modları, pazarlama onayı (4.5.4) ve güvenlik (1.2) tek metinde; 4.000 karakter sınırının altında. Eski ayrı metin kaldırıldı, çünkü ikisi birlikte sınırı aşıyordu.

### 6.1 Büyüme kapıları açılmadan önce (inceleme notlarına etkisi)

Aşağıdaki ortam değişkenleri varsayılan olarak **kapalıdır**; kapalıyken yukarıdaki inceleme metni doğrudur. Açmadan önce notları güncelle:

* `LOCIAR_INVITE_REQUIRED=true` (davet kodu kapısı): inceleme hesabına `users_private/{luid}.invite_exempt = true` yaz, aksi halde reviewer post yayınlayamaz. Notlara ekle: "Browsing is open to everyone; publishing requires an invite code (Profile > Invite code). The demo account is exempt."
* `LOCIAR_TRUSTED_AUTO_PUBLISH=true` (güvenilir yazar): SAFETY paragrafındaki "AR posts are reviewed by a moderator before they go public" cümlesi artık her yazar için doğru değildir. Şöyle değiştir: "AR posts from new accounts are reviewed by a moderator before they go public; established accounts with a clean history may publish immediately. All posts remain reportable and removable."

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
1. **Sahne 1 (AR Kamera):** Merkez nişangâh (reticle) ve gerçek duvar/masa üzerine yerleştirilmiş mesaj balonu (metin ve/veya GIF).  
   *Pazarlama Başlığı:* "Anılarınızı Gerçek Dünyaya Sabitleyin"
2. **Sahne 2 (Harita / Keşfet):** Yakındaki mekânsal pinlerin ve AR noktalarının haritada gösterimi.  
   *Pazarlama Başlığı:* "Çevrenizdeki Mekânsal Hikâyeleri Keşfedin"
3. **Sahne 3 (İçerik Detay & Yüzey):** Post önizleme kartı, yazar profili ve "AR'da Aç" butonu.  
   *Pazarlama Başlığı:* "Bırakıldığı Noktada Yeniden Yaşayın"
4. **Sahne 4 (Profil & Koleksiyonlar):** Kullanıcının oluşturduğu ve kaydettiği mekânsal koleksiyonlar.  
   *Pazarlama Başlığı:* "Kendi Mekânsal Arşivinizi Oluşturun"
