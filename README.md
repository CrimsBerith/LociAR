# LociAR Native iOS

SwiftUI + ARKit/RealityKit + MapKit + SwiftData consumer uygulaması; backend Firebase (Auth, Firestore, Storage, Cloud Functions). Expo, React Native ve JavaScript runtime içermez. Minimum sürüm iOS 17, bundle kimliği `com.khankartal.lociar`.

## Kurulum

1. `Config/Local.xcconfig.example` dosyasını `Config/Local.xcconfig` olarak kopyalayın.
2. Firebase iOS uygulamasının değerlerini (API key, app ID, sender ID, project ID, storage bucket) girin. Bu değerler yoksa uygulama auth kapısında fail-closed kalır. Ayrıntılı kurulum: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
3. `xcodegen generate` çalıştırın ve `LociAR.xcodeproj` dosyasını açın.
4. Fiziksel cihaz build'i için kullanıcıya ait signing team seçin. Beta bundle ID verilene kadar public bundle ile yan yana beta target oluşturulmaz.

## Pin Surface garantileri

- Reticle yalnız ekran merkezinde raycast yapar; alternatif ekran noktaları denenmez.
- Algılanmış plane geometry doğrudan kullanılabilir; estimated yüzey son beş örnekte en az 200 ms boyunca 3,5 cm / 7 derece kararlılıkla doğrulanır.
- Pin anında `existingPlaneGeometry`, ardından kararlı `estimatedPlane`/mesh kullanılır.
- Raycast yoksa başarı dönmez. `Yaklaşık yerleştir` ayrı onayla 0,8 m free-space anchor üretir.
- World map yalnız anchor + normal tracking + extending/mapped durumunda kaydedilir.
- Restore edilen içerik tracking normal olana kadar gizlidir; 20 saniyede timeout verir.
- Tanılama uygulama içinde kullanıcıya gösterilmez; surface ve approximate sonuçlar OSLog içinde ayrı tutulur.

Mimari katmanlar, publish/restore akışları ve değişmez kurallar [ARCHITECTURE.md](ARCHITECTURE.md) içinde belgelenmiştir.

## Doğrulama

```sh
xcodebuild -project LociAR.xcodeproj -scheme LociAR -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project LociAR.xcodeproj -scheme LociAR -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO test
```

İmzalı/Release build sonrasında yasal ve destek URL'lerinin yalnız biçimini değil canlı HTTP sonucunu da doğrulayın:

```sh
bash scripts/qa-live-urls.sh /path/to/LociAR.app
```

22 Ağustos 2026 doğrulaması: Debug ve Release build ile Analyze geçti; 34 unit ve 6 UI testi olmak üzere 40/40 test geçti. İmzalı fiziksel cihaz ve canlı backend migration kapıları ayrıca doğrulanmalıdır.

Simulator build/test, fiziksel AR kilidi kanıtı değildir. LiDAR ve LiDAR olmayan iPhone kabul matrisi [FIELD_TEST_CHECKLIST.md](FIELD_TEST_CHECKLIST.md) ile kapatılmalıdır. Backend testleri: `cd functions && npm test` (birim) ve `npm run test:rules` (Security Rules, Firebase Emulator + Java 21).
