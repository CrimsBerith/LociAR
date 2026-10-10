> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`. Sosyal medya bağlantıları (Spotify, YouTube, TikTok, Instagram, Facebook, X), fotoğraf/video ve çizim postları 9 Ekim 2026'da kaldırıldı; postlar metin ve/veya 1 GIPHY GIF'idir. Burada geçen platform adları yalnızca tarihî kayıttır.

# LociAR - Milyonlarca Kullanıcıya Ölçeklendirme Analizi (MVP Sonrası İhtiyaçlar)

**Tarih:** 2026-07-05  
**Amaç:** Mevcut MVP'den (sadece client-side Expo prototipi) 1M+ → 10M+ aktif kullanıcıya ölçeklenebilir bir ürüne geçiş için kapsamlı ihtiyaç analizi.

Mevcut durum: Yerel depolama (AsyncStorage + Zustand), temel sensor tabanlı AR simülasyonu, basit harita, admin onayı mantığı. Bu, konsept kanıtı için mükemmel ama milyon kullanıcı için yetersiz.

## 1. Executive Summary

Milyonlarca kullanıcı için bu uygulama:
- **Teknik olarak** ağır AR + geo + sosyal + moderasyon yükü taşır.
- **En büyük riskler:** Pil tüketimi, GPS/AR doğruluğu, spam/moderasyon, altyapı maliyeti, yasal sorunlar (özel mülk + AR).
- **Fırsat:** Niantic gibi (Pokémon GO) kullanıcıları "harita inşası" için kullan. Her scan VPS'yi güçlendirir.
- **MVP sonrası öncelik:** Backend + gerçek AR (Geospatial VPS) + ölçeklenebilir moderasyon + performans.

**Kritik Karar:** Hemen gerçek backend'e geç (Supabase → custom). Saf client-side ile 10k+ kullanıcıda çöker.

## 2. Mevcut MVP'nin Eksikleri (Milyon Kullanıcı Perspektifi)

| Alan                  | MVP'de Var          | Milyon Kullanıcıda Gerekli                          | Etki Seviyesi |
|-----------------------|---------------------|-----------------------------------------------------|---------------|
| Veri Saklama          | AsyncStorage (cihaz)| Cloud DB + CDN + önbellek                           | Kritik       |
| AR Doğruluk           | Sadece heading + GPS| Gerçek 6DoF + VPS + görsel eşleştirme               | Kritik       |
| Geo Sorgular          | Client-side filtre  | Sunucu tarafı spatial index + tiling (H3/S2)        | Kritik       |
| Moderasyon            | Basit admin ekranı  | AI + insan + topluluk + otomatik                  | Çok Yüksek   |
| Auth & Sosyal         | Mock user switch    | Gerçek auth + graph + real-time                     | Yüksek       |
| Performans (Pil/AR)   | Simülasyon          | Akıllı aktivasyon, offline, adaptif kalite          | Çok Yüksek   |
| Backend               | Yok                 | Gerçek API, rate limit, sharding                    | Kritik       |
| Yasal / Gizlilik      | Temel               | KVKK/GDPR, mülk sahipliği claim, yaş sınırı         | Kritik       |

## 3. Detaylı İhtiyaç Analizi

### 3.1 Backend & Veri Mimarisi (En Öncelikli)
- **Şu an:** Tamamen cihazda. 1000+ tag ile yavaşlar, offline sync yok, multi-device yok.
- **İhtiyaçlar:**
  - **Veritabanı:** PostgreSQL + PostGIS (geo sorgular için). Milyonlarca tag için:
    - GiST index'ler (zorunlu)
    - Tablo partitioning (bölgeye veya zamana göre)
    - H3/S2 tiling ile "nearby" sorguları optimize et (PostGIS + extension)
  - **Gerçek zamanlı:** Supabase Realtime veya custom WebSocket (comments, nearby users, yeni tag bildirimleri).
  - **Depolama:** Ref fotoğraflar → S3 / Cloudflare R2 + CDN + otomatik thumbnail (WebP).
  - **Önbellek:** Redis (sıcak geo veriler, user sessions).
  - **API:** REST + GraphQL veya tRPC. Rate limiting (kullanıcı başına), geo-sharding.
  - **Ölçek:** Başlangıç Supabase (hızlı). 100k+ kullanıcıda custom backend (NestJS/Go + Kubernetes veya Fly.io/Render).

**Niantic Dersi:** Kullanıcı scan'leri ile kendi VPS haritanı kur. Her AR kullanımı aslında veri toplar.

### 3.2 AR Teknolojisi (Milyonlarca için Gerçek AR)
- **MVP:** Sadece GPS + compass. "Açı" hissi var ama kırılgan (drift, indoor kötü).
- **Gerekli:**
  - **Android:** ARCore Geospatial API + VPS (Google Street View verisiyle yüksek doğruluk).
  - **iOS:** ARKit + GeoAnchors + Look Around verisi.
  - **Hibrit:** Cloud Anchors (kalıcı AR objeler) + on-device SLAM.
  - **Görsel Eşleştirme:** Ref foto ile live camera feature matching (ML Kit / CoreML veya custom model).
  - **Performans:** 
    - AR sadece "Explore" modunda aktif.
    - Geo-fence ile yakın tag'leri önceden yükle.
    - Düşük güç modu (sadece compass + GPS, kamera gerekince).
    - Pil tüketimi takibi + uyarılar.
  - **Offline:** Son 50-100 tag'i + ref image'ları cache'le.

**Maliyet Notu (2026):** Google ARCore Geospatial temel ücretsiz ama VPS/cloud anchors ve yüksek hacimde ücretli olur. Map API'leri (geocoding, places) de pahalılaşır (yaklaşık $5-32 / 1000 istek).

### 3.3 Performans & Kullanıcı Deneyimi
- **Mobil:**
  - Battery drain AR'nin en büyük düşmanı. Test et: 30 dk AR kullanımı = %15-25 pil.
  - Düşük kaliteli overlay'ler (thumbnail yerine optimize edilmiş).
  - Lazy load: Sadece 300-500m içindeki tag'leri yükle.
  - Background: Sadece önemli bildirimler için location.
- **Sunucu:**
  - Nearby sorguları < 100ms olmalı.
  - CDN + edge caching.
  - Progressive Web App (PWA) bileşeni (web harita için).

### 3.4 Moderasyon, Güvenlik & Yasal (Milyonlarca için Zorunlu)
- **Şu an:** Basit admin onayı.
- **İhtiyaçlar:**
  - **Otomatik:** Vision model (NSFW, duplicate detection), text moderation.
  - **Katmanlı:** AI → Topluluk raporları → İnsan inceleme → Otomatik silme.
  - **Sensitive Zone Yönetimi:** Global restricted areas listesi (okul, askeri, dini) + dinamik güncelleme.
  - **Mülk Sahipliği:** İşletmeler "Claim this location" yapabilsin (ücretli olabilir).
  - **Güvenlik:** 
    - Rate limit (günde max X tag).
    - Spam detection (benzer konum + içerik).
    - Yaş doğrulama + parental controls.
  - **Yasal:**
    - KVKK + GDPR tam uyum (veri silme, export, consent).
    - ToS: "Sadece kamu alanları, özel mülke saygı".
    - AR "gerçek dünya" uyarıları (yürüme sırasında dikkat).
    - Sigorta / yasal danışman (özellikle Türkiye için).

### 3.5 Sosyal & Büyüme Özellikleri
- Gerçek auth (email, Google, Apple, telefon).
- Takip sistemi + arkadaş tag'leri.
- Koleksiyonlar ("Ziyaret ettiklerim", rozetler, streak'ler).
- Trending / Keşfet feed (konum bazlı + global).
- Push notifications (yeni tag yakınında, yorum, arkadaş aktivitesi).
- Viral: "Bu tag'i paylaş → AR linki".
- Gamification: En çok tag oluşturan, en çok ziyaret eden lider tabloları.

### 3.6 İçerik & Platform Entegrasyonları
- Share sheet entegrasyonu (diğer uygulamalardan direkt tag'le).
- (Sosyal medya embed'leri ürün kararıyla kapsam dışı; 9 Ekim 2026.)
- İçerik raporlama + otomatik filtre.

### 3.7 Altyapı, DevOps & Maliyet
- **Hosting:** 
  - Başlangıç: Supabase + Vercel/Expo EAS.
  - Ölçek: AWS/GCP + Kubernetes veya Railway/Fly.
- **Monitoring:** Sentry (crash), Datadog/New Relic (performans), custom analytics.
- **CI/CD:** EAS Build + GitHub Actions.
- **Feature Flags:** Yeni özellikleri kademeli aç (1%, 10%, %100).
- **Maliyet Tahmini (kaba):**
  - 1M aktif kullanıcı: Depolama + bandwidth + AR VPS + map API'leri aylık binlerce $ olabilir.
  - Niantic tarzı: Kullanıcı verisiyle kendi haritayı kur → üçüncü parti bağımlılığını azalt.

### 3.8 İş & Operasyonel İhtiyaçlar
- **Ekip:** Mobile (2-3), Backend (2), ML/AR (1-2), Moderasyon (küçük ekip + AI), Legal.
- **Analytics:** Retention, unlock success rate, creation → view funnel.
- **A/B Test:** Farklı pose tolerance'lar, UI varyasyonları.
- **Destek:** In-app rapor + ticket sistemi.
- **Global:** Çoklu dil, farklı ülke restricted zones, yerel partnerler (turizm bakanlıkları).

## 4. Önerilen Teknoloji Evrimi

**MVP+1 (İlk 3-6 ay, 10k-100k kullanıcı):**
- Supabase (Auth + Postgres + PostGIS + Realtime + Storage)
- Expo + bare workflow'a geçiş (daha iyi AR için)
- ARCore Geospatial entegrasyonu (Android öncelik)
- Basit AI moderasyon (HuggingFace veya Google Vision)

**Scale Phase (100k - 1M+):**
- Custom backend (Go veya NestJS)
- Redis + CDN
- Gerçek VPS (Google + Niantic benzeri kendi model)
- Event-driven architecture (tag oluşturulunca moderation kuyruğu)

**10M+ için:**
- Geo-sharded DB
- Edge computing (Cloudflare Workers)
- Kendi Large Geospatial Model (kullanıcı scan'lerinden)

## 5. Riskler ve Mitigasyonlar

- **Pil Tüketimi → Kullanıcı terk:** Akıllı modlar + net uyarılar.
- **AR Doğruluğu Düşük → Hayal kırıklığı:** VPS + görsel doğrulama. Toleransları kullanıcı feedback'ine göre ayarla.
- **Spam & Taciz:** Çok katmanlı moderasyon + hızlı silme.
- **Maliyet Patlaması:** Ücretsiz tier'ları takip et, caching, kullanıcı katkılarını teşvik et (scan = ücretsiz özellik).
- **Yasal Davalar:** Başlangıçtan itibaren "public space only" + claim sistemi.

## 6. Hemen Yapılacaklar (Öncelik Sırasıyla)

1. **Backend kurulumu** (Supabase veya custom) — en kritik.
2. **Gerçek AR entegrasyonu** (Geospatial API).
3. **Moderasyon pipeline** (AI + admin tool iyileştirmesi).
4. **Auth + push notifications**.
5. **Performans testleri** (pil, AR, geo query).
6. **Yasal review** + ToS güncelle.
7. **Analytics + crash reporting** ekle.

## 7. Detaylı Derin Analiz: Milyon Kullanıcı için Ek İhtiyaçlar (1. Kısım - Genişletilmiş)

### 7.1 Backend Mimarisi Detayları (Supabase → Enterprise)
- **Veri Modeli (Production):**
  - tags tablosu: id, creator_id, pose (jsonb veya PostGIS geography), ref_photo_url, content (jsonb), caption, status, is_sensitive, created_at, unlocks_count, visibility.
  - Use PostGIS geography(Point, 4326) for pose + GiST index.
  - nearby_tags fonksiyonu: ST_DWithin + H3 index for fast radius queries.
  - Partition tags by created_at (monthly) or geo hash.
- **API Katmanı:**
  - Edge functions (Supabase) veya custom: /tags/nearby?lat=..&lng=..&radius=500
  - Rate limit: 100 creates/day per user, 1000 views/hour.
  - Real-time: Subscribe to new tags in geo tile.
- **Maliyet (1M MAU tahmini):**
  - Supabase Pro: ~$25/mo base + compute.
  - Storage: 1M tags * 500KB avg ref photo = 500GB → ~$50-100/mo + CDN.
  - Queries: Heavy geo = need good indexing or move to specialized (CrateDB or custom).
  - Google ARCore/Geospatial at scale: Free tier limited; high volume ~$0.01-0.10 per session.

### 7.2 AR Ölçeklendirme Detayları
- **Geospatial API Entegrasyonu Adımları:**
  1. Android: ARCore Geospatial + Earth API for VPS.
  2. iOS: ARKit + custom VPS or Google VPS via plugin.
  3. Anchor oluştur: Geospatial anchor with lat/lng/heading + altitude.
  4. Render: 3D plane or image at anchor position using Sceneform/Unity.
- **Görsel Eşleştirme (Critical for "exact angle"):**
  - On-device: Use ML Kit or TensorFlow Lite for feature matching (ref photo vs live frame).
  - Cloud fallback for hard cases.
  - Niantic örneği: 1M+ VPS locations from user scans.
- **Pil & UX:**
  - AR session max 5-10 dk.
  - Auto-pause on low battery or high speed.
  - Fallback to 2D map + compass view.

### 7.3 Moderasyon & Güvenlik Detayları
- **AI Stack:** Google Vision / AWS Rekognition for images + OpenAI or local LLM for captions.
- **Workflow:**
  - Create → AI score (0-100 risk) → If high: pending. Low: active (if not sensitive).
  - Sensitive zones: Hard geo-fence + ML classification.
  - Report: Auto-hide + queue. 3 reports = review.
- **Kullanıcı Güvenliği:** Block list, shadow ban, geo privacy (fuzzy location for viewers).

## 8. 2. Backend Kurulumu: Supabase + PostGIS ile Başlangıç

(MVP sonrası gerçek backend için kod iskeleti aşağıda uygulanacak. Detaylı adımlar README'ye eklenecek.)

**Önerilen Stack:**
- Supabase (ücretsiz başla, sonra scale).
- PostGIS enabled.
- RLS (Row Level Security) for user-owned tags.
- Storage bucket for ref_photos.

**Kurulum Adımları (Kullanıcı için):**
1. supabase.com'da proje oluştur.
2. SQL: CREATE EXTENSION postgis; + tags tablosu + index.
3. .env: SUPABASE_URL, SUPABASE_ANON_KEY.
4. Client entegrasyonu.

## 9. 3. Gerçek AR Entegrasyonu: ARCore Geospatial Hazırlığı

Mevcut ARCameraScreen'i Geospatial'e hazırlamak için:
- Daha iyi pose (altitude + quaternion).
- Anchor creation logic.
- Overlay iyileştirmesi (3D hissiyatı).
- Not: Gerçek VPS için cihazda ARCore kurulu olmalı ve Google Play Services.

Bu dosya, orijinal planın "milyon kullanıcı" uzantısıdır. Mevcut prototip ile birleştirerek production-ready yola devam edebiliriz.

Daha fazla detay veya kod implementasyonu için söyle.