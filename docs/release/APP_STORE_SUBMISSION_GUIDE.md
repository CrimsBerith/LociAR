# LociAR App Store Gönderim ve İnceleme Rehberi

Bu belge, LociAR'ın App Store Connect üzerinden Apple İnceleme Ekibi'ne (App Review) gönderilmesi sırasında girilmesi gereken tüm meta verileri, yasal bildirimleri, inceleme notlarını ve teknik parametreleri içerir.

---

## 1. Uygulama Bilgileri (App Information)

| Alan | Değer | Kısıt / Not |
|---|---|---|
| **Uygulama Adı** | `LociAR: Gerçek Mekânlarda AR` | Max 30 karakter (28 karakter) |
| **Alt Başlık (Subtitle)** | `Mekânsal Hikâyeler ve Paylaşım` | Max 30 karakter (29 karakter) |
| **Birincil Kategori** | `Social Networking` (Sosyal Ağlar) | `LSApplicationCategoryType` ile uyumlu |
| **İkincil Kategori** | `Navigation` (Navigasyon) | Harita ve kamera deneyimi için |
| **Bundle ID** | `com.khankartal.lociar` | Developer portal ile eşleşmeli |
| **SKU** | `lociar-ios-v1` | Benzersiz iç takip kodu |
| **Kripto Bildirimi** | Standart olmayan şifreleme yok (`ITSAppUsesNonExemptEncryption = NO`) | Özel ihracat lisansı gerektirmez |

---

## 2. Fiyatlandırma ve Dağıtım (Pricing and Availability)

* **Fiyat:** Ücretsiz ($0.00 / Free)
* **Uygulama İçi Satın Alma:** Yok (v1.0 için tamamen ücretsiz)
* **Kullanılabilirlik:** Türkiye ve seçilen bölgeler (All territories)

---

## 3. Canlı Yasal ve Destek Bağlantıları (Live URLs)

Apple tarafından canlı doğrulamadan geçen ve HTTP 200 yanıtı veren güncel URL'ler:

* **Gizlilik Politikası (Privacy Policy URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/privacy`
* **Kullanım Koşulları ve EULA (Terms of Use URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/terms`
* **Destek Sayfası (Support URL):**  
  `https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support`
* **Destek İletişim E-Postası (Contact Email):**  
  `support@lociar.app` *(Apple Guideline 1.2 ve 1.5 gereği destek sayfasında açıkça yayımlanmıştır)*

---

## 4. Uygulama Gizlilik Bildirimi (App Privacy - Nutrition Labels)

Apple'ın zorunlu kıldığı `PrivacyInfo.xcprivacy` dosyasıyla birebir uyumlu App Store Connect anket yanıtları:

### Veri Toplama: "Evet, bu uygulamadan veri topluyoruz"
İzleme (Tracking): **HAYIR** (Veriler üçüncü taraf reklam ağlarıyla kullanıcı izleme amacıyla paylaşılmaz).

| Toplanan Veri Türü | Kimlikle İlişkilendiriliyor mu? | Takip Amaçlı mı? | Kullanım Amacı |
|---|---|---|---|
| **Kesin Konum (Precise Location)** | Evet (İçerik üretenler için) | Hayır | Uygulama İşlevselliği (Yakındaki AR gönderilerini gösterme ve yüzeye bağlama) |
| **Kullanıcı Kimliği (User ID)** | Evet | Hayır | Uygulama İşlevselliği (Hesap yönetimi ve kimlik doğrulama) |
| **E-posta Adresi (Email Address)** | Evet | Hayır | Hesap Doğrulama ve İletişim |
| **Ad (Name)** | Evet | Hayır | Uygulama İşlevselliği (Apple ile girişte paylaşılan ad; profil görünen adı) |
| **Fotoğraflar ve Videolar** | Evet | Hayır | Uygulama İşlevselliği (yalnızca isteğe bağlı profil fotoğrafı; kamera karesi saklanmaz, post olarak fotoğraf/video paylaşılamaz) |
| **Diğer Kullanıcı İçerikleri** | Evet | Hayır | Uygulama İşlevselliği (Başlıklar, yorumlar, beğeniler, AR kayıtları) |
| **Kesin Konum** ve **Diğer Veri (kamera kaynaklı görsel özellikler)** — üçüncü taraf: **Google ARCore** | Hayır (Google ile kimlik paylaşılmaz) | Hayır | Uygulama İşlevselliği (Cloud Anchors / Geospatial ile AR yeniden konumlandırma). App Store Connect'te "Data shared with third parties" olarak işaretle |
| **Ürün Etkileşimi (Product Interaction)** | Evet | Hayır | Uygulama İşlevselliği + Analitik (görüntülenme/beğeni sayaçları, `analytics_events`, 180 gün saklama) |

---

## 5. Yaş Derecelendirmesi (Age Rating)

Uygulama Kullanıcı Tarafından Üretilen İçerik (UGC) barındırdığı için Apple anketinde şu yanıtlar verilmelidir:
* **Kullanıcı Etkileşimi / UGC:** Evet (Kullanıcılar metin ve sosyal medya bağlantısı paylaşabilir)
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
* **Şifre (Password):** `Review_5a4b23b2e56dba64_2026!`

### İnceleme Notları (Notes for Reviewer - İngilizce)
```text
Dear Apple Review Team,

Thank you for reviewing LociAR.

1. ABOUT THE APP:
LociAR is a spatial augmented reality social application that allows users to discover and pin short text notes and social media links (Spotify, YouTube, Instagram, X, Facebook) onto physical surfaces in the real world.

2. DEMO ACCOUNT & PRE-SEEDED CONTENT:
- Credentials: apple-review@lociar.app / Review_5a4b23b2e56dba64_2026!
- A pre-seeded sample post is located directly at Apple Park, Cupertino (Lat: 37.3318, Lng: -122.0312): "LociAR demo note · Cupertino".
- You can immediately see and interact with this post on the Map tab or Discover tab upon signing in.

3. HOW TO TEST AR CREATION (NO SPECIAL HARDWARE NEEDED):
- Step 1: Sign in using the demo account credentials provided above (or use Sign in with Apple).
- Step 2: Grant Camera and Location permissions when prompted.
- Step 3: Tap the '+' (Create/Paylaş) tab to open the AR Camera.
- Step 4: Aim the center reticle at any well-lit surface (floor, table, or wall). When the reticle detects plane geometry, tap 'Pin to Surface' ('Yüzeye sabitle'). You can also tap 'Place in front of me (0.8m)' ('Önüme yerleştir') for immediate placement.
- Step 5: Type a caption or attach a social media link (YouTube/Spotify/Instagram/X), then tap 'Publish' ('Yayınla').

4. USER-GENERATED CONTENT (UGC) & SAFETY (GUIDELINE 1.2 COMPLIANCE):
- Zero tolerance for objectionable content: 18+ content and sensitive protected zones (schools, hospitals, places of worship) are hard-blocked at the server level.
- Moderation & Approval: Newly created posts are held in 'pending_review' until moderation approval before public discovery. The demo account already has approved sample posts visible immediately.
- Reporting: Posts, comments and user profiles can be reported with a reason (post 'Report' button, the '...' menu on each comment, 'Report user' on profiles). Reports are reviewed within 24 hours.
- Filtering: Comments are screened against an objectionable-language filter; profile photos are screened automatically (Google Cloud Vision SafeSearch) before anyone can see them.
- Blocking: Users can block abusive creators via the ellipsis (...) menu on posts or from the creator's profile. Blocked users' posts, comments and profile are hidden immediately, and they can no longer comment on, like or follow the blocker.
- Comment removal: Authors can delete their own comments; post owners can delete comments on their posts.
- Account Deletion: Users can permanently delete their account and all associated data at any time via Profile -> 'Delete Account' (Guideline 5.1.1(v)).
- Support: Direct support contact is available via support@lociar.app and https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support.

If you have any questions or require additional details, please reach out to us at support@lociar.app.
```

---

## 7. App Store Tanıtım Metinleri (Store Copy)

### Açıklama (Description)
```text
Gerçek dünyayı dijital hikâyelerle zenginleştirin.

LociAR, notlarınızı ve sevdiğiniz sosyal medya paylaşımlarını gerçek mekânlardaki fiziksel yüzeylere sabitlemenizi sağlayan yeni nesil bir artırılmış gerçeklik (AR) platformudur.

ÖZELLİKLER:

• Mekânsal AR Deneyimi: Gelişmiş ARKit ve RealityKit teknolojisiyle masalara, zeminlere ve duvarlara dijital içerikler yerleştirin.
• Keşfet ve Gez: Şehrinizdeki ve çevrenizdeki diğer kullanıcıların bıraktığı mekânsal gönderileri harita üzerinden keşfedin.
• Gerçek Yüzey Kilidi: Fiziksel yüzey geometrisini algılayan hassas hizalama ile içerikleri tam olarak bırakıldıkları noktada görüntüleyin.
• Sosyal Etkileşim: Beğendiğiniz gönderileri kaydedin, koleksiyonlar oluşturun, yorum yapın ve içerik üreticilerini takip edin.
• Güvenli ve Saygılı Topluluk: Korumalı bölgeler (okul, ibadethane vb.) ve uygunsuz içerikler sunucu düzeyinde engellenir. Kullanıcı şikayet ve anında engelleme araçlarıyla güvenli bir deneyim sunulur.

Gizlilik ve Topluluk Kuralları:
LociAR kullanıcı gizliliğine ve güvenliğine önem verir. Kameranız ve konumunuz yalnızca AR deneyimini sunmak ve doğrulamak için kullanılır; verileriniz izleme amacıyla üçüncü taraflarla paylaşılmaz.
```

### Anahtar Kelimeler (Keywords - Max 100 karakter)
```text
ar,artırılmış gerçeklik,mekan,harita,kamera,sosyal,hikaye,not,sosyal medya,yüzey,keşfet,spatial
```

---

## 8. Ekran Görüntüsü Hazırlama Planı (Screenshots Required)

App Store Connect yüklemesi için aşağıdaki iki ana boyutta ekran görüntüleri hazırlanmalıdır:
1. **6.9" Ekran (iPhone 16 Pro Max):** 1320 x 2868 piksel (Dikey)
2. **6.7" Ekran (iPhone 15 Pro Max):** 1290 x 2796 piksel (Dikey)

### Önerilen 4 Temel Sahne:
1. **Sahne 1 (AR Kamera):** Gerçek zemin/masa üzerinde beliren mavi AR ızgarası ve yerleştirilmiş metin/sosyal medya kartı.  
   *Pazarlama Başlığı:* "Anılarınızı Gerçek Dünyaya Sabitleyin"
2. **Sahne 2 (Harita / Keşfet):** Yakındaki mekânsal pinlerin ve AR noktalarının haritada gösterimi.  
   *Pazarlama Başlığı:* "Çevrenizdeki Mekânsal Hikâyeleri Keşfedin"
3. **Sahne 3 (İçerik Detay & Yüzey):** Post önizleme kartı, yazar profili ve "AR'da Aç" butonu.  
   *Pazarlama Başlığı:* "Bırakıldığı Noktada Yeniden Yaşayın"
4. **Sahne 4 (Profil & Koleksiyonlar):** Kullanıcının oluşturduğu ve kaydettiği mekânsal koleksiyonlar.  
   *Pazarlama Başlığı:* "Kendi Mekânsal Arşivinizi Oluşturun"
