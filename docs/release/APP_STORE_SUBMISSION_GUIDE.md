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
| **Other User Content** | Evet | Hayır | App Functionality — metin, sosyal bağlantı, yorum, beğeni, AR kaydı |
| **Product Interaction** | Evet | Hayır | App Functionality, Analytics — görüntülenme/beğeni sayaçları |
| **Device ID** | Evet | Hayır | App Functionality — push bildirim belirteci (FCM/APNs) |
| **Crash Data** | Hayır | Hayır | App Functionality — Firebase Crashlytics (kapatılabilir) |
| **Other Diagnostic Data** | Hayır | Hayır | App Functionality — Crashlytics teşhis bilgisi |
| **Other Data Types** — Google ARCore'a giden kamera kaynaklı görsel özellikler | Hayır | Hayır | App Functionality — Cloud Anchors / Geospatial. Üçüncü tarafla (Google) paylaşılır |

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
* **Şifre (Password):** App Store Connect'e girilir; repoya, belgelere veya issue'lara **yazılmaz**. `functions/scripts/provision-review-account.mjs --rotate` yeni şifre üretir ve yalnız terminale basar.

### İnceleme Notları (Notes for Reviewer - İngilizce)
```text
Dear Apple Review Team,

Thank you for reviewing LociAR.

1. ABOUT THE APP:
LociAR is a spatial augmented reality social application that allows users to discover and pin short text notes and social media links (Spotify, YouTube, Instagram, X, Facebook) onto physical surfaces in the real world.

2. DEMO ACCOUNT & PRE-SEEDED CONTENT:
- Credentials: apple-review@lociar.app / (password provided in the App Review Information sign-in fields)
- A pre-seeded sample post is located directly at Apple Park, Cupertino (Lat: 37.3318, Lng: -122.0312): "LociAR demo note · Cupertino".
- You can immediately see and interact with this post on the Map tab or Discover tab upon signing in.

3. HOW TO TEST AR CREATION (A PHYSICAL ARKIT IPHONE IS REQUIRED; NO LIDAR NEEDED):
- Step 1: Sign in using the demo account credentials provided above (or use Sign in with Apple).
- Step 1b: Tick the privacy policy / community rules checkbox on the sign-in screen (explicit consent).
- Step 2: Grant Camera and Location permissions when prompted, and acknowledge the Google AR notice (Google processes sensor data for AR positioning).
- Step 3: Tap the 'Share' ('Paylaş') tab to open the AR camera.
- Step 4: Aim the center reticle at any well-lit surface (floor, table, or wall). When the reticle detects plane geometry, tap 'Pin to Surface' ('Yüzeye sabitle'). You can also tap 'Place in front of me (0.8m)' ('Önüme yerleştir') for immediate placement.
- Step 5: Tap 'Add content', type a caption or attach a social media link (Spotify, YouTube, Instagram, X or Facebook), then tap 'Publish on surface' ('Yüzeyde yayınla').
- After the first publish the app asks for notification permission (likes, comments and follows are sent as push notifications).

4. USER-GENERATED CONTENT (UGC) & SAFETY (GUIDELINE 1.2 COMPLIANCE):
- Zero tolerance for objectionable content: 18+ content and sensitive protected zones (schools, hospitals, places of worship) are hard-blocked at the server level.
- Moderation & Approval: Newly created posts are held in 'pending_review' until moderation approval before public discovery. The demo account already has approved sample posts visible immediately.
- Reporting: Posts, comments and user profiles can be reported with a reason (post 'Report' button, the '...' menu on each comment, 'Report user' on profiles). Reports are reviewed within 24 hours.
- Filtering: Comments are screened against an objectionable-language filter; profile photos are screened automatically (Google Cloud Vision SafeSearch) before anyone can see them.
- Blocking: Users can block abusive creators via the ellipsis (...) menu on posts or from the creator's profile. Blocked users' posts, comments and profile are hidden immediately, and they can no longer comment on, like or follow the blocker.
- Comment removal: Authors can delete their own comments; post owners can delete comments on their posts.
- Account Deletion: Users can permanently delete their account and all associated data at any time via Profile -> 'Delete account permanently' (Guideline 5.1.1(v)); the app re-authenticates first (Sign in with Apple again, or the password).
- Emergency stop: the operator can pause publishing for everyone (kill switch); the app then shows 'LociAR is temporarily paused'.
- Support: Direct support contact is available via support@lociar.app and https://lociar-admin--lociar-2f38c.us-central1.hosted.app/support.

If you have any questions or require additional details, please reach out to us at support@lociar.app.
```

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
1. **Sahne 1 (AR Kamera):** Merkez nişangâh (reticle) ve gerçek duvar/masa üzerine yerleştirilmiş metin/sosyal bağlantı kartı.  
   *Pazarlama Başlığı:* "Anılarınızı Gerçek Dünyaya Sabitleyin"
2. **Sahne 2 (Harita / Keşfet):** Yakındaki mekânsal pinlerin ve AR noktalarının haritada gösterimi.  
   *Pazarlama Başlığı:* "Çevrenizdeki Mekânsal Hikâyeleri Keşfedin"
3. **Sahne 3 (İçerik Detay & Yüzey):** Post önizleme kartı, yazar profili ve "AR'da Aç" butonu.  
   *Pazarlama Başlığı:* "Bırakıldığı Noktada Yeniden Yaşayın"
4. **Sahne 4 (Profil & Koleksiyonlar):** Kullanıcının oluşturduğu ve kaydettiği mekânsal koleksiyonlar.  
   *Pazarlama Başlığı:* "Kendi Mekânsal Arşivinizi Oluşturun"
