# LociAR Component Contracts

## Button

Amaç: Kullanıcıya sonucu belli tek bir eylem sunmak.

- Variants: `primary`, `secondary`, `quiet`, `destructive`
- States: default, pressed, loading, disabled, focused
- Loading state etiketi kaybetmez; `loadingLabel` işlem durumunu açıklar.
- Destructive işlem, geri döndürülemez sonucu CTA içinde söyler.
- Her buton erişilebilir role, label ve disabled/busy state taşır.

## Card / Surface

- `solid`: içerik ve gruplu ayarlar
- `elevated`: bağımsız seçili nesne
- `glass`: harita/kamera üzerinde geçici chrome
- Kart yalnız bağımsız nesne için kullanılır; her bölüm kart içine alınmaz.

## Chip

- Filtre veya kısa seçim içindir.
- Selected durumu renk yanında check ve daha güçlü border ile görünür.
- `accessibilityState.selected` zorunludur.

## StateView

- Kinds: `loading`, `empty`, `error`, `offline`, `permission`
- Başlık “ne oldu”, gövde “neden/etki”, CTA “ne yapabilirim” sorularını cevaplar.
- Error canlı bölge olarak duyurulur; aksiyon varsa somut recovery sunar.

## ARStatus

- Tones: `tracking`, `ready`, `warning`, `safety`
- Aynı anda tek en yüksek öncelikli durum görünür:
  1. Yürüme/çevre güvenliği
  2. Kritik pil uyarısı
  3. Tracking kalitesi
  4. Hazır/hizalama
- Renk, ikon ve metin birlikte kullanılır.
- Kamera görüntüsünü gereksiz kapatmaz.

## Domain bileşenleri

- Harita pini: engagement badge + selected stroke/scale
- Seçili yüzey özeti: görsel, başlık, üretici, mesafe ve AR CTA
- Proximity HUD: mesafe ve yönü sayısal/semantik biçimde verir
- AR playback/social bar: yüzey etkinleştikten sonra görünür
