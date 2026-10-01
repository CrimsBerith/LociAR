# Fiziksel AR Saha Testi ve Kabul Matrisi (Issue #18)

Yeniden bulma sırası: **Cloud Anchor → Geospatial (VPS) → World Map → Yönlendirmeli Gösterim (Aim-Guided Reveal)**

## Test Edilen Cihazlar
- [x] **LiDAR Cihaz:** iPhone 14 Pro Max (`iPhone15,3` - iOS 26.x - UDID: `B2E7EFB8-A5CD-5671-BBE9-2A86FE9D7EB8`)
- [ ] **LiDAR Olmayan Cihaz:** İkinci fiziksel iPhone (iPhone 11/12/13 standart)

---

## 1. Yeniden Konumlandırma ve Çözücü Senaryoları

| # | Senaryo | Beklenen Çözücü | Ortam / Notlar | Başarı |
|---|---|---|---|---|
| **S1** | İç mekân, dokulu duvar; A cihazında pinle, B cihazında aç | Cloud Anchor | Maslak / Ofis iç mekan dokulu yüzey | [x] Geçti |
| **S2** | S1 + 24 saat sonra, farklı ışıkta açılış | Cloud Anchor | Farklı aydınlatma koşulları | [ ] Beklemede |
| **S3** | Dış mekân, VPS olan cadde (Geospatial) | Cloud Anchor → Geospatial | İstanbul açık cadde VPS | [ ] Saha |
| **S4** | Dış mekân, VPS olmayan alan | Cloud Anchor → World Map | Park / ara sokak | [x] Fallback OK |
| **S5** | Çevrimdışı / Uçak modu / Token yok | World Map → Yönlendirmeli | Yerel ARKit world map | [x] Geçti |
| **S6** | Boş beyaz duvar, düşük doku | Hosting kalitesi yetersiz uyarısı → World Map fallback | Kullanıcıya net rehberlik mesajı | [x] Geçti |
| **S7** | Düşük ışık / Gece modu | Rehberlik uyarısı + timeout davranışı | Düşük ışık uyarısı ekranda | [x] Geçti |
| **S8** | LiDAR'sız cihaz ile test (S1 & S3 tekrarı) | Feature point tabanlı Cloud Anchor | LiDAR olmayan model | [ ] İkinci cihaz |
| **S9** | Arka plan / ön plan; öldür + yeniden aç | Oturum sağlıklı, kamera siyah ekran vermez | Home bar swipe / app switcher | [x] Geçti |
| **S10** | AR sekmesine 10 kez hızlı gir/çık | Bellek sabit, Swift Concurrency / ARKit donması yok | 10× sekme geçişi | [x] Geçti |
| **S11** | Post silindiğinde Cloud Anchor silinmesi | Management API silme kuyruğu tetiklenir | `arcoreManagement.ts` | [x] Geçti |
| **S12** | İlk açılış izin akışı | Kamera → Konum → Google ARCore bildirimi sırayla | İlk kurulum akışı | [x] Geçti |

---

## 2. Her Koşu İçin Kayıt Protokolü
- **Cihaz & Model:** iPhone 14 Pro Max (`iPhone15,3`)
- **iOS Sürümü:** 26.x
- **Çözücü (Resolver):** Cloud Anchor / Geospatial / World Map
- **Kilitlenme Süresi (Lock Time):** Hedef < 15 saniye (iç mekanda ortalama 3-8 sn)
- **Gözle Kayma (Drift):** Hedef < 10 cm
- **Kamera Durumu:** `trackingState == .normal`, `arcore_sensor_data` onayı mevcut
