# LociAR Premium QA Matrix

## Otomatik kapılar

| Kapı | Komut | Kabul |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | Hata yok |
| Unit/component | `npm test -- --ci` | Tüm testler geçer |
| Expo uyumu | `npx expo install --check` | Uyum hatası yok |
| iOS bundle | `npx expo export --platform ios --clear` | Export başarılı |
| Native iOS build | `xcodebuild -workspace ios/LociAR.xcworkspace ... build` | Swift/Pods build başarılı |
| Admin type/build | `cd admin && npm run typecheck && npm run build` | Hata yok |

## Golden flows

| ID | Akış | Kritik durumlar |
|---|---|---|
| GF-01 | Onboarding → Keşfet | Atla, Reduce Motion, kamera/konum izni istemeden keşif |
| GF-02 | Harita → yüzey seç → AR | selected state, izin, hizalama, etkinleştirme |
| GF-03 | Keşfet → filtre → sonuç | üç filtre, sonuç yok, filtre state'i |
| GF-04 | Kamera reddi → recovery | yeniden iste, Ayarlar, Harita alternatifi |
| GF-05 | Oluştur → düzenle → yayınla → Profil | pose yok, gesture alternatifi, pending review |
| GF-06 | Soğuk açılış → Keşfet → Kamera | Açılışta kamera mount/izin yok; yalnız Camera tabı, AR CTA veya kamera deep link'i ile başlar |

## Screenshot matrisi

- iPhone SE sınıfı küçük ekran
- iPhone Pro Max sınıfı büyük ekran
- iPhone portrait (small ve Pro Max)
- Light, dark, büyük font, uzun İngilizce metin
- Loading, empty, error, offline, permission-denied

## Manuel erişilebilirlik

- VoiceOver focus/okuma sırası
- Dynamic Type
- Reduce Motion/Transparency
- Differentiate Without Color / yüksek kontrast
- Kamera üzerinde güneş ışığı okunabilirliği

## Yayın kararı

Fiziksel cihaz AR, screen-reader ve büyük font kanıtları kaydedilmeden sürüm `premium-ready` sayılmaz.
