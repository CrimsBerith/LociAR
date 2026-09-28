# LociAR Design System

## Token mimarisi

`src/constants/theme.ts` tek gerçek kaynaktır:

```text
Primitive renkler
→ Semantic roller
→ Component rolleri
```

Ekranlar primitive hex değerlerini doğrudan kullanmaz. Kamera scrim'i, medya renderer'ı ve AR texture gibi teknik istisnalar kod içinde açıklanmalıdır.

## Semantic renkler

`background`, `surface`, `surfaceElevated`, `surfaceMuted`, `textPrimary`, `textSecondary`, `textTertiary`, `actionPrimary`, `onActionPrimary`, `social`, `onSocial`, `success`, `warning`, `error`, `border`, `divider`, `focus`, `scrim`, `glass` ve `glassBorder`.

- Nocturnal kimlik iki temada da korunur.
- Açık/koyu tema sistem ayarını izler; Profil'den `system`, `light`, `dark` seçilebilir.
- Renk tek başına selected, success, warning veya error anlatmaz.

## Spacing ve shape

- Spacing: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
- Radius: 4, 8, 12, 16, 24, full
- İç içe yüzeylerde radius ve padding ilişkisi korunur.
- Pill yalnız kısa filtre/etiket ve geçici kamera durumu için kullanılır.

## Tipografi

- Display, titleLarge, title, headline, body, bodyEmphasis, callout, label, caption ve numeric rolleri kullanılır.
- Marka/özel başlıklarda sınırlı Georgia; uzun içerikte sistem fontu kullanılır.
- Sayaçlar tabular numerals kullanır.
- Kritik metin sabit yükseklik içinde kırpılmaz.

## Motion

- micro 120 ms: press ve küçük feedback
- short 180 ms: selection/toggle
- medium 280 ms: sayfa içi durum değişimi
- long 420 ms: harita kamera hareketi ve büyük dönüşüm
- Reduce Motion açıkken onboarding sayfalaması ve dekoratif büyük transformlar azaltılır.

## Materyal

- Solid surface: içerik ve ayarlar
- Elevated surface: bağımsız seçili nesne
- Glass: yalnız harita/kamera chrome'u ve geçici yüzey
- Legacy shadow/elevation yerine `boxShadow` depth tokenı

## Platform adaptasyonu

- iOS minimum dokunma alanı 44 pt, Android 48 dp.
- iOS önce gerçek cihazda doğrulanır; Android aynı semantic sistemle Material davranışlarına uyarlanır.
- Mevcut React Navigation korunur; görünür ana hedef sayısı beştir.
