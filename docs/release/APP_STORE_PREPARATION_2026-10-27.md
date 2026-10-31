# App Store adayı — 27 Ekim 2026

**Karar: gönderim kapalı.** Yerel hazırlık, canlı dağıtım ve mağaza kabulü ayrı değerlendirilir.
Başlangıç HEAD: `efbab76604578a53cf2381c69c0c271dd16f4a1e`, dal:
`codex/fix-anonymous-location-audit`. Aday, commit edilmemiş değişiklikler de içerir.
Başlangıçtaki 22 değiştirilmiş/yeni dosya `build/app-store-prep-20261027/worktree-before.tar.gz`
ve ikili diff ile korundu. Dosyalar geri alınmadı.

## Adaydaki hazırlık

- Önceki ödeme kapısı korundu: `PostSupportAvailability.releaseBuilds = false`;
  Release'de destek düğmesi ve Kazançlar ekranı yok. Ödeme sağlayıcısı açılmadı.
- B01 erişim sınırı: kalıcı `spot:` üyeliği olmayan harita grupları ortak okuma çemberi vermiyor.
  Her not kendi noktasından mesafe denetimine giriyor; başka anchor istemek komşu notun metnini açmıyor.
  0/20/40 m zinciri, metin redaksiyonu ve yorum okuma makbuzunun oluşmaması için regresyon eklendi.
  Geçici grupların özet ve detay üyeliğinin farklılaşması **ayrı bir tutarlılık sınırı olarak sürüyor**.
- Önceki B02 sayaç düzeltmesine emülatör kabul testi eklendi: askıya alınmış/silinmiş izleyici veya
  yazar sayaç, engagement veya makbuz oluşturamaz; aktif izleyicinin günlük tekrar sayımı korunur.
- iOS CI, adı değiştirilmiş iPhone simülatörlerini cihaz türünden tanıyor; hata kodu fixture'ı bunu kapsıyor.
- İlk tam UI koşusunda not düzenleyicisinin klavye kapatma düğmesi erişilemez kaldı. Odak varken
  görünen `Bitti` eylemi üst gezinme çubuğuna taşındı; aynı Unicode akışı ve yakın ekranlar yeniden sınanır.
- Hazırlık betiğinden mevcut `WorldMapCodec.swift` değişikliğini geri alan yol kaldırıldı.
- Rehberde Apple tarafından doğrulanmış URL iddiası ve ücretsiz uygulama için otomatik DSA
  "tüccar değil" önerisi düzeltildi. App Review gizlilik tablosuna ARCore görsel özellikleri eklendi.
- 12 dilin mağaza metinleri, App Review metni ve manifest kaynaklı App Privacy JSON'u
  `build/app-store-prep-20261027/submission/` altında hazırlandı.

## Yerel doğrulama

Sonuçların asıl kaynağı `build/app-store-prep-20261027/` içindeki loglar ve xcresult paketleridir.
Test/arşiv koşuları tamamlandığında bu tablo kesin sonuçlarla güncellenir.

| Kontrol | Sonuç |
|---|---|
| Native testler, Xcode 26.6 / iOS 26.5 simülatörü | 265 test; 263 geçti, 2 fiziksel cihaz testi atlandı; hata yok |
| Tam simülatör UI paketi | İlk koşu 39 test: 38 geçti, klavye erişiminde 1 hata. Düzeltmeden sonra Unicode sınırı, 12 dil not/ayar akışı ve oluşturucu aç/kapat testi: 3/3 geçti. Tam paket düzeltmeden sonra yeniden koşulmadı |
| Backend/admin yayın preflight | 23 kapı, 745 test; hata/atlama/iptal yok. 57 betik + 188 Functions birim + 43 admin birim + 96 rules + 172 Functions emülatör + 31 konum notu + 132 admin HTTP/tarayıcı + 26 public tarayıcı |
| 12 dil mağaza metni | Karakter sınırları ve üretilen dosyalar geçti |
| App Review metni | 3.550 karakter; `<VIDEO_LINK>` gerçek video ile değiştirilmeli |
| Release StoreReadiness testleri | Simülatörde 11/11 geçti. Release test çalıştırmasına yalnız test için `ENABLE_TESTABILITY=YES` verildi; arşiv bu ayarı kullanmaz |
| Release arşivi ve dağıtım imzası | Son aday `LociAR-Final.xcarchive` ve `export-final/LociAR.ipa` başarılı. IPA `codesign --verify --deep --strict` geçti; APNs/App Attest production, get-task-allow false, manifest mevcut; sürüm 1.0.0 (1) |
| Fiziksel native kontroller | iPhone 14 Pro Max / iOS 27.0.1: 13 test, 11 geçti; yalnız Mac kaynak dosyalarını isteyen 2 denetim atlandı. Gerçek AR kamera üç oturumda yeniden açıldı; GPS durdurulup yeni ölçümle başlatıldı, ±18,05 m, simülasyon değil |
| Fiziksel Release UI | Gerçek mevcut hesapta bildirim ayarlarının okunması ve normal AR/paylaşma kamera akışı: 2/2 geçti. Canlı veri yazan yayın/silme veya APNs gönderimi yapılmadı |

İlk cihaz denemesi kilit yüzünden başlayamadı; kilit açıldıktan sonra DDI uyumlu/kullanılabilir doğrulandı.
İlk Release test derlemesi `@testable import` için `-enable-testing` olmadığı için durdu;
test komutuna `ENABLE_TESTABILITY=YES` eklenerek koşuldu. Bu, dağıtım arşivinin ayarını değiştirmez.
Native tam paket klavye UI düzeltmesinden önce koşuldu; düzeltme sonrası üç UI ve Release/cihaz kontrolleri yukarıda ayrıdır.

## Canlı bulgular — bu oturumda yenilendi

Metadata: `build/firebase-readiness/app-store-prep-20261027.json` → **ready: false**, 25 bulgu.
Bu 25 bulgunun tamamı aynı riskte veya aynı özelliğe ait değildir.

| Öncelik | Bulgu / kanıt | Kapanma koşulu |
|---|---|---|
| P1 | `map_group_sessions.expires_at` TTL yok | ACTIVE TTL ve yeni canlı metadata kabulü |
| P1 | Dört bakım fonksiyonu yok: `everyFiveMinutes`, `everyFifteenMinutes`, `nightlyMaintenance`, `onMaintenanceRequested`; üç yeni Scheduler işi yok, eski yedi iş duruyor | Yeni bakım kodu yayında; eski fonksiyon/işler yalnız yeni işler çalışınca kaldırılmış; toplam üç Scheduler |
| P1 | `likes` ve `posts` için üç beklenen bileşik indeks eksik; canlıdaki 26 indeks READY | `index-parity.json` içindeki üç tanımın READY olması |
| P1 | `createInvites`, `redeemInvite`, `markActivityRead`, `unlockDenseSpot` Cloud Run servislerinde `allUsers` için `roles/run.invoker` yok; kimliksiz callable probu 403, ayrı sonraki kontrol 503 | Firebase Auth/App Check kontrolleri korunarak callable HTTP taşımasına erişim sağlanması; kimliksiz istekte Firebase 401 ve geçerli kullanıcıyla uçtan uca kabul |
| P1 | Dört yasal/destek sayfası HTTP 200; hepsi hâlâ `support@lociar.app` gösteriyor | Aday admin yayını sonrası `support@alfagolab.com`; posta kutusuna teslim ayrıca doğrulanmalı |
| P1 | Eski mağaza görüntüsü görsel olarak kontrol edildi: boş/yüklenen harita; mevcut set gönderime uygun değil | Güncel, içerik dolu gerçek uygulama görüntüleri ve konum/arka plan videosu |
| P1 | Apple Developer Program License Agreement güncellemesi hesapta bekliyor | Hesap sahibi inceleyip kabul etmeli. Sahip bu oturumda sözleşmeyi sonraya bıraktı; kabul edilmedi |
| P2 / ödeme kapalı | On ödeme fonksiyonu yayında yok; iki kripto secret'ı yok | Tam depo deploy'u için secret bağımlılıkları çözülmeli. Release'de ödeme kapalı kalır; bunların varlığı gerçek ödeme kabulü sayılmaz |

Kanıtlar: `public-pages.json`, `live-indexes.json`, `index-parity.json`,
`unauthenticated-callables.json`, `callable-service-status.json`, `secret-names.txt`.
Secret değerleri okunmadı veya rapora konmadı. Dört servisin Ready durumu True;
bu durum uygulamadan çağrılabildiklerini kanıtlamıyor. Tek 503 yanıtının nedeni doğrulanmadı.

## App Store Connect taslağı

- [LociAR kaydı](https://appstoreconnect.apple.com/apps/6827311848/distribution/ios/version/inflight)
  bu oturumda oluşturuldu; Apple ID `6827311848`, SKU `lociar-ios-v1`, iOS, Türkçe ana dil,
  sürüm `1.0.0`, **Prepare for Submission**.
- 12 dil için ad, alt başlık, tanıtım metni, açıklama, anahtar kelimeler ve destek URL'si kaydedildi.
  Kalıcılık kontrolleri `app-store-info-persistence.json` ve `app-store-version-persistence.json` altında.
- Kategoriler Social Networking / Navigation; telif `2026 Kağan Kartal Babahan`;
  sürüm yayın tercihi **Manually release this version**.
- Fiyat $0,00; 175 ülke/bölge ve gelecekte eklenecek bölgeler seçildi. Mac ve Apple Vision Pro
  kullanılabilirliği kapatılıp Saved durumu doğrulandı. Taslak henüz yayınlanmadığı için 175 bölge
  **Not Available** görünür; bu, yayınlandığı iddiası değildir.
- Mevcut hesap bu uygulama için trader olarak görünüyor; bu beyan değiştirilmedi.
- Ekran görüntüsü, video, review hesabı/parola/iletişim, App Privacy cevapları, yaş anketi
  ve Content Rights kabulü açık. Hazır yanıtlar/metinler gönderim rehberinde;
  eksik alanları atlatmak için gerçek olmayan değer girilmedi.
- Yeni Apple sözleşmesi kabul edilmedi, Add for Review/Submit for Review kullanılmadı;
  IPA TestFlight'a veya App Store'a yüklenmedi.

## Dağıtım ve gönderim sırası

1. Adayın yerel kontrollerini kapat; değişiklik kapsamını gözden geçirip commit/CI kanıtını o commit'e bağla.
   PR #58 açık ve birleştirilebilir; başlangıç `efbab76` commit'inin GitHub CI koşusu başarılı.
   Bu başarı yerel yeni değişiklikleri kapsamaz.
2. Mevcut spend cap ve canlı secret bağımlılıklarını kontrol et; faturalama limiti değişikliği ayrı sahip kararıdır.
3. Aday Functions/rules/index/TTL/bakım ve admin yasal sayfalarını koordineli yayınla.
   Eski istemcide yorum okuma geçişi dikkate alınır; Auth/App Check/rules gevşetilmez.
4. Dört callable'ın IAM/HTTP yolunu ve yetkili kullanıcı çağrısını doğrula; canlı metadata, indeks ve
   yasal sayfaları yeniden kontrol et; harita dizini bakımını tamamla.
5. Review hesabının çalıştığını ve örnek içeriği doğrula; parolayı yalnız özel dosyada/parola yöneticisinde
   ve App Store Connect Sign-In Information alanında tut. Kaynaklar kontrollü olmadan seed yükleme.
6. Gerçek iPhone'da GPS, AR/yeniden bulma, Apple giriş/hesap silme, bildirim alma/dokunma ve Release
   ödeme düğmelerinin kapalı olduğunu doğrula. Fiziksel kabul simülatör testlerinden türetilmez.
7. Ekran görüntülerini ve inceleme videosunu tamamla; App Store Connect'te gizlilik, yaş,
   Content Rights ve mevcut DSA beyanının kabulünü kapat. 12 dilin metinleri kaydedildi;
   ücretsiz fiyat/global bölge formu ve iOS platform tercihleri kaydedildi.
8. Dağıtım imzalı IPA'yı TestFlight'a yükle; işlenen build'i test et; App Review'a gönderim ayrı adımdır.
   İlk yerel aday `1.0.0 (1)`; yüklemeden önce Connect'te aynı build'in kullanılıp kullanılmadığı okunmalıdır.

Bu hazırlık canlı deploy, ücret/limit değişikliği, hesap/parola yenileme, seed yükleme, push gönderme,
main merge veya App Store/TestFlight yüklemesi yapmaz.

Apple kaynakları: [inceleme gerekleri](https://developer.apple.com/app-store/review/guidelines/),
[review hesabı ve inceleme bilgisi](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/),
[ekran görüntüsü ölçüleri](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/),
[DSA öz değerlendirmesi](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/).
