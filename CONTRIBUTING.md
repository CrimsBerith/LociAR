# Katkıda bulunma

## Gereksinimler

- Node.js **22** ve npm.
- Firebase Emulator testleri için Java **21**.
- iOS derleme ve testleri için macOS, Xcode ve XcodeGen. Güncel Xcode sürümü ve
  native doğrulama adımları için [QA matrisi](docs/QA_MATRIX.md).
- Admin tarayıcı testleri için Playwright Chromium:
  `cd admin && npm ci && npx playwright install chromium`.

Projeye başlamadan önce [AGENTS.md](AGENTS.md) içindeki güvenlik sözleşmesini ve
değiştireceğiniz klasörün talimatlarını okuyun. Yerel Firebase kurulumu için
[Firebase rehberini](docs/FIREBASE_SETUP.md) izleyin. Gizli bilgileri veya yerel
kimlik bilgilerini commit etmeyin.

## Geliştirme ve doğrulama

Aşağıdaki blokları depo kökünden çalıştırın. Emulator testlerini sırayla çalıştırın;
aynı portları kullanan testleri eş zamanlı başlatmayın.

Cloud Functions ve güvenlik kuralları:

```sh
cd functions && npm ci && npm test && npm run test:rules && npm run test:emulator
```

Admin paneli:

```sh
cd admin && npm ci && npm run typecheck && npm test && npm run test:e2e
```

Admin E2E testleri için Playwright tarayıcısını kurun ve derleme/ortam gereksinimleri
için [admin/PLAYWRIGHT.md](admin/PLAYWRIGHT.md) belgesini izleyin. Emulator integration
testleri ayrıca `cd admin && npm run test:emulator` ile çalıştırılır; önce
`functions/` bağımlılıkları kurulmuş olmalıdır. Bu testler canlı Firebase'e deploy
gerektirmez.

Yerelleştirme ve mağaza metinleri (depo kökünden):

```sh
python3 scripts/l10n/build_catalog.py --check
node scripts/check-localization.mjs --release
python3 scripts/store-metadata/build.py --check
```

Repo betikleri ve gizli bilgi taraması (depo kökünden):

```sh
node --test scripts/test/*.test.mjs
bash scripts/qa-secret-scan.sh
```

iOS testleri macOS/Xcode gerektirir: `bash scripts/ci-ios.sh`. Simulator testleri
fiziksel cihazdaki AR doğrulamasının yerine geçmez; ilgili kontroller
[FIELD_TEST_CHECKLIST.md](FIELD_TEST_CHECKLIST.md) içindedir.

## Çeviri kuralları

`*.xcstrings` dosyalarını elle düzenlemeyin. Çevirileri
`scripts/l10n/translations/*.json` dosyalarına ekleyin ve depo kökünden
`python3 scripts/l10n/build_catalog.py` çalıştırın. Üretilen katalogları çeviri
kaynaklarıyla birlikte PR'a ekleyin ve yukarıdaki yerelleştirme kontrollerini
çalıştırın. Yerelleştirme sözleşmesi [AGENTS.md](AGENTS.md) içinde belgelenmiştir.

## Branch ve pull request

Her değişiklik için güncel `main` üzerinden ayrı bir branch açın ve `main`'e PR
gönderin. PR açıklamasında sorunu, değişikliği, test sonuçlarını ve güvenlik/veri
etkisini belirtin; UI değiştiyse ekran görüntüsü ekleyin. Başka geliştiricilerin
değişikliklerini koruyun.

**CI ve SonarCloud kontrolleri yeşil olmadan birleştirmeyin.** Çalıştırılamayan
kontrolleri ve nedenlerini açıkça yazın; yerel test sonucu CI onayının yerine geçmez.
Güvenlik açıklarını public issue yerine [SECURITY.md](SECURITY.md) uyarınca özel
olarak bildirin.

## English summary

Use Node.js 22, Java 21 for Firebase Emulator tests, and macOS/Xcode for native
iOS builds. Read [AGENTS.md](AGENTS.md) before changing code. Run the relevant
Functions, admin, localization, and repository checks listed above. Never edit
`*.xcstrings` manually: update the translation JSON sources and regenerate the
catalogs. Work on a separate branch, open a PR to `main`, and merge only after CI
and SonarCloud are green. Report vulnerabilities privately according to
[SECURITY.md](SECURITY.md).
