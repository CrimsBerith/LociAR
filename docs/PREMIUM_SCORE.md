# Premium Score — LociAR 1.0 Design-System Baseline

## Mandatory gates

| Gate | Durum | Kanıt |
|---|---|---|
| Ana keşif görevi kod düzeyinde tamamlanıyor | Pass | Harita/Keşfet/AR akışı |
| Kamera/konum reddi uygulamayı kilitlemiyor | Pass | StateView recovery akışları |
| Screen reader ile ana görev | Unverified | Fiziksel cihaz testi gerekli |
| Büyük fontta kritik eylem | Unverified | Screenshot/device matrisi gerekli |
| Kritik crash/AR cihaz kalitesi | Unverified | iPhone/ARCore saha testi gerekli |
| Privacy ve içerik güvenliği | Pass with external blockers | Decision log, moderation ve protected zones |

## Score

| Alan | Puan | Maksimum |
|---|---:|---:|
| Ürün değeri ve ilk değer | 16 | 20 |
| Bilgi mimarisi ve navigasyon | 12 | 15 |
| Görsel hiyerarşi ve marka | 12 | 15 |
| Design system / token | 11 | 15 |
| Platform doğallığı | 9 | 15 |
| State completeness | 10 | 15 |
| Erişilebilirlik | 11 | 20 |
| Performans ve stabilite | 11 | 20 |
| Trust, privacy ve security | 12 | 15 |
| Monetizasyon | 0 | 15 |
| Adaptive / büyük ekran | 4 | 10 |
| Content/localization | 7 | 10 |
| Analytics | 4 | 5 |
| Test/release engineering | 6 | 10 |
| Store presentation | 2 | 5 |
| **Toplam** | **127** | **200** |

Mandatory cihaz/a11y kapıları doğrulanmadığı için renk seviyesi `RED / internal only`; sayısal seviye `YELLOW` bandındadır.

## İlk beş risk

1. Native AR kamera yönü, drift ve tracking fiziksel cihazda doğrulanmadı.
2. Legacy Oluştur/Admin/renderer alanlarında token dışı teknik ve UI değerleri hâlâ bulunuyor.
3. iPad/tablet/foldable düzenleri için kanıt ekran görüntüsü yok.
4. VoiceOver/TalkBack ve en büyük font seviyeleri manuel test edilmedi.
5. Store ekran görüntüsü ve gerçek uygulama parity'si hazırlanmadı.

## Önerilen yayın durumu

Internal/beta. Fiziksel iOS saha testi, accessibility matrisi ve adaptive screenshot kanıtı tamamlanmadan production/premium-ready değildir.
