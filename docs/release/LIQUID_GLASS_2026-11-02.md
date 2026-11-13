# LociDrop — Liquid Glass uygulaması

2 Kasım 2026. Hedef, kullanıcının netleştirdiği üzere mevcut native iPhone uygulamasıdır. macOS hedefi eklenmedi.

## Değişiklik

- `LociTheme.swift`: içerik yüzeyi ile yüzen kontrol yüzeyi ayrıldı. `LociCard(appearance: .floating)` ve `lociGlassSurface` iOS 26+ üzerinde SwiftUI `glassEffect(.regular, in:)` kullanır. İçerik kartları okunaklı, opak lacivert kalır.
- Ortak birincil/ikincil düğmeler, cam panelin dışında etkileşimli native glass kullanır. Panel içindeki düğmeler düz dolgu ile aynı tek cam tabakasında kalır; iç içe cam üretilmez. Disabled düğmeler pasif görünümünü korur.
- iOS 17–25 üzerinde floating panel için native material, düğmeler için normal dolgu yolu korunur. Reduce Transparency açıkken panel opaklaşır; düğmeler cam kullanmaz. Eski sürümler/erişilebilirlik dalları derlemeye dahildir, bu turda gerçek cihazda ayrıca çalıştırılmadı.
- `MainTabView.swift`: sekme çubuğuna zorlanan eski `.ultraThinMaterial` arka planı kaldırıldı; yeni sistemin native görünümü kullanılır.
- `MapFeatureView.swift`: harita alt kontrol paneli yeni floating yüzeyi kullanır. Dosyadaki önceden mevcut filtre ve diğer değişiklikler korundu.
- `ARExperienceView.swift`, `CreatePostView.swift`: AR durum ve yerleştirme kontrol panelleri aynı cam yüzey diline geçti.
- `SocialComponents.swift`, `LociStatusPill`: açık title+icon label stili ve içerik yüksekliği ile liste bağlamında uzayan rozet için düzeltme uygulandı. Yeni Keşfet PNG’sinde rozet yatay ve metinli görünüyor.
- Lacivert arka plan/yüzeyler ve ikincil metin renkleri karar planındaki yönle hizalandı; mint vurgu ve harita yoğunluk politikası korundu.

Apple’ın [Liquid Glass benimseme rehberi](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) ve [özel SwiftUI görünümlerine uygulama belgesi](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views) esas alındı. Standart navigasyon sistemde bırakıldı; özel cam işlevsel yüzen kontrollere uygulandı.

## Doğrulama

- Xcode 27.1, iOS Simulator SDK 27.1 ile Debug simulator build **başarılı**; minimum hedef iOS 17 olarak kaldı.
- iPhone 14 Pro Max / iOS 27.0 simülatöründe **4 UI testi, 0 hata**:
  - `testProfileSupportsAccessibilityXXXL`
  - `testScreenTour03PrimaryTabs`
  - `testScreenTour07EditorAndGIF`
  - `testScreenTour08LocationNoteAndSurface`
- XCTest sonucu: `build/liquid-glass-20261102/ui.xcresult`; tam komut/log `ui-tests.log`. Xcode testler bittikten sonra sonuç paketini yaklaşık 10 dakika geç kapattı; nihai sonuç `TEST SUCCEEDED` oldu.
- 11 ekran görüntüsü dışarı çıkarıldı. Kaynak test eki manifesti ve okunabilir isimlere eşleme `build/liquid-glass-20261102/screenshots/` içinde. [Yeni görünüm galerisi](../../build/liquid-glass-20261102/index.html).
- PNG üzerinden harita, Keşfet, AR yerleştirme ve editör görünümleri bağımsız görsel kontrol edildi. Keşfet kartı kompakt rozetli. Harita fixture yolu, mevcut kodun 220 pt maksimum yüksekliğindeki liste panelini gösterir; gerçek backend map-group özetiyle birebir aynı ekran olduğu iddia edilmez.
- `git diff --check` başarılı.

## Açık kontrol

`node scripts/check-localization.mjs --release` **başarısız**: çalışma ağacında bu görevden önce mevcut harita/ayar değişikliklerinin 9 anahtarı eksik. Bu uygulama yeni kullanıcı metni eklemedi. Eksikler:

- MapFeatureView: `Tümü`, `AR Notları`, `Konum Notları`, `Konum Notu`, `3D AR Notu`.
- NoteDensity: `Konum`.
- AppSettingsView: `Gelişmiş AR Servisleri`, `Google AR ve Sensör Verisi`, ARCore kamera/konum verisinin Google tarafından işlendiğini belirten açıklama.

Log: `build/liquid-glass-20261102/localization.log`. Bunlar çeviri JSON kaynakları ve katalog üretimiyle giderilmeden release yerelleştirme geçidi yeşil sayılamaz. Mevcut kullanıcı değişiklikleri kaldırılmadı; kataloglara elle müdahale edilmedi.

## Kanıt sınırı

Bu turdaki görüntüler **simülatör ve yerel UI-test fixture** görüntüleridir. Önceki [44 fiziksel iPhone PNG’si](../../build/visual-baseline-2026-11-02-iphone/index.html) değiştirilmedi. Kurulu fiziksel iPhone sürümü bu turda güncellenmedi; yeni görünümün gerçek cihazdaki materyal/kontrast, kamera ve performans kabulü açık.

Bu çalışma kullanıcı dili/hata mesajları, sayfalama, composer düzeni ve AR runtime sorunlarının tamamını uygulamaz. Ayrıntılı [polish karar planı](../UX_UI_POLISH_DECISIONS_2026-11-02.md) bu alanlar için geçerlidir. Üyelik, anonimlik, konum okuma, engeller, yayınlama, gizli ödeme girişleri ve backend sözleşmeleri değiştirilmedi. Commit, push veya deploy yapılmadı.
