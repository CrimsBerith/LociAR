# Önceki bulguların doğrulanması — 18 Ekim 2026

**Önceki dört bulgu güncel kod ve testlerde kapanmış.** Kontrol edilen commit `20e488edc0cd28e020c96e32b88bc17e89d49b16`; Mac ve PR #58 aynı commit'te. Ürün kaynak kodu değiştirilmedi; dağıtım yapılmadı.

| Önceki bulgu | Güncel doğrulama |
|---|---|
| P1 anonim yazarın engelleme sonrası profilden çıkarılması | Geçti: `blocks never reveal who wrote an anonymous note` gerçek callable/emülatör testi. Not gizleme sonrasında profil, uygunluk ve arama yanıtları aynı kalıyor; normal profil engeli anonim notları etkilemiyor. |
| P2 sahte anahtarın secret taramasını durdurması | Geçti: test fixture'ı tarayıcının mevcut izinli placeholder değerini kullanıyor; repository secret taraması başarılı. |
| P2 push günlüklerinin 66 çeviri hatası üretmesi | Geçti: `NSLog` ve `debugTrace` dar biçimde dışlanmış. `build_catalog.py --check`: 661 anahtar × 12 dil, katalog güncel. Release kontrolü: 667 katalog anahtarı, 0 inceleme bekleyen çeviri. |
| P2 eski admin giriş ekranı beklentisi | Geçti: production derlemesine karşı masaüstü/mobil Chromium, İngilizce ve Türkçe giriş beklentileri dahil 26/26 başarılı. |

Düzeltmeler `5191857` ve `6c2652a` commit'lerinde; anonim not uyarıları için takip testi `e8cd91e` içinde. Anonimlik davranışını `functions/src/visibility.ts`, `anonymousAccess.ts`, `publicContent.ts`, `placeNoteAccess.ts` ve `firestore.rules` üzerinde de inceledim. Profil, arama, uygunluk listesi, etkileşim kuralları ve not uyarıları aynı ayrımı kullanıyor. Misafirlerin post/konum notu yayınlayamaması da entegrasyonda doğrulandı.

## Yeniden çalıştırılan testler

`node scripts/release-preflight.mjs` tüm adımlarıyla **başarılı** tamamlandı: **643 başarılı, 0 başarısız, 0 atlanan test**. Functions/admin tip kontrolleri, production admin derlemesi ve her iki paketin production/tam bağımlılık denetimleri de geçti. Katalog üretim kontrolü ayrıca çalıştırıldı.

| Paket | Geçti |
|---|---:|
| Repository script regressions | 52 |
| Functions unit tests and build | 134 |
| Admin unit tests | 38 |
| Firestore and Storage rules | 87 |
| Functions emulator acceptance | 165 |
| Location notes isolated emulator acceptance | 22 |
| Admin HTTP and authenticated browser acceptance | 119 |
| Public desktop and mobile browser acceptance | 26 |

Kanıtlar:

- [Makine okunur sonuç](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/fix-verification-20261018/verification.json>)
- [Tam preflight günlüğü](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/fix-verification-20261018/preflight.log>)
- [Katalog kontrolü](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/fix-verification-20261018/catalog-check.log>)

## GitHub'da kalan kapı

[PR #58](https://github.com/CrimsBerith/LociAR/pull/58) için kontrol edilen commit'in altı CI işi başarılı; iOS simulator işi de bunlara dahil. iOS testleri bu çalışmada Mac'te yeniden çalıştırılmadı; burada kullanılan kanıt aynı commit'in GitHub CI sonucudur.

**SonarCloud Code Analysis: CANCELLED; PR merge durumu: BLOCKED.** Ana dal korumasında SonarCloud zorunlu. Bu kontrol başarılı tamamlanana kadar PR birleşmeye hazır değil. Eski dört bulgunun kapanması tüm yayın kapılarının geçtiği anlamına gelmez.

- [PR kontrolleri](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/fix-verification-20261018/github-pr.json>)
- [Zorunlu kontroller](</Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/build/fix-verification-20261018/required-checks.json>)
- [Başarılı CI çalışması](https://github.com/CrimsBerith/LociAR/actions/runs/39065266641)

## Ortam ve sınırlar

Mac'in varsayılan Homebrew Node kurulumu eksik `libsimdjson.33.dylib` nedeniyle açılmıyor. Testler mevcut çalışan Node 22 ve Java 21 açıkça seçilerek yürütüldü; varsayılan Node kurulumu değiştirilmedi. Emülatör ve test sunucuları koşu sonunda kapandı.

Canlı Firebase/App Hosting kaynak sürümünün bu commit ile eşleşmesi, fiziksel cihaz, gerçek APNs/FCM ve App Store/TestFlight bu çalışmada doğrulanmadı. Bu sonuç yerel aday ve aynı commit'in PR kontrolüdür; canlıya dağıtım kanıtı değildir. 17 Ekim raporu tarihsel bulguları saklar; güncel kapanış sonucu bu dosyadır.
